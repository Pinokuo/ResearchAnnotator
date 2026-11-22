## Public beta milestone (2026-11-22)

The 2.43.0-beta.1 milestone supersedes the prior deletion-regeneration policy: intentional managed-note deletion persists a management tombstone until explicit Recreate / Resume management. Add inline palette actions and packaged logo; per-note color order with explicit one-time rebuilds in all modes; previewed native highlight color mapping with persistent jobs, recoverable journals and conflict-aware Undo. Preserve structured data and PDF bytes; never import embedded annotations automatically or generate AI during mapping. See BETA_READINESS.md, INSTALLATION.md and CHANGELOG.md for current behavior and compatibility.

## Reliability milestone update (2026-11-22)

The targeted reliability suite preserves the 398 baseline cases and adds focused lifecycle, recovery, provenance, library-aware modes, fail-closed safety and real-browser help coverage. Run the explicit regression command including reliability-help-browser.test.cjs. Native lifecycle and Chat probes exercise actual Workspace generation/bulk/capture controls in an isolated Zotero profile. The PEDOT PDF is labelled synthetic; providers are loopback only. Final packaged report names and counts follow in the delivery evidence. See RELIABILITY_AUDIT.md for the distinction between native integration, browser fixtures, mocks and remaining acceptance.

## Integrated refinement update (2026-11-17)

Refinement verification: complete regression log refinement-regression-final.txt; native source checks NATIVE_UI_UX_REFINEMENT_SOURCE_7.json (30 passed), native note H2 ratio 1.1 and 100 unchanged rebuilds both before and after editor normalization. Browser layout coverage retains 3/5/8/12 colors and wide/compact viewports for both popup types. Final packaged report and hashes are recorded in the development-build inventory. Distinguish controller mocks, real Edge rendering and isolated native Zotero checks; these do not establish manual cross-platform acceptance. See REFINEMENT_AUDIT.md.

# Development baseline and testing

## UI/UX consolidation verification (2026-11-17)

All **372 regression tests pass** with no failures or skips: **362 service/mocked
cases and ten real Edge browser fixtures**. All 356 baseline tests are retained.
Log: ui-ux-regression-release.txt. Added coverage includes shared conversation identity,
source/retrieval and question/capture drafts, simultaneous views, duplicate submit
protection, keyword/missing-embedding guidance, geometry, shutdown, guided note
creation, contextual management, structured roles (including semicolons), tab state
and compact overflow. The managed-note 100-rebuild and repair tests still pass.

Checks: 27 runtime JavaScript files and 27 test/development scripts parse; six XHTML
and three SVG files parse as XML; git diff --check passes. package-dev.ps1 verifies
43 allowlisted files against their source hashes. Tests, fixtures, reports,
screenshots and backups are excluded from the XPI.

Native Zotero 10.0.8 source verification: NATIVE_UI_UX_SOURCE_7.json records 24 passing
checks and 37 trusted pointer interactions, plus real native Tab input. It confirms
shared identity/drafts/restart, one expanded window, source citations opening exact
known fixture positions in both views, shared capture preview/completion, matching
annotation reuse without implicit AI, return to sidebar and one keyword answer
while expanding/closing the window. Paid-provider equivalents use only the isolated
loopback provider at 127.0.0.1:18768. No external AI/embedding requests are used.

Final exact-XPI evidence and screenshot inspection are recorded in
UI_UX_VERIFICATION.md. Native screenshot captures use Zotero's compositor. The
computer-use bridge was attempted but its native pipe was unavailable; this is not
an interactive desktop/screen-reader acceptance run. Browser fixtures use real DOM
interaction with mocked Zotero services; native tests use the actual Zotero database,
reader, annotation and window APIs in the isolated profile. Do not conflate them.

Remaining acceptance: extended assistive-technology/keyboard review, display scaling
and multi-monitor placement, other OS/Zotero versions, very large native libraries
and varied real-world PDFs. Existing source-index and navigation limitations in
RESEARCH_CHAT.md remain. No deferred geometry/rebranding work is claimed complete.


## Source-grounded Chat and Capture Evidence validation (2026-11-17)

All **356 tests pass**: **350 mocked/service tests and six real Edge browser fixtures**, zero failures/skips. All 306 preceding cases remain. Log: grounded-regression-final-6.txt. Two older metadata fixtures now explicitly enable optional metadata, and the existing expanded-settings assertion recognizes two separate sections. None of the preceding cases was deleted. New coverage includes source/library/collection/subcollection/custom scopes, multiple attachments, incremental/changed/missing files, page-aware passages, keyword/semantic/hybrid retrieval, total context budgets, fabricated citations, native coordinate/page fallback, follow-up request identity, history-off privacy, old collection selections, endpoint/model-bound embedding approval, optional note-proposal context, capture deduplication/reuse/field policies, permanent field identities across colors, cancellation/parent jobs, interrupted checkpoints/restart, undo and later authored/reference content, optional AI, backups, managed notes, guided creation and simplified Network controls. Original repair/100-rebuild/incomplete-data cases remain.

The real browser Chat fixture runs the actual UI adapter with injected service boundaries: source controls, index initiation, inline citations, passage preview and confirmed capture with AI off. The five previous browser fixtures remain. Browser/mocked success does not establish native PDF correctness.

Final integrated XPI: ResearchAnnotator-dev-20261117-004427-283.xpi. Package log: grounded-release-package-results.txt. All **38 allowlisted files**, **25 runtime JS** and **17 test/probe scripts** pass syntax verification; **five XHTML and three SVG** documents parse; git diff --check passes. Matched inventory: [DEVELOPMENT-BUILD-20261117-004427-283.json](DEVELOPMENT-BUILD-20261117-004427-283.json).

[Actual packaged Zotero 10.0.8 verification](NATIVE_GROUNDED_RELEASE_XPI.json) uses an isolated profile, two deterministic two-page PDFs and loopback HTTP. **31 trusted clicks and 218 native input events** operate real source controls, indexing, Chat submission, citation opening, capture, explicit capture AI, undo, failure/retry/cancel, guided Notes, default-preview selection and Network sections. Source passage rectangles match the live reader temporary highlight and current page. Native highlight items contain original scientific text (Zotero trims terminal whitespace), and the PDF fingerprints remain unchanged. Source scopes, multiple attachments, shared fields, Explorer/topics, managed note identity/authored content, batch defaults and hybrid retrieval pass. No production profile or paid service is used.

[Restart verification](NATIVE_GROUNDED_RELEASE_RESTART_XPI.json) reloads the same conversation, scopes and citation snapshots, clicks a restored citation to its real position, and confirms unchanged documents skip extraction. A deliberately prepared checkpoint gap replays after restart with the same capture/native identities, retaining later global fields and original undo ownership; no duplicate highlights or automatic provider requests occur. This is controlled checkpoint recovery, not a claim of testing an uncontrolled power failure.

[Grounded provider evidence](NATIVE_GROUNDED_RELEASE_PROVIDER.json) contains nine requests: five Chat requests (one deliberate failure and one cancelled in flight), three embedding requests and one explicitly approved capture-AI request. Initial capture makes no hidden AI requests despite an Automatic color. Restart adds none. [Retained Automatic/Manual AI verification](NATIVE_AI_TRIGGER_GROUNDED_RELEASE_XPI.json) also passes on this exact XPI; [its provider log](NATIVE_AI_PROVIDER_GROUNDED_RELEASE_XPI.json) records eight requests and two deliberate failures, with completed values/manual fields/native Comments and managed-note synchronization preserved.

Performance: the 12,000-passage in-memory fixture measured **48.7 ms** for the keyword index, **51.8 ms** for retrieval, and **4,934,053 bytes** of serialized index data without vectors. Native representative indexing measured **9 and 11 ms** for the two already-open PDFs (four pages; **3,613 bytes** of selected serialized keyword index), and one retrieval measured **58 ms**. These figures exclude initial reader loading and do not establish owner-library cold-scan or large-vector-corpus performance. Local semantic ranking is linear over compatible vectors.

Diagnostics are retained. Native source attempts exposed compartment cloning, cancellation-token integration and ID-vs-object annotation lookup; later harness attempts corrected old-conversation selection, stale rendered controls and Zotero whitespace normalization. The 002508 candidate and its passing diagnostics remain preserved; it is superseded by the final stable cross-color field-ID and provider-approval guards.

Remaining acceptance: owner-library cold indexing/search latency and complex/scanned/encrypted PDFs; all manual-field Capture UI combinations, screen readers/themes/DPI, other Zotero/OS versions, real local/remote generation and embedding providers, billing, long-running/concurrent jobs and uncontrolled crash recovery. Page-only citations work, but capture remains disabled until reliable reader coordinates are available. No unsupported OCR, automatic sync, exact-location claim or model download is implied. [Architecture and guarantees](RESEARCH_CHAT.md).


## Research Knowledge Network validation (2026-11-16)

Run: node --test tests/structured-fields.test.cjs tests/color-layout-rendering.test.cjs tests/research-notes-dashboard.test.cjs tests/research-explorer-browser.test.cjs tests/research-workspace-browser.test.cjs tests/research-network-browser.test.cjs. All 306 tests pass (301 mocked/service tests and five real Edge browser fixtures), with zero failures or skips; log: network-regression-final-6.txt. All preceding 266 cases remain. Exact packaged/native evidence is in the matched development build inventory. New coverage exercises relationship CRUD, directional inverses, symmetric deduplication, type rename/archive/semantics, stale revisions, failed writes, missing/deleted/moved references, libraries, categorical topic/value identities and renames, questions/roles, backups/restoration, atomic import records, graph filtering/scopes/bounds, AI validation/approval/rejection/cancellation/replay, changed evidence previews, publication-only citations, bounded discovery expansion, restart and managed Network notes. Both the original and Network-specific 100-rebuild stability cases remain, with normalization, identities, rich user content, repair and incomplete-data protection. Reactivated field history, integer AI concurrency and future Network schema preservation have dedicated regressions.

