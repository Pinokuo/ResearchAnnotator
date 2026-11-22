# Manual hardware selection

**Capacity versus behavior:** the Qwen3 entries below are footprint candidates, not fully accepted onboarding models. The installed qwen3:4b Thinking variant exceeded a deliberately short cold-start test limit; disabling thinking is not guaranteed by a prompt suffix. An already installed qwen2.5:7b instruct model passed the small real beta workflow on one Windows machine. See [the verified example and limits](local-ai.md#verified-local-model-example-and-thinking-model-caution). Do not infer that a size recommendation certifies model behavior.

Use this without running any advisor. First [identify hardware in your own system interface](local-ai.md#choose-a-local-ai-model-without-running-any-scripts). These conservative planning tiers are not measured minimums, fit guarantees or benchmarks. The same thresholds come from [model-policy.json](../tools/model-policy.json) and are used by the Python advisor.

## Apply the same rules manually

Round an OS-reported usable RAM total to the nearest whole GiB for these planning tiers (for example 15.85 becomes 16); retain free-memory/headroom caution. This is the same rounding used by the script and browser form, not a claim that the rounded amount is free.

1. Below 8 GiB RAM, or unknown RAM: no conservative candidate; use manual fields and keyword retrieval first.
2. At 8 / 16 / 32 GiB RAM, permit qwen3:1.7b / qwen3:4b / qwen3:8b respectively, including smaller candidates. These are total-memory planning gates, not available memory. Leave OS/Zotero/other-app headroom.
3. CPU-only or unknown acceleration: cap at qwen3:4b even with 32 or 64+ GiB RAM; larger models may run but are outside this cautious shortlist.
4. A discrete GPU additionally needs 4 / 6 / 12 GiB VRAM for the three candidates. Use the smaller RAM and VRAM result. Unknown VRAM gets no GPU-based recommendation; choose CPU/unknown guidance instead. Do not add shared memory or multiple GPUs. GPU identification does not establish driver support.
5. Apple Silicon unified memory uses the RAM gates once, not RAM plus VRAM. Intel Macs use CPU guidance.
6. Start with the smallest permitted candidate and short context. “More headroom” begins at 16 / 32 / 64 GiB RAM for the three models; this label is not a guarantee. If current free memory is limited, step down.

## CPU-only and RAM tiers

| Total RAM | CPU / unknown shortlist | Trade-off |
| --- | --- | --- |
| 8 GiB | qwen3:1.7b | CPU may be slow; start with smallest. No speed measured. |
| 16 GiB | qwen3:1.7b, qwen3:4b | CPU may be slow; start with smallest. No speed measured. |
| 32 GiB | qwen3:1.7b, qwen3:4b | CPU may be slow; start with smallest. No speed measured. |
| 64+ GiB | qwen3:1.7b, qwen3:4b | CPU may be slow; start with smallest. No speed measured. |

## Dedicated GPU tiers

These rows assume at least 32 GiB system RAM. With less RAM, intersect this row with the RAM gates above; 8 GiB permits only 1.7b, 16 GiB permits up to 4b. Check [current Ollama GPU support](https://docs.ollama.com/gpu). CPU offloading can use system RAM but often slows generation; it is not an excuse to promise a GPU fit.

| Dedicated VRAM | Shortlist, subject to RAM |
| --- | --- |
| 4 GiB | qwen3:1.7b |
| 6 GiB | qwen3:1.7b, qwen3:4b |
| 8 GiB | qwen3:1.7b, qwen3:4b |
| 12 GiB | qwen3:1.7b, qwen3:4b, qwen3:8b |
| 16 GiB | qwen3:1.7b, qwen3:4b, qwen3:8b |
| 24 GiB | qwen3:1.7b, qwen3:4b, qwen3:8b |

## Apple Silicon unified-memory tiers

Unified memory is shared by macOS, CPU and GPU. Do not double-count it. CPU/GPU compatibility must still be checked against your installed Ollama version.

| Unified memory | Shortlist |
| --- | --- |
| 8 GiB | qwen3:1.7b |
| 16 GiB | qwen3:1.7b, qwen3:4b |
| 24 GiB | qwen3:1.7b, qwen3:4b |
| 32 GiB | qwen3:1.7b, qwen3:4b, qwen3:8b |
| 64+ GiB | qwen3:1.7b, qwen3:4b, qwen3:8b |

## What each candidate means

| Chat model tag | Approximate downloaded weights | Cautious / more-headroom system-RAM planning | Strength and limitation |
| --- | --- | --- | --- |
| [qwen3:1.7b](https://ollama.com/library/qwen3:1.7b) | 1.4 GB | 8 / 16 GiB | Smallest starting candidate; lower resource use, more limited synthesis and structured-output reliability. |
| [qwen3:4b](https://ollama.com/library/qwen3:4b) | 2.5 GB | 16 / 32 GiB | Moderate starting candidate for short grounded questions; still requires source checking. |
| [qwen3:8b](https://ollama.com/library/qwen3:8b) | 5.2 GB | 32 / 64 GiB | Larger candidate when memory permits; slower CPU use and larger context cache. |

The listed chat tags use quantized weights; different quantization changes size and memory. Weight size excludes context cache and inference overhead. ResearchAnnotator uses Ollama-compatible chat generation, but no real-model output-quality benchmark or guaranteed JSON reliability is claimed. Models may expose thinking text; inspect a short field result before batch generation. None is objectively “best.” Model-page identifiers and sizes were checked on 22 November 2026.

## Optional embedding shortlist

Keyword retrieval needs no embedding model. If you choose semantic/hybrid retrieval, choose one separate compatible embedding model, check its license/version, then explicitly index and approve passage/question processing. Do not run both chat and embeddings concurrently on a memory-limited system without checking allocations.

| Embedding tag | Approximate weights | Purpose and caveat |
| --- | --- | --- |
| [nomic-embed-text](https://ollama.com/library/nomic-embed-text) | 0.274 GB | Optional small embedding candidate; does not generate answers. |
| [embeddinggemma](https://ollama.com/library/embeddinggemma) | 0.622 GB | Optional multilingual embedding candidate; requires Ollama 0.11.10 or newer. |

Both current catalog entries list 2K context windows: make sure the installed model can accept your indexed passages; character counts are not token counts. API errors are not proof of bad PDF content. Real embedding-model compatibility remains an acceptance check.

## Example: 32 GiB RAM and 8 GiB dedicated VRAM

The RAM gate allows 1.7b, 4b and 8b; the GPU gate allows 1.7b and 4b. Intersection: **qwen3:1.7b, qwen3:4b**. Start with 1.7b, then try 4b if needed. This is exactly the Python advisor result for `--manual --ram 32 --gpu-type discrete --vram 8`. Optional embedding candidates are nomic-embed-text and embeddinggemma, not required downloads.

## Install only after choosing

Use Ollama’s model selector where supported, or the explicit optional `ollama pull MODEL_TAG` command described in [Local AI setup](local-ai.md). No table, advisor or ResearchAnnotator setting silently installs a model. Test it in Ollama, then Refresh/select it in ResearchAnnotator and validate a short cited answer.
