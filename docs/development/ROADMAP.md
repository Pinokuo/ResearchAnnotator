## Public beta milestone (2026-11-22)

The 2.43.0-beta.1 milestone supersedes the prior deletion-regeneration policy: intentional managed-note deletion persists a management tombstone until explicit Recreate / Resume management. Add inline palette actions and packaged logo; per-note color order with explicit one-time rebuilds in all modes; previewed native highlight color mapping with persistent jobs, recoverable journals and conflict-aware Undo. Preserve structured data and PDF bytes; never import embedded annotations automatically or generate AI during mapping. See BETA_READINESS.md, INSTALLATION.md and CHANGELOG.md for current behavior and compatibility.

## Reliability milestone update (2026-11-22)

Current milestone: targeted managed-note and Research Chat reliability over the 20261117-131627-077 baseline. Deliver confirmed lifecycle/color rollback corrections, safe orphan handling, guarded annotation retrieval, explicit note/PDF provenance, keyword retry, visible capture, recovery without restart, bulk modes and plain-language help. Preserve normal annotation/AI/search/Network behavior and all unrelated Production Readiness work. See RELIABILITY_AUDIT.md.

## Integrated refinement update (2026-11-17)

Current milestone: integrated refinement of the 372-test baseline. Complete context titles, destination policy, normalized native quotation formatting, final requested geometry, secondary legacy settings, compatible branding/English comments, local icons and secondary Chat diagnostics. Earlier milestone entries are historical. Cross-device conflict synchronization, broad platform acceptance and remaining production safeguards remain separate. See REFINEMENT_AUDIT.md.

# Development roadmap

## Current milestone: dedicated UI/UX consolidation, Option C (2026-11-17)

Consolidate the 004427 baseline with shared sidebar/full-window Research Chat,
keyword-default guidance, secondary advanced controls, annotation-first Explorer,
five-step Notes creation/separate management and focused Network sections with
structured question roles. Keep Saved Searches and Activity workflows. Validate
shared requests/state/citations/capture, browser interactions and the exact XPI in
isolated Zotero; inspect native screenshots at wide/compact sizes. See
UI_UX_DESIGN.md and TESTING.md for implementation evidence and remaining acceptance.

This milestone does not authorize Production Readiness color geometry, complete
rebranding, codebase translation or deletion of inherited capabilities/backups.
Prior note repair, automatic/manual AI and evidence-capture protections remain.

## Current milestone: grounded Chat, evidence capture and targeted usability (2026-11-17)

Implement and validate this integrated milestone after development build 20261116-223342-088: page-aware local RAG; explicit source scopes and optional embedding/hybrid retrieval; validated interactive PDF citations; recoverable, previewed multi-publication Capture Evidence using native highlights and existing structured fields; note metadata/default batching; settings boundaries; guided Notes and simplified Network navigation. Preserve Explorer, Saved Searches, Activity and the three-button toolbar. Release one development XPI only after complete regression/package checks and isolated native known-PDF navigation/capture/restart testing. [Architecture, workflows and remaining acceptance](RESEARCH_CHAT.md).

Batch simplified note defaults and settings boundaries are now authorized; their earlier deferrals below are historical. All other Production Readiness deferrals and the automatic synchronization blocker remain.


## Current milestone - Research Knowledge Network (2026-11-16)

The owner authorizes integrated relationship management after the 184638 AI-trigger baseline. Implement persistent relationships/types/questions, derived topics, Network browsing and optional bounded SVG graph, explicit AI suggestion jobs with human approval, shared managed-note compilation, recovery/portability and tests. Preserve the five-section workspace and existing three-button toolbar, all previous regression safeguards, and verify actual packaged interactions in isolated Zotero with a loopback provider. Details and remaining acceptance: [RESEARCH_KNOWLEDGE_NETWORK.md](RESEARCH_KNOWLEDGE_NETWORK.md). Automatic cross-device sync and all Production Readiness deferrals remain unchanged. Earlier deferred Network entries below describe preceding milestones.


