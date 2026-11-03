// ============================================================
//  florr-style Talents system
//  Data sourced from the official florr.io talent descriptions.
//  Each tree has tiered nodes (Common -> Eternal) with costs and
//  sequential prerequisites (you must own the previous tier).
// ============================================================
'use strict';

// rarity ordering used for tier layout
const TALENT_RARITY_ORDER = ['Common','Unusual','Rare','Super','Epic','Legendary','Mythic','Ultra','Eternal'];

// Effect keys:
//  additive: slots, rot, reach, magnet, bodyDmg, luck
//  multiplicative (per tier): health, petalHealth, medic, reload, poison
//  absolute (highest owned wins): visionMult, sc(dur/cd)
//  flags: dup, bodyTox
//  poisonDps / poisonDur handled inside poison multiplier

const TALENTS = [
  {
    id:'loadout', name:'Loadout', icon:'Loadout',
    desc:'Unlocks extra petal slots (slots 6-10).',
    tiers:[
      {r:'Common', cost:3, effect:{slots:1}},
      {r:'Unusual', cost:6, effect:{slots:1}},
      {r:'Rare', cost:9, effect:{slots:1}},
      {r:'Epic', cost:12, effect:{slots:1}},
      {r:'Legendary', cost:15, effect:{slots:1}},
    ]
  },
  {
    id:'health', name:'Health', icon:'Health',
    desc:'Increases your base HP (x1.3 per rank).',
    tiers:[
      {r:'Common', cost:2, effect:{health:0.30}},
      {r:'Unusual', cost:5, effect:{health:0.30}},
      {r:'Rare', cost:8, effect:{health:0.30}},
      {r:'Epic', cost:11, effect:{health:0.30}},
      {r:'Legendary', cost:14, effect:{health:0.30}},
      {r:'Mythic', cost:17, effect:{health:0.30}},
      {r:'Ultra', cost:20, effect:{health:0.30}},
      {r:'Super', cost:21, effect:{health:0.30}},
      {r:'Eternal', cost:24, effect:{health:0.30}},
    ]
  },
  {
    id:'petalHealth', name:'Petal Health', icon:'Petal_Health',
    desc:'Increases petal HP / shield pool (x1.15 per rank).',
    tiers:[
      {r:'Common', cost:2, effect:{petalHealth:0.15}},
      {r:'Unusual', cost:4, effect:{petalHealth:0.15}},
      {r:'Rare', cost:6, effect:{petalHealth:0.15}},
      {r:'Epic', cost:8, effect:{petalHealth:0.15}},
      {r:'Legendary', cost:10, effect:{petalHealth:0.15}},
      {r:'Mythic', cost:12, effect:{petalHealth:0.15}},
      {r:'Ultra', cost:14, effect:{petalHealth:0.15}},
      {r:'Super', cost:16, effect:{petalHealth:0.15}},
      {r:'Eternal', cost:18, effect:{petalHealth:0.15}},
    ]
  },
  {
    id:'medic', name:'Medic', icon:'Medic',
    desc:'Increases HP restored by healing petals (x1.15 per rank).',
    tiers:[
      {r:'Common', cost:2, effect:{medic:0.15}},
      {r:'Unusual', cost:5, effect:{medic:0.15}},
      {r:'Rare', cost:8, effect:{medic:0.15}},
      {r:'Epic', cost:11, effect:{medic:0.15}},
      {r:'Legendary', cost:14, effect:{medic:0.15}},
      {r:'Mythic', cost:17, effect:{medic:0.15}},
      {r:'Ultra', cost:20, effect:{medic:0.15}},
      {r:'Super', cost:23, effect:{medic:0.15}},
      {r:'Eternal', cost:26, effect:{medic:0.15}},
    ]
  },
  {
    id:'reload', name:'Reload', icon:'Reload',
    desc:'Reduces petal reload time (x0.9 per rank).',
    tiers:[
      {r:'Common', cost:2, effect:{reload:-0.10}},
      {r:'Unusual', cost:6, effect:{reload:-0.10}},
      {r:'Rare', cost:10, effect:{reload:-0.10}},
      {r:'Epic', cost:12, effect:{reload:-0.10}},
      {r:'Legendary', cost:16, effect:{reload:-0.10}},
      {r:'Mythic', cost:20, effect:{reload:-0.10}},
      {r:'Ultra', cost:24, effect:{reload:-0.10}},
      {r:'Super', cost:28, effect:{reload:-0.10}},
      {r:'Eternal', cost:32, effect:{reload:-0.10}},
    ]
  },
  {
    id:'petalRotation', name:'Petal Rotation', icon:'Petal_Rotation',
    desc:'Increases petal orbit speed (+0.6 rad/s per rank).',
    tiers:[
      {r:'Common', cost:1, effect:{rot:0.6}},
      {r:'Unusual', cost:2, effect:{rot:0.6}},
      {r:'Rare', cost:3, effect:{rot:0.6}},
      {r:'Epic', cost:4, effect:{rot:0.6}},
      {r:'Legendary', cost:5, effect:{rot:0.6}},
    ]
  },
  {
    id:'sharpEdges', name:'Sharp Edges', icon:'Sharp_Edges',
    desc:'Increases body (contact) damage (stacks per rank).',
    tiers:[
      {r:'Common', cost:2, effect:{bodyDmg:0.38}},
      {r:'Unusual', cost:3, effect:{bodyDmg:0.12}},
      {r:'Rare', cost:4, effect:{bodyDmg:0.12}},
      {r:'Epic', cost:5, effect:{bodyDmg:0.12}},
      {r:'Legendary', cost:6, effect:{bodyDmg:0.12}},
      {r:'Mythic', cost:7, effect:{bodyDmg:0.12}},
      {r:'Ultra', cost:8, effect:{bodyDmg:0.12}},
      {r:'Super', cost:9, effect:{bodyDmg:0.12}},
    ]
  },
  {
    id:'luck', name:'Luck', icon:'Luck',
    desc:'Increases luck: better mob rarity rolls and stronger petal effects.',
    tiers:[
      {r:'Common', cost:2, effect:{luck:0.10}},
      {r:'Unusual', cost:3, effect:{luck:0.15}},
      {r:'Rare', cost:4, effect:{luck:0.20}},
      {r:'Epic', cost:5, effect:{luck:0.25}},
      {r:'Legendary', cost:6, effect:{luck:0.30}},
      {r:'Mythic', cost:7, effect:{luck:0.35}},
      {r:'Ultra', cost:8, effect:{luck:0.40}},
      {r:'Super', cost:9, effect:{luck:0.45}},
      {r:'Eternal', cost:10, effect:{luck:0.50}},
    ]
  },
  {
    id:'antennae', name:'Antennae', icon:'Antennae_Talent',
    desc:'Increases vision range (permanent Antennae).',
    tiers:[
      {r:'Rare', cost:1, effect:{visionMult:1.25}},
      {r:'Epic', cost:3, effect:{visionMult:1.50}},
      {r:'Legendary', cost:5, effect:{visionMult:2.00}},
    ]
  },
  {
    id:'reach', name:'Reach', icon:'Reach',
    desc:'Increases petal attack range.',
    tiers:[
      {r:'Rare', cost:3, effect:{reach:50}},
      {r:'Mythic', cost:6, effect:{reach:75}},
      {r:'Super', cost:9, effect:{reach:100}},
    ]
  },
  {
    id:'magnetism', name:'Magnetism', icon:'Magnetism',
    desc:'+1000 petal pickup range while alive.',
    tiers:[
      {r:'Mythic', cost:15, effect:{magnet:1000}},
    ]
  },
  {
    id:'duplicator', name:'Duplicator', icon:'Duplicator',
    desc:'Adds one extra copy of each petal you have 2+ of.',
    tiers:[
      {r:'Legendary', cost:10, effect:{dup:1}},
      {r:'Ultra', cost:20, effect:{dup:1}},
      {r:'Super', cost:30, effect:{dup:1}},
      {r:'Eternal', cost:40, effect:{dup:1}},
    ]
  },
  {
    id:'secondChance', name:'Second Chance', icon:'Second_Chance',
    desc:'Brief invulnerability on lethal damage (prevents death).',
    tiers:[
      {r:'Legendary', cost:10, effect:{sc:{dur:0.3, cd:60}}},
      {r:'Mythic', cost:20, effect:{sc:{dur:1.5, cd:30}}},
    ]
  },
  {
    id:'poison', name:'Poison', icon:'Poison',
    desc:'Increases all poison damage (x1.0625 per rank).',
    tiers:[
      {r:'Common', cost:1, effect:{poison:0.0625}},
      {r:'Unusual', cost:2, effect:{poison:0.0625}},
      {r:'Rare', cost:3, effect:{poison:0.0625}},
    ]
  },
  {
    id:'concentratedPoison', name:'Concentrated Poison', icon:'Concentrated_Poison',
    desc:'Poison DPS +20%, duration -16.7%.',
    tiers:[
      {r:'Super', cost:15, effect:{poison:0.20, poisonDur:-0.167}},
    ]
  },
  {
    id:'bodyToxicity', name:'Body Toxicity', icon:'Body_Toxicity',
    desc:'Colliding with enemies poisons them (0.6x body damage, 1s).',
    tiers:[
      {r:'Ultra', cost:10, effect:{bodyTox:true}},
    ]
  },
  {
    id:'summoner', name:'Summoner', icon:'Summoner',
    desc:'A Soldier Ant fights beside you (more per rank, respawns after 8s).',
    tiers:[
      {r:'Common', cost:2}, {r:'Unusual', cost:5}, {r:'Rare', cost:8}, {r:'Epic', cost:11},
      {r:'Legendary', cost:14}, {r:'Mythic', cost:17}, {r:'Ultra', cost:20}, {r:'Super', cost:23}, {r:'Eternal', cost:26},
    ]
  },
];

