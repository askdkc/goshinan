# Go Coach Desktop App Plan

## Product Scope

Build an offline Electron desktop application that helps a Go player improve by
comparing each move with local KataGo analysis.

The first release will support:

- Windows x64.
- macOS Intel x64.
- macOS Apple Silicon arm64.
- A standard 19x19 board.
- Japanese rules.
- English and Japanese UI and coaching text.
- Local analysis after installation; no cloud service required.
- Approximate human-style opponent levels from 1 dan through 9 dan.
- Difficulty-dependent coaching strictness.
- SGF save and load.

After three consecutive unacceptable user moves, the app pauses, rejects the
third provisional move, explains the likely problem, and requires the user to
retry.

## Research Findings

- The repository is currently empty, so there are no legacy architecture or
  dependency constraints.
- KaTrain does not expose a standalone application API. It starts KataGo's
  analysis engine and communicates through asynchronous newline-delimited JSON.
- KataGo analysis responses include `moveInfos`, `scoreLead`, `winrate`,
  `policy`, `ownership`, and principal variations.
- KaTrain's calibrated-rank bot is intended for approximately 15 kyu through
  3 dan and is not sufficient for the requested 1 dan through 9 dan range.
- KataGo's Human SL model exposes `rank_1d` through `rank_9d` profiles and is
  the appropriate basis for the opponent.
- Human SL ranks are estimates based on human game data, not certified ratings.
  The UI should use labels such as "Approximate human-style 5 dan".
- Full-strength KataGo analysis should remain separate from the human-style
  opponent policy used to select AI moves.
- Native KataGo binaries and model files must be shipped outside the Electron
  ASAR archive.
- KataGo, KaTrain, network files, and their dependencies require license and
  attribution notices in the distributed application.

## Architecture

