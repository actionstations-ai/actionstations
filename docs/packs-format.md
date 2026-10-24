# Pack and catalog formats

Status: format version 1 · Decision record: [ADR-0018](adr/0018-packs.md) · Schemas: [`src/shared/schemas/pack.ts`](../src/shared/schemas/pack.ts)

A **pack** is a zip archive named `<id>-<version>.aspack` with a `pack.json` manifest at its root. It carries content for Action Stations: inject templates, prompts, domain profiles, ComfyUI workflows, reference documents and example projects. A **catalog** is a JSON index (`index.json`) listing packs and where to download them. The official catalog is `https://actionstations.ai/packs/index.json`; anyone can publish another one. Installing and exporting packs in the app is covered in the [Packs guide](guides/packs.md).

Integrity is **hashes only**: `pack.json` lists the sha256 and size of every file, and a catalog entry carries the sha256 of the archive. Nothing is signed. A hash proves the bytes are the ones the catalog (or the person who sent you the file) described, not who made them.

The zod schemas in `src/shared/schemas/pack.ts` are the source of truth. This page and the schemas are tested against each other: every JSON block below marked as an example is parsed by `pack.test.ts`.

## Archive layout

```
<id>-<version>.aspack            zip, deflate or store, no encryption
  pack.json                      manifest (required)
  README.md  LICENSE[.md|.txt]  NOTICE[.md]  CHANGELOG.md     optional
  templates/<type>/              one inject template per folder
    template.html  meta.json     required
    style.css  schema.json  preview.json  __golden__/*.png  fonts/*  images…
  prompts/<name>.md              prompt files (YAML frontmatter + body)
  domains/<id>.json              domain profiles (DomainProfile schema)
  workflows/<id>.json            ComfyUI workflow, API format
  workflows/<id>.bindings.json   its binding sidecar (WorkflowSidecar)
  documents/<slug>/<file>        reference documents, imported into projects on request
  examples/<slug>/example.json   example manifest (ExampleManifest)
  examples/<slug>/project/…      the example's .asproj folder content
```

Nothing else is allowed. In particular there is no place for scripts, binaries, plugins or installers.

### Allowed files per folder

| Folder               | Extensions (lowercase)                                                                                                                                                  | Notes                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| root                 | `README.md`, `LICENSE`, `LICENSE.md`, `LICENSE.txt`, `NOTICE`, `NOTICE.md`, `CHANGELOG.md`                                                                              | exact names only                              |
| `templates/<type>/…` | `.html` `.css` `.json` `.png` `.jpg` `.jpeg` `.webp` `.woff2` `.woff` `.ttf` `.otf`                                                                                     | the only HTML file is `template.html`; no SVG |
| `prompts/`           | `.md`                                                                                                                                                                   | flat, `<name>.md`                             |
| `domains/`           | `.json`                                                                                                                                                                 | flat, `<id>.json`                             |
| `workflows/`         | `.json`                                                                                                                                                                 | flat, `<id>.json` + `<id>.bindings.json`      |
| `documents/<slug>/…` | `.pdf` `.docx` `.pptx` `.xlsx` `.md` `.markdown` `.txt` `.png` `.jpg` `.jpeg`                                                                                           | each file needs a `documents[]` entry         |
| `examples/<slug>/…`  | `.json` `.md` `.txt` `.csv` `.png` `.jpg` `.jpeg` `.webp` `.mp3` `.wav` `.ogg` `.m4a` `.mp4` `.webm` `.pdf` `.docx` `.pptx` `.xlsx`, and `.gitignore` inside `project/` | no `index.sqlite`, no `.cache/`               |

### Path rules

Every path in the archive and in `pack.json`:

- is relative POSIX (`/` separators), at most 240 characters, at most 12 segments, each at most 100 characters;
- has no empty, `.` or `..` segment, no backslash, no control character, no drive letter, no leading `/`;
- uses only `A–Z a–z 0–9 _ - .` per segment, starts with a letter, digit or `_` (not `.` or `-`; the one exception is `.gitignore` in an example project) and does not end with `.`;
- is not a Windows reserved name (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, in any case and with or without an extension, so `con.txt` is refused too);
- is unique ignoring case (two files that differ only in case are refused, because macOS and Windows folders would merge them);
- is NFC-normalized.

