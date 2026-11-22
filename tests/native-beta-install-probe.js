/* One-time actual AddonManager installation in the isolated profile only. */
var _betaInstallStartup=startup;
startup=async function(params){await _betaInstallStartup({...params,rootURI:UI_UX_ROOT});setTimeout(async()=>{
    const report={root:UI_UX_ROOT,previousVersion:params.version,errors:[]};let preserved,addonPath;
    try{
        if(!Zotero.DataDirectory.dir.includes('researchannotator-native-workspace-')||!UI_UX_ROOT.startsWith('jar:file:'))throw Error('Isolated packaged test required');
        const {AddonManager}=ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
        const file=Services.io.newURI(UI_UX_ROOT.slice(4,-2)).QueryInterface(Ci.nsIFileURL).file;
        report.console=[];const listener={observe(message){const text=message.message||message.toString();if(/manifest|XPIInstall|invalid version|corrupt/i.test(text))report.console.push(text.slice(0,1500));}};Services.console.registerListener(listener);const install=await AddonManager.getInstallForFile(file);Services.console.unregisterListener(listener);
        report.installState=install.state;report.installError=install.error;report.installKeys=Object.keys(install);report.candidateVersion=install.addon?.version;
        if(report.candidateVersion!=='2.43.0-beta.1'){const {XPIInstall}=ChromeUtils.importESModule('resource://gre/modules/addons/XPIInstall.sys.mjs');const {XPIExports}=ChromeUtils.importESModule('resource://gre/modules/addons/XPIExports.sys.mjs');try{await XPIInstall.loadManifestFromFile(file,XPIExports.XPIInternal.XPIStates.getLocation(XPIExports.XPIInternal.KEY_APP_PROFILE));}catch(error){report.manifestError=String(error);report.manifestDetails=error.additionalErrors;}throw Error('Unexpected or invalid beta manifest version');}
        const profile=Services.dirsvc.get('ProfD',Ci.nsIFile).path,fixture=PathUtils.parent(profile);
        if(!/^researchannotator-native-workspace-[A-Za-z0-9]+$/.test(PathUtils.filename(fixture)))throw Error('Refusing non-fixture profile');
        addonPath=PathUtils.join(profile,'extensions','researchannotator@pino');if(!await IOUtils.exists(addonPath))addonPath+='.xpi';
        const historyFile=AnnotaChat.historyFile();if(await IOUtils.exists(historyFile))report.historyBackup=await AnnotaInfrastructure.backup(historyFile,await IOUtils.readJSON(historyFile),'native-before-beta-upgrade');await AnnotaChat.loadHistory();const sentinel={id:'beta_upgrade_'+Date.now(),libraryID:Zotero.Libraries.userLibraryID,messages:[{role:'user',content:'Synthetic upgrade persistence sentinel'}],updated:Date.now()};AnnotaChat.touch(sentinel);await AnnotaChat.writeHistory();report.sentinelID=sentinel.id;
        preserved=PathUtils.join(fixture,'addon-before-beta-install-'+Date.now());
        await IOUtils.move(addonPath,preserved,{noOverwrite:true});report.preservedDirectory=preserved;
        await IOUtils.writeJSON(UI_UX_REPORT,{...report,stage:'installing'},{flush:true});
        await install.install();
        const addon=await AddonManager.getAddonByID('researchannotator@pino');report.installedVersion=addon?.version;report.active=addon?.isActive;report.success=report.installedVersion===report.candidateVersion&&report.active;report.stage='complete';
        await IOUtils.writeJSON(UI_UX_REPORT,report,{flush:true});
    }catch(error){report.errors.push(String(error));report.stage='failed';await IOUtils.writeJSON(UI_UX_REPORT,report,{flush:true});}
},2400);};
