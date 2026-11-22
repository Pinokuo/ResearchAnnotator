// Loopback-only deterministic fixture provider. No credentials or document exports.
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const file=process.env.RESEARCH_RELIABILITY_PROVIDER_REPORT||path.join(__dirname,'..','NATIVE_RELIABILITY_PROVIDER.json');
if(fs.existsSync(file))throw Error('Choose a fresh report; prior evidence is preserved');
const requests=[];let failNext=false;
http.createServer((req,res)=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>{try{
    if(req.url==='/control/fail-next'){failNext=true;res.writeHead(200);res.end('{}');return;}
    const payload=JSON.parse(raw);res.setHeader('Content-Type','application/json');
    if(req.url==='/api/embed'){
        const texts=Array.isArray(payload.input)?payload.input:[payload.input];requests.push({kind:'embedding',model:payload.model,inputs:texts.length});fs.writeFileSync(file,JSON.stringify({loopback:true,requests},null,2));
        res.end(JSON.stringify({embeddings:texts.map(t=>[1,2,3,4,5,6,7,String(t).length%17+1])}));return;
    }
    const context=payload.messages.map(m=>m.content).find(s=>s.includes('"sourcePassages"'));
    const data=JSON.parse(context.slice(context.indexOf('{"sourcePassages"'))),passages=data.sourcePassages||[];
    const failed=failNext;failNext=false;requests.push({kind:'chat',model:payload.model,evidence:passages.map(p=>p.id),failed});fs.writeFileSync(file,JSON.stringify({loopback:true,requests},null,2));
    if(failed){res.writeHead(400);res.end(JSON.stringify({error:{message:'Intentional loopback failure for explicit retry verification'}}));return;}
    let text;
    if(!passages.length)text='Note-context interpretation [note 5KUA6C4F]. This is not original PDF evidence.';
    else if(passages.some(p=>/PEDOT/.test(p.text))){
        const impedance=passages.find(p=>/1000 ohms to 250 ohms/.test(p.text)),capacity=passages.find(p=>/1 to 4 mC/.test(p.text));
        text='Source findings: the synthetic fixture reports impedance falling from 1000 to 250 ohms, a 75% reduction'+(impedance?' ['+impedance.id+']':'')+'. Charge storage capacity increases from 1 to 4 mC per square cm, a fourfold increase'+(capacity?' ['+capacity.id+']':'')+'. Interpretation: this is a software-test fixture, not experimental or clinical evidence.';
    }else text='Source finding: cyclic loading affects fatigue crack growth. '+passages.map(p=>'['+p.id+']').join(' ');
    setTimeout(()=>res.end(JSON.stringify({choices:[{message:{content:text}}]})),300);
}catch(error){res.writeHead(400);res.end(JSON.stringify({error:String(error)}));}});}).listen(18770,'127.0.0.1');
