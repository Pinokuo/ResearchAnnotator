# Managed notes and Research Chat reliability — 2026-11-22

Baseline: ResearchAnnotator-dev-20261117-131627-077.xpi, 398 tests. This milestone makes targeted corrections; it does not redesign the working color layouts, search engine, AI field lifecycle, storage model or Network.

## Confirmed findings

| Report | Investigation and correction |
| --- | --- |
| Workspace generation changes highlight colors | The baseline native sequence did **not** change persisted source colors, Comments or Tags during generation. A separate, reproducible color-button failure saved the new color, then restored the old color only in Zotero's in-memory item when note synchronization failed. The PDF and checkmark disagreed. The save is now retained after commitment; the note failure is visible and independently retryable. |
| Annotation edits stop updating a PDF note | Workspace's generic default was Manual, and its PDF job applied that mode to the existing automatic PDF configuration. Native notifier events still arrived. New PDF requests default to Automatic; explicit Manual/Static choices remain valid and are explained. Existing modes are not silently converted at startup. |
| Deletion blocks regeneration | The former Delete action set Static and retained native ownership. Delete now preserves the mode and releases deleted-note ownership with a recoverable backup. Automatic notes regenerate after subsequent changes. Manual and Static remain deliberate policies. |
| All Notes instead of a publication | Normal By Publication generation had the correct publication parent in native baseline testing. All Notes is a view, not proof of standalone placement. Cross-publication notes may be standalone. Separately, a PDF batch-request configuration could be misused by simplified-default updates as a standalone note; this is now prohibited. Settings-only batch requests remain settings, and PDF notes retain PDF-specific identities. Incorrect legacy PDF placement is repaired with a backup and the same native key. |
| Keyword requires embeddings | A failed request retained its immutable semantic settings. Retrying after choosing Keyword could resume that old request. An explicitly approved retry with changed settings now creates a fresh request identity, retains the old attempt, and uses the corrected settings. Unchanged retries retain existing job recovery. Keyword never calls embedding APIs. |
| Raw note references and absent Capture | Optional note context could support generation when no PDF passage was retrieved. PDF/mixed mode now requires PDF evidence; note-only answering is explicit and labelled. Raw note keys are not PDF citations. Validated passage references become interactive citations, and a visible Capture Evidence button opens the existing preview workflow. Answers without validated PDF passages explain why capture is unavailable. |
| Invalid annotation API calls | Zotero Item methods exist on unsupported item types; checking whether getAnnotations exists was insufficient. Shared retrieval and inherited Review, Chat and citation paths now validate file-attachment types. Publication, note, collection and unavailable-file cases are handled without invoking invalid annotation APIs. |
| Operations need restart | Chat preflight/history failures could leave busy state set; failed history reads could retain a rejected initialization promise. Cleanup now includes preflight, history can be retried without overwriting an unreadable original, index/view failures do not poison later writes, and index recovery does not disable source-grounded Chat. Paid retries remain explicit. |

The original user's spontaneous persisted-color mutation, normal PDF parent corruption and lost-listener hypotheses were not reproduced. They must not be reported as confirmed causes. The in-memory color rollback, Manual/Static lifecycle behavior and retry snapshot problem were confirmed in code and focused tests.

## Managed-note safety

Titles never identify managed notes. Updates retain the native note key, annotation-level ownership and positioned authored content. Actual deletion necessarily permits a new native note key, while the stable configuration/PDF identity remains unchanged. The deleted original and recovery backup retain its authored content; deletion does not silently resurrect that text into a new note.

Orphan recovery distinguishes a trashed/deleted note from an unavailable item. An unavailable bound note without deletion evidence is protected: no replacement is created automatically. Management exposes explicit missing-note recovery with a warning to check Trash and sync first. Permanent managed-note deletion notifications record ownership-specific deletion evidence and do not masquerade as annotation deletions. Local ownership and backup pointers are excluded from portable configurations.

