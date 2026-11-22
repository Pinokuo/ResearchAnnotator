## Public beta milestone (2026-11-22)

The 2.43.0-beta.1 milestone supersedes the prior deletion-regeneration policy: intentional managed-note deletion persists a management tombstone until explicit Recreate / Resume management. Add inline palette actions and packaged logo; per-note color order with explicit one-time rebuilds in all modes; previewed native highlight color mapping with persistent jobs, recoverable journals and conflict-aware Undo. Preserve structured data and PDF bytes; never import embedded annotations automatically or generate AI during mapping. See BETA_READINESS.md, INSTALLATION.md and CHANGELOG.md for current behavior and compatibility.

## Reliability milestone update (2026-11-22)

The reliability milestone preserves the 398-test baseline. PDF generation defaults to Automatic; explicit Manual/Static modes remain. Deletion must release only known-deleted ownership, preserve backups and permit safe regeneration. Note generation must not mutate source colors, Comments, Tags or saved field values. Keyword needs no embedding model; PDF/mixed answers require retrieved PDF evidence, while note-only context is explicit and cannot create PDF highlights. Add visible validated capture, safe retry, typed annotation API guards, body identification, contextual help and separate bulk mode preview/confirmation. Publication Title inclusion remains available and explicit choices are respected. See RELIABILITY_AUDIT.md.

## Integrated refinement update (2026-11-17)

Current refinement requirements supersede earlier Production Readiness deferrals for the five color geometries, visible rebranding, English code comments and icon styling. Preserve exact PDF publication titles, independently edited titles, native identities, authored content and repair safeguards. Non-PDF notes support per-library Default/Ask/Remember last destinations, validated preview and explicit backed-up Move. Keep Automatic/Manual triggers, native Comment independence and all research workflows. See REFINEMENT_AUDIT.md.

# Requirements and current behavior

## Current milestone: UI/UX consolidation, Option C (2026-11-17)

Baseline: 20261117-004427-283, 356 tests. Preserve sidebar Research Chat and add a
single resizable full-size window with Expand/Return, shared history, messages,
validated citations, sources, retrieval settings, indexing, capture and job state.
Simultaneous views share drafts and authoritative job/request identities; opening
or closing must not duplicate requests. Remember supported size and placement.

Keep source coverage, conversation, question input, Capture Evidence and Generate
Note primary. Put optional embedding/indexing/retrieval/context settings behind
secondary panels. Default to keyword retrieval without requiring embeddings;
preserve explicit semantic/hybrid choices and explain missing prerequisites.
Never imply configuration is transmission consent or silently send embeddings.

Explorer: wide search, annotation-first result cards, compact filters, secondary
result actions, Cancel only during search. Notes: five-step guided creation and
separate contextual management; preserve all modes, repair and synchronization.
Network: Relationships/Topics/Questions, list/detail questions, structured role
editing, secondary graph/AI/type controls. Saved Searches and Activity retain
workflows and state. Native controls, responsive widths, opaque selects, accessible
focus and light/dark colors share a visual system without a new framework.

Keep all three toolbar buttons, native annotation functions, Review, Automatic/
Manual AI triggers, structured data, managed note positioning/repair and Capture
Evidence safeguards. Full rebranding, translation and color geometry remain
Production Readiness. See UI_UX_DESIGN.md for navigation and verification limits.

## Current milestone: source-grounded Research Chat and Capture Evidence (2026-11-17)

Extend the 223342 baseline while retaining all 306 prior cases. Provide explicit publication/PDF/collection/subcollection/library/custom source selection, local page-aware fingerprinted indexing, bounded keyword and optional separately configured semantic/hybrid retrieval, validated interactive source citations, follow-ups/history, coverage/privacy notices and shared persistent generation jobs. Treat sources as untrusted data; citation existence is not proof of scientific correctness or an exhaustive review. Capture individual/selected/all cited passages only from verified native geometry after preview/confirmation, reuse existing annotations, assign existing manual fields with preserve/merge/replace policies, keep native Comments/Tags/AI, require explicit capture AI consent, and provide restart-safe journals, cancellation and guarded operation undo. Reuse Review/Explorer/Notes/topics/questions/Network infrastructure and existing three toolbar buttons.