### Item ids

| Kind      | Id pattern                          | Becomes                                                      |
| --------- | ----------------------------------- | ------------------------------------------------------------ |
| templates | `^[a-z0-9_]+$`                      | inject `type`, folder name (same rule as `meta.json` `type`) |
| prompts   | `^[a-z][a-z0-9_]*$`                 | prompt name; must be a prompt the app ships (a stage)        |
| domains   | `^[a-z][a-z0-9_]*$`                 | domain profile id (`project.orgType`)                        |
| workflows | `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$` | workflow id                                                  |
| documents | `^[a-z0-9][a-z0-9_-]{0,63}$`        | folder grouping one or more files                            |
| examples  | `^[a-z0-9][a-z0-9_-]{0,63}$`        | example slug                                                 |

### Limits

| Limit                          | Value              |
| ------------------------------ | ------------------ |
| Archive size                   | 200 MB             |
| Sum of uncompressed files      | 500 MB             |
| One file                       | 100 MB             |
| `pack.json`                    | 1 MB               |
| Files                          | 2000               |
| Compression ratio of one entry | 100 : 1            |
| Catalog `index.json`           | 5 MB, 5000 entries |

The reader counts actual bytes while inflating and stops at a limit; declared sizes in the zip headers and in `pack.json` are not trusted. The compression-ratio limit compares an entry's inflated bytes with its compressed size once the entry passes 1 MB (small text files legitimately compress better than 100 : 1). Entries are stored or deflated (no other compression method), not encrypted, and not links or other special files; ZIP64 and multi-part archives are refused (no pack needs them under these limits). Directory entries are allowed and ignored.

An archive must have exactly one reading, so that every zip tool sees the same files. The end-of-central-directory record ends the file (no appended data), the central directory ends where that record starts, and the entries' local headers, data and data descriptors (allowed, signed or not) fill every byte before the central directory from offset 0, in order, with no gap and no overlap (no prepended data, no hidden bytes, no shared or nested entries). Each local header repeats its central record: the same name bytes, flags, compression method and, unless a data descriptor carries them, CRC and sizes. The entry count must equal the records in the central directory, names may not repeat, and the Info-ZIP unicode path field (which can rename an entry in some readers) is refused. Each entry is inflated from exactly its region: the deflate stream must use every compressed byte and produce the size the headers declare, so the ratio limit is measured on the bytes really inflated. The reader also checks that jszip lists the same entries with the same sizes and CRC.

## pack.json

