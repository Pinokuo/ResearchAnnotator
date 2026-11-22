/* eslint-disable no-undef */
// Navigate from a note citation to its original highlight.
//
// Dragging a highlight with a citation-only template can lose passage
// produces "(Valkokari, 2015, p. 17)". Zotero retains only the source and
// navigation: page navigation opens a page, not the original passage,
// and an EPUB may not have page numbers. This module:
//
// stores the annotation key when a citation is dropped,
// (citationItems[0].annotationKey and annotationURI). Ariane uses these
// linking it to the original annotation identity;
// opens and selects that highlight through the native reader,
// including its temporary outline and sidebar selection;
// 3. adds an "Open annotation" action to the citation menu, which
// and provides an action when native page navigation is unavailable.
//
// For historical citations without annotation keys, use a source-page
// highlight only when exactly one candidate exists.
//
// These integrations depend on Zotero serialization, note-editor
// messages and reader internals. Guard every hook so native behavior
// continues if an integration point becomes unavailable.

var AnnotaCiteLink = {
	_patched: null,

	start() {
		let U = Zotero.EditorInstanceUtilities;
		let EI = Zotero.EditorInstance;
		if (!U || typeof U.serializeAnnotations !== "function" || !EI || !EI.prototype
			|| typeof EI.prototype.init !== "function") {
			throw new Error("Zotero note editor unavailable");
		}
		let self = this;

		let origSerialize = U.serializeAnnotations;
		U.serializeAnnotations = function (annotations, skipEmbeddingItemData) {
			try {
				return self.serializeTagged(origSerialize, this, annotations, skipEmbeddingItemData);
			}
			catch (e) {
				log("Citations: annotation key not attached: " + e);
				return origSerialize.call(this, annotations, skipEmbeddingItemData);
			}
		};

		// The note editor registers and removes its message handler by the
		// same name. Replacing it before init lets Zotero manage the
		// replacement's registration and cleanup correctly.
		let origInit = EI.prototype.init;
		EI.prototype.init = function () {
			try { self.wrapHandler(this); }
			catch (e) { log("Citations: editor hook unavailable: " + e); }
			return origInit.apply(this, arguments);
		};

		this._patched = { U, origSerialize, EI, origInit };
		try { this.wrapQuickCopy(); }
		catch (e) { log("Citations: external drag hook unavailable: " + e); }
		for (let inst of this.instances()) {
			try { this.adopt(inst); }
			catch (e) { log("Citations: existing-editor hook unavailable: " + e); }
		}
	},

	stop() {
		for (let inst of this.instances()) {
			try { this.release(inst); }
			catch (e) { /* The editor has already closed. */ }
		}
		let p = this._patched;
		if (p) {
			// Our override is an own property; the original method remains on
			// the class, so deleting the override restores native behavior.
			// otherwise restore the original.
			delete p.U.serializeAnnotations;
			if (p.U.serializeAnnotations !== p.origSerialize) {
				p.U.serializeAnnotations = p.origSerialize;
			}
			p.EI.prototype.init = p.origInit;
		}
		this._patched = null;
		if (this._quickCopy) {
			try { Zotero.QuickCopy.getContentFromItems = this._quickCopy; }
			catch (e) { /* Zotero is shutting down. */ }
			this._quickCopy = null;
		}
	},

	// ---- 5. Drag or copy a highlight outside Zotero ----
	//
	// Reader drag/copy serializes highlights through a temporary note
	// and QuickCopy.annotationsToNote. serializeAnnotations retains the
	// annotation key in that temporary HTML, but the native Markdown and
	// HTML translators otherwise link citations only to publications.
	// With a citation-only template that loses the highlight target.
	// Rewrite each generated citation link to its corresponding highlight
	// using Zotero's native open-pdf URL structure.
	// Keep the visible citation label unchanged.
	// The URL includes attachment key, page and annotation key.
	// External compatible consumers can still read that stable key.

	_quickCopy: null,

	wrapQuickCopy() {
		let QC = Zotero.QuickCopy;
		if (!QC || typeof QC.getContentFromItems !== "function") {
			throw new Error("QuickCopy.getContentFromItems unavailable");
		}
		let self = this;
		let orig = QC.getContentFromItems;
		QC.getContentFromItems = function (items, format, callback, modified) {
			let links = null;
			try { links = self.annotationLinksFor(items); }
			catch (e) { log("Citation drag: " + e); }
			if (links && links.length && typeof callback === "function") {
				let cb = callback;
				callback = function (obj, worked) {
					try {
						if (worked && obj && typeof obj.string === "string") {
							obj.string = self.rewriteLinks(obj.string, links);
						}
					}
					catch (e) { log("Citation drag: " + e); }
					return cb.apply(this, arguments);
				};
			}
			return orig.call(this, items, format, callback, modified);
		};
		this._quickCopy = orig;
	},

	// Read temporary-note annotation citations in order as
	// [{ itemKey, href }], or return null for another kind of note.
	annotationLinksFor(items) {
		if (!Array.isArray(items) || items.length !== 1) return null;
		let note = items[0];
		if (!note || !(note.isNote && note.isNote()) || note.id) return null;
		let html = note.getNote();
		if (!html || !html.includes("annotationKey")) return null;
		let out = [], m;
		let re = /<span\b(?=[^>]*\bclass="citation")[^>]*\bdata-citation="([^"]*)"/g;
		while ((m = re.exec(html)) !== null) {
			let ci = null;
			try { ci = (JSON.parse(decodeURIComponent(m[1])).citationItems || [])[0]; }
			catch (e) { ci = null; }
			let uri = ci && ci.uris && ci.uris[0];
			let itemKey = uri && (String(uri).match(/items\/([A-Z0-9]{8})$/) || [])[1];
			let href = ci && ci.annotationKey ? this.annotationOpenURI(ci) : null;
			out.push({ itemKey: itemKey || null, href });
		}
		return out.some(l => l.href) ? out : null;
	},

	// Build an annotation-opening URL in the same format as Zotero's
	// cited-passage translators.
	annotationOpenURI(ci) {
		let ann = null;
		try {
			let lk = ci.annotationURI ? Zotero.URI.getURIItemLibraryKey(String(ci.annotationURI)) : null;
			if (lk) ann = Zotero.Items.getByLibraryAndKey(lk.libraryID, lk.key);
		}
		catch (e) { ann = null; }
		if (!this.isAnnotation(ann) || !ann.parentItem) return null;
		let att = ann.parentItem;
		let lib = Zotero.Libraries.get(att.libraryID);
		let path = lib && lib.libraryType === "group"
			? "groups/" + Zotero.Groups.getGroupIDFromLibraryID(att.libraryID) : "library";
		let pos = ann.annotationPosition;
		try { if (typeof pos === "string") pos = JSON.parse(pos); }
		catch (e) { pos = null; }
		let href = "zotero://open-pdf/" + path + "/items/" + att.key;
		if (pos && pos.type === "FragmentSelector") href += "?cfi=" + encodeURIComponent(pos.value);
		else if (pos && pos.type === "CssSelector") href += "?sel=" + encodeURIComponent(pos.value);
		else if (pos && typeof pos.pageIndex === "number") href += "?page=" + (pos.pageIndex + 1);
		else href += "?";
		return href + (href.endsWith("?") ? "" : "&") + "annotation=" + ann.key;
	},

	// Replace citation select links in order, but retain any link whose
	// publication does not match the expected citation.
	// Do not rewrite unrelated user links.
	rewriteLinks(text, links) {
		let i = 0;
		let src = String(text);
		return src.replace(/zotero:\/\/select\/(?:library|groups\/\d+)\/items\/([A-Z0-9]{8})/g, (m, key, at) => {
			while (i < links.length && links[i].itemKey && links[i].itemKey !== key) i++;
			let l = links[i++];
			if (!l || !l.href) return m;
			// Encode parentheses so Markdown links containing EPUB positions
			// do not end at epubcfi parentheses. Encode ampersands in HTML
			// attributes as Zotero does.
			let href = l.href.replace(/\(/g, "%28").replace(/\)/g, "%29");
			return /href="$/.test(src.slice(Math.max(0, at - 6), at)) ? href.replace(/&/g, "&amp;") : href;
		});
	},

	instances() {
		try { return (Zotero.Notes && Zotero.Notes._editorInstances) || []; }
		catch (e) { return []; }
	},

	// Store the annotation key in the citation.

	// Serialize annotations individually so each generated fragment
	// can contain only its own citation. Zotero concatenates these,
	// matching batch output while retaining annotation keys.
	serializeTagged(orig, ctx, annotations, skipEmbeddingItemData) {
		let html = "", citationItems = [];
		for (let a of annotations || []) {
			let res = orig.call(ctx, [a], skipEmbeddingItemData);
			if (!res) continue;
			html += this.tagHTML(res.html || "", a);
			for (let ci of res.citationItems || []) {
				let uris = ci.uris || [];
				if (!citationItems.some(x => (x.uris || []).some(u => uris.includes(u)))) {
					citationItems.push(ci);
				}
			}
		}
		return { html, citationItems };
	},

	tagHTML(html, annotation) {
		let key = annotation && annotation.id;
		if (!key || !/^[A-Z0-9]{8}$/.test(String(key))) return html;
		let att = Zotero.Items.get(annotation.attachmentItemID);
		if (!att) return html;
		let uri = String(Zotero.URI.getItemURI(att)).replace(/[^/]+$/, key);
		return html.replace(/data-citation="([^"]*)"/g, (m, enc) => {
			try {
				let c = JSON.parse(decodeURIComponent(enc));
				let ci = c && c.citationItems && c.citationItems[0];
				if (!ci) return m;
				ci.annotationKey = key;
				ci.annotationURI = uri;
				return 'data-citation="' + encodeURIComponent(JSON.stringify(c)) + '"';
			}
			catch (e) {
				return m;
			}
		});
	},

	// Native Go to Page integration.

	wrapHandler(inst) {
		let orig = inst._messageHandler;
		if (typeof orig !== "function" || orig.__annota) return null;
		let self = this;
		let wrapped = function (e) {
			try {
				if (self.intercept(inst, e, orig)) return undefined;
			}
			catch (err) {
				log("Citations: " + err);
			}
			return orig(e);
		};
		wrapped.__annota = true;
		wrapped.__orig = orig;
		inst._messageHandler = wrapped;
		return wrapped;
	},

	// For an editor already open at activation, replace its existing
	// message handler with the guarded extension handler.
	adopt(inst) {
		let win = inst._iframeWindow;
		let orig = inst._messageHandler;
		if (!win || typeof orig !== "function" || orig.__annota) return;
		let wrapped = this.wrapHandler(inst);
		if (!wrapped) return;
		win.removeEventListener("message", orig);
		win.addEventListener("message", wrapped);
		this.watchPopups(inst);
	},

	release(inst) {
		this.unwatchPopups(inst);
		let w = inst._messageHandler;
		if (typeof w !== "function" || !w.__annota) return;
		inst._messageHandler = w.__orig;
		let win = inst._iframeWindow;
		if (win) {
			win.removeEventListener("message", w);
			win.addEventListener("message", w.__orig);
		}
	},

	// Return true only for handled messages. Opening is asynchronous;
	// if no unique highlight can be resolved, defer to Zotero.
	intercept(inst, e, orig) {
		if (!e || e.source !== inst._iframeWindow || !e.data
			|| e.data.instanceID !== inst.instanceID) {
			return false;
		}
		let msg = e.data.message || {};
		if (msg.action === "initialized") {
			this.watchPopups(inst);
			return false;
		}
		if (msg.action === "insertObject" && msg.type === "zotero/annotation") {
			return this.interceptDrop(inst, e, orig, msg);
		}
		if (msg.action !== "openCitationPage" || !msg.citation) return false;
		this.openCitation(msg.citation).then(done => {
			if (!done) orig(e);
		}, err => {
			log("Open cited highlight: " + err);
			orig(e);
		});
		return true;
	},

	// Drop a highlight citation into note prose.
	//
	// The citation-only template normally inserts a new paragraph.
	// Insert a single citation inline into a nonempty paragraph instead;
	// immediately after sentence punctuation, insert before that
	// punctuation with appropriate spacing.
	// Multiple highlights, empty paragraphs or other templates retain
	// Zotero's native behavior.

	interceptDrop(inst, e, orig, msg) {
		let anns = null;
		try { anns = JSON.parse(msg.data); }
		catch (err) { return false; }
		if (!Array.isArray(anns) || anns.length !== 1
			|| !["highlight", "underline"].includes(anns[0] && anns[0].type)) {
			return false;
		}
		if (inst._readOnly) return true;
		(async () => {
			await inst._ensureNoteCreated();
			let { html } = Zotero.EditorInstanceUtilities.serializeAnnotations(anns);
			if (!html) return;
			let plan = null;
			try { plan = this.inlinePlan(this.editorView(inst), msg.pos, html); }
			catch (err) { log("Citations: inline drop: " + err); }
			if (!plan) {
				inst._postMessage({ action: "insertHTML", pos: msg.pos, html });
				return;
			}
			if (plan.spaces) {
				let view = this.editorView(inst);
				view.dispatch(view.state.tr.insertText(plan.spaces, plan.at));
			}
			inst._postMessage({ action: "insertHTML", pos: plan.pos, html: plan.html });
		})().catch(err => {
			log("Citations: drop: " + err);
			orig(e);
		});
		return true;
	},

	// ProseMirror note-editor view inside its frame, or null.
	editorView(inst) {
		try {
			let w = inst._iframeWindow && inst._iframeWindow.wrappedJSObject;
			let cur = w && w._currentEditorInstance;
			return (cur && cur._editorCore && cur._editorCore.view) || null;
		}
		catch (e) { return null; }
	},

	// Return inline insertion { html, pos, spaces, at }, or null
	// to retain native behavior. If other passage/Comment content
	// accompanies the citation, keep Zotero's paragraph insertion.
	inlinePlan(view, pos, html) {
		if (!view || !Number.isInteger(pos) || pos < 0) return null;
		let m = String(html).trim().match(/^<p>([\s\S]*)<\/p>$/i);
		if (!m || /<\/?(p|div|h\d|ul|ol|li|blockquote|table|pre)\b/i.test(m[1])) return null;
		let inner = m[1].trim();
		// Remaining content after balanced nested citation spans are removed.
		let rest = "", last = 0, found = 0, c;
		let open = /<span\b(?=[^>]*\bclass="citation")[^>]*>/g;
		while ((c = open.exec(inner)) !== null) {
			let end = this._endOfSpan(inner, c.index + c[0].length);
			if (end < 0) return null;
			rest += inner.slice(last, c.index);
			last = end;
			open.lastIndex = end;
			found++;
		}
		rest += inner.slice(last);
		if (!found || rest.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim()) return null;

		let doc = view.state.doc;
		let $p = doc.resolve(Math.min(pos, doc.content.size));
		let block = $p.parent;
		if (!block || !block.isTextblock || !block.content.size) return null;
		let before = block.textBetween(0, $p.parentOffset, null, "\ufffc");
		let after = block.textBetween($p.parentOffset, block.content.size, null, "\ufffc");
		let at = pos;
		// Move a citation inserted after final punctuation before that punctuation.
		let dot = before.match(/(^|[^.])\.(\s*)$/);
		if (dot) {
			at = pos - 1 - dot[2].length;
			before = before.slice(0, before.length - 1 - dot[2].length);
			after = "." + after;
		}
		let lead = before && !/\s$/.test(before) ? " " : "";
		let trail = after && /^[\p{L}\p{N}(«“]/u.test(after) ? " " : "";
		return { html: inner, at, spaces: lead + trail, pos: at + lead.length };
	},

	async openCitation(citation) {
		let ci = citation && citation.citationItems && citation.citationItems[0];
		if (!ci) return false;
		let ann = await this.annotationFor(ci);
		if (!ann) return false;
		await this.showAnnotation(ann);
		return true;
	},

	isAnnotation(item) {
		return !!item && typeof item.isAnnotation === "function" && item.isAnnotation();
	},

	// Annotation resolved by a citation, or null.
	async annotationFor(ci) {
		if (!ci) return null;
		if (ci.annotationURI) {
			try {
				let it = await Zotero.URI.getURIItem(String(ci.annotationURI));
				if (this.isAnnotation(it)) return it;
			}
			catch (e) { /* The highlight was deleted or its library is unavailable. */ }
		}
		let source = null;
		try { source = await Zotero.EditorInstance.getItemFromURIs(ci.uris || []); }
		catch (e) { return null; }
		if (!source) return null;

		if (ci.annotationKey) {
			let it = Zotero.Items.getByLibraryAndKey(source.libraryID, String(ci.annotationKey));
			if (this.isAnnotation(it)) return it;
		}

		// For a historical citation without a key, accept a page match only
		// when it is unique. Never guess among multiple highlights.
		if (!ci.locator) return null;
		let page = String(ci.locator).trim();
		let atts = [];
		if (source.isRegularItem && source.isRegularItem()) {
			atts = source.getAttachments().map(id => Zotero.Items.get(id)).filter(Boolean);
		}
		else if (source.isAttachment && source.isAttachment()) {
			atts = [source];
		}
		let found = [];
		for (let att of atts) {
			if (!att?.isFileAttachment?.()) continue;
			for (let a of att.getAnnotations()) {
				if (!["highlight", "underline"].includes(a.annotationType)) continue;
				if (String(a.annotationPageLabel || "").trim() === page) found.push(a);
			}
		}
		return found.length === 1 ? found[0] : null;
	},

	_delay(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	},

	async _waitFor(test, timeout) {
		let end = Date.now() + timeout;
		for (;;) {
			let v = null;
			try { v = test(); }
			catch (e) { v = null; }
			if (v) return v;
			if (Date.now() > end) return null;
			await this._delay(100);
		}
	},

	readerFor(attachmentID) {
		let readers = (Zotero.Reader && Zotero.Reader._readers) || [];
		return readers.find(r => r && r.itemID === attachmentID && !r._isTabClosed) || null;
	},

	// Open the original document and select the highlight, producing
	// the native outline and sidebar emphasis as after a normal click.
	async showAnnotation(ann) {
		let att = ann.parentItem;
		if (!att) return;
		let location = { annotationID: ann.key };
		let reader = await Zotero.Reader.open(att.id, location);
		// A suspended reader tab may reload without returning a reader immediately.
		reader = reader || await this._waitFor(() => this.readerFor(att.id), 10000);
		if (!reader) return;
		try { await reader._initPromise; }
		catch (e) { return; }
		let ir = reader._internalReader;
		if (!ir) return;

		// Wait for the target annotation after reader opening; inspect its
		// cross-compartment array without passing extension objects into it.
		// fonction.
		let loaded = await this._waitFor(() => {
			let list = ir._state && ir._state.annotations;
			if (!list) return false;
			for (let i = 0; i < list.length; i++) {
				if (list[i] && list[i].id === ann.key) return true;
			}
			return false;
		}, 8000);
		if (!loaded) return;

		try {
			ir.toggleSidebar(true);
			if (typeof reader._onToggleSidebarCallback === "function") {
				reader._onToggleSidebarCallback(true);
			}
			ir.setSidebarView("annotations");
			ir.setSelectedAnnotations(
				Components.utils.cloneInto([ann.key], reader._iframeWindow), false);
		}
		catch (e) {
			log("Citations: highlight selection: " + e);
			try { reader.navigate(location); }
			catch (e2) { /* The reader closed during navigation. */ }
		}
	},

	// ---- 3. Open annotation button ----

	watchPopups(inst) {
		this.unwatchPopups(inst);
		let win = inst._iframeWindow;
		let doc = win && win.document;
		if (!doc || !doc.body || typeof win.MutationObserver !== "function") return;
		let pending = false;
		let obs = new win.MutationObserver(() => {
			if (pending) return;
			pending = true;
			win.requestAnimationFrame(() => {
				pending = false;
				try { this.decoratePopup(inst); }
				catch (e) { log("Citation menu: " + e); }
			});
		});
		obs.observe(doc.body, { childList: true, subtree: true });
		inst._annotaPopupObserver = obs;
	},

	unwatchPopups(inst) {
		if (inst._annotaPopupObserver) {
			try { inst._annotaPopupObserver.disconnect(); }
			catch (e) { /* The window has closed. */ }
		}
		inst._annotaPopupObserver = null;
		try {
			let doc = inst._iframeWindow && inst._iframeWindow.document;
			if (doc) for (let b of doc.querySelectorAll(".annota-open-annotation")) b.remove();
		}
		catch (e) { /* The window has closed. */ }
	},

	// Citation selected in the note whose context menu is open.
	selectedCitation(doc) {
		let el = doc.querySelector(".citation.ProseMirror-selectednode")
			|| doc.querySelector(".ProseMirror-selectednode .citation");
		let raw = el && el.getAttribute("data-citation");
		if (!raw) return null;
		try { return JSON.parse(decodeURIComponent(raw)); }
		catch (e) { return null; }
	},

	decoratePopup(inst) {
		let doc = inst._iframeWindow && inst._iframeWindow.document;
		let popup = doc && doc.querySelector(".citation-popup");
		if (!popup || popup.querySelector(".annota-open-annotation") || popup._annotaPending) return;
		let citation = this.selectedCitation(doc);
		let ci = citation && citation.citationItems && citation.citationItems[0];
		if (!ci) return;
		popup._annotaPending = true;
		this.annotationFor(ci).then(ann => {
			popup._annotaPending = false;
			// The menu closed or citation changed while resolving it.
			if (!ann || !popup.isConnected || popup.querySelector(".annota-open-annotation")) return;
			let now = this.selectedCitation(doc);
			let nci = now && now.citationItems && now.citationItems[0];
			if (!nci || JSON.stringify(nci.uris) !== JSON.stringify(ci.uris)
				|| nci.locator !== ci.locator || nci.annotationKey !== ci.annotationKey) {
				return;
			}
			popup.appendChild(this.makeButton(doc, ann));
		}, () => { popup._annotaPending = false; });
	},

	makeButton(doc, ann) {
		let b = doc.createElement("button");
		b.className = "annota-open-annotation";
		b.type = "button";
		let icon = doc.createElement("div");
		icon.className = "icon";
		let NS = "http://www.w3.org/2000/svg";
		let svg = doc.createElementNS(NS, "svg");
		svg.setAttribute("width", "16");
		svg.setAttribute("height", "16");
		svg.setAttribute("viewBox", "0 0 16 16");
		svg.setAttribute("fill", "none");
		// Highlight icon: an emphasized underline beneath three text lines.
		let paths = [
			["M2 3h12", "1"], ["M2 6.5h12", "1"], ["M2 10.5h8", "3.5"]
		];
		for (let [d, w] of paths) {
			let p = doc.createElementNS(NS, "path");
			p.setAttribute("d", d);
			p.setAttribute("stroke", "currentColor");
			p.setAttribute("stroke-width", w);
			if (w !== "1") p.setAttribute("stroke-opacity", "0.55");
			svg.appendChild(p);
		}
		icon.appendChild(svg);
		let title = doc.createElement("div");
		title.className = "title";
		title.textContent = this.t("cite.open");
		b.appendChild(icon);
		b.appendChild(title);
		b.addEventListener("mousedown", e => e.preventDefault());
		b.addEventListener("click", e => {
			e.preventDefault();
			e.stopPropagation();
			this.showAnnotation(ann).catch(err => log("Citations: " + err));
		});
		return b;
	},

	t(key, vars) {
		try { if (Annota && typeof Annota.t === "function") return Annota.t(key, vars); }
		catch (e) { /* textes indisponibles */ }
		return key === "cite.open" ? "Open annotation" : key;
	},

	// Historical notes: reduce a dragged highlight to its citation.
	//
	// Older drag templates inserted a passage, citation and Comment together.
	// « <span class="highlight" data-annotation=…>« passage »</span>
	// <span class="citation" …>(Auteur, 2015, p. 18)</span> commentaire ».
	// The passage and Comment already belong to the original annotation;
	// reduce the duplicated trio to its keyed citation for native
	// Go to Page and Open Annotation actions.
	// Remove following text only if it matches the original Comment or
	// an earlier version contained in the current Comment.
	// Preserve any independently authored sentence.
	// Do not alter a deleted highlight's historical note text;
	// the note may contain the only surviving copy of its passage.

	_HL_OPEN: /<span\b(?=[^>]*\bclass="highlight")[^>]*\bdata-annotation="([^"]*)"[^>]*>/g,
	_CIT_OPEN: /^(?:\s|&nbsp;|\u00a0)*<span\b(?=[^>]*\bclass="citation")[^>]*>/,

	// Index after the closing span paired with the opening span before from.
	_endOfSpan(html, from) {
		let re = /<span\b[^>]*>|<\/span>/g;
		re.lastIndex = from;
		let depth = 1, m;
		while ((m = re.exec(html)) !== null) {
			depth += m[0] === "</span>" ? -1 : 1;
			if (depth === 0) return m.index + m[0].length;
		}
		return -1;
	},

	// Compare words while ignoring tags, entities, accents, case and whitespace;
	// historical Comments may have been reformatted or corrected.
	_plain(s) {
		return String(s || "")
			.replace(/<br\s*\/?>/gi, " ")
			.replace(/<[^>]+>/g, " ")
			.replace(/&nbsp;|&#160;/g, " ")
			.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
			.replace(/&quot;/g, "\"").replace(/&#0?39;|&apos;/g, "'")
			.replace(/[*_]+/g, "")
			.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
			.toLowerCase()
			.replace(/\s+/g, " ")
			.trim();
	},

	// Readable note-fragment text for the preview.
	_display(s) {
		return String(s || "")
			.replace(/<br\s*\/?>/gi, " ")
			.replace(/<[^>]+>/g, "")
			.replace(/&nbsp;|&#160;/g, " ")
			.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
			.replace(/&quot;/g, "\"").replace(/&#0?39;|&apos;/g, "'")
			.replace(/\s+/g, " ")
			.trim();
	},

	// Dragged highlights in a note: [{ key, attachmentURI }].
	highlightsIn(html) {
		let out = [], m;
		let re = new RegExp(this._HL_OPEN.source, "g");
		while ((m = re.exec(String(html || ""))) !== null) {
			try {
				let a = JSON.parse(decodeURIComponent(m[1]));
				if (a && a.annotationKey) out.push({ key: String(a.annotationKey), attachmentURI: a.attachmentURI || "" });
			}
			catch (e) { /* attribut illisible */ }
		}
		return out;
	},

	// Reduce a note using info(key) to resolve original Comment and URI.
	// existant, null sinon. Renvoie { html, count, kept, examples } ; kept :
	// Report text retained after a citation because it is not the annotation Comment.
	reduceHTML(html, info) {
		html = String(html || "");
		let re = new RegExp(this._HL_OPEN.source, "g");
		let out = "", last = 0, count = 0, kept = [], examples = [], m;
		while ((m = re.exec(html)) !== null) {
			let hlEnd = this._endOfSpan(html, m.index + m[0].length);
			if (hlEnd < 0) continue;
			let key = null;
			try { key = JSON.parse(decodeURIComponent(m[1])).annotationKey || null; }
			catch (e) { key = null; }
			let ann = key ? info(String(key)) : null;
			let mc = ann ? html.slice(hlEnd).match(this._CIT_OPEN) : null;
			if (!mc) { re.lastIndex = hlEnd; continue; }
			let citStart = hlEnd + mc[0].length - mc[0].replace(/^(?:\s|&nbsp;|\u00a0)*/, "").length;
			let citEnd = this._endOfSpan(html, hlEnd + mc[0].length);
			if (citEnd < 0) { re.lastIndex = hlEnd; continue; }

			// The paragraph ends at the first closing block tag.
			let rest = html.slice(citEnd);
			let close = rest.search(/<\/(?:p|li|h[1-6]|div|blockquote|td)>/i);
			let parEnd = close < 0 ? html.length : citEnd + close;
			let tail = this._plain(html.slice(citEnd, parEnd));
			let comment = this._plain(ann.comment);
			let dropTail = !!comment && tail !== ""
				&& (tail === comment || (tail.length >= 12 && comment.includes(tail)));

			let citation = this._tagCitation(html.slice(citStart, citEnd), String(key), ann.uri);
			let end = dropTail ? parEnd : citEnd;
			if (tail && !dropTail) kept.push(this._display(html.slice(citEnd, parEnd)));
			if (examples.length < 3) {
				examples.push({ before: this._display(html.slice(m.index, end)), after: this._display(citation) });
			}
			out += html.slice(last, m.index) + citation;
			last = end;
			re.lastIndex = end;
			count++;
		}
		return { html: count ? out + html.slice(last) : html, count, kept, examples };
	},

	_tagCitation(span, key, uri) {
		return span.replace(/data-citation="([^"]*)"/, (m, enc) => {
			try {
				let c = JSON.parse(decodeURIComponent(enc));
				let ci = c && c.citationItems && c.citationItems[0];
				if (!ci) return m;
				ci.annotationKey = key;
				if (uri) ci.annotationURI = uri;
				return 'data-citation="' + encodeURIComponent(JSON.stringify(c)) + '"';
			}
			catch (e) {
				return m;
			}
		});
	},

	// Map surviving Zotero highlights to their current Comment and URI.
	async annotationsFor(html) {
		let map = new Map();
		for (let h of this.highlightsIn(html)) {
			if (map.has(h.key)) continue;
			let uri = String(h.attachmentURI || "").replace(/[^/]+$/, h.key);
			let it = null;
			try { it = uri ? await Zotero.URI.getURIItem(uri) : null; }
			catch (e) { it = null; }
			if (this.isAnnotation(it)) map.set(h.key, { comment: it.annotationComment || "", uri });
		}
		return map;
	},

	// Preview changes as [{ note, html, count, examples }].
	async plan(notes) {
		let out = [];
		for (let note of notes) {
			let html = note.getNote();
			if (!html || !html.includes('class="highlight"')) continue;
			let anns = await this.annotationsFor(html);
			if (!anns.size) continue;
			let r = this.reduceHTML(html, k => anns.get(k) || null);
			if (r.count) out.push({ note, html: r.html, before: html, count: r.count, examples: r.examples });
		}
		return out;
	},

	// Target selected notes and child notes of selected
	// publications.
	notesOfSelection(window) {
		let seen = new Set(), out = [];
		let add = n => { if (n && !seen.has(n.id)) { seen.add(n.id); out.push(n); } };
		for (let it of window.ZoteroPane.getSelectedItems() || []) {
			if (it.isNote && it.isNote()) add(it);
			else if (it.isRegularItem && it.isRegularItem()) {
				for (let id of it.getNotes()) add(Zotero.Items.get(id));
			}
		}
		return out;
	},

	async notesOfLibrary(libraryID) {
		let s = new Zotero.Search();
		s.libraryID = libraryID;
		s.addCondition("itemType", "is", "note");
		let ids = await s.search();
		return (await Zotero.Items.getAsync(ids)).filter(n => n && n.isNote && n.isNote());
	},

	// Use Zotero's IOUtils/PathUtils globals, or the window's equivalents.
	_io() {
		let win = Zotero.getMainWindow && Zotero.getMainWindow();
		return {
			IO: typeof IOUtils !== "undefined" ? IOUtils : win.IOUtils,
			Path: typeof PathUtils !== "undefined" ? PathUtils : win.PathUtils
		};
	},

	_backupDir() {
		return this._io().Path.join(Zotero.DataDirectory.dir, "annota", "sauvegardes-notes");
	},

	// Preview proposed changes, obtain confirmation and retain the originals
	// before writing replacements.
	async reduce(window, notes) {
		let plan = await this.plan(notes);
		let ps = Services.prompt;
		if (!plan.length) {
			ps.alert(window, "ResearchAnnotator", this.t("reduce.none"));
			return;
		}
		let hl = plan.reduce((n, p) => n + p.count, 0);
		let ex = plan[0].examples[0];
		let cut = s => s.length > 220 ? s.slice(0, 217) + "…" : s;
		let msg = this.t("reduce.confirm", { notes: plan.length, highlights: hl })
			+ "\n\n" + this.t("reduce.before") + "\n" + cut(ex.before)
			+ "\n\n" + this.t("reduce.after") + "\n" + cut(ex.after)
			+ "\n\n" + this.t("reduce.backup");
		if (!ps.confirm(window, "ResearchAnnotator", msg)) return;

		let { IO, Path } = this._io();
		let dir = this._backupDir();
		await IO.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });
		let stamp = new Date().toISOString().replace(/[:.]/g, "-");
		let file = Path.join(dir, "reduction-" + stamp + ".json");
		await IO.writeUTF8(file, JSON.stringify({
			date: new Date().toISOString(),
			notes: plan.map(p => ({ libraryID: p.note.libraryID, key: p.note.key, before: p.before, after: p.html }))
		}));

		let done = 0;
		for (let p of plan) {
			try {
				p.note.setNote(p.html);
				await p.note.saveTx();
				done++;
			}
			catch (e) {
				log("Note reduction " + p.note.key + " : " + e);
			}
		}
		toast("ResearchAnnotator", this.t("reduce.done", { notes: done, highlights: hl }));
	},

	// Restore the last reduction only where no subsequent edits conflict.
	async undoLast(window) {
		let ps = Services.prompt;
		let { IO } = this._io();
		let dir = this._backupDir();
		let files = [];
		try { files = (await IO.getChildren(dir)).filter(f => /reduction-.*\.json$/.test(f)).sort(); }
		catch (e) { files = []; }
		if (!files.length) {
			ps.alert(window, "ResearchAnnotator", this.t("reduce.noundo"));
			return;
		}
		let file = files[files.length - 1];
		let data = JSON.parse(await IO.readUTF8(file));
		if (!ps.confirm(window, "ResearchAnnotator", this.t("reduce.undoconfirm", { notes: data.notes.length, date: data.date }))) return;
		let restored = 0, skipped = 0;
		for (let n of data.notes) {
			let note = await Zotero.Items.getByLibraryAndKeyAsync(n.libraryID, n.key);
			if (!note || note.getNote() !== n.after) { skipped++; continue; }
			note.setNote(n.before);
			await note.saveTx();
			restored++;
		}
		await IO.move(file, file.replace(/\.json$/, ".annulee.json"));
		ps.alert(window, "ResearchAnnotator", this.t("reduce.undone", { restored, skipped }));
	}
};
