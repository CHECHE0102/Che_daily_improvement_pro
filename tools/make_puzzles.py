# BinBin 噴泉花園解謎彩蛋 — puzzle bank generator + verifier.
# Writes games/puzzles.json. Every puzzle is checked here: the answer must be the ONLY answer
# (rule-library / brute-force / dictionary checks per type). Run: python3 gen.py
import json, random, itertools, re, sys
from fractions import Fraction

RNG = random.Random(20261126)
import os
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
WORDS = set()
for f in ('games/words.txt', 'games/words-extra.txt'):
    for line in open(REPO + f, encoding='utf8'):
        w = line.strip().lower()
        if re.fullmatch('[a-z]+', w): WORDS.add(w)
DICT = json.load(open(REPO + 'assets/dict/zh.json', encoding='utf8'))['w']

# friendly English answer words (all in the BinBin dictionary, A1-B1, no Y/Z for Polybius)
POOL = """apple bread cheese honey lemon pizza salad sugar water juice coffee dinner lunch
river ocean island forest garden flower castle bridge market church museum school beach cloud
storm rain snow summer winter autumn spring music dance song story book letter paper pencil
friend family mother father sister brother uncle baby horse sheep rabbit tiger whale eagle
mouse snake shark spider camera guitar piano rocket planet moon star sun light dream smile
happy brave quiet clever gentle bright green purple orange silver golden magic dragon knight
queen king crown sword shield money ticket travel train plane ship hotel road city village
heart hand head foot nose mouth teeth hair window door house kitchen table chair clock phone
lamp candle gift party holiday ireland dublin harbour hill lake field farm tea milk cake
pirate treasure secret puzzle riddle answer""".split()
POOL = [w for w in dict.fromkeys(POOL) if w in DICT or w in ('dublin', 'ireland')]
POOL_NOYZ = [w for w in POOL if not set(w) & set('yz')]

def norm(s): return re.sub('[^A-Z0-9]', '', s.upper())

OUT = []
USED_WORDS = set()
def take_word(pool, minl=4, maxl=7, cond=lambda w: True):
    c = [w for w in pool if minl <= len(w) <= maxl and w not in USED_WORDS and cond(w)]
    w = RNG.choice(c); USED_WORDS.add(w); return w

def add(bucket, t, q, a, h, extra=None):
    p = {'b': bucket, 't': t, 'q': q, 'a': str(a)}
    if h is not None: p['h'] = h
    if extra: p.update(extra)
    OUT.append(p)

# ---------------- B1: hidden operator ----------------
def cat(*xs):
    if any(x < 0 for x in xs): return None
    return int(''.join(str(x) for x in xs))
