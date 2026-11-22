/* ResearchAnnotator data infrastructure. No sync internals or credentials. */
var AnnotaInfrastructure = {
    version: 1,
    clone(value) { return JSON.parse(JSON.stringify(value)); },
    object(value) { return !!value && typeof value === "object" && !Array.isArray(value); },
    readerDocument(doc) { try { return Components.utils.unwaiveXrays(doc); } catch (_) { return doc; } },
    path(name) { return PathUtils.join(Zotero.DataDirectory.dir, "researchannotator-" + name + ".json"); },
    async backup(path, value, reason) {
        const dir = PathUtils.join(Zotero.DataDirectory.dir, "researchannotator-backups");
        await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
        const name = PathUtils.join(dir, reason + "-" + Date.now() + "-" + (++this._backupCounter) + ".json");
        await IOUtils.writeJSON(name, value, { tmpPath: name + ".tmp", flush: true, noOverwrite: true });
        return name;
    },
    _backupCounter: 0,
    inspect(value, depth = 0) {
        if (depth > 35) throw Error("Storage nesting limit exceeded");
        if (typeof value === "number" && !Number.isFinite(value)) throw Error("Invalid numeric data");
        if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
            if (["__proto__", "constructor", "prototype"].includes(key)) throw Error("Unsafe stored property");
            this.inspect(child, depth + 1);
        }
    },
    validateStore(data) {
        this.inspect(data);
        if (!this.object(data) || ![1, 2, 3].includes(data.version) || !this.object(data.annotations)) throw Error("Unsupported structured storage schema");
        for (const [key, record] of Object.entries(data.annotations)) {
            if (!/^\d+\/[A-Z0-9]+$/.test(key) || !this.object(record)) throw Error("Invalid annotation identity/record");
            if (record.colors) AnnotaData.validateRecord({ ...record, version: 2 });
            else if (!this.object(record.values) || !/^(image:)?#[0-9a-f]{6}$/i.test(record.color || "")) throw Error("Invalid legacy record");
        }
        return data;
    },
    async init() {
        this.stopping = false;
        await this.loadState();
        await this.jobs.recover();
        await AnnotaCardFields.load();
        const next = this.clone(AnnotaCardFields._store); let changed = false;
        for (const record of Object.values(next)) for (const metadata of Object.values(record.aiMetadata || {})) {
            if (["queued", "generating"].includes(metadata.state)) { metadata.state = "failed"; metadata.error = "Generation interrupted; explicit retry required. A paid request may already have run."; changed = true; }
        }
        if (changed) { await AnnotaCardFields.writeStore(next); AnnotaCardFields._store = next; }
        return this;
    },
    validateState(data) {
        this.inspect(data);
        if (!this.object(data) || data.version !== 1 || !this.object(data.jobs) || !this.object(data.notes)) throw Error("Unsupported infrastructure state");
        if(data.colorMaps){if(!this.object(data.colorMaps))throw Error('Invalid color mapping journal');for(const [id,op]of Object.entries(data.colorMaps))if(op.id!==id||!Array.isArray(op.entries)||op.entries.some(e=>!['user','group','local'].includes(e.library?.type)||typeof e.library?.id!=='string'||typeof e.key!=='string'||!/^#[0-9a-f]{6}$/.test(e.before)||!/^#[0-9a-f]{6}$/.test(e.after)||!Number.isInteger(e.pdf)||typeof e.signature!=='string'))throw Error('Invalid color mapping entry');}
        if(data.evidenceCaptures){if(!this.object(data.evidenceCaptures))throw Error('Invalid evidence capture journal');for(const [id,op]of Object.entries(data.evidenceCaptures))if(op.id!==id||!Array.isArray(op.entries)||op.entries.some(e=>!e.passage?.ref||typeof e.annotationKey!=='string'))throw Error('Invalid capture operation');}
        if(data.network){if(typeof AnnotaNetwork==='undefined')throw Error('This backup requires Knowledge Network support');AnnotaNetwork.validate(data.network);}
        const states = ["queued", "running", "paused", "completed", "failed", "cancelled", "interrupted"];
        for (const [id, job] of Object.entries(data.jobs)) {
            if (job.id !== id || !states.includes(job.state) || typeof job.type !== "string" || typeof job.dedupe !== "string" || !this.object(job.payload)) throw Error("Invalid stored job");
            if (job.attempts !== undefined && (!Number.isInteger(job.attempts) || job.attempts < 0) || job.progress !== undefined && (typeof job.progress !== "number" || job.progress < 0 || job.progress > 1)) throw Error("Invalid job progress/attempt count");
            if (job.type === "structured-ai" && (!Array.isArray(job.payload.fieldIds) || job.payload.fieldIds.some(id => typeof id !== "string") || !job.payload.annotation?.library || typeof job.payload.annotation.key !== "string")) throw Error("Invalid structured AI job identity");
            if (job.type === "research-notes") {
                this.notes.validate(job.payload.config);
                if (!["existing", "missing"].includes(job.payload.ai) || !job.payload.config.sourceScope || !["pdf", "field", "color", "explorer", "network", "evidence"].includes(job.payload.config.filter?.type)) throw Error("Invalid research generation job");
                if(job.payload.config.filter.type==="explorer")AnnotaData.validateExplorerQuery(job.payload.config.filter.query);
            }
            if(job.type==='network-suggestions'&&(!Array.isArray(job.payload.preview?.evidence)||job.payload.preview.evidence.length>24||job.payload.preview.evidence.length<2))throw Error('Invalid Network discovery job');
        }
        for (const config of Object.values(data.notes)) this.notes.validate(config);
        for (const config of Object.values(data.notes)) if(config.filter?.type==="explorer")AnnotaData.validateExplorerQuery(config.filter.query);
        for (const config of Object.values(data.notes)) if(config.filter?.type==='network'&&typeof AnnotaNetwork!=='undefined'){const f=config.filter;if(!f.entity&&!f.topicKey&&!f.questionID)throw Error('Invalid Network note selector');if(f.entity)AnnotaNetwork.validateEntity(f.entity);}
        return data;
    },
    async loadState() {
        const path = this.path("infrastructure");
        if (!await IOUtils.exists(path)) { this.state = { version: 1, jobs: {}, notes: {} }; return; }
        let raw;
        try { raw = await IOUtils.readJSON(path); this.state = this.validateState(raw); }
        catch (error) {
            if (raw?.version > 1 || raw?.network?.version > 1) throw Error("Infrastructure state is from a newer version; no changes made");
            // Preserve the original bytes, even if they are not JSON.
            await IOUtils.copy(path, path + ".corrupt-" + Date.now(), { noOverwrite: true });
            if (!await IOUtils.exists(path + ".recovery")) throw Error("Infrastructure storage unreadable; preserve files and restore backup: " + error.message);
            this.state = this.validateState(await IOUtils.readJSON(path + ".recovery"));
            await IOUtils.writeJSON(path, this.state, { tmpPath: path + ".tmp", flush: true });
            this.recoveryMessage = "Recovered infrastructure from last known good state; interrupted paid work requires explicit review.";
        }
    },
    _stateQueue: Promise.resolve(),
    mutate(fn) {
        const task = this._stateQueue.catch(() => {}).then(async () => {
            if (!this.state) throw Error("Infrastructure is unavailable");
            const next = this.clone(this.state); const result = await fn(next);
            this.validateState(next);
            const path = this.path("infrastructure");
            if (await IOUtils.exists(path)) {
                const old = this.validateState(await IOUtils.readJSON(path));
                await IOUtils.writeJSON(path + ".recovery", old, { tmpPath: path + ".recovery.tmp", flush: true });
            }
            await IOUtils.writeJSON(path, next, { tmpPath: path + ".tmp", flush: true });
            this.state = next; return result;
        });
        this._stateQueue = task; return task;
    },
    async restoreState(data) {
        this.validateState(data);
        if (!this.state) await this.loadState();
        const result=await this.mutate(state => { Object.assign(state, this.clone(data)); });
        if(typeof AnnotaNetwork!=='undefined')AnnotaNetwork.restored();return result;
    },
    stableAnnotation(item) {
        const library = Zotero.Libraries.get(item.libraryID);
        return { library: AnnotaData.libraryIdentity(library), key: item.key };
    },
    async resolve(identity) {
        const library = AnnotaData.resolveLibrary(identity.library);
        if (!library) throw Error("Source library is unavailable or has not synchronized");
        const item = await AnnotaData.annotation(library.libraryID, identity.key);
        if (!item?.isAnnotation?.() || item.deleted || Annota._deletedAnnotationKeys?.has(library.libraryID + ":" + identity.key)) throw Error("Source annotation is unavailable");
        return item;
    },
    installStorage() {
        const card = AnnotaCardFields, infra = this, originalLoad = card.load;
        const originalWatch = card.watch;
        card.watch = function (element, refresh) {
            originalWatch.call(this, element, refresh);
            const doc = infra.readerDocument(element.ownerDocument), win = doc?.defaultView;
            if (!win?.MutationObserver || !doc.body) return;
            if (!infra._draftDocuments) infra._draftDocuments = new Map();
            if (infra._draftDocuments.has(doc)) return;
            const observer = new win.MutationObserver(() => {
                for (const [view] of card._views) if (infra.readerDocument(view.ownerDocument) === doc && !view.isConnected) {
                    card._views.delete(view);
                    Promise.resolve(view._flushDraft?.()).catch(error => log("Closed annotation draft could not be saved: " + error));
                }
                if (![...card._views.keys()].some(view => infra.readerDocument(view.ownerDocument) === doc && view.isConnected)) unload();
            });
            const unload = () => { observer.disconnect(); win.removeEventListener("unload", unload); infra._draftDocuments.delete(doc); };
            observer.observe(doc.body, { childList: true, subtree: true }); win.addEventListener("unload", unload);
            infra._draftDocuments.set(doc, { unload });
        };
        card.load = function () {
            if (this._store) return Promise.resolve(this._store);
            if (this._validatedLoading) return this._validatedLoading;
            const task = (async () => {
                const path = this.file();
                if (await IOUtils.exists(path)) {
                    try { infra.validateStore(await IOUtils.readJSON(path)); }
                    catch (error) {
                        // Future versions must never be downgraded from an older backup.
                        let future;
                        try { future = (await IOUtils.readJSON(path)).version > 3; } catch (_) {}
                        if (future) throw Error("Structured storage is from a newer version; no changes made");
                        await IOUtils.copy(path, path + ".corrupt-" + Date.now(), { noOverwrite: true });
                        let restored;
                        for (const candidate of [path + ".recovery", path + ".tmp"]) {
                            try { if (await IOUtils.exists(candidate)) { restored = infra.validateStore(await IOUtils.readJSON(candidate)); break; } } catch (_) {}
                        }
                        if (!restored) throw Error("Structured field storage could not be read; original preserved: " + error.message);
                        await IOUtils.writeJSON(path, restored, { tmpPath: path + ".restore.tmp", flush: true });
                        infra.recoveryMessage = "Structured data recovered from last valid snapshot. Original retained for inspection.";
                    }
                    const data = await IOUtils.readJSON(path);
                    if (data.version < 3) await infra.backup(path, data, "structured-pre-migration");
                }
                return originalLoad.call(this);
            })();
            this._validatedLoading = task;
            task.catch(() => { this._loading = this._validatedLoading = null; });
            return task;
        };
        card.writeStore = function (store) {
            const snapshot = infra.validateStore({ version: 3, annotations: infra.clone(store) });
            const task = this._writeQueue.catch(() => {}).then(async () => {
                const path = this.file();
                if (await IOUtils.exists(path)) {
                    const before = infra.validateStore(await IOUtils.readJSON(path));
                    await IOUtils.writeJSON(path + ".recovery", before, { tmpPath: path + ".recovery.tmp", flush: true });
                    // A backup per changed session, plus pre-migration/import backups.
                    if (!this._sessionBackup) this._sessionBackup = await infra.backup(path, before, "structured-session");
                }
                await IOUtils.writeJSON(path, snapshot, { tmpPath: path + ".tmp", flush: true });
            });
            this._writeQueue = task; return task;
        };
        card.flush = async function () {
            if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; this._flushDirty = true; }
            await this._saveQueue;
            if (this._flushDirty && this._store) { await this.writeStore(this._store); this._flushDirty = false; }
            await this._writeQueue;
        };
        card.remember = function (item, values, refs) {
            const task = this.saveValues(item, values || {}, refs);
            task.catch(error => log("Structured save failed: " + error)); return task;
        };
        card.saveMetadata = function (item, field, patch) {
            const task = this._saveQueue.catch(() => {}).then(async () => {
                await this.load();
                if (item.deleted || Annota._deletedAnnotationKeys?.has(item.libraryID + ":" + item.key)) throw Error("Annotation is unavailable");
                const key = this.keyOf(item.libraryID, item.key), next = infra.clone(this._store);
                if (!next[key]) next[key] = { version: 2, colors: {} };
                if (!next[key].globalValues) next[key].globalValues = {};
                next[key].aiMetadata = { ...(next[key].aiMetadata || {}) };
                const previous = next[key].aiMetadata[field.id] || {};
                next[key].aiMetadata[field.id] = { ...previous, ...patch, fieldId: field.id, scope: field.scope };
                await this.writeStore(next); this._store[key] = next[key]; this.refreshViews();
            });
            this._saveQueue = task; return task;
        };
        card.transfer = async function (oldIdentity, item) {
            const task = this._saveQueue.catch(() => {}).then(async () => {
                await this.load(); const oldKey = this.keyOf(oldIdentity.libraryID, oldIdentity.key), key = this.keyOf(item.libraryID, item.key);
                if (!this._store[oldKey] || oldKey === key) return;
                if (this._store[key]?.convertedFrom === oldKey) return;
                const next = infra.clone(this._store), source = next[oldKey], target = next[key];
                // A conversion carries the source values. Preserve any conflicting
                // provisional target data separately instead of discarding it.
                next[key] = AnnotaData.merge(target || {}, source, "incoming", [], key);
                if (target) next[key].convertedTargetSnapshot = target;
                next[key].convertedFrom = oldKey;
                await this.writeStore(next); this._store[key] = next[key]; this.refreshViews();
            }); this._saveQueue = task; return task;
        };
    },
    lifecycle: {
        source(item, text = item.annotationText || "") {
            const values = AnnotaCardFields.get(item)?.values || {};
            const manual = Annota.annotationFields(Annota.keyForItem(item)).filter(f => f.type !== "ai")
                .map(f => [f.id, values[f.name] === undefined ? "" : values[f.name]]).sort((a,b) => a[0].localeCompare(b[0]));
            return Annota.fieldFingerprint(JSON.stringify({ text: String(text), manual }));
        },
        describe(item, field) {
            const saved = AnnotaCardFields.get(item), value = saved?.values[field.name];
            const metadata = saved?.aiMetadata?.[field.id] || {};
            if (metadata.state === "cancelled" || metadata.state === "failed" || ["queued", "generating"].includes(metadata.state)) return { ...metadata };
            if (!String(value || "").trim()) return { ...metadata, state: "missing" };
            const outdated = metadata.promptFingerprint && metadata.promptFingerprint !== Annota.fieldFingerprint(field.prompt)
                || metadata.sourceFingerprint && item.annotationType !== "image" && metadata.sourceFingerprint !== this.source(item);
            return { ...metadata, state: outdated ? "outdated" : "completed", legacy: !metadata.promptFingerprint };
        },
        async transition(item, field, state, extra = {}) {
            await AnnotaCardFields.saveMetadata(item, field, { state, updatedAt: new Date().toISOString(), ...extra });
        }
    },
    async generateJob(item, options = {}) {
        if (this.stopping) throw Error("Extension is shutting down");
        const annotation = this.stableAnnotation(item);
        const requested = options.fieldIds || (options.fieldId ? [options.fieldId] : null);
        const fieldIds = Annota.annotationFields(Annota.keyForItem(item)).filter(f => f.type === "ai" && (!requested || requested.includes(f.id)) &&
            (options.regenerate || !String(AnnotaCardFields.get(item)?.values[f.name] || "").trim())).map(f => f.id);
        if (!fieldIds.length) return AnnotaCardFields.get(item);
        const id = await this.jobs.enqueue("structured-ai", { annotation, fieldIds, regenerate: !!options.regenerate, ...(options.capture ? {capture:options.capture} : {}) },
            { dedupe: JSON.stringify([annotation, [...fieldIds].sort(), !!options.regenerate]), paid: true, parentJobID:options.parentJobID });
        if(options.enqueueOnly)return id;
        if (this.state.jobs[id].state === "failed") {
            if (options.automatic) return AnnotaCardFields.get(item);
            await this.jobs.resume(id, { acknowledgePaid:true });
        }
        await this.jobs.wait(id); return AnnotaCardFields.get(item);
    },
    async refill(window, group, chosen, onlyEmpty) {
        const targets = group.anns.map(item => ({ item, fields: Annota.annotationFields(Annota.keyForItem(item)).filter(f => f.type === "ai" && chosen.includes(f.name)
            && (!onlyEmpty || !String(AnnotaCardFields.get(item)?.values[f.name] || "").trim())) })).filter(entry => entry.fields.length);
        if (!targets.length) { Services.prompt.alert(window, "ResearchAnnotator", Annota.t("rf.nothing")); return; }
        if (!Services.prompt.confirm(window, "ResearchAnnotator", Annota.t("rf.confirm", { n: targets.length, fields: chosen.length }))) return;
        const dir = PathUtils.join(Zotero.DataDirectory.dir, "annota", "sauvegardes-ia");
        await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
        const path = PathUtils.join(dir, "relance-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
        const backup = { version: 2, date: new Date().toISOString(), annotations: [] }; let completed = 0, failed = 0;
        for (const { item, fields } of targets) {
            const key = AnnotaCardFields.keyOf(item.libraryID, item.key);
            const entry = { identity: this.stableAnnotation(item), before: this.clone(AnnotaCardFields._store[key] || { version: 2, colors: {} }) };
            backup.annotations.push(entry);
            await IOUtils.writeJSON(path, backup, { tmpPath: path + ".tmp", flush: true });
            try { await this.generateJob(item, { fieldIds: fields.map(f => f.id), regenerate: !onlyEmpty }); completed++; }
            catch (error) { entry.error = String(error.message || error); failed++; }
            // Save the exact post-state even after partial success, for guarded undo.
            entry.after = this.clone(AnnotaCardFields._store[key]);
            await IOUtils.writeJSON(path, backup, { tmpPath: path + ".tmp", flush: true });
        }
        Services.prompt.alert(window, "ResearchAnnotator", completed + " completed; " + failed + " failed. Structured undo backup: " + path);
    },
    async undoRefill(backup) {
        let restored = 0, kept = 0;
        for (const entry of backup.annotations) {
            try {
                const item = await this.resolve(entry.identity), card = AnnotaCardFields;
                const task = card._saveQueue.catch(() => {}).then(async () => {
                    const key = card.keyOf(item.libraryID, item.key);
                    if (!entry.after || JSON.stringify(card._store[key]) !== JSON.stringify(entry.after)) return false;
                    const next = this.clone(card._store); this.validateStore({ version: 3, annotations: { [key]: entry.before } });
                    next[key] = this.clone(entry.before); await card.writeStore(next); card._store[key] = next[key]; card.refreshViews(); return true;
                }); card._saveQueue = task;
                if (await task) { restored++; await Annota._syncPaperResearchNote(item); } else kept++;
            } catch (error) { kept++; log("Structured undo skipped: " + error); }
        }
        return { restored, kept };
    },
    installIntegrations() {
        const fields = Annota.annotationFields;
        Annota.annotationFields = function (color) {
            const schema = fields.call(this, color), entry = this.getColorEntry(color);
            // Preserve inherited whole-response generation as a structured AI field,
            // rather than writing the response into native Comment.
            if (entry && this.entryNeedsAI(entry) && entry.prompt?.trim()) {
                const id = "c_legacy_" + (typeof AnnotaPalette !== "undefined" ? AnnotaPalette.storageKey(color) : this.fieldFingerprint(color));
                schema.push({ id, name: id, label: "AI response", type: "ai", scope: "color", prompt: entry.prompt, format: "plain" });
            }
            return schema;
        };
        const entryFor = AnnotaCardFields.entryFor;
        AnnotaCardFields.entryFor = function (color) {
            const schema = Annota.annotationFields(color), entry = Annota.getColorEntry(color);
            return schema.length ? { entry: entry || {}, schema } : entryFor.call(this, color);
        };
    },
    jobs: {
        handlers: new Map(), active: new Map(), listeners: new Set(), concurrency: 1, maxRetries: 3,
        register(type, handler, { paid = false } = {}) { this.handlers.set(type, { handler, paid }); },
        list() { return Object.values(AnnotaInfrastructure.state?.jobs || {}).map(job => AnnotaInfrastructure.clone(job)); },
        report(job) { for (const fn of this.listeners) { try { fn(AnnotaInfrastructure.clone(job)); } catch (e) { log("Job progress listener: " + e); } } },
        async recover() {
            await AnnotaInfrastructure.mutate(state => {
                for (const job of Object.values(state.jobs)) {
                    if (job.state === "running" || job.state === "queued") {
                        job.state = "interrupted"; job.error = "Restart interrupted work. Review before explicit resume; paid requests may already have run.";
                    }
                }
            });
        },
        async enqueue(type, payload, { dedupe, paid = this.handlers.get(type)?.paid || false, parentJobID } = {}) {
            if (AnnotaInfrastructure.stopping) throw Error("Extension is shutting down");
            if (AnnotaCardFields._maintenance) throw Error("Data maintenance is in progress; retry after it completes");
            if (!this.handlers.has(type) || !dedupe) throw Error("Unknown job type or missing identity");
            const id = await AnnotaInfrastructure.mutate(state => {
                if(parentJobID && state.jobs[parentJobID]?.state!=='running'){const error=Error('Parent operation stopped');error.stopped=true;throw error;}
                const existing = Object.values(state.jobs).find(j => j.dedupe === dedupe && j.type === type && !["completed", "cancelled"].includes(j.state));
                if (existing) return existing.id;
                const id = Annota.newFieldID("job");
                state.jobs[id] = { id, type, payload: AnnotaInfrastructure.clone(payload), dedupe, paid, ...(parentJobID?{parentJobID}:{}), state: "queued", attempts: 0, progress: 0, createdAt: new Date().toISOString() };
                return id;
            });
            this.kick(); return id;
        },
        async update(id, patch) {
            await AnnotaInfrastructure.mutate(state => { Object.assign(state.jobs[id], patch); });
            this.report(AnnotaInfrastructure.state.jobs[id]);
        },
        kick() {
            if (AnnotaInfrastructure.stopping || this._kickPending) return;
            this._kickPending = true;
            Promise.resolve().then(async () => {
                try {
                    const limit = Math.max(1, Math.min(8, Number(getPref("aiConcurrency", this.concurrency)) || 1));
                    for (const job of Object.values(AnnotaInfrastructure.state.jobs)) {
                        if (this.active.size >= limit) break;
                        if (job.state !== "queued" || this.active.has(job.id) || !this.handlers.has(job.type)) continue;
                        if(job.parentJobID && AnnotaInfrastructure.state.jobs[job.parentJobID]?.state!=='completed')continue;
                        const promise = this.run(job.id); this.active.set(job.id, promise);
                        promise.catch(error => log("Background job: " + error)).finally(() => { this.active.delete(job.id); this.kick(); });
                    }
                } finally { this._kickPending = false; }
            }).catch(error => log("Job queue: " + error));
        },
        async run(id) {
            const infra = AnnotaInfrastructure;
            await this.update(id, { state: "running", startedAt: new Date().toISOString() });
            let job = infra.state.jobs[id], handler = this.handlers.get(job.type);
            const control = {
                check: () => { if (infra.stopping || ["paused", "cancelled"].includes(infra.state.jobs[id].state)) { const error = Error("Job stopped"); error.stopped = true; throw error; } },
                progress: async (progress, checkpoint) => { control.check(); await this.update(id, { progress, ...(checkpoint === undefined ? {} : { checkpoint }) }); },
                completeField: async fieldID => {
                    const completedFieldIds = [...new Set([...(infra.state.jobs[id].checkpoint?.completedFieldIds || []), fieldID])];
                    await control.progress(completedFieldIds.length / Math.max(1, job.payload.fieldIds?.length || 1), { completedFieldIds });
                }
            };
            try {
                control.check();
                await this.update(id, { attempts: job.attempts + 1 });
                await handler.handler(infra.clone(job.payload), control, infra.clone(job));
                control.check(); await this.update(id, { state: "completed", progress: 1, completedAt: new Date().toISOString(), error: "" });
            } catch (error) {
                if (error.stopped) return;
                job = infra.state.jobs[id];
                // Retry only a positively rejected 429, never a timeout/ambiguous paid request.
                const rateLimited = error.status === 429 && error.requestRejected === true;
                if ((!job.paid || rateLimited) && job.attempts < this.maxRetries && error.retryable === true) {
                    await this.update(id, { state: "paused", error: "Rate/retry delay: " + error.message });
                    const delay = Math.min(60000, Math.max(1000, Number(error.retryAfter) * 1000 || 1000 * 2 ** job.attempts));
                    const timer = setTimeout(() => { this._retryTimers.delete(id); if (infra.state.jobs[id]?.state === "paused" && !infra.stopping) this.resume(id).catch(e => log(e)); }, delay);
                    if (!this._retryTimers) this._retryTimers = new Map(); this._retryTimers.set(id, timer);
                } else await this.update(id, { state: "failed", error: String(error.message || error), ambiguous: job.paid && !rateLimited });
            }
        },
        async pause(id) { this.clearRetry(id); await this.update(id, { state: "paused" }); },
        async cancel(id) { this.clearRetry(id); await this.update(id, { state: "cancelled" }); for(const child of this.list())if(child.parentJobID===id&&!['completed','cancelled'].includes(child.state))await this.cancel(child.id); },
        clearRetry(id) { const timer = this._retryTimers?.get(id); if (timer) clearTimeout(timer); this._retryTimers?.delete(id); },
        async resume(id, { acknowledgePaid = false } = {}) {
            const job = AnnotaInfrastructure.state.jobs[id];
            if (!job || job.state === "completed" || this.active.has(id)) throw Error("Job cannot resume yet");
            if (!this.handlers.has(job.type)) throw Error("This build has no handler for the stored job type");
            if (job.paid && ["interrupted", "failed"].includes(job.state) && !acknowledgePaid) throw Error("Explicit paid-request recovery acknowledgement required");
            await this.update(id, { state: "queued", error: "" }); this.kick();
        },
        async wait(id) {
            while (true) {
                const job = AnnotaInfrastructure.state.jobs[id];
                if (["completed", "cancelled", "failed", "interrupted", "paused"].includes(job.state)) {
                    if (job.state !== "completed") throw Error(job.error || "Job " + job.state); return job;
                }
                if (this.active.has(id)) await this.active.get(id); else { this.kick(); await new Promise(resolve => setTimeout(resolve, 20)); }
            }
        }
    },
    notes: {
        queues: new Map(), cache: new Map(), errors: new Map(),
        validate(config) {
            if(config?.managementDisabled!==undefined&&typeof config.managementDisabled!=='boolean')throw Error('Invalid management state');
            if(config?.colorOrder!=null&&(!Array.isArray(config.colorOrder)||new Set(config.colorOrder).size!==config.colorOrder.length||config.colorOrder.some(id=>typeof id!=='string')))throw Error('Invalid note color order');
            if (!config || !/^[A-Za-z0-9_-]+$/.test(config.id || "") || !["auto", "manual", "static"].includes(config.mode)
                || !["user", "group", "local"].includes(config.library?.type) || typeof config.library?.id !== "string"
                || !/^[a-z][\w-]*$/.test(config.scope?.type || "") || typeof config.scope?.key !== "string" || !config.scope.key
                || !AnnotaInfrastructure.object(config.include) || Object.values(config.include).some(value => typeof value !== "boolean")) throw Error("Invalid managed note configuration");
        },
        identity(library, scope) { return JSON.stringify([AnnotaData.libraryKey(library), scope.type, scope.key]); },
        serialize(identity, fn) {
            const previous = this.queues.get(identity) || Promise.resolve();
            const task = previous.catch(() => {}).then(fn); this.queues.set(identity, task);
            task.finally(() => { if (this.queues.get(identity) === task) this.queues.delete(identity); }).catch(() => {}); return task;
        },
        async configure(config) {
            config={...config};delete config.lastSyncError;delete config.noteUnavailable;
            this.validate(config);
            const identity = this.identity(config.library, config.scope);
            await AnnotaInfrastructure.mutate(state => {
                if (state.notes[identity] && state.notes[identity].id !== config.id) throw Error("Managed note identity cannot change with its title");
                if (Object.entries(state.notes).some(([key, note]) => key !== identity && note.id === config.id && AnnotaData.libraryKey(note.library) === AnnotaData.libraryKey(config.library))) throw Error("Managed note ID already belongs to another scope");
                state.notes[identity] = { ...(state.notes[identity] || {}), ...AnnotaInfrastructure.clone(config) };
            }); return identity;
        },
        config(library, scope) { return AnnotaInfrastructure.state?.notes[this.identity(library, scope)] || null; },
        async recoverOrphan(config,{confirmed=false}={}) {
            if(config?.managementDisabled)return config;
            if(!config?.noteKey)return config;
            const library=AnnotaData.resolveLibrary(config.library);if(!library)throw Error('Managed note library unavailable');
            const item=await AnnotaData.annotation(library.libraryID,config.noteKey);
            if(item?.isNote?.()&&!item.deleted)return config;
            if(!item&&!confirmed&&config.nativeDeletedKey!==config.noteKey&&!config.deletedAt)throw Error('The bound managed note is unavailable. No replacement was created. Check Zotero Trash and sync, or use explicit missing-note recovery.');
            if(confirmed&&library.editable===false)throw Error('Note library is read-only');
            const identity=this.identity(config.library,config.scope);
            return this.serialize('orphan:'+identity,async()=>{
                const current=this.config(config.library,config.scope)||config;
                if(current.noteKey!==config.noteKey)return current;
                const backup=await AnnotaInfrastructure.backup(AnnotaInfrastructure.path('infrastructure'),{kind:'orphaned-managed-note',configuration:current,noteHTML:item?.getNote?.()||current.content||''},'orphaned-managed-note');
                await AnnotaInfrastructure.mutate(state=>{const c=state.notes[identity];if(!c||c.noteKey!==config.noteKey)return;for(const key of ['noteKey','generated','content','recordKeys','deletedAt'])delete c[key];c.orphanedNoteKey=config.noteKey;c.orphanBackup=backup;c.orphanedAt=new Date().toISOString();c.managementDisabled=true;c.deletedByUserAt=new Date().toISOString();});
                this.cache.clear();return this.config(config.library,config.scope);
            });
        },
        async find(libraryID, marker) {
            const cacheKey = libraryID + "/" + marker, cached = this.cache.get(cacheKey);
            if (cached) { const note = await Zotero.Items.getAsync(cached); if (note?.isNote?.() && !note.deleted && note.getNote().includes(marker)) return note; this.cache.delete(cacheKey); }
            // Local ownership binds a stable native item key even if the user edits
            // the title containing its metadata link. Portable configs omit ownership.
            const owned=Object.values(AnnotaInfrastructure.state?.notes||{}).find(config=>config.content&&config.generated&&config.noteKey&&
                (config.scope.type==="pdf"?"research-annotator-pdf-note-v1:"+config.scope.key:"research-annotator-managed-note-v1:"+config.id)===marker&&AnnotaData.resolveLibrary(config.library)?.libraryID===libraryID);
            let ownedNote=owned?await AnnotaData.annotation(libraryID,owned.noteKey):null;
            if(!ownedNote?.isNote?.()||ownedNote.deleted)ownedNote=null;
            const search = new Zotero.Search(); search.libraryID = libraryID; search.addCondition("itemType", "is", "note");
            const matches = [];
            for (const id of await search.search()) { const note = await Zotero.Items.getAsync(id); if (note?.isNote?.() && !note.deleted && note.getNote().includes(marker)) matches.push(note); }
            if (matches.length > 1) throw Error("Duplicate managed note identities detected; preserved all notes for explicit resolution");
            if(ownedNote&&matches[0]&&ownedNote.key!==matches[0].key)throw Error("Conflicting managed note identity; all notes preserved");
            if(ownedNote&&!matches.length){this.cache.set(cacheKey,ownedNote.id);return ownedNote;}
            if (matches[0]) this.cache.set(cacheKey, matches[0].id); return matches[0] || null;
        },
        canonical(html) {
            const decode = value => value.replace(/&(?:nbsp|#160);/gi," ").replace(/&lt;/gi,"<").replace(/&gt;/gi,">")
                .replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>String.fromCodePoint(n[0].toLowerCase()==="x"?parseInt(n.slice(1),16):Number(n))).replace(/&amp;/gi,"&");
            const links=[...String(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map(m=>decode(m[1]));
            const text=decode(String(html).replace(/<\/?(?:p|div|h[1-6]|li|br|blockquote|hr)\b[^>]*>/gi," ").replace(/<[^>]*>/g,""))
                .replace(/\s+/g," ").normalize("NFC").trim();
            return text||links.length ? text+"|"+JSON.stringify(links) : "";
        },
        keepNormalized(existing,proposed,previousGenerated,generated) {
            // Only unchanged compiler output permits a semantic comparison. This
            // preserves editor normalization without hiding a color/format change.
            return previousGenerated && JSON.stringify(previousGenerated)===JSON.stringify(generated)
                && this.canonical(existing)===this.canonical(proposed);
        },
        tree(html) {
            const root={tag:"root",start:0,end:html.length,children:[]},stack=[root];
            const tokens=/<\/?([a-z][\w-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;let match;
            while((match=tokens.exec(html))){
                const tag=match[1].toLowerCase();
                if(/^<\//.test(match[0])){
                    const index=stack.map(n=>n.tag).lastIndexOf(tag);if(index>0){for(let i=stack.length-1;i>=index;i--){stack[i].end=tokens.lastIndex;stack[i].close=match.index;}stack.length=index;}
                }else{
                    const node={tag,start:match.index,openEnd:tokens.lastIndex,end:tokens.lastIndex,children:[],parent:stack.at(-1),opening:match[0]};
                    stack.at(-1).children.push(node);
                    if(!/^(br|hr|img|input|meta|link|wbr)$/.test(tag)&&! /\/>$/.test(match[0]))stack.push(node);
                }
            }
            for(const node of stack.slice(1))node.end=html.length;
            return root;
        },
        blocks(html) {
            const result=[],visit=node=>{
                if(node.tag==="blockquote")return;
                if(/^(p|h[1-6]|li|pre|table|hr)$/.test(node.tag)){result.push({...node,html:html.slice(node.start,node.end)});return;}
                node.children.forEach(visit);
            };visit(this.tree(html));return result;
        },
        snapshotNodes(html) {
            const result=[],visit=node=>{
                if(node.tag==="blockquote"){
                    const first=node.children[0],label=first&&html.slice(first.start,first.end).replace(/<[^>]*>/g,"").trim();
                    if(label==="Preserved user-edited note snapshot:")result.push(node);
                }
                node.children.forEach(visit);
            };visit(this.tree(html));return result;
        },
        replaceRanges(content,ranges,replacement) {
            ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
            for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
            if(!merged.length)return content+(replacement?"\n"+replacement:"");
            let result=content.slice(0,merged[0][0])+replacement;
            for(let i=0;i<merged.length;i++)result+=content.slice(merged[i][1],merged[i+1]?.[0]??content.length);
            return result;
        },
        entryHTML(content, key) {
            const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const opening = content.match(new RegExp('<div\\b[^>]*data-ra-entry=["\u0027]' + escaped + '["\u0027][^>]*>', 'i'));
            if (!opening) return null;
            const tags = /<\/?div\b[^>]*>/gi; tags.lastIndex = opening.index;
            let depth = 0, tag;
            while ((tag = tags.exec(content))) {
                depth += /^<\/div/i.test(tag[0]) ? -1 : 1;
                if (!depth) return content.slice(opening.index, tags.lastIndex);
            }
            return null;
        },
        preserveEdits(content, previous) {
            if (!previous?.generated) return content;
            if(this.snapshotNodes(content).length)throw Error("Duplicated managed-note snapshots detected. Use Repair duplicated snapshots; a recoverable backup is required before repair.");
            // Preserve edited generated entries as explicit user snapshots, rather than
            // erasing them or pretending the edits were written back into annotations.
            for (const [key, oldHTML] of Object.entries(previous.generated)) {
                if(/href=["'][^"']*annotation=/i.test(oldHTML))continue;
                const match = this.entryHTML(content, key);
                if (match && this.canonical(match) !== this.canonical(oldHTML)) {
                    const retained = match.replace(/data-ra-entry=["'][^"']+["']/i, 'class="ra-user-snapshot"')
                        .replace(/<h2\b/gi, "<h3").replace(/<\/h2>/gi, "</h3>");
                    content = content.replace(match, '<p><strong>Preserved user-edited research entry:</strong></p>' + retained);
                }
            }
            // Wrapper-free editor HTML is compared block by block. Never copy a whole
            // document (or existing preserved material) because serialization changed.
            const actual=this.blocks(content),archives=[];
            for(const oldHTML of Object.values(previous.generated)){
                const expected=this.blocks(oldHTML),heading=expected.find(b=>b.tag==="h2");if(!heading)continue;
                const link=heading.html.match(/href=["']([^"']*annotation=([^&"']+)[^"']*)["']/i);if(!link)continue;
                const expectedHref=link[1].replace(/&amp;|&#38;/g,"&");
                const candidates=actual.filter(b=>b.tag==="h2"&&(b.html.match(/href=["']([^"']+)["']/i)?.[1]||"").replace(/&amp;|&#38;/g,"&")===expectedHref);
                const start=candidates.find(b=>this.canonical(b.html)===this.canonical(heading.html))||candidates[0];if(!start)continue;
                const end=actual.find(b=>b.start>start.start&&b.tag==="h2"&&/annotation=/.test(b.html))?.start??content.length;
                const matched=new Set();
                for(const block of expected.filter(b=>b.tag!=="hr")){
                    let found;
                    if(block===heading)found=start;
                    else {const label=block.html.replace(/<[^>]*>/g,"").match(/^\s*([^:]+):/);if(label){const candidates=actual.filter(b=>!matched.has(b.start)&&b.start>start.start&&b.start<end&&b.tag==="p"&&b.html.replace(/<[^>]*>/g,"").trim().startsWith(label[1].trim()+":"));found=candidates.find(b=>this.canonical(b.html)===this.canonical(block.html))||candidates[0];}}
                    if(found)matched.add(found.start);
                    if(found&&this.canonical(found.html)!==this.canonical(block.html)){
                        const retained=found.html.replace(/<h2\b/gi,"<h3").replace(/<\/h2>/gi,"</h3>");
                        const signature=this.canonical(retained);if(!archives.some(html=>this.canonical(html)===signature))archives.push(retained);
                    }
                }
            }
            if(archives.length)content+='<blockquote><p><strong>Preserved user-edited research entry:</strong></p>'+archives.join("")+'</blockquote>';
            return content;
        },
        replaceManaged(content,replacement,previous) {
            const definitions={};
            const collect=node=>{
                const key=node.opening?.match(/data-ra-entry=["']([^"']+)["']/)?.[1];
                if(key){definitions[key]=replacement.slice(node.start,node.end);return;}
                node.children.forEach(collect);
            };collect(this.tree(replacement));
            if(Object.keys(definitions).length||Object.keys(previous?.generated||{}).length)return this.reconcileEntries(content,definitions,previous?.generated||{});
            const ranges=[],expected=Object.values(previous?.generated||{}).flatMap(html=>this.blocks(html));
            const signatures=new Set(expected.map(b=>this.canonical(b.html))),labels=new Set(expected.filter(b=>b.tag==="p"&&/<(?:strong|b)>[^<]*:<\/(?:strong|b)>/i.test(b.html)).map(b=>b.html.replace(/<[^>]*>/g,"").trim().match(/^([^:]+):/)?.[1]).filter(Boolean));
            const visit=node=>{if(node.tag==="blockquote")return;if(/data-ra-entry=["']/.test(node.opening||"")){ranges.push([node.start,node.end]);return;}node.children.forEach(visit);};visit(this.tree(content));
            const blocks=this.blocks(content);let inside=false;const consumedLabels=new Set();
            for(let i=0;i<blocks.length;i++){
                const block=blocks[i];if(ranges.some(([start,end])=>block.start>=start&&block.end<=end))continue;
                if(/^h[1-6]$/.test(block.tag)){inside=block.tag==="h2"&&/href=["']zotero:\/\/open-pdf\/[^"']*annotation=/i.test(block.html);consumedLabels.clear();}
                const fieldLabel=block.html.replace(/<[^>]*>/g,"").trim().match(/^([^:]+):/)?.[1];
                if(inside&&(block.tag==="h2"||signatures.has(this.canonical(block.html))||(labels.has(fieldLabel)&&!consumedLabels.has(fieldLabel)))){
                    ranges.push([block.start,block.end]);
                    if(fieldLabel)consumedLabels.add(fieldLabel);
                    const prior=blocks[i-1];if(block.tag==="h2"&&prior&&(signatures.has(this.canonical(prior.html))||/<mark\b/i.test(prior.html)))ranges.push([prior.start,prior.end]);
                }else if(block.tag==="hr"&&inside)ranges.push([block.start,block.end]);
            }
            for(const block of blocks.filter(b=>b.tag==="hr")){
                const before=ranges.some(([,end])=>end<=block.start&&!content.slice(end,block.start).trim());
                const after=ranges.some(([start])=>start>=block.end&&!content.slice(block.end,start).trim());
                if(before&&after)ranges.push([block.start,block.end]);
            }
            const expand=node=>{
                node.children.forEach(expand);
                if(node.tag!=="div"||/ra-user-snapshot/.test(node.opening))return;
                const limit=node.close??node.end,enclosed=ranges.filter(([start,end])=>start>=node.openEnd&&end<=limit).sort((a,b)=>a[0]-b[0]);
                let cursor=node.openEnd,residue="";
                for(const [start,end] of enclosed){if(start>cursor)residue+=content.slice(cursor,start);cursor=Math.max(cursor,end);}
                residue+=content.slice(cursor,limit);
                if(enclosed.length&&!residue.replace(/<\/?div\b[^>]*>/gi,"").trim())ranges.push([node.start,node.end]);
            };expand(this.tree(content));
            return this.replaceRanges(content,ranges,replacement).trim();
        },
        reconcileEntries(content,desired,previous) {
            const decode=value=>String(value||"").replace(/&amp;|&#38;/g,"&");
            const descriptors=Object.entries({...desired,...previous}).map(([key,html])=>{
                const blocks=this.blocks(html),heading=blocks.find(b=>b.tag==="h2");
                return {key,blocks,heading,href:decode(heading?.html.match(/href=["']([^"']+)["']/)?.[1]),
                    signatures:new Set(blocks.map(b=>this.canonical(b.html))),
                    bodySignatures:new Set(blocks.filter(b=>b.start>(heading?.start??-1)).map(b=>this.canonical(b.html))),
                    labels:new Set(blocks.filter(b=>b.tag==="p"&&/<(?:strong|b)>[^<]*:<\/(?:strong|b)>/i.test(b.html)).map(b=>b.html.replace(/<[^>]*>/g,"").trim().match(/^([^:]+):/)?.[1]).filter(Boolean))};
            });
            const blocks=this.blocks(content),ranges=[],seen=new Set(),order=[];let active=null,labels=new Set();
            for(let i=0;i<blocks.length;i++){
                const block=blocks[i],href=decode(block.html.match(/href=["']([^"']+)["']/)?.[1]);
                if(block.tag==="h2"&&href.includes("annotation=")){
                    const candidates=descriptors.filter(d=>!seen.has(d.key)&&d.href===href);
                    const found=candidates.find(d=>this.canonical(d.heading?.html||"")===this.canonical(block.html))||candidates[0];
                    if(found){
                        active=found;labels=new Set();seen.add(found.key);order.push(found.key);
                        const before=blocks[i-1];
                        if(before&&before.tag==="p"&&found.signatures.has(this.canonical(before.html)))ranges.push({start:before.start,end:before.end,key:found.key,first:true});
                        ranges.push({start:block.start,end:block.end,key:found.key,first:!ranges.some(r=>r.key===found.key)});continue;
                    }
                    active=null;
                }
                if(active&&block.tag==="p"){
                    const field=block.html.replace(/<[^>]*>/g,"").trim().match(/^([^:]+):/)?.[1];
                    if(active.bodySignatures.has(this.canonical(block.html))||(active.labels.has(field)&&!labels.has(field))){ranges.push({start:block.start,end:block.end,key:active.key});if(field)labels.add(field);}
                }
            }
            // Attribute-bearing but unfamiliar legacy entries retain the conservative
            // old boundary behavior; known annotation entries use semantic fragments.
            const extras=[];
            const visit=node=>{
                if(node.tag==="blockquote"||/ra-user-snapshot/.test(node.opening||""))return;
                const key=node.opening?.match(/data-ra-entry=["']([^"']+)["']/)?.[1];
                if(key&&!seen.has(key)&&Object.hasOwn(previous,key)){extras.push({start:node.start,end:node.end,key,first:true});seen.add(key);order.push(key);return;}
                node.children.forEach(visit);
            };visit(this.tree(content));ranges.push(...extras);
            if(!ranges.length)return (content.trim()+(Object.keys(desired).length?Object.values(desired).join('\n<hr>\n'):"")).trim();
            // Strip only presentation div boundaries around recognized fragments.
            // Their children, including user lists/tables/quotes, remain verbatim.
            const drops=[];
            const wrappers=node=>{if(node.tag==="blockquote"||/ra-user-snapshot/.test(node.opening||""))return;node.children.forEach(wrappers);
                if(node.tag==="div"&&node.close!==undefined&&ranges.some(r=>r.start>=node.openEnd&&r.end<=node.close)){
                    drops.push({start:node.start,end:node.openEnd},{start:node.close,end:node.end});
                }};wrappers(this.tree(content));
            for(const block of blocks.filter(b=>b.tag==="hr")){
                const left=ranges.filter(r=>r.end<=block.start).sort((a,b)=>b.end-a.end)[0],right=ranges.filter(r=>r.start>=block.end).sort((a,b)=>a.start-b.start)[0];
                const plain=value=>value.replace(/<\/?div\b[^>]*>/gi,"").trim();
                if(left&&right&&left.key!==right.key&&!plain(content.slice(block.end,right.start)))drops.push({start:block.start,end:block.end});
            }
            const stripRuleWrappers=node=>{node.children.forEach(stripRuleWrappers);if(node.tag!=="div"||node.close===undefined)return;
                const inner=content.slice(node.openEnd,node.close).replace(/<\/?div\b[^>]*>/gi,"").trim();
                if(/^<hr\b[^>]*>$/i.test(inner)&&drops.some(drop=>drop.start>=node.openEnd&&drop.end<=node.close))drops.push({start:node.start,end:node.openEnd},{start:node.close,end:node.end});
            };stripRuleWrappers(this.tree(content));
            const events=[...ranges,...drops].sort((a,b)=>a.start-b.start||b.end-a.end);
            if(this._traceReconciliation)this._traceReconciliation({ranges,drops,previous:Object.keys(previous),desired:Object.keys(desired),content});
            let cursor=0,current=null,prefix="";const tails=new Map(),physical=[];
            const append=text=>{text=text.trim();if(!text)return;if(current===null)prefix+=text;else tails.set(current,(tails.get(current)||"")+text);};
            for(const event of events){if(event.start<cursor)continue;append(content.slice(cursor,event.start));if(event.key&&event.first){current=event.key;if(!physical.includes(current))physical.push(current);}cursor=event.end;}
            append(content.slice(cursor));
            // A removed neighbor passes its user tail to the nearest preceding
            // surviving old entry, or to the introduction when none survives.
            let survivor=null;
            for(const key of physical){if(Object.hasOwn(desired,key))survivor=key;else if(survivor)tails.set(survivor,(tails.get(survivor)||"")+(tails.get(key)||""));else prefix+=tails.get(key)||"";}
            const units=Object.entries(desired).map(([key,html])=>html+(tails.get(key)||""));
            return (prefix+units.join('\n<hr>\n')).trim();
        },
        stamp(content,config,items) {
            const marker=config.scope.type==="pdf"?"research-annotator-pdf-note-v1:"+config.scope.key:"research-annotator-managed-note-v1:"+config.id;
            let data=content.match(/research-annotator-data-v1:[a-f0-9]+:\d+/)?.[0]||"";
            if(items){const fingerprint=Annota.fieldFingerprint(JSON.stringify(items.map(item=>[item.key,AnnotaCardFields.get(item)?.values||{}]).sort((a,b)=>a[0].localeCompare(b[0]))));data="research-annotator-data-v1:"+fingerprint+":"+items.filter(item=>AnnotaCardFields.get(item)).length;}
            content=content.replace(/<p\b[^>]*>\s*(?:<span[^>]*>)?research-annotator-(?:data-v1:[a-f0-9]+:\d+|pdf-note-v1:[A-Z0-9]+|managed-note-v1:[\w-]+)(?:<\/span>)?\s*<\/p>/gi,"");
            const networkFingerprint=config.filter?.type==='network'?(items?AnnotaNetwork.fingerprint(config.library):content.match(/networkfp=([a-f0-9]+)/)?.[1]||AnnotaNetwork.fingerprint(config.library)):'';
            const href='zotero://select/'+(config.library.type==="group"?'groups/'+config.library.id:'library')+'?researchannotator='+marker+(data?'&amp;data='+data:'')+(networkFingerprint?'&amp;networkfp='+networkFingerprint:'');
            const title=config.title && !/<h1\b/i.test(content) ? String(config.title).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;") : content.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<\/?a\b[^>]*>/gi,"")||"Research Notes";
            const badge='<p><em>ResearchAnnotator</em></p>';
            if(!/<p\b[^>]*>\s*<em\b[^>]*>ResearchAnnotator<\/em>\s*<\/p>/i.test(content))content=content.replace(/(<\/h1>)/i,'$1'+badge);
            const heading='<h1><a href="'+href+'">'+title+'</a></h1>'+( /<h1\b/i.test(content)?'':badge);
            return (/<h1\b/i.test(content)?content.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i,heading):heading+content).trim();
        },
        repairHTML(content,previous) {
            const known=new Set(Object.values(previous?.generated||{}).flatMap(html=>this.blocks(html)).map(b=>this.canonical(b.html)));
            const seen=new Set(),recovered=[];
            const snapshots=this.snapshotNodes(content),top=snapshots.filter(node=>!snapshots.some(parent=>parent!==node&&node.start>parent.start&&node.end<parent.end));
            if(top.some(node=>node.close===undefined))throw Error("Snapshot boundaries are incomplete. Repair stopped; preserve the original backup for manual recovery.");
            let base=this.replaceRanges(content,top.map(node=>[node.start,node.end]),"");
            const remaining=new Set(this.blocks(base).map(b=>this.canonical(b.html)));
            const walk=node=>{
                const nested=snapshots.includes(node);
                if(nested){for(const child of node.children.slice(1))walk(child);return;}
                if(node.children.some(child=>snapshots.some(s=>s.start>=child.start&&s.end<=child.end))){node.children.forEach(walk);return;}
                if(/^(div|root)$/.test(node.tag)){node.children.forEach(walk);return;}
                const html=content.slice(node.start,node.end),plain=html.replace(/<[^>]*>/g,"").trim(),signature=this.canonical(html);
                if(!plain||/^research-annotator-(?:data-v1:[a-f0-9]+:\d+|pdf-note-v1:[A-Z0-9]+|managed-note-v1:[\w-]+)$/.test(plain)||(node.tag==="h1"&&remaining.has(signature))||node.tag==="hr"||(known.has(signature)&&remaining.has(signature))||seen.has(signature))return;
                seen.add(signature);recovered.push(html.replace(/<h[12]\b/gi,"<h3").replace(/<\/h[12]>/gi,"</h3>"));
            };
            top.forEach(node=>{node.children.slice(1).forEach(walk);});
            // Only exact plugin-labelled snapshots are flattened. Ordinary blockquotes
            // remain byte-for-byte; uncertain historical fragments stay for review.
            const unique=recovered.filter(html=>!remaining.has(this.canonical(html)));
            if(unique.length)base+='<blockquote><p><strong>Recovered content for review:</strong></p>'+unique.join("")+'</blockquote>';
            return base;
        },
        async repair(config) {
            const identity=this.identity(config.library,config.scope);
            return this.serialize(identity,async()=>{
                const library=AnnotaData.resolveLibrary(config.library);if(!library||library.editable===false)throw Error("Managed note library unavailable or read-only");
                const marker=config.scope.type==="pdf"?"research-annotator-pdf-note-v1:"+config.scope.key:"research-annotator-managed-note-v1:"+config.id;
                const note=await this.find(library.libraryID,marker);if(!note)throw Error("Managed note unavailable");
                const original=note.getNote(),previous=this.config(config.library,config.scope)||config;
                const backup=await AnnotaInfrastructure.backup(AnnotaInfrastructure.path("infrastructure"),{version:1,kind:"managed-note-repair",library:config.library,noteKey:note.key,noteHTML:original,configuration:previous},"managed-note-repair");
                const content=this.stamp(this.repairHTML(original,previous),config);
                if(note.getNote()!==original)throw Error("Note changed during repair backup; retry from its latest version");
                if(content!==original){note.setNote(content);try{await note.saveTx();}catch(error){note.setNote(original);throw error;}}
                await this.configure({...previous,content:note.getNote(),repairBackup:backup,updatedAt:new Date().toISOString()});return {backup,noteKey:note.key};
            });
        },
        async restoreRepair(config) {
            const library=AnnotaData.resolveLibrary(config.library);if(!library||library.editable===false)throw Error("Managed note library unavailable or read-only");
            const stored=this.config(config.library,config.scope),backup=await IOUtils.readJSON(stored?.repairBackup||"");
            if(backup.kind!=="managed-note-repair"||backup.version!==1||backup.noteKey!==stored.noteKey||AnnotaData.libraryKey(backup.library)!==AnnotaData.libraryKey(config.library)||typeof backup.noteHTML!=="string")throw Error("Invalid or mismatched repair backup");
            const marker=config.scope.type==="pdf"?"research-annotator-pdf-note-v1:"+config.scope.key:"research-annotator-managed-note-v1:"+config.id;
            return this.serialize(this.identity(config.library,config.scope),async()=>{
                const note=await this.find(library.libraryID,marker);if(!note||note.key!==backup.noteKey)throw Error("Managed note unavailable");
                const current=note.getNote();const beforeRestore=await AnnotaInfrastructure.backup(AnnotaInfrastructure.path("infrastructure"),{version:1,kind:"managed-note-repair",library:config.library,noteKey:note.key,noteHTML:current,configuration:stored},"managed-note-before-restore");
                note.setNote(backup.noteHTML);try{await note.saveTx();}catch(error){note.setNote(current);throw error;}
                await this.configure({...backup.configuration,mode:"manual",content:note.getNote(),repairBackup:beforeRestore});return {backup:beforeRestore};
            });
        },
        guard(content, items, previous) {
            const ownsContent = !!previous?.content && !!previous?.generated;
            if (previous?.recordKeys?.some(key => items.some(item => item.key === key && !AnnotaCardFields.get(item)))) {
                throw Error("Local structured records are missing; existing research note preserved. Restore the matching backup before updating.");
            }
            const marker = content.match(/research-annotator-data-v1:([a-f0-9]+):([0-9]+)/);
            const local = items.filter(item => AnnotaCardFields.get(item)).length;
            const fingerprint = Annota.fieldFingerprint(JSON.stringify(items.map(item => [item.key, AnnotaCardFields.get(item)?.values || {}]).sort((a,b) => a[0].localeCompare(b[0]))));
            if (marker && !ownsContent && (local < Number(marker[2]) || fingerprint !== marker[1])) throw Error("Research data is incomplete or differs on this device. Import the matching structured-data backup before updating this note.");
            const missingSavedAI = items.some(item => Annota.annotationFields(Annota.keyForItem(item)).some(field => {
                if (field.type !== "ai" || String(AnnotaCardFields.get(item)?.values[field.name] || "").trim()) return false;
                const label = String(field.label || field.name).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const match = content.match(new RegExp('<p\\b[^>]*>\\s*<(?:strong|b)>' + label + ':<\\/(?:strong|b)>([\\s\\S]*?)<\\/p>', 'i'));
                return match && this.canonical(match[1]) && !/Not generated yet|Generating\.\.\./i.test(match[1]);
            }));
            if (!ownsContent && missingSavedAI) {
                throw Error("Existing note may contain AI data missing locally; synchronization paused to protect it. Import complete research data first.");
            }
        },
        pdfConfig(attachment, libraryID) {
            const library = AnnotaData.libraryIdentity(Zotero.Libraries.get(libraryID)), scope = { type: "pdf", key: attachment.key };
            const existing=this.config(library,scope); if(existing)return {...existing,include:{publicationTitle:false,authors:false,year:false,citation:false,page:false,tags:false,omitEmpty:true,...existing.include}}; return { id: "pdf_" + attachment.key, title: typeof AnnotaNotePresentation!=="undefined"?AnnotaNotePresentation.pdfTitle(attachment):undefined, library, scope, mode: "auto", include: { publicationTitle: false, authors: false, year: false, citation: false, page: false, text: true, comment: true, color: true, global: true, colorFields: true, tags: false, omitEmpty: true } };
        },
        preparePDF(note, items, config, html, generated) {
            const previous = this.config(config.library, config.scope);
            this.guard(note.getNote() || "", items, previous);
            const base = this.preserveEdits(note.getNote() || "", previous?.generated ? previous : { generated });
            return this.stamp(this.replaceManaged(base,html,previous?.generated?previous:{generated}),config,items);
        },
        compareColor(a,b,config) {
            if(!config.colorOrder?.length)return getPref('paperNoteSortOrder','pdf')==='color'?a.color.localeCompare(b.color):0;
            const rank=entry=>{const id=AnnotaPalette.resolve(entry.color)?.id;const n=config.colorOrder.indexOf(id);return n<0?config.colorOrder.length:n;};return rank(a)-rank(b);
        },
        async compileAnnotations(items, config) {
            await Zotero.Items.loadDataTypes?.(items,['tags']);
            const metadata = new Map(), attachments = new Map(), groups = new Map(), generated = {};
            const escapeHTML = value => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
            for (const item of items) {
                if (!item?.isAnnotation?.() || item.deleted || Annota._deletedAnnotationKeys?.has(item.libraryID + ":" + item.key)) continue;
                if (!attachments.has(item.parentID)) attachments.set(item.parentID, await Zotero.Items.getAsync(item.parentID));
                const attachment = attachments.get(item.parentID); if (!attachment?.isAttachment?.() || attachment.deleted) continue;
                const library = Zotero.Libraries.get(item.libraryID);
                if (AnnotaData.libraryKey(AnnotaData.libraryIdentity(library)) !== AnnotaData.libraryKey(config.library)) throw Error("Compilation cannot cross libraries");
                if (!metadata.has(item.libraryID)) metadata.set(item.libraryID, await Annota._getResearchMetadata(item.libraryID));
                const path = library.libraryType === "group" ? "groups/" + (library.libraryTypeID || library.groupID) : "library";
                const pdfLinkBase = "zotero://open-pdf/" + path + "/items/" + attachment.key;
                const entry = Annota._renderManagedAnnotationEntry(item, { libraryID: item.libraryID, metadata: metadata.get(item.libraryID),
                    colorLabels: Annota.getColorLabels(), pdfLinkBase, escapeHTML, managedConfig: config });
                const parent = attachment.parentID ? await Zotero.Items.getAsync(attachment.parentID) : attachment;
                const key = parent?.key || attachment.key;
                if (!groups.has(key)) groups.set(key, { parent, item, title: parent?.getDisplayTitle?.() || parent?.getField?.("title") || key, entries: [], source: pdfLinkBase + "?annotation=" + item.key });
                if (config.groupByPublication === false) this.decorateEntry(entry, item, config, parent);
                entry.sort = String(item.annotationSortIndex || ""); groups.get(key).entries.push(entry);
            }
            const output = []; let index = 0;
            for (const [key, group] of groups) {
                const heading = {html: '<div data-ra-entry="publication:' + escapeHTML(key) + '"><h2><a href="' + escapeHTML(group.source) + '">' + escapeHTML(config.include.publicationTitle === false ? "Publication" : group.title) + '</a></h2></div>'};
                this.decorateEntry(heading, group.item, {include:{...config.include,publicationTitle:false}}, group.parent);
                const header = heading.html;
                if (config.groupByPublication !== false) { output.push(header); generated["publication:" + key] = header; }
                group.entries.sort((a,b) => this.compareColor(a,b,config) || a.sort.localeCompare(b.sort) || a.key.localeCompare(b.key));
                for (const entry of group.entries) {
                    const html = entry.html.replace(/(<h2\b[^>]*>)/, '$1' + (++index) + '. '); output.push(html); generated[entry.key] = html;
                }
            }
            const compiled={ html: output.join('\n<hr>\n'), generated };
            return config.filter?.type==='network'?AnnotaNetwork.supplement(compiled,config):compiled;
        },
        decorateEntry(entry, item, config, parent) {
            const escape = value => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const include = config?.include || {}, rows = [];
            if (include.publicationTitle === true) rows.push(["Publication", parent?.getDisplayTitle?.() || parent?.getField?.("title")]);
            if (include.authors === true) rows.push(["Authors", (parent?.getCreators?.() || []).map(c => [c.firstName, c.lastName || c.name].filter(Boolean).join(" ")).join(", ")]);
            if (include.year === true) rows.push(["Year", parent?.getField?.("date")?.match(/\d{4}/)?.[0]]);
            if (include.citation === true) rows.push(["Source", (typeof AnnotaReview !== "undefined" && AnnotaReview ? AnnotaReview.sourceLine(item) : "") || parent?.getDisplayTitle?.() || parent?.key]);
            entry.html = entry.html.replace(/<\/h2>/, '</h2>' + rows.filter(([,value]) => value).map(([label,value]) => '<p><strong>' + label + ':</strong> ' + escape(value) + '</p>').join(''));
            return entry;
        },
        async synchronize(config, compiler, { manual = false, explicitOrder = false } = {}) {
            if(config.filter?.type==='pdf'&&config.scope.type!=='pdf')throw Error("A PDF batch request must target its individual PDF notes, not a standalone research note");
            const current=await this.recoverOrphan(this.config(config.library,config.scope)||config);
            if(current.managementDisabled)throw Error('Management stopped after intentional deletion. Use Recreate / Resume management to continue.');
            const intent={...config};for(const key of ["generated","content","noteKey","recordKeys"])delete intent[key];
            const identity = await this.configure(intent);
            return this.serialize(identity, async () => {
                const previous = AnnotaInfrastructure.state.notes[identity];
                if(previous.managementDisabled)throw Error('Managed note intentionally deleted; explicit recreation is required.');
                if (config.mode === "static" && previous.noteKey && !explicitOrder || config.mode === "manual" && !manual) return null;
                const library = AnnotaData.resolveLibrary(config.library); if (!library) throw Error("Managed note library unavailable");
                if (library.editable === false) throw Error("Managed note library is read-only");
                if (config.scope.type === "pdf") {
                    const attachment = await AnnotaData.annotation(library.libraryID, config.scope.key);
                    if (!attachment?.isAttachment?.() || attachment.deleted) throw Error("Source PDF unavailable");
                    await Annota._syncPaperResearchNote({ libraryID: library.libraryID, parentID: attachment.id, manualSync: manual });
                    return this.find(library.libraryID, "research-annotator-pdf-note-v1:" + attachment.key);
                }
                const marker = "research-annotator-managed-note-v1:" + config.id;
                let note = await this.find(library.libraryID, marker);
                if(config.filter?.type==='network')AnnotaNetwork.guardNote(note?.getNote()||'',previous,config);
                for (const key of previous?.recordKeys || []) {
                    const item = await AnnotaData.annotation(library.libraryID, key);
                    if (item?.isAnnotation?.() && !item.deleted && !Annota._deletedAnnotationKeys?.has(item.libraryID + ":" + key) && !AnnotaCardFields.get(item)) {
                        throw Error("Local structured records are missing; research note preserved. Import the matching backup first.");
                    }
                }
                if (!note) { note = new Zotero.Item("note"); note.libraryID = library.libraryID;if(typeof AnnotaNotePresentation!=="undefined")await AnnotaNotePresentation.applyDestination(note,await AnnotaNotePresentation.resolveDestination(config.sourceScope||{library:config.library},config.destination)); }
                const compiled = typeof compiler === "function" ? await compiler(config) : await this.compileAnnotations(compiler || [], config);
                if (!compiled || typeof compiled.html !== "string") throw Error("Invalid managed note compilation");
                const escapedTitle = String(config.title || "Research Notes").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                const existing = note.getNote() || '<h1>' + escapedTitle + '</h1><p>' + marker + '</p>';
                const items = Array.isArray(compiler) ? compiler : null;
                if (items) this.guard(existing, items, previous);
                const ownership=previous?.generated?previous:{generated:compiled.generated||{}};
                let content = this.replaceManaged(this.preserveEdits(existing,ownership),compiled.html,ownership);
                content=this.stamp(content,config,items);
                if(this.keepNormalized(note.getNote(),content,previous?.generated,compiled.generated||{}))content=note.getNote();
                if(this.config(config.library,config.scope)?.managementDisabled)throw Error('Management stopped during generation; note preserved.');
                if (content !== note.getNote()) { note.setNote(content); await note.saveTx(); }
                await this.configure({ ...config, title:typeof AnnotaNotePresentation!=="undefined"?AnnotaNotePresentation.readTitle(content,config.title):config.title, noteKey: note.key, generated: compiled.generated || {}, content,
                    ...(compiled.networkRecords?{networkRecords:compiled.networkRecords}:{}),
                    ...(items ? { recordKeys: items.filter(item => AnnotaCardFields.get(item)).map(item => item.key) } : {}), updatedAt: new Date().toISOString() }); return note;
            }).then(note=>{this.errors.delete(config.id);return note;},error=>{this.errors.set(config.id,String(error.message||error).slice(0,2000));throw error;});
        }
    },
    async stop() {
        this.stopping = true;
        const errors = [];
        for (const [view] of AnnotaCardFields._views) {
            try { if (view.isConnected && view._flushDraft) await view._flushDraft(); }
            catch (error) { errors.push(error.message || String(error)); }
        }
        for (const observer of [...this._draftDocuments?.values() || []]) observer.unload();
        for (const id of this.jobs._retryTimers?.keys() || []) this.jobs.clearRetry(id);
        try { await this.mutate(state => { for (const job of Object.values(state.jobs)) if (["running", "queued"].includes(job.state)) { job.state = "interrupted"; job.error = "Stopped during shutdown; explicit resume required"; } }); }
        catch (error) { errors.push(error.message); }
        const pending = (Annota._shutdownNoteScopes || []).map(scope => Annota._syncPaperResearchNote(scope));
        await Promise.allSettled([...this.notes.queues.values(), ...Annota._paperNoteQueues?.values() || [], ...pending]);
        try { await AnnotaCardFields.flush(); } catch (error) { errors.push(error.message); }
        try { await this._stateQueue; } catch (error) { errors.push(error.message); }
        this.jobs.listeners.clear();
        if (errors.length) throw Error(errors.join("; "));
    }
};
