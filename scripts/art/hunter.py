from art import Pic

PAL = {
    'o': '#0a0806',
    'mh': '#f4f0e0', 'm': '#c8c4b8', 'md': '#8a8678', 'mx': '#4c4a42',  # mask metal
    'yh': '#ffe08a', 'y': '#d4a440', 'yd': '#8a6420',  # gold trim
    'v': '#2a0a06', 'vr': '#ff4a2a',  # eye slits, their glow
    'dh': '#6a5640', 'd': '#3a2e22', 'dd': '#211a12',  # dreadlocks
    'nh': '#7a7a5e', 'n': '#4c4c3a', 'nd': '#26261c',  # mesh over the skin
    'ah': '#e2e6e2', 'a': '#9aa09c', 'ad': '#5c625e',  # armour plates
    'bh': '#ffffff', 'b': '#c8d4e0', 'bd': '#6c7c8c',  # wrist blades
    'ch': '#6a7a5a', 'c': '#3e4a34', 'cd': '#222a1c',  # shoulder cannon
    'l': '#ff2a1a',  # laser
}


def draw():
    p = Pic(PAL)
    # Chest under the mesh: a diagonal net over the skin.
    p.poly([(6, 42), (20, 34), (46, 34), (60, 40), (62, 64), (4, 64)], 'n')
    p.poly([(40, 35), (46, 34), (60, 40), (62, 64), (44, 64)], 'nd')
    for y in range(34, 64):
        for x in range(4, 63):
            if p.im.getpixel((x, y))[3] and ((x + y) % 4 == 0 or (x - y) % 4 == 0):
                p.px(x, y, 'nd' if x > 42 else 'nh' if (x + y) % 8 == 0 and x < 26 else 'nd')
    # A gold-rimmed chest plate on the near side.
    p.poly([(22, 40), (36, 40), (38, 52), (24, 54)], 'a')
    p.poly([(22, 40), (36, 40), (36, 42), (22, 42)], 'ah')
    p.line([(24, 54), (38, 52)], 'yd')
    p.line([(22, 40), (24, 54)], 'y')
    # The far shoulder's plate and the cannon on it, its laser out to the right.
    p.poly([(44, 32), (60, 36), (63, 48), (50, 46), (42, 38)], 'ad')
    p.poly([(45, 32), (59, 36), (61, 44), (50, 42)], 'a')
    p.poly([(47, 33), (56, 35), (52, 37)], 'ah')
    p.poly([(46, 22), (60, 18), (63, 24), (50, 30)], 'c')
    p.poly([(46, 22), (60, 18), (61, 20), (47, 24)], 'ch')
    p.poly([(48, 28), (62, 22), (63, 24), (50, 30)], 'cd')
    p.rect(45, 26, 50, 33, 'cd')
    p.px(63, 20, 'l')
    p.px(62, 21, 'l')
    # Dreadlocks: behind the head down to the shoulders, a few over the near one.
    for x0, x1, y1 in ((22, 16, 48), (25, 20, 46), (42, 44, 40), (44, 47, 36), (40, 40, 42)):
        p.line([(x0, 12), (x1, y1)], 'dd', 3)
        p.line([(x0, 12), (x1, y1)], 'd', 2)
        for t in range(2, 30, 5):
            p.px(round(x0 + (x1 - x0) * t / 30), round(12 + (y1 - 12) * t / 30), 'dh')
        p.px(x1, y1, 'y')  # gold ring at the end
    # The mask, three quarters right: a high brow, a flat face, a jutting chin.
    p.poly([(24, 4), (38, 2), (46, 8), (48, 20), (44, 30), (36, 34), (26, 30), (22, 18)], 'm')
    p.poly([(24, 4), (34, 3), (31, 12), (26, 22), (23, 16)], 'mh')
    p.poly([(40, 6), (46, 8), (48, 20), (44, 30), (38, 32), (41, 18)], 'md')
    p.poly([(26, 26), (36, 30), (36, 34), (28, 31)], 'md')
    # Gold crest down the middle and round the brow.
    p.line([(34, 2), (34, 12)], 'y', 2)
    p.line([(34, 2), (34, 10)], 'yh')
    p.line([(23, 10), (34, 13), (47, 11)], 'yd')
    p.line([(23, 9), (34, 12), (47, 10)], 'y')
    # Slanted eye slits glowing red.
    p.poly([(26, 15), (33, 17), (32, 19), (26, 17)], 'v')
    p.poly([(36, 17), (45, 14), (45, 16), (37, 19)], 'v')
    p.pxs([(28, 16), (29, 17), (39, 17), (40, 16), (41, 16)], 'vr')
    # Vents of the mouth plate.
    p.line([(27, 22), (44, 21)], 'md')
    for x in (29, 32, 35, 38, 41):
        p.line([(x, 23), (x, 27)], 'mx')
    # The forearm raised beside the helmet, the twin blades out past its brow.
    p.poly([(0, 64), (6, 44), (16, 36), (20, 42), (12, 64)], 'ad')
    p.poly([(1, 62), (6, 45), (14, 38), (10, 54)], 'a')
    p.poly([(6, 42), (15, 36), (19, 40), (9, 47)], 'ah')
    # The gauntlet turned to face us: its back flat and wide, gold, a red stud.
    p.poly([(3, 31), (19, 29), (20, 39), (5, 41)], 'y')
    p.line([(3, 31), (19, 29)], 'yh')
    p.line([(5, 41), (20, 39)], 'yd')
    p.line([(4, 36), (19, 34)], 'yd')
    p.rect(10, 33, 12, 35, 'v')
    p.px(11, 34, 'l')
    # The twin blades seen flat: wide, side by side, a ridge down each, the edges serrated.
    for x0, lean in ((5, -1), (13, 1)):
        tip = (x0 + 2 + lean * 2, 1)
        p.poly([(x0, 30), (x0 + 5, 30), (x0 + 5 + lean, 10), tip, (x0 + lean, 10)], 'b')
        p.poly([(x0, 30), (x0 + 2, 30), (x0 + 2 + lean, 10), tip, (x0 + lean, 10)], 'bh')
        p.poly([(x0 + 4, 30), (x0 + 5, 30), (x0 + 5 + lean, 10), tip], 'bd')
        p.line([(x0 + 2, 29), tip], 'bh')
        for y in range(12, 29, 4):
            p.px(x0 - 1 + (lean if y < 20 else 0), y, 'bd')
            p.px(x0 + 6 + (lean if y < 20 else 0), y + 2, 'bd')
    # The fist under the gauntlet.
    p.ell(12, 36, 22, 46, 'n')
    p.ell(13, 36, 19, 41, 'nh')
    p.pxs([(14, 44), (17, 45), (20, 43)], 'nd')
    p.outline('o')
    return p
