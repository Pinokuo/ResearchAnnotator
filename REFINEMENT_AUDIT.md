# Integrated refinement audit — 2026-11-17

This milestone supersedes earlier deferrals of color geometry, branding, English comments and toolbar icon styling. It preserves historical identifiers and data. It does not establish production acceptance on every Zotero/platform combination.

## Confirmed causes and changes

- Generic titles originated in compiler/configuration defaults, independently of stable managed identities. New PDF notes use the exact parent publication title. Multiple attachments retain separate identities and are distinguished by attachment information in management. Existing titles are preserved; Rename is explicit. Field, color, saved-search, question and relationship defaults use their context.
- Previously, regeneration replaced H1 titles. Regeneration now retains the actual title. Neither title changes nor Move create another managed identity.
- Semantic color and annotation hyperlink formatting were combined. Generated passages now use a separate colored square/semantic label, followed by a bold quoted annotation link. Native Zotero H2 supplies its supported 1.1em size. Comments and structured fields remain normal-sized.
- Zotero normalizes wrappers, links and color styles on editor save. When compiler output is unchanged and semantic content matches, regeneration retains the editor's exact saved HTML. Changed compiler output still reconciles normally. This avoids both unnecessary rewrites and hiding genuine annotation changes. Rich authored content, stable annotation anchors, incomplete-data guards, repair backups and restoration remain in place.
- Single Row had surplus spacing; Slanted used individual label lengths; Vertical used content-sized slots. Sizing now uses compact labels, longest-label uniform slanted dimensions and equal full-width vertical slots. Wrap and Stacked retain their prior geometry.
- The ordinary color form exposed legacy and raw controls. These are secondary disclosures; configured fields, color identity and Save remain primary. AI Generation Trigger remains conditional on AI fields and preserves Automatic/Manual preferences. Native Comment remains independent.
- Retrieval diagnostics previously lacked a durable record of retrieved versus supplied passages. Each answer now preserves the actual retrieval and fitted-context record, including failures. Diagnostics render this record without another provider request.

## Destination architecture

`note-presentation.js` shares title and placement policy between preview, generation and management. Non-PDF destinations support Default, Ask every time and Remember last, independently per stable library identity. Root library placement, collection membership and attachment to a regular parent item are distinct. Validation rejects unavailable/read-only destinations and another library; it never silently falls back from a saved invalid destination. PDF notes remain associated with their original PDF.

Existing notes retain their location during synchronization. Explicit Move validates, backs up HTML/configuration/placement, and moves the same native note. Settings portability includes destination preferences; restored references are validated before use. Cross-library Move requires a future explicit data migration and is deliberately unavailable.

## Inherited functionality decisions

| Component | Decision and reason |
| --- | --- |
| Legacy color-wide prompts | Deprecate with compatibility; retain stored values and Advanced access, use the shared field AI lifecycle. |
| Free-form AI Comment generation | Retain historical compatibility data; clarify descriptions. Structured AI never overwrites native Comment. |
| Popup headings and custom layouts | Move to Advanced; retain unique presentation capabilities. |
| Raw field schemas and variable references | Move to Advanced; preserve unsupported historical schemas and reference help. |
| Color management/reset/delete | Move to secondary management; keep archival and safe deletion rules. |
| Citation navigation | Retain and integrate; annotation navigation and validated Chat citations remain separate supported workflows. |
| Spell checking | Retain; no verified equivalent justifies removal. |
| Chat history | Retain shared history and compatibility serialization across both views. |
| Batch processing and Review | Integrate with existing jobs, structured storage and AI lifecycle; no competing implementation. |
| Listeners and polling | Retain pending a separately verified replacement; no speculative removals. |
| Persistent keys, filenames, migration markers and global APIs | Retain for compatibility; do not rename existing research data. |
| Upstream release paths | Replace active upstream branding/release targets; unsafe publication script now requires an explicit environment guard and was not run. |
| Attribution and licensing | Retain upstream authorship and MIT license; package LICENSE. |

## Branding and language audit

