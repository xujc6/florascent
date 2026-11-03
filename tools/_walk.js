// 白名单通行分析：只允许列出的地形家族可走，其余（含空白）全部阻挡。
// 用法: node tools/_walk.js sewers grate [factory factory_floor ...]
const fs = require('fs');
const path = require('path');

const T = JSON.parse(fs.readFileSync('assets/maps_tmj/tileset.js', 'utf8')
  .replace(/^window\.TILESET_DATA=/, '').replace(/;\s*$/, ''));
const TM = T.map;
const VAR = new Set(['c','l','r','t','b','tl','tr','bl','br','tli','tri','bri','bli']);
const fam = (g) => {
  const fn = TM[g]; if (!fn) return '?' + g;
  const p = String(fn).replace(/\.svg$/i, '').split('_');
  while (p.length && (VAR.has(p[p.length-1]) || /^\d+$/.test(p[p.length-1]))) p.pop();
  return p.join('_');
};

function analyze(mapId, walkFams) {
  const M = JSON.parse(fs.readFileSync('assets/maps_tmj/' + mapId + '.json', 'utf8'));
  const raw = JSON.parse(fs.readFileSync('assets/maps_tmj/' + mapId + '.tmj', 'utf8'));
  const W = M.width, H = M.height, TS = raw.tilewidth;
  const dec = M.layers.map(L => Buffer.from(L.b64, 'base64'));
  const nL = dec.length;

  const walk = new Uint8Array(W * H);
  const stat = {};
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const o = (ty * W + tx) * 2;
    let g = 0;
    for (let li = nL - 1; li >= 0; li--) { const v = dec[li][o]; if (v) { g = v; break; } }
    if (!g) { stat['(empty)'] = stat['(empty)'] || [0,0]; stat['(empty)'][0]++; continue; }
    const f = fam(g);
    const ok = walkFams.has(f);
    walk[ty * W + tx] = ok ? 1 : 0;
    stat[f] = stat[f] || [0,0];
    stat[f][ok ? 1 : 0]++;
  }

  // 4 连通块
  const comp = new Int32Array(W * H).fill(-1);
  let label = 0, bestLabel = 0, bestSize = 0;
  const sizes = [];
  const q = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (!walk[i] || comp[i] >= 0) continue;
    label++;
    let head = 0, tail = 0, cnt = 0;
    q[tail++] = i; comp[i] = label;
    while (head < tail) {
      const k = q[head++]; cnt++;
      const x = k % W, y = (k - x) / W;
      if (x > 0 && walk[k-1] && comp[k-1] < 0) { comp[k-1] = label; q[tail++] = k-1; }
      if (x < W-1 && walk[k+1] && comp[k+1] < 0) { comp[k+1] = label; q[tail++] = k+1; }
      if (y > 0 && walk[k-W] && comp[k-W] < 0) { comp[k-W] = label; q[tail++] = k-W; }
      if (y < H-1 && walk[k+W] && comp[k+W] < 0) { comp[k+W] = label; q[tail++] = k+W; }
    }
    sizes.push(cnt);
    if (cnt > bestSize) { bestSize = cnt; bestLabel = label; }
  }

  const totalWalk = walk.reduce((a, b) => a + b, 0);
  console.log('==== ' + mapId + '  ' + W + 'x' + H + '  walk=[' + [...walkFams].join(',') + ']');
  console.log('  可走格 ' + totalWalk + '/' + (W*H) + ' (' + (100*totalWalk/(W*H)).toFixed(1) + '%)'
    + '  连通块 ' + label + '  主区 ' + bestSize + ' (' + (100*bestSize/Math.max(1,totalWalk)).toFixed(1) + '% of walkable)');
  const others = sizes.filter((s, i) => i + 1 !== bestLabel).sort((a,b)=>b-a).slice(0, 6);
  if (others.length) console.log('  零散区 top: ' + others.join(', '));
  for (const [f, [b, w]] of Object.entries(stat).sort((a,b)=>(b[1][0]+b[1][1])-(a[1][0]+a[1][1])))
    console.log('    ' + f.padEnd(18) + ' block ' + String(b).padStart(5) + '  walk ' + String(w).padStart(5));

  // 出生点 / 传送点 / 检查点 落在哪
  for (const L of raw.layers) {
    if (L.type !== 'objectgroup') continue;
    if (!/checkpoint|warp|spawn|start|player/i.test(L.name)) continue;
    for (const o of (L.objects || [])) {
      const cx = (o.x || 0) + (o.width || 0) / 2, cy = (o.y || 0) + (o.height || 0) / 2;
      const tx = Math.floor(cx / TS), ty = Math.floor(cy / TS);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const k = ty * W + tx;
      const main = comp[k] === bestLabel;
      if (!walk[k]) console.log('  !! ' + L.name + ' "' + (o.name||'') + '" @ tile ' + tx + ',' + ty + ' 不可走');
      else if (!main) console.log('  ?? ' + L.name + ' "' + (o.name||'') + '" @ tile ' + tx + ',' + ty + ' 在零散区 ' + comp[k]);
    }
  }
  return { W, H, walk, comp, bestLabel };
}

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) {
  analyze(args[i], new Set((args[i+1] || '').split(',')));
}
