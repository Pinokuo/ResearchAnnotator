/* Local query workspace over existing annotation, storage, note and job services. */
var AnnotaExplorer = {
    cache: new Map(), pending: new Map(), windows: new Map(), listeners: new Set(), observers: [], revision: 0,
    clone(value) { return AnnotaData.clone(value); },
    fold(value) { return String(value ?? "").normalize("NFKC").toLocaleLowerCase(); },
    check(token) { if (token?.cancelled || this.stopping) { const error = Error("Search superseded"); error.cancelled = true; throw error; } },
    async yield(token) { this.check(token); await AnnotaResearchNotes.yield(); this.check(token); },
    defaults(scope) { return { text: "", scope: {...scope,includeNonPDF:true}, filters: { logic: "and", children: [] }, sort: { key: "publication", direction: "asc" },
        group: { key: "publication" }, display: { publication: true, authors: true, color: true, page: true, text: true, comment: true, tags: true, global: true, colorFields: true, status: true } }; },
    saved() {
        const raw = Zotero.Prefs.get("researchannotator.explorerSearches");
        return this.clone(AnnotaData.validateExplorerSearches(raw ? JSON.parse(raw) : { version: 1, searches: [] })).searches;
    },
    save(query, { id, name } = {}) {
        AnnotaData.validateExplorerQuery(query);
        const entries = this.saved(), existing = entries.findIndex(s => s.id === id);
        const value = { ...this.clone(query), id: id || Annota.newFieldID("search"), name: String(name || query.name || "Research search").trim() };
        if (existing < 0) entries.push(value); else entries[existing] = value;
        const data = AnnotaData.validateExplorerSearches({ version: 1, searches: entries });
        Zotero.Prefs.set("researchannotator.explorerSearches", JSON.stringify(data)); return value;
    },
    deleteSearch(id) { Zotero.Prefs.set("researchannotator.explorerSearches", JSON.stringify({ version: 1, searches: this.saved().filter(s => s.id !== id) })); },
    async record(item, memo = {}) {
        memo.attachments ||= new Map(); memo.parents ||= new Map(); memo.schemas ||= new Map();
        if (!memo.attachments.has(item.parentID)) memo.attachments.set(item.parentID, await Zotero.Items.getAsync(item.parentID));
        const attachment = memo.attachments.get(item.parentID); if (!attachment || attachment.deleted) return null;
        const parentID = attachment.parentID || attachment.id;
        if (!memo.parents.has(parentID)) memo.parents.set(parentID, attachment.parentID ? await Zotero.Items.getAsync(parentID) : attachment);
        const parent = memo.parents.get(parentID); if (!parent || parent.deleted) return null;
        const colorKey = Annota.keyForItem(item);
        if (!memo.schemas.has(colorKey)) memo.schemas.set(colorKey, Annota.annotationFields(colorKey));
        const schema = memo.schemas.get(colorKey), values = AnnotaCardFields.get(item)?.values || {};
        const fields = {}, fieldLabels = {}, statuses = {};
        for (const field of schema) {
            const raw = values[field.name];
            fields[field.id] = { value: raw, label: Annota.fieldDisplayValue(field, raw), type: field.type, scope: field.scope };
            fieldLabels[field.id] = field.label || field.name;
            if (field.type === "ai") statuses[field.id] = AnnotaInfrastructure.lifecycle.describe(item, field).state;
        }
        let page = item.annotationPageLabel || "", pageNumber = 0;
        try { const pos = typeof item.annotationPosition === "string" ? JSON.parse(item.annotationPosition) : item.annotationPosition;
            if (typeof pos?.pageIndex === "number") { pageNumber = pos.pageIndex + 1; page ||= String(pageNumber); } } catch (_) {}
        const library = AnnotaResearchNotes.library(item.libraryID), color = AnnotaPalette.resolve(colorKey);
        const tags = (item.getTags?.() || []).map(t => typeof t === "string" ? t : t.tag).filter(Boolean);
        const authors = (parent.getCreators?.() || []).map(c => [c.firstName, c.lastName || c.name].filter(Boolean).join(" "));
        const collections = new Set();
        for (const id of [...(parent.getCollections?.() || []), ...(attachment.getCollections?.() || [])]) {
            const collection = Zotero.Collections?.get?.(id); if (collection) collections.add(collection.key);
        }
        const row = { id: item.id, key: item.key, libraryID: item.libraryID, library: AnnotaData.libraryKey(library), identity: { library, key: item.key },
            publication: parent.key, title: parent.getDisplayTitle?.() || parent.getField?.("title") || parent.key,
            parentID, attachment: attachment.key, attachmentID: attachment.id, attachmentTitle: attachment.getDisplayTitle?.() || attachment.key,
            authors, year: parent.getField?.("date")?.match(/\d{4}/)?.[0] || "", color: color?.id || colorKey,
            colorLabel: color?.label || Annota.getColorLabels()[item.annotationColor] || item.annotationColor || "", hex: item.annotationColor,
            type: item.annotationType || "", text: item.annotationText || "", comment: item.annotationComment || "", tags,
            page, pageNumber, date: String(item.dateAdded || ""), collections: [...collections], fields, fieldLabels, statuses,
            aiTrigger:Annota.aiGenerationTrigger(colorKey) };
        row.searchText = this.fold([row.text, row.comment, ...tags, row.title, ...authors, row.colorLabel,
            ...Object.values(fields).map(f => AnnotaCardFields.plain(f.label))].join("\n"));
        return row;
    },
    inScope(row, scope) {
        if (row.library !== AnnotaData.libraryKey(scope.library)) return false;
        if (scope.kind === "collection") return row.collections.includes(scope.key);
        if (scope.kind === "publications") return scope.keys.includes(row.publication);
        if (scope.kind === "attachments") return scope.keys.includes(row.attachment);
        return true;
    },
    async dataset(scope, token) {
        const key = JSON.stringify(AnnotaResearchNotes.canonical(scope));
        this.check(token);
        if (this.cache.has(key)) return this.cache.get(key);
        if(!this.pending.has(key)){
            const task=this.buildDataset(scope,key).finally(()=>{if(this.pending.get(key)===task)this.pending.delete(key);});this.pending.set(key,task);
        }
        try{const result=await this.pending.get(key);this.check(token);return result;}
        catch(error){if(error.cancelled&&!token?.cancelled&&!this.stopping)return this.dataset(scope,token);throw error;}
    },
    async buildDataset(scope,key) {
        const revision = this.revision;
        await AnnotaCardFields.load();
        const data = await AnnotaResearchNotes.items({ ...scope, includeNonPDF: true }), rows = [], memo = {};
        let slice=Date.now();
        for (let index = 0; index < data.annotations.length; index++) {
            if (index % 100 === 0) { this.check();if(index===0||Date.now()-slice>=8){await this.yield();slice=Date.now();} }
            const row = await this.record(data.annotations[index], memo); if (row) rows.push(row);
        }
        this.check();
        if (revision !== this.revision) { const error = Error("Sources changed during discovery; search again"); error.cancelled = true; throw error; }
        const result = { scope: this.clone(scope), rows, byID: new Map(rows.map(row => [row.id, row])) };
        this.cache.set(key, result); if (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value);
        return result;
    },
    values(row, filter) {
        if (filter.property === "field") {
            const field = row.fields[filter.fieldID]; if (!field) return [];
            const value = field.value;
            if (Array.isArray(value)) return value.map(String);
            if (field.type === "select" && filter.categoryIDs) {
                const catalog = Annota.categoryCatalog()[filter.fieldID] || {};
                return Object.entries(catalog).filter(([id, label]) => label === value || filter.categoryAliases?.[id]?.includes(String(value))).map(([id]) => id);
            }
            return value === undefined || value === null ? [] : [String(value)];
        }
        const map = { library: row.library, collection: row.collections, publication: row.publication, year: row.year, author: row.authors,
            attachment: row.attachment, color: row.color, type: row.type, tag: row.tags, status: Object.values(row.statuses), text: row.text, comment: row.comment };
        const value = map[filter.property]; return Array.isArray(value) ? value : value === undefined ? [] : [String(value)];
    },
    matches(row, node) {
        if (node.children) return !node.children.length || (node.logic === "or" ? node.children.some(child => this.matches(row, child)) : node.children.every(child => this.matches(row, child)));
        // Deleted definitions stay visibly unresolved; even negative/empty operators must not broaden a search silently.
        if (node.property === "field" && !row.fields[node.fieldID]) return false;
        const raw = this.values(row, node), values = raw.map(v => this.fold(v)), wanted = node.values.map(v => this.fold(v));
        const empty = !raw.some(v => String(v).trim());
        switch (node.operator) {
            case "empty": return empty;
            case "notEmpty": return !empty;
            case "equals": case "any": return wanted.some(v => values.includes(v));
            case "notEquals": return !wanted.some(v => values.includes(v));
            case "all": return wanted.every(v => values.includes(v));
            case "contains": {
                const display = node.property === "field" ? this.fold(row.fields[node.fieldID].label) : values.join("\n");
                return wanted.every(v => display.includes(v));
            }
            case "notContains": {
                const display = node.property === "field" ? this.fold(row.fields[node.fieldID].label) : values.join("\n");
                return wanted.every(v => !display.includes(v));
            }
            default: return false;
        }
    },
    sortValue(row, choice) {
        return choice?.key === "field" ? row.fields[choice.fieldID]?.label || "" :
            choice?.key === "publication" ? row.title : choice?.key === "color" ? row.colorLabel :
            choice?.key === "page" ? row.pageNumber : row[choice?.key] || "";
    },
    async evaluate(rows, query, token) {
        const result = [], text = this.fold(query.text).trim();let slice=Date.now();
        for (let i = 0; i < rows.length; i++) {
            if (i % 128 === 0) { this.check(token);if(i===0||Date.now()-slice>=8){await this.yield(token);slice=Date.now();} }
            const row = rows[i]; if ((!text || row.searchText.includes(text)) && this.matches(row, query.filters)) result.push(row);
        }
        const sort = query.sort || { key: "publication" }, group = query.group;
        const collator=new Intl.Collator(undefined,{numeric:true});
        const compare = (a,b) => typeof a === "number" && typeof b === "number" ? a-b : collator.compare(String(a),String(b));
        result.sort((a,b) => (group && group.key !== "none" ? compare(this.sortValue(a,group),this.sortValue(b,group)) : 0) ||
            compare(this.sortValue(a,sort),this.sortValue(b,sort)) * (sort.direction === "desc" ? -1 : 1) || a.key.localeCompare(b.key));
        this.check(token); return result;
    },
    async query(query, { token, offset = 0, limit = 40 } = {}) {
        AnnotaData.validateExplorerQuery(query); const started = Date.now(), cached = this.cache.size;
        const data = await this.dataset(query.scope, token), rows = await this.evaluate(data.rows, query, token);
        const fields = AnnotaResearchNotes.fields([]), known = new Set(fields.map(f => f.id)), unresolved = [];
        const visit = node => node.children ? node.children.forEach(visit) : node.property === "field" && !known.has(node.fieldID) && unresolved.push(node.fieldID);
        visit(query.filters);
        return { rows: rows.slice(Math.max(0, offset), Math.max(0, offset) + Math.min(200, Math.max(1, limit))), total: rows.length,
            unresolved: [...new Set(unresolved)], milliseconds: Date.now() - started, cachedScopes: cached, scanned: data.rows.length };
    },
    fields() { return AnnotaResearchNotes.fields([]); },
    libraries() { return AnnotaData.libraries().map(({library,identity})=>({identity,libraryID:library.libraryID,label:library.name || String(library.libraryID)})); },
    async collections(library) {
        const lib=AnnotaData.resolveLibrary(library);if(!lib)return [];
        const rows=await Zotero.Collections.getByLibrary(lib.libraryID,true);
        return rows.map(c=>({key:c.key,label:c.name}));
    },
    async choices(scope, property, fieldID) {
        const data=await this.dataset(scope), values=new Map(), field=this.fields().find(f=>f.id===fieldID);
        if(property==="field" && field && ["select","multiselect"].includes(field.type)) {
            const items=[];for(const row of data.rows){const item=await Zotero.Items.getAsync(row.id);if(item)items.push(item);}
            return AnnotaResearchNotes.fieldValues(items,field);
        }
        for(const row of data.rows){
            const filter={property,fieldID};
            for(const value of this.values(row,filter)) if(String(value).trim())values.set(String(value),property==="publication"?row.title:property==="attachment"?row.attachmentTitle:property==="color"?row.colorLabel:String(value));
        }
        return [...values].sort((a,b)=>a[1].localeCompare(b[1],undefined,{numeric:true}));
    },
    openNotes(main, query) { AnnotaData.validateExplorerQuery(query); return AnnotaResearchNotes.openExplorer(main,this.clone(query)); },
    async nativeSnapshot(identity){const item=await AnnotaInfrastructure.resolve(identity);return {comment:item.annotationComment||"",tags:this.clone(item.getTags?.()||[])};},
    async selectItems(items, query) {
        AnnotaData.validateExplorerQuery(query); const rows = [], memo = {}, byKey = new Map();
        for (let i=0; i<items.length; i++) { if (i%100===0) await this.yield(); const row = await this.record(items[i],memo); if (row) { rows.push(row); byKey.set(row.key,items[i]); } }
        return (await this.evaluate(rows, query)).map(row => byKey.get(row.key));
    },
    async changed(ids) {
        if (this.stopping) return;
        this.revision++;const memo={};
        if(!this.cache.size){for(const listener of this.listeners){try{listener();}catch(error){log(error);}}return;}
        for (const id of ids) {
            const item = await Zotero.Items.getAsync(id);
            if (item && !item.isAnnotation?.()) {
                if (!item.isNote?.()) this.cache.clear();
                continue;
            }
            const row = item && !item.deleted && !Annota._deletedAnnotationKeys?.has(item.libraryID + ":" + item.key) ? await this.record(item,memo) : null;
            for (const data of this.cache.values()) {
                data.byID.delete(id); if (row && this.inScope(row, data.scope)) data.byID.set(id, row);
            }
        }
        for(const data of this.cache.values())data.rows=[...data.byID.values()];
        for (const listener of this.listeners) { try { listener(); } catch (error) { log(error); } }
    },
    invalidate() { this.revision++; this.cache.clear(); for (const listener of this.listeners) {try{listener();}catch(error){log("Explorer refresh: "+error);}} },
    async saveManual(identity, patchByID, expectedByID, expectedColor) {
        const item = await AnnotaInfrastructure.resolve(identity), key = Annota.keyForItem(item);
        if (key !== expectedColor) throw Error("Annotation color changed. Reload before saving.");
        const schema = Annota.annotationFields(key), patch = {}, expected = {};
        if(Zotero.Libraries.get(item.libraryID)?.editable===false)throw Error("Library is read-only");
        for (const [id,value] of Object.entries(patchByID)) {
            const field = schema.find(f => f.id === id);
            if (!field || field.type === "ai") throw Error("Field is unavailable or read-only");
            patch[field.name] = value; expected[field.name] = expectedByID[id];
        }
        await AnnotaCardFields.saveValues(item, patch, undefined, expected, undefined, { strictExpected: true });
        AnnotaCardFields.refreshViews(); await Annota._syncPaperResearchNote(item); await this.changed([item.id]);
    },
    nativeQueues: new Map(),
    async saveNative(identity, patch, expected) {
        const key = JSON.stringify(identity), prior = this.nativeQueues.get(key) || Promise.resolve();
        const task = prior.catch(() => {}).then(async () => {
            const item = await AnnotaInfrastructure.resolve(identity);
            if (item.library?.editable === false || Zotero.Libraries.get(item.libraryID)?.editable === false) throw Error("Library is read-only");
            if (AnnotaCardFields._maintenance) throw Error("Data maintenance in progress");
            const commit = async () => {
                const tags = (item.getTags?.() || []).map(t => typeof t === "string" ? { tag:t, type:0 } : t);
                if (Object.hasOwn(patch,"comment") && item.annotationComment !== expected.comment ||
                    Object.hasOwn(patch,"tags") && JSON.stringify(tags) !== JSON.stringify(expected.tags)) throw Error("Native data changed in another view. Reload before saving.");
                const before = { comment: item.annotationComment, tags };
                try {
                    if (Object.hasOwn(patch,"comment")) item.annotationComment = String(patch.comment);
                    if (Object.hasOwn(patch,"tags")) item.setTags(patch.tags);
                    if (Zotero.DB?.executeTransaction && item.save) await item.save(); else await item.saveTx();
                } catch(error) { item.annotationComment=before.comment; item.setTags?.(before.tags); throw error; }
            };
            if (Zotero.DB?.executeTransaction) await Zotero.DB.executeTransaction(commit); else await commit();
            AnnotaCardFields.refreshViews(); await Annota._syncPaperResearchNote(item); await this.changed([item.id]);
        });
        this.nativeQueues.set(key,task); try { await task; } finally { if(this.nativeQueues.get(key)===task)this.nativeQueues.delete(key); }
    },
    async regenerate(identity, fieldID, retry = false) {
        const item = await AnnotaInfrastructure.resolve(identity), field = Annota.annotationFields(Annota.keyForItem(item)).find(f => f.id === fieldID && f.type === "ai");
        if (!field) throw Error("AI field unavailable");
        const state = AnnotaInfrastructure.lifecycle.describe(item,field).state;
        if (retry && !["failed","cancelled"].includes(state)) throw Error("This field has no failed operation to retry");
        const id=await AnnotaInfrastructure.jobs.enqueue("structured-ai", { annotation:identity,fieldIds:[fieldID],regenerate:true },
            {dedupe:"explorer-ai:"+JSON.stringify(identity)+":"+fieldID,paid:true});
        if(AnnotaInfrastructure.state.jobs[id].state==="failed")await AnnotaInfrastructure.jobs.resume(id,{acknowledgePaid:true});
        return id;
    },
    async generateMissing(identity) { return Annota.requestAIFields(await AnnotaInfrastructure.resolve(identity)); },
    async navigate(main, identity, publication = false) {
        const item = await AnnotaInfrastructure.resolve(identity), attachment = await Zotero.Items.getAsync(item.parentID);
        if (publication) return main.ZoteroPane.selectItem(attachment.parentID || attachment.id);
        return Zotero.Reader.open(attachment.id, { annotationID:item.key });
    },
    async editor(doc, host, identity) {
        const item = await AnnotaInfrastructure.resolve(identity), schema = Annota.annotationFields(Annota.keyForItem(item));
        const expectedColor = Annota.keyForItem(item), resolved = AnnotaCardFields.get(item) || {values:{}}, expected = {};
        for (const field of schema) expected[field.id] = this.clone(resolved.values[field.name] ?? "");
        let form;
        const save = async () => {
            const values = AnnotaCardFields.read(form), patch = {};
            for (const name of form._changed) { const field=schema.find(f=>f.name===name); if(field && field.type!=="ai")patch[field.id]=values[name]; }
            try {
                await this.saveManual(identity,patch,expected,expectedColor);
                for(const [id,value] of Object.entries(patch))expected[id]=this.clone(value);
                form._dirty=false;form._changed.clear();form._status.textContent="Saved";
            } catch(error){form._status.textContent=error.message;throw error;}
        };
        form=AnnotaCardFields.build(doc,host,{schema},{save,refresh:()=>{if(!form._dirty){const fresh=AnnotaCardFields.get(item)||{values:{}};AnnotaCardFields.fill(form,fresh);for(const field of schema)expected[field.id]=this.clone(fresh.values[field.name]??"");}}});
        form._itemIdentity=item;AnnotaCardFields.fill(form,resolved);
        // Shared retry controls require native reader-card context; Explorer supplies explicit lifecycle actions instead.
        for(const field of Object.values(form._fields))if(field.retry)field.retry.hidden=true;
        host.appendChild(form);return {form,save};
    },
    install() {
        this.stopping=false;
        const notify=Annota.notifierCallback.notify;
        Annota.notifierCallback.notify=(...args)=>{notify.apply(Annota.notifierCallback,args);if(args[1]==="item")this.changed(args[2]).catch(e=>log("Explorer update: "+e));};
        for(const method of ["saveValues","saveMetadata"]){const original=AnnotaCardFields[method];AnnotaCardFields[method]=async function(item,...args){const value=await original.call(this,item,...args);try{if(item?.id)await AnnotaExplorer.changed([item.id]);else AnnotaExplorer.invalidate();}catch(error){log("Explorer cache update failed after successful save: "+error);AnnotaExplorer.invalidate();}return value;};}
        for(const key of ["palette","globalFields","colorPrompts","fieldCategories","fieldAliases","explorerSearches"]){
            if(Zotero.Prefs.registerObserver)this.observers.push(Zotero.Prefs.registerObserver("researchannotator."+key,()=>this.invalidate()));
        }
    },
    addToWindow(main) {
        if(typeof AnnotaWorkspace!=="undefined")return AnnotaWorkspace.addToWindow(main);
    },
    open(main, query) {
        if(typeof AnnotaWorkspace!=="undefined")return AnnotaWorkspace.open(main,"explorer",query);
        const error=Error("Research Workspace did not initialize; restart the extension and inspect Zotero's error console.");Services.prompt.alert(main,"Research Workspace",error.message);throw error;
    },
    async openNetwork(main,query,entity){const win=await AnnotaWorkspace.open(main,'network');await win.workspaceHost.request('network',{network:{query,entity}});return win;},
    close(main){main.document.getElementById("researchannotator-explorer")?.remove();this.windows.get(main)?.close();this.windows.delete(main);},
    stop(){this.stopping=true;for(const main of [...this.windows.keys()])this.close(main);for(const id of this.observers)Zotero.Prefs.unregisterObserver(id);this.observers=[];this.cache.clear();this.listeners.clear();}
};
