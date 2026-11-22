const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const edge = process.env.RESEARCHANNOTATOR_EDGE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const literal = value => JSON.stringify(value).replace(/</g, '\\u003c');

// This fixture executes the production layout/sizing functions in a real renderer.
// Zotero storage/providers are absent; it cannot touch a Zotero profile.
function renderMatrix(reference) {
    const results = [], colors = ['#ffd400', '#ff6666', '#5fb236', '#2ea8e5', '#a28ae5', '#e56eee', '#f19837', '#aaaaaa'];
    const labels = ['Research question', 'Experimental observations and validation evidence', 'Thermomechanical constitutive assumptions across temperature regimes',
        'Results and limitations', 'Methods and calibration measurements', 'Scientific evidence', 'Boundary conditions and uncertainty', 'Discussion'];
    const rect = node => { const r = node.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const quad = button => {
        const m = new DOMMatrix(getComputedStyle(button).transform), parent = button.offsetParent.getBoundingClientRect();
        const x = parent.left + button.offsetLeft, y = parent.top + button.offsetTop;
        const w = parseFloat(getComputedStyle(button).width), h = parseFloat(getComputedStyle(button).height);
        return [[0, 0], [w, 0], [w, h], [0, h]].map(([a, b]) => ({ x: x + m.a * a + m.c * b, y: y + m.b * a + m.d * b }));
    };
    const overlaps = (a, b) => {
        for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
            const p = polygon[i], q = polygon[(i + 1) % polygon.length], axis = { x: -(q.y - p.y), y: q.x - p.x };
            const project = poly => poly.map(v => v.x * axis.x + v.y * axis.y);
            const aa = project(a), bb = project(b);
            if (Math.max(...aa) <= Math.min(...bb) + .1 || Math.max(...bb) <= Math.min(...aa) + .1) return false;
        }
        return true;
    };
    for (const layout of reference ? ['wrap', 'stack'] : ['single', 'wrap', 'stack', 'slanted', 'vertical']) for (const count of [3, 5, 8, 12]) for (const kind of ['selection', 'annotation']) {
        window.fixtureLayout = layout;
        const popup = document.createElement('div'); popup.className = kind + '-popup';
        popup.style.cssText = 'position:absolute;left:12px;top:12px;border:1px solid #777;background:white;color:black;';
        const picker = document.createElement('div'); popup.appendChild(picker); document.body.appendChild(popup);
        AnnotaPalette.stylePicker(picker);
        const buttons = [];
        for (let i = 0; i < count; i++) {
            const button = document.createElement('button'); button.type = 'button';
            AnnotaPalette.styleButton(button, { hex: colors[i % colors.length], label: labels[i % labels.length] + (i >= 8 ? ' ' + (i + 1) : '') }, kind === 'annotation' && i === 0);
            picker.appendChild(button); buttons.push(button);
        }
        const footer = document.createElement('div'); footer.textContent = 'Comment / Tags / Global fields / Color fields'; footer.style.cssText = 'font:12px sans-serif;padding:8px 0;'; popup.appendChild(footer);
        if (!reference && AnnotaPalette.geometricLayout(layout)) AnnotaPalette.measurePicker(picker);
        const data = { layout, count, kind, viewport: innerWidth, popup: rect(popup), picker: rect(picker), scrollWidth: picker.scrollWidth,
            geometry: picker._annotaGeometry, buttons: buttons.map(button => ({ rect: rect(button), text: button.textContent,
                background: getComputedStyle(button).backgroundImage, color: getComputedStyle(button).color, font: getComputedStyle(button).font,
                transform: getComputedStyle(button).transform, clientWidth: button.clientWidth, scrollWidth: button.scrollWidth,
                lines: (() => { const range = document.createRange(); range.selectNodeContents(button); return range.getClientRects().length; })() })) };
        if (!reference && ['slanted', 'vertical'].includes(layout)) {
            const polygons = buttons.map(quad); data.overlap = false;
            for (let i = 0; i < polygons.length; i++) for (let j = i + 1; j < polygons.length; j++) if (overlaps(polygons[i], polygons[j])) data.overlap = true;
            data.missedHits = [];
            for (const button of buttons) {
                button.scrollIntoView({ inline: 'center', block: 'nearest' });
                const p = quad(button);
                for (const [u, v] of [[.04, .15], [.5, .5], [.96, .85]]) {
                    const x = p[0].x + u * (p[1].x - p[0].x) + v * (p[3].x - p[0].x);
                    const y = p[0].y + u * (p[1].y - p[0].y) + v * (p[3].y - p[0].y);
                    const hit = document.elementFromPoint(x, y);
                    if (hit !== button && !button.contains(hit)) data.missedHits.push({ text: button.textContent, x, y, hit: hit?.className });
                }
            }
        }
        results.push(data); popup.remove();
    }
    AnnotaPalette.stopLayouts?.();
    document.body.textContent = '';
    const report = document.createElement('pre'); report.id = 'frame-results'; report.textContent = JSON.stringify(results); document.body.appendChild(report);
}

