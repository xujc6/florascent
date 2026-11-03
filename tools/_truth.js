// 用原作 tmj 的 mobs/assemblers 多边形（= 原作可走区域）反推每个地形家族到底是墙还是地面
// 用法: node tools/_truth.js sewers
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const ids = process.argv.slice(2);
if(!ids.length) ids.push('sewers','factory');

const T = JSON.parse(fs.readFileSync(path.join(root, 'assets/maps_tmj/tileset.js'), 'utf8')
  .replace(/^window\.TILESET_DATA=/, '').replace(/;\s*$/, ''));
const TMAP = T.map;
const VAR = new Set(['c','l','r','t','b','tl','tr','bl','br','tli','tri','bri','bli']);
function fam(gid){
  const fn = TMAP[gid]; if(!fn) return '?'+gid;
  const parts = String(fn).replace(/\.svg$/i,'').split('_');
  while(parts.length && (VAR.has(parts[parts.length-1]) || /^\d+$/.test(parts[parts.length-1]))) parts.pop();
  return parts.join('_');
}

for(const id of ids){
  const raw = JSON.parse(fs.readFileSync(path.join(root,'assets/maps_tmj/'+id+'.tmj'),'utf8'));
  const M  = JSON.parse(fs.readFileSync(path.join(root,'assets/maps_tmj/'+id+'.json'),'utf8'));
  const W = M.width, H = M.height, TS = raw.tilewidth;   // 512
  const dec = M.layers.map(L => Buffer.from(L.b64,'base64'));

  // 顶层家族
  const top = new Array(W*H);
  for(let ty=0;ty<H;ty++) for(let tx=0;tx<W;tx++){
    const o=(ty*W+tx)*2; let g=0;
    for(let li=dec.length-1;li>=0;li--){ const v=dec[li][o]; if(v){g=v;break;} }
    top[ty*W+tx] = g ? fam(g) : '';
  }

  // 可走区域掩码
  const walk = new Uint8Array(W*H);
  let zones=0;
  for(const L of raw.layers){
    if(L.type!=='objectgroup') continue;
    if(!/^(mobs|assemblers|spawns?)$/i.test(L.name)) continue;
    for(const o of (L.objects||[])){
      const poly = o.polygon; if(!poly) continue;
      zones++;
      // 面积多边形 → 包围盒内逐格测试（射线法）
      const pts = poly.map(p=>[o.x+p.x, o.y+p.y]);
      const bx0=Math.min(...pts.map(p=>p[0])), bx1=Math.max(...pts.map(p=>p[0]));
      const by0=Math.min(...pts.map(p=>p[1])), by1=Math.max(...pts.map(p=>p[1]));
      const inside=(x,y)=>{
        let c=false;
        for(let i=0,j=pts.length-1;i<pts.length;j=i++){
          const [xi,yi]=pts[i],[xj,yj]=pts[j];
          if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) c=!c;
        }
        return c;
      };
      for(let ty=Math.max(0,Math.floor(by0/TS)); ty<Math.min(H,Math.ceil(by1/TS)); ty++)
        for(let tx=Math.max(0,Math.floor(bx0/TS)); tx<Math.min(W,Math.ceil(bx1/TS)); tx++){
          if(inside((tx+0.5)*TS,(ty+0.5)*TS)) walk[ty*W+tx]=1;
        }
    }
  }

  const stat={};
  for(let i=0;i<W*H;i++){
    const f=top[i]; if(!f) continue;
    stat[f]=stat[f]||[0,0];
    stat[f][walk[i]?1:0]++;          // [生怪区外, 生怪区内]
  }
  console.log('==== '+id+'  zones='+zones+'  walkableTiles='+walk.reduce((a,b)=>a+b,0));
  for(const [f,[out,inn]] of Object.entries(stat).sort((a,b)=>(b[1][0]+b[1][1])-(a[1][0]+a[1][1]))){
    const tot=out+inn, pct=Math.round(inn/tot*100);
    console.log('   '+f.padEnd(16)+' total '+String(tot).padStart(5)+
      '  in-zone '+String(inn).padStart(5)+' ('+String(pct).padStart(3)+'%)'+
      (pct>=60?'   -> WALKABLE':(pct<=20?'   -> WALL':'')));
  }
  console.log('');
}
