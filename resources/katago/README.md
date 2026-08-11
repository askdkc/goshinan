# KataGo resource payload

This directory is copied to Electron `extraResources`, outside `app.asar`.
Executables, dynamic libraries, models, downloads, and caches are generated
locally and excluded from Git.

Prepare a target with:

```sh
npm run resources:fetch -- --platform=darwin --arch=arm64
npm run resources:fetch -- --platform=darwin --arch=x64
npm run resources:fetch -- --platform=win32 --arch=x64
```

The command verifies every downloaded file against the pinned size and SHA-256
in `sources.json`, installs the payload, updates `manifest.json`, and launches
the analysis engine to confirm that both models load. Verified downloads are
reused from the project-level `.cache/katago` directory, which is outside the
packaged `extraResources` tree.

Required targets:

- `darwin-arm64`: local Metal-enabled Apple Silicon KataGo. Install it with
  `brew install katago` or pass `--katago-binary`.
- `darwin-x64`: local Metal-enabled Intel KataGo. The binary must actually
  contain x64 code.
- `win32-x64`: pinned official KataGo 1.17.1 OpenCL archive and its DLLs.

Required models:

- A tested normal KataGo model for full-strength analysis.
- `b18c384nbt-humanv0.bin.gz` for `rank_1d` through `rank_9d` Human SL policy.

Before distributing a build, update `THIRD_PARTY_NOTICES`, run the real-engine
smoke test on all three targets, sign the installers, and notarize macOS builds.

The macOS fetcher copies non-system Homebrew dylibs, rewrites their Mach-O load
paths, and ad-hoc signs the copied files so the local smoke test can run. This is
not a substitute for Developer ID signing and notarization of the final app.
