"""Render a hand-authored sprite grid (sprite.txt) to an enlarged preview PNG.

PALETTE is the shared letters. A pet gives them its own colours, and adds letters of its own, in its
pet.json "palette" ({"T": "#e0a030"}); never edit PALETTE for one pet.
"""
import sys
from PIL import Image, ImageDraw

PALETTE = {
    '.': None,
    'K': (38, 40, 54),     # outline
    'W': (240, 243, 248),  # fur
    'L': (200, 207, 222),  # fur shade
    'G': (150, 158, 178),  # deep shade
    'E': (92, 84, 92),     # inner ear
    'B': (128, 78, 46),    # hair
    'h': (170, 110, 64),   # hair highlight
    'b': (82, 48, 28),     # hair shadow
    'T': (48, 196, 190),   # teal eye
    't': (22, 120, 128),   # dark teal
    'w': (255, 255, 255),  # eye glint
    'N': (70, 44, 44),     # nose
    'M': (58, 38, 34),     # chest marking
    # outfit
    'V': (74, 68, 64),     # leather vest
    'U': (46, 42, 40),     # vest shadow
    'v': (112, 103, 96),     # vest sheen
    'S': (91, 59, 44),     # brown sleeves
    's': (62, 39, 29),     # sleeve / glove shadow
    'g': (74, 58, 51),     # gloves
    'F': (75, 74, 63),     # scarf
    'f': (53, 52, 41),     # scarf shadow
    'R': (139, 90, 58),    # strap and belt
    'r': (107, 65, 41),    # strap shadow
    'Y': (185, 178, 166),  # buckles
    'A': (194, 171, 136),  # sash
    'a': (147, 128, 95),   # sash shadow
    'Q': (72, 72, 78),     # quilted tassets
    'q': (48, 48, 54),     # quilting
    'P': (38, 38, 44),     # trousers
    'p': (26, 26, 31),     # trouser shadow
    'O': (70, 62, 58),     # boots
    'o': (104, 96, 90),     # knee guards
}


def load(path):
    frames, cur = {}, None
    for line in open(path, encoding='utf-8'):
        line = line.rstrip('\n')
        if line.startswith('#'):
            cur = line[1:].strip()
            frames[cur] = []
        elif line.strip() and cur:
            # a row ending in '|' is a left half, mirrored to make the full row
            frames[cur].append(line[:-1] + line[-2::-1] if line.endswith('|') else line)
    return frames


def check(name, rows, palette=None):
    palette = palette or PALETTE
    w = len(rows[0])
    for i, r in enumerate(rows):
        assert len(r) == w, f'{name} row {i} is {len(r)} wide, expected {w}'
        for c in r:
            assert c in palette, f'{name} row {i}: unknown colour {c!r} (add it to the pet.json palette)'


def pet_palette(folder):
    """The shared palette with a pet's own colours (pet.json "palette": {"T": "#rrggbb"}) over it."""
    import json
    import os
    palette = dict(PALETTE)
    meta = os.path.join(folder, 'pet.json')
    if os.path.isfile(meta):
        for k, v in json.load(open(meta, encoding='utf-8')).get('palette', {}).items():
            if not k.startswith('_'):
                n = int(v.lstrip('#'), 16)
                palette[k] = (n >> 16, (n >> 8) & 255, n & 255)
    return palette


def draw(rows, scale, bg, palette=None):
    palette = palette or PALETTE
    h, w = len(rows), len(rows[0])
    img = Image.new('RGB', (w * scale, h * scale), bg)
    d = ImageDraw.Draw(img)
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if palette.get(c):
                d.rectangle([x * scale, y * scale, (x + 1) * scale - 1, (y + 1) * scale - 1], palette[c])
    return img


if __name__ == '__main__':
    # usage: python render.py <sprite.txt> <preview.png>   (the pet's pet.json colours apply)
    import os
    src, out = sys.argv[1], sys.argv[2]
    palette = pet_palette(os.path.dirname(os.path.abspath(src)))
    frames = load(src)
    scale = 16
    tiles = []
    for name, rows in frames.items():
        check(name, rows, palette)
        # each frame shown on a dark and a light background, like a terminal would
        tiles += [draw(rows, scale, (30, 30, 36), palette), draw(rows, scale, (225, 225, 230), palette)]
    pad = 16
    W = sum(t.width for t in tiles) + pad * (len(tiles) + 1)
    H = max(t.height for t in tiles) + pad * 2
    sheet = Image.new('RGB', (W, H), (60, 60, 70))
    x = pad
    for t in tiles:
        sheet.paste(t, (x, pad))
        x += t.width + pad
    sheet.save(out)
    print('ok', {k: (len(v[0]), len(v)) for k, v in frames.items()})
