#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = ["httpx>=0.28", "pymupdf>=1.25"]
# ///
"""Build the Félag question bank from SIRI's published Indfødsretsprøven PDFs.

Source: https://danskogproever.dk (Styrelsen for International Rekruttering og
Integration). Only officially published questions and official answer keys are
used; nothing is invented.

    uv run tools/content.py fetch      download source PDFs into data/raw
    uv run tools/content.py extract    parse them into data/questions.jsonl
    uv run tools/content.py all        both

Design notes that are easy to get wrong:

* A question's identity is its stem *and* its options. SIRI reuses a stem with
  a different option set and a different correct answer, so keying on the stem
  alone silently ships a wrong answer on a question flagged as high frequency.
* The answer is stored as text, not an index, because the quiz randomises
  option order so nobody learns "the answer is C" instead of the content.
* Counts (how often a question has been asked) are derived from `seen` at
  runtime, not stored, so adding one exam does not rewrite unrelated lines.
* Records are sorted by id, so rebuilds remain stable and reviewable.
* Explanations are hand-written in data/explanations.jsonl and joined by id.
  This script never writes that file, so re-running it cannot destroy them.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

import httpx
import pymupdf

PAGE = ("https://danskogproever.dk/borger/indfoedsretsproeve-statsborgerskab"
        "/forberedelse-til-indfoedsretsproeven/")
ORIGIN = "https://danskogproever.dk"
RAW = Path("data/raw")
BANK = Path("data/questions.jsonl")
EXPLANATIONS = Path("data/explanations.jsonl")
# Hand-checked currency of time-dependent answers. Never machine-written:
# deciding that a fact has gone stale is a judgement, not a keyword match.
CURRENCY = Path("data/currency.jsonl")

SOURCE_PDF = re.compile(r"(indfoedsretsproeven-\d{4}-\d{2}|laeremateriale)")
HREF = re.compile(r'href="(/media/[^"]+\.pdf)"')
# Public URLs of the papers, so every citation can be opened and checked against
# SIRI rather than trusted. Written next to the bank by `fetch`, because the
# media hash in each link changes whenever SIRI re-uploads a file.
SOURCES = Path("data/sources.json")

QUESTION = re.compile(r"^\s*(\d{1,2})\.\s+(.*)")
# Recent PDFs print a checkbox glyph; pre-2025 exams draw it as a form field,
# leaving the option as a bare "  A: text". One regex covers both shapes.
OPTION = re.compile(r"^\s*[\u2610\u2612]?\s*([ABC]):\s+(.*)")
ANSWER = re.compile(r"^\s*(\d{1,2})\s+([ABC])\s*$")


class Section(StrEnum):
    """Where a question sits in the 45-question paper.

    Positions are fixed by SIRI and stated in the papers themselves. Exams up to
    and including summer 2021 had 40 questions and simply stop before VAERDIER.
    """

    LAEREMATERIALE = "laeremateriale"
    AKTUELT = "aktuelt"
    VAERDIER = "vaerdier"

    @classmethod
    def of(cls, number: int) -> Section:
        if number <= 35:
            return cls.LAEREMATERIALE
        if number <= 40:
            return cls.AKTUELT
        return cls.VAERDIER


@dataclass(frozen=True, slots=True)
class Posed:
    """One question exactly as it appeared on one paper."""

    number: int
    stem: str
    options: tuple[str, ...]

    @property
    def valid(self) -> bool:
        return 2 <= len(self.options) <= 3 and len(set(self.options)) == len(self.options)


@dataclass(slots=True)
class Entry:
    """One unique question, with every paper it has appeared on."""

    id: str
    section: Section
    q: str
    options: list[str]
    answer: str
    stem: str
    seen: list[str] = field(default_factory=list)
    # Filled in by locate(): which of the six chapters, and the page to cite.
    chapter: int | None = None
    page: int | None = None
    # True when the quoted passage demonstrably contains the answer. This is
    # the honest quality signal: a passage that does not state the answer is
    # not evidence, so the app shows nothing rather than something misleading.
    supports: bool = False
    # A short quotation from the læremateriale that supports the answer, with
    # the page recorded beside it. Enough to learn from and to check.
    passage: str | None = None

    def as_json(self) -> str:
        record = {
            "id": self.id,
            "section": str(self.section),
            "chapter": self.chapter,
            "page": self.page,
            "supports": self.supports,
            "passage": self.passage,
            "q": self.q,
            "options": self.options,
            "answer": self.answer,
            "stem": self.stem,
            "seen": self.seen,
        }
        return json.dumps(record, ensure_ascii=False, sort_keys=True)


def normalise(text: str) -> str:
    """Loose key for grouping; SIRI rewords stems slightly between sittings."""
    return re.sub(r"[^a-z0-9æøå]+", " ", text.lower().replace("\u2019", "'")).strip()


def read_pdf(path: Path, *, positional: bool = False) -> list[str]:
    """Extract text lines. The two document types need opposite modes.

    Exam papers need content-stream order: positional sorting reverses the spans
    inside an option on the 2025+ papers, giving "1930'erne☐ A:" instead of
    "☐ A: 1930'erne". Answer keys need the opposite, because their number and
    letter sit in widely separated columns that content order splits onto two
    lines, destroying the pairing.
    """
    with pymupdf.open(path) as doc:
        return "\n".join(page.get_text("text", sort=positional) for page in doc).splitlines()


def parse_paper(lines: list[str]) -> list[Posed]:
    """Read questions in order, accepting a number only when it is the next expected.

    That ordering rule is what skips the worked example in the instructions,
    which uses identical option markup but restarts its numbering at 1.
    """
    found: list[Posed] = []
    number, stem, options = 0, "", []

    def flush() -> None:
        if number:
            # Rejoining a wrapped stem leaves the PDF's own line padding behind,
            # so collapse runs of whitespace rather than shipping "givet  samtykke".
            found.append(Posed(number, " ".join(stem.split()), tuple(options)))

    for line in lines:
        if match := OPTION.match(line):
            if number:
                options.append(match.group(2).strip())
        elif (match := QUESTION.match(line)) and int(match.group(1)) == number + 1:
            flush()
            number, stem, options = number + 1, match.group(2), []
        elif number and not options and (rest := line.strip()) and not rest[0].isdigit():
            stem += " " + rest  # wrapped stem, before any option appears
    flush()
    return found


def parse_key(lines: list[str]) -> dict[int, str]:
    return {int(m.group(1)): m.group(2) for line in lines if (m := ANSWER.match(line))}


def papers() -> list[Path]:
    return sorted(p for p in RAW.glob("indfoedsretsproeven-*.pdf")
                  if "retteark" not in p.name)


# ---------------------------------------------------------------------------
# Grounding questions in the læremateriale
#
# The 35 material questions are matched back to the current 246-page material.
# That yields the chapter, a proposed page and a passage for human review.
# Current-affairs and values questions have separate source rules.
# ---------------------------------------------------------------------------

MATERIAL = RAW / "laeremateriale-til-indfoedsretsproeven.pdf"
ERAS = Path("data/eras.jsonl")
SAGAS = Path("data/sagas.jsonl")

# The material lays out its own hierarchy in type, and reading the type is exact
# where a regex over shouted text is a guess:
#
#   38pt Palatino-Bold        section number      "1.2"
#   29pt DINNextLTPro-Bold    section title       "VIKINGETID (ca. 750-1050)"
#   24pt Palatino-Bold        subsection number   "1.2.1"
#   13pt DINNextLTPro-Medium  a heading, or a section's opening paragraph
#   13pt DINNextLTPro-Regular a table caption, which is not a heading at all
#   10.5pt                    body
#
# The font is what separates "NYT POLITISK OPBRUD" from "OVERSIGT OVER PARTIER I
# FOLKETINGET ... (ANGIVET EFTER STEMMEANDEL):", which is set at the same size
# and shouted just as loudly. The opening paragraphs share the heading's font and
# are turned away by their sentence case instead.
SECTION_NUMBER, SECTION_TITLE, HEADING = 38.0, 29.0, 13.0
HEADING_FONT = "DINNextLTPro-Medium"

# Under this a saga is not a sitting's reading, it is a stub, so it folds into
# the stretch before it. What it cannot do is fold silently: a block named only
# after its first heading would be lying about the six that follow, so each one
# declares what it swallowed.
SAGA_FLOOR = 6

# Chapter 1's section titles carry their own date ranges, so the timeline builds
# itself from the material rather than from anything invented here. The formats
# vary: "(ca. 750-1050)", "(fra ca. 1620)", "(1848-64)", "(1990-)".
ERA_TITLE = re.compile(
    r"^1\.(\d+)\s+(.+?)\s*\(\s*(?:ca\.\s*|fra\s+ca\.\s*)?"
    r"(\d{3,4})\s*(?:[-\u2013]\s*(\d{2,4})?)?\s*\)\s*$")

# The titles are set in capitals, so lowercasing them loses the proper nouns.
KEEP_CAPITAL = {"danmark", "danmarks", "tyskland", "europa", "sverige", "norge", "island",
                "grønland", "færøerne", "usa", "eu", "nato", "fn", "københavn", "jylland",
                "sjælland", "fyn", "norden", "afrika", "ef", "ddr", "nordamerika",
                "slesvig", "holsten", "england", "frankrig", "rusland", "kina", "grundtvig",
                "christian", "frederik", "margrethe", "maj", "verdenskrig", "europarådet"}
# A word carrying an internal full stop is an initialism the material writes out
# in full: N.F.S. Grundtvig must not come back as "N.f.s.".
INITIALISM = re.compile(r"\w\.\w")


def sentence_case(shouted: str) -> str:
    """Set a shouted heading back in sentence case without eating proper nouns.

    Danish is full of three-letter words that look exactly like initialisms once
    a heading is in capitals, so "keep anything short and upper-case" turns
    DET DANSKE FLAG into "DET danske flag". Only two things are kept: a word
    with a full stop inside it, and a name this file knows by name.
    """
    words = []
    for word in shouted.split():
        if INITIALISM.search(word):
            words.append(word)
        elif word.lower().strip(",.:;()") in KEEP_CAPITAL:
            words.append(word.capitalize())
        else:
            words.append(word.lower())
    if not words:
        return shouted
    return " ".join([words[0][:1].upper() + words[0][1:]] + words[1:])

# Danish function words carry no signal and would swamp the scoring.
STOPWORDS = frozenset("""
og i at det en den til er som på de med han af for ikke der var mig sig men et
har om vi min havde ham hun nu over da fra du ha sin dem os op man hans hvor
eller hvad skal selv her alle vil blev kunne ind når være dog nogle blive
mange ad bliver hendes været thi jeg denne disse dette efter under mod ved
samt både også kan må skulle ville hvilket hvilke hvornår hvem hvorfor hvordan
følgende blandt andet især fx eksempel siden mellem
""".split())

WORD = re.compile(r"[a-zà-öø-ÿ]{3,}")


def terms(text: str) -> list[str]:
    return [w for w in WORD.findall(text.lower()) if w not in STOPWORDS]


def relevance(weights: Counter[str], counts: Counter[str], idf: dict[str, float]) -> float:
    """Sublinear TF-IDF.

    Raw term frequency lets a common word repeated often outweigh a rare and
    decisive one: "Hvad er den kriminelle lavalder?" matched a page holding
    "Danmark" fourteen times over the one page in 243 that actually contains
    "lavalder". Damping tf with a logarithm restores the rare term's authority.
    """
    total = 0.0
    for term, weight in weights.items():
        tf = counts.get(term, 0)
        if tf:
            total += weight * (1 + math.log(tf)) * idf.get(term, 0.0)
    return total


def load_material() -> tuple[list[str], list[tuple[int, str]]]:
    """Return per-page text, and the chapter boundaries from the PDF's own TOC."""
    with pymupdf.open(MATERIAL) as doc:
        pages = [page.get_text("text") for page in doc]
        chapters = sorted(
            (start, title.split("–")[-1].strip())
            for _, title, start in doc.get_toc()
            if start > 0 and re.match(r"^\d+\.\s*Kapitel", title.strip())
        )
    return pages, chapters


