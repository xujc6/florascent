// ============================================================
//  florr-style petal database + asset loader
// ============================================================

// Rarity order and color (原作十级：…Mythic < Ultra < Super < Eternal = Unique)
// 颜色直接取卡面实际底色，UI 与卡面完全一致
const RARITIES = ['Common','Unusual','Rare','Epic','Legendary','Mythic','Ultra','Super','Eternal','Unique'];
const RARITY_COLOR = {
  Common:    '#66c358',
  Unusual:   '#ceba4a',
  Rare:      '#3e42b7',
  Epic:      '#6d18b4',
  Legendary: '#b41919',
  Mythic:    '#19b1b4',
  Ultra:     '#ce235f',
  Super:     '#23ce85',
  Eternal:   '#c1c1c1',
  Unique:    '#454545'
};
// ============================================================
//  稀有度倍率（official-florrio.fandom.com 数值表）
//   伤害：1 / 3 / 9 / 27 / 81 / 243 / 729 / 2187 / 6561
//   回血：1 / 3 / 9 / 27 / 81 / 243 / 243√3 / 729 / 729√3
//   护甲：1(实际 0.8) / 2 / 7 / 22 / 65 / 194 / 583 / 583 / 583
//  Unique 是本站顶层，沿用 Eternal。
// ============================================================
const _RM_DMG  = [1, 3, 9, 27, 81, 243, 729, 2187, 6561];
const _RM_HEAL = [1, 3, 9, 27, 81, 243, 243*Math.sqrt(3), 729, 729*Math.sqrt(3)];
const _RM_ARM  = [0.8, 2, 7, 22, 65, 194, 583, 583, 583];
const RARITY_MULT = {}, RARITY_HEAL_MULT = {}, RARITY_SHIELD_MULT = {};
['Common','Unusual','Rare','Epic','Legendary','Mythic','Ultra','Super','Eternal'].forEach((k,i)=>{
  RARITY_MULT[k]        = _RM_DMG[i];
  RARITY_HEAL_MULT[k]   = _RM_HEAL[i];
  RARITY_SHIELD_MULT[k] = _RM_ARM[i];
});
RARITY_MULT.Unique = RARITY_MULT.Eternal;
RARITY_HEAL_MULT.Unique = RARITY_HEAL_MULT.Eternal;
RARITY_SHIELD_MULT.Unique = RARITY_SHIELD_MULT.Eternal;

// Petal category + per-petal "power" (tunes the base stat of its category)
// Categories: melee, ranged, heal, shield, speed, magnet, antenna, cogwheel, battery, ankh, goggles
const PETAL_META = {
  // ---- melee (contact damage) ----
  Basic:{cat:'melee',p:0.8}, Rock:{cat:'melee',p:2.2}, Heavy:{cat:'melee',p:2.6}, Fang:{cat:'melee',p:1.4},
  Rice:{cat:'melee',p:0.45}, Shovel:{cat:'melee',p:1.2},   // 米 / 铲子（刚补的卡）
  Claw:{cat:'melee',p:1.1}, Cactus:{cat:'melee',p:1.0}, Cutter:{cat:'melee',p:1.3},
  Dahlia:{cat:'melee',p:1.7}, Iris:{cat:'melee',p:1.9},
  Bur:{cat:'melee',p:0.9}, Corn:{cat:'melee',p:1.2}, Carrot:{cat:'melee',p:1.0},
  Grapes:{cat:'melee',p:0.9}, Broccoli:{cat:'melee',p:1.1}, Dandelion:{cat:'melee',p:1.6},
  Clover:{cat:'melee',p:0.5}, Lentil:{cat:'melee',p:0.7},
  Cotton:{cat:'melee',p:0.6}, Dark_Mark:{cat:'melee',p:2.2}, Fragment:{cat:'melee',p:3.0},
  Dead_Leaf:{cat:'melee',p:1.8}, Golden_Leaf:{cat:'melee',p:0}, Coral:{cat:'melee',p:0.9},
  Disc:{cat:'melee',p:0.7}, Coin:{cat:'melee',p:0.7}, Dice:{cat:'melee',p:1.2},
  Domino:{cat:'melee',p:1.0}, Card:{cat:'melee',p:1.1}, Poker_Chip:{cat:'melee',p:1.3},
  Light:{cat:'melee',p:0.6}, Light_Bulb:{cat:'melee',p:0.8}, Bone:{cat:'melee',p:1.0},
  Beetle_Egg:{cat:'melee',p:0.9}, Ant_Egg:{cat:'melee',p:0.9}, Lotus:{cat:'melee',p:0.6},
  Mimic:{cat:'melee',p:1.9}, Corruption:{cat:'melee',p:3.5},
  // ---- ranged (fires projectiles) ----
  Missile:{cat:'ranged',p:1.4}, Mecha_Missile:{cat:'ranged',p:2.5},
  Lightning:{cat:'ranged',p:1.8}, Laser:{cat:'ranged',p:1.6},
  // ---- heal（碰到生物就回血，原作核心机制：花瓣撞怪 = 治疗）----
  //  p 只调「每次命中的治疗量」，实际回血 = 1 × 稀有度回血倍率 × p
  Leaf:{cat:'melee',p:1.0},       // 叶子：有伤害的近战花瓣 + 常驻被动回血（wiki）
  Rose:{cat:'heal',p:3.0},        // 玫瑰：单次回血量高，冷却也长
  Bandage:{cat:'heal',p:2.4},     // 绷带：回血 + 额外耐久
  Basil:{cat:'heal',p:2.0},       // 罗勒：治疗 + 持续恢复
  Jelly:{cat:'heal',p:1.6},       // 果冻：少量高频治疗
  Bean:{cat:'heal',p:1.3},        // 豆子：治疗 + 最大生命
  Amulet:{cat:'heal',p:1.1},      // 护身符：治疗偏辅助
  Honey:{cat:'heal',p:1.2},       // 蜂蜜：持续回血 + 抗减速
  Sponge:{cat:'heal',p:1.9},      // 海绵：吸收伤害转治疗
  Tomato:{cat:'heal',p:3.0},      // 番茄：高频治疗
  Totem:{cat:'heal',p:3.6},       // 图腾：大治疗
  Yggdrasil:{cat:'heal',p:10.0},  // 世界树：最强治疗 + 复活
  // ---- shield (absorb pool) ----
  Glass:{cat:'shield',p:1.2}, Bubble:{cat:'shield',p:1.4}, Clay:{cat:'shield',p:1.0},
  Air:{cat:'shield',p:0.8}, Compass:{cat:'shield',p:1.0}, Dust:{cat:'shield',p:0.6},
  // ---- utility ----
  Faster:{cat:'melee', p:0}, Magnet:{cat:'magnet'},
  Antennae:{cat:'antenna'}, Mecha_Antennae:{cat:'antenna'},
  Cogwheel:{cat:'cogwheel'}, Battery:{cat:'battery'},
  Ankh:{cat:'ankh'}, Paranormal_Goggles:{cat:'goggles'},
  // ---- 纯透明素材的花瓣（wiki 没有卡片图，只有实体/图标图）----
  Poo:{cat:'melee',p:0.7},                // 便便
  Soil:{cat:'melee',p:0},                 // 土壤：官方卡面有 Damage → 近战可攻击；p:0 归零基础值，数值走官方表
  Wax:{cat:'wax',p:0},
  Sawblade:{cat:'melee',p:1.0},           // 锯片：高速旋转的近战花瓣
  Bubble:{cat:'melee',p:0},               // 泡泡：无伤害；第一冷却结束破裂，把花推向花瓣方向                    // 蜡：不围绕花朵、不占轨道位；冷却好了在花旁释放蜡召唤物
  Pearl:{cat:'shield',p:1.5},             // 珍珠
  Pollen:{cat:'melee',p:0.8},             // 花粉
  Peas:{cat:'melee',p:0.9},               // 豌豆
  Square:{cat:'melee',p:1.6},             // 正方形（稀有特殊）
  Stick:{cat:'melee',p:1.1},              // 树枝
  Bulb:{cat:'melee',p:0.7},               // 灯泡
  Crystal:{cat:'shield',p:1.4},           // 水晶

  // ---- 新导入的官方卡片花瓣 ----
  // 分类/强度先按原作定位放占位，具体技能（毒/减速/暴击/复生…）由用户后续补齐
  Stinger:{cat:'melee',p:2.0},            // 蜂刺：高伤近战
  Blood_Stinger:{cat:'melee',p:2.6},      // 血刺：更狠的刺，带流血/自伤（待实现）
  Web:{cat:'melee',p:1.0},                // 蛛网：低伤 + 减速（待实现）
  Triangle:{cat:'melee',p:2.4},           // 三角：正方形上位版，极高单体伤害
  Yin_Yang:{cat:'melee',p:2.0},           // 阴阳：攻守兼备
  Monstera:{cat:'melee',p:2.2},           // 龟背竹：大范围挥击（待实现）
  Yucca:{cat:'melee',p:1.4},              // 丝兰：荒漠近战
  Mysterious_Stick:{cat:'melee',p:1.6},   // 神秘木棍：特殊效果（待实现）
  Third_Eye:{cat:'goggles',p:0.9},        // 第三只眼：视野/侦测（待实现）
  Talisman_of_Evasion:{cat:'shield',p:1.2}, // 避邪符：闪避（待实现）
  Starfish:{cat:'shield',p:1.2},          // 海星：护盾/回复（待实现）
  Sponge:{cat:'heal',p:1.9},              // 海绵：吸收伤害并转化为治疗
  Tomato:{cat:'heal',p:3.0},              // 番茄：高频治疗
  Totem:{cat:'heal',p:3.6},               // 图腾：大治疗 + 持续恢复
  Yggdrasil:{cat:'heal',p:10.0},          // 世界树：最强治疗 / 复活
  Orange:{cat:'melee',p:1.1},             // 橙子（黄蜂掉落）
  Shovel:{cat:'melee',p:0.8},             // 铁锹（蚁穴掉落）
  Wing:{cat:'speed',p:1.0}                // 翅膀：提高转速/移速
};

