# ResearchAnnotator

## Project vision

ResearchAnnotator is a Zotero extension designed to transform academic literature reading into a structured research knowledge management workflow.

The long-term goal is to integrate reading, annotation, structured data extraction, AI assistance, research notes and knowledge organization within Zotero.

## Development principles

- The product owner has a mechanical engineering and scientific research background but limited software development experience.
- Explain implementation decisions in accessible language.
- Investigate root causes rather than repeatedly patching symptoms.
- Trace dependencies and data flows before modifying functionality.
- Prefer maintainable architecture over temporary workarounds.
- Preserve existing working functionality.
- Avoid unrelated refactoring.
- Distinguish confirmed findings from hypotheses.
- Do not silently change established product requirements.

## Established functional requirements

- Each academic paper should have a consolidated research note.
- Highlights can have configurable structured fields based on their colors.
- Manual and AI-generated fields must coexist.
- Supported manual field types, including checkboxes and dropdowns, must remain functional.
- Structured fields must appear consistently in the highlight creation interface, existing annotation cards and consolidated research notes.
- AI fields must display their configured labels before generation.
- Ungenerated AI fields should display "Not generated yet".
- AI-generated fields are read-only in the ordinary manual editing interface.
- AI generation must remain explicitly accessible.
- Native Zotero Comment must remain independent of structured fields.
- Structured field values must persist across Zotero restarts.
- Changes to structured fields must be reflected in the consolidated research note.
- Failed AI operations must not destroy previously saved data.

## Repository safety

- Preserve existing uncommitted changes.
- Never delete untracked files, backups or candidate files without explicit user permission.
