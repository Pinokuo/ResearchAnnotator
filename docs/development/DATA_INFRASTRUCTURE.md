# Data Infrastructure development baseline

## Chat index and capture integration (2026-11-17)

A local versioned chat-index file with atomic writes/recovery stores rebuildable passages/vectors and is excluded from portable exports. Conversation/citation snapshots remain in inherited Chat history. Shared infrastructure persists indexing/answer/default-update jobs and evidenceCaptures journals with stable native keys, before/after field values, original undo ownership, source fingerprints and conversation/answer provenance. Settings-only exports exclude scientific capture records. Optional paid structured-AI children wait for parent capture completion, eliminating nested single-concurrency deadlocks; parent cancellation prevents/cancels children. Imports/restarts retain explicit job recovery semantics and never automatically repeat paid work. Existing storage/annotation IDs/repair/managed completeness guards remain. [Full details](RESEARCH_CHAT.md).


## Network consumer and complete backup extension (2026-11-16)

The optional infrastructure.network version-1 document adds relationship types, explicit links, research questions, topic-source configuration, isolated suggestions and durable batch markers. It shares the existing serialized atomic writes, recovery snapshots, backup/import validation and transaction journal. Old backups remain valid. Network records merge atomically in conflict previews; explicit mappings retain unresolved original identities and recovery diagnostics. Tombstones preserve deletion intent/history. Restoring invalidates indices; ordinary job updates do not rebuild relationship indices. No new transport or automatic cross-device synchronization exists.

network-suggestions uses existing persistent paid-job safeguards, explicit recovery acknowledgement and provider HTTP retry limits. Accepted suggestions alone enter the relationship store. Topic membership reads existing structured/category IDs through Explorer. Shared Network note ownership now includes hidden completeness fingerprints and expected relationship/question record IDs, so incomplete Network state cannot erase existing note content. Existing annotation-level reconciliation and repair remain.

Native export tests exposed two inherited validation gaps: aiConcurrency is an integer (1?8), and an active definition may also have a distinct archived historical version of the same stable ID. Validators now accept these legitimate states while rejecting duplicates within each definition list. No history is removed. [Details](RESEARCH_KNOWLEDGE_NETWORK.md).


## Unified Workspace consumer update (2026-11-16)

The shared compiler now reconciles annotation identities and their retained user
tails instead of relocating all generated entries to one range. Durable storage,
note identities, completeness checks, lifecycle/jobs and repair/restore remain
authoritative. The unified window and existing Review/Chat integrations add no
competing store or queue. Window geometry/last section are local preferences;
portable saved searches and managed configurations retain their existing formats.
See [RESEARCH_WORKSPACE.md](RESEARCH_WORKSPACE.md).

## Shared consumers and B23 repair update (2026-11-16)

Explorer uses the existing indexed field store, durable jobs, lifecycle and note
compiler. Optional `explorerSearches` settings are validated/portable; old backups
remain valid. Shared storage adds opt-in strict expected-value conflict rejection
for manual editors; existing AI guarded merges retain their behavior.

The B23 correction replaces document-wide snapshots with semantic block ownership.
Managed metadata now lives in supported link attributes, with legacy recognition.
PDF ownership commits after native saves. Repair never regenerates annotation data:
it backs up exact note/configuration state before conservative snapshot flattening;
restoration backs up the current note first. Existing completeness guards remain.
See [MANAGED_NOTE_REPAIR.md](MANAGED_NOTE_REPAIR.md) and
[RESEARCH_EXPLORER.md](RESEARCH_EXPLORER.md). Earlier whole-document fallback
descriptions below are superseded; schema versions remain unchanged.

## Consumer milestone: Research Note Generation (2026-11-16)

The new dashboard/batch/field/color interfaces consume the existing services; they
are no longer wholly future scope. See [RESEARCH_NOTE_GENERATION.md](RESEARCH_NOTE_GENERATION.md).
No competing store, pipeline, compiler or queue is introduced. Shared notes gain
detailed content inclusion, generic completeness markers and prior-record guards.
Ownership requires actual local generated/content snapshots, not configuration
presence. Research jobs persist annotation/note checkpoints and discard portable
payload ownership before execution. Infrastructure schema 1 and field schema 3
remain; research-job payloads receive shape validation. The baseline below remains
applicable except where extended by this consumer milestone.

This milestone follows [AGENTS.md](../../AGENTS.md). Foundation/customization are
functionally accepted by the owner. Color presentation is deferred polish; no
palette renderer or color CSS changes are part of this milestone. The earlier
audit sections remain historical evidence, not current defect verification.