# Danish abbreviations that must not be mistaken for the end of a sentence.
ABBREV = re.compile(r"\b(bl|ca|dvs|evt|f|fx|jf|kr|nr|osv|pga|st|mfl|mm|ndr|sdr)\.$", re.I)
PASSAGE_CAP = 340


# Layout furniture that must never end up inside a quotation: numbered section
# headings ("6.15 LIGESTILLING MELLEM KØNNENE"), bare shouted headings
# ("DOMSTOLENE", "FÆRØERNE"), table-of-contents dot leaders, and page numbers.
NUMBERED = re.compile(r"^\s*\d+(\.\d+)*\s")
LEADERS = re.compile(r"\.{4,}")


def is_heading(line: str) -> bool:
    text = line.strip()
    if not text or LEADERS.search(text) or text.isdigit():
        return False if not text else True
    letters = [c for c in text if c.isalpha()]
    if not letters:
        return True
    shouted = sum(c.isupper() for c in letters) / len(letters) > 0.7
    # A heading is short and either numbered or shouted, and never ends a sentence.
    return len(text) < 90 and (shouted or bool(NUMBERED.match(text))) and not text.endswith(".")


def sentences(text: str) -> list[str]:
    """Split page text into sentences, healing the PDF's hard line wraps.

    Headings are dropped first, while the line structure still exists. Once the
    lines are joined they are indistinguishable from prose, and quotations end up
    reading "6.15 LIGESTILLING MELLEM KØNNENE Ligestilling mellem mænd og ...".

    The typesetting also hyphenates across lines and leaves soft hyphens behind,
    so "rege\u00ad ring" has to be stitched back into "regering" before anything
    is quoted from it.
    """
    kept = [ln for ln in text.splitlines() if not is_heading(ln)]
    flat = re.sub(r"\u00ad\s*", "", "\n".join(kept))  # soft hyphen plus its wrap
    # Only weld a hyphen that a line break actually split, and never before a
    # conjunction: Danish suspended hyphens are real writing, so "markeds- og
    # handelsplads" must not become "markedsog handelsplads".
    flat = re.sub(r"(\w)-\n\s*(?!(?:og|eller|samt)\b)(\w)", r"\1\2", flat)
    flat = re.sub(r"\s*\n\s*", " ", flat)
    flat = re.sub(r"\s{2,}", " ", flat)
    out, current = [], ""
    for chunk in re.split(r"(?<=[.!?])\s+", flat):
        current = f"{current} {chunk}".strip() if current else chunk
        if not ABBREV.search(current):
            out.append(current)
            current = ""
    if current:
        out.append(current)
    return [s for s in out if len(s) > 40]


