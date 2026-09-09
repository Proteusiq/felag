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
FURTHER = Path("data/further.json")
MATERIAL_PAGES = 246


def rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text("utf-8").splitlines() if line.strip()]


def main() -> int:
    questions = {question["id"] for question in rows(BANK)}
    stories = rows(STORIES)
    further = json.loads(FURTHER.read_text("utf-8"))
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

    for story_id, links in further.items():
        if story_id not in seen:
            faults.append(f"further reading has unknown story id: {story_id}")
            continue
        if not isinstance(links, list):
            faults.append(f"{story_id}: further reading is not a list")
            continue
        if any(not isinstance(link, dict) for link in links):
            faults.append(f"{story_id}: invalid further-reading record")
            continue
        labels = [link.get("label") for link in links]
        urls = [link.get("url") for link in links]
        if not links or any(not label for label in labels):
            faults.append(f"{story_id}: invalid further-reading labels")
        if any(not url or not url.startswith("https://") for url in urls):
            faults.append(f"{story_id}: invalid further-reading URL")
        if len(labels) != len(set(labels)) or len(urls) != len(set(urls)):
            faults.append(f"{story_id}: duplicate further-reading link")

    if faults:
        print("\n".join(faults))
        return 1
    link_count = sum(len(links) for links in further.values())
    print(f"{len(stories)} stories, {sum(len(story['sections']) for story in stories)} cited sections, {link_count} further-reading links, no faults")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
