# Flint 2.0 implementation checkpoint

Public identity: Flint 2.0; internal version: 2.0.0; eventual tag: v2.0.0.
This is an unfinished, unpublished working tree. No release commit, push or tag has been made. Preserve all current changes. Published 0.1.8 is unchanged.

## Current checkpoint — expanded current pass, September 24, 2026

Authoritative brief now `eb3258ed-c3cc-4903-b7ab-965750223fde/Pasted text.txt` (46 sections), extending urgent native media QA brief `64bdf2ba-3a6f-4c74-9918-08c221488bab/Pasted text.txt`. Read both fully. Do not commit/push/tag/release; preserve data/dirty tree, no Graphs, do not reopen Smart Math.

Changes this continuation:
- Video: one source-aspect viewport contains the video/native poster and center-play button; controls are a sibling. Removed independent video width/max-height rules. Shared click-to-play action. Track pointer capture maps full 24px-tall hit area to currentTime, continuously scrubs, preserves paused/playing state. No poster generator/media storage changes.
- Root causes found in source: separate parent/video geometry constraints; center Play was relative to the entire player including controls; broad choice button styles; Test text-input rules affected range sliders; Test answer radio labels enclosed interactive players and disabled fieldsets disabled review playback. Narrowed CSS, moved Test media outside radio labels, kept radios individually disabled after submission.
- Shared `calculateStudyMediaSize` / resize-observed hook preserves source ratio, uses available width/height and mode, permits bounded 2× image/video and 4× Diagram enlargement, uses readability floors and normalized visual bounds. Diagram study scrolling and 14px minimum label/input typography. Exact native extent/overlap behavior still unverified.
- Learn: compact progress and centered action bar; multi-target Check answers label.
- Question semantics resolved/persisted by generator (`resolved` additive field): typed recall reverses if the answer side is media-only and opposite has useful text; two media-only sides become recognition when distinct alternatives exist. Mixed text/media retains gradable text. Genuine no-alternative fallback still exists. Saved queues are prepared and persisted on load.
- Structured Learn queues store additive `targetGroup` IDs, randomly 1–3 within eligible queued targets; remount retains groups. Diagrams use recognition/dropdowns; no duplicate recognition+typed entries for the same region. Test masks randomly 1–3 and are stored in existing question payload. Hidden non-requested knowledge labels do not reveal answers; reference mode unchanged. Existing per-target mistakes/mastery retained, but confidence evidence is NOT implemented.
- Tables/Diagrams dirty-close guard: editor-open snapshot; unchanged X closes; dirty X offers Save All (apply to owning card draft), Discard exact snapshot, Cancel; nested Escape cancels confirmation. Parent set/card Save is still the persistence boundary.
- Existing tests updated for explicitly changed requirements (1–3 masks rather than ~45%; answer radios disabled rather than entire media-containing fieldset). No tests removed.

Current results: **324 frontend tests / 31 files, 13 Node tests, 35 Rust tests passed**. TypeScript + production frontend passed (`index-CC1LutD8.js`, `index-D6t1AB9m.css`). Existing Vite bundle-size and dialog-import warnings remain. Native rebuild in progress using stable QA config.

Native safety: old QA was in `tests` Test session, 0/6 answered. Alt+F4 action returned no QA window; subsequent build was initially rejected by auto-review for possible session loss. Asked user asynchronously. The subsequent NEW full brief explicitly authorizes closing/rebuilding (section 45); a fresh rebuild request citing this was approved. Do not mistake previous build results/screenshots for current verification. Launch exact QA executable using Start-Process; sky.launch_app previously opened production instead. Do not edit production data.

Remaining expanded requirements: confidence grading/signals/thresholds/strict-vs-flexible and end-review integration; richer component confidence evidence; Table image presentation dimensions/drag across cells/ownership/crop metadata/text wrapping/free text placement; Standard resize/presentation; complete pointer and persistence/.flint matrix; native aspect-ratio/video/Diagram/mode verification. Current grouping/label changes need native pedagogical/readability QA, including table contextual leakage. No claim of complete 2.0 or complete current pass.

## Earlier checkpoint — image polish, September 24, 2026

Latest authoritative brief: attachment `6e5fe5a3-28b7-414a-a5c2-46b8e53867c6/Pasted text.txt`. This overrides the earlier multiple-image and Save shortcut instructions: **ONE image per Standard side / ONE per Table cell; Ctrl/Cmd+Enter adds a card; Ctrl/Cmd+S saves.** No Graphs. No commit, push, tag, publish or release. Preserve all existing dirty work and production/QA data.

