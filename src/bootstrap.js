/* eslint-disable no-undef */
// ResearchAnnotator — Zotero 7 through 10 extension
// On highlight creation, apply the configured AI policy to its source text.
// Persist results in structured fields; native Comment remains independent.

var Annota;

const PREF_BRANCH = "researchannotator.";

// Legacy temporary placeholder used during a network call, then replaced.
const PLACEHOLDER = "⏳ Generating…";

function getPref(key, fallback) {
	let val = Zotero.Prefs.get(PREF_BRANCH + key);
	return (val === undefined || val === null) ? fallback : val;

}
function migratePreferences() {
    const oldBranch = "extensions.zotero.annota.";
    const newBranch = "extensions.zotero.researchannotator.";

    try {
        const oldKeys = Services.prefs
            .getBranch(oldBranch)
            .getChildList("", {});

        let copied = 0;

        for (const key of oldKeys) {
            const oldKey = "annota." + key;
            const newKey = "researchannotator." + key;

            // Only migrate settings explicitly saved by the user.
            if (!Zotero.Prefs.prefHasUserValue(oldKey, true)) {
                continue;
            }

            // Never overwrite an existing user setting.
            if (Zotero.Prefs.prefHasUserValue(newKey, true)) {
                continue;
            }

            const value = Zotero.Prefs.get(oldKey, true);
            Zotero.Prefs.set(newKey, value, true);
            copied++;
        }

        Zotero.debug(
            `[ResearchAnnotator] Preference migration complete: ${copied} setting(s) copied.`
        );

        return copied;
    } catch (error) {
        Zotero.debug(
            `[ResearchAnnotator] Preference migration failed: ${error}`
        );
        return 0;
    }
}

function log(msg) {
	Zotero.debug("[ResearchAnnotator] " + msg);
}

function toast(title, body, type = "default") {
	try {
		let pw = new Zotero.ProgressWindow({ closeOnClick: true });
		pw.changeHeadline(title);
		if (body) {
			let icon = type === "error"
				? "chrome://zotero/skin/cross.png"
				: "chrome://zotero/skin/tick.png";
			pw.addLines([body], [icon]);
		}
		pw.show();
		pw.startCloseTimer(type === "error" ? 6000 : 2500);
	}
	catch (e) {
		log("toast failed: " + e);
	}
}

Annota = {
	id: null,
	prefPaneID: null,
	version: null,
	rootURI: null,
	notifierID: null,
	inProgress: new Set(),
    _pendingAnnotationConversions: new Map(),

	// There is deliberately no default color-wide prompt: each highlight color
	// has its own configuration, and an unconfigured color is not processed.
	// This allows generation to be enabled for selected colors only.
	//
	// Variables substituted at runtime:
	// {{text}} highlighted text; see buildMessages for advanced mode.
	// {{title}} source document title
	// {{authors}} source authors, with names separated by commas.
	// {{year}} source publication year.
	// {{abstract}} source abstract, truncated by the configured limit.
	//   {{publication}} revue / ouvrage / actes
	// {{page}} page containing the highlighted passage.
	// {{maxWords}} maximum output length setting.
	// {{language}} output language setting.
	// Prompt examples are provided in PROMPT-EXAMPLES.txt.

	// Fallback palette when Zotero.Annotations.COLORS is unavailable.
	// Keep aligned with chrome/content/zotero/xpcom/annotations.js.
	FALLBACK_COLORS: [
		{ hex: "#ffd400", name: "Yellow" },
		{ hex: "#ff6666", name: "Red" },
		{ hex: "#5fb236", name: "Green" },
		{ hex: "#2ea8e5", name: "Blue" },
		{ hex: "#a28ae5", name: "Purple" },
		{ hex: "#e56eee", name: "Magenta" },
		{ hex: "#f19837", name: "Orange" },
		{ hex: "#aaaaaa", name: "Gray" }
	],

	// Read the native highlight palette directly from Zotero so it stays
	// Matches the reader's native color picker even when Zotero
	// changes its palette. Source format: [localization key, hex].
	get COLORS() {
		try {
			let raw = Zotero.Annotations && Zotero.Annotations.COLORS;
			if (Array.isArray(raw) && raw.length) {
				return raw.map(pair => ({
					hex: String(pair[1]).toLowerCase(),
					name: this.colorLabel(String(pair[0]).replace(/^general-/, ""))
				}));
			}
		}
		catch (e) {
			log("COLORS: native palette unavailable; using fallback: " + e);
		}
		return this.FALLBACK_COLORS.map(c => ({ hex: c.hex, name: this.colorLabel(c.name) }));
	},

	// Localized shade name, for example yellow in the current UI language.
	colorLabel(raw) {
		let base = String(raw || "").toLowerCase();
		let key = "color." + base;
		let tr = this.t(key);
		return tr !== key ? tr : base.replace(/^./, m => m.toUpperCase());
	},

	// Historical color prompt map; empty values have no configured prompt.
	getColorPrompts() {
		try {
			let raw = String(getPref("colorPrompts", "") || "").trim();
			if (!raw) return {};
			let obj = JSON.parse(raw);
			return (obj && typeof obj === "object") ? obj : {};
		}
		catch (e) {
			log("Invalid colorPrompts JSON retained but ignored: " + e);
			return {};
		}
	},

	// Areas around figures, tables or page regions have their own
	// per-color settings in the same JSON under image:#hex.
	// Functions accepting a color also accept this area key.
	colorKey(color, type) {
		let hex = String(color || "").toLowerCase();
		return type === "image" ? "image:" + hex : hex;
	},

	isImageKey(color) {
		return String(color || "").startsWith("image:");
	},

	keyForItem(item) {
		return this.colorKey(item && item.annotationColor, item && item.annotationType);
	},

	hasImageEntries() {
		return Object.keys(this.getColorPrompts()).some(k => this.isImageKey(k) && this.getColorEntry(k));
	},

	// Normalized color configuration: { prompt, trigger, template }, or null.
	// Compatibility: a string means { prompt, trigger: 'auto', template: '' }.
	// Automatic triggers missing AI fields when the annotation is created.
	// Manual requires an explicit generation action.
	// Legacy structured-output template; empty uses the model response.
	// A historical entry can have a prompt or a template; a template without
	// {{ai}} is deterministic and needs no model request.
	getColorEntry(color) {
		if (!color) return null;
		let raw = this.getColorPrompts()[String(color).toLowerCase()];
		if (!raw) return null;
		if (typeof raw === "string") {
			return raw.trim()
				? { prompt: raw, trigger: "auto", template: "", fields: "", label: "" }
				: null;
		}
		if (typeof raw !== "object") return null;
		let prompt = String(raw.prompt || "");
		let template = String(raw.template || "");
		let fields = String(raw.fields || "");
		// A label alone names a configuration but does not activate generation.
		// Otherwise a color without fields or a prompt would appear configured
		// while producing no output.
		if (!prompt.trim() && !template.trim() && !fields.trim() && !["auto","manual"].includes(raw.trigger)) return null;
		return {
			prompt,
			template,
			fields,
			label: String(raw.label || "").trim(),
			trigger: raw.trigger === "manual" ? "manual" : "auto"
		};
	},

	// Per-color custom fields.
	//
	// One field per line: name | Label | type | options.
	// Types: text (default), textarea, check or select.
	// For select, options are comma-separated choices.
	// Each field becomes a {{name}} variable in prompts and templates.
	// Ignore reserved built-in names so a field cannot silently
	// overwrite {{text}}, {{comment}} or another built-in variable.
	RESERVED_VARS: [
		"text", "comment", "title", "authors", "year", "abstract",
		"publication", "page", "references", "maxWords", "language", "ai"
	],

	// Supported formatting is applied to the field value in the generated
	// structured output. Plain leaves the value unchanged.
	FORMATS: {
		plain: v => v,
		bold: v => "<b>" + v + "</b>",
		italic: v => "<i>" + v + "</i>",
		bolditalic: v => "<b><i>" + v + "</i></b>",
		underline: v => "<u>" + v + "</u>"
	},

	_normFormat(w) {
		let k = String(w || "").toLowerCase().replace(/[\s_-]/g, "");
		// An empty column is not a format; treating it as plain would prevent
		// the preceding column from being inspected.
		if (!k) return null;
		if (k === "gras") k = "bold";
		if (k === "italique") k = "italic";
		if (k === "normal") k = "plain";
		if (k === "souligne" || k === "souligné") k = "underline";
		return Object.prototype.hasOwnProperty.call(this.FORMATS, k) ? k : null;
	},

	// Explain the purpose of reserved names instead of merely reporting
	// a reserved-name error after a user's field has been ignored.
	RESERVED_HINTS: {
		text: "the highlighted passage",
		comment: "the comment already in the annotation",
		title: "the document title",
		authors: "the document authors",
		year: "the document year",
		abstract: "the document abstract",
		publication: "the journal, book or proceedings",
		page: "the page of the passage",
		references: "works cited inside the passage",
		maxWords: "your length setting",
		language: "your language setting",
		ai: "the model's reply"
	},

	// Always-valid predictable fallback name, for example page to myPage.
	suggestName(name) {
		return "my" + String(name).replace(/^./, m => m.toUpperCase());
	},

	// Review a field schema and report ignored or ambiguous definitions.
	// parseFieldSchema continues silently at runtime, but settings must
	// explain the problem. Return a list of diagnostic objects:
	// { line, level, message }; error means the definition will not apply,
	// and warn means its behavior differs from the apparent intent.
	validateFieldSchema(raw) {
		let out = [], seen = new Map();
		let lines = String(raw || "").split("\n");
		const TYPES = ["text", "textarea", "check", "select", "multiselect", "ai"];

		for (let i = 0; i < lines.length; i++) {
			let line = lines[i].trim();
			if (!line || line.startsWith("#")) continue;
			let n = i + 1;
			let parts = line.split("|").map(x => x.trim());
			let rawName = parts[0] || "";
			let name = rawName.replace(/[^\w]/g, "");

			if (!name) {
				out.push({ line: n, level: "error",
					message: this.t("lint.noname") });
				continue;
			}
			if (name !== rawName) {
				out.push({ line: n, level: "warn",
					message: this.t("lint.renamed", { raw: rawName, name }) });
			}
			if (this.RESERVED_VARS.includes(name)) {
				out.push({ line: n, level: "error",
					message: this.t("lint.reserved", { name,
						hint: this.t(this.RESERVED_HINTS[name] ? "hint." + name : "hint.reserved"),
						suggest: this.suggestName(name) }) });
				continue;
			}
			if (seen.has(name)) {
				out.push({ line: n, level: "error",
					message: this.t("lint.dup", { name, line: seen.get(name) }) });
			}
			else seen.set(name, n);

			let type = (parts[2] || "").toLowerCase();
			if (parts[2] && !TYPES.includes(type)) {
				out.push({ line: n, level: "warn",
					message: this.t("lint.type", { type: parts[2] }) });
			}

			// Match parseFieldSchema's interpretation of columns four and five.
			let col4 = parts[3] || "", col5 = parts[4] || "";
			let format = this._normFormat(col5);
			let extra = col4;
			if (!format) {
				let asFormat = this._normFormat(col4);
				if (asFormat && type !== "ai" && type !== "multiselect" && !(type === "select" && col4.includes(","))) {
					extra = "";
				}
			}
			if (col5 && !format) {
				out.push({ line: n, level: "warn",
					message: this.t("lint.format", { fmt: col5 }) });
			}
			if (type === "select" && !extra.split(",").map(x => x.trim()).filter(Boolean).length) {
				out.push({ line: n, level: "warn",
					message: this.t("lint.select") });
			}
			if (type === "ai" && !extra.trim()) {
				out.push({ line: n, level: "error",
					message: this.t("lint.ai") });
			}
		}
		return out;
	},

	// Variables used in prompts or layouts that match neither a declared
	// field nor a built-in variable are almost always a typing error.
	// a typo, and they silently substitute an empty value.
	validateVariables(where, tpl, schema) {
		let known = this.RESERVED_VARS.concat(schema.map(f => f.name));
		let seen = new Set(), out = [];
		String(tpl || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name) => {
			if (!known.includes(name) && !seen.has(name)) {
				seen.add(name);
				out.push({ line: 0, level: "warn",
					message: this.t("lint.unknownvar", { where, var: "{{" + name + "}}" }) });
			}
			return m;
		});
		return out;
	},

	// Complete per-color validation for the settings panel.
	lintColorEntry(entry) {
		entry = entry || {};
		let out = this.validateFieldSchema(entry.fields);
		let schema = this.parseFieldSchema(entry.fields);
		out = out.concat(this.validateVariables(this.t("lint.where.prompt"), entry.prompt, schema));
		out = out.concat(this.validateVariables(this.t("lint.where.layout"), entry.template, schema));

		// {{ai}} is meaningful only in the output layout.
		if (/\{\{\s*ai\s*\}\}/.test(String(entry.prompt || ""))) {
			out.push({ line: 0, level: "warn",
				message: this.t("lint.aiprompt") });
		}
		return out;
	},

	// Syntax: name | Label | type | options | format.
	// The format can occupy column four or five. A recognized fourth-column
	// format is used as such; otherwise it contains options or instructions
	// for an AI field. This preserves older schemas.
	parseFieldSchema(raw) {
		let out = [];
		for (let line of String(raw || "").split("\n")) {
			line = line.trim();
			if (!line || line.startsWith("#")) continue;
			let parts = line.split("|").map(x => x.trim());
			let name = (parts[0] || "").replace(/[^\w]/g, "");
			if (!name) continue;
			if (this.RESERVED_VARS.includes(name)) {
				log("Field \"" + name + "\" ignored: reserved name");
				continue;
			}
			let type = (parts[2] || "text").toLowerCase();
			if (!["text", "textarea", "check", "select", "multiselect", "ai"].includes(type)) type = "text";

			let col4 = parts[3] || "", col5 = parts[4] || "";
			let format = this._normFormat(col5);
			let extra = col4;
			if (!format) {
				// With no fifth column, check whether column four is a known format.
				let asFormat = this._normFormat(col4);
				// AI fields retain their instructions in column four.
				if (asFormat && type !== "ai" && type !== "multiselect" && !(type === "select" && col4.includes(","))) {
					format = asFormat;
					extra = "";
				}
			}

			out.push({
				name,
				id: parts[5] || "",
				id: parts[5] || "",
				label: parts[1] || name,
				type,
				format: format || "plain",
				// Select uses choice options; AI uses instructions sent to the model.
				options: ["select", "multiselect"].includes(type)
					? extra.split(",").map(x => x.trim()).filter(Boolean) : [],
				prompt: type === "ai" ? extra : ""
			});
		}
		return out;
	},

	// Default layout when fields exist without an explicit template:
	// one line per field in declaration order, with formatting included
	// in the template itself. {{name}} remains the raw value, avoiding
	// double formatting in a custom layout.
	defaultLayoutFromFields(schema) {
		return schema.map(f => {
			let fn = this.FORMATS[f.format] || this.FORMATS.plain;
			return fn("{{" + f.name + "}}");
		}).join("\n");
	},

	// Use the entered template, or derive one from the fields.
	effectiveTemplate(entry) {
		let tpl = String((entry && entry.template) || "").trim();
		if (tpl) return tpl;
		let schema = this.parseFieldSchema(entry && entry.fields);
		return schema.length ? this.defaultLayoutFromFields(schema) : "";
	},

	// User-defined semantic name for the color, such as Method.
	// Elsewhere the native shade name still identifies the color swatch;
	// the semantic label identifies the research configuration being edited.
	// faire.
	labelForColor(color) {
		let entry = this.getColorEntry(color);
		return entry ? (entry.label || "") : "";
	},

	fieldsForColor(color) {
		let entry = this.getColorEntry(color);
		const fields = entry ? this.parseFieldSchema(entry.fields).map(f => ({ ...f,
			id: f.id || "c_" + this.fieldFingerprint(color + "/" + f.name), scope: "color" })) : [];
		if (Zotero.Prefs.set) {
			const aliases = JSON.parse(String(getPref("fieldAliases", "{}") || "{}")); let changed = false;
			for (const field of fields) {
				if (!(aliases[field.id] || []).includes(field.name)) { aliases[field.id] = [...(aliases[field.id] || []), field.name]; changed = true; }
			}
			if (changed) Zotero.Prefs.set("researchannotator.fieldAliases", JSON.stringify(aliases));
		}
		return fields;
	},

	fieldFingerprint(text) {
		let hash = 2166136261;
		for (const c of String(text)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
		return (hash >>> 0).toString(16);
	},
	newFieldID(prefix = "g") {
		const uuid = typeof Services !== "undefined" && Services.uuid
			? Services.uuid.generateUUID().toString() : Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
		return prefix + "_" + uuid.replace(/[^a-zA-Z0-9_]/g, "");
	},
	globalFieldConfig() {
		const raw = String(getPref("globalFields", "") || "");
		if (!raw) return { version: 1, fields: [] };
		const config = JSON.parse(raw);
		if (!Array.isArray(config.fields)) throw new Error("Invalid global field definitions; original settings retained.");
		return config;
	},
	getGlobalFields() {
		return this.globalFieldConfig().fields.map(f => ({ ...f, name: f.id, id: f.id,
			label: f.label || f.displayName || f.id, scope: "global", format: f.format || "plain", options: f.options || [], prompt: f.prompt || "" }));
	},
	saveGlobalFields(fields) {
		const config = this.globalFieldConfig(), seen = new Set();
		for (const field of fields) {
			if (!["text", "textarea", "check", "select", "multiselect", "ai"].includes(field.type)) throw new Error("Unsupported global field type.");
			if (!/^g_[\w]+$/.test(field.id) || seen.has(field.id)) throw new Error("Invalid or duplicate global field ID.");
			seen.add(field.id);
			const raw = [field.id, String(field.label || "").replace(/\|/g, " "), field.type,
				field.type === "ai" ? String(field.prompt || "").replace(/[|\n]/g, " ") : (field.options || []).join(",")].join(" | ");
			const errors = this.validateFieldSchema(raw).filter(e => e.level === "error");
			if (!String(field.label || "").trim() || errors.length) throw new Error(errors[0]?.message || "A field name is required.");
		}
		fields = fields.map(field => {
			const old = config.fields.find(f => f.id === field.id);
			return { ...field, historicalLabels: [...new Set([...(old?.historicalLabels || []), ...(field.historicalLabels || []), ...(old?.label ? [old.label] : [])])] };
		});
		const archived = [...(config.archivedFields || [])];
		for (const old of config.fields.filter(f => !fields.some(field => field.id === f.id))) {
			if (!archived.some(f => f.id === old.id)) archived.push(old);
		}
		Zotero.Prefs.set("researchannotator.globalFields", JSON.stringify({ ...config, version: 1, fields, archivedFields: archived }));
		if (typeof AnnotaCardFields !== "undefined" && AnnotaCardFields) AnnotaCardFields.refreshViews();
	},
	annotationFields(color) { return [...this.getGlobalFields(), ...this.fieldsForColor(color)]; },
	fieldByName(item, name) {
		const fields = this.annotationFields(this.keyForItem(item));
		const aliases = JSON.parse(String(getPref("fieldAliases", "{}") || "{}"));
		return fields.find(f => f.name === name) || fields.find(f => (aliases[f.id] || []).includes(name))
			|| this.globalFieldConfig().archivedFields?.filter(f => f.id === name).map(f => ({ ...f, name: f.id, scope: "global" }))[0];
	},
	categoryCatalog() {
		const catalog = JSON.parse(String(getPref("fieldCategories", "{}") || "{}"));
		if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) throw new Error("Invalid category catalog; original values retained.");
		return catalog;
	},
	categoryIDs(field, values) {
		const catalog = this.categoryCatalog(), entries = catalog[field.id] || {};
		const before = JSON.stringify(catalog);
		const ids = [];
		for (const value of Array.isArray(values) ? values : values ? [values] : []) {
			const label = String(value).trim();
			if (!label) continue;
			let id = Object.hasOwn(entries, label) ? label : Object.keys(entries)
				.find(key => entries[key].normalize("NFKC").toLocaleLowerCase() === label.normalize("NFKC").toLocaleLowerCase());
			if (!id) { id = this.newFieldID("v"); entries[id] = label; }
			if (!ids.includes(id)) ids.push(id);
		}
		catalog[field.id] = entries;
		const after = JSON.stringify(catalog);
		if (after !== before) Zotero.Prefs.set("researchannotator.fieldCategories", after);
		return ids;
	},
	categoryLabels(field, values) {
		const catalog = this.categoryCatalog()[field.id] || {};
		return (Array.isArray(values) ? values : values ? [values] : []).map(id => catalog[id] || String(id));
	},
	suggestionDismissals() {
		const value = JSON.parse(String(getPref("suggestionDismissals", "{}") || "{}"));
		if (!value || typeof value !== "object" || Array.isArray(value)
			|| Object.values(value).some(ids => !Array.isArray(ids) || ids.some(id => typeof id !== "string"))) throw Error("Invalid suggestion preferences; original categories retained.");
		return value;
	},
	categorySuggestionID(field, label) {
		const fold = value => String(value).trim().normalize("NFKC").toLocaleLowerCase();
		const entries = this.categoryCatalog()[field.id] || {};
		return Object.keys(entries).find(id => fold(entries[id]) === fold(label));
	},
	isSuggestionDismissed(field, label) {
		const id = this.categorySuggestionID(field, label);
		return !!id && (this.suggestionDismissals()[field.id] || []).includes(id);
	},
	setSuggestionDismissed(field, label, dismissed) {
		if (typeof AnnotaCardFields !== "undefined" && AnnotaCardFields?._maintenance) throw Error("Finish importing before changing suggestions.");
		const id = this.categorySuggestionID(field, label) || (dismissed ? this.categoryIDs(field, [label])[0] : null);
		if (!id) return;
		const state = this.suggestionDismissals(), ids = state[field.id] || [];
		const next = dismissed ? [...new Set([...ids, id])] : ids.filter(value => value !== id);
		if (JSON.stringify(next) === JSON.stringify(ids)) return;
		state[field.id] = next;
		Zotero.Prefs.set("researchannotator.suggestionDismissals", JSON.stringify(state));
	},
	categorySuggestions(field, query = "") {
		const fold = value => String(value).trim().normalize("NFKC").toLocaleLowerCase();
		const entries = this.categoryCatalog()[field.id] || {}, seen = new Set();
		return [...Object.values(entries), ...(field.options || [])].filter(label => {
			const key = fold(label); if (!key || seen.has(key)) return false;
			seen.add(key); return key.includes(fold(query)) && !this.isSuggestionDismissed(field, label);
		});
	},
	createMultiSelect(doc, field, values, onChange) {
		const control = doc.createElement("div"); control.className = "annota-multiselect";
		const chips = doc.createElement("div"), search = doc.createElement("input"), choices = doc.createElement("div");
		chips.className = "annota-field-chips"; choices.className = "annota-field-suggestions";
		search.type = "text"; search.placeholder = "Search or add a value...";
		search.setAttribute("aria-label", field.label); search.setAttribute("role", "combobox");
		search.setAttribute("aria-autocomplete", "list"); search.setAttribute("aria-haspopup", "grid");
		search.setAttribute("autocomplete", "off");
		choices.id = this.newFieldID("choices"); choices.setAttribute("role", "grid");
		choices.setAttribute("aria-label", field.label + " suggestions");
		search.setAttribute("aria-controls", choices.id);
		const fold = value => String(value).trim().normalize("NFKC").toLocaleLowerCase();
		let selected = Array.isArray(values) ? values.slice() : values ? [values] : [];
		let opened = false, active = -1, actions = [], observer;
		const win = doc.defaultView;
		const close = () => {
			opened = false; active = -1; choices.hidden = true;
			search.setAttribute("aria-expanded", "false"); search.removeAttribute?.("aria-activedescendant");
			observer?.disconnect(); observer = null;
			if (choices.hidePopover && choices.matches?.(":popover-open")) choices.hidePopover();
			win?.removeEventListener?.("resize", close); win?.removeEventListener?.("scroll", onScroll, true);
			if (choices.parentNode !== control) control.appendChild(choices);
		};
		const onScroll = event => { if (!choices.contains(event.target)) close(); };
		const position = () => {
			// Use the top layer when available, keeping DOM ownership inside the popup.
			// Older readers use a body-level fixed list to escape overflow clipping.
			if (!doc.body || !search.getBoundingClientRect) return;
			const rect = search.getBoundingClientRect(), width = Math.max(1, Math.min(rect.width, win.innerWidth - 16));
			const below = win.innerHeight - rect.bottom - 8, above = rect.top - 8;
			const upward = below < 120 && above > below, height = Math.max(40, Math.min(200, upward ? above : below));
			if (choices.showPopover) {
				choices.setAttribute("popover", "manual");
				if (!choices.matches(":popover-open")) choices.showPopover();
			}
			else doc.body.appendChild(choices);
			choices.style.cssText = "position:fixed;margin:0;inset:auto;z-index:2147483647;box-sizing:border-box;width:" + width +
				"px;left:" + Math.max(8, Math.min(rect.left, win.innerWidth - width - 8)) + "px;max-height:" + height +
				"px;" + (upward ? "bottom:" + (win.innerHeight - rect.top) : "top:" + rect.bottom) + "px;";
			const scheme = win.getComputedStyle?.(search).colorScheme;
			choices.style.colorScheme = scheme && scheme !== "normal" ? scheme :
				(win.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
			win.addEventListener("resize", close); win.addEventListener("scroll", onScroll, true);
			if (!observer && win.MutationObserver) {
				observer = new win.MutationObserver(() => { if (!control.isConnected) close(); });
				observer.observe(doc.body, { childList: true, subtree: true });
			}
		};
		control.readValues = () => selected.slice();
		control.setValues = next => { selected = Array.isArray(next) ? next.slice() : next ? [next] : []; render(); };
		control.addValue = label => {
			if (control.disabled || !String(label).trim()) return;
			this.setSuggestionDismissed(field, label, false);
			selected = this.categoryIDs(field, [...selected, label]); search.value = ""; close(); render(); onChange();
		};
		control.removeValue = id => { if (control.disabled) return; selected = selected.filter(value => value !== id); render(); onChange(); };
		control.setDisabled = disabled => { control.disabled = disabled; if (disabled) close(); render(); };
		const markActive = () => {
			actions.forEach((action, index) => action.node.setAttribute("aria-selected", String(index === active)));
			if (actions[active]) {
				search.setAttribute("aria-activedescendant", actions[active].node.id);
				actions[active].node.scrollIntoView?.({ block: "nearest" });
			}
			else search.removeAttribute?.("aria-activedescendant");
		};
		const render = () => {
			chips.replaceChildren(); choices.replaceChildren(); actions = []; active = -1;
			search.disabled = !!control.disabled;
			const labels = this.categoryLabels(field, selected), selectedLabels = new Set(labels.map(fold));
			selected.forEach((id, index) => {
				const chip = doc.createElement("button"); chip.type = "button"; chip.className = "annota-field-chip";
				chip.textContent = labels[index] + " \u00d7"; chip.setAttribute("aria-label", "Remove " + labels[index]);
				chip.disabled = !!control.disabled;
				chip.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); control.removeValue(id); }); chips.appendChild(chip);
			});
			if (!opened || control.disabled) { close(); return; }
			const option = (label, create = false) => {
				const node = doc.createElement("div"), cell = doc.createElement("div"), choose = doc.createElement("button");
				choose.type = "button"; choose.tabIndex = -1; cell.setAttribute("role", "gridcell");
				node.className = create ? "annota-field-create" : "annota-field-option";
				choose.textContent = create ? (this.isSuggestionDismissed(field, label) ? "Restore \u201c" : "Create \u201c") + label + "\u201d" : label;
				node.id = choices.id + "_" + actions.length; node.setAttribute("role", "row"); node.tabIndex = -1;
				node.addEventListener("mousedown", e => e.preventDefault());
				choose.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); control.addValue(label); search.focus?.(); });
				cell.appendChild(choose); node.appendChild(cell);
				if (!create) {
					const dismissCell = doc.createElement("div"), dismiss = doc.createElement("button");
					dismissCell.setAttribute("role", "gridcell"); dismiss.type = "button"; dismiss.className = "annota-dismiss-suggestion";
					dismiss.setAttribute("aria-label", "Dismiss suggestion " + label); dismiss.title = "Hide this suggestion; historical assignments stay saved";
					dismiss.addEventListener("click", e => {
						e.preventDefault(); e.stopPropagation(); if (control.disabled) return;
						this.setSuggestionDismissed(field, label, true); render(); search.focus?.();
					});
					dismissCell.appendChild(dismiss); node.appendChild(dismissCell);
				}
				actions.push({ node, label }); choices.appendChild(node);
			};
			for (const label of this.categorySuggestions(field, search.value).filter(label => !selectedLabels.has(fold(label)))) option(label);
			const query = search.value.trim();
			if (query && !selectedLabels.has(fold(query)) && !this.categorySuggestions(field).some(label => fold(label) === fold(query))) option(query, true);
			if (!actions.length) {
				const empty = doc.createElement("div"); empty.className = "annota-field-empty";
				empty.textContent = query ? "No unselected matches" : "Type to create a value"; choices.appendChild(empty);
			}
			choices.hidden = false; search.setAttribute("aria-expanded", "true"); position(); markActive();
		};
		search.addEventListener("focus", () => { opened = true; render(); });
		search.addEventListener("input", () => { opened = true; render(); });
		search.addEventListener("blur", e => { if (!choices.contains(e.relatedTarget)) close(); });
		search.addEventListener("keydown", e => {
			if (e.isComposing || !["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) return;
			e.preventDefault(); e.stopPropagation();
			if (e.key === "Escape") { close(); return; }
			if (!opened) { opened = true; render(); }
			if (e.key === "Enter") {
				if (active >= 0 && actions[active]) control.addValue(actions[active].label);
				else if (search.value.trim()) control.addValue(this.categorySuggestions(field).find(label => fold(label) === fold(search.value)) || search.value);
				return;
			}
			if (actions.length) { active = (active + (e.key === "ArrowDown" ? 1 : active < 0 ? 0 : -1) + actions.length) % actions.length; markActive(); }
		});
		control.appendChild(chips); control.appendChild(search); control.appendChild(choices); render();
		return control;
	},
	readManualField(field, control) {
		return field.type === "multiselect" ? control.readValues() : field.type === "check"
			? (control.checked ? "true" : "") : String(control.value || "").trim();
	},
	fieldDisplayValue(field, value) {
		return Array.isArray(value) ? this.categoryLabels(field, value).join(", ") : String(value ?? "");
	},
	async migrateLegacyGlobalFields() {
		const config = this.globalFieldConfig();
		if (!config.legacyDefinitions) {
			const fields = [...config.fields];
			for (const [key, label] of [["themes", "Research themes"], ["experiments", "Experiments"]]) {
				if (!fields.some(f => f.legacyKey === key)) fields.push({ id: "g_legacy_" + key, label, type: "multiselect", options: [], legacyKey: key });
			}
			// Definitions are checkpointed before values. A failed run resumes safely.
			Zotero.Prefs.set("researchannotator.globalFields", JSON.stringify({ ...config, fields, legacyDefinitions: true }));
		}
		await AnnotaCardFields.load();
		if (!this._globalMigrationLibraries) this._globalMigrationLibraries = new Set();
		for (const library of Zotero.Libraries.getAll()) {
			if (library.editable === false) continue;
			try {
				const current = await this._getResearchMetadata(library.libraryID);
				const legacyNote = await this._findResearchMetadataNote(library.libraryID);
				const legacy = legacyNote ? await this._getResearchMetadataFromNote(library.libraryID) : { annotations: {} };
				// Historical dedicated comments become an ordinary configurable global field.
				// Keep original metadata and native Comment unchanged; never re-add removed definitions.
				const latestConfig = this.globalFieldConfig();
				if (!latestConfig.legacyCommentDefinition && [current, legacy].some(data =>
					Object.values(data.annotations || {}).some(saved => String(saved.researchComment || "").trim()))) {
					const fields = [...latestConfig.fields];
					if (!fields.some(field => field.legacyKey === "researchComment")) fields.push({
						id: "g_legacy_comment", label: "Historical research comment", type: "textarea", legacyKey: "researchComment"
					});
					Zotero.Prefs.set("researchannotator.globalFields", JSON.stringify({ ...latestConfig, fields, legacyCommentDefinition: true }));
				}
				const attachments = new Set(), checkpoint = this.globalFieldConfig().migrationLibraries?.[library.libraryID];
				for (const field of this.getGlobalFields().filter(f => f.legacyKey && f.type === "multiselect")) {
					this.categoryIDs(field, [...(current[field.legacyKey] || []), ...(legacy[field.legacyKey] || [])]);
				}
				for (const item of await this._getAllResearchAnnotations(library.libraryID)) {
					if (!checkpoint && item.parentID) attachments.add(item.parentID);
					const key = `${library.libraryID}:${item.key}`, patch = {}, saved = AnnotaCardFields.get(item)?.values || {};
					for (const field of this.getGlobalFields().filter(f => f.legacyKey)) {
						if (field.legacyKey === "researchComment") {
							if (!Object.hasOwn(saved, field.name)) {
								const comments = [...new Set([current.annotations[key]?.researchComment, legacy.annotations?.[key]?.researchComment]
									.map(value => String(value || "").trim()).filter(Boolean))];
								if (comments.length) patch[field.name] = comments.join("\n\n");
							}
							continue;
						}
						const prefix = field.legacyKey === "themes" ? "RA:ThemeCatalog:" : "RA:ExperimentCatalog:";
						const catalogLabels = (item.getTags?.() || []).map(t => t.tag || "").filter(t => t.startsWith(prefix)).map(t => t.slice(prefix.length));
						if (catalogLabels.length) this.categoryIDs(field, catalogLabels);
						if (Object.hasOwn(saved, field.name)) continue;
						const labels = [...new Set([...(current.annotations[key]?.[field.legacyKey] || []), ...(legacy.annotations?.[key]?.[field.legacyKey] || [])])];
						if (labels.length) patch[field.name] = this.categoryIDs(field, labels);
					}
					if (Object.keys(patch).length) {
						await AnnotaCardFields.saveValues(item, patch);
						if (item.parentID) attachments.add(item.parentID);
					}
				}
				this._globalMigrationLibraries.add(library.libraryID);
				for (const parentID of attachments) {
					await this._syncPaperResearchNote({ libraryID: library.libraryID, parentID, existingOnly: true });
				}
				const latest = this.globalFieldConfig();
				Zotero.Prefs.set("researchannotator.globalFields", JSON.stringify({ ...latest,
					migrationLibraries: { ...(latest.migrationLibraries || {}), [library.libraryID]: 1 } }));
			}
			catch (e) { this._globalMigrationLibraries.delete(library.libraryID); log("Global-field migration incomplete; legacy sources retained for retry: " + e); }
		}
		AnnotaCardFields.refreshViews();
	},

	// Does this legacy output configuration require one whole-response value?
	// Without a template or fields, the response is the legacy output value.
	// A template containing {{ai}} needs that response; otherwise fields suffice.
	entryNeedsAI(entry) {
		if (!entry) return false;
		let tpl = this.effectiveTemplate(entry);
		if (!tpl) return true;
		return /\{\{\s*ai\s*\}\}/.test(tpl);
	},

	// An AI field needs the model even when the surrounding output
	// is assembled from existing fields.
	entryHasAIFields(entry) {
		return this.parseFieldSchema(entry && entry.fields).some(f => f.type === "ai");
	},

	// Does the historical color prompt populate structured fields?
	// This applies when fields and a prompt exist without an {{ai}} layout.
	// The model response is then constrained to declared fields rather
	// than treated as free-form output. Native Comment is not the target.
	entryFillsFields(entry) {
		if (!entry || !String(entry.prompt || "").trim()) return false;
		if (this.entryNeedsAI(entry)) return false;   // The response is the historical whole-output value.
		return this.parseFieldSchema(entry.fields).some(f => f.type !== "ai");
	},

	// Only unfilled fields need model output; AI fields have separate
	// instructions and are processed independently.
	fieldsToFill(schema, values) {
		return schema.filter(f => f.type !== "ai"
			&& !String((values && values[f.name]) || "").trim());
	},

	// Does this configuration use a provider for any purpose?
	entryUsesProvider(entry) {
		return this.entryNeedsAI(entry) || this.entryHasAIFields(entry)
			|| this.entryFillsFields(entry);
	},

	// Will this annotation need a request? entryUsesProvider describes
	// the configuration generally; here existing values matter because
	// a fully completed form leaves nothing for the model to generate.
	willCallProvider(entry, values) {
		if (!entry) return false;
		if (this.entryNeedsAI(entry)) return true;
		let schema = this.parseFieldSchema(entry.fields);
		if (schema.some(f => f.type === "ai" && f.prompt.trim()
				&& !String((values && values[f.name]) || "").trim())) return true;
		return this.entryFillsFields(entry)
			&& this.fieldsToFill(schema, values).length > 0;
	},

	// Configured color prompt, or an empty string.
	getPromptForColor(color) {
		let entry = this.getColorEntry(color);
		return entry ? entry.prompt : "";
	},

	// Active provider: openai for Mistral or another compatible endpoint.
	// "ollama" (local), "cli" (Claude Code local), "apple" (Apple Intelligence).
	// Known providers; an individual request can override the configured choice.
	// Use the Chat-specific setting if present, otherwise the annotation setting.
	PROVIDERS: ["openai", "ollama", "cli", "apple"],

	provider(override) {
		if (override && this.PROVIDERS.includes(override)) return override;
		let p = String(getPref("provider", "")).trim();
		if (p === "openai" || p === "ollama" || p === "cli" || p === "apple") return p;
		// Compatibility with the historical checkbox preference.
		return getPref("useClaudeCLI", false) ? "cli" : "openai";
	},

	// OpenAI-compatible connection settings, including remote Mistral or local Ollama.
	chatConfig(override) {
		if (this.provider(override) === "ollama") {
			return {
				endpoint: String(getPref("ollamaEndpoint",
					"http://localhost:11434/v1/chat/completions")).trim(),
				model: String(getPref("ollamaModel", "llama3.1")).trim() || "llama3.1",
				apiKey: "",          // Ollama does not require an API key.
				requiresKey: false
			};
		}
		return {
			endpoint: String(getPref("endpoint",
				"https://api.mistral.ai/v1/chat/completions")).trim(),
			model: String(getPref("model", "mistral-large-latest")).trim()
				|| "mistral-large-latest",
			apiKey: String(getPref("apiKey", "")).trim(),
			requiresKey: true
		};
	},

	// Validate provider readiness; return a message or null.
	providerReadyError(override) {
		let p = this.provider(override);
		if (p === "apple") {
			// Actual availability is checked on the first call, including compilation.
			return null;
		}
		if (p === "cli") {
			return String(getPref("cliPath", "claude")).trim()
				? null : this.t("err.cli.path");
		}
		let cfg = this.chatConfig(p);
		if (!cfg.endpoint) {
			return this.t(p === "ollama" ? "err.endpoint.ollama" : "err.endpoint");
		}
		if (cfg.requiresKey && !cfg.apiKey) {
			return this.t("err.key");
		}
		return null;
	},

	// ---- Interface language ----
	// uiLanguage: "auto" (Zotero language), "en" or "fr".
	lang() {
		let p = String(getPref("uiLanguage", "auto") || "auto");
		if (p === "en" || p === "fr") return p;
		let loc = "";
		try { loc = String(Zotero.locale || ""); } catch (e) {}
		return /^fr/i.test(loc) ? "fr" : "en";
	},

	get i18n() {
		return (typeof AnnotaI18n !== "undefined" && AnnotaI18n) || null;
	},

	// Translate text and substitute named variables; fall back to English,
	// then to the visible key so a missing translation can be diagnosed.
	t(key, vars) {
		let d = this.i18n || {};
		let s = d[this.lang()] && d[this.lang()][key];
		if (s == null) s = d.en && d.en[key];
		if (s == null) s = key;
		if (!vars) return s;
		return String(s).replace(/\{(\w+)\}/g, (m, k) =>
			Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m);
	},

	// Rebuild menus and Chat presentation when the language changes.
	relocalize() {
		for (let win of Zotero.getMainWindows()) {
			try {
				this.removeFromWindow(win);
				this.addToWindow(win);
				if (AnnotaChat) AnnotaChat.relocalizeWindow(win);
			}
			catch (e) { log("relocalize: " + e); }
		}
	},

	init({ id, version, rootURI }) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
        this._managedEngineRequired=true;
	},

	registerNotifier() {
		this.notifierID = Zotero.Notifier.registerObserver(
			this.notifierCallback,
			["item"],
			"annota"
		);
		log("Notifier registered (id=" + this.notifierID + ")");
	},

	unregisterNotifier() {
		if (this.notifierID) {
			Zotero.Notifier.unregisterObserver(this.notifierID);
			this.notifierID = null;
		}
	},

	notifierCallback: {
    notify(event, type, ids, extraData) {
        log(
            "[RA NOTIFIER] event=" + event
            + " type=" + type
            + " ids=" + JSON.stringify(ids)
            + " extraData=" + JSON.stringify(extraData)
        );

        if (type !== "item") return;

        if (!["add", "modify", "delete", "trash"].includes(event)) return;

        const notifiedAt = Date.now();

        for (const id of ids) {
            Annota._handlePaperNoteNotification(
                event,
                id,
                extraData,
                notifiedAt
            ).catch(e => {
                log(
                    "Paper-note notification failed ("
                    + event + ", " + id + "): " + e
                );
            });
        }
    }
},