Mocked/service results are separate from five real Edge browser fixtures. The new Network fixture runs the actual HTML/SVG controller with injected service boundaries; it verifies list/create/graph/state behavior and stable native-option DOM nodes during refresh. Browser tests do not establish native Zotero acceptance.

An in-memory performance fixture uses 12,000 relationships: the preceding complete run measured a 33.2 ms index build, 106.7 ms for 1,000 local lookups, and a 2 ms bounded graph traversal. These are local synthetic measurements, not claims for native cold discovery or an owner's whole library. No native full-library scan is permitted in that navigation test.

Native tests use a separate Zotero 10.0.8 profile/data directory, synthetic publications/annotations and a loopback-only provider. tests/native-network-probe.js operates real toolbar/tab controls, search/target typing, native popup selection, relationship/type/question actions, graph selection/pan/zoom, original PDF navigation, note preview/generation, Explorer transfer, explicit AI preview/request/accept/reject/cancel and backup import. Its clicks/input are trusted Gecko mouse/native-keyboard events, not only controller invocations. Native confirmation dialogs are accepted by the isolated harness. Source attempts are retained diagnostics; NATIVE_NETWORK_SOURCE_7.json passed the core workflows with 30 trusted clicks and 204 trusted input events. Only the final packaged-candidate reports establish delivered-XPI acceptance.

A separate candidate restart probe checks durable relationships/provenance/questions/types/note identity/user content/topic designation and no automatic discovery after restart. Existing Automatic/Manual AI-trigger testing is repeated on the candidate with its separate deterministic loopback provider. All probe/server scripts are excluded from the XPI. No production profile or paid provider is used.

Validation includes all runtime and test/probe JavaScript syntax, five XHTML and three SVG parses, git diff --check and every packaged source hash. The integrated package contains 35 allowlisted files. Remaining live acceptance: owner-library cold search/topic latency and larger evidence sets; full reader context-menu/source-selection workflows; accessibility/screen readers, DPI/themes and all Zotero/OS versions; real-provider behavior/billing and long-running cancellation/recovery. Native small-fixture testing and synthetic performance results do not establish those broader claims.


## Automatic/Manual AI trigger verification (2026-11-16)

The current suite retains all preceding 252 tests and adds 14 targeted cases: **266 passing tests**, comprising **262 mocked/service tests and four Edge browser fixtures**, with zero failures/skips. Log: ai-trigger-regression-final-2.txt. Coverage includes persistent automatic scheduling after manual saves; Manual creation without requests; explicit generation; completed-value/no-empty-job protection; concurrent deduplication; failed-job explicit retry; global-only AI settings; conditional/persistent settings; popup/sidebar visibility; no instruction-change/reopen regeneration; explicit historical batches; saved trigger restoration; Zotero HTTP retry options; and blocking Retry during sibling work. Existing repair, rich positioning, normalization and 100-rebuild tests remain. The original automatic-creation fixture now explicitly uses Automatic rather than the historically ignored Manual value; no existing case was removed.

Syntax validation covers 20 runtime JS files and eight test/probe scripts. Four XHTML and three SVG documents parse, git diff --check passes, and package-dev.ps1 verifies all 32 packaged source files.

Actual isolated Zotero 10.0.8 verification uses tests/native-ai-trigger-probe.js and a deterministic loopback HTTP server in tests/native-ai-provider.cjs. These are excluded from the XPI. Real annotation add notifications, real shared persistent jobs, actual HTTP responses, native structured storage and managed notes are exercised. The probe verifies Automatic starts generation after manual persistence; Manual creates no AI job; Generate AI Fields is visible only in Manual; a simulated HTTP 500 exposes per-field Retry in both modes; successes survive sibling failures; explicit Retry recovers; completed results create no new jobs; native Comments remain intact; note synchronization succeeds; changed instructions/reopening create no generation; and explicit historical batches work for Manual colors. No paid provider or production profile is used. Native source attempt 1 exposed Zotero's hidden HTTP retry; retained diagnostic reports distinguish failed attempts from accepted evidence. Packaged-candidate evidence is recorded in the final build inventory.

Limits: provider behavior/billing beyond the loopback fixture is unverified. Full pointer/keyboard interactions inside actual PDF reader popups/cards, preferences visual review, screen readers, other Zotero/OS versions, long-running jobs and owner-library acceptance remain live checks. Native UI controls in the probe use the actual extension popup renderer mounted in its real workspace HTML document; this is not a claim of end-to-end PDF selection gesture coverage.


## Workspace usability validation (2026-11-16)

The full command below now passes **252 tests**: **248 mocked/service cases and four Edge browser fixtures**, with 0 failures/skips. All preceding 242 cases remain, including repair/restoration, normalization, positioned rich content, restart and 100-rebuild stability. Ten new cases cover AI editor input/conditional controls and instruction persistence, minimal PDF defaults, optional metadata, grouped metadata, explicit configurations, identity/user-content preservation after simplification, native popup resources, submenu ownership and expanded settings. Existing metadata inclusion cases now request their metadata explicitly rather than relying on superseded defaults. Log: usability-regression-final.txt.

Checks: 20 packaged runtime JavaScript files and six test/probe scripts pass syntax checks; four XHTML and three SVG documents pass XML parsing; git diff --check passes. package-dev.ps1 verifies all 32 packaged files against source hashes.

Native evidence is separate from mocked/browser tests. NATIVE_USABILITY_BASELINE.json reproduces transparent/unselectable native dropdowns in the prior 095828 XPI. NATIVE_USABILITY_STYLES.json isolates the native stylesheet correction. NATIVE_USABILITY_EXTENDED.json and NATIVE_USABILITY_LONG_LIST.json verify actual Zotero 10.0.8 mouse input and native keyboard input, conditional generation-method UI, AI-mode selection, Explorer sort/direction reaching the actual query service, opaque light/dark popup colors, Escape dismissal, selection retention and a scrolled selection from 60 options. No select value assignment or synthetic change event is used to establish dropdown selection. tests/native-usability-probe.js is isolated instrumentation and is excluded from the XPI. Packaged-candidate evidence is recorded separately in the final build inventory.

Remaining acceptance: owner-library workflows; manual editor save/reopen with rich positioned content; visual review of all settings and both themes; screen reader behavior; Zotero 7/8/9 and other platforms; long-running/paid AI jobs and recovery; multiple main windows and restart with the new submenu. Native selection evidence does not establish those broader claims. No production profile, backup, native annotation metadata or existing structured field values was modified.


## Unified Research Workspace validation (2026-11-16)

Run `node --test tests/structured-fields.test.cjs tests/color-layout-rendering.test.cjs tests/research-notes-dashboard.test.cjs tests/research-explorer-browser.test.cjs tests/research-workspace-browser.test.cjs`.
Retain all 226 prior cases, including repair/restore and 100-rebuild fixtures. New
coverage includes rich user block positioning, consecutive additions, in-place
updates, deleted neighbors, sorting/grouping, normalized/raw separator stability,
restart, partial review/lifecycle states, single-window opening, actionable errors,
multiple main windows, Tools/toolbar uniqueness/cleanup, section state, query
transfer and persistent Activity controls. Four browser fixtures complement the
mocked service tests; they are not native Zotero acceptance.

Isolated native smoke reports `NATIVE_WORKSPACE_VERIFICATION_*.json` record actual
Zotero 10.0.8. The published module rootURI failures were reproduced; corrected
chrome/HTML initialization, sections, source query transfer, review and Chat,
toolbar/menu uniqueness and cleanup were exercised. Synthetic native annotations
also verify user positioning and 100 unchanged native rebuilds. Intermediate failed
reports are retained as diagnostics; use the final accepted report/build inventory.
Only a separate temporary profile/data directory was used, with updates/sync off.

Remaining real-library/editor acceptance:

1. Open/focus Workspace from Tools and its toolbar button, including two main windows
   and closing one. Confirm one workspace, correct selection context and cleanup.
2. Switch all four sections with populated filters, unsaved inputs, note settings,
   previews and active jobs. Verify retained state, geometry/last-section restart,
   keyboard navigation, resizing and light/dark themes.
3. Review all manual field types and missing/failed/outdated/completed AI fields.
   Confirm native Comment does not define completion, successful values survive,
   explicit Retry/regeneration uses shared jobs and Chat remains independent.
4. In a copied managed note, place paragraphs/headings/lists/quotes/tables between
   highlights, including after the current last highlight. Add earlier/later PDF
   highlights, edit source/AI values, change sort/group, and delete neighbors/all
   entries. Confirm user tails remain attached or use the documented fallback.
5. Save/reopen in Zotero's actual editor, normalize repeatedly, restart and regenerate
   100 times. Confirm no byte/content growth, hidden markers, stable identity and
   safe incomplete-data handling. Repeat repair/restore on an affected-note copy.
6. Check long-running jobs, provider failures, portability/import recovery and
   realistic large-library performance. Validate declared Zotero/OS versions beyond
   the inspected/runtime-tested Zotero 10.0.8.

Run all runtime/test JavaScript syntax checks, four XHTML XML validations, SVG XML
checks, `git diff --check`, and the 32-file development packager. Exact tests,
native report hashes and packaged bytes are recorded in the final build inventory.

## Priority B23 repair and Research Explorer candidate (2026-11-16)

