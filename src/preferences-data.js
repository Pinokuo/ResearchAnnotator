/* Palette and Data Management preferences. All imports require a reviewed plan. */
(function () {
    const NS = "http://www.w3.org/1999/xhtml";
    const el = (tag, text) => { const node = document.createElementNS(NS, tag); if (text !== undefined) node.textContent = text; return node; };
    const api = () => Zotero.Annota;
    const dispatch = name => document.dispatchEvent(new document.defaultView.Event(name));
    const button = (text, fn) => {
        const node = el("button", text); node.type = "button"; node.className = "annota-button";
        node.addEventListener("click", async () => {
            node.disabled = true;
            try { await fn(); }
            catch (error) { const status = node.closest?.("#annota-palette-editor") ? document.getElementById("annota-palette-status") : document.getElementById("annota-data-status"); if (status) status.textContent = error.message; }
            finally { node.disabled = false; }
        }); return node;
    };
    const input = (type, value, label) => { const node = el("input"); node.type = type; node.value = value; node.className = "annota-input"; node.setAttribute("aria-label", label); return node; };
    function confirmAction(message) {
        if (typeof document.defaultView.confirm === "function") return document.defaultView.confirm(message);
        if (typeof Services !== "undefined" && Services.prompt) return Services.prompt.confirm(document.defaultView, "ResearchAnnotator", message);
        throw Error("Confirmation dialog unavailable; nothing changed.");
    }
    function paletteEditor(openID) {
        const host = document.getElementById("annota-palette-editor"), palette = api()?.palette;
        if (!host || !palette) return;
        const panel = document.getElementById("annota-color-config-panel"), parking = document.getElementById("annota-palette-parking");
        const park = () => { if (panel && parking) parking.appendChild(panel); };
        park(); host.replaceChildren();
        const status = el("div"); status.id = "annota-palette-status"; status.setAttribute("role", "status");
        const logo=document.getElementById("researchannotator-settings-logo");if(logo)logo.src=api().rootURI+"icon96.png";
        const toolbar = el("div"); toolbar.className = "annota-palette-toolbar";
        const preset = el("select"); preset.className = "annota-input"; preset.setAttribute("aria-label", "Palette preset");
        for (const [value, title] of [["default", "Default Zotero palette"], ["accessible", "Color vision accessibility (Okabe-Ito)"], ["pastel", "Pastel palette"], ["custom", "Custom palette"]]) {
            const option = el("option", title); option.value = value; preset.appendChild(option);
        }
        preset.value = palette.ensure().preset;
        toolbar.append(preset, button("Apply Preset", async () => {
            dispatch("annota-preferences-flush"); await palette.preset(preset.value); dispatch("annota-palette-changed"); paletteEditor();
        }));
        const add = el("details"), addSummary = el("summary", "Add Color"); add.className = "annota-palette-add";
        const newHex = input("color", "#6699cc", "New color"), newLabel = input("text", "New color", "New semantic label");
        add.append(addSummary, newHex, newLabel, button("Add Color", () => {
            dispatch("annota-preferences-flush"); palette.add(newHex.value, newLabel.value.trim()); dispatch("annota-palette-changed"); paletteEditor();
        })); toolbar.appendChild(add); host.appendChild(toolbar);
        const explanation = el("details"), explanationText = el("p", "Presets archive other colors without deleting definitions, old colors, highlights or values. Default restores the original swatches/order while preserving existing semantic labels and definitions.");
        explanation.className = "annota-help"; explanation.append(el("summary", "Preset behavior"), explanationText); host.appendChild(explanation);
        const counts = new Map(), rows = [];
        const count = color => Object.values(color.configs).reduce((sum, config) => sum + api().parseFieldSchema(config?.fields || "").length, 0);
        api().refreshPaletteCounts = () => {
            for (const [id, node] of counts) { const current = palette.resolve(id); if (current) node.textContent = count(current) + " fields"; }
        };
        const refresh = id => { dispatch("annota-palette-changed"); paletteEditor(id); };
        for (const color of palette.ensure().colors) {
            const row = el("details"), summary = el("summary"), body = el("div"), configHost = el("div");
            row.className = "annota-palette-row"; row.dataset.colorId = color.id;
            body.className = "annota-palette-expanded"; configHost.className = "annota-color-config-host";
            const handle = el("button", "\u2195"); handle.type = "button"; handle.draggable = true; handle.className = "annota-palette-handle";
            handle.id = "annota-color-handle-" + color.id;
            handle.setAttribute("aria-label", "Reorder " + color.label + "; use Arrow Up or Arrow Down"); handle.title = "Drag to reorder, or use Arrow Up/Down";
            handle.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); });
            handle.addEventListener("keydown", event => {
                if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
                event.preventDefault(); event.stopPropagation(); dispatch("annota-preferences-flush");
                palette.move(color.id, event.key === "ArrowUp" ? -1 : 1); refresh();
                document.getElementById(handle.id)?.focus?.();
            });
            handle.addEventListener("dragstart", event => { event.stopPropagation(); event.dataTransfer.setData("application/x-researchannotator-color", color.id); });
            row.addEventListener("dragover", event => {
                if (Array.from(event.dataTransfer?.types || []).includes("application/x-researchannotator-color")) event.preventDefault();
            });
            row.addEventListener("drop", event => {
                const draggedID = event.dataTransfer?.getData("application/x-researchannotator-color");
                if (!draggedID || !palette.resolve(draggedID)) return; // Preserve ordinary text drops into configuration inputs.
                event.preventDefault(); event.stopPropagation(); dispatch("annota-preferences-flush");
                const rect = row.getBoundingClientRect?.();
                palette.reorder(draggedID, color.id, !!rect && event.clientY > rect.top + rect.height / 2); refresh();
            });
            const swatch = el("span"), name = el("span", color.label || color.hex), total = el("span", count(color) + " fields"), expand = el("span");
            swatch.className = "annota-palette-swatch"; swatch.style.backgroundColor = color.hex; swatch.setAttribute("aria-hidden", "true");
            name.className = "annota-palette-name"; name.title = (color.label || color.hex) + " (" + color.hex + ")";
            total.className = "annota-palette-count"; expand.className = "annota-palette-expand"; expand.setAttribute("aria-hidden", "true");
            summary.append(handle, swatch, name, total, expand); counts.set(color.id, total);
            if (color.archived) name.textContent += " (Archived)";
            const label = input("text", color.label, "Semantic color label"), hex = input("text", color.hex, "Hexadecimal color"), picker = input("color", color.hex, "Choose color");
            const identity = el("div"); identity.className = "annota-palette-identity";
            hex.addEventListener("input", () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) picker.value = hex.value; });
            picker.addEventListener("input", () => { hex.value = picker.value; });
            const handling = el("select"); handling.className = "annota-input"; handling.setAttribute("aria-label", "Existing highlights when changing color");
            for (const [value, title] of [["", "Existing highlights: choose handling"], ["keep", "Keep existing highlight colors"], ["recolor", "Recolor existing highlights"]]) {
                const option = el("option", title); option.value = value; handling.appendChild(option);
            }
            const semanticLabel = el("label", "Semantic label"); semanticLabel.className = "annota-palette-semantic-label"; semanticLabel.appendChild(label);
            const recolor=el("details"),recolorTitle=el("summary","Existing annotation color handling");recolor.append(recolorTitle,handling);identity.append(semanticLabel, picker, hex, recolor, button("Save changes", async () => {
                dispatch("annota-preferences-flush"); await palette.update(color.id, { hex: hex.value.trim(), label: label.value.trim() }, handling.value); refresh(color.id);
            }));
            const actions = el("div"); actions.className = "annota-palette-toolbar";
            const deletion = el("div"); deletion.className = "annota-color-delete-options"; deletion.hidden = true;
            actions.append(button("Up", () => { dispatch("annota-preferences-flush"); palette.move(color.id, -1); refresh(color.id); }),
                button("Down", () => { dispatch("annota-preferences-flush"); palette.move(color.id, 1); refresh(color.id); }),
                button(color.archived ? "Restore Color" : "Archive Color", async () => {
                    dispatch("annota-preferences-flush"); await palette.update(color.id, { archived: !color.archived }, "keep"); refresh(color.id);
                }));
            const deleteButton = button("\u00d7", async () => {
                    dispatch("annota-preferences-flush"); const used = await palette.usage(color.id);
                    (row.open ? body : host).appendChild(deletion);
                    deletion.replaceChildren(); deletion.hidden = false;
                    deletion.appendChild(el("p", used.canDelete ? "Unused color. Permanent deletion removes this color configuration and its field definitions." :
                        "Permanent deletion is blocked. " + (!palette.isCustom(color) ? "Default colors can be archived. " : "") +
                        "Associated highlights: " + used.annotations.length + "; stored records: " + used.records.length + "; categorical history: " + used.categoricalHistory.length +
                        "; managed note references: "+(used.noteReferences?.length||0)+"; archived reassignment links: " + used.reassignmentSources.length + ". Archive preserves the color identity and all historical values."));
                    if (used.canDelete) deletion.appendChild(button("Permanently Delete Color", async () => {
                        if (!confirmAction('Permanently delete unused color "' + color.label + '" and its configuration? This cannot be undone.')) return;
                        dispatch("annota-preferences-flush"); await palette.deleteColor(color.id, { confirmed: true }); refresh();
                    }));
                    else {
                        deletion.appendChild(button("Archive Instead", async () => { await palette.update(color.id, { archived: true }, "keep"); refresh(color.id); }));
                        if (used.annotations.length) {
                        const target = el("select"); target.className = "annota-input"; target.setAttribute("aria-label", "Reassign highlights to color");
                        for (const candidate of api().COLORS.filter(c => c.id !== color.id)) { const option = el("option", candidate.label || candidate.name); option.value = candidate.id; target.appendChild(option); }
                        deletion.append(el("p", "Reassign and Delete removes this color from the active palette but retains its historical identity and values for recovery. Reassignment keeps original color values archived and keeps target field values separate. Native Comments and Tags are unchanged."), target,
                            button("Reassign and Delete from Active Palette", async () => {
                                if (!confirmAction('Reassign highlights from "' + color.label + '" and archive its original configuration/values? Finish saving active highlight edits first.')) return;
                                const result = await palette.reassignAndArchive(color.id, target.value, { confirmed: true }); refresh(color.id);
                                if (result.noteErrors.length) document.getElementById("annota-palette-status").textContent =
                                    "Highlights reassigned and original values archived. Note refresh needs retry: " + result.noteErrors.map(entry => entry.error).join("; ");
                            }));
                        }
                    }
                    deletion.appendChild(button("Cancel", () => { deletion.hidden = true; deleteButton.focus?.(); }));
                    deletion.focus?.();
                });
            deleteButton.className += " annota-palette-delete";
            deleteButton.title = "Delete Color: " + (color.label || color.hex);
            deleteButton.setAttribute("aria-label", deleteButton.title);
            const deleteText = el("span", "Delete Color"); deleteText.className = "annota-visually-hidden";
            const trash = el("span"); trash.className = "annota-trash-icon"; trash.setAttribute("aria-hidden", "true");
            deleteButton.replaceChildren();deleteButton.append(deleteText,el("span","\u00d7"));
            deleteButton.addEventListener("click", event => { event.preventDefault(); event.stopPropagation(); });
            deleteButton.addEventListener("keydown", event => { if (["Enter", " "].includes(event.key)) event.stopPropagation(); });
            actions.appendChild(deleteButton);
            deletion.setAttribute("role", "group"); deletion.setAttribute("aria-label", "Color deletion options"); deletion.setAttribute("tabindex", "-1");
            actions.className="ra-inline-color-actions";actions.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();});summary.appendChild(actions);
            const rename=button("Rename",()=>{row.open=true;label.focus();label.select();});actions.appendChild(rename);label.addEventListener("change",async()=>{try{await palette.update(color.id,{label:label.value.trim()},"keep");name.textContent=label.value;dispatch("annota-palette-changed");}catch(error){status.textContent=error.message;}});body.append(identity, configHost, identity.children[identity.children.length-1], deletion); row.append(summary, body); rows.push(row);
            row.addEventListener("toggle", () => {
                if (!row.isConnected) return;
                if (row.open) {
                    for (const other of rows) if (other !== row) other.open = false;
                    if (panel) {
                        if (!api().colorPreferences) { status.textContent = "Color field editor is loading. Collapse and reopen this row."; return; }
                        api().colorPreferences.select(palette.resolve(color.id).hex); configHost.appendChild(panel);
                    }
                }
                else {
                    if (!deletion.hidden) host.appendChild(deletion);
                    if (panel?.parentNode === configHost) { api().colorPreferences?.flush(); park(); }
                }
            });
            host.appendChild(row); if (color.id === openID) row.open = true;
        }
        host.appendChild(status);
    }
    async function saveJSON(kind) {
        dispatch("annota-preferences-flush");
        const data = await api().data.export(kind);
        const { FilePicker } = ChromeUtils.importESModule("chrome://zotero/content/modules/filePicker.mjs");
        const picker = new FilePicker(); picker.init(window, "Export ResearchAnnotator " + kind, picker.modeSave);
        picker.appendFilter("JSON files", "*.json"); picker.defaultString = "ResearchAnnotator-" + kind + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";
        const result = await picker.show();
        if (result !== picker.returnOK && result !== picker.returnReplace) return;
        const path = /\.json$/i.test(picker.file) ? picker.file : picker.file + ".json";
        await IOUtils.writeJSON(path, data, { tmpPath: path + ".tmp" });
        document.getElementById("annota-data-status").textContent = "Exported " + path + (data.research?.unmatched.length ? "; recovery-only unmatched records: " + data.research.unmatched.length : "");
    }
    function dataManager() {
        const host = document.getElementById("annota-data-actions"), data = api()?.data;
        if (!host || !data) return;
        const file = document.getElementById("annota-data-file"), panel = document.getElementById("annota-data-import"), mode = document.getElementById("annota-data-mode"),
            conflict = document.getElementById("annota-data-conflict"), preview = document.getElementById("annota-data-preview-text"), apply = document.getElementById("annota-data-apply"),
            libraryHost = document.getElementById("annota-data-libraries"), status = document.getElementById("annota-data-status");
        let documentData, plan, expectedKind, legacyLabels = false;
        const mappingControls = new Map();
        const invalidate = () => { plan = null; apply.disabled = true; };
        for (const [kind, title] of [["settings", "Settings"], ["research", "Research Data"], ["backup", "Complete Backup"]]) {
            host.append(button(kind === "backup" ? "Create Complete Backup" : "Export " + title, () => saveJSON(kind)),
                button(kind === "backup" ? "Restore Complete Backup" : "Import " + title, () => { expectedKind = kind; file.value = ""; file.click(); }));
        }
        mode.addEventListener("change", invalidate); conflict.addEventListener("change", invalidate);
        file.addEventListener("change", async () => {
            invalidate(); panel.hidden = true;
            try {
                const selected = file.files?.[0]; if (!selected) return;
                if (selected.size > 100 * 1024 * 1024) throw Error("Use a JSON file smaller than 100 MB; split larger exports before importing.");
                dispatch("annota-preferences-flush");
                const parsed = JSON.parse(await selected.text()); legacyLabels = false;
                if (expectedKind === "settings" && !parsed.format && (parsed.labels || Object.keys(parsed).every(key => /^#[0-9a-f]{6}$/i.test(key)))) {
                    const labels = parsed.labels || parsed;
                    if (!data.object(labels) || Object.entries(labels).some(([key, value]) => !/^#[0-9a-f]{6}$/i.test(key) || typeof value !== "string")) throw Error("Invalid legacy color-label file.");
                    const palette = data.clone(api().palette.ensure());
                    for (const [hex, label] of Object.entries(labels)) {
                        const color = api().palette.resolve(hex.toLowerCase(), palette);
                        if (!color) throw Error("Legacy label references an unknown color: " + hex); color.label = label;
                    }
                    documentData = { format: data.format, version: 1, kind: "settings", credentialsIncluded: false, settings: { prefs: { palette } } };
                    legacyLabels = true; mode.value = "merge"; mode.disabled = true;
                }
                else { documentData = data.validate(parsed); mode.disabled = false; }
                if (documentData.kind !== expectedKind) throw Error("This file contains " + documentData.kind + "; choose the matching import action.");
                libraryHost.replaceChildren(); mappingControls.clear();
                const identities = [...(documentData.research?.records || []).map(r => r.library), ...(documentData.settings?.prefs.chatCollections || []).map(r => r.library)];
                const seen = new Set();
                for (const identity of identities) {
                    const key = data.libraryKey(identity); if (seen.has(key)) continue; seen.add(key);
                    const row = el("label", "Source " + key + " → "), select = el("select"); select.className = "annota-input";
                    const auto = data.resolveLibrary(identity), option = el("option", auto ? "Automatic: " + (auto.name || auto.libraryID) : "Unmatched (skip; preserve source)"); option.value = ""; select.appendChild(option);
                    for (const { library } of data.libraries()) {
                        const choice = el("option", "Explicit mapping: " + (library.name || library.libraryType) + " [" + data.libraryKey(data.libraryIdentity(library)) + "]");
                        choice.value = String(library.libraryID); select.appendChild(choice);
                    }
                    select.addEventListener("change", invalidate); row.appendChild(select); libraryHost.appendChild(row); mappingControls.set(key, select);
                }
                panel.hidden = false; preview.textContent = "Choose merge/replace, conflict behavior and any explicit library mappings, then Preview Import. Unmatched records are skipped and reported. Replace never deletes unmatched local annotations. A complete pre-import backup and received-file copy are saved before changes.";
                status.textContent = legacyLabels ? "Legacy label file accepted through the unified settings importer (merge only)." : "Validated " + documentData.kind + " format version " + documentData.version + ". No changes made.";
            }
            catch (error) { status.textContent = "Import rejected: " + error.message; }
        });
        document.getElementById("annota-data-preview").addEventListener("click", async () => {
            invalidate();
            try {
                if (!documentData) throw Error("Select an import file first.");
                dispatch("annota-preferences-flush");
                const mapping = Object.fromEntries([...mappingControls].filter(([, control]) => control.value).map(([key, control]) => [key, Number(control.value)]));
                plan = await data.preview(documentData, { mode: legacyLabels ? "merge" : mode.value, conflict: conflict.value, mapping });
                preview.textContent = JSON.stringify({ behavior: plan.mode, conflictPolicy: plan.conflict, matchingAnnotations: plan.matched.length,
                    settingsChanges: plan.settingsChanges, recordReplacements: plan.recordReplacements, conflicts: plan.conflicts, unmatched: plan.unmatched, notesAndComments: "Untouched; note rebuilding is not part of restore" }, null, 2);
                apply.disabled = !!(plan.conflict === "abort" && plan.conflicts.length);
                status.textContent = "Preview complete. Apply Reviewed Import to back up current state and apply this plan.";
            }
            catch (error) { status.textContent = "Preview rejected: " + error.message + " If stable palette identities collide, inspect the source and use explicit replacement or a matched backup."; }
        });
        apply.addEventListener("click", async () => {
            if (!plan || apply.disabled) return; apply.disabled = true;
            try { const result = await data.apply(plan); status.textContent = JSON.stringify(result); invalidate(); dispatch("annota-settings-imported"); dispatch("annota-palette-changed"); paletteEditor(); }
            catch (error) { status.textContent = "Import failed: " + error.message; invalidate(); }
        });
    }
    function setup(tries = 0) {
        if (!api()?.data || !api()?.palette || !document.getElementById("annota-data-actions")) { if (tries < 120) requestAnimationFrame(() => setup(tries + 1)); return; }
        try { paletteEditor(); }
        catch (error) { document.getElementById("annota-palette-editor").textContent = "Palette setup failed; existing data is retained: " + error.message; }
        dataManager();
        const placement=api().notePresentation,mode=document.getElementById("annota-note-destination-mode");if(placement&&mode){mode.value=placement.preferences().mode;mode.addEventListener("change",()=>{const p=placement.preferences();p.mode=mode.value;placement.savePreferences(p);});}
        const jobs = api()?.backgroundJobs, host = document.getElementById("annota-background-jobs");
        if (jobs && host) {
            const render = () => {
                host.replaceChildren();
                const states = api()?.backgroundJobs;
                if (!states) return;
                for (const job of states.list().slice(-20).reverse()) {
                    const row = el("div"); row.className = "annota-palette-toolbar";
                    row.appendChild(el("span", job.type + ": " + job.state + " (" + Math.round((job.progress || 0) * 100) + "%)"));
                    if (job.error) { const error = el("span", job.error); error.setAttribute("role", "status"); row.appendChild(error); }
                    if (["queued", "running"].includes(job.state)) row.appendChild(button("Pause", () => states.pause(job.id)));
                    if (["paused", "interrupted", "failed"].includes(job.state)) row.appendChild(button("Resume", async () => {
                        const needsReview = job.paid && ["interrupted", "failed"].includes(job.state);
                        if (needsReview && !confirmAction("This AI request may already have been processed or billed. Resume may issue another paid request. Continue?")) return;
                        await states.resume(job.id, { acknowledgePaid: needsReview });
                    }));
                    if (!["completed", "cancelled"].includes(job.state)) row.appendChild(button("Cancel", () => states.cancel(job.id)));
                    host.appendChild(row);
                }
            };
            jobs.listeners.add(render); document.defaultView.addEventListener("unload", () => jobs.listeners.delete(render), { once: true }); render();
        }
    }
    setup();
})();
