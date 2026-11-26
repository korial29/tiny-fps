from art import Pic

PAL = {
    'o': '#05060c',
    'ch': '#9cc0ff', 'cm': '#4664b4', 'c': '#22306a', 'cd': '#121a40', 'cx': '#080b1e',  # chitin
    'gh': '#eef0f6', 'g': '#a8aebe', 'gd': '#5e6474',  # teeth
    'm': '#2a0614', 'mm': '#6a1a30', 'mh': '#a03048',  # mouth, gums
    'sl': '#c8ffe0', 'sd': '#6ac8a0',  # drool
}


def draw():
    p = Pic(PAL)
    # Two back spines over the far shoulder.
    p.poly([(4, 44), (10, 42), (2, 24)], 'cd')
    p.line([(6, 43), (2, 25)], 'cm')
    p.poly([(12, 40), (18, 38), (14, 20)], 'cd')
    p.line([(14, 39), (14, 21)], 'cm')
    # Hunched shoulders, the rib cage between them.
    p.poly([(0, 48), (14, 40), (40, 40), (56, 46), (63, 56), (63, 64), (0, 64)], 'c')
    p.poly([(34, 41), (40, 40), (56, 46), (63, 56), (63, 64), (38, 64)], 'cd')
    p.ell(0, 40, 20, 58, 'c')
    p.ell(2, 41, 12, 49, 'cm')
    p.pxs([(4, 42), (5, 42), (3, 43)], 'ch')
    p.ell(46, 44, 63, 60, 'cd')
    p.ell(48, 45, 58, 52, 'c')
    for i, y in enumerate(range(50, 64, 4)):
        p.line([(18, y), (26, y - 2), (34, y)], 'cm')
        p.line([(19, y + 1), (26, y - 1)], 'ch' if i == 0 else 'cm')
        p.line([(34, y), (42, y - 2), (50, y + 1)], 'cx')
    p.line([(34, 44), (34, 64)], 'cx', 2)
    # The neck, ribbed, rising forward to the head.
    p.poly([(16, 42), (26, 26), (40, 28), (36, 44)], 'cd')
    for k in range(5):
        y = 30 + k * 3
        p.line([(22 - k, y + 2), (38 - k, y)], 'cx')
        p.line([(22 - k, y + 1), (30 - k, y)], 'cm')
    # The long smooth dome, swept back to the upper left.
    p.poly([(0, 4), (8, 1), (24, 2), (38, 8), (48, 16), (52, 24), (44, 26), (30, 22), (14, 14), (2, 10)], 'c')
    p.poly([(2, 4), (8, 2), (24, 3), (36, 8), (24, 7), (10, 6)], 'cm')
    p.poly([(8, 3), (20, 3), (28, 6), (16, 5)], 'ch')
    p.pxs([(30, 8), (31, 8), (33, 9)], 'ch')
    p.line([(4, 9), (16, 13), (30, 19), (44, 24)], 'cx')
    p.line([(6, 8), (18, 11), (30, 16)], 'cd')
    # The face's lower edge and the lips drawn back.
    p.poly([(30, 20), (48, 18), (56, 26), (54, 30), (36, 30), (28, 26)], 'cd')
    p.poly([(36, 22), (50, 20), (54, 26), (38, 25)], 'c')
    p.line([(38, 23), (50, 21)], 'cm')
    # The mouth bared: the lips drawn back off two rows of teeth, the inner jaw thrust out.
    p.poly([(38, 27), (52, 26), (55, 31), (51, 37), (40, 37), (36, 32)], 'm')
    p.poly([(38, 27), (52, 26), (52, 28), (38, 29)], 'mh')
    p.rows(38, 28, '''
ghghghghghghgh
.g.g.g.g.g.g.g
.d...g...g....
''', {'g': 'g', 'h': 'gh', 'd': 'gd'})
    p.rows(39, 33, '''
...g...g...g.
.g.g.g.g.g.g.
hghghghghghg.
''', {'g': 'g', 'h': 'gh', 'd': 'gd'})
    p.poly([(48, 31), (55, 30), (56, 33), (49, 34)], 'mm')
    p.rows(55, 30, '''
hg
gg
dg
''', {'g': 'g', 'h': 'gh', 'd': 'gd'})
    # Lower jaw.
    p.poly([(38, 37), (52, 37), (50, 41), (40, 42)], 'c')
    p.line([(40, 41), (50, 40)], 'cx')
    p.line([(39, 38), (50, 38)], 'cm')
    # Drool.
    p.pxs([(44, 42), (44, 43), (45, 44), (45, 45)], 'sl')
    p.px(45, 46, 'sd')
    p.pxs([(51, 38), (51, 39)], 'sd')
    p.outline('o')
    return p
