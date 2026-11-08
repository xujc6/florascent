// ============================================================
//  florr.io Talents —— 逐项对照权威基准：
//    https://florrio.wiki.gg/zh/wiki/天赋   （中文，逐档数值/成本/要求）
//    https://florrio.wiki.gg/wiki/Talents  （英文，逐档描述原文 + 精确分叉点）
//    https://florrio.fandom.com/zh/wiki/天赋
//
//  17 棵树、每树稀有度层级、每档 TP、跨树前置「精确到具体档位」、
//  效果数值、描述文本均照抄，不做简化/替换。
//
//  原版加点规则（wiki 原文）：
//   「未点亮的天赋显示为灰色并标有数字，数字表示点亮至那一级天赋
//     所需的总天赋点。」
//   「长按一个天赋图标以点亮那个天赋，选择的天赋和它的分支下方的
//     所有天赋都将被点亮；也可以通过长按已经点亮的天赋来取消升级，
//     该天赋和它的分支上面的所有天赋都将被撤销。」
//  => HOLD 加点 / 连买整条前置链 / 连撤全部后继 / 节点数字为累计总 TP
// ============================================================
'use strict';

// 原版稀有度顺序
const TALENT_RARITY_ORDER = ['Common','Unusual','Rare','Epic','Legendary','Mythic','Ultra','Super','Eternal'];

// 通用说明（用于 tooltip 尾部）
const LUCK_NOTE = 'Luck is used by specific petals to change their stats. Luck also increases the rarity of mobs that spawn around you.';
const MEDIC_NOTE = 'Affects allies healed by your petals.';

