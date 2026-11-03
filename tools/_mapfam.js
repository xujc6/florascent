// 打印某张地图每个图层用了哪些地块（文件名 → 数量），并输出压缩后的 ASCII 家族图
// 用法: node tools/_mapfam.js sewers [cols] [rows]
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const id = process.argv[2] || 'sewers';
const COLS = parseInt(process.argv[3] || '44', 10);
const ROWS = parseInt(process.argv[4] || '24', 10);

const T = JSON.parse(fs.readFileSync(path.join(root, 'assets/maps_tmj/tileset.js'), 'utf8')
  .replace(/^window\.TILESET_DATA=/, '').replace(/;\s*$/, ''));
const TMAP = T.map;
const M = JSON.parse(fs.readFileSync(path.join(root, 'assets/maps_tmj/' + id + '.json'), 'utf8'));

const VAR = new Set(['c','l','r','t','b','tl','tr','bl','br','tli','tri','bri','bli']);
function fam(gid){
  const fn = TMAP[gid]; if(!fn) return '?' + gid;
  const parts = String(fn).replace(/\.svg$/i,'').split('_');
  while(parts.length && (VAR.has(parts[parts.length-1]) || /^\d+$/.test(parts[parts.length-1]))) parts.pop();
  return parts.join('_');
}
function lay(L){ return Buffer.from(L.b64, 'base64'); }

console.log('== ' + id + '  ' + M.width + 'x' + M.height + '  图层: ' + M.layers.map(l=>l.name).join(' -> '));
const decoded = M.layers.map(L => ({ name: L.name, b: lay(L) }));
for(const d of decoded){
  const cnt = {};
  for(let i=0;i<d.b.length;i+=2){ const g = d.b[i]; if(g) { const f = fam(g); cnt[f] = (cnt[f]||0)+1; } }
  const arr = Object.entries(cnt).sort((a,b)=>b[1]-a[1]);
  console.log('  layer ' + d.name + ': ' + arr.map(([k,v])=>k+'='+v).join('  '));
}

// 顶层 gid -> 家族
const W = M.width, H = M.height;
const top = new Array(W*H).fill('');
for(let ty=0; ty<H; ty++) for(let tx=0; tx<W; tx++){
  const o = (ty*W+tx)*2; let g = 0;
  for(let li=decoded.length-1; li>=0; li--){ const v = decoded[li].b[o]; if(v){ g = v; break; } }
  top[ty*W+tx] = g ? fam(g) : '';
}
const allF = {};
top.forEach(f => { if(f) allF[f] = (allF[f]||0)+1; });
console.log('  TOP: ' + Object.entries(allF).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+'='+v).join('  '));

// ASCII 压缩：每格取众数
const sym = {};
const pal = '.#@*%&8$OoXx+=-~^:;';
let si = 0;
Object.keys(allF).sort((a,b)=>allF[b]-allF[a]).forEach(f => { sym[f] = pal[si++ % pal.length]; });
console.log('\n  图例: ' + Object.entries(sym).map(([f,s])=>s+'='+f).join('  '));
console.log('  (合成图每格 ~' + Math.round(W/COLS) + 'x' + Math.round(H/ROWS) + ' 个地块)\n');
const cw = W/COLS, ch = H/ROWS;
let out = '';
for(let r=0; r<ROWS; r++){
  let line = '  ';
  for(let c=0; c<COLS; c++){
    const cnt = {};
    for(let y=Math.floor(r*ch); y<Math.min(H, Math.floor((r+1)*ch)); y++)
      for(let x=Math.floor(c*cw); x<Math.min(W, Math.floor((c+1)*cw)); x++){
        const f = top[y*W+x] || ''; if(f) cnt[f] = (cnt[f]||0)+1;
      }
    const e = Object.entries(cnt).sort((a,b)=>b[1]-a[1])[0];
    line += e ? sym[e[0]] : ' ';
  }
  out += line + '\n';
}
console.log(out);
