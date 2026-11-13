/* eslint-disable no-undef */
// Annota — extension Zotero 7 → 10
// À la création d'un surlignage, exécute un prompt configurable sur le texte
// surligné et place la sortie du modèle dans le commentaire de l'annotation.

var Annota;

const PREF_BRANCH = "annota.";

// Commentaire temporaire affiché pendant l'appel réseau (écrit puis remplacé).
const PLACEHOLDER = "⏳ Generating…";

function getPref(key, fallback) {
	let val = Zotero.Prefs.get(PREF_BRANCH + key);
	return (val === undefined || val === null) ? fallback : val;
}

function log(msg) {
	Zotero.debug("[Annota] " + msg);
}

function toast(title, body, type = "default") {
	try {
		let pw = new Zotero.ProgressWindow({ closeOnClick: true });
		pw.changeHeadline(title);
		if (body) {
			let icon = type === "error"
				? "chrome://zotero/skin/cross.png"
				: "chrome://zotero/skin/tick.png";
			pw.addLines([body], [icon]);
		}
		pw.show();
		pw.startCloseTimer(type === "error" ? 6000 : 2500);
	}
	catch (e) {
		log("toast failed: " + e);
	}
}

Annota = {
	id: null,
	prefPaneID: null,
	version: null,
	rootURI: null,
	notifierID: null,
	inProgress: new Set(),
    _pendingAnnotationConversions: new Map(),

	// Il n'existe volontairement AUCUN prompt par défaut : chaque couleur de
	// surlignage a le sien, et une couleur sans prompt n'est pas traitée du tout.
	// C'est ce qui permet de n'activer la génération que sur certaines couleurs.
	//
	// Variables substituées à l'exécution :
	//   {{text}}        texte surligné (voir buildMessages pour le mode avancé)
	//   {{title}}       titre du document source
	//   {{authors}}     auteurs du document source (noms, séparés par des virgules)
	//   {{year}}        année du document source
	//   {{abstract}}    résumé du document source (tronqué selon les préférences)
	//   {{publication}} revue / ouvrage / actes
	//   {{page}}        page du passage surligné
	//   {{maxWords}}    réglage « longueur max »
	//   {{language}}    réglage « langue de sortie »
	// Des exemples de prompts sont fournis dans PROMPT-EXAMPLES.txt.

	// Palette de secours, si Zotero.Annotations.COLORS était indisponible.
	// Doit rester alignée sur chrome/content/zotero/xpcom/annotations.js.
	FALLBACK_COLORS: [
		{ hex: "#ffd400", name: "Yellow" },
		{ hex: "#ff6666", name: "Red" },
		{ hex: "#5fb236", name: "Green" },
		{ hex: "#2ea8e5", name: "Blue" },
		{ hex: "#a28ae5", name: "Purple" },
		{ hex: "#e56eee", name: "Magenta" },
		{ hex: "#f19837", name: "Orange" },
		{ hex: "#aaaaaa", name: "Gray" }
	],

	// Palette de surlignage lue directement depuis Zotero : elle reste ainsi
	// identique à celle du sélecteur de couleurs du lecteur, même si Zotero
	// la fait évoluer. Format source : [clé l10n, hex].
	get COLORS() {
		try {
			let raw = Zotero.Annotations && Zotero.Annotations.COLORS;
			if (Array.isArray(raw) && raw.length) {
				return raw.map(pair => ({
					hex: String(pair[1]).toLowerCase(),
					name: this.colorLabel(String(pair[0]).replace(/^general-/, ""))
				}));
			}
		}
		catch (e) {
			log("COLORS: lecture de la palette Zotero impossible, repli : " + e);
		}
		return this.FALLBACK_COLORS.map(c => ({ hex: c.hex, name: this.colorLabel(c.name) }));
	},

	// Nom d'une teinte dans la langue de l'interface (« yellow » → « Jaune »).
	colorLabel(raw) {
		let base = String(raw || "").toLowerCase();
		let key = "color." + base;
		let tr = this.t(key);
		return tr !== key ? tr : base.replace(/^./, m => m.toUpperCase());
	},

	// Prompts par couleur : { "#ff6666": "…", … }. Vide = utiliser le prompt par défaut.
	getColorPrompts() {
		try {
			let raw = String(getPref("colorPrompts", "") || "").trim();
			if (!raw) return {};
			let obj = JSON.parse(raw);
			return (obj && typeof obj === "object") ? obj : {};
		}
		catch (e) {
			log("colorPrompts illisible (JSON invalide), ignoré : " + e);
			return {};
		}
	},

	// Les zones encadrées (images, tableaux, parties de page) ont leurs propres
	// réglages par couleur, rangés dans le même JSON sous « image:#hex ».
	// Toute fonction qui reçoit une « couleur » accepte aussi cette clé.
	colorKey(color, type) {
		let hex = String(color || "").toLowerCase();
		return type === "image" ? "image:" + hex : hex;
	},

	isImageKey(color) {
		return String(color || "").startsWith("image:");
	},

	keyForItem(item) {
		return this.colorKey(item && item.annotationColor, item && item.annotationType);
	},

	hasImageEntries() {
		return Object.keys(this.getColorPrompts()).some(k => this.isImageKey(k) && this.getColorEntry(k));
	},

	// Réglage d'une couleur, normalisé : { prompt, trigger, template } ou null.
	// Rétrocompat : une valeur chaîne = { prompt, trigger: "auto", template: "" }.
	// trigger  "auto"   = génère à la création du surlignage
	//          "manual" = uniquement via le menu contextuel
	// template = gabarit du commentaire final ; vide = la réponse de l'IA seule.
	// Une couleur est active si elle a un prompt OU un gabarit (un gabarit sans
	// {{ai}} produit un commentaire entièrement déterministe, sans appel IA).
	getColorEntry(color) {
		if (!color) return null;
		let raw = this.getColorPrompts()[String(color).toLowerCase()];
		if (!raw) return null;
		if (typeof raw === "string") {
			return raw.trim()
				? { prompt: raw, trigger: "auto", template: "", fields: "", label: "" }
				: null;
		}
		if (typeof raw !== "object") return null;
		let prompt = String(raw.prompt || "");
		let template = String(raw.template || "");
		let fields = String(raw.fields || "");
		// Un libellé seul n'active pas une couleur : il nomme une configuration,
		// il n'en tient pas lieu. Sinon une couleur sans champ ni prompt
		// passerait pour configurée et ne produirait rien.
		if (!prompt.trim() && !template.trim() && !fields.trim()) return null;
		return {
			prompt,
			template,
			fields,
			label: String(raw.label || "").trim(),
			trigger: raw.trigger === "manual" ? "manual" : "auto"
		};
	},

	// ---- Champs personnalisés par couleur ----
	//
	// Syntaxe, une ligne par champ :  nom | Libellé | type | options
	//   type ∈ text (défaut) | textarea | check | select
	//   options : pour « select », les choix séparés par des virgules.
	// Chaque champ devient une variable {{nom}} dans le prompt ET le gabarit.
	// Les noms réservés (variables intégrées) sont ignorés pour éviter qu'un
	// champ n'écrase silencieusement {{text}}, {{comment}}, etc.
	RESERVED_VARS: [
		"text", "comment", "title", "authors", "year", "abstract",
		"publication", "page", "references", "maxWords", "language", "ai"
	],

	// Mises en forme reconnues, appliquées à la valeur du champ dans le
	// commentaire final. « plain » laisse le texte tel quel.
	FORMATS: {
		plain: v => v,
		bold: v => "<b>" + v + "</b>",
		italic: v => "<i>" + v + "</i>",
		bolditalic: v => "<b><i>" + v + "</i></b>",
		underline: v => "<u>" + v + "</u>"
	},

	_normFormat(w) {
		let k = String(w || "").toLowerCase().replace(/[\s_-]/g, "");
		// Une colonne vide n'est PAS un format : sans cela « plain » serait
		// retenu et la colonne précédente ne serait jamais examinée.
		if (!k) return null;
		if (k === "gras") k = "bold";
		if (k === "italique") k = "italic";
		if (k === "normal") k = "plain";
		if (k === "souligne" || k === "souligné") k = "underline";
		return Object.prototype.hasOwnProperty.call(this.FORMATS, k) ? k : null;
	},

	// À quoi sert chaque nom réservé : le dire vaut mieux que « nom réservé »,
	// qui n'apprend rien à qui vient de perdre un champ.
	RESERVED_HINTS: {
		text: "the highlighted passage",
		comment: "the comment already in the annotation",
		title: "the document title",
		authors: "the document authors",
		year: "the document year",
		abstract: "the document abstract",
		publication: "the journal, book or proceedings",
		page: "the page of the passage",
		references: "works cited inside the passage",
		maxWords: "your length setting",
		language: "your language setting",
		ai: "the model's reply"
	},

	// Un nom de repli toujours valide et prévisible : « page » → « myPage ».
	suggestName(name) {
		return "my" + String(name).replace(/^./, m => m.toUpperCase());
	},

	// Relit un schéma de champs et signale ce qui sera ignoré ou mal compris.
	// parseFieldSchema, lui, se tait et continue : c'est le bon comportement à
	// l'exécution, mais dans les réglages il faut le dire. Renvoie une liste de
	// { line, level, message } — « error » = ce que vous écrivez ne sera pas
	// appliqué, « warn » = appliqué autrement que prévu.
	validateFieldSchema(raw) {
		let out = [], seen = new Map();
		let lines = String(raw || "").split("\n");
		const TYPES = ["text", "textarea", "check", "select", "ai"];

		for (let i = 0; i < lines.length; i++) {
			let line = lines[i].trim();
			if (!line || line.startsWith("#")) continue;
			let n = i + 1;
			let parts = line.split("|").map(x => x.trim());
			let rawName = parts[0] || "";
			let name = rawName.replace(/[^\w]/g, "");

			if (!name) {
				out.push({ line: n, level: "error",
					message: this.t("lint.noname") });
				continue;
			}
			if (name !== rawName) {
				out.push({ line: n, level: "warn",
					message: this.t("lint.renamed", { raw: rawName, name }) });
			}
			if (this.RESERVED_VARS.includes(name)) {
				out.push({ line: n, level: "error",
					message: this.t("lint.reserved", { name,
						hint: this.t(this.RESERVED_HINTS[name] ? "hint." + name : "hint.reserved"),
						suggest: this.suggestName(name) }) });
				continue;
			}
			if (seen.has(name)) {
				out.push({ line: n, level: "error",
					message: this.t("lint.dup", { name, line: seen.get(name) }) });
			}
			else seen.set(name, n);

			let type = (parts[2] || "").toLowerCase();
			if (parts[2] && !TYPES.includes(type)) {
				out.push({ line: n, level: "warn",
					message: this.t("lint.type", { type: parts[2] }) });
			}

			// Reproduit la lecture des colonnes 4 et 5 de parseFieldSchema.
			let col4 = parts[3] || "", col5 = parts[4] || "";
			let format = this._normFormat(col5);
			let extra = col4;
			if (!format) {
				let asFormat = this._normFormat(col4);
				if (asFormat && type !== "ai" && !(type === "select" && col4.includes(","))) {
					extra = "";
				}
			}
			if (col5 && !format) {
				out.push({ line: n, level: "warn",
					message: this.t("lint.format", { fmt: col5 }) });
			}
			if (type === "select" && !extra.split(",").map(x => x.trim()).filter(Boolean).length) {
				out.push({ line: n, level: "warn",
					message: this.t("lint.select") });
			}
			if (type === "ai" && !extra.trim()) {
				out.push({ line: n, level: "error",
					message: this.t("lint.ai") });
			}
		}
		return out;
	},

	// Variables employées dans un prompt ou une disposition qui ne correspondent
	// ni à un champ déclaré ni à une variable intégrée : presque toujours une
	// faute de frappe, et elles se substituent en silence par du vide.
	validateVariables(where, tpl, schema) {
		let known = this.RESERVED_VARS.concat(schema.map(f => f.name));
		let seen = new Set(), out = [];
		String(tpl || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (m, name) => {
			if (!known.includes(name) && !seen.has(name)) {
				seen.add(name);
				out.push({ line: 0, level: "warn",
					message: this.t("lint.unknownvar", { where, var: "{{" + name + "}}" }) });
			}
			return m;
		});
		return out;
	},

	// Contrôle complet d'une couleur, pour le panneau de réglages.
	lintColorEntry(entry) {
		entry = entry || {};
		let out = this.validateFieldSchema(entry.fields);
		let schema = this.parseFieldSchema(entry.fields);
		out = out.concat(this.validateVariables(this.t("lint.where.prompt"), entry.prompt, schema));
		out = out.concat(this.validateVariables(this.t("lint.where.layout"), entry.template, schema));

		// {{ai}} n'a de sens que dans la disposition.
		if (/\{\{\s*ai\s*\}\}/.test(String(entry.prompt || ""))) {
			out.push({ line: 0, level: "warn",
				message: this.t("lint.aiprompt") });
		}
		return out;
	},

	// Syntaxe :  nom | Libellé | type | options | format
	// Le format peut occuper la 4e OU la 5e colonne : s'il est reconnu en 4e,
	// c'est un format, sinon ce sont les options (choix d'un « select », ou
	// consigne d'un champ « ai »). Cela garde la compatibilité ascendante.
	parseFieldSchema(raw) {
		let out = [];
		for (let line of String(raw || "").split("\n")) {
			line = line.trim();
			if (!line || line.startsWith("#")) continue;
			let parts = line.split("|").map(x => x.trim());
			let name = (parts[0] || "").replace(/[^\w]/g, "");
			if (!name) continue;
			if (this.RESERVED_VARS.includes(name)) {
				log("champ « " + name + " » ignoré : nom réservé");
				continue;
			}
			let type = (parts[2] || "text").toLowerCase();
			if (!["text", "textarea", "check", "select", "ai"].includes(type)) type = "text";

			let col4 = parts[3] || "", col5 = parts[4] || "";
			let format = this._normFormat(col5);
			let extra = col4;
			if (!format) {
				// Pas de 5e colonne : la 4e est-elle un format connu ?
				let asFormat = this._normFormat(col4);
				// Un champ « ai » garde sa consigne en 4e colonne.
				if (asFormat && type !== "ai" && !(type === "select" && col4.includes(","))) {
					format = asFormat;
					extra = "";
				}
			}

			out.push({
				name,
				label: parts[1] || name,
				type,
				format: format || "plain",
				// « select » : liste de choix. « ai » : consigne envoyée au modèle.
				options: type === "select"
					? extra.split(",").map(x => x.trim()).filter(Boolean) : [],
				prompt: type === "ai" ? extra : ""
			});
		}
		return out;
	},

	// Disposition par défaut quand une couleur a des champs mais aucun gabarit :
	// une ligne par champ, dans l'ordre déclaré, le balisage de mise en forme
	// étant intégré au gabarit lui-même. Ainsi {{nom}} reste la valeur brute et
	// il n'y a jamais de double balisage si l'on écrit sa propre disposition.
	defaultLayoutFromFields(schema) {
		return schema.map(f => {
			let fn = this.FORMATS[f.format] || this.FORMATS.plain;
			return fn("{{" + f.name + "}}");
		}).join("\n");
	},

	// Gabarit effectif d'une couleur : celui saisi, sinon celui déduit des champs.
	effectiveTemplate(entry) {
		let tpl = String((entry && entry.template) || "").trim();
		if (tpl) return tpl;
		let schema = this.parseFieldSchema(entry && entry.fields);
		return schema.length ? this.defaultLayoutFromFields(schema) : "";
	},

	// Nom que vous avez donné à cette couleur (« Objection », « Méthode »…).
	// Le nom Zotero de la teinte reste utilisé partout ailleurs : il désigne la
	// pastille à cliquer, alors que le libellé désigne ce qu'on est en train de
	// faire.
	labelForColor(color) {
		let entry = this.getColorEntry(color);
		return entry ? (entry.label || "") : "";
	},

	fieldsForColor(color) {
		let entry = this.getColorEntry(color);
		return entry ? this.parseFieldSchema(entry.fields) : [];
	},

	// Faut-il une réponse d'IA pour LE COMMENTAIRE ENTIER ?
	// Aucun gabarit ni champ → oui (la réponse EST le commentaire).
	// Gabarit contenant {{ai}} → oui. Sinon → non : les champs suffisent.
	entryNeedsAI(entry) {
		if (!entry) return false;
		let tpl = this.effectiveTemplate(entry);
		if (!tpl) return true;
		return /\{\{\s*ai\s*\}\}/.test(tpl);
	},

	// Un champ de type « ai » réclame le modèle même si le commentaire, lui,
	// est monté à partir des champs saisis.
	entryHasAIFields(entry) {
		return this.parseFieldSchema(entry && entry.fields).some(f => f.type === "ai");
	},

	// Le prompt de la couleur sert-il à RENSEIGNER LES CHAMPS ?
	// C'est le cas dès qu'une couleur a des champs et un prompt sans que la
	// disposition réclame {{ai}} : la réponse du modèle n'est alors pas un
	// commentaire libre, elle est contrainte aux champs déclarés.
	entryFillsFields(entry) {
		if (!entry || !String(entry.prompt || "").trim()) return false;
		if (this.entryNeedsAI(entry)) return false;   // la réponse EST le commentaire
		return this.parseFieldSchema(entry.fields).some(f => f.type !== "ai");
	},

	// Champs que le modèle doit renseigner : ceux restés vides. Les champs
	// « ai » ont leur propre consigne et sont traités à part.
	fieldsToFill(schema, values) {
		return schema.filter(f => f.type !== "ai"
			&& !String((values && values[f.name]) || "").trim());
	},

	// Le fournisseur est-il sollicité, à un titre ou à un autre ?
	entryUsesProvider(entry) {
		return this.entryNeedsAI(entry) || this.entryHasAIFields(entry)
			|| this.entryFillsFields(entry);
	},

	// Sera-t-il sollicité POUR CETTE annotation ? entryUsesProvider décrit la
	// couleur en général ; ici on tient compte de ce qui a déjà été saisi, car
	// un formulaire entièrement rempli ne laisse rien à demander au modèle.
	willCallProvider(entry, values) {
		if (!entry) return false;
		if (this.entryNeedsAI(entry)) return true;
		let schema = this.parseFieldSchema(entry.fields);
		if (schema.some(f => f.type === "ai" && f.prompt.trim()
				&& !String((values && values[f.name]) || "").trim())) return true;
		return this.entryFillsFields(entry)
			&& this.fieldsToFill(schema, values).length > 0;
	},

	// Prompt configuré pour cette couleur, ou "" si la couleur n'en a pas.
	getPromptForColor(color) {
		let entry = this.getColorEntry(color);
		return entry ? entry.prompt : "";
	},

	// Fournisseur actif : "openai" (Mistral ou tout endpoint compatible),
	// "ollama" (local), "cli" (Claude Code local), "apple" (Apple Intelligence).
	// Fournisseurs reconnus. Un appel peut en imposer un (la discussion a son
	// propre réglage), sinon c'est celui des annotations qui s'applique.
	PROVIDERS: ["openai", "ollama", "cli", "apple"],

	provider(override) {
		if (override && this.PROVIDERS.includes(override)) return override;
		let p = String(getPref("provider", "")).trim();
		if (p === "openai" || p === "ollama" || p === "cli" || p === "apple") return p;
		// Rétrocompat avec l'ancienne case à cocher.
		return getPref("useClaudeCLI", false) ? "cli" : "openai";
	},

	// Réglages du chemin compatible OpenAI (Mistral distant ou Ollama local).
	chatConfig(override) {
		if (this.provider(override) === "ollama") {
			return {
				endpoint: String(getPref("ollamaEndpoint",
					"http://localhost:11434/v1/chat/completions")).trim(),
				model: String(getPref("ollamaModel", "llama3.1")).trim() || "llama3.1",
				apiKey: "",          // Ollama n'exige aucune clé
				requiresKey: false
			};
		}
		return {
			endpoint: String(getPref("endpoint",
				"https://api.mistral.ai/v1/chat/completions")).trim(),
			model: String(getPref("model", "mistral-large-latest")).trim()
				|| "mistral-large-latest",
			apiKey: String(getPref("apiKey", "")).trim(),
			requiresKey: true
		};
	},

	// Vérifie que le fournisseur choisi est prêt ; renvoie un message ou null.
	providerReadyError(override) {
		let p = this.provider(override);
		if (p === "apple") {
			// Disponibilité réellement vérifiée au premier appel (compilation).
			return null;
		}
		if (p === "cli") {
			return String(getPref("cliPath", "claude")).trim()
				? null : this.t("err.cli.path");
		}
		let cfg = this.chatConfig(p);
		if (!cfg.endpoint) {
			return this.t(p === "ollama" ? "err.endpoint.ollama" : "err.endpoint");
		}
		if (cfg.requiresKey && !cfg.apiKey) {
			return this.t("err.key");
		}
		return null;
	},

	// ---- Langue de l'interface ----
	// uiLanguage : "auto" (langue de Zotero), "en" ou "fr".
	lang() {
		let p = String(getPref("uiLanguage", "auto") || "auto");
		if (p === "en" || p === "fr") return p;
		let loc = "";
		try { loc = String(Zotero.locale || ""); } catch (e) {}
		return /^fr/i.test(loc) ? "fr" : "en";
	},

	get i18n() {
		return (typeof AnnotaI18n !== "undefined" && AnnotaI18n) || null;
	},

	// Texte traduit ; {nom} est remplacé par vars.nom. Repli : anglais, puis
	// la clé elle-même (visible, donc repérable).
	t(key, vars) {
		let d = this.i18n || {};
		let s = d[this.lang()] && d[this.lang()][key];
		if (s == null) s = d.en && d.en[key];
		if (s == null) s = key;
		if (!vars) return s;
		return String(s).replace(/\{(\w+)\}/g, (m, k) =>
			Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m);
	},

	// Langue changée : menus et panneau de discussion sont reconstruits.
	relocalize() {
		for (let win of Zotero.getMainWindows()) {
			try {
				this.removeFromWindow(win);
				this.addToWindow(win);
				if (AnnotaChat) AnnotaChat.relocalizeWindow(win);
			}
			catch (e) { log("relocalize: " + e); }
		}
	},

	init({ id, version, rootURI }) {
		this.id = id;
		this.version = version;
		this.rootURI = rootURI;
	},

	registerNotifier() {
		this.notifierID = Zotero.Notifier.registerObserver(
			this.notifierCallback,
			["item"],
			"annota"
		);
		log("Notifier registered (id=" + this.notifierID + ")");
	},

	unregisterNotifier() {
		if (this.notifierID) {
			Zotero.Notifier.unregisterObserver(this.notifierID);
			this.notifierID = null;
		}
	},

	notifierCallback: {
    notify(event, type, ids, extraData) {
        log(
            "[RA NOTIFIER] event=" + event
            + " type=" + type
            + " ids=" + JSON.stringify(ids)
            + " extraData=" + JSON.stringify(extraData)
        );

        if (type !== "item") return;

        if (!["add", "modify", "delete"].includes(event)) return;

        const notifiedAt = Date.now();

        for (const id of ids) {
            Annota._handlePaperNoteNotification(
                event,
                id,
                extraData,
                notifiedAt
            ).catch(e => {
                log(
                    "Paper-note notification failed ("
                    + event + ", " + id + "): " + e
                );
            });
        }
    }
},

async _handlePaperNoteNotification(event, id, extraData, notifiedAt) {
    // Deleted items are no longer available through Zotero.Items.
    // Zotero supplies their previous data through extraData.
    if (event === "delete") {
        const deleted = extraData?.[id];
        const old = deleted?.old || deleted;

        const key = String(old?.key || deleted?.key || "");
        const libraryID = Number(
            old?.libraryID ?? deleted?.libraryID
        );

        if (!key || !Number.isInteger(libraryID)) {
            log(
                "Cannot identify deleted annotation from notifier data: "
                + id
            );
            return;
        }

        const annotationKey = `${libraryID}:${key}`;

        await this._removePaperResearchNoteEntry(
            libraryID,
            annotationKey
        );

        await this._updateResearchMetadata(libraryID, metadata => {
            if (!metadata.annotations[annotationKey]) {
                return false;
            }

            delete metadata.annotations[annotationKey];
            return true;
        });

        log("Deleted annotation removed from paper note: " + annotationKey);
        return;
    }

    const item = await Zotero.Items.getAsync(id);

    if (!item) return;

    if (!item.isAnnotation?.()) return;

    // Ignore the annotation modification caused by a note edit.
    const annotationKey = `${item.libraryID}:${item.key}`;

    if (this._paperNoteReverseSyncKeys?.has(annotationKey)) {
        this._paperNoteReverseSyncKeys.delete(annotationKey);
        return;
    }

    // Any modification to an annotation should update its paper note.
    // This is deliberately independent of AI configuration.
    if (event === "modify") {
        this._schedulePaperResearchNoteSync(item);
        return;
    }

    // New annotation.
    const isConversion = await this.handleConvertedAnnotation(id);

    if (isConversion) {
        const fresh = await Zotero.Items.getAsync(id);

        if (fresh?.isAnnotation?.()) {
            await this._syncPaperResearchNote(fresh);
        }

        return;
    }

    // Capture any research fields entered in the selection popup.
    try {
        await this.handleResearchMetadata(id);
    }
    catch (e) {
        log("handleResearchMetadata: " + e);
    }

    // Always create/update the paper note, even if AI is disabled,
    // no color prompt exists, or the annotation already has a comment.
    const fresh = await Zotero.Items.getAsync(id);

    if (fresh?.isAnnotation?.()) {
        await this._syncPaperResearchNote(fresh);
    }

    // AI comment generation remains optional and independent.
    await this.handleItem(id, notifiedAt);
},

async _syncPaperResearchNoteFromNote(note) {
    const content = note.getNote() || "";
    const doc = new DOMParser().parseFromString(content, "text/html");
    const paragraphs = Array.from(doc.querySelectorAll("p"));
    const entries = [];

    for (let i = 0; i < paragraphs.length; i++) {
        const markerText = paragraphs[i].textContent.trim();

        if (!markerText.startsWith("RA_ENTRY_START:")) continue;

        const annotationKey = markerText.substring(
            "RA_ENTRY_START:".length
        );

        const endMarker = `RA_ENTRY_END:${annotationKey}`;
        const container = paragraphs[i].closest("div");

        if (!container) continue;

        const containerText = container.textContent || "";
        if (!containerText.includes(endMarker)) continue;

        const separator = annotationKey.indexOf(":");
        if (separator < 1) continue;

        const libraryID = Number(annotationKey.substring(0, separator));
        const itemKey = annotationKey.substring(separator + 1);

        if (!Number.isInteger(libraryID) || !itemKey) continue;

        const heading = container.querySelector("h2");
        if (!heading) continue;

        const mark = heading.querySelector("mark");
        const underlineElement = heading.querySelector("u");
        const spans = Array.from(heading.querySelectorAll("span"));

        // Support both the current <u> format and older border-bottom spans.
        const legacyUnderline = spans.find(span =>
            /border-bottom/i.test(span.getAttribute("style") || "")
        );

        const underline = underlineElement || legacyUnderline;

        let annotationText = "";
        let annotationType = "";
        let annotationColor = "";

        if (mark) {
            annotationText = mark.textContent || "";
            annotationType = "highlight";
            annotationColor =
                mark.style.backgroundColor
                || mark.getAttribute("style")
                || "";
        }
        else if (underline) {
            annotationText = underline.textContent || "";
            annotationType = "underline";
            annotationColor =
                underline.style.textDecorationColor
                || underline.style.borderBottomColor
                || underline.getAttribute("style")
                || "";
        }
        else {
            annotationText = heading.textContent
                .replace(/^\s*\d+\.\s*/, "")
                .trim();
        }

        // Convert CSS RGB or hexadecimal colors into Zotero's #RRGGBB.
        const colorMatch = String(annotationColor).match(
            /#([0-9a-f]{6})\b|rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i
        );

        if (colorMatch) {
            if (colorMatch[1]) {
                annotationColor = "#" + colorMatch[1];
            }
            else {
                annotationColor = "#" + colorMatch.slice(2, 5)
                    .map(value => Number(value).toString(16).padStart(2, "0"))
                    .join("");
            }
        }
        else {
            annotationColor = "";
        }

        const getField = label => {
            const paragraph = Array.from(
                container.querySelectorAll("p")
            ).find(p =>
                p.textContent.trim().toLowerCase().startsWith(
                    label.toLowerCase() + ":"
                )
            );

            if (!paragraph) return "";

            const text = paragraph.textContent.trim();
            const colonIndex = text.indexOf(":");

            return colonIndex >= 0
                ? text.slice(colonIndex + 1).trim()
                : "";
        };

        const splitList = value => value
            ? value.split(",").map(part => part.trim()).filter(Boolean)
            : [];

        entries.push({
            annotationKey,
            libraryID,
            itemKey,
            annotationText,
            annotationType,
            annotationColor,
            comment: getField("Research comment"),
            themes: splitList(getField("Themes")),
            experiments: splitList(getField("Experiments"))
        });
    }

    if (!entries.length) {
        log("No editable annotation entries found in research note: " + note.key);
        return;
    }

    const libraryID = note.libraryID;
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("resultLevel", "annotation");

    const ids = await search.search();
    const annotations = new Map();

    for (const id of ids) {
        const item = await Zotero.Items.getAsync(id);
        if (item?.isAnnotation?.()) {
            annotations.set(
                `${item.libraryID}:${item.key}`,
                item
            );
        }
    }

    if (!this._paperNoteReverseSyncKeys) {
        this._paperNoteReverseSyncKeys = new Map();
    }

    let updatedAnnotations = 0;

    for (const entry of entries) {
        const item = annotations.get(entry.annotationKey);
        if (!item) continue;

        let changed = false;

        if (
            item.annotationText !== entry.annotationText
            && entry.annotationText
        ) {
            item.annotationText = entry.annotationText;
            changed = true;
        }

        if (
            entry.annotationType
            && item.annotationType !== entry.annotationType
        ) {
            item.annotationType = entry.annotationType;
            changed = true;
        }

        if (
            entry.annotationColor
            && item.annotationColor !== entry.annotationColor
        ) {
            item.annotationColor = entry.annotationColor;
            changed = true;
        }

        if (item.annotationComment !== entry.comment) {
            item.annotationComment = entry.comment;
            changed = true;
        }

        if (changed) {
            this._paperNoteReverseSyncKeys.set(
                entry.annotationKey,
                Date.now()
            );

            await item.saveTx();
            updatedAnnotations++;
        }
    }

    await this._updateResearchMetadata(libraryID, metadata => {
        let changed = false;

        for (const entry of entries) {
            const saved = metadata.annotations[entry.annotationKey] || {};

            const oldThemes = JSON.stringify(saved.themes || []);
            const oldExperiments = JSON.stringify(saved.experiments || []);

            if (
                oldThemes !== JSON.stringify(entry.themes)
                || oldExperiments !== JSON.stringify(entry.experiments)
            ) {
                metadata.annotations[entry.annotationKey] = {
                    ...saved,
                    themes: entry.themes,
                    experiments: entry.experiments
                };

                changed = true;
            }
        }

        return changed;
    });

    // Rebuild from the updated PDF annotations and metadata.
    const firstItem = annotations.get(entries[0].annotationKey);

    if (firstItem) {
        await this._syncPaperResearchNote(firstItem);
    }

    log(
        "Reverse note synchronization completed. Updated annotations: "
        + updatedAnnotations
        + " | Entries: "
        + entries.length
    );
},
targetTypes() {
		let types = ["highlight"];
		if (getPref("alsoUnderline", false)) types.push("underline");
		if (this.hasImageEntries()) types.push("image");
		return types;
	},
	// ResearchAnnotator metadata storage.
// One managed Zotero note per library.

RESEARCH_METADATA_TITLE: "ResearchAnnotator Metadata",
RESEARCH_METADATA_MARKER: "research-annotator-metadata-v1",

async _findResearchMetadataNote(libraryID) {
    const search = new Zotero.Search();
    search.libraryID = libraryID;

    search.addCondition("itemType", "is", "note");

    const ids = await search.search();

    for (const id of ids) {
        const note = Zotero.Items.get(id);

        if (!note || !note.isNote?.()) continue;

        const content = note.getNote();

        if (content.includes(this.RESEARCH_METADATA_MARKER)) {
            return note;
        }
    }

    return null;
},
async _getOrCreatePaperResearchNote(annotation) {
    if (!annotation?.parentID) {
        throw new Error("Annotation has no parent attachment.");
    }

    // Find the PDF attachment.
    const attachment = await Zotero.Items.getAsync(
        annotation.parentID
    );

    if (!attachment || !attachment.isAttachment?.()) {
        throw new Error("Could not find annotation's PDF attachment.");
    }

    // Resolve the regular bibliographic item, if one exists.
    // Standalone PDF attachments must not be used as note parents.
    const paper = attachment.parentID
        ? await Zotero.Items.getAsync(attachment.parentID)
        : null;

    if (
        attachment.parentID &&
        (!paper || !paper.isRegularItem?.())
    ) {
        throw new Error(
            "The PDF attachment's parent is not a regular bibliographic item."
        );
    }

    const noteParent = paper;
    const noteIdentity = attachment;
    const libraryID = annotation.libraryID;
    const attachmentKey = attachment.key;

    const marker =
        "research-annotator-pdf-note-v1:" + attachmentKey;

    // Search existing Zotero notes for this paper's research note.
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("itemType", "is", "note");

    const ids = await search.search();

    for (const id of ids) {
        const existing = Zotero.Items.get(id);

        if (!existing || !existing.isNote?.()) continue;

        const content = existing.getNote() || "";

        if (content.includes(marker)) {
            return {
                note: existing,
                paper,
                marker
            };
        }
    }

    // Create one research note for this paper.
    const note = new Zotero.Item("note");
    note.libraryID = libraryID;

    if (noteParent) {
        note.parentID = noteParent.id;
    }

    const title =
        noteIdentity.getField("filename")
        || noteIdentity.getField("title")
        || "Standalone PDF";

    const escapedTitle = title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    note.setNote(`
        <h1>Research Notes — ${escapedTitle}</h1>
        <p style="margin:0;padding:0;font-size:1px;line-height:1px;color:#888;"><span>${marker}</span></p>

        <hr>
    `);

    await note.saveTx();

    log(
        "Created paper research note: "
        + title
        + " | Key: "
        + note.key
    );

    return {
        note,
        paper,
        marker
    };
},
async _getResearchNotes(libraryID) {
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("itemType", "is", "note");

    const ids = await search.search();
    const researchNotes = [];

    const marker = "research-annotator-research-note-v1";

    for (const id of ids) {
        const note = Zotero.Items.get(id);

        if (!note || !note.isNote?.()) continue;

        const content = note.getNote() || "";

        // Only include notes created by ResearchAnnotator.
        if (!content.includes(marker)) continue;

        // Extract the note title from its first H1 element.
        const titleMatch = content.match(/<h1[^>]*>(.*?)<\/h1>/i);

        let title = titleMatch
            ? titleMatch[1].replace(/<[^>]*>/g, "").trim()
            : "Untitled research note";

        researchNotes.push({
            key: note.key,
            title: title
        });
    }

    researchNotes.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, {
            sensitivity: "base"
        })
    );

    return researchNotes;
},