const TALENTS = [
  // 1 ---------------------------------------------------------- 触角
  {
    id:'antennae', name:'Antennae', icon:'Antennae_Talent',
    desc:'Talents which increase the player\'s base FoV.',
    req:{tree:'loadout', key:'Common'},          // Branches off Common Loadout
    tiers:[
      {r:'Rare',      cost:1, effect:{visionMult:1.25}, text:'Increases Vision Range by 25%.'},
      {r:'Epic',      cost:3, effect:{visionMult:1.50}, text:'Increases Vision Range from 25% to 50%.'},
      {r:'Legendary', cost:5, effect:{visionMult:2.00}, text:'Increases Vision Range from 50% to 100%.'},
    ]
  },
  // 2 ---------------------------------------------------------- 身体毒性
  {
    id:'bodyToxicity', name:'Body Toxicity', icon:'Body_Toxicity',
    desc:'Adds some Poison Damage to the player\'s Body Damage.',
    req:{tree:'sharpEdges', key:'Mythic'},       // 原版 body_toxicity <- body_damage6 (Mythic)
    tiers:[
      {r:'Ultra', cost:10, effect:{bodyTox:true},
       text:'When colliding with an enemy, deals additional damage equal to 0.6x Body Damage as Poison over 1 second.'},
    ]
  },
  // 3 ---------------------------------------------------------- 浓缩剧毒
  {
    id:'concentratedPoison', name:'Concentrated Poison', icon:'Concentrated_Poison',
    desc:'Increases the speed at which Poison Damage is dealt, shortening the overall time a target remains Poisoned.',
    req:{tree:'poison', key:'Rare'},             // Branches off Rare Poison
    tiers:[
      {r:'Super', cost:15, effect:{poison:0.20, poisonDur:-0.167},
       text:'Increases Poison damage per second by 20%. Decreases Poison duration by 16.67%.'},
    ]
  },
  // 4 ---------------------------------------------------------- 重瓣
  {
    id:'duplicator', name:'Duplicator', icon:'Duplicator',
    desc:'Talents which increase the number of particles of petals.',
    req:{tree:'loadout', key:'Epic'},            // Branches off Epic Loadout
    tiers:[
      {r:'Legendary', cost:10, effect:{dup:1},
       text:'Adds an extra copy for petals that have at least 2 copies.'},
      {r:'Ultra', cost:20, effect:{dup:1},
       text:'Adds an extra copy for petals that have at least 2 copies.'},
      {r:'Super', cost:30, effect:{dupLeftmost:1},
       text:'Adds an extra copy for the left-most petal in the loadout. Does not affect Eternal and Unique petals. Does not affect Unstackable petals.'},
      {r:'Eternal', cost:40, effect:{dupAllRarity:true},
       text:'Allows the previous talent to affect Eternal and Unique petals.'},
    ]
  },
  // 5 ---------------------------------------------------------- 血量
  {
    id:'health', name:'Health', icon:'Health',
    desc:'Increases the base Flower Health.',
    tiers:[
      {r:'Common',    cost:2,  effect:{health:0.30}, text:'Increases base Flower Health by 30%.'},
      {r:'Unusual',   cost:5,  effect:{health:0.30}, text:'Increases base Flower Health from 130% to 169%.'},
      {r:'Rare',      cost:8,  effect:{health:0.30}, text:'Increases base Flower Health from 169% to 220%.'},
      {r:'Epic',      cost:11, effect:{health:0.30}, text:'Increases base Flower Health from 220% to 286%.'},
      {r:'Legendary', cost:14, effect:{health:0.30}, text:'Increases base Flower Health from 286% to 371%.'},
      {r:'Mythic',    cost:17, effect:{health:0.30}, text:'Increases base Flower Health from 371% to 483%.'},
      {r:'Ultra',     cost:20, effect:{health:0.30}, text:'Increases base Flower Health from 483% to 627%.'},
      {r:'Super',     cost:21, effect:{health:0.30}, text:'Increases base Flower Health from 627% to 816%.'},
      {r:'Eternal',   cost:24, effect:{health:0.30}, text:'Increases base Flower Health from 816% to 1060%.'},
    ]
  },
  // 6 ---------------------------------------------------------- 槽位
  {
    id:'loadout', name:'Loadout', icon:'Loadout',
    desc:'Talents which add extra petal slots.',
    tiers:[
      {r:'Common',    cost:3,  effect:{slots:1}, text:'Adds a 6th loadout slot to equip petals.'},
      {r:'Unusual',   cost:6,  effect:{slots:1}, text:'Adds a 7th loadout slot to equip petals.'},
      {r:'Rare',      cost:9,  effect:{slots:1}, text:'Adds an 8th loadout slot to equip petals.'},
      {r:'Epic',      cost:12, effect:{slots:1}, text:'Adds a 9th loadout slot to equip petals.'},
      {r:'Legendary', cost:15, effect:{slots:1}, text:'Adds a 10th loadout slot to equip petals.'},
    ]
  },
  // 7 ---------------------------------------------------------- 幸运
  {
    id:'luck', name:'Luck', icon:'Luck',
    desc:'Increases Luck, which changes specific petal stats and mob spawn rarities.',
    tiers:[
      {r:'Common',    cost:2,  effect:{luck:0.10}, text:'Increases Luck by 0.1. '+LUCK_NOTE},
      {r:'Unusual',   cost:3,  effect:{luck:0.20}, text:'Increases Luck by 0.2. (Total 0.3) '+LUCK_NOTE},
      {r:'Rare',      cost:4,  effect:{luck:0.20}, text:'Increases Luck by 0.2. (Total 0.5) '+LUCK_NOTE},
      {r:'Epic',      cost:5,  effect:{luck:0.20}, text:'Increases Luck by 0.2. (Total 0.7) '+LUCK_NOTE},
      {r:'Legendary', cost:6,  effect:{luck:0.30}, text:'Increases Luck by 0.3. (Total 1) '+LUCK_NOTE},
      {r:'Mythic',    cost:7,  effect:{luck:0.40}, text:'Increases Luck by 0.4. (Total 1.4) '+LUCK_NOTE},
      {r:'Ultra',     cost:8,  effect:{luck:0.40}, text:'Increases Luck by 0.4. (Total 1.8) '+LUCK_NOTE},
      {r:'Super',     cost:9,  effect:{luck:0.50}, text:'Increases Luck by 0.5. (Total 2.3) '+LUCK_NOTE},
      {r:'Eternal',   cost:10, effect:{luck:0.50}, text:'Increases Luck by 0.5. (Total 2.8) '+LUCK_NOTE},
    ]
  },
  // 8 ---------------------------------------------------------- 磁性
  {
    id:'magnetism', name:'Magnetism', icon:'Magnetism',
    desc:'Increases the player\'s loot pick-up radius as if a Magnet was permanently in use.',
    req:{tree:'loadout', key:'Legendary'},       // Branches off Legendary Loadout
    tiers:[
      {r:'Mythic', cost:15, effect:{magnet:1000},
       text:'Increases petal pick up range by 1000 while alive.'},
    ]
  },
  // 9 ---------------------------------------------------------- 治疗
  {
    id:'medic', name:'Medic', icon:'Medic',
    desc:'Increases Healing from your petals.',
    tiers:[
      {r:'Common',    cost:2,  effect:{medic:0.15},    text:'Increases Healing from your petals from 100% to 115%.'},
      {r:'Unusual',   cost:5,  effect:{medic:0.15},    text:'Increases Healing from your petals from 115% to 132.25%. '+MEDIC_NOTE},
      {r:'Rare',      cost:8,  effect:{medic:0.15},    text:'Increases Healing from your petals from 132.25% to 152.09%. '+MEDIC_NOTE},
      {r:'Epic',      cost:11, effect:{medic:0.15},    text:'Increases Healing from your petals from 152.09% to 174.9%. '+MEDIC_NOTE},
      {r:'Legendary', cost:14, effect:{medic:0.15},    text:'Increases Healing from your petals from 174.9% to 201.14%. '+MEDIC_NOTE},
      {r:'Mythic',    cost:17, effect:{medic:0.15},    text:'Increases Healing from your petals from 201.14% to 231.32%. '+MEDIC_NOTE},
      {r:'Ultra',     cost:20, effect:{medic:0.15},    text:'Increases Healing from your petals from 231.32% to 266%. '+MEDIC_NOTE},
      {r:'Super',     cost:23, effect:{medic:0.15},    text:'Increases Healing from your petals from 266% to 305.9%. '+MEDIC_NOTE},
      {r:'Eternal',   cost:26, effect:{medic:0.3225},  text:'Increases Healing from your petals from 305.9% to 404.56%. '+MEDIC_NOTE},
    ]
  },
  // 10 --------------------------------------------------------- 花瓣耐久
  {
    id:'petalHealth', name:'Petal Health', icon:'Petal_Health',
    desc:'Increases the Health of your petals.',
    tiers:[
      {r:'Common',    cost:2,  effect:{petalHealth:0.15},    text:'Increases Petal Health from 100% to 115%.'},
      {r:'Unusual',   cost:4,  effect:{petalHealth:0.15},    text:'Increases Petal Health from 115% to 132.25%.'},
      {r:'Rare',      cost:6,  effect:{petalHealth:0.15},    text:'Increases Petal Health from 132.25% to 152.09%.'},
      {r:'Epic',      cost:8,  effect:{petalHealth:0.15},    text:'Increases Petal Health from 152.09% to 174.9%.'},
      {r:'Legendary', cost:10, effect:{petalHealth:0.15},    text:'Increases Petal Health from 174.9% to 201.14%.'},
      {r:'Mythic',    cost:12, effect:{petalHealth:0.15},    text:'Increases Petal Health from 201.14% to 231.32%.'},
      {r:'Ultra',     cost:14, effect:{petalHealth:0.15},    text:'Increases Petal Health from 231.32% to 266%.'},
      {r:'Super',     cost:16, effect:{petalHealth:0.15},    text:'Increases Petal Health from 266% to 305.9%.'},
      {r:'Eternal',   cost:18, effect:{petalHealth:0.3225},  text:'Increases Petal Health from 305.9% to 404.56%.'},
    ]
  },
  // 11 --------------------------------------------------------- 转速
  {
    id:'petalRotation', name:'Petal Rotation', icon:'Petal_Rotation',
    desc:'Increases the base petal Rotation Speed.',
    tiers:[
      {r:'Common',    cost:1, effect:{rot:0.6}, text:'Increases petal Rotation Speed from 2.5 to 3.1 rad/s.'},
      {r:'Unusual',   cost:2, effect:{rot:0.6}, text:'Increases petal Rotation Speed from 3.1 to 3.7 rad/s.'},
      {r:'Rare',      cost:3, effect:{rot:0.6}, text:'Increases petal Rotation Speed from 3.7 to 4.3 rad/s.'},
      {r:'Epic',      cost:4, effect:{rot:0.6}, text:'Increases petal Rotation Speed from 4.3 to 4.9 rad/s.'},
      {r:'Legendary', cost:5, effect:{rot:0.6}, text:'Increases petal Rotation Speed from 4.9 to 5.5 rad/s.'},
    ]
  },
  // 12 --------------------------------------------------------- 剧毒（9 档：1 普通 1 罕见 7 稀有）
  {
    id:'poison', name:'Poison', icon:'Poison',
    desc:'Increases all Poison damage. Effect is additive.',
    tiers:[
      {r:'Common',  cost:1, effect:{poisonFlat:0.0625}, text:'Increases all Poison damage by 6.25%.'},
      {r:'Unusual', cost:2, effect:{poisonFlat:0.0625}, text:'Increases all Poison damage by 6.25%. (Total 12.5%)'},
      {r:'Rare',             cost:3, effect:{poisonFlat:0.0625}, text:'Increases all Poison damage by 6.25%. (Total 18.75%)'},
      {r:'Rare', key:'Rare2', cost:3, effect:{poisonFlat:0.0625}, text:'Increases all Poison damage by 6.25%. (Total 25%)'},
      {r:'Rare', key:'Rare3', cost:3, effect:{poisonFlat:0.0625}, text:'Increases all Poison damage by 6.25%. (Total 31.25%)'},
      {r:'Rare', key:'Rare4', cost:3, effect:{poisonFlat:0.0625}, text:'Increases all Poison damage by 6.25%. (Total 37.5%)'},
      {r:'Rare', key:'Rare5', cost:3, effect:{poisonFlat:0.0625}, text:'Increases all Poison damage by 6.25%. (Total 43.75%)'},
      {r:'Rare', key:'Rare6', cost:3, effect:{poisonFlat:0.0625}, text:'Increases all Poison damage by 6.25%. (Total 50%)'},
      {r:'Rare', key:'Rare7', cost:3, effect:{poisonFlat:0.0625}, text:'Increases all Poison damage by 6.25%. (Total 56.25%)'},
    ]
  },
  // 13 --------------------------------------------------------- 攻击范围
  {
    id:'reach', name:'Reach', icon:'Reach',
    desc:'Talents which increase the player\'s base Reach.',
    req:{tree:'loadout', key:'Unusual'},         // Branches off Unusual Loadout
    tiers:[
      {r:'Rare',   cost:3, effect:{reach:50}, text:'Increases petal Attack Range by 50.'},
      {r:'Mythic', cost:6, effect:{reach:50}, text:'Increases petal Attack Range by 50. (Total 100)'},
      {r:'Super',  cost:9, effect:{reach:50}, text:'Increases petal Attack Range by 50. (Total 150)'},
    ]
  },
  // 14 --------------------------------------------------------- 刷新
  {
    id:'reload', name:'Reload', icon:'Reload',
    desc:'Decreases petal reload time and the minimum reload time when swapping petals.',
    tiers:[
      {r:'Common',    cost:2,  effect:{reload:-0.10}, text:'Decreases the reload time for petals by -10%. Decreases minimum reload time when swapping petals from 2.5s to 2s.'},
      {r:'Unusual',   cost:6,  effect:{reload:-0.10}, text:'Decreases the reload time for petals from -10% to -19%. Decreases minimum reload time when swapping petals from 2s to 1.5s.'},
      {r:'Rare',      cost:10, effect:{reload:-0.10}, text:'Decreases the reload time for petals from -19% to -27.1%. Decreases minimum reload time when swapping petals from 1.5s to 1s.'},
      {r:'Epic',      cost:12, effect:{reload:-0.10}, text:'Decreases the reload time for petals from -27.1% to -34.39%. Decreases minimum reload time when swapping petals from 1s to 0.5s.'},
      {r:'Legendary', cost:16, effect:{reload:-0.20}, text:'Decreases the reload time for petals from -34.39% to -47.51%. Decreases minimum reload time when swapping petals from 0.5s to 0s.'},
      {r:'Mythic',    cost:20, effect:{reload:-0.20}, text:'Decreases the reload time for petals from -47.51% to -58.01%.'},
      {r:'Ultra',     cost:24, effect:{reload:-0.20}, text:'Decreases the reload time for petals from -58.01% to -66.41%.'},
      {r:'Super',     cost:28, effect:{reload:-0.20}, text:'Decreases the reload time for petals from -66.41% to -73.13%.'},
      {r:'Eternal',   cost:32, effect:{reload:-0.30}, text:'Decreases the reload time for petals from -73.13% to -81.19%.'},
    ]
  },
  // 15 --------------------------------------------------------- 第二次机会
  {
    id:'secondChance', name:'Second Chance', icon:'Second_Chance',
    desc:'Talents which grant the player the ability to avoid dying from otherwise lethal damage, with a cooldown.',
    req:{tree:'health', key:'Rare'},             // Branches off Rare Health
    tiers:[
      {r:'Legendary', cost:10, effect:{sc:{dur:0.3, cd:60}},
       text:'Prevents death for 0.3s upon taking fatal damage. Has a 60s cooldown.'},
      {r:'Mythic', cost:20, effect:{sc:{dur:1.5, cd:30}},
       text:'Increases duration to 1.5s, decreases cooldown to 30s.'},
    ]
  },
  // 16 --------------------------------------------------------- 锐利边缘
  {
    id:'sharpEdges', name:'Sharp Edges', icon:'Sharp_Edges',
    desc:'Talents which increase the player\'s Body Damage. Effect is multiplicative.',
    tiers:[
      {r:'Common',    cost:2, effect:{bodyDmg:0.38}, text:'Increases Body Damage by 38%.'},
      {r:'Unusual',   cost:3, effect:{bodyDmg:0.38}, text:'Increases Body Damage by 38%. (Total 90.4%)'},
      {r:'Rare',      cost:4, effect:{bodyDmg:0.38}, text:'Increases Body Damage by 38%. (Total 162.8%)'},
      {r:'Epic',      cost:5, effect:{bodyDmg:0.38}, text:'Increases Body Damage by 38%. (Total 262.7%)'},
      {r:'Legendary', cost:6, effect:{bodyDmg:0.38}, text:'Increases Body Damage by 38%. (Total 400.5%)'},
      {r:'Mythic',    cost:7, effect:{bodyDmg:0.38}, text:'Increases Body Damage by 38%. (Total 590.7%)'},
      {r:'Ultra',     cost:8, effect:{bodyDmg:0.38}, text:'Increases Body Damage by 38%. (Total 853.1%)'},
      {r:'Super',     cost:9, effect:{bodyDmg:0.38}, text:'Increases Body Damage by 38%. (Total 1215.3%)'},
    ]
  },
  // 17 --------------------------------------------------------- 召唤师
  {
    id:'summoner', name:'Summoner', icon:'Summoner',
    desc:'Increases the Health of summoned mobs.',
    tiers:[
      {r:'Common',    cost:2,  effect:{summonHp:0.10}, text:'Increases Health of summoned mobs from 100% to 110%.'},
      {r:'Unusual',   cost:5,  effect:{summonHp:0.10}, text:'Increases Health of summoned mobs from 110% to 121%.'},
      {r:'Rare',      cost:8,  effect:{summonHp:0.10}, text:'Increases Health of summoned mobs from 121% to 133.1%.'},
      {r:'Epic',      cost:11, effect:{summonHp:0.10}, text:'Increases Health of summoned mobs from 133.1% to 146.4%.'},
      {r:'Legendary', cost:14, effect:{summonHp:0.10}, text:'Increases Health of summoned mobs from 146.4% to 161.1%.'},
      {r:'Mythic',    cost:17, effect:{summonHp:0.10}, text:'Increases Health of summoned mobs from 161.1% to 177.2%.'},
      {r:'Ultra',     cost:20, effect:{summonHp:0.10}, text:'Increases Health of summoned mobs from 177.2% to 194.9%.'},
      {r:'Super',     cost:23, effect:{summonHp:0.10}, text:'Increases Health of summoned mobs from 194.9% to 214.4%.'},
      {r:'Eternal',   cost:26, effect:{summonHp:0.21}, text:'Increases Health of summoned mobs from 214.4% to 259.4%.'},
    ]
  },
];