## Storage contract

`infrastructure.js` installs its storage adapters on `AnnotaCardFields` before
readers/notifiers register. Existing per-annotation, global and stable-color
records remain authoritative. The root `annota-fields.json` schema is **3**;
individual records retain the compatible **2** shape and all unknown/historical
keys. `load` validates v1/v2/v3, checks field-value shapes and unsafe properties,
backs up older schemas, then reuses the existing color migration. Future versions
are rejected without replacing the file. Lookup remains indexed by numeric local
library ID/item key; portable identities use signed-in user/group ID plus item key.

`saveValues` uses the existing mutation queue, reads the latest committed state,
merges patches and applies expected-value guards. Publication to memory follows
successful disk completion. `writeStore` has a separate serialized I/O queue;
`IOUtils.writeJSON` uses `tmpPath` and `flush:true`. Each write preserves a validated
last-good `.recovery`; each changed session gets an immutable snapshot under
`researchannotator-backups`, as do schema migrations. Backup failure aborts the
write. These queues prevent competing extension mutations, not edits by external
programs to a live Zotero directory. Do not share a live profile/data directory
between running Zotero processes.

Unreadable/invalid active data is copied byte-for-byte to a timestamped `.corrupt-*`
file before a validated recovery or leftover temporary snapshot is restored. If
there is no valid recovery, loading fails closed. No empty replacement is written.
The infrastructure state file has equivalent last-good recovery and future-version
protection. No backups or corrupt originals are automatically deleted.

`researchannotator-infrastructure.json` (schema 1) contains managed-note
configurations/local ownership snapshots and persistent jobs. Its mutation queue
validates and writes a clone atomically before publishing it. It is deliberately
separate from field values: a paid operation interrupted between files requires
review rather than an automatic replay. This is not a multi-file filesystem
transaction or a guarantee against hardware/power-loss failure.

Normal async shutdown unregisters incoming work, captures live annotation drafts,
clears timers/listeners, interrupts queued/running jobs, drains note updates and
flushes field/state writes before clearing globals. Late AI results check the
shutdown flag and annotation availability before saving. Abrupt process death
cannot flush unsaved input; real shutdown ordering still needs live testing.

## AI lifecycle and jobs

The shared `Annota.generateStructuredFields` pipeline remains the sole field
generation implementation. It supports `fieldId`/`fieldIds`, missing-only default,
explicit `regenerate`, partial successful commits and a background control token.
Per-field request locks protect direct and queued callers. Before any asynchronous
generation, callers persist manual drafts. Only AI field patches are generated.
Native Comments and Tags are never generated output destinations.

`aiMetadata[fieldId]` records queued/generating/completed/failed/cancelled state,
field/scope, portable annotation identity, prompt fingerprint/snapshot, source
fingerprint (highlight text and current manual structured context), timestamp and
provider/model preferences. `lifecycle.describe` derives Missing and Outdated
without regenerating. Legacy saved values count as completed with unknown
provenance, not as missing. Prompt changes/removal during a request reject the
result. Manual changes during generation survive; a generated result can become
Outdated when its manual context changes. Image/OCR source-change detection needs
a later rescan; it is not inferred by rerunning OCR on every render. Provider/model
identifiers are best available preferences and may differ from a provider's actual
resolved model. Fingerprints are change detectors, not cryptographic authentication.

Restart turns interrupted field states into failed/retryable states, preserving
the prior successful values. Failure-only Retry can retry a failed regeneration
without first clearing the saved value. Explicit refill targets AI fields and
stores structured before/after snapshots. Undo restores only an exact unchanged
post-state; otherwise it skips the annotation to protect later edits. Legacy
Comment-only undo files retain their old explicit undo behavior.

`Annota.backgroundJobs` exposes `enqueue`, `list`, `pause`, `resume`, `cancel`,
`wait`, `register` and progress listeners. Jobs persist stable identity, payload,
dedupe key, attempts, progress, checkpoints and failure state. `structured-ai` and
`pdf-note` handlers are registered at startup. Inherited batch and refill use
structured AI jobs; automatic creation and contextual Retry still call the same
safe pipeline directly. Resumed AI jobs skip checkpointed fields; successful values
are durable incrementally. Background concurrency is configurable from 1 to 8 in
Data Management (default 1); this bounds scheduled jobs, not every chat/direct
individual request in the extension.

