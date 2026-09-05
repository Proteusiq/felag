#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Check data/kinship.jsonl, and propose pairs that still need a human verdict.

    uv run tools/kinship.py            check the file that is committed
    uv run tools/kinship.py --propose  print pairs nobody has ruled on yet

The bank keys a question on its stem *and* its options, because SIRI reuses a
stem with a different option set and a different correct answer. Two option sets
are two exercises, which is right for drilling and wrong for reading: the room
then prints one lesson twice, as Vikingetid did with "Freja og Thor" — asked in
2024 and again in 2026 with a single distractor swapped, each claiming to have
been asked once.

data/kinship.jsonl says which questions teach one fact. Like
data/explanations.jsonl it is written by hand and joined by id, and **this script
never writes it**. That is deliberate. Deciding that two questions teach the same
thing is a judgement about Danish history and Danish law, and a judgement belongs
in a file somebody signed, not in a model invoked at build time. The site has no
build step, no dependency and no network call, and it is not going to grow one
for this.

What the script does instead is the part that is not judgement:

* proposes. Pairs already close in wording, sitting in the same saga, and not yet
  ruled on. That narrows 397 questions to a list short enough to read.
* checks. Every group must be whole — ids that still exist, no question in two
  groups, every refusal carrying a reason, and no group so large it has clearly
  run away through a chain of near-misses.

The asymmetry is the whole reason for the care. A wrong split leaves a duplicate
on the page, which is untidy. A wrong merge hides a real question behind an
explanation that does not answer it, which is a lie. The traps are quiet ones:
tobacco and spirits both answer 18, jobcentre and ældrepleje and børnetandpleje
are all run by kommunerne, and 1924 is both Stauning taking office and Nina Bang
entering a cabinet. Every one of those is two facts wearing one answer.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from itertools import combinations
from pathlib import Path

BANK = Path("data/questions.jsonl")
SAGAS = Path("data/sagas.jsonl")
KINSHIP = Path("data/kinship.jsonl")

# Pairs closer than this in wording are worth a human's minute. Below it, two
# questions are not plausibly the same fact and the list stops being readable.
NEAR = 0.45

# A group larger than this has almost certainly walked from one fact to another
# through a chain of near-misses, since kinship is transitive.
RUNAWAY = 4

# Danish writes its small numbers both ways between sittings, and an answer is
# the same answer either way.
NUMBER_WORD = {
    "en": "1", "et": "1", "første": "1", "to": "2", "anden": "2", "andet": "2",
    "tre": "3", "tredje": "3", "fire": "4", "fjerde": "4", "fem": "5", "femte": "5",
    "seks": "6", "sjette": "6", "syv": "7", "syvende": "7", "otte": "8", "ottende": "8",
    "ni": "9", "niende": "9", "ti": "10", "tiende": "10", "elleve": "11", "tolv": "12",
}

STOPWORDS = frozenset(
    "og i at det en den til er som på de med af for ikke der var har om vi kan "
    "hvilke hvilket hvad hvor hvem følgende blandt et blev fra man sin".split())


def fold(text: str) -> str:
    """Lower-case, strip accents but keep æøå, and write numbers as digits.

    The accents come off deliberately rather than by being left out of a
    character class: dropping é from "ét" silently yields "t", which is how a
    perfectly good answer comes to look like a scanning error.
    """
    lowered = unicodedata.normalize("NFD", text.lower())
    kept = "".join(c for c in lowered if not unicodedata.combining(c) or c in "æøå")
    plain = re.sub(r"[^a-z0-9æøå]+", " ", unicodedata.normalize("NFC", kept)).strip()
    return " ".join(NUMBER_WORD.get(word, word) for word in plain.split())


def terms(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-zæøå0-9]{3,}", fold(text)) if w not in STOPWORDS}


def nearness(a: dict, b: dict) -> float:
    left, right = terms(f"{a['q']} {a['answer']}"), terms(f"{b['q']} {b['answer']}")
    return len(left & right) / len(left | right) if left | right else 0.0


