/* One native window, hosting existing controllers without competing services. */
var AnnotaWorkspace = {
    window: null, owner: null, integrations: new Map(), opening: null, stopping: false,
    tabs: ["explorer","notes","saved","activity","network"],
    sections:{explorer:{view:"explorer"},notes:{view:"notes"},saved:{view:"explorer"},activity:{view:"notes"},network:{view:"network"}},
    descriptions:{explorer:'Find annotations across your sources, then open the original passage or use the results in a research note.',notes:'Create research notes or manage existing notes, their content, destinations and update modes.',saved:'Keep useful searches so you can reopen their filters and use their results again.',activity:'Follow background work, review failures and safely pause, cancel or explicitly retry a job.',network:'Connect publications and annotations, organize themes and collect evidence for research questions.',chat:'Select and index PDFs, ask questions, inspect supporting passages and optionally capture verified evidence.'},
    help(root,section){
        const doc=root.ownerDocument||root;
        const hints={
            scope:'Choose where to look. Selected items and collections refer to the current selection in the main Zotero window.',
            kind:'Choose the kind of research note to create. By Publication keeps a separate managed note for each PDF.',
            mode:'Automatic follows annotation changes. Manual updates when requested. Static keeps a fixed snapshot.',
            'bulk-mode':'Choose the new update mode for the notes selected below. Preview and confirmation are required.',
            'destination-mode':'Use a saved destination, choose one each time, or reuse the last destination in this library.',
            'destination-choice':'Library root means standalone. A collection is membership; a parent publication makes a child note.',
            'type-filter':'Limit relationships to one kind of connection; this does not change stored relationships.',
            'ai':'Use saved AI values without requests, or explicitly generate missing values before making notes.',
            'outdated':'Explicitly request replacement of outdated AI values. This may use the configured paid provider.',
            'Search':'Search the chosen scope using the filters shown. This makes no AI requests.',
            'Preview':'Inspect the proposed content before saving or updating notes.',
            'Use this scope':'Apply this source choice to this conversation. It does not index PDFs or send a question.',
            'Index selected sources':'Extract searchable PDF passages locally. Optional embeddings require separate explicit approval.',
            'Keyword only — no embeddings required':'Find matching words locally. No embedding model is required.',
            'Capture Evidence':'Preview the original cited passages before creating native PDF highlights. Exact locations are required.',
            'Capture all cited evidence':'Preview all validated PDF passages cited by this answer; matching highlights are reused.',
            'Capture selected citations':'Preview only the citations you selected. Unverified locations cannot create highlights.',
            'Capture this citation':'Preview this original PDF passage before saving a highlight; this does not capture an AI paraphrase.',
            'Confirm capture':'Create or reuse the selected native highlights and save the chosen manual field assignments.',
            'Generate Note':'Save this answer and its citations as a Zotero note without another AI request.',
            'Generate notes':'Save or update the previewed managed notes. Only explicitly selected AI generation makes requests.',
            'Retry failed answer':'Explicitly retry the failed question using the current source and retrieval choices. A previous request may have been billed.',
            'Save mode':'Apply this note update mode. Automatic also refreshes the note using saved annotation values.',
            'Update':'Refresh this note from its source annotations while preserving its identity and authored content.',
            'Rename':'Choose a title for this note. Its managed identity and source stay the same.',
            'Move note...':'Move this existing non-PDF note within its source library, with a recoverable backup.',
            'Connect':'Create a relationship between selected evidence. Choose a type that describes what the connection means.',
            'AI suggestions':'Ask the configured AI provider to propose connections for your review. Suggestions do not become relationships until accepted.',
            'Pause':'Stop at a safe checkpoint. An in-flight AI request may already have been sent.',
            'Resume':'Continue checkpointed work. Paid or ambiguous requests require explicit approval.',
            'Retry':'Try the failed operation explicitly. Review saved results first to avoid unnecessary paid requests.',
            'Cancel':'Stop remaining work. Completed results are retained; this is not an undo.',
            'Undo this capture':'Remove only highlights created by this capture and restore owned field changes when later edits do not conflict.',
            'Delete':'Remove the selected record only after its confirmation. Research data and unrelated items remain protected.'
        };
        for(const n of root.querySelectorAll('button,select,input,textarea,summary')){
            if(n.title&&!n.dataset.raHelp)continue;
            const label=(n.getAttribute('aria-label')||n.textContent||n.placeholder||'').replace(/\s+/g,' ').trim();
            let text=hints[n.id]||hints[label];
            if(!text&&n.localName==='select'){const context=n.closest('label')?.firstChild?.textContent||label;if(/Retrieval/i.test(context))text='Keyword matches words without embeddings. Semantic finds related meaning using a separately configured embedding model. Hybrid combines both.';else if(/Filter|match|operator|logic/i.test(context))text='Choose how the search combines or compares these filters. Preview results before saving the search.';else text='Choose '+(context.trim()||'an option')+'. This selection is applied when you use the action beside it.';}
            if(!text&&n.type==='checkbox')text=n.hasAttribute('data-include')?'Include this information in the generated note. Empty values follow the selected content settings.':'Select this option to include it in the next action. Saved data changes only when you confirm or save.';
            if(!text&&/search/i.test(n.type||'')||!text&&n.placeholder)text=n.placeholder||'Enter words to narrow the visible results.';
            if(!text&&['input','textarea'].includes(n.localName))text='Enter a value for '+(n.closest('label')?.firstChild?.textContent?.trim()||'this field')+'. Use the related action to apply it.';
            if(!text&&n.localName==='summary')text='Open this section for related options and explanations; opening it makes no AI request.';
            if(!text&&label)text='Use '+label+' for the selected '+(section==='chat'?'conversation':section==='network'?'research evidence':'items')+'.';
            if(text){n.title=text;n.dataset.raHelp='true';}
        }
        const scope=root.nodeType===9?doc.body:root;if(scope&&!scope._raHelpObserver&&doc.defaultView?.MutationObserver){scope._raHelpObserver=new doc.defaultView.MutationObserver(()=>{if(!doc.body||doc.defaultView?.closed||!scope.isConnected){scope._raHelpObserver?.disconnect();return;}this.help(scope,doc.body.dataset.workspaceSection||section);});scope._raHelpObserver.observe(scope,{childList:true,subtree:true});doc.defaultView.addEventListener('unload',()=>scope._raHelpObserver?.disconnect(),{once:true});}
    },
    state() {
        try { const value=JSON.parse(Zotero.Prefs.get("researchannotator.workspaceWindow")||"{}");
            return {width:Math.max(760,Math.min(2400,Number(value.width)||1160)),height:Math.max(500,Math.min(1800,Number(value.height)||820)),tab:this.tabs.includes(value.tab)?value.tab:"explorer"};
        } catch(_){return {width:1160,height:820,tab:"explorer"};}
    },
    remember(win,tab) { Zotero.Prefs.set("researchannotator.workspaceWindow",JSON.stringify({width:win.outerWidth,height:win.outerHeight,tab})); },
    error(main,error,stage="opening") {
        if(error?._workspaceReported)return error._workspaceMessage;
        const message="Research Workspace failed during "+stage+": "+String(error?.message||error)+"\nResource base: "+Annota.rootURI+"\nCheck the installed build and Zotero error console; retry after restarting the extension.";
        if(error&&typeof error==="object"){error._workspaceReported=true;error._workspaceMessage=message;}
        log(message+"\n"+(error?.stack||""));
        if(this.window&&!this.window.closed)this.window.document.getElementById("workspace-error")?.setAttribute("value",message);
        Services.prompt.alert(main||null,"Research Workspace",message);return message;
    },
    async resources() {
        if(Annota._workspaceInitializationError)throw Error(Annota._workspaceInitializationError);
        if(typeof AnnotaResearchNotes==="undefined"||typeof AnnotaExplorer==="undefined"||!Annota.managedNotes||!Annota.backgroundJobs)throw Error("Research infrastructure is not initialized");
        if(!this.chromeHandle){
            const manager=Components.classes["@mozilla.org/addons/addon-manager-startup;1"].getService(Components.interfaces.amIAddonManagerStartup);
            this.chromeHandle=manager.registerChrome(Services.io.newURI(Annota.rootURI+"manifest.json"),[["content","researchannotator",Annota.rootURI]]);
        }
        this.baseURI="chrome://researchannotator/content/";
        const views={};
        for(const view of ["research-explorer","research-notes",...(Annota.network?["research-network"]:[])]){
            const url=this.baseURI+view+".xhtml";
            const response=await Zotero.HTTP.request("GET",url,{responseType:"text"});
            const text=response.responseText||response.response;
            if(!text||!text.includes("<html"))throw Error("Missing or invalid packaged view: "+url);
            views[view]=text.replace(/<\?xml[^>]*\?>/i,"").replace(/<head>/i,'<head><base href="'+this.baseURI+'"/>');
        }
        return views;
    },
    async open(main,tab,query) {
        tab=this.tabs.includes(tab)?tab:this.state().tab;
        try {
            if(this.stopping)throw Error("The extension is shutting down");
            if(this.opening){const win=await this.opening;this.owner=main;win.workspaceHost.setMain?.(main);win.focus();await win.workspaceHost.request(tab,query?{query}:null);return win;}
            if(this.window&&!this.window.closed){this.owner=main;this.window.workspaceHost.setMain?.(main);this.window.focus();await this.window.workspaceHost.request(tab,query?{query}:null);return this.window;}
            this.opening=(async()=>{
                const views=await this.resources(),saved=this.state();
                const args={service:this,main,views,tab,query};
                const win=main.openDialog(this.baseURI+"research-workspace.xhtml","researchannotator-workspace","chrome,dialog=no,resizable,width="+saved.width+",height="+saved.height,args);
                if(!win)throw Error("Zotero did not create a workspace window");this.window=win;this.owner=main;
                await new Promise((resolve,reject)=>{
                    const timeout=setTimeout(()=>reject(Error("Workspace initialization timed out; inspect script/resource errors")),15000);
                    args.ready=()=>{clearTimeout(timeout);resolve();};args.failed=error=>{clearTimeout(timeout);reject(error);};
                    win.addEventListener("unload",event=>{if(event.target!==win.document||win.location.href==="about:blank")return;clearTimeout(timeout);if(this.window===win){this.window=null;this.owner=null;}reject(Error("Workspace closed before initialization"));});
                });
                win.resizeTo?.(saved.width,saved.height);win.focus();return win;
            })();
            return await this.opening;
        } catch(error){if(this.opening&&this.window){this.window.close();this.window=null;}this.error(main,error);throw error;}finally{this.opening=null;}
    },
    async transfer(main,query){const win=await this.open(main,"notes");await win.workspaceHost.request("notes",{explorer:{query,config:AnnotaResearchNotes.configuration(query.scope,{type:"explorer",query})}});return win;},
    command(main,run){return ()=>{Promise.resolve().then(run).catch(error=>{if(!error?._workspaceReported)this.error(main,error,"command");});};},
    addToWindow(main) {
        this.stopping=false;const doc=main.document;
        const integration=this.integrations.get(main)||{};
        const context=doc.getElementById('zotero-itemmenu');
        if(Annota.network&&context&&!doc.getElementById('researchannotator-network-context')){
            const item=doc.createXULElement('menuitem');item.id='researchannotator-network-context';item.setAttribute('label','Connect Research Evidence…');item.addEventListener('command',this.command(main,()=>Annota.network.openSelection(main)));
            const showing=()=>{item.hidden=!Annota.network.selected(main).length;};context.addEventListener('popupshowing',showing);context.appendChild(item);integration.context=context;integration.showing=showing;
        }
        for(const id of ["researchannotator-notes","researchannotator-explorer"])doc.getElementById(id)?.remove();
        const tools=doc.getElementById("menu_ToolsPopup");
        doc.getElementById("annota-tools-review")?.remove();
        if(tools&&!doc.getElementById("researchannotator-workspace-menu")){
            const menu=doc.createXULElement("menu");menu.id="researchannotator-workspace-menu";menu.setAttribute("label","ResearchAnnotator");
            const popup=doc.createXULElement("menupopup");menu.appendChild(popup);
            for(const [label,run]of [["Research Workspace",()=>this.open(main)],["Annotation Review",()=>AnnotaReview.startReview(main,true)],["Research Chat",()=>AnnotaChat.toggle(main)]]){
                const item=doc.createXULElement("menuitem");item.setAttribute("label",label);item.addEventListener("command",this.command(main,run));popup.appendChild(item);
            }
            tools.appendChild(menu);
        }
        const toolbar=doc.getElementById("zotero-tabs-toolbar");
        if(toolbar){
            const anchor=doc.getElementById("annota-tb-chat")||doc.getElementById("zotero-tb-sync");
            for(const [id,title,icon,run]of [
                ["researchannotator-tb-workspace","Research Workspace","research-workspace.svg",()=>this.open(main)],
                ["researchannotator-tb-review","Annotation Review","annotation-review.svg",()=>AnnotaReview.startReview(main,false)]
            ]){
                if(doc.getElementById(id))continue;
                const button=doc.createXULElement("toolbarbutton");button.id=id;button.setAttribute("image",Annota.rootURI+icon);button.setAttribute("label",title);button.setAttribute("class","zotero-tb-button");button.setAttribute("tooltiptext",title);button.setAttribute("aria-label",title);button.style.listStyleImage='url("'+Annota.rootURI+icon+'")';button.addEventListener("command",this.command(main,run));toolbar.insertBefore(button,anchor||null);
            }
        }
        if(!doc.getElementById("researchannotator-toolbar-style")){
            const style=doc.createElementNS("http://www.w3.org/1999/xhtml","style");style.id="researchannotator-toolbar-style";
            style.textContent='#researchannotator-tb-workspace,#researchannotator-tb-review,#annota-tb-chat{min-width:28px!important;flex-shrink:0!important;width:28px!important;height:28px!important;padding:6px!important;border-radius:5px;-moz-context-properties:fill,fill-opacity;fill:var(--fill-secondary,currentColor)} #researchannotator-tb-workspace:hover,#researchannotator-tb-review:hover,#annota-tb-chat:hover{background:var(--fill-quinary,rgba(127,127,127,.16))} #researchannotator-tb-workspace .toolbarbutton-icon,#researchannotator-tb-review .toolbarbutton-icon,#annota-tb-chat .toolbarbutton-icon{width:16px;height:16px;fill:inherit;-moz-context-properties:fill,fill-opacity}';doc.documentElement.appendChild(style);
        }
        this.integrations.set(main,integration);
    },
    removeFromWindow(main){const integration=this.integrations.get(main);if(integration?.context)integration.context.removeEventListener("popupshowing",integration.showing);for(const id of ["researchannotator-network-context","researchannotator-workspace-menu","researchannotator-tb-workspace","researchannotator-tb-review","researchannotator-toolbar-style"])main.document.getElementById(id)?.remove();this.integrations.delete(main);if(this.owner===main){const next=[...this.integrations.keys()].find(win=>!win.closed);if(next&&!this.stopping){this.owner=next;this.window?.workspaceHost?.setMain(next);}else{this.window?.close();this.window=null;this.owner=null;}}},
    stop(){this.stopping=true;this.window?.close();this.window=null;for(const main of [...this.integrations.keys()]){if(typeof AnnotaReview!=="undefined"&&AnnotaReview)AnnotaReview.close(main);this.removeFromWindow(main);}this.chromeHandle?.destruct();this.chromeHandle=null;}
};