async _createResearchNote(libraryID, title) {
    title = (title || "").trim();

    if (!title) {
        throw new Error("Research note title cannot be empty.");
    }

    // Prevent duplicate research-note titles (case-insensitive).
    const existingNotes = await this._getResearchNotes(libraryID);

    const existing = existingNotes.find(note =>
        note.title.toLowerCase() === title.toLowerCase()
    );

    if (existing) {
        return existing;
    }

    const escapedTitle = title
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const html = `
        <h1>${escapedTitle}</h1>
        <div>research-annotator-research-note-v1</div>
        <p></p>
    `;

    const note = new Zotero.Item("note");
    note.libraryID = libraryID;
    note.setNote(html);

    await note.saveTx();

    log("Research note created: " + title + " | Key: " + note.key);

    return {
        key: note.key,
        title: title
    };
},
_schedulePaperResearchNoteSync(annotation) {
    if (!annotation?.parentID || !annotation.id) return;

    const queueKey = `${annotation.libraryID}:${annotation.parentID}`;

    if (!this._paperNoteSyncTimers) {
        this._paperNoteSyncTimers = new Map();
    }

    const existingTimer = this._paperNoteSyncTimers.get(queueKey);

    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(async () => {
        this._paperNoteSyncTimers.delete(queueKey);

        try {
            const fresh = await Zotero.Items.getAsync(annotation.id);

            if (fresh?.isAnnotation?.()) {
                await this._syncPaperResearchNote(fresh);
            }
        }
        catch (error) {
            log(
                "Debounced paper-note synchronization failed for "
                + queueKey + ": " + error
            );
        }
    }, 1200);

    this._paperNoteSyncTimers.set(queueKey, timer);
},
async _syncPaperResearchNote(annotation) {
    if (!annotation) return;

    const libraryID = annotation.libraryID;
    const parentID = annotation.parentID;
    const queueKey = `${libraryID}:${parentID}`;

    if (!this._paperNoteQueues) {
        this._paperNoteQueues = new Map();
    }

    const previous = this._paperNoteQueues.get(queueKey)
        || Promise.resolve();

    const current = previous
        .catch(e => {
            log("Previous paper-note update failed: " + e);
        })
        .then(async () => {
            // Reload the annotation so queued work uses its latest state.
            const fresh = annotation.id
                ? await Zotero.Items.getAsync(annotation.id)
                : annotation;

            if (!fresh || !fresh.isAnnotation?.()) return;

            return this._syncPaperResearchNoteNow(fresh);
        });

    this._paperNoteQueues.set(queueKey, current);

    try {
        return await current;
    }
    finally {
        if (this._paperNoteQueues.get(queueKey) === current) {
            this._paperNoteQueues.delete(queueKey);
        }
    }
},

async _syncPaperResearchNoteNow(annotation) {
    if (!annotation || !annotation.isAnnotation?.()) return;

    const attachmentID = annotation.parentID;
    if (!attachmentID) return;

    const { note } = await this._getOrCreatePaperResearchNote(annotation);
    const libraryID = annotation.libraryID;

    const attachment = await Zotero.Items.getAsync(attachmentID);

    if (!attachment || !attachment.isAttachment?.()) {
        throw new Error("Could not resolve PDF attachment for annotation links.");
    }

    const library = Zotero.Libraries.get(libraryID);

    const libraryPath =
        library?.libraryType === "group" && library.groupID
            ? `groups/${library.groupID}`
            : "library";

    const pdfLinkBase =
        `zotero://open-pdf/${libraryPath}/items/${attachment.key}`;

    const escapeHTML = value =>
        String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");

    // Load every annotation belonging to this PDF.
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("resultLevel", "annotation");

    const ids = await search.search();
    const annotations = [];

    for (const id of ids) {
        const item = await Zotero.Items.getAsync(id);

        if (
            item?.isAnnotation?.() &&
            item.parentID === attachmentID
        ) {
            annotations.push(item);
        }
    }

    // A newly converted annotation may not yet appear in Zotero's search results.
    // Ensure the annotation that triggered this rebuild is included.
    if (
        annotation.parentID === attachmentID &&
        !annotations.some(item => item.id === annotation.id)
    ) {
        const currentAnnotation = await Zotero.Items.getAsync(annotation.id);

        if (
            currentAnnotation?.isAnnotation?.() &&
            currentAnnotation.parentID === attachmentID
        ) {
            annotations.push(currentAnnotation);
            log(
                "Added triggering annotation missing from search results: "
                + currentAnnotation.key
            );
        }
    }

    // Read research metadata once for the complete rebuild.
    const metadata = await this._getResearchMetadata(libraryID);
    const colorLabels = this.getColorLabels();

    const entries = [];

    for (const item of annotations) {
        const annotationKey = `${libraryID}:${item.key}`;
        const saved = metadata.annotations[annotationKey] || {};

        let comment = item.annotationComment || "";

        // Migrate comments stored by the previous version.
        if (saved.researchComment) {
            if (!comment) {
                item.annotationComment = saved.researchComment;
                await item.saveTx();
                comment = item.annotationComment || "";
            }

            await this._updateResearchMetadata(libraryID, current => {
                const currentSaved =
                    current.annotations[annotationKey];

                if (!currentSaved?.researchComment) return false;

                delete currentSaved.researchComment;
                return true;
            });
        }

        const text = item.annotationText || "";
        const type = String(item.annotationType || "").toLowerCase();
        const color = String(item.annotationColor || "").toLowerCase();

        const labelEntry = Object.entries(colorLabels).find(
            ([hex]) => String(hex).toLowerCase() === color
        );

        const colorLabel = String(labelEntry?.[1] || "").trim();
        const safeColor = /^#[0-9a-f]{6}$/i.test(color) ? color : "";

        const escapedText = escapeHTML(text || "Image annotation");
        let formattedText = escapedText;

        if (safeColor && type === "highlight") {
            formattedText =
                `<mark style="background-color:${safeColor};color:CanvasText;text-decoration:none;border-bottom:0;">${escapedText}</mark>`;
        }
        else if (safeColor && type === "underline") {
            formattedText =
                `<span style="text-decoration:none;border-bottom:2px solid ${safeColor};padding-bottom:1px;">${escapedText}</span>`;
        }

        let pageIndex = Number.MAX_SAFE_INTEGER;
        let page = "";
        let positionY = Number.MAX_SAFE_INTEGER;
        let positionX = Number.MAX_SAFE_INTEGER;

        try {
            const position =
                typeof item.annotationPosition === "string"
                    ? JSON.parse(item.annotationPosition)
                    : item.annotationPosition;

            if (typeof position?.pageIndex === "number") {
                pageIndex = position.pageIndex;
                page = String(pageIndex + 1);
            }

            const rects = Array.isArray(position?.rects)
                ? position.rects.filter(rect =>
                    Array.isArray(rect) && rect.length >= 4
                )
                : [];

            if (rects.length) {
                const xValues = rects.flatMap(rect =>
                    [Number(rect[0]), Number(rect[2])]
                ).filter(Number.isFinite);

                const yValues = rects.flatMap(rect =>
                    [Number(rect[1]), Number(rect[3])]
                ).filter(Number.isFinite);

                if (xValues.length) positionX = Math.min(...xValues);
                // PDF coordinates have a bottom-left origin:
                // larger Y values are higher on the page.
                if (yValues.length) positionY = Math.max(...yValues);
            }
        }
        catch (e) {
            log("Could not read annotation page or position: " + e);
        }

        const annotationLink = page
            ? `${pdfLinkBase}?page=${pageIndex + 1}&amp;annotation=${item.key}`
            : "";

        const tags = (item.getTags?.() || [])
            .map(tag => typeof tag === "string" ? tag : tag.tag)
            .filter(Boolean)
            .filter(tag =>
                !tag.startsWith("RA:Theme:") &&
                !tag.startsWith("RA:Experiment:") &&
                !tag.startsWith("RA:ThemeCatalog:") &&
                !tag.startsWith("RA:ExperimentCatalog:")
            );

        const themes = Array.isArray(saved.themes) ? saved.themes : [];
        const experiments = Array.isArray(saved.experiments)
            ? saved.experiments
            : [];

        const labelHighlightStyle = safeColor
            ? ` style="background-color:${safeColor};color:CanvasText;padding:2px 5px;"`
            : "";

        const entryHTML = `
            <div>
                <p style="margin:0;padding:0;font-size:1px;line-height:1px;color:#888;">RA_ENTRY_START:${escapeHTML(annotationKey)}</p>
                <p><strong><mark${labelHighlightStyle}>${escapeHTML(colorLabel || (type === "highlight" ? "Highlight" : type === "underline" ? "Underline" : "Annotation"))}</mark></strong></p>
                <h2>${annotationLink
                    ? `<a href="${annotationLink}" style="color:CanvasText !important;text-decoration:none !important;border-bottom:0;">${formattedText}</a>`
                    : formattedText}</h2>
                ${page ? `<p><strong>Page:</strong> ${page}</p>` : ""}
                ${comment ? `<p><strong>Research comment:</strong> ${escapeHTML(comment)}</p>` : ""}
                ${themes.length
                    ? `<p><strong>Themes:</strong> ${themes.map(escapeHTML).join(", ")}</p>`
                    : ""}
                ${experiments.length
                    ? `<p><strong>Experiments:</strong> ${experiments.map(escapeHTML).join(", ")}</p>`
                    : ""}
                ${tags.length
                    ? `<p><strong>Tags:</strong> ${tags.map(escapeHTML).join(", ")}</p>`
                    : ""}
                <p style="margin:0;padding:0;font-size:1px;line-height:1px;color:#888;">RA_ENTRY_END:${escapeHTML(annotationKey)}</p>
            </div>
        `;

        entries.push({
            key: annotationKey,
            pageIndex,
            positionY,
            positionX,
            color,
            html: entryHTML
        });
    }

    // PDF order is the default. Color order groups by actual annotation
    // color, retaining reading order inside each color group.
    const noteSortOrder = getPref("paperNoteSortOrder", "pdf");

    const comparePDFPosition = (a, b) =>
        a.pageIndex - b.pageIndex ||
        b.positionY - a.positionY ||
        a.positionX - b.positionX ||
        a.key.localeCompare(b.key);

    if (noteSortOrder === "color") {
        entries.sort((a, b) =>
            a.color.localeCompare(b.color) ||
            comparePDFPosition(a, b)
        );
    }
    else {
        entries.sort(comparePDFPosition);
    }

    // Preserve the note heading and introductory text, but discard all
    // previous managed entries. This also removes duplicates and stale entries.
    let content = note.getNote() || "";
    const firstManagedEntry = content.indexOf("RA_ENTRY_START:");

    if (firstManagedEntry !== -1) {
        // Preserve the note heading and attachment marker.
        const firstEntryParagraph = content.lastIndexOf("<p", firstManagedEntry);
        content = content.substring(
            0,
            firstEntryParagraph >= 0 ? firstEntryParagraph : firstManagedEntry
        );
    }
    const numberedEntries = entries.map((entry, index) =>
        entry.html.replace(
            /<h2>([\s\S]*?)<\/h2>/i,
            `<h2>${index + 1}. $1</h2>`
        )
    );

    content =
        content.replace(/\s*$/, "\n")
        + numberedEntries.join("\n");

    // Avoid rewriting and refreshing an already up-to-date research note.
    const existingNoteContent = note.getNote() || "";

    if (existingNoteContent === content) {
        log(
            "Paper research note unchanged; skipped refresh. Note: "
            + note.key
        );
        return;
    }

    if (!this._paperNoteGeneratedContent) {
        this._paperNoteGeneratedContent = new Map();
    }

    const generatedNoteKey = `${note.libraryID}:${note.key}`;

    note.setNote(content);

    // Register the expected content before saving to guard against
    // a notifier arriving while saveTx() is still completing.
    this._paperNoteGeneratedContent.set(
        generatedNoteKey,
        content
    );

    await note.saveTx();

    // Zotero may normalize the HTML during saving.
    const savedNoteHTML = note.getNote() || content;

    this._paperNoteGeneratedContent.set(
        generatedNoteKey,
        savedNoteHTML
    );

    // Synchronize every open editor for this research note.
    const openEditors = Zotero.Notes?._editorInstances || [];

    for (const editor of openEditors) {
        if (
            editor.itemID !== note.id
            || typeof editor.applyIncrementalUpdate !== "function"
        ) {
            continue;
        }

        try {
            editor.applyIncrementalUpdate(
                { html: savedNoteHTML },
                true
            );

            log(
                "Research note editor refreshed: "
                + editor.instanceID
                + " | note: "
                + note.id
            );
        }
        catch (error) {
            log(
                "Research note editor refresh failed: "
                + editor.instanceID
                + " | "
                + error
            );
        }
    }

    log(
        "Paper research note rebuilt for PDF "
        + attachmentID
        + " | annotations: "
        + entries.length
    );
},
async _syncAllPaperResearchNotes(libraryID = Zotero.Libraries.userLibraryID) {
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("resultLevel", "annotation");

    const ids = await search.search();
    const annotations = [];

    // Load all annotations before writing any research notes.
    for (const id of ids) {
        try {
            const item = await Zotero.Items.getAsync(id);

            if (!item || !item.isAnnotation?.()) continue;

            if (!item.parentID) {
                log("Skipping annotation without parent attachment: " + item.key);
                continue;
            }

            annotations.push(item);
        }
        catch (e) {
            log("Could not load annotation " + id + ": " + e);
        }
    }

    // Keep annotations from the same PDF together and order them by page.
    const getPageIndex = item => {
        try {
            const position = typeof item.annotationPosition === "string"
                ? JSON.parse(item.annotationPosition)
                : item.annotationPosition;

            return typeof position?.pageIndex === "number"
                ? position.pageIndex
                : Number.MAX_SAFE_INTEGER;
        }
        catch (e) {
            return Number.MAX_SAFE_INTEGER;
        }
    };

    annotations.sort((a, b) =>
        String(a.parentID).localeCompare(String(b.parentID))
        || getPageIndex(a) - getPageIndex(b)
        || String(a.key).localeCompare(String(b.key))
    );

    let synced = 0;
    let failed = 0;

    // Sequential writes prevent concurrent annotations from overwriting
    // one another in the same paper research note.
    for (let i = 0; i < annotations.length; i++) {
        const item = annotations[i];

        try {
            await this._syncPaperResearchNote(item);
            synced++;
        }
        catch (e) {
            failed++;
            log(
                "Paper-note synchronization failed for "
                + item.key + ": " + e
            );
        }

        if ((i + 1) % 10 === 0 || i === annotations.length - 1) {
            log(
                "Paper-note backfill progress: "
                + (i + 1) + "/" + annotations.length
                + " | synchronized: " + synced
                + " | failed: " + failed
            );
        }
    }

    const result = {
        libraryID,
        found: ids.length,
        loaded: annotations.length,
        synced,
        failed
    };

    log("Paper-note backfill completed: " + JSON.stringify(result));

    return result;
},
async _getResearchMetadataFromNote(libraryID) {
    const note = await this._findResearchMetadataNote(libraryID);

    if (!note) {
        return {
            version: 1,
            themes: [],
            experiments: [],
            annotations: {}
        };
    }

    try {
        const content = note.getNote();
        const markerIndex = content.indexOf(this.RESEARCH_METADATA_MARKER);
        if (markerIndex === -1) throw new Error("Metadata marker not found");

        const afterMarker = content.substring(markerIndex);
        const match = afterMarker.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
        if (!match) throw new Error("Metadata JSON block not found");

        const doc = new DOMParser().parseFromString(match[1], "text/html");
        const json = doc.body.textContent.replace(/\u00a0/g, " ").trim();
        const data = JSON.parse(json);

        return {
            version: 1,
            themes: Array.isArray(data.themes) ? data.themes : [],
            experiments: Array.isArray(data.experiments) ? data.experiments : [],
            annotations: data.annotations && typeof data.annotations === "object"
                ? data.annotations : {}
        };
    }
    catch (e) {
        log("Reading legacy research metadata failed: " + e);
        throw e;
    }
},

async _getAllResearchAnnotations(libraryID) {
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("resultLevel", "annotation");

    const ids = await search.search();
    const annotations = [];

    for (const id of ids) {
        const item = await Zotero.Items.getAsync(id);
        if (item?.isAnnotation?.() && item.libraryID === libraryID) {
            annotations.push(item);
        }
    }

    return annotations;
},

async _getResearchMetadata(libraryID) {
    const metadata = {
        version: 1,
        themes: [],
        experiments: [],
        annotations: {}
    };

    const themeCatalog = new Set();
    const experimentCatalog = new Set();
    const annotations = await this._getAllResearchAnnotations(libraryID);

    for (const item of annotations) {
        const key = `${libraryID}:${item.key}`;
        const saved = {
            themes: [],
            experiments: []
        };

        for (const tagObject of item.getTags()) {
            const tag = tagObject.tag || "";

            if (tag.startsWith("RA:Theme:")) {
                const value = tag.substring("RA:Theme:".length).trim();
                if (value) saved.themes.push(value);
            }
            else if (tag.startsWith("RA:Experiment:")) {
                const value = tag.substring("RA:Experiment:".length).trim();
                if (value) saved.experiments.push(value);
            }
        }

        saved.themes = [...new Set(saved.themes)];
        saved.experiments = [...new Set(saved.experiments)];

        if (saved.themes.length || saved.experiments.length) {
            metadata.annotations[key] = saved;
        }

        for (const value of saved.themes) themeCatalog.add(value);
        for (const value of saved.experiments) experimentCatalog.add(value);
    }

    metadata.themes = [...themeCatalog].sort((a, b) => a.localeCompare(b));
    metadata.experiments = [...experimentCatalog].sort((a, b) => a.localeCompare(b));

    return metadata;
},

async _saveResearchMetadata(libraryID, data) {
    const annotations = await this._getAllResearchAnnotations(libraryID);
    let changedCount = 0;

    for (const item of annotations) {
        const key = `${libraryID}:${item.key}`;
        const saved = data.annotations?.[key] || {};

        const itemThemes = [...new Set(
            (saved.themes || []).map(value => String(value).trim()).filter(Boolean)
        )];

        const itemExperiments = [...new Set(
            (saved.experiments || []).map(value => String(value).trim()).filter(Boolean)
        )];

        const desired = new Set([
            ...itemThemes.map(value => "RA:Theme:" + value),
            ...itemExperiments.map(value => "RA:Experiment:" + value)
        ]);

        let changed = false;

        // Remove obsolete assignments and all old catalog tags.
        for (const tagObject of item.getTags()) {
            const tag = tagObject.tag || "";

            const isAssignment =
                tag.startsWith("RA:Theme:") ||
                tag.startsWith("RA:Experiment:");

            const isOldCatalog =
                tag.startsWith("RA:ThemeCatalog:") ||
                tag.startsWith("RA:ExperimentCatalog:");

            if (isOldCatalog || (isAssignment && !desired.has(tag))) {
                item.removeTag(tag);
                changed = true;
            }
        }

        // Convert retained and new ResearchAnnotator tags to automatic tags.
        const existing = new Map(
            item.getTags().map(tagObject => [
                tagObject.tag,
                Number(tagObject.type)
            ])
        );

        for (const tag of desired) {
            if (!existing.has(tag)) {
                item.addTag(tag, 1);
                changed = true;
            }
            else if (existing.get(tag) !== 1) {
                item.removeTag(tag);
                item.addTag(tag, 1);
                changed = true;
            }
        }

        if (changed) {
            await item.saveTx();
            changedCount++;
        }
    }

    log(
        "Research metadata saved as automatic Zotero tags. Library: " +
        libraryID + " | Annotations updated: " + changedCount
    );

    return { annotationsUpdated: changedCount };
},

async _migrateResearchMetadataToTags(libraryID) {
    const note = await this._findResearchMetadataNote(libraryID);

    if (!note) {
        log("No legacy ResearchAnnotator metadata note found. Nothing to migrate.");
        return { migrated: false, reason: "No legacy metadata note found." };
    }

    const legacy = await this._getResearchMetadataFromNote(libraryID);

    // Merge any tags from an earlier or partial migration attempt.
    // This makes migration retries non-destructive.
    const existingTags = await this._getResearchMetadata(libraryID);

    const mergeValues = (oldValues, newValues) => [
        ...new Set([
            ...(Array.isArray(oldValues) ? oldValues : []),
            ...(Array.isArray(newValues) ? newValues : [])
        ])
    ];

    legacy.themes = mergeValues(legacy.themes, existingTags.themes);
    legacy.experiments = mergeValues(
        legacy.experiments,
        existingTags.experiments
    );

    for (const [key, tagged] of Object.entries(existingTags.annotations)) {
        const oldSaved = legacy.annotations[key] || {};

        legacy.annotations[key] = {
            ...tagged,
            ...oldSaved,
            themes: mergeValues(oldSaved.themes, tagged.themes),
            experiments: mergeValues(
                oldSaved.experiments,
                tagged.experiments
            )
        };
    }

    const annotations = await this._getAllResearchAnnotations(libraryID);

    const hasLegacyData =
        legacy.themes.length > 0 ||
        legacy.experiments.length > 0 ||
        Object.keys(legacy.annotations).length > 0;

    if (!annotations.length && hasLegacyData) {
        throw new Error(
            "Migration stopped: the library has no annotations to store the metadata on. " +
            "The original metadata note has been preserved."
        );
    }

    const itemsByKey = new Map(
        annotations.map(item => [`${libraryID}:${item.key}`, item])
    );

    for (const [key, saved] of Object.entries(legacy.annotations)) {
        const hasData =
            (saved.themes || []).length > 0 ||
            (saved.experiments || []).length > 0 ||
            Boolean(saved.researchComment);

        if (hasData && !itemsByKey.has(key)) {
            throw new Error(
                "Migration stopped: an annotation with saved metadata could not be found: " +
                key + ". The original metadata note has been preserved."
            );
        }
    }

    // Preserve legacy comments in Zotero's native annotation comment field.
    for (const [key, saved] of Object.entries(legacy.annotations)) {
        const legacyComment = String(saved.researchComment || "").trim();
        if (!legacyComment) continue;

        const item = itemsByKey.get(key);
        if (!item) continue;

        const existingComment = String(item.annotationComment || "").trim();

        if (!existingComment) {
            item.annotationComment = legacyComment;
            await item.saveTx();
        }
        else if (!existingComment.includes(legacyComment)) {
            item.annotationComment =
                existingComment + "\n\n" + legacyComment;
            await item.saveTx();
        }
    }

    // Write only per-annotation assignments as automatic Zotero tags.
    await this._saveResearchMetadata(libraryID, legacy);

    // Read the tags back and verify annotation assignments before deleting
    // the old note. Unassigned legacy catalog suggestions are intentionally
    // not migrated because suggestions now derive from active assignments.
    const migrated = await this._getResearchMetadata(libraryID);

    const missingAssignments = [];
    const missingComments = [];

    for (const [key, saved] of Object.entries(legacy.annotations)) {
        const actual = migrated.annotations[key] || {};

        for (const value of (saved.themes || [])) {
            if (!(actual.themes || []).includes(value)) {
                missingAssignments.push(key + " theme: " + value);
            }
        }

        for (const value of (saved.experiments || [])) {
            if (!(actual.experiments || []).includes(value)) {
                missingAssignments.push(key + " experiment: " + value);
            }
        }

        const legacyComment = String(saved.researchComment || "").trim();

        if (legacyComment) {
            const item = itemsByKey.get(key);
            const actualComment = String(item?.annotationComment || "");

            if (!actualComment.includes(legacyComment)) {
                missingComments.push(key);
            }
        }
    }

    if (missingAssignments.length || missingComments.length) {
        throw new Error(
            "Migration verification failed. The old metadata note was preserved. " +
            "Missing assignments: " + missingAssignments.join(", ") +
            " | Missing comments: " + missingComments.join(", ")
        );
    }

    // Delete the old note only after successful read-back verification.
    await note.eraseTx();

    log(
        "ResearchAnnotator metadata migration completed. Library: " +
        libraryID + " | Annotations checked: " + annotations.length +
        " | Legacy metadata note deleted."
    );

    return {
        migrated: true,
        annotationsChecked: annotations.length,
        themes: migrated.themes.length,
        experiments: migrated.experiments.length
    };
},
async _updateResearchMetadata(libraryID, updater) {
    if (!this._researchMetadataQueues) {
        this._researchMetadataQueues = new Map();
    }

    const queues = this._researchMetadataQueues;
    const previous = queues.get(libraryID) || Promise.resolve();

    const current = previous
        .catch(e => {
            log("Previous metadata update failed; continuing queue: " + e);
        })
        .then(async () => {
            const metadata = await this._getResearchMetadata(libraryID);
            const shouldSave = await updater(metadata);

            if (shouldSave === false) {
                return metadata;
            }

            await this._saveResearchMetadata(libraryID, metadata);
            return metadata;
        });

    queues.set(libraryID, current);

    try {
        return await current;
    }
    finally {
        if (queues.get(libraryID) === current) {
            queues.delete(libraryID);
        }
    }
},