def load() -> tuple[dict[str, dict], list[dict], list[dict]]:
    bank = {}
    for line in BANK.read_text("utf-8").splitlines():
        if line.strip():
            record = json.loads(line)
            if record["section"] == "laeremateriale":
                bank[record["id"]] = record
    sagas = [json.loads(l) for l in SAGAS.read_text("utf-8").splitlines() if l.strip()]
    groups = ([json.loads(l) for l in KINSHIP.read_text("utf-8").splitlines() if l.strip()]
              if KINSHIP.exists() else [])
    return bank, sagas, groups


def propose(bank: dict, sagas: list[dict], groups: list[dict]) -> int:
    """Pairs a human has not ruled on, worth reading over a coffee."""
    settled = set()
    for record in groups:
        if "questions" in record:
            settled.update(frozenset(p) for p in combinations(record["questions"], 2))
        else:
            settled.add(frozenset(record["apart"]))

    found = []
    for saga in sagas:
        present = [i for i in saga["questions"] if i in bank]
        for a, b in combinations(present, 2):
            if frozenset((a, b)) in settled or bank[a]["stem"] == bank[b]["stem"]:
                continue
            score = nearness(bank[a], bank[b])
            if score >= NEAR:
                found.append((score, a, b))
    found.sort(reverse=True)

    for score, a, b in found:
        print(f"[{score:.2f}] {a} {b}")
        print(f"    {bank[a]['q']}\n      -> {bank[a]['answer']}")
        print(f"    {bank[b]['q']}\n      -> {bank[b]['answer']}\n")
    print(f"{len(found)} pairs awaiting a verdict "
          f"({len(settled)} already ruled on in {KINSHIP})")
    return 0


def check(bank: dict, groups: list[dict]) -> int:
    """Everything about the committed file that can be wrong without judgement."""
    faults = []

    seen: dict[str, int] = {}
    for n, group in enumerate(groups):
        if "apart" in group:
            missing = [i for i in group["apart"] if i not in bank]
            if missing:
                faults.append(f"refusal {n}: {missing} no longer in the bank; "
                              f"the merge it holds back would walk straight back in")
            if not group.get("why"):
                faults.append(f"refusal {n} has no reason written down")
            continue
        members = group["questions"]
        if len(members) < 2:
            faults.append(f"group {n} has {len(members)} member(s); a group is two or more")
        # An id that no longer exists means SIRI reworded a stem and the verdict
        # has quietly detached, exactly as an orphaned explanation would.
        for member in members:
            if member not in bank:
                faults.append(f"group {n}: {member} is no longer in the bank (reworded?)")
            elif member in seen:
                faults.append(f"{member} appears in groups {seen[member]} and {n}")
            else:
                seen[member] = n
        if len(members) > RUNAWAY:
            faults.append(f"group {n} has {len(members)} members; "
                          f"kinship is transitive, so check it has not walked")

    for fault in faults:
        print(f"  {fault}", file=sys.stderr)

    kin = [g for g in groups if "questions" in g]
    apart = [g for g in groups if "apart" in g]
    folded = sum(len(g["questions"]) - 1 for g in kin)
    by_string = sum(1 for g in kin if g.get("by") == "exact")
    print(f"{len(kin)} groups: {by_string} by string, {len(kin) - by_string} judged; "
          f"{len(apart)} refusals held")
    print(f"reading room: {len(bank)} questions -> {len(bank) - folded} readings")
    if faults:
        print(f"\n{len(faults)} fault(s)", file=sys.stderr)
        return 1
    print("no faults")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--propose", action="store_true",
                        help="print pairs that still need a verdict")
    args = parser.parse_args()

    bank, sagas, groups = load()
    if args.propose:
        return propose(bank, sagas, groups)
    return check(bank, groups)


if __name__ == "__main__":
    raise SystemExit(main())