// 天赋唯一 id：稀有度重复时用 tier.key 区分（兼容旧存档 id:rarity）
function talentId(tree, tier){ return tree.id + ':' + (tier.key || tier.r); }

// fast lookup: talent id -> {tree, tier, idx}
const TALENT_INDEX = {};
TALENTS.forEach(t=>{
  t.tiers.forEach((tier,i)=>{ TALENT_INDEX[talentId(t,tier)] = {tree:t, tier, idx:i}; });
});
function talentTreeById(id){ return TALENTS.find(t=>t.id===id); }
function tierIndexByKey(tree, key){
  return tree.tiers.findIndex(ti => (ti.key || ti.r) === key);
}

// ------------------------------------------------------------
// 前置链：从根（花朵）一路到某个节点的完整节点序列。
// 跨树前置用 tree.req（精确到具体档位），同树前置为上一档。
// ------------------------------------------------------------
function talentChain(tree, idx, seen){
  seen = seen || new Set();
  const out = [];
  if(tree.req){
    const rt = talentTreeById(tree.req.tree);
    if(rt){
      const ri = tierIndexByKey(rt, tree.req.key);
      if(ri >= 0) out.push(...talentChain(rt, ri, seen));
    }
  }
  for(let i=0;i<=idx;i++){
    const id = talentId(tree, tree.tiers[i]);
    if(seen.has(id)) continue;
    seen.add(id); out.push({tree, idx:i, tier:tree.tiers[i], id});
  }
  return out;
}

