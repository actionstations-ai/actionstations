# ADR-0174: The Packs screen and the site catalog are a store, grouped by one shared file

Status: accepted (2026-11-14, #1152)

## Context

With 60 included packs and 44 catalog packs, the Packs screen listed every included pack as a long card before anything else, and Browse was a flat grid with dropdown filters for kind, domain id and tag. Finding a field, seeing what a pack holds, or seeing that a field's domain pack, toolkit and reference library belong together was hard. The website's catalog had the same shape.

## Decision

- **One store.** Included, installed and catalog packs are one list (`store-model.ts`), each with a state: On / Off / Always on, Installed, Update, Get, Needs repair. A catalog entry newer than an installed pack counts as an update even before the update check lists it; included packs update with the app only.
- **Groups come from a shared file**, `src/shared/packs/store.json`: eight categories that each list their domain ids, a map from toolkit packs (which have no domain) to their field, and the featured row. A pack's kind is derived from its contents (domains → field, toolkits → toolkit, documents only → reference library, else templates; Core is its own kind). The site copies the file at release (`import-bundled`), so the app and the site group packs the same way. A unit test fails if an included pack lands in no category.
- **Layout.** Discover (search, category and kind chips, featured row, a shelf per category) and Your packs (compact rows with the On switch, updates and problems first). Each pack has a page: main action, stats, contents folded by kind, description, the other packs of its field, details. Tab, open pack and filters live in the URL query; `?tab=installed` and `?tab=browse` still open the matching tab.
- **Unchanged.** Every install still goes through the review (ADR-0018); catalogs are still fetched only when Discover opens or on Refresh; nothing is sorted by endorsements.

## Consequences

- A new field must add its domain to a category in `store.json` (and a toolkit pack its field), or the test fails.
- Tile icons are monograms on a category color (`--store-<category>-bg/fg` tokens), not artwork, so packs need no icon files.
