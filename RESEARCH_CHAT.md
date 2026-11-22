## Reliability milestone update (2026-11-22)

Keyword retrieval is independent of embeddings, including explicitly corrected failed-request retries. New request identities retain prior attempt metadata and require explicit retry approval. PDF/mixed mode never silently answers from note-only context; selected notes are an explicit mode with a clear non-PDF warning. Raw note keys are not source citations. Coverage appears before asking; validated PDF citations expose a visible Capture Evidence action, while navigable passages without reliable coordinates explain why highlighting is unavailable. Index recovery, history failures and temporary busy state are recoverable without automatic paid repeat. See RELIABILITY_AUDIT.md.

## Integrated refinement update (2026-11-17)

Optional retrieval diagnostics retain selected/indexed/missing source counts, retrieval mode, ranked passages, actually supplied evidence and context-budget exclusions per answer. Distinct states cover no index, no matches, missing embeddings, generation failure and insufficient evidence. Opening diagnostics makes no provider request. Keyword-only operation, consent, validated citations and Capture Evidence remain unchanged.

# Source-grounded Research Chat and Capture Evidence

## UI/UX consolidation and Option C (2026-11-17)

Research Chat remains in the sidebar and expands to one resizable native window.
Both use the same conversations, validated evidence, providers and persistent jobs.
Question/source/retrieval/capture state is shared; local Chat history persists
question and capture drafts when history is enabled. Closing a view does not
restart a request. Generate Note saves a cited answer through existing note saving;
Capture Evidence retains explicit preview and AI consent. See UI_UX_DESIGN.md.

Sources contains source selection and local indexing. Chat settings contains
optional retrieval/context and separate embedding configuration. Keyword remains
the default without an embedding model. Explicit semantic/hybrid preferences are
retained with actionable missing-model/consent guidance. Raw coverage objects are
replaced by readable counts; selective evidence still does not imply an exhaustive
review or scientific correctness. All grounding/privacy/navigation guarantees below
remain in effect.

This milestone extends development build 20261116-223342-088. Production Readiness
geometry, complete rebranding, translation and final polish remain deferred.
Settings boundaries and previewed batch note-default replacement are authorized now.

## Architecture and inherited Chat audit

The inherited Chat already provides its dedicated toolbar/sidebar, shared provider
configuration, generation-model selection, conversation history, Markdown rendering,
copy/save-to-note, legacy page links and guarded note proposals. These remain.
`research-chat-ui.js` adapts this interface; `research-chat.js` replaces the answer
grounding path and registers `chat-index` and `research-chat` with the existing
persistent job manager. No competing provider, database or annotation store is added.

The earlier Chat cache was attachment-ID-only and did not invalidate against file
contents. Its page labels and numeric references did not establish passage identity
or validate that a cited passage had been supplied. Grounded answers now store their
validated evidence snapshots alongside existing conversation messages. Historical
conversations and their original citation renderer remain readable.

## Sources, extraction and local indexing

Choose the current PDF/publication, selected publications, selected collection with
optional subcollections, a library, or custom individual PDF attachments found through
source search. All PDF attachments of selected publications are considered. Scope is
retained per conversation and frozen per submitted question. Navigation does not
replace a grounded conversation with a different paper's conversation.

Source rows identify available, indexed, pending, missing and unsupported files.
Indexing is explicitly initiated and uses persistent progress/cancellation/recovery.
Library scanning discovers attachments, not an exhaustive catalogue of literature.

The local `researchannotator-chat-index.json` contains a versioned document manifest,
native MD5 content fingerprints, size/modification signatures, page passages and
optional vectors. Writes are serialized, atomic and retain a recovery snapshot.
This rebuildable file is excluded from portable research backups. Document locks
avoid duplicate extraction/embedding work for overlapping scopes. Unchanged documents
are not re-extracted. Changed/missing/deleted sources are excluded from current
retrieval; historical excerpts remain readable and navigation/capture recheck the
actual file fingerprint. Indexing rechecks the fingerprint after extraction.

