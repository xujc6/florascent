import os, re

SRC = 'C:/Users/123/Desktop/florr素材'
targets = ['Cog', 'Crystal', 'Fangs', 'Mysterious_Powder', 'Mysterious_Relic', 'Orange',
           'Pearl', 'Peas', 'Pollen', 'Poo', 'Rice', 'Rock', 'Root', 'Rose', 'Rubber',
           'Salt', 'Shell', 'Soil', 'Square', 'Stick', 'Uranium']
files = [f.replace('_%28', '(').replace('%29', ')') for f in os.listdir(SRC)]
for t in targets:
    hits = [f for f in files if re.match(t + r'[_ ]?\(', f)]
    print('%-22s %s' % (t, hits[:3] if hits else 'NONE'))
