# Build florr maps from C:/Users/123/Desktop/maps.zip into game-ready assets.
# - decodes every .tmj (gzip tile layers) preserving gid + Tiled flip/rotate flags
# - extracts tile SVGs, injecting xmlns + explicit width/height so they load as <img>
# - writes assets/maps_tmj/tileset.json (gid -> svg filename)
import base64, gzip, io, json, os, re, shutil, zipfile

ZIP = r'C:/Users/123/Desktop/maps.zip'
OUT_MAPS = 'assets/maps_tmj'
OUT_TILES = 'assets/maps_tiles'

os.makedirs(OUT_MAPS, exist_ok=True)
os.makedirs(OUT_TILES, exist_ok=True)

z = zipfile.ZipFile(ZIP)

# ---- 1) tileset.tsj (inside the zip) : id -> image, firstgid = 1 ----
tsj = json.loads(z.read('tileset.tsj').decode('utf-8'))
firstgid = 1
gid_to_image = {}
for t in tsj['tiles']:
    gid_to_image[t['id'] + firstgid] = t['image']
json.dump({'firstgid': firstgid, 'map': {str(k): v for k, v in gid_to_image.items()}},
          open(os.path.join(OUT_MAPS, 'tileset.json'), 'w'), separators=(',', ':'))

# ---- 2) tiles.zip (nested) : extract + sanitize SVGs ----
tiles_zip = zipfile.ZipFile(io.BytesIO(z.read('tiles.zip')))
n_svg = 0
for info in tiles_zip.infolist():
    if not info.filename.endswith('.svg'):
        continue
    name = info.filename.replace('%28', '(').replace('%29', ')')
    name = os.path.basename(name)
    s = tiles_zip.read(info).decode('utf-8', errors='ignore')
    m = re.search(r'<svg([^>]*)>', s)
    if m:
        attrs = m.group(1)
        vb = re.search(r'viewBox="([^"]+)"', attrs)
        w = h = None
        if vb:
            parts = vb.group(1).replace(',', ' ').split()
            if len(parts) == 4:
                w, h = parts[2], parts[3]
        new = attrs
        if 'xmlns=' not in new:
            new = ' xmlns="http://www.w3.org/2000/svg"' + new
        if w and not re.search(r'\bwidth=', new):
            new += ' width="%s"' % w
        if h and not re.search(r'\bheight=', new):
            new += ' height="%s"' % h
        s = s[:m.start()] + '<svg' + new + '>' + s[m.end():]
    open(os.path.join(OUT_TILES, name), 'w', encoding='utf-8').write(s)
    n_svg += 1
print('tiles extracted:', n_svg)

# ---- 3) decode every .tmj ----
H_FLAG, V_FLAG, D_FLAG = 0x80000000, 0x40000000, 0x20000000

def decode_tmj(raw, out_json):
    t = json.loads(raw)
    W, H = t['width'], t['height']
    layers = []
    max_gid = 0
    for l in t['layers']:
        if l.get('type') != 'tilelayer':
            continue
        data = l.get('data')
        if data is None:
            continue
        buf = gzip.decompress(base64.b64decode(data)) if l.get('compression') == 'gzip' else base64.b64decode(data)
        n = len(buf) // 4
        cells = bytearray(n * 2)
        for i in range(n):
            v = int.from_bytes(buf[i * 4:i * 4 + 4], 'little')
            gid = v & 0x1FFFFFFF
            flags = 0
            if v & H_FLAG: flags |= 1
            if v & V_FLAG: flags |= 2
            if v & D_FLAG: flags |= 4
            cells[i * 2] = gid if gid < 256 else 0
            cells[i * 2 + 1] = flags
            if gid > max_gid: max_gid = gid
        layers.append({'name': l['name'], 'b64': base64.b64encode(bytes(cells)).decode('ascii')})
    json.dump({'width': W, 'height': H, 'layers': layers},
              open(out_json, 'w'), separators=(',', ':'))
    return len(layers), max_gid

count = 0
for info in z.infolist():
    if not info.filename.endswith('.tmj'):
        continue
    dec = info.filename.replace('%28', '(').replace('%29', ')')
    base = dec[:-4]
    out = os.path.join(OUT_MAPS, base.replace('/', '__') + '.json')
    raw = z.read(info)
    nl, mg = decode_tmj(raw, out)
    count += 1
    print('  %-28s %2d layers  maxgid=%d' % (base, nl, mg))
print('maps decoded:', count)
