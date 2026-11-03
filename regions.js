// ============================================================
//  Regions / Mobs / Drop tables / Spawn rarity tables
//  Mob sprites: assets/mobs_clean/<Sprite>.png  (transparent, baked offline)
//  Petal drops use underscore naming; unknown petals fall back to a
//  placeholder block until transparent petal art is added.
//
//  区域生物表与稀有度表按 florr.io 官方 wiki 整理：
//   - Garden 14 种 / Sewers 6 / Factory 6 / Ocean 9 / Desert 10
//   - Jungle 12 / Ant Hell 16 / Hel 5 / Pyramid 4
//  每个区域有基础稀有度权重（REGION_RARITY），区域深处还有"特殊区"
//  会刷更高稀有度（special zones），这里用 zone:'deep' 的概率近似。
// ============================================================

// 十级稀有度，顺序与花瓣一致
const MOB_RARITY = ['Common','Unusual','Rare','Epic','Legendary','Mythic','Ultra','Super','Eternal','Unique'];

// ============================================================
//  官方数值表（用户提供的 Garden 12 种生物，10 个稀有度逐档列出的
//  Health / Damage / Armor / XP Reward）—— 有这张表就用表里的绝对值，
//  不再用倍率推。顺序 = Common, Unusual, Rare, Epic, Legendary,
//  Mythic, Ultra, Super, Eternal, Unique。
// ============================================================
// ============================================================
//  逐档掉落表（用户提供的 Soldier Ant 7 张卡）：
//  [花瓣, [[稀有度, 概率], ...]] —— 同一花瓣各档概率之和 = 这只怪掉它的总概率，
//  掉出来落在哪一档按这些值归一化后抽取。
// ============================================================
// 没有 MOB_STATS 的生物用这条官方护甲阶梯兜底（每个生物都要有护甲）
const MOB_ARMOR_LADDER = [1, 2, 7, 22, 65, 194, 583, 583, 583, 583];

