# Historical release tools - do not execute

These files preserve the inherited tools and workflow for reference. They assume
the old root layout and Annota package/release identities. The shell build omits
most current runtime files; release tools can commit, push, publish and change an
update feed. Moving them does not make them compatible.

`release-workflow.yml` is the original manual-only workflow, preserved unchanged
outside `.github/workflows/` so GitHub cannot execute it. This intentionally removes
the obsolete Run workflow action. No new release workflow replaces it.

Use `../package-dev.ps1` for supported development packaging. See the
[repository build guide](../../docs/development/REPOSITORY_STRUCTURE.md).
