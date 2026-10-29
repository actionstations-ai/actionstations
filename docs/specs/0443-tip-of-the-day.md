# Spec 0443: Tip of the day

Issue: #443 · Milestone: 0.6.0 · Status: Draft · Depends on: none · Related: #442 (Projects screen banner), `docs/guides/`

## Summary

The Projects screen shows one short tip from a list shipped with the app, each tip linking to the guide section that explains it. The user can go to the next tip, hide the card until the next launch, or turn tips off. No network: the tips are a data file in the repository, and a test fails when a tip links to a guide heading that does not exist.

## Requirements

### User stories

- As a new user, I want to learn one feature at a time while I work, so that I find facility facts, repair, packs or facilitator mode without reading every guide.
- As an experienced user, I want to turn tips off once, so that they stop taking space.
- As a contributor, I want to add a tip by editing one data file, so that a new feature can be advertised with its guide in the same pull request.
- As a keyboard or screen-reader user, I want the tip card to be reachable and readable without stealing focus.

### Functional requirements

- **FR-1** Tips live in `src/shared/tips/tips.json`, an array validated by the zod schema `Tip` (`src/shared/tips/schema.ts`): `id` (`^[a-z0-9][a-z0-9-]{0,63}$`, unique, never reused), `text` (plain text, 1–220 characters, one or two sentences), `guide` (a repository path under `docs/guides/` ending in `.md`, with a required `#anchor`), `linkLabel` (optional, ≤ 40 characters, default "Read the guide"), `since` (optional app version that introduced the feature; tips with a `since` newer than the running app are skipped, so a tip can land with its feature).
- **FR-2** The Projects screen (`src/renderer/src/routes/projects/ProjectsPage.tsx`) shows a "Tip" card with the tip text, a link to the guide, **Next tip**, **Hide** and **Turn off tips**. It does not show during the setup wizard, and it sits below the update banner of #442 when both are present.
- **FR-3** Order: the app shows tips in file order, starting after the last one shown (`ui.tips.nextIndex`), wrapping at the end. Each launch shows the next tip, so a user sees a different tip each time. **Next tip** advances within the session and stores the position.
- **FR-4** **Hide** removes the card until the next launch. **Turn off tips** sets `ui.tips.enabled = false` and removes the card; a toast says "Tips are off. Turn them on again in Settings."
- **FR-5** **Settings → General** (beside the theme) has a switch "Show a tip on the Projects screen", on by default, which sets `ui.tips.enabled`.
- **FR-6** The guide link opens the guide section in the OS browser at the app's own version: `https://github.com/actionstations-ai/actionstations/blob/v<version>/<guide>#<anchor>`; unpackaged builds use `blob/main/`. The renderer passes the tip id to main, and main builds the URL from the bundled tip (the renderer never supplies a URL).
- **FR-7** A test (`src/shared/tips/tips.test.ts`) fails when: the file does not parse; an id repeats; a `guide` file does not exist; its anchor is not a heading slug of that file (computed with `headingSlugs` from `scripts/check-doc-links.mjs`, the same rule the local CI doc-link check uses); the text contains Markdown or HTML; there are fewer than 15 tips.
- **FR-8** The first release ships at least 20 tips covering: example projects, facility facts, lint warnings, search, ideas, the MSEL editor, improve a stage, repair a scenario, background jobs, facilitator mode, export and the players folder, keyboard and zoom, installing a pack, project copies of pack templates, exporting a pack, prompt layers, iterating on prompts, brand aliases, the project logo, routing tasks to providers, local tools setup, and the methodology's "every inject has a purpose".

### Non-functional requirements

- **NFR-1** Cost: none.
- **NFR-2** Privacy: tips are bundled; showing them makes no request. Following a guide link opens the user's browser, a navigation the user starts (Project rules 3).
- **NFR-3** Accessibility: WCAG 2.2 AA. The card is a `<section aria-labelledby>` with a visible "Tip" heading; it never takes focus on load and is not announced on load; after **Next tip** the new text is announced through `aria-live="polite"` on the text element and focus stays on the button; buttons have visible labels (no icon-only buttons); the link text names the guide ("Read: Repair a scenario"); no animation; contrast checked in light and dark themes; works at 200% zoom.
- **NFR-4** Offline: works offline; the link is the only part that needs a browser and network.
- **NFR-5** Size: the tips file stays under 20 KB; the card adds no measurable startup time (the JSON is bundled into the renderer).

### Out of scope