## AI trigger correction before Knowledge Network (2026-11-16)

Restore the useful owner-approved AI Generation Trigger via shared lifecycle/jobs, honoring saved Automatic/Manual policy. Verify creation/manual persistence, explicit generation, per-field retry, request deduplication and no instruction-change regeneration in the packaged Zotero runtime. Keep inherited-functionality audits and batch content-default application deferred to Production Readiness PR15; do not remove unique features based on the earlier mistaken trigger audit.


## Current milestone addition ? Workspace usability (2026-11-16)

Complete the owner's 095828 usability follow-up before Knowledge Network: conditional AI editing and settings audit; permanently visible layout/order; simplified configurable notes; native dropdown correction; four-tab information hierarchy; ResearchAnnotator Tools submenu. Preserve all preceding 242 tests and add focused regressions. Deliver one integrated package with native option-selection evidence and remaining runtime limits. [Implementation and inventory](WORKSPACE_USABILITY.md). Deferred final color geometry, full rebranding and English codebase standardization remain exclusively in Production Readiness.


## Current milestone — Unified Research Workspace (2026-11-16)

Finish the owner-requested positioning/window regressions and consolidate the
existing Explorer/Notes/Saved Searches/Activity interfaces before Knowledge Network.
Keep Annotation Review accessible alongside Workspace and Research Chat, using the
existing review/lifecycle/store. Native Zotero smoke testing is required for the
window path; mocked-only acceptance is insufficient. Preserve the 226 preceding
tests, 100-rebuild and repair cases, and deliver one matched integrated XPI.
See [RESEARCH_WORKSPACE.md](RESEARCH_WORKSPACE.md). Knowledge Network, cross-device
metadata transport and final icon polish/rebranding/source standardization remain
deferred. Earlier separate-window milestones below are historical where superseded.

## Current milestone - Research Explorer with priority note repair (2026-11-16)

Complete the owner-authorized Explorer packages using existing storage/identities,
field rendering, dashboard, note compiler, AI lifecycle and jobs. The critical
recursive-snapshot regression is integrated into the same shared engine first;
backup-first repair/restore and 100-rebuild stability are release gates for this
candidate. [RESEARCH_EXPLORER.md](RESEARCH_EXPLORER.md) and
[MANAGED_NOTE_REPAIR.md](MANAGED_NOTE_REPAIR.md) record scope, architecture and limits.
Next: integrated automated/package verification, then live affected-note repair,
native editor normalization and Explorer acceptance in the development profile.
Knowledge Network, automatic cross-device metadata sync and Production Readiness
PR11-PR14 stay deferred. Earlier milestone scope descriptions below are historical.

## Current milestone - Research Note Generation (2026-11-16)

The owner authorizes the ten requested packages over existing managed notes, AI
lifecycle, storage and persistent jobs. Implemented candidate; live acceptance
required. See [RESEARCH_NOTE_GENERATION.md](RESEARCH_NOTE_GENERATION.md). This advances
the focused dashboard and Phase 6/7 PDF/field/color note work despite the unresolved
cross-device transport prerequisite. Do not mark Phase 3 complete. Local updates use
existing safeguards. Next: verify the integrated package and complete the new
TESTING.md live matrix with a matched backup. Full Explorer, knowledge network and
final Production Readiness PR11-PR14 remain deferred. Earlier scope statements below
are historical where superseded by this authorization.

## Current milestone - Data Infrastructure (2026-11-16)

Foundation/global fields and customization are functionally accepted by the owner.
Color presentation polish is deferred to Phase 9; retain all five current layouts.

Current candidate delivers storage recovery/durability, shared managed-note APIs,
AI lifecycle/provenance, persistent cooperative jobs and inherited data-integrity
integration. Manual portability includes optional infrastructure state and remains
backward compatible. See DATA_INFRASTRUCTURE.md for work-package implementation
boundaries. Complete live Zotero acceptance before broadening development.

