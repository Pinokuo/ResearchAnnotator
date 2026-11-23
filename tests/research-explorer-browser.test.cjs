const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawnSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
test('Explorer real-browser workspace supports search nested filters saved searches navigation and shared note handoff without AI',{timeout:60000},t=>{
    const edge=process.env.RESEARCHANNOTATOR_EDGE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';if(!fs.existsSync(edge))return t.skip('Edge unavailable');
    const root=path.join(__dirname, '..', 'src'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'research-explorer-browser-'));
    const fixture=`
    window.errors=[];window.onerror=m=>errors.push(m);window.confirm=()=>true;window.prompt=()=>"Fixture search";
    const calls={queries:0,AI:0,navigate:0,notes:0},saved=[];
    const scope={kind:'library',library:{type:'user',id:'1234'},includeNonPDF:true};
    const service={listeners:new Set(),clone:v=>JSON.parse(JSON.stringify(v)),defaults:scope=>({text:'',scope,filters:{logic:'and',children:[]},sort:{key:'publication',direction:'asc'},group:{key:'publication'},display:{publication:true,authors:true,color:true,page:true,text:true,comment:true,tags:true,global:true,colorFields:true,status:true}}),
      libraries:()=>[{identity:scope.library,label:'Development library'}],collections:async()=>[{key:'COLL0001',label:'Research collection'}],fields:()=>[{id:'g_m',label:'Experiment',type:'text',scope:'global'}],choices:async()=>[['x','Example']],
      saved:()=>saved,save:(q,o)=>{const value={...q,id:o.id||'search1',name:o.name};const i=saved.findIndex(v=>v.id===value.id);if(i<0)saved.push(value);else saved[i]=value;return value;},
      deleteSearch:id=>{const i=saved.findIndex(q=>q.id===id);if(i>=0)saved.splice(i,1);},
      sortValue:(r,q)=>q.key==='publication'?r.title:r[q.key],
      query:async(q)=>{calls.queries++;return {total:1,milliseconds:3,scanned:1,unresolved:[],rows:[{key:'ANNKEY01',identity:{library:scope.library,key:'ANNKEY01'},title:'Research publication',colorLabel:'Method',hex:'#ffd400',text:'Scientific evidence',type:'highlight',page:'1',authors:['A Researcher'],year:'2024',comment:'Native comment',tags:['Research'],fields:{g_m:{scope:'global',label:'Experiment value',type:'text'}},fieldLabels:{g_m:'Experiment'},statuses:{}}]};},
      navigate:async()=>{calls.navigate++;},openNotes:(main,q)=>{calls.notes++;calls.noteQuery=q;}};
    window.arguments=[{service,main:{}}];
    `;
    const checks=`window.addEventListener('DOMContentLoaded',async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));try{
      await wait(150);document.getElementById('search').value='evidence';document.getElementById('search').dispatchEvent(new Event('input'));await wait(350);
      [...document.querySelectorAll('button')].find(b=>b.textContent==='Add group').click();await wait(60);
      const groups=document.querySelectorAll('.filter-group');[...groups[1].querySelectorAll('button')].find(b=>b.textContent==='Add filter').click();await wait(60);
      document.getElementById('save').click();await wait(30);
      [...document.querySelectorAll('button')].find(b=>b.textContent==='Open source annotation').click();await wait(30);
      document.getElementById('generate').click();await wait(30);
      const report={errors,calls,saved,groups:document.querySelectorAll('.filter-group').length,count:document.getElementById('count').textContent,active:document.getElementById('active').textContent,status:document.getElementById('status').textContent};
      document.body.innerHTML='<pre id="results"></pre>';document.getElementById('results').textContent=JSON.stringify(report);
    }catch(e){document.body.innerHTML='<pre id="results"></pre>';document.getElementById('results').textContent=JSON.stringify({errors:[e.message]});}});`;
    const script=fs.readFileSync(path.join(root,'research-explorer-workspace.js'),'utf8');
    const html=fs.readFileSync(path.join(root,'research-explorer.xhtml'),'utf8').replace(/<\?xml[^>]*\?>/,'').replace('<script src="research-explorer-workspace.js"></script>','<script>'+fixture+'</script><script>'+script+'</script><script>'+checks+'</script>');
    const file=path.join(temp,'workspace.html');fs.writeFileSync(file,html);
    const result=spawnSync(edge,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync','--user-data-dir='+path.join(temp,'browser'),'--virtual-time-budget=10000','--dump-dom',pathToFileURL(file).href],{encoding:'utf8',timeout:55000,maxBuffer:4*1024*1024,windowsHide:true});
    assert.equal(result.status,0,String(result.error||result.stderr).slice(0,1000));fs.writeFileSync(path.join(temp,'output.html'),result.stdout);
    const match=[...result.stdout.matchAll(/<pre id="results">([\s\S]*?)<\/pre>/g)].at(-1);assert.ok(match,result.stdout.slice(-1600));
    const report=JSON.parse(match[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'));
    assert.deepEqual(report.errors,[]);assert.equal(report.calls.AI,0);assert.equal(report.calls.navigate,1);assert.equal(report.calls.notes,1);assert.equal(report.groups,2);
    assert.equal(report.saved.length,1);assert.equal(report.calls.noteQuery.id,'search1');assert.equal(report.calls.noteQuery.text,'evidence');assert.match(report.count,/1 matching annotations/);
    console.log('Explorer browser fixture: '+temp);
});
