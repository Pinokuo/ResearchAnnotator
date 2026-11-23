# Unified Research Workspace milestone

## UI/UX consolidation (2026-11-17)

Explorer now foregrounds a wide search field and annotation cards, with result
actions secondary and Cancel visible only during a search. Notes separates creation
from management and follows Type / Sources / Content / Preview / Generate.
Network keeps three focused sections, a question list/detail editor and individual
evidence-role rows. Saved Searches and Activity retain mounted state/workflows.
Shared native styling and the separate dual-mode Chat coordinator are described
in UI_UX_DESIGN.md. All existing services and toolbar integrations remain.


## Research Knowledge Network tab (2026-11-16)

Network is now the fifth section, alongside Explorer, Notes, Saved Searches and Activity. The existing shell mounts its HTML controller once, preserves state between sections and retains native popup styling. Context menus/Explorer focus this same window. No fourth main toolbar button or independent primary window is added. The relationship list is the primary interface; graph, AI review and configuration are secondary. [Network workflows and architecture](RESEARCH_KNOWLEDGE_NETWORK.md). Earlier four-tab-only boundaries below are historical.


## Usability follow-up to build 095828 (2026-11-16)

The existing window/controllers now provide native popup styling, an owned Tools submenu and progressive disclosure across the same four sections. New PDF notes have findings-first inclusion defaults; saved configurations remain authoritative, with an explicit simplify-and-update workflow. The shared field editor displays AI instructions before validation can reject an incomplete draft. Full control inventory, confirmed causes and migration policy: [WORKSPACE_USABILITY.md](WORKSPACE_USABILITY.md). Earlier build evidence below remains historical.


Development candidate, 2026-11-16. Supersedes the separate Research Notes/Explorer
window entry points. Reuses their existing controllers and all storage, search,
AI lifecycle, managed-note, repair and background-job services. Knowledge Network,
automatic cross-device metadata transport and Production Readiness PR11-PR14
remain deferred.

## Confirmed causes

**Inaccessible windows:** both published `open` handlers referenced an undeclared
`rootURI`. It is a parameter of bootstrap `startup`, not a module global; the
stored value is `Annota.rootURI`. Executing the actual modules from
`ResearchAnnotator-dev-20261116-085209-893.xpi` inside native Zotero 10.0.8 reproduced
`ReferenceError: rootURI is not defined` for both handlers before a dialog opened.
The old browser fixtures supplied arguments directly and therefore did not exercise
this native menu-to-window path.

**User content moving:** the shared engine previously removed all recognized
generated ranges and inserted the entire new compilation at the first range.
Retained user paragraphs then followed that whole compilation, rather than the
same neighboring annotation. This preserved text but not its research context.

Native smoke testing of the replacement also caught lifecycle/format details that
browser fixtures cannot establish: initial `about:blank` unload must not reject a
new window, child DOM events must not initialize the shell again, and separator
whitespace must not accumulate next to retained prose. These were fixed and tested.

## Workspace and toolbar

Tools now contains one **Research Workspace…** entry. Main-window toolbar buttons
are adjacent: **Research Workspace**, **Annotation Review**, **Research Chat**.
The first two have distinct small SVG icons; Chat keeps its existing icon,
controller, panes and shortcut. All three use equal dimensions, hover feedback,
accessible labels and independent command handlers. Per-window registration is
idempotent and shutdown removes owned integrations without deleting Chat state.

The workspace has four keyboard-accessible sections:

- **Explorer:** the existing search/filter/result/editing controller.
- **Notes:** the existing PDF/field/color/filtered generation, preview,
  configuration management, repair and restoration controls.
- **Saved Searches:** the existing Explorer saved-query controls.
- **Activity:** the existing Notes persistent-job view, including progress,
  failures, pause/resume/cancel and explicit paid-request recovery controls.

Explorer and Notes each mount once. Saved Searches reuses the Explorer document;
Activity reuses the Notes document. Switching sections hides/shows those mounted
views without recreating inputs, filters, drafts, previews or listeners. The shell
persists dimensions and the last selected section in a local, non-portable
`researchannotator.workspaceWindow` preference. A single service focuses/reuses
one workspace across Zotero main windows. The active main-window selection context
updates when another main window opens/focuses it; closing one main window does
not remove integrations from the others.

Explorer query transfer and managed filtered-note reopening route through the
same shell/controller APIs, without opening secondary dashboards or building
another generation pipeline. The central section-to-view registry is the future
extension point; it includes no Knowledge Network implementation or placeholder.

## Native opening and diagnostics

`research-workspace.js` registers a scoped chrome content package using the
installed Gecko add-on startup API. The native shell opens at
`chrome://researchannotator/content/research-workspace.xhtml`, with a proper XUL
window namespace. Its two controlled iframe documents are parsed as HTML via
`srcdoc`, so existing shared controls receive real HTML element interfaces rather
than namespace-less elements from XML `createElement`. Resources/scripts resolve
against the registered chrome base. Local resource text is read through Zotero's
HTTP resource API, not the deprecated file helper that returns an XHR for URIs.

The shell has an explicit controller-ready handshake, bounded initialization
timeout, frame error reporting and cleanup. Failures are logged with their stage,
resource base and stack and shown as an actionable native error dialog; view errors
also appear in the workspace. An initialization failure does not leave a stale
window that later commands mistake for a working instance. The chrome registration
is released on shutdown.

## Annotation-level note positioning

The existing shared engine now reconciles stable annotation identities, rather
than replacing one generated suffix. Both attribute-bearing source and normalized
editor HTML are recognized using source links, expected generated blocks and
labels. Publication headings have separate managed identities. Unknown content,
ordinary quotations, lists, tables and authored headings remain content rather
than being guessed away.

