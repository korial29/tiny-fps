from art import Pic

PAL = {
    'o': '#140c10',  # outline
    'sh': '#f2c9a4', 's': '#d9a27c', 'sd': '#b0745a', 'sx': '#7c4a3c',  # skin
    'm': '#3a0d12', 'mt': '#f4ece0',  # mouth, teeth
    'e': '#ffffff', 'ei': '#2b1a14',  # eye white, iris
    'rh': '#ff8a8e', 'r': '#e5404f', 'rd': '#a8212f', 'rx': '#5e1019',  # armour
    'kh': '#4a4a58', 'k': '#2a2a34', 'kd': '#17171e',  # black under-suit, gloves
    'gh': '#b8c0cc', 'g': '#76808e', 'gd': '#434a56', 'gx': '#262a33',  # rifle
    'y': '#ffd08a', 'yo': '#ff8a2a',  # glow
}


def draw():
    p = Pic(PAL)
    # Under-suit and neck.
    p.poly([(26, 26), (40, 26), (42, 36), (24, 36)], 'kd')
    p.poly([(28, 25), (39, 25), (38, 32), (29, 32)], 'sd')
    p.poly([(28, 25), (33, 25), (33, 31), (29, 31)], 's')
    # Chest plate.
    p.poly([(8, 40), (20, 33), (44, 33), (58, 40), (60, 64), (4, 64)], 'r')
    p.poly([(36, 34), (44, 33), (58, 40), (60, 64), (40, 64)], 'rd')
    p.poly([(10, 41), (21, 35), (30, 35), (28, 44), (12, 48)], 'rh')
    p.line([(32, 36), (32, 64)], 'rx')
    p.line([(8, 52), (58, 52)], 'rx')
    p.line([(9, 53), (57, 53)], 'rd')
    # Collar ring.
    p.poly([(22, 32), (44, 32), (42, 37), (24, 37)], 'kh')
    p.poly([(24, 34), (42, 34), (41, 37), (25, 37)], 'k')
    # Shoulder pads: the near one big, the far one behind.
    p.ell(44, 31, 62, 47, 'rd')
    p.ell(46, 32, 60, 44, 'r')
    p.ell(0, 30, 24, 52, 'rd')
    p.ell(1, 30, 22, 48, 'r')
    p.ell(3, 31, 15, 40, 'rh')
    p.line([(2, 45), (22, 43)], 'rx')
    # Head: shaved, turned three quarters to the right.
    p.ell(22, 5, 42, 28, 's')
    p.ell(23, 5, 36, 20, 'sh')
    p.poly([(36, 7), (42, 12), (43, 22), (40, 28), (34, 29)], 's')
    p.poly([(24, 19), (28, 26), (33, 29), (27, 29), (23, 24)], 'sd')  # jaw shade, far side
    p.ell(23, 14, 27, 21, 'sd')  # ear
    p.ell(24, 15, 26, 19, 'sx')
    p.pxs([(25, 16), (25, 17)], 's')
    # Stubble on the scalp.
    p.poly([(24, 6), (36, 5), (40, 9), (30, 9), (24, 12)], 'sd')
    p.pxs([(27, 7), (31, 6), (34, 7), (29, 8), (36, 8)], 'sx')
    # Brows down in a frown, eyes narrowed.
    p.line([(30, 13), (35, 15)], 'sx', 1)
    p.line([(37, 15), (41, 13)], 'sx', 1)
    p.pxs([(31, 13), (32, 14), (38, 14)], 'o')
    p.rows(31, 15, '''
.oeeio..
..ooo...
''', {'o': 'o', 'e': 'e', 'i': 'ei'})
    p.rows(38, 15, '''
oeio
.oo.
''', {'o': 'o', 'e': 'e', 'i': 'ei'})
    # Nose.
    p.pxs([(39, 16), (40, 17), (40, 18), (41, 19)], 'sd')
    p.pxs([(39, 19), (40, 20)], 'sx')
    # Cheek creases of a yell.
    p.pxs([(33, 19), (32, 20), (32, 21)], 'sd')
    # The open, yelling mouth.
    p.rows(33, 21, '''
.ttttto.
mttttttm
mmmmmmmm
mmmmmmm.
.mmmmm..
..mtt...
''', {'t': 'mt', 'm': 'm', 'o': 'o'})
    p.pxs([(34, 27), (35, 27), (36, 27)], 'sd')
    # Chin.
    p.pxs([(34, 28), (35, 28), (36, 28), (37, 28)], 'sd')
    # The far arm raised, the pistol held up beside the head, its muzzle to the sky.
    p.poly([(46, 44), (52, 34), (60, 36), (58, 48)], 'k')
    p.poly([(47, 43), (52, 35), (56, 36), (52, 44)], 'kh')
    # Pistol: the slide tilted a little back, the grip down in the fist.
    p.poly([(47, 9), (53, 8), (55, 26), (49, 27)], 'g')
    p.poly([(47, 9), (49, 9), (51, 27), (49, 27)], 'gh')
    p.poly([(52, 8), (53, 8), (55, 26), (54, 26)], 'gd')
    p.line([(50, 10), (52, 25)], 'yo')
    p.pxs([(50, 11), (50, 12)], 'y')
    p.rect(48, 6, 52, 8, 'gx')  # muzzle
    p.pxs([(49, 5), (50, 4), (51, 5)], 'y')  # a wisp of its glow
    p.poly([(49, 26), (55, 25), (57, 33), (51, 34)], 'gd')  # grip
    p.pxs([(53, 18), (54, 18), (53, 21), (54, 21)], 'gx')  # slide serrations
    # The gloved fist round the grip.
    p.ell(46, 27, 58, 38, 'k')
    p.ell(47, 27, 54, 33, 'kh')
    p.pxs([(47, 34), (49, 36), (52, 37), (55, 36)], 'kd')
    p.outline('o')
    return p