New consolidated notes default to semantic color, numbered linked text and populated Comment/global/color fields. Omit Source/Page/Tags/empty/repeated metadata by default; identify each cross-publication group once. Preserve explicit saved content settings until selected batch replacement, with scope, diff preview, confirmation and backup. Preserve note identity, authored positions, repair and incomplete-data guards. Notes starts with four guided choices; Network has three internal sections. Keep the other three workspace tabs intact. Only settings boundaries and batch defaults are pulled forward from Production Readiness; color geometry, full rebranding, translation and final polish remain deferred. [Detailed guarantees and limits](RESEARCH_CHAT.md).


## Current milestone - Research Knowledge Network (2026-11-16)

Implement the owner-authorized integrated relationship system over the 184638 baseline: publication/publication, annotation/annotation and annotation/publication relationships; configurable stable types, inverse/symmetric semantics, explanations/supporting references and manual/AI-assisted provenance; searchable manual creation from Network, Explorer and existing item/annotation context menus; topics derived from categorical fields; lightweight research questions with explicit evidence roles; one Network workspace tab with optional bounded local graph; explicitly initiated AI discovery with scope/workload preview and approval; shared managed research notes; indexed lookup, complete backup/recovery and safe portability. Preserve all 266 preceding tests and existing Chat, Review, Explorer, Notes, Automatic/Manual AI policy and annotation safeguards.

This candidate isolates explicit relationships within one library. Missing/deleted/moved references remain recoverable; cross-library copies require deliberate reconnection. Never infer scientific agreement from topic membership, auto-accept AI, interpret confidence as calibrated probabilities, or start background paid discovery. Automatic cross-device synchronization remains blocked. Production Readiness PR15, color geometry, rebranding, translation and final polish stay deferred. [Supported behavior, bounds and limitations](RESEARCH_KNOWLEDGE_NETWORK.md). This authorization supersedes earlier Knowledge Network exclusions.


## Owner decision ? AI Generation Trigger (2026-11-16)

Retain AI Generation Trigger in each color/area configuration, conditionally visible for local or global Written by AI fields. Options: Automatic and Manual, preserving saved auto/manual values; absent values default to Automatic. Automatic queues missing AI fields only upon genuine annotation creation, after manual persistence. Manual requires an explicit Generate AI Fields action for missing values. Automatic hides the redundant generation button. Both modes show individual failed-field Retry. Reuse persistent jobs, lifecycle and structured storage; never overwrite completed AI, manual values or native Comments as a side effect of creation/mode changes. Retain explicit historical/batch processing, duplicate/cost guards and no regeneration from instruction changes, reopening or restart. Explicit existing regeneration workflows remain deliberate user actions. This supersedes earlier text treating the trigger as obsolete or ignoring saved Manual.


## Current milestone addition ? Workspace usability (2026-11-16)

The 095828 live-test follow-up requires immediate conditional AI instructions, a simplified audited color editor, permanently expanded layout/order settings, readable minimal PDF defaults with optional metadata/Tags, publication-group metadata, selectable opaque native dropdowns, progressive disclosure across the existing four tabs and an owned ResearchAnnotator Tools submenu. Preserve explicit settings, structured values, authored positioning, note identities, guards, repair/restoration and all 242 preceding cases. Verify actual mouse/keyboard option selection and resulting state in isolated Zotero with the integrated XPI. See [WORKSPACE_USABILITY.md](WORKSPACE_USABILITY.md). Production Readiness deferrals and Knowledge Network exclusion remain unchanged.


## Current milestone — Unified Research Workspace (2026-11-16)

The owner authorizes annotation-level user-content positioning, repair-preserving
managed reconciliation, native workspace accessibility/diagnostics and one resizable
workspace with Explorer, Notes, Saved Searches and Activity. Reuse the existing
controllers/services and retain their state across sections. Focus one workspace,
support multiple main windows, remember dimensions/last section, and route query
transfer/reopening internally. Replace the two Tools entries with Research Workspace.

Three adjacent independent toolbar buttons are required: Research Workspace,
Annotation Review and Research Chat, with distinct icons, equal dimensions, hover
feedback/tooltips and idempotent cleanup. The existing review must identify any
missing configured manual/AI field independently of Comment, distinguish missing,
failed and outdated AI states, preserve saved values and reuse shared lifecycle/jobs.
No competing review implementation is authorized.