Position policy:

1. Content before the first recognized entry stays in the introduction.
2. Retained content after an entry, up to the next recognized entry, forms that
   entry's **user tail**. Content inserted between generated field fragments stays
   attached to that annotation after its refreshed entry. User blocks themselves
   remain in their original order and retain their supported internal markup.
3. Existing entries refresh at their identity slots. A new entry is inserted in the
   configured PDF/color/publication order after the preceding existing entry's
   user tail. Thus `H1, H2, user paragraph` becomes `H1, H2, user paragraph, H3` when
   H3 sorts last. Creation time does not override configured PDF reading order.
4. When sorting/grouping moves an existing entry, its user tail moves with it.
   Removing a group heading follows the same neighbor rule as removing an entry.
5. Deleting an annotation removes its generated fragments only. Its user tail goes
   to the nearest preceding surviving old entry, or to the introduction if none
   survives. With all annotations deleted, retained user content remains.
6. Generated boundary rules and empty presentation div boundaries reconcile with
   the entries. Only whitespace outside supported blocks is normalized; whitespace
   inside paragraphs/preformatted text and user content is retained. This prevents
   separator/newline growth in raw native HTML as well as normalized fixtures.

Genuine edits of generated fields retain the existing bounded preservation behavior;
recursive whole-document snapshots remain prohibited. Internal identity/completeness
metadata remains in supported link attributes. Stable native note keys, incomplete-
data guards, backup-first legacy repair and restoration are unchanged.

## Annotation Review

The toolbar calls the existing `AnnotaReview.startReview`; there is no second review
implementation. Review now selects annotations with **any** missing applicable
configured field, not only annotations where every field is empty. It reads the
structured store independently of native Comment. Explicitly saved unchecked
checkboxes count as completed; absent checkbox values remain missing. Empty text,
dropdown and multi-select values remain unfilled.

Shared lifecycle states distinguish missing, failed/cancelled, outdated and completed
AI values. Successful values remain visible and are not cleared during inspection.
Field-local Retry and explicit outdated regeneration reuse persistent generation
jobs; ordinary completion fills missing AI without automatic outdated regeneration.
The existing review/refill/undo, reading-order navigation and scope/color selection
remain. Multi-select reading uses the shared control's actual `readValues` API;
HTML elements in Zotero's XML main document are recognized by local name.

## Validation boundaries

The full preceding 226 cases are retained, including all repair/restore and
100-rebuild tests. Additional mocked and browser tests cover positioned rich
content, additions/edits/deletions, sort/group behavior, raw separator stability,
restart, review states, window diagnostics, idempotent integrations, multiple main
windows, tab state, query transfer and Activity visibility. Exact totals and hashes
are recorded in the new build inventory and TESTING.md.

Actual Zotero 10.0.8 was launched with `-no-remote` and a temporary profile/data
directory, synchronization/updates disabled. Only synthetic test publications,
a generated blank PDF and native annotations were created there. The native probe
reproduced both old rootURI errors and verified chrome shell/HTML views, controls,
retained search/title state, query transfer, toolbar/menu uniqueness, native review
overlay, independent Chat and cleanup. It also checked positioned prose and 100
byte-identical native note rebuilds with stable identity. Detailed reports are
retained as `NATIVE_WORKSPACE_VERIFICATION_*.json`; failed intermediate attempts
remain as diagnostic evidence, not accepted results.

This does not establish full acceptance on the owner's real library, paid providers,
all Zotero/OS versions, or every native note-editor normalization case. Test actual
editor save/reopen with rich positioned content, sorting/grouping/deletion, multiple
main windows, accessibility/themes, long-running job controls, repair/restore and
large-library latency before release. No production profile/data or installed
extension was changed, and no backups were deleted.

Final Unified Workspace candidate: `20261116-095828-245` (local verification artifact), ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-095828-245.xpi. **242 tests passed**, 0 failed/skipped; all 226 preceding cases retained. 32 packaged files byte-verified; 20 runtime and 5 test JavaScript files checked; four XHTML and three SVG files parsed as XML; git diff --check passed. `NATIVE_WORKSPACE_VERIFICATION_XPI.json` (local evidence: Native packaged-resource report) verifies Zotero 10.0.8 in the isolated synthetic-data profile, user positioning and 100 byte-identical native rebuilds (2436 characters each). Final mocked 15,000-record query: 1690 ms cold / 27 ms cached. Package SHA256: `eb043878551034d5854c457d55ed36026c7d2ed2f7e5c8919951aa0323a3805e`. Remaining owner-library/editor/provider/platform acceptance is listed above.

Validated integrated candidate: `20261116-175519-328` (local verification artifact). Packaged-XPI native selection evidence: `NATIVE_USABILITY_XPI.json` (local evidence: NATIVE_USABILITY_XPI.json), Zotero 10.0.8, success true. Mouse and native keyboard selections changed application state; light/dark opacity, dismissal, 60-option scrolling and retained state passed.

Retained-trigger candidate: `20261116-184638-320` (local verification artifact). All 266 regression tests pass. `NATIVE_AI_TRIGGER_XPI.json` (local evidence: Packaged native AI verification) passed in isolated Zotero 10.0.8 using real loopback HTTP requests, persistent jobs/storage and managed notes. `NATIVE_AI_PROVIDER_REQUESTS_XPI.json` (local evidence: Provider evidence): eight requests, two deliberate failures, explicit Retry in each mode; no hidden retry. Full PDF-reader gesture/provider acceptance remains outstanding.

Historical local reports/screenshots named above are retained privately and are not repository downloads. Public beta screenshots are in [the visual user guide](../user-guide.md).
