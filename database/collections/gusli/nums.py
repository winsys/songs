# -*- coding: utf-8 -*-
"""NUM of a song in the collection «Гусли»: Latin "g" + the printed number, zero-padded
because the song list sorts NUM as a string — no Cyrillic in NUM, so it is typed the same
on any keyboard: 15 -> "g015"; №84 is two songs, printed «84 а» / «84 б» -> "g084a" /
"g084b". Songs added on request that are not in the book continue the numbering after
the last number of the 1927 notes (510): "g511" …"""

LETTERS = {'': '', 'а': 'a', 'б': 'b'}


def gusli_num(n, letter=''):
    return 'g%03d%s' % (n, LETTERS[letter])