Automatic synchronization is blocked by the supported transport/protocol evidence
in SYNCHRONIZATION.md. Do not mark Phase 3 complete. Prototype and verify conflict,
offline/deletion and AI coordination semantics before enabling it. This blocker
has not stopped the independent infrastructure work packages.

Next: run the Data Infrastructure live test matrix and recovery/rollback exercises
in the existing development profile. Then resolve synchronization prerequisites
before full new batch research-note/dashboard, Explorer filters, cross-paper note
and knowledge-network milestones. Their interfaces are not implemented here.
The reusable compiler/modes/grouping are infrastructure, not delivery of those
future features. Earlier phases below retain their historical planning details.


## Current Phase 1 color layout refinement (2026-11-16)

Implemented candidate: intrinsic Single Row popup sizing, transformed Slanted geometry, new Vertical layout, preserved Wrap/Stacked and collapsed-row safe deletion. Complete live Zotero acceptance before advancing. No later portability/synchronization, Explorer, batch or cross-paper milestones are changed by this refinement.


## Approved research knowledge system phases

### Current usability refinement build (2026-11-16)

Deliver together: field-local persistent suggestion dismissal/Restore; colors →
Comment → Tags → globals → color-field popup ordering; common semantic color layouts,
interactive white labels and responsive dimensions; confirmed safe color deletion/
reassignment; compact closed color rows reusing the complete existing editor.
Implementation has 114 isolated tests (all 93 integrated cases retained), with
live reader/theme/keyboard/drag/deletion/backup acceptance pending. This is usability
work within the existing milestone; later roadmap phases remain unchanged.

Immediate next step: accept this XPI in the existing development profile using
the latest TESTING.md checklist and matched backup. Keep automatic AI, native
Comments/Tags, highlight deletion synchronization, data portability and import
recovery in the acceptance matrix. No Explorer/batch/cross-paper/cloud-sync work
is introduced by these refinements.

### Preceding integrated milestone foundation — explicitly accelerated by the owner

Implement and live-validate six packages together: restore native creation
Comment; unify annotation presentation; stable customizable palettes; accessibility
presets; full portable settings; structured research data and complete extension
backup/restore. These selected Phase 2/4 items are implemented in the candidate,
with 93 isolated tests and live acceptance pending. This supersedes the earlier
documentation-only/Phase 1-only boundary for those packages, not for other features.
Manual portability is authorized; automatic cloud synchronization is not.

Immediate acceptance: exercise all six packages and rollback/recovery in the
existing development profile, preserve the preceding build/data snapshot, and
record the exact integrated XPI inventory. Then address remaining reliability
gates and synchronization design before Explorer/batch/cross-paper expansion.

These phases govern the new feature. [FEATURE_BACKLOG.md](FEATURE_BACKLOG.md) is the
permanent feature/status inventory; its stable IDs map features to these phases. The earlier audit backlog below remains
relevant where it does not conflict with these approved requirements.

Portability and cross-device synchronization are approved prerequisites for the
new batch and cross-paper note-generation features. The new milestone advances
manual portability and palettes only; later Explorer/batch/cross-paper work stays planned.

### Phase 1 — Global configurable fields (in development; live verification pending)

- Reuse the preferences field editor for stable-ID global definitions, ordering,
  names, all supported types, categorical options and individual AI instructions.
- Keep global annotation values separate from per-color values; retain removed
  definitions/values and stable categorical identities for future grouping/renaming.
- Provide searchable multi-select/chips in creation, clicked-popup and sidebar.
- Move Retry below each failed AI field. Reuse the shared pipeline for automatic
  global/color AI generation and targeted retries; retain successes and concurrent
  manual edits. No generation on existing annotation open/restart.
- Import Theme/Experiments assignments/catalogs recoverably, keep legacy data,
  and remove redundant dedicated controls while preserving originals for retry.
  Import historical research comments into a configurable global textarea without
  changing native Comment. Place Global Fields below Highlight Colors and validate
  shared chip/dropdown keyboard, clipping and theme behavior in all interfaces.
- Render both scopes in existing managed PDF notes without changing identities
  or overwriting ordinary notes. Validate the current 93-test suite plus live migration/UI cases.