// 累计总 TP：点亮至该节点所需的所有天赋点（含跨树前置），
// 也就是原版未点亮节点上显示的那个数字。
function talentCumulativeTP(tree, idx){
  let sum = 0;
  for(let i=0;i<=idx;i++) sum += tree.tiers[i].cost;
  if(tree.req){
    const rt = talentTreeById(tree.req.tree);
    if(rt){
      const ri = tierIndexByKey(rt, tree.req.key);
      if(ri >= 0) sum += talentCumulativeTP(rt, ri);
    }
  }
  return sum;
}

// 某棵树是否已点亮任意一档（旧接口保留，供存档兼容）
function treeOwnedAny(treeId, owned){
  const t = talentTreeById(treeId);
  if(!t) return false;
  return t.tiers.some(ti=>owned.has(talentId(t,ti)));
}

// 单档能否购买：跨树前置精确到档位，同树前置为上一档
function canBuyTalent(treeId, key, owned){
  const id = treeId+':'+key;
  if(owned.has(id)) return false;
  const info = TALENT_INDEX[id];
  if(!info) return false;
  const t = info.tree;
  if(t.req){
    const rt = talentTreeById(t.req.tree);
    if(!rt) return false;
    const ri = tierIndexByKey(rt, t.req.key);
    if(ri < 0 || !owned.has(talentId(rt, rt.tiers[ri]))) return false;
  }
  if(info.idx > 0 && !owned.has(talentId(t, t.tiers[info.idx-1]))) return false;
  return true;
}