// fast lookup: 'treeId:rarity' -> tier, and prereq chain
const TALENT_INDEX = {};
TALENTS.forEach(t=>{
  t.tiers.forEach((tier,i)=>{ TALENT_INDEX[t.id+':'+tier.r] = {tree:t, tier, idx:i}; });
});

function talentId(tree, r){ return tree.id+':'+r; }

// given an owned Set, can we buy `treeId:r` ?
function canBuyTalent(treeId, r, owned){
  const key = treeId+':'+r;
  if(owned.has(key)) return false;
  const info = TALENT_INDEX[key];
  if(!info) return false;
  if(info.idx>0){
    const prev = info.tree.tiers[info.idx-1];
    if(!owned.has(talentId(info.tree, prev.r))) return false;
  }
  return true;
}

// TP economy: idempotent from level (so leveling-up retroactively grants points)
function tpTotal(){ return 5 + (player.level-1)*3; }
function tpAvailable(){ return Math.max(0, tpTotal() - player.tpSpent); }

// recompute all derived talent stats and stash onto `player`
function applyTalents(){
  let slotBonus=0, healthMult=1, petalHealthMult=1, medicMult=1, reloadMult=1,
      rotAdd=0, visionMult=1, reachAdd=0, talentMagnet=0, bodyDmgMult=1, luck=0,
      poisonMult=1, poisonDurMult=1, dup=0, sc=null, bodyTox=false, summonerLvl=0;

  for(const t of TALENTS){
    for(const tier of t.tiers){
      if(!player.talents.has(talentId(t, tier.r))) continue;
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
      if(e.poisonDur) poisonDurMult *= (1+e.poisonDur);
      if(e.dup) dup += e.dup;
      if(e.visionMult) visionMult = Math.max(visionMult, e.visionMult);
      if(e.sc){ if(!sc || e.sc.dur>sc.dur) sc = e.sc; }
      if(e.bodyTox) bodyTox = true;
      if(t.id==='summoner') summonerLvl++;
    }
  }
  player.slotBonus = slotBonus;
  player.healthMult = healthMult;
  player.petalHealthMult = petalHealthMult;
  player.medicMult = medicMult;
  player.reloadTalent = reloadMult;   // 天赋部分单独存，recompute 会乘上 Golden Leaf 的减冷却
  player.reloadMult = reloadMult;
  if(typeof recompute === 'function') recompute();   // 立即重算，避免 Golden Leaf 减免被冲掉
  player.rotAdd = rotAdd;
  player.visionMult = visionMult;
  player.reachAdd = reachAdd;
  player.talentMagnet = talentMagnet;
  player.bodyDmgMult = bodyDmgMult;
  player.luck = luck;
  player.poisonMult = poisonMult;
  player.poisonDurMult = poisonDurMult;
  player.duplicatorLevel = dup;
  player.secondChance = sc;
  player.bodyToxicity = bodyTox;
  player.summonerLevel = summonerLvl;
  // vision talent => zoom out (VIEW only exists in game.js; guard for headless harness)
  if(typeof VIEW !== 'undefined') VIEW = 1/(player.visionMult||1);
}

// active petals for render/attack, factoring Duplicator copies
// 碎掉（broken>0）的花瓣不出现，等冷却结束才回来
function getActivePetals(){
  // 碎掉（耐久归零进冷却）的花瓣也要留在列表里占位，
  // 这样其它花瓣的角度不重新排布，轨道上会正好空出它那一格
  const base = [];
  for(const p of player.equipped){
    if(!p) continue;
    if(p.def && p.def.cat === 'wax') continue;   // Wax：不围绕花朵、不占轨道位
    base.push(p);
  }
  const active = base.slice();
  if(player.duplicatorLevel>=1){
    const counts = {};
    for(const p of base){ counts[p.name]=(counts[p.name]||0)+1; }
    for(const p of base){
      if((counts[p.name]||0)>=2){
        active.push(p); // one extra mirrored copy (shares object, gets its own angle)
      }
    }
  }
  return active;
}
