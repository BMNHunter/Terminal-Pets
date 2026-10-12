"""The pet's moving parts, drawn as layers over its frames: where the eyes look, happy eyes,
an ear twitch, and the dagger acts (toss, fumble, twirl) with the body's crouches and the eyes
following the blade. Layers are lists of [row, column, colour].

Eye and ear layers are in sprite pixels (no headroom): the mod adds the frame's headroom and
its bob (FRAME_DY). Dagger layers are in padded frame pixels, as the frames are.
"""
import math

TOP = 3  # the frames' headroom; kept in step with make_frames.TOP
FRAME_DY = {'rest': 0, 'breathe': 1, 'blink': 0, 'hop1': -2, 'hop2': -3, 'sleep': 1, 'sleep2': 0}
EYE = set('Ttw')
ERASE = set('KTtwG')

# The eight directions, by name, as (row, column) steps; screen rows grow downward.
LOOKS = {'n': (-1, 0), 'ne': (-1, 1), 'e': (0, 1), 'se': (1, 1), 's': (1, 0), 'sw': (1, -1), 'w': (0, -1), 'nw': (-1, -1)}
HEADINGS = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]  # the blade, clockwise from up


def eye_boxes(rows):
    """Bounding boxes (y0, y1, x0, x1) of the eyes: connected T/t/w pixels."""
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


def diff(base, changed):
    return [[y, x, c] for y, (a, b) in enumerate(zip(base, changed)) for x, (p, c) in enumerate(zip(a, b)) if p != c]


def shut(rows, shape):
    """Eyes shut: erase each eye and its liner, then draw a lid. 'sleep' curves down at the
    middle (a content, closed eye); 'happy' arches up (^ ^)."""
    g = [list(r) for r in rows]
    for y0, y1, x0, x1 in eye_boxes(rows):
        pad = 2 if x1 - x0 > 3 else 1
        for y in range(y0 - 1, y1 + 2):
            for x in range(x0 - pad, x1 + pad + 1):
                if g[y][x] in ERASE:
                    g[y][x] = 'W'
        ym = y0 + (y1 - y0 + 1) // 2
        if shape == 'sleep':
            for x in range(x0, x1 + 1):
                g[ym][x] = 'K'
            g[ym - 1][x0 - 1] = g[ym - 1][x1 + 1] = 'K'
        else:
            rise = 2 if x1 - x0 > 3 else 1
            for x in range(x0, x1 + 1):
                step = min(x - x0, x1 - x, rise)
                g[ym - step][x] = 'K'
    return [''.join(r) for r in g]


def look(rows, name):
    """The eyes turned toward `name`: a slit pupil moved that way, the glint opposite."""
    g = [list(r) for r in rows]
    boxes = eye_boxes(rows)
    mid = sum((b[2] + b[3]) / 2 for b in boxes) / len(boxes)  # the face's middle (sprites may be widened)
    for y0, y1, x0, x1 in boxes:
        iris = {(y, x) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1) if rows[y][x] in EYE}
        is_big = y1 - y0 >= 3
        band = y0 if is_big else None  # the big eye's shaded top row stays
        for y, x in iris:
            g[y][x] = 't' if y == band else 'T'
        dy, dx = LOOKS[name]
        step = 2 if is_big else 1
        cx = (x0 + x1) // 2 if (x0 + x1) / 2 < mid else (x0 + x1 + 1) // 2
        px = min(max(cx + dx * step, x0), x1)
        if is_big:
            top = y0 + 1 + dy
            pupil = [(top, px), (top + 1, px)]
        else:
            pupil = [(y0, px)] if dy < 0 else [(y1, px)] if dy > 0 else [(y0, px), (y1, px)]
        for p in pupil:
            if p in iris:
                g[p[0]][p[1]] = 't'
        gy = y0 + 1 if is_big else y0
        for gx in (px - step, px + step, x0, x1):
            if (gy, gx) in iris and (gy, gx) not in pupil:
                g[gy][gx] = 'w'
                break
    return [''.join(r) for r in g]


def twitch(rows, depth):
    """The left ear's tuft flicked outward: its top `depth` rows moved a pixel left."""
    g = [list(r) for r in rows]
    mid = len(rows[0]) // 2
    for y in range(depth):
        left = g[y][:mid]
        g[y][:mid] = left[1:] + ['.']
    return [''.join(r) for r in g]


def overlays(rows, depth):
    """The eye and ear layers of one sprite (unpadded rows)."""
    out = {'looks': {name: diff(rows, look(rows, name)) for name in LOOKS}}
    out['looks']['happy'] = diff(rows, shut(rows, 'happy'))
    out['ears'] = diff(rows, twitch(rows, depth))
    return out


# --- the dagger acts ---