| Field           | Type     | Required                  | Rules                                                                                                                                                                                                    |
| --------------- | -------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatVersion` | integer  | yes                       | `1`. A larger value is refused with "this pack needs a newer version of the app".                                                                                                                        |
| `id`            | string   | yes                       | reverse-DNS, two or more labels of `[a-z0-9]` with inner `-`, dot-separated, ≤ 128 (`ai.actionstations.freight-rail`, `org.example.my-pack`). Use a domain you control, or `io.github.<user>.<name>`.    |
| `name`          | string   | yes                       | 1–100 characters                                                                                                                                                                                         |
| `version`       | string   | yes                       | semantic version, prerelease allowed, no build metadata (`1.0.0`, `1.1.0-beta.1`)                                                                                                                        |
| `summary`       | string   | yes                       | one line, ≤ 200                                                                                                                                                                                          |
| `description`   | string   | no                        | Markdown, ≤ 20 000; shown as text-only Markdown (raw HTML is not rendered)                                                                                                                               |
| `author`        | object   | yes                       | `name` (required), `url` (http/https), `email`                                                                                                                                                           |
| `license`       | string   | yes                       | SPDX expression for the pack's own content (`CC-BY-4.0`, `MIT OR Apache-2.0`, `LicenseRef-…`)                                                                                                            |
| `homepage`      | string   | no                        | http/https URL                                                                                                                                                                                           |
| `minAppVersion` | string   | yes                       | semantic version; the app refuses to install when it is older. Packs need the app's pack support, so in practice `0.3.0` or later.                                                                       |
| `domains`       | string[] | no                        | domain profile ids the pack is for (built-in or added by a pack). Empty = any domain. At most 50. Also limits where the pack's prompts apply (ADR-0018).                                                 |
| `tags`          | string[] | no                        | ≤ 20, `^[a-z0-9][a-z0-9-]{0,31}$`                                                                                                                                                                        |
| `contents`      | object   | yes                       | keys `templates`, `prompts`, `domains`, `workflows`, `documents`, `examples`, each a list of unique item ids (default empty, at most 500 per kind). Unknown keys are refused. At least one item overall. |
| `documents`     | object[] | if the pack has documents | one entry per file under `documents/`: `path` (listed in `files`), `title` (≤ 300), `license` (SPDX, required), `source` (≤ 500), `description` (≤ 2000)                                                 |
| `files`         | object[] | yes                       | every file in the archive except `pack.json`, exactly once: `path`, `sha256` (64 lowercase hex), `size` (bytes)                                                                                          |

Cross-checks:

- every file under a content folder belongs to an item listed in `contents`, and every listed item has its required files (template: `template.html` + `meta.json`; prompt: `prompts/<name>.md`; domain: `domains/<id>.json`; workflow: `<id>.json` + `<id>.bindings.json`; example: `example.json` + `project/project.json`; document group: at least one file);
- the archive holds exactly the files `files` lists: an extra entry or a missing one is refused;
- every file's sha256 and size match.

Unknown top-level fields are ignored, so a later format can add optional fields without a version bump. A field an older app must not ignore bumps `formatVersion`.

### Per-kind content checks

The reader (`readPack` in `src/main/packs/reader.ts`) validates content with the same code the app uses for its own files:

- **templates**: `meta.json` with `TemplateMeta` (its `type` equals the folder name), `schema.json` compiles as JSON Schema and follows the regex rule (`src/main/packs/schema-regex.ts`, also applied to user and project templates at load: field validation runs Ajv on model output in the main process, so a backtracking regex could stall the app): no `patternProperties`, no `format`, and each `pattern` anchored with `^`, made of single-character atoms (literal, escape such as `\d` `\w` `\s`, class `[…]`, `.`) with at most one variable repeat (`?` `*` `+` `{n,}` `{n,m}`, counts up to 1000; other atoms single or fixed `{n}`), no groups, alternation, back-references or look-arounds, at most 200 characters — the shape every built-in pattern has, `preview.json` with `TemplatePreview`, and the template HTML/CSS checks below. A template whose type is not in the built-in taxonomy needs a `taxonomy` block in `meta.json` (`category`, `render`, `defaultDelivery`, optional `domains`, `paper`; schema `TemplateTaxonomy`).
- **prompts**: frontmatter is YAML (a `---js` or other non-YAML engine is refused), parsed with `PromptFrontmatter`; `name` equals the file stem and names a prompt the app ships.
- **domains**: `DomainProfile`; the id is not a built-in id or alias; `threatFamilies` use the built-in families.
- **workflows**: the workflow parses as ComfyUI API format, the sidecar as `WorkflowSidecar`; node classes outside ComfyUI core are listed in the review as "needs custom nodes".
- **examples**: `ExampleManifest` (`fictional: true`, `id` equals the folder name), `project/project.json` as `Project`; `domainProfile` is built-in or provided by the same pack.

### Template HTML and CSS

Templates render in a sandboxed window with no network and a `default-src 'none'` content security policy (ADR-0008). The window loads only its own document, then `data:` URLs and files whose realpath is inside the template folder, `templates/_shared` or the media files bound into the render; it refuses frames, popups and every navigation after the first load (`src/main/render/sandbox.ts`, #301). Pack templates are also checked on install and again on load, and a template that fails is refused, not cleaned up. The checker judges what the renderer will parse, not the source text: it parses the Handlebars AST, writes each expression as an inert placeholder, parses the result as HTML (parse5, the WHATWG algorithm) and tokenizes CSS with escapes resolved (`@csstools/css-tokenizer`). The rules:

- no `<script>`, `<iframe>`, `<frame>`, `<object>`, `<embed>`, `<base>`, `<form>`, `<link>`, `<portal>`, `<fencedframe>`, `<webview>`, no `http-equiv` attribute; no attribute whose name starts with `on`;
- `src`, `href`, `srcset`, `poster` (and `action`, `data`, `background`, `formaction`, `ping`, `manifest`), CSS `url()` / `src()` / `image-set()` / `image()` / `cross-fade()` and `preview.json` `assets` point to a file of the same template folder (no `..`, no leading `/`), a `#fragment`, or `data:image/…` / `data:font/…`; no `http:`, `https:`, `//`, `file:`, `javascript:` or other scheme (checked after entity decoding and URL whitespace removal). A value filled by Handlebars (`src="{{assets.photo}}"`) is the app's; only its literal parts are checked;
- CSS (in `.css` files, `<style>` and `style=""`) has no `@import`, `expression(`, `behavior` or `-moz-binding`, also when written with escapes; `.css` files and `<style>` contain no `<`, so they cannot close their `<style>` element;
- Handlebars: no unescaped output (`{{{ }}}`, `{{& }}`), no partials or decorators (`{{> }}`, `{{#> }}`, `{{#*inline}}`); helpers are only the app's;
- Handlebars expressions (including `{{! comments}}`) only in text and in quoted attribute values: not in a tag or attribute name, an end tag, an HTML comment or a raw-text element (`<style>`, `<title>`, `<textarea>`, …), and not right after `<`, `</`, `<!` or `<?`. A block's `{{#…}}`, `{{else}}` and `{{/…}}` sit in the same parent element or the same attribute value, so leaving out or repeating a branch never changes how the rest parses;
- HTML comments are plain `<!-- text -->` (no `<!-->`, `--!>` or nested `<!--`);
- the folder holds only the template file types listed above, and the only HTML file is `template.html`.

