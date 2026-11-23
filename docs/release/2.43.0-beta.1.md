# ResearchAnnotator 2.43.0-beta.1

First public beta for structured literature research inside Zotero: semantic highlights, manual/AI fields, Annotation Review, managed research notes, Explorer, saved searches, persistent jobs, Knowledge Network and source-grounded Research Chat with validated evidence capture.

This beta adds recoverable Bulk Highlight Color Mapping, persistent intentional note deletion with explicit recreation, per-note color ordering and inline color management. Native Comments, Tags, structured data and PDF files remain independent of recoloring. Repository documentation consolidation does not change the tested XPI.

## Download and install

Download the attached **ResearchAnnotator-2.43.0-beta.1.xpi**, not GitHub's source ZIP. Compare its SHA-256 with the attached **SHA256SUMS.txt** or the value below:

```text
0ee254179983a77cbd1c784da06b15fd0d5ea4ff437c3acbdc241a379947652e  ResearchAnnotator-2.43.0-beta.1.xpi
```

In Zotero: Tools → Plugins/Add-ons → gear menu → Install Add-on From File. Select the XPI and restart if requested. Back up your library and export research data before testing.

**Upgrading an older development build:** open Research Chat once before installation and keep a backup. Older code could clear unopened history at shutdown; the incoming beta cannot retroactively protect that old shutdown or reconstruct an already empty file.

**Manual updates:** install subsequent reviewed beta XPIs manually. The embedded beta feed currently advertises no updates. This release does not enable a new automatic-update mechanism.

## Guides and feedback

- [Installation and safe upgrades](https://github.com/Pinokuo/ResearchAnnotator/blob/main/docs/installation.md)
- [Visual user guide](https://github.com/Pinokuo/ResearchAnnotator/blob/main/docs/user-guide.md)
- [Local AI with Ollama](https://github.com/Pinokuo/ResearchAnnotator/blob/main/docs/local-ai.md)
- [Compatibility and known limitations](https://github.com/Pinokuo/ResearchAnnotator/blob/main/docs/compatibility.md)
- [Report a Bug / Request a Feature / Ask a Question](https://github.com/Pinokuo/ResearchAnnotator/issues/new/choose)
- Optional: [support ResearchAnnotator](https://buymeacoffee.com/researchannotator)

## Verified scope and limitations

Native verification: **Windows / Zotero 10.0.8**. The manifest declares Zotero 7.0–10.0.*; other host versions, macOS/Linux, group permissions and the complete hardware/theme matrix are not claimed verified.

Keyword retrieval requires no embedding model. Generation requires a configured provider. A real local qwen2.5:7b instruct-model workflow passed generation, retained manual/native data and a grounded citation on synthetic PDFs; this is not a benchmark or a guarantee for every model. Thinking-model cold starts may exceed request limits. The current error wrapper can mask timeout details, and Retry may appear outside failed-field states; these limitations are documented, not claimed fixed.

Exact citation navigation/highlight capture requires reliable locations and unchanged PDF identities. External/embedded PDF annotations are excluded from mapping; ResearchAnnotator does not automatically import them or modify source PDFs. Native import may modify PDFs, so review Zotero's workflow on a copy. Real embedding-model, fresh Ollama installer/download and timed novice walkthrough acceptance remain limited as documented.

Validation: 465 retained extension regression cases plus one integrated advisor-policy test (**466 passing**), 19 Python advisor tests, prior 167 native assertions and a fresh six-check local-provider/data/citation smoke run. Service/mocked, browser and native evidence are distinguished in [TESTING.md](https://github.com/Pinokuo/ResearchAnnotator/blob/main/TESTING.md). This is a prerelease, not production acceptance or proof of scientific correctness.

ResearchAnnotator derives from Annota by Elliot Quiriconi. Original copyright and the [MIT license](https://github.com/Pinokuo/ResearchAnnotator/blob/main/LICENSE) are preserved in the repository and XPI.
