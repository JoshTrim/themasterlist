# Visual style guide

The Master List uses a gothic pixel-art interface with restrained CRT texture. Its identity is structural rather than palette-specific, so it can be ported to another application with a completely different color scheme.

This document is the human-readable overview. The reusable Codex package lives in [`skills/gothic-pixel-ui`](../skills/gothic-pixel-ui/):

- [`SKILL.md`](../skills/gothic-pixel-ui/SKILL.md) tells Codex how to apply the system to another project.
- [`style-system.md`](../skills/gothic-pixel-ui/references/style-system.md) contains the complete design specification and QA checklist.
- [`pixel-theme.css`](../skills/gothic-pixel-ui/assets/pixel-theme.css) is a palette-tokenized starter, not a stylesheet that must be copied wholesale.

## The visual recipe

The style is made from seven repeatable choices:

1. **Bitmap hierarchy.** `Press Start 2P` gives headings, navigation, badges, and small buttons a game-menu silhouette. `VT323` keeps body copy, lists, and forms readable. `DM Mono` is reserved for dense technical metadata.
2. **Square construction.** Components use hard corners, one- or two-pixel borders, inset edges, and visible grid alignment. Circles are rare and purposeful.
3. **Hard depth.** Offset shadows make controls feel like sprites. Dark surface steps build depth before glow is added.
4. **One dominant light source.** The brightest accent is reserved for actions, selection, focus, and progress. Supporting colors do not compete with it.
5. **Restrained atmosphere.** Fine scanlines, faint RGB phosphor texture, low-opacity static, and a broad vignette imply a CRT without obscuring content.
6. **Game-like motion.** Short stepped hover/press transitions feel tactile. Ambient motion stays nearly invisible and respects reduced-motion settings.
7. **Modern usability.** Forms remain legible, touch targets remain large, media remains clean, and mobile layouts are recomposed rather than merely shrunk.

## Current Master List palette

These values describe this project only. They are not required by the reusable style:

| Role | Current family |
| --- | --- |
| Deep background | near-black aubergine (`#090410`, `#0d0817`) |
| Surface | dark violet (`#100719`, `#1d1230`) |
| Raised surface | plum (`#321044`, `#4a105e`) |
| Border | muted violet (`#5e2a78`, `#7422a0`) |
| Primary accent | neon magenta (`#ff2d9b`) |
| Secondary accent | electric violet (`#c52dff`) |
| Primary text | pink-white (`#fff0fa`) |
| Secondary text | dusty lilac (`#d6a9e2`, `#b995c8`) |
| Data contrast | cyan (`#5de7ff`) |
| Warning/favourite | warm yellow (`#ffd166`) |
| Error | hot coral (`#ff496c`) |

To make a new palette, replace roles rather than mechanically rotating hues. Keep the same value ladder from deep background through surfaces, borders, muted copy, and bright text. Choose one dominant accent and one hue-separated secondary accent. Semantic success, warning, danger, and info colors must retain their meaning.

## Component signature

### Panels

Use a dark directional gradient, a crisp one-pixel border, a faint inset glow, and—when the panel is interactive—a hard offset shadow. Prefer dividers and surface changes over several layers of nested cards.

### Buttons

Primary actions use a solid accent surface, a two-pixel border, a hard shadow, and tiny bitmap text. Secondary actions use a dark raised surface with a strong border. Hover lifts by one pixel; press moves down and drops the shadow.

### Forms

Inputs sit in a dark inset well with a two-pixel border. Use the readable pixel face at 18–20px, style file selectors and checkboxes explicitly, and make focus visible with both a stronger border and restrained halo.

### Cards and directories

Cards use strong alignment and clear zones for image, title, metadata, and actions. Images keep their natural content; any scanline treatment belongs to the frame overlay. Hover should sharpen the border and lift the card slightly.

### Progress and timelines

Progress bars use a dark bordered trough and a two-color fill. Glow supports the fill but never hides its exact end. Timeline markers grow on touch devices.

### CRT layer

Use fine static scanlines, faint vertical RGB structure, stepped noise, and edge vignette. Do not add a conspicuous rolling horizontal beam. The layer must use `pointer-events: none`, be disabled or frozen for reduced motion, and sit behind photographs and video playback.

## Typography rules

- Display font: small sizes, short phrases, headings, labels, buttons, and navigation.
- Reading pixel font: paragraphs, track lists, values, inputs, descriptions, and status text.
- Dense monospace: optional timestamps and system data.
- Do not put long paragraphs in the display font.
- Do not shrink bitmap labels until they are unreadable just to keep them on one line.

## Responsive rules

- Switch multi-column content to one column between 640 and 760px according to content pressure.
- Replace desktop navigation before it wraps into multiple rows.
- Keep a minimum 16px form font and 44px touch targets.
- Explicitly place metadata and actions on mobile; accidental wrapping usually looks broken in a geometric UI.
- Test 360, 390, 430, and 768px widths plus desktop and landscape media playback.
- Treat long names, errors, empty data, and disabled buttons as primary test cases.

## Things to avoid

- Rounded SaaS components with a pixel font applied afterward.
- Glow replacing structural borders.
- Equal saturation on every panel.
- Pixelation or CRT effects over video and photography.
- Tiny desktop controls on mobile.
- Fake arcade vocabulary that makes a functional action unclear.
- Copying the magenta palette when a distinct project identity is wanted.

## Using the Codex skill elsewhere

Copy the `skills/gothic-pixel-ui` directory into the other repository or install it in your personal Codex skills directory. Then ask:

> Use `$gothic-pixel-ui` to restyle this project. Keep the visual structure but use a rust orange, oxidized teal, parchment, and charcoal palette.

The skill will inspect the target codebase, establish semantic tokens, apply shared primitives first, preserve behavior, and verify responsive and accessibility states. The palette description can be as broad or specific as the project requires.

## Manual porting checklist

1. Inventory the target application's shell, routes, components, and states.
2. Define semantic palette tokens before touching component styles.
3. Add type, canvas, focus, and optional CRT foundations.
4. Build panel, button, input, select, checkbox, badge, and progress primitives.
5. Convert one representative high-traffic page and calibrate contrast and density.
6. Apply the primitives to remaining pages; avoid page-specific raw colors.
7. Test keyboard, touch, reduced motion, real content, and narrow screens.
8. Remove stale CSS and consolidate repeated values into tokens.