// ============================================================
//  卡面描述（鼠标悬停在花瓣卡片上显示的英文小传）
//  照原作卡面语气写；没单列的按分类给一句，保证每张卡都有话
// ============================================================
const PETAL_DESC = {
  Air: "It's literally nothing.",
  Amulet: "Converts a percentage of overheal into shields.",
  Ankh: "An ancient relic.\nWhen destroyed, will teleport the flower back to where it was destroyed.",
  Ant_Egg: "Something interesting might pop out of this.",
  Antennae: "Allows your flower to sense foes farther away.",
  Bandage: "Turns the flower Undead for a limited time on death.\nDelays death until expiration.\nFlower Body Damage is reduced during this period.\nPrevents revival for some time afterwards.",
  Basic: "A nice petal, not too strong but not too weak.",
  Basil: "Increases all healing received.",
  Battery: "Discharges electricity whenever the flower gets hit.",
  Bean: "Deals more damage if there are no allied flowers around you.",
  Beetle_Egg: "Something interesting might pop out of this.",
  Blood_Stinger: "It really hurts, but it's very fragile.\nDeals damage to self when spawned.",
  Blueberries: "It goes poof. Now with the extra secret ingredient: lightning.",
  Bone: "Sturdy. Loses half of its armor each hit.",
  Broccoli: "Explodes when it hits something. For reasons unknown.",
  Bubble: "Physics are for the weak.",
  Bulb: "A shiny lightbulb. Draws aggro from mobs.",
  Bur: "Decreases armor of affected unit. Does not stack with itself.",
  Cactus: "Not very strong, but somehow increases your maximum health.",
  Card: "A playing card. Likely marked.",
  Carrot: "Sturdy and reliable. Can be shot and bounces off walls.",
  Champion_Crown: "Gives flowers around you a  .\nYou receive credit for damage dealt using it.",
  Claw: "Deals extra damage if the victim is above 80% health.\n-50% damage vs other flowers.",
  Clay: "It sticks to dust in the air to get bigger and stronger.",
  Clover: "Increases your luck.",
  Cogwheel: "Doesn't seem to do much...",
  Coin: "The power of capitalism compels you!",
  Compass: "This crappy thing might be able to find something interesting...",
  Coral: "Breaks apart on impact.\nEach piece has 50% of the stats of the predecessor.",
  Corn: "Takes a long time to spawn, but has a lot of health.",
  Corruption: "Corrupts one's soul, turning them against their own kind.",
  Cotton: "Absorbs damage taken by the flower.",
  Cutter: "A friend used to own this... now it's time for revenge.\nIncreases body damage.",
  Dahlia: "A small amount of heal but fairly consistent.",
  Dandelion: "Its interesting properties inhibits healing effects on affected units.\nAffected units have their healing reduced by 20%. Stacks with itself.",
  Dark_Mark: "A dark mark that binds itself to a fallen soul.",
  Dead_Leaf: "Increases petal health but makes them reload slower.",
  Dice: "Has a 5% chance of dealing 35x damage.\nChance increases by 4% per point in luck.",
  Disc: "Reduces damage taken from collisions with mobs and flowers.",
  Domino: "Damage depends on how many dots it has.",
  Dust: "Sometimes it sticks together, sometimes it doesn't.",
  Electric_Web: "It's a little less sticky, but a bit more shocking.",
  Fang: "Heals based on damage dealt by this petal.",
  Faster: "It's so light it makes your other petals spin faster.",
  Glass: "Phases through enemies.\nCannot damage enemies more often than a certain interval.",
  Golden_Leaf: "A very special leaf, seems to allow you to use your other petals even more.",
  Sawblade: "This looks like it'd hurt.",
  Bubble: "Physics are for the weak.",
  Grapes: "It goes poof. Now with a secret ingredient: poison.",
  Heavy: "This thing is so heavy that nothing gets in the way.\nSlows down petal rotation speed when equipped.",
  Honey: "Mobs love this. Attracts them in a large radius.\nMobs will prioritize this over flowers.\nAffected units develop immunity to its effects after some time.",
  Iris: "Very poisonous, but takes a little while to do its work.\n-50% damage vs other flowers.",
  Jelly: "No one likes touching this.",
  Laser: "Pew pew.",
  Leaf: "Gathers energy from the sun to heal your flower passively.",
  Lentil: "Increases petal attraction to enemies.",
  Light: "Weaker than most petals, but recharges very quickly.",
  Lightning: "Strikes several nearby enemies.",
  Lotus: "Absorbs poison damage taken by the flower.",
  Magic_Bubble: "Physics are for the magicless.",
  Magic_Cactus: "Increases maximum mana capacity.",
  Magic_Cotton: "Absorbs damage taken by the flower.",
  Magic_Eye: "Consumes half the current mana and deals damage based on that value.",
  Magic_Leaf: "Gathers mana from the environment passively.",
  Magic_Missile: "You can actually shoot this one... with magic.",
  Magic_Stick: "A mysterious stick that summons the forces of the wind... with magic.",
  Magic_Stinger: "It really hurts, but it's very fragile.",
  Magnet: "Increases drop pick up range.",
  Mecha_Antennae: "Allows your flower to sense foes farther away.\nAnd it has a blinking red light on top.",
  Mecha_Missile: "Locked on.",
  Mimic: "Copies the petal to the left of this, with the same rarity as this.",
  Missile: "You can actually shoot this one.",
  Mjolnir: "/Description#Petals/mjolnir/default/Description}",
  Monstera: "Heals flowers around it.\nEffect fades out with distance to petal.",
  Moon: "This thing is so big your petals orbit it instead.\nWhere did you find this anyway?",
  Mysterious_Powder: "Increases movement speed.\nDisabled if flower takes damage or if near a mob higher than a certain rarity.",
  Mysterious_Relic: "A strange relic. Significantly increases maximum health.\nDamage taken is spread among other wearers.",
  Mysterious_Stick: "A mysterious stick that summons the forces of the wind.",
  Nazar: "When the flower receives damage, reduces it by 98% and consumes a charge.",
  Orange: "A sweet citrus fruit.",
  Orb: "Creates mana.",
  Paranormal_Goggles: "Allows finding some paranormal activity.",
  Pearl: "Just drop it off somewhere and use your kinetic powers so you don't lose it.",
  Peas: "It goes poof.",
  Pharaoh_Crown: "Spawns Undead Beetles to fight at your side.",
  Pincer: "Debilitates enemies temporarily, reducing their movement speed.",
  Plank: "Does 20x damage vs projectiles and petals.",
  Poker_Chip: "ALL IN.",
  Pollen: "Asthmatics beware.",
  Poo: "Makes mobs less likely to want to attack you.",
  Privet: "Deals extra poison damage based on the existing poison damage per second.",
  Rice: "Spawns very quickly, but not very strong.",
  Rock: "Extremely durable, but takes a bit longer to recharge.",
  Root: "Provides a layer of additional armor every interval, a layer is removed each time damage is taken.",
  Rose: "Its healing properties are amazing. Not so good at combat though.",
  Rubber: "Increases knockback received. Also absorbs lightning damage dealt to the flower.",
  Sacrifice: "On death, summons a mob to fight again.\nMob type depends on where the sacrifice happens.\nCannot be used in low mob rarity areas.",
  Salt: "Reflects some of the damage you take back to the enemy that dealt it.\nHigher rarity mobs have higher resistance to damage reflection.",
  Sand: "A bunch of sand particles.",
  Sawblade: "This looks like it'd hurt.",
  Bubble: "Physics are for the weak.",
  Shell: "Adds a temporary shield to yourself or allies.",
  Shovel: "Becomes untargetable but unable to use petals for a limited time.",
  Soil: "Increases health, but also increases flower size and decreases movement speed.",
  Splitter: "#Petals/splitter/Description/default}",
  Sponge: "Spreads damage taken by the flower over a period of time.\nIf destroyed, deals remaining damage all at once.\nDoes not delay poison damage.",
  Square: "This shape... it looks familiar...",
  Starfish: "Increases health regen while below 75% health.",
  Stinger: "It really hurts, but it's very fragile.",
  Talisman_of_Evasion: "A necklace that allows the wearer to anticipate enemy attacks.",
  Third_Eye: "Allows your flower to expand your petals further out.",
  Tomato: "Gets stronger over time.",
  Totem: "Grants health regen for a certain duration after killing a mob.",
  Triangle: "Each copy of this petal equipped grants additional damage to it.",
  Uranium: "Periodically releases radiation.\n-75% damage versus other flowers.\nEffect strength depends on distance to petal.",
  Wax: "Don't ask where it came from.",
  Web: "It's really sticky.",
  Wing: "It comes and goes.",
  Yggdrasil: "A dried leaf from the Yggdrasil tree.\nRumored to be able to bring the fallen back to life.",
  Yin_Yang: "This mysterious petal affects the rotation of your petals in unpredictable ways.",
  Yucca: "Heals your flower but only while in the defensive position.",
};



// Category base stats (before rarity + power scaling)
// dur    = 耐久：被怪撞掉之后花瓣碎掉、进入冷却，冷却结束才重新长出来（原作机制）
// reload = 冷却（毫秒）：每打一次要等这么久，数值越大越慢
const CAT_BASE = {
  melee:    {dmg: 12.5, dur: 62, reload: 520},
  ranged:   {dmg: 22, dur: 48, reload: 850},
  // heal：每撞到一次生物就回 heal 点血；regen 是常驻的缓慢回复
  heal:     {heal: 1, regen: 0.5, dur: 70, reload: 1000},
  shield:   {shield: 45, dur: 78, reload: 1100},
  speed:    {speed: 0.22, dur: 70},
  magnet:   {magnet: 60, dur: 70},
  antenna:  {range: 10, dur: 70},
  cogwheel: {spin: 0.5, dur: 70},
  battery:  {dmgMult: 0.18, dur: 70},
  ankh:     {dur: 60},
  goggles:  {xpMult: 0.6, dur: 60}
};