# A term appearing on more than this share of pages proves nothing by matching.
COMMON = 0.15
# How much rarer than COMMON a lone word must be to stand as evidence on its own.
STRONG = 1.0
# A yes/no answer is not a phrase that can be located in a passage at all. Half
# the values questions answer "Ja" or "Nej", and "nej" is scattered across the
# material, so containment would "prove" anything. These are never supported.
YES_NO = frozenset({"ja", "nej"})


def states(passage: str | None, answer_terms: set[str],
           idf: dict[str, float], floor: float,
           asks: set[str] | None = None) -> bool:
    """Does this quotation actually contain the answer, distinctively?

    Overlap alone is not evidence. Half the values questions answer "Ja" or
    "Nej", and "nej" appears all over the material, so a bare containment test
    called "Ved folkeafstemningen i 2015 stemte danskerne nej ..." proof that it
    is illegal to hit your spouse. At least one matched term must therefore be
    rare enough to mean something.

    Numeric answers ("15 år", "1849") leave no lexical terms at all, so they
    cannot be checked this way and are never claimed as supported.
    """
    if not passage or not answer_terms or answer_terms <= YES_NO:
        return False
    words = set(terms(passage))
    matched = answer_terms & words
    if len(matched) / len(answer_terms) < 0.5:
        return False
    if not any(idf.get(t, 0.0) >= floor for t in matched):
        return False
    # Containing the answer is not enough when the answer is a single ordinary
    # word. "Hvordan har arbejdsløsheden udviklet sig?" answers "Det er faldet",
    # and a sentence about the birth rate falling matched on "faldet" alone.
    # A genuinely rare word is evidence by itself; "Afghanistan" appears on one
    # page and can only mean one thing. Anything less must also speak to what
    # was actually asked.
    if len(matched) >= 2 or max(idf.get(t, 0.0) for t in matched) >= floor + STRONG:
        return True
    return bool(asks) and any(idf.get(t, 0.0) >= floor for t in asks & words)


