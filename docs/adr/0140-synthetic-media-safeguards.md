# ADR-0140: Synthetic media in exercises is fictional, marked and kept in the project

Date: 2026-11-05 · Status: Accepted · Issues: #769, #773 · Spec: [0467](../specs/0467-ai-incidents.md) · Related: ADR-0075 (figures), project rule 5 (text-bearing media are templates)

## Context

An AI incidents exercise needs a deepfake-style voicemail, audio clip or video still. Project rule 5 allows a configured voice or video provider to make scene content, but a synthetic voice or face is different from a photo of a room: it can be copied out of the exercise and used as a lure, and it can imitate a real person. The app must not make that easier.

## Decision

- **A flag, not a guess.** An inject carries `syntheticMedia` and its generated assets carry `synthetic: true` (`src/shared/schemas`). The facilitator sets the flag on the inject form. The flag is data, so every later step (export, pack export, display) reads the same fact.
- **Fictional by construction.** Before any provider call, `assertFictionalLikeness` (`generate/injects/media-assets.ts`) checks every prompt of a flagged inject: image, video, sound note, speaker, voice style and voice line text. A name on the maintained list (`src/shared/synthetic-media.ts`), or a likeness phrase ("sounds like", "voice of", "clone", "in the style of") followed by a person's name, stops the job with an error that says how to fix it (describe a fictional person: age, build, voice quality). The list is a floor, not a guarantee; the rule is the prompt writes a person from scratch.
- **Marked everywhere.** The facilitator view shows a visible mark on each flagged asset. Exported files carry the `EXERCISE-SYNTHETIC-` prefix (the MP3 sibling too) and the media folder gets a header page (`00-SYNTHETIC-EXERCISE-MEDIA.txt`) that lists the files and the rules.
- **Stays in the project.** The pack example exporter refuses a project that holds flagged media and names each file, so a synthetic item cannot ship in a pack by accident.
- **Critical facts ride in text.** Amounts, account numbers and instructions are carried by template products (the payment request, the chat side-channel). The toolkit's writing guidance says so, and every audio or video inject has a transcript.
- **No provider is required.** Where no media provider is configured, a transcript or a described still stands in. The first release does not need synthesized voices to be useful.

## Consequences

- A designer who wants a famous voice cannot get it; that is the intent.
- The name list needs maintenance. A false negative (a real person not on the list, with no likeness phrase) is possible, which is why the guidance and the facilitator checkbox state the rule in words too.
- The mark and the prefix are a cue, not a technical protection; the files are ordinary audio and video once exported.