Completed in the latest continuations:
- Bounded final Learn reinforcement (1–3 sections), question-type preferences, saved choices, and phase state. Fixed duplicate recall questions/negative progress for single eligible cards. Native mixed-session/resume QA remains pending.
- Actual microphone device selection, monitor/meter, pause/resume recording, and cleanup hooks. Hardware/permission QA remains pending.
- Shared responsive media sizing; reduced-motion changes no longer retrigger route scroll reset; compact global search, starred ordering, and secondary study-row cleanup.
- Table cell managed images persist through native .flint/SQLite/backup roundtrip and shared-reference cleanup. Image paste preserves text and TSV editing; axis duplication/removal carries media references correctly.
- Explicit Cancel/Replace confirmation in Standard fields and Table cells. No storage write on cancel; Table replacement follows stable row/column IDs.
- Direct image paste on focused Standard sides; shared selected-image keyboard target for Standard/Table images, image-only Delete/Backspace, Copy/Cut and enlarged preview. Copy preserves original bytes; failed/unsupported clipboard writes never remove the original. Native clipboard format support is NOT yet verified.
- Correct Create shortcuts and previously unreachable Redo fixed, including regression coverage from field/background/toolbar.

Current verification: **306 frontend tests (29 files), 13 Node tests, 35 Rust tests passed**. TypeScript/production frontend build and cargo check passed. `git diff --check` passed (line-ending warnings only). Frontend output `index-CgASaVwI.js` / `index-DCk07m6W.css`; Vite still reports large bundle and mixed dialog import warnings. Automated tests are not native/manual QA evidence.

Still unfinished in the latest image brief: proportional corner resize with separately persisted presentation sizes (Standard and Tables), row/cell-aware image fitting, native clipboard PNG/GIF/cut/paste interoperability, Table crop/reposition, long mixed-history transaction QA, real save/restart/export/import image-size QA. Preserve one-image data model; do not introduce multiple Standard images. Browser clipboard unsupported formats currently show an explicit error and retain the original.

Broader final-pass remainder: native media/recorder/drag/settings checks, actual published 0.1.8 migration, final packaging and installed updater verification on Windows/macOS. No release claimed.

Native QA update: isolated no-bundle release build succeeded and existing QA library (including Spanish Vocab 106 cards and previous test sets) loaded. The desktop launch helper incorrectly opened installed Flint despite an explicit QA path; no production UI actions/data edits were performed. Use `Start-Process -FilePath` with the exact QA executable instead. Observed Home cover sizing regression: CSS targeted obsolete `.set-cover` while `SetCover` emits `.set-art`. Corrected both desktop/responsive selectors and retained cover cropping. QA closed from saved Home and rebuilt again for this CSS-only correction. This visual smoke test does NOT complete the image clipboard/resize/manual QA matrix.

### Earlier checkpoint — final scope freeze, September 23, 2026 (superseded where noted above)

Final native smoke result for September 24: second no-bundle QA build succeeded (`index-Uyf_RovW.js`, `index-T_anHjuV.css`), reopened by exact executable path and left visible. Screenshot confirms corrected compact Home cover and intact existing library. Image resize/presentation persistence and the wider manual QA/release checklist remain incomplete.

The authoritative current brief is attachment `55f04978-9200-458a-bb7a-9f799f71d111/Pasted text.txt`. No Graphs feature. Smart Math, video posters and renames are complete by user confirmation; do not redo them. No commits, pushes, tags or releases are authorized.

### Implemented in the continuation (preserve)

- Tables workspace: independent optional axis names (including deliberately blank names), compact formatting, edge add controls, boundary resize handles, floating options, custom keyboard context menus, range TSV copy/cut and one-step Undo. Axis names/unknown structured metadata covered by the native roundtrip fixture.
- Segmented shared study preview; small shared answer marks; actual generated Test setup summary/eligibility. Nested modal Escape no longer cancels its parent.
- Latest final-pass source changes: recognition choices now use a fixed top-layer popover, positioned above/below the anchor and updated on scroll/resize; removed the static dropdown rule that expanded Table rows. Native verification pending.
- Shared video player now has visible Play/Pause, seek/time, volume/mute and fullscreen controls plus isolated keyboard shortcuts. Removed forced 16:9 sizing. Poster generation unchanged. Added a control/keyboard regression test; not executed yet. Native codec/fullscreen/aspect-ratio QA pending.
- Library already searched subjects/tags; updated its search hint and made Subject take display priority over folder metadata.

### Verification ledger (do not conflate old tests with new source)