### Phase 2 — Data portability and complete extension backup

Candidate status: manual settings/data import/export, backup, conflict previews,
cross-device identity mapping and import journal recovery are delivered by the
integrated milestone. Complete live acceptance and retain the reliability tasks below.

- Export/import all extension preferences and structured annotation data; support
  complete extension backup and restoration.
- Define versioned, portable formats with backward-compatible migrations that
  retain stable field and categorical value IDs.
- Validate incoming data before changing preferences or stored data.
- Provide non-destructive merge and explicit replacement options; prevent duplicate
  records and silent data loss.
- Exclude API credentials from exports by default.
- Establish the reliability prerequisites DR13-DR23: repair structured undo and
  conversion data migration, unsafe inherited Comment writers and capture matching;
  provide corrupted-storage recovery, durable shutdown and non-destructive managed
  boundaries. Current individual save safety is not universal workflow safety.

Exit: validated import/export, merge, replacement, backup/restore and migration
behavior preserve identities and data. This phase precedes new batch/cross-paper
note-generation implementation.

### Phase 3 — Cross-device synchronization

- Investigate supported Zotero-synchronized storage mechanisms before selecting
  the design. Provide consistent structured research data for installations using
  the same Zotero account on multiple devices.
- Preserve native Zotero Comments and ordinary notes. Avoid an external server
  or subscription where practical.
- Handle concurrent edits, conflicts, offline changes and deletions.
- Protect complete generated notes from updates by devices with missing or stale
  local structured data.
- Reuse AI values already generated on another device rather than issuing repeated
  requests for the same available results.

Exit: the chosen mechanism and cross-device conflict/deletion behavior are verified,
including incomplete-device note protection and AI-result reuse. Complete these
safeguards before the new batch and cross-paper note-generation features.

### Phase 4 - Highlight customization and consistent interfaces

Candidate status: stable palette CRUD/archive/reorder/hex changes, safe presets,
explicit keep/recolor handling and shared popup presentation are implemented in the
integrated milestone. Continue live reader/theme/accessibility acceptance here.

- Deliver HC02-HC11 from [FEATURE_BACKLOG.md](FEATURE_BACKLOG.md): palette add,
  remove/archive, reorder, rename and hex customization; colorblind-friendly
  presets; semantic meaning independent of physical color and stable color IDs.
- Design explicit, recoverable migration/reassignment of existing highlights and
  configurations before allowing destructive palette operations. Do not confuse
  field IDs with color configuration IDs or replace annotation identities casually.
- Unify creation/existing-popup appearance and shared field interactions, retaining
  compact sidebar presentation, all input types, progress and field-local Retry.
- Validate light/dark, keyboard/focus, screen-reader and contrast behavior (UI01-UI05).

Exit: palette changes preserve research data/identities; all annotation interfaces
have accepted, consistent interactions. Implementation in the accelerated milestone
does not establish this phase's runtime acceptance automatically.

### Phase 5 - Library-wide annotation explorer

- Add a central explorer (RO10-RO15) with PDF/color and other relevant sort orders.
- Compose filters by color, global field, annotation type, page, publication and
  collection; search both highlight text and structured values.
- Export filtered research data using the portable, validated formats from Phase 2.
- Keep explorer queries separate from chat's limited collection-scoped retrieval;
  preserve stable annotation/category identities and cross-device completeness rules.
- Deliver filtered note generation (RO17-RO22): generate permanent standalone Zotero
  notes directly from search/filter results, combining highlight colors, structured
  fields, publications, collections, annotation types and search text with AND/OR.
- Let users customize note titles and included fields; group highlights by
  publication and preserve source citations and direct annotation links.
- Save filter configurations with stable internal identities and support reopening
  and editing them. Do not use mutable display names as configuration identities.
- Offer automatic synchronization, manual synchronization and static snapshots.
  Update existing managed notes without duplicates; preserve ordinary Zotero notes
  and unrelated user-authored content.