Run `node --test tests/structured-fields.test.cjs tests/color-layout-rendering.test.cjs tests/research-notes-dashboard.test.cjs tests/research-explorer-browser.test.cjs`.
All 190 preceding cases remain, with the legacy whole-document snapshot assertion
corrected to preserve user prose without copying generated content. New tests cover
100 repeated normalized PDF/generic rebuilds, source/AI changes, restart, nested
repair, backup failure/restore/identity, native/structured search, nested filters,
scope/empty values, sorting/grouping/pages, portable saved searches, renamed IDs,
navigation, strict concurrent edits, filtered note modes/protection and caching.
Three real-browser fixtures exercise production Explorer/dashboard controls and
the existing 80-case color matrix plus 32 frozen Wrap/Stacked references. They use
isolated temporary browser profiles, not Zotero data. The final build inventory
records exact totals/timings/source/package hashes.

Required live acceptance, with a matched backup in the development profile:

1. Copy an affected note; record size/identity/content. Run the dashboard's explicit
   repair and inspect its exact-original backup. Verify ordinary quotations and
   genuine/uncertain material survive, markers are invisible, and restore backs up
   the repaired version before restoring the original in manual mode.
2. Save/reopen in Zotero's actual note editor and rebuild 100 times, including after
   restart. Verify unchanged content/size, stable note key and no recursive sections.
   Repeat for PDF, field, color and filtered notes. Test genuine paragraphs before,
   between, inside and after generated content; source additions/edits/deletions
   and AI field updates must not copy old generated material.
3. Test repair with incomplete local structured data; saved source values and note
   completeness protections must remain. Malformed snapshot boundaries and failed
   backups must stop repair safely. Round-trip native note metadata/source links.
4. Open Explorer in existing/new windows; verify resize, keyboard/focus, themes,
   scope changes, history without JSON, all search sources, nested AND/OR filters,
   active removal/Clear All, sorting/grouping, pages, cancellation/loading/empty states.
5. Exercise all manual field types through shared controls, native Comment/Tags,
   read-only AI, explicit regeneration/failure Retry, concurrent/stale edits, deleted
   fields, changed colors and source navigation. Drafts must remain on conflicts.
6. Create/reopen/edit/duplicate/rename/delete saved searches; restart, settings/full
   backup round-trip and old-format imports. Verify field/color/category renames,
   unavailable definitions and proper scope keys across manual portability.
7. Generate filtered notes via the existing dashboard using existing-only and
   missing-first options; verify previews, content controls, citations/grouping,
   deduplication, original-filter reopening, all note modes and user-content guards.
8. Measure actual large-library discovery/query/edit/sync latency and memory. The
   mocked 15,000-record performance fixture is not a native benchmark. Check other
   accepted annotation, portability, provider, job interruption and cleanup workflows.

Validate all packaged/test JavaScript, all three XHTML files as XML,
`git diff --check` and the 27-file `package-dev.ps1` artifact. No live Zotero data,
installed extension, backups or release configuration is modified for these checks.

## Research Note Generation candidate validation (2026-11-16)

Run `node --test tests/structured-fields.test.cjs tests/color-layout-rendering.test.cjs tests/research-notes-dashboard.test.cjs`.
Result: **190 passed, 0 failed, 0 skipped**; all **162** previous tests retained.
The new 28 cases exercise scopes/multiple PDFs/historical annotations, AI summaries,
missing/outdated/failed behavior, stable field/category/color/config identities,
content inclusion, modes, user edits, incomplete records/imported ownership,
job checkpoints/recovery/cancellation/partial success and dashboard browser controls.
The existing real-browser matrix verifies 80 current color configurations and 32
Wrap/Stacked references unchanged. Windows browser fixtures require execution
outside the restricted sandbox; temporary browser profiles never use Zotero data.

Required live Zotero acceptance, using the development profile and matched backup:

1. Open Tools → Research Notes from existing/new main windows. Verify dialog load,
   keyboard access, selection APIs, light/dark presentation and window cleanup.
2. Preview all four scopes, including historical highlights, two PDFs under one
   publication, standalone PDFs, empty PDFs, non-PDFs and read-only libraries.
   Check counts and direct-collection membership; no preview/open provider calls.
3. Generate each PDF twice: stable separate notes, no ordinary-note changes,
   source links/page navigation and skipped-empty reports. Keep automatic PDF
   creation/modification/deletion behavior accepted.
4. Test global/color field types, individual/multiple categories and colors,
   semantic/field/category renames, titles and repeated saved configurations.
   Verify publication grouping and every content/individual-field inclusion flag.
5. Compare existing-only, missing-first and explicit outdated regeneration. Inject
   provider failures, preserve successes/manual values/Comments/Tags, retry and
   verify recovered results reach notes. Confirm no automatic outdated regeneration.
6. Exercise open/update/edit/rename/source/last-update/mode/delete controls. Manual
   updates must be explicit; static content must remain frozen. Confirm deletion
   moves only the owned note to Trash and disables automatic recreation.
7. Add/edit user text before/between/inside/after generated entries. Save/reopen in
   Zotero's editor, update and delete sources: retain user content/snapshots without
   duplicate generated entries. Verify normalized HTML across supported versions.
8. Pause/resume/cancel midway through AI and notes; restart after interruption.
   Preserve completed results/notes; no startup replay. Paid failed/interrupted
   retries require acknowledgement. Check checkpoints, failure details and skipped
   PDFs. Retry failed AI and confirm affected previously compiled notes refresh.
9. Remove local structured records on disposable data, including records whose
   absence changes field membership. Updates must preserve complete existing notes.
   Import a portable configuration without ownership and confirm fingerprints
   protect foreign notes. No experimental automatic metadata sync is involved.
10. Round-trip settings/research/complete backups, old formats and interrupted jobs.
    Verify existing annotation controls, native Comments/Tags, automatic AI, conversion,
    deletion, inherited tools, all five color layouts and import recovery remain intact.
11. Measure responsiveness/storage/note latency with large libraries and repeated
    jobs. Browser/mock tests do not establish native performance, filesystem
    interruption safety or Zotero/OS compatibility.

Run packaged JavaScript syntax checks, parse both preferences/dashboard XHTML as
XML, `git diff --check` and `package-dev.ps1`. The integrated build inventory records
exact source/package hashes; this candidate is not yet live accepted.

## Data Infrastructure candidate validation (2026-11-16)

Run node --test tests/structured-fields.test.cjs tests/color-layout-rendering.test.cjs.
Current result: **162 passed**, preserving all **118** previous tests and adding
44 infrastructure cases. **161 mocked/in-memory logic tests** use fake providers,
files, native items and minimal DOM; **one real Edge renderer test** checks 80
current and 32 frozen baseline layout configurations. No paid provider request,
Zotero install, actual data mutation or real multi-device synchronization test was
performed by the agent. 15,000-record lookup is correctness coverage, not a
production performance benchmark. Color layout source/CSS is unchanged.

New tests cover schema/recovery/future-version safety, backup-before-write failure,
concurrent patches, durable flush, lifecycle/provenance, prompt changes, preserved
regeneration results, historical/new fields, queue dedupe/cancel/pause/resume,
interrupted paid recovery, safe rate-limit delay, managed identities/duplicates,
PDF idempotency/modes/inclusion/deletion, user heading/prose snapshots, shared
publication compiler/source links, conversion/early notifications, guarded undo,
native Comments/Tags, exact draft scope, optional-backup compatibility and imports.

Live verification in the existing dedicated Zotero development profile:

1. Retain the preceding integrated XPI plus a matched Zotero profile/data snapshot
   and complete extension export. Do not create an additional profile merely for
   this milestone. Never deliberately corrupt the only copy of research data.
2. Verify startup migration creates a recovery/pre-migration backup, retains all
   global/color/manual/AI/category identities and preserves native Comments/Tags.
   Edit then immediately close popup/reader and exit normally; restart and compare.
3. With disposable copied fixtures, test corrupt JSON, valid recovery, invalid
   recovery/future schemas, denied writes/full disk, backup-write failure and import
   rollback interruption. Preserve original corrupt files and all backups. Confirm
   errors do not publish false success or replace unreadable data with empty data.
4. Create mixed/AI-only highlights; change manual values during generation. Verify
   automatic generation, labels/read-only progress/errors, retry after failure,
   configured prompt changes (Outdated, no auto-regeneration), historical fields,
   successful and failed explicit refill, and no Comment/Tag changes. Check image
   fields separately; OCR source validity cannot be inferred from text-only tests.
5. Run inherited batch/review/refill. Inspect Background operations in Data
   Management; test concurrency 1/2, pause/cancel, completed result preservation,
   restart recovery, paid Resume acknowledgement, HTTP 429 versus timeout/auth
   failures and no unapproved replay. A request already sent may still be billed.
6. Refill then undo: compare structured JSON, global/color values, metadata and
   derived note. Edit a value after refill; undo must skip that record. Check old
   Comment-only undo backups separately without claiming they contain field data.
7. Convert highlight/underline with all field types, Tags, Comment and saved AI;
   compare replacement and source history after restart, including concurrent
   notification ordering. Delete one/multiple/final highlights during AI/note work;
   remaining entries/numbering/user content survive and no deleted entry returns.
8. Rebuild legacy managed PDF notes repeatedly; check identity/parent/no duplicates,
   metadata/links/citations, saved values and mode defaults. Add user text before,
   between, inside and after managed entries and edit a generated heading. Rebuild
   after Zotero HTML normalization; user snapshots must retain changed material.
   Ordinary notes must remain unchanged. Snapshot retention may be conservative.
9. Use the managed-note service API on disposable notes to exercise manual/static
   modes, inclusion flags and publication grouping; there is no new full note UI.
   Test missing attachments/read-only libraries and duplicate markers. Inspect
   synced complete PDF notes with incomplete local JSON: protection must stop the
   rebuild. This is not a two-device synchronization acceptance test.
10. Round-trip settings/research/complete backup, including configs and interrupted
    jobs, with old version-1 backups and altered local numeric library IDs. Confirm
    conflict previews/rollback, stable IDs, credential exclusion, ownership snapshots
    staying local and no import-triggered provider calls. Active jobs block imports.
