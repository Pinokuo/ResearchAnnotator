/* Stable palette identities. Hexadecimal keys remain as non-destructive history. */
var AnnotaPalette = {
    pref: "researchannotator.palette",
    clone(value) { return JSON.parse(JSON.stringify(value)); },
    nativeColors() { return this._nativeColors.call(Annota); },
    read() {
        const raw = Zotero.Prefs.get(this.pref);
        return raw ? this.validate(JSON.parse(raw)) : null;
    },
    validate(state) {
        if (!state || state.version !== 1 || !Array.isArray(state.colors) || !state.colors.length) throw Error("Unsupported or empty palette.");
        const ids = new Set(), owners = new Map();
        for (const color of state.colors) {
            if (!/^p_[\w]+$/.test(color.id) || ids.has(color.id) || !/^#[0-9a-f]{6}$/.test(color.hex)
                || typeof color.label !== "string" || !Array.isArray(color.aliases) || !color.configs || typeof color.configs !== "object") throw Error("Invalid palette entry.");
            if (color.custom !== undefined && typeof color.custom !== "boolean") throw Error("Invalid custom color flag.");
            ids.add(color.id);
            for (const hex of [color.hex, ...color.aliases]) {
                if (!/^#[0-9a-f]{6}$/.test(hex) || owners.has(hex) && owners.get(hex) !== color.id) throw Error("A color or historical alias belongs to multiple configurations.");
                owners.set(hex, color.id);
            }
            for (const [kind, config] of Object.entries(color.configs)) {
                if (!["text", "image"].includes(kind)) throw Error("Invalid color configuration scope.");
                if (config === null) continue;
                if (typeof config !== "object" || typeof config.fields !== "string") throw Error("Invalid color fields.");
                if (["prompt", "template", "label"].some(key => config[key] !== undefined && typeof config[key] !== "string")) throw Error("Invalid color configuration text.");
                if (Annota.validateFieldSchema(config.fields).some(issue => issue.level === "error")) throw Error("Invalid color field schema.");
                const fields = Annota.parseFieldSchema(config.fields), fieldIDs = new Set();
                for (const field of fields) {
                    if (!field.id || fieldIDs.has(field.id)) throw Error("Color fields require unique stable identities.");
                    fieldIDs.add(field.id);
                }
            }
        }
        for (const color of state.colors) if (color.reassignedTo !== undefined && !ids.has(color.reassignedTo)) throw Error("Invalid archived color reassignment identity.");
        if (!state.colors.some(color => !color.archived)) throw Error("Keep at least one active color.");
        return state;
    },
    ensure() {
        let state = this.read(); if (state) return state;
        const map = this._prompts.call(Annota), labels = this._labels.call(Annota);
        const native = this.nativeColors();
        const hexes = [...new Set([...native.map(c => c.hex), ...Object.keys(map).map(k => k.replace(/^image:/, "")), ...Object.keys(labels)])];
        state = { version: 1, preset: "custom", colors: hexes.filter(hex => /^#[0-9a-f]{6}$/.test(hex)).map(hex => {
            const configs = {};
            for (const type of ["text", "image"]) {
                const key = type === "image" ? "image:" + hex : hex, raw = map[key];
                const config = typeof raw === "string" ? { prompt: raw, fields: "", template: "", trigger: "auto" } : raw;
                if (config) {
                    // Freeze the pre-palette field IDs before hex values can change.
                    const fields = String(config.fields || "").split("\n").map(line => {
                        if (!line.trim() || line.trim().startsWith("#")) return line;
                        const parts = line.split("|").map(p => p.trim());
                        while (parts.length < 6) parts.push("");
                        if (!parts[5]) parts[5] = "c_" + Annota.fieldFingerprint(key + "/" + parts[0]);
                        return parts.join(" | ");
                    }).join("\n");
                    configs[type] = { ...config, fields };
                }
            }
            return { id: Annota.newFieldID("p"), hex, aliases: [], label: labels[hex] || native.find(c => c.hex === hex)?.name || hex, configs, archived: false, custom: !native.some(c => c.hex === hex) };
        }) };
        this.save(state); return state;
    },
    save(state) { this.validate(state); Zotero.Prefs.set(this.pref, JSON.stringify(state)); Annota.refreshAIFieldViews?.(); },
    resolve(key, state = this.read()) {
        const byID = state?.colors.find(c => c.id === key); if (byID) return byID;
        const hex = String(key || "").replace(/^image:/, "").toLowerCase();
        return state?.colors.find(c => c.id === hex || c.hex === hex || c.aliases.includes(hex));
    },
    storageKey(key) {
        const color = this.resolve(key);
        return color ? (String(key).startsWith("image:") ? "image:" : "") + color.id : null;
    },
    map() {
        const state = this.read(); if (!state) return this._prompts.call(Annota);
        const map = {};
        for (const c of state.colors) for (const [type, config] of Object.entries(c.configs)) {
            if (config) for (const hex of [c.hex, ...c.aliases]) map[(type === "image" ? "image:" : "") + hex] = config;
        }
        return map;
    },
    setMap(map) {
        const state = this.ensure();
        for (const c of state.colors) for (const type of ["text", "image"]) {
            const incoming = map[(type === "image" ? "image:" : "") + c.hex];
            if (!incoming) { c.configs[type] = null; continue; }
            const previous = Annota.parseFieldSchema(c.configs[type]?.fields || "");
            const fields = String(incoming.fields || "").split("\n").map(line => {
                if (!line.trim() || line.trim().startsWith("#")) return line;
                const parts = line.split("|").map(part => part.trim()); while (parts.length < 6) parts.push("");
                if (!parts[5]) parts[5] = previous.find(field => field.name === parts[0])?.id || "c_" + Annota.fieldFingerprint(c.id + "/" + type + "/" + parts[0]);
                return parts.join(" | ");
            }).join("\n");
            c.configs[type] = { ...incoming, fields };
        }
        this.save(state);
    },
    labels() {
        const state = this.read(); if (!state) return this._labels.call(Annota);
        const labels = {};
        for (const c of state.colors) for (const hex of [c.hex, ...c.aliases]) labels[hex] = c.label;
        return labels;
    },
    setLabels(labels) {
        const state = this.ensure();
        for (const c of state.colors) if (Object.hasOwn(labels, c.hex)) c.label = String(labels[c.hex]).trim() || c.hex;
        this.save(state);
    },
    async migrateStorage() {
        const state = this.ensure(); await AnnotaCardFields.load();
        const task = AnnotaCardFields._saveQueue.catch(() => {}).then(async () => {
            const next = this.clone(AnnotaCardFields._store); let changed = false;
            for (const record of Object.values(next)) {
                for (const [hex, value] of Object.entries(record.colors || {})) {
                    const color = this.resolve(hex, state); if (!color) continue;
                    const key = (hex.startsWith("image:") ? "image:" : "") + color.id;
                    if (!record.colorConfigs) record.colorConfigs = {};
                    if (!record.colorConfigs[key]) { record.colorConfigs[key] = this.clone(value); changed = true; }
                    // Do not merge differing historical records silently: preserve all hex records.
                }
            }
            if (changed) { await AnnotaCardFields.writeStore(next); AnnotaCardFields._store = next; }
        });
        AnnotaCardFields._saveQueue = task; await task;
    },
    async used(hexes) {
        const items = [];
        for (const library of Zotero.Libraries.getAll()) {
            for (const item of await Annota._getAllResearchAnnotations(library.libraryID)) {
                if (hexes.includes(String(item.annotationColor).toLowerCase()) && !item.deleted) items.push(item);
            }
        }
        return items;
    },
    async update(id, patch, handling) {
        await this.migrateStorage();
        const state = this.ensure(), color = state.colors.find(c => c.id === id);
        if (!color) throw Error("Unknown color identity.");
        const nextHex = String(patch.hex || color.hex).toLowerCase();
        if (!/^#[0-9a-f]{6}$/.test(nextHex)) throw Error("Enter a six-digit hexadecimal color.");
        const changing = nextHex !== color.hex;
        const items = changing || patch.label !== undefined && patch.label !== color.label ? await this.used([color.hex, ...color.aliases]) : [];
        if (changing && items.length && !["keep", "recolor"].includes(handling)) throw Error("Choose whether to keep existing highlights or recolor them.");
        const original = Zotero.Prefs.get(this.pref);
        const originalColors = items.map(item => [item, item.annotationColor]);
        if (changing) color.aliases = [...new Set([...color.aliases, color.hex])].filter(hex => hex !== nextHex);
        Object.assign(color, patch, { id, hex: nextHex }); state.preset = "custom"; this.validate(state);
        if (handling === "recolor" && items.some(item => item.library?.editable === false)) throw Error("A matching highlight is read-only; keep existing colors instead.");
        if (handling === "recolor" && items.length && !Zotero.DB?.executeTransaction) throw Error("Transactional recoloring is unavailable.");
        try {
            const apply = async () => {
                for (const item of handling === "recolor" ? items : []) { item.annotationColor = nextHex; await item.save({ skipDateModifiedUpdate: true }); }
                this.save(state);
            };
            if (handling === "recolor" && items.length) await Zotero.DB.executeTransaction(apply); else await apply();
        }
        catch (error) { Zotero.Prefs.set(this.pref, original); for (const [item, hex] of originalColors) item.annotationColor = hex; throw error; }
        AnnotaCardFields.refreshViews();
        for (const item of items) await Annota._syncPaperResearchNote(item);
        return state;
    },
    add(hex = "#6699cc", label = "New color") {
        const state = this.ensure();
        state.colors.push({ id: Annota.newFieldID("p"), hex: hex.toLowerCase(), aliases: [], label, configs: {}, archived: false, custom: true });
        state.preset = "custom"; this.save(state); return state.colors.at(-1);
    },
    move(id, direction) {
        const state = this.ensure(), i = state.colors.findIndex(c => c.id === id), j = i + direction;
        if (i < 0 || j < 0 || j >= state.colors.length) return;
        [state.colors[i], state.colors[j]] = [state.colors[j], state.colors[i]]; this.save(state);
    },
    reorder(id, beforeID, after = false) {
        const state = this.ensure(), from = state.colors.findIndex(c => c.id === id);
        if (from < 0 || id === beforeID || !state.colors.some(c => c.id === beforeID)) return;
        const [color] = state.colors.splice(from, 1);
        state.colors.splice(state.colors.findIndex(c => c.id === beforeID) + (after ? 1 : 0), 0, color); this.save(state);
    },
    isCustom(color) {
        return typeof color.custom === "boolean" ? color.custom : !this.nativeColors().some(native => [color.hex, ...color.aliases].includes(native.hex));
    },
    async usage(id) {
        const color = this.resolve(id); if (!color) throw Error("Unknown color identity.");
        const hexes = [color.hex, ...color.aliases], annotations = [];
        for (const library of Zotero.Libraries.getAll()) for (const item of await Annota._getAllResearchAnnotations(library.libraryID)) {
            if (hexes.includes(String(item.annotationColor).toLowerCase())) annotations.push(item);
        }
        await AnnotaCardFields._saveQueue; await AnnotaCardFields.load();
        const fieldIDs = new Set(Object.values(color.configs).flatMap(config => Annota.parseFieldSchema(config?.fields || "").map(field => field.id)));
        const records = Object.entries(AnnotaCardFields._store).filter(([, record]) =>
            Object.keys(record.colors || {}).some(key => hexes.includes(key.replace(/^image:/, "")))
            || Object.keys(record.colorConfigs || {}).some(key => key.replace(/^image:/, "") === id)
            || Object.keys(record.aiMetadata || {}).some(key => fieldIDs.has(key))).map(([key]) => key);
        const catalog = Annota.categoryCatalog();
        const categoricalHistory = [...fieldIDs].filter(key => Object.keys(catalog[key] || {}).length);
        const reassignmentSources = this.ensure().colors.filter(c => c.reassignedTo === id).map(c => c.id);
        const pending = Annota._pendingFields;
        const pendingDraft = !!pending && Date.now() - pending.ts < 600000 && this.resolve(pending.color)?.id === id && Annota._hasFilledValues(pending.values);
        const noteReferences=typeof AnnotaInfrastructure==='undefined'?[]:Object.values(AnnotaInfrastructure.state?.notes||{}).filter(c=>c.colorOrder?.includes(id)||c.filter?.colorIDs?.includes(id)).map(c=>c.id);
        return { annotations, records, categoricalHistory, reassignmentSources, pendingDraft, noteReferences,
            canDelete: !noteReferences.length && !annotations.length && !records.length && !categoricalHistory.length && !reassignmentSources.length && !pendingDraft };
    },
    async deleteColor(id, { confirmed = false } = {}) {
        if (!confirmed) throw Error("Confirm permanent deletion before deleting a color.");
        if (AnnotaCardFields._maintenance || Annota._fieldRequests?.size) throw Error("Finish active data operations before deleting a color.");
        const used = await this.usage(id);
        if (AnnotaCardFields._maintenance || Annota._fieldRequests?.size || Annota.inProgress?.size) throw Error("Finish active data operations before deleting a color.");
        if (!used.canDelete) throw Error("This color has associated research data. Archive it or reassign highlights and archive; no data was deleted.");
        const state = this.ensure(), color = this.resolve(id, state), hexes = [color.hex, ...color.aliases];
        state.colors = state.colors.filter(c => c.id !== id); state.preset = "custom"; this.validate(state);
        const keys = [this.pref, "researchannotator.colorPrompts", "researchannotator.colorLabels"];
        const original = keys.map(key => [key, Zotero.Prefs.get(key)]);
        const prompts = JSON.parse(Zotero.Prefs.get(keys[1]) || "{}"), labels = JSON.parse(Zotero.Prefs.get(keys[2]) || "{}");
        for (const hex of hexes) { delete prompts[hex]; delete prompts["image:" + hex]; delete labels[hex]; }
        try {
            this.save(state); Zotero.Prefs.set(keys[1], JSON.stringify(prompts)); Zotero.Prefs.set(keys[2], JSON.stringify(labels));
        }
        catch (error) {
            for (const [key, value] of original) { if (value === undefined) Zotero.Prefs.clear(key); else Zotero.Prefs.set(key, value); }
            throw error;
        }
        // Field/category identities and all annotation records are deliberately untouched.
    },
    async reassignAndArchive(id, targetID, { confirmed = false } = {}) {
        if (!confirmed) throw Error("Confirm highlight reassignment before continuing.");
        if (AnnotaCardFields._maintenance || Annota._fieldRequests?.size || Annota.inProgress?.size) throw Error("Finish active data/AI operations before reassigning colors.");
        for (const view of AnnotaCardFields._views.keys()) if (view.isConnected && (view._dirty || view.querySelector?.('[data-dirty="true"]'))) throw Error("Save active highlight edits before reassigning colors.");
        await this.migrateStorage();
        const state = this.ensure(), source = this.resolve(id, state), target = this.resolve(targetID, state);
        if (!source || !target || source.id === target.id || target.archived) throw Error("Choose a different active target color.");
        const used = await this.usage(id);
        if (AnnotaCardFields._maintenance || Annota._fieldRequests?.size || Annota.inProgress?.size) throw Error("Finish active data/AI operations before reassigning colors.");
        if (used.pendingDraft) throw Error("Finish the pending highlight before reassigning its color.");
        if (used.annotations.some(item => item.library?.editable === false || item.deleted)) throw Error("A matching annotation is read-only or deleted. Archive this color instead.");
        if (used.annotations.length && !Zotero.DB?.executeTransaction) throw Error("Transactional recoloring is unavailable. Archive this color instead.");
        const original = Zotero.Prefs.get(this.pref), previous = used.annotations.map(item => [item, item.annotationColor]);
        try {
            const apply = async () => {
                for (const item of used.annotations) { item.annotationColor = target.hex; await item.save({ skipDateModifiedUpdate: true }); }
                source.archived = true; source.reassignedTo = target.id; state.preset = "custom"; this.save(state);
            };
            if (used.annotations.length) await Zotero.DB.executeTransaction(apply); else await apply();
        }
        catch (error) { Zotero.Prefs.set(this.pref, original); for (const [item, hex] of previous) item.annotationColor = hex; throw error; }
        AnnotaCardFields.refreshViews();
        const attachments = new Map(used.annotations.map(item => [item.libraryID + "/" + item.parentID, item]));
        const noteErrors = [];
        for (const item of attachments.values()) {
            try { await Annota._syncPaperResearchNote(item); }
            catch (error) { noteErrors.push({ attachment: item.parentID, error: error.message || String(error) }); }
        }
        // Source and target structured records remain separate; unrelated target fields are never overwritten.
        return { reassigned: used.annotations.length, noteErrors };
    },
    async preset(name) {
        if (name === "custom") { const state = this.ensure(); state.preset = name; this.save(state); return; }
        // Okabe-Ito CUD starting palette; semantic labels and selection marks supply redundant coding.
        const palettes = {
            accessible: ["#e69f00", "#56b4e9", "#009e73", "#f0e442", "#0072b2", "#d55e00", "#cc79a7", "#000000"],
            pastel: ["#fbb4ae", "#b3cde3", "#ccebc5", "#decbe4", "#fed9a6", "#ffffcc", "#e5d8bd", "#fddaec"],
            default: this.nativeColors().map(c => c.hex)
        };
        if (!palettes[name]) throw Error("Unknown palette preset.");
        await this.migrateStorage(); const state = this.ensure(), selected = [];
        for (const hex of palettes[name]) {
            let c = this.resolve(hex, state);
            if (!c) { c = { id: Annota.newFieldID("p"), hex, aliases: [], label: this.nativeColors().find(c => c.hex === hex)?.name || "Color " + (selected.length + 1), configs: {}, archived: false }; state.colors.push(c); }
            if (c.hex !== hex) c.aliases = [...new Set([...c.aliases, c.hex])].filter(alias => alias !== hex);
            c.hex = hex; c.archived = false; selected.push(c);
        }
        for (const c of state.colors) if (!selected.includes(c)) c.archived = true;
        state.colors = [...selected, ...state.colors.filter(c => !selected.includes(c))]; state.preset = name; this.save(state);
        // No annotations, definitions, values, aliases or historical colors are deleted/reassigned.
    },
    textColor(hex) {
        const values = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        const luminance = values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
        return (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? "#000000" : "#ffffff";
    },
    styleButton(button, color, selected = false) {
        button.classList.add("annota-color-button");
        button.dataset.semanticLabel = color.label || color.name || color.hex;
        button.textContent = (selected ? "✓ " : "") + (color.label || color.name || color.hex);
        button.title = (color.label || color.name || color.hex) + " (" + color.hex + ")";
        button.setAttribute("aria-label", button.title); button.setAttribute("aria-pressed", String(selected));
        const values = color.hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
        const whiteContrast = 1.05 / (.2126 * values[0] + .7152 * values[1] + .0722 * values[2] + .05);
        // Leave contrast headroom for the hover brightening, retaining white semantic labels.
        const backing = whiteContrast < 5.2 ? "linear-gradient(rgba(0,0,0,.58),rgba(0,0,0,.58))," : "";
        button.style.cssText = "font:inherit;font-size:11px;line-height:1.35;border:1px solid GrayText;border-radius:4px;padding:4px 7px;cursor:pointer;" +
            "--annota-swatch:" + color.hex + ";background:" + backing + color.hex + ";color:#ffffff;text-shadow:0 1px 1px rgba(0,0,0,.4);outline:" +
            (selected ? "2px solid Highlight" : "none") + ";outline-offset:1px;";
        const picker = button.closest?.(".annota-palette-picker");
        if (picker && this.geometricLayout(picker.dataset.layout)) this.scheduleLayout(picker);
    },
    geometricLayout(layout) { return ["single", "slanted", "vertical"].includes(layout); },
    readerElement(node) {
        // Reader events can hand us waived wrappers. Observer option objects
        // must cross through an Xray, as in the existing sidebar renderer.
        try { return Components.utils.unwaiveXrays(node); }
        catch (_) { return node; }
    },
    geometryPlan(layout, sizes, availableWidth = Infinity, availableHeight = Infinity) {
        const pad = 6, gap = 3;
        if (!sizes.length) return { width: 0, height: 0, items: [], angle: 0 };
        const height = Math.max(...sizes.map(size => size.height));
        if (layout === "single") return { width: sizes.reduce((sum, size) => sum + size.width, 0) + 2 * (sizes.length - 1) + pad * 2,
            height: height + pad * 2, items: sizes.map(size => ({ width: size.width, height })), angle: 0 };
        if (layout === "vertical") {
            const width = Math.max(...sizes.map(size => size.width)), total=Math.max(sizes.length*(height+gap)+pad*2,Number.isFinite(availableWidth)?availableWidth:0),slot=total/sizes.length;
            return {width:total,height:width+pad*2,angle:-90,items:sizes.map((_,index)=>({left:index*slot,top:0,slotWidth:slot,slotHeight:width+pad*2,buttonLeft:gap/2,buttonTop:width+pad,width,height:slot-gap}))};
        }
        const uniform=Math.max(...sizes.map(size=>size.width));sizes=sizes.map(size=>({...size,width:uniform}));
        const slanted = degrees => {
            const angle = degrees * Math.PI / 180, sin = Math.sin(angle), cos = Math.cos(angle);
            const rise = Math.max(...sizes.map(size => size.width * sin + height * cos));
            // Equal parallel bands separated by gap: projected boxes may interleave,
            // but the transformed buttons (and their native hit regions) cannot overlap.
            const pitch = (height + gap) / sin;
            const items = sizes.map((size, index) => ({ left: index * pitch, top: rise - size.width * sin - height * cos,
                slotWidth: size.width * cos + height * sin + pad * 2, slotHeight: size.width * sin + height * cos + pad * 2,
                buttonLeft: pad, buttonTop: size.width * sin + pad, width: size.width, height }));
            return { width: Math.max(...items.map(item => item.left + item.slotWidth)), height: rise + pad * 2, angle: -degrees, items };
        };
        let result = slanted(45);
        if (result.width > availableWidth) for (let angle = 46; angle <= 55; angle++) {
            result = slanted(angle); if (result.width <= availableWidth) break;
        }
        if (result.height > availableHeight) for (let angle = 44; angle >= 35; angle--) {
            const candidate = slanted(angle);
            if (candidate.width <= availableWidth) { result = candidate; if (candidate.height <= availableHeight) break; }
        }
        return result;
    },
    clearGeometry(container) {
        for (const slot of Array.from(container.children || [])) {
            if (!slot.classList.contains("annota-color-slot")) continue;
            const button = slot.querySelector("button"); if (button) container.insertBefore(button, slot); slot.remove();
        }
        for (const button of container.querySelectorAll("button")) for (const property of
            ["position", "left", "top", "width", "height", "min-width", "max-width", "white-space", "overflow-wrap", "flex", "transform", "transform-origin", "box-sizing", "pointer-events", "margin"]) button.style.removeProperty(property);
    },
    scheduleLayout(container) {
        container = this.readerElement(container);
        const win = container.ownerDocument?.defaultView;
        if (!win?.requestAnimationFrame || container._annotaLayoutPending) return;
        container._annotaLayoutPending = true;
        win.requestAnimationFrame(() => {
            container._annotaLayoutPending = false;
            if (container.isConnected && this.geometricLayout(container.dataset.layout)) this.measurePicker(container);
        });
    },
    measurePicker(container) {
        container = this.readerElement(container);
        const doc = container.ownerDocument, win = doc.defaultView;
        if (!container.getBoundingClientRect || !container.querySelectorAll("button").length) return;
        container._annotaLayoutObserver?.disconnect();
        try {
            this.clearGeometry(container);
            const buttons = Array.from(container.querySelectorAll("button")), layout = container.dataset.layout;
            const popup = container.closest(".selection-popup,.annotation-popup");
            const viewport = popup?.closest(".primary-view,.secondary-view") || doc.documentElement;
            const viewportWidth = Math.min(win.innerWidth, viewport?.clientWidth || win.innerWidth);
            const maxWidth = Math.max(1, viewportWidth - 24);
            const popupStyle = popup && win.getComputedStyle(popup);
            const chrome = popupStyle ? ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"]
                .reduce((sum, key) => sum + (parseFloat(popupStyle[key]) || 0), 0) : 18;
            const available = Math.max(1, maxWidth - chrome);
            const sizes = buttons.map(button => {
                button.style.cssText += ";position:static;transform:none;white-space:nowrap;overflow-wrap:normal;flex:none;width:max-content;max-width:none;min-width:max-content;height:auto;box-sizing:border-box;margin:0;";
                const label = button.textContent;
                // Reserve the same selection-mark width in creation/editing popups.
                button.textContent = "\u2713 " + (button.dataset.semanticLabel || label);
                if(layout==="single")button.style.padding="4px 5px";
                const rect = button.getBoundingClientRect(); button.textContent = label;
                return { width: Math.ceil(rect.width) + 1, height: Math.ceil(rect.height) };
            });
            const plan = this.geometryPlan(layout, sizes, layout==="vertical"?Math.min(available,Math.max(1,(popup?.getBoundingClientRect().width||360)-chrome)):available, win.innerHeight * .75);
            if (popup) {
                popup.dataset.annotaColorLayout = layout;
                popup.style.setProperty("--annota-color-popup-width", Math.min(maxWidth, Math.max(Math.min(layout==="single"?300:360, maxWidth), Math.ceil(plan.width + chrome))) + "px");
            }
            if(layout==="vertical"&&popup){const actual=popup.clientWidth-(parseFloat(popupStyle.paddingLeft)||0)-(parseFloat(popupStyle.paddingRight)||0);Object.assign(plan,this.geometryPlan(layout,sizes,actual,win.innerHeight*.75));}
            const contentWidth = popup ? popup.clientWidth - (parseFloat(popupStyle.paddingLeft) || 0) - (parseFloat(popupStyle.paddingRight) || 0) : available;
            const overflow = plan.width > contentWidth + .5;
            container.style.cssText = "position:relative;box-sizing:border-box;width:100%;max-width:100%;min-width:0;" +
                "overflow-x:" + (overflow ? "auto" : "hidden") + ";overflow-y:hidden;" +
                (layout === "single" ? "display:flex;flex-wrap:nowrap;align-items:center;gap:2px;padding:6px;height:auto;" : "display:block;padding:0;height:" + Math.ceil(plan.height) + "px;");
            plan.items.forEach((item, index) => {
                const button = buttons[index];
                button.style.cssText += ";width:" + item.width + "px;height:" + item.height + "px;min-width:0;max-width:none;flex:none;white-space:nowrap;overflow-wrap:normal;box-sizing:border-box;";
                if (layout === "single") return;
                const slot = doc.createElement("div"); slot.className = "annota-color-slot";
                slot.style.cssText = "position:absolute;pointer-events:none;overflow:hidden;box-sizing:border-box;left:" + item.left + "px;top:" + Math.max(0, item.top) +
                    "px;width:" + item.slotWidth + "px;height:" + item.slotHeight + "px;";
                container.insertBefore(slot, button); slot.appendChild(button);
                button.style.cssText += ";position:absolute;pointer-events:auto;left:" + item.buttonLeft + "px;top:" + item.buttonTop + "px;transform-origin:0 0;transform:rotate(" + plan.angle + "deg);";
            });
            if (layout !== "single" && overflow) container.style.height = Math.ceil(plan.height + container.offsetHeight - container.clientHeight) + "px";
            container._annotaMeasured = true;
            container._annotaGeometry = { ...plan, viewportWidth, popupWidth: popup?.getBoundingClientRect().width, overflow };
        }
        finally { container._annotaLayoutObserver?.observe(container, { childList: true, subtree: true }); }
    },
    watchPicker(container) {
        container = this.readerElement(container);
        const doc = container.ownerDocument, win = doc.defaultView;
        if (!win?.MutationObserver || !container.getBoundingClientRect) return;
        if (!this._layoutPickers) this._layoutPickers = new Set();
        this._layoutPickers.add(container);
        if (!container._annotaLayoutObserver) container._annotaLayoutObserver = new win.MutationObserver(() => this.scheduleLayout(container));
        container._annotaLayoutObserver.observe(container, { childList: true, subtree: true });
        if (!container._annotaViewportObserver && win.ResizeObserver) {
            let lastWidth;
            container._annotaViewportObserver = new win.ResizeObserver(entries => {
                const width = entries[0]?.contentRect.width;
                if (width !== lastWidth) { lastWidth = width; this.scheduleLayout(container); }
            });
            container._annotaViewportObserver.observe(container.closest(".primary-view,.secondary-view") || doc.documentElement);
        }
        if (!this._layoutWindows) this._layoutWindows = new Map();
        if (this._layoutWindows.has(win)) return;
        const resize = () => { for (const picker of this._layoutPickers) if (picker.ownerDocument === doc && picker.isConnected) this.scheduleLayout(picker); };
        const observer = new win.MutationObserver(() => {
            for (const picker of this._layoutPickers) if (picker.ownerDocument === doc) {
                if (!picker.isConnected) { picker._annotaLayoutObserver?.disconnect(); picker._annotaViewportObserver?.disconnect(); this._layoutPickers.delete(picker); }
                else if (!picker._annotaMeasured) this.scheduleLayout(picker);
            }
        });
        const unload = () => {
            observer.disconnect(); win.removeEventListener("resize", resize); win.removeEventListener("unload", unload);
            for (const picker of this._layoutPickers) if (picker.ownerDocument === doc) { picker._annotaLayoutObserver?.disconnect(); picker._annotaViewportObserver?.disconnect(); this._layoutPickers.delete(picker); }
            this._layoutWindows.delete(win);
        };
        observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
        win.addEventListener("resize", resize); win.addEventListener("unload", unload);
        this._layoutWindows.set(win, { unload });
    },
    stopLayouts() {
        for (const entry of Array.from(this._layoutWindows?.values() || [])) entry.unload();
        this._layoutPickers?.clear();
    },
    stylePicker(container) {
        if (!container) return;
        container = this.readerElement(container);
        Annota._ensureAnnotationInterfaceStyles(container.ownerDocument);
        let layout = Zotero.Prefs.get("researchannotator.colorLabelLayout") || "wrap";
        if (!["wrap", "single", "stack", "slanted", "vertical"].includes(layout)) layout = "wrap";
        container.classList.add("annota-palette-picker"); container.dataset.layout = layout;
        container.setAttribute("role", "group"); container.setAttribute("aria-label", "Highlight colors");
        container.setAttribute("data-tabstop", "1");
        container.style.cssText = "display:flex;box-sizing:border-box;gap:5px;min-width:0;max-width:100%;" +
            "flex-direction:" + (layout === "stack" ? "column" : "row") + ";flex-wrap:" + (layout === "single" ? "nowrap" : "wrap") +
            ";overflow-x:" + (layout === "single" ? "auto" : "visible") + ";padding:" + (layout === "slanted" ? "22px 10px 18px" : "3px") + ";";
        const popup = container.closest?.(".selection-popup,.annotation-popup");
        if (popup) { popup.dataset.annotaColorLayout = layout; popup.style.removeProperty("--annota-color-popup-width"); }
        if (this.geometricLayout(layout)) { container._annotaMeasured = false; this.watchPicker(container); this.scheduleLayout(container); }
        else {
            container._annotaLayoutObserver?.disconnect(); this._layoutPickers?.delete(container);
            container._annotaViewportObserver?.disconnect(); delete container._annotaViewportObserver;
            this.clearGeometry(container);
        }
    },
    refreshLayouts() {
        for (const reader of Zotero.Reader?._readers || []) {
            const doc = reader?._iframeWindow?.document;
            for (const picker of doc?.querySelectorAll?.(".annota-palette-picker") || []) this.stylePicker(picker);
        }
    },
    renderSelection({ doc, params, reader }) {
        if (!doc || !reader) return;
        const popup = doc.querySelector(".selection-popup"), native = popup?.querySelector(".colors");
        if (!popup || !native || popup.querySelector(".annota-palette-picker")) return;
        const internal = reader._internalReader;
        const utils = typeof Cu !== "undefined" ? Cu : typeof Components !== "undefined" ? Components.utils : null;
        if (!internal?._annotationManager?.addAnnotation || !utils?.cloneInto) return; // Keep native controls on unsupported readers.
        const picker = doc.createElement("div"); picker.className = "annota-palette-picker";
        this.stylePicker(picker);
        for (const c of Annota.COLORS) {
            const button = doc.createElement("button"); button.type = "button"; button.dataset.color = c.hex;
            this.styleButton(button, c);
            button.addEventListener("click", event => {
                event.preventDefault(); event.stopPropagation();
                if (picker.dataset.saving) return;
                try {
                    picker.dataset.saving = "true";
                    const annotation = this.clone(params.annotation);
                    annotation.type = internal._state?.textSelectionAnnotationMode || "highlight"; annotation.color = c.hex;
                    const draftKey = String(reader.itemID || reader._item?.id || "") + "/" + Annota._normText(annotation.text || "");
                    const draft = Annota._nativeCommentDrafts?.get(draftKey);
                    if (draft) annotation.comment = draft.value;
                    const created = internal._annotationManager.addAnnotation(utils.cloneInto(annotation, reader._iframeWindow));
                    if (!created) throw Error("Highlight creation is unavailable or read-only.");
                    if (draft) Annota._nativeCommentDrafts.delete(draftKey);
                    internal.setSelectedAnnotations?.(utils.cloneInto([created.id], reader._iframeWindow));
                    internal._primaryView?.clearSelection?.();
                    internal._updateState?.(utils.cloneInto({ primaryViewSelectionPopup: null, secondaryViewSelectionPopup: null }, reader._iframeWindow));
                    internal.setA11yMessage?.("Highlight created");
                    popup.style.display = "none";
                }
                catch (error) { delete picker.dataset.saving; button.title = error.message; log("Custom highlight: " + error); }
            }); picker.appendChild(button);
        }
        native.style.display = "none"; native.insertAdjacentElement("afterend", picker);
    },
    install() {
        this._nativeColors = Object.getOwnPropertyDescriptor(Annota, "COLORS").get;
        this._prompts = Annota.getColorPrompts; this._labels = Annota.getColorLabels;
        const palette = this;
        Object.defineProperty(Annota, "COLORS", { configurable: true, get() {
            const state = palette.read();
            return state ? state.colors.filter(c => !c.archived).map(c => ({ ...c, name: c.label })) : palette.nativeColors();
        } });
        Annota.getColorPrompts = () => this.map(); Annota.getColorLabels = () => this.labels();
    }
};
AnnotaPalette.install();
Annota.palette = AnnotaPalette;