- An in-app guide viewer (see Open questions).
- Contextual tips on other screens, tips that depend on what the user has done, or any usage tracking to choose tips.
- Translated tips (tips follow the app's English UI; see #435 for player material).

## Design

### Data

`src/shared/tips/tips.json` (example):

```json
[
  {
    "id": "repair-scenario",
    "text": "A finished scenario with lint warnings can be repaired in place: the app rewrites only the rows and documents the warnings point at.",
    "guide": "docs/guides/getting-started.md#repair-a-scenario"
  },
  {
    "id": "pack-copies",
    "text": "A project keeps its own copy of every pack template it uses, so it still renders after the pack is updated or uninstalled.",
    "guide": "docs/guides/packs.md#projects-keep-their-own-copies"
  }
]
```

`src/shared/tips/index.ts` exports `TIPS` (parsed once at import with `z.array(Tip).parse`, so a malformed file fails the build and the unit tests) and `tipsFor(appVersion)`, which drops tips whose `since` is newer.

Settings (`src/shared/schemas/settings.ts`), inside `UiSettings`:

```ts
export const TipSettings = z.object({
  enabled: z.boolean().default(true),
  /** Index into the filtered tip list of the next tip to show. */
  nextIndex: z.number().int().min(0).default(0),
})
// UiSettings gains: tips: TipSettings.default({ enabled: true, nextIndex: 0 })
```

The position is an index, not a list of seen ids: adding tips to the end of the file keeps everyone's place, and an out-of-range index wraps to 0.

### IPC

- `settings:update` accepts `ui.tips` through the existing `patchOf(UiSettings)`.
- New channel in `src/shared/ipc/app.ts`: `'help:open-guide': channel(z.object({ tipId: z.string() }), z.void())`. The handler (`src/main/ipc/handlers/app.ts`) looks the tip up in `TIPS`, builds the URL from the guide path and `app.getVersion()` / `app.isPackaged`, and calls `shell.openExternal`. An unknown id is a `VALIDATION` error.

### Renderer

- `src/renderer/src/routes/projects/TipCard.tsx` and `tip-state.ts` (pure: `currentTip(tips, nextIndex)`, `advance(nextIndex, length)`), styles in `projects.css` using the existing card and button tokens.
- `ProjectsPage.tsx` renders `TipCard` when `settings.ui.tips.enabled` and the card was not hidden this session (component state). On mount it shows `TIPS[nextIndex % n]` and stores `nextIndex + 1` once per launch (guarded by a module-level flag so route changes do not advance it).
- `src/renderer/src/routes/settings/SettingsPage.tsx`: the switch.

### Docs

- `docs/guides/getting-started.md`: one sentence under Settings about tips and where to turn them off.
- `CONTRIBUTING.md`, Documentation: "When a feature adds or renames a guide section, add or update a tip in `src/shared/tips/tips.json`; `pnpm test` checks the anchors."
- Renaming a guide heading now fails a test if a tip links to it; the failure message names the tip id and the slugs that do exist.

## Security and privacy

- No network access from the app. The only external action is `shell.openExternal` on a URL built in main from bundled data, `https://github.com/...` only.
- The renderer cannot make main open an arbitrary URL through this channel: it sends a tip id.
- Tip text is rendered as plain text (React escaping), never as HTML or Markdown.

## Testing

- Unit: `src/shared/tips/tips.test.ts` (FR-7: schema, unique ids, guide file exists, anchor exists via `headingSlugs`, no Markdown/HTML, minimum count, `since` filtering); `tip-state.test.ts` (wrap, advance, out-of-range index); settings schema default for files without `ui.tips`.
- Main: handler test for `help:open-guide` with `shell.openExternal` mocked (packaged URL uses `blob/v<version>`, unpackaged uses `blob/main`, unknown id refused).
- Renderer (happy-dom): `TipCard.test.tsx` (Next, Hide, Turn off; focus stays on Next; `aria-live` region; link label).
- e2e (`e2e/tips.spec.ts`): the card shows on Projects after skipping the wizard, Next changes the text, Turn off persists across a relaunch, Settings switch brings it back, no request leaves the computer (`e2e/net-recorder.cjs`); axe check of the Projects screen in both themes. `e2e/tour.spec.ts` and `e2e/guide-screenshots.spec.ts` set `ui.tips.enabled = false` (or a fixed index) so screenshots stay stable.

## Tasks

1. **Data and test.** `src/shared/tips/{schema.ts,index.ts,tips.json,tips.test.ts}` with the first 20 tips; the test imports `headingSlugs` from `scripts/check-doc-links.mjs`.
2. **Settings and IPC.** `TipSettings` in `src/shared/schemas/settings.ts`; `help:open-guide` in `src/shared/ipc/app.ts` and `src/main/ipc/handlers/app.ts`; tests.
3. **Card and settings switch.** `src/renderer/src/routes/projects/{TipCard.tsx,tip-state.ts,projects.css}`, `ProjectsPage.tsx`, `src/renderer/src/routes/settings/SettingsPage.tsx`; component tests.
4. **e2e, screenshots and docs.** `e2e/tips.spec.ts`; stabilize `e2e/tour.spec.ts` and `e2e/guide-screenshots.spec.ts`; Getting started and CONTRIBUTING lines; CHANGELOG.

## Open questions

1. **Open guides on GitHub or ship them with the app?** Recommendation: GitHub at the app's version tag for 0.6.0; it is the one place the guides render with their images today. An offline in-app guide viewer (render `docs/guides/*.md` with the app's Markdown renderer from `app-resources/`) is a separate issue; when it lands, `help:open-guide` switches to it and the tips file does not change.
2. **Random or sequential order?** Recommendation: sequential, so every user eventually sees every tip and the order can put the basics first.
3. **Keep tips on for users who finished the wizard long ago?** Recommendation: yes, on by default for everyone; the card is small and turns off in one click.
