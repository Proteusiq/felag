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
    grounded: bool = False

    def as_json(self) -> str:
        record = {
            "id": self.id,
            "section": str(self.section),
            "chapter": self.chapter,
            "page": self.page,
            "grounded": self.grounded,
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


def load_material() -> tuple[list[list[str]], list[tuple[int, str]]]:
    """Return per-page term lists, and the chapter boundaries from the PDF's own TOC."""
    with pymupdf.open(MATERIAL) as doc:
        pages = [terms(page.get_text("text")) for page in doc]
        chapters = sorted(
            (start, title.split("–")[-1].strip())
            for _, title, start in doc.get_toc()
            if start > 0 and re.match(r"^\d+\.\s*Kapitel", title.strip())
        )
    return pages, chapters


def locate(entries: list[Entry]) -> None:
    """Attach the best-matching page and its chapter to each entry, in place.

    Scoring is term frequency weighted by inverse document frequency over pages,
    so a distinctive word like "stavnsbåndet" outweighs a common one like "dansk".
    Terms from the correct answer count double, since the answer is what pins a
    question to one passage rather than a general topic.
    """
    if not MATERIAL.exists():
        print("no læremateriale in data/raw; skipping chapter tagging", file=sys.stderr)
        return

    pages, chapters = load_material()
    counts = [Counter(p) for p in pages]
    seen_in = Counter(t for page in pages for t in set(page))
    total = len(pages) or 1
    # +1 keeps a term that appears on every page from scoring exactly zero.
    idf = {t: math.log(total / (1 + n)) + 1 for t, n in seen_in.items()}

    for entry in entries:
        weights = Counter(terms(entry.q))
        weights.update(terms(entry.answer))
        weights.update(terms(entry.answer))  # the answer pins the passage

        best, runner, at = 0.0, 0.0, None
        for index, page in enumerate(counts):
            score = sum(n * page.get(t, 0) * idf.get(t, 0.0) for t, n in weights.items())
            if score > best:
                best, runner, at = score, best, index
            elif score > runner:
                runner = score

        if at is None:
            continue
        entry.page = at + 1  # PDF pages are 1-based, and so is the printed material
        # The last chapter that begins at or before this page, not the first.
        entry.chapter = max((n for n, (start, _) in enumerate(chapters, 1)
                             if entry.page >= start), default=None)
        # A weak or ambiguous match is flagged rather than trusted silently.
        entry.grounded = best > 0 and (runner / best if best else 1) < 0.85


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

    if not EXPLANATIONS.exists():
        return
    # Explanations are keyed by id. If SIRI rewords a stem the id changes and the
    # explanation detaches silently, so surface it rather than quietly lose it.
    written = {json.loads(line)["id"]
               for line in EXPLANATIONS.read_text("utf-8").splitlines() if line.strip()}
    known = {e.id for e in entries}
    print(f"\nexplanations: {len(written)} written, "
          f"{len(known - written)} questions uncovered")
    if orphaned := sorted(written - known):
        print(f"  ORPHANED (reworded or withdrawn): {orphaned}")


def extract() -> int:
    if not papers():
        print("no exams in data/raw; run `fetch` first", file=sys.stderr)
        return 1

    entries, rejected = build()
    locate(entries)
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
