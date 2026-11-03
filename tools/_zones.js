// 把原作 mobs 生怪多边形画在家族图上，直接看「原作可走区域」到底是 grate 还是 sewage
// 用法: node tools/_zones.js sewers 90 45
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const id = process.argv[2] || 'sewers';
const COLS = parseInt(process.argv[3] || '90', 10);
const ROWS = parseInt(process.argv[4] || '45', 10);

const T = JSON.parse(fs.readFileSync(path.join(root,'assets/maps_tmj/tileset.js'),'utf8')
  .replace(/^window\.TILESET_DATA=/,'').replace(/;\s*$/,''));
const TMAP = T.map;
const raw = JSON.parse(fs.readFileSync(path.join(root,'assets/maps_tmj/'+id+'.tmj'),'utf8'));
const M = JSON.parse(fs.readFileSync(path.join(root,'assets/maps_tmj/'+id+'.json'),'utf8'));
const W = M.width, H = M.height, TS = raw.tilewidth;
const VAR = new Set(['c','l','r','t','b','tl','tr','bl','br','tli','tri','bri','bli']);
function fam(gid){
  const fn = TMAP[gid]; if(!fn) return '?';
  const p = String(fn).replace(/\.svg$/i,'').split('_');
  while(p.length && (VAR.has(p[p.length-1]) || /^\d+$/.test(p[p.length-1]))) p.pop();
  return p.join('_');
}
const CH = {grate:'o', sewage:'~', dirt:'#', factory_floor:'.', factory_wall:'W', vent:'v'};
const dec = M.layers.map(L=>Buffer.from(L.b64,'base64'));
const top = new Array(W*H);
for(let ty=0;ty<H;ty++) for(let tx=0;tx<W;tx++){
  const o=(ty*W+tx)*2; let g=0;
  for(let li=dec.length-1;li>=0;li--){ const v=dec[li][o]; if(v){g=v;break;} }
  top[ty*W+tx] = g ? fam(g) : '';
}
const zone = new Uint8Array(W*H);
let nz=0;
for(const L of raw.layers){
  if(L.type!=='objectgroup' || !/^(mobs|assemblers|spawns?)$/i.test(L.name)) continue;
  for(const o of (L.objects||[])){
    const poly=o.polygon; if(!poly) continue; nz++;
    const pts = poly.map(p=>[o.x+p.x, o.y+p.y]);
    const bx0=Math.min(...pts.map(p=>p[0])), bx1=Math.max(...pts.map(p=>p[0]));
    const by0=Math.min(...pts.map(p=>p[1])), by1=Math.max(...pts.map(p=>p[1]));
    const ins=(x,y)=>{ let c=false;
      for(let i=0,j=pts.length-1;i<pts.length;j=i++){
        const [xi,yi]=pts[i],[xj,yj]=pts[j];
        if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) c=!c;
      } return c; };
    for(let ty=Math.max(0,Math.floor(by0/TS)); ty<Math.min(H,Math.ceil(by1/TS)); ty++)
      for(let tx=Math.max(0,Math.floor(bx0/TS)); tx<Math.min(W,Math.ceil(bx1/TS)); tx++)
        if(ins((tx+0.5)*TS,(ty+0.5)*TS)) zone[ty*W+tx]=1;
  }
}
console.log('== '+id+'  zones='+nz);
let out='';
for(let r=0;r<ROWS;r++){
  let line='';
  for(let c=0;c<COLS;c++){
    const ty=Math.floor(r*H/ROWS), tx=Math.floor(c*W/COLS);
    const i=ty*W+tx;
    const ch = CH[top[i]] || (top[i]?top[i][0]:' ');
    line += zone[i] ? ch.toUpperCase() : ch;
  }
  out += line+'\n';
}
console.log('图例: 小写=生怪区外, 大写=生怪区内  o/grate ~/sewage #/dirt\n');
console.log(out);
