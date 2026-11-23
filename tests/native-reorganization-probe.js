/* Isolated native smoke test. Appended by run-native-ui-ux.ps1, never packaged. */
var _reorganizationStartup = startup;
startup = async function (params) {
    await _reorganizationStartup({ ...params, rootURI: UI_UX_ROOT });
    setTimeout(async () => {
        const report = { version: Zotero.version, root: UI_UX_ROOT, checks: {}, errors: [] };
        const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
        const until = async (fn, label) => {
            for (let i = 0; i < 300; i++) { if (await fn()) return; await pause(100); }
            throw Error('Timeout: ' + label);
        };
        let originalPalette, originalGlobals;
        try {
            if (!Zotero.DataDirectory.dir.includes('researchannotator-native-workspace-')) throw Error('Not isolated');
            const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
            const addon = await AddonManager.getAddonByID('researchannotator@pino');
            report.checks.installedAndActive = addon?.isActive && addon.version === '2.43.0-beta.1';
            await until(() => Zotero.getMainWindow()?.document.getElementById('annota-tb-chat'), 'toolbar');
            const main = Zotero.getMainWindow();
            report.checks.threeToolbarButtons = ['researchannotator-tb-workspace', 'researchannotator-tb-review', 'annota-tb-chat']
                .every(id => main.document.querySelectorAll('#' + id).length === 1);
            const jobsBefore = AnnotaInfrastructure.jobs.list().filter(j => /ai|chat/i.test(j.type)).length;
            const workspace = await AnnotaWorkspace.open(main, 'explorer');
            for (const tab of ['explorer', 'notes', 'saved', 'activity', 'network']) {
                await workspace.workspaceHost.request(tab);
                const view = AnnotaWorkspace.sections[tab].view;
                await until(() => workspace.document.getElementById('panel-' + view)?.contentDocument?.documentElement, tab);
                const panel = workspace.document.getElementById('panel-' + view);
                report.checks['workspace-' + tab] = panel.contentDocument.querySelectorAll('button,input,select').length > 0;
            }
            report.checks.singleWorkspace = await AnnotaWorkspace.open(main, 'explorer') === workspace;
            main.Zotero_Tabs.select('zotero-pane');
            AnnotaChat.toggle(main, true);
            const sidebar = AnnotaChat.activeInstance(AnnotaChat._windows.get(main));
            report.checks.sidebarChat = !!sidebar?.root?.isConnected;
            await AnnotaChatWindow.open(sidebar);
            await until(() => AnnotaChatWindow.instance?.thread, 'expanded Chat');
            report.checks.sharedConversation = AnnotaChatWindow.instance.conv === sidebar.conv;
            report.checks.chatStylesLoaded = AnnotaChatWindow.window.document.styleSheets.length > 0;
            Zotero.Utilities.Internal.openPreferences(Annota.prefPaneID);
            let prefs;
            await until(() => {
                const windows = Services.wm.getEnumerator(null);
                while (windows.hasMoreElements()) {
                    const win = windows.getNext();
                    if (win.document.getElementById('researchannotator-settings-logo')) { prefs = win; return true; }
                }
            }, 'preferences');
            const logo = prefs.document.getElementById('researchannotator-settings-logo');
            await until(() => logo.complete && logo.naturalWidth > 0, 'packaged icon');
            report.checks.packagedSettingsLogo = logo.naturalWidth === 96;
            originalPalette = JSON.parse(JSON.stringify(AnnotaPalette.ensure()));
            originalGlobals = Annota.getGlobalFields();
            Annota.saveGlobalFields([]);
            const map = AnnotaPalette.map();
            map['#ffd400'] = { fields: 'manual | Evidence theme | text', trigger: 'manual', prompt: '', template: '' };
            AnnotaPalette.setMap(map);
            const parent = new Zotero.Item('journalArticle');
            parent.libraryID = Zotero.Libraries.userLibraryID;
            parent.setField('title', 'Repository organization smoke ' + Date.now());
            await parent.saveTx();
            const folder = PathUtils.join(PathUtils.parent(UI_UX_REPORT), 'tests', 'fixtures');
            const pdf = await Zotero.Attachments.linkFromFile({ file: PathUtils.join(folder, 'chat-known-a.pdf'), parentItemID: parent.id });
            const passage = await IOUtils.readJSON(PathUtils.join(folder, 'chat-known-position.json'));
            const annotation = await Zotero.Annotations.saveFromJSON(pdf, {
                key: Zotero.Utilities.generateObjectKey(), type: 'highlight', color: '#ffd400', text: passage.text,
                comment: 'Independent native Comment', pageLabel: '1', sortIndex: '00000|000000|00000',
                position: JSON.parse(JSON.stringify(passage.position)), tags: [{ name: 'reorganization-smoke' }]
            });
            await AnnotaCardFields.saveValues(annotation, { manual: 'Preserved structured field' });
            await Annota._syncPaperResearchNote({ libraryID: parent.libraryID, parentID: pdf.id, manualSync: true });
            const config = AnnotaInfrastructure.notes.pdfConfig(pdf, parent.libraryID);
            const note = await AnnotaData.annotation(parent.libraryID, config.noteKey);
            report.checks.nativeHighlightAndFields = annotation.isAnnotation() && AnnotaCardFields.get(annotation).values.manual === 'Preserved structured field';
            report.checks.nativeCommentIndependent = annotation.annotationComment === 'Independent native Comment';
            report.checks.managedNote = note.getNote().includes('Preserved structured field') && note.getNote().includes('annotation=' + annotation.key);
            const key = note.key, html = note.getNote();
            await Annota._syncPaperResearchNote({ libraryID: parent.libraryID, parentID: pdf.id, manualSync: true });
            report.checks.managedNoteStable = note.key === key && note.getNote() === html;
            const reader = await Zotero.Reader.open(pdf.id);
            await until(() => reader._internalReader?._primaryView?._iframeWindow && Annota.getPDFDocument(reader)?.getPageData, 'PDF reader');
            report.checks.pdfReaderLoaded = !!reader._internalReader;
            report.checks.noImplicitAIJobs = AnnotaInfrastructure.jobs.list().filter(j => /ai|chat/i.test(j.type)).length === jobsBefore;
            report.success = Object.values(report.checks).every(Boolean);
        } catch (error) {
            report.errors.push({ message: String(error), stack: error.stack });
        } finally {
            if (originalPalette) AnnotaPalette.save(originalPalette);
            if (originalGlobals) Annota.saveGlobalFields(originalGlobals);
            await IOUtils.writeJSON(UI_UX_REPORT, report, { flush: true });
            Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
        }
    }, 2400);
};
