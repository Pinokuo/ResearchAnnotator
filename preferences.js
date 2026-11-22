/* eslint-disable no-undef */
// Preferences-panel script.
//
// Each highlight color has settings stored in the compatibility
// colorPrompts JSON map as { '#hex': { prompt, trigger } }.
// Area annotations use image:#hex entries in that same map.
// Compatibility: historical strings imply the Automatic trigger.
// Automatic generates missing AI fields on annotation creation.
// Manual requires an explicit generation action.
// Save configuration before switching colors; fields and templates also count.
// switching to another color.

(function () {
	// Zotero builds the preferences panel asynchronously, so retry until
	// its elements exist, with a strict bound. Closing the panel before
	// initialization completes must not leave an animation loop accessing
	// a destroyed document.
	const MAX_RETRIES = 120;   // Approximately two seconds at sixty frames per second.
	function retry(fn, tries) {
		if ((tries || 0) >= MAX_RETRIES) return;
		requestAnimationFrame(() => {
			try { fn((tries || 0) + 1); }
			catch (e) { /* The document closed during initialization. */ }
		});
	}

	const PREF_COLORS = "researchannotator.colorPrompts"; // Existing AI configuration
	const PREF_COLOR_LABELS = "researchannotator.colorLabels"; // Independent semantic color labels
	const PREF_PROVIDER = "researchannotator.provider";
	const XHTML_NS = "http://www.w3.org/1999/xhtml";

	function api() {
		try { return Zotero.Annota || null; }
		catch (e) { return null; }
	}

	function T(key, vars) {
		let a = api();
		return a && typeof a.t === "function" ? a.t(key, vars) : key;
	}

	// Callbacks that rebuild code-generated text when the language changes.
	const relocalizers = [];

	// Render translated text without innerHTML; only b, i and code
	// are recognized as markup, while everything else remains text.
	function fillMarkup(el, str) {
		el.textContent = "";
		let stack = [el];
		for (let part of String(str).split(/(<\/?(?:b|i|code)>)/)) {
			let m = part.match(/^<(\/?)(b|i|code)>$/);
			if (!m) {
				if (part) stack[stack.length - 1].appendChild(document.createTextNode(part));
			}
			else if (!m[1]) {
				let n = document.createElementNS(XHTML_NS, m[2]);
				stack[stack.length - 1].appendChild(n);
				stack.push(n);
			}
			else if (stack.length > 1) stack.pop();
		}
	}

	// English is the panel's original text. Cache it before translating
	// so switching back does not require a reload.
	const original = new WeakMap();
	function applyI18n() {
		let a = api();
		let lang = a && typeof a.lang === "function" ? a.lang() : "en";
		let dict = (a && a.i18n && a.i18n[lang]) || {};
		let root = document.getElementById("annota-prefs");
		if (root) root.setAttribute("lang", lang);
		for (let el of document.querySelectorAll("[data-i18n]")) {
			if (!original.has(el)) {
				original.set(el, Array.from(el.childNodes).map(n => n.cloneNode(true)));
			}
			let key = el.getAttribute("data-i18n");
			if (lang !== "en" && dict[key] != null) fillMarkup(el, dict[key]);
			else {
				el.textContent = "";
				for (let n of original.get(el)) el.appendChild(n.cloneNode(true));
			}
		}
		for (let el of document.querySelectorAll("[data-i18n-ph]")) {
			if (!el.hasAttribute("data-ph-en")) {
				el.setAttribute("data-ph-en", el.getAttribute("placeholder") || "");
			}
			let key = el.getAttribute("data-i18n-ph");
			el.setAttribute("placeholder", lang !== "en" && dict[key] != null
				? dict[key] : el.getAttribute("data-ph-en"));
		}
	}

	function relocalize() {
		applyI18n();
		for (let fn of relocalizers) {
			try { fn(); } catch (e) { /* panel is closing */ }
		}
	}

	function colors() {
		let a = api();
		return (a && Array.isArray(a.COLORS)) ? a.COLORS : [];
	}

	// Normalize a raw value to { prompt, trigger, template }.
	// A historical configuration can use a prompt or a template; without
	// {{ai}}, a template produces deterministic output without a request.
	function normalize(raw) {
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
		// A label alone names a color configuration without activating
		// generation; see getColorEntry.
		if (!prompt.trim() && !template.trim() && !fields.trim() && !["auto","manual"].includes(raw.trigger)) return null;
		return {
			prompt,
			template,
			fields,
			label: String(raw.label || "").trim(),
			trigger: raw.trigger === "manual" ? "manual" : "auto"
		};
	}

	function readColorMap() {
        if (api()?.palette) return api().palette.map();
		try {
			let raw = String(Zotero.Prefs.get(PREF_COLORS) || "").trim();
			if (!raw) return {};
			let obj = JSON.parse(raw);
			return (obj && typeof obj === "object") ? obj : {};
		}
		catch (e) {
			return {};
		}
	}

	function writeColorMap(map) {
		// Retain nonempty configuration entries, including saved trigger preferences.
		let clean = {};
		for (let k of Object.keys(map)) {
			let n = normalize(map[k]);
			if (n) clean[k] = n;
		}
		if (api()?.palette) api().palette.setMap(clean);
        Zotero.Prefs.set(PREF_COLORS, Object.keys(clean).length ? JSON.stringify(clean) : "");
	}

	// Independent semantic labels for PDF highlight colors.
// These are deliberately separate from AI prompts and configuration.
function readColorLabels() {
    if (api()?.palette) return api().palette.labels();
    try {
        let raw = String(Zotero.Prefs.get(PREF_COLOR_LABELS) || "").trim();
        if (!raw) return {};

        let obj = JSON.parse(raw);
        return (obj && typeof obj === "object" && !Array.isArray(obj))
            ? obj
            : {};
    }
    catch (e) {
        return {};
    }
}

function writeColorLabels(labels) {
    let clean = {};

    for (let hex of Object.keys(labels)) {
        let label = String(labels[hex] || "").trim();

        if (label) {
            clean[hex] = label;
        }
    }

    Zotero.Prefs.set(
        PREF_COLOR_LABELS,
        Object.keys(clean).length ? JSON.stringify(clean) : ""
    );
}

	// Tabs use HTML buttons and hidden attributes, matching the existing
	// provider selector. If initialization fails, leave panels visible
	// rather than make them inaccessible.
	function setupTabs(tries) {
		let bar = document.getElementById("annota-tabs");
		let panes = {
			colors: document.getElementById("annota-pane-colors"),
			ai: document.getElementById("annota-pane-ai"),
			chat: document.getElementById("annota-pane-chat"),
			general: document.getElementById("annota-pane-general"),
            data: document.getElementById("annota-pane-data")
		};
		if (!bar || !panes.colors || !panes.ai || !panes.chat || !panes.general) {
			retry(setupTabs, tries);
			return;
		}

		let tabs = Array.from(bar.querySelectorAll(".annota-tab"));
		if (!tabs.length) return;

		// Use the nearest opaque ancestor's background for the pinned header
		// so it blends into the preferences window.
		try {
			let view = bar.ownerDocument.defaultView;
			for (let n = bar.parentElement; n; n = n.parentElement) {
				let c = view.getComputedStyle(n).backgroundColor;
				if (c && c !== "transparent" && !/,\s*0\)$/.test(c)) {
					bar.style.setProperty("--annota-page-bg", c);
					break;
				}
			}
		}
		catch (e) { /* A transparent background has no effect here. */ }

		function apply(name) {
			for (let key of Object.keys(panes)) panes[key].hidden = (key !== name);
			for (let t of tabs) {
				let on = t.getAttribute("data-pane") === name;
				t.setAttribute("data-active", on ? "true" : "false");
				t.setAttribute("aria-selected", on ? "true" : "false");
				t.setAttribute("tabindex", on ? "0" : "-1");
			}
			let a = api();
			if (a) a._prefsTab = name;
		}

		for (let t of tabs) {
			t.addEventListener("click", () => apply(t.getAttribute("data-pane")));
			// Left/Right arrows move between tabs using tablist behavior.
			t.addEventListener("keydown", (e) => {
				if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
				e.preventDefault();
				let i = tabs.indexOf(t) + (e.key === "ArrowRight" ? 1 : -1);
				let next = tabs[(i + tabs.length) % tabs.length];
				next.focus();
				apply(next.getAttribute("data-pane"));
			});
		}
		// Reopening preferences returns to the last selected tab.
		let a = api();
		let last = a && a._prefsTab;
		apply(panes[last] ? last : "colors");
	}

	// Show only the active provider's configuration controls.
	// Write the preference explicitly because select has no reliable binding here.
	function setupProvider(tries) {
		let sel = document.getElementById("annota-provider");
		let panes = {
			openai: document.getElementById("annota-cfg-openai"),
			ollama: document.getElementById("annota-cfg-ollama"),
			apple: document.getElementById("annota-cfg-apple"),
			cli: document.getElementById("annota-cfg-cli")
		};
		if (!sel || !panes.openai || !panes.ollama || !panes.apple || !panes.cli) {
			retry(setupProvider, tries);
			return;
		}

		function current() {
			let p = String(Zotero.Prefs.get(PREF_PROVIDER) || "").trim();
			if (p === "openai" || p === "ollama" || p === "cli" || p === "apple") return p;
			// Compatibility with the historical checkbox.
			return Zotero.Prefs.get("researchannotator.useClaudeCLI") ? "cli" : "openai";
		}

		function apply(p) {
			for (let key of Object.keys(panes)) panes[key].hidden = (key !== p);
		}

		sel.value = current();
		apply(sel.value);
		sel.addEventListener("change", () => {
			Zotero.Prefs.set(PREF_PROVIDER, sel.value);
			apply(sel.value);
		});
	}

	// Read the actual installed Ollama models.
	// Model tags are significant; this avoids a model-not-found failure.
	function setupOllama(tries) {
		let sel = document.getElementById("annota-ollama-model");
		let btn = document.getElementById("annota-ollama-refresh");
		let status = document.getElementById("annota-ollama-status");
		if (!sel || !btn) {
			retry(setupOllama, tries);
			return;
		}

		const PREF_MODEL = "researchannotator.ollamaModel";
		const PREF_ENDPOINT = "researchannotator.ollamaEndpoint";

		function stored() {
			return String(Zotero.Prefs.get(PREF_MODEL) || "").trim();
		}

		// http://host:11434/v1/chat/completions → http://host:11434/api/tags
		function tagsURL() {
			let ep = String(Zotero.Prefs.get(PREF_ENDPOINT) || "").trim();
			if (!ep) return "http://localhost:11434/api/tags";
			return ep.replace(/\/v1\/.*$/, "") .replace(/\/+$/, "") + "/api/tags";
		}

		function setStatus(msg) {
			if (status) status.textContent = msg || "";
		}

		function fill(names) {
			let keep = stored();
			// Always preserve the saved model even if Ollama does not list it;
			// never silently clear a user's preference.
			if (keep && !names.includes(keep)) names = [keep].concat(names);
			sel.textContent = "";
			for (let n of names) {
				let opt = document.createElementNS(XHTML_NS, "option");
				opt.setAttribute("value", n);
				opt.textContent = n;
				sel.appendChild(opt);
			}
			if (keep) sel.value = keep;
			else if (names.length) {
				sel.value = names[0];
				Zotero.Prefs.set(PREF_MODEL, names[0]);
			}
		}

		async function refresh() {
			setStatus("…");
			try {
				let resp = await Zotero.HTTP.request("GET", tagsURL(),
					{ responseType: "json", timeout: 5000 });
				let models = (resp.response && resp.response.models) || [];
				let names = models.map(m => m && m.name).filter(Boolean);
				fill(names);
				setStatus(names.length
					? T("p.ollama.count", { n: names.length })
					: T("p.ollama.none"));
			}
			catch (e) {
				fill([]);
				setStatus(T("p.ollama.unreachable"));
			}
		}

		sel.addEventListener("change", () => {
			Zotero.Prefs.set(PREF_MODEL, sel.value);
			setStatus(T("p.saved"));
		});
		btn.addEventListener("click", refresh);

		fill([]);        // Initially show at least the saved value.
		refresh();       // Then query Ollama for installed models.
	}

	// Runtime schema parsing deliberately continues silently, but settings
	// must explain ignored definitions. Otherwise reserved names such as
	// page could disappear without any diagnostic.
	function renderLint(box, entry) {
		if (!box) return;
		let a = api();
		let problems = (a && typeof a.lintColorEntry === "function")
			? a.lintColorEntry(entry) : [];
		box.textContent = "";
		if (!problems.length) {
			box.hidden = true;
			box.removeAttribute("data-worst");
			return;
		}
		box.hidden = false;
		box.setAttribute("data-worst",
			problems.some(p => p.level === "error") ? "error" : "warn");
		for (let p of problems) {
			let row = document.createElementNS(XHTML_NS, "p");
			if (p.line) {
				let where = document.createElementNS(XHTML_NS, "span");
				where.setAttribute("class", "annota-lint-line");
				where.textContent = T("p.lint.line", { n: p.line });
				row.appendChild(where);
			}
			let icon = document.createElementNS(XHTML_NS, "span");
			icon.textContent = (p.level === "error" ? "⚠ " : "· ");
			row.appendChild(icon);
			row.appendChild(document.createTextNode(p.message));
			box.appendChild(row);
		}
	}

	// Visual field editor.
	//
	// The stored schema remains name | Label | type | options | format.
	// The visual editor reads and writes that format, preserving existing
	// settings and access to raw text in Advanced. Definitions the visual
	// editor cannot represent, including comments or invalid/reserved names,
	// remain in raw mode rather than being silently discarded.
	// Compatibility data is kept intact.

	const FIELD_TYPES = ["text", "textarea", "check", "select", "multiselect", "ai"];
	const FIELD_FORMATS = [
		["plain", "Aa"], ["bold", "B"], ["italic", "I"], ["bolditalic", "BI"], ["underline", "U"]
	];
	// Localized starter templates retain fixed internal variable names
	// so prompts referencing those names work in both UI languages.
	function fieldPresets() {
		return [
			{ label: T("fe.preset.1"), rows: [
				{ name: "heading", label: T("fe.preset.1.a"), type: "text", format: "bold" },
				{ name: "paraphrase", label: T("fe.preset.1.b"), type: "textarea", format: "plain" },
				{ name: "source", label: T("fe.preset.1.c"), type: "text", format: "italic" }] },
			{ label: T("fe.preset.2"), rows: [
				{ name: "concept", label: T("fe.preset.2.a"), type: "text", format: "bold" },
				{ name: "definition", label: T("fe.preset.2.b"), type: "textarea", format: "plain" }] },
			{ label: T("fe.preset.3"), rows: [
				{ name: "note", label: T("fe.preset.3.a"), type: "textarea", format: "plain" },
				{ name: "kind", label: T("fe.preset.3.b"), type: "select",
					options: T("fe.preset.3.opts"), format: "italic" }] }
		];
	}

	function el(tag, cls, text) {
		let e = document.createElementNS(XHTML_NS, tag);
		if (cls) e.setAttribute("class", cls);
		if (text != null) e.textContent = text;
		return e;
	}

	function btn(label, cls, title, onClick) {
		let b = el("button", cls, label);
		b.setAttribute("type", "button");
		if (title) {
			b.setAttribute("title", title);
			b.setAttribute("aria-label", title);
		}
		b.addEventListener("click", (e) => { e.preventDefault(); onClick(e); });
		return b;
	}

	// Derive a safe internal name from the label; reserved names such
	// as title or page get a prefix instead of being ignored.
	function slug(label, a) {
		let s = String(label || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
			.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
		if (!s) s = "field";
		if (/^\d/.test(s)) s = "f_" + s;
		let reserved = (a && a.RESERVED_VARS) || [];
		if (reserved.includes(s)) s = "my_" + s;
		return s;
	}

	// Draw the chevron instead of using Unicode arrows that can become
	// colored emoji on some systems.
	function chevron(up) {
		const SVG = "http://www.w3.org/2000/svg";
		let svg = document.createElementNS(SVG, "svg");
		svg.setAttribute("viewBox", "0 0 12 12");
		svg.setAttribute("width", "10");
		svg.setAttribute("height", "10");
		svg.setAttribute("aria-hidden", "true");
		let path = document.createElementNS(SVG, "path");
		path.setAttribute("d", up ? "M2.5 7.5 6 4l3.5 3.5" : "M2.5 4.5 6 8l3.5-3.5");
		path.setAttribute("fill", "none");
		path.setAttribute("stroke", "currentColor");
		path.setAttribute("stroke-width", "1.6");
		path.setAttribute("stroke-linecap", "round");
		path.setAttribute("stroke-linejoin", "round");
		svg.appendChild(path);
		return svg;
	}

	function cleanCell(s) {
		return String(s || "").replace(/\|/g, "/").replace(/\s*\n\s*/g, " ").trim();
	}

	function createFieldEditor({ host, textarea, templateArea, onChange, onCommit, getColor, stableNames = false }) {
		let a = api();
		let rows = [];
		// preferred is the user's choice; mode is the displayed editor.
		// Unsupported schemas must use text mode to avoid losing content.
		let preferred = "visual";
		let mode = preferred;

		let list = el("div", "annota-fe-list");
		let empty = el("div", "annota-fe-empty");
		let addBar = el("div", "annota-fe-addbar");
		let preview = el("div", "annota-fe-preview");
		let notice = el("p", "annota-fe-notice");
		let toggle = btn("", "annota-link", "", () => {
			preferred = mode === "visual" ? "text" : "visual";
			if (a) a._fieldsMode = preferred;
			setMode(preferred);
		});
		toggle.hidden = stableNames;
		let visual = el("div", "annota-fe");
		visual.appendChild(list);
		visual.appendChild(empty);
		visual.appendChild(addBar);
		visual.appendChild(preview);
		host.appendChild(visual);
		host.appendChild(notice);
		let foot = el("div", "annota-fe-foot");
		foot.appendChild(toggle);
		const advanced=el("details","annota-details"),advancedTitle=el("summary");advancedTitle.textContent="Advanced raw field schema";advanced.append(advancedTitle,foot,textarea);host.appendChild(advanced);

		let addBtn = btn(T("fe.add"), "annota-button annota-fe-add", T("fe.add.title"), () => {
			let base = T("fe.base", { n: rows.length + 1 });
			rows.push({ name: uniqueName(slug(base, a)), label: base, type: "text",
				format: "plain", options: "", prompt: "", nameEdited: false });
			write(true);
			render();
			let inputs = list.querySelectorAll(".annota-fe-label");
			let last = inputs[inputs.length - 1];
			if (last) { last.focus(); last.select(); }
		});
		addBar.appendChild(addBtn);

		function uniqueName(base, except) {
			let taken = new Set(rows.filter(r => r !== except).map(r => r.name));
			if (!taken.has(base)) return base;
			for (let i = 2; ; i++) if (!taken.has(base + i)) return base + i;
		}

		// Comments or lines ignored by parseFieldSchema cannot be faithfully
		// represented in visual mode.
		function unsupported(text) {
			let lines = String(text || "").split("\n").map(l => l.trim()).filter(Boolean);
			if (lines.some(l => l.startsWith("#"))) return true;
			return a ? a.parseFieldSchema(text).length !== lines.length : false;
		}

		function parse(text) {
			if (!a) return [];
			let instructions = {};
			try { instructions = JSON.parse(Zotero.Prefs.get("researchannotator.fieldEditorInstructions") || "{}"); } catch (_) {}
			return a.parseFieldSchema(text).map(f => ({
				id: f.id || (stableNames ? f.name : "c_" + a.fieldFingerprint(
					(getColor().kind === "image" ? "image:" : "") + getColor().hex + "/" + f.name)),
				name: f.name,
				label: f.label,
				type: f.type,
				format: f.format || "plain",
				options: (f.options || []).join(", "),
				prompt: f.type === "ai" ? f.prompt || "" : instructions[f.id || f.name] || "",
				nameEdited: f.name !== slug(f.label, a)
			}));
		}

		function serialize() {
			return rows.map(r => {
				if (stableNames && !/^g_/.test(r.name)) r.name = a.newFieldID();
				if (!r.id) r.id = stableNames ? r.name : a.newFieldID("c");
				let cols = [r.name, cleanCell(r.label) || r.name, r.type];
				let fmt = r.format && r.format !== "plain" ? r.format : "";
				if (["select", "multiselect"].includes(r.type)) { cols.push(cleanCell(r.options)); if (fmt) cols.push(fmt); }
				else if (r.type === "ai") { cols.push(cleanCell(r.prompt)); if (fmt) cols.push(fmt); }
				else if (fmt) cols.push(fmt);
				while (cols.length < 5) cols.push("");
				cols.push(r.id);
				return cols.join(" | ");
			}).join("\n");
		}

		// Commit structural changes immediately; debounce ordinary typing
		// through onChange.
		function write(commit) {
			textarea.value = serialize();
			let instructions = {};
			try { instructions = JSON.parse(Zotero.Prefs.get("researchannotator.fieldEditorInstructions") || "{}"); } catch (_) {}
			for (const row of rows) { if (row.prompt) instructions[row.id || row.name] = row.prompt; else delete instructions[row.id || row.name]; }
			Zotero.Prefs.set("researchannotator.fieldEditorInstructions", JSON.stringify(instructions));
			renderPreview();
			if (commit) onCommit(); else onChange();
		}

		// Preview the reader's actual annotation structure, including its
		// page heading, selected-color passage and structured fields,
		// rather than an unrelated abstract sample.
		function renderPreview() {
			preview.textContent = "";
			if (!rows.length) { preview.hidden = true; return; }
			preview.hidden = false;
			let c = (getColor && getColor()) || { hex: "#ffd400", name: "", label: "" };

			preview.appendChild(el("div", "annota-fe-preview-caption", T("fe.preview")));
			let card = el("div", "annota-fe-annot");
			card.style.setProperty("--annota-hl", c.hex);

			let head = el("div", "annota-fe-annot-head");
			let mark = el("span", "annota-fe-annot-mark");
			head.appendChild(mark);
			head.appendChild(el("span", "annota-fe-annot-page", T("fe.preview.page")));
			if (c.label || c.name) head.appendChild(el("span", "annota-fe-annot-tag", c.label || c.name));
			card.appendChild(head);

			card.appendChild(c.kind === "image"
				? el("div", "annota-fe-annot-area", T("fe.preview.area"))
				: el("div", "annota-fe-annot-text", T("fe.preview.passage")));

			let body = el("div", "annota-fe-annot-comment");
			if (templateArea && templateArea.value.trim()) {
				body.appendChild(el("span", "annota-fe-annot-note", T("fe.preview.layout")));
			}
			else {
				for (let r of rows) {
					let sample = r.type === "check" ? "✓ " + (r.label || r.name)
						: ["select", "multiselect"].includes(r.type) ? (r.options.split(",")[0] || "").trim() || r.label
						: r.type === "ai" ? (r.label || r.name)
						: r.label || r.name;
					let line = el("div");
					let node = line;
					if (r.format === "bold" || r.format === "bolditalic") {
						let b = el("b"); node.appendChild(b); node = b;
					}
					if (r.format === "italic" || r.format === "bolditalic") {
						let i = el("i"); node.appendChild(i); node = i;
					}
					if (r.format === "underline") {
						let u = el("u"); node.appendChild(u); node = u;
					}
					node.textContent = sample;
					if (r.type === "ai") {
						line.setAttribute("class", "annota-fe-annot-ai");
						line.setAttribute("title", T("fe.type.ai"));
					}
					body.appendChild(line);
				}
			}
			card.appendChild(body);
			preview.appendChild(card);
		}

		function renderRow(r, i) {
			let row = el("div", "annota-fe-row");
			row.setAttribute("data-type", r.type);

			let move = el("div", "annota-fe-move");
			let up = btn("", "annota-fe-icon", T("fe.up"), () => {
				[rows[i - 1], rows[i]] = [rows[i], rows[i - 1]];
				write(true); render();
			});
			let down = btn("", "annota-fe-icon", T("fe.down"), () => {
				[rows[i + 1], rows[i]] = [rows[i], rows[i + 1]];
				write(true); render();
			});
			up.appendChild(chevron(true));
			down.appendChild(chevron(false));
			up.disabled = i === 0;
			down.disabled = i === rows.length - 1;
			move.appendChild(up);
			move.appendChild(down);

			let label = el("input", "annota-input annota-fe-label");
			label.setAttribute("type", "text");
			label.setAttribute("placeholder", T("fe.label.ph"));
			label.setAttribute("aria-label", T("fe.label.aria"));
			label.value = r.label;

			let type = el("select", "annota-input annota-fe-type");
			type.setAttribute("aria-label", T("fe.type.aria"));
			for (let v of FIELD_TYPES) {
				let o = el("option", null, T("fe.type." + v));
				o.setAttribute("value", v);
				type.appendChild(o);
			}
			type.value = r.type;

			let fmt = el("div", "annota-fe-format");
			fmt.setAttribute("role", "group");
			fmt.setAttribute("aria-label", T("fe.fmt.aria"));
			for (let [v, txt] of FIELD_FORMATS) {
				let f = btn(txt, "annota-fe-fmt annota-fe-fmt-" + v, T("fe.fmt." + v), () => {
					r.format = v;
					for (let x of fmt.children) {
						x.setAttribute("aria-pressed", x === f ? "true" : "false");
					}
					write(true);
				});
				f.setAttribute("aria-pressed", r.format === v ? "true" : "false");
				fmt.appendChild(f);
			}

			let del = btn("×", "annota-fe-icon annota-fe-del", T("fe.remove"), () => {
				rows.splice(i, 1);
				write(true); render();
			});

			row.appendChild(move);
			row.appendChild(label);
			row.appendChild(type);
			row.appendChild(fmt);
			row.appendChild(del);

			// Show choices or model instructions according to the field type.
			if (["select", "multiselect"].includes(r.type)) {
				let opts = el("input", "annota-input annota-fe-extra");
				opts.setAttribute("type", "text");
				opts.setAttribute("placeholder", T("fe.choices.ph"));
				opts.setAttribute("aria-label", T("fe.choices.aria"));
				opts.value = r.options;
				opts.addEventListener("input", () => { r.options = opts.value; write(false); });
				row.appendChild(opts);
			}
			else if (r.type === "ai") {
				let pr = el("textarea", "annota-input annota-fe-extra");
				pr.setAttribute("rows", "2");
				pr.setAttribute("placeholder", T("fe.ai.ph"));
				pr.setAttribute("aria-label", T("fe.ai.aria"));
				pr.value = r.prompt;
				pr.addEventListener("input", () => { r.prompt = pr.value; write(false); });
				row.appendChild(pr);
			}

			// Derive the internal name from the label until the user edits it.
			let varLine = el("label", "annota-fe-var");
			varLine.hidden = stableNames;
			varLine.appendChild(el("span", null, T("fe.var")));
			let open = el("code", null, "{{");
			let name = el("input", "annota-fe-name");
			name.setAttribute("type", "text");
			name.setAttribute("aria-label", T("fe.var.aria"));
			name.setAttribute("spellcheck", "false");
			name.value = r.name;
			name.readOnly = stableNames;
			let fit = () => { name.style.width = (Math.max(3, name.value.length) + 1) + "ch"; };
			fit();
			let close = el("code", null, "}}");
			varLine.appendChild(open);
			varLine.appendChild(name);
			varLine.appendChild(close);
			row.appendChild(varLine);

			label.addEventListener("input", () => {
				r.label = label.value;
				if (!stableNames && !r.nameEdited) {
					r.name = uniqueName(slug(r.label, a), r);
					name.value = r.name;
					fit();
				}
				write(false);
			});
			name.addEventListener("input", () => {
				let v = name.value.replace(/[^\w]/g, "");
				if (v !== name.value) name.value = v;
				fit();
				let reserved = a && a.RESERVED_VARS && a.RESERVED_VARS.includes(v);
				name.setAttribute("data-invalid", !v || reserved ? "true" : "false");
				name.setAttribute("title", reserved ? T("fe.var.reserved", { v })
					: !v ? T("fe.var.required") : "");
				if (!v || reserved) return;
				r.name = v;
				r.nameEdited = v !== slug(r.label, a);
				write(false);
			});
			const changeType = () => {
				if (r.type === type.value) return;
				r.type = type.value;
				render();
				write(true);
			};
			type.addEventListener("input", changeType);
			type.addEventListener("change", changeType);
			return row;
		}

		function render() {
			list.textContent = "";
			rows.forEach((r, i) => list.appendChild(renderRow(r, i)));
			empty.textContent = "";
			empty.hidden = rows.length > 0;
			if (!rows.length) {
				empty.appendChild(el("span", "annota-help", T("fe.empty")));
				let chips = el("div", "annota-fe-presets");
				for (let p of fieldPresets()) {
					chips.appendChild(btn(p.label, "annota-fe-preset", T("fe.preset.title"), () => {
						rows = p.rows.map(x => Object.assign(
							{ options: "", prompt: "", nameEdited: true }, x));
						write(true);
						render();
					}));
				}
				empty.appendChild(chips);
			}
			renderPreview();
		}

		function setMode(m, silent) {
			if (m === "visual" && unsupported(textarea.value)) {
				m = "text";
				notice.textContent = T("fe.notice");
				notice.hidden = false;
			}
			else notice.hidden = true;
			if (m === "visual" && !silent) {
				rows = parse(textarea.value);
				render();
			}
			mode = m;if(m==="text")advanced.open=true;
			visual.hidden = m !== "visual";
			textarea.hidden = m === "visual";
			toggle.textContent = T(m === "visual" ? "fe.astext" : "fe.visual");
		}

		// Refresh after color loading, reset or external schema changes.
		function refresh() {
			rows = parse(textarea.value);
			render();
			setMode(preferred, true);
		}

		if (templateArea) templateArea.addEventListener("input", renderPreview);
		refresh();
		relocalizers.push(() => {
			addBtn.textContent = T("fe.add");
			addBtn.setAttribute("title", T("fe.add.title"));
			render();
			setMode(mode, true);
		});
		return { refresh, preview: renderPreview };
	}

	function setup(tries) {
		let textarea = document.getElementById("annota-prompt");
		let clearBtn = document.getElementById("annota-prompt-clear");
		let status = document.getElementById("annota-prompt-status");
		let swatchBox = document.getElementById("annota-swatches");
		let targetName = document.getElementById("annota-target-name");
		let idleWarning = document.getElementById("annota-idle-warning");
		let triggerRadios = Array.from(
			document.querySelectorAll('input[name="annota-trigger"]'));
		let templateArea = document.getElementById("annota-template");
		let fieldsArea = document.getElementById("annota-fields");
		let lintBox = document.getElementById("annota-lint");
		let labelInput = document.getElementById("annota-label");
		let semanticLabelInput = document.getElementById("annota-semantic-label");

		let editorHost = document.getElementById("annota-fields-editor");
		let kindBox = document.getElementById("annota-kind");
		let kindHelp = document.getElementById("annota-kind-help");

		if (!textarea || !swatchBox || triggerRadios.length < 2 || !templateArea || !fieldsArea
				|| !labelInput || !semanticLabelInput) {
			retry(setup, tries);
			return;
		}

		let palette = colors();
		if (!palette.length) {
			retry(setup, tries);
			return;
		}

		// Current color and annotation kind: text highlights or
		// image-area annotations.
		let current = palette[0].hex;
		let kind = "text";
		let keyOf = (hex) => kind === "image" ? "image:" + hex : hex;

		let flashTimer = null;
		function flashStatus(msg) {
			if (!status) return;
			status.textContent = msg;
			if (flashTimer) clearTimeout(flashTimer);
			flashTimer = setTimeout(() => { status.textContent = ""; }, 2000);
		}
// Semantic labels are stored independently of AI configuration.
let semanticSaveTimer = null;

function saveSemanticLabel() {
    let labels = readColorLabels();
    let label = String(semanticLabelInput.value || "").trim();

    if (label) {
        labels[current] = label;
    } else {
        delete labels[current];
    }

    writeColorLabels(labels);
}

function saveSemanticLabelNow() {
    if (semanticSaveTimer) {
        clearTimeout(semanticSaveTimer);
        semanticSaveTimer = null;
    }

    saveSemanticLabel();
}

function scheduleSemanticLabelSave() {
    if (semanticSaveTimer) {
        clearTimeout(semanticSaveTimer);
    }

    semanticSaveTimer = setTimeout(saveSemanticLabelNow, 800);
}
		function currentTrigger() {
			let on = triggerRadios.find(r => r.checked);
			return on && on.value === "manual" ? "manual" : "auto";
		}

		function setTrigger(v) {
			for (let r of triggerRadios) r.checked = (r.value === (v === "manual" ? "manual" : "auto"));
		}
		function updateTriggerVisibility() {
			const section=document.getElementById("annota-ai-trigger-section");
			if (!section) return;
			const globalDraft=document.getElementById("annota-global-fields");
			const globals=globalDraft ? api().parseFieldSchema(globalDraft.value) : api().getGlobalFields();
			section.hidden=![...api().parseFieldSchema(fieldsArea.value),...globals].some(field=>field.type==="ai") &&
				!(textarea.value.trim() && api().entryNeedsAI({prompt:textarea.value,template:templateArea.value,fields:fieldsArea.value}));
		}

		function save() {
			let map = readColorMap();
			let prompt = textarea.value;
			let template = templateArea.value;
			let fields = fieldsArea.value;
			// Configured when a prompt, template or field schema exists.
			if ((prompt && prompt.trim()) || (template && template.trim())
					|| (fields && fields.trim()) || currentTrigger() === "manual" || map[keyOf(current)]) {
				map[keyOf(current)] = { prompt, template, fields,
					label: String(labelInput.value || "").trim(),
					trigger: currentTrigger() };
			}
			else {
				delete map[keyOf(current)];
			}
			writeColorMap(map);
			flashStatus(T("p.saved"));
			refreshSwatches();
            api()?.refreshPaletteCounts?.();
		}

		// The color JSON preference is several kilobytes and Zotero writes
		// preferences to disk. Saving every keystroke repeatedly rewrote
		// the entire block and triggered Firefox warnings. Wait for a real
		// typing pause; blur and color changes flush immediately.
		// Keep validation immediate while deferring persistence.
		// This reduces writes without losing a completed editing gesture.
		function lintNow() {
			updateTriggerVisibility();
			renderLint(lintBox, {
				fields: fieldsArea.value,
				prompt: textarea.value,
				template: templateArea.value
			});
		}

		let saveTimer = null;
		function scheduleSave() {
			// Diagnostics should appear during typing rather than after the
			// debounce delay.
			lintNow();
			if (saveTimer) clearTimeout(saveTimer);
			saveTimer = setTimeout(saveNow, 2500);
		}
		function saveNow() {
			if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
			try { save(); }
			catch (error) {
				if (status) status.textContent = String(error.message || error) + " Complete the field configuration to save. Existing settings are retained.";
			}
		}

		function load(hex) {
			current = hex;

				let labels = readColorLabels();
				semanticLabelInput.value = labels[hex] || "";

				let entry = normalize(readColorMap()[keyOf(hex)]);
			textarea.value = entry ? entry.prompt : "";
			templateArea.value = entry ? (entry.template || "") : "";
			fieldsArea.value = entry ? (entry.fields || "") : "";
			labelInput.value = entry ? (entry.label || "") : "";
			setTrigger(entry ? entry.trigger : "auto");
			lintNow();
			if (editor) editor.refresh();
			if (targetName) {
				let c = palette.find(x => x.hex === hex);
				targetName.textContent = c ? c.name : hex;
			}
			refreshSwatches();
		}

		// Refresh color swatch status and the unconfigured-state warning.
		function refreshSwatches() {
			let map = readColorMap();
			// Check both annotation kinds: configured areas alone can make
			// the extension active.
			let anyPrompt = Object.keys(map).some(k => normalize(map[k]));
			for (let el of swatchBox.children) {
				let hex = el.getAttribute("data-color");
				let name = el.getAttribute("data-name") || hex;
				let entry = normalize(map[keyOf(hex)]);
				el.setAttribute("data-selected", hex === current ? "true" : "false");
                el.setAttribute("role", "radio"); el.setAttribute("aria-checked", String(hex === current));
                if (api()?.palette) {
                    api().palette.styleButton(el, { hex, label: readColorLabels()[hex] || name }, hex === current);
                    el.style.width = "auto"; el.style.height = "auto";
                }
				el.setAttribute("data-has-prompt", entry ? "true" : "false");
				let tip = entry
					? name + (entry.label ? " · " + entry.label : "") + ": "
						+ T(entry.trigger === "manual" ? "p.sw.manual" : "p.sw.auto")
					: name + ": " + T("p.sw.inactive");
				el.setAttribute("title", tip);
			}
			if (idleWarning) idleWarning.hidden = anyPrompt || !!api()?.getGlobalFields().length;
		}

		function renderSwatches() {
            swatchBox.replaceChildren();
		for (let c of palette) {
			let b = document.createElementNS(XHTML_NS, "button");
			b.setAttribute("type", "button");
			b.setAttribute("class", "annota-swatch");
			b.setAttribute("data-color", c.hex);
			b.setAttribute("data-name", c.name);
			b.style.backgroundColor = c.hex;
			b.addEventListener("click", () => {
				if (current === c.hex) return;

					saveNow();
					saveSemanticLabelNow();
					load(c.hex);
			});
			swatchBox.appendChild(b);
		}

        }
        renderSwatches();
        document.addEventListener?.("annota-preferences-flush", () => { saveNow(); saveSemanticLabelNow(); });
        document.addEventListener?.("annota-palette-changed", () => {
            palette = colors(); renderSwatches();
            load(palette.some(c => c.hex === current) ? current : palette[0].hex);
        });
		// --- Textarea ---
		textarea.addEventListener("input", scheduleSave);
		textarea.addEventListener("blur", saveNow);
		templateArea.addEventListener("input", scheduleSave);
		templateArea.addEventListener("blur", saveNow);
		fieldsArea.setAttribute("placeholder", "name | Label | type | options");
		fieldsArea.addEventListener("input", scheduleSave);
		fieldsArea.addEventListener("blur", saveNow);
		labelInput.addEventListener("input", () => {
			scheduleSave();
			if (editor) editor.preview();
		});
		labelInput.addEventListener("blur", saveNow);

		semanticLabelInput.addEventListener("input", scheduleSemanticLabelSave);
		semanticLabelInput.addEventListener("blur", saveSemanticLabelNow);
		// Save and restore the color-label display layout.
let colorLabelLayoutInput =
    document.getElementById("annota-color-label-layout");

if (colorLabelLayoutInput) {
    colorLabelLayoutInput.value =
        Zotero.Prefs.get("researchannotator.colorLabelLayout") || "wrap";

    colorLabelLayoutInput.addEventListener("change", () => {
        Zotero.Prefs.set(
            "researchannotator.colorLabelLayout",
            colorLabelLayoutInput.value
        );
        api()?.palette?.refreshLayouts();
    });
}
// Persistent ordering for generated PDF research notes.
let paperNoteSortInput =
    document.getElementById("annota-paper-note-sort");

if (paperNoteSortInput) {
    paperNoteSortInput.value =
        Zotero.Prefs.get("researchannotator.paperNoteSortOrder") || "pdf";

    paperNoteSortInput.addEventListener("change", () => {
        Zotero.Prefs.set(
            "researchannotator.paperNoteSortOrder",
            paperNoteSortInput.value
        );
    });
}

// Settings and legacy color-label files share the Data Management importer.
		// --- Trigger selection (automatic / manual) ---
		// Preserve trigger changes even for configurations with only global AI fields.
		for (let r of triggerRadios) {
			r.addEventListener("change", () => {
				saveNow();
			});
		}

		// --- Clear button ---
		if (clearBtn) {
			let clearColor = () => {
				let map = readColorMap();
				delete map[keyOf(current)];
				writeColorMap(map);
				textarea.value = "";
				templateArea.value = "";
				fieldsArea.value = "";
				labelInput.value = "";
				setTrigger("auto");
				lintNow();
				if (editor) editor.refresh();
				refreshSwatches();
                api()?.refreshPaletteCounts?.();
				flashStatus(T("p.cleared"));
			};
			clearBtn.addEventListener("click", clearColor);
		}

		let editor = editorHost ? createFieldEditor({
			host: editorHost,
			getColor: () => {
				let c = palette.find(x => x.hex === current);
				return { hex: current, name: c ? c.name : "", kind,
					label: String(labelInput.value || "").trim() };
			},
			textarea: fieldsArea,
			templateArea,
			onChange: scheduleSave,
			onCommit: () => { lintNow(); saveNow(); }
		}) : null;

		// --- Type d'annotation ---
		if (kindBox) {
			for (let b of kindBox.querySelectorAll("[data-kind]")) {
				b.addEventListener("click", () => {
					let k = b.getAttribute("data-kind") === "image" ? "image" : "text";
					if (k === kind) return;

					saveNow();
					saveSemanticLabelNow();
					kind = k;
					for (let x of kindBox.querySelectorAll("[data-kind]")) {
						x.setAttribute("aria-pressed", x === b ? "true" : "false");
					}
					if (kindHelp) kindHelp.hidden = kind !== "image";
					load(current);
				});
			}
		}

        api().colorPreferences = {
            refreshTrigger: updateTriggerVisibility,
            select(hex) { saveNow(); saveSemanticLabelNow(); load(hex); },
            flush() { saveNow(); saveSemanticLabelNow(); }
        };
		load(current);
		relocalizers.push(() => { lintNow(); refreshSwatches(); });
	}

	// ---- Discussion ----
	// Write Chat provider and instructions explicitly, like annotation
	// provider settings, because these controls lack reliable preference bindings.
	// liaison « preference » fiable.
	function setupChat(tries) {
		let sel = document.getElementById("annota-chat-provider");
		let state = document.getElementById("annota-chat-provider-status");
		let area = document.getElementById("annota-chat-instructions");
		let status = document.getElementById("annota-chat-status");
		if (!sel || !area) {
			retry(setupChat, tries);
			return;
		}
		const PREF = "researchannotator.chatProvider";
		const PREF_INSTR = "researchannotator.chatInstructions";
		const KNOWN = ["openai", "ollama", "cli", "apple"];
		const NAMES = { openai: "Mistral / API", ollama: "Ollama", cli: "Claude Code CLI",
			apple: "Apple Intelligence" };
		relocalizers.push(() => { describe(); hint(); });

		function describe() {
			if (!state) return;
			let a = api();
			if (!a) { state.textContent = ""; return; }
			let p = KNOWN.includes(sel.value) ? sel.value : a.provider();
			let err = a.providerReadyError(p);
			state.textContent = err ? T("p.chat.notready", { err })
				: sel.value ? T("p.chat.ready") : T("p.chat.current", { name: NAMES[p] || p });
		}

		// For empty model settings, show the model that will actually be used.
		let hints = {
			"annota-chat-model": ["researchannotator.model", "mistral-large-latest"],
			"annota-chat-ollama-model": ["researchannotator.ollamaModel", "llama3.1"]
		};
		function hint() {
			for (let id of Object.keys(hints)) {
				let el = document.getElementById(id);
				if (!el) continue;
				let [pref, fallback] = hints[id];
				let m = String(Zotero.Prefs.get(pref) || "").trim() || fallback;
				el.setAttribute("placeholder", T("p.sameai", { m }));
			}
		}
		hint();

		let stored = String(Zotero.Prefs.get(PREF) || "").trim();
		sel.value = KNOWN.includes(stored) ? stored : "";
		describe();
		sel.addEventListener("change", () => {
			Zotero.Prefs.set(PREF, sel.value);
			describe();
		});

		area.value = String(Zotero.Prefs.get(PREF_INSTR) || "");
		let timer = null;
		function save() {
			if (timer) { clearTimeout(timer); timer = null; }
			Zotero.Prefs.set(PREF_INSTR, area.value);
			if (status) {
				status.textContent = T("p.saved");
				setTimeout(() => { status.textContent = ""; }, 2000);
			}
		}
		area.addEventListener("input", () => {
			if (timer) clearTimeout(timer);
			timer = setTimeout(save, 1500);
		});
		area.addEventListener("blur", save);
	}

	// ---- Liaison data-pref ----
	// Controls with data-pref display their preference and write changes
	// while preserving the original type: integers stay integers,
	// historical string temperatures stay strings, and checkboxes
	// write booleans. Invalid numeric input is not persisted
	// as NaN.
	function bindPrefs(tries) {
		let els = Array.from(document.querySelectorAll("[data-pref]"));
		if (!els.length) {
			retry(bindPrefs, tries);
			return;
		}
		for (let el of els) {
			let key = el.getAttribute("data-pref");
			let cur = Zotero.Prefs.get(key);
			let isBox = el.type === "checkbox";
			if (isBox) el.checked = !!cur;
			else el.value = (cur === undefined || cur === null) ? "" : String(cur);

			let write = () => {
				let v;
				if (isBox) v = !!el.checked;
				else if (typeof cur === "number") {
					v = el.step && /\./.test(el.step) ? parseFloat(el.value) : parseInt(el.value, 10);
					if (isNaN(v)) return;
				}
				else v = String(el.value);
				Zotero.Prefs.set(key, v);
				cur = v;
			};
            document.addEventListener?.("annota-settings-imported", () => {
                cur = Zotero.Prefs.get(key);
                if (isBox) el.checked = !!cur; else el.value = cur === undefined || cur === null ? "" : String(cur);
            });
			el.addEventListener(isBox ? "change" : "input", write);
			if (!isBox) el.addEventListener("change", write);
		}
	}

	// Hide API credentials by default, with an explicit temporary reveal action.
	function setupKeyToggle(tries) {
		let input = document.getElementById("annota-apikey");
		let btn = document.getElementById("annota-apikey-show");
		if (!input || !btn) {
			retry(setupKeyToggle, tries);
			return;
		}
		btn.addEventListener("click", () => {
			let show = input.type === "password";
			input.type = show ? "text" : "password";
			btn.textContent = T(show ? "p.hide" : "p.show");
		});
	}

	// Detect Claude Code CLI paths, models and effort levels.

	const CLI_KNOWN = { opus: "p.cli.desc.opus", sonnet: "p.cli.desc.sonnet",
		haiku: "p.cli.desc.haiku", fable: "" };
	const EFFORT_FALLBACK = ["low", "medium", "high", "xhigh", "max"];
	let cliPickers = [];

	function cliCaps() {
		let a = api();
		return (a && typeof a.cliCaps === "function" && a.cliCaps()) || null;
	}

	// Model and effort controls are bound to separate preferences.
	// inherit labels the empty choice, such as Default or Same as AI tab.
	function cliPicker({ select, other, effortHost, effortNote, modelPref, effortPref, inherit }) {
		const OTHER = "__other__";
		function build() {
			let caps = cliCaps();
			let stored = String(Zotero.Prefs.get(modelPref) || "").trim();
			let names = ((caps && caps.models) || []).slice();
			for (let k of Object.keys(CLI_KNOWN)) {
				if (k !== "fable" && !names.includes(k)) names.push(k);
			}
			select.textContent = "";
			let add = (v, l) => {
				let o = document.createElementNS(XHTML_NS, "option");
				o.setAttribute("value", v);
				o.textContent = l;
				select.appendChild(o);
			};
			add("", T(inherit));
			for (let n of names) add(n, n + (CLI_KNOWN[n] ? " (" + T(CLI_KNOWN[n]) + ")" : ""));
			add(OTHER, T("p.cli.other"));
			let isOther = stored && !names.includes(stored);
			select.value = isOther ? OTHER : stored;
			other.hidden = !isOther;
			if (isOther) other.value = stored;

			// Show effort only if the CLI advertises it, or before capabilities
			// are known, when the known levels are offered provisionally.
			effortHost.textContent = "";
			let supported = !caps || caps.effort;
			let levels = (caps && caps.efforts && caps.efforts.length) ? caps.efforts : EFFORT_FALLBACK;
			let cur = String(Zotero.Prefs.get(effortPref) || "").trim();
			if (effortNote) {
				effortNote.textContent = T(supported ? "p.cli.effortdefault" : "p.cli.noeffort");
			}
			effortHost.hidden = !supported;
			if (!supported) return;
			for (let v of [""].concat(levels)) {
				let b = document.createElementNS(XHTML_NS, "button");
				b.setAttribute("type", "button");
				b.setAttribute("class", "annota-seg-btn");
				b.textContent = v ? T("p.eff." + v) : T(inherit === "p.cli.same" ? "p.cli.btn.same" : "p.cli.btn.default");
				b.setAttribute("title", v ? "--effort " + v : T(inherit));
				b.setAttribute("aria-pressed", v === cur ? "true" : "false");
				b.addEventListener("click", () => {
					Zotero.Prefs.set(effortPref, v);
					for (let x of effortHost.children) {
						x.setAttribute("aria-pressed", x === b ? "true" : "false");
					}
				});
				effortHost.appendChild(b);
			}
		}
		select.addEventListener("change", () => {
			let v = select.value;
			other.hidden = v !== OTHER;
			if (v === OTHER) { other.focus(); return; }
			Zotero.Prefs.set(modelPref, v);
		});
		other.addEventListener("input", () => {
			Zotero.Prefs.set(modelPref, String(other.value || "").trim());
		});
		build();
		cliPickers.push(build);
	}

	function setupCLI(tries) {
		let detect = document.getElementById("annota-cli-detect");
		let status = document.getElementById("annota-cli-status");
		let pathInput = document.getElementById("annota-cli-path");
		let sel = document.getElementById("annota-cli-model");
		let chatSel = document.getElementById("annota-chat-cli-model");
		if (!detect || !sel || !chatSel || !pathInput) {
			retry(setupCLI, tries);
			return;
		}
		cliPicker({
			select: sel, other: document.getElementById("annota-cli-model-other"),
			effortHost: document.getElementById("annota-cli-effort"),
			effortNote: document.getElementById("annota-cli-effort-note"),
			modelPref: "researchannotator.cliModel", effortPref: "researchannotator.cliEffort",
			inherit: "p.cli.default"
		});
		cliPicker({
			select: chatSel, other: document.getElementById("annota-chat-cli-model-other"),
			effortHost: document.getElementById("annota-chat-cli-effort"),
			modelPref: "researchannotator.chatCliModel", effortPref: "researchannotator.chatCliEffort",
			inherit: "p.cli.same"
		});

		function describe(caps) {
			if (!status) return;
			status.textContent = caps ? T("p.cli.found", { v: caps.version, path: caps.path })
				: T("p.cli.notdetected");
		}
		describe(cliCaps());
		relocalizers.push(() => { describe(cliCaps()); for (let b of cliPickers) b(); });

		let busy = false;
		async function run(auto) {
			let a = api();
			if (busy || !a || typeof a.probeCLI !== "function") return;
			busy = true;
			if (!auto) status.textContent = T("p.cli.looking");
			try {
				let caps = await a.probeCLI(pathInput.value);
				// Adopt the discovered path when it differs from the entered path.
				if (caps.path && caps.path !== pathInput.value.trim()) {
					pathInput.value = caps.path;
					Zotero.Prefs.set("researchannotator.cliPath", caps.path);
				}
				describe(caps);
				for (let b of cliPickers) b();
			}
			catch (e) {
				if (!auto) status.textContent = "⚠ " + (e.message || e);
			}
			finally { busy = false; }
		}
		detect.addEventListener("click", () => run(false));
		// On first opening, inspect the CLI automatically without showing
		// an error merely because it is not installed.
		if (!cliCaps()) run(true);
	}

	// Apply the selected UI language on load and after selection changes.
	function setupLanguage(tries) {
		let sel = document.getElementById("annota-ui-lang");
		if (!sel) {
			retry(setupLanguage, tries);
			return;
		}
		applyI18n();
		// bootstrap.js rebuilds menus and Chat; translate this open panel
		// after allowing bindPrefs to write the preference first.
		// The delay preserves that ordering.
		sel.addEventListener("change", () => setTimeout(relocalize, 0));
	}

	// The macOS spelling configuration is not relevant on other platforms.
	function setupSpell(tries) {
		let card = document.getElementById("annota-spell-card");
		if (!card) {
			retry(setupSpell, tries);
			return;
		}
		let mac = false;
		try { mac = !!Zotero.isMac; } catch (e) {}
		card.hidden = !mac;
	}

	function setupGlobalFields(tries) {
		const host = document.getElementById("annota-global-fields-editor");
		const textarea = document.getElementById("annota-global-fields");
		const status = document.getElementById("annota-global-fields-status"), a = api();
		if (!host || !textarea || !a) { retry(setupGlobalFields, tries); return; }
		textarea.value = a.getGlobalFields().map(f => [f.id, f.label, f.type,
			f.type === "ai" ? cleanCell(f.prompt) : (f.options || []).join(", "), f.format || "plain", f.id].join(" | ")).join("\n");
		const save = () => {
			try {
				const errors = a.validateFieldSchema(textarea.value).filter(e => e.level === "error");
				if (errors.length) throw new Error(errors.map(e => e.message).join("; "));
				const old = new Map(a.getGlobalFields().map(f => [f.id, f]));
				a.saveGlobalFields(a.parseFieldSchema(textarea.value).map(f => ({ ...old.get(f.name),
					id: f.name, label: f.label, type: f.type, options: f.options, format: f.format, prompt: f.prompt })));
				status.textContent = T("p.saved");
				a.colorPreferences?.refreshTrigger();
			}
			catch (error) { status.textContent = error.message || String(error); }
		};
		const globalEditor = createFieldEditor({ host, textarea, stableNames: true, onChange: save, onCommit: save,
			getColor: () => ({ name: "Global fields", hex: "#77999a" }) });
        document.addEventListener?.("annota-settings-imported", () => {
            textarea.value = a.getGlobalFields().map(f => [f.id, f.label, f.type,
                f.type === "ai" ? cleanCell(f.prompt) : (f.options || []).join(", "), f.format || "plain", f.id].join(" | ")).join("\n");
            globalEditor.refresh();
        });
	}

	bindPrefs();
	setupSpell();
	setupLanguage();
	setupKeyToggle();
	setupCLI();
	setupTabs();
	setup();
	setupGlobalFields();
	setupProvider();
	setupOllama();
	setupChat();
})();
