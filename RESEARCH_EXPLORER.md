## Public beta milestone (2026-11-22)

The 2.43.0-beta.1 milestone supersedes the prior deletion-regeneration policy: intentional managed-note deletion persists a management tombstone until explicit Recreate / Resume management. Add inline palette actions and packaged logo; per-note color order with explicit one-time rebuilds in all modes; previewed native highlight color mapping with persistent jobs, recoverable journals and conflict-aware Undo. Preserve structured data and PDF bytes; never import embedded annotations automatically or generate AI during mapping. See BETA_READINESS.md, INSTALLATION.md and CHANGELOG.md for current behavior and compatibility.

# Research Explorer milestone

## Unified Workspace integration

Explorer and Saved Searches now live inside **Tools → Research Workspace…**.
The same controllers stay mounted when changing sections. Generate Research Note
transfers filters directly to Notes in that window; managed filtered notes reopen
Explorer there. Independent search/storage/generation implementations are not
introduced. [RESEARCH_WORKSPACE.md](RESEARCH_WORKSPACE.md) supersedes the separate
window entry-point descriptions below.

Integrated development candidate, 2026-11-16. Includes the priority shared
[managed-note regression fix and backup-first repair](MANAGED_NOTE_REPAIR.md).
Knowledge Network, automatic cross-device metadata transport and Production
Readiness PR11-PR14 remain outside this milestone. No external search service or
research-data upload is introduced.

## Work packages

| Package | Candidate behavior and limits |
| --- | --- |
| Workspace | Tools → Research Explorer opens a resizable workspace with debounced search, library/direct-collection scope, nested filters/active removable indicators, saved searches, cards, sort/group/display controls, pagination and note generation |
| Unified search | Historical native annotations appear without structured records; cached text spans annotation text, Comment/Tags, publication titles/authors, semantic colors and configured global/color manual/AI values; no search-triggered AI |
| Dynamic filters | Libraries, collections, publications, years, authors, attachments, stable colors, annotation types, native Tags, configured fields and AI states; contains/not-contains, equals/not-equals, empty/not-empty and any/all; nested AND/OR groups |
| Results | Compact expandable cards, configurable content, semantic labels plus swatches, source-annotation/publication navigation, deterministic sort/grouping and 40-row pages (service cap 200) |
| Editing | Shared `AnnotaCardFields.build/fill/read` and multi-select controls; explicit guarded manual saves; native Comment/Tags use Zotero item setters/save transactions; AI remains read-only with explicit queued regeneration/failure Retry |
| Saved searches | Stable IDs/names, text/scope/filter logic/sort/group/display; create/reopen/edit/duplicate/rename/delete; stored in the existing portable preference allowlist and included in settings/full backups |
| Permanent notes | Existing Research Notes dashboard accepts Explorer filters, content options, preview, existing-only/missing-first and note modes; existing job/generator/compiler/ownership services do all generation; saved-search IDs retain managed note identity through search renames/edits |
| Performance | Up to three in-memory scope projections, shared cold discovery, indexed structured reads, cached search text, incremental native/structured updates, time-sliced evaluation, cancellation, debouncing and bounded rendering; no library rescan per cached keystroke |
| Protection/integration | Shared durable writes, strict expected-value conflicts, current color/schema checks, native edit guards, interface refresh and managed-note updates; incomplete-data guards retained; Explorer observes existing item/field/metadata changes |
| Delivery | Complete regression/browser checks, XHTML/syntax/diff/package verification and build hashes; native Zotero acceptance remains required |

## Data flow and identities

`research-explorer.js` is a query/orchestration service; it owns no competing
persistent research store, AI pipeline, note compiler or background queue.
`research-explorer.xhtml` and `research-explorer-workspace.js` provide the window.
The existing Research Notes scope enumerator gains an optional non-PDF annotation
scope for Explorer; existing PDF workflows retain their PDF-only default.

A query stores text, stable library identity and scope keys, a bounded nested
filter tree (eight levels/150 nodes), sorting, grouping and boolean display flags.
Saved searches use version-1 `researchannotator.explorerSearches` settings. Older
exports without this optional key remain valid. Publication/attachment/collection
filters use native keys; structured fields/colors/categories use their existing
stable IDs. Native author names/tags are exact native values (there is no invented
global author/tag identity). Dropdown filters retain label aliases alongside their
category IDs to match historical scalar assignments after categorical renaming.
Deleted field definitions remain visibly unresolved and never broaden a query.

A selected collection means its direct items and their attachments. Subcollections
are selectable separately. Query APIs also accept saved publication/attachment
scopes restored from managed configurations. Results include supported non-PDF
reader annotations; their presentation/source navigation uses existing Zotero
facilities. Image/area annotations keep the current text/type fallback and links;
there is no new image embedding/OCR feature.

## Consistency, edits and notes

Scope projections are disposable caches. Native annotations and the indexed
structured store remain authoritative. Shared cold discovery finishes once even
when several text queries supersede one another; cancelled results are discarded.
Native/structured changes update cached rows; publication/attachment/configuration
changes invalidate projections. Imported settings trigger preference observers.

Manual editors capture stable IDs, initial values and color. Shared storage's
optional strict expected-value mode rejects an entire stale patch rather than
silently accepting only some edits. Existing AI callers retain their prior guarded
merge behavior. Native edits preserve existing tag types, compare Comment/Tags to
their opening snapshot and use supported setters/transactions. Failed native
saves restore cached item values. Open dirty manual drafts prevent result replacement;
the user must save or reload them. AI operations remain explicit persistent jobs.

Generate Research Note opens the existing dashboard with the current query, rather
than exporting only a stale result-page snapshot. The query is stored inside its
managed configuration and evaluated again for updates. Saved-search identity
deduplicates repeated operations independent of the search's display name.
Anonymous identical queries reuse their canonical configuration. Notes can reopen
Explorer from the dashboard with their original query. Automatic notes re-evaluate
sources using saved values only; manual/static behavior and shared incomplete-data
guards apply. Saved-search edits affect an existing note when its operation is
explicitly submitted again, rather than silently changing its stored source filter.

## Performance and acceptance limits

The 15,000-record mocked fixture records cold discovery and cached query timings
in the regression output/build inventory. A representative integrated run measured
approximately 1,493 ms cold and 28 ms warm, rendering 25 results. These are local
Node/mocked-item timings, not a claim about actual Zotero/database/UI latency.
The cold projection and sorted matching result list still consume O(N) memory;
native enumeration/JSON snapshots and retained job history remain scaling limits.
Sorting uses one collator; evaluation yields after short time slices. Very large
matching result sorts still require live measurement.

Browser fixtures exercise production workspace controls and existing dashboards,
but not Gecko privileges or actual Zotero APIs. Required live checks include
window loading/focus/keyboard/themes, collections, historical/non-PDF annotations,
field types, stale drafts, concurrent native edits, source navigation, portability,
filter note modes, job interruption, repaired notes and measured large libraries.

Final integrated candidate: [20261116-085209-893](DEVELOPMENT-BUILD-20261116-085209-893.json), C:/Users/Ahmed/Documents/ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-085209-893.xpi. **226 tests passed**, 0 failed/skipped; all 190 preceding cases retained with the documented legacy snapshot assertion correction. 27 packaged files byte-verified; 18 runtime and 4 test JavaScript files syntax-checked; 3 XHTML files parsed as XML; git diff --check passed. Final mocked 15,000-record measurement: 1583 ms cold / 25 ms cached, 25-row page. Package SHA256: `8a309b2f8c6d7693b6ee91dbece5d83bea99c760349616230f569d19148c5254`. Native Zotero acceptance pending.