def hunt(weights: Counter[str], answer_terms: set[str],
         corpus: list[tuple[int, str, Counter[str]]],
         idf: dict[str, float], floor: float,
         asks: set[str]) -> tuple[str, int] | None:
    """Search every sentence in the material for one that states the answer."""
    if not answer_terms:
        return None  # numeric answers ("15 år") give nothing to search for
    best, found = 0.0, None
    for page, text, counts in corpus:
        matched = answer_terms & set(counts)
        if len(matched) / len(answer_terms) < 0.5:
            continue
        if not any(idf.get(t, 0.0) >= floor for t in matched):
            continue  # matched only on words too common to prove anything
        if (len(matched) < 2
                and max(idf.get(t, 0.0) for t in matched) < floor + STRONG
                and not any(idf.get(t, 0.0) >= floor for t in asks & set(counts))):
            continue  # one ordinary word in common is not evidence
        score = relevance(weights, counts, idf)
        if score > best:
            best, found = score, (tidy(text[:PASSAGE_CAP]), page)
    return found


def best_passage(weights: Counter[str], text: str, idf: dict[str, float]) -> str | None:
    """Pick the sentence on the page that best answers the question.

    Kept to one or two sentences and capped in length: this is a citation of
    SIRI's material with a page reference beside it, not a copy of it. A
    neighbouring sentence is joined only when it scores nearly as well, which is
    what catches an answer split across a sentence boundary.
    """
    found = sentences(text)
    if not found:
        return None

    scored = []
    for sentence in found:
        counts = Counter(terms(sentence))
        hit = relevance(weights, counts, idf)
        scored.append(hit / math.sqrt(len(counts) + 1))  # do not reward length alone

    top = max(range(len(scored)), key=scored.__getitem__)
    if scored[top] <= 0:
        return None

    passage = found[top]
    for neighbour in (top + 1, top - 1):
        if 0 <= neighbour < len(found) and scored[neighbour] > scored[top] * 0.55:
            pair = (f"{passage} {found[neighbour]}" if neighbour > top
                    else f"{found[neighbour]} {passage}")
            if len(pair) <= PASSAGE_CAP:
                passage = pair
            break

    if len(passage) > PASSAGE_CAP:
        passage = passage[:PASSAGE_CAP].rsplit(" ", 1)[0] + "..."
    return tidy(passage)


