## Public beta milestone (2026-11-22)

The 2.43.0-beta.1 milestone supersedes the prior deletion-regeneration policy: intentional managed-note deletion persists a management tombstone until explicit Recreate / Resume management. Add inline palette actions and packaged logo; per-note color order with explicit one-time rebuilds in all modes; previewed native highlight color mapping with persistent jobs, recoverable journals and conflict-aware Undo. Preserve structured data and PDF bytes; never import embedded annotations automatically or generate AI during mapping. See BETA_READINESS.md, INSTALLATION.md and CHANGELOG.md for current behavior and compatibility.

## Reliability milestone update (2026-11-22)

PDF requests default to Automatic, with explicit mode choices retained. Delete releases known-deleted ownership without setting Static. Unknown missing items are protected until explicit recovery; backups precede repair. Bulk update-mode editing is separate from simplified defaults and uses library-aware identities. PDF batch templates cannot become standalone notes. The exact publication H1 is preserved while the body identifies ResearchAnnotator; native Comment is labelled Comment. See RELIABILITY_AUDIT.md.

## Integrated refinement update (2026-11-17)

Refinement: new PDF titles equal the parent publication title exactly; attachment identities remain distinct. Existing H1 titles survive synchronization. Explicit Rename edits title only. Non-PDF preview shows validated destination policy and management offers backed-up same-note Move. Original passages use native supported H2 size, bold quotation/link and a separate semantic color indicator. User content remains anchored to annotation identities. See REFINEMENT_AUDIT.md.

# Research Note Generation milestone

## Guided creation and contextual management (2026-11-17)

Notes starts with By Publication, By Field, By Color or From Saved Search.
Sources, Content, Preview and Generate are separate steps with Back navigation.
Explorer/Network handoffs enter the content step. Manage existing notes contains
contextual note actions; maintenance/repair and batch defaults stay secondary.
This changes presentation only: configuration, synchronization, identities,
annotation-level positioning, snapshot repair and incomplete-data safeguards use
the existing managed-note services. See UI_UX_DESIGN.md.


## Simplified presentation update (2026-11-16)

New PDF inclusion defaults retain semantic label, numbered linked text, populated native Comment and global/color fields. Empty fields are omitted; metadata/page labels and native Tags are opt-in. Cross-publication metadata is emitted once per managed publication group. Existing explicit flags remain unchanged. Edit configuration ? Use simplified content defaults ? Preview ? Save configuration ? Update converts an existing note through the shared positioned reconciler without changing its identity. [Details](WORKSPACE_USABILITY.md).


## Unified Workspace integration

Generation/configuration/preview/repair are now in **Tools → Research Workspace… →
Notes**; persistent jobs are in **Activity**. Explorer transfers and filtered-note
reopening stay in the same window. Existing controllers, models and generation
services remain shared. [RESEARCH_WORKSPACE.md](RESEARCH_WORKSPACE.md) documents the
new annotation-level user positioning policy and native opening diagnostics.

## Subsequent Explorer integration and critical B23 fix

The focused dashboard now accepts Explorer queries for preview and generation,
and can reopen their original filters in Explorer. All note types share the
corrected engine described in [MANAGED_NOTE_REPAIR.md](MANAGED_NOTE_REPAIR.md).
The former whole-document snapshot fallback is removed; earlier snapshot wording
is historical. Existing affected notes require explicit backup-first repair through
the dashboard. [RESEARCH_EXPLORER.md](RESEARCH_EXPLORER.md) describes the new consumer.

Development candidate, 2026-11-16. Live Zotero acceptance remains required.
The owner explicitly authorizes this milestone despite the unresolved automatic
cross-device metadata synchronization prerequisite in older planning sections.
Synchronization here means local annotation-to-note updates. No experimental
cross-device transport, full Explorer, knowledge network, deferred color geometry,
broad rebranding or source translation is included.

## Interface and scopes

Open **Tools → Research Notes…** from Zotero's main window. Choose PDF, structured
field or semantic color generation, then an entire library, selected collection,
selected publications or selected PDF attachments. Collection scope includes its
direct items and their PDFs; descendant collections can be processed separately.
Selections are captured as stable library/item keys on submission. Library and
collection configurations resolve their current membership on update. Scopes never
cross libraries. Historical annotations have no creation-date cutoff. Non-PDF
attachments, deleted sources and tombstoned annotations are excluded.

Load fields/colors, choose values/colors, customize title, content and mode, and
preview. Summary reports publications, PDFs, matching annotations, existing,
missing, outdated, failed and pending AI values and estimated new requests.
Counts are field requests, not tokens, prices or billing guarantees. Existing and
failed counts can overlap when failed regeneration retains an earlier success.
Pending work is not submitted again. Opening and previewing never request AI.
Generation requires an explicit action and reviewed confirmation.