Positioned blocks remain attached to stable existing annotation identities during
updates, ordered insertion, deletion and grouping/sort changes. Keep rich/uncertain
content, normalized HTML support, native note identities, invisible metadata,
incomplete-data protection and backup-first repair/restore. The policy and native
diagnostic evidence are in [RESEARCH_WORKSPACE.md](RESEARCH_WORKSPACE.md).
Knowledge Network and Production Readiness PR11-PR14 remain deferred; prior separate
window descriptions below are historical where superseded here.

## Current authorization - Research Explorer and critical managed-note repair

The owner authorizes the full Research Explorer packages: unified local search,
dynamic nested filters, configurable expandable/paginated results, guarded manual
and native editing, explicit AI lifecycle actions, portable saved searches and
permanent filtered notes through existing services. Historical annotations must
appear without structured records; searching/previewing must never request AI.
See [RESEARCH_EXPLORER.md](RESEARCH_EXPLORER.md) for candidate behavior and limits.

The subsequent critical note-regression request takes priority: repeated normalized
generation must be idempotent, never recursively preserve generated content, keep
management markers out of visible text and preserve genuine user content. Existing
affected notes require recoverable backup-first repair, without arbitrary quote
deletion or source-data modification. Apply the shared fix to all managed types;
see [MANAGED_NOTE_REPAIR.md](MANAGED_NOTE_REPAIR.md). Incomplete-data protection stays.
Knowledge Network, cross-device metadata transport and PR11-PR14 remain excluded.
Older Explorer deferrals and whole-note snapshot behavior below are superseded.

## Research Note Generation - current authorized milestone (2026-11-16)

The owner authorizes dashboard, scoped batch PDF notes, retroactive AI, cross-paper
field/color notes, configurable content, managed configurations and job interfaces
together. [RESEARCH_NOTE_GENERATION.md](RESEARCH_NOTE_GENERATION.md) records the
implemented candidate, scope semantics and acceptance limits. This supersedes older
dashboard/batch/cross-paper deferrals and the cross-device synchronization prerequisite
for this milestone only. Automatic metadata sync remains blocked; local source-to-note
updates are required. Each applicable PDF keeps its own stable consolidated note,
including multiple PDFs per paper. Preserve ordinary notes, user content, native
Comments/Tags, manual/successful AI values, automatic PDF behavior and portability.
Dashboard AI requires explicit choice; opening/previewing never requests it.
Historical annotations, current global/color definitions, explicit outdated
regeneration, incremental success, duplicate prevention and incomplete-data guards
are required. Full Explorer/knowledge network and PR11-PR14 remain deferred.
Older milestone sections below are historical where superseded here.

## Data Infrastructure milestone - approved current scope (2026-11-16)

The owner accepts the annotation foundation and customization functionality. Color
presentation concerns are deferred to production readiness; this milestone does
not redesign layouts. The new milestone supersedes older phase-only restrictions
for the six infrastructure work packages, without authorizing Explorer/dashboard
or knowledge-network interfaces.

| Work package | Required behavior and current development status |
| --- | --- |
| Reliable storage | Implemented candidate: atomic/serialized durable saves, validated schema 3, non-destructive migrations, recovery/session snapshots, corrupt-file preservation/recovery, indexed lookup and normal shutdown drain. Preserve data on read/write failure and concurrent edits. Real filesystem/restart verification required. |
| Automatic synchronization | Blocked after installed-source/API investigation. No safe supported extension transport/conflict/deletion protocol selected; retain manual portability. All previously approved cross-device requirements remain requirements, not implemented claims. See SYNCHRONIZATION.md. |
| Shared managed notes | Implemented service: stable library/scope identities, legacy PDF reuse, shared renderer/compiler, citations/links, publication grouping, inclusion flags, auto/manual/static modes, serialized updates and user-edit snapshots. Existing PDF auto behavior retained. Future interfaces remain planned. |
| AI lifecycle | Implemented candidate: per-field missing/queued/generating/completed/failed/outdated/cancelled state, portable identity, prompt/source fingerprints, timestamps/provider/model, explicit regeneration, historical/new fields and successful-value preservation. Outdated is derived without automatic regeneration. |
| Background processing | Implemented queue/progress/checkpoints, pause/resume/cancel/restart recovery, dedupe, configurable scheduled concurrency, bounded safe retries and incremental results. Paid ambiguous work never auto-replays; full dashboard is deferred. |
| Inherited integrity | Batch/review use the shared pipeline and preserve Comments/Tags/manual values. Structured refill undo is conditional on unchanged post-state. Conversion preserves all source history and provisional target conflicts. Scoped drafts/cleanup and late-result guards are integrated. Live runtime acceptance required. |