Legacy deleted configurations may say Static because of the former deletion policy. That is indistinguishable from a deliberate Static choice, so the extension does not guess. Use the new bulk mode preview to explicitly select Automatic where wanted.

Runtime note updates fail closed if shared infrastructure did not initialize. They do not fall back to an unprotected whole-note rewrite. Existing incomplete-data guards, rich authored content, ordinary quotations, repair/restoration and 100-rebuild tests remain authoritative. Update failures are visible in the popup or note management/Activity, with explicit retry. Error display state is local and is not exported as research data.

## Note presentation and identification

Generated native Comments are labelled **Comment**. Legacy Research comment labels remain recognized for reconciliation. Bold quoted passages, native 1.1em H2 sizing, annotation hyperlinks and separate semantic-color indicators remain. The visible **ResearchAnnotator** paragraph is outside the exact publication H1 title and survives ordinary note-editor markup.

Zotero does not provide a dependable per-note extension badge in its ordinary native item list through the integration used here. No title suffix, forced note tag or private item-tree patch is introduced. The supported alternative is a visible label in the note body, plus managed-note information in Workspace. Native title preservation and editor save/reopen are tested separately.

Toolbar buttons retain their independent identities/positions. Explicit packaged image attributes, native button classes and icon sizing restore their supported rendering. Color Management has a visible border; Ask ResearchAnnotator is centered. Color IDs, assignments and five layout geometry implementations are unchanged.

## Bulk modes and interface help

Bulk update-mode editing is separate from simplified content defaults. Select existing notes, choose Automatic/Manual/Static, preview affected titles and before/after modes, then confirm. The existing persistent job manager records progress, partial failures, cancellation and explicit resume. A backup precedes changes. Automatic refresh uses saved annotation/AI values and does not request AI. Destinations, native identities and authored content stay intact. Selection uses library-aware scope identities, including when PDF keys coincide between libraries.

Every main section has a short explanation below its heading. Contextual help covers scopes, filter logic, modes, destinations, relationships, suggestions, indexing, retrieval, capture and job actions. Existing meaningful tooltips remain; dynamic controls receive help within their own interface, without modifying native Zotero controls. See RELIABILITY_UI_HELP_AUDIT.md.

## Evidence and limits

Native testing uses the existing isolated Zotero profile, actual Gecko windows/controllers, controlled mouse/input events and compositor screenshots. The Windows desktop bridge remains unavailable (native pipe, OS error 2). These are native integration checks, not manual user acceptance.

The PEDOT test PDF is explicitly **synthetic software-verification data**, not a publication or clinical evidence. Its two known pages report 1000 to 250 ohms and 1 to 4 mC/cm^2; the independent fixture calculation is 75% lower impedance and fourfold capacity. Tests verify extraction, page locations, bounded retrieval, inline citation validation, actual highlight rectangles/text, shared fields and duplicate prevention. Native text trimming is expected; original words and coordinates must match.

A loopback-only simulated generation/embedding provider avoids paid/external requests. It verifies the Ollama-compatible /api/embed transport and separate embedding model configuration, not the quality or availability of an installed Ollama model. Real-provider scientific answer quality, the user's actual PEDOT corpus, other Zotero/platform versions and live group-library permissions remain separate acceptance checks.

Final package hashes, complete regression results and authoritative native report names are recorded in the development-build inventory and TESTING.md. Earlier harness attempts are retained and are not counted as successful final verification. No backups are deleted, unsafe release scripts run, commits made or pushes performed.


Explicitly opened citation/capture previews scroll into view and receive keyboard focus. Restoring a capture draft in the other Chat view does not move focus. Both behaviors are verified with real DOM views; native capture is confirmed through the actual preview controls.

Source coverage and the short Chat purpose remain visible before a question is submitted. An inherited CSS selector had hidden these new guidance paragraphs; the selector now explicitly retains them. Browser checks load the actual shared styles, and native checks require nonzero visible coverage bounds. Explicit note-only mode does not display an irrelevant embedding-model warning.

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
