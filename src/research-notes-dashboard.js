/* Window-local presentation; all generation uses the shared extension services. */
window.addEventListener("DOMContentLoaded", async () => {
    const args=window.arguments?.[0]||window.parent.workspaceHost.contextFor(window);
    const { service: service } = args;let main=args.main;
    const doc = document, $ = id => doc.getElementById(id);
    for(const b of doc.querySelectorAll('[data-note-type]'))b.addEventListener('click',()=>{$('kind').value=b.dataset.noteType;$('kind').dispatchEvent(new Event('change'));$('note-guide').open=true;setStep(2);$('scope').focus();});
    $('from-saved-search')?.addEventListener('click',()=>args.workspace?.select?.('saved'));
    let step=1;
    const setMode=mode=>{doc.body.dataset.notesMode=mode;for(const b of doc.querySelectorAll('[data-notes-mode]'))b.setAttribute('aria-pressed',String(b.dataset.notesMode===mode));};
    const setStep=value=>{step=value;setMode('create');$('note-guide').open=value>1;$('note-start').hidden=value>1;for(const n of doc.querySelectorAll('[data-note-step]'))n.hidden=Number(n.dataset.noteStep)!==value;for(const [i,n]of [...$('note-steps').children].entries())n.setAttribute('aria-current',i+1===value?'step':'false');$('note-back').hidden=value<=1;};
    for(const b of doc.querySelectorAll('[data-notes-mode]'))b.addEventListener('click',()=>setMode(b.dataset.notesMode));
    $('note-back').addEventListener('click',()=>setStep(Math.max(1,step-1)));
    $('note-source-next').addEventListener('click',async()=>{try{await load();setStep(3);}catch(e){$('status').textContent=e.message;}});
    $('note-confirm-next').addEventListener('click',()=>setStep(5));
    setStep(1);
    const core = main.Zotero.Annota, infra = core.managedNotes, jobs = core.backgroundJobs;
    let currentFields = [], currentItems = [], editing = null, loadedScope = null, modeTouched=false;
    $('mode').addEventListener('change',()=>{modeTouched=true;});
    let incoming = args.explorer;
    let networkSelection=null;
    if (incoming) {
        const entry = doc.createElement("p"); entry.textContent = "Research Explorer results are selected. Configure included content, preview and generate below.";
        doc.body.insertBefore(entry, doc.body.firstChild);
        $("kind").disabled = $("scope").disabled = true;
        if (incoming.config) { $("title").value = incoming.config.title || "Research Notes"; $("mode").value = incoming.config.mode; }
    }
    const status = message => { $("status").textContent = message; };
    const action = fn => async () => { try { await fn(); } catch (error) { status(error.message || String(error)); } };
    const button = (parent, label, run) => {
        const node = doc.createElement("button"); node.textContent = label; node.type = "button";
        node.addEventListener("click", action(run)); parent.appendChild(node); return node;
    };
    const option = (select, value, label) => { const node = doc.createElement("option"); node.value = value; node.textContent = label; select.appendChild(node); };
    const selected = id => [...$(id).selectedOptions].map(o => o.value);
    let destinations=[];
    const placement=core.notePresentation;
    const destinationChoice=()=>$('destination-choice').value===''?undefined:destinations[Number($('destination-choice').value)];
    if(placement){$('destination-mode').value=placement.preferences().mode;$('destination-mode').addEventListener('change',()=>{const p=placement.preferences();p.mode=$('destination-mode').value;placement.savePreferences(p);});$('destination-load').addEventListener('click',action(async()=>{destinations=await placement.choices(scope().library,$('destination-search').value);$('destination-choice').replaceChildren();option($('destination-choice'),'','Choose a destination');for(const [i,d]of destinations.entries())option($('destination-choice'),String(i),placement.describeDestination(d));$('destination-status').textContent='Only destinations in the source library are offered.';}));$('destination-default').addEventListener('click',action(async()=>{const d=destinationChoice();if(!d)throw Error('Choose a destination');await placement.validateDestination(d,scope().library);const p=placement.preferences();p.defaults[d.library.type+':'+d.library.id]=d;placement.savePreferences(p);$('destination-status').textContent='Default saved for this library.';}));}
    const scope = () => {
        if(networkSelection)return networkSelection.scope;
        if (incoming) return incoming.query.scope;
        if (editing) return editing.sourceScope;
        const pane = main.ZoteroPane, kind = $("scope").value, libraryID=pane.getSelectedLibraryID();
        const result = { kind, library: service.library(libraryID) };
        if (kind === "collection") {
            const collection = pane.getSelectedCollection(); if (!collection) throw Error("Select a collection in Zotero first.");
            result.key = collection.key;
        }
        if (["publications", "attachments"].includes(kind)) {
            const sources=pane.getSelectedItems().filter(i => kind === "attachments" ? i.isAttachment?.() : i.isRegularItem?.());if(sources.some(i=>Number.isInteger(i.libraryID)&&i.libraryID!==libraryID))throw Error("Select sources from one library at a time.");result.keys=sources.map(i=>i.key);
            if (!result.keys.length) throw Error("Select the requested source items in Zotero first.");
        }
        return result;
    };
    const filter = () => {
        if(editing?.filter?.type==='evidence')return editing.filter;
        if(networkSelection)return networkSelection.filter;
        if(editing?.filter?.type==='network')return editing.filter;
        if (incoming) return { type:"explorer", query:incoming.query };
        if (editing?.filter?.type === "explorer") return editing.filter;
        const type = $("kind").value;
        if (type === "pdf") return { type };
        if (type === "color") { const colorIDs = selected("colors"); if (!colorIDs.length) throw Error("Select at least one color."); return { type, colorIDs }; }
        if (!$("field").value) throw Error("Load and select a configured field.");
        return { type, fieldID: $("field").value, values: selected("values") };
    };
    const options = () => ({ title: $("title").value.trim(), destination:destinationChoice(), mode: $("mode").value,
        include: Object.fromEntries([...doc.querySelectorAll("[data-include]")].map(n => [n.dataset.include, n.checked])),
        ai: $("ai").value, regenerateOutdated: $("outdated").checked });
    const labels = { publicationTitle: "Publication title", authors: "Authors", year: "Publication year", citation: "Source citation",
        page: "PDF page number", text: "Annotation content", color: "Semantic color label", comment: "Native Comment", tags: "Native Tags",
        global: "Global fields", colorFields: "Color-specific fields", globalManual: "Global manual fields", globalAI: "Global AI fields",
        colorManual: "Color-specific manual fields", colorAI: "Color-specific AI fields", omitEmpty: "Omit empty fields" };
    const checkbox = (parent, key, label, checked) => {
        const wrap = doc.createElement("label"), input = doc.createElement("input"); input.type = "checkbox";
        input.dataset.include = key; input.checked = checked; wrap.append(input, doc.createTextNode(label)); parent.appendChild(wrap);
    };
    for (const [key, value] of Object.entries(service.defaults)) checkbox($("include"), key, labels[key], value);
    const resetContent = () => {
        const defaults=service.contentDefaults?.(incoming ? "explorer" : $("kind").value) || service.defaults;
        for (const input of doc.querySelectorAll("[data-include]")) input.checked = input.dataset.include.startsWith("field:") || defaults[input.dataset.include] === true;
    };
    button($("include").parentElement, "Use simplified content defaults", () => {
        resetContent();
        status("Simplified content selected. Preview, then save configuration and update the existing note to retain its identity.");
    });
    if(incoming?.config)for(const input of doc.querySelectorAll("[data-include]"))input.checked=incoming.config.include[input.dataset.include]!==false;
    const showKind = () => {
        if(!modeTouched&&!editing&&!incoming&&!networkSelection)$('mode').value=$('kind').value==='pdf'?'auto':'manual';
        $("fieldLabel").hidden = $("valuesLabel").hidden = $("kind").value !== "field";
        $("colorsLabel").hidden = $("kind").value !== "color";$("note-destination").hidden=$("kind").value==="pdf"&&!incoming&&!networkSelection;
    };
    const fieldValues = () => {
        $("values").replaceChildren(); const field = currentFields.find(f => f.id === $("field").value); if (!field) return;
        const values = new Map();
        // The service supplies values without exposing another storage adapter to this window.
        for (const [value, label] of service.fieldValues(currentItems, field)) values.set(value, label);
        for (const [value, label] of values) option($("values"), value, label);
    };
    const load = async () => {
        loadedScope = scope(); const data = await service.items(loadedScope); currentItems = data.annotations;
        currentFields = service.fields(currentItems); $("field").replaceChildren(); $("fields").replaceChildren(); $("colors").replaceChildren();
        for (const field of currentFields) {
            option($("field"), field.id, (field.scope === "global" ? "Global: " : "Color: ") + field.label);
            checkbox($("fields"), "field:" + field.id, field.label, editing?.include?.["field:" + field.id] !== false);
        }
        for (const color of service.colors()) option($("colors"), color.id, color.label || color.hex);
        fieldValues(); showKind(); status("Source loaded. Preview to review counts before generation.");
    };
    const showSummary = counts => {
        $("summary").textContent = `${counts.publications} publications · ${counts.pdfs} PDF attachments · ${counts.annotations} annotations\n` +
            `${counts.existing} existing AI results · ${counts.missing} missing · ${counts.outdated} outdated · ${counts.failed} failed · ${counts.pending} pending\n` +
            `Estimated new AI requests: ${($("ai").value === "missing" ? counts.requests : 0) + ($("outdated").checked ? counts.outdated : 0)}`;
    };
    const preview = async () => {
        const result = await service.preview(scope(), filter(), options()); showSummary(result.counts);if(placement){$("summary").textContent+="\nTitle: "+(result.config?.title||"Parent publication title for each PDF")+"\nDestination: "+(filter().type==="pdf"?"Original PDF association":placement.describeDestination(result.config?.destination));}
        // Compiler HTML escapes source values and only uses the existing safe AI formatter.
        $("preview").innerHTML = result.html || "No matching annotations.";
        setStep(4);status("Preview ready. No AI requests were made."); return result;
    };
    const render = async () => {
        $("notes").replaceChildren();
        for (const config of service.configs().filter(c => c.noteKey||c.orphanedNoteKey||c.managementDisabled)) {
            const row = doc.createElement("div"); row.className = "record";row.dataset.managedNoteKey=config.noteKey||config.orphanedNoteKey||"";
            const line = doc.createElement("p"); line.textContent = `${config.title || "PDF research note"}${config.scope.type === "pdf" ? " / PDF " + config.scope.key : ""} · ${config.mode}${config.lastSyncError?" / Update needs attention":""}${config.managementDisabled?" / Management stopped: explicit recreation required":!config.noteKey?" / Missing note":""} · Updated: ${config.updatedAt || "unknown"}`; const actions=doc.createElement("details"),summary=doc.createElement("summary");summary.textContent=line.textContent;actions.appendChild(summary);row.appendChild(actions);
            if(config.lastSyncError){const warning=doc.createElement("p");warning.setAttribute("role","alert");warning.textContent="Note update needs attention: "+config.lastSyncError;actions.appendChild(warning);}
            button(actions, "Open", () => service.openNote(main, config));
            if (config.filter?.type === "explorer" && core.explorer) button(actions,"Open in Research Explorer",()=>core.explorer.open(main,config.filter.query));
            if(placement&&config.scope.type!=='pdf'){const move=doc.createElement('details'),heading=doc.createElement('summary'),query=doc.createElement('input'),choice=doc.createElement('select');heading.textContent='Move note...';query.type='search';query.placeholder='Find a parent publication';query.setAttribute('aria-label','Find destination publication');choice.setAttribute('aria-label','Move note destination');move.append(heading,query,choice);let places=[];const refreshPlaces=async()=>{places=await placement.choices(config.library,query.value);choice.replaceChildren();for(const [i,d]of places.entries())option(choice,String(i),placement.describeDestination(d));};button(move,'Find destinations',refreshPlaces);move.addEventListener('toggle',action(async()=>{if(move.open&&!places.length)await refreshPlaces();}));button(move,'Confirm move',async()=>{const d=places[Number(choice.value)];if(!d)throw Error('Choose an available destination');if(!window.confirm('Move this existing note to '+placement.describeDestination(d)+'? Its identity and authored content will be preserved.'))return;const moved=await placement.move(config,d);status('Note moved without duplication. Backup: '+moved.backup);await render();});actions.appendChild(move);}
            if(config.noteUnavailable||!config.noteKey)button(actions,'Recover missing note...',async()=>{if(!window.confirm('Check Zotero Trash and sync first. Recreate this missing note with a backup of its previous configuration and content? Do not continue if the original note may still return.'))return;const c=await infra.recoverOrphan(config,{confirmed:true});await service.update(c);await render();status('Missing-note recovery completed. The previous content is retained in its recovery backup.');});
            if(config.managementDisabled)button(actions,"Recreate / Resume management",async()=>{if(!window.confirm("Recreate this intentionally deleted managed note? The mode and source configuration are retained. The deleted original and backups remain available."))return;await service.resumeManagement(config,{confirmed:true});await render();});
            else button(actions, "Update", async () => { await service.update(config); await render(); });
            const order=doc.createElement('details'),orderSummary=doc.createElement('summary'),orderInfo=doc.createElement('p'),orderList=doc.createElement('div');orderSummary.textContent='Research Note Order';const effective=service.effectiveOrder?.(config)||{source:'Global default',mode:'pdf',ids:service.colors().map(c=>c.id)};orderInfo.textContent=effective.source+': '+(effective.mode==='color'?'Color groups':'PDF reading order')+'. Apply rebuilds once in every mode, including Static, without changing the update policy.';let ordered=effective.ids.slice();const orderRender=()=>{orderList.replaceChildren();for(const [i,id]of ordered.entries()){const line=doc.createElement('div');line.textContent=service.colors().find(c=>c.id===id)?.label||id;button(line,'Up',()=>{if(i){[ordered[i-1],ordered[i]]=[ordered[i],ordered[i-1]];orderRender();}});button(line,'Down',()=>{if(i<ordered.length-1){[ordered[i+1],ordered[i]]=[ordered[i],ordered[i+1]];orderRender();}});orderList.append(line);}};orderRender();order.append(orderSummary,orderInfo,orderList);button(order,'Apply note order',async()=>{await service.setColorOrder(config,ordered);await render();});button(order,'Reset to global order',async()=>{await service.setColorOrder(config,null);await render();});actions.append(order);
            const maintenance=doc.createElement('details'),maintenanceTitle=doc.createElement('summary');maintenanceTitle.textContent='Maintenance and repair';maintenance.appendChild(maintenanceTitle);actions.appendChild(maintenance);
            button(maintenance,"Repair duplicated snapshots…",async()=>{
                if(!window.confirm("Back up this managed note and flatten plugin-labelled duplicated snapshots? Genuine and uncertain recovered content will be retained for review. Ordinary blockquotes are preserved."))return;
                const result=await infra.repair(config);await render();status("Repair saved. Recoverable original backup: "+result.backup);
            });
            if(config.repairBackup)button(maintenance,"Restore pre-repair note…",async()=>{
                if(!window.confirm("Restore the exact note from its repair backup? The current version will be backed up first, and automatic updates will be paused."))return;
                const result=await infra.restoreRepair(config);await render();status("Pre-repair note restored in manual mode. Current version backup: "+result.backup);
            });
            button(maintenance, "View source scope", () => status(JSON.stringify({ scope: config.scope, sourceScope: config.sourceScope }, null, 2)));
            button(actions, "Rename", async () => { const title = window.prompt("Note title", config.title || "Research Notes"); if (title?.trim()) await service.rename(config, title.trim()); await render(); });
            const mode = doc.createElement("select"); mode.setAttribute("aria-label", "Synchronization mode");
            for (const [value, label] of [["auto", "Automatic"], ["manual", "Manual"], ["static", "Static snapshot"]]) option(mode, value, label);
            mode.value = config.mode; actions.appendChild(mode);
            button(actions, "Save mode", async () => { await service.setMode(config, mode.value); await render(); });
            button(actions, "Edit configuration", async () => {
                setStep(3);editing = config; incoming=null;networkSelection=null;$("note-guide").open=true; $("title").value = config.title || "Research Notes"; $("mode").value = config.mode;
                $("kind").value = ["explorer","network","evidence"].includes(config.filter?.type) ? "pdf" : config.filter?.type || "pdf";
                if (config.sourceScope) await load();
                for (const input of doc.querySelectorAll("[data-include]")) input.checked = config.include[input.dataset.include] !== false;
                if (config.filter?.fieldID) { $("field").value = config.filter.fieldID; fieldValues(); }
                for (const node of $("values").options) node.selected = config.filter?.values?.includes(node.value) || false;
                for (const node of $("colors").options) node.selected = config.filter?.colorIDs?.includes(node.value) || false;
                status("Editing saved configuration. Use Save configuration to keep its identity.");
            });
            button(actions, "Delete", async () => { if (window.confirm("Stop management and move this note to Zotero Trash? It will not regenerate until you explicitly recreate or resume it. User-authored content moves to Trash; backups are preserved.")) { await service.remove(config); await render(); } });
            $("notes").appendChild(row);
        }
        if(!$("notes").children.length){const empty=doc.createElement('p');empty.textContent='No managed notes yet. Choose Create a note to begin.';$("notes").appendChild(empty);}
        $("jobs").replaceChildren();
        $("job-history")?.replaceChildren();
        for (const job of jobs.list().sort((a,b)=>Number(["completed","cancelled"].includes(a.state))-Number(["completed","cancelled"].includes(b.state)))) {
            const row = doc.createElement("div"); row.className = "record";
            const text = doc.createElement("p"), cp = job.checkpoint || {};
            text.textContent = `${job.type}: ${job.state} · ${cp.stage || (job.parentJobID ? "Waiting for parent capture to complete" : "Waiting")} · ${Math.round((job.progress || 0) * 100)}% · ` +
                `${cp.completedAnnotations?.length || 0} annotations · ${cp.completedNotes?.length || 0} processed notes · ${cp.pendingAI || 0} pending AI · ` +
                `${cp.failures?.length || 0} failed · ${cp.skippedPDFs?.length || 0} PDFs skipped\n${job.error || ""}`;
            row.appendChild(text);
            if (cp.failures?.length) { const details = doc.createElement("details"), summary = doc.createElement("summary"), text = doc.createElement("pre"); summary.textContent = "Failure and recovery details"; text.textContent = JSON.stringify(cp.failures, null, 2); details.append(summary,text); row.appendChild(details); }
            if (["queued", "running"].includes(job.state)) button(row, "Pause", async () => { await jobs.pause(job.id); await render(); });
            if (["paused", "interrupted", "failed"].includes(job.state)) button(row, job.state === "failed" ? "Retry failed operations" : "Resume", async () => {
                if (job.paid && ["failed", "interrupted"].includes(job.state) && !window.confirm("An interrupted or failed AI request may already have been billed. Review saved results before retrying. Continue?")) return;
                await jobs.resume(job.id, { acknowledgePaid: true }); await render();
            });
            if (["queued", "running", "paused", "interrupted", "failed"].includes(job.state)) button(row, "Cancel", async () => { await jobs.cancel(job.id); await render(); });
            ((["completed","cancelled"].includes(job.state) && $("job-history")) || $("jobs")).appendChild(row);
        }
    };
    button($("include").parentElement, "Save configuration", async () => {
        if (!editing) throw Error("Choose Edit configuration on an existing note first.");
        editing = { ...editing, title: options().title, mode: options().mode, include: options().include,
            ...(editing.scope.type === "research" ? { sourceScope: scope(), filter: filter() } : {}) };
        if (editing.sourceScope && editing.filter) editing.querySignature = service.configurationSignature(editing.sourceScope,editing.filter);
        await infra.configure(editing); await service.rename(editing, editing.title); await render(); status("Configuration saved; use Update to refresh content.");
    });
    button($("include").parentElement, "New configuration", () => { editing = null; incoming=null;networkSelection=null;$("kind").disabled=$("scope").disabled=false;status("New configuration selected."); });
    $("kind").addEventListener("change", () => { showKind(); if(!editing&&!incoming)resetContent(); }); $("field").addEventListener("change", fieldValues);
    $("load").addEventListener("click", action(load)); $("previewButton").addEventListener("click", action(preview));
    $("generate").addEventListener("click", action(async () => {
        const result = await preview();
        if (!window.confirm("Generate research notes with these settings? Estimated new AI requests: " +
            (($("ai").value === "missing" ? result.counts.requests : 0) + ($("outdated").checked ? result.counts.outdated : 0)))) return;
        const id = await service.enqueue(scope(), filter(), options()); status("Generation queued: " + id); await render();
    }));
    $("refresh").addEventListener("click", action(render));
    let defaultsPreview=null;
    let modesPreview=null;
    $('mode-list')?.addEventListener('click',action(()=>{modesPreview=null;$('mode-apply').disabled=true;$('mode-configs').replaceChildren();for(const c of service.configs().filter(c=>c.noteKey||c.orphanedNoteKey)){const label=doc.createElement('label'),check=doc.createElement('input');check.type='checkbox';check.dataset.modeConfig=infra.identity(c.library,c.scope);label.append(check,doc.createTextNode((c.title||c.id)+' / '+c.mode+(c.scope.type==='pdf'?' / PDF '+c.scope.key:'')));$('mode-configs').appendChild(label);}}));
    $('mode-preview')?.addEventListener('click',action(()=>{modesPreview=service.previewModes([...doc.querySelectorAll('[data-mode-config]:checked')].map(c=>c.dataset.modeConfig),$('bulk-mode').value);$('mode-summary').textContent=modesPreview.map(p=>p.title+': '+p.before+' -> '+p.after).join('\n');$('mode-apply').disabled=false;}));
    $('mode-apply')?.addEventListener('click',action(async()=>{if(!modesPreview)throw Error('Preview mode changes first');if(!window.confirm('Apply update mode changes to '+modesPreview.length+' selected notes? Automatic notes will refresh using existing values; no AI requests are made.'))return;const r=await service.applyModes(modesPreview);status('Mode changes queued. Review Activity for completion or failures. Backup: '+r.backup);$('mode-apply').disabled=true;await render();}));
    $('batch-list')?.addEventListener('click',action(()=>{const library=service.library(main.ZoteroPane.getSelectedLibraryID());$('batch-configs').replaceChildren();defaultsPreview=null;$('batch-apply').disabled=true;for(const c of service.configs()){if($('batch-scope').value==='library'&&JSON.stringify(c.library)!==JSON.stringify(library))continue;if($('batch-kind').value!=='all'&&c.scope.type!==$('batch-kind').value)continue;const l=doc.createElement('label'),input=doc.createElement('input');input.type='checkbox';input.dataset.configId=c.id;input.disabled=c.mode==='static';l.append(input,doc.createTextNode((c.title||c.id)+' · '+c.mode+(c.mode==='static'?' (protected snapshot)':'')));$('batch-configs').appendChild(l);}}));
    $('batch-preview')?.addEventListener('click',action(()=>{defaultsPreview=service.previewDefaults([...doc.querySelectorAll('[data-config-id]:checked')].map(n=>n.dataset.configId));$('batch-summary').textContent=JSON.stringify(defaultsPreview.map(p=>({title:p.title,noteKey:p.noteKey,changes:Object.keys({...p.before,...p.after}).filter(k=>p.before[k]!==p.after[k]).map(k=>({setting:k,before:p.before[k],after:p.after[k]}))})),null,2);$('batch-apply').disabled=false;}));
    $('batch-apply')?.addEventListener('click',action(async()=>{if(!defaultsPreview)throw Error('Preview first');if(!window.confirm('Replace the selected explicit content settings with the previewed simplified defaults and update these notes? Recoverable backups and all managed-content safeguards remain.'))return;const result=await service.applyDefaults(defaultsPreview);$('batch-apply').disabled=true;status('Batch update queued: '+result.id+'\nBackup: '+result.backup);defaultsPreview=null;}));
    let refreshTimer;
    const listener = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(action(render), 150); };
    jobs.listeners.add(listener); window.addEventListener("unload", () => { clearTimeout(refreshTimer); jobs.listeners.delete(listener); });
    showKind();
    args.workspace?.readyView("notes",{
        setMain(value){main=value;},
        async focusManaged(key){setMode('manage');await render();const row=[...doc.querySelectorAll('[data-managed-note-key]')].find(n=>n.dataset.managedNoteKey===key);if(!row)throw Error('This managed note is unavailable. Refresh Notes and check Zotero Trash.');row.querySelector('details').open=true;row.scrollIntoView({block:'start'});},
        async setNetwork(value){setStep(3);$("note-guide").open=true;networkSelection=value;incoming=null;editing=null;$("kind").disabled=$("scope").disabled=true;$("kind").value='pdf';$("title").value=value.config.title||'Network research note';$("mode").value=value.config.mode;for(const input of doc.querySelectorAll('[data-include]'))input.checked=value.config.include[input.dataset.include]!==false;showKind();status('Network evidence selected. Preview and generate through the shared managed-note engine.');},
        activate(tab){doc.body.dataset.workspaceSection=tab;action(render)();},
        async setExplorer(value){setStep(3);$("note-guide").open=true;incoming=value;networkSelection=null;editing=null;$("kind").disabled=$("scope").disabled=true;$("kind").value="pdf";$("title").value=value.config.title||"";$("mode").value=value.config.mode;
            await load();for(const input of doc.querySelectorAll("[data-include]"))input.checked=value.config.include[input.dataset.include]!==false;showKind();status("Explorer results selected. Preview and generate using these filters.");}
    });
    try{await render();}catch(error){status(error.message);args.workspace?.failure(error);}
});