// ============================================================
//  每个花瓣的冷却（秒）—— 来源：official-florrio.fandom.com / florrio.fandom.com 花瓣属性表
//  标 [wiki] 的是直接查到的数值；标 [估] 的是 wiki 没有单独列出、按同类量级补的。
//  Antennae / Third_Eye 这类纯功能花瓣没有冷却，写 0。
// ============================================================
// ============================================================
//  官方卡面数值（普通稀有度），来源：florrio 中文维基「花瓣」属性表
//    Basic 10/10 2.5s | Light 13/5 0.8s | Rock 22/30 3.0s | Square 60s
//    Rose 5/5 治疗7.5 3.5s | Stinger 100/1 10s | Iris 5/5 毒70 4s | Wing 20/10 3s
//  伤害/耐久/治疗 每级 ×3（毒也是 ×3），冷却不随稀有度变
//  没列出的花瓣继续按分类基础值 × 强度估算
// ============================================================
const PETAL_STAT = {
  Basic:  {dmg:10,  hp:10, cd:2.5},
  Light:  {dmg:13,  hp:5,  cd:0.8},
  // 官方卡面：Damage = Health = 10 起每级 ×3；Flower Health = 50 起每级 ×3；Flower Radius 固定 +10
  Soil:   {dmg:10,  hp:10, cd:2.5},
  // 官方卡面：Damage 16 / Health 12 起每级 ×3；Reload -2.5% 起每级 +2.5%（Unique=Eternal 封顶 -22.5%）
  Golden_Leaf: {dmg:16, hp:12, cd:2.5},
  // 官方卡面：Damage 40 / Health 25 起每级 ×3（Unique=Eternal 262k/164k）
  Sawblade: {dmg:40, hp:25, cd:2.5},
  // 官方卡面：Health 1；冷却为「第一冷却 + 第二冷却(↻)」两段；Mythic 未给卡，插值 0.8+0.2
  Bubble: {hp:1},
  // 官方卡面（Common 12/5，之后 ×3 逐级：36/108/324/972/2.9k/8.7k/26.2k/78.7k）
  Faster: {dmg:12,  hp:5,  cd:2.5},
  // [wiki zh] Rock: 2 伤害 / 230 耐久 / 3.0s（极高耐久，几乎打不动）
  Rock:   {dmg:2,   hp:230, cd:3.0},
  Rose:   {dmg:5,   hp:5,  cd:3.5, heal:7.5},
  Stinger:{dmg:100, hp:1,  cd:10.0},
  Iris:   {dmg:5,   hp:5,  cd:4.0, poison:70},
  Wing:   {dmg:20,  hp:10, cd:3.0},
  Leaf:   {dmg:16,  hp:12, cd:1.8, regen:1},      // [wiki] Leaf: 16 伤害 / 12 耐久 / 1.8s / 每秒回 1
  Lentil: {dmg:13,  hp:12, cd:2.0, attract:8},    // [wiki] Lentil: 13/12/2s；吸附 +8，每级再 +8（→+16…+72）
  // [wiki] Corn: 5 伤害 / 300 耐久 / 10s（官方 wiki Petal Stats 表 Common 栏）
  //        维基原话「高耐久 + multi-hitting」，靠持续接触打输出，冷却只是碎掉后的重生时间
  Corn:   {dmg:8,   hp:200, cd:7.0},
  // [wiki] Pollen: 38 伤害 / 5 耐久 / 2.0+0.5s；攻击后脱落在原地停留 5 秒继续造成伤害
  //        Rare 起分裂成 2 片、Epic 起 3 片
  Pollen: {dmg:3,   hp:8,  cd:2.0},
  // [wiki] Peas: 每颗 15 伤害 / 5 耐久，一次分裂 4 颗射出，1.5+0.5s
  Peas:   {dmg:15,  hp:5,  cd:1.5},
  // [wiki] Cactus 5/15/1s + 最大生命 +20%
  Cactus: {dmg:7,   hp:15, cd:1.0},
  // [wiki] Dandelion 5/10/2s，命中后 10s 内无法回血
  Dandelion:{dmg:8, hp:8,  cd:1.0},
  // [wiki] Clay 5~70（随移动距离）/10/2s
  Clay:   {dmg:5,   hp:10, cd:2.0},
  // [wiki] Domino 0~36（随机）/16/1s
  Domino: {dmg:18,  hp:16, cd:1.0},
  // [wiki] Bubble 无伤害 / 1 耐久 / 3.5s，右键戳破弹射
  Bubble: {dmg:1,   hp:1,  cd:2.0},
  // [wiki] Bone 14 伤害，护甲 10（每次受击减半）
  Bone:   {dmg:14,  hp:20, cd:1.2},
  // [wiki] Broccoli 15 伤害 / 10 耐久 / 2.8s，命中炸出 3 颗碎粒（每颗 5 伤害）
  Broccoli:{dmg:15, hp:10, cd:2.8},
  // [wiki] 铁片 10 伤害，命中时高概率不掉耐久
  Poker_Chip:{dmg:10, hp:12, cd:1.0},
  // [wiki] Amulet 0 伤害 / 10 耐久 / 1.6s，溢出治疗转护盾
  Amulet: {dmg:0,   hp:10, cd:1.6},
  // [wiki] Ankh 0 伤害 / 10 耐久（重生时间随稀有度 257s→1s，这里取中段）
  Ankh:   {dmg:0,   hp:10, cd:16}
};

const PETAL_RELOAD = {
  // --- 有明确 wiki 数值 ---
  Basic: 2.5,          // [wiki] Basic 2.5s
  Light: 0.8,          // [wiki] Light 0.8s
  Heavy: 5.5,          // [wiki] Heavy 5.5s
  Square: 60,          // [wiki] Square 60s
  Rose: 3.5,           // [wiki] Rose 3.5s + 1.5s 激活延迟
  Stinger: 10,         // [wiki] Stinger 10s
  Blood_Stinger: 5,    // [wiki] 冷却为 Stinger 的一半
  Iris: 4,             // [wiki] Iris 4.0s
  Wing: 3,             // [wiki] Wing 3.0s
  Leaf: 1.8,           // [wiki] Leaf 1.8s
  Bubble: 3.5,         // [wiki] Bubble 3.5s
  Cactus: 1,           // [wiki] Cactus 1s
  Dandelion: 2,        // [wiki] Dandelion 2s
  Faster: 2.5,         // 官方卡面 2.5s
  Honey: 1.7,          // [wiki] Honey 1.7s
  Missile: 3,          // [wiki] Missile 3s
  Peas: 1.4,           // [wiki] Peas 1.4s
  Salt: 2.5,           // [wiki] Salt 2.5s
  Web: 3,              // [wiki] Web 3s
  Corn: 10,            // [wiki] Corn 10s（旧版维基写的 35/45s 已过时）
  Ant_Egg: 1.5,        // [wiki] Egg 1.5s
  Beetle_Egg: 1.5,     // [wiki] Egg 1.5s
  Rice: 0.04,          // [wiki] Rice 0.04s（几乎无冷却）
  Yin_Yang: 1,         // [wiki] Yin Yang 1s
  Antennae: 0,         // [wiki] 无冷却 / 无耐久
  Mecha_Antennae: 0,   // [wiki] 同上
  Ankh: 16,            // [wiki] 按稀有度 257s→1s，取中段

  // --- 按同类量级补（wiki 未单列）---
  Fang: 0.6, Claw: 0.5, Cutter: 0.6, Dahlia: 0.4,
  Carrot: 1.0, Grapes: 1.2, Broccoli: 0.8, Clover: 0.6,
  Lentil: 2.0,         // [wiki] Lentil 2s
  Cotton: 0.5, Dark_Mark: 1.0, Fragment: 0.9,
  Dead_Leaf: 0.8, Golden_Leaf: 0.9, Coral: 0.7,
  Disc: 0.3, Coin: 0.3, Dice: 0.6, Domino: 0.5, Card: 0.5, Poker_Chip: 0.6,
  Light_Bulb: 0.7, Bulb: 0.7, Bone: 0.9, Lotus: 1.2, Mimic: 1.0, Corruption: 1.5,
  Poo: 0.5, Soil: 1.0, Pearl: 1.5, Pollen: 1.0, Stick: 0.5,
  Mysterious_Stick: 1.0, Triangle: 0.8, Monstera: 1.0,
  Mecha_Missile: 2.0, Lightning: 1.5, Laser: 2.0,
  Bandage: 1.0, Jelly: 1.2, Basil: 1.5, Bean: 2.0, Amulet: 1.5,
  Sponge: 2.0, Tomato: 1.0, Totem: 2.5, Yggdrasil: 10, Yucca: 2.0, Starfish: 1.5,
  Glass: 1.5, Clay: 2.5, Air: 0.2, Compass: 1.0, Dust: 0.5,
  Crystal: 2.0, Talisman_of_Evasion: 1.5,
  Magnet: 0.5, Cogwheel: 0.5, Battery: 0.5,
  Paranormal_Goggles: 0.5, Third_Eye: 0
};


//   磁力       magnet  吸附半径 +px      移速    speed   移速 +%
//   环绕       range   环绕半径 +px      转速    spin    转速 +rad/s
//   伤害       dmgMult 伤害倍率 +       经验    xpMult  经验倍率 +
//   攻击距离   reach   攻击距离 +px      耐久    dur     额外耐久 +
//   中毒       poison  每秒毒伤(dps)     减速    slow    被命中的怪减速 0..1
//   虚弱       weaken  被命中的怪伤害 -% 吸血    leech   造成伤害的 x 转为治疗
//   击退       knock   击退像素          暴击    crit    暴击概率（×2 伤害）
//   反伤       thorn   接触反伤比例      治疗    heal    额外回血
//   持续回复   regen   每秒回血          挑衅    provoke 命中即拉仇恨
//   便便       poo     便便光环：周围怪失去仇恨并减速
//   穿透       pierce  投射物可穿透数量  复活    revive  免死一次
// ============================================================
const PETAL_FX = {
  // ---- 功能型 ----
  Lentil:      {attract: 8},               // [wiki] 小扁豆：+8 花瓣吸附敌人范围（不是掉落物吸附！）
  Cotton:      {magnet: 14, slow: 0.15},  // 棉花：吸附 + 轻微减速
  Wing:        {speed: 0.10, spin: 0.18}, // 翅膀：更快转圈 + 移速
  Magnet:      {magnet: 40},              // 磁铁
  Antennae:    {range: 26, reach: 12},    // 触角：更大的活动范围
  Mecha_Antennae:{range: 40, reach: 22},
  Cogwheel:    {spin: 0.9},
  Battery:     {dmgMult: 0.22},
  Paranormal_Goggles:{xpMult: 0.9},
  Third_Eye:   {range: 18, xpMult: 0.3},
  Ankh:        {dur: 40, revive: 1},
  Talisman_of_Evasion:{dur: 25},
  Poo:         {poo: 170, slow: 0.3},     // 便便：驱散仇恨 + 减速
  // ---- 毒 / 减速 / 吸血 / 暴击 / 击退 ----
  Cactus:      {poison: 4, thorn: 0.5},   // 仙人掌：带毒 + 反伤
  Iris:        {poison: 9},               // 鸢尾：强毒
  Dead_Leaf:   {poison: 5},
  Web:         {slow: 0.55},              // 蛛网：命中即大幅减速
  Bur:         {slow: 0.25},
  Salt:        {poison: 3, slow: 0.15},
  // [wiki] Corn：靠高耐久穿透/多段命中，并有不错的击退（"It also deals decent knockback"）
  Corn:        {knock: 26},
  Carrot:      {dur: 60},
  Heavy:       {knock: 30},
  Dandelion:   {knock: 16},
  Blood_Stinger:{leech: 0.35},            // 血刺：打多少回多少
  Dark_Mark:   {leech: 0.20},
  Corruption:  {leech: 0.30},
  Fang:        {leech: 0.12},
  Claw:        {crit: 0.15},
  Cutter:      {crit: 0.12},
  Fragment:    {crit: 0.25},
  Disc:        {crit: 0.20},
  Dice:        {crit: 0.30},
  Poker_Chip:  {crit: 0.20},
  Card:        {crit: 0.25},
  Triangle:    {crit: 0.18},
  Grapes:      {crit: 0.10},
  // ---- 恢复型 ----
  Rose:        {regen: 0.6},
  Bandage:     {dur: 40, regen: 0.55},    // 绷带：更耐打 + 持续回血
  Basil:       {regen: 0.8},
  Jelly:       {regen: 0.5, speed: 0.03},
  Bean:        {regen: 0.4},
  Amulet:      {regen: 0.35},
  Honey:       {regen: 0.55, slow: 0.2},  // 蜂蜜：持续回血 + 减速敌人
  Sponge:      {heal: 3, regen: 0.4},     // 海绵：额外治疗
  Tomato:      {heal: 2, regen: 0.5},
  Totem:       {heal: 4, regen: 1.0},
  Yggdrasil:   {heal: 12, regen: 2.0, dur: 120, revive: 1},
  Lotus:       {regen: 0.6},
  // ---- 盾 ----
  Glass:       {dur: -30, shield: 22},    // 玻璃：盾更厚但更脆
  Bubble:      {dur: -20, shield: 30},
  Clay:        {shield: 14},
  Crystal:     {shield: 12},
  Pearl:       {shield: 10},
  Starfish:    {shield: 8, regen: 0.5},
  // ---- 远程 ----
  Missile:     {pierce: 1},
  Mecha_Missile:{pierce: 2},
  Lightning:   {pierce: 1},
  Laser:       {pierce: 3},
  // ---- 挑衅 / 杂项 ----
  Light_Bulb:  {provoke: 1},              // 灯泡：命中即把怪拉过来
  Bulb:        {provoke: 1},
  Clover:      {xpMult: 0.25},            // 三叶草：经验加成
  Coin:        {xpMult: 0.15},
  Mysterious_Stick:{provoke: 1, dmgMult: 0.05},
  Monstera:    {reach: 14},
  Yucca:       {thorn: 0.35},
  Coral:       {thorn: 0.35},
  Bone:        {dur: 20}
};


