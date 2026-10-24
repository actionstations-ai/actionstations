# ADR-0020: Built-in content ships as bundled packs

Date: 2026-10-24 · Status: Accepted · Issue: #314 · Milestone: 0.4.0 Domain packs · Builds on [ADR-0018](0018-packs.md)

## Context

ADR-0018 added packs as a layer above the app's built-in content: templates in `templates/injects/`, prompts in `prompts/`, ComfyUI workflows in `comfy/workflows/`, thirteen domain profiles compiled from `src/shared/domains/profiles/*.ts`, and example projects in `examples/`. The owner decided that everything is a pack and that the app includes some packs by default. The same milestone adds a fuller set of domains, researched from public sources (#313), each with domain templates, public-domain reference documents and an example. Users should see, enable and disable that content in the Packs screen like any other pack, and an organization that never runs a stadium exercise should be able to turn the stadium pack off.

## Decision

**Packs, not a built-in layer.** The app's own content is assembled into packs at build time:

- `ai.actionstations.core`: the cross-domain inject templates, every shipped prompt, the default ComfyUI workflows, the `generic` domain profile, and the cross-sector public-domain documents (HSEEP, NIMS and ICS forms, CPG 101, and similar). Always enabled; it cannot be disabled or removed.
- `ai.actionstations.<domain>` (airport, water-utility, transit, …): one per domain. Each carries the domain profile, the inject templates that only that domain uses, domain prompts if any, public-domain reference documents, and the domain's example project. Enabled by default.

**Source stays where it is.** `packs/bundled.json` maps the repo's existing folders to packs: which template types, prompts, workflows, domain profiles (compiled from the TS profiles to JSON), examples and documents go into which pack, plus each pack's metadata. Documents get a new home, `packs/documents/<pack>/<slug>/`. `scripts/build-bundled-packs.mjs` writes each pack as a folder with a full `pack.json` (hashes and sizes) to `out/bundled-packs/<id>/`. It then validates each pack with the same reader as the app, and fails the build on any problem or on an item that is mapped to no pack or to two. `electron-builder` ships the folders as `app-resources/packs/`; the per-kind `extraResources` entries for templates, prompts, comfy and examples go away. Templates, goldens and the template test script keep their current paths, so authoring does not change.

**Registration.**

- At startup the bundled pack folders are verified with the quick check and registered with source `{ kind: 'bundled' }`. They are read from the app resources in place, not copied to `userData`, and they are versioned with the app.
- `registry.json` records only the user's choice to disable a bundled pack; the default is enabled.
- Bundled packs have no Uninstall. Update means updating the app.
- The Packs screen lists them under "Included with the app".

**Precedence: project > user > installed packs > bundled packs.** Bundled packs take the old built-in place. An installed pack may still replace a bundled template, prompt or workflow, and the review says "replaces Action Stations Core: tweet". Domain ids are the exception. An installed pack may not reuse the id or alias of a bundled domain, because that would silently change fact extraction and lints of existing projects. This is the ADR-0018 rule restated for bundled domains.

**Disabling a bundled pack hides it from new use; it never breaks a project.** A disabled bundled pack leaves:

- the domain picker;
- the inject type pickers and the Templates gallery;
- the examples gallery;
- "Add from pack".

Everything a project already uses still resolves from the disabled pack: its domain profile, templates of inject types the project contains, and workflows. The pack still ships with the app, so no copy-on-use is needed. Prompts of a disabled pack do not apply.

**Domain profiles become data.** The thirteen TS profiles become JSON emitted into their packs. `src/shared/domains` keeps the schema, the threat families (they carry code-level lint rules and stay code), the registry, and the `generic` profile as a compiled-in fallback for code that runs before packs load and for tests. `DOMAIN_IDS` / `DOMAIN_PROFILES` become the registered bundled profiles. Main registers them at startup before any project opens; the renderer already reads profiles over `domains:list`.

**Documents: public domain only.** Owner decision. Bundled packs carry only works of the US federal government (17 U.S.C. §105) or works released as CC0. Each `documents[]` entry states `license: "LicenseRef-US-Government-Work"` (or `CC0-1.0`) and names the publisher and the source URL. Copyrighted references such as ACRP, NFPA, AWWA and NERC are not bundled. A pack README may name them with a link. Documents count against an installer budget of 60 MB across all bundled packs. If a domain needs more, its large documents go into a catalog-only `ai.actionstations.<domain>-library` pack instead.