11. Disable/re-enable and close reader/main windows: no duplicate observers/timers,
    dead-window callbacks or detached-form writes to another annotation. Smoke-test
    inherited chat/citations/note tools and all accepted color layouts unchanged.
12. Measure real edit/save/note/job latency with increasing library sizes before
    claiming production-scale readiness. Test the declared Zotero versions/OSes;
    source inspection used installed Zotero 10.0.8 only.

See DATA_INFRASTRUCTURE.md for recovery/queue/API contracts and SYNCHRONIZATION.md
for the explicit synchronization blocker. Build identity and exact package hashes
are recorded in the new DEVELOPMENT-BUILD inventory after packaging.


## Color layout candidate validation (2026-11-16)

Run node --test tests/structured-fields.test.cjs tests/color-layout-rendering.test.cjs. The 117 unit/regression tests retain all 114 previous cases. The additional Edge renderer test checks 80 current configurations (five layouts, 3/5/8/12 long-label colors, creation/existing, 2400/640px viewports) and 32 frozen Wrap/Stacked references. It measures bounding boxes, text line counts, overflow, matching widths, transformed polygon intersections and actual elementFromPoint hit testing. Fixtures use temporary local HTML/browser profiles, never Zotero data. Edge must be installed (override RESEARCHANNOTATOR_EDGE); unavailable Edge is explicitly skipped. This Windows sandbox requires running that local browser check outside the sandbox.

Live Zotero checklist: switch all five layouts in preferences; compare creation/existing popups with identical 3/5/8/12-color long-label palettes. Verify Single Row expands until reader width is exhausted; Slanted and Vertical have complete clickable labels; resize reader/split pane and open near all edges. Compare Wrap/Stacked with the preceding build. Check light/dark, pointer/hover/focus/selection, keyboard scrolling and popup vertical scrolling. Confirm native Comment/Tags then global/color fields remain functional, including multi-select portals and automatic AI. From closed color rows test trash with mouse/keyboard, Cancel, denied deletion for assigned colors, archive/reassignment and confirmed unused-custom deletion. Export/import the selected layout and reopen Zotero. Installation and these live checks are not performed by the agent.


## Usability refinement validation (2026-11-16)

**114 tests pass; all previous 93 retained, with 21 new cases.** Run the complete
suite, syntax-check all 13 packaged JS files plus the test file, parse preferences
XML, run `git diff --check` and package with `package-dev.ps1` (20 verified files).
Tests use isolated providers/storage/DB and minimal DOMs; live acceptance is pending.

In the existing development profile, retain a matched profile/data snapshot and
the preceding integrated XPI (`20261115-233530-384`), then verify:

1. In creation/existing/sidebar multi-selects, dismiss a suggestion with ×. It must
   not select anything, remove chips or change old annotation assignments. Restart:
   it stays hidden in that field only. Type its exact name, including a case variant,
   and use Restore/Enter: reuse the original category, with no duplicate identities.
   Remove a selected chip separately; the suggestion remains available. Test Tab
   to dismiss, arrows/Enter/Escape, pointer clicks, viewport edges and both themes.
2. Both popups show colors/semantic labels, native Comment, native Zotero Tags,
   global fields and color fields in that order. Enter native Comment/Tags, save,
   reopen/sidebar/restart, then generate/retry AI: both native values stay intact.
   Legacy research category/comment controls must remain absent.
3. Select wrap/single/stack/slanted label layouts and compare both popup renderers.
   Verify pointer, hover, selected/focused/pressed feedback, keyboard Tab/Enter/Space
   and semantic tooltips. White labels need readable backing for bright colors;
   original swatches must still show true colors. Check long semantic labels,
   boundary positioning, common width/padding and many fields. Ordinary popup
   horizontal overflow must be absent; explicit single-row palettes may scroll.
4. Color settings start collapsed with handle/swatch/name/count/expand. Expand one
   row, edit/add/reorder/remove all field types and prompts in highlight/area scopes,
   switch rows and collapse/reopen. Pending field edits, IDs, raw syntax, custom
   layouts, trigger/reset and data-management controls must survive. Counts update
   after save. Test handle ArrowUp/Down and drag/drop to first/last positions; normal
   text drops into prompts/inputs must continue to work.
5. Delete an unused custom color: opening Delete Color only previews; cancelling
   confirmation preserves it. Confirm removes only that unused configuration.
   Try colors with live/deleted historical records, categories, pending drafts,
   default colors and archive/reassignment links: permanent deletion is blocked.
   Archive preserves IDs and data. For confirmed reassignment, source values stay
   archived, target values/global values/native Comment/Tags remain intact, and
   existing note synchronization continues. Test readonly/dirty/AI-in-progress and
   DB-failure guards on disposable copied fixtures. Never delete backup files.
6. Round-trip settings, research data and complete backups with dismissed
   suggestions/new color metadata. Import a pre-refinement version-1 backup without
   these optional fields. Confirm conflict previews, credential exclusion, unmatched
   reports, pre-import backups, no AI calls and interrupted-import recovery remain.
7. Recheck automatic AI/mixed manual edits, field-local Retry, failed-generation
   preservation, immediate single/multiple/final highlight deletion, note numbering/
   separators/sorting and ordinary-note protection from the prior build.

All color safety decisions inspect locally available data; remote-device deletion/
sync conflicts remain planned. Full visual, screen-reader and real Zotero DB/file
failure validation cannot be inferred from the isolated tests.

## Earlier integrated milestone acceptance (93-test baseline)

That baseline passed **93 tests**, retaining all 58 preceding cases and adding
35 milestone cases. Existing test assertions about absence of dedicated Research
Comment now allow the restored native-only Comment input. Providers, storage, DB,
reader adapters and DOM are isolated fixtures; no live Zotero installation or data
was modified by these checks.

Run `node --test tests/structured-fields.test.cjs`, `node --check` on every packaged
JavaScript file plus the test file, parse `preferences.xhtml` as XML, and run
`git diff --check`. `package-dev.ps1` now includes the three new modules, validates
identity/syntax and verifies all **20** packaged files against source SHA256 hashes.
Use only that development packager; do not run build/release scripts.

Use the existing development profile with a matched Zotero/profile-data snapshot
and the preceding `20261115-180037-583` XPI retained. Live checklist:

1. Type a native Comment before selecting a highlight color; choose default and
   custom colors, redraw the selection popup, then reopen the highlight/sidebar
   and restart Zotero. Confirm the exact Comment remains native and no dedicated
   Research Comment/Theme/Experiments controls return. Test a second PDF with the
   same passage text; drafts must not attach there.
2. Compare creation/existing/sidebar field order, typography, compact containers,
   checkboxes/dropdowns/multi-selects, read-only AI and failure-only Retry placement.
   Test many fields, viewport edges, scrolling, split reader views, keyboard/IME,
   native shortcuts, popup closing and light/dark contrast. No duplicate AI calls.
3. Add a hex/picker color, assign manual and AI fields, reorder and rename it. Save
   manual selections/AI values, change its hex with Keep existing colors and then
   Recolor existing highlights. Confirm annotations, globals, category/field IDs,
   color-specific values and consolidated notes remain consistent after restart.
   Test read-only highlights and simulated DB failure on copied fixtures.
4. Archive/restore colors and apply Default, accessibility, Pastel and Custom.
   Confirm archived definitions/values/old hex aliases survive; active order and
   semantic labels/selection marks/tooltips are usable. Restore Defaults must not
   delete research data or recolor existing annotations. Test PDFs/areas/EPUBs
   on the actual supported reader versions; custom selection creation uses a
   private guarded adapter and unsupported readers retain native creation.
5. Export Settings, change configurations, then import with preview/Keep existing
   and Use imported. Test explicit replacement, duplicate definitions and legacy
   color-label JSON through the same importer. Verify prompts/types/order/IDs,
   note settings/provider configuration and imported editor refresh. Verify no
   API keys, auth URL values, passwords, tokens or executable paths are exported;
   existing credentials remain unchanged on import.
6. Export Research Data and Complete Backup, change manual/AI values and restore
   each with merge and matching-record replacement. Check category identities,
   AI prompt metadata/status and historical tag/note information. Restored running
   fields show interrupted/retryable status and make no provider calls. Native
   Comments and ordinary Zotero notes must be byte-for-byte unchanged. Import
   does not itself rebuild managed notes; normal later annotation updates use the
   existing compiler. Local migration checkpoints remain local.
7. In copied fixtures on a second installation, use the same Zotero user/group with
   different numeric library IDs. Verify item and attachment keys/type/text match.
   Test unsigned libraries with explicit mapping, missing/deleted/read-only items,
   wrong parents/text, orphan records and incomplete sync. All unmatched entries
   must be reported and never guessed. Conflicting independent palette IDs require
   explicit replacement after preview; data-only replacement preserves unrelated
   settings. Do not mistake this for automatic cloud synchronization.
8. Reject malformed/future-format files, duplicate identities and invalid field
   types before changes. Change data after preview: require a fresh preview. Test
   Keep existing/Use imported/Stop on conflict. Fail backup creation and fail the
   store/preferences writes: preserve values and report the backup path. Confirm
   each import retains a complete pre-import backup plus received-file copy under
   `researchannotator-backups`; never delete these recovery files automatically.
9. On a disposable matched fixture only, interrupt an import after its pending
   journal exists. Restart: recover the original local store/preferences before
   migrations. Simulate rollback failure: writes stay blocked and the pending
   journal/backup remain until recovery succeeds. Validate real OS/filesystem
   durability; mocked unit recovery is not a power-loss guarantee.
10. Re-run automatic AI/mixed fields/concurrent manual edits, per-field retry,
    immediate single/multiple/final deletion, note numbering/separators/sorting,
    historical migration and ordinary-note preservation from the previous build.
    Reopen readers/preferences after palette imports to verify all live controls.