const MOB_DROPS_EXACT = {
  soldier_ant: {
    Common: [
      ['Glass',  [['Common',0.638],['Unusual',0.194]]],
      ['Clover', [['Common',0.598],['Unusual',0.164]]]
    ],
    Unusual: [
      ['Glass',  [['Common',0.420],['Unusual',0.579]]],
      ['Clover', [['Common',0.485],['Unusual',0.512]]]
    ],
    Rare: [
      ['Glass',  [['Unusual',0.805],['Rare',0.195]]],
      ['Clover', [['Unusual',0.834],['Rare',0.165]]]
    ],
    Epic: [
      ['Glass',  [['Unusual',0.039],['Rare',0.815],['Epic',0.146]]],
      ['Clover', [['Unusual',0.067],['Rare',0.810],['Epic',0.123]]]
    ],
    Legendary: [
      ['Glass',  [['Rare',0.043],['Epic',0.897],['Legendary',0.060]]],
      ['Clover', [['Rare',0.072],['Epic',0.877],['Legendary',0.050]]]
    ],
    Mythic: [
      ['Glass',  [['Epic',0.045],['Legendary',0.946],['Mythic',0.009]]],
      ['Clover', [['Epic',0.075],['Legendary',0.917],['Mythic',0.008]]]
    ],
    Ultra: [
      ['Glass',  [['Legendary',0.155],['Mythic',0.838],['Ultra',0.006]]],
      ['Clover', [['Legendary',0.212],['Mythic',0.783],['Ultra',0.005]]]
    ],
    Super: [
      ['Glass',  [['Mythic',0.290],['Ultra',0.710]]],
      ['Clover', [['Mythic',0.356],['Ultra',0.644]]]
    ]
  },
  // ---- Spider（官方图鉴 8 档卡面：Faster / Web / Third Eye）----
  spider: {
    Common: [
      ['Faster', [['Common',0.598],['Unusual',0.164]]],
      ['Web',    [['Unusual',0.164]]]
    ],
    Unusual: [
      ['Faster', [['Common',0.485],['Unusual',0.512]]],
      ['Web',    [['Unusual',0.512]]]
    ],
    Rare: [
      ['Faster', [['Unusual',0.834],['Rare',0.165]]],
      ['Web',    [['Unusual',0.834],['Rare',0.165]]]
    ],
    Epic: [
      ['Faster', [['Unusual',0.067],['Rare',0.810],['Epic',0.123]]],
      ['Web',    [['Unusual',0.067],['Rare',0.810],['Epic',0.123]]]
    ],
    Legendary: [
      ['Faster', [['Rare',0.072],['Epic',0.877],['Legendary',0.050]]],
      ['Web',    [['Rare',0.072],['Epic',0.877],['Legendary',0.050]]]
    ],
    Mythic: [
      ['Faster',    [['Epic',0.075],['Legendary',0.917],['Mythic',0.008]]],
      ['Web',       [['Epic',0.075],['Legendary',0.917],['Mythic',0.008]]],
      ['Third_Eye', [['Mythic',0.0003]]]
    ],
    Ultra: [
      ['Faster',    [['Legendary',0.212],['Mythic',0.783],['Ultra',0.005]]],
      ['Web',       [['Legendary',0.212],['Mythic',0.783],['Ultra',0.005]]],
      ['Third_Eye', [['Mythic',0.060],['Ultra',0.0002]]]
    ],
    Super: [
      ['Faster',    [['Mythic',0.356],['Ultra',0.644]]],
      ['Web',       [['Mythic',0.356],['Ultra',0.644]]],
      ['Third_Eye', [['Mythic',0.960],['Ultra',0.040]]]
    ]
  },
  // ---- Centipede（官方图鉴 8 档卡面：Leaf / Peas）----
  centipede: {
    Common: [
      ['Leaf', [['Unusual',0.035]]],
      ['Peas', [['Common',0.191],['Unusual',0.035]]]
    ],
    Unusual: [
      ['Leaf', [['Unusual',0.132]]],
      ['Peas', [['Common',0.510],['Unusual',0.132]]]
    ],
    Rare: [
      ['Leaf', [['Unusual',0.722],['Rare',0.035]]],
      ['Peas', [['Common',0.243],['Unusual',0.722],['Rare',0.035]]]
    ],
    Epic: [
      ['Leaf', [['Unusual',0.582],['Rare',0.392],['Epic',0.026]]],
      ['Peas', [['Unusual',0.582],['Rare',0.392],['Epic',0.026]]]
    ],
    Legendary: [
      ['Leaf', [['Rare',0.591],['Epic',0.399],['Legendary',0.010]]],
      ['Peas', [['Rare',0.591],['Epic',0.399],['Legendary',0.010]]]
    ],
    Mythic: [
      ['Leaf', [['Epic',0.596],['Legendary',0.402],['Mythic',0.002]]],
      ['Peas', [['Epic',0.596],['Legendary',0.402],['Mythic',0.002]]]
    ],
    Ultra: [
      ['Leaf', [['Legendary',0.733],['Mythic',0.266],['Ultra',0.001]]],
      ['Peas', [['Legendary',0.733],['Mythic',0.266],['Ultra',0.001]]]
    ],
    Super: [
      ['Leaf', [['Mythic',0.813],['Ultra',0.187]]],
      ['Peas', [['Mythic',0.813],['Ultra',0.187]]]
    ]
  },
  // ---- Bee（官方图鉴 8 档卡面：Stinger / Honey / Pollen）----
  bee: {
    Common: [
      ['Stinger', [['Common',0.598],['Unusual',0.164]]],
      ['Pollen',  [['Unusual',0.069]]]
    ],
    Unusual: [
      ['Stinger', [['Common',0.485],['Unusual',0.512]]],
      ['Pollen',  [['Unusual',0.247]]]
    ],
    Rare: [
      ['Stinger', [['Unusual',0.834],['Rare',0.165]]],
      ['Honey',   [['Rare',0.070]]],
      ['Pollen',  [['Unusual',0.872],['Rare',0.070]]]
    ],
    Epic: [
      ['Stinger', [['Unusual',0.067],['Rare',0.810],['Epic',0.123]]],
      ['Honey',   [['Rare',0.610],['Epic',0.051]]],
      ['Pollen',  [['Unusual',0.338],['Rare',0.610],['Epic',0.051]]]
    ],
    Legendary: [
      ['Stinger', [['Rare',0.072],['Epic',0.877],['Legendary',0.050]]],
      ['Honey',   [['Rare',0.349],['Epic',0.630],['Legendary',0.020]]],
      ['Pollen',  [['Rare',0.349],['Epic',0.630],['Legendary',0.020]]]
    ],
    Mythic: [
      ['Stinger', [['Epic',0.075],['Legendary',0.917],['Mythic',0.008]]],
      ['Honey',   [['Epic',0.356],['Legendary',0.641],['Mythic',0.003]]],
      ['Pollen',  [['Epic',0.356],['Legendary',0.641],['Mythic',0.003]]]
    ],
    Ultra: [
      ['Stinger', [['Legendary',0.212],['Mythic',0.783],['Ultra',0.005]]],
      ['Honey',   [['Legendary',0.538],['Mythic',0.460],['Ultra',0.002]]],
      ['Pollen',  [['Legendary',0.538],['Mythic',0.460],['Ultra',0.002]]]
    ],
    Super: [
      ['Stinger', [['Mythic',0.356],['Ultra',0.644]]],
      ['Honey',   [['Mythic',0.662],['Ultra',0.338]]],
      ['Pollen',  [['Mythic',0.662],['Ultra',0.338]]]
    ]
  },
  // ---- Hornet（官方图鉴 8 档卡面：Missile / Orange / Antennae）----
  hornet: {
    Common: [
      ['Missile', [['Unusual',0.164]]],
      ['Orange',  [['Unusual',0.164]]]
    ],
    Unusual: [
      ['Missile', [['Unusual',0.512]]],
      ['Orange',  [['Unusual',0.512]]]
    ],
    Rare: [
      ['Missile',  [['Unusual',0.834],['Rare',0.165]]],
      ['Orange',   [['Unusual',0.834],['Rare',0.165]]],
      ['Antennae', [['Rare',0.070]]]
    ],
    Epic: [
      ['Missile',  [['Unusual',0.067],['Rare',0.810],['Epic',0.123]]],
      ['Orange',   [['Unusual',0.067],['Rare',0.810],['Epic',0.123]]],
      ['Antennae', [['Rare',0.610],['Epic',0.051]]]
    ],
    Legendary: [
      ['Missile',  [['Rare',0.072],['Epic',0.877],['Legendary',0.050]]],
      ['Orange',   [['Rare',0.072],['Epic',0.877],['Legendary',0.050]]],
      ['Antennae', [['Rare',0.349],['Epic',0.630],['Legendary',0.020]]]
    ],
    Mythic: [
      ['Missile',  [['Epic',0.075],['Legendary',0.917],['Mythic',0.008]]],
      ['Orange',   [['Epic',0.075],['Legendary',0.917],['Mythic',0.008]]],
      ['Antennae', [['Epic',0.356],['Legendary',0.641],['Mythic',0.003]]]
    ],
    Ultra: [
      ['Missile',  [['Legendary',0.212],['Mythic',0.783],['Ultra',0.005]]],
      ['Orange',   [['Legendary',0.212],['Mythic',0.783],['Ultra',0.005]]],
      ['Antennae', [['Legendary',0.538],['Mythic',0.460],['Ultra',0.002]]]
    ],
    Super: [
      ['Missile',  [['Mythic',0.356],['Ultra',0.644]]],
      ['Orange',   [['Mythic',0.356],['Ultra',0.644]]],
      ['Antennae', [['Mythic',0.662],['Ultra',0.338]]]
    ]
  },

  // ---- Ladybug（官方图鉴 8 档：Light / Rose，两者同分布）----
  ladybug: {
    Common: [
      ['Light', [['Common',0.598],['Unusual',0.164]]],
      ['Rose',  [['Common',0.598],['Unusual',0.164]]]
    ],
    Unusual: [
      ['Light', [['Common',0.485],['Unusual',0.512]]],
      ['Rose',  [['Common',0.485],['Unusual',0.512]]]
    ],
    Rare: [
      ['Light', [['Unusual',0.834],['Rare',0.165]]],
      ['Rose',  [['Unusual',0.834],['Rare',0.165]]]
    ],
    Epic: [
      ['Light', [['Unusual',0.067],['Rare',0.810],['Epic',0.123]]],
      ['Rose',  [['Unusual',0.067],['Rare',0.810],['Epic',0.123]]]
    ],
    Legendary: [
      ['Light', [['Rare',0.072],['Epic',0.877],['Legendary',0.050]]],
      ['Rose',  [['Rare',0.072],['Epic',0.877],['Legendary',0.050]]]
    ],
    Mythic: [
      ['Light', [['Epic',0.075],['Legendary',0.917],['Mythic',0.008]]],
      ['Rose',  [['Epic',0.075],['Legendary',0.917],['Mythic',0.008]]]
    ],
    Ultra: [
      ['Light', [['Legendary',0.212],['Mythic',0.783],['Ultra',0.005]]],
      ['Rose',  [['Legendary',0.212],['Mythic',0.783],['Ultra',0.005]]]
    ],
    Super: [
      ['Light', [['Mythic',0.356],['Ultra',0.644]]],
      ['Rose',  [['Mythic',0.356],['Ultra',0.644]]]
    ]
  },
  // ---- Baby Ant（官方图鉴 8 档：Rice / Light x2 / Leaf）----
  baby_ant: {
    Common: [
      ['Rice',  [['Common',0.662]]],
      ['Light', [['Common',0.306]]],
      ['Light', [['Common',0.598],['Unusual',0.164]]],
      ['Leaf',  [['Unusual',0.101]]]
    ],
    Unusual: [
      ['Rice',  [['Common',0.232],['Unusual',0.768]]],
      ['Light', [['Common',0.485],['Unusual',0.512]]],
      ['Leaf',  [['Unusual',0.348]]]
    ],
    Rare: [
      ['Rice',  [['Unusual',0.697],['Rare',0.303]]],
      ['Light', [['Unusual',0.834],['Rare',0.165]]],
      ['Leaf',  [['Unusual',0.883],['Rare',0.103]]]
    ],
    Epic: [
      ['Rice',  [['Unusual',0.764],['Epic',0.231]]],
      ['Light', [['Unusual',0.067],['Rare',0.810],['Epic',0.123]]],
      ['Leaf',  [['Unusual',0.197],['Rare',0.727],['Epic',0.076]]]
    ],
    Legendary: [
      ['Rice',  [['Rare',0.005],['Epic',0.897],['Legendary',0.098]]],
      ['Light', [['Rare',0.072],['Epic',0.877],['Legendary',0.050]]],
      ['Leaf',  [['Rare',0.207],['Epic',0.763],['Legendary',0.031]]]
    ],
    Mythic: [
      ['Rice',  [['Epic',0.006],['Legendary',0.979],['Mythic',0.015]]],
      ['Light', [['Epic',0.075],['Legendary',0.917],['Mythic',0.008]]],
      ['Leaf',  [['Epic',0.212],['Legendary',0.783],['Mythic',0.005]]]
    ],
    Ultra: [
      ['Rice',  [['Legendary',0.045],['Mythic',0.945],['Ultra',0.010]]],
      ['Light', [['Legendary',0.212],['Mythic',0.783],['Ultra',0.005]]],
      ['Leaf',  [['Legendary',0.394],['Mythic',0.603],['Ultra',0.003]]]
    ],
    Super: [
      ['Rice',  [['Mythic',0.127],['Ultra',0.873]]],
      ['Light', [['Mythic',0.356],['Ultra',0.644]]],
      ['Leaf',  [['Mythic',0.538],['Ultra',0.462]]]
    ]
  },
  // ---- Queen Ant（官方图鉴 8 档：Ant Egg / Basil）----
  queen_ant: {
    Common: [
      ['Ant_Egg', [['Common',0.662],['Unusual',0.306]]]
    ],
    Unusual: [
      ['Ant_Egg', [['Common',0.232],['Unusual',0.768]]]
    ],
    Rare: [
      ['Ant_Egg', [['Unusual',0.697],['Rare',0.303]]]
    ],
    Epic: [
      ['Ant_Egg', [['Unusual',0.764],['Epic',0.231]]]
    ],
    Legendary: [
      ['Ant_Egg', [['Rare',0.005],['Epic',0.897],['Legendary',0.098]]]
    ],
    Mythic: [
      ['Ant_Egg', [['Epic',0.006],['Legendary',0.979],['Mythic',0.015]]],
      ['Basil',   [['Mythic',0.009]]]
    ],
    Ultra: [
      ['Ant_Egg', [['Legendary',0.045],['Mythic',0.945],['Ultra',0.010]]],
      ['Basil',   [['Mythic',0.838],['Ultra',0.006]]]
    ],
    Super: [
      ['Ant_Egg', [['Mythic',0.127],['Ultra',0.873]]],
      ['Basil',   [['Mythic',0.290],['Ultra',0.710]]]
    ]
  },
  // ---- Bumble Bee（官方图鉴 8 档：Pollen / Wax / Honey）----
  bumble_bee: {
    Common: [
      ['Pollen', [['Unusual',0.472]]]
    ],
    Unusual: [
      ['Pollen', [['Unusual',0.922]]]
    ],
    Rare: [
      ['Pollen', [['Unusual',0.541],['Rare',0.459]]],
      ['Wax',    [['Rare',0.328]]],
      ['Honey',  [['Rare',0.135]]]
    ],
    Epic: [
      ['Pollen', [['Unusual',0.640],['Epic',0.360]]],
      ['Wax',    [['Unusual',0.746],['Epic',0.251]]],
      ['Honey',  [['Unusual',0.786],['Epic',0.100]]]
    ],
    Legendary: [
      ['Pollen', [['Epic',0.839],['Legendary',0.161]]],
      ['Wax',    [['Epic',0.889],['Legendary',0.107]]],
      ['Honey',  [['Rare',0.122],['Epic',0.837],['Legendary',0.041]]]
    ],
    Mythic: [
      ['Pollen', [['Epic',0.974],['Mythic',0.026]]],
      ['Wax',    [['Epic',0.980],['Mythic',0.017]]],
      ['Honey',  [['Epic',0.126],['Legendary',0.867],['Mythic',0.006]]]
    ],
    Ultra: [
      ['Pollen', [['Mythic',0.977],['Ultra',0.017]]],
      ['Wax',    [['Legendary',0.033],['Mythic',0.956],['Ultra',0.011]]],
      ['Honey',  [['Legendary',0.289],['Mythic',0.707],['Ultra',0.004]]]
    ],
    Super: [
      ['Pollen', [['Mythic',0.030],['Ultra',0.970]]],
      ['Wax',    [['Mythic',0.103],['Ultra',0.897]]],
      ['Honey',  [['Mythic',0.438],['Ultra',0.562]]]
    ]
  },
  // ---- Ant Hole（官方图鉴 8 档：Soil / Shovel）----
  ant_hole: {
    Common: [
      ['Soil',   [['Common',0.598],['Unusual',0.164]]],
      ['Shovel', [['Common',0.539],['Unusual',0.133]]]
    ],
    Unusual: [
      ['Soil',   [['Common',0.485],['Unusual',0.512]]],
      ['Shovel', [['Common',0.553],['Unusual',0.436]]]
    ],
    Rare: [
      ['Soil',   [['Unusual',0.834],['Rare',0.165]]],
      ['Shovel', [['Common',0.003],['Unusual',0.862],['Rare',0.135]]]
    ],
    Epic: [
      ['Soil',   [['Unusual',0.067],['Rare',0.810],['Epic',0.123]]],
      ['Shovel', [['Unusual',0.114],['Rare',0.786],['Epic',0.100]]]
    ],
    Legendary: [
      ['Soil',   [['Rare',0.072],['Epic',0.877],['Legendary',0.050]]],
      ['Shovel', [['Rare',0.122],['Epic',0.837],['Legendary',0.041]]]
    ],
    Mythic: [
      ['Soil',   [['Epic',0.075],['Legendary',0.917],['Mythic',0.008]]],
      ['Shovel', [['Epic',0.126],['Legendary',0.867],['Mythic',0.006]]]
    ],
    Ultra: [
      ['Soil',   [['Legendary',0.212],['Mythic',0.783],['Ultra',0.005]]],
      ['Shovel', [['Legendary',0.289],['Mythic',0.707],['Ultra',0.004]]]
    ],
    Super: [
      ['Soil',   [['Mythic',0.356],['Ultra',0.644]]],
      ['Shovel', [['Mythic',0.438],['Ultra',0.562]]]
    ]
  },
  // ---- Worker Ant（官方图鉴 8 档卡面：Leaf / Corn）----
  worker_ant: {
    Common: [
      ['Leaf', [['Unusual',0.101]]],
      ['Corn', [['Common',0.455],['Unusual',0.101]]]
    ],
    Unusual: [
      ['Leaf', [['Unusual',0.348]]],
      ['Corn', [['Common',0.613],['Unusual',0.348]]]
    ],
    Rare: [
      ['Leaf', [['Unusual',0.883],['Rare',0.103]]],
      ['Corn', [['Common',0.014],['Unusual',0.883],['Rare',0.103]]]
    ],
    Epic: [
      ['Leaf', [['Unusual',0.197],['Rare',0.727],['Epic',0.076]]],
      ['Corn', [['Unusual',0.197],['Rare',0.727],['Epic',0.076]]]
    ],
    Legendary: [
      ['Leaf', [['Rare',0.207],['Epic',0.763],['Legendary',0.031]]],
      ['Corn', [['Rare',0.207],['Epic',0.763],['Legendary',0.031]]]
    ],
    Mythic: [
      ['Leaf', [['Epic',0.212],['Legendary',0.783],['Mythic',0.005]]],
      ['Corn', [['Epic',0.212],['Legendary',0.783],['Mythic',0.005]]]
    ],
    Ultra: [
      ['Leaf', [['Legendary',0.394],['Mythic',0.603],['Ultra',0.003]]],
      ['Corn', [['Legendary',0.394],['Mythic',0.603],['Ultra',0.003]]]
    ],
    Super: [
      ['Leaf', [['Mythic',0.538],['Ultra',0.462]]],
      ['Corn', [['Mythic',0.538],['Ultra',0.462]]]
    ]
  }
};

