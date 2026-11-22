/* eslint-disable no-undef */
// Structured color fields in reader sidebar annotation cards,
// alongside the independent native Comment control.
//
// Use the official renderSidebarAnnotationHeader hook to locate
// the annotation card from its header attachment.
// Insert the form after the source passage, retaining native
// Comment independently. A MutationObserver restores placement
// when the reader redraws a card without invoking the hook,
// including selection changes.
// Show the form under the existing card visibility rules.
// Do not treat native Comment as the structured field store.
//
// Empty fields may be omitted from historical formatted output,
// so structured values are persisted per annotation in the
// compatibility file annota-fields.json. Older structured layouts
// can be parsed conservatively by field order and format.
// Unknown manually authored/custom content retains the native
// editor; never rewrite content that cannot be interpreted safely.
// Historical reads are migration input, not ordinary Comment writes.

var AnnotaCardFields = {
	_listener: null,
	_store: null,
	_loading: null,
	_saveTimer: null,
	_writeQueue: Promise.resolve(),
	_saveQueue: Promise.resolve(),
	_views: new Map(),
	_generationStates: new Map(),
	_fieldGenerationStates: new Map(),

	// Structured value persistence.

	file() {
		let dir;
		try { dir = Zotero.DataDirectory.dir; } catch (e) {}
		if (!dir) dir = Zotero.getTempDirectory().path;
		return PathUtils.join(dir, "annota-fields.json");
	},

	load() {
        if (this._store) return Promise.resolve(this._store);
        if (this._loading) return this._loading;

        this._loading = (async () => {
                let data = {};
                let migrated = false;

                try {
                        if (await IOUtils.exists(this.file())) {
                                let j = await IOUtils.readJSON(this.file());
                                if (j && j.annotations && typeof j.annotations === "object" && !Array.isArray(j.annotations)) {
                                        data = j.annotations;
                                        if (![2, 3].includes(j.version)) migrated = true;
                                }
                                else throw new Error("Invalid structured field storage format");
                        }
                }
                catch (e) {
                        // Never replace an unreadable store with an empty one.
                        this._loading = null;
                        throw new Error("Structured field storage could not be read: " + e);
                }

                for (let [key, record] of Object.entries(data)) {
                        if (!record || typeof record !== "object") continue;

                        if (record.colors && typeof record.colors === "object") {
                                let normalized = {};
                                for (let [color, value] of Object.entries(record.colors)) {
                                        if (!value || typeof value !== "object") continue;
                                        normalized[String(color).toLowerCase()] = value;
                                }
                                record.colors = normalized;
                                record.version = 2;
                                continue;
                        }

                        if (record.values && typeof record.values === "object") {
                                let color = String(record.color || "").toLowerCase();
                                if (color) {
                                        data[key] = {
                                                version: 2,
                                                colors: {
                                                        [color]: {
                                                                values: record.values,
                                                                references: record.references || "",
                                                                comment: record.comment || ""
                                                        }
                                                }
                                        };
                                        migrated = true;
                                }
                        }
                }

                this._store = data;

                if (migrated) {
                        log("Card fields: migrating stored values to color-aware version 2");
                        this.persist();
                }

                return data;
        })();

        return this._loading;
},

persist() {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
                this._saveTimer = null;
                const task = this._saveQueue.catch(() => {}).then(() => this.writeStore(this._store || {}));
                this._saveQueue = task;
                task.catch(e => log("Card fields: " + e));
        }, 1000);
},

writeStore(store) {
        // Serialize writes so the shared temporary path is never used concurrently.
        const snapshot = JSON.parse(JSON.stringify({ version: 2, annotations: store }));
        const write = this._writeQueue.catch(() => {}).then(() =>
                IOUtils.writeJSON(this.file(), snapshot, { tmpPath: this.file() + ".tmp", flush: true }));
        this._writeQueue = write;
        return write;
},

