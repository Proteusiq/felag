# Working on Félag

Free training for Indfødsretsprøven, built only from SIRI's published papers and
their official answer keys. Static: no build step, no runtime dependency, no
network call, no accounts. Open `index.html` and it works.

Read automatically by opencode and the other agent tools, and worth a human's
five minutes too. It exists because some of the work here is judgement rather
than code, and the judgement has to be made the same way every time.

## Invariants

Break any of these and the project stops being what it claims to be.

1. **Nothing is invented.** Every answer is SIRI's. Every explanation is written
   from the læremateriale with the page cited. If a fact cannot be sourced, it
   does not ship.
2. **No LLM in the project.** No model is called at build time or at run time.
   Judgement that needs a model is made *in the agent harness*, by you, and
   committed as reviewed data with a reason attached. See below.
3. **No dependencies in the site.** `js/` is plain ES modules. three.js is
   vendored. Tools may use uv scripts with inline PEP 723 dependencies.
4. **Generated data is generated; written data is written.** `tools/content.py`
   owns `questions.jsonl`, `eras.jsonl`, `sagas.jsonl` and `sources.json`, and
   rewrites them freely. It must never write `explanations.jsonl`,
   `currency.jsonl`, `kinship.jsonl` or `principles.jsonl` — those are human
   judgement, joined by id.
5. **Reading is never gated.** The six halls lock to pace drilling. Sagaerne is
   open from day one, including for locked halls.

## The harness does the judging

Some of the work here cannot be done by a script and must not be done by the
site. Which questions teach the same fact, whether an answer has gone stale,
what an explanation should say — those are claims about Danish history and
Danish law, and they need a reader.

That reader is an agent tool: opencode, driving a frontier model, run against
this repo by hand when the material changes. Never a model the project calls
itself. The division is fixed:

| | does |
|---|---|
| `tools/` | the mechanical part — parse, locate, propose, check. Deterministic, offline, no key. |
| the harness | the judgement — read the proposals, rule on them, write the reason down. |
| `git` | holds the verdict. The committed file is the authority, not the model that suggested it. |

So a model may *propose* and may never *decide*. Anything it suggests lands in a
file with a reason beside it, gets read in review, and is reversible by editing
that file rather than by rerunning anything. When this was first built the model
offered 73 merges and 13 were wrong — every one the same mistake, reading the
answer instead of the question — which is the whole argument for this shape.

Practically, working a batch looks like: run `--propose`, read every pair, apply
the rule below, append the verdicts, run the check, and put the reasoning in the
commit body so the next session can disagree with it on the evidence.

## When a new exam is published

SIRI adds a paper roughly twice a year. The whole sequence:

```sh
uv run tools/content.py all        # fetch new PDFs, rebuild the bank
uv run tools/kinship.py --propose  # new near-duplicate pairs to rule on
uv run tools/kinship.py            # check kinship.jsonl is still whole
```

`content.py` exits non-zero if parsing regressed, and reports questions whose id
changed — a reworded stem detaches its explanation, its currency note and its
kinship verdict in silence, which is the failure mode to watch for.

Then, by hand: write explanations for the uncovered questions, and rule on the
proposed pairs.

## Ruling on kinship pairs

`--propose` prints pairs already close in wording and already in the same saga.
For each, one question only:

> Would a single explanation answer both questions completely?

Yes → append a group to `data/kinship.jsonl`:

```json
{"by": "judged", "questions": ["<id>", "<id>"], "seen": ["2024-05#22", "2026-06#27"]}
```

No → append the refusal **with its reason**, so it is not re-asked next rebuild
and cannot be reversed without someone reading why:

```json
{"apart": ["<id>", "<id>"], "why": "Grønland og Færøerne er to steder med hvert sit indbyggertal."}
```

The asymmetry decides the close calls. A wrong split leaves a duplicate on the
page, which is untidy. A wrong merge hides a real question behind an explanation
that does not answer it, which is a lie. **When in doubt, refuse.**

The traps are quiet, and all of them are two facts wearing one answer:

| looks the same | is not |
|---|---|
| tobacco 18, spirits 18 | two rules that agree on a number |
| jobcentre, ældrepleje, vuggestuer, børnetandpleje → *kommunerne* | four duties of a kommune |
| Stauning 1924, Nina Bang 1924 | two people, two offices, one year |
| Grønland ~55.000, Færøerne ~50.000 | two places |
| partnership 1989, marriage 2012 | two laws |
| immigrants *from* in the 1960s, origins *now* | a flow and a stock |
| "deltager Danmark…" ja, "har Danmark forbehold…" nej | opposite answers, meet separately |

Genuine merges usually look like one fact asked from two ends: *"Hvilket land
blev erobret af Svend Tveskæg?"* → England and *"I hvilket århundrede blev
England erobret?"* → 1000-tallet.

Same stem with **different answers** is never a merge. That is SIRI reusing a
stem with a different option set, and it is why the bank keys on stem *and*
options in the first place.

## Verifying a change

There is no test suite; the checks are the tools and the browser.

```sh
uv run tools/kinship.py            # groups whole, no orphans, no runaways
node --check js/app.js
python3 -m http.server 8765
```

Then in the browser, for anything touching the reading rooms: open all six,
expand every settlement, and confirm no two readings share a question *and* an
answer. For anything touching halls: check a locked hall still offers "Læs
sagaen" at full strength.

## Conventions

- Commits: `feat:`/`fix:`/`refactor:` and a body that says what was measured and
  what was traded away. Read `git log` before writing one.
- Comments explain *why*, especially where the obvious approach was tried and
  failed. The code is full of these; keep them accurate or delete them.
- Danish in the interface, English in the code and commits.
- Releases: bump the README badge on the last commit of the release, tag it
  lightweight, and write the GitHub release notes. Tag and badge must agree.
- Pushing needs the `Proteusiq` account active: `gh auth switch -u Proteusiq`.
