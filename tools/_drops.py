import re, sys
s = open('regions.js', encoding='utf-8').read()
names = set()
pat = re.compile(r"drops:\[([^\]]*)\]")
for m in pat.finditer(s):
    for p in re.findall(r"'([^']+)'", m.group(1)):
        names.add(p)
print(sorted(names))
