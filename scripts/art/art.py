"""Hand-drawn 64x64 pixel portraits for the character screen's class tiles (the user, 2026-11-26).

Each portrait fills its tile: a backdrop, then the figure built from masks (sets of pixels) that are
shaded along colour ramps, then details placed by hand. export.py writes them into
src/client/cast-art.ts.
"""
from PIL import Image, ImageDraw

N = 64
BAYER = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))


def poly(pts):
    """The pixels of a polygon, as a mask."""
    im = Image.new('L', (N, N), 0)
    ImageDraw.Draw(im).polygon(pts, fill=1)
    a = im.load()
    return {(x, y) for y in range(N) for x in range(N) if a[x, y]}


def ell(x0, y0, x1, y1):
    im = Image.new('L', (N, N), 0)
    ImageDraw.Draw(im).ellipse((x0, y0, x1, y1), fill=1)
    a = im.load()
    return {(x, y) for y in range(N) for x in range(N) if a[x, y]}


def stroke(pts, w=1):
    im = Image.new('L', (N, N), 0)
    ImageDraw.Draw(im).line(pts, fill=1, width=w)
    a = im.load()
    return {(x, y) for y in range(N) for x in range(N) if a[x, y]}


def box(x0, y0, x1, y1):
    return {(x, y) for y in range(max(0, y0), min(N, y1 + 1)) for x in range(max(0, x0), min(N, x1 + 1))}


ALL = box(0, 0, N - 1, N - 1)


def mirror(m, axis=63):
    """A mask's reflection about the vertical line x = axis / 2."""
    return {(axis - x, y) for x, y in m if 0 <= axis - x < N}


def depth(m):
    """Each pixel's distance to its mask's edge (city-block, 1 on the edge)."""
    d = {}
    ring = {p for p in m if any((p[0] + dx, p[1] + dy) not in m for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}
    k = 1
    while ring:
        for p in ring:
            d[p] = k
        nxt = set()
        for x, y in ring:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dx, y + dy)
                if q in m and q not in d:
                    nxt.add(q)
        ring = nxt
        k += 1
    return d


