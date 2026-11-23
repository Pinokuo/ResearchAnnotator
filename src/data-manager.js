/* Portable extension state only: never writes native Comments, notes, PDFs or Zotero items. */
var AnnotaData = {
    format: "ResearchAnnotator",
    version: 1,
    // Explicit portable preference inventory; credentials, executable paths, device identity and CLI detection are local.
    keys: ["noteDestination", "fieldEditorInstructions", "explorerSearches", "palette", "globalFields", "fieldCategories", "suggestionDismissals", "fieldAliases", "colorPrompts", "colorLabels", "colorLabelLayout", "paperNoteSortOrder", "aiConcurrency",
        "provider", "model", "endpoint", "ollamaEndpoint", "ollamaModel", "cliModel", "cliEffort", "temperature", "language", "maxWords",
        "sendContext", "maxAbstractChars", "resolveCitations", "maxRefs", "retries", "markFailures", "failedTag", "structuredOutput",
        "alsoUnderline", "overwrite", "showPlaceholder", "chatProvider", "chatModel", "chatOllamaModel", "chatCliModel", "chatCliEffort",
        "chatMaxChars", "chatIncludeAnnotations", "chatIncludeNotes", "chatEditNotes", "chatCollections", "chatLibraryItems", "chatInstructions",
        "chatSelectionButton", "chatKeepHistory", "chatShortcut", "uiLanguage", "spellLanguage", "spellGrammar", "spellLive", "cardFields"],
    jsonKeys: ["noteDestination", "fieldEditorInstructions", "explorerSearches", "palette", "globalFields", "fieldCategories", "suggestionDismissals", "fieldAliases", "colorPrompts", "colorLabels", "chatCollections"],
    validateExplorerQuery(query) {
        const scope = query?.scope;
        if (!this.object(query) || typeof query.text !== "string" || query.text.length > 20000 || !scope ||
            !["library", "collection", "publications", "attachments"].includes(scope.kind) || !["user", "group", "local"].includes(scope.library?.type) ||
            typeof scope.library.id !== "string" || (scope.kind === "collection" && typeof scope.key !== "string") ||
            (["publications", "attachments"].includes(scope.kind) && (!Array.isArray(scope.keys) || scope.keys.some(key => typeof key !== "string")))) throw Error("Invalid Explorer scope/search");
        let count = 0;
        const filter = (node, depth = 0) => {
            if (!this.object(node) || depth > 8 || ++count > 150) throw Error("Explorer filter nesting/size limit exceeded");
            if (node.children) {
                if (!["and", "or"].includes(node.logic) || !Array.isArray(node.children)) throw Error("Invalid Explorer filter group");
                node.children.forEach(child => filter(child, depth + 1));
            } else if (!["library", "collection", "publication", "year", "author", "attachment", "color", "type", "tag", "field", "status", "text", "comment"].includes(node.property) ||
                !["contains", "notContains", "equals", "notEquals", "empty", "notEmpty", "any", "all"].includes(node.operator) ||
                !Array.isArray(node.values) || node.values.some(value => typeof value !== "string") || (node.property === "field" && typeof node.fieldID !== "string")) throw Error("Invalid Explorer filter");
        };
        filter(query.filters);
        for (const part of [query.sort, query.group]) {
            if (part && (!this.object(part) || !["none", "publication", "year", "page", "date", "color", "field"].includes(part.key) ||
                part.key === "field" && typeof part.fieldID !== "string")) throw Error("Invalid Explorer sorting/grouping");
        }
        if (query.display && (!this.object(query.display) || Object.values(query.display).some(value => typeof value !== "boolean"))) throw Error("Invalid Explorer display options");
        return query;
    },
    validateExplorerSearches(value) {
        if (!this.object(value) || value.version !== 1 || !Array.isArray(value.searches)) throw Error("Invalid saved Explorer searches");
        const seen = new Set();
        for (const search of value.searches) {
            if (!/^[A-Za-z0-9_-]+$/.test(search.id || "") || seen.has(search.id) || typeof search.name !== "string" || !search.name.trim()) throw Error("Invalid saved search identity/name");
            seen.add(search.id); this.validateExplorerQuery(search);
        }
        return value;
    },
    clone(value) { return JSON.parse(JSON.stringify(value)); },
    redact(value) {
        const secrets = ["apiKey", "password", "token", "authToken", "accessToken", "refreshToken"]
            .map(key => Zotero.Prefs.get("researchannotator." + key)).filter(v => typeof v === "string" && v.length >= 4);
        const walk = value => {
            if (typeof value === "string") { for (const secret of secrets) value = value.split(secret).join("[credential omitted]"); return value; }
            if (Array.isArray(value)) return value.map(walk);
            // Scientific fields may legitimately be called "token" or "password".
            // Credential preferences are excluded by the settings allowlist; redact actual known secrets, not scientific keys.
            if (this.object(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, walk(child)]));
            return value;
        };
        return walk(value);
    },
    object(value) { return !!value && typeof value === "object" && !Array.isArray(value); },
    inspect(value, depth = 0) {
        if (depth > 30) throw Error("Imported data is nested too deeply.");
        if (typeof value === "number" && !Number.isFinite(value)) throw Error("Invalid numeric value.");
        if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
            if (["__proto__", "prototype", "constructor"].includes(key)) throw Error("Unsafe data property.");
            this.inspect(child, depth + 1);
        }
    },
    deviceID() {
        let id = Zotero.Prefs.get("researchannotator.backupDeviceID");
        if (!id) { id = Annota.newFieldID("device"); Zotero.Prefs.set("researchannotator.backupDeviceID", id); }
        return id;
    },
    libraryIdentity(library) {
        if (library.libraryType === "group") return { type: "group", id: String(library.libraryTypeID || Zotero.Groups.getGroupIDFromLibraryID(library.libraryID)) };
        const user = Zotero.Users.getCurrentUserID();
        return user ? { type: "user", id: String(user) } : { type: "local", id: this.deviceID() };
    },
    libraryKey(identity) { return identity.type + ":" + identity.id; },
    libraries() {
        return Zotero.Libraries.getAll().filter(library => ["user", "group"].includes(library.libraryType)).map(library => ({
            library, identity: this.libraryIdentity(library)
        }));
    },
    async annotation(libraryID, key) {
        return Zotero.Items.getByLibraryAndKeyAsync ? Zotero.Items.getByLibraryAndKeyAsync(libraryID, key) : Zotero.Items.getByLibraryAndKey(libraryID, key);
    },
    resolveLibrary(identity, mapping = {}) {
        const key = this.libraryKey(identity), choices = this.libraries();
        if (Object.hasOwn(mapping, key)) return choices.find(c => c.library.libraryID === Number(mapping[key]))?.library;
        const matches = choices.filter(c => this.libraryKey(c.identity) === key);
        return matches.length === 1 ? matches[0].library : null;
    },
    safeEndpoint(value) {
        const URLType = typeof URL !== "undefined" ? URL : Zotero.getMainWindow?.()?.URL;
        if (!URLType) throw Error("URL validation is unavailable in this Zotero window.");
        const url = new URLType(value);
        if (!["http:", "https:"].includes(url.protocol)) throw Error("Provider endpoints must use HTTP or HTTPS.");
        url.username = ""; url.password = "";
        for (const key of [...url.searchParams.keys()]) if (/key|token|password|secret|auth|credential/i.test(key)) url.searchParams.delete(key);
        return url.toString();
    },
    settings() {
        const prefs = {};
        for (const key of this.keys) {
            let value = Zotero.Prefs.get("researchannotator." + key);
            if (value === undefined || value === null) continue;
            if (this.jsonKeys.includes(key) && value) {
                value = JSON.parse(value);
                if (key === "globalFields") delete value.migrationLibraries; // Local completion checkpoints are not portable identities.
                if (key === "chatCollections") value = Object.entries(value).map(([libraryID, scope]) => {
                    const library = Zotero.Libraries.get(Number(libraryID));
                    if (!library) throw Error("An unknown library is referenced by chat settings.");
                    return { library: this.libraryIdentity(library), scope };
                });
            }
            if (/endpoint$/i.test(key) && value) value = this.safeEndpoint(String(value));
            prefs[key] = value;
        }
        return { prefs };
    },
    validateSettings(settings) {
        if (!this.object(settings) || !this.object(settings.prefs)) throw Error("Invalid settings document.");
        for (const [key, value] of Object.entries(settings.prefs)) {
            if (!this.keys.includes(key)) throw Error("Unknown or non-portable preference: " + key);
            if (this.jsonKeys.includes(key)) {
                if (value !== "" && !this.object(value) && !(key === "chatCollections" && Array.isArray(value))) throw Error("Invalid JSON preference: " + key);
            }
            else if (!["string", "number", "boolean"].includes(typeof value)) throw Error("Invalid preference value: " + key);
            const booleans = ["sendContext", "resolveCitations", "markFailures", "structuredOutput", "alsoUnderline", "overwrite", "showPlaceholder", "chatIncludeAnnotations", "chatIncludeNotes", "chatEditNotes", "chatSelectionButton", "chatKeepHistory", "spellGrammar", "spellLive", "cardFields"];
            const integers = ["aiConcurrency", "maxWords", "maxAbstractChars", "maxRefs", "retries", "chatMaxChars", "chatLibraryItems"];
            if (booleans.includes(key) && typeof value !== "boolean" || integers.includes(key) && (!Number.isSafeInteger(value) || value < 0)
                || !this.jsonKeys.includes(key) && !booleans.includes(key) && !integers.includes(key) && typeof value !== "string") throw Error("Incorrect preference type: " + key);
            if (/endpoint$/i.test(key) && value && this.safeEndpoint(value) !== value) throw Error("Endpoint contains credentials or is not normalized.");
            if(key==='aiConcurrency'&&(value<1||value>8))throw Error('AI concurrency must be between 1 and 8');
        }
        const prefs = settings.prefs;
        if(prefs.noteDestination){const p=prefs.noteDestination;if(!this.object(p)||!["default","ask","last"].includes(p.mode)||!this.object(p.defaults)||!this.object(p.last))throw Error("Invalid note destination preference");for(const map of [p.defaults,p.last])for(const [key,d]of Object.entries(map)){if(!this.object(d)||!["library","collection","parent"].includes(d.kind)||!["user","group","local"].includes(d.library?.type)||typeof d.library.id!=="string"||key!==this.libraryKey(d.library)||d.kind!=="library"&&(!d.key||typeof d.key!=="string"))throw Error("Invalid portable note destination");}}
        if (prefs.fieldEditorInstructions && Object.values(prefs.fieldEditorInstructions).some(value => typeof value !== "string")) throw Error("Invalid field instruction drafts.");
        if (prefs.palette) AnnotaPalette.validate(prefs.palette);
        if (prefs.globalFields) {
            for(const definitions of [prefs.globalFields.fields || [],prefs.globalFields.archivedFields || []]){
            const ids = new Set();
            for (const field of definitions) {
                if (!/^g_[\w]+$/.test(field.id) || ids.has(field.id) || !["text", "textarea", "check", "select", "multiselect", "ai"].includes(field.type)
                    || typeof field.label !== "string" || !field.label.trim() || field.prompt !== undefined && typeof field.prompt !== "string"
                    || field.format && !Object.hasOwn(Annota.FORMATS, field.format)
                    || field.options && (!Array.isArray(field.options) || field.options.some(v => typeof v !== "string"))) throw Error("Invalid or duplicate global field definition.");
                ids.add(field.id);
            }
            }
            if (prefs.globalFields.version !== 1 || !Array.isArray(prefs.globalFields.fields)) throw Error("Unsupported global field definitions.");
        }
        if (prefs.fieldCategories) for (const entries of Object.values(prefs.fieldCategories)) {
            if (!this.object(entries) || Object.values(entries).some(value => typeof value !== "string")) throw Error("Invalid category identities.");
        }
        if (prefs.suggestionDismissals) for (const ids of Object.values(prefs.suggestionDismissals)) {
            if (!Array.isArray(ids) || ids.some(id => typeof id !== "string")) throw Error("Invalid dismissed suggestion identities.");
        }
        if (prefs.explorerSearches) this.validateExplorerSearches(prefs.explorerSearches);
        if (prefs.fieldAliases) for (const aliases of Object.values(prefs.fieldAliases)) if (!Array.isArray(aliases) || aliases.some(v => typeof v !== "string")) throw Error("Invalid field aliases.");
        if (prefs.chatCollections) {
            if (!Array.isArray(prefs.chatCollections) || prefs.chatCollections.some(entry => !entry.library || !["user", "group", "local"].includes(entry.library.type)
                || typeof entry.library.id !== "string" || !this.object(entry.scope) || !Array.isArray(entry.scope.keys) || entry.scope.keys.some(key => !/^[A-Z0-9]{8}$/.test(key)) || typeof entry.scope.sub !== "boolean")) throw Error("Invalid portable collection scope.");
        }
        if (prefs.colorLabels) for (const [hex, label] of Object.entries(prefs.colorLabels)) if (!/^#[0-9a-f]{6}$/.test(hex) || typeof label !== "string") throw Error("Invalid color labels.");
        if (prefs.colorPrompts) for (const [key, config] of Object.entries(prefs.colorPrompts)) {
            if (!/^(image:)?#[0-9a-f]{6}$/.test(key) || typeof config !== "string" && !this.object(config)) throw Error("Invalid legacy color configuration.");
            if (this.object(config) && (config.fields !== undefined && typeof config.fields !== "string" || Annota.validateFieldSchema(config.fields || "").some(issue => issue.level === "error"))) throw Error("Invalid legacy color fields.");
        }
        return settings;
    },
    validateRecord(record) {
        if (!this.object(record) || record.version !== 2 || !this.object(record.colors)) throw Error("Unsupported structured annotation record.");
        for (const [hex, color] of Object.entries(record.colors)) {
            if (!/^(image:)?#[0-9a-f]{6}$/.test(hex) || !this.object(color) || !this.object(color.values)) throw Error("Invalid per-color annotation record.");
            if (["references", "comment"].some(key => color[key] !== undefined && typeof color[key] !== "string")) throw Error("Invalid annotation text metadata.");
        }
        if (record.globalValues && !this.object(record.globalValues) || record.colorConfigs && !this.object(record.colorConfigs)) throw Error("Invalid structured values.");
        for (const [key, color] of Object.entries(record.colorConfigs || {})) {
            if (!/^(image:)?p_[\w]+$/.test(key) || !this.object(color) || !this.object(color.values)) throw Error("Invalid stable color record.");
        }
        for (const values of [record.globalValues || {}, ...Object.values(record.colors).flatMap(c => [c.values, c.valuesByID || {}]), ...Object.values(record.colorConfigs || {}).flatMap(c => [c.values, c.valuesByID || {}])]) {
            if (!this.object(values)) throw Error("Invalid stable field values.");
            for (const value of Object.values(values)) if (typeof value !== "string" && typeof value !== "boolean" && typeof value !== "number" && !(Array.isArray(value) && value.every(v => typeof v === "string"))) throw Error("Invalid annotation field value.");
        }
        if (record.generationStatus) this.validateStatus(record.generationStatus);
    },
    validateStatus(status) {
        if (!this.object(status) || !this.object(status.annotation) || !this.object(status.fields)) throw Error("Invalid generation status.");
        for (const state of [...Object.values(status.annotation), ...Object.values(status.fields)]) {
            if (!this.object(state) || state.running !== undefined && typeof state.running !== "boolean" || state.error !== undefined && typeof state.error !== "string") throw Error("Invalid generation state.");
        }
    },
    async research() {
        await AnnotaCardFields._saveQueue; await AnnotaCardFields.load();
        const storeSnapshot = this.clone(AnnotaCardFields._store), definitions = this.settings().prefs;
        const annotationStates = this.clone([...AnnotaCardFields._generationStates]), fieldStates = this.clone([...AnnotaCardFields._fieldGenerationStates]);
        const records = [], unmatched = [], historicalLibraries = [];
        const libraries = this.libraries();
        for (const { library, identity } of libraries) {
            const current = await Annota._getResearchMetadata(library.libraryID);
            const note = await Annota._findResearchMetadataNote(library.libraryID);
            const legacy = note ? await Annota._getResearchMetadataFromNote(library.libraryID) : {};
            historicalLibraries.push({ library: identity, current, legacy });
        }
        for (const [localKey, record] of Object.entries(storeSnapshot)) {
            const slash = localKey.indexOf("/"), libraryID = Number(localKey.slice(0, slash)), key = localKey.slice(slash + 1);
            const library = libraries.find(c => c.library.libraryID === libraryID);
            const item = library && await this.annotation(libraryID, key);
            if (!item?.isAnnotation?.() || item.deleted) { unmatched.push({ sourceKey: localKey, record: this.clone(record), reason: "Annotation or library not available; preserved for recovery only" }); continue; }
            const parent = await Zotero.Items.getAsync(item.parentID);
            if (!parent?.key) throw Error("Cannot export annotation without its parent attachment key: " + key);
            const status = { annotation: {}, fields: {} }, prefix = localKey + "/";
            for (const [stateKey, value] of annotationStates) if (stateKey.startsWith(prefix)) status.annotation[stateKey.slice(prefix.length)] = value;
            for (const [stateKey, value] of fieldStates) if (stateKey.startsWith(prefix)) status.fields[stateKey.slice(prefix.length)] = value;
            records.push({ library: library.identity, key, parentKey: parent.key, type: item.annotationType,
                text: item.annotationText || "", record: this.clone(record), generationStatus: status,
                historicalTags: (item.getTags?.() || []).map(t => t.tag).filter(tag => tag.startsWith("RA:")) });
        }
        const catalogs = definitions.fieldCategories || {};
        // Read-only/partially migrated libraries may have historical assignments but no JSON record yet.
        // Include them without modifying their native tags, notes, preferences or intentionally cleared records.
        for (const { library, identity } of libraries) {
            const history = historicalLibraries.find(h => this.libraryKey(h.library) === this.libraryKey(identity));
            for (const item of await Annota._getAllResearchAnnotations(library.libraryID)) {
                if (item.deleted || Object.hasOwn(storeSnapshot, library.libraryID + "/" + item.key)) continue;
                const annotationKey = library.libraryID + ":" + item.key;
                const current = history.current.annotations?.[annotationKey] || {}, legacy = history.legacy.annotations?.[annotationKey] || {};
                const historicalTags = (item.getTags?.() || []).map(t => t.tag).filter(tag => tag.startsWith("RA:"));
                if (!Object.keys(current).length && !Object.keys(legacy).length && !historicalTags.length) continue;
                const globalValues = {};
                for (const field of definitions.globalFields?.fields || []) {
                    if (!field.legacyKey) continue;
                    if (field.legacyKey === "researchComment") {
                        const comments = [...new Set([current.researchComment, legacy.researchComment].filter(Boolean))];
                        if (comments.length) globalValues[field.id] = comments.join("\n\n"); continue;
                    }
                    const values = [...(current[field.legacyKey] || []), ...(legacy[field.legacyKey] || [])], entries = catalogs[field.id] || {};
                    const ids = [];
                    for (const label of values) {
                        const folded = String(label).trim().normalize("NFKC").toLocaleLowerCase(); if (!folded) continue;
                        let id = Object.keys(entries).find(key => entries[key].normalize("NFKC").toLocaleLowerCase() === folded);
                        if (!id) {
                            let salt = 0;
                            do { id = "v_legacy_" + Annota.fieldFingerprint(field.id + "/" + folded + "/" + salt++); } while (Object.hasOwn(entries, id));
                            entries[id] = label;
                        }
                        if (!ids.includes(id)) ids.push(id);
                    }
                    catalogs[field.id] = entries; if (ids.length) globalValues[field.id] = ids;
                }
                const parent = await Zotero.Items.getAsync(item.parentID); if (!parent?.key) throw Error("Historical annotation has no parent attachment: " + item.key);
                records.push({ library: identity, key: item.key, parentKey: parent.key, type: item.annotationType, text: item.annotationText || "",
                    record: { version: 2, colors: { [Annota.keyForItem(item)]: { values: {} } }, globalValues }, historicalTags, generationStatus: { annotation: {}, fields: {} } });
            }
        }
        definitions.fieldCategories = catalogs;
        return { records, unmatched, historicalLibraries, definitions: Object.fromEntries(["palette", "globalFields", "fieldCategories", "suggestionDismissals", "fieldAliases"].filter(k => definitions[k] !== undefined).map(k => [k, definitions[k]])) };
    },
    async export(kind = "backup") {
        if (!["settings", "research", "backup"].includes(kind)) throw Error("Unknown export type.");
        const result = { format: this.format, version: this.version, kind, createdAt: new Date().toISOString(), credentialsIncluded: false };
        if (kind !== "research") result.settings = this.settings();
        if (kind !== "settings") result.research = await this.research();
        if (kind === "backup") Object.assign(result.settings.prefs, result.research.definitions);
        if (typeof AnnotaInfrastructure !== "undefined" && AnnotaInfrastructure.state) {
            result.infrastructure = this.clone(AnnotaInfrastructure.state);
            delete result.infrastructure.colorMaps;for(const [id,job]of Object.entries(result.infrastructure.jobs))if(job.type==='color-map')delete result.infrastructure.jobs[id];
            if (kind !== "backup") result.infrastructure.jobs = {};
            if(kind==='settings')delete result.infrastructure.evidenceCaptures;
            if(kind==='settings'&&result.infrastructure.network){const original=result.infrastructure.network;result.infrastructure.network={...AnnotaNetwork.defaults(),types:this.clone(original.types),topicFields:this.clone(original.topicFields)};}
            for (const config of [...Object.values(result.infrastructure.notes),...Object.values(result.infrastructure.jobs).map(job=>job.payload?.config).filter(Boolean)]) {
                for(const key of ["generated","content","noteKey","repairBackup","orphanBackup","deletionBackup","orphanedNoteKey","nativeDeletedKey","orphanedAt","lastSyncError","noteUnavailable"])delete config[key];
            }
        }
        const portable = this.redact(result); this.validate(portable); return portable;
    },
    validate(document) {
        this.inspect(document);
        if (document.infrastructure) {
            if (typeof AnnotaInfrastructure === "undefined") throw Error("This backup needs Data Infrastructure support");
            AnnotaInfrastructure.validateState(document.infrastructure);
        }
        if (!this.object(document) || document.format !== this.format || document.version !== this.version
            || !["settings", "research", "backup"].includes(document.kind) || document.credentialsIncluded !== false) throw Error("Unsupported ResearchAnnotator format/version.");
        if (document.kind !== "research") this.validateSettings(document.settings);
        if (document.kind !== "settings") {
            const research = document.research;
            if (!this.object(research) || !Array.isArray(research.records) || !Array.isArray(research.unmatched) || !Array.isArray(research.historicalLibraries)) throw Error("Invalid research data document.");
            this.validateSettings({ prefs: research.definitions });
            const seen = new Set();
            for (const entry of research.records) {
                if (!entry.library || !["user", "group", "local"].includes(entry.library.type) || typeof entry.library.id !== "string"
                    || !/^[A-Z0-9]{8}$/.test(entry.key) || !/^[A-Z0-9]{8}$/.test(entry.parentKey) || !["highlight", "underline", "image", "note", "text", "ink"].includes(entry.type)
                    || typeof entry.text !== "string") throw Error("Invalid portable annotation identity.");
                const key = this.libraryKey(entry.library) + "/" + entry.key;
                if (seen.has(key)) throw Error("Duplicate annotation identity."); seen.add(key); this.validateRecord(entry.record);
                if (entry.generationStatus) this.validateStatus(entry.generationStatus);
                if (entry.historicalTags && (!Array.isArray(entry.historicalTags) || entry.historicalTags.some(tag => typeof tag !== "string" || !tag.startsWith("RA:")))) throw Error("Invalid historical research tags.");
            }
            for (const entry of research.unmatched) this.validateRecord(entry.record);
            for (const history of research.historicalLibraries) if (!history.library || !["user", "group", "local"].includes(history.library.type)
                || typeof history.library.id !== "string" || !this.object(history.current) || !this.object(history.legacy)) throw Error("Invalid historical metadata.");
        }
        return document;
    },
    merge(current, incoming, policy, conflicts, path = "") {
        if (current === undefined) return this.clone(incoming);
        if (JSON.stringify(current) === JSON.stringify(incoming)) return current;
        if(/^infrastructure\/network\/(relationships|questions|types|suggestions)\/[^/]+$/.test(path)){
            conflicts.push({path,current:this.clone(current),incoming:this.clone(incoming)});return policy==='incoming'?this.clone(incoming):this.clone(current);
        }
        if (this.object(current) && this.object(incoming)) {
            const result = this.clone(current);
            for (const [key, value] of Object.entries(incoming)) result[key] = this.merge(result[key], value, policy, conflicts, path + "/" + key);
            if (path.startsWith("settings/palette/colors/") && current.id === incoming.id && current.hex && incoming.hex) {
                // A future-only imported color edit must still recognize annotations using the destination's previous hex.
                result.aliases = [...new Set([...(current.aliases || []), ...(incoming.aliases || []), current.hex, incoming.hex])].filter(hex => hex !== result.hex);
            }
            return result;
        }
        if (Array.isArray(current) && Array.isArray(incoming) && (path.includes("/fieldAliases/") || path.endsWith("/aliases"))) return [...new Set([...current, ...incoming])];
        // Ordered definitions merge by stable ID, not array position or displayed label.
        if (Array.isArray(current) && Array.isArray(incoming) && [...current, ...incoming].every(v => this.object(v) && typeof v.id === "string")) {
            const result = this.clone(current);
            for (const value of incoming) {
                const index = result.findIndex(v => v.id === value.id);
                if (index < 0) result.push(this.clone(value));
                else result[index] = this.merge(result[index], value, policy, conflicts, path + "/" + value.id);
            }
            return result;
        }
        conflicts.push({ path, current: this.clone(current), incoming: this.clone(incoming) });
        return policy === "incoming" ? this.clone(incoming) : this.clone(current);
    },
    restoreGenerationStatus() {
        for (const [key, record] of Object.entries(AnnotaCardFields._store || {})) {
            const status = record.generationStatus;
            if (!status) continue;
            const interrupted = state => state.running ? { ...state, running: false, error: "Generation was interrupted. Retry this field." } : state;
            for (const [scope, value] of Object.entries(status.annotation || {})) AnnotaCardFields._generationStates.set(key + "/" + scope, interrupted(value));
            for (const [scope, value] of Object.entries(status.fields || {})) AnnotaCardFields._fieldGenerationStates.set(key + "/" + scope, interrupted(value));
        }
    },
    async preview(document, { mode = "merge", conflict = "keep", mapping = {} } = {}) {
        this.validate(document);
        if (!["merge", "replace"].includes(mode) || !["keep", "incoming", "abort"].includes(conflict)) throw Error("Choose an explicit import and conflict policy.");
        await AnnotaCardFields._saveQueue; await AnnotaCardFields.load();
        const currentSettings = this.settings(), nextStore = this.clone(AnnotaCardFields._store), conflicts = [], unmatched = [], matched = [];
        const incomingPrefs = document.settings?.prefs || document.research?.definitions || {};
        const prefs = mode === "replace" ? (document.kind === "research" ? { ...this.clone(currentSettings.prefs), ...this.clone(incomingPrefs) } : this.clone(incomingPrefs))
            : this.merge(currentSettings.prefs, incomingPrefs, conflict, conflicts, "settings");
        // Research definitions must agree with the settings portion of a complete backup.
        if (document.settings && document.research && Object.entries(document.research.definitions).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(document.settings.prefs[key]))) throw Error("Backup settings and research definitions disagree.");
        this.validateSettings({ prefs });
        for (const entry of document.research?.records || []) {
            const library = this.resolveLibrary(entry.library, mapping);
            const item = library && await this.annotation(library.libraryID, entry.key);
            const parent = item && await Zotero.Items.getAsync(item.parentID);
            if (!item?.isAnnotation?.() || item.deleted || library.editable === false || item.annotationType !== entry.type || parent?.key !== entry.parentKey
                || Annota._normText(item.annotationText || "") !== Annota._normText(entry.text)) {
                unmatched.push({ key: entry.key, library: entry.library, reason: "Library/annotation missing, read-only, deleted, or identity/text mismatch" }); continue;
            }
            const key = AnnotaCardFields.keyOf(library.libraryID, entry.key);
            nextStore[key] = mode === "replace" ? this.clone(entry.record) : this.merge(nextStore[key], entry.record, conflict, conflicts, "annotations/" + key);
            nextStore[key].generationStatus = this.clone(entry.generationStatus || entry.record.generationStatus || { annotation: {}, fields: {} });
            if (entry.historicalTags) nextStore[key].historicalResearchTags = [...new Set([...(nextStore[key].historicalResearchTags || []), ...entry.historicalTags])];
            // Preserve historical metadata locally; do not rewrite native Zotero tags/notes/Comment.
            const history = document.research.historicalLibraries.find(h => this.libraryKey(h.library) === this.libraryKey(entry.library));
            if (history) {
                const importedHistory = { sourceLibrary: entry.library,
                catalogs: { current: { themes: history.current?.themes || [], experiments: history.current?.experiments || [] }, legacy: { themes: history.legacy?.themes || [], experiments: history.legacy?.experiments || [] } },
                annotation: { current: history.current?.annotations?.[Object.keys(history.current.annotations || {}).find(k => k.endsWith(":" + entry.key))] || {},
                    legacy: history.legacy?.annotations?.[Object.keys(history.legacy.annotations || {}).find(k => k.endsWith(":" + entry.key))] || {} } };
                if (!nextStore[key].historicalMetadata) nextStore[key].historicalMetadata = importedHistory;
                else if (JSON.stringify(nextStore[key].historicalMetadata) !== JSON.stringify(importedHistory)) {
                    const retained = nextStore[key].historicalImports || [];
                    if (!retained.some(value => JSON.stringify(value) === JSON.stringify(importedHistory))) retained.push(importedHistory);
                    nextStore[key].historicalImports = retained;
                }
            }
            matched.push({ key, item });
        }
        for (const entry of document.research?.unmatched || []) unmatched.push({ key: entry.sourceKey, reason: "Recovery-only orphan; never assigned automatically" });
        const settingsChanges = [...new Set([...Object.keys(currentSettings.prefs), ...Object.keys(prefs)])]
            .filter(key => JSON.stringify(currentSettings.prefs[key]) !== JSON.stringify(prefs[key]))
            .map(key => ({ key, before: currentSettings.prefs[key], after: prefs[key], removed: !Object.hasOwn(prefs, key) }));
        const recordReplacements = mode === "replace" ? matched.map(({ key }) => ({ key, before: AnnotaCardFields._store[key], after: nextStore[key] })) : [];
        let infrastructure;
        if (typeof AnnotaInfrastructure !== "undefined" && AnnotaInfrastructure.state && document.infrastructure) {
            const portableInfrastructure = this.clone(document.infrastructure);
            if(portableInfrastructure.network)portableInfrastructure.network=await AnnotaNetwork.portableMapping(portableInfrastructure.network,mapping,unmatched);
            for (const config of [...Object.values(portableInfrastructure.notes),...Object.values(portableInfrastructure.jobs).map(job=>job.payload?.config).filter(Boolean)]) {
                for(const key of ["generated","content","noteKey","repairBackup","orphanBackup","orphanedNoteKey","nativeDeletedKey","orphanedAt","lastSyncError","noteUnavailable"])delete config[key];
            }
            infrastructure = this.merge(AnnotaInfrastructure.state, portableInfrastructure, conflict, conflicts, "infrastructure");
            if(infrastructure.network){infrastructure.network.revision=Math.max(infrastructure.network.revision,AnnotaInfrastructure.state.network?.revision||0)+1;AnnotaInfrastructure.validateState(infrastructure);}
            for (const job of Object.values(infrastructure.jobs)) if (!["completed", "cancelled"].includes(job.state)) {
                job.state = "interrupted"; job.error = "Imported job: explicitly review and resume. Never automatically repeat paid work.";
            }
        }
        return { document: this.clone(document), mode, conflict, mapping, prefs, nextStore, conflicts, unmatched, matched, settingsChanges, recordReplacements,
            infrastructure, baseline: JSON.stringify({ settings: currentSettings, store: AnnotaCardFields._store,
                infrastructure: typeof AnnotaInfrastructure !== "undefined" ? AnnotaInfrastructure.state : undefined }) };
    },
    async backupBeforeImport() {
        const directory = PathUtils.join(Zotero.DataDirectory.dir, "researchannotator-backups");
        await IOUtils.makeDirectory(directory, { ignoreExisting: true });
        const path = PathUtils.join(directory, "before-import-" + Date.now() + "-" + Annota.newFieldID("backup") + ".json");
        await IOUtils.writeJSON(path, await this.export("backup"), { tmpPath: path + ".tmp", noOverwrite: true }); return path;
    },
    journalPath() { return PathUtils.join(Zotero.DataDirectory.dir, "researchannotator-import-journal.json"); },
    async writeJournal(journal) {
        await IOUtils.writeJSON(this.journalPath(), journal, { tmpPath: this.journalPath() + ".tmp", flush: true });
    },
    flushPreferences() {
        if (typeof Services !== "undefined" && Services.prefs?.savePrefFile) Services.prefs.savePrefFile(null);
    },
    journalPreferences(rawPrefs) {
        return Object.entries(rawPrefs).map(([key, value]) => {
            if (/endpoint$/i.test(key) && value) value = this.safeEndpoint(value);
            return { key, present: value !== undefined, ...(value === undefined ? {} : { value: this.redact(value) }) };
        });
    },
    async recoverPendingImport() {
        if (!await IOUtils.exists(this.journalPath())) return false;
        const journal = await IOUtils.readJSON(this.journalPath()); this.inspect(journal);
        if (!journal || journal.format !== "ResearchAnnotator-local-import-journal" || journal.version !== 1) throw Error("Unsupported import recovery journal. Preserve it and restore the matched pre-import backup.");
        if (journal.phase !== "pending") return false;
        if (journal.deviceID !== this.deviceID() || !this.object(journal.store) || !Array.isArray(journal.prefs)) throw Error("Recovery journal belongs to a different installation or is malformed.");
        const seen = new Set();
        for (const entry of journal.prefs) {
            if (!this.keys.includes(entry.key) || seen.has(entry.key) || typeof entry.present !== "boolean") throw Error("Invalid recovery preferences.");
            seen.add(entry.key);
            if (entry.present && !["string", "number", "boolean"].includes(typeof entry.value)) throw Error("Invalid recovery preference value.");
        }
        for (const [key, record] of Object.entries(journal.store)) {
            if (!/^\d+\/[A-Z0-9]+$/.test(key)) throw Error("Invalid local recovery identity.");
            this.validateRecord(record);
        }
        if (journal.infrastructure) AnnotaInfrastructure.validateState(journal.infrastructure);
        AnnotaCardFields._maintenance = true;
        try {
            await AnnotaCardFields.writeStore(journal.store);
            for (const entry of journal.prefs) {
                if (entry.present) Zotero.Prefs.set("researchannotator." + entry.key, entry.value); else Zotero.Prefs.clear("researchannotator." + entry.key);
            }
            this.flushPreferences();
            AnnotaCardFields._store = this.clone(journal.store);
            if (journal.infrastructure) await AnnotaInfrastructure.restoreState(journal.infrastructure);
            await this.writeJournal({ ...journal, phase: "recovered", recoveredAt: new Date().toISOString() });
            AnnotaCardFields._maintenance = false; this._recoveryError = null;
            this._pendingJournal = false;
            this.restoreGenerationStatus(); return true;
        }
        catch (error) { this._recoveryError = error.message; throw Error("Import recovery incomplete; original backup remains at " + journal.backupPath + ": " + error.message); }
    },
    async apply(plan) {
        if (this._recoveryError) throw Error("Finish interrupted-import recovery before importing: " + this._recoveryError);
        if (typeof AnnotaInfrastructure !== "undefined" && (AnnotaInfrastructure.jobs.active.size || Object.values(AnnotaInfrastructure.state?.jobs || {}).some(job => ["queued", "running"].includes(job.state)))) throw Error("Pause or finish background operations before importing");
        if (this._busy || this._requests || Annota._fieldRequests?.size || Annota.inProgress?.size) throw Error("Finish active AI operations before importing.");
        this._busy = true; AnnotaCardFields._maintenance = true;
        let backupPath;
        let pendingFlush = !!AnnotaCardFields._saveTimer;
        try {
            if (AnnotaCardFields._saveTimer) { clearTimeout(AnnotaCardFields._saveTimer); AnnotaCardFields._saveTimer = null; }
            await AnnotaCardFields._saveQueue;
            await AnnotaCardFields._writeQueue;
            if (pendingFlush) { await AnnotaCardFields.writeStore(AnnotaCardFields._store || {}); pendingFlush = false; }
            if (JSON.stringify({ settings: this.settings(), store: AnnotaCardFields._store,
                infrastructure: typeof AnnotaInfrastructure !== "undefined" ? AnnotaInfrastructure.state : undefined }) !== plan.baseline) throw Error("Data changed since preview. Preview again before importing.");
            const checked = await this.preview(plan.document, plan);
            if (checked.conflicts.length && checked.conflict === "abort") throw Error("Import has conflicts. Select Keep existing or Use imported after reviewing the preview.");
            backupPath = await this.backupBeforeImport(); // No mutation before a successful complete pre-import backup.
            await IOUtils.writeJSON(backupPath + ".received.json", checked.document, { tmpPath: backupPath + ".received.tmp" });
            const previousStore = this.clone(AnnotaCardFields._store), rawPrefs = Object.fromEntries(this.keys.map(key => [key, Zotero.Prefs.get("researchannotator." + key)]));
            const journal = { format: "ResearchAnnotator-local-import-journal", version: 1, phase: "pending",
                deviceID: this.deviceID(), backupPath, store: previousStore, prefs: this.journalPreferences(rawPrefs) };
            if (typeof AnnotaInfrastructure !== "undefined" && AnnotaInfrastructure.state) journal.infrastructure = this.clone(AnnotaInfrastructure.state);
            await this.writeJournal(journal);
            this._pendingJournal = true;
            try {
                await AnnotaCardFields.writeStore(checked.nextStore);
                for (const key of this.keys) {
                    if (!Object.hasOwn(checked.prefs, key)) {
                        if (checked.mode === "replace" && checked.document.kind !== "research") Zotero.Prefs.clear("researchannotator." + key);
                        continue;
                    }
                    let value = checked.prefs[key];
                    if (key === "globalFields" && value) {
                        // Local migration completion is not portable; do not turn an import into a full startup note rebuild.
                        const local = rawPrefs.globalFields ? JSON.parse(rawPrefs.globalFields) : {};
                        value = { ...value, migrationLibraries: local.migrationLibraries || {} };
                    }
                    if (key === "chatCollections" && Array.isArray(value)) {
                        const mapped = {};
                        for (const entry of value) {
                            const library = this.resolveLibrary(entry.library, checked.mapping);
                            if (library) mapped[library.libraryID] = entry.scope;
                        }
                        value = mapped;
                    }
                    if (this.jsonKeys.includes(key) && value !== "") value = JSON.stringify(value);
                    Zotero.Prefs.set("researchannotator." + key, value);
                }
                this.flushPreferences();
                if (checked.infrastructure) await AnnotaInfrastructure.restoreState(checked.infrastructure);
                await this.writeJournal({ ...journal, phase: "complete", completedAt: new Date().toISOString() });
                this._pendingJournal = false;
                AnnotaCardFields._store = checked.nextStore;
                this.restoreGenerationStatus(); AnnotaCardFields.refreshViews();
            }
            catch (error) {
                for (const [key, value] of Object.entries(rawPrefs)) {
                    if (value === undefined) Zotero.Prefs.clear("researchannotator." + key); else Zotero.Prefs.set("researchannotator." + key, value);
                }
                await AnnotaCardFields.writeStore(previousStore); AnnotaCardFields._store = previousStore;
                if (journal.infrastructure) await AnnotaInfrastructure.restoreState(journal.infrastructure);
                this.flushPreferences();
                await this.writeJournal({ ...journal, phase: "rolled-back" });
                this._pendingJournal = false;
                throw error;
            }
            return { imported: checked.matched.length, conflicts: checked.conflicts.length, unmatched: checked.unmatched, backupPath,
                message: "Imported extension state. Zotero items, native Comments and notes were not modified. Reopen preferences/readers to refresh palette controls." };
        }
        catch (error) { throw Error(error.message + (backupPath ? " Pre-import backup: " + backupPath : " No state was imported.")); }
        finally {
            this._busy = false; AnnotaCardFields._maintenance = !!this._pendingJournal;
            if (this._pendingJournal) this._recoveryError = "Import rollback is incomplete. Restart after resolving the storage failure; the recovery journal and pre-import backup are retained.";
            if (pendingFlush && !this._pendingJournal) AnnotaCardFields.persist();
        }
    }
};
Annota.data = AnnotaData;
// Include inherited individual/batch/review provider requests in the import guard.
AnnotaData._generateComment = Annota.generateComment;
Annota.generateComment = async function (...args) {
    if (AnnotaData._busy) throw Error("Finish importing before making AI requests.");
    AnnotaData._requests = (AnnotaData._requests || 0) + 1;
    try { return await AnnotaData._generateComment.apply(this, args); }
    finally { AnnotaData._requests--; }
};
