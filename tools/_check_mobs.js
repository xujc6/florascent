// 用 node 直接加载 regions.js 做数据自检（池子 / 掉落 / 稀有度表）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { console };
vm.createContext(sandbox);
const src = fs.readFileSync(path.join(root, 'regions.js'), 'utf8') +
  '\n;globalThis.__out = { MOBS, REGIONS, MOB_RARITY, REGION_RARITY, mobRadius, regionRarityWeights, rollMobRarity, regionRarityRange };';
vm.runInContext(src, sandbox);

const { MOBS, REGIONS, MOB_RARITY, REGION_RARITY, mobRadius, regionRarityRange } = sandbox.__out;
const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).petals;

// 花瓣图标共有三种来源，掉落表只要命中任意一种就不算缺图：
//   1) assets/ 里的稀有度卡片（manifest.json）
//   2) TRANS_PETALS 里的透明素材
//   3) petals.js 里 PROC_PETAL 用代码画的矢量图标
const petalSrc = fs.readFileSync(path.join(root, 'petals.js'), 'utf8');
const grabBlock = (name) => {
  const i = petalSrc.indexOf('const ' + name);
  if (i < 0) return '';
  let d = 0, j = petalSrc.indexOf('{', i);
  for (let k = j; k < petalSrc.length; k++) {
    if (petalSrc[k] === '{') d++;
    else if (petalSrc[k] === '}') { d--; if (!d) return petalSrc.slice(j, k + 1); }
  }
  return '';
};
const transBlock = grabBlock('TRANS_PETALS');
const procBlock = grabBlock('PROC_PETAL');
const trans = new Set();     // 原版透明素材（用户上传的素材包里的图）
const proc  = new Set();     // 代码画的矢量图标（合成台不该出现这种）
for (const m of transBlock.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'/g)) trans.add(m[1]);
for (const m of procBlock.matchAll(/^\s{2}([A-Za-z_][A-Za-z0-9_]*)\s*\(g\s*,\s*S\)/gm)) proc.add(m[1]);

const hasCard = (n) => !!(man[n] && man[n].length);
const hasIcon = (n) => hasCard(n) || trans.has(n);

let bad = 0;
for (const r of REGIONS) for (const [k] of r.pools) if (!MOBS[k]) { console.log('MISSING MOB in pool', r.id, k); bad++; }

const used = new Set();
for (const r of REGIONS) for (const [k] of r.pools) used.add(k);
console.log('mobs defined:', Object.keys(MOBS).length, '| used in pools:', used.size);
const never = Object.keys(MOBS).filter(k => !used.has(k));
if (never.length) console.log('defined but never spawns:', never.join(', '));

let noIcon = 0;
for (const k in MOBS) {
  const m = MOBS[k];
  for (const d of (m.drops || [])) if (!hasIcon(d)) {
    console.log('  drop needs hand-drawn icon:', k, '->', d + (proc.has(d) ? ' (PROC)' : '')); noIcon++;
  }
  for (const d of (m.rareDrops || [])) if (!hasIcon(d.p)) {
    console.log('  rare drop needs hand-drawn icon:', k, '->', d.p + (proc.has(d.p) ? ' (PROC)' : '')); noIcon++;
  }
  for (const t of m.tiers) if (!MOB_RARITY.includes(t)) { console.log('  bad tier:', k, t); bad++; }
  const rr = mobRadius(k, 'Common');
  if (!isFinite(rr) || rr <= 0) { console.log('bad radius', k, rr); bad++; }
  if (!m.ai || !m.anim) { console.log('missing ai/anim:', k); bad++; }
  if (m.size == null) { console.log('missing size:', k); bad++; }
}

console.log('--- regions ---');
for (const r of REGIONS) {
  const rs = regionRarityRange(r);
  const top = regionRarityRange(r, 0.0005);
  const deep = (REGION_RARITY[r.id] || {}).Ultra ? 'deep->' + top[1] : '';
  console.log(('  ' + r.id).padEnd(12), String(r.pools.length).padStart(2) + ' mobs |', rs[0], '->', rs[1], deep);
}
console.log(noIcon ? ('drop icons missing: ' + noIcon) : 'drop icons OK');
console.log(bad ? ('PROBLEMS: ' + bad) : 'OK');
