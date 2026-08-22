#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Group questions that teach the same fact, for the reading room.

    uv run tools/kinship.py            propose groups, write data/kinship.jsonl
    uv run tools/kinship.py --review   print the judged merges and change nothing

The bank keys a question on its stem *and* its options, because SIRI reuses a
stem with a different option set and a different correct answer. That is right
for drilling: two option sets are two exercises. It is wrong for reading, where
the same lesson then appears twice on the page, as Vikingetid does with "Freja
og Thor" — asked in 2024 and again in 2026 with one distractor swapped.

Two passes, and they are not equally trusted.

* Exact. Fold accents and Danish number words, then group on stem and answer.
  "I op til ét døgn" and "I op til 1 døgn" are one lesson. This is decided by
  string comparison, cannot be wrong in an interesting way, and needs no review.

* Judged. Questions that share no stem can still teach one fact: "Hvilket land
  blev erobret af Svend Tveskæg?" and "I hvilket århundrede blev England
  erobret?" are one sentence of history asked from two ends. No string method
  finds those, so a local model is asked. It is asked only about pairs that are
  already lexically close and already sit in the same saga, and its answer is
  never final: every merge it proposes is written down with `by: judged` so it
  can be read back and struck out. Nothing here is committed unreviewed.

The asymmetry matters. A wrong split leaves a duplicate on the page, which is
untidy. A wrong merge hides a real question behind an explanation that does not
answer it, which is a lie. "Hvornår fik Danmark sin første socialdemokratiske
statsminister?" and "Hvornår fik Danmark sin første kvindelige minister?" both
answer 1924 and share nearly every word, and they are Stauning and Nina Bang.
So the model is told to refuse on any doubt, and its refusals cost nothing.

The model runs locally through Ollama. No key, no network, no cost, and the
site never touches it: this writes a file, and the file is what ships.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict
from itertools import combinations
from pathlib import Path

BANK = Path("data/questions.jsonl")
SAGAS = Path("data/sagas.jsonl")
KINSHIP = Path("data/kinship.jsonl")

OLLAMA = "http://localhost:11434/api/chat"
MODEL = "gemma3:4b"

# Only pairs this lexically close are put to the model. Below it the two are not
# plausibly the same fact, and asking wastes a second of somebody's rebuild.
NEAR = 0.45

# Merges the model proposed and a human refused. Reviewing 73 proposals turned up
# 13 wrong ones, every one of them the same mistake: the model reads the answer
# and not the question, so two facts that happen to share a word become one.
#
# This is not a list of the model's bad luck. It is the reviewed verdict, kept
# here so that re-running reproduces what was actually agreed rather than asking
# a temperature-zero model to be lucky in the same way twice. Keyed by question
# id like data/explanations.jsonl, and orphaned entries are reported for the same
# reason: if SIRI rewords a stem the id changes, and a refusal must not detach in
# silence and let the merge back in.
REFUSED = [
    # 1924 is Stauning becoming prime minister and Nina Bang becoming the first
    # woman in a cabinet. Two people, two offices, one year.
    ("2775fb8b17", "3bbaef2d94"),
    ("2775fb8b17", "cdbcdaf70d"),
    ("2775fb8b17", "2cf2c15e30"),
    # Buying tobacco and buying spirits are two rules that agree on 18.
    ("91cc98ef97", "0dc444bb9d"), ("91cc98ef97", "e2a7805487"),
    ("9dc3571ff7", "0dc444bb9d"), ("9dc3571ff7", "e2a7805487"),
    ("ef1edcdcdd", "0dc444bb9d"), ("ef1edcdcdd", "e2a7805487"),
    # Jobcentres, elder care and child dentistry are three duties of a kommune,
    # and "Kommunerne" answers all three without being one fact.
    ("8a256f475f", "cf6e4ae0e7"), ("8a256f475f", "cdea40a795"),
    ("cdea40a795", "cf6e4ae0e7"),
    # Whether same-sex couples may marry, and the year they won the right, are
    # not the same question — and 1989's registered partnership is a third thing.
    ("5d0570e248", "b3f80a9132"),
    # Where immigrants came from in the 1960s, and where today's immigrants and
    # their descendants trace their origin, are a flow and a stock.
    ("93c5df307b", "d2c5675997"),
    # Cohabiting and married parents are two conditions in law that happen to
    # reach the same custody outcome. An explanation of one will not answer the
    # other, which is the whole test for merging.
    ("58bb189884", "f0d651a6a5"),
]

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

    The accents have to come off deliberately rather than by leaving them out of
    a character class: dropping é from "ét" silently yields "t", which is how a
    perfectly good answer comes to look like a scanning error.
    """
    lowered = unicodedata.normalize("NFD", text.lower())
    kept = "".join(c for c in lowered
                   if not unicodedata.combining(c) or c in "æøå")
    plain = re.sub(r"[^a-z0-9æøå]+", " ", unicodedata.normalize("NFC", kept)).strip()
    return " ".join(NUMBER_WORD.get(word, word) for word in plain.split())


def terms(text: str) -> set[str]:
    return {w for w in re.findall(r"[a-zæøå0-9]{3,}", fold(text)) if w not in STOPWORDS}


def nearness(a: dict, b: dict) -> float:
    left = terms(f"{a['q']} {a['answer']}")
    right = terms(f"{b['q']} {b['answer']}")
    return len(left & right) / len(left | right) if left | right else 0.0


SYSTEM = """Du afgør om to spørgsmål fra den danske indfødsretsprøve lærer PRÆCIS DEN SAMME KENDSGERNING.

