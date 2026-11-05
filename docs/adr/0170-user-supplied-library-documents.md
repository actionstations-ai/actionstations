# ADR-0170: User-supplied documents in reference libraries

Date: 2026-11-05 · Status: Accepted · Issues: #1101 · Related: ADR-0018 (pack format), ADR-0020 (bundled packs and libraries)

## Context

The reference libraries carry each document they can fetch, pinned by sha256. PCI DSS v4.0.1 is served free from the PCI SSC document library, but only after its License Agreement is accepted, and that agreement allows copies for internal purposes and sharing with employees and bars sublicensing. Putting the file in a library pack that anyone can download would pass it on. Linking only, as before, leaves the user without the document in the app. The owner decided: user-supplied documents.

## Decision

- **Manifest.** A document in `packs/documents/manifest.json` may set `supply: "user"` (default `bundled`). It then needs `getIt` (plain text: where to go, what to accept, which file), `landing` and a pinned `sha256` and `size`, and cannot be in the core pack. PCI DSS v4.0.1 is the first.
- **Pack format.** `pack.json` gains `userDocuments[]`: the `documents[]` fields plus `landing`, `getIt`, `sha256` and `size`. The path names the document (`documents/<slug>/<file>`) but is not in `files`, `documents[]` or `contents`. No format version bump: older apps strip the unknown key and simply do not list the entry.
- **Build.** The library builder never puts a user-supplied file in the archive, even when it is in the cache; it lists it in `userDocuments[]` and the README ("Add your own copy") and leaves it out of the pack license. The fetcher never downloads one, reports it from the cache or inbox when a maintainer put it there, and otherwise skips it without failing.
- **App.** "Add from pack" shows the entry as **Needs your copy** with the `getIt` text, a link to the landing page (OS browser) and **Add the file…**. `packs:addSuppliedDocument` opens the picker in main, refuses a different size at once, copies the file to a temporary name, hashes the copy and keeps it only on a match, at `userData/supplied-documents/<sha256>/<file>`. Import then reads that copy like a pack file, so the document is copied into projects and indexed like the rest. The picker lives in main so the renderer never names a path for main to read.

## Consequences

- The libraries can list a standard whose license forbids passing it on, and the user gets it in the app with one download, checked to be the exact edition the library cites.
- The store is keyed by hash, so the three libraries that list PCI DSS share one copy, and it survives pack updates and uninstalls. A new edition needs a new pin and library version, and each user adds the new file.
- A project that imports the document holds a copy in its folder, as for any document; sharing that project is the user's decision.
- Removing a supplied copy is a file deletion in the store for now; there is no button.
