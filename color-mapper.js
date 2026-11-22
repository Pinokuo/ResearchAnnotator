/* Durable, local-only highlight recoloring. Never writes PDF bytes or requests AI. */
var AnnotaColorMapper = {
    operations(){return AnnotaInfrastructure.state.colorMaps||{};},
    clone(value) { return AnnotaInfrastructure.clone(value); },
    signature(item) {
        return JSON.stringify([item.libraryID,item.parentID,item.annotationType,item.annotationColor,item.annotationText,item.annotationComment,item.annotationPosition,
            item.annotationSortIndex,item.getTags(),AnnotaCardFields._store?.[item.libraryID+'/'+item.key]||null]);
    },
    distance(a,b) {
        const rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
        return Math.sqrt(rgb(a).reduce((n,v,i)=>n+(v-rgb(b)[i])**2,0));
    },
    async scan(scope,{similar=false,skipAssigned=true}={}) {
        const data=await AnnotaResearchNotes.items(scope),groups=[];let external=0;await Zotero.Items.loadDataTypes?.(data.annotations,['tags']);
        for(const item of data.annotations) {
            if(item.annotationType!=='highlight')continue;
            if(item.annotationIsExternal){external++;continue;}
            const hex=String(item.annotationColor||'').toLowerCase();if(!/^#[0-9a-f]{6}$/.test(hex))continue;
            const semantic=AnnotaPalette.resolve(hex);
            let group=groups.find(g=>g.hex===hex||(similar&&g.assigned===!!semantic&&this.distance(g.hex,hex)<=24));
            if(!group){group={hex,assigned:!!semantic,originals:[],examples:[],pdfs:[],entries:[],semantic:semantic?.label||'',excluded:!!(skipAssigned&&semantic),target:''};groups.push(group);}
            if(!group.originals.includes(hex))group.originals.push(hex);
            if(!group.pdfs.includes(item.parentID))group.pdfs.push(item.parentID);
            if(group.examples.length<3)group.examples.push(item.annotationText||'');
            group.entries.push({library:AnnotaData.libraryIdentity(Zotero.Libraries.get(item.libraryID)),key:item.key,pdf:item.parentID,before:hex,signature:this.signature(item)});
        }
        return {scope:this.clone(scope),similar,groups,external,pdfs:data.pdfs.length,
            notice:'Only editable Zotero-native highlights are mapped. External/embedded PDF annotations are not recolored. Editable imported highlights are handled like other native highlights; their historical origin is not reliably distinguishable. Zotero Import Annotations can transfer embedded annotations and modify the PDF: use a copy and review its confirmation, then rescan. Embedded presence cannot be reliably enumerated here; no import or PDF write is attempted.'};
    },
    preview(scan) {
        const entries=[];
        for(const group of scan.groups.filter(g=>!g.excluded)) {
            const color=AnnotaPalette.resolve(group.target);if(!color||color.archived)throw Error('Choose an active destination color for each included group.');
            for(const entry of group.entries)if(entry.before!==color.hex)entries.push({...entry,after:color.hex});
        }
        if(!entries.length)throw Error('No highlight color changes selected.');
        return {entries,scope:scan.scope,similar:scan.similar,pdfs:new Set(entries.map(e=>e.pdf)).size};
    },
    async enqueue(preview,{confirmed=false}={}) {
        if(!confirmed)throw Error('Review and confirm the mapping preview first.');
        if(AnnotaCardFields._maintenance||Annota._fieldRequests?.size||Annota.inProgress?.size)throw Error('Finish active annotation/AI edits before mapping.');
        const entries=this.clone(preview.entries);if(!entries.length)throw Error('Empty mapping');
        for(const entry of entries){const item=await this.item(entry);this.writable(item);if(this.signature(item)!==entry.signature)throw Error('A highlight changed since the preview. Rescan before applying.');}
        const id=Annota.newFieldID('colormap'),backup=await AnnotaInfrastructure.backup(AnnotaInfrastructure.path('infrastructure'),{kind:'color-map',id,entries},'before-color-map');
        await AnnotaInfrastructure.mutate(state=>{state.colorMaps||={};state.colorMaps[id]={id,entries,backup,createdAt:new Date().toISOString()};});
        const jobID=await AnnotaInfrastructure.jobs.enqueue('color-map',{id},{dedupe:'color-map:'+id});return {id,jobID,backup};
    },
    async item(entry){const library=AnnotaData.resolveLibrary(entry.library);if(!library)throw Error('Source library unavailable');const item=await AnnotaData.annotation(library.libraryID,entry.key);if(item)await Zotero.Items.loadDataTypes?.([item],['tags']);return item;},
    writable(item){if(!item?.isAnnotation?.()||item.deleted||item.annotationIsExternal||Zotero.Libraries.get(item.libraryID)?.editable===false)throw Error('Highlight is unavailable, external or read-only.');},
    async saveEntry(id,key,patch){await AnnotaInfrastructure.mutate(state=>{const e=state.colorMaps[id].entries.find(e=>e.key===key);Object.assign(e,patch);});},
    run(payload,control){return AnnotaInfrastructure.notes.serialize('color-mapping',()=>this.runLocked(payload,control));},
    async runLocked(payload,control) {
        const op=AnnotaInfrastructure.state.colorMaps[payload.id];if(!op)throw Error('Color mapping journal unavailable');
        const affected=new Set(op.entries.map(e=>e.pdf)),failures=[];
        Annota._colorMappingPDFs||=new Set();for(const pdf of affected)Annota._colorMappingPDFs.add(pdf);
        try {
            for(const entry of op.entries){control.check();if(entry.state==='applied'||entry.state==='undone')continue;
                try{
                    const item=await this.item(entry);this.writable(item);
                    // A prepared durable write can be recognized after interruption without recoloring twice.
                    if(entry.state==='prepared'&&item.annotationColor===entry.after&&this.signature(item)===entry.expected){await this.saveEntry(op.id,entry.key,{state:'applied',afterSignature:entry.expected});continue;}
                    if(this.signature(item)!==entry.signature)throw Error('Highlight changed since preview; left unchanged.');
                    item.annotationColor=entry.after;const expected=this.signature(item);item.annotationColor=entry.before;
                    await this.saveEntry(op.id,entry.key,{state:'prepared',expected});
                    item.annotationColor=entry.after;try{await item.saveTx();}catch(error){item.annotationColor=entry.before;throw error;}
                    await this.saveEntry(op.id,entry.key,{state:'applied',afterSignature:this.signature(item)});
                }catch(error){failures.push({key:entry.key,error:String(error.message||error)});}
                await control.progress(AnnotaInfrastructure.state.colorMaps[op.id].entries.filter(e=>e.state==='applied').length/op.entries.length,{failures});
            }
        }finally{for(const pdf of affected)Annota._colorMappingPDFs.delete(pdf);await this.refresh(op.entries);}
        if(failures.length)throw Error('Some highlights were left unchanged. Review Activity before retrying.');
    },
    async refresh(entries){
        const failures=[];for(const pdf of new Set(entries.map(e=>e.pdf))){const source=await Zotero.Items.getAsync(pdf);if(!source||source.deleted)continue;try{await Annota._syncPaperResearchNote({libraryID:source.libraryID,parentID:source.id});}catch(error){failures.push(String(error.message||error));}}
        AnnotaResearchNotes.schedule();if(failures.length)throw Error('Colors saved; note refresh needs retry: '+failures.join('; '));
    },
    undo(id,options={}){return AnnotaInfrastructure.notes.serialize('color-mapping',()=>this.undoLocked(id,options));},
    async undoLocked(id,{confirmed=false}={}) {
        if(!confirmed)throw Error('Confirm undo first');if(AnnotaInfrastructure.jobs.list().some(j=>j.type==='color-map'&&j.payload.id===id&&['queued','running'].includes(j.state)))throw Error('Pause or finish this mapping before undo.');const op=AnnotaInfrastructure.state.colorMaps?.[id];if(!op)throw Error('Mapping journal unavailable');
        const conflicts=[],restored=[];Annota._colorMappingPDFs||=new Set();for(const e of op.entries)Annota._colorMappingPDFs.add(e.pdf);
        try{for(const entry of op.entries){if(entry.state!=='applied'&&entry.state!=='undoing')continue;
            try{const item=await this.item(entry);this.writable(item);if(entry.state==='undoing'&&this.signature(item)===entry.signature){await this.saveEntry(id,entry.key,{state:'undone'});continue;}
                if(this.signature(item)!==entry.afterSignature)throw Error('Newer annotation or field edits preserved.');
                await this.saveEntry(id,entry.key,{state:'undoing'});item.annotationColor=entry.before;try{await item.saveTx();}catch(error){item.annotationColor=entry.after;throw error;}await this.saveEntry(id,entry.key,{state:'undone'});restored.push(entry.key);
            }catch(error){conflicts.push({key:entry.key,error:String(error.message||error)});}
        }}finally{for(const e of op.entries)Annota._colorMappingPDFs.delete(e.pdf);await this.refresh(op.entries);}
        return {restored,conflicts};
    },
    async review(id,main){const op=this.operations()[id];if(!op)throw Error('Mapping journal unavailable');if(AnnotaInfrastructure.jobs.list().some(j=>j.type==='color-map'&&j.payload.id===id&&['queued','running'].includes(j.state)))throw Error('Wait for mapping to finish before reviewing fields.');const pdfs=[...new Set(op.entries.map(e=>e.pdf))];await main.ZoteroPane.selectItems(pdfs);return AnnotaReview.startReview(main,false);},
    install(){Annota.colorMapper=this;AnnotaInfrastructure.jobs.register('color-map',(payload,control)=>this.run(payload,control));}
};