The checker is `checkTemplateFiles` in `src/main/packs/template-check.ts` (HTML rules in `template-html.ts`, CSS in `template-css.ts`); every built-in template passes it.

In the app, templates resolve through four layers, first match wins: `<project>/templates/injects/<type>/`, `userData/templates/injects/<type>/`, enabled packs, built-in (`src/main/render/templates.ts`). The checker runs on every non-built-in layer when a template is loaded, together with the schema regex rule below, and a project whose `templates/` or `templates/injects/` folder is a symlink has no project layer; a refused template is skipped (the next layer applies) and listed by `templates:refused`. When an inject of a pack template's type is created, saved or rendered, the template is copied into the project and recorded in `<project>/packs.json`; "Update from pack" (`templates:updateFromPack`) replaces the copy only on request and refuses an edited copy unless confirmed; `comfy:workflows:updateFromPack` does the same for a workflow copy. `packs.json` travels with a shared project, so its record paths are checked before every read, write or delete (`copyPath` in `src/main/packs/project-copies.ts`): each must sit in its item's folder (`templates/injects/<type>/…`, `comfy/workflows/<id>.json` or `<id>.bindings.json`, `documents/<docId>/<file>`), and no folder on the way, nor the file, may be a symlink. A record file that fails the check reads as edited and is never removed.

Pack authors can check their templates' goldens with the app's renderer: `pnpm build:app && pnpm test:templates --pack <unpacked pack folder>` renders every `templates/<type>/preview.json` × variant through the user template layer (so the load-time checker runs too) and compares it with `templates/<type>/__golden__/<variant>.png` in the pack folder (`UPDATE_GOLDENS=1` writes them).

### Example (minimal templates pack)

<!-- example:pack -->

