# Exercise bundle format (`.asexercise`)

Reference for the signed bundles that organizations exchange in a regional exercise (spec 0440,
ADR-0062). The archive rules are those of [packs](packs-format.md): one reading of the zip, POSIX
paths from the pack path rules, no encryption, no links, size and count limits (500 MB
uncompressed, 5,000 files).

## Layout

```
bundle.json                    manifest; lists every other file with size and sha256
signature.json                 { alg: "ed25519", publicKey (base64 SPKI DER), signature (base64) }
frame.json                     frame and merged bundles
slices/<PREFIX>.json           one in a slice bundle, one per organization in a merged bundle
media/<PREFIX>/<injectId>/<assetId>.<png|jpg|jpeg|webp|mp4|webm|wav|mp3|pdf>
```

Any other path is refused on write and on read. A bundle is a `frame` (host to everyone), a `slice`
(one organization to the host) or `merged` (host to everyone, with the frame and every slice).

## Signing and checks

The signature covers the canonical JSON of `bundle.json` (keys sorted, no whitespace). The signer's
fingerprint (sha256 of the SPKI DER, first 16 bytes, 8 groups of 4 hex characters) must equal
`from.fingerprint`. Reading checks, in order: archive size, zip layout, entry names, manifest
schema and app version, signature, the listing against the archive, each file's size and sha256,
then each file's strict schema. Whether the key is the expected one is a separate step (pinning).

## Content

Everything is a strict schema in `src/shared/schemas/regional.ts`: an unknown field is refused.
Rows carry `id, phaseId, time, wallClock, from, toRoleIds, toLabel, event, expectedAction,
purposeTag, format, injectId, citations, owner, revision, visibility, publicSummary, dependsOn`.
Injects carry `id, mselRowId, type, title, deliveryMode, fields, variant, instructorNote,
citations, assets, includeInDeck, owner, revision`. Citations hold a short document id derived
from the title, the title and the heading path; page and quote only when the owner shares quotes.
Never in a bundle: documents, the search index, facility facts, prompts, provider settings, idea
files, history, facilitator state, secrets, prompts used for media.

A private row travels as a placeholder: time, owner, target roles and `publicSummary`; its inject
stays on the owner's computer.
