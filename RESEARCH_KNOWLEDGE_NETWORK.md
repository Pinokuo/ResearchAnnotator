# Research Knowledge Network

## Focused Network workflows (2026-11-17)

Relationships, Topics and Research Questions remain the three sections. The
question list opens a detail editor using the available width. Evidence roles
have editable/removable rows in a secondary panel and persist through the existing
roles array; punctuation no longer separates values. Graph controls, relationship
types and AI suggestions remain secondary. Storage, revisions, evidence
associations, manual/AI distinctions and existing data are unchanged. See
UI_UX_DESIGN.md and UI_UX_VERIFICATION.md.


This milestone extends the 184638 development baseline. Earlier documents describing
Knowledge Network as deferred are historical; Production Readiness PR15, color
geometry, complete rebranding, codebase translation and final polish remain deferred.
Automatic cross-device synchronization remains blocked as documented in
[SYNCHRONIZATION.md](SYNCHRONIZATION.md).

## Architecture and data integrity

`research-network.js` owns domain operations, reference resolution, relationship
indices, topic projection, questions and suggestion validation. It uses the optional
version-1 `network` document inside `researchannotator-infrastructure.json`; it does
not introduce another database, write queue, job manager or annotation store.
`AnnotaInfrastructure.mutate` serializes validated atomic writes and retains its
last-good recovery snapshot. Existing complete backups, import previews, journals,
conflict handling and restoration include Network data. Old backups without this
optional document remain valid. Unsupported Network versions fail validation.

Explicit relationships store a stable ID, typed source/target identities, type ID,
directionality snapshot, optional explanation/supporting annotation references,
creation/modification timestamps, revision and manual/AI-assisted provenance.
References use existing portable library identities plus native item keys. Publication
and annotation keys are distinguished. Creation requires available native entities;
stored relationships survive deletion or temporary unavailability with a visible
status. Moving an annotation between attachments in the same library resolves its
current source without changing its relationship identity. Cross-library moves that
create new native keys require explicit reconnection; no speculative reassignment
occurs. This candidate creates explicit relationships within one library, preventing
accidental cross-library association.

Edits carry an expected revision, so concurrent changes are rejected rather than
silently overwriting another edit. Deletion records a tombstone instead of erasing
recoverable history. Import conflicts treat a relationship, question, type or
suggestion as one atomic record. Explicit library mappings resolve against real
items of the required kind; unavailable mapped references retain their original
identity and an unmatched recovery diagnostic. Relationships are never deleted just
because a library is offline. Restoring state invalidates the local indices/views.

Entity and type indices are rebuilt after Network revisions and reused during
ordinary navigation. Native/structured discovery reuses Explorer's scoped cache and
incremental updates. There is no full-library scan per graph expansion or relationship
lookup. Initial topic discovery may scan the selected scope once, with cooperative
yielding and cached projection. All interface lists and graph traversal are bounded.

## Relationship semantics and ordinary workflows

Defaults are Supports, Contradicts, Extends, Uses method from, Improves upon,
Reviews and symmetric Related to. Directional views display the stored source
label outward and the configured inverse label inward. Inverse display does not
create a second record. Symmetric identities canonicalize the endpoint pair so
reversing it cannot create a duplicate. Same-type, same-direction duplicates and
self-links are rejected. The optional supporting-annotation list contains annotations in the same
library; AI provenance can additionally cite supplied publication evidence.

In Network, select a library/scope, search for a publication or annotation, then
choose Connect evidence. Search for the target, choose its type, optionally add an
explanation/supporting annotations, and save. Relationship rows provide incoming,
outgoing or symmetric orientation, original source navigation, editing and explicit
confirmed deletion. Type configuration is secondary: create/rename types, set an
inverse/direction, and archive them safely. Used types cannot have their semantics
changed in place; create a new type for a direction change, then archive the old
one. Historical relationships retain their type ID and directionality. Changing a
relationship to a different type applies that type's directionality.

The existing publication context menu and reader annotation context menu provide
Connect Research Evidence. Explorer offers per-result connection and Send results
to Network. Selected Zotero entities can prefill source/target/evidence. These
actions focus the existing workspace; no main toolbar button or independent primary
window was added. The existing Workspace, Annotation Review and Chat buttons remain.

## Topics and research questions

Designate existing dropdown/multi-select fields under Research topics → Topic source
fields. Global and color-specific definitions retain their stable IDs; value nodes
use the existing category catalog IDs. Dropdown labels are resolved through that
catalog rather than becoming a competing taxonomy. Membership is derived from
structured assignments and never materialized as persistent scientific relationships.
Sharing a topic does not mean support, agreement or contradiction.

Topic views show the name/field, associated publications and annotations, relevant
explicit relationships and deterministically identifiable managed notes (exact
Network topic notes and PDF notes containing the topic evidence). Unavailable field
designations remain visible/retained until explicitly removed; restoring the field
can restore its projection. Original values are not removed by designation changes.

Research questions live within Network, with stable IDs, title, description,
customizable evidence roles and references to original publications/annotations.
Defaults include Supporting evidence, Contradictory evidence, Background,
Methodology, Limitations, Potential solutions and Unanswered questions. Users
explicitly associate/reassign/remove evidence from Network or transferred Explorer/
Zotero selections. No original annotation or field values are copied or classified
automatically. Removing a role still assigned to evidence is rejected until those
associations are reassigned. Question deletion confirms removal of associations;
underlying evidence remains intact.

## Optional local graph