let MANIFEST = (typeof window!=='undefined' && window.MANIFEST_DATA)
  ? window.MANIFEST_DATA
  : {rarities:RARITIES, petals:{}};
const IMG_CACHE = {};

// 透明素材优先表（不随稀有度变化，一张图通用所有稀有度）
//  - petals_trans/  9 张 wiki 图（部分带绿底）
//  - mobs_trans/    透明实体图（Poo/Pearl/Stinger 等，真正的透明底）
const TRANS_PETALS = {
  // from petals_trans (wiki icons)
  Amulet:'assets/petals_trans/Amulet.png', Ankh:'assets/petals_trans/Ankh.png',
  Basic:'assets/petals_trans/Basic.png', Battery:'assets/petals_trans/Battery.png',
  Bean:'assets/petals_trans/Bean.png', Beetle_Egg:'assets/petals_trans/Beetle_Egg.png',
  Bone:'assets/petals_trans/Bone.png', Broccoli:'assets/petals_trans/Broccoli.png',
  Bur:'assets/petals_trans/Bur.png',
  // from mobs_trans (真透明)
  Poo:'assets/mobs_trans/Poo.webp', Pearl:'assets/mobs_trans/Pearl.webp',
  Stinger:'assets/mobs_trans/Stinger.png', Soil:'assets/petals_trans/Soil.png',
  Blood_Stinger:'assets/mobs_trans/Blood_Stinger.png',
  Pollen:'assets/mobs_trans/Pollen.webp', Peas:'assets/mobs_trans/Peas.webp',
  Square:'assets/mobs_trans/Square.webp', Stick:'assets/mobs_trans/Stick.webp',
  Rock:'assets/petals_trans/Rock.png',
  Rice:'assets/petals_trans/Rice.png', Shovel:'assets/petals_trans/Shovel.png',
  Bulb:'assets/mobs_trans/Bulb.webp', Compass:'assets/mobs_trans/Compass.webp',
  Crystal:'assets/mobs_trans/Crystal.webp',
  Corn:'assets/petals_trans/Corn.png',
  Sawblade:'assets/petals_trans/Sawblade.png',
  Bubble:'assets/petals_trans/Bubble.png',
  Golden_Leaf:'assets/petals_trans/Golden_Leaf.png',
  Leaf:'assets/petals_trans/Leaf.png'
};

// file:// 下 canvas 会被「污染」，getImageData 直接抛 SecurityError；
// 而花瓣去底必须读像素，所以这些图优先走 assets_inline.js 里的 data: URL
// （同源，不污染）。起 http 服务器时没有 INLINE_IMG，仍然用普通路径。
function assetURL(p){
  const m = (typeof window!=='undefined') && window.INLINE_IMG;
  return (m && m[p]) ? m[p] : p;
}

// 世界里的花瓣（环绕/地面掉落）用去底透明图
function petalImagePath(name, rarity){
  // Clover：叶片数量随稀有度变化（Common 3 / Unusual 4 / Rare 5 / Epic+ 6）
  if(name === 'Clover'){
    const ri = Math.max(0, RARITIES.indexOf(rarity));
    const tier = ri<=0 ? 'Common' : ri===1 ? 'Unusual' : ri===2 ? 'Rare' : 'Epic';
    return 'assets/petals_trans/Clover_' + tier + '.png';
  }
  if(TRANS_PETALS[name]) return TRANS_PETALS[name];
  return petalCardPath(name, rarity);
}

// 状态栏/背包里的图标用原版不透明卡片图（稀有度底色 + 名字）
// 缺某个稀有度的卡时取「最接近且已有的那张」（优先往下取），避免直接跌回最低级
function nearestRarity(name, r){
  const avail = MANIFEST.petals && MANIFEST.petals[name];
  if(!avail || !avail.length) return r;
  if(avail.indexOf(r) >= 0) return r;
  const ladder = RARITIES.length ? RARITIES : avail;
  const want = ladder.indexOf(r);
  if(want < 0) return avail[0];
  let best = null, bestD = 1e9;
  for(const a of avail){
    const d = ladder.indexOf(a);
    if(d < 0) continue;
    // 同距离时优先低一级（拿得到的强者），保证 Super 不会被换成 Common
    const score = Math.abs(d - want) * 2 + (d > want ? 1 : 0);
    if(score < bestD){ bestD = score; best = a; }
  }
  return best || avail[0];
}

function petalCardPath(name, rarity){
  // 关键：这一档的官方卡面文件存在时，必须原样用它。
  // 以前一律过 nearestRarity（它只看 manifest，而 manifest 里很多花瓣没列 Eternal），
  // 结果 Eternal 被「最近邻」映射成了 Super 卡 —— 这就是之前一直显示 Super 的原因。
  const use = hasCardFile(name, rarity) ? rarity : nearestRarity(name, rarity);
  return `assets/${name}_(${use}).webp`;
}

function getPetalImage(name, rarity){
  const key = name+'_'+rarity;
  if(IMG_CACHE[key]) return IMG_CACHE[key];
  const img = new Image();
  img.src = assetURL(petalImagePath(name, rarity));
  IMG_CACHE[key] = img;
  return img;
}

// 卡面（带稀有度底色 + 名字的整张卡片）。掉落物 / 槽位 / 图鉴走这条，
// 跟「环绕时的裸花瓣」分开缓存——之前掉落物误用了裸花瓣的取图函数，
// 所以 Stinger 掉在地上显示的是一根透明刺而不是卡片。
const CARD_CACHE = {};
function getPetalCard(name, rarity){
  const key = 'C:' + name + '_' + rarity;
  if(CARD_CACHE[key]) return CARD_CACHE[key];
  const img = new Image();
  // 注意：这里以前直接用 petalCardPath，会跳过「Eternal / Unique 现拼卡」的逻辑，
  // 导致这两种掉落物还是 Super 卡面 —— 统一走 petalIconSrc
  img.src = assetURL(petalIconSrc(name, rarity));
  CARD_CACHE[key] = img;
  return img;
}

// ------------------------------------------------------------------
//  Turn a wiki icon (rounded rarity card + petal + name text) into a
//  bare transparent petal sprite, so orbiting petals look like florr.
//  Steps: detect the two background shades -> flood them out from the
//  border -> soften the anti-aliased fringe -> cut away the name text
//  band -> crop to the petal bounding box.
// ------------------------------------------------------------------
const PSPRITE = {};        // petal name -> {cv, size, w, h}
const PSPRITE_BAD = {};    // petal name -> true (gave up, fall back to the icon)

// ------------------------------------------------------------------
//  Peas / Pollen 的合成贴图
//  素材包里只有一个「单颗」的透明小圆（Peas = 带深绿环的绿圆、
//  Pollen = 带金环的黄圆），这里按卡面的排布拼：
//    Peas   —— 4 颗，上下左右摆成四叶草（卡面就是这样）
//    Pollen —— 1 颗 / 2 颗 / 3 颗，按稀有度递增（Unusual 1、Rare 2、Epic+ 3）
// ------------------------------------------------------------------
const COMPOSE_CACHE = {};
function composePetals(name, rarity){
  const key = name + '|' + rarity;
  if(COMPOSE_CACHE[key]) return COMPOSE_CACHE[key];
  const el = getPetalImage(name, rarity);
  if(!el || !el.complete || !el.naturalWidth) return null;   // 还在解码，下一帧再拼
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  // 画布要「填满」：环绕时按正方形边长缩放，留白多就会显得比别的花瓣小
  let R, off, pts;
  if(name === 'Peas'){
    R = S * 0.240; off = S * 0.262;   // 按 Peas 卡面实测：并集外径 = off+R = 0.5S
    pts = [[0,-off], [off,0], [0,off], [-off,0]];
  } else {
    const i = RARITIES.indexOf(rarity);
    const n = i <= 1 ? 1 : (i === 2 ? 2 : 3);
    if(n === 1){ R = S*0.40; off = 0; pts = [[0,0]]; }
    else if(n === 2){ R = S*0.305; off = S*0.305; pts = [[-off,0],[off,0]]; }
    else { R = S*0.265; off = S*0.30;
           pts = [[-off*0.88,-off*0.52], [off*0.88,-off*0.44], [0,off*0.92]]; }
  }
  // Super 及以上：每颗 pea 外面裹一圈光晕 + 几点亮粒子（原作高级花瓣的粒子感）
  const sup = RARITIES.indexOf(rarity) >= RARITIES.indexOf('Super');
  if(sup){
    for(const [x,y] of pts){
      const gx = S/2 + x, gy = S/2 + y;
      const gr = g.createRadialGradient(gx, gy, R*0.55, gx, gy, R*2.3);
      gr.addColorStop(0,   'rgba(255,255,255,.18)');
      gr.addColorStop(.45, 'rgba(120,255,205,.14)');
      gr.addColorStop(1,   'rgba(120,255,205,0)');
      g.fillStyle = gr;
      g.beginPath(); g.arc(gx, gy, R*2.3, 0, 6.283); g.fill();
    }
  }
  for(const [x,y] of pts) g.drawImage(el, S/2 + x - R, S/2 + y - R, R*2, R*2);
  if(sup){
    for(const [x,y] of pts){
      for(let k=0;k<3;k++){
        const a = k*2.09 + (x+y)*0.05;
        const rr = R*1.55;
        g.beginPath();
        g.arc(S/2 + x + Math.cos(a)*rr, S/2 + y + Math.sin(a)*rr, S*0.022, 0, 6.283);
        g.fillStyle = 'rgba(255,255,255,.95)';
        g.fill();
      }
    }
  }
  const sp = {cv, size: S, w: S, h: S};
  COMPOSE_CACHE[key] = sp;
  return sp;
}


