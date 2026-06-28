# Better Text Drawings (v14)

A small Foundry VTT module that adds the text-drawing options Foundry still
doesn't expose in its UI:

- **Multi-line text** — the drawing's text box becomes a multi-line field (type
  manual line breaks with <kbd>Enter</kbd>), plus an optional **word-wrap** mode
  that wraps long text to the drawing's width.
- **Text alignment** — left, center, or right.
- **Configurable text stroke (outline)** — set the outline **width** and
  **color** independently of the shape's stroke.

It is a modern, **Foundry VTT v13 / v14** compatible reimplementation inspired by
[ruipin's original *Better Text Drawings*](https://github.com/ruipin/fvtt-better-text-drawings),
which was never updated for Foundry v10+.

> Verified against Foundry VTT **v14** (Stable). Minimum supported core: **v13**.

## Installation

In Foundry's **Setup → Add-on Modules → Install Module**, paste this manifest URL:

```
https://github.com/Limpbark/fvtt-better-text-drawings-v14/releases/latest/download/module.json
```

Then enable **Better Text Drawings (v14)** in your world's module settings.

### Recommended

Install [**libWrapper**](https://foundryvtt.com/packages/lib-wrapper). It is
**optional** — the module ships a built-in fallback wrapper — but libWrapper
gives the best compatibility when several modules touch the same drawing
internals.

## Usage

1. Create or select a **Text** drawing (or any drawing that has text).
2. Open its configuration sheet — the **Text** tab now has a **Better Text
   Drawings** section.
3. Set alignment, word wrap, and the text stroke width/color. The main text box
   accepts multiple lines.

World-level defaults (alignment, word wrap, stroke width/color) are available in
**Game Settings → Configure Settings → Better Text Drawings (v14)**. A drawing's
own settings always override the world defaults; choosing *Foundry default*
leaves core behavior untouched.

## How it works

- Wraps `Drawing.prototype._getTextStyle()` (via libWrapper when present,
  otherwise a direct prototype wrap) and augments the returned `PIXI.TextStyle`
  with alignment, word-wrap, and stroke. Stroke is applied in a way that works
  for both PIXI v7 (`strokeThickness`) and PIXI v8 (`stroke` object).
- Injects its controls into the ApplicationV2 `DrawingConfig` via the
  `renderDrawingConfig` hook. Settings are stored as document flags under
  `flags.better-text-drawings-v14.*` and saved automatically by the sheet.
- Forces a text refresh when only its flags change.

## Compatibility notes

- Built for Foundry's modern (v13+) ApplicationV2 drawing config and the
  `_getTextStyle()` / `_refreshText()` text pipeline.
- No core data is overwritten — everything lives in module flags and a
  non-destructive style wrapper, so disabling the module cleanly reverts to
  vanilla rendering.

## License

[MIT](LICENSE). Not affiliated with the original module's author; this is an
independent reimplementation for current Foundry versions.