Global and color-specific fields are selectable. Multi-select and dropdown filters
use stable category IDs; scalar text/textarea/AI filters match exact saved values.
No selected values means any populated value. Checkbox choices distinguish Checked
and Not checked. This focused form is not the future general AND/OR Explorer.

## Work-package implementation

| Package | Candidate implementation |
| --- | --- |
| Dashboard | Main-window Tools entry; PDF/field/color generation, previews, managed notes and jobs; compact native forms |
| Batch PDF notes | Scoped PDF enumeration delegates to the existing PDF queue; one legacy managed identity per PDF, including multiple PDFs under one paper; empty PDFs reported by key |
| Retroactive AI | Current global/color definitions and historical annotations; missing-first or existing-only; failed retries and separately explicit outdated regeneration; incremental saved successes |
| Field notes | Stable field/category filters, multi-value selection, standalone notes grouped by publication with citations and source links |
| Color notes | One/multiple stable palette IDs, retained through semantic/hex changes; no inferred relationships or AI summaries |
| Content | Shared renderer/compiler supports publication title/authors/year/citation, page/content/color/Comment/Tags, global/color manual/AI groups and individual fields; empty manual fields omitted by default; missing AI retains its established placeholder |
| Configurations | Stable identity independent of title; open/update/edit/rename/mode/source/last-update/delete controls; deletion confirms Trash and retains the identity in static mode |
| Background jobs | Existing persistent manager handles stages, annotation/note checkpoints, pending AI, failures, skipped PDFs, pause/resume/cancel and explicit retry |
| Integrity | Atomic shared storage, duplicate-marker checks, ownership/user snapshots; generic notes gain the same completeness fingerprint/count as PDFs plus prior-record checks |

## Architecture and persistence

`research-notes.js` orchestrates `AnnotaInfrastructure.notes`, `.lifecycle`, `.jobs`
and `Annota.generateStructuredFields`. No alternate note engine, renderer,
provider pipeline, store or job queue is created. Startup loads it after these
services initialize. `research-notes.xhtml` and window-local
`research-notes-dashboard.js` present the interface. Dashboard unload removes its
progress listener; shutdown closes dialogs and clears the debounce timer before
the existing infrastructure drain.

Durable structured saves and native item notifications debounce automatic
cross-publication refresh, reading saved values only. PDF automatic updates keep
their existing path. Manual notes update explicitly. Static notes retain content
until mode changes, including when Update is pressed. Protected automatic failures
are logged; explicit Update surfaces errors in the dashboard.

Configurations retain stable account/group identity, source keys, filters, mode,
title and boolean inclusion settings in the existing infrastructure file. Canonical
query signatures reuse configurations despite selection order/title changes;
simultaneous submissions serialize and deduplicate. Editing keeps note identity.
PDF generation applies mode/content settings to each PDF configuration; its batch
recipe is not itself a standalone generated note.

Paid interrupted/failed jobs retain the existing acknowledgement rule. Imported
or recovered jobs never run automatically. Successful fields persist before
annotation checkpoints. Resume skips saved valid values and completed notes;
failed annotations retry explicitly and affected notes then refresh. Independent
notes continue after failures. Cancellation is cooperative: sent requests may be
billed, while cancelled late results cannot commit. Completed work stays saved.

Portable job payloads express intent, never local ownership: generation discards
payload ownership HTML. Configuration presence alone cannot bypass completeness
guards. Missing live source records block replacement even when filtering hides
them; deleted annotations can be removed normally. This is conservative local
protection, not distributed convergence or proof all sources have synchronized.

## Validation and remaining acceptance

The integrated suite has **190 passing tests**, retaining all **162** prior cases.
This includes a real-browser dashboard fixture and the unchanged 80-case color
matrix plus 32 Wrap/Stacked references. Service tests mock Zotero items, providers
and filesystem operations. Browser tests do not establish native Zotero acceptance.
See [TESTING.md](TESTING.md) for checks and the matched build inventory.

Verify real dialog privileges/loading, selection/collection APIs, HTML normalization,
providers, restart/shutdown and large-library latency with a matched backup in the
development profile. Image/area annotations retain existing textual fallback/source
links; no new image embedding or OCR pipeline is introduced. JSON snapshots and
job/configuration history retain the earlier scaling limitations.

Research Note Generation artifact: [20261116-075249-726](DEVELOPMENT-BUILD-20261116-075249-726.json), C:/Users/Ahmed/Documents/ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-075249-726.xpi. Version 2.42.0; ID researchannotator@pino; 24 packaged files byte-verified; 190 tests passed. Package SHA256: `3dd445d3990821d7dd4c4fb39430883233bfb7cb024e542277676622c112bdcc`. Native Zotero acceptance pending.