const MOB_STATS = {
  centipede: {
    hp:[25, 93.8, 337.5, 1350, 8100, 78975, 3645000, 109350000, 656100000, 656100000],
    dmg:[10, 30, 90, 270, 810, 2430, 7290, 21870, 65610, 65610],
    armor:[1, 2, 7, 22, 65, 194, 583, 583, 583, 583],
    xp:[1, 1, 2, 14, 133, 2038, 59386, 3895257, 3895257, 3895257]
  },
  ant_hole: {
    hp:[750, 2812.5, 10125, 40500, 243000, 2369250, 148078125, 3280500000, 19683000000, 19683000000],
    dmg:[15, 45, 135, 405, 1215, 3645, 10935, 32805, 98415, 98415],
    armor:[1, 2, 7, 22, 65, 194, 583, 583, 583, 583],
    xp:[1, 2, 5, 39, 356, 4980, 243000, 12142438, 12142438, 12142438]
  },
  baby_ant: {
    hp:[25, 93.8, 337.5, 1350, 8100, 78975, 4935937.5, 109350000, 656100000, 656100000],
    dmg:[10, 30, 90, 270, 810, 2430, 7290, 21870, 65610, 65610],
    armor:[1, 2, 7, 22, 65, 194, 583, 583, 583, 583],
    xp:[1, 2, 9, 67, 615, 8164, 420000, 19893553, 19893553, 19893553]
  },
  bee: {
    hp:[35, 131.3, 472.5, 1890, 11340, 110565, 5103000, 153090000, 918540000, 918540000],
    dmg:[50, 150, 450, 1350, 4050, 12150, 36450, 109350, 328050, 328050],
    armor:[1, 2, 7, 22, 65, 194, 583, 583, 583, 583],
    xp:[1, 1, 5, 44, 405, 5870, 213236, 13376259, 13376259, 13376259]
  },
  dandelion: {
    hp:[25, 93.8, 337.5, 1350, 8100, 78975, 3645000, 109350000, 656100000, 656100000],
    dmg:[15, 45, 135, 405, 1215, 3645, 10935, 32805, 98415, 98415],
    armor:[1, 2, 7, 22, 65, 194, 583, 583, 583, 583],
    xp:[1, 1, 3, 23, 211, 2823, 120569, 7133325, 7133325, 7133325]
  },
  bumble_bee: {
    hp:[25, 93.8, 337.5, 1350, 8100, 78975, 4935937.5, 109350000, 656100000, 656100000],
    dmg:[20, 60, 180, 540, 1620, 4860, 14580, 43740, 131220, 131220],
    armor:[1, 2, 7, 22, 65, 194, 583, 583, 583, 583],
    xp:[1, 1, 10, 93, 877, 10568, 593000, 24350794, 24350794, 24350794],
    // 官方卡面：Pollen Health / Pollen Damage（射出的花粉）
    pollenHP:[5, 25, 125, 625, 3125, 15625, 78125, 390625, 1953125, 1953125],
    pollenDMG:[10, 30, 90, 270, 810, 2430, 7290, 21870, 65610, 65610]
  },
  ladybug: {
    hp:[60, 225, 810, 3240, 19440, 189540, 12000000, 262440000, 1574640000, 1574640000],
    dmg:[10, 30, 90, 270, 810, 2430, 7290, 21870, 65610, 65610],
    armor:[1, 2, 7, 22, 65, 194, 583, 583, 583, 583],
    xp:[1, 2, 5, 41, 379, 5228, 260000, 12951125, 12951125, 12951125]
  },
  queen_ant: {
    hp:[250, 937.5, 3375, 13500, 81000, 789750, 49359375, 1093500000, 6561000000, 6561000000],
    dmg:[10, 30, 90, 270, 810, 2430, 7290, 21870, 65610, 65610],
    armor:[1, 2, 7, 22, 65, 194, 583, 583, 583, 583],
    xp:[1, 1, 4, 31, 287, 4425, 343000, 15878612, 15878612, 15878612]
  },
  rock: {
    hp:[[50,100],[187.5,375],[675,1350],[2700,5400],[16200,32400],[157950,315900],
        [7290000,14580000],[218700000,437400000],[1312200000,2624400000],[1312200000,2624400000]],
    dmg:[10, 30, 90, 270, 810, 2430, 7290, 21870, 65610, 65610],
    armor:[1, 2, 7, 22, 65, 194, 583, 583, 583, 583],
    xp:[1, 1, 3, 22, 206, 3071, 103973, 6824717, 6824717, 6824717]
  },
  soldier_ant: {
    hp:[100, 375, 1350, 5400, 32400, 315900, 14580000, 437400000, 2624400000, 2624400000],
    dmg:[10, 30, 90, 270, 810, 2430, 7290, 21870, 65610, 65610],
    armor:[1, 2, 7, 22, 65, 194, 583, 583, 583, 583],
    xp:[1, 2, 6, 44, 400, 5437, 227398, 13608888, 13608888, 13608888]
  },
  worker_ant: {
    hp:[60, 225, 810, 3240, 19440, 189540, 8748000, 262440000, 1574640000, 1574640000],
    dmg:[10, 30, 90, 270, 810, 2430, 7290, 21870, 65610, 65610],
    armor:[1, 2, 7, 22, 65, 194, 583, 583, 583, 583],
    xp:[1, 1, 4, 31, 279, 4105, 147030, 9345409, 9345409, 9345409]
  },
  hornet: {
    hp:[60, 225, 810, 3240, 19440, 189540, 8748000, 262440000, 1574640000, 1574640000],
    dmg:[50, 150, 450, 1350, 4050, 12150, 36450, 109350, 328050, 328050],
    armor:[1, 2, 7, 22, 65, 194, 583, 583, 583, 583],
    xp:[1, 2, 6, 53, 486, 6856, 26727, 16401473, 16401473, 16401473],
    // 官方卡面：Missile Health / Missile Damage（射出的蜂刺）
    missileHP:[5, 25, 125, 625, 3125, 15625, 78125, 390625, 1953125, 1953125],
    missileDMG:[10, 30, 90, 270, 810, 2430, 7290, 21870, 65610, 65610]
  }
};


// ============================================================
//  稀有度倍率（按 official-florrio.fandom.com 的数值表）
//  生命：1 / 3.75 / 13.5 / 54 / 324 / 3159 / 145800 / 4374000 / 26244000
//  伤害：1 / 3 / 9 / 27 / 81 / 243 / 729 / 2187 / 6561
//  （Unique 是本站加的顶层，沿用 Eternal 的数值）
// ============================================================
const RARITY_KEYS = ['Common','Unusual','Rare','Epic','Legendary','Mythic','Ultra','Super','Eternal'];
const MOB_HP_SEQ  = [1, 3.75, 13.5, 54, 324, 3159, 145800, 4374000, 26244000];
const MOB_DMG_SEQ = [1, 3, 9, 27, 81, 243, 729, 2187, 6561];
const MOB_HP_MULT = {}, MOB_DMG_MULT = {};
RARITY_KEYS.forEach((k,i)=>{
  MOB_HP_MULT[k]  = MOB_HP_SEQ[i];
  MOB_DMG_MULT[k] = MOB_DMG_SEQ[i];
});
MOB_HP_MULT.Unique = MOB_HP_MULT.Eternal;
MOB_DMG_MULT.Unique = MOB_DMG_MULT.Eternal;

// 兼容旧引用（伤害侧）：原来的 MOB_MULT 现在是伤害倍率
const MOB_MULT = MOB_DMG_MULT;

