/* eslint-disable no-undef */
// Live spelling and grammar in supported editable surfaces.
//
// Watch library, reader-pane and separate-window note editors,
// plus reader annotation Comments. Do not rewrite those editors:
// observe typing, check after a pause with the macOS service,
// and use CSS.highlights to mark text ranges without changing
// their stored content.
// Keep source quotations and opaque note elements untouched.
//
// Apply an accepted correction as insertText input so the editor
// handles saving and undo like an ordinary user edit.
// Without CSS Highlight support, retain the badge and correction popup.

var AnnotaSpellLive = {
	DELAY: 1200,           // Typing debounce before checking, in milliseconds.
	SCAN: 2000,            // Interval for discovering newly opened editors.
	MAX: 50000,            // Maximum text length for live checking.
	BLOCKS: /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TD|TH|TR|UL|OL|TABLE|SECTION|ARTICLE|HEADER|FOOTER)$/,
	// Citations, source highlights and formulas are source content;
	// do not underline or correct them. See AnnotaSpell.OPAQUE.
	OPAQUE: ".citation, .highlight, .underline, .math, [contenteditable=\"false\"]",

	_docs: new Map(),      // document → { states, timers, handlers, popover, badge }
	_timer: null,
	_broken: false,
	ignored: new Set(),    // Words ignored for this session.

	enabled() {
		return !this._broken && !!AnnotaSpell && AnnotaSpell.available()
			&& getPref("spellLive", true) !== false;
	},

	start() {
		this.stop();
		let tick = () => {
			try {
				if (this.enabled()) this.scan();
				else this.detachAll();
			}
			catch (e) { log("Live spelling: " + e); }
			this._timer = setTimeout(tick, this.SCAN);
		};
		tick();
	},

	stop() {
		if (this._timer) clearTimeout(this._timer);
		this._timer = null;
		this.detachAll();
	},

	// Discover supported editors.

	scan() {
		let en = Services.wm.getEnumerator(null);
		while (en.hasMoreElements()) {
			let w = en.getNext();
			let d;
			try { d = w.document; } catch (e) { continue; }
			if (!d || !d.querySelectorAll) continue;
			for (let ne of d.querySelectorAll("note-editor")) {
				try {
					let f = ne._iframe || ne.querySelector("iframe")
						|| (ne.shadowRoot && ne.shadowRoot.querySelector("iframe"));
					let fd = f && f.contentDocument;
					if (fd && fd.body) this.attach(fd);
				}
				catch (e) { /* The editor is still loading. */ }
			}
		}
		for (let r of (Zotero.Reader && Zotero.Reader._readers) || []) {
			try {
				let d = r._iframeWindow && r._iframeWindow.document;
				if (d && d.body) this.attach(d);
			}
			catch (e) {}
		}
		// Forget documents removed by closing notes or tabs.
		for (let doc of Array.from(this._docs.keys())) {
			let alive = false;
			try { alive = !!doc.defaultView && !doc.defaultView.closed && !!doc.body; } catch (e) {}
			if (!alive) this._docs.delete(doc);
		}
	},

	attach(doc) {
		if (this._docs.has(doc)) return;
		let rec = { states: new Map(), timers: new Map(), popover: null, badge: null, badgeFor: null };
		let h = {
			input: (e) => this.onInput(doc, rec, e),
			focusin: (e) => {
				let el = this.targetOf(e.target);
				if (el && !rec.states.has(el)) this.schedule(doc, rec, el, 300);
				if (el) this.showBadge(doc, rec, el);
			},
			focusout: () => {
				let w = doc.defaultView;
				w.setTimeout(() => {
					if (rec.popover) return;
					let el = this.targetOf(doc.activeElement);
					if (!el) this.hideBadge(rec);
				}, 200);
			},
			mouseup: (e) => {
				if (rec.popover && rec.popover.contains(e.target)) return;
				if (rec.badge && rec.badge.contains(e.target)) return;
				this.onCaret(doc, rec);
			},
			keyup: (e) => {
				if (e.key === "Escape") { this.closePopover(rec); return; }
				if (/^Arrow|^Home$|^End$/.test(e.key)) this.onCaret(doc, rec);
				else if (this.fieldRoot(e.target)) this.closePopover(rec);
			},
			mousedown: (e) => {
				if (rec.popover && !rec.popover.contains(e.target)) this.closePopover(rec);
			},
			scroll: () => {
				this.closePopover(rec);
				if (rec.badgeFor) this.placeBadge(doc, rec, rec.badgeFor);
			}
		};
		doc.addEventListener("input", h.input, true);
		doc.addEventListener("focusin", h.focusin, true);
		doc.addEventListener("focusout", h.focusout, true);
		doc.addEventListener("mouseup", h.mouseup, true);
		doc.addEventListener("keyup", h.keyup, true);
		doc.addEventListener("mousedown", h.mousedown, true);
		doc.addEventListener("scroll", h.scroll, true);
		rec.handlers = h;
		this.injectStyle(doc);
		this._docs.set(doc, rec);
		// Check an editor already focused before extension activation.
		let el = this.targetOf(doc.activeElement);
		if (el) this.schedule(doc, rec, el, 300);
	},

	detach(doc) {
		let rec = this._docs.get(doc);
		this._docs.delete(doc);
		if (!rec) return;
		try {
			let h = rec.handlers;
			for (let [type, fn] of Object.entries(h)) doc.removeEventListener(type, fn, true);
			for (let t of rec.timers.values()) doc.defaultView.clearTimeout(t);
			this.closePopover(rec);
			this.hideBadge(rec);
			let st = doc.getElementById("annota-spell-live-style");
			if (st) st.remove();
			let reg = this.registry(doc);
			if (reg) { reg.delete("annota-spelling"); reg.delete("annota-grammar"); }
		}
		catch (e) { /* The document has closed. */ }
	},

	detachAll() {
		for (let doc of Array.from(this._docs.keys())) this.detach(doc);
	},

	// Structured reader-card text fields need checking too. The system
	// checker can underline issues but may not provide all correction UI.
	// offers corrections only through a right-click menu absent from the reader sidebar.
	// Where text controls cannot host range highlights, show a popup
	// for the issue under the pointer instead.
	FIELD: "textarea.annota-card-input",

	fieldRoot(t) {
		try {
			if (t && t.nodeType !== 1) t = t.parentElement;
			return t && t.matches && t.matches(this.FIELD) ? t : null;
		}
		catch (e) { return null; }
	},

	isField(el) {
		return !!el && el.tagName === "TEXTAREA";
	},

	// Watch editable content roots and reader-card text controls.
	targetOf(t) {
		return this.editableRoot(t) || this.fieldRoot(t);
	},

	// Find the outermost contenteditable root, excluding native form
	// controls used inside structured field forms.
	editableRoot(t) {
		try {
			if (t && t.nodeType !== 1) t = t.parentElement;
			if (!t || !t.closest) return null;
			if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return null;
			if (t.closest(".annota-live-pop, .annota-live-badge")) return null;
			let el = t.closest('[contenteditable="true"], [contenteditable=""]');
			if (!el || !el.isContentEditable) return null;
			let up = el.parentElement && el.parentElement.closest('[contenteditable="true"], [contenteditable=""]');
			while (up) {
				el = up;
				up = el.parentElement && el.parentElement.closest('[contenteditable="true"], [contenteditable=""]');
			}
			return el;
		}
		catch (e) { return null; }
	},

	// Run checking.

	onInput(doc, rec, e) {
		let el = this.targetOf(e.target);
		if (!el) return;
		// Invalidate old highlights after text changes because offsets have moved.
		let st = rec.states.get(el);
		if (st && st.issues.length) {
			st.issues = [];
			this.refreshHighlights(doc, rec);
		}
		this.closePopover(rec);
		this.schedule(doc, rec, el, this.DELAY);
	},

	schedule(doc, rec, el, delay) {
		let w = doc.defaultView;
		let prev = rec.timers.get(el);
		if (prev) w.clearTimeout(prev);
		rec.timers.set(el, w.setTimeout(() => {
			rec.timers.delete(el);
			this.check(doc, rec, el).catch(e => log("Live spelling: " + e));
		}, delay));
	},

	// Visible field text and its mapping to text nodes. A
	// Separate block elements with a virtual newline.
	snapshot(el) {
		let doc = el.ownerDocument;
		let walker = doc.createTreeWalker(el, 4 /* SHOW_TEXT */);
		let text = "", segs = [], gaps = [], lastBlock = null, lastOpaque = null, node;
		while ((node = walker.nextNode())) {
			let data = node.data;
			if (!data) continue;
			let opaque = node.parentElement && node.parentElement.closest(this.OPAQUE);
			if (opaque && opaque !== el && el.contains(opaque)) {
				// Represent opaque elements with spaces outside editable segments;
				// no correction range may contain them.
				if (opaque !== lastOpaque) {
					gaps.push(text.length);
					text += " ";
				}
				lastOpaque = opaque;
				continue;
			}
			lastOpaque = null;
			let block = node.parentElement;
			while (block && block !== el && !this.BLOCKS.test(block.tagName)) block = block.parentElement;
			if (lastBlock && block !== lastBlock && text && !text.endsWith("\n")) text += "\n";
			lastBlock = block;
			segs.push({ node, start: text.length, end: text.length + data.length });
			text += data;
		}
		return { text, segs, gaps };
	},

	toRange(doc, snap, a, b) {
		if (b <= a || snap.text.slice(a, b).includes("\n")) return null;
		if ((snap.gaps || []).some(g => g >= a && g < b)) return null;
		let s = snap.segs.find(x => a >= x.start && a < x.end);
		let e = snap.segs.find(x => b - 1 >= x.start && b - 1 < x.end);
		if (!s || !e) return null;
		try {
			let r = doc.createRange();
			r.setStart(s.node, a - s.start);
			r.setEnd(e.node, b - e.start);
			return r;
		}
		catch (err) { return null; }
	},

	async check(doc, rec, el) {
		if (!this.enabled()) return;
		if (!el.isConnected) {
			rec.states.delete(el);
			this.refreshHighlights(doc, rec);
			return;
		}
		if (this.isField(el)) return this.checkField(doc, rec, el);
		let snap = this.snapshot(el);
		if (!snap.text.trim() || snap.text.length > this.MAX) {
			rec.states.set(el, { text: snap.text, issues: [] });
			this.refreshHighlights(doc, rec);
			this.showBadge(doc, rec, el);
			return;
		}
		let res;
		try { res = await AnnotaSpell.check([snap.text]); }
		catch (e) {
			// If the checker is unavailable, stop rather than restarting
			// osascript after every keystroke.
			this._broken = true;
			log("Live spelling disabled: " + e);
			this.detachAll();
			return;
		}
		// Ignore results if typing changed the text while checking ran.
		if (!el.isConnected || this.snapshot(el).text !== snap.text) return;
		let issues = AnnotaSpell.normalize(snap.text, res[0])
			.filter(x => !this.ignored.has(x.word));
		for (let x of issues) x.range = this.toRange(doc, snap, x.start, x.start + x.length);
		rec.states.set(el, { text: snap.text, issues: issues.filter(x => x.range) });
		this.refreshHighlights(doc, rec);
		this.showBadge(doc, rec, el);
	},

	// Text controls expose value offsets but no DOM ranges for
	// CSS highlights.
	async checkField(doc, rec, el) {
		let text = String(el.value || "");
		if (!text.trim() || text.length > this.MAX) {
			rec.states.set(el, { text, issues: [] });
			this.showBadge(doc, rec, el);
			return;
		}
		let res;
		try { res = await AnnotaSpell.check([text]); }
		catch (e) {
			this._broken = true;
			log("Live spelling disabled: " + e);
			this.detachAll();
			return;
		}
		if (!el.isConnected || String(el.value || "") !== text) return;
		let issues = AnnotaSpell.normalize(text, res[0]).filter(x => !this.ignored.has(x.word));
		rec.states.set(el, { text, issues });
		this.showBadge(doc, rec, el);
	},

	// ---- Soulignement ----

	registry(doc) {
		try {
			let w = doc.defaultView;
			return (w && w.CSS && w.CSS.highlights && typeof w.Highlight === "function")
				? w.CSS.highlights : null;
		}
		catch (e) { return null; }
	},

	refreshHighlights(doc, rec) {
		let reg = this.registry(doc);
		if (!reg) return;
		let sp = [], gr = [];
		for (let st of rec.states.values()) {
			for (let x of st.issues) if (x.range) (x.type === "grammar" ? gr : sp).push(x.range);
		}
		try {
			let w = doc.defaultView;
			if (sp.length) reg.set("annota-spelling", new w.Highlight(...sp));
			else reg.delete("annota-spelling");
			if (gr.length) reg.set("annota-grammar", new w.Highlight(...gr));
			else reg.delete("annota-grammar");
		}
		catch (e) { log("Live spelling highlight: " + e); }
	},

	// ---- Correction popover ----

	onCaret(doc, rec) {
		let field = this.fieldRoot(doc.activeElement);
		if (field) {
			let st = rec.states.get(field);
			let a = field.selectionStart, b = field.selectionEnd;
			let hit = st && st.text === field.value && st.issues.find(x => a >= x.start && b <= x.start + x.length);
			if (hit) this.openPopover(doc, rec, field, [hit], field.getBoundingClientRect());
			else this.closePopover(rec);
			return;
		}
		let sel = doc.getSelection();
		if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
		let el = this.editableRoot(sel.anchorNode);
		let st = el && rec.states.get(el);
		if (!st) { this.closePopover(rec); return; }
		let hit = st.issues.find(x => {
			try {
				return x.range.comparePoint(sel.anchorNode, sel.anchorOffset) === 0
					&& !x.range.collapsed;
			}
			catch (e) { return false; }
		});
		if (hit) this.openPopover(doc, rec, el, [hit], hit.range.getBoundingClientRect());
		else this.closePopover(rec);
	},

	closePopover(rec) {
		if (rec.popover) {
			try { rec.popover.remove(); } catch (e) {}
			rec.popover = null;
		}
	},

	mk(doc, tag, cls, text) {
		let e = doc.createElement(tag);
		if (cls) e.className = cls;
		if (text != null) e.textContent = text;
		return e;
	},

	// Popup buttons must preserve editor focus and selection.
	btn(doc, label, cls, fn, title) {
		let b = this.mk(doc, "button", cls, label);
		b.type = "button";
		if (title) b.title = title;
		b.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
		b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
		return b;
	},

	openPopover(doc, rec, el, issues, rect) {
		this.closePopover(rec);
		let pop = this.mk(doc, "div", "annota-live-pop");
		pop.setAttribute("role", "dialog");
		let list = issues.length > 1;
		if (list) {
			pop.appendChild(this.mk(doc, "div", "annota-live-title",
				Annota.t("sp.badge", { n: issues.length })));
		}
		for (let x of issues) {
			let row = this.mk(doc, "div", "annota-live-row");
			let head = this.mk(doc, "div", "annota-live-head");
			head.appendChild(this.mk(doc, "span", "annota-live-kind annota-live-" + x.type,
				Annota.t(x.type === "grammar" ? "sp.grammar" : "sp.spelling")));
			if (list) head.appendChild(this.mk(doc, "span", "annota-live-word", x.word));
			row.appendChild(head);
			if (x.message) row.appendChild(this.mk(doc, "div", "annota-live-msg", x.message));
			let acts = this.mk(doc, "div", "annota-live-acts");
			for (let s of x.suggestions) {
				acts.appendChild(this.btn(doc, s, "annota-live-sug",
					() => this.replace(doc, rec, el, [{ issue: x, text: s }]),
					Annota.t("sp.replace", { w: s })));
			}
			if (!x.suggestions.length) acts.appendChild(this.mk(doc, "span", "annota-live-none", Annota.t("sp.nosug")));
			acts.appendChild(this.btn(doc, Annota.t("sp.ignore"), "annota-live-link", () => {
				this.ignore(doc, rec, x.word);
			}));
			if (x.type === "spelling") {
				acts.appendChild(this.btn(doc, Annota.t("sp.learn"), "annota-live-link", () => {
					AnnotaSpell.learn(x.word).catch(e => log("Spelling: " + e));
					this.ignore(doc, rec, x.word);
				}, Annota.t("sp.learn.title")));
			}
			row.appendChild(acts);
			pop.appendChild(row);
		}
		if (list && issues.some(x => x.suggestions.length)) {
			let all = this.btn(doc, Annota.t("sp.all"), "annota-live-all", () => {
				this.replace(doc, rec, el, issues.filter(x => x.suggestions.length)
					.map(x => ({ issue: x, text: x.suggestions[0] })));
			}, Annota.t("sp.all.title"));
			pop.appendChild(all);
		}
		(doc.body || doc.documentElement).appendChild(pop);
		rec.popover = pop;
		// Place the popup below the word, or above when needed, within bounds.
		let w = doc.defaultView;
		let pw = pop.offsetWidth, ph = pop.offsetHeight;
		let left = Math.max(6, Math.min(rect.left, w.innerWidth - pw - 6));
		let top = rect.bottom + 6;
		if (top + ph > w.innerHeight - 6) top = Math.max(6, rect.top - ph - 6);
		pop.style.left = left + "px";
		pop.style.top = top + "px";
	},

	ignore(doc, rec, word) {
		this.ignored.add(word);
		for (let st of rec.states.values()) st.issues = st.issues.filter(x => x.word !== word);
		this.closePopover(rec);
		this.refreshHighlights(doc, rec);
		if (rec.badgeFor) this.showBadge(doc, rec, rec.badgeFor);
	},

	// Apply replacements from last to first so earlier offsets remain
	// valid even if the editor restructures multiple DOM nodes.
	// Do not assume a stable text-node layout after a correction.
	replace(doc, rec, el, edits) {
		this.closePopover(rec);
		edits.sort((p, q) => q.issue.start - p.issue.start);
		if (this.isField(el)) return this.replaceInField(doc, el, edits);
		let done = 0;
		for (let { issue, text } of edits) {
			let snap = this.snapshot(el);
			if (snap.text.slice(issue.start, issue.start + issue.length) !== issue.word) continue;
			let r = this.toRange(doc, snap, issue.start, issue.start + issue.length);
			if (!r) continue;
			try {
				el.focus();
				let sel = doc.getSelection();
				sel.removeAllRanges();
				sel.addRange(r);
				if (doc.execCommand("insertText", false, text)) done++;
			}
			catch (e) { log("Live spelling replacement: " + e); }
		}
		if (done < edits.length) toast("ResearchAnnotator", Annota.t("sp.err.some", { n: edits.length - done }), "error");
		// Simulated input triggers the next live-check cycle.
	},

	// For a text control, select the word and insert text to preserve
	// undo and trigger the card's input/save path. If unsupported,
	// replace the value and dispatch input explicitly.
	replaceInField(doc, el, edits) {
		let done = 0;
		for (let { issue, text } of edits) {
			let a = issue.start, b = issue.start + issue.length;
			if (String(el.value).slice(a, b) !== issue.word) continue;
			try {
				el.focus();
				el.setSelectionRange(a, b);
				let ok = false;
				try { ok = doc.execCommand("insertText", false, text); }
				catch (e) { ok = false; }
				if (!ok || String(el.value).slice(a, a + text.length) !== text) {
					el.setRangeText(text, a, b, "end");
					el.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
				}
				done++;
			}
			catch (e) { log("Live spelling replacement: " + e); }
		}
		if (done < edits.length) toast("ResearchAnnotator", Annota.t("sp.err.some", { n: edits.length - done }), "error");
	},

	// ---- Badge: error count in the current field ----

	showBadge(doc, rec, el) {
		let st = rec.states.get(el);
		let n = st ? st.issues.length : 0;
		let focused = this.targetOf(doc.activeElement) === el;
		if (!n || !focused) {
			if (rec.badgeFor === el || !n) this.hideBadge(rec);
			return;
		}
		if (!rec.badge) {
			let b = this.mk(doc, "button", "annota-live-badge");
			b.type = "button";
			b.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
			b.addEventListener("click", (e) => {
				e.preventDefault();
				e.stopPropagation();
				let target = rec.badgeFor, s = target && rec.states.get(target);
				if (!s || !s.issues.length) return;
				if (rec.popover) { this.closePopover(rec); return; }
				this.openPopover(doc, rec, target, s.issues.slice(0, 12), b.getBoundingClientRect());
			});
			(doc.body || doc.documentElement).appendChild(b);
			rec.badge = b;
		}
		rec.badgeFor = el;
		rec.badge.textContent = Annota.t("sp.badge", { n });
		rec.badge.title = Annota.t("sp.badge.title");
		rec.badge.hidden = false;
		this.placeBadge(doc, rec, el);
	},

	placeBadge(doc, rec, el) {
		if (!rec.badge || rec.badge.hidden) return;
		try {
			let w = doc.defaultView, r = el.getBoundingClientRect();
			let bw = rec.badge.offsetWidth || 60, bh = rec.badge.offsetHeight || 20;
			let left = Math.min(r.right, w.innerWidth) - bw - 6;
			let top = Math.min(r.bottom, w.innerHeight) - bh - 6;
			rec.badge.style.left = Math.max(4, left) + "px";
			rec.badge.style.top = Math.max(4, top) + "px";
		}
		catch (e) {}
	},

	hideBadge(rec) {
		if (rec.badge) rec.badge.hidden = true;
		rec.badgeFor = null;
	},

	// Inject styles separately into each editor document.

	injectStyle(doc) {
		if (doc.getElementById("annota-spell-live-style")) return;
		let st = doc.createElement("style");
		st.id = "annota-spell-live-style";
		st.textContent = `
::highlight(annota-spelling) { text-decoration: underline wavy #e5484d; text-decoration-skip-ink: none;
  text-underline-offset: 2px; background-color: rgba(229, 72, 77, .10); }
::highlight(annota-grammar) { text-decoration: underline wavy #2ea8e5; text-decoration-skip-ink: none;
  text-underline-offset: 2px; background-color: rgba(46, 168, 229, .10); }
.annota-live-pop { position: fixed; z-index: 2147483647; display: flex; flex-direction: column; gap: 8px;
  max-width: 300px; max-height: 60vh; overflow-y: auto; box-sizing: border-box; padding: 9px 10px;
  border-radius: 8px; border: 1px solid rgba(128,128,128,.35); background: Canvas; color: CanvasText;
  box-shadow: 0 6px 18px rgba(0,0,0,.18); font: 12.5px/1.4 -apple-system, system-ui, sans-serif; }
.annota-live-title { font-weight: 600; font-size: 12px; }
.annota-live-row { display: flex; flex-direction: column; gap: 5px; }
.annota-live-row + .annota-live-row { padding-top: 8px; border-top: 1px solid rgba(128,128,128,.25); }
.annota-live-head { display: flex; align-items: center; gap: 6px; }
.annota-live-kind { padding: 0 6px; border-radius: 4px; font-size: 10.5px; font-weight: 600; }
.annota-live-spelling { background: rgba(229,72,77,.12); color: #e5484d; }
.annota-live-grammar { background: rgba(46,168,229,.12); color: #1f8bc4; }
.annota-live-word { text-decoration: underline wavy #e5484d; text-underline-offset: 2px; }
.annota-live-msg { font-size: 11.5px; opacity: .75; }
.annota-live-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; }
.annota-live-sug { appearance: none; margin: 0; padding: 2px 9px; border-radius: 6px; cursor: pointer;
  border: 1px solid rgba(128,128,128,.4); background: transparent; color: inherit; font: inherit; }
.annota-live-sug:hover { border-color: #22c55e; background: rgba(34,197,94,.10); }
.annota-live-none { font-size: 11.5px; opacity: .55; }
.annota-live-link, .annota-live-all { appearance: none; margin: 0; padding: 0; border: none; background: none;
  color: inherit; opacity: .7; font: inherit; font-size: 11.5px; cursor: pointer; }
.annota-live-link:hover { opacity: 1; text-decoration: underline; }
.annota-live-all { align-self: flex-start; opacity: 1; color: #2e7cf6; }
.annota-live-badge { position: fixed; z-index: 2147483646; margin: 0; padding: 1px 8px; border-radius: 999px;
  border: 1px solid rgba(229,72,77,.45); background: Canvas; color: #e5484d; cursor: pointer;
  font: 600 11px/1.6 -apple-system, system-ui, sans-serif; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.annota-live-badge[hidden] { display: none; }
`;
		(doc.head || doc.documentElement).appendChild(st);
	}
};
