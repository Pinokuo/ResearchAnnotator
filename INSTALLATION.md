# Install the beta

1. If upgrading from an older development build, open Research Chat once before installing so that its existing history is loaded; older builds could flush an unopened history as empty during shutdown. Back up your Zotero library and use ResearchAnnotator Data Management to export research data. Keep existing backups.
2. Download the XPI from the GitHub **pre-release**, not an inherited upstream update feed.
3. In Zotero, open Tools > Plugins (or Add-ons), choose Install Add-on From File from the gear menu, and select the XPI. Restart if Zotero requests it.
4. Open ResearchAnnotator settings. Confirm your existing colors, fields and Automatic/Manual triggers. The extension keeps its existing add-on ID and data keys.
5. Use Research Workspace, Annotation Review and Research Chat from their independent toolbar buttons or Tools > ResearchAnnotator.

The dedicated beta feed currently advertises no automated updates. Install subsequent beta XPIs manually. Windows/Zotero 10.0.8 is the native verified environment; other declared-compatible versions/platforms and group-library permissions remain unverified. See BETA_READINESS.md and TESTING.md.

PDF notes keep their original PDF association. Delete in Notes management stops management persistently; use Recreate / Resume management only when you want a deleted note back. Zotero Trash and recoverable ResearchAnnotator backups remain separate.

For color mapping, open Explorer > Bulk Actions > Map Highlight Colors. Scan, select targets, preview, confirm and monitor Activity. Mapping history supplies safe Undo, including after restart. Newer annotation/field edits are preserved as conflicts. The mapper never edits source PDFs; embedded/external annotations require the limitations described in BETA_READINESS.md.

Configure AI providers only if you want generation. Existing structured values, native Comments and keyword search remain separate. Review what is transmitted in RESEARCH_CHAT.md. Never include credentials in a bug report or research-data export.

## Reproduce a development package

Use a clean checkout, Node.js (verified with v24) and Windows PowerShell. Run `node --test tests/*.test.cjs`, then `./package-dev.ps1`. The script uses an explicit file allowlist, parses runtime JavaScript, checks the diff and verifies packaged bytes. Generated profiles, backups and reports are excluded. Do not use the inherited release scripts.
