---
name: gothic-pixel-ui
description: Design or restyle functional web applications with The Master List's gothic pixel-art and restrained CRT visual language while allowing an entirely different semantic color palette. Use for pixel UI, retro game UI, dungeon-computer, arcade terminal, or CRT/VCR-inspired app interfaces; do not use for raster illustration or sprite generation alone.
---

# Gothic Pixel UI

Build a coherent product interface, not a decorative skin. Preserve the target application's behavior, information hierarchy, accessibility, and framework conventions while applying the visual system.

Before changing code, read [references/style-system.md](references/style-system.md). Use [assets/pixel-theme.css](assets/pixel-theme.css) as a token and primitive reference; adapt it to the target project rather than blindly appending it.

## Workflow

1. Inspect the existing repository, routes, shared layout, component system, CSS architecture, and responsive breakpoints. Reuse its abstractions where practical.
2. Establish the palette before styling components. If the user supplied colors, map them to semantic roles. If not, propose or choose one coherent palette that has the required lightness hierarchy. Do not default to The Master List's magenta palette.
3. Add one semantic token layer for color, spacing, geometry, shadows, type, and motion. Components must consume tokens instead of proliferating raw color values.
4. Implement the shared shell and primitives first: background, typography, focus treatment, panels, buttons, inputs, navigation, status treatments, and overlays.
5. Restyle feature surfaces using the same primitives. Give special components a distinct silhouette or composition, not an unrelated visual language.
6. Verify real content at narrow mobile, wide mobile, tablet, and desktop widths. Check long labels, empty states, errors, disabled controls, keyboard focus, touch targets, overflow, and reduced motion.

## Non-negotiable visual DNA

- Use a bitmap display face sparingly for headings, labels, navigation, and compact buttons. Use a readable pixel/mono face for body copy and data.
- Prefer square corners, one- or two-pixel borders, hard offset shadows, inset edge highlights, and deliberate grid alignment.
- Create depth with a dark value ladder. Reserve the brightest accent for interaction, selection, progress, and focus.
- Keep glow subordinate to crisp geometry. A border must remain legible when the glow is removed.
- Use stepped or short movement for game-like interaction. Avoid floaty marketing-site motion.
- CRT texture is an atmosphere layer: fine scanlines, faint RGB structure, sparse noise, and edge vignette. It must not reduce legibility or cover photos/video.
- Preserve generous negative space around major compositions. Pixel art does not mean filling every gap.
- Write direct, functional interface copy. Avoid faux-arcade jargon when ordinary words communicate the action better.

## Palette contract

Every palette needs distinct values for deep background, background, raised surface, elevated surface, border, strong border, primary accent, secondary accent, primary text, muted text, and semantic success/warning/danger/info. Maintain readable contrast; a palette swap is not a global hue rotation.

Treat luminosity and role as invariants:

`deep background < background < surface < elevated surface < border < muted text < primary text`

Use the primary accent for the main action and current state, the secondary accent for supporting energy or data contrast, and semantic colors only for meaning.

## Delivery

When applying the skill, summarize the chosen palette roles and the shared primitives created or changed. Mention material deviations from the reference system and why they suit the target product.
