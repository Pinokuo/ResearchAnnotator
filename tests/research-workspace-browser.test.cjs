const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
test('unified workspace browser retains controllers and state across sections and transfers Explorer queries',{timeout:60000},t=>{
    const edge=process.env.RESEARCHANNOTATOR_EDGE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';if(!fs.existsSync(edge))return t.skip('Edge unavailable');
    const root=path.join(__dirname, '..', 'src'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'research-workspace-browser-'));
    const view=(name,script)=>fs.readFileSync(path.join(root,name+'.xhtml'),'utf8').replace(/<\?xml[^>]*\?>/,'').replace('<script src="'+script+'"></script>','<script>'+fs.readFileSync(path.join(root,script),'utf8')+'</script>');
    const views={'research-explorer':view('research-explorer','research-explorer-workspace.js'),'research-notes':view('research-notes','research-notes-dashboard.js')};
    const literal=value=>JSON.stringify(value).replace(/</g,'\\u003c');
    const fixture=`
    window.errors=[];window.onerror=m=>errors.push(m);window.confirm=()=>true;window.prompt=()=>"Saved fixture";
    const saved=[],scope={kind:'library',library:{type:'user',id:'1234'}},jobs={listeners:new Set(),list:()=>[{id:'J',type:'structured-ai',state:'paused',progress:.2,checkpoint:{},error:''}]};
    const notes={defaults:{text:true},configs:()=>[],items:async()=>({annotations:[]}),fields:()=>[],colors:()=>[],library:()=>scope.library,fieldValues:()=>[]};
    const explorer={listeners:new Set(),clone:v=>JSON.parse(JSON.stringify(v)),defaults:scope=>({text:'',scope,filters:{logic:'and',children:[]},sort:{key:'publication',direction:'asc'},group:{key:'none'},display:{text:true}}),
    libraries:()=>[{identity:scope.library,label:'Fixture',libraryID:1}],collections:async()=>[],fields:()=>[],saved:()=>saved,choices:async()=>[],query:async()=>({rows:[],total:0,scanned:0,milliseconds:1,unresolved:[]}),
    openNotes:(main,q)=>window.workspaceHost.request('notes',{explorer:{query:q,config:{title:'Filtered note',mode:'manual',include:{text:true}}}})};
    const main={Zotero:{Annota:{explorer,researchNotes:notes,managedNotes:{},backgroundJobs:jobs}},ZoteroPane:{getSelectedLibraryID:()=>1}};
    const service={tabs:['explorer','notes','saved','activity'],sections:{explorer:{view:'explorer'},notes:{view:'notes'},saved:{view:'explorer'},activity:{view:'notes'}},remember(){},error(main,error){errors.push(error.message);}};
    window.arguments=[{main,service,views:${literal(views)},tab:'explorer',ready(){window.ready=true;},failed:error=>errors.push(error.message)}];
    `;
    const checks=`window.addEventListener('DOMContentLoaded',async()=>{const wait=()=>new Promise(r=>setTimeout(r,50));try{
    for(let i=0;i<100&&!window.ready;i++)await wait();if(!window.ready)throw Error('Parent/child startup did not finish');
    const explorerFrame=document.getElementById('panel-explorer'),explorerDoc=explorerFrame.contentDocument;explorerDoc.getElementById('search').value='Retained search';
    await workspaceHost.request('notes');const notesFrame=document.getElementById('panel-notes'),notesDoc=notesFrame.contentDocument;notesDoc.getElementById('title').value='Retained title';
    await workspaceHost.request('saved');await workspaceHost.request('activity');const activity=notesDoc.body.dataset.workspaceSection,jobText=notesDoc.getElementById('jobs').textContent;
    await workspaceHost.request('explorer');const retainedSearch=explorerDoc.getElementById('search').value;
    await workspaceHost.request('notes');const retainedTitle=notesDoc.getElementById('title').value;
    await workspaceHost.request('explorer');explorerDoc.getElementById('generate').click();await wait();
    const transferred=notesDoc.getElementById('kind').disabled&&notesDoc.getElementById('title').value==='Filtered note';
    const report={errors,retainedSearch,retainedTitle,activity,jobText,transferred,frameCount:document.querySelectorAll('iframe').length,sameExplorer:explorerFrame===document.getElementById('panel-explorer'),sameNotes:notesFrame===document.getElementById('panel-notes')};
    document.body.innerHTML='<pre id="results"></pre>';document.getElementById('results').textContent=JSON.stringify(report);
    }catch(error){document.body.innerHTML='<pre id="results"></pre>';document.getElementById('results').textContent=JSON.stringify({errors:[error.message]});}});`;
    const shell='<!doctype html><html><head></head><body><div id="workspace-tabs">'+['explorer','notes','saved','activity'].map(tab=>'<button data-tab="'+tab+'">'+tab+'</button>').join('')+'</div><p id="workspace-error"></p><div id="workspace-panels"></div>';
    const file=path.join(temp,'workspace.html');fs.writeFileSync(file,shell+'<script>'+fixture+'</script><script>'+fs.readFileSync(path.join(root,'research-workspace-window.js'),'utf8')+'</script><script>'+checks+'</script></body></html>');
    const result=spawnSync(edge,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--user-data-dir='+path.join(temp,'browser'),'--virtual-time-budget=10000','--dump-dom',pathToFileURL(file).href],{encoding:'utf8',timeout:55000,maxBuffer:6*1024*1024,windowsHide:true});
    assert.equal(result.status,0,String(result.error||result.stderr).slice(0,1000));fs.writeFileSync(path.join(temp,'output.html'),result.stdout);
    const match=[...result.stdout.matchAll(/<pre id="results">([\s\S]*?)<\/pre>/g)].at(-1);assert.ok(match,result.stdout.slice(-1200));const report=JSON.parse(match[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'));
    assert.deepEqual(report.errors,[]);assert.equal(report.retainedSearch,'Retained search');assert.equal(report.retainedTitle,'Retained title');assert.equal(report.activity,'activity');assert.match(report.jobText,/paused.*Resume.*Cancel/s);assert.equal(report.transferred,true);assert.equal(report.frameCount,2);assert.equal(report.sameExplorer,true);assert.equal(report.sameNotes,true);
    console.log('Unified workspace browser fixture: '+temp);
});