[DATA_INFRASTRUCTURE.md](DATA_INFRASTRUCTURE.md) specifies implementation contracts,
API boundaries, limitations and backup compatibility. No native sync internals,
credentials transport, full Explorer or batch-note dashboard is introduced.


## Production Readiness milestone - deferred requirements (2026-11-16)

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

## Approved color layout refinements (2026-11-16)

Provide five layouts: Single Row, Wrap, Stacked, Slanted and Vertical. Preserve Wrap and Stacked appearance/behavior and all stored layout values. Single Row uses complete horizontal labels at intrinsic widths and widens both popups equally; horizontal scrolling is only a viewport fallback. Slanted uses tightly packed non-overlapping transformed buttons at approximately 35-55 degrees. Vertical uses narrow equal-height rectangles with complete labels rotated 90 degrees. Preserve accessible focus/pressed/hover states, white readable labels, color identities/order and native Comment/Tags/global/color-field order. Delete Color must be reachable from a collapsed row with an accessible trash control, no accidental expansion, and the existing confirmation/history protections.

Implementation status: shared source implemented and automated geometry checks passed; live Zotero reader positioning, theme and assistive-technology acceptance remain required.


## Approved usability refinements (2026-11-16)

These are implemented in the usability candidate, with isolated coverage and live
Zotero acceptance pending. They supersede the earlier popup ordering/contrast and
archive-only removal descriptions, while preserving all other requirements.

- Multi-select suggestions have a separate small dismiss button. Persist dismissal
  by field/category identity, without deleting categories or historical assignments.
  Chip removal is independent. Typing the exact dismissed value offers Restore;
  creating/selecting it reuses the original categorical identity. Apply the shared
  behavior to global/color fields in creation, existing popups and sidebar cards.
- Both popup control orders are: **highlight colors/semantic labels → native
  Comment → native Zotero Tags → global fields → color-specific fields**. Retain
  the original native controls and Comment/Tag persistence. AI must not overwrite
  either; do not restore dedicated Research Comment/Theme/Experiments sections.
- Use the same semantic color layout/styling in creation and editing, including
  wrap/single-row/stack/slanted modes, pointer/hover/focus/pressed/selection feedback
  and semantic tooltips. Retain white label text; back light colors with a darkened
  label surface and show an original-color swatch so meaning remains readable.
- Equalize popup width/padding/field sizing, constrain width to the reader viewport,
  keep long forms vertically scrollable and prevent ordinary horizontal overflow.
  Explicit single-row color layout may scroll its palette horizontally. Suggestion
  menus retain their top-layer/portal positioning rather than being clipped.
- Provide Delete Color. Confirm permanent deletion of unused custom configurations;
  block permanent deletion if annotations, stored records, category history,
  reassignment references or pending drafts depend on the color. Offer archive, or
  confirmed transactional reassignment plus archive. Retain source/target values
  separately and all global values; never guess mappings between unrelated fields.
- Highlight Colors uses compact rows, closed by default: reorder handle, original
  swatch, semantic label, configured-field count and expand control. Expanded rows
  expose semantic label/hex/picker, the existing full field editor/Add Field and
  highlight/area scopes, advanced prompt/layout/trigger/reset controls and safe
  Archive/Delete actions. Keep presets/Add Color compact and retain all settings.

`suggestionDismissals` is an optional portable preference, included in new settings,
research-data and complete backups. Existing version-1 backups without it remain
valid. No new cloud synchronization, batch/review or later roadmap feature is added.

## Approved integrated development milestone (2026-11-15)

The owner explicitly accelerated six work packages, superseding earlier Phase 1
scope limits for these items only. Native Comment creation, consistent annotation
interfaces, customizable palettes/accessibility presets, portable settings and
structured data/backup are implemented in the development candidate with isolated
tests. Live Zotero acceptance of this candidate remains pending. Earlier global
field/refinement functionality was accepted except for the creation Comment regression.

