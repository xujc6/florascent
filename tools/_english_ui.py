# -*- coding: utf-8 -*-
"""Translate all user-facing Chinese strings to English (round: english-ui)."""
import io, sys

def sub(path, pairs, must=True):
    s = io.open(path, encoding='utf-8').read()
    missed = []
    for old, new in pairs:
        if old in s:
            s = s.replace(old, new)
        else:
            missed.append(old[:60])
    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    if missed:
        print('MISSED in %s:' % path)
        for m in missed: print('   ', m)

# ---------------- regions.js: mob names + region names ----------------
MOB_NAMES = {
 'ant_hole':'Ant Hole','baby_ant':'Baby Ant','worker_ant':'Worker Ant','soldier_ant':'Soldier Ant',
 'queen_ant':'Queen Ant','bee':'Bee','hornet':'Hornet','ladybug':'Ladybug','ladybug_light':'Light Ladybug',
 'ladybug_dark':'Dark Ladybug','centipede':'Centipede','evil_centipede':'Evil Centipede','spider':'Spider',
 'rock':'Rock','dandelion':'Dandelion','bubble':'Bubble','digger':'Digger','ant_egg':'Ant Egg',
 'fly':'Fly','roach':'Roach','moth':'Moth','garbage':'Garbage',
 'leafbug':'Leafbug','golden_leafbug':'Golden Leafbug','bush':'Bush','wasp':'Wasp','mantis':'Mantis',
 'termite_mound':'Termite Mound',
 'baby_fire_ant':'Baby Fire Ant','worker_fire_ant':'Worker Fire Ant','soldier_fire_ant':'Soldier Fire Ant',
 'queen_fire_ant':'Queen Fire Ant','fire_ant_egg':'Fire Ant Egg','fire_ant_burrow':'Fire Ant Burrow',
 'ladybug_jungle':'Desert Ladybug','beetle':'Beetle','desert_centipede':'Desert Centipede','cactus':'Cactus',
 'shell':'Shell','sandstorm':'Sandstorm','scorpion':'Scorpion',
 'jellyfish':'Jellyfish','starfish':'Starfish','scallop':'Scallop','crab':'Crab','leech':'Leech',
 'sponge':'Sponge','coral':'Coral',
 'mecha_flower':'Mecha Flower','mecha_wasp':'Mecha Wasp','mecha_crab':'Mecha Crab','mecha_spider':'Mecha Spider',
 'gambler':'Gambler','baby_termite':'Baby Termite','worker_termite':'Worker Termite',
 'soldier_termite':'Soldier Termite','termite_egg':'Termite Egg','termite_overmind':'Termite Overmind',
 'diver_soldier_ant':'Diver Soldier Ant','firefly':'Firefly','worm':'Worm','silverfish':'Silverfish',
 'hel_centipede':'Hel Centipede','hel_wasp':'Hel Wasp','hel_spider':'Hel Spider','hel_beetle':'Hel Beetle',
 'ghost':'Ghost',
 'tomb':'Tomb','mummy_beetle':'Mummy Beetle','pharaoh_beetle':'Pharaoh Beetle','nazar_beetle':'Nazar Beetle',
 'trader':'Trader','oracle':'Oracle','titan':'Titan','assembler':'Assembler',
 'crystal_mob':'Crystal','square_mob':'Square',
}
pairs = []
for cn in ['蚁穴','幼蚁','工蚁','兵蚁','蚁后','蜜蜂','大黄蜂','瓢虫','浅色瓢虫','深色瓢虫','蜈蚣','邪恶蜈蚣',
           '蜘蛛','岩石','蒲公英','泡泡','挖掘者','蚁卵','苍蝇','蟑螂','飞蛾','垃圾','叶虫','金叶虫','灌木',
           '黄蜂','螳螂','丛林蚁穴','火蚁幼蚁','火蚁工蚁','火蚁兵蚁','火蚁蚁后','火蚁卵','火蚁穴','丛林瓢虫',
           '甲虫','沙漠蜈蚣','仙人掌','海贝','沙尘暴','蝎子','水母','海星','扇贝','螃蟹','水蛭','海绵','珊瑚',
           '重构机','机械胡蜂','机械螃蟹','机械蜘蛛','赌徒','白蚁幼蚁','白蚁工蚁','白蚁兵蚁','白蚁卵','白蚁主宰',
           '潜兵蚁','萤火虫','蠕虫','衣鱼','冥界蜈蚣','冥界胡蜂','冥界蜘蛛','冥界甲虫','幽灵','墓穴',
           '木乃伊甲虫','法老甲虫','纳扎尔甲虫','商人','先知','泰坦','装配者','水晶体','正方体']:
    pairs.append(("name:'%s'" % cn, '__MOB__'))
