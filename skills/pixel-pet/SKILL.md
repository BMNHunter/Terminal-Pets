---
name: pixel-pet
description: Make a new hand-drawn pixel-art pet (character) for the terminal-pet Claude Code mod, in the same style as Shiro, or change an existing pet (redraw, outfit, colours, proportions, animations). Use when the user asks for a new terminal pet or character from a reference image, or to edit one of their pets.
---

# Pixel pets for the terminal

The `terminal-pet` plugin shows a pixel-art pet beside the conversation. The built-in pet is Shiro,
a white lynx. New pets must match his style, and they are **hand-drawn from a reference, never a
downscaled image**. The reference is only something to look at while drawing pixel by pixel.

## Where things live

`<skill>` is this skill's base directory (shown when the skill loads), and `<plugin>` is the plugin's
root, two folders up from it. Both are in the installed plugin, which an update replaces: **never
write there**. Everything the user makes goes in `~/.claude/pets/`.

| Path | What |
| --- | --- |
| `~/.claude/pets/<pet>/` | one folder per pet the user makes, named by its key: its sprites, `pet.json`, its own scripts, previews, and the built `frames.json` the mod loads |
| `<plugin>/pets/shiro/` | **the reference pet**: read its sprites and `outfit.py` before drawing a new one (read only) |
| `<skill>/tools/render.py` | the shared palette (letter → colour) and the preview renderer |
| `<skill>/tools/make_frames.py` | turns each pet folder into frames: writes `~/.claude/pets/<pet>/frames.json` and previews |
| `<skill>/tools/acts.py` | eye looks, happy eyes, ear twitch, and the dagger acts (toss, fumble, twirl) |

The tools need Python 3 with Pillow. Check with `python -c "import PIL"` (`python3` on macOS and
Linux); if it fails, ask the user before running `python -m pip install pillow`.

## The sprite format

A sprite is a text grid, one letter per pixel; `.` is transparent. A file starts with `# idle`, and
a row ending in `|` is a left half that is mirrored to make the full row, which helps with
symmetric faces. Preview it with `python <skill>/tools/render.py <file.txt> <out.png>` (the pet's
`pet.json` colours apply) and **look at the PNG (Read it) before showing the user anything**.

The letters carry meaning: the animations find the eyes by `T`/`t`/`w` and the outline by `K`. So
keep these meanings, and change only the colours, per pet, in `pet.json`:

| Letter | Means | Shiro's colour |
| --- | --- | --- |
| `K` | outline, 1 px | dark slate |
| `W` `L` `G` | main fur/skin, its shade, its deep shade | white, cool greys |
| `E` | inner ear | dark grey |
| `B` `h` `b` | hair, highlight, shadow | browns |
| `T` `t` `w` | **eyes only**: iris, dark iris / slit pupil, glint | teals, white |
| `N` | nose | dark brown |
| `M` | body marking | dark brown |
| outfit letters | `V U v S s g F f R r Y A a Q q P p O o` | vest, sleeves, gloves, scarf, straps, buckles, sash, tassets, trousers, boots |

**Never put `T`, `t` or `w` anywhere but the eyes.** Blinking, sleeping, eye looks and happy eyes
all find the eyes by those letters. If a pet needs a colour that fits no letter, give it a new,
unused letter in the pet's own `pet.json` `palette` (with a `"_note"` saying what it is); never edit
`render.py`'s `PALETTE`, which belongs to the plugin.

## Style (match Shiro)

- **Chibi.** Small: 24 wide x 32 tall. The head (with ears) is the top ~19 rows, and the body hangs
  below with arms at its sides and short legs. Big: 48 wide, and the head is about **half** the
  height. A 60% head reads "way too big", which is why Shiro's big body was lengthened to 77 rows
  (`<plugin>/pets/shiro/stretch.py`).
- **Head-only** (`head.txt`): the small sprite's rows down to the chin, closed with a `K` row.
- **Outline**: a 1 px `K` all round and between parts (arms and body, legs). Shading goes on the
  lower and outer side (`L`, then `G`), with highlights sparing.
- **A small palette**, about 8–16 colours per pet, and every colour on purpose.
- **Eyes are the soul.** Small: 3x2 with a `K` liner row above. Big: about 6x4, with a top band of
  `t`, a 2 px slit pupil `t` and a `w` glint, plus a soft `G` line under the eye.
