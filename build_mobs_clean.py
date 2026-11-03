# -*- coding: utf-8 -*-
"""
把 assets/mobs/<Sprite>_(Rarity).webp（wiki 卡片图：绿色底 + 面板 + 生物）
烘焙成 assets/mobs_clean/<Sprite>.png（透明底、裁到生物本体）。

运行时不再做像素处理：file:// 下 canvas 一旦画了本地图就会被污染，
getImageData 直接抛 SecurityError，所以去底必须离线做。
"""
import os, re, glob, sys
from collections import Counter
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'assets', 'mobs')
DST = os.path.join(ROOT, 'assets', 'mobs_clean')
OUT = 176            # 单边最大像素
TOL = 30             # 底色容差（写死绿底 + 外圈亮边后可以收得比较紧）


def sprites_from_regions():
    s = open(os.path.join(ROOT, 'regions.js'), encoding='utf-8').read()
    names = []
    for m in re.finditer(r"sprite:'([^']+)'", s):
        n = m.group(1)
        if n not in names:
            names.append(n)
    return names


def pick_card(sprite):
    p = os.path.join(SRC, '%s_(Common).webp' % sprite)
    if os.path.exists(p):
        return p
    cand = sorted(glob.glob(os.path.join(SRC, '%s_(*).webp' % glob.escape(sprite))))
    return cand[0] if cand else None


# 所有 Common 卡片共用同一套绿底：外框 (96,192,88) + 面板 (120,232,104)
CARD_FRAME = (96, 192, 88)
CARD_PANEL = (120, 232, 104)