saveValues(item, patch, references, expected, metadata, { strictExpected = false } = {}) {
        if (this._maintenance) return Promise.reject(new Error("Data import is in progress. Retry editing after it completes."));
        if (item.library?.editable === false || item.deleted) {
                return Promise.reject(new Error("Annotation is read-only or unavailable."));
        }
        // New individual-annotation paths acknowledge a successful disk write.
        // Legacy batch/review remember() callers retain their existing behavior.
        const identity = { libraryID: item.libraryID, key: item.key,
                annotationColor: item.annotationColor, annotationType: item.annotationType };
        const changes = Object.assign({}, patch);
        const task = this._saveQueue.catch(() => {}).then(async () => {
                await this.load();
                if (item.deleted || Annota._deletedAnnotationKeys?.has(item.libraryID + ":" + item.key)) throw new Error("Annotation is unavailable.");
                const key = this.keyOf(identity.libraryID, identity.key);
                const color = this.colorKeyOf(identity);
                const previous = this.get(identity) || { values: {}, references: "", comment: "" };
                const values = Object.assign({}, previous.values);
                const applied = new Set();
                for (const [name, value] of Object.entries(changes)) {
                        // AI results must not overwrite a value changed while the request ran.
                        if (expected && JSON.stringify(values[name] === undefined ? "" : values[name]) !== JSON.stringify(expected[name] === undefined ? "" : expected[name])) {
                            if (strictExpected) throw new Error("This field changed in another view. Reload before saving; your draft is retained.");
                            continue;
                        }
                        values[name] = value;
                        applied.add(name);
                }
                const record = { values: {}, references: references === undefined
                        ? previous.references : references, comment: previous.comment };
                const snapshot = JSON.parse(JSON.stringify(this._store));
                if (!snapshot[key]) snapshot[key] = { version: 2, colors: {} };
                if (!snapshot[key].colors) snapshot[key].colors = {};
                const globalValues = Object.assign({}, snapshot[key].globalValues || {});
                const stableColor = typeof AnnotaPalette !== "undefined" ? AnnotaPalette.storageKey(color) : null;
                const oldColor = (stableColor && snapshot[key].colorConfigs?.[stableColor]) || snapshot[key].colors[color] || {};
                record.valuesByID = Object.assign({}, oldColor.valuesByID || {});
                for (const [name, value] of Object.entries(values)) {
                        const field = Annota.fieldByName(identity, name);
                        if (field?.scope === "global" || Object.hasOwn(globalValues, name)) globalValues[name] = value;
                        else {
                                record.values[name] = value;
                                if (field?.id && (applied.has(name) || field.name === name || !Object.hasOwn(record.valuesByID, field.id))) record.valuesByID[field.id] = value;
                        }
                }
                snapshot[key].globalValues = globalValues;
                snapshot[key].colors[color] = { ...oldColor, ...record };
                if (stableColor) snapshot[key].colorConfigs = { ...(snapshot[key].colorConfigs || {}), [stableColor]: snapshot[key].colors[color] };
                if (metadata) {
                        const accepted = {};
                        for (const [id, value] of Object.entries(metadata)) {
                                if ([...applied].some(name => Annota.fieldByName(identity, name)?.id === id)) accepted[id] = value;
                        }
                        snapshot[key].aiMetadata = { ...(snapshot[key].aiMetadata || {}), ...accepted };
                }
                await this.writeStore(snapshot);
                this._store[key] = snapshot[key];
                this.refreshViews();
                return this.get(identity);
        });
        this._saveQueue = task;
        return task;
},

watch(element, refresh) {
        this._views.set(element, refresh);
},

generationState(item) {
        if (!item) return {};
        return this._generationStates.get(this.keyOf(item.libraryID, item.key) + "/" + this.colorKeyOf(item)) || {};
},

fieldState(item, field) {
        if (!item) return {};
        const prefix = this.keyOf(item.libraryID, item.key) + "/";
        const found = this._fieldGenerationStates.get(this.fieldStateKey(item, field));
        if (found) return found;
        if (typeof AnnotaInfrastructure !== "undefined") {
                const lifecycle = AnnotaInfrastructure.lifecycle.describe(item, field);
                if (lifecycle.state === "failed") return { ...lifecycle, error: lifecycle.error || "Generation failed; retry is available." };
                if (lifecycle.state === "cancelled") return { ...lifecycle, error: "Generation cancelled; retry is available." };
        }
        if ([...this._fieldGenerationStates.keys()].some(key => key.startsWith(prefix))) return {};
        return this.generationState(item);
},
fieldStateKey(item, field) {
        return this.keyOf(item.libraryID, item.key) + "/" + (field.scope === "global" ? "global" : this.colorKeyOf(item)) + "/" + field.id;
},
setFieldState(item, field, state) {
        this._fieldGenerationStates.set(this.fieldStateKey(item, field), state);
        this.refreshViews();
},
fieldRetry(doc, field, getItem, saveDraft) {
        const retry = doc.createElement("button"); retry.type = "button";
        retry.className = "annota-popup-generate-fields"; retry.textContent = Annota.t("card.retry"); retry.hidden = true;
        retry.style.cssText = "font:inherit;font-size:11px;padding:2px 6px;align-self:flex-start;";
        retry.addEventListener("click", async event => {
                event.preventDefault(); event.stopPropagation(); if (retry.disabled) return;
                retry.disabled = true;
                let item;
                try { item = await getItem(); if (!item) throw new Error("Annotation is unavailable.");
                        await saveDraft();
                        const saved = this.get(item), regenerate = !!String(saved?.values[field.name] || "").trim() &&
                            ["failed", "cancelled"].includes(saved?.aiMetadata?.[field.id]?.state);
                        await Annota.requestAIFields(item, { fieldId: field.id, partial: true, regenerate }); }
                catch (e) { if (item) this.setFieldState(item, field, { error: e.message || String(e) });
                        else if (retry._error) retry._error.textContent = e.message || String(e);
                        log("AI field retry: " + e); }
                finally { retry.disabled = false; }
        });
        return retry;
},
updateFieldRetry(retry, item, field) {
        const state = this.fieldState(item, field);
        retry.hidden = !state.error; retry.disabled = !!state.running || !!this.generationState(item).running;
        retry.title = state.error || "";
        if (retry._error) retry._error.textContent = state.error || "";
},