```json
{
  "formatVersion": 1,
  "id": "ai.actionstations.social-media-extended",
  "name": "Extended Social Media",
  "version": "1.2.0",
  "summary": "More social and messaging inject templates.",
  "description": "Adds a livestream chat overlay and a community forum thread.",
  "author": { "name": "Action Stations", "url": "https://actionstations.ai" },
  "license": "CC-BY-4.0",
  "minAppVersion": "0.3.0",
  "domains": [],
  "tags": ["social", "media"],
  "contents": { "templates": ["livestream_chat", "forum_thread"] },
  "files": [
    {
      "path": "README.md",
      "sha256": "5c1a4f0f1b4e1f8c9d2e6b7a8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f70812",
      "size": 1204
    },
    {
      "path": "templates/livestream_chat/template.html",
      "sha256": "0b1c2d3e4f5061728394a5b6c7d8e9f00112233445566778899aabbccddeeff0",
      "size": 2311
    },
    {
      "path": "templates/livestream_chat/meta.json",
      "sha256": "1c2d3e4f5061728394a5b6c7d8e9f00112233445566778899aabbccddeeff001",
      "size": 402
    },
    {
      "path": "templates/livestream_chat/style.css",
      "sha256": "2d3e4f5061728394a5b6c7d8e9f00112233445566778899aabbccddeeff00112",
      "size": 3920
    },
    {
      "path": "templates/forum_thread/template.html",
      "sha256": "3e4f5061728394a5b6c7d8e9f00112233445566778899aabbccddeeff0011223",
      "size": 2788
    },
    {
      "path": "templates/forum_thread/meta.json",
      "sha256": "4f5061728394a5b6c7d8e9f00112233445566778899aabbccddeeff001122334",
      "size": 377
    }
  ]
}
```

A complete pack with every kind is in [`tests/fixtures/packs/freight-rail.pack.json`](../tests/fixtures/packs/freight-rail.pack.json).

## Catalog index.json

Served as static JSON (GitHub Pages for the official one). The app fetches it only for catalog URLs the user added, and only when the user opens Browse or presses Refresh.

| Field            | Type     | Required | Rules                                                                |
| ---------------- | -------- | -------- | -------------------------------------------------------------------- |
| `catalogVersion` | integer  | yes      | `1`; a larger value: "this catalog needs a newer version of the app" |
| `name`           | string   | yes      | 1–100                                                                |
| `updated`        | string   | yes      | ISO 8601 date-time with `Z` or offset                                |
| `homepage`       | string   | no       | http/https URL                                                       |
| `packs`          | object[] | yes      | ≤ 5000 entries, below; `id`+`version` unique                         |

Pack entry:

| Field                                                                                       | Type     | Required          | Rules                                                                                                            |
| ------------------------------------------------------------------------------------------- | -------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| `id`, `name`, `version`, `summary`, `author`, `license`, `minAppVersion`, `domains`, `tags` |          | as in `pack.json` | must equal the archive's `pack.json` (the publisher's validator checks)                                          |
| `formatVersion`                                                                             | integer  | no (default 1)    | the archive's `pack.json` `formatVersion`; the app hides entries it cannot read                                  |
| `kinds`                                                                                     | string[] | yes               | non-empty, unique, from `templates` `prompts` `domains` `workflows` `documents` `examples`                       |
| `size`                                                                                      | integer  | yes               | archive bytes, ≤ 200 MB                                                                                          |
| `sha256`                                                                                    | string   | yes               | sha256 of the archive bytes, 64 lowercase hex                                                                    |
| `url`                                                                                       | string   | yes               | `https://` (or `http://` on `127.0.0.1` / `localhost` / `[::1]` for local testing); redirects must stay on https |
| `homepage`                                                                                  | string   | no                | http/https URL                                                                                                   |
| `updated`                                                                                   | string   | yes               | ISO 8601 date-time                                                                                               |

Several versions of one pack may be listed; the app offers, among the versions whose `minAppVersion` and `formatVersion` it supports: for a pack that is not installed, the highest stable version, or the highest prerelease (`1.3.0-beta.1`) when the pack has no stable version; for a pack installed at a stable version, the highest stable version (never a prerelease); for a pack installed at a prerelease, the highest version including prereleases (a beta install moves on to the next beta or to the release). The app skips an invalid entry and says how many it skipped instead of refusing the whole catalog; a publisher's validator should refuse it (`PackCatalog` in the schema module).

