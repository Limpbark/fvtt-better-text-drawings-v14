# Changelog

## 1.0.0 — 2026-06-28

Initial release. Foundry VTT v13/v14 compatible.

- Multi-line text drawings (multi-line text box + optional word wrap).
- Text alignment: left / center / right.
- Configurable text stroke (outline) width and color.
- World-level defaults for alignment, word wrap, and stroke.
- Non-destructive: wraps `Drawing.prototype._getTextStyle()` (libWrapper-aware,
  with a built-in fallback) and stores per-drawing options as document flags.
