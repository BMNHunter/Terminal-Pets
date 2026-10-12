"""Shiro's outfit (leather vest, brown sleeves, scarf, strap, belt, sash, quilted tassets, boots, gloves).

Writes small-dressed.txt and big-dressed.txt beside the undressed sprites. Each garment is a region
whose fur takes the garment's colour (fur shading becomes the garment's shadow, outlines stay),
plus hand-placed details: the strap across the chest, buckles, quilting, the sash and the vest seam.
"""
import os

from stretch import R, span

HERE = os.path.dirname(os.path.abspath(__file__))

# fur colour -> garment colour, for each garment: (fill, shadow)
GARMENTS = {
    'vest': ('V', 'U'),
    'sleeve': ('S', 's'),
    'glove': ('g', 's'),
    'scarf': ('F', 'f'),
    'belt': ('R', 'r'),
    'tasset': ('Q', 'q'),
    'pants': ('P', 'p'),
    'boot': ('O', 'U'),
}
FUR = {'W': 0, 'M': 0, 'L': 1, 'G': 1}  # fill or shadow


def load(name):
    rows = [l for l in open(os.path.join(HERE, name)).read().split('\n') if l and not l.startswith('#')]
    return [list(r) for r in rows]


def save(name, g):
    open(os.path.join(HERE, name), 'w').write('# idle\n' + '\n'.join(''.join(r) for r in g) + '\n')


def wear(g, garment, rows, cols):
    """Recolour the fur in rows x cols (inclusive ranges, mirrored across the middle) as `garment`."""
    w = len(g[0])
    fill = GARMENTS[garment]
    for y in range(rows[0], rows[1] + 1):
        for x in range(cols[0], cols[1] + 1):
            for xx in {x, w - 1 - x}:
                c = g[y][xx]
                if c in FUR:
                    g[y][xx] = fill[FUR[c]]


def put(g, points, c):
    for y, x in points:
        if g[y][x] != '.':
            g[y][x] = c


def line(a, b):
    """Pixels on a straight line from a to b (inclusive), one per row."""
    (y0, x0), (y1, x1) = a, b
    n = max(abs(y1 - y0), abs(x1 - x0))
    return sorted({(round(y0 + (y1 - y0) * i / n), round(x0 + (x1 - x0) * i / n)) for i in range(n + 1)})


def small():
    g = load('small.txt')
    wear(g, 'scarf', (19, 19), (5, 11))
    wear(g, 'sleeve', (20, 21), (5, 6))
    wear(g, 'glove', (24, 24), (5, 6))
    wear(g, 'vest', (20, 24), (7, 11))
    wear(g, 'belt', (25, 25), (6, 11))
    wear(g, 'tasset', (26, 27), (7, 11))
    wear(g, 'boot', (28, 30), (5, 11))
    put(g, [(20, 10), (20, 11), (20, 12), (20, 13)], 'f')          # scarf drape
    put(g, [(21, 11), (21, 12)], 'F')
    put(g, line((20, 8), (24, 15)), 'R')                           # strap, right shoulder to left hip
    put(g, [(22, 12)], 'Y')                                        # strap buckle
    put(g, [(25, 11), (25, 12)], 'Y')                              # belt buckle
    put(g, [(26, 8), (26, 10), (27, 9), (26, 13), (26, 15), (27, 14)], 'q')  # quilting
    put(g, [(26, 14), (26, 15), (27, 15), (28, 15), (29, 15)], 'A')  # sash tail
    put(g, [(28, 7), (28, 8), (28, 9), (28, 14), (28, 15), (28, 16)], 'o')  # knee guards
    save('small-dressed.txt', g)


def big():
    """Rows are the chibi's (big-chibi.txt), mapped onto the lengthened body by R and span."""
    g = load('big.txt')
    wear(g, 'scarf', (39, 40), (15, 23))
    wear(g, 'scarf', (41, 41), (17, 23))
    # sleeves: the upper arm, where the ruff does not hang over it
    for y, (a, b) in {40: (11, 12), 41: (10, 12), 42: (9, 12), 43: (9, 12), 44: (8, 12)}.items():
        wear(g, 'sleeve', (y, y), (a, b))
    wear(g, 'glove', span(48, 50), (8, 12))
    wear(g, 'vest', (40, R(50)), (13, 23))  # after the scarf: only the fur it left
    wear(g, 'belt', span(51, 51), (12, 23))
    wear(g, 'tasset', span(52, 56), (12, 23))
    wear(g, 'pants', span(57, 57), (11, 23))
    wear(g, 'boot', span(58, 62), (10, 23))
    # scarf drape: a cowl that dips to a point at the middle
    for y, (a, b) in {42: (19, 28), 43: (21, 26), 44: (23, 24)}.items():
        put(g, [(y, x) for x in range(a, b + 1)], 'F')
    put(g, [(42, 19), (42, 28), (43, 21), (43, 26)], 'f')
    # vest: a seam down the middle and a sheen on the light side
    put(g, [(y, 23) for y in range(46, R(50) + 1)], 'U')
    put(g, [(43, 16), (44, 16), (44, 17), (45, 17), (46, 16)], 'v')
    # strap from the right shoulder (viewer's left) to the left hip, two pixels wide, with a buckle halfway
    strap = line((40, 14), (R(51), 33))
    put(g, strap, 'R')
    put(g, [(y, x + 1) for y, x in strap], 'r')
    my, mx = strap[len(strap) // 2]
    put(g, [(my, mx), (my, mx + 1), (my + 1, mx + 1), (my + 1, mx + 2)], 'Y')
    # belt buckle and a tan sash wrapped under it, its tail hanging on the viewer's right
    put(g, [(R(51), x) for x in range(22, 26)], 'Y')
    put(g, [(R(52), x) for x in range(14, 34)], 'A')
    put(g, [(R(52), x) for x in range(16, 34, 4)], 'a')
    for y in range(R(53), R(60) + 1):
        put(g, [(y, 30), (y, 31)], 'A')
        put(g, [(y, 32)], 'a')
    # tassets: a quilted diamond pattern, parted in the middle over the shirt
    for y in range(*(lambda a, b: (a, b + 1))(*span(53, 56))):
        for x in range(13, 35):
            if g[y][x] in 'Qq':
                g[y][x] = 'q' if (x + y) % 4 == 0 or (x - y) % 4 == 0 else 'Q'
    put(g, [(y, x) for y in range(R(53), span(55, 55)[1] + 1) for x in (23, 24)], 'W')
    # knee guards over the top of the boots
    put(g, [(R(58), x) for x in list(range(12, 21)) + list(range(27, 36))], 'o')
    put(g, [(R(59), x) for x in (14, 15, 17, 18, 29, 30, 32, 33)], 'o')
    save('big-dressed.txt', g)


if __name__ == '__main__':
    small()
    big()
    print('dressed')