An entry whose `url` is on this computer or the local network (loopback, `localhost` and `*.localhost`, `0.0.0.0`, private and link-local IPv4 and IPv6 addresses, written as literals) is skipped unless the catalog itself was served from such an address (after redirects): a catalog on the internet cannot make Install send a request to a local service such as ComfyUI, LM Studio or Ollama.

How the app fetches (`src/main/packs/catalog.ts`, `download.ts`): catalog URLs live in `settings.json` (`packs.catalogs`, empty by default; added in Settings → Pack catalogs). `index.json` is fetched only on an explicit Refresh or when Browse opens, with a 5 MB cap counted on the received bytes, a 30 s idle timeout and at most 5 redirects, each of which must pass the same https rule (and may not move from a remote host to this computer or the local network). The last good copy is kept in `userData/packs/catalogs/<sha256 of the URL>.json` for offline display, and each catalog records `lastFetchedAt` / `lastError`. An archive download streams into `userData/packs/.staging/`, capped at the entry's `size` (200 MB for Install from URL), hashed while streaming, and removed on a sha256 mismatch, timeout or cancel.

<!-- example:catalog -->

```json
{
  "catalogVersion": 1,
  "name": "Action Stations Packs",
  "updated": "2026-10-23T00:00:00Z",
  "homepage": "https://actionstations.ai/packs/",
  "packs": [
    {
      "id": "ai.actionstations.social-media-extended",
      "name": "Extended Social Media",
      "version": "1.2.0",
      "formatVersion": 1,
      "summary": "More social and messaging inject templates.",
      "author": { "name": "Action Stations", "url": "https://actionstations.ai" },
      "license": "CC-BY-4.0",
      "kinds": ["templates"],
      "domains": [],
      "tags": ["social", "media"],
      "minAppVersion": "0.3.0",
      "size": 1843200,
      "sha256": "9f2b6a1c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8",
      "url": "https://actionstations.ai/packs/files/ai.actionstations.social-media-extended-1.2.0.aspack",
      "homepage": "https://actionstations.ai/packs/ai.actionstations.social-media-extended/",
      "updated": "2026-10-20T00:00:00Z"
    }
  ]
}
```

## Installed packs