// ============================================================
//  掉落物停留时长（wiki：掉在地上的花瓣/卡片会随时间消失）
//  Common 30s，每级 +30s：30/60/90/120/150/180/210/240，Unique 与 Eternal 270s
// ============================================================
const DROP_LIFE = {
  Common:30, Unusual:60, Rare:90, Epic:120, Legendary:150,
  Mythic:180, Ultra:210, Super:240, Eternal:270, Unique:270
};

// ============================================================
//  掉落稀有度：以怪物自身稀有度为上限
//  原作里 Common 怪只掉 Common 花瓣，Unusual 怪多数掉 Unusual、
//  少数掉 Common，绝不会越级。所以这里用「同档 / 低一档 / 低两档」的权重，
//  不再走全局权重表（那样 Common 怪会有 8% 掉 Rare）。
// ============================================================
const DROP_TIER_W = [0.82, 0.155, 0.025];   // 同档 / -1 / -2
function rollDropRarity(mobRarity){
  const i = MOB_RARITY.indexOf(mobRarity);
  if(i < 0) return 'Common';
  let x = Math.random(), acc = 0;
  for(let k=0; k<DROP_TIER_W.length; k++){
    acc += DROP_TIER_W[k];
    if(x < acc) return MOB_RARITY[Math.max(0, i - k)];
  }
  return MOB_RARITY[i];
}
// 颜色直接取自 wiki 卡片实际底色，和花瓣共用一套
const MOB_RARITY_COLOR = {
  Common:'#66c358', Unusual:'#ceba4a', Rare:'#3e42b7', Epic:'#6d18b4',
  Legendary:'#b41919', Mythic:'#19b1b4', Ultra:'#ce235f', Super:'#23ce85',
  Eternal:'#c1c1c1', Unique:'#454545'
};

const MOB_IMG = {};
// 离线烘焙的透明怪物图（build_mobs_clean.py 把 wiki 卡片底抠掉、裁到本体）
const MOB_CLEAN = 'assets/mobs_clean/';
// 官方素材里本来就有透明图的
const MOB_TRANS = {
  Trader:    'assets/mobs_trans/Trader.webp',
  Oracle:    'assets/mobs_trans/Oracle.webp',
  Titan:     'assets/mobs_trans/Titan.webp',
  Assembler: 'assets/mobs_trans/Assembler.webp',
  Crystal:   'assets/mobs_trans/Crystal.webp',
  Square:    'assets/mobs_trans/Square.webp'
};
// part = 'body' | 'wingL' | 'wingR'：拆出来的可动部件（assets/mobs_clean/<Sprite>_<part>.png）
// 没有对应部件图就返回 null，引擎自动退回整张贴图
function getMobPart(sprite, part){
  if(!part) return null;
  const k = 'P_' + sprite + '_' + part;
  if(MOB_IMG[k] !== undefined) return MOB_IMG[k];
  const img = new Image();
  img.__clean = true;
  img.onerror = function(){ this.__broken = true; };
  img.src = MOB_CLEAN + sprite + '_' + part + '.png?v=' + (window.MOB_TEX_VER||1);
  MOB_IMG[k] = img;
  return img;
}
function getMobImage(sprite, rarity, part){
  if(part) return getMobPart(sprite, part);
  if(MOB_TRANS[sprite]){
    const key = 'T_'+sprite;
    if(!MOB_IMG[key]){
      const img = new Image(); img.src = MOB_TRANS[sprite]; img.__clean = true; MOB_IMG[key] = img;
    }
    return MOB_IMG[key];
  }
  const ck = 'C_'+sprite;
  if(MOB_IMG[ck]) return MOB_IMG[ck];
  const cimg = new Image();
  cimg.__clean = true;
  cimg.onerror = function(){
    this.__clean = false;
    this.onerror = null;
    this.src = 'assets/mobs/' + sprite + '_(' + (rarity||'Common') + ').webp';
  };
  cimg.src = MOB_CLEAN + sprite + '.png?v=' + (window.MOB_TEX_VER||1);
  MOB_IMG[ck] = cimg;
  return cimg;
}