**Existing installs.** Projects on built-in domains keep working unchanged: their `orgType` resolves to the bundled pack profile with the same id. Template sources reported as `builtin` become `pack` with `packId` set to a bundled pack; the badge shows "Included: <pack name>" rather than "Pack: …" so users can tell app content from content they installed.

## Implementation notes (#314)

Where the code made the decision concrete, or had to differ:

- **Domain profiles are data in the repo.** The thirteen TS profiles were converted once to `packs/domains/<id>.json` and the TS files removed, rather than compiled to JSON at build time. `generic` is compiled in from `packs/domains/generic.json`. `DOMAIN_IDS` / `DOMAIN_PROFILES` became `bundledDomainIds()` / `bundledProfiles()`; the registry keeps every bundled profile, enabled or not, and an id wins over another profile's alias (water_dam's old `water utility` alias).
- **Unpackaged runs read the repo in place.** Dev, unit tests and e2e assemble the packs from `packs/bundled.json` over the repo folders at startup ("source mode", same assembler as the build), so editing a template or prompt needs no rebuild. Only packaged builds read `app-resources/packs/`; `TTX_BUNDLED_PACKS` points a run at a built folder for tests. The build also writes `index.json` (pack order, core flag, the reader's item summaries).
- **`templates/_shared` and `templates/export` still ship as extraResources.** They are the fonts and CSS every inject template uses and the export page templates, not pack items.
- **Workflows are core-only.** The domain-pack list above names none; the build refuses a workflow in a domain pack, which keeps "a project keeps its workflows" true without copies.
- **Registry field.** The disabled bundled packs are `bundledDisabled` in `registry.json`.
- **Disabled templates are hidden, not removed.** `templates:list` and `templates:taxonomy` keep a disabled pack's types with `hidden: true`, so an existing inject of that type still loads its schema and renders; the gallery, the inject type pickers and new generation (`injectTypesForDomain`) leave them out.
- **Documents.** A bundled document names `publisher` and `url` in `packs/bundled.json`; its `pack.json` entry carries them as `source: "<publisher>, <url>"`.
- **An installed pack may not take a bundled pack's id**, in addition to the bundled domain ids.
- **Examples.** A bundled example is opened like an installed pack's, by `{ slug, packId }` (a bare slug finds the enabled bundled pack that has it), and its copies never show "Update available".

## Implementation notes (#325)

- **One manifest pins every document.** `packs/documents/manifest.json` lists the core documents and every library document with source URL, sha256, size, license and public-domain basis, plus the link-only references each pack README names. A fetch script fills a gitignored cache and refuses a file whose sha256 differs; the library builder works only from that cache. A changed hash means a new edition: the owner checks it and re-pins.
- **The core documents are committed** under `packs/documents/core/` (the build reads the repo, and `build:check` runs without network). The libraries are not: they are built from the cache and published to the site catalog.
- **CTEP cover photos are blanked**, not shipped: the first body image of a CISA CTEP `.docx` is replaced with a small grey image of the same format. The rest of the document is unchanged.
- **ZIPs are unpacked** into their pack-format files. Legacy `.doc`/`.xls`/`.ppt` files are left out and listed as links unless a faithful conversion is available; none was when the packs were first built, so the HSEEP MSEL `.xls` is a link.
- **Owner decisions on borderline items:** ASPR TRACIE, DOE C2M2, NERC, the ERG, MS-ISAC co-authored work, joint advisories with non-US co-sealers that say "subject to standard copyright rules", and the FEMA Power Outage Incident Annex are link-only. CISA CTEP situation manuals are bundled without their cover photos.

## Consequences

- One mechanism for all content. The Packs screen shows what the app includes, provenance badges work for everything, and a domain can be switched off.
- The build gains a pack-assembly step, validated by the same reader. A template or document left out of `packs/bundled.json` fails the build instead of disappearing silently.
- New domains are data plus a mapping entry: a profile JSON, templates, documents and an example. No code is needed unless a domain needs a new threat family; that still takes a code change and an ADR.
- The installer grows by the documents' size, capped at 60 MB.
- `builtin` disappears as a template, prompt and workflow source in the UI. The code paths that special-cased built-ins (the template checker skips them, golden tests) treat the core and domain packs as trusted, because they are built from the repo.
