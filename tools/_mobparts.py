#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
从 mobs_clean 的透明生物图里拆出「可动部件」，供引擎做逐部件动画：
  · 蜘蛛：8 条腿（wiki: 移动时腿做前后波形摆动）→ 抠掉腿，只留躯干，腿由引擎程序化绘制
  · 兵蚁等带翅膀的：wiki: 半透明白色椭圆翅膀，敌对时前后扇动、静止时不动
    → 抠出左右两片翅膀各存一张，躯干上的翅膀位置用躯干本色补平

输出：
  assets/mobs_clean/<Name>_body.png      躯干（腿/翅膀已去除）
  assets/mobs_clean/<Name>_wingL.png     左翅（仅该片，其余透明，尺寸与原图一致）
  assets/mobs_clean/<Name>_wingR.png     右翅
  tools/_mobparts.json                   每只怪的腿几何 / 翅膀几何
"""
import os, math, json
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
CLEAN = os.path.join(ROOT, 'assets', 'mobs_clean')
OUT = os.path.join(os.path.dirname(__file__), '_mobparts.json')


def load(name):
    p = os.path.join(CLEAN, name + '.png')
    if not os.path.exists(p):
        return None
    im = Image.open(p).convert('RGBA')
    return im


def opaque_pts(im):
    W, H = im.size
    px = im.load()
    pts = []
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a > 40:
                pts.append((x, y, r, g, b, a))
    return pts


def centroid(P):
    xs = [p[0] for p in P]
    ys = [p[1] for p in P]
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    return cx, cy


def is_gray(r, g, b):
    return abs(r - g) < 14 and abs(g - b) < 14


def is_warm(r, g, b):
    return (r - b) > 14


def components(mask, W, H):
    seen = [[0] * W for _ in range(H)]
    comps = []
    for y in range(H):
        for x in range(W):
            if mask[y][x] and not seen[y][x]:
                st = [(x, y)]
                seen[y][x] = 1
                pts = []
                while st:
                    cx, cy = st.pop()
                    pts.append((cx, cy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1),
                                   (1, 1), (1, -1), (-1, 1), (-1, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < W and 0 <= ny < H and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = 1
                            st.append((nx, ny))
                comps.append(pts)
    comps.sort(key=len, reverse=True)
    return comps


def analyse(name):
    im = load(name)
    if im is None:
        return None
    W, H = im.size
    pts = opaque_pts(im)
    if len(pts) < 200:
        return None
    body = [(x, y) for (x, y, r, g, b, a) in pts if is_warm(r, g, b)]
    gray = [(x, y) for (x, y, r, g, b, a) in pts if is_gray(r, g, b)]
    if not body:
        # 纯灰的虫（蚂蚁）：用「离质心近的那团」当作躯干
        cx0, cy0 = centroid([(p[0], p[1]) for p in pts])
        body = [(x, y) for (x, y, r, g, b, a) in pts if math.hypot(x - cx0, y - cy0) < 26]
        gray = [(x, y) for (x, y, r, g, b, a) in pts if math.hypot(x - cx0, y - cy0) >= 26]
    bcx, bcy = centroid(body)
    bodyR = max(math.hypot(x - bcx, y - bcy) for x, y in body)

    # ---------- 翅膀：明亮、低饱和、离开躯干中心的椭圆 ----------
    bright = [[0] * W for _ in range(H)]
    for (x, y, r, g, b, a) in pts:
        if r > 140 and g > 140 and b > 140 and (max(r, g, b) - min(r, g, b)) < 46:
            bright[y][x] = 1
    wings = []
    for comp in components(bright, W, H):
        if len(comp) < 60:
            continue
        ccx, ccy = centroid(comp)
        d = math.hypot(ccx - bcx, ccy - bcy)
        if d < bodyR * 0.5 or d > bodyR * 2.0:
            continue
        wings.append({'n': len(comp), 'cx': ccx, 'cy': ccy, 'd': d,
                      'ang': math.atan2(ccy - bcy, ccx - bcx)})
    wings = wings[:2]
    # 必须成对：两片大小接近、且各自的「径向」方向关于躯干轴线基本镜像
    if len(wings) == 2:
        n0, n1 = wings[0]['n'], wings[1]['n']
        if min(n0, n1) < max(n0, n1) * 0.45:
            wings = []

    # ---------- 腿：从躯干向外辐射的细长簇（不挑颜色，蜘蛛各变种腿色不一样） ----------
    legs = []
    radial = [(x, y) for (x, y, r, g, b, a) in pts]
    if len(radial) > 200:
        prof = []
        N = 180
        for i in range(N):
            a = i * 2 * math.pi / 180.0
            mx = 0.0
            for (x, y) in radial:
                dx, dy = x - bcx, y - bcy
                d = math.hypot(dx, dy)
                if d < 5:
                    continue
                da = abs(((math.atan2(dy, dx) - a + math.pi) % (2 * math.pi)) - math.pi)
                if da < 0.04:
                    mx = max(mx, d)
            prof.append(mx)
        info_minR = min(prof)
        # 阈值必须高于躯干半径，否则每个角度都有躯干像素，八条腿会连成一整圈
        thr = max(bodyR, info_minR) * 1.35
        segs = []
        cur = None
        for i, v in enumerate(prof):
            if v > thr:
                cur = [i, i] if cur is None else [cur[0], i]
            else:
                if cur:
                    segs.append(cur)
                    cur = None
        if cur:
            segs.append(cur)
        for s in segs:
            mid = (s[0] + s[1]) / 2.0 * 2.0
            ln = max(prof[s[0]:s[1] + 1])
            legs.append({'ang': mid, 'len': ln, 'w': (s[1] - s[0] + 1) * 2.0})
    return {'name': name, 'W': W, 'H': H, 'bcx': bcx, 'bcy': bcy, 'bodyR': bodyR,
            'minR': (info_minR if len(radial) > 200 else bodyR),
            'wings': wings, 'legs': legs}


def make_body(im, info, mode):
    """mode: 'legs' 去腿 | 'wings' 去翅膀并补躯干底色 | 'both'"""
    W, H = im.size
    px = im.load()
    out = im.copy()
    op = out.load()
    bcx, bcy, bodyR = info['bcx'], info['bcy'], info['bodyR']
    # 躯干平均色（用来补翅膀抠掉后的洞）
    samp = []
    for (x, y, r, g, b, a) in opaque_pts(im):
        if r > 140 and g > 140 and b > 140:
            continue
        if math.hypot(x - bcx, y - bcy) < bodyR * 0.72:
            samp.append((r, g, b))
    if samp:
        br = sum(s[0] for s in samp) / len(samp)
        bg = sum(s[1] for s in samp) / len(samp)
        bb = sum(s[2] for s in samp) / len(samp)
    else:
        br, bg, bb = 110, 110, 110
    cut = bodyR * 1.12
    # 去腿：蜘蛛躯干就是个圆，腿全在躯干之外 → 直接按「最小径向半径」切一个圆盘
    cutL = info.get('minR', bodyR) * 1.10
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a < 40:
                continue
            d = math.hypot(x - bcx, y - bcy)
            if 'legs' in mode and d > cutL:
                op[x, y] = (0, 0, 0, 0)
                continue
            if 'wings' in mode and r > 140 and g > 140 and b > 140 and \
               (max(r, g, b) - min(r, g, b)) < 46 and d > bodyR * 0.5:
                op[x, y] = (int(br), int(bg), int(bb), 255)
                continue
    return out


def make_wing(im, info, side):
    """side: 0 = 第一片，1 = 第二片；只保留该片，其余透明"""
    W, H = im.size
    px = im.load()
    bcx, bcy, bodyR = info['bcx'], info['bcy'], info['bodyR']
    bright = [[0] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a > 40 and r > 140 and g > 140 and b > 140 and (max(r, g, b) - min(r, g, b)) < 46:
                bright[y][x] = 1
    comps = []
    for c in components(bright, W, H):
        if len(c) < 60:
            continue
        ccx, ccy = centroid(c)
        d = math.hypot(ccx - bcx, ccy - bcy)
        if d < bodyR * 0.5 or d > bodyR * 2.0:
            continue
        comps.append(c)
    if len(comps) < 2:
        return None
    keep = set(comps[side])
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    op = out.load()
    for (x, y) in keep:
        op[x, y] = px[x, y]
    return out


# 只处理「可能有多腿 / 有翅膀」的虫类，全量跑太慢
CANDIDATES = ['Spider', 'Hel_Spider', 'Mecha_Spider', 'Spider_(Sewer)',
              'Soldier_Ant', 'Soldier_Fire_Ant', 'Diver_Soldier_Ant', 'Soldier_Termite',
              'Queen_Ant', 'Queen_Fire_Ant', 'Worker_Ant', 'Baby_Ant',
              'Moth', 'Fly', 'Bee', 'Bumble_Bee', 'Hornet', 'Wasp', 'Hel_Wasp',
              'Mecha_Wasp', 'Firefly', 'Beetle', 'Ladybug', 'Ladybug_(Desert)',
              'Mantis', 'Termite', 'Worm', 'Centipede']
NAMES = [n for n in CANDIDATES if os.path.exists(os.path.join(CLEAN, n + '.png'))]

report = {}
for n in NAMES:
    try:
        info = analyse(n)
    except Exception as e:
        print('skip', n, e)
        continue
    if not info:
        continue
    has_legs = len(info['legs']) >= 6 and max(l['len'] for l in info['legs']) > info['bodyR'] * 1.5
    has_wings = len(info['wings']) == 2
    if not (has_legs or has_wings):
        continue
    mode = 'both' if (has_legs and has_wings) else ('legs' if has_legs else 'wings')
    im = load(n)
    body = make_body(im, info, mode)
    body.save(os.path.join(CLEAN, n + '_body.png'))
    rec = {'sprite': n, 'body': n + '_body.png', 'bcx': round(info['bcx'], 1),
           'bcy': round(info['bcy'], 1), 'bodyR': round(info['bodyR'], 1),
           'W': info['W'], 'H': info['H']}
    if has_legs:
        rec['legs'] = [{'a': round(l['ang'], 1), 'len': round(l['len'], 1)} for l in info['legs']]
    if has_wings:
        wl = make_wing(im, info, 0)
        wr = make_wing(im, info, 1)
        if wl is not None and wr is not None:
            wl.save(os.path.join(CLEAN, n + '_wingL.png'))
            wr.save(os.path.join(CLEAN, n + '_wingR.png'))
            rec['wingL'] = n + '_wingL.png'
            rec['wingR'] = n + '_wingR.png'
            rec['wings'] = [{'a': round(math.degrees(w['ang']), 1), 'd': round(w['d'], 1),
                             'cx': round(w['cx'], 1), 'cy': round(w['cy'], 1)} for w in info['wings']]
    report[n] = rec
    print('%-22s legs=%d wings=%d mode=%s' % (n, len(info['legs']), len(info['wings']), mode))

json.dump(report, open(OUT, 'w', encoding='utf8'), ensure_ascii=False, indent=1)
print('\nwritten', OUT, len(report))