_readerAnnotationIDs(reader) {
    const raw =
        reader?._state?.annotations
        ?? reader?._internalReader?._state?.annotations
        ?? reader?._internalReader?._annotations;

    if (!raw) {
        throw new Error("Reader annotations collection is unavailable.");
    }

    const ids = new Set();

    const addID = value => {
        const id = typeof value === "string" ? value : value?.id;
        if (id) ids.add(String(id));
    };

    // Avoid spread and iterator protocols on Zotero's cross-compartment objects.
    if (typeof raw.forEach === "function") {
        raw.forEach(value => addID(value));
    }
    else if (Array.isArray(raw)) {
        for (let i = 0; i < raw.length; i++) {
            addID(raw[i]);
        }
    }
    else if (typeof raw === "object") {
        const keys = Object.keys(raw);
        for (let i = 0; i < keys.length; i++) {
            addID(raw[keys[i]]);
        }
    }
    else {
        throw new Error("Unsupported reader annotations collection.");
    }

    return ids;
},

async _removePaperResearchNoteEntry(libraryID, annotationKey) {
    const search = new Zotero.Search();
    search.libraryID = libraryID;
    search.addCondition("itemType", "is", "note");

    const ids = await search.search();
    const startMarker = `RA_ENTRY_START:${annotationKey}`;
    const endMarker = `RA_ENTRY_END:${annotationKey}`;

    for (const id of ids) {
        const note = Zotero.Items.get(id);

        if (!note || !note.isNote?.()) continue;

        const content = note.getNote() || "";
        const startIndex = content.indexOf(startMarker);

        if (startIndex < 0) continue;

        const endIndex = content.indexOf(
            endMarker,
            startIndex + startMarker.length
        );

        if (endIndex < 0) {
            log("Found incomplete paper-note entry: " + annotationKey);
            continue;
        }

        // Remove the complete managed entry wrapper.
        // Zotero's note editor removes entry-level div wrappers.
        // Remove only the two marker paragraphs and their contents.
        const removeStart = content.lastIndexOf("<p", startIndex);
        const startParagraphEnd = content.indexOf("</p>", startIndex);
        const endParagraphEnd = content.indexOf("</p>", endIndex);
        const removeEnd =
            endParagraphEnd >= 0 ? endParagraphEnd + 4 : -1;

        if (
            removeStart < 0
            || startParagraphEnd < 0
            || startParagraphEnd >= endIndex
            || removeEnd <= startParagraphEnd
        ) {
            log("Could not determine paper-note entry boundaries: " + annotationKey);
            continue;
        }

        let updated =
            content.slice(0, removeStart)
            + content.slice(removeEnd);

        // Renumber only ResearchAnnotator-managed annotation entries.
        let entryNumber = 0;
        let searchFrom = 0;
        let markerIndex = updated.indexOf("RA_ENTRY_START:", searchFrom);

        while (markerIndex !== -1) {
            const endMarkerIndex = updated.indexOf(
                "RA_ENTRY_END:",
                markerIndex
            );

            const headingStart = updated.indexOf("<h2>", markerIndex);

            if (endMarkerIndex === -1) break;

            if (headingStart !== -1 && headingStart < endMarkerIndex) {
                const headingEnd = updated.indexOf("</h2>", headingStart);

                if (headingEnd !== -1 && headingEnd < endMarkerIndex) {
                    const headingText = updated.slice(
                        headingStart + 4,
                        headingEnd
                    ).replace(/^\d+\.\s*/, "");

                    const numberedHeading =
                        "<h2>" + (++entryNumber) + ". " + headingText + "</h2>";

                    updated =
                        updated.slice(0, headingStart)
                        + numberedHeading
                        + updated.slice(headingEnd + 5);
                }
            }

            const nextSearch = updated.indexOf(
                "RA_ENTRY_END:",
                markerIndex
            );

            searchFrom = nextSearch === -1
                ? updated.length
                : nextSearch + "RA_ENTRY_END:".length;

            markerIndex = updated.indexOf(
                "RA_ENTRY_START:",
                searchFrom
            );
        }

        note.setNote(updated);
        await note.saveTx();

        log("Removed old paper-note entry: " + annotationKey);
        return true;
    }

    return false;
},
async handleConvertedAnnotation(id) {
    const item = await Zotero.Items.getAsync(id);

    if (!item || !item.isAnnotation?.()) {
        return false;
    }

    const conversionKey = `${item.libraryID}:${item.key}`;
    const conversion = this._pendingAnnotationConversions?.get(conversionKey);

    if (!conversion) {
        return false;
    }

    // Keep the conversion registered while migration is running.
    if (conversion.processing) {
        return true;
    }

    conversion.processing = true;

    try {
        const libraryID = item.libraryID;
        const oldKey = conversion.oldAnnotationKey;
        const newKey = conversionKey;

        let migratedMetadata = false;

        await this._updateResearchMetadata(libraryID, metadata => {
            const oldSaved = metadata.annotations[oldKey];

            if (!oldSaved) {
                return false;
            }

            const newSaved = metadata.annotations[newKey] || {};

            const mergeLists = (oldValues, newValues) => [
                ...new Set([
                    ...(Array.isArray(oldValues) ? oldValues : []),
                    ...(Array.isArray(newValues) ? newValues : [])
                ])
            ];

            metadata.annotations[newKey] = {
                ...oldSaved,
                ...newSaved,
                themes: mergeLists(oldSaved.themes, newSaved.themes),
                experiments: mergeLists(
                    oldSaved.experiments,
                    newSaved.experiments
                )
            };

            delete metadata.annotations[oldKey];

            migratedMetadata = true;

            return true;
        });

        // Do not remove the old entry here.
        // The notification handler performs one complete rebuild after
        // metadata migration, replacing stale entries with current annotations.

        this._pendingAnnotationConversions.delete(conversionKey);

        log(
            "Annotation conversion metadata migrated: "
            + oldKey
            + " -> "
            + newKey
        );

    }
    catch (e) {
        // Keep the record so this annotation is never treated as a
        // completely new highlight by Annota's automatic AI handler.
        log("Annotation metadata migration failed: " + e);

    }

    return true;
},