The SVG graph is a secondary view; the relationship list remains fully usable.
Publication rectangles, annotation circles and larger topic circles have labels,
keyboard-selectable nodes and selected-node actions. Scientific relationship edges
carry labels/arrows where directional; topic membership is separately labeled and
dashed. Mouse pan, wheel/button zoom, reset, node selection, direct-neighbor
exploration, depth (1–3), relationship/node type filters and library/collection/
selected-publication scope are supported.

Expansion defaults to a local neighborhood, with at most 160 traversed nodes and
400 edges; the ordinary request defaults to 80 nodes. Node filtering changes the
visible projection while retaining bounded traversal through intermediate nodes.
The UI reports truncation instead of attempting an entire-library graph. The
simple deterministic ring layout prioritizes functional exploration over final
visual polish. No visualization dependency or executable CDN resource was added:
SVG, rendering code and styles are bundled locally and work offline.

## Explicit AI discovery and approval

Choose selected Zotero publications/annotations, transferred Explorer results, a
topic, a question or selected entity/related evidence. Publication scopes can add
their supplied annotation evidence. Publication-only discovery uses the supplied
title/abstract, explicitly identifying title-only evidence. Preview lists the supplied entity IDs/titles,
context size, token estimate and one request. Scopes are bounded to 2–24 unique
entities, 30,000 context characters and at most
24 suggestions; there are no exhaustive library-wide pairwise comparisons. Active
type dictionaries are also bounded. Changing evidence after preview requires a new
preview. Submitting requires an explicit confirmation; no discovery starts from
rendering, annotation creation, schema changes or restart.

The existing `network-suggestions` persistent job uses the configured provider and
shared safe HTTP/retry policy. Only supplied entity/type IDs and supporting annotation
references are accepted. Publication references remain in the approved evidence
provenance, while the relationship supporting-annotation list contains only annotations. Invented references, self-links, malformed/oversized output
and missing explanations/support are rejected. Results enter a separate review queue,
with Accept, Edit and accept, Reject and original-evidence inspection. Only approval
creates a scientific relationship, with AI-assisted provenance. No model confidence
is treated as a calibrated probability. Both suggestions and accepted assessments
remain explicitly labeled as AI assessments requiring scientific verification.

Pause/resume/failure recovery remains in Activity; Network also offers cancellation.
A late response after cancellation is discarded. An already sent HTTP request may
still finish or be billed; cancellation does not promise provider-side abortion.
A durable batch marker prevents a saved suggestion batch from causing another paid
request on job replay. Interrupted/failed paid jobs require existing explicit recovery
acknowledgement. Acceptance revalidates evidence and scope; double approval is rejected.

## Managed research notes

Compile research note opens the existing Notes configuration/preview/generation flow
with a Network selector (publication/annotation relationships, topic or question).
The shared annotation compiler retains direct source links, inclusion options and
automatic/manual/static modes. Relationship explanations and evidence roles are
separate managed entries, identified by normalization-resistant hidden link metadata.
User explanations and accepted AI explanations are labeled separately from original
scientific evidence. No management IDs appear as visible text.

Shared annotation-level reconciliation, stable note identities, positioned authored
content, incomplete-data guards, repair/restoration and ordinary-note protection
remain authoritative. Missing/unavailable Network sources stop compilation rather
than replacing a complete note with an empty local projection. Automatic Network
note refresh is compilation only and never initiates relationship discovery.

## Verification and limits

The matched build inventory and TESTING.md record exact counts/hashes and native
evidence. Service tests cover CRUD, inverse/symmetric semantics, duplicates, types,
deletion/unavailability/moves, libraries, topics/renames, questions, atomic backups,
graph bounds/filtering, AI approval/rejection/cancellation/replay, normalized managed
notes, 100 unchanged rebuilds, identity, restart and large relationship indices.
Browser fixtures exercise the actual HTML/SVG controller without paid AI. Native
Zotero acceptance uses trusted mouse/native keyboard events, synthetic data and a
loopback provider, separately from mocked/browser coverage.

Known limits: relationships are within one library; cross-library moves require
explicit reconnection. Local graph layout and bounded list views are functional,
not final visual polish. Initial cold topic/library discovery uses existing scoped
Explorer discovery and can be slower on very large libraries. Full owner-library,
all-platform/Zotero-version, screen-reader, provider billing and long-running job
acceptance remain separate live work. Cross-device synchronization is not added.

Network note completeness adds a hidden library-scoped Network fingerprint and expected relationship/question IDs. Local disappearance blocks regeneration; explicit tombstone deletion can reconcile entries normally. This complements the original annotation/data guards. Notes exceeding the supported relationship/annotation bound stop with an actionable narrowing message instead of silently truncating content.

Suggestion review allows editing source, target, type, explanation and cited references within the supplied evidence set. Topic and pending/reviewed suggestion browsing use bounded pages. Unchanged native option nodes survive live refresh. Newer nested Network storage versions are rejected without downgrading to a recovery snapshot.

Settings-only exports retain Network type/topic configuration without exporting scientific relationships, questions or suggestion history. Full research backups retain those records and use explicit library mapping during import. Pending AI review edits are retained during background refresh, including when an explanation is being typed.

Delivered candidate: [20261116-223342-088](DEVELOPMENT-BUILD-20261116-223342-088.json). All 306 regression tests pass; the exact XPI passes isolated Zotero 10.0.8 Network interactions, restart persistence and retained Automatic/Manual AI-trigger verification. See [TESTING.md](TESTING.md) and its linked reports for evidence, performance and remaining live acceptance.
