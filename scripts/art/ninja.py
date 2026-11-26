from art import ALL, Pic, box, ell, poly, stroke

PAL = {
    'o': '#04040a',
    'n0': '#07071c', 'n1': '#0c0c2e', 'n2': '#141644', 'n3': '#1e2462', 'n4': '#2c3884',  # night sky
    'q0': '#7c88b0', 'q1': '#b8c2dc', 'q2': '#eef2fa',  # the moon
    'u0': '#030308', 'u1': '#080818', 'uw': '#f0c050',  # roofs against the sky, a lit window
    'h0': '#07070d', 'h1': '#10111a', 'h2': '#1b1d2c', 'h3': '#2a2e46', 'h4': '#414e6e', 'h5': '#6a86a8', 'h6': '#a4d0e8',  # hood and mask
    's0': '#2e1814', 's1': '#6c4030', 's2': '#aa7254', 's3': '#e0aa84', 's4': '#f8dcc0',  # skin round the eyes
    'r0': '#18050b', 'r1': '#440b16', 'r2': '#821624', 'r3': '#c22a38', 'r4': '#f05858', 'r5': '#ffa8a4',  # scale armour
    'p0': '#0e1016', 'p1': '#222632', 'p2': '#3e4658', 'p3': '#687488', 'p4': '#9eaec4', 'p5': '#dceaf8',  # shoulder plates
    'b0': '#0a348c', 'b1': '#1a86e0', 'b2': '#68dcff', 'b3': '#f0ffff',  # the blade's light
    'y0': '#6e501a', 'y1': '#d4a43c', 'y2': '#fff0a0',  # guard
    'e': '#f6f2ea',
}
HOOD = 'h0 h1 h2 h3 h4 h5 h6'
SKIN = 's0 s1 s2 s3 s4'
RED = 'r0 r1 r2 r3 r4 r5'
PLATE = 'p0 p1 p2 p3 p4 p5'
GLOW = (-0.25, 0.6, 0.62)  # the blade's light, from below and in front
BLADE = [(11, 51), (63, 29)]


