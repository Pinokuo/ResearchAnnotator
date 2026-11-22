ResearchAnnotator 2.43.0 beta 1 integrates structured annotation fields, managed research notes, Explorer, Review, Knowledge Network and source-grounded Research Chat with validated citation capture.

This candidate adds persistent intentional note deletion, per-note ordering, inline color management and recoverable bulk highlight color mapping. Recoloring preserves native content and structured research data and does not write PDF files or request AI.

Install the XPI through Zotero's Plugins/Add-ons manager. Existing ResearchAnnotator identities and data keys are retained. The dedicated beta feed advertises no automated updates. Back up your library and export research data before beta testing.

Native verification is limited to Windows/Zotero 10.0.8. Other declared-compatible versions/platforms and group-library permissions remain unverified. Embedded/external PDF annotations are excluded from recoloring; no automatic import or overlapping highlights are created. AI generation requires user-configured providers; keyword retrieval does not require embeddings.

See INSTALLATION.md, BETA_READINESS.md and TESTING.md for workflows, safeguards and verification limits. This is a pre-release, not a claim of production readiness.

Verification: **465 passing regression tests** and **167 native assertions** on isolated Windows/Zotero 10.0.8, including actual installation, unread-history shutdown, 200 unchanged note rebuilds, permanent deletion and undo after restart.

SHA-256: `0ee254179983a77cbd1c784da06b15fd0d5ea4ff437c3acbdc241a379947652e`.

Before upgrading an older development build, open Chat once and preserve a backup; this beta fixes an inherited unopened-history shutdown bug, but cannot retroactively protect old code before installation.
