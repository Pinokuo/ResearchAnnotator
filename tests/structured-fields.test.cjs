const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const clone = value => JSON.parse(JSON.stringify(value));
const schema = 'manual | Manual | text\ncheck | Verified | check\nchoice | Choice | select | A,B\nsummary | Summary | ai | Summarize';

function reconciliationEntry(key,text=key){return '<div data-ra-entry="1:'+key+'"><h2><a href="zotero://open-pdf/library/items/PDFKEY01?annotation='+key+'">'+text+'</a></h2><p><strong>Summary:</strong> Evidence '+key+'</p></div>';}

test('annotation reconciliation leaves trailing user prose before consecutively added highlights',async()=>{
    const h=await infrastructureSetup(),a=reconciliationEntry('A'),b=reconciliationEntry('B'),c=reconciliationEntry('C'),d=reconciliationEntry('D');
    let content='<h1>Research</h1>'+a+b+'<p>User-authored paragraph</p>',old={'1:A':a,'1:B':b};
    content=h.infra.notes.replaceManaged(content,a+b+c,{generated:old});
    assert.ok(content.indexOf('annotation=B')<content.indexOf('User-authored paragraph'));assert.ok(content.indexOf('User-authored paragraph')<content.indexOf('annotation=C'));
    old={...old,'1:C':c};content=h.infra.notes.replaceManaged(content,a+b+c+d,{generated:old});
    assert.ok(content.indexOf('User-authored paragraph')<content.indexOf('annotation=C'));assert.ok(content.indexOf('annotation=C')<content.indexOf('annotation=D'));
});

test('normalized annotation reconciliation retains headings lists tables and ordinary quotes between entries',async()=>{
    const h=await infrastructureSetup(),a=reconciliationEntry('A'),b=reconciliationEntry('B'),c=reconciliationEntry('C');
    const user='<h3>My heading</h3><ul><li>My list item</li></ul><blockquote><p>My quotation</p></blockquote><table><tbody><tr><td>My table evidence</td></tr></tbody></table>';
    const content=zoteroNormalizeManagedHTML(a+user+b);
    const result=h.infra.notes.replaceManaged(content,a+c+b,{generated:{'1:A':a,'1:B':b}});
    for(const text of ['My heading','My list item','My quotation','My table evidence']){assert.ok(result.indexOf('annotation=A')<result.indexOf(text));assert.ok(result.indexOf(text)<result.indexOf('annotation=C'));assert.equal((result.match(new RegExp(text,'g'))||[]).length,1);}
});

test('annotation reconciliation updates existing entries without relocating adjacent authored blocks',async()=>{
    const h=await infrastructureSetup(),a=reconciliationEntry('A'),b=reconciliationEntry('B'),updated=reconciliationEntry('A','Updated A');
    const result=h.infra.notes.replaceManaged(a+'<p>Between A and B</p>'+b,updated+b,{generated:{'1:A':a,'1:B':b}});
    assert.match(result,/Updated A/);assert.ok(result.indexOf('Updated A')<result.indexOf('Between A and B'));assert.ok(result.indexOf('Between A and B')<result.indexOf('annotation=B'));
});

test('deleted neighbors pass user blocks to preceding surviving entry or introduction',async()=>{
    const h=await infrastructureSetup(),a=reconciliationEntry('A'),b=reconciliationEntry('B'),c=reconciliationEntry('C');
    const content=a+'<p>After A</p>'+b+'<p>After B</p>'+c+'<p>After C</p>',previous={generated:{'1:A':a,'1:B':b,'1:C':c}};
    const result=h.infra.notes.replaceManaged(content,a+c,previous);
    assert.ok(result.indexOf('After A')<result.indexOf('After B'));assert.ok(result.indexOf('After B')<result.indexOf('annotation=C'));assert.doesNotMatch(result,/annotation=B/);
    const firstDeleted=h.infra.notes.replaceManaged(content,b+c,previous);assert.ok(firstDeleted.indexOf('After A')<firstDeleted.indexOf('annotation=B'));
    const allDeleted=h.infra.notes.replaceManaged(content,'',previous);assert.match(allDeleted,/After A/);assert.match(allDeleted,/After B/);assert.match(allDeleted,/After C/);assert.doesNotMatch(allDeleted,/annotation=/);
});

test('sort and group changes move generated entries with their attached user tails',async()=>{
    const h=await infrastructureSetup(),a=reconciliationEntry('A'),b=reconciliationEntry('B');
    const result=h.infra.notes.replaceManaged(a+'<p>Thought after A</p>'+b+'<p>Thought after B</p>',b+a,{generated:{'1:A':a,'1:B':b}});
    assert.ok(result.indexOf('annotation=B')<result.indexOf('Thought after B'));assert.ok(result.indexOf('Thought after B')<result.indexOf('annotation=A'));assert.ok(result.indexOf('annotation=A')<result.indexOf('Thought after A'));
});

test('removing publication grouping preserves user content associated with its managed heading',async()=>{
    const h=await infrastructureSetup(),a=reconciliationEntry('A'),b=reconciliationEntry('B');
    const group='<div data-ra-entry="publication:PAPER"><h2><a href="zotero://open-pdf/library/items/PDFKEY01?annotation=A">Publication title</a></h2></div>';
    const content=group+'<p>My publication preface</p>'+a+'<p>After A</p>'+b;
    const result=h.infra.notes.replaceManaged(content,a+b,{generated:{'publication:PAPER':group,'1:A':a,'1:B':b}});
    assert.doesNotMatch(result,/Publication title/);assert.ok(result.indexOf('My publication preface')<result.indexOf('annotation=A'));assert.ok(result.indexOf('After A')<result.indexOf('annotation=B'));
});

test('real PDF compiler preserves authored positioning through additions normalization and restart',async()=>{
    const h=await researchSetup();h.note.saveTx=async()=>h.setHTML(zoteroNormalizeManagedHTML(h.html()));await h.a._syncPaperResearchNote(h.item);
    h.setHTML(h.html()+'<p>After existing highlight</p>');const item={...h.item,id:17,key:'NEWANN01',annotationText:'Later highlight',annotationPosition:JSON.stringify({pageIndex:1,rects:[]})};h.items.set(17,item);h.parent.getAnnotations=()=>[7,17];
    await h.a._syncPaperResearchNote(h.item);assert.ok(h.html().indexOf('After existing highlight')<h.html().indexOf('Later highlight'));
    const initial=h.html(),state=clone(h.infra.state);h.infra.state=null;h.files.set(h.infra.path('infrastructure'),state);await h.infra.loadState();
    for(let i=0;i<100;i++)await h.a._syncPaperResearchNote(h.item);assert.equal(h.html(),initial);
});

test('raw native-style HTML keeps separator whitespace byte-stable around positioned user blocks',async()=>{
    const h=await infrastructureSetup(),a=reconciliationEntry('A'),b=reconciliationEntry('B'),c=reconciliationEntry('C'),previous={generated:{'1:A':a,'1:B':b}};
    let content=h.infra.notes.replaceManaged(a+'\n<hr>\n'+b+'\n<p>User block</p>\n',a+b+c,previous);
    const first=content,complete={generated:{'1:A':a,'1:B':b,'1:C':c}};
    for(let i=0;i<100;i++)content=h.infra.notes.replaceManaged(content,a+b+c,complete);
    assert.equal(content,first);assert.ok(content.indexOf('User block')<content.indexOf('annotation=C'));
});

test('annotation review finds partially unfilled manual/AI schemas independently of native Comment',async()=>{
    const h=await infrastructureSetup(),cfg=h.c.entryFor(h.a.keyForItem(h.item));h.item.annotationComment='Native text is not completion';
    await h.c.saveValues(h.item,{manual:'Completed manual'});assert.equal(h.review.isEmpty(h.item,cfg),true);
    await h.c.saveValues(h.item,{check:'',choice:'A',summary:'Saved AI'});assert.equal(h.review.isEmpty(h.item,cfg),false);h.item.annotationComment='';assert.equal(h.review.isEmpty(h.item,cfg),false);
});

test('annotation review distinguishes missing failed outdated and completed AI values without erasing successes',async()=>{
    const h=await infrastructureSetup(),cfg=h.c.entryFor(h.a.keyForItem(h.item)),field=cfg.schema.find(f=>f.type==='ai');
    assert.equal(h.review.fieldStates(h.item,cfg).find(f=>f.id===field.id).state,'missing');await h.c.saveValues(h.item,{summary:'Existing success'});
    await h.c.saveMetadata(h.item,field,{state:'failed'});assert.equal(h.review.fieldStates(h.item,cfg).find(f=>f.id===field.id).state,'failed');
    await h.c.saveMetadata(h.item,field,{state:'completed',promptFingerprint:'old'});assert.equal(h.review.fieldStates(h.item,cfg).find(f=>f.id===field.id).state,'outdated');assert.equal(h.c.get(h.item).values.summary,'Existing success');
});

async function workspaceSetup(){
    const h=await explorerSetup();vm.runInContext(fs.readFileSync(path.join(__dirname,'..','research-workspace.js'),'utf8'),h.context);h.a.rootURI='file:///test/';
    const workspace=h.context.AnnotaWorkspace,doc=document();doc.documentElement=doc.createElement('root');
    const create=doc.createElement;doc.createElement=tag=>{const el=create(tag);el.remove=function(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.isConnected=false;};return el;};doc.createXULElement=doc.createElement;doc.createElementNS=(_,tag)=>doc.createElement(tag);
    const toolbar=doc.createElement('toolbar'),tools=doc.createElement('menupopup'),chat=doc.createElement('toolbarbutton'),sync=doc.createElement('toolbarbutton');toolbar.id='zotero-tabs-toolbar';tools.id='menu_ToolsPopup';chat.id='annota-tb-chat';sync.id='zotero-tb-sync';toolbar.append(chat,sync);doc.documentElement.append(toolbar,tools);
    toolbar.insertBefore=function(node,anchor){if(node.parentNode)node.remove();const index=this.children.indexOf(anchor);node.isConnected=true;node.parentNode=this;this.children.splice(index<0?this.children.length:index,0,node);};
    doc.getElementById=id=>doc.created.find(el=>el.id===id&&el.isConnected&&el.parentNode)||null;
    const calls=[],main={document:doc,openDialog(url,name,features,args){calls.push({url,name,features});const win={closed:false,outerWidth:1100,outerHeight:700,focus(){},events:{},addEventListener(type,fn){this.events[type]=fn;},close(){this.closed=true;},workspaceHost:{request:async(tab,payload)=>calls.push({tab,payload})}};setTimeout(()=>args.ready(),0);return win;}};
    workspace.resources=async()=>{workspace.baseURI='chrome://researchannotator/content/';return {};};return {...h,workspace,doc,main,calls,toolbar};
}

test('workspace Tools and adjacent toolbar integrations are independent idempotent and clean up',async()=>{
    const h=await workspaceSetup();h.workspace.addToWindow(h.main);h.workspace.addToWindow(h.main);
    assert.deepEqual(h.toolbar.children.map(n=>n.id),['researchannotator-tb-workspace','researchannotator-tb-review','annota-tb-chat','zotero-tb-sync']);
    assert.ok(h.doc.getElementById('researchannotator-workspace-menu'));assert.equal(h.doc.getElementById('researchannotator-tb-workspace').getAttribute('tooltiptext'),'Research Workspace');assert.equal(h.doc.getElementById('researchannotator-tb-review').getAttribute('tooltiptext'),'Annotation Review');
    h.workspace.removeFromWindow(h.main);assert.equal(h.doc.getElementById('researchannotator-tb-workspace'),null);assert.ok(h.doc.getElementById('annota-tb-chat'));
});

test('workspace opening concurrent commands uses one native resource window and focuses it',async()=>{
    const h=await workspaceSetup();const [a,b]=await Promise.all([h.workspace.open(h.main,'explorer'),h.workspace.open(h.main,'notes')]);assert.equal(a,b);assert.equal(h.calls.filter(c=>c.url).length,1);assert.match(h.calls[0].url,/^chrome:\/\/researchannotator\/content\/research-workspace.xhtml$/);
    await h.workspace.open(h.main,'saved');assert.equal(h.calls.filter(c=>c.url).length,1);h.workspace.stop();assert.equal(a.closed,true);
});

test('workspace supports multiple main-window integrations and updates the active selection context',async()=>{
    const h=await workspaceSetup(),other=await workspaceSetup();h.workspace.addToWindow(h.main);h.workspace.addToWindow(other.main);
    const win=await h.workspace.open(h.main,'explorer');let context;win.workspaceHost.setMain=value=>{context=value;};
    assert.equal(await h.workspace.open(other.main,'notes'),win);assert.equal(context,other.main);
    h.workspace.removeFromWindow(h.main);assert.equal(win.closed,false);assert.ok(other.doc.getElementById('researchannotator-tb-workspace'));
    h.workspace.removeFromWindow(other.main);assert.equal(win.closed,true);assert.ok(other.doc.getElementById('annota-tb-chat'));
});

test('workspace opening failures are visibly reported and retain actionable diagnostics',async()=>{
    const h=await workspaceSetup(),alerts=[];h.context.Services.prompt.alert=(main,title,message)=>alerts.push(message);h.workspace.resources=async()=>{throw Error('Missing packaged resource');};
    await assert.rejects(h.workspace.open(h.main),/Missing packaged resource/);assert.equal(alerts.length,1);assert.match(alerts[0],/Resource base: file:\/\/\/test/);assert.equal(h.workspace.window,null);
});

test('workspace remembers dimensions and tab locally and transfers queries to existing notes controller',async()=>{
    const h=await workspaceSetup();h.workspace.remember({outerWidth:1200,outerHeight:800},'activity');assert.equal(h.workspace.state().tab,'activity');assert.equal(h.workspace.state().width,1200);
    const win=await h.workspace.transfer(h.main,h.query);assert.equal(h.calls.at(-1).tab,'notes');assert.equal(h.calls.at(-1).payload.explorer.query.text,h.query.text);h.workspace.stop();assert.equal(win.closed,true);
});

function zoteroNormalizeManagedHTML(html) {
    return html.replace(/\sdata-ra-entry="[^"]*"/g,'').replace(/<mark\b[^>]*>/g,'<span>').replace(/<\/mark>/g,'</span>')
        .replace(/<strong>/g,'<b>').replace(/<\/strong>/g,'</b>').replace(/<hr\b[^>]*>/g,'<div><hr /></div>')
        .replace(/<span\b[^>]*>([\s\S]*?)<\/span>/g,'$1').replace(/\s+/g,' ').trim();
}

async function explorerSetup(){
    const h=await researchSetup();vm.runInContext(fs.readFileSync(path.join(__dirname,'..','research-explorer.js'),'utf8'),h.context);
    const explorer=h.context.AnnotaExplorer;
    h.context.Zotero.Collections.get=id=>id===50?{key:'COLL0001',name:'Research collection'}:null;
    h.context.Zotero.Collections.getByLibrary=()=>[{key:'COLL0001',name:'Research collection'}];
    h.publication.getCollections=()=>[50];
    return {...h,explorer,query:explorer.defaults(h.scope)};
}

test('Explorer discovers historical annotations without structured records and searches all native metadata without AI',async()=>{
    const h=await explorerSetup();h.item.annotationComment='Native mechanics';h.item.getTags=()=>[{tag:'Fatigue'}];
    h.a.generateComment=async()=>{throw Error('Search must not generate');};
    for(const text of ['research passage','Native mechanics','Fatigue','Paper title','A Researcher']){
        const result=await h.explorer.query({...h.query,text});assert.equal(result.total,1,text);
    }
    assert.equal(h.c.get(h.item),null);
});

test('Explorer searches semantic labels and global/color manual/AI values through stable schema IDs',async()=>{
    const h=await explorerSetup();h.a.saveGlobalFields([{id:'g_m',label:'Global manual',type:'text',options:[]},{id:'g_ai',label:'Global AI',type:'ai',prompt:'Explain'}]);
    await h.c.saveValues(h.item,{g_m:'Global experimental setup',g_ai:'Global generated result',manual:'Color manual evidence',summary:'Color AI evidence'});
    for(const text of ['Global experimental','Global generated','Color manual','Color AI',h.palette.resolve('#ffd400').label])assert.equal((await h.explorer.query({...h.query,text})).total,1,text);
});

test('Explorer combined nested AND/OR filters include relevant native and structured fields',async()=>{
    const h=await explorerSetup();await h.c.saveValues(h.item,{manual:'Engineering'});const field=h.a.annotationFields(h.a.keyForItem(h.item)).find(f=>f.name==='manual');
    const leaf=(property,operator,values,extra={})=>({property,operator,values,...extra});
    const filters={logic:'and',children:[leaf('year','equals',['2024']),{logic:'or',children:[leaf('author','contains',['Researcher']),leaf('tag','equals',['No tag'])]},leaf('field','contains',['engineer'],{fieldID:field.id})]};
    assert.equal((await h.explorer.query({...h.query,filters})).total,1);
    filters.children[1].logic='and';assert.equal((await h.explorer.query({...h.query,filters})).total,0);
});

test('Explorer supports empty/missing values and removed definitions without broadening filters',async()=>{
    const h=await explorerSetup(),field=h.a.annotationFields(h.a.keyForItem(h.item)).find(f=>f.name==='manual');
    const query=operator=>({...h.query,filters:{logic:'and',children:[{property:'field',fieldID:field.id,operator,values:[]}]}});
    assert.equal((await h.explorer.query(query('empty'))).total,1);assert.equal((await h.explorer.query(query('notEmpty'))).total,0);
    const removed={...query('empty'),filters:{logic:'and',children:[{property:'field',fieldID:'g_removed',operator:'notContains',values:['x']}]}};
    const result=await h.explorer.query(removed);assert.equal(result.total,0);assert.deepEqual(clone(result.unresolved),['g_removed']);
});

test('Explorer all scalar and categorical operators are deterministic and category identities survive renaming',async()=>{
    const h=await explorerSetup();h.a.saveGlobalFields([{id:'g_multi',label:'Experiment',type:'multiselect',options:[]}]);
    const field=h.a.getGlobalFields()[0],ids=h.a.categoryIDs(field,['EIS','SEM']);await h.c.saveValues(h.item,{g_multi:ids});
    const row=await h.explorer.record(h.item),filter={property:'field',fieldID:field.id,values:[ids[0],ids[1]]};
    assert.equal(h.explorer.matches(row,{...filter,operator:'all'}),true);assert.equal(h.explorer.matches(row,{...filter,operator:'any',values:['missing',ids[0]]}),true);
    assert.equal(h.explorer.matches(row,{...filter,operator:'notEquals',values:['missing']}),true);
    assert.equal(h.explorer.matches(row,{...filter,operator:'notContains',values:['absent']}),true);
    const catalog=h.a.categoryCatalog();catalog[field.id][ids[0]]='Electrochemical impedance';h.prefs.set('researchannotator.fieldCategories',JSON.stringify(catalog));
    const renamed=await h.explorer.record(h.item);assert.equal(h.explorer.matches(renamed,{...filter,operator:'all'}),true);assert.match(renamed.fields[field.id].label,/Electrochemical/);
});

test('Explorer scopes support direct collections, selected publications/attachments and non-PDF reader annotations',async()=>{
    const h=await explorerSetup();
    for(const scope of [{...h.scope,kind:'collection',key:'COLL0001'},{...h.scope,kind:'publications',keys:['PAPER001']},{...h.scope,kind:'attachments',keys:['PDFKEY01']}])assert.equal((await h.explorer.query({...h.query,scope})).total,1);
    h.parent.attachmentContentType='application/epub';h.explorer.cache.clear();assert.equal((await h.explorer.query(h.query)).total,1);
    const row=await h.explorer.record(h.item);assert.equal(h.explorer.inScope(row,{...h.scope,kind:'collection',key:'OTHER001'}),false);
});

test('Explorer sorting grouping and pagination use stable fields and preserve deterministic order',async()=>{
    const h=await explorerSetup(),row=await h.explorer.record(h.item);
    const rows=[{...row,key:'B',title:'B publication',year:'2023',pageNumber:2},{...row,key:'A',title:'A publication',year:'2024',pageNumber:10}];
    let result=await h.explorer.evaluate(rows,{...h.query,group:{key:'none'},sort:{key:'page',direction:'asc'}});assert.equal(result[0].key,'B');
    result=await h.explorer.evaluate(rows,{...h.query,group:{key:'publication'},sort:{key:'year',direction:'desc'}});assert.equal(result[0].key,'A');
    const key=JSON.stringify(h.research.canonical(h.query.scope));h.explorer.cache.set(key,{scope:h.query.scope,rows,byID:new Map()});
    const page=await h.explorer.query(h.query,{offset:1,limit:1});assert.equal(page.total,2);assert.equal(page.rows.length,1);
});

test('Explorer saved searches persist create edit duplicate rename delete with stable identities',async()=>{
    const h=await explorerSetup(),saved=h.explorer.save(h.query,{name:'Original'});
    const edited=h.explorer.save({...saved,text:'Changed'},{id:saved.id,name:'Renamed'});assert.equal(edited.id,saved.id);
    const duplicate={...edited};delete duplicate.id;const copied=h.explorer.save(duplicate,{name:'Copy'});assert.notEqual(copied.id,saved.id);
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','research-explorer.js'),'utf8'),h.context);assert.equal(h.context.AnnotaExplorer.saved().length,2);
    h.context.AnnotaExplorer.deleteSearch(saved.id);assert.equal(h.context.AnnotaExplorer.saved()[0].id,copied.id);
});

test('Explorer saved searches round-trip in settings and complete backups while old exports remain valid',async()=>{
    const h=await explorerSetup();h.explorer.save(h.query,{name:'Portable query'});
    for(const kind of ['settings','backup']){
        const data=await h.data.export(kind);assert.equal(data.settings.prefs.explorerSearches.searches.length,1);h.data.validate(data);
        const old=clone(data);delete old.settings.prefs.explorerSearches;h.data.validate(old);
    }
    const bad=await h.data.export('settings');bad.settings.prefs.explorerSearches.searches[0].filters={logic:'bad',children:[]};assert.throws(()=>h.data.validate(bad),/filter/);
});

test('Explorer stable field and color filters survive display-name changes',async()=>{
    const h=await explorerSetup(),color=h.palette.resolve('#ffd400');h.a.saveGlobalFields([{id:'g_stable',label:'Old field',type:'text',options:[]}]);await h.c.saveValues(h.item,{g_stable:'Evidence'});
    const query={...h.query,filters:{logic:'and',children:[{property:'field',fieldID:'g_stable',operator:'equals',values:['Evidence']},{property:'color',operator:'equals',values:[color.id]}]}};
    h.a.saveGlobalFields([{id:'g_stable',label:'Renamed field',type:'text',options:[]}]);await h.palette.update(color.id,{label:'Renamed category'},'keep');
    assert.equal((await h.explorer.query(query)).total,1);
});

test('Explorer direct navigation opens exact annotation and parent publication',async()=>{
    const h=await explorerSetup(),calls=[];h.context.Zotero.Reader={open:async(id,location)=>calls.push([id,location])};const main={ZoteroPane:{selectItem:async id=>calls.push(id)}};
    const identity=h.infra.stableAnnotation(h.item);await h.explorer.navigate(main,identity);await h.explorer.navigate(main,identity,true);
    assert.deepEqual(clone(calls),[[8,{annotationID:'ANNKEY01'}],40]);
});

test('Explorer manual edits use strict compare-and-save, reject AI writes and retain concurrent values',async()=>{
    const h=await explorerSetup(),fields=h.a.annotationFields(h.a.keyForItem(h.item)),field=fields.find(f=>f.name==='manual'),ai=fields.find(f=>f.type==='ai'),identity=h.infra.stableAnnotation(h.item),color=h.a.keyForItem(h.item);
    await h.c.saveValues(h.item,{manual:'Before'});await h.explorer.saveManual(identity,{[field.id]:'After'},{[field.id]:'Before'},color);assert.equal(h.c.get(h.item).values.manual,'After');
    await assert.rejects(h.explorer.saveManual(identity,{[field.id]:'Stale'},{[field.id]:'Before'},color),/another view/);assert.equal(h.c.get(h.item).values.manual,'After');
    await assert.rejects(h.explorer.saveManual(identity,{[ai.id]:'Forbidden'},{},color),/read-only/);
    await assert.rejects(h.explorer.saveManual(identity,{[field.id]:'Wrong color'},{[field.id]:'After'},'#123456'),/color changed/);
});

test('Explorer manual editing preserves checkbox dropdown and multi-select values through shared persistence',async()=>{
    const h=await explorerSetup();h.a.saveGlobalFields([{id:'g_assign',label:'Assignments',type:'multiselect',options:[]}]);
    const field=h.a.getGlobalFields()[0],ids=h.a.categoryIDs(field,['EIS']),schema=h.a.annotationFields(h.a.keyForItem(h.item)),patch={g_assign:ids};
    patch[schema.find(f=>f.name==='check').id]='true';patch[schema.find(f=>f.name==='choice').id]='B';
    await h.explorer.saveManual(h.infra.stableAnnotation(h.item),patch,{},h.a.keyForItem(h.item));
    assert.deepEqual(clone(h.c.get(h.item).values.g_assign),clone(ids));assert.equal(h.c.get(h.item).values.check,'true');assert.equal(h.c.get(h.item).values.choice,'B');
});

test('Explorer native Comment/Tags saves preserve tag types, reject stale edits and update managed notes',async()=>{
    const h=await explorerSetup();let tags=[{tag:'Native',type:1}];h.item.getTags=()=>tags;h.item.setTags=value=>{tags=value;};h.item.annotationComment='Before';
    const identity=h.infra.stableAnnotation(h.item),snapshot=await h.explorer.nativeSnapshot(identity);
    await h.explorer.saveNative(identity,{comment:'After',tags:[...tags,{tag:'User',type:0}]},snapshot);assert.equal(h.item.annotationComment,'After');assert.equal(tags[0].type,1);assert.match(h.html(),/After/);
    await assert.rejects(h.explorer.saveNative(identity,{comment:'Stale'},snapshot),/another view/);assert.equal(h.item.annotationComment,'After');
});

test('Explorer native save failure rolls back in-memory values and keeps saved structured data intact',async()=>{
    const h=await explorerSetup();await h.c.saveValues(h.item,{summary:'Keep'});h.item.annotationComment='Native';h.item.setTags=()=>{};h.item.saveTx=async()=>{throw Error('Native DB failure');};
    await assert.rejects(h.explorer.saveNative(h.infra.stableAnnotation(h.item),{comment:'Bad'},{comment:'Native'}),/Native DB failure/);assert.equal(h.item.annotationComment,'Native');assert.equal(h.c.get(h.item).values.summary,'Keep');
});

test('Explorer AI remains explicit and failure Retry uses shared persistent jobs',async()=>{
    const h=await explorerSetup(),field=h.a.annotationFields(h.a.keyForItem(h.item)).find(f=>f.type==='ai'),identity=h.infra.stableAnnotation(h.item);
    h.infra.jobs.kick=()=>{};await assert.rejects(h.explorer.regenerate(identity,field.id,true),/no failed/);
    await h.c.saveMetadata(h.item,field,{state:'failed'});const id=await h.explorer.regenerate(identity,field.id,true);assert.equal(h.infra.state.jobs[id].type,'structured-ai');assert.equal(h.infra.state.jobs[id].paid,true);
});

test('Explorer filtered notes reuse existing engine and saved search identity after rename/filter edits',async()=>{
    const h=await explorerSetup();await h.c.saveValues(h.item,{manual:'Evidence'});const saved=h.explorer.save({...h.query,text:'Evidence'},{name:'My evidence'});
    let config=h.research.configuration(saved.scope,{type:'explorer',query:saved});await h.research.run({config,ai:'existing'},h.control,{});
    const first=h.research.configs().find(c=>c.id===config.id);const note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id);assert.match(note.getNote(),/Evidence/);
    const renamed=h.explorer.save({...saved,text:'Research'},{id:saved.id,name:'Renamed'});config=h.research.configuration(renamed.scope,{type:'explorer',query:renamed});assert.equal(config.id,first.id);
    await h.research.run({config,ai:'existing'},h.control,{});assert.equal((await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id)).key,note.key);
});

test('Explorer anonymous note identity ignores result presentation and cached display labels',async()=>{
    const h=await explorerSetup(),filter={type:'explorer',query:h.query},first=h.research.configuration(h.query.scope,filter);await h.infra.notes.configure(first);
    const query={...h.query,display:{text:false},sort:{key:'year',direction:'desc'},group:{key:'none'}};
    const second=h.research.configuration(query.scope,{type:'explorer',query});assert.equal(second.id,first.id);
});

test('Explorer filtered notes respect automatic/manual/static modes and incomplete-data protection',async()=>{
    const h=await explorerSetup();await h.c.saveValues(h.item,{summary:'Complete'});const filter={type:'explorer',query:h.query};let config=h.research.configuration(h.query.scope,filter,{mode:'auto'});
    await h.research.run({config,ai:'existing'},h.control,{});config=h.research.configs().find(c=>c.id===config.id);const note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id);
    await h.c.saveValues(h.item,{manual:'Automatic'});await h.research.refreshAutomatic();assert.match(note.getNote(),/Automatic/);
    await h.infra.notes.configure({...config,mode:'manual'});const previous=note.getNote();await h.c.saveValues(h.item,{manual:'Manual'});await h.research.refreshAutomatic();assert.equal(note.getNote(),previous);
    await h.research.update({...config,mode:'manual'});assert.match(note.getNote(),/Manual/);
    await h.infra.notes.configure({...config,mode:'static'});await assert.rejects(h.research.update({...config,mode:'static'}),/Static/);
    delete h.c._store['1/ANNKEY01'];await assert.rejects(h.research.update({...config,mode:'manual'}),/missing/);
});

test('Explorer incremental cache updates annotation values and deletion without rescanning the library',async()=>{
    const h=await explorerSetup();await h.explorer.query(h.query);const enumerate=h.research.items;h.research.items=async()=>{throw Error('Must reuse cached scope');};
    h.item.annotationComment='Changed cached comment';await h.explorer.changed([h.item.id]);assert.equal((await h.explorer.query({...h.query,text:'Changed cached'})).total,1);
    h.item.deleted=true;await h.explorer.changed([h.item.id]);assert.equal((await h.explorer.query(h.query)).total,0);h.research.items=enumerate;
});

test('Explorer superseded queries cancel during incremental evaluation',async()=>{
    const h=await explorerSetup(),token={cancelled:true};await assert.rejects(h.explorer.query(h.query,{token}),error=>error.cancelled===true);
    const row=await h.explorer.record(h.item);await assert.rejects(h.explorer.evaluate(Array(1000).fill(row),h.query,token),error=>error.cancelled===true);
});

test('Explorer superseded cold searches share one scope discovery instead of rescanning per keystroke',async()=>{
    const h=await explorerSetup(),gate=defer(),original=h.research.items,token={cancelled:false};let calls=0;
    h.research.items=async scope=>{calls++;await gate.promise;return original.call(h.research,scope);};
    const first=h.explorer.query(h.query,{token});await Promise.resolve();token.cancelled=true;
    const second=h.explorer.query({...h.query,text:'research'});gate.resolve();
    await assert.rejects(first,error=>error.cancelled===true);assert.equal((await second).total,1);assert.equal(calls,1);
});

test('Explorer large-library cold/warm measurements, bounded pages and no rescan on keystrokes',async()=>{
    const h=await explorerSetup(),count=15000,ids=[];
    for(let i=0;i<count;i++){const id=1000+i,key='A'+String(i).padStart(7,'0');h.items.set(id,{...h.item,id,key,annotationText:i%2?'Engineering evidence':'Thermal evidence'});ids.push(id);}
    h.parent.getAnnotations=()=>ids;const start=performance.now();let result=await h.explorer.query(h.query);const cold=performance.now()-start;
    assert.equal(result.total,count);assert.equal(result.rows.length,40);h.research.items=async()=>{throw Error('Cached search must not enumerate');};
    const hot=performance.now();result=await h.explorer.query({...h.query,text:'Thermal'},{limit:25});const warm=performance.now()-hot;
    assert.equal(result.total,count/2);assert.equal(result.rows.length,25);assert.ok(warm<5000,'Warm query unexpectedly blocked for '+warm+'ms');
    console.log('Explorer performance fixture: '+JSON.stringify({records:count,coldMs:Math.round(cold),warmMs:Math.round(warm),pageSize:25}));
});

test('managed PDF notes remain byte-stable through 100 editor-normalized rebuilds and restart', async()=>{
    const h=await infrastructureNoteSetup();await h.c.saveValues(h.item,{manual:'Research evidence',summary:'AI evidence'});
    h.note.saveTx=async()=>h.setHTML(zoteroNormalizeManagedHTML(h.html()));
    await h.a._syncPaperResearchNote(h.item);const first=h.html();
    for(let i=0;i<100;i++){await h.a._syncPaperResearchNote(h.item);assert.equal(h.html(),first,'rebuild '+i);}
    const savedState=clone(h.infra.state);h.infra.state=null;h.files.set(h.infra.path('infrastructure'),savedState);await h.infra.loadState();
    await h.a._syncPaperResearchNote(h.item);assert.equal(h.html(),first);
    assert.doesNotMatch(h.html(),/Preserved user-edited note snapshot/);assert.equal(h.note.key,'NOTEKEY1');
    assert.doesNotMatch(h.html().replace(/<[^>]*>/g,''),/research-annotator-(?:pdf-note|data)-v1/);
});

test('managed semantic comparison ignores presentation normalization and entity/link serialization',async()=>{
    const h=await infrastructureSetup();
    const original='<div data-ra-entry="1:A"><h2><a href="zotero://open-pdf/library/items/PDFKEY01?page=1&amp;annotation=A">A &amp; B</a></h2><p><strong>Result:</strong> <mark>Evidence</mark></p></div>';
    const normalized='<div><h2><a href="zotero://open-pdf/library/items/PDFKEY01?page=1&#38;annotation=A">A &#38; B</a></h2><p><b>Result:</b> <span>Evidence</span></p></div>';
    assert.equal(h.infra.notes.canonical(original),h.infra.notes.canonical(normalized));
    assert.doesNotMatch(h.infra.notes.preserveEdits(normalized,{generated:{'1:A':original},content:original}),/Preserved user/);
});

test('normalized same-label fields remain generated and additional user-labelled paragraphs survive',async()=>{
    const h=await infrastructureNoteSetup();h.a.saveGlobalFields([{id:'g_same',label:'Manual',type:'text',options:[]}]);
    await h.c.saveValues(h.item,{g_same:'Global evidence',manual:'Color evidence'});h.note.saveTx=async()=>h.setHTML(zoteroNormalizeManagedHTML(h.html()));
    await h.a._syncPaperResearchNote(h.item);const first=h.html();for(let i=0;i<100;i++)await h.a._syncPaperResearchNote(h.item);
    assert.equal(h.html(),first);assert.doesNotMatch(h.html(),/Preserved user-edited/);
    h.setHTML(h.html()+'<p><b>Manual:</b> My own labelled paragraph</p>');await h.a._syncPaperResearchNote(h.item);const withUser=h.html();
    for(let i=0;i<5;i++)await h.a._syncPaperResearchNote(h.item);assert.equal(h.html(),withUser);assert.match(h.html(),/My own labelled paragraph/);
});

test('normalized managed updates preserve genuine paragraphs before between and after entries',async()=>{
    const h=await infrastructureNoteSetup();await h.c.saveValues(h.item,{summary:'AI'});await h.a._syncPaperResearchNote(h.item);
    let html=zoteroNormalizeManagedHTML(h.html());html=html.replace(/(<h2\b[^>]*>)/,'<p>Before evidence</p>$1').replace(/(<\/h2>)/,'$1<p>Between generated fields</p>')+'<p>After evidence</p>';
    h.setHTML(html);h.note.saveTx=async()=>h.setHTML(zoteroNormalizeManagedHTML(h.html()));
    await h.a._syncPaperResearchNote(h.item);const first=h.html();
    for(let i=0;i<5;i++)await h.a._syncPaperResearchNote(h.item);
    for(const text of ['Before evidence','Between generated fields','After evidence'])assert.equal((h.html().match(new RegExp(text,'g'))||[]).length,1);
    assert.equal(h.html(),first);assert.doesNotMatch(h.html(),/Preserved user-edited note snapshot/);
});

test('normalized managed source edits additions deletion and AI updates do not accumulate generated content',async()=>{
    const h=await researchSetup();h.note.saveTx=async()=>h.setHTML(zoteroNormalizeManagedHTML(h.html()));
    await h.c.saveValues(h.item,{summary:'Old AI'});await h.a._syncPaperResearchNote(h.item);
    h.item.annotationText='Edited source passage';await h.c.saveValues(h.item,{summary:'New AI'});await h.a._syncPaperResearchNote(h.item);
    assert.match(h.html(),/Edited source passage/);assert.match(h.html(),/New AI/);assert.doesNotMatch(h.html(),/Old AI|A research passage/);
    const added={...h.item,id:17,key:'NEWANN01',annotationText:'Added evidence'};h.items.set(17,added);h.parent.getAnnotations=()=>[7,17];
    await h.a._syncPaperResearchNote(h.item);assert.match(h.html(),/Added evidence/);
    h.item.deleted=true;h.a._deletedAnnotationKeys=new Set(['1:ANNKEY01']);await h.a._syncPaperResearchNote({libraryID:1,parentID:8,existingOnly:true});
    assert.doesNotMatch(h.html(),/Edited source passage/);assert.match(h.html(),/Added evidence/);
    const first=h.html();await h.a._syncPaperResearchNote({libraryID:1,parentID:8,existingOnly:true});assert.equal(h.html(),first);
});

test('managed repair backs up exact original, flattens only labelled snapshots and retains ordinary quotes',async()=>{
    const h=await infrastructureNoteSetup();await h.c.saveValues(h.item,{summary:'Saved evidence'});await h.a._syncPaperResearchNote(h.item);
    const config=h.infra.notes.pdfConfig(h.parent,1),generated=Object.values(config.generated).join('');
    const snapshot=body=>'<blockquote><p><strong>Preserved user-edited note snapshot:</strong></p>'+body+'</blockquote>';
    const quote='<blockquote><p>An ordinary quotation that must remain</p></blockquote>';
    const original=h.html()+snapshot(generated+'<p>Genuine user insight</p>'+snapshot(generated+'<p>Genuine user insight</p><p>Uncertain historical evidence</p>'))+quote;
    h.setHTML(original);await assert.rejects(h.a._syncPaperResearchNote(h.item),/Repair duplicated snapshots/);assert.equal(h.html(),original);
    const repaired=await h.infra.notes.repair(config);assert.equal(h.files.get(repaired.backup).noteHTML,original);assert.equal(repaired.noteKey,'NOTEKEY1');
    assert.doesNotMatch(h.html(),/Preserved user-edited note snapshot/);assert.match(h.html(),/Genuine user insight/);assert.match(h.html(),/Uncertain historical evidence/);assert.match(h.html(),new RegExp(quote));
    assert.equal((h.html().match(/Genuine user insight/g)||[]).length,1);assert.equal((h.html().match(/Saved evidence/g)||[]).length,1);
    await h.a._syncPaperResearchNote(h.item);const first=h.html();for(let i=0;i<100;i++)await h.a._syncPaperResearchNote(h.item);assert.equal(h.html(),first);
    assert.equal(h.c.get(h.item).values.summary,'Saved evidence');
});

test('managed repair aborts on failed backup and never changes note or source values',async()=>{
    const h=await infrastructureNoteSetup();await h.c.saveValues(h.item,{summary:'Keep'});await h.a._syncPaperResearchNote(h.item);
    const config=h.infra.notes.pdfConfig(h.parent,1),original=h.html(),write=h.context.IOUtils.writeJSON;
    h.context.IOUtils.writeJSON=async(file,...args)=>{if(file.includes('managed-note-repair-'))throw Error('Disk full');return write(file,...args);};
    await assert.rejects(h.infra.notes.repair(config),/Disk full/);assert.equal(h.html(),original);assert.equal(h.c.get(h.item).values.summary,'Keep');
});

test('managed repair can restore the exact original and creates a recovery backup of the repaired version',async()=>{
    const h=await infrastructureNoteSetup();await h.c.saveValues(h.item,{summary:'Keep original evidence'});await h.a._syncPaperResearchNote(h.item);
    const config=h.infra.notes.pdfConfig(h.parent,1),original=h.html()+'<blockquote><p><strong>Preserved user-edited note snapshot:</strong></p><p>User material</p></blockquote>';
    h.setHTML(original);await h.infra.notes.repair(config);const repaired=h.html(),saved=h.infra.notes.pdfConfig(h.parent,1);
    const result=await h.infra.notes.restoreRepair(saved);assert.equal(h.html(),original);assert.equal(h.files.get(result.backup).noteHTML,repaired);assert.equal(h.infra.notes.pdfConfig(h.parent,1).mode,'manual');
});

test('managed repair retains unique evidence found only inside snapshots and genuine recovered headings',async()=>{
    const h=await infrastructureSetup(),old='<div data-ra-entry="1:A"><h2><a href="zotero://open-pdf/library/items/PDFKEY01?annotation=A">Only surviving evidence</a></h2><p><strong>Summary:</strong> Unique AI</p></div>';
    const content='<h1>Research Notes</h1><blockquote><p><strong>Preserved user-edited note snapshot:</strong></p>'+old+'<h1>My authored heading</h1></blockquote>';
    const repaired=h.infra.notes.repairHTML(content,{generated:{'1:A':old}});assert.match(repaired,/Unique AI/);assert.match(repaired,/Only surviving evidence/);assert.match(repaired,/My authored heading/);assert.doesNotMatch(repaired,/Preserved user-edited note snapshot/);
});

test('managed ownership survives manual title-link removal without duplicating the native note',async()=>{
    const h=await researchSetup(),color=h.palette.resolve('#ffd400'),config=await h.run({type:'color',colorIDs:[color.id]});
    const saved=h.research.configs().find(c=>c.id===config.id),note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id),key=note.key;
    note.setNote(note.getNote().replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i,'<h1>My edited title</h1>'));h.infra.notes.cache.clear();
    await h.research.update(saved);assert.equal((await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id)).key,key);
});

test('Explorer saved dropdown categories retain stable filter identity after categorical labels change',async()=>{
    const h=await explorerSetup();await h.c.saveValues(h.item,{choice:'B'});const field=h.a.annotationFields(h.a.keyForItem(h.item)).find(f=>f.name==='choice'),id=h.a.categoryIDs(field,['B'])[0];
    const filter={property:'field',fieldID:field.id,categoryIDs:true,categoryAliases:{[id]:['B']},operator:'equals',values:[id]};
    const catalog=h.a.categoryCatalog();catalog[field.id][id]='Renamed category';h.prefs.set('researchannotator.fieldCategories',JSON.stringify(catalog));
    assert.equal(h.explorer.matches(await h.explorer.record(h.item),filter),true);
});

test('generic field color and filtered managed note types share normalized idempotence and invisible identities',async()=>{
    for(const type of ['field','color','explorer']){
        const h=await researchSetup();await h.c.saveValues(h.item,{manual:'Keep',summary:'AI'});
        const config={...h.research.configuration(h.scope,{type:'color',colorIDs:[h.palette.resolve('#ffd400').id]}),id:'test_'+type,scope:{type:'research',key:type},mode:'manual'};
        const note=await h.infra.notes.synchronize(config,[h.item],{manual:true});const save=note.saveTx.bind(note);
        note.saveTx=async()=>{note.setNote(zoteroNormalizeManagedHTML(note.getNote()));await save();};
        await h.infra.notes.synchronize(config,[h.item],{manual:true});const first=note.getNote();
        for(let i=0;i<100;i++)await h.infra.notes.synchronize(config,[h.item],{manual:true});
        assert.equal(note.getNote(),first,type);assert.doesNotMatch(note.getNote().replace(/<[^>]*>/g,''),/research-annotator-(?:managed-note|data)-v1/);
        assert.equal((await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id)).key,note.key);
    }
});

async function researchSetup() {
    const h = await infrastructureNoteSetup();
    h.parent.attachmentContentType = 'application/pdf'; h.parent.getAnnotations = () => [h.item.id];
    h.parent.parentID = 40;
    const publication = { id: 40, key: 'PAPER001', libraryID: 1, isRegularItem: () => true,
        getAttachments: () => [8], getDisplayTitle: () => 'Paper title',
        getField: name => name === 'date' ? '2024-03-01' : 'Paper title', getCreators: () => [{firstName:'A',lastName:'Researcher'}] };
    h.items.set(40, publication);
    let next = 100;
    h.context.Zotero.Item = class {
        constructor() { this.id = next++; this.key = 'NOTE' + this.id; this.html = ''; }
        isNote() { return true; } getNote() { return this.html; } setNote(value) { this.html = value; }
        async saveTx() { h.items.set(this.id, this); }
    };
    h.context.Zotero.Search = class {
        addCondition(name, op, value) { if (name === 'itemType') this.type = value; }
        async search() { return [...h.items.values()].filter(i => this.type === 'note' ? i.isNote?.() && !i.deleted : this.type === 'attachment' ? i.isAttachment?.() : i.isAnnotation?.()).map(i=>i.id); }
    };
    h.context.Zotero.Collections = { getByLibraryAndKey: () => ({ getChildItems: () => [40] }) };
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'research-notes.js'), 'utf8'), h.context);
    const research = h.context.AnnotaResearchNotes;
    const scope = { kind:'library', library:{type:'user',id:'1234'} };
    const checkpoints = [];
    const control = { check() {}, completeField: async () => {}, progress: async (progress, cp) => { if(cp) checkpoints.push(clone(cp)); } };
    const run = async (filter = {type:'pdf'}, options = {}, checkpoint) => {
        const config = research.configuration(scope, filter, options);
        await research.run({config,ai:options.ai || 'existing',regenerateOutdated:!!options.regenerateOutdated},control,{checkpoint});
        return config;
    };
    return {...h,research,scope,publication,control,checkpoints,run};
}

test('research scope enumeration includes historical annotations and multiple PDFs, deduplicates collection roots', async () => {
    const h = await researchSetup();
    const second = {...h.parent,id:9,key:'PDFKEY02',getAnnotations:()=>[10]}, ann={...h.item,id:10,key:'ANNKEY02',parentID:9};
    h.items.set(9,second);h.items.set(10,ann);h.publication.getAttachments=()=>[8,9];
    const data=await h.research.items(h.scope);assert.equal(data.pdfs.length,2);assert.equal(data.annotations.length,2);assert.equal(data.publications,1);
    const collection=await h.research.items({...h.scope,kind:'collection',key:'COLL001'});assert.equal(collection.pdfs.length,2);
    const selected=await h.research.items({...h.scope,kind:'publications',keys:['PAPER001']});assert.equal(selected.annotations.length,2);
    const pdf=await h.research.items({...h.scope,kind:'attachments',keys:['PDFKEY02']});assert.equal(pdf.annotations[0].key,'ANNKEY02');
});

test('research scopes exclude non-PDF attachments, deleted sources and other libraries', async () => {
    const h=await researchSetup();h.parent.attachmentContentType='application/epub';assert.equal((await h.research.items(h.scope)).pdfs.length,0);
    h.parent.attachmentContentType='application/pdf';h.item.deleted=true;assert.equal((await h.research.items(h.scope)).annotations.length,0);
    h.parent.libraryID=2;assert.equal((await h.research.items(h.scope)).pdfs.length,0);
    await assert.rejects(h.research.items({...h.scope,kind:'unknown'}),/scope/);
});

test('research preview summarizes historical missing and saved AI values without provider calls or note creation', async () => {
    const h=await researchSetup();let requests=0;h.a.generateComment=async()=>{requests++;return 'Never';};
    let result=await h.research.preview(h.scope,{type:'pdf'},{});
    assert.equal(result.counts.missing,1);assert.equal(result.counts.requests,1);assert.equal(requests,0);
    assert.equal(h.research.configs().length,0);assert.equal(h.items.size,4);
    await h.c.saveValues(h.item,{summary:'Saved'});result=await h.research.inspect(h.scope,{type:'pdf'});
    assert.equal(result.counts.existing,1);assert.equal(result.counts.missing,0);
});

test('research AI summary identifies outdated and failed results independently of saved successes', async () => {
    const h=await researchSetup(),field=h.a.annotationFields(h.a.keyForItem(h.item)).find(f=>f.type==='ai');
    await h.c.saveValues(h.item,{summary:'Old'});await h.c.saveMetadata(h.item,field,{state:'completed',promptFingerprint:'old'});
    let data=await h.research.inspect(h.scope,{type:'pdf'});assert.equal(data.counts.outdated,1);assert.equal(data.counts.requests,0);
    await h.c.saveMetadata(h.item,field,{state:'failed'});data=await h.research.inspect(h.scope,{type:'pdf'});
    assert.equal(data.counts.failed,1);assert.equal(data.counts.existing,1);
});

test('research batch generates missing historical AI and reuses it on rerun, retaining native content', async () => {
    const h=await researchSetup();let calls=0;h.item.annotationComment='Native evidence';const tags=clone(h.item.getTags());
    await h.c.saveValues(h.item,{manual:'Handwritten'});h.a.generateComment=async()=>{calls++;return 'Historical result';};
    await h.run({type:'pdf'},{ai:'missing'});await h.run({type:'pdf'},{ai:'missing'});
    assert.equal(calls,1);assert.equal(h.c.get(h.item).values.manual,'Handwritten');assert.equal(h.item.annotationComment,'Native evidence');assert.deepEqual(clone(h.item.getTags()),tags);
    assert.match(h.html(),/Historical result/);assert.equal(h.checkpoints.at(-1).completedNotes.length,1);
});

test('research existing-only generation never regenerates outdated values; explicit outdated regeneration works', async () => {
    const h=await researchSetup(),field=h.a.annotationFields(h.a.keyForItem(h.item)).find(f=>f.type==='ai');
    await h.c.saveValues(h.item,{summary:'Previous'});await h.c.saveMetadata(h.item,field,{state:'completed',promptFingerprint:'old'});
    let calls=0;h.a.generateComment=async()=>{calls++;return 'Updated';};
    await h.run({type:'pdf'},{ai:'missing'});assert.equal(calls,0);
    await h.run({type:'pdf'},{regenerateOutdated:true});assert.equal(calls,1);assert.equal(h.c.get(h.item).values.summary,'Updated');
});

test('research batch reports empty PDFs without creating their notes', async () => {
    const h=await researchSetup();h.parent.getAnnotations=()=>[];
    await h.run();assert.deepEqual(h.checkpoints.at(-1).skippedPDFs,['PDFKEY01']);assert.equal(h.checkpoints.at(-1).completedNotes.length,0);assert.doesNotMatch(h.html(),/annotation=/);
});

test('research batch reuses PDF identity and retains automatic PDF functionality', async () => {
    const h=await researchSetup();await h.run({type:'pdf'},{mode:'auto'});const first=h.html();
    await h.run({type:'pdf'},{mode:'auto'});assert.equal(h.html(),first);
    await h.c.saveValues(h.item,{manual:'Automatic update'});await h.a._syncPaperResearchNote(h.item);assert.match(h.html(),/Automatic update/);
    assert.equal(h.infra.notes.pdfConfig(h.parent,1).noteKey,'NOTEKEY1');
});

test('research cross-publication color notes use stable IDs and preserve citations, source links and ordinary notes', async () => {
    const h=await researchSetup(),color=h.palette.resolve('#ffd400');
    const config=await h.run({type:'color',colorIDs:[color.id]},{title:'Methods',include:{citation:true}});
    const note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id);
    assert.match(note.getNote(),/Paper title/);assert.match(note.getNote(),/Source:/);assert.match(note.getNote(),/annotation=ANNKEY01/);
    assert.equal(h.html().includes('Introduction'),true);const key=note.key;
    await h.palette.update(color.id,{label:'Renamed semantic category'},'keep');
    await h.run({type:'color',colorIDs:[color.id]},{title:'New title'});assert.equal((await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id)).key,key);
});

test('research field notes use global category IDs and follow category renames', async () => {
    const h=await researchSetup();h.a.saveGlobalFields([{id:'g_experiment',label:'Experiment',type:'multiselect',options:[]}]);
    const field=h.a.getGlobalFields()[0],ids=h.a.categoryIDs(field,['EIS','Other']);await h.c.saveValues(h.item,{g_experiment:[ids[0]]});
    const filter={type:'field',fieldID:field.id,values:[ids[0]]};assert.equal((await h.research.inspect(h.scope,filter)).items.length,1);
    const catalog=h.a.categoryCatalog();catalog[field.id][ids[0]]='Renamed EIS';h.prefs.set('researchannotator.fieldCategories',JSON.stringify(catalog));
    const config=await h.run(filter);const note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id);assert.match(note.getNote(),/Renamed EIS/);
    assert.equal(h.research.matches(h.item,{...filter,values:[ids[1]]}),false);
});

test('research color-specific fields and categorical dropdown filters preserve stable field/value identifiers', async () => {
    const h=await researchSetup(),fields=h.a.annotationFields(h.a.keyForItem(h.item));
    await h.c.saveValues(h.item,{choice:'B',manual:'Text'});const field=fields.find(f=>f.name==='choice');
    const values=h.research.fieldValues([h.item],field),id=values.find(([,label])=>label==='B')[0];
    assert.equal(h.research.matches(h.item,{type:'field',fieldID:field.id,values:[id]}),true);
    assert.equal(h.research.matches(h.item,{type:'field',fieldID:fields.find(f=>f.name==='manual').id,values:['Text']}),true);
    assert.equal(h.research.matches(h.item,{type:'field',fieldID:'removed',values:[]}),false);
});

test('research configurations ignore ordering and titles for identity and prevent duplicate notes', async () => {
    const h=await researchSetup(),color=h.palette.resolve('#ffd400');
    const first=await h.run({type:'color',colorIDs:[color.id]},{title:'First'});
    const second=await h.run({colorIDs:[color.id],type:'color'},{title:'Second'});
    assert.equal(first.id,second.id);assert.equal([...h.items.values()].filter(i=>i.isNote?.()).length,2);
    const saved=h.research.configs().find(c=>c.id===first.id);await h.research.rename(saved,'Renamed');
    assert.equal(h.research.configs().find(c=>c.id===first.id).id,first.id);
    assert.match((await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+first.id)).getNote(),/Renamed/);
});

test('research compiler honors individual and scoped field inclusion plus publication content flags', async () => {
    const h=await researchSetup();await h.c.saveValues(h.item,{manual:'Hidden manual',summary:'Hidden AI'});
    const field=h.a.annotationFields(h.a.keyForItem(h.item)).find(f=>f.name==='manual');
    const result=await h.research.preview(h.scope,{type:'pdf'},{include:{['field:'+field.id]:false,colorAI:false,text:false,page:false,publicationTitle:false,authors:false,year:false,citation:false,comment:false,tags:false,color:false}});
    assert.doesNotMatch(result.html,/Hidden manual|Hidden AI|Paper title|A research passage|Page:|Source:|Researcher|2024/);
    assert.match(result.html,/Source annotation/);assert.match(result.html,/annotation=ANNKEY01/);
});

test('research compiler displays publication title authors and year consistently for PDF and cross-paper notes', async () => {
    const h=await researchSetup();const include={publicationTitle:true,authors:true,year:true,citation:true,page:true};await h.run(undefined,{include});assert.match(h.html(),/Paper title/);assert.match(h.html(),/A Researcher/);assert.match(h.html(),/2024/);
    const result=await h.research.preview(h.scope,{type:'pdf'},{include});assert.match(result.html,/A Researcher/);assert.match(result.html,/2024/);
});

test('research manual notes update only explicitly and static notes remain frozen', async () => {
    const h=await researchSetup(),color=h.palette.resolve('#ffd400');
    const config=await h.run({type:'color',colorIDs:[color.id]},{mode:'manual'}),saved=h.research.configs().find(c=>c.id===config.id);
    const note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id),first=note.getNote();
    await h.c.saveValues(h.item,{manual:'Later edit'});await h.research.refreshAutomatic();assert.equal(note.getNote(),first);
    await h.research.update(saved);assert.match(note.getNote(),/Later edit/);
    await h.infra.notes.configure({...saved,mode:'static'});const frozen=note.getNote();
    await h.c.saveValues(h.item,{manual:'Third edit'});await h.research.refreshAutomatic();assert.equal(note.getNote(),frozen);
    await assert.rejects(h.research.update({...saved,mode:'static',noteKey:note.key}),/Static/);
});

test('research automatic field notes reconcile value changes and annotation deletion without AI requests', async () => {
    const h=await researchSetup(),field=h.a.annotationFields(h.a.keyForItem(h.item)).find(f=>f.name==='manual');
    await h.c.saveValues(h.item,{manual:'Match'});const config=await h.run({type:'field',fieldID:field.id,values:['Match']},{mode:'auto'});
    const note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id);assert.match(note.getNote(),/annotation=ANNKEY01/);
    h.a.generateComment=async()=>{throw Error('Automatic note sync must not request AI');};
    await h.c.saveValues(h.item,{manual:'No match'});await h.research.refreshAutomatic();assert.doesNotMatch(note.getNote(),/annotation=ANNKEY01/);
    await h.c.saveValues(h.item,{manual:'Match'});await h.research.refreshAutomatic();assert.match(note.getNote(),/annotation=ANNKEY01/);
    h.item.deleted=true;await h.research.refreshAutomatic();assert.doesNotMatch(note.getNote(),/annotation=ANNKEY01/);
});

test('research cross-paper updates preserve user-authored content and edited generated ranges', async () => {
    const h=await researchSetup(),color=h.palette.resolve('#ffd400'),config=await h.run({type:'color',colorIDs:[color.id]});
    const note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id);
    note.setNote(note.getNote().replace('A research passage','My edited evidence')+'<p>My conclusion</p>');
    await h.research.update(h.research.configs().find(c=>c.id===config.id));
    assert.match(note.getNote(),/My edited evidence/);assert.match(note.getNote(),/My conclusion/);assert.match(note.getNote(),/Preserved user-edited/);
});

test('research incomplete local records cannot replace existing cross-publication notes even with local ownership', async () => {
    const h=await researchSetup(),color=h.palette.resolve('#ffd400');await h.c.saveValues(h.item,{summary:'Complete AI'});
    const config=await h.run({type:'color',colorIDs:[color.id]}),saved=h.research.configs().find(c=>c.id===config.id);
    const note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id),before=note.getNote();
    delete h.c._store['1/ANNKEY01'];await assert.rejects(h.research.update(saved),/missing|incomplete/);assert.equal(note.getNote(),before);
});

test('research incomplete foreign device fingerprint guards generic notes after portable import', async () => {
    const h=await researchSetup(),color=h.palette.resolve('#ffd400');await h.c.saveValues(h.item,{summary:'Complete'});
    const config=await h.run({type:'color',colorIDs:[color.id]}),saved=h.research.configs().find(c=>c.id===config.id);
    const identity=h.infra.notes.identity(saved.library,saved.scope);delete h.infra.state.notes[identity];
    const portable={...saved};delete portable.content;delete portable.generated;delete portable.noteKey;
    await h.c.saveValues(h.item,{summary:'Different'});
    await assert.rejects(h.infra.notes.synchronize(portable,[h.item],{manual:true}),/incomplete|differs/);
});

test('research cancellation retains incremental AI results and completed note checkpoints', async () => {
    const h=await researchSetup();h.a.generateComment=async()=> 'Durable result';let stopped=false;
    const control={...h.control,check(){if(stopped){const e=Error('cancelled');e.stopped=true;throw e;}},progress:async(p,cp)=>{if(cp?.completedNotes?.length)stopped=true;}};
    const config=h.research.configuration(h.scope,{type:'pdf'},{});
    await h.research.run({config,ai:'missing'},control,{});assert.equal(h.c.get(h.item).values.summary,'Durable result');assert.match(h.html(),/Durable result/);
});

test('research partial AI failure preserves prior values, compiles successful content and retries explicitly', async () => {
    const h=await researchSetup();h.a.saveGlobalFields([{id:'g_ai',label:'Extra',type:'ai',prompt:'Explain'}]);
    h.a.generateComment=async()=>{throw Error('Provider unavailable');};await h.c.saveValues(h.item,{summary:'Prior success'});
    await assert.rejects(h.run({type:'pdf'},{ai:'missing'}),/operations failed/);
    assert.equal(h.c.get(h.item).values.summary,'Prior success');assert.match(h.html(),/Prior success/);assert.equal(h.checkpoints.at(-1).failures.length,1);
    h.a.generateComment=async()=> 'Recovered';await h.run({type:'pdf'},{ai:'missing'},h.checkpoints.at(-1));
    assert.equal(h.c.get(h.item).values.g_ai,'Recovered');
    assert.match(h.html(),/Recovered/);
});

test('research job manager deduplicates simultaneous submissions and recovers interrupted paid jobs without replay', async () => {
    const h=await researchSetup();h.research.install();h.infra.jobs.kick=()=>{};
    const [one,two]=await Promise.all([h.research.enqueue(h.scope,{type:'pdf'},{ai:'missing'}),h.research.enqueue(h.scope,{type:'pdf'},{ai:'missing'})]);
    assert.equal(one,two);assert.equal(h.infra.jobs.list().length,1);await h.infra.jobs.recover();
    await assert.rejects(h.infra.jobs.resume(one),/acknowledgement/);h.research.stop();
});

test('research note deletion trashes only owned notes and releases ownership without changing update mode', async () => {
    const h=await researchSetup(),color=h.palette.resolve('#ffd400'),config=await h.run({type:'color',colorIDs:[color.id]},{mode:'auto'});
    const saved=h.research.configs().find(c=>c.id===config.id),note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id);
    await h.research.remove(saved);assert.equal(note.deleted,true);assert.equal(h.note.deleted,undefined);
    assert.equal(h.research.configs().find(c=>c.id===config.id).mode,'auto');assert.ok(h.research.configs().find(c=>c.id===config.id).orphanBackup);await h.research.refreshAutomatic();
    assert.equal([...h.items.values()].filter(i=>i.isNote?.()&&!i.deleted).length,1);assert.equal(h.research.configs().find(c=>c.id===config.id).managementDisabled,true);await h.research.resumeManagement(saved,{confirmed:true});assert.equal([...h.items.values()].filter(i=>i.isNote?.()&&!i.deleted).length,2);assert.notEqual(h.research.configs().find(c=>c.id===config.id).noteKey,saved.noteKey);
});

test('research batch produces distinct managed notes for two PDFs belonging to one publication', async () => {
    const h=await researchSetup(),second={...h.parent,id:9,key:'PDFKEY02',getAnnotations:()=>[10]},ann={...h.item,id:10,key:'ANNKEY02',parentID:9};
    h.items.set(9,second);h.items.set(10,ann);
    const other=new h.context.Zotero.Item('note');other.libraryID=1;other.setNote('<h1>Second PDF</h1><p>research-annotator-pdf-note-v1:PDFKEY02</p>');await other.saveTx();
    h.a._getOrCreatePaperResearchNote=async annotation=>({note:annotation.parentID===9?other:h.note});
    await h.run();assert.match(h.html(),/annotation=ANNKEY01/);assert.doesNotMatch(h.html(),/annotation=ANNKEY02/);
    assert.match(other.getNote(),/annotation=ANNKEY02/);assert.doesNotMatch(other.getNote(),/annotation=ANNKEY01/);
    const count=h.items.size;await h.run();assert.equal(h.items.size,count);assert.equal(h.checkpoints.at(-1).completedNotes.length,2);
});

test('research persistent job executes with shared lifecycle checkpoints and reports completion', async () => {
    const h=await researchSetup();h.research.install();h.a.generateComment=async()=> 'Queued historical AI';
    const id=await h.research.enqueue(h.scope,{type:'pdf'},{ai:'missing'});const job=await h.infra.jobs.wait(id);
    assert.equal(job.state,'completed');assert.equal(job.checkpoint.completedAnnotations.length,1);assert.equal(job.checkpoint.completedNotes.length,1);
    assert.equal(job.checkpoint.pendingAI,0);assert.match(h.html(),/Queued historical AI/);h.research.stop();
});

test('research generation resumes completed annotation checkpoints without repeating successful requests', async () => {
    const h=await researchSetup();await h.c.saveValues(h.item,{summary:'Checkpoint success'});let requests=0;h.a.generateComment=async()=>{requests++;return 'Unexpected';};
    await h.run({type:'pdf'},{ai:'missing'},{completedAnnotations:['ANNKEY01'],completedNotes:[],processedNotes:[],failures:[]});
    assert.equal(requests,0);assert.match(h.html(),/Checkpoint success/);
});

test('research renamed structured field labels retain filter identity and source matching', async () => {
    const h=await researchSetup();h.a.saveGlobalFields([{id:'g_evidence',label:'Old label',type:'text',options:[]}]);
    await h.c.saveValues(h.item,{g_evidence:'Observed'});const filter={type:'field',fieldID:'g_evidence',values:['Observed']};
    const config=await h.run(filter);h.a.saveGlobalFields([{id:'g_evidence',label:'New label',type:'text',options:[]}]);
    await h.research.update(h.research.configs().find(c=>c.id===config.id));
    const note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id);assert.match(note.getNote(),/New label/);assert.match(note.getNote(),/Observed/);
});

function setup(fields = schema) {
    let disk = { version: 2, annotations: {} };
    const writes = [];
    const item = { id: 7, key: 'ABC', libraryID: 1, annotationType: 'highlight',
        annotationColor: '#ffd400', annotationText: 'A research passage',
        annotationComment: 'Native comment stays exactly as typed', parentID: 8,
        isAnnotation: () => true, getTags: () => [], library: { editable: true } };
    const context = { console, setTimeout: () => 1, clearTimeout: () => {},
        PathUtils: { join: (...parts) => parts.join('/') },
        IOUtils: { exists: async () => true, readJSON: async () => clone(disk),
            writeJSON: async (file, data) => { disk = clone(data); writes.push(clone(data)); } },
        Zotero: { DataDirectory: { dir: '/test-only' }, debug() {},
            Prefs: { get: () => undefined },
            Items: { getAsync: async () => item, getByLibraryAndKey: () => item } } };
    vm.createContext(context);
    for (const name of ['bootstrap.js', 'card-fields.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), context);
    }
    const a = context.Annota, c = context.AnnotaCardFields;
    const realSync = a._syncPaperResearchNote;
    const realGetColorEntry = a.getColorEntry;
    a.getColorEntry = () => ({ fields, prompt: '', template: '', trigger: 'auto' });
    a.providerReadyError = () => '';
    a.getContext = () => ({});
    a.getReferences = async () => '';
    a._syncPaperResearchNote = async () => {};
    a.t = (key, vars) => vars?.msg || key;
    a._ensureFormStyles = () => {};
    a._shieldFromReaderShortcuts = () => {};
    return { a, c, item, context, writes, realSync, realGetColorEntry, disk: () => clone(disk) };
}

test('individual generation persists AI, preserves manual/unknown values and Comment, reloads', async () => {
    const { a, c, item, context, disk } = setup();
    await c.saveValues(item, { manual: 'Handwritten', check: 'true', choice: 'B', retired: 'Keep' });
    a.generateComment = async args => {
        assert.equal(args.fields.manual, 'Handwritten');
        return 'Generated summary';
    };
    await a.generateStructuredFields(item);
    assert.deepEqual(clone(c.get(item).values), {
        manual: 'Handwritten', check: 'true', choice: 'B', retired: 'Keep', summary: 'Generated summary' });
    assert.equal(item.annotationComment, 'Native comment stays exactly as typed');
    assert.equal(disk().annotations['1/ABC'].colors['#ffd400'].values.summary, 'Generated summary');
    c._store = c._loading = null;
    await c.load();
    assert.equal(c.get(item).values.summary, 'Generated summary');
    assert.ok(context.IOUtils);
});

test('partial or empty AI failure commits no generated values', async () => {
    for (const fail of [() => { throw Error('Provider unavailable'); }, () => '', () => '<p></p>']) {
        const { a, c, item, disk } = setup(schema + '\nother | Other | ai | Explain');
        await c.saveValues(item, { manual: 'Keep manual', savedAI: 'Keep previous' });
        const before = disk(); let calls = 0;
        a.generateComment = async () => ++calls === 1 ? 'First success' : fail();
        await assert.rejects(a.generateStructuredFields(item));
        assert.deepEqual(disk(), before);
        assert.equal(c.get(item).values.summary, undefined);
        assert.equal(c.get(item).values.savedAI, 'Keep previous');
        assert.equal(item.annotationComment, 'Native comment stays exactly as typed');
    }
});

test('existing AI values are not regenerated; missing instructions reject', async () => {
    const { a, c, item } = setup();
    await c.saveValues(item, { summary: 'Existing AI' });
    a.generateComment = async () => { throw Error('Should not call'); };
    await a.generateStructuredFields(item);
    assert.equal(c.get(item).values.summary, 'Existing AI');
    a.getColorEntry = () => ({ fields: 'newAI | New AI | ai' });
    await assert.rejects(a.generateStructuredFields(item), /No AI instruction/);
});

test('disk failure leaves old structured values in memory and disk, and permits retry', async () => {
    const { c, item, context, disk } = setup();
    await c.saveValues(item, { manual: 'Old' });
    const writer = context.IOUtils.writeJSON;
    context.IOUtils.writeJSON = async () => { throw Error('Disk full'); };
    await assert.rejects(c.saveValues(item, { manual: 'New' }), /Disk full/);
    assert.equal(c.get(item).values.manual, 'Old');
    assert.equal(disk().annotations['1/ABC'].colors['#ffd400'].values.manual, 'Old');
    context.IOUtils.writeJSON = writer;
    await c.saveValues(item, { manual: '' });
    assert.equal(c.get(item).values.manual, '');
});

test('unreadable storage is never overwritten', async () => {
    const { c, item, context, writes } = setup();
    context.IOUtils.readJSON = async () => { throw Error('Corrupt file'); };
    await assert.rejects(c.saveValues(item, { manual: 'New' }), /could not be read/);
    assert.equal(writes.length, 0);
});

test('concurrent manual edits survive AI and same-field results do not overwrite newer values', async () => {
    const { a, c, item } = setup();
    await c.saveValues(item, { manual: 'Before' });
    let release, started;
    const ready = new Promise(resolve => { started = resolve; });
    a.generateComment = () => { started(); return new Promise(resolve => { release = resolve; }); };
    const request = a.generateStructuredFields(item);
    await ready;
    await assert.rejects(a.generateStructuredFields(item), /already running/);
    await c.saveValues(item, { manual: 'During request', summary: 'Newer result' });
    release('Older result');
    await request;
    assert.equal(c.get(item).values.manual, 'During request');
    assert.equal(c.get(item).values.summary, 'Newer result');
});

test('color change or deletion during generation prevents saving a result', async () => {
    for (const change of [item => { item.annotationColor = '#ff6666'; }, item => { item.deleted = true; }]) {
        const { a, c, item, writes } = setup();
        a.generateComment = async () => { change(item); return 'Late'; };
        await assert.rejects(a.generateStructuredFields(item), /changed or became unavailable/);
        assert.equal(writes.length, 0);
        assert.equal(c.get(item), null);
    }
});

// Minimal DOM exercises the actual renderers and their event wiring, not Zotero layout.
class Element {
    constructor(tag, doc) {
        this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
        this.style = { removeProperty() {}, setProperty() {} }; this.dataset = {}; this.events = {};
        this.value = ''; this.textContent = ''; this.isConnected = true;
        this.classList = { add: (...names) => {
            this.className = [...new Set([...(this.className || '').split(' ').filter(Boolean), ...names])].join(' ');
        }, remove() {}, contains: name => (this.className || '').split(' ').includes(name) };
    }
    appendChild(el) {
        if (el.parentNode) el.parentNode.children = el.parentNode.children.filter(child => child !== el);
        this.children.push(el); el.parentNode = this; return el;
    }
    removeAttribute(name) { delete this[name]; }
    append(...elements) { elements.forEach(el => this.appendChild(el)); }
    replaceChildren() { this._text = ''; this.children = []; }
    setAttribute(name, value) { this[name === 'class' ? 'className' : name] = value; }
    getAttribute(name) { return this[name === 'class' ? 'className' : name] ?? null; }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    querySelector() { return null; }
    querySelectorAll() { return []; }
    contains(el) { return this === el || this.children.some(child => child.contains?.(el)); }
    get options() { return this.children; }
    get textContent() { return this._text || this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this._text = String(value); this.children = []; }
}
function document() {
    const doc = { created: [], defaultView: { clearTimeout() {}, setTimeout() {} } };
    doc.getElementById = () => null;
    doc.createElement = tag => { const el = new Element(tag, doc); doc.created.push(el); return el; };
    doc.createTextNode = text => ({ textContent: text });
    doc.head = doc.createElement('head');
    return doc;
}

test('sidebar renders AI label/placeholder read-only and saves clearing all manual controls', async () => {
    const { a, c, item } = setup(); const doc = document();
    const card = doc.createElement('div');
    const form = c.build(doc, card, { schema: a.fieldsForColor('#ffd400') });
    c.fill(form, { values: {} });
    assert.equal(form._fields.summary.ai, true);
    assert.equal(form._fields.summary.el.tagName, 'DIV');
    assert.equal(form._fields.summary.row.children[0].textContent, 'Summary');
    assert.equal(form._fields.summary.el.textContent, 'Not generated yet');
    await c.saveValues(item, { manual: 'Old', check: 'true', choice: 'A', summary: 'Saved AI' });
    c.fill(form, { values: c.get(item).values });
    form._fields.manual.el.value = '';
    form._fields.check.el.checked = false;
    form._fields.choice.el.value = '';
    for (const name of ['manual', 'check', 'choice']) {
        for (const listener of form._fields[name].el.events.input) listener();
    }
    c.item = async () => item; c.ensure = async () => {};
    await c.save(card, form);
    assert.deepEqual(clone(c.get(item).values), { manual: '', check: '', choice: '', summary: 'Saved AI' });
    assert.equal(form._dirty, false);
});

test('clicked-highlight popup displays AI and explicit action saves/displays output', async () => {
    const { a, c, item } = setup(); const doc = document();
    a._getResearchMetadata = async () => ({ themes: [], experiments: [], annotations: {} });
    a._renderExistingAnnotationResearch({ doc, popup: doc.createElement('div'),
        annotation: { id: item.key, libraryID: 1 }, reader: {} });
    await new Promise(resolve => setImmediate(resolve));
    const ai = doc.created.find(el => el.className === 'annota-popup-ai');
    assert.ok(ai);
    assert.equal(ai.textContent, 'Not generated yet');
    assert.equal(ai.parentNode.children[0].textContent, 'Summary');
    const button = doc.created.find(el => el.className === 'annota-popup-generate-fields');
    assert.equal(button.hidden, true);
    c.setGenerationState(item, { error: 'Provider unavailable' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(button.hidden, false);
    a.generateComment = async () => 'Popup result';
    await button.events.click[0]({ preventDefault() {}, stopPropagation() {} });
    assert.equal(c.get(item).values.summary, 'Popup result');
    assert.equal(ai.textContent, 'Popup result');
    assert.equal(button.hidden, true);
    assert.equal(item.annotationComment, 'Native comment stays exactly as typed');
});

test('consolidated note uses stored AI values and leaves native Comment untouched', async () => {
    const { a, c, item, context } = setup();
    await c.saveValues(item, { manual: 'Manual value', summary: 'AI value' });
    let html = '<h1>Research note</h1>';
    const note = { key: 'NOTE', libraryID: 1, getNote: () => html,
        setNote: value => { html = value; }, saveTx: async () => {} };
    a._getOrCreatePaperResearchNote = async () => ({ note });
    a._getResearchMetadata = async () => ({ annotations: {} });
    context.Zotero.Search = class { addCondition() {} async search() { return [7]; } };
    context.Zotero.Libraries = { get: () => ({}) };
    context.Zotero.Items.getAsync = async id => id === 8 ? { key: 'PDF', isAttachment: () => true } : item;
    // Use the real renderer, bypassing only the database/queue shell.
    await a._syncPaperResearchNoteNow(item);
    assert.match(html, /Summary:<\/strong> AI value/);
    assert.match(html, /Manual:<\/strong> Manual value/);
    assert.equal(item.annotationComment, 'Native comment stays exactly as typed');
});

test('highlight creation renders configured AI labels and a read-only placeholder', () => {
    const { a } = setup(); const doc = document(); let form;
    a.readerColorButtons = () => [];
    a._renderSelectionForm({ doc, params: { annotation: { text: 'Passage' } },
        append: el => { form = el; } });
    assert.ok(form);
    assert.ok(doc.created.some(el => el.textContent === 'Summary'));
    const placeholder = doc.created.find(el => el.textContent === 'Not generated yet');
    assert.equal(placeholder.tagName, 'DIV');
});

test('sidebar AI action uses structured storage without touching native Comment', async () => {
    const { a, c, item } = setup(); const doc = document();
    const card = doc.createElement('div');
    c.item = async () => item; c.ensure = async () => {};
    a.generateComment = async () => 'Sidebar result';
    const button = doc.createElement('button');
    await c.fillWithAI(card, button);
    assert.equal(c.get(item).values.summary, 'Sidebar result');
    assert.equal(item.annotationComment, 'Native comment stays exactly as typed');
    assert.equal(button.disabled, false);
});

test('read-only annotations cannot save or generate structured values', async () => {
    const { a, c, item, writes } = setup();
    item.library.editable = false;
    await assert.rejects(c.saveValues(item, { manual: 'No' }), /read-only/);
    await assert.rejects(a.generateStructuredFields(item), /read-only/);
    assert.equal(writes.length, 0);
});

const nextTurn = () => new Promise(resolve => setImmediate(resolve));
function defer() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
}

test('new mixed highlight saves manual fields before automatic AI, shows progress, preserves edits', async () => {
    const { a, c, item, disk } = setup();
    a.handleConvertedAnnotation = async () => false;
    a.handleResearchMetadata = async () => {};
    a._pendingFields = { text: item.annotationText, color: item.annotationColor,
        ts: Date.now(), values: { manual: 'Creation draft', check: '', choice: 'B' } };
    const started = defer(), response = defer(); let calls = 0;
    a.generateComment = async args => {
        calls++;
        assert.equal(args.fields.manual, 'Creation draft');
        assert.equal(disk().annotations['1/ABC'].colors['#ffd400'].values.manual, 'Creation draft');
        started.resolve();
        return response.promise;
    };
    const adding = a._handlePaperNoteNotification('add', item.id, {}, Date.now());
    await started.promise;
    assert.equal(c.aiText(item, ''), 'Generating...');
    assert.equal(c.generationMessage(item), 'Generating...');
    await a._handlePaperNoteNotification('add', item.id, {}, Date.now());
    await a._handlePaperNoteNotification('modify', item.id, {}, Date.now());
    await c.saveValues(item, { manual: 'Edited while generating', check: 'true' });
    response.resolve('Automatic answer');
    await adding;
    assert.equal(calls, 1);
    assert.equal(c.get(item).values.manual, 'Edited while generating');
    assert.equal(c.get(item).values.check, 'true');
    assert.equal(c.get(item).values.summary, 'Automatic answer');
    assert.equal(item.annotationComment, 'Native comment stays exactly as typed');
    assert.equal(c.generationState(item).running, undefined);
});

test('AI-only add automatically generates once, failure stays visible and explicit retry works', async () => {
    const { a, c, item, writes } = setup('summary | Summary | ai | Summarize');
    a.handleConvertedAnnotation = async () => false;
    a.handleResearchMetadata = async () => {};
    let calls = 0;
    a.generateComment = async () => { calls++; throw Error('Offline'); };
    await a._handlePaperNoteNotification('add', item.id, {}, Date.now());
    assert.equal(calls, 1);
    assert.equal(writes.length, 0);
    assert.match(c.generationMessage(item), /Offline/);
    await a._handlePaperNoteNotification('add', item.id, {}, Date.now());
    assert.equal(calls, 1);
    a.generateComment = async () => { calls++; return 'Retried answer'; };
    await a.generateStructuredFields(item);
    assert.equal(calls, 2);
    assert.equal(c.get(item).values.summary, 'Retried answer');
    assert.equal(c.generationState(item).error, undefined);
});

test('opening existing highlights or reloading storage never automatically generates', async () => {
    const { a, c, item } = setup(); const doc = document(); let calls = 0;
    a.generateComment = async () => { calls++; return 'Unexpected'; };
    await c.load();
    a._getResearchMetadata = async () => ({ themes: [], experiments: [], annotations: {} });
    a._renderExistingAnnotationResearch({ doc, popup: doc.createElement('div'),
        annotation: { id: item.key, libraryID: 1 }, reader: {} });
    await nextTurn();
    c._store = c._loading = null;
    await c.load();
    await a._handlePaperNoteNotification('modify', item.id, {}, Date.now());
    assert.equal(calls, 0);
});

test('automatic request failure does not start if saving the manual draft fails', async () => {
    const { a, item, context } = setup(); let calls = 0;
    a._pendingFields = { text: item.annotationText, ts: Date.now(), values: { manual: 'Unsaved' } };
    context.IOUtils.writeJSON = async () => { throw Error('Disk unavailable'); };
    a.generateComment = async () => { calls++; return 'No'; };
    await a.handleItem(item.id, Date.now());
    assert.equal(calls, 0);
});

test('popup shows automatic generation state and updates AI without replacing dirty manual draft', async () => {
    const { a, c, item } = setup(); const doc = document();
    a._getResearchMetadata = async () => ({ themes: [], experiments: [], annotations: {} });
    a._renderExistingAnnotationResearch({ doc, popup: doc.createElement('div'),
        annotation: { id: item.key, libraryID: 1 }, reader: {} });
    await nextTurn();
    const manual = doc.created.find(el => el.parentNode?.children[0]?.textContent === 'Manual' && el.tagName === 'INPUT');
    manual.value = 'Still typing'; manual.events.input[0]();
    const response = defer(), started = defer();
    a.generateComment = async () => { started.resolve(); return response.promise; };
    const request = a.generateStructuredFields(item);
    await started.promise; await nextTurn();
    const ai = doc.created.find(el => el.className === 'annota-popup-ai');
    assert.equal(ai.textContent, 'Generating...');
    response.resolve('Ready'); await request; await nextTurn();
    assert.equal(ai.textContent, 'Ready');
    assert.equal(manual.value, 'Still typing');
});

test('Add to Note hiding is restricted to the native creation-popup action', () => {
    const { a } = setup(); const doc = document();
    a._hideCreationAddToNote({ doc });
    const style = doc.created.find(el => el.id === 'annota-creation-actions-style');
    assert.equal(style.textContent,
        '.selection-popup > button.toolbar-button.wide-button{display:none !important;}');
    assert.equal(doc.head.children.includes(style), true);
});

function noteHarness() {
    const h = setup(); const { a, item, context } = h;
    let html = '<h1>Research</h1><p>My introduction</p><p>research-annotator-pdf-note-v1:PDFKEY</p>';
    const note = { id: 30, key: 'NOTE', libraryID: 1, isNote: () => true,
        getNote: () => html, setNote: value => { html = value; }, saveTx: async () => {} };
    const attachment = { id: 8, key: 'PDFKEY', isAttachment: () => true };
    item.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[0, 0, 20, 20]] });
    const second = { ...item, id: 9, key: 'DEF', annotationText: 'Second passage',
        annotationPosition: JSON.stringify({ pageIndex: 1, rects: [[0, 0, 20, 20]] }) };
    const items = new Map([[7, item], [9, second], [8, attachment], [30, note]]);
    a._syncPaperResearchNote = h.realSync;
    a._getOrCreatePaperResearchNote = async () => ({ note });
    a._getResearchMetadata = async () => ({ annotations: {} });
    a.getColorPrompts = () => ({ '#ffd400': { fields: schema } });
    context.Zotero.Libraries = { get: () => ({}) };
    context.Zotero.Items.getAsync = async id => items.get(id);
    context.Zotero.Items.getByLibraryAndKeyAsync = async (libraryID, key) =>
        [...items.values()].find(value => value.key === key);
    context.Zotero.Search = class {
        addCondition(name, op, value) { if (name === 'itemType') this.type = value; }
        async search() { return this.type === 'note' ? [30] : [7, 9]; }
    };
    const remove = async (annotation, withParent = false) => {
        items.delete(annotation.id);
        await a._handlePaperNoteNotification('delete', annotation.id,
            { [annotation.id]: { libraryID: 1, key: annotation.key,
                ...(withParent ? { parentID: 8 } : {}) } }, Date.now());
    };
    return { ...h, second, items, note, remove, html: () => html, setHTML: value => { html = value; } };
}

test('deletion rebuilds immediately, renumbers remaining entries and preserves user content', async () => {
    const h = noteHarness();
    await h.a._syncPaperResearchNote(h.item);
    h.setHTML(h.html() + '<p>My unrelated footer</p>');
    await h.remove(h.item);
    assert.doesNotMatch(h.html(), /annotation=ABC/);
    assert.match(h.html(), /annotation=DEF/);
    assert.match(h.html(), /<h2\b[^>]*>1\./);
    assert.doesNotMatch(h.html(), /<h2\b[^>]*>2\./);
    assert.match(h.html(), /My introduction/);
    assert.match(h.html(), /My unrelated footer/);
});

test('deleting multiple/final highlights preserves footer and supports normalized note HTML', async () => {
    const h = noteHarness();
    await h.c.saveValues(h.item, { manual: 'Manual', summary: 'Saved AI' });
    await h.a._syncPaperResearchNote(h.item);
    h.setHTML(h.html().replace(/<div data-ra-entry="[^"]+">/g, '').replace(/<\/div>/g, '')
        + '<p>Unrelated final text</p>');
    await Promise.all([h.remove(h.item), h.remove(h.second)]);
    assert.doesNotMatch(h.html(), /annotation=|Saved AI|<h2>/);
    assert.match(h.html(), /My introduction/);
    assert.match(h.html(), /Unrelated final text/);
});

test('deletion resolves attachment from saved note after restart without an annotation cache', async () => {
    const h = noteHarness();
    await h.a._syncPaperResearchNote(h.item);
    h.a._annotationParents = new Map();
    await h.remove(h.item);
    assert.doesNotMatch(h.html(), /annotation=ABC/);
    assert.match(h.html(), /annotation=DEF/);
});

test('pending note save and late AI cannot restore a deleted highlight even with stale item cache', async () => {
    const h = noteHarness();
    await h.a._syncPaperResearchNote(h.item);
    const aiResponse = defer(), aiStarted = defer();
    h.a.generateComment = async () => { aiStarted.resolve(); return aiResponse.promise; };
    const generating = h.a.generateStructuredFields(h.item);
    await aiStarted.promise;
    const saved = defer(), saving = defer(); let block = true;
    h.note.saveTx = async () => { if (block) { block = false; saving.resolve(); await saved.promise; } };
    h.second.annotationText = 'Changed second passage';
    const pending = h.a._syncPaperResearchNote(h.second);
    await saving.promise;
    // Leave the stale annotation object in the item cache and search results.
    const removing = h.a._handlePaperNoteNotification('delete', h.item.id,
        { [h.item.id]: { libraryID: 1, key: h.item.key } }, Date.now());
    saved.resolve(); await Promise.all([pending, removing]);
    aiResponse.resolve('Late AI answer');
    await assert.rejects(generating, /changed or became unavailable/);
    await h.a._syncPaperResearchNote(h.item);
    assert.doesNotMatch(h.html(), /annotation=ABC|Late AI answer/);
    assert.match(h.html(), /Changed second passage/);
});

test('normalization removes only an exact leading configured AI name or label', () => {
    const { a } = setup();
    const field = { name: 'inferenceText', label: 'Interpretation (95% CI)' };
    for (const prefix of ['inferenceText: ', 'Interpretation (95% CI): ',
        '**Interpretation (95% CI):** ', '**inferenceText**:\n',
        '<strong>Interpretation (95% CI):</strong> ', '## Interpretation (95% CI)\n']) {
        assert.equal(a.normalizeAIFieldValue(field, prefix + 'd = 0.25\n\n## Methods\nKeep this.'),
            'd = 0.25\n\n## Methods\nKeep this.');
    }
    assert.equal(a.normalizeAIFieldValue(field, '<p><b>inferenceText:</b>Result</p>'), '<p>Result</p>');
});

test('normalization preserves meaningful headings, introductory sentences and scientific notation', () => {
    const { a } = setup(); const field = { name: 'summary', label: 'Summary' };
    for (const value of ['Summary of methods: keep', '## Results\nE = mc^2; p_value < 0.05',
        'Summary (n = 12): retain', 'Here is the summary: retain', '**Methods:**\nParagraph 1\n\nParagraph 2']) {
        assert.equal(a.normalizeAIFieldValue(field, value), value);
    }
});

test('individual AI requests ask for content only and retain scientific formatting', async () => {
    const { a, c, item } = setup();
    a.generateComment = async args => {
        assert.equal(args.raw, true);
        assert.match(args.promptOverride, /Return only the requested field content/);
        assert.match(args.promptOverride, /Do not repeat the field name/);
        return '**Summary:** Effect **increased**.\n\n## Methods\np_value < 0.05';
    };
    await a.generateStructuredFields(item);
    assert.equal(c.get(item).values.summary, 'Effect **increased**.\n\n## Methods\np_value < 0.05');
});

test('stored historical labels have consistent rich presentation without rewriting JSON', async () => {
    const h = noteHarness(); const doc = document();
    const original = '<b>Summary:</b> Effect <i>increased</i>.\n\n## Methods\nCO<sub>2</sub> &amp; p &lt; 0.05';
    await h.c.saveValues(h.item, { summary: original });
    const before = h.disk();
    h.a._getResearchMetadata = async () => ({ themes: [], experiments: [], annotations: {} });
    h.a._renderExistingAnnotationResearch({ doc, popup: doc.createElement('div'),
        annotation: { id: h.item.key, libraryID: 1 }, reader: {} });
    await nextTurn();
    const output = doc.created.find(el => el.className === 'annota-popup-ai');
    assert.doesNotMatch(output.textContent, /^Summary:/);
    assert.match(output.textContent, /CO2 & p < 0.05/);
    await h.a._syncPaperResearchNote(h.item);
    assert.match(h.html(), /<strong>Summary:<\/strong> Effect <i>increased<\/i>/);
    assert.match(h.html(), /CO<sub>2<\/sub>/);
    assert.deepEqual(h.disk(), before);
    assert.equal(h.c.get(h.item).values.summary, original);
});

test('AI presentation renders only safe formatting and retains code/paragraph content', () => {
    const { a, item } = setup(); const doc = document(), target = doc.createElement('div');
    a.renderAIField(target, { name: 'summary', label: 'Summary' },
        'Summary: **Finding**\n\n`p_value` <sup>2</sup> <img src=x onerror=bad()>', item);
    assert.ok(doc.created.some(el => el.tagName === 'STRONG'));
    assert.ok(doc.created.some(el => el.tagName === 'CODE'));
    assert.ok(doc.created.some(el => el.tagName === 'SUP'));
    assert.equal(doc.created.filter(el => el.tagName === 'BR').length, 2);
    assert.equal(doc.created.some(el => el.tagName === 'IMG'), false);
    assert.match(target.textContent, /p_value/);
});

test('sidebar Retry is contextual and hidden before, during and after successful generation', async () => {
    const { a, c, item, context } = setup(); const doc = document();
    await c.load();
    context.Zotero.Items.get = () => ({ libraryID: 1 });
    const annotation = { id: item.key, color: item.annotationColor, type: 'highlight' };
    const card = doc.createElement('div'), hook = doc.createElement('span');
    card._annotaCtx = { reader: { itemID: 8 }, annotation };
    hook.querySelector = () => null; card._annotaHook = hook;
    const form = c.build(doc, card, { schema: a.fieldsForColor(item.annotationColor) });
    const button = form._fields.summary.retry;
    form._annotaColor = item.annotationColor;
    card.querySelector = selector => selector.includes('annota-card-form') ? form : null;
    await c.ensure(card); assert.equal(button.hidden, true);
    c.setGenerationState(item, { error: 'Offline' });
    await c.ensure(card); assert.equal(button.hidden, false);
    assert.equal(button.textContent, 'card.retry');
    c.setGenerationState(item, { running: true });
    await c.ensure(card); assert.equal(button.hidden, true);
    assert.equal(form._status.textContent, 'Generating...');
    c.setGenerationState(item, { saved: true });
    await c.ensure(card); assert.equal(button.hidden, true);
});

test('shared field styling uses the same compact, theme-aware containers in all interfaces', async () => {
    const { a, c, item } = setup(); const doc = document();
    a.readerColorButtons = () => [];
    a._renderSelectionForm({ doc, params: { annotation: { text: 'Passage' } }, append() {} });
    c.build(doc, doc.createElement('div'), { schema: a.fieldsForColor(item.annotationColor) });
    a._getResearchMetadata = async () => ({ themes: [], experiments: [], annotations: {} });
    a._renderExistingAnnotationResearch({ doc, popup: doc.createElement('div'),
        annotation: { id: item.key, libraryID: 1 }, reader: {} });
    await nextTurn();
    const rows = doc.created.filter(el => el.classList.contains('annota-structured-field'));
    for (const type of ['text', 'check', 'select', 'ai']) {
        assert.equal(rows.filter(el => el.dataset.fieldType === type).length, 3);
    }
    const css = doc.created.find(el => el.id === 'annota-structured-field-style').textContent;
    assert.match(css, /padding:4px 5px/);
    assert.match(css, /color:inherit/);
    assert.match(css, /prefers-color-scheme:dark/);
});

test('note separators remain exactly one per boundary and synchronization is idempotent', async () => {
    const h = noteHarness();
    await h.a._syncPaperResearchNote(h.item);
    const original = h.html();
    assert.equal((original.match(/<hr\b/g) || []).length, 1);
    for (let i = 0; i < 4; i++) {
        await h.a._syncPaperResearchNote(h.item);
        assert.equal(h.html(), original);
    }
});

test('normalized note separators do not duplicate and user-authored footer rules survive deletion', async () => {
    const h = noteHarness();
    await h.a._syncPaperResearchNote(h.item);
    h.setHTML(h.html().replace(/<div data-ra-entry="[^"]+">/g, '').replace(/<\/div>/g, '')
        .replace(/<hr\b[^>]*>/g, '<div><hr></div>') + '<hr><p>User footer with own divider</p>');
    await h.a._syncPaperResearchNote(h.item);
    assert.equal((h.html().match(/<hr\b/g) || []).length, 2);
    await h.a._syncPaperResearchNote(h.item);
    assert.equal((h.html().match(/<hr\b/g) || []).length, 2);
    await h.remove(h.item); await h.remove(h.second);
    assert.equal((h.html().match(/<hr\b/g) || []).length, 1);
    assert.match(h.html(), /User footer with own divider/);
});

test('sorting and deleting entries retains numbering and recalculates note boundaries', async () => {
    const h = noteHarness(); h.second.annotationColor = '#ff6666';
    h.context.Zotero.Prefs.get = key => key === 'researchannotator.paperNoteSortOrder' ? 'color' : undefined;
    await h.a._syncPaperResearchNote(h.item);
    assert.match(h.html(), /<h2\b[^>]*>1\. [\s\S]*?annotation=DEF/);
    assert.equal((h.html().match(/<hr\b/g) || []).length, 1);
    await h.remove(h.second);
    assert.equal((h.html().match(/<hr\b/g) || []).length, 0);
    assert.match(h.html(), /<h2\b[^>]*>1\. [\s\S]*?annotation=ABC/);
});

function globalSetup(h = setup(), fields = []) {
    const prefs = new Map();
    h.context.Zotero.Prefs.get = key => prefs.get(key);
    h.context.Zotero.Prefs.set = (key, value) => prefs.set(key, value);
    h.a.saveGlobalFields(fields);
    return { ...h, prefs };
}

test('global/color fields with identical labels coexist and persist in separate scopes', async () => {
    const h = globalSetup(setup(), [{ id: 'g_manual', label: 'Manual', type: 'text' }]);
    await h.c.saveValues(h.item, { g_manual: 'Global value', manual: 'Color value' });
    const record = h.disk().annotations['1/ABC'];
    assert.equal(record.globalValues.g_manual, 'Global value');
    assert.equal(record.colors['#ffd400'].values.manual, 'Color value');
    assert.equal(record.colors['#ffd400'].values.g_manual, undefined);
    assert.equal(h.a.annotationFields('#ffd400').filter(f => f.label === 'Manual').length, 2);
});

test('global renaming/reordering/removal and type changes retain stable identity and historical values', async () => {
    const h = globalSetup(setup(), [{ id: 'g_a', label: 'Old name', type: 'text' }, { id: 'g_b', label: 'Other', type: 'check' }]);
    await h.c.saveValues(h.item, { g_a: 'Historical value', g_b: 'true' });
    h.a.saveGlobalFields([{ id: 'g_b', label: 'Other', type: 'check' }, { id: 'g_a', label: 'New name', type: 'textarea' }]);
    assert.equal(h.a.getGlobalFields()[1].id, 'g_a');
    assert.equal(h.c.get(h.item).values.g_a, 'Historical value');
    h.a.saveGlobalFields([]);
    assert.equal(h.disk().annotations['1/ABC'].globalValues.g_a, 'Historical value');
    assert.ok(h.a.globalFieldConfig().archivedFields.some(f => f.id === 'g_a'));
    assert.equal(h.a.getGlobalFields().length, 0);
});

test('color field IDs survive displayed/variable-name changes and historical aliases are retained', async () => {
    const h = globalSetup();
    let raw = 'old | Old | text | | | c_stable';
    h.a.getColorEntry = () => ({ fields: raw });
    await h.c.saveValues(h.item, { old: 'Keep' });
    raw = 'new | Renamed | text | | | c_stable';
    assert.equal(h.c.get(h.item).values.new, 'Keep');
    assert.equal(h.disk().annotations['1/ABC'].colors['#ffd400'].values.old, 'Keep');
});

test('global values survive color changes, clear durably and reload without affecting other colors', async () => {
    const h = globalSetup(setup(), [{ id: 'g_a', label: 'Shared', type: 'text' }]);
    await h.c.saveValues(h.item, { g_a: 'Across colors', manual: 'Yellow only' });
    h.item.annotationColor = '#ff6666';
    assert.equal(h.c.get(h.item).values.g_a, 'Across colors');
    assert.equal(h.c.get(h.item).values.manual, undefined);
    await h.c.saveValues(h.item, { g_a: '' });
    h.c._store = h.c._loading = null; await h.c.load();
    h.item.annotationColor = '#ffd400';
    assert.equal(h.c.get(h.item).values.g_a, '');
    assert.equal(h.c.get(h.item).values.manual, 'Yellow only');
    assert.equal(h.item.annotationComment, 'Native comment stays exactly as typed');
});

test('multi-select searches configured/previous values, creates chips, deduplicates and removes selections', () => {
    const h = globalSetup(setup(), [{ id: 'g_tags', label: 'Topics', type: 'multiselect', options: ['Catalysis', 'Mechanics'] }]);
    const doc = document(), field = h.a.getGlobalFields()[0]; let changes = 0;
    const control = h.a.createMultiSelect(doc, field, [], () => changes++);
    const search = control.children[1]; search.value = 'cata'; search.events.input[0]();
    assert.match(control.children[2].textContent, /Catalysis/);
    control.addValue('Catalysis'); control.addValue('catalysis'); control.addValue('Novel concept');
    assert.equal(control.readValues().length, 2);
    assert.equal(control.children[0].children.length, 2);
    assert.ok(h.a.categorySuggestions(field, 'novel').includes('Novel concept'));
    const id = control.readValues()[0]; control.removeValue(id);
    assert.deepEqual(clone(h.a.categoryLabels(field, control.readValues())), ['Novel concept']);
    control.removeValue(control.readValues()[0]); assert.equal(control.readValues().length, 0);
    assert.equal(changes, 5);
});

test('all annotation interfaces render global multi-select alongside color fields', async () => {
    const h = globalSetup(setup(), [{ id: 'g_topics', label: 'Topics', type: 'multiselect', options: ['A'] }]);
    const doc = document(); h.a.readerColorButtons = () => [];
    h.a._renderSelectionForm({ doc, params: { annotation: { text: 'Passage' } }, append() {} });
    const form = h.c.build(doc, doc.createElement('div'), { schema: h.a.annotationFields('#ffd400') });
    form._fields.g_topics.el.addValue('New value');
    assert.equal(form._dirty, true);
    h.c.item = async () => h.item; h.c.ensure = async () => {};
    await h.c.save(doc.createElement('div'), form);
    h.a._getResearchMetadata = async () => ({ themes: [], experiments: [], annotations: {} });
    h.a._renderExistingAnnotationResearch({ doc, popup: doc.createElement('div'), annotation: { id: h.item.key, libraryID: 1 }, reader: {} });
    await nextTurn();
    assert.equal(doc.created.filter(el => el.classList.contains('annota-multiselect')).length, 3);
    assert.equal(h.a.categoryLabels(h.a.getGlobalFields()[0], h.c.get(h.item).values.g_topics)[0], 'New value');
});

function migrationSetup() {
    const h = globalSetup();
    const current = { themes: ['Flow', 'Unused history'], experiments: ['Rig'], annotations: { '1:ABC': { themes: ['Flow'], experiments: ['Rig'] } } };
    const legacy = { themes: ['Older catalog'], experiments: [], annotations: { '1:ABC': { themes: ['Legacy theme', 'flow'], experiments: [] } } };
    h.context.Zotero.Libraries = { getAll: () => [{ libraryID: 1, editable: true }] };
    h.a._getResearchMetadata = async () => current;
    h.a._findResearchMetadataNote = async () => ({ id: 30 });
    h.a._getResearchMetadataFromNote = async () => legacy;
    h.a._getAllResearchAnnotations = async () => [h.item];
    return { ...h, current, legacy };
}

test('Theme/Experiments migration preserves assignments, catalogs, manual data and native Comment', async () => {
    const h = migrationSetup(); const before = clone([h.current, h.legacy]);
    await h.c.saveValues(h.item, { manual: 'Previously saved' });
    await h.a.migrateLegacyGlobalFields();
    const fields = h.a.getGlobalFields();
    assert.equal(fields.length, 2); assert.ok(fields.every(f => f.type === 'multiselect'));
    const themes = fields.find(f => f.legacyKey === 'themes');
    assert.deepEqual(clone(h.a.categoryLabels(themes, h.c.get(h.item).values[themes.name])), ['Flow', 'Legacy theme']);
    assert.ok(h.a.categorySuggestions(themes, 'older').includes('Older catalog'));
    assert.equal(h.c.get(h.item).values.manual, 'Previously saved');
    assert.equal(h.item.annotationComment, 'Native comment stays exactly as typed');
    assert.deepEqual(clone([h.current, h.legacy]), before);
    assert.equal(h.a._globalMigrationLibraries.has(1), true);
});

test('repeated migration is idempotent, respects clearing/removal and retains legacy sources', async () => {
    const h = migrationSetup(); await h.a.migrateLegacyGlobalFields();
    const before = h.disk(), categories = h.a.categoryCatalog();
    await h.a.migrateLegacyGlobalFields();
    assert.deepEqual(h.disk(), before); assert.deepEqual(h.a.categoryCatalog(), categories);
    const field = h.a.getGlobalFields()[0]; await h.c.saveValues(h.item, { [field.name]: [] });
    await h.a.migrateLegacyGlobalFields(); assert.equal(h.c.get(h.item).values[field.name].length, 0);
    h.a.saveGlobalFields([]); await h.a.migrateLegacyGlobalFields();
    assert.equal(h.a.getGlobalFields().length, 0);
    assert.ok(h.legacy.annotations['1:ABC'].themes.length);
});

test('migration retries safely after a storage failure and retains legacy sources', async () => {
    const h = migrationSetup(), writer = h.context.IOUtils.writeJSON;
    h.context.IOUtils.writeJSON = async () => { throw Error('Disk full'); };
    await h.a.migrateLegacyGlobalFields();
    assert.equal(h.a._globalMigrationLibraries.has(1), false);
    assert.equal(h.a.getGlobalFields().length, 2);
    h.context.IOUtils.writeJSON = writer; await h.a.migrateLegacyGlobalFields();
    assert.equal(h.a._globalMigrationLibraries.has(1), true);
    assert.equal(h.a.getGlobalFields().length, 2);
});

test('global-only AI automatically generates after manual persistence and survives edits/color changes', async () => {
    const h = globalSetup(setup(''), [{ id: 'g_manual', label: 'Shared manual', type: 'text' }, { id: 'g_ai', label: 'Shared AI', type: 'ai', prompt: 'Explain' }]);
    h.a.getColorEntry = () => null;
    h.a.handleConvertedAnnotation = async () => false; h.a.handleResearchMetadata = async () => {};
    h.a._pendingFields = { text: h.item.annotationText, ts: Date.now(), values: { g_manual: 'Draft' } };
    const started = defer(), response = defer();
    h.a.generateComment = async args => { assert.equal(args.fields.g_manual, 'Draft'); started.resolve(); return response.promise; };
    const adding = h.a._handlePaperNoteNotification('add', h.item.id, {}, Date.now()); await started.promise;
    await h.c.saveValues(h.item, { g_manual: 'Concurrent edit' }); h.item.annotationColor = '#ff6666';
    response.resolve('Global result'); await adding;
    assert.equal(h.c.get(h.item).values.g_ai, 'Global result');
    assert.equal(h.c.get(h.item).values.g_manual, 'Concurrent edit');
    assert.equal(h.c.get(h.item).aiMetadata.g_ai.prompt, 'Explain');
    assert.equal(h.item.annotationComment, 'Native comment stays exactly as typed');
});

test('partial automatic generation preserves successes and per-field retry calls only the failed field', async () => {
    const h = globalSetup(setup(''), [
        { id: 'g_one', label: 'One', type: 'ai', prompt: 'First instruction' },
        { id: 'g_two', label: 'Two', type: 'ai', prompt: 'Second instruction' }]);
    let calls = [];
    h.a.generateComment = async args => { calls.push(args.promptOverride); if (args.promptOverride.startsWith('Second')) throw Error('Offline'); return 'Success one'; };
    await assert.rejects(h.a.generateStructuredFields(h.item, { partial: true }), /Offline/);
    assert.equal(h.c.get(h.item).values.g_one, 'Success one');
    assert.equal(h.c.fieldState(h.item, h.a.getGlobalFields()[0]).error, undefined);
    assert.match(h.c.fieldState(h.item, h.a.getGlobalFields()[1]).error, /Offline/);
    calls = []; h.a.generateComment = async args => { calls.push(args.promptOverride); return 'Success two'; };
    await h.a.generateStructuredFields(h.item, { fieldId: 'g_two', partial: true });
    assert.equal(calls.length, 1); assert.match(calls[0], /^Second/);
    assert.equal(h.c.get(h.item).values.g_one, 'Success one');
    assert.equal(h.c.get(h.item).values.g_two, 'Success two');
});

test('Retry is directly below its AI field and targets that field in popup and sidebar', async () => {
    const h = globalSetup(setup(), [{ id: 'g_ai', label: 'Global response', type: 'ai', prompt: 'Global instruction' }]);
    const doc = document(); h.a._getResearchMetadata = async () => ({ themes: [], experiments: [], annotations: {} });
    h.a._renderExistingAnnotationResearch({ doc, popup: doc.createElement('div'), annotation: { id: h.item.key, libraryID: 1 }, reader: {} });
    await nextTurn();
    const globalField = h.a.getGlobalFields()[0]; h.c.setFieldState(h.item, globalField, { error: 'Retry this' }); await nextTurn();
    const response = doc.created.find(el => el.className === 'annota-popup-ai' && el.parentNode.children[0].textContent === 'Global response');
    assert.equal(response._retry.parentNode, response.parentNode);
    assert.equal(response._retry.hidden, false);
    let options; h.a.generateStructuredFields = async (item, opts) => { options = opts; };
    await response._retry.events.click[0]({ preventDefault() {}, stopPropagation() {} });
    assert.equal(options.fieldId, 'g_ai');
    const form = h.c.build(doc, doc.createElement('div'), { schema: h.a.annotationFields('#ffd400') });
    assert.equal(form._fields.g_ai.retry.parentNode, form._fields.g_ai.row);
});

test('global fields synchronize to PDF notes, survive normalization/renaming and preserve historical JSON', async () => {
    const h = globalSetup(noteHarness(), [{ id: 'g_topics', label: 'Global topics', type: 'multiselect', options: [] }, { id: 'g_ai', label: 'Global response', type: 'ai', prompt: 'Explain' }]);
    const topics = h.a.getGlobalFields()[0], ids = h.a.categoryIDs(topics, ['Mechanics', 'Fluids']);
    await h.c.saveValues(h.item, { g_topics: ids, g_ai: 'Generated response', manual: 'Color content' });
    await h.a._syncPaperResearchNote(h.item);
    assert.match(h.html(), /Global topics:<\/strong> Mechanics, Fluids/);
    assert.match(h.html(), /Global response:<\/strong> Generated response/);
    const before = h.disk();
    h.setHTML(h.html().replace(/<div data-ra-entry="[^"]+">/g, '').replace(/<\/div>/g, '') + '<p>User footer</p>');
    h.a.saveGlobalFields([{ ...topics, label: 'Renamed topics' }, h.a.getGlobalFields()[1]]);
    await h.a._syncPaperResearchNote(h.item);
    assert.doesNotMatch(h.html(), /<strong>Global topics:/);
    assert.match(h.html(), /Renamed topics:<\/strong> Mechanics, Fluids/);
    assert.match(h.html(), /User footer/);
    assert.deepEqual(h.disk(), before);
});

test('Global Fields preferences reuse the visual editor for renaming, adding and removing definitions', () => {
    const h = globalSetup(setup(), [{ id: 'g_original', label: 'Original', type: 'text' }]);
    const doc = document(), host = doc.createElement('div'), textarea = doc.createElement('textarea'), status = doc.createElement('div');
    doc.createElementNS = (namespace, tag) => doc.createElement(tag);
    const nodes = { 'annota-global-fields-editor': host, 'annota-global-fields': textarea, 'annota-global-fields-status': status };
    doc.getElementById = id => nodes[id] || null; doc.querySelectorAll = () => [];
    h.context.document = doc; h.context.requestAnimationFrame = () => {};
    h.context.Zotero.Annota = h.a;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'preferences.js'), 'utf8'), h.context);
    const label = doc.created.find(el => el.className === 'annota-input annota-fe-label');
    assert.ok(label); label.value = 'Renamed'; label.events.input[0]();
    assert.equal(h.a.getGlobalFields()[0].id, 'g_original');
    assert.equal(h.a.getGlobalFields()[0].label, 'Renamed');
    const add = doc.created.find(el => el.className === 'annota-button annota-fe-add');
    add.events.click[0]({ preventDefault() {} });
    assert.equal(h.a.getGlobalFields().length, 2);
    assert.ok(h.a.getGlobalFields().every(field => /^g_/.test(field.id)));
    const addedId = h.a.getGlobalFields()[1].id;
    const up = doc.created.filter(el => el.className === 'annota-fe-icon' && el.getAttribute('title') === 'fe.up').at(-1);
    up.events.click[0]({ preventDefault() {} });
    assert.equal(h.a.getGlobalFields()[0].id, addedId);
    const remove = doc.created.filter(el => el.className === 'annota-fe-icon annota-fe-del').at(-1);
    remove.events.click[0]({ preventDefault() {} });
    assert.equal(h.a.getGlobalFields().length, 1);
});

test('migration note refresh is marker-scoped and never overwrites an ordinary Zotero note', async () => {
    const h = globalSetup(setup(), [{ id: 'g_a', label: 'Shared', type: 'text' }]);
    let writes = 0;
    const ordinary = { isNote: () => true, getNote: () => '<p>Ordinary research writing</p>', saveTx: () => { writes++; } };
    const attachment = { key: 'PDFKEY', isAttachment: () => true };
    h.context.Zotero.Items.getAsync = async id => id === 8 ? attachment : ordinary;
    h.context.Zotero.Items.get = () => ordinary;
    h.context.Zotero.Search = class { addCondition() {} async search() { return [30]; } };
    await h.a._syncPaperResearchNoteNow({ libraryID: 1, parentID: 8, existingOnly: true });
    assert.equal(writes, 0);
    assert.equal(ordinary.getNote(), '<p>Ordinary research writing</p>');
});

function key(control, value) {
    const event = { key: value, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    control.events.keydown[0](event); assert.ok(event.prevented && event.stopped);
}

test('multi-select focus lists unselected field-local values and separates creation from suggestions', () => {
    const h = globalSetup(setup(), [{ id: 'g_topics', label: 'Topics', type: 'multiselect', options: ['Flow', 'FLOW', 'Rig'] }]);
    const field = h.a.getGlobalFields()[0], doc = document();
    h.a.categoryIDs({ id: 'g_other' }, ['Other field only']);
    h.a.categoryIDs(field, ['Historical']);
    const control = h.a.createMultiSelect(doc, field, h.a.categoryIDs(field, ['flow']), () => {});
    const search = control.children[1], choices = control.children[2];
    search.events.focus[0]();
    assert.deepEqual(choices.children.map(node => node.textContent), ['Historical', 'Rig']);
    assert.equal(search.getAttribute('aria-expanded'), 'true');
    search.value = 'hist'; search.events.input[0]();
    assert.equal(choices.children[0].textContent, 'Historical');
    assert.equal(choices.children[1].className, 'annota-field-create');
    search.value = 'RIG'; search.events.input[0]();
    assert.equal(choices.children.length, 1); assert.equal(choices.children[0].textContent, 'Rig');
    search.value = 'FLOW'; search.events.input[0]();
    assert.equal(choices.children[0].className, 'annota-field-empty');
    assert.ok(!choices.textContent.includes('Other field only'));
});

test('multi-select keyboard selects, creates, removes and dismisses without reader shortcuts', () => {
    const h = globalSetup(setup(), [{ id: 'g_topics', label: 'Topics', type: 'multiselect', options: ['Flow', 'Rig'] }]);
    const field = h.a.getGlobalFields()[0], control = h.a.createMultiSelect(document(), field, [], () => {});
    const search = control.children[1], choices = control.children[2];
    key(search, 'ArrowDown'); assert.equal(choices.children[0].getAttribute('aria-selected'), 'true');
    assert.equal(search.getAttribute('aria-activedescendant'), choices.children[0].id);
    key(search, 'Enter'); assert.deepEqual(clone(h.a.categoryLabels(field, control.readValues())), ['Flow']);
    search.events.focus[0](); key(search, 'ArrowUp'); key(search, 'Enter');
    assert.deepEqual(clone(h.a.categoryLabels(field, control.readValues())), ['Flow', 'Rig']);
    search.value = 'New'; search.events.input[0](); key(search, 'Enter');
    search.value = 'new'; search.events.input[0](); key(search, 'Enter');
    assert.equal(control.readValues().length, 3);
    search.events.focus[0](); key(search, 'Escape'); assert.equal(choices.hidden, true);
    assert.equal(search.getAttribute('aria-expanded'), 'false');
    assert.equal(search.getAttribute('aria-activedescendant'), null);
    const chip = control.children[0].children[0]; chip.events.click[0]({ preventDefault() {}, stopPropagation() {} });
    assert.equal(control.readValues().length, 2);
    control.setDisabled(true); control.addValue('Forbidden'); assert.equal(control.readValues().length, 2);
});

function portalSetup(topLayer = false) {
    const h = globalSetup(), doc = document(), listeners = new Map();
    const win = doc.defaultView; doc.body = doc.createElement('body');
    Object.assign(win, { innerWidth: 400, innerHeight: 300,
        getComputedStyle: () => ({ colorScheme: 'dark' }),
        addEventListener: (type, fn) => listeners.set(type, fn),
        removeEventListener: type => listeners.delete(type) });
    let disconnected = 0, observerCallback;
    win.MutationObserver = class { constructor(fn) { observerCallback = fn; } observe() {} disconnect() { disconnected++; } };
    const control = h.a.createMultiSelect(doc, { id: 'c_local', label: 'Local', options: ['Flow'] }, [], () => {});
    doc.body.appendChild(control);
    const search = control.children[1], choices = control.children[2];
    search.getBoundingClientRect = () => ({ left: 280, top: 240, bottom: 265, width: 180 });
    if (topLayer) {
        choices.matches = () => !!choices.open;
        choices.showPopover = () => { choices.open = true; };
        choices.hidePopover = () => { choices.open = false; };
    }
    return { control, search, choices, doc, listeners, observerCallback: () => observerCallback(), disconnected: () => disconnected };
}

test('multi-select fallback dropdown escapes clipping, stays in viewport and cleans up on removal', () => {
    const h = portalSetup(); h.search.events.focus[0]();
    assert.equal(h.choices.parentNode, h.doc.body);
    assert.match(h.choices.style.cssText, /position:fixed/);
    assert.match(h.choices.style.cssText, /left:212px/);
    assert.match(h.choices.style.cssText, /bottom:60px/);
    assert.equal(h.choices.style.colorScheme, 'dark');
    assert.ok(h.listeners.has('scroll'));
    h.control.isConnected = false; h.observerCallback();
    assert.equal(h.choices.parentNode, h.control); assert.equal(h.choices.hidden, true);
    assert.equal(h.listeners.size, 0); assert.equal(h.disconnected(), 1);
});

test('multi-select top-layer dropdown retains popup ownership and dismisses on Escape/blur/scroll', () => {
    const h = portalSetup(true); h.search.events.focus[0]();
    assert.equal(h.choices.parentNode, h.control); assert.equal(h.choices.open, true);
    key(h.search, 'Escape'); assert.equal(h.choices.open, false);
    h.search.events.focus[0](); h.search.events.blur[0]({ relatedTarget: null }); assert.equal(h.choices.hidden, true);
    h.search.events.focus[0](); h.listeners.get('scroll')({ target: h.choices }); assert.equal(h.choices.hidden, false);
    h.listeners.get('scroll')({ target: h.doc.body }); assert.equal(h.choices.hidden, true);
    assert.equal(h.listeners.size, 0);
});

test('creation retains native tag capture without dedicated research comment or category inputs', async () => {
    const h = globalSetup(), doc = document(), popup = doc.createElement('div'), colors = doc.createElement('div');
    const parent = { insertBefore(el) { this.inserted = el; } }; colors.parentNode = parent;
    doc.querySelector = () => popup; popup.querySelector = selector => selector === '.colors' ? colors : null;
    h.a._renderResearchCapture({ doc, params: { annotation: { text: h.item.annotationText } } });
    const tags = doc.created.find(el => el.className === 'annota-research-tags');
    assert.ok(tags); assert.equal(doc.created.filter(el => el.className === 'annota-native-comment-input').length, 1);
    assert.ok(!doc.created.some(el => /annota-research-(themes|experiments|comment)/.test(el.className || '')));
    tags.value = 'Native tag'; tags.events.input[0]();
    h.item.addTag = tag => assert.equal(tag, 'Native tag'); h.item.saveTx = async () => {};
    await h.a.handleResearchMetadata(h.item.id);
    assert.equal(h.item.annotationComment, 'Native comment stays exactly as typed');
    assert.equal(h.a._pendingResearch, null);
});

test('existing popup keeps native Comment and uses only configurable category interfaces', async () => {
    const h = globalSetup(setup(), [{ id: 'g_topics', label: 'Topics', type: 'multiselect' }]), doc = document();
    const popup = doc.createElement('div'), nativeComment = doc.createElement('textarea');
    popup.querySelector = selector => selector === '.preview > .comment' ? nativeComment : null;
    h.a._renderExistingAnnotationResearch({ doc, popup, annotation: { id: h.item.key, libraryID: 1 }, reader: {} });
    await nextTurn(); assert.equal(nativeComment.style.display, '');
    assert.equal(doc.created.filter(el => el.className === 'annota-research-field').length, 0);
    assert.equal(doc.created.filter(el => el.className === 'annota-multiselect').length, 1);
});

test('historical comments migrate to configurable globals without mutating original metadata or native Comment', async () => {
    const h = migrationSetup();
    h.current.annotations['1:ABC'].researchComment = 'Saved comment';
    h.legacy.annotations['1:ABC'].researchComment = 'Older comment';
    const original = clone([h.current, h.legacy]);
    await h.a.migrateLegacyGlobalFields();
    const field = h.a.getGlobalFields().find(f => f.legacyKey === 'researchComment');
    assert.equal(field.type, 'textarea'); assert.equal(h.c.get(h.item).values[field.name], 'Saved comment\n\nOlder comment');
    assert.equal(h.item.annotationComment, 'Native comment stays exactly as typed');
    assert.deepEqual(clone([h.current, h.legacy]), original);
    await h.c.saveValues(h.item, { [field.name]: '' }); await h.a.migrateLegacyGlobalFields();
    assert.equal(h.c.get(h.item).values[field.name], '');
    h.a.saveGlobalFields(h.a.getGlobalFields().filter(f => f.id !== field.id));
    await h.a.migrateLegacyGlobalFields(); assert.ok(!h.a.getGlobalFields().some(f => f.id === field.id));
    assert.equal(h.a.globalFieldConfig().archivedFields.find(f => f.id === field.id).legacyKey, 'researchComment');
});

test('historical comment migration failure retains sources and old migration API delegates without deleting metadata', async () => {
    const h = migrationSetup(); h.legacy.annotations['1:ABC'].researchComment = 'Keep historical';
    const writer = h.context.IOUtils.writeJSON; h.context.IOUtils.writeJSON = async () => { throw Error('Disk full'); };
    await assert.rejects(h.a._migrateResearchMetadataToTags(1), /original metadata preserved/);
    assert.equal(h.legacy.annotations['1:ABC'].researchComment, 'Keep historical');
    assert.equal(h.item.annotationComment, 'Native comment stays exactly as typed');
    h.context.IOUtils.writeJSON = writer;
    const result = await h.a._migrateResearchMetadataToTags(1);
    assert.equal(result.legacyMetadataPreserved, true);
    const field = h.a.getGlobalFields().find(f => f.legacyKey === 'researchComment');
    assert.equal(h.c.get(h.item).values[field.name], 'Keep historical');
});

test('Global Fields preferences immediately follow Highlight Colors with matching card styling', () => {
    const xml = fs.readFileSync(path.join(__dirname, '..', 'preferences.xhtml'), 'utf8');
    const section = xml.match(/<html:section class="annota-card" id="annota-highlight-colors-section">[\s\S]*?<\/html:section>\s*<html:section class="annota-card">\s*<html:h3 class="annota-card-title">Global Fields<\/html:h3>/);
    assert.ok(section); assert.equal((xml.match(/id="annota-global-fields-editor"/g) || []).length, 1);
});

test('note synchronization does not migrate historical comments into native Comment or erase metadata', async () => {
    const h = setup(); let html = '<h1>Research note</h1>';
    const saved = { researchComment: 'Historical', themes: [], experiments: [] };
    const note = { key: 'NOTE', libraryID: 1, getNote: () => html, setNote: value => { html = value; }, saveTx: async () => {} };
    h.a._getOrCreatePaperResearchNote = async () => ({ note });
    h.a._getResearchMetadata = async () => ({ annotations: { '1:ABC': saved } });
    h.a._updateResearchMetadata = async () => { throw Error('Renderer must not rewrite metadata'); };
    h.context.Zotero.Search = class { addCondition() {} async search() { return [7]; } };
    h.context.Zotero.Libraries = { get: () => ({}) };
    h.context.Zotero.Items.getAsync = async id => id === 8 ? { key: 'PDF', isAttachment: () => true } : h.item;
    h.item.annotationComment = ''; h.item.saveTx = async () => { throw Error('Must not save Comment'); };
    await h.a._syncPaperResearchNoteNow(h.item);
    assert.equal(h.item.annotationComment, ''); assert.equal(saved.researchComment, 'Historical');
});

function milestoneSetup() {
    const h = globalSetup();
    h.item.key = 'ANNKEY01'; h.item.annotationComment = '';
    const library = { libraryID: 1, libraryType: 'user', editable: true, name: 'Development' };
    const parent = { id: 8, key: 'PDFKEY01', isAttachment: () => true };
    h.context.URL = URL;
    h.context.Cu = { cloneInto: clone };
    h.context.Zotero.Users = { getCurrentUserID: () => 1234 };
    h.context.Zotero.Libraries = { getAll: () => [library], get: id => id === library.libraryID ? library : null };
    h.context.Zotero.Items.getByLibraryAndKey = (id, key) => id === library.libraryID && key === h.item.key ? h.item : null;
    h.context.Zotero.Items.getAsync = async id => id === 8 ? parent : h.item;
    h.context.Zotero.Prefs.clear = key => h.prefs.delete(key);
    h.a._getAllResearchAnnotations = async () => [h.item];
    h.a._getResearchMetadata = async () => ({ themes: [], experiments: [], annotations: {} });
    h.a._findResearchMetadataNote = async () => null;
    h.a.getColorEntry = h.realGetColorEntry;
    h.prefs.set('researchannotator.colorPrompts', JSON.stringify({ '#ffd400': { fields: schema, prompt: '', template: '', trigger: 'auto' } }));
    const files = new Map(), realWrite = h.context.IOUtils.writeJSON;
    h.context.IOUtils.writeJSON = async (path, value, options) => {
        if (path === h.c.file()) return realWrite(path, value, options);
        files.set(path, clone(value));
    };
    h.context.IOUtils.makeDirectory = async () => {};
    for (const file of ['palette.js', 'data-manager.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), h.context);
    const palette = h.context.AnnotaPalette, data = h.context.AnnotaData;
    palette.ensure();
    return { ...h, palette, data, library, parent, files };
}

test('native creation Comment is saved only to the matching attachment and remains independent of AI/global fields', async () => {
    const h = milestoneSetup();
    h.a._nativeCommentDrafts = new Map([['8/' + h.a._normText(h.item.annotationText), { value: 'Native draft', ts: Date.now(), attachmentID: 8 }]]);
    h.item.saveTx = async () => {};
    h.item.parentID = 99; await h.a.handleResearchMetadata(h.item.id); assert.equal(h.item.annotationComment, '');
    h.item.parentID = 8; await h.a.handleResearchMetadata(h.item.id); assert.equal(h.item.annotationComment, 'Native draft');
    assert.equal(h.a._nativeCommentDrafts.size, 0);
    await h.c.saveValues(h.item, { manual: 'Separate' }); h.a.generateComment = async () => 'AI content';
    await h.a.generateStructuredFields(h.item);
    assert.equal(h.item.annotationComment, 'Native draft'); assert.equal(h.c.get(h.item).values.manual, 'Separate');
});

test('native creation Comment preserves existing comments and retains a draft when saving fails', async () => {
    const h = milestoneSetup(), key = '8/' + h.a._normText(h.item.annotationText);
    h.a._nativeCommentDrafts = new Map([[key, { value: 'New native draft', ts: Date.now() }]]);
    h.item.annotationComment = 'Already saved'; await h.a.handleResearchMetadata(7);
    assert.equal(h.item.annotationComment, 'Already saved');
    h.item.annotationComment = ''; h.item.saveTx = async () => { throw Error('Write failed'); };
    await assert.rejects(h.a.handleResearchMetadata(7), /Write failed/);
    assert.equal(h.item.annotationComment, ''); assert.ok(h.a._nativeCommentDrafts.has(key));
});

test('palette migration freezes field IDs and retains original hex records alongside stable color identities', async () => {
    const h = milestoneSetup(), color = h.palette.resolve('#ffd400');
    await h.c.saveValues(h.item, { manual: 'Keep', summary: 'Saved AI' });
    await h.palette.migrateStorage();
    const record = h.disk().annotations['1/ANNKEY01'];
    assert.equal(record.colors['#ffd400'].values.manual, 'Keep');
    assert.equal(record.colorConfigs[color.id].values.summary, 'Saved AI');
    const id = h.a.fieldsForColor('#ffd400')[0].id;
    await h.palette.update(color.id, { hex: '#123456', label: 'Method' }, 'keep');
    assert.equal(h.a.fieldsForColor('#123456')[0].id, id);
    assert.equal(h.c.get(h.item).values.manual, 'Keep');
    h.item.annotationColor = '#123456'; assert.equal(h.c.get(h.item).values.summary, 'Saved AI');
    await h.c.saveValues(h.item, { manual: 'Edited' }); h.item.annotationColor = '#ffd400';
    assert.equal(h.c.get(h.item).values.manual, 'Edited');
    assert.equal(h.disk().annotations['1/ANNKEY01'].colors['#ffd400'].values.manual, 'Keep');
});

test('palette changes require explicit existing-highlight handling and transactionally recolor without losing data', async () => {
    const h = milestoneSetup(), color = h.palette.resolve('#ffd400');
    await h.c.saveValues(h.item, { manual: 'Preserved' });
    await assert.rejects(h.palette.update(color.id, { hex: '#123456' }), /Choose whether/);
    assert.equal(h.item.annotationColor, '#ffd400');
    let transactions = 0; h.context.Zotero.DB = { executeTransaction: async fn => { transactions++; await fn(); } };
    h.item.save = async () => {};
    await h.palette.update(color.id, { hex: '#123456' }, 'recolor');
    assert.equal(transactions, 1); assert.equal(h.item.annotationColor, '#123456');
    assert.equal(h.c.get(h.item).values.manual, 'Preserved');
});

test('failed/read-only palette recoloring preserves settings and annotation colors', async () => {
    const h = milestoneSetup(), color = h.palette.resolve('#ffd400'), before = h.prefs.get(h.palette.pref);
    h.item.library.editable = false;
    await assert.rejects(h.palette.update(color.id, { hex: '#123456' }, 'recolor'), /read-only/);
    h.item.library.editable = true;
    h.context.Zotero.DB = { executeTransaction: fn => fn() }; h.item.save = async () => { throw Error('DB failure'); };
    await assert.rejects(h.palette.update(color.id, { hex: '#123456' }, 'recolor'), /DB failure/);
    assert.equal(h.prefs.get(h.palette.pref), before); assert.equal(h.item.annotationColor, '#ffd400');
});

test('palette add, rename, reorder and archive preserve stable IDs/configurations and reject duplicate hex aliases', async () => {
    const h = milestoneSetup(), color = h.palette.resolve('#ffd400');
    const created = h.palette.add('#123456', 'New semantic label');
    h.palette.move(created.id, -1); assert.equal(h.palette.ensure().colors.at(-2).id, created.id);
    await h.palette.update(color.id, { archived: true, label: 'Archived method' }, 'keep');
    assert.ok(!h.a.COLORS.some(c => c.id === color.id));
    assert.ok(h.a.getColorEntry('#ffd400').fields.includes('manual'));
    await h.palette.update(color.id, { archived: false }, 'keep');
    assert.equal(h.palette.resolve('#ffd400').id, color.id); assert.equal(h.a.getColorLabels()['#ffd400'], 'Archived method');
    assert.throws(() => h.palette.add('#123456', 'Duplicate'), /multiple configurations/);
});

test('all palette presets retain definitions, annotation assignments, saved values and identities', async () => {
    const h = milestoneSetup(), original = h.palette.resolve('#ffd400');
    await h.c.saveValues(h.item, { manual: 'Historical manual', summary: 'Historical AI' });
    for (const name of ['accessible', 'pastel', 'custom', 'default']) {
        await h.palette.preset(name);
        assert.equal(h.item.annotationColor, '#ffd400');
        assert.equal(h.c.get(h.item).values.summary, 'Historical AI');
        assert.ok(h.palette.resolve(original.id).configs.text.fields.includes('manual'));
        assert.equal(h.palette.resolve('#ffd400').id, original.id);
    }
    assert.equal(h.a.COLORS.length, 8);
});

test('accessible palette buttons have semantic labels, selected marks and high-contrast text', async () => {
    const h = milestoneSetup(); await h.palette.preset('accessible');
    const doc = document(), color = h.a.COLORS[0], button = doc.createElement('button');
    h.palette.styleButton(button, color, true);
    assert.match(button.textContent, /Color 1/); assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.match(button.title, /#e69f00/);
    assert.equal(h.palette.textColor('#000000'), '#ffffff'); assert.equal(h.palette.textColor('#ffffff'), '#000000');
});

test('custom creation uses guarded reader annotation creation with native Comment and prevents repeated clicks', () => {
    const h = milestoneSetup(), doc = document(), popup = doc.createElement('div'), native = doc.createElement('div');
    doc.querySelector = () => popup; popup.querySelector = selector => selector === '.colors' ? native : null;
    let picker, calls = 0, annotation;
    native.insertAdjacentElement = (_, node) => { picker = node; };
    const reader = { itemID: 8, _iframeWindow: {}, _internalReader: { _state: { textSelectionAnnotationMode: 'underline' },
        _annotationManager: { addAnnotation(value) { calls++; annotation = clone(value); return { id: 'NEWKEY01' }; } }, setSelectedAnnotations() {} } };
    h.a._nativeCommentDrafts = new Map([['8/' + h.a._normText(h.item.annotationText), { value: 'Before saving' }]]);
    h.palette.renderSelection({ doc, reader, params: { annotation: { text: h.item.annotationText, sortIndex: '0001', position: {} } } });
    const event = { preventDefault() {}, stopPropagation() {} };
    picker.children[0].events.click[0](event); picker.children[0].events.click[0](event);
    assert.equal(calls, 1); assert.equal(annotation.comment, 'Before saving'); assert.equal(annotation.type, 'underline');
    assert.equal(native.style.display, 'none');
});

test('unsupported reader retains native palette instead of hiding highlight creation', () => {
    const h = milestoneSetup(), doc = document(), popup = doc.createElement('div'), native = doc.createElement('div');
    doc.querySelector = () => popup; popup.querySelector = () => native;
    h.palette.renderSelection({ doc, reader: {}, params: { annotation: {} } });
    assert.equal(native.style.display, undefined);
});

test('settings exports include stable IDs, all configured portable types and exclude credentials/local paths', async () => {
    const h = milestoneSetup();
    h.prefs.set('researchannotator.apiKey', 'super-secret-key'); h.prefs.set('researchannotator.cliPath', 'C:/private/tool');
    h.prefs.set('researchannotator.provider', 'openai'); h.prefs.set('researchannotator.model', 'chosen-model');
    h.prefs.set('researchannotator.endpoint', 'https://username:password@example.org/v1?api_key=super-secret-key&mode=test');
    h.prefs.set('researchannotator.chatInstructions', 'Do not echo super-secret-key');
    const exported = await h.data.export('settings'), text = JSON.stringify(exported);
    assert.equal(exported.settings.prefs.model, 'chosen-model'); assert.ok(exported.settings.prefs.palette.colors[0].id.startsWith('p_'));
    assert.ok(!text.includes('super-secret-key')); assert.ok(!text.includes('C:/private/tool')); assert.ok(!text.includes('username:password'));
    assert.equal(exported.credentialsIncluded, false); assert.equal(exported.version, 1);
});

test('research export includes global/category identities, AI metadata, history and generation state', async () => {
    const h = milestoneSetup(); h.a.saveGlobalFields([{ id: 'g_topic', label: 'Topic', type: 'multiselect', options: [] }]);
    const category = h.a.categoryIDs(h.a.getGlobalFields()[0], ['Mechanics']);
    await h.c.saveValues(h.item, { g_topic: category, summary: 'Saved generated value' }, undefined, undefined, { [h.a.fieldsForColor('#ffd400').find(f => f.name === 'summary').id]: { prompt: 'Summarize', generatedAt: 'today' } });
    h.c.setFieldState(h.item, h.a.annotationFields('#ffd400').find(f => f.name === 'summary'), { error: 'Provider failed' });
    h.a._getResearchMetadata = async () => ({ themes: ['Legacy'], experiments: [], annotations: { '1:ANNKEY01': { themes: ['Legacy'] } } });
    const result = await h.data.export('research'), record = result.research.records[0];
    assert.deepEqual(clone(record.library), { type: 'user', id: '1234' }); assert.equal(record.parentKey, 'PDFKEY01');
    assert.equal(record.record.colors['#ffd400'].values.summary, 'Saved generated value');
    assert.ok(Object.keys(record.record.aiMetadata).length); assert.ok(Object.keys(record.generationStatus.fields).length);
    assert.equal(result.research.definitions.fieldCategories.g_topic[category[0]], 'Mechanics');
    assert.equal(result.research.historicalLibraries[0].current.themes[0], 'Legacy');
});

test('portable data resolves the same Zotero user/group identity across different local numeric library IDs', async () => {
    const h = milestoneSetup(); await h.c.saveValues(h.item, { manual: 'Cross-device data' });
    const exported = await h.data.export('research');
    h.library.libraryID = 91; h.item.libraryID = 91;
    const plan = await h.data.preview(exported);
    assert.equal(plan.matched[0].key, '91/ANNKEY01'); assert.equal(plan.unmatched.length, 0);
    assert.equal(plan.nextStore['91/ANNKEY01'].colors['#ffd400'].values.manual, 'Cross-device data');
});

test('foreign/local libraries, wrong parents and changed text are reported unmatched rather than guessed', async () => {
    const h = milestoneSetup(); await h.c.saveValues(h.item, { manual: 'Source' });
    const exported = await h.data.export('research');
    exported.research.records[0].library = { type: 'local', id: 'another-installation' };
    let plan = await h.data.preview(exported); assert.equal(plan.matched.length, 0); assert.equal(plan.unmatched.length, 1);
    plan = await h.data.preview(exported, { mapping: { 'local:another-installation': 1 } }); assert.equal(plan.matched.length, 1);
    exported.research.records[0].parentKey = 'WRONGPDF';
    plan = await h.data.preview(exported, { mapping: { 'local:another-installation': 1 } }); assert.equal(plan.matched.length, 0);
    exported.research.records[0].parentKey = 'PDFKEY01'; exported.research.records[0].text = 'Different passage';
    plan = await h.data.preview(exported, { mapping: { 'local:another-installation': 1 } }); assert.equal(plan.matched.length, 0);
});

test('settings/data merges preview conflicts, preserve existing values and never touch native Comment', async () => {
    const h = milestoneSetup(); h.item.annotationComment = 'Native comment';
    await h.c.saveValues(h.item, { manual: 'Original', summary: 'Saved AI' });
    const exported = await h.data.export('backup');
    exported.research.records[0].record.colors['#ffd400'].values.manual = 'Imported';
    const manualID = h.a.fieldsForColor('#ffd400').find(f => f.name === 'manual').id;
    exported.research.records[0].record.colors['#ffd400'].valuesByID[manualID] = 'Imported';
    exported.research.records[0].record.colorConfigs[h.palette.resolve('#ffd400').id].values.manual = 'Imported';
    exported.research.records[0].record.colorConfigs[h.palette.resolve('#ffd400').id].valuesByID[manualID] = 'Imported';
    let plan = await h.data.preview(exported, { conflict: 'keep' }); assert.ok(plan.conflicts.length >= 2);
    const result = await h.data.apply(plan);
    assert.equal(h.c.get(h.item).values.manual, 'Original'); assert.equal(h.item.annotationComment, 'Native comment');
    assert.ok(h.files.has(result.backupPath)); assert.ok(h.files.has(result.backupPath + '.received.json'));
    plan = await h.data.preview(exported, { conflict: 'incoming' }); await h.data.apply(plan);
    assert.equal(h.c.get(h.item).values.manual, 'Imported'); assert.equal(h.c.get(h.item).values.summary, 'Saved AI');
    assert.equal(h.item.annotationComment, 'Native comment');
});

test('repeated import does not duplicate definitions, category identities or annotation records', async () => {
    const h = milestoneSetup(); await h.c.saveValues(h.item, { manual: 'Preserve' });
    const exported = await h.data.export('backup');
    await h.data.apply(await h.data.preview(exported)); await h.data.apply(await h.data.preview(exported));
    assert.equal(Object.keys(h.c._store).length, 1);
    assert.equal(new Set(h.palette.ensure().colors.map(c => c.id)).size, h.palette.ensure().colors.length);
});

test('explicit replacement backs up old settings and replaces only matching records, preserving credentials and unmatched data', async () => {
    const h = milestoneSetup(); await h.c.saveValues(h.item, { manual: 'Before' });
    h.prefs.set('researchannotator.model', 'old-model'); h.prefs.set('researchannotator.apiKey', 'keep-credential');
    const exported = await h.data.export('backup'); exported.settings.prefs.model = 'new-model';
    h.c._store['1/ORPHAN01'] = { version: 2, colors: { '#ffd400': { values: { manual: 'Unmatched local' } } } };
    const plan = await h.data.preview(exported, { mode: 'replace', conflict: 'incoming' }), result = await h.data.apply(plan);
    assert.equal(h.prefs.get('researchannotator.model'), 'new-model'); assert.equal(h.prefs.get('researchannotator.apiKey'), 'keep-credential');
    assert.equal(h.c._store['1/ORPHAN01'].colors['#ffd400'].values.manual, 'Unmatched local');
    assert.equal(h.files.get(result.backupPath).settings.prefs.model, 'old-model');
});

test('failed automatic pre-import backup makes no changes and does not clear credentials', async () => {
    const h = milestoneSetup(); await h.c.saveValues(h.item, { manual: 'Before' });
    const exported = await h.data.export('settings'); exported.settings.prefs.model = 'Incoming';
    const plan = await h.data.preview(exported), before = clone(h.c._store), prefsBefore = [...h.prefs];
    h.context.IOUtils.makeDirectory = async () => { throw Error('Backup unavailable'); };
    await assert.rejects(h.data.apply(plan), /Backup unavailable/);
    assert.deepEqual(clone(h.c._store), before); assert.deepEqual([...h.prefs], prefsBefore);
    assert.equal(h.c._maintenance, false);
});

test('failed import persistence rolls back extension state and retains the pre-import backup', async () => {
    const h = milestoneSetup(); await h.c.saveValues(h.item, { manual: 'Before' });
    const exported = await h.data.export('settings'); exported.settings.prefs.model = 'Incoming';
    const plan = await h.data.preview(exported), writer = h.context.IOUtils.writeJSON, before = clone(h.c._store); let failed = false;
    h.context.IOUtils.writeJSON = async (path, data, opts) => { if (path === h.c.file() && !failed) { failed = true; throw Error('Disk failure'); } return writer(path, data, opts); };
    await assert.rejects(h.data.apply(plan), /Disk failure.*Pre-import backup/s);
    assert.deepEqual(clone(h.c._store), before); assert.equal(h.prefs.get('researchannotator.model'), undefined);
    assert.ok(h.files.size >= 2); assert.equal(h.c._maintenance, false);
});

test('stale previews, active AI and abort-on-conflict imports cannot mutate state', async () => {
    const h = milestoneSetup(); await h.c.saveValues(h.item, { manual: 'Before' });
    const exported = await h.data.export('research'), plan = await h.data.preview(exported);
    await h.c.saveValues(h.item, { manual: 'Concurrent edit' });
    await assert.rejects(h.data.apply(plan), /Data changed since preview/);
    const fresh = await h.data.preview(exported, { conflict: 'abort' });
    await assert.rejects(h.data.apply(fresh), /Import has conflicts/);
    h.a._fieldRequests = new Set(['active']); await assert.rejects(h.data.apply(fresh), /Finish active AI/);
    assert.equal(h.c.get(h.item).values.manual, 'Concurrent edit');
});

test('malformed, unsafe, duplicate, future-version and credential-bearing imports are rejected before writes', async () => {
    const h = milestoneSetup(); await h.c.saveValues(h.item, { manual: 'Before' });
    const good = await h.data.export('backup');
    const corruptions = [doc => { doc.version = 999; }, doc => { doc.settings.prefs.apiKey = 'bad'; },
        doc => { doc.settings.prefs.cardFields = 'not a boolean'; },
        doc => { doc.research.records.push(clone(doc.research.records[0])); },
        doc => { doc.research.records[0].record.colors['#ffd400'].values.manual = { invalid: true }; },
        doc => { doc.research.records[0].parentKey = 'bad'; }];
    for (const corrupt of corruptions) { const bad = clone(good); corrupt(bad); await assert.rejects(h.data.preview(bad)); }
    assert.throws(() => h.data.validate(JSON.parse('{"__proto__":{"danger":true}}')), /Unsafe/);
    assert.equal(h.c.get(h.item).values.manual, 'Before'); assert.equal(h.files.size, 0);
});

test('portable chat collection scopes use account/group identities and preserve collection keys', async () => {
    const h = milestoneSetup(); h.prefs.set('researchannotator.chatCollections', JSON.stringify({ 1: { keys: ['COLLKEY1'], sub: true } }));
    const exported = await h.data.export('settings');
    assert.equal(exported.settings.prefs.chatCollections[0].library.id, '1234');
    h.library.libraryID = 72; h.item.libraryID = 72;
    h.prefs.delete('researchannotator.chatCollections');
    await h.data.apply(await h.data.preview(exported, { conflict: 'incoming' }));
    assert.deepEqual(JSON.parse(h.prefs.get('researchannotator.chatCollections')), { 72: { keys: ['COLLKEY1'], sub: true } });
});

test('shared annotation layout is compact, scrollable, uses the same field containers and keeps retry under AI', () => {
    const h = milestoneSetup(), doc = document(); h.a._ensureAnnotationInterfaceStyles(doc);
    const style = doc.created.find(node => node.id === 'annota-interface-style').textContent;
    assert.match(style, /\.selection-popup,\.annotation-popup/); assert.match(style, /max-height:75vh!important/); assert.match(style, /overflow:auto!important/);
    const row = doc.createElement('div'); h.a._styleStructuredField(row, h.a.annotationFields('#ffd400')[0]);
    assert.ok(row.classList.contains('annota-structured-field'));
});

test('interrupted import recovers the original local store/preferences from its journal without provider or Zotero item writes', async () => {
    const h = milestoneSetup(); await h.c.saveValues(h.item, { manual: 'Before interruption', summary: 'Keep saved AI' });
    h.prefs.set('researchannotator.model', 'original-model');
    const original = clone(h.c._store), rawPrefs = Object.fromEntries(h.data.keys.map(key => [key, h.prefs.get('researchannotator.' + key)]));
    const journal = { format: 'ResearchAnnotator-local-import-journal', version: 1, phase: 'pending', deviceID: h.data.deviceID(),
        store: original, prefs: h.data.journalPreferences(rawPrefs), backupPath: '/test-only/backup.json' };
    h.files.set(h.data.journalPath(), journal);
    h.context.IOUtils.exists = async path => h.files.has(path);
    h.context.IOUtils.readJSON = async path => clone(h.files.get(path));
    h.c._store = {}; h.prefs.set('researchannotator.model', 'partially-imported');
    h.a.generateComment = async () => { throw Error('Must not call AI'); };
    h.item.saveTx = async () => { throw Error('Must not modify Zotero'); };
    assert.equal(await h.data.recoverPendingImport(), true);
    assert.equal(h.c.get(h.item).values.manual, 'Before interruption'); assert.equal(h.c.get(h.item).values.summary, 'Keep saved AI');
    assert.equal(h.prefs.get('researchannotator.model'), 'original-model');
    assert.equal(h.files.get(h.data.journalPath()).phase, 'recovered'); assert.equal(h.c._maintenance, false);
});

test('unrecoverable import write/rollback leaves a pending journal and blocks subsequent edits/imports', async () => {
    const h = milestoneSetup(); await h.c.saveValues(h.item, { manual: 'Recoverable original' });
    const plan = await h.data.preview(await h.data.export('settings'));
    const writer = h.context.IOUtils.writeJSON;
    h.context.IOUtils.writeJSON = async (path, value, options) => {
        if (path === h.c.file()) throw Error('Persistent disk failure'); return writer(path, value, options);
    };
    await assert.rejects(h.data.apply(plan), /Persistent disk failure/);
    assert.equal(h.files.get(h.data.journalPath()).phase, 'pending'); assert.equal(h.c._maintenance, true);
    await assert.rejects(h.c.saveValues(h.item, { manual: 'Unsafe edit' }), /import is in progress/);
    await assert.rejects(h.data.apply(plan), /Finish interrupted-import recovery/);
    h.context.IOUtils.writeJSON = writer;
    h.context.IOUtils.exists = async path => h.files.has(path);
    h.context.IOUtils.readJSON = async path => clone(h.files.get(path));
    await h.data.recoverPendingImport(); assert.equal(h.c.get(h.item).values.manual, 'Recoverable original');
});

test('restored running generation becomes retryable rather than restarting requests or staying Generating', async () => {
    const h = milestoneSetup(); await h.c.saveValues(h.item, { manual: 'Keep manual' });
    const field = h.a.annotationFields('#ffd400').find(f => f.name === 'summary');
    h.c.setFieldState(h.item, field, { running: true });
    const exported = await h.data.export('backup'); h.c._fieldGenerationStates.clear();
    const plan = await h.data.preview(exported); await h.data.apply(plan);
    const state = h.c.fieldState(h.item, field);
    assert.equal(state.running, false); assert.match(state.error, /interrupted/);
    assert.equal(h.c.get(h.item).values.manual, 'Keep manual'); assert.equal(h.data._requests || 0, 0);
});

test('data-only replacement imports on a new installation with different palette IDs and preserves unrelated settings', async () => {
    const source = milestoneSetup(); await source.c.saveValues(source.item, { manual: 'Portable manual', summary: 'Portable AI' });
    const exported = await source.data.export('research'), target = milestoneSetup();
    target.prefs.set('researchannotator.model', 'local-model'); target.library.libraryID = 88; target.item.libraryID = 88;
    const plan = await target.data.preview(exported, { mode: 'replace', conflict: 'incoming' });
    assert.equal(plan.matched[0].key, '88/ANNKEY01'); await target.data.apply(plan);
    assert.equal(target.c.get(target.item).values.manual, 'Portable manual'); assert.equal(target.c.get(target.item).values.summary, 'Portable AI');
    assert.equal(target.prefs.get('researchannotator.model'), 'local-model');
    assert.equal(target.palette.resolve('#ffd400').id, source.palette.resolve('#ffd400').id);
});

test('group-library portability matches stable group IDs instead of unrelated numeric library IDs', async () => {
    const source = milestoneSetup(); source.library.libraryType = 'group'; source.library.libraryTypeID = 98765;
    await source.c.saveValues(source.item, { manual: 'Group evidence' });
    const exported = await source.data.export('backup');
    const target = milestoneSetup(); target.library.libraryType = 'group'; target.library.libraryTypeID = 98765;
    target.library.libraryID = 44; target.item.libraryID = 44;
    await target.data.apply(await target.data.preview(exported, { mode: 'replace', conflict: 'incoming' }));
    assert.equal(target.c.get(target.item).values.manual, 'Group evidence');
    target.library.libraryTypeID = 11111;
    assert.equal((await target.data.preview(exported)).matched.length, 0);
});

test('settings round-trip preserves global/color field definitions, order, category IDs and saved values without duplicating IDs', async () => {
    const h = milestoneSetup();
    h.a.saveGlobalFields([{ id: 'g_b', label: 'Topics', type: 'multiselect', options: ['Flow'] }, { id: 'g_a', label: 'Verified', type: 'check' }]);
    const ids = h.a.categoryIDs(h.a.getGlobalFields()[0], ['Flow', 'Rig']); await h.c.saveValues(h.item, { g_b: ids, g_a: 'true', manual: 'Keep' });
    const exported = await h.data.export('settings'), before = clone(exported.settings.prefs);
    h.a.saveGlobalFields([]);
    await h.data.apply(await h.data.preview(exported, { mode: 'replace', conflict: 'incoming' }));
    assert.deepEqual(clone(h.a.getGlobalFields().map(f => f.id)), ['g_b', 'g_a']);
    assert.deepEqual(clone(h.data.settings().prefs), before);
    assert.equal(h.c.get(h.item).values.manual, 'Keep'); assert.deepEqual(clone(h.c.get(h.item).values.g_b), clone(ids));
});

test('scientific structured fields named token/password survive exports without exposing actual configured credentials', async () => {
    const h = milestoneSetup(); h.prefs.set('researchannotator.apiKey', 'actual-private-credential');
    await h.c.saveValues(h.item, { token: 'Physical token count', password: 'Discussed in a paper', sampleCount: 42, manual: 'actual-private-credential' });
    const exported = await h.data.export('backup'), values = exported.research.records[0].record.colors['#ffd400'].values;
    assert.equal(values.token, 'Physical token count'); assert.equal(values.password, 'Discussed in a paper');
    assert.equal(values.sampleCount, 42);
    assert.equal(values.manual, '[credential omitted]');
});

test('Data Management renders all six controls, previews a file and applies only the reviewed import', async () => {
    const h = milestoneSetup(), doc = document(), nodes = {};
    const names = ['annota-palette-editor', 'annota-data-actions', 'annota-data-file', 'annota-data-import', 'annota-data-mode', 'annota-data-conflict',
        'annota-data-preview-text', 'annota-data-apply', 'annota-data-libraries', 'annota-data-status', 'annota-data-preview'];
    for (const name of names) nodes[name] = doc.createElement('div');
    doc.getElementById = id => nodes[id] || doc.created.find(node => node.id === id) || null;
    doc.createElementNS = (_, tag) => doc.createElement(tag);
    doc.defaultView.Event = class { constructor(type) { this.type = type; } };
    doc.dispatchEvent = () => {}; h.context.requestAnimationFrame = () => {}; h.context.document = doc;
    h.context.Zotero.Annota = h.a;
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'preferences-data.js'), 'utf8'), h.context);
    const actions = nodes['annota-data-actions'].children;
    assert.deepEqual(actions.map(node => node.textContent), ['Export Settings', 'Import Settings', 'Export Research Data', 'Import Research Data', 'Create Complete Backup', 'Restore Complete Backup']);
    const payload = await h.data.export('settings'); payload.settings.prefs.model = 'Imported through UI';
    nodes['annota-data-file'].click = () => {};
    await actions[1].events.click[0]();
    nodes['annota-data-file'].files = [{ size: 1024, text: async () => JSON.stringify(payload) }];
    await nodes['annota-data-file'].events.change[0]();
    nodes['annota-data-mode'].value = 'merge'; nodes['annota-data-conflict'].value = 'incoming';
    await nodes['annota-data-preview'].events.click[0]();
    assert.equal(h.prefs.get('researchannotator.model'), undefined);
    assert.match(nodes['annota-data-preview-text'].textContent, /settingsChanges/);
    assert.equal(nodes['annota-data-apply'].disabled, false);
    await nodes['annota-data-apply'].events.click[0]();
    assert.equal(h.prefs.get('researchannotator.model'), 'Imported through UI');
    assert.equal(nodes['annota-data-apply'].disabled, true);
});

test('native Comment capture restores typed text on popup redraw and saves it without dedicated research controls', async () => {
    const h = milestoneSetup(), doc = document(), popup = doc.createElement('div'), colors = doc.createElement('div');
    colors.parentNode = { insertBefore() {} };
    popup.querySelector = selector => selector === '.colors' ? colors : null; doc.querySelector = () => popup;
    const event = { doc, reader: { itemID: 8 }, params: { annotation: { text: h.item.annotationText } } };
    h.a._renderResearchCapture(event);
    const native = doc.created.find(node => node.className === 'annota-native-comment-input');
    native.value = 'Typed before saving'; native.events.input[0](); h.a._renderResearchCapture(event);
    const redrawn = doc.created.filter(node => node.className === 'annota-native-comment-input').at(-1);
    assert.equal(redrawn.value, 'Typed before saving'); h.item.saveTx = async () => {};
    await h.a.handleResearchMetadata(h.item.id); assert.equal(h.item.annotationComment, 'Typed before saving');
    assert.ok(!doc.created.some(node => /annota-research-(themes|experiments|comment)/.test(node.className || '')));
});

test('new custom-color fields retain stable IDs and categorical values when their hex changes', async () => {
    const h = milestoneSetup(), color = h.palette.add('#123456', 'Custom evidence');
    const map = h.palette.map(); map[color.hex] = { fields: 'topics | Topics | multiselect | Flow,Rig', prompt: '', template: '', trigger: 'auto' };
    h.palette.setMap(map); h.item.annotationColor = color.hex;
    const field = h.a.fieldsForColor(color.hex)[0], ids = h.a.categoryIDs(field, ['Flow']);
    await h.c.saveValues(h.item, { topics: ids });
    await h.palette.update(color.id, { hex: '#345678' }, 'keep');
    h.item.annotationColor = '#345678'; const renamed = h.a.fieldsForColor('#345678')[0];
    assert.equal(renamed.id, field.id); assert.deepEqual(clone(h.a.categoryLabels(renamed, h.c.get(h.item).values.topics)), ['Flow']);
    assert.ok(h.palette.resolve(color.id).aliases.includes('#123456'));
});

test('complete backup includes historical-only assignments from read-only libraries without changing source preferences/tags', async () => {
    const h = milestoneSetup(); h.library.editable = false;
    h.a.saveGlobalFields([{ id: 'g_legacy_themes', label: 'Topics', type: 'multiselect', legacyKey: 'themes', options: [] }]);
    h.a._getResearchMetadata = async () => ({ themes: ['Flow'], experiments: [], annotations: { '1:ANNKEY01': { themes: ['Flow'] } } });
    h.item.getTags = () => [{ tag: 'RA:Theme:Flow' }, { tag: 'RA:ThemeCatalog:Unused history' }];
    const original = [...h.prefs], exported = await h.data.export('backup'), again = await h.data.export('backup');
    assert.deepEqual([...h.prefs], original); assert.equal(h.c._store['1/ANNKEY01'], undefined);
    const record = exported.research.records[0], id = record.record.globalValues.g_legacy_themes[0];
    assert.equal(exported.settings.prefs.fieldCategories.g_legacy_themes[id], 'Flow');
    assert.equal(again.research.records[0].record.globalValues.g_legacy_themes[0], id);
    assert.ok(record.historicalTags.includes('RA:ThemeCatalog:Unused history'));
    const target = milestoneSetup(); await target.data.apply(await target.data.preview(exported, { mode: 'replace', conflict: 'incoming' }));
    assert.deepEqual(clone(target.a.categoryLabels(target.a.getGlobalFields()[0], target.c.get(target.item).values.g_legacy_themes)), ['Flow']);
    assert.ok(target.c._store['1/ANNKEY01'].historicalResearchTags.includes('RA:ThemeCatalog:Unused history'));
});

test('merging a changed color with the same stable ID retains local/imported historical aliases and saved annotation values', async () => {
    const h = milestoneSetup(), color = h.palette.resolve('#ffd400'); await h.c.saveValues(h.item, { manual: 'Local evidence' });
    const exported = await h.data.export('settings'), imported = exported.settings.prefs.palette.colors.find(c => c.id === color.id);
    imported.hex = '#123456'; imported.aliases = ['#ffd400'];
    await h.palette.update(color.id, { hex: '#345678' }, 'keep'); h.item.annotationColor = '#345678';
    await h.c.saveValues(h.item, { manual: 'Latest evidence' });
    await h.data.apply(await h.data.preview(exported, { conflict: 'incoming' }));
    assert.equal(h.palette.resolve('#345678').id, color.id); assert.equal(h.palette.resolve('#123456').id, color.id);
    assert.equal(h.c.get(h.item).values.manual, 'Latest evidence'); assert.equal(h.item.annotationColor, '#345678');
});

function treeDocument() {
    const doc = document(), create = doc.createElement, descendants = node => (node.children || []).flatMap(child => [child, ...descendants(child)]);
    const matches = (node, selector) => {
        const attr = selector.match(/\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]/);
        if (attr) {
            const name = attr[1], value = name.startsWith('data-') ? node.dataset?.[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] ?? node.getAttribute?.(name) : node.getAttribute?.(name);
            if (value === null || value === undefined || attr[2] !== undefined && String(value) !== attr[2]) return false;
            selector = selector.replace(attr[0], '');
        }
        const id = selector.match(/#([\w-]+)/); if (id && node.id !== id[1]) return false;
        const classes = [...selector.matchAll(/\.([\w-]+)/g)].map(m => m[1]);
        if (classes.some(c => !node.classList?.contains(c))) return false;
        const tag = selector.match(/^[\w-]+/); return !tag || node.tagName === tag[0].toUpperCase();
    };
    const select = (root, selector) => {
        const structure = selector.replace(/\[[^\]]*\]/g, attr => attr.replace(/ /g, '\u0000'));
        if (selector.startsWith(':scope > ')) return root.children.filter(node => matches(node, selector.slice(9)));
        if (selector.includes(' > ')) {
            const [parent, child] = selector.split(' > '); return descendants(root).filter(node => matches(node, child) && node.parentNode && matches(node.parentNode, parent));
        }
        if (structure.includes(' ')) {
            const split = structure.lastIndexOf(' '), parent = selector.slice(0, split), child = selector.slice(split + 1);
            return descendants(root).filter(node => { if (!matches(node, child)) return false; let p = node.parentNode; while (p && p !== root) { if (matches(p, parent)) return true; p = p.parentNode; } return false; });
        }
        return descendants(root).filter(node => matches(node, selector));
    };
    doc.createElement = tag => {
        const node = create(tag);
        node.querySelectorAll = selector => select(node, selector); node.querySelector = selector => select(node, selector)[0] || null;
        Object.defineProperties(node, { firstChild: { get: () => node.children[0] || null }, parentElement: { get: () => node.parentNode || null },
            nextSibling: { get: () => node.parentNode?.children[node.parentNode.children.indexOf(node) + 1] || null } });
        node.insertBefore = (child, before) => {
            if (!before) return node.appendChild(child);
            if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(el => el !== child);
            node.children.splice(node.children.indexOf(before), 0, child); child.parentNode = node; return child;
        };
        node.insertAdjacentElement = (where, child) => where === 'afterend' ? node.parentNode.insertBefore(child, node.nextSibling) : node.appendChild(child);
        node.remove = () => { if (node.parentNode) node.parentNode.children = node.parentNode.children.filter(el => el !== node); node.parentNode = null; node.isConnected = false; };
        node.closest = selector => { let p = node; while (p) { if (matches(p, selector)) return p; p = p.parentNode; } return null; };
        node.focus = () => { doc.activeElement = node; }; node.select = () => { doc.activeElement = node; };
        return node;
    };
    doc.createElementNS = (_, tag) => doc.createElement(tag); doc.body = doc.createElement('body');
    doc.getElementById = id => [...descendants(doc.body), ...descendants(doc.head)].find(el => el.id === id) || null;
    doc.querySelectorAll = selector => select(doc.body, selector); doc.querySelector = selector => select(doc.body, selector)[0] || null;
    const events = {};
    doc.addEventListener = (type, fn) => (events[type] ||= []).push(fn);
    doc.dispatchEvent = event => { for (const fn of events[event.type] || []) fn(event); };
    doc.defaultView.Event = class { constructor(type) { this.type = type; } };
    return doc;
}
const clickEvent = () => ({ preventDefault() {}, stopPropagation() {} });

test('dismissed suggestions persist by field ID without deleting historical category IDs or assignments', async () => {
    const h = milestoneSetup(); h.a.saveGlobalFields([{ id: 'g_topics', label: 'Topics', type: 'multiselect', options: [] }]);
    const field = h.a.getGlobalFields()[0], ids = h.a.categoryIDs(field, ['Mechanics']);
    await h.c.saveValues(h.item, { g_topics: ids }); const original = h.disk();
    h.a.setSuggestionDismissed(field, 'MECHANICS', true);
    assert.equal(h.a.categorySuggestions(field).length, 0); assert.equal(h.a.categoryCatalog()[field.id][ids[0]], 'Mechanics');
    assert.deepEqual(h.disk(), original); assert.deepEqual(clone(h.c.get(h.item).values.g_topics), clone(ids));
    const restored = milestoneSetup(); for (const [key, value] of h.prefs) restored.prefs.set(key, value);
    assert.equal(restored.a.categorySuggestions(restored.a.getGlobalFields()[0]).length, 0);
    assert.equal(restored.a.isSuggestionDismissed(field, 'mechanics'), true);
    const other = { id: 'c_other', label: 'Other', options: ['Mechanics'] };
    assert.deepEqual(clone(restored.a.categorySuggestions(other)), ['Mechanics']);
});

test('suggestion X dismisses without selecting/saving and typed Restore reuses the original identity', () => {
    const h = milestoneSetup(), field = { id: 'c_topics', label: 'Topics', options: ['Mechanics'] }, doc = document();
    const id = h.a.categoryIDs(field, ['Mechanics'])[0]; let edits = 0;
    const control = h.a.createMultiSelect(doc, field, [], () => edits++), search = control.children[1], choices = control.children[2];
    search.events.focus[0](); const dismiss = doc.created.find(node => node.className === 'annota-dismiss-suggestion');
    dismiss.events.click[0](clickEvent());
    assert.equal(edits, 0); assert.equal(control.readValues().length, 0); assert.equal(h.a.isSuggestionDismissed(field, 'Mechanics'), true);
    search.value = 'mechanics'; search.events.input[0](); assert.match(choices.textContent, /Restore/);
    key(search, 'Enter'); assert.equal(edits, 1); assert.deepEqual(clone(control.readValues()), [id]);
    assert.equal(h.a.isSuggestionDismissed(field, 'Mechanics'), false);
    control.removeValue(id); assert.ok(h.a.categorySuggestions(field).includes('Mechanics'));
});

test('selected-chip removal and configured suggestion dismissal remain independent across global/color controls', () => {
    const h = milestoneSetup(), global = { id: 'g_one', label: 'Same', options: ['A'] }, color = { id: 'c_one', label: 'Same', options: ['A'] };
    const selected = h.a.categoryIDs(global, ['A']), control = h.a.createMultiSelect(document(), global, selected, () => {});
    control.removeValue(selected[0]); assert.equal(h.a.isSuggestionDismissed(global, 'A'), false);
    h.a.setSuggestionDismissed(global, 'A', true); assert.equal(h.a.categorySuggestions(global).length, 0);
    assert.deepEqual(clone(h.a.categorySuggestions(color)), ['A']);
    h.a.setSuggestionDismissed(global, 'a', false); assert.deepEqual(clone(h.a.categorySuggestions(global)), ['A']);
});

test('dismissal preferences round-trip in settings/research/backup and older backup files remain importable', async () => {
    const h = milestoneSetup(), field = h.a.fieldsForColor('#ffd400')[0];
    h.a.setSuggestionDismissed(field, 'Historical choice', true);
    await h.c.saveValues(h.item, { manual: 'Keep manual', summary: 'Keep AI' });
    for (const kind of ['settings', 'research', 'backup']) {
        const payload = await h.data.export(kind), prefs = payload.settings?.prefs || payload.research.definitions;
        assert.ok(prefs.suggestionDismissals[field.id].length);
        h.a.setSuggestionDismissed(field, 'Historical choice', false);
        await h.data.apply(await h.data.preview(payload, { conflict: 'incoming' }));
        assert.equal(h.a.isSuggestionDismissed(field, 'Historical choice'), true);
    }
    const older = await h.data.export('backup'); delete older.settings.prefs.suggestionDismissals; delete older.research.definitions.suggestionDismissals;
    await h.data.apply(await h.data.preview(older)); assert.equal(h.c.get(h.item).values.summary, 'Keep AI');
    const malformed = clone(older); malformed.settings.prefs.suggestionDismissals = { [field.id]: 'not IDs' };
    await assert.rejects(h.data.preview(malformed), /dismissed suggestion/);
});

test('creation popup places native Comment and Tags before global/color fields while retaining native persistence', async () => {
    const h = milestoneSetup(), doc = treeDocument(), popup = doc.createElement('div'), colors = doc.createElement('div'), tool = doc.createElement('div'), section = doc.createElement('div');
    popup.className = 'selection-popup'; colors.className = 'colors'; tool.className = 'tool-toggle'; popup.append(colors, tool, section); doc.body.appendChild(popup);
    h.a.saveGlobalFields([{ id: 'g_note', label: 'Global', type: 'text' }]); h.a.readerColorButtons = () => [];
    const event = { doc, reader: { itemID: 8 }, params: { annotation: { text: h.item.annotationText } }, append: node => section.appendChild(node) };
    h.a._renderResearchCapture(event); h.a._renderSelectionForm(event);
    const capture = doc.querySelector('.annota-research-capture'), global = doc.querySelector('[data-field-scope="Global"]');
    assert.equal(capture.children[0].className, 'annota-native-comment'); assert.match(capture.children[1].textContent, /Zotero Tags/);
    const wrap = capture.parentNode; assert.ok(wrap.children.indexOf(capture) < wrap.children.indexOf(global.parentNode));
    const comment = doc.querySelector('.annota-native-comment-input'), tags = doc.querySelector('.annota-research-tags');
    comment.value = 'Native'; comment.events.input[0](); tags.value = 'Native tag'; tags.events.input[0]();
    h.item.saveTx = async () => {}; let added = []; h.item.addTag = tag => added.push(tag);
    await h.a.handleResearchMetadata(h.item.id); assert.equal(h.item.annotationComment, 'Native'); assert.deepEqual(added, ['Native tag']);
});

test('existing popup orders the original native Comment/Tag nodes before global/color fields', async () => {
    const h = milestoneSetup(), doc = treeDocument(), popup = doc.createElement('div'), preview = doc.createElement('div'), comment = doc.createElement('div'), tags = doc.createElement('button');
    popup.className = 'annotation-popup'; preview.className = 'preview'; comment.className = 'comment'; tags.className = 'tags';
    preview.append(comment, tags); popup.appendChild(preview); doc.body.appendChild(popup);
    h.a.saveGlobalFields([{ id: 'g_note', label: 'Global', type: 'text' }]);
    h.a._renderExistingAnnotationResearch({ doc, popup, reader: {}, annotation: { id: h.item.key, libraryID: 1 } }); await nextTurn();
    const colors = preview.querySelector('.annota-existing-colors'), fields = preview.querySelector('.annota-existing-research');
    assert.ok(preview.children.indexOf(colors) < preview.children.indexOf(comment));
    assert.ok(preview.children.indexOf(comment) < preview.children.indexOf(tags)); assert.ok(preview.children.indexOf(tags) < preview.children.indexOf(fields));
    assert.equal(comment.parentNode, preview); assert.equal(tags.parentNode, preview);
    assert.equal(fields.querySelector('.annota-structured-field').dataset.fieldScope, 'Global');
});

test('shared semantic picker applies every layout, white readable labels and interactive states to both popup selectors', () => {
    const h = milestoneSetup(), doc = document();
    for (const layout of ['wrap', 'single', 'stack', 'slanted']) {
        h.prefs.set('researchannotator.colorLabelLayout', layout);
        const creation = doc.createElement('div'), existing = doc.createElement('div'); h.palette.stylePicker(creation); h.palette.stylePicker(existing);
        assert.equal(creation.style.cssText, existing.style.cssText); assert.equal(existing.dataset.layout, layout);
    }
    for (const hex of ['#ffffff', '#ffd400', '#123456']) {
        const button = doc.createElement('button'); h.palette.styleButton(button, { hex, label: 'Evidence' }, true);
        assert.match(button.style.cssText, /cursor:pointer/); assert.match(button.style.cssText, /color:#ffffff/);
        assert.equal(button.getAttribute('aria-pressed'), 'true'); assert.ok(button.textContent.includes('Evidence'));
        if (hex === '#ffffff') assert.match(button.style.cssText, /linear-gradient/);
    }
    const css = doc.created.find(node => node.id === 'annota-interface-style').textContent;
    assert.match(css, /\.annota-color-button:hover/); assert.match(css, /\.annota-color-button:focus-visible/); assert.match(css, /\.annota-color-button:active/);
});

test('popup width, padding, field sizing and scroll rules share one responsive constraint', () => {
    const h = milestoneSetup(), doc = document(); h.a._ensureAnnotationInterfaceStyles(doc);
    const css = doc.created.find(node => node.id === 'annota-interface-style').textContent;
    assert.match(css, /^\.selection-popup,\.annotation-popup\{width:min\(360px,calc\(100vw - 24px\)\)!important/);
    assert.match(css, /padding:8px!important/); assert.match(css, /overflow:auto!important;overflow-x:hidden!important/);
    h.a._ensureStructuredFieldStyles(doc);
    assert.match(doc.created.find(node => node.id === 'annota-structured-field-style').textContent, /annota-dismiss-suggestion/);
});

test('permanent color deletion requires confirmation and removes only an unused custom configuration', async () => {
    const h = milestoneSetup(), color = h.palette.add('#123456', 'Unused');
    h.prefs.set('researchannotator.colorPrompts', JSON.stringify({ '#123456': { fields: 'unused | Unused | text' }, '#ffd400': { fields: schema } }));
    h.prefs.set('researchannotator.colorLabels', JSON.stringify({ '#123456': 'Unused', '#ffd400': 'Keep' }));
    await assert.rejects(h.palette.deleteColor(color.id), /Confirm permanent deletion/);
    assert.ok(h.palette.resolve(color.id)); const before = h.disk(); await h.palette.deleteColor(color.id, { confirmed: true });
    assert.equal(h.palette.resolve(color.id), undefined); assert.deepEqual(h.disk(), before);
    assert.equal(JSON.parse(h.prefs.get('researchannotator.colorLabels'))['#ffd400'], 'Keep');
    assert.equal(JSON.parse(h.prefs.get('researchannotator.colorPrompts'))['#123456'], undefined);
    await assert.rejects(h.palette.deleteColor(h.palette.resolve('#ffd400').id, { confirmed: true }), /default color|research data/);
});

test('colors with live annotations, orphan structured records, categories or drafts cannot be permanently deleted', async () => {
    for (const reason of ['annotation', 'record', 'category', 'draft']) {
        const h = milestoneSetup(), color = h.palette.add('#123456', reason);
        const map = h.palette.map(); map[color.hex] = { fields: 'topics | Topics | multiselect | A', prompt: '', template: '' }; h.palette.setMap(map);
        if (reason === 'annotation') h.item.annotationColor = color.hex;
        if (reason === 'record') { h.item.annotationColor = color.hex; await h.c.saveValues(h.item, { topics: [] }); h.a._getAllResearchAnnotations = async () => []; }
        if (reason === 'category') h.a.categoryIDs(h.a.fieldsForColor(color.hex)[0], ['Historical']);
        if (reason === 'draft') h.a._pendingFields = { color: color.hex, ts: Date.now(), values: { topics: ['unsaved'] } };
        const before = h.disk(); await assert.rejects(h.palette.deleteColor(color.id, { confirmed: true }), /research data/);
        assert.ok(h.palette.resolve(color.id)); assert.deepEqual(h.disk(), before);
        await h.palette.update(color.id, { archived: true }, 'keep'); assert.equal(h.palette.resolve(color.id).archived, true);
    }
});

test('reassignment archives source values without overwriting target/global values or native Comment/Tags', async () => {
    const h = milestoneSetup(), source = h.palette.add('#123456', 'Source'), target = h.palette.resolve('#ffd400');
    const map = h.palette.map(); map[source.hex] = { fields: schema, prompt: '', template: '' }; h.palette.setMap(map);
    h.a.saveGlobalFields([{ id: 'g_keep', label: 'Global', type: 'text' }]);
    await h.c.saveValues(h.item, { manual: 'Target manual', summary: 'Target AI', g_keep: 'Global value' });
    h.item.annotationColor = source.hex; await h.c.saveValues(h.item, { manual: 'Source manual', summary: 'Source AI' });
    h.item.annotationComment = 'Native'; const tags = [{ tag: 'Native tag' }]; h.item.getTags = () => tags;
    h.item.save = async () => {}; h.context.Zotero.DB = { executeTransaction: fn => fn() };
    await assert.rejects(h.palette.reassignAndArchive(source.id, target.id), /Confirm highlight reassignment/);
    await h.palette.reassignAndArchive(source.id, target.id, { confirmed: true });
    assert.equal(h.palette.resolve(source.id).archived, true); assert.equal(h.item.annotationColor, target.hex);
    assert.equal(h.c.get(h.item).values.manual, 'Target manual'); assert.equal(h.c.get(h.item).values.summary, 'Target AI');
    assert.equal(h.c.get(h.item).values.g_keep, 'Global value'); assert.equal(h.item.annotationComment, 'Native'); assert.deepEqual(h.item.getTags(), tags);
    assert.equal(h.disk().annotations['1/ANNKEY01'].colorConfigs[source.id].values.manual, 'Source manual');
    assert.equal(h.disk().annotations['1/ANNKEY01'].colorConfigs[source.id].values.summary, 'Source AI');
});

test('reassignment failure rolls back colors/palette and rejects read-only or active edits', async () => {
    const h = milestoneSetup(), source = h.palette.add('#123456', 'Source'), target = h.palette.resolve('#ffd400'); h.item.annotationColor = source.hex;
    h.item.library.editable = false; await assert.rejects(h.palette.reassignAndArchive(source.id, target.id, { confirmed: true }), /read-only/);
    h.item.library.editable = true; h.context.Zotero.DB = { executeTransaction: fn => fn() }; h.item.save = async () => { throw Error('DB unavailable'); };
    const before = h.prefs.get(h.palette.pref); await assert.rejects(h.palette.reassignAndArchive(source.id, target.id, { confirmed: true }), /DB unavailable/);
    assert.equal(h.prefs.get(h.palette.pref), before); assert.equal(h.item.annotationColor, source.hex);
    h.c._views.set({ isConnected: true, _dirty: true }, () => {});
    await assert.rejects(h.palette.reassignAndArchive(source.id, target.id, { confirmed: true }), /Save active highlight edits/);
    h.c._views.clear(); h.item.save = async () => {}; h.a._syncPaperResearchNote = async () => { throw Error('Note refresh failed'); };
    const result = await h.palette.reassignAndArchive(source.id, target.id, { confirmed: true });
    assert.equal(result.reassigned, 1); assert.match(result.noteErrors[0].error, /Note refresh failed/);
    assert.equal(h.item.annotationColor, target.hex); assert.equal(h.palette.resolve(source.id).archived, true);
});

function compactPreferences(h = milestoneSetup()) {
    const doc = treeDocument(), nodes = {}, root = doc.createElement('div'); doc.body.appendChild(root);
    const add = (id, tag = 'div', parent = root) => { const node = doc.createElement(tag); node.id = id; nodes[id] = node; parent.appendChild(node); return node; };
    add('annota-palette-editor'); const parking = add('annota-palette-parking'); parking.hidden = true;
    const panel = add('annota-color-config-panel', 'div', parking);
    for (const [id, tag] of [['annota-prompt', 'textarea'], ['annota-swatches', 'div'], ['annota-template', 'textarea'],
        ['annota-lint', 'div'], ['annota-label', 'input'], ['annota-semantic-label', 'input'], ['annota-target-name', 'span'],
        ['annota-idle-warning', 'div'], ['annota-prompt-status', 'div'], ['annota-prompt-clear', 'button']]) add(id, tag, panel);
    const editor = add('annota-fields-editor', 'div', panel); add('annota-fields', 'textarea', editor);
    for (const value of ['auto', 'manual']) {
        const radio = doc.createElement('input'); radio.type = 'radio'; radio.value = value; radio.setAttribute('name', 'annota-trigger'); panel.appendChild(radio);
    }
    for (const id of ['annota-data-actions', 'annota-data-file', 'annota-data-import', 'annota-data-mode', 'annota-data-conflict', 'annota-data-preview-text',
        'annota-data-apply', 'annota-data-libraries', 'annota-data-status', 'annota-data-preview']) add(id);
    h.context.document = doc; h.context.Zotero.Annota = h.a; h.context.requestAnimationFrame = () => {};
    doc.defaultView.confirm = () => false;
    for (const file of ['preferences.js', 'preferences-data.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), h.context);
    return { ...h, doc, nodes, panel, parking, rows: () => nodes['annota-palette-editor'].querySelectorAll('.annota-palette-row') };
}

test('compact color rows default closed and show reorder handle, swatch, label, field count and expand control', () => {
    const h = compactPreferences(), rows = h.rows();
    assert.equal(rows.length, h.palette.ensure().colors.length); assert.ok(rows.every(row => !row.open));
    const summary = rows[0].children[0];
    assert.ok(summary.querySelector('.annota-palette-handle')); assert.ok(summary.querySelector('.annota-palette-swatch'));
    assert.ok(summary.querySelector('.annota-palette-name').textContent); assert.match(summary.querySelector('.annota-palette-count').textContent, /4 fields/);
    assert.ok(summary.querySelector('.annota-palette-expand')); assert.equal(h.panel.parentNode, h.parking);
});

test('expanded color rows reuse the complete field editor and flush edits when changing rows/collapsing', () => {
    const h = compactPreferences(), rows = h.rows(), first = rows[0], second = rows[1];
    first.open = true; first.events.toggle[0]();
    assert.equal(h.panel.parentNode, first.querySelector('.annota-color-config-host'));
    assert.ok(h.nodes['annota-fields-editor'].querySelector('.annota-fe-add'));
    h.nodes['annota-fields'].value = 'custom | Custom field | textarea';
    h.nodes['annota-prompt'].value = 'Preserve this prompt'; h.nodes['annota-template'].value = '{{custom}}';
    second.open = true; second.events.toggle[0]();
    const stored = h.palette.resolve(first.dataset.colorId).configs.text;
    assert.match(stored.fields, /custom/); assert.equal(stored.prompt, 'Preserve this prompt'); assert.equal(stored.template, '{{custom}}');
    assert.equal(first.open, false); assert.equal(h.panel.parentNode, second.querySelector('.annota-color-config-host'));
    second.open = false; second.events.toggle[0](); assert.equal(h.panel.parentNode, h.parking);
    assert.ok(first.querySelector('.annota-palette-expanded').querySelector('input[aria-label="Semantic color label"]'));
});

test('existing Add Field action updates the matching collapsed count without rebuilding or losing the live editor', () => {
    const h = compactPreferences(), first = h.rows()[0]; first.open = true; first.events.toggle[0]();
    const previous = h.a.parseFieldSchema(h.palette.resolve(first.dataset.colorId).configs.text.fields).length;
    h.nodes['annota-fields-editor'].querySelector('.annota-fe-add').events.click[0](clickEvent());
    assert.equal(h.a.parseFieldSchema(h.palette.resolve(first.dataset.colorId).configs.text.fields).length, previous + 1);
    assert.equal(first.querySelector('.annota-palette-count').textContent, (previous + 1) + ' fields');
    assert.equal(h.panel.parentNode, first.querySelector('.annota-color-config-host'));
});

test('Delete Color UI distinguishes permanent deletion from archive and honors cancelled confirmation', async () => {
    const fixture = milestoneSetup(), color = fixture.palette.add('#123456', 'Unused custom'), h = compactPreferences(fixture);
    const row = h.rows().find(row => row.dataset.colorId === color.id); row.open = true; row.events.toggle[0]();
    const remove = row.querySelectorAll('button').find(node => node.className.includes('annota-palette-delete')); await remove.events.click[0]();
    const confirm = row.querySelectorAll('button').find(node => node.textContent === 'Permanently Delete Color'); assert.ok(confirm);
    await confirm.events.click[0](); assert.ok(h.palette.resolve(color.id));
    h.doc.defaultView.confirm = () => true; await confirm.events.click[0]();
    assert.equal(h.palette.resolve(color.id), undefined); assert.equal(h.panel.parentNode, h.parking);
    assert.ok(!h.rows().some(row => row.dataset.colorId === color.id));
});

test('reorder handles support keyboard movement and drag ordering while preserving identities/configurations', () => {
    const h = compactPreferences(), initial = h.palette.ensure().colors.map(c => c.id), first = h.rows()[0];
    const handle = first.querySelector('.annota-palette-handle');
    handle.events.keydown[0]({ key: 'ArrowDown', preventDefault() {}, stopPropagation() {} });
    assert.equal(h.palette.ensure().colors[1].id, initial[0]);
    const reordered = h.rows(), third = reordered[2];
    third.events.drop[0]({ preventDefault() {}, stopPropagation() {}, dataTransfer: { getData: () => initial[0] } });
    assert.equal(new Set(h.palette.ensure().colors.map(c => c.id)).size, initial.length);
    assert.ok(h.palette.resolve(initial[0]).configs.text.fields.includes('manual'));
    let prevented = false; const before = h.prefs.get(h.palette.pref);
    h.rows()[0].events.drop[0]({ preventDefault() { prevented = true; }, stopPropagation() {}, dataTransfer: { getData: () => '' } });
    assert.equal(prevented, false); assert.equal(h.prefs.get(h.palette.pref), before);
});

test('collapsible preferences retain every established configuration element once inside the parked editor', () => {
    const xml = fs.readFileSync(path.join(__dirname, '..', 'preferences.xhtml'), 'utf8');
    for (const id of ['annota-kind', 'annota-label', 'annota-semantic-label', 'annota-fields-editor', 'annota-fields', 'annota-template', 'annota-prompt', 'annota-prompt-clear', 'annota-color-label-layout', 'annota-paper-note-sort']) {
        assert.equal((xml.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1);
    }
    assert.match(xml, /id="annota-palette-parking" hidden="hidden"/);
    assert.match(xml, /id="annota-color-config-panel"[\s\S]*id="annota-fields-editor"/);
    assert.match(xml, /id="annota-swatches"[^>]*hidden="hidden"/);
});

test('actual creation and existing popup renderers consume the same selected semantic layout', async () => {
    const h = milestoneSetup(), creationDoc = treeDocument(), popup = creationDoc.createElement('div'), native = creationDoc.createElement('div');
    popup.className = 'selection-popup'; native.className = 'colors'; popup.appendChild(native); creationDoc.body.appendChild(popup);
    h.prefs.set('researchannotator.colorLabelLayout', 'stack');
    h.palette.renderSelection({ doc: creationDoc, params: { annotation: { text: h.item.annotationText } }, reader: { _iframeWindow: {}, _internalReader: { _annotationManager: { addAnnotation() {} } } } });
    const existingDoc = treeDocument(), existing = existingDoc.createElement('div'), preview = existingDoc.createElement('div');
    existing.className = 'annotation-popup'; preview.className = 'preview'; existing.appendChild(preview); existingDoc.body.appendChild(existing);
    h.a._renderExistingAnnotationResearch({ doc: existingDoc, popup: existing, reader: {}, annotation: { id: h.item.key, libraryID: 1 } }); await nextTurn();
    const left = creationDoc.querySelector('.annota-palette-picker'), right = existingDoc.querySelector('.annota-palette-picker');
    assert.equal(left.dataset.layout, 'stack'); assert.equal(left.style.cssText, right.style.cssText);
    assert.equal(left.children[0].getAttribute('aria-label'), right.children[0].getAttribute('aria-label'));
});

test('AI generation after native Comment/Tags entry leaves both native data sources untouched', async () => {
    const h = milestoneSetup(); h.item.annotationComment = 'Native Comment';
    const tags = [{ tag: 'User tag', type: 0 }]; h.item.getTags = () => tags;
    h.item.addTag = () => { throw Error('AI must not add native tags'); }; h.item.saveTx = () => { throw Error('AI must not save native Comment'); };
    await h.c.saveValues(h.item, { manual: 'Manual value' }); h.a.generateComment = async () => 'Saved AI';
    await h.a.generateStructuredFields(h.item);
    assert.equal(h.item.annotationComment, 'Native Comment'); assert.deepEqual(h.item.getTags(), tags);
    assert.equal(h.c.get(h.item).values.manual, 'Manual value'); assert.equal(h.c.get(h.item).values.summary, 'Saved AI');
});

test('permanent deletion rechecks active work after asynchronous usage inspection', async () => {
    const h = milestoneSetup(), color = h.palette.add('#123456', 'Unused');
    h.a._getAllResearchAnnotations = async () => { h.a._fieldRequests = new Set(['new-request']); return []; };
    await assert.rejects(h.palette.deleteColor(color.id, { confirmed: true }), /Finish active data/);
    assert.ok(h.palette.resolve(color.id));
});


test('all five layout values are selectable without changing stored legacy preferences', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'preferences.xhtml'), 'utf8');
    for (const layout of ['single', 'wrap', 'stack', 'slanted', 'vertical']) {
        assert.equal((source.match(new RegExp('option value="' + layout + '"', 'g')) || []).length, 1);
        const h = milestoneSetup(); h.prefs.set('researchannotator.colorLabelLayout', layout);
        const picker = treeDocument().createElement('div'); h.palette.stylePicker(picker);
        assert.equal(picker.dataset.layout, layout); assert.equal(h.prefs.get('researchannotator.colorLabelLayout'), layout);
    }
});
test('geometry plans retain label widths and fit 3/5/8/12 colors without letter stacking', () => {
    const { palette } = milestoneSetup();
    for (const count of [3, 5, 8, 12]) {
        const sizes = Array.from({ length: count }, (_, i) => ({ width: 80 + i * 27, height: 25 }));
        const row = palette.geometryPlan('single', sizes);
        assert.equal(row.width, sizes.reduce((sum, s) => sum + s.width, 0) + 2 * (count - 1) + 12);
        assert.deepEqual(Array.from(row.items, i => i.width), sizes.map(s => s.width));
        const vertical = palette.geometryPlan('vertical', sizes);
        assert.equal(vertical.angle, -90); assert.equal(new Set(vertical.items.map(i => i.width)).size, 1);
        assert.equal(vertical.height, sizes.at(-1).width + 12);
        const slanted = palette.geometryPlan('slanted', sizes, 640, 600);
        assert.ok(slanted.angle <= -35 && slanted.angle >= -55);
        assert.ok(slanted.items.every(i => i.top >= -1e-9));
    }
});
test('collapsed trash action is accessible, does not toggle row and exposes protected deletion choices', async () => {
    const fixture = milestoneSetup(), color = fixture.palette.add('#123456', 'Collapsed delete'), h = compactPreferences(fixture);
    const row = h.rows().find(r => r.dataset.colorId === color.id), summary = row.children[0];
    const trash = row.querySelector('.annota-palette-delete');
    assert.ok(trash); assert.match(trash.getAttribute('aria-label'), /Delete Color/); assert.ok(trash.title);
    let prevented = false, stopped = false;
    trash.events.click[1]({ preventDefault(){ prevented=true; }, stopPropagation(){ stopped=true; } });
    assert.ok(prevented && stopped); await trash.events.click[0](); assert.equal(!!row.open, false);
    const choices = h.nodes['annota-palette-editor'].querySelectorAll('.annota-color-delete-options').find(node => !node.hidden);
    assert.equal(choices.hidden, false); assert.ok(choices.querySelectorAll('button').some(b => b.textContent === 'Permanently Delete Color'));
    assert.ok(h.palette.resolve(color.id));
});

// Full infrastructure is loaded here, unlike earlier isolated renderer fixtures.
async function infrastructureSetup({ initialize = true } = {}) {
    const h = milestoneSetup(), files = new Map(), operations = [], card = h.c;
    files.set(card.file(), { version: 2, annotations: {} });
    h.context.setTimeout = setTimeout; h.context.clearTimeout = clearTimeout;
    h.context.clearInterval = clearInterval;
    h.context.IOUtils = {
        exists: async file => files.has(file), makeDirectory: async () => {},
        readJSON: async file => { if (!files.has(file)) throw Error('Missing file'); const data = files.get(file); if (typeof data === 'string') throw Error('Corrupt JSON'); return clone(data); },
        writeJSON: async (file, data, options) => { if (h.failWrite?.(file)) throw Error('Disk full'); operations.push({ file, options, data: clone(data) }); files.set(file, clone(data)); },
        copy: async (from, to) => { if (!files.has(from)) throw Error('Missing source'); files.set(to, clone(files.get(from))); },
        readUTF8: async file => JSON.stringify(files.get(file)),
        getChildren: async dir => [...files.keys()].filter(p => p.startsWith(dir + '/'))
    };
    h.context.Services = { prompt: { confirm: () => true, alert() {} } };
    h.item.saveTx = async () => {}; h.parent.libraryID = 1;
    for (const name of ['review.js', 'infrastructure.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), h.context);
    const infra = h.context.AnnotaInfrastructure;
    infra.installStorage();
    if (initialize) {
        await infra.init(); infra.installIntegrations();
        infra.jobs.register('structured-ai', async (payload, control) => {
            const item = await infra.resolve(payload.annotation);
            await h.a.generateStructuredFields(item, { fieldIds: payload.fieldIds, regenerate: payload.regenerate, partial: true, control });
        }, { paid: true });
    }
    return Object.assign(h, { infra, files, operations, review: h.context.AnnotaReview });
}

test('infrastructure storage atomically backs up, versions and serializes concurrent field updates', async () => {
    const h = await infrastructureSetup();
    await Promise.all([h.c.saveValues(h.item, { manual: 'A' }), h.c.saveValues(h.item, { choice: 'B' })]);
    const disk = h.files.get(h.c.file()); assert.equal(disk.version, 3);
    assert.equal(h.c.get(h.item).values.manual, 'A'); assert.equal(h.c.get(h.item).values.choice, 'B');
    assert.ok(h.files.has(h.c.file() + '.recovery'));
    assert.ok([...h.files.keys()].some(p => p.includes('structured-session')));
    for (const operation of h.operations.filter(o => o.file === h.c.file())) { assert.equal(operation.options.flush, true); assert.ok(operation.options.tmpPath); }
});
test('corrupt active storage recovers from validated snapshot and retains original bytes', async () => {
    const h = await infrastructureSetup({ initialize: false });
    h.files.set(h.c.file(), 'broken bytes');
    h.files.set(h.c.file() + '.recovery', { version: 3, annotations: { '1/ANNKEY01': { version: 2, colors: { '#ffd400': { values: { manual: 'Recovered' } } } } } });
    await h.c.load(); assert.equal(h.c.get(h.item).values.manual, 'Recovered');
    assert.ok([...h.files].some(([p,v]) => p.includes('.corrupt-') && v === 'broken bytes'));
});
test('unrecoverable or future storage cannot become an empty store', async () => {
    for (const data of ['corrupt', { version: 99, annotations: {} }]) {
        const h = await infrastructureSetup({ initialize: false }); h.files.set(h.c.file(), data);
        await assert.rejects(h.c.saveValues(h.item, { manual: 'Unsafe' }));
        assert.deepEqual(h.files.get(h.c.file()), data); assert.equal(h.c._store, null);
    }
});
test('invalid stored field shapes and unsafe keys are rejected before writing', async () => {
    const h = await infrastructureSetup();
    assert.throws(() => h.infra.validateStore({ version: 3, annotations: { '1/ANNKEY01': { version: 2, colors: { '#ffd400': { values: { manual: {} } } } } } }));
    assert.throws(() => h.infra.validateStore(JSON.parse('{"version":3,"annotations":{},"__proto__":{}}')));
});
test('legacy v1 migration is backed up without dropping values', async () => {
    const h = await infrastructureSetup({ initialize: false });
    h.files.set(h.c.file(), { version: 1, annotations: { '1/ANNKEY01': { color: '#FFD400', values: { manual: 'Legacy' } } } });
    await h.c.load(); await h.c.flush();
    assert.equal(h.c.get(h.item).values.manual, 'Legacy'); assert.equal(h.files.get(h.c.file()).version, 3);
    assert.ok([...h.files.keys()].some(p => p.includes('pre-migration')));
});
test('failed durable write leaves committed memory/data intact and later retry works', async () => {
    const h = await infrastructureSetup(); await h.c.saveValues(h.item, { manual: 'Before' });
    h.failWrite = file => file === h.c.file(); await assert.rejects(h.c.saveValues(h.item, { manual: 'After' }), /Disk full/);
    assert.equal(h.c.get(h.item).values.manual, 'Before'); h.failWrite = null;
    await h.c.saveValues(h.item, { manual: 'Retry' }); assert.equal(h.c.get(h.item).values.manual, 'Retry');
});
test('inherited remember is awaitable and merges unrelated fields safely', async () => {
    const h = await infrastructureSetup(); await h.c.saveValues(h.item, { manual: 'Keep' });
    await h.c.remember(h.item, { summary: 'Saved' }, '', 'Must not become Comment');
    assert.equal(h.c.get(h.item).values.manual, 'Keep'); assert.equal(h.item.annotationComment, '');
});
test('shutdown drain writes pending debounced data and rejects new work', async () => {
    const h = await infrastructureSetup(); await h.c.saveValues(h.item, { manual: 'Initial' });
    h.c._store['1/ANNKEY01'].colors['#ffd400'].values.manual = 'Pending'; h.c.persist();
    await h.infra.stop(); assert.equal(h.files.get(h.c.file()).annotations['1/ANNKEY01'].colors['#ffd400'].values.manual, 'Pending');
    await assert.rejects(h.infra.generateJob(h.item), /shutting down/);
});
test('AI lifecycle persists completion, source/prompt fingerprints and marks changed prompts outdated', async () => {
    const h = await infrastructureSetup(); h.a.generateComment = async () => 'Result';
    await h.a.generateStructuredFields(h.item, { partial: true });
    const field = h.a.annotationFields('#ffd400').find(f => f.type === 'ai');
    let status = h.infra.lifecycle.describe(h.item, field); assert.equal(status.state, 'completed'); assert.ok(status.annotation);
    assert.ok(status.generatedAt); assert.ok(status.sourceFingerprint);
    status = h.infra.lifecycle.describe(h.item, { ...field, prompt: 'Different prompt' }); assert.equal(status.state, 'outdated');
    h.a.generateComment = async () => { throw Error('Must not regenerate automatically'); };
    await h.a.generateStructuredFields(h.item); assert.equal(h.c.get(h.item).values.summary, 'Result');
});
test('explicit regeneration failure preserves previous successful AI and manual values', async () => {
    const h = await infrastructureSetup(); await h.c.saveValues(h.item, { manual: 'Keep', summary: 'Successful old value' });
    h.a.generateComment = async () => { throw Error('Provider unavailable'); };
    await assert.rejects(h.a.generateStructuredFields(h.item, { regenerate: true, partial: true }), /Provider unavailable/);
    assert.equal(h.c.get(h.item).values.summary, 'Successful old value'); assert.equal(h.c.get(h.item).values.manual, 'Keep');
    assert.equal(h.c.get(h.item).aiMetadata[h.a.annotationFields('#ffd400').find(f=>f.type==='ai').id].state, 'failed');
});
test('AI running generation preserves concurrent manual edits and newer same-field values', async () => {
    const h = await infrastructureSetup(); const gate = defer(), started = defer();
    await h.c.saveValues(h.item, { summary: 'Old', manual: 'Old manual' });
    h.a.generateComment = async () => { started.resolve(); return gate.promise; };
    const task = h.a.generateStructuredFields(h.item, { regenerate: true, partial: true }); await started.promise;
    await h.c.saveValues(h.item, { manual: 'Concurrent manual', summary: 'Concurrent AI' }); gate.resolve('Late AI'); await task;
    assert.equal(h.c.get(h.item).values.manual, 'Concurrent manual'); assert.equal(h.c.get(h.item).values.summary, 'Concurrent AI');
});
test('historical annotations and newly configured fields are missing without provider requests', async () => {
    const h = await infrastructureSetup(); let calls = 0; h.a.generateComment = async () => { calls++; return 'Generated'; };
    const field = h.a.annotationFields('#ffd400').find(f => f.type === 'ai');
    assert.equal(h.infra.lifecycle.describe(h.item, field).state, 'missing'); assert.equal(calls, 0);
    await h.infra.generateJob(h.item); assert.equal(calls, 1); assert.equal(h.c.get(h.item).values.summary, 'Generated');
});
test('late provider result cannot revive deleted annotation records', async () => {
    const h = await infrastructureSetup(); const gate = defer(), started = defer();
    h.a.generateComment = async () => { started.resolve(); return gate.promise; };
    const task = h.a.generateStructuredFields(h.item, { partial: true }); await started.promise;
    h.item.deleted = true; h.a._deletedAnnotationKeys = new Set(['1:ANNKEY01']);
    gate.resolve('Late'); await assert.rejects(task); assert.equal(h.c.get(h.item)?.values.summary, undefined);
    await assert.rejects(h.c.saveValues(h.item, { manual: 'Late edit' }), /unavailable/);
});
test('job queue deduplicates requests, reports progress and persists completed results', async () => {
    const h = await infrastructureSetup(); const gate = defer(); let calls = 0; const reports = [];
    h.infra.jobs.listeners.add(job => reports.push(job.state));
    h.infra.jobs.register('fixture', async (_, control) => { calls++; await gate.promise; await control.progress(.5, { processed: 1 }); });
    const id = await h.infra.jobs.enqueue('fixture', {}, { dedupe: 'same' });
    const duplicate = await h.infra.jobs.enqueue('fixture', {}, { dedupe: 'same' }); assert.equal(id, duplicate);
    gate.resolve(); await h.infra.jobs.wait(id); assert.equal(calls, 1); assert.ok(reports.includes('completed'));
    assert.equal(h.infra.state.jobs[id].checkpoint.processed, 1);
});
test('job cancellation retains completed field results and stops subsequent work', async () => {
    const h = await infrastructureSetup(); const started = defer(), gate = defer();
    h.infra.jobs.register('fixture', async (_, control) => { await h.c.saveValues(h.item, { manual: 'Completed' }); started.resolve(); await gate.promise; control.check(); await h.c.saveValues(h.item, { choice: 'Should not save' }); });
    const id = await h.infra.jobs.enqueue('fixture', {}, { dedupe: 'cancel' }); await started.promise;
    await h.infra.jobs.cancel(id); gate.resolve(); await h.infra.jobs.active.get(id);
    assert.equal(h.infra.state.jobs[id].state, 'cancelled'); assert.equal(h.c.get(h.item).values.manual, 'Completed'); assert.equal(h.c.get(h.item).values.choice, undefined);
});
test('interrupted paid jobs require acknowledgement and never run on recovery', async () => {
    const h = await infrastructureSetup(); let calls = 0;
    h.infra.jobs.register('fixture', async () => { calls++; }, { paid: true });
    await h.infra.mutate(state => { state.jobs.JOB = { id: 'JOB', type: 'fixture', payload: {}, paid: true, state: 'running', attempts: 1, dedupe: 'interrupted' }; });
    await h.infra.jobs.recover(); assert.equal(h.infra.state.jobs.JOB.state, 'interrupted'); assert.equal(calls, 0);
    await assert.rejects(h.infra.jobs.resume('JOB'), /acknowledgement/);
    await h.infra.jobs.resume('JOB', { acknowledgePaid: true }); await h.infra.jobs.wait('JOB'); assert.equal(calls, 1);
});
test('ambiguous paid failure is not automatically retried', async () => {
    const h = await infrastructureSetup(); let calls = 0;
    h.infra.jobs.register('fixture', async () => { calls++; const error = Error('Timeout after send'); error.retryable = true; throw error; }, { paid: true });
    const id = await h.infra.jobs.enqueue('fixture', {}, { dedupe: 'timeout' }); await assert.rejects(h.infra.jobs.wait(id), /Timeout/);
    assert.equal(calls, 1); assert.equal(h.infra.state.jobs[id].ambiguous, true);
});
test('job pause and resume honor explicit checkpoints and configured concurrency', async () => {
    const h = await infrastructureSetup(); h.prefs.set('researchannotator.aiConcurrency', 2);
    const gate = defer(), started = defer(); let active = 0, peak = 0;
    h.infra.jobs.register('fixture', async (_, control) => { active++; peak = Math.max(peak, active); if (active === 2) started.resolve(); await gate.promise; active--; control.check(); });
    const a = await h.infra.jobs.enqueue('fixture', {}, { dedupe: 'a' }), b = await h.infra.jobs.enqueue('fixture', {}, { dedupe: 'b' });
    await started.promise; assert.equal(peak, 2); await h.infra.jobs.pause(a); gate.resolve(); await Promise.allSettled([...h.infra.jobs.active.values()]);
    assert.equal(h.infra.state.jobs[a].state, 'paused'); await h.infra.jobs.resume(a); await h.infra.jobs.wait(a); await h.infra.jobs.wait(b);
});
test('managed note identities include library/scope and ignore titles', async () => {
    const h = await infrastructureSetup(), notes = h.infra.notes;
    const config = { id: 'topic_1', library: { type: 'user', id: '1234' }, scope: { type: 'topic', key: 'FIELD_ID' }, mode: 'auto', include: {} };
    const id = await notes.configure(config); assert.equal(await notes.configure({ ...config, title: 'Renamed' }), id);
    assert.notEqual(id, notes.identity({ type: 'group', id: '1234' }, config.scope));
    assert.equal(Object.keys(h.infra.state.notes).length, 1);
});
test('managed note lookup reuses legacy identity and refuses duplicate identities', async () => {
    const h = await infrastructureSetup(), marker = 'research-annotator-pdf-note-v1:PDFKEY01';
    const notes = [{ id: 30, isNote: () => true, getNote: () => '<p>' + marker + '</p>' }];
    h.context.Zotero.Search = class { addCondition(){} async search(){ return notes.map(n=>n.id); } };
    h.context.Zotero.Items.getAsync = async id => notes.find(n=>n.id===id);
    assert.equal((await h.infra.notes.find(1, marker)).id, 30);
    h.infra.notes.cache.clear(); notes.push({ ...notes[0], id: 31 });
    await assert.rejects(h.infra.notes.find(1, marker), /Duplicate/);
});
test('managed note update preserves edits inside an owned entry', async () => {
    const h = await infrastructureSetup(), notes = h.infra.notes;
    const original = '<div data-ra-entry="1:ANNKEY01"><h2>Original</h2><p><strong>Summary:</strong> AI</p></div>';
    const edited = original.replace('</div>', '<p>My scientific interpretation</p></div>');
    const retained = notes.preserveEdits(edited, { generated: { '1:ANNKEY01': original } });
    const result = h.a._replaceManagedResearchEntries(retained, original);
    assert.match(result, /My scientific interpretation/); assert.match(result, /Preserved user-edited/);
});
test('normalized edited notes are preserved as user snapshots rather than erased', async () => {
    const h = await infrastructureSetup(), old = '<h2><a href="zotero://open-pdf/library/items/PDFKEY01?annotation=ANNKEY01">Text</a></h2>';
    const retained = h.infra.notes.preserveEdits(old + '<p>User analysis</p>', { generated: { x: old }, content: old });
    assert.match(retained, /User analysis/); assert.doesNotMatch(retained, /Preserved user-edited note snapshot/);
    assert.equal((retained.match(/annotation=ANNKEY01/g)||[]).length,1);
});
test('incomplete-device note guard rejects missing or mismatching local structured values', async () => {
    const h = await infrastructureSetup(); const note = '<p>research-annotator-data-v1:abc:5</p>';
    assert.throws(() => h.infra.notes.guard(note, [h.item], null), /incomplete or differs/);
    await h.c.saveValues(h.item, { summary: 'Old' });
    assert.throws(() => h.infra.notes.guard('<p>research-annotator-data-v1:abc:1</p>', [h.item], null), /incomplete or differs/);
});
test('managed operations serialize per identity while separate scopes are independent', async () => {
    const h = await infrastructureSetup(), gate = defer(), order = [];
    const first = h.infra.notes.serialize('A', async () => { order.push('first'); await gate.promise; order.push('done'); });
    const next = h.infra.notes.serialize('A', () => order.push('next'));
    await h.infra.notes.serialize('B', () => order.push('other')); assert.ok(order.includes('other')); assert.ok(!order.includes('next'));
    gate.resolve(); await Promise.all([first, next]); assert.ok(order.indexOf('next') > order.indexOf('done'));
});
test('conversion copies every global/color value and metadata without deleting history', async () => {
    const h = await infrastructureSetup(); await h.c.saveValues(h.item, { manual: 'Keep', summary: 'AI', g_old: 'Historical global' });
    const old = clone(h.c._store['1/ANNKEY01']), replacement = { ...h.item, key: 'NEWKEY01', annotationType: 'underline' };
    await h.c.transfer({ libraryID: 1, key: h.item.key }, replacement);
    assert.deepEqual(clone(h.c._store['1/ANNKEY01']), old); assert.equal(h.c.get(replacement).values.summary, 'AI');
    assert.equal(h.c._store['1/NEWKEY01'].convertedFrom, '1/ANNKEY01');
});
test('structured undo restores global/color values and refuses to discard subsequent edits', async () => {
    const h = await infrastructureSetup(); await h.c.saveValues(h.item, { summary: 'Before', manual: 'Keep' });
    const before = clone(h.c._store['1/ANNKEY01']); await h.c.saveValues(h.item, { summary: 'After' });
    const after = clone(h.c._store['1/ANNKEY01']), backup = { annotations: [{ identity: h.infra.stableAnnotation(h.item), before, after }] };
    assert.equal((await h.infra.undoRefill(backup)).restored, 1); assert.equal(h.c.get(h.item).values.summary, 'Before');
    await h.c.saveValues(h.item, { summary: 'After', manual: 'New manual' });
    assert.equal((await h.infra.undoRefill(backup)).kept, 1); assert.equal(h.c.get(h.item).values.manual, 'New manual');
});
test('review save and AI reuse shared storage without changing native Comment or Tags', async () => {
    const h = await infrastructureSetup(); h.item.annotationComment = 'Native'; const tags = clone(h.item.getTags());
    await h.review.save(h.item, { manual: 'Review manual', summary: 'Cannot manually overwrite AI' }, '');
    assert.equal(h.c.get(h.item).values.summary, undefined); h.a.generateComment = async () => 'AI result';
    await h.review.aiFill(h.item, { manual: 'Review manual' }); assert.equal(h.c.get(h.item).values.summary, 'AI result');
    assert.equal(h.item.annotationComment, 'Native'); assert.deepEqual(h.item.getTags(), tags);
    await h.c.saveValues(h.item,{manual:'Concurrent external edit'});
    assert.equal(await h.review.save(h.item,{manual:'Review manual'},'',{manual:'Review manual'}),false);
    await assert.rejects(h.review.save(h.item,{manual:'Edited stale draft'},'',{manual:'Review manual'}),/changed elsewhere/);
    assert.equal(h.c.get(h.item).values.manual,'Concurrent external edit');
});
test('pending fields require exact passage and attachment identity', async () => {
    const h = await infrastructureSetup(); h.a._pendingFields = { text: h.item.annotationText, ts: Date.now(), attachmentID: 8, values: { manual: 'Scoped' } };
    assert.equal(h.a.peekPendingFields('Unrelated', h.item), null); assert.equal(h.a.peekPendingFields(h.item.annotationText, { ...h.item, parentID: 99 }), null);
    assert.equal(h.a.takePendingFields(h.item.annotationText, h.item).manual, 'Scoped'); assert.equal(h.a._pendingFields, null);
});
test('complete backup includes infrastructure and old format backups still validate', async () => {
    const h = await infrastructureSetup(); await h.c.saveValues(h.item, { manual: 'Portable' });
    const backup = await h.data.export('backup'); assert.equal(backup.infrastructure.version, 1);
    const old = clone(backup); delete old.infrastructure; assert.ok(h.data.validate(old));
    h.infra.validateState(backup.infrastructure); assert.equal(backup.credentialsIncluded, false);
});
test('indexed structured record lookup remains correct with a large annotation collection', async () => {
    const h = await infrastructureSetup(); const store = {};
    for (let i = 0; i < 15000; i++) store['1/A' + String(i).padStart(7,'0')] = { version: 2, colors: { '#ffd400': { values: { manual: String(i) } } } };
    h.c._store = store; assert.equal(h.c.get({ ...h.item, key: 'A0014999' }).values.manual, '14999');
    assert.equal(Object.keys(h.c._store).length, 15000); // correctness, not a runtime performance claim
});

async function infrastructureNoteSetup() {
    const h = await infrastructureSetup(); let html = '<h1>PDF research</h1><p>research-annotator-pdf-note-v1:PDFKEY01</p><p>Introduction</p>';
    const note = { id: 30, key: 'NOTEKEY1', libraryID: 1, isNote: () => true, getNote: () => html, setNote: value => { html = value; }, saveTx: async () => {} };
    h.item.annotationPosition = JSON.stringify({ pageIndex: 0, rects: [[0,0,20,20]] });
    const items = new Map([[7,h.item],[8,h.parent],[30,note]]);
    h.context.Zotero.Items.getAsync = async id => items.get(id);
    h.context.Zotero.Items.getByLibraryAndKeyAsync = async (libraryID,key) => [...items.values()].find(item=>item.key===key);
    h.context.Zotero.Search = class { addCondition(name,op,value){ if(name==='itemType')this.type=value; } async search(){ return this.type==='note'?[30]:[7]; } };
    h.a._syncPaperResearchNote = h.realSync;
    h.a._getOrCreatePaperResearchNote = async () => ({ note });
    return { ...h, note, items, html:()=>html, setHTML:value=>{html=value;} };
}
test('integrated PDF rebuild is idempotent and final deletion preserves unrelated user content', async () => {
    const h = await infrastructureNoteSetup(); await h.c.saveValues(h.item, { manual: 'Saved', summary: 'AI' });
    h.parent.getAnnotations=(includeTrashed,asIDs)=>{assert.equal(includeTrashed,false);assert.equal(asIDs,true);return [7];};
    await h.a._syncPaperResearchNote(h.item); const first = h.html(); await h.a._syncPaperResearchNote(h.item);
    assert.equal(h.html(), first); assert.match(first, /annotation=ANNKEY01/);
    h.setHTML(h.html() + '<p>User footer</p>'); h.item.deleted = true; h.a._deletedAnnotationKeys = new Set(['1:ANNKEY01']);
    await h.a._syncPaperResearchNote({ libraryID:1,parentID:8,existingOnly:true });
    assert.doesNotMatch(h.html(), /annotation=ANNKEY01/); assert.match(h.html(), /User footer/); assert.match(h.html(), /Introduction/);
});
test('integrated PDF rebuild retains user changes inside a generated heading and field region', async () => {
    const h = await infrastructureNoteSetup(); await h.c.saveValues(h.item, { summary: 'AI' }); await h.a._syncPaperResearchNote(h.item);
    h.setHTML(h.html().replace('A research passage','My edited scientific heading').replace('</div>','<p>My interpretation</p></div>'));
    await h.a._syncPaperResearchNote(h.item); assert.match(h.html(), /My interpretation/); assert.match(h.html(), /My edited scientific heading/);
    assert.match(h.html(), /Preserved user-edited/); const snapshots = (h.html().match(/Preserved user-edited/g)||[]).length;
    await h.a._syncPaperResearchNote(h.item); assert.equal((h.html().match(/Preserved user-edited/g)||[]).length,snapshots);
});
test('PDF manual and static modes preserve automatic default and field inclusion controls', async () => {
    const h = await infrastructureNoteSetup(); await h.c.saveValues(h.item, { manual:'Hidden field',summary:'AI' });
    const config = h.infra.notes.pdfConfig(h.parent,1); config.mode='manual'; await h.infra.notes.configure(config);
    await h.a._syncPaperResearchNote(h.item); assert.doesNotMatch(h.html(), /annotation=ANNKEY01/);
    config.include.colorFields=false; await h.infra.notes.configure(config);
    await h.infra.notes.synchronize(config,null,{manual:true}); assert.match(h.html(), /annotation=ANNKEY01/); assert.doesNotMatch(h.html(), /Hidden field/);
    const frozen=h.html(); await h.infra.notes.configure({...config,mode:'static'}); await h.c.saveValues(h.item,{manual:'Changed'});
    await h.a._syncPaperResearchNote(h.item); assert.equal(h.html(),frozen);
});
test('shared compiler groups by publication, reuses saved values and retains direct source links', async () => {
    const h=await infrastructureNoteSetup(); await h.c.saveValues(h.item,{manual:'Compiler manual',summary:'Saved AI'});
    h.a.generateComment=async()=>{throw Error('Compiler cannot generate');};
    const base=h.infra.notes.pdfConfig(h.parent,1),config={...base,include:{...base.include,citation:true},scope:{type:'topic',key:'topic1'}};
    const result=await h.infra.notes.compileAnnotations([h.item],config);
    assert.match(result.html,/publication:PDFKEY01/); assert.match(result.html,/annotation=ANNKEY01/);
    assert.match(result.html,/Saved AI/); assert.match(result.html,/Source:/);
    h.parent.deleted=true; assert.equal((await h.infra.notes.compileAnnotations([h.item],config)).html,'');
});
test('newly configured AI fields do not falsely trigger incomplete-device protection', async () => {
    const h=await infrastructureSetup();
    assert.doesNotThrow(()=>h.infra.notes.guard('<p><strong>Manual:</strong> Stored manual</p>',[h.item],null));
    assert.throws(()=>h.infra.notes.guard('<p><strong>Summary:</strong> Valuable historical result</p>',[h.item],null),/missing locally/);
});
test('prompt changes during an in-flight request prevent saving stale configuration results', async () => {
    const h=await infrastructureSetup(); const start=defer(),gate=defer();
    h.a.generateComment=async()=>{start.resolve();return gate.promise;};
    const task=h.a.generateStructuredFields(h.item,{partial:true});await start.promise;
    const palette=h.palette.ensure();palette.colors.find(c=>c.hex==='#ffd400').configs.text.fields=palette.colors.find(c=>c.hex==='#ffd400').configs.text.fields.replace('Summarize','Changed instruction');h.prefs.set(h.palette.pref,JSON.stringify(palette));gate.resolve('Stale');
    await assert.rejects(task,/configuration changed/);assert.equal(h.c.get(h.item).values.summary,undefined);
});
test('structured provider calls disable ambiguous legacy automatic retries', async () => {
    const h=await infrastructureSetup();let calls=0;
    h.a.buildPrompt=()=>({system:'',user:'Text'});h.a.provider=()=> 'openai';
    h.a.callOpenAI=async()=>{calls++;const error=Error('Timeout');error.status=0;throw error;};
    h.prefs.set('researchannotator.retries',5);
    await assert.rejects(h.a.generateStructuredFields(h.item,{partial:true}),/Timeout/);assert.equal(calls,1);
});
test('confirmed rate-limit rejection enters bounded delay and cancellation clears the retry', async () => {
    const h=await infrastructureSetup();let calls=0;
    h.infra.jobs.register('limited',async()=>{calls++;const error=Error('Rate limited');Object.assign(error,{status:429,requestRejected:true,retryable:true,retryAfter:1});throw error;},{paid:true});
    const id=await h.infra.jobs.enqueue('limited',{}, {dedupe:'rate'});await assert.rejects(h.infra.jobs.wait(id),/Rate/);
    assert.equal(calls,1);assert.equal(h.infra.state.jobs[id].state,'paused');assert.ok(h.infra.jobs._retryTimers.has(id));
    await h.infra.jobs.cancel(id);assert.equal(h.infra.jobs._retryTimers.has(id),false);
});
test('imported infrastructure is previewed and inactive jobs never auto-resume', async () => {
    const h=await infrastructureSetup();await h.c.saveValues(h.item,{manual:'Portable'});
    const backup=await h.data.export('backup');backup.infrastructure.jobs.JOB={id:'JOB',type:'structured-ai',payload:{annotation:h.infra.stableAnnotation(h.item),fieldIds:[]},dedupe:'import',paid:true,state:'running',attempts:1};
    const plan=await h.data.preview(backup,{mode:'merge',conflict:'incoming'});assert.equal(plan.infrastructure.jobs.JOB.state,'interrupted');
    await h.data.apply(plan);assert.equal(h.infra.state.jobs.JOB.state,'interrupted');assert.equal(h.infra.jobs.active.size,0);
});
test('sync-downloaded add notifications never launch new AI requests', async () => {
    const h=await infrastructureSetup();let requests=0;h.a.generateComment=async()=>{requests++;return 'Should not run';};
    await h.a._handlePaperNoteNotification('add',h.item.id,{[h.item.id]:{skipRenameFile:true}},Date.now());
    assert.equal(requests,0);
});
test('interrupted field lifecycle becomes failed/retryable on restart without losing the saved value', async () => {
    const h=await infrastructureSetup();await h.c.saveValues(h.item,{summary:'Keep saved value'});
    const field=h.a.annotationFields('#ffd400').find(f=>f.type==='ai');
    await h.infra.lifecycle.transition(h.item,field,'generating');await h.infra.init();
    assert.equal(h.infra.lifecycle.describe(h.item,field).state,'failed');assert.equal(h.c.get(h.item).values.summary,'Keep saved value');
});
test('infrastructure state corruption restores last validated recovery and protects future schemas', async () => {
    const h=await infrastructureSetup();const file=h.infra.path('infrastructure');
    h.files.set(file+'.recovery',clone(h.infra.state));h.files.set(file,'Corrupt');await h.infra.loadState();assert.equal(h.infra.state.version,1);
    assert.ok([...h.files].some(([p,v])=>p.includes('infrastructure.json.corrupt-')&&v==='Corrupt'));
    h.files.set(file,{version:99,jobs:{},notes:{}});await assert.rejects(h.infra.loadState(),/newer version/);assert.equal(h.files.get(file).version,99);
});
test('conversion notifier arriving before reader conversion resolves still transfers structured data', async () => {
    const h=await infrastructureSetup();await h.c.saveValues(h.item,{summary:'Saved source'});
    const replacement={...h.item,id:9,key:'NEWKEY01',annotationType:'underline'};
    h.a._activeStructuredConversions=new Map([['1:ANNKEY01',{libraryID:1,oldID:'ANNKEY01',oldAnnotationKey:'1:ANNKEY01',parentID:8,targetType:'underline',text:h.a._normText(h.item.annotationText)}]]);
    h.context.Zotero.Items.getAsync=async()=>replacement;h.a._updateResearchMetadata=async(_,fn)=>fn({annotations:{}});
    assert.equal(await h.a.handleConvertedAnnotation(9),true);assert.equal(h.c.get(replacement).values.summary,'Saved source');
});
test('managed identity rejects marker injection and reuse across different scopes', async () => {
    const h=await infrastructureSetup();const config={id:'note1',library:{type:'user',id:'1234'},scope:{type:'topic',key:'topic1'},mode:'auto',include:{text:true}};
    await h.infra.notes.configure(config);await assert.rejects(h.infra.notes.configure({...config,scope:{type:'topic',key:'topic2'}}),/another scope/);
    await assert.rejects(h.infra.notes.configure({...config,id:'<script>'}),/Invalid/);
});


function globalPreferencesFixture(h = globalSetup(setup(), [{id:'g_instruction',label:'Finding',type:'text'}])) {
    const doc=treeDocument(),host=doc.createElement('div'),textarea=doc.createElement('textarea'),status=doc.createElement('div');
    const nodes={'annota-global-fields-editor':host,'annota-global-fields':textarea,'annota-global-fields-status':status};
    doc.getElementById=id=>nodes[id]||null;h.context.document=doc;h.context.requestAnimationFrame=()=>{};h.context.Zotero.Annota=h.a;
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','preferences.js'),'utf8'),h.context);
    return {...h,doc,host,textarea,status};
}

test('global AI instruction editor appears on input before blur/change and preserves the stable field identity',()=>{
    const h=globalPreferencesFixture(),type=h.host.querySelector('.annota-fe-type');type.value='ai';type.events.input[0]();
    const prompt=h.host.querySelector('textarea.annota-fe-extra');assert.ok(prompt);assert.notEqual(prompt.hidden,true);
    prompt.value='Explain the scientific finding';prompt.events.input[0]();
    assert.equal(h.a.getGlobalFields()[0].prompt,prompt.value);assert.equal(h.a.getGlobalFields()[0].id,'g_instruction');
});

test('color AI instructions appear immediately and remain conditional by field type',()=>{
    const h=compactPreferences(),row=h.rows()[0];row.open=true;row.events.toggle[0]();
    const host=h.nodes['annota-fields-editor'],type=host.querySelector('.annota-fe-type');type.value='ai';type.events.input[0]();
    const ai=host.querySelectorAll('.annota-fe-row')[0];assert.ok(ai.querySelector('textarea.annota-fe-extra'));
    ai.querySelector('textarea').value='Keep this color instruction';ai.querySelector('textarea').events.input[0]();
    const next=ai.querySelector('.annota-fe-type');next.value='select';next.events.input[0]();
    const choices=host.querySelectorAll('.annota-fe-row')[0];assert.ok(choices.querySelector('input.annota-fe-extra'));assert.equal(choices.querySelector('textarea.annota-fe-extra'),null);
    const manual=choices.querySelector('.annota-fe-type');manual.value='text';manual.events.input[0]();
    assert.equal(host.querySelectorAll('.annota-fe-row')[0].querySelector('.annota-fe-extra'),null);
});

test('instruction drafts survive type changes and reopening preferences without altering saved values',async()=>{
    const h=globalPreferencesFixture(globalSetup(setup(),[{id:'g_instruction',label:'Finding',type:'ai',prompt:'Original instruction'}]));
    await h.c.saveValues(h.item,{g_instruction:'Saved evidence'});const before=clone(h.c.get(h.item).values);
    const type=h.host.querySelector('.annota-fe-type');type.value='text';type.events.input[0]();
    const reopened=globalPreferencesFixture(h),back=reopened.host.querySelector('.annota-fe-type');back.value='ai';back.events.input[0]();
    assert.equal(reopened.host.querySelector('textarea.annota-fe-extra').value,'Original instruction');assert.deepEqual(clone(h.c.get(h.item).values),before);
});

test('new PDF notes default to findings and populated fields with optional metadata and Tags disabled',async()=>{
    const h=await researchSetup();const config=h.research.configuration(h.scope,{type:'pdf'});
    for(const flag of ['publicationTitle','authors','year','citation','page','tags'])assert.equal(config.include[flag],false,flag);
    for(const flag of ['text','color','comment','global','colorFields','omitEmpty'])assert.equal(config.include[flag],true,flag);
    const auto=h.infra.notes.pdfConfig(h.parent,1);assert.equal(auto.include.citation,false);assert.equal(auto.include.page,false);assert.equal(auto.include.tags,false);
    h.item.annotationComment='Native finding';await h.c.saveValues(h.item,{manual:'Structured finding'});
    const result=await h.research.preview(h.scope,{type:'pdf'},{});assert.match(result.html,/Native finding|Structured finding/);assert.match(result.html,/annotation=ANNKEY01/);
    assert.doesNotMatch(result.html,/<strong>(Source|Page|Publication|Tags):|Not generated yet|Paper title/);
});

test('cross-publication metadata appears once per group while annotation links remain individual',async()=>{
    const h=await researchSetup(),second={...h.item,id:10,key:'ANNKEY02',annotationText:'Second finding'};
    const config=h.research.configuration(h.scope,{type:'color',colorIDs:[h.palette.resolve('#ffd400').id]},{include:{authors:true,citation:true}});
    const result=await h.infra.notes.compileAnnotations([h.item,second],config);
    for(const text of ['publication:PAPER001','Authors:','Source:'])assert.equal(result.html.split(text).length-1,1,text);assert.match(result.html,/Paper title/);
    assert.match(result.html,/annotation=ANNKEY01/);assert.match(result.html,/annotation=ANNKEY02/);
});

test('explicit legacy content settings remain unchanged when configuration is reopened',async()=>{
    const h=await researchSetup();await h.run({type:'pdf'},{include:{publicationTitle:true,authors:true,year:true,citation:true,page:true,tags:true,omitEmpty:false}});
    const saved=h.infra.notes.pdfConfig(h.parent,1),again=h.infra.notes.pdfConfig(h.parent,1);assert.deepEqual(clone(saved.include),clone(again.include));
    assert.equal(again.include.page,true);assert.equal(again.include.tags,true);assert.equal(again.include.omitEmpty,false);
});

test('simplifying an existing managed note retains its identity and positioned user content over repeated updates',async()=>{
    const h=await researchSetup();await h.run({type:'pdf'},{include:{publicationTitle:true,citation:true,page:true}});
    h.setHTML(h.html()+'<p>My interpretation stays here</p>');const key=h.infra.notes.pdfConfig(h.parent,1).noteKey;
    await h.run({type:'pdf'},{include:clone(h.research.defaults)});const initial=h.html();
    for(let i=0;i<10;i++)await h.run({type:'pdf'},{include:clone(h.research.defaults)});
    assert.equal(h.html(),initial);assert.equal(h.infra.notes.pdfConfig(h.parent,1).noteKey,key);
    assert.equal((h.html().match(/My interpretation stays here/g)||[]).length,1);assert.doesNotMatch(h.html(),/Source:<\/strong>|Page:<\/strong>/);
});

test('native workspace loads popup theme support and opaque backgrounds without custom dropdown infrastructure',()=>{
    const source=fs.readFileSync(path.join(__dirname,'..','research-workspace.xhtml'),'utf8');
    assert.match(source,/xml-stylesheet href="chrome:\/\/global\/skin\/"/);assert.match(source,/xml-stylesheet href="chrome:\/\/zotero\/skin\/zotero.css"/);
    assert.match(source,/#ContentSelectDropdownPopup\s*\{[^}]*background:Canvas !important; color:CanvasText !important/);
});

test('Tools submenu owns all three independent commands without duplicating toolbar integrations',async()=>{
    const h=await workspaceSetup();h.workspace.addToWindow(h.main);h.workspace.addToWindow(h.main);
    const menu=h.doc.getElementById('researchannotator-workspace-menu');assert.equal(menu.getAttribute('label'),'ResearchAnnotator');
    assert.deepEqual(menu.children[0].children.map(n=>n.getAttribute('label')),['Research Workspace','Annotation Review','Research Chat']);
    assert.equal(h.toolbar.children.filter(n=>n.id==='researchannotator-tb-workspace').length,1);h.workspace.removeFromWindow(h.main);assert.equal(h.doc.getElementById('researchannotator-workspace-menu'),null);
});

test('settings hierarchy retains unique legacy controls and makes layout/order permanently visible',()=>{
    const source=fs.readFileSync(path.join(__dirname,'..','preferences.xhtml'),'utf8');
    const visible=[...source.matchAll(/<html:section class="annota-settings-visible">([\s\S]*?)<\/html:section>/g)].map(m=>m[1]).join("\n");
    assert.match(visible,/id="annota-color-label-layout"/);assert.match(visible,/id="annota-paper-note-sort"/);assert.doesNotMatch(visible,/<html:details/);
    assert.match(source,/Advanced popup heading/);assert.match(source,/Advanced legacy prompt and layout/);assert.match(source,/<html:section id="annota-ai-trigger-section"[^>]*hidden="hidden">[\s\S]*name="annota-trigger"/);
});


function setAITrigger(h,trigger,hex=h.item.annotationColor) {
    const map=h.palette.map();map[hex]={...(map[hex]||{fields:'',prompt:'',template:''}),trigger};h.palette.setMap(map);
}

test('creation automatic trigger saves manual fields first and runs through a persistent shared AI job',async()=>{
    const h=await infrastructureSetup();h.item.annotationComment='Native comment stays exactly as typed';setAITrigger(h,'auto');h.a.handleResearchMetadata=async()=>{};h.a.handleConvertedAnnotation=async()=>false;
    h.a._pendingFields={text:h.item.annotationText,color:h.item.annotationColor,ts:Date.now(),values:{manual:'Creation manual'},attachmentID:h.item.parentID,libraryID:h.item.libraryID};
    let calls=0;h.a.generateComment=async()=>{calls++;assert.equal(h.c.get(h.item).values.manual,'Creation manual');assert.equal(h.infra.jobs.list().find(j=>j.state==='running').type,'structured-ai');return 'Queued automatic finding';};
    await h.a._handlePaperNoteNotification('add',h.item.id,{},Date.now());
    assert.equal(calls,1);assert.equal(h.c.get(h.item).values.summary,'Queued automatic finding');assert.equal(h.infra.jobs.list()[0].state,'completed');
    assert.equal(h.item.annotationComment,'Native comment stays exactly as typed');
});

test('manual creation saves manual content and waits for an explicit shared job request',async()=>{
    const h=await infrastructureSetup();setAITrigger(h,'manual');let calls=0;h.a.generateComment=async()=>{calls++;return 'Explicit finding';};
    h.a._pendingFields={text:h.item.annotationText,color:h.item.annotationColor,ts:Date.now(),values:{manual:'Independent'},attachmentID:h.item.parentID,libraryID:h.item.libraryID};
    await h.a.handleItem(h.item.id);assert.equal(calls,0);assert.equal(h.infra.jobs.list().length,0);assert.equal(h.c.get(h.item).values.manual,'Independent');assert.equal(h.a.canGenerateAIFields(h.item),true);
    await h.a.requestAIFields(h.item);assert.equal(calls,1);assert.equal(h.a.canGenerateAIFields(h.item),false);assert.equal(h.c.get(h.item).values.summary,'Explicit finding');
});

test('automatic and manual requests never overwrite completed values or start empty persistent jobs',async()=>{
    const h=await infrastructureSetup();await h.c.saveValues(h.item,{summary:'Completed finding',manual:'Manual finding'});let calls=0;h.a.generateComment=async()=>{calls++;return 'Wrong';};
    for(const trigger of ['auto','manual']){setAITrigger(h,trigger);await h.a.handleItem(h.item.id);await h.a.requestAIFields(h.item);}
    assert.equal(calls,0);assert.equal(h.infra.jobs.list().length,0);assert.equal(h.c.get(h.item).values.summary,'Completed finding');assert.equal(h.c.get(h.item).values.manual,'Manual finding');
});

test('duplicate concurrent creation/manual requests deduplicate provider calls using persistent jobs',async()=>{
    const h=await infrastructureSetup();let calls=0;h.a.generateComment=async()=>{calls++;await new Promise(r=>setTimeout(r,30));return 'One finding';};
    await Promise.all([h.a.requestAIFields(h.item),h.a.requestAIFields(h.item)]);assert.equal(calls,1);assert.equal(h.infra.jobs.list().length,1);
});

test('failed automatic job waits for explicit per-field retry and completed siblings are preserved',async()=>{
    const h=await infrastructureSetup();setAITrigger(h,'auto');let calls=0;h.a.generateComment=async()=>{calls++;throw Error('Provider offline');};
    await h.a.handleItem(h.item.id);assert.equal(calls,1);assert.equal(h.infra.jobs.list()[0].state,'failed');
    await h.a.requestAIFields(h.item,{automatic:true});assert.equal(calls,1);
    const field=h.a.annotationFields(h.item.annotationColor).find(f=>f.type==='ai'),doc=document(),retry=h.c.fieldRetry(doc,field,async()=>h.item,async()=>{});
    h.c.updateFieldRetry(retry,h.item,field);assert.equal(retry.hidden,false);h.a.generateComment=async()=>{calls++;return 'Retried finding';};
    await retry.events.click[0](clickEvent());assert.equal(calls,2);assert.equal(h.c.get(h.item).values.summary,'Retried finding');assert.equal(h.infra.jobs.list()[0].state,'completed');
});

test('manual trigger and global-only AI retain the saved per-color setting without local fields',async()=>{
    const h=await infrastructureSetup();h.a.saveGlobalFields([{id:'g_trigger_ai',label:'Global finding',type:'ai',prompt:'Explain'}]);
    const map=h.palette.map();map[h.item.annotationColor]={fields:'',template:'',prompt:'',trigger:'manual'};h.palette.setMap(map);
    assert.equal(h.a.getColorEntry(h.item.annotationColor).trigger,'manual');assert.equal(h.a.aiGenerationTrigger(h.item.annotationColor),'manual');
    let calls=0;h.a.generateComment=async()=>{calls++;return 'Global finding';};await h.a.handleItem(h.item.id);assert.equal(calls,0);assert.equal(h.a.canGenerateAIFields(h.item),true);
    await h.a.requestAIFields(h.item);assert.equal(calls,1);assert.equal(h.c.get(h.item).values.g_trigger_ai,'Global finding');
});

test('settings trigger is conditional and automatic/manual choices persist when switching colors',()=>{
    const h=compactPreferences(),section=h.doc.createElement('section');section.id='annota-ai-trigger-section';h.nodes[section.id]=section;h.panel.appendChild(section);
    const first=h.rows()[0],second=h.rows()[1];first.open=true;first.events.toggle[0]();h.a.colorPreferences.refreshTrigger();assert.equal(section.hidden,false);
    const radios=h.panel.querySelectorAll('input[name="annota-trigger"]'),manual=radios.find(r=>r.value==='manual');radios.forEach(r=>r.checked=r===manual);manual.events.change[0]();
    const hex=h.palette.resolve(first.dataset.colorId).hex;assert.equal(h.a.aiGenerationTrigger(hex),'manual');
    second.open=true;second.events.toggle[0]();first.open=true;first.events.toggle[0]();assert.equal(manual.checked,true);
    h.nodes['annota-fields'].value='finding | Finding | text';h.a.colorPreferences.flush();h.a.colorPreferences.refreshTrigger();assert.equal(section.hidden,true);assert.equal(h.a.aiGenerationTrigger(hex),'manual');
});

test('missing AI buttons are manual-only in existing popups while field Retry remains available in both modes',async()=>{
    for(const trigger of ['auto','manual']){
        const h=setup(),original=h.a.getColorEntry;h.a.getColorEntry=color=>({...original(color),trigger});const doc=document(),popup=doc.createElement('div');
        h.a._getResearchMetadata=async()=>({themes:[],experiments:[],annotations:{}});h.a._renderExistingAnnotationResearch({doc,popup,annotation:{id:h.item.key,libraryID:1},reader:{}});
        await new Promise(r=>setImmediate(r));const button=doc.created.find(el=>el.className==='annota-manual-generate-fields');assert.ok(button);assert.equal(button.hidden,trigger!=='manual');
        h.c.setGenerationState(h.item,{error:'Failure'});await new Promise(r=>setImmediate(r));assert.ok(doc.created.some(el=>el.className==='annota-popup-generate-fields'&&el.hidden===false));
    }
});

test('instruction edits and reader reopening do not queue AI in either trigger mode',async()=>{
    const h=await infrastructureSetup();await h.c.saveValues(h.item,{summary:'Keep result'});let calls=0;h.a.generateComment=async()=>{calls++;return 'Wrong';};
    for(const trigger of ['auto','manual']){setAITrigger(h,trigger);const map=h.palette.map();map[h.item.annotationColor].fields=map[h.item.annotationColor].fields.replace('Summarize','Changed instruction');h.palette.setMap(map);await h.a._handlePaperNoteNotification('modify',h.item.id,{},Date.now());await h.c.load();}
    assert.equal(calls,0);assert.equal(h.infra.jobs.list().length,0);assert.equal(h.c.get(h.item).values.summary,'Keep result');
});

test('explicit historical batch generation remains available for manual colors',async()=>{
    const h=await researchSetup();setAITrigger(h,'manual');let calls=0;h.a.generateComment=async()=>{calls++;return 'Historical result';};
    await h.run({type:'pdf'},{ai:'missing'});assert.equal(calls,1);assert.equal(h.c.get(h.item).values.summary,'Historical result');
});


test('shared AI HTTP calls disable Zotero internal 429/5xx retry while other calls keep their existing policy',async()=>{
    const h=setup(),requests=[];h.context.Zotero.HTTP={request:async(method,url,options)=>{requests.push(options);return {response:{}};}};
    h.a.provider=()=> 'openai';await h.a.httpJSON('http://127.0.0.1',{}, {},undefined,undefined,undefined,true);
    assert.equal(requests[0].errorDelayMax,0);assert.equal(requests[0].noRetryOnThrottle,true);
    await h.a.httpJSON('http://127.0.0.1',{},{});assert.equal(requests[1].errorDelayMax,undefined);
});


test('restored palette preferences retain Manual and missing trigger preferences default to Automatic',async()=>{
    const h=await infrastructureSetup();setAITrigger(h,'manual');const saved=clone(h.palette.ensure());
    const restored=await infrastructureSetup();restored.palette.save(saved);assert.equal(restored.a.aiGenerationTrigger(h.item.annotationColor),'manual');
    const map=restored.palette.map();delete map[h.item.annotationColor].trigger;restored.palette.setMap(map);assert.equal(restored.a.aiGenerationTrigger(h.item.annotationColor),'auto');
});


test('individual failed Retry waits while sibling generation is still running',async()=>{
    const h=setup(),field=h.a.annotationFields(h.item.annotationColor).find(f=>f.type==='ai'),doc=document();let calls=0;
    const retry=h.c.fieldRetry(doc,field,async()=>h.item,async()=>{});h.c.setFieldState(h.item,field,{error:'Failed'});h.c.setGenerationState(h.item,{running:true});h.a.requestAIFields=async()=>{calls++;};
    h.c.updateFieldRetry(retry,h.item,field);assert.equal(retry.hidden,false);assert.equal(retry.disabled,true);await retry.events.click[0](clickEvent());assert.equal(calls,0);
    h.c.setGenerationState(h.item,{error:'Failed'});h.c.updateFieldRetry(retry,h.item,field);assert.equal(retry.disabled,false);
});


test('sidebar generation header follows the same Manual/Automatic policy as the popup',async()=>{
    const h=setup(),doc=document(),card=doc.createElement('div'),hook=doc.createElement('span'),button=h.c.aiButton(doc);let mode='manual';const original=h.a.getColorEntry;
    h.a.getColorEntry=color=>({...original(color),trigger:mode});await h.c.load();h.context.Zotero.Items.get=()=>({libraryID:1});
    card._annotaCtx={reader:{itemID:8},annotation:{id:h.item.key,color:h.item.annotationColor,type:'highlight'}};card._annotaHook=hook;hook.querySelector=()=>button;
    const form=h.c.build(doc,card,{schema:h.a.annotationFields(h.item.annotationColor)});form._annotaColor=h.item.annotationColor;card.querySelector=selector=>selector.includes('annota-card-form')?form:null;
    await h.c.ensure(card);assert.equal(button.hidden,false);assert.equal(button.textContent,'Generate AI Fields');
    mode='auto';await h.c.ensure(card);assert.equal(button.hidden,true);
    mode='manual';await h.c.saveValues(h.item,{summary:'Completed'});await h.c.ensure(card);assert.equal(button.hidden,true);
});


async function networkSetup(){
    const h=await explorerSetup();
    h.second={...h.item,id:10,key:'ANNKEY02',annotationText:'Second scientific finding'};h.items.set(10,h.second);h.parent.getAnnotations=()=>[h.item.id,h.second.id];h.parent.isPDFAttachment=()=>true;
    h.otherPublication={...h.publication,id:41,key:'PAPER002',getDisplayTitle:()=> 'Second publication',getAttachments:()=>[]};h.items.set(41,h.otherPublication);
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..','research-network.js'),'utf8'),h.context);const network=h.context.AnnotaNetwork;network.install();
    return {...h,network,aRef:network.ref(h.item),bRef:network.ref(h.second),pubRef:network.ref(h.publication),otherPubRef:network.ref(h.otherPublication)};
}

async function groundedSetup(){
    const h=await networkSetup();h.context.URL=URL;let extraction=0,provider=0,clock=1,next=200;
    h.files.set('/pdf-one',true);h.parent.getFilePathAsync=async()=>'/pdf-one';h.parent.attachmentFilename='known.pdf';h.parent.getAnnotations=()=>[...h.items.values()].filter(a=>a.isAnnotation?.()&&a.parentID===h.parent.id&&!a.deleted).map(a=>a.id);
    h.context.Zotero.Utilities=h.context.Zotero.Utilities||{};h.context.IOUtils.stat=async()=>({size:300,lastModified:clock});h.context.Zotero.Utilities.Internal={...(h.context.Zotero.Utilities.Internal||{}),md5Async:async()=> 'fp'+clock,md5:text=>require('node:crypto').createHash('md5').update(String(text)).digest('hex')};h.context.Zotero.Utilities.generateObjectKey=()=>('CAP'+(++next)).padEnd(8,'X');
    h.context.Zotero.PDFWorker={getFullText:async()=>{extraction++;return {text:'Fatigue crack propagation increases under cyclic loading.\fThe specimen survives one million cycles.',extractedPages:2,totalPages:2};}};
    const originalGet=h.context.Zotero.Items.getAsync;h.context.Zotero.Items.getAsync=async ids=>Array.isArray(ids)?Promise.all(ids.map(id=>originalGet(id))):originalGet(ids);
    h.context.Zotero.Annotations={saveFromJSON:async(att,json)=>{const a={...h.item,id:next++,key:json.key,parentID:att.id,libraryID:att.libraryID,annotationType:json.type,annotationText:json.text,annotationComment:json.comment,annotationColor:json.color,annotationPosition:JSON.stringify(json.position),annotationPageLabel:json.pageLabel,annotationSortIndex:json.sortIndex,getTags:()=>json.tags,eraseTx:async()=>{a.deleted=true;}};h.items.set(a.id,a);return a;}};
    h.context.Zotero.Reader={open:async(id,location)=>({itemID:id,location})};h.a._syncPaperResearchNote=async()=>{};h.a.findReaderFor=()=>null;
    h.context.AnnotaChat={_history:[],loadHistory:async()=>{},keepHistory:()=>true,touch(){},writeHistory:async()=>{},refresh(){},provider:()=> 'openai',chatModel:()=>'',chatEffort:()=>'',modelLabel:()=> 'fixture'};
    h.a.complete=async request=>{provider++;const p=JSON.parse(request.context).sourcePassages[0];return 'Source findings: cyclic loading accelerates cracks ['+p.id+']';};
    for(const name of ['research-chat.js','evidence-capture.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',name),'utf8'),h.context);
    const chat=h.context.AnnotaResearchChat,capture=h.context.AnnotaEvidenceCapture;await chat.install();capture.install();
    const sources=await chat.allSources(h.scope),source=sources[0],index=()=>chat.indexSource(source,h.control),locate=()=>{h.a.findReaderFor=()=>({});h.a.getPDFDocument=()=>({numPages:1,getPageLabels:async()=>['iv'],getPageData:async()=>({chars:[...('Fatigue crack propagation increases under cyclic loading.')].map((c,i)=>({c,inlineRect:[10+i*2,20,12+i*2,30],lineBreakAfter:i===29}))})});};
    const message=async()=>{locate();await chat.indexSource(source,h.control,{coordinates:true});const passages=Object.values(chat.index.documents)[0].passages;return {id:'answer-1',role:'assistant',grounded:true,citations:passages,content:'Finding ['+passages[0].id+']'};};
    const conversation={id:'conv-fixture',libraryID:1,messages:[{role:'user',content:'fatigue cyclic loading',requestID:'request-fixture'}],groundedSources:h.scope};h.context.AnnotaChat._history=[conversation];
    return {...h,chat,capture,source,index,locate,message,conversation,stats:()=>({extraction,provider}),changeFile:()=>clock++};
}

test('grounded PDF indexing persists page-aware original passages and skips unchanged extraction',async()=>{const h=await groundedSetup();await h.index();const first=clone(h.chat.index);await h.index();assert.equal(h.stats().extraction,1);assert.deepEqual(clone(h.chat.index),first);assert.equal(Object.values(first.documents)[0].passages[1].pageIndex,1);assert.ok(h.files.has(h.chat.path()+'.recovery')===false);});
test('changed document fingerprints invalidate retrieval until explicit incremental indexing',async()=>{const h=await groundedSetup();await h.index();h.changeFile();assert.equal((await h.chat.retrieve('fatigue',h.scope)).passages.length,0);await h.index();assert.equal(h.stats().extraction,2);assert.equal((await h.chat.retrieve('fatigue',h.scope)).passages.length,1);});
test('missing PDFs remain visible and are excluded from retrieval and citation navigation',async()=>{const h=await groundedSetup();const m=await h.message();h.files.delete('/pdf-one');assert.equal((await h.chat.allSources(h.scope))[0].status,'missing');assert.equal((await h.chat.retrieve('fatigue',h.scope)).coverage.missing,1);await assert.rejects(h.chat.navigate(m.citations[0]),/missing/);});
test('source scopes include multiple PDF attachments, selected publications and optional subcollections',async()=>{const h=await groundedSetup();const two={...h.parent,id:88,key:'PDFKEY02',parentID:40,attachmentFilename:'second.pdf'};h.items.set(88,two);h.publication.getAttachments=()=>[h.parent.id,two.id];assert.equal((await h.chat.allSources({kind:'publications',library:h.scope.library,keys:[h.publication.key]})).length,2);h.context.Zotero.Collections.getByLibraryAndKey=()=>({getChildItems:()=>[],getChildCollections:()=>[{getChildItems:()=>[40],getChildCollections:()=>[]}]});assert.equal((await h.chat.allSources({kind:'collection',library:h.scope.library,key:'COLL0001'})).length,0);assert.equal((await h.chat.allSources({kind:'collection',library:h.scope.library,key:'COLL0001',subcollections:true})).length,2);});
test('custom source selection and library isolation cannot retrieve unselected attachments',async()=>{const h=await groundedSetup();await h.index();assert.equal((await h.chat.retrieve('fatigue',{kind:'custom',library:h.scope.library,keys:[]})).passages.length,0);assert.equal((await h.chat.retrieve('fatigue',{kind:'custom',library:h.scope.library,keys:[h.parent.key]})).passages.length,1);});
test('keyword retrieval is local, bounded, publication-diverse and usable without an embedding model',async()=>{const h=await groundedSetup();await h.index();const result=await h.chat.retrieve('fatigue cyclic loading',h.scope,{budget:2000,limit:1});assert.equal(result.passages.length,1);assert.ok(result.characters<=2000);assert.equal(h.stats().provider,0);assert.match(result.notice,/not establish an exhaustive/);});
test('citation validation removes fabricated evidence IDs and flags unsupported numeric references',async()=>{const h=await groundedSetup(),m=await h.message(),id=m.citations[0].id,result=h.chat.validateAnswer('Known ['+id+'] fake [E_invented] [99]',m.citations);assert.equal(result.citations.length,1);assert.equal(result.invalid.length,2);assert.doesNotMatch(result.content,/E_invented/);assert.match(result.warning,/invalid/);});
test('uncited answers are explicitly ungrounded and cannot be captured as evidence',async()=>{const h=await groundedSetup(),result=h.chat.validateAnswer('Model interpretation without evidence',[]);assert.match(result.warning,/No validated/);await assert.rejects(h.capture.preview({id:'a',grounded:false,citations:[]}),/validated/);});
test('reader character locations retain original text, page labels, offsets and multiline rectangles',async()=>{const h=await groundedSetup(),m=await h.message(),p=m.citations[0];assert.equal(p.pageLabel,'iv');assert.equal(p.start,0);assert.equal(p.end,p.text.length);assert.equal(p.position.rects.length,2);assert.equal(p.coordinateSource,'zotero-reader-chars');const result=await h.chat.navigate(p);assert.equal(result.exact,true);assert.equal(result.reader.location.position.pageIndex,0);});
test('worker-only citations honestly navigate to a page and reject inaccurate highlight capture',async()=>{const h=await groundedSetup();await h.index();const p=Object.values(h.chat.index.documents)[0].passages[1],r=await h.chat.navigate(p);assert.equal(r.exact,false);assert.deepEqual(clone(r.reader.location),{pageIndex:1});const preview=await h.capture.preview({id:'a',grounded:true,citations:[p]});assert.equal(preview.entries[0].eligible,false);assert.match(preview.entries[0].reason,/coordinates/);});
test('grounded answer jobs use existing provider, selected excerpts, validated citations and replay protection',async()=>{const h=await groundedSetup();await h.index();const job={id:'j'},payload={conversationID:h.conversation.id,requestID:'request-fixture'};await h.chat.runAnswer(payload,h.control,job);await h.chat.runAnswer(payload,h.control,job);assert.equal(h.stats().provider,1);assert.equal(h.conversation.messages.at(-1).citations.length,1);assert.equal(h.conversation.messages.at(-1).grounded,true);});
test('insufficient evidence answers make no generation request and clearly expose incomplete coverage',async()=>{const h=await groundedSetup();await h.chat.runAnswer({conversationID:h.conversation.id,requestID:'request-fixture'},h.control,{id:'j'});assert.equal(h.stats().provider,0);assert.match(h.conversation.messages.at(-1).content,/Insufficient/);assert.equal(h.conversation.messages.at(-1).coverage.pending,1);});
test('cancelled grounded generation cannot publish late answers',async()=>{const h=await groundedSetup();await h.index();let stopped=false;h.a.complete=async()=>{stopped=true;return 'late';};const control={...h.control,check(){if(stopped){const e=Error('Stopped');e.stopped=true;throw e;}}};await assert.rejects(h.chat.runAnswer({conversationID:h.conversation.id,requestID:'request-fixture'},control,{id:'j'}),/Stopped/);assert.equal(h.conversation.messages.length,1);});
test('explicit embeddings enforce consent and model configuration without indexing-time network requests',async()=>{const h=await groundedSetup();await h.index();await assert.rejects(h.chat.embed(['private'],true),/model/);h.prefs.set('researchannotator.chatEmbeddingModel','fixture');await assert.rejects(h.chat.embed(['private'],false),/approval/);assert.equal(h.stats().provider,0);});
test('hybrid retrieval uses separately configured embeddings and local keyword evidence',async()=>{const h=await groundedSetup();await h.index();h.prefs.set('researchannotator.chatEmbeddingModel','embed-fixture');let calls=0;h.context.Zotero.HTTP={request:async(_,url,opts)=>{calls++;assert.equal(url,'http://127.0.0.1:11434/api/embed');assert.equal(opts.noRetryOnThrottle,true);const n=JSON.parse(opts.body).input.length;return {response:{embeddings:Array.from({length:n},()=>[1,0,1])}};}};await h.chat.embedDocument(h.source.ref,true,h.control);const result=await h.chat.retrieve('cyclic fatigue',h.scope,{mode:'hybrid',consent:true});assert.equal(result.semanticUsed,true);assert.ok(result.passages.length);assert.equal(calls,2);assert.equal(h.chat.embeddingConfig().model,'embed-fixture');});
test('semantic retrieval rejects stale model vectors and never silently falls back to a paid embedding call',async()=>{const h=await groundedSetup();await h.index();await assert.rejects(h.chat.retrieve('fatigue',h.scope,{mode:'semantic'}),/model/);assert.equal(h.stats().provider,0);});
test('capture preview deduplicates citation passages and reports publication/PDF counts',async()=>{const h=await groundedSetup(),m=await h.message();m.citations.push(m.citations[0]);const p=await h.capture.preview(m);assert.equal(p.unique,1);assert.equal(p.publications,1);assert.equal(p.attachments,1);assert.equal(p.entries[0].eligible,true);});
test('single citation capture creates native original-text highlights with shared manual fields and no implicit AI',async()=>{const h=await groundedSetup(),m=await h.message(),preview=await h.capture.preview(m);let ai=0;h.a.requestAIFields=async()=>{ai++;};const result=await h.capture.enqueue(h.conversation,m,preview,{values:{manual:'Common theme'}});await h.infra.jobs.wait(result.jobID);const entry=h.capture.operations()[result.id].entries[0],a=await h.context.Zotero.Items.getAsync([...h.items.values()].find(i=>i.key===entry.annotationKey).id);assert.equal(a.annotationText,m.citations[0].text);assert.equal(h.c.get(a).values.manual,'Common theme');assert.equal(a.annotationComment,'');assert.equal(ai,0);assert.equal(entry.state,'completed');assert.equal(h.capture.handles(a),true);});
test('repeated capture and restarted operation reuse stable native annotation identities without duplicates',async()=>{const h=await groundedSetup(),m=await h.message(),p=await h.capture.preview(m);const first=await h.capture.enqueue(h.conversation,m,p,{});await h.infra.jobs.wait(first.jobID);const n=h.items.size;const second=await h.capture.enqueue(h.conversation,m,p,{});await h.infra.jobs.wait(second.jobID);assert.equal(second.id,first.id);assert.equal(h.items.size,n);const entry=h.capture.operations()[first.id].entries[0];await h.capture.patch(first.id,0,{state:'applied'});await h.capture.run({operationID:first.id},h.control,{id:'resume'});assert.equal(h.items.size,n);assert.equal(h.capture.operations()[first.id].entries[0].annotationKey,entry.annotationKey);});
test('existing matching annotations preserve colors, Comments, Tags and completed AI fields by default',async()=>{const h=await groundedSetup(),m=await h.message(),p=m.citations[0];h.item.annotationText=p.text;h.item.annotationPosition=JSON.stringify(p.position);h.item.annotationColor='#ff6666';h.item.annotationComment='My original comment';const tags=clone(h.item.getTags());await h.c.saveValues(h.item,{manual:'Existing',summary:'Completed AI'});const preview=await h.capture.preview(m);assert.equal(preview.entries[0].matches[0],h.item.key);const result=await h.capture.enqueue(h.conversation,m,preview,{values:{manual:'Replacement'}});await h.infra.jobs.wait(result.jobID);assert.equal(h.item.annotationColor,'#ff6666');assert.equal(h.item.annotationComment,'My original comment');assert.deepEqual(clone(h.item.getTags()),tags);assert.equal(h.c.get(h.item).values.summary,'Completed AI');assert.equal(h.c.get(h.item).values.manual,'Existing');});
test('same text at different PDF positions is not incorrectly reused',async()=>{const h=await groundedSetup(),m=await h.message();h.item.annotationText=m.citations[0].text;h.item.annotationPosition=JSON.stringify({pageIndex:0,rects:[[300,300,450,320]]});assert.equal((await h.capture.preview(m)).entries[0].matches.length,0);});
test('explicit replace capture and undo restore existing manual fields while retaining native annotations',async()=>{const h=await groundedSetup(),m=await h.message();h.item.annotationText=m.citations[0].text;h.item.annotationPosition=JSON.stringify(m.citations[0].position);await h.c.saveValues(h.item,{manual:'Before'});const result=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{values:{manual:'After'},conflict:'replace'});await h.infra.jobs.wait(result.jobID);assert.equal(h.c.get(h.item).values.manual,'After');const undo=await h.capture.undo(result.id);assert.equal(undo.restored,1);assert.equal(h.c.get(h.item).values.manual,'Before');assert.equal(h.item.deleted,undefined);});
test('operation undo removes only unchanged newly created annotations and protects subsequent edits',async()=>{const h=await groundedSetup(),m=await h.message(),result=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{});await h.infra.jobs.wait(result.jobID);const e=h.capture.operations()[result.id].entries[0],a=[...h.items.values()].find(i=>i.key===e.annotationKey);a.annotationComment='Subsequent author edit';const report=await h.capture.undo(result.id);assert.equal(report.kept,1);assert.equal(a.deleted,undefined);});
test('operation undo safely removes unchanged new highlights and retains recoverable journals',async()=>{const h=await groundedSetup(),m=await h.message(),result=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{});await h.infra.jobs.wait(result.jobID);const report=await h.capture.undo(result.id);assert.equal(report.removed,1);assert.ok(h.capture.operations()[result.id].undoneAt);assert.ok(report.backup);});
test('changed fingerprints are rechecked immediately before native capture',async()=>{const h=await groundedSetup(),m=await h.message(),preview=await h.capture.preview(m);h.changeFile();await assert.rejects(h.capture.enqueue(h.conversation,m,preview,{}),/No reliably/);assert.equal(h.items.size,6);});
test('capture manual/automatic policy requires explicit AI approval and never assigns AI fields as manual data',async()=>{const h=await groundedSetup(),m=await h.message();await assert.rejects(h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{values:{summary:'Fake AI'}}),/manual/);let calls=0;h.a.requestAIFields=async()=>{calls++;};const r=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{generateAI:true});await h.infra.jobs.wait(r.jobID);assert.equal(calls,1);});
test('rebuildable local indexes are excluded from complete research exports but capture provenance is retained',async()=>{const h=await groundedSetup(),m=await h.message(),r=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{});await h.infra.jobs.wait(r.jobID);const backup=await h.context.AnnotaData.export('backup');assert.equal(backup.infrastructure.evidenceCaptures[r.id].conversationID,h.conversation.id);assert.doesNotMatch(JSON.stringify(backup),/chat-index/);const settings=await h.context.AnnotaData.export('settings');assert.equal(settings.infrastructure.evidenceCaptures,undefined);});
test('minimal note defaults suppress Source/Page/Tags and preserve publication identity once per group',async()=>{const h=await researchSetup();const config=h.research.configuration(h.scope,{type:'color',colorIDs:[h.palette.resolve('#ffd400').id]});const c=await h.infra.notes.compileAnnotations([h.item],config);assert.match(c.html,/Paper title/);assert.doesNotMatch(c.html,/<strong>(Source|Page|Tags):/);for(const key of ['citation','page','tags','authors','year'])assert.equal(config.include[key],false);});
test('batch simplified defaults require preview, preserve explicit settings until confirmation, and back up before queued changes',async()=>{const h=await researchSetup();const config=h.research.configuration(h.scope,{type:'color',colorIDs:[h.palette.resolve('#ffd400').id]},{include:{page:true,citation:true}});await h.infra.notes.configure(config);const preview=h.research.previewDefaults([config.id]);assert.equal(h.infra.notes.config(config.library,config.scope).include.page,true);assert.equal(preview[0].after.page,false);h.infra.jobs.handlers.set('note-defaults',{handler:()=>{}});h.infra.jobs.kick=()=>{};const result=await h.research.applyDefaults(preview);assert.ok(result.backup);assert.equal(h.infra.notes.config(config.library,config.scope).include.page,true);assert.equal(h.infra.state.jobs[result.id].type,'note-defaults');});
test('stale batch defaults preview cannot overwrite settings edited in another view',async()=>{const h=await researchSetup();const c=h.research.configuration(h.scope,{type:'pdf'});await h.infra.notes.configure(c);const p=h.research.previewDefaults([c.id]);await h.infra.notes.configure({...c,include:{...c.include,page:true}});await assert.rejects(h.research.applyDefaults(p),/changed/);});
test('grounded index restart recovers stable evidence identities and original citation excerpts',async()=>{const h=await groundedSetup(),m=await h.message(),id=m.citations[0].id;vm.runInContext(fs.readFileSync(path.join(__dirname,'..','research-chat.js'),'utf8'),h.context);const restarted=h.context.AnnotaResearchChat;await restarted.load();assert.equal(Object.values(restarted.index.documents)[0].passages[0].id,id);assert.equal((await restarted.citationStatus(m.citations[0])).status,'available');});
test('large local passage keyword index bounds retrieved context and records measured responsiveness',async()=>{const h=await groundedSetup();await h.index();const doc=Object.values(h.chat.index.documents)[0],base=doc.passages[0];doc.passages=Array.from({length:12000},(_,i)=>({...base,id:'E_perf_'+i,text:'Fatigue specimen '+i+' cyclic propagation measured locally'}));const t=performance.now();h.chat.termIndex();const index=performance.now()-t,start=performance.now(),r=await h.chat.retrieve('fatigue propagation',h.scope,{budget:6000,limit:8});assert.ok(r.passages.length<=8);assert.ok(r.characters<=6000);console.log('Chat performance: 12000 passages; index '+index.toFixed(1)+'ms; retrieval '+(performance.now()-start).toFixed(1)+'ms; index JSON '+Buffer.byteLength(JSON.stringify(h.chat.index))+' bytes');});
test('provider integration uses the existing cancellable token and removes cancellation listeners',async()=>{const h=await groundedSetup();let aborted=false;h.a.complete=async(_,opts)=>{opts.cancel.onCancel(()=>{aborted=true;});for(const fn of h.infra.jobs.listeners)fn({id:'CANCEL',state:'cancelled'});throw Error('Aborted');};await assert.rejects(h.chat.complete({}, {},{id:'CANCEL'}),e=>e.stopped===true);assert.equal(aborted,true);assert.equal(h.chat.tokens.size,0);});
test('unchanged closed PDFs are not re-extracted merely because capture coordinates were requested',async()=>{const h=await groundedSetup();await h.index();await h.chat.indexSource(h.source,h.control,{coordinates:true});assert.equal(h.stats().extraction,1);});
test('capture merges existing multi-select categories without overwriting other fields',async()=>{const h=await groundedSetup();h.a.saveGlobalFields([{id:'g_theme',label:'Theme',type:'multiselect',options:['Fatigue','Mechanics']}]);const field=h.a.getGlobalFields()[0],ids=h.a.categoryIDs(field,['Fatigue','Mechanics']),m=await h.message();h.item.annotationText=m.citations[0].text;h.item.annotationPosition=JSON.stringify(m.citations[0].position);await h.c.saveValues(h.item,{g_theme:[ids[0]],manual:'Retain'});const op=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{values:{g_theme:[ids[1]],manual:'Overwrite?'},conflict:'merge'});await h.infra.jobs.wait(op.jobID);assert.deepEqual(clone(h.c.get(h.item).values.g_theme),clone(ids));assert.equal(h.c.get(h.item).values.manual,'Retain');});
test('capture supports multi-publication/page evidence, question associations and shared managed note compilation',async()=>{const h=await groundedSetup(),m=await h.message(),secondPDF={...h.parent,id:88,key:'PDFKEY02',parentID:h.otherPublication.id};h.items.set(88,secondPDF);secondPDF.getAnnotations=()=>[...h.items.values()].filter(a=>a.isAnnotation?.()&&a.parentID===88&&!a.deleted).map(a=>a.id);h.otherPublication.getAttachments=()=>[88];const p={...clone(m.citations[0]),id:'E_second',ref:h.chat.ref(secondPDF),publication:h.chat.ref(h.otherPublication),pageIndex:1,pageLabel:'2',position:{pageIndex:1,rects:[[10,20,130,30]]},text:'Second publication original evidence'};m.citations.push(p);const q=await h.network.saveQuestion({library:h.scope.library,title:'Fatigue question'}),op=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{questionID:q.id,role:q.roles[0],values:{manual:'Shared'}});await h.infra.jobs.wait(op.jobID);assert.equal(h.capture.operations()[op.id].entries.length,2);assert.equal(h.network.state().questions[q.id].evidence.length,2);const keys=h.capture.operations()[op.id].entries.map(e=>e.annotationKey),data=await h.research.inspect(h.scope,{type:'evidence',annotationKeys:keys});assert.equal(data.items.length,2);const config=h.research.configuration(h.scope,{type:'evidence',annotationKeys:keys}),compiled=await h.infra.notes.compileAnnotations(data.items,config);assert.match(compiled.html,/Second publication original evidence/);assert.match(compiled.html,/Shared/);});
test('interrupted capture resumes its planned native key and preserves partial successes',async()=>{const h=await groundedSetup(),m=await h.message();h.infra.jobs.kick=()=>{};const op=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{}),entry=h.capture.operations()[op.id].entries[0];await h.context.Zotero.Annotations.saveFromJSON(h.parent,{key:entry.annotationKey,type:'highlight',text:entry.passage.text,color:'#ffd400',comment:'',pageLabel:'iv',sortIndex:'0',position:entry.passage.position,tags:[]});const size=h.items.size;await h.capture.run({operationID:op.id},h.control,{id:'resume'});assert.equal(h.items.size,size);assert.equal(h.capture.operations()[op.id].entries[0].state,'completed');});
test('capture undo does not overwrite manual values edited after capture on reused annotations',async()=>{const h=await groundedSetup(),m=await h.message();h.item.annotationText=m.citations[0].text;h.item.annotationPosition=JSON.stringify(m.citations[0].position);await h.c.saveValues(h.item,{manual:'Before'});const op=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{values:{manual:'Capture'},conflict:'replace'});await h.infra.jobs.wait(op.jobID);await h.c.saveValues(h.item,{manual:'Later author edit'});const undo=await h.capture.undo(op.id);assert.equal(undo.kept,1);assert.equal(h.c.get(h.item).values.manual,'Later author edit');});
test('batch defaults update the same managed note and retain positioned genuine user content',async()=>{const h=await researchSetup();const config=await h.run({type:'color',colorIDs:[h.palette.resolve('#ffd400').id]},{include:{page:true,citation:true}}),note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id);note.setNote(note.getNote()+'<h3>Author interpretation</h3><p>Retained authored paragraph</p>');const key=note.key,preview=h.research.previewDefaults([config.id]);await h.research.runDefaults({preview,backup:'test-backup'},h.control,{});assert.equal(note.key,key);assert.match(note.getNote(),/Retained authored paragraph/);assert.doesNotMatch(note.getNote(),/<strong>(Source|Page):/);});
test('capture checkpoint replay never absorbs subsequent author edits into its undo ownership',async()=>{const h=await groundedSetup(),m=await h.message(),result=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{});await h.infra.jobs.wait(result.jobID);const e=h.capture.operations()[result.id].entries[0],a=[...h.items.values()].find(i=>i.key===e.annotationKey);a.annotationComment='After capture author edit';await h.capture.patch(result.id,0,{state:'applied'});await h.capture.run({operationID:result.id},h.control,{id:'replay'});assert.equal(h.capture.operations()[result.id].entries[0].nativeAfter.comment,'');const undo=await h.capture.undo(result.id);assert.equal(undo.kept,1);assert.equal(a.deleted,undefined);});
test('history-off grounded conversations remain usable without writing private conversation history',async()=>{const h=await groundedSetup();await h.index();let writes=0;h.context.AnnotaChat.keepHistory=()=>false;h.context.AnnotaChat.writeHistory=async()=>{writes++;};await h.chat.answer(h.conversation);assert.equal(writes,0);assert.equal(h.conversation.messages.at(-1).grounded,true);});
test('capture optional AI uses shared child jobs without deadlocking single-concurrency execution',{timeout:4000},async()=>{const h=await groundedSetup(),m=await h.message();h.prefs.set('researchannotator.aiConcurrency',1);h.a.generateComment=async()=> 'Captured AI result';const base=h.infra.jobs.handlers.get('structured-ai').handler;h.infra.jobs.register('structured-ai',async(p,c,j)=>{try{await base(p,c,j);}finally{await h.capture.recordAICompletion(await h.infra.resolve(p.annotation),p.capture,p.fieldIds);}},{paid:true});const result=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{generateAI:true});await h.infra.jobs.wait(result.jobID);const entry=h.capture.operations()[result.id].entries[0];assert.ok(entry.aiJobID);await h.infra.jobs.wait(entry.aiJobID);assert.equal(h.infra.state.jobs[entry.aiJobID].parentJobID,result.jobID);assert.equal(h.capture.operations()[result.id].entries[0].after.summary,'Captured AI result');const undo=await h.capture.undo(result.id);assert.equal(undo.removed,1);});
test('cancelled capture cannot enqueue paid children and cancels already queued dependencies',async()=>{const h=await groundedSetup();h.infra.jobs.kick=()=>{};h.infra.jobs.register('parent-fixture',async()=>{});const parent=await h.infra.jobs.enqueue('parent-fixture',{}, {dedupe:'P'});await h.infra.jobs.update(parent,{state:'running'});const child=await h.infra.jobs.enqueue('structured-ai',{annotation:h.infra.stableAnnotation(h.item),fieldIds:['field']},{dedupe:'C',paid:true,parentJobID:parent});await h.infra.jobs.cancel(parent);assert.equal(h.infra.state.jobs[child].state,'cancelled');await assert.rejects(h.infra.jobs.enqueue('structured-ai',{annotation:h.infra.stableAnnotation(h.item),fieldIds:['field']},{dedupe:'C2',paid:true,parentJobID:parent}),e=>e.stopped===true);});
test('grounded prompts fit the existing local provider budget including history and optional context',async()=>{const h=await groundedSetup();await h.index();h.context.AnnotaChat.budget=()=>6000;h.conversation.messages.unshift(...Array.from({length:8},()=>({role:'assistant',content:'Prior interpretation '.repeat(100)})));let checked=false;h.a.complete=async prompt=>{assert.ok(JSON.stringify(prompt).length<=6000);checked=true;const p=JSON.parse(prompt.context).sourcePassages[0];return 'Source findings ['+p.id+']';};await h.chat.runAnswer({conversationID:h.conversation.id,requestID:'request-fixture'},h.control,{id:'J'});assert.equal(checked,true);assert.equal(h.conversation.messages.at(-1).citations.length,1);});
test('capture undo preserves later sidecar reference edits even when visible field values are unchanged',async()=>{const h=await groundedSetup(),m=await h.message(),op=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{});await h.infra.jobs.wait(op.jobID);const e=h.capture.operations()[op.id].entries[0],a=[...h.items.values()].find(i=>i.key===e.annotationKey);await h.c.saveValues(a,{},'Later authored reference');const undo=await h.capture.undo(op.id);assert.equal(undo.kept,1);assert.equal(a.deleted,undefined);});
test('optional research notes reuse inherited note-proposal contexts without turning them into original PDF citations',async()=>{const h=await groundedSetup();await h.index();const note={id:55,key:'NOTEKEY1',isNote:()=>true,getNote:()=>'<p>Author interpretation</p>'};h.items.set(55,note);h.publication.getNotes=()=>[55];Object.assign(h.context.AnnotaChat,{newNoteContext:()=>({keys:{},tokens:[],libraryID:1}),notesBlock:(notes,max,ctx)=>{ctx.keys.NOTEKEY1={libraryID:1,truncated:false};return '[note NOTEKEY1]\nAuthor interpretation';},NOTE_RULES:['Only propose guarded note changes for explicitly supplied notes.']});h.conversation.retrieval={context:{notes:true}};await h.chat.runAnswer({conversationID:h.conversation.id,requestID:'request-fixture'},h.control,{id:'N'});const answer=h.conversation.messages.at(-1);assert.ok(answer.notes.keys.NOTEKEY1);assert.equal(answer.citations[0].ref.key,h.parent.key);assert.notEqual(answer.citations[0].ref.key,note.key);});
test('capture assignments use stable field IDs and never confuse same-named fields on different colors',async()=>{const h=await groundedSetup(),m=await h.message(),map=h.palette.map();map['#ff6666']={fields:'manual | Different meaning | text',prompt:'',template:'',trigger:'manual'};h.palette.setMap(map);h.item.annotationText=m.citations[0].text;h.item.annotationPosition=JSON.stringify(m.citations[0].position);h.item.annotationColor='#ff6666';const selected=h.a.annotationFields('#ffd400').find(f=>f.name==='manual'),actual=h.a.annotationFields('#ff6666').find(f=>f.name==='manual');assert.notEqual(selected.id,actual.id);const op=await h.capture.enqueue(h.conversation,m,await h.capture.preview(m),{color:'#ffd400',values:{manual:'Yellow meaning'}});await h.infra.jobs.wait(op.jobID);assert.notEqual(h.c.get(h.item)?.values.manual,'Yellow meaning');assert.equal(h.item.annotationColor,'#ff6666');});
test('embedding approval is bound to the configured destination/model and cannot drift between batches',async()=>{const h=await groundedSetup();await h.index();h.prefs.set('researchannotator.chatEmbeddingModel','approved');const doc=Object.values(h.chat.index.documents)[0],base=doc.passages[0];doc.passages=Array.from({length:25},(_,i)=>({...base,id:'E_scope_'+i}));const signature=h.chat.embeddingConfig().signature;let calls=0;h.context.Zotero.HTTP={request:async()=>{calls++;h.prefs.set('researchannotator.chatEmbeddingEndpoint','https://unapproved.invalid/embeddings');return {response:{embeddings:Array.from({length:24},()=>[1,0])}};}};await assert.rejects(h.chat.embedDocument(h.source.ref,true,h.control,signature),/configuration changed/);assert.equal(calls,1);await assert.rejects(h.chat.retrieve('fatigue',h.scope,{mode:'hybrid',consent:true,embeddingSignature:signature}),/configuration changed/);assert.equal(calls,1);});
test('historical Chat collection selections remain scoped when continuing an older conversation',async()=>{const h=await groundedSetup();await h.index();delete h.conversation.groundedSources;h.conversation.scope='library';h.conversation.collections=['COLL0001'];h.conversation.subcollections=false;await h.chat.answer(h.conversation);assert.equal(h.conversation.groundedSources.kind,'collections');assert.deepEqual(clone(h.conversation.messages[0].groundedRequest.sources.keys),['COLL0001']);assert.equal(h.conversation.groundedSources.subcollections,false);});

async function refinementSetup(){const h=await researchSetup();h.context.Zotero.Items.get=id=>h.items.get(id);h.context.Zotero.Items.getByLibraryAndKey=(libraryID,key)=>[...h.items.values()].find(i=>i.key===key&&i.libraryID===libraryID);vm.runInContext(fs.readFileSync(path.join(__dirname,'..','note-presentation.js'),'utf8'),h.context);return {...h,presentation:h.context.AnnotaNotePresentation};}
test('PDF default titles use the exact parent publication title without a suffix',async()=>{const h=await refinementSetup();h.publication.getField=()=> 'Exact title: α & fatigue';assert.equal(h.presentation.pdfTitle(h.parent),'Exact title: α & fatigue');assert.equal(h.infra.notes.pdfConfig(h.parent,1).title,'Exact title: α & fatigue');});
test('multiple PDF attachments retain distinct managed identities with the same exact publication title',async()=>{const h=await refinementSetup(),second={...h.parent,id:19,key:'PDFKEY02'};const a=h.infra.notes.pdfConfig(h.parent,1),b=h.infra.notes.pdfConfig(second,1);assert.equal(a.title,b.title);assert.notEqual(h.infra.notes.identity(a.library,a.scope),h.infra.notes.identity(b.library,b.scope));assert.notEqual(a.id,b.id);});
test('field titles resolve stable field IDs and selected categorical labels',async()=>{const h=await refinementSetup();h.research.fields=()=>[{id:'F',label:'Experimental method',type:'multiselect'}];h.a.categoryLabels=()=>['Fatigue testing'];assert.equal(h.presentation.title(h.scope,{type:'field',fieldID:'F',values:['VALUE']}),'Experimental method — Fatigue testing');});
test('color titles use semantic color labels and research findings',async()=>{const h=await refinementSetup();h.research.colors=()=>[{id:'C',label:'Method',hex:'#ffd400'}];assert.equal(h.presentation.title(h.scope,{type:'color',colorIDs:['C']}),'Method — research findings');});
test('saved-search and research-question titles reuse the saved context names',async()=>{const h=await refinementSetup();h.context.AnnotaExplorer={saved:()=>[{id:'S',name:'Crack propagation'}]};h.context.AnnotaNetwork={state:()=>({questions:{Q:{title:'What controls crack growth?'}},relationships:{}})};assert.equal(h.presentation.title(h.scope,{type:'explorer',query:{id:'S'}}),'Crack propagation');assert.equal(h.presentation.title(h.scope,{type:'network',questionID:'Q'}),'What controls crack growth?');});
test('relationship titles include relationship type and context',async()=>{const h=await refinementSetup();h.context.AnnotaNetwork={state:()=>({types:{supports:{label:'Supports'}},relationships:{R:{type:'supports',explanation:'Cyclic-load comparison'}}})};assert.equal(h.presentation.title(h.scope,{type:'network',relationshipID:'R'}),'Supports — Cyclic-load comparison');});
test('note stamps preserve an independently edited title during regeneration',async()=>{const h=await refinementSetup(),config=h.infra.notes.pdfConfig(h.parent,1),html='<h1>My edited &amp; reviewed title</h1><p>User text</p>';const stamped=h.infra.notes.stamp(html,{...config,title:'Different default'});assert.equal(h.presentation.readTitle(stamped),'My edited & reviewed title');assert.match(stamped,/User text/);});
test('explicit Rename updates title without changing native or managed identity',async()=>{const h=await refinementSetup(),config={...h.infra.notes.pdfConfig(h.parent,1),noteKey:h.note.key};await h.infra.notes.configure(config);await h.research.rename(config,'My chosen title');assert.equal(h.presentation.readTitle(h.html()),'My chosen title');assert.equal(h.infra.notes.config(config.library,config.scope).id,config.id);assert.equal(h.infra.notes.config(config.library,config.scope).noteKey,h.note.key);});
test('default non-PDF destination remains in the source library',async()=>{const h=await refinementSetup();const d=await h.presentation.resolveDestination(h.scope);assert.equal(d.kind,'library');assert.deepEqual(clone(d.library),h.scope.library);});
test('Ask every time blocks generation until a destination is explicitly selected',async()=>{const h=await refinementSetup();h.presentation.savePreferences({mode:'ask',defaults:{},last:{}});await assert.rejects(h.presentation.resolveDestination(h.scope),/Choose a destination/);assert.equal((await h.presentation.resolveDestination(h.scope,{kind:'library',library:h.scope.library})).kind,'library');});
test('Remember last destinations persist independently by stable library identity',async()=>{const h=await refinementSetup(),d={kind:'collection',library:h.scope.library,key:'COLL1'};h.context.Zotero.Collections.getByLibraryAndKey=()=>({id:1,libraryID:1});h.presentation.savePreferences({mode:'last',defaults:{},last:{'user:1234':d}});assert.equal((await h.presentation.resolveDestination(h.scope)).key,'COLL1');assert.equal(JSON.parse(h.prefs.get('researchannotator.noteDestination')).mode,'last');});
test('deleted collections and unavailable parent destinations fail without fallback',async()=>{const h=await refinementSetup();h.context.Zotero.Collections.getByLibraryAndKey=()=>null;await assert.rejects(h.presentation.validateDestination({kind:'collection',library:h.scope.library,key:'GONE'},h.scope.library),/unavailable/);await assert.rejects(h.presentation.validateDestination({kind:'parent',library:h.scope.library,key:'GONE'},h.scope.library),/unavailable/);});
test('destinations reject another library rather than silently redirect research notes',async()=>{const h=await refinementSetup();await assert.rejects(h.presentation.validateDestination({kind:'library',library:{type:'group',id:'999'}},h.scope.library),/source library/);});
test('collection membership and parent publication attachment have distinct placement semantics',async()=>{const h=await refinementSetup(),note={libraryID:1,setCollections(v){this.collections=v;}};h.context.Zotero.Collections.getByLibraryAndKey=()=>({id:6,libraryID:1});await h.presentation.applyDestination(note,{kind:'collection',library:h.scope.library,key:'COLL1'});assert.equal(note.parentID,false);assert.deepEqual(clone(note.collections),[6]);await h.presentation.applyDestination(note,{kind:'parent',library:h.scope.library,key:h.publication.key});assert.equal(note.parentID,h.publication.id);assert.deepEqual(clone(note.collections),[]);});
test('existing note updates retain location regardless of a newly selected destination',async()=>{const h=await refinementSetup(),d={kind:'parent',library:h.scope.library,key:'PAPER001'};assert.deepEqual(clone(await h.presentation.resolveDestination(h.scope,{kind:'library',library:h.scope.library},{noteKey:'N',destination:d})),d);});
test('explicit Move keeps identity/content and creates a recoverable backup',async()=>{const h=await refinementSetup(),config={...h.research.configuration(h.scope,{type:'field',fieldID:'F',values:[]}),noteKey:h.note.key};await h.infra.notes.configure(config);const html=h.html();h.note.parentID=40;h.note.getCollections=()=>[];h.note.setCollections=v=>{h.note.collections=v;};const result=await h.presentation.move(config,{kind:'library',library:h.scope.library});assert.equal(result.key,h.note.key);assert.ok(result.backup);assert.equal(h.html(),html);assert.equal(h.note.parentID,false);assert.equal(h.infra.notes.config(config.library,config.scope).id,config.id);});
test('PDF notes cannot use the non-PDF Move action',async()=>{const h=await refinementSetup();await assert.rejects(h.presentation.move(h.infra.notes.pdfConfig(h.parent,1),{kind:'library',library:h.scope.library}),/original PDF association/);});
test('managed quotations separate semantic color from ordinary navigable text',async()=>{const h=await refinementSetup();await h.a._syncPaperResearchNote(h.item);const html=h.html(),link=html.match(/<a href="zotero:\/\/open-pdf[^>]*>([\s\S]*?)<\/a>/)?.[1];assert.ok(link);assert.doesNotMatch(link,/<mark|background|color:/);assert.match(html,/<h2>/);assert.match(html,/&ldquo;|“/);assert.match(html,/&rdquo;|”/);assert.match(html,/<span style="color:#[0-9a-f]{6};">&#9632;<\/span>/);});
test('vertical geometry shares all available width and slanted dimensions are uniform',()=>{const h=milestoneSetup(),sizes=[{width:50,height:24},{width:160,height:24},{width:90,height:24}],vertical=h.palette.geometryPlan('vertical',sizes,480),slanted=h.palette.geometryPlan('slanted',sizes,480);assert.equal(vertical.width,480);assert.ok(vertical.items.every(i=>i.slotWidth===160));assert.equal(new Set(slanted.items.map(i=>i.width)).size,1);assert.equal(slanted.items[0].width,160);assert.equal(new Set(slanted.items.map(i=>i.top)).size,1);});
test('retrieval diagnostics distinguish absent indexing from indexed nonmatching passages',async()=>{const h=await groundedSetup();const absent=await h.chat.retrieve('fatigue',h.scope);assert.equal(absent.diagnostics.state,'no-indexed-evidence');await h.index();const unmatched=await h.chat.retrieve('quantum unrelated',h.scope);assert.equal(unmatched.diagnostics.state,'no-matching-passages');assert.equal(h.stats().provider,0);});
test('retrieval diagnostics record source locations, ranks and selected evidence without provider calls',async()=>{const h=await groundedSetup();await h.index();const result=await h.chat.retrieve('fatigue',h.scope);assert.equal(result.diagnostics.retrieved.length,1);assert.equal(result.diagnostics.retrieved[0].rank,1);assert.equal(result.diagnostics.retrieved[0].id,result.passages[0].id);assert.equal(result.diagnostics.retrieved[0].pageIndex,0);assert.equal(h.stats().provider,0);});
test('generation failures retain actual supplied evidence and a distinct diagnostic state',async()=>{const h=await groundedSetup();await h.index();h.a.complete=async()=>{throw Error('Simulated provider failure');};await assert.rejects(h.chat.runAnswer({conversationID:h.conversation.id,requestID:'request-fixture'},h.control,{id:'J'}),/provider failure/);assert.equal(h.conversation.diagnostics.state,'generation-failed');assert.ok(h.conversation.diagnostics.supplied.length);});
test('diagnostic coverage reports missing and partly indexed selected sources accurately',async()=>{const h=await groundedSetup();await h.index();const other={...h.parent,id:88,key:'PDFKEY02',getFilePathAsync:async()=>'/unavailable'};h.items.set(88,other);h.publication.getAttachments=()=>[h.parent.id,88];const result=await h.chat.retrieve('fatigue',{kind:'publications',library:h.scope.library,keys:[h.publication.key]});assert.equal(result.diagnostics.counts.selected,2);assert.equal(result.diagnostics.counts.indexed,1);assert.equal(result.diagnostics.counts.missing,1);});

test('Network relationship CRUD uses stable library-aware identities and recoverable atomic state',async()=>{
    const h=await networkSetup(),r=await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports',explanation:'Mechanics supports this finding',supporting:[h.aRef]});
    assert.equal(r.provenance.kind,'manual');assert.equal(r.revision,1);assert.equal(h.network.relationships(h.aRef).total,1);
    const edited=await h.network.saveRelationship({...r,explanation:'Updated interpretation'},{expectedRevision:1});assert.equal(edited.id,r.id);assert.equal(edited.revision,2);
    await h.network.deleteRelationship(r.id,2);assert.equal(h.network.relationships(h.aRef).total,0);assert.ok(h.network.state().relationships[r.id].deletedAt);assert.ok(h.files.has(h.infra.path('infrastructure')+'.recovery'));
});

test('Network directional inverse views share one stored relationship',async()=>{
    const h=await networkSetup();await h.network.saveRelationship({source:h.pubRef,target:h.otherPubRef,type:'uses_method'});
    assert.equal(h.network.relationships(h.pubRef).records[0].orientation,'outgoing');assert.equal(h.network.relationships(h.otherPubRef).records[0].displayType,'Method used by');assert.equal(Object.keys(h.network.state().relationships).length,1);
});

test('Network symmetric duplicates, direct duplicates and unintended self-links are rejected',async()=>{
    const h=await networkSetup();await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'related'});
    await assert.rejects(h.network.saveRelationship({source:h.bRef,target:h.aRef,type:'related'}),/Duplicate/);
    await assert.rejects(h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'related'}),/Duplicate/);
    await assert.rejects(h.network.saveRelationship({source:h.aRef,target:h.aRef,type:'supports'}),/Self/);
    assert.equal(h.network.relationships(h.bRef).records[0].orientation,'symmetric');
});

test('Network annotation/publication relationships and supporting references validate native kinds',async()=>{
    const h=await networkSetup();await h.network.saveRelationship({source:h.aRef,target:h.pubRef,type:'supports',supporting:[h.bRef]});
    await assert.rejects(h.network.saveRelationship({source:{...h.aRef,kind:'publication'},target:h.pubRef,type:'extends'}),/invalid/);
    await assert.rejects(h.network.saveRelationship({source:h.aRef,target:h.pubRef,type:'extends',supporting:[h.pubRef]}),/supporting annotation/);
});

test('Network type rename retains identity, inverse semantics and safe archival',async()=>{
    const h=await networkSetup(),type=await h.network.saveType({label:'Tests hypothesis',inverse:'Tested by',direction:'directed'});
    const rel=await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:type.id});await h.network.saveType({...type,label:'Evaluates hypothesis',inverse:'Evaluated by'});
    assert.equal(h.network.relationships(h.bRef).records[0].displayType,'Evaluated by');assert.equal(h.network.state().relationships[rel.id].type,type.id);
    await assert.rejects(h.network.saveType({...type,direction:'symmetric'}),/retain their directionality/);
    await h.network.saveType({...h.network.state().types[type.id],archived:true});await assert.rejects(h.network.saveRelationship({source:h.bRef,target:h.pubRef,type:type.id}),/active/);assert.equal(h.network.relationships(h.aRef).total,1);
});

test('Network concurrent edits reject a stale revision rather than merging unrelated fields',async()=>{
    const h=await networkSetup(),rel=await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports'});
    const writes=await Promise.allSettled([h.network.saveRelationship({...rel,explanation:'First'},{expectedRevision:1}),h.network.saveRelationship({...rel,explanation:'Second'},{expectedRevision:1})]);
    assert.equal(writes.filter(r=>r.status==='fulfilled').length,1);assert.match(writes.find(r=>r.status==='rejected').reason.message,/changed/);
});

test('Network failed durable writes preserve prior committed relationships',async()=>{
    const h=await networkSetup();await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports'});const before=clone(h.network.state());const writer=h.context.IOUtils.writeJSON;h.context.IOUtils.writeJSON=async(file,...args)=>{if(file===h.infra.path('infrastructure'))throw Error('Disk full');return writer(file,...args);};
    await assert.rejects(h.network.saveRelationship({source:h.pubRef,target:h.otherPubRef,type:'reviews'}),/Disk full/);assert.deepEqual(clone(h.network.state()),before);
});

test('Network missing, deleted and temporarily unavailable sources retain explicit relationships',async()=>{
    const h=await networkSetup();await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'contradicts'});h.second.deleted=true;
    assert.equal((await h.network.resolve(h.bRef)).status,'deleted');assert.equal(h.network.relationships(h.aRef).total,1);
    h.items.delete(h.second.id);assert.equal((await h.network.resolve(h.bRef)).status,'unavailable');assert.equal(h.network.relationships(h.aRef).total,1);
    h.data.resolveLibrary=()=>null;assert.equal((await h.network.resolve(h.aRef)).status,'unavailable');await assert.rejects(h.network.saveRelationship({source:h.aRef,target:h.pubRef,type:'supports'}),/unavailable/);
});

test('Network isolates libraries and rejects accidental cross-library links',async()=>{
    const h=await networkSetup();await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports'});
    const elsewhere={...h.aRef,library:{type:'group',id:'99'}};assert.equal(h.network.relationships(elsewhere).total,0);
    const invalid=clone(h.network.state());const rel=Object.values(invalid.relationships)[0];rel.target.library=elsewhere.library;assert.throws(()=>h.network.validate(invalid),/one library/);
});

test('Network moved annotation sources resolve current attachment without changing relationship identity',async()=>{
    const h=await networkSetup(),rel=await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'extends'});h.items.set(9,{...h.parent,id:9,key:'PDFKEY02'});h.item.parentID=9;
    assert.match(await h.network.sourceLink(h.aRef),/PDFKEY02\?annotation=ANNKEY01/);assert.equal(h.network.relationships(h.aRef).records[0].id,rel.id);
});

test('Network topic nodes derive dropdown/multiselect assignments using stable field/value IDs',async()=>{
    const h=await networkSetup();h.a.saveGlobalFields([{id:'g_topic',label:'Topic',type:'multiselect',options:['Fatigue']}]);const field=h.a.getGlobalFields()[0],value=h.a.categoryIDs(field,['Fatigue']);
    await h.c.saveValues(h.item,{g_topic:value});await h.c.saveValues(h.second,{g_topic:value});await h.network.designateTopics(['g_topic']);let topics=await h.network.topics(h.scope);
    assert.equal(topics.length,1);assert.equal(topics[0].annotations.length,2);assert.equal(topics[0].publications.length,1);assert.equal(Object.keys(h.network.state().relationships).length,0);const key=topics[0].key;
    h.a.saveGlobalFields([{...field,label:'Renamed research topic'}]);h.explorer.invalidate();topics=await h.network.topics(h.scope);assert.equal(topics[0].key,key);assert.equal(topics[0].fieldLabel,'Renamed research topic');
});

test('Network dropdown topic assignment uses the existing category catalog without materialized relationship edges',async()=>{
    const h=await networkSetup(),field=h.a.annotationFields(h.item.annotationColor).find(f=>f.type==='select');await h.c.saveValues(h.item,{[field.name]:'A'});await h.network.designateTopics([field.id]);const topics=await h.network.topics(h.scope);
    assert.equal(topics[0].label,'A');assert.ok(topics[0].valueID);assert.equal(h.network.index().entities.size,0);await assert.rejects(h.network.designateTopics(['unknown']),/categorical/);
});

test('Network research questions retain evidence roles and never copy or classify annotation data',async()=>{
    const h=await networkSetup();await h.c.saveValues(h.item,{manual:'Original research'});const before=clone(h.c._store),q=await h.network.saveQuestion({library:h.scope.library,title:'Which mechanism explains fatigue?'});
    await h.network.assignEvidence(q.id,h.aRef,'Supporting evidence');await h.network.assignEvidence(q.id,h.pubRef,'Background');const updated=h.network.state().questions[q.id];assert.equal(updated.evidence.length,2);assert.deepEqual(clone(h.c._store),before);
    await assert.rejects(h.network.assignEvidence(q.id,h.bRef,'Invented role'),/question evidence/);assert.equal(h.network.state().questions[q.id].evidence.length,2);
    await h.network.assignEvidence(q.id,h.aRef,'Limitations');assert.equal(h.network.state().questions[q.id].evidence[1].role,'Limitations');
    const current=h.network.state().questions[q.id];await h.network.saveQuestion({...current,title:'Revised question',roles:[...current.roles,'My custom role']},{expectedRevision:current.revision});assert.equal(h.network.state().questions[q.id].id,q.id);
    await h.network.deleteQuestion(q.id);assert.ok(h.network.state().questions[q.id].deletedAt);assert.deepEqual(clone(h.c._store),before);
});

test('Network complete backups preserve types, relationships, questions and pending reviews; restore invalidates indices',async()=>{
    const h=await networkSetup(),rel=await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports'});await h.network.saveQuestion({library:h.scope.library,title:'Question'});const backup=await h.data.export('backup');assert.equal(backup.infrastructure.network.relationships[rel.id].id,rel.id);
    h.network.index();await h.network.deleteRelationship(rel.id);await h.infra.restoreState(backup.infrastructure);assert.equal(h.network.relationships(h.aRef).total,1);assert.equal(Object.keys(h.network.state().questions).length,1);
});

test('Network import conflicts are atomic records and unavailable mappings retain recovery identities',async()=>{
    const h=await networkSetup(),r=await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports',explanation:'Current'}),incoming={...clone(r),type:'contradicts',explanation:'Incoming'},conflicts=[];
    const result=h.data.merge(r,incoming,'keep',conflicts,'infrastructure/network/relationships/'+r.id);assert.equal(result.type,'supports');assert.equal(result.explanation,'Current');assert.equal(conflicts.length,1);
    const unmatched=[],mapped=await h.network.portableMapping(h.network.state(),{'user:1234':999},unmatched);assert.equal(mapped.relationships[r.id].source.library.id,'1234');
});

test('Network graph expansion is local, depth bounded, typed, filtered and indexed',async()=>{
    const h=await networkSetup();await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports'});await h.network.saveRelationship({source:h.bRef,target:h.pubRef,type:'extends'});
    let graph=await h.network.graph(h.aRef,h.scope,{depth:1});assert.equal(graph.nodes.length,2);assert.equal(graph.edges[0].directed,true);
    graph=await h.network.graph(h.aRef,h.scope,{depth:2});assert.equal(graph.nodes.length,3);graph=await h.network.graph(h.aRef,h.scope,{depth:3,type:'supports'});assert.equal(graph.edges.length,1);
    graph=await h.network.graph(h.aRef,h.scope,{depth:2,nodeTypes:['publication']});assert.equal(graph.nodes.length,1);assert.equal(graph.nodes[0].entity.kind,'publication');
    graph=await h.network.graph(h.aRef,h.scope,{depth:3,maxNodes:1});assert.equal(graph.nodes.length,1);assert.equal(graph.truncated,true);
});

test('Network topic graph membership remains derived, dashed and distinct from explicit scientific relations',async()=>{
    const h=await networkSetup();h.a.saveGlobalFields([{id:'g_topic',label:'Topic',type:'multiselect',options:[]}]);const field=h.a.getGlobalFields()[0];await h.c.saveValues(h.item,{g_topic:h.a.categoryIDs(field,['Fatigue'])});await h.network.designateTopics(['g_topic']);const topic=(await h.network.topics(h.scope))[0],graph=await h.network.graph(topic,h.scope,{depth:1});
    assert.ok(graph.edges.length>=2);assert.ok(graph.edges.every(e=>e.membership&&!e.directed));assert.equal(Object.keys(h.network.state().relationships).length,0);
});

test('Network graph scope filters do not expose out-of-scope evidence',async()=>{
    const h=await networkSetup();await h.network.saveRelationship({source:h.aRef,target:h.otherPubRef,type:'supports'});
    const graph=await h.network.graph(h.aRef,{...h.scope,kind:'publications',keys:['PAPER001']},{depth:2});assert.ok(graph.nodes.every(n=>n.entity.key!=='PAPER002'));
});

test('Network suggestions validate only supplied identities and annotation support',async()=>{
    const h=await networkSetup(),preview=await h.network.previewDiscovery([h.aRef,h.bRef]);const good={suggestions:[{source:'E1',target:'E2',type:'supports',explanation:'Observed mechanism',supporting:['E1']}]};assert.equal(h.network.validateSuggestions(good,preview).length,1);
    for(const change of [{target:'Invented'},{type:'Invented'},{source:'E2'},{supporting:['Invented']},{supporting:[]},{explanation:''}])assert.throws(()=>h.network.validateSuggestions({suggestions:[{...good.suggestions[0],...change}]},preview),/AI invented/);
    const publications=await h.network.previewDiscovery([h.pubRef,h.otherPubRef]);assert.equal(publications.evidence[0].entity.kind,'publication');assert.match(publications.evidence[0].basis,/Publication/);
});

test('Network AI creates isolated suggestions only; approval records provenance and rejection never creates a link',async()=>{
    const h=await networkSetup();let calls=0;h.a.complete=async(prompt,options)=>{calls++;assert.equal(options.safeRetry,true);return JSON.stringify({suggestions:[{source:'E1',target:'E2',type:'supports',explanation:'AI assessment',supporting:['E1']}]});};
    const id=await h.network.discover([h.aRef,h.bRef]);await h.infra.jobs.wait(id);assert.equal(calls,1);assert.equal(Object.keys(h.network.state().relationships).length,0);
    const suggestion=Object.values(h.network.state().suggestions)[0];await h.network.reviewSuggestion(suggestion.id,'accept',{explanation:'User reviewed explanation'});assert.equal(h.network.relationships(h.aRef).records[0].provenance.kind,'ai-assisted');
    await assert.rejects(h.network.reviewSuggestion(suggestion.id,'accept'),/already reviewed/);
    const second=await h.network.discover([h.bRef,h.pubRef]);await h.infra.jobs.wait(second);const pending=Object.values(h.network.state().suggestions).find(s=>s.status==='pending');await h.network.reviewSuggestion(pending.id,'reject');assert.equal(Object.values(h.network.state().relationships).length,1);
});

test('Network suggestion acceptance rejects edited scope escapes and archived types',async()=>{
    const h=await networkSetup();h.a.complete=async()=>JSON.stringify({suggestions:[{source:'E1',target:'E2',type:'supports',explanation:'AI',supporting:['E1']}]});const id=await h.network.discover([h.aRef,h.bRef]);await h.infra.jobs.wait(id);const s=Object.values(h.network.state().suggestions)[0];
    await assert.rejects(h.network.reviewSuggestion(s.id,'accept',{target:h.pubRef}),/supplied scope/);assert.equal(h.network.state().suggestions[s.id].status,'pending');
    h.second.deleted=true;await assert.rejects(h.network.reviewSuggestion(s.id,'accept'),/deleted/);assert.equal(h.network.relationships(h.aRef).total,0);
});

test('Network cancellation discards a late AI response and never stores scientific relationships',async()=>{
    const h=await networkSetup(),started=defer(),reply=defer();h.a.complete=async()=>{started.resolve();return reply.promise;};const id=await h.network.discover([h.aRef,h.bRef]);await started.promise;await h.infra.jobs.cancel(id);reply.resolve(JSON.stringify({suggestions:[{source:'E1',target:'E2',type:'supports',explanation:'Late',supporting:['E1']}]}));
    if(h.infra.jobs.active.has(id))await h.infra.jobs.active.get(id);assert.equal(Object.keys(h.network.state().suggestions).length,0);assert.equal(h.network.relationships(h.aRef).total,0);
});

test('Network suggestion job replay uses the durable batch marker without another paid request',async()=>{
    const h=await networkSetup();let calls=0;h.a.complete=async()=>{calls++;return '{"suggestions":[]}';};const id=await h.network.discover([h.aRef,h.bRef]);await h.infra.jobs.wait(id);const job=h.infra.state.jobs[id];await h.network.runDiscovery(job.payload,{check(){},async progress(){}},job);assert.equal(calls,1);assert.ok(h.network.state().batches[id]);
});

test('Network discovery refuses changed preview evidence and oversized scopes without provider work',async()=>{
    const h=await networkSetup(),preview=await h.network.previewDiscovery([h.aRef,h.bRef]);h.item.annotationText='Changed after preview';let calls=0;h.a.complete=async()=>{calls++;return '{}';};
    await assert.rejects(h.network.discover([h.aRef,h.bRef],{expectedPreview:preview}),/preview scope again/);assert.equal(calls,0);
    const refs=Array.from({length:25},(_,i)=>({...h.aRef,key:'A'+String(i).padStart(7,'0')}));await assert.rejects(h.network.previewDiscovery(refs),/2?24/);
});

test('Network managed relationship notes preserve source links, identity and user paragraphs over normalized rebuilds',async()=>{
    const h=await networkSetup(),rel=await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports',explanation:'My scientific interpretation',supporting:[h.aRef]});const filter={type:'network',entity:h.aRef},options={mode:'manual',title:'Relationship research'};
    let config=await h.run(filter,options);config=h.research.configs().find(c=>c.id===config.id);let note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id);assert.match(note.getNote(),/User-authored relationship explanation/);assert.match(note.getNote(),/annotation=ANNKEY01/);const key=note.key;
    note.setNote(zoteroNormalizeManagedHTML(note.getNote())+'<p>My positioned Network analysis</p>');await h.research.update(config);const first=note.getNote();
    for(let i=0;i<100;i++)await h.research.update(h.research.configs().find(c=>c.id===config.id));assert.equal(note.getNote(),first);assert.equal(note.key,key);assert.equal((note.getNote().match(/My positioned Network analysis/g)||[]).length,1);assert.doesNotMatch(note.getNote(),/Preserved user-edited note snapshot/);
    const current=h.network.state().relationships[rel.id];await h.network.saveRelationship({...current,explanation:'Edited interpretation'},{expectedRevision:current.revision});await h.research.update(h.research.configs().find(c=>c.id===config.id));assert.match(note.getNote(),/Edited interpretation/);assert.equal((note.getNote().match(/My positioned Network analysis/g)||[]).length,1);
});

test('Network managed question/topic notes retain inclusion options and incomplete-data guards',async()=>{
    const h=await networkSetup();await h.c.saveValues(h.item,{manual:'Original field'});const q=await h.network.saveQuestion({library:h.scope.library,title:'Evidence map'});await h.network.assignEvidence(q.id,h.aRef,'Limitations');
    const filter={type:'network',questionID:q.id},preview=await h.research.preview(h.scope,filter,{include:{comment:false}});assert.match(preview.html,/Evidence map/);assert.match(preview.html,/Limitations/);assert.match(preview.html,/annotation=ANNKEY01/);
    let config=await h.run(filter,{mode:'manual'});config=h.research.configs().find(c=>c.id===config.id);delete h.c._store['1/ANNKEY01'];await assert.rejects(h.research.update(config),/missing/);
});

test('Network restart retains explicit data without automatic AI discovery',async()=>{
    const h=await networkSetup();await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports'});const saved=clone(h.infra.state);h.network.stop();vm.runInContext(fs.readFileSync(path.join(__dirname,'..','research-network.js'),'utf8'),h.context);h.context.AnnotaInfrastructure.state=saved;const network=h.context.AnnotaNetwork;network.install();
    assert.equal(network.relationships(h.aRef).total,1);assert.equal(h.infra.jobs.list().filter(j=>j.type==='network-suggestions').length,0);
});

test('Network large relation index and bounded graph avoid native full-library scans during navigation',async()=>{
    const h=await networkSetup(),state=h.network.defaults(),now=new Date().toISOString();for(let i=0;i<12000;i++){const target={...h.bRef,key:'B'+String(i).padStart(7,'0')};state.relationships['r'+i]={id:'r'+i,source:i<100?h.aRef:{...h.aRef,key:'A'+String(i).padStart(7,'0')},target,type:'supports',direction:'directed',explanation:'',supporting:[],createdAt:now,updatedAt:now,revision:1,provenance:{kind:'manual'}};}h.infra.state.network=state;
    const start=performance.now();h.network.index();const indexed=performance.now();for(let i=0;i<1000;i++)h.network.relationships(h.aRef,{limit:20});const lookup=performance.now();h.explorer.dataset=async()=>{throw Error('Unexpected full scan');};const graph=await h.network.graph(h.aRef,h.scope,{depth:3,maxNodes:40});
    assert.ok(graph.nodes.length<=40);assert.equal(graph.truncated,true);console.log('Network performance: 12000 relationships; index '+(indexed-start).toFixed(1)+'ms; 1000 local lookups '+(lookup-indexed).toFixed(1)+'ms; bounded graph '+graph.milliseconds+'ms');
});


test('Network changing relationship type applies the new symmetric semantics',async()=>{
    const h=await networkSetup(),r=await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports'});const changed=await h.network.saveRelationship({...r,type:'related'},{expectedRevision:r.revision});assert.equal(changed.direction,'symmetric');await assert.rejects(h.network.saveRelationship({source:h.bRef,target:h.aRef,type:'related'}),/Duplicate/);
});

test('Network backup validates native integer concurrency and rejects invalid limits',async()=>{
    const h=await networkSetup();h.prefs.set('researchannotator.aiConcurrency',1);await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports'});assert.equal((await h.data.export('backup')).settings.prefs.aiConcurrency,1);
    assert.throws(()=>h.data.validateSettings({prefs:{aiConcurrency:0}}),/concurrency/);assert.throws(()=>h.data.validateSettings({prefs:{aiConcurrency:9}}),/concurrency/);
});


test('Network unavailable topic fields retain designation and values until explicitly removed',async()=>{
    const h=await networkSetup();h.a.saveGlobalFields([{id:'g_retained_topic',label:'Retained',type:'multiselect',options:[]}]);const field=h.a.getGlobalFields()[0];await h.c.saveValues(h.item,{g_retained_topic:h.a.categoryIDs(field,['Mechanics'])});await h.network.designateTopics([field.id]);h.a.saveGlobalFields([]);h.explorer.invalidate();assert.equal((await h.network.topics(h.scope)).length,0);
    await h.network.designateTopics([field.id]);assert.ok(h.network.state().topicFields.includes(field.id));h.a.saveGlobalFields([field]);h.explorer.invalidate();assert.equal((await h.network.topics(h.scope))[0].label,'Mechanics');
});

test('Network type editing detects concurrent stale changes',async()=>{
    const h=await networkSetup(),type=await h.network.saveType({label:'Trial',inverse:'Trial inverse',direction:'directed'});await h.network.saveType({...type,label:'Updated'});await assert.rejects(h.network.saveType({...type,label:'Stale'}),/changed/);
});


test('complete backups preserve reactivated global definitions alongside distinct archived history',async()=>{
    const h=await networkSetup(),old={id:'g_reactivated',label:'Finding',type:'ai',prompt:'Original instruction'};h.a.saveGlobalFields([old]);h.a.saveGlobalFields([]);h.a.saveGlobalFields([{...old,prompt:'Revised instruction'}]);const backup=await h.data.export('backup');
    assert.equal(backup.settings.prefs.globalFields.fields[0].prompt,'Revised instruction');assert.equal(backup.settings.prefs.globalFields.archivedFields.find(f=>f.id===old.id).prompt,'Original instruction');
    const invalid=clone(backup.settings);invalid.prefs.globalFields.fields.push(clone(invalid.prefs.globalFields.fields[0]));assert.throws(()=>h.data.validateSettings(invalid),/duplicate/);
});


test('Network note guard protects locally missing relationships while allowing explicit tombstone deletion',async()=>{
    const h=await networkSetup(),rel=await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports',explanation:'Original'}),filter={type:'network',entity:h.aRef};let config=await h.run(filter,{mode:'manual'});config=h.research.configs().find(c=>c.id===config.id);const note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+config.id),before=note.getNote();
    const record=h.network.state().relationships[rel.id];delete h.infra.state.network.relationships[rel.id];h.infra.state.network.revision++;h.network.restored();await assert.rejects(h.research.update(config),/missing locally/);assert.equal(note.getNote(),before);
    h.infra.state.network.relationships[rel.id]=record;await h.network.deleteRelationship(rel.id);await h.research.update(config);assert.doesNotMatch(note.getNote(),/Original/);
});

test('Network invisible fingerprints protect foreign notes from incomplete Network data',async()=>{
    const h=await networkSetup();await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports'});const config=h.research.configuration(h.scope,{type:'network',entity:h.aRef},{title:'Knowledge'}),content=h.infra.notes.stamp('<h1>Knowledge</h1>',config,[]);assert.match(content,/networkfp=/);assert.equal(content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1].replace(/<[^>]*>/g,''),'Knowledge');assert.match(content,/<em>ResearchAnnotator<\/em>/);h.infra.state.network.relationships={};h.infra.state.network.revision++;h.network.restored();assert.throws(()=>h.network.guardNote(content,null,config),/incomplete/);
});


test('Network publication-only discovery cites supplied publication evidence without inventing annotations',async()=>{
    const h=await networkSetup(),preview=await h.network.previewDiscovery([h.pubRef,h.otherPubRef]);h.a.complete=async()=>JSON.stringify({suggestions:[{source:'E1',target:'E2',type:'reviews',explanation:'Publication metadata assessment for user review',supporting:['E1','E2']}]});const id=await h.network.discover([h.pubRef,h.otherPubRef],{expectedPreview:preview});await h.infra.jobs.wait(id);const s=Object.values(h.network.state().suggestions)[0];assert.equal(s.supporting.length,0);assert.equal(s.evidenceRefs.length,2);await h.network.reviewSuggestion(s.id,'accept');const relationship=h.network.relationships(h.pubRef).records[0];assert.equal(relationship.provenance.supportingEvidence.length,2);assert.equal(relationship.supporting.length,0);
});

test('Network publication evidence expansion stops at its bounded AI candidate limit',async()=>{
    const h=await networkSetup();h.network.evidence=async()=>{throw Error('AI discovery must not compile a full note scope');};let reads=0;const ids=[];for(let i=0;i<100;i++){const item={...h.item,id:1000+i,key:'A'+String(i).padStart(7,'0')};h.items.set(item.id,item);ids.push(item.id);}h.parent.getAnnotations=()=>ids;const get=h.context.Zotero.Items.getAsync;h.context.Zotero.Items.getAsync=async id=>{reads++;return get(id);};const refs=await h.network.expandDiscovery([h.pubRef]);assert.equal(refs.length,24);assert.ok(reads<30);
});


test('future Network schema is preserved without downgrade to a recovery snapshot',async()=>{
    const h=await networkSetup(),file=h.infra.path('infrastructure'),future={version:1,jobs:{},notes:{},network:{version:2}};h.files.set(file,future);h.files.set(file+'.recovery',{version:1,jobs:{},notes:{}});
    await assert.rejects(h.infra.loadState(),/newer version/);assert.deepEqual(h.files.get(file),future);assert.equal([...h.files.keys()].some(f=>f.includes('.corrupt-')),false);
});


test('settings-only export includes Network configuration without research relationships or questions',async()=>{
    const h=await networkSetup();await h.network.saveRelationship({source:h.aRef,target:h.bRef,type:'supports',explanation:'Private scientific interpretation'});await h.network.saveQuestion({library:h.scope.library,title:'Private research question'});const settings=await h.data.export('settings');assert.equal(Object.keys(settings.infrastructure.network.relationships).length,0);assert.equal(Object.keys(settings.infrastructure.network.questions).length,0);assert.equal(settings.infrastructure.network.types.supports.label,'Supports');assert.doesNotMatch(JSON.stringify(settings),/Private scientific interpretation|Private research question/);
    const backup=await h.data.export('backup');assert.equal(Object.keys(backup.infrastructure.network.relationships).length,1);
});

test('normalization retention requires unchanged generated entries and semantic content',async()=>{const h=await refinementSetup(),n=h.infra.notes,a='<p>Text <a href="zotero://open-pdf/library/items/PDFKEY01?page=1">passage</a></p>',b='<div>'+a.replace('<a ','<a rel="nofollow" ')+'</div>';assert.equal(n.keepNormalized(a,b,{A:'original'},{A:'original'}),true);assert.equal(n.keepNormalized(a,b,{A:'original'},{A:'new color or formatting'}),false);assert.equal(n.keepNormalized(a,b.replace('passage','changed'),{A:'original'},{A:'original'}),false);assert.equal(!!n.keepNormalized(a,b,null,{}),false);});

test('documents changed after retrieval are excluded from supplied diagnostics without a provider call',async()=>{const h=await groundedSetup();await h.index();h.chat.citationStatus=async()=>({status:'changed'});await h.chat.runAnswer({conversationID:h.conversation.id,requestID:'request-fixture'},h.control,{id:'J'});const d=h.conversation.diagnostics;assert.equal(d.state,'insufficient-evidence');assert.equal(d.counts.indexed,0);assert.equal(d.counts.pending,1);assert.equal(d.supplied.length,0);assert.match(d.sources[0].status,/Excluded.*changed/);assert.equal(h.stats().provider,0);});

test('Workspace PDF generation defaults to Automatic and honors an explicit Manual choice',async()=>{const h=await researchSetup();assert.equal(h.research.configuration(h.scope,{type:'pdf'}).mode,'auto');assert.equal(h.research.configuration(h.scope,{type:'pdf'},{mode:'manual'}).mode,'manual');});
test('orphan recovery backs up content and releases only deleted native ownership',async()=>{const h=await researchSetup();await h.a._syncPaperResearchNote(h.item);let c=h.infra.notes.pdfConfig(h.parent,1);h.note.deleted=true;const fields=clone(h.c.get(h.item)||{});c=await h.infra.notes.recoverOrphan(c);assert.equal(c.id,'pdf_'+h.parent.key);assert.equal(c.noteKey,undefined);assert.ok(c.orphanBackup);assert.equal(c.mode,'auto');assert.equal(h.note.getNote().includes('Research'),true);assert.deepEqual(clone(h.c.get(h.item)||{}),fields);});
test('legacy deletion releases native ownership without guessing whether Static was explicitly chosen',async()=>{const h=await researchSetup();await h.a._syncPaperResearchNote(h.item);let c=h.infra.notes.pdfConfig(h.parent,1);await h.infra.notes.configure({...c,mode:'static',deletedAt:'legacy-delete'});h.note.deleted=true;c=await h.infra.notes.recoverOrphan(h.infra.notes.pdfConfig(h.parent,1));assert.equal(c.mode,'static');assert.equal(c.noteKey,undefined);await h.infra.notes.configure({...c,mode:'static'});assert.equal((await h.infra.notes.recoverOrphan(h.infra.notes.pdfConfig(h.parent,1))).mode,'static');});
test('live Manual note ownership is unchanged by orphan checking',async()=>{const h=await researchSetup();await h.a._syncPaperResearchNote(h.item);const c={...h.infra.notes.pdfConfig(h.parent,1),mode:'manual'};await h.infra.notes.configure(c);assert.deepEqual(clone(await h.infra.notes.recoverOrphan(c)),clone(c));});
test('PDF note association repairs standalone placement with a backup and the same native key',async()=>{const h=await refinementSetup(),key=h.note.key,html=h.html();h.note.parentID=false;await h.a._associatePDFResearchNote(h.note,h.publication);assert.equal(h.note.parentID,h.publication.id);assert.equal(h.note.key,key);assert.equal(h.html(),html);assert.ok([...h.files.keys()].some(k=>k.includes('pdf-note-placement')));});
test('PDF note association rejects another library before a move',async()=>{const h=await refinementSetup();await assert.rejects(h.a._associatePDFResearchNote(h.note,{id:88,libraryID:99}),/different libraries/);});
test('bulk mode preview is separate from content defaults and validates selections',async()=>{const h=await researchSetup(),c=await h.run({type:'color',colorIDs:[h.palette.resolve('#ffd400').id]},{mode:'manual'});const preview=h.research.previewModes([c.id],'auto');assert.equal(preview[0].before,'manual');assert.equal(preview[0].after,'auto');assert.equal(preview[0].include,undefined);assert.throws(()=>h.research.previewModes([c.id],'unknown'),/supported/);assert.throws(()=>h.research.previewModes(['missing'],'auto'),/existing/);});
test('bulk mode application creates a recoverable job and detects changed previews',async()=>{const h=await researchSetup(),c=await h.run({type:'color',colorIDs:[h.palette.resolve('#ffd400').id]},{mode:'manual'});h.research.install();h.infra.jobs.kick=()=>{};const preview=h.research.previewModes([c.id],'auto'),result=await h.research.applyModes(preview);assert.equal(h.infra.state.jobs[result.id].type,'note-modes');assert.ok(result.backup);await h.infra.notes.configure({...h.research.configs().find(n=>n.id===c.id),mode:'static'});await assert.rejects(h.research.applyModes(preview),/changed/);});
test('Manual to Automatic mode refreshes the same note without changing source data or authored content',async()=>{const h=await researchSetup(),c=await h.run({type:'color',colorIDs:[h.palette.resolve('#ffd400').id]},{mode:'manual'}),saved=h.research.configs().find(n=>n.id===c.id),note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+c.id),key=note.key;note.setNote(note.getNote()+'<p>Authored footer</p>');h.item.annotationComment='Updated native Comment';const color=h.item.annotationColor,tags=clone(h.item.getTags()),values=clone(h.c.get(h.item));await h.research.runModes({preview:h.research.previewModes([c.id],'auto'),backup:'backup'},h.control,{checkpoint:{}});assert.equal(note.key,key);assert.match(note.getNote(),/Updated native Comment/);assert.match(note.getNote(),/Authored footer/);assert.equal(h.item.annotationColor,color);assert.deepEqual(h.item.getTags(),tags);assert.deepEqual(clone(h.c.get(h.item)),values);assert.equal(h.research.configs().find(n=>n.id===c.id).mode,'auto');});
test('bulk Static mode changes configuration without restyling or relocating the note',async()=>{const h=await researchSetup(),c=await h.run({type:'color',colorIDs:[h.palette.resolve('#ffd400').id]},{mode:'manual'}),note=await h.infra.notes.find(1,'research-annotator-managed-note-v1:'+c.id),html=note.getNote(),parent=note.parentID;await h.research.runModes({preview:h.research.previewModes([c.id],'static'),backup:'B'},h.control,{checkpoint:{}});assert.equal(note.getNote(),html);assert.equal(note.parentID,parent);assert.equal(h.research.configs().find(n=>n.id===c.id).mode,'static');});
test('bulk mode failures report protected notes instead of discarding content',async()=>{const h=await researchSetup(),c=await h.run({type:'color',colorIDs:[h.palette.resolve('#ffd400').id]},{mode:'manual'}),p=h.research.previewModes([c.id],'auto');await h.infra.notes.configure({...h.research.configs().find(n=>n.id===c.id),mode:'static'});let checkpoint;await assert.rejects(h.research.runModes({preview:p,backup:'B'},{check(){},progress:async(n,c)=>{checkpoint=c;}},{checkpoint:{}}),/failed/);assert.equal(checkpoint.failures.length,1);assert.equal(h.research.configs().find(n=>n.id===c.id).mode,'static');});
test('annotation child retrieval validates item types rather than method existence',async()=>{const h=setup();let calls=0;for(const item of [{isNote:()=>true},{isRegularItem:()=>true},{isAttachment:()=>true,isFileAttachment:()=>false}]){item.getAnnotations=()=>{calls++;throw Error('Invalid item API');};assert.deepEqual(clone(h.a.annotationChildren(item)),[]);}assert.equal(calls,0);assert.deepEqual(clone(h.a.annotationChildren({isAttachment:()=>true,isFileAttachment:()=>true,getAnnotations:(a,ids)=>ids?[7]:[{id:7}]},true)),[7]);});
test('standalone note selection never invokes attachment or annotation APIs',async()=>{const h=await researchSetup(),note={id:99,key:'NOTEONLY',libraryID:1,isNote:()=>true,isAttachment:()=>false,isRegularItem:()=>false,getAttachments(){throw Error('Invalid getAttachments');},getAnnotations(){throw Error('Invalid getAnnotations');}};h.items.set(99,note);const result=await h.research.items({...h.scope,kind:'publications',keys:[note.key]});assert.equal(result.pdfs.length,0);assert.equal(result.annotations.length,0);});
test('Chat classifies selected notes as context and never indexes them as PDFs',async()=>{const h=await groundedSetup();h.note.getNoteTitle=()=> 'Context note';h.note.getAttachments=()=>{throw Error('Invalid note attachment lookup');};const rows=await h.chat.allSources({kind:'notes',library:h.scope.library,keys:[h.note.key]});assert.equal(rows.length,1);assert.equal(rows[0].pdf,false);assert.equal(rows[0].status,'unsupported');assert.match(rows[0].attachment,/not PDF evidence/);});
test('an explicitly corrected Keyword retry does not repeat the failed semantic request',async()=>{const h=await groundedSetup();await h.index();h.conversation.retrieval={mode:'semantic'};await h.chat.answer(h.conversation);assert.equal(h.conversation.busy,false);assert.match(h.conversation.error.message,/embedding model/i);const oldID=h.conversation.messages[0].requestID,oldJob=h.conversation.groundedJob;h.conversation.retrieval={mode:'keyword'};await h.chat.retryAnswer(h.conversation,{acknowledgePaid:true});assert.equal(h.conversation.busy,false);assert.notEqual(h.conversation.messages[0].requestID,oldID);assert.equal(h.infra.state.jobs[oldJob].attempts,1);assert.equal(h.stats().provider,1);assert.ok(h.conversation.messages.at(-1).citations.length);});
test('Chat history write failure releases busy state and can retry without restart',async()=>{const h=await groundedSetup();await h.index();const write=h.context.AnnotaChat.writeHistory;h.context.AnnotaChat.writeHistory=async()=>{throw Error('Temporary disk failure');};await h.chat.answer(h.conversation);assert.equal(h.conversation.busy,false);assert.equal(h.conversation.cancel,null);assert.match(h.conversation.error.message,/disk failure/);assert.equal(h.stats().provider,0);h.context.AnnotaChat.writeHistory=write;await h.chat.answer(h.conversation);assert.equal(h.conversation.busy,false);assert.equal(h.stats().provider,1);});
test('corrupt rebuildable PDF indexes preserve originals and leave Chat available for reindexing',async()=>{const h=await groundedSetup(),file=h.chat.path();h.files.set(file,{version:999,documents:{}});await h.chat.load();assert.match(h.chat.indexRecoveryIssue,/Re-index/);assert.equal(h.files.get(file).version,999);assert.equal(Object.keys(h.chat.index.documents).length,0);assert.ok([...h.files.keys()].some(k=>k.includes('chat-index-invalid')));});
test('a failed Chat view listener does not poison a successful index write',async()=>{const h=await groundedSetup();h.chat.listeners.add(()=>{throw Error('Detached view');});await h.index();assert.equal(Object.keys(h.chat.index.documents).length,1);await h.chat.change(index=>{index.documents={};});assert.equal(Object.keys(h.chat.index.documents).length,0);});
test('visible note badge survives 100 stamps without changing the exact title',async()=>{const h=await refinementSetup(),c=h.infra.notes.pdfConfig(h.parent,1);let html='<h1>Exact publication title</h1><p>Authored prose</p>';for(let i=0;i<100;i++)html=h.infra.notes.stamp(html,c,[]);assert.equal(h.presentation.readTitle(html),'Exact publication title');assert.equal((html.match(/<em>ResearchAnnotator<\/em>/g)||[]).length,1);assert.match(html,/Authored prose/);});
test('Comment rendering uses the plain label and keeps legacy reconciliation recognition',async()=>{const h=await researchSetup();h.item.annotationComment='Independent native Comment';await h.a._syncPaperResearchNote(h.item);assert.match(h.html(),/<strong>Comment:<\/strong>/);assert.doesNotMatch(h.html(),/<strong>Research comment:<\/strong>/);h.item.deleted=true;await h.a._syncPaperResearchNote({libraryID:1,parentID:h.parent.id,manualSync:true});assert.doesNotMatch(h.html(),/Independent native Comment/);});
function groundedNoteContext(h){h.publication.getNotes=()=>[h.note.id];h.note.getNoteTitle=()=> 'Research interpretation';h.context.AnnotaChat.NOTE_RULES=['Notes are user context, never original PDF evidence.'];h.context.AnnotaChat.newNoteContext=()=>({keys:{}});h.context.AnnotaChat.notesBlock=(notes,budget,context)=>{for(const note of notes)context.keys[note.key]=true;return notes.length?'User interpretation in a research note.':'';};}
test('missing PDF evidence never silently falls back to optional note context',async()=>{const h=await groundedSetup();groundedNoteContext(h);h.conversation.retrieval={context:{notes:true},evidenceMode:'mixed'};await h.chat.runAnswer({conversationID:h.conversation.id,requestID:'request-fixture'},h.control,{id:'J'});assert.equal(h.stats().provider,0);assert.equal(h.conversation.messages.at(-1).citations.length,0);assert.match(h.conversation.messages.at(-1).content,/Insufficient retrieved evidence/);});
test('explicit note-only answers identify context and never turn note keys into PDF citations',async()=>{const h=await groundedSetup();groundedNoteContext(h);h.conversation.groundedSources={kind:'notes',library:h.scope.library,keys:[h.note.key]};h.conversation.retrieval={evidenceMode:'notes',mode:'semantic'};let calls=0;h.a.complete=async()=>{calls++;return 'Interpretation [note '+h.note.key+']';};await h.chat.runAnswer({conversationID:h.conversation.id,requestID:'request-fixture'},h.control,{id:'J'});const answer=h.conversation.messages.at(-1);assert.equal(calls,1);assert.equal(answer.citations.length,0);assert.doesNotMatch(answer.content,/\[note /);assert.match(answer.warning,/not original PDF evidence/);assert.match(answer.content,/not PDF evidence/);});
test('mixed context retains validated original PDF evidence independently of note context',async()=>{const h=await groundedSetup();groundedNoteContext(h);await h.index();h.conversation.groundedSources={kind:'custom',library:h.scope.library,keys:[h.parent.key,h.note.key]};h.conversation.retrieval={evidenceMode:'mixed',mode:'keyword',context:{notes:true}};await h.chat.runAnswer({conversationID:h.conversation.id,requestID:'request-fixture'},h.control,{id:'J'});const answer=h.conversation.messages.at(-1);assert.equal(h.stats().provider,1);assert.equal(answer.citations.length,1);assert.equal(answer.citations[0].ref.key,h.parent.key);assert.ok(answer.notes.keys[h.note.key]);});
test('unavailable native note ownership is not discarded without deletion evidence or confirmation',async()=>{const h=await researchSetup();await h.a._syncPaperResearchNote(h.item);const c=h.infra.notes.pdfConfig(h.parent,1);h.items.delete(h.note.id);await assert.rejects(h.infra.notes.recoverOrphan(c),/No replacement was created/);assert.equal(h.infra.notes.pdfConfig(h.parent,1).noteKey,c.noteKey);const recovered=await h.infra.notes.recoverOrphan(c,{confirmed:true});assert.equal(recovered.id,c.id);assert.equal(recovered.noteKey,undefined);assert.ok(recovered.orphanBackup);});
test('permanent managed note deletion records deletion proof and never impersonates an annotation deletion',async()=>{const h=await researchSetup();await h.a._syncPaperResearchNote(h.item);const c=h.infra.notes.pdfConfig(h.parent,1);h.items.delete(h.note.id);await h.a._handlePaperNoteNotification('delete',h.note.id,{[h.note.id]:{old:{key:h.note.key,libraryID:1}}},Date.now());const recovered=h.infra.notes.pdfConfig(h.parent,1);assert.equal(recovered.noteKey,undefined);assert.equal(recovered.nativeDeletedKey,c.noteKey);assert.equal(h.a._deletedAnnotationKeys?.has('1:'+c.noteKey)||false,false);});
test('PDF batch requests cannot accidentally create a standalone managed note',async()=>{const h=await researchSetup(),config=h.research.configuration(h.scope,{type:'pdf'});await assert.rejects(h.infra.notes.synchronize(config,[h.item],{manual:true}),/individual PDF notes/);assert.equal([...h.items.values()].filter(i=>i.isNote?.()).length,1);});
test('batch defaults may update PDF request settings but cannot materialize the request as a note',async()=>{const h=await researchSetup(),config=h.research.configuration(h.scope,{type:'pdf'},{include:{citation:true}});await h.infra.notes.configure(config);const before=h.html(),preview=h.research.previewDefaults([config.id]);await h.research.runDefaults({preview,backup:'B'},h.control,{checkpoint:{}});assert.equal(h.html(),before);assert.equal([...h.items.values()].filter(i=>i.isNote?.()).length,1);assert.equal(h.infra.notes.config(config.library,config.scope).include.citation,false);});
test('bulk mode selection excludes non-note PDF request configurations',async()=>{const h=await researchSetup(),config=h.research.configuration(h.scope,{type:'pdf'});await h.infra.notes.configure(config);assert.throws(()=>h.research.previewModes([config.id],'auto'),/existing managed notes/);});
test('changed paid retry settings require explicit approval before a new request identity is made',async()=>{const h=await groundedSetup();await h.index();h.conversation.retrieval={mode:'semantic'};await h.chat.answer(h.conversation);const id=h.conversation.messages[0].requestID;h.conversation.retrieval={mode:'keyword'};await assert.rejects(h.chat.retryAnswer(h.conversation),/Explicit retry approval/);assert.equal(h.conversation.messages[0].requestID,id);assert.equal(h.stats().provider,0);});
test('temporary history read errors can recover without restarting or overwriting the original',async()=>{const h=await infrastructureSetup();vm.runInContext(fs.readFileSync(path.join(__dirname,'..','chat.js'),'utf8'),h.context);const chat=h.context.AnnotaChat;h.prefs.set('researchannotator.chatKeepHistory',true);const file=chat.historyFile();h.files.set(file,{version:1,conversations:[]});const read=h.context.IOUtils.readJSON;h.context.IOUtils.readJSON=async()=>{throw Error('Temporary read failure');};await assert.rejects(chat.loadHistory(),/original is preserved/);assert.equal(chat._historyLoading,null);assert.equal(chat._history,null);h.context.IOUtils.readJSON=read;assert.deepEqual(clone(await chat.loadHistory()),[]);});
test('bulk mode selection uses library-aware identities when PDF keys coincide',async()=>{const h=await researchSetup();await h.a._syncPaperResearchNote(h.item);const c=h.infra.notes.pdfConfig(h.parent,1),other={...c,library:{type:'group',id:'9090'},noteKey:'GROUP001'};await h.infra.notes.configure(other);assert.throws(()=>h.research.previewModes([c.id],'auto'),/more than one library/);const identity=h.infra.notes.identity(other.library,other.scope),preview=h.research.previewModes([identity],'manual');assert.equal(preview.length,1);assert.equal(preview[0].identity,identity);assert.equal(preview[0].noteKey,'GROUP001');assert.equal(h.infra.notes.config(c.library,c.scope).mode,'auto');});
test('explicit successful reindex clears the recoverable cache warning',async()=>{const h=await groundedSetup(),file=h.chat.path();h.files.set(file,{version:999,documents:{}});await h.chat.load();assert.ok(h.chat.indexRecoveryIssue);await h.index();assert.equal(h.chat.indexRecoveryIssue,null);assert.equal(Object.keys(h.chat.index.documents).length,1);assert.ok([...h.files.keys()].some(k=>k.includes('chat-index-invalid')));});
test('runtime notes fail closed when shared infrastructure is unavailable',async()=>{const h=noteHarness(),before=h.html();h.a._managedEngineRequired=true;await assert.rejects(h.a._syncPaperResearchNote(h.item),/existing note is preserved/);assert.equal(h.html(),before);});
test('authored Comment paragraphs remain positioned beside managed entries after native Comment updates',async()=>{const h=await researchSetup();h.item.annotationComment='Native before';await h.a._syncPaperResearchNote(h.item);h.setHTML(h.html()+'<p><strong>Comment:</strong> Authored interpretation</p>');h.item.annotationComment='Native after';await h.a._syncPaperResearchNote(h.item);assert.match(h.html(),/Native after/);assert.equal((h.html().match(/Authored interpretation/g)||[]).length,1);assert.doesNotMatch(h.html(),/Native before|Preserved user-edited note snapshot/);});
test('Chat refuses mixed-library source keys rather than resolving them in the wrong library',async()=>{const h=await groundedSetup();h.context.AnnotaChat.convItem=()=>null;h.context.AnnotaChat.conversationOf=()=>h.conversation;const items=[h.publication,{...h.publication,libraryID:99,key:'OTHER001'}],inst={win:{ZoteroPane:{getSelectedLibraryID:()=>1,getSelectedItems:()=>items}}};assert.throws(()=>h.chat.selection(inst,'selected'),/one library at a time/);});


async function betaMapperSetup(){const h=await researchSetup();vm.runInContext(fs.readFileSync(path.join(__dirname,'..','color-mapper.js'),'utf8'),h.context);const mapper=h.context.AnnotaColorMapper;mapper.install();h.item.annotationType='highlight';h.item.annotationColor='#123456';return {...h,mapper};}
for(const mode of ['auto','manual','static'])test('beta intentional '+mode+' note deletion blocks rebuild until explicit recreation',async()=>{const h=await researchSetup();await h.a._syncPaperResearchNote(h.item);let c=h.infra.notes.pdfConfig(h.parent,1);await h.infra.notes.configure({...c,mode});const key=c.noteKey;await h.research.remove({...c,mode});c=h.infra.notes.pdfConfig(h.parent,1);assert.equal(c.managementDisabled,true);assert.equal(c.mode,mode);await h.a._syncPaperResearchNote({...h.item,manualSync:true});assert.equal(h.infra.notes.pdfConfig(h.parent,1).noteKey,null);assert.ok(c.deletionBackup);await assert.rejects(h.research.resumeManagement(c),/Confirm/);await h.research.resumeManagement(c,{confirmed:true});c=h.infra.notes.pdfConfig(h.parent,1);assert.equal(c.managementDisabled,false);assert.equal(c.mode,mode);assert.ok(c.noteKey);assert.ok(c.noteKey);});
test('beta direct Zotero trash preserves a durable management tombstone',async()=>{const h=await researchSetup();await h.a._syncPaperResearchNote(h.item);h.note.deleted=true;await h.a._syncPaperResearchNote(h.item);const c=h.infra.notes.pdfConfig(h.parent,1);assert.equal(c.managementDisabled,true);const data=JSON.parse(JSON.stringify(h.infra.state));h.infra.state=data;await h.a._syncPaperResearchNote(h.item);assert.equal(h.infra.notes.pdfConfig(h.parent,1).noteKey,undefined);});
test('beta stale generation cannot reenable intentionally deleted research configurations',async()=>{const h=await researchSetup(),c=await h.run({type:'color',colorIDs:[h.palette.resolve('#ffd400').id]},{mode:'auto'});await h.research.remove(h.infra.notes.config(c.library,c.scope));await assert.rejects(h.infra.notes.synchronize(c,[h.item],{manual:true}),/stopped|deleted/);assert.equal(h.infra.notes.config(c.library,c.scope).managementDisabled,true);});
test('beta rename does not disable live managed notes',async()=>{const h=await researchSetup();await h.a._syncPaperResearchNote(h.item);const c=h.infra.notes.pdfConfig(h.parent,1);await h.research.rename(c,'Renamed safely');assert.notEqual(h.infra.notes.pdfConfig(h.parent,1).managementDisabled,true);assert.match(h.note.getNote(),/Renamed safely/);});
for(const mode of ['auto','manual','static'])test('beta per-note order rebuilds '+mode+' PDF notes once and preserves identity and authored content',async()=>{const h=await researchSetup();const second={...h.item,id:9,key:'ANNKEY02',annotationColor:'#ff6666',annotationText:'Second quotation'};h.items.set(9,second);h.parent.getAnnotations=()=>[7,9];await h.a._syncPaperResearchNote(h.item);let c=h.infra.notes.pdfConfig(h.parent,1);await h.infra.notes.configure({...c,mode});h.note.setNote(h.note.getNote()+'<p>Authored analysis stays.</p>');const key=h.note.key;const ids=[h.palette.resolve('#ff6666').id,h.palette.resolve('#ffd400').id];await h.research.setColorOrder({...c,mode},ids);c=h.infra.notes.pdfConfig(h.parent,1);assert.equal(c.noteKey,key);assert.equal(c.mode,mode);assert.match(h.note.getNote(),/Authored analysis stays/);assert.ok(h.note.getNote().indexOf('annotation=ANNKEY02')<h.note.getNote().indexOf('annotation=ANNKEY01'));await h.research.setColorOrder(c,null);assert.equal(h.infra.notes.pdfConfig(h.parent,1).colorOrder,null);});
test('beta note ordering rejects duplicate or missing color identities',async()=>{const h=await researchSetup();const c=h.infra.notes.pdfConfig(h.parent,1),id=h.palette.ensure().colors[0].id;await assert.rejects(h.research.setColorOrder(c,[id,id]),/Invalid/);await assert.rejects(h.research.setColorOrder(c,['missing']),/Invalid/);});
test('beta palette management actions are inline and deletion has a visible multiplication sign',()=>{const h=compactPreferences(),row=h.rows()[0];assert.ok(row.children[0].querySelector('.ra-inline-color-actions'));assert.equal(row.querySelector('.annota-color-management'),null);assert.match(row.querySelector('.annota-palette-delete').textContent,/\u00d7/);});
test('beta unused default colors can be deleted while referenced colors remain protected',async()=>{const h=milestoneSetup(),color=h.palette.resolve('#ff6666');const used=await h.palette.usage(color.id);assert.equal(used.canDelete,true);await h.palette.deleteColor(color.id,{confirmed:true});assert.equal(h.palette.resolve(color.id),undefined);await assert.rejects(h.palette.deleteColor(h.palette.resolve('#ffd400').id,{confirmed:true}),/research data/);});
test('beta mapper scans stored native hex and reports external annotations without import or PDF writes',async()=>{const h=await betaMapperSetup(),scan=await h.mapper.scan(h.scope);assert.equal(scan.groups.length,1);assert.equal(scan.groups[0].hex,'#123456');assert.equal(scan.groups[0].entries.length,1);assert.match(scan.notice,/no import or PDF write/);h.item.annotationIsExternal=true;const external=await h.mapper.scan(h.scope);assert.equal(external.external,1);assert.equal(external.groups.length,0);});
test('beta mapper skips assigned colors by default and similar grouping is opt-in',async()=>{const h=await betaMapperSetup();h.item.annotationColor='#ffd400';let scan=await h.mapper.scan(h.scope);assert.equal(scan.groups[0].excluded,true);h.item.annotationColor='#123456';const a={...h.item,id:9,key:'ANNKEY02',annotationColor:'#123457'};h.items.set(9,a);h.parent.getAnnotations=()=>[7,9];scan=await h.mapper.scan(h.scope);assert.equal(scan.groups.length,2);scan=await h.mapper.scan(h.scope,{similar:true});assert.equal(scan.groups.length,1);assert.equal(scan.groups[0].originals.length,2);});
test('beta mapper confirmation and preview validation reject unintended operations',async()=>{const h=await betaMapperSetup(),scan=await h.mapper.scan(h.scope);assert.throws(()=>h.mapper.preview(scan),/destination/);scan.groups[0].target=h.palette.resolve('#ff6666').id;const preview=h.mapper.preview(scan);await assert.rejects(h.mapper.enqueue(preview),/confirm/i);h.item.annotationComment='Newer comment';await assert.rejects(h.mapper.enqueue(preview,{confirmed:true}),/changed/);});
test('beta color mapping preserves annotation identity Comments Tags structured values and AI without requests',async()=>{const h=await betaMapperSetup();await h.c.saveValues(h.item,{manual:'Retained manual',summary:'Retained AI'});const stored=clone(h.c._store),comment=h.item.annotationComment,tags=clone(h.item.getTags());h.a.generateComment=()=>{throw Error('No AI allowed');};const scan=await h.mapper.scan(h.scope);scan.groups[0].target=h.palette.resolve('#ff6666').id;const p=h.mapper.preview(scan),op=await h.mapper.enqueue(p,{confirmed:true});await h.infra.jobs.wait(op.jobID);assert.equal(h.item.annotationColor,'#ff6666');assert.equal(h.item.key,'ANNKEY01');assert.equal(h.item.annotationComment,comment);assert.deepEqual(clone(h.item.getTags()),tags);assert.deepEqual(clone(h.c._store),stored);const result=await h.mapper.undo(op.id,{confirmed:true});assert.deepEqual(Array.from(result.restored),['ANNKEY01']);assert.equal(h.item.annotationColor,'#123456');});
test('beta undo preserves edits newer than a mapping and survives a serialized journal restart',async()=>{const h=await betaMapperSetup(),scan=await h.mapper.scan(h.scope);scan.groups[0].target=h.palette.resolve('#ff6666').id;const op=await h.mapper.enqueue(h.mapper.preview(scan),{confirmed:true});await h.infra.jobs.wait(op.jobID);h.infra.state=clone(h.infra.state);h.item.annotationComment='Subsequent author edit';const r=await h.mapper.undo(op.id,{confirmed:true});assert.equal(r.conflicts.length,1);assert.equal(h.item.annotationColor,'#ff6666');assert.equal(h.item.annotationComment,'Subsequent author edit');});
test('beta mapping replay recognizes a prepared write without creating annotations',async()=>{const h=await betaMapperSetup(),scan=await h.mapper.scan(h.scope);scan.groups[0].target=h.palette.resolve('#ff6666').id;const op=await h.mapper.enqueue(h.mapper.preview(scan),{confirmed:true});await h.infra.jobs.wait(op.jobID);const entry=h.infra.state.colorMaps[op.id].entries[0];entry.state='prepared';entry.expected=h.mapper.signature(h.item);const size=h.items.size;await h.mapper.run({id:op.id},h.control);assert.equal(h.items.size,size);assert.equal(h.infra.state.colorMaps[op.id].entries[0].state,'applied');});

test('beta mapping rejects read-only native annotations before enqueue',async()=>{const h=await betaMapperSetup(),scan=await h.mapper.scan(h.scope);scan.groups[0].target=h.palette.resolve('#ff6666').id;h.context.Zotero.Libraries.get=()=>({libraryID:1,libraryType:'user',libraryTypeID:1234,editable:false});await assert.rejects(h.mapper.enqueue(h.mapper.preview(scan),{confirmed:true}),/read-only/);});
test('beta cancellation leaves a resumable journal and releases PDF synchronization suppression',async()=>{const h=await betaMapperSetup(),scan=await h.mapper.scan(h.scope);scan.groups[0].target=h.palette.resolve('#ff6666').id;h.infra.jobs.kick=()=>{};const op=await h.mapper.enqueue(h.mapper.preview(scan),{confirmed:true});const stopped=Object.assign(Error('Cancelled'),{stopped:true});await assert.rejects(h.mapper.run({id:op.id},{...h.control,check(){throw stopped;}}),/Cancelled/);assert.equal(h.a._colorMappingPDFs.size,0);assert.equal(h.item.annotationColor,'#123456');await h.mapper.run({id:op.id},h.control);assert.equal(h.item.annotationColor,'#ff6666');});
test('beta failed native color save rolls back only unsaved memory and can retry',async()=>{const h=await betaMapperSetup(),scan=await h.mapper.scan(h.scope);scan.groups[0].target=h.palette.resolve('#ff6666').id;h.infra.jobs.kick=()=>{};const op=await h.mapper.enqueue(h.mapper.preview(scan),{confirmed:true}),save=h.item.saveTx;h.item.saveTx=async()=>{throw Error('Native write failed');};await assert.rejects(h.mapper.run({id:op.id},h.control),/Some highlights/);assert.equal(h.item.annotationColor,'#123456');h.item.saveTx=save;await h.mapper.run({id:op.id},h.control);assert.equal(h.item.annotationColor,'#ff6666');});
test('beta mapping refreshes once per affected PDF without changing native identity',async()=>{const h=await betaMapperSetup(),second={...h.item,id:9,key:'ANNKEY02'};h.items.set(9,second);h.parent.getAnnotations=()=>[7,9];const scan=await h.mapper.scan(h.scope);scan.groups[0].target=h.palette.resolve('#ff6666').id;h.infra.jobs.kick=()=>{};const op=await h.mapper.enqueue(h.mapper.preview(scan),{confirmed:true}),calls=[];h.a._syncPaperResearchNote=async a=>calls.push(a.parentID);await h.mapper.run({id:op.id},h.control);assert.deepEqual(calls,[8]);assert.equal(h.items.get(9).key,'ANNKEY02');});
test('beta color deletion protects per-note order references even without annotations',async()=>{const h=await researchSetup(),id=h.palette.resolve('#ff6666').id;await h.infra.notes.configure({...h.infra.notes.pdfConfig(h.parent,1),colorOrder:[id]});assert.equal((await h.palette.usage(id)).canDelete,false);await assert.rejects(h.palette.deleteColor(id,{confirmed:true}),/research data/);});

test('beta portable exports omit local mapping journals and jobs but retain intentional deletion policy',async()=>{const h=await researchSetup();const c=h.infra.notes.pdfConfig(h.parent,1);await h.infra.notes.configure({...c,managementDisabled:true,deletionBackup:'PRIVATE_LOCAL_BACKUP'});h.infra.state.colorMaps={local:{id:'local',entries:[]}};h.infra.state.jobs.local={id:'local',type:'color-map',state:'completed',dedupe:'local',payload:{id:'local'}};const exported=await h.data.export('backup');assert.equal(exported.infrastructure.colorMaps,undefined);assert.equal(exported.infrastructure.jobs.local,undefined);const note=Object.values(exported.infrastructure.notes)[0];assert.equal(note.managementDisabled,true);assert.equal(note.deletionBackup,undefined);});

test('beta native tag data is explicitly loaded before note rendering or mapping fingerprints',async()=>{const h=await betaMapperSetup();let loaded=false,calls=0;const tags=h.item.getTags;h.item.getTags=()=>{if(!loaded)throw Error('Tags not loaded');return tags();};h.context.Zotero.Items.loadDataTypes=async(items,types)=>{assert.ok(types.includes('tags'));calls++;loaded=true;};await h.a._syncPaperResearchNote(h.item);loaded=false;const scan=await h.mapper.scan(h.scope);assert.equal(scan.groups.length,1);assert.ok(calls>=2);});

test('beta mapping progress reflects durable completed entries before the job completes',async()=>{const h=await betaMapperSetup(),second={...h.item,id:9,key:'ANNKEY02'};h.items.set(9,second);h.parent.getAnnotations=()=>[7,9];h.infra.jobs.kick=()=>{};const scan=await h.mapper.scan(h.scope);scan.groups[0].target=h.palette.resolve('#ff6666').id;const op=await h.mapper.enqueue(h.mapper.preview(scan),{confirmed:true}),progress=[];await h.mapper.run({id:op.id},{...h.control,progress:async value=>progress.push(value)});assert.deepEqual(progress,[.5,1]);});
test('beta post-mapping review reuses the shared review workflow without generation',async()=>{const h=await betaMapperSetup();let selection,calls=0;h.infra.state.colorMaps={fixture:{id:'fixture',entries:[{pdf:8},{pdf:8}]}};h.context.AnnotaReview.startReview=async()=>calls++;await h.mapper.review('fixture',{ZoteroPane:{selectItems:async ids=>selection=Array.from(ids)}});assert.deepEqual(selection,[8]);assert.equal(calls,1);});

test('beta unloaded Chat shutdown writes never replace persisted conversations with an empty list',async()=>{const h=await infrastructureSetup();vm.runInContext(fs.readFileSync(path.join(__dirname,'..','chat.js'),'utf8'),h.context);const chat=h.context.AnnotaChat,file=chat.historyFile(),saved={version:1,conversations:[{id:'prior',messages:[{role:'user',content:'Preserve prior research'}]}]};h.files.set(file,saved);await chat.writeHistory();assert.deepEqual(clone(h.files.get(file)),saved);assert.equal(chat._history,null);});
test('beta unreadable or future Chat history remains intact after failed load and subsequent shutdown flush',async()=>{const h=await infrastructureSetup();vm.runInContext(fs.readFileSync(path.join(__dirname,'..','chat.js'),'utf8'),h.context);const chat=h.context.AnnotaChat,file=chat.historyFile(),saved={version:999,conversations:[{id:'future',messages:[]}]};h.files.set(file,saved);await assert.rejects(chat.loadHistory(),/original is preserved/);await chat.writeHistory();assert.deepEqual(clone(h.files.get(file)),saved);});
test('beta loaded Chat history still persists edits while history-off makes no write',async()=>{const h=await infrastructureSetup();vm.runInContext(fs.readFileSync(path.join(__dirname,'..','chat.js'),'utf8'),h.context);const chat=h.context.AnnotaChat,file=chat.historyFile();chat._history=[{id:'live',messages:[{role:'user',content:'Saved question'}]}];await chat.writeHistory();assert.equal(h.files.get(file).conversations[0].id,'live');const before=clone(h.files.get(file));h.prefs.set('researchannotator.chatKeepHistory',false);chat._history=[];await chat.writeHistory();assert.deepEqual(clone(h.files.get(file)),before);});
