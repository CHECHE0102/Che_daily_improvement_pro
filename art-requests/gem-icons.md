# Art request: element gems (20 icons) for BinBin daily

## What to draw
20 game item icons of **element gems**: 5 elements × 4 tiers (Ⅰ–Ⅳ).
They are set into weapon and armour sockets, so they must read clearly at small size (about 26–48 px on screen) as well as at full size.

## Style (match the existing item art in `assets/art/`, e.g. `weapon-metal-1.webp`, `armor-water-3.webp`)
- Hand-painted cartoon fantasy game icon, the same style as the existing weapons and armour.
- Bold dark-brown/near-black outline (about 6–8 px at 384 px), clean flat-ish shading with a few strong highlights.
- Front three-quarter view, centred, filling about 80 % of the canvas, nothing touching the edges.
- **Transparent background**, no ground shadow, no frame, no text, no letters, no numbers.

## Element → gem look
| element | file key | colour / stone | shape idea |
|---|---|---|---|
| metal 金 | `metal` | golden topaz / citrine, warm gold (#D9A520) | shield-cut or cushion-cut, metallic gold glints |
| wood 木 | `wood` | emerald green (#3FA65A) | leaf-shaped or emerald-cut, tiny leaf vein inside |
| water 水 | `water` | sapphire / aquamarine blue (#2A68B0 → #62AEEA) | teardrop / droplet cut, wave reflection inside |
| fire 火 | `fire` | ruby / fire opal red-orange (#E0573B) | flame or pointed marquise cut, ember glow inside |
| earth 土 | `earth` | amber / tiger's-eye brown (#8B6235 → #D8A35A) | chunky hexagonal or rounded cabochon, banded stripes |

Keep the same shape for all four tiers of an element so players recognise it; the tier changes the **brightness and decoration**:

## Tier → brightness (the key requirement)
- **Ⅰ — dull rough stone.** Muted, slightly desaturated colour, few simple facets, a small matte highlight, no glow, no sparkles. Looks freshly dug up.
- **Ⅱ — polished.** Cleaner facets, richer saturated colour, one clear white highlight, a faint thin rim light. Still no sparkles.
- **Ⅲ — bright and glowing.** Vivid colour, many facets, an inner light core, a soft coloured glow around the gem, 2–3 small star sparkles.
- **Ⅳ — radiant legendary.** Brightest, almost luminous; strong inner light, a wide soft halo in the element colour, 4–6 sparkles of different sizes, and a small ornate gold setting or filigree around the stone (still clearly the same gem shape).

Brightness must clearly increase Ⅰ < Ⅱ < Ⅲ < Ⅳ when the four are placed side by side, even at 32 px.

## Output
- 20 separate PNG (or WebP) files, **384 × 384 px**, RGBA with transparency.
- File names: `gem-<element>-<tier>.png` with tier 1–4, e.g. `gem-metal-1.png`, `gem-wood-4.png`, `gem-fire-3.png`.
- Also one preview sheet `gem-sheet.png`: 5 rows (metal, wood, water, fire, earth) × 4 columns (Ⅰ→Ⅳ) on a light grey background, so the brightness steps can be checked at a glance.
- Put them in `art-requests/out/gems/`. Claude will convert them to WebP and add them to `assets/art/`.

## Do not
- No text, numbers, Roman numerals or letters on the gems.
- No background, no drop shadow on the floor, no square frame.
- Don't copy any existing game's gem designs.
