# Cross-device synchronization decision

## Explorer and repaired managed notes (2026-11-16)

Explorer/filter-generated notes use local source-to-note synchronization and the
existing completeness guards. B23 repair preserves source structured records and
the note's original completeness marker; it does not assert local completeness or
introduce automatic cross-device metadata transport. Invisible metadata links use
attributes supported by the inspected native editor schema. Real synced-note
round-tripping and conflict behavior still require native acceptance. The transport
blocker below remains unchanged.

## Research Note Generation authorization (2026-11-16)

The owner explicitly proceeds with local research-note generation despite the
unresolved transport/protocol decision. Dashboard synchronization modes mean local
annotation-to-note updates, not automatic cross-device metadata transport. Older
exit-gate language below no longer blocks this milestone; the technical blocker
itself remains. Generic notes now also carry completeness fingerprints and reject
missing prior live records. These guards do not establish distributed convergence.
See [RESEARCH_NOTE_GENERATION.md](RESEARCH_NOTE_GENERATION.md).

Status: **blocked; no automatic extension metadata synchronization implemented**.
Manual portable settings/research-data/backup remains available. This is the
conditional fallback authorized for Data Infrastructure work package 2.

## Inspected evidence

Read-only inspection used installed Zotero **10.0.8**, BuildID **20261106171835**,
`C:/Program Files/Zotero/app/omni.ja`, plus official documentation:

- [JavaScript API](https://www.zotero.org/support/dev/client_coding/javascript_api)
  describes client item/note APIs and emphasizes inspecting source.
- [Data synchronization](https://www.zotero.org/support/sync) covers native metadata
  and note syncing; this is not automatic syncing of arbitrary extension JSON files.
- [API sync protocol](https://www.zotero.org/support/dev/web_api/v3/syncing)
  describes object versions and concurrency controls. Object-level versions are
  not a field-level extension merge/deletion protocol.
- [Database access guidance](https://www.zotero.org/support/dev/client_coding/direct_sqlite_database_access)
  cautions that arbitrary schema/custom-field changes break synchronization.

Exact installed-source SHA256 evidence:

| Source inside omni.ja | SHA256 | Finding |
| --- | --- | --- |
| chrome/content/zotero/xpcom/syncedSettings.js | d257d5c05f1bdeefeb6c37659af931cb95ec2f6f5b548d8557b23363522e67cc | `_allowedSettings` must match server settings; `set` rejects unknown unsynced settings and upload filters unapproved settings |
| chrome/content/zotero/xpcom/data/item.js | b380ef6ec7b3d259fa301a4506b88fcc79d997981c854e4d3ff6939ed84b1df9 | `toJSON` emits predefined annotation fields; arbitrary JavaScript properties are not serialized research fields |
| chrome/content/zotero/xpcom/sync/syncLocal.js | f372f67322607137a859a301dc272d666a81e12c0431edef384b52cd68736b19 | Native settings/item synchronization and object conflicts; `_saveObjectFromJSON` supplies item notifier `skipRenameFile:true` |
| chrome/content/zotero/xpcom/plugins.js | a0207c10cfba742b751ae1cf2916b8122179cd167dd08d721dc14cc72c92f8d5 | Normal plugin shutdown is awaited, supporting the new async durable drain |

These local files were inspected, not modified. No Zotero sync internals or
remote library data were changed. Version 7/8/9 compatibility is not established
by inspecting version 10.0.8.

## Candidate mechanisms and decision

1. Local preferences/JSON: good local authority and manual portability; not a
   supported automatic native sync transport.
2. SyncedSettings: server-matched allowlist excludes extension research metadata.
   Do not bypass it, steal native keys or patch sync internals.
3. Annotation custom properties: absent from native serialization. Do not put
   research data in native Comments/Tags as a hidden workaround.
4. Native managed metadata notes: supported notes can travel, but reliable use as
   an operation transport still needs a tested protocol for concurrent independent
   field changes, tombstones, duplicate note creation, normalization, offline
   conflicts and partial library downloads. Mutable whole-note JSON cannot prove
   those guarantees. This candidate is not disproven forever; it is not sufficiently
   validated to enable for users in this build.
5. File attachments/WebDAV: file synchronization does not supply extension
   field-level merge/deletion/conflict semantics, and local linked files are not a
   transparent settings/data transport. Do not introduce it as an unsafe shortcut.

The technical blocker is a supported, proven transport/protocol meeting **all**
required safety properties, not simply the ability to save a note containing JSON.
Do not implement automatic synchronization until that protocol is demonstrated
with two actual devices/profiles, offline edits and failure injection. No external
server/account/subscription is introduced by this milestone.

## Preserved safeguards and next investigation

Portable identities use Zotero user/group identity plus item key, never local
numeric library IDs across devices. Imports retain stable field/color/category
IDs, validate and preview conflicts, back up state and require explicit policies.
Imported jobs are interrupted; no provider request occurs during import. API
credentials are excluded. Native Comments/ordinary notes remain independent.

The managed-note fingerprint/count and legacy saved-AI guards stop incomplete
devices from casually replacing complete PDF notes. They can conservatively block
legitimate updates until a matching structured-data backup is imported. They are
not evidence of cross-device conflict resolution or distributed AI-request locks.
The observed native download notifier flag suppresses new automatic requests for
those downloads; alternate importers/older versions need live compatibility checks.

Next: prototype an append-only native-note operation protocol on disposable data,
with stable operation IDs, per-field revisions, tombstones, account/library scopes,
explicit unresolved conflicts and AI result/claim semantics. Test concurrent creation,
normalization, interruption and duplicate delivery before selecting it. Obtain
upstream confirmation of supported extension sync storage if available. Until then,
the synchronization exit gate remains open before broad batch/cross-paper expansion.
