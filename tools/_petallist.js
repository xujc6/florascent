// 导出 PETAL_META 的花瓣名 + 分类，方便做 reload 表
const fs = require('fs');
const s = fs.readFileSync(__dirname + '/../petals.js', 'utf8');
const i = s.indexOf('const PETAL_META');
const j = s.indexOf('\n};', i);
const block = s.slice(i, j);
const re = /([A-Za-z_0-9]+)\s*:\s*\{\s*cat\s*:\s*'([a-z]+)'/g;
let m; const out = [];
while ((m = re.exec(block))) out.push(m[1] + ':' + m[2]);
const uniq = [...new Set(out)];
console.log('count', uniq.length);
console.log(uniq.join('\n'));
