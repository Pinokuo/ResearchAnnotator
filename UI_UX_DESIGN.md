# Workspace and dual-mode Chat design

## Scope and navigation

The UI/UX consolidation milestone starts from development build
20261117-004427-283 and its 356 regression cases. The supplied detailed requirements
are the design reference; the original conversation screenshots were unavailable.
There are still three independent Zotero toolbar buttons: Workspace, Annotation
Review and Research Chat. Workspace retains Explorer, Notes, Saved Searches,
Activity and Network. Chat has a sidebar and a separate resizable native window.
No new primary workspace tab or frontend framework is introduced.

## Shared visual system

System fonts, a clear heading hierarchy, eight-pixel spacing increments, consistent
inputs, opaque Field/FieldText selects, native light/dark colors and visible keyboard
focus form the common visual language. Wide layouts use list/detail columns;
narrow layouts stack content and scroll vertically. Secondary controls use native
details/summary elements. Each creation/search workflow has one primary action.
research-ui.css styles the embedded Workspace views. research-chat.css scopes its
controls to Chat so loading it into Zotero does not restyle annotation controls or
other Zotero interfaces. Final icons, complete rebranding and the five deferred
color-layout geometries remain Production Readiness work.

## Two Chat views, one conversation

research-chat-window.js coordinates views around the existing AnnotaChat
conversation object. Expand opens or focuses one native window; Return to sidebar
focuses the same conversation and closes the expanded view. Closing a view does
not cancel or restart its request. New/history selection propagates between views
of the same Zotero owner; separate main-window contexts remain independent.
Message updates, validated citation snapshots, source scopes, retrieval settings,
question drafts and capture previews share that conversation. Capture operation
and job identities are shared with both views. Persistent jobs and the existing
request/operation deduplication remain the authority for running work.

Question and manual capture drafts live in conversation uiState and use the
existing local Chat history preference and file. History writes are serialized
through the shared infrastructure. There is no second conversation store or
provider configuration. Window dimensions and coordinates use a separate local
preference, with bounded dimensions. Placement remains subject to the OS/window
manager, especially when displays change.

The primary surface contains source selection, human-readable coverage, messages,
interactive citations and the question composer. Sources opens a paginated PDF
manager with explicit states and local indexing. Optional embedding indexing is
secondary. Chat settings contains retrieval budgets, embedding configuration and
optional research context. Generate Note saves the selected answer and its
citations through the inherited note-saving service without an AI request.
Capture Evidence retains preview, consent, conflict handling and recoverable jobs.

Keyword is the default when no retrieval choice has been saved, regardless of
embedding configuration. An explicitly selected semantic/hybrid mode is retained;
missing model or transmission approval produces an actionable warning. Existing
retrieval validation blocks requests that lack prerequisites. Indexing does not
implicitly enable embeddings. Chat generation models remain separate.

## Workspace workflows

Explorer leads with a wide search field and Search action. Result actions contains
Save Search, note generation and Network transfer. Cancel appears only while a
search is running. Cards foreground annotation text; publication/color/page are
secondary metadata. Query, filtering, paging and saved-search services are reused.

Notes separates Create a note from Manage existing notes. Creation follows Type,
Sources, Content, Preview and Generate. Publication, field, color and saved-query
entry points preserve existing modes; Explorer/Network handoffs enter Content.
Content and AI settings are collapsed. Existing-note actions remain contextual;
snapshot repair/restoration is under Maintenance and repair, and batch defaults
remain a secondary management panel. No compiler, identity, reconciliation or
incomplete-data behavior is changed.

Network keeps Relationships, Topics and Research Questions. Lists occupy the left
column and selected content the remaining width. Questions open in a detail editor;
evidence roles are individual editable/removable rows in a secondary panel, stored
as the existing array rather than splitting punctuation. Graph expansion, AI
suggestions and relationship-type management remain secondary. Existing evidence,
relationship revisions, topics, question identities and approval logic are reused.
Saved Searches and Activity retain their mounted controllers and workflows.

## Verification and limits

See TESTING.md and the native UI/UX report for final package evidence. Native
compositor screenshots represent Zotero rendering rather than browser mockups.
The desktop-control bridge was unavailable; isolated native window events and
keyboard input provide runtime interaction evidence. Browser fixtures separately
check DOM workflows and compact overflow. Long conversations, source lists,
Activity history and maintenance lists intentionally scroll. This is functional
consolidation, not final branding or visual polish. Screen-reader review, unusual
display scaling/multiple-monitor placement and a broad platform matrix remain
manual acceptance work.
