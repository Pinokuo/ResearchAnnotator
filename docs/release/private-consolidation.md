# Private repository consolidation

Historical prepublication record: the private-state descriptions below refer to the consolidation phase. See the current README and release page for publication status.

22 November 2026. ResearchAnnotator uses the existing independent `Pinokuo/ResearchAnnotator` repository, main as its primary remote branch, integrated documentation, same-repository Issues and future GitHub Releases. **The repository remains private and the beta draft remains unpublished.** No separate distribution repository is planned.

## Preservation and scope

The approved base is verified beta commit `46281cb96dbe64522f52dd5908bc33e19ab33892`. Remote main was confirmed a direct ancestor and fast-forwarded normally to that commit. Documentation is integrated in a separate worktree/local consolidation branch, leaving the original dirty checkout, divergent local main, branding branch, historical tags, remotes and backups untouched. No force-push or history rewrite is used.

The current beta XPI is unchanged: SHA-256 `0ee254179983a77cbd1c784da06b15fd0d5ea4ff437c3acbdc241a379947652e`, 379064 bytes. No runtime code, package/add-on ID, license, current update manifest or migration key changes belong to this documentation commit. The existing private draft remains targeted at its verified beta commit and keeps its original asset.

The README links to canonical user/installation/local-AI/hardware/privacy/troubleshooting guides; assets are under docs/assets. Optional Python tooling and tests are separate from extension runtime. Existing developer architecture/requirements/backlog/history remain. Private audit files, profiles, logs and recovery artifacts are excluded by an explicit integration allowlist.

## Historical privacy classification

The [per-finding review](historical-privacy-review.md) covers all ten backup blobs, 22 user-path candidates and two author identities without publishing raw sensitive values. Exact unauthenticated upstream lookups establish that 27 findings were already public: ten backups, fifteen placeholder path examples and both author identities. Seven local build-artifact path blobs were not found there; their account/directory labels are low-sensitivity personal information, not credentials or research data. Current documentation paths are made portable; historical objects are unchanged.

No live credential, secret or significant private research dataset was identified in this bounded review. This is not a guarantee of absence of all secrets. Final visibility approval still needs to accept the remaining historical path disclosures. No significant-disclosure remediation or history rewrite was attempted.

## Native and tooling evidence

The unchanged beta passed six new real-local-model checks using the already installed qwen2.5:7b instruct model in isolated Windows/Zotero 10.0.8: shared generation, AI persistence, retained manual value/Comment/Tags, and a keyword-grounded answer with one validated citation and no invalid references. Four mapper checks pass for apply/Undo, Comment retention and no AI request; real before/after/status screenshots are integrated.

Two controlled diagnostic checks confirm raw Zotero timeout identification and the existing shared wrapper's loss of the timeout message. The original qwen3:4b request lasted about 60 seconds across debug intervals, not 43 seconds. GPU discovery/load delays and continued Thinking-model generation exceeded the deliberately shortened test limit. The ordinary local-provider default remains 180 seconds; no application fix or universal model-compatibility claim is made. Retry visibility outside failed-field states remains a documented UI limitation.

The prior 465 extension regression cases and 167 native assertions are retained as distinct evidence. Current consolidation reruns the complete regression suite plus the integrated advisor policy test, Python advisor tests, documentation link/media checks, syntax/XML validation and diff checks; the final validation record is documented in TESTING.md. Real-model/native results are not mocked browser tests or manual OS acceptance.

## Release boundary

Still required before public release: explicit visibility/publication approval after historical disclosure review; final GitHub repository asset/Issue-form/download checks; agreed current manual-update policy or an approved separately tested bridge build/feed. The [update-feed proposal](update-feed-proposal.md) changes no feed today.

Reasonable disclosed beta limitations include physical macOS/Linux/Apple Silicon and other Zotero versions, group permissions, fresh Ollama installer/download, real embeddings, a timed novice walkthrough and the full theme/scaling matrix. Windows/Zotero 10.0.8 and the specific local instruct-model workflow are the verified scope. Data loss or inaccurate capture would remain blockers rather than waivable platform limitations.

## Consolidation validation results

- Full regression suite: **466 passed, 0 failed, 0 skipped** (all 465 previous cases retained, plus one advisor-policy test containing 21 hardware cases). Existing real Edge browser fixtures are included.
- Python advisor: **19 tests passed**. Python 3.10+ is needed for this optional tool/test; set RESEARCHANNOTATOR_PYTHON to your installed interpreter when its command is not python3. Example: `node --test tests/*.test.cjs` with that environment variable set; run the Python suite with `python3 -B tests/test_local_ai_advisor.py`.
- A fresh Windows checkout exposed a CRLF-sensitive fixture extraction in one browser test. The test reader now normalizes CRLF; application code is unchanged. The focused cases and complete rerun pass.
- Documentation: **116 local links and 15 anchors checked**, 54 JavaScript/test scripts parse, and 15 XHTML/SVG documents parse. GitHub Markdown preview returns HTTP 200; ten README images decode at 650px and 1100px without overflow, including the support button and real screenshot GIF. This is not a claim that unpublished release links or anonymous private-repository asset access work.
- Final native smoke: **6 checks pass** against unchanged 2.43.0-beta.1 resources in isolated Zotero 10.0.8, including real local qwen2.5:7b generation, AI/manual/Comment/Tags preservation and a validated grounded citation. The run uses controlled Gecko interaction and synthetic PDFs.
- Package/feed/license/automation boundaries: unchanged beta SHA-256 `0ee254179983a77cbd1c784da06b15fd0d5ea4ff437c3acbdc241a379947652e`, 379064 bytes. No runtime, manifest, current feed, license or release-script changes. The checked-in Release workflow is manual workflow_dispatch only and was not invoked.