Svar KUN med ét ord: SAMME eller FORSKELLIG.

SAMME: begge spørgsmål handler om nøjagtig samme begivenhed, person, tal eller regel.
Én forklaring ville dække dem begge fuldstændigt. Spørgsmålene må gerne være
formuleret forskelligt eller spørge fra hver sin ende af samme kendsgerning.

FORSKELLIG: de handler om forskellige personer, forskellige begivenheder,
forskellige områder, forskellige partier eller forskellige regler.

VIGTIGT: at to svar er ens betyder IKKE at spørgsmålene er ens. To forskellige
begivenheder kan sagtens ske i samme år. To forskellige regler kan have samme tal.
Se på hvad der SPØRGES om, ikke kun på svaret.

Ved den mindste tvivl: FORSKELLIG."""

SHOTS = [
    ("Hvem var Danmarks første kvindelige statsminister?", "Helle Thorning-Schmidt",
     "Hvem var Danmarks første socialdemokratiske statsminister?", "Thorvald Stauning",
     "FORSKELLIG"),
    ("Hvad hedder Danmarks nationalsang?", "Der er et yndigt land",
     "Hvilken sang er Danmarks nationalsang?", "Der er et yndigt land",
     "SAMME"),
    ("I hvilket år blev Grundloven underskrevet?", "1849",
     "Hvornår fik Danmark sin første grundlov?", "1849",
     "SAMME"),
    ("Hvilket af følgende områder har kommunerne ansvaret for?", "Folkeskolen",
     "Hvilket af følgende områder har kommunerne ansvaret for?", "Ældrepleje",
     "FORSKELLIG"),
]


def ask(question_a: dict, question_b: dict, model: str) -> str:
    messages = [{"role": "system", "content": SYSTEM}]
    for qa, aa, qb, ab, verdict in SHOTS:
        messages.append({"role": "user",
                         "content": f"Spørgsmål 1: {qa}\nSvar 1: {aa}\n\n"
                                    f"Spørgsmål 2: {qb}\nSvar 2: {ab}\n\nSAMME eller FORSKELLIG?"})
        messages.append({"role": "assistant", "content": verdict})
    messages.append({"role": "user",
                     "content": f"Spørgsmål 1: {question_a['q']}\nSvar 1: {question_a['answer']}\n\n"
                                f"Spørgsmål 2: {question_b['q']}\nSvar 2: {question_b['answer']}\n\n"
                                f"SAMME eller FORSKELLIG?"})
    body = json.dumps({"model": model, "stream": False, "think": False,
                       "options": {"temperature": 0, "num_predict": 8},
                       "messages": messages}).encode()
    request = urllib.request.Request(OLLAMA, body, {"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=180) as reply:
        return json.load(reply)["message"]["content"].strip().upper()


class Kin:
    """Union-find. Kinship has to be transitive or a group can contradict itself."""

    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def find(self, x: str) -> str:
        self.parent.setdefault(x, x)
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]
            x = self.parent[x]
        return x

    def join(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.parent[max(ra, rb)] = min(ra, rb)


def load() -> tuple[dict[str, dict], list[dict]]:
    bank = {}
    for line in BANK.read_text("utf-8").splitlines():
        if line.strip():
            record = json.loads(line)
            if record["section"] == "laeremateriale":
                bank[record["id"]] = record
    sagas = [json.loads(l) for l in SAGAS.read_text("utf-8").splitlines() if l.strip()]
    return bank, sagas


def propose(model: str, quiet: bool = False) -> tuple[Kin, dict[frozenset, str], list]:
    bank, sagas = load()
    kin = Kin()
    how: dict[frozenset, str] = {}

    # Pass one: identical lesson, decided by string comparison.
    exact = defaultdict(list)
    for record in bank.values():
        exact[(record["stem"], fold(record["answer"]))].append(record["id"])
    for ids in exact.values():
        for other in ids[1:]:
            kin.join(ids[0], other)
            how[frozenset((ids[0], other))] = "exact"

    # Pass two: same fact, different question. Only within a saga, because two
    # questions the reading room never shows together do not need reconciling.
    pairs = []
    for saga in sagas:
        present = [i for i in saga["questions"] if i in bank]
        for a, b in combinations(present, 2):
            if bank[a]["stem"] == bank[b]["stem"] or kin.find(a) == kin.find(b):
                continue
            score = nearness(bank[a], bank[b])
            if score >= NEAR:
                pairs.append((score, a, b))
    pairs.sort(reverse=True)

    refused = {frozenset(pair) for pair in REFUSED}
    judged = []
    for n, (score, a, b) in enumerate(pairs, 1):
        if not quiet:
            print(f"  [{n}/{len(pairs)}] {score:.2f} ", end="", flush=True)
        if frozenset((a, b)) in refused:
            if not quiet:
                print("refused on review")
            continue
        try:
            verdict = ask(bank[a], bank[b], model)
        except (urllib.error.URLError, TimeoutError) as problem:
            print(f"\nollama unreachable ({problem}); is it running?", file=sys.stderr)
            raise SystemExit(1) from problem
        same = verdict.startswith("SAMME")
        if not quiet:
            print("SAMME" if same else "forskellig")
        if same:
            kin.join(a, b)
            how[frozenset((a, b))] = "judged"
            judged.append((score, a, b))
    return kin, how, judged


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", default=MODEL)
    parser.add_argument("--review", action="store_true",
                        help="print what the model merged, and write nothing")
    args = parser.parse_args()

    bank, _ = load()
    # A refusal keyed on an id that no longer exists is a refusal that has
    # stopped working, and the merge it was holding back would walk straight in.
    if orphaned := [pair for pair in REFUSED if not set(pair) <= set(bank)]:
        print(f"REFUSED entries no longer in the bank (reworded?): {orphaned}", file=sys.stderr)
    kin, how, judged = propose(args.model, quiet=args.review)

    if args.review:
        print(f"\n{len(judged)} merges proposed by {args.model}, none of them binding:\n")
        for score, a, b in judged:
            print(f"  [{score:.2f}]  {bank[a]['q']}\n           -> {bank[a]['answer']}")
            print(f"           {bank[b]['q']}\n           -> {bank[b]['answer']}\n")
        return 0

    groups = defaultdict(list)
    for record_id in bank:
        groups[kin.find(record_id)].append(record_id)

    # Refusing the edge A-B does not stop A-C-B. Kinship is transitive, so one
    # accepted pair either side of a refused one puts it back together anyway,
    # and the refusal would look honoured in the log while being void in the
    # file. Checked against the built groups, which is the only place it shows.
    leaked = [(a, b) for a, b in REFUSED
              if a in bank and b in bank and kin.find(a) == kin.find(b)]
    if leaked:
        print(f"\n{len(leaked)} refused merges reunited through a third question:",
              file=sys.stderr)
        for a, b in leaked:
            print(f"  {bank[a]['q']}\n  {bank[b]['q']}\n", file=sys.stderr)
        print("nothing written; refuse the connecting pair too", file=sys.stderr)
        return 1

    written = []
    for lead, members in sorted(groups.items()):
        if len(members) < 2:
            continue
        members.sort()
        # A group is "judged" if any edge in it needed the model, so review
        # attention lands on exactly the groups a string could not have found.
        decided = "exact"
        for a, b in combinations(members, 2):
            if how.get(frozenset((a, b))) == "judged":
                decided = "judged"
                break
        written.append({"by": decided, "questions": members,
                        "seen": sorted({s for m in members for s in bank[m]["seen"]})})

    written.sort(key=lambda g: g["questions"][0])
    KINSHIP.write_text(
        "".join(json.dumps(g, ensure_ascii=False, sort_keys=True) + "\n" for g in written),
        encoding="utf-8")

    folded = sum(len(g["questions"]) - 1 for g in written)
    by_string = sum(1 for g in written if g["by"] == "exact")
    print(f"\n{len(written)} groups -> {KINSHIP}"
          f"  ({by_string} by string, {len(written) - by_string} judged)")
    print(f"reading room: {len(bank)} entries -> {len(bank) - folded}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
