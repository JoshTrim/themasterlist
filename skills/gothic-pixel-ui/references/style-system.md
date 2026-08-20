# Gothic pixel interface system

This reference captures the transferable visual system behind The Master List. It is palette-independent: reproduce the relationships and construction techniques, not its exact magenta and purple values.

## 1. Art direction

The interface should feel like a useful modern application rendered through a late-era 16-bit game menu, a gothic inventory screen, and an imperfect CRT. The order matters:

1. The product remains understandable and efficient.
2. Pixel geometry establishes the game-like language.
3. Atmospheric texture gives it character.

Avoid generic cyberpunk dashboards, rounded SaaS cards, excessive neon, fake command-line copy, and ornamental noise on every surface.

## 2. Semantic palette

Create semantic tokens, including RGB triplets where alpha variants are needed:

| Role | Purpose | Relationship |
| --- | --- | --- |
| `bg-deep` | page edge, vignette, hard shadow | darkest value |
| `bg` | main canvas | slightly lighter than `bg-deep` |
| `surface` | cards and grouped controls | clearly distinct from `bg` |
| `surface-raised` | menus, selected panels, modals | lighter or more saturated than `surface` |
| `border` | ordinary structure | visible without glow |
| `border-strong` | interactive/selected structure | stronger than `border`, below accent |
| `accent` | primary actions, focus, active state | brightest chromatic anchor |
| `accent-2` | charts, secondary energy, special state | hue-separated from `accent` |
| `text` | headings and primary content | near-white or near-black for theme |
| `text-soft` | ordinary body copy | quieter but WCAG-readable |
| `text-muted` | metadata and helper copy | never the sole carrier of critical info |
| `success`, `warning`, `danger`, `info` | semantic state | meaning must stay stable across palettes |

Use four or five background/surface values but only one dominant accent. Repeated raw hex codes are a sign that a missing semantic token should be added.

## 3. Typography

Use a three-level type stack:

- Display: `"Press Start 2P"` or another bitmap face. Use for page titles, compact headings, navigation, badges, and button labels. Keep it small; bitmap fonts visually occupy more space than their CSS size suggests.
- Reading: `"VT323"` or another legible pixel/terminal face. Use for body copy, values, forms, lists, and descriptions at roughly 18–22px on desktop.
- Dense mono: `"DM Mono"` or the system monospace stack. Optional for timestamps and highly compact technical data.

Use uppercase selectively for labels, not paragraphs. Tighten display tracking slightly. Keep body line-height around 1.35–1.55. Long text must use the reading face.

## 4. Geometry and spacing

- Corners are square. A rare circle is reserved for controls that are intrinsically radial, such as timeline markers.
- Borders are 1px for ordinary grouping and 2px for interactive or primary surfaces.
- Use a consistent 4px spacing base. Typical gaps are 8, 12, 16, 20, 24, 32, and 40px.
- Use hard shadows such as `4px 4px 0 var(--shadow)`. Interactive elements can move `-1px -1px` on hover and `1px 1px` on press.
- Use inset 2–3px dark edges to make controls feel stamped into the screen.
- Prefer grid alignment and visible subdivisions over floating cards.
- Keep a comfortable maximum content width, approximately 1180–1240px, with at least 16–24px mobile gutters.

## 5. Layer recipe

A typical panel has four layers:

1. An opaque or nearly opaque dark surface.
2. A subtle directional gradient between adjacent surface values.
3. A crisp border.
4. Either a hard offset shadow or a faint inset accent glow—not every effect at maximum strength.

A primary button uses a strong border and solid/near-solid accent surface. A secondary button uses a surface color with an accent border. A destructive button uses the semantic danger color rather than the normal accent.

## 6. Core components

### Panels and cards

Use structured internal zones: header, content, metadata/action row. A one-pixel divider or a slight surface shift is preferable to nesting several rounded cards. Hoverable cards may lift one or two pixels.

### Buttons

- Minimum touch target: 44x44px when icon-only or on coarse pointers.
- Display font at 8–11px, uppercase only when labels stay short.
- Hard shadow in rest state; reduce or remove it during press.
- Keep icon-only buttons square and provide an accessible label.

### Inputs and selects

