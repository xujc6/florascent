# -*- coding: utf-8 -*-
"""
把 petals.js 里的 buildPetalSprite() 原样搬到 Python，用来离线验证
「wiki 卡片 -> 去底透明贴图」对新花瓣是否work，并拼一张预览图。
用法: python tools/_petal_sprite.py [petal1 petal2 ...]
"""
import os, sys, json, collections
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAN = json.load(open(os.path.join(ROOT, 'manifest.json'), encoding='utf-8'))

RING = True


def load_img(name, rarity):
    p = os.path.join(ROOT, 'assets', '%s_(%s).webp' % (name, rarity))
    im = Image.open(p).convert('RGBA')
    return im


def build_sprite(im):
    W0, H0 = im.size
    px = im.load()
    d = bytearray(W0 * H0 * 4)
    i = 0
    for y in range(H0):
        for x in range(W0):
            r, g, b, a = px[x, y]
            d[i] = r; d[i+1] = g; d[i+2] = b; d[i+3] = a
            i += 4

    # 1. ring test
    ringTotal = 0; ringOpaque = 0
    for x in range(W0):
        for y in (0, H0 - 1):
            ringTotal += 1
            if d[(y * W0 + x) * 4 + 3] > 128: ringOpaque += 1
    for y in range(H0):
        for x in (0, W0 - 1):
            ringTotal += 1
            if d[(y * W0 + x) * 4 + 3] > 128: ringOpaque += 1
    if ringOpaque / max(1, ringTotal) < 0.35:
        return crop(d, W0, H0, H0, None)

    # 2. background palette (top 2 dominant)
    hist = collections.Counter()
    for y in range(0, H0, 2):
        base = y * W0 * 4
        for x in range(0, W0, 2):
            i = base + x * 4
            if d[i+3] > 200:
                hist[(d[i] >> 3, d[i+1] >> 3, d[i+2] >> 3)] += 1
    pal = []
    for c, _n in hist.most_common(2):
        pal.append((c[0] << 3, c[1] << 3, c[2] << 3))
    if not pal:
        return crop(d, W0, H0, H0, None)

    TOL = 18
    TOL_SOFT = 44

    def is_bg(i):
        for c in pal:
            if abs(d[i] - c[0]) <= TOL and abs(d[i+1] - c[1]) <= TOL and abs(d[i+2] - c[2]) <= TOL:
                return True
        return False

    def is_soft(i):
        for c in pal:
            if abs(d[i] - c[0]) <= TOL_SOFT and abs(d[i+1] - c[1]) <= TOL_SOFT and abs(d[i+2] - c[2]) <= TOL_SOFT:
                return True
        return False

    # flood from border
    seen = bytearray(W0 * H0)
    stack = []
    for x in range(W0):
        stack.append(x); stack.append((H0 - 1) * W0 + x)
    for y in range(H0):
        stack.append(y * W0); stack.append(y * W0 + W0 - 1)
    while stack:
        p = stack.pop()
        if seen[p]: continue
        seen[p] = 1
        i = p * 4
        if d[i+3] != 0:
            if is_bg(i):
                d[i] = d[i+1] = d[i+2] = d[i+3] = 0
            elif not is_soft(i):
                continue
        else:
            d[i] = d[i+1] = d[i+2] = d[i+3] = 0
        x = p % W0
        if x > 0 and not seen[p-1]: stack.append(p - 1)
        if x < W0 - 1 and not seen[p+1]: stack.append(p + 1)
        if p >= W0 and not seen[p-W0]: stack.append(p - W0)
        if p < W0 * (H0 - 1) and not seen[p+W0]: stack.append(p + W0)

    # 3. soften fringe x2
    for _pass in range(2):
        kills = []
        for y in range(H0):
            for x in range(W0):
                p = y * W0 + x; i = p * 4
                if d[i+3] == 0: continue
                near = False
                if x > 0 and d[i-1] == 0: near = True
                elif x < W0 - 1 and d[i+7] == 0: near = True
                elif y > 0 and d[i-W0*4+3] == 0: near = True
                elif y < H0 - 1 and d[i+W0*4+3] == 0: near = True
                if not near: continue
                for c in pal:
                    if abs(d[i]-c[0]) <= 42 and abs(d[i+1]-c[1]) <= 42 and abs(d[i+2]-c[2]) <= 42:
                        kills.append(i); break
        if not kills: break
        for i in kills:
            d[i] = d[i+1] = d[i+2] = d[i+3] = 0

    # 4. name band
    rows = [0] * H0
    for y in range(H0):
        c = 0; base = y * W0 * 4
        for x in range(W0):
            if d[base + x * 4 + 3] > 40: c += 1
        rows[y] = c
    cut = int(round(H0 * 0.66))
    runStart = -1; bestLen = 0; bestAt = -1
    for y in range(int(round(H0 * 0.40)), H0):
        if rows[y] == 0:
            if runStart < 0: runStart = y
        else:
            if runStart >= 0:
                ln = y - runStart
                if ln > bestLen: bestLen = ln; bestAt = runStart
                runStart = -1
    loY = int(round(H0 * 0.45)); hiY = int(round(H0 * 0.70))
    if loY <= bestAt <= hiY and bestLen >= 3: cut = bestAt
    return crop(d, W0, H0, cut, None)