// ------------------------------------------------------------
// HOLD 加点：把「目标节点 + 它分支下方所有未点亮节点」一起点亮
// 返回 {ok, bought, cost}
// ------------------------------------------------------------
function holdBuyTalent(treeId, key){
  const info = TALENT_INDEX[treeId+':'+key];
  if(!info) return {ok:false, bought:[], cost:0};
  const chain = talentChain(info.tree, info.idx);
  const missing = chain.filter(n => !player.talents.has(n.id));
  if(!missing.length) return {ok:false, bought:[], cost:0};
  const cost = missing.reduce((s,n)=>s+n.tier.cost, 0);
  if(tpAvailable() < cost) return {ok:false, bought:[], cost};
  for(const n of missing){ player.talents.add(n.id); player.tpSpent += n.tier.cost; }
  return {ok:true, bought:missing, cost};
}

// ------------------------------------------------------------
// HOLD 取消：撤销「该节点 + 它分支上面的所有后继节点」
// 返回 {ok, removed, refund}
// ------------------------------------------------------------
function holdRemoveTalent(treeId, key){
  const info = TALENT_INDEX[treeId+':'+key];
  if(!info) return {ok:false, removed:[], refund:0};
  const targetId = treeId+':'+key;
  if(!player.talents.has(targetId)) return {ok:false, removed:[], refund:0};
  // 所有「前置链包含 targetId」的已拥有节点都要撤销
  const doomed = new Set([targetId]);
  for(const id of player.talents){
    const n = TALENT_INDEX[id];
    if(!n) continue;
    if(talentChain(n.tree, n.idx).some(c=>c.id===targetId)) doomed.add(id);
  }
  let refund = 0;
  for(const id of doomed){
    const n = TALENT_INDEX[id];
    if(!n) continue;
    player.talents.delete(id);
    refund += n.tier.cost;
  }
  player.tpSpent = Math.max(0, player.tpSpent - refund);
  return {ok:true, removed:[...doomed], refund};
}