OPS = {
    'cat(a-b,a+b)': (lambda a, b: cat(a - b, a + b), lambda a, b: f'{a}−{b}={a-b} · {a}+{b}={a+b}'),
    'cat(a+b,a-b)': (lambda a, b: cat(a + b, a - b), lambda a, b: f'{a}+{b}={a+b} · {a}−{b}={a-b}'),
    'cat(a*b,a+b)': (lambda a, b: cat(a * b, a + b), lambda a, b: f'{a}×{b}={a*b} · {a}+{b}={a+b}'),
    'cat(a+b,a*b)': (lambda a, b: cat(a + b, a * b), lambda a, b: f'{a}+{b}={a+b} · {a}×{b}={a*b}'),
    'cat(a*b,a-b)': (lambda a, b: cat(a * b, a - b), lambda a, b: f'{a}×{b}={a*b} · {a}−{b}={a-b}'),
    'cat(a-b,a*b)': (lambda a, b: cat(a - b, a * b), lambda a, b: f'{a}−{b}={a-b} · {a}×{b}={a*b}'),
    'cat(a*a,b*b)': (lambda a, b: cat(a * a, b * b), lambda a, b: f'{a}×{a}={a*a} · {b}×{b}={b*b}'),
    'cat(b,a)': (lambda a, b: cat(b, a), lambda a, b: f'{a} {b} → {b} {a}'),
    'cat(b,a,a+b)': (lambda a, b: cat(b, a, a + b), lambda a, b: f'{b} · {a} · {a}+{b}={a+b}'),
    'a*b+a': (lambda a, b: a * b + a, lambda a, b: f'{a}×{b}+{a}={a*b+a}'),
    'a*b-b': (lambda a, b: a * b - b, lambda a, b: f'{a}×{b}−{b}={a*b-b}'),
    'a*a+b': (lambda a, b: a * a + b, lambda a, b: f'{a}×{a}+{b}={a*a+b}'),
    'a*b+a+b': (lambda a, b: a * b + a + b, lambda a, b: f'{a}×{b}+{a}+{b}={a*b+a+b}'),
    '(a+b)*(a-b)': (lambda a, b: (a + b) * (a - b), lambda a, b: f'({a}+{b})×({a}−{b})={(a+b)*(a-b)}'),
    '(a+b)*2': (lambda a, b: (a + b) * 2, lambda a, b: f'({a}+{b})×2={(a+b)*2}'),
    'a*b*2': (lambda a, b: a * b * 2, lambda a, b: f'{a}×{b}×2={a*b*2}'),
    'a*b-a-b': (lambda a, b: a * b - a - b, lambda a, b: f'{a}×{b}−{a}−{b}={a*b-a-b}'),
    'a+b+a': (lambda a, b: a + a + b, lambda a, b: f'{a}+{a}+{b}={2*a+b}'),
    'a*a-b*b': (lambda a, b: a * a - b * b, lambda a, b: f'{a}×{a}−{b}×{b}={a*a-b*b}'),
    'cat(a+b,a+b)': (lambda a, b: cat(a + b, a + b), lambda a, b: f'{a}+{b}={a+b} → {a+b}{a+b}'),
    'a*10+b+a': (lambda a, b: cat(a, b) + a if b < 10 else None, lambda a, b: f'{a}{b}+{a}={cat(a,b)+a}'),
    '(a-b)*(a-b)': (lambda a, b: (a - b) ** 2, lambda a, b: f'({a}−{b})×({a}−{b})={(a-b)**2}'),
    'a*(a+b)': (lambda a, b: a * (a + b), lambda a, b: f'{a}×({a}+{b})={a*(a+b)}'),
    'b*(a+b)': (lambda a, b: b * (a + b), lambda a, b: f'{b}×({a}+{b})={b*(a+b)}'),
}
CHECK = dict(OPS); CHECK.update({'a+b': (lambda a, b: a + b, None), 'a-b': (lambda a, b: a - b, None), 'a*b': (lambda a, b: a * b, None), 'a+b+1': (lambda a, b: a + b + 1, None), 'cat(a,b)': (lambda a, b: cat(a, b), None), 'cat(a+b,a-b)r': (lambda a, b: cat(a - b, a + b), None), 'a*b+1': (lambda a, b: a * b + 1, None), 'a*b-1': (lambda a, b: a * b - 1, None), 'cat(a*b)': (lambda a, b: a * b, None), 'a*a': (lambda a, b: a * a, None), 'cat(a,a+b)': (lambda a, b: cat(a, a + b), None), 'cat(a+b,b)': (lambda a, b: cat(a + b, b), None)})
def op_ok(a, b, f):
    try: v = f(a, b)
    except Exception: return None
    return v
SYMS = ['#', '★', '◆', '♣', '@', '▲', '♥', '¤']
op_rules = list(OPS)
RNG.shuffle(op_rules)
made = 0
ri = 0
OPSEEN = set()
while made < 18:
    rule = op_rules[ri % len(op_rules)]; ri += 1
    f, hint = OPS[rule]
    for _ in range(4000):
        pairs = set()
        while len(pairs) < 4:
            a = RNG.randint(2, 9); b = RNG.randint(1, a - 1)
            pairs.add((a, b))
        pairs = list(pairs)
        ex, ask = pairs[:3], pairs[3]
        vals = [op_ok(a, b, f) for a, b in pairs]
        if any(v is None or v < 0 for v in vals): continue
        # uniqueness: every rule that fits all examples must give the same answer
        answers = set()
        for r2, (f2, _) in CHECK.items():
            if all(op_ok(a, b, f2) == op_ok(a, b, f) for a, b in ex):
                answers.add(op_ok(a, b, f2) if False else op_ok(ask[0], ask[1], f2))
        if answers != {vals[3]} or vals[3] in OPSEEN: continue
        OPSEEN.add(vals[3])
        # also the examples must not be explainable by plain + - × (too easy / misleading)
        add(1, 'op', {'s': SYMS[made % len(SYMS)], 'r': [[a, b, op_ok(a, b, f)] for a, b in ex], 'k': list(ask)}, vals[3], hint(*ex[0]), {'rule': rule})
        made += 1
        break

