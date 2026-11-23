# UI/UX consolidation delivery evidence

Final development XPI:
`ResearchAnnotator-dev-20261117-080817-709.xpi` (local verification artifact).
Baseline: 20261117-004427-283. Build inventory:
`DEVELOPMENT-BUILD-20261117-080817-709.json` (local verification artifact).

## Implementation

Research Chat now has a sidebar and a single expandable native window sharing the
existing conversation, source/retrieval settings, messages/citations, question and
capture drafts, capture operation results and job infrastructure. Closing/returning
does not restart requests. Existing local history persists drafts; writes are
serialized. Geometry is remembered. Sources and Chat settings replace the dense
initial controls. Keyword needs no embedding model; explicit semantic/hybrid
preferences retain actionable prerequisite warnings. Coverage is readable text.
Generate Note saves a cited answer without a new AI request.

Explorer emphasizes search and annotation text, with secondary result actions.
Notes separates five-step creation and contextual management/maintenance. Network
has focused sections and structured role rows backed by the existing role array.
Saved Searches and Activity retain their workflows. No new frontend dependency,
provider system, annotation engine or managed-note compiler was introduced.
The three toolbar buttons, Review, Automatic/Manual triggers and deferred
Production Readiness requirements remain.

## Checks and their limits

| Verification | Evidence | Result |
| --- | --- | --- |
| Full regression suite | ui-ux-regression-release.txt | 372 passed; 362 service/mocked cases and 10 real Edge fixtures; all original 356 retained |
| Exact XPI/native Zotero 10.0.8 | NATIVE_UI_UX_RELEASE_XPI.json | 26 checks passed; 37 trusted pointer interactions plus native Tab input |
| Exact XPI/restart and cleanup | NATIVE_UI_UX_RELEASE_RESTART_XPI.json | 14 checks passed; history, sources, citations, capture journal, geometry, missing-model warning and native cleanup |
| Package | ui-ux-release-package-results.txt | 43 files verified against source hashes; add-on identity unchanged |
| Static checks | TESTING.md | 27 runtime and 27 development/test scripts parse; 6 XHTML and 3 SVG documents parse; diff check passes |

The isolated profile loaded product resources from the exact final XPI's jar URI.
The bootstrap test wrapper is appended to the hash-matching product bootstrap;
the wrapper and all fixtures/reports are excluded from the XPI. The ordinary
Zotero profile was not used. The isolated instance quit after cleanup verification;
its loopback provider was stopped. Profiles, backups, earlier attempts and candidates
are retained. No commit or push occurred.

Native checks confirm citations open the known original fixture positions from
both views; the same capture preview/result reaches both views; confirmed capture
reuses existing matching annotations and makes no implicit AI request; and one
keyword answer survives expanding/closing the other view. Reopening does not queue
work. Both window and listener cleanup are verified. The loopback log contains four
Chat requests across successive source/candidate/final runs, with no embeddings or
external AI calls. Browser tests separately verify duplicate submit protection,
shared manual capture drafts, all five Notes steps and structured role persistence.
Native Notes interaction covers source/content/management entry points; full note
generation and arbitrary-PDF capture are not newly claimed by this UI-only run.

The computer-use skill was applied, but its native desktop pipe was unavailable.
Native interaction evidence therefore comes from Zotero window events/keyboard
input and its compositor, not a connected interactive desktop session. Reports
contain no extension UI errors. Host logs retain missing Zotero locale/spinner
warnings and, during the restart run, an unavailable localized bundled-update error
string. All application test checks completed; these host warnings are not claimed
fixed by this milestone.

## Screenshot inspection

All 22 screenshots in ui-ux-screenshots-release_xpi were opened and inspected.
Workspace content sizes are 1164 x 811 and 764 x 581; full Chat is 1104 x 801 and
684 x 611. Sidebar captures use a roughly 350-pixel Chat pane inside Zotero.
Additional light-mode Workspace captures are 984 x 721.