def tidy(passage: str) -> str:
    """Last sweep before a quotation is shown to anyone.

    Title-case headings such as "Ribe" or "Grundtvig" sit on their own line and
    are not shouted, so they survive the heading filter and reappear glued to the
    sentence beneath them as "Ribe Ribe opstod ...". Collapse the repeat.
    """
    return re.sub(r"^(\S+)\s+\1\b", r"\1", passage.strip())


def headings(doc: pymupdf.Document) -> list[tuple[int, float, str, str]]:
    """Every line set larger than the body, with the type it was set in.

    One pass. The material is 243 pages and 14 MB, so everything downstream
    works from this list rather than opening the book again.
    """
    found = []
    for number, page in enumerate(doc, 1):
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", ()):
                spans = line["spans"]
                text = "".join(s["text"] for s in spans).replace("\u00ad", "").strip()
                if not text or round(max(s["size"] for s in spans), 1) < HEADING:
                    continue
                found.append((number, round(max(s["size"] for s in spans), 1),
                              spans[0]["font"], re.sub(r"\s+", " ", text)))
    return found


def shouted(text: str) -> bool:
    """Headings are set in capitals; a section's opening paragraph is not."""
    letters = [c for c in text if c.isalpha()]
    return bool(letters) and sum(c.isupper() for c in letters) / len(letters) > 0.7


