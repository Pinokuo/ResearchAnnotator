# Managed-note duplication regression and repair

## Unified Workspace positioning follow-up

Open repair/restoration under **Tools → Research Workspace… → Notes**. The shared
engine now retains annotation-level user tails during insertion, deletion and
sort/group changes; it no longer moves all retained prose behind one generated
compilation. The bounded preservation, invisible metadata, incomplete-data guards
and backup-first repair behavior described below remain. See
[RESEARCH_WORKSPACE.md](RESEARCH_WORKSPACE.md) for positioning and native evidence.

Critical candidate fix, 2026-11-16. The owner reported recursive sections headed
“Preserved user-edited note snapshot” in the preceding real Zotero development build.
The implementation and tests below apply to the single shared managed-note engine,
including PDF, field, color and Explorer-filtered notes.

## Confirmed cause and normalization evidence

The old `infrastructure.js` `notes.preserveEdits` fallback ran when custom
`data-ra-entry` wrappers were absent and canonicalized note HTML differed from the
saved ownership snapshot. It returned **previous.content plus a blockquote containing
the entire current note**. That copied generated entries and every older preserved
snapshot. Subsequent rebuilds could copy those copies again. Even genuine user text
outside generated entries could trigger the whole-document fallback. This is a
confirmed algorithm defect, reproduced in isolated fixtures; the exact HTML of the
owner's affected live note was not inspected in this session.

Read-only inspection of installed Zotero 10.0.8's
`C:/Program Files/Zotero/app/omni.ja`, `resource/note-editor/editor.js`, confirms that
the editor parses and serializes through a schema. Paragraph/heading attributes
are explicitly enumerated; arbitrary plugin `div`/`data-ra-entry` boundaries are
not retained as managed boundaries. Blockquotes are ordinary native block nodes.
Link marks explicitly preserve `href` and `title` and add `rel` on serialization.
The serializer also normalizes Unicode to NFC. Inspected editor.js SHA256:
`3d90c8b1bd838b70b29ee6d26071ba170e7de407be746356d064f6369a3c2669`.

Thus native editor round-tripping can invalidate custom boundaries and
serialization-sensitive HTML comparisons. The structured-data fingerprint itself
comes from annotation keys/saved field values, not HTML; normalization does not
change those source values. It was the ownership comparison/preservation policy
that conflated serialization changes with user content.

## Shared fix

- Remove the whole-document preservation fallback entirely. A normalized document
  is never appended to itself or to its predecessor.
- Compare meaningful text and source-link targets, normalizing entities, whitespace
  and NFC; presentation wrappers, attributes and equivalent bold tags do not
  establish user authorship.
- Recognize normalized generated blocks from linked headings and saved generated
  blocks/labels. Retain genuine paragraphs outside them, including inter-entry
  prose. Collapse empty presentation containers and replace generated separators
  together with entries, avoiding invisible wrapper/separator growth.
- Preserve actual edits inside generated entries as bounded entry/block material,
  excluding existing blockquotes from generated replacement. Never preserve the
  entire document. Formatting-only changes inside generated content are treated as
  managed presentation; ordinary user-authored content outside it stays intact.
- Stop normal regeneration on legacy plugin-labelled whole-note snapshots with an
  actionable repair error; do not silently perform a destructive cleanup.
- Store identity/completeness markers in a supported title-link `href`, not tiny
  visible paragraphs. Retain legacy marker discovery. Local ownership can also
  resolve a stable native note key if its title link is manually removed; imported
  configurations without local ownership do not gain that authority.
- Persist PDF ownership after successful native note saving, using returned note
  HTML. Stale caller ownership cannot overwrite authoritative local ownership when
  requesting synchronization. Structured annotation data and existing incomplete-
  data guards remain authoritative and unchanged by repair.

## Repair and recovery in Zotero

1. Open **Tools → Research Notes…** and find the affected managed note. Pause active
   generation jobs before reviewing/repairing affected notes.
2. Choose **Repair duplicated snapshots…** and review its confirmation.
3. Before touching the note, the shared backup service writes an immutable
   `managed-note-repair-*.json` under the Zotero data directory's
   `researchannotator-backups`. It contains exact original HTML, native note key,
   library identity and configuration. A failed backup aborts repair.
4. Repair flattens only blockquotes whose opening paragraph is the exact plugin
   snapshot label. Ordinary blockquotes are retained. Verified generated duplicates
   already present outside snapshots are removed from those snapshots. Genuine or
   uncertain historical fragments are retained once as **Recovered content for
   review**. Unique evidence surviving only inside a snapshot is retained too.
   This conservative recovery may leave some old generated-looking material for
   human review; it does not guess that unfamiliar scientific prose is disposable.
5. Review the repaired content and the displayed backup path, then regenerate as
   appropriate for the note's mode. Note identity and source structured data do not
   change. Incomplete/malformed snapshot boundaries stop repair rather than guessing.
6. **Restore pre-repair note…** restores the exact backup, first backing up the current
   repaired version. Restored notes enter manual mode to pause automatic updates.
   Restoring intentionally restores the original historical HTML too; repair it
   again before requesting regeneration if it contains recursive snapshots.

The repair checks for concurrent note changes during backup. Recovery is local;
these JSON files are not a substitute for a matched Zotero database/profile backup.

## Evidence and remaining live verification

Regression fixtures cover 100 consecutive normalized PDF rebuilds, 100 rebuilds for
generic field/color/filtered notes, restart, source additions/edits/deletions, AI
updates, genuine prose before/between/after generated content, nested snapshots,
ordinary quotes, backup failure, restoration and stable native identity. Unchanged
fixture notes remain byte-stable. One historical test's expectation of a whole-note
snapshot was corrected to assert retained user prose without copied generated
content; its preservation coverage remains.

Required live checks: use a copy of an affected note in the development profile;
verify backup/repair/restore, reopen in Zotero's editor, repeatedly regenerate,
compare note sizes/content, check invisible metadata-link retention and source
links, edit genuine user prose, update AI/source values, delete annotations and
restart Zotero. Mocked normalization and browser fixtures do not replace native
editor/provider/filesystem/compatibility acceptance.

Final integrated candidate: [20261116-085209-893](DEVELOPMENT-BUILD-20261116-085209-893.json), C:/Users/Ahmed/Documents/ResearchAnnotatorBuilds/ResearchAnnotator-dev-20261116-085209-893.xpi. **226 tests passed**, 0 failed/skipped; all 190 preceding cases retained with the documented legacy snapshot assertion correction. 27 packaged files byte-verified; 18 runtime and 4 test JavaScript files syntax-checked; 3 XHTML files parsed as XML; git diff --check passed. Final mocked 15,000-record measurement: 1583 ms cold / 25 ms cached, 25-row page. Package SHA256: `8a309b2f8c6d7693b6ee91dbece5d83bea99c760349616230f569d19148c5254`. Native Zotero acceptance pending.