- **Faces are symmetric** (draw left halves with `|`), and the hair or markings break the symmetry.
- **Exaggerate the features the user calls important.** At this size, pick 3–5 that must read (for
  Shiro: teal eyes, cheek tufts that are a jagged lynx ruff, messy brown hair, a bird marking on
  the chest) and give them the pixels.
- **Fur edges are jagged locks** (saw-teeth pointing out and down), not a straight wall; one strand
  line (`L`) per lock, no more, or it reads as whiskers.
- **The right hand** (viewer's right) hangs by the body. The dagger tricks need its pixel position.
- **The feet stand on the last row** (the fumbled dagger lands there).

## Making a new pet

1. **Ask** for the reference image, the pet's name (a lowercase key like `kira`, which is also its
   folder's name, and a display name), and the 3–5 features that matter most. Ask about clothes
   only if the reference shows them.
2. **Draw small first** in `~/.claude/pets/<pet>/small.txt`. Write it with the Write tool (bash
   heredocs and inline Python mangle backslashes and quotes), render it, look, and fix it. Expect 2–4
   passes. Show the user a preview next to their reference, and ask what to change.
3. **Then big**, at 48 wide with the head about half the height, refining (not scaling) the small one:
   thinner outlines, pupils and glints, hair strands, fur texture.
4. **Head-only**: crop the small one at the chin into `head.txt`.
5. **Outfit (optional)**: copy `<plugin>/pets/shiro/outfit.py` into the pet's folder as a model. Each
   garment recolours the fur in a region (outlines stay), then the hand-placed details go on top
   (straps, buckles, seams). It writes `small-dressed.txt` and `big-dressed.txt`. Lift very dark
   leathers a little: on a near-black terminal they merge with the outline.
6. **`pet.json`**, using `<plugin>/pets/shiro/pet.json` as the template:
   ```json
   {
     "name": "Kira",
     "palette": { "T": "#e0a030", "t": "#9a6a1a", "W": "#e8d8c0" },
     "toss": {
       "small": { "hand": [24, 18], "peak": [5, 25], "blade": 3, "hilt": 1, "widen": 6 },
       "big": { "hand": [54, 37], "peak": [10, 51], "blade": 6, "hilt": 2, "widen": 12 }
     },
     "twitch": { "big": 4, "small": 2, "head": 2 }
   }
   ```
   `palette` is this pet's colours for the shared letters, and any letters of its own. `toss` is the
   dagger: `hand` is the grip pixel in the right hand (row, column), `peak` is the top of the arc
   beside the head, and `widen` is the empty columns added on the right for the arc. Leave out
   `toss` for a pet with no dagger. In `twitch`, the number is how many top rows of the left ear's
   tuft flick in an ear twitch.
7. **Build and check:**
   ```
   python <skill>/tools/make_frames.py
   ```
   It builds every pet in `~/.claude/pets/` into its `frames.json` (a folder name that is not a
   lowercase key is skipped, and says so). Look at `frames-preview.png` and the
   `acts-preview-*.png` it writes in the pet's folder: the eyes must close on blink and track the
   dagger.
8. **Tell the user**: `/pet <name>` switches to it (an open session reads the new `frames.json` on
   any `/pet` command, with no restart), and `/pet list` shows all pets, with the reason for any it
   left out. The "Pet: which pet" setting in `/config` takes the same key.

## Changing a built-in pet (plugin maintainers)

Only when working in the plugin's own repository, not an installed copy: the built-in pets are
`<plugin>/pets/`, compiled into the mod by
`python <skill>/tools/make_frames.py --builtin <plugin>` (it writes `<plugin>/hooks/sprites.ts`).
Then run `claude plugin validate <plugin>` and `claude plugin test <plugin>`; some tests use Shiro's
colours, so a change to Shiro must keep those passing. A change to the frames' layout (headroom,
`FRAME_DY`, the shape of a sprite) bumps `FORMAT` in `make_frames.py`, so the mod skips stale
`frames.json` files and asks for a rebuild instead of drawing them garbled.

## Pitfalls already met

- Don't "pixelate" the reference with Pillow and call it done. Drawing by hand is the point.
- Inside the mod's pane, a cell with no explicit background shows the pane's grey (`#262626`). The
  mod paints the user's terminal colour (`#0C0C0C`, the `background` setting) and draws with Text,
  not Raster, because Raster rounds colours.
- Changing a pet's width changes how wide its side pane must be (27 / 51 columns without the
  dagger, 33 / 63 with it, for Shiro's small and big).
- A letter missing from the palette stops `make_frames.py` with the sprite and row; add it to the
  pet's `pet.json` `palette`.
