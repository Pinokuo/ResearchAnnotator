# Stable public update-feed proposal

Proposal only. No update manifest, current XPI or release has been changed or published. The repository remains private. This describes a future approval, not a working public update service.

## Recommended addresses and channels

Keep one repository, one stable add-on ID **researchannotator@pino**, and GitHub Releases for versioned XPI assets. Proposed future HTTPS feed addresses:

- Stable: `https://raw.githubusercontent.com/Pinokuo/ResearchAnnotator/main/updates/stable.json`
- Opt-in beta: `https://raw.githubusercontent.com/Pinokuo/ResearchAnnotator/main/updates/beta.json`

These are proposed addresses, not live download links. Dedicated paths avoid accidentally reusing the inherited root `updates.json`, whose current entry belongs to `annota@equiriconi` and points to an upstream Annota release. Do not change that legacy file during this documentation consolidation. Its presence does not update the differently identified ResearchAnnotator add-on, but it is not an appropriate ResearchAnnotator feed.

Stable and beta channels can share the same add-on ID: the installed build's `update_url` selects its channel. They should not install two copies or reinterpret research storage. Stable users must not receive prereleases unintentionally. Explicit channel switching can be a reviewed manual install; changing channel selection in the product would be a separate feature decision.

## Existing beta installations

The unchanged 2.43.0-beta.1 XPI embeds a required URL on the retained `branding/researchannotator` branch, ending in `updates-beta.json`. Advancing main does not change that URL. Keep the branch and existing empty feed unchanged now. Raw branch URLs must not be assumed to redirect after a branch rename.

After public-release approval, there are two safe transition options:

1. **Manual bridge:** publish a separately built/tested higher-version XPI with the same ID and the approved main-based beta/stable URL. Users install it through Zotero's plugin manager; existing notes, preferences and migration identities remain. This is the simplest controlled first transition.
2. **Approved legacy-feed bridge:** once the repository/feed is publicly readable, add one reviewed higher-version entry to the old beta URL pointing to that bridge XPI. Existing beta clients can then discover it automatically. The bridge XPI points subsequent checks to the new main-based feed. Keep the old URL available for older installations; no forced downgrade or ID replacement.

Neither option modifies the reviewed beta's bytes. Prove ordering from `2.43.0-beta.1` with Zotero's installed version comparator; do not assume SemVer ordering matches every Gecko/Zotero version rule. Never replace an already published XPI under the same immutable version/checksum to change its feed.

## Future manifest content and publication order

An approved feed would use the Zotero update-manifest structure: `addons` → exact add-on ID → `updates`, with version, versioned GitHub Release asset URL, SHA-256 `update_hash`, and tested `applications.zotero` compatibility bounds. Do not broaden host compatibility merely to advertise an update. The manifest is release metadata, not a source of research data or credentials.

Release sequence after approval:

1. Build a new explicitly versioned XPI with the approved feed URL and unchanged stable ID/data identities.
2. Run regression, packaging, native installation/upgrade, retained-data and version-order checks. Confirm stable/beta selection and compatibility filtering on representative supported hosts.
3. Create/review the release and exact asset/checksum. Publish the approved immutable asset first; verify anonymous HTTPS download and SHA-256.
4. Only then commit/push the reviewed update entry. Never point clients at a private draft, nonexistent URL or unverified asset. Account for raw-content caching; test a clean client request.
5. Test automatic discovery and installation from the old beta and from the bridge/new feed. Confirm conversations, fields, managed-note identities and manual content survive. Verify cancellation/failure leaves the previous installation usable.

HTTPS and a matching checksum protect transport/artifact integrity in this workflow; a checksum published through the same compromised channel is not independent proof of authenticity. Keep repository credentials/permissions protected. Do not embed a GitHub token in the add-on or tell users to authenticate an update feed against the private development repository.

## Automation and recovery

The existing release scripts/workflow are not approved by this proposal. The original checkout contains uncommitted release-automation work; it is deliberately excluded from consolidation. The checked-in legacy automation must not run merely because main advances. Review it separately before enabling any publication workflow.

Prefer a manual release approval gate, an explicit channel/version, allowlisted package contents and a generated candidate feed diff for review. Do not let documentation pushes publish releases or update feeds automatically.

If a new release is withdrawn, remove the advertised candidate or point to a newly reviewed higher version; do not assume an update manager will downgrade. Retain the prior known-good XPI/checksum for manual recovery, with schema compatibility instructions. Never delete backups as rollback preparation.

## Required approvals

Approve the public feed addresses/channel policy, next version, bridge strategy, new XPI and its native upgrade tests, release asset/body, legacy-feed edit and final publication separately from this private documentation push. Current authorization covers this proposal only.

Primary references: [Zotero developer manifest/update format](https://www.zotero.org/support/dev/zotero_7_for_developers), [extension update-manifest transport/hash concepts](https://extensionworkshop.com/documentation/manage/updating-your-extension/), and [GitHub branch-rename raw URL behavior](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/renaming-a-branch). Zotero behavior must be tested directly rather than inferred solely from Firefox documentation.
