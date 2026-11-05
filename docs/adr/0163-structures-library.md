# ADR-0163: Structures reference library

Date: 2026-11-05 · Status: Accepted · Issue: #858 (epic #704, spec 0471)

## Context

The construction field leans on standards and investigation reports. Only some are public domain, and several publishers blocked automated access when the library was built, so their terms could not be read.

## Decision

- The library pack `ai.actionstations.structures-library` bundles only documents whose status was read in the file itself: three pages-of-the-CFR files from the Government Publishing Office (29 CFR 1904.39, Subpart P and Subpart CC) and the OSHA scaffold guide, which states that its material is public domain and credits no non-federal photograph or figure. Each is pinned by sha256. The CFR files are the printed edition's pages and include neighboring sections; their edition (7-1-23 or 7-1-24) is stated per document, since the govinfo file names do not say.
- The OSHA trenching booklet states that it is public domain but credits its cover photograph to a manufacturer, so it is linked until that is confirmed. FEMA P-2055 and its companion, the FEMA urban search and rescue page and the NIOSH FACE program are linked because their sites refused automated access; the NIST Champlain Towers South reports were not found as files. The Applied Technology Council forms and placards state no reproduction terms, and the engineering societies' codes and the ICC field guide are copyrighted; all are linked.
- The toolkit names the four bundled documents in `documents`.

## Consequences

The library is small and each file's licence is on record. Adding FEMA P-2055 or a NIOSH report needs a person to read the terms on the publisher's page first; the manifest's link reasons say why each is not bundled.
