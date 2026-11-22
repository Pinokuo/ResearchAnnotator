## Public beta milestone (2026-11-22)

The 2.43.0-beta.1 milestone supersedes the prior deletion-regeneration policy: intentional managed-note deletion persists a management tombstone until explicit Recreate / Resume management. Add inline palette actions and packaged logo; per-note color order with explicit one-time rebuilds in all modes; previewed native highlight color mapping with persistent jobs, recoverable journals and conflict-aware Undo. Preserve structured data and PDF bytes; never import embedded annotations automatically or generate AI during mapping. See BETA_READINESS.md, INSTALLATION.md and CHANGELOG.md for current behavior and compatibility.

## Reliability milestone update (2026-11-22)

Confirmed: Workspace PDF requests defaulted to Manual; Delete set Static and retained ownership; a failed downstream note sync rolled back only the already-saved color in memory; PDF batch settings could be materialized as a standalone note; corrected Keyword retries could reuse semantic snapshots; optional note context could support an answer without PDF evidence; Item method-existence checks did not ensure file-attachment API validity; preflight/history failures could leave temporary state stuck. Fixes and evidence are detailed in RELIABILITY_AUDIT.md. Spontaneous persisted-color mutation, normal PDF parent corruption and lost listeners were not reproduced in the baseline native sequence.

## Integrated refinement update (2026-11-17)

Refinement fixes: generic/overwritten note titles; combined hyperlink/semantic color formatting; unnecessary post-editor normalized HTML rewrites; unequal Slanted lengths, left-clustered Vertical buttons and excess Single Row padding; misleading free-form AI Comment help; missing per-answer retrieval diagnostics. Invalid destination references now fail visibly without changing libraries. See REFINEMENT_AUDIT.md for confirmed causes, safeguards and remaining verification.

# Defect register

## UI/UX consolidation findings (2026-11-17)

- The inherited Chat renderer could share messages but had no coordinated second
  view, persisted form drafts or ordered history writes. The view coordinator now
  shares conversation state, serializes existing history and focuses one window.
- Keyword retrieval already defaulted to keyword in the service. The usability
  defect was insufficient prerequisite guidance for an explicit saved semantic/
  hybrid selection; keep that preference and explain missing configuration/consent.
- Human coverage replaces a raw coverage JSON object in assistant output.
- Network section CSS hid the question detail/evidence controls. Native interaction
  testing caught the inherited selector; focused section rules now expose them.
- Dense controls and semicolon role input were presentation issues. Existing
  controllers remain while guided/secondary panels and array role editing replace
  their dense entry points. Explorer scope controls now fit their column.

## Grounded Chat and consolidated-note correction (2026-11-17)

- **B34 - Persistent Source/Page metadata:** confirmed preserved saved inclusions and permissive missing-option checks. New defaults explicitly omit metadata, while selected batch replacement previews differences, backs up and updates through shared reconciliation. Explicit settings are not silently migrated.
- **B35 - Inherited Chat grounding limits:** attachment-only text cache and numeric/page links did not validate supplied passage identities or changed files. Replaced the answer path with fingerprinted page retrieval and validated citation snapshots while preserving useful Chat/history/provider tools.
- Native acceptance caught reader-compartment cloning, missing provider cancellation hooks and getAnnotations returning objects without the explicit ID option. These new integration defects were corrected and have native evidence. Zotero trimming terminal annotation whitespace is intentional normalization, not paraphrasing.
- Capture recovery retains original undo ownership instead of absorbing later author edits. Explicit AI capture uses parent-dependent shared jobs rather than waiting for a queued child inside a single-concurrency parent. [Architecture and verification](RESEARCH_CHAT.md).


## Network native verification and inherited backup corrections (2026-11-16)

- **B32 ? Native backup rejected aiConcurrency:** the settings allowlist included the integer preference, but scalar validation classified it as a string. Native complete export exposed this; validation now accepts integers 1?8.
- **B33 ? Reactivated definitions blocked backup:** the validator treated an active definition and its archived historical version as duplicate active fields. Each list is now validated separately; duplicate IDs within a list still fail, and historical instructions remain intact.
- Network live refresh preserves unchanged native option nodes and selected editor/role state. Native smoke evidence records trusted input separately from browser/mocked checks. New Network fingerprints and expected-record guards protect managed notes from missing relationship/question state. See [RESEARCH_KNOWLEDGE_NETWORK.md](RESEARCH_KNOWLEDGE_NETWORK.md).


