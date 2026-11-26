"""Hand-drawn 64x64 pixel portraits for the character screen's class tiles (the user, 2026-11-26).

Each portrait is drawn with flat-colour primitives (no antialiasing) and a palette of its own;
export.py writes them into src/client/cast-art.ts.
"""
import sys
from PIL import Image, ImageDraw

N = 64


class Pic:
    def __init__(self, pal):
        self.pal = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for k, v in pal.items()}
        self.im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def c(self, k):
        return self.pal[k]

    def poly(self, pts, k):
        self.d.polygon(pts, fill=self.c(k))

    def ell(self, x0, y0, x1, y1, k):
        self.d.ellipse((x0, y0, x1, y1), fill=self.c(k))

    def rect(self, x0, y0, x1, y1, k):
        self.d.rectangle((x0, y0, x1, y1), fill=self.c(k))

    def line(self, pts, k, w=1):
        self.d.line(pts, fill=self.c(k), width=w)

    def px(self, x, y, k):
        if 0 <= x < N and 0 <= y < N:
            self.im.putpixel((x, y), self.c(k))

    def pxs(self, pts, k):
        for x, y in pts:
            self.px(x, y, k)

    def rows(self, x, y, art, keys):
        """Paste a small hand-placed sprite: each char a key in `keys`, '.' left as it is."""
        for j, row in enumerate(art.strip('\n').split('\n')):
            for i, ch in enumerate(row):
                if ch != '.' and ch != ' ':
                    self.px(x + i, y + j, keys[ch])

    def outline(self, k):
        """A dark line round the silhouette, on the transparent side (4-connected)."""
        src = self.im.copy()
        a = src.load()
        o = self.c(k)
        for y in range(N):
            for x in range(N):
                if a[x, y][3]:
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    X, Y = x + dx, y + dy
                    if 0 <= X < N and 0 <= Y < N and a[X, Y][3] and a[X, Y][:3] != o[:3]:
                        self.im.putpixel((x, y), o)
                        break

    def recolor(self, region_k, dst_k, test):
        """Repaint the pixels of colour region_k for which test(x, y) holds."""
        src = self.c(region_k)
        for y in range(N):
            for x in range(N):
                if self.im.getpixel((x, y)) == src and test(x, y):
                    self.px(x, y, dst_k)


def preview(pics, path, scale=5):
    """The portraits side by side on the tile's background, big, and at their real size under them."""
    pad = 8
    W = len(pics) * (N * scale + pad) + pad
    H = N * scale + 2 * pad + N + pad
    out = Image.new('RGBA', (W, H), (20, 26, 34, 255))
    for i, p in enumerate(pics):
        bg = Image.new('RGBA', (N, N))
        for y in range(N):
            for x in range(N):
                r = min(1, ((x - 32) ** 2 + (y - 32) ** 2) ** 0.5 / 45)
                bg.putpixel((x, y), tuple(int(a + (b - a) * r) for a, b in zip((0x26, 0x32, 0x3e), (0x0d, 0x14, 0x1c))) + (255,))
        bg.alpha_composite(p.im)
        x = pad + i * (N * scale + pad)
        out.paste(bg.resize((N * scale, N * scale), Image.NEAREST), (x, pad))
        out.paste(bg, (x, N * scale + 2 * pad))
        out.paste(bg.resize((N * 78 // 64 + 1, N * 78 // 64 + 1), Image.NEAREST), (x + N + pad, N * scale + 2 * pad))
    out.save(path)