How the app installs (`src/main/packs/install.ts`, #260). Nothing here uses the network: a URL or catalog install takes the archive `packs:download` already put in `userData/packs/.staging/`.

- **Review** (`packs:inspect`): the reader verifies the archive and the app shows the manifest fields, the items and what each replaces, the pack and document licenses, custom ComfyUI nodes, the archive sha256, conflicts with installed packs, and what Install will do: `install`, `reinstall` (same version), `update` (newer) or `downgrade` (older; needs a second confirmation).
- **Install** (`packs:install`): verify → extract into `.staging/<ulid>/` → files made read-only → rename to `userData/packs/<id>/<version>/` → `registry.json` written atomically → the previous version's folder removed. One version per pack is kept. A failure puts the previous folder back and leaves no new folder or registry entry. A downloaded archive is deleted after the install, whether it worked or not; a file the user picked is left where it is.
- **Registry** (`userData/packs/registry.json`, schema `PackRegistry`): per pack `id`, `version`, `enabled`, `installedAt`, `source` (`file` with the file name, `url`, `catalog` with the catalog URL, or `unknown`), `archiveSha256` (or `unknown`), `contentSha256` and the review's item list. A registry that cannot be read is moved to `registry.json.damaged-<time>`; when it is damaged or missing, the entries are rebuilt from the pack folders: each `<id>/<version>/` that passes the startup check becomes a disabled entry with source and archive sha256 `unknown` (the highest valid version per id), so no installed pack is lost.
- **Conflicts**: two enabled packs may not provide the same template, prompt, workflow or domain id, and pack domains may not share an id or alias. Documents and examples never conflict: they are always looked up with their pack id. A pack that would conflict installs disabled, with a reason naming the pack in the way ("Disable Freight Rail Operations to enable this pack"); enabling it checks again. A reinstall or update keeps a pack the user disabled disabled.
- **Startup**: everything left in `.staging/` is deleted, folders under `userData/packs/` that the registry does not list are removed (only when `registry.json` was read cleanly), and each pack is checked: `pack.json` matches the registry's content hash, every listed file exists with its size, and files up to 256 KB are re-hashed. A pack that fails is shown as broken and not loaded; reinstalling repairs it. `packs:verify` re-hashes every file. Then the enabled packs' domain profiles are registered.
- **Reference documents** (#265): `packs:documents` lists every `documents[]` entry of the enabled packs (pack id, version and name, group slug, path, title, source, license, description; with `projectPath`, the id of a project document already imported from that file). `packs:importDocuments` takes `{ packId, path }` pairs, resolves each file with `packFilePath` (listed in `pack.json`, realpath inside the pack folder) and hands it to the same pipeline as `documents:import`: the file is copied to `documents/<docId>/original.<ext>` and ingested. `DocumentMeta` gets the pack title, `source { packId, version, path, packName }` and `license`. Each import is recorded in `<project>/packs.json` with kind `documents`, id = `<packId>/<slug>` (two packs that both carry a group with the same slug import side by side), and the project-relative path and sha256 of each imported original, so the record points at the project's own copy; documents removed from the project drop out of the record on the next import. A file whose bytes are already in the project returns the existing document unchanged.
- **Uninstall** removes the folder and the registry entry; projects keep the copies they made (ADR-0018).
- **Packs screen** (sidebar → **Packs**, #268): **Installed** lists each pack with its version, source, an Enabled switch, Update available (from the cached catalogs), broken and conflict states, Details and Uninstall (a confirmation explains that projects keep their copies). **Browse** lists the newest version of each pack in the catalogs you added, filtered by search text, kind, domain and tag; with no catalogs it shows the catalog editor from Settings. Every install goes through the same review (Install / Update appears only there): from a catalog entry or an update (downloaded as a job first), **Install from URL…** (optional expected sha256), **Install from file…**, an `.aspack` dropped anywhere on the window, or an `.aspack` opened from Finder / Explorer (file association; macOS `open-file`, a launch argument on Windows and Linux). Opening a file never installs it. The description is rendered as text-only Markdown: raw HTML shows as text, images as their alt text, links as text plus the address. A source of `unknown` and an archive sha256 of `unknown` read "Not recorded".
- Each change sends `packs:changed` to the renderer and calls the main-process listeners of `onPacksChanged` (`src/main/packs/layers.ts`), which the template, prompt, workflow, document and example layers read from.

## Exporting a pack from the app

**Packs → Export as pack** (`/packs/export`, #271; `src/main/packs/export.ts`) builds a pack from the user's own content:

| Item             | Taken from                                                        | In the pack                                                   |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| Inject templates | `userData/templates/injects/<type>/` (hidden files left out)      | `templates/<type>/…`                                          |
| Prompt overrides | `userData/prompts/<name>.md`, names the app ships only            | `prompts/<name>.md`                                           |
| Workflows        | `userData/comfy/workflows/<id>.json` + `<id>.bindings.json`       | `workflows/…` (a workflow without bindings is refused)        |
| Domain profile   | the project's resolved profile (snapshot or registry + overrides) | `domains/<new id>.json`, new id and label, no aliases         |
| Documents        | `<project>/documents/<docId>/original.<ext>`                      | `documents/<slug of the title>/<file name>`, license required |
| Example          | the project folder                                                | `examples/<slug>/example.json` + `project/…`                  |

The example copy uses the `examples:open` filter (no `index.sqlite*`, no `.cache/`, no `.example.json` marker, no links) and also leaves out `exports/`, `packs.json`, project templates and any file whose name or type a pack cannot carry (listed in the review). JSON files lose provider ids (`providerId`, `providerRef`, `providerIds`), credential-like fields (`apiKey`, `token`, `secret`, `password`, `authorization`), `providerRouting` (emptied) and the provider of media provenance (kept only when it is `template`); the project folder, the settings folder and the home folder are removed from every text. A text file that still matches a key or local-path pattern blocks the export. `example.json` gets `fictional: true`, the notice the author wrote and `id` = the slug; `domainProfile` is the exported domain (the project's `orgType` is rewritten to it and its overrides and snapshot dropped) or the project's built-in domain. A project on a pack domain must export its domain profile too.

`pack.json` gets `minAppVersion` = the running app's version and lists every file with sha256 and size. The zip is deterministic: entries sorted by path, one fixed timestamp (2000-01-01), mode `0644`, deflate, no folder entries, so the same content always gives the same archive sha256. The archive is checked with `readPack` before it can be saved; a pack the reader refuses is never written, and its problems are shown. The save dialog runs in main. The last step shows the archive sha256 and the pull-request steps below, and opens the site repository in the browser only when the user clicks.

## Publishing to the official catalog

1. Build the pack in the app (**Packs → Export as pack**) or by hand, then validate it (#259):

   ```
   node scripts/pack-validate.mjs <file>.aspack
   ```

   It runs the app's own reader (`readPack`, `src/main/packs/`), not a copy of its rules: archive limits, path rules, allowed files, every size and sha256, and the per-kind content checks. Valid packs print `<file>: ok (<id> <version>, <n> files, sha256 <hash>)`. Otherwise each problem prints as `<file>: <path inside the pack>: <message>` on stderr. The exit code is 0 when every file is valid and 1 otherwise. Several files can be given at once. `--app-version <v>` sets the version the `minAppVersion` gate compares with; it defaults to the `package.json` version of the checkout. While that is older than 0.3.0, pass `--app-version 0.3.0` to check packs that need 0.3.0. (The app itself takes `TTX_APP_VERSION` for the same purpose in unpackaged runs, `src/main/packs/app-version.ts`.)

2. Print the catalog entry for a pack:

   ```
   node scripts/pack-validate.mjs <file>.aspack --catalog-entry --url https://actionstations.ai/packs/files [--updated <iso-date>]
   ```

   This prints the entry as JSON: the fields copied from `pack.json`, `kinds`, the archive `size` and `sha256`, `url` = `<base>/<id>-<version>.aspack`, and `updated` (default: now). With several files it prints an array. The entry is checked with `PackCatalogEntry` before it is printed.

3. Validate a whole catalog strictly:

   ```
   node scripts/pack-validate.mjs --catalog packs/index.json
   ```

   This uses `PackCatalog`: any invalid or duplicate entry fails, unlike the app, which skips bad entries.

4. Open a pull request to the site repository adding `packs/files/<id>-<version>.aspack`. The maintainer runs the site's local build from a checkout of this repository (after `pnpm install`). The build validates every archive with step 1, regenerates `packs/index.json` from step 2 and checks the result with step 3. There is no CI service.

5. Reference documents must be redistributable: each `documents[]` entry names its license, and the reviewer checks it before merging.

The script needs Node 20 or later and the repository's dev dependencies, not Electron. On first use, and whenever a source under `src/` changes, it bundles the reader with Vite into `node_modules/.cache/pack-validate/`, with a stub in place of `electron`.

## Compatibility with the draft of 2026-10-23

The website was started against a draft of this format. Differences:

- `id`: at least two dot-separated labels; labels start and end with a letter or digit (`a..b`, `-a.b` and single labels are refused).
- `version`, `minAppVersion`: no build metadata (`1.0.0+5`).
- `contents`: every key optional (defaults to empty); unknown keys are refused; at least one item.
- `documents[]`: `license` and `title` are required; every file under `documents/` needs an entry.
- `files[]`: lists every archive file except `pack.json`, `size` required; no extra or missing archive entries.
- `homepage` added to `pack.json` (optional).
- Catalog entry: `formatVersion` added (optional, default 1); `url` must be https; `kinds` non-empty; `id`+`version` unique, several versions allowed. Catalog `homepage` added (optional).
- Folders: workflows need their `<id>.bindings.json`; examples need `project/project.json`; no SVG anywhere; the only template HTML file is `template.html`.
