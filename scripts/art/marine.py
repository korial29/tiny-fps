from art import ALL, Pic, box, ell, poly, stroke

PAL = {
    'o': '#07060a',
    'k0': '#081014', 'k1': '#0c1a1e', 'k2': '#12282a', 'k3': '#1c3c38', 'k4': '#2e5a48', 'k5': '#58844e', 'k6': '#a0b05a',  # night sky to the glow on the skyline
    'u0': '#050a0c', 'u1': '#0a1416', 'uw': '#e0c060',  # buildings against it, a lit window
    's0': '#24100e', 's1': '#4a2418', 's2': '#7c4228', 's3': '#b06a3e', 's4': '#dc9a5e', 's5': '#f8cc8c', 's6': '#fff0c8',  # skin in the flash
    'r0': '#1c060c', 'r1': '#420c14', 'r2': '#78141c', 'r3': '#b02024', 'r4': '#e03c2c', 'r5': '#ff7a40', 'r6': '#ffc878',  # red armour
    'g0': '#0a0c10', 'g1': '#181c24', 'g2': '#2a303c', 'g3': '#444c5c', 'g4': '#6c788c', 'g5': '#a8b4c4',  # rifle, gloves, under-suit
    'f0': '#c8401c', 'f1': '#ff8a20', 'f2': '#ffd850', 'f3': '#ffffe8',  # muzzle flash
    'm0': '#1a0408', 'm1': '#5a1018', 't': '#f0e8d8', 'e': '#f8f4ec',  # mouth, teeth, eye
}
SKIN = 's0 s1 s2 s3 s4 s5 s6'
RED = 'r0 r1 r2 r3 r4 r5 r6'
PLATE = 'r0 r1 r1 r2 r2 r3 r3 r4 r5'  # the armour's shading: mostly deep reds, the flash only on what faces it
GUN = 'g0 g1 g2 g3 g4 g5'
FLASH = (0.62, -0.3, 0.6)  # the muzzle's light, from the right and a little above


