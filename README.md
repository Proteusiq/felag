# Félag

Free training for the Danish citizenship test, **Indfødsretsprøven**.

*Félag* is Old Norse. It means a fellowship, a joint venture, people who lay
their wealth together in one pot. The word survives in English as *fellow*.
Learning should be free, so this is free. No accounts, no advertisements, no
paywall. 

> If it served you well, you can buy us coffee, a MobilePay box Félag: 1845MC, or not 🫣.

## Of the road, and why it was made

The realm sets a test for those who would join it. The material for that test
is already free, and thirteen past papers lie in the open with their answer
keys beside them.

Others have fenced that common ground and asked coin for passage, sometimes
guiding travellers wrong. Félag takes nothing that is not freely given, and
points every traveller back to the well it drew from.

## What is carried

Every question in `data/questions.jsonl` was truly asked. The answers are
SIRI's own, taken from the *retteark*. Nothing here was invented, and nothing
was reworded to seem wiser than the source.

```
570 questions asked across 13 papers, from 2020 to 2026
-> 508 that differ
   397 laeremateriale   35 of the 45 you will face
    46 vaerdier          5 you will face, and 4 you must answer
    65 aktuelt           5 you will face, drawn from the year's news
```

The three kinds do not behave alike, and so they are not trained alike.

| Kind | Returns between papers | What that demands |
|---|---|---|
| Læremateriale | 31 in 100 | Drill it. How often a thing is asked is itself worth knowing. |
| Værdier | 13 in 100 | Barely returns. Learn the principle, never the answer. |
| Aktuelt | none | Never returns. The old ones show the shape, not the answer. |

## Two things the papers gave up under questioning

**The same question is not always the same question.** SIRI keeps a stem and
changes what stands beneath it. *"Hvilken rettighed er sikret i grundloven?"*
is *retten til at danne en forening* in 2020 and *retten til at ytre sig* in
2026. A question is therefore known by its stem and its choices together.
Whoever knows it by the stem alone will merge the two, keep one answer, and
teach it confidently to the wrong end.

**The third door opens more often than the others.** Across the thirteen
papers, C is correct in 39.3 of 100 three-choice questions, where blind chance
would give 33.3. That is 181 of 460, some 2.7 standard deviations out. It is
real, it is weak, and it will not carry you. Félag shuffles the choices at
every sitting so that what you learn is the matter itself and not the seat it
sat in.

## Sailing it

The site is plain static files. No build, no bundler, no dependencies.

```sh
python3 -m http.server 8765
```

Then make for `http://localhost:8765`.

## Forging the bank anew

Requires [uv](https://docs.astral.sh/uv/). The script declares its own
dependencies inline, after PEP 723, so there is nothing to install beforehand.

```sh
uv run tools/content.py all      # fetch the papers, then read them
uv run tools/content.py fetch    # fetch only
uv run tools/content.py extract  # read only
```

The source PDFs come to rest in `data/raw/` and are **never committed**. They
weigh 29MB, they are not ours, and they can always be fetched again. What is
kept is what was won from them.

`.github/workflows/content.yml` sails this course each month and raises a pull
request whenever SIRI lands a new paper. It never writes
`data/explanations.jsonl`, so words written by hand outlive every regeneration.
Should SIRI reword a stem, its id changes, and the extractor names the stranded
explanation **ORPHANED** rather than letting it drown quietly.

## The lay of the ship

```
index.html               the hull
css/app.css              tokens, the light of the hour, motion
js/cast.js               the six guides, one shared frame
js/scenes.js             scenes as data, drawn by one hand
js/app.js                state, routing, the quiz, the law
tools/content.py         uv script: fetch and extract
data/questions.jsonl     won from the papers, never edited by hand
data/explanations.jsonl  written by hand, joined by id
```

## The law of the Ting

Forty-five questions in forty-five minutes. Thirty-six correct to pass, **and**
no fewer than four of the five questions on Danish values.

The values gate stands apart. A traveller may answer well overall and still be
turned back at it alone. That is precisely where most are turned back, and so
Félag weighs it separately and says so plainly.

## Word of origin

The material and the past papers are published by
[Styrelsen for International Rekruttering og Integration (SIRI)](https://danskogproever.dk/borger/indfoedsretsproeve-statsborgerskab/forberedelse-til-indfoedsretsproeven/).

Félag is **not affiliated with SIRI, nor endorsed by them**. It is an
independent free study aid and claims no authority of its own. Trust the
official source above this one. Follow Danish news for the questions on current
affairs, for no fixed material can hold them.

*Kun spørgsmål der er stillet. Kun svar der er givet.*