def crop(d, W0, H0, cut, _x):
    if cut < 2: return None
    S = 4
    gw = -(-W0 // S); gh = -(-cut // S)
    occ = bytearray(gw * gh)
    for gy in range(gh):
        yEnd = min((gy + 1) * S, cut)
        for gx in range(gw):
            xEnd = min((gx + 1) * S, W0)
            hit = 0
            for y in range(gy * S, yEnd):
                base = y * W0 * 4
                for x in range(gx * S, xEnd):
                    if d[base + x * 4 + 3] > 40: hit = 1; break
                if hit: break
            occ[gy * gw + gx] = hit
    lab = [0] * (gw * gh)
    idn = 0; bestId = 0; bestSize = 0
    for i0 in range(gw * gh):
        if not occ[i0] or lab[i0]: continue
        idn += 1; lab[i0] = idn
        st = [i0]; size = 0
        while st:
            p = st.pop(); size += 1
            x = p % gw; y = (p - x) // gw
            if x > 0 and occ[p-1] and not lab[p-1]: lab[p-1] = idn; st.append(p-1)
            if x < gw - 1 and occ[p+1] and not lab[p+1]: lab[p+1] = idn; st.append(p+1)
            if y > 0 and occ[p-gw] and not lab[p-gw]: lab[p-gw] = idn; st.append(p-gw)
            if y < gh - 1 and occ[p+gw] and not lab[p+gw]: lab[p+gw] = idn; st.append(p+gw)
        if size > bestSize: bestSize = size; bestId = idn
    if not bestId: return None
    gx0, gy0, gx1, gy1 = gw, gh, -1, -1
    for y in range(gh):
        for x in range(gw):
            if lab[y * gw + x] != bestId: continue
            if x < gx0: gx0 = x
            if x > gx1: gx1 = x
            if y < gy0: gy0 = y
            if y > gy1: gy1 = y
    x0 = gx0 * S; y0 = gy0 * S
    x1 = min(W0 - 1, (gx1 + 1) * S - 1); y1 = min(cut - 1, (gy1 + 1) * S - 1)
    tx0, ty0, tx1, ty1 = x1, y1, x0, y0
    for y in range(y0, y1 + 1):
        base = y * W0 * 4
        for x in range(x0, x1 + 1):
            if d[base + x * 4 + 3] > 20:
                if x < tx0: tx0 = x
                if x > tx1: tx1 = x
                if y < ty0: ty0 = y
                if y > ty1: ty1 = y
    if tx1 < tx0 or ty1 < ty0: return None
    w = tx1 - tx0 + 1; h = ty1 - ty0 + 1
    side = max(w, h)
    out = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    srcp = Image.frombytes('RGBA', (W0, H0), bytes(d))
    piece = srcp.crop((tx0, ty0, tx1 + 1, ty1 + 1))
    out.paste(piece, (int(round((side - w) / 2)), int(round((side - h) / 2))))
    return out


def main():
    names = sys.argv[1:]
    if not names:
        names = ['Blood_Stinger','Monstera','Mysterious_Stick','Sponge','Starfish','Stinger',
                 'Talisman_of_Evasion','Third_Eye','Tomato','Totem','Triangle','Web','Wing',
                 'Yggdrasil','Yin_Yang','Yucca','Basic','Dark_Mark','Lightning']
    CELL = 128; COLS = 8
    rows = -(-len(names) // COLS)
    sheet = Image.new('RGB', (COLS * CELL, rows * (CELL + 18)), (247, 247, 247))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(sheet)
    bad = []
    for i, n in enumerate(names):
        avail = MAN['petals'].get(n)
        if not avail:
            bad.append(n + ' (no card)'); continue
        try:
            sp = build_sprite(load_img(n, avail[0]))
        except Exception as e:
            sp = None; bad.append(n + ' ERR ' + str(e))
        if sp is None:
            bad.append(n + ' (sprite fail)'); continue
        cx = (i % COLS) * CELL; cy = (i // COLS) * (CELL + 18)
        for yy in range(cx // CELL * 0, 0): pass
        # checkerboard
        for a in range(0, CELL, 16):
            for b in range(0, CELL, 16):
                if (a // 16 + b // 16) % 2 == 0:
                    dr.rectangle([cx + a, cy + b, cx + a + 15, cy + b + 15], fill=(225, 225, 225))
        sp2 = sp.copy(); sp2.thumbnail((CELL - 8, CELL - 8))
        sheet.paste(sp2, (cx + (CELL - sp2.width) // 2, cy + (CELL - sp2.height) // 2), sp2)
        dr.text((cx + 3, cy + CELL + 3), n + ' ' + str(sp2.size[0]), fill=(40, 40, 40))
    outp = os.path.join(ROOT, 'shots', 'petals_contact.png')
    sheet.save(outp)
    print('saved', outp)
    if bad: print('PROBLEMS:', bad)


if __name__ == '__main__':
    main()
