"""Turn each pet's hand-drawn sprites into animation frames the terminal-pet mod draws.

usage:
  python make_frames.py                     your pets: each ~/.claude/pets/<pet>/ gets a frames.json
  python make_frames.py <pets folder>       the same, for the pets in another folder
  python make_frames.py --builtin <plugin>  the pets shipped with the mod (<plugin>/pets/) into <plugin>/hooks/sprites.ts

Each pet is a folder named by its key (lowercase, like kira) with big.txt, small.txt and head.txt (one frame each,
palette letters), optionally <size>-dressed.txt for its outfit, and pet.json (its name, its own colours, dagger
and ear settings). The mod loads ~/.claude/pets/*/frames.json when a session starts and on every /pet command,
so a pet built here needs no reinstall. Previews (frames-preview.png, acts-preview-<width>.png) land in each
pet's folder. The pixel-pet skill (SKILL.md beside this folder) describes the whole workflow.
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from render import PALETTE, check, load, pet_palette  # noqa: E402
from acts import FRAME_DY, acts, compose, overlays  # noqa: E402

TOP, BOTTOM = 3, 1  # headroom for the hop, room for the bob (acts.TOP and FRAME_DY follow these)
# frames.json's layout; the mod skips a file of another one (rebuild it with this script)
FORMAT = 1
KEY = re.compile(r'^[a-z0-9][a-z0-9_-]*$')
EYE = set('Ttw')
ERASE = set('KTtwG')


def eyes(rows):
    """Bounding boxes of the eye regions (connected T/t/w pixels)."""
    seen, boxes = set(), []
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in EYE and (y, x) not in seen:
                stack, pts = [(y, x)], []
                seen.add((y, x))
                while stack:
                    a, b = stack.pop()
                    pts.append((a, b))
                    for da in (-1, 0, 1):
                        for db in (-1, 0, 1):
                            n = (a + da, b + db)
                            if 0 <= n[0] < len(rows) and 0 <= n[1] < len(r) and rows[n[0]][n[1]] in EYE and n not in seen:
                                seen.add(n)
                                stack.append(n)
                ys, xs = [p[0] for p in pts], [p[1] for p in pts]
                boxes.append((min(ys), max(ys), min(xs), max(xs)))
    return boxes


def closed(rows):
    """Eyes shut: erase each eye and its liner, draw a curved lid."""
    g = [list(r) for r in rows]
    for y0, y1, x0, x1 in eyes(rows):
        pad = 2 if x1 - x0 > 3 else 1
        for y in range(y0 - 1, y1 + 2):
            for x in range(x0 - pad, x1 + pad + 1):
                if g[y][x] in ERASE:
                    g[y][x] = 'W'
        ym = y0 + (y1 - y0 + 1) // 2
        for x in range(x0, x1 + 1):
            g[ym][x] = 'K'
        g[ym - 1][x0 - 1] = 'K'
        g[ym - 1][x1 + 1] = 'K'
    return [''.join(r) for r in g]


def place(rows, dy):
    w = len(rows[0])
    blank = '.' * w
    return [blank] * (TOP + dy) + rows + [blank] * (BOTTOM - dy)


def frames(rows):
    shut = closed(rows)
    return {
        'rest': place(rows, 0),
        'breathe': place(rows, 1),
        'blink': place(shut, 0),
        'hop1': place(rows, -2),
        'hop2': place(rows, -3),
        'sleep': place(shut, 1),
        'sleep2': place(shut, 0),
    }


def preview(sets, out, palette=None):
    from PIL import Image
    from render import draw
    tiles = [draw(f, 6, (30, 30, 36), palette) for s in sets for f in s.values()]
    pad = 8
    W = sum(t.width for t in tiles) + pad * (len(tiles) + 1)
    H = max(t.height for t in tiles) + pad * 2
    sheet = Image.new('RGB', (W, H), (60, 60, 70))
    x = pad
    for t in tiles:
        sheet.paste(t, (x, pad))
        x += t.width + pad
    sheet.save(out)


def build(folder):
    """One pet's preset (its name, sprites, outfit and own colours), and its previews written beside it."""
    info = json.load(open(os.path.join(folder, 'pet.json'), encoding='utf-8'))
    colours = pet_palette(folder)
    sets = []
    shows = {}  # size -> (frames, sprite) with acts, dressed when the pet has an outfit, for the act preview

    def sprites(suffix):
        sizes = {}
        for size in ('big', 'small', 'head'):
            path = os.path.join(folder, f'{size}{suffix}.txt')
            if not os.path.isfile(path):  # an outfit may leave a size (the head) as it is
                path = os.path.join(folder, f'{size}.txt')
            rows = load(path)['idle']
            check(os.path.relpath(path, os.path.dirname(folder)), rows, colours)
            spec = info.get('toss', {}).get(size)
            if spec:  # room on the right for the dagger's arc
                rows = [r + '.' * spec['widen'] for r in rows]
            f = frames(rows)
            sizes[size] = {'width': len(rows[0]), 'height': len(f['rest']), 'frames': f}
            sizes[size].update(overlays(rows, info.get('twitch', {}).get(size, 2)))
            if spec:
                sizes[size]['acts'] = acts(rows, spec, len(rows[0]), len(f['rest']))
                sizes[size]['arc'] = spec['widen']
                shows[size] = (f, sizes[size])
            sets.append(f)
        return sizes

    preset = {'name': info['name'], **sprites('')}
    if info.get('palette'):  # this pet's colours for the shared letters, as '#rrggbb'
        preset['palette'] = {k: int(v.lstrip('#'), 16) for k, v in info['palette'].items() if not k.startswith('_')}
    if any(os.path.isfile(os.path.join(folder, f'{size}-dressed.txt')) for size in ('big', 'small', 'head')):
        preset['dressed'] = sprites('-dressed')

    preview(sets, os.path.join(folder, 'frames-preview.png'), colours)
    for f, sprite in shows.values():
        strip = {}
        for name, act in sprite['acts'].items():
            for i, one in enumerate(act):
                strip[f'{name}{i}'] = compose(f, sprite, one['body'], one['look'], act=one)
        strip['happy'] = compose(f, sprite, 'hop2', 'happy')
        strip['ears'] = compose(f, sprite, 'rest', 'w', ears=True)
        preview([strip], os.path.join(folder, f"acts-preview-{sprite['width']}.png"), colours)
    return preset


