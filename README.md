# Félag

Free training for the Danish citizenship test, **Indfødsretsprøven**.

*Félag* is Old Norse for a fellowship, a joint venture, people who put something
in together. Learning should be free, so this is free. No accounts, no ads, no
paywall. If it helped, there is a MobilePay link and nothing else.

## Why this exists

The official material from SIRI is free, and thirteen past exams are published
with official answer keys. Several sites charge money to re-present that same
free material, sometimes inaccurately. Félag uses nothing but the official
source and links back to it.

## What the questions are

Every question in `data/questions.jsonl` is a real question from a published
Indfødsretsprøven paper, with the correct answer taken from SIRI's own
*retteark*. Nothing is invented or paraphrased.

```
570 question instances across 13 papers (2020-2026)
-> 508 unique questions
   397 laeremateriale   (35 of the 45 questions on exam day)
    46 vaerdier         (5 questions, and you must get 4 right)
    65 aktuelt          (5 questions on current affairs)
```

The three sections behave completely differently, which is why the app treats
them as different modes rather than one quiz with a filter:

| Section | Recurs between papers | Consequence |
|---|---|---|
| Læremateriale | 31% | Drillable. Frequency is a real study signal. |
| Værdier | 13% | Barely repeats. Learn the principles, not the answers. |
| Aktuelt | **0%** | Never repeats. Past ones show the shape, not the answer. |

### Two things worth knowing

**SIRI reuses question stems with different options and different answers.**
*"Hvilken rettighed er sikret i grundloven?"* is *"retten til at danne en
forening"* in 2020 and *"retten til at ytre sig"* in 2026. A question's identity
is therefore its stem **and** its options; keying on the stem alone silently
ships a wrong answer.

**Answer position is not uniform.** Across the 13 papers, C is correct 39.3% of
three-option questions where chance says 33.3%. Félag shuffles options on every
sitting so you learn the content rather than a position habit.

## Running it

The site is static. No build step, no bundler, no dependencies.

```sh
python3 -m http.server 8765     # then open http://localhost:8765
```

## Regenerating the question bank

Requires [uv](https://docs.astral.sh/uv/). Dependencies are declared inline in
the script (PEP 723), so there is nothing to install first.

```sh
uv run tools/content.py all      # fetch PDFs, then extract
uv run tools/content.py fetch    # download only
uv run tools/content.py extract  # parse only
```

Source PDFs land in `data/raw/` and are **not committed**: they are 29MB, they
are not ours, and they are refetchable. The extracted bank is the artefact.

`.github/workflows/content.yml` runs this monthly and opens a pull request when
SIRI publishes a new paper. It never writes `data/explanations.jsonl`, so
hand-written explanations survive every regeneration. If SIRI rewords a stem,
its id changes and the extractor reports the explanation as `ORPHANED` rather
than losing it quietly.

## Layout

```
index.html            shell
css/app.css           tokens, time-of-day palettes, motion
js/cast.js            the six guides, one shared rig
js/scenes.js          parallax scenes as data
js/app.js             state, routing, quiz, exam rules
tools/content.py      uv script: fetch + extract
data/questions.jsonl  generated, never hand-edited
data/explanations.jsonl  hand-written, joined by id
```

## Exam rules, as modelled

45 questions in 45 minutes. 36 correct to pass, **and** at least 4 of the 5
values questions. The values gate is a separate hurdle: you can score well
overall and still fail on it, which is exactly where people fall.

## Attribution

Material and past papers are published by
[Styrelsen for International Rekruttering og Integration (SIRI)](https://danskogproever.dk/borger/indfoedsretsproeve-statsborgerskab/forberedelse-til-indfoedsretsproeven/).
Félag is **not affiliated with or endorsed by SIRI**. It is an independent,
free study aid. Always check the official source, and follow Danish news for
the current-affairs questions, which no static material can cover.