# map each occurrence in order of appearance in file
s = io.open('regions.js', encoding='utf-8').read()
order = ['蚁穴','幼蚁','工蚁','兵蚁','蚁后','蜜蜂','大黄蜂','瓢虫','浅色瓢虫','深色瓢虫','蜈蚣','邪恶蜈蚣',
         '蜘蛛','岩石','蒲公英','泡泡','挖掘者','蚁卵','苍蝇','蟑螂','飞蛾','垃圾','叶虫','金叶虫','灌木',
         '黄蜂','螳螂','丛林蚁穴','火蚁幼蚁','火蚁工蚁','火蚁兵蚁','火蚁蚁后','火蚁卵','火蚁穴','丛林瓢虫',
         '甲虫','沙漠蜈蚣','仙人掌','海贝','沙尘暴','蝎子','水母','海星','扇贝','螃蟹','水蛭','海绵','珊瑚',
         '重构机','机械胡蜂','机械螃蟹','机械蜘蛛','赌徒','白蚁幼蚁','白蚁工蚁','白蚁兵蚁','白蚁卵','白蚁主宰',
         '潜兵蚁','萤火虫','蠕虫','衣鱼','冥界蜈蚣','冥界胡蜂','冥界蜘蛛','冥界甲虫','幽灵','墓穴',
         '木乃伊甲虫','法老甲虫','纳扎尔甲虫','商人','先知','泰坦','装配者','水晶体','正方体']
keys = list(MOB_NAMES.keys())
# replace sequentially: each name:'..' occurrence maps to next key
for k in keys:
    s = s.replace("name:'__MOB__'", "name:'%s'" % MOB_NAMES[k], 1)
assert "name:'__MOB__'" not in s, 'leftover placeholder'
io.open('regions.js','w',encoding='utf-8',newline='\n').write(s)

REGION_NAMES = {'garden':'Garden','sewer':'Sewer','jungle':'Jungle','desert':'Desert','ocean':'Ocean',
                'factory':'Factory','special':'Special','anthell':'Ant Hell','hel':'Hel','pyramid':'Pyramid'}
s = io.open('regions.js', encoding='utf-8').read()
for cn, en in [('花园','Garden'),('下水道','Sewer'),('丛林','Jungle'),('沙漠','Desert'),('海洋','Ocean'),
               ('工厂','Factory'),('特殊','Special'),('蚁地狱','Ant Hell'),('冥界','Hel'),('金字塔','Pyramid')]:
    s = s.replace("name:'%s'" % cn, "name:'%s'" % en)
io.open('regions.js','w',encoding='utf-8',newline='\n').write(s)

# fix stale comments that mention the old radius
sub('regions.js', [
  ('//  生物体型：按 florr.io 原作的相对大小（花朵半径记作 25）',
   '//  Mob sizes: relative to florr.io original (flower radius = 25 units)'),
  ('//  本作花朵碰撞半径 20 → 换算系数 20/25 = 0.8',
   '//  Our flower collision radius is 17 -> factor 17/25 = 0.68'),
  ('//  之前用 10+sqrt(hp)*1.1 推半径，导致小蚂蚁和岩石差不多大',
   '//  The old 10+sqrt(hp)*1.1 formula made baby ants as big as rocks'),
])

