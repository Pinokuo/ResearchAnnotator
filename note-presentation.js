/* Note titles and placement use stable configuration identities, never title lookup. */
var AnnotaNotePresentation = {
    escape(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');},
    readTitle(html,fallback=''){
        const heading=String(html||'').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
        return heading===undefined?fallback:heading.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim();
    },
    pdfTitle(pdf){const parent=pdf.parentID?Zotero.Items.get(pdf.parentID):null;return String(parent?.getField?.('title')||parent?.getDisplayTitle?.()||pdf.getField?.('title')||pdf.attachmentFilename||pdf.key);},
    entityTitle(entity){
        if(!entity)return 'selected evidence';
        if(entity.label)return entity.label;
        try{const library=AnnotaData.resolveLibrary(entity.library),item=Zotero.Items.getByLibraryAndKey(library.libraryID,entity.key);return item?.getField?.('title')||item?.annotationText||item?.getDisplayTitle?.()||entity.key;}catch(_){return entity.key;}
    },
    title(scope,filter){
        if(filter.type==='field'){const field=AnnotaResearchNotes.fields([]).find(f=>f.id===filter.fieldID)||Annota.getGlobalFields().find(f=>f.id===filter.fieldID);const values=field&&['select','multiselect'].includes(field.type)?Annota.categoryLabels(field,filter.values||[]):filter.values||[];return (field?.label||'Structured field')+' — '+(values.length?values.join(', '):'Populated values');}
        if(filter.type==='color')return AnnotaResearchNotes.colors().filter(c=>filter.colorIDs.includes(c.id)).map(c=>c.label||c.name||c.hex).join(', ')+' — research findings';
        if(filter.type==='explorer')return AnnotaExplorer.saved().find(q=>q.id===filter.query.id)?.name||filter.query.name||filter.query.title||filter.query.text||'Filtered research findings';
        if(filter.type==='network'){const state=AnnotaNetwork.state();if(filter.questionID)return state.questions[filter.questionID]?.title||'Research question';if(filter.topicKey)return 'Research topic — '+filter.topicKey;const r=filter.relationshipID&&state.relationships[filter.relationshipID];return r?(state.types[r.type]?.label||r.type)+' — '+(r.explanation||this.entityTitle(r.source)+' / '+this.entityTitle(r.target)):'Relationships — '+((filter.entity?this.entityTitle(filter.entity):null)||filter.relationshipType||'selected evidence');}
        return filter.type==='evidence'?'Captured research evidence':'Research findings';
    },
    preferences(){try{const p=JSON.parse(getPref('noteDestination','{}'));return {mode:['default','ask','last'].includes(p.mode)?p.mode:'default',defaults:p.defaults||{},last:p.last||{}};}catch(_){return {mode:'default',defaults:{},last:{}};}},
    savePreferences(p){Zotero.Prefs.set('researchannotator.noteDestination',JSON.stringify(p));},
    async validateDestination(destination,library){
        if(!destination||AnnotaData.libraryKey(destination.library)!==AnnotaData.libraryKey(library))throw Error('Destination must remain in the source library. Cross-library note moves require an explicit data migration.');
        const lib=AnnotaData.resolveLibrary(library);if(!lib||lib.editable===false)throw Error('Destination library unavailable or read-only');
        if(!['library','collection','parent'].includes(destination.kind))throw Error('Choose a note destination');
        if(destination.kind==='collection'){const c=Zotero.Collections.getByLibraryAndKey(lib.libraryID,destination.key);if(!c||c.deleted||c.libraryID!==lib.libraryID)throw Error('Destination collection unavailable');}
        if(destination.kind==='parent'){const parent=await AnnotaData.annotation(lib.libraryID,destination.key);if(!parent||parent.deleted||!parent.isRegularItem?.()||parent.libraryID!==lib.libraryID)throw Error('Destination parent publication unavailable');}
        return destination;
    },
    async resolveDestination(scope,explicit,existing){
        if(existing?.noteKey)return existing.destination||{kind:'existing',library:scope.library};
        const p=this.preferences(),key=AnnotaData.libraryKey(scope.library),destination=explicit||(p.mode==='last'?p.last[key]:p.defaults[key]);
        if(!destination&&p.mode==='ask')throw Error('Choose a destination before generating this note');
        return this.validateDestination(destination||{kind:'library',library:scope.library},scope.library);
    },
    describeDestination(d){return !d?'Source library':d.kind==='existing'?'Current note location (preserved)':d.kind==='library'?'Library root':(d.kind==='parent'?'Child note of publication ':'Member of collection ')+(d.label||d.key);},
    async choices(library,query=''){
        const lib=AnnotaData.resolveLibrary(library);if(!lib||lib.editable===false)throw Error('Source library unavailable or read-only');
        const rows=[{kind:'library',library,label:lib.name||'Library root'}];
        for(const c of await AnnotaExplorer.collections(library))rows.push({kind:'collection',library,key:c.key,label:c.label});
        if(query.trim()){const search=new Zotero.Search();search.libraryID=lib.libraryID;search.addCondition('title','contains',query.trim());for(const id of (await search.search()).slice(0,100)){const item=await Zotero.Items.getAsync(id);if(item?.isRegularItem?.()&&!item.deleted)rows.push({kind:'parent',library,key:item.key,label:item.getField('title')||item.key});}}
        return rows;
    },
    async applyDestination(note,d){
        await this.validateDestination(d,AnnotaData.libraryIdentity(Zotero.Libraries.get(note.libraryID)));
        note.parentID=d.kind==='parent'?(await AnnotaData.annotation(note.libraryID,d.key)).id:false;
        note.setCollections(d.kind==='collection'?[Zotero.Collections.getByLibraryAndKey(note.libraryID,d.key).id]:[]);
    },
    async move(config,d){
        if(config.scope.type==='pdf')throw Error('PDF notes retain their original PDF association');
        await this.validateDestination(d,config.library);
        const identity=AnnotaInfrastructure.notes.identity(config.library,config.scope);
        return AnnotaInfrastructure.notes.serialize(identity,async()=>{const lib=AnnotaData.resolveLibrary(config.library),note=await AnnotaData.annotation(lib.libraryID,config.noteKey);if(!note||note.deleted||!note.isNote?.())throw Error('Managed note unavailable');const backup=await AnnotaInfrastructure.backup('',{config,html:note.getNote(),parentID:note.parentID,collections:note.getCollections()},'before-note-move');await this.applyDestination(note,d);await note.saveTx();await AnnotaInfrastructure.notes.configure({...config,destination:d});return {key:note.key,backup};});
    }
};