class Pic:
    def __init__(self, pal, ramps=()):
        self.pal = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for k, v in pal.items()}
        self.ramps = [r.split() if isinstance(r, str) else list(r) for r in ramps]
        self.g = {}

    # --- Flat marks -------------------------------------------------------------------------
    def fill(self, m, k):
        for p in m:
            if 0 <= p[0] < N and 0 <= p[1] < N:
                self.g[p] = k

    def px(self, x, y, k):
        if 0 <= x < N and 0 <= y < N:
            self.g[(x, y)] = k

    def pxs(self, pts, k):
        for x, y in pts:
            self.px(x, y, k)

    def line(self, pts, k, w=1):
        self.fill(stroke(pts, w), k)

    def rows(self, x, y, art, keys):
        """Paste a small hand-placed sprite: each char a key in `keys`, '.' left as it is."""
        for j, row in enumerate(art.strip('\n').split('\n')):
            for i, ch in enumerate(row):
                if ch != '.' and ch != ' ':
                    self.px(x + i, y + j, keys[ch])

    # --- Shading ----------------------------------------------------------------------------
    def tone(self, m, ramp, f, dither=0.0):
        """Paint mask m along `ramp` (dark to light): f(x, y) in 0..1 picks the step, `dither`
        the share of a step that an ordered pattern blurs."""
        r = ramp.split() if isinstance(ramp, str) else ramp
        n = len(r)
        for x, y in m:
            v = max(0.0, min(0.9999, f(x, y))) * n
            if dither:
                v += (BAYER[y & 3][x & 3] / 16 - 0.47) * dither
            self.px(x, y, r[max(0, min(n - 1, int(v)))])

    def ball(self, m, cx, cy, rx, ry, ramp, light=(-0.5, -0.65, 0.57), amb=0.18, dither=0.0):
        """Mask m lit as part of an ellipsoid centred (cx, cy)."""
        lx, ly, lz = light

        def f(x, y):
            nx, ny = (x - cx) / rx, (y - cy) / ry
            q = nx * nx + ny * ny
            if q > 1:
                nx, ny, q = nx / q ** 0.5, ny / q ** 0.5, 1
            nz = (1 - q) ** 0.5
            return amb + (1 - amb) * max(0, nx * lx + ny * ly + nz * lz)
        self.tone(m, ramp, f, dither)

    def bevel(self, m, ramp, r=3, light=(-0.6, -0.8), flat=0.55, dither=0.0):
        """Mask m as a plate with rounded edges r pixels wide: the edges facing the light catch
        it, those turned away fall dark, the middle sits at `flat`."""
        d = depth(m)
        lx, ly = light

        def f(x, y):
            h = d[(x, y)]
            if h > r:
                return flat
            gx = d.get((x + 1, y), 0) - d.get((x - 1, y), 0)
            gy = d.get((x, y + 1), 0) - d.get((x, y - 1), 0)
            s = -(gx * lx + gy * ly) / 2
            return flat + s * (1 - (h - 1) / r) * 0.5
        self.tone(m, ramp, f, dither)

    def grad(self, m, ramp, a, b, dither=0.0):
        """Mask m along a straight gradient from point a (ramp's start) to point b (its end)."""
        (ax, ay), (bx, by) = a, b
        L = (bx - ax) ** 2 + (by - ay) ** 2
        self.tone(m, ramp, lambda x, y: ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L, dither)

    def shift(self, m, n):
        """Move mask m's pixels n steps along their ramps (n < 0 darker): a cast shadow, a glow."""
        for p in m:
            k = self.g.get(p)
            for r in self.ramps:
                if k in r:
                    self.g[p] = r[max(0, min(len(r) - 1, r.index(k) + n))]
                    break

    def rim(self, m, k, dirs=((-1, 0), (0, -1)), inside=None):
        """Mask m's edge pixels on the side(s) of `dirs` painted k: a rim of light, or of shade."""
        for x, y in m:
            if any((x + dx, y + dy) not in m for dx, dy in dirs) and (inside is None or (x, y) in inside):
                self.px(x, y, k)

    def edge(self, m, k, dirs=((1, 0), (-1, 0), (0, 1), (0, -1))):
        """A line of k just outside mask m."""
        for x, y in m:
            for dx, dy in dirs:
                q = (x + dx, y + dy)
                if q not in m:
                    self.px(q[0], q[1], k)

    def form(self, m, ramp, light=(-0.5, -0.65, 0.57), amb=0.15, o='o', grow=1.15):
        """Mask m outlined in o and lit as one rounded lump the size of its bounds."""
        if not m:
            return
        xs, ys = [q[0] for q in m], [q[1] for q in m]
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        rx, ry = (max(xs) - min(xs) + 1) / 2 * grow, (max(ys) - min(ys) + 1) / 2 * grow
        if o:
            self.fill({(x + dx, y + dy) for x, y in m for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}, o)
        self.ball(m, cx, cy, rx, ry, ramp, light, amb)

    def tube(self, pts, w, ramp, light=(-0.5, -0.65, 0.57), amb=0.15, o='o'):
        """A limb: a thick line, outlined and rounded."""
        self.form(stroke(pts, w), ramp, light, amb, o)

    def mirror(self):
        """The left half copied over the right, reflected."""
        for (x, y), k in list(self.g.items()):
            if x < N // 2:
                self.g[(N - 1 - x, y)] = k

    @property
    def im(self):
        im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
        for (x, y), k in self.g.items():
            im.putpixel((x, y), self.pal[k])
        return im


def preview(pics, path, scale=6):
    """The portraits side by side, big, and under them at their real size and at the tile's."""
    pad = 8
    W = len(pics) * (N * scale + pad) + pad
    H = N * scale + 2 * pad + 80 + pad
    out = Image.new('RGBA', (W, H), (15, 22, 30, 255))
    for i, p in enumerate(pics):
        bg = Image.new('RGBA', (N, N), (13, 20, 28, 255))
        bg.alpha_composite(p.im)
        x = pad + i * (N * scale + pad)
        out.paste(bg.resize((N * scale, N * scale), Image.NEAREST), (x, pad))
        out.paste(bg, (x, N * scale + 2 * pad))
        out.paste(bg.resize((78, 78), Image.NEAREST), (x + N + pad, N * scale + 2 * pad))
        out.paste(bg.resize((156, 156), Image.NEAREST).resize((78, 78), Image.BILINEAR), (x + N + 78 + 2 * pad, N * scale + 2 * pad))
    out.save(path)
