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
* Records are sorted by id, so a new exam yields an append-shaped diff.
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
# Every question on the paper is answerable from the 243-page material, so each
# one is matched back to the page it came from. That single step yields three
# things at once: which of the six chapters a question belongs to, a page to
# cite, and the passage to write the explanation from. Explanations are then
# written from the source rather than from memory.
# ---------------------------------------------------------------------------

MATERIAL = RAW / "laeremateriale-til-indfoedsretsproeven.pdf"
ERAS = Path("data/eras.jsonl")

# Chapter 1's section titles carry their own date ranges, so the timeline builds
# itself from the material rather than from anything invented here. The formats
# vary: "(ca. 750-1050)", "(fra ca. 1620)", "(1848-64)", "(1990-)".
ERA_TITLE = re.compile(
    r"^1\.(\d+)\s+(.+?)\s*\(\s*(?:ca\.\s*|fra\s+ca\.\s*)?"
    r"(\d{3,4})\s*(?:[-\u2013]\s*(\d{2,4})?)?\s*\)\s*$")

# The titles are set in capitals, so lowercasing them loses the proper nouns.
KEEP_CAPITAL = {"danmark", "tyskland", "europa", "sverige", "norge", "island",
                "grønland", "færøerne", "usa", "eu", "nato", "fn"}


def sentence_case(shouted: str) -> str:
    words = [w.capitalize() if w.lower().strip(",.") in KEEP_CAPITAL else w.lower()
             for w in shouted.split()]
    return " ".join(words).capitalize() if not words else (
        " ".join([words[0][:1].upper() + words[0][1:]] + words[1:]))

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
# A yes/no answer is not a phrase that can be located in a passage at all. Half
# the values questions answer "Ja" or "Nej", and "nej" is scattered across the
# material, so containment would "prove" anything. These are never supported.
YES_NO = frozenset({"ja", "nej"})


def states(passage: str | None, answer_terms: set[str],
           idf: dict[str, float], floor: float) -> bool:
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
    matched = answer_terms & set(terms(passage))
    if len(matched) / len(answer_terms) < 0.5:
        return False
    return any(idf.get(t, 0.0) >= floor for t in matched)


def hunt(weights: Counter[str], answer_terms: set[str],
         corpus: list[tuple[int, str, Counter[str]]],
         idf: dict[str, float], floor: float) -> tuple[str, int] | None:
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

        best, runner, at = 0.0, 0.0, None
        for index, page in enumerate(counts):
            score = relevance(weights, page, idf)
            if score > best:
                best, runner, at = score, best, index
            elif score > runner:
                runner = score

        if at is None:
            continue

        answer_terms = set(terms(entry.answer))
        entry.page = at + 1  # PDF pages are 1-based, as is the printed material
        entry.passage = best_passage(weights, pages[at], idf)

        if not states(entry.passage, answer_terms, idf, floor):
            found = hunt(weights, answer_terms, corpus, idf, floor)
            if found:
                entry.passage, entry.page = found

        entry.supports = states(entry.passage, answer_terms, idf, floor)
        # The last chapter beginning at or before this page, not the first.
        entry.chapter = max((n for n, (start, _) in enumerate(chapters, 1)
                             if entry.page >= start), default=None)

        # Values questions are not drawn from the læremateriale (SIRI takes 35
        # from it, 5 on current affairs and 5 on values from a separate basis),
        # so a page reference for them is invented authority. Drop it unless the
        # material genuinely does cover the point.
        if entry.section is Section.VAERDIER and not entry.supports:
            entry.passage, entry.page, entry.chapter = None, None, None


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

        downloaded = 0
        for href in links:
            target = RAW / href.rsplit("/", 1)[-1]
            if target.exists() and not force:
                continue
            target.write_bytes(client.get(ORIGIN + href).raise_for_status().content)
            print(f"  fetched {target.name}")
            downloaded += 1

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

    entries, rejected = build()
    locate(entries)

    # The timeline is derived, so it is regenerated rather than hand-kept.
    if periods := eras():
        for era in periods:
            era["questions"] = sorted(
                e.id for e in entries
                if e.chapter == 1 and e.page and era["page"] <= e.page <= era["until"])
        ERAS.write_text(
            "".join(json.dumps(e, ensure_ascii=False, sort_keys=True) + "\n" for e in periods),
            encoding="utf-8")
        covered = sum(len(e["questions"]) for e in periods)
        print(f"\neras: {len(periods)} periods covering {covered} chapter-1 questions")
    BANK.parent.mkdir(parents=True, exist_ok=True)
    BANK.write_text("".join(e.as_json() + "\n" for e in entries), encoding="utf-8")
    report(entries)

    if rejected:
        # Parsing regressions must fail the pipeline rather than silently ship a
        # smaller bank, so the workflow opens no pull request until it is fixed.
        print(f"\nrejected {len(rejected)}: {rejected[:8]}", file=sys.stderr)
        return 1
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