- Reuse saved AI values and support filling missing values through the shared
  batch AI pipeline. Reuse the managed note infrastructure for compilation.

Filtered note generation belongs to this Explorer phase, not the current Phase 1.
It requires Phases 2-3 safeguards. Coordinate the necessary shared managed-note
and batch AI foundations with Phase 6 before enabling this workflow; do not create
a separate note engine or AI pipeline, or treat those foundations as already done.

Exit: query/filter combinations and exported records are correct, accessible and
scalable; saved filters reopen/edit correctly, filtered notes retain identity and
content protections across all three modes, and missing-value generation reuses
the shared pipeline. Existing review/chat panels do not substitute for this explorer.

### Phase 6 — Configurable managed PDF note generation

- Add explicit Generate / Update Notes scope selection and automatic/manual sync.
- Add field inclusion and ordering controls for compiled notes.
- Combine this with the historical/retroactive AI track below; cover both global
  and color-specific fields and reuse saved values rather than repeating requests.
- Update existing managed identities rather than creating duplicates. Never target
  ordinary notes. Compile from saved values without unnecessary provider requests.
- Preserve existing formatting, user content boundaries and deletion/sort behavior.

#### Historical annotations, regeneration and resumable AI

- The future Generate / Update Notes action must cover all existing annotations
  in the selected scope, including those predating installation. No creation-date
  cutoff. Apply this equally to global and color-specific AI fields.
- Resolve current schemas; generate missing/newly configured fields, reuse valid
  saved values, retry failed values and allow explicit regeneration.
- Compare saved prompt metadata to current definitions; identify outdated and
  unknown-provenance historical values without silently deleting them.
- Provide progress, cancellation, per-field durable checkpoints and resumability.
  Preserve successful results on interruption; prevent duplicate requests.
- Preserve manual values, native Comments, ordinary notes and note identities.

These requirements apply to the initial new Generate / Update Notes workflow,
not only to newly created annotations. Current per-field IDs, prompt snapshots,
locks and incremental saves provide a foundation; build the persistent job,
progress, cancellation/resume and outdated-value policy in this phase. Retain
saved AI results and preserve manual fields, Comments and ordinary notes. This
phase and Phase 7 require the portability/sync safeguards in Phases 2-3 first.

### Phase 7 — Cross-paper knowledge notes

- Generate standalone managed notes grouped by global field/category IDs or
  annotation colors. Organize highlights within each note by publication.
- Keep stable managed identities across repeated generation, label changes and
  categorical renaming. Define explicit grouping/inclusion/synchronization policies.
- Add bidirectional PDF/paper-note to topic-note links and direct paper-to-paper
  relationship workflows (NM13-NM14), preserving source links and existing note IDs.
- Add the Research Notes dashboard only after these data and lifecycle contracts
  are agreed and tested; no dashboard is part of Phase 1.

### Phase 8 - Integrate inherited research tools and optional AI assistance

- Audit and integrate existing document/library chat, collection-scoped retrieval,
  citations, history, note proposals, stop/save actions and review/refill with the
  shared global/color field model and safety contracts (AI11-AI19, IN01-IN02).
- Retain provider adapters and reference extraction; verify rather than assume
  functionality from old commits or menu entries. Repair unsafe legacy writers
  and undo prerequisites in Phase 2 rather than postponing data protection here.
- Add optional AI-assisted categorization and related evidence discovery (AI09-AI10)
  with reviewable results; these are distinct from ordinary lexical chat retrieval.
- Preserve explicit user control over ordinary-note edits and differentiate them
  from automatic managed-note compilation.

Exit: inherited tools are safe with the new field model and have live acceptance;
optional AI features have explicit scope and do not silently rewrite research data.

### Phase 9 - Production readiness and release acceptance

- Audit general settings/defaults, obsolete options and localization (PR01, UI09).
- Benchmark large libraries, migration, explorer queries and note synchronization;
  address measured limits rather than speculative regressions (PR02).
