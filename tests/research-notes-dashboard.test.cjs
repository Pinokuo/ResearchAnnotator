const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

test('research dashboard renders, previews without AI, queues explicit generation and exposes management/job controls in a real browser', {timeout:60000}, t => {
    const edge = process.env.RESEARCHANNOTATOR_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    if (!fs.existsSync(edge)) return t.skip('Edge is unavailable; native Zotero acceptance still required');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'research-notes-dashboard-'));
    const root = path.join(__dirname, '..');
    const html = fs.readFileSync(path.join(root, 'research-notes.xhtml'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'research-notes-dashboard.js'), 'utf8');
    const fixture = `
        window.errors=[];window.onerror=m=>errors.push(m);window.confirm=()=>true;
        const calls={preview:0,enqueue:0,requests:0};
        const jobs={listeners:new Set(),list:()=>[{id:'job1',type:'research-notes',state:'paused',progress:.5,checkpoint:{completedAnnotations:['A'],completedNotes:['P'],pendingAI:2,failures:[]}}]};
        const service={defaults:{text:true,globalAI:true},library:()=>({type:'user',id:'1234'}),
            configs:()=>[{id:'cfg',noteKey:'NOTE',title:'Saved note',mode:'manual',scope:{type:'research',key:'cfg'},sourceScope:{kind:'library'},filter:{type:'color',colorIDs:['p1']},include:{text:true}}],
            fields:()=>[{id:'g1',label:'Experiment',scope:'global',type:'multiselect'}],fieldValues:()=>[['v1','EIS']],colors:()=>[{id:'p1',label:'Method'}],
            items:async()=>({annotations:[]}),preview:async()=>{calls.preview++;return {counts:{publications:1,pdfs:2,annotations:3,existing:4,missing:2,outdated:1,failed:0,pending:0,requests:2},html:'<h2>Safe preview</h2>'};},
            enqueue:async()=>{calls.enqueue++;return 'job2';},canonical:v=>v};
        window.arguments=[{service,main:{ZoteroPane:{getSelectedLibraryID:()=>1},Zotero:{Annota:{managedNotes:{},backgroundJobs:jobs,annotationFields:()=>[]}}}}];
    `;
    const checks = `
        window.addEventListener('DOMContentLoaded',async()=>{
            const wait=()=>new Promise(r=>setTimeout(r,50));
            try {
                await wait(); const management=document.getElementById('notes').textContent;
                document.getElementById('load').click();await wait();
                document.getElementById('kind').value='field';document.getElementById('kind').dispatchEvent(new Event('change'));
                const fieldVisible=!document.getElementById('fieldLabel').hidden;
                document.getElementById('previewButton').click();await wait();
                const before={...calls},summary=document.getElementById('summary').textContent,preview=document.getElementById('preview').textContent;
                document.getElementById('generate').click();await wait();
                const report={errors,calls,before,summary,preview,fieldVisible,management,jobControls:document.getElementById('jobs').textContent,status:document.getElementById('status').textContent};
                document.body.innerHTML='<pre id="results"></pre>';document.getElementById('results').textContent=JSON.stringify(report);
            }catch(e){document.body.innerHTML='<pre id="results"></pre>';document.getElementById('results').textContent=JSON.stringify({errors:[e.message]});}
        });
    `;
    const file = path.join(temp, 'dashboard.html');
    fs.writeFileSync(file, html.replace(/<\?xml[^>]*\?>/, '').replace('<script src="research-notes-dashboard.js"></script>',
        '<script>'+fixture+'</script><script>'+script+'</script><script>'+checks+'</script>'));
    const output = spawnSync(edge, ['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync',
        '--user-data-dir='+path.join(temp,'browser'),'--virtual-time-budget=10000','--dump-dom',pathToFileURL(file).href],
        {encoding:'utf8',timeout:55000,maxBuffer:4*1024*1024,windowsHide:true});
    assert.equal(output.status,0,String(output.error||output.stderr).slice(0,1000));
    fs.writeFileSync(path.join(temp,'output.html'),output.stdout);
    const match=[...output.stdout.matchAll(/<pre id="results">([\s\S]*?)<\/pre>/g)].at(-1);
    assert.ok(match,'Dashboard did not finish: '+output.stdout.slice(-1500));
    const report=JSON.parse(match[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"'));
    assert.deepEqual(report.errors,[]);assert.equal(report.fieldVisible,true);assert.equal(report.before.enqueue,0);assert.equal(report.before.requests,0);
    assert.equal(report.calls.enqueue,1);assert.match(report.summary,/1 publications.*2 PDF attachments.*3 annotations/);assert.match(report.summary,/Estimated new AI requests: 0/);
    assert.match(report.preview,/Safe preview/);assert.match(report.management,/Open.*Update.*View source scope.*Rename.*Edit configuration.*Delete/s);
    assert.match(report.jobControls,/Resume.*Cancel/s);assert.match(report.status,/Generation queued/);
    console.log('Research dashboard browser fixture: '+temp);
});