Runtime labels, menus, settings, logging prefixes and local icons use ResearchAnnotator. Internal `Annota*` APIs, DOM/CSS identifiers, `annota-*` historical data files and preference/migration aliases remain intentionally compatible. Historical backups, baseline verification artifacts and inherited user guide remain unchanged. README distinguishes the historical guide from current requirements. Attribution retains the upstream project name.

The lexical audit translated more than 1,200 JavaScript comments plus remaining CSS/XML comment text and French diagnostics. Intentional French localization, output-language names, bilingual retrieval vocabulary and historical input aliases remain. `REFINEMENT_CURRENT_LEXICAL_AUDIT.json` records no detected French source comments or visible inherited branding literals. Heuristic detection is supplemented by source review; it is not proof of perfect translation.

`REFINEMENT_REFERENCE_INVENTORY.json` enumerates remaining repository references and their retention categories, including historical artifacts. No backup was rewritten or removed.

## Verification and limits

See TESTING.md and the final development-build inventory for exact package hashes and test evidence. Source native report `NATIVE_UI_UX_REFINEMENT_SOURCE_7.json` passed 30 checks, including native note-editor save/reopen, 100 unchanged rebuilds before and after normalization, same-note moves and all five layouts in both native popup types. Editor quotation font ratio was 1.1. Screenshots showed readable light/dark notes, uniform slanted buttons and full-width vertical distribution. Final packaged verification is recorded separately.

Native automation uses an isolated Zotero profile, real windows, trusted mouse events where available and editor transactions; it is not manual user acceptance. The desktop automation bridge was unavailable. Browser tests complement native checks but do not replace them. No paid provider requests are needed for these refinements. Large-library and operating-system/theme/scaling combinations beyond the recorded matrix remain release verification work. No backups were deleted, and no commit or push was made.


## Final delivery evidence (2026-11-17)

Final package: ResearchAnnotator-dev-20261117-131627-077.xpi. All 398 regression tests pass, preserving the previous 372. This comprises 375 structured/service tests, 12 dual-view tests and 11 real-browser tests. See refinement-regression-final-delivery.txt. Runtime syntax: 28 files; XML: six XHTML and four SVG; diff and 46-file hash verification passed.

The exact final XPI passed 30 native refinement checks and 30 native shared-workflow checks in isolated Zotero 10.0.8 on Windows. Reports: NATIVE_UI_UX_REFINEMENT_FINAL_XPI.json and NATIVE_UI_UX_REFINEMENT_FINAL_WORKFLOWS_XPI.json. The two runs captured 39 native screenshots. The layout matrix also passed at 125% device scaling/dark mode. Chat used a local simulated provider; opening diagnostics created no additional job. PDF navigation was checked against actual fixture positions in both Chat views.

Native note save/reopen retained quotes, links, separate color indicators and 1.1 font ratio. One hundred consecutive builds were byte-stable before normalization and another hundred after normalization. Same-note destination moves retained content and created a backup. Automatic and Manual preferences both persisted.

Screenshot inspection found readable complete labels, compact Single Row, uniform Slanted and equal-width Vertical buttons. Wrap/Stacked retain their frozen baseline geometry. Settings and destination controls fit their tested windows. Native link colors follow Zotero theme defaults. The native title link tooltip can temporarily cover nearby content while focused; it is not stored visible management text. Expanded diagnostics scroll within the conversation at compact sizes.

Remaining release verification: additional operating systems/Zotero versions, native OS scaling beyond this Windows setup, live group-library permissions and broad representative personal-library acceptance. Group/read-only/library isolation are regression-tested with mocks; native placement checks used the isolated local library. No unsafe release script, commit, push or backup deletion occurred.


Final restart verification also passed 16 checks (NATIVE_UI_UX_REFINEMENT_FINAL_RESTART_XPI.json), for 76 native checks total. Persisted managed PDF identities, authored content, Chat sources/citations/capture journals, missing-embedding guidance and window/listener shutdown cleanup passed. The last source changes affected comments only: REFINEMENT_TRANSLATION_EQUIVALENCE.json confirms identical executable syntax trees across all 28 runtime JavaScript files. The expanded French-fragment audit is clean.