- Complete accessibility and Zotero/OS/PDF/EPUB/area compatibility matrices, including
  private reader/editor APIs and macOS-only features (PR03-PR04, IN03-IN05).
- Align packaging, internal version/build identity, release assets and update feeds;
  verify installed identity, update behavior and matched backup/rollback (PR06-PR09).
- Finish timer/listener cleanup, shutdown durability and integration fixtures
  (PR10, DR14), and extend the existing regression suite throughout every phase.

These are cross-cutting acceptance gates from Phase 1 onward, not permission to
leave unsafe data behavior until the end. Release only with recorded test/build
identity and evidence; function existence or a successful ZIP build is insufficient.

#### Deferred final Production Readiness requirements (2026-11-16)

Status: planned and deferred to final Production Readiness (Phase 9), recorded
2026-11-16. Do not implement during the current Data Infrastructure milestone.
These color requirements supersede conflicting earlier sizing requirements;
earlier implementation notes remain historical evidence.

**Complete rebranding (PR11)**

- Replace inherited Annota branding with ResearchAnnotator throughout the extension.
- Audit all source files, menus, dialogs, settings, notifications, documentation,
  logs, filenames, packaging scripts and release metadata.
- Standardize internal variable names, function names, CSS classes and identifiers
  where appropriate; remove obsolete upstream update and release references.
- Preserve historical data compatibility through explicit migrations where necessary.
- Preserve required upstream attribution, copyright notices and license information.

**English language standardization (PR12)**

- Translate all French source code comments into English, preserving technical meaning.
- Standardize developer documentation and diagnostic messages in English.
- Retain intentional multilingual user-interface localization.
- Remove unintended hardcoded French text from the English interface.

**Deferred color presentation improvements (PR13)**

The owner identified these issues during live Zotero testing. Apply future changes
consistently to both highlight creation and existing-highlight popups.

- **Single Row:** the popup is unnecessarily wide. Size each color button according
  to its actual label width, with minimal horizontal padding. Eliminate unnecessary
  gaps and excess width. Maintain readable horizontal labels without wrapping.
  Size the popup to the compact combined content width, subject to the minimum
  width required by other annotation controls.
- **Slanted:** different semantic label lengths currently produce uneven button
  lengths. Use uniform button lengths based on the longest label. Maintain identical
  angles, heights, spacing and alignment. Align the beginning and end of all buttons.
  Keep buttons tightly packed without overlapping clickable areas.
- **Vertical:** the current popup width is acceptable, but buttons cluster on the
  left, leaving excessive unused space on the right. Distribute all buttons evenly
  across the entire available width. Allow each button to expand horizontally to
  occupy an equal share. Preserve uniform heights and complete labels rotated
  90 degrees.
- **Wrap and Stacked:** the owner is satisfied with both layouts. Preserve their
  current appearance and behavior.
- Preserve white label text where readable, semantic labels, color indicators,
  selection states, hover feedback and keyboard accessibility in both popups.


**Inherited Annota functionality audit and safe bulk defaults (PR15 ? deferred Production Readiness)**

- Add batch application of simplified content defaults to multiple managed note configurations, with a preview, explicit selection and preservation of user-authored content and stable identities. Do not implement in the current milestone.
- Audit whether inherited color-wide prompts still provide unique capabilities; retain data and compatibility until the result is established.
- Audit custom popup headings and legacy layout controls before deciding whether to retain, relocate or retire them.
- Evaluate replacing advanced reference controls with contextual help without losing capabilities or accessibility.
- Remove genuinely obsolete inherited functionality only after confirming that no unique capability or historical data would be lost; specify migrations/rollback where required. The useful Automatic/Manual AI Generation Trigger is retained by explicit owner decision and is excluded from obsolete-control removal.

**Final verification (PR14)**

During Production Readiness, perform a repository-wide audit for remaining Annota
references and untranslated French comments. Document any intentionally retained
references and why they are necessary, including compatibility and required upstream
attribution, copyright and license information. Verify color presentation in both
popup contexts during live Zotero acceptance. This audit and implementation remain
deferred; documenting requirements does not claim completion.

