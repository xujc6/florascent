import re, json, io
src = io.open('regions.js', encoding='utf-8').read()
man = json.load(io.open('manifest.json', encoding='utf-8'))['petals']
pmeta = io.open('petals.js', encoding='utf-8').read()
meta = set(re.findall(r'^\s*([A-Za-z_][A-Za-z0-9_]*):\{cat:', pmeta, re.M))

names = set(re.findall(r"p:'([A-Za-z_0-9]+)'", src))
for t in re.findall(r"drops:\[([^\]]*)\]", src):
    names |= set(re.findall(r"'([^']+)'", t))

new = ['Blood_Stinger','Monstera','Mysterious_Stick','Sponge','Starfish','Stinger',
       'Talisman_of_Evasion','Third_Eye','Tomato','Totem','Triangle','Web','Wing',
       'Yggdrasil','Yin_Yang','Yucca']
print('%-24s %-6s %-6s' % ('petal', 'drop', 'meta'))
for n in new:
    print('%-24s %-6s %-6s' % (n, n in names, n in meta))
print()
print('referenced but no card:', sorted(n for n in names if n not in man))
print('card but never dropped:', sorted(n for n in man if n not in names))