def draw():
    p = Pic(PAL, [HOOD, SKIN, RED, PLATE, 'n0 n1 n2 n3 n4'])
    # Night: a great moon behind the right shoulder, roofs low against the sky.
    p.grad(ALL, 'n0 n1 n2 n3 n4', (0, 0), (0, 56), dither=0.9)
    for i, (x, y) in enumerate(((3, 5), (9, 13), (14, 3), (5, 22), (12, 28), (58, 40), (2, 34), (20, 9), (61, 3), (33, 1))):
        p.px(x, y, 'q2' if i % 2 else 'q0')
    moon = ell(32, 2, 62, 32)
    p.fill({(x + dx, y + dy) for x, y in moon for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}, 'n4')
    p.ball(moon, 47, 17, 15, 15, 'q0 q1 q1 q2 q2', (0.3, -0.4, 0.86), 0.3)
    for x0, y0, x1, y1 in ((50, 8, 54, 11), (54, 18, 59, 22), (46, 22, 49, 24), (56, 12, 58, 14)):
        p.fill(ell(x0, y0, x1, y1), 'q0')
    for x0, x1, y0, u in ((0, 7, 38, 'u1'), (6, 13, 44, 'u0'), (52, 58, 40, 'u0'), (57, 63, 34, 'u1')):
        p.fill(box(x0, y0, x1, 63), u)
        for wy in range(y0 + 3, 50, 4):
            p.px(x0 + 2 + wy % 3, wy, 'uw')
    p.fill(poly([(0, 38), (4, 34), (8, 38)]), 'u1')  # a pitched roof

    def form(m, cx, cy, rx, ry, ramp, amb=0.1, light=GLOW):
        p.fill({(x + dx, y + dy) for x, y in m for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}, 'o')
        p.ball(m, cx, cy, rx, ry, ramp, light, amb)

    # Chest: red scales, each a small shield lapping the row below.
    chest = poly([(10, 44), (20, 36), (42, 36), (52, 44), (54, 64), (8, 64)])
    p.fill({(x + dx, y + dy) for x, y in chest for dx, dy in ((1, 0), (-1, 0), (0, -1))}, 'o')
    p.fill(chest, 'r2')
    for x, y in chest:
        row = (y - 36) // 4
        u, v = (x + row * 3) % 6, (y - 36) % 4
        if v == 3 and u in (0, 1, 5) or v == 2 and u in (2, 4) or v == 1 and u == 3:
            p.px(x, y, 'r0')  # the scale's lower edge, a V
        elif v == 0 and u in (1, 2):
            p.px(x, y, 'r3')
    p.shift(poly([(34, 36), (44, 36), (54, 44), (56, 64), (38, 64)]) & chest, -1)
    # The shoulder plates: the far one small, the near one broad, both lit from the blade below.
    far = poly([(0, 44), (8, 38), (19, 37), (20, 44), (12, 50), (0, 52)])
    form(far, 10, 44, 12, 9, PLATE, 0.12)
    near = poly([(42, 36), (54, 37), (63, 42), (63, 58), (50, 54), (41, 44)])
    form(near, 52, 46, 13, 12, PLATE, 0.12)
    p.rim(near, 'p5', ((0, -1),), box(44, 30, 63, 44))  # the moon on its top edge
    p.line([(46, 47), (62, 52)], 'p0')
    p.line([(46, 48), (62, 53)], 'p3')
    # Neck wrap.
    p.fill(poly([(22, 32), (38, 32), (40, 40), (22, 40)]), 'h1')
    p.line([(24, 36), (38, 35)], 'h3')
    p.line([(24, 39), (39, 38)], 'h2')
    # The hood, three quarters left.
    hood = poly([(16, 13), (20, 6), (27, 2), (34, 3), (40, 8), (43, 16), (43, 26), (40, 33), (33, 37), (24, 37), (18, 32), (15, 23)])
    form(hood, 28, 20, 15, 18, HOOD, 0.14)
    p.rim(hood, 'h5', ((1, 0), (0, -1)), box(31, 0, 45, 24))  # the moon behind it
    for path in ([(34, 6), (38, 16), (37, 30)], [(29, 4), (31, 12)]):  # folds
        p.shift(stroke(path, 1) & hood, -1)
    # The slit: skin, the eyes hard under the brow's shadow.
    slit = poly([(17, 15), (33, 14), (36, 18), (34, 23), (18, 23), (16, 19)])
    p.fill({(x, y - 1) for x, y in slit} | {(x + 1, y) for x, y in slit}, 'o')
    p.grad(slit, SKIN, (24, 13), (24, 25))
    p.fill(slit & box(0, 14, 63, 15), 's0')
    p.line([(17, 17), (22, 18)], 'o')  # brows drawn down to the nose
    p.line([(26, 18), (33, 16)], 'o')
    p.rows(18, 19, '''
oeio...oieeo
.oo.....ooo.
''', {'o': 'o', 'e': 'e', 'i': 'b1'})
    p.pxs([(23, 19), (23, 20), (24, 21)], 's2')  # nose bridge
    p.px(24, 19, 's4')
    # The mask over nose and mouth: cloth pulled tight, lit from below.
    mask = poly([(17, 23), (35, 23), (38, 28), (36, 33), (30, 37), (24, 37), (19, 32), (16, 27)])
    p.ball(mask, 25, 27, 13, 12, 'h2 h3 h3 h4 h4 h5 h6', GLOW, 0.2)
    p.line([(17, 23), (35, 23)], 'h5')
    p.line([(22, 24), (21, 28), (23, 31)], 'h2')  # the nose under the cloth
    p.line([(26, 31), (33, 29)], 'h2')
    p.line([(27, 34), (35, 30)], 'h3')
    # The blade's glow on what it passes, then the blade: white-hot, edged in blue.
    p.shift(stroke(BLADE, 9) & (chest | near | mask), 1)
    p.fill(stroke(BLADE, 5), 'b0')
    p.fill(stroke(BLADE, 3), 'b1')
    p.fill(stroke([(11, 50), (63, 28)], 1), 'b2')
    p.fill(stroke(BLADE, 1), 'b3')
    p.pxs([(30, 40), (44, 34), (22, 49), (53, 36), (37, 44)], 'b2')  # motes off it
    # Guard, the wrapped hilt, the gloved fist round it.
    p.fill(poly([(9, 46), (12, 47), (14, 56), (11, 56)]), 'o')
    p.fill(poly([(10, 47), (12, 48), (13, 55), (11, 55)]), 'y1')
    p.line([(10, 47), (11, 54)], 'y2')
    p.fill(stroke([(0, 56), (10, 52)], 4), 'o')
    p.fill(stroke([(0, 56), (10, 52)], 2), 'h2')
    fist = ell(0, 49, 9, 59)
    form(fist, 4, 54, 6, 6, 'h1 h2 h2 h3 h3 h4', 0.3, (0.5, -0.3, 0.7))
    p.pxs([(2, 52), (4, 51), (6, 51)], 'h4')
    p.line([(1, 55), (7, 53)], 'h0')
    return p
