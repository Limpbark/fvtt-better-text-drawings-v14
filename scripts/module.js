/**
 * Better Text Drawings (v14)
 * ---------------------------------------------------------------------------
 * Adds multi-line text, text alignment, and a configurable text stroke
 * (outline) to Foundry VTT text drawings.
 *
 * Strategy (Foundry v13 / v14):
 *   - The Drawing placeable builds its PIXI text style in `_getTextStyle()`.
 *     We *wrap* that method (via libWrapper when available, otherwise a direct
 *     prototype wrap) and mutate the returned style according to per-drawing
 *     flags and world-level defaults. Wrapping the result means we layer on top
 *     of whatever Foundry computes natively, so we stay robust to core changes.
 *   - `DrawingConfig` is an ApplicationV2 in v13+. We inject our extra controls
 *     into its rendered HTML via the `renderDrawingConfig` hook. Fields named
 *     `flags.<id>.<key>` are persisted automatically by the document sheet.
 *   - When only our flags change we ask the placeable to refresh its text.
 *
 * MIT Licensed.
 */

const MODULE_ID = "better-text-drawings-v14";

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/**
 * Read a per-drawing flag, returning undefined when unset.
 * @param {DrawingDocument} doc
 * @param {string} key
 * @returns {*}
 */
function getFlag(doc, key) {
	return doc?.flags?.[MODULE_ID]?.[key];
}

/**
 * Read a world-level setting, swallowing errors if it isn't registered yet.
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
function getSetting(key, fallback) {
	try {
		const value = game.settings.get(MODULE_ID, key);
		return value === undefined ? fallback : value;
	} catch (_err) {
		return fallback;
	}
}

/**
 * Apply a stroke to a PIXI TextStyle, handling both PIXI v7 (strokeThickness)
 * and PIXI v8 (stroke as an object) representations.
 * @param {PIXI.TextStyle} style
 * @param {string} color  Hex color string, e.g. "#111111"
 * @param {number} width  Stroke width in pixels
 */
function applyStroke(style, color, width) {
	const major = Number(String(globalThis.PIXI?.VERSION ?? "7").split(".")[0]) || 7;
	if (major >= 8) {
		// PIXI v8: stroke is a fill-style-like object.
		style.stroke = { color, width };
	} else {
		// PIXI v7 (Foundry v11-v14): separate color + thickness.
		style.stroke = color;
		style.strokeThickness = width;
	}
}

/**
 * Resolve the wrap width for a drawing from its shape, in canvas pixels.
 * @param {Drawing} drawing
 * @returns {number}
 */
function getWrapWidth(drawing) {
	const fromShape = Number(drawing?.document?.shape?.width);
	if (Number.isFinite(fromShape) && fromShape > 0) return fromShape;
	const fromBounds = Number(drawing?.bounds?.width);
	if (Number.isFinite(fromBounds) && fromBounds > 0) return fromBounds;
	return 0;
}

/**
 * Mutate a freshly-built text style with this module's options.
 * @param {Drawing} drawing       The Drawing placeable (`this` from _getTextStyle)
 * @param {PIXI.TextStyle} style  The style returned by core's _getTextStyle
 * @returns {PIXI.TextStyle}
 */
function applyTextOptions(drawing, style) {
	if (!style) return style;
	const doc = drawing?.document;
	if (!doc) return style;

	/* Alignment ------------------------------------------------------------ */
	const align = getFlag(doc, "textAlign") || getSetting("defaultTextAlign", "");
	if (align) style.align = align;

	/* Multi-line / word wrap ---------------------------------------------- */
	let wrap = getFlag(doc, "wordWrap");
	if (!wrap) wrap = getSetting("defaultWordWrap", "");
	if (wrap === "on") {
		style.wordWrap = true;
		style.breakWords = true;
		const width = getWrapWidth(drawing);
		if (width > 0) style.wordWrapWidth = width;
	} else if (wrap === "off") {
		style.wordWrap = false;
	}

	/* Text stroke (outline) ----------------------------------------------- */
	let strokeWidth = Number(getFlag(doc, "strokeWidth") ?? NaN);
	let strokeColor = getFlag(doc, "strokeColor");
	if (!Number.isFinite(strokeWidth) || strokeWidth <= 0) {
		// Fall back to the world default stroke when the drawing has none set.
		const defaultWidth = Number(getSetting("defaultStrokeWidth", 0)) || 0;
		if (defaultWidth > 0) {
			strokeWidth = defaultWidth;
			strokeColor = strokeColor || getSetting("defaultStrokeColor", "#111111");
		}
	}
	if (Number.isFinite(strokeWidth) && strokeWidth > 0) {
		applyStroke(style, strokeColor || "#111111", strokeWidth);
	}

	return style;
}

