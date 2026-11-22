/* Relationship management over the existing recoverable state, query, jobs and notes. */
var AnnotaNetwork = {
    listeners:new Set(), limits:{nodes:160,edges:400,depth:3,evidence:24,context:30000,suggestions:24},
    clone(value){return AnnotaInfrastructure.clone(value);},
    libraryKey(library){return AnnotaData.libraryKey(library);},
    defaults(){return {version:1,revision:0,types:Object.fromEntries([
        ['supports','Supports','Supported by'],['contradicts','Contradicts','Contradicted by'],['extends','Extends','Extended by'],
        ['uses_method','Uses method from','Method used by'],['improves','Improves upon','Improved by'],['reviews','Reviews','Reviewed by'],['related','Related to','Related to']
    ].map(([id,label,inverse])=>[id,{id,label,inverse,direction:id==='related'?'symmetric':'directed',archived:false,revision:1}])),relationships:{},questions:{},topicFields:[],suggestions:{},batches:{}};},
    state(){return AnnotaInfrastructure.state.network||this.defaults();},
    identity(entity){this.validateEntity(entity);return JSON.stringify([AnnotaData.libraryKey(entity.library),entity.kind,entity.key]);},
    validateEntity(entity){
        if(!entity||!['publication','annotation'].includes(entity.kind)||!['user','group','local'].includes(entity.library?.type)||typeof entity.library.id!=='string'||!/^[A-Z0-9]{8}$/.test(entity.key||''))throw Error('Invalid Network entity identity');
    },
    validate(data){
        if(!data||data.version!==1||!Number.isInteger(data.revision)||data.revision<0)throw Error('Unsupported Network state');
        for(const key of ['types','relationships','questions','suggestions','batches'])if(!AnnotaInfrastructure.object(data[key]))throw Error('Invalid Network '+key);
        if(!Array.isArray(data.topicFields)||data.topicFields.some(id=>typeof id!=='string')||new Set(data.topicFields).size!==data.topicFields.length)throw Error('Invalid topic field configuration');
        for(const [id,type]of Object.entries(data.types))if(type.id!==id||!type.label?.trim()||type.label.length>150||typeof type.inverse!=='string'||!['directed','symmetric'].includes(type.direction)||typeof type.archived!=='boolean')throw Error('Invalid relationship type');
        const unique=new Set();
        for(const [id,rel]of Object.entries(data.relationships)){
            if(rel.id!==id||!data.types[rel.type]||!['directed','symmetric'].includes(rel.direction)||typeof rel.explanation!=='string'||rel.explanation.length>10000||!['manual','ai-assisted'].includes(rel.provenance?.kind)||!Number.isInteger(rel.revision)||typeof rel.createdAt!=='string'||typeof rel.updatedAt!=='string')throw Error('Invalid relationship');
            this.validateEntity(rel.source);this.validateEntity(rel.target);
            if(this.identity(rel.source)===this.identity(rel.target))throw Error('Self relationships are not allowed');
            if(AnnotaData.libraryKey(rel.source.library)!==AnnotaData.libraryKey(rel.target.library))throw Error('Relationships must remain within one library');
            if(!Array.isArray(rel.supporting)||rel.supporting.length>48)throw Error('Invalid supporting evidence');
            for(const ref of rel.supporting){this.validateEntity(ref);if(ref.kind!=='annotation'||AnnotaData.libraryKey(ref.library)!==AnnotaData.libraryKey(rel.source.library))throw Error('Invalid supporting annotation');}
            if(!rel.deletedAt){const key=this.relationKey(rel);if(unique.has(key))throw Error('Duplicate relationship');unique.add(key);}
        }
        for(const [id,q]of Object.entries(data.questions)){
            if(q.id!==id||!q.title?.trim()||q.title.length>500||typeof q.description!=='string'||q.description.length>10000||!['user','group','local'].includes(q.library?.type)||typeof q.library.id!=='string'||!Array.isArray(q.roles)||q.roles.some(r=>typeof r!=='string'||!r.trim()||r.length>150)||!Array.isArray(q.evidence)||!Number.isInteger(q.revision))throw Error('Invalid research question');
            const assigned=new Set();for(const link of q.evidence){this.validateEntity(link.entity);if(!q.roles.includes(link.role)||AnnotaData.libraryKey(q.library)!==AnnotaData.libraryKey(link.entity.library))throw Error('Invalid question evidence');const key=this.identity(link.entity);if(assigned.has(key))throw Error('Duplicate question evidence');assigned.add(key);}
        }
        for(const [id,s]of Object.entries(data.suggestions)){
            if(s.id!==id||!['pending','accepted','rejected'].includes(s.status)||!data.types[s.type]||typeof s.explanation!=='string'||s.explanation.length>10000||!Array.isArray(s.supporting)||!Array.isArray(s.allowed)||s.allowed.length>24||!s.jobID)throw Error('Invalid relationship suggestion');
            this.validateEntity(s.source);this.validateEntity(s.target);const allowed=new Set(s.allowed.map(e=>this.identity(e)));
            for(const e of [s.source,s.target,...s.supporting,...s.evidenceRefs||[]])if(!allowed.has(this.identity(e)))throw Error('Suggestion references evidence outside the approved scope');
            if(s.supporting.some(e=>e.kind!=='annotation')||!s.supporting.length&&!s.evidenceRefs?.length)throw Error('Suggestion requires supporting evidence');
        }
        return data;
    },
    relationKey(rel){let a=this.identity(rel.source),b=this.identity(rel.target);if(rel.direction==='symmetric'&&a>b)[a,b]=[b,a];return JSON.stringify([a,b,rel.type,rel.direction]);},
    fingerprint(library){const data=this.state(),key=AnnotaData.libraryKey(library)+':'+data.revision;this.fingerprintCache||=new Map();if(this.fingerprintCache.has(key))return this.fingerprintCache.get(key);
        const relationships=Object.values(data.relationships).filter(r=>AnnotaData.libraryKey(r.source.library)===AnnotaData.libraryKey(library)).sort((a,b)=>a.id.localeCompare(b.id)),questions=Object.values(data.questions).filter(q=>AnnotaData.libraryKey(q.library)===AnnotaData.libraryKey(library)).sort((a,b)=>a.id.localeCompare(b.id));
        const value=Annota.fieldFingerprint(JSON.stringify({relationships,questions,types:data.types,topicFields:data.topicFields}));this.fingerprintCache.set(key,value);if(this.fingerprintCache.size>10)this.fingerprintCache.delete(this.fingerprintCache.keys().next().value);return value;
    },
    guardNote(content,previous,config){const data=this.state();for(const id of previous?.networkRecords?.relationships||[])if(!data.relationships[id])throw Error('Network relationships are missing locally; preserve the note and restore complete research data');for(const id of previous?.networkRecords?.questions||[])if(!data.questions[id])throw Error('Research question data is missing locally; preserve the note');const marker=content.match(/networkfp=([a-f0-9]+)/);if(marker&&!previous?.content&&marker[1]!==this.fingerprint(config.library))throw Error('Network data is incomplete or differs from the existing note; restore the complete backup first');},
    async portableMapping(data,mapping,unmatched){
        const result=this.clone(data);
        for(const kind of ['relationships','questions','suggestions'])for(const [id,record]of Object.entries(result[kind])){
            const original=this.clone(record);let failed=false;
            const walk=async value=>{if(!value||typeof value!=='object')return;if(value.library&&Object.hasOwn(mapping,AnnotaData.libraryKey(value.library))){const library=AnnotaData.resolveLibrary(value.library,mapping);if(!library){failed=true;return;}value.library=AnnotaData.libraryIdentity(library);if(value.kind){const resolved=await this.resolve(value);if(resolved.status!=='available')failed=true;}}for(const [key,child]of Object.entries(value))if(key!=='library'){if(Array.isArray(child))for(const entry of child)await walk(entry);else await walk(child);}};
            await walk(record);if(failed){result[kind][id]=original;unmatched.push({key:'network/'+kind+'/'+id,reason:'Mapped reference unavailable; original Network identities retained for recovery'});}
        }
        return result;
    },
    async change(fn){
        if(AnnotaCardFields._maintenance)throw Error('Finish data maintenance before changing Network data');
        const result=await AnnotaInfrastructure.mutate(async state=>{state.network||=this.defaults();const value=await fn(state.network);state.network.revision++;this.validate(state.network);return value;});
        this.indexCache=null;for(const listener of this.listeners){try{listener();}catch(error){log(error);}}AnnotaResearchNotes.schedule();return result;
    },
    ref(item){return {kind:item.isAnnotation?.()?'annotation':'publication',library:AnnotaData.libraryIdentity(Zotero.Libraries.get(item.libraryID)),key:item.key};},
    async resolve(entity,{required=false}={}){
        this.validateEntity(entity);const library=AnnotaData.resolveLibrary(entity.library);
        if(!library){if(required)throw Error('Source library is temporarily unavailable');return {entity,status:'unavailable',label:entity.key};}
        const item=await AnnotaData.annotation(library.libraryID,entity.key);
        const status=!item?'unavailable':item.deleted?'deleted':entity.kind==='annotation'&&!item.isAnnotation?.()||entity.kind==='publication'&&!item.isRegularItem?.()?'invalid':'available';
        if(required&&status!=='available')throw Error('Source '+entity.key+' is '+status);
        return {entity,item,status,label:item?(entity.kind==='annotation'?(item.annotationText||item.annotationComment||'Annotation').slice(0,220):item.getDisplayTitle?.()||item.getField?.('title')||item.key):entity.key};
    },
    async writable(entity){const resolved=await this.resolve(entity,{required:true}),library=AnnotaData.resolveLibrary(entity.library);if(library.editable===false)throw Error('Library is read-only');return resolved;},
    checkRevision(previous,expected){if(previous&&expected!==undefined&&previous.revision!==expected)throw Error('Network data changed. Reload before saving.');},
    async saveType(input){return this.change(data=>{const old=input.id?data.types[input.id]:null;if(input.id&&!old)throw Error('Relationship type unavailable');if(old&&Object.values(data.relationships).some(r=>!r.deletedAt&&r.type===old.id)&&old.direction!==(input.direction||old.direction))throw Error('Used types retain their directionality; create a new type for changed semantics');if(old)this.checkRevision({revision:old.revision||0},input.revision);const id=old?.id||Annota.newFieldID('relation_type');data.types[id]={id,revision:(old?.revision||0)+1,label:String(input.label||'').trim(),inverse:String(input.inverse||input.label||'').trim(),direction:input.direction||old?.direction||'directed',archived:input.archived===undefined?!!old?.archived:!!input.archived};return this.clone(data.types[id]);});},
    async saveRelationship(input,{expectedRevision}={}){
        for(const entity of [input.source,input.target,...input.supporting||[]])await this.writable(entity);
        return this.change(data=>{
            const old=input.id?data.relationships[input.id]:null;if(input.id&&(!old||old.deletedAt))throw Error('Relationship unavailable');this.checkRevision(old,expectedRevision);
            const type=data.types[input.type];if(!type||type.archived&&old?.type!==type.id)throw Error('Choose an active relationship type');
            const now=new Date().toISOString(),id=old?.id||Annota.newFieldID('relation');
            const rel={id,source:this.clone(input.source),target:this.clone(input.target),type:type.id,direction:old?.type===type.id?old.direction:type.direction,explanation:String(input.explanation||'').trim(),supporting:this.clone(input.supporting||[]),createdAt:old?.createdAt||now,updatedAt:now,revision:(old?.revision||0)+1,provenance:old?.provenance||{kind:'manual'}};
            data.relationships[id]=rel;return this.clone(rel);
        });
    },
    async deleteRelationship(id,expectedRevision){return this.change(data=>{const rel=data.relationships[id];if(!rel||rel.deletedAt)throw Error('Relationship unavailable');this.checkRevision(rel,expectedRevision);rel.deletedAt=rel.updatedAt=new Date().toISOString();rel.revision++;});},
    index(){const data=this.state();if(this.indexCache?.revision===data.revision)return this.indexCache;const entities=new Map(),types=new Map();
        const put=(map,key,id)=>{if(!map.has(key))map.set(key,new Set());map.get(key).add(id);};
        for(const rel of Object.values(data.relationships))if(!rel.deletedAt){put(entities,this.identity(rel.source),rel.id);put(entities,this.identity(rel.target),rel.id);put(types,rel.type,rel.id);}
        return this.indexCache={revision:data.revision,entities,types};
    },
    relationships(entity,{type,offset=0,limit=60}={}){
        const ids=[...(this.index().entities.get(this.identity(entity))||[])],data=this.state(),key=this.identity(entity);
        const records=ids.map(id=>data.relationships[id]).filter(rel=>!type||rel.type===type).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
        return {total:records.length,records:records.slice(offset,offset+Math.min(200,limit)).map(rel=>{const outgoing=this.identity(rel.source)===key;return {...this.clone(rel),other:outgoing?rel.target:rel.source,orientation:rel.direction==='symmetric'?'symmetric':outgoing?'outgoing':'incoming',displayType:rel.direction==='symmetric'||outgoing?data.types[rel.type].label:data.types[rel.type].inverse};})};
    },
    async search(scope,text='',{offset=0,limit=40,kind='all'}={}){
        const query=AnnotaExplorer.defaults(scope);query.text=String(text).slice(0,1000);const rows=kind==='publication'?[]:(await AnnotaExplorer.query(query,{offset,limit})).rows;
        const result=rows.map(row=>({entity:{kind:'annotation',...row.identity},label:row.text||row.type,status:'available',publication:row.title}));
        if(kind!=='annotation'){
            const library=AnnotaData.resolveLibrary(scope.library);if(!library)throw Error('Library unavailable');const search=new Zotero.Search();search.libraryID=library.libraryID;
            search.addCondition('itemType','isNot','attachment');search.addCondition('itemType','isNot','note');search.addCondition('itemType','isNot','annotation');if(text.trim())search.addCondition('title','contains',text.trim());
            if(scope.kind==='collection')search.addCondition('collection','is',scope.key);
            const ids=await search.search();for(const item of await Zotero.Items.getAsync(ids.slice(offset,offset+limit))){if(!item?.isRegularItem?.()||item.deleted||scope.kind==='publications'&&!scope.keys.includes(item.key))continue;result.push({entity:this.ref(item),label:item.getDisplayTitle?.()||item.getField?.('title')||item.key,status:'available'});}
        }
        return result.slice(0,limit*2);
    },
    fields(){return AnnotaExplorer.fields().filter(field=>['select','multiselect'].includes(field.type));},
    async designateTopics(ids){if(ids.some(id=>!this.fields().some(f=>f.id===id)&&!this.state().topicFields.includes(id)))throw Error('Choose existing categorical fields');return this.change(data=>{data.topicFields=[...new Set(ids)];});},
    async topics(scope){
        const key=JSON.stringify([scope,this.state().topicFields,AnnotaExplorer.revision]);if(this.topicCache?.key===key)return this.topicCache.topics;
        const data=await AnnotaExplorer.dataset(scope),fields=new Map(this.fields().filter(f=>this.state().topicFields.includes(f.id)).map(f=>[f.id,f])),topics=new Map();
        for(let i=0;i<data.rows.length;i++){if(i%100===0)await AnnotaResearchNotes.yield();const row=data.rows[i];for(const [id,field]of fields){const raw=row.fields[id]?.value;if(!raw||Array.isArray(raw)&&!raw.length)continue;
            const values=field.type==='multiselect'?(Array.isArray(raw)?raw:[]):Annota.categoryIDs(field,[String(raw)]);
            for(const valueID of values){const topicKey=id+':'+valueID;if(!topics.has(topicKey))topics.set(topicKey,{kind:'topic',library:scope.library,key:topicKey,fieldID:id,valueID,label:Annota.categoryLabels(field,[valueID])[0]||valueID,fieldLabel:field.label,annotations:[],publications:new Map()});const topic=topics.get(topicKey);topic.annotations.push({kind:'annotation',...row.identity});topic.publications.set(row.publication,{kind:'publication',library:scope.library,key:row.publication});}
        }}
        const result=[...topics.values()].map(t=>({...t,publications:[...t.publications.values()]}));this.topicCache={key:JSON.stringify([scope,this.state().topicFields,AnnotaExplorer.revision]),topics:result};return result;
    },
    defaultRoles:['Supporting evidence','Contradictory evidence','Background','Methodology','Limitations','Potential solutions','Unanswered questions'],
    async saveQuestion(input,{expectedRevision}={}){return this.change(data=>{const old=input.id?data.questions[input.id]:null;if(input.id&&(!old||old.deletedAt))throw Error('Question unavailable');this.checkRevision(old,expectedRevision);if(!AnnotaData.resolveLibrary(input.library))throw Error('Library unavailable');const id=old?.id||Annota.newFieldID('question'),now=new Date().toISOString();data.questions[id]={id,library:this.clone(input.library),title:String(input.title||'').trim(),description:String(input.description||''),roles:[...new Set(input.roles||old?.roles||this.defaultRoles)],evidence:old?.evidence||[],createdAt:old?.createdAt||now,updatedAt:now,revision:(old?.revision||0)+1};return this.clone(data.questions[id]);});},
    async assignEvidence(questionID,entity,role,{remove=false,expectedRevision}={}){if(!remove)await this.writable(entity);return this.change(data=>{const q=data.questions[questionID];if(!q||q.deletedAt)throw Error('Question unavailable');this.checkRevision(q,expectedRevision);q.evidence=q.evidence.filter(link=>this.identity(link.entity)!==this.identity(entity));if(!remove)q.evidence.push({entity:this.clone(entity),role});q.revision++;q.updatedAt=new Date().toISOString();});},
    async deleteQuestion(id,expectedRevision){return this.change(data=>{const q=data.questions[id];if(!q)throw Error('Question unavailable');this.checkRevision(q,expectedRevision);q.deletedAt=q.updatedAt=new Date().toISOString();q.revision++;});},
    async graph(root,scope,{depth=1,type='',nodeTypes=['publication','annotation','topic'],maxNodes=80}={}){
        const started=Date.now(),limit=Math.max(1,Math.min(this.limits.nodes,maxNodes)),nodes=new Map(),edges=new Map(),queue=[];let truncated=false;
        const key=e=>e.kind==='topic'?JSON.stringify([AnnotaData.libraryKey(e.library),'topic',e.key]):this.identity(e);
        const add=(e,d)=>{if(AnnotaData.libraryKey(e.library)!==AnnotaData.libraryKey(scope.library))return false;const id=key(e);if(nodes.has(id))return true;if(nodes.size>=limit){truncated=true;return false;}const ref=e.kind==='topic'?{kind:e.kind,library:e.library,key:e.key,label:e.label}:e;nodes.set(id,{id,entity:ref,label:e.label||e.key});queue.push([ref,d]);return true;};
        let allowed=null;if(['collection','publications','attachments'].includes(scope.kind)){const data=await AnnotaExplorer.dataset(scope);allowed=new Set(data.rows.flatMap(r=>[this.identity({kind:'annotation',...r.identity}),this.identity({kind:'publication',library:scope.library,key:r.publication})]));}
        if(allowed&&scope.kind==='publications')for(const key of scope.keys)allowed.add(this.identity({kind:'publication',library:scope.library,key}));
        if(allowed&&scope.kind==='collection'){const library=AnnotaData.resolveLibrary(scope.library),collection=Zotero.Collections.getByLibraryAndKey(library.libraryID,scope.key);for(const id of collection?.getChildItems?.()||[]){const item=await Zotero.Items.getAsync(id);if(item?.isRegularItem?.()&&!item.deleted)allowed.add(this.identity(this.ref(item)));}}
        const connect=(a,b,id,label,directed,membership,d)=>{if(allowed&&!membership&&(!allowed.has(key(a))||!allowed.has(key(b))))return;if(!add(a,d)||!add(b,d))return;if(edges.size>=this.limits.edges){truncated=true;return;}edges.set(id,{id,source:key(a),target:key(b),label,directed,membership});};
        add(root,0);const topicList=this.state().topicFields.length?await this.topics(scope):[];
        while(queue.length){const [entity,d]=queue.shift();if(d>=Math.min(this.limits.depth,Math.max(0,depth)))continue;
            if(entity.kind==='topic'){const topic=topicList.find(t=>t.key===entity.key);if(topic)for(const member of [...topic.annotations,...topic.publications])connect(entity,member,'membership:'+key(entity)+key(member),'Topic membership',false,true,d+1);}
            else{
                for(const rel of this.relationships(entity,{type,limit:200}).records)connect(rel.source,rel.target,rel.id,this.state().types[rel.type].label,rel.direction==='directed',false,d+1);
                if(!type)for(const topic of topicList)if([...topic.annotations,...topic.publications].some(member=>key(member)===key(entity)))connect(topic,entity,'membership:'+key(topic)+key(entity),'Topic membership',false,true,d+1);
            }
        }
        for(const node of nodes.values())if(node.entity.kind!=='topic'){const value=await this.resolve(node.entity);node.label=value.label;node.status=value.status;}
        const visible=[...nodes.values()].filter(n=>nodeTypes.includes(n.entity.kind)),shown=new Set(visible.map(n=>n.id));
        return {nodes:visible,edges:[...edges.values()].filter(e=>shown.has(e.source)&&shown.has(e.target)),truncated,milliseconds:Date.now()-started};
    },
    async evidence(filter,scope){
        let refs=[];if(filter.questionID){const q=this.state().questions[filter.questionID];if(!q||q.deletedAt)throw Error('Research question unavailable');refs=q.evidence.map(e=>e.entity);}
        else if(filter.topicKey){const topic=(await this.topics(scope)).find(t=>t.key===filter.topicKey);if(!topic)throw Error('Topic has no available evidence');refs=topic.annotations;}
        else{this.validateEntity(filter.entity);const list=this.relationships(filter.entity,{type:filter.relationshipType,limit:200});if(list.total>200)throw Error('Note scope exceeds 200 relationships; narrow the relationship type filter');refs=[filter.entity,...list.records.flatMap(r=>[r.other,...r.supporting])];}
        const items=new Map(),publications=new Set(),pdfs=new Map();
        for(const ref of refs){const {item}=await this.resolve(ref,{required:true});if(ref.kind==='annotation')items.set(this.identity(ref),item);else{publications.add(item.key);for(const id of item.getAttachments?.()||[]){const attachment=await Zotero.Items.getAsync(id);if(attachment?.isPDFAttachment?.()){pdfs.set(attachment.key,attachment);for(const annID of attachment.getAnnotations?.()||[]){const ann=typeof annID==='object'?annID:await Zotero.Items.getAsync(annID);if(ann?.isAnnotation?.()&&!ann.deleted)items.set(this.identity(this.ref(ann)),ann);}}}}}
        for(const item of items.values()){const pdf=await Zotero.Items.getAsync(item.parentID);if(pdf){pdfs.set(pdf.key,pdf);publications.add(pdf.parentID||pdf.key);}}
        if(items.size>5000)throw Error('Narrow this evidence scope to at most 5000 annotations');
        return {annotations:[...items.values()],pdfs:[...pdfs.values()],publications:publications.size};
    },
    async supplement(compiled,config){
        const filter=config.filter,escape=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        let relationships=[],question;
        if(filter.entity)relationships=this.relationships(filter.entity,{type:filter.relationshipType,limit:200}).records;
        else{const data=await this.evidence(filter,config.sourceScope),ids=new Set(),refs=[...data.annotations.map(item=>this.ref(item)),...(filter.questionID?this.state().questions[filter.questionID].evidence.map(e=>e.entity):[])];for(const pdf of data.pdfs){const parent=pdf.parentID?await Zotero.Items.getAsync(pdf.parentID):null;if(parent?.isRegularItem?.())refs.push(this.ref(parent));}for(const ref of refs){const list=this.relationships(ref,{type:filter.relationshipType,limit:200});if(list.total>200)throw Error('Evidence has more than 200 relationships; narrow the note selector');for(const rel of list.records)if(!ids.has(rel.id)){ids.add(rel.id);relationships.push(rel);if(relationships.length>500)throw Error('Narrow the note scope to at most 500 relationships');}}}
        if(filter.questionID)question=this.state().questions[filter.questionID];
        if(relationships.length>500)throw Error('Note scope exceeds 500 relationships; choose a narrower topic or question');
        const blocks=[];const append=(id,html)=>{html=html.replace(/<h[23]>([\s\S]*?)<\/h[23]>/,'<h2><a href="zotero://select/library?researchannotator-entry='+encodeURIComponent(id)+'">$1</a></h2>');const block='<div data-ra-entry="'+escape(id)+'">'+html+'</div>';blocks.push(block);compiled.generated[id]=block;};
        for(const rel of relationships){const a=await this.resolve(rel.source),b=await this.resolve(rel.target);append('relationship:'+rel.id,'<h2>'+escape(this.state().types[rel.type].label)+'</h2><p>'+escape(a.label)+' → '+escape(b.label)+'</p><p><strong>User-authored relationship explanation'+(rel.provenance.kind==='ai-assisted'?' (accepted AI assessment)':'')+':</strong> '+escape(rel.explanation)+'</p>');}
        if(question){append('question:'+question.id,'<h2>Research question: '+escape(question.title)+'</h2><p>'+escape(question.description)+'</p>');for(const link of question.evidence){const resolved=await this.resolve(link.entity);append('question-evidence:'+question.id+':'+link.entity.key,'<h3>'+escape(link.role)+'</h3><p><a href="'+escape(await this.sourceLink(link.entity))+'">'+escape(resolved.label)+'</a></p>');}}
        compiled.networkRecords={relationships:relationships.map(r=>r.id),questions:question?[question.id]:[]};compiled.html=[compiled.html,...blocks].filter(Boolean).join('\n<hr>\n');return compiled;
    },
    async previewDiscovery(refs){
        const unique=new Map(refs.map(e=>[this.identity(e),e]));if(unique.size<2||unique.size>this.limits.evidence)throw Error('Choose 2–24 evidence entities');const evidence=[];let length=0,library;
        for(const entity of unique.values()){const resolved=await this.resolve(entity,{required:true});library||=AnnotaData.libraryKey(entity.library);if(library!==AnnotaData.libraryKey(entity.library))throw Error('Discovery stays within one library');
            const abstract=entity.kind==='publication'?resolved.item.getField?.('abstractNote')||'':'',raw=String(entity.kind==='annotation'?resolved.item.annotationText||resolved.item.annotationComment:resolved.label+'\n'+abstract),text=raw.slice(0,1200);length+=text.length;
            evidence.push({id:'E'+(evidence.length+1),entity:this.clone(entity),label:resolved.label,text,truncated:raw.length>1200,basis:entity.kind==='annotation'?'Original annotation':abstract?'Publication title and abstract':'Publication title only; no abstract supplied'});}
        const types=Object.values(this.state().types).filter(t=>!t.archived).map(t=>({id:t.id,label:t.label,direction:t.direction}));if(types.length>50)throw Error('Discovery supports at most 50 active relationship types');length=JSON.stringify({types,evidence}).length;if(length>this.limits.context)throw Error('Evidence context exceeds the safe limit');
        return {evidence,types,characters:length,estimatedTokens:Math.ceil(length/4),requests:1,maxSuggestions:this.limits.suggestions};
    },
    async expandDiscovery(refs){const selected=new Map(refs.map(e=>[this.identity(e),e]));for(const entity of refs){if(selected.size>=24)break;if(entity.kind!=='publication')continue;const {item}=await this.resolve(entity,{required:true});for(const id of item.getAttachments?.()||[]){const pdf=await Zotero.Items.getAsync(id);if(!pdf?.isPDFAttachment?.()||pdf.deleted)continue;for(const entry of pdf.getAnnotations?.()||[]){const ann=typeof entry==='object'?entry:await Zotero.Items.getAsync(entry);if(ann?.isAnnotation?.()&&!ann.deleted){const ref=this.ref(ann);selected.set(this.identity(ref),ref);}if(selected.size>=24)break;}if(selected.size>=24)break;}}return [...selected.values()].slice(0,24);},
    async discover(refs,{expectedPreview}={}){const preview=await this.previewDiscovery(refs);if(expectedPreview&&JSON.stringify({evidence:expectedPreview.evidence,types:expectedPreview.types})!==JSON.stringify({evidence:preview.evidence,types:preview.types}))throw Error('Evidence changed; preview scope again');const id=await AnnotaInfrastructure.jobs.enqueue('network-suggestions',{preview},{dedupe:'network-discovery:'+Annota.fieldFingerprint(JSON.stringify(preview.evidence)),paid:true});if(AnnotaInfrastructure.state.jobs[id].state==='failed')await AnnotaInfrastructure.jobs.resume(id,{acknowledgePaid:true});return id;},
    validateSuggestions(raw,preview){
        const values=Array.isArray(raw)?raw:raw?.suggestions;if(!Array.isArray(values)||values.length>this.limits.suggestions)throw Error('Invalid AI suggestion response');const entities=new Map(preview.evidence.map(e=>[e.id,e.entity]));
        return values.map(s=>{if(!s||!entities.has(s.source)||!entities.has(s.target)||s.source===s.target||!this.state().types[s.type]||this.state().types[s.type].archived||typeof s.explanation!=='string'||!s.explanation.trim()||s.explanation.length>10000||!Array.isArray(s.supporting)||!s.supporting.length||s.supporting.some(id=>!entities.has(id)))throw Error('AI invented or omitted a required evidence reference/type');const evidenceRefs=[...new Set(s.supporting)].map(id=>entities.get(id));return {source:entities.get(s.source),target:entities.get(s.target),type:s.type,explanation:s.explanation,evidenceRefs,supporting:evidenceRefs.filter(e=>e.kind==='annotation')};});
    },
    async runDiscovery(payload,control,job){
        if(this.state().batches[job.id]){await control.progress(1);return;}
        const preview=await this.previewDiscovery(payload.preview.evidence.map(e=>e.entity));if(JSON.stringify({evidence:preview.evidence,types:preview.types})!==JSON.stringify({evidence:payload.preview.evidence,types:payload.preview.types}))throw Error('Evidence changed after preview; review and submit a new scope');control.check();
        const types=preview.types;
        const provider=String(getPref('provider','')),model=String(getPref('model',''));
        const reply=await Annota.complete({system:'Suggest scientific relationships only from the supplied evidence. These are unverified AI assessments for human approval. Return JSON {"suggestions":[{"source":"E1","target":"E2","type":"supports","explanation":"...","supporting":["E1"]}]}. Use only supplied entity IDs and type IDs. Supporting references must identify supplied evidence. Publication-only metadata does not establish experimental conclusions; do not infer agreement from titles alone. No confidence scores. At most 24 suggestions.',user:JSON.stringify({types,evidence:preview.evidence})},{raw:true,json:true,safeRetry:true});
        control.check();if(reply.length>150000)throw Error('AI response exceeds limit');const values=this.validateSuggestions(JSON.parse(reply.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')),preview);
        await this.change(data=>{if(data.batches[job.id])return;values.forEach((s,i)=>{const id=job.id+'_'+i;data.suggestions[id]={...s,id,jobID:job.id,status:'pending',allowed:preview.evidence.map(e=>e.entity),createdAt:new Date().toISOString(),provider,model};});data.batches[job.id]={saved:true,count:values.length};});await control.progress(1,{savedSuggestions:true});
    },
    async reviewSuggestion(id,decision,edit={}){
        const saved=this.state().suggestions[id];if(!saved||saved.status!=='pending')throw Error('Suggestion already reviewed');const proposal={...this.clone(saved),...edit};
        if(decision==='accept')for(const entity of [proposal.source,proposal.target,...proposal.supporting,...proposal.evidenceRefs||[]])await this.writable(entity);
        return this.change(data=>{const s=data.suggestions[id];if(s.status!=='pending')throw Error('Suggestion already reviewed');if(decision==='reject'){s.status='rejected';s.reviewedAt=new Date().toISOString();return;}
            if(decision!=='accept')throw Error('Choose Accept or Reject');if(!proposal.supporting.length&&!proposal.evidenceRefs?.length)throw Error('Choose at least one supplied supporting reference');const allowed=new Set(s.allowed.map(e=>this.identity(e)));for(const entity of [proposal.source,proposal.target,...proposal.supporting,...proposal.evidenceRefs||[]])if(!allowed.has(this.identity(entity)))throw Error('Accepted evidence must remain within the supplied scope');
            const type=data.types[proposal.type];if(!type||type.archived)throw Error('Choose active type');const now=new Date().toISOString(),relationshipID='accepted_'+id;
            const relationship={id:relationshipID,source:proposal.source,target:proposal.target,type:type.id,direction:type.direction,explanation:proposal.explanation,supporting:proposal.supporting,createdAt:now,updatedAt:now,revision:1,provenance:{kind:'ai-assisted',suggestionID:id,jobID:s.jobID,provider:s.provider,model:s.model,supportingEvidence:proposal.evidenceRefs||proposal.supporting}};
            data.relationships[relationshipID]=relationship;s.status='accepted';s.relationshipID=relationshipID;s.reviewedAt=now;return relationshipID;
        });
    },
    async sourceLink(entity){const {item}=await this.resolve(entity,{required:true}),library=AnnotaData.resolveLibrary(entity.library),path=library.libraryType==='group'?'groups/'+(library.libraryTypeID||library.groupID):'library';if(entity.kind==='publication')return 'zotero://select/'+path+'/items/'+entity.key;const pdf=await Zotero.Items.getAsync(item.parentID);return 'zotero://open-pdf/'+path+'/items/'+pdf.key+'?annotation='+item.key;},
    async navigate(main,entity){const {item}=await this.resolve(entity,{required:true});if(entity.kind==='annotation')return AnnotaExplorer.navigate(main,{library:entity.library,key:entity.key});return main.ZoteroPane.selectItem(item.id);},
    async openNotes(main,scope,selector){const filter={type:'network',...selector},config=AnnotaResearchNotes.configuration(scope,filter,{}),win=await AnnotaWorkspace.open(main,'notes');await win.workspaceHost.request('notes',{network:{scope,filter,config}});return win;},
    associatedNotes(selector){return AnnotaResearchNotes.configs().filter(c=>c.noteKey&&c.filter?.type==='network'&&(selector.topicKey?c.filter.topicKey===selector.topicKey:selector.questionID?c.filter.questionID===selector.questionID:selector.entity&&c.filter.entity&&this.identity(selector.entity)===this.identity(c.filter.entity)));},
    async notesForTopic(topic,scope){const data=await this.evidence({topicKey:topic.key},scope),pdfs=new Set(data.pdfs.map(p=>p.key));return AnnotaResearchNotes.configs().filter(c=>c.noteKey&&AnnotaData.libraryKey(c.library)===AnnotaData.libraryKey(scope.library)&&(c.scope.type==='pdf'&&pdfs.has(c.scope.key)||c.filter?.type==='network'&&c.filter.topicKey===topic.key));},
    async openSelection(main,refs=this.selected(main)){const win=await AnnotaWorkspace.open(main,'network');await win.workspaceHost.request('network',{network:{entity:refs[0],target:refs[1],evidence:refs}});return win;},
    restored(){this.indexCache=this.topicCache=null;this.fingerprintCache?.clear();for(const listener of this.listeners)listener();},
    open(main,entity){return AnnotaWorkspace.open(main,'network').then(async win=>{if(entity)await win.workspaceHost.request('network',{network:{entity}});return win;});},
    selected(main){return main.ZoteroPane.getSelectedItems().filter(i=>i.isAnnotation?.()||i.isRegularItem?.()).map(i=>this.ref(i)).slice(0,24);},
    install(){Annota.network=this;AnnotaInfrastructure.jobs.register('network-suggestions',(payload,control,job)=>this.runDiscovery(payload,control,job),{paid:true});this.explorerListener=()=>{this.topicCache=null;for(const listener of this.listeners)listener();};AnnotaExplorer.listeners.add(this.explorerListener);},
    stop(){if(this.explorerListener)AnnotaExplorer.listeners.delete(this.explorerListener);this.listeners.clear();this.indexCache=this.topicCache=null;this.fingerprintCache?.clear();}
};