def dominant_ring(im):
    w, h = im.size
    px = im.load()
    m = max(2, int(min(w, h) * 0.03))
    ring = Counter()
    for x in range(w):
        for y in list(range(m)) + list(range(h - m, h)):
            r, g, b, a = px[x, y]
            if a > 200:
                ring[(r // 6 * 6, g // 6 * 6, b // 6 * 6)] += 1
    for y in range(h):
        for x in list(range(m)) + list(range(w - m, w)):
            r, g, b, a = px[x, y]
            if a > 200:
                ring[(r // 6 * 6, g // 6 * 6, b // 6 * 6)] += 1
    return ring.most_common(1)[0][0] if ring else None


def palette(im):
    """卡片底色 = 固定的「外框绿 + 面板绿」，再补上最外沿那一圈偏亮描边的颜色。
    踩过的坑：
      - 用「全图前两多」→ 蜈蚣（身体橄榄绿）漏掉外框，整张卡片抠不掉；
      - 用「四角采样」→ Termite_Overmind（大体型）把兽体当底色，抠穿；
      - 只写死两种绿 + 小容差 → 卡片最外沿那条 1px 亮边挡住了泛洪入口，
        结果一圈绿框留在图上（见 Centipede）。
    外圈那条亮边每张卡片都有，从「外圈窄带」里统计出来最稳。"""
    w, h = im.size
    px = im.load()
    out = [CARD_FRAME, CARD_PANEL]
    m = max(2, int(min(w, h) * 0.015))
    band = Counter()
    for x in range(w):
        for y in list(range(m)) + list(range(h - m, h)):
            r, g, b, a = px[x, y]
            if a > 200:
                band[(r // 6 * 6, g // 6 * 6, b // 6 * 6)] += 1
    for y in range(h):
        for x in list(range(m)) + list(range(w - m, w)):
            r, g, b, a = px[x, y]
            if a > 200:
                band[(r // 6 * 6, g // 6 * 6, b // 6 * 6)] += 1
    for c, _ in band.most_common(4):
        if not any(max(abs(c[i] - p[i]) for i in range(3)) <= 18 for p in out):
            out.append(c)
    ring_c = band.most_common(1)[0][0] if band else None
    if ring_c and max(abs(ring_c[i] - CARD_FRAME[i]) for i in range(3)) > 40:
        # 少数怪只有高稀有度卡片（如 Pharaoh_Beetle 只有 Super/Unique），底色不是绿的。
        # 这时沿中线从两侧往里扫，把「连续成片」的前几种颜色当作底色。
        out = []
        for y in (h // 2, h // 3, h * 2 // 3):
            for (x0, dx) in ((0, 1), (w - 1, -1)):
                prev, run = None, 0
                for k in range(int(w * 0.34)):
                    x = x0 + dx * k
                    c = px[x, y][:3]
                    q = (c[0] // 6 * 6, c[1] // 6 * 6, c[2] // 6 * 6)
                    if prev is not None and max(abs(q[i] - prev[i]) for i in range(3)) > 44:
                        break
                    if prev is None or max(abs(q[i] - prev[i]) for i in range(3)) > 12:
                        if prev is not None and run >= 3:
                            if not any(max(abs(prev[i] - p[i]) for i in range(3)) <= 18 for p in out):
                                out.append(prev)
                        prev = q
                        run = 0
                    run += 1
                if prev is not None and run >= 3:
                    if not any(max(abs(prev[i] - p[i]) for i in range(3)) <= 18 for p in out):
                        out.append(prev)
        out = out[:4] or [CARD_FRAME, CARD_PANEL]
    return out


def clean(im):
    im = im.convert('RGBA')
    w, h = im.size
    px = im.load()
    pal = palette(im)
    data = im.load()

    def is_bg(x, y):
        r, g, b, a = data[x, y]
        if a == 0:
            return True
        for (pr, pg, pb) in pal:
            if abs(r - pr) <= TOL and abs(g - pg) <= TOL and abs(b - pb) <= TOL:
                return True
        return False

    # ---- 1. 从四条边向内泛洪，把卡片底色抠掉 ----
    seen = bytearray(w * h)
    stack = []
    for x in range(w):
        stack.append(x)
        stack.append((h - 1) * w + x)
    for y in range(h):
        stack.append(y * w)
        stack.append(y * w + w - 1)
    while stack:
        p = stack.pop()
        if seen[p]:
            continue
        seen[p] = 1
        x, y = p % w, p // w
        if not is_bg(x, y):
            continue
        data[x, y] = (0, 0, 0, 0)
        if x > 0: stack.append(p - 1)
        if x < w - 1: stack.append(p + 1)
        if y > 0: stack.append(p - w)
        if y < h - 1: stack.append(p + w)

    # ---- 2. 两遍柔化边缘（抗锯齿的绿边） ----
    for _ in range(2):
        kills = []
        for y in range(h):
            for x in range(w):
                r, g, b, a = data[x, y]
                if a == 0:
                    continue
                near = ((x > 0 and data[x - 1, y][3] == 0) or
                        (x < w - 1 and data[x + 1, y][3] == 0) or
                        (y > 0 and data[x, y - 1][3] == 0) or
                        (y < h - 1 and data[x, y + 1][3] == 0))
                if not near:
                    continue
                for (pr, pg, pb) in pal:
                    if abs(r - pr) <= 60 and abs(g - pg) <= 60 and abs(b - pb) <= 60:
                        kills.append((x, y))
                        break
        if not kills:
            break
        for (x, y) in kills:
            data[x, y] = (0, 0, 0, 0)

    # ---- 3. 只保留最大的连通块，去掉残留的 1px 边框/角 ----
    lab = bytearray(w * h)
    best, best_n = None, 0
    for sy in range(h):
        for sx in range(w):
            p0 = sy * w + sx
            if lab[p0] or data[sx, sy][3] <= 24:
                continue
            stack = [p0]
            lab[p0] = 1
            blob = []
            while stack:
                p = stack.pop()
                blob.append(p)
                x, y = p % w, p // w
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if 0 <= nx < w and 0 <= ny < h:
                        q = ny * w + nx
                        if not lab[q] and data[nx, ny][3] > 24:
                            lab[q] = 1
                            stack.append(q)
            if len(blob) > best_n:
                best_n, best = len(blob), blob
    total = sum(1 for y in range(h) for x in range(w) if data[x, y][3] > 24)
    if not best or total < w * h * 0.005:
        return None, 0
    keep = bytearray(w * h)
    for p in best:
        keep[p] = 1
    for y in range(h):
        for x in range(w):
            if data[x, y][3] > 24 and not keep[y * w + x]:
                data[x, y] = (0, 0, 0, 0)

    # ---- 4. 裁到本体 ----
    bb = Image.new('L', (w, h), 0)
    bb.putdata([255 if data[x, y][3] > 8 else 0 for y in range(h) for x in range(w)])
    box = bb.getbbox()
    if not box:
        return None, 0
    # 留 2% 内边距，免得贴边被裁掉描边
    bw, bh = box[2] - box[0], box[3] - box[1]
    pad = max(2, int(round(max(bw, bh) * 0.02)))
    box = (max(0, box[0] - pad), max(0, box[1] - pad),
           min(w, box[2] + pad), min(h, box[3] + pad))
    art = im.crop(box)
    return art, total


def main():
    os.makedirs(DST, exist_ok=True)
    names = sprites_from_regions()
    ok, miss, bad = 0, [], []
    for name in names:
        card = pick_card(name)
        if not card:
            miss.append(name)
            continue
        im = Image.open(card)
        art, area = clean(im)
        if art is None:
            bad.append(name)
            continue
        w, h = art.size
        k = OUT / max(w, h)
        if k < 1:
            art = art.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
        art.save(os.path.join(DST, name + '.png'), optimize=True)
        ok += 1
        if w != h:
            print('  non-square %-22s %dx%d' % (name, w, h))
    print('cleaned %d / %d' % (ok, len(names)))
    if miss:
        print('no card:', ', '.join(miss))
    if bad:
        print('failed :', ', '.join(bad))


if __name__ == '__main__':
    main()
