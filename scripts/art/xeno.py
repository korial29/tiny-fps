from art import ALL, Pic, box, ell, poly, stroke

PAL = {
    'o': '#03040a', 'v1': '#070a16', 'v2': '#0b1022',  # the dark behind it
    'c0': '#060814', 'c1': '#0c1228', 'c2': '#152046', 'c3': '#22336c', 'c4': '#364e98', 'c5': '#5a7cc8', 'c6': '#9cbcf2', 'c7': '#e0f0ff',  # chitin
    't0': '#3c4254', 't1': '#8e96a8', 't2': '#e6eaf2',  # teeth
    'm0': '#14030c', 'm1': '#420e20', 'm2': '#7a2038',  # mouth, gums
    'g0': '#3c9c78', 'g1': '#b4ffdc',  # drool
}
CH = 'c0 c1 c2 c3 c4 c5 c6 c7'
TOP = (-0.12, -0.78, 0.62)  # a light overhead, a little towards us


def draw():
    """Faces us squarely, so only the left half is drawn and the right mirrors it."""
    p = Pic(PAL, [CH, 't0 t1 t2', 'm0 m1 m2'])
    p.fill(ALL, 'o')
    p.fill(ell(4, -6, 59, 60), 'v1')
    p.fill(ell(12, -2, 51, 44), 'v2')

    def form(m, cx, cy, rx, ry, amb=0.1, light=TOP, ramp=CH):
        p.fill({(x + dx, y + dy) for x, y in m for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}, 'o')
        p.ball(m, cx, cy, rx, ry, ramp, light, amb)

    # The back tubes rising behind the shoulders.
    for pts, cx in (([(3, 40), (4, 22), (7, 12), (10, 11), (11, 18), (10, 40)], 7), ([(11, 38), (12, 16), (15, 6), (18, 5), (19, 12), (18, 38)], 15)):
        m = poly(pts)
        form(m, cx, 6, 5, 40, 0.22)
        for y in range(8, 40, 3):
            p.shift(m & box(0, y, 63, y), -2)
    # Shoulders: a great ribbed boss each side.
    sh = ell(-4, 30, 24, 54)
    form(sh, 9, 46, 15, 17, 0.06, TOP, CH.split()[:6])
    for i in range(4):  # the segments across it
        arc = stroke([(0 + i * 5, 54), (2 + i * 5, 40), (6 + i * 5, 32)], 1) & sh
        p.shift(arc, -2)
        p.shift({(x + 1, y) for x, y in arc} & sh, 1)
    # The claws at the tile's foot.
    p.fill(box(0, 52, 13, 63), 'o')
    for i, (x0, x1, y1) in enumerate(((2, 0, 63), (6, 5, 64), (10, 10, 64), (13, 15, 62))):
        f = stroke([(x0, 54), (x1, y1)], 3)
        p.fill({(x + dx, y) for x, y in f for dx in (-1, 1)}, 'o')
        p.fill(f, 'c3')
        p.line([(x0 - 1, 54), (x1 - 1, y1)], 'c5')
        p.pxs([(x0, 55), (x0, 59)], 'c6')  # knuckles
        p.line([(x0 - 1, 57), (x0 + 1, 57)], 'c1')
    # Rib cage: the ribs sweep down and out from the sternum.
    torso = poly([(14, 40), (31, 36), (31, 64), (12, 64)])
    p.fill(torso, 'c0')
    for i in range(7):
        y = 39 + i * 4
        rib = stroke([(31, y), (24, y + 1), (18, y + 4), (15, y + 8)], 2) & torso
        p.fill(rib, 'c2')
        top = stroke([(31, y - 1), (24, y), (18, y + 3), (15, y + 7)], 1) & torso
        p.fill(top, 'c4' if i else 'c5')
        p.fill(stroke([(31, y - 1), (27, y - 1)], 1) & torso, 'c5' if i else 'c6')
    for y in range(38, 64, 4):  # sternum: a column of knuckled plates
        p.fill(box(29, y, 31, y + 2), 'c3')
        p.fill(box(30, y, 31, y), 'c6')
        p.fill(box(29, y + 3, 31, y + 3), 'o')
    # Neck: cords in the dark under the jaw.
    p.fill(poly([(21, 30), (31, 30), (31, 40), (18, 42)]), 'c0')
    for x in (22, 25, 28):
        p.line([(x, 32), (x - 1, 40)], 'c2')
        p.line([(x + 1, 33), (x, 39)], 'c1')
    # The head: a long smooth dome over a narrow jaw.
    head = poly([(31, 0), (27, 0), (24, 2), (22, 7), (21, 15), (21, 23), (23, 30), (26, 35), (31, 36)])
    form(head, 31.5, 10, 11, 24, 0.08, (-0.3, -0.68, 0.66), CH.split()[:7])
    p.rim(head, 'c7', ((0, -1), (-1, 0)), box(23, 0, 28, 4))
    # The crest's ridges across its top, the furrow down the middle.
    for y in range(3, 15, 2):
        p.shift(box(26, y, 29, y) & head, -2)
        p.shift(box(27, y + 1, 30, y + 1) & head, 1)
    p.shift(box(31, 2, 31, 20), -1)
    # The grooves where eyes would be: a long hollow curving down to the snout.
    for path in ([(29, 14), (26, 17), (24, 24)],):
        p.shift(stroke(path, 2) & head, -3)
        p.shift({(x - 1, y) for x, y in stroke(path, 1)} & head, 2)
    p.shift(poly([(20, 18), (23, 22), (23, 31), (20, 26)]) & head, -2)  # the cheek falls away
    # Lips drawn back off the teeth.
    p.fill(poly([(23, 25), (31, 24), (31, 34), (25, 33), (23, 29)]), 'm0')
    p.line([(23, 25), (26, 24), (31, 24)], 'c5')
    p.line([(23, 26), (31, 25)], 'm2')
    p.rows(23, 26, '''
.atatatat
.btbtbtat
..b.b.btb
.........
....b.b.t
..bbtbtat
.btatatat
''', {'t': 't2', 'a': 't1', 'b': 't0'})
    p.fill(box(28, 29, 31, 30), 'm1')  # the inner jaw, back in the dark
    p.pxs([(30, 29), (31, 29)], 't1')
    p.line([(23, 33), (31, 34)], 'c4')
    p.line([(25, 35), (31, 36)], 'c2')
    p.mirror()
    # Drool, off-centre so the two halves differ.
    p.pxs([(27, 33), (27, 34), (27, 35), (27, 36), (27, 37)], 'g1')
    p.pxs([(27, 38), (27, 39)], 'g0')
    p.pxs([(36, 33), (36, 34), (36, 35)], 'g1')
    p.fill(box(25, 3, 26, 9), 'c6')  # one long glint down the dome's left
    p.fill(box(25, 4, 25, 7), 'c7')
    p.px(36, 36, 'g0')
    return p