test('real Edge geometry: 3/5/8/12 colors, long labels, both popups, all five layouts; Wrap/Stacked match frozen build', { skip: !fs.existsSync(edge), timeout: 60000 }, () => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ResearchAnnotator-layout-'));
    const sources = ['bootstrap.js', 'palette.js'].map(file => fs.readFileSync(path.join(root, file), 'utf8'));
    const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/color-layout-baseline.json'), 'utf8'));
    function frameHTML(reference) {
        const startup = `window.onerror=(message)=>{document.body.textContent=message;};window.fixtureLayout='wrap';window.Zotero={Prefs:{get:()=>window.fixtureLayout==='unused'?undefined:undefined},debug(){}};` +
            `Zotero.Prefs.get=key=>key==='researchannotator.colorLabelLayout'?window.fixtureLayout:undefined;`;
        const pinned = reference ? `const pinned=${literal(baseline)};Annota._ensureAnnotationInterfaceStyles=doc=>{if(doc.getElementById('annota-interface-style'))return;const s=doc.createElement('style');s.id='annota-interface-style';s.textContent=pinned.interfaceCSS;doc.head.appendChild(s);};` +
            `AnnotaPalette.stylePicker=eval('({'+pinned.stylePicker+'})').stylePicker;AnnotaPalette.styleButton=eval('({'+pinned.styleButton+'})').styleButton;` : '';
        return '<!doctype html><meta charset="utf-8"><style>body{margin:0;font:12px sans-serif;}</style><body><script>' + startup +
            sources.map(source => `eval(${literal(source)});`).join('') + pinned + `(${renderMatrix.toString()})(${reference});</script>`;
    }
    const frames = [false, true].flatMap(reference => [2400, 640].map(width => ({ reference, width, html: frameHTML(reference) })));
    const html = '<!doctype html><meta charset="utf-8"><body><script>' +
        `const inputs=${literal(frames)},results=[];function next(){if(!inputs.length){document.body.innerHTML='<pre id="results"></pre>';document.getElementById('results').textContent=JSON.stringify(results);return;}const entry=inputs.shift(),frame=document.createElement('iframe');frame.style.cssText='border:0;width:'+entry.width+'px;height:1200px;';frame.onload=()=>{try{results.push({reference:entry.reference,width:entry.width,data:JSON.parse(frame.contentDocument.getElementById('frame-results').textContent)});}catch(e){results.push({error:e.message,body:frame.contentDocument.body.textContent.slice(0,1000)});}frame.remove();next();};frame.srcdoc=entry.html;document.body.appendChild(frame);}next();</script>`;
    const file = path.join(temp, 'matrix.html'); fs.writeFileSync(file, html);
    const output = spawnSync(edge, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync',
        '--user-data-dir=' + path.join(temp, 'browser'), '--window-size=2600,1500', '--virtual-time-budget=10000', '--dump-dom', pathToFileURL(file).href], { encoding: 'utf8', timeout: 55000, maxBuffer: 24 * 1024 * 1024, windowsHide: true });
    assert.equal(output.status, 0, String(output.error || output.stderr).slice(0, 1000));
    fs.writeFileSync(path.join(temp, 'output.html'), output.stdout);
    const match = [...output.stdout.matchAll(/<pre id="results">([\s\S]*?)<\/pre>/g)].at(-1);
    assert.ok(match, 'Renderer did not finish: ' + output.stdout.slice(-1200));
    const decoded = match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    const report = JSON.parse(decoded); fs.writeFileSync(path.join(temp, 'results.json'), JSON.stringify(report, null, 2));
    assert.equal(report.length, 4); for (const group of report) assert.ok(!group.error, JSON.stringify(group));
    let checked = 0;
    for (const group of report.filter(group => !group.reference)) for (const row of group.data) {
        checked++; const context = `${row.layout}/${row.count}/${row.kind}/${row.viewport}`;
        assert.ok(row.popup.width <= row.viewport - 23, context + ' viewport width');
        const counterpart = group.data.find(other => other.layout === row.layout && other.count === row.count && other.kind !== row.kind);
        assert.ok(Math.abs(row.popup.width - counterpart.popup.width) < 1, context + ' matching popup widths');
        if (['single', 'slanted', 'vertical'].includes(row.layout)) {
            for (const button of row.buttons) { assert.equal(button.lines, 1, context + ' complete single-line label'); assert.ok(button.scrollWidth <= button.clientWidth + 1, context + ' label fits'); }
            assert.equal(row.geometry.overflow, row.geometry.width > row.picker.width + .5, context + ' fallback only when necessary');
            if (!row.geometry.overflow) assert.ok(row.scrollWidth <= row.picker.width + 1, context + ' no unnecessary scrolling');
        }
        if (row.layout === 'single') {
            assert.ok(row.buttons.every(button => Math.abs(button.rect.top - row.buttons[0].rect.top) < 1), context + ' one horizontal row');
            if (!row.geometry.overflow) assert.ok(row.popup.width >= row.geometry.width + 16, context + ' popup expands to fit row');
        }
        if (['slanted', 'vertical'].includes(row.layout)) {
            assert.equal(row.overlap, false, context + ' disjoint clickable polygons'); assert.deepEqual(row.missedHits, [], context + ' entire visible buttons clickable');
            if (row.layout === 'vertical') for (const button of row.buttons) {
                assert.ok(Math.abs(button.rect.height - row.buttons[0].rect.height) < 1, context + ' equal heights');
                assert.ok(button.rect.height > button.rect.width * 2, context + ' narrow vertical rectangle');
            }
        }
        if (['wrap', 'stack'].includes(row.layout)) {
            const original = report.find(other => other.reference && other.width === group.width).data.find(other => other.layout === row.layout && other.count === row.count && other.kind === row.kind);
            assert.deepEqual(row.popup, original.popup, context + ' original popup geometry');
            assert.deepEqual(row.picker, original.picker, context + ' original picker geometry');
            assert.deepEqual(row.buttons, original.buttons, context + ' original appearance/labels/geometry');
        }
    }
    console.log(`Real renderer checked ${checked} current configurations plus 32 Wrap/Stacked references; report: ${path.join(temp, 'results.json')}`);
});
