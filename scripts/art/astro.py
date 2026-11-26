from art import Pic

PAL = {
    'o': '#0a0c12',
    'wh': '#ffffff', 'w': '#dfe4ec', 'wd': '#a8b0be', 'wx': '#6a7282',  # white armour
    'r': '#ff3d4f', 'rd': '#b0202e',  # stripes
    'v': '#101a2c', 'vm': '#203a62', 'vh': '#4a8ae0', 'vy': '#ffb04a', 'vs': '#ffffff',  # visor
    'kh': '#4a4e5a', 'k': '#2a2c34', 'kd': '#16171c',  # suit joints, gun
    'g': '#5cf0ff', 'gb': '#d8ffff',  # gun glow
    'l': '#ffd24a',  # helmet lamp
}


def draw():
    p = Pic(PAL)
    # Chest, the near shoulder high and forward.
    p.poly([(6, 42), (20, 34), (44, 34), (58, 42), (60, 64), (4, 64)], 'w')
    p.poly([(36, 35), (44, 34), (58, 42), (60, 64), (40, 64)], 'wd')
    p.poly([(8, 43), (20, 36), (30, 36), (24, 48), (10, 50)], 'wh')
    p.rect(26, 44, 38, 56, 'k')  # chest unit
    p.rect(27, 45, 37, 50, 'kh')
    p.pxs([(29, 47), (31, 47)], 'r')
    p.pxs([(33, 47), (35, 47)], 'g')
    p.line([(6, 58), (58, 58)], 'r', 2)
    p.line([(6, 60), (58, 60)], 'rd')
    # Far shoulder and near shoulder.
    p.ell(44, 32, 62, 48, 'wd')
    p.ell(45, 32, 59, 44, 'w')
    p.ell(0, 30, 24, 52, 'wd')
    p.ell(1, 30, 22, 48, 'w')
    p.ell(3, 31, 15, 40, 'wh')
    p.line([(2, 44), (22, 42)], 'r', 2)
    # Neck ring.
    p.poly([(20, 30), (46, 30), (44, 37), (22, 37)], 'k')
    p.poly([(20, 30), (46, 30), (45, 32), (21, 32)], 'kh')
    # The helmet, a dome with its visor turned three quarters right.
    p.ell(16, 0, 48, 34, 'w')
    p.ell(17, 0, 38, 20, 'wh')
    p.poly([(38, 2), (48, 12), (48, 26), (40, 34), (32, 33)], 'wd')
    p.line([(18, 20), (24, 30)], 'wx')
    # The red stripe over its crown.
    p.line([(28, 0), (24, 14)], 'r', 2)
    p.line([(29, 0), (26, 12)], 'rd')
    # The lamp on its side.
    p.rect(17, 12, 21, 17, 'wx')
    p.rect(18, 13, 20, 16, 'l')
    # The visor: dark, a sunset caught in it, a glint.
    p.poly([(26, 10), (46, 9), (48, 16), (46, 26), (30, 27), (25, 18)], 'v')
    p.poly([(27, 18), (47, 15), (46, 22), (30, 24)], 'vm')
    p.poly([(28, 22), (46, 20), (46, 24), (30, 26)], 'vy')
    p.poly([(28, 11), (36, 10), (30, 16)], 'vh')
    p.pxs([(30, 12), (31, 12), (30, 13), (40, 11), (41, 11)], 'vs')
    p.line([(25, 9), (47, 8)], 'wx')
    p.line([(26, 28), (46, 27)], 'wx')
    # The far arm raised, a pistol held up beside the helmet, its emitter glowing.
    p.poly([(46, 44), (52, 34), (61, 36), (60, 48)], 'wd')
    p.poly([(47, 43), (52, 35), (57, 36), (53, 44)], 'w')
    p.poly([(49, 10), (56, 9), (57, 27), (51, 28)], 'k')
    p.poly([(49, 10), (51, 10), (53, 28), (51, 28)], 'kh')
    p.line([(53, 11), (55, 26)], 'g')
    p.rect(50, 6, 55, 9, 'kd')
    p.pxs([(51, 5), (52, 4), (53, 4), (54, 5), (52, 3)], 'gb')
    p.pxs([(52, 5), (53, 5)], 'g')
    p.poly([(51, 27), (57, 26), (59, 33), (53, 34)], 'kd')
    # The glove round its grip.
    p.ell(47, 27, 59, 38, 'wd')
    p.ell(48, 27, 55, 33, 'w')
    p.pxs([(48, 34), (50, 36), (53, 37), (56, 36)], 'wx')
    p.outline('o')
    return p