setGenerationState(item, state) {
        this._generationStates.set(this.keyOf(item.libraryID, item.key) + "/" + this.colorKeyOf(item), state);
        this.refreshViews();
},

aiText(item, value) {
        if (String(value || "").trim()) return this.plain(value);
        return this.generationState(item).running ? "Generating..." : "Not generated yet";
},

generationMessage(item) {
        const state = this.generationState(item);
        return state.running ? "Generating..." : state.error || (state.saved ? Annota.t("card.saved") : "");
},

refreshViews() {
        for (const [element, refresh] of this._views) {
                if (!element.isConnected) { this._views.delete(element); continue; }
                Promise.resolve().then(refresh).catch(e => log("Structured field refresh: " + e));
        }
},

keyOf(libraryID, key) {
        return libraryID + "/" + key;
},

colorKeyOf(item) {
        let color = String(item && (item.annotationColor || item.color) || "").toLowerCase();
        let type = item && (item.annotationType || item.type);
        return type === "image" ? "image:" + color : color;
},

get(item) {
        if (!item || !this._store) return null;

        let record = this._store[this.keyOf(item.libraryID, item.key)];
        if (!record || !record.colors) return null;

        const stableColor = typeof AnnotaPalette !== "undefined" ? AnnotaPalette.storageKey(this.colorKeyOf(item)) : null;
        let colorRecord = (stableColor && record.colorConfigs?.[stableColor]) || record.colors[this.colorKeyOf(item)] || {};
        if (!Object.keys(colorRecord).length && !record.globalValues) return null;
        const values = Object.assign({}, colorRecord.values || {});
        for (const field of Annota.fieldsForColor(this.colorKeyOf(item))) {
                if (Object.hasOwn(colorRecord.valuesByID || {}, field.id)) values[field.name] = colorRecord.valuesByID[field.id];
                else if (!Object.hasOwn(values, field.name)) {
                        const aliases = JSON.parse(String(getPref("fieldAliases", "{}") || "{}"))[field.id] || [];
                        const old = aliases.find(name => Object.hasOwn(values, name));
                        if (old) values[field.name] = values[old];
                }
        }

        return {
                values: Object.assign(values, record.globalValues || {}),
                aiMetadata: Object.assign({}, record.aiMetadata || {}),
                references: colorRecord.references || "",
                comment: colorRecord.comment || ""
        };
},

remember(item, values, references, comment) {
        if (this._maintenance) throw new Error("Data import is in progress.");
        if (!item || !values) return;

        let put = store => {
                let key = this.keyOf(item.libraryID, item.key);
                let record = store[key];

                if (!record || !record.colors || typeof record.colors !== "object") {
                        record = { version: 2, colors: {} };
                        store[key] = record;
                }

                record.version = 2;
                record.colors[this.colorKeyOf(item)] = {
                        values: Object.assign({}, values),
                        references: references || "",
                        comment: comment || ""
                };

                this.persist();
        };

        if (this._store) {
                put(this._store);
                return;
        }

        this.load().then(put).catch(e => log("Card fields: " + e));
},

// Values for one annotation.

