window.addEventListener('DOMContentLoaded',event=>{
    if(event.target!==document)return;
    const args=window.arguments[0];
    try{args.service.attach(window,args);args.ready?.();}catch(error){args.failed?.(error);args.service.error(error);}
},{once:true});
