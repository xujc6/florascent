import re
for f in ['index.html','game.js','regions.js','talents.js','petals.js']:
    print('='*20, f)
    for i, line in enumerate(open(f, encoding='utf-8'), 1):
        if re.search(r'[一-龥]', line):
            print(i, line.rstrip()[:160])