# ---------------- B1: number / letter sequences ----------------
def fits_all(seq):
    """every rule family that fits the shown terms -> its next term"""
    n = len(seq); preds = set()
    # polynomial degree 0..2 via finite differences (needs >= deg+2 terms to be checked)
    for deg in range(0, 3):
        rows = [list(seq)]
        for _ in range(deg): rows.append([rows[-1][i + 1] - rows[-1][i] for i in range(len(rows[-1]) - 1)])
        if len(set(rows[-1])) == 1 and len(rows[-1]) >= 2:
            nxt = rows[-1][-1]
            for r in reversed(rows[:-1]): nxt = r[-1] + nxt
            preds.add(nxt)
    # x(n) = k*x(n-1) + c with rational k, c
    if n >= 3 and seq[1] != seq[0]:
        k = Fraction(seq[2] - seq[1], seq[1] - seq[0]); c = seq[1] - k * seq[0]
        if all(seq[i] == k * seq[i - 1] + c for i in range(1, n)):
            v = k * seq[-1] + c
            if v.denominator == 1: preds.add(int(v))
    # x(n) = x(n-1) + x(n-2)
    if n >= 4 and all(seq[i] == seq[i - 1] + seq[i - 2] for i in range(2, n)): preds.add(seq[-1] + seq[-2])
    # two interleaved arithmetic sequences
    if n >= 6:
        ev, od = seq[0::2], seq[1::2]
        if len(set(ev[i + 1] - ev[i] for i in range(len(ev) - 1))) == 1 and len(set(od[i + 1] - od[i] for i in range(len(od) - 1))) == 1:
            nxt = (ev if n % 2 == 0 else od)
            preds.add(nxt[-1] + (nxt[1] - nxt[0]))
    # differences double each time  (d, 2d, 4d ...)
    d = [seq[i + 1] - seq[i] for i in range(n - 1)]
    if d[0] and all(d[i + 1] == 2 * d[i] for i in range(len(d) - 1)): preds.add(seq[-1] + 2 * d[-1])
    # differences +1,+2,+3 style is covered by degree 2; alternating-sign differences
    if len(d) >= 4 and len(set(d[0::2])) == 1 and len(set(d[1::2])) == 1 and d[0] != d[1]:
        preds.add(seq[-1] + d[len(d) % 2])
    return preds