// ------------------------------------------------------------------
//  MOBS
//  size  : 体型（florr 单位，花朵半径 = 25）
//  ai    : still 不动 | wander 游荡 | chase 追击 | shooter 远程 | orbit 绕圈冲刺
//          leech 吸附吸血 | spawner 巢穴 | friendly 友军
//  anim  : walk 走 | crawl 爬 | fly 飞 | float 漂浮 | plant 植物 | still 静止
//  atk   : {type,cd,dmg} 远程攻击（missile 导弹 / pea 豌豆 / poison 毒刺 /
//          pearl 珍珠 / laser 激光 / dark 暗眼 / zap 电击）
//  armor : 固定减伤
//  retaliate : 被打后最低在什么稀有度会反击（neutral 生物）
//  tiers : 可出现的稀有度（默认全部）
// ------------------------------------------------------------------
const FULL_TIERS = MOB_RARITY;
const MOBS = {
  // ================= Garden（14 种）=================
  ant_hole:{name:'Ant Hole',sprite:'Ant_Hole',shape:'rock',size:32,hp:420,dmg:0,speed:0,xp:14,
    ai:'spawner',anim:'still',immobile:true,tiers:['Common','Unusual','Rare','Epic','Legendary','Mythic'],
    onTimerSpawn:{keys:['baby_ant','worker_ant','soldier_ant'],n:1,cd:4.2},
    onHitSpawn:{keys:['baby_ant','worker_ant','soldier_ant','queen_ant'],n:2,cd:2.2},
    onDeathSpawn:{keys:['baby_ant','worker_ant','worker_ant','soldier_ant'],n:3},
    diggerChance:0.10,drops:['Soil','Shovel'],weight:5},
  baby_ant:{name:'Baby Ant',sprite:'Baby_Ant',shape:'ant',size:9,hp:16,dmg:5,speed:88,xp:4,
    ai:'wander',anim:'walk',drops:['Light','Rice','Leaf'],weight:12},
  worker_ant:{name:'Worker Ant',sprite:'Worker_Ant',shape:'ant',size:13,hp:30,dmg:8,speed:82,xp:7,
    ai:'wander',anim:'walk',retaliate:'Common',drops:['Leaf','Corn'],weight:11},
  soldier_ant:{name:'Soldier Ant',sprite:'Soldier_Ant',shape:'ant',size:17,hp:50,dmg:12,speed:88,xp:11,
    ai:'chase',anim:'walk',aggro:380,drops:['Glass','Clover'],weight:8},
  queen_ant:{name:'Queen Ant',sprite:'Queen_Ant',shape:'ant',size:40,hp:260,dmg:16,speed:44,xp:60,
    ai:'chase',anim:'walk',aggro:420,onTimerSpawn:{keys:['baby_ant','worker_ant'],n:1,cd:5},
    drops:['Ant_Egg','Basil'],rareDrops:[{p:'Wing',min:'Super'}],weight:1.6},
  bee:{name:'Bee',sprite:'Bee',shape:'wasp',size:17,hp:35,dmg:14,speed:96,xp:9,
    ai:'wander',anim:'fly',retaliate:'Rare',drops:['Stinger','Pollen','Honey'],weight:9},
  bumble_bee:{name:'Bumble Bee',sprite:'Bumble_Bee',shape:'wasp',size:21,hp:55,dmg:18,speed:112,xp:15,
    ai:'wander',anim:'fly',retaliate:'Rare',drops:['Pollen','Honey'],weight:2.5,
    onHitShoot:{type:'pollen', n:2, cd:1.4, speed:230, dmg:10}},
  // wiki：Centipede 由十节组成，每节独立结算（HP 25、身体伤害 10、护甲 1、XP 1），
  //  Rare+ 中立（被打 / 附近有灯泡会激怒）；被打断中间某节时，后面那节变成新头追人。
  centipede:{name:'Centipede',sprite:'Centipede_Head',shape:'bug',size:18,hp:25,dmg:10,speed:58,xp:1,
    ai:'wander',anim:'crawl',retaliate:'Rare',armor:1,chain:10,
    drops:['Peas'],rareDrops:[{p:'Leaf',min:'Unusual'}],weight:6},
  evil_centipede:{name:'Evil Centipede',sprite:'Evil_Centipede_(Head)',shape:'bug',size:20,hp:75,dmg:15,speed:96,xp:18,
    ai:'chase',anim:'crawl',aggro:360,drops:['Peas','Leaf'],weight:3},
  dandelion:{name:'Dandelion',sprite:'Dandelion_(Mob)',shape:'plant',size:18,hp:26,dmg:0,speed:0,xp:8,
    ai:'still',anim:'plant',immobile:true,onHitShoot:{type:'pea',n:8,cd:1.6,speed:260,dmg:5},drops:['Dandelion'],weight:6},
  digger:{name:'Digger',sprite:'Digger',shape:'bug',size:16,hp:60,dmg:10,speed:78,xp:16,
    ai:'friendly',anim:'walk',drops:['Cutter','Uranium'],weight:0.6},
  hornet:{name:'Hornet',sprite:'Hornet',shape:'wasp',size:27,hp:130,dmg:12,speed:78,xp:26,
    ai:'shooter',tailShot:true,anim:'fly',aggro:440,keep:250,atk:{type:'missile',cd:2.0,dmg:14,speed:300},
    predict:'Epic',drops:['Missile','Antennae','Orange'],weight:4},
  ladybug:{name:'Ladybug',sprite:'Ladybug',shape:'beetle',size:17,hp:45,dmg:10,speed:66,xp:12,
    ai:'wander',anim:'walk',retaliate:'Rare',drops:['Rose','Light'],weight:8},
  rock:{name:'Rock',sprite:'Rock_(Mob)',shape:'rock',size:26,hp:120,dmg:0,speed:0,xp:20,
    ai:'still',anim:'still',immobile:true,drops:['Rock','Heavy'],weight:5},
  spider:{name:'Spider',sprite:'Spider',shape:'spider',size:22,hp:52,dmg:12,speed:104,xp:12,
    ai:'chase',anim:'crawl',aggro:400,noLeash:true,drops:['Web','Faster','Third_Eye'],weight:6},
  ant_egg:{name:'Ant Egg',sprite:'Ant_Egg_(Mob)',shape:'egg',size:12,hp:20,dmg:0,speed:0,xp:6,
    ai:'still',anim:'still',onDeathSpawn:{keys:['baby_ant'],n:1,chance:0.6},drops:['Ant_Egg'],weight:3},

  // ================= Sewers（6 种）=================
  fly:{name:'Fly',sprite:'Fly',shape:'wasp',size:13,hp:28,dmg:7,speed:118,xp:8,
    ai:'wander',anim:'fly',drops:['Wing','Poo'],weight:9},
  moth:{name:'Moth',sprite:'Moth',shape:'wasp',size:16,hp:35,dmg:8,speed:92,xp:9,
    ai:'wander',anim:'fly',drops:['Light_Bulb'],weight:7},
  roach:{name:'Roach',sprite:'Roach',shape:'bug',size:17,hp:50,dmg:10,speed:78,xp:12,
    ai:'wander',anim:'crawl',retaliate:'Common',dashOnHit:2.2,slowAtLow:0.45,
    drops:['Lotus'],weight:8},
  garbage:{name:'Garbage',sprite:'Garbage',shape:'rock',size:26,hp:80,dmg:8,speed:0,xp:16,
    ai:'still',anim:'still',drops:['Poo'],weight:5},
  silverfish:{name:'Silverfish',sprite:'Silverfish',shape:'bug',size:16,hp:45,dmg:11,speed:112,xp:12,
    ai:'chase',anim:'crawl',aggro:340,drops:['Glass'],weight:6},
  spider_sewer:{name:'Spider',sprite:'Spider',shape:'spider',size:22,hp:60,dmg:13,speed:104,xp:13,
    ai:'chase',anim:'crawl',aggro:400,drops:['Web','Faster'],weight:5},

  // ================= Jungle（12 种）=================
  leafbug:{name:'Leafbug',sprite:'Leafbug',shape:'bug',size:16,hp:45,dmg:9,speed:62,xp:11,
    ai:'wander',anim:'walk',armor:12,retaliate:'Epic',drops:['Leaf','Carrot'],weight:9},
  golden_leafbug:{name:'Golden Leafbug',sprite:'Golden_Leafbug',shape:'bug',size:16,hp:50,dmg:10,speed:72,xp:13,
    ai:'wander',anim:'walk',armor:12,retaliate:'Epic',drops:['Golden_Leaf','Carrot'],weight:4},
  bush:{name:'Bush',sprite:'Bush',shape:'plant',size:24,hp:70,dmg:6,speed:0,xp:14,
    ai:'still',anim:'plant',drops:['Cotton','Golden_Leaf','Monstera'],weight:6},
  wasp:{name:'Wasp',sprite:'Wasp',shape:'wasp',size:20,hp:45,dmg:12,speed:96,xp:12,
    ai:'shooter',tailShot:true,anim:'fly',aggro:420,keep:220,atk:{type:'missile',cd:1.1,dmg:11,speed:430,wave:1},
    drops:['Antennae','Missile','Blood_Stinger'],weight:7},
  mantis:{name:'Mantis',sprite:'Mantis',shape:'bug',size:30,hp:80,dmg:16,speed:80,xp:20,
    ai:'shooter',anim:'walk',aggro:400,keep:300,atk:{type:'pea',cd:1.6,dmg:9,speed:250,burst:3},
    drops:['Peas','Bur'],weight:5},
  termite_mound:{name:'Termite Mound',sprite:'Termite_Mound',shape:'rock',size:40,hp:360,dmg:0,speed:0,xp:18,
    ai:'spawner',anim:'still',tiers:['Common','Unusual','Rare','Epic','Legendary','Mythic'],
    onTimerSpawn:{keys:['baby_termite','worker_termite','soldier_termite'],n:1,cd:3.4},
    onDeathSpawn:{keys:['worker_termite','soldier_termite','termite_overmind'],n:3},
    drops:['Soil','Clay','Mysterious_Stick'],weight:3},
  baby_termite:{name:'Baby Termite',sprite:'Baby_Termite',shape:'ant',size:9,hp:18,dmg:6,speed:88,xp:5,
    ai:'wander',anim:'walk',link:true,drops:['Mysterious_Stick','Carrot'],weight:8},
  worker_termite:{name:'Worker Termite',sprite:'Worker_Termite',shape:'ant',size:13,hp:32,dmg:9,speed:80,xp:8,
    ai:'wander',anim:'walk',link:true,retaliate:'Common',drops:['Mysterious_Stick','Bone'],weight:8},
  soldier_termite:{name:'Soldier Termite',sprite:'Soldier_Termite',shape:'ant',size:17,hp:55,dmg:13,speed:72,xp:12,
    ai:'chase',anim:'walk',link:true,aggro:380,drops:['Mysterious_Stick','Bone'],weight:6},
  termite_overmind:{name:'Termite Overmind',sprite:'Termite_Overmind',shape:'ant',size:44,hp:320,dmg:22,speed:34,xp:100,
    ai:'chase',anim:'walk',link:true,aggro:460,onTimerSpawn:{keys:['soldier_termite'],n:1,cd:7},
    drops:['Mysterious_Stick','Compass','Tomato'],rareDrops:[{p:'Mysterious_Stick',min:'Legendary'}],weight:1.2},
  firefly:{name:'Firefly',sprite:'Firefly',shape:'wasp',size:14,hp:40,dmg:10,speed:96,xp:11,
    ai:'wander',anim:'fly',retaliate:'Common',zapOnContact:true,drops:['Wing','Light_Bulb','Battery'],weight:6},
  magic_firefly:{name:'Magic Firefly',sprite:'Firefly',shape:'wasp',size:15,hp:46,dmg:12,speed:100,xp:14,
    ai:'wander',anim:'fly',retaliate:'Common',zapOnContact:true,glow:'#8be9fd',drops:['Battery','Light_Bulb'],weight:1.2},
  ladybug_jungle:{name:'Dark Ladybug',sprite:'Ladybug_(Jungle)',shape:'beetle',size:17,hp:52,dmg:12,speed:70,xp:13,
    ai:'wander',anim:'walk',retaliate:'Rare',drops:['Dahlia','Yin_Yang'],weight:5},

  // ================= Desert（10 种）=================
  beetle:{name:'Beetle',sprite:'Beetle',shape:'beetle',size:21,hp:72,dmg:16,speed:58,xp:14,
    ai:'chase',anim:'walk',aggro:380,drops:['Beetle_Egg','Ankh'],weight:8},
  scorpion:{name:'Scorpion',sprite:'Scorpion',shape:'bug',size:30,hp:140,dmg:22,speed:84,xp:38,
    ai:'shooter',anim:'crawl',aggro:420,keep:150,
    atk:{type:'poison',cd:2.4,dmg:16,speed:290},charge:'Epic',chargeSpeed:2.4,
    drops:['Stinger','Glass'],rareDrops:[{p:'Blood_Stinger',min:'Epic'}],weight:4},
  desert_centipede:{name:'Desert Centipede',sprite:'Desert_Centipede',shape:'bug',size:19,hp:65,dmg:13,speed:110,xp:16,
    ai:'wander',anim:'crawl',burrow:true,retaliate:'Epic',drops:['Glass','Dust'],weight:6},
  shiny_ladybug:{name:'Shiny Ladybug',sprite:'Ladybug_(Desert)',shape:'beetle',size:17,hp:46,dmg:12,speed:74,xp:30,
    ai:'wander',anim:'walk',retaliate:'Common',drops:['Dahlia','Dahlia'],rareDrops:[{p:'Yggdrasil',min:'Common'}],weight:0.5},
  cactus:{name:'Cactus',sprite:'Cactus_(Mob)',shape:'plant',size:25,hp:80,dmg:14,speed:0,xp:16,
    ai:'still',anim:'plant',drops:['Cactus'],weight:6},
  sandstorm:{name:'Sandstorm',sprite:'Sandstorm',shape:'bug',size:20,hp:60,dmg:18,speed:66,xp:14,
    ai:'wander',anim:'float',drops:['Glass','Dust'],weight:6},
  fire_ant_burrow:{name:'Fire Ant Burrow',sprite:'Fire_Ant_Burrow',shape:'rock',size:30,hp:200,dmg:0,speed:0,xp:18,
    ai:'spawner',anim:'still',tiers:['Common','Unusual','Rare','Epic','Legendary','Mythic'],
    proximitySpawn:{keys:['soldier_fire_ant','soldier_fire_ant','worker_fire_ant'],n:4,range:170},
    diggerChance:0.05,drops:['Disc','Magnet'],weight:3},
  soldier_fire_ant:{name:'Soldier Fire Ant',sprite:'Soldier_Fire_Ant',shape:'ant',size:17,hp:55,dmg:16,speed:72,xp:12,
    ai:'chase',anim:'walk',aggro:400,burning:true,drops:['Yucca','Bone'],weight:7},
  nazar_beetle:{name:'Nazar Beetle',sprite:'Nazar_Beetle',shape:'beetle',size:22,hp:160,dmg:22,speed:66,xp:40,
    ai:'shooter',anim:'walk',aggro:400,keep:210,atk:{type:'dark',cd:2.2,dmg:18,speed:250},
    drops:['Dark_Mark','Third_Eye'],weight:3},
  mummy_beetle:{name:'Mummy Beetle',sprite:'Mummy_Beetle',shape:'beetle',size:22,hp:170,dmg:20,speed:56,xp:42,
    ai:'chase',anim:'walk',aggro:400,undead:3,drops:['Bandage','Ankh','Beetle_Egg'],weight:3},
  trader:{name:'Trader',sprite:'Trader',shape:'bug',size:26,hp:260,dmg:0,speed:46,xp:120,
    ai:'wander',anim:'walk',npc:true,drops:['Coin','Pearl','Stick'],
    rareDrops:[{p:'Yin_Yang',min:'Epic'}],weight:0.4},

  // ================= Ocean（9 种）=================
  bubble:{name:'Bubble',sprite:'Bubble_(Mob)',shape:'plant',size:18,hp:22,dmg:3,speed:52,xp:8,
    ai:'wander',anim:'float',armor:14,popPush:true,drops:['Bubble','Air'],weight:8},
  crab:{name:'Crab',sprite:'Crab',shape:'beetle',size:22,hp:70,dmg:18,speed:66,xp:16,
    ai:'orbit',anim:'walk',aggro:380,orbitR:230,chargeCd:2.6,chargeSpeed:3.0,chargeDur:0.55,
    drops:['Claw','Dust'],weight:7},
  jellyfish:{name:'Jellyfish',sprite:'Jellyfish',shape:'bug',size:20,hp:50,dmg:11,speed:56,xp:13,
    ai:'chase',anim:'float',aggro:300,zap:{range:140,cd:1.3,dmg:9},
    drops:['Lightning','Jelly'],weight:8},
  leech:{name:'Leech',sprite:'Leech',shape:'bug',size:14,hp:40,dmg:10,speed:126,xp:12,
    ai:'leech',anim:'crawl',aggro:420,drain:6,drops:['Faster','Fang'],weight:6},
  shell:{name:'Shell',sprite:'Shell_(Mob)',shape:'rock',size:18,hp:40,dmg:8,speed:56,xp:12,
    ai:'wander',anim:'still',retaliate:'Common',burstChase:2.0,shield:24,
    atk:{type:'pearl',cd:2.6,dmg:7,speed:230},drops:['Sponge','Pearl','Magnet'],weight:7},
  sponge:{name:'Sponge',sprite:'Sponge_(Mob)',shape:'rock',size:22,hp:55,dmg:5,speed:0,xp:13,
    ai:'still',anim:'still',pushable:true,drops:['Sponge','Coral'],weight:4},
  starfish:{name:'Starfish',sprite:'Starfish_(Mob)',shape:'rock',size:18,hp:60,dmg:18,speed:62,xp:14,
    ai:'chase',anim:'walk',aggro:340,retreatAt:0.5,regen:0.08,drops:['Dust','Glass','Starfish'],weight:6},
  scallop:{name:'Scallop',sprite:'Shell_(Mob)',shape:'rock',size:16,hp:45,dmg:6,speed:50,xp:12,
    ai:'wander',anim:'still',retaliate:'Common',atk:{type:'pearl',cd:3.0,dmg:6,speed:210},
    drops:['Pearl','Sponge'],weight:4},
  diver_soldier_ant:{name:'Scuba Soldier Ant',sprite:'Diver_Soldier_Ant',shape:'ant',size:18,hp:60,dmg:14,speed:74,xp:14,
    ai:'wander',anim:'walk',retaliate:'Common',drops:['Dead_Leaf','Bubble'],weight:5},
  oracle:{name:'Oracle',sprite:'Oracle',shape:'bug',size:32,hp:180,dmg:0,speed:55,xp:90,
    ai:'wander',anim:'walk',npc:true,drops:['Compass','Crystal'],
    rareDrops:[{p:'Talisman_of_Evasion',min:'Mythic'},{p:'Yggdrasil',min:'Legendary'}],weight:0.3},

  // ================= Factory（6 种）=================
  mecha_flower:{name:'Mecha Flower',sprite:'Mecha_Flower',shape:'beetle',size:28,hp:120,dmg:12,speed:26,xp:30,
    ai:'still',anim:'still',atk:{type:'laser',cd:2.0,dmg:12,speed:340},drops:['Cogwheel','Mecha_Antennae'],weight:5},
  mecha_wasp:{name:'Mecha Wasp',sprite:null,shape:'wasp',size:22,hp:90,dmg:16,speed:98,xp:24,
    ai:'shooter',tailShot:true,anim:'fly',aggro:440,keep:240,atk:{type:'missile',cd:1.4,dmg:13,speed:380},
    drops:['Mecha_Missile'],weight:5},
  mecha_crab:{name:'Mecha Crab',sprite:null,shape:'beetle',size:26,hp:110,dmg:18,speed:60,xp:26,
    ai:'orbit',anim:'walk',aggro:380,orbitR:240,chargeCd:2.2,chargeSpeed:2.8,chargeDur:0.5,
    drops:['Laser'],weight:4},
  mecha_spider:{name:'Mecha Spider',sprite:null,shape:'spider',size:26,hp:100,dmg:15,speed:96,xp:24,
    ai:'chase',anim:'crawl',aggro:420,drops:['Lightning'],weight:4},
  barrel:{name:'Barrel',sprite:'Barrel',shape:'rock',size:24,hp:150,dmg:10,speed:0,xp:18,
    ai:'still',anim:'still',drops:['Cogwheel','Battery'],weight:4},
  assembler:{name:'Assembler',sprite:'Assembler',shape:'rock',size:34,hp:340,dmg:0,speed:0,xp:150,
    ai:'still',anim:'still',npc:true,tiers:['Rare','Epic','Legendary','Mythic','Ultra','Super'],
    drops:['Cogwheel','Battery'],rareDrops:[{p:'Mecha_Missile',min:'Epic'}],weight:0.5},

  // ================= Ant Hell（16 种）=================
  baby_fire_ant:{name:'Baby Fire Ant',sprite:'Baby_Fire_Ant',shape:'ant',size:9,hp:18,dmg:8,speed:90,xp:5,
    ai:'wander',anim:'walk',burning:true,drops:['Yucca','Light','Broccoli'],weight:8},
  worker_fire_ant:{name:'Worker Fire Ant',sprite:'Worker_Fire_Ant',shape:'ant',size:13,hp:32,dmg:11,speed:84,xp:8,
    ai:'wander',anim:'walk',burning:true,retaliate:'Common',drops:['Yucca','Clay'],weight:8},
  queen_fire_ant:{name:'Queen Fire Ant',sprite:'Queen_Fire_Ant',shape:'ant',size:40,hp:280,dmg:20,speed:40,xp:70,
    ai:'chase',anim:'walk',aggro:420,burning:true,onTimerSpawn:{keys:['baby_fire_ant','worker_fire_ant'],n:1,cd:5},
    drops:['Yucca','Faster'],weight:1.4},
  fire_ant_egg:{name:'Fire Ant Egg',sprite:'Fire_Ant_Egg',shape:'egg',size:12,hp:20,dmg:0,speed:0,xp:6,
    ai:'still',anim:'still',onDeathSpawn:{keys:['baby_fire_ant'],n:1,chance:0.65},drops:['Yucca'],weight:3},
  termite_egg:{name:'Termite Egg',sprite:'Termite_Egg',shape:'egg',size:12,hp:20,dmg:0,speed:0,xp:6,
    ai:'still',anim:'still',onDeathSpawn:{keys:['baby_termite'],n:1,chance:0.65},drops:['Mysterious_Stick'],weight:3},
  worm:{name:'Worm',sprite:'Worm',shape:'bug',size:18,hp:70,dmg:12,speed:44,xp:16,
    ai:'wander',anim:'crawl',retaliate:'Common',burrow:true,drops:['Carrot'],weight:5},
  ghost:{name:'Ghost',sprite:'Ghost',shape:'bug',size:20,hp:90,dmg:16,speed:80,xp:25,
    ai:'chase',anim:'float',aggro:400,phase:true,drops:['Dark_Mark'],weight:3},

  // ================= Hel（5 种）=================
  hel_beetle:{name:'Hel Beetle',sprite:'Hel_Beetle',shape:'beetle',size:28,hp:150,dmg:20,speed:64,xp:35,
    ai:'chase',anim:'walk',aggro:420,drops:['Heavy','Dark_Mark'],weight:5},
  hel_wasp:{name:'Hel Wasp',sprite:'Hel_Wasp',shape:'wasp',size:25,hp:110,dmg:20,speed:104,xp:28,
    ai:'shooter',tailShot:true,anim:'fly',aggro:460,keep:230,atk:{type:'missile',cd:1.3,dmg:15,speed:400},
    drops:['Missile','Dark_Mark'],weight:5},
  hel_centipede:{name:'Hel Centipede',sprite:'Hel_Centipede',shape:'bug',size:24,hp:120,dmg:18,speed:96,xp:30,
    ai:'chase',anim:'crawl',aggro:420,drops:['Dark_Mark'],weight:5},
  hel_spider:{name:'Hel Spider',sprite:'Hel_Spider',shape:'spider',size:25,hp:130,dmg:18,speed:92,xp:30,
    ai:'chase',anim:'crawl',aggro:420,drops:['Web','Dark_Mark'],weight:5},
  gambler:{name:'Gambler',sprite:'Gambler',shape:'bug',size:24,hp:200,dmg:20,speed:62,xp:80,
    ai:'chase',anim:'walk',aggro:420,drops:['Corruption','Dice'],weight:2},

  // ================= Pyramid（4 种）=================
  tomb:{name:'Tomb',sprite:'Tomb',shape:'rock',size:26,hp:200,dmg:10,speed:0,xp:45,
    ai:'still',anim:'still',drops:['Ankh'],weight:4},
  pharaoh_beetle:{name:'Pharaoh Beetle',sprite:'Pharaoh_Beetle',shape:'beetle',size:26,hp:220,dmg:24,speed:62,xp:60,
    ai:'chase',anim:'walk',aggro:440,tiers:['Unusual','Rare','Epic','Legendary','Mythic','Ultra','Super'],
    drops:['Ankh','Dark_Mark'],rareDrops:[{p:'Totem',min:'Legendary'}],weight:3},

  // ================= NPC / 其它 ==================
  titan:{name:'Titan',sprite:'Titan',shape:'beetle',size:62,hp:520,dmg:32,speed:42,xp:260,
    ai:'chase',anim:'walk',aggro:460,npc:true,tiers:['Rare','Epic','Legendary','Mythic','Ultra','Super'],
    drops:['Heavy','Heavy'],rareDrops:[{p:'Stinger',min:'Epic'}],weight:0.2},
  crystal_mob:{name:'Crystal',sprite:'Crystal',shape:'rock',size:28,hp:150,dmg:10,speed:60,xp:70,
    ai:'still',anim:'still',atk:{type:'laser',cd:2.6,dmg:10,speed:300},drops:['Crystal','Glass'],weight:0.5},
  square_mob:{name:'Square',sprite:'Square',shape:'rock',size:24,hp:120,dmg:16,speed:50,xp:100,
    ai:'wander',anim:'walk',retaliate:'Common',drops:['Square'],rareDrops:[{p:'Triangle',min:'Legendary'}],weight:0.3},
};

