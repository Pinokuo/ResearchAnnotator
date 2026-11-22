# Changelog

## 2.43.0-beta.1 — first public beta candidate

- Restore the packaged settings logo and inline color-management controls.
- Persist intentional managed-note deletion across updates, jobs and restart; provide explicit recreation.
- Hide annotation-only context actions on notes and expose Workspace/note-context Chat with visible failures.
- Apply per-note color-group ordering through existing reconciliation, including explicit one-time Static rebuilds.
- Add previewed, recoverable native highlight color mapping with optional similar-color grouping, library isolation and conflict-aware Undo.
- Preserve Comments, Tags, structured values, AI provenance, Network references and source PDF bytes; suppress implicit AI during mapping.
- Explain embedded/external PDF limitations and avoid invoking Zotero's potentially file-writing annotation-transfer path.
- Preserve source-grounded Chat, Capture Evidence, Review, Explorer, Notes, Network and Automatic/Manual AI triggers.

See BETA_READINESS.md for causes, compatibility and final verification evidence. Earlier milestone audits document the development history; deletion-regeneration behavior in RELIABILITY_AUDIT.md is superseded by this beta's explicit-deletion policy.

Verified candidate: 465 passing regressions and 167 native assertions; real Zotero installation, unread-history shutdown, permanent deletion and restart/Undo passed. See BETA_READINESS.md.
