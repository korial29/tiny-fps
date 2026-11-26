from art import ALL, Pic, box, ell, poly, stroke

PAL = {
    'o': '#06060e',
    'k0': '#080818', 'k1': '#100e2a', 'k2': '#1c1440', 'k3': '#30205c', 'k4': '#4c2c78', 'k5': '#7c4494',  # space, a nebula across it
    'st': '#ffffff', 'sb': '#8cc8ff',  # stars
    'e0': '#3a3c50', 'e1': '#62667c', 'e2': '#9498aa', 'e3': '#c4c6d0',  # the moon's ground
    'w0': '#1a1c36', 'w1': '#34386a', 'w2': '#5c64a0', 'w3': '#8e9ac8', 'w4': '#bcc8e4', 'w5': '#e4ecf8', 'w6': '#ffffff',  # white suit, its shade blue
    'r0': '#6a1024', 'r1': '#c4203a', 'r2': '#ff4c5a',  # the suit's stripes
    'v0': '#1a0a04', 'v1': '#5a2408', 'v2': '#b05a10', 'v3': '#f09a20', 'v4': '#ffd858', 'v5': '#fffad0',  # gold visor
    'g0': '#0c0e16', 'g1': '#1e222e', 'g2': '#343a4a', 'g3': '#58607a', 'g4': '#8c98b4',  # gun, joints
    'b0': '#0a4a9c', 'b1': '#20a0f0', 'b2': '#78e4ff', 'b3': '#f0ffff',  # the beam
}
SUIT = 'w0 w1 w2 w3 w4 w5 w6'
VISOR = 'v0 v1 v2 v3 v4 v5'
GUN = 'g0 g1 g2 g3 g4'
SUN = (-0.5, -0.62, 0.6)  # raw sunlight from the upper left