def draw():
    p = Pic(PAL, [SKIN, RED, GUN, 'k0 k1 k2 k3 k4 k5 k6'])
    # Night over the rooftops: a sick green glow along the skyline, towers against it.
    p.grad(ALL, 'k0 k1 k2 k3 k4 k5 k6', (0, 0), (0, 44), dither=0.9)
    for x, y in ((4, 5), (13, 11), (22, 2), (45, 4), (52, 12), (60, 6), (38, 9), (57, 20), (9, 19)):
        p.px(x, y, 'k5')
    for x0, x1, y0, u in ((0, 6, 20, 'u1'), (5, 12, 26, 'u0'), (11, 17, 16, 'u1'), (44, 50, 18, 'u1'), (49, 57, 24, 'u0'), (56, 63, 12, 'u1')):
        p.fill(box(x0, y0, x1, 63), u)
        p.line([(x0, y0), (x1, y0)], 'k2')
        for wy in range(y0 + 3, 40, 4):
            p.px(x0 + 2 + wy % 3, wy, 'uw')
    p.line([(14, 8), (14, 16)], 'u1')  # an aerial
    p.line([(60, 4), (60, 12)], 'u1')

    def form(m, cx, cy, rx, ry, ramp, amb=0.12, light=FLASH):
        p.fill({(x + dx, y + dy) for x, y in m for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}, 'o')
        p.ball(m, cx, cy, rx, ry, ramp, light, amb)

    # The far shoulder and the chest plate.
    far = ell(38, 30, 60, 48)
    form(far, 50, 40, 12, 10, PLATE)
    chest = poly([(10, 40), (20, 33), (42, 33), (52, 40), (54, 64), (8, 64)])
    form(chest, 34, 46, 26, 24, PLATE, 0.1)
    p.shift(poly([(8, 40), (24, 34), (26, 64), (8, 64)]), -1)
    p.line([(30, 36), (29, 64)], 'r1')
    p.line([(31, 36), (30, 64)], 'r4')
    p.line([(12, 54), (52, 52)], 'r1')
    # Neck and the collar ring.
    neck = poly([(22, 26), (34, 26), (36, 35), (22, 35)])
    p.ball(neck, 30, 30, 8, 10, SKIN, FLASH, 0.05)
    p.shift(neck & box(0, 26, 63, 30), -2)
    collar = poly([(18, 33), (40, 32), (42, 37), (30, 39), (18, 37)])
    form(collar, 30, 35, 14, 5, GUN, 0.2)
    # Head: shaved, three quarters right, the mouth wide in a yell.
    head = poly([(18, 10), (21, 5), (27, 2), (33, 3), (37, 7), (39, 13), (39, 17), (41, 21), (39, 23), (39, 28), (36, 32), (30, 32), (24, 29), (20, 24), (17, 17)])
    form(head, 29, 16, 12, 16, SKIN, 0.1)
    p.rim(head, 's6', ((1, 0),), box(36, 6, 42, 22))
    # Ear, and the stubble's shadow over the scalp.
    p.fill(ell(18, 15, 22, 22), 's2')
    p.fill(ell(19, 16, 21, 20), 's0')
    p.px(20, 17, 's3')
    scalp = poly([(18, 10), (21, 5), (27, 2), (33, 3), (37, 7), (38, 10), (30, 9), (24, 11), (21, 15), (18, 15)])
    p.shift(scalp & head, -1)
    for x, y in scalp & head:
        if (x * 3 + y * 5) % 7 == 0:
            p.shift({(x, y)}, -1)
    # Brows knotted, eyes narrowed under them.
    p.line([(28, 13), (33, 15)], 's0', 2)
    p.line([(35, 15), (38, 13)], 's0', 2)
    p.rows(29, 16, '''
oeio..oio
.ooo...o.
''', {'o': 'o', 'e': 'e', 'i': 'g1'})
    p.shift(poly([(27, 17), (33, 19), (32, 21), (27, 20)]), -1)  # the socket's shade
    # Nose, its bridge lit.
    p.line([(35, 16), (37, 21)], 's6')
    p.line([(34, 17), (35, 21)], 's3')
    p.pxs([(36, 22), (37, 22), (35, 22)], 's1')
    # Cheek creased by the yell, and the mouth.
    p.line([(31, 21), (30, 26)], 's2')
    p.rows(32, 23, '''
.ottttt
ottttttt
ommmmmmo
ommmmmmo
omnnnmmo
.otttto.
..oooo..
''', {'o': 'o', 't': 't', 'm': 'm0', 'n': 'm1'})
    p.line([(32, 31), (36, 32)], 's2')
    # The near pauldron: big, round, its edge rolled.
    pad = ell(-4, 30, 24, 56)
    form(pad, 10, 43, 15, 14, PLATE, 0.1)
    p.rim(pad, 'r5', ((1, 0),), box(14, 30, 26, 50))
    p.shift(stroke([(0, 49), (10, 51), (20, 47)], 1) & pad, -2)
    p.shift(stroke([(0, 50), (10, 52), (20, 48)], 1) & pad, 1)
    p.rows(6, 37, '''
.www.
w...w
w.w.w
w...w
.www.
''', {'w': 'r5'})
    # The rifle across the chest, shouldered, firing off to the right.
    stock = poly([(10, 44), (22, 42), (22, 49), (10, 53)])
    body = poly([(22, 40), (44, 38), (44, 47), (22, 49)])
    guard = poly([(44, 39), (55, 38), (55, 44), (44, 45)])
    for m, flat in ((stock, 0.4), (body, 0.5), (guard, 0.6)):
        p.fill({(x + dx, y + dy) for x, y in m for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}, 'o')
        p.bevel(m, GUN, 2, (0.5, -0.8), flat)
    p.fill(box(55, 40, 58, 42), 'g2')  # barrel
    p.line([(55, 40), (58, 40)], 'g5')
    p.fill(poly([(31, 48), (36, 48), (35, 57), (30, 57)]), 'g1')  # magazine
    p.line([(36, 48), (35, 57)], 'g4')
    p.fill(box(28, 36, 38, 38), 'g1')  # sight rail
    p.line([(28, 36), (38, 36)], 'g4')
    p.fill(box(39, 34, 41, 38), 'g2')
    p.line([(24, 43), (42, 42)], 'f1')  # the charge line along its side
    p.pxs([(40, 42), (41, 42), (42, 42)], 'f2')
    for x in (46, 48, 50, 52):  # vents in the guard
        p.line([(x, 41), (x, 43)], 'g0')
    # Gloves: one on the grip, one under the guard.
    for cx, cy in ((24, 50), (47, 47)):
        fist = ell(cx - 4, cy - 4, cx + 4, cy + 4)
        form(fist, cx, cy, 5, 5, GUN, 0.25)
        p.pxs([(cx - 2, cy + 1), (cx, cy + 2), (cx + 2, cy + 1)], 'g0')
    # The muzzle flash: a hard star, white at its heart.
    star = poly([(55, 41), (58, 39), (57, 33), (60, 37), (63, 31), (63, 51), (60, 45), (57, 49), (58, 43)])
    p.fill(star, 'f1')
    p.fill(poly([(57, 41), (59, 40), (59, 36), (61, 38), (63, 35), (63, 47), (61, 44), (59, 46), (59, 42)]), 'f2')
    p.fill(ell(59, 39, 64, 43), 'f3')
    p.edge(star, 'f0', ((-1, 0), (0, -1), (0, 1)))
    p.pxs([(53, 36), (55, 47), (52, 33), (56, 30), (54, 52)], 'f2')  # sparks
    return p