## Retained AI trigger and native retry corrections (2026-11-16)

- **B30 ? Saved Manual policy ignored:** creation still generated AI despite the audit calling the trigger obsolete. Restore the useful conditional AI Generation Trigger, honor saved auto/manual settings (including global-only AI), and route creation/explicit UI generation through shared persistent jobs. Automatic still works; Manual now requires a user request.
- **B31 ? Hidden native HTTP retries:** isolated Zotero showed an HTTP 500 request retried inside Zotero.HTTP.request despite shared lifecycle safeRetry. Disable native error/throttle retry specifically for shared AI calls so ambiguous paid failures remain explicit. Existing job-manager rate-limit recovery is retained.
- Failed persistent jobs now resume on explicit per-field Retry; automatic creation does not resume them. Partial successes and native Comments remain intact. See [WORKSPACE_USABILITY.md](WORKSPACE_USABILITY.md) and TESTING.md for accepted evidence and remaining limits.


## Workspace usability regressions (2026-11-16)

- **B27 ? Delayed AI instruction editor:** palette validation of a temporarily incomplete AI definition threw before rendering. Render first; handle input/change once; retain valid settings and show validation. Stable instruction drafts survive type changes.
- **B28 ? Native dropdowns transparent/unselectable:** isolated Zotero reproduced both symptoms in the 095828 XPI. Missing native window styles prevented correct popup interaction; global/Zotero styles restore selection, and explicit theme-aware popup colors ensure opacity.
- **B29 ? Note presentation and workspace hierarchy:** new PDF defaults omit repeated metadata/page labels and empty values; grouped metadata appears once. Existing explicit configurations and managed identities are retained. Settings inventory and update workflow: [WORKSPACE_USABILITY.md](WORKSPACE_USABILITY.md).


## Unified Workspace live regressions and review update (2026-11-16)

- **B24 — User content positioning:** confirmed whole-compilation replacement moved
  retained prose behind new highlights. Shared reconciliation now uses annotation
  identities and attached user tails, with deletion/sort/group policies documented
  in [RESEARCH_WORKSPACE.md](RESEARCH_WORKSPACE.md). Rich/uncertain content, repair,
  invisible markers and incomplete-data protection remain.
- **B25 — Inaccessible window commands:** both published modules referenced a
  startup-local `rootURI` as a global. Native Zotero reproduced ReferenceError in
  both actual published modules. A registered chrome XUL shell now owns opening,
  HTML controllers, ready handshakes and visible diagnostics. Native testing also
  caught initial-blank unload/child DOM-event handling and a raw separator newline
  drift; these paths are covered rather than inferred from browser mocks.
- **B26 — Partial annotation review:** the existing review predicate required every
  field to be empty. It now recognizes any missing applicable manual/AI field,
  independently of native Comment, and reports shared failed/outdated AI states.
  Shared multi-select reading and XML-document element handling were corrected.

See [RESEARCH_WORKSPACE.md](RESEARCH_WORKSPACE.md) and the final build inventory for
mocked/browser/native evidence and the remaining real-library verification limits.

## B23 - Recursive managed-note snapshot regression (2026-11-16)

Priority: critical; owner reproduced excessive note growth in real Zotero. The old
`notes.preserveEdits` fallback concatenated previous.content with a snapshot of the
entire current document when wrappers disappeared and HTML differed. Existing
snapshots were copied recursively. Installed editor schema inspection confirms
custom wrappers are not stable boundaries; source-data fingerprints themselves
are independent of HTML. See [MANAGED_NOTE_REPAIR.md](MANAGED_NOTE_REPAIR.md) for
exact evidence, source hash, repair/recovery and required native verification.

Implemented candidate: semantic block replacement, no whole-document fallback,
invisible supported-link markers, post-save PDF ownership, stable local note-key
lookup, explicit backup-first flattening of exact plugin-labelled snapshots and
restoration with a second backup. Ordinary quotes and unique/uncertain content
remain. Existing affected notes stop regeneration until repaired. Tests cover
100 normalized rebuilds, restart, genuine prose, source/AI changes, nested repair,
backup failure and identity. Earlier B18/document-wide snapshot claims below are
superseded. Explorer work is preserved and consumes this same fixed engine.