// 默认值补齐
for(const k in MOBS){
  const m = MOBS[k];
  if(!m.tiers) m.tiers = FULL_TIERS;
  if(m.ai == null) m.ai = 'chase';
  if(m.anim == null) m.anim = 'walk';
  if(m.aggro == null) m.aggro = 340;
  if(m.armor == null) m.armor = 0;
  if(m.size == null) m.size = 20;
}

// ------------------------------------------------------------------
//  体型：florr 单位 → 世界像素（我们的花朵碰撞半径 17，原作 25）
//  稀有度越高体型越大（原作 Ultra 会明显更大）
// ------------------------------------------------------------------
const MOB_SIZE_K = 0.95;
// 稀有度体型倍率（原作里 Legendary 以上会肉眼可见地变大，Super/Eternal 是巨物）。
// 之前用的是很平缓的二次曲线（Super 只有 2.17×），所以 Super 看起来跟普通怪差不多大。
const MOB_GROW = [1.00, 1.10, 1.24, 1.42, 1.68, 2.00, 2.45, 3.10, 4.10, 5.30];
function mobRadius(key, rarity){
  const m = MOBS[key];
  const base = (m ? m.size : 20) * MOB_SIZE_K;
  const ridx = Math.max(0, MOB_RARITY.indexOf(rarity));
  const grow = MOB_GROW[Math.min(ridx, MOB_GROW.length-1)];
  // Legendary 及以上：体型放大 2 倍（用户要求，从 2.5 缩小到 2）
  let big = ridx >= MOB_RARITY.indexOf('Legendary') ? 2.0 : 1;
  // Spider：Epic 及以上体型再增长一倍（用户要求）
  if(key === 'spider' && ridx >= MOB_RARITY.indexOf('Epic')) big *= 2;
  // Dandelion：Legendary 及以上体型增长一倍（用户要求）
  if(key === 'dandelion' && ridx >= MOB_RARITY.indexOf('Legendary')) big *= 2;
  return Math.max(5, base * grow * big);
}