// 透明素材不区分稀有度：同一花瓣的所有稀有度共用一张去底图，
// 所以缓存只按名字（而不是 name+rarity）走，并且固定用最低可用稀有度的
// 那张图去底，结果对任何稀有度都完全一致。
function petalSprite(name, rarity){
  // Peas / Pollen：素材包里只有一个「单颗」的透明图，按卡面的形状与颗数自己拼
  if(name === 'Peas' || name === 'Pollen'){
    const cp = composePetals(name, rarity);
    if(cp) return cp;
  }
  if(PSPRITE[name]) return PSPRITE[name];
  if(PSPRITE_BAD[name]) return null;
  const avail = MANIFEST.petals && MANIFEST.petals[name];
  if(!avail || !avail.length){
    // 素材包没收录这张卡：先试代码画的矢量图标，
    // 没有手绘图就继续往下走「上传的透明素材」那条路
    const pp = buildProcPetal(name);
    if(pp){ PSPRITE[name] = pp; return pp; }
  }
  const srcRarity = (avail && avail.length) ? avail[0] : rarity;
  const img = getPetalImage(name, srcRarity);
  if(!img.complete) return null;               // still loading, retry later
  if(!img.naturalWidth){ PSPRITE_BAD[name]=1; return null; }
  const sp = buildPetalSprite(img);
  if(sp) PSPRITE[name] = sp; else PSPRITE_BAD[name] = 1;
  return sp;
}

function buildPetalSprite(_img){
  let img = _img;
  let W0 = img.naturalWidth, H0 = img.naturalHeight;   // 可能会被下面的「裁掉透明边」改写
  if(W0 < 12 || H0 < 12) return null;
  const cv = document.createElement('canvas');
  cv.width = W0; cv.height = H0;
  const g = cv.getContext('2d', {willReadFrequently:true});
  g.drawImage(img, 0, 0);
  let id;
  try { id = g.getImageData(0, 0, W0, H0); } catch(e){ return null; }
  let d = id.data;
  // 有些卡片四周带透明边（圆角 + 留白）：先把这圈透明边裁掉再判，
  // 否则「边缘全透明」会被误判成「透明素材」，整张卡原样留下来（米 / 铲子就是这样）
  {
    let bx0 = W0, by0 = H0, bx1 = -1, by1 = -1;
    for(let y=0; y<H0; y++){
      const base = y*W0*4;
      for(let x=0; x<W0; x++){
        if(d[base + x*4 + 3] > 8){
          if(x < bx0) bx0 = x; if(x > bx1) bx1 = x;
          if(y < by0) by0 = y; if(y > by1) by1 = y;
        }
      }
    }
    if(bx1 > bx0 && by1 > by0 && (bx0 > 2 || by0 > 2 || bx1 < W0-3 || by1 < H0-3)){
      const w2 = bx1-bx0+1, h2 = by1-by0+1;
      const c2 = document.createElement('canvas');
      c2.width = w2; c2.height = h2;
      const g2 = c2.getContext('2d', {willReadFrequently:true});
      g2.drawImage(img, -bx0, -by0);
      try {
        id = g2.getImageData(0, 0, w2, h2);
        d = id.data;
        img = c2;
        W0 = w2; H0 = h2;
      } catch(e){ /* 读不了就保持原样 */ }
    }
  }

  // ---- 1. is this a "rarity card" icon, or already transparent art? ----
  // a card touches the image border along the middle of each side; transparent
  // artwork keeps the whole border empty, so a quick ring test tells them apart
  let ringOpaque = 0, ringTotal = 0;
  for(let x=0; x<W0; x++){
    for(const y of [0, H0-1]){ ringTotal++; if(d[(y*W0+x)*4+3] > 128) ringOpaque++; }
  }
  for(let y=0; y<H0; y++){
    for(const x of [0, W0-1]){ ringTotal++; if(d[(y*W0+x)*4+3] > 128) ringOpaque++; }
  }
  if(ringOpaque / Math.max(1,ringTotal) < 0.35){
    return cropSprite(d, W0, H0, H0);       // transparent art: just trim
  }

  // ---- 2. background palette: the two dominant shades of the rarity card ----
  const hist = new Map();
  const bump = (map, r, gg, b)=>{
    const k = ((r>>3)<<10) | ((gg>>3)<<5) | (b>>3);
    let e = map.get(k); if(!e){ e = {n:0,r:0,g:0,b:0}; map.set(k,e); }
    e.n++; e.r+=r; e.g+=gg; e.b+=b;
  };
  for(let y=0; y<H0; y+=2){
    const base = y*W0*4;
    for(let x=0; x<W0; x+=2){
      const i = base + x*4;
      if(d[i+3] > 200) bump(hist, d[i], d[i+1], d[i+2]);
    }
  }
  // the card covers most of the icon, so its shades always win the histogram
  const top = [...hist.values()].sort((a,b)=>b.n-a.n).slice(0,2);
  if(!top.length) return cropSprite(d, W0, H0, H0);
  const pal = top.map(e=>[e.r/e.n, e.g/e.n, e.b/e.n]);

  const TOL = 18;          // 直接算背景、清成透明
  const TOL_SOFT = 44;     // 阴影/过渡带：不清掉，但允许泛洪穿过
                           // （有的卡片内面板和外框之间有一圈「半路」的阴影色，
                           //   例如 Totem，不穿过去整块内面板就会留下来）
  const isBg = (i)=>{
    for(let k=0;k<pal.length;k++){
      const c = pal[k];
      if(Math.abs(d[i]-c[0])<=TOL && Math.abs(d[i+1]-c[1])<=TOL && Math.abs(d[i+2]-c[2])<=TOL) return true;
    }
    return false;
  };
  const isSoft = (i)=>{
    for(let k=0;k<pal.length;k++){
      const c = pal[k];
      if(Math.abs(d[i]-c[0])<=TOL_SOFT && Math.abs(d[i+1]-c[1])<=TOL_SOFT && Math.abs(d[i+2]-c[2])<=TOL_SOFT) return true;
    }
    return false;
  };

  // ---- 2. flood the background away, starting at the image border ----
  const seen = new Uint8Array(W0*H0);
  const stack = [];
  const push = (p)=>{ if(!seen[p]){ seen[p]=1; stack.push(p); } };
  for(let x=0;x<W0;x++){ push(x); push((H0-1)*W0+x); }
  for(let y=0;y<H0;y++){ push(y*W0); push(y*W0+W0-1); }
  while(stack.length){
    const p = stack.pop(), i = p*4;
    if(d[i+3] !== 0){
      if(isBg(i)){ d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=0; }
      else if(!isSoft(i)) continue;   // solid petal edge = stop
    } else {
      d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=0;
    }
    const x = p % W0;
    if(x > 0)      push(p-1);
    if(x < W0-1)   push(p+1);
    if(p >= W0)    push(p-W0);
    if(p < W0*(H0-1)) push(p+W0);
  }

  // ---- 3. soften the anti-aliased fringe (2 passes) ----
  for(let pass=0; pass<2; pass++){
    const kills = [];
    for(let y=0;y<H0;y++){
      for(let x=0;x<W0;x++){
        const p = y*W0+x, i = p*4;
        if(d[i+3] === 0) continue;
        const nearFree =
          (x>0 && d[i-1] === 0) || (x<W0-1 && d[i+7] === 0) ||
          (y>0 && d[i-W0*4+3] === 0) || (y<H0-1 && d[i+W0*4+3] === 0);
        if(!nearFree) continue;
        for(let k=0;k<pal.length;k++){
          const c = pal[k];
          if(Math.abs(d[i]-c[0])<=42 && Math.abs(d[i+1]-c[1])<=42 && Math.abs(d[i+2]-c[2])<=42){
            kills.push(i); break;
          }
        }
      }
    }
    for(const i of kills){ d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=0; }
    if(!kills.length) break;
  }

  // ---- 4. find the name-text band and cut it off ----
  const rows = new Int32Array(H0);
  for(let y=0;y<H0;y++){
    let c = 0, base = y*W0*4;
    for(let x=0;x<W0;x++) if(d[base + x*4 + 3] > 40) c++;
    rows[y] = c;
  }
  let cut = Math.round(H0*0.66);        // text always sits in the bottom band
  {
    let runStart = -1, bestLen = 0, bestAt = -1;
    for(let y=Math.round(H0*0.40); y<H0; y++){
      if(rows[y] === 0){
        if(runStart < 0) runStart = y;
      } else {
        if(runStart >= 0){
          const len = y - runStart;
          if(len > bestLen){ bestLen = len; bestAt = runStart; }
          runStart = -1;
        }
      }
    }
    // only an *internal* gap counts, and only if it sits above the text band:
    // the empty space under the letters must never win, or the cut lands below
    // the name and keeps it
    const loY = Math.round(H0*0.45), hiY = Math.round(H0*0.70);
    if(bestAt >= loY && bestAt <= hiY && bestLen >= 3) cut = bestAt;
  }

  return cropSprite(d, W0, H0, cut);
}

