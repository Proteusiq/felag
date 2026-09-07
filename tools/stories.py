#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Check that every authored learning story is whole and source-backed."""

from __future__ import annotations

import json
from pathlib import Path

BANK = Path("data/questions.jsonl")
STORIES = Path("data/stories.jsonl")
MATERIAL_PAGES = 246


def rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text("utf-8").splitlines() if line.strip()]


def main() -> int:
    questions = {question["id"] for question in rows(BANK)}
    stories = rows(STORIES)
    faults: list[str] = []
    seen: set[str] = set()

    for story in stories:
        story_id = story.get("id")
        if not story_id or story_id in seen:
            faults.append(f"duplicate or missing story id: {story_id!r}")
            continue
        seen.add(story_id)

        missing = set(story.get("questions", [])) - questions
        if missing:
            faults.append(f"{story_id}: missing questions {sorted(missing)}")

        for kind in ("sections", "moments"):
            parts = story.get(kind, [])
            if not parts:
                faults.append(f"{story_id}: no {kind}")
            for index, part in enumerate(parts, 1):
                pages = part.get("pages", [])
                if not pages or any(not 1 <= page <= MATERIAL_PAGES for page in pages):
                    faults.append(f"{story_id}: {kind} {index} has invalid pages {pages}")

    if faults:
        print("\n".join(faults))
        return 1
    print(f"{len(stories)} stories, {sum(len(story['sections']) for story in stories)} cited sections, no faults")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
