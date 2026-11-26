from art import ALL, Pic, box, ell, poly, stroke

PAL = {
    'o': '#050608',
    'k0': '#1a2029', 'k1': '#262e3a', 'k2': '#343e4c', 'k3': '#465262', 'k4': '#5e6c7e', 'k5': '#8090a2',  # storm sky
    'b0': '#15161a', 'b1': '#2e3036', 'b2': '#4e5058', 'b3': '#78787a', 'b4': '#a6a49a', 'b5': '#d4d0be', 'b6': '#f6f2e2',  # bone mask
    's0': '#0a0c11', 's1': '#161a22', 's2': '#232a36', 's3': '#343e4e', 's4': '#4e5c72', 's5': '#7e90a8', 's6': '#c4d4e6',  # armour
    'd0': '#08090c', 'd1': '#14171d', 'd2': '#262b36', 'd3': '#3c4452',  # dreadlocks
    'y0': '#5a3c14', 'y1': '#a87a2a', 'y2': '#e8c468', 'y3': '#fff0b0',  # gold trim
    'n0': '#12100d', 'n1': '#2c281f', 'n2': '#4a4434', 'n3': '#6c644c',  # skin under the mesh
    'r0': '#5a0c0a', 'r1': '#c81e14', 'r2': '#ff4a2c', 'r3': '#ffb48c',  # the eyes' and the laser's glow
    'w0': '#2c3644', 'w1': '#66768a', 'w2': '#aebccc', 'w3': '#ffffff',  # wrist blades
}
SKY = 'k0 k1 k2 k3 k4 k5'
BONE = 'b0 b1 b2 b3 b4 b5 b6'
STEEL = 's0 s1 s2 s3 s4 s5 s6'
DREAD = 'd0 d1 d2 d3'
GOLD = 'y0 y1 y2 y3'
SKIN = 'n0 n1 n2 n3'
BLADE = 'w0 w1 w2 w3'
LIGHT = (-0.55, -0.6, 0.58)  # moonlight from the upper left, towards us