// TP economy：按需求固定为 2000 点可用（不随等级增长）；加点消耗、撤销返还照旧。
function tpTotal(){ return 2000; }
function tpAvailable(){ return Math.max(0, tpTotal() - player.tpSpent); }

// recompute all derived talent stats and stash onto `player`
function applyTalents(){
  let slotBonus=0, healthMult=1, petalHealthMult=1, medicMult=1, reloadMult=1,
      rotAdd=0, visionMult=1, reachAdd=0, talentMagnet=0, bodyDmgMult=1, luck=0,
      poisonMult=1, poisonFlat=0, poisonDurMult=1, dup=0, dupLeftmost=0, dupAllRarity=false,
      sc=null, bodyTox=false, summonerLvl=0, summonHpMult=1;

  for(const t of TALENTS){
    for(const tier of t.tiers){
      if(!player.talents.has(talentId(t, tier))) continue;
      const e = tier.effect||{};
      if(e.slots) slotBonus += e.slots;
      if(e.health) healthMult *= (1+e.health);
      if(e.petalHealth) petalHealthMult *= (1+e.petalHealth);
      if(e.medic) medicMult *= (1+e.medic);
      if(e.reload) reloadMult *= (1+e.reload);
      if(e.rot) rotAdd += e.rot;
      if(e.reach) reachAdd += e.reach;
      if(e.magnet) talentMagnet += e.magnet;
      if(e.bodyDmg) bodyDmgMult *= (1+e.bodyDmg);
      if(e.luck) luck += e.luck;
      if(e.poison) poisonMult *= (1+e.poison);
      if(e.poisonFlat) poisonFlat += e.poisonFlat;
      if(e.poisonDur) poisonDurMult *= (1+e.poisonDur);
      if(e.dup) dup += e.dup;
      if(e.dupLeftmost) dupLeftmost += e.dupLeftmost;
      if(e.dupAllRarity) dupAllRarity = true;
      if(e.visionMult) visionMult = Math.max(visionMult, e.visionMult);
      if(e.sc){ if(!sc || e.sc.dur>sc.dur) sc = e.sc; }
      if(e.bodyTox) bodyTox = true;
      if(e.summonHp) summonHpMult *= (1+e.summonHp);
      if(t.id==='summoner') summonerLvl++;
    }
  }
  player.slotBonus = slotBonus;
  player.healthMult = healthMult;
  player.petalHealthMult = petalHealthMult;
  player.medicMult = medicMult;
  player.reloadTalent = reloadMult;
  player.reloadMult = reloadMult;
  if(typeof recompute === 'function') recompute();
  player.rotAdd = rotAdd;
  player.visionMult = visionMult;
  player.reachAdd = reachAdd;
  player.talentMagnet = talentMagnet;
  player.bodyDmgMult = bodyDmgMult;
  player.talentLuck = luck;
  player.luck = luck;
  player.poisonMult = poisonMult * (1 + poisonFlat);
  player.poisonDurMult = poisonDurMult;
  player.duplicatorLevel = dup;
  player.dupLeftmost = dupLeftmost;
  player.dupAllRarity = dupAllRarity;
  player.secondChance = sc;
  player.bodyToxicity = bodyTox;
  player.summonerLevel = summonerLvl;
  player.summonHpMult = summonHpMult;
  if(typeof VIEW !== 'undefined') VIEW = 1/(player.visionMult||1);
}

