# Privacy and provider boundaries

Local PDF extraction, indexes, keyword retrieval and the optional hardware advisor do not require AI-provider requests. Indexes are rebuildable local data; avoid adding them to portable research backups unnecessarily.

Chat generation sends the question, bounded retrieved passages, conversation context and any optional research context you select to the configured generation provider. AI fields send their configured annotation context. External providers may charge for these requests and have their own retention terms.

Optional embeddings send selected passage text during indexing and questions during semantic retrieval to the configured endpoint after the existing approval flow. Embedding and generation models are configured separately. Selecting Keyword only removes the need for embeddings, not the need for a generation provider when asking for an AI answer.

Local Ollama with a downloaded local model keeps inference on that machine. A remote endpoint or cloud-labelled model changes that boundary. No model is silently downloaded by this guide or the hardware advisor. Keep local services private to the machine unless you understand and secure a network deployment.

PDF text is untrusted research content, not trusted instructions. Check original evidence and model interpretations yourself. A validated reference means the reference was among supplied evidence; it does not prove scientific correctness.

Research exports and screenshots can contain sensitive material even without credentials. Review them before sharing. Never post API keys, access tokens, full profiles or private library content in public Issues.
