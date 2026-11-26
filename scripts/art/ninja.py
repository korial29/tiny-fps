from art import Pic

PAL = {
    'o': '#0c0a10',
    'hh': '#4a4858', 'h': '#2a2834', 'hd': '#18161f',  # hood
    'mh': '#a8a6ae', 'm': '#7a7882', 'md': '#4c4a54',  # mask
    'sh': '#e8b896', 's': '#c98d6c', 'sd': '#8e5a46',  # skin round the eyes
    'e': '#f6f2ea', 'ei': '#1a1210',
    'rh': '#ff7c86', 'r': '#e0394c', 'rd': '#9c1e30', 'rx': '#5a0c1a',  # scale armour
    'ph': '#c6c8d0', 'p': '#8c8e98', 'pd': '#55575f',  # shoulder plates
    'bh': '#ffffff', 'b': '#9ef0ff', 'bm': '#3cc8ff', 'bd': '#1270c0',  # blade glow
    'th': '#3c3a46', 't': '#22202a',  # hilt wrap
    'gd': '#b08a3a', 'g': '#e0b860',  # guard
}


def draw():
    p = Pic(PAL)
    # Chest of red scales, the near shoulder plate, the far one.
    p.poly([(6, 42), (20, 34), (44, 34), (58, 42), (60, 64), (4, 64)], 'r')
    p.poly([(38, 35), (44, 34), (58, 42), (60, 64), (40, 64)], 'rd')
    for y in range(38, 64, 3):
        off = (y // 3) % 2 * 2
        for x in range(6 + off, 60, 4):
            p.px(x, y, 'rx' if x > 38 else 'rd')
            p.px(x + 1, y - 1, 'rh' if x < 30 else 'r')
    p.poly([(44, 33), (60, 38), (63, 50), (52, 48), (44, 40)], 'pd')
    p.poly([(45, 33), (59, 38), (61, 46), (52, 44), (45, 38)], 'p')
    p.poly([(2, 34), (22, 31), (26, 40), (14, 50), (0, 48)], 'pd')
    p.poly([(2, 34), (22, 31), (24, 38), (12, 45), (0, 44)], 'p')
    p.poly([(3, 35), (20, 32), (21, 35), (6, 39)], 'ph')
    p.line([(1, 41), (22, 36)], 'pd')
    # Hood and the neck in it.
    p.poly([(22, 26), (42, 26), (46, 36), (20, 36)], 'hd')
    p.ell(20, 3, 44, 30, 'h')
    p.ell(21, 3, 36, 18, 'hh')
    p.poly([(36, 4), (44, 12), (45, 24), (40, 31), (34, 30)], 'hd')
    # The eye slit, skin showing round the eyes, turned three quarters right.
    p.poly([(28, 13), (43, 12), (43, 18), (28, 18)], 's')
    p.poly([(28, 13), (43, 12), (43, 14), (28, 15)], 'sh')
    p.poly([(28, 17), (43, 17), (43, 18), (28, 18)], 'sd')
    # Narrow, angry eyes under a frown.
    p.line([(30, 13), (35, 15)], 'o')
    p.line([(37, 15), (42, 13)], 'o')
    p.rows(31, 15, '''
oeio.
.ooo.
''', {'o': 'o', 'e': 'e', 'i': 'ei'})
    p.rows(38, 15, '''
oeio
.oo.
''', {'o': 'o', 'e': 'e', 'i': 'ei'})
    # The grey mask over the nose and mouth, the nose's ridge.
    p.poly([(27, 18), (44, 18), (44, 24), (38, 29), (30, 29), (26, 24)], 'm')
    p.poly([(27, 18), (36, 18), (35, 22), (28, 24)], 'mh')
    p.poly([(38, 18), (44, 18), (44, 24), (38, 29)], 'md')
    p.line([(40, 18), (41, 22)], 'mh')
    for x in range(29, 43, 3):
        p.px(x, 26, 'md')
    # The katana raised before the face, its edge glowing blue: from the hands low left up past the head.
    p.line([(14, 60), (52, 2)], 'bd', 4)
    p.line([(14, 60), (52, 2)], 'bm', 3)
    p.line([(15, 59), (52, 2)], 'b', 1)
    p.line([(16, 59), (53, 3)], 'bh', 1)
    # Guard and grip, the hands round it.
    p.poly([(9, 54), (22, 50), (23, 53), (10, 57)], 'gd')
    p.poly([(9, 54), (22, 50), (22, 51), (9, 55)], 'g')
    p.line([(13, 64), (16, 55)], 't', 4)
    p.ell(8, 54, 20, 64, 'hd')
    p.ell(9, 55, 16, 60, 'h')
    p.pxs([(10, 62), (13, 63), (16, 62)], 'o')
    p.outline('o')
    return p