```text
Electron main process
|- Window and application lifecycle
|- KataGo EngineManager
|  |- Native process startup
|  |- JSON query writer
|  |- Asynchronous response reader
|  |- Query cancellation and stale-result handling
|  `- Crash and restart handling
|- Settings and file service
`- Validated IPC handlers
        |
Secure preload bridge
        |
React renderer
|- Game session state machine
|- Responsive SVG Go board
|- Coaching and retry UI
|- Difficulty and game settings
`- SGF review and history
```

Use the following technology choices:

- Electron Forge with TypeScript and the Webpack plugin.
- React for the renderer.
- SVG for the board, stones, markers, variations, and ownership overlays.
- `@sabaki/go-board` behind an internal game-domain adapter.
- `@sabaki/sgf` for SGF parsing and serialization.
- A reducer-based state machine for game and coaching state.
- A bilingual i18n message catalog with English and Japanese parity.
- `contextIsolation: true`.
- Renderer sandboxing enabled.
- `nodeIntegration: false`.
- Restrictive content security policy.
- Narrowly typed IPC methods instead of exposing raw Electron APIs.

## KataGo Integration

### Bundled Assets

Pin and bundle a tested KataGo release for each target:

- Windows x64 OpenCL binary, with an Eigen CPU fallback if needed.
- macOS arm64 Metal binary.
- macOS x64 Metal binary.

Bundle:

- A moderate, tested normal KataGo model for analysis and play.
- `b18c384nbt-humanv0.bin.gz` for Human SL opponent profiles.
- Analysis configuration files.
- SHA-256 checksums for binaries and models.
- A third-party license and attribution directory.

Place native binaries, model files, and configurations in Electron
`extraResources`, outside ASAR. The application must run without a separate
KaTrain installation.

### Process Protocol

Start KataGo with the analysis engine:

```text
katago analysis -config analysis.cfg -model normal.bin.gz -human-model human.bin.gz
```

At startup:

1. Start the process from the Electron main or utility process.
2. Call `query_version`.
3. Call `query_models`.
4. Verify that the normal model loaded.
5. Verify that the Human SL model reports human-profile support.
6. Report actionable setup errors if initialization fails.

The engine manager will:

- Assign unique IDs to every query.
- Match responses by query ID because responses can arrive out of order.
- Accept partial analysis reports but only commit final results.
- Cancel obsolete work with `terminate` or `terminate_all`.
- Discard stale responses after a new game, undo, or retry.
- Apply priorities so current-move analysis takes precedence over background
  analysis.
- Restart the engine after a recoverable crash.
- Never classify a timeout, crash, or uncertain result as a user mistake.

Initially use one KataGo process for both coaching and opponent analysis to
avoid loading the large models twice. Keep the two workloads logically
separate through query settings and priorities. Consider multiple processes
only if performance testing shows that one process is insufficient.

## Opponent Difficulty

Use modern KataGo Human SL profiles:

```text
rank_1d
rank_2d
rank_3d
rank_4d
rank_5d
rank_6d
rank_7d
rank_8d
rank_9d
```

For opponent queries:

- Set `humanSLProfile` in `overrideSettings`.
- Set `ignorePreRootHistory` to `false`.
- Request `includePolicy: true`.
- Sample from `humanPolicy` rather than always selecting its top move.
- Use a seedable random-number source for deterministic tests.
- Handle pass carefully; do not allow a noisy policy pass unless the searched
  result also supports passing.
- Check that the selected move is legal against the local game state.

For 7 dan through 9 dan, evaluate KataGo's documented Human SL search-blending
recipe if raw policy sampling is materially weaker than intended. Any blended
mode must be benchmarked because additional search makes play stronger but
less purely representative of human policy.

Difficulty must control both:

- Opponent Human SL profile.
- User move acceptance threshold.

## User Move Assessment

Every user move is provisional until its analysis is complete.

### Assessment Flow

1. Analyze the current position with the full-strength normal KataGo model.
2. Keep candidate markers hidden initially so the user can think independently.
3. Let the user place a legal provisional stone.
4. Analyze the position after the move.
5. Compare the played move with the best candidate using score lead.
6. If the played move was not sufficiently searched, issue a targeted query
   restricted to that move using `allowMoves`.
7. Refine both the best move and played move when the result is close to the
   acceptance boundary.
8. Commit the move if it is acceptable.
9. Keep a bad but non-third move visible with subtle feedback.
10. On the third consecutive unacceptable move, roll back the provisional move
    and enter coaching mode.

Use the following initial definition:

```text
scoreLoss = max(0, bestMoveScoreLead - playedMoveScoreLead)
```

Initial thresholds are starting points and must be calibrated with test games:

| Difficulty | Maximum score loss |
| --- | ---: |
| 1 dan | 1.50 points |
| 2 dan | 1.35 points |
| 3 dan | 1.20 points |
| 4 dan | 1.05 points |
| 5 dan | 0.90 points |
| 6 dan | 0.80 points |
| 7 dan | 0.70 points |
| 8 dan | 0.60 points |
| 9 dan | 0.50 points |

The classification must also account for confidence:

- Require a minimum visit count for both compared moves.
- Ignore tiny differences within the engine's uncertainty range.
- Use win-rate loss as supporting evidence, not the sole decision metric.
- Treat pass, resignation, illegal moves, and game-ending moves explicitly.
- Avoid penalizing a move when the engine cannot establish a stable ranking.

An acceptable move resets the consecutive-error counter. An unacceptable move
increments it. A good retry resets the counter and resumes play.

## Coaching Mode

When the third consecutive unacceptable move occurs:

1. Do not commit the third provisional move.
2. Pause the game.
3. Run deeper analysis for the played alternative and the best alternative.
4. Compare ownership before and after both choices.
5. Identify a reliable explanation category.
6. Show the affected region and objective evidence.
7. Ask the user to reconsider and place another move.
8. Reveal more help only when requested.
9. Require an acceptable retry before continuing.

### Explanation Priority

Use deterministic offline heuristics in this order:

1. Self-atari, capture, liberty, or ko oversight.
2. Failure to answer an urgent opponent threat.
3. Leaving an unsettled or endangered group to play elsewhere.
4. Large ownership swing near a group or local fight.
5. Playing in a low-value area while a larger urgent area remains.
6. Overconcentration or inefficient duplicate defense.
7. Endgame timing or move-value loss.
8. Generic score-loss explanation when no specific diagnosis is reliable.

Use cautious wording such as "likely" when the cause is inferred rather than
directly established. Every explanation should include as much of the
following as the analysis supports:

- Played coordinate.
- Recommended coordinate.
- Score loss in points.
- Win-rate change when meaningful.
- Highlighted affected region.
- Short principal variation.
- Ownership comparison.

### Staged Hints

The retry interface should progressively reveal:

1. A conceptual explanation without revealing the exact answer.
2. A highlighted region to reconsider.
3. Candidate markers.
4. A short principal variation.

The user must be able to request the next hint without leaving the game.

## User Interface

The main game view should contain:

- A prominent responsive 19x19 board.
- Player colors and turn indicator.
- Difficulty and engine status.
- Move number and consecutive-error status.
- Undo, pass, resign, new game, save SGF, and load SGF controls.
- Optional candidate and ownership overlays.
- A coaching panel that explains the current issue.
- A compact variation viewer.

The default play view should stay focused and avoid displaying every engine
number. Detailed score, policy, ownership, and visit data belongs behind an
analysis/details view.

The UI must support:

- Mouse and keyboard board navigation.
- Visible focus states.
- Screen-reader labels for board intersections and actions.
- Reduced-motion preferences.
- Responsive layouts for small laptop windows.
- Japanese coordinate and coaching terminology without changing internal GTP
  coordinates.

## Game Domain

Implement and test a local game model that owns:

- 19x19 stone state.
- Current player.
- Move history.
- Captures.
- Japanese ko legality.
- Suicide prevention.
- Passes.
- Resignation and game completion.
- Provisional move and retry state.
- SGF conversion.

The renderer must not be responsible for authoritative legality. All move
requests should pass through the game domain before being sent to KataGo.

## Persistence and SGF

Persist locally:

- Selected difficulty.
- Language.
- Board and rules settings.
- Engine preferences.
- Window preferences where appropriate.
- Current resumable session.

SGF files should preserve:

- Standard game properties.
- Move history.
- Japanese rules and komi.
- Coaching notes generated by the app.
- Optional analysis metadata only when explicitly selected by the user.

Do not store large ownership arrays in ordinary preferences. Keep analysis data
in SGF or a dedicated session file with a version field.

## Security and Packaging

- Load only packaged local renderer content.
- Use a custom local protocol where practical rather than unrestricted
  `file://` access.
