## Public beta milestone (2026-11-22)

The 2.43.0-beta.1 milestone supersedes the prior deletion-regeneration policy: intentional managed-note deletion persists a management tombstone until explicit Recreate / Resume management. Add inline palette actions and packaged logo; per-note color order with explicit one-time rebuilds in all modes; previewed native highlight color mapping with persistent jobs, recoverable journals and conflict-aware Undo. Preserve structured data and PDF bytes; never import embedded annotations automatically or generate AI during mapping. See BETA_READINESS.md, INSTALLATION.md and CHANGELOG.md for current behavior and compatibility.

## Reliability milestone update (2026-11-22)

Each main Workspace tab and Chat now has a short purpose description and scoped contextual help. Notes offers a scrollable multi-note update-mode selection, before/after preview, confirmation and Activity failures, separately from simplified-default replacement. Color Management has a border; Ask ResearchAnnotator is centered; explicit native toolbar image attributes preserve three independent buttons. Existing layouts and user-selected metadata settings remain. See RELIABILITY_UI_HELP_AUDIT.md.

## Integrated refinement update (2026-11-17)

Integrated refinement keeps ordinary color editing focused on identity, fields, conditional Automatic/Manual trigger and Save. Legacy/raw/destructive controls are secondary. Layout/order remain expanded. Native Comment is independent; empty-field help no longer promises legacy free-form AI Comment generation. Notes retain guided creation and contextual title/destination management; Chat diagnostics are secondary. See REFINEMENT_AUDIT.md.

# Unified Research Workspace usability update

## Dedicated UI/UX consolidation follow-up (2026-11-17)

Option C is implemented: sidebar Research Chat plus one shared full-size window.
Notes now has separate creation/management, Explorer emphasizes search and
annotation text, and Network has focused sections with structured evidence roles.
Advanced Chat settings are secondary; missing embedding prerequisites are
explained while keyword remains the default. See UI_UX_DESIGN.md for the new
navigation and UI_UX_VERIFICATION.md for exact-package runtime/screenshots.

The prior Automatic/Manual AI Generation Trigger decision is unchanged. Review,
Chat/Capture Evidence consent, note safeguards and inherited functionality remain.
Complete branding, English standardization and color-layout geometries are still
Production Readiness work; the inherited-functionality backlog is retained.


## Grounded Chat milestone corrections (2026-11-17)

Source/Page in existing notes can result from preserved explicit configurations; missing metadata flags also previously enabled compiler output. New defaults are explicit and minimal. A selected, previewed and confirmed batch action updates old content settings and notes through the shared engine with backup, identity/positioning/repair/guards preserved. Static snapshots remain protected. Highlight Colors, Global Fields, Color Label Layout and Research Note Order now have separate visible boundaries, with layout/order permanently expanded and all geometry unchanged.

Notes opens with By Publication/By Field/By Color/From Saved Search and guided scope/content/preview/generation; existing-note actions are contextual. Network has Relationships/Topics/Research Questions and secondary AI/type controls. Explorer/Saved Searches/Activity are preserved. Chat uses its existing toolbar/sidebar with explicit sources, grounded conversation, interactive citations and contextual Capture Evidence. The useful Automatic/Manual setting remains; capture requires its own explicit AI checkbox to avoid surprise requests. Remaining Production Readiness audits stay deferred. [Workflows and limits](RESEARCH_CHAT.md).


## Owner decision: AI Generation Trigger retained (2026-11-16)

This decision supersedes the earlier trigger-removal audit. That audit was incorrect: automatic creation-time AI was already active; the defect was that it ignored saved Manual preferences. Creation also called the generator directly rather than scheduling a persistent shared job.

AI Generation Trigger now controls creation policy per highlight color (and its separate area configuration). Automatic queues only missing AI fields after independent manual persistence. Manual saves the same annotation/manual values and queues no AI until an explicit request. The default remains Automatic when no preference was saved. Global-only AI definitions also honor the per-color preference without needing a local prompt or field. Existing values survive trigger changes; setting a color to Automatic does not backfill historical annotations.

Generate AI Fields appears for Manual annotations with ungenerated fields, once a saved annotation exists; Automatic annotations have no redundant generation button. Both modes retain Retry immediately below failed fields. Popup, sidebar and Explorer use the same lifecycle/storage/jobs; failures retain successful sibling values. Explicit historical/batch processing remains available independently of the creation trigger. Instruction changes mark provenance outdated but never automatically regenerate saved values. Reopening or restarting does not initiate paid work.

Persistent job identities deduplicate requests; completed values are skipped before queuing and checked again by the worker. Explicit Retry can resume a failed job, while automatic processing does not resume ambiguous failures. Native testing exposed Zotero.HTTP.request's own automatic 429/5xx retries; shared AI calls now set errorDelayMax=0 and noRetryOnThrottle=true. The persistent job manager alone owns bounded retry of positively rejected rate limits. Ordinary Chat/provider request behavior is unchanged.


This work belongs to Unified Research Workspace, before Knowledge Network. It
does not implement the Production Readiness color geometry, complete rebranding,
codebase translation or final icon styling requirements.

## Confirmed causes and decisions

Selecting an AI field initially produces an incomplete definition without an
instruction. The palette validator rejects that definition. Previously the type
handler saved before rendering, so the exception prevented the instruction editor
from appearing. The shared editor now renders before saving and handles both
selection input and change, with a guard against duplicate handling. Invalid color
drafts show a save diagnostic and retain the previous valid stored configuration.
Global definitions already had a visible validation boundary. Instructions are
retained by stable field identity in a settings draft preference when switching
away from AI, including across preferences reopening. Annotation values are never
rewritten by the settings editor.