# ---------------- talents.js ----------------
sub('talents.js', [
  ("name:'装备栏', icon:'Loadout'", "name:'Loadout', icon:'Loadout'"),
  ("desc:'解锁额外的花瓣装备槽（第 6~10 槽）。'", "desc:'Unlocks extra petal slots (slots 6-10).'"),
  ("name:'生命', icon:'Health'", "name:'Health', icon:'Health'"),
  ("desc:'提升小花基础生命值（每层 ×1.3）。'", "desc:'Increases your base HP (x1.3 per rank).'"),
  ("name:'花瓣生命', icon:'Petal_Health'", "name:'Petal Health', icon:'Petal_Health'"),
  ("desc:'提升花瓣生命值/护盾上限（每层 ×1.15）。'", "desc:'Increases petal HP / shield pool (x1.15 per rank).'"),
  ("name:'治疗', icon:'Medic'", "name:'Medic', icon:'Medic'"),
  ("desc:'提升花瓣为你/队友恢复的生命（每层 ×1.15）。'", "desc:'Increases HP restored by healing petals (x1.15 per rank).'"),
  ("name:'装填', icon:'Reload'", "name:'Reload', icon:'Reload'"),
  ("desc:'缩短花瓣装填时间（每层 ×0.9）。'", "desc:'Reduces petal reload time (x0.9 per rank).'"),
  ("name:'花瓣旋转', icon:'Petal_Rotation'", "name:'Petal Rotation', icon:'Petal_Rotation'"),
  ("desc:'提升花瓣旋转速度（每层 +0.6 rad/s）。'", "desc:'Increases petal orbit speed (+0.6 rad/s per rank).'"),
  ("name:'利刃', icon:'Sharp_Edges'", "name:'Sharp Edges', icon:'Sharp_Edges'"),
  ("desc:'提升贴身（身体）伤害（每层叠加）。'", "desc:'Increases body (contact) damage (stacks per rank).'"),
  ("name:'幸运', icon:'Luck'", "name:'Luck', icon:'Luck'"),
  ("desc:'提升幸运值，提高刷怪稀有度与部分花瓣效果。'", "desc:'Increases luck: better mob rarity rolls and stronger petal effects.'"),
  ("name:'天线', icon:'Antennae_Talent'", "name:'Antennae', icon:'Antennae_Talent'"),
  ("desc:'提升视野范围（相当于常驻天线）。'", "desc:'Increases vision range (permanent Antennae).'"),
  ("name:'射程', icon:'Reach'", "name:'Reach', icon:'Reach'"),
  ("desc:'提升花瓣攻击距离。'", "desc:'Increases petal attack range.'"),
  ("name:'磁力', icon:'Magnetism'", "name:'Magnetism', icon:'Magnetism'"),
  ("desc:'存活时花瓣拾取范围 +1000。'", "desc:'+1000 petal pickup range while alive.'"),
  ("name:'复制', icon:'Duplicator'", "name:'Duplicator', icon:'Duplicator'"),
  ("desc:'为已有 ≥2 片的花瓣额外复制一片。'", "desc:'Adds one extra copy of each petal you have 2+ of.'"),
  ("name:'二次机会', icon:'Second_Chance'", "name:'Second Chance', icon:'Second_Chance'"),
  ("desc:'受到致命伤害时短暂无敌（防止死亡）。'", "desc:'Brief invulnerability on lethal damage (prevents death).'"),
  ("name:'毒', icon:'Poison'", "name:'Poison', icon:'Poison'"),
  ("desc:'提升所有毒素伤害（每层 ×1.0625）。'", "desc:'Increases all poison damage (x1.0625 per rank).'"),
  ("name:'浓缩毒', icon:'Concentrated_Poison'", "name:'Concentrated Poison', icon:'Concentrated_Poison'"),
  ("desc:'毒每秒伤害 +20%，持续时间 -16.7%。'", "desc:'Poison DPS +20%, duration -16.7%.'"),
  ("name:'身体毒性', icon:'Body_Toxicity'", "name:'Body Toxicity', icon:'Body_Toxicity'"),
  ("desc:'与敌人碰撞时造成 0.6×身体伤害的毒素（1 秒）。'", "desc:'Colliding with enemies poisons them (0.6x body damage, 1s).'"),
  ("name:'召唤', icon:'Summoner'", "name:'Summoner', icon:'Summoner'"),
  ("desc:'召唤一只兵蚁伙伴跟随你作战（数量随等级提升，死亡后 8 秒重生）。'",
   "desc:'A Soldier Ant fights beside you (more per rank, respawns after 8s).'"),
])