def pets_in(root):
    """The pet folders under root: each holding a pet.json, named by a lowercase key."""
    found = []
    for name in sorted(os.listdir(root)):
        folder = os.path.join(root, name)
        if not os.path.isfile(os.path.join(folder, 'pet.json')):
            continue
        if not KEY.match(name):
            print(f'skipped {name}: a pet folder is named by its key, lowercase letters, digits, - and _ (like kira)')
            continue
        found.append((name, folder))
    return found


def shared_palette():
    return {k: (v[0] << 16 | v[1] << 8 | v[2]) if v else None for k, v in PALETTE.items()}


def build_user(root):
    """Each pet under root gets a frames.json: the preset, with the whole palette it is drawn in."""
    built = []
    for name, folder in pets_in(root):
        preset = build(folder)
        # the shared letters as this version of the tools has them, the pet's own over them, so a
        # letter added for this pet draws even in a mod that does not know it
        preset['palette'] = {**{k: v for k, v in shared_palette().items() if v is not None}, **preset.get('palette', {})}
        out = {'format': FORMAT, 'pad': {'top': TOP, 'bottom': BOTTOM}, 'frameDy': FRAME_DY, **preset}
        open(os.path.join(folder, 'frames.json'), 'w', encoding='utf-8').write(json.dumps(out, separators=(',', ':')))
        built.append(name)
    print('built:', ', '.join(built) if built else f'no pets in {root} (a pet is a folder with a pet.json)')


def build_builtin(plugin):
    """The pets shipped with the mod (<plugin>/pets/) into <plugin>/hooks/sprites.ts."""
    presets = {name: build(folder) for name, folder in pets_in(os.path.join(plugin, 'pets'))}
    src = (
        '// Generated by skills/pixel-pet/tools/make_frames.py --builtin from pets/. Do not edit.\n'
        'import type { FrameName, Preset } from \'../types\'\n\n'
        f'export const PALETTE: Record<string, number | null> = {json.dumps(shared_palette())}\n\n'
        f'// pixel rows of headroom above (for the hop) and below (for the bob) every frame\n'
        f'export const PAD = {{ top: {TOP}, bottom: {BOTTOM} }}\n\n'
        f'// how far each frame sits the sprite below (or above) its resting place\n'
        f'export const FRAME_DY: Record<FrameName, number> = {json.dumps(FRAME_DY)}\n\n'
        f'// the layout of a pet\'s frames.json this version reads\n'
        f'export const FORMAT = {FORMAT}\n\n'
        f'export const PRESETS: Record<string, Preset> = {json.dumps(presets, indent=1)}\n'
    )
    open(os.path.join(plugin, 'hooks', 'sprites.ts'), 'w', encoding='utf-8').write(src)
    print('built in:', ', '.join(presets))


if __name__ == '__main__':
    args = sys.argv[1:]
    if args[:1] == ['--builtin']:
        build_builtin(args[1] if len(args) > 1 else os.path.join(HERE, '..', '..', '..'))
    else:
        build_user(os.path.expanduser(args[0] if args else '~/.claude/pets'))
