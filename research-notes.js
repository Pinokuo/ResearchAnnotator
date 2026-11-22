/* Research Note Generation: orchestration over the shared storage, notes and jobs. */
var AnnotaResearchNotes = {
    windows: new Map(),
    explorerDialogs: new Map(),
    defaults: { publicationTitle: false, authors: false, year: false, citation: false, page: false,
        text: true, color: true, comment: true, tags: false, global: true, colorFields: true,
        globalManual: true, globalAI: true, colorManual: true, colorAI: true, omitEmpty: true },
    contentDefaults(type) { return { ...this.defaults, ...(type !== "pdf" ? { publicationTitle:true } : {}) }; },
    modeConfiguration(selector){
        const configs=this.configs(),matches=configs.filter(c=>AnnotaInfrastructure.notes.identity(c.library,c.scope)===selector||c.id===selector);if(!matches.length)throw Error('Select existing managed notes');if(matches.length!==1)throw Error('Select the note together with its library; this identifier exists in more than one library');return matches[0];
    },
    previewModes(ids,mode){
        if(!['auto','manual','static'].includes(mode))throw Error('Choose a supported note update mode');
        const selected=new Set(ids);if(!selected.size)throw Error('Select existing managed notes');
        const configs=[...selected].map(id=>this.modeConfiguration(id));if(configs.some(c=>!c.noteKey&&!c.orphanedNoteKey))throw Error('Select existing managed notes');
        return configs.map(c=>({id:c.id,identity:AnnotaInfrastructure.notes.identity(c.library,c.scope),title:c.title||c.id,noteKey:c.noteKey||'',before:c.mode,after:mode}));
    },
    async applyModes(preview){
        if(!Array.isArray(preview)||!preview.length)throw Error('Preview the selected note modes first');
        for(const p of preview){const c=this.modeConfiguration(p.identity||p.id);if(!c||c.mode!==p.before||(c.noteKey||'')!==p.noteKey||!['auto','manual','static'].includes(p.after))throw Error('A selected configuration changed. Preview again.');}
        const backup=await AnnotaInfrastructure.backup(AnnotaInfrastructure.path('infrastructure'),AnnotaInfrastructure.state,'before-note-modes');
        const id=await AnnotaInfrastructure.jobs.enqueue('note-modes',{preview,backup},{dedupe:'note-modes:'+Annota.fieldFingerprint(JSON.stringify(preview))});return {id,backup};
    },
    async setMode(config,mode){
        if(!['auto','manual','static'].includes(mode))throw Error('Unsupported note mode');
        const library=AnnotaData.resolveLibrary(config.library);if(!library||library.editable===false)throw Error('Note library unavailable or read-only');
        const current=await AnnotaInfrastructure.notes.recoverOrphan(config),updated={...current,mode};
        await AnnotaInfrastructure.notes.configure(updated);if(mode==='auto')await this.update(updated);return updated;
    },
    async runModes(payload,control,job){
        const completed=[...(job.checkpoint?.completed||[])],failures=[];
        for(const p of payload.preview){const token=p.identity||p.id;control.check();if(completed.includes(token))continue;try{const c=this.modeConfiguration(p.identity||p.id);if(!c||![p.before,p.after].includes(c.mode))throw Error('Configuration changed since preview');await this.setMode(c,p.after);completed.push(token);}catch(error){if(error.stopped)throw error;failures.push({id:p.id,title:p.title,error:String(error.message||error)});}await control.progress(completed.length/payload.preview.length,{completed,failures,backup:payload.backup});}
        if(failures.length)throw Error('Some note modes or updates failed. Review Activity; existing content and backups are preserved.');
    },
    previewDefaults(ids) {
        const selected = new Set(ids), records = this.configs().filter(c => selected.has(c.id));
        if (records.length !== selected.size || !records.length) throw Error('Select existing managed configurations.');
        return records.map(c => ({ id:c.id, title:c.title || c.id, noteKey:c.noteKey || '', before:AnnotaInfrastructure.clone(c.include),
            after:this.contentDefaults(c.scope.type === 'pdf' ? 'pdf' : c.filter?.type || 'field') }));
    },
    async applyDefaults(preview) {
        if (!Array.isArray(preview) || !preview.length) throw Error('Preview the selected configurations first.');
        for (const p of preview) { const c=Object.values(AnnotaInfrastructure.state.notes).find(c=>c.id===p.id); if (!c || (c.noteKey || '') !== p.noteKey || JSON.stringify(c.include)!==JSON.stringify(p.before)) throw Error('A configuration changed. Preview again.'); }
        const backup=await AnnotaInfrastructure.backup(AnnotaInfrastructure.path('infrastructure'),AnnotaInfrastructure.state,'before-note-defaults');
        const id=await AnnotaInfrastructure.jobs.enqueue('note-defaults',{preview,backup},{dedupe:'note-defaults:'+Annota.fieldFingerprint(JSON.stringify(preview))});
        return {id,backup};
    },
    async runDefaults(payload, control, job) {
        const completed=[...(job.checkpoint?.completed || [])], failures=[];
        for (const p of payload.preview) {
            control.check(); if(completed.includes(p.id))continue;
            try {
                const c=Object.values(AnnotaInfrastructure.state.notes).find(c=>c.id===p.id);
                if(c?.mode==='static')throw Error('Static snapshot protected; explicitly change synchronization mode before a content update');
                if(!c || ![JSON.stringify(p.before),JSON.stringify(p.after)].includes(JSON.stringify(c.include)))throw Error('Configuration edited since preview; left unchanged.');
                await AnnotaInfrastructure.notes.configure({...c,include:p.after});
                if(!(c.scope.type==='research'&&c.filter?.type==='pdf'&&!c.noteKey))await this.update({...c,include:p.after});completed.push(p.id);
            } catch(error) {failures.push({id:p.id,error:String(error.message||error)});}
            await control.progress(completed.length/payload.preview.length,{completed,failures,backup:payload.backup});
        }
        if(failures.length)throw Error('Some notes could not be updated. See Activity; repair and incomplete-data guards remain active.');
    },
    async yield() { await new Promise(resolve => setTimeout(resolve, 0)); },
    library(id) { return AnnotaData.libraryIdentity(Zotero.Libraries.get(id)); },
    async items(scope) {
        const library = AnnotaData.resolveLibrary(scope.library);
        if (!library) throw Error("Source library unavailable");
        let roots;
        if (scope.kind === "library") {
            const search = new Zotero.Search(); search.libraryID = library.libraryID;
            search.addCondition("itemType", "is", "attachment"); roots = await search.search();
        } else if (scope.kind === "collection") {
            const collection = Zotero.Collections.getByLibraryAndKey(library.libraryID, scope.key);
            if (!collection) throw Error("Source collection unavailable");
            roots = collection.getChildItems(true);
        } else if (["publications", "attachments"].includes(scope.kind)) {
            roots = [];
            for (const key of scope.keys || []) {
                const item = await AnnotaData.annotation(library.libraryID, key);
                if (item && !item.deleted) roots.push(item.id);
            }
        } else throw Error("Select a source scope");
        const pdfs = new Map(), annotations = [], publications = new Set();
        const addPDF = async item => {
            if (!item?.isAttachment?.() || (typeof item.isFileAttachment==='function'?!item.isFileAttachment():!(item.isPDFAttachment?.()||/^application\/(?:pdf|epub(?:\+zip)?)$/.test(item.attachmentContentType||''))) || item.deleted || item.libraryID !== library.libraryID) return;
            if (!scope.includeNonPDF && !(item.isPDFAttachment?.() || item.attachmentContentType === "application/pdf")) return;
            pdfs.set(item.key, item);
        };
        for (const id of roots) {
            const item = await Zotero.Items.getAsync(id);
            if (!item || item.deleted || item.libraryID !== library.libraryID) continue;
            if (item.isAttachment?.()) await addPDF(item);
            else if (item.isRegularItem?.() && scope.kind !== "attachments") for (const child of item.getAttachments?.() || []) await addPDF(await Zotero.Items.getAsync(child));
            await this.yield();
        }
        for (const pdf of pdfs.values()) {
            publications.add(pdf.parentID || pdf.id);
            let ids;
            ids = Annota.annotationChildren(pdf,true);
            if (!Array.isArray(ids)) {
                const search = new Zotero.Search(); search.libraryID = library.libraryID;
                search.addCondition("resultLevel", "annotation"); ids = await search.search();
            }
            for (const id of ids) {
                const item = await Zotero.Items.getAsync(id);
                if (item?.isAnnotation?.() && !item.deleted && item.parentID === pdf.id &&
                    !Annota._deletedAnnotationKeys?.has(item.libraryID + ":" + item.key)) annotations.push(item);
            }
            await this.yield();
        }
        return { pdfs: [...pdfs.values()], annotations, publications: publications.size };
    },
    fields(items) {
        const fields = new Map(Annota.getGlobalFields().map(field => [field.id, field]));
        for (const color of this.colors()) for (const key of [color.hex, "image:" + color.hex]) {
            for (const field of Annota.annotationFields(key)) fields.set(field.id, field);
        }
        for (const item of items) for (const field of Annota.annotationFields(Annota.keyForItem(item))) fields.set(field.id, field);
        return [...fields.values()];
    },
    configs() { return Object.values(AnnotaInfrastructure.state.notes).map(c => {const copy=AnnotaInfrastructure.clone(c);copy.lastSyncError=AnnotaInfrastructure.notes.errors.get(c.id)||null;if(typeof AnnotaNotePresentation!=="undefined"&&c.noteKey){const lib=AnnotaData.resolveLibrary(c.library),note=lib&&Zotero.Items.getByLibraryAndKey?.(lib.libraryID,c.noteKey);copy.noteUnavailable=!note?.isNote?.()||!!note.deleted;if(note?.isNote?.())copy.title=AnnotaNotePresentation.readTitle(note.getNote(),copy.title);}return copy;}); },
    colors() { return AnnotaPalette.read()?.colors || []; },
    fieldValues(items, field) {
        const values = new Map(Object.entries(Annota.categoryCatalog()[field.id] || {}));
        for (const item of items) {
            const f = Annota.annotationFields(Annota.keyForItem(item)).find(f => f.id === field.id);
            if (!f) continue;
            const value = AnnotaCardFields.get(item)?.values[f.name];
            for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
                if (f.type !== "check" && !String(v).trim()) continue;
                const key = f.type === "select" && String(v).trim() ? Annota.categoryIDs(f, [String(v)])[0] : String(v);
                values.set(key, f.type === "check" ? (String(v) === "true" ? "Checked" : "Not checked") : Annota.fieldDisplayValue(f, Array.isArray(value) ? [v] : v));
            }
        }
        return [...values];
    },
    async openNote(win, config) {
        const lib = AnnotaData.resolveLibrary(config.library);
        const note = await AnnotaData.annotation(lib.libraryID, config.noteKey);
        if (!note?.isNote?.() || note.deleted) throw Error("Managed note unavailable");
        await win.ZoteroPane.selectItem(note.id);
    },
    async rename(config, title) {
        const lib = AnnotaData.resolveLibrary(config.library);
        const marker = config.scope.type === "pdf" ? "research-annotator-pdf-note-v1:" + config.scope.key : "research-annotator-managed-note-v1:" + config.id;
        const note = await AnnotaInfrastructure.notes.find(lib.libraryID, marker);
        if (note) {
            const escaped = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const html = note.getNote();
            note.setNote(AnnotaInfrastructure.notes.stamp(html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i,'<h1>'+escaped+'</h1>'),{...config,title}));
            await note.saveTx();
        }
        await AnnotaInfrastructure.notes.configure({ ...config, title, titleEdited:true });
    },
    matches(item, filter) {
        if (!filter || filter.type === "pdf") return true;
        if (filter.type === 'evidence') return filter.annotationKeys.includes(item.key);
        if (filter.type === "color") return filter.colorIDs.includes(AnnotaPalette.resolve(Annota.keyForItem(item))?.id);
        const field = Annota.annotationFields(Annota.keyForItem(item)).find(f => f.id === filter.fieldID);
        if (!field) return false;
        const value = AnnotaCardFields.get(item)?.values[field.name];
        if (Array.isArray(value)) return filter.values?.length ? filter.values.some(v => value.includes(v)) : value.length > 0;
        if (filter.values?.length) {
            const selected = field.type === "select" ? Annota.categoryLabels(field, filter.values) : filter.values;
            return selected.includes(String(value ?? ""));
        }
        return value !== undefined && value !== null && String(value).trim() !== "";
    },
    async inspect(scope, filter) {
        await AnnotaCardFields.load();
        const data = filter?.type==='network'?await AnnotaNetwork.evidence(filter,scope):await this.items(scope);
        const items = filter?.type==='network'?data.annotations:filter?.type === "explorer" ? await AnnotaExplorer.selectItems(data.annotations, filter.query) : data.annotations.filter(item => this.matches(item, filter));
        const counts = { publications: data.publications, pdfs: data.pdfs.length, annotations: items.length,
            existing: 0, missing: 0, outdated: 0, failed: 0, pending: 0, requests: 0 };
        for (const item of items) {
            for (const field of Annota.annotationFields(Annota.keyForItem(item)).filter(f => f.type === "ai")) {
                const state = AnnotaInfrastructure.lifecycle.describe(item, field).state;
                if (String(AnnotaCardFields.get(item)?.values[field.name] || "").trim()) counts.existing++;
                if (state === "missing") counts.missing++;
                if (state === "outdated") counts.outdated++;
                if (["failed", "cancelled"].includes(state)) counts.failed++;
                if (["queued", "generating"].includes(state)) counts.pending++;
            }
            await this.yield();
        }
        counts.requests = counts.missing + counts.failed;
        return { ...data, items, counts };
    },
    canonical(value) {
        if (Array.isArray(value)) return value.map(v => this.canonical(v)).sort();
        if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(k => [k, this.canonical(value[k])]));
        return value;
    },
    configurationSignature(scope,filter) {
        if(filter?.type!=="explorer")return JSON.stringify(this.canonical({scope,filter}));
        const semantic=node=>node.children?{logic:node.logic,children:node.children.map(semantic)}:
            Object.fromEntries(["property","fieldID","operator","values","categoryIDs"].filter(key=>node[key]!==undefined).map(key=>[key,node[key]]));
        const query={text:filter.query.text,scope:filter.query.scope,filters:semantic(filter.query.filters)};
        return JSON.stringify(this.canonical({scope,filter:{type:"explorer",query}}));
    },
    configuration(scope, filter, options = {}) {
        const signature = this.configurationSignature(scope,filter);
        const searchID=filter?.type==="explorer"?filter.query.id:null;
        const existing = Object.values(AnnotaInfrastructure.state.notes).find(c => searchID ? c.explorerSearchID===searchID && AnnotaData.libraryKey(c.library)===AnnotaData.libraryKey(scope.library) : c.querySignature === signature);
        return { ...(existing || {}), id: existing?.id || Annota.newFieldID("research"), library: scope.library,
            scope: existing?.scope || { type: "research", key: signature }, querySignature: signature,
            sourceScope: scope, filter, ...(searchID?{explorerSearchID:searchID}:{}), title: existing?.title || options.title || (filter.type==="pdf"?"":typeof AnnotaNotePresentation!=="undefined"?AnnotaNotePresentation.title(scope,filter):"Research Notes"), destination:existing?.destination||options.destination,
            mode: options.mode || existing?.mode || (filter.type==='pdf'?'auto':'manual'), include: { ...this.contentDefaults(filter.type), ...existing?.include, ...options.include } };
    },
    async preview(scope, filter, options) {
        const data = await this.inspect(scope, filter), config = this.configuration(scope, filter, options);
        if(filter.type!=="pdf"&&typeof AnnotaNotePresentation!=="undefined")config.destination=await AnnotaNotePresentation.resolveDestination(scope,options.destination,config);
        if (filter.type === "pdf") {
            const previews = [];
            for (const pdf of data.pdfs) {
                const items = data.items.filter(item => item.parentID === pdf.id); if (!items.length) continue;
                const compiled = await AnnotaInfrastructure.notes.compileAnnotations(items, { ...config, groupByPublication: false });
                const title = String(typeof AnnotaNotePresentation!=="undefined"?AnnotaNotePresentation.pdfTitle(pdf):pdf.getDisplayTitle?.() || pdf.key).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                previews.push('<section><h1>' + title + '</h1>' + compiled.html + '</section>');
                await this.yield();
            }
            return { ...data, config, html: previews.join('<hr/>') };
        }
        const compiled = await AnnotaInfrastructure.notes.compileAnnotations(data.items, config);
        return { ...data, config, html: compiled.html };
    },
    async enqueue(scope, filter, options = {}) {
        const signature = this.configurationSignature(scope,filter);
        return AnnotaInfrastructure.notes.serialize("request:" + signature, async () => {
            const config = this.configuration(scope, filter, options);
            if(filter.type!=="pdf"&&typeof AnnotaNotePresentation!=="undefined")config.destination=await AnnotaNotePresentation.resolveDestination(scope,options.destination,config);
            await AnnotaInfrastructure.notes.configure(config);
            if(filter.type!=="pdf"&&typeof AnnotaNotePresentation!=="undefined"&&config.destination?.kind!=="existing"){const p=AnnotaNotePresentation.preferences();p.last[AnnotaData.libraryKey(scope.library)]=config.destination;AnnotaNotePresentation.savePreferences(p);}
            const portableConfig={...config};for(const key of ["generated","content","noteKey","recordKeys","repairBackup"])delete portableConfig[key];
            return AnnotaInfrastructure.jobs.enqueue("research-notes", { config:portableConfig, ai: options.ai || "existing", regenerateOutdated: !!options.regenerateOutdated },
                { dedupe: "research-notes:" + config.id, paid: options.ai === "missing" || !!options.regenerateOutdated });
        });
    },
    async run(payload, control, job) {
        const infra = AnnotaInfrastructure, config = infra.clone(payload.config);
        // Job payloads are portable intent, never authority over local note ownership.
        delete config.generated; delete config.content; delete config.noteKey; delete config.recordKeys; delete config.repairBackup;
        const data = await this.inspect(config.sourceScope, config.filter);
        const checkpoint = { completedAnnotations: [], completedNotes: [], processedNotes: [], failures: [], ...job.checkpoint };
        const retriedAnnotations = new Set(checkpoint.failures.filter(f => f.annotation).map(f => f.annotation));
        if (retriedAnnotations.size) {
            const affected = config.filter.type === "pdf" ? data.pdfs.filter(pdf => data.items.some(item => item.parentID === pdf.id && retriedAnnotations.has(item.key))).map(pdf => pdf.key) : [config.id];
            checkpoint.completedNotes = checkpoint.completedNotes.filter(key => !affected.includes(key));
            checkpoint.processedNotes = checkpoint.processedNotes.filter(key => !affected.includes(key));
        }
        checkpoint.pendingAI = (payload.ai === "missing" ? data.counts.requests : 0) + (payload.regenerateOutdated ? data.counts.outdated : 0);
        const total = data.items.length + (config.filter.type === "pdf" ? data.pdfs.length : 1);
        const report = async stage => {
            checkpoint.stage = stage;
            await control.progress(Math.min(.99, (checkpoint.completedAnnotations.length + checkpoint.processedNotes.length) / Math.max(1, total)), checkpoint);
        };
        // Failed operations are retried only after an explicit resume. Successes stay checkpointed.
        checkpoint.failures = [];
        await report("AI fields");
        for (const item of data.items) {
            control.check();
            if (checkpoint.completedAnnotations.includes(item.key)) continue;
            try {
                if (payload.ai === "missing" || payload.regenerateOutdated) {
                    for (const field of Annota.annotationFields(Annota.keyForItem(item)).filter(f => f.type === "ai")) {
                        control.check();
                        const state = infra.lifecycle.describe(item, field).state;
                        const missing = payload.ai === "missing" && ["missing", "failed", "cancelled"].includes(state);
                        if (!missing && !(payload.regenerateOutdated && state === "outdated")) continue;
                        await Annota.generateStructuredFields(item, { fieldIds: [field.id], regenerate: state !== "missing", partial: true,
                            control: { check: control.check, completeField: async () => {} } });
                        checkpoint.pendingAI = Math.max(0, checkpoint.pendingAI - 1);
                    }
                }
                checkpoint.completedAnnotations.push(item.key);
            } catch (error) {
                if (error.stopped) throw error;
                checkpoint.failures.push({ annotation: item.key, error: String(error.message || error) });
            }
            await report("AI fields"); await this.yield();
        }
        const targets = config.filter.type === "pdf" ? data.pdfs : [null];
        await report("Research notes");
        for (const pdf of targets) {
            control.check(); const key = pdf?.key || config.id;
            if (checkpoint.processedNotes.includes(key)) continue;
            try {
                const items = pdf ? data.items.filter(item => item.parentID === pdf.id) : data.items;
                if (pdf && !items.length) {
                    checkpoint.skippedPDFs = [...new Set([...(checkpoint.skippedPDFs || []), pdf.key])];
                } else if (pdf) {
                    const pdfConfig = { ...infra.notes.pdfConfig(pdf, pdf.libraryID), include: config.include, mode: config.mode,
                        title: config.title || infra.notes.pdfConfig(pdf, pdf.libraryID).title, sourceScope: config.sourceScope };
                    await infra.notes.synchronize(pdfConfig, items, { manual: true });
                    checkpoint.completedNotes.push(key);
                } else {
                    await infra.notes.synchronize(config, items, { manual: true });
                    checkpoint.completedNotes.push(key);
                }
                checkpoint.processedNotes.push(key);
            } catch (error) {
                if (error.stopped) throw error;
                checkpoint.failures.push({ note: key, error: String(error.message || error) });
            }
            await report("Research notes"); await this.yield();
        }
        if (checkpoint.failures.length) throw Error(checkpoint.failures.length + " operations failed; review failures and explicitly retry.");
    },
    install() {
        AnnotaInfrastructure.jobs.register('note-modes',(payload,control,job)=>this.runModes(payload,control,job));
        AnnotaInfrastructure.jobs.register('note-defaults',(payload,control,job)=>this.runDefaults(payload,control,job));
        AnnotaInfrastructure.jobs.register("research-notes", (payload, control, job) => this.run(payload, control, job));
        // Hook the existing notification and durable field-save routes; never request AI here.
        const notify = Annota.notifierCallback.notify;
        Annota.notifierCallback.notify = (...args) => { notify.apply(Annota.notifierCallback, args); this.schedule(); };
        const save = AnnotaCardFields.saveValues;
        AnnotaCardFields.saveValues = async function (...args) {
            const result = await save.apply(this, args); AnnotaResearchNotes.schedule(); return result;
        };
    },
    schedule() {
        if (AnnotaInfrastructure.stopping) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.refreshAutomatic().catch(e => log("Research notes sync: " + e)), 1200);
    },
    async refreshAutomatic() {
        for (const config of Object.values(AnnotaInfrastructure.state.notes)) {
            if (AnnotaInfrastructure.stopping) return;
            if (Annota._colorMappingPDFs?.size || config.managementDisabled || config.scope.type !== "research" || config.filter?.type === "pdf" || config.mode !== "auto" || (!config.noteKey&&!config.orphanedNoteKey)) continue;
            try {
                const data = await this.inspect(config.sourceScope, config.filter);
                await AnnotaInfrastructure.notes.synchronize(config, data.items);
            } catch (error) { AnnotaInfrastructure.notes.errors.set(config.id,String(error.message||error).slice(0,2000));log("Research note protected: " + error); }
            await this.yield();
        }
    },
    async update(config) {
        config=await AnnotaInfrastructure.notes.recoverOrphan(config);
        if (config.mode === "static" && config.noteKey) throw Error("Static snapshots retain their generated content. Change mode before updating.");
        if (config.scope.type === "pdf") return AnnotaInfrastructure.notes.synchronize(config, [], { manual: true });
        const data = await this.inspect(config.sourceScope, config.filter);
        return AnnotaInfrastructure.notes.synchronize(config, data.items, { manual: true });
    },
    async resumeManagement(config,{confirmed=false}={}) {
        if(!confirmed)throw Error('Confirm recreation or resume first.');
        const current=AnnotaInfrastructure.notes.config(config.library,config.scope)||config;
        const next={...current,managementDisabled:false,noteKey:null,orphanedNoteKey:current.noteKey||current.orphanedNoteKey,
            generated:null,content:null,recordKeys:[],nativeDeletedKey:null};
        await AnnotaInfrastructure.notes.configure(next);
        return this.rebuildExplicit(next);
    },
    effectiveOrder(config){const mode=config.colorOrder?.length?'color':getPref('paperNoteSortOrder','pdf');return {source:config.colorOrder?.length?'Note-specific override':'Global default',mode,ids:config.colorOrder?.length?config.colorOrder:this.colors().sort((a,b)=>mode==='color'?a.hex.localeCompare(b.hex):0).map(c=>c.id)};},
    async setColorOrder(config,ids) {
        if(ids!==null&&(!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(id=>!AnnotaPalette.resolve(id))))throw Error('Invalid color order');
        const current=AnnotaInfrastructure.notes.config(config.library,config.scope)||config;
        if(current.managementDisabled)throw Error('Resume management before changing order.');
        await AnnotaInfrastructure.backup(AnnotaInfrastructure.path('infrastructure'),{configuration:current},'before-note-order');
        const next={...current,colorOrder:ids};await AnnotaInfrastructure.notes.configure(next);return this.rebuildExplicit(next);
    },
    async rebuildExplicit(config) {
        if(config.scope.type==='pdf'){const lib=AnnotaData.resolveLibrary(config.library),pdf=await AnnotaData.annotation(lib.libraryID,config.scope.key);await Annota._syncPaperResearchNote({libraryID:lib.libraryID,parentID:pdf.id,manualSync:true,orderChange:true});return;}
        const data=await this.inspect(config.sourceScope,config.filter);return AnnotaInfrastructure.notes.synchronize(config,data.items,{manual:true,explicitOrder:true});
    },
    async remove(config) {
        const lib = AnnotaData.resolveLibrary(config.library);
        if(!lib||lib.editable===false)throw Error('Note library unavailable or read-only');
        const marker = config.scope.type === "pdf" ? "research-annotator-pdf-note-v1:" + config.scope.key : "research-annotator-managed-note-v1:" + config.id;
        const note = await AnnotaInfrastructure.notes.find(lib.libraryID, marker);
        const current=AnnotaInfrastructure.notes.config(config.library,config.scope)||config;
        const backup=await AnnotaInfrastructure.backup(AnnotaInfrastructure.path('infrastructure'),{configuration:current,noteHTML:note?.getNote?.()||current.content||''},'before-managed-note-delete');
        await AnnotaInfrastructure.notes.configure({...current,managementDisabled:true,deletedByUserAt:new Date().toISOString(),deletionBackup:backup,orphanBackup:backup});
        if (note) { note.deleted = true; await note.saveTx(); }
        // Persist the tombstone before trashing: queued jobs cannot revive this note.
        await AnnotaInfrastructure.notes.configure({...AnnotaInfrastructure.notes.config(config.library,config.scope),orphanedNoteKey:note?.key||config.noteKey,noteKey:null});
        AnnotaInfrastructure.notes.cache.clear();
    },
    addToWindow(win) {
        if(typeof AnnotaWorkspace!=="undefined")return AnnotaWorkspace.addToWindow(win);
    },
    open(win) {
        if(typeof AnnotaWorkspace!=="undefined")return AnnotaWorkspace.open(win,"notes");
        const error=Error("Research Workspace did not initialize; restart the extension and inspect Zotero's error console.");Services.prompt.alert(win,"Research Workspace",error.message);throw error;
    },
    openExplorer(win, query) {
        if(typeof AnnotaWorkspace!=="undefined")return AnnotaWorkspace.transfer(win,query);
        return this.open(win);
    },
    close(win) {
        win.document.getElementById("researchannotator-notes")?.remove();
        this.windows.get(win)?.close(); this.windows.delete(win);
        for(const dialog of this.explorerDialogs.get(win)||[])dialog.close();this.explorerDialogs.delete(win);
    },
    stop() { clearTimeout(this.timer); for (const win of new Set([...this.windows.keys(),...this.explorerDialogs.keys()])) this.close(win); }
};