1. Restore Comment entry before highlight creation and store it in Zotero's native
   annotation Comment. Show that same native value in existing highlights/sidebar;
   preserve independence from global/color fields and AI. Dedicated Research
   Comment/Theme/Experiments controls stay removed; historical migrated data stays.
2. Share compact popup styling, field order (colors, global fields, color fields,
   Comment), typography, semantic color buttons and structured field containers
   where practical. Retain native editing/contextual differences, read-only AI,
   field-local failure-only Retry, multi-select interactions, duplicate-request
   protection, scrolling and unclipped suggestion menus.
3. Add colors; archive/restore them; edit hex via picker/text; rename semantic
   labels; reorder; configure manual/AI fields for each; restore default swatches
   safely. Store stable color configuration IDs independently of hex/name. Preserve
   original hex records, aliases and field IDs. For used colors, require explicit
   Keep existing highlight colors versus transactional Recolor existing highlights.
4. Supply Default Zotero, color vision accessibility (Okabe-Ito starting palette),
   Pastel and Custom presets. Presets archive rather than discard other colors,
   definitions or data, and leave existing annotations unchanged. Semantic labels,
   accessible tooltips/selection marks and contrast-aware button text supplement
   color. Full theme/color-vision accessibility requires live verification.
5. Data Management exports/imports all portable settings, including palettes/IDs,
   global/color schemas and ordering, categorical configuration, AI prompts/provider
   configuration, note settings and other portable preferences. Consolidate the old
   color-label importer into this path. Use versioned JSON, validation, previews,
   explicit merge/replace/conflict policies and automatic backups. Credentials and
   machine-specific executable/detection settings remain local and are not exported.
6. Export/import structured research data and create/restore complete extension
   backups containing portable settings plus structured data, saved AI values,
   categorical identities, generation snapshots and relevant historical metadata.
   Match annotations using Zotero user/group identities, item/attachment keys,
   type and text; never infer cross-device identity from local numeric library IDs.
   Unsigned libraries need explicit mapping on another installation. Report and
   retain unmatched/orphan source records without attaching them by guesswork.
   Preview conflicts, merge non-destructively or explicitly replace matching
   records; prevent duplicates. Make pre-import backups/received-file copies,
   roll back errors and recover interrupted imports through a local journal.
   Preserve manual/AI values, native Comments, ordinary notes and source metadata;
   import makes no provider request. Restored running jobs become retryable, not
   automatically restarted. This is manual portability, not automatic cloud sync.

Complete extension backups do not replace Zotero's database/PDF/profile backups.
Import deliberately does not rebuild notes or modify Zotero items. Replacement
preserves unmatched local annotation records; data-only replacement replaces its
included field/palette definitions while preserving unrelated settings. Different
stable palette IDs claiming the same hex require explicit replacement rather than
an ambiguous automatic merge. Future format versions are rejected safely; current
legacy label imports/internal v1-to-v2 migrations remain supported.

## Phase 1 interface refinements

- Dedicated Research Comment, Research Theme and Research Experiments interfaces
  are removed. Retain native Zotero Comment and use configurable global fields for
  research categories; retain native tag controls and unrelated note tools.
- Preserve historical metadata and copy applicable assignments/catalogs into global
  fields. Historical dedicated comments become a configurable global textarea when
  present, without writing native Comment or deleting original metadata. Cleared
  values and deliberately removed definitions must not be reimported.
- Global Fields sits directly below Highlight Colors using matching card styling.
- Both global and color-specific multi-selects use removable chips and a readable
  dropdown of field-local configured/previous values. Filter while typing, exclude
  selected values, prevent case-insensitive duplicates and clearly separate Create
  from existing suggestions. Support arrow navigation, Enter and Escape, readable
  light/dark styling and unclipped suggestions in all three annotation interfaces.

Implementation has isolated regression coverage; native Zotero focus, theme,
popup positioning and real-library migration still require live verification.
These refinements do not authorize later roadmap phases.

## Approved Research Explorer: filtered note generation

Planned for the Research Explorer development phase (Phase 5 in
[ROADMAP.md](ROADMAP.md); RO17-RO22 in [FEATURE_BACKLOG.md](FEATURE_BACKLOG.md)).
This is approved future behavior, not currently implemented functionality, and
does not expand the current Phase 1 global-fields scope.