def dagger(anchor, heading, blade, hilt):
    """Pixels of a dagger whose grip end is at anchor, its blade pointing along heading."""
    (y, x), (dy, dx) = anchor, HEADINGS[heading % 8]
    pixels = [(y + dy * k, x + dx * k, 'r') for k in range(hilt)]
    gy, gx = y + dy * hilt, x + dx * hilt
    pixels.append((gy, gx, 'R'))
    if hilt > 1:  # a crossguard on the big dagger
        pixels += [(gy + dx, gx - dy, 'R'), (gy - dx, gx + dy, 'R')]
    pixels += [(gy + dy * k, gx + dx * k, 'Y') for k in range(1, blade)]
    pixels.append((gy + dy * blade, gx + dx * blade, 'w'))
    return pixels


def gaze(rows, anchor, heading, spec):
    """Which way the eyes look to see the blade (anchor in padded pixels)."""
    boxes = eye_boxes(rows)
    ey = sum((b[0] + b[1]) / 2 for b in boxes) / len(boxes)
    ex = sum((b[2] + b[3]) / 2 for b in boxes) / len(boxes)
    reach = spec['hilt'] + spec['blade'] / 2
    my = anchor[0] - TOP + HEADINGS[heading % 8][0] * reach - ey
    mx = anchor[1] + HEADINGS[heading % 8][1] * reach - ex
    # height counts double: the arc is tall and narrow beside a wide face, and the eyes should
    # be seen to lift as the blade rises over the head
    angle = math.degrees(math.atan2(my * 2, mx)) % 360  # 0 is east, 90 south
    return ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne'][round(angle / 45) % 8]


def acts(rows, spec, width, height):
    """The toss, the fumble and the twirl, frame by frame: the body frame, the dagger layer,
    where the eyes look, and a mark (! or ?) beside the pet."""
    (hy, hx), (py, px) = spec['hand'], spec['peak']
    blade, hilt = spec['blade'], spec['hilt']

    def frame(body, anchor, heading, mark=None):
        layer = [[y, x, c] for y, x, c in dagger(anchor, heading, blade, hilt) if 0 <= y < height and 0 <= x < width]
        out = {'body': body, 'dagger': layer, 'look': gaze(rows, anchor, heading, spec)}
        if mark:
            out['mark'] = mark
        return out

    held = (hy + TOP, hx)
    crouched = (hy + TOP + 1, hx)  # the 'breathe' frame sits a pixel lower

    def flight(t, miss=0.0):
        lift = 4 * t * (1 - t)
        y = hy + (py - hy) * lift
        x = hx + (px - hx) * max(lift, 0) + miss
        return (round(y) + TOP, round(x)), round(8 * t)

    # toss: wind up, thrown, spun once round at the top of the arc, caught with a crouch
    toss = [frame('breathe', crouched, 0)]
    for i in range(1, 12):
        anchor, heading = flight(i / 12)
        toss.append(frame('rest', anchor, heading))
    toss += [frame('breathe', crouched, 0), frame('rest', held, 0)]

    # fumble: the same throw, but it comes down outside the hand and sticks in the ground;
    # a start (!), a puzzled look (?), then a crouch to pick it up
    ground = len(rows) - 1 + TOP
    stuck_y = ground - hilt - blade
    fumble = [frame('breathe', crouched, 0)]
    t = 1 / 12
    while True:
        anchor, heading = flight(t, miss=3 * min(1.0, t * 2))
        if anchor[0] >= stuck_y and t > 0.5:
            break
        fumble.append(frame('rest', anchor, heading))
        t += 1 / 12
    stuck = (stuck_y, hx + 3)
    fumble += [frame('rest', stuck, 4, '!') for _ in range(3)]
    fumble += [frame('rest', stuck, 4, '?') for _ in range(5)]
    fumble += [frame('breathe', crouched, 0), frame('rest', held, 0)]

    # twirl: spun once round in the hand
    twirl = [frame('rest', held, 0)]
    twirl += [frame('rest', (hy + TOP - 1, hx), h) for h in range(1, 9)]
    twirl.append(frame('rest', held, 0))

    return {'toss': toss, 'fumble': fumble, 'twirl': twirl}


def compose(frames, sprite, frame_name, look_name=None, ears=False, act=None):
    """A frame as the mod draws it, for previews: the body, the eyes, the ears, the dagger."""
    rows = [list(r) for r in frames[frame_name]]
    dy = TOP + FRAME_DY[frame_name]
    layers = []
    if look_name and frame_name not in ('blink', 'sleep', 'sleep2'):
        layers += [(y + dy, x, c) for y, x, c in sprite['looks'][look_name]]
    if ears:
        layers += [(y + dy, x, c) for y, x, c in sprite['ears']]
    if act:
        layers += [tuple(p) for p in act['dagger']]
    for y, x, c in layers:
        if 0 <= y < len(rows) and 0 <= x < len(rows[0]):
            rows[y][x] = c
    return [''.join(r) for r in rows]