async _handlePaperNoteNotification(event, id, extraData, notifiedAt) {
    // Deleted items are no longer available through Zotero.Items.
    // Zotero supplies their previous data through extraData.
    if (event === "delete") {
        const deleted = extraData?.[id];
        const old = deleted?.old || deleted;
        const cached = this._annotationParents?.get(id);

        const key = String(old?.key || deleted?.key || cached?.key || "");
        const libraryID = Number(
            old?.libraryID ?? deleted?.libraryID ?? cached?.libraryID
        );

        if (!key || !Number.isInteger(libraryID)) {
            log(
                "Cannot identify deleted annotation from notifier data: "
                + id
            );
            return;
        }

        if(typeof AnnotaInfrastructure!=='undefined'){
            const config=Object.values(AnnotaInfrastructure.state?.notes||{}).find(c=>(c.noteKey===key||c.orphanedNoteKey===key)&&AnnotaData.resolveLibrary(c.library)?.libraryID===libraryID);
            if(config){await AnnotaInfrastructure.notes.configure({...config,nativeDeletedKey:key});await AnnotaInfrastructure.notes.recoverOrphan({...config,nativeDeletedKey:key});return;}
        }
        const annotationKey = `${libraryID}:${key}`;

        if (!this._deletedAnnotationKeys) this._deletedAnnotationKeys = new Set();
        this._deletedAnnotationKeys.add(annotationKey);
        let parentID = old?.parentID || old?.parentItemID || cached?.parentID;
        if (!parentID) parentID = await this._attachmentForDeletedAnnotation(libraryID, key);
        if (parentID) {
            await this._syncPaperResearchNote({ libraryID, parentID, existingOnly: true });
        }

        log("Deleted annotation removed from paper note: " + annotationKey);
        return;
    }

    const item = await Zotero.Items.getAsync(id);

    if (!item) return;

    if(item.isNote?.()&&item.deleted&&typeof AnnotaInfrastructure!=='undefined'){const config=Object.values(AnnotaInfrastructure.state?.notes||{}).find(c=>c.noteKey===item.key&&AnnotaData.resolveLibrary(c.library)?.libraryID===item.libraryID);if(config)await AnnotaInfrastructure.notes.recoverOrphan(config);return;}
    if (!item.isAnnotation?.()) return;
    if (item.deleted) return;
    if (!this._annotationParents) this._annotationParents = new Map();
    this._annotationParents.set(id, { parentID: item.parentID, libraryID: item.libraryID, key: item.key });

    // Ignore the annotation modification caused by a note edit.
    const annotationKey = `${item.libraryID}:${item.key}`;

    if (this._paperNoteReverseSyncKeys?.has(annotationKey)) {
        this._paperNoteReverseSyncKeys.delete(annotationKey);
        return;
    }

    // Any modification to an annotation should update its paper note.
    // This is deliberately independent of AI configuration.
    if (event === "modify") {
        this._schedulePaperResearchNoteSync(item);
        return;
    }
    if (typeof AnnotaInfrastructure !== "undefined" && extraData?.[id]?.skipRenameFile === true) {
        // Installed syncLocal._saveObjectFromJSON supplies this notifier flag.
        // Treat downloaded/imported items as existing data, never new paid AI work.
        await this._syncPaperResearchNote({ libraryID: item.libraryID, parentID: item.parentID, existingOnly: true });
        return;
    }

    // Only add notifications initiate automatic generation. Repeated adds,
    // render callbacks and reopening a reader must not initiate another request.
    if (!this._newAnnotationEvents) this._newAnnotationEvents = new Set();
    if (this._newAnnotationEvents.has(annotationKey)) return;
    this._newAnnotationEvents.add(annotationKey);
    this._deletedAnnotationKeys?.delete(annotationKey);

    // New annotation.
    const isConversion = await this.handleConvertedAnnotation(id);

    if (isConversion) {
        const fresh = await Zotero.Items.getAsync(id);

        if (fresh?.isAnnotation?.()) {
            await this._syncPaperResearchNote(fresh);
        }

        return;
    }

    // Capture any research fields entered in the selection popup.
    try {
        await this.handleResearchMetadata(id);
    }
    catch (e) {
        log("handleResearchMetadata: " + e);
    }

    // Always create/update the paper note, even if AI is disabled,
    // no color prompt exists, or the annotation already has a comment.
    const fresh = await Zotero.Items.getAsync(id);

    if (fresh?.isAnnotation?.()) {
        await this._syncPaperResearchNote(fresh);
    }

    // AI comment generation remains optional and independent.
    await this.handleItem(id, notifiedAt);
},

async _syncPaperResearchNoteFromNote(note) {
    const content = note.getNote() || "";
    const doc = new DOMParser().parseFromString(content, "text/html");
    const entries = [];
    const entrySources = [];
    const seenEntryKeys = new Set();

    // New format: identifiers stored invisibly as HTML attributes.
    for (const container of Array.from(
        doc.querySelectorAll("div[data-ra-entry]")
    )) {
        const annotationKey =
            container.getAttribute("data-ra-entry") || "";

        if (!annotationKey || seenEntryKeys.has(annotationKey)) {
            continue;
        }

        seenEntryKeys.add(annotationKey);
        entrySources.push({ container, annotationKey });
    }

    // Legacy format: visible start/end marker paragraphs.
    // Keep supporting these until old notes have been safely rebuilt.
    const paragraphs = Array.from(doc.querySelectorAll("p"));

    for (const paragraph of paragraphs) {
        const markerText = paragraph.textContent.trim();

        if (!markerText.startsWith("RA_ENTRY_START:")) continue;

        const annotationKey = markerText.substring(
            "RA_ENTRY_START:".length
        );

        const container = paragraph.closest("div");
        if (!container) continue;

        const attributeKey =
            container.getAttribute("data-ra-entry") || "";

        // Prefer the attribute if this container already has one.
        if (attributeKey && attributeKey !== annotationKey) continue;

        if (seenEntryKeys.has(annotationKey)) continue;

        const endMarker = `RA_ENTRY_END:${annotationKey}`;
        const containerText = container.textContent || "";

        if (!containerText.includes(endMarker)) continue;

        seenEntryKeys.add(annotationKey);
        entrySources.push({ container, annotationKey });
    }

    for (const { container, annotationKey } of entrySources) {        const separator = annotationKey.indexOf(":");
        if (separator < 1) continue;

        const libraryID = Number(annotationKey.substring(0, separator));
        const itemKey = annotationKey.substring(separator + 1);

        if (!Number.isInteger(libraryID) || !itemKey) continue;

        const heading = container.querySelector("h2");
        if (!heading) continue;

        const mark = heading.querySelector("mark");
        const underlineElement = heading.querySelector("u");
        const spans = Array.from(heading.querySelectorAll("span"));

        // Support both the current <u> format and older border-bottom spans.
        const legacyUnderline = spans.find(span =>
            /border-bottom/i.test(span.getAttribute("style") || "")
        );

        const underline = underlineElement || legacyUnderline;

        let annotationText = "";
        let annotationType = "";
        let annotationColor = "";

        if (mark) {
            annotationText = mark.textContent || "";
            annotationType = "highlight";
            annotationColor =
                mark.style.backgroundColor
                || mark.getAttribute("style")
                || "";
        }
        else if (underline) {
            annotationText = underline.textContent || "";
            annotationType = "underline";
            annotationColor =
                underline.style.textDecorationColor
                || underline.style.borderBottomColor
                || underline.getAttribute("style")
                || "";
        }
        else {
            annotationText = heading.textContent
                .replace(/^\s*\d+\.\s*/, "")
                .trim();
        }

        // Convert CSS RGB or hexadecimal colors into Zotero's #RRGGBB.
        const colorMatch = String(annotationColor).match(
            /#([0-9a-f]{6})\b|rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i
        );

        if (colorMatch) {
            if (colorMatch[1]) {
                annotationColor = "#" + colorMatch[1];
            }
            else {
                annotationColor = "#" + colorMatch.slice(2, 5)
                    .map(value => Number(value).toString(16).padStart(2, "0"))
                    .join("");
            }
        }
        else {
            annotationColor = "";
        }

        const getField = label => {
            const paragraph = Array.from(
                container.querySelectorAll("p")
            ).find(p =>
                p.textContent.trim().toLowerCase().startsWith(
                    label.toLowerCase() + ":"
                )
            );

            if (!paragraph) return "";

            const text = paragraph.textContent.trim();
            const colonIndex = text.indexOf(":");

            return colonIndex >= 0
                ? text.slice(colonIndex + 1).trim()
                : "";
        };

        const splitList = value => value
            ? value.split(",").map(part => part.trim()).filter(Boolean)
            : [];

        entries.push({
            annotationKey,
            libraryID,
            itemKey,
            annotationText,
            annotationType,
            annotationColor,
            comment: getField("Comment") || getField("Research comment"),
            themes: splitList(getField("Themes")),
            experiments: splitList(getField("Experiments"))
        });
    }

    if (!entries.length) {
        log("No editable annotation entries found in research note: " + note.key);
        return;
    }

    const libraryID = note.libraryID;
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("resultLevel", "annotation");

    const ids = await search.search();
    const annotations = new Map();

    for (const id of ids) {
        const item = await Zotero.Items.getAsync(id);
        if (item?.isAnnotation?.()) {
            annotations.set(
                `${item.libraryID}:${item.key}`,
                item
            );
        }
    }

    if (!this._paperNoteReverseSyncKeys) {
        this._paperNoteReverseSyncKeys = new Map();
    }

    let updatedAnnotations = 0;

    for (const entry of entries) {
        const item = annotations.get(entry.annotationKey);
        if (!item) continue;

        let changed = false;

        if (
            item.annotationText !== entry.annotationText
            && entry.annotationText
        ) {
            item.annotationText = entry.annotationText;
            changed = true;
        }

        if (
            entry.annotationType
            && item.annotationType !== entry.annotationType
        ) {
            item.annotationType = entry.annotationType;
            changed = true;
        }

        if (
            entry.annotationColor
            && item.annotationColor !== entry.annotationColor
        ) {
            item.annotationColor = entry.annotationColor;
            changed = true;
        }

        if (item.annotationComment !== entry.comment) {
            item.annotationComment = entry.comment;
            changed = true;
        }

        if (changed) {
            this._paperNoteReverseSyncKeys.set(
                entry.annotationKey,
                Date.now()
            );

            await item.saveTx();
            updatedAnnotations++;
        }
    }

    await this._updateResearchMetadata(libraryID, metadata => {
        let changed = false;

        for (const entry of entries) {
            const saved = metadata.annotations[entry.annotationKey] || {};

            const oldThemes = JSON.stringify(saved.themes || []);
            const oldExperiments = JSON.stringify(saved.experiments || []);

            if (
                oldThemes !== JSON.stringify(entry.themes)
                || oldExperiments !== JSON.stringify(entry.experiments)
            ) {
                metadata.annotations[entry.annotationKey] = {
                    ...saved,
                    themes: entry.themes,
                    experiments: entry.experiments
                };

                changed = true;
            }
        }

        return changed;
    });

    // Rebuild from the updated PDF annotations and metadata.
    const firstItem = annotations.get(entries[0].annotationKey);

    if (firstItem) {
        await this._syncPaperResearchNote(firstItem);
    }

    log(
        "Reverse note synchronization completed. Updated annotations: "
        + updatedAnnotations
        + " | Entries: "
        + entries.length
    );
},
targetTypes() {
		let types = ["highlight"];
		if (getPref("alsoUnderline", false)) types.push("underline");
		if (this.hasImageEntries()) types.push("image");
		return types;
	},
	// ResearchAnnotator metadata storage.
// One managed Zotero note per library.

RESEARCH_METADATA_TITLE: "ResearchAnnotator Metadata",
RESEARCH_METADATA_MARKER: "research-annotator-metadata-v1",

async _findResearchMetadataNote(libraryID) {
    const search = new Zotero.Search();
    search.libraryID = libraryID;

    search.addCondition("itemType", "is", "note");

    const ids = await search.search();

    for (const id of ids) {
        const note = Zotero.Items.get(id);

        if (!note || !note.isNote?.()) continue;

        const content = note.getNote();

        if (content.includes(this.RESEARCH_METADATA_MARKER)) {
            return note;
        }
    }

    return null;
},
async _associatePDFResearchNote(note,paper){
    const parentID=paper?.id||false;
    if(paper&&paper.libraryID!==note.libraryID)throw Error("PDF note and publication belong to different libraries");
    if(note.parentID===parentID||(!paper&&note.parentID===undefined))return note;
    if(typeof AnnotaInfrastructure!=='undefined')await AnnotaInfrastructure.backup('',{kind:'pdf-note-placement',noteKey:note.key,noteHTML:note.getNote(),parentID:note.parentID||false,collections:note.getCollections?.()||[]},'pdf-note-placement');
    note.parentID=parentID;if(parentID)note.setCollections?.([]);await note.saveTx();return note;
},
async _getOrCreatePaperResearchNote(annotation, createMissing = true) {
    if (!annotation?.parentID) {
        throw new Error("Annotation has no parent attachment.");
    }

    // Find the PDF attachment.
    const attachment = await Zotero.Items.getAsync(
        annotation.parentID
    );

    if (!attachment || !attachment.isAttachment?.()) {
        throw new Error("Could not find annotation's PDF attachment.");
    }

    // Resolve the regular bibliographic item, if one exists.
    // Standalone PDF attachments must not be used as note parents.
    const paper = attachment.parentID
        ? await Zotero.Items.getAsync(attachment.parentID)
        : null;

    if (
        attachment.parentID &&
        (!paper || !paper.isRegularItem?.())
    ) {
        throw new Error(
            "The PDF attachment's parent is not a regular bibliographic item."
        );
    }

    const noteParent = paper;
    const noteIdentity = attachment;
    const libraryID = annotation.libraryID;
    const attachmentKey = attachment.key;

    const marker =
        "research-annotator-pdf-note-v1:" + attachmentKey;

    if (typeof AnnotaInfrastructure !== "undefined") {
        const existing = await AnnotaInfrastructure.notes.find(libraryID, marker);
        if (existing) return { note: await this._associatePDFResearchNote(existing,paper), paper, marker };
    }

    // Search existing Zotero notes for this paper's research note.
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("itemType", "is", "note");

    const ids = await search.search();

    for (const id of ids) {
        const existing = Zotero.Items.get(id);

        if (!existing || !existing.isNote?.() || existing.deleted) continue;

        const content = existing.getNote() || "";

        if (content.includes(marker)) {
            return {
                note: await this._associatePDFResearchNote(existing,paper),
                paper,
                marker
            };
        }
    }

    if (!createMissing) return null;

    // Create one research note for this paper.
    const note = new Zotero.Item("note");
    note.libraryID = libraryID;

    if (noteParent) {
        note.parentID = noteParent.id;
    }

    const title = AnnotaInfrastructure.notes.pdfConfig(attachment,libraryID).title || AnnotaNotePresentation.pdfTitle(attachment);

    const escapedTitle = title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    note.setNote(`
        <h1>${escapedTitle}</h1>
        <p style="margin:0;padding:0;font-size:1px;line-height:1px;color:#888;"><span>${marker}</span></p>

        <hr>
    `);

    if(typeof AnnotaInfrastructure!=="undefined")note.setNote(AnnotaInfrastructure.notes.stamp(note.getNote(),AnnotaInfrastructure.notes.pdfConfig(attachment,libraryID)));

    await note.saveTx();

    log(
        "Created paper research note: "
        + title
        + " | Key: "
        + note.key
    );

    return {
        note,
        paper,
        marker
    };
},
async _getResearchNotes(libraryID) {
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("itemType", "is", "note");

    const ids = await search.search();
    const researchNotes = [];

    const marker = "research-annotator-research-note-v1";

    for (const id of ids) {
        const note = Zotero.Items.get(id);

        if (!note || !note.isNote?.()) continue;

        const content = note.getNote() || "";

        // Only include notes created by ResearchAnnotator.
        if (!content.includes(marker)) continue;

        // Extract the note title from its first H1 element.
        const titleMatch = content.match(/<h1[^>]*>(.*?)<\/h1>/i);

        let title = titleMatch
            ? titleMatch[1].replace(/<[^>]*>/g, "").trim()
            : "Untitled research note";

        researchNotes.push({
            key: note.key,
            title: title
        });
    }

    researchNotes.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, {
            sensitivity: "base"
        })
    );

    return researchNotes;
},

async _createResearchNote(libraryID, title) {
    title = (title || "").trim();

    if (!title) {
        throw new Error("Research note title cannot be empty.");
    }

    // Prevent duplicate research-note titles (case-insensitive).
    const existingNotes = await this._getResearchNotes(libraryID);

    const existing = existingNotes.find(note =>
        note.title.toLowerCase() === title.toLowerCase()
    );

    if (existing) {
        return existing;
    }

    const escapedTitle = title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const html = `
        <h1>${escapedTitle}</h1>
        <div>research-annotator-research-note-v1</div>
        <p></p>
    `;

    const note = new Zotero.Item("note");
    note.libraryID = libraryID;
    note.setNote(html);

    await note.saveTx();

    log("Research note created: " + title + " | Key: " + note.key);

    return {
        key: note.key,
        title: title
    };
},
async _attachmentForDeletedAnnotation(libraryID, key) {
    // Delete notifier payloads need not contain the old attachment ID. Existing
    // managed notes retain both the attachment marker and annotation link.
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("itemType", "is", "note");
    for (const id of await search.search()) {
        const note = await Zotero.Items.getAsync(id);
        if (!note?.isNote?.()) continue;
        const html = note.getNote() || "";
        if (!html.includes(`annotation=${key}`) && !html.includes(`data-ra-entry="${libraryID}:${key}"`)
                && !html.includes(`RA_ENTRY_START:${libraryID}:${key}`)) continue;
        const marker = html.match(/research-annotator-pdf-note-v1:([A-Z0-9]+)/i);
        if (!marker) continue;
        const attachment = await Zotero.Items.getByLibraryAndKeyAsync(libraryID, marker[1]);
        if (attachment?.isAttachment?.() && !attachment.deleted) return attachment.id;
    }
    return null;
},

