# Architecture

This app is a browser-only icon generator. Users compose a foreground image,
text, or Lucide icon over a background and shape, preview the result live, and
export a multi-platform ZIP. There is no backend, database, auth, or server-side
state.

## State Model

The whole app derives from one state object:

- `IconConfig` in `src/types/icon.ts` is the single source of design state.
- `src/components/IconStudio.tsx` owns the state and passes each panel a
  `config` value plus an `update(patch)` callback.
- Panels must not keep duplicate copies of `IconConfig` fields in local state.
- `src/app/page.tsx` is only an `ssr: false` dynamic wrapper so the studio can
  read persisted state during initialization.
- Persistence lives in `src/lib/configStorage.ts`, which owns debounced
  localStorage autosave and the sanitizer used for `icon-config.json` imports.
  New `IconConfig` fields must be added to its parser.

## Rendering

`drawIcon()` in `src/lib/renderIcon.ts` is the rendering core shared by the live
preview canvas and offscreen export renderer.

The key rendering concept is `RenderVariant`: the same config renders
differently per target. Current examples include:

- `masked` for previews;
- `fullBleed` for iOS and Play Store assets that apply their own mask;
- `adaptiveForeground` and `adaptiveBackground` for Android adaptive layers;
- `maskable` for PWA assets.

Each variant declares clip, background, foreground, and `fgScale` behavior.
Platform safe-zone changes should usually be represented as a render variant
instead of a second renderer.

## Exporting

Exporting is owned by the `src/modules/exporting` module.

- `src/modules/exporting/lib/exportPresets.ts` is the platform registry.
- `src/modules/exporting/lib/exportZip.ts` walks selected platforms, renders
  files, and packages ZIP output with JSZip.
- `src/modules/exporting/lib/ico.ts` encodes multi-resolution `.ico` bundles.
- `src/modules/exporting/components/ExportPanel.tsx` renders the export UI.
- `src/modules/exporting/hooks/useIconExport.ts` coordinates export state and
  user-visible progress.

The export panel UI, file-list preview, README content, and ZIP contents all
derive from the registry. Adding an export target should usually mean adding a
registry entry, not branching UI code.

The export implementation lives solely inside this module; import it through the
`@/modules/exporting` barrel. The former `src/lib/*` and `src/components/*`
compatibility shims have been removed.

## Saved Designs

Saved-design persistence and UI are owned by the `src/modules/saved-designs`
module.

- `src/modules/saved-designs/lib/savedDesigns.ts` owns the localStorage key,
  trust-boundary parsing, snapshot creation, and maximum saved-design count.
- `src/modules/saved-designs/hooks/useSavedDesigns.ts` coordinates browser
  persistence with React state.
- `src/modules/saved-designs/components/SavedDesignsPanel.tsx` renders the
  saved-design controls.

The saved-design implementation lives solely inside this module; import it
through the `@/modules/saved-designs` barrel. The former `src/lib/savedDesigns.ts`
and `src/components/*` compatibility shims have been removed.

## Design Specs

`docs/superpowers/specs/` holds design specs for larger changes. Use those specs
with `docs/superpowers/plans/` when implementing multi-step work.