- Validate every IPC sender.
- Expose only purpose-built preload methods.
- Do not expose `ipcRenderer`, Node, or shell APIs to the renderer.
- Restrict navigation and new-window creation.
- Keep network access disabled by default after installation.
- Validate model and engine paths against known packaged locations.
- Never construct shell commands from renderer input.
- Place binaries and models outside ASAR.
- Include checksums and verify resources before startup.

For release distribution:

- Sign and notarize macOS builds.
- Code-sign Windows installers and executables.
- Keep signing credentials outside the repository.
- Produce separate installers for macOS x64 and arm64.
- Include KataGo, KaTrain, model, font, and dependency notices.
- Document the exact binary and model versions in the About dialog.

## Development Phases

### Phase 1: Scaffold

- Initialize Electron Forge, TypeScript, React, Webpack, tests, linting, and
  formatting.
- Add `.gitignore`, README, license, and third-party notice structure.
- Configure secure BrowserWindow defaults and the preload bridge.

### Phase 2: Game Core

- Implement the 19x19 Japanese-rules game domain.
- Add captures, suicide, ko, pass, undo, resign, and game completion.
- Add the responsive SVG board.
- Add unit tests and SGF round-trip tests.

### Phase 3: KataGo Service

- Implement typed KataGo query and response models.
- Implement subprocess lifecycle and asynchronous JSON parsing.
- Add startup model/version checks.
- Add cancellation, stale-result handling, timeout handling, and restart logic.
- Add a fake engine and recorded response fixtures.

### Phase 4: Analysis and Opponent

- Add full-strength candidate analysis.
- Add targeted move refinement.
- Add Human SL rank profiles and policy sampling.
- Add difficulty persistence and opponent move integration.
- Add board candidate/PV/ownership overlays.