Backup boundaries: complete extension backup means portable settings plus extension
structured/historical research state. PDFs, Zotero's database/ordinary notes and
credentials require their own matched backup/setup. Executable paths/detection are
machine-local. Settings-only imports do not restore research values. Automatic
cloud sync, new batch generation/review workflows, Explorer and cross-paper note
generation are not implemented in this milestone. Large-library runtime performance
and input files over the UI's 100 MB limit remain acceptance/future work.

## Current development package

Build `20261116-003544-943`, version 2.42.0, ID `researchannotator@pino`.
Artifact: `C:/Users/Ahmed/Documents/ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-003544-943.xpi`.
[Build inventory](DEVELOPMENT-BUILD-20261116-003544-943.json) records all 20 source/package hashes,
implementation scope and validation. `package-dev.ps1` verified all packaged files
and identity; the agent did not install the XPI or change Zotero profile data.
Retain the preceding integrated `20261115-233530-384` XPI and matched profile/data
snapshot. Use the 114-test usability checklist at the top for current acceptance.

Earlier build history: `20261115-233530-384` retained all 58 previous cases and
added 35 (93 total); it superseded `20261115-233300-475` with the final stable-ID
alias-union import fix. Earlier sections below retain their scoped baseline history.

## Phase 1 global fields validation

`node --test tests/structured-fields.test.cjs`: 58 tests pass, retaining all 48
previous cases (including the original 33). Coverage adds separate scopes/name collisions, stable IDs and
renaming/removal, color changes, clearing/reload, multi-select search/new values/
duplicate prevention/chip removal, all three annotation interfaces, settings
add/rename/reorder/remove, migration sources/repetition/failure recovery, global
automatic AI, individual retries, concurrent edits, prompt metadata, managed note
normalization and ordinary-note preservation. Test I/O/providers/DOM are mocked;
live behavior is not inferred from these tests. Ten refinement cases cover
field-local dropdowns/case matching, keyboard selection/create/dismissal/removal,
top-layer and fallback viewport positioning/dismissal/cleanup, removal of redundant
capture/existing-popup controls, native Comment safety, historical comment import
and failure/retry, preference ordering and side-effect-free note rendering.

Before installing in the existing development profile, retain a matched data/profile
snapshot, including `annota-fields.json` and preferences. No new profile is needed.
On first activation, migration runs automatically on writable libraries. It adds
global Research themes/Experiments multi-select definitions once, imports current
tag assignments and legacy metadata-note assignments/catalogs, and preserves the
sources. Existing global values, including cleared selections, are not reimported.
Definition/value/note checkpoints are recoverable; failed libraries retain original
sources for retry. Dedicated research controls are removed, including on failure.
Historical comments, when present, copy into a configurable global textarea;
native Comment and source metadata remain unchanged. Read-only libraries are not
written. Existing managed PDF notes
may update; ordinary notes are not targets and migration never calls AI providers.

Manual checklist:

1. Confirm Global Fields directly follows Highlight Colors with matching styling.
   Add/rename/reorder/remove text, textarea,
   checkbox, dropdown, multi-select and AI definitions. Confirm old values survive
   renaming/type changes and removal retains archived data. Color fields still work.
2. Use a global and color field with the same display name. Confirm independent
   values in creation/popup/sidebar; change annotation color and verify globals
   persist while color values restore independently. Clear values and restart.
3. Search categorical options/previous values, select several, create a new value,
   remove chips and try duplicate/case-variant selections. Check keyboard entry,
   ArrowUp/Down, Enter to select/create and Escape to dismiss in all interfaces.
   Focus an empty search to see prior/configured values. Confirm selected values
   disappear from suggestions and Create is separate. At the viewport/popup bottom,
   verify the list opens above when needed, remains readable/unclipped, scrolls and
   closes on blur/Escape/outer scroll. Check pointer selection, keyboard focus,
   light/dark contrast, popup closure and sidebar collapse/reopen for stale menus.
4. Verify existing Theme/Experiments assignments and suggestions migrated exactly.
   Restart twice: no duplicate definitions/selections or lost cleared values.
   Confirm legacy tags/metadata notes remain intact. On a copied fixture, simulate
   write failure and retry: original data must survive; redundant Research Comment,
   Theme and Experiments controls must remain absent. With historical dedicated
   comments, verify the configurable imported textarea, original metadata and
   unchanged native Comment; clear/edit/archive the field and restart without
   resurrecting values/definitions. Verify native tag entry still saves correctly.
5. Create a highlight with global AI only, then mixed global/color AI and manual
   fields. Confirm automatic generation and edits made during the request survive.
   Fail one field: successes remain saved and Retry sits below only the failed
   response. Retry it and confirm other AI fields are not called again.
6. Confirm global/category labels and AI results in existing managed PDF notes,
   including after save/reopen, sorting, field renaming, deletion and restart.
   Numbering, dividers, links, highlight colors and unrelated prose must survive.
   Verify an ordinary note is unchanged.
7. Opening/restarting historical highlights must not call AI. Future retroactive
   Generate / Update Notes processing, inclusion controls, sync-mode settings,
   cross-paper notes and dashboard are intentionally not present in Phase 1.

Migration rollback: preserve the new JSON/preferences before recovery. Since legacy
sources are not deleted, failed import can be rerun. Restore a matched backup for
full rollback rather than deleting new fields/data or reimporting into a live
working library blindly. Removed definitions are archived in the global config;
their values remain in JSON. Renaming an option currently adds/changes suggestions
without rewriting historical category assignments.

## UI and formatting validation

Run `node --test tests/structured-fields.test.cjs`: 33 tests pass, retaining the
23 previous cases. The popup action case now asserts the requested behavior:
hidden before failure, contextual Retry after failure, hidden after success.
New tests cover arbitrary field names/labels, conservative prefix removal,
scientific headings/notation, prompt instructions, safe formatting, unchanged
historical JSON, sidebar retry state, compact common CSS and normalized rule
idempotence, user footer preservation, sorting and final deletion.

In the existing Zotero development profile, verify:

1. New AI-only and mixed highlights still generate automatically. With no error,
   popup/sidebar have no Fill with AI or Retry action. Progress remains visible.
2. Cause generation to fail: error and a small Retry appear. Retry successfully;
   results update and Retry disappears. Batch/review actions are unchanged.
3. Test arbitrary names/labels, including punctuation. Responses such as
   `Summary: ...` or `**Summary:** ...` display without duplicate labels; headings
   such as Methods/Results, paragraphs, emphasis, code and scientific subscripts
   remain meaningful. Inspect an older labeled value and confirm its JSON is
   unchanged while popup, sidebar and note agree in presentation.
4. Compare text/textarea/checkbox/dropdown/AI containers across creation, popup
   and sidebar in both light and dark modes. Check readable labels, restrained
   tints, focus/keyboard behavior, checkbox/dropdown interaction, line wrapping
   and compact popup size. Styling tests are not a visual layout test.
5. Inspect a note with at least three highlights: two dividers, consistent spacing,
   original numbering, links, colors and metadata. Reopen/save through Zotero,
   sync repeatedly, change sort order and delete entries. Dividers must not
   duplicate or remain when only one/no managed entry remains.
6. Add unrelated prose and a user-authored rule before/after managed entries;
   confirm both survive rebuild and final deletion. Repeat the slow-AI/deletion
   and restart checks from the previous build.

The installed Zotero note-editor schema explicitly supports horizontal rules
(native output may be `<hr>` or `<div><hr></div>`). Custom rule styles can be
normalized away; native rule presence/ownership is independent of those styles.
Generation/error status remains transient session state as before. Historical
checklists below apply except where superseded by failure-only Retry.

## Automatic generation and deletion validation

The preceding development build was confirmed working live by the product owner.
Run `node --test tests/structured-fields.test.cjs`: all 23 tests pass, including
the unchanged original 13 cases and 10 new automatic-generation/deletion cases.
Mocks exercise asynchronous notification handling, provider delays, queued note
saves and stale caches; actual Zotero layout/provider/restart validation of this
new build remains pending. Batch and review workflows are unchanged.

Use the existing development profile and test the new XPI as follows:

1. Configure AI-only and mixed colors, each AI field with its own instruction.
   Create highlights without pressing Fill with AI. Check `Generating...`, then
   generated values in popup, sidebar and consolidated note.
2. Enter a manual draft before creation. Edit it again during a slow request;
   verify both versions save in order and the latest edit survives completion.
   Confirm native Comment is byte-for-byte unchanged by field operations.
3. Force provider failure, including a later AI field after an earlier success.
   Confirm error visibility, saved data intact, and successful explicit retry.
   Reopen the same highlight and restart: neither should initiate generation.
4. With a Zotero note open, select text and confirm the creation popup has no
   Add to Note button. Confirm notes can still be edited normally and automatic
   consolidated notes are still updated.
5. Delete one highlight and check immediate removal/renumbering. Delete several,
   then the final highlight. Put unrelated prose before/after managed entries
   and verify it survives. Repeat after closing/reopening the note and Zotero.
6. Start slow AI generation and edit another annotation, then delete the generating
   highlight before completion. Confirm late results/pending updates never restore
   its entry. Repeat with multiple deletions.
7. Repeat previous manual field, explicit generation, restart and color-switching
   checks below. Report the exact package hash and Zotero version with failures.

## Focused implementation validation

Run `node --test tests/structured-fields.test.cjs`. Thirteen focused tests cover
creation/sidebar/popup rendering, both explicit AI actions, read-only AI output,
native Comment preservation, stored-value/note output, clearing manual controls,
partial/empty/provider failure, write failure/retry, corrupt storage, concurrent
edits, duplicate generation, changed annotation identity and storage reload.
The suite uses mocked I/O/providers/Zotero and a minimal DOM, not a live Zotero
instance. All ten runtime JavaScript syntax checks and `git diff --check` pass.