## Historical audit backlog (retained reference)

The numbered engineering phases below preserve the earlier audit plan. Use the
approved feature phases above for current sequencing and inventory references.

Baseline: 2026-11-15. These are proposed engineering phases, not new product
requirements. Follow AGENTS.md, preserve existing work, and trace affected
paths before changing them. Bug references are in [BUGS.md](BUGS.md).

## Phase 0 — Identify and preserve the baseline

Priority: first, before application changes.

- Identify active Zotero profile, extension ID/version/path and artifact hash.
- Determine whether Annota and ResearchAnnotator are both enabled.
- Preserve the exact working tree, existing artifacts and dirty-state evidence.
- Back up profile and data directory coherently with Zotero closed, including
  structured JSON and linked attachments stored elsewhere.
- Prepare a separate unsynced test profile with a distinct data directory.
- Record existing failures against a reproducible build identity.

Exit: installed and source identities recorded; rollback materials verified;
production data untouched by testing. See TESTING.md.

## Phase 1 — Protect saved data and define the shared data contract

Priority: high. B04–B10, B12–B15.

- Map every reader/writer, including batch, review and undo, before editing.
- Define one shared service contract for loading, merging, intentional clearing,
  durable save, per-color identity and schema interpretation.
- Preserve last good values on partial/failed AI generation; expose per-field
  outcomes instead of swallowing failures.
- Make refill undo restore consistent structured state as well as any permitted
  annotation changes; protect unrelated native Comment content.
- Scope pending capture to the correct annotation context.
- Plan recoverable storage migration and conversion-key migration.

Exit: targeted persistence/failure tests pass; manual values and native Comment
survive all relevant operations. Avoid a broad rewrite of unrelated modules.

## Phase 2 — Make field presentation and AI actions consistent

Priority: high. B01–B03, B06–B07, B13, B17.

- Use the complete schema for creation, clicked popup, sidebar and notes.
- Separate visibility from editability: display AI labels/placeholders/values
  read-only, with an explicit generation action.
- Decide intended auto/manual creation behavior with the product owner before
  restoring or changing historical trigger semantics.
- Refresh open views after saves and schema changes without discarding drafts.
- Retain text, textarea, checkbox and dropdown behavior and color-specific values.

Exit: mixed and AI-only schemas behave consistently; generation success/failure
is visible; native Comment remains independent.

## Phase 3 — Make note synchronization and conversion reliable

Priority: high/medium. B10–B11, B16–B18.

- Resolve attachment-versus-paper note identity without silently migrating notes.
- Align creation, modification, deletion and conversion on serialized sync paths.
- Recognize saved/normalized Zotero HTML consistently across rebuild and removal.
- Define managed-note editing boundaries; reverse sync requires a product decision.
- Add deliberate reconciliation for schema/sort/restart scenarios as appropriate.
- Measure larger libraries before choosing indexing/caching changes.

Exit: one intended consolidated view per paper, correct conversion/deletion and
no stale/duplicate entries in the tested scenarios.

## Phase 4 — Lifecycle and development delivery

Priority: medium; baseline identity work starts in Phase 0. B14, B19–B20.

- Stop timers/listeners and drain or safely cancel outstanding work on shutdown.
- Adopt reproducible build inventories/hashes and distinct internal development
  versions, after validating Zotero version comparison in the test profile.
- Align development/release package names, add-on IDs and update feeds.
- Keep test builds from being confused with releases or old upstream artifacts.
- Expand runtime compatibility coverage for private reader/editor APIs.

Exit: verified packaged bytes and build identity; controlled update path;
repeatable rollback; documented compatibility results.

## Phase 5 — Preserve and expand research workflows

After the core integrity and UI gaps are resolved, improve retrieval, knowledge
organization and research-note workflows against explicit product decisions.
Keep smoke coverage for chat, citations, reference resolution, review, spelling
and collection controls. Cross-device storage, new extraction capabilities and
two-way note editing require scope/requirements decisions before implementation.
