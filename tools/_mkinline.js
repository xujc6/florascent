// 把某张地图用到的所有 svg 地块转成 data: URL，写进 tools/_mapdata.js
// 这样页面里的 canvas 不会被 file:// 污染，可以 getImageData 复算 alpha 掩码
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const id = process.argv[2] || 'sewers';
const SUF = (process.argv[3] || '').toUpperCase();      // '' 或 '_FACTORY'

const T = JSON.parse(fs.readFileSync(path.join(root,'assets/maps_tmj/tileset.js'),'utf8')
  .replace(/^window\.TILESET_DATA=/,'').replace(/;\s*$/,''));
const M = JSON.parse(fs.readFileSync(path.join(root,'assets/maps_tmj/'+id+'.json'),'utf8'));
const used = new Set();
for(const L of M.layers){ const b = Buffer.from(L.b64,'base64'); for(let i=0;i<b.length;i+=2){ const g=b[i]; if(g && T.map[g]) used.add(T.map[g]); } }
const out = {};
for(const fn of used){
  const p = path.join(root,'assets/maps_tiles',fn);
  if(!fs.existsSync(p)){ out[fn] = null; continue; }
  out[fn] = 'data:image/svg+xml;base64,' + fs.readFileSync(p).toString('base64');
}
const js = 'window.MAPTILES'+SUF+'=' + JSON.stringify(out) + ';\n' +
           'window.MAPDATA'+SUF+'=' + JSON.stringify(M) + ';\n' +
           'window.TSMAP'+SUF+'=' + JSON.stringify(T.map) + ';\n';
fs.writeFileSync(path.join(root, 'tools/_mapdata'+(SUF?SUF.toLowerCase():'')+'.js'), js);
console.log(id, '->', 'tools/_mapdata'+(SUF?SUF.toLowerCase():'')+'.js',
            'tiles:', Object.keys(out).length, 'bytes:', js.length);
