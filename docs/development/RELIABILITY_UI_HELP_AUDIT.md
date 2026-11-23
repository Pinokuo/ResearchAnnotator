# Research interface explanations — 2026-11-22

The shared Workspace heading names the selected tab and immediately explains its purpose. Chat explains source selection, indexing, questions, citations and capture. Help is supplied through short text and native tooltips rather than another primary panel.

| Interface | Controls reviewed and explanation policy |
| --- | --- |
| Explorer | Scope and selected Zotero items; text search; native/structured fields; comparison operators and AND/OR filter combinations; search/cancel; result navigation; saved-search and note handoff. Scope/filter tooltips explain where and how to search; existing navigation descriptions remain. |
| Notes | Guided type/source/content/preview/generate; include/omit settings; AI-existing versus explicit generation; destinations; Automatic/Manual/Static; Open/Update/Rename/Move; missing-note recovery; repair/restoration; defaults migration; bulk modes. Recovery and destructive operations retain their confirmations. Bulk mode preview does not change content defaults. |
| Saved Searches | Select, reopen, duplicate, rename, delete, preview, and transfer results. The section explains that a saved search retains filters for reuse; destructive confirmations and existing search state remain. |
| Activity | Queued/running/completed/failure states; progress; paid-work warnings; pause/resume/retry/cancel. The explanation distinguishes cancellation from undo and explicit retry from automatic repeat. Persistent checkpoints remain authoritative. |
| Network | Entity selection/search; relationship type/source/target; evidence roles; list/graph; topics and questions; create/edit/delete; advanced types/filters; AI suggestions and acceptance. Context help distinguishes a connection from a verified scientific claim; AI proposals still require review. |
| Research Chat | Source manager, scope/subcollections/custom choices, selected notes, local indexing, optional locations/embeddings, separate embedding protocol/model, evidence mode, Keyword/Semantic/Hybrid, budget, optional context, consent, question/send/stop/retry, citations and capture. Coverage is checked before the first question. Note context is explicitly distinguished from PDF evidence. |

Configured scientific field labels and intentional localization are preserved. Clear existing tooltips are retained. Dynamic buttons, selects, text inputs, checkboxes and disclosure summaries receive contextual help; the observer is scoped to the research interface and disconnected on unload. The browser regression verifies dynamic help and that an adjacent native Zotero control is untouched.

Some labels are self-explanatory (for example Open or Save) and use a short contextual action hint. Advanced technical details remain secondary. Native screenshots are inspected for readable text, clipping, accessible controls and manageable bulk-list scrolling.


Explicitly opened citation/capture previews scroll into view and receive keyboard focus. Restoring a capture draft in the other Chat view does not move focus. Both behaviors are verified with real DOM views; native capture is confirmed through the actual preview controls.

Source coverage and the short Chat purpose remain visible before a question is submitted. An inherited CSS selector had hidden these new guidance paragraphs; the selector now explicitly retains them. Browser checks load the actual shared styles, and native checks require nonzero visible coverage bounds. Explicit note-only mode does not display an irrelevant embedding-model warning.

Final inspection: 30 native screenshots and the styled browser fixture confirm visible guidance and reachable controls. Explicit note-only answers show note-context coverage rather than counting notes as PDFs. See RELIABILITY_VERIFICATION.json for 119 passing native checks and the exact delivered artifact.
