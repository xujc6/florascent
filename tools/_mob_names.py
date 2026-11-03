# -*- coding: utf-8 -*-
import io
CN2EN = {
 '蚁穴':'Ant Hole','幼蚁':'Baby Ant','工蚁':'Worker Ant','兵蚁':'Soldier Ant',
 '蚁后':'Queen Ant','蜜蜂':'Bee','大黄蜂':'Hornet','瓢虫':'Ladybug','浅色瓢虫':'Light Ladybug',
 '深色瓢虫':'Dark Ladybug','蜈蚣':'Centipede','邪恶蜈蚣':'Evil Centipede','蜘蛛':'Spider',
 '岩石':'Rock','蒲公英':'Dandelion','泡泡':'Bubble','挖掘者':'Digger','蚁卵':'Ant Egg',
 '苍蝇':'Fly','蟑螂':'Roach','飞蛾':'Moth','垃圾':'Garbage',
 '叶虫':'Leafbug','金叶虫':'Golden Leafbug','灌木':'Bush','黄蜂':'Wasp','螳螂':'Mantis',
 '丛林蚁穴':'Termite Mound',
 '火蚁幼蚁':'Baby Fire Ant','火蚁工蚁':'Worker Fire Ant','火蚁兵蚁':'Soldier Fire Ant',
 '火蚁蚁后':'Queen Fire Ant','火蚁卵':'Fire Ant Egg','火蚁穴':'Fire Ant Burrow',
 '丛林瓢虫':'Desert Ladybug','甲虫':'Beetle','沙漠蜈蚣':'Desert Centipede','仙人掌':'Cactus',
 '海贝':'Shell','沙尘暴':'Sandstorm','蝎子':'Scorpion',
 '水母':'Jellyfish','海星':'Starfish','扇贝':'Scallop','螃蟹':'Crab','水蛭':'Leech',
 '海绵':'Sponge','珊瑚':'Coral',
 '重构机':'Mecha Flower','机械胡蜂':'Mecha Wasp','机械螃蟹':'Mecha Crab','机械蜘蛛':'Mecha Spider',
 '赌徒':'Gambler','白蚁幼蚁':'Baby Termite','白蚁工蚁':'Worker Termite',
 '白蚁兵蚁':'Soldier Termite','白蚁卵':'Termite Egg','白蚁主宰':'Termite Overmind',
 '潜兵蚁':'Diver Soldier Ant','萤火虫':'Firefly','蠕虫':'Worm','衣鱼':'Silverfish',
 '冥界蜈蚣':'Hel Centipede','冥界胡蜂':'Hel Wasp','冥界蜘蛛':'Hel Spider','冥界甲虫':'Hel Beetle',
 '幽灵':'Ghost',
 '墓穴':'Tomb','木乃伊甲虫':'Mummy Beetle','法老甲虫':'Pharaoh Beetle','纳扎尔甲虫':'Nazar Beetle',
 '商人':'Trader','先知':'Oracle','泰坦':'Titan','装配者':'Assembler',
 '水晶体':'Crystal','正方体':'Square',
}
s = io.open('regions.js', encoding='utf-8').read()
n = 0
for cn, en in CN2EN.items():
    old = "name:'%s'" % cn
    if old in s:
        s = s.replace(old, "name:'%s'" % en); n += 1
    else:
        print('MISS', cn)
io.open('regions.js','w',encoding='utf-8',newline='\n').write(s)
print('replaced', n, 'of', len(CN2EN))