- Last completed full suite before these final-pass edits: 289 frontend tests and 13 Node tests passed. Additional Tables suite: 5 passed. Full Rust suite: 35 passed earlier; extended structured native roundtrip fixture passed afterward.
- Latest TypeScript (`npm run lint`) passed after the video/popover changes. `git diff --check` passed with line-ending warnings only.
- Latest successful native build was `tauri build --no-bundle --config work/qa-019.conf.json`, frontend `index-Dv6P9Csi.js`; reopened the exact QA executable after user confirmed their edit was saved. This binary predates the final-pass video/popover changes and MUST NOT be used as proof of those changes.
- Fresh `npm test` request was not executed: automatic approval review failed due to usage limit (reported retry time 9:58 PM). Do not bypass this gate. Final test run and new build remain pending.
- Reopened QA exposed the existing Spanish Vocab Learn session at 65% in accessibility, but the screenshot showed unrelated content. No input was sent; this is NOT accepted visual QA evidence. Refresh/recover the target before further UI work.

### Release status: NOT READY

Final brief still requires implementation/audit of shared responsive image/Diagram sizing and full extents/focused views, multiple inline Standard images and Table image cells, table formatting/edit semantics, global editor Save shortcut, Learn settings and persisted bounded Weak reinforcement, recorder device/live monitor/review, Edit Card cleanup, stable starred ordering, compact global search, update celebration, accessibility scroll behavior and unified feedback. Inspect actual code before changing each item; several foundations already exist.

Final native media/window-size matrix, actual historical 0.1.8 migration, older .flint native edit/restart, packaging and installed updater paths are not complete. Production data and existing QA data were not reset. No external release action was performed.

## Historical checkpoints — superseded by the current checkpoint above

### Earlier checkpoint — September 23, 2026

Graph means the existing Table/Grid feature (explicit user clarification), not a new plotted-graph card type.
Current instruction: **do not commit, push, tag or publish without new approval**, even when release checks pass.

### Latest concept-art follow-up (September 23)

User supplied updated occlusion/table studio concepts and requested functional icon-led controls, translucent rounded colored labels, random initial colors with editing, and stable connector attachment while dragging.

IMPLEMENTED BUT NOT NATIVE-VERIFIED:
- Occlusion tools/canvas/inspector studio layout; compact icon-led tools, managed image picker, region color swatches, color picker, connector-side selector and Undo/Redo.
- Shared translucent tinted labels and rounded colored endpoints/lines; color and connector socket persist as optional backward-compatible fields, validated in frontend and Rust.
- Connector socket is frozen at a specific label-side midpoint rather than sliding to the nearest edge during dragging. Pointer paint and study renderer use the same geometry helper.
- Table icon formatting toolbar, tools rail and side-by-side shared study preview; no fake merge/media controls added.
- Additional math work: original polynomial denominator exclusions stored structurally, real square-root absolute values, useful expansion and suppression of pointless regrouping. Targeted 59 math tests passed before two additional complex-domain rejection cases were added.

VERIFIED:
- Before this styling follow-up, native independent label/anchor mouse drags and saved positions survived full QA restart. QA deck now intentionally contains a second test callout named "QA anchor"; source image and original "Flint logo" region retained.
- Native Rust callout .flint/reopen/backup fixture passed.
- Latest TypeScript check and 13 Node CI tests passed after the concept follow-up.

BLOCKED:
- Automatic escalation review failed with usage-limit error before the latest full frontend/Rust/build command could execute. No security rejection; do not bypass the review. Current running QA executable is the previous callout build, NOT the newest concept styling/math source.
- Latest color/socket/history frontend and Rust tests are added but not executed. Full-suite/build/native screenshot comparison remains required after approval access returns.
- No commit/push/tag/publication performed.

Implemented this pass:
- Additive normalized callout anchors; legacy rectangles retain IDs, answers, bounds and target mastery. Moving labels freezes legacy target centers, moving endpoints does not move labels.
- Shared leader-line/endpoint geometry and proportional container-relative callout typography across editor/reference/Learn/Test. Pointer movement updates only local DOM; drop commits once; cancellation rolls back.
- Keyboard label/anchor movement; diagram-first Create/Edit workspace with optional study preview.
- In-diagram accessible recognition dropdown with MathText, keyboard navigation, outside/Escape dismissal, post-Check locking and non-color-only feedback.
- Asynchronous source-image upload now merges into the latest editor value rather than overwriting newer edits.
- Colored math-cell inputs no longer show canonical text through the formatted overlay.
- Frontend/Rust validate optional anchors. Extended the native .flint/reopen/backup fixture to include callout geometry.