| Surface | Wide | Compact | Findings |
| --- | --- | --- | --- |
| Explorer | `ui-ux-screenshots-release_xpi/workspace-explorer-wide.png` (local evidence: wide) | `ui-ux-screenshots-release_xpi/workspace-explorer-compact.png` (local evidence: compact) | Wide search, readable cards, scoped selects fit; vertical results scroll |
| Notes | `ui-ux-screenshots-release_xpi/workspace-notes-wide.png` (local evidence: wide) | `ui-ux-screenshots-release_xpi/workspace-notes-compact.png` (local evidence: compact) | Four clear entry choices; advanced forms absent initially |
| Saved Searches | `ui-ux-screenshots-release_xpi/workspace-saved-wide.png` (local evidence: wide) | `ui-ux-screenshots-release_xpi/workspace-saved-compact.png` (local evidence: compact) | Existing empty list/actions retained; no clipping |
| Activity | `ui-ux-screenshots-release_xpi/workspace-activity-wide.png` (local evidence: wide) | `ui-ux-screenshots-release_xpi/workspace-activity-compact.png` (local evidence: compact) | Existing controls and wrapping retained; long history scrolls |
| Network | `ui-ux-screenshots-release_xpi/workspace-network-wide.png` (local evidence: wide) | `ui-ux-screenshots-release_xpi/workspace-network-compact.png` (local evidence: compact) | Focused sections; narrow list/detail stacks vertically |
| Full Chat | `ui-ux-screenshots-release_xpi/chat-full-wide.png` (local evidence: wide) | `ui-ux-screenshots-release_xpi/chat-full-compact.png` (local evidence: compact) | Composer/send fit; icons readable; citations and answer text wrap |
| Sidebar Chat | `ui-ux-screenshots-release_xpi/chat-sidebar-wide.png` (local evidence: wide) | `ui-ux-screenshots-release_xpi/chat-sidebar-compact.png` (local evidence: compact) | Expand, composer, source summary and secondary panels remain accessible |

Also inspected: chat-full-capture, chat-keyword-answer, network-questions-wide,
network-topics-wide, notes-content-compact, notes-management-compact,
workspace-notes-light and workspace-network-light. Borders, text and focus are
readable in the sampled light/dark views; controls are opaque. Native screenshot
inspection found and corrected composer width overflow and icon padding after the
first candidate. The final native bounds checks and dedicated narrow-CSS browser
regression protect those corrections.

## Remaining usability acceptance

- Long conversations, capture previews, management/job lists and expanded evidence
  role lists use vertical scrolling; a screenshot can show a partially scrolled
  record. Secondary provider footers intentionally ellipsize and remain subdued.
- Saved Searches retains the inherited Research Explorer heading, while its tab
  and fieldset clearly identify Saved Searches. Its workflow was deliberately kept.
- Compact sidebars have limited conversation height when source/settings panels
  are expanded. Close those panels or use Expand for longer evidence work.
- This is not a screen-reader audit, a full multi-monitor/DPI/platform matrix or
  a large native-library performance campaign. Light/dark Workspace samples and
  dark Chat samples were inspected; manual theme switching across all Zotero/window
  combinations still needs acceptance testing.
- Varied real PDFs, fresh highlight creation on those PDFs, full native guided
  generation, deep keyboard-only flows and extended cancellation/retry usage remain
  live acceptance work. Existing baseline native evidence and regression safeguards
  are preserved; this report does not substitute browser mocks for those scenarios.
- Final icon styling, complete rebranding, English codebase standardization and
  the deferred color-layout geometry are still Production Readiness work.

Design decisions and navigation: [UI_UX_DESIGN.md](UI_UX_DESIGN.md).

Historical local reports/screenshots named above are retained privately and are not repository downloads. Public beta screenshots are in [the visual user guide](../user-guide.md).