- Generate permanent standalone Zotero notes directly from Research Explorer
  search and filter results.
- Combine highlight color, structured field, publication, collection, annotation
  type and search-text filters, supporting AND/OR logic.
- Allow customizable note titles and included fields; group matching highlights
  by publication and preserve source citations and direct annotation links.
- Save filter configurations using stable internal identifiers; allow reopening
  and editing saved configurations without relying on display names as identities.
- Support automatic synchronization, manual synchronization and static snapshots.
- Update existing managed notes without creating duplicates. Preserve ordinary
  Zotero notes and unrelated user-authored content.
- Reuse saved AI values and support generation of missing values through the
  shared batch AI pipeline.
- Reuse the managed note infrastructure rather than introducing a separate
  note-generation engine.

Delivery depends on the portability/synchronization safeguards and shared managed
note and batch AI capabilities. Schedule any necessary shared foundations with
this Explorer feature; its missing-value generation must not use a separate AI
implementation or imply that the future batch pipeline already exists.

## Approved data portability, backup and cross-device synchronization

The integrated milestone above implements manual portability/backup as a candidate;
automatic synchronization and remaining reliability work are still future scope.
Portability and cross-device
synchronization must precede the new batch and cross-paper note-generation features;
see the revised phases in [ROADMAP.md](ROADMAP.md).

### Data portability and backup

- Export and import all extension preferences and all structured annotation data.
- Support complete extension backup and restoration using versioned, portable
  data formats and backward-compatible migrations.
- Preserve stable field identities and categorical value identities across
  export, import, merge, restoration and format migration.
- Validate imported data before making any changes.
- Support non-destructive merging and explicit replacement options. Replacement
  must be an intentional choice rather than an implicit import behavior.
- Prevent duplicate records and silent data loss.
- Exclude API credentials from exports by default.

### Cross-device synchronization

- Users installing ResearchAnnotator on multiple devices with the same Zotero
  account should have access to consistent structured research data.
- Investigate supported Zotero-synchronized storage mechanisms before selecting
  an implementation. No synchronization mechanism is selected by this requirement.
- Preserve native Zotero Comments and ordinary notes.
- Avoid requiring an external server or subscription where practical.
- Handle concurrent edits, synchronization conflicts, offline changes and deletions.
- Prevent a device with missing or outdated local structured data from overwriting
  complete generated research notes.
- Avoid repeated AI requests when generated values already exist on another device.

The manual export/import/backup candidate does not establish automatic synchronized
storage, distributed conflict/deletion convergence or cross-device AI coordination.
Those capabilities remain planned; use the newest milestone evidence above.

## Approved research knowledge system: Phase 1 and future scope

The approved product direction now explicitly uses managed notes **per PDF**.
This supersedes the older unresolved per-paper/per-attachment distinction; existing
PDF-note identities must be retained.

| Requirement | Phase 1 implementation / future scope |
| --- | --- |
| Global configurable fields across all highlight colors, including all manual types and AI | Implemented in Global Fields preferences using the existing visual editor; stable internal IDs are separate from displayed names |
| Existing color-specific fields remain supported | Preserved; IDs can be retained in the sixth schema column; visual edits preserve IDs and historical aliases |
| Searchable multi-select for both scopes | Implemented: multiple selections, previous/configured suggestions, new values, removable chips and duplicate prevention |
| Separate annotation-owned global and per-color values | Implemented; global values survive color changes, renaming, clearing and restart; removed definitions/values are retained historically |
| Independent AI status and contextual retries | Retry appears directly below the affected AI field. Automatic creation and targeted retries commit successful fields independently; failed fields remain retryable without replacing successes |
| Global AI on creation | Uses the shared safe generator, after manual persistence. Opening/restarting does not generate missing AI values |
| Replace Theme/Experiments controls with equivalent globals | Idempotent, recoverable import from current tags/legacy metadata notes into global multi-selects. Keep legacy sources; dedicated controls are removed in favor of configurable globals, including while a failed import awaits retry |
| Existing consolidated PDF notes include both scopes | Implemented in the existing renderer; preserve identity, links, colors, numbering, dividers and unrelated content |
| Automatic and manual synchronization modes | Approved future requirement; Phase 1 retains existing automatic behavior |
| User-selected field inclusion in notes | Approved future requirement; Phase 1 renders configured fields under existing rules |
| Standalone cross-paper notes grouped by global categorical values or highlight colors | Approved future requirement, not implemented in Phase 1 |
| Cross-paper entries organized by publication | Approved future requirement, not implemented in Phase 1 |
| Update previously generated managed notes rather than duplicating them | Required for all future note compilation; retain current PDF identities now |
| Never overwrite ordinary Zotero notes | Required; migration refreshes marker-identified existing managed notes only |
| Note compilation reuses saved AI values | Required; Phase 1 migration/note rendering never calls providers to compile notes |