## Research Note Generation verification (2026-11-16)

Implemented candidate with 190 passing tests, retaining all 162 previous cases.
A new regression exposed configuration presence bypassing foreign-note completeness
checks; guards now require actual local ownership snapshots. Generic notes gain
fingerprints/prior-record checks, including when a missing record changes filter
membership. Retry refreshes notes affected by failed AI annotations; successes
remain saved. Static/manual PDF modes are checked before note creation to prevent
unwanted recreation. No native Zotero/provider/restart/performance acceptance is
claimed. See [RESEARCH_NOTE_GENERATION.md](RESEARCH_NOTE_GENERATION.md) and TESTING.md.

## Data Infrastructure verification update (2026-11-16)

Status below is code/mock verification, not real Zotero runtime acceptance. Older
line numbers and defect descriptions remain historical audit evidence. Details:
[DATA_INFRASTRUCTURE.md](DATA_INFRASTRUCTURE.md).

| Issue | Reverified evidence and candidate correction | Verification |
| --- | --- | --- |
| B04/B05/B07/B08 | Active batch/review used buildComment/remember and native Comment writes. Standard operations now use shared structured generation/jobs, durable merging and no AI Comment writes; failure preserves prior successes. Legacy helper definitions remain for compatibility. | Mocked provider/storage tests; live inherited tool smoke tests required. |
| B09 | Refill undo lacked structured snapshots. New v2 undo backups capture before/after records; exact post-state comparison protects subsequent edits and native Comment stays untouched. Legacy Comment-only backups keep their explicit old undo behavior. | Mocked restoration/conflict tests; actual undo-file/DB workflow pending. |
| B10 | Conversion copied legacy metadata only and early notifier ordering could precede migration registration. Source is registered before native call; all structured data transfers idempotently, conflicts/source history retained. | Direct migration and early-notifier mocks; native reader conversion pending. |
| B12 | Recent unmatched text could consume another selection; drafts were not attachment-bound. Active matching now requires exact passage and attachment/library; color drafts are separate. | Scoped matching regression; multi-reader live verification pending. |
| B13 | Empty native Comment implied empty structured data; inherited AI blank display hid fields. Review now classifies stored schema values and retains read-only placeholders/shared categorical controls. | Shared storage/schema tests; review UI runtime pending. |
| B14 | Some saves/normal shutdown were not durable; active corruption had no repair path. New validated schema/load/recovery, atomic backups/queues and async drain preserve committed state or fail closed. | Failure/corruption/migration/concurrency tests; no OS power-loss guarantee. |
| B18 | Generated wrappers could swallow user edits. Shared note service retains changed entries/documents as user snapshots, including normalized-heading protection. | Integrated idempotency, heading/prose and final-deletion tests; real editor normalization pending. |
| B19 | Discovery poller survived unregister. It now clears alongside debounce timers; detached draft views flush and release document observers. | Code review and baseline lifecycle tests; enable/disable/window-close pending. |
| B21 | Indexed record lookup is direct; JSON snapshots/retained job history and whole-document note compilation still scale with data size. | 15,000-record lookup correctness only; production performance unmeasured. |
| Cross-device sync | Server-matched setting allowlist/custom serialization block a trivial safe transport. No field conflict/tombstone protocol is enabled. Native-note transport remains an unproven candidate. | Installed Zotero 10.0.8 source inspected; no two-device runtime test. |

Visual color concerns are deferred polish, not addressed by this milestone.
Conservative note protection may intentionally block updates when local data cannot
be trusted; import a matching complete backup rather than erase complete notes.


## Color layout corrections (2026-11-16)

Confirmed code cause: shared max-width/shrink and overflow-wrap:anywhere could collapse Single Row labels; the old Slanted transform did not reserve transformed geometry. Reproduction: choose Single Row/Slanted with several long semantic labels in either popup. Source fixes now measure full labels, reserve shared popup width, pack rotated hit regions and scope changes away from Wrap/Stacked. Vertical is new. Collapsed rows previously hid Delete inside their expanded body; an accessible summary trash action now exposes the existing guarded choices. Severity: medium usability. Verification: 117 unit/regression cases and a real Edge matrix of 80 current plus 32 frozen baseline configurations pass. Zotero runtime acceptance remains unverified; browser fixtures cannot prove private reader positioning.