// active petals for render/attack, factoring Duplicator copies
//  Legendary/Ultra：拥有 >=2 副本的花瓣额外复制
//  Super：最左侧花瓣额外子瓣（原版不影响 Eternal/Unique）
//  Eternal：解除上述稀有度限制
function getActivePetals(){
  const base = [];
  for(const p of player.equipped){
    if(!p) continue;
    if(p.def && p.def.cat === 'wax') continue;   // Wax：不围绕花朵、不占轨道位
    base.push(p);
  }
  const active = base.slice();
  const dupCopies = player.duplicatorLevel || 0;
  if(dupCopies >= 1){
    const counts = {};
    for(const p of base){ counts[p.name]=(counts[p.name]||0)+1; }
    for(const p of base){
      if((counts[p.name]||0)>=2){
        for(let k=0;k<dupCopies;k++) active.push(p);
      }
    }
  }
  // Super Duplicator：最左侧花瓣额外子瓣
  const left = player.dupLeftmost || 0;
  if(left > 0 && base.length){
    const first = base[0];
    const rar = first.rarity || (first.def && first.def.rarity) || 'Common';
    const blocked = (rar==='Eternal' || rar==='Unique') && !player.dupAllRarity;
    const unstackable = !!(first.def && first.def.unstackable);
    if(!blocked && !unstackable){ for(let k=0;k<left;k++) active.push(first); }
  }
  return active;
}