// crop the opaque part of [0,cut) into a square canvas. The bounding box is
// taken from the largest connected blob, so single-pixel fringe leftovers along
// the old card border can never inflate the frame (that would shrink the art).
function cropSprite(d, W0, H0, cut){
  if(cut < 2) return null;
  const S = 4;
  const gw = Math.ceil(W0/S), gh = Math.ceil(cut/S);
  const occ = new Uint8Array(gw*gh);
  for(let gy=0; gy<gh; gy++){
    const yEnd = Math.min((gy+1)*S, cut);
    for(let gx=0; gx<gw; gx++){
      const xEnd = Math.min((gx+1)*S, W0);
      let hit = 0;
      for(let y=gy*S; y<yEnd && !hit; y++){
        const base = y*W0*4;
        for(let x=gx*S; x<xEnd; x++){ if(d[base + x*4 + 3] > 40){ hit = 1; break; } }
      }
      occ[gy*gw+gx] = hit;
    }
  }
  // largest 4-connected blob = the petal itself
  const lab = new Int32Array(gw*gh);
  const st = [];
  let id = 0, bestId = 0, bestSize = 0;
  for(let i=0;i<gw*gh;i++){
    if(!occ[i] || lab[i]) continue;
    id++; lab[i] = id; st.length = 0; st.push(i);
    let size = 0;
    while(st.length){
      const p = st.pop(); size++;
      const x = p % gw, y = (p - x) / gw;
      if(x > 0    && occ[p-1]  && !lab[p-1]){  lab[p-1]  = id; st.push(p-1); }
      if(x < gw-1 && occ[p+1]  && !lab[p+1]){  lab[p+1]  = id; st.push(p+1); }
      if(y > 0    && occ[p-gw] && !lab[p-gw]){ lab[p-gw] = id; st.push(p-gw); }
      if(y < gh-1 && occ[p+gw] && !lab[p+gw]){ lab[p+gw] = id; st.push(p+gw); }
    }
    if(size > bestSize){ bestSize = size; bestId = id; }
  }
  if(!bestId) return null;

  let gx0 = gw, gy0 = gh, gx1 = -1, gy1 = -1;
  for(let y=0;y<gh;y++){
    for(let x=0;x<gw;x++){
      if(lab[y*gw+x] !== bestId) continue;
      if(x < gx0) gx0 = x; if(x > gx1) gx1 = x;
      if(y < gy0) gy0 = y; if(y > gy1) gy1 = y;
    }
  }
  // refine to exact pixels inside that coarse box
  let x0 = gx0*S, y0 = gy0*S;
  let x1 = Math.min(W0-1, (gx1+1)*S-1), y1 = Math.min(cut-1, (gy1+1)*S-1);
  let tx0=x1, ty0=y1, tx1=x0, ty1=y0;
  for(let y=y0; y<=y1; y++){
    const base = y*W0*4;
    for(let x=x0; x<=x1; x++){
      if(d[base + x*4 + 3] > 20){
        if(x<tx0) tx0=x; if(x>tx1) tx1=x;
        if(y<ty0) ty0=y; if(y>ty1) ty1=y;
      }
    }
  }
  if(tx1 < tx0 || ty1 < ty0) return null;
  const w = tx1-tx0+1, h = ty1-ty0+1;
  const side = Math.max(w, h);
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(d), W0, H0), -tx0, -ty0);
  const out = document.createElement('canvas');
  out.width = side; out.height = side;
  const og = out.getContext('2d');
  og.drawImage(tmp, Math.round((side-w)/2), Math.round((side-h)/2));
  return {cv: out, size: side, w, h};
}

// ------------------------------------------------------------------
//  素材包里没有卡片的花瓣（生物掉落专有的 Salt / Sand / Rock / Root …）
//  用代码画一个矢量图标，保证地面掉落物是「那个东西」而不是带字母的色块
// ------------------------------------------------------------------
const PROC_PETAL = {
  Rock(g,S){                                        // 灰色石块 + 切面
    const p=[[-0.30,-0.16],[-0.10,-0.34],[0.20,-0.28],[0.32,0.02],[0.12,0.30],[-0.20,0.26]];
    g.beginPath(); p.forEach(([x,y],i)=> i?g.lineTo(x*S,y*S):g.moveTo(x*S,y*S)); g.closePath();
    g.fillStyle='#8d8d94'; g.fill(); g.strokeStyle='#5a5a61'; g.lineWidth=S*0.045; g.stroke();
    g.beginPath(); g.moveTo(-0.10*S,-0.30*S); g.lineTo(0.02*S,-0.06*S); g.lineTo(0.24*S,-0.20*S);
    g.strokeStyle='#a8a8b0'; g.lineWidth=S*0.05; g.stroke();
  },
  Sand(g,S){                                        // 沙堆
    g.beginPath(); g.ellipse(0,0.16*S,0.36*S,0.14*S,0,0,6.283); g.fillStyle='#d9bd77'; g.fill();
    g.beginPath(); g.moveTo(-0.30*S,0.14*S); g.quadraticCurveTo(0,-0.22*S,0.30*S,0.14*S); g.closePath();
    g.fillStyle='#e8cf90'; g.fill();
    g.fillStyle='#c9a95c';
    [[-0.10,0.02],[0.06,0.08],[0.16,-0.02],[-0.16,0.12]].forEach(([x,y])=>{
      g.beginPath(); g.arc(x*S,y*S,S*0.035,0,6.283); g.fill();
    });
  },
  Salt(g,S){                                        // 盐晶簇
    const shard=(x,y,h,w,rot)=>{
      g.save(); g.translate(x*S,y*S); g.rotate(rot);
      g.beginPath(); g.moveTo(0,-h*S); g.lineTo(w*S,0); g.lineTo(0,h*S*0.45); g.lineTo(-w*S,0);
      g.closePath(); g.fillStyle='#f2f4f7'; g.fill();
      g.strokeStyle='#c3cad4'; g.lineWidth=S*0.035; g.stroke();
      g.beginPath(); g.moveTo(0,-h*S); g.lineTo(0,h*S*0.45); g.strokeStyle='#e2e7ee'; g.stroke();
      g.restore();
    };
    shard(-0.12,0.06,0.30,0.085,-0.22); shard(0.14,0.08,0.24,0.075,0.28); shard(0.0,-0.04,0.34,0.09,0.02);
  },
  Shell(g,S){                                       // 扇形贝壳
    g.beginPath(); g.moveTo(0,0.26*S);
    g.arc(0,0.26*S,0.34*S,Math.PI*1.12,Math.PI*1.88); g.closePath();
    g.fillStyle='#f3c9c9'; g.fill(); g.strokeStyle='#c98f8f'; g.lineWidth=S*0.04; g.stroke();
    for(let i=-2;i<=2;i++){
      const a=-Math.PI/2+i*0.30;
      g.beginPath(); g.moveTo(0,0.26*S);
      g.lineTo(Math.cos(a)*0.33*S,0.26*S+Math.sin(a)*0.33*S);
      g.strokeStyle='rgba(180,110,110,0.55)'; g.lineWidth=S*0.022; g.stroke();
    }
  },
  Rice(g,S){                                        // 米粒
    const grain=(x,y,rot)=>{
      g.save(); g.translate(x*S,y*S); g.rotate(rot);
      g.beginPath(); g.ellipse(0,0,0.075*S,0.155*S,0,0,6.283);
      g.fillStyle='#fbfbf6'; g.fill();
      g.strokeStyle='#d5d5c6'; g.lineWidth=S*0.028; g.stroke(); g.restore();
    };
    grain(-0.10,-0.04,-0.5); grain(0.12,-0.10,0.6); grain(-0.04,0.16,0.15); grain(0.18,0.16,-0.3);
  },
  Root(g,S){                                        // 褐色根须
    g.strokeStyle='#8a5a34'; g.lineWidth=S*0.10; g.lineCap='round';
    g.beginPath(); g.moveTo(0,-0.30*S); g.quadraticCurveTo(0.05*S,0,0,0.30*S); g.stroke();
    g.lineWidth=S*0.065;
    g.beginPath(); g.moveTo(0.02*S,-0.06*S); g.quadraticCurveTo(0.20*S,-0.02*S,0.26*S,0.18*S); g.stroke();
    g.beginPath(); g.moveTo(-0.01*S,0.08*S); g.quadraticCurveTo(-0.20*S,0.10*S,-0.24*S,-0.12*S); g.stroke();
  },
  Rubber(g,S){                                      // 黑色橡胶块
    g.beginPath(); g.ellipse(0,0,0.30*S,0.26*S,0.2,0,6.283);
    g.fillStyle='#2f3134'; g.fill(); g.strokeStyle='#17181a'; g.lineWidth=S*0.045; g.stroke();
    g.beginPath(); g.ellipse(-0.06*S,-0.07*S,0.10*S,0.06*S,-0.4,0,6.283);
    g.fillStyle='rgba(255,255,255,0.22)'; g.fill();
  },
  Orange(g,S){                                      // 橙子
    g.beginPath(); g.arc(0,0.03*S,0.29*S,0,6.283); g.fillStyle='#f08a1c'; g.fill();
    g.strokeStyle='#c96c0d'; g.lineWidth=S*0.04; g.stroke();
    g.beginPath(); g.ellipse(-0.08*S,-0.06*S,0.09*S,0.055*S,-0.5,0,6.283);
    g.fillStyle='rgba(255,255,255,0.35)'; g.fill();
    g.beginPath(); g.moveTo(0,-0.25*S); g.quadraticCurveTo(0.16*S,-0.38*S,0.20*S,-0.24*S);
    g.quadraticCurveTo(0.10*S,-0.18*S,0,-0.21*S); g.closePath();
    g.fillStyle='#3f8f39'; g.fill();
  },
  Rose(g,S){                                        // 玫瑰
    g.beginPath(); g.arc(0,0,0.30*S,0,6.283); g.fillStyle='#c9304a'; g.fill();
    g.strokeStyle='#8e1c30'; g.lineWidth=S*0.035; g.stroke();
    g.strokeStyle='#e05a70';
    for(let i=0;i<3;i++){
      g.beginPath(); g.arc(0,0,(0.09+i*0.07)*S,i*1.2,i*1.2+3.6); g.lineWidth=S*0.045; g.stroke();
    }
    g.beginPath(); g.arc(0,0,0.045*S,0,6.283); g.fillStyle='#f7a0ae'; g.fill();
  },
  Uranium(g,S){                                     // 发光的铀
    g.beginPath();
    for(let i=0;i<6;i++){ const a=-Math.PI/2+i*Math.PI/3;
      const x=Math.cos(a)*0.30*S, y=Math.sin(a)*0.30*S; i?g.lineTo(x,y):g.moveTo(x,y); }
    g.closePath();
    const grd=g.createRadialGradient(0,0,0,0,0,0.32*S);
    grd.addColorStop(0,'#c8ff8a'); grd.addColorStop(1,'#3f9f2a');
    g.fillStyle=grd; g.fill(); g.strokeStyle='#256d18'; g.lineWidth=S*0.04; g.stroke();
    g.fillStyle='rgba(30,60,20,0.75)';
    g.beginPath(); g.arc(0,0,0.055*S,0,6.283); g.fill();
  },
  Shovel(g,S){                                      // 铁锹（蚁巢掉落）
    g.strokeStyle='#a9702f'; g.lineWidth=S*0.075; g.lineCap='round';
    g.beginPath(); g.moveTo(0.06*S,-0.32*S); g.lineTo(-0.04*S,0.04*S); g.stroke();
    g.beginPath();
    g.moveTo(-0.14*S,0.02*S); g.lineTo(0.06*S,0.02*S); g.lineTo(0.05*S,0.22*S);
    g.quadraticCurveTo(-0.04*S,0.34*S,-0.13*S,0.22*S); g.closePath();
    g.fillStyle='#c9ccd2'; g.fill(); g.strokeStyle='#8b9099'; g.lineWidth=S*0.04; g.stroke();
    g.beginPath(); g.moveTo(0.06*S,-0.32*S); g.lineTo(0.12*S,-0.20*S);
    g.strokeStyle='#a9702f'; g.lineWidth=S*0.075; g.stroke();
  },
  Mysterious_Relic(g,S){                            // 神秘遗物
    g.beginPath(); g.moveTo(0,-0.32*S); g.lineTo(0.24*S,-0.10*S); g.lineTo(0.14*S,0.30*S);
    g.lineTo(-0.14*S,0.30*S); g.lineTo(-0.24*S,-0.10*S); g.closePath();
    const grd=g.createLinearGradient(0,-0.3*S,0,0.3*S);
    grd.addColorStop(0,'#9b6bd6'); grd.addColorStop(1,'#4b2478');
    g.fillStyle=grd; g.fill(); g.strokeStyle='#331653'; g.lineWidth=S*0.04; g.stroke();
    g.strokeStyle='rgba(230,205,255,0.85)'; g.lineWidth=S*0.035;
    g.beginPath(); g.moveTo(0,-0.16*S); g.lineTo(0,0.14*S); g.moveTo(-0.10*S,-0.02*S); g.lineTo(0.10*S,-0.02*S); g.stroke();
  },
  Mysterious_Powder(g,S){                           // 神秘粉末
    g.beginPath(); g.ellipse(0,0.20*S,0.28*S,0.10*S,0,0,6.283); g.fillStyle='#8f6ac4'; g.fill();
    g.beginPath(); g.moveTo(-0.24*S,0.18*S); g.quadraticCurveTo(0,-0.18*S,0.24*S,0.18*S); g.closePath();
    const grd=g.createLinearGradient(0,-0.2*S,0,0.2*S);
    grd.addColorStop(0,'#c9a8ee'); grd.addColorStop(1,'#7b52ad');
    g.fillStyle=grd; g.fill();
    g.fillStyle='rgba(240,225,255,0.9)';
    [[-0.12,-0.02],[0.04,-0.10],[0.14,0.02],[-0.02,0.06]].forEach(([x,y])=>{
      g.beginPath(); g.arc(x*S,y*S,S*0.03,0,6.283); g.fill();
    });
  }
};