## Usability refinements: candidate verification (2026-11-16)

114 isolated tests pass, preserving all previous 93 and adding 21 cases. No live
Zotero acceptance is claimed. Static findings addressed in this candidate:

- Suggestion lists had no suppression state or separate dismiss action. Shared
  field-ID/category-ID suppression now hides a suggestion without changing its
  stored assignments; exact-value Restore reuses its historical identity.
- Creation moved Comment/Tags below fields while existing popups had another
  layout. `_orderAnnotationControls` now uses colors, Comment, Tags, globals and
  color fields; original native nodes/handlers survive. Tests verify AI leaves
  native Comment/Tags untouched after entry.
- Creation's custom picker used fixed wrapping while existing color controls read
  layout preferences. Both now call `stylePicker` and `styleButton`; shared CSS
  restores pointer/hover/focus/pressed feedback and readable white semantic labels.
- Popup widths depended on separate native/extension rules. Shared responsive width,
  padding, sizing and overflow constraints now apply to both; actual geometry near
  window boundaries still needs live testing.
- Palette controls offered archiving only and repeated large configuration blocks.
  Confirmed unused-custom deletion, usage-protected archive/reassignment and compact
  default-collapsed rows are implemented. The full existing editor is reused,
  with tested flush/parking behavior and no dropped advanced setting elements.

Verification includes real preference scripts in a minimal DOM, dismissal/reload/
backup compatibility, control ordering, shared picker renderers, field counts,
cancelled deletion, native/store/category/draft usage guards, reassignment rollback
and preservation of manual/AI/global/native data. Live checks must cover popup
dimensions, multi-action dropdown keyboard/screen readers, light/slanted colors,
drag handles/text drops, native Tags and confirmation dialogs. Permanent deletion
uses locally available Zotero/extension data; automatic cross-device synchronization
and completeness detection remain outside this milestone.

## Preceding integrated milestone verification (93-test baseline)

The preceding refinement was accepted by the owner except for missing creation
Comment. **B22 (High, fixed in candidate; live verification pending):** removing
the dedicated Research Comment input also removed the only pre-save Comment entry
UI. Installed Zotero SelectionPopup has no native Comment editor of its own.
Reproduce on the preceding build: select PDF text and try to type a Comment before
choosing a highlight color. `bootstrap.js` now renders a native-only Comment input,
keeps scoped redraw-safe drafts and saves it through native annotation creation or
the exact attachment/text item-add fallback. Existing native Comment and sidebar
editing remain independent; dedicated research category controls stay removed.

93 isolated tests pass, retaining all 58 previous cases and adding 35 milestone
cases. Tests cover stable palette/field identity, preservation/recolor rollback,
presets, real preference UI handlers under a minimal DOM, settings/research/backup
round trips, external library IDs, malformed files, conflict policies, duplicate
prevention, secret exclusion, historical-only exports, interrupted import recovery,
blocked edits after failed rollback and native Comment/AI independence. These are
not live Zotero/provider/filesystem-crash acceptance results.

Remaining limitations/risk checks:

- Custom creation uses a guarded private reader API. Unsupported readers retain
  native creation controls; custom creation requires a supported adapter. Test
  PDF/split views and actual popup closing/focus in installed Zotero.
- Palette merges with different stable IDs claiming the same hex/alias are rejected
  rather than guessed. Explicit replacement after the preview/backup imports the
  source definitions; unmatched local records and historical values remain.
- Credentials/executable paths are intentionally outside portable restore. Re-enter
  credentials separately where needed. Complete extension backup excludes Zotero's
  database/PDFs/ordinary notes and does not replace a matched profile/data backup.
- Import does not rebuild notes; no cross-device automatic synchronization or
  incomplete-device note protection protocol is implemented (DR08-DR12 remain
  separate scope). It makes no AI requests. Restored running work is retryable.
- Large exports/imports and real restart/power-interruption recovery need live
  fixture verification. The file UI rejects inputs over 100 MB; future portable
  format versions are rejected rather than silently converted.
- B05/B07-B10/B12/B13/B18-B21 are not universally solved by these packages. Legacy
  batch/review contracts, conversion migration, full managed-content ownership,
  lifecycle, performance and release/update configuration remain separate work.