The native full-text word index / `attachmentText` cannot establish page geometry.
The adapter uses `Zotero.PDFWorker.getFullText` only when extracted page counts and
page delimiters establish physical pages. For open PDFs, Zotero's reader PDF proxy
provides printed labels and character/line rectangles through `getPageData`. Arguments
must be copied into the reader's JavaScript compartment; resulting stored data is
converted to ordinary JSON. Page-local offsets refer to the original extracted text,
not to byte offsets in the PDF. Each passage retains library, publication and PDF identities. Its evidence ID hashes
library/PDF identity, fingerprint, physical page, offsets and extracted-text hash.

These are version-sensitive Zotero internal APIs. If page extraction is unavailable,
the source is reported rather than assigning invented pages. If character geometry is
unavailable, page citations remain usable but capture is disabled. Open the PDF,
explicitly re-index with reader locations and ask again to obtain capturable citations.
Extraction is bounded to 2,000 pages per attachment; incomplete coverage is reported.
No OCR or model download is performed.

Primary API audit: [Zotero client API](https://www.zotero.org/support/dev/client_coding/javascript_api),
[native PDF worker implementation](https://github.com/zotero/pdf-worker/blob/master/src/pdf/index.js).
Installed Zotero 10.0.8 manager, annotation and reader source audits are retained locally.

## Retrieval and generation

Keyword mode builds a local inverted passage index. Retrieval uses the selected
scope, bounded passage count (default 12, maximum 24), configurable excerpt budget
(2,000–60,000 characters) and publication diversity before filling remaining capacity.
Follow-ups re-retrieve using the new question and recent question context. The complete prompt is also fitted to the existing provider budget, including history and optional context. Only
bounded excerpts, limited conversation context and explicitly selected research
context go to the existing generation provider. Entire libraries are not submitted.

Semantic retrieval is optional. An independently selected embedding model and
explicit endpoint support Ollama `/api/embed` and OpenAI-compatible embedding APIs.
OpenAI-compatible embedding calls reuse the existing API credential; there is no
additional secret store. Explicitly approve passage transmission before embedding
indexing, and question transmission before semantic/hybrid retrieval. No automatic
downloads or background embedding requests occur. HTTPS is required for non-local
embedding endpoints. Model/endpoint changes invalidate vector compatibility and
require explicit re-indexing. Hybrid retrieval combines keyword and cosine rankings
with reciprocal-rank fusion. Keyword-only mode requires no embedding model. Pending embedding jobs and retrieval requests retain the approved endpoint/model signature; configuration changes require reapproval before further transmission.

Generation instructions distinguish source findings, cross-source synthesis,
interpretations and unresolved questions. PDFs and research context are untrusted
data, not instructions. Only citation IDs from supplied passages are accepted;
fabricated IDs are removed and flagged. Uncited/invalid-reference responses show
warnings. Reference validation is not automated scientific claim verification.
Coverage counts, missing/index-pending sources and truncation are exposed. Selecting
an entire library never establishes an exhaustive literature review.

Optional annotations, structured manual/AI fields, research notes and Network
relationships are labelled as user/AI context. Original-paper citations always
refer to extracted PDF passages, not merely generated summaries.

## Citation guarantees and persistence

Inline citation buttons reveal title, authors/year, attachment, page and supporting
excerpt. With verified reader rectangles, Open in PDF supplies the original position
and Zotero's temporary navigation highlight; it creates no permanent annotation.
Without geometry it opens the correct page and shows the excerpt for Zotero Find.
The interface explicitly distinguishes page navigation from exact passage navigation.
Changed/unavailable documents block navigation/capture and retain the old excerpt.

Conversation sources, retrieval settings, request identities and citation snapshots
survive reopening/restart through the inherited history file. Existing history-off
preferences are respected: session-only conversations cannot recover after restart.
Paid generation uses the existing provider token, cancellation hooks, persistent
jobs and explicit ambiguous-request recovery; duplicate request identities cannot
publish duplicate answers. No credentials are stored in index, history or journals.

## Capture Evidence

An answer/citation offers individual, selected or all-cited capture. The preview
deduplicates passages and shows publication/PDF counts, original excerpts, page,
matching annotations and unresolved locations. Users can exclude individual passages.

Capture requires a matching live fingerprint and verified native character geometry.
It creates native Zotero highlight items through `Zotero.Annotations.saveFromJSON`,
without changing the PDF file. Multi-line rectangles are retained. Multi-page evidence
is represented by separate page-local highlights in one recoverable operation.
Zotero normalizes terminal whitespace; the scientific source text is not paraphrased.

Use an existing semantic color and existing global/color field definitions. All
manual types are supported; categorical controls reuse the existing catalog and
multi-select implementation. Assignments match stable field IDs, so same-named fields on different colors cannot be confused. New categorical values remain part of that shared
system. Matching highlights are reused without recoloring. Default conflict policy
preserves populated values; explicit merge applies to multi-select values, while
explicit replace affects only assigned manual fields. Native Comments, Tags and
completed AI values remain independent.

Capture suppresses ordinary creation-time Automatic AI for journaled keys. The
explicit Generate missing AI fields option is off by default, for both Automatic
and Manual colors. If selected, existing structured-AI jobs generate only missing
fields. No additional Chat/theme request is needed to assign common manual values.

Before native writes, `infrastructure.evidenceCaptures` durably records operation,
conversation/answer IDs, passage provenance, planned native keys, existing matches,
field policies and recoverable backup. Serialized capture jobs checkpoint partial
successes. Restart/resume uses planned keys and guarded field patches; repeated
capture cannot duplicate highlights. Provenance is retained locally and in full
research backups, and is omitted from visible consolidated-note metadata by default.
Settings-only exports exclude capture records.

Undo removes only unchanged newly created annotations. Reused annotations are
retained; assigned fields are restored only if they still match capture's saved
post-state. Later edits are kept and reported. Cancelled/interrupted operations
remain recoverable. A captured annotation participates in existing Review, Explorer,
PDF/filtered notes, categorical topics and Network by its normal native identity.
Optional question association and a managed cross-publication evidence note reuse
the existing Network and shared managed-note engine.

## Notes and usability corrections

Source/Page persistence had two causes: preserved explicit saved choices, and
compiler tests that enabled absent metadata flags. New defaults explicitly omit
Source, Page, Tags, empty fields and repeated publication metadata. Cross-publication
groups retain publication identification once. Optional settings can enable metadata.
The batch management action selects library/type/configurations, previews differences,
requires confirmation and backs up before jobs update configurations/notes. Stale
previews are rejected. Static snapshots remain protected. Existing reconciliation,
identity, repair, authored-content positioning and incomplete-data guards remain.

Notes starts with By Publication, By Field, By Color and From Saved Search, followed
by source/content/preview/generation guidance. Existing-note actions are contextual.
Network has Relationships, Topics and Research Questions navigation; AI/type controls
remain secondary. Explorer, Saved Searches and Activity are not redesigned. Four
settings sections have visible borders/headings; layout/order remain expanded and
none of the five deferred color geometries changes.

## Verification limits

See TESTING.md and the matched build inventory for exact regression/browser/native
reports and performance. Synthetic PDFs with known passages/page baselines establish
actual navigation and native capture in the tested Zotero version. Complex typography,
scanned/encrypted PDFs, different Zotero/OS versions, screen readers, owner-library
cold scans, real embedding/generation providers and billing still require acceptance.
Local vectors use bounded linear cosine ranking, not an approximate-neighbor database;
very large semantic corpora need further measurement. Rebuilding the index does not
delete historical citation snapshots. Automatic cross-device synchronization remains
blocked; no unsupported synchronization mechanism is added.

The inherited scope shortcuts (including multiple collections) remain secondary controls. Optional note editing reuses the existing bounded note context, opaque preservation tokens, proposal/apply/undo controls and truncated-note replacement guard; new grounded proposals cannot target unsupplied notes. Saved Chat notes retain original PDF page links. Embedding configuration is local to the profile; rebuild/reconfigure local indexes and embedding models when moving research data.

Final integrated candidate: [20261117-004427-283](DEVELOPMENT-BUILD-20261117-004427-283.json). Exact packaged and restart evidence is linked from [TESTING.md](TESTING.md).

To update old presentation choices after installing, open Notes > Manage existing notes > Apply simplified content defaults. Choose library/type scope, list and select configurations, preview differences, then confirm replacement. Existing explicit settings otherwise remain intact. Final build SHA256: `f94e396e434b7177c2bb27f366e428d1fc7b9be80cc7c77a6794c8de5002c8e1`.
