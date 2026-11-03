// 把新素材文件以 data: URL 形式写进 assets_inline.js（file:// 下 canvas 读像素用）
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const FILES = [
  'assets/mobs_trans/Stinger.png',
  'assets/flower_normal.png','assets/flower_attack.png','assets/flower_defense.png',
  'assets/mobs_trans/Blood_Stinger.png',
  'assets/Orange_(Unusual).webp','assets/Orange_(Rare).webp','assets/Orange_(Epic).webp',
  'assets/Orange_(Legendary).webp','assets/Orange_(Mythic).webp','assets/Orange_(Ultra).webp',
  'assets/Orange_(Super).webp','assets/Orange_(Unique).webp'
];
const fp = path.join(root, 'assets_inline.js');
let txt = fs.readFileSync(fp, 'utf8');
txt = txt.replace(/^\s*window\.INLINE_IMG\s*=\s*/, '').replace(/;\s*$/, '');
const map = JSON.parse(txt);
const mime = f => f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/png';
for(const f of FILES){
  const p = path.join(root, f);
  if(!fs.existsSync(p)){ console.log('MISSING', f); continue; }
  map[f] = 'data:' + mime(f) + ';base64,' + fs.readFileSync(p).toString('base64');
  console.log('added', f);
}
fs.writeFileSync(fp, 'window.INLINE_IMG=' + JSON.stringify(map) + ';\n');
console.log('total keys:', Object.keys(map).length, 'bytes:', fs.statSync(fp).size);
