# ResearchAnnotator beta

First public beta candidate: **2.43.0-beta.1**. See [Installation](INSTALLATION.md), [Beta readiness and known limitations](BETA_READINESS.md) and [Changelog](CHANGELOG.md). Verified native platform: Windows/Zotero 10.0.8. Other declared-compatible versions/platforms and group-library permissions remain unverified.

for Zotero

ResearchAnnotator combines PDF annotation, manual and AI structured fields, managed research notes, local research search, evidence relationships and source-grounded Chat inside Zotero.

Open Research Workspace from Tools or the toolbar. Explorer searches annotations and fields; Notes offers guided creation and management; Saved Searches retains query configurations; Activity shows persistent jobs; Network manages relationships, topics and research questions. Annotation Review and Research Chat remain separate toolbar actions. Chat works in a sidebar or a shared full-size window.

## Annotation fields and AI

Configure semantic colors, manual fields and Written by AI fields in ResearchAnnotator settings. Automatic generates missing AI fields when an annotation is created; Manual requires Generate AI Fields. Failed fields expose Retry. Completed AI results, manual values, native Comments and Tags are not overwritten by ordinary generation. Explicit historical/batch workflows remain available. Color-wide prompts, popup headings, schemas and output layouts remain secondary compatibility controls.

The five color layouts are Single Row, Wrap, Stacked, Slanted and Vertical. Layout and Research Note Order remain visible settings. Field definitions and stable color identities are separate from their displayed names and hex values.

## Research notes

PDF notes default to the parent publication's exact title and remain associated with their original PDF. Multiple attachments retain independent managed identities. Other defaults use field/value, semantic color, saved search or Network context. Existing titles and locations are preserved unless explicitly renamed or moved. Non-PDF destinations support library root, collection membership or a child note of a publication in the source library, with Default, Ask every time and Remember last policies. Preview before generating.

Generated quotations are bold, linked to their annotations and visually separated from semantic color indicators. Native Comments and structured fields follow below. Rich authored content, annotation-level positioning, incomplete-data protection, snapshot repair and restoration remain shared infrastructure.

## Source-grounded Chat

Choose sources and index PDFs locally, then ask a question. Keyword retrieval needs no embeddings. Semantic/hybrid retrieval is optional and requires separate configuration and explicit transmission consent. Interactive citations open validated original evidence; Capture Evidence previews exact source passages before creating or reusing native highlights. Optional retrieval diagnostics explain coverage, selected evidence and failures without another AI request.

Supported providers reuse the existing configuration: OpenAI-compatible APIs (including Mistral), local Ollama-compatible endpoints, Claude Code CLI and Apple Intelligence where the host supports them. Local indexing itself makes no provider request. Review the existing privacy and provider limitations in [RESEARCH_CHAT.md](RESEARCH_CHAT.md).

## Installation and development

Use the beta pre-release XPI, or a development XPI generated with package-dev.ps1, then Zotero Add-ons / Install Add-on From File. Development artifacts do not imply production acceptance. [TESTING.md](TESTING.md) distinguishes service tests, real-browser tests and isolated Zotero verification. Never use inherited release automation for ordinary development; it can publish or push and requires a separate reviewed release decision.

[ARCHITECTURE.md](ARCHITECTURE.md), [REQUIREMENTS.md](REQUIREMENTS.md), [FEATURE_BACKLOG.md](FEATURE_BACKLOG.md) and [ROADMAP.md](ROADMAP.md) describe the current implementation and remaining work. [REFINEMENT_AUDIT.md](REFINEMENT_AUDIT.md) records this milestone, compatibility and verification. [INHERITED_USER_GUIDE.md](INHERITED_USER_GUIDE.md) preserves historical upstream documentation, including citation navigation and macOS spelling features; superseded behaviors are not current requirements.

## Attribution and license

ResearchAnnotator derives from Annota by Elliot Quiriconi. Upstream attribution and the original copyright are preserved in [LICENSE](LICENSE), included in the packaged extension. Compatibility globals, historical preference/data names and migration markers remain intentionally stable; see the refinement audit. No historical research values are removed by rebranding.
