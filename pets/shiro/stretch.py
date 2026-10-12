"""Big Shiro's proportions: the hand-drawn chibi (big-chibi.txt) with a longer body, written to big.txt.

The head stays as drawn; plain rows of the torso and arms, the hips and the legs are repeated, so the
head is about half the height instead of three fifths. R() and span() map a row of the chibi to the
lengthened sprite, for anything placed by row (the outfit, the dagger hand).
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))

# after this row of the chibi, this many copies of it (the chest marking left off the copies)
INSERT = {47: 6, 53: 2, 57: 5}


def R(y):
    """Where row y of the chibi lands in the lengthened sprite."""
    return y + sum(k for row, k in INSERT.items() if row < y)


def span(a, b):
    """Rows a..b of the chibi (inclusive), with any copies inserted after b's row."""
    return R(a), R(b + 1) - 1


def stretch(rows):
    out = []
    for y, row in enumerate(rows):
        out.append(row)
        out += [row.replace('M', 'W')] * INSERT.get(y, 0)
    return out


if __name__ == '__main__':
    src = [l for l in open(os.path.join(HERE, 'big-chibi.txt')).read().split('\n') if l and not l.startswith('#')]
    rows = stretch(src)
    open(os.path.join(HERE, 'big.txt'), 'w').write('# idle\n' + '\n'.join(rows) + '\n')
    print(f'big.txt: {len(src)} -> {len(rows)} rows')
