# Releasing

Installers are built on a developer machine and attached to a GitHub release with `gh`.
There is no release automation and no GitHub Actions (ADR-0002).

## Commands

| Command                                     | What it does                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm build`                                | Build the app and the installers configured for this host OS into `release/<version>/`.                           |
| `pnpm build:check`                          | Build an unpacked app only (`release/<version>/mac-arm64/…`); runs in `pnpm ci:local`.                            |
| `pnpm package:smoke`                        | Test the packaged app (see [Packaged smoke test](#packaged-smoke-test)). Run after `pnpm build` or `build:check`. |
| `node scripts/package-smoke.mjs --dmg F`    | The same against a `.dmg`: mounts it read-only, tests the app inside it, detaches.                                |
| `pnpm icons`                                | Regenerate every icon from `build/icon.svg` (Electron rasterizes it; no design tools needed).                     |
| `pnpm release <patch\|minor\|major\|X.Y.Z>` | Dry run of a release (default). Add `--publish` to cut it.                                                        |

## Cutting a release

1. Merge everything for the release into `main`; check out `main` with a clean tree.
2. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, add a fresh empty
   `## [Unreleased]` above it, and merge that change through a PR.
3. Dry run: `pnpm release X.Y.Z`. It checks the branch, tree and CHANGELOG section, runs
   `pnpm ci:local`, bumps the version in `package.json` temporarily, builds this host's
   installers, lists them with sizes, prints the `gh release create` command and the release
   notes, then restores `package.json`. Nothing is committed, tagged, pushed or uploaded.
4. Smoke-test the installer: `node scripts/package-smoke.mjs --dmg "release/X.Y.Z/actionstations-X.Y.Z-mac-arm64.dmg"`.
5. Publish: `pnpm release X.Y.Z --publish [--issue N]`. This runs `pnpm version X.Y.Z` (commit
   `chore(release): vX.Y.Z (#N)` + tag `vX.Y.Z`), rebuilds the installers, pushes `main` and the
   tag, and creates a **draft** GitHub release with the installers and the CHANGELOG section as
   notes. Review the draft on GitHub and publish it there.
6. Installers for the other platforms: on a Windows and a Linux machine, check out the tag,
   `pnpm install --frozen-lockfile && pnpm build`, then
   `gh release upload vX.Y.Z release/X.Y.Z/<installer>` while the release is still a draft.

## Artifacts

`artifactName` is `${productName}-${version}-${os}-${arch}.${ext}`:

| Platform | Target        | Example                                      |
| -------- | ------------- | -------------------------------------------- |
| macOS    | dmg, arm64    | `actionstations-0.1.0-mac-arm64.dmg`         |
| Windows  | NSIS, x64     | `actionstations-0.1.0-win-x64-setup.exe`     |
| Linux    | AppImage, x64 | `actionstations-0.1.0-linux-x86_64.AppImage` |

Measured on Apple M-series, Electron 45 (`pnpm build`, 49 s): the arm64 dmg is 263 MB; the
app bundle is 672 MB on disk, of which `app.asar` is 208 MB and `app.asar.unpacked` 208 MB.
The largest single item is `onnxruntime-web` (121 MB inside `app.asar`), which
`@huggingface/transformers` pulls in next to `onnxruntime-node`.

## What goes into the package

- `app.asar`: `out/` (the electron-vite build), `package.json` and production
  `node_modules`. Excluded: source maps, TypeScript sources and declarations, Markdown,
  package-internal `test/`, `tests/`, `__tests__/`, `__mocks__/`, `spec/` and `fixtures/`
  folders, template `__golden__/` images, and the C sources of better-sqlite3 (it ships
  Node-API prebuilds). Native binaries of the other operating systems
  (`onnxruntime-node/bin/napi-*/<os>/`) are dropped per platform.
- `Resources/app-resources/`: `templates/` (without goldens or tests), `prompts/`, `comfy/`.
- `app.asar.unpacked` (`asarUnpack` in `electron-builder.yml`): code and data that must be
  opened with a real file path: better-sqlite3, sqlite-vec (`loadExtension`), onnxruntime-node,
  tesseract.js + tesseract.js-core + `@tesseract.js-data/eng` (OCR worker and language data),
  pdf.js standard fonts and the legacy pdf.js worker. electron-builder also unpacks every
  `*.node` file automatically (sharp, @napi-rs/canvas).
- `scripts/package-smoke.mjs` fails if `app.asar` holds anything outside `out/`,
  `node_modules/` and `package.json`, or any golden or package test folder.