const PROC_SPRITE = {};
function buildProcPetal(name){
  const f = PROC_PETAL[name];
  if(!f) return null;
  if(PROC_SPRITE[name]) return PROC_SPRITE[name];
  const S = 72;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.save(); g.translate(S/2, S/2);
  try { f(g, S); } catch(e){ g.restore(); return null; }
  g.restore();
  // size 给得比画布小：矢量图标的可视部分只占画布约 70%，
  // 这样在环绕/掉落里和原版卡片图看起来一样大
  const sp = {cv, size:S*0.72, w:S, h:S, proc:true};
  PROC_SPRITE[name] = sp;
  return sp;
}

// UI（合成台 / 背包 / 状态栏）用的图标 src：
// 只用「用户上传的卡片图」，拿不到卡片就退到上传的透明素材，
// 绝不在这里手工画——手绘图只留给世界里的掉落物兜底。
// 某一档的官方卡面到底有没有（以 assets 里真实文件为准，见 cardfiles.js）
function hasCardFile(name, rarity){
  return !!(typeof CARD_FILES !== 'undefined' && CARD_FILES && CARD_FILES.has(name + '_(' + rarity + ')'));
}

function petalIconSrc(name, rarity){
  // ① 官方卡面存在 → 直接用文件，绝不自己画
  if(hasCardFile(name, rarity)) return petalCardPath(name, rarity);
  const avail = MANIFEST.petals && MANIFEST.petals[name];
  // ② 这张花瓣有官方卡、只是没这一档 → 用最接近的官方卡（也不自己画）
  if(avail && avail.length){
    const near = nearestRarity(name, rarity);
    if(hasCardFile(name, near)) return petalCardPath(name, near);
    return petalCardPath(name, rarity);
  }
  // ③ 这张花瓣压根没有任何官方卡面（Air / Pollen 这类）→ 才退到现拼 / 裸图
  if(typeof cardIconURL === 'function'){
    const u = cardIconURL(name, rarity);
    if(u) return u;
  }
  return petalImagePath(name, rarity);
}

// 少数花瓣的「Health（耐久）」在 wiki 卡面上有明确数字，这里直接照抄
const PETAL_DUR = { Basic: 10, Leaf: 10, Rose: 20, Heavy: 60 };

// ============================================================
//  逐花瓣「独特机制」——来源：florrio.wiki.gg/wiki/Petals、
//  official-florrio.fandom.com 单页、namu wiki 페탈 목록（现行版）
//  数值全部照抄，不自己编：
//   Air     花身面积 +8/级（纯占位花瓣，只会让花变大）
//   Amulet  满血后多余治疗的 5%×级 转为护盾
//   Ankh    放置型：碎了把你传回安卡的位置
//   Antennae视野 +25/33.3/42.9/100/185.7/400/900%（不随稀有度线性）
//   Bandage 致死时延迟 1.5s 死亡（身体伤害 -75%），复活冷却 30s
//   Battery 每被打 3 次放一道闪电（威力 = 同稀有度 Lightning）
//   Bean    附近没有友方玩家/召唤物时伤害 +20%
//   Bone    游戏里唯一有「Armor」的花瓣：护甲 10 起，每次受击减半
//   Bubble  0 伤害，右键戳破把自己弹出去（1 耐久，3.5s）
//   Card    每次重生随机属性
//   Chip    命中时有很高概率不掉耐久
//   Claw    目标血量 >80% 时额外伤害
//   Clay    伤害随「装填后玩家移动距离」增加，有上限
//   Clover  幸运（掉落率）
//   Cogwheel公转按 60° 跳格
//   Coral   命中后分裂成更小的碎片
//   Cactus  最大生命 +20%
//   Carrot  飞得极快、会弹墙的远程
//   Dandelion命中后 10s 内无法回血
//   Dice    小概率打出 35 倍伤害（幸运越高越容易）
//   Disc    反弹敌方投射物
//   Domino  每次伤害随机（0~上限）
//   Broccoli命中后炸出碎粒
//   Bur     命中剥掉生物的护甲并减速
// ============================================================
const PETAL_ABILITY = {
  Air:      {kind:'size',     val:8},          // 花身面积 +8/级
  Amulet:   {kind:'overheal', val:0.05},       // 5%/级 溢出治疗转护盾
  Ankh:     {kind:'ankh'},
  Antennae: {kind:'fov',      seq:[0.25,0.333,0.429,1.0,1.857,4.0,9.0]},
  Bandage:  {kind:'undead',   val:1.5, dmgCut:0.75},
  Battery:  {kind:'zap',      every:3},
  Bean:     {kind:'solo',     val:0.20},
  Bone:     {kind:'armor',    val:10},         // 护甲 10（×3/级），每次受击减半
  Bubble:   {kind:'bubble'},
  Card:     {kind:'randomStats'},
  Chip:     {kind:'chip',     val:0.45},
  Claw:     {kind:'claw',     val:0.50, below:0.80},
  Clay:     {kind:'clay',     max:70},
  Clover:   {kind:'luck',     val:0.30},
  Cogwheel: {kind:'cog',      step:Math.PI/3},
  Coral:    {kind:'coral'},
  Cactus:   {kind:'maxhp',    val:0.20},
  Carrot:   {kind:'carrot'},
  Dandelion:{kind:'antiheal', val:10},
  Dice:     {kind:'dice',     mult:35, p:0.010},
  Disc:     {kind:'reflect',  val:0.90},
  Domino:   {kind:'domino',   max:36},
  Broccoli: {kind:'broccoli'},
  Bur:      {kind:'bur'}
};