def draw():
    p = Pic(PAL, [SUIT, VISOR, GUN, 'k0 k1 k2 k3 k4 k5', 'e0 e1 e2 e3'])
    # Space: a band of nebula from the lower left to the upper right, stars, the moon's horizon.
    p.tone(ALL, 'k0 k1 k2 k3 k4 k5 k4 k3 k2 k1 k0', lambda x, y: (x * 0.45 + (63 - y) * 0.9 + 6) / 100, 0.9)
    for i, (x, y) in enumerate(((3, 4), (9, 14), (15, 6), (50, 3), (57, 9), (61, 17), (47, 12), (5, 24), (54, 24), (12, 30), (60, 30), (2, 36), (44, 2))):
        p.px(x, y, 'st' if i % 3 else 'sb')
    p.rows(55, 3, '''
.w.
wsw
.w.
''', {'w': 'sb', 's': 'st'})
    ground = poly([(0, 46), (20, 44), (44, 45), (63, 43), (63, 63), (0, 63)])
    p.grad(ground, 'e3 e2 e1 e0', (0, 44), (0, 60))
    p.fill(ell(3, 48, 11, 51), 'e0')
    p.line([(4, 51), (10, 51)], 'e3')

    def form(m, cx, cy, rx, ry, ramp, amb=0.16, light=SUN):
        p.fill({(x + dx, y + dy) for x, y in m for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}, 'o')
        p.ball(m, cx, cy, rx, ry, ramp, light, amb)

    # The far shoulder, then the chest and its control unit.
    far = ell(36, 32, 58, 50)
    form(far, 47, 42, 12, 10, SUIT)
    chest = poly([(8, 42), (18, 35), (40, 35), (50, 42), (52, 64), (6, 64)])
    form(chest, 26, 46, 26, 24, SUIT)
    p.shift(poly([(34, 36), (42, 35), (52, 42), (54, 64), (38, 64)]) & chest, -1)
    unit = box(26, 48, 38, 58)
    p.fill({(x + dx, y + dy) for x, y in unit for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}, 'o')
    p.bevel(unit, GUN, 2, flat=0.45)
    p.pxs([(28, 51), (30, 51)], 'r2')
    p.pxs([(33, 51), (35, 51)], 'b2')
    p.line([(28, 54), (36, 54)], 'g0')
    p.line([(8, 60), (25, 60)], 'r1')
    p.line([(8, 59), (25, 59)], 'r2')
    p.line([(39, 60), (52, 60)], 'r0')
    p.line([(39, 59), (52, 59)], 'r1')
    # Neck ring.
    ring = poly([(15, 31), (41, 30), (43, 37), (29, 39), (15, 37)])
    form(ring, 26, 33, 16, 6, GUN, 0.3)
    p.line([(16, 32), (40, 31)], 'g4')
    # The helmet: a white dome, its gold visor three quarters to the right.
    helm = ell(11, 0, 45, 34)
    form(helm, 28, 17, 17, 17, SUIT)
    p.rim(helm, 'w6', ((0, -1), (-1, 0)), box(11, 0, 30, 14))
    p.line([(24, 1), (21, 10)], 'r1', 2)  # the red stripe over the crown
    p.line([(24, 1), (21, 9)], 'r2')
    p.fill(box(12, 14, 16, 21), 'o')  # the lamp at its temple
    p.fill(box(13, 15, 15, 20), 'g3')
    p.fill(box(13, 16, 14, 19), 'v4')
    visor = poly([(22, 9), (38, 7), (43, 11), (45, 18), (43, 25), (38, 29), (25, 29), (20, 22), (20, 14)])
    p.fill({(x + dx, y + dy) for x, y in visor for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}, 'g1')
    p.edge(visor, 'w2', ((0, 1),))
    # In the visor: the black sky above, the sunlit ground below, the sun itself a hard glint.
    p.ball(visor, 34, 18, 14, 13, VISOR, (-0.45, -0.3, 0.84), 0.0)
    p.shift(visor & box(0, 0, 63, 12), -1)
    p.shift(poly([(20, 22), (45, 19), (44, 25), (38, 29), (25, 29)]) & visor, 1)
    p.line([(21, 22), (44, 19)], 'v1')
    p.fill(box(25, 12, 28, 15), 'v5')
    p.pxs([(24, 13), (29, 14), (26, 11), (27, 16), (26, 16)], 'v4')
    p.line([(31, 11), (36, 10)], 'v4')
    p.pxs([(40, 23), (41, 22)], 'v5')
    # The near shoulder, the red band round it.
    pad = ell(-5, 32, 21, 56)
    form(pad, 8, 44, 14, 13, SUIT)
    p.fill(stroke([(0, 48), (10, 49), (20, 45)], 2) & pad, 'r1')
    p.fill(stroke([(0, 47), (10, 48), (16, 46)], 1) & pad, 'r2')
    # The rifle levelled to the right, its emitter alight.
    body = poly([(16, 43), (42, 40), (43, 48), (16, 51)])
    nose = poly([(42, 41), (53, 40), (53, 46), (43, 47)])
    for m, flat in ((body, 0.45), (nose, 0.6)):
        p.fill({(x + dx, y + dy) for x, y in m for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}, 'o')
        p.bevel(m, GUN, 2, (-0.5, -0.8), flat)
    p.fill(box(24, 44, 39, 45), 'b0')  # the glowing cell along its side
    p.line([(25, 44), (38, 44)], 'b2')
    p.pxs([(27, 44), (28, 44), (33, 44)], 'b3')
    p.fill(box(26, 38, 34, 40), 'g1')  # scope
    p.line([(26, 38), (34, 38)], 'g4')
    p.px(35, 39, 'b2')
    for x in (45, 47, 49, 51):
        p.line([(x, 42), (x, 44)], 'g0')
    # Gloves: one at the grip, one under the nose.
    for cx, cy in ((21, 51), (41, 49)):
        fist = ell(cx - 4, cy - 4, cx + 4, cy + 4)
        form(fist, cx, cy, 5, 5, SUIT, 0.2)
        p.pxs([(cx - 2, cy + 1), (cx, cy + 2), (cx + 2, cy + 1)], 'w1')
    # The beam out of the tile, a burst where it leaves the emitter.
    p.fill(box(54, 41, 63, 45), 'b0')
    p.fill(box(54, 42, 63, 44), 'b1')
    p.line([(54, 43), (63, 43)], 'b3')
    p.line([(56, 42), (63, 42)], 'b2')
    burst = poly([(52, 43), (55, 40), (55, 36), (57, 40), (60, 38), (58, 42), (58, 44), (60, 48), (57, 46), (55, 50), (55, 46)])
    p.fill(burst, 'b1')
    p.fill(ell(53, 41, 58, 45), 'b2')
    p.fill(box(54, 42, 57, 44), 'b3')
    p.pxs([(51, 37), (59, 34), (52, 50), (61, 50)], 'b2')
    return p