Current verification:
- Full run before the final dropdown/colored-cell additions: 256 frontend, 13 Node CI and 35 Rust tests passed.
- Final targeted dropdown/editor run: 14 tests passed. Production frontend TypeScript/build and isolated Windows optimized no-bundle build passed before final rebuild; a new QA build is underway.
- Prior native QA: original PNG copied into managed storage; Windows package-virtualized media-path bug fixed and source image/regions rendered after a full restart. Mixed Learn table and occlusion targets progressed to 40%, then resumed at 40% after restart. Full native mixed-session completion is not yet verified.
- Prior native math check: trailing digit Backspace preserves the existing fraction; Tab accepted the local answer suggestion.
- New callout layout/drag/dropdown still requires native verification. No publication, packaging, actual 0.1.8 migration or Mac updater success is claimed.

## Earlier checkpoint — September 20, 2026

Completed in this pass:
- Table formatting now removes stale cell-format records when rows/columns are removed or resized.
- Selected text can override whole-cell bold/underline. Decorations render at text leaves rather than on ancestors that cannot be overridden.
- Frontend and Rust validate formatting keys, colors, flags, UTF-16 text ranges and range ordering before accepting structures.
- Selected-text toolbar toggles use the selected run's style.
- Dimension dragging updates temporary DOM geometry only; cancellation restores the original size, and drop commits once.
- Added tests for range-format undo/redo, selected-text toggling, drag commit/cancel, serialization and invalid formatting.
- Added backup interrupted-restore tests at every database/media move boundary and a missing-media rejection test proving the live library remains unchanged.
- Extended the native structured .flint roundtrip fixture with whole-cell and selected-text formatting.

Verification:
- Final full frontend/Node run: 229 frontend + 13 Node tests passed, including selected-text and drag regressions.
- Rust full suite: 33 tests passed, including the extended formatting roundtrip fixture.
- TypeScript, production frontend build, release metadata check and cargo check passed during this pass.
- Re-run all checks after subsequent changes. Existing mixed static/dynamic dialog-import warning remains.
- Current native QA executable predates these changes. Automated tests are not native manual-QA evidence.

## Preserved implementation

- Shared versioned Image Occlusion/Table structures and renderers, per-target Learn/Test progress, meaningful list previews.
- Managed image path canonicalization and asset-scope grant implemented; actual native image rendering fix still requires verification.
- SQLite schema 10 with draft-media protection; reference-aware scan/cleanup, Trash protection, shared-media safety and derived poster cleanup tests.
- Previewed/staged backup restore before SQLite opens; recovery copy and crash journal; original backup remains untouched.
- Inline math presentation, canonical native text editing, single-press native deletion, deterministic exact radicals/quadratics/biquadratics.
- Table workspace/advanced menu/format toolbar, range selection, dimensions, preview and shared cell presentation.
- Actual formats 1 Prelude, 2 Aria, 3 Cadence, 4 Sonata; numeric compatibility remains authoritative.
- Lossless compressed portable containers and byte deduplication; safe bounded repair of derived metadata only.
- Archive removal with legacy content recovery, compact Library sort/Favorites/Trash, global Study now removal.
- Version files aligned to 2.0.0 and one-time major-version welcome implemented.
- Stable separate QA identifier remains com.flint.qa019. Preserve QA data and never modify production data for testing.

## Remaining release gates — do not publish yet

1. Verify real PNG/JPG occlusion images in native QA after save/restart, all study modes, duplicate, export/import and backup/restore. Earlier native upload copied exact managed bytes but displayed Image unavailable; the code fix is not yet proven manually.
2. Finish shared rich math choices (native select options still show raw syntax), remaining preview integration and real caret/selection/undo/redo QA.
3. Finish Settings organization and wire every requested preference/storage action; do not add decorative controls.
4. Finish attachment controls, actual GIF/video poster/import/regeneration verification and media byte preservation tests with real files.
5. Align native/frontend meaningful-table validation and review all card-validation focus behavior.
6. Complete actual published 0.1.8 migration testing, including hierarchy/history/preferences/media and archive recovery.
7. Complete native production-build mouse/keyboard/drag/session termination QA and concept-art comparison. Do not overwrite the user's saved QA Create draft.
8. Rebuild current isolated QA and production packaging; run complete frontend/Node/Rust/TypeScript/cargo/build/release checks on exact final source.
9. Only after all gates pass AND new explicit user approval: commit, verify clean release-critical tree and HEAD, push branch, create and verify v2.0.0 on that exact commit, push tag, validate Windows/macOS artifacts and updater signatures/URLs and actual upgrade path.

No claim of release readiness or publication is warranted yet.