Note for `electron-builder.yml`: a platform-level `files` list (`mac.files`, `win.files`,
`linux.files`) must contain at least one positive pattern. A list with only exclusions makes
electron-builder copy the whole repository (sources, `reference/`, and any untracked local
files in the checkout) into `app.asar`, which is why each one restates `out/**/*`.

## Electron fuses (#55)

Set by `electronFuses` in `electron-builder.yml` (electron-builder's built-in
`@electron/fuses` integration, flipped right after packing):

| Fuse                                  | Value | Effect                                                                       |
| ------------------------------------- | ----- | ---------------------------------------------------------------------------- |
| RunAsNode                             | off   | `ELECTRON_RUN_AS_NODE` is ignored; the binary cannot be used as Node.        |
| EnableCookieEncryption                | on    | Cookie store encrypted with the OS keychain.                                 |
| EnableNodeOptionsEnvironmentVariable  | off   | `NODE_OPTIONS` / `NODE_EXTRA_CA_CERTS` are ignored.                          |
| EnableNodeCliInspectArguments         | off   | `--inspect*` and `SIGUSR1` cannot attach a debugger to the main process.     |
| EnableEmbeddedAsarIntegrityValidation | on    | `app.asar` is checked against the hash in `Info.plist` / the exe (mac, win). |
| OnlyLoadAppFromAsar                   | on    | Electron loads the app only from `app.asar`.                                 |
| GrantFileProtocolExtraPrivileges      | off   | `file://` pages get no privileges beyond a browser's; see below.             |