async handleResearchMetadata(id) {
    let item = await Zotero.Items.getAsync(id);

    if (!item || !item.isAnnotation || !item.isAnnotation()) return;

    let pending = this._pendingResearch;
    if (!pending) return;

    // Expire stale popup data after 10 minutes.
    if (Date.now() - pending.ts > 600000) {
        this._pendingResearch = null;
        return;
    }

    let annotationText = this._normText(item.annotationText || "");
    let selectedText = this._normText(pending.text || "");

    // Match the newly created annotation to the selected text.
    let matches =
        annotationText &&
        selectedText &&
        (
            annotationText === selectedText ||
            annotationText.startsWith(selectedText.slice(0, 40)) ||
            selectedText.startsWith(annotationText.slice(0, 40))
        );

    if (!matches) return;

    let comment = String(pending.values?.comment || "").trim();

    let tags = [
        ...new Set(
            (pending.values?.tags || [])
                .map(tag => String(tag).trim())
                .filter(Boolean)
        )
    ];

    let themes = [
        ...new Set(
            (pending.values?.themes || [])
                .map(value => String(value).trim())
                .filter(Boolean)
        )
    ];

    let experiments = [
        ...new Set(
            (pending.values?.experiments || [])
                .map(value => String(value).trim())
                .filter(Boolean)
        )
    ];

    let changed = false;

    // Save the ResearchAnnotator comment in Zotero's native field.
    if ((item.annotationComment || "") !== comment) {
        item.annotationComment = comment;
        changed = true;
    }

    // Apply native Zotero tags.
    let existingTags = new Set(
        item.getTags().map(tag => tag.tag)
    );

    for (let tag of tags) {
        if (!existingTags.has(tag)) {
            item.addTag(tag);
            changed = true;
        }
    }

    if (changed) {
        await item.saveTx();
    }

    // Save research themes and experiments through the shared queue.
    if (themes.length || experiments.length) {
        const libraryID = item.libraryID;
        const annotationKey = `${libraryID}:${item.key}`;

        await this._updateResearchMetadata(libraryID, metadata => {
            metadata.themes = [
                ...new Set([...metadata.themes, ...themes])
            ];

            metadata.experiments = [
                ...new Set([...metadata.experiments, ...experiments])
            ];

            const annotationMetadata = {
                ...(metadata.annotations[annotationKey] || {}),
                themes,
                experiments
            };

            delete annotationMetadata.researchComment;
            metadata.annotations[annotationKey] = annotationMetadata;
        });
    }

    await this._syncPaperResearchNote(item);
    this._pendingResearch = null;

    log("Research metadata saved for annotation " + id);
},
	async handleItem(id, notifiedAt) {
		if (this.inProgress.has(id)) return;
		let tEnter = Date.now();

		let item;
		try {
			item = await Zotero.Items.getAsync(id);
		}
		catch (e) {
			return;
		}
		if (!item || !item.isAnnotation || !item.isAnnotation()) return;

		if (!this.targetTypes().includes(item.annotationType)) return;

		// Bibliothèque en lecture seule ? on ignore.
		if (item.library && item.library.editable === false) return;

		// Zone encadrée : pas de texte sélectionné, on lit celui que la zone
		// contient (PDF ouvert dans le lecteur).
		let isImage = item.annotationType === "image";
		let key = this.keyForItem(item);
		let text = isImage ? "" : (item.annotationText || "").trim();
		if (!text && !isImage) return;

		// Mode 1 (automatique) : ne se déclenche que si la couleur a un prompt
		// ET que ce prompt est réglé sur « auto ». Les couleurs « manuel » ne
		// réagissent qu'au menu contextuel. Couleur sans prompt = ignorée.
		let entry = this.getColorEntry(key);
		if (!entry) {
			log("annotation " + id + " ignorée : couleur " + item.annotationColor
				+ " sans prompt, gabarit ni champs");
			return;
		}
		// Sert de couleur par défaut au prochain formulaire de sélection : on
		// surligne rarement une seule fois dans la même couleur.
		if (!isImage) this._lastColor = item.annotationColor;

		// Un formulaire rempli dans le popup de sélection VAUT demande explicite :
		// on exécute même sur une couleur réglée sur « à la demande », sinon la
		// saisie serait silencieusement perdue à la validation.
		let pending = isImage ? null : this.peekPendingFields(text);
		let filled = this._hasFilledValues(pending);
		if (entry.trigger !== "auto" && !filled) {
			log("annotation " + id + " ignorée : couleur en mode « à la demande »"
				+ " et aucun champ saisi");
			return;
		}

		// Commentaire déjà saisi (paraphrase manuelle) : capturé avant tout,
		// pour la variable {{comment}} et pour respecter « ne pas écraser ».
		let existing = (item.annotationComment || "").trim();
		let overwrite = getPref("overwrite", false);
		if (existing && !overwrite) return;

		// Un commentaire monté à la main n'appelle aucun modèle : inutile
		// d'exiger une clé API ou le CLI dans ce cas. On raisonne sur CETTE
		// annotation (willCallProvider), pas sur la couleur en général, car un
		// formulaire entièrement rempli ne laisse rien à demander.
		let callsProvider = this.willCallProvider(entry, pending);
		if (isImage && callsProvider) {
			text = await this.areaText(item);
			if (!text) {
				log("zone " + id + " : aucun texte lisible, champs laissés à la saisie");
				return;
			}
		}
		if (callsProvider) {
			let notReady = this.providerReadyError();
			if (notReady) {
				toast("Annota", notReady, "error");
				return;
			}
		}

		this.inProgress.add(id);
		let usedPlaceholder = false;
		try {
			if (getPref("showPlaceholder", true) && callsProvider) {
				item.annotationComment = PLACEHOLDER;
				await item.saveTx();
				usedPlaceholder = true;
			}

			let tBuild = Date.now();
			let ctx = this.getContext(item);
			// Valeurs saisies dans le popup de sélection juste avant validation.
			let fields = isImage ? {} : this.takePendingFields(text);
			// Résolution des références différée : buildComment ne l'appelle que
			// si le commentaire ou le modèle s'en sert. Elle ouvre le PDF et en
			// parcourt les liens, ce qui se paie en secondes.
			let built = {};
			let comment = await this.buildComment({
				text, ctx, color: key, comment: existing, fields,
				getRefs: () => this.getReferences(item, text), out: built
			});
			if (comment === null) return;
			// Un commentaire vide signifie que rien n'a pu être produit (champs
			// perdus, gabarit sans contenu) : ne pas écraser pour autant.
			if (!String(comment).trim()) {
				log("rien à écrire pour l'annotation " + id + " (résultat vide)");
				// Un vide APRÈS un appel au modèle est un échec, pas un choix :
				// on le signale. Un vide sans appel (couleur non configurée,
				// formulaire laissé vierge) n'a rien d'anormal.
				if (callsProvider) await this.markFailed(id, "résultat vide");
				return;
			}

			// Recharger l'item au cas où il aurait changé pendant l'appel réseau.
			let fresh = await Zotero.Items.getAsync(id);
			if (!fresh) return;
			this.rememberFields(fresh, built, comment);
			fresh.annotationComment = comment;
			this.setFailedTag(fresh, false);   // succès : l'échec précédent s'efface
			let tSave = Date.now();
			await fresh.saveTx();
			tSave = Date.now() - tSave;

			// Relevé complet : c'est la seule façon de distinguer ce qu'Annota
			// consomme de ce qu'elle attend. « notif » = délai entre l'événement
			// de création et notre prise en main (Zotero et les autres modules),
			// « écriture » = durée de la transaction, qui peut être mise en file
			// derrière d'autres travaux en cours.
			let t = this._timings || { refs: 0, ai: 0, build: 0 };
			log("annotation " + id + " — relevé : notif="
				+ (notifiedAt ? tEnter - notifiedAt : 0) + " ms, prépa="
				+ (tBuild - tEnter) + " ms, refs=" + t.refs + " ms, ia=" + t.ai
				+ " ms, écriture=" + tSave + " ms, total Annota="
				+ (Date.now() - tEnter) + " ms");
		}
		catch (e) {
			log("Generation error: " + e);
			toast("Annota", this.t("gen.failed", { msg: e.message || e }), "error");
			await this.markFailed(id, String(e.message || e));
			// Nettoyer le placeholder en cas d'échec.
			if (usedPlaceholder) {
				try {
					let fresh = await Zotero.Items.getAsync(id);
					if (fresh && (fresh.annotationComment || "").trim() === PLACEHOLDER) {
						fresh.annotationComment = "";
						await fresh.saveTx();
					}
				}
				catch (e2) { /* ignore */ }
			}
		}
		finally {
			this.inProgress.delete(id);
		}
	},

	// ---- Échecs visibles ----
	//
	// Un appel raté laissait un surlignage sans commentaire : rien ne le
	// distinguait d'un surlignage volontairement nu, et on ne s'en apercevait
	// qu'en relisant. On pose donc une étiquette sur l'annotation — visible
	// dans le lecteur, cherchable dans la bibliothèque, et point d'entrée du
	// « Retry failed comments » du menu contextuel.
	failedTag() {
		if (!getPref("markFailures", true)) return "";
		return String(getPref("failedTag", "annota-failed") || "").trim();
	},

	hasFailedTag(item) {
		let tag = this.failedTag();
		try { return !!tag && typeof item.hasTag === "function" && item.hasTag(tag); }
		catch (e) { return false; }
	},

	// Pose l'étiquette SANS enregistrer : l'appelant groupe avec sa propre
	// écriture quand il en a une, pour ne pas provoquer deux rafraîchissements.
	setFailedTag(item, on) {
		let tag = this.failedTag();
		if (!tag) return false;
		try {
			let has = this.hasFailedTag(item);
			if (on && !has) { item.addTag(tag, 0); return true; }
			if (!on && has) { item.removeTag(tag); return true; }
		}
		catch (e) {
			log("setFailedTag: " + e);
		}
		return false;
	},

	async markFailed(id, why) {
		if (!this.failedTag()) return;
		try {
			let fresh = await Zotero.Items.getAsync(id);
			if (fresh && this.setFailedTag(fresh, true)) {
				await fresh.saveTx();
				log("annotation " + id + " marquée en échec : " + why);
			}
		}
		catch (e) {
			log("markFailed: " + e);
		}
	},

	// Tronque une chaîne à `max` caractères (0/absent = pas de limite).
	truncate(s, max) {
		s = String(s || "").trim();
		if (!max || s.length <= max) return s;
		return s.slice(0, max).trim() + "…";
	},

	// Métadonnées du document source, pour les variables {{title}}, {{authors}},
	// {{year}}, {{abstract}}, {{publication}}, {{page}}.
	getContext(item) {
		let ctx = {
			title: "", authors: "", year: "",
			abstract: "", publication: "", page: ""
		};
		try {
			// Page de l'annotation (telle qu'affichée dans le PDF).
			ctx.page = item.annotationPageLabel || "";

			let parent = item.parentItem;               // pièce jointe (PDF)
			let top = (parent && parent.parentItem) ? parent.parentItem : parent;
			if (top && typeof top.getField === "function") {
				ctx.title = top.getField("title") || "";
				ctx.publication = top.getField("publicationTitle")
					|| top.getField("bookTitle")
					|| top.getField("proceedingsTitle")
					|| "";

				let maxAbs = parseInt(getPref("maxAbstractChars", 1200), 10);
				if (isNaN(maxAbs)) maxAbs = 1200;
				ctx.abstract = this.truncate(top.getField("abstractNote") || "", maxAbs);

				let ym = String(top.getField("date") || "").match(/\d{4}/);
				if (ym) ctx.year = ym[0];

				let creators = (typeof top.getCreators === "function") ? top.getCreators() : [];
				ctx.authors = creators
					.map(c => c.lastName || c.name || "")
					.filter(Boolean)
					.join(", ");
			}
		}
		catch (e) {
			log("getContext: " + e);
		}
		return ctx;
	},

	// ---- Résolution des références citées dans le passage ----
	//
	// Quand le passage contient « [1] » ou « (Moulin, 1999) », on va chercher
	// l'entrée bibliographique correspondante DANS LE PDF (section References)
	// et on la transmet à l'IA. Le texte du PDF est extrait via
	// Zotero.PDFWorker.getFullText puis mis en cache par pièce jointe.
	//
	// Limite assumée : suppose que la bibliographie est présente comme texte
	// dans le PDF. Sinon on renvoie "" et rien ne change.

	_fullTextCache: new Map(),

	// Détecte les appels de citation dans le passage surligné.
	detectCitationMarkers(text) {
		let numbers = new Set();
		let authorYears = [];
		let seen = new Set();
		let m;

		// Numériques : [1] [1,2] [1-3] [1, 2, 5–7]
		let numRe = /\[([\d\s,;‐-―-]+)\]/g;
		while ((m = numRe.exec(text)) !== null) {
			if (!/\d/.test(m[1])) continue;
			for (let part of m[1].split(/[,;]/)) {
				part = part.trim();
				let range = part.match(/^(\d{1,3})\s*[‐-―-]\s*(\d{1,3})$/);
				if (range) {
					let a = parseInt(range[1], 10), b = parseInt(range[2], 10);
					if (b >= a && b - a < 30) for (let i = a; i <= b; i++) numbers.add(i);
				}
				else if (/^\d{1,3}$/.test(part)) numbers.add(parseInt(part, 10));
			}
		}

		let pushAY = (author, year) => {
			author = String(author).trim().replace(/\s+/g, " ");
			let key = author.toLowerCase() + "|" + year;
			if (author && !seen.has(key)) { seen.add(key); authorYears.push({ author, year }); }
		};

		// Auteur-année entre parenthèses : (Moulin, 1999 ; Jacques et al., 2009)
		let parenRe = /\(([^()]{3,200})\)/g;
		while ((m = parenRe.exec(text)) !== null) {
			for (let chunk of m[1].split(/;/)) {
				let ay = chunk.match(
					/([\p{Lu}][\p{L}'’-]+(?:\s+(?:et\s+al\.?|and|&|y|und)\s*[\p{L}'’-]*)?)[,\s]+((?:1[6-9]|20)\d{2})[a-z]?/u);
				if (ay) pushAY(ay[1], ay[2]);
			}
		}

		// Auteur-année narratif : Moulin (1999), Jacques et al. (2009)
		let narrRe = /([\p{Lu}][\p{L}'’-]+(?:\s+(?:et\s+al\.?|and|&)\s*[\p{L}'’-]*)?)\s*\(((?:1[6-9]|20)\d{2})[a-z]?\)/gu;
		while ((m = narrRe.exec(text)) !== null) pushAY(m[1], m[2]);

		return { numbers: Array.from(numbers).sort((a, b) => a - b), authorYears };
	},

	// Texte intégral du PDF parent, mis en cache par pièce jointe.
	async getAttachmentFullText(item) {
		try {
			let att = item.parentItem;   // l'annotation appartient à la pièce jointe
			if (!att || !att.isPDFAttachment || !att.isPDFAttachment()) return "";
			if (this._fullTextCache.has(att.id)) return this._fullTextCache.get(att.id);

			let res = await Zotero.PDFWorker.getFullText(att.id, null);
			let text = (res && res.text) ? String(res.text) : "";
			// Cache borné : quelques documents en mémoire au plus.
			if (this._fullTextCache.size > 5) {
				this._fullTextCache.delete(this._fullTextCache.keys().next().value);
			}
			this._fullTextCache.set(att.id, text);
			return text;
		}
		catch (e) {
			log("getAttachmentFullText: " + e);
			return "";
		}
	},

	// Isole la section bibliographique (dernière occurrence d'un titre connu).
	findBibliographySection(fullText) {
		if (!fullText) return "";
		let re = /\b(references?|bibliograph(?:y|ie)|works\s+cited|literature\s+cited|r[eé]f[eé]rences?(?:\s+bibliographiques)?|referencias|refer[eê]ncias|literaturverzeichnis)\b\s*:?/gi;
		let last = -1, m;
		let floor = Math.floor(fullText.length * 0.4);   // seconde partie du document
		while ((m = re.exec(fullText)) !== null) {
			if (m.index >= floor) last = m.index + m[0].length;
		}
		return last < 0 ? "" : fullText.slice(last);
	},

	// Coupe au début de l'entrée bibliographique SUIVANTE.
	//
	// Dans le texte extrait d'un PDF, les entrées se suivent souvent sans retour
	// à la ligne : « …(last accessed 2023). Haddaway, N.R., P. Woodcock… ».
	// Se fier au saut de ligne laissait donc déborder l'entrée voisine.
	// On repère « ponctuation + espace » suivi d'un début d'entrée :
	//   - « Nom, X. »  (nom de famille puis initiale) ;
	//   - « [12] »     (bibliographie numérotée).
	// Le seuil minKeep protège le début de l'entrée courante.
	_cutAtNextEntry(s, minKeep = 40) {
		s = String(s);
		let re = /[.!?)\]]\s+(\[\d{1,3}\]|\p{Lu}[\p{L}'’-]+,\s+\p{Lu}\.)/gu;
		let m;
		while ((m = re.exec(s)) !== null) {
			let idx = m.index + m[0].indexOf(m[1]);
			if (idx >= minKeep) return s.slice(0, idx).trim();
		}
		return s;
	},

	// Coupe une entrée trop longue proprement.
	_trimEntry(s, max = 320) {
		s = String(s).replace(/\s+/g, " ").trim();
		if (s.length <= max) return s;
		let cut = s.slice(0, max);
		let dot = cut.lastIndexOf(". ");
		return dot > max * 0.5 ? cut.slice(0, dot + 1) : cut.trim() + "…";
	},

	// Variantes « structurées » : renvoient { marker, entry } au lieu d'une
	// chaîne. Les fonctions historiques ci-dessous s'appuient dessus, afin que
	// l'index bibliographique et le prompt partagent exactement la même
	// résolution.
	resolveNumericRefs(bib, numbers) {
		return this.resolveNumericRefsStructured(bib, numbers)
			.map(r => r.marker + " " + r.entry);
	},

	resolveAuthorYearRefs(bib, pairs) {
		return this.resolveAuthorYearRefsStructured(bib, pairs)
			.map(r => r.marker + " → " + r.entry);
	},

	// Entrées numérotées : « [12] Auteur… » ou « 12. Auteur… »
	resolveNumericRefsStructured(bib, numbers) {
		if (!bib || !numbers.length) return [];
		let markers = [], m;
		let re = /(?:^|[\s\n])(?:\[(\d{1,3})\]|(\d{1,3})\.(?=\s))/g;
		while ((m = re.exec(bib)) !== null) {
			markers.push({ n: parseInt(m[1] || m[2], 10), start: m.index + m[0].length, mStart: m.index });
		}
		if (!markers.length) return [];

		let out = [], wanted = new Set(numbers);
		for (let i = 0; i < markers.length; i++) {
			if (!wanted.has(markers[i].n)) continue;
			let end = (i + 1 < markers.length)
				? markers[i + 1].mStart
				: Math.min(bib.length, markers[i].start + 600);
			let body = this._trimEntry(
				this._cutAtNextEntry(bib.slice(markers[i].start, end)));
			if (body.length > 15) {
				out.push({ marker: "[" + markers[i].n + "]", entry: body });
				wanted.delete(markers[i].n);
			}
		}
		return out;
	},

	// Entrées auteur-année : fenêtre autour du nom suivi de l'année.
	resolveAuthorYearRefsStructured(bib, pairs) {
		if (!bib || !pairs.length) return [];
		let out = [];
		for (let { author, year } of pairs) {
			// Nom de famille = premier mot (« Moulin et al. » → « Moulin »).
			let surname = author.split(/\s+/)[0].replace(/[^\p{L}'’-]/gu, "");
			if (surname.length < 2) continue;
			let esc = surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			let re = new RegExp("\\b" + esc + "\\b", "giu");
			let m, found = null;
			while ((m = re.exec(bib)) !== null) {
				let win = bib.slice(m.index, m.index + 700);
				if (win.includes(year)) { found = win; break; }
			}
			if (found) {
				// Fin d'entrée = début de l'entrée suivante, avec ou sans retour à
				// la ligne. Ne PAS couper au premier point : il tombe juste après
				// « (1999). » et amputerait le titre et la revue.
				let body = this._trimEntry(this._cutAtNextEntry(found));
				if (body.length > 15) {
					out.push({ marker: "(" + author + ", " + year + ")", entry: body });
				}
			}
		}
		return out;
	},

	// ---- Voie déterministe : les liens internes du PDF ----
	//
	// C'est le mécanisme qui produit le popup au survol dans le lecteur Zotero :
	// l'appel de citation est une annotation /Link du PDF dont la destination
	// pointe sur l'entrée bibliographique. On suit ce lien plutôt que de deviner.
	// Nécessite que le PDF soit ouvert dans un onglet (pdf.js y est chargé) ;
	// sinon on retombe sur l'analyse du texte.

	// Lecteur ouvert pour cette pièce jointe, ou null.
	findReaderFor(attachmentID) {
		try {
			let readers = Zotero.Reader && Zotero.Reader._readers;
			if (!readers) return null;
			return readers.find(r => r && r.itemID === attachmentID) || null;
		}
		catch (e) {
			return null;
		}
	},

	// Objet de pdf.js sans vue Xray : celle-ci masque ses méthodes JS
	// (getPage, getTextContent…) au code du plugin. Chaque résultat attendu
	// d'une promesse de pdf.js repasse par ici.
	_waive(o) {
		try { return (o && o.wrappedJSObject) || o; }
		catch (e) { return o; }
	},

	// Document pdf.js du lecteur (traverse l'iframe du visualiseur).
	getPDFDocument(reader) {
		try {
			let win = reader && reader._internalReader
				&& reader._internalReader._primaryView
				&& reader._internalReader._primaryView._iframeWindow;
			if (!win) return null;
			let app = win.PDFViewerApplication
				|| (win.wrappedJSObject && win.wrappedJSObject.PDFViewerApplication);
			return (app && this._waive(app.pdfDocument)) || null;
		}
		catch (e) {
			log("getPDFDocument: " + e);
			return null;
		}
	},

	// Deux rectangles PDF se recouvrent-ils ? (marge pour les exposants)
	_rectsOverlap(a, b, pad = 2) {
		let ax1 = Math.min(a[0], a[2]) - pad, ax2 = Math.max(a[0], a[2]) + pad;
		let ay1 = Math.min(a[1], a[3]) - pad, ay2 = Math.max(a[1], a[3]) + pad;
		let bx1 = Math.min(b[0], b[2]), bx2 = Math.max(b[0], b[2]);
		let by1 = Math.min(b[1], b[3]), by2 = Math.max(b[1], b[3]);
		return ax1 <= bx2 && bx1 <= ax2 && ay1 <= by2 && by1 <= ay2;
	},

	// Résout la destination d'un lien en { pageIndex, y }.
	async _resolveDestination(pdfDoc, dest) {
		try {
			let d = dest;
			if (typeof d === "string") d = this._waive(await pdfDoc.getDestination(d));
			if (!Array.isArray(d) || !d.length) return null;
			let pageIndex = await pdfDoc.getPageIndex(d[0]);
			// [ref, {name:'XYZ'}, x, y, zoom] — y absent pour /Fit.
			let y = (typeof d[3] === "number") ? d[3] : null;
			return { pageIndex, y };
		}
		catch (e) {
			log("_resolveDestination: " + e);
			return null;
		}
	},

	// Texte de la page à partir de la position de destination (vers le bas).
	async _textAtDestination(pdfDoc, pageIndex, y, maxChars = 600) {
		try {
			let page = this._waive(await pdfDoc.getPage(pageIndex + 1));
			let content = this._waive(await page.getTextContent());
			let items = (content && content.items) || [];
			let rows = [];
			for (let it of items) {
				let str = it.str;
				if (!str) continue;
				let ty = (it.transform && it.transform.length > 5) ? it.transform[5] : null;
				if (ty === null) continue;
				// En coordonnées PDF l'origine est en bas : l'entrée commence à y
				// et se poursuit vers le bas (y décroissant). Marge vers le haut
				// pour rattraper une destination pointant la ligne au-dessus.
				if (y !== null && ty > y + 12) continue;
				rows.push({ y: ty, str, eol: it.hasEOL });
			}
			rows.sort((a, b) => b.y - a.y);
			// Début d'une entrée bibliographique : « [12] », « 12. » ou « Nom, P. ».
			let entryStart = /^(\[\d{1,3}\]|\d{1,3}\.\s|\p{Lu}[\p{L}'’-]+,\s+\p{Lu}\.)/u;
			let out = "";
			for (let r of rows) {
				// S'arrêter au début de l'entrée SUIVANTE, sinon on colle deux
				// références bout à bout et l'IA attribue la mauvaise source.
				if (out.length > 30 && entryStart.test(r.str.trim())) break;
				out += r.str + (r.eol ? "\n" : " ");
				if (out.length >= maxChars) break;
			}
			return out.trim();
		}
		catch (e) {
			log("_textAtDestination: " + e);
			return "";
		}
	},

	// Texte contenu dans une zone encadrée (image, tableau), ligne par ligne.
	// Lu dans pdf.js : le PDF doit être ouvert dans le lecteur, ce qui est le
	// cas quand on vient de tracer la zone. Sinon, ou pour une image sans
	// texte, chaîne vide.
	async areaText(item, maxChars = 6000) {
		try {
			let pos = JSON.parse(item.annotationPosition || "{}");
			let rects = (pos.rects || []).filter(r => Array.isArray(r) && r.length >= 4);
			if (!rects.length || typeof pos.pageIndex !== "number") return "";
			let reader = this.findReaderFor(item.parentID);
			let pdfDoc = this.getPDFDocument(reader);
			if (!pdfDoc) return "";
			let page = this._waive(await pdfDoc.getPage(pos.pageIndex + 1));
			let content = this._waive(await page.getTextContent());
			let items = (content && content.items) || [];
			let inside = (x, y) => rects.some(r => x >= Math.min(r[0], r[2]) && x <= Math.max(r[0], r[2])
				&& y >= Math.min(r[1], r[3]) && y <= Math.max(r[1], r[3]));
			let parts = [];
			for (let it of items) {
				let str = it.str;
				let t = it.transform;
				if (!str || !str.trim() || !t || t.length < 6) continue;
				let h = Math.abs(it.height || t[3] || 0) || 8;
				let x = t[4] + (it.width || 0) / 2, y = t[5] + h / 2;
				if (!inside(x, y)) continue;
				parts.push({ x: t[4], y: t[5], h, str });
			}
			// Lignes : même ordonnée à une demi-hauteur près, de haut en bas.
			parts.sort((a, b) => b.y - a.y || a.x - b.x);
			let lines = [];
			for (let p of parts) {
				let line = lines[lines.length - 1];
				if (line && Math.abs(line.y - p.y) <= Math.max(line.h, p.h) / 2) line.items.push(p);
				else lines.push({ y: p.y, h: p.h, items: [p] });
			}
			let out = lines.map(l => l.items.sort((a, b) => a.x - b.x).map(p => p.str.trim()).join(" "))
				.join("\n");
			return out.length > maxChars ? out.slice(0, maxChars) + "…" : out;
		}
		catch (e) {
			log("areaText: " + e);
			return "";
		}
	},

	// Suit les liens internes chevauchant le surlignage. Renvoie [] si le PDF
	// n'est pas ouvert ou ne contient pas de liens exploitables.
	async getLinkedReferences(item) {
		try {
			let att = item.parentItem;
			if (!att) return [];
			let reader = this.findReaderFor(att.id);
			if (!reader) return [];
			let pdfDoc = this.getPDFDocument(reader);
			if (!pdfDoc) return [];

			let pos = item.annotationPosition;
			if (typeof pos === "string") pos = JSON.parse(pos);
			if (!pos || typeof pos.pageIndex !== "number" || !Array.isArray(pos.rects)) return [];

			let page = this._waive(await pdfDoc.getPage(pos.pageIndex + 1));
			let annots = this._waive(await page.getAnnotations());
			if (!annots || !annots.length) return [];

			let max = parseInt(getPref("maxRefs", 8), 10) || 8;
			let out = [], seen = new Set();
			for (let a of annots) {
				if (out.length >= max) break;
				// Uniquement les liens internes (une destination, pas une URL).
				let isLink = a && (a.subtype === "Link" || a.subtype === "link");
				let dest = a && (a.dest || (a.action && a.action.dest));
				if (!isLink || !dest || a.url) continue;
				if (!Array.isArray(a.rect)) continue;
				if (!pos.rects.some(r => this._rectsOverlap(a.rect, r))) continue;

				let target = await this._resolveDestination(pdfDoc, dest);
				if (!target) continue;
				let key = target.pageIndex + ":" + (target.y === null ? "?" : Math.round(target.y));
				if (seen.has(key)) continue;
				seen.add(key);

				let txt = await this._textAtDestination(pdfDoc, target.pageIndex, target.y);
				txt = this._trimEntry(this._cutAtNextEntry(txt));
				if (txt.length > 15) out.push(txt);
			}
			if (out.length) log("Références résolues par lien PDF : " + out.length);
			return out;
		}
		catch (e) {
			log("getLinkedReferences: " + e);
			return [];
		}
	},

	// ---- Voie EPUB : les appels de note de bas de page ----
	//
	// Dans un livre au format EPUB, la source est souvent renvoyée en note : le
	// passage porte un numéro en exposant (« bref9. ») qui est un lien interne
	// vers la note, laquelle donne l'auteur, l'ouvrage, l'année et la page. On
	// lit l'EPUB lui-même (une archive zip), on retrouve le passage dans son
	// chapitre, on relève les liens d'appel de note qu'il contient et on
	// rapporte le texte de chaque note. Aucun lecteur ouvert n'est nécessaire,
	// le traitement en lot depuis la bibliothèque en profite donc aussi.

	_epubCache: new Map(),

	isEPUBAttachment(att) {
		try {
			return !!att && typeof att.isAttachment === "function" && att.isAttachment()
				&& att.attachmentContentType === "application/epub+zip";
		}
		catch (e) {
			return false;
		}
	},

	_domParser() {
		if (typeof DOMParser !== "undefined") return new DOMParser();
		let win = Zotero.getMainWindow && Zotero.getMainWindow();
		if (win && win.DOMParser) return new win.DOMParser();
		throw new Error("DOMParser indisponible");
	},

	// Lit une entrée de l'archive. Le fichier est rouvert à chaque lecture puis
	// refermé : Zotero ne doit pas trouver le livre verrouillé s'il le déplace
	// ou le synchronise.
	async _readZipEntry(path, entry) {
		let zr = Components.classes["@mozilla.org/libjar/zip-reader;1"]
			.createInstance(Components.interfaces.nsIZipReader);
		zr.open(Zotero.File.pathToFile(path));
		try {
			if (!zr.hasEntry(entry)) return null;
			let stream = zr.getInputStream(entry);
			try {
				return await Zotero.File.getContentsAsync(stream, "utf-8");
			}
			finally {
				stream.close();
			}
		}
		finally {
			zr.close();
		}
	},

	// Chemin d'une entrée relatif à une autre (« ../Text/notes.html#n4 »).
	_joinPath(base, rel) {
		rel = String(rel || "").split("#")[0].split("?")[0];
		if (!rel) return base;
		let parts = rel.startsWith("/") ? [] : String(base).split("/").slice(0, -1);
		for (let seg of rel.split("/")) {
			if (!seg || seg === ".") continue;
			if (seg === "..") parts.pop();
			else parts.push(seg);
		}
		let out = parts.join("/");
		try { out = decodeURIComponent(out); }
		catch (e) { /* chemin déjà décodé */ }
		return out;
	},

	_parseMarkup(str, type) {
		let parser = this._domParser();
		let doc = parser.parseFromString(str, type || "application/xhtml+xml");
		// Certains EPUB servent du HTML mal formé : l'analyseur XML le refuse,
		// l'analyseur HTML le lit.
		let broken = !doc || !doc.documentElement
			|| doc.documentElement.localName === "parsererror"
			|| doc.getElementsByTagName("parsererror").length > 0;
		if (broken && type !== "text/xml") doc = parser.parseFromString(str, "text/html");
		return doc;
	},

	// Livre ouvert : chapitres dans l'ordre de lecture (spine) et documents
	// déjà analysés. Gardé dix minutes : une séance de lecture surligne
	// plusieurs passages du même livre.
	async _openEPUB(att) {
		let path = await att.getFilePathAsync();
		if (!path) return null;
		let book = this._epubCache.get(att.id);
		if (book && book.path === path && Date.now() - book.at < 10 * 60000) return book;

		book = { path, at: Date.now(), spine: [], docs: new Map() };
		let container = await this._readZipEntry(path, "META-INF/container.xml");
		if (!container) return null;
		let cdoc = this._parseMarkup(container, "text/xml");
		let rootFile = cdoc.getElementsByTagNameNS("*", "rootfile")[0];
		let opfPath = rootFile && rootFile.getAttribute("full-path");
		if (!opfPath) return null;
		let opf = await this._readZipEntry(path, opfPath);
		if (!opf) return null;
		let odoc = this._parseMarkup(opf, "text/xml");

		let idToHref = new Map();
		for (let it of odoc.getElementsByTagNameNS("*", "item")) {
			let id = it.getAttribute("id"), href = it.getAttribute("href");
			if (id && href) idToHref.set(id, this._joinPath(opfPath, href));
		}
		// On garde la place des entrées introuvables : l'index du chapitre dans
		// la CFI de l'annotation compte TOUTES les entrées du spine.
		for (let ref of odoc.getElementsByTagNameNS("*", "itemref")) {
			book.spine.push(idToHref.get(ref.getAttribute("idref")) || null);
		}

		if (this._epubCache.size > 2) {
			this._epubCache.delete(this._epubCache.keys().next().value);
		}
		this._epubCache.set(att.id, book);
		return book;
	},

	async _epubDoc(book, entry) {
		if (!entry) return null;
		if (book.docs.has(entry)) return book.docs.get(entry);
		let str = await this._readZipEntry(book.path, entry);
		let doc = str ? this._parseMarkup(str) : null;
		book.docs.set(entry, doc);
		return doc;
	},

	// Le surlignage d'un EPUB ne garde que le texte et une CFI. On repère le
	// texte en ignorant les blancs, qui diffèrent entre le fichier et ce que
	// le lecteur a enregistré.
	_squeeze(s) {
		return String(s || "").replace(/[\s\u00ad\u200b-\u200d\u2060\ufeff]+/g, "");
	},

	// Texte compact du document et, pour chaque nœud texte, sa position de
	// départ dans ce texte.
	_textIndex(doc) {
		let flat = "", starts = new Map();
		let walk = (node) => {
			for (let c = node.firstChild; c; c = c.nextSibling) {
				if (c.nodeType === 3) {
					starts.set(c, flat.length);
					flat += this._squeeze(c.nodeValue);
				}
				else if (c.nodeType === 1) {
					let n = String(c.localName || "").toLowerCase();
					if (n === "script" || n === "style" || n === "head") continue;
					walk(c);
				}
			}
		};
		walk(doc.body || doc.documentElement);
		return { flat, starts };
	},

	_findPassage(index, text) {
		let needle = this._squeeze(text);
		if (needle.length < 8) return null;
		let at = index.flat.indexOf(needle);
		if (at >= 0) return { start: at, end: at + needle.length };
		// Repli : le début et la fin du passage, si son milieu diffère un peu
		// (guillemets ou ligatures normalisés par le lecteur).
		let k = Math.min(60, Math.floor(needle.length / 3));
		let head = needle.slice(0, k), tail = needle.slice(-k);
		let s = index.flat.indexOf(head);
		while (s >= 0) {
			let e = index.flat.indexOf(tail, s + k);
			if (e >= 0 && e - s <= needle.length * 1.5 + 50) return { start: s, end: e + k };
			s = index.flat.indexOf(head, s + 1);
		}
		return null;
	},

	// Texte d'un appel de note : chiffre, chiffre romain, lettre ou symbole,
	// éventuellement entre crochets.
	_NOTE_MARK: /^[[(]?\s*(\d{1,4}|[ivxlc]{1,6}|[a-z]|[*\u2020\u2021\u00a7\u00b6]{1,3})\s*[\])]?\.?$/i,

	_semanticType(el) {
		let t = "";
		try { t += " " + (el.getAttributeNS("http://www.idpf.org/2007/ops", "type") || ""); }
		catch (e) { /* attribut absent */ }
		t += " " + (el.getAttribute("epub:type") || "") + " " + (el.getAttribute("role") || "");
		return t.toLowerCase();
	},

	_firstText(el) {
		for (let c = el.firstChild; c; c = c.nextSibling) {
			if (c.nodeType === 3 && this._squeeze(c.nodeValue)) return c;
			if (c.nodeType === 1) {
				let t = this._firstText(c);
				if (t) return t;
			}
		}
		return null;
	},

	// Liens d'appel de note situés dans le passage, ou accolés juste après
	// lui : on arrête souvent la sélection sur le mot ou le point, et le
	// numéro qui suit appartient bien au passage.
	_noteCallsIn(doc, index, span) {
		let out = [];
		for (let a of doc.getElementsByTagNameNS("*", "a")) {
			let href = a.getAttribute("href")
				|| a.getAttributeNS("http://www.w3.org/1999/xlink", "href") || "";
			if (!href.includes("#") || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
			let label = String(a.textContent || "").replace(/\s+/g, " ").trim();
			let semantic = /noteref/.test(this._semanticType(a));
			if (!semantic && !this._NOTE_MARK.test(label)) continue;
			let first = this._firstText(a);
			if (!first || !index.starts.has(first)) continue;
			let pos = index.starts.get(first);
			let inside = pos >= span.start && pos < span.end;
			if (!inside && pos >= span.end && pos - span.end <= 3) {
				inside = /^[.,;:!?\u00bb\u201d\u2019"')\]]*$/.test(index.flat.slice(span.end, pos));
			}
			if (!inside) continue;
			label = label.replace(/^[[(]\s*/, "").replace(/\s*[\])]?\.?$/, "") || label;
			out.push({ a, href, label });
		}
		return out;
	},

	async _noteTarget(book, entry, href) {
		let hash = href.indexOf("#");
		let file = href.slice(0, hash), frag = href.slice(hash + 1);
		try { frag = decodeURIComponent(frag); }
		catch (e) { /* identifiant brut */ }
		if (!frag) return null;
		let tEntry = file ? this._joinPath(entry, file) : entry;
		let tdoc = await this._epubDoc(book, tEntry);
		if (!tdoc) return null;
		let el = tdoc.getElementById(frag);
		if (!el) {
			for (let n of tdoc.getElementsByTagNameNS("*", "*")) {
				if (n.getAttribute("id") === frag || n.getAttribute("name") === frag) { el = n; break; }
			}
		}
		return el ? { doc: tdoc, el, entry: tEntry } : null;
	},

	_BLOCK: /^(p|div|li|aside|section|article|dd|dt|td|blockquote|footer|note)$/,

	// Bloc qui porte la note : la cible du lien est souvent une ancre vide
	// (« <a id="n4"/> ») posée au début du paragraphe de la note.
	_noteBlock(el) {
		let b = el;
		while (b && b.nodeType === 1 && !this._BLOCK.test(String(b.localName || "").toLowerCase())) {
			b = b.parentNode;
		}
		if (!b || b.nodeType !== 1) return null;
		// Un bloc qui ne contient que le numéro (« <div class="numero">1.</div> »)
		// n'est pas la note entière : on remonte d'un cran.
		let p = b.parentNode;
		if (this._squeeze(b.textContent).length < 6 && p && p.nodeType === 1
			&& this._BLOCK.test(String(p.localName || "").toLowerCase())) {
			b = p;
		}
		return b;
	},

	_escRe(s) {
		return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	},

	// Texte de la note, sans son numéro de tête.
	_noteText(block, label) {
		let s = String(block.textContent || "").replace(/\s+/g, " ").trim();
		if (label) {
			s = s.replace(new RegExp("^[[(]?\\s*" + this._escRe(label)
				+ "\\s*[\\])]?\\s*[.:)\\-\\u2013\\u2014]?\\s*", "i"), "");
		}
		return s;
	},

	// La cible est-elle bien une note, et pas une page de l'index ni un renvoi
	// interne ? Balisage sémantique d'abord, nom de la cible ensuite, et à
	// défaut une note qui commence par le même numéro que l'appel.
	_looksLikeNote(call, el, block) {
		if (/noteref/.test(this._semanticType(call.a))) return true;
		for (let n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentNode, i++) {
			if (/footnote|endnote|rearnote|\bnote\b/.test(this._semanticType(n))) return true;
			if (String(n.localName || "").toLowerCase() === "aside") return true;
			let names = (n.getAttribute("id") || "") + " " + (n.getAttribute("class") || "");
			if (/(^|[^a-z])(fn|ftn|notes?|nbp|ntb|ntf|endnotes?|footnotes?)([^a-z]|$)/i.test(names)) {
				return true;
			}
		}
		let head = String(block.textContent || "").replace(/\s+/g, " ").trim().slice(0, 16);
		return new RegExp("^[[(]?\\s*" + this._escRe(call.label) + "(?![0-9])", "i").test(head);
	},

	_IBID: /^(ibid|ibidem|idem|id)\b\.?/i,
	_OPCIT: /\b(op|art|loc)\.?\s*cit\b/i,

	// Notes qui précèdent celle-ci, de la plus proche à la plus lointaine.
	_previousNotes(block, max) {
		let out = [];
		for (let n = block.previousElementSibling; n && out.length < max; n = n.previousElementSibling) {
			let ln = String(n.localName || "").toLowerCase();
			if (/^h[1-6]$/.test(ln) || ln === "hr") break;
			if (this._squeeze(n.textContent).length > 6) out.push(n);
		}
		return out;
	},

	_leadingNumber(block) {
		let m = String(block.textContent || "").trim().match(/^[[(]?\s*(\d{1,4})/);
		return m ? m[1] : "";
	},

	// « Ibid. » et « op. cit. » ne nomment pas la source : on va la chercher
	// dans une note antérieure. Ibid. renvoie à la note qui précède (en
	// remontant une chaîne d'ibid.), op. cit. à la dernière note qui cite le
	// même auteur avec une année.
	_earlierSource(block, noteText) {
		let ibid = this._IBID.test(noteText);
		let opcit = !ibid && this._OPCIT.test(noteText);
		if (!ibid && !opcit) return null;

		if (ibid) {
			for (let prev of this._previousNotes(block, 4)) {
				let t = this._noteText(prev, this._leadingNumber(prev));
				if (!this._IBID.test(t)) return { block: prev, text: t };
			}
			return null;
		}

		// Auteurs possibles : les mots à majuscule de la citation qui précède
		// « op. cit. », hors formules d'introduction (« Cité in Duckworth A. »).
		let cut = noteText.search(this._OPCIT);
		let segment = noteText.slice(0, cut).split(";").pop();
		let names = (segment.match(/\p{Lu}[\p{L}'\u2019-]{2,}/gu) || [])
			.filter(w => !/^(cit[ée]e?s?|voir|cf|in|dans|chez|selon|see|quoted|cited|ibid|idem|trad|ed|op)$/i.test(w));
		if (!names.length) return null;
		let doc = block.ownerDocument;
		let cls = block.getAttribute("class");
		let candidates = Array.from(doc.getElementsByTagNameNS("*", block.localName))
			.filter(n => n.getAttribute("class") === cls);
		let i = candidates.indexOf(block);
		for (let surname of names) {
			for (let j = i - 1, seen = 0; j >= 0 && seen < 300; j--, seen++) {
				let t = this._noteText(candidates[j], this._leadingNumber(candidates[j]));
				if (t.includes(surname) && /\b(1[5-9]|20)\d{2}\b/.test(t) && !this._OPCIT.test(t)) {
					return { block: candidates[j], text: t };
				}
			}
		}
		return null;
	},

	// Une note cite-t-elle un ouvrage ? Une référence porte une année de
	// parution, ou commence par un auteur sous sa forme bibliographique
	// (« Rosenfeld M. J., … », « D. Riesman, … », éventuellement après
	// « Cité in » ou « Voir »). Une remarque, une précision du traducteur ou
	// un renvoi interne (« cf. infra ») n'a ni l'un ni l'autre.
	_citesWork(note) {
		let s = String(note || "").trim();
		if (/^(n\.\s?d\.\s?[teé]\.?|note d[eu'\u2019]|en (fran[cç]ais|anglais|allemand|italien|espagnol|latin|grec)\b)/i.test(s)) {
			return false;
		}
		if (/(^|[^\d])(1[5-9]\d{2}|20\d{2})(?!\d)/.test(s)) return true;
		let lead = s.replace(/^(cit[ée]e?s?\s+(in|par|dans|chez)|voir( aussi)?|see( also)?|cf\.?)\s+/i, "");
		return /^(\p{Lu}[\p{L}'\u2019-]{2,},?\s+(\p{Lu}\.\s*-?){1,3}[,\s]|(\p{Lu}\.\s*-?){1,3}\s*\p{Lu}[\p{L}'\u2019-]{2,}\s*[,(])/u.test(lead);
	},

	// Notes appelées dans un passage surligné d'un EPUB : [{ marker, entry }].
	async getEPUBFootnoteReferences(item, text) {
		try {
			let att = item.parentItem;
			if (!this.isEPUBAttachment(att)) return [];
			let book = await this._openEPUB(att);
			if (!book || !book.spine.length) return [];

			// Chapitre visé par la CFI (« epubcfi(/6/18!… » = 9e entrée du spine),
			// puis tous les autres si le passage n'y est pas.
			let pos = item.annotationPosition;
			if (typeof pos === "string") pos = JSON.parse(pos);
			let m = String((pos && pos.value) || "").match(/^epubcfi\(\/6\/(\d+)/);
			let first = m ? parseInt(m[1], 10) / 2 - 1 : -1;
			let order = book.spine.filter(Boolean);
			if (first >= 0 && book.spine[first]) {
				order = [book.spine[first]].concat(order.filter(e => e !== book.spine[first]));
			}

			let doc = null, entry = null, index = null, span = null;
			for (let e of order) {
				let d = await this._epubDoc(book, e);
				if (!d) continue;
				let ix = this._textIndex(d);
				let sp = this._findPassage(ix, text);
				if (sp) { doc = d; entry = e; index = ix; span = sp; break; }
			}
			if (!doc) {
				log("EPUB : passage introuvable dans le livre, notes ignorées");
				return [];
			}

			let max = parseInt(getPref("maxRefs", 8), 10) || 8;
			let out = [], seen = new Set();
			for (let call of this._noteCallsIn(doc, index, span)) {
				if (out.length >= max) break;
				let target = await this._noteTarget(book, entry, call.href);
				if (!target) continue;
				let block = this._noteBlock(target.el);
				if (!block || !this._looksLikeNote(call, target.el, block)) continue;
				let key = target.entry + "#" + call.href.split("#")[1];
				if (seen.has(key)) continue;
				seen.add(key);

				let note = this._noteText(block, call.label);
				if (note.length < 3) continue;
				let earlier = this._earlierSource(block, note);

				// Beaucoup de livres mêlent dans leurs notes les références et les
				// remarques de l'auteur (« Je reviendrai plus loin sur cette
				// question. Cf. infra… »). Une remarque ne cite aucun ouvrage :
				// transmise, elle poussait le modèle à citer le livre lu lui-même.
				// Sans année ni note antérieure qui nomme la source, on l'écarte.
				if (!earlier && !this._citesWork(note)) {
					log("EPUB : note " + call.label + " sans ouvrage cité (remarque), écartée");
					continue;
				}
				out.push({ marker: "[note " + call.label + "]", entry: this._trimEntry(note, 600) });

				if (earlier && out.length < max) {
					let n = this._leadingNumber(earlier.block);
					out.push({
						marker: "[note " + (n || "?") + ", the source note " + call.label + " refers to]",
						entry: this._trimEntry(earlier.text, 600)
					});
				}
			}
			if (out.length) log("EPUB : notes résolues par lien : " + out.length);
			return out;
		}
		catch (e) {
			log("getEPUBFootnoteReferences: " + e);
			return [];
		}
	},

	// Socle commun : liens internes du PDF d'abord (déterministe, même principe
	// que le popup de Zotero), analyse du texte en repli.
	// Renvoie [{ marker, entry }] — le prompt et l'index partagent ce résultat.
	async collectReferencesStructured(item, text) {
		if (!getPref("resolveCitations", true)) return [];
		try {
			let max = parseInt(getPref("maxRefs", 8), 10) || 8;

			// EPUB : la source passe le plus souvent par une note de bas de
			// page, dont l'appel est un simple numéro en exposant que la
			// détection textuelle ci-dessous ne reconnaît pas.
			if (this.isEPUBAttachment(item.parentItem)) {
				let notes = await this.getEPUBFootnoteReferences(item, text);
				if (notes.length) return notes.slice(0, max);
			}

			let markers = this.detectCitationMarkers(text);

			// Aucun appel de citation dans le passage : il n'y a rien à résoudre.
			// Ce contrôle purement textuel est immédiat, alors que la suite ouvre
			// le PDF et parcourt ses liens — plusieurs secondes sur un gros
			// document. La grande majorité des passages ne cite personne.
			if (!markers.numbers.length && !markers.authorYears.length) {
				log("aucun appel de citation dans le passage : références ignorées");
				return [];
			}

			// 1. Voie sûre : suivre les liens du PDF.
			let linked = await this.getLinkedReferences(item);
			if (linked.length) {
				// Si le nombre d'appels numériques correspond exactement, les
				// apparier dans l'ordre pour conserver « [1] », « [2] ».
				let nums = markers.numbers;
				let pair = (nums.length === linked.length);
				return linked.slice(0, max).map((entry, i) => ({
					marker: pair ? "[" + nums[i] + "]" : "",
					entry
				}));
			}

			// 2. Repli : chercher les appels détectés dans la bibliographie.
			let fullText = await this.getAttachmentFullText(item);
			if (!fullText) return [];
			let bib = this.findBibliographySection(fullText);
			if (!bib) return [];

			return this.resolveNumericRefsStructured(bib, markers.numbers)
				.concat(this.resolveAuthorYearRefsStructured(bib, markers.authorYears))
				.slice(0, max);
		}
		catch (e) {
			log("collectReferencesStructured: " + e);
			return [];
		}
	},

	// Version texte, transmise à l'IA via {{references}}.
	async getReferences(item, text) {
		let refs = await this.collectReferencesStructured(item, text);
		return refs.map(r => r.marker ? r.marker + " " + r.entry : r.entry).join("\n");
	},

	// Bloc de contexte lisible, transmis à l'IA en mode standard.
	formatContextBlock(vars) {
		let lines = [];
		if (vars.title) lines.push("Title: " + vars.title);
		if (vars.authors) lines.push("Authors: " + vars.authors);
		if (vars.year) lines.push("Year: " + vars.year);
		if (vars.publication) lines.push("Publication: " + vars.publication);
		// Libellé explicite : présentée seule, cette page était recopiée par le
		// modèle comme page citée dans le champ référence.
		if (vars.page) {
			lines.push("Passage page: " + vars.page + " (where the passage sits in the"
				+ " document being read; never a cited page, never use it in a reference)");
		}
		if (vars.abstract) lines.push("Document abstract: " + vars.abstract);
		let block = lines.length ? "Document context:\n" + lines.join("\n") : "";
		if (vars.references) {
			// Notes de bas de page (EPUB) : l'appel est un numéro collé au texte,
			// que le modèle ne reconnaîtrait pas seul comme une citation.
			let header = /^\[note /m.test(vars.references)
				? "Works cited in the passage, through footnotes. A footnote call is a"
					+ " number glued to a word or punctuation mark of the passage"
					+ " (\"bref9.\" calls [note 9]); each note below is the one the passage"
					+ " calls, quoted as printed. Take the cited author, year and page"
					+ " from the note. A note may be a mere remark by the author or a"
					+ " cross-reference to another part of the book (\"cf. infra\","
					+ " \"see chapter 3\"): it cites no work, so it gives no reference."
					+ " Never cite the document being read itself as a source:\n"
				: "Works cited in the passage (resolved from this article's reference list):\n";
			block += (block ? "\n\n" : "") + header + vars.references;
		}
		return block;
	},

	// Remplace {{variable}} par sa valeur (chaîne vide si inconnue).
	substitute(tpl, vars) {
		return String(tpl).replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) =>
			(Object.prototype.hasOwnProperty.call(vars, key) && vars[key] != null)
				? String(vars[key]) : "");
	},

	// Construit le prompt à envoyer : { system, user }.
	// - Mode avancé (le prompt contient {{text}} ou {{comment}}) : tout est mis
	//   dans le message utilisateur, l'utilisateur contrôle la structure.
	// - Mode standard : le prompt sert d'instructions (system), le passage (et
	//   le contexte du document si activé) est ajouté comme message utilisateur.
	// Variables disponibles dans le prompt ET dans le gabarit de sortie.
	buildVars({ text, ctx, comment, fields }) {
		let vars = {
			text: text || "",
			comment: comment || "",
			title: (ctx && ctx.title) || "",
			authors: (ctx && ctx.authors) || "",
			year: (ctx && ctx.year) || "",
			abstract: (ctx && ctx.abstract) || "",
			publication: (ctx && ctx.publication) || "",
			page: (ctx && ctx.page) || "",
			references: (ctx && ctx.references) || "",
			maxWords: parseInt(getPref("maxWords", 80), 10) || 80,
			language: String(getPref("language", "français")).trim() || "français"
		};
		// Champs saisis à la main : n'écrasent jamais une variable intégrée.
		if (fields) {
			for (let k of Object.keys(fields)) {
				if (!this.RESERVED_VARS.includes(k)) vars[k] = fields[k];
			}
		}
		return vars;
	},

	buildPrompt({ text, ctx, color, comment, fields, promptOverride }) {
		let tpl = promptOverride || this.getPromptForColor(color);
		let vars = this.buildVars({ text, ctx, comment, fields });

		let selfContained = /\{\{\s*(text|comment)\s*\}\}/.test(tpl);
		if (selfContained) {
			return { system: "", user: this.substitute(tpl, vars) };
		}

		let parts = [];
		if (getPref("sendContext", true)) {
			let block = this.formatContextBlock(vars);
			if (block) parts.push(block);
		}
		if (comment && String(comment).trim()) {
			parts.push("Existing note:\n\"\"\"\n" + comment + "\n\"\"\"");
		}
		parts.push((this.isImageKey(color)
			? "Text found inside the selected area of the page (figure, table or excerpt; layout lost):"
			: "Highlighted passage:") + "\n\"\"\"\n" + text + "\n\"\"\"");

		return { system: this.substitute(tpl, vars), user: parts.join("\n\n") };
	},

	// Consigne ajoutée au prompt de la couleur pour que la réponse épouse
	// EXACTEMENT les champs déclarés : le modèle ne rédige pas un commentaire
	// libre, il renseigne les champs restés vides, un par ligne. C'est ce qui
	// rend le prompt dépendant des champs définis plus haut.
	buildFieldInstruction(toFill, schema, values) {
		let lines = [
			"",
			"Fill in the fields listed below, and nothing else. Answer with one"
				+ " line per field, in the form `name: value`, using exactly these"
				+ " names. No preamble, no bullet points, no extra field.",
			""
		];
		for (let f of toFill) {
			let d = "- " + f.name + " (" + f.label + ")";
			if (f.type === "select" && f.options.length) {
				d += " — choose exactly one of: " + f.options.join(", ");
			}
			else if (f.type === "check") d += " — answer true or false";
			else if (f.type === "textarea") d += " — may span several lines";
			lines.push(d);
		}
		// Ce que l'utilisateur a déjà écrit sert de contexte, jamais de cible :
		// sa saisie ne doit pas être réécrite.
		let given = schema.filter(f => !toFill.includes(f)
			&& String((values && values[f.name]) || "").trim());
		if (given.length) {
			lines.push("", "The user already filled in these fields. Do not repeat"
				+ " them and do not rewrite them — use them as context:");
			for (let f of given) {
				lines.push("- " + f.name + " (" + f.label + "): " + values[f.name]);
			}
		}
		return lines.join("\n");
	},

	// Variante JSON de la consigne : mêmes règles, format imposé par le
	// fournisseur plutôt que demandé en toutes lettres.
	buildFieldInstructionJSON(toFill, schema, values) {
		let lines = [
			"",
			"Answer with a single JSON object, and nothing else. One key per field"
				+ " listed below, using exactly these names, with string values"
				+ " (use \"\" for a field you cannot fill).",
			""
		];
		for (let f of toFill) {
			let d = "- " + f.name + " (" + f.label + ")";
			if (f.type === "select" && f.options.length) {
				d += " — one of: " + f.options.join(", ");
			}
			else if (f.type === "check") d += " — \"true\" or \"\"";
			lines.push(d);
		}
		let given = schema.filter(f => !toFill.includes(f)
			&& String((values && values[f.name]) || "").trim());
		if (given.length) {
			lines.push("", "Already filled in by the user. Do not include these keys,"
				+ " do not rewrite them — use them as context:");
			for (let f of given) {
				lines.push("- " + f.name + " (" + f.label + "): " + values[f.name]);
			}
		}
		return lines.join("\n");
	},

	// Relit une réponse JSON. Renvoie null si ce n'en est pas — l'appelant
	// retombe alors sur parseFieldReply, qui n'exige aucun format.
	parseJSONReply(reply, toFill) {
		let raw = String(reply || "").trim();
		// Les modèles enrobent volontiers leur JSON dans un bloc de code.
		let fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
		if (fence) raw = fence[1].trim();
		// … ou l'accompagnent d'une phrase : on isole le premier objet complet.
		let first = raw.indexOf("{"), last = raw.lastIndexOf("}");
		if (first === -1 || last <= first) return null;
		raw = raw.slice(first, last + 1);

		let obj;
		try { obj = JSON.parse(raw); }
		catch (e) { return null; }
		if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

		let byName = {};
		for (let f of toFill) byName[f.name] = f;
		let out = {}, seen = 0;
		for (let k of Object.keys(obj)) {
			if (!byName[k]) continue;              // clé inventée : ignorée
			let v = obj[k];
			if (v === null || v === undefined) v = "";
			if (typeof v === "boolean") v = v ? "true" : "";
			else if (Array.isArray(v)) v = v.filter(x => x != null).join(", ");
			else if (typeof v === "object") continue;
			// Le JSON n'est pas passé par sanitize : le Markdown y survit.
			v = this.unwrapWholeTag(this.demarkdown(String(v)).trim());
			if (byName[k].type === "check") v = /^(true|yes|oui|1|x)$/i.test(v) ? "true" : "";
			out[k] = v;
			seen++;
		}
		return seen ? out : null;
	},

	// Relit une réponse « nom: valeur ». Tolère les puces, le gras Markdown et
	// les valeurs sur plusieurs lignes (une ligne sans marqueur prolonge le
	// champ courant). Seuls les champs demandés sont retenus.
	parseFieldReply(reply, toFill) {
		let names = toFill.map(f => f.name);
		let byName = {};
		for (let f of toFill) byName[f.name] = f;

		let out = {}, current = null;
		for (let raw of String(reply || "").split("\n")) {
			let m = raw.match(/^\s*(?:[-*]\s*)?\**\s*(\w+)\s*\**\s*:\s*(.*)$/);
			if (m && names.includes(m[1])) {
				current = m[1];
				out[current] = m[2].trim();
				continue;
			}
			if (current !== null && raw.trim()) {
				out[current] += (out[current] ? "\n" : "") + raw.trim();
			}
		}

		// Un seul champ demandé et aucun marqueur reconnu : toute la réponse
		// lui revient, plutôt que de perdre une réponse parfaitement utilisable.
		if (!Object.keys(out).length && names.length === 1) {
			out[names[0]] = String(reply || "").trim();
		}

		for (let k of Object.keys(out)) {
			let v = this.unwrapWholeTag(out[k].trim())
				.replace(/^["«»\s]+|["«»\s]+$/g, "");
			if (byName[k].type === "check") {
				v = /^(true|yes|oui|1|x)$/i.test(v) ? "true" : "";
			}
			out[k] = v;
		}
		return out;
	},

	// Une clé absente ou refusée ne se répare pas en réessayant : inutile de
	// faire attendre trois fois pour la même réponse.
	_worthRetrying(e) {
		// Clé absente ou refusée, modèle inexistant, requête invalide : la
		// réponse sera identique au second essai.
		let st = (e && typeof e.status === "number") ? e.status : 0;
		if ([400, 401, 403, 404].includes(st)) return false;
		// Fournisseurs sans statut (CLI, Apple) : il ne reste que le libellé.
		let m = String((e && e.message) || e || "");
		return !/api key|unauthorized|forbidden|not found|introuvable/i.test(m);
	},

	// Les fournisseurs HTTP acceptent response_format ; le CLI et Apple n'ont
	// pas d'équivalent, on y reste sur la lecture « nom: valeur ».
	supportsJSON() {
		let p = this.provider();
		return (p === "openai" || p === "ollama") && getPref("structuredOutput", true);
	},

	async generateComment({ text, ctx, color, comment, fields, promptOverride, json }) {
		let prompt = this.buildPrompt({ text, ctx, color, comment, fields, promptOverride });
		return this.complete(prompt, { json: !!json });
	},

	// Appel générique à un fournisseur, avec reprise. Options :
	//   provider  impose un fournisseur (sinon celui des réglages)
	//   json      demande une sortie structurée (HTTP seulement)
	//   raw       rend le texte tel quel, sans conversion du Markdown : la
	//             discussion fait son propre rendu
	//   timeout   délai en ms (les longs contextes de la discussion en ont besoin)
	//   model     impose un modèle (la discussion peut en employer un autre)
	//   cancel    jeton de makeCancelToken() : le bouton « Stop » de la discussion
	// Le prompt peut porter, outre { system, user }, un `context` (document,
	// sources) et un `history` ([{ role, content }]) : la discussion s'en sert,
	// les annotations non.
	async complete(prompt, opts = {}) {
		let p = this.provider(opts.provider);
		let call = () => {
			if (p === "cli") return this.callCLI(prompt, opts);
			if (p === "apple") return this.callApple(prompt, opts);
			return this.callOpenAI(prompt, Object.assign({}, opts, { provider: p }));
		};

		// Une coupure réseau ou un modèle qui bafouille ne doivent pas coûter
		// l'annotation : on retente avant de renoncer.
		let tries = parseInt(getPref("retries", 1), 10);
		if (isNaN(tries) || tries < 0) tries = 1;
		let last;
		let stopped = () => !!(opts.cancel && opts.cancel.cancelled);
		for (let i = 0; i <= tries; i++) {
			try { return await call(); }
			catch (e) {
				last = e;
				// Arrêt demandé : ni nouvel essai, ni message d'erreur du
				// fournisseur (un process tué n'a rien d'une panne).
				if (stopped()) {
					let err = new Error("Stopped");
					err.cancelled = true;
					throw err;
				}
				if (i === tries || !this._worthRetrying(e)) break;
				log("échec de génération, nouvel essai (" + (i + 1) + "/" + tries + ") : " + e);
			}
		}
		throw last;
	},

	// Jeton d'annulation : cancel() exécute les rappels enregistrés (tuer le
	// process, abandonner la requête HTTP). Un rappel enregistré après coup
	// s'exécute aussitôt.
	makeCancelToken() {
		return {
			cancelled: false,
			hooks: [],
			onCancel(fn) {
				if (this.cancelled) { try { fn(); } catch (e) {} return; }
				this.hooks.push(fn);
			},
			cancel() {
				if (this.cancelled) return;
				this.cancelled = true;
				for (let fn of this.hooks) { try { fn(); } catch (e) {} }
				this.hooks = [];
			}
		};
	},

	// Fournisseurs sans notion de messages (CLI, Apple) : le contexte et
	// l'historique de la discussion précèdent la question dans l'entrée
	// standard. Pour une annotation, il ne reste que `user`, inchangé.
	flattenPrompt({ user, context, history }) {
		let turns = Array.isArray(history) ? history : [];
		if (!context && !turns.length) return user;
		let parts = [];
		if (context) parts.push(context);
		if (turns.length) {
			parts.push("Conversation so far:\n\n" + turns.map(m =>
				(m.role === "assistant" ? "Assistant: " : "User: ") + m.content).join("\n\n"));
			parts.push("User's new message:\n" + user);
		}
		else parts.push(user);
		return parts.join("\n\n---\n\n");
	},

	// Rend le gabarit de sortie. Une ligne dont TOUTES les variables sont vides
	// est supprimée : sans cela, une référence non résolue laisserait une ligne
	// orpheline du type « <i></i> » dans le commentaire.
	renderTemplate(tpl, vars) {
		let out = [];
		for (let line of String(tpl).split("\n")) {
			let names = [];
			line.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, n) => { names.push(n); return m; });
			if (names.length) {
				let allEmpty = names.every(
					n => !(vars[n] != null && String(vars[n]).trim()));
				if (allEmpty) continue;
			}
			out.push(this.substitute(line, vars));
		}
		return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
	},

	// Retire d'une liste de citations « (A, 1999 ; B, 2001) » celles qui
	// désignent le document lu (son premier auteur et son année) : quand le
	// passage ne cite rien d'identifiable, le modèle se rabat parfois sur
	// « (Lahire, 2026) » en lisant un livre de Lahire paru en 2026. Seule une
	// valeur faite uniquement de citations est touchée.
	stripSelfCitations(value, ctx) {
		let s = String(value || "");
		let year = ctx && String(ctx.year || "");
		let first = ctx && String(ctx.authors || "").split(",")[0];
		if (!year || !first || !first.trim()) return s;
		let norm = x => String(x).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
			.toLowerCase().trim();
		let m = s.trim().match(/^\(([^()]+)\)\.?$/);
		if (!m) return s;
		let parts = m[1].split(/\s*;\s*/).filter(Boolean);
		let kept = parts.filter(p => {
			let y = p.match(/(^|[^\d])(\d{4})[a-z]?(?!\d)/);
			if (!y || y[2] !== year) return true;
			let who = norm(p.split(",")[0]).split(/\s+/)[0];
			return who !== norm(first).split(/\s+/)[0];
		});
		if (kept.length === parts.length) return s;
		log("citation du document lu retirée : " + s.trim());
		return kept.length ? "(" + kept.join(" ; ") + ")" : "";
	},

	// Produit le commentaire final d'une annotation : réponse de l'IA seule, ou
	// gabarit mêlant cette réponse ({{ai}}) et des entrées déterministes.
	// Renvoie null si la couleur n'a rien à produire.
	// out (facultatif) reçoit les valeurs finales des champs et les références
	// résolues : la carte d'annotation du lecteur les réaffiche (card-fields.js).
	async buildComment({ text, ctx, color, comment, fields, getRefs, out }) {
		let entry = this.getColorEntry(color);
		if (!entry) return null;

		ctx = ctx || {};
		let schema = this.parseFieldSchema(entry.fields);
		let values = Object.assign({}, fields || {});

		// 0. Références citées : leur résolution ouvre le PDF et parcourt ses
		//    liens internes, soit plusieurs secondes sur un gros document. On ne
		//    la déclenche donc que si quelque chose s'en sert réellement — un
		//    commentaire monté à la main n'a rien à attendre.
		let t0 = Date.now(), tRefs = 0, tAI = 0;
		if (getRefs && !ctx.references) {
			let tplWantsRefs = /\{\{\s*references\s*\}\}/.test(this.effectiveTemplate(entry));
			let promptWantsRefs = this.willCallProvider(entry, values);
			if (tplWantsRefs || promptWantsRefs) {
				let t = Date.now();
				ctx.references = await getRefs();
				tRefs = Date.now() - t;
			}
		}

		// 1. Champs de type « ai » : chacun a sa propre consigne et ne concerne
		//    que lui. Les champs saisis à la main sont déjà disponibles pour
		//    servir de contexte à ces consignes.
		for (let f of schema) {
			if (f.type !== "ai" || !f.prompt.trim()) continue;
			if (String(values[f.name] || "").trim()) continue;
			try {
				let t = Date.now();
				values[f.name] = await this.generateComment({
					text, ctx, color, comment, fields: values, promptOverride: f.prompt
				});
				tAI += Date.now() - t;
			}
			catch (e) {
				log("champ IA « " + f.name + " » : " + e);
				values[f.name] = "";
			}
		}

		// 2. Le prompt de la couleur renseigne les champs restés vides — et eux
		//    seuls. C'est le lien entre les deux réglages : la réponse est
		//    contrainte aux champs déclarés, pas un commentaire libre. Ce que
		//    vous avez tapé à la main n'est jamais réécrit ; si vous avez tout
		//    rempli, aucun appel n'est fait.
		if (this.entryFillsFields(entry)) {
			let toFill = this.fieldsToFill(schema, values);
			if (toFill.length) {
				try {
					let t = Date.now();
					let json = this.supportsJSON();
					let reply = await this.generateComment({
						text, ctx, color, comment, fields: values, json,
						promptOverride: entry.prompt + "\n" + (json
							? this.buildFieldInstructionJSON(toFill, schema, values)
							: this.buildFieldInstruction(toFill, schema, values))
					});
					tAI += Date.now() - t;
					// Le JSON demandé n'est pas garanti : un petit modèle local
					// répond parfois en texte. On relit alors comme avant plutôt
					// que de perdre la réponse.
					let parsed = json ? this.parseJSONReply(reply, toFill) : null;
					if (!parsed) {
						if (json) log("réponse non-JSON : relecture « nom: valeur »");
						parsed = this.parseFieldReply(reply, toFill);
					}
					// Faute de source, le modèle cite parfois le document lu
					// lui-même : jamais une référence secondaire.
					for (let f of toFill) {
						if (typeof parsed[f.name] === "string") {
							parsed[f.name] = this.stripSelfCitations(parsed[f.name], ctx);
						}
					}
					Object.assign(values, parsed);
				}
				catch (e) {
					log("remplissage des champs par l'IA : " + e);
					throw e;
				}
			}
		}

		// 3. Réponse d'IA pour le commentaire ENTIER : uniquement si la
		//    disposition la réclame ({{ai}}) ou s'il n'y a ni champs ni gabarit.
		//    Une couleur dotée de champs se passe donc du modèle par défaut,
		//    même si un prompt est encore renseigné.
		let ai = "";
		if (this.entryNeedsAI(entry)) {
			if (!entry.prompt.trim()) return null;   // rien à demander au modèle
			let t = Date.now();
			ai = await this.generateComment({ text, ctx, color, comment, fields: values });
			tAI += Date.now() - t;
		}

		// Publié pour le relevé de handleItem : « refs » = ouverture du PDF et
		// résolution des citations, « ia » = attente du modèle.
		this._timings = { refs: tRefs, ai: tAI, build: Date.now() - t0 };

		if (out) {
			out.values = values;
			out.refs = ctx.references || "";
		}

		let tpl = this.effectiveTemplate(entry);
		if (!tpl) return ai;

		let vars = this.buildVars({ text, ctx, comment, fields: values });
		vars.ai = ai;
		return this.renderTemplate(tpl, vars);
	},

	// ---- Apple Intelligence (modèle embarqué de macOS) ----
	//
	// macOS 26+ expose le modèle Apple Intelligence via le framework
	// FoundationModels, accessible uniquement depuis du code Swift : il n'existe
	// ni endpoint HTTP ni CLI fourni. Annota écrit donc un petit programme Swift,
	// le compile UNE FOIS (~1 s) dans le répertoire de données Zotero, puis
	// réutilise le binaire (~1-2 s par appel). Tout reste sur la machine.
	APPLE_SWIFT_SOURCE: [
		"import Foundation",
		"import FoundationModels",
		"",
		"let instructions = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : \"\"",
		"let prompt = String(data: FileHandle.standardInput.readDataToEndOfFile(), encoding: .utf8) ?? \"\"",
		"",
		"guard case .available = SystemLanguageModel.default.availability else {",
		"    FileHandle.standardError.write(\"Apple Intelligence unavailable on this Mac\\n\".data(using: .utf8)!)",
		"    exit(2)",
		"}",
		"",
		"let sem = DispatchSemaphore(value: 0)",
		"var out = \"\", err = \"\"",
		"Task {",
		"    do {",
		"        let session = instructions.isEmpty",
		"            ? LanguageModelSession()",
		"            : LanguageModelSession(instructions: instructions)",
		"        let r = try await session.respond(to: prompt)",
		"        out = r.content",
		"    } catch {",
		"        err = \"\\(error)\"",
		"    }",
		"    sem.signal()",
		"}",
		"sem.wait()",
		"if !err.isEmpty {",
		"    FileHandle.standardError.write((err + \"\\n\").data(using: .utf8)!)",
		"    exit(1)",
		"}",
		"print(out)"
	].join("\n"),

	// Répertoire où déposer la source et le binaire.
	_appleDir() {
		try {
			if (Zotero.DataDirectory && Zotero.DataDirectory.dir) return Zotero.DataDirectory.dir;
		}
		catch (e) { /* ignore */ }
		return Zotero.getTempDirectory().path;
	},

	// Compile le binaire si nécessaire, renvoie son chemin.
	async ensureAppleBinary(Subprocess) {
		let custom = String(getPref("applePath", "")).trim();
		if (custom) return custom;

		let dir = this._appleDir();
		let bin = PathUtils.join(dir, "annota-apple-ai");
		if (await IOUtils.exists(bin)) return bin;

		let srcPath = PathUtils.join(dir, "annota-apple-ai.swift");
		await IOUtils.writeUTF8(srcPath, this.APPLE_SWIFT_SOURCE);

		let swiftc = String(getPref("swiftcPath", "/usr/bin/swiftc")).trim() || "/usr/bin/swiftc";
		let proc;
		try {
			proc = await Subprocess.call({
				command: swiftc,
				arguments: ["-O", "-o", bin, srcPath],
				stderr: "pipe"
			});
		}
		catch (e) {
			throw new Error("swiftc introuvable (" + swiftc + ") — installez les "
				+ "Xcode Command Line Tools : xcode-select --install");
		}
		let errText = "", c;
		while ((c = await proc.stderr.readString()) !== "") errText += c;
		let { exitCode } = await proc.wait();
		if (exitCode !== 0 || !(await IOUtils.exists(bin))) {
			throw new Error("Compilation Swift échouée : "
				+ (errText.trim() || "code " + exitCode).slice(0, 300));
		}
		log("Binaire Apple Intelligence compilé : " + bin);
		return bin;
	},

	async callApple(prompt, opts = {}) {
		let { system } = prompt;
		let Subprocess;
		try {
			({ Subprocess } = ChromeUtils.importESModule(
				"resource://gre/modules/Subprocess.sys.mjs"));
		}
		catch (e) {
			throw new Error("Subprocess indisponible : " + (e.message || e));
		}

		let bin = await this.ensureAppleBinary(Subprocess);
		let proc = await Subprocess.call({
			command: bin,
			arguments: system ? [system] : [],
			stderr: "pipe"
		});

		let killTimer = setTimeout(() => { try { proc.kill(); } catch (e) {} },
			opts.timeout || 120000);
		if (opts.cancel) opts.cancel.onCancel(() => { try { proc.kill(); } catch (e) {} });
		try {
			await proc.stdin.write(this.flattenPrompt(prompt));
			await proc.stdin.close();

			let out = "", chunk;
			while ((chunk = await proc.stdout.readString()) !== "") out += chunk;
			let errText = "", ce;
			while ((ce = await proc.stderr.readString()) !== "") errText += ce;

			let { exitCode } = await proc.wait();
			if (exitCode !== 0) {
				throw new Error("Apple Intelligence (code " + exitCode + ") : "
					+ (errText.trim() || "pas de détail").slice(0, 300));
			}
			if (!out.trim()) throw new Error("Réponse vide d'Apple Intelligence");
			return opts.raw ? out.trim() : this.sanitize(out);
		}
		finally {
			clearTimeout(killTimer);
		}
	},

	// ---- Claude Code CLI : emplacement, modèles, niveaux d'effort ----
	//
	// Le CLI ne liste pas les modèles d'un compte ; son aide, en revanche,
	// annonce les alias qu'il accepte (« 'fable', 'opus', or 'sonnet' ») et les
	// niveaux d'effort (« (low, medium, high, xhigh, max) »). On la lit plutôt
	// que de figer ces listes : elles suivent ainsi la version installée.

	_cliResolved: new Map(),
	_cliNoEffort: false,

	// Emplacements habituels, pour retrouver `claude` quand Zotero ne voit
	// pas le PATH du terminal.
	cliCandidates() {
		let home = "";
		try { home = Services.dirsvc.get("Home", Ci.nsIFile).path; } catch (e) {}
		let j = (...p) => home ? PathUtils.join(home, ...p) : "";
		return [
			j(".local", "bin", "claude"), j(".claude", "local", "claude"),
			"/opt/homebrew/bin/claude", "/usr/local/bin/claude", "/usr/bin/claude",
			j(".npm-global", "bin", "claude"), j(".volta", "bin", "claude"),
			j(".bun", "bin", "claude"), j("bin", "claude")
		].filter(Boolean);
	},

	// Chemin absolu de l'exécutable, ou "" s'il est introuvable.
	async resolveCLIPath(cmd) {
		cmd = String(cmd || "").trim() || "claude";
		if (this._cliResolved.has(cmd)) return this._cliResolved.get(cmd);
		let found = "";
		try {
			if (PathUtils.isAbsolute(cmd) && await IOUtils.exists(cmd)) found = cmd;
		}
		catch (e) {}
		if (!found) {
			try {
				let { Subprocess } = ChromeUtils.importESModule(
					"resource://gre/modules/Subprocess.sys.mjs");
				found = await Subprocess.pathSearch(cmd);
			}
			catch (e) { /* pas dans le PATH de Zotero */ }
		}
		if (!found) {
			for (let c of this.cliCandidates()) {
				try { if (await IOUtils.exists(c)) { found = c; break; } } catch (e) {}
			}
		}
		if (found) this._cliResolved.set(cmd, found);
		return found;
	},

	// Lit le bloc d'aide d'une option : sa ligne et les suivantes jusqu'à
	// l'option suivante.
	parseCLIHelp(text) {
		let lines = String(text || "").split("\n");
		let block = (flag) => {
			let re = new RegExp("^\\s*(?:-\\w,\\s*)?" + flag + "(?![\\w-])");
			let i = lines.findIndex(l => re.test(l));
			if (i < 0) return "";
			let out = [lines[i]];
			for (let k = i + 1; k < lines.length && !/^\s*-/.test(lines[k]) && lines[k].trim(); k++) {
				out.push(lines[k]);
			}
			return out.join(" ");
		};
		let models = [];
		block("--model").replace(/'([\w.\-\[\]]+)'/g, (m, n) => {
			if (!models.includes(n)) models.push(n);
			return m;
		});
		let eff = block("--effort");
		let efforts = [];
		let paren = eff.match(/\(([^)]*)\)/);
		if (paren) {
			efforts = paren[1].split(/[,|/]/).map(x => x.trim().toLowerCase())
				.filter(x => /^[a-z]+$/.test(x));
		}
		return { models, efforts, effort: !!eff };
	},

	// Interroge le CLI installé et mémorise ce qu'il annonce (préférence
	// cliCaps, relue par les réglages et la discussion).
	async probeCLI(pathOverride) {
		let { Subprocess } = ChromeUtils.importESModule(
			"resource://gre/modules/Subprocess.sys.mjs");
		let wanted = String(pathOverride || getPref("cliPath", "claude")).trim() || "claude";
		this._cliResolved.delete(wanted);
		let cmd = await this.resolveCLIPath(wanted);
		if (!cmd) {
			throw new Error(this.t("err.cli.notfound"));
		}
		let workdir;
		try { workdir = Zotero.getTempDirectory().path; } catch (e) { workdir = undefined; }
		let run = async (args) => {
			let proc = await Subprocess.call({ command: cmd, arguments: args, workdir,
				stderr: "stdout" });
			let timer = setTimeout(() => { try { proc.kill(); } catch (e) {} }, 15000);
			try {
				let out = "", c;
				while ((c = await proc.stdout.readString()) !== "") out += c;
				await proc.wait();
				return out;
			}
			finally { clearTimeout(timer); }
		};
		let version = (await run(["--version"])).trim();
		let caps = this.parseCLIHelp(await run(["--help"]));
		caps.version = (version.match(/\d+\.\d+\.\d+/) || [version.slice(0, 40)])[0];
		caps.path = cmd;
		caps.ts = Date.now();
		Zotero.Prefs.set(PREF_BRANCH + "cliCaps", JSON.stringify(caps));
		this._cliNoEffort = !caps.effort;
		return caps;
	},

	cliCaps() {
		try { return JSON.parse(String(getPref("cliCaps", "") || "")) || null; }
		catch (e) { return null; }
	},

	// Claude Code CLI local (`claude -p`). Utilise l'abonnement connecté du CLI,
	// pas l'API facturée au token. Aucune clé API : l'authentification est celle
	// de `claude` sur la machine. Lent (démarrage à froid par appel).
	async callCLI(prompt, opts = {}) {
		let { system } = prompt;
		let Subprocess;
		try {
			({ Subprocess } = ChromeUtils.importESModule(
				"resource://gre/modules/Subprocess.sys.mjs"));
		}
		catch (e) {
			throw new Error("Subprocess indisponible : " + (e.message || e));
		}

		let wanted = String(getPref("cliPath", "claude")).trim() || "claude";
		// Un nom nu (« claude ») est cherché dans le PATH puis aux emplacements
		// habituels : Zotero ne voit pas le PATH du terminal.
		let cmd = (await this.resolveCLIPath(wanted)) || wanted;
		let model = String(opts.model || getPref("cliModel", "")).trim();
		let effort = String(opts.effort !== undefined ? opts.effort
			: getPref("cliEffort", "")).trim();
		if (this._cliNoEffort) effort = "";
		let args = ["-p", "--output-format", "text"];
		if (model) args.push("--model", model);
		if (effort) args.push("--effort", effort);
		if (system) args.push("--append-system-prompt", system);

		// Répertoire de travail neutre : évite de charger un CLAUDE.md de projet.
		let workdir;
		try { workdir = Zotero.getTempDirectory().path; } catch (e) { workdir = undefined; }

		let proc;
		try {
			proc = await Subprocess.call({
				command: cmd,
				arguments: args,
				workdir,
				stderr: "pipe"
			});
		}
		catch (e) {
			throw new Error("Impossible de lancer le CLI « " + cmd + " » : " + (e.message || e));
		}

		// Garde-fou : tuer le process s'il dépasse le délai (ex. non connecté).
		let killTimer = setTimeout(() => { try { proc.kill(); } catch (e) {} },
			opts.timeout || 120000);
		if (opts.cancel) opts.cancel.onCancel(() => { try { proc.kill(); } catch (e) {} });
		try {
			// Le contexte passe par l'entrée standard, jamais par un argument :
			// un document entier dépasserait la taille maximale d'un argument.
			await proc.stdin.write(this.flattenPrompt(prompt));
			await proc.stdin.close();

			let out = "", chunk;
			while ((chunk = await proc.stdout.readString()) !== "") out += chunk;
			let errText = "", ce;
			while ((ce = await proc.stderr.readString()) !== "") errText += ce;

			let { exitCode } = await proc.wait();
			// CLI trop ancien pour --effort : on s'en passe plutôt que d'échouer.
			if (exitCode !== 0 && effort && /unknown option.*effort|effort.*unknown/i.test(errText)) {
				log("--effort refusé par ce CLI : appel sans niveau d'effort");
				this._cliNoEffort = true;
				clearTimeout(killTimer);
				return this.callCLI(prompt, Object.assign({}, opts, { effort: "" }));
			}
			if (exitCode !== 0) {
				throw new Error("CLI code " + exitCode + " : "
					+ (errText.trim() || "(pas de sortie d'erreur)").slice(0, 300));
			}
			if (!out.trim()) throw new Error("Réponse vide du CLI");
			return opts.raw ? out.trim() : this.sanitize(out);
		}
		finally {
			clearTimeout(killTimer);
		}
	},

	// Fournisseur compatible OpenAI (Mistral par défaut).
	async callOpenAI({ system, user, context, history }, opts = {}) {
		let cfg = this.chatConfig(opts.provider);
		if (cfg.requiresKey && !cfg.apiKey) throw new Error("API key missing");
		if (!cfg.endpoint) throw new Error("Endpoint not set");
		let temp = parseFloat(getPref("temperature", 0.2));
		if (isNaN(temp)) temp = 0.2;
		temp = Math.max(0, Math.min(2, temp));

		// Le contexte de la discussion (document, sources) rejoint les
		// consignes : il reste en tête quel que soit le nombre de tours.
		let messages = [];
		let sys = [system, context].filter(x => x && String(x).trim()).join("\n\n");
		if (sys) messages.push({ role: "system", content: sys });
		for (let m of (Array.isArray(history) ? history : [])) {
			messages.push({ role: m.role === "assistant" ? "assistant" : "user",
				content: String(m.content || "") });
		}
		messages.push({ role: "user", content: user });

		let headers = { "Content-Type": "application/json" };
		// Ollama ignore l'autorisation : on n'envoie l'en-tête que si une clé existe.
		if (cfg.apiKey) headers["Authorization"] = "Bearer " + cfg.apiKey;

		let payload = { model: opts.model || cfg.model, temperature: temp, messages,
			stream: false };
		// Sortie structurée : le modèle rend un objet JSON au lieu d'un texte
		// libre qu'il faut relire à la regex. Mistral et Ollama l'acceptent.
		if (opts.json) payload.response_format = { type: "json_object" };

		let resp = await this.httpJSON(cfg.endpoint, headers, payload,
			opts.provider, opts.timeout, opts.cancel);

		let data = resp.response;
		let content = data && data.choices && data.choices[0]
			&& data.choices[0].message && data.choices[0].message.content;
		if (!content) throw new Error("Empty API response");
		return opts.raw ? String(content).trim() : this.sanitize(content);
	},

	// POST JSON commun, avec message d'erreur lisible.
	async httpJSON(url, headers, payload, override, timeoutMs, cancel) {
		let prov = this.provider(override);
		// Un modèle local doit d'abord être chargé en mémoire : délai plus large.
		let timeout = timeoutMs || (prov === "ollama" ? 180000 : 45000);
		try {
			return await Zotero.HTTP.request("POST", url, {
				headers,
				body: JSON.stringify(payload),
				responseType: "json",
				timeout,
				// Zotero remet une fonction d'abandon : le « Stop » de la discussion.
				cancellerReceiver: cancel ? (fn => cancel.onCancel(fn)) : undefined
			});
		}
		catch (e) {
			let status = e && e.xmlhttp ? e.xmlhttp.status : "?";
			let raw = "";
			try { raw = e.xmlhttp ? e.xmlhttp.responseText : ""; } catch (e2) {}

			// Extraire le message de l'API plutôt que d'afficher le JSON brut :
			// « model 'llama3.1' not found » est autrement noyé dans l'objet.
			let msg = "";
			try {
				let d = JSON.parse(raw);
				msg = (d && d.error && (d.error.message || d.error))
					|| (d && d.message) || "";
				if (typeof msg !== "string") msg = JSON.stringify(msg);
			}
			catch (e2) { /* pas du JSON */ }
			if (!msg) msg = raw.slice(0, 200);

			// Aide ciblée sur les deux échecs Ollama les plus fréquents.
			if (prov === "ollama") {
				if (/not found/i.test(msg)) {
					msg += " — pick an installed model in Preferences → Annota "
						+ "(tags matter: « llama3.1:8b », not « llama3.1 »).";
				}
				else if (!status || status === 0) {
					msg = "Ollama unreachable — is it running? (" + msg + ")";
				}
			}
			// Le statut est porté par l'erreur : décider de réessayer sur le
			// libellé serait dépendre d'une chaîne de caractères, alors que
			// « 401 » est une donnée.
			let err = new Error("API (HTTP " + status + ") " + msg);
			err.status = (typeof status === "number") ? status : 0;
			throw err;
		}
	},

	// ---- Traitement a posteriori (menu contextuel) ----

	// Rassemble les annotations éligibles à partir d'une sélection : items
	// classiques, pièces jointes, ou annotations sélectionnées directement.
	async collectAnnotations(items) {
		let out = [];
		let seen = new Set();

		let push = (ann) => {
			if (ann && !seen.has(ann.id)) { seen.add(ann.id); out.push(ann); }
		};

		for (let item of items) {
			try {
				if (item.isAnnotation && item.isAnnotation()) { push(item); continue; }

				let attachments = [];
				if (item.isAttachment && item.isAttachment()) {
					attachments = [item];
				}
				else if (item.isRegularItem && item.isRegularItem()) {
					let ids = item.getAttachments();
					attachments = await Zotero.Items.getAsync(ids);
				}

				for (let att of attachments) {
					if (!att || !att.isFileAttachment || !att.isFileAttachment()) continue;
					for (let ann of att.getAnnotations()) push(ann);
				}
			}
			catch (e) {
				log("collectAnnotations: " + e);
			}
		}
		return out;
	},

	// Annotation traitable ? (type ciblé, texte non vide, bibliothèque modifiable)
	isEligible(ann, overwrite, failedOnly) {
		if (!ann || !ann.isAnnotation || !ann.isAnnotation()) return false;
		if (!this.targetTypes().includes(ann.annotationType)) return false;
		if (ann.library && ann.library.editable === false) return false;
		if (ann.annotationType !== "image" && !(ann.annotationText || "").trim()) return false;
		// « Rejouer les échecs » ne regarde que les annotations marquées, et les
		// reprend quel que soit leur commentaire — c'est bien un remplacement.
		if (failedOnly) return this.hasFailedTag(ann);
		if ((ann.annotationComment || "").trim() && !overwrite) return false;
		return true;
	},

	// Lance la génération sur la sélection courante de la fenêtre.
	// Volontairement indépendant de la préférence « enabled » : l'action est explicite.
	async runBatch(window, opts = {}) {
		let overwrite = !!opts.overwrite;

		let notReady = this.providerReadyError();
		if (notReady) {
			toast("Annota", notReady, "error");
			return;
		}

		let selected;
		try {
			selected = window.ZoteroPane.getSelectedItems();
		}
		catch (e) {
			log("runBatch: sélection illisible : " + e);
			return;
		}
		if (!selected || !selected.length) return;

		let all = await this.collectAnnotations(selected);
		return this.processAnnotations(all, opts);
	},

	// Traitement commun : bibliothèque (menu contextuel) et lecteur (annotation
	// ciblée). `all` = annotations candidates, déjà collectées.
	async processAnnotations(all, opts = {}) {
		let overwrite = !!opts.overwrite || !!opts.failedOnly;
		let eligible = all.filter(a => this.isEligible(a, overwrite, opts.failedOnly));

		// Les couleurs sans prompt sont ignorées : on les compte à part pour
		// pouvoir l'expliquer, sinon l'absence de résultat serait incompréhensible.
		let targets = [];
		let noPrompt = 0;
		for (let a of eligible) {
			// getColorEntry, pas getPromptForColor : une couleur peut être active
			// avec un gabarit ou des champs seuls (commentaire déterministe).
			if (this.getColorEntry(this.keyForItem(a))) targets.push(a);
			else noPrompt++;
		}

		if (!targets.length) {
			let why;
			if (noPrompt) why = this.t("batch.skipped", { n: noPrompt });
			else if (opts.failedOnly) why = this.t("batch.noretry");
			else if (all.length) why = this.t("batch.nothing");
			else why = this.t("batch.none");
			toast("Annota", why);
			return;
		}

		let pw = new Zotero.ProgressWindow({ closeOnClick: false });
		pw.changeHeadline("Annota");
		let bar = new pw.ItemProgress(
			"chrome://zotero/skin/tick.png",
			this.t("batch.progress", { i: 0, n: targets.length })
		);
		pw.show();

		let ok = 0, failed = 0;
		for (let i = 0; i < targets.length; i++) {
			let ann = targets[i];
			try {
				let annText = ann.annotationType === "image"
					? await this.areaText(ann) : (ann.annotationText || "").trim();
				let ctx = this.getContext(ann);
				// Le menu contextuel traite toutes les couleurs ayant un prompt,
				// « auto » ou « manuel ». Le commentaire existant (paraphrase
				// manuelle) est transmis via {{comment}}.
				let built = {};
				let comment = await this.buildComment({
					text: annText,
					ctx,
					color: this.keyForItem(ann),
					comment: (ann.annotationComment || "").trim(),
					fields: opts.fields,
					getRefs: () => this.getReferences(ann, annText),
					out: built
				});
				if (comment === null || !String(comment).trim()) {
					failed++;
					await this.markFailed(ann.id, "résultat vide");
					continue;
				}
				let fresh = await Zotero.Items.getAsync(ann.id);
				if (fresh) {
					this.rememberFields(fresh, built, comment);
					fresh.annotationComment = comment;
					this.setFailedTag(fresh, false);
					await fresh.saveTx();
					ok++;
				}
			}
			catch (e) {
				failed++;
				log("runBatch item " + ann.id + " : " + e);
				await this.markFailed(ann.id, String(e.message || e));
			}
			bar.setProgress(Math.round(((i + 1) / targets.length) * 100));
			bar.setText(this.t("batch.progress", { i: i + 1, n: targets.length }));
		}

		bar.setProgress(100);
		let summary = this.t("batch.done", { n: ok });
		if (failed) {
			let tag = this.failedTag();
			summary += this.t("batch.failed", { n: failed })
				+ (tag ? this.t("batch.tagged", { tag }) : this.t("batch.debug"));
		}
		if (noPrompt) summary += this.t("batch.nocfg", { n: noPrompt });
		bar.setText(summary);
		pw.startCloseTimer(failed ? 8000 : 4000);
		log("runBatch terminé : " + ok + " ok, " + failed + " échecs, "
			+ noPrompt + " sans prompt");
	},

	// ---- Formulaire de champs dans le popup de sélection ----
	//
	// Hook officiel « renderTextSelectionPopup » : la fenêtre qui apparaît quand
	// on sélectionne du texte, AVANT que l'annotation existe. On y saisit les
	// champs, puis on valide en choisissant une couleur de surlignage dans le
	// popup de Zotero ; l'annotation créée récupère les valeurs.
	//
	// Cliquer une pastille CRÉE l'annotation : il n'existe pas d'étape « choisir
	// la couleur puis valider ». On n'affiche donc pas la couleur retenue, on
	// affiche celle que vous vous apprêtez à cliquer — le survol des pastilles
	// de Zotero pilote le groupe de champs. À défaut, nos propres pastilles.

	_selectionListener: null,
	_pendingFields: null,          // { text, values, ts, color }
	_pendingResearch: null,
	_lastColor: null,              // dernière couleur réellement traitée

	// Union des champs de toutes les couleurs, dédoublonnée par nom.
	// Conservée comme repli quand aucune couleur n'est désignable.
	allFieldsSchema() {
		let seen = new Set(), out = [];
		for (let c of this.COLORS) {
			for (let f of this.fieldsForColor(c.hex)) {
				if (seen.has(f.name)) continue;
				seen.add(f.name);
				out.push(f);
			}
		}
		return out;
	},

	// Champs saisissables d'une couleur (les champs « ai » sont écrits par le
	// modèle, jamais par vous).
	visibleFieldsFor(hex) {
		return this.fieldsForColor(hex).filter(f => f.type !== "ai");
	},

	// Couleurs ayant au moins un champ à saisir.
	colorsWithFields() {
		return this.COLORS.filter(c => this.visibleFieldsFor(c.hex).length);
	},

	// Groupe affiché tant qu'aucune pastille n'a été désignée : la dernière
	// couleur utilisée, parce qu'on surligne rarement une seule fois.
	defaultFieldColor() {
		let withFields = this.colorsWithFields();
		if (!withFields.length) return null;
		if (this._lastColor && withFields.some(c => c.hex === this._lastColor)) {
			return this._lastColor;
		}
		return withFields[0].hex;
	},

	// Read semantic color labels independently of AI configuration.
getColorLabels() {
    try {
        let raw = getPref("colorLabels", "");
        if (!raw) return {};

        let labels = typeof raw === "string" ? JSON.parse(raw) : raw;

        if (!labels || typeof labels !== "object" || Array.isArray(labels)) {
            return {};
        }

        return labels;
    }
    catch (e) {
        log("getColorLabels: " + e);
        return {};
    }
},

// Display semantic labels in Zotero's text selection popup.
// Display semantic labels directly beside Zotero's original color buttons.
// Display semantic labels directly beside Zotero's native color buttons.
// Display semantic labels as the actual clickable color buttons.
// Display semantic labels as the actual clickable color buttons.
_renderColorLabels({ doc }) {
    if (!doc) return;

    let popup = doc.querySelector(".selection-popup");
    if (!popup) return;

    let colorsContainer = popup.querySelector(".colors");
    if (!colorsContainer) return;

    let buttons = Array.from(
        colorsContainer.querySelectorAll(".color-button")
    );

    if (!buttons.length) return;

    let labels = this.getColorLabels();

    let layout = String(
        getPref("colorLabelLayout", "wrap") || "wrap"
    );

    if (!["wrap", "single", "stack", "slanted"].includes(layout)) {
        layout = "wrap";
    }

    // Give the popup enough room for its contents.
    popup.style.width = "max-content";
    popup.style.height = "auto";
    popup.style.minHeight = "0";
    popup.style.maxHeight = "none";
    popup.style.overflow = "visible";
    popup.style.maxWidth =
        layout === "single" ? "none" : "calc(100vw - 24px)";

    colorsContainer.style.display = "flex";
    colorsContainer.style.alignItems = "center";
    colorsContainer.style.boxSizing = "border-box";
    colorsContainer.style.overflow = "visible";
    colorsContainer.style.gap = layout === "slanted" ? "2px" : "8px";

    colorsContainer.style.flexDirection =
        layout === "stack" ? "column" : "row";

    colorsContainer.style.flexWrap =
        layout === "wrap" || layout === "slanted" ? "wrap" : "nowrap";

    colorsContainer.style.width =
        layout === "single" ? "max-content" : "100%";

    // Prevent the popup from clipping rotated labels.
    colorsContainer.style.paddingTop =
        layout === "slanted" ? "22px" : "5px";

    colorsContainer.style.paddingBottom =
        layout === "slanted" ? "25px" : "5px";

    buttons.forEach((btn, index) => {
        let color = this.COLORS[index];
        if (!color) return;

        let label = String(
            labels[color.hex] || color.name || "Color"
        ).trim();

        // Remove any previous Annota label.
        let oldLabel = btn.querySelector(".annota-color-button-label");
        if (oldLabel) oldLabel.remove();

        // Remove Zotero's original visible color swatch.
        // The button itself and its native click handlers remain.
        Array.from(btn.children).forEach(child => child.remove());

        btn.style.display = "inline-flex";
        btn.style.alignItems = "center";
        btn.style.justifyContent = "center";
        btn.style.width = "auto";
        btn.style.height = "auto";
        btn.style.minWidth = "0";
        btn.style.minHeight = "0";
        btn.style.padding = "0";
        btn.style.margin = "0";
        btn.style.border = "none";
        btn.style.background = "transparent";
        btn.style.backgroundImage = "none";
        btn.style.boxShadow = "none";
        btn.style.overflow = "visible";
        btn.style.flex = "none";
        btn.style.cursor = "pointer";

        // Calculate readable text color.
        let hex = color.hex.replace("#", "");
        let r = parseInt(hex.substring(0, 2), 16);
        let g = parseInt(hex.substring(2, 4), 16);
        let b = parseInt(hex.substring(4, 6), 16);

        let brightness = (r * 299 + g * 587 + b * 114) / 1000;
        let textColor = brightness > 150 ? "#222222" : "#ffffff";

        let labelNode = doc.createElement("span");
        labelNode.className = "annota-color-button-label";
        labelNode.textContent = label;

        labelNode.style.cssText =
            "display:inline-block;"
            + "box-sizing:border-box;"
            + "padding:4px 8px;"
            + "border-radius:4px;"
            + "background-color:" + color.hex + ";"
            + "color:" + textColor + ";"
            + "font-size:11px;"
            + "font-weight:600;"
            + "line-height:1.3;"
            + "white-space:nowrap;"
            + "pointer-events:none;"
            + "transition:filter 120ms ease, transform 120ms ease, box-shadow 120ms ease;";

        if (layout === "slanted") {
            labelNode.style.transform = "rotate(-18deg)";
            labelNode.style.transformOrigin = "center center";

            btn.style.marginRight = "-9px";
            btn.style.marginBottom = "2px";
        }

        btn.appendChild(labelNode);

        // Make the label visually respond to hovering and keyboard focus.
        btn.addEventListener("mouseenter", () => {
            labelNode.style.filter = "brightness(1.15)";
            labelNode.style.transform =
                layout === "slanted"
                    ? "rotate(-18deg) scale(1.06)"
                    : "scale(1.06)";
            labelNode.style.boxShadow =
                "0 2px 6px rgba(0,0,0,0.25)";
        });

        btn.addEventListener("mouseleave", () => {
            labelNode.style.filter = "none";
            labelNode.style.transform =
                layout === "slanted"
                    ? "rotate(-18deg)"
                    : "none";
            labelNode.style.boxShadow = "none";
        });

        btn.addEventListener("focus", () => {
            labelNode.style.outline = "2px solid currentColor";
            labelNode.style.outlineOffset = "2px";
        });

        btn.addEventListener("blur", () => {
            labelNode.style.outline = "none";
        });

        // Preserve the original tooltip.
        if (!btn.hasAttribute("data-annota-original-title")) {
            btn.setAttribute(
                "data-annota-original-title",
                btn.getAttribute("title") || color.name
            );
        }

        btn.setAttribute("title", label);
        btn.setAttribute("aria-label", label);
    });

// Recalculate popup height after labels are rendered.
let win = doc.defaultView;

let schedule = win?.requestAnimationFrame
    ? win.requestAnimationFrame.bind(win)
    : (callback) => setTimeout(callback, 0);

schedule(() => {
    let contentHeight = colorsContainer.scrollHeight;

    popup.style.height = "auto";
    popup.style.minHeight = Math.max(contentHeight, 0) + "px";
    popup.style.overflow = "visible";
});
},
// Add optional research annotation fields below the color buttons.
_renderResearchCapture({ doc, params }) {
    if (!doc) return;

    let popup = doc.querySelector(".selection-popup");
    if (!popup) return;

    let colorsContainer = popup.querySelector(".colors");
    if (!colorsContainer) return;

    // Prevent duplicate fields.
    if (popup.querySelector(".annota-research-capture")) return;

    // Identify the library containing the selected PDF.
    const reader = (Zotero.Reader?._readers || []).find(
        reader => reader?._iframeWindow?.document === doc
    );

    const libraryID = reader?._item?.libraryID;

    this._ensureFormStyles(doc);

let container = doc.createElement("div");
container.className = this.FORM_CLASS + " annota-research-capture";

    container.style.cssText =
        "width:100%;box-sizing:border-box;"
        + "margin-top:10px;padding-top:8px;"
        + "border-top:1px solid rgba(128,128,128,.3);"
        + "display:flex;flex-direction:column;gap:7px;";

    // Section heading removed.

    // Consistent field creation.
    const createField = (labelText, control) => {
        let field = doc.createElement("div");

        field.style.cssText =
            "display:flex;flex-direction:column;gap:3px;";

        let label = doc.createElement("label");
        label.textContent = labelText;
        label.style.cssText =
            "font-size:10px;font-weight:600;opacity:.75;";

        field.appendChild(label);
        field.appendChild(control);
        container.appendChild(field);

        return control;
    };

    const inputStyle =
        "width:100%;box-sizing:border-box;"
        + "font:inherit;font-size:11px;padding:6px;"
        + "border:1px solid rgba(128,128,128,.4);"
        + "border-radius:4px;";

    // Personal research comment.
    let comment = doc.createElement("textarea");
    comment.className = "annota-research-comment";
    comment.placeholder =
        "Why is this passage important? Add your thoughts...";
    comment.rows = 2;

    comment.style.cssText =
        inputStyle + "resize:vertical;";

    createField("Comment", comment);
this._shieldFromReaderShortcuts(comment, "textarea");
    // Native Zotero tags.
    let tags = doc.createElement("input");
    tags.className = "annota-research-tags";
    tags.type = "text";
    tags.placeholder = "Add tags, separated by commas...";
    tags.style.cssText = inputStyle;

    createField("Zotero Tags", tags);

    // Create reusable research fields.
    const createResearchInput = (label, fieldName) => {
        const input = doc.createElement("input");

        input.type = "text";
        input.className = "annota-research-" + fieldName;
        input.placeholder = "Enter values separated by commas...";
        input.style.cssText = inputStyle;

        const datalist = doc.createElement("datalist");
        datalist.id =
            "annota-" + fieldName + "-" + Date.now();

        input.setAttribute("list", datalist.id);

        createField(label, input);
        container.appendChild(datalist);

        return { input, datalist };
    };

    const themesField = createResearchInput(
        "Research themes",
        "themes"
    );

    const experimentsField = createResearchInput(
        "Experiments",
        "experiments"
    );

    // Convert comma-separated input into unique values.
    const parseValues = value => [
        ...new Set(
            value
                .split(",")
                .map(v => v.trim())
                .filter(Boolean)
        )
    ];

    // Keep all research information together until Zotero
    // creates the actual annotation.
    const syncResearchData = () => {
        this._pendingResearch = {
            text: params?.annotation?.text || "",

            values: {
                comment: comment.value.trim(),
                tags: parseValues(tags.value),
                themes: parseValues(themesField.input.value),
                experiments: parseValues(experimentsField.input.value)
            },

            ts: Date.now()
        };
    };

    [
        comment,
        tags,
        themesField.input,
        experimentsField.input
    ].forEach(input => {
        input.addEventListener("input", syncResearchData);
        input.addEventListener("change", syncResearchData);
    });

    // Restore values if Zotero rerenders the selection popup.
    const pending = this._pendingResearch;

    if (pending && pending.text === (params?.annotation?.text || "")) {
        comment.value = pending.values.comment || "";
        tags.value = (pending.values.tags || []).join(", ");

        themesField.input.value =
            (pending.values.themes || []).join(", ");

        experimentsField.input.value =
            (pending.values.experiments || []).join(", ");
    }

    // Load reusable themes and experiments from the library.
    if (libraryID != null) {
        (async () => {
            try {
                const metadata = await this._getResearchMetadata(libraryID);

                const populateSuggestions = (datalist, values) => {
                    datalist.replaceChildren();

                    for (const value of values) {
                        const option = doc.createElement("option");
                        option.value = value;
                        datalist.appendChild(option);
                    }
                };

                populateSuggestions(
                    themesField.datalist,
                    metadata.themes
                );

                populateSuggestions(
                    experimentsField.datalist,
                    metadata.experiments
                );
            }
            catch (e) {
                log("Loading research suggestions failed: " + e);
            }
        })();
    }
    else {
        log("Could not determine library ID for research capture");
    }

    // Insert below Highlight / Underline controls.
    const controlsContainer = popup.querySelector(".tool-toggle");
    const insertionPoint = controlsContainer || colorsContainer;

    insertionPoint.parentNode.insertBefore(
        container,
        insertionPoint.nextSibling
    );
},
// Monitor Zotero readers for the popup shown when clicking an existing annotation.
// Recalculate the existing annotation popup position after extension UI changes.
_repositionExistingAnnotationPopup({ doc, popup, rect }) {
    if (!doc || !popup || !Array.isArray(rect) || rect.length < 4) return;
    if (popup.dataset.annotaPositionPending === "true") return;

    popup.dataset.annotaPositionPending = "true";

    const win = doc.defaultView;
    const schedule = win?.requestAnimationFrame
        ? win.requestAnimationFrame.bind(win)
        : callback => setTimeout(callback, 0);

    schedule(() => {
        delete popup.dataset.annotaPositionPending;

        if (!popup.isConnected) return;

        const parent = popup.parentNode;
        if (!parent) return;

        const width = popup.offsetWidth;
        const height = popup.offsetHeight;
        const parentRect = parent.getBoundingClientRect();

        const viewWidth = parentRect.width;
        const viewHeight = parentRect.height;

        if (!width || !height || !viewWidth || !viewHeight) return;

        const signature = JSON.stringify([
            rect, width, height, viewWidth, viewHeight
        ]);


        const padding = 20;
        const anchorX = rect[0] + (rect[2] - rect[0]) / 2;
        const anchorY = rect[1] + (rect[3] - rect[1]) / 2;

        function calculateTop() {
            let top = anchorY - height / 2;

            if (rect[3] - rect[1] > height) {
                top = Math.min(
                    Math.max(top, rect[1]),
                    rect[3] - height
                );
            }

            return top;
        }

        function calculateLeftForSide(placeLeft) {
            if (placeLeft) {
                const left = rect[0] - width - padding;
                return left < padding
                    ? anchorX - width - padding
                    : left;
            }

            const left = rect[2] + padding;

            return left + width > viewWidth - padding
                ? anchorX + padding
                : left;
        }

        let left = anchorX - width / 2;
        let top;
        let side;

        if (left < 0) {
            side = "right";
            left = calculateLeftForSide(false);
            top = calculateTop();
        }
        else if (left + width > viewWidth) {
            side = "left";
            left = calculateLeftForSide(true);
            top = calculateTop();
        }
        else {
            const fitsAbove = rect[1] - padding - height > 0;
            const fitsBelow = rect[3] + height + padding < viewHeight;

            if (fitsBelow) {
                top = rect[3] + padding;
                side = "bottom";
            }
            else if (fitsAbove) {
                top = rect[1] - padding - height;
                side = "top";
            }
            else {
                const placeLeft = rect[0] >= viewWidth / 2;
                side = placeLeft ? "left" : "right";
                left = calculateLeftForSide(placeLeft);
                top = calculateTop();
            }
        }

        if (left + width > viewWidth - padding) {
            left = viewWidth - width - padding;
        }

        if (left < padding) left = padding;

        if (top + height > viewHeight - padding) {
            top = viewHeight - height - padding;
        }

        if (top < padding) top = padding;

        const expectedTransform = `translate(${left}px, ${top}px)`;
        const expectedClass = `page-popup-${side}-center`;

        if (
            popup.dataset.annotaPositionSignature === signature &&
            popup.style.transform === expectedTransform &&
            popup.classList.contains(expectedClass)
        ) {
            return;
        }

        popup.style.transform = expectedTransform;

        popup.classList.remove(
            "page-popup-top-center",
            "page-popup-bottom-center",
            "page-popup-left-center",
            "page-popup-right-center"
        );

        popup.classList.add(expectedClass);
        popup.dataset.annotaPositionSignature = signature;
    });
},
_startAnnotationPopupMonitor() {
    if (this._annotationPopupScanTimer) return;

    this._annotationPopupScanTimer = setInterval(() => {
        try {
            const readers = Zotero.Reader?._readers || [];

            for (const reader of readers) {
                const doc = reader?._iframeWindow?.document;
                if (!doc) continue;

                const popup = doc.querySelector(".annotation-popup");
                if (!popup) continue;

                const annotation =
                    reader._internalReader?._state
                        ?.primaryViewAnnotationPopup?.annotation;

                if (!annotation?.id) continue;

		const libraryID =
			annotation.libraryID ?? reader._item?.libraryID;

		if (libraryID == null) {
			log("Could not resolve annotation library ID: " + annotation.id);
			continue;
		}

		this._renderExistingAnnotationResearch({
    doc,
    popup,
    reader,
    annotation: {
        ...annotation,
        libraryID
    }
});
		const popupRect =
			reader._internalReader?._state
				?.primaryViewAnnotationPopup?.rect;

		this._repositionExistingAnnotationPopup({
			 doc,
			 popup,
			 rect: popupRect
		});
            }
        }
        catch (e) {
            log("Annotation popup monitor: " + e);
        }
    }, 500);
},


// Add research fields to the popup for an existing annotation.

_renderExistingAnnotationResearch({ doc, popup, annotation, reader }) {
    if (!doc || !popup || !annotation?.id) return;

    const annotationKey = `${annotation.libraryID}:${annotation.id}`;

    const item = Zotero.Items.getByLibraryAndKey(
        annotation.libraryID,
        annotation.id
    );

    if (!item || !item.isAnnotation?.()) {
        log("Could not find Zotero annotation: " + annotation.id);
        return;
    }

    // Keep Zotero's native comment editor and native Tags button.
    const nativeComment = popup.querySelector(".preview > .comment");
    if (nativeComment) nativeComment.style.display = "";

    const nativeTags = popup.querySelector("button.tags");
    if (nativeTags) nativeTags.style.display = "";

    let container = popup.querySelector(".annota-existing-research");

if (container?.dataset.annotationKey === annotationKey) {
    return;
}

if (container) container.remove();

const oldColorPanel = popup.querySelector(".annota-existing-colors");
if (oldColorPanel) oldColorPanel.remove();

this._ensureFormStyles(doc);

container = doc.createElement("div");
container.className = this.FORM_CLASS + " annota-existing-research";
    container.dataset.annotationKey = annotationKey;

    container.style.cssText =
        "width:100%;box-sizing:border-box;"
        + "padding:9px 10px;"
        + "border-top:1px solid rgba(128,128,128,.3);"
        + "display:flex;flex-direction:column;gap:8px;";

// Keep the colour selector separate from the research fields.
const colorPanel = doc.createElement("div");
colorPanel.className = this.FORM_CLASS + " annota-existing-colors";
colorPanel.dataset.annotationKey = annotationKey;
colorPanel.style.cssText =
    "width:100%;max-width:calc(100vw - 24px);box-sizing:border-box;"
    + "padding:9px 10px;"
    + "border-bottom:1px solid rgba(128,128,128,.3);"
    + "display:flex;flex-direction:column;gap:8px;";

    // Section heading removed.



// Native Zotero conversion: highlight <-> underline.
const annotationType = String(item.annotationType || "").toLowerCase();

if (annotationType === "highlight" || annotationType === "underline") {
    const targetType =
        annotationType === "highlight" ? "underline" : "highlight";

    const convertButton = doc.createElement("button");
    convertButton.className = "annota-convert-annotation";
    convertButton.type = "button";
    convertButton.textContent =
        targetType === "underline"
            ? "Convert to underline"
            : "Convert to highlight";

    convertButton.style.cssText =
        "align-self:flex-start;"
        + "padding:5px 9px;"
        + "border:1px solid rgba(128,128,128,.4);"
        + "border-radius:4px;"
        + "background:var(--fill-quinary);"
        + "color:var(--fill-primary);"
        + "font-size:11px;"
        + "cursor:pointer;";

    convertButton.addEventListener("click", async () => {
        const internalReader = reader?._internalReader;

        if (!internalReader?.convertAnnotations) {
            log("Native annotation conversion is unavailable.");
            return;
        }

        convertButton.disabled = true;

        try {
            const beforeIDs = this._readerAnnotationIDs(reader);

            // Zotero may update its reader state asynchronously.
            const annotationIDs = Cu.cloneInto(
                [item.key],
                reader._iframeWindow
            );

            const conversionResult = internalReader.convertAnnotations(
                annotationIDs,
                targetType
            );

            if (
                conversionResult
                && typeof conversionResult.then === "function"
            ) {
                await conversionResult;
            }

            // Wait for the replacement annotation to appear in reader state
            // and become available as a Zotero database item.
            let newID = null;
            let newItem = null;

            for (let attempt = 0; attempt < 50; attempt++) {
                const afterIDs = this._readerAnnotationIDs(reader);
                const addedIDs = [];

                afterIDs.forEach(candidateID => {
                    if (!beforeIDs.has(candidateID)) {
                        addedIDs.push(candidateID);
                    }
                });

                if (addedIDs.length > 1) {
                    throw new Error(
                        "Expected one replacement annotation, found "
                        + addedIDs.length
                    );
                }

                if (addedIDs.length === 1) {
                    newID = addedIDs[0];
                    newItem = Zotero.Items.getByLibraryAndKey(
                        item.libraryID,
                        newID
                    );

                    if (newItem?.isAnnotation?.()) {
                        break;
                    }

                    newItem = null;
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            if (!newID || !newItem) {
                throw new Error(
                    "Timed out waiting for the converted annotation."
                );
            }

            const conversionKey = `${item.libraryID}:${newID}`;

            this._pendingAnnotationConversions.set(conversionKey, {
                libraryID: item.libraryID,
                oldAnnotationKey: `${item.libraryID}:${item.key}`,
                newAnnotationKey: conversionKey,
                oldID: item.key,
                newID,
                parentID: item.parentID,
                targetType,
                createdAt: Date.now(),
                processing: false
            });

            log(
                "Native annotation conversion detected: "
                + item.key
                + " -> "
                + newID
                + " ("
                + targetType
                + ")"
            );

            // Migrate the old annotation's research metadata.
            await this.handleConvertedAnnotation(newItem.id);

            // Wait for any notifier-triggered migration to finish.
            for (let attempt = 0; attempt < 50; attempt++) {
                const pending =
                    this._pendingAnnotationConversions.get(conversionKey);

                if (!pending || !pending.processing) {
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Verify the converted annotation survives subsequent
            // conversion-related notifications and note rebuilds.
            let verified = false;

            for (let attempt = 0; attempt < 3; attempt++) {
                if (attempt > 0) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                const freshItem = await Zotero.Items.getAsync(newItem.id);

                if (!freshItem?.isAnnotation?.()) {
                    log("Converted annotation unavailable during verification.");
                    continue;
                }

                await this._syncPaperResearchNote(freshItem);

                const { note } =
                    await this._getOrCreatePaperResearchNote(freshItem);

                const expectedMarker =
                    "RA_ENTRY_START:"
                    + freshItem.libraryID
                    + ":"
                    + freshItem.key;

                const savedHTML = note.getNote() || "";

                verified = savedHTML.includes(expectedMarker);

                log(
                    "Conversion note verification "
                    + (attempt + 1)
                    + "/3: "
                    + freshItem.key
                    + " | present: "
                    + verified
                );
            }

            if (!verified) {
                log(
                    "WARNING: Converted annotation entry was not "
                    + "verified in the research note."
                );
            }
            else {
                log(
                    "Converted annotation entry verified in research note."
                );
            }
        }
        catch (e) {
            log("Native annotation conversion failed: " + e);
            convertButton.disabled = false;
        }
    });
    colorPanel.appendChild(convertButton);
}

    const colorLabels = this.getColorLabels();

    let colorLayout = String(
        getPref("colorLabelLayout", "wrap") || "wrap"
    );

    if (!["wrap", "single", "stack", "slanted"].includes(colorLayout)) {
        colorLayout = "wrap";
    }

    const colorContainer = doc.createElement("div");

    colorContainer.style.cssText =
        "display:flex;"
        + "align-items:center;"
        + "box-sizing:border-box;"
        + "gap:" + (colorLayout === "slanted" ? "2px" : "8px") + ";"
        + "flex-direction:" + (colorLayout === "stack" ? "column" : "row") + ";"
        + "flex-wrap:" + (
            colorLayout === "wrap" || colorLayout === "slanted"
                ? "wrap"
                : "nowrap"
        ) + ";"
        + "width:" + (colorLayout === "single" ? "max-content" : "100%") + ";"
        + "max-width:100%;"
        + "padding-top:" + (colorLayout === "slanted" ? "22px" : "5px") + ";"
        + "padding-bottom:" + (colorLayout === "slanted" ? "25px" : "5px") + ";"
        + "padding-left:2px;"
        + "padding-right:2px;"
        + "overflow:visible;";

    const updateSelectedColor = () => {
        const currentColor = String(item.annotationColor || "").toLowerCase();

        for (const button of colorContainer.querySelectorAll("button")) {
            const selected =
                button.dataset.color.toLowerCase() === currentColor;

            button.setAttribute("aria-pressed", String(selected));

            button.style.outline = selected
                ? "2px solid var(--fill-primary)"
                : "none";

            button.style.outlineOffset = selected ? "2px" : "0";
        }
    };

    for (const color of this.COLORS) {
        const button = doc.createElement("button");
        button.type = "button";
        button.dataset.color = color.hex;

        const label = String(
            colorLabels[color.hex] || color.name || "Color"
        ).trim();

        button.textContent = label;
        button.title = label;
        button.setAttribute("aria-label", "Set annotation colour to " + label);

        const hex = color.hex.replace("#", "");
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        const textColor = brightness > 150 ? "#222222" : "#ffffff";

        button.style.cssText =
            "display:inline-flex;"
            + "align-items:center;"
            + "justify-content:center;"
            + "box-sizing:border-box;"
            + "padding:4px 8px;"
            + "border:1px solid rgba(128,128,128,.35);"
            + "border-radius:4px;"
            + "background-color:" + color.hex + ";"
            + "color:" + textColor + ";"
            + "font-size:11px;"
            + "font-weight:600;"
            + "line-height:1.3;"
            + "white-space:nowrap;"
            + "cursor:pointer;"
            + "flex:none;";

        if (colorLayout === "slanted") {
            button.style.transform = "rotate(-18deg)";
            button.style.marginRight = "-9px";
            button.style.marginBottom = "2px";
        }

        button.addEventListener("click", async () => {
            const previousColor = item.annotationColor;

            if (
                String(previousColor || "").toLowerCase() ===
                color.hex.toLowerCase()
            ) {
                return;
            }

            for (const otherButton of colorContainer.querySelectorAll("button")) {
                otherButton.disabled = true;
            }

            try {
                item.annotationColor = color.hex;
                await item.saveTx();

                const savedItem = await Zotero.Items.getAsync(item.id);

                if (!savedItem?.isAnnotation?.()) {
                    throw new Error("Could not reload annotation after color change.");
                }

                log(
                    "Persisted annotation color: "
                    + savedItem.key
                    + " -> "
                    + savedItem.annotationColor
                );

                await this._syncPaperResearchNote(savedItem);

                updateSelectedColor();

                log(
                    "Annotation colour changed: "
                    + annotation.id
                    + " -> "
                    + color.hex
                );
            }
            catch (e) {
                item.annotationColor = previousColor;
                log("Changing annotation colour failed: " + e);

                updateSelectedColor();
            }
            finally {
                for (const otherButton of colorContainer.querySelectorAll("button")) {
                    otherButton.disabled = false;
                }
            }
        });

        colorContainer.appendChild(button);
    }

    const conversionButton = colorPanel.querySelector(".annota-convert-annotation");

    // Append swatches first, then move the conversion button below them.
    colorPanel.appendChild(colorContainer);

    if (conversionButton) {
        colorPanel.appendChild(conversionButton);
    }

    updateSelectedColor();

    const createField = (labelText, fieldName, suggestions) => {
        const wrapper = doc.createElement("div");

        wrapper.style.cssText =
            "display:flex;flex-direction:column;gap:3px;";

        const label = doc.createElement("label");
        label.textContent = labelText;
        label.style.cssText =
            "font-size:11px;font-weight:600;";

        const input = doc.createElement("input");
        input.type = "text";
        input.className = "annota-research-field";
        input.dataset.field = fieldName;
        input.placeholder = "Enter values separated by commas";
        input.style.cssText =
            "width:100%;box-sizing:border-box;"
            + "padding:5px 7px;"
            + "border:1px solid rgba(128,128,128,.4);"
            + "border-radius:4px;"
            + "background:var(--fill-quinary);"
            + "color:var(--fill-primary);"
            + "font-size:12px;";

        const list = doc.createElement("datalist");
        list.id = "annota-" + fieldName + "-" + annotation.id;

        for (const value of suggestions || []) {
            const option = doc.createElement("option");
            option.value = value;
            list.appendChild(option);
        }

        input.setAttribute("list", list.id);

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        wrapper.appendChild(list);
        container.appendChild(wrapper);

        return input;
    };

    const themesInput = createField(
        "Research themes",
        "themes",
        []
    );

    const experimentsInput = createField(
        "Experiments",
        "experiments",
        []
    );

    const parseValues = value => [
        ...new Set(
            value
                .split(",")
                .map(v => v.trim())
                .filter(Boolean)
        )
    ];

    const saveResearchFields = () => {
        const themesValue = themesInput.value;
        const experimentsValue = experimentsInput.value;

        const themesVersion = themesInput.dataset.editVersion || "0";
        const experimentsVersion =
            experimentsInput.dataset.editVersion || "0";

        this._researchMetadataSaveQueue =
            (this._researchMetadataSaveQueue || Promise.resolve())
            .then(async () => {
                const themes = parseValues(themesValue);
                const experiments = parseValues(experimentsValue);

                await this._updateResearchMetadata(
                    annotation.libraryID,
                    metadata => {
                        metadata.themes = [
                            ...new Set([...metadata.themes, ...themes])
                        ];

                        metadata.experiments = [
                            ...new Set([
                                ...metadata.experiments,
                                ...experiments
                            ])
                        ];

                        const annotationMetadata = {
                            ...(metadata.annotations[annotationKey] || {}),
                            themes,
                            experiments
                        };

                        // Remove the accidentally introduced Name field.
                        delete annotationMetadata.name;
                        delete annotationMetadata.researchComment;

                        metadata.annotations[annotationKey] =
                            annotationMetadata;
                    }
                );
                if (
                    (themesInput.dataset.editVersion || "0") === themesVersion &&
                    themesInput.value === themesValue
                ) {
                    themesInput.dataset.dirty = "false";
                }

                if (
                    (experimentsInput.dataset.editVersion || "0") ===
                        experimentsVersion &&
                    experimentsInput.value === experimentsValue
                ) {
                    experimentsInput.dataset.dirty = "false";
                }

                log("Research fields saved for annotation " + annotation.id);
            })
            .catch(e => {
                log("Saving research fields failed: " + e);
            });
    };

    let researchSaveTimer = null;

    const scheduleResearchSave = () => {
        clearTimeout(researchSaveTimer);
        researchSaveTimer = setTimeout(saveResearchFields, 700);
    };

    const commitResearchSave = () => {
        clearTimeout(researchSaveTimer);
        researchSaveTimer = null;
        saveResearchFields();
    };

    for (const input of [themesInput, experimentsInput]) {
        input.addEventListener("input", () => {
            input.dataset.dirty = "true";
            input.dataset.editVersion =
                String((Number(input.dataset.editVersion) || 0) + 1);

            scheduleResearchSave();
        });

        input.addEventListener("blur", commitResearchSave);

        input.addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                commitResearchSave();
            }
        });
    }

    // Load saved research values and reusable suggestions.
    (async () => {
        try {
            const metadata = await this._getResearchMetadata(
                annotation.libraryID
            );

            const saved = metadata.annotations[annotationKey] || {};

            if (
                themesInput.dataset.dirty !== "true" &&
                doc.activeElement !== themesInput
            ) {
                themesInput.value = (saved.themes || []).join(", ");
            }

            if (
                experimentsInput.dataset.dirty !== "true" &&
                doc.activeElement !== experimentsInput
            ) {
                experimentsInput.value =
                    (saved.experiments || []).join(", ");
            }

            const updateSuggestions = (input, values) => {
                const list = input.list;
                if (!list) return;

                list.replaceChildren();

                for (const value of values || []) {
                    const option = doc.createElement("option");
                    option.value = value;
                    list.appendChild(option);
                }
            };

            updateSuggestions(themesInput, metadata.themes);
            updateSuggestions(experimentsInput, metadata.experiments);
        }
        catch (e) {
            log("Loading research fields failed: " + e);
        }
    })();

    // Arrange the popup in the requested order.
    const preview = popup.querySelector(".preview");

    if (preview) {
        // Remove headings left by an earlier annotation popup.
        for (const oldHeading of preview.querySelectorAll(
            ".annota-existing-section-heading"
        )) {
            oldHeading.remove();
        }

        const comment = preview.querySelector(":scope > .comment");
        const tags = preview.querySelector(":scope > button.tags");

        const createSectionHeading = text => {
            const heading = doc.createElement("div");
            heading.className = "annota-existing-section-heading";
            heading.textContent = text;
            heading.style.cssText =
                "font-size:11px;font-weight:600;"
                + "margin:7px 0 3px;";
            return heading;
        };

        // 1. Colors, followed by the conversion button inside colorPanel.
        if (comment) {
            preview.insertBefore(colorPanel, comment);
        }
        else if (tags) {
            preview.insertBefore(colorPanel, tags);
        }
        else {
            preview.insertBefore(colorPanel, preview.firstChild);
        }

        // 2. Comment heading above Zotero's native comment editor.
        if (comment) {
            preview.insertBefore(
                createSectionHeading("Comment"),
                comment
            );
        }

        // 3. Tags heading above Zotero's native Tags button.
        if (tags) {
            preview.insertBefore(
                createSectionHeading("Tags"),
                tags
            );
        }

        // 4. Research themes and experiments after native Tags.
        if (tags) {
            tags.insertAdjacentElement("afterend", container);
        }
        else if (comment) {
            comment.insertAdjacentElement("afterend", container);
        }
        else {
            preview.appendChild(container);
        }
    }
    log("Research panel restored for annotation " + annotation.id);
},

	// Pastilles du popup de Zotero. selection-popup.js les rend dans
	// « .colors > .color-button », au même index que ANNOTATION_COLORS — donc au
	// même index que Zotero.Annotations.COLORS, d'où notre propre liste. Nos
	// champs étant injectés dans ce popup (CustomSections), on remonte jusqu'à
	// lui. Un nombre de boutons inattendu = version qu'on ne sait pas lire :
	// on renvoie null plutôt que d'associer des couleurs au hasard.
	readerColorButtons(node) {
		try {
			let root = node && node.parentNode;
			while (root && !(root.classList
					&& root.classList.contains && root.classList.contains("selection-popup"))) {
				root = root.parentNode;
			}
			if (!root || typeof root.querySelectorAll !== "function") return null;
			let btns = Array.prototype.slice.call(
				root.querySelectorAll(".colors .color-button"));
			return btns.length === this.COLORS.length ? btns : null;
		}
		catch (e) {
			log("readerColorButtons: " + e);
			return null;
		}
	},

	// Valeurs mises de côté pour un passage donné (validité : 10 minutes).
	// Zotero normalise le texte à l'enregistrement (retours à la ligne, césures,
	// espaces) : une égalité stricte avec le texte vu au moment de la sélection
	// échoue presque toujours. On compare donc une forme normalisée, puis un
	// préfixe, et à défaut on retient une saisie très récente — le geste étant
	// « je tape puis je clique une couleur » dans la foulée.
	_normText(t) {
		return String(t || "")
			.replace(/[\u00AD]/g, "")          // césures conditionnelles
			.replace(/-\s*\n\s*/g, "")         // mots coupés en fin de ligne
			.replace(/\s+/g, " ")
			.trim()
			.toLowerCase();
	},

	// consume=false : consulter sans effacer (pour décider s'il faut agir).
	_matchPending(text, consume) {
		let p = this._pendingFields;
		if (!p) return null;
		let age = Date.now() - p.ts;
		if (age > 600000) { this._pendingFields = null; return null; }

		let a = this._normText(p.text), b = this._normText(text);
		let how = "";
		if (a && b && a === b) how = "texte identique";
		else if (a && b && (a.startsWith(b.slice(0, 40)) || b.startsWith(a.slice(0, 40)))) {
			how = "préfixe commun";
		}
		else if (age < 60000) how = "saisie récente (" + Math.round(age / 1000) + " s)";

		if (!how) {
			log("champs en attente non appliqués : le passage ne correspond pas");
			return null;
		}
		if (consume) {
			this._pendingFields = null;   // consommé une seule fois
			log("champs appliqués (" + how + ")");
		}
		return p.values;
	},

	peekPendingFields(text) { return this._matchPending(text, false); },
	takePendingFields(text) { return this._matchPending(text, true); },

	// Y a-t-il au moins une valeur non vide ? Un formulaire laissé vierge ne
	// doit pas déclencher une génération sur une couleur « à la demande ».
	_hasFilledValues(values) {
		return !!values && Object.keys(values).some(k => String(values[k] || "").trim());
	},

	registerSelectionForm() {
		try {
			if (!Zotero.Reader || !Zotero.Reader.registerEventListener) return;
			this._startAnnotationPopupMonitor();
			this._selectionListener = (event) => {
    // Semantic color labels: independent of AI and custom fields.
    try { this._renderColorLabels(event); }
    catch (e) { log("renderColorLabels: " + e); }
    // Optional research annotation fields.
    try { this._renderResearchCapture(event); }
    catch (e) { log("renderResearchCapture: " + e); }
    // Existing AI/custom-fields functionality.
    try { this._renderSelectionForm(event); }
    catch (e) { log("renderTextSelectionPopup: " + e); }
				// « Ask Annota » : la sélection part dans la discussion.
				try { if (AnnotaChat) AnnotaChat.renderAskButton(event); }
				catch (e) { log("renderAskButton: " + e); }
			};
			Zotero.Reader.registerEventListener(
				"renderTextSelectionPopup", this._selectionListener, "annota@equiriconi");
			log("Formulaire de sélection enregistré");
		}
		catch (e) {
			log("registerSelectionForm: " + e);
		}
	},

	unregisterSelectionForm() {
		try {
			if (this._selectionListener && Zotero.Reader
					&& Zotero.Reader.unregisterEventListener) {
				Zotero.Reader.unregisterEventListener(
					"renderTextSelectionPopup", this._selectionListener);
			}
		}
		catch (e) { /* ignore */ }
		this._selectionListener = null;
	},

	// Le lecteur de Zotero réserve des touches SEULES à ses raccourcis : « r » et
	// « l » lancent la lecture vocale, « h » et « u » annotent, l'espace met en
	// pause. Il les écoute en PHASE DE CAPTURE sur la fenêtre
	// (keyboard-manager.js : addEventListener('keydown', …, true)), donc bien
	// avant que la frappe n'atteigne nos champs : aucun stopPropagation posé
	// sur le formulaire ne peut arriver à temps.
	//
	// Sa seule échappatoire est le test isTextBox(event.target), qui vaut
	// (lib/utilities.js) :
	//     ['INPUT'].includes(node.nodeName) && node.type === 'text'
	//         || node.getAttribute('contenteditable') === 'true'
	//
	// Autrement dit un <input type="text"> est épargné, mais PAS un
	// <textarea>, ni un <select>, ni une case à cocher — d'où une lecture
	// vocale déclenchée en tapant une paraphrase contenant un « r », et jamais
	// en remplissant le titre. On coche donc la seconde condition : l'attribut
	// contenteditable est inerte sur un contrôle de formulaire, mais il suffit
	// à faire reconnaître le champ comme zone de saisie.
	// Suppr / Retour arrière SUPPRIMENT l'annotation sélectionnée. Le garde-fou
	// est ici différent de celui des lettres (keyboard-manager.js) :
	//     if (event.target.closest('input, .label-popup') || …) return;
	// « input » couvre nos champs texte et nos cases à cocher, mais PAS un
	// <textarea> — donc corriger une faute dans une paraphrase effaçait le
	// surlignage précédent, resté sélectionné.
	//
	// La seule accroche disponible est donc la classe .label-popup, portée par
	// le conteneur du formulaire : closest() la trouve depuis n'importe quel
	// champ. Elle vient avec sa mise en forme (position:absolute, left:-9999px,
	// padding:16px, pointeur en pseudo-éléments) qui expédierait le formulaire
	// hors écran : on la neutralise par une feuille de style à nous. Aucun
	// effet de bord ailleurs — focus-manager.js teste .selection-popup, que
	// notre conteneur satisfait déjà par son emplacement.
	FORM_CLASS: "label-popup annota-fields",

	_ensureFormStyles(doc) {
		try {
			if (!doc || typeof doc.getElementById !== "function") return;
			if (doc.getElementById("annota-form-style")) return;
			let st = doc.createElement("style");
			st.id = "annota-form-style";
			st.textContent = ".annota-fields{position:static !important;"
				+ "left:auto !important;top:auto !important;right:auto !important;"
				+ "bottom:auto !important;padding:0 !important;margin:0 !important;}"
				+ ".annota-fields::before,.annota-fields::after{"
				+ "content:none !important;display:none !important;}";
			let host = doc.head || doc.documentElement;
			if (host && host.appendChild) host.appendChild(st);
		}
		catch (e) {
			log("_ensureFormStyles: " + e);
		}
	},

	_shieldFromReaderShortcuts(el, type) {
		if (type === "text") return;      // déjà reconnu tel quel
		try { el.setAttribute("contenteditable", "true"); }
		catch (e) { /* ignore */ }
	},

	_renderSelectionForm({ doc, params, append }) {
		if (!doc || !append) return;
		let colors = this.colorsWithFields();
		if (!colors.length) return;
		let text = String((params && params.annotation && params.annotation.text) || "").trim();
		if (!text) return;

		// Le popup peut être re-rendu pendant la sélection, et l'on passe d'un
		// groupe à l'autre : les valeurs déjà tapées survivent aux deux.
		let values = (this._pendingFields && this._pendingFields.text === text)
			? Object.assign({}, this._pendingFields.values) : {};
		let current = (this._pendingFields && this._pendingFields.text === text
				&& this._pendingFields.color)
			? this._pendingFields.color : this.defaultFieldColor();

		// Pas de largeur imposée : le formulaire épouse le popup. Un min-width
		// débordait du cadre, les champs sortaient de la fenêtre.
		this._ensureFormStyles(doc);
		let wrap = doc.createElement("div");
		// Voir FORM_CLASS : c'est ce qui empêche Suppr d'effacer l'annotation.
		wrap.setAttribute("class", this.FORM_CLASS);
		wrap.style.cssText = "display:flex;flex-direction:column;gap:6px;"
			+ "width:100%;max-width:100%;box-sizing:border-box;padding:2px 0;";

		// Filet secondaire : arrête les écouteurs de PHASE REMONTANTE. Insuffisant
		// à lui seul contre le lecteur (voir _shieldFromReaderShortcuts), mais
		// utile face au reste de Zotero.
		for (let type of ["keydown", "keypress", "keyup"]) {
			wrap.addEventListener(type, e => e.stopPropagation());
		}

		// Style commun, aligné sur le thème du lecteur (couleurs héritées).
		const FIELD_CSS = "width:100%;max-width:100%;box-sizing:border-box;"
			+ "font:inherit;font-size:12px;line-height:1.3;padding:4px 6px;"
			+ "border:1px solid rgba(128,128,128,.45);border-radius:4px;"
			+ "background:rgba(128,128,128,.12);color:inherit;outline:none;";
		const LABEL_CSS = "font-size:11px;opacity:.65;";

		let header = doc.createElement("div");     // libellé de la couleur en cours
		header.style.cssText = "display:none;align-items:center;gap:5px;width:100%;"
			+ "font-size:11px;font-weight:600;letter-spacing:.01em;";
		let picker = doc.createElement("div");     // repli : nos propres pastilles
		picker.style.cssText = "display:none;align-items:center;gap:4px;"
			+ "flex-wrap:wrap;width:100%;";
		let body = doc.createElement("div");       // groupe de champs courant
		body.style.cssText = "display:flex;flex-direction:column;gap:6px;width:100%;";
		let hint = doc.createElement("div");
		hint.style.cssText = "display:flex;align-items:center;justify-content:center;"
			+ "gap:5px;font-size:10px;line-height:1.3;text-align:center;";
		wrap.appendChild(picker);
		wrap.appendChild(header);
		wrap.appendChild(body);
		wrap.appendChild(hint);

		const colorName = (hex) => {
			let c = this.COLORS.find(x => x.hex === hex);
			return c ? c.name : hex;
		};

		// Le pied du formulaire nomme la pastille à cliquer, et la montre : dans
		// une rangée de huit ronds, une couleur se reconnaît plus vite qu'elle
		// ne se lit. Il sert aussi à dire qu'une couleur n'a rien de configuré,
		// plutôt que de laisser un formulaire vide sans explication.
		const SWATCH_CSS = "width:9px;height:9px;flex:none;border-radius:2px;"
			+ "display:inline-block;border:1px solid rgba(128,128,128,.55);";

		// Le libellé nomme ce qu'on est en train de faire (« Objection »), quand
		// le pied nomme la pastille à cliquer (« Red ») : deux informations
		// différentes. Sans libellé, l'en-tête disparaît — le popup est étroit.
		const renderHeader = (hex) => {
			let label = this.labelForColor(hex);
			header.textContent = "";
			if (!label) { header.style.display = "none"; return; }
			header.style.display = "flex";
			let sw = doc.createElement("span");
			sw.style.cssText = SWATCH_CSS + "background:" + hex + ";";
			let txt = doc.createElement("span");
			txt.textContent = label;
			header.appendChild(sw);
			header.appendChild(txt);
		};

		const renderHint = (hex, configured) => {
			hint.textContent = "";
			let sw = doc.createElement("span");
			sw.style.cssText = SWATCH_CSS + "background:" + hex + ";";
			let msg = doc.createElement("span");
			msg.textContent = configured
				? this.t("form.click", { color: colorName(hex) })
				: this.t("form.none", { color: colorName(hex) });
			hint.style.opacity = configured ? "0.6" : "0.85";
			hint.appendChild(sw);
			hint.appendChild(msg);
		};

		// Mémorisé au fil de la frappe : la validation se fait ensuite en
		// cliquant une couleur dans le popup de Zotero.
		const sync = () => {
			this._pendingFields = { text, values, ts: Date.now(), color: current };
		};

		const renderGroup = (hex) => {
			current = hex;
			body.textContent = "";
			let fields = this.visibleFieldsFor(hex);
			for (let f of fields) {
				let row = doc.createElement("div");
				let lab = doc.createElement("label");
				lab.textContent = f.label;
				let el;

				if (f.type === "check") {
					// Case à cocher : libellé à droite, sur une seule ligne.
					row.style.cssText = "display:flex;align-items:center;gap:6px;width:100%;";
					el = doc.createElement("input");
					el.type = "checkbox";
					el.style.cssText = "margin:0;flex:none;";
					if (values[f.name]) el.checked = true;
					lab.style.cssText = "font-size:12px;opacity:.85;";
					row.appendChild(el);
					row.appendChild(lab);
				}
				else {
					row.style.cssText = "display:flex;flex-direction:column;gap:2px;width:100%;";
					lab.style.cssText = LABEL_CSS;
					if (f.type === "textarea") {
						el = doc.createElement("textarea");
						el.rows = 2;
						el.style.cssText = FIELD_CSS + "resize:vertical;min-height:38px;";
					}
					else if (f.type === "select") {
						el = doc.createElement("select");
						for (let o of [""].concat(f.options)) {
							let opt = doc.createElement("option");
							opt.value = o;
							opt.textContent = o || "—";
							el.appendChild(opt);
						}
						el.style.cssText = FIELD_CSS;
					}
					else {
						el = doc.createElement("input");
						el.type = "text";
						el.style.cssText = FIELD_CSS;
					}
					if (values[f.name] !== undefined) el.value = values[f.name];
					row.appendChild(lab);
					row.appendChild(el);
				}

				this._shieldFromReaderShortcuts(el, f.type);
				// Chaque champ écrit dans le tampon commun : ce qui est tapé pour
				// une couleur n'est pas perdu si l'on regarde une autre.
				let read = (f.type === "check")
					? () => (el.checked ? "true" : "")
					: () => String(el.value || "");
				let onEdit = () => { values[f.name] = read(); sync(); };
				el.addEventListener("input", onEdit);
				el.addEventListener("change", onEdit);
				body.appendChild(row);
			}
			renderHeader(hex);
			renderHint(hex, fields.length > 0);
			sync();
		};

		append(wrap);

		// Voie normale : le survol des pastilles de Zotero désigne la couleur.
		// Aucun clic supplémentaire — le geste reste « je survole, je tape, je
		// clique ». Le clic, lui, appartient à Zotero : il crée l'annotation.
		let btns = this.readerColorButtons(wrap);
		if (btns) {
			this.COLORS.forEach((c, i) => {
				let btn = btns[i];
				if (!btn) return;
				// Y compris les couleurs sans champ : le survol répond alors
				// « rien de configuré » au lieu de laisser le groupe précédent,
				// ce qui laissait croire que ces champs seraient enregistrés.
				let show = () => { if (current !== c.hex) renderGroup(c.hex); };
				btn.addEventListener("mouseenter", show);
				btn.addEventListener("focus", show);   // navigation au clavier
			});
			log("groupes de champs pilotés par les pastilles du lecteur");
		}
		else {
			// Repli : structure du popup non reconnue. Plutôt que de deviner,
			// on affiche nos propres pastilles.
			picker.style.display = "flex";
			let lab = doc.createElement("span");
			lab.textContent = this.t("form.fields");
			lab.style.cssText = "font-size:11px;opacity:.6;";
			picker.appendChild(lab);
			for (let c of colors) {
				let sw = doc.createElement("button");
				sw.type = "button";
				sw.title = c.name;
				sw.style.cssText = "width:14px;height:14px;padding:0;flex:none;"
					+ "border-radius:50%;border:1px solid rgba(128,128,128,.5);"
					+ "cursor:pointer;background:" + c.hex + ";";
				sw.addEventListener("click", (e) => {
					e.preventDefault();
					e.stopPropagation();
					renderGroup(c.hex);
				});
				picker.appendChild(sw);
			}
			log("pastilles du lecteur non reconnues : sélecteur de repli affiché");
		}

		renderGroup(current);
	},

	// ---- Menu contextuel des annotations du lecteur ----
	//
	// API officielle de Zotero (reader.js) : registerEventListener avec le type
	// « createAnnotationContextMenu ». Permet de viser UNE annotation précise
	// depuis le panneau latéral, plutôt que tout un document.
	// params.ids contient des CLÉS d'items (reader.js : annotation.key =
	// annotation.id), pas des identifiants numériques.

	_readerListener: null,

	registerReaderMenu() {
		try {
			if (!Zotero.Reader || !Zotero.Reader.registerEventListener) return;
			this._readerListener = (event) => {
				try {
					let { reader, params, append } = event;
					let keys = (params && params.ids) || [];
					if (!keys.length) return;
					append({
						label: keys.length > 1
							? Annota.t("menu.reader.many", { n: keys.length })
							: Annota.t("menu.reader.one"),
						onCommand: () => {
							Annota.runOnReaderAnnotations(reader, keys)
								.catch(e => log("runOnReaderAnnotations: " + e));
						}
					});
					if (AnnotaSpell && AnnotaSpell.available()) {
						append({
							label: Annota.t("menu.reader.spell"),
							onCommand: () => {
								Annota.spellReaderAnnotations(reader, keys)
									.catch(e => log("orthographe : " + e));
							}
						});
					}
					if (AnnotaChat) {
						append({
							label: Annota.t("menu.reader.ask"),
							onCommand: () => {
								AnnotaChat.quoteAnnotations(reader, keys)
									.catch(e => log("quoteAnnotations: " + e));
							}
						});
					}
				}
				catch (e) {
					log("createAnnotationContextMenu: " + e);
				}
			};
			Zotero.Reader.registerEventListener(
				"createAnnotationContextMenu", this._readerListener, "annota@equiriconi");
			log("Menu du lecteur enregistré");
		}
		catch (e) {
			log("registerReaderMenu: " + e);
		}
	},

	unregisterReaderMenu() {
		try {
			if (this._readerListener && Zotero.Reader
					&& Zotero.Reader.unregisterEventListener) {
				Zotero.Reader.unregisterEventListener(
					"createAnnotationContextMenu", this._readerListener);
			}
		}
		catch (e) { /* ignore */ }
		this._readerListener = null;
	},

	// Valeurs des champs d'une annotation écrite par Annota, pour les
	// réafficher dans sa carte du lecteur (card-fields.js).
	rememberFields(item, built, comment) {
		if (!AnnotaCardFields || !built || !built.values) return;
		if (!Object.keys(built.values).length) return;
		try { AnnotaCardFields.remember(item, built.values, built.refs, comment); }
		catch (e) { log("rememberFields: " + e); }
	},

	// ---- Orthographe et grammaire (spell.js) ----

	async spellSelection(window) {
		if (!AnnotaSpell) return;
		let items = [];
		try { items = window.ZoteroPane.getSelectedItems() || []; } catch (e) {}
		let targets = await AnnotaSpell.targetsFromSelection(items);
		await AnnotaSpell.review(window, targets);
	},

	async spellReaderAnnotations(reader, keys) {
		if (!AnnotaSpell) return;
		let att = await Zotero.Items.getAsync(reader.itemID);
		if (!att) return;
		let targets = [];
		for (let key of keys) {
			let it = await Zotero.Items.getByLibraryAndKeyAsync(att.libraryID, key);
			let t = AnnotaSpell.targetFromItem(it);
			if (t) targets.push(t);
		}
		await AnnotaSpell.review(Zotero.getMainWindow(), targets);
	},

	// Exécute le prompt sur les annotations visées dans le lecteur.
	// L'action étant explicite, elle écrase le commentaire existant : c'est ce
	// qui permet d'écrire sa paraphrase à la main puis de la faire mettre en
	// forme (mode « à la demande » + {{comment}}).
	async runOnReaderAnnotations(reader, keys, opts = {}) {
		let notReady = this.providerReadyError();
		if (notReady) {
			toast("Annota", notReady, "error");
			return;
		}
		let anns = [];
		try {
			let att = await Zotero.Items.getAsync(reader.itemID);
			if (!att) return;
			for (let key of keys) {
				let it = await Zotero.Items.getByLibraryAndKeyAsync(att.libraryID, key);
				if (it && it.isAnnotation && it.isAnnotation()) anns.push(it);
			}
		}
		catch (e) {
			log("runOnReaderAnnotations: résolution des clés : " + e);
			return;
		}
		if (!anns.length) return;
		return this.processAnnotations(anns, { overwrite: true, fields: opts.fields });
	},

	// ---- Menu contextuel (une entrée par fenêtre principale) ----

	_windows: new Map(),

	selectionIsRelevant(window) {
		try {
			let items = window.ZoteroPane.getSelectedItems();
			if (!items || !items.length) return false;
			return items.some(i =>
				(i.isAnnotation && i.isAnnotation())
				|| (i.isAttachment && i.isAttachment())
				|| (i.isNote && i.isNote())
				|| (i.isRegularItem && i.isRegularItem()));
		}
		catch (e) {
			return false;
		}
	},

	addToWindow(window) {
		try {
			if (this._windows.has(window)) return;
			let doc = window.document;
			let itemmenu = doc.getElementById("zotero-itemmenu");
			if (!itemmenu) return;

			let menu = doc.createXULElement("menu");
			menu.id = "annota-itemmenu";
			menu.setAttribute("label", "Annota");

			let popup = doc.createXULElement("menupopup");

			let missing = doc.createXULElement("menuitem");
			missing.setAttribute("label", this.t("menu.missing"));
			missing.addEventListener("command", () => {
				Annota.runBatch(window, { overwrite: false })
					.catch(e => log("runBatch: " + e));
			});
			popup.appendChild(missing);

			let all = doc.createXULElement("menuitem");
			all.setAttribute("label", this.t("menu.all"));
			all.addEventListener("command", () => {
				Annota.runBatch(window, { overwrite: true })
					.catch(e => log("runBatch: " + e));
			});
			popup.appendChild(all);

			// Reprise ciblée : ne touche que les annotations marquées en échec,
			// pour rattraper une coupure réseau ou un modèle indisponible sans
			// tout régénérer.
			let retry = doc.createXULElement("menuitem");
			retry.setAttribute("label", this.t("menu.retry"));
			retry.addEventListener("command", () => {
				Annota.runBatch(window, { failedOnly: true })
					.catch(e => log("runBatch: " + e));
			});
			popup.appendChild(retry);

			// Orthographe et grammaire : commentaires et notes de la sélection.
			if (AnnotaSpell && AnnotaSpell.available()) {
				popup.appendChild(doc.createXULElement("menuseparator"));
				let spell = doc.createXULElement("menuitem");
				spell.setAttribute("label", this.t("menu.spell"));
				spell.addEventListener("command", () => {
					Annota.spellSelection(window).catch(e => log("orthographe : " + e));
				});
				popup.appendChild(spell);
			}

			// Notes : surlignages glissés avec l'ancien gabarit, réduits à leur
			// citation (citelink.js).
			if (AnnotaCiteLink) {
				popup.appendChild(doc.createXULElement("menuseparator"));
				let entries = [
					["menu.reduce.selection", () => AnnotaCiteLink.reduce(window,
						AnnotaCiteLink.notesOfSelection(window))],
					["menu.reduce.library", async () => AnnotaCiteLink.reduce(window,
						await AnnotaCiteLink.notesOfLibrary(window.ZoteroPane.getSelectedLibraryID()))],
					["menu.reduce.undo", () => AnnotaCiteLink.undoLast(window)]
				];
				for (let [key, run] of entries) {
					let mi = doc.createXULElement("menuitem");
					mi.setAttribute("label", this.t(key));
					mi.addEventListener("command", () => {
						Promise.resolve().then(run).catch(e => log("réduction des notes : " + e));
					});
					popup.appendChild(mi);
				}
			}

			// Défilé des annotations sans champ, relance de l'IA sur des champs.
			if (AnnotaReview && AnnotaCardFields) {
				popup.appendChild(doc.createXULElement("menuseparator"));
				for (let [key, run] of [
					["menu.review", () => AnnotaReview.startReview(window, false)],
					["menu.refill", () => AnnotaReview.startRefill(window)],
					["menu.refill.undo", () => AnnotaReview.undoRefill(window)]
				]) {
					let mi = doc.createXULElement("menuitem");
					mi.setAttribute("label", this.t(key));
					mi.addEventListener("command", () => {
						Promise.resolve().then(run).catch(e => log("défilé : " + e));
					});
					popup.appendChild(mi);
				}
			}

			menu.appendChild(popup);
			itemmenu.appendChild(menu);

			// Menu Outils : le défilé sur toute la bibliothèque.
			let tools = doc.getElementById("menu_ToolsPopup");
			let toolsItem = null;
			if (tools && AnnotaReview && AnnotaCardFields) {
				toolsItem = doc.createXULElement("menuitem");
				toolsItem.id = "annota-tools-review";
				toolsItem.setAttribute("label", this.t("menu.review.lib"));
				toolsItem.addEventListener("command", () => {
					AnnotaReview.startReview(window, true).catch(e => log("défilé : " + e));
				});
				tools.appendChild(toolsItem);
			}

			// Masquer l'entrée quand la sélection ne peut porter aucune annotation.
			let onShowing = () => { menu.hidden = !Annota.selectionIsRelevant(window); };
			itemmenu.addEventListener("popupshowing", onShowing);

			let collToggle = null;
			try { collToggle = this.addCollectionToggle(window); }
			catch (e) { log("bouton replier les collections : " + e); }

			this._windows.set(window, { menu, itemmenu, onShowing, toolsItem, collToggle });
			log("Menu ajouté à la fenêtre");
		}
		catch (e) {
			log("addToWindow: " + e);
		}
	},

	// ---- Replier ou déplier toutes les collections ----
	//
	// Bouton à deux chevrons dans la barre au-dessus des collections. S'il y a
	// des collections ouvertes dans la bibliothèque en cours, il les replie
	// toutes (la bibliothèque reste ouverte) ; sinon, il déplie tout, comme
	// la touche « + » de Zotero.

	COLL_ICONS: {
		// Chevrons qui se rejoignent : replier.
		collapse: "M5 3.5 8 6.5 11 3.5M5 12.5 8 9.5 11 12.5",
		// Chevrons qui s'écartent : déplier.
		expand: "M5 6.5 8 3.5 11 6.5M5 9.5 8 12.5 11 9.5"
	},

	collIcon(kind) {
		let svg = "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'>"
			+ "<path d='" + this.COLL_ICONS[kind] + "' fill='none' stroke='context-fill'"
			+ " stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/></svg>";
		return "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")";
	},

	addCollectionToggle(window) {
		let doc = window.document;
		let bar = doc.getElementById("zotero-collections-toolbar");
		let add = doc.getElementById("zotero-tb-collection-add");
		if (!bar || doc.getElementById("annota-tb-collections-toggle")) return null;
		let b = doc.createXULElement("toolbarbutton");
		b.id = "annota-tb-collections-toggle";
		b.className = "zotero-tb-button";
		b.setAttribute("tabindex", "-1");
		b.style.setProperty("-moz-context-properties", "fill");
		b.style.setProperty("fill", "var(--fill-secondary)");
		let refresh = () => {
			let open = this.collectionsOpen(window);
			b.style.listStyleImage = this.collIcon(open ? "collapse" : "expand");
			let label = this.t(open ? "coll.collapse" : "coll.expand");
			b.setAttribute("tooltiptext", label);
			b.setAttribute("aria-label", label);
		};
		b.addEventListener("mouseenter", refresh);
		b.addEventListener("command", () => {
			this.toggleCollections(window).then(refresh, e => log("replier les collections : " + e));
		});
		if (add && add.nextSibling) bar.insertBefore(b, add.nextSibling);
		else bar.appendChild(b);
		refresh();
		return b;
	},

	// Arbre des collections et rang de la bibliothèque en cours.
	_collScope(window) {
		let tree = window.ZoteroPane && window.ZoteroPane.collectionsView;
		if (!tree || !tree._rowMap) return null;
		let libraryID = null;
		try {
			let r = tree.getRow(tree.selection.focused);
			libraryID = r && r.ref && r.ref.libraryID;
		}
		catch (e) {}
		if (!libraryID) libraryID = Zotero.Libraries.userLibraryID;
		let row = tree._rowMap["L" + libraryID];
		return row === undefined ? null : { tree, libraryID, row };
	},

	collectionsOpen(window) {
		let sc = this._collScope(window);
		if (!sc) return false;
		let { tree, libraryID, row } = sc;
		for (let i = row + 1; i < tree.rowCount; i++) {
			let r = tree.getRow(i);
			if (!r || !r.ref || r.ref.libraryID !== libraryID) break;
			if (tree.isContainer(i) && tree.isContainerOpen(i)) return true;
		}
		return false;
	},

	async toggleCollections(window) {
		let sc = this._collScope(window);
		if (!sc) return;
		let { tree, libraryID, row } = sc;
		if (!this.collectionsOpen(window)) {
			await tree.expandLibrary(libraryID, true);
			return;
		}
		// Comme collapseLibrary de Zotero, mais sans refermer la bibliothèque :
		// du bas vers le haut, pour que les rangs restent valables.
		let last = row;
		while (last + 1 < tree.rowCount) {
			let r = tree.getRow(last + 1);
			if (!r || !r.ref || r.ref.libraryID !== libraryID) break;
			last++;
		}
		let closed = [];
		for (let i = last; i > row; i--) {
			if (tree.isContainer(i) && tree.isContainerOpen(i)) {
				closed.push(tree.getRow(i).id);
				await tree._closeContainer(i);
			}
		}
		closed.forEach(id => { delete tree._containerState[id]; });
		tree.tree.invalidate();
		tree._saveOpenStates();
	},

	removeFromWindow(window) {
		let rec = this._windows.get(window);
		if (!rec) return;
		try { rec.itemmenu.removeEventListener("popupshowing", rec.onShowing); } catch (e) {}
		try { rec.menu.remove(); } catch (e) {}
		try { if (rec.toolsItem) rec.toolsItem.remove(); } catch (e) {}
		try { if (rec.collToggle) rec.collToggle.remove(); } catch (e) {}
		try { if (AnnotaReview) AnnotaReview.close(window); } catch (e) {}
		this._windows.delete(window);
	},

	removeFromAllWindows() {
		for (let window of Array.from(this._windows.keys())) {
			this.removeFromWindow(window);
		}
		this._windows.clear();
	},

	// Nettoie la sortie du modèle (retire d'éventuels blocs de code / espaces superflus).
	// Les modèles écrivent en Markdown même quand on le leur interdit. Le
	// commentaire d'une annotation Zotero n'en comprend rien : « **risque** »
	// s'affiche avec ses astérisques. On convertit donc vers les seules balises
	// que Zotero rend — <b>, <i>, <u> — plutôt que de compter sur la consigne.
	demarkdown(s) {
		// Code : les délimiteurs partent, le contenu reste.
		s = s.replace(/`([^`\n]+)`/g, "$1");
		// Gras avant italique : ** doit être consommé avant *.
		s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<b>$1</b>");
		s = s.replace(/(^|[^\w])__(?=\S)([\s\S]*?\S)__(?![\w])/g, "$1<b>$2</b>");
		s = s.replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\*)/g, "$1<i>$2</i>");
		// Souligné Markdown : bordé de non-mots, sinon « nom_de_champ » y passe.
		s = s.replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?![\w_])/g, "$1<i>$2</i>");
		// Titres et puces : pas de balise équivalente, on garde le texte.
		s = s.replace(/^#{1,6}\s+/gm, "");
		s = s.replace(/^\s*[-*+]\s+/gm, "• ");
		return s;
	},

	// Une valeur entièrement enveloppée dans une balise : le modèle a mis en
	// forme un champ qui a déjà son propre format déclaré. On déshabille — la
	// mise en forme appartient aux réglages, pas à la réponse.
	unwrapWholeTag(v) {
		for (let i = 0; i < 2; i++) {
			let m = String(v).match(/^<(b|i|u)>([\s\S]*)<\/\1>$/);
			if (!m || m[2].includes("</" + m[1] + ">")) break;
			v = m[2].trim();
		}
		return v;
	},

	sanitize(raw) {
		let s = String(raw).trim();
		s = s.replace(/^```[a-zA-Z]*\s*/, "").replace(/\s*```$/, "");
		s = this.demarkdown(s);
		s = s.replace(/\n{3,}/g, "\n\n").trim();
		return s;
	}
};

// ---- Cycle de vie du plugin (Zotero 7) ----

// Discussion : défini par chat.js, chargé au démarrage. Reste nul si le
// chargement échoue — les annotations n'en dépendent pas.
var AnnotaChat = null;

// Textes de l'interface (i18n.js). Sans eux, Annota.t() rend la clé.
var AnnotaI18n = null;

// Orthographe et grammaire (spell.js, macOS) ; vérification pendant la
// frappe dans les notes et les commentaires (spell-live.js).
var AnnotaSpell = null;
var AnnotaSpellLive = null;

// Champs de la couleur dans la carte d'annotation du lecteur (card-fields.js).
var AnnotaCardFields = null;
// Lien d'une citation glissée dans une note vers son surlignage (citelink.js).
var AnnotaCiteLink = null;

// Défilé des annotations sans champ et relance de l'IA (review.js).
var AnnotaReview = null;
var annotaLangObserver = null;

function install() {}

async function startup({ id, version, rootURI }) {
	Annota.init({ id, version, rootURI });
	try { Services.scriptloader.loadSubScript(rootURI + "i18n.js"); }
	catch (e) { log("i18n.js : " + e); }
	Annota.registerNotifier();
	Annota.registerReaderMenu();
	Annota.registerSelectionForm();

	try {
		Services.scriptloader.loadSubScript(rootURI + "chat.js");
		AnnotaChat.register();
	}
	catch (e) {
		log("discussion indisponible : " + e);
		AnnotaChat = null;
	}
	try {
		Services.scriptloader.loadSubScript(rootURI + "citelink.js");
		AnnotaCiteLink.start();
	}
	catch (e) {
		log("lien citation → surlignage indisponible : " + e);
		AnnotaCiteLink = null;
	}
	try { Services.scriptloader.loadSubScript(rootURI + "review.js"); }
	catch (e) {
		log("défilé et relance indisponibles : " + e);
		AnnotaReview = null;
	}
	try { Services.scriptloader.loadSubScript(rootURI + "spell.js"); }
	catch (e) {
		log("orthographe indisponible : " + e);
		AnnotaSpell = null;
	}
	try {
		Services.scriptloader.loadSubScript(rootURI + "card-fields.js");
		AnnotaCardFields.register();
	}
	catch (e) {
		log("champs de carte indisponibles : " + e);
		AnnotaCardFields = null;
	}
	try {
		Services.scriptloader.loadSubScript(rootURI + "spell-live.js");
		if (AnnotaSpell && AnnotaSpell.available()) AnnotaSpellLive.start();
	}
	catch (e) {
		log("orthographe en direct indisponible : " + e);
		AnnotaSpellLive = null;
	}

	// Exposé pour le script du panneau de préférences (prompt par défaut, reset).
	Zotero.Annota = Annota;

	// Langue changée dans les réglages : menus et discussion suivent.
	try {
		annotaLangObserver = Zotero.Prefs.registerObserver("annota.uiLanguage",
			() => { if (Annota) Annota.relocalize(); });
	}
	catch (e) { log("observateur de langue : " + e); }

	// L'identifiant du panneau sert au bouton « réglages » de la discussion.
	Promise.resolve(Zotero.PreferencePanes.register({
		pluginID: "annota@equiriconi",
		src: rootURI + "preferences.xhtml",
		scripts: [rootURI + "preferences.js"],
		stylesheets: [rootURI + "preferences.css"],
		label: "Annota"
	})).then(id => { if (Annota) Annota.prefPaneID = id; })
		.catch(e => log("PreferencePanes.register: " + e));

	// Fenêtres déjà ouvertes au moment de l'activation du plugin.
	for (let window of Zotero.getMainWindows()) {
		Annota.addToWindow(window);
		if (AnnotaChat) {
			try { AnnotaChat.addToWindow(window); }
			catch (e) { log("discussion, fenêtre : " + e); }
		}
	}

	log("Started (v" + version + ")");
}

function onMainWindowLoad({ window }) {
	if (Annota) Annota.addToWindow(window);
	if (AnnotaChat) {
		try { AnnotaChat.addToWindow(window); }
		catch (e) { log("discussion, fenêtre : " + e); }
	}
}

function onMainWindowUnload({ window }) {
	// Indispensable : conserver une référence à une fenêtre fermée fuirait.
	if (Annota) Annota.removeFromWindow(window);
	if (AnnotaChat) {
		try { AnnotaChat.removeFromWindow(window); } catch (e) {}
	}
}

function shutdown() {
	AnnotaReview = null;
	if (AnnotaCardFields) {
		try { AnnotaCardFields.unregister(); } catch (e) {}
	}
	AnnotaCardFields = null;
	if (AnnotaCiteLink) {
		try { AnnotaCiteLink.stop(); } catch (e) {}
	}
	AnnotaCiteLink = null;
	if (AnnotaSpellLive) {
		try { AnnotaSpellLive.stop(); } catch (e) {}
	}
	AnnotaSpellLive = null;
	if (annotaLangObserver) {
		try { Zotero.Prefs.unregisterObserver(annotaLangObserver); } catch (e) {}
		annotaLangObserver = null;
	}
	if (AnnotaChat) {
		try { AnnotaChat.unregister(); } catch (e) {}
	}
	AnnotaChat = null;
	if (Annota) {
		Annota.unregisterNotifier();
		Annota.unregisterReaderMenu();
		Annota.unregisterSelectionForm();
		Annota.removeFromAllWindows();
	}
	try { delete Zotero.Annota; } catch (e) {}
	Annota = undefined;
}

function uninstall() {}
