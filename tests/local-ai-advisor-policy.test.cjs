'use strict';
const {test}=require('node:test');
test('local AI advisor: Python, browser and manual policy agree for 21 hardware cases',()=>{

const fs=require('fs'),path=require('path'),vm=require('vm'),cp=require('child_process'),assert=require('assert/strict');const pub=path.resolve(__dirname,'..'),python=process.env.RESEARCHANNOTATOR_PYTHON||'python3',source=fs.readFileSync(path.join(pub,'docs/hardware-advisor.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1],policy=JSON.parse(fs.readFileSync(path.join(pub,'tools/model-policy.json'))),guide=fs.readFileSync(path.join(pub,'docs/hardware-selection.md'),'utf8');
const cases=[];for(const ram of [4,8,15.85,16,24,32,64])for(const kind of ['cpu','unified'])cases.push({ram,kind,vram:0});for(const vram of [4,6,8,12,16,24])cases.push({ram:32,kind:'discrete',vram});cases.push({ram:8,kind:'discrete',vram:24});
for(const c of cases){const nodes={ram:{value:String(c.ram)},vram:{value:String(c.vram)},kind:{value:c.kind==='discrete'?'gpu':c.kind},context:{value:'short'},result:{dataset:{}}};let submit;nodes.advisor={addEventListener:(_,fn)=>submit=fn};vm.runInNewContext(source,{document:{getElementById:id=>nodes[id]}});submit({preventDefault(){}});const js=JSON.parse(nodes.result.dataset.candidates);const run=cp.spawnSync(python,['-B',path.join(pub,'tools/local_ai_advisor.py'),'--manual','--ram',String(c.ram),'--gpu-type',c.kind,'--vram',String(c.vram)],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);const py=JSON.parse(run.stdout).recommendations.chat.map(m=>m.id);assert.deepEqual(js,py,JSON.stringify(c));const expected=policy.chat.filter(m=>Math.round(c.ram)>=m.planning_ram_gib&&(c.kind!=='cpu'||m.id!=='qwen3:8b')&&(c.kind!=='discrete'||c.vram>=m.planning_vram_gib)).map(m=>m.id);assert.deepEqual(py,expected);if(c.ram===32&&c.kind==='discrete')assert.ok(guide.includes('| '+c.vram+' GiB | '+expected.join(', ')+' |'));}
assert.equal(cases.length,21);

});
