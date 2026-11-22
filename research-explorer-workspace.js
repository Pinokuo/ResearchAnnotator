/* Window-local Explorer presentation; query, storage, editing and generation stay shared. */
window.addEventListener("DOMContentLoaded",async()=>{
    const args=window.arguments?.[0]||window.parent.workspaceHost.contextFor(window);
    const {service,query:incoming}=args,doc=document,$=id=>doc.getElementById(id);let main=args.main;
    let query=incoming?service.clone(incoming):service.defaults({kind:"library",library:service.libraries().find(l=>l.libraryID===main.ZoteroPane?.getSelectedLibraryID?.())?.identity||service.libraries().find(l=>l.identity.type==="user")?.identity||service.libraries()[0]?.identity});

    const mapper=main.Zotero?.Annota?.colorMapper;
    if(mapper){
        const bulk=doc.createElement('details'),heading=doc.createElement('summary'),panel=doc.createElement('div');heading.textContent='Bulk Actions';bulk.id='bulk-highlight-actions';bulk.append(heading,panel);doc.querySelector('.toolbar').appendChild(bulk);
        const open=doc.createElement('button');open.textContent='Map Highlight Colors';open.type='button';panel.append(open);
        open.addEventListener('click',()=>{panel.replaceChildren(open);const form=doc.createElement('section');panel.append(form);const title=doc.createElement('h2');title.textContent='Map Highlight Colors';const importHelp=doc.createElement('p');importHelp.dataset.importHelp='true';importHelp.textContent='Editable Zotero highlights (including imported ones) can be mapped. Embedded/external PDF annotations are not changed. Zotero Import Annotations can modify a PDF during transfer: use a copy and review the confirmation in Zotero, then rescan. ResearchAnnotator never imports or writes linked PDFs.';form.append(title,importHelp);
            const type=doc.createElement('select');type.setAttribute('aria-label','Mapping source scope');for(const [v,label]of [['pdf','Current PDF'],['selected','Selected PDFs'],['collection','Collection'],['library','Library']]){const o=doc.createElement('option');o.value=v;o.textContent=label;type.append(o);}form.append(type);
            const check=(text,value)=>{const label=doc.createElement('label'),input=doc.createElement('input');input.type='checkbox';input.checked=value;label.append(input,doc.createTextNode(text));form.append(label);return input;};
            const similar=check('Group similar RGB colors (distance <= 24; original hex values remain visible)',false),skip=check('Skip colors already assigned in ResearchAnnotator',true),output=doc.createElement('div'),report=doc.createElement('p');report.setAttribute('role','status');let scan,preview;const invalidate=()=>{scan=null;preview=null;report.textContent='Source or grouping options changed. Scan again before applying.';};for(const control of [type,similar,skip])control.addEventListener('change',invalidate);
            const btn=(text,fn)=>{const b=doc.createElement('button');b.type='button';b.textContent=text;b.addEventListener('click',async()=>{b.disabled=true;try{await fn();}catch(e){report.textContent=e.message;}finally{b.disabled=false;}});form.append(b);return b;};
            btn('Scan highlights',async()=>{preview=null;const library=JSON.parse($('library').value),selected=main.ZoteroPane.getSelectedItems();let scope={kind:'library',library};if(type.value==='pdf'){const reader=main.Zotero.Reader.getByTabID(main.Zotero_Tabs.selectedID),item=reader?await main.Zotero.Items.getAsync(reader.itemID):selected.find(i=>i.isPDFAttachment?.());if(!item?.isPDFAttachment?.())throw Error('Open or select a PDF first.');scope={kind:'attachments',library:main.Zotero.Annota.data.libraryIdentity(main.Zotero.Libraries.get(item.libraryID)),keys:[item.key]};}else if(type.value==='selected'){const pdfs=selected.filter(i=>i.isPDFAttachment?.());if(!pdfs.length)throw Error('Select one or more PDF attachments in Zotero first.');if(pdfs.some(i=>i.libraryID!==pdfs[0].libraryID))throw Error('Select PDFs from one library.');scope={kind:'attachments',library:main.Zotero.Annota.data.libraryIdentity(main.Zotero.Libraries.get(pdfs[0].libraryID)),keys:pdfs.map(i=>i.key)};}else if(type.value==='collection'){if(!$('collection').value)throw Error('Choose a collection in Explorer.');scope={kind:'collection',library,key:$('collection').value};}scan=await mapper.scan(scope,{similar:similar.checked,skipAssigned:skip.checked});importHelp.textContent=scan.notice;output.replaceChildren();report.textContent=scan.notice+' External annotations skipped: '+scan.external;for(const g of scan.groups){const row=doc.createElement('fieldset'),legend=doc.createElement('legend'),include=doc.createElement('input'),target=doc.createElement('select'),sample=doc.createElement('p');legend.textContent=g.originals.join(', ')+' / '+g.entries.length+' highlights / '+g.pdfs.length+' PDFs'+(g.semantic?' / Existing assignment: '+g.semantic:'');const swatch=doc.createElement('span');swatch.className='swatch';swatch.style.backgroundColor=g.hex;legend.prepend(swatch);include.type='checkbox';include.checked=!g.excluded;include.setAttribute('aria-label','Include '+g.hex);include.onchange=()=>{g.excluded=!include.checked;preview=null;};target.setAttribute('aria-label','Destination for '+g.hex);const empty=doc.createElement('option');empty.textContent='Choose destination color';empty.value='';target.append(empty);for(const c of main.Zotero.Annota.palette.ensure().colors.filter(c=>!c.archived)){const o=doc.createElement('option');o.value=c.id;o.textContent=c.label+' '+c.hex;target.append(o);}target.onchange=()=>{g.target=target.value;preview=null;};sample.textContent=g.examples.join(' / ');row.append(legend,include,target,sample);output.append(row);}});
            btn('Preview mapping',()=>{if(!scan)throw Error('Scan highlights first.');preview=mapper.preview(scan);report.textContent=preview.entries.length+' highlights in '+preview.pdfs+' PDFs will change color. Comments, Tags and structured records are preserved. No AI will run. Original PDF files are never written.';});
            btn('Apply mapping',async()=>{if(!preview)throw Error('Preview the mapping first.');if(!window.confirm('Recolor '+preview.entries.length+' highlights across '+preview.pdfs+' PDFs'+(scan.scope.kind==='library'?' in this library':'')+'? A durable undo journal and backup will be saved. No AI is generated.'))return;const result=await mapper.enqueue(preview,{confirmed:true});report.textContent='Mapping queued. See Activity for progress or failures. Backup: '+result.backup;preview=null;});
            btn('Refresh mapping history',()=>{output.replaceChildren();for(const op of Object.values(mapper.operations())){const row=doc.createElement('div'),undo=doc.createElement('button');row.textContent=op.createdAt+' / '+op.entries.length+' highlights ';undo.type='button';undo.textContent='Undo mapping';undo.onclick=async()=>{try{if(!window.confirm('Undo unchanged mapped highlights? Newer edits will be preserved.'))return;const r=await mapper.undo(op.id,{confirmed:true});report.textContent=r.restored.length+' restored; '+r.conflicts.length+' conflicts left unchanged.';}catch(e){report.textContent=e.message;}};row.append(undo);const review=doc.createElement('button');review.type='button';review.textContent='Review fields in affected PDFs';review.onclick=async()=>{try{await mapper.review(op.id,main);}catch(e){report.textContent=e.message;}};row.append(review);output.append(row);}});
            const ai=doc.createElement('p');ai.textContent='Optional AI completion remains separate: use Annotation Review or explicit batch generation after reviewing the recolored highlights.';form.append(ai,report,output);
        });
    }

    let offset=0,total=0,token,timer,loading=false;const editors=new Set(),pageSize=40;
    const status=text=>{$("status").textContent=text;};
    const action=fn=>async(...args)=>{try{await fn(...args);}catch(error){if(!error.cancelled)status(error.message||String(error));}};
    const button=(parent,label,run)=>{const node=doc.createElement("button");node.type="button";node.textContent=label;node.addEventListener("click",action(run));parent.appendChild(node);return node;};
    const option=(select,value,label)=>{const node=doc.createElement("option");node.value=value;node.textContent=label;select.appendChild(node);};
    const label=(parent,text,node)=>{const wrapper=doc.createElement("label");wrapper.append(doc.createTextNode(text+" "),node);parent.appendChild(wrapper);return node;};
    const dirty=()=>[...editors].some(e=>e.form._dirty);
    const clearEditors=()=>{for(const editor of editors){editor.form._dirty=false;editor.form._changed.clear();}editors.clear();};
    const properties={publication:"Publication",year:"Publication year",author:"Author",attachment:"PDF / attachment",color:"Highlight color",type:"Annotation type",tag:"Native Tag",field:"Structured field",status:"AI status",text:"Annotation text",comment:"Native Comment",library:"Library",collection:"Collection"};
    const operators={contains:"Contains",notContains:"Does not contain",equals:"Equals",notEquals:"Does not equal",empty:"Is empty",notEmpty:"Is not empty",any:"Contains any selected value",all:"Contains all selected values"};
    const fields=()=>service.fields();
    const sync=()=>{query.text=$("search").value;query.sort={key:$("sort").value.split(":")[0],...($("sort").value.startsWith("field:")?{fieldID:$("sort").value.slice(6)}:{}),direction:$("direction").value};query.group={key:$("group").value.split(":")[0],...($("group").value.startsWith("field:")?{fieldID:$("group").value.slice(6)}:{})};};
    const schedule=()=>{clearTimeout(timer);if(token)token.cancelled=true;timer=setTimeout(action(()=>search(false)),250);};
    function active(){
        $("active").replaceChildren();
        const walk=(node,parent)=>{
            if(node.children){node.children.forEach(child=>walk(child,node));return;}
            const field=fields().find(f=>f.id===node.fieldID),name=node.property==="field"?(field?.label||"Unavailable field "+node.fieldID):properties[node.property];
            button($("active"),(name||node.property)+" · "+operators[node.operator]+" "+node.values.map(v=>node.valueLabels?.[v]||v).join(", ")+" ×",async()=>{parent.children.splice(parent.children.indexOf(node),1);await filters();await search(true);});
        };walk(query.filters,null);
        if(query.text)button($("active"),'Search: '+query.text+' ×',async()=>{$("search").value=query.text="";await search(true);});
    }
    async function filters(){
        $("filters").replaceChildren();
        const group=async(node,parent,host,depth=0)=>{
            const box=doc.createElement("div");box.className="filter-group";host.appendChild(box);
            const logic=doc.createElement("select");option(logic,"and","Match ALL (AND)");option(logic,"or","Match ANY (OR)");logic.value=node.logic;logic.setAttribute("aria-label","Filter group logic");box.appendChild(logic);
            logic.addEventListener("change",()=>{node.logic=logic.value;schedule();});
            button(box,"Add filter",async()=>{node.children.push({property:"text",operator:"contains",values:[]});await filters();});
            if(depth<6)button(box,"Add group",async()=>{node.children.push({logic:"and",children:[]});await filters();});
            if(parent)button(box,"Remove group",async()=>{parent.children.splice(parent.children.indexOf(node),1);await filters();schedule();});
            for(const child of node.children){
                if(child.children){await group(child,node,box,depth+1);continue;}
                const row=doc.createElement("div");row.className="filter-rule";box.appendChild(row);
                const property=doc.createElement("select");for(const [key,name]of Object.entries(properties))if(key!=="field")option(property,key,name);
                for(const f of fields())option(property,"field:"+f.id,(f.scope==="global"?"Global: ":"Color: ")+f.label);
                if(child.property==="field"&&!fields().some(f=>f.id===child.fieldID))option(property,"field:"+child.fieldID,"Unavailable field "+child.fieldID);
                property.value=child.property==="field"?"field:"+child.fieldID:child.property;property.setAttribute("aria-label","Filter property");row.appendChild(property);
                const operator=doc.createElement("select");for(const [key,name]of Object.entries(operators))option(operator,key,name);operator.value=child.operator;operator.setAttribute("aria-label","Filter operator");row.appendChild(operator);
                property.addEventListener("change",action(async()=>{child.property=property.value.startsWith("field:")?"field":property.value;child.fieldID=property.value.startsWith("field:")?property.value.slice(6):undefined;child.values=[];child.categoryIDs=child.property==="field"&&["select","multiselect"].includes(fields().find(f=>f.id===child.fieldID)?.type);await filters();schedule();}));
                operator.addEventListener("change",action(async()=>{child.operator=operator.value;await filters();schedule();}));
                if(!["empty","notEmpty"].includes(child.operator)){
                    if(["contains","notContains"].includes(child.operator)){
                        const input=doc.createElement("input");input.value=child.values[0]||"";input.setAttribute("aria-label","Filter text");row.appendChild(input);input.addEventListener("input",()=>{child.values=[input.value];schedule();});
                    }else{
                        const values=doc.createElement("select");values.multiple=true;values.setAttribute("aria-label","Filter values");
                        const choices=await service.choices(query.scope,child.property,child.fieldID),known=new Set(choices.map(([value])=>value));
                        child.valueLabels=Object.fromEntries(choices);
                        if(child.property==="field"&&fields().find(f=>f.id===child.fieldID)?.type==="select"){
                            child.categoryIDs=true;child.categoryAliases||={};for(const [id,name]of choices)child.categoryAliases[id]=[...new Set([...(child.categoryAliases[id]||[]),name])];
                        }
                        for(const value of child.values)if(!known.has(value))choices.push([value,"Unavailable / saved: "+value]);
                        for(const [value,name]of choices)option(values,value,name||"Not checked");for(const entry of values.options)entry.selected=child.values.includes(entry.value);
                        row.appendChild(values);values.addEventListener("change",()=>{child.values=[...values.selectedOptions].map(o=>o.value);schedule();});
                    }
                }
                button(row,"Remove",async()=>{node.children.splice(node.children.indexOf(child),1);await filters();schedule();});
            }
        };await group(query.filters,null,$("filters"));active();
    }
    async function nativeEditor(host,row){
        const snapshot=await service.nativeSnapshot(row.identity),comment=doc.createElement("textarea"),tags=doc.createElement("input");
        comment.value=snapshot.comment;tags.value=snapshot.tags.map(t=>typeof t==="string"?t:t.tag).join("; ");tags.style.width="100%";
        let originalTagInput=tags.value;
        const draft={form:{_dirty:false,_changed:new Set()}};editors.add(draft);
        for(const input of [comment,tags])input.addEventListener("input",()=>{draft.form._dirty=true;});
        label(host,"Native Comment",comment);label(host,"Native Tags (separated by semicolons)",tags);
        button(host,"Save Comment and Tags",async()=>{
            const old=new Map(snapshot.tags.map(t=>[typeof t==="string"?t:t.tag,t]));
            const names=[...new Set(tags.value.split(";").map(t=>t.trim()).filter(Boolean))];
            const next=names.map(tag=>old.get(tag)||{tag,type:0});
            const patch={};if(comment.value!==snapshot.comment)patch.comment=comment.value;if(tags.value!==originalTagInput)patch.tags=next;
            await service.saveNative(row.identity,patch,snapshot);snapshot.comment=comment.value;if(patch.tags)snapshot.tags=next;originalTagInput=tags.value;draft.form._dirty=false;status("Native Comment and Tags saved.");
        });
    }
    async function cards(rows){
        clearEditors();$("results").replaceChildren();let lastGroup;
        for(const row of rows){
            const group=query.group?.key!=="none"?service.sortValue(row,query.group):null;
            if(group!==null&&group!==lastGroup){const heading=doc.createElement("h2");heading.textContent=String(group||"No value");$("results").appendChild(heading);lastGroup=group;}
            const card=doc.createElement("details");card.className="card";const summary=doc.createElement("summary"),swatch=doc.createElement("span");swatch.className="swatch";
            if(/^#[a-f0-9]{6}$/i.test(row.hex))swatch.style.backgroundColor=row.hex;swatch.hidden=query.display.color===false;summary.appendChild(swatch);
            summary.appendChild(doc.createTextNode((query.display.text!==false?(row.text||row.type+" annotation"):row.type+" annotation").slice(0,240)));const meta=doc.createElement("span");meta.className="publication-meta";meta.textContent=[query.display.publication!==false?row.title:"",query.display.color!==false?row.colorLabel:"",query.display.page!==false&&row.page?"p. "+row.page:""].filter(Boolean).join(" / ");summary.appendChild(meta);
            card.appendChild(summary);const body=doc.createElement("div");card.appendChild(body);$("results").appendChild(card);
            const paragraph=(label,value)=>{if(!value)return;const p=doc.createElement("p"),strong=doc.createElement("strong");strong.textContent=label+": ";p.append(strong,doc.createTextNode(value));body.appendChild(p);};
            if(query.display.authors!==false)paragraph("Authors / year",[row.authors.join(", "),row.year].filter(Boolean).join(" · "));
            if(query.display.text!==false)paragraph("Annotation",row.text||row.type+" annotation");if(query.display.comment!==false)paragraph("Native Comment",row.comment);
            if(query.display.tags!==false)paragraph("Native Tags",row.tags.join(", "));
            let editor;
            for(const [id,field]of Object.entries(row.fields))if(query.display[field.scope==="global"?"global":"colorFields"]!==false){
                paragraph(row.fieldLabels[id],field.label|| (field.type==="ai"?"Not generated yet":""));
                if(field.type==="ai"&&["failed","cancelled"].includes(row.statuses[id]))button(body,"Retry "+row.fieldLabels[id],async()=>{await editor?.save();await service.regenerate(row.identity,id,true);status("Failed AI field queued for retry.");});
            }
            if(query.display.status!==false)for(const [id,state]of Object.entries(row.statuses))paragraph(row.fieldLabels[id]+" AI status",state);
            if(service.openNetwork)button(body,"Connect research evidence",()=>{sync();return service.openNetwork(main,query,{kind:"annotation",...row.identity});});
            button(body,"Open source annotation",()=>service.navigate(main,row.identity));button(body,"Open publication",()=>service.navigate(main,row.identity,true));
            const editorHost=doc.createElement("div");body.appendChild(editorHost);
            button(body,"Edit manual fields",async()=>{
                if(editor)return;editor=await service.editor(doc,editorHost,row.identity);editors.add(editor);
                button(editorHost,"Save manual fields",async()=>{await editor.save();status("Manual research values saved.");});
                button(editorHost,"Reload values",async()=>{if(editor.form._dirty&&!window.confirm("Discard this draft and reload saved values?"))return;editor.form._dirty=false;editors.delete(editor);editorHost.replaceChildren();editor=null;status("Draft cleared. Select Edit manual fields to reload.");});
            });
            let nativeLoaded=false;button(body,"Edit Comment / Tags",async()=>{if(!nativeLoaded){await nativeEditor(editorHost,row);nativeLoaded=true;}});
            if(row.aiTrigger==="manual"&&Object.values(row.statuses).some(state=>state==="missing"))button(body,"Generate AI Fields",async()=>{await editor?.save();await service.generateMissing(row.identity);status("AI field generation completed.");});
            for(const [id,state]of Object.entries(row.statuses)){
                if(["completed","outdated"].includes(state))button(body,"Regenerate "+row.fieldLabels[id],async()=>{if(window.confirm("Explicitly regenerate this AI field? A provider request may be billed.")){await editor?.save();await service.regenerate(row.identity,id);status("AI field generation queued in background jobs.");}});
            }
        }
        if(!rows.length)$("results").textContent="No matching annotations. Try changing the search, scope or filters.";
    }
    async function search(explicit=false){
        clearTimeout(timer);if(dirty()){status("A manual draft is open. Save it or reload its values before changing results.");return;}
        if(token)token.cancelled=true;const current=token={cancelled:false};sync();loading=true;$("cancel").hidden=false;status("Searching local annotations…");active();
        try{
            const result=await service.query(query,{token:current,offset,limit:pageSize});if(current!==token||current.cancelled)return;
            total=result.total;await cards(result.rows);$("count").textContent=total+" matching annotations · "+result.milliseconds+" ms · "+result.scanned+" cached source records";
            $("previous").disabled=offset===0;$("next").disabled=offset+pageSize>=total;$("page").textContent="Page "+(Math.floor(offset/pageSize)+1);
            status(result.unresolved.length?"Unavailable field definitions: "+result.unresolved.join(", ")+". Their filters remain saved and do not silently broaden results.":"Ready. Search and preview make no AI requests.");
        }catch(error){if(!error.cancelled)throw error;}finally{if(current===token){loading=false;$("cancel").hidden=true;}}
    }
    const savedActions=()=>{for(const id of ["reopen","duplicate","rename","delete"])$(id).disabled=!$("saved").value;};
    const savedList=()=>{const id=$("saved").value;$("saved").replaceChildren();option($("saved"),"","Choose a saved search");for(const search of service.saved())option($("saved"),search.id,search.name);$("saved").value=id;savedActions();};
    async function apply(next){
        if(dirty()){status("Save or reload open manual drafts first.");return;}
        query=service.clone(next);offset=0;$("search").value=query.text;$("library").value=JSON.stringify(query.scope.library);
        await scopeCollections();$("collection").value=query.scope.kind==="collection"?query.scope.key:"";
        const fillSort=(id,group=false)=>{$(id).replaceChildren();if(group)option($(id),"none","No grouping");for(const [key,name]of Object.entries({publication:"Publication",year:"Year",page:"Page",date:"Annotation date",color:"Semantic color"}))option($(id),key,name);for(const f of fields())option($(id),"field:"+f.id,f.label);const part=group?query.group:query.sort;$(id).value=part?.key==="field"?"field:"+part.fieldID:part?.key|| (group?"none":"publication");};
        fillSort("sort");fillSort("group",true);$("direction").value=query.sort?.direction||"asc";
        $("display").replaceChildren();for(const [key,value]of Object.entries(service.defaults(query.scope).display)){
            const names={publication:"Publication title",authors:"Authors and year",color:"Semantic category",page:"Page number",text:"Annotation content",comment:"Native Comment",tags:"Native Tags",global:"Global fields",colorFields:"Color-specific fields",status:"AI generation status"};
            const check=doc.createElement("input");check.type="checkbox";check.checked=query.display?.[key]!==false;label($("display"),names[key]||key,check);check.addEventListener("change",()=>{query.display[key]=check.checked;schedule();});
        }
        await filters();savedList();if(query.id)$("saved").value=query.id;await search(true);
    }
    async function scopeCollections(){
        $("collection").replaceChildren();option($("collection"),"","Entire library");for(const collection of await service.collections(query.scope.library))option($("collection"),collection.key,collection.label);
    }
    for(const library of service.libraries())option($("library"),JSON.stringify(library.identity),library.label);
    $("library").addEventListener("change",action(async()=>{query.scope={kind:"library",library:JSON.parse($("library").value),includeNonPDF:true};offset=0;await scopeCollections();await filters();await search(true);}));
    $("collection").addEventListener("change",action(async()=>{query.scope={kind:$("collection").value?"collection":"library",library:query.scope.library,includeNonPDF:true,...($("collection").value?{key:$("collection").value}:{})};offset=0;await filters();await search(true);}));
    $("search").addEventListener("input",()=>{offset=0;schedule();});$("run").addEventListener("click",action(()=>search(true)));
    $("cancel").addEventListener("click",()=>{if(token)token.cancelled=true;clearTimeout(timer);$("cancel").hidden=true;status("Search cancelled. Existing results retained.");});
    for(const id of ["sort","direction","group"])$(id).addEventListener("change",()=>{offset=0;schedule();});
    $("previous").addEventListener("click",action(async()=>{offset=Math.max(0,offset-pageSize);await search(true);}));$("next").addEventListener("click",action(async()=>{offset+=pageSize;await search(true);}));
    $("clear").addEventListener("click",action(async()=>{query.filters={logic:"and",children:[]};query.text=$("search").value="";offset=0;await filters();await search(true);}));
    $("save").addEventListener("click",action(()=>{sync();const name=window.prompt("Saved search name",query.name||"Research search");if(name?.trim()){query=service.save(query,{id:query.id,name:name.trim()});savedList();$("saved").value=query.id;status("Search saved.");}}));
    $("reopen").addEventListener("click",action(async()=>{const value=service.saved().find(q=>q.id===$("saved").value);if(value){await apply(value);await args.workspace?.select("explorer");}}));
    $("saved").addEventListener("change",savedActions);
    $("duplicate").addEventListener("click",action(()=>{const selected=service.saved().find(q=>q.id===$("saved").value);if(!selected)throw Error("Select a saved search first");const name=window.prompt("Duplicate search name",selected.name+" copy");if(name?.trim()){const copy=service.clone(selected);delete copy.id;const saved=service.save(copy,{name:name.trim()});savedList();$("saved").value=saved.id;savedActions();}}));
    $("rename").addEventListener("click",action(()=>{const current=service.saved().find(q=>q.id===$("saved").value);if(!current)throw Error("Select a saved search first");const name=window.prompt("Saved search name",current.name);if(name?.trim()){const saved=service.save(current,{id:current.id,name:name.trim()});if(query.id===saved.id)query.name=saved.name;savedList();}}));
    $("delete").addEventListener("click",action(()=>{const id=$("saved").value;if(id&&window.confirm("Delete this saved search? Generated notes are preserved.")){service.deleteSearch(id);if(query.id===id){delete query.id;delete query.name;}savedList();}}));
    $("new").addEventListener("click",action(async()=>{await apply(service.defaults({kind:"library",library:query.scope.library}));await args.workspace?.select("explorer");}));
    $("generate").addEventListener("click",action(()=>{sync();if(dirty())throw Error("Save or reload manual drafts before generating notes");service.openNotes(main,query);}));
    if(service.openNetwork){const transfer=button($("generate").parentElement,"Send results to Network",()=>{sync();return service.openNetwork(main,query);});transfer.id="network-results";}
    const listener=()=>{savedList();if(!dirty())schedule();else status("Sources changed. Your draft is retained; save or reload before refreshing.");};service.listeners.add(listener);
    window.addEventListener("explorer-query",action(event=>apply(event.detail)));
    window.addEventListener("unload",()=>{if(token)token.cancelled=true;clearTimeout(timer);service.listeners.delete(listener);clearEditors();});
    args.workspace?.readyView("explorer",{setMain(value){main=value;},setQuery:apply,activate(tab){doc.body.dataset.workspaceSection=tab;savedList();}});
    try{await apply(query);}catch(error){status(error.message||String(error));args.workspace?.failure(error);}
});
