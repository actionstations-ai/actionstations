# 0067: AGPL-3.0 with a commercial license option

Status: accepted (owner decision; pending IP lawyer review before merge) · Issue: #554

## Context

Action Stations was source-available under the PolyForm Internal Use License 1.0.0 plus an education permission. That kept the code readable but is not open source, which blocked three goals:

- **Open source.** The project should be free software that anyone can read, run, change and share.
- **Government adoption.** Agencies and public bodies often need an OSI-approved license before they can adopt, fund or contribute to software. A source-available license is a barrier; AGPL-3.0 is widely accepted.
- **No closed hosting.** The owner does not want a third party to take the code, host it as a closed service and sell it. The AGPL network clause requires such a host to publish its changes.

## Decision

1. **Code: AGPL-3.0-only.** `LICENSE.md` holds the unmodified GNU AGPL v3 text. Every `package.json` says `"license": "AGPL-3.0-only"`.
2. **Commercial license.** Anyone who wants different terms (for example to embed it in a closed product, or host a modified version without publishing it) can get a commercial license from licensing@actionstations.ai.
3. **CLA.** Outside contributors agree to `CLA.md`. They keep their copyright and grant the project a broad license, including the right to relicense, so dual licensing stays possible. Agreement is a checkbox in the pull request template plus a `Signed-off-by` line on each commit.
4. **Trademark.** The name "Action Stations" and its logo are trademarks of the owner. The AGPL grants no trademark rights; a fork must use another name. `LICENSING.md` states this.
5. **Content packs.** Packs carry their own license in the manifest. Packs written by the project (the bundled packs' own prompts, templates, workflows and domain profiles) use **CC BY 4.0**. Third-party documents inside packs keep their own license (US Government Work, CC0, and so on). Community packs keep the license their author chose.

## Consequences

- Consultants, trainers and facilitators can now use the app for other organizations at no cost under the AGPL. The earlier restriction on that use is gone.
- A person who modifies the app and offers it to others over a network must offer those users the corresponding source.
- Earlier releases (up to and including 0.6.1) stay under the license they shipped with. Versions from the first release containing this change onward are AGPL-3.0-only.
- The relay server (`relay/`) is covered too, so a hosted relay run with changes must publish those changes.
- The education permission and `COMMERCIAL.md` are removed; `LICENSING.md` replaces `COMMERCIAL.md`.
- Dependencies must stay AGPL-compatible. Outside contributions cannot be merged without the CLA.
- Relicensing needs the consent of copyright holders. Earlier outside contributions were made under the existing CLA, which already allowed relicensing; the IP lawyer should confirm this.