def sagas(entries: list[Entry]) -> list[dict]:
    """The material cut into stretches worth reading in one sitting.

    A saga is a section of the læremateriale, or one of the headed stretches
    inside a section when the section is too long to sit down with. Both come
    from the book's own typography, so nothing about the shape of this is
    invented here: SIRI decided where the headings fall, and this only reads
    them.

    Stretches holding fewer than SAGA_FLOOR questions fold into the one before,
    because a stub is not a sitting's reading. A folded block names what it
    swallowed rather than keeping only its first heading, which would leave
    "Offentlighed" quietly standing over værnepligt, borgerligt ombud and straf.

    Sagas with no questions at all are kept, not dropped. Ninety-eight of the
    243 pages have never been examined in thirteen papers, and saying which is
    worth as much to somebody studying against a clock as anything else here.
    """
    if not MATERIAL.exists():
        return []

    with pymupdf.open(MATERIAL) as doc:
        last_page = doc.page_count
        lines = headings(doc)

    sections: list[dict] = []
    for page, size, _font, text in lines:
        if size == SECTION_NUMBER and re.fullmatch(r"\d+\.\d+", text):
            sections.append({"section": text, "page": page, "title": []})
        elif size == SECTION_TITLE and sections and sections[-1]["page"] == page:
            sections[-1]["title"].append(text)      # the title wraps over lines
    for section in sections:
        section["title"] = " ".join(section["title"])
    for i, section in enumerate(sections):
        section["until"] = sections[i + 1]["page"] - 1 if i + 1 < len(sections) else last_page

    cuts = [(page, text) for page, size, font, text in lines
            if size == HEADING and font == HEADING_FONT and shouted(text) and len(text) < 80]

    def held(part: dict) -> list[str]:
        return sorted(e.id for e in entries
                      if e.section is Section.LAEREMATERIALE and e.page
                      and part["page"] <= e.page <= part["until"])

    found: list[dict] = []
    for section in sections:
        parts = [{"title": section["title"], "page": section["page"], "covers": []}]
        parts += [{"title": text, "page": page, "covers": []}
                  for page, text in cuts if section["page"] < page <= section["until"]]
        for i, part in enumerate(parts):
            part["until"] = parts[i + 1]["page"] - 1 if i + 1 < len(parts) else section["until"]

        merged: list[dict] = []
        for part in parts:
            if merged and len(held(merged[-1])) < SAGA_FLOOR:
                merged[-1]["until"] = part["until"]
                merged[-1]["covers"].append(part["title"])
            else:
                merged.append(part)
        # A runt at the end has nothing after it to fold into, so it folds back.
        while len(merged) > 1 and len(held(merged[-1])) < SAGA_FLOOR:
            tail = merged.pop()
            merged[-1]["until"] = tail["until"]
            merged[-1]["covers"] += [tail["title"], *tail["covers"]]

        found += [{**part,
                   "chapter": int(section["section"].split(".")[0]),
                   "section": section["section"],
                   "title": sentence_case(part["title"]),
                   "covers": [sentence_case(c) for c in part["covers"]],
                   "questions": held(part)}
                  for part in merged]
    return found


def eras() -> list[dict]:
    """Chapter 1's periods, with the pages each one covers."""
    if not MATERIAL.exists():
        return []
    with pymupdf.open(MATERIAL) as doc:
        found = []
        for _, title, page in doc.get_toc():
            clean = re.sub(r"\s+", " ", title.replace("\t", " ")).strip()
            match = ERA_TITLE.match(clean)
            if not match or page <= 0:
                continue
            _, name, start, end = match.groups()
            begins = int(start)
            if end is None:
                finishes = None                      # open range: "(1990-)"
            elif len(end) <= 2:
                # "1848-64" means 1864, not year 64.
                finishes = begins - begins % 100 + int(end)
                if finishes < begins:
                    finishes += 100
            else:
                finishes = int(end)
            found.append({"title": sentence_case(name), "from": begins,
                          "to": finishes, "page": page})
        chapter_end = min((p for _, t, p in doc.get_toc()
                           if re.match(r"^2\.\s*Kapitel", t.strip()) and p > 0), default=65)

    found.sort(key=lambda e: e["page"])
    for i, era in enumerate(found):
        era["until"] = found[i + 1]["page"] - 1 if i + 1 < len(found) else chapter_end - 1
    return found


def locate(entries: list[Entry]) -> None:
    """Attach the supporting passage, its page and its chapter, in place.

    Two stages. First the best page by sublinear TF-IDF, then the best sentence
    on it. If that sentence does not actually contain the answer, the whole
    material is searched for one that does, because a quotation that fails to
    state the answer is worth nothing to a learner.
    """
    if not MATERIAL.exists():
        print("no læremateriale in data/raw; skipping chapter tagging", file=sys.stderr)
        return

    pages, chapters = load_material()
    corpus = [(n + 1, text, Counter(terms(text)))
              for n, page in enumerate(pages) for text in sentences(page)]
    tokens = [terms(page) for page in pages]
    counts = [Counter(t) for t in tokens]
    seen_in = Counter(t for page in tokens for t in set(page))
    total = len(pages) or 1
    # +1 keeps a term that appears on every page from scoring exactly zero.
    idf = {t: math.log(total / (1 + n)) + 1 for t, n in seen_in.items()}
    # Anything on more than COMMON of the pages is too ordinary to be evidence.
    floor = math.log(1 / COMMON) + 1

    for entry in entries:
        weights = Counter(terms(entry.q))
        weights.update(terms(entry.answer))
        weights.update(terms(entry.answer))  # the answer pins the passage

        best, at = 0.0, None
        for index, page in enumerate(counts):
            score = relevance(weights, page, idf)
            if score > best:
                best, at = score, index

        if at is None:
            continue

        answer_terms = set(terms(entry.answer))
        entry.page = at + 1  # PDF pages are 1-based, as is the printed material
        entry.passage = best_passage(weights, pages[at], idf)

        asks = set(terms(entry.q))
        if not states(entry.passage, answer_terms, idf, floor, asks):
            found = hunt(weights, answer_terms, corpus, idf, floor, asks)
            if found:
                entry.passage, entry.page = found

        entry.supports = states(entry.passage, answer_terms, idf, floor, asks)
        # The last chapter beginning at or before this page, not the first.
        entry.chapter = max((n for n, (start, _) in enumerate(chapters, 1)
                             if entry.page >= start), default=None)

        # Values questions are not drawn from the læremateriale (SIRI takes 35
        # from it, 5 on current affairs and 5 on values from a separate basis),
        # so a page reference for them is invented authority. Drop it unless the
        # material genuinely does cover the point.
        if entry.section is Section.VAERDIER and not entry.supports:
            entry.passage, entry.page, entry.chapter = None, None, None