// ------------------------------------------------------------------
//  每个区域的基础稀有度权重（按 wiki 的"区域难度"整理）
//  深处特殊区会整体往上抬（deepBonus）
// ------------------------------------------------------------------
const REGION_RARITY = {
  garden:  {Common:62, Unusual:26, Rare:9,   Epic:2.4,  Legendary:0.5,  Mythic:0.05, Ultra:0.004},
  sewer:   {Common:38, Unusual:34, Rare:19,  Epic:7,    Legendary:1.6,  Mythic:0.3,  Ultra:0.03},
  desert:  {Common:20, Unusual:36, Rare:28,  Epic:12,   Legendary:3.2,  Mythic:0.7,  Ultra:0.05},
  ocean:   {Common:30, Unusual:36, Rare:22,  Epic:9,    Legendary:2.4,  Mythic:0.5,  Ultra:0.06},
  jungle:  {Common:10, Unusual:26, Rare:32,  Epic:22,   Legendary:8,    Mythic:1.8,  Ultra:0.25},
  anthell: {Common:4,  Unusual:16, Rare:28,  Epic:27,   Legendary:17,   Mythic:6.5,  Ultra:1.2},
  factory: {Common:6,  Unusual:18, Rare:28,  Epic:28,   Legendary:15,   Mythic:4.2,  Ultra:0.7},
  hel:     {Common:0.5,Unusual:5,  Rare:17,  Epic:29,   Legendary:30,   Mythic:15,   Ultra:3.2},
  pyramid: {Common:0.4,Unusual:4,  Rare:15,  Epic:28,   Legendary:31,   Mythic:17,   Ultra:4},
  training:{Common:70, Unusual:22, Rare:7,   Epic:0.9,  Legendary:0.08, Mythic:0.004, Ultra:0}
};

// ============================================================
//  掉落表（照着 wiki 每只生物的 Drops 段落 + 旧版 wiki 的百分比）
//  每一项独立判定：Math.random() < 概率 就掉一片，稀有度 = 这只怪的稀有度
// ============================================================
const DROP_TABLE = {
  // ---- Garden ----
  ant_hole:   [['Soil',1.00],['Shovel',0.06]],
  baby_ant:   [['Light',0.44],['Leaf',0.26],['Rice',0.005]],
  worker_ant: [['Leaf',0.28],['Corn',0.006]],
  soldier_ant:[['Glass',0.12],['Clover',0.08]],
  queen_ant:  [['Ant_Egg',0.31],['Basil',0.06]],
  // [wiki] Bee: Fast12% / Stinger7% / Twin3% / Honey1% / Bubble0.6% / Wing0.3%（我们没收录 Fast/Twin）
  bee:        [['Stinger',0.07],['Honey',0.01],['Bubble',0.006],['Wing',0.003]],
  bumble_bee: [['Pollen',0.09],['Honey',0.03]],
  // [wiki] Centipede：Peas 合计 22.6%（Common 19.1% + Unusual 3.5%）、Leaf 3.5%
  centipede:  [['Peas',0.226],['Leaf',0.035]],
  dandelion:  [['Dandelion',0.14]],
  digger:     [['Cutter',0.10],['Uranium',0.02]],
  hornet:     [['Orange',0.14],['Missile',0.09],['Antennae',0.0003]],
  ladybug:    [['Rose',0.36],['Light',0.08]],
  rock:       [['Rock',0.10],['Heavy',0.03]],
  spider:     [['Web',0.09],['Faster',0.03],['Third_Eye',0.0002]]
};

// 区域之外（deep zone）整体抬一档的概率
const DEEP_CHANCE = 0.18;

// ============================================================
//  生成机制（照 wiki「Mob spawner」实现）
//   · 每个刷怪点有一个 difficulty，决定能刷出的稀有度
//   · 附近玩家的 Luck 之和会按 log_1.3(1+Σluck) 加上去
//   · 高 difficulty 的刷怪点完全刷不出低档怪；低难度只有极小概率出高档
// ============================================================
const RARITY_DIFF = {Common:0, Unusual:7, Rare:16, Epic:25, Legendary:34,
                     Mythic:48, Ultra:62, Super:76, Eternal:90, Unique:100};
const REGION_DIFF = {garden:1, sewer:12, jungle:18, desert:22, ocean:18,
                     factory:30, anthell:28, hel:42, pyramid:44, training:0};
const SPAWN_SIGMA = 6;

function spawnDifficulty(regionId, deep, luck){
  const base = (REGION_DIFF[regionId] != null) ? REGION_DIFF[regionId] : 10;
  const lk = Math.max(0, luck || 0);
  return base + (deep ? 12 : 0) + Math.log(1 + lk)/Math.log(1.3);
}
function rollRarityByDifficulty(D, tiers){
  const list = (tiers && tiers.length ? tiers : FULL_TIERS).filter(r=>RARITY_DIFF[r]!=null);
  let total = 0; const out = [];
  for(const r of list){
    const t = RARITY_DIFF[r];
    let w = Math.exp(-0.5*Math.pow((D - t)/SPAWN_SIGMA, 2));
    if(t > D) w *= 0.5;                    // 高于刷怪点难度的档：只有小概率
    if(D - t > 3*SPAWN_SIGMA) w = 0;       // 难度远超这档：完全刷不出来
    if(w <= 0) continue;
    out.push([r, w]); total += w;
  }
  if(!out.length) return (list[0] || 'Common');
  let x = Math.random()*total;
  for(const [r,w] of out){ x -= w; if(x<=0) return r; }
  return out[out.length-1][0];
}

// ============================================================
//  索敌机制（wiki：每种怪有「aggression radius」，单位是格）
//    Soldier Ant 6 格 / Beetle 12 格 / Hornet 12 格 / Spider 12 格（蜘蛛视野最大）
//  换算到本作：1 格 ≈ 64px（地块 128px 的一半），所以 6 格 ≈ 384px
// ============================================================
// 1「格」= 半张地块（原作里视野/索敌距离都是按格算的）。
// 注意别再写死像素：地块尺寸改过一次（128→170），写死会让所有怪的索敌圈缩水。
const AGGRO_UNIT_TILES = 0.5;
function aggroUnit(){ return (typeof TILE === 'number' ? TILE : 170) * AGGRO_UNIT_TILES; }
const MOB_AGGRO_U = {
  soldier_ant:6, worker_ant:4, baby_ant:3, queen_ant:6, soldier_fire_ant:6,
  spider:12, spider_sewer:12, beetle:12, hornet:12, wasp:10, mantis:8,
  evil_centipede:7, desert_centipede:6, hel_centipede:7, centipede:5,
  crab:8, jellyfish:6, leech:7, scorpion:11, bumble_bee:8, bee:5,
  hel_wasp:12, mecha_wasp:12, mecha_spider:12, mecha_crab:9,
  mummy_beetle:11, pharaoh_beetle:11, nazar_beetle:10, ladybug:6, ladybug_jungle:6,
  termite_overmind:8, soldier_termite:6, fire_ant_burrow:5, sandstorm:10,
  fly:4, moth:5, roach:5, silverfish:5, ghost:9, titan:14, diver_soldier_ant:6
};
function mobAggroRadius(key, def){
  const u = MOB_AGGRO_U[key];
  if(u) return u * aggroUnit();
  return (def && def.aggro) ? def.aggro : 340;
}

