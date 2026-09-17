#!/usr/bin/env python3
"""Extracts every example response in Docs/api-v1.md into
MarqueeTests/Fixtures/api/*.json, which APIFixtureTests decodes with the DTOs.

Run from the repo root after the doc changes:  Scripts/extract-api-fixtures.py

The doc's examples are written for people, so a few placeholders are filled in
to make them valid JSON (each one is listed in NORMALIZE):
  - /* TitleCard … */ and /* HouseholdMember */ comments become that shape's
    own example from the doc, so the containing list decodes a real element;
  - an elided id ("83c55a49-…") becomes the full id the doc uses elsewhere.
Everything else is kept byte-for-byte, including "…" inside strings.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOC = os.path.join(ROOT, "Docs", "api-v1.md")
OUT = os.path.join(ROOT, "MarqueeTests", "Fixtures", "api")

# One name per ```json block, in document order, with the heading it must sit
# under (so a doc edit that adds or moves an example fails loudly here).
BLOCKS = [
    ("`TitleCard`", ["title-card"]),
    ("`PersonCard`, `CompanyCard`, `NetworkCard`", ["person-card", "company-card", "network-card"]),
    ("`RequestPerson`", ["request-person"]),
    ("`GET /server-info`", ["server-info"]),
    ("`POST /auth/login`", ["auth-login"]),
    ("`POST /auth/logout`", ["ok"]),
    ("`GET /me`", ["me"]),
    ("`GET /badges`", ["badges"]),
    ("`GET /discover`", ["discover"]),
    ("`GET /movies` and `GET /series`", ["browse-page"]),
    ("`GET /movies/extras` and `GET /series/extras`", ["browse-extras"]),
    ("`POST /surprise`", ["surprise"]),
    ("`GET /search?q=`", ["search"]),
    ("`GET /search/suggest?q=`", ["search-suggest"]),
    ("`GET /titles/{type}/{tmdbId}`", ["title-detail"]),
    ("`GET /titles/tv/{tmdbId}/seasons/{seasonNumber}`", ["season-episodes"]),
    ("`GET /titles/{type}/{tmdbId}/status`", ["title-status"]),
    ("`POST /titles/{type}/{tmdbId}/add`", ["title-add"]),
    ("`POST /titles/{type}/{tmdbId}/search`", ["title-search"]),
    ("`PUT /titles/{type}/{tmdbId}/monitored`", ["title-monitored"]),
    ("`POST /titles/{type}/{tmdbId}/relink`", ["title-relink"]),
    ("`GET /people/{tmdbId}`", ["person-detail"]),
    ("`GET /companies/{tmdbId}`", ["company-detail"]),
    ("`GET /favorites`", ["favorites"]),
    ("`GET /favorites/{entityType}/{tmdbId}`", ["favorite-state"]),
    ("`POST /favorites/{entityType}/{tmdbId}/toggle`", ["favorite-toggle"]),
    ("`POST /titles/{type}/{tmdbId}/request`", ["request-created"]),
    ("`GET /requests/mine`", ["requests-mine"]),
    ("`GET /requests/pending`", ["requests-pending"]),
    ("`GET /requests/history`", ["requests-history"]),
    ("`GET /requests/pending-count`", ["requests-pending-count"]),
    ("`POST /requests/approve-all`", ["requests-approve-all"]),
    ("`GET /notifications`", ["notifications"]),
    ("`GET /notifications/unread-count`", ["notifications-unread-count"]),
    ("`GET /calendar`", ["calendar"]),
    ("`GET /settings/activity`", ["activity"]),
    ("Settings — Account & household members", ["household-member"]),
    ("`GET /users`", ["users"]),
    ("`PATCH /users/{id}`", ["user-update"]),
    ("`GET /settings/integrations`", ["integrations"]),
    ("`POST /settings/integrations/webhook-secret`", ["webhook-secret"]),
    ("`PUT /settings/integrations/{provider}`", ["arr-connect"]),
    ("`GET /settings/integrations/{provider}/options`", ["arr-options"]),
    ("`POST /settings/integrations/plex/pin`", ["plex-pin-start"]),
    ("`GET /settings/integrations/plex/pin/{pinId}`", ["plex-pin-waiting"]),
    ("`GET /settings/integrations/plex/pin/{pinId}`", ["plex-pin-connected"]),
    ("`POST /settings/integrations/trakt/import`", ["trakt-import"]),
    ("`GET /settings/jobs`", ["jobs"]),
    ("`GET /settings/about`", ["about"]),
    ("`GET /changelog`", ["changelog"]),
    ("`GET /help/errors`", ["help-errors"]),
]

# Prose examples that aren't in a code block.
INLINE = {
    # Deviation 7: the error body every TMDb-backed endpoint answers without TMDb.
    "error-upstream": re.compile(r'`502 (\{"code":"upstream".*?\})`'),
}


def blocks(markdown):
    heading, inside, lines = None, False, []
    for line in markdown.split("\n"):
        if not inside and re.match(r"^#{2,4} ", line):
            heading = line
        elif line.strip() == "```json":
            inside, lines = True, []
        elif inside and line.strip() == "```":
            inside = False
            yield heading, "\n".join(lines)
        elif inside:
            lines.append(line)


def main():
    markdown = open(DOC, encoding="utf-8").read()
    found = list(blocks(markdown))
    if len(found) != len(BLOCKS):
        sys.exit(f"Docs/api-v1.md has {len(found)} JSON examples; this script knows {len(BLOCKS)}. Update BLOCKS.")

    raw = {}
    for (heading, text), (expected, names) in zip(found, BLOCKS):
        if expected not in heading:
            sys.exit(f"Expected an example under {expected!r}, found one under {heading!r}. Update BLOCKS.")
        parts = [line for line in text.split("\n") if line.strip()] if len(names) > 1 else [text]
        if len(parts) != len(names):
            sys.exit(f"{expected}: expected {len(names)} one-line examples, found {len(parts)}.")
        for name, part in zip(names, parts):
            raw[name] = part
    for name, pattern in INLINE.items():
        match = pattern.search(markdown)
        if not match:
            sys.exit(f"Inline example {name} not found.")
        raw[name] = match.group(1)

    title_card = raw["title-card"].strip()
    member = raw["household-member"].strip()
    indent = lambda text, pad: text.replace("\n", "\n" + pad)

    NORMALIZE = [
        # A list of cards: one real card instead of the comment.
        (re.compile(r"\[ /\* TitleCard[^*]*\*/ \]"), lambda m: "[ " + indent(title_card, "    ") + " ]"),
        (re.compile(r"\[ /\* HouseholdMember \*/ \]"), lambda m: "[ " + indent(member, "    ") + " ]"),
        (re.compile(r"\{ /\* HouseholdMember \*/ \}"), lambda m: indent(member, "  ")),
        (re.compile(r'"83c55a49-…"'), lambda m: '"83c55a49-6153-4cb9-ae22-4a42d48f4cf3"'),
    ]

    os.makedirs(OUT, exist_ok=True)
    for existing in os.listdir(OUT):
        if existing.endswith(".json"):
            os.remove(os.path.join(OUT, existing))
    for name, text in raw.items():
        for pattern, replacement in NORMALIZE:
            text = pattern.sub(replacement, text)
        try:
            value = json.loads(text)
        except json.JSONDecodeError as error:
            sys.exit(f"{name}: still not valid JSON after normalizing ({error}):\n{text}")
        with open(os.path.join(OUT, name + ".json"), "w", encoding="utf-8") as file:
            json.dump(value, file, ensure_ascii=False, indent=2)
            file.write("\n")
    print(f"Wrote {len(raw)} fixtures to {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