def adopt_written_pages(entries: list[Entry]) -> int:
    """Let a hand-checked page citation overrule the located guess, everywhere.

    locate() finds a page by TF-IDF and is right most of the time; where it is
    not, a human has written the real page into data/explanations.jsonl and the
    app has always shown that one. Until now only the app knew: the timeline and
    the reading rooms went on grouping by the guess, so a question could be filed
    under Kold krig while citing page 194 in Kongehuset, which is exactly what
    "Hvilket år blev Margrethe d. 2. dronning af Danmark?" did.

    131 of 397 disagree, so this is not a rounding error in the corpus. Applied
    here, once, before anything is grouped, rather than in each thing that groups.
    The chapter is recomputed from the corrected page for the same reason: a page
    that moves to another chapter has moved to another hall.
    """
    if not EXPLANATIONS.exists() or not MATERIAL.exists():
        return 0

    written = {}
    for line in EXPLANATIONS.read_text("utf-8").splitlines():
        if line.strip():
            record = json.loads(line)
            if record.get("page"):
                written[record["id"]] = record["page"]

    with pymupdf.open(MATERIAL) as doc:
        chapters = sorted(
            (start, title) for _, title, start in doc.get_toc()
            if start > 0 and re.match(r"^\d+\.\s*Kapitel", title.strip()))

    moved = 0
    for entry in entries:
        page = written.get(entry.id)
        if not page or page == entry.page:
            continue
        entry.page = page
        entry.chapter = max((n for n, (start, _) in enumerate(chapters, 1)
                             if page >= start), default=None)
        moved += 1
    return moved


def fetch(force: bool = False) -> int:
    """Discover PDFs on the page and download them.

    Media URLs embed a random hash that changes whenever SIRI reuploads, so the
    links are always read off the page rather than hardcoded. The filenames
    underneath are stable, and everything downstream keys on those.
    """
    RAW.mkdir(parents=True, exist_ok=True)
    with httpx.Client(follow_redirects=True, timeout=120) as client:
        html = client.get(PAGE).raise_for_status().text
        links = sorted({h for h in HREF.findall(html) if SOURCE_PDF.search(h)})
        if not links:
            print("no PDF links found; the page structure changed", file=sys.stderr)
            return 1

        try:
            previous = json.loads(SOURCES.read_text("utf-8"))
        except (FileNotFoundError, json.JSONDecodeError):
            previous = {}
        downloaded = 0
        for href in links:
            target = RAW / href.rsplit("/", 1)[-1]
            source = ORIGIN + href
            if target.exists() and not force and previous.get(Path(href).stem) == source:
                continue
            target.write_bytes(client.get(source).raise_for_status().content)
            print(f"  fetched {target.name}")
            downloaded += 1

    SOURCES.write_text(
        json.dumps({Path(href).stem: ORIGIN + href for href in links},
                   ensure_ascii=False, indent=1, sort_keys=True) + "\n",
        encoding="utf-8")

    print(f"{len(links)} linked, {downloaded} downloaded, {len(papers())} exams on disk")
    return 0