### Phase 5: Coaching

- Add provisional user moves.
- Add score-loss comparison and confidence rules.
- Add consecutive-error state transitions.
- Add third-mistake rollback and retry mode.
- Add deterministic explanation heuristics and staged hints.
- Add complete English and Japanese copy.

### Phase 6: Review and Distribution

- Add SGF save/load and session restoration.
- Add game summary and mistake history.
- Add packaged KataGo resources for each platform.
- Add checksums and license notices.
- Configure installers, code signing, notarization, and release CI.

## Testing and Acceptance Criteria

### Unit Tests

- Captures, liberties, suicide, simple ko, pass, and game completion.
- Coordinate conversion between board, SGF, and GTP formats.
- SGF serialization and parsing.
- Score-loss threshold classification.
- Streak reset and third-error transitions.
- Deterministic Human SL move sampling.
- Explanation category selection.

### Engine Contract Tests

- Successful final analysis.
- Partial analysis followed by final analysis.
- Out-of-order responses.
- Warnings and field additions.
- Query termination.
- Stale results after undo or retry.
- Engine timeout and crash recovery.
- Missing or invalid model resources.

### UI and End-to-End Tests

- Place legal and illegal stones.
- Complete a game against the opponent.
- Change difficulty and restore it after restart.
- Trigger one and two consecutive mistakes.
- Trigger the third mistake and complete a retry.
- Reveal staged hints.
- Switch languages.
- Save and load SGF.
- Resume an interrupted session.

### Platform Tests

- Run real KataGo smoke tests on Windows x64.
- Run real KataGo smoke tests on macOS Intel.
- Run real KataGo smoke tests on macOS arm64.
- Verify packaged builds work without KaTrain installed.
- Verify all bundled resources are found outside ASAR.
- Verify signed and notarized artifacts.

### Acceptance Criteria

- The app starts and validates its local engine without network access.
- A user can play a complete 19x19 Japanese-rules game against every displayed
  difficulty.
- A legal user move is never rejected solely because analysis timed out or
  failed.
- Three consecutive classified mistakes reliably enter coaching mode.
- The third provisional mistake is not committed to the main game branch.
- Coaching advice is backed by visible score, variation, ownership, or local
  tactical evidence.
- A successful retry resumes the game and resets the error streak.
- English and Japanese interfaces contain equivalent functionality.
- SGF save/load preserves the game accurately.
- Windows and both macOS architectures run from their packaged installers.

## Calibration Work

Before release, benchmark each Human SL profile against a fixed collection of
reference games and self-play opponents. Check that displayed levels are
approximately monotonic in strength and document any known limitations.

Calibrate coaching thresholds using representative positions from:

- Opening.
- Fighting and tactical sequences.
- Life and death.
- Joseki deviations.
- Direction of play.
- Middle-game transitions.
- Endgame.

Prefer false negatives over confidently interrupting users for engine noise.
The application should teach important, stable mistakes rather than every
small score fluctuation.

## Sources

- KaTrain: https://github.com/sanderland/katrain
- KaTrain v1.19.0: https://github.com/sanderland/katrain/releases/tag/v1.19.0
- KataGo Analysis Engine: https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md
- KataGo Human SL guide: https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md#human-sl-analysis-guide
- KataGo releases: https://github.com/lightvector/KataGo/releases
- KataGo network license: https://katagotraining.org/network_license/
- Electron process model: https://www.electronjs.org/docs/latest/tutorial/process-model
- Electron security: https://www.electronjs.org/docs/latest/tutorial/security
- Electron ASAR archives: https://www.electronjs.org/docs/latest/tutorial/asar-archives
- Electron Forge Vite/TypeScript template: https://www.electronforge.io/templates/vite-+-typescript
- Electron Forge macOS signing: https://www.electronforge.io/guides/code-signing/code-signing-macos
- Electron Forge Windows signing: https://www.electronforge.io/guides/code-signing/code-signing-windows
- Sabaki Go board: https://github.com/SabakiHQ/go-board
- Sabaki SGF: https://github.com/SabakiHQ/sgf