Use the existing dedicated development profile; no new profile setup is needed.
After installing the uniquely timestamped development XPI, verify:

1. Configure text, textarea, checkbox, dropdown and two AI fields with instructions.
2. During creation confirm every label and AI `Not generated yet` placeholder.
   After highlight creation, automatic generation should begin for its AI fields.
3. Click the saved highlight, then inspect its sidebar card: all fields appear,
   AI values are read-only, and each interface has an explicit AI action.
4. Enter native Comment text and manual values. Generate from the popup, then
   test another highlight from the sidebar. Check stored AI values and note;
   native Comment and manual values must remain unchanged.
5. Clear all manual fields, uncheck the checkbox and reset dropdown; reopen and
   restart Zotero to verify persistence. Existing AI values must survive.
6. Fail an AI request (including the second field after the first succeeds).
   Verify visible error, no partially committed AI results and old values intact.
7. Edit a manual field in the other interface during a slow request. Check both
   views and the note after completion. Change color during a request and verify
   the stale result is rejected rather than assigned to another color.
8. Restart and confirm AI/manual data and Comment remain intact. Check themes,
   tags and color switching for smoke regressions. Batch/review were not changed
   and still have documented Comment/storage limitations.

The development packager now validates its absolute temporary cleanup path before
recursive removal. Its output remains timestamped; internal add-on version stays
2.42.0. Use the package hash/build inventory to distinguish these builds.

Baseline: 2026-11-15. Procedures below are recommendations, not actions already
performed. No packaging/release script, extension installation or Zotero data
change was executed to prepare these documents.

## What has been verified

- Working manifest: ResearchAnnotator 2.42.0, ID `researchannotator@pino`, update
  URL `https://raw.githubusercontent.com/Pinokuo/ResearchAnnotator/main/updates.json`.
- All ten active JavaScript files passed syntax checks during the preceding audit.
- Isolated source checks confirmed B01, B02, B04, B06, B12 and B13. These did not
  exercise real Zotero, network providers, filesystem persistence or restart.
- `package-dev.ps1` was read, not run. All 17 allowlisted files exist; its list
  matches the release workflow's packaging list.
- Root XPIs were read as ZIP archives without extraction. All five identify as
  Annota 2.41.1 / `annota@equiriconi`, with upstream update URL
  `https://raw.githubusercontent.com/Liotou/zotero-annota/main/updates.json`.
  Both bootstrap and card-fields source differ from the working source.
- Installed extension identity, active profile, live remote update feed and
  actual runtime behavior remain unverified.

Artifact SHA-256 inventory (case insensitive):

| Package | SHA-256 |
| --- | --- |
| `annota.xpi` | `D3D135C54B844B84511547233E56A5CD504184142DA97FE1E8F46FE08EFA3511` |
| `annota-test.xpi` | `6BB56CBCDFAE19DBCFEE070F8092D88007C231FCE32C8C9E441156C74FC13202` |
| `annota-color-test.xpi` | `6C8C71CD49D950EA3D33C6375C7F21711C4BB73095BE99C3EAD6E0D52F1F83A5` |
| `annota-layout-test.xpi` | `BFD8325231A70C543B2CBF3C206D78A4227611168335209242838B602FDD2510` |
| `annota-positioning-test.xpi` | `7D34EAD4ED10E45AC773AF19A0232CA2714A7DDA02B39C5D5E39FF888EABE745` |

These files are historical artifacts, not proven safe rollback builds.

## Safely identify the installed extension

Use observation first; do not install a package or trigger an update to discover
what is installed.

1. Record Zotero version and the active profile. In Zotero's add-on manager,
   inspect installed extensions and record Annota/ResearchAnnotator names,
   displayed versions and enabled state. UI labels can vary by Zotero version.
2. If an already-available runtime diagnostic surface exposes `Zotero.Annota`,
   read its `id`, `version` and `rootURI`. Do not call migration, sync, generation
   or save methods. Runtime diagnostics supplement, rather than replace, the
   installed manifest because shared globals can be ambiguous with two extensions.
3. Identify the active profile from Zotero diagnostics/profile information; do
   not assume a default path. The profile stores extension configuration and is
   distinct from the research data directory. Locate the data directory through
   Zotero Settings > Advanced > Show Data Directory, where available.
4. For a stable disk inventory, close Zotero normally, then inspect the profile's
   extension metadata (commonly `extensions.json`) read-only. Record each relevant
   ID, version, active/disabled state and resolved install path; do not edit it.
   Redact unrelated personal paths/preferences when sharing results.
5. Read installed `manifest.json` from the actual XPI or unpacked extension. Record
   ID, version, name and update URL. Hash the installed XPI; if unpacked, hash
   each active file. Compare to the artifact inventory and current source hashes.
6. Report UI/runtime/disk discrepancies, including pending updates, rather than
   guessing. Only a byte comparison establishes that installed source matches
   the working tree. Same displayed version is insufficient.

Potential coexistence matters: `annota@equiriconi` and `researchannotator@pino`
are different identities. If both are enabled they may both register reader
hooks and access inherited `annota-*` files. This is a risk, not an observation
of the user's current installation.