// 刷怪点被替换成特殊怪（wiki：Ghost / Square / Magic Firefly / Shiny Ladybug 可以替换任何刷怪点的生物）
const SPAWN_REPLACE = [
  {key:'ghost',           p:0.0016, regions:['hel','pyramid','anthell']},
  {key:'square_mob',      p:0.0012, regions:null},
  {key:'magic_firefly',   p:0.0020, regions:['jungle']},
  {key:'shiny_ladybug',   p:0.0015, regions:['desert','garden']}
];


// ------------------------------------------------------------------
//  REGIONS
//  pools: [mobKey, weight]  按 wiki 的实际分布给权重
// ------------------------------------------------------------------
const REGIONS = [
  {id:'garden', name:'Garden', bg:'#7cb342', bg2:'#689f38',
    pools:[['baby_ant',3],['worker_ant',3],['soldier_ant',2.4],['queen_ant',0.5],['ant_hole',1.2],
           ['bee',2.6],['bumble_bee',0.7],['ladybug',2.6],['centipede',1.6],
           ['spider',1.8],['rock',1.2],['dandelion',1.6],['hornet',1]]},
  {id:'sewer', name:'Sewers', bg:'#5a6e4f', bg2:'#3f4f3a',
    pools:[['fly',3.4],['moth',2.4],['roach',3],['spider_sewer',2],['garbage',1.6],['silverfish',2.2]]},
  {id:'jungle', name:'Jungle', bg:'#4caf50', bg2:'#2e7d32',
    pools:[['leafbug',3],['golden_leafbug',1.2],['bush',2],['wasp',2.2],['mantis',1.4],
           ['termite_mound',1.2],['baby_termite',2],['worker_termite',2],['soldier_termite',1.6],
           ['termite_overmind',0.25],['firefly',1.6],['magic_firefly',0.3],['ladybug_jungle',1.4]]},
  {id:'desert', name:'Desert', bg:'#e0c068', bg2:'#c9a23f',
    pools:[['beetle',3.2],['desert_centipede',2.4],['cactus',2.2],['sandstorm',2.2],
           ['scorpion',1.6],['shiny_ladybug',0.12],['fire_ant_burrow',0.8],
           ['soldier_fire_ant',1.4],['nazar_beetle',0.7],['mummy_beetle',0.5],['trader',0.05]]},
  {id:'ocean', name:'Ocean', bg:'#3f9bd6', bg2:'#2b6fa8',
    pools:[['bubble',3],['crab',2.6],['jellyfish',3],['leech',1.4],['shell',2.4],
           ['sponge',1.2],['starfish',2.2],['scallop',1.2],['diver_soldier_ant',1],['oracle',0.05]]},
  {id:'factory', name:'Factory', bg:'#7a7f8a', bg2:'#565b66',
    pools:[['mecha_flower',2.4],['mecha_wasp',2.2],['mecha_crab',1.8],['mecha_spider',2],
           ['barrel',1.6],['assembler',0.1]]},
  {id:'anthell', name:'Ant Hell', bg:'#6b3a2e', bg2:'#4a251c',
    pools:[['ant_egg',2],['baby_ant',2],['worker_ant',2],['soldier_ant',2],['queen_ant',0.4],
           ['baby_fire_ant',2],['worker_fire_ant',2],['soldier_fire_ant',1.8],['queen_fire_ant',0.35],
           ['fire_ant_egg',1.4],['baby_termite',1.8],['worker_termite',1.8],['soldier_termite',1.5],
           ['termite_egg',1.2],['termite_overmind',0.2],['worm',1.4]]},
  {id:'hel', name:'Hel', bg:'#2b2b3a', bg2:'#15151f',
    pools:[['hel_centipede',2.6],['hel_wasp',2.4],['hel_spider',2.4],['hel_beetle',2.2],
           ['gambler',1],['ghost',1.6],['titan',0.12]]},
  {id:'pyramid', name:'Pyramid', bg:'#caa45a', bg2:'#9c7a36',
    pools:[['tomb',2.4],['mummy_beetle',2.2],['pharaoh_beetle',1.4],['nazar_beetle',1.8],
           ['titan',0.1]]},
  {id:'training', name:'Training Grounds', bg:'#4a6a4a', bg2:'#2f4630',
    pools:[['baby_ant',2],['worker_ant',2],['ladybug',2],['rock',1.4],['bubble',1.4],
           ['dandelion',1.2],['digger',0.6],['square_mob',0.2],['crystal_mob',0.2]]},
];

// ---- 单张地图的墙体家族覆盖（不写就用 game.js 里的 SOLID_FAMILIES）----
// 原件里下水道/工厂用独立图块，语义和自然地形不一样，所以按地图单独配置。
// 下水道（sewers）：grate = 橙色格栅走道（地面），sewage = 橄榄绿污水（墙），dirt = 土堆（墙）。
//   依据：原作 sewers.tmj 的 spawn_mobs 多边形（type="spawn_mobs"，带 density/difficulty）
//   100% 落在 grate 上，一块 sewage 都没压到；而把两者对调后会变成 30 块互不相连的
//   水池、只有 29% 可达，所以 grate 必须是地面。
// 想对调可以直接写：
//   sewers: ['dirt','water','grate']      // 竖着的格栅当墙、污水当地面
const MAP_SOLID = {};

// 白名单：这几张图的"地面"只有列出的家族，其余一律阻挡。
// 依据原作地形：下水道是架空格栅走道（橙色栅格），污水面与土堆都是墙；
// 工厂只有浅灰地板可站，灰色方块是墙，中心那套蓝色通风管是 shortcut，可以走。
const MAP_WALK = {
  sewers:  ['grate'],
  factory: ['factory_floor','vent']
};

// 白名单地图里必须强行凿开的格子 [tx,ty]。
// 工厂南墙上的 to_garden 传送门被 factory_wall 盖住了，不开洞玩家出不去。
const MAP_HOLES = {
  factory: [[15,88]]
};

// ---- region background images (from the maps/ folder) ----
const REGION_BG = {
  garden:'Garden', sewer:'Sewage_c_0', jungle:'Jungle', desert:'Desert',
  ocean:'Ocean', factory:'Factory_floor_c_0', anthell:'Ant_Hell',
  hel:'Hel_c_0', pyramid:'Pyramid', training:'Garden'
};
REGIONS.forEach(r=>{ r.bgImg = REGION_BG[r.id] ? 'assets/maps/'+REGION_BG[r.id]+'.webp' : null; });

// ---- authentic florr tilemap (.tmj decoded -> maps_tmj/<id>.js) ----
const REGION_MAP = {
  garden:'garden', sewer:'sewers', jungle:'jungle', desert:'desert',
  ocean:'ocean', factory:'factory', anthell:'ant_hell', hel:'hel',
  training:'training_grounds', pyramid:null
};
REGIONS.forEach(r=>{
  const id = REGION_MAP[r.id] || null;
  r.mapId = id;
  r.map = id ? 'assets/maps_tmj/'+id+'.json' : null;
  r.mapJs = id ? 'assets/maps_tmj/'+id+'.js' : null;
});

const MAP_IMG = {};
function getMapImage(src){
  if(MAP_IMG[src]) return MAP_IMG[src];
  const i = new Image(); i.src = src; MAP_IMG[src] = i;
  return MAP_IMG[src];
}

// ------------------------------------------------------------------
//  生成：先按池子摇生物，再按"区域稀有度表"摇稀有度
//  生物自身的 tiers 会过滤掉它不该有的稀有度
// ------------------------------------------------------------------
function rollMobKey(region){
  const pools = region.pools;
  let total=0; for(const [k,w] of pools) total+=w;
  let x=Math.random()*total;
  for(const [k,w] of pools){ x-=w; if(x<=0) return k; }
  return pools[0][0];
}

function regionRarityWeights(region, deep){
  const base = REGION_RARITY[region.id] || REGION_RARITY.garden;
  const out = {};
  const order = MOB_RARITY;
  for(const r of order){
    const w = base[r] || 0;
    if(!w) continue;
    // 深处特殊区：整体往高档抬一格（等价于刷高一级的概率大幅提升）
    if(deep){
      const i = order.indexOf(r);
      out[r] = w * (i > 0 ? 0.75 : 0.6) + (base[order[i-1]] || 0) * 0.45;
    } else out[r] = w;
  }
  return out;
}

// 稀有度上限由玩家等级软限制：越级刷怪会很少
function levelGate(ridx, level){
  const soft = 2 + level/5;                 // 等级越高能见到的档位越高
  if(ridx <= soft) return 1;
  return Math.max(0.02, Math.pow(0.45, ridx-soft));
}

function rollMobRarity(mob, region, level, deep){
  const tiers = mob.tiers || FULL_TIERS;
  const w = regionRarityWeights(region, deep);
  let total = 0; const list = [];
  for(const r of tiers){
    const base = w[r] || 0;
    if(base <= 0) continue;
    const ww = base * levelGate(MOB_RARITY.indexOf(r), level||1);
    if(ww <= 0) continue;
    list.push([r, ww]); total += ww;
  }
  if(!list.length) return tiers[0];
  let x = Math.random()*total;
  for(const [r, ww] of list){ x -= ww; if(x<=0) return r; }
  return list[list.length-1][0];
}

// 区域能刷到的稀有度范围（给 UI / 图鉴用）
// share：只统计占比 >= share 的档位（默认 5%），这样显示的是"平时能见到的范围"；
// 传 0.0005 就得到"深处特殊区能刷到的上限"。
function regionRarityRange(region, share){
  const w = REGION_RARITY[region.id] || REGION_RARITY.garden;
  let total = 0; for(const k in w) total += w[k];
  if(total <= 0) return ['Common','Common'];
  const th = (share==null?0.05:share) * total;
  const rs = MOB_RARITY.filter(r => (w[r]||0) >= th);
  return rs.length ? [rs[0], rs[rs.length-1]] : ['Common','Common'];
}