## Phase 1 refinement update

Static inspection confirmed redundant dedicated category controls were created
even when later hidden, and the creation capture's separate comment save could
replace native Comment (including with an empty draft). The controls and that
Comment write are removed; capture retains native tag entry. Existing-popup legacy
category writers are removed in favor of shared global fields. Historical comment
imports and the old migration entry point preserve originals and native Comment;
note rebuilding no longer performs destructive comment migration.

Multi-select suggestions previously required nonempty typing, used inline buttons
without arrow/Escape navigation, and could show case-variant selected suggestions.
The shared dropdown/chip implementation addresses these paths, including viewport
positioning and cleanup. Global Fields now follows Highlight Colors.

Verification: 58 isolated regression tests pass, preserving all previous 48 cases
and adding 10 refinement cases. Live Zotero acceptance is pending, particularly
popup top-layer/fallback behavior, native focus/shortcuts, dark/light contrast,
read-only libraries and historical metadata migration. Earlier fallback-interface
descriptions below are superseded: original data survives failure, but dedicated
research category/comment controls are no longer offered.

## Phase 1 global fields implementation status

The Phase 1 implementation adds global definitions/values, searchable categorical
fields, per-field retries and recoverable legacy metadata import. All 48 tests
pass, retaining the preceding 33 cases; existing sidebar action assertions now
check the requested row placement rather than the superseded header placement.

Global/color display-name collisions, global renaming/removal, per-color identity,
color changes, clearing/reload, category duplicates, settings editing/reordering,
partial AI success/retry, concurrent edits, migration failure/repetition and
normalized PDF-note output have isolated coverage. Ordinary-note preservation is
explicitly tested. No new live migration/UI result is claimed.

Limitations needing live validation: preferences layout and multi-select focus/
keyboard behavior; libraries with large historical datasets; startup migration
and note-editor normalization across Zotero versions. Read-only libraries retain
legacy data rather than being written. Legacy tags/notes intentionally remain
as recovery sources and are not kept in two-way sync with new global edits.
Options edits do not silently rename existing categories; a dedicated categorical
rename UI and persistent AI job/status history remain future work. Runtime errors
retain field-local Retry during the session; no automatic existing-library AI
generation is introduced by this phase.

## UI and formatting implementation update

The preceding automatic-generation/deletion build is confirmed working live by
the product owner. New implementation changes are automated-test verified only:

- Permanent Fill with AI controls have become small failure-only Retry controls
  in popup/sidebar; request progress and errors remain visible. The existing
  individual pipeline and automatic creation behavior remain intact.
- Redundant AI response labels are discouraged in individual prompts and removed
  only on an exact leading configured name/label match, including common bold
  and heading forms. Similar scientific headings and introductory sentences are
  preserved. Shared safe presentation supports paragraphs, inline emphasis,
  code, sub/superscripts and meaningful headings. Historical JSON is not rewritten.
- Shared compact field containers use muted manual/AI tints and inherited theme
  text colors. All manual control types and read-only AI rows remain supported.
- Native note-editor horizontal rules separate managed entries. Rebuild recognizes
  boundary-adjacent rules in both plain and normalized div-wrapped form, preventing
  duplication and stale separators after deletion. Footer/introduction rules and
  prose outside managed entries are preserved.

All 33 tests pass, retaining the original 23. The existing popup action case now
tests the explicitly requested failure-only contextual action. Added coverage
includes normalization, safe rich presentation, read-only historical formatting,
retry visibility, common styling and separator idempotence/sorting/deletion.
Actual light/dark layout, popup dimensions and note-editor rendering remain live
verification items. Unrelated historical defects remain out of scope.

## Automatic generation and deletion implementation update

The product owner reports successful live verification of the preceding
structured-field development build. The new changes below have automated test
coverage; they have not yet been tested live by this implementation session.

- B02: Add notifications now invoke the shared safe individual generator for
  configured AI fields, after durable manual capture. AI-only schemas no longer
  exit early. Session add-event deduplication prevents repeated generation;
  render/load/modify paths do not start it. Shared transient state drives
  `Generating...`, saved/error status and explicit retry in annotation views.
- B11: Delete handling resolves attachment identity from notifier/cache or existing
  managed-note markers/links, then uses the same per-attachment rebuild queue.
  The queue supports no remaining annotation. Session deletion keys exclude stale
  cached objects and reject late AI results. Batch deletion renumbers entries.
