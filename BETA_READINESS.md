# ResearchAnnotator first public beta

Publication note: consult the current README and GitHub Releases for availability. Private/draft descriptions in dated consolidation sections below are historical snapshots. This beta uses manual XPI updates; no feed change accompanies publication.

## Private documentation consolidation (2026-11-22)

The existing independent repository now consolidates the reviewed visual README, canonical docs/, optional Python advisor and same-repository feedback templates. The beta XPI and application identities/code remain unchanged; repository visibility and the existing draft release remain private/unpublished. See [consolidation status](docs/release/private-consolidation.md) and [update-feed proposal](docs/release/update-feed-proposal.md). Real local instruct-model and mapper checks supplement the previous beta evidence; no production readiness claim is made.

Proposed version: **2.43.0-beta.1**. The existing add-on ID, preferences, structured storage and managed-note markers are retained. Zotero requires an update URL. This beta uses a dedicated beta feed with an empty updates list; install later reviewed builds manually. The older development baseline is 2.42.0, so the beta version advances rather than downgrades installed development profiles.

## Confirmed causes and decisions

The native installer requires applications.zotero.update_url. The beta uses a dedicated empty feed rather than omitting this required property. Zotero accepts the labelled beta version; Gecko emits an advisory numeric-version-format warning.

A real upgrade also exposed an inherited Chat shutdown defect: the dual-view coordinator flushed history even when the authoritative in-memory list had never loaded. writeHistory now makes an unread/history-off flush a no-op and rejects unexpected history schemas rather than replacing them with an empty list. Existing messages still save after loading. Before upgrading an older development build, open Chat once and preserve a backup, because new code cannot protect an old version's shutdown before installation. An already empty file cannot be reconstructed without a backup.

- The preceding reliability milestone deliberately released deleted-note ownership while retaining Automatic mode. Scheduled PDF and cross-publication updates therefore recreated deleted notes. The beta requirement supersedes that policy: intentional deletion persists a management tombstone before trashing. Direct Zotero trash/permanent deletion is detected too. Stale generation jobs and subsequent annotation changes cannot reactivate it. Only explicit Recreate / Resume management clears the tombstone. Unavailable items without deletion evidence remain protected.
- Native tag loading is explicit before compilation and mapping snapshots: Zotero may cache a newly created annotation before its Tags data is available. This prevents transient update failures without dropping Tags or bypassing guards.
- Context-menu annotation batch actions were offered for notes even though notes contain no native PDF annotation children. These actions now hide for note-only selections. Note-capable reduction/spelling actions retain their existing implementation; errors are visible. Workspace and note-context Chat have explicit entry points. Unsupported items never reach getAnnotations.
- Settings contained no brand image element. The preferences view now loads its existing packaged icon96.png directly, with an opaque backing that works in light/dark schemes. Inline Rename, Up/Down, Archive/Restore and a visible multiplication-sign delete button replace the separate Color Management disclosure. Keyboard reorder remains available. Unused defaults as well as unused custom colors may be removed; the last active color and all data/configuration references stay protected.
- Reassign and Delete from Active Palette uses the established reassignment service. Referenced identities/definitions/values remain archived as recovery tombstones; this deliberately does not erase scientific history. Restore retains the stable color ID. Direct deletion requires confirmation and a fresh usage audit, including managed-note ordering/filter references.
- Per-note colorOrder contains stable palette IDs. PDF and cross-publication compilation use the existing compiler and positioned-content reconciliation. An explicit Apply or Reset performs one rebuild in Automatic, Manual and Static without changing the saved mode, identity, title, destination, inclusion settings or source links. Automatic behavior remains governed by its mode afterward. Publication groups stay intact; color order applies within each publication, with reading order as the tie-breaker. Authored blocks retain the existing reconciliation anchors when generated entries move.

Repeated native window reopening also exposed outer-size values being reused as inner-size dialog features. Workspace and expanded Chat now restore the saved outer dimensions after initialization; native reopen checks confirm stable dimensions.

## Bulk Highlight Color Mapper

Explorer > Bulk Actions > Map Highlight Colors uses the shared scope enumerator, persistent job manager and infrastructure recovery snapshots. Current PDF, selected PDF attachments, collection and library scopes stay in one library. Exact stored hex colors are the default; similar grouping is opt-in Euclidean RGB distance <= 24. It is a convenience grouping, not perceptual equivalence. Original hex values remain visible. Existing ResearchAnnotator assignments are excluded by default.

Scan displays original swatches/hexes, counts, PDFs, examples and existing semantic assignments. Choose target colors, exclude groups, preview, then confirm. Library scope receives an explicit library-wide confirmation. Every entry is checked again against its preview signature and library permissions. Journals reserve original colors and post-write ownership before changes. Interrupted prepared writes can be recognized without applying twice. Failed saves restore unsaved in-memory color; committed changes remain recoverable. Operations serialize through the shared infrastructure to avoid overlapping writes.

Only native annotationColor is changed. Native keys, Comments, Tags, global and historical color-specific values, AI values/provenance, Network relationships and source links are not rewritten. Values associated with a different stable color-field definition remain in their original historical bucket; recoloring does not reinterpret them as another field. No missing AI generation occurs; explicit Review/batch completion remains separate.

PDF-note notifications are suppressed during a recolor batch and refreshed once per affected PDF afterward, respecting note modes and deletion tombstones. Cross-publication refresh is coalesced through the existing scheduler. Activity supplies progress, pause, cancellation, failures and explicit resume. Mapping history and Undo survive restart in the same profile. Local journals and their jobs are excluded from portable research-data exports; recovery snapshots remain local. Undo restores only entries whose native content and structured record still match the saved post-write signature; newer edits become reported conflicts. It never deletes annotations or alters PDF bytes.

## Embedded PDF annotations

Editable Zotero annotations, including editable imported annotations, are processed. After native import their original provenance is not reliably distinguishable. Exposed annotationIsExternal items are counted and excluded. Embedded annotations that Zotero does not expose cannot be reliably enumerated here; their absence from a scan does not mean the PDF contains none.

Inspection of Zotero 10.0.8 PDFWorker.import shows that transfer can write modifiedBuf back to the source path. ResearchAnnotator therefore does not invoke it, offer an unverified import button, create overlapping replacements or write linked/Google Drive PDFs. The interface explains Zotero's Import Annotations workflow, advises using a copy and reviewing Zotero's confirmation, and offers a fresh scan afterward.

## Compatibility and remaining acceptance

Verified native environment: Windows, Zotero 10.0.8. Manifest compatibility retains Zotero 7–10, but versions 7–9, other Zotero 10 builds, macOS/Linux, live group-library permissions and remote/offline workflows require separate acceptance. Native PDF annotation APIs may expose external annotations as read-only; these are not recolored. Do not advertise unverified platforms as tested.

Chat needs an explicitly configured provider for generation. Keyword retrieval and local indexing need no embeddings. External generation/embedding providers receive the selected bounded context only after the existing initiation/consent flow. Local Ollama compatibility is tested using loopback fixtures, not the availability/quality of a user's installed model. No provider credentials or profile databases are release assets.

The desktop computer-use connection is unavailable (native pipe OS error 2). Native evidence comes from the isolated Zotero Gecko harness with controlled events and compositor screenshots, not manual OS acceptance. Prior synthetic-PDF/loopback limitations remain. Native note-list extension badges remain unsupported; a visible note-body label is retained.

Final artifact hashes, test counts, native report names and screenshot findings are recorded below. No critical lifecycle or data-integrity failure may be waived for publication.

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