References: [Zotero profile directory](https://www.zotero.org/support/kb/profile_directory),
[data directory and backup](https://www.zotero.org/support/zotero_data).

## Development packager inspection

`package-dev.ps1` currently:

1. Resolves its repository directory and requires the 17 allowlisted files.
2. Validates manifest name `ResearchAnnotator` and ID `researchannotator@pino`.
3. Runs `node --check` on the ten JavaScript files and `git diff --check`.
4. Creates an output under `%USERPROFILE%\Documents\ResearchAnnotatorBuilds`
   named `ResearchAnnotator-dev-yyyyMMdd-HHmmss-fff.xpi` using local host time.
5. Copies only allowlisted files to a GUID-named temporary staging directory,
   creates a root-level ZIP/XPI and extracts it to verify each listed file's
   SHA-256 against the source. It checks the packaged add-on ID again.
6. Removes its temporary directory in `finally`.

The active files, manifest and ID checks are correct for the current working
source. Backups, candidates, documentation and root XPIs are excluded.
No installation, commit, push or update-feed generation is present.

Limitations: internal version remains 2.42.0; timestamp is only in filename;
no output package hash or source inventory is retained; no explicit exact-entry
count check; no update URL/version validation; no runtime tests. Files can change
during staging/hash comparison, so use a stable source snapshot. A later failed
verification can leave the output XPI behind; existence alone does not mean
verified success. `git diff --check` covers tracked working differences, not all
untracked source, and is not a semantic test. The output directory is outside
this repository and requires the applicable filesystem authorization if run.
Temporary cleanup should receive resolved-path containment review before future
execution. The script was not executed in this task.

`build.sh` overwrites `annota.xpi`. `release.sh` commits/pushes and retains old
upstream/package assumptions. Do not use either as the baseline packaging route.

## Update configuration assessment

The local manifest points to the ResearchAnnotator repository, but local
`updates.json` contains only `annota@equiriconi` version 2.41.1 pointing upstream.
Mozilla's update manifest format keys updates by installed add-on ID, and update
checks use the installed extension's update URL. See
[Mozilla update documentation](https://extensionworkshop.com/documentation/manage/updating-your-extension/).

Therefore the local feed mismatch is not evidence that ResearchAnnotator
2.42.0 will automatically downgrade to Annota 2.41.1: IDs differ and the advertised
version is older. The likely consequence for that exact ResearchAnnotator/feed
combination is no matching update, subject to Zotero's updater behavior. This
is a format-based assessment, not a runtime update test.

The old packages do use Annota's ID and upstream URL. If one is installed, its
future upstream updates can replace modifications installed under that same ID.
A separately installed Annota can update independently of ResearchAnnotator.
The live remote feed may differ from the local file; it was not fetched here.
The installed manifest, enabled extensions and remote contents must be identified
before claiming an actual update exposure. No update settings were changed.

The current workflow checks the ResearchAnnotator identity and builds
`ResearchAnnotator.xpi` from the selected commit. `make-updates.py` uses that
name/ID. `release.sh` still passes the upstream repository and uploads
`annota.xpi`, so its generated links/names are inconsistent. No release route
is endorsed as runtime-validated by this baseline.

## Proposed development build identity

For each future authorized build, freeze/copy the source before packaging and
retain a sidecar inventory containing:

- Unique UTC build timestamp and build identifier.
- Add-on name/ID/internal version and Zotero/Node/tool versions.
- Full Git HEAD and dirty status; a dirty commit hash alone is insufficient.
- SHA-256 of each packaged source file, manifest, final XPI, and inventory.
- Exact packaged entry list, validation results and test report.
- Preserved source snapshot/diff plus relevant untracked source, excluding secrets.

Proposed filename: `ResearchAnnotator-dev-<UTC>-<shortCommit>-<contentHash>.xpi`.
Choose distinct internal development versions after validating version ordering
and installation behavior in the isolated Zotero profile. Do not silently append
an untested version suffix or change production ID/update settings.
An external timestamp alone cannot distinguish builds in the add-on manager.
Changing the ID merely to identify builds can create a second simultaneously
running extension; it is not a safe default.

## Safe test environment and rollback

Before an authorized install/test:

1. Record installed identity/hashes and preserve its exact package or unpacked
   directory, profile and preference settings. Preserve the working source and
   all existing uncommitted/untracked work without cleanup or reset.
2. Close Zotero and back up the entire data directory and profile to a separate
   dated location. Include database, attachment storage, `annota-fields.json`,
   chat history and `annota` backup folders. Back up linked attachments outside
   the data directory separately. Exported citations alone are not a full backup.
3. Verify the backup is readable and retain a manifest of its contents. An
   application-code rollback does not roll back JSON schemas or research data.
4. Create a separate test profile with a distinct copied/disposable data directory
   and no production-account sync. Check the directory explicitly before launch;
   profiles can otherwise share data. Do not run two instances against the same
   data directory. See [Zotero multiple profiles](https://www.zotero.org/support/kb/multiple_profiles).
5. Test the candidate and previous known-good extension only against disposable
   data. Keep the identity/update situation controlled and recorded.

If a test fails, stop the test instance, preserve the failed test data/logs, and
restore the known-good extension in the test profile first. If formats changed,
restore its matched test-data snapshot rather than opening changed data blindly.
Do not delete annotations, notes, tags or JSON as a rollback shortcut.

For any later production rollback, first preserve current data so research
created since the backup is not lost. Prefer code-only rollback when storage is
compatible. A full data restoration requires a deliberate recovery plan and
reconciliation of newer edits; verify offline in a copied profile before using
the production directory or reconnecting sync. Annota 2.41.1 is not presumed
compatible with ResearchAnnotator's current per-color JSON format.

## Regression test plan

All cases below are proposed; none is marked passing in real Zotero. Use fake
provider responses for repeatable failures, then a small authorized provider
smoke test separately. Preserve before/after Comment, JSON and note HTML.

| Area | Cases and expected result |
| --- | --- |
| Schema/UI | Manual-only, AI-only and mixed schemas; every surface shows configured labels and correct values/placeholders; AI read-only |
| Manual controls | Text/textarea, checked/unchecked, dropdown including removed option; clearing last value persists after reopen/restart |
| AI access | Explicit action available on existing annotations; success visible in card/popup/note; configured creation semantics tested after decision |
| Failures | Timeout/auth/error, one-field partial failure, empty/malformed response; previous values and native Comment unchanged, honest failure status |
| Field context | Two colors with same field name; two readers/libraries; abandoned/repeated selections; no cross-assignment |
| Storage | Awaitable successful write, failed write, corrupt fixture, legacy migration, debounce and shutdown; no silent original-file loss |
| Generation callers | Sidebar, context menu, batch, review/refill all merge existing values and preserve native Comment |
| Undo | Refill then undo restores structured values and derived notes consistently; later user edits protected |
| Notes | Creation/edit/color change/delete; normalized HTML; concurrent updates; no stale/duplicate entries; sort/schema refresh |
| Identity | Convert highlight/underline, restart; all color records, themes, experiments and links preserved under new identity |
| Paper scope | Multiple attachments and standalone documents, against the agreed consolidated-note policy |
| Lifecycle | Disable/enable, window close, reader switch, shutdown during pending work; no duplicate listeners or callbacks after teardown |
| Compatibility | Actual supported Zotero versions/OS, private reader/editor APIs; macOS-only spelling/Apple paths tested on macOS |
| Inherited tools | Chat/history/citations/note proposals, reference extraction, note reduction/undo, batch/retry, collection controls and translations |
| Scale | Measure edit/rebuild cost on increasing library sizes before claiming performance defects or improvements |
| Delivery | Exact entries/manifest identity/hash, install identity, update eligibility and rollback in isolated profile |

Start with focused unit checks for the reproduced logic and mocked storage/provider
failures. Use real Zotero integration checks for DOM hooks, HTML normalization,
notifier ordering and restart; mocks cannot prove these. Run affected checks
after each fix, then broaden only where dependencies or unresolved failures
justify it. Record build identity, environment, steps, expected/actual results
and evidence in every runtime test report.

Current color-layout artifact: `C:/Users/Ahmed/Documents/ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-011737-134.xpi`. Build inventory: [DEVELOPMENT-BUILD-20261116-011737-134.json](DEVELOPMENT-BUILD-20261116-011737-134.json). Total: 118 passing tests (all 114 retained); package-dev.ps1 verified all 20 runtime files.

Data Infrastructure artifact: `C:/Users/Ahmed/Documents/ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-020142-005.xpi`. [Exact build inventory](DEVELOPMENT-BUILD-20261116-020142-005.json). Version 2.42.0; ID researchannotator@pino; 21 packaged files verified. 162 tests passed.

Research Note Generation artifact: [20261116-075249-726](DEVELOPMENT-BUILD-20261116-075249-726.json), C:/Users/Ahmed/Documents/ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-075249-726.xpi. Version 2.42.0; ID researchannotator@pino; 24 packaged files byte-verified; 190 tests passed. Package SHA256: `3dd445d3990821d7dd4c4fb39430883233bfb7cb024e542277676622c112bdcc`. Native Zotero acceptance pending.

Final integrated candidate: [20261116-085209-893](DEVELOPMENT-BUILD-20261116-085209-893.json), C:/Users/Ahmed/Documents/ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-085209-893.xpi. **226 tests passed**, 0 failed/skipped; all 190 preceding cases retained with the documented legacy snapshot assertion correction. 27 packaged files byte-verified; 18 runtime and 4 test JavaScript files syntax-checked; 3 XHTML files parsed as XML; git diff --check passed. Final mocked 15,000-record measurement: 1583 ms cold / 25 ms cached, 25-row page. Package SHA256: `8a309b2f8c6d7693b6ee91dbece5d83bea99c760349616230f569d19148c5254`. Native Zotero acceptance pending.

Final Unified Workspace candidate: [20261116-095828-245](DEVELOPMENT-BUILD-20261116-095828-245.json), C:/Users/Ahmed/Documents/ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-095828-245.xpi. **242 tests passed**, 0 failed/skipped; all 226 preceding cases retained. 32 packaged files byte-verified; 20 runtime and 5 test JavaScript files checked; four XHTML and three SVG files parsed as XML; git diff --check passed. [Native packaged-resource report](NATIVE_WORKSPACE_VERIFICATION_XPI.json) verifies Zotero 10.0.8 in the isolated synthetic-data profile, user positioning and 100 byte-identical native rebuilds (2436 characters each). Final mocked 15,000-record query: 1690 ms cold / 27 ms cached. Package SHA256: `eb043878551034d5854c457d55ed36026c7d2ed2f7e5c8919951aa0323a3805e`. Remaining owner-library/editor/provider/platform acceptance is listed above.

Validated integrated candidate: [20261116-175519-328](DEVELOPMENT-BUILD-20261116-175519-328.json). Packaged-XPI native selection evidence: [NATIVE_USABILITY_XPI.json](NATIVE_USABILITY_XPI.json), Zotero 10.0.8, success true. Mouse and native keyboard selections changed application state; light/dark opacity, dismissal, 60-option scrolling and retained state passed.

Retained-trigger candidate: [20261116-184638-320](DEVELOPMENT-BUILD-20261116-184638-320.json). All 266 regression tests pass. [Packaged native AI verification](NATIVE_AI_TRIGGER_XPI.json) passed in isolated Zotero 10.0.8 using real loopback HTTP requests, persistent jobs/storage and managed notes. [Provider evidence](NATIVE_AI_PROVIDER_REQUESTS_XPI.json): eight requests, two deliberate failures, explicit Retry in each mode; no hidden retry. Full PDF-reader gesture/provider acceptance remains outstanding.

Delivered Network candidate: [20261116-223342-088](DEVELOPMENT-BUILD-20261116-223342-088.json), `C:/Users/Ahmed/Documents/ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-223342-088.xpi`. SHA256: `d90a83885e5096d47035bb573e5f50639b657fdf88ee9239e6e06b271f377c9a`. All 306 tests pass (301 mocked/service, five real Edge browser fixtures); 22 runtime and 12 test/probe scripts pass syntax checks, five XHTML and three SVG documents parse, git diff --check passes, and all 35 archive entries match their source hashes.

[Packaged native Network evidence](NATIVE_NETWORK_XPI.json) passed on isolated Zotero 10.0.8 with 31 trusted clicks and 234 native input events: manual/inverse relationships, graph selection/pan/zoom, source PDF navigation, type creation/rename/archive, topic membership, managed-note generation/user-content/identity, retained state, questions and roles, Explorer transfer, scoped AI preview, edited approval/rejection, cancellation and complete backup/import. [Restart evidence](NATIVE_NETWORK_RESTART_XPI.json) verifies durable records/settings/notes and no automatic discovery. [Retained AI-trigger evidence](NATIVE_AI_TRIGGER_NETWORK_XPI.json) passes Automatic/Manual generation, per-field Retry, native Comments/manual values, completed-value protection, note synchronization, instruction-change protection and explicit historical batches. [AI provider log](NATIVE_AI_PROVIDER_REQUESTS_NETWORK_XPI.json): eight requests, two deliberate failures. [Network provider log](NATIVE_NETWORK_PROVIDER_REQUESTS_XPI.json): four requests across retained diagnostics and final acceptance; the final successful workflow made two (discovery and cancelled discovery), and restart added none. No paid provider was used.

Failed native attempts are retained. Attempt 1 deselected the sole supporting citation, which validation correctly rejected. Attempt 2 observed retained suggestions before the new batch finished. The final harness waits for its own evidence batch and retains at least one citation. These were acceptance-harness corrections; no runtime changes or second Network XPI were needed. Earlier source diagnostics exposed and led to the documented backup validation fixes B32/B33. Remaining broader live acceptance is listed above.

## Final delivery evidence (2026-11-17)

Final package: ResearchAnnotator-dev-20261117-131627-077.xpi. All 398 regression tests pass, preserving the previous 372. This comprises 375 structured/service tests, 12 dual-view tests and 11 real-browser tests. See refinement-regression-final-delivery.txt. Runtime syntax: 28 files; XML: six XHTML and four SVG; diff and 46-file hash verification passed.

The exact final XPI passed 30 native refinement checks and 30 native shared-workflow checks in isolated Zotero 10.0.8 on Windows. Reports: NATIVE_UI_UX_REFINEMENT_FINAL_XPI.json and NATIVE_UI_UX_REFINEMENT_FINAL_WORKFLOWS_XPI.json. The two runs captured 39 native screenshots. The layout matrix also passed at 125% device scaling/dark mode. Chat used a local simulated provider; opening diagnostics created no additional job. PDF navigation was checked against actual fixture positions in both Chat views.

Native note save/reopen retained quotes, links, separate color indicators and 1.1 font ratio. One hundred consecutive builds were byte-stable before normalization and another hundred after normalization. Same-note destination moves retained content and created a backup. Automatic and Manual preferences both persisted.

Screenshot inspection found readable complete labels, compact Single Row, uniform Slanted and equal-width Vertical buttons. Wrap/Stacked retain their frozen baseline geometry. Settings and destination controls fit their tested windows. Native link colors follow Zotero theme defaults. The native title link tooltip can temporarily cover nearby content while focused; it is not stored visible management text. Expanded diagnostics scroll within the conversation at compact sizes.

Remaining release verification: additional operating systems/Zotero versions, native OS scaling beyond this Windows setup, live group-library permissions and broad representative personal-library acceptance. Group/read-only/library isolation are regression-tested with mocks; native placement checks used the isolated local library. No unsafe release script, commit, push or backup deletion occurred.


Final restart verification also passed 16 checks (NATIVE_UI_UX_REFINEMENT_FINAL_RESTART_XPI.json), for 76 native checks total. Persisted managed PDF identities, authored content, Chat sources/citations/capture journals, missing-embedding guidance and window/listener shutdown cleanup passed. The last source changes affected comments only: REFINEMENT_TRANSLATION_EQUIVALENCE.json confirms identical executable syntax trees across all 28 runtime JavaScript files. The expanded French-fragment audit is clean.

## Final packaged verification (2026-11-22)

Delivered candidate: **ResearchAnnotator-dev-20261122-162144-633.xpi**, SHA-256 `b56ba1887ddf026a53724a759ee3c72f070a7e183524e4d2b137b1753140a8c4`. The safe packager verified all 46 allowlisted files against source; no tests, fixtures, reports, credentials or backups are packaged. See DEVELOPMENT-BUILD-20261122-162144-633.json and RELIABILITY_VERIFICATION.json.

All **435 regression tests pass** (398 retained baseline cases plus 37 focused cases; no failures or skips): 423 service/shared-view/mocked cases and 12 real Edge browser fixtures. Log: reliability-regression-verified.txt. Intentional deletion-policy assertions now require preserved modes and recoverable ownership rather than the former forced Static behavior.

The exact packaged resources passed **119 isolated native Zotero 10.0.8 checks**:

| Native report | Passing checks |
| --- | ---: |
| NATIVE_UI_UX_RELIABILITY_VERIFIED_LIFECYCLE_XPI.json | 34 |
| NATIVE_UI_UX_RELIABILITY_VERIFIED_CHAT_XPI.json | 34 |
| NATIVE_UI_UX_RELIABILITY_VERIFIED_PRESENTATION_XPI.json | 33 |
| NATIVE_UI_UX_RELIABILITY_VERIFIED_RESTART_XPI.json | 18 |

These cover verification sequences A-H: automatic creation/editing, Workspace/color/checkmark consistency, deleted-note regeneration, PDF-cited keyword answer and actual native Capture Evidence, unsupported item selection, explicit retry without restart, bulk Manual-to-Automatic and note styling/identification. Native note content is byte-stable through 100 unchanged rebuilds before editor normalization and another 100 after actual save/reopen. Restart retains configuration ownership, citations, captured native highlights and shared values; shutdown removes toolbar/views/listeners and stops background infrastructure.

The loopback ledger NATIVE_RELIABILITY_PROVIDER_VERIFIED_XPI.json records six generation requests (one deliberate failure) and two Ollama-compatible embedding requests with a separate embedding model. Evidence capture itself triggers no AI job. The provider was stopped after testing. No external or paid model was used.

Screenshots: 30 native captures under ui-ux-screenshots-reliability_verified_lifecycle_xpi, ui-ux-screenshots-reliability_verified_chat_xpi and ui-ux-screenshots-reliability_verified_presentation_xpi. Inspection covered source guidance before asking, inline citations, capture preview/focus, explicit note-only provenance, all Workspace headings, scrollable bulk selection/confirmation, all five unchanged popup layouts in creation/existing views, centered Ask action, toolbar, color editor/management border, destination selector and native notes in light/dark schemes. No clipped color labels or overlapping palette targets were observed at tested dimensions. Long management lists and capture previews intentionally scroll. Native spell checking may underline the product name; native hyperlink appearance remains theme-controlled while the semantic indicator is separate. Zotero's own banners and existing fixture history remain in screenshots. Saved Searches and Activity retain their existing layouts.

Validation: 28 runtime JavaScript files parse; six XHTML and four SVG files parse as XML; lexical audit finds zero suspected French source comments or user-facing inherited branding literals; git diff --check passes. Historical compatibility identifiers and licensing remain documented in REFINEMENT_AUDIT.md. The unchanged palette.js hash matches the accepted baseline.

Remaining acceptance: the user's real PDF corpus and model quality, a real locally installed Ollama service, group-library permissions and other Zotero/platform versions. The desktop bridge is unavailable, so these checks are controlled native integration rather than manual OS interaction. Zotero logs a pre-existing selected-library API deprecation warning on a compatibility path; tested flows still succeed. Native item-list badges remain unsupported; the safe visible note-body label is implemented. Spontaneous persisted-color changes from generation, ordinary By Publication parenting corruption and lost listeners were not reproduced; only confirmed causes are claimed fixed.

## Final verification evidence ? 2026-11-22

Version **2.43.0-beta.1**. Development XPI: ResearchAnnotator-dev-20261122-203531-026.xpi. Beta XPI: ResearchAnnotator-2.43.0-beta.1.xpi. Both are byte-identical, SHA-256 `0ee254179983a77cbd1c784da06b15fd0d5ea4ff437c3acbdc241a379947652e`. package-dev.ps1 verified all 47 allowlisted entries against source; package-beta.ps1 independently reverified the inventory and created the labelled copy. No private profiles, screenshots, reports, backups or credentials are packaged. Local inventory: DEVELOPMENT-BUILD-20261122-203531-026.json; verification summary: BETA_VERIFICATION.json. These generated evidence files are deliberately not Git release assets. Build steps reproduce the package contents; ZIP timestamps/checkout line endings are not a claim of bit-for-bit builds on every platform.

**465 tests pass**: 435 retained baseline cases plus 30 focused cases, no failures or skips. Of these, 453 exercise services/shared state/mocked integrations and 12 are real Edge browser fixtures. The deletion test now explicitly requires a persistent tombstone and confirmed recreation, superseding the former regeneration expectation. Command: `node --test tests/*.test.cjs`. Log: beta-regression-history-safety.txt.

**167 native assertions pass** against the installed beta and its exact packaged runtime resources:

| Native report retained locally | Checks |
| --- | ---: |
| NATIVE_UI_UX_BETA_RELEASE_LIFECYCLE_2_XPI.json | 36 |
| NATIVE_UI_UX_BETA_RELEASE_CHAT_XPI.json | 35 |
| NATIVE_UI_UX_BETA_RELEASE_PRESENTATION_XPI.json | 33 |
| NATIVE_UI_UX_BETA_RELEASE_MAPPING_XPI.json | 36 |
| NATIVE_UI_UX_BETA_RELEASE_RESTART_XPI.json | 24 |
| NATIVE_UI_UX_BETA_UNREAD_HISTORY.json | 3 |

A separate actual AddonManager installation confirms version 2.43.0-beta.1 is active (NATIVE_UI_UX_BETA_INSTALL_HISTORY_SAFE.json). The previous test add-on directory/installed XPIs and history snapshots were preserved. Native wrappers append only test instrumentation to source-matching packaged bootstrap bytes; production resources are loaded from the unchanged XPI. Installed manifest metadata is verified too. The unread-history test started with Chat genuinely unloaded and confirmed identical persisted conversations after actual application shutdown.

Native checks include source data preservation, PDF/cross-publication updates, intentional deletion and confirmed recreation, permanent deletion in Automatic/Manual/Static modes, standalone/child-note context dispatch, actual palette deletion/reassignment/restoration, per-note ordering through the real controls, native color persistence, original linked PDF hashes, restart/Undo, exact citation navigation and highlight capture, shared fields, failure retry, geometry and cleanup. Notes are unchanged through 100 rebuilds before editor normalization and another 100 after actual save/reopen.

Native screenshots were captured for the changed settings/logo/inline actions, mapping preview, expanded per-note order at 1100x850, note editor light/dark schemes, existing five color layouts and both popup types, source coverage/citations/capture, and Workspace sections. Inspected changed interfaces are readable and reachable; long management/history lists scroll. Settings captures switch the document color scheme rather than proving full OS-theme acceptance; the packaged logo's opaque backing remains readable. Test-profile history/banners are visible in captures and are not published. Extra visual record: NATIVE_UI_UX_BETA_RELEASE_ORDER_VISUAL.json.

Validation: 29 packaged JavaScript files parse; six XHTML and four SVG files parse as XML; release/test scripts parse; git diff --check and package hashes pass. Loopback providers avoid external/paid requests. The Windows desktop bridge remains unavailable, so native evidence is controlled Gecko integration and compositor capture, not manual OS acceptance. The semver beta label produces a Gecko numeric-format advisory, but real Zotero installation and activation succeed.

Repository visibility was verified as **private**. Commit/push do not change visibility. A beta candidate/draft in this repository is not a publicly accessible release. Public distribution requires a separately chosen public destination or an explicit visibility decision after reviewing repository history. The private beta feed is not anonymously readable; use manual installation while the repository remains private. Unsupported/unverified platforms, group-library permissions, real Ollama quality and embedded-PDF limitations remain as documented above.