// Read a raw value from one default-layout line according to its format.
        unwrap(line, format) {
		let patterns = {
			bold: /^<b>([\s\S]*)<\/b>$/,
			italic: /^<i>([\s\S]*)<\/i>$/,
			bolditalic: /^<b><i>([\s\S]*)<\/i><\/b>$/,
			underline: /^<u>([\s\S]*)<\/u>$/
		};
		if (patterns[format]) {
			let m = line.match(patterns[format]);
			return m ? m[1] : null;
		}
		// Plain means the value is not entirely enclosed by formatting markup.
		return /^<(b|i|u)>[\s\S]*<\/\1>$/.test(line) ? null : line;
	},

	// Read historical default-layout output with one nonempty field
	// per line in declaration order. Values may contain user-entered
	// line breaks. Prefer one line per field, widening the match only
	// when needed; return null if the text cannot be interpreted
	// without guessing.
	parse(schema, comment) {
		let lines = String(comment || "").split("\n").map(l => l.trim());
		let n = lines.length;
		let values = {};
		for (let f of schema) values[f.name] = "";
		let failed = new Set();
		let match = (i, j) => {
			while (i < n && !lines[i]) i++;
			if (i >= n) return true;
			if (failed.has(i + "/" + j)) return false;
			for (let k = j; k < schema.length; k++) {
				for (let e = i + 1; e <= n; e++) {
					if (!lines[e - 1]) continue;
					let v = this.unwrap(lines.slice(i, e).join("\n"), schema[k].format);
					if (v === null || !match(e, k + 1)) continue;
					values[schema[k].name] = schema[k].type === "check"
						? (/^(true|yes|oui|1|x|✓)$/i.test(v) ? "true" : "") : v;
					return true;
				}
			}
			failed.add(i + "/" + j);
			return false;
		};
		return match(0, 0) ? values : null;
	},

	// Return { values, references }, or null for unstructured content.
	resolve(entry, schema, libraryID, annotation) {
        let comment = String(annotation.comment || "");
        let key = this.keyOf(libraryID, annotation.id || annotation.key);
        let record = this._store && this._store[key];
        let colorKey = this.colorKeyOf(annotation);

        // Never parse a comment from another color using the current schema.
        if (record && record.colors) {
                let saved = record.colors[colorKey];

                if (saved) {

                        return {
                                values: Object.assign({}, saved.values || {}),
                                references: saved.references || ""
                        };
                }

                let values = {};
                for (let f of schema) values[f.name] = "";
                return { values, references: "" };
        }

        if (!comment.trim()) {
                let values = {};
                for (let f of schema) values[f.name] = "";
                return { values, references: "" };
        }

        // Custom layouts cannot be safely reverse-engineered.
        if (String(entry.template || "").trim()) return null;

        let values = this.parse(schema, comment);
        return values ? { values, references: "" } : null;
},
entryFor(color, global = false) {
    let entry = Annota.getColorEntry(color) || (global ? { fields: "", template: "", prompt: "" } : null);
    if (!entry) return null;

    let schema = global ? Annota.annotationFields(color) : Annota.fieldsForColor(color);
    if (!schema.length) return null;

    // An AI-only schema is valid even when the color also generates
    // a complete AI comment.
    if (!global && Annota.entryNeedsAI(entry)
            && !schema.some(f => f.type === "ai")) return null;

    return { entry, schema };
},

	// ---- Accroche ----

	register() {
		if (!Zotero.Reader || !Zotero.Reader.registerEventListener) return;
		this.load().catch(() => {});
		this._listener = (event) => {
			try { this.onHeader(event); }
			catch (e) { log("Card fields: " + e); }
		};
		Zotero.Reader.registerEventListener("renderSidebarAnnotationHeader",
			this._listener, "researchannotator@pino");
	},

	unregister() {
		this._views.clear();
		try {
			if (this._listener && Zotero.Reader && Zotero.Reader.unregisterEventListener) {
				Zotero.Reader.unregisterEventListener("renderSidebarAnnotationHeader", this._listener);
			}
		}
		catch (e) {}
		this._listener = null;
		// Restore native controls when removing transformed cards.
		for (let r of (Zotero.Reader && Zotero.Reader._readers) || []) {
			try {
				let doc = r._iframeWindow && r._iframeWindow.document;
				if (!doc) continue;
				for (let form of doc.querySelectorAll(".annota-card-form")) {
					let card = form.closest(".preview");
					if (card && card._annotaObserver) card._annotaObserver.disconnect();
					let native = card && card.querySelector(":scope > .comment");
					if (native) native.style.removeProperty("display");
					form.remove();
				}
				for (let hook of doc.querySelectorAll(".annota-card-hook")) hook.remove();
			}
			catch (e) {}
		}
	},

	onHeader({ reader, doc, params, append }) {
		if (getPref("cardFields", true) === false) return;
		let annotation = params && params.annotation;
		if (!annotation || !reader || !doc || !append) return;
		if (!["highlight", "underline", "image"].includes(annotation.type)) return;
		// Reader event documents can arrive without Xray wrappers.
		// Use a safe Xray wrapper so content can read extension option objects.
		// including MutationObserver.observe). Use the Xray view again.
		try { doc = Components.utils.unwaiveXrays(doc); }
		catch (e) { /* The object already has the appropriate Xray view. */ }
		// The header hook identifies the card and hosts explicit AI
		// completion where policy and missing-field state permit it.
		// Hide redundant generation controls when not applicable.
		this.injectStyle(doc);
		let mark = doc.createElement("span");
		mark.className = "annota-card-hook";
		mark.style.display = "none";
		append(mark);
		let card = mark.closest(".preview");
		if (!card) return;
		// Place extension header actions before translation and immediately
		// after the annotation author.
		let section = mark.parentElement;
		let host = section && section.parentElement;
		if (host && host.firstChild !== section) host.insertBefore(section, host.firstChild);
		card._annotaCtx = { reader, annotation };
		card._annotaHook = mark;
		if (!card._annotaObserver) {
			let obs = new doc.defaultView.MutationObserver(() => {
				if (card._annotaBusy) return;
				this.ensure(card).catch(e => log("Card fields: " + e));
			});
			obs.observe(card, { childList: true });
			card._annotaObserver = obs;
		}
		this.ensure(card).catch(e => log("Card fields: " + e));
	},

	// Place, refresh or remove the card form.
	async ensure(card) {
		let { reader, annotation } = card._annotaCtx || {};
		if (!annotation) return;
		let doc = card.ownerDocument;
		let form = card.querySelector(":scope > .annota-card-form");
		let native = card.querySelector(":scope > .comment");
		let cfg = this.entryFor(Annota.colorKey(annotation.color, annotation.type), true);
		let att = Zotero.Items.get(reader.itemID);
		if (!this._store) await this.load();
		// Native Comment is independent. Do not infer new field values from it.
		let resolved = cfg && att ? this.get({ libraryID: att.libraryID,
			key: annotation.id, color: annotation.color, type: annotation.type }) || { values: {}, references: "" } : null;
		const identity = { libraryID: att?.libraryID, key: annotation.id,
			color: annotation.color, type: annotation.type };

		// The header action can remain accessible on a collapsed card
		// when missing AI fields and Manual policy require it.
		let hook = card._annotaHook;
		if (hook) {
			let canFill = !!cfg && !annotation.readOnly && Annota.canGenerateAIFields(identity);
			hook.style.display = canFill ? "inline-flex" : "none";
			const button = hook.querySelector(".annota-card-ai-btn");
			if (button) {
				button.hidden = !canFill;
				button.disabled = !!this.generationState(identity).running;
			}
		}

		// Zotero normally shows native Comment for selected or populated
		// cards; maintain compatible structured-form visibility.
		if (!cfg || !resolved || annotation.readOnly) {
			card._annotaBusy = true;
			if (form) form.remove();
			if (native) native.style.removeProperty("display");
			card._annotaBusy = false;
			return;
		}

		card._annotaBusy = true;
		try {
			const schemaChanged = form && (
			        JSON.stringify(form._schema || []) !== JSON.stringify(cfg.schema)
			        || cfg.schema.some(field => {
			                const existing = form._fields && form._fields[field.name];
			                return !existing
			                        || (field.type === "ai") !== !!existing.ai
			                        || !form.contains(existing.row || existing.el);
			        })
			);

			if (!form || form._annotaColor !== annotation.color || schemaChanged) {
			        if (form) form.remove();
			        form = this.build(doc, card, cfg);
			        form._annotaColor = annotation.color;
			}
			// Place the form immediately before the independent native Comment.
			form._itemIdentity = identity;
			if (native) {
			    if (form.nextSibling !== native) card.insertBefore(form, native);
			    native.style.removeProperty("display");
			}
			else if (form.parentNode !== card || form !== card.lastElementChild) {
			    card.appendChild(form);
			}
			// Do not rerender over active typing; keep the user's current
			// draft in the focused field.
			if (!form.contains(doc.activeElement) && !form._dirty) this.fill(form, resolved);
			else {
				// AI results refresh even while a manual draft has focus.
				for (const [name, field] of Object.entries(form._fields)) {
					if (!field.ai) continue;
					const value = resolved.values[name] || "";
					Annota.renderAIField(field.el, field.f, value, identity);
					if (!form._raw) form._raw = {};
					form._raw[name] = value;
				}
			}
			form._annotaRefs = resolved.references;
			for (const field of Object.values(form._fields)) {
				if (field.retry) this.updateFieldRetry(field.retry, identity, field.f);
			}
			const message = this.generationMessage(identity);
			if (message) form._status.textContent = message;
		}
		finally {
			card._annotaBusy = false;
		}
	},

	// ---- Formulaire ----

	// Force the intended form margin because the label-popup reset
	// otherwise removes both margin and padding.
	CSS: ".annota-card-form{display:flex;flex-direction:column;gap:4px;"
		+ "box-sizing:border-box;width:100%;}"
		+ ".annota-fields.annota-card-form{padding:4px 10px 8px !important;}"
		+ ".annota-card-form .annota-card-label{font-size:11px;opacity:.6;margin-bottom:1px;}"
		+ ".annota-card-form .annota-card-input{width:100%;max-width:100%;box-sizing:border-box;"
		+ "font:inherit;font-size:12px;line-height:1.35;padding:3px 6px;margin:0;color:inherit;"
		+ "border:1px solid rgba(128,128,128,.35);border-radius:4px;background:rgba(128,128,128,.08);"
		+ "outline:none;resize:none;overflow:hidden;min-height:calc(1.35em + 8px);}"
		+ ".annota-card-form .annota-card-input:focus{border-color:rgba(128,128,128,.7);"
		+ "background:transparent;}"
		+ ".annota-card-form .annota-card-check{display:flex;align-items:center;gap:6px;font-size:12px;}"
		+ ".annota-card-form .annota-card-ai{font-size:12px;line-height:1.35;opacity:.75;}"
		+ ".annota-card-form .annota-card-foot{display:flex;align-items:center;justify-content:space-between;"
		+ "gap:6px;min-height:16px;}"
		+ ".annota-card-form .annota-card-status{font-size:10.5px;opacity:.55;}"
		+ ".annota-card-hook{align-items:center;}"
		+ ".annota-card-ai-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;"
		+ "min-height:20px;margin:0;padding:2px 6px;font:inherit;font-size:11px;border:1px solid rgba(128,128,128,.3);border-radius:4px;background:transparent;"
		+ "color:inherit;opacity:.7;cursor:pointer;}"
		+ ".annota-card-ai-btn:hover{opacity:1;background:rgba(128,128,128,.18);}"
		+ ".annota-card-ai-btn[disabled]{cursor:default;}"
		+ ".annota-card-ai-btn.annota-busy svg{animation:annota-ai-pulse 1s ease-in-out infinite;}"
		+ "@keyframes annota-ai-pulse{0%,100%{opacity:.35;}50%{opacity:1;}}",

	injectStyle(doc) {
		Annota._ensureFormStyles(doc);
		if (doc.getElementById("annota-card-style")) return;
		let st = doc.createElement("style");
		st.id = "annota-card-style";
		st.textContent = this.CSS;
		(doc.head || doc.documentElement).appendChild(st);
	},

	build(doc, card, cfg, options = {}) {
		this.injectStyle(doc);
		let form = doc.createElement("div");
		// The label-popup class shields the selected annotation from Delete
		// while a field is edited; see Annota.FORM_CLASS.
		form.className = Annota.FORM_CLASS + " annota-card-form";
		form._fields = {};
		form._changed = new Set();
		form._schema = cfg.schema;
        form._flushDraft = async () => {
            if (form._timer) { doc.defaultView.clearTimeout(form._timer); form._timer = null; }
            if (form._dirty) await (options.save ? options.save(form) : this.save(card, form));
        };
		this.watch(form, options.refresh || (() => this.ensure(card)));

		// Cards use click and drag selection; let the form handle its own
		// controls while allowing the parent card to become selected.
		for (let type of ["keydown", "keypress", "keyup"]) {
			form.addEventListener(type, e => e.stopPropagation());
		}
		form.addEventListener("dragstart", e => { e.stopPropagation(); e.preventDefault(); });
		form.addEventListener("dblclick", e => e.stopPropagation());

		for (let f of cfg.schema) {
			if (f.type === "ai") {
			    let row = doc.createElement("div");
			    row.className = "annota-card-ai-row";
			    Annota._styleStructuredField(row, f);
			    let label = doc.createElement("div");
			    label.className = "annota-card-label";
			    label.textContent = f.label;
			    row.appendChild(label);
			    let p = doc.createElement("div");
			    p.className = "annota-card-ai";
			    row.appendChild(p);
			    const retry = this.fieldRetry(doc, f, () => this.item(card), () => this.save(card, form));
			    const error = doc.createElement("div"); error.className = "annota-field-error"; error.setAttribute("role", "status");
			    retry._error = error; row.appendChild(error); row.appendChild(retry);
			    form.appendChild(row);
			    form._fields[f.name] = {
			        f, el: p, ai: true, row, retry
			    };
			    continue;
			}
			let row = doc.createElement("div");
			let el;
			if (f.type === "check") {
				row.className = "annota-card-check";
				el = doc.createElement("input");
				el.type = "checkbox";
				el.style.margin = "0";
				let lab = doc.createElement("span");
				lab.textContent = f.label;
				row.appendChild(el);
				row.appendChild(lab);
			}
			else {
				let lab = doc.createElement("div");
				lab.className = "annota-card-label";
				lab.textContent = f.label;
				row.appendChild(lab);
				if (f.type === "multiselect") {
					el = Annota.createMultiSelect(doc, f, [], () => onEdit());
				}
				else if (f.type === "select") {
					el = doc.createElement("select");
					for (let o of [""].concat(f.options)) {
						let opt = doc.createElement("option");
						opt.value = o;
						opt.textContent = o || "—";
						el.appendChild(opt);
					}
				}
				else {
					// Use expanding, wrapping textareas for text values to fit
					// the narrow reader sidebar.
					el = doc.createElement("textarea");
					el.rows = 1;
					el.addEventListener("input", () => this.grow(el));
					if (f.type === "text") {
						el.addEventListener("keydown", e => { if (e.key === "Enter") e.preventDefault(); });
					}
				}
				el.classList.add("annota-card-input");
				row.appendChild(el);
			}
			// The content marker prevents the annotation list from stealing arrow keys.
			el.classList.add("content");
			Annota._shieldFromReaderShortcuts(el, f.type === "text" ? "textarea" : f.type);
			el.setAttribute("aria-label", f.label);
			let onEdit = () => {
				form._changed.add(f.name);
				form._dirty = true;
				if (!options.save) this.schedule(card, form, 700);
			};
			if (f.type !== "multiselect") {
				el.addEventListener("input", onEdit);
				el.addEventListener("change", onEdit);
			}
			el.addEventListener("blur", () => { if (form._dirty && !options.save) this.schedule(card, form, 0); });
			form._fields[f.name] = { f, el };
			Annota._styleStructuredField(row, f);
			form.appendChild(row);
		}

		let foot = doc.createElement("div");
		foot.className = "annota-card-foot";
		let status = doc.createElement("span");
		status.className = "annota-card-status";
		foot.appendChild(status);
		form._status = status;
		form.appendChild(foot);
		return form;
	},

	// Compact header icon button beside the native overflow control.
	aiButton(doc) {
		const button = doc.createElement("button");
		button.type = "button";
		button.className = "annota-card-ai-btn";
		button.textContent = "Generate AI Fields";
		button.title = "Generate AI Fields";
		button.setAttribute("aria-label", "Generate AI Fields");
		button.hidden = true;
		for (const type of ["mousedown", "pointerdown", "dragstart"]) {
			button.addEventListener(type, event => event.stopPropagation());
		}
		button.addEventListener("click", event => {
			event.preventDefault(); event.stopPropagation();
			const card = button.closest(".preview");
			if (!card || button.disabled || button.hidden) return;
			this.fillWithAI(card, button).catch(error => log("Structured fields retry: " + error));
		});
		return button;
	},

	grow(el) {
		if (el.tagName !== "TEXTAREA") return;
		el.style.height = "auto";
		let h = el.scrollHeight;
		if (h > 0) {
			el.style.height = h + "px";
			return;
		}
		// A card can render before becoming visible, producing zero measured
		// height. Retain natural height and recalculate once visible instead
		// of leaving the text field collapsed until the next click.
		// Observe its actual rendered size.
		el.style.height = "";
		this.growWhenShown(el);
	},

	growWhenShown(el) {
		if (el._annotaSizeWatch) return;
		let w = el.ownerDocument && el.ownerDocument.defaultView;
		if (!w || typeof w.ResizeObserver !== "function") return;
		let ro = new w.ResizeObserver(() => {
			if (!el.isConnected) { ro.disconnect(); el._annotaSizeWatch = null; return; }
			if (el.scrollHeight > 0) {
				ro.disconnect();
				el._annotaSizeWatch = null;
				this.grow(el);
			}
		});
		el._annotaSizeWatch = ro;
		ro.observe(el);
	},

	// Manual input values omit markup and decode entities.
	plain(raw) {
		return String(raw || "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
			.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"")
			.replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
	},

	fill(form, resolved) {
		form._raw = Object.assign({}, resolved.values);
		for (let name of Object.keys(form._fields)) {
			let { f, el, ai, row } = form._fields[name];
			let v = resolved.values[name] || "";
			if (ai) {
			    Annota.renderAIField(el, f, v, form._itemIdentity);
			    row.style.display = "";
			    continue;
			}
			if (f.type === "multiselect") el.setValues(v || []);
			else if (f.type === "check") el.checked = /^(true|yes|oui|1|x|✓)$/i.test(String(v));
			else {
				const shown = this.plain(Annota.fieldDisplayValue(f, v));
				if (f.type === "select" && v && !Array.from(el.options).some(o => o.value === shown)) {
					const option = el.ownerDocument.createElement("option");
					option.value = option.textContent = shown;
					el.appendChild(option);
				}
				el.value = shown;
				this.grow(el);
			}
		}
	},

	// Unchanged fields retain their original stored value, including
	// internal formatting stripped only from the editing presentation.
	read(form) {
		let values = {};
		for (let name of Object.keys(form._fields)) {
			let { f, el, ai } = form._fields[name];
			let raw = (form._raw && form._raw[name]) || "";
			if (ai) { values[name] = raw; continue; }
			if (f.type === "multiselect") { values[name] = el.readValues(); continue; }
			let v = f.type === "check" ? (el.checked ? "true" : "") : String(el.value || "").trim();
			values[name] = (f.type !== "check" && v === this.plain(raw).trim()) ? raw : v;
		}
		return values;
	},

	schedule(card, form, delay) {
		let w = card.ownerDocument.defaultView;
		if (form._timer) w.clearTimeout(form._timer);
		form._timer = w.setTimeout(() => {
			form._timer = null;
			this.save(card, form).catch(e => {
				log("Card fields: " + e);
				form._status.textContent = Annota.t("card.error");
			});
		}, delay);
	},

	async item(card) {
		let { reader, annotation } = card._annotaCtx;
		let att = await Zotero.Items.getAsync(reader.itemID);
		if (!att) return null;
		return Zotero.Items.getByLibraryAndKeyAsync(att.libraryID, annotation.id);
	},

	// Rebuild structured output from the configured color layout.
	compose(item, form, values) {
		let entry = Annota.getColorEntry(Annota.keyForItem(item));
		let ctx = Annota.getContext(item);
		ctx.references = form._annotaRefs || "";
		let vars = Annota.buildVars({ text: (item.annotationText || "").trim(), ctx,
			comment: "", fields: values });
		vars.ai = "";
		return Annota.renderTemplate(Annota.effectiveTemplate(entry), vars);
	},

	async save(card, form) {
		const item = await this.item(card);
		if (!item) throw new Error("Annotation is no longer available.");
		const values = this.read(form);
		const patch = {};
		for (const [name, field] of Object.entries(form._fields)) {
			if (!field.ai && form._changed.has(name)) patch[name] = values[name];
		}
		const saved = await this.saveValues(item, patch);
		// Keep dirty state if the user typed again while the write was running.
		const current = this.read(form);
		for (const [name, value] of Object.entries(patch)) {
			if (JSON.stringify(current[name]) === JSON.stringify(value)) form._changed.delete(name);
		}
		form._dirty = form._changed.size > 0;
		form._raw = Object.assign({}, saved.values);
		await Annota._syncPaperResearchNote(item);
		if (!form._dirty && card.isConnected) await this.ensure(card);
		form._status.textContent = Annota.t("card.saved");
	},

	async fillWithAI(card, button) {
		const form = card.querySelector(":scope > .annota-card-form");
		const setStatus = msg => { if (form && form._status) form._status.textContent = msg; };
		if (form && form._timer) {
			card.ownerDocument.defaultView.clearTimeout(form._timer);
			form._timer = null;
		}
		button.disabled = true;
		button.classList.add("annota-busy");
		setStatus(Annota.t("card.filling"));
		try {
			const item = await this.item(card);
			if (!item) throw new Error("Annotation is no longer available.");
			// Commit any manual draft first. Generation never writes Comment.
			if (form && form._dirty) await this.save(card, form);
			await Annota.requestAIFields(item);
			await this.ensure(card);
			setStatus(Annota.t("card.saved"));
		}
		catch (e) {
			setStatus(Annota.t("gen.failed", { msg: e.message || e }));
			toast("ResearchAnnotator", Annota.t("gen.failed", { msg: e.message || e }), "error");
		}
		finally {
			button.disabled = false;
			button.classList.remove("annota-busy");
		}
	}
};