# ---------------- index.html ----------------
sub('index.html', [
  ('<title>Florr 同款 · 花园生存</title>', '<title>Florr-like · Garden Survival</title>'),
  ('>合成 (C)<', '>Craft (C)<'),
  ('>天赋 (T)<', '>Talents (T)<'),
  ('移动：鼠标 / WASD　·　左键装备　·　右键卸下　·　C 合成　·　数字键 1-9 切换区域',
   'Move: Mouse / WASD &nbsp;·&nbsp; Left-click equip &nbsp;·&nbsp; Right-click unequip &nbsp;·&nbsp; C craft &nbsp;·&nbsp; 1-9 switch region'),
  ('<h1>🌸 Florr 同款</h1>', '<h1>🌸 Florr-like</h1>'),
  ('你是花园里的一朵花。绕着中心的花瓣会攻击靠近的虫子；击败它们会掉落新的花瓣。<br>\n     把更强的花瓣装备到身上，活得更久、变得更强。',
   'You are a flower in the garden. Petals orbiting you attack nearby mobs; defeated mobs drop new petals.<br>\n     Equip stronger petals to survive longer and grow stronger.'),
  ('placeholder="输入你的名字" value="小花"', 'placeholder="Enter your name" value="Unnamed"'),
  ('>普通<', '>Common<'), ('>罕见<', '>Unusual<'), ('>稀有<', '>Rare<'),
  ('>超级<', '>Super<'), ('>史诗<', '>Epic<'), ('>传说<', '>Legendary<'),
  ('>神话<', '>Mythic<'), ('>终极<', '>Ultra<'),
  ('>开始游戏<', '>Ready<'),
  ('<h1>💀 你被吃掉了</h1>', '<h1>💀 You were eaten</h1>'),
  ('>再来一局<', '>Respawn<'),
  ('<h2>🌟 天赋</h2>', '<h2>🌟 Talents</h2>'),
  ('天赋点：<span id="tpcount">0 / 0</span>（按 T 关闭）',
   'Talent points: <span id="tpcount">0 / 0</span> (press T to close)'),
  ('<h2>⚗ 合成</h2>', '<h2>⚗ Crafting</h2>'),
  ('背包里 <b>5 片同名同稀有度</b> 花瓣 → 1 片更高稀有度。失败会全部碎掉。',
   '<b>5 petals</b> of the same name &amp; rarity → 1 of the next rarity. On failure all 5 shatter.'),
])

# ---------------- game.js ----------------
sub('game.js', [
  ("const RARITY_CN   = {Common:'普通',Unusual:'罕见',Rare:'稀有',Epic:'史诗',Legendary:'传说',\n                     Mythic:'神话',Ultra:'终极',Super:'超级',Unique:'独特'};",
   "const RARITY_CN   = {Common:'Common',Unusual:'Unusual',Rare:'Rare',Epic:'Epic',Legendary:'Legendary',\n                     Mythic:'Mythic',Ultra:'Ultra',Super:'Super',Unique:'Unique'};"),
  ("elRegionLabel.textContent='当前区域：'", "elRegionLabel.textContent='Region: '"),
  ("toast('已经是最高的稀有度了', 'bad')", "toast('Already max rarity', 'bad')"),
  ("toast('花瓣不够，需要 5 片同名同稀有度', 'bad')", "toast('Not enough petals: need 5 of the same name & rarity', 'bad')"),
  ("toast('背包快满了', 'bad')", "toast('Bag is almost full', 'bad')"),
  ("toast('✦ 合成成功：'+name+' → '+RARITY_CN[next]+'（'+Math.round(p*100)+'%）', 'good')",
   "toast('✦ Craft success: '+name+' → '+RARITY_CN[next]+' ('+Math.round(p*100)+'%)', 'good')"),
  ("toast('✧ 合成失败，5 片花瓣碎了…（'+Math.round(p*100)+'%）', 'bad')",
   "toast('✧ Craft failed - 5 petals shattered… ('+Math.round(p*100)+'%)', 'bad')"),
  ("empty.textContent = '背包是空的 —— 先打几只虫子捡点花瓣。';",
   "empty.textContent = 'Bag is empty - kill some mobs and pick up petals.';"),
  ("desc.innerHTML = '→ <b style=\"color:'+RARITY_COLOR[next]+'\">'+RARITY_CN[next]+'</b>　成功率 <b>'+Math.round(p*100)+'%</b>';",
   "desc.innerHTML = '→ <b style=\"color:'+RARITY_COLOR[next]+'\">'+RARITY_CN[next]+'</b> &nbsp; success <b>'+Math.round(p*100)+'%</b>';"),
  ("desc.textContent = '已经是最高稀有度';", "desc.textContent = 'Already max rarity';"),
  ("btn.textContent = '合成';", "btn.textContent = 'Craft';"),
  ("tip.textContent = '幸运天赋会额外提升成功率' + (player.luck>0 ? '（当前 +'+Math.round(player.luck*50)+'%）' : '');",
   "tip.textContent = 'The Luck talent raises success rate' + (player.luck>0 ? ' (currently +'+Math.round(player.luck*50)+'%)' : '');"),
  ("title.textContent = g.name + ' ×' + g.n + '　' + RARITY_CN[g.rarity];",
   "title.textContent = g.name + ' x' + g.n + '  ' + RARITY_CN[g.rarity];"),
  ("'你到达了 '+player.level+' 级，背包里有 '+player.backpack.length+' 片花瓣。';",
   "'You reached level '+player.level+' - '+player.backpack.length+' petals in your bag.';"),
])

print('done')