- B18 (partial): Rebuild replaces recognized managed ranges instead of truncating
  the note suffix. Unrelated introduction, inter-entry content and footer survive.
  Normalized wrapper-free HTML is recognized via annotation headings and configured
  generated field paragraphs. User edits inside a managed wrapper remain managed;
  historical layouts with unknown/removed labels require separate migration work.
- B22: Creation still exposed the native Add to Note button. The installed Zotero
  reader bundle identifies it as `.selection-popup > button.toolbar-button.wide-button`;
  a creation-scoped stylesheet now suppresses it without disabling note features.

Validation: all 23 tests pass, retaining the original 13. New cases cover automatic
AI-only/mixed creation, duplicate notifications, progress, failure/retry, concurrent
manual drafts, no generation on open/reload, targeted action suppression, immediate
deletion/renumbering, final/multiple deletion with normalized HTML, restart fallback
and queued note-save/late-AI races. Other baseline findings remain unchanged.

Baseline: 2026-11-15. Entries below preserve the original audit evidence. Evidence is
from the current working tree, not the installed extension. Line references
are baseline anchors and may move. No Zotero runtime reproduction was performed.

Verification labels:

- **Isolated:** actual source exercised in memory with mocked Zotero/provider
  services, without disk writes. Confirms the stated logic, not the full UI.
- **Static:** directly supported by source inspection.
- **Risk:** plausible runtime consequence; integration reproduction required.
- **Artifact:** package/configuration contents inspected read-only.

Severity: High means potential saved-data loss or a blocked core workflow;
Medium means inconsistent behavior, reliability or operational exposure.

## Individual structured-field implementation update

The focused implementation now addresses B01 and the popup portion of B03:
popup AI rows are read-only with labels/placeholders and an explicit action.
B06 is covered by dirty-field patch saves, including intentional empty values.
The new individual `generateStructuredFields` service rejects failed/empty field
results before committing any generated values, preserves existing fields and
does not write native Comment. This addresses individual-path portions of B04
and B07; batch/review retain their audited behavior and defects.

Individual creation/manual/AI saves use awaitable `saveValues`, serialized disk
writes and publish-after-success; unreadable files are rejected. This addresses
part of B14. Legacy remember/debounce callers and shutdown behavior remain.
New sidebar/popup views read JSON consistently, without treating native Comment
as fields; legacy parser helpers remain for unchanged review workflows.

Validation: 13 focused Node regression tests pass, including actual renderer
logic against a minimal DOM, generation/failure/concurrency, storage reload and
note output. Syntax and whitespace checks pass. No live Zotero UI, provider or
restart result is claimed. B02 automatic creation behavior, B05, B08–B13 and
other unrelated baseline findings remain outside this implementation's scope.

## B01 — Existing-highlight popup omits AI fields (High)

Evidence: `bootstrap.js:4789` `visibleFieldsFor` filters out `type === "ai"`;
popup rendering uses it at `:5944`. Creation uses the full schema. The sidebar
uses another renderer in `card-fields.js`.
Reproduce: configure a manual and an AI field; create a highlight; compare the
creation popup with the popup opened by clicking it. Expected: labeled,
read-only AI row and placeholder/value in both. Status: **Isolated** filtering;
reported UI symptom, runtime not reproduced.

## B02 — Creation path makes no AI call (High)

Evidence: `bootstrap.js:2599` `handleItem` saves pending values but never calls
`buildComment`; no nonempty manual values causes an early return. Trigger
settings remain configurable but are not consumed by this handler.
Reproduce: configure an auto color with manual and AI fields, enter a manual
value and create a highlight. Inspect generated values and provider calls.
Status: **Isolated**, zero generation calls; AI-only creation also exits by
inspection. Whether automatic generation should be restored needs a product
decision; explicit generation remains required.

## B03 — No AI action in clicked-highlight research popup (High)

Evidence: `_renderExistingAnnotationResearch` adds fields/colors/conversion but
no generation button. Sidebar header has a separate button in
`card-fields.js:550`; visibility at `:365` requires resolved values, writable
annotation and an explicit AI field. Legacy/custom-comment resolution can fail.
Reproduce: compare clicked popup, sidebar header and context menu for the same
annotation. Status: **Static** popup omission and sidebar conditions. A missing
sidebar button in the installed application is **not yet explained conclusively**.

