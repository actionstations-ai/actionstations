# Spec 0441: Community pack catalog with contributor credit

Issue: #441 · Milestone: 0.9.0 · Status: Draft · Depends on: none · Related: ADR-0018 (packs), ADR-0020 (bundled packs), #400 (pack files on the `packs` release), `docs/packs-format.md`

## Summary

The official pack catalog at actionstations.ai grows from packs the project builds into a community library. Packs name everyone who made them (`contributors` in `pack.json`), the site gets contributor pages, and each pack shows endorsements: a count of GitHub reactions and a short list of organizations that used it, gathered when the site is built, so visitors and the app are never tracked. Anyone can submit a pack through an issue form on the public `actionstations-ai/packs` repository; maintainers run the existing validators and a written review checklist, then publish. Everything stays on free GitHub features and the static site.

## Current state (checked 2026-10-28)

- Pack files are assets of the `packs` release of the public repository `actionstations-ai/packs` (issues and discussions are turned off there). The catalog and site live in the private repository `actionstations-ai/actionstations-site` (Astro, GitHub Pages, built and deployed from the owner's machine with `scripts/deploy.sh`, no Actions).
- `/packs/share/` describes pull requests to the site repository, but because the repository is private (`siteRepoPublic: false` in `src/config/site.ts`) it tells contributors to email the licensing address instead.
- `pack.json` has one `author` (`name`, `url`, `email`). Unknown top-level fields are ignored by the app's reader, and the catalog entry schema (`PackCatalogEntry`, a non-strict `z.object`) drops unknown fields, so new optional fields need no format version bump.
- Validation exists twice: the site's `scripts/validate-pack.mjs` (a port of the format rules) and the app's `scripts/pack-validate.mjs` (the app's own reader with every zod schema).
- All 25 catalog packs today are `ai.actionstations.*`.

## Requirements

### User stories

- As a county emergency manager who built a good set of templates, I want to share them and be credited by name, so that my work helps other agencies and my agency gets recognition.
- As a translator or reviewer of someone else's pack, I want to be listed too, so that contributions other than authorship count.
- As a planner browsing the catalog, I want to see who made a pack, whether the project reviewed it, and whether other organizations used it, so that I can judge it before installing.
- As a privacy-conscious visitor, I want endorsements and ratings that do not track me or require an Action Stations account.
- As a maintainer, I want a submission flow that costs nothing, keeps binaries out of git history, and reuses the validators we already have.

### Functional requirements

**Credit**

- **FR-1** `pack.json` gains optional `contributors`: up to 50 entries of `{ name (1–200), url? (http/https), github? (GitHub user name, `^[A-Za-z0-9][A-Za-z0-9-]{0,38}$`), roles: one or more of `author`, `templates`, `prompts`, `documents`, `examples`, `translation`, `review` }`. `author` stays required and is the credited owner. `author` gains an optional `github` field with the same rule.
- **FR-2** Emails in `author.email` are never published on the site or shown in the catalog index; the catalog builder drops them.
- **FR-3** Catalog entries carry `contributors` (names, urls, github, roles) and a `source` field: `official` for `ai.actionstations.*` ids, `community` otherwise. The site and the app show a **Community** or **Official** label.
- **FR-4** The site gets `/packs/contributors/`: every person or organization credited in any catalog pack, alphabetical, each with their packs and roles, and a link to their `url` or GitHub profile. Pack pages (`/packs/<id>/`) list contributors under the author. No avatars or other third-party images (the site's CSP allows same-origin images only).
- **FR-5** The app's Packs screen (`BrowseTab.tsx`, `PackReview.tsx`, `InstalledTab.tsx`) shows the author, "and N contributors" with the full list in the details, and the Official/Community label.
- **FR-6** The app's **Export as pack** dialog (`src/renderer/src/routes/pack-export/`) gets a contributors editor (name, url, GitHub user, roles).

**Endorsements**

- **FR-7** Each community pack has a GitHub issue in `actionstations-ai/packs`, labelled `pack` and titled with the pack id, opened by a maintainer when the pack is published. A thumbs-up reaction on that issue is an endorsement. Comments there are the pack's public feedback thread.
- **FR-8** At site build, `scripts/fetch-endorsements.mjs` (site repository) reads the reaction counts and the issue URL for every pack through `gh api` on the owner's machine and writes `packs/endorsements.json` (`{ id, issue, thumbsUp, fetchedAt }`). A failed fetch keeps the previous file and prints a warning; the build never fails because of it.
- **FR-9** **Used by**: a curated list per pack in `packs/used-by/<id>.json` (`{ org, kind: 'agency' | 'utility' | 'school' | 'company' | 'other', date (YYYY-MM), note? (≤ 200), link? }`), added by a maintainer only after the organization confirms by an issue comment or email. Shown on the pack page as "Used in exercises by".
- **FR-10** The catalog entry gains `endorsements: { thumbsUp, usedBy: number, url, asOf }`. The app shows "N endorsements on GitHub · used by M organizations (as of date)" with the issue link opening in the browser. The app never fetches the counts itself: it reads them from the catalog it already downloads on Browse or Refresh.
- **FR-11** No star ratings, download counts per user, cookies, or forms on the site for endorsements. The site's existing analytics setting does not change because of this feature.

**Submission and review**

- **FR-12** `actionstations-ai/packs` gets Issues turned on, an issue form `.github/ISSUE_TEMPLATE/submit-pack.yml` ("Submit a pack"), and a `CONTRIBUTING.md`. The form asks for: pack id and version, the HTTPS URL of the `.aspack` (a release asset in the contributor's own public repository, or any public HTTPS host), its SHA-256, what the pack is for, the domains, the license, and checkboxes: "I have the right to distribute every file under the stated licenses", "Organizations, people and private businesses in examples and previews are fictional", "Documents are public domain or openly licensed and listed with their license", "I ran `node scripts/validate-pack.mjs` (or the app's Export as pack) and it passed". Blank issues are turned off; a second form "Endorse or report a pack" covers the rest.
- **FR-13** The `.aspack` is never attached to the issue or committed to the public repository by the contributor; it stays at the contributor's URL until a maintainer accepts it. On acceptance the maintainer downloads it, checks the SHA-256, copies it to the site repository's `packs/files/`, and `scripts/deploy.sh` uploads it to the `packs` release as today (`publish-pack-files.mjs`).
- **FR-14** Review flow, written in the packs repository's `REVIEWING.md` and run by a maintainer on their machine with `scripts/review-submission.mjs` (site repository): download with a size cap, verify SHA-256, run `scripts/validate-pack.mjs` and the app's `scripts/pack-validate.mjs --app-version <current>`, render the pack's template previews with `pnpm test:templates --pack <folder>` (app repository) to look at every template, and print a checklist: license allows redistribution, fictional organizations and people, no real street addresses, documents' sources and licenses, prompts free of instructions to exfiltrate or to ignore the app's rules, quality against `reference/scenario-3/` where it applies. Labels: `submission`, `needs-changes`, `accepted`, `declined`.
- **FR-15** Accepted community packs get `review: { reviewedAt, appVersion }` in their catalog entry, and the site shows "Reviewed for app X.Y". A new version of a community pack is a new submission (same issue thread is fine) and is reviewed again.
- **FR-16** Ownership of an id: the first accepted submission of a pack id records its submitter's GitHub user in `packs/owners.json` (site repository). Later versions of that id are accepted only from that user or a user they name in the issue. Ids under `ai.actionstations.` are reserved for the project.
- **FR-17** `/packs/share/` is rewritten around the issue form: make the pack, host the file, open the "Submit a pack" issue, what review checks, how credit and endorsements work. The email fallback stays for people without a GitHub account.

### Non-functional requirements

- **NFR-1** Cost: GitHub issues, issue forms, reactions and release assets on a public repository are free; the site stays on Pages; no Actions, no bots, no third-party service (Project rules 1).
- **NFR-2** Privacy: the app sends nothing new; endorsements are read at build time on the maintainer's machine; the site adds no cookie, script or third-party request; contributor emails are not published (Project rules 3).
- **NFR-3** Accessibility: new site pages pass `pnpm check:site` (axe WCAG A/AA, 375/768/1440 px, light and dark); the app's new labels and lists meet WCAG 2.2 AA.
- **NFR-4** Compatibility: older apps ignore the new `pack.json` and catalog fields; packs with `contributors` install on 0.3.0+.
- **NFR-5** Safety: community packs pass the same reader, template checker and limits as every pack; review is a human step on top, never a replacement.

### Out of scope

- Accounts, logins or user profiles on actionstations.ai.
- Paid packs, donations or revenue sharing.
- Automatic publishing without a maintainer.
- Signing packs (integrity remains hashes only, ADR-0018; signing is a separate decision).
- Making the site repository public (see Open questions).

## Design

### Format (app repository)

`src/shared/schemas/pack.ts`:

```ts
export const GitHubUser = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/)
export const ContributorRole = z.enum([
  'author',
  'templates',
  'prompts',
  'documents',
  'examples',
  'translation',
  'review',
])
export const PackContributor = z.object({
  name: z.string().min(1).max(200),
  url: HttpUrl.optional(),
  github: GitHubUser.optional(),
  roles: z.array(ContributorRole).min(1).max(7),
})
// PackAuthor gains github: GitHubUser.optional()
// PackManifestShape gains contributors: z.array(PackContributor).max(50).default([])
// PackCatalogEntry gains:
//   contributors: z.array(PackContributor).max(50).default([]),
//   source: z.enum(['official', 'community']).optional(),
//   endorsements: z.object({ thumbsUp: z.number().int().min(0), usedBy: z.number().int().min(0),
//                            url: HttpUrl, asOf: IsoDateTime }).optional(),
//   review: z.object({ reviewedAt: IsoDateTime, appVersion: SemVer }).optional(),
```

`docs/packs-format.md` documents the fields (with an `example:pack` block that `pack.test.ts` parses). `formatVersion` stays 1 and `catalogVersion` stays 1, because both readers ignore unknown fields.

`source` in the catalog is informational; the app derives the label from the id prefix itself (`ai.actionstations.`) so a catalog cannot claim "official" for another id.

### App

- `src/main/packs/export.ts` and `src/shared/ipc/pack-export.ts`: contributors in the export request.
- `src/renderer/src/routes/pack-export/`: `ContributorsEditor.tsx`.
- `src/renderer/src/routes/packs/{BrowseTab,PackReview,InstalledTab}.tsx`, `pack-format.ts`: credit line, label, endorsements line (text only, link through the existing external-link handling).
- Search in Browse matches contributor names (`pack-format.ts`).

### Site repository (`~/Code/actionstations-site`)

- `scripts/lib/pack.mjs`: the port gains `contributors`, `author.github`; `tests/validate-pack.test.mjs` cases.
- `scripts/build-catalog.mjs`: copies `contributors`, drops `author.email`, sets `source`, merges `packs/endorsements.json`, `packs/used-by/*.json` and `review` from `packs/reviews.json`; `tests/build-catalog.test.mjs`.
- `scripts/fetch-endorsements.mjs` (FR-8), called by `scripts/deploy.sh` before `pnpm build`; `DRY_RUN=1` and an `--offline` flag keep the old file.
- `scripts/review-submission.mjs` (FR-14): takes the issue number, reads the form fields with `gh issue view --json body`, downloads with a 200 MB cap over https only, verifies the hash, runs both validators (path to the app repository from `ACTIONSTATIONS_APP_DIR`), unpacks to a temp folder for `pnpm test:templates --pack`, prints the checklist.
- `packs/owners.json`, `packs/reviews.json`, `packs/used-by/<id>.json`, `packs/endorsements.json`, each with a small zod or hand-written validator in the build.
- Pages: `src/pages/packs/[id].astro` (contributors, label, endorsements, used by, reviewed for), `src/components/PackCard.astro` (label, credit line), new `src/pages/packs/contributors.astro`, rewritten `src/pages/packs/share.astro`; `src/config/site.ts` gains `packsRepo` and the issue form URL.

### Packs repository (`actionstations-ai/packs`, public)

- Owner action: `gh repo edit actionstations-ai/packs --enable-issues`.
- Files: `.github/ISSUE_TEMPLATE/submit-pack.yml`, `.github/ISSUE_TEMPLATE/endorse-or-report.yml`, `.github/ISSUE_TEMPLATE/config.yml` (blank issues off, link to `/packs/share/`), `README.md` (what the repository is), `CONTRIBUTING.md`, `REVIEWING.md`, labels created with `gh label create`. No workflows.

## Security and privacy

| Threat                                                                               | Mitigation                                                                                                                                                               |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Malicious pack (script in a template, zip bomb, path traversal, regex DoS)           | Same reader, template checker, schema regex rule and limits as every pack; review renders previews in the app's sandbox; maintainers never open pack content outside it. |
| Prompt injection in community prompts (instructions to ignore rules, leak documents) | Review checklist item; pack prompts are scoped by domain (ADR-0018) and shown as replacing a built-in prompt in the review screen.                                       |
| Copyrighted or private documents                                                     | Submission checkboxes, per-document license in `pack.json`, reviewer check of each source; declined if unclear.                                                          |
| Real organizations or people in examples                                             | Checklist item and existing `"fictional": true` rule for examples.                                                                                                       |
| Impersonation of the project or of another author                                    | `ai.actionstations.` ids reserved; Official label derived from the id in the app; id ownership in `owners.json`.                                                         |
| Endorsement gaming                                                                   | Counts are labelled as GitHub reactions with a date; "Used by" entries need confirmation; no ranking by endorsements in the app.                                         |
| Tracking visitors or app users                                                       | Counts are fetched at build time by the maintainer; no client-side calls; no new cookies; app reads counts only from the catalog it already fetches on user action.      |
| Contributor email harvesting                                                         | `author.email` dropped from the catalog and never rendered on the site.                                                                                                  |
| Submission URL pointing at an internal host                                          | `review-submission.mjs` accepts https only and refuses local and private addresses with the app's `isLocalNetworkUrl` rule (ported).                                     |

## Testing

- App unit: schema tests for `PackContributor`, `GitHubUser`, catalog fields; an old catalog and old `pack.json` still parse; a catalog with `source: 'official'` on a non-`ai.actionstations.` id still shows Community; `pack.test.ts` parses the new `docs/packs-format.md` example; export with contributors round-trips through `readPack`.
- App renderer: Browse, Review and Installed show credit, label and endorsements; search by contributor name.
- App e2e: `e2e/packs.spec.ts` local catalog fixture gains a community entry with contributors and endorsements; assert the labels and that no request leaves loopback.
- Site: `node:test` cases for the validator port, catalog builder merges (emails dropped, endorsements merged, missing endorsements file tolerated), `fetch-endorsements.mjs` with a stubbed `gh`, `review-submission.mjs` URL rules and hash mismatch; `pnpm check:site` on the new and changed pages.
- Manual: one dry-run submission end to end on the packs repository with a test pack, recorded in `REVIEWING.md`.

## Tasks

1. **Format fields (app).** `src/shared/schemas/pack.ts`, `docs/packs-format.md`, `src/shared/schemas/pack.test.ts`, `scripts/pack-validate.mjs` output lists contributors.
2. **App display and export.** `src/renderer/src/routes/packs/{BrowseTab,PackReview,InstalledTab,pack-format}.ts(x)`, `src/renderer/src/routes/pack-export/ContributorsEditor.tsx`, `src/main/packs/export.ts`, `src/shared/ipc/pack-export.ts`; tests; `docs/guides/packs.md` (credit, labels, endorsements); e2e fixture.
3. **Site format and catalog.** `scripts/lib/pack.mjs`, `scripts/build-catalog.mjs`, `packs/{owners,reviews}.json`, tests (site repository).
4. **Site pages.** `src/pages/packs/[id].astro`, `src/components/PackCard.astro`, `src/pages/packs/contributors.astro`, `src/config/site.ts`; `pnpm check:site`.
5. **Endorsements.** `scripts/fetch-endorsements.mjs`, `packs/used-by/`, `scripts/deploy.sh` step, build merge, tests.
6. **Submission flow.** Packs repository: issue forms, `config.yml`, `README.md`, `CONTRIBUTING.md`, `REVIEWING.md`, labels, Issues on (owner). Site: `scripts/review-submission.mjs` with tests; rewritten `src/pages/packs/share.astro`.
7. **Launch.** Open the endorsement issues for the existing packs (official packs get them too, for feedback), dry-run submission, blog post draft in `src/content/blog/`, CHANGELOG entry in the app.

## Open questions

1. **Submit through the public packs repository or make the site repository public?** Recommendation: the packs repository. It is already public, holds no site code or analytics configuration, and the issue form keeps `.aspack` binaries out of git history and Git LFS (which has bandwidth limits on the free plan). Revisit if contributors ask to edit pages themselves.
2. **Reactions as endorsements need a GitHub account.** Is that acceptable for "no accounts"? Recommendation: yes; it is no Action Stations account and nothing is tracked by us. The "Used by" list and the email fallback cover people without GitHub.
3. **Should the app sort or filter by endorsements?** Recommendation: no sorting by count in 0.9.0 (low numbers are noisy and invite gaming); show the counts and add a "Community / Official" filter.
4. **Licenses accepted for community packs.** Recommendation: only licenses that allow redistribution by the catalog (CC0, CC-BY-4.0, CC-BY-SA-4.0, MIT, Apache-2.0, or `LicenseRef-` with a text the reviewer approves); no NonCommercial licenses in the official catalog, since agencies' use is often hard to classify.
5. **Who may review?** Recommendation: maintainers only at first; credit outside reviewers with the `review` role when they help, and add trusted reviewers by name in `REVIEWING.md` later.
