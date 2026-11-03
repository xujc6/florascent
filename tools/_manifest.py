# -*- coding: utf-8 -*-
"""
扫描 assets/ 里所有 `Name_(Rarity).webp` 卡片，重建 manifest.json。
生成时按 RARITY_ORDER 排序（找不到这个稀有度就跳过），
这样 avail[0] 永远是该花瓣最低的可用稀有度（去底图/兜底图都用第一张）。
"""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RARITY_ORDER = ['Common','Unusual','Rare','Super','Epic','Legendary','Mythic','Ultra','Eternal','Unique']

pat = re.compile(r'^(.*?)_\(([A-Za-z]+)\)\.webp$')
petals = {}
for f in os.listdir(os.path.join(ROOT, 'assets')):
    m = pat.match(f)
    if not m:
        continue
    name, rar = m.group(1), m.group(2)
    petals.setdefault(name, set()).add(rar)

out = {}
for n in sorted(petals):
    out[n] = [r for r in RARITY_ORDER if r in petals[n]]
    out[n] += sorted(r for r in petals[n] if r not in RARITY_ORDER)

json.dump({'rarities': RARITY_ORDER, 'petals': out},
          open(os.path.join(ROOT, 'manifest.json'), 'w', encoding='utf-8'),
          indent=1)
print('manifest.json: %d petals, %d cards' % (len(out), sum(len(v) for v in out.values())))
