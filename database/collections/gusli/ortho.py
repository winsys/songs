# -*- coding: utf-8 -*-
"""Pre-1918 Russian orthography -> modern, word by word, checked against a word-form lexicon.

Rules (1918 reform): ѣ->е, і->и, ѳ->ф, ѵ->и, word-final ъ dropped; adjective
endings -аго/-яго -> -ого/-его, plural -ыя/-ія -> -ые/-ие; ея/нея -> её/неё,
онѣ/однѣ -> они/одни; prefixes без-/воз-/из-/раз-/роз-/низ-/вз-/через-/чрез-
before a voiceless consonant -> бес-/вос-/ис-/рас-/рос-/нис-/вс-/черес-/чрес-.
Text level: hyphenated particles (Когда-бъ, Молю-же, Въ досугѣ-ль) are written
apart, prepositional -ньи after в/о/при/на -> -нье, a few spellings modern
dictionaries changed later (итти -> идти, прійду -> приду, Аллилуія -> Аллилуйя).

Lexicon: russian.txt (cp1251, one word form per line, ~1.5M forms) from
https://raw.githubusercontent.com/danakt/russian-words/master/russian.txt —
put it next to this file (git-ignored) or point GUSLI_LEXICON at it.
"""
import os, re

LEX = None


def lexicon():
    global LEX
    if LEX is None:
        p = os.environ.get('GUSLI_LEXICON') or os.path.join(
            os.path.dirname(os.path.abspath(__file__)), 'russian.txt')
        with open(p, 'rb') as f:
            words = f.read().decode('cp1251').split()
        LEX = set(w.lower().replace('ё', 'е') for w in words)
    return LEX


# Whole-word replacements (lowercase keys, pre-reform spelling).
WORDS = {
    'ея': 'её', 'нея': 'неё', 'онѣ': 'они', 'однѣ': 'одни', 'однѣхъ': 'одних',
    'однѣмъ': 'одним', 'однѣми': 'одними',
}

# Modern spellings that changed after 1918 (lowercase, applied after basic()).
LATER = {
    'итти': 'идти', 'аллилуия': 'аллилуйя', 'лучем': 'лучом', 'зрачек': 'зрачок',
    'исповедывать': 'исповедовать', 'разростается': 'разрастается', 'прийду': 'приду',
    'прийдешь': 'придешь', 'прийдет': 'придет', 'прийдем': 'придем', 'прийдете': 'придете',
    'прийдут': 'придут', 'прийди': 'приди', 'прийдите': 'придите', 'прийдя': 'придя',
    'пойдти': 'пойти', 'найдти': 'найти', 'войдти': 'войти', 'выдти': 'выйти',
    'придти': 'прийти', 'прийдти': 'прийти', 'сойдти': 'сойти', 'взойдти': 'взойти', 'обойдти': 'обойти',
}

VOICELESS = 'кпстфхцчшщ'
PREFIX_PAIRS = [('через', 'черес'), ('чрез', 'чрес'), ('обез', 'обес'), ('без', 'бес'), ('воз', 'вос'),
                ('из', 'ис'), ('раз', 'рас'), ('роз', 'рос'), ('низ', 'нис'), ('вз', 'вс')]
PRE_PREFIX = ('', 'не', 'по', 'пре', 'со', 'до', 'на', 'во', 'пере', 'при')


def basic(w):
    w = (w.replace('ѣ', 'е').replace('Ѣ', 'Е').replace('і', 'и').replace('І', 'И')
          .replace('ѳ', 'ф').replace('Ѳ', 'Ф').replace('ѵ', 'и').replace('Ѵ', 'И'))
    if len(w) > 1 and w[-1] in 'ъЪ':
        w = w[:-1]
    return w


def recase(src, x):
    if src.isupper() and len(src) > 1:
        return x.upper()
    if src[:1].isupper():
        return x[:1].upper() + x[1:]
    return x


def prefix_alt(lb):
    for pre in PRE_PREFIX:
        for a, bb in PREFIX_PAIRS:
            p = pre + a
            if lb.startswith(p) and len(lb) > len(p) + 1 and lb[len(p)] in VOICELESS:
                return pre + bb + lb[len(p):]
    return None


def word_modern(w, log=None):
    lw = w.lower()
    if lw in WORDS:
        return recase(w, WORDS[lw])
    b = basic(w)
    lb = b.lower()
    if lb in LATER:
        return recase(w, LATER[lb])
    lex = lexicon()
    # adjective endings
    alt = None
    if len(lb) >= 4 and lb.endswith('ыя') and lb != 'выя':
        alt = lb[:-2] + 'ые'
    elif len(lb) >= 5 and lb.endswith('яго'):
        alt = lb[:-3] + 'его'
    elif len(lb) >= 5 and lb.endswith('аго') and lb[-4] not in 'аеиоуыэюя':
        alt = lb[:-3] + ('его' if lb[-4] in 'жшчщ' else 'ого')
    if alt and not (lb in lex and alt not in lex):
        lb = alt
    if lb.endswith('ия') and lb not in lex and (lb[:-2] + 'ие') in lex:
        lb = lb[:-2] + 'ие'
    pa = prefix_alt(lb)
    if pa and (pa in lex or lb not in lex):
        lb = pa
    out = recase(w, lb) if lb != b.lower() else b
    if log is not None and out.lower() not in lex and re.search('[а-я]', out.lower()):
        log.append(out)
    return out


TOKEN = re.compile(r"[A-Za-zА-Яа-яЁёѢѣІіѲѳѴѵ]+[ЪъЬь]?")
PARTICLE = re.compile(r"(?<=[А-Яа-яЁё])-(ж|же|б|бы|ль|ли)(?![А-Яа-яЁё-])")
PREP_IE = re.compile(r"(?i)(\b(?:в|во|о|об|обо|при|на)\s+)([А-Яа-яЁё]+)ьи\b")


def modernize(text, log=None):
    t = TOKEN.sub(lambda m: word_modern(m.group(0), log), text)
    t = PARTICLE.sub(r' \1', t)

    def ie(m):
        stem = m.group(2)
        lex = lexicon()
        if (stem + 'ье').lower() in lex or stem.lower().endswith(('ен', 'ан', 'рд', 'ть')):
            return m.group(1) + stem + 'ье'
        return m.group(0)
    t = PREP_IE.sub(ie, t)
    return t
