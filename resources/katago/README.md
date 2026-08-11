# KataGo resource payload

This directory is copied to Electron `extraResources`, outside `app.asar`.
The repository intentionally does not contain KataGo executables or neural-net
weights. Release engineering must add the exact files named by `manifest.json`
and replace every placeholder with the file's lowercase SHA-256 digest.

Required targets:

- `darwin-arm64`: Metal-enabled Apple Silicon KataGo.
- `darwin-x64`: Metal-enabled Intel KataGo.
- `win32-x64`: OpenCL KataGo. Ship and select an Eigen fallback if OpenCL
  initialization cannot be guaranteed on supported Windows machines.

Required models:

- A tested normal KataGo model for full-strength analysis.
- `b18c384nbt-humanv0.bin.gz` for `rank_1d` through `rank_9d` Human SL policy.

Before distributing a build, update `THIRD_PARTY_NOTICES`, run the real-engine
smoke test on all three targets, sign the installers, and notarize macOS builds.