- Dark inset surface, 2px border, square corners, strong text.
- Reading font around 18–20px.
- Focus changes border, adds a restrained halo, and remains visible without color alone where possible.
- Replace the native select arrow only when the custom arrow remains robust across browsers.
- Style file-selector buttons explicitly.

### Checkboxes and toggles

Build from square geometry. Use a border and inset shadow when empty; selected state uses the accent plus a dark inner cutout or unmistakable mark.

### Progress and charts

Use a dark trough with a crisp border. The fill may use a two-color gradient and restrained glow. Never let glow obscure the exact endpoint.

### Accordions and menus

Use a border and subtle surface shift. A small geometric marker (`▸`, `+`, or a CSS triangle) changes orientation/state. Avoid oversized disclosure controls.

### Media

Frame media with the visual system, but keep pixels, CRT scanlines, noise, and color filters off the media itself. Use `isolation`, stacking contexts, and overlay z-index rules so video and photography remain clean.

## 7. CRT and screen texture

The effect should be perceived before it is consciously noticed:

- Fine horizontal scanlines at roughly a 4px repeat.
- Very faint three-channel vertical phosphor structure.
- Low-opacity fractal/static noise that changes in discrete steps.
- Broad edge vignette and mild glass highlight.
- Extremely subtle luminance variation.

All overlay layers need `pointer-events: none`. Put them above interface chrome only when text remains clear, and below media or explicitly exempt media. Do not use a bright horizontal line endlessly scrolling down the screen. Honor `prefers-reduced-motion` by disabling noise/flicker animation.

## 8. Imagery and pixel assets

Use `image-rendering: pixelated` for actual low-resolution sprites, not photographs. Pixel assets should have a hard silhouette plus one atmospheric halo. Photographs can receive a framed crop and a subtle scanline layer in the frame, but avoid destructive filters that hide faces or artifacts.

## 9. Motion

- Hover/press: 80–150ms.
- Panel reveal: 200–350ms with `steps()` when a game-like cadence helps.
- Ambient CRT variation: slow (6–12s) or fast, nearly invisible stepped noise; avoid obvious repetitive movement.
- Loading/progress motion may be continuous because it communicates state.
- Always provide a reduced-motion path.

## 10. Responsive behavior

Do not merely shrink the desktop composition.

- Collapse multi-column forms and cards to one column between 640–760px as content requires.
- Convert desktop navigation to a clear mobile menu before links wrap onto multiple rows.
- Stack metadata deliberately; do not rely on accidental flex wrapping.
- Keep text inputs at least 16px to avoid mobile browser zoom.
- Increase timeline markers and icon targets for coarse pointers.
- Let long display-font labels wrap; never reduce them below legibility to preserve one line.
- Test at 360px, 390px, 430px, 768px, and a desktop width, plus landscape mobile for media experiences.

## 11. Accessibility and quality checks

- Visible `:focus-visible` state on every interactive element.
- Text contrast of at least 4.5:1 for normal copy and 3:1 for large text/UI boundaries where applicable.
- Color is never the only status cue.
- Icon-only controls have accessible names.
- Overlays do not capture pointer events.
- Decorative layers are hidden from assistive technology.
- Empty, loading, error, disabled, selected, and long-content states use the same design system.
- No horizontal page overflow at mobile widths.

## 12. What makes it miss

- Applying a pixel font while leaving rounded, soft-shadowed SaaS components unchanged.
- Using glow as the border.
- Making every surface equally saturated.
- Putting the display face on long-form content.
- Covering video or photography with the global CRT layer.
- Adding decorative retro copy that makes actions less clear.
- Using tiny desktop buttons on touch devices.
- Copying the reference palette when a new palette was requested.

## 13. Porting sequence

1. Map the existing UI inventory and states.
2. Define semantic palette and type tokens.
3. Implement canvas, shell, type, focus, and CRT atmosphere.
4. Implement panel, button, input, select, checkbox, badge, and progress primitives.
5. Convert the highest-traffic page, then use it to calibrate density and contrast.
6. Convert remaining pages without introducing page-specific raw colors.
7. Test responsive states and input methods.
8. Remove stale styles and consolidate repeated values into tokens.