/* -------------------------------------------- */
/*  Wrapping Drawing.prototype._getTextStyle    */
/* -------------------------------------------- */

function installTextStyleWrapper() {
	const cls = CONFIG?.Drawing?.objectClass;
	if (!cls?.prototype) {
		console.error(`${MODULE_ID} | Could not locate the Drawing placeable class to wrap.`);
		return;
	}

	const useLibWrapper = game.modules.get("lib-wrapper")?.active && globalThis.libWrapper;
	if (useLibWrapper) {
		libWrapper.register(
			MODULE_ID,
			"CONFIG.Drawing.objectClass.prototype._getTextStyle",
			function (wrapped, ...args) {
				const style = wrapped.call(this, ...args);
				return applyTextOptions(this, style);
			},
			"WRAPPER"
		);
		console.log(`${MODULE_ID} | Registered _getTextStyle wrapper via libWrapper.`);
		return;
	}

	// Manual fallback wrap (idempotent).
	const proto = cls.prototype;
	const original = proto._getTextStyle;
	if (typeof original !== "function") {
		console.error(`${MODULE_ID} | Drawing.prototype._getTextStyle is not a function; cannot wrap.`);
		return;
	}
	if (original.__btdWrapped) return;

	function wrapper(...args) {
		const style = original.apply(this, args);
		return applyTextOptions(this, style);
	}
	wrapper.__btdWrapped = true;
	wrapper.__btdOriginal = original;
	proto._getTextStyle = wrapper;
	console.log(`${MODULE_ID} | Registered _getTextStyle wrapper (manual fallback). Install "libWrapper" for best compatibility.`);
}

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

function refreshAllDrawings() {
	const placeables = canvas?.drawings?.placeables ?? [];
	for (const d of placeables) {
		try {
			d.renderFlags?.set({ refreshText: true });
		} catch (_err) {
			d.draw?.();
		}
	}
}

Hooks.once("init", () => {
	const ALIGN_CHOICES = {
		"": "BTD.Settings.AlignChoice.coreDefault",
		left: "BTD.Align.left",
		center: "BTD.Align.center",
		right: "BTD.Align.right"
	};
	const WRAP_CHOICES = {
		"": "BTD.Settings.WrapChoice.coreDefault",
		on: "BTD.Wrap.on",
		off: "BTD.Wrap.off"
	};

	game.settings.register(MODULE_ID, "defaultTextAlign", {
		name: "BTD.Settings.defaultTextAlign.name",
		hint: "BTD.Settings.defaultTextAlign.hint",
		scope: "world",
		config: true,
		type: String,
		choices: ALIGN_CHOICES,
		default: "",
		onChange: refreshAllDrawings
	});

	game.settings.register(MODULE_ID, "defaultWordWrap", {
		name: "BTD.Settings.defaultWordWrap.name",
		hint: "BTD.Settings.defaultWordWrap.hint",
		scope: "world",
		config: true,
		type: String,
		choices: WRAP_CHOICES,
		default: "",
		onChange: refreshAllDrawings
	});

	game.settings.register(MODULE_ID, "defaultStrokeWidth", {
		name: "BTD.Settings.defaultStrokeWidth.name",
		hint: "BTD.Settings.defaultStrokeWidth.hint",
		scope: "world",
		config: true,
		type: Number,
		default: 0,
		onChange: refreshAllDrawings
	});

	game.settings.register(MODULE_ID, "defaultStrokeColor", {
		name: "BTD.Settings.defaultStrokeColor.name",
		hint: "BTD.Settings.defaultStrokeColor.hint",
		scope: "world",
		config: true,
		type: String,
		default: "#111111",
		onChange: refreshAllDrawings
	});
});

Hooks.once("setup", () => {
	installTextStyleWrapper();
});

/* -------------------------------------------- */
/*  DrawingConfig UI injection                  */
/* -------------------------------------------- */

/**
 * Build a Foundry-styled form-group containing a single control.
 * @param {string} label
 * @param {HTMLElement} control
 * @param {string} [hint]
 * @returns {HTMLDivElement}
 */
function formGroup(label, control, hint) {
	const group = document.createElement("div");
	group.classList.add("form-group");

	const lbl = document.createElement("label");
	lbl.textContent = label;
	group.appendChild(lbl);

	const fields = document.createElement("div");
	fields.classList.add("form-fields");
	fields.appendChild(control);
	group.appendChild(fields);

	if (hint) {
		const p = document.createElement("p");
		p.classList.add("hint");
		p.textContent = hint;
		group.appendChild(p);
	}
	return group;
}

function makeSelect(name, choices, value) {
	const select = document.createElement("select");
	select.name = name;
	for (const [key, labelKey] of Object.entries(choices)) {
		const opt = document.createElement("option");
		opt.value = key;
		opt.textContent = game.i18n.localize(labelKey);
		if (key === (value ?? "")) opt.selected = true;
		select.appendChild(opt);
	}
	return select;
}