The workspace XUL shell omitted Gecko global and Zotero window styles. In isolated
Zotero 10.0.8, the old packaged build opened a native ContentSelectDropdownPopup
with transparent background; actual mouse input on an option left both the select
value and its conditional UI unchanged. Loading those native styles restored real
selection with the existing controller. An explicit Canvas/CanvasText popup
background supplies opaque theme-aware colors. Native select menus retain Gecko's
keyboard, scrolling, focus, dismissal and popup layering rather than introducing a
parallel dropdown implementation. See the native reports and TESTING.md for exact
verification boundaries.

## Color settings inventory

| Control | Decision and reason |
| --- | --- |
| Semantic color name, picker, hex value, Save Color | Retained together as color identity controls. These update the palette's stable identity and support explicit handling of existing highlights. |
| Field label/type, order, formatting and deletion | Retained in the shared editor; choice lists appear only for select/multiselect and model instructions only for AI. |
| Highlights / Areas | Retained: these are distinct configurations, including image/table annotations. |
| Extra popup heading and current color caption | Relocated to Advanced popup heading. The optional heading is distinct from the palette semantic label; existing overrides remain editable. |
| Color-wide prompt, custom layout and variable reference | Relocated to Advanced legacy prompt and layout. Imported settings and the explicit AI response adapter still use these; none are discarded. |
| Raw field schema and type/format reference | Retained as secondary editing/reference interfaces. They support definitions the visual editor cannot safely interpret. |
| AI Generation Trigger | Restored by explicit owner decision. Automatic and Manual are visible only when the color/area configuration has a Written by AI field, including global fields. Saved auto/manual values are retained and consulted by shared creation scheduling. This is useful functionality, not an obsolete control. |
| Up/Down, Archive/Restore | Relocated to Color management. Reordering also remains available by dragging or keyboard on the summary handle. |
| Delete Color, reassignment/archive safeguards | Retained; no deletion eligibility or confirmation changes. |
| Reset this color | Retained; its existing distinct reset action remains available. |
| Legacy swatch row and semantic-label bridge | Remain hidden compatibility bindings, not duplicate visible controls. |
| Color Label Layout / Research Note Order | Permanently expanded; all five layout choices and both ordering options retained. Geometry unchanged. |

## Note presentation and migration policy

New PDF notes default to semantic label, numbered linked annotation, populated
native Comment and populated global/color fields. Title/authors/year/source/page
labels and Tags are optional and off by default. Empty AI values are omitted from
notes when Omit empty fields is enabled; ordinary annotation interfaces retain AI
labels and Not generated yet placeholders. Annotation navigation still contains
the necessary source/page destination even when a visible page label is omitted.

Cross-publication configurations default to publication metadata in one managed
heading per publication group. Each annotation retains its own link. Ungrouped
compilation can still display metadata per entry. Existing inclusion booleans,
including false, remain authoritative. Legacy configuration provenance cannot
reliably distinguish an explicit choice from an old default; no guessed migration
overwrites those choices.

To simplify an existing note, choose Edit configuration, Use simplified content
defaults, Preview, Save configuration, then Update. This changes the existing
configuration and note identity through the shared compiler/reconciler. It does
not alter native annotations, structured values, repair backups, user paragraphs
or incomplete-data protection. All prior repair, positioning, normalization,
restart and 100-rebuild regression cases remain.

## Workspace hierarchy

Explorer keeps Search, Save Search and Generate Research Note prominent. Scope,
active filter chips and results remain visible; filter construction and
sort/group/display controls use secondary disclosures. Saved Searches uses a
browsable list with selected-configuration actions; duplication operates on that
selection rather than an unrelated current query. Notes separates Create notes
from Manage existing notes and places content/configuration settings in a
secondary section. Activity shows active/actionable jobs first and completed or
cancelled history separately; detailed failure/recovery payloads are secondary.
Existing controllers remain mounted and retain state across all four sections.

Tools contains a native ResearchAnnotator submenu with Research Workspace,
Annotation Review and Research Chat. The three adjacent independent toolbar
buttons and their existing cleanup remain. Review, Chat, search, notes, AI,
storage, repair and jobs continue using the existing implementations.

Validated integrated candidate: `20261116-175519-328` (local verification artifact). Packaged-XPI native selection evidence: [NATIVE_USABILITY_XPI.json](NATIVE_USABILITY_XPI.json), Zotero 10.0.8, success true. Mouse and native keyboard selections changed application state; light/dark opacity, dismissal, 60-option scrolling and retained state passed.

The five future enhancements remain deferred in Production Readiness PR15 (FEATURE_BACKLOG.md, REQUIREMENTS.md and ROADMAP.md): safe bulk simplified-default application with preview, color-wide prompt audit, popup-heading/layout audit, contextual-help evaluation and removal only after unique capabilities/history are protected. None is implemented here.

Retained-trigger candidate: `20261116-184638-320` (local verification artifact). All 266 regression tests pass. [Packaged native AI verification](NATIVE_AI_TRIGGER_XPI.json) passed in isolated Zotero 10.0.8 using real loopback HTTP requests, persistent jobs/storage and managed notes. [Provider evidence](NATIVE_AI_PROVIDER_REQUESTS_XPI.json): eight requests, two deliberate failures, explicit Retry in each mode; no hidden retry. Full PDF-reader gesture/provider acceptance remains outstanding.