SEQ_GENS = [
    ('arith', lambda: (lambda a, d: [a + d * i for i in range(7)])(RNG.randint(2, 20), RNG.randint(3, 9))),
    ('geo', lambda: (lambda a, r: [a * r ** i for i in range(7)])(RNG.randint(1, 3), 2)),
    ('diff+', lambda: (lambda a, d, k: [a + d * i + k * i * (i - 1) // 2 for i in range(7)])(RNG.randint(1, 9), RNG.randint(1, 4), RNG.randint(1, 3))),
    ('fib', lambda: (lambda a, b: [a, b] + [0] * 5)(RNG.randint(1, 4), RNG.randint(2, 6))),
    ('lin', lambda: (lambda a, k, c: [a] + [0] * 6)(RNG.randint(1, 4), 2, 1)),
    ('alt', lambda: (lambda a, b, d, e: [x for p in zip([a + d * i for i in range(4)], [b + e * i for i in range(4)]) for x in p][:7])(RNG.randint(1, 9), RNG.randint(20, 40), RNG.randint(2, 5), -RNG.randint(1, 4))),
    ('sq', lambda: (lambda o, c: [(i + o) ** 2 + c for i in range(7)])(RNG.randint(1, 4), RNG.randint(0, 3))),
    ('upDown', lambda: (lambda a, u, dn: [a + (i // 2) * (u - dn) + (u if i % 2 else 0) for i in range(7)])(RNG.randint(5, 15), RNG.randint(5, 9), RNG.randint(1, 4))),
]
def fill(name, s):
    if name == 'fib':
        for i in range(2, 7): s[i] = s[i - 1] + s[i - 2]
    if name == 'lin':
        for i in range(1, 7): s[i] = s[i - 1] * 2 + 1
    return s
SEQ_HINT = {'arith': '+d', 'geo': '×2', 'diff+': '+1 +2 +3…', 'fib': 'a+b', 'lin': '×2+1', 'alt': '1·3·5 | 2·4·6', 'sq': 'n×n', 'upDown': '+ − + −'}
order = ['arith', 'geo', 'diff+', 'fib', 'lin', 'alt', 'sq', 'upDown']
made = 0; tries = 0
while made < 8:
    name = order[made % len(order)]; tries += 1
    s = fill(name, dict(SEQ_GENS)[name]())
    shown, ans = s[:6], s[6]
    preds = fits_all(shown)
    if preds != {ans}:
        continue
    # build a hint showing the gaps
    gaps = ' '.join(('+' if shown[i + 1] - shown[i] >= 0 else '−') + str(abs(shown[i + 1] - shown[i])) for i in range(5))
    hint = gaps if name not in ('fib', 'lin', 'sq', 'alt', 'geo') else {
        'fib': f'{shown[0]}+{shown[1]}={shown[2]}', 'lin': f'{shown[0]}×2+1={shown[1]}', 'sq': f'{shown[0]}, {shown[1]}, {shown[2]} … ×?',
        'alt': f'{shown[0]}, {shown[2]}, {shown[4]} … | {shown[1]}, {shown[3]}, {shown[5]} …', 'geo': f'{shown[0]}×2={shown[1]}'}[name]
    if name == 'sq':
        c = shown[0] - round(shown[0] ** .5) ** 2
        o = round((shown[0] - c) ** .5)
        hint = f'{o}×{o}' + (f'+{c}' if c else '') + f'={shown[0]} · {o+1}×{o+1}' + (f'+{c}' if c else '') + f'={shown[1]}'
    add(1, 'seq', {'s': shown}, ans, hint, {'rule': name})
    made += 1

# letter-cross puzzles (style of the 4-letter grid cards): letters step by k (wrapping A..Z); the last card has "?"
A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
made = 0
for k, start in [(5, 'B'), (6, 'C'), (4, 'D'), (9, 'A')]:
    s = A.index(start); cards = []
    n_cards = 4
    seqL = [A[(s + i * k) % 26] for i in range(4 * n_cards)]
    # card i holds letters i, i+n, i+2n, i+3n? -> keep simple: each card = 4 consecutive steps
    for c in range(n_cards): cards.append(seqL[c * 4:(c + 1) * 4])
    ans = cards[-1][-1]; cards[-1][-1] = '?'
    # uniqueness: as numbers (mod 26) the steps inside the visible letters are all equal to k -> next is forced
    flat = [A.index(x) for x in seqL[:-1]]
    steps = {(flat[i + 1] - flat[i]) % 26 for i in range(len(flat) - 1)}
    assert steps == {k}, steps
    add(1, 'cross', {'c': cards}, ans, f'{seqL[0]}→{seqL[1]} (+{k})')
    made += 1

# ---------------- B2: picture equations (unknown values) ----------------
FRUITS = ['🍎', '🍌', '🍇', '🍓', '🍋', '🍒', '🥕', '🍩', '🧁', '🍉', '🥝', '🍑', '🍄', '⭐', '🔔', '🎈']
def ev(expr, env):
    return eval(expr, {}, env)
EQSEEN = set()
def eq_puzzle(nsym):
    syms = RNG.sample(FRUITS, nsym)
    names = 'abcd'[:nsym]
    for _ in range(500):
        vals = {n: RNG.randint(1, 12) for n in names}
        # equations: first is n copies of one symbol, then mixes
        eqs = []
        first = RNG.choice(names); kcopy = RNG.choice([2, 3])
        eqs.append('+'.join([first] * kcopy))
        others = [n for n in names if n != first]
        prev = first
        for n in others:
            form = RNG.choice(['{p}+{n}+{n}', '{p}+{n}', '{n}-{p}' if vals[n] > vals[prev] else '{p}-{n}', '{p}*{n}', '{n}+{n}-{p}'])
            eqs.append(form.format(p=prev, n=n)); prev = n
        if any(ev(e, vals) <= 0 for e in eqs): continue
        q = RNG.choice(['{x}+{y}*{z}', '{x}*{y}-{z}', '{x}+{y}+{z}', '{x}*{y}+{z}', '{x}-{y}+{z}*{z}'] if nsym >= 3 else ['{x}*{y}', '{x}+{y}*{y}', '{x}*{x}-{y}'])
        pick = names[::-1] if nsym >= 3 else names
        qx = q.format(x=pick[0], y=pick[1], z=pick[2] if nsym >= 3 else pick[0])
        ans = ev(qx, vals)
        if ans < 0 or ans in EQSEEN: continue
        rhs = [ev(e, vals) for e in eqs]
        # brute force: every assignment 0..30 that satisfies the equations must give the same answer
        sols = set(); L = lambda e: eval('lambda ' + ','.join(names) + ': ' + e)
        fe = [L(e) for e in eqs]; fq = L(qx)
        for combo in itertools.product(range(0, 31 if nsym < 4 else 25), repeat=nsym):
            if all(f(*combo) == r for f, r in zip(fe, rhs)): sols.add(fq(*combo))
        if sols != {ans}: continue
        tr = lambda e: ''.join(syms[names.index(ch)] if ch in names else {'*': '×', '-': '−'}.get(ch, ch) for ch in e)
        val0 = vals[first]; EQSEEN.add(ans)
        return {'e': [[tr(e), r] for e, r in zip(eqs, rhs)], 'k': tr(qx)}, ans, f'{syms[names.index(first)]}={val0}'
    raise Exception('eq fail')
for i in range(16):
    q, a, h = eq_puzzle(3 if i < 11 else 4 if i < 14 else 2)
    add(2, 'eq', q, a, h)

# legs: count the legs of each animal (full-body emoji only)
LEGS = {'🐓': 2, '🦆': 2, '🐧': 2, '🦩': 2, '🐕': 4, '🐈': 4, '🐎': 4, '🐄': 4, '🐖': 4, '🐘': 4, '🦒': 4, '🐜': 6, '🐝': 6, '🐞': 6, '🕷️': 8, '🐍': 0, '🐟': 0, '🐌': 0}
FORMS = ['{a}×{b}+{c}×{d}', '{a}+{b}×{c}', '{a}×{b}−{c}', '{a}×{b}×{c}', '{a}+{b}+{c}+{d}', '{a}×{b}+{c}', '({a}+{b})×{c}', '{a}×{b}−{c}×{d}']
made = 0; seen = set()
while made < 8:
    f = FORMS[made % len(FORMS)]
    pool = [k for k, v in LEGS.items() if v > 0]
    if made in (3, 6): pool = list(LEGS)  # a 0-leg animal appears in some
    ks = RNG.sample(pool, f.count('{'))
    if made in (3, 6) and not any(LEGS[k] == 0 for k in ks): continue
    expr = f.format(**{c: str(LEGS[k]) for c, k in zip('abcd', ks)})
    val = eval(expr.replace('×', '*').replace('−', '-'))
    if val < 0 or val in seen: continue
    seen.add(val)
    tok = f.format(**{c: k for c, k in zip('abcd', ks)})
    add(2, 'legs', {'x': tok, 'm': 'legs'}, val, f'{ks[0]}={LEGS[ks[0]]}')
    made += 1
# sides: count the sides of each shape (drawn as SVG polygons: p3..p8 = triangle..octagon, c = circle 0)
SHAPES = {'p3': 3, 'p4': 4, 'p5': 5, 'p6': 6, 'p8': 8}
made = 0
while made < 6:
    f = FORMS[(made + 2) % len(FORMS)]
    ks = [RNG.choice(list(SHAPES)) for _ in range(f.count('{'))]
    if len(set(ks)) < 2: continue
    expr = f.format(**{c: str(SHAPES[k]) for c, k in zip('abcd', ks)})
    val = eval(expr.replace('×', '*').replace('−', '-'))
    if val < 0 or val in seen: continue
    seen.add(val)
    tok = f.format(**{c: '[' + k + ']' for c, k in zip('abcd', ks)})
    add(2, 'legs', {'x': tok, 'm': 'sides'}, val, f'[{ks[0]}]={SHAPES[ks[0]]}')
    made += 1

# ---------------- B3: hexagon neighbours ----------------
# axial coordinates (q, r); shown on an "odd-q" like layout by the renderer from axial directly
HEXD = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]
def hex_cluster(n):
    cells = {(0, 0)}
    while len(cells) < n:
        c = RNG.choice(sorted(cells)); d = RNG.choice(HEXD)
        nc = (c[0] + d[0], c[1] + d[1])
        if abs(nc[0]) <= 3 and abs(nc[1]) <= 3 and abs(nc[0] + nc[1]) <= 3: cells.add(nc)
    return cells
made = 0; seenA = set()
while made < 15:
    n = RNG.randint(9, 13)
    if made % 3 == 2:
        c1 = hex_cluster(n - 4); c2 = {(q + 5, r - 2) for q, r in hex_cluster(4)}
        cells = c1 | c2
    else:
        cells = hex_cluster(n)
    cnt = {c: sum((c[0] + d[0], c[1] + d[1]) in cells for d in HEXD) for c in cells}
    qs = RNG.sample(sorted(cells), 4)
    ans = ''.join(str(cnt[c]) for c in qs)
    if ans in seenA or len(set(ans)) < 2: continue
    seenA.add(ans)
    out = []
    for c in sorted(cells, key=lambda c: (c[1], c[0])):
        out.append([c[0], c[1], ('?' + str(qs.index(c))) if c in qs else cnt[c]])
    # verify: recount from what is shown
    S2 = {(a, b) for a, b, _ in out}
    for a, b, v in out:
        k = sum((a + d[0], b + d[1]) in S2 for d in HEXD)
        if isinstance(v, int): assert v == k
        else: assert ans[int(v[1])] == str(k)
    add(3, 'hex', {'c': out}, ans, None)
    made += 1

# ---------------- B3: seven-segment arrows ----------------
#   segments: 0 top, 1 top-right, 2 bottom-right, 3 bottom, 4 bottom-left, 5 top-left, 6 middle
DIG = {0: {0, 1, 2, 3, 4, 5}, 1: {1, 2}, 2: {0, 1, 6, 4, 3}, 3: {0, 1, 6, 2, 3}, 4: {5, 6, 1, 2}, 5: {0, 5, 6, 2, 3},
       6: {0, 5, 6, 4, 3, 2}, 7: {0, 1, 2}, 8: {0, 1, 2, 3, 4, 5, 6}, 9: {0, 1, 2, 3, 5, 6}}
REV = {frozenset(v): k for k, v in DIG.items()}
assert len(REV) == 10
made = 0; seenS = set()
while made < 15:
    nd = 4 if made >= 5 else 3
    digits = [RNG.randint(0, 9) for _ in range(nd)]
    if len(set(digits)) < nd: continue
    key = ''.join(map(str, digits))
    if key in seenS: continue
    frames = [dict() for _ in range(4)]
    ok = True
    for ci, d in enumerate(digits):
        for seg in DIG[d]:
            opts = [f for f in range(4) if seg not in frames[f]]
            if not opts: ok = False; break
            frames[RNG.choice(opts)][seg] = ci
        if not ok: break
    if not ok: continue
    # each colour must appear in at least 2 frames (otherwise a digit is just sitting there)
    if any(len({fi for fi, fr in enumerate(frames) if ci in fr.values()}) < 2 for ci in range(nd)): continue
    # verify: collecting each colour gives exactly one digit, and that digit is the answer
    for ci, d in enumerate(digits):
        segs = frozenset(s for fr in frames for s, c in fr.items() if c == ci)
        assert REV.get(segs) == d
    seenS.add(key)
    add(3, 'seg', {'f': [sorted([s, c] for s, c in fr.items()) for fr in frames], 'n': nd}, key, None)
    made += 1

# ---------------- B4: pigpen + Polybius ----------------
for i in range(15):
    w = take_word(POOL, 4, 7)
    add(4, 'pig', {'w': w.upper()}, w.upper(), None, {'w': w})
POLY = 'ABCDEFGHIJKLMNOPQRSTUVWX'  # Y/Z share the last cell, so no answers with Y or Z
for i in range(15):
    w = take_word(POOL_NOYZ, 4, 7)
    code = [f'{POLY.index(ch)//5+1}{POLY.index(ch)%5+1}' for ch in w.upper()]
    # verify decode
    assert ''.join(POLY[(int(c[0]) - 1) * 5 + int(c[1]) - 1] for c in code) == w.upper()
    add(4, 'poly', {'c': code, 'o': 'rc'}, w.upper(), None, {'w': w})

# ---------------- B5: Atbash, Caesar, A1Z26, phone keypad, anagram ----------------
for i in range(8):
    w = take_word(POOL, 4, 7)
    c = ''.join(A[25 - A.index(ch)] for ch in w.upper())
    assert ''.join(A[25 - A.index(ch)] for ch in c) == w.upper() and c != w.upper()
    add(5, 'atb', {'c': c}, w.upper(), None, {'w': w})
for i in range(8):
    w = take_word(POOL, 4, 7); k = [3, 1, 2, 4, 5, 3, 2, 6][i]
    c = ''.join(A[(A.index(ch) + k) % 26] for ch in w.upper())
    add(5, 'cae', {'c': c, 'k': k}, w.upper(), None, {'w': w})
for i in range(4):
    w = take_word(POOL, 4, 7)
    add(5, 'num', {'c': [A.index(ch) + 1 for ch in w.upper()]}, w.upper(), None, {'w': w})
KEYS = {2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ'}
for i in range(4):
    w = take_word(POOL, 4, 6)
    code = []
    for ch in w.upper():
        for k, v in KEYS.items():
            if ch in v: code.append(str(k) * (v.index(ch) + 1))
    assert ''.join(KEYS[int(c[0])][len(c) - 1] for c in code) == w.upper()
    add(5, 'key', {'c': code}, w.upper(), None, {'w': w})
made = 0
anaPool = [w for w in POOL if 5 <= len(w) <= 7 and w not in USED_WORDS]
RNG.shuffle(anaPool)
for w in anaPool:
    if made >= 6: break
    sig = sorted(w)
    others = [x for x in WORDS if len(x) == len(w) and x != w and sorted(x) == sig]
    if others: continue  # not unique
    letters = list(w.upper())
    for _ in range(50):
        RNG.shuffle(letters)
        if ''.join(letters) != w.upper(): break
    USED_WORDS.add(w)
    add(5, 'ana', {'l': ''.join(letters)}, w.upper(), None, {'w': w})
    made += 1

# ---------------- checks + schedule ----------------
from collections import Counter
cnt = Counter(p['b'] for p in OUT)
print('buckets', dict(cnt), 'total', len(OUT), Counter(p['t'] for p in OUT))
assert all(v == 30 for v in cnt.values()) and len(cnt) == 5, cnt
answers = Counter((p['t'], p['a']) for p in OUT)
assert max(answers.values()) == 1, [k for k, v in answers.items() if v > 1]
for p in OUT:
    assert norm(p['a']) == p['a'], p
    if 'w' in p: assert p['w'] in DICT or p['w'] in ('dublin', 'ireland'), p['w']
# order inside each bucket: shuffled so the same kind does not come on two days in a row too often
final = []
for b in range(1, 6):
    items = [p for p in OUT if p['b'] == b]
    RNG.shuffle(items)
    # spread types: greedy pick a type different from the previous day's when possible
    out = []
    while items:
        prev = out[-1]['t'] if out else None
        j = next((i for i, p in enumerate(items) if p['t'] != prev), 0)
        out.append(items.pop(j))
    final += out
for i, p in enumerate(final):
    p['id'] = f"p{p['b']}{(i % 30) + 1:02d}"
    p.pop('rule', None); p.pop('w', None)
json.dump({'v': 1, 'days': 30, 'p': final}, open(REPO + 'games/puzzles.json', 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print('written', len(final))