## B04 — AI-field failure can be reported as success (High)

Evidence: `bootstrap.js:4058` `buildComment` catches individual field failures
and assigns an empty value, then returns normally. `card-fields.js:719` can
save output, clear the failed tag and display saved status.
Reproduce: make one per-field generation fail while a manual field is populated.
Expected: explicit partial/failure status, old data preserved. Status:
**Isolated**, simulated provider failure returned manual output plus blank AI.

## B05 — Failed refill can erase saved AI values (High)

Evidence: `review.js:504` blanks selected target values before generation;
`:510` copies returned empty values back; B04 prevents rejection. `save` then
replaces the record and comment.
Reproduce in a disposable library: save an AI value, select it for refill,
simulate failure, inspect JSON/comment/note. Status: **Static** destructive
path; end-to-end data-loss reproduction pending.

## B06 — Clearing the last manual value is not saved (High)

Evidence: `card-fields.js:688` `save` returns when `hasValues` is false.
Reproduce: clear the only text value, uncheck the only checkbox, or reset the
only dropdown; reopen/restart. Expected: empty value persists.
Status: **Isolated**, save skipped and previous value retained.

## B07 — Native Comment independence incomplete (High)

Evidence: `card-fields.js:768` appends a marked AI section;
`bootstrap.js:4727` batch replaces Comment; `review.js:132` composes and writes
structured output as Comment. Manual paths use separate storage.
Reproduce on disposable data: enter a native comment, run each generation
action, compare Comment before/after. Status: **Static** writes; violates R10.

## B08 — Batch does not merge existing per-annotation field values (High)

Evidence: `bootstrap.js:4666` `processAnnotations` passes `opts.fields` into
generation; `rememberFields` stores returned values without first merging that
annotation's JSON record.
Reproduce: save manual/AI values, run overwrite generation, compare records.
Status: **Static** replacement path; actual loss depends on schema/options.

## B09 — Refill undo restores Comment but not structured values (High)

Evidence: `review.js:529` `undoRefill` restores `annotationComment`; backup
records have before/after comments, not structured snapshots.
Reproduce: refill, undo, compare card fields, Comment and note. Expected:
consistent restored state. Status: **Static**, runtime reproduction pending.

## B10 — Conversion does not migrate structured JSON identity (High)

Evidence: `bootstrap.js:2405` `handleConvertedAnnotation` migrates research
metadata to replacement key, but does not copy `AnnotaCardFields` records.
Conversion registration occurs after native conversion; deletion can race
metadata capture. Tag preservation by Zotero has not been established here.
Reproduce: fill manual/AI values and themes, convert highlight/underline,
inspect new key and restart. Status: **Static** JSON migration omission;
metadata ordering consequence is a **Risk**.

## B11 — Deletion cannot recognize normalized link-only note entries (High)

Evidence: `bootstrap.js:2241` removal understands custom wrappers/legacy markers.
Full rebuild at `:1324` additionally handles annotation links because wrappers
can be stripped. Deletion does not use that fallback or the rebuild queue.
Reproduce: save/reopen a note, inspect normalized HTML, delete its annotation.
Status: **Static** recognition gap; actual Zotero normalization and stale entry
need runtime verification. Concurrent deletion/rebuild races are a **Risk**.

## B12 — Pending fields can attach to unrelated text (Medium)

Evidence: `bootstrap.js:6370` accepts unmatched text if buffer age is under
60 seconds; buffer has no reader/library/attachment identity. Values are shared
across color groups by name.
Reproduce: enter fields, abandon selection, create an unrelated highlight
within a minute; also test two readers and same-named fields across colors.
Status: **Isolated** unrelated-text match; cross-reader/color effects are risks.

## B13 — Review misclassifies structured annotations as empty (Medium)

Evidence: `review.js:93` returns true immediately if native Comment is empty,
even with saved JSON values. Review also hides empty AI values rather than
showing the standard placeholder.
Reproduce: save structured fields without Comment, start empty-field review.
Status: **Isolated** empty classification; placeholder difference is **Static**.

## B14 — Persistence does not acknowledge durable completion (Medium)

