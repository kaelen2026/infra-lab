# Design System

This app uses a dense terminal-studio interface: dark, precise, compact, and
tool-like. The UI should feel like a production design utility, not a marketing
site or decorative dashboard.

## Principles

- Put the usable tool first. Landing copy may exist below the studio, but the
  first screen stays focused on editing, previewing, and exporting icons.
- Prefer dense, scannable controls over large decorative cards.
- Keep interaction predictable: one `IconConfig` state object, direct panel
  controls, immediate preview feedback, and explicit export status.
- Favor small, square, technical surfaces. Rounded corners are restrained.
- Use visual ornament only when it communicates actual icon output, platform
  previews, or generated assets.

## Tokens

The canonical tokens live in `src/app/globals.css` and are exposed through
Tailwind theme names. Do not introduce one-off hex colors in components unless
the value is user-generated preview content or a standards-required asset color.

| Token | Use |
| --- | --- |
| `ink` | Page and panel base background |
| `panel` | Raised sections when a second background step is needed |
| `panel-2` | Inputs, wells, active segmented controls |
| `hairline` | 1px dividers and default borders |
| `hairline-bright` | Hover/focus border emphasis |
| `text` | Primary readable text |
| `text-dim` | Secondary labels and inactive control text |
| `text-faint` | Metadata, captions, section labels |
| `accent` | Primary action, selected state, live values |
| `accent-dim` | Selected state background |

Semantic color exceptions:

- Use red only for destructive actions and errors.
- Use amber only for non-blocking import/export notes.
- User-selected icon/background colors may render arbitrary colors inside
  previews and swatches.

## Typography

- Font family: Geist Mono via `font-mono`; keep the app monospaced.
- Section labels use `text-[11px]`, `tracking-[0.18em]`, and `text-text-faint`.
- Compact body copy uses `text-[11px]` to `text-[13px]`.
- Tool controls use `text-[11px]` or `text-xs`; reserve larger text for landing
  H1/H2 copy below the studio.
- Do not use negative letter spacing or viewport-scaled font sizes.

## Layout

- Desktop studio layout is a three-column grid: controls, preview, export.
- Mobile layout stacks the header, preview, controls, and export areas without
  horizontal overflow.
- Use hairline borders to divide tool regions; avoid nested cards.
- Repeated items may use bordered cards only when each item is a distinct saved
  design, variation, platform preview, or file row.
- Fixed-format UI elements need stable dimensions: icon buttons, swatches,
  preview tiles, tab controls, and platform cells should not resize on hover or
  when state changes.
- Keep cards and controls at `rounded-sm` or smaller unless representing a real
  platform icon mask.

## Controls

- Buttons are commands. Use text buttons for explicit commands such as
  `download .zip`, `reset`, `import`, `save current`, and platform actions.
- Segmented controls represent mutually exclusive modes: foreground mode,
  background type, and font selection.
- Checkboxes represent platform inclusion.
- Sliders represent numeric transform values and must show the current value.
- Color inputs must stay square and adjacent to their label.
- File upload must support click and drag/drop, and must show clear errors for
  unsupported files.
- Active state uses `accent` text/border or `accent-dim` background.
- Disabled state must use reduced opacity and preserve layout.

## Accessibility

- Every interactive control must have an accessible name that matches the user
  intent. Icon-only or preview-like controls need `title`, visible text, or an
  `aria-label`.
- Avoid relying on color alone for state. Pair selected state with borders,
  active labels, checkmarks, or text changes.
- Keep native controls where they are sufficient: `input[type="range"]`,
  `input[type="color"]`, `input[type="checkbox"]`, `input[type="file"]`.
- Preserve keyboard behavior for all controls. Do not replace native inputs with
  non-semantic divs.
- Test new component interactions with Testing Library role/name queries when
  practical.

## Component Patterns

Panels:

- Each panel receives `config` plus an `onChange(patch)` callback.
- Panels emit partial `IconConfig` patches and do not keep duplicated config
  state.
- Local UI state is allowed only for ephemeral concerns such as search text,
  upload error messages, and generated thumbnails.

Preview:

- Live canvas and export rendering must share `drawIcon()` / `renderIcon()`.
- Platform previews must show real output states, not decorative placeholders.
- Use generated bitmap/data URLs for previews rather than hand-drawn stand-ins.

Export:

- Platform UI, manifest previews, README content, and ZIP output must derive
  from `src/lib/exportPresets.ts`.
- Adding an export target means adding registry data first, then letting the UI
  derive from it.

Landing content:

- Landing copy is allowed below the tool for SEO, but it must be quiet and
  text-focused.
- Do not add hero cards, decorative gradient blobs, or stock imagery to the tool
  pages.

## Constraints

Must:

- Use existing design tokens and semantic Tailwind names.
- Keep mobile free of horizontal page overflow.
- Keep section dividers and tool surfaces visually consistent with the terminal
  studio style.
- Add or update tests when a component interaction, state path, or accessibility
  label changes.

Must not:

- Add backend routes, auth, databases, or server-only UI dependencies.
- Add ornamental gradients, floating decorative cards, oversized marketing hero
  sections, or unrelated illustration.
- Introduce broad UI libraries for basic controls.
- Use arbitrary hex colors in components for core UI styling.
- Use large border radii for tool surfaces except when previewing real icon
  masks.

## Verification

For UI changes, run:

```sh
pnpm lint:design
pnpm test:component
pnpm test:e2e
pnpm test:e2e:prod
pnpm quality
```

Run `pnpm test:coverage` when adding or changing tested component behavior.
