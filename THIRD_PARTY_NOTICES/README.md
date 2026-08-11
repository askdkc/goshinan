# Third-party notices

The packaged application must include the exact license text and attribution
for every binary, neural-network file, font, and dependency actually shipped.
This directory currently records the source projects used by the application;
it is not a substitute for the release-time license audit.

- KataGo: <https://github.com/lightvector/KataGo> (MIT executable/source code)
- KataGo network license: <https://katagotraining.org/network_license/>
- Sabaki Go Board: <https://github.com/SabakiHQ/go-board>
- Sabaki SGF: <https://github.com/SabakiHQ/sgf>
- Electron: <https://github.com/electron/electron>
- React: <https://github.com/facebook/react>

Pinned network payloads:

- Normal model:
  `kata1-b18c384nbt-s9732312320-d4245566942.bin.gz`, SHA-256
  `ff8940cbb77d6b3a4279a73332541f28fd2c0870a26fdd6a5272d309ce2cea0b`,
  from <https://katagotraining.org/networks/>.
- Human SL model: `b18c384nbt-humanv0.bin.gz`, SHA-256
  `637746e44f0efe00ad1245a50aa9bbf0716efe364c43965ead97bd6835d84ab5`,
  from <https://github.com/lightvector/KataGo/releases/tag/v1.15.0>.

The exact pinned Windows payload is recorded in
[`KATAGO_WINDOWS.md`](KATAGO_WINDOWS.md). That file is maintained by the
weekly KataGo release workflow from GitHub's release asset metadata.
The macOS payload includes the selected local KataGo binary and its non-system
dynamic-library dependencies. A release must add the exact license texts for
those resolved dependencies; this file records sources but is not yet a
complete binary-distribution notice bundle.
