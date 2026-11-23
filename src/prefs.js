// Default preferences use extensions.zotero.researchannotator.*.

// ---- Provider ----
pref("extensions.zotero.researchannotator.globalFields", "");
pref("extensions.zotero.researchannotator.fieldCategories", "{}");
pref("extensions.zotero.researchannotator.suggestionDismissals", "{}");
pref("extensions.zotero.researchannotator.aiConcurrency", 1);
// "openai" = Mistral or any remote OpenAI-compatible endpoint
// Ollama selects a local model connection.
// "cli"    = Claude Code CLI local
pref("extensions.zotero.researchannotator.provider", "openai");

// OpenAI-compatible API, defaulting to Mistral.
pref("extensions.zotero.researchannotator.apiKey", "");
pref("extensions.zotero.researchannotator.model", "mistral-large-latest");
pref("extensions.zotero.researchannotator.endpoint", "https://api.mistral.ai/v1/chat/completions");

// Local Ollama requires no key.
pref("extensions.zotero.researchannotator.ollamaEndpoint", "http://localhost:11434/v1/chat/completions");
pref("extensions.zotero.researchannotator.ollamaModel", "llama3.1");

// Apple Intelligence is local on macOS 26+; compile its helper on demand.
// Leave the helper path empty to use the extension-managed binary.
pref("extensions.zotero.researchannotator.applePath", "");
pref("extensions.zotero.researchannotator.swiftcPath", "/usr/bin/swiftc");

// Claude Code CLI (local).
pref("extensions.zotero.researchannotator.cliPath", "claude");
pref("extensions.zotero.researchannotator.cliModel", "");
// Effort level (--effort): "" inherits Claude Code's setting.
pref("extensions.zotero.researchannotator.cliEffort", "");
// Cache installed CLI models, effort levels and version as JSON,
// as reported by Detect in settings.
pref("extensions.zotero.researchannotator.cliCaps", "");

pref("extensions.zotero.researchannotator.temperature", "0.2");

// ---- Sortie ----
pref("extensions.zotero.researchannotator.language", "français");
pref("extensions.zotero.researchannotator.maxWords", 80);

// ---- Contexte transmis ----
pref("extensions.zotero.researchannotator.sendContext", true);
pref("extensions.zotero.researchannotator.maxAbstractChars", 1200);
// Resolve numeric or author-year citation calls through internal links.
// PDF internal links first, extracted bibliography as fallback.
pref("extensions.zotero.researchannotator.resolveCitations", true);
pref("extensions.zotero.researchannotator.maxRefs", 8);

// Failure handling.
// Previously an unsuccessful request silently left an unfilled annotation.
// Apply safe retry policy, then mark failures so users can explicitly retry.
// find and retry it.
pref("extensions.zotero.researchannotator.retries", 1);
pref("extensions.zotero.researchannotator.markFailures", true);
pref("extensions.zotero.researchannotator.failedTag", "annota-failed");

// Use provider-enforced JSON field output where supported,
// including Mistral/OpenAI and Ollama. Fall back to name: value
// parsing if the response is not usable JSON.
pref("extensions.zotero.researchannotator.structuredOutput", true);

// Generation triggers.
pref("extensions.zotero.researchannotator.alsoUnderline", false);
pref("extensions.zotero.researchannotator.overwrite", false);
pref("extensions.zotero.researchannotator.showPlaceholder", true);

// ---- Colors ----
// JSON { "#ffd400": { prompt, trigger, template }, … }.
// Empty by default: unconfigured colors are not processed.
pref("extensions.zotero.researchannotator.colorPrompts", "");

// ---- Research Chat (item sidebar panel) ----
// An empty Chat provider inherits annotation settings; otherwise select its provider.
pref("extensions.zotero.researchannotator.chatProvider", "");
// Chat models inherit annotation models when their settings are empty.
pref("extensions.zotero.researchannotator.chatModel", "");
pref("extensions.zotero.researchannotator.chatOllamaModel", "");
pref("extensions.zotero.researchannotator.chatCliModel", "");
pref("extensions.zotero.researchannotator.chatCliEffort", "");
// Context budgets count characters; zero selects a provider-specific default.
// Claude CLI 200 000, Ollama 12 000, Apple 6 000).
pref("extensions.zotero.researchannotator.chatMaxChars", 0);
pref("extensions.zotero.researchannotator.chatIncludeAnnotations", true);
pref("extensions.zotero.researchannotator.chatIncludeNotes", true);
// Chat can propose note edits, additions or creation, but nothing
// is written until an explicit Apply action.
pref("extensions.zotero.researchannotator.chatEditNotes", true);
// Remember selected Chat collections separately for each library:
// JSON maps libraryID to keys and sub; empty means the whole library.
pref("extensions.zotero.researchannotator.chatCollections", "");
// Historical library scope limits how many items enter model context.
pref("extensions.zotero.researchannotator.chatLibraryItems", 8);
// Additional Chat preferences such as tone, language and formatting.
pref("extensions.zotero.researchannotator.chatInstructions", "");
// Show Ask ResearchAnnotator in the reader selection popup.
pref("extensions.zotero.researchannotator.chatSelectionButton", true);
// Chat history remains in the compatibility file annota-chats.json.
pref("extensions.zotero.researchannotator.chatKeepHistory", true);
// The Chat shortcut uses Command on macOS or Control plus this
// letter; empty disables it without removing the toolbar button.
pref("extensions.zotero.researchannotator.chatShortcut", "J");

// ---- Interface ----
// Language: "auto" (Zotero language), "en" or "fr".
pref("extensions.zotero.researchannotator.uiLanguage", "auto");

// ---- Spelling and grammar (macOS, NSSpellChecker) ----
// Language: auto uses platform detection, otherwise use a language code.
pref("extensions.zotero.researchannotator.spellLanguage", "auto");
pref("extensions.zotero.researchannotator.spellGrammar", true);
// Live checking applies to notes and native annotation Comments.
pref("extensions.zotero.researchannotator.spellLive", true);

// Display color fields in the reader sidebar annotation card,
// while retaining the independent native Comment control.
pref("extensions.zotero.researchannotator.cardFields", true);