def draw():
    p = Pic(PAL, [SKY, BONE, STEEL, DREAD, GOLD, SKIN, BLADE, 'r0 r1 r2 r3'])
    # Storm sky: dark overhead, banks of cloud lit from behind low on the left.
    p.fill(ALL, 'k2')
    p.fill(ell(-20, -24, 50, 16) | ell(30, -14, 80, 22), 'k1')
    p.fill(ell(-10, -30, 40, 6) | ell(44, -20, 70, 8), 'k0')
    p.fill(ell(-24, 30, 26, 70) | ell(40, 20, 90, 50), 'k3')
    p.fill(ell(-22, 40, 16, 74) | ell(-6, 36, 12, 48), 'k4')
    p.fill(ell(-14, 50, 8, 70), 'k5')
    p.fill(ell(50, 26, 70, 36), 'k4')

    # --- The cannon on the near shoulder, behind the head ------------------------------------
    gun = poly([(42, 14), (60, 8), (63, 10), (63, 22), (48, 27), (42, 23)])
    p.fill({(x + dx, y + dy) for x, y in gun for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}, 'o')
    p.bevel(gun, STEEL, 2, flat=0.6)
    p.line([(43, 15), (60, 9)], 's6')
    p.line([(46, 21), (62, 16)], 's1')
    p.line([(46, 22), (62, 17)], 's5')
    p.fill(box(58, 11, 61, 13), 'r1')
    p.px(59, 12, 'r3')
    p.fill(box(48, 26, 54, 34), 's1')  # its mount
    p.line([(48, 26), (48, 34)], 's3')

    # --- Chest: skin under a wide net ---------------------------------------------------------
    chest = poly([(8, 46), (22, 36), (44, 36), (50, 64), (6, 64)])
    p.grad(chest, SKIN, (46, 60), (10, 38))
    for x, y in chest:
        if (x + y) % 5 == 0 or (x - y) % 5 == 0:
            p.px(x, y, 'n0')
    # A chest plate hung from the collar, rimmed in gold.
    plate = poly([(17, 44), (33, 42), (36, 56), (21, 60)])
    p.bevel(plate, STEEL, 2, flat=0.5)
    p.rim(plate, 'y2', ((0, -1),))
    p.rim(plate, 'y0', ((0, 1),))
    p.pxs([(26, 49), (27, 49), (26, 50), (27, 50)], 'r1')
    p.px(26, 49, 'r3')
    p.edge(plate, 'o')
    # Neck in shadow.
    p.fill(poly([(22, 30), (38, 28), (40, 40), (24, 40)]), 'n0')

    # --- Dreadlocks down the back of the head and over the near shoulder ----------------------
    for x0, y0, x1, y1, x2, y2 in ((35, 8, 43, 24, 41, 46), (37, 10, 46, 26, 46, 44), (33, 9, 39, 26, 37, 50),
                                   (38, 13, 49, 24, 51, 40), (31, 12, 35, 30, 33, 52), (36, 14, 42, 30, 43, 52)):
        path = [(x0, y0), (x1, y1), (x2, y2)]
        p.fill(stroke(path, 4), 'o')
        p.fill(stroke(path, 3), 'd0')
        p.fill(stroke([(x0 - 1, y0 + 4), (x1 - 1, y1), (x2 - 1, y2)], 1), 's3')
        for t in range(3, 40, 6):  # the bands along each lock
            f = t / 40
            a, b = (path[0], path[1]) if f < 0.5 else (path[1], path[2])
            g = f * 2 if f < 0.5 else f * 2 - 1
            p.px(round(a[0] + (b[0] - a[0]) * g) - 1, round(a[1] + (b[1] - a[1]) * g), 's5')
        p.fill(box(x2 - 1, y2 - 1, x2 + 1, y2), 'y1')  # a gold ring at its end
        p.px(x2 - 1, y2 - 1, 'y3')

    # --- The near pauldron: three lames, each lip catching the light ---------------------------
    for i, (cx, cy, rx, ry) in enumerate(((53, 60, 20, 16), (52, 52, 17, 12), (51, 45, 13, 8))):
        lame = ell(cx - rx, cy - ry, cx + rx, cy + ry)
        p.fill({(x + dx, y + dy) for x, y in lame for dx, dy in ((0, -1), (-1, 0))}, 'o')
        p.ball(lame, cx - 3, cy + 2, rx + 2, ry + 3, STEEL, LIGHT, 0.12)
        p.shift(lame, -2)
        p.rim(lame, 's4', ((0, -1),))
        p.rim(lame, 's6', ((0, -1),), ell(cx - rx, cy - ry, cx - 2, cy + ry))
    p.line([(40, 58), (46, 52), (54, 50)], 's1')
    p.rows(53, 55, '''
.yy.
yhhy
yhry
.yy.
''', {'y': 'y1', 'h': 'y3', 'r': 'r2'})

    # --- The mask, three quarters left: a high smooth brow, a flat face, a jutting mouth plate -
    head = poly([(17, 8), (21, 4), (27, 2), (33, 3), (38, 7), (41, 14), (41, 22), (38, 29), (33, 34), (26, 36), (19, 34), (16, 28), (14, 20), (14, 13)])
    p.fill({(x + dx, y + dy) for x, y in head for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}, 'o')
    p.ball(head, 26, 18, 15, 18, BONE, LIGHT, 0.2)
    p.shift(poly([(31, 4), (41, 8), (41, 32), (34, 34), (33, 20)]), -1)  # the side turned away
    p.shift(poly([(14, 21), (30, 22), (34, 30), (27, 36), (16, 30)]), -1)  # under the brow's overhang
    p.rim(head, 'b6', ((0, -1), (-1, 0)), box(15, 0, 30, 11))
    # The brow: a heavy ridge over the eyes, gold along it; the crest down the forehead.
    p.line([(14, 15), (21, 17), (33, 14), (39, 16)], 'b1', 2)
    p.line([(14, 14), (21, 16), (33, 13), (39, 15)], 'y1')
    p.line([(15, 14), (21, 16), (27, 14)], 'y2')
    p.line([(22, 4), (21, 15)], 'y0', 3)
    p.line([(22, 4), (21, 15)], 'y2')
    p.pxs([(22, 5), (22, 6), (22, 7)], 'y3')
    # Eye slits, slanted down to the nose, burning red.
    p.fill(poly([(15, 18), (19, 20), (19, 22), (15, 20)]), 'o')
    p.fill(poly([(23, 20), (32, 17), (33, 19), (24, 23)]), 'o')
    p.pxs([(16, 19), (17, 20), (18, 21)], 'r2')
    p.px(17, 20, 'r3')
    p.line([(25, 21), (31, 18)], 'r2')
    p.pxs([(27, 20), (28, 19)], 'r3')
    p.pxs([(24, 21), (32, 18), (26, 22), (30, 20)], 'r1')
    # The nose ridge and the mouth plate's vents.
    p.line([(21, 18), (20, 25)], 'b5')
    p.line([(22, 18), (21, 25)], 'b2')
    p.line([(16, 26), (21, 27), (33, 25)], 'b1')
    for x in (18, 21, 24, 27, 30):
        p.line([(x, 28), (x, 32)], 'b0')
        p.line([(x - 1, 28), (x - 1, 32)], 'b4' if x < 26 else 'b3')
    p.line([(20, 34), (27, 35)], 'b1')
    p.pxs([(35, 20), (36, 21), (36, 24), (37, 18)], 'b1')  # bolts and scars on its cheek
    p.line([(34, 8), (37, 12)], 'b1')

    # --- The forearm raised by the face, the twin blades out past the brow ---------------------
    arm = poly([(0, 64), (0, 46), (11, 44), (15, 50), (12, 64)])
    p.grad(arm, SKIN, (14, 60), (0, 46))
    for x, y in arm:
        if (x + y) % 5 == 0 or (x - y) % 5 == 0:
            p.px(x, y, 'n0')
    gaunt = poly([(0, 38), (12, 36), (14, 48), (0, 51)])
    p.bevel(gaunt, STEEL, 2, flat=0.5)
    p.rim(gaunt, 'y2', ((0, -1),))
    p.rim(gaunt, 'y0', ((0, 1),))
    p.line([(1, 44), (13, 42)], 's1')
    p.pxs([(6, 40), (7, 40)], 'r2')
    p.edge(gaunt, 'o', ((1, 0), (0, 1), (0, -1)))
    for x0, tip in ((1, 5), (7, 9)):
        blade = poly([(x0, 37), (x0 + 4, 36), (x0 + 4, 14), (x0 + 2, tip), (x0, 16)])
        p.fill({(x + dx, y) for x, y in blade for dx in (-1, 1)} | {(x0 + 2, tip - 1)}, 'o')
        p.fill(blade, 'w1')
        p.line([(x0, 36), (x0, 16), (x0 + 2, tip)], 'w3')
        p.line([(x0 + 1, 36), (x0 + 1, 15)], 'w2')
        p.line([(x0 + 4, 36), (x0 + 4, 14)], 'w0')
        for y in range(18, 36, 5):  # serrations on the back edge
            p.px(x0 + 4, y, 'o')
    return p
