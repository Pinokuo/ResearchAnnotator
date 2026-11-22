# Compatibility and known beta limitations

| Area | Evidence and limits |
| --- | --- |
| Native host | Windows / Zotero 10.0.8 verified in an isolated profile. |
| Declared host range | Manifest retains Zotero 7–10 compatibility. Other versions/builds and macOS/Linux are not native verified for this beta. |
| Libraries | Personal-library fixture coverage; live group permissions, remote/offline cases require acceptance. |
| AI | Loopback-compatible transport tested; installed Ollama model availability, speed and answer quality not benchmarked. Provider configuration is required for generation. |
| Retrieval | Keyword-only works without embeddings. Optional semantic/hybrid needs a separately configured embedding model and approval. Retrieval is selective, not exhaustive. |
| PDF locations | Exact navigation/capture requires reliable locations and matching fingerprints. Unsupported/unresolved passages are reported; page fallback is not exact passage navigation. |
| PDF imports | No automatic import of embedded annotations. Native transfer can modify PDF bytes, so use Zotero's workflow on a copy and rescan. |
| Updates | Manual beta XPI installation. The verified artifact's feed URL points into the private repository; no public auto-update service is promised. |
| Backup/sync | Research exports, full library backups and local recovery journals differ. Automatic cross-device synchronization is not implemented. |
| Version warning | Zotero accepts the labelled beta version; Gecko emits a numeric-version-format advisory. |

The package passed 465 regression cases: 453 service/shared-view/mocked integrations and 12 actual Edge browser fixtures. Separately, 167 native assertions exercised isolated Zotero, including installation, history shutdown, note rebuild stability, PDF navigation/capture, deletion and restart/Undo. These are not 632 independent end-user acceptance scenarios.

Native interaction evidence uses controlled Gecko events and compositor screenshots. The Windows desktop automation connection was unavailable; this is not a claim of manual OS-level acceptance. Screenshots contain synthetic fixture data and simulated provider answers. Some settings screenshots labelled light by the harness still show native dark chrome; do not infer full theme coverage from filenames.

Before upgrading older development builds, open Chat once and back up history/data: old shutdown code cannot be fixed retroactively by the incoming version. Already-empty history requires a backup to recover.

## Local AI acceptance update

A real local qwen2.5:7b instruct-model workflow now passes in the unchanged beta on Windows/Zotero 10.0.8: generation, AI persistence with manual/Comment/Tags retained, and a keyword-grounded answer with a validated citation. The earlier qwen3:4b request reached its shortened 60-second test limit during cold-start/thinking generation; the old 43-second figure was only one debug-log interval. The beta can mask timeout details as `API (HTTP ?)`. Retry is also visible outside failed-field states in the captured popup; this UI limitation is not claimed fixed. See [local AI verification](local-ai.md#verified-local-model-example-and-thinking-model-caution). Fresh installer/download, real embeddings, physical macOS/Linux, timed beginner onboarding and live repository asset serving remain explicitly unverified beta areas.
