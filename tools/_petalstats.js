// 在 Node 里跑 petals.js，打印每种花瓣（Common）的实际数值，找 NaN / 缺 dmg
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

const noop = ()=>{};
const mkCanvas = ()=>({
  width:0, height:0,
  getContext: ()=>({
    drawImage:noop, getImageData:()=>({data:new Uint8ClampedArray(4)}),
    putImageData:noop, fillRect:noop, createRadialGradient:()=>({addColorStop:noop}),
    beginPath:noop, arc:noop, fill:noop, save:noop, restore:noop, translate:noop,
    rotate:noop, scale:noop, moveTo:noop, lineTo:noop, closePath:noop, stroke:noop,
    fillText:noop, strokeText:noop, clearRect:noop, setLineDash:noop, ellipse:noop,
    quadraticCurveTo:noop, set imageSmoothingQuality(v){}, set fillStyle(v){}, set strokeStyle(v){},
    set lineWidth(v){}, set font(v){}, set textAlign(v){}, set textBaseline(v){},
    set globalAlpha(v){}, set lineCap(v){}, set lineJoin(v){}
  })
});

const sandbox = {
  console,
  window: { MANIFEST_DATA: manifest, INLINE_IMG: {}, devicePixelRatio: 1 },
  document: { createElement: ()=>mkCanvas(), getElementById: ()=>null, body:{} },
  Image: function(){ this.complete=false; this.naturalWidth=0; },
  location: { protocol:'file:' },
  performance: { now: ()=>0 },
  Math, JSON, Set, Map, Uint8Array, Uint8ClampedArray, Int32Array, Float32Array,
};
sandbox.window.document = sandbox.document;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root,'petals.js'),'utf8'), sandbox, {filename:'petals.js'});


const out = vm.runInContext(`JSON.stringify(Object.keys(PETAL_META).map(n=>{
  let d; try{ d = buildPetal(n,'Common'); }catch(e){ return [n,'ERR',e.message]; }
  return [n, d.cat, d.dmg, d.dur, d.reload, d.heal];
}))`, sandbox);
const rows = JSON.parse(out);
let bad = 0;
for(const [n,cat,dmg,dur,rel,heal] of rows){
  if(cat!=='melee' && cat!=='ranged') continue;
  if(!(dmg>0)){ bad++; console.log('NO DAMAGE:', n, 'cat='+cat, 'dmg='+dmg, 'dur='+dur); }
}
console.log('attacking petals:', rows.filter(r=>r[1]==='melee'||r[1]==='ranged').length, 'no-damage:', bad);
console.log(JSON.stringify(rows.slice(0,12)));
