/* Native XUL shell; existing HTML controllers keep their own mounted DOM/state. */
window.addEventListener("DOMContentLoaded",async event=>{
    if(event.target!==document)return;
    const args=window.arguments[0],service=args.service,frames=new Map();let selected=args.tab,resizeTimer;
    const host=window.workspaceHost={
        setMain(main){args.main=main;for(const record of frames.values()){record.context.main=main;record.api?.setMain?.(main);}},
        contextFor(child){const view=child.frameElement?.getAttribute("data-workspace-view");if(view&&frames.has(view))return frames.get(view).context;for(const record of frames.values())if(record.frame.contentWindow===child)return record.context;throw Error("Unknown workspace view");},
        readyView(view,api){const record=frames.get(view);if(!record)throw Error("Unregistered workspace view");record.api=api;record.resolve(api);},
        failure(error){document.getElementById("workspace-error").textContent=String(error?.message||error);service.error(args.main,error,"view initialization");},
        async mount(view){
            if(frames.has(view))return frames.get(view);
            const frame=document.createElementNS("http://www.w3.org/1999/xhtml","iframe");frame.setAttribute("data-workspace-view",view);frame.setAttribute("title",view==="network"?"Research Knowledge Network":view==="explorer"?"Research Explorer":"Research Notes and Activity");frame.setAttribute("role","tabpanel");frame.id="panel-"+view;
            let resolve,reject;const ready=new Promise((yes,no)=>{resolve=yes;reject=no;});
            const record={frame,ready,resolve,reject,context:{service:view==="network"?args.main.Zotero.Annota.network:view==="explorer"?args.main.Zotero.Annota.explorer:args.main.Zotero.Annota.researchNotes,main:args.main,workspace:host,view}};
            frames.set(view,record);document.getElementById("workspace-panels").appendChild(frame);
            frame.addEventListener("load",()=>{frame.contentWindow.addEventListener("error",event=>host.failure(event.error||Error(event.message)));});
            frame.srcdoc=args.views[view==="network"?"research-network":view==="explorer"?"research-explorer":"research-notes"];
            record.timer=setTimeout(()=>{if(!record.api){const error=Error(view+" controller failed to initialize. Check its packaged script/resource URL.");reject(error);host.failure(error);}},12000);
            ready.then(()=>clearTimeout(record.timer),()=>clearTimeout(record.timer));return record;
        },
        async request(tab,payload){
            if(!service.tabs.includes(tab))throw Error("Unsupported workspace section");selected=tab;
            for(const button of document.querySelectorAll("[data-tab]")){button.setAttribute("aria-selected",String(button.dataset.tab===tab));button.tabIndex=button.dataset.tab===tab?0:-1;button.setAttribute("aria-controls","panel-"+service.sections[button.dataset.tab].view);}
            const view=service.sections[tab].view,record=await host.mount(view);
            for(const [key,value]of frames)value.frame.hidden=key!==view;
            const api=await record.ready;api.activate?.(tab);
            if(payload?.query)await api.setQuery?.(payload.query);
            if(payload?.explorer)await api.setExplorer?.(payload.explorer);
            if(payload?.noteKey)await api.focusManaged?.(payload.noteKey);
            if(payload?.network)await api.setNetwork?.(payload.network);
            const heading=document.getElementById("workspace-title"),description=document.getElementById("workspace-description");if(heading)heading.textContent=({explorer:"Explorer",notes:"Research Notes",saved:"Saved Searches",activity:"Activity",network:"Research Network"})[tab];if(description)description.textContent=service.descriptions?.[tab]||"";record.frame.contentDocument.body.dataset.workspaceEmbedded="true";service.help?.(record.frame.contentDocument,tab);service.remember(window,tab);
        },
        select(tab){return host.request(tab);}
    };
    for(const button of document.querySelectorAll("[data-tab]"))button.addEventListener("click",()=>host.request(button.dataset.tab).catch(host.failure));
    document.getElementById("workspace-tabs").addEventListener("keydown",event=>{
        const buttons=[...document.querySelectorAll("[data-tab]")],index=buttons.indexOf(document.activeElement);let next;
        if(["ArrowRight","ArrowLeft","Home","End"].includes(event.key)){event.preventDefault();next=event.key==="Home"?0:event.key==="End"?buttons.length-1:(index+(event.key==="ArrowRight"?1:-1)+buttons.length)%buttons.length;buttons[next].focus();host.request(buttons[next].dataset.tab).catch(host.failure);}
    });
    window.addEventListener("resize",()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>service.remember(window,selected),200);});
    window.addEventListener("unload",()=>{clearTimeout(resizeTimer);service.remember(window,selected);for(const record of frames.values())clearTimeout(record.timer);});
    try{await host.request(selected,args.query?{query:args.query}:null);args.ready();}catch(error){args.failed(error);host.failure(error);}
},{once:true});