### Approved retroactive AI generation (future Generate / Update Notes action)

For both global and color-specific AI fields, this future action must scan every
annotation in the selected scope regardless of creation date or extension install
date. Resolve current field definitions; generate missing values and newly added
AI fields; reuse valid saved values; support retrying failed fields and explicit
regeneration. Track prompt changes so outdated values can be identified rather
than silently treated as current. Provide progress, cancellation and resumable
processing; retain successful results after interruption and prevent duplicate
requests. Preserve manual values, native Comment and ordinary notes.

Phase 1 supplies stable identities, separate scopes, per-field request locks,
incremental successful commits and saved prompt/source metadata. It does not add
the Generate / Update Notes interface, job scheduling/resume UI, cross-paper notes,
inclusion controls or a Research Notes dashboard. Missing historical fields are
not automatically generated during migration or restart.

Validation: 58 isolated regression tests pass, retaining all 48 preceding cases.
Migration and the new controls still require live development-profile verification.

## UI and formatting requirements update

The product owner confirmed automatic AI generation and deletion synchronization
work in the latest live-tested development build. This change adds:

- R17: No permanent Fill with AI control in the clicked-highlight popup or sidebar.
  Preserve automatic generation, progress/errors and the shared pipeline. A small
  contextual Retry is available only after failure, superseding permanent-action
  descriptions in older sections. Batch/review actions remain unchanged.
- R18: Request field content only. Remove an exact redundant leading field name
  or configured label conservatively; retain scientific content, meaningful
  headings, paragraphs and formatting. Historical structured values are formatted
  for presentation without being rewritten.
- R19: Compact structured field containers share a thin border, subtle tint,
  rounded corners and visible labels across creation, popup and sidebar, with
  inherited light/dark theme colors and appropriate read-only AI presentation.
- R20: Consecutive managed note entries have native horizontal rules and consistent
  spacing. Normalized rules must not accumulate during sync or survive as stale
  boundaries after deletion. Preserve numbering, links, colors, fields, metadata
  and unrelated user content.

Implementation is covered by 33 passing tests, retaining all preceding 23 cases.
Live verification of this build's appearance and normalized note output is pending.

## Automatic generation and deletion update

The product owner confirmed the previous structured-field build works in the
dedicated Zotero development profile. The following requirements are now explicit:

- R14: In Automatic mode, a newly created highlight with AI fields fills missing AI
  values using individual field prompts, including AI-only schemas. Persist manual
  drafts first; show `Generating...`, preserve concurrent edits and native Comment,
  prevent duplicate requests, and retain explicit retry on failure. Opening an
  existing annotation or restarting must not trigger generation.
- R15: The native Add to Note action is removed from the creation popup only;
  consolidated notes and unrelated Zotero note-management actions remain.
- R16: Highlight deletion immediately rebuilds the managed note entries, including
  final/multiple deletion and renumbering. Concurrent work must not restore deleted
  entries, and unrelated note content outside managed entries must survive.

Implementation now starts the shared generator only from item-add handling, tracks
session request status, and serializes deletion with attachment note rebuilds.
Creation-popup action suppression is scoped to Zotero's native direct-child
button selector, verified against the installed reader bundle. The original 13
regression tests and 10 added cases pass; new live Zotero verification is pending.
The older implementation/baseline sections below are retained as historical context.

Implementation update: individual annotation paths now display manual and AI
fields in all three interfaces, provide explicit AI actions for existing
annotations, preserve native Comment, and use acknowledged structured saves.
Failed/empty generation rejects without replacing stored AI values; manual
values and concurrently edited fields are preserved. Thirteen isolated tests
pass; live Zotero validation is pending. The baseline table below is historical:
batch/review and other out-of-scope gaps still apply. Requirements are unchanged.