`GrantFileProtocolExtraPrivileges` can be off because the main and presentation windows load
the renderer from `app://bundle/index.html`, a custom protocol that reads `out/renderer` out of
`app.asar` (#117, ADR-0013). With `loadFile()` from `file://` inside `app.asar` and the fuse off,
the load fails (`ERR_FILE_NOT_FOUND`) and the window stays blank. Render and print windows
still load temporary `file://` documents, which needs no extra privileges.

Unsigned builds: flipping fuses invalidates Electron's ad-hoc signature, which Apple
silicon refuses to run, so `resetAdHocDarwinSignature: true` re-signs ad hoc. Remove it once
a Developer ID signs the app (signing happens after the fuses are flipped).

Consequences for development and tests: unit tests (`pnpm test`) run on the unfused Electron
from `node_modules` with `ELECTRON_RUN_AS_NODE`, so they are unaffected. Playwright's
`_electron.launch()` needs `--inspect`, so it cannot drive the packaged app; the packaged
smoke test starts it with Chromium's `--remote-debugging-port` and connects over CDP instead.
That switch is a Chromium flag that no fuse controls; anyone able to start the app with
arbitrary arguments can already run code as the user.

## Packaged smoke test

`scripts/package-smoke.mjs` runs static checks, then `e2e/packaged.spec.ts` with
`TTX_PACKAGED_APP` set to the packaged executable:

- the fuse wire in the Electron binary matches `EXPECTED_FUSES` (both wires of a universal
  binary), `Info.plist` carries `ElectronAsarIntegrity`, and `app.asar` holds only what may ship;
- the app starts, creates a project and ingests a PDF (parsed in a worker thread), a DOCX and
  a PNG (tesseract OCR); search over the FTS5 + sqlite-vec index returns the right section for
  each; a `ttx-media://` image from the project decodes in the renderer;
- every inject template preview renders in the packaged render pool and matches its golden
  (`templates/injects/*/__golden__`), which also proves fonts and `file://` template loading;
- the renderer is served from `app://bundle/` (webfonts load, the path guard answers 404 for
  directories and `..` escapes), a rendered inject opens in the presentation window as a
  `ttx-media://` image, and IPC works from that window;
- runtime fuse probes: with `ELECTRON_RUN_AS_NODE=1` the binary starts the app instead of
  running `-e`; `--inspect=0` opens no debugger; a `NODE_OPTIONS=--require` script does not
  run (Electron also filters most `NODE_OPTIONS` in packaged apps, so the fuse itself is
  verified by the static check).

The spec is skipped when `TTX_PACKAGED_APP` is unset, so `pnpm e2e` is unaffected. Negative
controls were run by flipping `RunAsNode` and `EnableNodeCliInspectArguments` back on in a copy
of the app: both the static check and the runtime probes fail.

## Platform-specific native dependencies

pnpm 10 installs only the optional platform packages for the machine it runs on. A build
therefore bundles the native binaries of the host OS and CPU, and electron-builder prints
"platform-specific optional dependencies not bundled" for every other platform
(sqlite-vec-_, @img/sharp-_, @napi-rs/canvas-*). On a host build these warnings are expected
and harmless. better-sqlite3 ships Node-API prebuilds for all platforms, and
onnxruntime-node ships its binaries inside its own package.

To build for another CPU or OS, either:

- **build on the target OS** (recommended for Windows and Linux): check out the tag,
  `pnpm install --frozen-lockfile`, `pnpm build`; or
- **cross-build** after telling pnpm to install the other platforms' packages, in
  `pnpm-workspace.yaml`:

  ```yaml
  supportedArchitectures:
    os: [current] # add win32 / linux to cross-build those
    cpu: [current, x64]
  ```

  then `pnpm install --frozen-lockfile` (the lockfile does not change) and build, e.g.
  `pnpm build:app && pnpm exec electron-builder --mac --x64`.

  Undo it before the next host build with `rm -rf node_modules && pnpm install --frozen-lockfile`:
  a plain reinstall leaves the foreign packages in `node_modules/.pnpm`, and electron-builder
  then bundles them too (measured: +54 MB of darwin-x64 sharp/canvas binaries in an arm64 app).

Intel macOS (x64) was cross-built this way on Apple silicon and passed the packaged smoke test
under Rosetta (first start under Rosetta takes over 30 s). Caveat: onnxruntime-node ships no
`darwin/x64` binary, so the optional local ONNX embedder is unavailable on Intel Macs; the
built-in and provider embedders work. A universal mac build is not configured: it would need
both slices' native modules and `x64ArchFiles` for the `.node` files.

## Code signing (not configured)

No certificates exist yet: `mac.identity` is `null` and Windows builds are unsigned. Keep
every credential in environment variables or the OS keychain, never in the repository.

### macOS: Developer ID + notarization

1. Join the Apple Developer Program, create a **Developer ID Application** certificate, and
   install it in the login keychain (or export it as a `.p12`).
2. In `electron-builder.yml` (mac): delete `identity: null` (electron-builder then picks the
   Developer ID from the keychain; or set `identity: "Your Name (TEAMID)"`), add
   `notarize: true`, and delete `resetAdHocDarwinSignature` under `electronFuses`.
   `hardenedRuntime` and `build/entitlements.mac.plist` (JIT, unsigned executable memory,
   disabled library validation for the unpacked native modules) are already set.
3. Provide credentials through the environment when building:
   - certificate from a file instead of the keychain: `CSC_LINK=/path/to/cert.p12`,
     `CSC_KEY_PASSWORD=…`;
   - notarization, preferably with an App Store Connect API key: `APPLE_API_KEY=/path/to/AuthKey_XXXX.p8`,
     `APPLE_API_KEY_ID`, `APPLE_API_ISSUER` (alternatives: `APPLE_ID` +
     `APPLE_APP_SPECIFIC_PASSWORD` + `APPLE_TEAM_ID`, or `APPLE_KEYCHAIN` + `APPLE_KEYCHAIN_PROFILE`).
4. Verify: `codesign --verify --deep --strict --verbose=2 "Action Stations.app"`,
   `spctl --assess --type execute -vv "Action Stations.app"`, and
   `xcrun stapler validate "actionstations-X.Y.Z-mac-arm64.dmg"`; then
   `pnpm package:smoke` (signing must not disturb the fuses or asar integrity).

### Windows: Authenticode

Code-signing certificates now live on hardware tokens or cloud HSMs, so pick one of:

- **Azure Trusted Signing**: add `win.azureSignOptions` (`publisherName`, `endpoint`,
  `certificateProfileName`, `codeSigningAccountName`) and provide `AZURE_TENANT_ID`,
  `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` in the environment.
- **A certificate on a token / in the Windows store**: add `win.signtoolOptions` with
  `certificateSubjectName` or `certificateSha1`, `publisherName`, and
  `signingHashAlgorithms: [sha256]`; build on Windows with the token present.

Verify with `signtool verify /pa /v "actionstations-X.Y.Z-win-x64-setup.exe"`.

### Until then: installing unsigned builds

- macOS: Gatekeeper blocks the first launch. Right-click the app → **Open**, or run
  `xattr -dr com.apple.quarantine "/Applications/Action Stations.app"`.
- Windows: SmartScreen shows "Windows protected your PC" → **More info** → **Run anyway**.
- Linux: `chmod +x` the AppImage and run it.