function makeNumber(name, value) {
	const input = document.createElement("input");
	input.type = "number";
	input.name = name;
	input.min = "0";
	input.step = "1";
	input.dataset.dtype = "Number";
	input.value = (value ?? "") === "" ? "" : String(value);
	input.placeholder = "0";
	return input;
}

function makeColor(name, value) {
	const input = document.createElement("input");
	input.type = "color";
	input.name = name;
	input.value = value || "#111111";
	return input;
}

Hooks.on("renderDrawingConfig", (app, html, _context, _options) => {
	// ApplicationV2 passes an HTMLElement; legacy FormApplication passes jQuery.
	const root = html instanceof HTMLElement ? html : (html?.[0] ?? null);
	if (!root) return;

	// Avoid duplicate injection across re-renders.
	if (root.querySelector(`.${MODULE_ID}-section`)) return;

	const doc = app.document ?? app.object;
	if (!doc) return;

	const L = (key) => game.i18n.localize(key);

	/* Find the "text" area of the sheet to anchor our controls. */
	const textField = root.querySelector('[name="text"]');
	const anchorField = textField
		|| root.querySelector('[name="fontFamily"]')
		|| root.querySelector('[name="fontSize"]');
	let container =
		anchorField?.closest('.tab[data-tab="text"]') ||
		anchorField?.closest('[data-application-part="text"]') ||
		anchorField?.closest('.tab') ||
		anchorField?.closest('fieldset') ||
		anchorField?.parentElement ||
		root;

	/* Upgrade the single-line text input to a textarea for true multi-line. */
	if (textField && textField.tagName === "INPUT") {
		const textarea = document.createElement("textarea");
		textarea.name = textField.name;
		textarea.value = textField.value ?? doc.text ?? "";
		textarea.rows = 3;
		textarea.classList.add(`${MODULE_ID}-textarea`);
		for (const cls of textField.classList) textarea.classList.add(cls);
		textField.replaceWith(textarea);
	}

	/* Build our controls. */
	const ALIGN_CHOICES = {
		"": "BTD.Align.inherit",
		left: "BTD.Align.left",
		center: "BTD.Align.center",
		right: "BTD.Align.right"
	};
	const WRAP_CHOICES = {
		"": "BTD.Wrap.inherit",
		on: "BTD.Wrap.on",
		off: "BTD.Wrap.off"
	};

	const fieldset = document.createElement("fieldset");
	fieldset.classList.add(`${MODULE_ID}-section`);

	const legend = document.createElement("legend");
	legend.textContent = L("BTD.SectionTitle");
	fieldset.appendChild(legend);

	fieldset.appendChild(
		formGroup(
			L("BTD.Fields.align.label"),
			makeSelect(`flags.${MODULE_ID}.textAlign`, ALIGN_CHOICES, getFlag(doc, "textAlign") ?? ""),
			L("BTD.Fields.align.hint")
		)
	);

	fieldset.appendChild(
		formGroup(
			L("BTD.Fields.wrap.label"),
			makeSelect(`flags.${MODULE_ID}.wordWrap`, WRAP_CHOICES, getFlag(doc, "wordWrap") ?? ""),
			L("BTD.Fields.wrap.hint")
		)
	);

	fieldset.appendChild(
		formGroup(
			L("BTD.Fields.strokeWidth.label"),
			makeNumber(`flags.${MODULE_ID}.strokeWidth`, getFlag(doc, "strokeWidth")),
			L("BTD.Fields.strokeWidth.hint")
		)
	);

	fieldset.appendChild(
		formGroup(
			L("BTD.Fields.strokeColor.label"),
			makeColor(`flags.${MODULE_ID}.strokeColor`, getFlag(doc, "strokeColor")),
			L("BTD.Fields.strokeColor.hint")
		)
	);

	container.appendChild(fieldset);

	// Some ApplicationV2 sheets size themselves to content; nudge a reflow so
	// the new controls are visible. Guarded since not every layout supports it.
	try {
		if (typeof app.setPosition === "function") app.setPosition({ height: "auto" });
	} catch (_err) {
		/* fixed-height/scrolling sheet — nothing to do */
	}
});

/* -------------------------------------------- */
/*  Refresh text when only our flags change     */
/* -------------------------------------------- */

Hooks.on("updateDrawing", (doc, changed, _options, _userId) => {
	if (!foundry.utils.hasProperty(changed, `flags.${MODULE_ID}`)) return;
	const placeable = doc.object;
	if (!placeable) return;
	try {
		placeable.renderFlags.set({ refreshText: true });
	} catch (_err) {
		placeable.draw?.();
	}
});
