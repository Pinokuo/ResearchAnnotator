# Reorganization path inventory

The root is reduced from 91 to 15 tracked entries. Runtime moves preserve all published member bytes; documentation links and test/packaging source paths are updated. The full testing guide moves while its root compatibility page remains. Existing public guides and screenshot URLs stay unchanged.

| Previous path | Current path |
|---|---|
| `ARCHITECTURE.md` | `docs/development/ARCHITECTURE.md` |
| `BETA_READINESS.md` | `docs/development/BETA_READINESS.md` |
| `BETA_RELEASE_NOTES.md` | `docs/release/2.43.0-beta.1.md` |
| `BUGS.md` | `docs/development/BUGS.md` |
| `CONTRIBUTING.md` | `.github/CONTRIBUTING.md` |
| `DATA_INFRASTRUCTURE.md` | `docs/development/DATA_INFRASTRUCTURE.md` |
| `FEATURE_BACKLOG.md` | `docs/development/FEATURE_BACKLOG.md` |
| `INHERITED_USER_GUIDE.md` | `docs/history/INHERITED_USER_GUIDE.md` |
| `INSTALLATION.md` | `docs/history/INSTALLATION-redirect.md (canonical guide remains docs/installation.md)` |
| `MANAGED_NOTE_REPAIR.md` | `docs/development/MANAGED_NOTE_REPAIR.md` |
| `PROMPT-EXAMPLES.txt` | `docs/examples/PROMPT-EXAMPLES.txt` |
| `REFINEMENT_AUDIT.md` | `docs/development/REFINEMENT_AUDIT.md` |
| `RELIABILITY_AUDIT.md` | `docs/development/RELIABILITY_AUDIT.md` |
| `RELIABILITY_UI_HELP_AUDIT.md` | `docs/development/RELIABILITY_UI_HELP_AUDIT.md` |
| `REQUIREMENTS.md` | `docs/development/REQUIREMENTS.md` |
| `RESEARCH_CHAT.md` | `docs/development/RESEARCH_CHAT.md` |
| `RESEARCH_EXPLORER.md` | `docs/development/RESEARCH_EXPLORER.md` |
| `RESEARCH_KNOWLEDGE_NETWORK.md` | `docs/development/RESEARCH_KNOWLEDGE_NETWORK.md` |
| `RESEARCH_NOTE_GENERATION.md` | `docs/development/RESEARCH_NOTE_GENERATION.md` |
| `RESEARCH_WORKSPACE.md` | `docs/development/RESEARCH_WORKSPACE.md` |
| `ROADMAP.md` | `docs/development/ROADMAP.md` |
| `SHA256SUMS.txt` | `docs/release/2.43.0-beta.1/SHA256SUMS.txt` |
| `SYNCHRONIZATION.md` | `docs/development/SYNCHRONIZATION.md` |
| `TESTING.md` | `docs/development/TESTING.md` |
| `UI_UX_DESIGN.md` | `docs/development/UI_UX_DESIGN.md` |
| `UI_UX_VERIFICATION.md` | `docs/development/UI_UX_VERIFICATION.md` |
| `WORKSPACE_USABILITY.md` | `docs/development/WORKSPACE_USABILITY.md` |
| `annotation-review.svg` | `src/annotation-review.svg` |
| `bootstrap.js` | `src/bootstrap.js` |
| `build.sh` | `scripts/legacy/build.sh` |
| `card-fields.js` | `src/card-fields.js` |
| `chat.js` | `src/chat.js` |
| `chat.svg` | `src/chat.svg` |
| `citelink.js` | `src/citelink.js` |
| `color-mapper.js` | `src/color-mapper.js` |
| `data-manager.js` | `src/data-manager.js` |
| `demo.gif` | `docs/history/assets/demo.gif` |
| `evidence-capture.js` | `src/evidence-capture.js` |
| `i18n.js` | `src/i18n.js` |
| `icon32.png` | `src/icon32.png` |
| `icon48.png` | `src/icon48.png` |
| `icon96.png` | `src/icon96.png` |
| `infrastructure.js` | `src/infrastructure.js` |
| `make-updates.py` | `scripts/legacy/make-updates.py` |
| `manifest.json` | `src/manifest.json` |
| `note-presentation.js` | `src/note-presentation.js` |
| `package-beta.ps1` | `scripts/package-beta.ps1` |
| `package-dev.ps1` | `scripts/package-dev.ps1` |
| `palette.js` | `src/palette.js` |
| `preferences-data.js` | `src/preferences-data.js` |
| `preferences.css` | `src/preferences.css` |
| `preferences.js` | `src/preferences.js` |
| `preferences.xhtml` | `src/preferences.xhtml` |
| `prefs.js` | `src/prefs.js` |
| `release.sh` | `scripts/legacy/release.sh` |
| `research-chat-ui.js` | `src/research-chat-ui.js` |
| `research-chat-window-host.js` | `src/research-chat-window-host.js` |
| `research-chat-window.js` | `src/research-chat-window.js` |
| `research-chat-window.xhtml` | `src/research-chat-window.xhtml` |
| `research-chat.css` | `src/research-chat.css` |
| `research-chat.js` | `src/research-chat.js` |
| `research-explorer-workspace.js` | `src/research-explorer-workspace.js` |
| `research-explorer.js` | `src/research-explorer.js` |
| `research-explorer.xhtml` | `src/research-explorer.xhtml` |
| `research-network-workspace.js` | `src/research-network-workspace.js` |
| `research-network.js` | `src/research-network.js` |
| `research-network.xhtml` | `src/research-network.xhtml` |
| `research-notes-dashboard.js` | `src/research-notes-dashboard.js` |
| `research-notes.js` | `src/research-notes.js` |
| `research-notes.xhtml` | `src/research-notes.xhtml` |
| `research-settings.svg` | `src/research-settings.svg` |
| `research-ui.css` | `src/research-ui.css` |
| `research-workspace-window.js` | `src/research-workspace-window.js` |
| `research-workspace.js` | `src/research-workspace.js` |
| `research-workspace.svg` | `src/research-workspace.svg` |
| `research-workspace.xhtml` | `src/research-workspace.xhtml` |
| `review.js` | `src/review.js` |
| `spell-live.js` | `src/spell-live.js` |
| `spell.js` | `src/spell.js` |
| `.github/workflows/release.yml` | `scripts/legacy/release-workflow.yml` |

The inherited installation redirect is retained as history; current installation instructions remain in the canonical guide. See [build and verification decisions](REPOSITORY_STRUCTURE.md).
