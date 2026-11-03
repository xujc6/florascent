# -*- coding: utf-8 -*-
"""
把 fetch() 才能读的 .json 数据额外导出一份 .js 包装，
这样直接双击 index.html（file:// 协议，fetch 被浏览器禁掉）也能加载地图。

生成：
  manifest.js                       -> window.MANIFEST_DATA
  assets/maps_tmj/tileset.js        -> window.TILESET_DATA
  assets/maps_tmj/<map>.js          -> window.MAPS_DATA['<map>']
"""
import json, os, glob

ROOT = os.path.dirname(os.path.abspath(__file__))

def wrap(src, dst, prefix, key=None):
    with open(src, 'r', encoding='utf-8') as f:
        raw = f.read()
    # 校验一下 json 合法（不重新序列化，保持体积不变）
    json.loads(raw)
    if key is None:
        body = '%s=%s;' % (prefix, raw)
    else:
        body = '%s[%s]=%s;' % (prefix, json.dumps(key), raw)
    with open(dst, 'w', encoding='utf-8') as f:
        f.write(body)
    return len(body)

n = 0
n += wrap(os.path.join(ROOT, 'manifest.json'),
          os.path.join(ROOT, 'manifest.js'),
          'window.MANIFEST_DATA')

ts = os.path.join(ROOT, 'assets', 'maps_tmj', 'tileset.json')
if os.path.exists(ts):
    n += wrap(ts, ts[:-5] + '.js', 'window.TILESET_DATA')

for jp in sorted(glob.glob(os.path.join(ROOT, 'assets', 'maps_tmj', '*.json'))):
    name = os.path.splitext(os.path.basename(jp))[0]
    if name == 'tileset':
        continue
    n += wrap(jp, jp[:-5] + '.js', '(window.MAPS_DATA=window.MAPS_DATA||{})', name)

# ---------------------------------------------------------------------------
# file:// 下 canvas 会被「污染」，getImageData 直接抛 SecurityError，而地图碰撞
# 掩码和花瓣去底都依赖读像素。把这两类素材做成 data: URL 内联进来，就同源了。
# 只内联真正会读像素的：地块 SVG + 每种花瓣的一张卡片图。
# ---------------------------------------------------------------------------
import base64, mimetypes

def dataurl(path):
    mime = mimetypes.guess_type(path)[0] or 'application/octet-stream'
    if path.endswith('.svg'):
        mime = 'image/svg+xml'
    with open(path, 'rb') as f:
        return 'data:%s;base64,%s' % (mime, base64.b64encode(f.read()).decode('ascii'))

inline = {}
for sv in sorted(glob.glob(os.path.join(ROOT, 'assets', 'maps_tiles', '*.svg'))):
    inline['assets/maps_tiles/' + os.path.basename(sv)] = dataurl(sv)

# 透明花瓣素材同样要走内联：去底/裁切要读像素
for png in sorted(glob.glob(os.path.join(ROOT, 'assets', 'petals_trans', '*.png'))):
    inline['assets/petals_trans/' + os.path.basename(png)] = dataurl(png)

# 有一部分花瓣的贴图直接借用了生物的透明素材（Stinger / Square / Soil / Stick …），
# 这些也要内联，否则 file:// 下 getImageData 会被污染，花瓣只能退回「整张卡片」
for mt in sorted(glob.glob(os.path.join(ROOT, 'assets', 'mobs_trans', '*'))):
    if os.path.splitext(mt)[1].lower() in ('.webp', '.png'):
        inline['assets/mobs_trans/' + os.path.basename(mt)] = dataurl(mt)

with open(os.path.join(ROOT, 'manifest.json'), 'r', encoding='utf-8') as f:
    man = json.load(f)
for name, rarities in man.get('petals', {}).items():
    if not rarities:
        continue
    rel = 'assets/%s_(%s).webp' % (name, rarities[0])
    p = os.path.join(ROOT, rel)
    if os.path.exists(p):
        inline[rel] = dataurl(p)

blob = json.dumps(inline, separators=(',', ':'))
with open(os.path.join(ROOT, 'assets_inline.js'), 'w', encoding='utf-8') as f:
    f.write('window.INLINE_IMG=%s;' % blob)
n += len(blob)

print('offline data written, %d bytes (inline images: %d)' % (n, len(inline)))

