# ADR-0018: Packs — installable content bundles

Date: 2026-10-23 · Status: Accepted · Format: [docs/packs-format.md](../packs-format.md) · Schemas: `src/shared/schemas/pack.ts` · Milestone: 0.3.0 Packs (epic #274)

## Context

Everything the app generates with comes from files it already loads in layers: inject templates (`templates/injects/<type>/`, ADR-0008), prompts (`prompts/` < `userData/prompts/` < `<project>/prompts/`), domain profiles (thirteen built-ins in `src/shared/domains/` plus `project.domainProfileOverrides`, ADR-0014), ComfyUI workflows (`comfy/workflows/` < `userData/comfy/workflows/` < `<project>/comfy/workflows/`), documents imported into a project (`documents:import`), and example projects copied out of `examples/` (`examples:open`). Users want more of each without a new app release (an extended social media set, an industry domain with its standard documents, tuned workflows) and want to share what they built. The app is local-first: no network except providers and downloads the user configured, and the one existing download (the Hugging Face embedding model) runs only on an explicit click and checks pinned sha256 values (#212).

## Decision

**Format.** A pack is a zip `<id>-<version>.aspack` with `pack.json` at the root (formatVersion 1, reverse-DNS `id`, semver `version`, `minAppVersion`, SPDX `license`, `contents` by kind, a `documents[]` license entry per document, and `files[]` with the sha256 and size of every other file). Six kinds, one folder each: `templates/ prompts/ domains/ workflows/ documents/ examples/`. Field tables, path rules and limits are in docs/packs-format.md.

**Integrity: hashes only.** The catalog entry carries the archive's sha256; `pack.json` carries every file's sha256. An archive whose hash differs from the catalog, or a file whose hash or size differs from `pack.json`, is refused, and so is any archive entry `files[]` does not list. A file installed from disk or from a pasted URL has no catalog hash: the review shows its sha256 so the user can compare it with the publisher's page (and a URL install may take an expected sha256). Nothing is signed; trusting a catalog means trusting whoever runs it. The installed record keeps the archive hash and a content hash (sha256 of the sorted `"<sha256>  <path>\n"` lines).

**No executable content, enforced by the reader (`src/main/packs/`), not by convention.**

- Allow-list of folders and lowercase extensions per kind (no `.js`, `.svg`, `.html` other than `template.html`, `.sqlite`, binaries, macro formats); root files by exact name.
- Paths: relative POSIX, no `..`/`.`/empty segments, no backslash, control character, drive letter or leading `/`, no Windows reserved names, NFC, unique ignoring case, length and depth caps. Every write goes through `safeJoin` into a staging folder, and the staged tree is re-checked with `realpath`.
- Zip: an archive must have one reading (its bytes fully accounted for by its headers, local and central headers agreeing, see docs/packs-format.md, #303); entries with a symlink mode, encryption, or a name the path rules refuse are fatal; byte counts are measured while inflating (not taken from headers) against per-file, total, file-count and compression-ratio limits (zip bombs); the archive itself is capped at 200 MB.
- Templates are rejected, not stripped, if their HTML has `<script>`, `<iframe>`, `<object>`, `<embed>`, `<base>`, `<form>`, `<link>`, `<meta http-equiv>`, `on*` attributes, a URL with any scheme other than `data:image|font`, or a non-local reference; CSS with `@import`, remote `url()` or `expression(`; Handlebars triple-stash or partials. Rejection keeps the author's file and the site validator identical; stripping would change what the author tested. The render window's CSP (`default-src 'none'`) and network block (ADR-0008) remain the second layer. The same check runs when a pack, user or project template is loaded, since project folders are shared too.
- Prompt frontmatter must be YAML. gray-matter evaluates `---js` frontmatter with `eval`; the app disables every engine but YAML for all prompt layers (#257).
- JSON content is parsed with the app's existing schemas (`TemplateMeta`, `DomainProfile`, `PromptFrontmatter`, `WorkflowSidecar` + `parseApiWorkflow`, `ExampleManifest`, `Project`). ComfyUI workflows cannot be vetted beyond that: the review lists the node classes outside ComfyUI core ("needs custom nodes"), because custom nodes run code on the user's ComfyUI server.

**Install location.** `userData/packs/<id>/<version>/` holds the verified files, read-only; `userData/packs/registry.json` records `{ id, version, enabled, installedAt, source: file | url | catalog(url), archiveSha256, contentSha256 }`. Install extracts to `userData/packs/.staging/<random>/`, verifies, renames into place, then writes the registry atomically; a failure leaves nothing behind. One version per id is active; update installs the new version beside the old one, switches the registry, then removes the old folder. Disable keeps the files and removes the pack's layer. `minAppVersion` above the running app, or a `formatVersion` it does not know, is refused before content is read.

**Registration per kind, precedence project > user > pack > built-in.**

| Kind      | Project                                                | User                                       | Pack                                                                    | Built-in              |
| --------- | ------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------- | --------------------- |
| templates | `<project>/templates/injects/<type>/` (new)            | `userData/templates/injects/<type>/` (new) | enabled packs                                                           | `templates/injects/`  |
| prompts   | `<project>/prompts/`                                   | `userData/prompts/`                        | enabled packs whose `domains` is empty or contains the project's domain | `prompts/`            |
| workflows | `<project>/comfy/workflows/`                           | `userData/comfy/workflows/`                | enabled packs                                                           | `comfy/workflows/`    |
| domains   | `project.domainProfileOverrides` on a project snapshot | –                                          | enabled packs                                                           | `src/shared/domains/` |
| documents | copied into the project by `documents:import`          | –                                          | listed under "Add from pack"                                            | –                     |
| examples  | –                                                      | –                                          | listed in the gallery                                                   | `examples/`           |

- Ids are the existing ones: template `type`, prompt name, workflow id, domain id, example slug. A pack item with a built-in id shadows the built-in (the review says "replaces built-in tweet template"), except domains: a pack may not reuse a built-in domain id or alias, because that would silently change fact extraction and lints of existing projects; per-project changes already have `domainProfileOverrides`.
- Pack prompts may only use names of prompts the app ships (each is a pipeline stage); they apply only to projects in the pack's `domains`, so a rail pack does not change a hospital exercise.
- Two enabled packs may not provide the same kind and id (templates, prompts, workflows, domains; documents and examples are always addressed with their pack id and never conflict, #260). The second installs disabled and the Packs screen names the conflict ("Disable Freight Rail to enable this pack"); there is no hidden ordering between packs.
- A new template type joins the inject taxonomy through a `taxonomy` block in its `meta.json`; the taxonomy becomes a registry that main fills and the renderer reads over IPC.
- Pack domain profiles may use only the built-in threat families (they carry code-level lint rules).

**Uninstall: projects keep working because what a project uses is copied into it.** When a project first uses a pack item it gets a copy in its own layer, recorded in `<project>/packs.json` (`{ kind, id, packId, version, files: [{ path, sha256 }] }`):

- a template is copied to `<project>/templates/injects/<type>/` when an inject of that type is created or rendered;
- a workflow is copied to `<project>/comfy/workflows/` when it renders media for the project;
- a pack domain is snapshotted into `project.json` (`domainProfileSnapshot`, with its pack id and version) when chosen; `resolveProfile` uses the snapshot, then the overrides;
- a document is imported (copied) like any file, with `source { packId, version, path }` and its license on `DocumentMeta`;
- an example is opened by copying, as today, and its `.example.json` marker records the pack id and version;
- prompts are not copied: they shape new generation only, and the rendered prompt hash is already recorded with each output. After uninstall the next lower layer applies.

Reference-with-fallback was rejected: a project shared with a colleague who lacks the pack, or opened after an uninstall, would lose the ability to re-render, and an update to the pack would change a running exercise. Copies are a few kilobytes (templates, workflows, one profile) or files the user chose to import. When the installed pack has a newer version of a copied item, the item shows "Update available" and updating is an explicit action; a copy whose files no longer match `packs.json` shows as edited and is never overwritten silently.

**Catalogs and network.** Settings hold a list of catalog URLs, empty by default. The Packs screen offers one button, "Add the official catalog (actionstations.ai)", which adds `https://actionstations.ai/packs/index.json`. The app fetches a catalog's `index.json` only when the user opens Browse or presses Refresh, never at startup or in the background, and downloads an archive only on Install or Update. Catalog and archive URLs are https (http only on loopback, for local testing); an archive URL on this computer or the local network is accepted only from a catalog served from there (#303); redirects must stay on https; responses are capped (5 MB index, the entry's `size` for archives) and time out. An invalid catalog entry is skipped and counted, not fatal. Updates are detected from the last fetched index. "Install from URL" downloads one archive on the user's click. Opening an `.aspack` file (file association, drag and drop, or Install from file) opens the review, never a silent install.

**Review before install.** Name, id, version, author, homepage, size, archive sha256 and where it came from; contents by kind with counts and what each item replaces; the pack license and every document's license and source; custom ComfyUI nodes; conflicts; minAppVersion. Install is one click after that.

**Examples from packs.** `examples:list` returns built-in examples plus those of enabled packs, each with `packId` and `packVersion`; `examples:open` takes `{ slug, packId? }` and copies from `userData/packs/<id>/<version>/examples/<slug>/project` through the same copy filter (no symlinks, no derived data). An example's `domainProfile` may be a built-in id or a domain of the same pack; the copy snapshots that profile so the example still opens after the pack is gone.

**Export as pack.** A wizard builds an `.aspack` from the user's own layers: user templates, global prompt overrides, user workflows, a project's resolved domain profile under a new id, project documents (the user states each license), and a project as an example (copied through the example filter, `fictional: true`, notice text required). It writes `pack.json` with hashes, a deterministic zip (sorted entries, fixed timestamps) and validates the result with the same reader before saving. The wizard asks the author to choose the pack license (an SPDX expression or `LicenseRef-*`, with common choices such as CC-BY-4.0, CC0-1.0 and MIT offered); there is no default. Pack licenses are per pack and independent of the app's own license (PolyForm Internal Use 1.0.0): a pack carries its author's content, not app code. Sharing is a pull request to the site repository; the app shows the steps and opens the contribution page in the browser on request.

## Consequences

- One reader validates every pack path: install, the export wizard's self-check and `scripts/pack-validate.mjs`, which the site's local build runs. The schemas live in `src/shared` so the renderer shows the same errors.
- Templates gain a project and a user layer, and loading a template takes the project root. Rendering a project no longer depends on what is installed, which also makes shared projects reproducible.
- Pack content is data the app already knows how to read; the attack surface added is the zip reader and the template checker, both covered by fixture tests (traversal, symlinks, bombs, case collisions, scripts).
- Hashes catch corruption and a swapped file on a mirror, not a malicious publisher; the review screen and the catalog the user chose to add are the trust decision.
- `minAppVersion` and `formatVersion` are the only compatibility gates; there are no inter-pack dependencies in format 1 (a domain pack carries its own example and templates). New kinds bump `formatVersion`.
- No signing, auto-update, background checks, paid packs or executable plugins; adding any of them needs a new ADR.
