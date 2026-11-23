# Repository layout and byte-preserving builds

The repository root contains 15 entries. Extension runtime files live together in
`src/`; their installed paths have not changed. User guides and public media keep
their existing `docs/` URLs. Technical documentation is under `docs/development/`,
examples under `docs/examples/`, and inherited material under `docs/history/`.
The root testing page preserves links from published release notes.

## Runtime bytes and Git

The verified 2.43.0-beta.1 XPI is the authoritative baseline for this move. Its 47
members include LF, CRLF and mixed line endings. Git previously normalized text
in its index and expanded LF to CRLF when `core.autocrlf=true`, changing package
hashes even when application text was equivalent.

`.gitattributes` now marks `/src/*` and `/LICENSE` as `-text`. Git must store and
check out these files without line-ending conversion. They remain readable in
text diffs; this is not a blanket binary attribute. Path-specific whitespace
rules recognize CRLF without suppressing other whitespace checks. The initial
files were restored byte-for-byte from the verified XPI, including mixed endings.
Do not run editor-wide line-ending cleanup on these paths. Intentional future
runtime edits require their own review; this policy does not prohibit them.

## Supported packaging

From the repository root in Windows PowerShell:

```powershell
.\scripts\package-dev.ps1
.\scripts\compare-package.ps1 -ReferenceXPI 'path\to\ResearchAnnotator-2.43.0-beta.1.xpi' -CandidateXPI 'path\to\new-development.xpi'
```

`scripts/package-files.json` is the shared, explicit 47-member allowlist. Both
supported packagers read runtime files from `src/`, and `LICENSE` from the root.
They stage each file at its original XPI root path. No `src/` prefix, documentation,
tests, profiles, backups, credentials or unrelated files are selected. The beta
packager validates an existing development artifact and refuses to overwrite an
existing beta candidate; do not run it against the published beta destination.

The comparison checks the trusted reference SHA-256, exact case-sensitive member
names, duplicate/missing/extra entries and every member's SHA-256. ZIP timestamps
and compression metadata can change the outer XPI hash. The published beta asset,
its tag, update feeds and add-on identity are not changed by this reorganization.

Source-proxy development must point at `src/`, not the repository root. Packaged
development uses the unchanged XPI root. Browser fixtures and native launcher
paths were updated accordingly; no runtime URL rewrite is needed.

## Verification commands

```powershell
$tests = Get-ChildItem tests -Filter '*.test.cjs'
node --test --test-concurrency=1 $tests.FullName
python -B -m unittest discover -s tests -p test_local_ai_advisor.py
python -B scripts/check-doc-links.py
git diff --check
```

Use an installed Python executable (and `RESEARCHANNOTATOR_PYTHON` for the Node
advisor-policy test) if `python3` is not on PATH. Edge is required for the real
browser fixtures. Tests do not replace packaged native Zotero verification.

Before the restructuring commit, a fresh standalone repository was populated from
the staged Git tree with `core.autocrlf=true` and `git checkout-index --all`. This
tests Git's actual checkout filters without creating a commit before verification.
Its rebuilt XPI must match all 47 published members exactly. Normal subsequent
clones use the same committed attributes and blobs.

## Legacy release workflow

The former manually triggered `.github/workflows/release.yml` is preserved unchanged
as `scripts/legacy/release-workflow.yml`. GitHub does not execute workflows from
that location. It called obsolete tools, built an incomplete Annota package and
could publish a release and update `updates.json`; it must not be re-enabled by
merely changing paths. Original shell/Python tools remain under `scripts/legacy/`.
They are historical references, not supported packaging commands. No replacement
release automation has been introduced.