Evidence: `card-fields.js:103` schedules write after one second, catches/logs
failure; `remember` returns before disk completion; unregister/shutdown has no
explicit flush. `load` treats unreadable JSON as empty state.
Reproduce later with mocked I/O: fail writes, close before debounce, or load a
corrupt fixture. Expected: saved status only after durable success and recoverable
failure without replacing the original. Status: **Static**; actual restart loss,
overlapping writes and corrupt-file replacement remain **Risks**.

## B15 — Legacy Comment parsing differs by consumer (Medium)

Evidence: `card-fields.js:221` `resolve` can parse native Comment as fields if
there is no saved record; note and popup paths instead use `get` directly.
Custom templates can cause resolution to return null.
Reproduce: legacy default-layout comment without JSON, compare sidebar/popup/note;
also test unrelated plain native comments. Status: **Static** divergent sources;
misinterpretation depends on contents.

## B16 — Note identity is per attachment, not paper (Medium)

Evidence: `bootstrap.js:1063` uses attachment-key marker and attachment identity.
Reproduce: two annotated attachments under one paper; inspect notes. Status:
**Static** identity mismatch with R01; desired migration strategy undecided.

## B17 — Refresh and reverse-sync gaps (Medium)

Evidence: existing popup returns early for the same annotation key; settings
sort change only writes a preference; no startup-wide rebuild is called;
`_syncPaperResearchNoteFromNote` has no active caller.
Reproduce: change schema/sort or edit values elsewhere while popup/note remains
open; restart; compare. Status: **Static** missing refresh routes. Reverse-sync
is dormant code, not a confirmed missing product requirement.

## B18 — Managed-note rebuild can discard user edits (Medium)

Evidence: `_syncPaperResearchNoteNow` preserves introduction and replaces content
from first managed entry onward. Editing this suffix is not imported back.
Reproduce on a copy: add prose inside/after managed entries, trigger sync.
Status: **Static** replacement policy; whether/how to support these edits is
not yet a product decision.

## B19 — Popup poller not stopped during shutdown (Medium)

Evidence: `_startAnnotationPopupMonitor` creates an interval; `shutdown` and
`unregisterSelectionForm` do not clear `_annotationPopupScanTimer`.
Reproduce: extension disable/reload with reader open and inspect callbacks.
Status: **Static** cleanup omission; surviving callbacks require runtime check.

## B20 — Artifact/update identity inconsistent (High operational priority)

Evidence: working manifest is ResearchAnnotator 2.42.0 / `researchannotator@pino`;
all five local XPIs are Annota 2.41.1 / `annota@equiriconi`, with upstream update
URLs and differing core/card source. Local `updates.json` has only the Annota ID.
`release.sh` retains upstream repository and `annota.xpi`; generator expects
`ResearchAnnotator.xpi`. Status: **Artifact**. Installed ID/build and live remote
feed were not inspected. Do not infer installed version from root filenames.
See TESTING.md for update-risk assessment and identification procedure.

## B21 — Large-library work may scale poorly (Medium investigation)

Evidence: note rebuild searches library annotations and loads metadata through
another library scan; metadata saves iterate all research annotations.
Reproduce: measure edits on increasingly large disposable libraries. Status:
**Risk**, no timing measurements or confirmed performance regression.

## Audit validation record

All ten active JavaScript files passed `node --check` during the audit. In-memory
checks reproduced B01, B02, B04, B06, B12 and B13 logic. These checks were ephemeral,
not committed tests. No provider request, Zotero UI test, restart, packaging,
release or data migration was performed. No defect is marked fixed.

Current color-layout artifact: `C:/Users/Ahmed/Documents/ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-011737-134.xpi`. Build inventory: [DEVELOPMENT-BUILD-20261116-011737-134.json](DEVELOPMENT-BUILD-20261116-011737-134.json). Total: 118 passing tests (all 114 retained); package-dev.ps1 verified all 20 runtime files.

Data Infrastructure artifact: `C:/Users/Ahmed/Documents/ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-020142-005.xpi`. [Exact build inventory](DEVELOPMENT-BUILD-20261116-020142-005.json). Version 2.42.0; ID researchannotator@pino; 21 packaged files verified. 162 tests passed.


Final packaged refinement and shared workflows pass 60 isolated native checks; 398 regression tests pass. Additional native platform/scaling/group-library acceptance remains as documented in REFINEMENT_AUDIT.md.