Interrupted work is never run at startup. Paid failed/interrupted jobs require an
explicit acknowledgement before Resume. Structured provider calls disable the
legacy generic retry loop. Only a positively rejected HTTP 429 may automatically
retry a paid job, with Retry-After/backoff, a 60-second delay cap and at most three
attempts. Ambiguous timeout/network/provider failures stop. Pause/Cancel are
cooperative: a request already sent may still be billed; its late response cannot
write after cancellation. Previously completed fields remain. Minimal job controls
are in Data Management; the full batch dashboard remains future scope.

## Managed note service

`Annota.managedNotes` exposes stable library/scope configuration, serialized
updates, cached identity lookup, a shared annotation compiler and
`synchronize(config, compilerOrItems, {manual})`. Configurations have stable IDs,
scope type/key, update mode and inclusion flags (`text`, `comment`, `color`,
`global`, `colorFields`, `tags`). Titles are presentation, not identity. Invalid or
reused identities are rejected. Discovery does not infer ownership from titles.
Detected duplicate managed note markers stop updates without deleting notes.

Existing PDF notes keep `research-annotator-pdf-note-v1:<attachmentKey>` and their
existing parents. PDF service calls delegate to the existing attachment rebuild
queue. The extracted `_renderManagedAnnotationEntry` is used both by automatic
PDF notes and the reusable compiler. Generic scopes use
`research-annotator-managed-note-v1:<configurationID>`. Compilation groups by
publication, adds source attribution/direct annotation links, omits missing/deleted
sources and reads saved fields without provider requests. Automatic, manual and
static modes are implemented as service APIs; there is no new Explorer/dashboard
interface. PDF automatic mode remains the default.

PDF enumeration uses the attachment child-annotation index
(`getAnnotations(false,true)`) when available/loaded, with the prior library search
as a compatibility fallback. Managed-note lookup caches verified identities;
generic compilation caches attachment/metadata reads within each compilation.

Generated ranges reuse the existing normalized-HTML replacement mechanism.
Ownership snapshots detect edits inside generated entries and retain the edited
version as an explicit user snapshot alongside refreshed content. Archived
headings become h3 so normalized h2-link recognition cannot erase them. If all
custom wrappers have disappeared and content differs from the prior ownership
snapshot, the changed document is retained as a user snapshot rather than guessed
away. This can preserve more material than strictly necessary. It is not
bidirectional editing. Ordinary notes without a managed marker are untouched.
On first adoption, differing legacy owned entries can be archived conservatively.

PDF notes include a normalization-tolerant visible-text data fingerprint/count
marker. A device without local ownership rejects missing/mismatching data rather
than overwriting the note. Legacy notes with visible saved AI values missing
locally are protected too. This is a conservative local safeguard, not a distributed
completeness or conflict protocol. Existing native sync download notifier flags
are treated as existing annotations and do not trigger automatic paid generation.
Do not claim automatic cross-device convergence; see [SYNCHRONIZATION.md](SYNCHRONIZATION.md).

## Conversion, import and scope boundaries

Conversion flushes pending edits, registers its source before native conversion,
and recognizes early replacement notifications by exact attachment/text/type.
All global/color/AI metadata transfers to the replacement key, idempotently. The
source stays archived. Conflicting provisional target state is retained separately;
source values take precedence for the converted annotation. Missing/deleted item
guards prevent late saves from recreating an active annotation.

Pending creation drafts require exact passage and attachment/library context.
Color drafts are separate; globals remain common. Detached existing views flush
their drafts and release document observers; shutdown clears the discovery poller.
The reader discovery poller still exists while the extension is active.

Portable version-1 exports remain compatible and now optionally include note
configuration/job infrastructure. Local note ownership HTML/cache keys are excluded
from exports and never grant trust on another device. Only complete backups carry
job queues; imported jobs become interrupted. Imports preview/merge this state,
include it in rollback journals and refuse active background jobs. API credentials
remain excluded/redacted. An old backup without infrastructure is still accepted.
Local recovery snapshots are not substitutes for a matched Zotero database/profile
backup, which is also needed to restore actual Zotero notes/PDFs.

Deferred: automatic cross-device transport/conflict/deletion protocol, complete
batch dashboard, Explorer/filter UI, knowledge network, full-library background
indexing and measured production-scale performance. JSON snapshots/queue history
remain memory/file-size scaling limits. The 15,000-record test verifies indexed
lookup correctness, not end-to-end performance.

Legacy compatibility boundary: old color-wide prompts that attempted to populate manual fields are no longer permitted to write those fields through standard batch/review. Existing manual values remain intact. Define those requested outputs as explicit AI fields before using generation. Whole-response legacy prompts retain the read-only AI response adapter. Automatic schema conversion is deliberately not guessed; this is a remaining configuration/migration limitation under the new manual-field protection rule.