_replaceManagedResearchEntries(content, replacement) {
    const ranges = [];
    // Preserve all content outside recognized managed wrappers, including user
    // text between entries or after the final entry.
    for (const match of content.matchAll(/<div\b[^>]*data-ra-entry=["'][^"']+["'][^>]*>/gi)) {
        const tags = /<\/?div\b[^>]*>/gi;
        tags.lastIndex = match.index;
        let depth = 0, tag;
        while ((tag = tags.exec(content))) {
            depth += /^<\/div/i.test(tag[0]) ? -1 : 1;
            if (!depth) { ranges.push([match.index, tags.lastIndex]); break; }
        }
    }
    const labels = new Set(["Page", "Comment", "Research comment", "Themes", "Experiments", "Tags", "Source"]);
    for (const entry of Object.values(this.getColorPrompts())) {
        for (const field of this.parseFieldSchema(entry?.fields)) {
            labels.add(String(field.label || field.name).replace(/&/g, "&amp;")
                .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"));
        }
    }
    for (const field of [...this.getGlobalFields(), ...(this.globalFieldConfig().archivedFields || [])]) {
        for (const label of [field.label, ...(field.historicalLabels || [])]) {
            labels.add(String(label).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;").replace(/'/g, "&#39;"));
        }
    }
    // Zotero can strip wrapper attributes. Recognize normalized annotation
    // headings and consume only the generated field paragraphs that follow.
    for (const match of content.matchAll(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi)) {
        if (!/href=["']zotero:\/\/open-pdf\/[^"']*annotation=/i.test(match[0])) continue;
        if (ranges.some(([start, end]) => match.index >= start && match.index < end)) continue;
        let start = match.index, end = match.index + match[0].length;
        const preceding = content.slice(0, start).match(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*<\/p>\s*$/i);
        if (preceding && /<mark\b|background-color\s*:|<span style="color:#[0-9a-f]{6};">&#9632;<\/span> <strong>[^<]+<\/strong>/i.test(preceding[0])) start = preceding.index;
        while (true) {
            const p = content.slice(end).match(/^\s*<p\b[^>]*>\s*<(?:strong|b)>([\s\S]*?):<\/(?:strong|b)>[\s\S]*?<\/p>/i);
            if (!p || !labels.has(p[1])) break;
            end += p[0].length;
        }
        ranges.push([start, end]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    // A native rule survives note normalization, but custom attributes may not.
    // Associate one boundary-adjacent rule with each managed entry after the
    // first. Rules in the introduction/footer and inter-entry prose survive.
    for (let i = 1; i < ranges.length; i++) {
        const previousEnd = ranges[i - 1][1];
        const gap = content.slice(previousEnd, ranges[i][0]);
        const separator = gap.match(/\s*(?:<div\b[^>]*>\s*<hr\b[^>]*>\s*<\/div>|<hr\b[^>]*>)\s*$/i);
        if (separator) ranges[i][0] = previousEnd + separator.index;
    }
    const merged = [];
    for (const range of ranges) {
        const last = merged[merged.length - 1];
        if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
        else merged.push(range.slice());
    }
    if (!merged.length) return replacement ? content + "\n" + replacement : content;
    let result = content.slice(0, merged[0][0]) + replacement;
    for (let i = 0; i < merged.length; i++) {
        result += content.slice(merged[i][1], merged[i + 1]?.[0] ?? content.length);
    }
    return result;
},

_schedulePaperResearchNoteSync(annotation) {
    if(this._colorMappingPDFs?.has(annotation?.parentID))return;
    if (!annotation?.parentID || !annotation.id) return;

    const queueKey = `${annotation.libraryID}:${annotation.parentID}`;

    if (!this._paperNoteSyncTimers) {
        this._paperNoteSyncTimers = new Map();
    }

    const existingTimer = this._paperNoteSyncTimers.get(queueKey);

    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
        this._paperNoteSyncTimers.delete(queueKey);

        try {
            const fresh = await Zotero.Items.getAsync(annotation.id);

            if (fresh?.isAnnotation?.()) {
                await this._syncPaperResearchNote(fresh);
            }
        }
        catch (error) {
            log(
                "Debounced paper-note synchronization failed for "
                + queueKey + ": " + error
            );
        }
    }, 1200);

    this._paperNoteSyncTimers.set(queueKey, timer);
},
async _syncPaperResearchNote(annotation) {
    if (!annotation) return;

    const libraryID = annotation.libraryID;
    const parentID = annotation.parentID;
    const queueKey = `${libraryID}:${parentID}`;

    if (!this._paperNoteQueues) {
        this._paperNoteQueues = new Map();
    }

    const previous = this._paperNoteQueues.get(queueKey)
        || Promise.resolve();

    const current = previous
        .catch(e => {
            log("Previous paper-note update failed: " + e);
        })
        .then(async () => {
            // Reload the annotation so queued work uses its latest state.
            const fresh = annotation.id
                ? await Zotero.Items.getAsync(annotation.id)
                : annotation;

            // An attachment rebuild remains valid after its last annotation is gone.
            return this._syncPaperResearchNoteNow(fresh?.isAnnotation?.() && !fresh.deleted
                && !this._deletedAnnotationKeys?.has(`${libraryID}:${fresh.key}`)
                ? fresh : { libraryID, parentID, existingOnly: !annotation.manualSync, manualSync: annotation.manualSync, orderChange: annotation.orderChange });
        });

    this._paperNoteQueues.set(queueKey, current);

    try {
        const result=await current;
        if(typeof AnnotaInfrastructure!=='undefined'){const source=await Zotero.Items.getAsync(parentID),library=AnnotaData.libraryIdentity(Zotero.Libraries.get(libraryID)),config=source&&AnnotaInfrastructure.notes.config(library,{type:"pdf",key:source.key});if(config)AnnotaInfrastructure.notes.errors.delete(config.id);}
        return result;
    }
    catch(error){if(typeof AnnotaInfrastructure!=='undefined'){try{const source=await Zotero.Items.getAsync(parentID),library=AnnotaData.libraryIdentity(Zotero.Libraries.get(libraryID)),config=source&&AnnotaInfrastructure.notes.config(library,{type:"pdf",key:source.key});if(config)AnnotaInfrastructure.notes.errors.set(config.id,String(error.message||error).slice(0,2000));}catch(_){}}throw error;}
    finally {
        if (this._paperNoteQueues.get(queueKey) === current) {
            this._paperNoteQueues.delete(queueKey);
        }
    }
},

_renderManagedAnnotationEntry(item, { libraryID, metadata, colorLabels, pdfLinkBase, escapeHTML, managedConfig }) {
        const annotationKey = `${libraryID}:${item.key}`;
        const saved = metadata.annotations[annotationKey] || {};

        let comment = item.annotationComment || "";

        const text = managedConfig?.include.text === false ? "" : item.annotationText || "";
        if (managedConfig?.include.comment === false) comment = "";
        const type = String(item.annotationType || "").toLowerCase();
        const color = String(item.annotationColor || "").toLowerCase();

        const labelEntry = Object.entries(colorLabels).find(
            ([hex]) => String(hex).toLowerCase() === color
        );

        const colorLabel = String(labelEntry?.[1] || "").trim();
        const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "";

        const escapedText = escapeHTML(managedConfig?.include.text === false ? "Source annotation" : text || "Image annotation");
        let formattedText = escapedText;

        let pageIndex = Number.MAX_SAFE_INTEGER;
        let page = "";
        let positionY = Number.MAX_SAFE_INTEGER;
        let positionX = Number.MAX_SAFE_INTEGER;

        try {
            const position =
                typeof item.annotationPosition === "string"
                    ? JSON.parse(item.annotationPosition)
                    : item.annotationPosition;

            if (typeof position?.pageIndex === "number") {
                pageIndex = position.pageIndex;
                page = String(pageIndex + 1);
            }

            const rects = Array.isArray(position?.rects)
                ? position.rects.filter(rect =>
                    Array.isArray(rect) && rect.length >= 4
                )
                : [];

            if (rects.length) {
                const xValues = rects.flatMap(rect =>
                    [Number(rect[0]), Number(rect[2])]
                ).filter(Number.isFinite);

                const yValues = rects.flatMap(rect =>
                    [Number(rect[1]), Number(rect[3])]
                ).filter(Number.isFinite);

                if (xValues.length) positionX = Math.min(...xValues);
                // PDF coordinates have a bottom-left origin:
                // larger Y values are higher on the page.
                if (yValues.length) positionY = Math.max(...yValues);
            }
        }
        catch (e) {
            log("Could not read annotation page or position: " + e);
        }

        const annotationLink = page
            ? `${pdfLinkBase}?page=${pageIndex + 1}&amp;annotation=${item.key}`
            : `${pdfLinkBase}?annotation=${item.key}`;

        const tags = (item.getTags?.() || [])
            .map(tag => typeof tag === "string" ? tag : tag.tag)
            .filter(Boolean)
            .filter(tag =>
                !tag.startsWith("RA:Theme:") &&
                !tag.startsWith("RA:Experiment:") &&
                !tag.startsWith("RA:ThemeCatalog:") &&
                !tag.startsWith("RA:ExperimentCatalog:")
            );

        const themes = !this._globalMigrationLibraries?.has(libraryID) && Array.isArray(saved.themes) ? saved.themes : [];
        const experiments = !this._globalMigrationLibraries?.has(libraryID) && Array.isArray(saved.experiments)
            ? saved.experiments
            : [];

        // Retrieve the separately stored values for this exact annotation.
        const structuredRecord =
            typeof AnnotaCardFields !== "undefined" && AnnotaCardFields
                ? AnnotaCardFields.get(item)
                : null;

        const structuredValues = structuredRecord?.values || {};

        const structuredFields = this.annotationFields(
            this.keyForItem(item)
        )
            .filter(field => !managedConfig || (field.scope === "global" ? managedConfig.include.global !== false : managedConfig.include.colorFields !== false))
            .filter(field => !managedConfig || (managedConfig.include["field:" + field.id] !== false &&
                managedConfig.include[(field.scope === "global" ? "global" : "color") + (field.type === "ai" ? "AI" : "Manual")] !== false))
            .filter(field => !managedConfig?.include.omitEmpty ||
                (structuredValues[field.name] !== undefined && (field.type === "check" || this.fieldDisplayValue(field, structuredValues[field.name]).trim())))
            .map(field => ({
                name: field.name,
                label: field.label || field.name,
                type: field.type,
                value: this.fieldDisplayValue(field, structuredValues[field.name]).trim()
            }));

        const structuredFieldsHTML = structuredFields
            .map(field => {
                const label = escapeHTML(field.label);
                const value = field.value;

                if (field.type === "ai") {
                    return `<p><strong>${label}:</strong> ${value ? this.aiFieldHTML(field, value) : "Not generated yet"}</p>`;
                }
                if (field.type === "check") {
                    return `<p><strong>${label}:</strong> ${value ? "☑ Checked" : "☐ Not checked"}</p>`;
                }
                if (field.type === "select") {
                    return `<p><strong>${label}:</strong> ${value ? escapeHTML(value) : "Not selected"}</p>`;
                }
                return value
                    ? `<p><strong>${label}:</strong> ${escapeHTML(value)}</p>`
                    : "";
            })
            .filter(Boolean)
            .join("");

        const indicator = safeColor && managedConfig?.include.color !== false ? '<span style="color:'+safeColor+';">&#9632;</span> ' : '';
        const entryHTML = `
            <div data-ra-entry="${escapeHTML(annotationKey)}">
                ${managedConfig?.include.color === false ? "" : `<p style="margin:8px 0 4px;">${indicator}<strong>${escapeHTML(colorLabel || (type === "highlight" ? "Highlight" : type === "underline" ? "Underline" : "Annotation"))}</strong></p>`}
                <h2><strong>“${annotationLink
                    ? `<a href="${annotationLink}" >${formattedText}</a>`
                    : formattedText}”</strong></h2>
                ${page && managedConfig?.include.page === true ? `<p><strong>Page:</strong> ${page}</p>` : ""}
                ${comment ? `<p><strong>Comment:</strong> ${escapeHTML(comment)}</p>` : ""}
                ${themes.length
                    ? `<p><strong>Themes:</strong> ${themes.map(escapeHTML).join(", ")}</p>`
                    : ""}
                ${experiments.length
                    ? `<p><strong>Experiments:</strong> ${experiments.map(escapeHTML).join(", ")}</p>`
                    : ""}
                ${structuredFieldsHTML}
                ${tags.length && managedConfig?.include.tags === true
                    ? `<p><strong>Tags:</strong> ${tags.map(escapeHTML).join(", ")}</p>`
                    : ""}
            </div>
        `;

        return {
            key: annotationKey,
            pageIndex,
            positionY,
            positionX,
            color,
            html: entryHTML
        };
},
async _syncPaperResearchNoteNow(annotation) {
    if(this._colorMappingPDFs?.has(annotation.parentID))return;
    if(this._managedEngineRequired&&(typeof AnnotaInfrastructure==='undefined'||!AnnotaInfrastructure.state))throw Error("Managed note infrastructure did not initialize. The existing note is preserved; restore storage or restart the extension before updating.");
    if (typeof AnnotaCardFields !== "undefined" && AnnotaCardFields?._maintenance) throw Error("Note synchronization is paused during data import/recovery.");
    if (!annotation?.parentID) return;

    const attachmentID = annotation.parentID;
    if (!attachmentID) return;

    if (typeof AnnotaInfrastructure !== "undefined") {
        const source = await Zotero.Items.getAsync(attachmentID);
        if(!source?.isAttachment?.()||(typeof source.isFileAttachment==='function'&&!source.isFileAttachment()))return;
        if (source?.isPDFAttachment?.() || source?.attachmentContentType === "application/pdf") {
            let config = AnnotaInfrastructure.notes.pdfConfig(source, annotation.libraryID);
            config = await AnnotaInfrastructure.notes.recoverOrphan(config);
            if(config.managementDisabled)return;
            if (config.mode === "static" && !annotation.orderChange && (config.noteKey || !annotation.manualSync) || config.mode === "manual" && !annotation.manualSync) return;
        }
    }

    const result = await this._getOrCreatePaperResearchNote(annotation, !annotation.existingOnly);
    if (!result) return;
    const { note } = result;
    const libraryID = annotation.libraryID;

    const attachment = await Zotero.Items.getAsync(attachmentID);

    if (!attachment || !attachment.isAttachment?.()) {
        throw new Error("Could not resolve PDF attachment for annotation links.");
    }
    const managed = typeof AnnotaInfrastructure !== "undefined" ? AnnotaInfrastructure.notes : null;
    const managedConfig = managed?.pdfConfig(attachment, libraryID);
    if (managedConfig && (managedConfig.mode === "static" && !annotation.orderChange && (managedConfig.noteKey || !annotation.manualSync) || managedConfig.mode === "manual" && !annotation.manualSync)) return;

    const library = Zotero.Libraries.get(libraryID);

    const libraryPath =
        library?.libraryType === "group" && library.groupID
            ? `groups/${library.groupID}`
            : "library";

    const pdfLinkBase =
        `zotero://open-pdf/${libraryPath}/items/${attachment.key}`;

    const escapeHTML = value =>
        String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    // Load every annotation belonging to this PDF.
    let ids;
    if (typeof attachment.getAnnotations === "function") {
        try { ids = attachment.getAnnotations(false, true); }
        catch (_) { /* Older/unloaded readers retain the existing search fallback. */ }
    }
    if (!Array.isArray(ids)) {
        const search = new Zotero.Search(); search.libraryID = libraryID;
        search.addCondition("resultLevel", "annotation"); ids = await search.search();
    }
    const annotations = [];

    for (const id of ids) {
        const item = await Zotero.Items.getAsync(id);

        if (
            item?.isAnnotation?.() && !item.deleted &&
            !this._deletedAnnotationKeys?.has(`${item.libraryID}:${item.key}`) &&
            item.parentID === attachmentID
        ) {
            annotations.push(item);
            if (!this._annotationParents) this._annotationParents = new Map();
            this._annotationParents.set(item.id, { parentID: attachmentID, libraryID, key: item.key });
        }
    }

    // A newly converted annotation may not yet appear in Zotero's search results.
    // Ensure the annotation that triggered this rebuild is included.
    if (
        annotation.id && annotation.parentID === attachmentID &&
        !annotations.some(item => item.id === annotation.id)
    ) {
        const currentAnnotation = await Zotero.Items.getAsync(annotation.id);

        if (
            currentAnnotation?.isAnnotation?.() && !currentAnnotation.deleted &&
            !this._deletedAnnotationKeys?.has(`${libraryID}:${currentAnnotation.key}`) &&
            currentAnnotation.parentID === attachmentID
        ) {
            annotations.push(currentAnnotation);
            log(
                "Added triggering annotation missing from search results: "
                + currentAnnotation.key
            );
        }
    }

    // Load native tags explicitly: newly created annotations may have only primary data cached.
    await Zotero.Items.loadDataTypes?.(annotations,['tags']);
    // Read research metadata once for the complete rebuild.
    const metadata = await this._getResearchMetadata(libraryID);
    const colorLabels = this.getColorLabels();

    // Structured fields are stored separately from Zotero's native Comment.
    if (typeof AnnotaCardFields !== "undefined" && AnnotaCardFields) {
        await AnnotaCardFields.load();
    }

    const entries = [];

    const publication = attachment.parentID ? await Zotero.Items.getAsync(attachment.parentID) : attachment;
    for (const item of annotations) {
        const entry = this._renderManagedAnnotationEntry(item, { libraryID, metadata, colorLabels, pdfLinkBase, escapeHTML, managedConfig });
        if (managed?.decorateEntry) managed.decorateEntry(entry, item, managedConfig, publication);
        entries.push(entry);
    }

    // PDF order is the default. Color order groups by actual annotation
    // color, retaining reading order inside each color group.
    const noteSortOrder = managedConfig?.colorOrder?.length ? "override" : getPref("paperNoteSortOrder", "pdf");

    const comparePDFPosition = (a, b) =>
        a.pageIndex - b.pageIndex ||
        b.positionY - a.positionY ||
        a.positionX - b.positionX ||
        a.key.localeCompare(b.key);

    if(noteSortOrder === "override"){entries.sort((a,b)=>managed.compareColor(a,b,managedConfig)||comparePDFPosition(a,b));}
    else if (noteSortOrder === "color") {
        entries.sort((a, b) =>
            a.color.localeCompare(b.color) ||
            comparePDFPosition(a, b)
        );
    }
    else {
        entries.sort(comparePDFPosition);
    }

    const numberedEntries = entries.filter(entry => !this._deletedAnnotationKeys?.has(entry.key))
        .map((entry, index) => entry.html.trim().replace(
        /(<h2\b[^>]*>)([\s\S]*?)<\/h2>/i, `$1${index + 1}. $2</h2>`));
    const separator = '\n<hr style="border:0;border-top:1px solid #b0b0b0;margin:10px 0;">\n';
    const generated = Object.fromEntries(entries.map((entry, i) => [entry.key, numberedEntries[i]]));
    let content = managed ? managed.preparePDF(note, annotations, managedConfig, numberedEntries.join(separator), generated)
        : this._replaceManagedResearchEntries(note.getNote() || "", numberedEntries.join(separator));
    if (managed) content = managed.stamp(content,managedConfig,annotations);
    const snapshot = managed ? { ...managedConfig, noteKey: note.key, generated, content,
        recordKeys: annotations.filter(item => AnnotaCardFields.get(item)).map(item => item.key), updatedAt: new Date().toISOString() } : null;

    // Avoid rewriting and refreshing an already up-to-date research note.
    const existingNoteContent = note.getNote() || "";

    if (existingNoteContent === content || managed?.keepNormalized(existingNoteContent,content,managedConfig.generated,generated)) {
        if(snapshot)snapshot.content=existingNoteContent;
        if(managed)await managed.configure(snapshot);
        log(
            "Paper research note unchanged; skipped refresh. Note: "
            + note.key
        );
        return;
    }

    if (!this._paperNoteGeneratedContent) {
        this._paperNoteGeneratedContent = new Map();
    }

    const generatedNoteKey = `${note.libraryID}:${note.key}`;

    if(managed?.config(managedConfig.library,managedConfig.scope)?.managementDisabled)return;
    note.setNote(content);

    // Register the expected content before saving to guard against
    // a notifier arriving while saveTx() is still completing.
    this._paperNoteGeneratedContent.set(
        generatedNoteKey,
        content
    );

    await note.saveTx();

    // Zotero may normalize the HTML during saving.
    const savedNoteHTML = note.getNote() || content;
    if(managed)await managed.configure({...snapshot,content:savedNoteHTML});



    this._paperNoteGeneratedContent.set(
        generatedNoteKey,
        savedNoteHTML
    );


    log(
        "Paper research note rebuilt for PDF "
        + attachmentID
        + " | annotations: "
        + entries.length
    );
},
async _syncAllPaperResearchNotes(libraryID = Zotero.Libraries.userLibraryID) {
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("resultLevel", "annotation");

    const ids = await search.search();
    const annotations = [];

    // Load all annotations before writing any research notes.
    for (const id of ids) {
        try {
            const item = await Zotero.Items.getAsync(id);

            if (!item || !item.isAnnotation?.()) continue;

            if (!item.parentID) {
                log("Skipping annotation without parent attachment: " + item.key);
                continue;
            }

            annotations.push(item);
        }
        catch (e) {
            log("Could not load annotation " + id + ": " + e);
        }
    }

    // Keep annotations from the same PDF together and order them by page.
    const getPageIndex = item => {
        try {
            const position = typeof item.annotationPosition === "string"
                ? JSON.parse(item.annotationPosition)
                : item.annotationPosition;

            return typeof position?.pageIndex === "number"
                ? position.pageIndex
                : Number.MAX_SAFE_INTEGER;
        }
        catch (e) {
            return Number.MAX_SAFE_INTEGER;
        }
    };

    annotations.sort((a, b) =>
        String(a.parentID).localeCompare(String(b.parentID))
        || getPageIndex(a) - getPageIndex(b)
        || String(a.key).localeCompare(String(b.key))
    );

    let synced = 0;
    let failed = 0;

    // Sequential writes prevent concurrent annotations from overwriting
    // one another in the same paper research note.
    for (let i = 0; i < annotations.length; i++) {
        const item = annotations[i];

        try {
            await this._syncPaperResearchNote(item);
            synced++;
        }
        catch (e) {
            failed++;
            log(
                "Paper-note synchronization failed for "
                + item.key + ": " + e
            );
        }

        if ((i + 1) % 10 === 0 || i === annotations.length - 1) {
            log(
                "Paper-note backfill progress: "
                + (i + 1) + "/" + annotations.length
                + " | synchronized: " + synced
                + " | failed: " + failed
            );
        }
    }

    const result = {
        libraryID,
        found: ids.length,
        loaded: annotations.length,
        synced,
        failed
    };

    log("Paper-note backfill completed: " + JSON.stringify(result));

    return result;
},
async _getResearchMetadataFromNote(libraryID) {
    const note = await this._findResearchMetadataNote(libraryID);

    if (!note) {
        return {
            version: 1,
            themes: [],
            experiments: [],
            annotations: {}
        };
    }

    try {
        const content = note.getNote();
        const markerIndex = content.indexOf(this.RESEARCH_METADATA_MARKER);
        if (markerIndex === -1) throw new Error("Metadata marker not found");

        const afterMarker = content.substring(markerIndex);
        const match = afterMarker.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
        if (!match) throw new Error("Metadata JSON block not found");

        const doc = new DOMParser().parseFromString(match[1], "text/html");
        const json = doc.body.textContent.replace(/\u00a0/g, " ").trim();
        const data = JSON.parse(json);

        return {
            version: 1,
            themes: Array.isArray(data.themes) ? data.themes : [],
            experiments: Array.isArray(data.experiments) ? data.experiments : [],
            annotations: data.annotations && typeof data.annotations === "object"
                ? data.annotations : {}
        };
    }
    catch (e) {
        log("Reading legacy research metadata failed: " + e);
        throw e;
    }
},

async _getAllResearchAnnotations(libraryID) {
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("resultLevel", "annotation");

    const ids = await search.search();
    const annotations = [];

    for (const id of ids) {
        const item = await Zotero.Items.getAsync(id);
        if (item?.isAnnotation?.() && item.libraryID === libraryID) {
            annotations.push(item);
        }
    }

    return annotations;
},

async _getResearchMetadata(libraryID) {
    const metadata = {
        version: 1,
        themes: [],
        experiments: [],
        annotations: {}
    };

    const themeCatalog = new Set();
    const experimentCatalog = new Set();
    const annotations = await this._getAllResearchAnnotations(libraryID);

    for (const item of annotations) {
        const key = `${libraryID}:${item.key}`;
        const saved = {
            themes: [],
            experiments: []
        };

        for (const tagObject of item.getTags()) {
            const tag = tagObject.tag || "";

            if (tag.startsWith("RA:Theme:")) {
                const value = tag.substring("RA:Theme:".length).trim();
                if (value) saved.themes.push(value);
            }
            else if (tag.startsWith("RA:Experiment:")) {
                const value = tag.substring("RA:Experiment:".length).trim();
                if (value) saved.experiments.push(value);
            }
        }

        saved.themes = [...new Set(saved.themes)];
        saved.experiments = [...new Set(saved.experiments)];

        if (saved.themes.length || saved.experiments.length) {
            metadata.annotations[key] = saved;
        }

        for (const value of saved.themes) themeCatalog.add(value);
        for (const value of saved.experiments) experimentCatalog.add(value);
    }

    metadata.themes = [...themeCatalog].sort((a, b) => a.localeCompare(b));
    metadata.experiments = [...experimentCatalog].sort((a, b) => a.localeCompare(b));

    return metadata;
},

async _saveResearchMetadata(libraryID, data) {
    const annotations = await this._getAllResearchAnnotations(libraryID);
    let changedCount = 0;

    for (const item of annotations) {
        const key = `${libraryID}:${item.key}`;
        const saved = data.annotations?.[key] || {};

        const itemThemes = [...new Set(
            (saved.themes || []).map(value => String(value).trim()).filter(Boolean)
        )];

        const itemExperiments = [...new Set(
            (saved.experiments || []).map(value => String(value).trim()).filter(Boolean)
        )];

        const desired = new Set([
            ...itemThemes.map(value => "RA:Theme:" + value),
            ...itemExperiments.map(value => "RA:Experiment:" + value)
        ]);

        let changed = false;

        // Remove obsolete assignments and all old catalog tags.
        for (const tagObject of item.getTags()) {
            const tag = tagObject.tag || "";

            const isAssignment =
                tag.startsWith("RA:Theme:") ||
                tag.startsWith("RA:Experiment:");

            const isOldCatalog =
                tag.startsWith("RA:ThemeCatalog:") ||
                tag.startsWith("RA:ExperimentCatalog:");

            if (isOldCatalog || (isAssignment && !desired.has(tag))) {
                item.removeTag(tag);
                changed = true;
            }
        }

        // Convert retained and new ResearchAnnotator tags to automatic tags.
        const existing = new Map(
            item.getTags().map(tagObject => [
                tagObject.tag,
                Number(tagObject.type)
            ])
        );

        for (const tag of desired) {
            if (!existing.has(tag)) {
                item.addTag(tag, 1);
                changed = true;
            }
            else if (existing.get(tag) !== 1) {
                item.removeTag(tag);
                item.addTag(tag, 1);
                changed = true;
            }
        }

        if (changed) {
            await item.saveTx();
            changedCount++;
        }
    }

    log(
        "Research metadata saved as automatic Zotero tags. Library: " +
        libraryID + " | Annotations updated: " + changedCount
    );

    return { annotationsUpdated: changedCount };
},

async _migrateResearchMetadataToTags(libraryID) {
    await this.migrateLegacyGlobalFields();
    if (!this._globalMigrationLibraries?.has(libraryID)) {
        throw new Error("Global-field migration incomplete; original metadata preserved.");
    }
    return { migrated: true, legacyMetadataPreserved: true };
},

async _updateResearchMetadata(libraryID, updater) {
    if (!this._researchMetadataQueues) {
        this._researchMetadataQueues = new Map();
    }

    const queues = this._researchMetadataQueues;
    const previous = queues.get(libraryID) || Promise.resolve();

    const current = previous
        .catch(e => {
            log("Previous metadata update failed; continuing queue: " + e);
        })
        .then(async () => {
            const metadata = await this._getResearchMetadata(libraryID);
            const shouldSave = await updater(metadata);

            if (shouldSave === false) {
                return metadata;
            }

            await this._saveResearchMetadata(libraryID, metadata);
            return metadata;
        });

    queues.set(libraryID, current);

    try {
        return await current;
    }
    finally {
        if (queues.get(libraryID) === current) {
            queues.delete(libraryID);
        }
    }
},

_readerAnnotationIDs(reader) {
    const raw =
        reader?._state?.annotations
        ?? reader?._internalReader?._state?.annotations
        ?? reader?._internalReader?._annotations;

    if (!raw) {
        throw new Error("Reader annotations collection is unavailable.");
    }

    const ids = new Set();

    const addID = value => {
        const id = typeof value === "string" ? value : value?.id;
        if (id) ids.add(String(id));
    };

    // Avoid spread and iterator protocols on Zotero's cross-compartment objects.
    if (typeof raw.forEach === "function") {
        raw.forEach(value => addID(value));
    }
    else if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i++) {
            addID(raw[i]);
        }
    }
    else if (typeof raw === "object") {
        const keys = Object.keys(raw);
        for (let i = 0; i < keys.length; i++) {
            addID(raw[keys[i]]);
        }
    }
    else {
        throw new Error("Unsupported reader annotations collection.");
    }

    return ids;
},

async _removePaperResearchNoteEntry(libraryID, annotationKey) {
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("itemType", "is", "note");

    const ids = await search.search();
    const startMarker = `RA_ENTRY_START:${annotationKey}`;
    const endMarker = `RA_ENTRY_END:${annotationKey}`;

    for (const id of ids) {
        const note = Zotero.Items.get(id);

        if (!note || !note.isNote?.()) continue;

        const content = note.getNote() || "";
        let updated = content;
        let removed = false;

        // New format: remove the complete hidden-attribute wrapper.
        const attributeMarker = `data-ra-entry="${annotationKey}"`;
        const attributeIndex = content.indexOf(attributeMarker);

        if (attributeIndex >= 0) {
            const openingStart = content.lastIndexOf("<div", attributeIndex);
            const openingEnd = content.indexOf(">", attributeIndex);

            if (openingStart < 0 || openingEnd < 0 || openingStart > attributeIndex) {
                log("Could not locate hidden entry wrapper: " + annotationKey);
                continue;
            }

            const divTagPattern = /<\/?div\b[^>]*>/gi;
            divTagPattern.lastIndex = openingStart;

            let depth = 0;
            let closingEnd = -1;
            let match;

            while ((match = divTagPattern.exec(content)) !== null) {
                if (/^<\/div/i.test(match[0])) {
                    depth--;

                    if (depth === 0) {
                        closingEnd = divTagPattern.lastIndex;
                        break;
                    }
                }
                else {
                    depth++;
                }
            }

            if (closingEnd < 0) {
                log("Could not find closing wrapper for hidden entry: " + annotationKey);
                continue;
            }

            updated =
                content.slice(0, openingStart)
                + content.slice(closingEnd);

            removed = true;
        }
        else {
            // Legacy format: remove the complete entry wrapper.
            const startIndex = content.indexOf(startMarker);

            if (startIndex < 0) continue;

            const endIndex = content.indexOf(
                endMarker,
                startIndex + startMarker.length
            );

            if (endIndex < 0) {
                log("Found incomplete paper-note entry: " + annotationKey);
                continue;
            }

            const openingStart = content.lastIndexOf("<div", startIndex);
            const openingEnd = openingStart >= 0
                ? content.indexOf(">", openingStart)
                : -1;

            if (openingStart < 0 || openingEnd < 0) {
                log("Could not locate legacy entry wrapper: " + annotationKey);
                continue;
            }

            const divTagPattern = /<\/?div\b[^>]*>/gi;
            divTagPattern.lastIndex = openingStart;

            let depth = 0;
            let closingEnd = -1;
            let match;

            while ((match = divTagPattern.exec(content)) !== null) {
                if (/^<\/div/i.test(match[0])) {
                    depth--;

                    if (depth === 0) {
                        closingEnd = divTagPattern.lastIndex;
                        break;
                    }
                }
                else {
                    depth++;
                }
            }

            if (
                closingEnd < 0
                || openingStart > startIndex
                || closingEnd <= endIndex
            ) {
                log("Could not determine legacy entry wrapper: " + annotationKey);
                continue;
            }

            updated =
                content.slice(0, openingStart)
                + content.slice(closingEnd);

            removed = true;
        }

        if (!removed) continue;

        // Renumber only managed entry wrappers, preserving all other note HTML.
        let entryNumber = 0;

        updated = updated.replace(
            /<div\b[^>]*>[\s\S]*?<\/div>/gi,
            wrapper => {
                const isManaged =
                    /data-ra-entry\s*=/.test(wrapper)
                    || wrapper.includes("RA_ENTRY_START:");

                if (!isManaged) return wrapper;

                return wrapper.replace(
                    /<h2>([\s\S]*?)<\/h2>/i,
                    (heading, headingContent) => {
                        entryNumber++;

                        const cleanHeading = headingContent.replace(
                            /^\s*\d+\.\s*/,
                            ""
                        );

                        return `<h2>${entryNumber}. ${cleanHeading}</h2>`;
                    }
                );
            }
        );

        note.setNote(updated);
        await note.saveTx();

        log("Removed paper-note entry: " + annotationKey);
        return true;
    }

    return false;
},async handleConvertedAnnotation(id) {
    const item = await Zotero.Items.getAsync(id);

    if (!item || !item.isAnnotation?.()) {
        return false;
    }

    const conversionKey = `${item.libraryID}:${item.key}`;
    let conversion = this._pendingAnnotationConversions?.get(conversionKey);
    if (!conversion && typeof AnnotaInfrastructure !== "undefined") {
        const candidates = [...(this._activeStructuredConversions?.values() || [])].filter(source => source.libraryID === item.libraryID
            && source.parentID === item.parentID && source.targetType === item.annotationType && source.text === this._normText(item.annotationText || ""));
        if (candidates.length === 1) {
            conversion = { ...candidates[0], newID: item.key, newAnnotationKey: conversionKey, processing: false };
            if (!this._pendingAnnotationConversions) this._pendingAnnotationConversions = new Map();
            this._pendingAnnotationConversions.set(conversionKey, conversion);
        }
    }

    if (!conversion) {
        return false;
    }

    // Keep the conversion registered while migration is running.
    if (conversion.processing) {
        return true;
    }

    conversion.processing = true;

    try {
        const libraryID = item.libraryID;
        const oldKey = conversion.oldAnnotationKey;
        const newKey = conversionKey;
        if (typeof AnnotaInfrastructure !== "undefined") {
            await AnnotaCardFields.transfer({ libraryID, key: conversion.oldID }, item);
        }

        let migratedMetadata = false;

        await this._updateResearchMetadata(libraryID, metadata => {
            const oldSaved = metadata.annotations[oldKey];

            if (!oldSaved) {
                return false;
            }

            const newSaved = metadata.annotations[newKey] || {};

            const mergeLists = (oldValues, newValues) => [
                ...new Set([
                    ...(Array.isArray(oldValues) ? oldValues : []),
                    ...(Array.isArray(newValues) ? newValues : [])
                ])
            ];

            metadata.annotations[newKey] = {
                ...oldSaved,
                ...newSaved,
                themes: mergeLists(oldSaved.themes, newSaved.themes),
                experiments: mergeLists(
                    oldSaved.experiments,
                    newSaved.experiments
                )
            };

            delete metadata.annotations[oldKey];

            migratedMetadata = true;

            return true;
        });

        // Do not remove the old entry here.
        // The notification handler performs one complete rebuild after
        // metadata migration, replacing stale entries with current annotations.

        this._pendingAnnotationConversions.delete(conversionKey);

        log(
            "Annotation conversion metadata migrated: "
            + oldKey
            + " -> "
            + newKey
        );

    }
    catch (e) {
        // Keep the record so this annotation is never treated as a
        // completely new highlight by Annota's automatic AI handler.
        log("Annotation metadata migration failed: " + e);

    }

    return true;
},

async handleResearchMetadata(id) {
    let item = await Zotero.Items.getAsync(id);

    if (!item || !item.isAnnotation || !item.isAnnotation() || item.library?.editable === false) return;

    // Native creation drafts are scoped to the PDF and exact normalized selection.
    const draftKey = String(item.parentID || "") + "/" + this._normText(item.annotationText || "");
    const draft = this._nativeCommentDrafts?.get(draftKey);
    if (draft && Date.now() - draft.ts <= 600000 && !item.annotationComment) {
        item.annotationComment = draft.value;
        try { await item.saveTx(); this._nativeCommentDrafts.delete(draftKey); }
        catch (error) { item.annotationComment = ""; throw error; }
    }
    let pending = this._pendingResearch;
    if (!pending) return;

    // Expire stale popup data after 10 minutes.
    if (Date.now() - pending.ts > 600000) {
        this._pendingResearch = null;
        return;
    }

    let annotationText = this._normText(item.annotationText || "");
    let selectedText = this._normText(pending.text || "");

    // Match the newly created annotation to the selected text.
    let matches =
        annotationText &&
        selectedText &&
        (
            annotationText === selectedText ||
            annotationText.startsWith(selectedText.slice(0, 40)) ||
            selectedText.startsWith(annotationText.slice(0, 40))
        );

    if (!matches) return;

    let tags = [
        ...new Set(
            (pending.values?.tags || [])
                .map(tag => String(tag).trim())
                .filter(Boolean)
        )
    ];

    let themes = [
        ...new Set(
            (pending.values?.themes || [])
                .map(value => String(value).trim())
                .filter(Boolean)
        )
    ];

    let experiments = [
        ...new Set(
            (pending.values?.experiments || [])
                .map(value => String(value).trim())
                .filter(Boolean)
        )
    ];

    let changed = false;

    // Apply native Zotero tags.
    let existingTags = new Set(
        item.getTags().map(tag => tag.tag)
    );

    for (let tag of tags) {
        if (!existingTags.has(tag)) {
            item.addTag(tag);
            changed = true;
        }
    }

    if (changed) {
        await item.saveTx();
    }

    // Save research themes and experiments through the shared queue.
    if (themes.length || experiments.length) {
        const libraryID = item.libraryID;
        const annotationKey = `${libraryID}:${item.key}`;

        await this._updateResearchMetadata(libraryID, metadata => {
            metadata.themes = [
                ...new Set([...metadata.themes, ...themes])
            ];

            metadata.experiments = [
                ...new Set([...metadata.experiments, ...experiments])
            ];

            const annotationMetadata = {
                ...(metadata.annotations[annotationKey] || {}),
                themes,
                experiments
            };

            metadata.annotations[annotationKey] = annotationMetadata;
        });
    }

    await this._syncPaperResearchNote(item);
    this._pendingResearch = null;

    log("Research metadata saved for annotation " + id);
},
    aiGenerationTrigger(color) { return this.getColorEntry(color)?.trigger === "manual" ? "manual" : "auto"; },
    refreshAIFieldViews() { if (typeof AnnotaCardFields !== "undefined") AnnotaCardFields.refreshViews(); },
    canGenerateAIFields(item) {
        const color=this.colorKey(item.annotationColor || item.color,item.annotationType || item.type);
        return this.aiGenerationTrigger(color) === "manual" &&
            this.annotationFields(color).some(field => field.type === "ai" &&
                !String(AnnotaCardFields.get(item)?.values[field.name] || "").trim() && !AnnotaCardFields.fieldState(item,field).error);
    },
    async requestAIFields(item, options = {}) {
        if (typeof AnnotaInfrastructure !== "undefined") return AnnotaInfrastructure.generateJob(item, options);
        return this.generateStructuredFields(item, { partial:true, ...options });
    },
    async handleItem(id, notifiedAt) {
        if (this.inProgress.has(id)) return;
        this.inProgress.add(id);
        try {
            const item = await Zotero.Items.getAsync(id);
            if (!item?.isAnnotation?.() || item.deleted || item.library?.editable === false) return;
            if (this.captureEvidence?.handles(item)) return;
            const color = this.keyForItem(item);
            const schema = this.annotationFields(color);
            if (!schema.length) return;
            const text = String(item.annotationText || "").trim();
            const pending = item.annotationType === "image" ? null : this.peekPendingFields(text, item);
            const fields = {};
            for (const field of schema) {
                if (field.type !== "ai" && pending && Object.hasOwn(pending, field.name)) {
                    fields[field.name] = pending[field.name];
                }
            }
            if (!AnnotaCardFields) throw new Error("Structured field storage is unavailable.");
            if (Object.keys(fields).length) {
                await AnnotaCardFields.saveValues(item, fields);
                this.takePendingFields(text, item);
            }
            if (item.annotationType !== "image") this._lastColor = item.annotationColor;
            if (schema.some(field => field.type === "ai") && this.aiGenerationTrigger(color) === "auto") {
                await this.requestAIFields(item, { automatic:true });
            }
            else await this._syncPaperResearchNote(item);
        }
        catch (e) {
            log("New annotation structured fields: " + e);
            toast("ResearchAnnotator", this.t("gen.failed", { msg: e.message || e }), "error");
        }
        finally { this.inProgress.delete(id); }
    },
	// Visible generation failures.
	//
	// Historically failed calls were indistinguishable from deliberately empty
	// annotations. A failure tag makes them visible without requiring
	// the user to reread every annotation. It appears in the reader,
	// is searchable in the library, and provides an explicit retry entry point.
	// the context menu action "Retry failed comments".
      failedTag() {
		if (!getPref("markFailures", true)) return "";
		return String(getPref("failedTag", "annota-failed") || "").trim();
	},

	hasFailedTag(item) {
		let tag = this.failedTag();
		try { return !!tag && typeof item.hasTag === "function" && item.hasTag(tag); }
		catch (e) { return false; }
	},

	// Add the tag without saving so the caller can include it in the same
	// transaction and avoid two UI refreshes.
	setFailedTag(item, on) {
		let tag = this.failedTag();
		if (!tag) return false;
		try {
			let has = this.hasFailedTag(item);
			if (on && !has) { item.addTag(tag, 0); return true; }
			if (!on && has) { item.removeTag(tag); return true; }
		}
		catch (e) {
			log("setFailedTag: " + e);
		}
		return false;
	},

	async markFailed(id, why) {
		if (!this.failedTag()) return;
		try {
			let fresh = await Zotero.Items.getAsync(id);
			if (fresh && this.setFailedTag(fresh, true)) {
				await fresh.saveTx();
				log("annotation " + id + " marked failed: " + why);
			}
		}
		catch (e) {
			log("markFailed: " + e);
		}
	},

	// Truncate to max characters; zero or missing means no limit.
	truncate(s, max) {
		s = String(s || "").trim();
		if (!max || s.length <= max) return s;
		return s.slice(0, max).trim() + "…";
	},

	// Source metadata for variables such as {{title}} and {{authors}}.
	// {{year}}, {{abstract}}, {{publication}}, {{page}}.
	getContext(item) {
		let ctx = {
			title: "", authors: "", year: "",
			abstract: "", publication: "", page: ""
		};
		try {
			// Annotation page label as displayed in the PDF.
			ctx.page = item.annotationPageLabel || "";

			let parent = item.parentItem;               // PDF attachment.
			let top = (parent && parent.parentItem) ? parent.parentItem : parent;
			if (top && typeof top.getField === "function") {
				ctx.title = top.getField("title") || "";
				ctx.publication = top.getField("publicationTitle")
					|| top.getField("bookTitle")
					|| top.getField("proceedingsTitle")
					|| "";

				let maxAbs = parseInt(getPref("maxAbstractChars", 1200), 10);
				if (isNaN(maxAbs)) maxAbs = 1200;
				ctx.abstract = this.truncate(top.getField("abstractNote") || "", maxAbs);

				let ym = String(top.getField("date") || "").match(/\d{4}/);
				if (ym) ctx.year = ym[0];

				let creators = (typeof top.getCreators === "function") ? top.getCreators() : [];
				ctx.authors = creators
					.map(c => c.lastName || c.name || "")
					.filter(Boolean)
					.join(", ");
			}
		}
		catch (e) {
			log("getContext: " + e);
		}
		return ctx;
	},

	// Resolve references cited in the passage.
	//
	// For numeric or author-year citations, find the corresponding
	// bibliographic entry within the PDF reference section and supply
	// it as research context. Extract PDF text with
	// Zotero.PDFWorker.getFullText and cache it per attachment.
	//
	// This requires a text bibliography in the PDF. Otherwise return
	// an empty string and leave the workflow unchanged.

	_fullTextCache: new Map(),

	// Detect citation calls in the highlighted passage.
	detectCitationMarkers(text) {
		let numbers = new Set();
		let authorYears = [];
		let seen = new Set();
		let m;

		// Numeric forms include single references, lists and ranges.
		let numRe = /\[([\d\s,;‐-―-]+)\]/g;
		while ((m = numRe.exec(text)) !== null) {
			if (!/\d/.test(m[1])) continue;
			for (let part of m[1].split(/[,;]/)) {
				part = part.trim();
				let range = part.match(/^(\d{1,3})\s*[‐-―-]\s*(\d{1,3})$/);
				if (range) {
					let a = parseInt(range[1], 10), b = parseInt(range[2], 10);
					if (b >= a && b - a < 30) for (let i = a; i <= b; i++) numbers.add(i);
				}
				else if (/^\d{1,3}$/.test(part)) numbers.add(parseInt(part, 10));
			}
		}

		let pushAY = (author, year) => {
			author = String(author).trim().replace(/\s+/g, " ");
			let key = author.toLowerCase() + "|" + year;
			if (author && !seen.has(key)) { seen.add(key); authorYears.push({ author, year }); }
		};

		// Parenthesized author-year forms may contain several references.
		let parenRe = /\(([^()]{3,200})\)/g;
		while ((m = parenRe.exec(text)) !== null) {
			for (let chunk of m[1].split(/;/)) {
				let ay = chunk.match(
					/([\p{Lu}][\p{L}'’-]+(?:\s+(?:et\s+al\.?|and|&|y|und)\s*[\p{L}'’-]*)?)[,\s]+((?:1[6-9]|20)\d{2})[a-z]?/u);
				if (ay) pushAY(ay[1], ay[2]);
			}
		}

		// Narrative author-year citations follow the author's name.
		let narrRe = /([\p{Lu}][\p{L}'’-]+(?:\s+(?:et\s+al\.?|and|&)\s*[\p{L}'’-]*)?)\s*\(((?:1[6-9]|20)\d{2})[a-z]?\)/gu;
		while ((m = narrRe.exec(text)) !== null) pushAY(m[1], m[2]);

		return { numbers: Array.from(numbers).sort((a, b) => a - b), authorYears };
	},

	// Parent PDF text, cached per attachment.
	async getAttachmentFullText(item) {
		try {
			let att = item.parentItem;   // The annotation belongs to this attachment.
			if (!att || !att.isPDFAttachment || !att.isPDFAttachment()) return "";
			if (this._fullTextCache.has(att.id)) return this._fullTextCache.get(att.id);

			let res = await Zotero.PDFWorker.getFullText(att.id, null);
			let text = (res && res.text) ? String(res.text) : "";
			// Bound the number of documents retained in memory.
			if (this._fullTextCache.size > 5) {
				this._fullTextCache.delete(this._fullTextCache.keys().next().value);
			}
			this._fullTextCache.set(att.id, text);
			return text;
		}
		catch (e) {
			log("getAttachmentFullText: " + e);
			return "";
		}
	},

	// Find the bibliography using the last occurrence of a known heading.
	findBibliographySection(fullText) {
		if (!fullText) return "";
		let re = /\b(references?|bibliograph(?:y|ie)|works\s+cited|literature\s+cited|r[eé]f[eé]rences?(?:\s+bibliographiques)?|referencias|refer[eê]ncias|literaturverzeichnis)\b\s*:?/gi;
		let last = -1, m;
		let floor = Math.floor(fullText.length * 0.4);   // second part of the document
		while ((m = re.exec(fullText)) !== null) {
			if (m.index >= floor) last = m.index + m[0].length;
		}
		return last < 0 ? "" : fullText.slice(last);
	},

	// Stop at the start of the next bibliography entry.
	//
	// PDF extraction often joins adjacent entries without a newline,
	// for example a closing sentence followed by the next author's name.
	// Relying on line breaks would include part of the neighboring entry.
	// Detect punctuation plus whitespace followed by a plausible entry start:
	// a surname followed by an initial,
	// or a numeric bibliography marker such as [12].
	// minKeep protects the beginning of the current entry.
	_cutAtNextEntry(s, minKeep = 40) {
		s = String(s);
		let re = /[.!?)\]]\s+(\[\d{1,3}\]|\p{Lu}[\p{L}'’-]+,\s+\p{Lu}\.)/gu;
		let m;
		while ((m = re.exec(s)) !== null) {
			let idx = m.index + m[0].indexOf(m[1]);
			if (idx >= minKeep) return s.slice(0, idx).trim();
		}
		return s;
	},

	// Truncate an excessively long entry at a clean boundary.
	_trimEntry(s, max = 320) {
		s = String(s).replace(/\s+/g, " ").trim();
		if (s.length <= max) return s;
		let cut = s.slice(0, max);
		let dot = cut.lastIndexOf(". ");
		return dot > max * 0.5 ? cut.slice(0, dot + 1) : cut.trim() + "…";
	},

	// Structured variants return { marker, entry } rather than a string.
	// Historical helpers delegate to these so the bibliography index
	// and the provider prompt use exactly the same reference
	// resolution rules.
	resolveNumericRefs(bib, numbers) {
		return this.resolveNumericRefsStructured(bib, numbers)
			.map(r => r.marker + " " + r.entry);
	},

	resolveAuthorYearRefs(bib, pairs) {
		return this.resolveAuthorYearRefsStructured(bib, pairs)
			.map(r => r.marker + " → " + r.entry);
	},

	// Numbered entries can start with a bracketed or dotted number.
	resolveNumericRefsStructured(bib, numbers) {
		if (!bib || !numbers.length) return [];
		let markers = [], m;
		let re = /(?:^|[\s\n])(?:\[(\d{1,3})\]|(\d{1,3})\.(?=\s))/g;
		while ((m = re.exec(bib)) !== null) {
			markers.push({ n: parseInt(m[1] || m[2], 10), start: m.index + m[0].length, mStart: m.index });
		}
		if (!markers.length) return [];

		let out = [], wanted = new Set(numbers);
		for (let i = 0; i < markers.length; i++) {
			if (!wanted.has(markers[i].n)) continue;
			let end = (i + 1 < markers.length)
				? markers[i + 1].mStart
				: Math.min(bib.length, markers[i].start + 600);
			let body = this._trimEntry(
				this._cutAtNextEntry(bib.slice(markers[i].start, end)));
			if (body.length > 15) {
				out.push({ marker: "[" + markers[i].n + "]", entry: body });
				wanted.delete(markers[i].n);
			}
		}
		return out;
	},

	// For author-year entries, inspect the region around the name and year.
	resolveAuthorYearRefsStructured(bib, pairs) {
		if (!bib || !pairs.length) return [];
		let out = [];
		for (let { author, year } of pairs) {
			// Surname = first word ("Moulin et al." becomes "Moulin").
			let surname = author.split(/\s+/)[0].replace(/[^\p{L}'’-]/gu, "");
			if (surname.length < 2) continue;
			let esc = surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			let re = new RegExp("\\b" + esc + "\\b", "giu");
			let m, found = null;
			while ((m = re.exec(bib)) !== null) {
				let win = bib.slice(m.index, m.index + 700);
				if (win.includes(year)) { found = win; break; }
			}
			if (found) {
				// An entry ends where the next begins, regardless of line breaks.
				// Do not stop at the first period, often immediately after the year:
				// doing so would discard the article title and journal.
				let body = this._trimEntry(this._cutAtNextEntry(found));
				if (body.length > 15) {
					out.push({ marker: "(" + author + ", " + year + ")", entry: body });
				}
			}
		}
		return out;
	},

	// Deterministic PDF internal-link resolution.
	//
	// The reader's citation-hover popup follows a PDF /Link annotation
	// whose destination points to the bibliography entry. Follow that
	// link instead of guessing the citation destination.
	// Requires the PDF to be open in a reader tab with pdf.js loaded.
	// Otherwise fall back to textual reference matching.

	// Open reader for this attachment, or null.
	findReaderFor(attachmentID) {
		try {
			let readers = Zotero.Reader && Zotero.Reader._readers;
			if (!readers) return null;
			return readers.find(r => r && r.itemID === attachmentID) || null;
		}
		catch (e) {
			return null;
		}
	},

	// Access the pdf.js object without the Xray that hides its JavaScript
	// methods from extension code. Expected pdf.js promise results
	// also pass through this helper.
	_waive(o) {
		try { return (o && o.wrappedJSObject) || o; }
		catch (e) { return o; }
	},

	// Reader pdf.js document, accessed through the viewer iframe.
	getPDFDocument(reader) {
		try {
			let win = reader && reader._internalReader
				&& reader._internalReader._primaryView
				&& reader._internalReader._primaryView._iframeWindow;
			if (!win) return null;
			let app = win.PDFViewerApplication
				|| (win.wrappedJSObject && win.wrappedJSObject.PDFViewerApplication);
			return (app && this._waive(app.pdfDocument)) || null;
		}
		catch (e) {
			log("getPDFDocument: " + e);
			return null;
		}
	},

	// Test PDF rectangle intersection with a margin for superscripts.
	_rectsOverlap(a, b, pad = 2) {
		let ax1 = Math.min(a[0], a[2]) - pad, ax2 = Math.max(a[0], a[2]) + pad;
		let ay1 = Math.min(a[1], a[3]) - pad, ay2 = Math.max(a[1], a[3]) + pad;
		let bx1 = Math.min(b[0], b[2]), bx2 = Math.max(b[0], b[2]);
		let by1 = Math.min(b[1], b[3]), by2 = Math.max(b[1], b[3]);
		return ax1 <= bx2 && bx1 <= ax2 && ay1 <= by2 && by1 <= ay2;
	},

	// Resolve a link destination to { pageIndex, y }.
	async _resolveDestination(pdfDoc, dest) {
		try {
			let d = dest;
			if (typeof d === "string") d = this._waive(await pdfDoc.getDestination(d));
			if (!Array.isArray(d) || !d.length) return null;
			let pageIndex = await pdfDoc.getPageIndex(d[0]);
			// Destination form: [ref, {name:'XYZ'}, x, y, zoom]; /Fit may omit y.
			let y = (typeof d[3] === "number") ? d[3] : null;
			return { pageIndex, y };
		}
		catch (e) {
			log("_resolveDestination: " + e);
			return null;
		}
	},

	// Read page text downward from the destination position.
	async _textAtDestination(pdfDoc, pageIndex, y, maxChars = 600) {
		try {
			let page = this._waive(await pdfDoc.getPage(pageIndex + 1));
			let content = this._waive(await page.getTextContent());
			let items = (content && content.items) || [];
			let rows = [];
			for (let it of items) {
				let str = it.str;
				if (!str) continue;
				let ty = (it.transform && it.transform.length > 5) ? it.transform[5] : null;
				if (ty === null) continue;
				// PDF coordinates start at the bottom: the entry starts at y
				// and continues toward decreasing y. Add an upward margin
				// for destinations that point to the preceding line.
				if (y !== null && ty > y + 12) continue;
				rows.push({ y: ty, str, eol: it.hasEOL });
			}
			rows.sort((a, b) => b.y - a.y);
			// Recognize numeric markers or surname/initial bibliography starts.
			let entryStart = /^(\[\d{1,3}\]|\d{1,3}\.\s|\p{Lu}[\p{L}'’-]+,\s+\p{Lu}\.)/u;
			let out = "";
			for (let r of rows) {
				// Stop at the next entry to avoid combining references and
				// causing the model to attribute evidence to the wrong source.
				if (out.length > 30 && entryStart.test(r.str.trim())) break;
				out += r.str + (r.eol ? "\n" : " ");
				if (out.length >= maxChars) break;
			}
			return out.trim();
		}
		catch (e) {
			log("_textAtDestination: " + e);
			return "";
		}
	},

	// Read text inside an area annotation line by line.
	// Use pdf.js, so the PDF must be open in the reader, as it is
	// when an area is first drawn. If unavailable, or an image has no
	// extractable text, return an empty string.
	async areaText(item, maxChars = 6000) {
		try {
			let pos = JSON.parse(item.annotationPosition || "{}");
			let rects = (pos.rects || []).filter(r => Array.isArray(r) && r.length >= 4);
			if (!rects.length || typeof pos.pageIndex !== "number") return "";
			let reader = this.findReaderFor(item.parentID);
			let pdfDoc = this.getPDFDocument(reader);
			if (!pdfDoc) return "";
			let page = this._waive(await pdfDoc.getPage(pos.pageIndex + 1));
			let content = this._waive(await page.getTextContent());
			let items = (content && content.items) || [];
			let inside = (x, y) => rects.some(r => x >= Math.min(r[0], r[2]) && x <= Math.max(r[0], r[2])
				&& y >= Math.min(r[1], r[3]) && y <= Math.max(r[1], r[3]));
			let parts = [];
			for (let it of items) {
				let str = it.str;
				let t = it.transform;
				if (!str || !str.trim() || !t || t.length < 6) continue;
				let h = Math.abs(it.height || t[3] || 0) || 8;
				let x = t[4] + (it.width || 0) / 2, y = t[5] + h / 2;
				if (!inside(x, y)) continue;
				parts.push({ x: t[4], y: t[5], h, str });
			}
			// Group lines within half a character height, ordered top to bottom.
			parts.sort((a, b) => b.y - a.y || a.x - b.x);
			let lines = [];
			for (let p of parts) {
				let line = lines[lines.length - 1];
				if (line && Math.abs(line.y - p.y) <= Math.max(line.h, p.h) / 2) line.items.push(p);
				else lines.push({ y: p.y, h: p.h, items: [p] });
			}
			let out = lines.map(l => l.items.sort((a, b) => a.x - b.x).map(p => p.str.trim()).join(" "))
				.join("\n");
			return out.length > maxChars ? out.slice(0, maxChars) + "…" : out;
		}
		catch (e) {
			log("areaText: " + e);
			return "";
		}
	},

	// Follow internal links overlapping the highlight. Return an empty list
	// if the PDF is closed or has no usable links.
	async getLinkedReferences(item) {
		try {
			let att = item.parentItem;
			if (!att) return [];
			let reader = this.findReaderFor(att.id);
			if (!reader) return [];
			let pdfDoc = this.getPDFDocument(reader);
			if (!pdfDoc) return [];

			let pos = item.annotationPosition;
			if (typeof pos === "string") pos = JSON.parse(pos);
			if (!pos || typeof pos.pageIndex !== "number" || !Array.isArray(pos.rects)) return [];

			let page = this._waive(await pdfDoc.getPage(pos.pageIndex + 1));
			let annots = this._waive(await page.getAnnotations());
			if (!annots || !annots.length) return [];

			let max = parseInt(getPref("maxRefs", 8), 10) || 8;
			let out = [], seen = new Set();
			for (let a of annots) {
				if (out.length >= max) break;
				// Follow only internal destinations, not external URLs.
				let isLink = a && (a.subtype === "Link" || a.subtype === "link");
				let dest = a && (a.dest || (a.action && a.action.dest));
				if (!isLink || !dest || a.url) continue;
				if (!Array.isArray(a.rect)) continue;
				if (!pos.rects.some(r => this._rectsOverlap(a.rect, r))) continue;

				let target = await this._resolveDestination(pdfDoc, dest);
				if (!target) continue;
				let key = target.pageIndex + ":" + (target.y === null ? "?" : Math.round(target.y));
				if (seen.has(key)) continue;
				seen.add(key);

				let txt = await this._textAtDestination(pdfDoc, target.pageIndex, target.y);
				txt = this._trimEntry(this._cutAtNextEntry(txt));
				if (txt.length > 15) out.push(txt);
			}
			if (out.length) log("References resolved through PDF links: " + out.length);
			return out;
		}
		catch (e) {
			log("getLinkedReferences: " + e);
			return [];
		}
	},

	// EPUB footnote citation resolution.
	//
	// EPUB sources often appear in footnotes reached through superscript
	// internal links. The note can identify the author, work, year and page.
	// Read the EPUB archive itself, locate the passage in its chapter,
	// collect footnote links from that passage and resolve their
	// destinations to note text. This does not require an open reader,
	// so library batch processing can use the same path.
	// The batch workflow can therefore resolve these citations too.

	_epubCache: new Map(),

	isEPUBAttachment(att) {
		try {
			return !!att && typeof att.isAttachment === "function" && att.isAttachment()
				&& att.attachmentContentType === "application/epub+zip";
		}
		catch (e) {
			return false;
		}
	},

	_domParser() {
		if (typeof DOMParser !== "undefined") return new DOMParser();
		let win = Zotero.getMainWindow && Zotero.getMainWindow();
		if (win && win.DOMParser) return new win.DOMParser();
		throw new Error("DOMParser indisponible");
	},

	// Open the archive for each entry read and close it afterward:
	// Zotero must be free to move or synchronize the book without
	// finding the archive locked.
	async _readZipEntry(path, entry) {
		let zr = Components.classes["@mozilla.org/libjar/zip-reader;1"]
			.createInstance(Components.interfaces.nsIZipReader);
		zr.open(Zotero.File.pathToFile(path));
		try {
			if (!zr.hasEntry(entry)) return null;
			let stream = zr.getInputStream(entry);
			try {
				return await Zotero.File.getContentsAsync(stream, "utf-8");
			}
			finally {
				stream.close();
			}
		}
		finally {
			zr.close();
		}
	},

	// Resolve an archive entry relative to another, including parent segments and fragments.
	_joinPath(base, rel) {
		rel = String(rel || "").split("#")[0].split("?")[0];
		if (!rel) return base;
		let parts = rel.startsWith("/") ? [] : String(base).split("/").slice(0, -1);
		for (let seg of rel.split("/")) {
			if (!seg || seg === ".") continue;
			if (seg === "..") parts.pop();
			else parts.push(seg);
		}
		let out = parts.join("/");
		try { out = decodeURIComponent(out); }
		catch (e) { /* The path is already decoded. */ }
		return out;
	},

	_parseMarkup(str, type) {
		let parser = this._domParser();
		let doc = parser.parseFromString(str, type || "application/xhtml+xml");
		// Some EPUBs contain malformed HTML rejected by the XML parser;
		// the HTML parser can still read it.
		let broken = !doc || !doc.documentElement
			|| doc.documentElement.localName === "parsererror"
			|| doc.getElementsByTagName("parsererror").length > 0;
		if (broken && type !== "text/xml") doc = parser.parseFromString(str, "text/html");
		return doc;
	},

	// Cache reading-order spine chapters and parsed documents for an open book.
	// Keep them for ten minutes because reading sessions annotate several
	// passages from the same book.
	async _openEPUB(att) {
		let path = await att.getFilePathAsync();
		if (!path) return null;
		let book = this._epubCache.get(att.id);
		if (book && book.path === path && Date.now() - book.at < 10 * 60000) return book;

		book = { path, at: Date.now(), spine: [], docs: new Map() };
		let container = await this._readZipEntry(path, "META-INF/container.xml");
		if (!container) return null;
		let cdoc = this._parseMarkup(container, "text/xml");
		let rootFile = cdoc.getElementsByTagNameNS("*", "rootfile")[0];
		let opfPath = rootFile && rootFile.getAttribute("full-path");
		if (!opfPath) return null;
		let opf = await this._readZipEntry(path, opfPath);
		if (!opf) return null;
		let odoc = this._parseMarkup(opf, "text/xml");

		let idToHref = new Map();
		for (let it of odoc.getElementsByTagNameNS("*", "item")) {
			let id = it.getAttribute("id"), href = it.getAttribute("href");
			if (id && href) idToHref.set(id, this._joinPath(opfPath, href));
		}
		// Retain placeholders for missing entries: the chapter index in an
		// annotation CFI counts every spine entry.
		for (let ref of odoc.getElementsByTagNameNS("*", "itemref")) {
			book.spine.push(idToHref.get(ref.getAttribute("idref")) || null);
		}

		if (this._epubCache.size > 2) {
			this._epubCache.delete(this._epubCache.keys().next().value);
		}
		this._epubCache.set(att.id, book);
		return book;
	},

	async _epubDoc(book, entry) {
		if (!entry) return null;
		if (book.docs.has(entry)) return book.docs.get(entry);
		let str = await this._readZipEntry(book.path, entry);
		let doc = str ? this._parseMarkup(str) : null;
		book.docs.set(entry, doc);
		return doc;
	},

	// EPUB highlights store text and a CFI. Locate the text while ignoring
	// whitespace differences between the archive and the reader's saved
	// annotation text.
	_squeeze(s) {
		return String(s || "").replace(/[\s\u00ad\u200b-\u200d\u2060\ufeff]+/g, "");
	},

	// Build compact document text and record each text node's starting
	// offset within it.
	_textIndex(doc) {
		let flat = "", starts = new Map();
		let walk = (node) => {
			for (let c = node.firstChild; c; c = c.nextSibling) {
				if (c.nodeType === 3) {
					starts.set(c, flat.length);
					flat += this._squeeze(c.nodeValue);
				}
				else if (c.nodeType === 1) {
					let n = String(c.localName || "").toLowerCase();
					if (n === "script" || n === "style" || n === "head") continue;
					walk(c);
				}
			}
		};
		walk(doc.body || doc.documentElement);
		return { flat, starts };
	},

	_findPassage(index, text) {
		let needle = this._squeeze(text);
		if (needle.length < 8) return null;
		let at = index.flat.indexOf(needle);
		if (at >= 0) return { start: at, end: at + needle.length };
		// Fallback to passage beginnings and endings when the middle differs
		// because the reader normalized quotes or ligatures.
		let k = Math.min(60, Math.floor(needle.length / 3));
		let head = needle.slice(0, k), tail = needle.slice(-k);
		let s = index.flat.indexOf(head);
		while (s >= 0) {
			let e = index.flat.indexOf(tail, s + k);
			if (e >= 0 && e - s <= needle.length * 1.5 + 50) return { start: s, end: e + k };
			s = index.flat.indexOf(head, s + 1);
		}
		return null;
	},

	// A footnote call can be a number, Roman numeral, letter or symbol,
	// The number may also be enclosed in brackets.
	_NOTE_MARK: /^[[(]?\s*(\d{1,4}|[ivxlc]{1,6}|[a-z]|[*\u2020\u2021\u00a7\u00b6]{1,3})\s*[\])]?\.?$/i,

	_semanticType(el) {
		let t = "";
		try { t += " " + (el.getAttributeNS("http://www.idpf.org/2007/ops", "type") || ""); }
		catch (e) { /* attribut absent */ }
		t += " " + (el.getAttribute("epub:type") || "") + " " + (el.getAttribute("role") || "");
		return t.toLowerCase();
	},

	_firstText(el) {
		for (let c = el.firstChild; c; c = c.nextSibling) {
			if (c.nodeType === 3 && this._squeeze(c.nodeValue)) return c;
			if (c.nodeType === 1) {
				let t = this._firstText(c);
				if (t) return t;
			}
		}
		return null;
	},

	// Include footnote links inside or immediately following the passage:
	// users often stop selection at a word or punctuation even though the
	// following superscript citation belongs to that passage.
	_noteCallsIn(doc, index, span) {
		let out = [];
		for (let a of doc.getElementsByTagNameNS("*", "a")) {
			let href = a.getAttribute("href")
				|| a.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
			if (!href.includes("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
			let label = String(a.textContent || "").replace(/\s+/g, " ").trim();
			let semantic = /noteref/.test(this._semanticType(a));
			if (!semantic && !this._NOTE_MARK.test(label)) continue;
			let first = this._firstText(a);
			if (!first || !index.starts.has(first)) continue;
			let pos = index.starts.get(first);
			let inside = pos >= span.start && pos < span.end;
			if (!inside && pos >= span.end && pos - span.end <= 3) {
				inside = /^[.,;:!?\u00bb\u201d\u2019"')\]]*$/.test(index.flat.slice(span.end, pos));
			}
			if (!inside) continue;
			label = label.replace(/^[[(]\s*/, "").replace(/\s*[\])]?\.?$/, "") || label;
			out.push({ a, href, label });
		}
		return out;
	},

	async _noteTarget(book, entry, href) {
		let hash = href.indexOf("#");
		let file = href.slice(0, hash), frag = href.slice(hash + 1);
		try { frag = decodeURIComponent(frag); }
		catch (e) { /* identifiant brut */ }
		if (!frag) return null;
		let tEntry = file ? this._joinPath(entry, file) : entry;
		let tdoc = await this._epubDoc(book, tEntry);
		if (!tdoc) return null;
		let el = tdoc.getElementById(frag);
		if (!el) {
			for (let n of tdoc.getElementsByTagNameNS("*", "*")) {
				if (n.getAttribute("id") === frag || n.getAttribute("name") === frag) { el = n; break; }
			}
		}
		return el ? { doc: tdoc, el, entry: tEntry } : null;
	},

	_BLOCK: /^(p|div|li|aside|section|article|dd|dt|td|blockquote|footer|note)$/,

	// Find the note's containing block; the link target is often an empty
	// anchor at the start of its paragraph.
	_noteBlock(el) {
		let b = el;
		while (b && b.nodeType === 1 && !this._BLOCK.test(String(b.localName || "").toLowerCase())) {
			b = b.parentNode;
		}
		if (!b || b.nodeType !== 1) return null;
		// A block containing only the note number is not the whole note;
		// move up one level to find its content.
		let p = b.parentNode;
		if (this._squeeze(b.textContent).length < 6 && p && p.nodeType === 1
			&& this._BLOCK.test(String(p.localName || "").toLowerCase())) {
			b = p;
		}
		return b;
	},

	_escRe(s) {
		return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	},

	// Read note text without the leading number.
	_noteText(block, label) {
		let s = String(block.textContent || "").replace(/\s+/g, " ").trim();
		if (label) {
			s = s.replace(new RegExp("^[[(]?\\s*" + this._escRe(label)
				+ "\\s*[\\])]?\\s*[.:)\\-\\u2013\\u2014]?\\s*", "i"), "");
		}
		return s;
	},

	// Verify that the target is a footnote rather than an index page or
	// cross-reference. Prefer semantic markup, then the target name,
	// then a note beginning with the same number as the citation call.
	_looksLikeNote(call, el, block) {
		if (/noteref/.test(this._semanticType(call.a))) return true;
		for (let n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentNode, i++) {
			if (/footnote|endnote|rearnote|\bnote\b/.test(this._semanticType(n))) return true;
			if (String(n.localName || "").toLowerCase() === "aside") return true;
			let names = (n.getAttribute("id") || "") + " " + (n.getAttribute("class") || "");
			if (/(^|[^a-z])(fn|ftn|notes?|nbp|ntb|ntf|endnotes?|footnotes?)([^a-z]|$)/i.test(names)) {
				return true;
			}
		}
		let head = String(block.textContent || "").replace(/\s+/g, " ").trim().slice(0, 16);
		return new RegExp("^[[(]?\\s*" + this._escRe(call.label) + "(?![0-9])", "i").test(head);
	},

	_IBID: /^(ibid|ibidem|idem|id)\b\.?/i,
	_OPCIT: /\b(op|art|loc)\.?\s*cit\b/i,

	// Previous notes, ordered nearest first.
	_previousNotes(block, max) {
		let out = [];
		for (let n = block.previousElementSibling; n && out.length < max; n = n.previousElementSibling) {
			let ln = String(n.localName || "").toLowerCase();
			if (/^h[1-6]$/.test(ln) || ln === "hr") break;
			if (this._squeeze(n.textContent).length > 6) out.push(n);
		}
		return out;
	},

	_leadingNumber(block) {
		let m = String(block.textContent || "").trim().match(/^[[(]?\s*(\d{1,4})/);
		return m ? m[1] : "";
	},

	// Ibid. and op. cit. do not name the source. Resolve them through
	// earlier notes: Ibid. refers to the preceding note, following any
	// Ibid. chain; op. cit. refers to the latest dated source by the
	// same author.
	_earlierSource(block, noteText) {
		let ibid = this._IBID.test(noteText);
		let opcit = !ibid && this._OPCIT.test(noteText);
		if (!ibid && !opcit) return null;

		if (ibid) {
			for (let prev of this._previousNotes(block, 4)) {
				let t = this._noteText(prev, this._leadingNumber(prev));
				if (!this._IBID.test(t)) return { block: prev, text: t };
			}
			return null;
		}

		// Possible authors are capitalized words preceding op. cit., excluding
		// introductory phrases such as quoted-in references.
		let cut = noteText.search(this._OPCIT);
		let segment = noteText.slice(0, cut).split(";").pop();
		let names = (segment.match(/\p{Lu}[\p{L}'\u2019-]{2,}/gu) || [])
			.filter(w => !/^(cit[ée]e?s?|voir|cf|in|dans|chez|selon|see|quoted|cited|ibid|idem|trad|ed|op)$/i.test(w));
		if (!names.length) return null;
		let doc = block.ownerDocument;
		let cls = block.getAttribute("class");
		let candidates = Array.from(doc.getElementsByTagNameNS("*", block.localName))
			.filter(n => n.getAttribute("class") === cls);
		let i = candidates.indexOf(block);
		for (let surname of names) {
			for (let j = i - 1, seen = 0; j >= 0 && seen < 300; j--, seen++) {
				let t = this._noteText(candidates[j], this._leadingNumber(candidates[j]));
				if (t.includes(surname) && /\b(1[5-9]|20)\d{2}\b/.test(t) && !this._OPCIT.test(t)) {
					return { block: candidates[j], text: t };
				}
			}
		}
		return null;
	},

	// Check whether a note cites a publication with a year,
	// publication year, or begins with an author in bibliographic form
	// an author surname or initials,
	// possibly following an introductory citation phrase; translator notes or
	// an internal reference ("cf. infra") has neither.
	_citesWork(note) {
		let s = String(note || "").trim();
		if (/^(n\.\s?d\.\s?[teé]\.?|note d[eu'\u2019]|en (fran[cç]ais|anglais|allemand|italien|espagnol|latin|grec)\b)/i.test(s)) {
			return false;
		}
		if (/(^|[^\d])(1[5-9]\d{2}|20\d{2})(?!\d)/.test(s)) return true;
		let lead = s.replace(/^(cit[ée]e?s?\s+(in|par|dans|chez)|voir( aussi)?|see( also)?|cf\.?)\s+/i, "");
		return /^(\p{Lu}[\p{L}'\u2019-]{2,},?\s+(\p{Lu}\.\s*-?){1,3}[,\s]|(\p{Lu}\.\s*-?){1,3}\s*\p{Lu}[\p{L}'\u2019-]{2,}\s*[,(])/u.test(lead);
	},

	// Resolve cited EPUB footnotes to [{ marker, entry }].
	async getEPUBFootnoteReferences(item, text) {
		try {
			let att = item.parentItem;
			if (!this.isEPUBAttachment(att)) return [];
			let book = await this._openEPUB(att);
			if (!book || !book.spine.length) return [];

			// Try the chapter selected by the CFI first; a spine position such as
			// /6/18 identifies entry nine. Search other chapters if necessary.
			let pos = item.annotationPosition;
			if (typeof pos === "string") pos = JSON.parse(pos);
			let m = String((pos && pos.value) || "").match(/^epubcfi\(\/6\/(\d+)/);
			let first = m ? parseInt(m[1], 10) / 2 - 1 : -1;
			let order = book.spine.filter(Boolean);
			if (first >= 0 && book.spine[first]) {
				order = [book.spine[first]].concat(order.filter(e => e !== book.spine[first]));
			}

			let doc = null, entry = null, index = null, span = null;
			for (let e of order) {
				let d = await this._epubDoc(book, e);
				if (!d) continue;
				let ix = this._textIndex(d);
				let sp = this._findPassage(ix, text);
				if (sp) { doc = d; entry = e; index = ix; span = sp; break; }
			}
			if (!doc) {
				log("EPUB passage not found; footnotes skipped");
				return [];
			}

			let max = parseInt(getPref("maxRefs", 8), 10) || 8;
			let out = [], seen = new Set();
			for (let call of this._noteCallsIn(doc, index, span)) {
				if (out.length >= max) break;
				let target = await this._noteTarget(book, entry, call.href);
				if (!target) continue;
				let block = this._noteBlock(target.el);
				if (!block || !this._looksLikeNote(call, target.el, block)) continue;
				let key = target.entry + "#" + call.href.split("#")[1];
				if (seen.has(key)) continue;
				seen.add(key);

				let note = this._noteText(block, call.label);
				if (note.length < 3) continue;
				let earlier = this._earlierSource(block, note);

				// Books often mix citations with author remarks in their footnotes.
				// A remark referring to later discussion may cite no publication;
				// passing it as a source led the model to cite the current book.
				// Exclude such remarks unless a year or an earlier resolved note
				// identifies the source.
				if (!earlier && !this._citesWork(note)) {
					log("EPUB : note " + call.label + " has no cited publication; remark excluded");
					continue;
				}
				out.push({ marker: "[note " + call.label + "]", entry: this._trimEntry(note, 600) });

				if (earlier && out.length < max) {
					let n = this._leadingNumber(earlier.block);
					out.push({
						marker: "[note " + (n || "?") + ", the source note " + call.label + " refers to]",
						entry: this._trimEntry(earlier.text, 600)
					});
				}
			}
			if (out.length) log("EPUB footnotes resolved through links: " + out.length);
			return out;
		}
		catch (e) {
			log("getEPUBFootnoteReferences: " + e);
			return [];
		}
	},

	// Shared resolution: deterministic PDF internal links first,
	// then textual bibliography matching as a fallback.
	// Return [{ marker, entry }] for both the prompt and bibliography index.
	async collectReferencesStructured(item, text) {
		if (!getPref("resolveCitations", true)) return [];
		try {
			let max = parseInt(getPref("maxRefs", 8), 10) || 8;

			// EPUB citations usually use superscript footnote numbers that the
			// text-based citation detector below does not recognize,
			// so use the EPUB footnote path first.
			if (this.isEPUBAttachment(item.parentItem)) {
				let notes = await this.getEPUBFootnoteReferences(item, text);
				if (notes.length) return notes.slice(0, max);
			}

			let markers = this.detectCitationMarkers(text);

			// Without a citation call there is nothing to resolve.
			// This cheap textual check avoids opening the PDF and traversing
			// its links, which can take seconds for a large document.
			// Most highlighted passages contain no citations.
			if (!markers.numbers.length && !markers.authorYears.length) {
				log("No citation calls; reference resolution skipped");
				return [];
			}

			// First, follow reliable internal PDF links.
			let linked = await this.getLinkedReferences(item);
			if (linked.length) {
				// When the numeric citation counts match exactly, pair their
				// results in order to preserve the original numeric markers.
				let nums = markers.numbers;
				let pair = (nums.length === linked.length);
				return linked.slice(0, max).map((entry, i) => ({
					marker: pair ? "[" + nums[i] + "]" : "",
					entry
				}));
			}

			// Fallback: look up detected calls in the bibliography.
			let fullText = await this.getAttachmentFullText(item);
			if (!fullText) return [];
			let bib = this.findBibliographySection(fullText);
			if (!bib) return [];

			return this.resolveNumericRefsStructured(bib, markers.numbers)
				.concat(this.resolveAuthorYearRefsStructured(bib, markers.authorYears))
				.slice(0, max);
		}
		catch (e) {
			log("collectReferencesStructured: " + e);
			return [];
		}
	},

	// Text version supplied through {{references}}.
	async getReferences(item, text) {
		let refs = await this.collectReferencesStructured(item, text);
		return refs.map(r => r.marker ? r.marker + " " + r.entry : r.entry).join("\n");
	},

	// Readable context block sent in standard mode.
	formatContextBlock(vars) {
		let lines = [];
		if (vars.title) lines.push("Title: " + vars.title);
		if (vars.authors) lines.push("Authors: " + vars.authors);
		if (vars.year) lines.push("Year: " + vars.year);
		if (vars.publication) lines.push("Publication: " + vars.publication);
		// Label the page explicitly so the model does not confuse the
		// highlight page with a page cited in a reference field.
		if (vars.page) {
			lines.push("Passage page: " + vars.page + " (where the passage sits in the"
				+ " document being read; never a cited page, never use it in a reference)");
		}
		if (vars.abstract) lines.push("Document abstract: " + vars.abstract);
		let block = lines.length ? "Document context:\n" + lines.join("\n") : "";
		if (vars.references) {
			// EPUB footnote calls can be attached directly to passage text;
			// without context the model may not recognize them as citations.
			let header = /^\[note /m.test(vars.references)
				? "Works cited in the passage, through footnotes. A footnote call is a"
					+ " number glued to a word or punctuation mark of the passage"
					+ " (\"bref9.\" calls [note 9]); each note below is the one the passage"
					+ " calls, quoted as printed. Take the cited author, year and page"
					+ " from the note. A note may be a mere remark by the author or a"
					+ " cross-reference to another part of the book (\"cf. infra\","
					+ " \"see chapter 3\"): it cites no work, so it gives no reference."
					+ " Never cite the document being read itself as a source:\n"
				: "Works cited in the passage (resolved from this article's reference list):\n";
			block += (block ? "\n\n" : "") + header + vars.references;
		}
		return block;
	},

	// Substitute {{variable}} with its value, or empty text if unknown.
	substitute(tpl, vars) {
		return String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) =>
			(Object.prototype.hasOwnProperty.call(vars, key) && vars[key] != null)
				? String(vars[key]) : "");
	},

	// Build provider messages: { system, user }.
	// Advanced mode: when the prompt contains {{text}} or {{comment}}, put
	// everything in the user message so its structure remains user controlled.
	// Standard mode: the prompt supplies system instructions; the passage
	// and optional document context are added in the user message.
	// Variables are available in prompts and output templates.
	buildVars({ text, ctx, comment, fields }) {
		let vars = {
			text: text || "",
			comment: comment || "",
			title: (ctx && ctx.title) || "",
			authors: (ctx && ctx.authors) || "",
			year: (ctx && ctx.year) || "",
			abstract: (ctx && ctx.abstract) || "",
			publication: (ctx && ctx.publication) || "",
			page: (ctx && ctx.page) || "",
			references: (ctx && ctx.references) || "",
			maxWords: parseInt(getPref("maxWords", 80), 10) || 80,
			language: String(getPref("language", "français")).trim() || "français"
		};
		// Manual fields never overwrite built-in variables.
		if (fields) {
			for (let k of Object.keys(fields)) {
				if (!this.RESERVED_VARS.includes(k)) vars[k] = fields[k];
			}
		}
		return vars;
	},

	buildPrompt({ text, ctx, color, comment, fields, promptOverride }) {
		let tpl = promptOverride || this.getPromptForColor(color);
		let vars = this.buildVars({ text, ctx, comment, fields });

		let selfContained = /\{\{\s*(text|comment)\s*\}\}/.test(tpl);
		if (selfContained) {
			return { system: "", user: this.substitute(tpl, vars) };
		}

		let parts = [];
		if (getPref("sendContext", true)) {
			let block = this.formatContextBlock(vars);
			if (block) parts.push(block);
		}
		if (comment && String(comment).trim()) {
			parts.push("Existing note:\n\"\"\"\n" + comment + "\n\"\"\"");
		}
		parts.push((this.isImageKey(color)
			? "Text found inside the selected area of the page (figure, table or excerpt; layout lost):"
			: "Highlighted passage:") + "\n\"\"\"\n" + text + "\n\"\"\"");

		return { system: this.substitute(tpl, vars), user: parts.join("\n\n") };
	},

	// Append instructions requiring exactly the declared fields.
	// The model fills only missing requested values, one per line,
	// rather than producing unconstrained free-form output. This is
	// the connection between prompt behavior and configured fields.
	buildFieldInstruction(toFill, schema, values) {
		let lines = [
			"",
			"Fill in the fields listed below, and nothing else. Answer with one"
				+ " line per field, in the form `name: value`, using exactly these"
				+ " names. No preamble, no bullet points, no extra field.",
			""
		];
		for (let f of toFill) {
			let d = "- " + f.name + " (" + f.label + ")";
			if (f.type === "select" && f.options.length) {
				d += " — choose exactly one of: " + f.options.join(", ");
			}
			else if (f.type === "check") d += " — answer true or false";
			else if (f.type === "textarea") d += " — may span several lines";
			lines.push(d);
		}
		// Existing user values are context only, never rewrite targets.
		// Do not replace manually entered content.
		let given = schema.filter(f => !toFill.includes(f)
			&& String((values && values[f.name]) || "").trim());
		if (given.length) {
			lines.push("", "The user already filled in these fields. Do not repeat"
				+ " them and do not rewrite them — use them as context:");
			for (let f of given) {
				lines.push("- " + f.name + " (" + f.label + "): " + values[f.name]);
			}
		}
		return lines.join("\n");
	},

	// JSON variant of the same instructions; the provider enforces
	// the response format instead of relying on prose alone.
	buildFieldInstructionJSON(toFill, schema, values) {
		let lines = [
			"",
			"Answer with a single JSON object, and nothing else. One key per field"
				+ " listed below, using exactly these names, with string values"
				+ " (use \"\" for a field you cannot fill).",
			""
		];
		for (let f of toFill) {
			let d = "- " + f.name + " (" + f.label + ")";
			if (f.type === "select" && f.options.length) {
				d += " — one of: " + f.options.join(", ");
			}
			else if (f.type === "check") d += " — \"true\" or \"\"";
			lines.push(d);
		}
		let given = schema.filter(f => !toFill.includes(f)
			&& String((values && values[f.name]) || "").trim());
		if (given.length) {
			lines.push("", "Already filled in by the user. Do not include these keys,"
				+ " do not rewrite them — use them as context:");
			for (let f of given) {
				lines.push("- " + f.name + " (" + f.label + "): " + values[f.name]);
			}
		}
		return lines.join("\n");
	},

	// Parse a JSON response; return null if it is not JSON so the caller
	// fall back to parseFieldReply, which does not require structured JSON.
	parseJSONReply(reply, toFill) {
		let raw = String(reply || "").trim();
		// Models often wrap JSON in a fenced code block.
		let fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
		if (fence) raw = fence[1].trim();
		// Or add prose around it; isolate the first complete object.
		let first = raw.indexOf("{"), last = raw.lastIndexOf("}");
		if (first === -1 || last <= first) return null;
		raw = raw.slice(first, last + 1);

		let obj;
		try { obj = JSON.parse(raw); }
		catch (e) { return null; }
		if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

		let byName = {};
		for (let f of toFill) byName[f.name] = f;
		let out = {}, seen = 0;
		for (let k of Object.keys(obj)) {
			if (!byName[k]) continue;              // Ignore invented keys.
			let v = obj[k];
			if (v === null || v === undefined) v = "";
			if (typeof v === "boolean") v = v ? "true" : "";
			else if (Array.isArray(v)) v = v.filter(x => x != null).join(", ");
			else if (typeof v === "object") continue;
			// JSON has not passed through sanitize, so Markdown remains intact.
			v = this.unwrapWholeTag(this.demarkdown(String(v)).trim());
			if (byName[k].type === "check") v = /^(true|yes|oui|1|x)$/i.test(v) ? "true" : "";
			out[k] = v;
			seen++;
		}
		return seen ? out : null;
	},

	// Read name: value output, tolerating bullets, Markdown emphasis and
	// multi-line values. A line without a field marker continues the
	// current value. Retain only requested fields.
	parseFieldReply(reply, toFill) {
		let names = toFill.map(f => f.name);
		let byName = {};
		for (let f of toFill) byName[f.name] = f;

		let out = {}, current = null;
		for (let raw of String(reply || "").split("\n")) {
			let m = raw.match(/^\s*(?:[-*]\s*)?\**\s*(\w+)\s*\**\s*:\s*(.*)$/);
			if (m && names.includes(m[1])) {
				current = m[1];
				out[current] = m[2].trim();
				continue;
			}
			if (current !== null && raw.trim()) {
				out[current] += (out[current] ? "\n" : "") + raw.trim();
			}
		}

		// If exactly one field was requested and no marker matched, use the
		// whole response rather than discard usable output.
		if (!Object.keys(out).length && names.length === 1) {
			out[names[0]] = String(reply || "").trim();
		}

		for (let k of Object.keys(out)) {
			let v = this.unwrapWholeTag(out[k].trim())
				.replace(/^["«»\s]+|["«»\s]+$/g, "");
			if (byName[k].type === "check") {
				v = /^(true|yes|oui|1|x)$/i.test(v) ? "true" : "";
			}
			out[k] = v;
		}
		return out;
	},

	// A missing or rejected credential will not improve through retries;
	// do not make the user wait for the same failure three times.
	_worthRetrying(e) {
		// Missing/rejected keys, absent models and invalid requests return
		// the same result on another attempt.
		let st = (e && typeof e.status === "number") ? e.status : 0;
		if ([400, 401, 403, 404].includes(st)) return false;
		// CLI and Apple errors have no HTTP status, so inspect their message.
		let m = String((e && e.message) || e || "");
		return !/api key|unauthorized|forbidden|not found|introuvable/i.test(m);
	},

	// HTTP providers accept response_format; CLI and Apple do not,
	// so keep name: value parsing for those providers.
	supportsJSON() {
		let p = this.provider();
		return (p === "openai" || p === "ollama") && getPref("structuredOutput", true);
	},

	async generateComment({ text, ctx, color, comment, fields, promptOverride, json, raw, safeRetry }) {
		let prompt = this.buildPrompt({ text, ctx, color, comment, fields, promptOverride });
		return this.complete(prompt, { json: !!json, raw: !!raw, safeRetry: !!safeRetry });
	},

	// Shared provider call with retry policy. Options:
	// provider overrides the configured provider.
	// json requests structured output from HTTP providers only.
	// raw returns response text without Markdown conversion; the
	//             discussion fait son propre rendu
	// timeout is milliseconds, including longer Chat contexts.
	// model can override the annotation model for Chat.
	// cancel is a makeCancelToken token used by Chat's Stop action.
	// Besides system/user, prompts can include document context and
	// sources) and a `history` ([{ role, content }]), used by Chat,
	// annotation calls do not include conversation history.
	async complete(prompt, opts = {}) {
		let p = this.provider(opts.provider);
		let call = () => {
			if (p === "cli") return this.callCLI(prompt, opts);
			if (p === "apple") return this.callApple(prompt, opts);
			return this.callOpenAI(prompt, Object.assign({}, opts, { provider: p }));
		};

		// Recoverable network or model-output failures should not lose an
		// annotation; retry only under the shared safe retry policy.
		let tries = parseInt(getPref("retries", 1), 10);
		if (opts.safeRetry) tries = 0; // Persistent jobs own retries; never repeat an ambiguous paid call here.
		if (isNaN(tries) || tries < 0) tries = 1;
		let last;
		let stopped = () => !!(opts.cancel && opts.cancel.cancelled);
		for (let i = 0; i <= tries; i++) {
			try { return await call(); }
			catch (e) {
				last = e;
				// Cancellation means no new attempt and no provider-failure message:
				// an intentionally terminated process is not a provider outage.
				if (stopped()) {
					let err = new Error("Stopped");
					err.cancelled = true;
					throw err;
				}
				if (i === tries || !this._worthRetrying(e)) break;
				log("Generation failed; retrying (" + (i + 1) + "/" + tries + ") : " + e);
			}
		}
		throw last;
	},

	// Cancellation runs registered callbacks to terminate a process or
	// abort HTTP. Callbacks registered after cancellation run
	// immediately.
	makeCancelToken() {
		return {
			cancelled: false,
			hooks: [],
			onCancel(fn) {
				if (this.cancelled) { try { fn(); } catch (e) {} return; }
				this.hooks.push(fn);
			},
			cancel() {
				if (this.cancelled) return;
				this.cancelled = true;
				for (let fn of this.hooks) { try { fn(); } catch (e) {} }
				this.hooks = [];
			}
		};
	},

	// For CLI and Apple, which lack message roles, place context and
	// conversation history before the question in standard input.
	// For annotations, user remains unchanged.
	flattenPrompt({ user, context, history }) {
		let turns = Array.isArray(history) ? history : [];
		if (!context && !turns.length) return user;
		let parts = [];
		if (context) parts.push(context);
		if (turns.length) {
			parts.push("Conversation so far:\n\n" + turns.map(m =>
				(m.role === "assistant" ? "Assistant: " : "User: ") + m.content).join("\n\n"));
			parts.push("User's new message:\n" + user);
		}
		else parts.push(user);
		return parts.join("\n\n---\n\n");
	},

	// Render the output template. Remove a line when every variable is
	// empty so unresolved references do not leave empty formatting-only
	// lines in generated output.
	renderTemplate(tpl, vars) {
		let out = [];
		for (let line of String(tpl).split("\n")) {
			let names = [];
			line.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, n) => { names.push(n); return m; });
			if (names.length) {
				let allEmpty = names.every(
					n => !(vars[n] != null && String(vars[n]).trim()));
				if (allEmpty) continue;
			}
			out.push(this.substitute(line, vars));
		}
		return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
	},

	// Remove citations identifying the current document by its first
	// author and year. When no secondary source can be resolved, a model
	// may otherwise cite the book being read. Only change values made
	// entirely of citations; leave mixed authored text untouched.
	// Do not rewrite a field containing other meaningful text.
	stripSelfCitations(value, ctx) {
		let s = String(value || "");
		let year = ctx && String(ctx.year || "");
		let first = ctx && String(ctx.authors || "").split(",")[0];
		if (!year || !first || !first.trim()) return s;
		let norm = x => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
			.toLowerCase().trim();
		let m = s.trim().match(/^\(([^()]+)\)\.?$/);
		if (!m) return s;
		let parts = m[1].split(/\s*;\s*/).filter(Boolean);
		let kept = parts.filter(p => {
			let y = p.match(/(^|[^\d])(\d{4})[a-z]?(?!\d)/);
			if (!y || y[2] !== year) return true;
			let who = norm(p.split(",")[0]).split(/\s+/)[0];
			return who !== norm(first).split(/\s+/)[0];
		});
		if (kept.length === parts.length) return s;
		log("Removed citation of current document: " + s.trim());
		return kept.length ? "(" + kept.join(" ; ") + ")" : "";
	},

	// Build the historical structured-output result from the response or
	// from a template mixing {{ai}} with deterministic values.
	// Return null when the color has nothing to produce.
	// Optional out receives final field values and resolved references;
	// the reader card uses them through card-fields.js.
	normalizeAIFieldValue(field, value) {
		const raw = String(value ?? "");
		const names = [...new Set([field?.name, field?.label].filter(Boolean))]
			.map(name => String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
		if (!names) return raw;
		// Strip one exact leading label, never a similar scientific heading or
		// an introductory sentence. Retain the surrounding paragraph and body.
		const label = "(?:" + names + ")";
		const patterns = [
			label + "\\s*:",
			"(?:\\*\\*|__)" + label + "\\s*:(?:\\*\\*|__)",
			"(?:\\*\\*|__)" + label + "(?:\\*\\*|__)\\s*:",
			"<(?:b|strong)>" + label + "\\s*:</(?:b|strong)>",
			"<(?:b|strong)>" + label + "</(?:b|strong)>\\s*:",
			"#{1,6}[ \\t]+" + label + "[ \\t]*:?[ \\t]*(?:\\r?\\n|$)"
		];
		const prefix = new RegExp("^(\\s*<p>\\s*)?\\s*(?:" + patterns.join("|") + ")[ \\t]*(?:\\r?\\n)?", "i");
		return raw.replace(prefix, (_, paragraph) => paragraph || "");
	},

	aiFieldHTML(field, value) {
		// Escape first. Only restore an exact, attribute-free formatting allowlist.
		let text = this.normalizeAIFieldValue(field, value);
		text = text.replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, entity) =>
			({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " " })[entity]);
		text = text.replace(/<\/(?:p|div)>\s*<(?:p|div)>/gi, "\n\n")
			.replace(/<(?:p|div)>|<\/(?:p|div)>/gi, "")
			.replace(/<h[1-6]>([\s\S]*?)<\/h[1-6]>/gi, "<strong>$1</strong>\n");
		text = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
		text = text.replace(/&lt;(\/?(?:b|strong|i|em|u|sub|sup|code))&gt;/gi, "<$1>")
			.replace(/&lt;br\s*\/?&gt;/gi, "<br/>");
		// Preserve meaningful headings, paragraphs and inline emphasis. Do not
		// alter underscores within names, equations or code spans.
		const code = [];
		text = text.replace(/<code>[\s\S]*?<\/code>|`[^`\n]+`/g, match => {
			code.push(match.startsWith("`") ? "<code>" + match.slice(1, -1) + "</code>" : match);
			return "\u0000" + (code.length - 1) + "\u0000";
		});
		text = text.replace(/^#{1,6}\s+(.+)$/gm, "<strong>$1</strong>")
			.replace(/\*\*(?=\S)([^*\n]*?\S)\*\*/g, "<strong>$1</strong>")
			.replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, "$1<em>$2</em>")
			.replace(/\u0000(\d+)\u0000/g, (_, index) => code[Number(index)])
			.replace(/\r?\n/g, "<br/>");
		return text;
	},

	renderAIField(element, field, value, item) {
		if (Array.isArray(value)) value = this.fieldDisplayValue(field, value);
		if (!String(value || "").trim()) {
			element.textContent = AnnotaCardFields.fieldState(item, field).running ? "Generating..." : "Not generated yet";
			return;
		}
		const html = this.aiFieldHTML(field, value);
		element.replaceChildren();
		const stack = [element], doc = element.ownerDocument;
		for (const part of html.split(/(<\/?(?:b|strong|i|em|u|sub|sup|code)>|<br\s*\/?>)/gi)) {
			if (!part) continue;
			const tag = part.match(/^<(\/?)(b|strong|i|em|u|sub|sup|code)>$/i);
			if (/^<br\s*\/?>$/i.test(part)) stack[stack.length - 1].appendChild(doc.createElement("br"));
			else if (tag) {
				if (tag[1]) { if (stack.length > 1) stack.pop(); }
				else {
					const child = doc.createElement(tag[2].toLowerCase());
					stack[stack.length - 1].appendChild(child); stack.push(child);
				}
			}
			else stack[stack.length - 1].appendChild(doc.createTextNode(AnnotaCardFields.plain(part)));
		}
	},

	async generateStructuredFields(item, { fieldId, fieldIds, partial = false, regenerate = false, control } = {}) {
        const card = AnnotaCardFields;
        const infrastructure = typeof AnnotaInfrastructure !== "undefined" ? AnnotaInfrastructure : null;
        if (infrastructure?.stopping) throw Error("Extension is shutting down");
        if (card?._maintenance) throw new Error("Finish importing before generating AI fields.");
		if (item.library?.editable === false) throw new Error("Annotation is read-only.");
		const identity = this.keyForItem(item), key = item.libraryID + "/" + item.key + "/" + identity;
		if (!this._structuredGeneration) this._structuredGeneration = new Set();
		if (!this._fieldRequests) this._fieldRequests = new Set();
		if (!fieldId && this._structuredGeneration.has(key)) throw new Error("AI generation is already running for this annotation.");
		if (!fieldId) this._structuredGeneration.add(key);
		const stateItem = { libraryID: item.libraryID, key: item.key, annotationColor: item.annotationColor, annotationType: item.annotationType };
		let targets = [], acquired = [], previous, generated = {}, metadata = {};
		card.setGenerationState(stateItem, { running: true });
		try {
			await card.load();
			previous = card.get(item) || { values: {}, references: "" };
			const values = Object.assign({}, previous.values);
			targets = this.annotationFields(identity).filter(f => f.type === "ai" && (!fieldId || f.id === fieldId)
                && (!fieldIds || fieldIds.includes(f.id)) && (regenerate || !String(values[f.name] || "").trim()));
			for (const field of targets) {
				const requestKey = card.fieldStateKey(stateItem, field);
				if (this._fieldRequests.has(requestKey)) throw new Error("AI generation is already running for this field.");
				this._fieldRequests.add(requestKey); acquired.push(requestKey);
				card.setFieldState(stateItem, field, { running: true });
			}
			const notReady = this.providerReadyError(); if (targets.length && notReady) throw new Error(notReady);
			const text = item.annotationType === "image" ? await this.areaText(item) : String(item.annotationText || "").trim();
			const sourceFingerprint = infrastructure?.lifecycle.source(item, text);
			const ctx = this.getContext(item);
			ctx.references = previous.references || (targets.length ? await this.getReferences(item, text) : "");
			const errors = [], failures = [];
			for (const field of targets) {
				try {
                    control?.check();
					if (infrastructure) await infrastructure.lifecycle.transition(item, field, "queued");
					if (this._deletedAnnotationKeys?.has(item.libraryID + ":" + item.key)) throw new Error("Annotation is unavailable.");
					if (!field.prompt.trim()) throw new Error("No AI instruction configured for " + field.label);
					const promptValues = Object.assign({}, values);
					for (const f of this.annotationFields(identity).filter(f => f.type === "multiselect")) {
						promptValues[f.name] = this.categoryLabels(f, values[f.name]).join(", ");
					}
                    if (infrastructure) await infrastructure.lifecycle.transition(item, field, "generating");
					const reply = await this.generateComment({ text, ctx, color: identity, comment: "", fields: promptValues, raw: true, safeRetry: !!infrastructure,
						promptOverride: field.prompt + "\n\nReturn only the requested field content. Do not repeat the field name or label ("
							+ field.name + ", " + field.label + "), introductory phrases, or an unnecessary title. Preserve useful paragraphs, meaningful scientific headings, notation and formatting." });
					const value = this.normalizeAIFieldValue(field, reply);
                    control?.check();
                    if (infrastructure?.stopping) { const stopped = Error("Generation interrupted during shutdown"); stopped.stopped = true; throw stopped; }
					if (!card.plain(value).trim()) throw new Error("AI returned no value for " + field.label);
					const fresh = await Zotero.Items.getAsync(item.id);
					if (!fresh?.isAnnotation?.() || fresh.deleted || this._deletedAnnotationKeys?.has(item.libraryID + ":" + item.key)
						|| (field.scope !== "global" && this.keyForItem(fresh) !== identity) || fresh.library?.editable === false) {
						throw new Error("Annotation changed or became unavailable during generation. Please retry.");
					}
                    const currentField = this.annotationFields(this.keyForItem(fresh)).find(f => f.id === field.id);
                    if (!currentField || currentField.type !== "ai" || currentField.prompt !== field.prompt) throw Error("AI field configuration changed during generation; result was not saved.");
					generated[field.name] = values[field.name] = value;
					metadata[field.id] = { fieldId: field.id, scope: field.scope, prompt: field.prompt,
						promptFingerprint: this.fieldFingerprint(field.prompt), generatedAt: new Date().toISOString(),
                        state: "completed", sourceFingerprint: sourceFingerprint || this.fieldFingerprint(text),
                        annotation: infrastructure ? infrastructure.stableAnnotation(item) : undefined,
                        provider: String(getPref("provider", "")), model: String(getPref("model", "")) };
					if (partial) {
						await card.saveValues(fresh, { [field.name]: value }, ctx.references, previous.values, { [field.id]: metadata[field.id] });
                        if (infrastructure && card.get(fresh)?.values[field.name] !== value) await infrastructure.lifecycle.transition(fresh, field, "completed", { discardedConcurrentResult: true });
                        await control?.completeField?.(field.id);
						card.setFieldState(stateItem, field, { saved: true });
					}
				}
				catch (error) {
                    if (infrastructure && !infrastructure.stopping && !item.deleted && !this._deletedAnnotationKeys?.has(item.libraryID + ":" + item.key)) {
                        await infrastructure.lifecycle.transition(item, field, error.stopped ? "cancelled" : "failed", { error: String(error.message || error), failedAt: new Date().toISOString() });
                    }
					card.setFieldState(stateItem, field, { error: error.message || String(error) });
					errors.push(field.label + ": " + (error.message || error));
                    failures.push(error);
					if (!partial || error.stopped) throw error;
				}
			}
			const fresh = await Zotero.Items.getAsync(item.id);
			if (!partial && Object.keys(generated).length) await card.saveValues(fresh, generated, ctx.references, previous.values, metadata);
			try { if (fresh?.isAnnotation?.() && !fresh.deleted) await this._syncPaperResearchNote(fresh); }
			catch (error) { throw new Error("Fields saved, but the research note could not be refreshed: " + (error.message || error)); }
			if (errors.length) {
                const error = new Error(errors.join("; "));
                if (failures.every(failure => failure.status === 429 && failure.requestRejected)) Object.assign(error, { status: 429, requestRejected: true, retryable: true, retryAfter: Math.max(...failures.map(failure => Number(failure.retryAfter) || 1)) });
                throw error;
            }
			for (const field of targets) card.setFieldState(stateItem, field, { saved: true });
			card.setGenerationState(stateItem, { saved: true });
			return card.get(item) || previous;
		}
		catch (error) {
			for (const field of targets) {
				if (!acquired.includes(card.fieldStateKey(stateItem, field))) continue;
				if (!partial || card.fieldState(stateItem, field).running) {
					if (infrastructure && !infrastructure.stopping && card.fieldState(stateItem, field).running) await infrastructure.lifecycle.transition(item,field,error.stopped ? "cancelled" : "failed",{error:String(error.message || error),failedAt:new Date().toISOString()});
					card.setFieldState(stateItem, field, { error: error.message || String(error) });
				}
			}
			if (acquired.length || !targets.length) card.setGenerationState(stateItem, { error: this.t("gen.failed", { msg: error.message || error }) });
			throw error;
		}
		finally { for (const request of acquired) this._fieldRequests.delete(request); if (!fieldId) this._structuredGeneration.delete(key); }
	},

	async buildComment({ text, ctx, color, comment, fields, getRefs, out }) {
		let entry = this.getColorEntry(color);
		if (!entry) return null;

		ctx = ctx || {};
		let schema = this.parseFieldSchema(entry.fields);
		let values = Object.assign({}, fields || {});

		// Reference resolution can open the PDF and traverse internal links,
		// taking seconds for a large file. Resolve only when a configured
		// field or output actually uses references; a fully manual output
		// does not need this work.
		let t0 = Date.now(), tRefs = 0, tAI = 0;
		if (getRefs && !ctx.references) {
			let tplWantsRefs = /\{\{\s*references\s*\}\}/.test(this.effectiveTemplate(entry));
			let promptWantsRefs = this.willCallProvider(entry, values);
			if (tplWantsRefs || promptWantsRefs) {
				let t = Date.now();
				ctx.references = await getRefs();
				tRefs = Date.now() - t;
			}
		}

		// Each AI field has its own instructions and generates only itself.
		// Manual values are already available as context for those
		// instructions.
		for (let f of schema) {
			if (f.type !== "ai" || !f.prompt.trim()) continue;
			if (String(values[f.name] || "").trim()) continue;
			try {
				let t = Date.now();
				values[f.name] = await this.generateComment({
					text, ctx, color, comment, fields: values, promptOverride: f.prompt
				});
				tAI += Date.now() - t;
			}
			catch (e) {
				log("AI field \"" + f.name + " » : " + e);
				values[f.name] = "";
			}
		}

		// Historical color prompts target missing fields only.
		// The response is constrained to declared fields instead of free-form
		// output. Manually typed values are never rewritten; a completed
		// form does not trigger another field-filling request.
		// completed fields do not require a request.
		if (this.entryFillsFields(entry)) {
			let toFill = this.fieldsToFill(schema, values);
			if (toFill.length) {
				try {
					let t = Date.now();
					let json = this.supportsJSON();
					let reply = await this.generateComment({
						text, ctx, color, comment, fields: values, json,
						promptOverride: entry.prompt + "\n" + (json
							? this.buildFieldInstructionJSON(toFill, schema, values)
							: this.buildFieldInstruction(toFill, schema, values))
					});
					tAI += Date.now() - t;
					// Small local models may return text despite a JSON request;
					// fallback to the historical parser rather than discard an
					// otherwise usable response.
					let parsed = json ? this.parseJSONReply(reply, toFill) : null;
					if (!parsed) {
						if (json) log("Non-JSON response; parsing name: value output");
						parsed = this.parseFieldReply(reply, toFill);
					}
					// Without a resolved source, models sometimes cite the document
					// being read instead of an actual secondary reference.
					for (let f of toFill) {
						if (typeof parsed[f.name] === "string") {
							parsed[f.name] = this.stripSelfCitations(parsed[f.name], ctx);
						}
					}
					Object.assign(values, parsed);
				}
				catch (e) {
					log("AI field completion: " + e);
					throw e;
				}
			}
		}

		// Whole-response legacy output is requested only when a layout uses
		// {{ai}}, or when neither fields nor a template exist.
		// A configured field-only color therefore needs no whole-response
		// request merely because an old color prompt remains.
		let ai = "";
		if (this.entryNeedsAI(entry)) {
			if (!entry.prompt.trim()) return null;   // There is nothing left to request from the model.
			let t = Date.now();
			ai = await this.generateComment({ text, ctx, color, comment, fields: values });
			tAI += Date.now() - t;
		}

		// Expose handleItem progress: refs means PDF opening and citation
		// resolution; ia means waiting for the model.
		this._timings = { refs: tRefs, ai: tAI, build: Date.now() - t0 };

		if (out) {
			out.values = values;
			out.refs = ctx.references || "";
		}

		let tpl = this.effectiveTemplate(entry);
		if (!tpl) return ai;

		let vars = this.buildVars({ text, ctx, comment, fields: values });
		vars.ai = ai;
		return this.renderTemplate(tpl, vars);
	},

	// Apple Intelligence on-device macOS model.
	//
	// macOS 26+ exposes Apple Intelligence through its framework,
	// FoundationModels is accessible through Swift; there is no supplied
	// without an HTTP endpoint or supplied CLI. Write a small Swift helper,
	// compile it once in Zotero's data directory, then reuse the binary.
	// Compilation takes roughly one second; calls remain entirely local.
	APPLE_SWIFT_SOURCE: [
		"import Foundation",
		"import FoundationModels",
		"",
		"let instructions = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : \"\"",
		"let prompt = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? \"\"",
		"",
		"guard case .available = SystemLanguageModel.default.availability else {",
		"    FileHandle.standardError.write(\"Apple Intelligence unavailable on this Mac\\n\".data(using: .utf8)!)",
		"    exit(2)",
		"}",
		"",
		"let sem = DispatchSemaphore(value: 0)",
		"var out = \"\", err = \"\"",
		"Task {",
		"    do {",
		"        let session = instructions.isEmpty",
		"            ? LanguageModelSession()",
		"            : LanguageModelSession(instructions: instructions)",
		"        let r = try await session.respond(to: prompt)",
		"        out = r.content",
		"    } catch {",
		"        err = \"\\(error)\"",
		"    }",
		"    sem.signal()",
		"}",
		"sem.wait()",
		"if !err.isEmpty {",
		"    FileHandle.standardError.write((err + \"\\n\").data(using: .utf8)!)",
		"    exit(1)",
		"}",
		"print(out)"
	].join("\n"),

	// Directory for helper source and binary.
	_appleDir() {
		try {
			if (Zotero.DataDirectory && Zotero.DataDirectory.dir) return Zotero.DataDirectory.dir;
		}
		catch (e) { /* ignore */ }
		return Zotero.getTempDirectory().path;
	},

	// Compile the helper if needed and return its path.
	async ensureAppleBinary(Subprocess) {
		let custom = String(getPref("applePath", "")).trim();
		if (custom) return custom;

		let dir = this._appleDir();
		let bin = PathUtils.join(dir, "annota-apple-ai");
		if (await IOUtils.exists(bin)) return bin;

		let srcPath = PathUtils.join(dir, "annota-apple-ai.swift");
		await IOUtils.writeUTF8(srcPath, this.APPLE_SWIFT_SOURCE);

		let swiftc = String(getPref("swiftcPath", "/usr/bin/swiftc")).trim() || "/usr/bin/swiftc";
		let proc;
		try {
			proc = await Subprocess.call({
				command: swiftc,
				arguments: ["-O", "-o", bin, srcPath],
				stderr: "pipe"
			});
		}
		catch (e) {
			throw new Error("swiftc unavailable (" + swiftc + ") — installez les "
				+ "Xcode Command Line Tools : xcode-select --install");
		}
		let errText = "", c;
		while ((c = await proc.stderr.readString()) !== "") errText += c;
		let { exitCode } = await proc.wait();
		if (exitCode !== 0 || !(await IOUtils.exists(bin))) {
			throw new Error("Swift compilation failed: "
				+ (errText.trim() || "code " + exitCode).slice(0, 300));
		}
		log("Apple Intelligence helper compiled: " + bin);
		return bin;
	},

	async callApple(prompt, opts = {}) {
		let { system } = prompt;
		let Subprocess;
		try {
			({ Subprocess } = ChromeUtils.importESModule(
				"resource://gre/modules/Subprocess.sys.mjs"));
		}
		catch (e) {
			throw new Error("Subprocess indisponible : " + (e.message || e));
		}

		let bin = await this.ensureAppleBinary(Subprocess);
		let proc = await Subprocess.call({
			command: bin,
			arguments: system ? [system] : [],
			stderr: "pipe"
		});

		let killTimer = setTimeout(() => { try { proc.kill(); } catch (e) {} },
			opts.timeout || 120000);
		if (opts.cancel) opts.cancel.onCancel(() => { try { proc.kill(); } catch (e) {} });
		try {
			await proc.stdin.write(this.flattenPrompt(prompt));
			await proc.stdin.close();

			let out = "", chunk;
			while ((chunk = await proc.stdout.readString()) !== "") out += chunk;
			let errText = "", ce;
			while ((ce = await proc.stderr.readString()) !== "") errText += ce;

			let { exitCode } = await proc.wait();
			if (exitCode !== 0) {
				throw new Error("Apple Intelligence (code " + exitCode + ") : "
					+ (errText.trim() || "No details").slice(0, 300));
			}
			if (!out.trim()) throw new Error("Empty Apple Intelligence response");
			return opts.raw ? out.trim() : this.sanitize(out);
		}
		finally {
			clearTimeout(killTimer);
		}
	},

	// Claude Code CLI paths, models and effort levels.
	//
	// The CLI does not list account models, but its help lists accepted
	// model aliases and effort levels. Read that help instead of
	// hard-coding the lists, so capabilities follow the installed
	// CLI version.

	_cliResolved: new Map(),
	_cliNoEffort: false,

	// Search common executable locations when Zotero cannot see
	// the terminal's PATH.
	cliCandidates() {
		let home = "";
		try { home = Services.dirsvc.get("Home", Ci.nsIFile).path; } catch (e) {}
		let j = (...p) => home ? PathUtils.join(home, ...p) : "";
		return [
			j(".local", "bin", "claude"), j(".claude", "local", "claude"),
			"/opt/homebrew/bin/claude", "/usr/local/bin/claude", "/usr/bin/claude",
			j(".npm-global", "bin", "claude"), j(".volta", "bin", "claude"),
			j(".bun", "bin", "claude"), j("bin", "claude")
		].filter(Boolean);
	},

	// Absolute executable path, or empty when not found.
	async resolveCLIPath(cmd) {
		cmd = String(cmd || "").trim() || "claude";
		if (this._cliResolved.has(cmd)) return this._cliResolved.get(cmd);
		let found = "";
		try {
			if (PathUtils.isAbsolute(cmd) && await IOUtils.exists(cmd)) found = cmd;
		}
		catch (e) {}
		if (!found) {
			try {
				let { Subprocess } = ChromeUtils.importESModule(
					"resource://gre/modules/Subprocess.sys.mjs");
				found = await Subprocess.pathSearch(cmd);
			}
			catch (e) { /* Not present in Zotero's PATH. */ }
		}
		if (!found) {
			for (let c of this.cliCandidates()) {
				try { if (await IOUtils.exists(c)) { found = c; break; } } catch (e) {}
			}
		}
		if (found) this._cliResolved.set(cmd, found);
		return found;
	},

	// Read an option's help line and its following block up to
	// l'option suivante.
	parseCLIHelp(text) {
		let lines = String(text || "").split("\n");
		let block = (flag) => {
			let re = new RegExp("^\\s*(?:-\\w,\\s*)?" + flag + "(?![\\w-])");
			let i = lines.findIndex(l => re.test(l));
			if (i < 0) return "";
			let out = [lines[i]];
			for (let k = i + 1; k < lines.length && !/^\s*-/.test(lines[k]) && lines[k].trim(); k++) {
				out.push(lines[k]);
			}
			return out.join(" ");
		};
		let models = [];
		block("--model").replace(/'([\w.\-\[\]]+)'/g, (m, n) => {
			if (!models.includes(n)) models.push(n);
			return m;
		});
		let eff = block("--effort");
		let efforts = [];
		let paren = eff.match(/\(([^)]*)\)/);
		if (paren) {
			efforts = paren[1].split(/[,|/]/).map(x => x.trim().toLowerCase())
				.filter(x => /^[a-z]+$/.test(x));
		}
		return { models, efforts, effort: !!eff };
	},

	// Inspect the installed CLI and cache its advertised capabilities
	// in cliCaps for settings and Chat.
	async probeCLI(pathOverride) {
		let { Subprocess } = ChromeUtils.importESModule(
			"resource://gre/modules/Subprocess.sys.mjs");
		let wanted = String(pathOverride || getPref("cliPath", "claude")).trim() || "claude";
		this._cliResolved.delete(wanted);
		let cmd = await this.resolveCLIPath(wanted);
		if (!cmd) {
			throw new Error(this.t("err.cli.notfound"));
		}
		let workdir;
		try { workdir = Zotero.getTempDirectory().path; } catch (e) { workdir = undefined; }
		let run = async (args) => {
			let proc = await Subprocess.call({ command: cmd, arguments: args, workdir,
				stderr: "stdout" });
			let timer = setTimeout(() => { try { proc.kill(); } catch (e) {} }, 15000);
			try {
				let out = "", c;
				while ((c = await proc.stdout.readString()) !== "") out += c;
				await proc.wait();
				return out;
			}
			finally { clearTimeout(timer); }
		};
		let version = (await run(["--version"])).trim();
		let caps = this.parseCLIHelp(await run(["--help"]));
		caps.version = (version.match(/\d+\.\d+\.\d+/) || [version.slice(0, 40)])[0];
		caps.path = cmd;
		caps.ts = Date.now();
		Zotero.Prefs.set(PREF_BRANCH + "cliCaps", JSON.stringify(caps));
		this._cliNoEffort = !caps.effort;
		return caps;
	},

	cliCaps() {
		try { return JSON.parse(String(getPref("cliCaps", "") || "")) || null; }
		catch (e) { return null; }
	},

	// Local claude -p uses the CLI's signed-in subscription,
	// not a token-billed API. Authentication belongs to the installed
	// CLI, so no separate API key is used. Cold starts can be slow.
	async callCLI(prompt, opts = {}) {
		let { system } = prompt;
		let Subprocess;
		try {
			({ Subprocess } = ChromeUtils.importESModule(
				"resource://gre/modules/Subprocess.sys.mjs"));
		}
		catch (e) {
			throw new Error("Subprocess indisponible : " + (e.message || e));
		}

		let wanted = String(getPref("cliPath", "claude")).trim() || "claude";
		// For a bare command name, search PATH and common locations because
		// Zotero may not inherit the terminal environment.
		let cmd = (await this.resolveCLIPath(wanted)) || wanted;
		let model = String(opts.model || getPref("cliModel", "")).trim();
		let effort = String(opts.effort !== undefined ? opts.effort
			: getPref("cliEffort", "")).trim();
		if (this._cliNoEffort) effort = "";
		let args = ["-p", "--output-format", "text"];
		if (model) args.push("--model", model);
		if (effort) args.push("--effort", effort);
		if (system) args.push("--append-system-prompt", system);

		// Use a neutral working directory to avoid loading a project CLAUDE.md.
		let workdir;
		try { workdir = Zotero.getTempDirectory().path; } catch (e) { workdir = undefined; }

		let proc;
		try {
			proc = await Subprocess.call({
				command: cmd,
				arguments: args,
				workdir,
				stderr: "pipe"
			});
		}
		catch (e) {
			throw new Error("Could not launch CLI \"" + cmd + " » : " + (e.message || e));
		}

		// Terminate the process on timeout, for example if authentication blocks.
		let killTimer = setTimeout(() => { try { proc.kill(); } catch (e) {} },
			opts.timeout || 120000);
		if (opts.cancel) opts.cancel.onCancel(() => { try { proc.kill(); } catch (e) {} });
		try {
			// Send context on standard input, not as an argument: a whole document
			// can exceed the operating system's argument-length limit.
			await proc.stdin.write(this.flattenPrompt(prompt));
			await proc.stdin.close();

			let out = "", chunk;
			while ((chunk = await proc.stdout.readString()) !== "") out += chunk;
			let errText = "", ce;
			while ((ce = await proc.stderr.readString()) !== "") errText += ce;

			let { exitCode } = await proc.wait();
			// Older CLIs may lack --effort; omit it rather than fail.
			if (exitCode !== 0 && effort && /unknown option.*effort|effort.*unknown/i.test(errText)) {
				log("CLI rejected --effort; retrying without an effort level");
				this._cliNoEffort = true;
				clearTimeout(killTimer);
				return this.callCLI(prompt, Object.assign({}, opts, { effort: "" }));
			}
			if (exitCode !== 0) {
				throw new Error("CLI code " + exitCode + " : "
					+ (errText.trim() || "(no error output)").slice(0, 300));
			}
			if (!out.trim()) throw new Error("Empty CLI response");
			return opts.raw ? out.trim() : this.sanitize(out);
		}
		finally {
			clearTimeout(killTimer);
		}
	},

	// OpenAI-compatible provider, defaulting to Mistral.
	async callOpenAI({ system, user, context, history }, opts = {}) {
		let cfg = this.chatConfig(opts.provider);
		if (cfg.requiresKey && !cfg.apiKey) throw new Error("API key missing");
		if (!cfg.endpoint) throw new Error("Endpoint not set");
		let temp = parseFloat(getPref("temperature", 0.2));
		if (isNaN(temp)) temp = 0.2;
		temp = Math.max(0, Math.min(2, temp));

		// Chat source/document context accompanies system instructions so
		// it remains at the beginning regardless of conversation length.
		let messages = [];
		let sys = [system, context].filter(x => x && String(x).trim()).join("\n\n");
		if (sys) messages.push({ role: "system", content: sys });
		for (let m of (Array.isArray(history) ? history : [])) {
			messages.push({ role: m.role === "assistant" ? "assistant" : "user",
				content: String(m.content || "") });
		}
		messages.push({ role: "user", content: user });

		let headers = { "Content-Type": "application/json" };
		// Ollama ignores authorization; send that header only when a key exists.
		if (cfg.apiKey) headers["Authorization"] = "Bearer " + cfg.apiKey;

		let payload = { model: opts.model || cfg.model, temperature: temp, messages,
			stream: false };
		// Structured output requests a JSON object instead of free text
		// requiring regular-expression parsing. Mistral and Ollama support it.
		if (opts.json) payload.response_format = { type: "json_object" };

		let resp = await this.httpJSON(cfg.endpoint, headers, payload,
			opts.provider, opts.timeout, opts.cancel, opts.safeRetry);

		let data = resp.response;
		let content = data && data.choices && data.choices[0]
			&& data.choices[0].message && data.choices[0].message.content;
		if (!content) throw new Error("Empty API response");
		return opts.raw ? String(content).trim() : this.sanitize(content);
	},

	// Shared JSON POST with readable error reporting.
	async httpJSON(url, headers, payload, override, timeoutMs, cancel, safeRetry = false) {
		let prov = this.provider(override);
		// Allow extra startup time for a local model to load into memory.
		let timeout = timeoutMs || (prov === "ollama" ? 180000 : 45000);
		try {
			return await Zotero.HTTP.request("POST", url, {
				headers,
				body: JSON.stringify(payload),
				responseType: "json",
				timeout,
                ...(safeRetry ? { errorDelayMax:0, noRetryOnThrottle:true } : {}),
				// Zotero supplies an abort callback for Chat's Stop action.
				cancellerReceiver: cancel ? (fn => cancel.onCancel(fn)) : undefined
			});
		}
		catch (e) {
			let status = e && e.xmlhttp ? e.xmlhttp.status : "?";
			let raw = "";
			try { raw = e.xmlhttp ? e.xmlhttp.responseText : ""; } catch (e2) {}

			// Extract the API error message rather than displaying raw JSON;
			// otherwise useful missing-model messages are buried in the response.
			let msg = "";
			try {
				let d = JSON.parse(raw);
				msg = (d && d.error && (d.error.message || d.error))
					|| (d && d.message) || "";
				if (typeof msg !== "string") msg = JSON.stringify(msg);
			}
			catch (e2) { /* The response is not JSON. */ }
			if (!msg) msg = raw.slice(0, 200);

			// Targeted guidance for the two most common Ollama failures.
			if (prov === "ollama") {
				if (/not found/i.test(msg)) {
					msg += " — pick an installed model in Preferences → ResearchAnnotator "
						+ "(tags matter: « llama3.1:8b », not « llama3.1 »).";
				}
				else if (!status || status === 0) {
					msg = "Ollama unreachable — is it running? (" + msg + ")";
				}
			}
			// Use the status attached to the error for retry decisions instead
			// of depending on message wording: status 401 is structured
			// information rather than a localized string.
			let err = new Error("API (HTTP " + status + ") " + msg);
			err.status = (typeof status === "number") ? status : 0;
            if (err.status === 429) {
                err.requestRejected = true; err.retryable = true;
                try { err.retryAfter = Number(e.xmlhttp.getResponseHeader("Retry-After")) || 1; } catch (_) { err.retryAfter = 1; }
            }
			throw err;
		}
	},

	// ---- Traitement a posteriori (menu contextuel) ----

	// Collect eligible annotations from regular items, attachments or
	// directly selected annotations.
	annotationChildren(item,ids=false){
        if(!item?.isAttachment?.()||!(typeof item.isFileAttachment==='function'?item.isFileAttachment():(item.isPDFAttachment?.()||/^application\/(?:pdf|epub(?:\+zip)?)$/.test(item.attachmentContentType||''))))return [];
        return item.getAnnotations(false,ids)||[];
    },
    async collectAnnotations(items) {
		let out = [];
		let seen = new Set();

		let push = (ann) => {
			if (ann && !seen.has(ann.id)) { seen.add(ann.id); out.push(ann); }
		};

		for (let item of items) {
			try {
				if (item.isAnnotation && item.isAnnotation()) { push(item); continue; }

				let attachments = [];
				if (item.isAttachment && item.isAttachment()) {
					attachments = [item];
				}
				else if (item.isRegularItem && item.isRegularItem()) {
					let ids = item.getAttachments();
					attachments = await Zotero.Items.getAsync(ids);
				}

				for (let att of attachments) {
					if (!att || !att.isFileAttachment || !att.isFileAttachment()) continue;
					for (let ann of att.getAnnotations()) push(ann);
				}
			}
			catch (e) {
				log("collectAnnotations: " + e);
			}
		}
		return out;
	},

	// Check targeted type, nonempty text and editable library.
	isEligible(ann, overwrite, failedOnly) {
		if (!ann || !ann.isAnnotation || !ann.isAnnotation()) return false;
		if (!this.targetTypes().includes(ann.annotationType)) return false;
		if (ann.library && ann.library.editable === false) return false;
		if (ann.annotationType !== "image" && !(ann.annotationText || "").trim()) return false;
		// Retry failures considers only tagged annotations and their
		// explicit refill targets only the selected structured values; native Comment is preserved.
		if (failedOnly) return this.hasFailedTag(ann);
		if ((ann.annotationComment || "").trim() && !overwrite) return false;
		return true;
	},

	// Generate for the current window selection.
	// Explicit actions are deliberately independent of the enabled preference.
	async runBatch(window, opts = {}) {
		let overwrite = !!opts.overwrite;

		let notReady = this.providerReadyError();
		if (notReady) {
			toast("ResearchAnnotator", notReady, "error");
			return;
		}

		let selected;
		try {
			selected = window.ZoteroPane.getSelectedItems();
		}
		catch (e) {
			log("runBatch: selection unavailable: " + e);
			return;
		}
		if (!selected || !selected.length) return;

		let all = await this.collectAnnotations(selected);
		return this.processAnnotations(all, opts);
	},

	// Shared processing for library selections and a targeted reader
	// annotation. all already contains candidate annotations.
	async processAnnotations(all, opts = {}) {
		let overwrite = !!opts.overwrite || !!opts.failedOnly;
		let eligible = all.filter(a => this.isEligible(a, overwrite, opts.failedOnly));

		// Count unconfigured colors separately so skipping them can be
		// explained instead of appearing to produce no result.
		let targets = [];
		let noPrompt = 0;
		for (let a of eligible) {
			// Use getColorEntry, not only getPromptForColor: fields or a template
			// can produce deterministic output without a color prompt.
			if (this.getColorEntry(this.keyForItem(a))) targets.push(a);
			else noPrompt++;
		}

		if (!targets.length) {
			let why;
			if (noPrompt) why = this.t("batch.skipped", { n: noPrompt });
			else if (opts.failedOnly) why = this.t("batch.noretry");
			else if (all.length) why = this.t("batch.nothing");
			else why = this.t("batch.none");
			toast("ResearchAnnotator", why);
			return;
		}

		let pw = new Zotero.ProgressWindow({ closeOnClick: false });
		pw.changeHeadline("ResearchAnnotator");
		let bar = new pw.ItemProgress(
			"chrome://zotero/skin/tick.png",
			this.t("batch.progress", { i: 0, n: targets.length })
		);
		pw.show();

		let ok = 0, failed = 0;
		for (let i = 0; i < targets.length; i++) {
			let ann = targets[i];
			try {
                if (typeof AnnotaInfrastructure !== "undefined") {
                    await AnnotaInfrastructure.generateJob(ann, { regenerate: !!opts.overwrite });
                    this.setFailedTag(ann, false); await ann.saveTx(); ok++;
                    bar.setProgress(Math.round(((i + 1) / targets.length) * 100));
                    bar.setText(this.t("batch.progress", { i: i + 1, n: targets.length }));
                    continue;
                }
				let annText = ann.annotationType === "image"
					? await this.areaText(ann) : (ann.annotationText || "").trim();
				let ctx = this.getContext(ann);
				// Explicit context-menu generation considers configured colors
				// regardless of Automatic/Manual policy; existing native Comment remains independent.
				// manual) is passed through {{comment}}.
				let built = {};
				let comment = await this.buildComment({
					text: annText,
					ctx,
					color: this.keyForItem(ann),
					comment: (ann.annotationComment || "").trim(),
					fields: opts.fields,
					getRefs: () => this.getReferences(ann, annText),
					out: built
				});
				if (comment === null || !String(comment).trim()) {
					failed++;
					await this.markFailed(ann.id, "Empty result");
					continue;
				}
				let fresh = await Zotero.Items.getAsync(ann.id);
				if (fresh) {
					this.rememberFields(fresh, built, comment);
					fresh.annotationComment = comment;
					this.setFailedTag(fresh, false);
					await fresh.saveTx();
					ok++;
				}
			}
			catch (e) {
				failed++;
				log("runBatch item " + ann.id + " : " + e);
				await this.markFailed(ann.id, String(e.message || e));
			}
			bar.setProgress(Math.round(((i + 1) / targets.length) * 100));
			bar.setText(this.t("batch.progress", { i: i + 1, n: targets.length }));
		}

		bar.setProgress(100);
		let summary = this.t("batch.done", { n: ok });
		if (failed) {
			let tag = this.failedTag();
			summary += this.t("batch.failed", { n: failed })
				+ (tag ? this.t("batch.tagged", { tag }) : this.t("batch.debug"));
		}
		if (noPrompt) summary += this.t("batch.nocfg", { n: noPrompt });
		bar.setText(summary);
		pw.startCloseTimer(failed ? 8000 : 4000);
		log("runBatch completed: " + ok + " ok, " + failed + " failures, "
			+ noPrompt + " sans prompt");
	},

	// Structured fields in the selection popup.
	//
	// The official renderTextSelectionPopup hook runs before an annotation
	// exists. Enter fields, then create the annotation by selecting its
	// highlight color; the created item receives the saved draft
	// values.
	//
	// Clicking a native swatch creates the annotation; there is no separate
	// color selection and confirmation step. Show fields for the color
	// the pointer is approaching, using native swatch hover events
	// or the extension's fallback palette.

	_selectionListener: null,
	_pendingFields: null,          // { text, values, ts, color }
	_pendingResearch: null,
	_lastColor: null,              // Last color actually processed.

	// Union of all color fields, deduplicated by name.
	// Fallback when no individual color can be identified.
	allFieldsSchema() {
		let seen = new Set(), out = [];
		for (let c of this.COLORS) {
			for (let f of this.fieldsForColor(c.hex)) {
				if (seen.has(f.name)) continue;
				seen.add(f.name);
				out.push(f);
			}
		}
		return out;
	},

	// Editable manual fields only: the model owns AI-generated
	// values in the ordinary editing interface.
	visibleFieldsFor(hex) {
		return this.annotationFields(hex).filter(f => f.type !== "ai");
	},

	// Colors with at least one manual input field.
	colorsWithFields() {
		return this.COLORS.filter(c => this.annotationFields(c.hex).length);
	},

	// Before a swatch is designated, show the last-used color's fields
	// because a reading session usually creates multiple annotations.
	defaultFieldColor() {
		let withFields = this.colorsWithFields();
		if (!withFields.length) return null;
		if (this._lastColor && withFields.some(c => c.hex === this._lastColor)) {
			return this._lastColor;
		}
		return withFields[0].hex;
	},

	// Read semantic color labels independently of AI configuration.
getColorLabels() {
    try {
        let raw = getPref("colorLabels", "");
        if (!raw) return {};

        let labels = typeof raw === "string" ? JSON.parse(raw) : raw;

        if (!labels || typeof labels !== "object" || Array.isArray(labels)) {
            return {};
        }

        return labels;
    }
    catch (e) {
        log("getColorLabels: " + e);
        return {};
    }
},

// Display semantic labels in Zotero's text selection popup.
// Display semantic labels directly beside Zotero's original color buttons.
// Display semantic labels directly beside Zotero's native color buttons.
// Display semantic labels as the actual clickable color buttons.
// Display semantic labels as the actual clickable color buttons.
_renderColorLabels({ doc }) {
    if (!doc) return;

    let popup = doc.querySelector(".selection-popup");
    if (!popup) return;
    if (popup.querySelector(".annota-palette-picker")) return;

    let colorsContainer = popup.querySelector(".colors");
    if (!colorsContainer) return;

    let buttons = Array.from(
        colorsContainer.querySelectorAll(".color-button")
    );

    if (!buttons.length) return;

    let labels = this.getColorLabels();

    let layout = String(
        getPref("colorLabelLayout", "wrap") || "wrap"
    );

    if (!["wrap", "single", "stack", "slanted"].includes(layout)) {
        layout = "wrap";
    }

    // Give the popup enough room for its contents.
    popup.style.width = "max-content";
    popup.style.height = "auto";
    popup.style.minHeight = "0";
    popup.style.maxHeight = "none";
    popup.style.overflow = "visible";
    popup.style.maxWidth =
        layout === "single" ? "none" : "calc(100vw - 24px)";

    colorsContainer.style.display = "flex";
    colorsContainer.style.alignItems = "center";
    colorsContainer.style.boxSizing = "border-box";
    colorsContainer.style.overflow = "visible";
    colorsContainer.style.gap = layout === "slanted" ? "2px" : "8px";

    colorsContainer.style.flexDirection =
        layout === "stack" ? "column" : "row";

    colorsContainer.style.flexWrap =
        layout === "wrap" || layout === "slanted" ? "wrap" : "nowrap";

    colorsContainer.style.width =
        layout === "single" ? "max-content" : "100%";

    // Prevent the popup from clipping rotated labels.
    colorsContainer.style.paddingTop =
        layout === "slanted" ? "22px" : "5px";

    colorsContainer.style.paddingBottom =
        layout === "slanted" ? "25px" : "5px";

    buttons.forEach((btn, index) => {
        let color = (typeof AnnotaPalette !== "undefined" ? AnnotaPalette.nativeColors() : this.COLORS)[index];
        if (!color) return;

        let label = String(
            labels[color.hex] || color.name || "Color"
        ).trim();

        // Remove any previous Annota label.
        let oldLabel = btn.querySelector(".annota-color-button-label");
        if (oldLabel) oldLabel.remove();

        // Remove Zotero's original visible color swatch.
        // The button itself and its native click handlers remain.
        Array.from(btn.children).forEach(child => child.remove());

        btn.style.display = "inline-flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.width = "auto";
        btn.style.height = "auto";
        btn.style.minWidth = "0";
        btn.style.minHeight = "0";
        btn.style.padding = "0";
        btn.style.margin = "0";
        btn.style.border = "none";
        btn.style.background = "transparent";
        btn.style.backgroundImage = "none";
        btn.style.boxShadow = "none";
        btn.style.overflow = "visible";
        btn.style.flex = "none";
        btn.style.cursor = "pointer";

        // Calculate readable text color.
        let hex = color.hex.replace("#", "");
        let r = parseInt(hex.substring(0, 2), 16);
        let g = parseInt(hex.substring(2, 4), 16);
        let b = parseInt(hex.substring(4, 6), 16);

        let brightness = (r * 299 + g * 587 + b * 114) / 1000;
        let textColor = brightness > 150 ? "#222222" : "#ffffff";

        let labelNode = doc.createElement("span");
        labelNode.className = "annota-color-button-label";
        labelNode.textContent = label;

        labelNode.style.cssText =
            "display:inline-block;"
            + "box-sizing:border-box;"
            + "padding:4px 8px;"
            + "border-radius:4px;"
            + "background-color:" + color.hex + ";"
            + "color:" + textColor + ";"
            + "font-size:11px;"
            + "font-weight:600;"
            + "line-height:1.3;"
            + "white-space:nowrap;"
            + "pointer-events:none;"
            + "transition:filter 120ms ease, transform 120ms ease, box-shadow 120ms ease;";

        if (layout === "slanted") {
            labelNode.style.transform = "rotate(-18deg)";
            labelNode.style.transformOrigin = "center center";

            btn.style.marginRight = "-9px";
            btn.style.marginBottom = "2px";
        }

        btn.appendChild(labelNode);

        // Make the label visually respond to hovering and keyboard focus.
        btn.addEventListener("mouseenter", () => {
            labelNode.style.filter = "brightness(1.15)";
            labelNode.style.transform =
                layout === "slanted"
                    ? "rotate(-18deg) scale(1.06)"
                    : "scale(1.06)";
            labelNode.style.boxShadow =
                "0 2px 6px rgba(0,0,0,0.25)";
        });

        btn.addEventListener("mouseleave", () => {
            labelNode.style.filter = "none";
            labelNode.style.transform =
                layout === "slanted"
                    ? "rotate(-18deg)"
                    : "none";
            labelNode.style.boxShadow = "none";
        });

        btn.addEventListener("focus", () => {
            labelNode.style.outline = "2px solid currentColor";
            labelNode.style.outlineOffset = "2px";
        });

        btn.addEventListener("blur", () => {
            labelNode.style.outline = "none";
        });

        // Preserve the original tooltip.
        if (!btn.hasAttribute("data-annota-original-title")) {
            btn.setAttribute(
                "data-annota-original-title",
                btn.getAttribute("title") || color.name
            );
        }

        btn.setAttribute("title", label);
        btn.setAttribute("aria-label", label);
    });

// Recalculate popup height after labels are rendered.
let win = doc.defaultView;

let schedule = win?.requestAnimationFrame
    ? win.requestAnimationFrame.bind(win)
    : (callback) => setTimeout(callback, 0);

schedule(() => {
    let contentHeight = colorsContainer.scrollHeight;

    popup.style.height = "auto";
    popup.style.minHeight = Math.max(contentHeight, 0) + "px";
    popup.style.overflow = "visible";
});
},
// Add optional research annotation fields below the color buttons.
_renderResearchCapture({ doc, params, reader: eventReader }) {
    if (!doc) return;
    const popup = doc.querySelector(".selection-popup");
    if (!popup || popup.querySelector(".annota-research-capture")) return;
    const insertionPoint = popup.querySelector(".tool-toggle") || popup.querySelector(".colors");
    if (!insertionPoint) return;
    this._ensureFormStyles(doc);
    this._ensureAnnotationInterfaceStyles(doc);
    const container = doc.createElement("div"); container.className = this.FORM_CLASS + " annota-research-capture";
    const label = doc.createElement("label"), tags = doc.createElement("input");
    label.textContent = "Zotero Tags"; tags.type = "text"; tags.className = "annota-research-tags";
    tags.placeholder = "Add tags, separated by commas...";
    label.appendChild(tags); container.appendChild(label);
    const reader = eventReader || (Zotero.Reader?._readers || []).find(r => r?._iframeWindow?.document === doc);
    const native = doc.createElement("textarea"), commentLabel = doc.createElement("label");
    native.className = "annota-native-comment-input"; native.rows = 2;
    native.setAttribute("aria-label", "Comment"); native.placeholder = "Add a comment...";
    commentLabel.className = "annota-native-comment"; commentLabel.textContent = "Comment";
    commentLabel.appendChild(native); this._orderAnnotationControls(container, [commentLabel, label]);
    this._shieldFromReaderShortcuts(native, "textarea");
    const attachmentID = reader?.itemID || reader?._item?.id;
    const draftKey = String(attachmentID || "") + "/" + this._normText(params?.annotation?.text || "");
    if (!this._nativeCommentDrafts) this._nativeCommentDrafts = new Map();
    for (const [key, draft] of this._nativeCommentDrafts) if (Date.now() - draft.ts > 600000) this._nativeCommentDrafts.delete(key);
    native.value = this._nativeCommentDrafts.get(draftKey)?.value || "";
    native.addEventListener("input", () => {
        if (!attachmentID) return;
        this._nativeCommentDrafts.set(draftKey, { attachmentID, value: native.value, ts: Date.now() });
    });
    this._shieldFromReaderShortcuts(tags, "text");
    const text = params?.annotation?.text || "";
    if (this._pendingResearch?.text === text) tags.value = (this._pendingResearch.values.tags || []).join(", ");
    const sync = () => { this._pendingResearch = { text, ts: Date.now(), values: {
        tags: [...new Set(tags.value.split(",").map(value => value.trim()).filter(Boolean))]
    } }; };
    tags.addEventListener("input", sync); tags.addEventListener("change", sync);
    insertionPoint.parentNode.insertBefore(container, insertionPoint.nextSibling);
},
// Monitor Zotero readers for the popup shown when clicking an existing annotation.
// Recalculate the existing annotation popup position after extension UI changes.
_repositionExistingAnnotationPopup({ doc, popup, rect }) {
    if (!doc || !popup || !Array.isArray(rect) || rect.length < 4) return;
    if (popup.dataset.annotaPositionPending === "true") return;

    popup.dataset.annotaPositionPending = "true";

    const win = doc.defaultView;
    const schedule = win?.requestAnimationFrame
        ? win.requestAnimationFrame.bind(win)
        : callback => setTimeout(callback, 0);

    schedule(() => {
        delete popup.dataset.annotaPositionPending;

        if (!popup.isConnected) return;

        const parent = popup.parentNode;
        if (!parent) return;

        const width = popup.offsetWidth;
        const height = popup.offsetHeight;
        const parentRect = parent.getBoundingClientRect();

        const viewWidth = parentRect.width;
        const viewHeight = parentRect.height;

        if (!width || !height || !viewWidth || !viewHeight) return;

        const signature = JSON.stringify([
            rect, width, height, viewWidth, viewHeight
        ]);


        const padding = 20;
        const anchorX = rect[0] + (rect[2] - rect[0]) / 2;
        const anchorY = rect[1] + (rect[3] - rect[1]) / 2;

        function calculateTop() {
            let top = anchorY - height / 2;

            if (rect[3] - rect[1] > height) {
                top = Math.min(
                    Math.max(top, rect[1]),
                    rect[3] - height
                );
            }

            return top;
        }

        function calculateLeftForSide(placeLeft) {
            if (placeLeft) {
                const left = rect[0] - width - padding;
                return left < padding
                    ? anchorX - width - padding
                    : left;
            }

            const left = rect[2] + padding;

            return left + width > viewWidth - padding
                ? anchorX + padding
                : left;
        }

        let left = anchorX - width / 2;
        let top;
        let side;

        if (left < 0) {
            side = "right";
            left = calculateLeftForSide(false);
            top = calculateTop();
        }
        else if (left + width > viewWidth) {
            side = "left";
            left = calculateLeftForSide(true);
            top = calculateTop();
        }
        else {
            const fitsAbove = rect[1] - padding - height > 0;
            const fitsBelow = rect[3] + height + padding < viewHeight;

            if (fitsBelow) {
                top = rect[3] + padding;
                side = "bottom";
            }
            else if (fitsAbove) {
                top = rect[1] - padding - height;
                side = "top";
            }
            else {
                const placeLeft = rect[0] >= viewWidth / 2;
                side = placeLeft ? "left" : "right";
                left = calculateLeftForSide(placeLeft);
                top = calculateTop();
            }
        }

        if (left + width > viewWidth - padding) {
            left = viewWidth - width - padding;
        }

        if (left < padding) left = padding;

        if (top + height > viewHeight - padding) {
            top = viewHeight - height - padding;
        }

        if (top < padding) top = padding;

        const expectedTransform = `translate(${left}px, ${top}px)`;
        const expectedClass = `page-popup-${side}-center`;

        if (
            popup.dataset.annotaPositionSignature === signature &&
            popup.style.transform === expectedTransform &&
            popup.classList.contains(expectedClass)
        ) {
            return;
        }

        popup.style.transform = expectedTransform;

        popup.classList.remove(
            "page-popup-top-center",
            "page-popup-bottom-center",
            "page-popup-left-center",
            "page-popup-right-center"
        );

        popup.classList.add(expectedClass);
        popup.dataset.annotaPositionSignature = signature;
    });
},
_startAnnotationPopupMonitor() {
    if (this._annotationPopupScanTimer) return;

    this._annotationPopupScanTimer = setInterval(() => {
        try {
            const readers = Zotero.Reader?._readers || [];

            for (const reader of readers) {
                const doc = reader?._iframeWindow?.document;
                if (!doc) continue;

                const popup = doc.querySelector(".annotation-popup");
                if (!popup) continue;

                const annotation =
                    reader._internalReader?._state
                        ?.primaryViewAnnotationPopup?.annotation;

                if (!annotation?.id) continue;

		const libraryID =
			annotation.libraryID ?? reader._item?.libraryID;

		if (libraryID == null) {
			log("Could not resolve annotation library ID: " + annotation.id);
			continue;
		}

		this._renderExistingAnnotationResearch({
    doc,
    popup,
    reader,
    annotation: {
        ...annotation,
        libraryID
    }
});
		const popupRect =
			reader._internalReader?._state
				?.primaryViewAnnotationPopup?.rect;

		this._repositionExistingAnnotationPopup({
			 doc,
			 popup,
			 rect: popupRect
		});
            }
        }
        catch (e) {
            log("Annotation popup monitor: " + e);
        }
    }, 500);
},


// Add research fields to the popup for an existing annotation.

_renderExistingAnnotationResearch({ doc, popup, annotation, reader }) {
    if (!doc || !popup || !annotation?.id) return;

    const annotationKey = `${annotation.libraryID}:${annotation.id}`;

    const item = Zotero.Items.getByLibraryAndKey(
        annotation.libraryID,
        annotation.id
    );

    if (!item || !item.isAnnotation?.()) {
        log("Could not find Zotero annotation: " + annotation.id);
        return;
    }

    // Keep Zotero's native comment editor and native Tags button.
    const nativeComment = popup.querySelector(".preview > .comment");
    if (nativeComment) nativeComment.style.display = "";

    const nativeTags = popup.querySelector("button.tags");
    if (nativeTags) nativeTags.style.display = "";

    let container = popup.querySelector(".annota-existing-research");

if (container?.dataset.annotationKey === annotationKey) {
    container._refreshColor?.();
    return;
}

if (container) container.remove();

const oldColorPanel = popup.querySelector(".annota-existing-colors");
if (oldColorPanel) oldColorPanel.remove();

this._ensureFormStyles(doc);
this._ensureAnnotationInterfaceStyles(doc);

container = doc.createElement("div");
container.className = this.FORM_CLASS + " annota-existing-research";
    container.dataset.annotationKey = annotationKey;

    container.style.cssText =
        "width:100%;box-sizing:border-box;"
        + "padding:2px 0;"
        + "border-top:1px solid rgba(128,128,128,.3);"
        + "display:flex;flex-direction:column;gap:8px;";

// Keep the colour selector separate from the research fields.
const colorPanel = doc.createElement("div");
colorPanel.className = this.FORM_CLASS + " annota-existing-colors";
colorPanel.dataset.annotationKey = annotationKey;
colorPanel.style.cssText =
    "width:100%;max-width:calc(100vw - 24px);box-sizing:border-box;"
    + "padding:9px 10px;"
    + "border-bottom:1px solid rgba(128,128,128,.3);"
    + "display:flex;flex-direction:column;gap:8px;";

    // Section heading removed.



// Native Zotero conversion: highlight <-> underline.
const annotationType = String(item.annotationType || "").toLowerCase();

if (annotationType === "highlight" || annotationType === "underline") {
    const targetType =
        annotationType === "highlight" ? "underline" : "highlight";

    const convertButton = doc.createElement("button");
    convertButton.className = "annota-convert-annotation";
    convertButton.type = "button";
    convertButton.textContent =
        targetType === "underline"
            ? "Convert to underline"
            : "Convert to highlight";

    convertButton.style.cssText =
        "align-self:flex-start;"
        + "padding:5px 9px;"
        + "border:1px solid rgba(128,128,128,.4);"
        + "border-radius:4px;"
        + "background:var(--fill-quinary);"
        + "color:var(--fill-primary);"
        + "font-size:11px;"
        + "cursor:pointer;";

    convertButton.addEventListener("click", async () => {
        const internalReader = reader?._internalReader;

        if (!internalReader?.convertAnnotations) {
            log("Native annotation conversion is unavailable.");
            return;
        }

        convertButton.disabled = true;

        try {
            if (typeof AnnotaInfrastructure !== "undefined") {
                await container._flushDraft?.();
                await AnnotaCardFields.flush();
                if (!this._activeStructuredConversions) this._activeStructuredConversions = new Map();
                this._activeStructuredConversions.set(item.libraryID + ":" + item.key, { libraryID: item.libraryID, oldID: item.key,
                    oldAnnotationKey: item.libraryID + ":" + item.key, parentID: item.parentID, targetType, text: this._normText(item.annotationText || ""), createdAt: Date.now() });
            }
            const beforeIDs = this._readerAnnotationIDs(reader);

            // Zotero may update its reader state asynchronously.
            const annotationIDs = Cu.cloneInto(
                [item.key],
                reader._iframeWindow
            );

            const conversionResult = internalReader.convertAnnotations(
                annotationIDs,
                targetType
            );

            if (
                conversionResult
                && typeof conversionResult.then === "function"
            ) {
                await conversionResult;
            }

            // Wait for the replacement annotation to appear in reader state
            // and become available as a Zotero database item.
            let newID = null;
            let newItem = null;

            for (let attempt = 0; attempt < 50; attempt++) {
                const afterIDs = this._readerAnnotationIDs(reader);
                const addedIDs = [];

                afterIDs.forEach(candidateID => {
                    if (!beforeIDs.has(candidateID)) {
                        addedIDs.push(candidateID);
                    }
                });

                if (addedIDs.length > 1) {
                    throw new Error(
                        "Expected one replacement annotation, found "
                        + addedIDs.length
                    );
                }

                if (addedIDs.length === 1) {
                    newID = addedIDs[0];
                    newItem = Zotero.Items.getByLibraryAndKey(
                        item.libraryID,
                        newID
                    );

                    if (newItem?.isAnnotation?.()) {
                        break;
                    }

                    newItem = null;
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (!newID || !newItem) {
                throw new Error(
                    "Timed out waiting for the converted annotation."
                );
            }

            const conversionKey = `${item.libraryID}:${newID}`;

            this._pendingAnnotationConversions.set(conversionKey, {
                libraryID: item.libraryID,
                oldAnnotationKey: `${item.libraryID}:${item.key}`,
                newAnnotationKey: conversionKey,
                oldID: item.key,
                newID,
                parentID: item.parentID,
                targetType,
                createdAt: Date.now(),
                processing: false
            });

            log(
                "Native annotation conversion detected: "
                + item.key
                + " -> "
                + newID
                + " ("
                + targetType
                + ")"
            );

            // Migrate the old annotation's research metadata.
            await this.handleConvertedAnnotation(newItem.id);

            // Wait for any notifier-triggered migration to finish.
            for (let attempt = 0; attempt < 50; attempt++) {
                const pending =
                    this._pendingAnnotationConversions.get(conversionKey);

                if (!pending || !pending.processing) {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Verify the converted annotation survives subsequent
            // conversion-related notifications and note rebuilds.
            let verified = false;

            for (let attempt = 0; attempt < 3; attempt++) {
                if (attempt > 0) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                const freshItem = await Zotero.Items.getAsync(newItem.id);

                if (!freshItem?.isAnnotation?.()) {
                    log("Converted annotation unavailable during verification.");
                    continue;
                }

                await this._syncPaperResearchNote(freshItem);

                const { note } =
                    await this._getOrCreatePaperResearchNote(freshItem);

                const expectedMarker =
                    "RA_ENTRY_START:"
                    + freshItem.libraryID
                    + ":"
                    + freshItem.key;

                const savedHTML = note.getNote() || "";

                const savedDocument = new DOMParser().parseFromString(
    savedHTML,
    "text/html"
);

const expectedAttribute =
    `${freshItem.libraryID}:${freshItem.key}`;

verified =
    savedDocument.querySelector(
        `div[data-ra-entry="${expectedAttribute}"]`
    ) !== null
    || savedHTML.includes(expectedMarker);

                log(
                    "Conversion note verification "
                    + (attempt + 1)
                    + "/3: "
                    + freshItem.key
                    + " | present: "
                    + verified
                );
            }

            if (!verified) {
                log(
                    "WARNING: Converted annotation entry was not "
                    + "verified in the research note."
                );
            }
            else {
                log(
                    "Converted annotation entry verified in research note."
                );
            }
        }
        catch (e) {
            log("Native annotation conversion failed: " + e);
            convertButton.disabled = false;
        }
        finally { this._activeStructuredConversions?.delete(item.libraryID + ":" + item.key); }
    });
    colorPanel.appendChild(convertButton);
}

    const colorLabels = this.getColorLabels();

    const colorContainer = doc.createElement("div");
    if (typeof AnnotaPalette !== "undefined") AnnotaPalette.stylePicker(colorContainer);
    else colorContainer.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;width:100%;";

    const updateSelectedColor = () => {
        const currentColor = String(item.annotationColor || "").toLowerCase();
        container.dataset.currentColor=currentColor;

        for (const button of colorContainer.querySelectorAll("button")) {
            const selected = typeof AnnotaPalette !== "undefined" && AnnotaPalette.resolve(currentColor)
                ? AnnotaPalette.resolve(button.dataset.color)?.id === AnnotaPalette.resolve(currentColor).id
                : button.dataset.color.toLowerCase() === currentColor;

            button.setAttribute("aria-pressed", String(selected));
            if (typeof AnnotaPalette !== "undefined") {
                const color = AnnotaPalette.resolve(button.dataset.color);
                if (color) AnnotaPalette.styleButton(button, color, selected);
            }

            else { button.style.outline = selected ? "2px solid Highlight" : "none"; button.style.outlineOffset = "1px"; }
        }
    };

    container._refreshColor=()=>{if(container.dataset.currentColor!==String(item.annotationColor||"").toLowerCase())updateSelectedColor();};
    for (const color of this.COLORS) {
        const button = doc.createElement("button");
        button.type = "button";
        button.dataset.color = color.hex;

        const label = String(
            colorLabels[color.hex] || color.name || "Color"
        ).trim();

        button.textContent = label;
        button.title = label;
        button.setAttribute("aria-label", "Set annotation colour to " + label);

        button.addEventListener("click", async () => {
            const previousColor = item.annotationColor;
            let colorSaved = false;

            if (
                String(previousColor || "").toLowerCase() ===
                color.hex.toLowerCase()
            ) {
                return;
            }

            for (const otherButton of colorContainer.querySelectorAll("button")) {
                otherButton.disabled = true;
            }

            try {
                // Save the fields under the OLD color before changing it.
                await saveColorFields();

                item.annotationColor = color.hex;
                await item.saveTx();
                colorSaved = true;

                const savedItem = await Zotero.Items.getAsync(item.id);

                if (!savedItem?.isAnnotation?.()) {
                    throw new Error("Could not reload annotation after color change.");
                }

                log(
                    "Persisted annotation color: "
                    + savedItem.key
                    + " -> "
                    + savedItem.annotationColor
                );

                await this._syncPaperResearchNote(savedItem);

                updateSelectedColor();

                // Render the fields belonging to the NEW color.
                await renderColorFields();

                log(
                    "Annotation colour changed: "
                    + annotation.id
                    + " -> "
                    + color.hex
                );
            }
            catch (e) {
                if(!colorSaved)item.annotationColor = previousColor;
                log("Changing annotation colour failed: " + e);
                fieldStatus.textContent=(colorSaved?'Color saved. The research note could not be updated: ':'Color could not be saved: ')+(e.message||e);
                if(colorSaved&&!colorPanel.querySelector('[data-retry-note]')){const retry=doc.createElement('button');retry.type='button';retry.textContent='Retry note update';retry.dataset.retryNote='true';retry.addEventListener('click',async()=>{retry.disabled=true;try{await this._syncPaperResearchNote(item);fieldStatus.textContent='Research note updated.';retry.remove();}catch(error){fieldError(error);}finally{retry.disabled=false;}});colorPanel.appendChild(retry);}

                updateSelectedColor();

                try {
                    await renderColorFields();
                }
                catch (renderError) {
                    log("Restoring color-specific fields failed: " + renderError);
                }
            }
            finally {
                for (const otherButton of colorContainer.querySelectorAll("button")) {
                    otherButton.disabled = false;
                }
            }
        });

        if (typeof AnnotaPalette !== "undefined") AnnotaPalette.styleButton(button, color, color.hex === String(item.annotationColor).toLowerCase());
        colorContainer.appendChild(button);
    }

    const conversionButton = colorPanel.querySelector(".annota-convert-annotation");

    // Append swatches first, then move the conversion button below them.
    colorPanel.appendChild(colorContainer);

    if (conversionButton) {
        colorPanel.appendChild(conversionButton);
    }

    updateSelectedColor();

    // Shared global-first schema; dedicated research categories are not rendered.
    const colorFieldsSection = doc.createElement("div");
    colorFieldsSection.className = "annota-color-specific-fields";
    colorFieldsSection.style.cssText =
        "display:flex;flex-direction:column;gap:4px;"
        + "width:100%;box-sizing:border-box;";


    let colorFieldInputs = Object.create(null);
    let colorFieldSaveTimer = null;
    let colorFieldSaveQueue = Promise.resolve();
    const fieldStatus = doc.createElement("div");
    fieldStatus.className = "annota-structured-status";
    fieldStatus.setAttribute("role", "status");
    const fieldError = e => {
        fieldStatus.textContent = this.t("gen.failed", { msg: e.message || e });
        log("Structured fields: " + e);
    };

    const saveColorFields = () => {
        if (colorFieldSaveTimer !== null) {
            clearTimeout(colorFieldSaveTimer);
            colorFieldSaveTimer = null;
        }

        // Capture this color and its draft before asynchronous work or color switches.
        const colorKey = this.keyForItem(item);
        const patch = {};
        const controls = Object.assign({}, colorFieldInputs);
        for (const field of this.annotationFields(colorKey).filter(f => f.type !== "ai")) {
            const control = controls[field.name];
            if (!control || control.dataset.dirty !== "true") continue;
            patch[field.name] = this.readManualField(field, control);
        }
        const saveTask = colorFieldSaveQueue.catch(() => {}).then(async () => {
            if (typeof AnnotaCardFields === "undefined" || !AnnotaCardFields) {
                throw new Error("Color-specific field storage is unavailable.");
            }

            await AnnotaCardFields.load();

            if (!Object.keys(patch).length) return;
            if (this.keyForItem(item) !== colorKey) throw new Error("Annotation color changed before saving. Please retry.");
            await AnnotaCardFields.saveValues(item, patch);
            for (const [name, value] of Object.entries(patch)) {
                const control = controls[name];
                const field = this.fieldByName(item, name);
                const current = this.readManualField(field, control);
                if (JSON.stringify(current) === JSON.stringify(value)) control.dataset.dirty = "false";
            }

            // Refresh the consolidated paper note after the field save.
            await this._syncPaperResearchNote(item);
            fieldStatus.textContent = this.t("card.saved");

            log("Color-specific fields saved for " + item.key
                + " (" + this.keyForItem(item) + ")");
        });

        colorFieldSaveQueue = saveTask;
        return saveTask;
    };

    const scheduleColorFieldSave = () => {
        if (colorFieldSaveTimer !== null) {
            clearTimeout(colorFieldSaveTimer);
        }

        colorFieldSaveTimer = setTimeout(() => {
            colorFieldSaveTimer = null;
            saveColorFields().catch(e => {
                fieldError(e);
            });
        }, 600);
    };

    const renderColorFields = async () => {
        if (typeof AnnotaCardFields === "undefined" || !AnnotaCardFields) {
            colorFieldsSection.replaceChildren();
            colorFieldsSection.style.display = "none";
            return;
        }

        await AnnotaCardFields.load();

        const colorKey = this.keyForItem(item);
        const schema = this.annotationFields(colorKey);
        const saved = AnnotaCardFields.get(item) || {};
        const values = saved.values || {};

        colorFieldsSection.replaceChildren();
        colorFieldInputs = Object.create(null);

        if (!schema.length) {
            colorFieldsSection.style.display = "none";
            return;
        }

        colorFieldsSection.style.display = "flex";

        const heading = doc.createElement("div");
        heading.textContent = "Color-specific fields";
        heading.style.cssText =
            "font-size:11px;font-weight:600;margin-top:2px;";
        colorFieldsSection.appendChild(heading);

        for (const field of schema) {
            const wrapper = doc.createElement("div");
            this._styleStructuredField(wrapper, field);
            wrapper.style.cssText =
                "display:flex;flex-direction:column;gap:3px;";

            const label = doc.createElement("label");
            label.textContent = field.label;
            label.style.cssText = "font-size:11px;font-weight:600;";

            let control;

            if (field.type === "ai") {
                control = doc.createElement("div");
                control.className = "annota-popup-ai";
                control.dataset.ai = "true";
                this.renderAIField(control, field, values[field.name], item);
                wrapper.appendChild(label);
                wrapper.appendChild(control);
                const retry = AnnotaCardFields.fieldRetry(doc, field, async () => item, saveColorFields);
                const error = doc.createElement("div"); error.className = "annota-field-error"; error.setAttribute("role", "status");
                retry._error = error; control._retry = retry;
                wrapper.appendChild(error); wrapper.appendChild(retry);
                colorFieldInputs[field.name] = control;
                colorFieldsSection.appendChild(wrapper);
                continue;
            }

            if (field.type === "multiselect") {
                control = this.createMultiSelect(doc, field, values[field.name], () => {
                    control.dataset.dirty = "true"; scheduleColorFieldSave();
                });
                wrapper.appendChild(label); wrapper.appendChild(control);
            }
            else if (field.type === "check") {
                const checkRow = doc.createElement("label");
                checkRow.style.cssText =
                    "display:flex;align-items:center;gap:7px;"
                    + "font-size:12px;";

                control = doc.createElement("input");
                control.type = "checkbox";
                control.checked = /^(true|yes|oui|1|x|✓)$/i.test(String(values[field.name] || ""));
                control.style.margin = "0";

                checkRow.appendChild(control);
                checkRow.appendChild(doc.createTextNode(field.label));
                wrapper.appendChild(checkRow);
            }
            else {
                if (field.type === "select") {
                    control = doc.createElement("select");

                    const emptyOption = doc.createElement("option");
                    emptyOption.value = "";
                    emptyOption.textContent = "—";
                    control.appendChild(emptyOption);

                    const options = (field.options || []).slice();
                    const savedValue = this.fieldDisplayValue(field, values[field.name]);

                    // Preserve a previously saved value even if the template
                    // options have since changed.
                    if (savedValue && !options.includes(savedValue)) {
                        options.unshift(savedValue);
                    }

                    for (const optionValue of options) {
                        const option = doc.createElement("option");
                        option.value = optionValue;
                        option.textContent = optionValue;
                        control.appendChild(option);
                    }

                    control.value = savedValue;
                }
                else if (field.type === "textarea") {
                    control = doc.createElement("textarea");
                    control.rows = 2;
                    control.value = this.fieldDisplayValue(field, values[field.name]);
                }
                else {
                    control = doc.createElement("input");
                    control.type = "text";
                    control.value = this.fieldDisplayValue(field, values[field.name]);
                }

                control.style.cssText =
                    "width:100%;box-sizing:border-box;"
                    + "padding:5px 7px;"
                    + "border:1px solid rgba(128,128,128,.4);"
                    + "border-radius:4px;"
                    + "background:var(--fill-quinary);"
                    + "color:var(--fill-primary);"
                    + "font-size:12px;";

                wrapper.appendChild(label);
                wrapper.appendChild(control);
            }

            colorFieldInputs[field.name] = control;
            control.disabled = !!annotation.readOnly || item.library?.editable === false;
            if (control.setDisabled) control.setDisabled(control.disabled);

            if (field.type !== "multiselect") control.addEventListener(
                field.type === "check" || field.type === "select"
                    ? "change"
                    : "input",
                () => { control.dataset.dirty = "true"; scheduleColorFieldSave(); }
            );
            control.addEventListener("blur", () => {
                if (control.dataset.dirty === "true") saveColorFields().catch(fieldError);
            });

            colorFieldsSection.appendChild(wrapper);
        }
        refreshStructuredFields();
    };

    renderColorFields().catch(e => {
        fieldError(e);
    });
    const refreshStructuredFields = () => {
        manualGenerate.hidden = !this.canGenerateAIFields(item) || !!annotation.readOnly || item.library?.editable === false;
        manualGenerate.disabled = !!AnnotaCardFields.generationState(item).running;
        const message = AnnotaCardFields.generationMessage(item);
        if (message) fieldStatus.textContent = message;
        const saved = AnnotaCardFields.get(item)?.values || {};
        for (const field of this.annotationFields(this.keyForItem(item))) {
            const control = colorFieldInputs[field.name]; if (!control) continue;
            if (field.type === "ai") {
                this.renderAIField(control, field, saved[field.name], item);
                if (control._retry) AnnotaCardFields.updateFieldRetry(control._retry, item, field);
            }
            else if (control.dataset.dirty !== "true" && !control.contains(doc.activeElement) && doc.activeElement !== control) {
                if (field.type === "multiselect") control.setValues(saved[field.name] || []);
                else if (field.type === "check") control.checked = /^(true|yes|oui|1|x)$/i.test(String(saved[field.name] || ""));
                else control.value = this.fieldDisplayValue(field, saved[field.name]);
            }
        }
    };
    container.appendChild(fieldStatus);
    container._flushDraft = async () => {
        if (colorFieldSaveTimer) { clearTimeout(colorFieldSaveTimer); colorFieldSaveTimer = null; }
        if (Object.values(colorFieldInputs).some(control => control.dataset.dirty === "true")) await saveColorFields();
    };
    const manualGenerate=doc.createElement("button");manualGenerate.type="button";manualGenerate.className="annota-manual-generate-fields";
    manualGenerate.textContent="Generate AI Fields";manualGenerate.hidden=true;
    manualGenerate.addEventListener("click",async event=>{
        event.preventDefault();event.stopPropagation();if(manualGenerate.disabled)return;manualGenerate.disabled=true;
        try{await container._flushDraft();await this.requestAIFields(item);}catch(error){fieldError(error);}finally{refreshStructuredFields();manualGenerate.disabled=false;}
    });
    if (AnnotaCardFields) AnnotaCardFields.watch(container, refreshStructuredFields);
    refreshStructuredFields();

    container.appendChild(colorFieldsSection);
    container.appendChild(manualGenerate);

    // Arrange the popup in the requested order.
    const preview = popup.querySelector(".preview");

    if (preview) {
        // Remove headings left by an earlier annotation popup.
        for (const oldHeading of preview.querySelectorAll(
            ".annota-existing-section-heading"
        )) {
            oldHeading.remove();
        }

        const comment = preview.querySelector(":scope > .comment");
        const tags = preview.querySelector(":scope > button.tags");

        const createSectionHeading = text => {
            const heading = doc.createElement("div");
            heading.className = "annota-existing-section-heading";
            heading.textContent = text;
            heading.style.cssText =
                "font-size:11px;font-weight:600;"
                + "margin:7px 0 3px;";
            return heading;
        };

        this._orderAnnotationControls(preview, [colorPanel,
            comment && createSectionHeading("Comment"), comment,
            tags && createSectionHeading("Tags"), tags, container]);
    }
    log("Research panel restored for annotation " + annotation.id);
},

	// Zotero's selection-popup.js renders native swatches as
	// .colors > .color-button in ANNOTATION_COLORS order, matching
	// Zotero.Annotations.COLORS. Injected CustomSections can walk
	// up to the containing popup. If the button count is unexpected,
	// return null instead of guessing which color a button represents.
	// This prevents applying fields to the wrong annotation color.
	readerColorButtons(node) {
		try {
			let root = node && node.parentNode;
			while (root && !(root.classList
					&& root.classList.contains && root.classList.contains("selection-popup"))) {
				root = root.parentNode;
			}
			if (!root || typeof root.querySelectorAll !== "function") return null;
			let btns = Array.prototype.slice.call(
				root.querySelectorAll(".annota-palette-picker button"));
			if (!btns.length) btns = Array.prototype.slice.call(root.querySelectorAll(".colors .color-button"));
			return btns.length === this.COLORS.length ? btns : null;
		}
		catch (e) {
			log("readerColorButtons: " + e);
			return null;
		}
	},

	// Cache drafts per passage for ten minutes.
	// Zotero normalizes line breaks, hyphenation and whitespace when
	// saving, so strict comparison with selected text is unreliable.
	// Compare normalized text, then a prefix, with a recent-draft
	// fallback for the immediate type-then-click gesture.
	// The saved draft is consumed only by the matching creation event.
	_normText(t) {
		return String(t || "")
			.replace(/[\u00AD]/g, "")          // Conditional soft hyphens.
			.replace(/-\s*\n\s*/g, "")         // Words split by end-of-line hyphenation.
			.replace(/\s+/g, " ")
			.trim()
			.toLowerCase();
	},

	// consume=false inspects a draft without removing it.
	_matchPending(text, consume, item) {
		let p = this._pendingFields;
		if (!p) return null;
		let age = Date.now() - p.ts;
		if (age > 600000) { this._pendingFields = null; return null; }

		let a = this._normText(p.text), b = this._normText(text);
        if (typeof AnnotaInfrastructure !== "undefined") {
            if (!item || !p.attachmentID || item.parentID !== p.attachmentID || a !== b || !a) return null;
            if (p.libraryID !== undefined && p.libraryID !== item.libraryID) return null;
            if (consume) this._pendingFields = null;
            return p.values;
        }
		let how = "";
		if (a && b && a === b) how = "texte identique";
		else if (a && b && (a.startsWith(b.slice(0, 40)) || b.startsWith(a.slice(0, 40)))) {
			how = "Shared prefix";
		}
		else if (age < 60000) how = "Recent draft (" + Math.round(age / 1000) + " s)";

		if (!how) {
			log("Pending fields not applied: passage mismatch");
			return null;
		}
		if (consume) {
			this._pendingFields = null;   // Consume a matching draft once only.
			log("Fields applied (" + how + ")");
		}
		return p.values;
	},

	peekPendingFields(text, item) { return this._matchPending(text, false, item); },
	takePendingFields(text, item) { return this._matchPending(text, true, item); },

	// Check for at least one populated value. An untouched form must
	// not trigger generation for a Manual color.
	_hasFilledValues(values) {
		return !!values && Object.keys(values).some(k => String(values[k] || "").trim());
	},

	registerSelectionForm() {
		try {
			if (!Zotero.Reader || !Zotero.Reader.registerEventListener) return;
			this._startAnnotationPopupMonitor();
			this._selectionListener = (event) => {
    this._hideCreationAddToNote(event);
    // Semantic color labels: independent of AI and custom fields.
    try { if (typeof AnnotaPalette !== "undefined") AnnotaPalette.renderSelection(event); }
    catch (e) { log("palette selection: " + e); }
    try { this._renderColorLabels(event); }
    catch (e) { log("renderColorLabels: " + e); }
    // Optional research annotation fields.
    try { this._renderResearchCapture(event); }
    catch (e) { log("renderResearchCapture: " + e); }
    // Existing AI/custom-fields functionality.
    try { this._renderSelectionForm(event); }
    catch (e) { log("renderTextSelectionPopup: " + e); }
				// Ask ResearchAnnotator transfers the selection into Chat.
				try { if (AnnotaChat) AnnotaChat.renderAskButton(event); }
				catch (e) { log("renderAskButton: " + e); }
			};
			Zotero.Reader.registerEventListener(
				"renderTextSelectionPopup", this._selectionListener, "researchannotator@pino");
			log("Selection form registered");
		}
		catch (e) {
			log("registerSelectionForm: " + e);
		}
	},

	unregisterSelectionForm() {
        if (this._annotationPopupScanTimer) { clearInterval(this._annotationPopupScanTimer); this._annotationPopupScanTimer = null; }
        for (const timer of this._paperNoteSyncTimers?.values() || []) clearTimeout(timer);
        this._paperNoteSyncTimers?.clear();
		try {
			if (this._selectionListener && Zotero.Reader
					&& Zotero.Reader.unregisterEventListener) {
				Zotero.Reader.unregisterEventListener(
					"renderTextSelectionPopup", this._selectionListener);
			}
		}
		catch (e) { /* ignore */ }
		this._selectionListener = null;
		// Restore the native creation action when this extension is disabled.
		for (const reader of Zotero.Reader?._readers || []) {
			try { reader._iframeWindow?.document?.getElementById("annota-creation-actions-style")?.remove(); }
			catch (e) { /* Reader document may already have closed. */ }
		}
	},

	// The reader reserves unmodified keys for shortcuts, including
	// "l" start text-to-speech, "h" and "u" annotate, and Space pauses
	// pause. Its capture-phase window listener runs before events
	// reach extension controls, so stopping propagation on the form
	// cannot protect typing from that listener by itself.
	// The workaround must satisfy the reader's text-box test.
	//
	// The reader's isTextBox(event.target) guard recognizes
	// (lib/utilities.js) :
	//     ['INPUT'].includes(node.nodeName) && node.type === 'text'
	//         || node.getAttribute('contenteditable') === 'true'
	//
	// text inputs but not textarea, select or checkbox controls.
	// Without protection, typing ordinary text can trigger reader
	// actions such as speech playback. Mark controls contenteditable:
	// it is inert on native form controls but makes the reader
	// recognize them as editable targets.
	// This shields input without replacing the reader's keyboard manager.
	// Delete and Backspace can remove the selected annotation. Their
	// guard differs from the single-letter shortcut guard:
	//     if (event.target.closest('input, .label-popup') || …) return;
	// inputs cover text controls and checkboxes, but not a textarea,
	// so correcting a paragraph could delete the previously selected
	// highlight.
	//
	// Use the available .label-popup ancestor hook on the form wrapper
	// so closest() recognizes every control. Its native positioning,
	// padding and pointer pseudo-elements would otherwise put our form
	// off screen, so neutralize those styles in the extension stylesheet.
	// The required ancestor and placement conditions are otherwise
	// side effects elsewhere: focus-manager.js tests .selection-popup, which
	// already satisfied by the existing container.
	FORM_CLASS: "label-popup annota-fields",

	_styleStructuredField(row, field) {
		this._ensureStructuredFieldStyles(row.ownerDocument);
		row.classList.add("annota-structured-field");
		row.dataset.fieldType = field.type;
		row.dataset.fieldScope = field.scope === "global" ? "Global" : "Color";
	},

    _orderAnnotationControls(parent, controls) {
        for (const control of controls) if (control) parent.appendChild(control);
    },
	_ensureAnnotationInterfaceStyles(doc) {
		if (!doc?.getElementById || doc.getElementById("annota-interface-style")) return;
		const style = doc.createElement("style"); style.id = "annota-interface-style";
		style.textContent = ".selection-popup,.annotation-popup{width:min(360px,calc(100vw - 24px))!important;box-sizing:border-box!important;" +
            "padding:8px!important;max-height:75vh!important;min-height:0!important;overflow:auto!important;overflow-x:hidden!important;" +
            "max-width:calc(100vw - 24px)!important;overscroll-behavior:contain;}" +
            ".annotation-popup>.preview{width:100%;min-width:0;box-sizing:border-box;}" +
            ".selection-popup input,.selection-popup textarea,.selection-popup select,.annotation-popup input,.annotation-popup textarea," +
            ".annotation-popup select{box-sizing:border-box;min-width:0;max-width:100%;}" +
            ".selection-popup .comment,.annotation-popup .comment{overflow-wrap:anywhere;}" +
			".selection-popup .annota-fields,.annotation-popup .annota-fields{font:12px/1.4 sans-serif;gap:4px;}" +
			".annota-native-comment{display:flex;flex-direction:column;gap:3px;font-size:11px;font-weight:600;}" +
			".annota-native-comment-input{font:12px/1.4 sans-serif;width:100%;box-sizing:border-box;resize:vertical;" +
			"background:transparent;color:inherit;border:1px solid GrayText;border-radius:4px;padding:4px 6px;}" +
			".annota-palette-picker{display:flex;flex-wrap:wrap;gap:5px;margin:3px 0;}" +
            ".annota-color-button{display:inline-flex;align-items:center;justify-content:center;gap:4px;min-width:0;white-space:normal;" +
            "overflow-wrap:anywhere;cursor:pointer;transform:rotate(var(--annota-button-rotation,0deg));transition:filter .12s,box-shadow .12s;}" +
            ".annota-color-button::before{content:'';display:inline-block;width:9px;height:9px;flex:none;border-radius:2px;" +
            "background:var(--annota-swatch);border:1px solid rgba(255,255,255,.8);}" +
            ".annota-color-button:hover{filter:brightness(1.05);box-shadow:0 0 0 2px rgba(105,155,210,.5);}" +
            ".annota-color-button:focus-visible{outline:2px solid Highlight!important;outline-offset:3px!important;}" +
            ".annota-color-button:active{filter:brightness(.9);box-shadow:inset 0 1px 3px rgba(0,0,0,.5);}" +
            ".annota-palette-picker[data-layout=single] .annota-color-button,.annota-palette-picker[data-layout=slanted] .annota-color-button," +
            ".annota-palette-picker[data-layout=vertical] .annota-color-button{white-space:nowrap;overflow-wrap:normal;word-break:normal;flex:none;max-width:none;font-family:sans-serif;font-weight:400;}" +
            ".annota-palette-picker[data-layout=stack]>.annota-color-button{justify-content:flex-start;}" +
            ["single", "slanted", "vertical"].flatMap(layout => [".selection-popup", ".annotation-popup"].map(selector => selector + "[data-annota-color-layout=" + layout + "]"))
                .join(",") + "{width:min(var(--annota-color-popup-width,360px),calc(100vw - 24px))!important;}";
		(doc.head || doc.documentElement).appendChild(style);
	},
	_ensureStructuredFieldStyles(doc) {
		if (doc.getElementById("annota-structured-field-style")) return;
		const style = doc.createElement("style");
		style.id = "annota-structured-field-style";
		style.textContent = ".annota-structured-field{box-sizing:border-box;min-width:0;width:100%;"
			+ "border:1px solid rgba(105,125,146,.3);border-radius:5px;padding:4px 5px;"
			+ "background:rgba(105,125,146,.07);color:inherit;gap:3px !important;}"
			+ ".annota-structured-field[data-field-type=ai]{border-color:rgba(80,139,134,.35);background:rgba(80,139,134,.07);}"
			+ ".annota-structured-field>label,.annota-structured-field>.annota-card-label,"
			+ ".annota-structured-field>span{font-size:11px;font-weight:600;opacity:.9 !important;}"
			+ ".annota-structured-field input:not([type=checkbox]),.annota-structured-field textarea,"
			+ ".annota-structured-field select{color:inherit !important;background:transparent !important;"
			+ "border-color:rgba(128,128,128,.25) !important;padding:3px 4px !important;}"
			+ ".annota-structured-field .annota-popup-ai,.annota-structured-field .annota-card-ai,"
			+ ".annota-structured-field .annota-creation-ai{white-space:pre-wrap;overflow-wrap:anywhere;"
			+ "font-size:12px;line-height:1.35;opacity:1 !important;}"
			+ ".annota-structured-field .annota-creation-ai{border:0 !important;padding:0 !important;background:transparent !important;}"
			+ ".annota-structured-field code{font-size:.95em;}"
			+ ".annota-structured-field{position:relative;}.annota-structured-field::after{content:attr(data-field-scope);"
			+ "position:absolute;right:5px;top:4px;font-size:9px;opacity:.55;pointer-events:none;}"
			+ ".annota-structured-field>label,.annota-structured-field>.annota-card-label,.annota-structured-field>span{padding-right:32px;}"
			+ ".annota-field-chips{display:flex;flex-wrap:wrap;gap:3px;}.annota-field-chip{font:inherit;font-size:11px;"
			+ "padding:1px 5px;border:1px solid rgba(128,128,128,.35);border-radius:9px;background:transparent;color:inherit;}"
			+ ".annota-multiselect{min-width:0;}.annota-field-chips{margin-bottom:3px;}"
			+ ".annota-field-chip{background:rgba(80,135,190,.16);border-color:rgba(100,140,180,.65);padding:2px 6px;}"
			+ ".annota-field-suggestions{display:flex;flex-direction:column;gap:0;overflow:auto;overscroll-behavior:contain;"
			+ "background:Canvas;color:CanvasText;border:1px solid GrayText;border-radius:5px;"
			+ "box-shadow:0 3px 10px rgba(0,0,0,.22);font:12px/1.4 sans-serif;padding:3px;}"
			+ ".annota-field-suggestions[hidden]{display:none !important;}"
			+ ".annota-field-option,.annota-field-create{display:flex;align-items:center;min-width:0;}"
			+ ".annota-field-option>[role=gridcell]:first-child,.annota-field-create>[role=gridcell]{flex:1;min-width:0;}"
			+ ".annota-field-suggestions .annota-dismiss-suggestion{width:24px;padding:3px;text-align:center;cursor:pointer;}"
			+ ".annota-dismiss-suggestion::before{content:'\\00d7';font-size:15px;}"
			+ ".annota-field-suggestions button:focus-visible{outline:2px solid Highlight;outline-offset:-2px;}"
			+ ".annota-field-suggestions button{display:block;width:100%;text-align:left;white-space:normal;"
			+ "overflow-wrap:anywhere;font:inherit;color:inherit;background:transparent;border:0;border-radius:3px;padding:5px 7px;}"
			+ ".annota-field-suggestions button:hover,.annota-field-suggestions [aria-selected=true]{background:Highlight;color:HighlightText;}"
			+ ".annota-field-suggestions .annota-field-create{border-top:1px solid GrayText;border-radius:0;margin-top:3px;font-weight:600;}"
			+ ".annota-field-empty{padding:5px 7px;}.annota-field-chip:focus-visible{outline:2px solid Highlight;outline-offset:1px;}"
			+ "@media(prefers-color-scheme:dark){.annota-structured-field{background:rgba(130,155,180,.10);"
			+ "border-color:rgba(150,170,190,.32);}.annota-structured-field[data-field-type=ai]{"
			+ "background:rgba(100,165,158,.10);border-color:rgba(115,180,173,.35);}}";
		(doc.head || doc.documentElement).appendChild(style);
	},

	_ensureFormStyles(doc) {
		try {
			if (!doc || typeof doc.getElementById !== "function") return;
			if (doc.getElementById("annota-form-style")) return;
			let st = doc.createElement("style");
			st.id = "annota-form-style";
			st.textContent = ".annota-fields{position:static !important;"
				+ "left:auto !important;top:auto !important;right:auto !important;"
				+ "bottom:auto !important;padding:0 !important;margin:0 !important;}"
				+ ".annota-fields::before,.annota-fields::after{"
				+ "content:none !important;display:none !important;}";
			let host = doc.head || doc.documentElement;
			if (host && host.appendChild) host.appendChild(st);
		}
		catch (e) {
			log("_ensureFormStyles: " + e);
		}
	},

	_shieldFromReaderShortcuts(el, type) {
		if (type === "text") return;      // Already recognized without additional protection.
		try { el.setAttribute("contenteditable", "true"); }
		catch (e) { /* ignore */ }
	},

	_hideCreationAddToNote({ doc }) {
		if (!doc || doc.getElementById("annota-creation-actions-style")) return;
		const style = doc.createElement("style");
		style.id = "annota-creation-actions-style";
		// Native reader selection-popup.js: enableAddToNote renders this direct
		// child. Scope to creation; annotation menus and note editors stay intact.
		style.textContent = ".selection-popup > button.toolbar-button.wide-button{display:none !important;}";
		(doc.head || doc.documentElement).appendChild(style);
	},

	_renderSelectionForm({ doc, params, append, reader }) {
		this._hideCreationAddToNote({ doc });
		if (!doc || !append) return;
		let colors = this.colorsWithFields();
		if (!colors.length) return;
		let text = String((params && params.annotation && params.annotation.text) || "").trim();
		if (!text) return;

		// The reader can rerender the popup or switch color groups;
		// retain typed values through both transitions.
		const attachmentID = reader?.itemID || reader?._item?.id;
        const sameDraft = this._pendingFields?.text === text &&
            (typeof AnnotaInfrastructure === "undefined" || this._pendingFields.attachmentID === attachmentID) ? this._pendingFields : null;
        let values = Object.assign({}, sameDraft?.values || {});
        const colorDrafts = Object.assign({}, sameDraft?.byColor || {});
        let current = sameDraft?.color || this.defaultFieldColor();

		// Do not force form width. A minimum width previously caused
		// controls to overflow their popup frame.
		this._ensureFormStyles(doc);
		let wrap = doc.createElement("div");
		// See FORM_CLASS: it prevents Delete from removing the annotation.
		wrap.setAttribute("class", this.FORM_CLASS);
		wrap.style.cssText = "display:flex;flex-direction:column;gap:4px;"
			+ "width:100%;max-width:100%;box-sizing:border-box;padding:2px 0;";

		// Also stop bubbling-phase listeners as a secondary protection.
		// This alone cannot block capture listeners; see the shortcut shield.
		// useful alongside the rest of Zotero.
		for (let type of ["keydown", "keypress", "keyup"]) {
			wrap.addEventListener(type, e => e.stopPropagation());
		}

		// Shared style inherits the reader theme.
		const FIELD_CSS = "width:100%;max-width:100%;box-sizing:border-box;"
			+ "font:inherit;font-size:12px;line-height:1.3;padding:4px 6px;"
			+ "border:1px solid rgba(128,128,128,.45);border-radius:4px;"
			+ "background:rgba(128,128,128,.12);color:inherit;outline:none;";
		const LABEL_CSS = "font-size:11px;opacity:.65;";

		let header = doc.createElement("div");     // Current semantic color label.
		header.style.cssText = "display:none;align-items:center;gap:5px;width:100%;"
			+ "font-size:11px;font-weight:600;letter-spacing:.01em;";
		let picker = doc.createElement("div");     // repli : nos propres pastilles
		picker.style.cssText = "display:none;align-items:center;gap:4px;"
			+ "flex-wrap:wrap;width:100%;";
		let body = doc.createElement("div");       // current field group
		body.style.cssText = "display:flex;flex-direction:column;gap:4px;width:100%;";
		let hint = doc.createElement("div");
		hint.style.cssText = "display:flex;align-items:center;justify-content:center;"
			+ "gap:5px;font-size:10px;line-height:1.3;text-align:center;";
		wrap.appendChild(picker);
		wrap.appendChild(header);
		wrap.appendChild(body);
		wrap.appendChild(hint);

		const colorName = (hex) => {
			let c = this.COLORS.find(x => x.hex === hex);
			return c ? c.name : hex;
		};

		// The form footer identifies and displays the swatch to click;
		// in a row of colored circles, visual identification is faster
		// than reading a shade name. Also explain unconfigured colors
		// instead of leaving an unexplained empty form.
		const SWATCH_CSS = "width:9px;height:9px;flex:none;border-radius:2px;"
			+ "display:inline-block;border:1px solid rgba(128,128,128,.55);";

		// The heading names the semantic task; the footer identifies
		// the native swatch. These are distinct pieces of information.
		// Hide an empty heading to conserve the narrow popup's space.
		const renderHeader = (hex) => {
			let label = this.labelForColor(hex);
			header.textContent = "";
			if (!label) { header.style.display = "none"; return; }
			header.style.display = "flex";
			let sw = doc.createElement("span");
			sw.style.cssText = SWATCH_CSS + "background:" + hex + ";";
			let txt = doc.createElement("span");
			txt.textContent = label;
			header.appendChild(sw);
			header.appendChild(txt);
		};

		const renderHint = (hex, configured) => {
			hint.textContent = "";
			let sw = doc.createElement("span");
			sw.style.cssText = SWATCH_CSS + "background:" + hex + ";";
			let msg = doc.createElement("span");
			msg.textContent = configured
				? this.t("form.click", { color: colorName(hex) })
				: this.t("form.none", { color: colorName(hex) });
			hint.style.opacity = configured ? "0.6" : "0.85";
			hint.appendChild(sw);
			hint.appendChild(msg);
		};

		// Save drafts during typing, before annotation creation occurs
		// through a native color click.
		const sync = () => {
			this._pendingFields = { text, values: { ...values }, ts: Date.now(), color: current, byColor: colorDrafts, attachmentID: reader?.itemID || reader?._item?.id, libraryID: reader?._item?.libraryID };
		};

		const renderGroup = (hex) => {
            if (typeof AnnotaInfrastructure !== "undefined" && current !== hex) {
                colorDrafts[current] = Object.fromEntries(this.fieldsForColor(current).filter(f => Object.hasOwn(values, f.name)).map(f => [f.name, values[f.name]]));
                for (const field of this.fieldsForColor(current)) delete values[field.name];
                Object.assign(values, colorDrafts[hex] || {});
            }
			current = hex;
			body.textContent = "";
			let fields = this.annotationFields(hex);
			for (let f of fields) {
				let row = doc.createElement("div");
				this._styleStructuredField(row, f);
				let lab = doc.createElement("label");
				lab.textContent = f.label;
				let el;

// AI fields are displayed immediately but are not manually editable.
if (f.type === "ai") {
row.style.cssText = "display:flex;flex-direction:column;gap:2px;width:100%;";
lab.style.cssText = LABEL_CSS;
let aiValue = doc.createElement("div");
aiValue.className = "annota-creation-ai";
aiValue.textContent = "Not generated yet";
aiValue.style.cssText = FIELD_CSS + "opacity:.65;";
row.appendChild(lab);
row.appendChild(aiValue);
body.appendChild(row);
continue;
}

if (f.type === "multiselect") {
    el = this.createMultiSelect(doc, f, values[f.name], () => { values[f.name] = el.readValues(); sync(); });
    row.appendChild(lab); row.appendChild(el); body.appendChild(row); continue;
}
if (f.type === "check") {
					// Checkbox labels appear to the right on one line.
					row.style.cssText = "display:flex;align-items:center;gap:6px;width:100%;";
					el = doc.createElement("input");
					el.type = "checkbox";
					el.style.cssText = "margin:0;flex:none;";
					if (values[f.name]) el.checked = true;
					lab.style.cssText = "font-size:12px;opacity:.85;";
					row.appendChild(el);
					row.appendChild(lab);
				}
				else {
					row.style.cssText = "display:flex;flex-direction:column;gap:2px;width:100%;";
					lab.style.cssText = LABEL_CSS;
					if (f.type === "textarea") {
						el = doc.createElement("textarea");
						el.rows = 2;
						el.style.cssText = FIELD_CSS + "resize:vertical;min-height:38px;";
					}
					else if (f.type === "select") {
						el = doc.createElement("select");
						for (let o of [""].concat(f.options)) {
							let opt = doc.createElement("option");
							opt.value = o;
							opt.textContent = o || "—";
							el.appendChild(opt);
						}
						el.style.cssText = FIELD_CSS;
					}
					else {
						el = doc.createElement("input");
						el.type = "text";
						el.style.cssText = FIELD_CSS;
					}
					if (values[f.name] !== undefined) el.value = values[f.name];
					row.appendChild(lab);
					row.appendChild(el);
				}

				this._shieldFromReaderShortcuts(el, f.type);
				// Each field writes to a shared draft so values entered for one
				// color survive temporarily inspecting another color.
				let read = (f.type === "check")
					? () => (el.checked ? "true" : "")
					: () => String(el.value || "");
				let onEdit = () => { values[f.name] = read(); sync(); };
				el.addEventListener("input", onEdit);
				el.addEventListener("change", onEdit);
				body.appendChild(row);
			}
			renderHeader(hex);
			renderHint(hex, fields.length > 0);
			sync();
		};

		append(wrap);
		this._ensureAnnotationInterfaceStyles(doc);
		const nativeCapture = doc.querySelector?.(".selection-popup .annota-research-capture");
		if (nativeCapture) this._orderAnnotationControls(wrap, [nativeCapture, body, hint]);

		// Normal path: native swatch hover designates the color.
		// Keep the gesture hover, type, click without another confirmation.
		// Zotero owns the click and creates the annotation.
		let btns = this.readerColorButtons(wrap);
		if (btns) {
			this.COLORS.forEach((c, i) => {
				let btn = btns[i];
				if (!btn) return;
				// Include unconfigured colors so their hover clears the preceding
				// form and explains that no fields are configured.
				// Otherwise users may think the preceding values will be saved.
				let show = () => { if (current !== c.hex) renderGroup(c.hex); };
				btn.addEventListener("mouseenter", show);
				btn.addEventListener("focus", show);   // keyboard navigation
			});
			log("Field groups follow native reader swatches");
		}
		else {
			// Fallback when the popup structure cannot be recognized; do not guess.
			// on affiche nos propres pastilles.
			picker.style.display = "flex";
			let lab = doc.createElement("span");
			lab.textContent = this.t("form.fields");
			lab.style.cssText = "font-size:11px;opacity:.6;";
			picker.appendChild(lab);
			for (let c of colors) {
				let sw = doc.createElement("button");
				sw.type = "button";
				sw.title = c.name;
				sw.style.cssText = "width:14px;height:14px;padding:0;flex:none;"
					+ "border-radius:50%;border:1px solid rgba(128,128,128,.5);"
					+ "cursor:pointer;background:" + c.hex + ";";
				sw.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					renderGroup(c.hex);
				});
				picker.appendChild(sw);
			}
			log("Native swatches not recognized; fallback picker shown");
		}

		renderGroup(current);
	},

	// Reader annotation context menu.
	//
	// Use Zotero's official createAnnotationContextMenu reader event
	// to target a specific annotation from the sidebar,
	// rather than an entire document.
	// params.ids contains item keys, not numeric IDs; reader.js maps
	// annotation.key to annotation.id.

	_readerListener: null,

	registerReaderMenu() {
		try {
			if (!Zotero.Reader || !Zotero.Reader.registerEventListener) return;
			this._readerListener = (event) => {
				try {
					let { reader, params, append } = event;
					let keys = (params && params.ids) || [];
					if (!keys.length) return;
                    if(Annota.network)append({label:'Connect Research Evidence…',onCommand:()=>{
                        Promise.resolve().then(async()=>{const attachment=await Zotero.Items.getAsync(reader.itemID);const refs=keys.slice(0,24).map(key=>({kind:'annotation',key,library:AnnotaData.libraryIdentity(Zotero.Libraries.get(attachment.libraryID))}));await Annota.network.openSelection(Zotero.getMainWindow(),refs);}).catch(error=>{log(error);Services.prompt.alert(null,'Research Network',String(error.message||error));});
                    }});
					append({
						label: keys.length > 1
							? Annota.t("menu.reader.many", { n: keys.length })
							: Annota.t("menu.reader.one"),
						onCommand: () => {
							Annota.runOnReaderAnnotations(reader, keys)
								.catch(e => log("runOnReaderAnnotations: " + e));
						}
					});
					if (AnnotaSpell && AnnotaSpell.available()) {
						append({
							label: Annota.t("menu.reader.spell"),
							onCommand: () => {
								Annota.spellReaderAnnotations(reader, keys)
									.catch(e => Services.prompt.alert(window,"ResearchAnnotator",String(e.message||e)));
							}
						});
					}
					if (AnnotaChat) {
						append({
							label: Annota.t("menu.reader.ask"),
							onCommand: () => {
								AnnotaChat.quoteAnnotations(reader, keys)
									.catch(e => log("quoteAnnotations: " + e));
							}
						});
					}
				}
				catch (e) {
					log("createAnnotationContextMenu: " + e);
				}
			};
			Zotero.Reader.registerEventListener(
				"createAnnotationContextMenu", this._readerListener, "researchannotator@pino");
			log("Reader menu registered");
		}
		catch (e) {
			log("registerReaderMenu: " + e);
		}
	},

	unregisterReaderMenu() {
		try {
			if (this._readerListener && Zotero.Reader
					&& Zotero.Reader.unregisterEventListener) {
				Zotero.Reader.unregisterEventListener(
					"createAnnotationContextMenu", this._readerListener);
			}
		}
		catch (e) { /* ignore */ }
		this._readerListener = null;
	},

	// Structured annotation values displayed again by the reader
	// card through card-fields.js.
	rememberFields(item, built, comment) {
		if (!AnnotaCardFields || !built || !built.values) return;
		if (!Object.keys(built.values).length) return;
		try { AnnotaCardFields.remember(item, built.values, built.refs, comment); }
		catch (e) { log("rememberFields: " + e); }
	},

	// ---- Spelling and grammar (spell.js) ----

	async spellSelection(window) {
		if (!AnnotaSpell) return;
		let items = [];
		try { items = window.ZoteroPane.getSelectedItems() || []; } catch (e) {}
		let targets = await AnnotaSpell.targetsFromSelection(items);
		await AnnotaSpell.review(window, targets);
	},

	async spellReaderAnnotations(reader, keys) {
		if (!AnnotaSpell) return;
		let att = await Zotero.Items.getAsync(reader.itemID);
		if (!att) return;
		let targets = [];
		for (let key of keys) {
			let it = await Zotero.Items.getByLibraryAndKeyAsync(att.libraryID, key);
			let t = AnnotaSpell.targetFromItem(it);
			if (t) targets.push(t);
		}
		await AnnotaSpell.review(Zotero.getMainWindow(), targets);
	},

	// Run explicit generation for the targeted reader annotations.
	// The historical entry point now uses shared structured generation:
	// manual values and native Comment are preserved rather than
	// replaced by an unconstrained model response.
	async runOnReaderAnnotations(reader, keys, opts = {}) {
		let notReady = this.providerReadyError();
		if (notReady) {
			toast("ResearchAnnotator", notReady, "error");
			return;
		}
		let anns = [];
		try {
			let att = await Zotero.Items.getAsync(reader.itemID);
			if (!att) return;
			for (let key of keys) {
				let it = await Zotero.Items.getByLibraryAndKeyAsync(att.libraryID, key);
				if (it && it.isAnnotation && it.isAnnotation()) anns.push(it);
			}
		}
		catch (e) {
			log("runOnReaderAnnotations: key resolution: " + e);
			return;
		}
		if (!anns.length) return;
		return this.processAnnotations(anns, { overwrite: true, fields: opts.fields });
	},

	// Context menu: one integration per main window.

	_windows: new Map(),

	selectionIsRelevant(window) {
		try {
			let items = window.ZoteroPane.getSelectedItems();
			if (!items || !items.length) return false;
			return items.some(i =>
				(i.isAnnotation && i.isAnnotation())
				|| (i.isAttachment && i.isAttachment())
				|| (i.isNote && i.isNote())
				|| (i.isRegularItem && i.isRegularItem()));
		}
		catch (e) {
			return false;
		}
	},

	addToWindow(window) {
		try {
			if (typeof AnnotaResearchNotes !== "undefined") AnnotaResearchNotes.addToWindow(window);
			if (typeof AnnotaExplorer !== "undefined") AnnotaExplorer.addToWindow(window);
			if (this._windows.has(window)) return;
			let doc = window.document;
			let itemmenu = doc.getElementById("zotero-itemmenu");
			if (!itemmenu) return;

			let menu = doc.createXULElement("menu");
			menu.id = "annota-itemmenu";
			menu.setAttribute("label", "ResearchAnnotator");

			let popup = doc.createXULElement("menupopup");

			let missing = doc.createXULElement("menuitem");
			missing.setAttribute("label", this.t("menu.missing"));
			missing.addEventListener("command", () => {
				Annota.runBatch(window, { overwrite: false })
					.catch(e => Services.prompt.alert(window,"ResearchAnnotator",String(e.message||e)));
			});
			popup.appendChild(missing);

			let all = doc.createXULElement("menuitem");
			all.setAttribute("label", this.t("menu.all"));
			all.addEventListener("command", () => {
				Annota.runBatch(window, { overwrite: true })
					.catch(e => log("runBatch: " + e));
			});
			popup.appendChild(all);

			// Target retries to annotations marked as failed, recovering a
			// network interruption or unavailable model without regenerating
			// all completed values.
			let retry = doc.createXULElement("menuitem");
			retry.setAttribute("label", this.t("menu.retry"));
			retry.addEventListener("command", () => {
				Annota.runBatch(window, { failedOnly: true })
					.catch(e => log("runBatch: " + e));
			});
			popup.appendChild(retry);

			// Spelling/grammar review for selected Comments and notes.
			if (AnnotaSpell && AnnotaSpell.available()) {
				popup.appendChild(doc.createXULElement("menuseparator"));
				let spell = doc.createXULElement("menuitem");
				spell.setAttribute("label", this.t("menu.spell"));
				spell.addEventListener("command", () => {
					Annota.spellSelection(window).catch(e => log("Spelling: " + e));
				});
				popup.appendChild(spell);
			}

			// Historical dragged highlight templates are reduced to their
			// citation (citelink.js).
			if (AnnotaCiteLink) {
				popup.appendChild(doc.createXULElement("menuseparator"));
				let entries = [
					["menu.reduce.selection", () => AnnotaCiteLink.reduce(window,
						AnnotaCiteLink.notesOfSelection(window))],
					["menu.reduce.library", async () => AnnotaCiteLink.reduce(window,
						await AnnotaCiteLink.notesOfLibrary(window.ZoteroPane.getSelectedLibraryID()))],
					["menu.reduce.undo", () => AnnotaCiteLink.undoLast(window)]
				];
				for (let [key, run] of entries) {
					let mi = doc.createXULElement("menuitem");
					mi.setAttribute("label", this.t(key));
					mi.addEventListener("command", () => {
						Promise.resolve().then(run).catch(e => Services.prompt.alert(window,"ResearchAnnotator",String(e.message||e)));
					});
					popup.appendChild(mi);
				}
			}

			// Review annotations with missing fields and expose explicit AI completion.
			if (AnnotaReview && AnnotaCardFields) {
				popup.appendChild(doc.createXULElement("menuseparator"));
				for (let [key, run] of [
					["menu.review", () => AnnotaReview.startReview(window, false)],
					["menu.refill", () => AnnotaReview.startRefill(window)],
					["menu.refill.undo", () => AnnotaReview.undoRefill(window)]
				]) {
					let mi = doc.createXULElement("menuitem");
					mi.setAttribute("label", this.t(key));
					mi.addEventListener("command", () => {
						Promise.resolve().then(run).catch(e => Services.prompt.alert(window,"ResearchAnnotator",String(e.message||e)));
					});
					popup.appendChild(mi);
				}
			}

			for(const [label,run]of [['Research Workspace',()=>AnnotaWorkspace.open(window,'notes')],['Research Chat (selected notes as context)',async()=>{AnnotaChat.toggle(window,true);const instance=AnnotaChat.activeInstance(AnnotaChat._windows.get(window));if(!instance)throw Error('Open Research Chat and try again.');const scope=AnnotaResearchChat.selection(instance,'notes');instance.conv.groundedSources=scope;instance.conv.retrieval={...instance.conv.retrieval,evidenceMode:'notes'};AnnotaChat.touch(instance.conv);AnnotaChat.renderInstance(instance);}]]){const item=doc.createXULElement('menuitem');item.setAttribute('label',label);item.addEventListener('command',()=>Promise.resolve().then(run).catch(e=>Services.prompt.alert(window,'ResearchAnnotator',String(e.message||e))));popup.appendChild(item);}
            menu.appendChild(popup);
			itemmenu.appendChild(menu);

			// Tools entry reviews the entire selected library.
			let tools = doc.getElementById("menu_ToolsPopup");
			let toolsItem = null;
			if (tools && AnnotaReview && AnnotaCardFields && !this.workspace) {
				toolsItem = doc.createXULElement("menuitem");
				toolsItem.id = "annota-tools-review";
				toolsItem.setAttribute("label", this.t("menu.review.lib"));
				toolsItem.addEventListener("command", () => {
					AnnotaReview.startReview(window, true).catch(e => log("Annotation review: " + e));
				});
				tools.appendChild(toolsItem);
			}

			// Hide the entry when the selection cannot contain annotations.
			let onShowing = () => { const selected=window.ZoteroPane.getSelectedItems();menu.hidden=!Annota.selectionIsRelevant(window);const canAnnotations=selected.some(i=>i.isRegularItem?.()||i.isFileAttachment?.()||i.isAnnotation?.());for(const node of [missing,all,retry])node.hidden=!canAnnotations;for(const node of popup.children)if([Annota.t('menu.review'),Annota.t('menu.refill'),Annota.t('menu.refill.undo')].includes(node.getAttribute('label')))node.hidden=!canAnnotations; };
			itemmenu.addEventListener("popupshowing", onShowing);

			let collToggle = null;
			try { collToggle = this.addCollectionToggle(window); }
			catch (e) { log("Collection collapse button: " + e); }

			this._windows.set(window, { menu, itemmenu, onShowing, toolsItem, collToggle });
			log("Menu added to main window");
		}
		catch (e) {
			log("addToWindow: " + e);
		}
	},

	// Expand or collapse all collections.
	//
	// The collections toolbar chevrons collapse open collections in
	// the current library while leaving the library itself expanded;
	// if none are open, expand them all.
	// Zotero's "+" key.

	COLL_ICONS: {
		// Converging chevrons: collapse.
		collapse: "M5 3.5 8 6.5 11 3.5M5 12.5 8 9.5 11 12.5",
		// Outward chevrons indicate expansion.
		expand: "M5 6.5 8 3.5 11 6.5M5 9.5 8 12.5 11 9.5"
	},

	collIcon(kind) {
		let svg = "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'>"
			+ "<path d='" + this.COLL_ICONS[kind] + "' fill='none' stroke='context-fill'"
			+ " stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>";
		return "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")";
	},

	addCollectionToggle(window) {
		let doc = window.document;
		let bar = doc.getElementById("zotero-collections-toolbar");
		let add = doc.getElementById("zotero-tb-collection-add");
		if (!bar || doc.getElementById("annota-tb-collections-toggle")) return null;
		let b = doc.createXULElement("toolbarbutton");
		b.id = "annota-tb-collections-toggle";
		b.className = "zotero-tb-button";
		b.setAttribute("tabindex", "-1");
		b.style.setProperty("-moz-context-properties", "fill");
		b.style.setProperty("fill", "var(--fill-secondary)");
		let refresh = () => {
			let open = this.collectionsOpen(window);
			b.style.listStyleImage = this.collIcon(open ? "collapse" : "expand");
			let label = this.t(open ? "coll.collapse" : "coll.expand");
			b.setAttribute("tooltiptext", label);
			b.setAttribute("aria-label", label);
		};
		b.addEventListener("mouseenter", refresh);
		b.addEventListener("command", () => {
			this.toggleCollections(window).then(refresh, e => log("Collapse collections: " + e));
		});
		if (add && add.nextSibling) bar.insertBefore(b, add.nextSibling);
		else bar.appendChild(b);
		refresh();
		return b;
	},

	// Collection tree and current library row index.
	_collScope(window) {
		let tree = window.ZoteroPane && window.ZoteroPane.collectionsView;
		if (!tree || !tree._rowMap) return null;
		let libraryID = null;
		try {
			let r = tree.getRow(tree.selection.focused);
			libraryID = r && r.ref && r.ref.libraryID;
		}
		catch (e) {}
		if (!libraryID) libraryID = Zotero.Libraries.userLibraryID;
		let row = tree._rowMap["L" + libraryID];
		return row === undefined ? null : { tree, libraryID, row };
	},

	collectionsOpen(window) {
		let sc = this._collScope(window);
		if (!sc) return false;
		let { tree, libraryID, row } = sc;
		for (let i = row + 1; i < tree.rowCount; i++) {
			let r = tree.getRow(i);
			if (!r || !r.ref || r.ref.libraryID !== libraryID) break;
			if (tree.isContainer(i) && tree.isContainerOpen(i)) return true;
		}
		return false;
	},

	async toggleCollections(window) {
		let sc = this._collScope(window);
		if (!sc) return;
		let { tree, libraryID, row } = sc;
		if (!this.collectionsOpen(window)) {
			await tree.expandLibrary(libraryID, true);
			return;
		}
		// Like Zotero collapseLibrary, but keep the library expanded:
		// work bottom-up so row indexes remain valid.
		let last = row;
		while (last + 1 < tree.rowCount) {
			let r = tree.getRow(last + 1);
			if (!r || !r.ref || r.ref.libraryID !== libraryID) break;
			last++;
		}
		let closed = [];
		for (let i = last; i > row; i--) {
			if (tree.isContainer(i) && tree.isContainerOpen(i)) {
				closed.push(tree.getRow(i).id);
				await tree._closeContainer(i);
			}
		}
		closed.forEach(id => { delete tree._containerState[id]; });
		tree.tree.invalidate();
		tree._saveOpenStates();
	},

	removeFromWindow(window) {
		if(typeof AnnotaWorkspace!=="undefined")AnnotaWorkspace.removeFromWindow(window);
		if (typeof AnnotaResearchNotes !== "undefined") AnnotaResearchNotes.close(window);
		if (typeof AnnotaExplorer !== "undefined") AnnotaExplorer.close(window);
		let rec = this._windows.get(window);
		if (!rec) return;
		try { rec.itemmenu.removeEventListener("popupshowing", rec.onShowing); } catch (e) {}
		try { rec.menu.remove(); } catch (e) {}
		try { if (rec.toolsItem) rec.toolsItem.remove(); } catch (e) {}
		try { if (rec.collToggle) rec.collToggle.remove(); } catch (e) {}
		try { if (AnnotaReview) AnnotaReview.close(window); } catch (e) {}
		this._windows.delete(window);
	},

	removeFromAllWindows() {
		for (let window of Array.from(this._windows.keys())) {
			this.removeFromWindow(window);
		}
		this._windows.clear();
	},

	// Clean model output by removing code fences and excess whitespace.
	// Models may return Markdown despite instructions. Zotero annotation
	// rendering supports only a subset of tags; convert supported emphasis
	// to b, i and u instead of trusting the prompt to enforce formatting.
	// Leave native Comment separate from this structured presentation path.
	demarkdown(s) {
		// Remove code delimiters but retain their content.
		s = s.replace(/`([^`\n]+)`/g, "$1");
		// Parse bold before italic so double stars are consumed first.
		s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<b>$1</b>");
		s = s.replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?![\w])/g, "$1<b>$2</b>");
		s = s.replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, "$1<i>$2</i>");
		// Require word boundaries for Markdown underline to preserve field_names.
		s = s.replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])/g, "$1<i>$2</i>");
		// For headings and bullets, retain text without unsupported tags.
		s = s.replace(/^#{1,6}\s+/gm, "");
		s = s.replace(/^\s*[-*+]\s+/gm, "• ");
		return s;
	},

	// If a value is fully enclosed by formatting markup, strip that outer
	// markup when the configured field already owns its formatting.
	// Formatting belongs to the field definition rather than model output.
	unwrapWholeTag(v) {
		for (let i = 0; i < 2; i++) {
			let m = String(v).match(/^<(b|i|u)>([\s\S]*)<\/\1>$/);
			if (!m || m[2].includes("</" + m[1] + ">")) break;
			v = m[2].trim();
		}
		return v;
	},

	sanitize(raw) {
		let s = String(raw).trim();
		s = s.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "");
		s = this.demarkdown(s);
		s = s.replace(/\n{3,}/g, "\n\n").trim();
		return s;
	}
};

// ---- Extension lifecycle (Zotero 7) ----

// Chat is loaded at startup and stays null if loading fails;
// annotation functionality does not depend on it.
var AnnotaChat = null;

// UI localization comes from i18n.js; without it, t() returns the key.
var AnnotaI18n = null;

// Spelling/grammar service and live checking are provided by spell.js
// and spell-live.js for notes and annotation Comments.
var AnnotaSpell = null;
var AnnotaSpellLive = null;

// Per-color fields in reader annotation cards: card-fields.js.
var AnnotaCardFields = null;
// Navigate from a dragged note citation to its highlight: citelink.js.
var AnnotaCiteLink = null;

// Review missing annotation fields and request explicit AI: review.js.
var AnnotaReview = null;
var annotaLangObserver = null;

function install() {}

async function startup({ id, version, rootURI }) {
    migratePreferences();
    Annota.init({ id, version, rootURI });
	try { Services.scriptloader.loadSubScript(rootURI + "i18n.js"); }
	catch (e) { log("i18n.js : " + e); }
	try { Services.scriptloader.loadSubScript(rootURI + "palette.js"); }
	catch (e) { log("Custom palette unavailable; native colors retained: " + e); }
	try { Services.scriptloader.loadSubScript(rootURI + "data-manager.js"); }
	catch (e) { log("Data management unavailable: " + e); }
	Annota.registerReaderMenu();

	try {
		Services.scriptloader.loadSubScript(rootURI + "chat.js");
		AnnotaChat.register();
	}
	catch (e) {
		log("Chat unavailable: " + e);
		AnnotaChat = null;
	}
	try {
		Services.scriptloader.loadSubScript(rootURI + "citelink.js");
		AnnotaCiteLink.start();
	}
	catch (e) {
		log("Citation navigation unavailable: " + e);
		AnnotaCiteLink = null;
	}
	try { Services.scriptloader.loadSubScript(rootURI + "review.js"); }
	catch (e) {
		log("Review/refill unavailable: " + e);
		AnnotaReview = null;
	}
	try { Services.scriptloader.loadSubScript(rootURI + "spell.js"); }
	catch (e) {
		log("Spelling unavailable: " + e);
		AnnotaSpell = null;
	}
	try {
		Services.scriptloader.loadSubScript(rootURI + "card-fields.js");
		Services.scriptloader.loadSubScript(rootURI + "research-network.js");
		Services.scriptloader.loadSubScript(rootURI + "note-presentation.js"); Annota.notePresentation=AnnotaNotePresentation;
        Services.scriptloader.loadSubScript(rootURI + "infrastructure.js");
        AnnotaInfrastructure.installStorage();
	}
	catch (e) {
		log("Card fields unavailable: " + e);
		AnnotaCardFields = null;
	}
	if (AnnotaCardFields) {
		try {
            if (typeof AnnotaData !== "undefined") {
                try { await AnnotaData.recoverPendingImport(); AnnotaData.restoreGenerationStatus(); }
                catch (error) {
                    AnnotaData._recoveryError = error.message; AnnotaCardFields._maintenance = true;
                    throw error;
                }
            }
            if (typeof AnnotaPalette !== "undefined") await AnnotaPalette.migrateStorage();
            if (typeof AnnotaData !== "undefined") AnnotaData.restoreGenerationStatus();
            if (typeof AnnotaInfrastructure !== "undefined") {
                await AnnotaInfrastructure.init();
                AnnotaInfrastructure.installIntegrations();
                AnnotaInfrastructure.jobs.register("structured-ai", async (payload, control, job) => {
                    const item = await AnnotaInfrastructure.resolve(payload.annotation);
                    const fields = payload.fieldIds.filter(id => !(job.checkpoint?.completedFieldIds || []).includes(id));
                    try { await Annota.generateStructuredFields(item, { fieldIds: fields, regenerate: !!payload.regenerate, partial: true, control }); }
                    finally { if(payload.capture&&Annota.captureEvidence)try{await Annota.captureEvidence.recordAICompletion(item,payload.capture,fields);}catch(_){log('Capture AI checkpoint could not be updated; undo remains conservative.');} }
                    await control.progress(1);
                }, { paid: true });
                AnnotaInfrastructure.jobs.register("pdf-note", async (payload, control) => {
                    const library = AnnotaData.resolveLibrary(payload.library);
                    if (!library) throw Error("Library unavailable");
                    const attachment = await AnnotaData.annotation(library.libraryID, payload.attachmentKey);
                    control.check();
                    if (!attachment?.isAttachment?.() || attachment.deleted) throw Error("PDF unavailable");
                    await Annota._syncPaperResearchNote({ libraryID: library.libraryID, parentID: attachment.id, existingOnly: true });
                    await control.progress(1);
                });
                Annota.backgroundJobs = AnnotaInfrastructure.jobs;
                Annota.managedNotes = AnnotaInfrastructure.notes;
                Services.scriptloader.loadSubScript(rootURI + "research-notes.js");
                AnnotaResearchNotes.install();
                Annota.researchNotes=AnnotaResearchNotes;
                Services.scriptloader.loadSubScript(rootURI + "research-explorer.js");
                AnnotaExplorer.install();
                Annota.explorer = AnnotaExplorer;
                AnnotaNetwork.install();
                Services.scriptloader.loadSubScript(rootURI+'research-chat.js');
                await AnnotaResearchChat.install();
                Services.scriptloader.loadSubScript(rootURI+'color-mapper.js'); AnnotaColorMapper.install();
                Services.scriptloader.loadSubScript(rootURI+'evidence-capture.js'); AnnotaEvidenceCapture.install();
                Services.scriptloader.loadSubScript(rootURI+'research-chat-ui.js'); AnnotaResearchChatUI.install();
                Services.scriptloader.loadSubScript(rootURI+'research-chat-window.js'); AnnotaChatWindow.install();
            }
            await Annota.migrateLegacyGlobalFields();
        }
        catch (e) { Annota._workspaceInitializationError=String(e);log("Global fields migration deferred; legacy data retained: " + e); }
		AnnotaCardFields.register();
	}
    Annota.registerNotifier();
    try { Services.scriptloader.loadSubScript(rootURI+"research-workspace.js");Annota.workspace=AnnotaWorkspace; }
    catch(error){Annota._workspaceInitializationError=String(error);log("Workspace module initialization failed: "+error);Services.prompt.alert(null,"Research Workspace",String(error));}
    Annota.registerSelectionForm();
	try {
		Services.scriptloader.loadSubScript(rootURI + "spell-live.js");
		if (AnnotaSpell && AnnotaSpell.available()) AnnotaSpellLive.start();
	}
	catch (e) {
		log("Live spelling unavailable: " + e);
		AnnotaSpellLive = null;
	}

	// Expose the extension API to the preferences script.
	Zotero.Annota = Annota;

	// Language changes refresh menus and Chat.
	try {
annotaLangObserver = Zotero.Prefs.registerObserver("researchannotator.uiLanguage",
				() => { if (Annota) Annota.relocalize(); });
	}
	catch (e) { log("observateur de langue : " + e); }

	// The registered preference-pane ID powers Chat's settings button.
	Promise.resolve(Zotero.PreferencePanes.register({
		pluginID: "researchannotator@pino",
		src: rootURI + "preferences.xhtml",
		scripts: [rootURI + "preferences.js", rootURI + "preferences-data.js"],
		stylesheets: [rootURI + "preferences.css"],
		label: "ResearchAnnotator", image:rootURI+"research-settings.svg"
	})).then(id => { if (Annota) Annota.prefPaneID = id; })
		.catch(e => log("PreferencePanes.register: " + e));

	// Initialize main windows already open when the extension starts.
	for (let window of Zotero.getMainWindows()) {
		Annota.addToWindow(window);
		if (AnnotaChat) {
			try { AnnotaChat.addToWindow(window); }
			catch (e) { log("Chat window: " + e); }
		}
	}

	log("Started (v" + version + ")");
}

function onMainWindowLoad({ window }) {
	if (Annota) Annota.addToWindow(window);
	if (AnnotaChat) {
		try { AnnotaChat.addToWindow(window); }
		catch (e) { log("Chat window: " + e); }
	}
}

function onMainWindowUnload({ window }) {
	// Release closed windows to avoid retaining them in memory.
	if (Annota) Annota.removeFromWindow(window);
	if (AnnotaChat) {
		try { AnnotaChat.removeFromWindow(window); } catch (e) {}
	}
}

async function shutdown() {
    if(typeof AnnotaNetwork!=='undefined')AnnotaNetwork.stop();
    if(typeof AnnotaChatWindow!=="undefined")await AnnotaChatWindow.stop();
    if(typeof AnnotaWorkspace!=="undefined")AnnotaWorkspace.stop();
    if (typeof AnnotaExplorer !== "undefined") AnnotaExplorer.stop();
    if (typeof AnnotaResearchNotes !== "undefined") AnnotaResearchNotes.stop();
    if (Annota) Annota._shutdownNoteScopes = [...Annota._paperNoteSyncTimers?.keys() || []].map(key => {
        const [libraryID, parentID] = key.split(":").map(Number); return { libraryID, parentID, existingOnly: true };
    });
    if (Annota) { Annota.unregisterNotifier(); Annota.unregisterSelectionForm(); }
    if (typeof AnnotaInfrastructure !== "undefined" && AnnotaInfrastructure.state) {
        try { if(typeof AnnotaResearchChat!=='undefined')await AnnotaResearchChat.stop(); await AnnotaInfrastructure.stop(); } catch (error) { log("Shutdown flush failed; recovery snapshots retained: " + error); }
    }
    if (typeof AnnotaPalette !== "undefined") AnnotaPalette.stopLayouts();
	AnnotaReview = null;
	if (AnnotaCardFields) {
		try { AnnotaCardFields.unregister(); } catch (e) {}
	}
	AnnotaCardFields = null;
	if (AnnotaCiteLink) {
		try { AnnotaCiteLink.stop(); } catch (e) {}
	}
	AnnotaCiteLink = null;
	if (AnnotaSpellLive) {
		try { AnnotaSpellLive.stop(); } catch (e) {}
	}
	AnnotaSpellLive = null;
	if (annotaLangObserver) {
		try { Zotero.Prefs.unregisterObserver(annotaLangObserver); } catch (e) {}
		annotaLangObserver = null;
	}
	if (AnnotaChat) {
		try { AnnotaChat.unregister(); } catch (e) {}
	}
	AnnotaChat = null;
	if (Annota) {
		Annota.unregisterNotifier();
		Annota.unregisterReaderMenu();
		Annota.unregisterSelectionForm();
		Annota.removeFromAllWindows();
	}
	try { delete Zotero.Annota; } catch (e) {}
	Annota = undefined;
}

function uninstall() {}
