# Troubleshooting

Start with the exact extension/Zotero/OS versions and a backup. Retry only after identifying the failed stage; repeated requests can cost money on paid providers.

| Symptom | What to check |
| --- | --- |
| XPI will not install | Use the XPI, not source ZIP. Re-download and compare SHA-256. Record Zotero's error and version; do not edit the manifest or disable host checks. |
| Workspace or Chat does not open | Check the Tools entry and independent toolbar buttons. Restart Zotero once and inspect the visible error/diagnostics. Report the actual message with secrets redacted. |
| No indexed evidence | Select PDFs, inspect availability, then Index selected sources. Selecting a library does not index every document automatically. |
| No matching passages | Confirm indexing finished; try source terminology and a narrower question. Scans/image-only PDFs may need suitable text extraction/OCR outside this workflow. |
| Missing embedding configuration | Choose Keyword only or explicitly configure and approve an embedding model. A generation model is not an embedding model. |
| Retrieval works; answer fails | Check generation provider, endpoint, model, local service and context capacity. Inspect Activity and per-answer diagnostics; do not reindex unchanged PDFs unnecessarily. |
| Ollama models missing | Start Ollama, confirm the exact tag is installed and Refresh in AI settings. Keep the full `/v1/chat/completions` path for generation; `/api/embed` is a different endpoint. |
| Local model slow/out of memory | Use less context or a smaller model, close other heavy apps and inspect Ollama allocations. Do not assume disk size equals runtime memory. |
| Citation unavailable | The PDF may have changed, moved or been deleted. Reindex the current document and ask again. Do not fabricate an exact location from an old fingerprint. |
| Capture excludes a passage | Reliable coordinates or matching document identity may be unavailable. Review it manually in Zotero rather than creating an approximate highlight. |
| AI field failed | Inspect the individual error and Retry. Manual mode uses Generate AI Fields for missing fields; completed values are not routinely regenerated. |
| Note no longer updates | Check Automatic/Manual/Static mode, destination/source availability and whether management was stopped by deletion. Use explicit Recreate / Resume management if intended. |
| Old duplicated snapshots | Use the existing managed-note repair preview and recoverable backup. Preserve uncertain authored content; do not bulk-delete blockquotes. |
| Mapping Undo reports conflict | A native or structured value changed afterward. Review conflicts; Undo deliberately preserves newer edits. |
| Chat history disappeared before upgrade | Preserve all backups and look for a prior data export/history snapshot. The fixed shutdown guard cannot reconstruct an already overwritten file. |

For reports, include minimal reproducible steps and a redacted screenshot. Do not attach a live profile, database, research export, access token or copyrighted/private PDF. See [feedback](feedback.md).
