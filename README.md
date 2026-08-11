# Go Shinan

[日本語版 README / Windows・macOS ビルド手順](README.ja.md)

Offline Electron desktop Go coach for 19x19 Japanese-rules games. It separates
full-strength KataGo analysis from Human SL policy sampling and rejects the
third consecutive, confidently classified mistake until the user finds an
acceptable retry.

## Implemented

- Secure Electron main/preload/renderer split with sandboxing, context
  isolation, deny-by-default navigation/permissions, CSP, validated IPC, and
  Electron fuses.
- Immutable Go domain adapter over `@sabaki/go-board`: capture, suicide,
  simple-ko, pass, two-pass completion, resignation, undo, and coordinates.
- SGF parse/serialize through `@sabaki/sgf`, including Japanese rules, komi,
  resignation, pass moves, and coaching comments.
- Newline-delimited KataGo process manager with ID routing, out-of-order and
  partial response handling, cancellation generations, timeouts, crash restart,
  startup version/model checks, and verified resource paths/checksums.
- Human SL `rank_1d` through `rank_9d` policy sampling with deterministic RNG,
  legal-move filtering, and guarded pass behavior.
- Difficulty-specific score-loss assessment, visit/uncertainty gates,
  third-mistake rollback, retry mode, deterministic coaching categories, and
  four staged hints.
- English/Japanese UI, keyboard-navigable responsive SVG board, reduced-motion
  support, candidate/ownership overlays, persistence, and SGF dialogs.

## Requirements

- Node.js 22.12 or newer. On the current development machine, use:

  ```sh
  PATH=/opt/homebrew/opt/node@22/bin:$PATH npm install
  ```

- A Homebrew or custom Metal KataGo build on macOS. Windows downloads the
  official OpenCL build. Models and native payloads are generated locally and
  are not committed.

Without those assets the application starts in a deliberate `Assets missing`
state. Local legality, SGF, and manual alternating play remain available, but
opponent analysis and coaching do not pretend to work.

### Automatic resource downloads

Run the implemented explicit fetch command before starting or packaging:

```sh
# macOS Apple Silicon (run `brew install katago` first)
npm run resources:fetch -- --platform=darwin --arch=arm64

# Windows x64
npm run resources:fetch -- --platform=win32 --arch=x64
```

It downloads the pinned normal and Human SL models, verifies sizes and SHA-256
hashes, prepares the platform binary and native libraries, updates the runtime
manifest, and starts KataGo to verify that both models load. macOS uses a local
Metal KataGo because upstream does not publish precompiled macOS executables;
pass `--katago-binary=/absolute/path/to/katago` to select one explicitly.

The command is deliberately not a side effect of `npm install`, `npm start`, or
first launch. See `resources/katago/README.md` for platform details and failure
modes.

Downloaded binaries, models, archives, caches, and partial files are excluded
by `.gitignore`. Only the resource manifest, configuration, checksums, and
license records belong in Git.

## Development

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run resources:fetch -- --platform=darwin --arch=arm64
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run typecheck
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run lint
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm start
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run package
```

`npm run package` builds the current host architecture. Separate release jobs
are still required for Windows x64, macOS x64, and macOS arm64. Signing and
notarization credentials must remain outside this repository.

## Release blockers

This source implementation is not a distributable product until release
engineering completes the exact third-party license bundle, calibrates ranks
and coaching thresholds, runs the resource fetch and packaging tests on every
target, and configures signing/notarization.