Baseline: 2026-11-15. [AGENTS.md](AGENTS.md) is the source of established product
requirements. This document records implementation gaps without changing those
requirements. See [BUGS.md](BUGS.md) for evidence and [TESTING.md](TESTING.md)
for validation. Runtime observations have not been reproduced in Zotero during
the baseline work.

## Vision and development constraints

ResearchAnnotator should integrate literature reading, annotations, structured
extraction, AI assistance, research notes and knowledge organization within
Zotero. Explain decisions accessibly to a product owner with mechanical
engineering/scientific research expertise and limited development experience.
Investigate causes and data flows, preserve working behavior and uncommitted
changes, avoid unrelated refactoring, and distinguish evidence from hypotheses.
Never silently alter established requirements or delete untracked files,
backups or candidates without explicit permission.

## Established functional requirements

| ID | Intended behavior | Current implementation and gap |
| --- | --- | --- |
| R01 | Each academic paper has a consolidated research note | Notes are created/rebuilt for an attachment; multiple attachments can produce multiple notes. No startup-wide backfill |
| R02 | Highlight fields configurable by color | Implemented schema in `colorPrompts`; separate image color keys |
| R03 | Manual and AI fields coexist | Shared schema supports both; clicked-highlight popup excludes AI |
| R04 | Supported manual types, including checkboxes/dropdowns, remain functional | Controls implemented; sidebar skips persistence when last manual value is cleared |
| R05 | Fields appear consistently during creation, on existing cards and in consolidated notes | Separate renderers differ in visibility, parsing and refresh behavior |
| R06 | AI labels display before generation | Creation and sidebar render labels; clicked-highlight popup omits AI |
| R07 | Ungenerated AI fields show `Not generated yet` | Implemented in creation, sidebar and notes; absent AI rows in clicked popup; review hides empty AI value |
| R08 | AI values read-only in ordinary manual editing | Creation/sidebar AI rows are read-only; popup omits rather than displays them |
| R09 | AI generation explicitly accessible | Sidebar conditional button, menus and review actions exist; clicked-highlight research popup has no AI action |
| R10 | Native Zotero Comment independent of structured fields | Ordinary manual paths partly comply; sidebar AI, batch and review/refill still write generated/structured content into Comment |
| R11 | Structured values persist across restart | JSON persistence implemented; delayed writes not durably acknowledged, no explicit shutdown flush |
| R12 | Field changes reflected in consolidated note | Explicit saves and item modifications trigger rebuilds; clearing, undo, conversion, deletion and schema refresh have gaps |
| R13 | Failed AI operations preserve saved data | Generation starts from copies in some paths; swallowed per-field failures, refill and batch replacement can lose existing values |

Implementation status is based on code inspection and isolated checks, not
end-to-end acceptance. A visible control alone does not establish correctness.

## Existing behavior to preserve while fixing defects

These capabilities exist in the code and should receive appropriate smoke
testing when affected: manual field types; color-specific value restoration;
themes/experiments and native tags; native Comment editing; annotation links;
highlight/underline conversion; note ordering; provider adapters; batch/retry;
review/refill; chat and note proposals; citation copy/navigation; note reduction;
macOS spelling; English/French interface and collection controls.

This inventory does not turn every historical implementation detail into a new
product requirement. In particular, the old comment-based storage model is
inconsistent with R10 and is not a requirement to retain.

## Decisions still needed

- Define how multiple attachments and standalone documents satisfy R01 without
  duplicating or discarding existing research notes.
- Automatic individual AI-field generation is now the default under R14, subject to the saved
  Automatic/Manual trigger policy. Legacy whole-comment
  generation, batch and review behavior are outside this change.
- Define intended regeneration/partial-success feedback while preserving R13.
- Decide cross-device structured-field synchronization and schema rename/removal
  policy; current local JSON does not establish either as a product requirement.
- Decide whether editing managed note entries should ever update annotations.
  A dormant reverse-sync function does not establish this requirement.

Engineering proposals in ROADMAP.md and TESTING.md are recommendations pending
implementation, not silently adopted product requirements.
