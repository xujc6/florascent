import os, re, json, io

SRC = 'C:/Users/123/Desktop/florr素材'


def types(d, unquote=False):
    out = {}
    for f in os.listdir(d):
        g = f.replace('_%28', '(').replace('%29', ')') if unquote else f
        m = re.match(r'^(.*?)[_ ]?\(([A-Za-z]+)\)\.webp$', g)
        if m:
            out.setdefault(m.group(1).strip(), set()).add(m.group(2))
    return out


src = types(SRC, True)
assets = types('assets')
man = json.load(open('manifest.json', encoding='utf-8'))['petals']

print('src types   :', len(src))
print('assets types:', len(assets))
print('manifest    :', len(man))
print()
print('== in src not in assets ==')
for n in sorted(set(src) - set(assets)):
    print('  ', n, sorted(src[n]))
print('== in assets not in src ==')
for n in sorted(set(assets) - set(src)):
    print('  ', n)
print('== rarity diffs ==')
for n in sorted(set(src) & set(assets)):
    if src[n] != assets[n]:
        print('  ', n, 'src only', sorted(src[n] - assets[n]), '| assets only', sorted(assets[n] - src[n]))

# drop references
reg = io.open('regions.js', encoding='utf-8').read()
drops = set(w for t in re.findall(r"drops:\[([^\]]*)\]", reg) for w in re.findall(r"'([^']+)'", t))
drops |= set(re.findall(r"p:'([A-Za-z_0-9]+)'", reg))
print()
print('== drop references WITHOUT card ==')
for n in sorted(drops - set(man)):
    print('  ', n)