def build() -> tuple[list[Entry], list[str]]:
    bank: dict[str, Entry] = {}
    rejected: list[str] = []

    for paper in papers():
        sitting = paper.stem.removeprefix("indfoedsretsproeven-")
        key_path = paper.with_name(f"{paper.stem}-retteark.pdf")
        if not key_path.exists():
            rejected.append(f"{sitting}: no retteark")
            continue

        posed = parse_paper(read_pdf(paper))
        key = parse_key(read_pdf(key_path, positional=True))
        print(f"  {sitting}: {len(posed)} questions, {len(key)} answers")

        expected = 40 if sitting <= "2021-06" else 45
        numbers = [item.number for item in posed]
        if len(posed) != expected or len(key) != expected or numbers != list(range(1, expected + 1)):
            rejected.append(
                f"{sitting}: expected {expected} contiguous questions and answers, "
                f"got {len(posed)} questions and {len(key)} answers")
            continue

        for item in posed:
            index = ord(key.get(item.number, "?")) - ord("A")
            if not item.valid or not 0 <= index < len(item.options):
                rejected.append(f"{sitting} q{item.number}")
                continue

            stem = normalise(item.stem)
            identity = f"{stem}|" + "|".join(sorted(normalise(o) for o in item.options))
            entry = bank.setdefault(identity, Entry(
                id=hashlib.sha1(identity.encode()).hexdigest()[:10],
                section=Section.of(item.number),
                q=item.stem,
                options=list(item.options),
                answer=item.options[index],
                stem=stem,
            ))
            entry.seen.append(f"{sitting}#{item.number}")

    return sorted(bank.values(), key=lambda e: e.id), rejected


def report(entries: list[Entry]) -> None:
    asked = sum(len(e.seen) for e in entries)
    print(f"\n{asked} instances -> {len(entries)} unique -> {BANK}")
    for section in Section:
        chosen = [e for e in entries if e.section is section]
        if chosen:
            print(f"  {section:15} {sum(len(e.seen) for e in chosen):4} asked, "
                  f"{len(chosen):4} unique")

    known = {e.id for e in entries}
    # Both hand-written files are keyed by id. If SIRI rewords a stem the id
    # changes and the note detaches silently, so surface it rather than lose it.
    for label, path in (("explanations", EXPLANATIONS), ("currency", CURRENCY)):
        if not path.exists():
            continue
        written = {json.loads(line)["id"]
                   for line in path.read_text("utf-8").splitlines() if line.strip()}
        print(f"\n{label}: {len(written)} written, "
              f"{len(known - written)} questions uncovered")
        if orphaned := sorted(written - known):
            print(f"  ORPHANED (reworded or withdrawn): {orphaned}")


def extract() -> int:
    if not papers():
        print("no exams in data/raw; run `fetch` first", file=sys.stderr)
        return 1
    if not MATERIAL.exists():
        print("no læremateriale in data/raw; run `fetch` first", file=sys.stderr)
        return 1

    entries, rejected = build()
    if rejected:
        print(f"\nrejected {len(rejected)}: {rejected[:8]}", file=sys.stderr)
        return 1
    locate(entries)
    # Before anything groups by page: the written citation wins over the guess.
    if moved := adopt_written_pages(entries):
        print(f"\n{moved} questions moved to their hand-checked page")

    # Derive every output before writing any, so an incomplete rebuild cannot
    # leave a mixed old/new bank in the worktree.
    periods = eras()
    reading = sagas(entries)
    if not periods or not reading:
        print("could not derive eras and sagas from the current material", file=sys.stderr)
        return 1
    for era in periods:
        era["questions"] = sorted(
            e.id for e in entries
            if e.chapter == 1 and e.page and era["page"] <= e.page <= era["until"])

    BANK.parent.mkdir(parents=True, exist_ok=True)
    ERAS.write_text(
        "".join(json.dumps(e, ensure_ascii=False, sort_keys=True) + "\n" for e in periods),
        encoding="utf-8")
    SAGAS.write_text(
        "".join(json.dumps(s, ensure_ascii=False, sort_keys=True) + "\n" for s in reading),
        encoding="utf-8")
    BANK.write_text("".join(e.as_json() + "\n" for e in entries), encoding="utf-8")
    covered = sum(len(e["questions"]) for e in periods)
    print(f"\neras: {len(periods)} periods covering {covered} chapter-1 questions")
    settled = [s for s in reading if s["questions"]]
    print(f"sagas: {len(reading)} stretches, {len(settled)} with questions, "
          f"{len(reading) - len(settled)} never examined, "
          f"{sum(len(s['questions']) for s in reading)} questions placed")
    report(entries)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("command", choices=("fetch", "extract", "all"))
    parser.add_argument("--force", action="store_true", help="re-download existing PDFs")
    args = parser.parse_args()

    if args.command == "fetch":
        return fetch(args.force)
    if args.command == "extract":
        return extract()
    return fetch(args.force) or extract()


if __name__ == "__main__":
    raise SystemExit(main())