// Build a concrete petal instance definition (stats scaled by rarity & power)
function buildPetal(name, rarity){
  const meta = PETAL_META[name] || {cat:'melee', p:1};
  const base = CAT_BASE[meta.cat] || CAT_BASE.melee;
  const m  = RARITY_MULT[rarity] || 1;            // 伤害 / 耐久
  const mh = RARITY_HEAL_MULT[rarity] || 1;       // 回血 / 生命
  const ma = RARITY_SHIELD_MULT[rarity] || 1;     // 护盾 / 护甲
  const p = (meta.p != null) ? meta.p : 1;   // p:0 是有意义的（Faster 这类靠官方数据表给数值的）
  const def = {name, rarity, cat:meta.cat};
  if(base.dmg)    def.dmg    = base.dmg * m * p;
  if(base.heal)   def.heal   = base.heal * mh * p;   // 每次撞到生物的回血量
  if(base.regen)  def.regen  = base.regen * mh * p;
  if(base.hp)     def.hp     = base.hp * mh * p;
  if(base.shield) def.shield = base.shield * ma * p;
  if(base.dur)    def.dur    = base.dur * m;
  if(PETAL_DUR[name] != null) def.dur = PETAL_DUR[name] * m;
  if(base.speed)  def.speed  = base.speed * p;
  if(base.magnet) def.magnet = base.magnet * p;
  if(base.range)  def.range  = base.range * p;
  if(base.spin)   def.spin   = base.spin * p;
  if(base.dmgMult)def.dmgMult= base.dmgMult * p;
  if(base.xpMult) def.xpMult = base.xpMult * p;
  if(base.reload) def.reload = base.reload * (meta.cat==='ranged' ? (0.6+0.4/p) : (0.85+0.15/p));
  // 逐花瓣冷却表优先（秒 → 毫秒）
  if(PETAL_RELOAD[name] !== undefined){
    const sec = PETAL_RELOAD[name];
    def.reloadSec = sec;
    def.reload = sec * 1000 * (meta.cat==='ranged' ? (0.6+0.4/p) : 1);
    if(sec === 0){ def.reload = 0; def.dur = 0; }      // 纯功能花瓣：不碎、不冷却
  } else {
    def.reloadSec = (def.reload||0)/1000;
  }
  // 特殊技能：功能型加成不随稀有度放大（原作里这些是固定效果），
  // 只有毒 / 回血 / 盾这种数值型的跟着稀有度走
  const fx = PETAL_FX[name];
  if(fx){
    for(const k in fx){
      const v = fx[k];
      if(k === 'poison')   def.poison = (def.poison||0) + v*m;
      else if(k === 'heal')def.heal   = (def.heal||0)   + v*mh;
      else if(k === 'regen')def.regen = (def.regen||0)  + v*mh;
      else if(k === 'dur') def.dur    = Math.max(8, (def.dur||0) + v*m);
      else if(k === 'shield') def.shield = (def.shield||0) + v*ma;
      else                 def[k]     = (def[k]||0)     + v;
    }
  }
  if(def.dur) def.dur = Math.max(8, def.dur);
  // 官方卡面数值优先（伤害 / 耐久 / 治疗 / 毒 都按 ×3 逐级放大，冷却固定）
  const st = PETAL_STAT[name];
  if(st){
    if(st.dmg)    def.dmg    = st.dmg * m;
    if(st.hp)     def.dur    = st.hp * m;
    if(st.heal)   def.heal   = st.heal * mh;
    if(st.poison) def.poison = st.poison * m;
    if(st.regen)  def.regen  = st.regen * mh;
    // [wiki] Petal Attraction Range：Common +8，之后每升一级再 +8（+16/+24/…/+72），线性增长
    if(st.attract) def.attract = st.attract * (Math.max(0, RARITIES.indexOf(rarity)) + 1);   // +8 起每级 +8（→+16…+72）
    // 官方卡面的冷却时间最权威：直接盖掉 PETAL_RELOAD 里的估算值
    if(st.cd != null){ def.reloadSec = st.cd; def.reload = st.cd * 1000; }
  }
  // Faster：官方卡面 Rotation Speed +0.5 rad/s 起，每级 +0.2，Unique/Eternal 封顶 +2.1
  if(name === 'Faster'){
    def.rotSpeed = 0.5 + 0.2 * Math.min(Math.max(0, RARITIES.indexOf(rarity)), 8);
  }
  // Soil：官方卡面 Flower Health（50 起每级 ×3，Unique=Eternal）与 Flower Radius（固定 +10）
  if(name === 'Soil'){
    def.flowerHealth = 50 * (RARITY_MULT[rarity] || 1);
    def.flowerRadius = 10;
  }
  // Golden Leaf：官方卡面 Reload -2.5% 起每级 +2.5%，Unique=Eternal 封顶 -22.5%
  if(name === 'Golden_Leaf'){
    def.reloadCut = 0.025 * Math.min(Math.max(0, RARITIES.indexOf(rarity)) + 1, 9);
  }
  // Bubble：官方卡面两段冷却（第一冷却=推进间隔，第二冷却=破裂后重载），Health 恒为 1
  if(name === 'Bubble'){
    const tbl = [[2.0,0.7],[1.8,0.6],[1.5,0.5],[1.2,0.4],[1.0,0.3],[0.8,0.2],[0.5,0.1],[0.2,0.1],[0.05,0.1],[0.05,0.1]];
    const t = tbl[Math.min(Math.max(0, RARITIES.indexOf(rarity)), 9)];
    def.bubbleCd1 = t[0]; def.bubbleCd2 = t[1];
    def.reloadSec = t[0]; def.reload = t[1] * 1000;   // 被打碎（破裂）后走第二冷却
    def.dmg = 0; def.dur = 1; def.maxDur = 1; def.shield = 0;   // 无护盾（官方卡面没有 Shield）
  }
  // Wax：官方卡面 Health（召唤蜡的血量 1k 起每级 x3，Unique=Eternal）与 Radius（30 起每级 +30，Unique=Eternal），冷却 30s
  if(name === 'Wax'){
    const wm = RARITY_MULT[rarity] || 1;
    def.waxHealth = 1000 * wm;
    def.waxRadius = 30 * Math.min(Math.max(0, RARITIES.indexOf(rarity)) + 1, 9);
    def.dur = 0; def.maxDur = 0;
    def.reloadSec = 30; def.reload = 30000;
  }
  // 独特机制（按稀有度索引取对应档；table 里写的是 Common 档基线）
  const ab = PETAL_ABILITY[name];
  if(ab){
    const ri = Math.max(0, RARITIES.indexOf(rarity));
    def.ab = ab.kind;
    def.abRi = ri;
    // 纯增益 / 放置型花瓣：不造成伤害
    if(ab.kind === 'size' || ab.kind === 'fov' || ab.kind === 'ankh' ||
       ab.kind === 'overheal' || ab.kind === 'undead'){ def.dmg = 0; }
    if(ab.kind === 'size'){ def.dur = 0; def.reload = 0; def.reloadSec = 0; }  // Air 不碎、无冷却
    if(ab.kind === 'fov')       def.fov     = ab.seq[Math.min(ri, ab.seq.length-1)];
    else if(ab.kind === 'size') def.flowerArea = ab.val * (ri + 1);
    else if(ab.kind === 'overheal') def.overheal = ab.val * (ri + 1);
    else if(ab.kind === 'armor')    def.armor    = ab.val * m;
    else if(ab.kind === 'luck')     def.luck     = ab.val * (ri + 1);
    else if(ab.kind === 'undead')   def.undead   = ab.val + ri*0.6;
    else if(ab.kind === 'domino')   def.randMax  = ab.max * m;
    else { for(const k in ab) if(k !== 'kind') def[k] = ab[k]; }
    def.abCfg = ab;
  }
  return def;
}
// 花瓣的"特殊技能"一句话说明（图鉴 / 装备栏 tooltip 用）
function petalFxText(name){
  const fx = PETAL_FX[name];
  if(!fx) return '';
  const L = [];
  if(fx.poison)   L.push('poison ' + fx.poison + '/s');
  if(fx.slow)     L.push('slows ' + Math.round(fx.slow*100) + '%');
  if(fx.leech)    L.push('lifesteal ' + Math.round(fx.leech*100) + '%');
  if(fx.crit)     L.push(Math.round(fx.crit*100) + '% crit');
  if(fx.knock)    L.push('knockback ' + fx.knock);
  if(fx.thorn)    L.push('reflect ' + Math.round(fx.thorn*100) + '%');
  if(fx.pierce)   L.push('pierces ' + fx.pierce);
  if(fx.provoke)  L.push('provokes mobs');
  if(fx.poo)      L.push('mobs lose aggro');
  if(fx.revive)   L.push('revive once');
  if(fx.magnet)   L.push('+' + fx.magnet + ' pickup range');
  if(fx.speed)    L.push('+' + Math.round(fx.speed*100) + '% move speed');
  if(fx.range)    L.push('+' + fx.range + ' orbit radius');
  if(fx.reach)    L.push('+' + fx.reach + ' attack reach');
  if(fx.spin)     L.push('+' + fx.spin.toFixed(1) + ' spin speed');
  if(fx.dmgMult)  L.push('+' + Math.round(fx.dmgMult*100) + '% damage');
  if(fx.xpMult)   L.push('+' + Math.round(fx.xpMult*100) + '% XP');
  return L.join(' · ');
}

// 卡面描述（没有单列的按分类兜底，保证每张卡都有话）
const CAT_DESC = {
  melee:'A petal that hits whatever touches it',
  ranged:'Fires at whatever gets too close',
  heal:'Heals you every time it touches a mob',
  shield:'Absorbs damage before it reaches you',
  speed:'Makes you and your petals move faster',
  magnet:'Pulls loot toward you from further away',
  antenna:'Widens your orbit and your reach',
  cogwheel:'Spins your petals faster',
  battery:'Overclocks the damage of every petal',
  ankh:'Keeps you alive one more time',
  goggles:'Sharpens what you can see and learn'
};
function petalDesc(name){
  if(PETAL_DESC[name]) return PETAL_DESC[name];
  const meta = PETAL_META[name];
  return CAT_DESC[meta && meta.cat] || 'A petal from the gardens of florr';
}

// 卡片 tooltip 用的完整数据（悬停灰卡）
function petalInfo(name, rarity){
  const d = buildPetal(name, rarity);
  const meta = PETAL_META[name] || {};
  return {
    name: name.replace(/_/g,' '),
    rarity,
    cat: meta.cat || 'melee',
    desc: petalDesc(name),
    cooldown: d.reloadSec === 0 ? 0 : d.reloadSec,
    dmg: d.dmg || 0,
    health: d.dur || 0,
    heal: d.heal || 0,
    regen: d.regen || 0,
    shield: d.shield || 0,
    rot: d.rotSpeed || 0,
    attract: d.attract || 0,
    flowerHealth: d.flowerHealth || 0,
    flowerRadius: d.flowerRadius || 0,
    reloadCut: d.reloadCut || 0,
    waxHealth: d.waxHealth || 0,
    waxRadius: d.waxRadius || 0,
    bubbleCd1: d.bubbleCd1 || 0,
    bubbleCd2: d.bubbleCd2 || 0,
    // 回血类花瓣把核心机制写清楚（原作：花瓣碰到生物就回血）
    fx: (function(){
      let fx = petalFxText(name);
      if((PETAL_META[name]||{}).cat === 'heal') fx = fx ? ('heals on contact · ' + fx) : 'heals on contact';
      return fx;
    })()
  };
}


// rarity drop weights (commons are far more common)
// Eternal / Unique 原作里几乎不掉（要合成/锻造），这里给一点点极小的概率
const RARITY_DROP_WEIGHT = {
  Common: 1000, Unusual: 320, Rare: 120, Epic: 42,
  Legendary: 14, Mythic: 4.5, Ultra: 1.2, Super: 0.35,
  Eternal: 0.012, Unique: 0.004
};

function rollRarity(){
  let total=0; for(const r of RARITIES) total += RARITY_DROP_WEIGHT[r];
  let x = Math.random()*total;
  for(const r of RARITIES){ x -= RARITY_DROP_WEIGHT[r]; if(x<=0){
    // Luck: chance to bump the drop one tier higher (Eternal / Unique 不给保送)
    const top = RARITIES.length - 2;
    if(player && player.luck>0 && RARITIES.indexOf(r) < top && Math.random() < Math.min(player.luck*0.12, 0.6)){
      const i = RARITIES.indexOf(r);
      return RARITIES[Math.min(i+1, top)];
    }
    return r;
  } }
  return 'Common';
}

// pick a random petal type that exists in the manifest
function rollPetalName(){
  const names = Object.keys(MANIFEST.petals);
  return names[(Math.random()*names.length)|0];
}
