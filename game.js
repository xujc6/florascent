// ============================================================
//  florr-style game engine
// ============================================================
'use strict';

// 预加载 Ubuntu 字体（assets/fonts/ubuntu.css 里以 data URL 内嵌），
// 画布里的等级/血量/名字文字才能用上这套字，不会闪一下 fallback。
if(typeof document !== 'undefined' && document.fonts && document.fonts.load){
  ['700 16px Ubuntu', '400 16px Ubuntu', 'italic 700 16px Ubuntu'].forEach(f=>{
    try { document.fonts.load(f); } catch(e){}
  });
}

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W*DPR; canvas.height = H*DPR;
  canvas.style.width = W+'px'; canvas.style.height = H+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener('resize', resize); resize();

const WORLD = 7000;
const cam = {x:0, y:0};
// 受击屏震：addShake() 触发，render 前作用到相机偏移（只影响绘制，不影响逻辑）
let shakeT = 0, shakeDur = 0.2, shakeMag = 0;
function addShake(m){ if(m > shakeMag) shakeMag = m; if(shakeT <= 0) shakeT = shakeDur; }
let VIEW = 1; // screen zoom: vision talent zooms out (VIEW = 1/visionMult)
// 视野基准（照 florr 参考图校准：花朵直径 24.5 个世界单位 ≈ 屏幕宽度的 2.23%）。
// 不管窗口多大，一屏宽固定显示 ~1100 个世界单位 —— 视野看起来跟参考图一致
const VIEW_WORLD_W = 950;    // 最大视野（最远缩放）：一屏宽 ≈950 世界单位，与 florr 参考图一致
function viewBase(){ return Math.max(0.35, W / VIEW_WORLD_W); }

// ---------- 花朵基础属性（1 级初始值；随等级增长，到 STAT_LEVEL_CAP 级封顶）----------
const BASE_HP        = 216;     // 1 级花朵初始血量
const BASE_BODY_DMG  = 29.2;    // 1 级花朵初始体伤（生物撞到花朵时花朵打回去的伤害）
// ---- Bubble 泡泡推力 ----（瞬间移速脉冲，多泡泡同向自然矢量叠加、反向抵消）
const BUBBLE_PUSH_BASE = 800;   // Common 推力
const BUBBLE_PUSH_STEP = 400;   // 每升一级增加的推力
const STAT_LEVEL_K   = 1.0565;  // 每升 1 级 ×1.0565
const STAT_LEVEL_CAP = 75;      // 75 级以后血量 / 体伤不再随等级增长
function playerStatScale(){
  const lv = Math.max(1, player.level|0);
  return Math.pow(STAT_LEVEL_K, Math.min(STAT_LEVEL_CAP, lv) - 1);
}

// ---- authentic florr tilemap rendering ----
const TILE = 170;                // render size of one map tile (px)
// 实测（原游戏 1080p 截图）：沙丘纹样周期 ≈ 113 CSS px，花朵直径 ≈ 21 CSS px
// → 花朵 ≈ 0.145 个地块。我们这边 24.5px 的花要对上这个比例，地块就得画到 ~170px，
// 之前用 128 的时候地块显得太密，花朵和花瓣看起来就"比地图大一号"。
let boundX = WORLD, boundY = WORLD; // per-region half-extent (set from map)
let regionMap = null;             // decoded map json for current region
let regionMapReady = false;
const regionMapsCache = {};       // url -> json
const TILESET_MAP = {};           // gid -> svg filename (loaded from tileset.json)
const TILE_IMG = {};              // gid -> Image cache

// Tiled flip/rotate flags -> canvas matrix [a,b,c,d]
// bit0 = horizontal flip, bit1 = vertical flip, bit2 = diagonal flip
//
// Order matters! Tiled applies the flips first and the diagonal flip last, i.e.
// M = H * V * D. Building it as D * H * V instead rotates every diagonal-flagged
// tile by 180 degrees, which tears the terrain seams apart (measured on the real
// maps: 52.6% of tile edges mismatched vs 1.2% with the correct order).
const FLIP_M = (function(){
  const mul=(A,B)=>[
    [A[0][0]*B[0][0]+A[0][1]*B[1][0], A[0][0]*B[0][1]+A[0][1]*B[1][1]],
    [A[1][0]*B[0][0]+A[1][1]*B[1][0], A[1][0]*B[0][1]+A[1][1]*B[1][1]]
  ];
  const I=[[1,0],[0,1]], Dm=[[0,1],[1,0]], Hm=[[-1,0],[0,1]], Vm=[[1,0],[0,-1]];
  const out=[];
  for(let f=0;f<8;f++){
    let M=I;
    if(f&1) M=mul(M,Hm);
    if(f&2) M=mul(M,Vm);
    if(f&4) M=mul(M,Dm);
    out[f]=[M[0][0], M[1][0], M[0][1], M[1][1]];
  }
  return out;
})();
// ---- data loading ----
// 浏览器在 file:// 下会禁掉 fetch()/XHR，所以地图、tileset、manifest 都额外
// 导出了一份 .js 包装（build_offline.py 生成），用 <script> 注入的方式读。
// 这样双击 index.html 直接打开，和起 http 服务器看到的内容完全一样。
function loadDataScript(url){
  return new Promise((resolve, reject)=>{
    const s = document.createElement('script');
    s.src = url;
    s.onload = ()=>{ s.remove(); resolve(); };
    s.onerror = ()=>{ s.remove(); reject(new Error('load failed: '+url)); };
    document.head.appendChild(s);
  });
}
// load the gid->image map once (promise so tile preloading can wait on it)
let tilesetReady = false;
const tilesetPromise = loadDataScript('assets/maps_tmj/tileset.js').then(()=>{
      const j = window.TILESET_DATA || {map:{}};
      for(const k in j.map) TILESET_MAP[k]=j.map[k];
      tilesetReady = true;
    }).catch(()=>{ tilesetReady = true; });
function getTileImage(gid){
  if(TILE_IMG[gid]) return TILE_IMG[gid];
  const fn = TILESET_MAP[gid];
  const img = new Image();
  // 碰撞掩码要读地块像素，file:// 下只能用内联 data: URL（见 petals.js assetURL）
  if(fn) img.src = assetURL('assets/maps_tiles/'+fn);
  TILE_IMG[gid] = img;
  return img;
}
// ---------------- terrain collision ----------------
// Terrain families that block movement (florr walls / water).
// Derived from the tileset filenames: dirt mounds, water, sewage, castle,
// organic & factory walls, jungle bush, ocean coral, desert cliffs, huts, pyramid walls.
const SOLID_FAMILIES = new Set([
  'dirt','water','sewage','castle','organic_wall','factory_wall',
  'bush','coral','scliff','hut','pyramid_wall'
]);
// 当前地图实际生效的墙体家族集合。默认就是上面的全局表，
// 单张地图可以在 regions.js 的 MAP_SOLID 里覆盖（下水道/工厂这种专用地形）。
// ?walls=a,b   追加家族；?walls=-x  去掉家族；?walls=swap 把 grate/sewage 语义对调。
let mapSolid = SOLID_FAMILIES;

// 白名单模式：某些地图的地形语义不能靠"墙家族列表"猜，只能靠"哪一族才是地面"。
//   下水道：只有橙色格栅（grate）是走道，橄榄绿污水面(sewage)与土堆(dirt)全挡。
//   工厂：只有浅灰地板(factory_floor)是地面，灰色方块墙(factory_wall)挡，
//         中心那套蓝色通风管道(vent)是原作 shortcut，管道内部可以走。
// 白名单为 null 时退回黑名单（SOLID_FAMILIES）。
let mapWalk = null;
let mapWalkKey = '';      // 白名单生效的地图 id（用于查 MAP_HOLES）

// 白名单地图里，哪些"地面"要按像素形状裁切（管道这种真实开口），
// 其余地面按整块处理、只在紧挨墙的一侧收 1 子格（对应格栅块那圈灰色边框）。
const WALK_ALPHA_CUT = new Set(['vent']);

// 判定「这一格的地块算不算一块完整地面」的覆盖率门槛。
// 下水道：grate_c_0 84% 算地面；grate_l_0 6% / grate_tli_0 12% / grate_tr_0 0% 是墙角碎块，算墙。
// 工厂：factory_floor 100%；vent 的拐角块 25%~76%，门槛放低一点才接得上管道。
const WALK_COVER_MIN = { grate: 0.35, vent: 0.20 };
function walkCoverMin(fam){ return WALK_COVER_MIN[fam] !== undefined ? WALK_COVER_MIN[fam] : 0.35; }

function setMapSolid(region){
  let s = SOLID_FAMILIES;
  mapWalk = null; mapWalkKey = '';
  if(typeof MAP_SOLID === 'object' && MAP_SOLID && MAP_SOLID[region && region.mapId]){
    s = new Set(MAP_SOLID[region.mapId]);
  }
  if(typeof MAP_WALK === 'object' && MAP_WALK && MAP_WALK[region && region.mapId]){
    mapWalk = new Set(MAP_WALK[region.mapId]);
    mapWalkKey = region.mapId;
  }
  const q = new URLSearchParams(location.search);
  const w = q.get('walls');
  if(w === 'swap'){
    // 白名单地图上对调 = 换成另一族当地面（只用于 A/B 对照排查）
    if(mapWalk){
      const sw = new Set(mapWalk);
      if(sw.has('grate')){ sw.delete('grate'); sw.add('sewage'); }
      else if(sw.has('sewage')){ sw.delete('sewage'); sw.add('grate'); }
      mapWalk = sw;
    } else {
      const sw = new Set(s);
      if(sw.has('sewage')){ sw.delete('sewage'); sw.add('grate'); }
      else if(sw.has('grate')){ sw.delete('grate'); sw.add('sewage'); }
      s = sw;
    }
  } else if(w === 'all'){
    // ?walls=all：除了白名单里的地面，其余全挡（等价于白名单默认行为）
  } else if(w){
    const add = new Set(), del = new Set();
    w.split(',').forEach(f=>{ f=f.trim(); if(!f) return; if(f[0]==='-') del.add(f.slice(1)); else add.add(f); });
    if(mapWalk){
      const sw = new Set(mapWalk);
      add.forEach(f=>sw.add(f)); del.forEach(f=>sw.delete(f));
      mapWalk = sw;
    } else {
      const sw = new Set(s);
      add.forEach(f=>sw.add(f)); del.forEach(f=>sw.delete(f));
      s = sw;
    }
  }
  mapSolid = s;
}

const TILE_VARIANTS = new Set(['c','l','r','t','b','tl','tr','bl','br','tli','tri','bri','bli']);

function tileFamily(gid){
  const fn = TILESET_MAP[gid];
  if(!fn) return '';
  const parts = String(fn).replace(/\.svg$/i,'').split('_');
  while(parts.length && (TILE_VARIANTS.has(parts[parts.length-1]) || /^\d+$/.test(parts[parts.length-1]))) parts.pop();
  return parts.join('_');
}
// 白名单地图：只有 mapWalk 里的家族算地面，其余（含空地块）都挡。
// 黑名单地图：命中 SOLID_FAMILIES 才挡。
function tileIsSolid(gid){
  if(mapWalk){ return !(gid && mapWalk.has(tileFamily(gid))); }
  return gid ? mapSolid.has(tileFamily(gid)) : false;
}
function tileIsWalk(gid){ return !tileIsSolid(gid); }

let sgGrid = null;            // Uint8Array, 1 = blocked (1 cell = 1 map tile) — used for pathing/labels
let sgComp = null;            // Uint32Array connected-component label (0 = blocked)
let sgMain = 0, sgMainSize = 0;
let sgW = 0, sgH = 0, sgMW = 0, sgMH = 0;
// ---- 花朵体型 ----
// 原作比例（按 1080p 原游戏截图像素实测反推）：地块 ≈ 170px、花朵直径 ≈ 24.5px
// （≈0.145 个地块）、花瓣 ≈ 11px、公转半径 ≈ 30px。下面这组数字就是按这个比例定的。
const FLOWER_SCALE = 0.72;
const PLAYER_BODY = 34 * FLOWER_SCALE;      // 绘制直径
const PLAYER_ORBIT = 42 * FLOWER_SCALE;     // 花瓣公转半径
const ORBIT_SPREAD = 56 * FLOWER_SCALE;     // 按住空格时往外再撑开多少
const BASE_SPIN = 2.5;        // 基础公转速度 rad/s（wiki：花瓣公转 2.5rad/s）
const SPIN_MIN = 0.25, SPIN_MAX = 2.5, SPIN_STEP = 0.15;   // Q/E 手动调速范围
// 用户要求：花朵实际的公转速度（rad/s）最高 3、最低 0.5 —— 天赋/QE 加成再高也夹在这个区间里
const SPIN_RAD_MIN = 0.5, SPIN_RAD_MAX = 3;
function clampSpin(v){ return Math.max(SPIN_RAD_MIN, Math.min(SPIN_RAD_MAX, v)); }

// ---- 接触伤害节奏 ----
// 原作里花瓣是「贴着生物就持续掉血」，不是打一下等一整个冷却：
// 冷却（Respawn）只在花瓣耐久被打空、碎掉之后才开始算。
// 下面这个是同一片花瓣两次结算伤害之间的最小间隔（原作手感约每 0.1~0.2s 跳一次伤害）
const HIT_GAP = 0.045;      // 花瓣贴住生物就连着打，直到耐久耗尽
// wiki 的「Petals Attraction Range +8」是游戏单位，换成像素（花朵直径 24.5px ≈ 原比例）
const ATTRACT_PX_PER_UNIT = 2.4;

// 会移动的生物才会转身（wiki：不动的石头 / 仙人掌 / 巢穴不做朝向）
const MOBILE_AI = new Set(['wander','chase','shooter','orbit','leech','friendly']);

// 素材里的「头」朝向：florr 的怪物贴图统一画成头朝左上（-135°）。
// 所以要让头指向花朵，旋转量 = 花朵方向 - 素材头朝向。
const ART_HEAD = -Math.PI * 0.75;
// 旋转对称、没有头的生物：不转身，免得看起来在乱转
const NO_HEAD_SPRITES = new Set([
  'Rock_(Mob)','Cactus','Ant_Hole','Ant_Egg_(Mob)','Bubble','Sponge','Starfish','Shell',
  'Jellyfish','Crab','Barrel','Tomb','Termite_Mound','Fire_Ant_Burrow','Sandstorm',
  'Assembler','Mecha_Flower','Garbage','Crystal','Pearl','Square','Dandelion_(Mob)','Bush'
]);
// 贴图绘制缩放（默认 1）：把「本体圆 / 整张画布」小于常规的贴图放大回去
//   Centipede_Head 的本体圆直径只占画布 72.7%，Centipede_Body 占 98.4%
//   → 1.355 之后头和身体节画出来一样大（每节大小完全相同）
const MOB_DRAW_K = { Centipede_Head: 1.355 };
const PLAYER_R = 17 * FLOWER_SCALE;         // 碰撞半径 == 花身半径

// 贴图旋转轴心修正：mobs_clean 是按「墨迹外框」裁的，虫子的身体（重心）
// 并不在图片正中，直接绕图片中心转会绕着中心甩，看起来就是「歪」的。
// 这里存每张贴图的不透明质心偏移（相对图片边长），绘制时把身体挪回原点。
// 个别贴图的「可视本体」不是居中的、也不是满框的，按实测补正：
//   Centipede_Head 的触角占了大量画布，本体圆只占 63% 且偏在右下方
//   → pivot 把本体挪回旋转中心，MOB_DRAW_K 把本体放大到和身体节一样大
const MOB_PIVOT = {
  Centipede_Head:[0.131, 0.123], Centipede_Body:[0.000, 0.000],
  Ant_Hole:[-0.002,0.027], Baby_Ant:[-0.016,0.013], Baby_Fire_Ant:[0.019,0.018],
  Baby_Termite:[0.011,0.013], Bee:[-0.015,0.014], Beetle:[0.029,0.028],
  Bumble_Bee:[0.063,0.063], Bush:[0.018,-0.024], Centipede:[0.020,0.020],
  Crab:[-0.012,-0.013], Desert_Centipede:[0.103,0.103], Digger:[-0.003,0.027],
  Diver_Soldier_Ant:[-0.022,0.009], 'Evil_Centipede_(Head)':[0.103,0.103],
  Fire_Ant_Burrow:[-0.003,0.027], Fly:[-0.032,-0.032], Garbage:[-0.009,-0.019],
  Hel_Beetle:[0.011,0.012], Hel_Centipede:[0.008,0.012], Hel_Wasp:[0.040,0.051],
  Hornet:[0.045,0.078], Ladybug:[-0.001,0.029], 'Ladybug_(Desert)':[-0.001,0.028],
  'Ladybug_(Jungle)':[-0.001,0.029], Leech:[-0.044,0.055], Mantis:[0.020,0.018],
  Moth:[0.042,0.042], Mummy_Beetle:[0.051,0.049], Nazar_Beetle:[0.041,0.041],
  Pharaoh_Beetle:[0.047,0.045], Queen_Ant:[0.025,0.024], Queen_Fire_Ant:[0.026,0.025],
  Roach:[0.096,0.096], 'Rock_(Mob)':[0.003,0.015], Scorpion:[0.038,0.034],
  'Shell_(Mob)':[-0.027,-0.027], Silverfish:[0.033,0.034], Soldier_Ant:[-0.022,0.006],
  Soldier_Fire_Ant:[-0.022,0.006], Soldier_Termite:[-0.019,-0.019],
  Spider:[0.001,0.023], Termite_Overmind:[-0.012,-0.012], Wasp:[0.076,0.076],
  Worker_Ant:[-0.032,-0.004], Worker_Fire_Ant:[0.013,0.015]
};
const PETAL_SIZE = 15 * FLOWER_SCALE;       // 单片花瓣的世界边长（约为花身直径的 0.44）

// --- sub-tile collision ---------------------------------------------------
// Edge tiles (dirt_l / water_tl / scliff_tri ...) are only PARTLY solid, so a
// whole-tile grid blocks a full tile earlier than the art suggests. Each tile
// is therefore sampled as SUB x SUB subcells from the tile art's alpha channel,
// composited bottom-to-top with the real layer order.
const SUB = 16;               // subcells per tile edge (170px / 16 ≈ 10.6px per subcell)
const SUBP = SUB*SUB;
let sfGrid = null;            // Uint8Array, 1 = blocked subcell
let bushGrid = null;          // Uint8Array, 1 = 这一格是 foliage 灌木丛（= 密道）
let bushW = 0, bushH = 0;
function buildBushGrid(m){
  bushGrid = null; bushW = 0; bushH = 0;
  if(!m || !m.layers) return;
  bushW = m.width; bushH = m.height;
  const tw = (m.tilewidth) ? m.tilewidth : TILE;
  const MW = bushW*tw, MH = bushH*tw;
  const n = bushW*bushH;
  const lyr = m.layers.map(L => { try { return decodeLayerBytes(L); } catch(e){ return null; } });
  // 1) 每格标出「是不是 foliage（灌木边缘）」和「站不站得住」
  const fol  = new Uint8Array(n);
  const walk = new Uint8Array(n);
  for(let ty=0; ty<bushH; ty++){
    for(let tx=0; tx<bushW; tx++){
      const i2 = ty*bushW+tx, o = i2*2;
      for(let li=lyr.length-1; li>=0; li--){
        const arr = lyr[li]; if(!arr) continue;
        const g = arr[o]; if(!g) continue;
        if(String(TILESET_MAP[g] || '').indexOf('foliage') === 0) fol[i2] = 1;
        break;
      }
      const wx = tx*tw - MW/2 + tw/2, wy = ty*tw - MH/2 + tw/2;
      walk[i2] = blockedAt(wx, wy, tw*0.35) ? 0 : 1;
    }
  }
  // 2) 从地图边界往外 BFS：能走到的 = 外面
  const out = new Uint8Array(n);
  const q = [];
  for(let tx=0; tx<bushW; tx++){ q.push(tx); q.push((bushH-1)*bushW+tx); }
  for(let ty=0; ty<bushH; ty++){ q.push(ty*bushW); q.push(ty*bushW + bushW-1); }
  for(const i2 of q){ if(walk[i2]) out[i2] = 1; }
  let head = 0;
  while(head < q.length){
    const i2 = q[head++];
    if(!out[i2]) continue;
    const tx = i2 % bushW, ty = (i2 / bushW) | 0;
    const nb = [tx>0? i2-1 : -1, tx<bushW-1? i2+1 : -1, ty>0? i2-bushW : -1, ty<bushH-1? i2+bushW : -1];
    for(const k of nb){
      if(k < 0 || out[k] || !walk[k]) continue;
      out[k] = 1; q.push(k);
    }
  }
  // 3) 走不到、但周围一圈有灌木边缘的可走格 = 灌木丛内部（密道）
  const g2 = new Uint8Array(n);
  const R = 2;
  for(let ty=0; ty<bushH; ty++){
    for(let tx=0; tx<bushW; tx++){
      const i2 = ty*bushW+tx;
      // ① 这一格本身就是灌木（站在灌木上）就是密道
      if(fol[i2]){ g2[i2] = 1; continue; }
      // ② 被围住、又挨着灌木的内部空地也算密道
      if(!walk[i2] || out[i2]) continue;
      let nearFol = false;
      for(let dy=-R; dy<=R && !nearFol; dy++){
        for(let dx=-R; dx<=R; dx++){
          const nx = tx+dx, ny = ty+dy;
          if(nx<0||ny<0||nx>=bushW||ny>=bushH) continue;
          if(fol[ny*bushW+nx]){ nearFol = true; break; }
        }
      }
      if(nearFol) g2[i2] = 1;
    }
  }
  bushGrid = g2;
}
// 世界坐标是否在灌木丛（密道）里
function inBushAt(x, y){
  if(!bushGrid) return false;
  const m = regionMap;
  const tw = (m && m.tilewidth) ? m.tilewidth : TILE;
  const MW = bushW*tw, MH = bushH*tw;
  const tx = Math.floor((x + MW/2)/tw), ty = Math.floor((y + MH/2)/tw);
  if(tx < 0 || ty < 0 || tx >= bushW || ty >= bushH) return false;
  return bushGrid[ty*bushW+tx] === 1;
}
let sfW = 0, sfH = 0;
let sgDirty = false;          // true while some tile art was still decoding
let SOLID_DEBUG = false;      // ?solid=1 把碰撞格子染红叠在地图上，用来核对墙体
let solidDbgCv = null, solidDbgFor = null;

const SUBMASK = {};           // gid*8+flags -> {m:Uint8Array, u:-1 mixed / 0 clear / 1 opaque}
const _mc = document.createElement('canvas');
_mc.width = SUB; _mc.height = SUB;
const _mctx = _mc.getContext('2d');

function subMask(gid, flags){
  const key = gid*8 + flags;
  let info = SUBMASK[key];
  if(info) return info;
  if(!TILESET_MAP[gid]){          // no art for this gid: treat as a full wall
    info = {m:null, u:1, o:SUBP};
    SUBMASK[key] = info;
    return info;
  }
  const img = TILE_IMG[gid];
  if(!img || !img.complete || !img.naturalWidth) return null;
  const c = _mctx;
  c.setTransform(1,0,0,1,0,0);
  c.clearRect(0,0,SUB,SUB);
  const fm = FLIP_M[flags];
  c.save();
  c.translate(SUB/2, SUB/2);
  c.transform(fm[0],fm[1],fm[2],fm[3],0,0);
  c.drawImage(img, -SUB/2, -SUB/2, SUB, SUB);
  c.restore();
  const d = c.getImageData(0,0,SUB,SUB).data;
  const m = new Uint8Array(SUBP);
  let opaque = 0;
  for(let i=0;i<SUBP;i++){
    if(d[i*4+3] > 80){ m[i] = 1; opaque++; }   // ignore the soft 10% drop shadows
  }
  info = {m, u: opaque===SUBP ? 1 : (opaque===0 ? 0 : -1), o: opaque};
  SUBMASK[key] = info;
  return info;
}

// build the collision grids + main walkable component from the decoded tilemap
// returns false when tile art was not ready yet (caller retries)
function buildSolidGrid(m){
  sgW = m.width; sgH = m.height;
  sgMW = sgW*TILE; sgMH = sgH*TILE;
  sfW = sgW*SUB; sfH = sgH*SUB;
  const n = sgW*sgH;
  const coarse = new Uint8Array(n);
  const fine = new Uint8Array(sfW*sfH);
  const tmp = new Uint8Array(SUBP);
  const lyr = m.layers.map(L => decodeLayerBytes(L));
  const nL = lyr.length;
  const stackGid = new Int32Array(nL), stackFlg = new Uint8Array(nL), stackSolid = new Uint8Array(nL);
  let missing = false;

  // ---- pass 1（仅白名单地图）：先定出「哪些格算地面」 ----
  // 自上而下找第一张「覆盖面积够大」的地块（装饰性边角碎块 <35% 忽略），
  // 它的家族在白名单里 → 这一格是地面。
  //   下水道：grate_c_0 覆盖 84% → 地面；grate_l_0 只有 6% → 忽略，落到下面的 sewage → 墙。
  let walkLvl = null, walkFam = null;
  if(mapWalk){
    walkLvl = new Uint8Array(n);
    walkFam = new Array(n).fill('');
    for(let ty=0; ty<sgH; ty++){
      for(let tx=0; tx<sgW; tx++){
        const o = (ty*sgW+tx)*2;
        for(let li=nL-1; li>=0; li--){
          const g = lyr[li][o];
          if(!g) continue;
          const info = subMask(g, lyr[li][o+1] & 7);
          if(!info){ missing = true; break; }
          const f = tileFamily(g);
          if(info.o < SUBP*walkCoverMin(f)) continue;   // 装饰性边角碎块：忽略，继续看下层
          walkFam[ty*sgW+tx] = f;
          walkLvl[ty*sgW+tx] = mapWalk.has(f) ? 1 : 0;
          break;
        }
      }
    }
  }

  for(let ty=0; ty<sgH; ty++){
    for(let tx=0; tx<sgW; tx++){
      // 某个 8x8 子格挡不挡：
      //   白名单地图（下水道 / 工厂）：可走 = 「白名单家族的不透明像素」。
      //     自下而上逐层合成：上层不透明的那种像素就按"这层是不是地面"定，
      //     透明的地方保留下层结果。默认全挡（空白格也是墙）。
      //     这样橙色格栅那块圆角方块的「外沿灰色沟槽」正好落在透明区 → 天然阻隔，
      //     格栅的深色横纹是实色，不会被挖成筛子。
      //   其余地图：沿用「顶层地块决定 + alpha 裁切」的老规则。
      const o = (ty*sgW + tx)*2;
      let ns = 0;
      for(let li=nL-1; li>=0; li--){
        const g = lyr[li][o];
        if(!g) continue;
        // 灌木丛（foliage）只是盖在上面的装饰：不参与碰撞判定，
        // 这样灌木底下藏着的那堵墙才认得出来（密道里的墙体）
        if(String(TILESET_MAP[g] || '').indexOf('foliage') === 0) continue;
        stackGid[ns] = g; stackFlg[ns] = lyr[li][o+1] & 7; stackSolid[ns] = 0; ns++;
      }
      tmp.fill(0);
      if(mapWalk){
        const i = ty*sgW + tx;
        if(!walkLvl[i]){
          tmp.fill(1);                                   // 非地面（污水 / 土堆 / 空白）→ 整格挡
        } else if(WALK_ALPHA_CUT.has(walkFam[i])){
          // 真形状的地面（工厂通风管）：自下而上逐层合成，管道开口才能通行
          tmp.fill(1);
          for(let li=0; li<nL; li++){
            const g = lyr[li][o];
            if(!g) continue;
            const info = subMask(g, lyr[li][o+1] & 7);
            if(!info){ missing = true; break; }
            const solid = tileIsSolid(g) ? 1 : 0;
            if(info.u === 1){ tmp.fill(solid); continue; }  // 整格不透明：完全盖住下层
            if(info.u === 0) continue;                      // 整格透明：盖不住
            const mm = info.m;
            for(let s=0; s<SUBP; s++) if(mm[s]) tmp[s] = solid;
          }
        } else {
          // 整块地面（格栅 / 工厂地板）：整格可走，只有紧挨着墙的那一侧收 1 子格。
          // 格栅地块四周那圈 14/256 的深灰边（#333）正好被这一圈收边吃掉，
          // 所以玩家停下的位置就是视觉上的「灰色边缘」，而连续地面之间不受影响。
          for(let s=0; s<SUBP; s++) tmp[s] = 0;
          const upX    = ty>0      ? walkLvl[(ty-1)*sgW+tx] : 0;
          const dnX    = ty<sgH-1  ? walkLvl[(ty+1)*sgW+tx] : 0;
          const lfX    = tx>0      ? walkLvl[ty*sgW+tx-1]   : 0;
          const rtX    = tx<sgW-1  ? walkLvl[ty*sgW+tx+1]   : 0;
          for(let sy=0; sy<SUB; sy++){
            for(let sx=0; sx<SUB; sx++){
              if(!upX && sy===0)            tmp[sy*SUB+sx] = 1;
              if(!dnX && sy===SUB-1)        tmp[sy*SUB+sx] = 1;
              if(!lfX && sx===0)            tmp[sy*SUB+sx] = 1;
              if(!rtX && sx===SUB-1)        tmp[sy*SUB+sx] = 1;
            }
          }
        }
      } else if(ns){
        const topGid = stackGid[0];
        if(tileIsSolid(topGid)){
          const info = subMask(topGid, stackFlg[0]);
          if(!info){                                   // 素材还没解码完：保守地整格挡
            missing = true; tmp.fill(1);
          } else if(info.u === 1){
            tmp.fill(1);                               // 整格不透明的墙
          } else if(info.u !== 0){                     // 有形状的墙：按掩码裁
            const mm = info.m;
            for(let s=0; s<SUBP; s++) if(mm[s]) tmp[s] = 1;
            // 透明的那部分：往下找，如果被另一层整格不透明的墙托着就仍然挡
            for(let si=1; si<ns; si++){
              const gi = subMask(stackGid[si], stackFlg[si]);
              if(!gi) continue;
              if(!tileIsSolid(stackGid[si])) break;    // 下面是地面 → 这块透明区域就是可走的
              if(gi.u === 1){ tmp.fill(1); break; }    // 下面有实心墙 → 整格都挡
            }
          }
        }
      }
      let blocked = 0;
      for(let s=0;s<SUBP;s++) if(tmp[s]) blocked++;
      coarse[ty*sgW+tx] = blocked > SUBP*0.5 ? 1 : 0;   // mostly-blocked tile = blocked for pathing
      const base = (ty*SUB)*sfW + tx*SUB;
      for(let oy=0;oy<SUB;oy++){
        const src = oy*SUB, dst = base + oy*sfW;
        for(let ox=0;ox<SUB;ox++) fine[dst+ox] = tmp[src+ox];
      }
    }
  }
  sgGrid = coarse; sfGrid = fine; sgComp = null;
  solidDbgCv = null;            // 网格重算后丢掉旧的碰撞叠加缓存
  // 白名单地图上被地形盖住的传送口：强行凿成可走（3x3，保证玩家找得到）
  if(mapWalk && typeof MAP_HOLES === 'object' && MAP_HOLES){
    const holes = MAP_HOLES[mapWalkKey] || null;
    if(holes){
      for(const [hx,hy] of holes){
        for(let dy=-1; dy<=1; dy++){
          for(let dx=-1; dx<=1; dx++){
            const tx = hx+dx, ty = hy+dy;
            if(tx<0||ty<0||tx>=sgW||ty>=sgH) continue;
            coarse[ty*sgW+tx] = 0;
            const base = (ty*SUB)*sfW + tx*SUB;
            for(let oy=0; oy<SUB; oy++) for(let ox=0; ox<SUB; ox++) fine[base+oy*sfW+ox] = 0;
          }
        }
      }
    }
  }
  labelComponents(n);
  sgDirty = missing;
  return !missing;
}
function labelComponents(n){
  const comp = new Uint32Array(n);
  const q = new Int32Array(n);
  let label = 0, bestLabel = 0, bestSize = 0;
  for(let i=0;i<n;i++){
    if(sgGrid[i] || comp[i]) continue;
    label++;
    let head = 0, tail = 0, cnt = 0;
    q[tail++] = i; comp[i] = label;
    while(head < tail){
      const k = q[head++]; cnt++;
      const x = k % sgW, y = (k - x) / sgW;
      if(x > 0){ const kk = k-1; if(!sgGrid[kk] && !comp[kk]){ comp[kk]=label; q[tail++]=kk; } }
      if(x < sgW-1){ const kk = k+1; if(!sgGrid[kk] && !comp[kk]){ comp[kk]=label; q[tail++]=kk; } }
      if(y > 0){ const kk = k-sgW; if(!sgGrid[kk] && !comp[kk]){ comp[kk]=label; q[tail++]=kk; } }
      if(y < sgH-1){ const kk = k+sgW; if(!sgGrid[kk] && !comp[kk]){ comp[kk]=label; q[tail++]=kk; } }
    }
    if(cnt > bestSize){ bestSize = cnt; bestLabel = label; }
  }
  sgComp = comp; sgMain = bestLabel; sgMainSize = bestSize;
}

function cellOf(wx, wy){
  return [Math.floor((wx + sgMW/2)/TILE), Math.floor((wy + sgMH/2)/TILE)];
}
function cellCenter(tx, ty){
  return [ (tx+0.5)*TILE - sgMW/2, (ty+0.5)*TILE - sgMH/2 ];
}
// is this world point inside a blocking subcell? (outside the map counts as blocked)
const SUBPX = TILE/SUB;       // world px per subcell
function solidAtWorld(wx, wy){
  if(!sfGrid) return false;
  const gx = Math.floor((wx + sgMW/2)/SUBPX), gy = Math.floor((wy + sgMH/2)/SUBPX);
  if(gx < 0 || gy < 0 || gx >= sfW || gy >= sfH) return true;
  return sfGrid[gy*sfW + gx] === 1;
}
// square hitbox test (corners, edge midpoints and centre)
function blockedAt(x, y, r){
  if(!sfGrid) return false;
  const rr = r*0.7071;   // corner samples on the circle, not the bounding box
  return solidAtWorld(x, y) ||
         solidAtWorld(x-rr, y-rr) || solidAtWorld(x+rr, y-rr) ||
         solidAtWorld(x-rr, y+rr) || solidAtWorld(x+rr, y+rr) ||
         solidAtWorld(x-r, y) || solidAtWorld(x+r, y) ||
         solidAtWorld(x, y-r) || solidAtWorld(x, y+r);
}
function isFreeMainAt(wx, wy){
  if(!sgGrid) return true;
  const [tx,ty] = cellOf(wx, wy);
  if(tx<0||ty<0||tx>=sgW||ty>=sgH) return false;
  const i = ty*sgW+tx;
  return !sgGrid[i] && sgComp[i] === sgMain;
}
// nearest buildable spot inside the main walkable area
function findSpawn(wx, wy){
  if(!sgGrid) return {x:wx, y:wy};
  let [tx,ty] = cellOf(wx, wy);
  tx = Math.max(0, Math.min(sgW-1, tx)); ty = Math.max(0, Math.min(sgH-1, ty));
  const open = (cx,cy)=> !sgGrid[cy*sgW+cx] && sgComp[cy*sgW+cx]===sgMain;
  // 1st choice: an open cell with open neighbours (so we don't appear in a pocket)
  const roomy = (cx,cy)=>{
    if(cx<1||cy<1||cx>sgW-2||cy>sgH-2) return false;
    for(let oy=-1;oy<=1;oy++) for(let ox=-1;ox<=1;ox++) if(!open(cx+ox,cy+oy)) return false;
    const [px,py] = cellCenter(cx,cy);
    return !blockedAt(px, py, PLAYER_R);
  };
  // 2nd choice: any free cell the player actually fits in
  const fits = (cx,cy)=>{
    if(cx<1||cy<1||cx>sgW-2||cy>sgH-2) return false;
    if(!open(cx,cy)) return false;
    const [px,py] = cellCenter(cx,cy);
    return !blockedAt(px, py, PLAYER_R);
  };
  if(roomy(tx,ty)) return {x:wx, y:wy};
  const maxR = Math.max(sgW, sgH);
  for(const test of [roomy, fits]){
    for(let r=1;r<=maxR;r++){
      for(let oy=-r;oy<=r;oy++){
        for(let ox=-r;ox<=r;ox++){
          if(Math.max(Math.abs(ox),Math.abs(oy)) !== r) continue;
          if(test(tx+ox, ty+oy)){
            const [cx,cy] = cellCenter(tx+ox, ty+oy);
            return {x:cx, y:cy};
          }
        }
      }
    }
  }
  return {x:wx, y:wy};
}
// a random free spot in the main area, at least minD / at most maxD away from (ox,oy)
function randomFreeSpot(ox, oy, minD, maxD, tries){
  tries = tries || 40;
  for(let t=0;t<tries;t++){
    const a = Math.random()*6.2832;
    const d = minD + Math.random()*(maxD-minD);
    const x = ox + Math.cos(a)*d, y = oy + Math.sin(a)*d;
    if(isFreeMainAt(x,y) && !blockedAt(x,y,10)) return {x, y};
  }
  return null;
}

// fetch + decode a region's tilemap; mark ready when current
function loadRegionMap(region){
  regionMap = null; regionMapReady = false;
  setMapSolid(region);            // 每张地图的墙体家族（可在 regions.js 里覆盖）
  sgGrid = null; sfGrid = null; sgComp = null; sgDirty = false;
  sgW = 0; sgH = 0; sgMW = 0; sgMH = 0; sfW = 0; sfH = 0;
  if(!region.map){ boundX = WORLD; boundY = WORLD; return; }
  if(regionMapsCache[region.map]){ onMapLoaded(region, regionMapsCache[region.map]); return; }
  const id = region.mapId;
  // 离线（file://）优先用 .js 包装版：直接 <script> 注入，无 CORS 限制
  const viaScript = (region.mapJs && id) ? loadDataScript(region.mapJs)
      .then(()=>{ const j=(window.MAPS_DATA||{})[id]; if(!j) throw new Error('no map data'); return j; })
    : Promise.reject(new Error('no js map'));
  viaScript
    .catch(()=> fetch(region.map).then(r=>r.json()))   // http 服务器下的兜底
    .then(j=>{
      regionMapsCache[region.map] = j;
      onMapLoaded(region, j);
    })
    .catch(()=>{ boundX=WORLD; boundY=WORLD; });
}
function onMapLoaded(region, j){
  const mw = j.width*TILE, mh = j.height*TILE;
  // preload tile images for every gid used in this map (after tileset map is ready)
  const used = new Set();
  for(const l of j.layers){ const b=atob(l.b64); for(let i=0;i<b.length;i+=2){ const g=b.charCodeAt(i); if(g>0) used.add(g); } }
  const isCurrent = () => region.map === (REGIONS[currentRegion] && REGIONS[currentRegion].map);
  const prep = () => {
    used.forEach(g=>getTileImage(g));
    // terrain collision needs the gid -> filename table (and decoded tile art)
    if(!isCurrent()) return;
    buildSolidGrid(j);       // sgDirty is set if some tile art was still loading
    buildBushGrid(j);
    if(typeof spawnPending !== 'undefined' && spawnPending){
      spawnPending = false;
      placeAtRegionSpawn();  // 地图网格就绪后再摆一次出生点（此时才知道哪里有水）
    }
    snapOutOfWall();
    enemies = enemies.filter(e => isFreeMainAt(e.x, e.y));
  };
  if(tilesetReady) prep(); else tilesetPromise.then(prep);
  if(isCurrent()){
    regionMap = j; regionMapReady = true;
    boundX = mw/2 - TILE*0.5; boundY = mh/2 - TILE*0.5;
    minimapCacheKey = null;
  }
}

// if the player ended up inside a wall (region change, or the precise grid
// replaced a coarse one), push them to the closest open spot
function snapOutOfWall(){
  if(!sgGrid) return false;
  if(!blockedAt(player.x, player.y, PLAYER_R) && isFreeMainAt(player.x, player.y)) return false;
  const sp = findSpawn(player.x, player.y);
  player.x = sp.x; player.y = sp.y; cam.x = sp.x; cam.y = sp.y;
  player.vx = 0; player.vy = 0;
  return true;
}

// ---------- input ----------
const keys = {};
const mouse = {x:0, y:0, down:false, right:false};
window.addEventListener('keydown', e=>{
  // 在聊天框里打字：不要触发游戏快捷键（Q/E 转速、数字键换槽、空格撑开…）
  if(typeof elChatInput !== 'undefined' && elChatInput && document.activeElement === elChatInput) return;
  // 回车打开聊天框（原作里也是回车聊天）
  if(e.key === 'Enter' && state===STATE.PLAY && !e.shiftKey){
    e.preventDefault();
    if(typeof chatOpen === 'function') chatOpen();
    return;
  }
  const k = e.key.toLowerCase();
  keys[k] = true;
  // 空格：把花瓣往外撑开（原作 attack/defense 伸展），按住持续张开
  if(e.code === 'Space' || e.key === ' '){ keys[' '] = true; player.firePeas = true; e.preventDefault(); }
  // Shift：把花瓣往花身上收（距离变近，带缓动动画）；同时触发 Peas 向四周射出
  if(e.key === 'Shift'){ keys['shift'] = true; player.firePeas = true; }
  if(e.key === 'Alt'){ keys['alt'] = true; e.preventDefault(); }   // Alt：小地图显示稀有度分区
  // Q / E 调花瓣转速（按住可以连续加减）
  if(state===STATE.PLAY && (k==='q' || k==='e')){
    const dir = (k==='e') ? 1 : -1;
    player.spinCtrl = Math.max(SPIN_MIN, Math.min(SPIN_MAX, (player.spinCtrl||1) + dir*SPIN_STEP));
    updateSpinHud();
    e.preventDefault();
  }
  // R = 整套主槽 / 副槽互换
  if(state===STATE.PLAY && (e.key==='r' || e.key==='R')){
    const tag = (e.target && e.target.tagName) || '';
    if(tag !== 'INPUT' && tag !== 'TEXTAREA'){ swapAllSlots(); e.preventDefault(); return; }
  }
  // 数字键 1..9 / 0 = 主槽 <-> 副槽 互换（原作：数字键换装，不是换地图）
  if(state===STATE.PLAY && /^[0-9]$/.test(e.key)){
    const i = e.key==='0' ? 9 : (parseInt(e.key,10)-1);
    swapSlotWithAlt(i);
  }
});
window.addEventListener('keyup', e=>{
  const k = e.key.toLowerCase();
  keys[k] = false;
  if(e.key === 'Shift') keys['shift'] = false;
  if(e.key === 'Alt') keys['alt'] = false;
  if(e.code === 'Space' || e.key === ' '){ keys[' '] = false; e.preventDefault(); }
});
window.addEventListener('blur', ()=>{ for(const k in keys) keys[k] = false; });
canvas.addEventListener('mousemove', e=>{ mouse.x=e.clientX; mouse.y=e.clientY; });
canvas.addEventListener('mousedown', e=>{
  if(e.button === 2) mouse.right = true; else mouse.down = true;
});
window.addEventListener('mouseup', e=>{
  if(e.button === 2) mouse.right = false; else mouse.down = false;
});

// ---------- game state ----------
const STATE = {MENU:0, PLAY:1, DEAD:2};
let state = STATE.MENU;

const player = {
  x:0, y:0, vx:0, vy:0,
  hp:100, maxHp:100, regen:0,
  level:1, xp:0, xpNeed:0,
  speedMult:1, magnetR:70, orbitBonus:0, spinBonus:0, dmgMult:1, xpMult:1,
  equipped:[],      // array of {name,rarity,def,cd,shieldMax,shieldCur,shieldHit,reviveUsed}
  gallery:{},       // Mob Gallery：'mobKey|Rarity' -> 击杀次数
  alt:[],           // 副槽：按数字键 1..9/0 与主槽互换，不参与战斗
  backpack:[],      // array of {name,rarity}
  ankh:0,
  petalAngle:0,
  hitFlash:0,
  name:'Player',
  // talents
  talents:new Set(),
  tpSpent:0,
  slotBonus:0, healthMult:1, petalHealthMult:1, medicMult:1, reloadMult:1,
  rotAdd:0, visionMult:1, reachAdd:0, talentMagnet:0, bodyDmgMult:1, luck:0,
  bodyDmg:BASE_BODY_DMG,          // 花朵体伤（撞到生物时花朵打回去的伤害，recompute 里重算）
  poisonMult:1, poisonDurMult:1, duplicatorLevel:0, secondChance:null, bodyToxicity:false,
  invuln:0, scCd:0,
  spread:0,                  // 空格撑开花瓣的程度 0..1
  faceState:'normal',        // 表情状态机当前状态（必须初始化，否则第一次切换查不到过渡序列）
  spinCtrl:1                 // Q/E 手动转速倍率
};
let enemies = [];
let projectiles = [];
let eproj = [];            // 怪物发射的投射物（导弹 / 豌豆 / 毒刺 / 珍珠 / 激光）
let zaps = [];             // 电击/闪电特效（水母、萤火虫）
let puffs = [];            // 出生、死亡、泡泡破裂的小特效
let petalVanish = [];      // 花瓣消失时的动画（放大 + 淡出 + 光环）
let drops = [];
let pollenFields = [];     // Pollen 留在地上的花粉（10 秒内持续伤害）
let summons = [];
let invDirty = false;                    // 背包/槽位 UI 脏标记（拾取合并重建）
let waxSummons = [];                    // Wax 释放出的蜡召唤物（静止、可被花推动、会被生物打）          // 召唤天赋的兵蚁伙伴
let decorations = [];
let texts = [];            // 飘字：伤害 / 治疗 / 状态，效果看得见
let healFx = [];           // 回血花瓣飞回花朵的动画（Rose 等：先飞向花，再变透明并回血）
let petalTrail = [];       // 花瓣拖尾（Super 及以上的环形尾迹）
let trailClock = 0;

// ============================================================
//  花瓣拖尾 —— 只有 Super / Eternal / Unique 有
//  数值全部按上传的 "super basic 拖尾.png" 逐像素量出来的：
//    图里尾迹 = 5 个「软边白色光斑」，直径 17px / 花瓣直径 48px → 0.354
//    离花瓣越远越淡：α 0.20 / 0.15 / 0.10 / 0.10 / 0.09
//    光斑左右随机散开，最远 25px ≈ 自身半径的 1 倍 → 张开的锥形尾
//  所以不做「残影缩小链」，做「等大、按寿命线性变淡、带侧向偏移的光斑」
// ============================================================
const TRAIL_LIFE    = 0.32;   // 单个光斑寿命（秒）→ 尾巴长度 ≈ 2.7 个花瓣半径（实测 2.75）
const TRAIL_EVERY   = 0.048;  // 每隔这么久吐一个 → 同屏稳定 6 个
const TRAIL_R       = 0.56;   // 光斑半径 ÷ 花瓣半径（参考图实测 0.355，这里画大一点更明显）
const TRAIL_A0      = 0.78;   // 出生 alpha（参考图实测 0.20；用户觉得太浅，白色提到 0.58）
const TRAIL_SCATTER = 2.60;   // 侧向漂移 ÷ 光斑半径（实测最远 25px / 半径 8.5 ≈ 2.9）
const TRAIL_TINT    = 0.04;   // 花瓣/稀有度本色染色比例（Basic 出来就是纯白，几乎不掺色）

function emitTrail(p, x, y, ang, dt){
  if(!p._puffs) p._puffs = [];
  // 只有 Super 及以上才有拖尾；掉级/换花瓣时立刻清空
  if(RARITIES.indexOf(p.rarity) < 7){ if(p._puffs.length) p._puffs.length = 0; return; }
  // 寿命推进 + 剔除过期
  for(let i=p._puffs.length-1;i>=0;i--){
    p._puffs[i].t += dt;
    if(p._puffs[i].t >= TRAIL_LIFE) p._puffs.splice(i,1);
  }
  p._trailT = (p._trailT||0) + dt;
  if(p._trailT < TRAIL_EVERY) return;
  p._trailT -= TRAIL_EVERY;
  // 侧向随机方向（垂直于花瓣运动方向）
  const side = ang + Math.PI/2;
  const dir  = (Math.random()*2-1) * (0.45 + Math.random()*0.55);
  p._puffs.push({
    x, y,
    dx: Math.cos(side)*dir, dy: Math.sin(side)*dir,   // 侧移方向（单位向量×强度）
    t: 0
  });
  DBG.trailEmit = (DBG.trailEmit||0) + 1;
  if(p._puffs.length > 9) p._puffs.shift();
}

// 两个 #rrggbb 之间插值（拖尾环用白化版本，彩色环压在草地上根本看不见）
function mixHex(a, b, t){
  const pa = parseInt((a||'#ffffff').slice(1), 16), pb = parseInt((b||'#ffffff').slice(1), 16);
  const r = Math.round(((pa>>16)&255)*(1-t) + ((pb>>16)&255)*t);
  const g = Math.round(((pa>>8)&255)*(1-t) + ((pb>>8)&255)*t);
  const bl = Math.round((pa&255)*(1-t) + (pb&255)*t);
  return '#' + ((1<<24) + (r<<16) + (g<<8) + bl).toString(16).slice(1);
}

// ---------- 飘字 ----------
function addText(x, y, txt, col, size, life, dmg){
  if(texts.length > 110) texts.shift();
  texts.push({x, y, txt, col:col||'#fff', size:size||13, t:0, life:life||0.8,
              // 伤害数字：跳得更高更快，普通文字维持原样
              vy: dmg ? (-95 - Math.random()*22) : (-40-Math.random()*18),
              vx:(Math.random()-0.5)*22, dmg: !!dmg});
}
// 击杀提示（右上角滚动条）：把被击杀的怪名推一条，2.2s 后淡出自行移除
function pushKill(name){
  const box = document.getElementById('killfeed');
  if(!box) return;
  const el = document.createElement('div');
  el.className = 'kf';
  el.innerHTML = '☠ <b>' + (name || 'mob') + '</b>';
  box.appendChild(el);
  setTimeout(()=>{ el.classList.add('out'); setTimeout(()=>{ if(el.parentNode) el.parentNode.removeChild(el); }, 420); }, 2200);
}

function updateTexts(dt){
  for(let i=texts.length-1;i>=0;i--){
    const t = texts[i]; t.t += dt;
    if(t.t >= t.life){ texts.splice(i,1); continue; }
    t.x += t.vx*dt; t.y += t.vy*dt; t.vy += 34*dt;
  }
}
function drawTexts(){  if(!texts.length) return;
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for(const t of texts){
    const k = t.t/t.life;
    const [sx,sy] = w2s(t.x, t.y);
    ctx.globalAlpha = k < 0.7 ? 1 : Math.max(0, 1-(k-0.7)/0.3);
    if(t.dmg){
      // 快速显现：前 80ms 从 55% 弹到 118%，再回落到 100%
      const pop = t.t < 0.08 ? (0.55 + (t.t/0.08)*0.63)
                : (t.t < 0.16 ? 1.18 - ((t.t-0.08)/0.08)*0.18 : 1);
      const fs = Math.max(9, Math.round(t.size*VIEW*pop));
      ctx.font = '700 ' + fs + "px 'Ubuntu', sans-serif";
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2.2, 3.4*VIEW);
      ctx.strokeStyle = 'rgba(0,0,0,.92)';
      ctx.strokeText(t.txt, sx, sy);
      ctx.fillStyle = 'rgba(255,58,58,.80)';       // 80% 透明度的红
      ctx.fillText(t.txt, sx, sy);
      continue;
    }
    ctx.font = '700 ' + Math.max(9, Math.round(t.size*VIEW)) + "px 'Ubuntu', sans-serif";
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, 3*VIEW);
    ctx.strokeStyle = 'rgba(0,0,0,.75)';
    ctx.strokeText(t.txt, sx, sy);
    ctx.fillStyle = t.col;
    ctx.fillText(t.txt, sx, sy);
  }
  ctx.restore();
}

// 行为统计数据（?probe=1 会把它们输出到 document.title，便于无头截图断言）
const DBG = {shots:0, adds:0, zaps:0, deaths:0, drops:0, frSeen:{},
             charges:0, attaches:0, dugs:0, retreats:0, undead:0, link:0, pops:0,
             broke:0, supers:0};

// Super 生物的出现规则（wiki）：正常刷怪不会出 Super，只有 Ultra 档的区域里
// 极小概率替换一只；出现一只后冷却 20 分钟（1200 秒）才会再出现。
// 每次出现都会在聊天框里播报 "A Super <名字> has spawned!"。
const SUPER_EVERY_ULTRA = 500;
const SUPER_RATE = 0.02;      // Ultra 区每次刷怪替换成 Super 的概率
const SUPER_CD = 1200;
let ultraSpawned = 0;
let superCd = 0;
const superCdByMob = {};       // 每种怪自己的 Super 刷新冷却（秒）

// ---------- summons (召唤天赋实装) ----------
const SUMMON_ART = 'assets/mobs_trans/summon_Soldier_Ant.png';
const SUMMON_IMG = new Image(); SUMMON_IMG.src = SUMMON_ART;
const SUMMON_R = 14;

function syncSummons(){
  const want = (player.summonerLevel||0) > 0 ? 1 : 0;   // 原版：提升召唤物生命而非数量
  while(summons.filter(s=>!s.dead).length > want){
    const idx = summons.findIndex(s=>!s.dead);
    summons.splice(idx,1);
  }
  while(summons.filter(s=>!s.dead).length < want){
    const lvl = player.summonerLevel || 0;
    const hpMult = player.summonHpMult || 1;      // 原版 Summoner：召唤物最大生命 110% → 259.4%
    const dmgMult = 1 + (lvl-1)*0.35;
    summons.push({
      x:player.x, y:player.y, ang:Math.random()*6.28,
      hp: 90*hpMult*(1+player.level*0.05), maxHp: 90*hpMult*(1+player.level*0.05),
      dmg: 16*dmgMult, atkCd:0, hitFlash:0, dead:false, respawn:0, wob:Math.random()*6.28
    });
  }
}

function updateSummons(dt){
  const want = (player.summonerLevel||0) > 0 ? 1 : 0;   // 原版：提升召唤物生命而非数量
  const alive = summons.filter(s=>!s.dead);
  if(alive.length !== want) syncSummons();
  const n = Math.max(alive.length,1);
  let k=0;
  for(const s of summons){
    if(s.dead){
      s.respawn -= dt;
      if(s.respawn<=0){ s.dead=false; s.hp=s.maxHp; s.x=player.x; s.y=player.y; }
      continue;
    }
    s.wob += dt*6; if(s.hitFlash>0) s.hitFlash-=dt; if(s.atkCd>0) s.atkCd-=dt;
    // orbit the player, offset each summon
    s.ang += 0.8*dt;
    const R = PLAYER_BODY*1.6 + 34;
    const tx = player.x + Math.cos(s.ang + k*2*Math.PI/n)*R;
    const ty = player.y + Math.sin(s.ang + k*2*Math.PI/n)*R;
    k++;
    // chase the nearest enemy if close, otherwise trail the player
    let target=null, bd=340;
    for(const e of enemies){
      const d = Math.hypot(e.x-s.x, e.y-s.y);
      if(d<bd){ bd=d; target=e; }
    }
    let gx=tx, gy=ty;
    if(target){ gx=target.x; gy=target.y; }
    const dx=gx-s.x, dy=gy-s.y, d=Math.hypot(dx,dy)||1;
    const sp = target?150:200;
    s.x += dx/d*Math.min(sp*dt, d);
    s.y += dy/d*Math.min(sp*dt, d);
    // contact damage（形状判定：召唤物圆 + 怪的贴图形状，不再是两个圆）
    if(target && bd < target.r + SUMMON_R && s.atkCd<=0 && mobTouchesDisc(target, s.x, s.y, SUMMON_R)){
      hurtEnemy(target, s.dmg);
      s.atkCd = 0.5;
      s.hitFlash = 0.12;
    }
  }
}

function drawSummons(){
  const vs = VIEW;
  const s = SUMMON_R*2.4*vs;
  for(const sm of summons){
    if(sm.dead) continue;
    const [sx,sy]=w2s(sm.x,sm.y);
    ctx.save(); ctx.translate(sx,sy);
    if(SUMMON_IMG.complete && SUMMON_IMG.naturalWidth){
      ctx.drawImage(SUMMON_IMG, -s/2, -s/2, s, s);
      if(sm.hitFlash>0){ ctx.globalAlpha=0.5; ctx.fillStyle='#fff';
        ctx.beginPath(); ctx.arc(0,0,s*0.42,0,6.28); ctx.fill(); ctx.globalAlpha=1; }
    } else {
      ctx.fillStyle = sm.hitFlash>0?'#fff':'#3d3d3d';
      ctx.beginPath(); ctx.arc(0,0,SUMMON_R*vs,0,6.28); ctx.fill();
    }
    // hp bar
    if(sm.hp<sm.maxHp){
      const w=s*0.8;
      ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(-w/2, -s/2-8, w, 4);
      ctx.fillStyle='#7ed957'; ctx.fillRect(-w/2, -s/2-8, w*(sm.hp/sm.maxHp), 4);
    }
    ctx.restore();
  }
}

// summon takes a hit
// ---------- Wax 召唤物 ----------
// 蜡是六边形碰撞体：某方向上的有效半径（support function，随朝向变化，不是圆形）
function waxEffR(w, ang){
  const T = Math.PI/3;
  const a = ((ang % T) + T) % T;
  const delta = Math.min(a, T-a);
  return w.r * Math.cos(delta);
}
// 泡泡冲刺：独立推进（不依赖移动管线，任何情况下都会把花推出去）
function updateBubbleDash(dt){
  let vx = player.bubbleVX||0, vy = player.bubbleVY||0;
  if(!vx && !vy) return;
  const len = Math.hypot(vx,vy)*dt;
  const sub = Math.max(1, Math.ceil(len/18));
  for(let i=0;i<sub;i++){
    const nx = player.x + vx*dt/sub;
    if(!blockedAt(nx, player.y, PLAYER_R)) player.x = nx;
    const ny = player.y + vy*dt/sub;
    if(!blockedAt(player.x, ny, PLAYER_R)) player.y = ny;
  }
  const d = Math.exp(-dt/0.35);
  player.bubbleVX = vx*d; player.bubbleVY = vy*d;
  if(Math.hypot(player.bubbleVX, player.bubbleVY) < 6){ player.bubbleVX = 0; player.bubbleVY = 0; }
  const pbx = Math.max(0, boundX - PLAYER_R), pby = Math.max(0, boundY - PLAYER_R);
  player.x = Math.max(-pbx, Math.min(pbx, player.x));
  player.y = Math.max(-pby, Math.min(pby, player.y));
}

function updateWax(dt){
  for(let i = waxSummons.length-1; i >= 0; i--){
    const w = waxSummons[i];
    if(w.dead || w.hp <= 0){ waxSummons.splice(i,1); continue; }
    // 卸下主槽的 Wax 花瓣 → 对应的蜡淡出消失（0.35s 变透明后移除）
    if(w.owner && player.equipped.indexOf(w.owner) < 0 && w.fade == null) w.fade = 1;
    if(w.fade != null){
      w.fade -= dt/0.35;
      if(w.fade <= 0){ waxSummons.splice(i,1); continue; }
      continue;                                   // 淡出期间不再参与碰撞
    }
    if(w.hitFlash > 0) w.hitFlash -= dt;
    if(w.hitCd > 0) w.hitCd -= dt;
    // 硬钳制：蜡的中心永远保持在地图内至少一个半径（六边形整体绝不出界）
    {
      const cpad = w.r;
      const cbx = Math.max(0, boundX - cpad), cby = Math.max(0, boundY - cpad);
      w.x = Math.max(-cbx, Math.min(cbx, w.x));
      w.y = Math.max(-cby, Math.min(cby, w.y));
    }
    // 花朵无时无刻都能推动蜡；蜡不可以被推进墙体/推出边界
    // 蜡推不动时（身后是墙/边界）→ 蜡反过来阻挡花朵，把花顶回分离位置
    const pdx = w.x - player.x, pdy = w.y - player.y, pd = Math.hypot(pdx,pdy)||1;
    const minD = PLAYER_R + waxEffR(w, Math.atan2(pdy, pdx));
    if(pd < minD){
      const push = minD - pd;
      const ux = pdx/pd, uy = pdy/pd;
      const pad = w.r + 4, mbx = Math.max(0, boundX - pad), mby = Math.max(0, boundY - pad);
      const nx = w.x + ux*push, ny = w.y + uy*push;
      const cx2 = Math.max(-mbx, Math.min(mbx, nx)), cy2 = Math.max(-mby, Math.min(mby, ny));
      if(cx2 === nx && cy2 === ny && !blockedAt(cx2, cy2, w.r*0.8)){
        w.x = cx2; w.y = cy2;                        // 目标合法 → 蜡被推动
      } else {
        // 目标进墙/出界 → 先沿墙滑动（分轴尝试），完全推不动 → 蜡阻挡花朵（把花顶回分离位置）
        const t1x = Math.max(-mbx, Math.min(mbx, w.x + ux*push));
        const t2y = Math.max(-mby, Math.min(mby, w.y + uy*push));
        const o1 = Math.abs(t1x - w.x) > 0.01 && !blockedAt(t1x, w.y, w.r*0.8);
        const o2 = Math.abs(t2y - w.y) > 0.01 && !blockedAt(w.x, t2y, w.r*0.8);
        if(o1) w.x = t1x;
        else if(o2) w.y = t2y;
        else {
          const bx2 = w.x - ux*(push+0.5), by2 = w.y - uy*(push+0.5);
          if(!blockedAt(bx2, by2, PLAYER_R*0.8)){ player.x = bx2; player.y = by2; }
        }
      }
      // 最终保证：花朵永远不与蜡重叠（不在蜡上行走）
      {
        const fdx = w.x - player.x, fdy = w.y - player.y, fd = Math.hypot(fdx,fdy)||1;
        const fmin = PLAYER_R + waxEffR(w, Math.atan2(fdy, fdx)) + 0.5;
        if(fd < fmin){
          const fx2 = w.x - fdx/fd*fmin, fy2 = w.y - fdy/fd*fmin;
          if(!blockedAt(fx2, fy2, PLAYER_R*0.8)){ player.x = fx2; player.y = fy2; }
        }
      }
    }
    // 硬校验：蜡不进墙（万一进了就回退上一帧合法位置）
    if(blockedAt(w.x, w.y, w.r*0.8) && w.lx != null){ w.x = w.lx; w.y = w.ly; }
    w.lx = w.x; w.ly = w.y;
    // 蜡推动生物：重叠的生物沿六边形法线方向被推出去（不动的生物 / 蜈蚣身体节除外）
    for(const e of enemies){
      if(e.hp <= 0 || (e.def && e.def.immobile) || e.leaderSeg) continue;
      const dx = e.x - w.x, dy = e.y - w.y, d = Math.hypot(dx,dy)||1;
      const eff = waxEffR(w, Math.atan2(dy, dx)) + e.r*0.8;
      if(d < eff){
        const nx = w.x + dx/d*eff, ny = w.y + dy/d*eff;
        if(!blockedAt(nx, ny, e.r*0.75)){ e.x = nx; e.y = ny; }
      }
    }
    // 生物碰到蜡（六边形碰撞）→ 蜡按生物体伤掉血（0.5s 一跳）
    for(const e of enemies){
      if(e.hp <= 0 || !(e.dmg > 0)) continue;
      const d = Math.hypot(e.x-w.x, e.y-w.y);
      if(d < waxEffR(w, Math.atan2(e.y-w.y, e.x-w.x)) + e.r*0.85 && (w.hitCd||0) <= 0){
        hitWax(w, e.dmg);
        w.hitCd = 0.5;
        break;
      }
    }
  }
}
function hitWax(w, dmg){
  w.hp -= dmg;
  w.hitFlash = 0.15;
  if(w.hp <= 0){ w.dead = true; if(w.owner) w.owner._wax = null; }
}
const WAX_SUMMON_IMG = new Image();
WAX_SUMMON_IMG.src = (typeof assetURL === 'function') ? assetURL('assets/petals_trans/Wax_Summon.png') : 'assets/petals_trans/Wax_Summon.png';
function drawWax(){
  const vs = VIEW;
  for(const w of waxSummons){
    const [sx,sy] = w2s(w.x, w.y);
    const s = w.r*2*vs;
    ctx.save(); ctx.translate(sx,sy);
    if(w.fade != null) ctx.globalAlpha = Math.max(0, Math.min(1, w.fade));
    if(WAX_SUMMON_IMG.complete && WAX_SUMMON_IMG.naturalWidth){
      ctx.drawImage(WAX_SUMMON_IMG, -s/2, -s/2, s, s);
    } else {
      ctx.fillStyle = w.hitFlash>0 ? '#fff' : '#e3c33d';
      ctx.beginPath(); ctx.arc(0,0,w.r*vs,0,6.28); ctx.fill();
    }
    ctx.restore();
  }
}
function hitSummon(s, dmg){
  s.hp -= dmg;
  s.hitFlash = 0.15;
  if(s.hp<=0){ s.dead=true; s.respawn=8; }
}

function rngDeco(){
  // deterministic decorations
  let s = 12345;
  const r=()=>{ s=(s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; };
  decorations = [];
  for(let i=0;i<2600;i++){
    decorations.push({
      x:(r()*2-1)*WORLD, y:(r()*2-1)*WORLD,
      t:r(), c:r()
    });
  }
}
rngDeco();

// ---------- enemy templates ----------
let currentRegion = 0;

function makeEnemy(key, x, y, diff, rarity){
  const m = MOBS[key];
  const hpMult  = MOB_HP_MULT[rarity]  || 1;
  const dmgMult = MOB_DMG_MULT[rarity] || 1;
  // 体型按原作比例（蚂蚁比花朵小一圈，泰坦两倍多），稀有度再放大一点
  const r = mobRadius(key, rarity);
  // 有官方逐档数值表的（Garden 那 12 种）直接用表里的绝对值，不再用倍率推
  const st = (typeof MOB_STATS === 'object' && MOB_STATS) ? MOB_STATS[key] : null;
  const ri = MOB_RARITY.indexOf(rarity);
  let hp, dmg, armor = m.armor || 0, xp;
  if(st && ri >= 0){
    const hv = st.hp[Math.min(ri, st.hp.length-1)];
    hp = Array.isArray(hv) ? (hv[0] + Math.random()*(hv[1]-hv[0])) : hv;
    dmg = st.dmg[Math.min(ri, st.dmg.length-1)];
    armor = st.armor[Math.min(ri, st.armor.length-1)];
    xp = st.xp[Math.min(ri, st.xp.length-1)];
  } else {
    hp = m.hp*hpMult*diff;
    dmg = m.dmg*dmgMult*diff;
    // 每个生物都要有护甲：没有专属护甲的用官方阶梯（1/2/7/22/65/194/583…）
    armor = m.armor || (typeof MOB_ARMOR_LADDER !== 'undefined'
      ? MOB_ARMOR_LADDER[Math.min(ri, MOB_ARMOR_LADDER.length-1)] : 1);
    xp = Math.max(1, Math.round(m.xp*Math.sqrt(hpMult)));
  }
  return {
    key, x, y, name:m.name, sprite:m.sprite, shape:m.shape, mobRarity:rarity, def:m,
    r, hp, maxHp:hp,
    dmg, speed:m.speed,
    xp:Math.max(1, Math.round(xp)),
    drops:m.drops||[], rareDrops:m.rareDrops||[], atkCd:0, wob:Math.random()*6.28, hitFlash:0,
    // ---- 行为 / 动画状态 ----
    ai:m.ai, anim:m.anim, armor,
    age:0, phase:Math.random()*6.28, spawnT:0.32,
    wanderA:Math.random()*6.28, wanderT:0, aggroOn:false,
    shootT:0.8+Math.random()*1.4, zapT:0, chargeT:0, chargeCd:(m.chargeCd||2.5),
    charging:0, dashT:0, dashA:0, burstT:0,
    burrowT:1.5+Math.random()*3, dug:0, regenT:0,
    attach:false, drainT:0, orbitA:Math.random()*6.28,
    shieldMax:m.shield||0, shieldCur:m.shield||0, shieldT:0,
    spawnCd:(m.onTimerSpawn?m.onTimerSpawn.cd:0), released:false,
    undeadT:-1, glowT:0
  };
}

// ============================================================
//  蜈蚣（wiki: Centipede）
//  · 头 + 若干身体节，每一节都是独立生物：自己的 HP / 护甲 / 掉落（按节结算）
//  · 长度只有两种：9 节（常见）和 4 节（少见），不再有 50 节的「巨蜈蚣」
//  · 每一节大小完全相同（同一个半径 + 同一套贴图，头只是多了两根触角）
//  · 头平常随机直线游荡；Rare+ 中立，被打或被灯泡照到才追人
//  · 身体跟着前面那节走；中间某节被打掉时，后面那节立刻变成新头追人
//  · 只对头做「能不能刷在这里」的判定；但整条虫必须落在地图里 ——
//    头贴边时会自动把身体方向掉个头；仍然出界 / 撞墙的那一节直接不刷
// ============================================================
const CENTI_LEN = [4, 4, 9, 9];     // 只出两种：1 头 + 3 身，或 1 头 + 8 身
const CENTI_GAP = 0.66;             // 相邻两节的间距 = 半径和 × 0.66（刚好咬住）
let centiSeq = 0;                   // 每条虫一个 id，分离时同串不互推
function spawnCentipede(x, y, diff, rarity, n){
  const count = Math.max(2, n || (4 + ((Math.random()*6)|0)));   // 4~9 节
  const segs = [];
  const id = ++centiSeq;

  // ---- 头：先收进地图边界内，否则整条虫会露在地图外面 ----
  const head = makeEnemy('centipede', x, y, diff, rarity);
  const R = head.r;
  const pad = 6 + R;
  const bx = Math.max(0, boundX - pad), by = Math.max(0, boundY - pad);
  head.x = Math.max(-bx, Math.min(bx, head.x));
  head.y = Math.max(-by, Math.min(by, head.y));
  head.sprite = 'Centipede_Head';
  head.isHead = true;
  head.segIdx = 0;
  head.leaderSeg = null;
  head.chainId = id;
  head.chainRoot = head;
  head.homeX = head.x; head.homeY = head.y;
  head.aggroR = aggroRadius(head);

  // ---- 身体朝头的「后方」铺一条线 ----
  // 用户要求：整条虫必须一次性完整地刷在同一块地方 —— 只要有一节会出界 / 进墙，
  // 就换个方向；两个方向都不行就这条虫干脆不刷（绝不只刷半个身子，后面再「吸」回来）
  const gap = R * 2 * CENTI_GAP;
  const reach = gap * (count - 1);
  const linePts = (a)=>{
    const out = [];
    for(let i=1;i<count;i++){
      out.push({ x: head.x - Math.cos(a)*gap*i, y: head.y - Math.sin(a)*gap*i });
    }
    return out;
  };
  const okLine = (pts)=> pts.every(q => Math.abs(q.x) <= bx && Math.abs(q.y) <= by && !blockedAt(q.x, q.y, R*0.8));
  let hA = head.wanderA, pts = linePts(hA);
  if(!okLine(pts)){
    const hA2 = hA + Math.PI, pts2 = linePts(hA2);
    if(!okLine(pts2)){                       // 两个方向都放不下 → 不刷
      const hi = enemies.indexOf(head);
      if(hi >= 0){ head.removed = true; enemies.splice(hi,1); }
      return null;
    }
    hA = hA2; pts = pts2;
  }
  head.wanderA = hA;
  head.faceAng = hA;
  head.faceRot = hA - ART_HEAD;
  // 路径起点 = 头 + 「后面该有身体的那条线」，这样身子一出生就排在正确的位置上，
  // 不会先全叠到头上再被拉开（那看起来就像整条虫在「飘」）
  head._path = [{x: head.x, y: head.y}, ...pts.map(q=>({x:q.x, y:q.y}))];

  segs.push(head);
  enemies.push(head);

  for(let i=1;i<count;i++){
    const px = pts[i-1].x, py = pts[i-1].y;
    const seg = makeEnemy('centipede', px, py, diff, rarity);
    seg.r = R;                                 // 每一节大小严格一致
    seg.maxHp = head.maxHp; seg.hp = head.hp;
    seg.spawnT = 0.32 + i*0.02;
    seg.isHead = false;
    seg.sprite = 'Centipede_Body';
    seg.segIdx = i;
    seg.chainId = id;
    seg.leaderSeg = segs[segs.length-1];
    seg.chainRoot = head;            // 所有身子都跟着「头」的轨迹走
    seg.homeX = head.x; seg.homeY = head.y;
    seg.aggroR = aggroRadius(seg);
    seg.wanderA = hA;
    seg.faceAng = hA;
    seg.faceRot = hA - ART_HEAD;
    segs.push(seg);
    enemies.push(seg);
  }
  DBG.centipedes = (DBG.centipedes||0) + 1;
  DBG.segs = (DBG.segs||0) + segs.length;
  return head;
}

// 身体节跟着前一节（保持「间距 = 两节半径和 × 0.66」的链条约束，走起来像蛇）
// 身体节沿着「头的行进轨迹」排开（像贪吃蛇的尾巴）：
// 头部把自己的位置记进一条路径，后面每一节按弧长 = segIdx × 间距 取点。
// 这样无论头怎么拐弯、跑多快，整条虫永远是连在一起的，也不会出现身体瞬移。
// 掉了一节之后重排：把整条链重新编号并全部绑到当前的头
function renumberChain(head){
  if(!head) return;
  let k = 1, cur = enemies.find(o => o.leaderSeg === head);
  const seen = new Set();
  while(cur && !seen.has(cur) && k < 64){
    seen.add(cur);
    cur.segIdx = k++;
    cur.chainRoot = head;
    cur = enemies.find(o => o.leaderSeg === cur);
  }
}
function centiPathPush(root){
  if(!root._path) root._path = [{x:root.x, y:root.y}];
  const p0 = root._path[0];
  if(Math.hypot(root.x-p0.x, root.y-p0.y) >= 0.5){
    root._path.unshift({x:root.x, y:root.y});
    if(root._path.length > 300) root._path.length = 300;
  }
}
function chainFollow(e, dt){
  const root = (e.chainRoot && e.chainRoot.hp > 0) ? e.chainRoot : null;
  const L = e.leaderSeg;
  if(!root){
    if(!L || L.hp <= 0){
      // 头没了、上面也接不上：自己当新的头（不然场上会剩一个孤零零的身子）
      e.leaderSeg = null; e.isHead = true; e.sprite = 'Centipede_Head';
      e.segIdx = 0; e.chainRoot = e; e._path = [{x:e.x, y:e.y}];
      e.aggroOn = true; e.aggroR = aggroRadius(e);
      return;
    }
    // 还没绑定到「头」：退回上一节的简单跟随（刚被切成两段的那一瞬）
    const dx = L.x - e.x, dy = L.y - e.y, d = Math.hypot(dx,dy) || 1;
    const want = (L.r + e.r) * CENTI_GAP;
    const step = Math.min(Math.abs(d-want), 260*dt);
    if(d > want){ e.x += dx/d*step; e.y += dy/d*step; }
    if(d > 3) e.faceAng = Math.atan2(dy, dx);
    return;
  }
  if(root === e) return;
  centiPathPush(root);
  const gap  = (e.r * 2) * CENTI_GAP;
  const need = Math.max(0, (e.segIdx || 1)) * gap;
  const path = root._path;
  let acc = 0, fx = root.x, fy = root.y, found = false;
  for(let k=1;k<path.length;k++){
    const a = path[k-1], b = path[k];
    const seg = Math.hypot(b.x-a.x, b.y-a.y) || 1;
    if(acc + seg >= need){
      const t = (need - acc) / seg;
      fx = a.x + (b.x-a.x)*t; fy = a.y + (b.y-a.y)*t;
      found = true; break;
    }
    acc += seg; fx = b.x; fy = b.y;
  }
  if(!found){
    // 轨迹还不够长（刚出生 / 刚掉头）：顺着头身后方的方向往外延，保住节间距
    const n = path.length;
    const a = path[n-1];
    let ux = -Math.cos(root.faceAng || 0), uy = -Math.sin(root.faceAng || 0);
    if(n >= 2){
      const b = path[n-2];
      const l = Math.hypot(a.x-b.x, a.y-b.y);
      if(l > 0.01){ ux = (a.x-b.x)/l; uy = (a.y-b.y)/l; }
    }
    const rest = need - acc;
    fx = a.x + ux*rest; fy = a.y + uy*rest;
  }
  const dx = fx - e.x, dy = fy - e.y;
  const d = Math.hypot(dx, dy);
  // 贴紧轨迹点：近距离直接对齐，远距离快速逼近 —— 不给「漂移」留空间
  if(d > e.r*2){ e.x = fx; e.y = fy; }
  else if(d > 0.02){
    const k = Math.min(1, dt * 25 + 0.4);
    const nx2 = e.x + dx * k, ny2 = e.y + dy * k;
    if(!blockedAt(nx2, e.y, e.r*0.75)) e.x = nx2;
    if(!blockedAt(e.x, ny2, e.r*0.75)) e.y = ny2;
    if(d > 1.5) e.faceAng = Math.atan2(dy, dx);
  } else { e.x = fx; e.y = fy; }
  e.kbx = 0; e.kby = 0;                 // 链上位置由轨迹决定，击退不作用于身体节
}

// ============================================================
//  刷怪（wiki: Mob spawner）
//  原作不是「在玩家视野外找空地」，而是地图上划成一片片刷怪区，各自计时：
//    · difficulty 决定刷出来的稀有度；Luck 以 log1.3(1+Σluck) 叠加到难度上
//    · density 决定同一时间这片区域最多能同时存在几只（density 0 = 1 只，死了才补）
//    · 刷怪点在区域内随机取；如果会和花 / 花瓣 / 其他怪的碰撞体重叠就重抽
//      （所以不会贴脸刷在身上，但刷在屏幕里是完全正常的）
//    · 和玩家距不距离开屏幕无关
// ============================================================
// ---------- 稀有度分区（wiki：刷怪点的 difficulty 决定稀有度） ----------
// 地图从中心到边缘切成 Common → Ultra 七个带，每个刷怪区属于其中一带，
// 刷出来的怪以本带的稀有度为绝对主力，只有小概率高一档 / 低一档。
const ZONE_TIERS = ['Common','Unusual','Rare','Epic','Legendary','Mythic','Ultra'];
// 查「世界坐标 → 稀有度分区」：优先用分区图（zones.js），没有就返回 null
function zoneTierAt(x, y){
  const reg = REGIONS[currentRegion];
  const g = reg && (typeof ZONE_GRID_DATA === 'object') && ZONE_GRID_DATA[reg.id];
  if(!g || !(boundX > 0) || !(boundY > 0)) return null;
  const nx = (x + boundX) / (boundX * 2);
  const ny = (y + boundY) / (boundY * 2);
  if(nx < 0 || ny < 0 || nx >= 1 || ny >= 1) return null;
  const i = Math.min(g.n-1, (nx*g.n)|0), j = Math.min(g.n-1, (ny*g.n)|0);
  const ch = g.rows[j][i];
  if(ch === '.' || ch == null) return null;
  return ZONE_TIERS[+ch] || null;
}
function zoneTierOf(regionId, dn, deep){
  // 区域基础难度整体平移：Garden 从 Common 起，Hel/Pyramid 从 Rare 起
  const shift = Math.min(3, Math.floor((REGION_DIFF[regionId] || 0) / 13));
  let i = Math.floor(dn * (ZONE_TIERS.length - 1) + 1e-6) + shift;
  if(deep) i += 1;
  return ZONE_TIERS[Math.max(0, Math.min(ZONE_TIERS.length - 1, i))];
}
function rollZoneRarity(tier, tiers){
  const list = (tiers && tiers.length ? tiers : FULL_TIERS);
  const i = Math.max(0, ZONE_TIERS.indexOf(tier));
  const w = [[i,0.58],[i-1,0.20],[i+1,0.15],[i-2,0.045],[i+2,0.025]];
  let total = 0; const out = [];
  for(const [k,p] of w){
    if(k < 0 || k >= ZONE_TIERS.length) continue;
    const r = ZONE_TIERS[k];
    if(list.indexOf(r) < 0) continue;        // 这种怪刷不出这一档就跳过
    out.push([r,p]); total += p;
  }
  if(!out.length) return list[0] || 'Common';
  let x = Math.random()*total;
  for(const [r,p] of out){ x -= p; if(x <= 0) return r; }
  return out[out.length-1][0];
}

const SPAWN_CELL_TILES = 5;        // 一个刷怪区 = 5×5 格
let spawners = [], spawnersFor = '';

function buildSpawners(){
  const reg = REGIONS[currentRegion];
  const key = (reg && reg.id || '') + '|' + Math.round(boundX) + 'x' + Math.round(boundY);
  if(spawnersFor === key && spawners.length) return;
  spawnersFor = key; spawners = [];
  if(!(boundX > 0) || !(boundY > 0)) return;
  const cell = TILE * SPAWN_CELL_TILES;
  const nx = Math.max(1, Math.round((boundX*2)/cell));
  const ny = Math.max(1, Math.round((boundY*2)/cell));
  const w = (boundX*2)/nx, h = (boundY*2)/ny;
  const diag = Math.hypot(boundX, boundY) || 1;
  for(let j=0;j<ny;j++){
    for(let i=0;i<nx;i++){
      const x0 = -boundX + w*i, y0 = -boundY + h*j;
      const cx = x0 + w/2, cy = y0 + h/2;
      const dn = Math.min(1, Math.hypot(cx,cy)/diag);   // 0 = 地图中心，1 = 最外圈
      const deep = Math.random() < (0.10 + dn*0.55);
      spawners.push({
        x0, y0, x1: x0+w, y1: y0+h,
        dn, deep,                                        // 越外圈越深（深处的怪更高级）
        // 分带要连成片：用低频起伏把 dn 微微推一下，避免棋盘格
        // 这片刷怪区属于哪个稀有度带：优先查分区图（zones.js），没覆盖到才退回按距离分带
        tier: zoneTierAt(cx, cy) || zoneTierOf(reg && reg.id,
                Math.max(0, Math.min(1, dn + Math.sin(cx*0.00042)*0.10 + Math.cos(cy*0.00037)*0.10)),
                false),
        cap : 2 + (Math.random()*2|0) + (dn > 0.72 ? 1 : 0),   // density（每片刷怪区同时存在的上限）
        t   : Math.random()*1.4
      });
    }
  }
  DBG.spawners = spawners.length;
}

function spawnWave(dt){
  const region = REGIONS[currentRegion];
  if(!region) return;
  buildSpawners();
  if(!spawners.length) return;
  dt = (dt > 0 && dt < 0.25) ? dt : 0.016;
  const NEAR = 1900;               // 只跑玩家附近的刷怪区（远处的怪本来就会被回收）
  const diff = 1 + player.level*0.07;
  for(const sp of spawners){
    sp.t -= dt;
    if(sp.t > 0) continue;
    sp.t = 0.75 + Math.random()*1.3;
    const cx = (sp.x0+sp.x1)/2, cy = (sp.y0+sp.y1)/2;
    if(Math.hypot(cx-player.x, cy-player.y) > NEAR) continue;
    if(enemies.length > 130) continue;
    // 这片区域里已经有几只？density 就是上限
    let have = 0;
    for(const e of enemies) if(e.x>=sp.x0 && e.x<sp.x1 && e.y>=sp.y0 && e.y<sp.y1) have++;
    if(have >= sp.cap) continue;
    // 区域内随机取点，重叠就重抽
    let spot = null;
    for(let k=0;k<14;k++){
      const x = sp.x0 + Math.random()*(sp.x1-sp.x0);
      const y = sp.y0 + Math.random()*(sp.y1-sp.y0);
      if(!isFreeMainAt(x,y) || blockedAt(x,y,12)) continue;
      if(Math.hypot(x-player.x, y-player.y) < PLAYER_R + 30) continue;
      let bad = false;
      for(const e of enemies){ if(Math.hypot(x-e.x, y-e.y) < e.r + 16){ bad = true; break; } }
      if(bad) continue;
      spot = {x, y}; break;
    }
    if(!spot) continue;
    let key = rollMobKey(region);
    // wiki：刷怪点会被 Ghost / Square / Magic Firefly / Shiny Ladybug 替换
    for(const r of SPAWN_REPLACE){
      if(!MOBS[r.key]) continue;
      if(r.regions && r.regions.indexOf(region.id) < 0) continue;
      if(Math.random() < r.p){ key = r.key; DBG.replaced = (DBG.replaced||0)+1; break; }
    }
    // wiki：刷怪点的 difficulty 决定稀有度 —— 这里用「稀有度分区」实现：
    // 每片刷怪区属于 Common/Unusual/.../Ultra 某一带，出来的怪以本带为主
    let rarity = rollZoneRarity(sp.tier, MOBS[key].tiers || FULL_TIERS);
    // 自然生成 Super：只有 Ultra 分区、且冷却结束，才有极小概率替换一只
    // Ultra 区才有概率刷 Super；刷出来后「这只怪」进 20 分钟刷新冷却
    if(rarity === 'Ultra' && superCd <= 0 && (superCdByMob[key] || 0) <= 0 && Math.random() < SUPER_RATE){
      rarity = 'Super';
      superCd = SUPER_CD;                     // 全局兜底冷却
      superCdByMob[key] = SUPER_CD;           // 这一种怪自己的冷却
      DBG.supers = (DBG.supers||0) + 1;
      DBG.lastSuper = key;
      chatPrint('A Super ' + MOBS[key].name + ' Has Spawned!', 'ok');
    }
    // 灌木丛（密道）里不刷怪
    if(inBushAt(spot.x, spot.y)) continue;
    // 选好怪之后按「它的体型」再验一次落点：大怪不能卡在墙里/半截埋进墙
    {
      const mr = (MOBS[key].size || 20) * FLOWER_SCALE * 0.9;
      if(mr > 12 && (blockedAt(spot.x, spot.y, mr) || !isFreeMainAt(spot.x, spot.y))) continue;
    }
    if(MOBS[key].chain){
      // 蜈蚣：长度由 spawnCentipede 自己决定（只会是 9 节或 4 节）
      spawnCentipede(spot.x, spot.y, diff, rarity);
      continue;
    }
    const e = makeEnemy(key, spot.x, spot.y, diff, rarity);
    e.homeX = spot.x; e.homeY = spot.y;
    e.aggroR = aggroRadius(e);
    enemies.push(e);
  }
}

// 索敌半径：wiki 里每种怪的 aggression radius（格）→ px
// 索敌半径
// wiki（中文维基 Mobs 数据表 · Movement/Speed 列）：
//   「深橙色：在一定范围内敌对。注意，敌对范围随生物存在时间的增长而增长。」
// 也就是同一只怪活得越久，索敌圈越大（原作里待久了的怪更难绕开）。
// 这里按存活时间线性放大，180s 长满，最多 ×2。
const AGGRO_GROW_T = 180;
function aggroRadius(e){
  // 花朵钻进灌木丛密道时，所有怪物都失去目标（索敌半径归零）
  if(player && player.inBush) return 0;
  const base = (typeof mobAggroRadius === 'function')
    ? mobAggroRadius(e.key, e.def)
    : ((e.def && e.def.aggro) || 340);
  const grow = 1 + Math.min(1, (e.age || 0) / AGGRO_GROW_T);
  return base * grow;
}

// ---------- petal recompute ----------
function recompute(){
  const prevMaxHp = player.maxHp || 0;   // 记住旧最大生命，装卸 Soil 等花瓣时按百分比平移当前血量
  const prevHp = player.hp || 0;
  // 血量 / 体伤：1 级初始值 × 等级成长 × 天赋倍率（花瓣的 flat 加成在下面循环里加）
  const statK = playerStatScale();
  let maxHp=BASE_HP*statK*player.healthMult, regen=0, speedMult=1, magnetR=70, orbitBonus=0, spinBonus=0, dmgMult=1, xpMult=1, ankh=0, attractR=0;
  let fasterSpin=0;
  let thorn=0, pooR=0, revive=0;
  let bodyDmg=BASE_BODY_DMG*statK;
  // ---- 花瓣独特机制的被动部分 ----
  let flowerArea=0, fovPetal=0, luckP=0, cogStep=0, overhealR=0, hpMult=1, reloadMultPetals=1,
      reflectR=0, zapEvery=0, zapDmg=0, soloBonus=0, undeadT=0;
  for(const p of player.equipped){
    if(!p) continue;
    const d=p.def;
    if(d.hp) maxHp += d.hp;
    if(d.bodyDmg) bodyDmg += d.bodyDmg;    // Cutter 之类：直接加花朵体伤
    if(d.regen) regen += d.regen;          // 回血花瓣的持续回复（已在 buildPetal 里乘过医疗倍率）
    if(d.speed) speedMult += d.speed;
    if(d.magnet) magnetR += d.magnet;
    // Lentil：花瓣吸附敌人的范围（不是掉落物）。wiki 的 +8 是游戏单位，换算成像素
    if(d.attract) attractR += d.attract * ATTRACT_PX_PER_UNIT;
    if(d.range) orbitBonus += d.range;
    if(d.spin) spinBonus += d.spin;
    if(d.rotSpeed) fasterSpin += d.rotSpeed;   // Faster：花瓣转速 +rad/s（官方卡面，不参与 0.5~3 夹取）
    if(d.dmgMult) dmgMult += d.dmgMult;
    if(d.xpMult) xpMult += d.xpMult;
    if(d.thorn) thorn += d.thorn;
    if(d.poo) pooR = Math.max(pooR, d.poo);
    if(d.revive) revive += d.revive;
    if(d.cat==='shield'){ p.shieldMax=d.shield*player.petalHealthMult; if(p.shieldCur==null) p.shieldCur=p.shieldMax; }
    if(d.cat==='ankh') ankh += 1;
    // Air：花身面积 +8/级（纯占位花瓣，只让花变大）
    if(d.flowerArea) flowerArea += d.flowerArea;
    // Soil：按官方卡面 —— 花朵最大生命 +Flower Health，移速 ×0.9，花身大小 +10 半径（走 Air 同款缓动视觉）
    if(d.reloadCut) reloadMultPetals *= (1 - d.reloadCut);   // Golden Leaf：每片乘法叠加（官方算法）
    if(d.flowerHealth) maxHp += d.flowerHealth;
    if(d.flowerRadius){
      flowerArea += d.flowerRadius * 9.4;    // +10 半径 ≈ Air 面积换算（PLAYER_BODY=34）
      speedMult *= 0.9;
    }
    // Antennae：视野 +%，wiki 明确写「不叠加」，取最高
    if(d.fov) fovPetal = Math.max(fovPetal, d.fov);
    if(d.luck) luckP += d.luck;
    if(d.ab === 'cog' && d.abCfg) cogStep = d.abCfg.step;
    if(d.overheal) overhealR += d.overheal;
    if(d.ab === 'maxhp' && d.abCfg) hpMult *= (1 + d.abCfg.val);     // Cactus +20% 最大生命
    if(d.ab === 'reflect' && d.abCfg) reflectR = Math.max(reflectR, d.abCfg.val);
    if(d.ab === 'solo' && d.abCfg) soloBonus = d.abCfg.val;
    if(d.ab === 'undead' && d.abCfg) undeadT = Math.max(undeadT, d.undead||d.abCfg.val);
    if(d.ab === 'zap' && d.abCfg){
      zapEvery = d.abCfg.every;
      zapDmg = Math.max(zapDmg, 50 * (RARITY_MULT[p.rarity] || 1));   // 威力 = 同稀有度 Lightning
    }
  }
  maxHp *= hpMult;
  magnetR += player.talentMagnet;
  // Golden Leaf：装载冷却 = 天赋基础 × Π(1 - 每片减免)（乘法叠加，非加法）
  player.reloadMult = (player.reloadTalent || 1) * reloadMultPetals;
  player.maxHp=maxHp; player.regen=regen; player.speedMult=speedMult;
  // 装卸改变最大生命的花瓣时，当前血量按百分比平移（例：60/100 → 装上 Soil 后 = 新上限的 60%）
  if(prevMaxHp > 0 && prevHp > 0 && state === STATE.PLAY){
    player.hp = Math.min(player.maxHp, prevHp * (maxHp / prevMaxHp));
  }
  player.flowerArea=flowerArea; player.fovPetal=fovPetal; player.cogStep=cogStep;
  player.overhealR=overhealR; player.reflectR=reflectR; player.zapEvery=zapEvery; player.zapDmg=zapDmg;
  player.soloBonus=soloBonus; player.undeadT=undeadT;
  player.magnetR=magnetR; player.orbitBonus=orbitBonus; player.spinBonus=spinBonus;
  player.fasterSpin=fasterSpin;
  player.attractR=attractR;
  player.dmgMult=dmgMult; player.xpMult=xpMult; player.ankh=ankh;
  player.thorn=thorn; player.pooR=pooR; player.revive=revive;
  // 体伤：基础值 × 等级成长 × Sharp Edges 天赋倍率
  player.bodyDmg = bodyDmg * player.bodyDmgMult;
  // Clover：幸运（掉落率 / 稀有度上浮）
  player.luck = (player.baseLuck||0) + luckP + (player.talentLuck||0);
  if(player.hp>maxHp) player.hp=maxHp;
  applyView();
}

// 视野缩放：天赋（visionMult）× Antennae 花瓣（fovPetal）
// 视野：基础视野 × 滚轮缩放 ÷ 视野天赋（Antennae 等会拉远）
// 缩放范围：userZoom ∈ [ZOOM_MIN, ZOOM_MAX]
// ZOOM_MIN = 1 —— 基础视野（一屏宽 ≈ VIEW_WORLD_W 世界单位）就是「能拉到的最远视野」，
// 滚轮拉远不会超出参考图那个视野；继续拉远只能靠视野天赋（visionMult）/ Antennae（fovPetal）。
const ZOOM_MIN = 1, ZOOM_MAX = 2.2;
function applyView(){
  const f = 1 + (player.fovPetal||0);
  const uz = player.userZoom || 1;
  VIEW = viewBase() * (player.debugZoom || 1) * uz / ((player.visionMult||1) * f);
}
// 鼠标停在 Inventory / Craft 界面上时，滚轮用来「上下滚界面」，
// 这时候优先级高于改视野（不再缩放画面）。找到鼠标底下真正能滚的那个容器。
function wheelScrollHost(e){
  const t = e.target;
  const panel = (t && t.closest) ? t.closest('#inventory, #craft') : null;
  if(!panel) return null;
  let n = t;
  while(n && n.nodeType === 1 && n !== document.body){
    try{
      if(n.scrollHeight > n.clientHeight + 1){
        const ov = getComputedStyle(n).overflowY;
        if(ov === 'auto' || ov === 'scroll') return n;
      }
    }catch(_){}
    n = n.parentNode;
  }
  return panel.querySelector('#ivscroll, #craftlist');
}
// 面板平滑滚动：滚轮只更新目标值，每帧向目标缓动（丝滑，不再一格一格跳）
const panelScroll = { host:null, target:0 };
function stepPanelScroll(dt){
  const h = panelScroll.host;
  if(!h) return;
  if(!document.contains(h)){ panelScroll.host = null; return; }
  const max = h.scrollHeight - h.clientHeight;
  const t = Math.max(0, Math.min(max, panelScroll.target));
  const d = t - h.scrollTop;
  if(Math.abs(d) < 0.5){ h.scrollTop = t; return; }
  h.scrollTop += d * Math.min(1, dt*14);
}
window.addEventListener('wheel', (e)=>{
  const host = wheelScrollHost(e);
  if(host){
    e.preventDefault();
    const dy = (e.deltaMode === 1) ? e.deltaY * 16 : e.deltaY;   // 行模式换算成像素
    if(panelScroll.host !== host){ panelScroll.host = host; panelScroll.target = host.scrollTop; }
    const max = host.scrollHeight - host.clientHeight;
    panelScroll.target = Math.max(0, Math.min(max, panelScroll.target + dy));
    return;                       // 面板里滚界面 —— 不再改视野
  }
  if(state !== STATE.PLAY || anyPanelOpen()) return;   // 面板打开时禁止视角缩放
  e.preventDefault();
  const k = (e.deltaY > 0) ? 1/1.12 : 1.12;      // 滚轮上 = 放大
  player.zoomTarget = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (player.zoomTarget || player.userZoom || 1) * k));
}, { passive:false });
// 每帧把当前视野缓动到目标值（缩放动画才顺滑，而不是一格一格跳）
function stepZoom(dt){
  if(anyPanelOpen()) return false;   // 面板打开时视野冻结，不再缓动
  const t = player.zoomTarget || 1;
  const cur = player.userZoom || 1;
  if(Math.abs(t - cur) < 0.0005){ return false; }
  player.userZoom = cur + (t - cur) * Math.min(1, dt * 9);
  applyView();
  return true;
}

function totalShield(){
  let s=0; for(const p of player.equipped){ if(p&&p.def.cat==='shield') s+=p.shieldCur; } return s;
}

// 花瓣耐久见底：碎掉，进入冷却，冷却结束再长回来
function breakPetal(p, cd){
  p.dur = 0;
  p.broken = Math.max(0.6, cd || 1.5);
  p._reloadTotal = p.broken;                     // 本次实际装填时长（冷却动画用）
  // 消失动画：花瓣在原地放大、淡出，再冒一圈光环（打怪碎掉 / 耐久耗尽都走这里）
  petalVanish.push({
    name: p.name, rarity: p.rarity,
    x: (p._x != null ? p._x : player.x),
    y: (p._y != null ? p._y : player.y),
    ang: (p._ang || 0), t: 0, life: 0.34
  });
  if(petalVanish.length > 40) petalVanish.shift();
  puffs.push({x:p._x||player.x, y:p._y||player.y, t:0, life:0.3, r:18, col:'#ffffff'});
}

// 治疗（回血花瓣 / 吸血）：返回实际回复量，并在花朵头上飘绿字
function healPlayer(amount){
  if(!(amount > 0)) return 0;
  // Amulet：满血之后多余的治疗，按 5%×稀有度 转成护盾（wiki：将多余回血转为护盾）
  if(player.hp >= player.maxHp - 0.01 && player.overhealR > 0){
    const amu = player.equipped.find(q=>q && q.def && q.def.overheal);
    if(amu){
      if(amu.shieldCur == null) amu.shieldCur = 0;
      const add = amount * player.overhealR;
      amu.shieldCur += add;
      amu.maxShieldSeen = Math.max(amu.maxShieldSeen || 0, amu.shieldCur);
      addText(player.x, player.y - PLAYER_R*2.2, '+' + Math.round(add) + ' shield', '#9fe8ff', 12, 0.7);
      return 0;
    }
  }
  if(player.hp >= player.maxHp) return 0;
  const before = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + amount);
  const got = player.hp - before;
  if(got >= 0.5){
    DBG.heals = (DBG.heals||0) + got;
    addText(player.x + (Math.random()-0.5)*12, player.y - PLAYER_R*2.0,
            '+' + (got >= 10 ? Math.round(got) : got.toFixed(1)), '#8ce99a', 13, 0.85);
  }
  return got;
}

// 花瓣命中后的特殊效果（毒 / 减速 / 虚弱 / 击退 / 挑衅 / 吸血）
function petalOnHit(d, e, dealt){
  if(!e) return;
  if(d.poison) e.poison = {dps:d.poison, time:2.4};
  // Pollen：打中后脱落在原地，留在地上 10 秒持续伤害（wiki：地面花粉）
  if(d.name === 'Pollen') dropPollen(e.x, e.y, d.dmg);
  if(d.slow){
    e.slowMul = Math.min(e.slowMul || 1, Math.max(0.15, 1 - d.slow));
    e.slowT = 1.8;
  }
  if(d.weaken) e.weakenT = 2.4;
  if(d.knock && e.ai !== 'spawner'){
    const a = Math.atan2(e.y-player.y, e.x-player.x);
    knockMob(e, a, d.knock);                 // 击退改成滑行，不再瞬移
  }
  if(d.provoke && !e.aggroOn) e.aggroOn = true;   // 灯泡 / 蜂蜜：命中即拉仇恨
  if(d.leech && dealt > 0) healPlayer(dealt * d.leech);
}

// 花瓣撞生物一起磨损：耐久归零就碎
// 原件：花瓣的耐久就是它的 HP，撞上生物时扣的是「那只生物的身体伤害」。
// 之前这里是「一次最多扣 45% 耐久」，等于不管撞到什么都是 3 下碎，
// 血量厚的花瓣（Rock 30、Heavy 60）和 1 血的 Stinger 完全没区别，手感很怪。
// 现在改成直接按生物伤害扣：脆的一下就碎，硬抗的能扛很多下。
function wearPetal(p, e, k){
  if(!(p.maxDur > 0) || !e) return;
  let body = Math.max(1, e.dmg || 1) * (k == null ? 1 : k);
  // Bone：游戏里唯一带 Armor 的花瓣，护甲减免自身受到的耐久伤害，且每次受击后减半
  if(p.def.ab === 'armor'){
    if(p.armorCur == null) p.armorCur = p.def.armor || 0;
    body = Math.max(1, body - p.armorCur);
    p.armorCur *= 0.5;
  }
  // Poker Chip：命中时有很高概率完全不掉耐久
  if(p.def.ab === 'chip' && Math.random() < ((p.def.abCfg && p.def.abCfg.val) || 0.45)) return;
  const wear = Math.min(p.maxDur, body);
  p.dur -= wear;
  p.hitT = 1.5;                                   // 1.5s 内不再回耐久
  p.flashT = 0.11;                                // 受击闪红
  if(p.dur <= 0){
    breakPetal(p, ((p.def.reload || 800)/1000)*player.reloadMult);
    DBG.broke = (DBG.broke||0) + 1;
  }
}

// ---------- equip / unequip ----------
// 基础槽位 6 个：开局 5 片 Common Basic 占 0..4，第 6 格给 Common Rose（用户要求）
const BASE_SLOTS = 5;
function maxSlots(){ return Math.min(BASE_SLOTS + player.slotBonus, 10); }
let selectedSlot = -1;
// 主/副槽「互换」时不要播 cardPop（旋转+缩放+淡入），只播滑动动画
let slotSwapAnim = false;

// 主/副槽切换：换过来的花瓣冷却全部重置（原作机制 —— 所以「换手」能立刻再打一轮）
function resetPetalCooldown(p){
  if(!p) return;
  p.cd = 0;                                   // 近战的接触间隔 / 远程的装填冷却
  p._fireCd = 0; p._out = 0;                  // Peas：四颗豌豆立刻回到轨道
  p._flyT = 0;                                // 回血花瓣：取消飞行状态
  p.hitT = 0; p.flashT = 0;
  p._travel = 0;                              // Clay：累计移动距离清零
}

// R：整套主槽 / 副槽互换
function swapAllSlots(){
  const slots = maxSlots();
  while(player.equipped.length < slots) player.equipped.push(null);
  while(player.alt.length < slots) player.alt.push(null);
  for(let i=0;i<slots;i++){
    const a = player.equipped[i] || null;
    player.equipped[i] = player.alt[i] || null;
    player.alt[i] = a;
    // 双向冷却（与数字键换槽一致）
    const both = [player.equipped[i], player.alt[i]];
    for(const q of both){
      if(!q) continue;
      q._wax = null;
      q.broken = ((q.def && (q.def.reload || q.def.cat === 'wax') ? (q.def.reload || 30000) : 800)/1000) * (player.reloadMult||1);
      q._reloadTotal = q.broken;
      if(q.maxDur > 0) q.dur = q.maxDur;
    }
  }
  recompute();
  slotSwapAnim = true;                           // 这一次重绘不播 cardPop
  renderInventory(()=>{
    // 双 rAF：新格子绘制完成后再启动，整排主/副槽互相滑动
    requestAnimationFrame(()=>{
      for(let i=0;i<slots;i++) if(player.equipped[i] || player.alt[i]) animateSlotSwap(i);
    });
    slotSwapAnim = false;
  });
  toast('Swapped main / alt slots', 'good');
}

// 主槽 <-> 副槽 互换（数字键 1..9/0）
function swapSlotWithAlt(i){
  if(i < 0) return;
  const slots = maxSlots();
  if(i >= slots) return;
  while(player.equipped.length < slots) player.equipped.push(null);
  while(player.alt.length < slots) player.alt.push(null);
  const a = player.equipped[i] || null;
  const b = player.alt[i] || null;
  // 离开轨道的那片：消失动画（放大 + 淡出 + 光环）
  if(a && a._x != null) petalVanish.push({name:a.name, rarity:a.rarity, x:a._x, y:a._y, ang:a._ang||0, t:0, life:0.34});
  player.equipped[i] = b;
  player.alt[i] = a;
  // 主副槽切换（双向）：进主槽和进副槽的花瓣都陷入装填冷却
  const both = [player.equipped[i], player.alt[i]];
  for(const q of both){
    if(!q) continue;
    q._wax = null;
    q.broken = ((q.def && (q.def.reload || q.def.cat === 'wax') ? (q.def.reload || 30000) : 800)/1000) * (player.reloadMult||1);
    q._reloadTotal = q.broken;
    if(q.maxDur > 0) q.dur = q.maxDur;
  }
  selectedSlot = -1;
  recompute();
  slotSwapAnim = true;          // 保持 true：重建时不播 pop
  renderInventory(()=>{
    // 双 rAF：确保重建后的新格子已经绘制，再启动滑动动画（稳可见）
    requestAnimationFrame(()=> animateSlotSwap(i));
    slotSwapAnim = false;
  });
}

// 主槽 <-> 副槽 互换的动画：纯粹的「滑动」。
//   主槽那张从副槽的位置滑回主槽，副槽那张从主槽的位置滑到副槽，
//   两张同时上路、同一条缓动 —— 看起来就是两块卡片互相滑过去。
function animateSlotSwap(i){
  try{
    if(typeof invEquip === 'undefined' || !invEquip) return;
    const mc = invEquip.children[i];
    const ac = (typeof elAlt !== 'undefined' && elAlt) ? elAlt.children[i] : null;
    if(!mc || !ac || !mc.animate || !ac.animate) return;
    const r1 = mc.getBoundingClientRect(), r2 = ac.getBoundingClientRect();
    if(!r1.width || !r2.width) return;
    // 主槽 -> 副槽 的位移 / 缩放差
    const dx = r2.left - r1.left, dy = r2.top - r1.top;
    const s1 = r2.width / r1.width, s2 = r1.width / r2.width;
    const opt = { duration:340, easing:'cubic-bezier(.33,.72,.24,1)' };   // 丝滑：慢起步、稳减速
    // 已经换过来了，所以让它「从对面的位置滑回自己这边」
    mc.animate([
      { transform:'translate(' + dx + 'px,' + dy + 'px) scale(' + s1 + ')' },
      { transform:'translate(0px,0px) scale(1)' }
    ], opt);
    ac.animate([
      { transform:'translate(' + (-dx) + 'px,' + (-dy) + 'px) scale(' + s2 + ')' },
      { transform:'translate(0px,0px) scale(1)' }
    ], opt);
  }catch(e){}
}

// 生成一个装备槽里的花瓣实例：带耐久（dur / maxDur），耐久归零会碎掉进入冷却
// 泡泡破裂：防御状态下第一冷却结束(仅首次) -> 推进 -> 第二冷却 -> 立即再爆
function stepBubblePetal(p, dt){
  if(!p || !p.def || p.def.cat !== 'melee' || p.name !== 'Bubble') return;
  const defOk = player.defenseMode || player.faceState === 'defense' || (player.tuck||0) > 0.15
        || ((mouse.right || keys['shift']) && !(mouse.down || keys[' ']));
  if(!defOk || p.broken > 0) return;
  if(!p._bReady){
    // 兜底：不要求 cd<=0（旧存档里 rdy=0 + cd=0.01 会互相卡死）
    if(p.cd > 0) p.cd = 0;
    p.cd = p._firstDone ? 0 : (p.def.bubbleCd1 || 2);   // 第一冷却只首次，之后直接爆
    p._firstDone = true;
    p._bReady = true;
  }
  if(p._bReady && p.cd > 0) p.cd -= dt;
  if(p._bReady && p.cd <= 0){
    const ang = (p._x != null) ? Math.atan2(p._y - player.y, p._x - player.x) : player.petalAngle;
    const ri = Math.max(0, RARITIES.indexOf(p.rarity));
    const push = BUBBLE_PUSH_BASE + BUBBLE_PUSH_STEP * ri;
    player.bubbleVX = (player.bubbleVX||0) + Math.cos(ang)*push;
    player.bubbleVY = (player.bubbleVY||0) + Math.sin(ang)*push;
    puffs.push({x:(p._x!=null?p._x:player.x), y:(p._y!=null?p._y:player.y), t:0, life:0.3, r:26, col:'#bfe8ff'});
    puffs.push({x:player.x, y:player.y, t:0, life:0.35, r:PLAYER_R*2.4, col:'#d8f4ff'});   // 花朵位置的光圈：冲刺可见
    p.broken = p.def.bubbleCd2 || 0.7;
    p._reloadTotal = p.broken;
    p._bReady = false;
  }
}

function makePetalInst(name, rarity){
  const def = buildPetal(name, rarity);
  const dur = def.dur || 0;
  return {name, rarity, def, cd:0, shieldCur:null,
          dur, maxDur: dur, broken:0, hitT:0    // broken > 0 = 碎掉的剩余秒数
         };
}

function equipFromBackpack(idx){
  const item = player.backpack[idx];
  if(!item) return;
  const slots = maxSlots();
  if(selectedSlot>=0 && selectedSlot<player.equipped.length){
    // swap
    const old = player.equipped[selectedSlot];
    player.equipped[selectedSlot] = makePetalInst(item.name, item.rarity);
    if(old){ player.backpack[idx] = {name:old.name, rarity:old.rarity}; }
    else player.backpack.splice(idx,1);
  } else {
    // 主槽有空 -> 主槽；主槽满了但副槽有空 -> 副槽（自动填空槽）
    if(equipIntoEmptySlot(item.name, item.rarity)){
      recompute();
      player.backpack.splice(idx,1);
    } else if(player.equipped.length<slots){
      player.equipped.push(makePetalInst(item.name, item.rarity));
      player.backpack.splice(idx,1);
    } else {
      // replace slot 0
      const old=player.equipped[0];
      player.equipped[0]=makePetalInst(item.name, item.rarity);
      if(old) player.backpack[idx]={name:old.name, rarity:old.rarity};
      else player.backpack.splice(idx,1);
    }
  }
  while(player.equipped.length<slots) player.equipped.push(null);
  recompute();
  renderInventory();
}

function unequipToBackpack(slotIdx){
  const p = player.equipped[slotIdx];
  if(!p) return;
  if(player.backpack.length >= BAG_MAX) return;
  player.backpack.push({name:p.name, rarity:p.rarity});
  player.equipped[slotIdx]=null;
  recompute(); renderInventory();
}

// Battery：被打时放出一道闪电（wiki：每 3 次被打放电一次，威力 = 同稀有度 Lightning）
function batteryZap(){
  const R = 130;
  let n = 0, dmg = player.zapDmg || 10;
  for(const e of enemies){
    if(e.hp <= 0) continue;
    if(Math.hypot(e.x - player.x, e.y - player.y) > R + e.r) continue;
    hurtEnemy(e, dmg);
    n++;
    if(n >= 6) break;
  }
  puffs.push({x:player.x, y:player.y, t:0, life:0.26, r:R, col:'#fff59d'});
  addText(player.x, player.y - PLAYER_R*2.6, 'ZAP', '#fff59d', 13, 0.7);
  DBG.zaps = (DBG.zaps||0) + 1;
}

// ---------- damage to player ----------
// 击退：被生物咬到 / 被弹射物打中时，花朵会被推开一小段（指数衰减，很快停住）
function knockPlayer(fromX, fromY, force){
  const a = Math.atan2(player.y - fromY, player.x - fromX);
  player.kbX = (player.kbX || 0) + Math.cos(a)*force;
  player.kbY = (player.kbY || 0) + Math.sin(a)*force;
}

function damagePlayer(amount){
  if(player.invuln>0) return; // second-chance invulnerability window
  // Bandage：不死状态下花朵身体伤害 -75%
  let dmg = (player.undead > 0) ? amount * 0.25 : amount;
  // shields first
  for(const p of player.equipped){
    if(p && p.def.cat==='shield' && p.shieldCur>0){
      const take = Math.min(p.shieldCur, dmg);
      p.shieldCur -= take; dmg -= take; p.shieldHit = 0;
      if(dmg<=0) break;
    }
  }
  const absorbed = amount - dmg;
  if(dmg>0){
    player.hp -= dmg; player.hitFlash = 0.25;
    addText(player.x + (Math.random()-0.5)*10, player.y - PLAYER_R*1.8,
            '-' + Math.round(dmg), '#ff8a80', 13, 0.75, true);
    addShake(Math.min(16, 4 + dmg*0.05));   // 受击屏震（伤害越大震得越狠）
  } else if(absorbed > 0.5){
    addText(player.x, player.y - PLAYER_R*1.8, 'BLOCK', '#9fe8ff', 11, 0.55);
  }
  // Battery：累计挨打次数，满 3 次放电
  if(player.zapEvery && dmg > 0){
    player._zapN = (player._zapN||0) + 1;
    if(player._zapN >= player.zapEvery){ player._zapN = 0; batteryZap(); }
  }
  if(player.hp<=0){
    // Bandage：致死时先不判死，进入「不死」状态，身体伤害 -75%
    if(player.undeadT > 0 && !(player.undead > 0)){
      player.undead = player.undeadT;
      player.hp = 1;
      player.hitFlash = 0.5;
      addText(player.x, player.y - PLAYER_R*2.4, 'UNDEAD', '#fff59d', 13, 0.9);
      return;
    }
    // Second Chance talent: cheat death briefly
    if(player.secondChance && player.scCd<=0){
      player.invuln = player.secondChance.dur;
      player.scCd = player.secondChance.cd;
      player.hp = Math.max(1, player.maxHp*0.05);
      player.hitFlash = 0.6;
      recompute();
      return;
    }
    // ankh revive
    if(player.ankh>0){
      player.ankh--;
      // remove one ankh petal
      for(let i=0;i<player.equipped.length;i++){ if(player.equipped[i]&&player.equipped[i].def.cat==='ankh'){ player.equipped[i]=null; break; } }
      player.hp = player.maxHp;
      player.hitFlash=0.4;
      recompute();
      return;
    }
    player.hp=0; state=STATE.DEAD;
    waxSummons = [];                                    // 花死了蜡也消失
    for(const p of player.equipped){ if(p && p.def && p.def.cat==='wax') p._wax = null; }
    showDead();
  }
}

// ---------- update ----------
let lastT = performance.now();
let sgRetryT = 0, sgRetryN = 0;
let _autoSaveT = 15;   // 每 15s 自动存档一次（PLAY 状态下）
function loop(now){
  const dt = Math.min((now-lastT)/1000, 0.05);
  lastT = now;
  // the precise sub-tile grid needs decoded tile art: rebuild once it is ready
  if(sgDirty && regionMap && state===STATE.PLAY && sgRetryN < 30 && now - sgRetryT > 300){
    sgRetryT = now; sgRetryN++;
    if(buildSolidGrid(regionMap)) snapOutOfWall();
    buildBushGrid(regionMap);
  }
  if(state===STATE.PLAY){ update(dt); updateWax(dt); updateBubbleDash(dt);
    _autoSaveT -= dt; if(_autoSaveT <= 0){ _autoSaveT = 15; saveGame(); }
  }
  render();
  requestAnimationFrame(loop);
}

// 当前移动方向（键盘优先，否则朝鼠标），箭头和移动共用同一份判定
// 任一全屏面板（合成台 / 背包 / Mob Gallery / 天赋）打开时，花朵原地不动
function anyPanelOpen(){
  return !!((elCraft   && elCraft.style.display   === 'block')
         || (elInv     && elInv.style.display     === 'block')
         || (elMobs    && elMobs.style.display    === 'block')
         || (elTalents && (elTalents.style.display === 'block'
                          || elTalents.classList.contains('show'))));
}
function moveDir(){
  if(anyPanelOpen()) return {dx:0, dy:0, fromKeys:true};
  if((typeof URLNPI !== 'undefined') && URLNPI) return {dx:0, dy:0, fromKeys:true};   // ?noinput=1 调试：无输入，只测泡泡推力
  let dx=0, dy=0, fromKeys=false;
  if(keys['w']||keys['arrowup']) dy-=1;
  if(keys['s']||keys['arrowdown']) dy+=1;
  if(keys['a']||keys['arrowleft']) dx-=1;
  if(keys['d']||keys['arrowright']) dx+=1;
  if(dx===0&&dy===0){
    // follow mouse (always, like florr)
    const wx = cam.x + (mouse.x - W/2)/VIEW;
    const wy = cam.y + (mouse.y - H/2)/VIEW;
    dx = wx - player.x; dy = wy - player.y;
    const len = Math.hypot(dx,dy);
    if(len>4){ dx/=len; dy/=len; } else { dx=0; dy=0; }
  } else {
    fromKeys = true;
    const l=Math.hypot(dx,dy); dx/=l; dy/=l;
  }
  return {dx, dy, fromKeys};
}

// ============================================================
//  MOB BEHAVIOUR ENGINE
//  ai: still / wander / chase / shooter / orbit / leech / spawner / friendly
//  每种怪的参数在 regions.js 的 MOBS 里，这里只做通用解释
// ============================================================

// 巢穴产怪：默认产同稀有度（原作蚁巢出的蚂蚁等级不高于巢）
function spawnAdd(e, key, ang, dist){
  const m = MOBS[key];
  if(!m) return;
  if(enemies.length > 110) return;          // 防止巢穴刷爆
  const a = (ang==null) ? Math.random()*6.28 : ang;
  const d = dist==null ? (e.r + 12) : dist;
  const rr = MOB_RARITY.indexOf(e.mobRarity) > 0 && Math.random()<0.35
    ? MOB_RARITY[MOB_RARITY.indexOf(e.mobRarity)-1] : e.mobRarity;
  const en = makeEnemy(key, e.x+Math.cos(a)*d, e.y+Math.sin(a)*d, 1, rr);
  en.spawnT = 0.28;
  enemies.push(en);
  DBG.adds++;
  puffs.push({x:en.x, y:en.y, t:0, life:0.4, r:en.r*1.1, col:'#e8d6a0'});
}

// 位移（贴着墙滑动；phase=true 的怪可以穿墙）
function moveMob(e, ax, ay, dt, mul){
  const sp = (e.speed||0) * (mul==null?1:mul) * (e.spdMul||1) * (e.slowMul||1);
  if(sp<=0) return;
  const er = Math.max(5, e.r*0.6);
  // 丝滑：速度（含方向）用指数缓动逼近目标 —— 转向 / 起步 / 停步都是渐变的，不一帧瞬变
  const tvx = ax*sp, tvy = ay*sp;
  const kacc = 1 - Math.exp(-dt/0.085);
  e.mvx = (e.mvx||0) + (tvx - (e.mvx||0))*kacc;
  e.mvy = (e.mvy||0) + (tvy - (e.mvy||0))*kacc;
  const mx = e.mvx*dt, my = e.mvy*dt;
  const phase = !!(e.def && e.def.phase);
  // 灌木丛（密道）怪物进不去；已经站在里面的也要往外挪
  if((phase || !blockedAt(e.x+mx, e.y, er)) && !inBushAt(e.x+mx, e.y)) e.x += mx;
  if((phase || !blockedAt(e.x, e.y+my, er)) && !inBushAt(e.x, e.y+my)) e.y += my;
}

// ---------- 击退（带位移动画） ----------
// 以前是直接改坐标（e.x += knock），一帧瞬移，看起来像闪现、也不经过墙的判定。
// 现在给怪一个「初速度」，每帧按指数阻尼积分：位移是滑出去的，
// 撞墙会被挡住，而且始终被地图边界卡住（怪不会被推出地图）。
const KNOCK_TAU  = 0.13;    // 速度衰减时间常数（秒）；总位移 ≈ v0 × τ
const KNOCK_VMAX = 1500;    // 初速度上限，防止超高击退把怪甩飞

function knockMob(e, ang, dist){
  if(!e || e.hp <= 0 || !(dist > 0)) return;
  if(e.ai === 'spawner' || (e.def && e.def.npc)) return;   // 巢穴 / NPC 不动
  if(e.def && e.def.immobile) return;                      // rock / ant hole / dandelion：永久不能被击退
  const v = Math.min(KNOCK_VMAX, dist / KNOCK_TAU);
  const vx = Math.cos(ang)*v, vy = Math.sin(ang)*v;
  e.kbx = e.kbx||0; e.kby = e.kby||0;      // 别让某一轴是 undefined（会算出 NaN）
  // 连续命中同一方向时不要累加（否则越推越快），取更强的那一份
  if(Math.abs(vx) > Math.abs(e.kbx||0)) e.kbx = vx;
  if(Math.abs(vy) > Math.abs(e.kby||0)) e.kby = vy;
  if(dist >= 22 && typeof puffs !== 'undefined'){
    puffs.push({x:e.x, y:e.y, t:0, life:0.18, r:e.r*0.5, col:'#e3d9bd'});
  }
}

// 每帧推进击退速度（阻尼 + 撞墙停止）
function stepKnock(e, dt){
  if(!(e.kbx || e.kby)) return;
  const er = Math.max(5, e.r*0.6);
  const phase = !!(e.def && e.def.phase);
  const damp = Math.exp(-dt/KNOCK_TAU);
  const mx = e.kbx*dt, my = e.kby*dt;
  if(phase || !blockedAt(e.x+mx, e.y, er)) e.x += mx; else e.kbx = 0;
  if(e.kbTest){ (e.kbPath = e.kbPath||[]).push(+(e.x-player.x).toFixed(1)); }  // 逐帧轨迹（调试）
  if(phase || !blockedAt(e.x, e.y+my, er)) e.y += my; else e.kby = 0;
  e.kbx *= damp; e.kby *= damp;
  if(Math.hypot(e.kbx, e.kby) < 12){ e.kbx = 0; e.kby = 0; }
}

// 所有怪（不管有没有被击退）都收在地图范围内，别再飞出界
function clampMobBounds(e){
  const pad = 6 + e.r*0.35;
  const bx = Math.max(0, boundX - pad), by = Math.max(0, boundY - pad);
  if(e.x < -bx){ e.x = -bx; if(e.kbx < 0) e.kbx = 0; }
  else if(e.x > bx){ e.x = bx; if(e.kbx > 0) e.kbx = 0; }
  if(e.y < -by){ e.y = -by; if(e.kby < 0) e.kby = 0; }
  else if(e.y > by){ e.y = by; if(e.kby > 0) e.kby = 0; }
}

// ============================================================
//  生物之间不要叠在一起（用户反馈：怪物互相压着看不清）
//  · 圆–圆软性分离：只解开「重叠量」的一部分，看起来是慢慢挤开而不是瞬移
//  · 同一条蜈蚣的各个节由 chainFollow 自己排间距，整串跳过，否则链会被推散
//  · 石头 / 巢穴 / 仙人掌这类站着不动的当「实心」，把会动的那个整个推开
//  · 推开时照样逐轴挡墙，不会被挤进墙里或者挤出地图
// ============================================================
const SEP_K   = 0.80;        // 圆心距至少要 (ra+rb)×0.8（允许贴图边缘轻微相压）
const SEP_VMAX = 420;        // 每秒最多推开多少像素
// ============================================================
//  生物碰撞箱 = 贴图本身的形状（不再是圆形）
//  把每张贴图降采样成 24×24 的透明度掩码，命中判定时把点转到贴图局部坐标再查掩码。
// ============================================================
const MOB_MASK = {};
const MASK_N = 48;
// 从 mobmask.js 的离线位图里取一张 24×24 掩码（'.'=空，'#'=实心）
function mobMask(sprite){
  if(!sprite) return null;
  const k = String(sprite).toLowerCase();
  if(MOB_MASK[k] !== undefined) return MOB_MASK[k];
  const b64 = (typeof MOB_MASK_DATA === 'object' && MOB_MASK_DATA) ? MOB_MASK_DATA[k] : null;
  if(!b64){ MOB_MASK[k] = null; return null; }
  let raw;
  try{ raw = atob(b64); }catch(e){ MOB_MASK[k] = null; return null; }
  const m = new Uint8Array(MASK_N*MASK_N);
  for(let i=0;i<MASK_N*MASK_N;i++){
    const byte = raw.charCodeAt(i>>3);
    m[i] = (byte & (0x80 >> (i & 7))) ? 1 : 0;
  }
  MOB_MASK[k] = { n: MASK_N, m };
  return MOB_MASK[k];
}
// 这只怪实际画的是哪张贴图（有可动部件的用躯干图）
// 圆（花朵本体）和贴图形状是否相交：中心 + 圆周 8 个采样点
function mobTouchesDisc(e, cx, cy, rad){
  if(mobTouches(e, cx, cy, 0)) return true;
  const R = rad || 0;
  if(R <= 0.5) return false;
  // 两圈采样：花朵边缘贴上去也要算命中（怪会被顶在 e.r+PLAYER_R 的距离上，
  // 只测圆心附近的话永远够不到它）
  for(const k of [0.58, 1.04]){
    const r = R * k;
    for(let i=0;i<10;i++){
      const a = i * 0.6283185;
      if(mobTouches(e, cx + Math.cos(a)*r, cy + Math.sin(a)*r, 0)) return true;
    }
  }
  return false;
}

function mobMaskKey(e){
  // 画的是什么就用什么的掩码：
  //   有可动部件的怪（蜘蛛这种）画的是「躯干图」，就必须用 _body 那张的掩码，
  //   用整张贴图的掩码会跟画出来的躯干对不上（会整体偏一个身位）。
  const parts = MOB_ANIM[e.key] ? null : MOB_PARTS[e.key];
  if(parts && parts.body){
    const k2 = String(e.sprite + '_' + parts.body).toLowerCase();
    const d2 = (typeof MOB_MASK_DATA === 'object' && MOB_MASK_DATA) ? MOB_MASK_DATA[k2] : null;
    if(d2) return e.sprite + '_' + parts.body;
  }
  return e.sprite;
}
// 世界坐标 (wx,wy) 是否落在生物的贴图形状内（padPx = 额外放宽的世界像素）
// 变换跟 drawEnemies 里完全一致：translate(sx, sy+oy) → rotate(rot+faceRot) → scale(sx,sy)
// → drawImage(img, -s/2+ox, -s/2+oy2, s, s)
// 点（贴图局部坐标）到「腿」的距离判定 —— 参数和 drawMobLegs 完全一致，
// 所以蜘蛛这种靠程序画腿的怪，碰撞箱 = 躯干 + 八条腿，和画出来的一模一样
function mobLegHit(e, lx, ly, s, ox, oy2, pad){
  const cfg = MOB_PARTS[e.key];
  if(!cfg || !cfg.legs) return false;
  const rb = s * LEG_R_FRAC;
  const pv = partPivot(cfg, s, ox, oy2);
  const px = lx - pv[0], py = ly - pv[1];
  const thick = Math.max(1.6, s*0.075) + (pad || 0);      // 腿的粗细 + 花瓣半径
  const amp = Math.min(1, (e.stepSpd || 0) / 90);
  const gait = e.gait || 0;
  for(let i=0;i<cfg.legs.length;i++){
    const [adeg, k] = cfg.legs[i];
    const base = adeg * Math.PI/180;
    const ph = gait - i*0.78;
    const sw = Math.sin(ph) * 0.30 * amp;
    const lift = Math.max(0, Math.sin(ph)) * 0.18 * amp;
    const ang = base + sw;
    const L = rb * k * (1 - lift*0.35);
    const ax = Math.cos(ang)*rb*0.72, ay = Math.sin(ang)*rb*0.72;
    const bx = Math.cos(ang)*L, by = Math.sin(ang)*L;
    // 点到线段距离
    const dx = bx-ax, dy = by-ay;
    const len2 = dx*dx + dy*dy || 1;
    let t = ((px-ax)*dx + (py-ay)*dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + dx*t, qy = ay + dy*t;
    if(Math.hypot(px-qx, py-qy) <= thick) return true;
  }
  return false;
}

function mobTouches(e, wx, wy, padPx){
  const pad = padPx || 0;
  const mask = mobMask(mobMaskKey(e));
  if(!mask) return Math.hypot(wx - e.x, wy - e.y) < e.r + pad;
  const p = mobPose(e);
  const s = e.r * 2.0 * (MOB_DRAW_K[e.sprite] || 1);      // 逻辑边长（不乘 VIEW）
  const pv = MOB_PIVOT[e.sprite];
  const ox = pv ? -pv[0]*s : 0, oy2 = pv ? -pv[1]*s : 0;
  const rot = -(p.rot + (e.faceRot || 0));
  const dx = wx - e.x, dy = wy - (e.y + p.oy);
  const rx = dx*Math.cos(rot) - dy*Math.sin(rot);
  const ry = dx*Math.sin(rot) + dy*Math.cos(rot);
  const lx = rx / (p.sx || 1), ly = ry / (p.sy || 1);
  const n = mask.n;
  const u = ((lx - ox)/s + 0.5) * n;
  const v = ((ly - oy2)/s + 0.5) * n;
  // 放宽量换算成格子数；最多扩 3 格（≈12.5% 边长），否则任何形状都会糊成一个圆
  const gp = Math.min(2, Math.max(0, Math.ceil(pad / s * n)));
  const cx = Math.floor(u), cy = Math.floor(v);
  for(let yy=cy-gp; yy<=cy+gp; yy++){
    if(yy < 0 || yy >= n) continue;
    const row = yy*n;
    for(let xx=cx-gp; xx<=cx+gp; xx++){
      if(xx < 0 || xx >= n) continue;
      if(mask.m[row + xx]) return true;
    }
  }
  // 躯干没中：看看是不是打在腿上（蜘蛛 / Hel 蜘蛛这类程序画腿的怪）
  if(mobLegHit(e, lx, ly, s, ox, oy2, pad)) return true;
  return false;
}

// ============================================================
//  贴图形状的「方向半径」：沿某个方向，形状从生物中心伸出去多远
//  用来替代「圆半径」做粗判（怪与怪分离 / 贴到花朵的距离），
//  这样长条形（蜈蚣、毛毛虫）、带腿的（蜘蛛）判出来的距离跟画出来的一致。
//  做法：把掩码的实心格投影到 32 个方向上，每个方向记下最远的那个格
//  （归一化坐标：相对生物中心，单位 = 贴图边长），查询时 O(1) 取用。
// ============================================================
const NSUP = 32;
const MOB_SUP = {};                       // maskKey -> Float32Array(NSUP*2)
function maskSupport(key, e){
  if(MOB_SUP[key] !== undefined) return MOB_SUP[key];
  const mask = mobMask(key);
  if(!mask){ MOB_SUP[key] = null; return null; }
  const n = mask.n;
  const pv = MOB_PIVOT[e.sprite] || [0,0];
  const cx0 = pv[0] + 0.5, cy0 = pv[1] + 0.5;    // 生物中心在掩码里的归一化位置
  const pts = new Float32Array(NSUP*2);
  const best = new Float32Array(NSUP).fill(-1e9);
  const cs = new Float32Array(NSUP), sn = new Float32Array(NSUP);
  for(let k=0;k<NSUP;k++){ const a = k*6.283185307/NSUP; cs[k]=Math.cos(a); sn[k]=Math.sin(a); }
  const consider = (cx, cy)=>{
    for(let k=0;k<NSUP;k++){
      const pr = cx*cs[k] + cy*sn[k];
      if(pr > best[k]){ best[k] = pr; pts[k*2] = cx; pts[k*2+1] = cy; }
    }
  };
  for(let y=0;y<n;y++){
    const row = y*n;
    for(let x=0;x<n;x++){
      if(mask.m[row+x]) consider((x+0.5)/n - cx0, (y+0.5)/n - cy0);
    }
  }
  // 蜘蛛这类程序画腿的：把腿的末端（含粗细）也算进形状里
  const cfg = MOB_PARTS[e.key];
  if(cfg && cfg.legs){
    const lp = cfg.pivot || [0,0];
    const bx = -pv[0] + lp[0], by = -pv[1] + lp[1];      // 腿的根节点（归一化）
    for(const L of cfg.legs){
      const ang = L[0] * Math.PI/180, len = LEG_R_FRAC * (L[1] || 1) + 0.08;
      consider(bx + Math.cos(ang)*len*0.6, by + Math.sin(ang)*len*0.6);
      consider(bx + Math.cos(ang)*len,     by + Math.sin(ang)*len);
    }
  }
  MOB_SUP[key] = pts;
  return pts;
}
// 沿世界方向 (dx,dy)（单位向量），生物形状从中心伸出多远（世界像素）
function mobSupportR(e, dx, dy){
  const key = mobMaskKey(e);
  const pts = maskSupport(key, e);
  const s = e.r * 2.0 * (MOB_DRAW_K[e.sprite] || 1);
  if(!pts) return e.r;                                  // 没有掩码才退化成圆
  const p = mobPose(e);
  const rot = -(p.rot + (e.faceRot || 0));
  const sx = p.sx || 1, sy = p.sy || 1;
  // 世界方向 → 贴图局部方向（跟 mobTouches 同一套变换）
  const ax = dx*Math.cos(rot) - dy*Math.sin(rot);
  const ay = dx*Math.sin(rot) + dy*Math.cos(rot);
  // 非均匀缩放：用加权后的方向去找最远的那个格
  const k = ((Math.round(Math.atan2(sy*ay, sx*ax) * NSUP/6.283185307) % NSUP) + NSUP) % NSUP;
  const cx = pts[k*2], cy = pts[k*2+1];
  return Math.max(2, s * (sx*cx*ax + sy*cy*ay));
}

// 掉落物落点修正：不许落在墙里 / 地图外（界外那一圈）
function dropSpot(x, y){
  const bx = boundX || 1, by = boundY || 1;
  const clampX = v => Math.max(-bx + 10, Math.min(bx - 10, v));
  const clampY = v => Math.max(-by + 10, Math.min(by - 10, v));
  x = clampX(x); y = clampY(y);
  const okAt = (tx, ty)=>{
    if(tx <= -bx + 8 || tx >= bx - 8 || ty <= -by + 8 || ty >= by - 8) return false;
    return !blockedAt(tx, ty, 10) && isFreeMainAt(tx, ty);
  };
  if(okAt(x, y)) return { x, y };
  // 螺旋往外找最近的可站点，找不到就用边界内的原位置
  for(let r = 14; r <= 190; r += 14){
    for(let i = 0; i < 12; i++){
      const a = (i / 12) * 6.2832 + r * 0.13;
      const tx = clampX(x + Math.cos(a)*r), ty = clampY(y + Math.sin(a)*r);
      if(okAt(tx, ty)) return { x: tx, y: ty };
    }
  }
  return { x, y };
}

function mobIsStatic(e){
  return e.ai === 'still' || e.ai === 'spawner' || !!(e.def && e.def.npc);
}
// 花朵 vs 静止生物：把「花朵」顶出去（静止生物永远不动）
function collidePlayerWithStaticMobs(){
  for(const e of enemies){
    if(e.hp <= 0 || !mobIsStatic(e)) continue;
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy);
    // 用贴图形状判定：只有真的贴到它身上才被顶开
    if(d >= e.r + PLAYER_R || !mobTouchesDisc(e, player.x, player.y, PLAYER_R*0.9)) continue;
    let ux, uy;
    if(d < 1e-3){ ux = 1; uy = 0; } else { ux = dx/d; uy = dy/d; }
    // 顶开的距离也按形状算（岩石 / 仙人掌这种不规则静止物，不再当圆推开）
    const rr = mobSupportR(e, ux, uy) + PLAYER_R * 0.92;
    const push = Math.max(0, rr - d) + 0.5;
    const nx = player.x + ux*push, ny = player.y + uy*push;
    if(!blockedAt(nx, player.y, PLAYER_R*0.9)) player.x = nx;
    if(!blockedAt(player.x, ny, PLAYER_R*0.9)) player.y = ny;
  }
}

function separateMobs(dt){
  const n = enemies.length;
  if(n < 2) return;  const cap = SEP_VMAX * dt;
  for(let i=0;i<n;i++){
    const a = enemies[i];
    if(a.hp <= 0) continue;
    const sa = mobIsStatic(a);
    for(let j=i+1;j<n;j++){
      const b = enemies[j];
      if(b.hp <= 0) continue;
      // 同一条蜈蚣：节间距由 chainFollow 负责
      if(a.chainId != null && a.chainId === b.chainId) continue;
      const sb = mobIsStatic(b);
      if(sa && sb) continue;                       // 两个都不动，推了也没用
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx*dx + dy*dy;
      // 粗判：离得比「最大可能伸展」还远就跳过（形状可能比 e.r 长，留 1.8 倍余量）
      const broad = (a.r + b.r) * 1.8;
      if(d2 >= broad*broad) continue;
      let d = Math.sqrt(d2), ux, uy;
      if(d < 1e-3){
        // 完全重合：给一个确定性的方向，免得每帧抖
        const ang = i*2.399 + j*1.117;
        ux = Math.cos(ang); uy = Math.sin(ang); d = 1e-3;
      } else { ux = dx/d; uy = dy/d; }
      // 贴图形状的方向半径：a 朝 b 伸多远 + b 朝 a 伸多远（不再是两个圆）
      const rr = (mobSupportR(a, ux, uy) + mobSupportR(b, -ux, -uy)) * SEP_K;
      if(d >= rr) continue;
      const amt = Math.min(rr - d, cap);
      let wa = 0.5, wb = 0.5;
      if(sa){ wa = 0; wb = 1; }
      else if(sb){ wa = 1; wb = 0; }
      if(wa){
        const ax = -ux*amt*wa, ay = -uy*amt*wa;
        const er = a.r*0.7;
        if(!blockedAt(a.x+ax, a.y, er)) a.x += ax;
        if(!blockedAt(a.x, a.y+ay, er)) a.y += ay;
        clampMobBounds(a);
      }
      if(wb){
        const bx = ux*amt*wb, by = uy*amt*wb;
        const er = b.r*0.7;
        if(!blockedAt(b.x+bx, b.y, er)) b.x += bx;
        if(!blockedAt(b.x, b.y+by, er)) b.y += by;
        clampMobBounds(b);
      }
    }
  }
  // 花朵和生物也不重叠：只推生物，花朵永远不会被怪物顶开（碰撞对花无效）
  const pr = PLAYER_R * 0.92;
  for(const e of enemies){
    if(e.hp <= 0 || e.attach || mobIsStatic(e)) continue;
    const dx = e.x - player.x, dy = e.y - player.y;
    const d = Math.hypot(dx, dy);
    if(d >= e.r*1.8 + pr || d < 1e-4) continue;
    const ux = dx/d, uy = dy/d;
    // 形状方向半径：怪朝花朵伸多远（长条怪能贴得更近，不再是圆）
    const rr = mobSupportR(e, -ux, -uy) + pr;
    if(d >= rr) continue;
    const amt = Math.min(rr - d, cap);
    const ex = e.x + ux*amt, ey = e.y + uy*amt;
    if(!blockedAt(ex, e.y, e.r*0.7)) e.x = ex;
    if(!blockedAt(e.x, ey, e.r*0.7)) e.y = ey;
    clampMobBounds(e);
  }
}

// 游荡：随机换方向，且不会离出生点太远
function wanderStep(e, dt, mul){
  // wiki：被动 / 中立怪「走几格 → 停下 → 换个方向再走」（不是一直在动）
  if(e.pauseT > 0){ e.pauseT -= dt; return; }
  e.wanderT -= dt;
  if(e.wanderT<=0){
    e.wanderT = 1.0 + Math.random()*1.6;
    e.pauseT  = 0.30 + Math.random()*0.55;      // 停一下再转向
    e.wanderA = Math.random()*6.28;
    // 有出生点就偶尔往回走
    if(e.homeX!=null && Math.hypot(e.x-e.homeX, e.y-e.homeY) > 320){
      e.wanderA = Math.atan2(e.homeY-e.y, e.homeX-e.x) + (Math.random()-0.5)*0.8;
    }
    return;
  }
  moveMob(e, Math.cos(e.wanderA), Math.sin(e.wanderA), dt, mul==null?0.55:mul);
}

// 开火：从怪物朝玩家（或预判点）发射投射物
function mobShoot(e, d, nx, ny){
  const cfg = e.def.atk;
  if(!cfg) return false;
  if(d > aggroRadius(e)) return false;
  const aim = Math.atan2(player.y-e.y, player.x-e.x);
  // 黄蜂 / 胡蜂：刺在尾部。要先转身把尾针对准花朵（转的过程中不开火），
  // 对准后再蓄力 0.25s 才射出去 —— 这样才看得到「转身 → 射刺」这套动作
  if(e.def.tailShot && !NO_HEAD_SPRITES.has(e.sprite)){
    const headWant = aim + Math.PI;                       // 头朝反方向 = 屁股对着花
    const cur  = (e.faceRot||0) + ART_HEAD;               // 当前头的朝向
    const err  = Math.atan2(Math.sin(headWant-cur), Math.cos(headWant-cur));
    if(Math.abs(err) > 0.16){ e.windT = 0.25; return false; }   // 还没转过来
    if(e.windT > 0) return false;                         // 转好了，蓄力中
  }
  // 正对后再开火；黄蜂的角度交给每帧的平滑插值（不要在这里写死，否则会「瞬移转头」）
  e.faceAng = aim;
  if(!NO_HEAD_SPRITES.has(e.sprite) && !e.def.tailShot){
    e.faceRot = aim - ART_HEAD;
  }
  const sp = cfg.speed || 300;
  let ax = nx, ay = ny;
  // 高级黄蜂会预判：瞄向玩家"将会到达"的位置
  if(e.def.predict && MOB_RARITY.indexOf(e.mobRarity) >= MOB_RARITY.indexOf(e.def.predict)){
    const t = d / sp;
    ax = (player.x - e.x) + (player.vx||0)*t;
    ay = (player.y - e.y) + (player.vy||0)*t;
    const L = Math.hypot(ax,ay)||1; ax/=L; ay/=L;
  }
  const n = cfg.burst||1;
  DBG.shots += n;
  // 蜂刺（missile）大小随稀有度增长：Common 6 → Eternal/Unique 22（用户要求逐级变大）
  const MISSILE_R = {Common:6, Unusual:7.2, Rare:8.6, Epic:10.2, Legendary:12,
                     Mythic:14.2, Ultra:16.6, Super:19.2, Eternal:22, Unique:22};
  for(let i=0;i<n;i++){
    const spread = (i-(n-1)/2) * 0.16;
    const ca = Math.cos(spread), sa = Math.sin(spread);
    const vx = (ax*ca - ay*sa)*sp, vy = (ax*sa + ay*ca)*sp;
    const pr = cfg.type==='pea' ? 5 : (MISSILE_R[e.mobRarity] || 7);
    eproj.push({x:e.x+nx*(e.r+6), y:e.y+ny*(e.r+6), vx, vy,
                dmg:cfg.dmg*(MOB_MULT[e.mobRarity]||1), r:pr,
                life:2.2, type:cfg.type, wave:cfg.wave?1:0, phase:Math.random()*6.28});
  }
  // wiki：黄蜂开火时有轻微后坐力（位移 + 贴图弹一下）
  if(e.def.tailShot){
    knockMob(e, aim + Math.PI, 7);
    e.fireT = 0.18;
    puffs.push({x:e.x - Math.cos(aim)*(e.r*0.9), y:e.y - Math.sin(aim)*(e.r*0.9),
                t:0, life:0.2, r:e.r*0.5, col:'#ffe082'});
  }
  return true;
}

// 闪电（水母 / 萤火虫）：命中即伤，带一条抖动电弧特效
function mobZap(e, tx, ty, dmg){
  DBG.zaps++;
  zaps.push({x1:e.x, y1:e.y, x2:tx, y2:ty, t:0, life:0.18});
  damagePlayer(dmg);
  for(const s of summons){
    if(!s.dead && Math.hypot(s.x-tx, s.y-ty) < 60) hitSummon(s, dmg*0.6);
  }
}

function nearestTarget(x, y, maxD){
  let best=null, bd=maxD==null?1e9:maxD;
  for(const e of enemies){
    if(e.hp<=0) continue;
    const d = Math.hypot(e.x-x, e.y-y);
    if(d<bd){ bd=d; best=e; }
  }
  return {e:best, d:bd};
}

function updateMobAI(e, dt, d, nx, ny){
  const def = e.def || {};
  // 蜈蚣的身体节：只跟着前一节走，不自己索敌
  // 注意 spawnT 也要照常倒数 —— 以前这里直接 return，导致身体节永远停在
  // 「出生中」的 45% 大小 / 35% 透明度上，看起来又透明又大小不一
  if(e.leaderSeg){
    e.age += dt; e.phase += dt;
    if(e.spawnT > 0) e.spawnT = Math.max(0, e.spawnT - dt);
    chainFollow(e, dt); return;
  }
  const AGGRO = aggroRadius(e);
  e.age += dt; e.phase += dt;
  if(e.onHitT>0) e.onHitT -= dt;
  if(e.windT>0) e.windT -= dt;                 // 黄蜂蓄力（尾针对准花朵的那一下）
  if(e.fireT>0) e.fireT -= dt;                 // 开火后坐力的余韵
  if(e.lookT>0) e.lookT -= dt;                 // 咬过花之后保持朝向花朵
  if(e.dashT>0) e.dashT -= dt;
  if(e.spawnT>0){ e.spawnT -= dt; return; }   // 出生缩放期间不动不打
  if(e.atkCd>0 && def.atk===undefined){ /* keep */ }

  // 盾（贝壳）：不受伤一段时间后回满
  if(e.shieldMax>0){
    if(e.shieldCur < e.shieldMax){
      e.shieldT += dt;
      if(e.shieldT > 2.5){ e.shieldCur = e.shieldMax; e.shieldT = 0; }
    }
  }

  // 巢穴定时产怪 / 靠近触发
  if(def.onTimerSpawn){
    e.spawnCd -= dt;
    if(e.spawnCd<=0 && d<640){
      e.spawnCd = def.onTimerSpawn.cd;
      for(let i=0;i<def.onTimerSpawn.n;i++)
        spawnAdd(e, def.onTimerSpawn.keys[(Math.random()*def.onTimerSpawn.keys.length)|0]);
    }
  }
  if(def.proximitySpawn && !e.released && d < def.proximitySpawn.range){
    e.released = true;
    const n = def.proximitySpawn.n;
    for(let i=0;i<n;i++)
      spawnAdd(e, def.proximitySpawn.keys[(Math.random()*def.proximitySpawn.keys.length)|0], i/n*6.28, e.r+16);
  }

  switch(e.ai){
    case 'still': {
      // 不动，但会因为受伤反击（蒲公英：被打就朝四周射种子）
      if(def.atk && (e.aggroOn || !def.retaliate)){
        e.shootT -= dt;
        if(e.shootT<=0 && d < AGGRO){ e.shootT = def.atk.cd; mobShoot(e, d, nx, ny); }
      }
      break;
    }

    case 'wander': {
      // 蟑螂：被打后短时间高速撞向攻击者，血量低时腿软
      if(def.dashOnHit){
        if(def.slowAtLow) e.spdMul = (e.hp < e.maxHp*0.3) ? def.slowAtLow : 1;
        if(e.dashT>0){ moveMob(e, nx, ny, dt, def.dashOnHit); break; }
      }
      if(e.aggroOn && !def.npc){
        moveMob(e, nx, ny, dt, 1);
        // 近战型边追边咬（咬人走接触伤害那段）
      } else {
        // 蜜蜂/黄蜂会走 S 形，靠近时容易突然撞上
        if(e.anim==='fly'){
          const sway = Math.sin(e.age*3.1+e.phase)*0.5;
          const ca = Math.cos(sway), sa = Math.sin(sway);
          const wx = Math.cos(e.wanderA)*ca - Math.sin(e.wanderA)*sa;
          const wy = Math.cos(e.wanderA)*sa + Math.sin(e.wanderA)*ca;
          moveMob(e, wx, wy, dt, 0.6);
          if(Math.random()<dt*0.6) e.wanderA += (Math.random()-0.5)*1.6;
          e.wanderT -= dt;
          if(e.wanderT<=0){ e.wanderT = 1.2+Math.random()*1.6; e.wanderA = Math.random()*6.28; }
        } else {
          wanderStep(e, dt, 0.55);
        }
      }
      // 中立型：被打 / 被灯泡蜂蜜挑衅之后才会主动追（Bee Rare+ / Centipede Epic+ …；
      // 被 Uranium、Honey 激怒的被动怪也会追，所以这里只看 aggroOn 不再看 retaliate）
      if(e.aggroOn) moveMob(e, nx, ny, dt, 1);
      // 贝壳：被激怒后每 2 秒突进一次
      if(def.burstChase && e.aggroOn){
        e.burstT -= dt;
        if(e.burstT<=0){ e.burstT = def.burstChase; e.dashT = 0.45; }
        if(e.dashT>0){ e.dashT -= dt; moveMob(e, nx, ny, dt, 1.9); }
      }
      if(def.atk){
        e.shootT -= dt;
        if(e.shootT<=0 && (e.aggroOn || !def.retaliate) && d < AGGRO){
          e.shootT = def.atk.cd; mobShoot(e, d, nx, ny);
        }
      }
      break;
    }

    case 'chase': {
      if(d < AGGRO){
        e.aggroOn = true;
        // 追到近处会加速冲一下
        const mul = d < 220 ? 1.25 : 1;
        moveMob(e, nx, ny, dt, mul);
        // 水母：贴近就放电
        if(def.zap){
          e.zapT -= dt;
          if(d < def.zap.range && e.zapT<=0){
            e.zapT = def.zap.cd;
            e.glowT = 0.2;
            mobZap(e, player.x, player.y, def.zap.dmg*(MOB_MULT[e.mobRarity]||1));
          }
        }
        // 海星：血量低于一半就退开回血，满了再回来
        if(def.retreatAt && e.hp < e.maxHp*def.retreatAt){
          if(!e.retreating) DBG.retreats++;
          e.retreating = true;
        }
        if(e.retreating){
          if(e.hp >= e.maxHp*0.98) e.retreating = false;
          else moveMob(e, -nx, -ny, dt, 1.1);
        }
        if(def.atk){
          e.shootT -= dt;
          if(e.shootT<=0){ e.shootT = def.atk.cd; mobShoot(e, d, nx, ny); }
        }
      } else {
        e.aggroOn = false;
        wanderStep(e, dt, 0.5);
      }
      if(def.regen && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp*def.regen*dt);
      break;
    }

    case 'spawner': {
      // 巢穴：本体不动，靠 onTimerSpawn / proximitySpawn 持续产怪
      // （产怪逻辑在上面的通用段里，这里只是让它别到处乱走）
      break;
    }

    case 'shooter': {
      const aggro = AGGRO, keep = def.keep||240;
      if(d < aggro){
        e.aggroOn = true;
        // 保持距离：太近后退、太远靠近、中间横向游走
        if(d < keep*0.8) moveMob(e, -nx, -ny, dt, 1);
        else if(d > keep*1.25) moveMob(e, nx, ny, dt, 1);
        else {
          const side = Math.sin(e.age*0.9+e.phase) > 0 ? 1 : -1;
          moveMob(e, -ny*side, nx*side, dt, 0.8);
        }
        // 黄蜂：平时触角对着花，射针前 0.5s 才转身让尾针对准
        if(def.tailShot) e.tailAim = (e.shootT <= 0.5);
        e.shootT -= dt;
        if(e.shootT<=0){
          // 没对准（还在转身）就 0.1s 后再判定一次，不占用整个冷却
          const fired = mobShoot(e, d, nx, ny);
          // wiki：Legendary+ 的黄蜂射得明显更快（其余按各自 atk.cd）
          const legUp = MOB_RARITY.indexOf(e.mobRarity) >= MOB_RARITY.indexOf('Legendary');
          e.shootT = fired ? def.atk.cd * (legUp && def.tailShot ? 0.65 : 1) : 0.1;
          if(fired) e.tailAim = false;      // 射完转回去，继续用触角面对花朵
        }
        // 高级蝎子：射完一发就冲过来
        if(def.charge && MOB_RARITY.indexOf(e.mobRarity) >= MOB_RARITY.indexOf(def.charge)){
          e.chargeCd -= dt;
          if(e.chainPhase==null) e.chainPhase = 0;
          if(e.chargeCd<=0 && e.shootT > def.atk.cd*0.6){
            e.chargeCd = 3.4; e.charging = 0.45; e.chargeA = Math.atan2(ny,nx);
          }
        }
      } else {
        e.aggroOn = false;
        e.tailAim = false;
        wanderStep(e, dt, 0.45);
      }
      break;
    }

    case 'orbit': {
      // 螃蟹：先绕着你转，随机时刻猛然冲过来
      const R = def.orbitR||230;
      if(d < AGGRO){
        e.aggroOn = true;
        e.chargeCd -= dt;
        if(e.charging>0){
          e.charging -= dt;
          moveMob(e, Math.cos(e.chargeA), Math.sin(e.chargeA), dt, def.chargeSpeed||2.8);
        } else if(e.chargeCd<=0){
          e.charging = def.chargeDur||0.55;
          DBG.charges++;
          e.chargeA = Math.atan2(ny, nx);
          e.chargeCd = (def.chargeCd||2.5) + Math.random()*1.5;
        } else {
          // 绕圈
          const dir = (e.orbitA>0)?1:-1;
          e.orbitA += dt;
          const tx = -ny*dir, ty = nx*dir;
          const radial = (d - R) / Math.max(60, R);
          moveMob(e, tx + nx*radial*1.4, ty + ny*radial*1.4, dt, 0.95);
        }
      } else {
        e.aggroOn = false;
        wanderStep(e, dt, 0.45);
      }
      break;
    }

    case 'leech': {
      // 水蛭：贴住玩家后不掉血不会松口
      if(e.attach){
        e.attachA += dt*0.8;
        e.x = player.x + Math.cos(e.attachA)*(PLAYER_R+e.r*0.5);
        e.y = player.y + Math.sin(e.attachA)*(PLAYER_R+e.r*0.5);
        e.drainT -= dt;
        if(e.drainT<=0){
          e.drainT = 0.5;
          const drain = (def.drain||6)*(MOB_MULT[e.mobRarity]||1);
          damagePlayer(drain);
          e.hp = Math.min(e.maxHp, e.hp + drain*2);
        }
      } else if(d < AGGRO){
        e.aggroOn = true;
        moveMob(e, nx, ny, dt, d<200?1.15:1);
        // 吸附判定也走贴图形状（不再是圆）：真贴上花朵才吸住
        if(d < e.r + PLAYER_R + 2 && mobTouchesDisc(e, player.x, player.y, PLAYER_R)){
          e.attach = true; DBG.attaches++; e.attachA = Math.atan2(-ny,-nx); e.drainT = 0.4;
        }
      } else {
        wanderStep(e, dt, 0.6);
      }
      break;
    }

    case 'friendly': {
      // 挖掘者：帮玩家打敌对生物，血少就跑
      const t = nearestTarget(e.x, e.y, 460);
      if(e.hp < e.maxHp*0.35){
        moveMob(e, -nx, -ny, dt, 1.3);
      } else if(t.e){
        const ax = (t.e.x-e.x)/(t.d||1), ay = (t.e.y-e.y)/(t.d||1);
        moveMob(e, ax, ay, dt, 1.1);
        if(t.d < e.r + t.e.r + 4){ hurtEnemy(t.e, e.dmg*dt*3); }
      } else {
        wanderStep(e, dt, 0.7);
      }
      break;
    }

    default:
      wanderStep(e, dt, 0.5);
  }

  // 遁地（沙漠蜈蚣 / 蠕虫）：周期性潜地，潜地时不挡不撞、速度更快
  if(def.burrow){
    e.burrowT -= dt;
    if(e.dug>0){
      e.dug -= dt;
      moveMob(e, nx, ny, dt, 1.7);
    } else if(e.burrowT<=0){
      e.dug = 0.9; DBG.dugs++; e.burrowT = 2.6 + Math.random()*2.6;
      puffs.push({x:e.x, y:e.y, t:0, life:0.5, r:e.r*1.5, col:'#b99a5b'});
    }
  }
}

function update(dt){
  try{ return updateInner(dt); }
  catch(err){
    if(!window.__updErrShown){
      window.__updErrShown = 1;
      try{ console.error('UPD ERR', err); }catch(_){}
    }
    throw err;
  }
}
function updateInner(dt){
  updatePortals(dt);
  // Air（以及任何改花身面积的花瓣）：尺寸变化走缓动，不要一装备就「啪」地撑大
  {
    const faT = player.flowerArea || 0;
    if(player.flowerAreaCur == null) player.flowerAreaCur = faT;
    const k = 1 - Math.exp(-dt/0.18);
    player.flowerAreaCur += (faT - player.flowerAreaCur)*k;
    if(Math.abs(faT - player.flowerAreaCur) < 0.02) player.flowerAreaCur = faT;
  }
  // movement
  player.inBush = inBushAt(player.x, player.y);   // 站在 foliage 灌木丛（密道）里
  {
    const want = player.inBush ? 1 : 0;
    player.bushDark = (player.bushDark || 0) + (want - (player.bushDark || 0)) * Math.min(1, dt*6);
    if(player.bushDark < 0.005) player.bushDark = 0;
  }
  const md = moveDir();
  let dx = md.dx, dy = md.dy;
  const speed = 175*player.speedMult;
  // 丝滑起步 / 停步：实际速度指数缓动逼近目标速度（~75ms），不再瞬启瞬停
  const kacc = 1 - Math.exp(-dt/0.075);
  player.mvX = (player.mvX||0) + (dx*speed - (player.mvX||0))*kacc;
  player.mvY = (player.mvY||0) + (dy*speed - (player.mvY||0))*kacc;
  if(!dx && !dy && Math.hypot(player.mvX, player.mvY) < 0.6){ player.mvX = 0; player.mvY = 0; }
  // move axis by axis so we slide along walls instead of sticking to them
  const stepX = player.mvX*dt, stepY = player.mvY*dt;
  // sub-step long moves so we never tunnel through a wall
  const sub = Math.max(1, Math.ceil(Math.max(Math.abs(stepX),Math.abs(stepY)) / 24));
  for(let s=0;s<sub;s++){
    const nx = player.x + stepX/sub;
    if(!blockedAt(nx, player.y, PLAYER_R)) player.x = nx;
    const ny = player.y + stepY/sub;
    if(!blockedAt(player.x, ny, PLAYER_R)) player.y = ny;
  }
  // creep: a frame's step can be several px, so the flower would stop a few px
  // short of the wall. Close that last gap 1px at a time so the body sits flush
  // against the terrain edge (only when the step was actually blocked).
  const sx1 = dx>0?1:(dx<0?-1:0), sy1 = dy>0?1:(dy<0?-1:0);
  if(sx1 && blockedAt(player.x + sx1*3, player.y, PLAYER_R)){
    for(let i=0;i<10;i++){
      if(blockedAt(player.x + sx1, player.y, PLAYER_R)) break;
      player.x += sx1;
    }
  }
  if(sy1 && blockedAt(player.x, player.y + sy1*3, PLAYER_R)){
    for(let i=0;i<10;i++){
      if(blockedAt(player.x, player.y + sy1, PLAYER_R)) break;
      player.y += sy1;
    }
  }
  // 玩家边界硬钳制：泡泡冲刺等任何位移都不能把花推出地图（进灰色虚空）
  {
    const pbx = Math.max(0, boundX - PLAYER_R), pby = Math.max(0, boundY - PLAYER_R);
    player.x = Math.max(-pbx, Math.min(pbx, player.x));
    player.y = Math.max(-pby, Math.min(pby, player.y));
  }
  // 击退位移：走墙检测，撞墙就停，不会把花朵推进墙里
  if(player.kbX || player.kbY){
    const kbx = player.kbX*dt, kby = player.kbY*dt;
    const ks = Math.max(1, Math.ceil(Math.max(Math.abs(kbx), Math.abs(kby)) / 20));
    for(let s2=0;s2<ks;s2++){
      const nx2 = player.x + kbx/ks;
      if(!blockedAt(nx2, player.y, PLAYER_R)) player.x = nx2;
      const ny2 = player.y + kby/ks;
      if(!blockedAt(player.x, ny2, PLAYER_R)) player.y = ny2;
    }
    const kd = Math.exp(-dt/0.15);                  // 0.15s 衰减，推一下就停
    player.kbX *= kd; player.kbY *= kd;
    if(Math.hypot(player.kbX, player.kbY) < 6){ player.kbX = 0; player.kbY = 0; }
  }
  // 撞到「不会动」的生物（蚁巢 / 岩石 / 仙人掌 / 蛋…）：花朵被顶开，
  // 这些家伙自己是一动不动的（原作就是这样，撞上去是花被弹开）
  collidePlayerWithStaticMobs();
  player.x = Math.max(-boundX,Math.min(boundX,player.x));
  player.y = Math.max(-boundY,Math.min(boundY,player.y));
  // 屏震：把抖动偏移叠到相机上（每帧衰减）；不抖动时偏移为 0
  let sx=0, sy=0;
  if(shakeT > 0){
    shakeT -= dt;
    const k = Math.max(0, shakeT/shakeDur);
    const m = shakeMag * k;
    sx = (Math.random()*2-1)*m; sy = (Math.random()*2-1)*m;
    if(shakeT <= 0) shakeMag = 0;
  }
  cam.x = player.x + sx; cam.y = player.y + sy;

  // regen：回血花瓣的常驻持续回复（每 1.1s 在花朵头上冒一次绿字，看得见）
  if(player.regen>0 && player.hp<player.maxHp){
    const before = player.hp;
    player.hp = Math.min(player.maxHp, player.hp + player.regen*dt);
    player.regenTickT = (player.regenTickT||0) + dt;
    if(player.regenTickT > 1.1){
      const got = player.hp - before + player.regen*1.1;
      player.regenTickT = 0;
      if(got > 0.4) addText(player.x + (Math.random()-0.5)*10, player.y - PLAYER_R*1.6,
                            '+' + (got>=10?Math.round(got):got.toFixed(1)), '#6ee7a0', 10.5, 0.7);
    }
  }
  // shield regen
  for(const p of player.equipped){
    if(p&&p.def.cat==='shield'){
      p.shieldHit += dt;
      if(p.shieldHit>3 && p.shieldCur<p.shieldMax){
        p.shieldCur = Math.min(p.shieldMax, p.shieldCur + p.shieldMax*0.5*dt);
      }
    }
  }
  if(player.hitFlash>0) player.hitFlash-=dt;

  // petal spin (talent rotation speed)
  // 基础公转速度 2.5 rad/s —— official-florrio wiki「冷知识」：花瓣的公转速度为 2.5rad/s
  player.petalAngle += curSpin() * dt;

  // 空格：花瓣往外撑开（原作 attack 伸展），松手慢慢收回
  {
    const want = keys[' '] ? 1 : 0;
    const rate = want ? 9 : 5;
    player.spread = (player.spread||0) + (want - (player.spread||0)) * Math.min(1, dt*rate);
    if(player.spread < 0.001) player.spread = 0;
  }
  // Shift / 右键：花瓣往花朵身上收（防御缩起），带缓动，松手慢慢还原
  {
    const want = (keys['shift'] || mouse.right) ? 1 : 0;
    const rate = want ? 9 : 5;
    player.tuck = (player.tuck||0) + (want - (player.tuck||0)) * Math.min(1, dt*rate);
    if(player.tuck < 0.001) player.tuck = 0;
  }
  // 花朵表情状态机：攻击（左键/空格）> 防御（右键/Shift）> 正常；切换播过渡 GIF 帧序列
  {
    const wantAtk = (mouse.down || keys[' ']) ? 1 : 0;
    const wantDef = (!wantAtk && (mouse.right || keys['shift'])) ? 1 : 0;
    const want = player.faceForce || (wantAtk ? 'attack' : (wantDef ? 'defense' : 'normal'));
    player.defenseMode = (want === 'defense');   // Bubble 等花瓣只在防御状态生效
    if(want !== player.faceState && !(player.faceAnim && player.faceAnim.target === want)){
      const seq = FACE_TRANS[player.faceState + '>' + want];
      if(seq){ player.faceAnim = { seq, i:0, t:0, target: want }; }
      else { player.faceState = want; player.faceAnim = null; }
    }
    if(player.faceAnim){
      const ft = 0.2 / player.faceAnim.seq.length;      // 每段过渡动画统一 0.2s
      player.faceAnim.t += dt;
      while(player.faceAnim && player.faceAnim.t >= ft){
        player.faceAnim.t -= ft;
        player.faceAnim.i++;
        if(player.faceAnim.i >= player.faceAnim.seq.length){
          player.faceState = player.faceAnim.target;
          player.faceAnim = null;
        }
      }
    }
    // 眼球注视方向（朝鼠标，单位向量，带缓动）
    const ps2 = w2s(player.x, player.y);
    const mdx = mouse.x - ps2[0], mdy = mouse.y - ps2[1];
    const md = Math.hypot(mdx, mdy) || 1;
    const k10 = Math.min(1, dt*10);
    player.gazeX = (player.gazeX||0) + (mdx/md - (player.gazeX||0)) * k10;
    player.gazeY = (player.gazeY||0) + (mdy/md - (player.gazeY||0)) * k10;
  }

  // timers: second chance invuln / cooldown
  if(player.invuln>0) player.invuln -= dt;
  if(player.undead>0) player.undead = Math.max(0, player.undead - dt);   // Bandage 不死状态
  if(player.scCd>0) player.scCd -= dt;

  // 玩家速度（给会预判的生物瞄提前量用）
  if(player.lx==null){ player.lx=player.x; player.ly=player.y; }
  player.vx = (player.x-player.lx)/Math.max(dt,1e-3);
  player.vy = (player.y-player.ly)/Math.max(dt,1e-3);
  player.lx = player.x; player.ly = player.y;

  // enemies
  if(superCd > 0) superCd = Math.max(0, superCd - dt);
  for(const k in superCdByMob) if(superCdByMob[k] > 0) superCdByMob[k] = Math.max(0, superCdByMob[k] - dt);
  const pooR = player.pooR || 0;
  for(let ei=enemies.length-1; ei>=0; ei--){
    const e = enemies[ei];
    e.atkCd -= dt; e.wob += dt*6; if(e.hitFlash>0) e.hitFlash-=dt;
    // ---- 朝向花朵：真·旋转 ----
    //   贴图的原生朝向是「上」，所以面向花朵 = 角度 + 90°
    //   只有「索敌中 + 会移动」的生物才转身；石头 / 仙人掌 / 巢穴这种不动的生物保持原样
    //   用最短弧插值，转起来是连续旋转，不是压扁镜像
    {
      const mobile = MOBILE_AI.has(e.ai);
      const canHead = !NO_HEAD_SPRITES.has(e.sprite);
      // 蜈蚣身体节：朝向由链式跟随决定（朝前那一节），不要被「面向花朵」覆盖
      if(e.leaderSeg){
        const wantSeg = (e.faceAng || 0) - ART_HEAD;
        let df = wantSeg - (e.faceRot||0);
        df = Math.atan2(Math.sin(df), Math.cos(df));
        const st = Math.min(Math.abs(df), (e.turnRate||9)*dt);
        e.faceRot = ((e.faceRot||0) + Math.sign(df)*st + Math.PI*4) % (Math.PI*2);
      } else {
      const fax = player.x - e.x, fay = player.y - e.y;
      e.faceAng = Math.atan2(fay, fax);
      // 会动 + 索敌中 → 头对着花朵；不动的生物平时不转，
      // 但「会攻击的静止生物」（蒲公英这类）在开火/索敌时也要把脸转过来
      const attacker = !!(e.def && (e.def.atk || e.def.zap || e.def.onHitShoot));
      const looking = (e.lookT > 0) || (e.aggroOn && (mobile || attacker));
      let want = (e.faceRot || 0);          // 默认保持原朝向
      if(canHead && looking){
        // 黄蜂（Hornet）：平时触角朝花朵；只有射针前 0.5s 才转身，
        // 让屁股上的刺对准花朵（e.tailAim 由 shooter AI 在开火前 0.5s 置位）
        const tailAim = !!(e.def && e.def.tailShot && e.tailAim);
        want = (tailAim ? e.faceAng + Math.PI : e.faceAng) - ART_HEAD;
      } else if(canHead && mobile && (e.stepSpd || 0) > 4){
        // 没在索敌、但正在走：脸朝「前进方向」（原作里怪走路时都是朝着走的）
        want = (e.wanderA != null ? e.wanderA : e.faceAng) - ART_HEAD;
      }
      let diff = want - (e.faceRot||0);
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));       // 最短弧
      const step = Math.min(Math.abs(diff), (e.turnRate||7.5)*dt);
      e.faceRot = ((e.faceRot||0) + Math.sign(diff)*step + Math.PI*4) % (Math.PI*2);
      if(e.def && e.def.tailShot && e.rotLog && e.rotLog.length < 160) e.rotLog.push(+(e.faceRot*57.3).toFixed(1));
      }
    }
    // 伤害飘字合流
    if(e._txtT > 0){
      e._txtT -= dt;
      if(e._txtT <= 0){
        const v = e._txtAcc || 0;
        if(v > 0.5){
          const sz = 11 + Math.min(9, Math.log10(1+v)*3.2);
          // 伤害飘字：显示完整数值（不再 1.2K / 3M 这样省略）
          addText(e.x, e.y - e.r*0.75, '' + Math.round(v), '#ffffff', sz, 0.8, true);
        }
        e._txtAcc = 0;
      }
    }
    // 中毒：绿色的持续伤害（每 0.45s 冒一个数字） + 身上泛绿
    if(e.poison){
      e.hp -= e.poison.dps*dt;
      e.poison.time -= dt;
      e.poisonTickT = (e.poisonTickT||0) - dt;
      if(e.poisonTickT <= 0){
        e.poisonTickT = 0.45;
        addText(e.x + (Math.random()-0.5)*e.r, e.y - e.r*0.4,
                Math.round(e.poison.dps*0.45), '#a5ff5e', 11, 0.7, true);
      }
      if(e.poison.time<=0) e.poison=null;
    }
    // 减速
    if(e.slowT > 0){ e.slowT -= dt; if(e.slowT <= 0) e.slowMul = 1; }
    if(e.weakenT > 0) e.weakenT -= dt;
    if(e.glowT>0) e.glowT -= dt;
    // 便便光环：附近的怪失去仇恨并变慢（wiki：Poo 让怪不想靠近）
    if(pooR > 0 && !e.def.titan){
      const dp = Math.hypot(player.x-e.x, player.y-e.y);
      if(dp < pooR){
        if(e.aggroOn){ e.aggroOn = false; e.aggroDrop = 0.6; }
        e.slowMul = Math.min(e.slowMul||1, 0.65); e.slowT = 0.35;
      }
    }
    const ex = player.x - e.x, ey = player.y - e.y;
    const d = Math.hypot(ex,ey)||1;
    const nx = ex/d, ny = ey/d;

    const _px0 = e.x, _py0 = e.y;
    updateMobAI(e, dt, d, nx, ny);

    // 击退位移（阻尼滑行）+ 永远收在地图边界内
    // 蜈蚣身体节：位置锁在链条轨迹上，不吃击退（否则会在轨迹内外来回抖 = 漂移）
    if(e.leaderSeg){ e.kbx = 0; e.kby = 0; }
    else stepKnock(e, dt);
    clampMobBounds(e);

    // 这一帧真正走了多远 → 步态相位 / 翅膀扇动频率都跟着它，停下来动画就停
    const _step = Math.hypot(e.x-_px0, e.y-_py0);
    e.stepSpd = _step / Math.max(dt, 1e-4);
    e.gait = (e.gait||0) + _step * 0.070;
    // ?partmob=<key> 调试：把怪钉在原地只播步态动画（截图比对用）
    if(DBG.partMob && e.key === DBG.partMob){
      e.stepSpd = 100; e.gait += dt*6.0;
      e.x = _px0; e.y = _py0;
    }

    // 脱战：追太远就放弃（wiki：怪只在索敌范围内追，跑远了会回去）
    const AR = e.aggroR || aggroRadius(e);
    // wiki：蜘蛛「不会停止追击当前目标，直到目标或它自己死亡」——这类不脱战
    if(e.aggroOn && e.ai !== 'still' && !(e.def && e.def.noLeash) && d > AR*1.75){
      e.leashT = (e.leashT||0) + dt;
      if(e.leashT > 2.2){ e.aggroOn = false; e.leashT = 0; }
    } else e.leashT = 0;

    // 卡墙兜底：离得远又动不了就换个位置
    if(e.ai!=='still' && d > 360 && e.spawnT<=0 && e._px!=null){
      const moved = Math.hypot(e.x-e._px, e.y-e._py);
      if(moved < e.speed*dt*0.2){
        e.stuck = (e.stuck||0) + dt;
        if(e.stuck > 1.8){
          const spot = randomFreeSpot(player.x, player.y, 460, 760, 10);
          if(spot){ e.x = spot.x; e.y = spot.y; }
          e.stuck = 0;
        }
      } else e.stuck = 0;
    }
    // 太远就回收（刷怪点会补新的），避免怪物越积越多拖慢帧率
    if(d > 3200 && !e.def.npc && e.spawnT<=0 && !e.kbTest){
      e.removed = true; enemies.splice(ei,1);
      continue;
    }
    e._px = e.x; e._py = e.y;

    // contact with the body (contact radius = the drawn body radius)
    if(DBG.pinMob && e.key === DBG.pinMob){ e.x = player.x + 20; e.y = player.y + 6; }
    // 接触伤害：贴图形状命中为主；再用「形状方向半径」兜底（怪被顶在
    // 形状半径 + 0.92R 的位置上，圆形兜底会让长条怪远远地就咬到花朵）
    let bodyTouch = mobTouchesDisc(e, player.x, player.y, PLAYER_R);
    if(!bodyTouch && d < e.r + PLAYER_R && d > 1e-4){
      const inv = 1/d;
      bodyTouch = d < mobSupportR(e, -(e.x-player.x)*inv, -(e.y-player.y)*inv) + PLAYER_R*0.95;
    }
    if(bodyTouch && e.atkCd<=0){
      e.atkCd = 0.2;   // 近战生物攻击间隔：咬一口后 0.2s 才能再咬（用户要求）
      if(!e.def.npc){
        const hitDmg = e.dmg * (e.weakenT>0 ? 0.6 : 1);
        damagePlayer(hitDmg);
        // 生物攻击带击退：花朵被顶开（体型越大推得越远）
        knockPlayer(e.x, e.y, 150 + (e.r || 16)*3.2);
        // 反伤：仙人掌这类花瓣会扎回去
        if(player.thorn > 0) hurtEnemy(e, hitDmg*player.thorn);
        // 萤火虫/魔法萤火虫：撞上就放电
        if(e.def.zapOnContact){
          zaps.push({x1:e.x, y1:e.y, x2:player.x, y2:player.y, t:0, life:0.16});
          damagePlayer(e.dmg*0.45);
        }
        // body damage to enemy + body toxicity poison
        const bodyDmg = player.bodyDmg || BASE_BODY_DMG;
        hurtEnemy(e, bodyDmg);
        if(player.bodyToxicity){
          const dps = 0.6*bodyDmg*player.poisonMult;
          e.poison = {dps, time: 1*player.poisonDurMult};
        }
        // 撞花时被弹开一点（同样走滑行动画）
        knockMob(e, Math.atan2(e.y-player.y, e.x-player.x), 14);
        e.lookT = 1.1;             // 咬到花朵了：接下来 1.1s 头/触角朝向花朵
      }
    }
    // contact with summons
    if(e.atkCd<=0 && !e.def.npc){
      for(const s of summons){
        if(s.dead) continue;
        if(Math.hypot(e.x-s.x, e.y-s.y) < e.r + SUMMON_R && mobTouchesDisc(e, s.x, s.y, SUMMON_R)){
          hitSummon(s, e.dmg*0.6);
          e.atkCd = 0.5;
          break;
        }
      }
    }
  }

  // ---------- 生物之间不重叠 ----------
  separateMobs(dt);

  // ---------- 怪物投射物 ----------
  for(let i=eproj.length-1;i>=0;i--){
    const p = eproj[i];
    if(p.wave){
      // 黄蜂的蜂刺走弧线：横向加个正弦摆动
      const a = Math.atan2(p.vy, p.vx) + Math.sin(p.life*9+p.phase)*0.9*0.016;
      const sp = Math.hypot(p.vx, p.vy);
      p.vx = Math.cos(a)*sp; p.vy = Math.sin(a)*sp;
    }
    p.x += p.vx*dt; p.y += p.vy*dt; p.life -= dt;
    if(p.life<=0){ eproj.splice(i,1); continue; }
    if(blockedAt(p.x, p.y, 2)){ eproj.splice(i,1); continue; }
    if(Math.hypot(p.x-player.x, p.y-player.y) < PLAYER_R + p.r){
      damagePlayer(p.dmg);
      knockPlayer(p.x, p.y, 120);                   // 被弹射物打中也有击退
      puffs.push({x:p.x, y:p.y, t:0, life:0.25, r:p.r*2.2, col:'#ffd54f'});
      eproj.splice(i,1); continue;
    }
    let hitS = false;
    for(const s of summons){
      if(s.dead) continue;
      if(Math.hypot(p.x-s.x, p.y-s.y) < SUMMON_R + p.r){ hitSummon(s, p.dmg*0.7); hitS = true; break; }
    }
    if(hitS) eproj.splice(i,1);
  }

  // ---------- 特效 ----------
  for(let i=zaps.length-1;i>=0;i--){ zaps[i].t += dt; if(zaps[i].t>=zaps[i].life) zaps.splice(i,1); }
  for(let i=puffs.length-1;i>=0;i--){ puffs[i].t += dt; if(puffs[i].t>=puffs[i].life) puffs.splice(i,1); }
  // 回血花瓣：内置缓动飞向花朵，落点瞬间才真正加血（视觉上「花瓣飞进花里 → 变透明 → 回血」）
  for(let i=healFx.length-1;i>=0;i--){
    const f = healFx[i];
    f.t += dt;
    const k = Math.min(1, f.t/f.life);
    const e = k*k*(3-2*k);                     // smoothstep：先慢后快再收住
    f.x = f.sx + (player.x - f.sx)*e;
    f.y = f.sy + (player.y - f.sy)*e;
    f.k = k;
    if(k >= 1){
      // 只有动画播到这里（花瓣落进花朵）才真正加血；加完立刻进冷却
      if(f.amt > 0) healPlayer(f.amt);
      puffs.push({x:player.x, y:player.y, t:0, life:0.30, r:PLAYER_R*2.2, col:'#8ce99a'});
      if(f.petal){
        const rl = (f.petal.def && f.petal.def.reload != null) ? f.petal.def.reload : 1000;
        f.petal.cd = (rl/1000);   // 回血花瓣的使用间隔不吃 Golden Leaf 减免（只减装填）
      }
      healFx.splice(i,1);
    }
  }
  updateTexts(dt);

  updateSummons(dt);

  // petal combat (same orbit radius the renderer uses, world units)
  const orbitR = PLAYER_ORBIT + player.orbitBonus + (player.spread||0)*ORBIT_SPREAD - (player.tuck||0)*PLAYER_ORBIT*0.45
               + PLAYER_BODY*(player.flowerAreaCur||0)/320;   // 花变大 → 轨道同步外扩，花边到花瓣距离不变
  // 耐久：碎掉的花瓣在冷却，冷却结束后带着满耐久重新长出来。
  // 注意：没碎的花瓣不再自动回复耐久（用户要求）—— 掉一点就少一点，只能靠碎掉重生补满。
  for(const p of player.equipped){
    if(!p) continue;
    // ---- Wax：不参与轨道；蜡碎掉后 broken 装填（与其它花瓣同一套冷却动画），装填完重新部署 ----
    if(p.def && p.def.cat === 'wax' && p._wax && (p._wax.dead || p._wax.hp <= 0)){
      p._wax = null;
      p.broken = 30 * (player.reloadMult||1);   // 装填（吃 Golden Leaf 减免）
      p._reloadTotal = p.broken;
      renderInventory();                        // 立即显示冷却扇形动画
    }
    if(p.def && p.def.cat === 'clay') p._travel = (p._travel||0) + stepLen;
    if(p._flyT > 0) p._flyT = Math.max(0, p._flyT - dt);
    if(p.broken>0){
      p.broken -= dt;
      if(p.broken<=0){
        p.broken = 0;
        p.dur = p.maxDur;
        p.cd = 0;
      }
    } else if(p.maxDur>0 || (p.def && p.def.cat === 'wax')){
      if(p.hitT>0)   p.hitT   -= dt;
      if(p.flashT>0) p.flashT -= dt;
      // 自动回复耐久已删除：没碎的花瓣耐久不会自己涨回去
    }
    // Bubble：破裂推进（抽成函数，主槽副槽都跑）
    stepBubblePetal(p, dt);
    // Wax：装填完毕且蜡不在场上 → 部署一枚新蜡
    if(p.def && p.def.cat === 'wax' && p.broken <= 0 && !p._wax){
      const wr = (p.def.waxRadius || 30) * (PLAYER_R/25);
      const pad = wr + 4;
      const mbx = Math.max(0, boundX - pad), mby = Math.max(0, boundY - pad);
      let sx = Math.max(-mbx, Math.min(mbx, player.x));
      let sy = Math.max(-mby, Math.min(mby, player.y));
      for(let t=0; t<16; t++){
        const a = t/16*6.2832;
        const tx = player.x + Math.cos(a)*(PLAYER_R + wr + 10);
        const ty = player.y + Math.sin(a)*(PLAYER_R + wr + 10);
        const cx2 = Math.max(-mbx, Math.min(mbx, tx)), cy2 = Math.max(-mby, Math.min(mby, ty));
        if(!blockedAt(cx2, cy2, wr)){ sx = cx2; sy = cy2; break; }
      }
      const w = { x: sx, y: sy, r: wr, hp: p.def.waxHealth || 1000, maxHp: p.def.waxHealth || 1000,
                  owner: p, hitFlash: 0, hitCd: 0, dead: false };
      waxSummons.push(w); p._wax = w;
    }
  }
  // ?duel= 调试木桩：每帧钉回花朵旁边，保证花瓣一定能碰到（数值验证用）
  for(const e of enemies){ if(e.duelFollow){ e.x = player.x + 46; e.y = player.y; } }
  const active = getActivePetals();
  const n = active.length;
  const hitR = 11*FLOWER_SCALE + player.reachAdd;   // 只放宽一点，保持贴图形状
  // Clay 用：这一帧玩家自己走了多远
  const stepLen = Math.hypot(player.x - (player._lastX != null ? player._lastX : player.x),
                             player.y - (player._lastY != null ? player._lastY : player.y));
  player._lastX = player.x; player._lastY = player.y;  // 花瓣吸附半径（原作属性 petal attraction range）：范围内有生物，花瓣会被拉过去
  const attractBase = 52 + (player.attractR||0);
  // 吸附用指数缓动逼近目标偏移：花瓣被「拉」过去、目标消失后又自己滑回轨道，
  // 而不是一帧瞬移。A_EASE = 吸过去，A_BACK = 回弹。
  const A_EASE = 1 - Math.exp(-dt*9.0);
  const A_BACK = 1 - Math.exp(-dt*6.5);
  active.forEach((p,k)=>{
    if(p.broken>0){ p.latchE = null; return; }         // 碎了：松口，这一圈里空出来
    let ang = player.petalAngle + k*(2*Math.PI/Math.max(n,1));
    // Cogwheel：公转按 60° 跳格（wiki：moves in steps of 60º）
    if(player.cogStep) ang = Math.round(ang / player.cogStep) * player.cogStep;
    const bx = player.x + Math.cos(ang)*orbitR;        // 轨道上的原始位置
    const by = player.y + Math.sin(ang)*orbitR;
    const d = p.def;
    let ox = 0, oy = 0;                                // 吸附偏移目标
    if(d.cat==='melee'){                                // Sawblade 可吸附（整体移动、不变形张开）
      let best=null, bd=1e9;
      for(const e of enemies){
        if(e.hp<=0) continue;
        const dd = Math.hypot(e.x-bx, e.y-by);
        if(dd < attractBase + e.r && dd < bd){ bd=dd; best=e; }
      }
      if(best){
        // 越近吸得越狠；最多把花瓣拉出 62% 的距离
        const kk = Math.min(0.62, Math.max(0.30, 1 - bd/(attractBase + best.r)));
        // 只有「拉过去之后真的够得着（能打到）」才吸附，否则花瓣老实待在轨道上
        if(bd*(1-kk) <= best.r + PETAL_SIZE*0.6){
          ox = (best.x - bx)*kk;
          oy = (best.y - by)*kk;
        }
      }
    }
    if(p._ax == null){ p._ax = 0; p._ay = 0; }
    const back = (ox === 0 && oy === 0);
    const f = back ? A_BACK : A_EASE;
    p._ax += (ox - p._ax)*f;
    p._ay += (oy - p._ay)*f;
    if(Math.abs(p._ax) < 0.05) p._ax = 0;
    if(Math.abs(p._ay) < 0.05) p._ay = 0;
    let px = bx + p._ax, py = by + p._ay;
    // ---- 附着（咬住）： melee 花瓣打中生物后粘在那只生物上持续输出，
    //      直到生物死亡或花瓣耐久耗尽碎掉才松口回轨道 ----
    if(d.cat==='melee' && p.latchE){
      const le = p.latchE;
      if(le.hp<=0 || le.dying!=null || le.removed){ p.latchE = null; }
      else{
        const ang0 = Math.atan2(p.latchOy||0, p.latchOx||1);
        const rr = Math.max(le.r*0.9, Math.hypot(p.latchOx||0, p.latchOy||0)*0.999);
        px = le.x + Math.cos(ang0)*rr;
        py = le.y + Math.sin(ang0)*rr;
        p._ax = 0; p._ay = 0;                       // 吸附偏移清零，位置完全跟生物
      }
    }
    // Faster：无规则小规模移动（幅度更大、位置随机、节奏稍慢）
    if(p.name==='Faster' && !p.latchE){
      p._jT = (p._jT||0) - dt;
      if(p._jT <= 0){
        p._jT = 0.05 + Math.random()*0.07;
        p._jtx = (Math.random()-0.5)*14;
        p._jty = (Math.random()-0.5)*14;
      }
      p._jx = (p._jx||0) + ((p._jtx||0) - (p._jx||0)) * Math.min(1, dt*26);
      p._jy = (p._jy||0) + ((p._jty||0) - (p._jy||0)) * Math.min(1, dt*26);
      px += p._jx; py += p._jy;
    }
    p._x=px; p._y=py; p._ang=ang;
    emitTrail(p, px, py, ang, dt);
    if(player.inBush) return;        // 密道里所有花瓣都处于「不可使用」状态
    // 花瓣也能攻击弹射物：黄蜂的刺、豌豆、毒刺… 碰到花瓣就一起消失（顺便掉一点耐久）
    for(let pi = eproj.length-1; pi >= 0; pi--){
      const pr = eproj[pi];
      if(Math.hypot(pr.x - px, pr.y - py) > hitR + pr.r) continue;
      eproj.splice(pi, 1);
      puffs.push({x:pr.x, y:pr.y, t:0, life:0.22, r:pr.r*2.1, col:'#b3e5fc'});
      wearPetal(p, { dmg: Math.max(2, (pr.dmg || 4) * 0.35) }, 1);   // 挡一下也要磨耐久
      DBG.blocked = (DBG.blocked||0) + 1;
    }
    if(d.name === 'Peas'){
      // Peas：这朵花本来就是「4 颗豌豆拼起来」的，用的时候这 4 颗各自朝
      // 四个方向飞出去（绕圈的整片暂时消失，等冷却好了再长回来）；
      // 没射出去的时候跟普通近战花瓣一样，贴着怪就能打
      if(p._fireCd == null) p._fireCd = 0;
      if(p._out == null) p._out = 0;
      if(p._fireCd > 0) p._fireCd -= dt;
      if(p._out > 0) p._out -= dt;
      if((player.firePeas || player.autoPeas) && p._fireCd <= 0 && p._out <= 0){
        // 4 颗各自从「它在四叶草上的那个位置」沿同一条方向飞出去 ——
        // 画面上就是这朵豌豆当场散开成 4 颗，而不是整朵消失再冒出 4 个点
        const cx = (p._x != null ? p._x : player.x);
        const cy = (p._y != null ? p._y : player.y);
        const rot  = (p._ang || 0) + Math.PI/2;      // 跟 drawPetals 里的旋转一致
        const ca = Math.cos(rot), sa = Math.sin(rot);
        const peaR = 5.6*FLOWER_SCALE;
        const peaOff = 5.4*FLOWER_SCALE;
        const arms = [[0,-1],[1,0],[0,1],[-1,0]];    // 上 / 右 / 下 / 左（贴图坐标系）
        for(const [ux,uy] of arms){
          const wx = ux*ca - uy*sa, wy = ux*sa + uy*ca;
          projectiles.push({x:cx + wx*peaOff, y:cy + wy*peaOff,
                            vx:wx*470, vy:wy*470,
                            dmg:d.dmg*player.dmgMult, life:0.95, r:peaR,
                            type:d.name, pea:true, rarity:p.rarity,
                            sup:(RARITIES.indexOf(p.rarity) >= RARITIES.indexOf('Super')),
                            owner:p, pierce:0, hits:0, hitSet:null});
        }
        p._fireCd = ((d.reload||1400)/1000);   // 开火间隔不吃 Golden Leaf 减免（只减装填）
        p._out = 1.0;                                       // 4 颗都飞出去了，轨道上先不画
        if(p.maxDur > 0) p.dur = Math.max(1, p.dur - 1);     // 射一次磨一点耐久
        DBG.peas = (DBG.peas||0) + 4;
      }
    }
    if(d.cat==='melee' || d.cat==='heal'){
      // 找一圈里第一只碰到的生物；已经咬住的花瓣无视几何判定，持续输出那只
      let target=null;
      if(p.latchE && p.latchE.hp>0 && !p.latchE.removed){ target = p.latchE; }
      else {
        for(const e of enemies){
          if(e.hp<=0) continue;
          if(mobTouches(e, px, py, hitR)){ target=e; break; }
        }
      }
      p.cd -= dt;
      if(d.name === 'Peas' && p._out > 0) return;      // 4 颗都飞在外面，轨道上没有实体
      DBG.mCd = p.cd; DBG.mTgt = !!target; DBG.mT = (DBG.mT||0)+1;
      if(d.cat==='heal'){
        // ---- 回血花瓣（原作）：跟撞不撞怪无关 —— 只要花朵没满血、冷却好了，
        //      花瓣就脱离轨道飞进花朵，落点变透明并回血；满血时待命不动 ----
        if(target) wearPetal(p, target, 0.5);          // 贴到生物身上照样会被磨损
        if(p._flyT > 0) return;                        // 正在飞：动画播完才进冷却
        if(p.cd > 0) return;
        if(player.hp < player.maxHp - 0.05 && (d.heal > 0 || d.regen > 0)){
          const amt = d.heal || 0;
          healFx.push({sx:px, sy:py, x:px, y:py, t:0, life:0.30, amt, petal:p,
                       name:d.name, rarity:p.rarity, ang:Math.atan2(player.y-py, player.x-px)});
          p._flyT = 0.30;                       // 飞出去的这段时间里，轨道上不再画这片花瓣
        } else {
          p.cd = 0.12;                          // 满血 → 每帧待命检查
        }
        return;
      }
      if(p.cd>0) return;
      if(!target){ p.cd = 0.02; return; }
      {
        // ---- 近战花瓣：伤害 + 毒/减速/吸血/暴击/击退/挑衅 ----
        let dmg = d.dmg * player.dmgMult;
        let crit = false;
        if(d.crit && Math.random() < d.crit){ dmg *= 2; crit = true; }
        // Bean：附近没有友方单位时伤害 ×1.2
        if(d.ab === 'solo' && player.soloBonus){
          let friendly = false;
          for(const f of enemies){ if(f.ai === 'friendly' && f.hp > 0){ friendly = true; break; } }
          if(!friendly) dmg *= (1 + player.soloBonus);
        }
        // Claw：目标血量 >80% 时额外 +50% 伤害
        if(d.ab === 'claw' && target.maxHp > 0 && target.hp/target.maxHp > (d.abCfg.below||0.8)){
          dmg *= (1 + (d.abCfg.val||0.5));
        }
        // Domino：每次伤害随机 0~上限
        if(d.ab === 'domino') dmg = Math.random() * (d.randMax || dmg);
        // Dice：小概率打出 35 倍伤害（幸运越高越容易）
        if(d.ab === 'dice' && Math.random() < (d.abCfg.p||0.01) * (1 + (player.luck||0))){
          dmg *= (d.abCfg.mult||35);
          crit = true;
          addText(target.x, target.y - target.r - 26, '35x!', '#fff176', 13, 0.9);
        }
        // Clay：伤害随「装填后玩家移动距离」增加，有上限
        if(d.ab === 'clay'){
          const cap = (d.abCfg.max || 70) * (RARITY_MULT[p.rarity] || 1);
          const t = Math.min(1, (p._travel || 0) / 900);
          dmg = Math.min(cap, dmg + (cap - dmg) * t);
        }
        const dealt = hurtEnemy(target, dmg);
        if(crit) addText(target.x, target.y - target.r - 12, 'CRIT', '#ffd54f', 11, 0.6);
        petalOnHit(d, target, dealt);
        wearPetal(p, target, 1.0);
        // 咬住：从现在起这片花瓣粘在生物上持续输出，直到生物死亡或花瓣碎掉
        if(!p.latchE){ p.latchE = target; p.latchOx = px - target.x; p.latchOy = py - target.y; }
      }
      // 只等一个很短的接触间隔（可以连续打）；真正的「冷却」是碎掉后的重生时间
      p.cd = HIT_GAP;
      p._travel = 0;                                  // Clay：打中后距离清零重新累计
      DBG.mhits = (DBG.mhits||0) + 1;
    } else if(d.cat==='ranged'){
      p.cd -= dt;
      if(p.cd<=0){
        // nearest enemy
        let best=null,bd=1e9;
        for(const e of enemies){ const dd=Math.hypot(e.x-player.x,e.y-player.y); if(dd<bd){bd=dd;best=e;} }
        if(best && bd<560+player.reachAdd){
          const a=Math.atan2(best.y-player.y, best.x-player.x);
          const sp=420;
          // owner：投射物记住自己是哪片花瓣打出去的，命中后要扣这片花瓣的耐久
          projectiles.push({x:player.x,y:player.y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,
                            dmg:d.dmg*player.dmgMult,life:1.6,r:7*FLOWER_SCALE,type:d.name,
                            owner:p, pierce:(d.pierce||0), hits:0, hitSet:null});
          p.cd = ((d.reload||900)/1000);   // 发射间隔不吃 Golden Leaf 减免（只减装填）
        } else p.cd = 0.15;
      }
    }
  });
  player.firePeas = false;         // 一次按键只算一次（按住会由 keydown 重复触发）

  // projectiles（穿透：Laser / Missile 之类可以穿过好几只怪）
  for(let i=projectiles.length-1;i>=0;i--){
    const pr=projectiles[i];
    pr.x+=pr.vx*dt; pr.y+=pr.vy*dt; pr.life-=dt;
    let hit=null;
    for(const e of enemies){
      if(e.hp<=0) continue;
      if(mobTouches(e, pr.x, pr.y, pr.r)){
        if(!pr.hitSet) pr.hitSet = new Set();
        if(pr.hitSet.has(e)) continue;
        pr.hitSet.add(e);
        const dealt = hurtEnemy(e, pr.dmg);
        if(pr.owner && pr.owner.def) petalOnHit(pr.owner.def, e, dealt);
        if(!hit) hit=e;
        if(pr.pierce>0){ pr.pierce--; }
        else { pr.life = -1; break; }
      }
    }
    // 远程花瓣打中生物也要磨损（擦伤：只吃 55% 的生物伤害）
    if(hit && pr.owner) wearPetal(pr.owner, hit, 0.55);
    if(pr.life<=0) projectiles.splice(i,1);
  }

  stepZoom(dt);                      // 视野缩放缓动
  stepPanelScroll(dt);               // 面板滚轮平滑滚动
  stepReloadWipes(dt);               // 主槽冷却斜切动画
  updateDurBars();                   // 槽位耐久条（只改宽度，交给 CSS 过渡）
  updatePollen(dt);                  // 留在地上的花粉每秒结算两次
  for(let i=petalVanish.length-1;i>=0;i--){
    petalVanish[i].t += dt;
    if(petalVanish[i].t >= petalVanish[i].life) petalVanish.splice(i,1);
  }

  // drops / pickup
  for(let i=drops.length-1;i>=0;i--){
    const dr=drops[i];
    dr.age+=dt;
    // wiki：掉落物按稀有度停留不同时长（Common 30s → Ultra 210s），超时消失
    const life = DROP_LIFE[dr.rarity] || 30;
    if(dr.age > life){ drops.splice(i,1); continue; }
    const dd=Math.hypot(player.x-dr.x, player.y-dr.y);
    DBG.dropD = Math.min(DBG.dropD == null ? 1e9 : DBG.dropD, dd);
    // 掉落物老老实实躺在地上，不再跟着花朵被吸来吸去（用户要求）
    if(dd < 15){
      DBG.picks = (DBG.picks||0) + 1;
      // 有空格子就直接装上（用户要求），格子满了才丢进背包
      let eq = false;
      try { eq = equipIntoEmptySlot(dr.name, dr.rarity); }
      catch(err){ DBG.pickErr = String(err && err.message || err); }
      if(eq) DBG.equips = (DBG.equips||0) + 1;
      if(!eq){
        if(player.backpack.length<BAG_MAX) player.backpack.push({name:dr.name,rarity:dr.rarity});
      }
      drops.splice(i,1);
      invDirty = true;                     // 批量：一帧内多次拾取只重建一次 UI（不再卡顿）
    }
  }
  if(invDirty){ invDirty = false; renderInventory(); }

  // remove dead enemies, drop loot from their table
  for(let i=enemies.length-1;i>=0;i--){
    if(enemies[i].hp<=0){
      const e=enemies[i];
      // 死亡动画：轻微放大 + 淡出（0.1s，一闪而过），播完才结算经验/掉落
      if(e.dying == null) e.dying = 0.1;
      e.dying -= dt;
      if(e.dying > 0) continue;
      // 木乃伊甲虫：血条空了还能撑一会儿才倒下
      if(e.def.undead && e.undeadT<0){
        e.undeadT = e.def.undead; DBG.undead++;
        continue;
      }
      if(e.undeadT>0){ e.undeadT -= dt; continue; }
      DBG.deaths++;
      gainXp(e.xp);
      pushKill(e.def ? e.def.name : (e.name || e.key));   // 击杀提示
      // Mob Gallery：记下「杀死过哪种怪、什么稀有度、几次」
      if(e.key && e.mobRarity && !e.noGallery){
        const gk = e.key + '|' + e.mobRarity;
        player.gallery[gk] = (player.gallery[gk] || 0) + 1;
      }
      // 蜈蚣断节：只有「头」被打死时，紧跟着那节才变成新的头（wiki 原话）；
      // 中间的身子被打死只是把前后接上，不会凭空再冒出一个头（否则屏幕上会有两个头）
      if(e.def && e.def.chain){
        const nxt = enemies.find(o=>o.leaderSeg === e);
        if(nxt && nxt.hp > 0){
          if(e.isHead){
            nxt.leaderSeg = null; nxt.isHead = true; nxt.sprite = 'Centipede_Head';
            nxt.segIdx = 0; nxt.aggroOn = true; nxt.aggroR = aggroRadius(nxt);
            // 无缝接管：继承原头的行进方向与轨迹，身体沿原曲线继续走，不会瞬移重组
            nxt.wanderA = (e.wanderA != null) ? e.wanderA : (nxt.faceAng || 0);
            nxt.faceAng = (e.faceAng != null) ? e.faceAng : nxt.faceAng;
            nxt.faceRot = (e.faceRot != null) ? e.faceRot : nxt.faceRot;
            nxt.homeX = nxt.x; nxt.homeY = nxt.y;
            nxt.chainRoot = nxt;
            nxt._path = (e._path && e._path.length) ? e._path.slice(0, 80) : [{x:nxt.x, y:nxt.y}];
            puffs.push({x:nxt.x, y:nxt.y, t:0, life:0.35, r:nxt.r*2.2, col:'#e8d3a6'});
            renumberChain(nxt);
          } else {
            nxt.leaderSeg = e.leaderSeg || null;
            renumberChain(nxt.chainRoot || nxt);
          }
        }
      }
      // 巢穴/蛋的亡语：炸出一窝小的
      const ods = e.def.onDeathSpawn;
      if(ods && Math.random() < (ods.chance==null?1:ods.chance)){
        for(let k=0;k<ods.n;k++) spawnAdd(e, ods.keys[(Math.random()*ods.keys.length)|0], k/ods.n*6.28, e.r+10);
      }
      // 蚁巢有概率爆出挖掘者
      if(e.def.diggerChance && Math.random() < e.def.diggerChance) spawnAdd(e, 'digger', null, e.r+14);
      // 泡泡破裂把周围推开
      if(e.def.popPush){
        DBG.pops++;
        puffs.push({x:e.x, y:e.y, t:0, life:0.45, r:e.r*4, col:'#9fe8ff'});
        const dd = Math.hypot(player.x-e.x, player.y-e.y);
        if(dd < e.r*4+PLAYER_R){
          const a = Math.atan2(player.y-e.y, player.x-e.x);
          player.x += Math.cos(a)*26; player.y += Math.sin(a)*26;
        }
        for(const o of enemies){
          if(o===e) continue;
          const d2 = Math.hypot(o.x-e.x, o.y-e.y);
          if(d2 < e.r*4){ const a=Math.atan2(o.y-e.y,o.x-e.x); o.x+=Math.cos(a)*18; o.y+=Math.sin(a)*18; }
        }
      }
      // build candidate drop list (base drops + rarity-gated rare drops)
      const cand = e.drops ? e.drops.slice() : [];
      const ridx = MOB_RARITY.indexOf(e.mobRarity);
      if(e.rareDrops){ for(const rd of e.rareDrops){ if(MOB_RARITY.indexOf(rd.min) <= ridx) cand.push(rd.p); } }
      // 掉落稀有度：以怪自身的稀有度为准，小概率往上抬一档
      // （wiki 更新日志：「生物最多只能掉落高于自身一稀有度的花瓣」，
      //   Ant Egg 的表就是 Common 怪 59.8% 掉 Common / 16.4% 掉 Unusual）
      // 注意：Super / Eternal 怪一样会掉，之前误加了「Super 以上不掉」的规则，
      //       导致打死 Super 什么都不爆。
      // 掉出来的花瓣是什么稀有度：查 wiki 的那张分布表（不是简单「抬一档」）
      const upRar = ()=> rollDropRarity(e.mobRarity);
      const tbl = (typeof DROP_TABLE === 'object' && DROP_TABLE[e.key]) ? DROP_TABLE[e.key] : null;
      const dropAt = (nm, rar)=>{
        // 掉落物之间不许重叠：在尸体周围找一个离其它掉落物够远的点
        let px = e.x, py = e.y;
        const need = 26;                       // 两个掉落卡片中心的最小间距
        for(let k=0;k<16;k++){
          const a = Math.random()*6.283, r = 10 + Math.random()*30;
          const tx = e.x + Math.cos(a)*r, ty = e.y + Math.sin(a)*r;
          let bad = false;
          for(const o of drops){ if(Math.hypot(o.x-tx, o.y-ty) < need){ bad = true; break; } }
          if(!bad){ px = tx; py = ty; break; }
        }
        const ds = dropSpot(px, py);
        drops.push({ name:nm, rarity:rar, x:ds.x, y:ds.y, age:0 });
      };
      {
        // 稀有度越高，掉得越稳、越可能多爆几片。
        // 原作里 Super / Eternal 基本是「必掉」，不然千辛万苦打死一只稀有怪
        // 结果地上什么都没有，体验很差（用户反馈过）。
        const dropMul = 1 + Math.max(0, ridx) * 0.45;
        let dropped = 0;
        const exact = (typeof MOB_DROPS_EXACT === 'object' && MOB_DROPS_EXACT[e.key])
                    ? MOB_DROPS_EXACT[e.key][e.mobRarity] : null;
        if(exact){
          // 有逐档官方表：每片花瓣先按「各档概率之和」判定掉不掉，
          // 掉了再按各档数值归一化决定稀有度（跟官方面板上的百分比完全对应）
          for(const [nm, tiers] of exact){
            let tot = 0;
            for(const [, p2] of tiers) tot += p2;
            if(!(tot > 0) || Math.random() >= Math.min(1, tot)) continue;
            let x = Math.random()*tot, pick = tiers[tiers.length-1][0];
            for(const [r2, p2] of tiers){ x -= p2; if(x <= 0){ pick = r2; break; } }
            dropAt(nm, pick); dropped++;
          }
        } else if(tbl){
          // 官方掉落表：每一项都有自己的概率，逐项独立判定
          for(const [nm, ch] of tbl){
            if(Math.random() < Math.min(1, ch*dropMul)){ dropAt(nm, upRar()); dropped++; }
          }
        } else if(cand.length){
          // 没有官方表的生物：按掉落列表等概率取 1~2 片
          const dropOne = ()=>{
            const p = cand[(Math.random()*cand.length)|0];
            dropAt(p, upRar()); dropped++;
          };
          if(Math.random() < 0.72) dropOne();
          if(Math.random() < 0.32) dropOne();
        }
        // 兜底：Super 及以上至少爆一片
        if(!dropped && ridx >= MOB_RARITY.indexOf('Super')){
          const nm = tbl ? tbl.slice().sort((a,b)=>b[1]-a[1])[0][0] : (cand[0] || null);
          if(nm){ dropAt(nm, e.mobRarity); dropped++; }
        }
        // 固定稀有度的特殊掉落（例如某些怪只在 Super+ 掉某片花瓣）
        if(e.rareDrops){
          for(const rd of e.rareDrops){
            if(MOB_RARITY.indexOf(rd.min) <= ridx && Math.random() < 0.004) dropAt(rd.p, rd.min);
          }
        }
      }
      e.removed = true; enemies.splice(i,1);
    }
  }

  spawnWave(dt);
  updateHUD();
}

function hurtEnemy(e, dmg){
  if(!e || e.hp<=0) return 0;
  let d = dmg;
  // 甲壳/叶片护甲：固定减伤（黄叶虫、泡泡这类"打不动"的怪）
  if(e.armor) d = Math.max(dmg*0.12, d - e.armor*(MOB_MULT[e.mobRarity]||1)*0.35);
  // 贝壳类盾：先吃伤害
  if(e.shieldCur > 0){
    const t = Math.min(e.shieldCur, d);
    e.shieldCur -= t; d -= t; e.shieldT = 0;
  }
  e.hp -= d;
  e.hitFlash = 0.12;
  // 飘字：0.12s 内的多次命中合并成一个数字，避免糊屏
  e._txtAcc = (e._txtAcc||0) + d;
  if(!(e._txtT > 0)) e._txtT = 0.12;
  // 中立生物被打才会反击（Rare+ 之类）
  if(e.def && e.def.retaliate && !e.aggroOn){
    if(MOB_RARITY.indexOf(e.mobRarity) >= MOB_RARITY.indexOf(e.def.retaliate)) e.aggroOn = true;
  }
  // 蒲公英：被打就朝四周射种子（静止怪也要能还手）
  if(e.def && e.def.onHitShoot && (e.onHitT==null || e.onHitT<=0)){
    const cfg = e.def.onHitShoot;
    const mult = MOB_MULT[e.mobRarity]||1;
    // 花粉（Bumble Bee）：大小也随稀有度增长
    const POLLEN_R = {Common:4.5, Unusual:5.4, Rare:6.5, Epic:7.8, Legendary:9.4,
                      Mythic:11.2, Ultra:13.5, Super:16, Eternal:18, Unique:18};
    const pr = cfg.type==='pollen' ? (POLLEN_R[e.mobRarity]||5) : 5;
    DBG.shots += cfg.n;
    for(let i=0;i<cfg.n;i++){
      const a = i/cfg.n*6.28 + Math.random()*0.2;
      eproj.push({x:e.x+Math.cos(a)*e.r, y:e.y+Math.sin(a)*e.r,
                  vx:Math.cos(a)*cfg.speed, vy:Math.sin(a)*cfg.speed,
                  dmg:cfg.dmg*mult, r:pr, life:1.8, type:cfg.type, wave:0, phase:0});
    }
    e.onHitT = cfg.cd;
  }
  // 蚁巢：被打就吐蚂蚁
  if(e.def && e.def.onHitSpawn){
    e.spawnCd = (e.spawnCd||0);
    if(e.spawnCd<=0){
      const c = e.def.onHitSpawn;
      for(let i=0;i<c.n;i++) spawnAdd(e, c.keys[(Math.random()*c.keys.length)|0]);
      e.spawnCd = c.cd;
    }
  }
  // 白蚁：伤害在同类间分摊（原作的共享伤害）
  if(e.def && e.def.link && e.hp>0){
    for(const o of enemies){
      if(o===e || o.hp<=0 || !o.def || !o.def.link) continue;
      if(Math.hypot(o.x-e.x, o.y-e.y) < 120){ o.hp -= d*0.18; DBG.link++; }
    }
  }
  // 蟑螂：被打后高速撞向攻击者
  if(e.def && e.def.dashOnHit && e.hp>0){
    e.dashT = 0.6;
    e.aggroOn = true;
  }
  return d;
}

function gainXp(amount){
  player.xp += amount*player.xpMult;
  while(player.xp >= player.xpNeed){
    player.xp -= player.xpNeed;
    player.level++;
    player.xpNeed = xpForLevel(player.level);
    player.hp = player.maxHp;
    // free slot may open; ensure array size
    while(player.equipped.length<maxSlots()) player.equipped.push(null);
    flashLevel();
  }
  player.xpNeed = player.xpNeed||xpForLevel(player.level);
}
// 官方升级经验表（Level 1-300 每级所需 XP，>300 沿用 300 级）
const XP_TABLE = [15,170,300,470,630,850,1100,1400,1700,2100,2600,3100,3700,4400,5200,6100,7200,8300,9700,11000,13000,15000,17000,20000,23000,26000,30000,35000,39000,45000,51000,58000,66000,75000,85000,97000,110000,120000,140000,160000,180000,200000,230000,260000,290000,330000,370000,420000,470000,530000,590000,670000,750000,840000,950000,1100000,1200000,1300000,1500000,1700000,1900000,2100000,2400000,2600000,3000000,3300000,3700000,4200000,4600000,5200000,5800000,6500000,7300000,8100000,9100000,10000000,11000000,13000000,14000000,16000000,18000000,20000000,22000000,24000000,27000000,30000000,34000000,38000000,42000000,47000000,52000000,58000000,65000000,73000000,81000000,90000000,100000000,110000000,120000000,140000000,150000000,170000000,190000000,210000000,240000000,260000000,290000000,330000000,360000000,400000000,450000000,500000000,560000000,620000000,690000000,770000000,850000000,950000000,1100000000,1200000000,1300000000,1400000000,1600000000,1800000000,2000000000,2200000000,2500000000,2700000000,3000000000,3400000000,3700000000,4200000000,4600000000,5100000000,5700000000,6300000000,7000000000,7800000000,8700000000,9600000000,11000000000,12000000000,13000000000,15000000000,16000000000,18000000000,20000000000,22000000000,25000000000,27000000000,30000000000,34000000000,37000000000,41000000000,46000000000,51000000000,57000000000,63000000000,70000000000,77000000000,86000000000,95000000000,110000000000,120000000000,130000000000,140000000000,160000000000,180000000000,200000000000,220000000000,240000000000,270000000000,300000000000,330000000000,370000000000,410000000000,450000000000,500000000000,550000000000,610000000000,680000000000,750000000000,840000000000,930000000000,1000000000000,1100000000000,1300000000000,1400000000000,1500000000000,1700000000000,1900000000000,2100000000000,2300000000000,2600000000000,2900000000000,3200000000000,3500000000000,3900000000000,4300000000000,4800000000000,5300000000000,5900000000000,6500000000000,7200000000000,8000000000000,8900000000000,9800000000000,11000000000000,12000000000000,13000000000000,15000000000000,16000000000000,18000000000000,20000000000000,22000000000000,25000000000000,27000000000000,30000000000000,34000000000000,37000000000000,41000000000000,46000000000000,50000000000000,56000000000000,62000000000000,69000000000000,76000000000000,84000000000000,93000000000000,100000000000000,110000000000000,130000000000000,140000000000000,150000000000000,170000000000000,190000000000000,210000000000000,230000000000000,260000000000000,290000000000000,320000000000000,350000000000000,390000000000000,430000000000000,470000000000000,530000000000000,580000000000000,640000000000000,710000000000000,790000000000000,870000000000000,970000000000000,1100000000000000,1200000000000000,1300000000000000,1400000000000000,1600000000000000,1800000000000000,2000000000000000,2200000000000000,2400000000000000,2700000000000000,2900000000000000,3300000000000000,3600000000000000,4000000000000000,4400000000000000,4900000000000000,5400000000000000,6000000000000000,6600000000000000,7300000000000000,8100000000000000,9000000000000000,9900000000000000,11000000000000000,12000000000000000,13000000000000000,15000000000000000,16000000000000000,18000000000000000,20000000000000000,22000000000000000,25000000000000000,27000000000000000,30000000000000000,33000000000000000,37000000000000000,41000000000000000,45000000000000000,50000000000000000,55000000000000000,61000000000000000,68000000000000000,75000000000000000,83000000000000000,92000000000000000,100000000000000000,110000000000000000,120000000000000000];
function xpForLevel(l){ return XP_TABLE[Math.min(Math.max(1,l), XP_TABLE.length) - 1] || XP_TABLE[XP_TABLE.length-1]; }

// ---------- rendering ----------
function w2s(x,y){ return [(x-cam.x)*VIEW + W/2, (y-cam.y)*VIEW + H/2]; }

// ============================================================
//  顶部 Boss 血条（原作样式）：当 Super / Eternal / Unique 生物进入视野时，
//  屏幕正上方出现一条「名字 + 血条 + 稀有度」的横条；离开视野就隐藏。
//  血条后面留一条红色「延迟条」，挨打时先掉绿条、红条再慢慢追上来。
// ============================================================
let bbEl, bbNameEl, bbFillEl, bbGhostEl, bbRarEl, bbCur = null, bbGhostV = 1, bbLast = 0;
function initBossBar(){
  bbEl = document.getElementById('bossbar');
  bbNameEl = document.getElementById('bb-name');
  bbFillEl = document.getElementById('bb-fill');
  bbGhostEl = document.getElementById('bb-ghost');
  bbRarEl  = document.getElementById('bb-rar');
}
function updateBossBar(){
  if(!bbEl){ initBossBar(); if(!bbEl) return; }
  const now = performance.now();
  const dt = bbLast ? Math.min(0.1, (now - bbLast)/1000) : 0.016;
  bbLast = now;
  let best = null, bestScore = -1e30;
  const minIdx = MOB_RARITY.indexOf('Super');
  for(const e of enemies){
    if(e.hp <= 0 || !e.def || e.def.npc) continue;
    if(MOB_RARITY.indexOf(e.mobRarity) < minIdx) continue;
    const sc = w2s(e.x, e.y);
    // 必须在视野里（留一点边距，刚出画就收掉）
    if(sc[0] < -90 || sc[1] < -90 || sc[0] > W+90 || sc[1] > H+90) continue;
    const score = MOB_RARITY.indexOf(e.mobRarity)*1e9 + e.maxHp;
    if(score > bestScore){ bestScore = score; best = e; }
  }
  if(!best){
    if(bbCur){ bbEl.classList.remove('on'); bbCur = null; }
    return;
  }
  if(bbCur !== best){ bbCur = best; bbGhostV = best.hp/best.maxHp; bbEl.classList.add('on'); }
  const frac = Math.max(0, Math.min(1, best.hp/best.maxHp));
  // 红色延迟条：慢慢追上当前血量
  if(bbGhostV > frac) bbGhostV = Math.max(frac, bbGhostV - Math.max(0.35, (bbGhostV-frac)*6)*dt);
  else bbGhostV = frac;
  bbNameEl.textContent = best.name || 'Mob';
  bbRarEl.textContent  = best.mobRarity;
  bbRarEl.style.color  = MOB_RARITY_COLOR[best.mobRarity] || '#8ce97a';
  bbFillEl.style.width  = (frac*100).toFixed(2) + '%';
  bbGhostEl.style.width = (bbGhostV*100).toFixed(2) + '%';
  bbFillEl.style.background = frac > 0.25 ? '#4caf50' : '#e53935';
}

function render(){
  try{ return renderInner(); }
  catch(err){
    if(!window.__rndErrShown){
      window.__rndErrShown = 1;
      try{ console.error('RND ERR', err); }catch(_){}
    }
    throw err;
  }
}
function renderInner(){
  ctx.clearRect(0,0,W,H);
  // background: authentic florr tilemap if available, else generated bg
  const reg = REGIONS[currentRegion] || REGIONS[0];
  if(regionMapReady && regionMap){ drawTilemap(reg); if(SOLID_DEBUG) drawSolidDebug(); }
  else { drawRegionBg(reg); drawGarden(reg); }
  if(state===STATE.PLAY || state===STATE.DEAD){
    drawPortals();
    drawPollen();
    drawDrops();
    drawWax();
    drawEnemies();
    drawSummons();
    drawMoveArrow();
    drawPlayer();
    drawProjectiles();
    drawMobShots();
    drawZaps();
    drawPuffs();
    drawTexts();
    drawMobMaskDebug();
    drawBushVignette();
  }
  updateBossBar();
  // vignette
  const g = ctx.createRadialGradient(W/2,H/2, Math.min(W,H)*0.35, W/2,H/2, Math.max(W,H)*0.75);
  g.addColorStop(0,'rgba(0,0,0,0)');
  g.addColorStop(1,'rgba(0,0,0,0.28)');
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  if(state===STATE.PLAY || state===STATE.DEAD) drawMinimap(reg);
  else if(mmCtx) mmCtx.clearRect(0,0,mmCanvas.width,mmCanvas.height);
  if(DBG_COLL) drawCollisionOverlay();
  if(DBG_GRID) drawGridOverlay();
  drawFlowerBadge();
}

// 每帧更新主槽冷却斜切覆盖层（随 broken 时间平滑收缩）
// 冷却扇形 clip-path：暗区 = 全槽减去已点亮的扇形（与 stepReloadWipes 共用）
function reloadWipeClip(p){
  const total = (p._reloadTotal && p._reloadTotal > 0.2) ? p._reloadTotal
              : ((p.def && p.def.reloadSec) ? p.def.reloadSec : (p.def && p.def.reload ? p.def.reload/1000 : 2));
  const prog = Math.max(0, Math.min(1, 1 - p.broken / Math.max(0.2, total)));   // 装填进度 0->1
  const sweep = prog * 360, start = 45, seg = 4, R = 150;
  const pts = ['50% 50%'];
  for(let a = sweep; a <= 360 + 0.01; a += seg){
    const ang = (start + a) * Math.PI/180;
    pts.push((50 + Math.cos(ang)*R).toFixed(1) + '% ' + (50 + Math.sin(ang)*R).toFixed(1) + '%');
  }
  pts.push('50% 50%');
  return 'polygon(' + pts.join(',') + ')';
}

function stepReloadWipes(dt){
  // 自给自足：不依赖 renderInventory 重建，每帧按主槽状态创建/更新/移除冷却扇形
  const n = Math.max(player.equipped.length, invEquip.children.length);
  for(let i=0; i<n; i++){
    const cell = invEquip.children[i];
    if(!cell) continue;
    const p = player.equipped[i];
    const cool = p && p.broken > 0 && (p.maxDur > 0 || (p.def && (p.def.cat === 'wax' || p.def.cat === 'bubble')));
    let w = cell.querySelector('.reloadwipe');
    if(!cool){
      if(w) w.remove();
      continue;
    }
    if(!w){ w = document.createElement('div'); w.className = 'reloadwipe'; cell.appendChild(w); }
    w.style.clipPath = reloadWipeClip(p);
  }
}

// ---------- 左上角花朵徽章：头像 + 名字血条胶囊 + 经验条（1:1 复刻官方） ----------
const FLOWER_FACE_IMG = new Image();
FLOWER_FACE_IMG.src = 'assets/flower_normal.png';
function drawFlowerBadge(){
  if(state!==STATE.PLAY && state!==STATE.DEAD) return;
  const x = 18, y = 18, avR = 30;
  const cx = x + avR, cy = y + avR;
  const capW = 232;
  const capX = x + avR*2 - 10, capY = y + avR - 16, capH = 32;   // 血条往下移，与头像垂直居中（capH=32 的一半）
  const bx = x, by = y + avR*2 + 6, bw = (capX + capW) - x, bh = 12;   // 经验条在花朵（头像）正下方
  const frac = Math.max(0, Math.min(1, player.hp/Math.max(1, player.maxHp)));
  const pill = (px,py,pw,ph,rad)=>{ ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(px,py,pw,ph,rad); else ctx.rect(px,py,pw,ph); };
  // 名字血条胶囊：背景纯黑，亮绿 = 当前血量比例，深绿描边
  ctx.fillStyle = '#000'; pill(capX, capY, capW, capH, capH/2); ctx.fill();
  if(frac > 0){
    ctx.save(); pill(capX, capY, capW, capH, capH/2); ctx.clip();
    ctx.fillStyle = '#8fd35c'; ctx.fillRect(capX, capY, capW*frac, capH);
    ctx.restore();
  }
  ctx.lineWidth = 3; ctx.strokeStyle = '#2f6620';
  pill(capX, capY, capW, capH, capH/2); ctx.stroke();
  // 名字：白字黑描边居中
  ctx.font = '700 15px "Ubuntu", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  const nm = player.name || 'Unnamed';
  ctx.strokeText(nm, capX+capW/2, capY+capH/2);
  ctx.fillStyle = '#fff'; ctx.fillText(nm, capX+capW/2, capY+capH/2);
  // 头像最后画：轻微覆盖血条左缘（不超出屏幕）
  const face = pickFaceImg();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, avR, 0, 6.2832); ctx.clip();
  if(face && face.complete && face.naturalWidth){
    drawFlowerEyes(cx, cy, avR);
    ctx.drawImage(face, cx-avR, cy-avR, avR*2, avR*2);
  } else {
    ctx.fillStyle = '#ffe763'; ctx.beginPath(); ctx.arc(cx, cy, avR, 0, 6.2832); ctx.fill();
  }
  ctx.restore();
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.arc(cx, cy, avR, 0, 6.2832); ctx.stroke();
  // 经验条：黑色圆角底 + 浅绿经验填充 + Lvl N 居中
  ctx.fillStyle = '#000'; pill(bx, by, bw, bh, bh/2); ctx.fill();
  // 经验增长动画：显示值向目标缓动；升级回绕（目标突然变小）时快速落下
  const nowXp = performance.now();
  const xpDt = Math.min(0.05, (nowXp - (drawFlowerBadge._t || nowXp))/1000);
  drawFlowerBadge._t = nowXp;
  const xpTarget = Math.max(0, Math.min(1, (player.xp||0)/Math.max(1, player.xpNeed||1)));
  if(player.xpAnim == null) player.xpAnim = xpTarget;
  if(xpTarget < player.xpAnim) player.xpAnim = Math.max(xpTarget, player.xpAnim - xpDt*3.2);
  else player.xpAnim += (xpTarget - player.xpAnim) * Math.min(1, xpDt*7);
  if(player.xpAnim > 0.005){
    ctx.save(); pill(bx, by, bw, bh, bh/2); ctx.clip();
    ctx.fillStyle = '#DAF179'; ctx.fillRect(bx, by, bw*Math.min(1, player.xpAnim), bh);
    ctx.restore();
  }
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  pill(bx, by, bw, bh, bh/2); ctx.stroke();
  ctx.font = '800 9.5px "Ubuntu", sans-serif';
  ctx.textAlign = 'center';                    // 等级字符串居中（用户要求）
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  const lvlTxt = 'Lvl ' + (player.level||1);
  ctx.strokeText(lvlTxt, bx+bw/2, by+bh/2);
  ctx.fillStyle = '#fff'; ctx.fillText(lvlTxt, bx+bw/2, by+bh/2);
}

// debug: paint the blocking subcells so they can be compared with the art (?col=2)
const DBG_COLL = (typeof location!=='undefined') && new URLSearchParams(location.search).get('col')==='2';
const DBG_GRID = (typeof location!=='undefined') && new URLSearchParams(location.search).get('grid')==='1';
// debug: tile grid + player hitbox circle (?grid=1)
function drawGridOverlay(){
  if(!sgW) return;
  const ts = TILE*VIEW;
  ctx.strokeStyle = 'rgba(255,0,255,0.55)';
  ctx.lineWidth = 1;
  for(let tx=0; tx<=sgW; tx++){
    const sx = (-sgMW/2 + tx*TILE - cam.x)*VIEW + W/2;
    if(sx < -2 || sx > W+2) continue;
    ctx.beginPath(); ctx.moveTo(sx,0); ctx.lineTo(sx,H); ctx.stroke();
  }
  for(let ty=0; ty<=sgH; ty++){
    const sy = (-sgMH/2 + ty*TILE - cam.y)*VIEW + H/2;
    if(sy < -2 || sy > H+2) continue;
    ctx.beginPath(); ctx.moveTo(0,sy); ctx.lineTo(W,sy); ctx.stroke();
  }
  const [px,py] = w2s(player.x, player.y);
  ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(px, py, PLAYER_R*VIEW, 0, 6.28); ctx.stroke();
  ctx.beginPath(); ctx.arc(px, py, 2, 0, 6.28); ctx.fillStyle='#00e5ff'; ctx.fill();
}
function drawCollisionOverlay(){
  if(!sfGrid) return;
  const s = SUBPX*VIEW;
  const halfW = W/2/VIEW, halfH = H/2/VIEW;
  let gx0 = Math.floor((cam.x - halfW + sgMW/2)/SUBPX);
  let gx1 = Math.ceil((cam.x + halfW + sgMW/2)/SUBPX);
  let gy0 = Math.floor((cam.y - halfH + sgMH/2)/SUBPX);
  let gy1 = Math.ceil((cam.y + halfH + sgMH/2)/SUBPX);
  gx0 = Math.max(0,gx0); gy0 = Math.max(0,gy0);
  gx1 = Math.min(sfW,gx1); gy1 = Math.min(sfH,gy1);
  ctx.fillStyle = 'rgba(255,0,60,0.45)';
  for(let gy=gy0; gy<gy1; gy++){
    for(let gx=gx0; gx<gx1; gx++){
      if(!sfGrid[gy*sfW+gx]) continue;
      const [sx,sy] = w2s(gx*SUBPX - sgMW/2, gy*SUBPX - sgMH/2);
      ctx.fillRect(sx, sy, s+0.5, s+0.5);
    }
  }
}

// decode a region's tilemap once into a cached Uint8Array (2 bytes per cell: gid, flags)
function decodeLayerBytes(layer){
  if(layer._bytes) return layer._bytes;
  const b = atob(layer.b64);
  const arr = new Uint8Array(b.length);
  for(let i=0;i<b.length;i++) arr[i]=b.charCodeAt(i);
  layer._bytes = arr;
  return arr;
}

// draw one map into the main ctx at a given scale/offset (reused for minimap too)
function drawMapTiles(m, ctx2, camX, camY, view, offX, offY, tileSize){
  const mw = m.width*tileSize, mh = m.height*tileSize;
  for(const layer of m.layers){
    const bytes = decodeLayerBytes(layer);
    for(let ty=0; ty<m.height; ty++){
      const row = ty*m.width;
      for(let tx=0; tx<m.width; tx++){
        const o = (row+tx)*2;
        const gid = bytes[o];
        if(gid===0) continue;
        const img = TILE_IMG[gid];
        if(!img || !img.complete || !img.naturalWidth) continue;
        const wx = -mw/2 + tx*tileSize;
        const wy = -mh/2 + ty*tileSize;
        const sx = (wx - camX)*view + offX;
        const sy = (wy - camY)*view + offY;
        const ts = tileSize*view;
        const fm = FLIP_M[bytes[o+1]];
        if(fm[0]===1&&fm[1]===0&&fm[2]===0&&fm[3]===1){
          ctx2.drawImage(img, sx-0.5, sy-0.5, ts+1, ts+1);
        } else {
          ctx2.save();
          ctx2.translate(sx+ts/2, sy+ts/2);
          ctx2.transform(fm[0],fm[1],fm[2],fm[3],0,0);
          ctx2.drawImage(img, -ts/2-0.5, -ts/2-0.5, ts+1, ts+1);
          ctx2.restore();
        }
      }
    }
  }
}

// 世界边界外：直接平铺地图边界自身的 dirt 贴图（原版 tileset gid 25 = dirt_c_0.svg）
let _borderPat = null, _borderPatIm = null;
function borderWallImage(){
  // 边界墙就是地图的 dirt 图层，中心块 dirt_c_0；依次回退到其它 dirt 变体
  for(const g of [25, 28, 29, 22, 23, 24]){
    const im = getTileImage(g);
    if(im && im.complete && im.naturalWidth) return im;
  }
  return null;
}
function drawDirtBackground(){
  const im = borderWallImage();
  if(!im){ ctx.fillStyle = '#69462e'; ctx.fillRect(0,0,W,H); return; }   // dirt_c_0 底色
  const vw = W/VIEW, vh = H/VIEW;
  ctx.save();
  ctx.translate(W/2, H/2); ctx.scale(VIEW, VIEW); ctx.translate(-cam.x, -cam.y);
  if(!_borderPat || _borderPatIm !== im){
    _borderPatIm = im;
    _borderPat = ctx.createPattern(im, 'repeat');
    if(_borderPat && _borderPat.setTransform){
      const s = TILE / (im.naturalWidth || 256);   // 与地图地块同尺寸平铺
      _borderPat.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]));
    }
  }
  ctx.fillStyle = _borderPat || '#69462e';
  ctx.fillRect(cam.x - vw/2 - 512, cam.y - vh/2 - 512, vw + 1024, vh + 1024);
  ctx.restore();
}

function drawTilemap(reg){
  drawDirtBackground();
  const m = regionMap;
  const ts = TILE*VIEW;
  const halfW = W/2/VIEW, halfH = H/2/VIEW;
  const mw = m.width*TILE, mh = m.height*TILE;
  // visible tile window
  let txMin = Math.floor((cam.x - halfW + mw/2)/TILE) - 1;
  let txMax = Math.ceil((cam.x + halfW + mw/2)/TILE) + 1;
  let tyMin = Math.floor((cam.y - halfH + mh/2)/TILE) - 1;
  let tyMax = Math.ceil((cam.y + halfH + mh/2)/TILE) + 1;
  txMin=Math.max(0,Math.min(m.width-1,txMin)); txMax=Math.max(0,Math.min(m.width,txMax));
  tyMin=Math.max(0,Math.min(m.height-1,tyMin)); tyMax=Math.max(0,Math.min(m.height,tyMax));
  for(const layer of m.layers){
    const bytes = decodeLayerBytes(layer);
    for(let ty=tyMin; ty<tyMax; ty++){
      const row = ty*m.width;
      for(let tx=txMin; tx<txMax; tx++){
        const o = (row+tx)*2;
        const gid = bytes[o];
        if(gid===0) continue;
        const img = TILE_IMG[gid];
        if(!img || !img.complete || !img.naturalWidth) continue;
        const sx = (-mw/2 + tx*TILE - cam.x)*VIEW + W/2;
        const sy = (-mh/2 + ty*TILE - cam.y)*VIEW + H/2;
        const fm = FLIP_M[bytes[o+1]];
        if(fm[0]===1&&fm[1]===0&&fm[2]===0&&fm[3]===1){
          // +0.6px overlap hides hairline seams between tiles
          ctx.drawImage(img, sx-0.5, sy-0.5, ts+1, ts+1);
        } else {
          ctx.save();
          ctx.translate(sx+ts/2, sy+ts/2);
          ctx.transform(fm[0],fm[1],fm[2],fm[3],0,0);
          ctx.drawImage(img, -ts/2-0.5, -ts/2-0.5, ts+1, ts+1);
          ctx.restore();
        }
      }
    }
  }
}

// ---------- minimap (rendered from the real tilemap, shows player position) ----------
const mmCanvas = document.getElementById('minimap');
const mmCtx = mmCanvas ? mmCanvas.getContext('2d') : null;
const minimapCanvas = document.createElement('canvas');
minimapCanvas.width = 340; minimapCanvas.height = 340;   // 2x supersample
let minimapCacheKey = null;
// normalized placement (0..1 of the minimap), so the same base can be drawn at any size
let mmOXN = 0, mmOYN = 0, mmCellN = 1, mmW = 0, mmH = 0;

// 现成的小地图整图（assets/maps2），没有的地图就继续用图块现场烘焙
const MAPS2 = { garden:'Garden', jungle:'Jungle', desert:'Desert', ocean:'Ocean', anthell:'Ant_Hell' };
const MM2_IMG = {};
function mm2Image(name){
  if(MM2_IMG[name]) return MM2_IMG[name];
  const im = new Image();
  im.src = 'assets/maps2/' + name + '.webp';
  MM2_IMG[name] = im;
  return im;
}

function buildMinimapBase(reg){
  const key = (reg.id||'') + '|' + (regionMap ? regionMap.width+'x'+regionMap.height : 'none');
  if(minimapCacheKey===key) return;
  const S = minimapCanvas.width;
  const c = minimapCanvas.getContext('2d');
  // ---- 优先用 maps2 里的整张小地图 ----
  const m2 = MAPS2[reg.id];
  if(m2){
    const im = mm2Image(m2);
    if(!im.complete || !im.naturalWidth){ minimapCacheKey = null; return; }  // 还没解码，下帧再来
    minimapCacheKey = key;
    c.clearRect(0,0,S,S);
    c.fillStyle = '#0e120d'; c.fillRect(0,0,S,S);      // 深色底，别透出地图的绿色
    // 直接铺满（cover），四周不留边 → 不会出现一圈绿色边框
    const k = Math.max(S/im.naturalWidth, S/im.naturalHeight);
    const w = im.naturalWidth*k, h = im.naturalHeight*k;
    c.drawImage(im, (S-w)/2, (S-h)/2, w, h);
    // maps2 整图和地图同范围：把「世界坐标→小地图」的映射设成同一套（cover + 居中），
    // 这样玩家点、稀有度分区、底图三者严丝合缝
    if(regionMap && regionMap.width){
      const m = regionMap;
      mmCellN = 1/Math.max(m.width, m.height);
      mmW = m.width; mmH = m.height;
      mmOXN = 0.5 - m.width*mmCellN/2;
      mmOYN = 0.5 - m.height*mmCellN/2;
    } else {
      mmW = 0; mmH = 0; mmOXN = 0; mmOYN = 0; mmCellN = 1;
    }
    return;
  }
  minimapCacheKey = key;
  c.clearRect(0,0,S,S);
  c.fillStyle = reg.bg; c.fillRect(0,0,S,S);
  if(!(regionMapReady && regionMap)){ mmOXN=0; mmOYN=0; mmCellN=1; mmW=0; mmH=0; return; }
  const m = regionMap;
  const cell = S/Math.max(m.width, m.height);
  mmCellN = cell/S;
  mmOXN = (S/2 - m.width*cell/2)/S;
  mmOYN = (S/2 - m.height*cell/2)/S;
  mmW = m.width; mmH = m.height;
  // topmost non-zero gid per cell
  const pick = new Uint8Array(m.width*m.height);
  for(const layer of m.layers){
    const bytes = decodeLayerBytes(layer);
    for(let i=0;i<pick.length;i++){ const g=bytes[i*2]; if(g) pick[i]=g; }
  }
  // wait until every needed tile image is decoded, then cache once
  for(let i=0;i<pick.length;i++){
    const g = pick[i];
    if(!g) continue;
    const img = TILE_IMG[g];
    if(!img || !img.complete || !img.naturalWidth){ minimapCacheKey=null; return; }
  }
  for(let ty=0;ty<m.height;ty++){
    for(let tx=0;tx<m.width;tx++){
      const g = pick[ty*m.width+tx];
      if(!g) continue;
      const img = TILE_IMG[g];
      c.drawImage(img, mmOXN*S+tx*cell, mmOYN*S+ty*cell, cell+0.4, cell+0.4);
    }
  }
}

// 稀有度分区层：烘焙成一张和地图同尺寸的图（后续只 blur 一下就能盖在小地图上）
let zoneCanvas = null, zoneCanvasFor = '';
function buildZoneCanvas(reg, S){
  const key = (reg.id||'') + '|' + S;
  if(zoneCanvasFor === key) return zoneCanvas;
  zoneCanvasFor = key; zoneCanvas = null;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g2 = c.getContext('2d');
  const grid = (typeof ZONE_GRID_DATA === 'object') && ZONE_GRID_DATA[reg.id];
  if(grid && grid.n){
    // 96×96 网格：每格填成稀有度代表色，格子之间稍微叠一点，blur 之后就没有阶梯边
    const cs = S/grid.n;
    for(let j=0;j<grid.n;j++){
      const row = grid.rows[j];
      for(let i=0;i<grid.n;i++){
        const ch = row[i];
        if(ch === '.' || ch == null) continue;
        g2.fillStyle = RARITY_COLOR[ZONE_TIERS[+ch]] || '#888888';
        g2.fillRect(i*cs - 0.6, j*cs - 0.6, cs + 1.3, cs + 1.3);
      }
    }
  } else {
    // 没有分区图的群系：退回按刷怪区格子铺，同样柔化
    buildSpawners();
    const bx = boundX || 1, by = boundY || 1;
    for(const sp of spawners){
      if(!sp.tier) continue;
      g2.fillStyle = RARITY_COLOR[sp.tier] || '#888888';
      const x0 = (sp.x0 + bx)/(bx*2)*S, y0 = (sp.y0 + by)/(by*2)*S;
      const w = (sp.x1 - sp.x0)/(bx*2)*S, h = (sp.y1 - sp.y0)/(by*2)*S;
      g2.fillRect(x0-0.6, y0-0.6, w+1.3, h+1.3);
    }
  }
  zoneCanvas = c;
  return c;
}

function drawMinimap(reg){
  if(!mmCtx) return;
  const S = mmCanvas.width;
  buildMinimapBase(reg);
  mmCtx.clearRect(0,0,S,S);
  mmCtx.drawImage(minimapCanvas, 0,0, S,S);
  // world -> minimap pixel
  const toMM = (x,y)=>{
    if(mmW && mmH){
      const mw = mmW*TILE, mh = mmH*TILE;
      return [(mmOXN + ((x+mw/2)/TILE)*mmCellN)*S, (mmOYN + ((y+mh/2)/TILE)*mmCellN)*S];
    }
    return [S/2 + (x/boundX)*S*0.45, S/2 + (y/boundY)*S*0.45];
  };
  // 原作小地图只画地形和玩家；按住 Alt 把「稀有度分区」用各档代表色铺出来
  if(keys['alt']){
    const zc = buildZoneCanvas(reg, S);
    if(zc){
      mmCtx.save();
      mmCtx.filter = 'blur(3px)';        // 软化格子边，看起来像手画的分区
      mmCtx.globalAlpha = 0.46;
      mmCtx.drawImage(zc, 0, 0, S, S);
      mmCtx.globalAlpha = 0.26;            // 再叠一层，颜色更实但不遮地形
      mmCtx.drawImage(zc, 0, 0, S, S);
      mmCtx.restore();
    }
    // 图例
    const n = ZONE_TIERS.length, step = (S-10)/n;
    mmCtx.font = 'bold 8px Ubuntu, sans-serif';
    mmCtx.textAlign = 'left';
    mmCtx.fillStyle = 'rgba(0,0,0,.55)';
    mmCtx.fillRect(1, S-14, S-2, 13);
    ZONE_TIERS.forEach((t,i)=>{
      mmCtx.fillStyle = RARITY_COLOR[t] || '#888';
      mmCtx.fillRect(4 + i*step, S-11, 6, 6);
      mmCtx.fillStyle = '#fff';
      mmCtx.fillText(t.slice(0,3), 11 + i*step, S-5);
    });
  }
  // player dot
  let [fx,fy]=toMM(player.x,player.y);
  mmCtx.fillStyle='#000'; mmCtx.beginPath(); mmCtx.arc(fx, fy, 4.4, 0, 6.28); mmCtx.fill();
  mmCtx.fillStyle='#fff'; mmCtx.beginPath(); mmCtx.arc(fx, fy, 3.2, 0, 6.28); mmCtx.fill();
  mmCtx.fillStyle='#ffd54f'; mmCtx.beginPath(); mmCtx.arc(fx, fy, 1.8, 0, 6.28); mmCtx.fill();
  // border + label
  mmCtx.strokeStyle='rgba(255,255,255,0.55)'; mmCtx.lineWidth=2; mmCtx.strokeRect(1,1,S-2,S-2);
  mmCtx.fillStyle='rgba(0,0,0,0.45)'; mmCtx.fillRect(1,1,S-2,16);
  mmCtx.fillStyle='rgba(255,255,255,0.95)'; mmCtx.font='bold 11px sans-serif'; mmCtx.textAlign='left';
  mmCtx.fillText(reg.name, 6, 13);
}

function drawRegionBg(reg){
  const T = 256;
  const img = reg.bgImg ? getMapImage(reg.bgImg) : null;
  if(img && img.complete && img.naturalWidth){
    ctx.fillStyle = reg.bg; ctx.fillRect(0,0,W,H);
    const ts = T*VIEW;
    let ox = (((W/2 - cam.x*VIEW) % ts) + ts) % ts;
    let oy = (((H/2 - cam.y*VIEW) % ts) + ts) % ts;
    for(let x=ox-ts; x<W+ts; x+=ts){
      for(let y=oy-ts; y<H+ts; y+=ts){
        ctx.drawImage(img, x, y, ts, ts);
      }
    }
  } else {
    ctx.fillStyle = reg.bg; ctx.fillRect(0,0,W,H);
  }
}

function drawGarden(reg){
  // decorative dots, tinted to the region
  const dark = reg && reg.bg2 ? reg.bg2 : '#3f6f2f';
  for(const d of decorations){
    const [sx,sy]=w2s(d.x,d.y);
    if(sx<-40||sx>W+40||sy<-40||sy>H+40) continue;
    if(d.t<0.5){
      ctx.fillStyle = d.c<0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
      ctx.beginPath(); ctx.arc(sx,sy, 6+d.t*10, 0, 6.28); ctx.fill();
    } else {
      const col = ['#ffd54f','#ff8a80','#fff','#ba68c8'][(d.c*4)|0];
      ctx.fillStyle='rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.arc(sx,sy,5,0,6.28); ctx.fill();
      ctx.fillStyle=col; ctx.globalAlpha=0.5;
      ctx.beginPath(); ctx.arc(sx,sy,2.4,0,6.28); ctx.fill(); ctx.globalAlpha=1;
    }
  }
}

// 地面掉落物用「卡片图」（用户要求：掉落物也用卡片，不再是透明花瓣）
// ---------- Pollen：脱落在原地的花粉，停留 10 秒持续伤害 ----------
const POLLEN_LIFE = 10;
const POLLEN_R = 48;
function dropPollen(x, y, dmg){
  if(pollenFields.length > 40) pollenFields.shift();
  pollenFields.push({ x, y, t: POLLEN_LIFE, tick: 0, dmg: Math.max(1, (dmg||5)*0.35) });
}
function updatePollen(dt){
  for(let i=pollenFields.length-1;i>=0;i--){
    const f = pollenFields[i];
    f.t -= dt;
    if(f.t <= 0){ pollenFields.splice(i,1); continue; }
    f.tick -= dt;
    if(f.tick > 0) continue;
    f.tick = 0.5;
    for(const e of enemies){
      if(e.hp <= 0) continue;
      if(Math.hypot(e.x-f.x, e.y-f.y) < e.r + POLLEN_R*0.7){
        hurtEnemy(e, f.dmg * (player.dmgMult||1));
      }
    }
  }
}
function drawPollen(){
  for(const f of pollenFields){
    const [sx, sy] = w2s(f.x, f.y);
    const a = Math.min(1, f.t/1.2);
    ctx.save();
    ctx.globalAlpha = 0.5*a;
    ctx.fillStyle = '#e8cf6a';
    ctx.beginPath(); ctx.ellipse(sx, sy, POLLEN_R*VIEW*0.78, POLLEN_R*VIEW*0.42, 0, 0, 6.28); ctx.fill();
    ctx.globalAlpha = 0.9*a;
    ctx.fillStyle = '#f4dc55';
    for(let k=0;k<5;k++){
      const aa = k*1.256 + f.t*0.7;
      ctx.beginPath();
      ctx.arc(sx + Math.cos(aa)*POLLEN_R*VIEW*0.52, sy + Math.sin(aa)*POLLEN_R*VIEW*0.28, 3.4*VIEW, 0, 6.28);
      ctx.fill();
    }
    ctx.restore();
  }
}

const DROP_PART_T = 2.0;        // 掉落物刚出现时冒 2 秒粒子
const DESPAWN_T   = 0.45;       // 掉落物到期前的「快速缩小」时长（秒）
function drawDrops(){
  const S = 19 * VIEW;                           // 掉落卡片边长（跟视野一起缩放）
  for(const dr of drops){
    const [sx,sy]=w2s(dr.x,dr.y);
    const hasCard = !!(MANIFEST.petals && MANIFEST.petals[dr.name] && MANIFEST.petals[dr.name].length);
    const img = hasCard ? getPetalCard(dr.name, dr.rarity) : null;
    const bob = Math.sin(dr.age*2.6)*1.6;
    // 落地后一直轻微「呼吸」地放大缩小（Ultra 及以上幅度更大）
    const bigRar = (RARITIES.indexOf(dr.rarity) >= RARITIES.indexOf('Ultra'));
    const pulse = 1 + Math.sin(dr.age*(bigRar?4.2:3.0) + (dr.x*0.07)) * (bigRar?0.075:0.05);
    // 出现动画：从 -180° 转到 0°，同时淡入
    const t0 = Math.min(1, dr.age/0.32);
    const spin = -(1-t0)*(1-t0) * Math.PI;       // -180° → 0°
    const fadeIn = Math.min(1, dr.age/0.26);
    // 快到期时的消失动画：最后 DESPAWN_T 秒「快速缩小」到 0（不再慢慢淡出）
    const life = DROP_LIFE[dr.rarity] || 30;
    const k = Math.max(0, Math.min(1, (dr.age - (life - DESPAWN_T)) / DESPAWN_T));
    const shrink = 1 - Math.pow(k, 0.6);      // 一开始就缩得很快
    const fade = shrink;
    drawDropBurst(dr, S, Math.min(1, dr.age/0.35));   // 高品质掉落物的星芒 / 飞溅特效
    ctx.save();
    ctx.translate(sx, sy+bob); ctx.scale(pulse*shrink, pulse*shrink);
    // 地面阴影 + 稀有度微光
    ctx.globalAlpha=0.35*fade; ctx.fillStyle='rgba(0,0,0,1)';
    ctx.beginPath(); ctx.ellipse(0, S*0.52, S*0.36, S*0.13, 0, 0, 6.28); ctx.fill();
    ctx.globalAlpha=0.28*fade; ctx.fillStyle=RARITY_COLOR[dr.rarity]||'#fff';
    ctx.beginPath(); ctx.ellipse(0, 0, S*0.62, S*0.62, 0, 0, 6.28); ctx.fill();
    ctx.globalAlpha = fade*fadeIn;
    ctx.rotate(spin);
    if(img && img.complete && img.naturalWidth){
      // 卡片本身就是方的，缩到 S 正好
      ctx.drawImage(img,-S/2,-S/2,S,S);
    } else {
      const sp = petalSprite(dr.name, dr.rarity);
      if(sp){
        const sc = sp.proc ? S*0.94 : S*0.68;   // 矢量图标画布有留白，放大一点
        ctx.drawImage(sp.cv, -sc/2, -sc/2, sc, sc);
      } else {
        // 既没有卡片也没有透明素材（素材包里还没收录的花瓣）：
        // 画一块稀有度色块 + 首字母，起码能看出掉的是什么，而不是一团光
        const col = RARITY_COLOR[dr.rarity] || '#888888';
        const h = S*0.78;
        ctx.fillStyle = col;
        ctx.beginPath();
        if(ctx.roundRect) ctx.roundRect(-h/2,-h/2,h,h,h*0.18);
        else ctx.rect(-h/2,-h/2,h,h);
        ctx.fill();
        ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=1.4; ctx.stroke();
        ctx.fillStyle='#fff';
        ctx.font='700 '+(h*0.52)+"px 'Ubuntu',system-ui,sans-serif";
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillText((dr.name||'?')[0].toUpperCase(), 0, h*0.04);
        ctx.textAlign='start'; ctx.textBaseline='alphabetic';
      }
    }
    ctx.restore();
  }
  drawDropParticles();
}

// ============================================================
//  高品质掉落物（Legendary 及以上）的登场特效：
//  背后一圈白色尖刺星芒 + 稀有度色小方块向外飞散；
//  Ultra 及以上再多一圈柔和色块（跟原作截图一致）
// ============================================================
function drawDropBurst(dr, S, fadeIn){
  const ri = RARITIES.indexOf(dr.rarity);
  if(ri < RARITIES.indexOf('Legendary')) return;
  const [sx, sy] = w2s(dr.x, dr.y);
  const t = performance.now()/1000;
  const col = RARITY_COLOR[dr.rarity] || '#ffffff';
  const seed = (dr.x*0.017 + dr.y*0.013);
  const rot = t*0.55 + seed;
  const pulse = 0.88 + 0.12*Math.sin(t*2.2 + seed*3);
  const R = S*2.05*pulse, w = S*0.105;
  ctx.save();
  ctx.globalAlpha = fadeIn;
  // ---- 白色尖刺星芒（8 根，长短交错）----
  ctx.save();
  ctx.translate(sx, sy); ctx.rotate(rot);
  for(let i=0;i<8;i++){
    const long = (i % 2 === 0);
    const len = R * (long ? 1 : 0.58);
    const halfW = w * (long ? 1 : 0.78);
    ctx.save();
    ctx.rotate(i*Math.PI/4);
    ctx.beginPath();
    ctx.moveTo(0, -S*0.30);
    ctx.lineTo(-halfW, -len*0.52);
    ctx.lineTo(0, -len);
    ctx.lineTo(halfW, -len*0.52);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // ---- 稀有度色小方块，绕着往外散 ----
  const n = 9;
  for(let i=0;i<n;i++){
    const ph = seed*5 + i*2.399;
    const life = ((t*0.55 + i*0.37) % 1);
    const dist = S*(1.0 + life*1.35);
    const px = sx + Math.cos(ph)*dist;
    const py = sy + Math.sin(ph)*dist*0.82;
    const sz = S*0.22*(1 - life*0.4);
    ctx.save();
    ctx.globalAlpha = fadeIn * (1 - life)*0.95;
    ctx.translate(px, py); ctx.rotate(ph + life*2.2);
    ctx.fillStyle = col;
    ctx.fillRect(-sz/2, -sz/2, sz, sz);
    ctx.restore();
  }
  // ---- Ultra 及以上：外面再加一圈柔和的色块飞溅 ----
  if(ri >= RARITIES.indexOf('Ultra')){
    for(let i=0;i<6;i++){
      const ph = seed*3 + i*1.7;
      const life = ((t*0.42 + i*0.29) % 1);
      const dist = S*(1.0 + life*1.5);
      const px = sx + Math.cos(ph)*dist;
      const py = sy + Math.sin(ph)*dist*0.9;
      ctx.save();
      ctx.globalAlpha = fadeIn * (1 - life)*0.55;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(px, py, S*0.2*(1-life*0.3), S*0.16*(1-life*0.3), ph, 0, 6.28);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
}

// 掉落物的粒子：刚落地 2 秒冒一圈「同稀有度」的小粒子；
// Ultra 及以上则是常驻的大粒子（原作高级掉落物一直有环绕光点）
function drawDropParticles(){
  const now = performance.now()/1000;
  for(const dr of drops){
    const col = RARITY_COLOR[dr.rarity] || '#ffffff';
    const ri  = RARITIES.indexOf(dr.rarity);
    const isUltra = ri >= RARITIES.indexOf('Ultra');
    if(!isUltra && dr.age > DROP_PART_T) continue;
    const [sx,sy] = w2s(dr.x, dr.y);
    const n = isUltra ? 8 : 6;
    const fade = isUltra ? 1 : Math.max(0, 1 - dr.age/DROP_PART_T);
    for(let k=0;k<n;k++){
      const ph = now*(isUltra?0.9:2.2) + k*(6.283/n) + dr.x*0.01;
      const rad = (isUltra ? 15 : 11 + dr.age*7) * VIEW;
      const px = sx + Math.cos(ph)*rad;
      const py = sy + Math.sin(ph)*rad*0.62 - (isUltra?4:0);
      const r  = (isUltra ? 2.6 : 1.7) * VIEW;
      ctx.save();
      ctx.globalAlpha = 0.75*fade;
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 8*VIEW;
      ctx.beginPath(); ctx.arc(px, py, r, 0, 6.28); ctx.fill();
      ctx.restore();
    }
  }
}

// 每种 mob 的动画姿态：呼吸 / 走路 / 振翅 / 爬行 / 漂浮
function mobPose(e){
  const t = e.age || 0, ph = e.phase || 0;
  let oy = 0, sx = 1, sy = 1, rot = 0, alpha = 1, shadow = 0;
  // 只做「上下浮动」，不做压缩 / 摇摆：贴图必须保持原样，
  // 生物的方向只由 faceRot（真正旋转到面向花朵）决定，否则看起来永远是歪的
  // 生物不做上下浮动 / 跳跃：贴图原地不动，位移只由真正的移动产生
  switch(e.anim){
    case 'fly':   shadow = 0.26; break;   // 飞的怪脚不沾地，留个影子表示离地
    case 'float': shadow = 0.20; break;
    default:      break;
  }
  // 出生：从半透明小个子弹出来（k 必须夹在 0~1，否则会缩出更小的尺寸）
  if(e.spawnT > 0){
    const k = Math.min(1, Math.max(0, 1 - e.spawnT/0.32));
    const s2 = 0.45 + 0.55*k;
    sx *= s2; sy *= s2; alpha *= 0.35 + 0.65*k;
  }
  // 蓄力冲刺：泛红提示（不再抖动，抖动会让人以为贴图歪了）
  if(e.dug > 0){ alpha *= 0.3; sx *= 0.8; sy *= 0.8; }
  if(e.hitFlash > 0){ sx *= 1.05; sy *= 1.05; }
  // 黄蜂蓄力：身体微微缩起来；开火：顺着一顶（后坐力的视觉）
  if(e.windT > 0){ const w = Math.min(1, e.windT/0.25); sx *= 1 - 0.05*w; sy *= 1 + 0.06*w; }
  if(e.fireT > 0){ const f2 = e.fireT/0.18; sx *= 1 + 0.10*f2; sy *= 1 - 0.07*f2; }
  // 蜜蜂 / 黄蜂 / 大蜜蜂：用户要求去掉脚下的影子
  if(e.key === 'bee' || e.key === 'hornet' || e.key === 'bumble_bee') shadow = 0;
  return {oy, sx, sy, rot, alpha, shadow};
}

// ?solid=1 调试：把 sfGrid 里判定为墙的 8px 子格染红，叠在地图上
function drawSolidDebug(){
  if(!sfGrid || !sfW) return;
  const key = sfW+'x'+sfH+':'+sgMW;
  if(!solidDbgCv || solidDbgFor !== key){
    const cv = document.createElement('canvas');
    cv.width = sfW; cv.height = sfH;
    const g = cv.getContext('2d');
    const img = g.createImageData(sfW, sfH);
    const d = img.data;
    // ?solid=2 用红/绿实心区分「挡 / 可走」，比半透明叠加好认
    const two = SOLID_DEBUG === 2;
    for(let i=0;i<sfW*sfH;i++){
      if(two){
        const b = sfGrid[i];
        d[i*4]   = b ? 235 : 40;
        d[i*4+1] = b ? 45  : 220;
        d[i*4+2] = b ? 45  : 90;
        d[i*4+3] = 225;
      } else if(sfGrid[i]){
        d[i*4]=0; d[i*4+1]=235; d[i*4+2]=255; d[i*4+3]=150;
      }
    }
    g.putImageData(img, 0, 0);
    solidDbgCv = cv; solidDbgFor = key;
  }
  const [x0,y0] = w2s(-sgMW/2, -sgMH/2);
  const [x1,y1] = w2s( sgMW/2,  sgMH/2);
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(solidDbgCv, x0, y0, x1-x0, y1-y0);
  ctx.restore();
}

// ============================================================
//  逐部件动画（wiki 原文）
//  Spider: "When the Spider moves, its legs move back and forth
//           in a wave-like motion."  八条腿，左右各四条，前后波形摆动
//  Soldier Ant: "two wings on its back represented by semi-transparent
//           white ovals … The wings flap back and forth when aggressive
//           but are still when passive."
//  → 所以躯干单独存一张（tools/_mobparts.py 把腿/翅膀抠掉），
//    腿由引擎按波形程序化绘制，翅膀是两张单侧图绕躯干轴心反向旋转。
//  角度 = 贴图坐标系里的方位角（度），len = 腿尖半径 / 躯干半径。
// ============================================================
// pivot = 贴图里躯干中心相对图片中心的归一化偏移（tools/_mobparts.json 实测）
const MOB_PARTS = {
  spider:      {body:'body', pivot:[0.000, 0.027],
                legs:[[13,2.08],[77,2.05],[102,2.08],[156,2.05],
                      [203,2.06],[269,2.08],[294,2.06],[323,2.07]]},
  spider_sewer:{body:'body', pivot:[0.000, 0.027],
                legs:[[13,2.08],[77,2.05],[102,2.08],[156,2.05],
                      [203,2.06],[269,2.08],[294,2.06],[323,2.07]]},
  hel_spider:  {body:'body', pivot:[-0.001, 0.000],
                legs:[[12,2.60],[83,2.60],[105,2.60],[157,2.60],
                      [201,2.60],[270,2.60],[295,2.60],[322,2.60]]},
  soldier_ant: {body:'body', pivot:[-0.024, 0.004], wings:true, wingAmp:0.30}
};
// 逐帧动画（素材：用户提供的 7 帧走路 GIF，水印已离线去掉）
const MOB_ANIM = {
  baby_ant: {n:7, fps:9},
  // 用户提供的 GIF（7 帧 / 90ms 一帧 ≈ 11fps）
  soldier_ant: {n:7, fps:11, aggroMul:3.8},     // 索敌时扇翅膀 ×2（1.9 → 3.8）
  worker_ant:  {n:7, fps:11}
};

const LEG_R_FRAC = 0.136;      // 躯干半径 / 贴图宽度（Spider 176px 里躯干 24px）

// 部件绘制的躯干轴心（绘制坐标）
function partPivot(cfg, s, ox, oy2){
  const pv = cfg.pivot || [0,0];
  return [ox + s*pv[0], oy2 + s*pv[1]];
}

// 蜘蛛的八条腿：波形摆动（后一条比前一条晚一个相位，看上去像波浪传过去）
function drawMobLegs(e, s, ox, oy2){
  const cfg = MOB_PARTS[e.key];
  if(!cfg || !cfg.legs) return;
  // wiki：只有「移动时」腿才摆；停下就静止
  const amp = Math.min(1, (e.stepSpd || 0) / 90);
  if(amp < 0.02){
    // 静止：画成静止姿态（不加摆动），保持八条腿的形状
  }
  const gait = e.gait || 0;
  DBG.legN = (DBG.legN||0) + cfg.legs.length;
  const rb = s * LEG_R_FRAC;                       // 躯干半径（绘制坐标）
  const pv = partPivot(cfg, s, ox, oy2);
  ctx.save();
  ctx.translate(pv[0], pv[1]);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for(let i=0;i<cfg.legs.length;i++){
    const [adeg, k] = cfg.legs[i];
    const base = adeg * Math.PI/180;
    const ph   = gait - i*0.78;                    // 相邻腿差一个相位 → 波浪
    const sw   = Math.sin(ph) * 0.30 * amp;        // 前后摆
    const lift = Math.max(0, Math.sin(ph)) * 0.18 * amp;   // 抬腿（腿变短一点）
    const a = base + sw;
    const L = rb * k * (1 - lift*0.35);
    const kx = Math.cos(a)*L*0.55, ky = Math.sin(a)*L*0.55;      // 膝
    // 膝盖往外顶一点，腿才是折的而不是一根直棍
    const bend = (i%2 ? 1 : -1) * 0.42 + Math.sin(ph)*0.16*amp;
    const cx2 = kx + Math.cos(a+Math.PI/2)*L*0.30*bend;
    const cy2 = ky + Math.sin(a+Math.PI/2)*L*0.30*bend;
    const tx = Math.cos(a)*L, ty = Math.sin(a)*L;
    ctx.strokeStyle = '#2f2f2f';
    ctx.lineWidth = Math.max(1.2, s*0.052);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*rb*0.72, Math.sin(a)*rb*0.72);
    ctx.quadraticCurveTo(cx2, cy2, tx, ty);
    ctx.stroke();
    ctx.strokeStyle = '#4a4a4a';
    ctx.lineWidth = Math.max(0.8, s*0.030);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a)*rb*0.72, Math.sin(a)*rb*0.72);
    ctx.quadraticCurveTo(cx2, cy2, tx, ty);
    ctx.stroke();
  }
  ctx.restore();
}

// 兵蚁的翅膀：两片半透明白椭圆绕躯干轴心反向扇动（敌对时扇，静止时不扇）
function drawMobWings(e, s, ox, oy2){
  const cfg = MOB_PARTS[e.key];
  if(!cfg || !cfg.wings) return;
  const wl = getMobImage(e.sprite, e.mobRarity, 'wingL');
  const wr = getMobImage(e.sprite, e.mobRarity, 'wingR');
  if(!wl || !wr || !wl.complete || !wl.naturalWidth || !wr.complete || !wr.naturalWidth) return;
  // wiki：敌对 / 移动时才扇翅膀，被动时不动
  // wiki：敌对时才扇翅膀，被动时翅膀不动
  const buzz = e.aggroOn ? 1 : 0;
  DBG.wingN = (DBG.wingN||0) + 2;
  const th = Math.sin((e.age||0) * 34) * (cfg.wingAmp || 0.28) * buzz;
  const pv = partPivot(cfg, s, ox, oy2);
  for(const [img, sign] of [[wl, 1], [wr, -1]]){
    ctx.save();
    ctx.translate(pv[0], pv[1]);
    ctx.rotate(th * sign);
    ctx.translate(-pv[0], -pv[1]);
    ctx.drawImage(img, -s/2 + ox, -s/2 + oy2, s, s);
    ctx.restore();
  }
}

// ?maskdbg=1：把每只怪的碰撞掩码格子画成红点，用来肉眼比对「碰撞箱 vs 贴图」
function drawMobMaskDebug(){
  if(!DBG.maskDbg) return;
  for(const e of enemies){
    const mask = mobMask(mobMaskKey(e));
    if(!mask) continue;
    const p = mobPose(e);
    const s = e.r * 2.0 * (MOB_DRAW_K[e.sprite] || 1);
    const pv = MOB_PIVOT[e.sprite];
    const ox = pv ? -pv[0]*s : 0, oy2 = pv ? -pv[1]*s : 0;
    const n = mask.n, cell = s / n;
    const rot = (p.rot + (e.faceRot || 0));
    const ca = Math.cos(rot), sa = Math.sin(rot);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ff2d55';
    for(let j=0;j<n;j++) for(let i=0;i<n;i++){
      if(!mask.m[j*n+i]) continue;
      const lx = (i+0.5)*cell - s/2 + ox, ly = (j+0.5)*cell - s/2 + oy2;
      const wx = e.x + lx*ca - ly*sa;
      const wy = e.y + p.oy + lx*sa + ly*ca;
      const pt = w2s(wx, wy);
      ctx.fillRect(pt[0]-1, pt[1]-1, 2, 2);
    }
    // 腿：沿每条腿采样画橙色点，验证腿也在碰撞箱里
    const cfg = MOB_PARTS[e.key];
    if(cfg && cfg.legs){
      const rb = s * LEG_R_FRAC;
      const pv2 = partPivot(cfg, s, ox, oy2);
      const amp = Math.min(1, (e.stepSpd || 0)/90), gait = e.gait || 0;
      ctx.fillStyle = '#ffb300';
      for(let i2=0;i2<cfg.legs.length;i2++){
        const [adeg, kk] = cfg.legs[i2];
        const ph = gait - i2*0.78;
        const ang = adeg*Math.PI/180 + Math.sin(ph)*0.30*amp;
        const L = rb*kk*(1 - Math.max(0,Math.sin(ph))*0.18*0.35*amp);
        for(let t2=0.2; t2<=1.001; t2+=0.2){
          const lx2 = pv2[0] + Math.cos(ang)*L*t2;
          const ly2 = pv2[1] + Math.sin(ang)*L*t2;
          const wx2 = e.x + lx2*ca - ly2*sa;
          const wy2 = e.y + p.oy + lx2*sa + ly2*ca;
          const pt2 = w2s(wx2, wy2);
          ctx.fillRect(pt2[0]-1.5, pt2[1]-1.5, 3, 3);
        }
      }
    }
    // 方向半径（分离 / 贴脸用的粗判）：青色的点应该正好贴在形状外缘上
    if(maskSupport(mobMaskKey(e), e)){
      ctx.fillStyle = '#00e5ff';
      for(let k2=0;k2<NSUP;k2++){
        const aa = k2*6.283185307/NSUP, ca2 = Math.cos(aa), sa2 = Math.sin(aa);
        const rr2 = mobSupportR(e, ca2, sa2);
        const pt3 = w2s(e.x + ca2*rr2, e.y + sa2*rr2);
        ctx.fillRect(pt3[0]-1.5, pt3[1]-1.5, 3, 3);
      }
    }
    ctx.restore();
  }
}

function drawEnemies(){
  for(const e of enemies){
    const [sx,sy]=w2s(e.x,e.y);
    const flash = e.hitFlash>0;
    const p = mobPose(e);
    let img = e.sprite ? getMobImage(e.sprite, e.mobRarity) : null;
    const an = MOB_ANIM[e.key];
    let animOK = false;
    if(an && e.sprite){
      // 进入索敌/追击时动画加快（兵蚁扇翅膀更急）
      const fps = an.fps * (e.aggroOn ? (an.aggroMul || 1.9) : 1);
      const fi = Math.floor((e.age||0)*fps) % an.n;
      const fr = getMobImage(e.sprite, e.mobRarity, 'f' + fi);
      if(fr && fr.complete && fr.naturalWidth && !fr.__broken){
        img = fr; animOK = true;
        if(DBG.frSeen){ (DBG.frSeen[e.key] = DBG.frSeen[e.key] || {})[fi] = 1; }
      }
    }
    const isClean = !!(img && img.__clean);
    // 死亡动画：贴着死亡过程慢慢变大 + 变透明（改 p 上的姿态参数，才能盖过后面重置的 globalAlpha）
    if(e.dying != null){
      const k = Math.max(0, Math.min(1, e.dying/0.1));       // 1 → 0
      const g = 1 + (1-k)*0.30;
      p.sx *= g; p.sy *= g;
      p.alpha *= k*k;                                       // 越到后面越透
      p.shadow *= k;
    }
    // 地面投影：飞的/飘的怪离地，影子留在下面
    if(p.shadow){
      ctx.save();
      ctx.globalAlpha = p.shadow;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(sx, sy + e.r*0.85, e.r*0.7, e.r*0.26, 0, 0, 6.28);
      ctx.fill();
      ctx.restore();
    }
    // 生物周围不画任何圈（原作没有光晕圈 / 稀有度色环），稀有度看脚下的牌子
    const ridx = MOB_RARITY.indexOf(e.mobRarity);
    // 海星/贝壳这类有盾的：套一圈淡色护盾环
    if(e.shieldCur > 0){
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = '#9fe8ff';
      ctx.lineWidth = Math.max(1, e.r*0.12);
      ctx.beginPath(); ctx.arc(sx, sy, e.r*1.2, 0, 6.28); ctx.stroke();
      ctx.restore();
    }
    // 放电前的泛光
    if(e.glowT > 0){
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#fff59d';
      ctx.beginPath(); ctx.arc(sx, sy, e.r*1.5, 0, 6.28); ctx.fill();
      ctx.restore();
    }
    // 中毒：身上泛绿光；减速：脚下泛蓝
    if(e.poison){
      ctx.save();
      ctx.globalAlpha = 0.30 + 0.12*Math.sin(performance.now()/120);
      ctx.fillStyle = '#a5ff5e';
      ctx.beginPath(); ctx.arc(sx, sy + p.oy, e.r*1.12, 0, 6.28); ctx.fill();
      ctx.restore();
    } else if(e.slowT > 0){
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.strokeStyle = '#7fd6ff';
      ctx.lineWidth = Math.max(1.5, e.r*0.1);
      ctx.beginPath(); ctx.arc(sx, sy + p.oy, e.r*1.14, 0, 6.28); ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(sx, sy + p.oy);
    // 转身：整张贴图真的旋转（头的方向 = 花朵方向），不是水平镜像压扁
    ctx.rotate(p.rot + (e.faceRot || 0));
    ctx.scale(p.sx, p.sy);
    ctx.globalAlpha = p.alpha;
    // 受击闪红：不是画一个红圆，而是把整只生物（腿/躯干/翅膀）按贴图形状染红
    if(flash){
      try{ ctx.filter = 'grayscale(1) brightness(1.45) sepia(1) saturate(16) hue-rotate(-48deg)'; }catch(_){}
    }
    if(img && img.complete && img.naturalWidth){
      const s = e.r * (isClean ? 2.0 : 2.3) * (MOB_DRAW_K[e.sprite] || 1) * VIEW;   // 跟视野一起缩放
      // 轴心修正：把身体（不透明质心）摆到旋转中心，否则一转身就绕着中心甩
      const pv = MOB_PIVOT[e.sprite];
      const ox = pv ? -pv[0]*s : 0, oy2 = pv ? -pv[1]*s : 0;
      // 有可动部件的怪（蜘蛛的腿 / 兵蚁的翅膀）：用「躯干图」当本体，部件自己画
      // 有逐帧动画的怪（兵蚁 / 工蚁）：整张帧图已经含翅膀和腿，不要再叠部件
      const parts = animOK ? null : MOB_PARTS[e.key];
      let baseImg = img;
      if(parts && parts.body){
        const bi = getMobImage(e.sprite, e.mobRarity, parts.body);
        if(bi && bi.complete && bi.naturalWidth && !bi.__broken) baseImg = bi;
      }
      if(parts) drawMobLegs(e, s, ox, oy2);     // 腿画在躯干下面
      ctx.drawImage(baseImg, -s/2 + ox, -s/2 + oy2, s, s);
      if(parts) drawMobWings(e, s, ox, oy2);    // 翅膀贴在躯干背上
      if(flash){ try{ ctx.filter = 'none'; }catch(_){} }
    } else {
      drawProceduralMob(e, flash);
    }
    ctx.restore();
    // 脚下：稀有度名字 + 血量条（不再显示等级/数字）
    // e.r / p.oy 都是世界单位，屏幕坐标要乘 VIEW
    const rScr = e.r * VIEW, oyScr = p.oy * VIEW;
    if(!e.leaderSeg || e.hp < e.maxHp - 0.01){
      drawMobPlate(sx, sy + oyScr + rScr + 4, e, sy + oyScr - rScr - 10);
    }
  }
}

// 区域基础等级（越往后越难）
const REGION_BASE_LV = {
  garden:1, sewer:6, jungle:10, desert:14, ocean:18,
  factory:24, anthell:30, hel:36, pyramid:42, training:1
};
function mobLevel(e){
  const rid = Math.max(0, MOB_RARITY.indexOf(e.mobRarity));
  const base = REGION_BASE_LV[(REGIONS[currentRegion]||{}).id] || 1;
  return base + rid*3;
}
function fmtHP(v){
  v = Math.max(0, Math.round(v || 0));
  if(v >= 1e9) return (v/1e9).toFixed(v>=1e10?0:1).replace(/\.0$/,'')+'B';
  if(v >= 1e6) return (v/1e6).toFixed(v>=1e7?0:1).replace(/\.0$/,'')+'M';
  if(v >= 1e4) return (v/1e3).toFixed(v>=1e5?0:1).replace(/\.0$/,'')+'K';
  return ''+v;
}
// 怪物脚下的牌子：左边稀有度名（Common … Unique），右边接一条血量条
function drawMobPlate(sx, y, e, topY){
  // 1:1 复刻官方排版：生物名（白字黑描边）→ 血条（深色底 + 绿色填充 + 浅绿描边圆角胶囊）→ 稀有度（稀有度色）
  const col  = MOB_RARITY_COLOR[e.mobRarity] || '#ddd';
  const mobName = (e.def && e.def.name) ? e.def.name : (e.mobRarity || '');
  const ridx = Math.max(0, MOB_RARITY.indexOf(e.mobRarity));
  const r    = e.r || 12;
  const fs   = 11;   // 固定字体大小：不随怪物半径/视角缩放变化（原版视频确认）
  // 血条长度随稀有度增长：Common 34 → Eternal/Unique 94（用户要求）
  const MOB_BAR_W = [34, 40, 46, 53, 61, 70, 79, 88, 94, 94];
  const barW = MOB_BAR_W[Math.min(ridx, MOB_BAR_W.length-1)] || 34;
  const barH = Math.max(3, barW*0.09);
  ctx.save();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // 1) 生物名：白字 + 黑描边
  ctx.font = '700 ' + fs.toFixed(1) + "px 'Ubuntu', sans-serif";
  const nameY = y + fs*0.55;
  ctx.lineWidth = Math.max(2, fs*0.28);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(mobName, sx, nameY);
  ctx.fillStyle = '#fff';
  ctx.fillText(mobName, sx, nameY);
  // 2) 血量条：深色底 + 绿色填充 + 浅绿描边（圆角胶囊）
  const barY = nameY + fs*0.55 + barH/2 + 3;
  const frac = Math.max(0, Math.min(1, e.hp/e.maxHp));
  const pill = (w)=>{ ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(sx-barW/2, barY-barH/2, w, barH, barH/2); else ctx.rect(sx-barW/2, barY-barH/2, w, barH); };
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  pill(barW); ctx.fill();
  if(frac > 0){
    ctx.fillStyle = e.undeadT>0 ? '#fff59d' : '#7ed957';
    pill(Math.max(barH, barW*frac)); ctx.fill();
  }
  ctx.lineWidth = Math.max(1, barH*0.22);
  ctx.strokeStyle = '#b9ec8d';
  pill(barW); ctx.stroke();
  // 3) 稀有度：稀有度色 + 黑描边
  ctx.font = '800 ' + (fs*0.82).toFixed(1) + "px 'Ubuntu', sans-serif";
  ctx.textAlign = 'right';                     // 稀有度靠右对齐（用户要求，不居中）
  const rarY = barY + barH/2 + 2 + fs*0.5;
  ctx.lineWidth = Math.max(1.6, fs*0.22);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(e.mobRarity, sx + barW/2, rarY);
  ctx.fillStyle = col;
  ctx.fillText(e.mobRarity, sx + barW/2, rarY);
  ctx.restore();
}

// 怪物投射物：不同怪不同弹道颜色
// 用户上传的蜂刺素材（assets/mobs_trans/Stinger_Projectile.png，50x60）。
// 尖头在素材右下方，TIP_ANG 是从重心指向尖点的角度，绘制时反着转回来。
const STING_IMG = new Image();
STING_IMG.src = (typeof assetURL === 'function')
  ? assetURL('assets/mobs_trans/Stinger_Projectile.png')
  : 'assets/mobs_trans/Stinger_Projectile.png';
const STING_TIP_ANG = Math.atan2(59 - 27.7, 47 - 26.8);   // ≈ 57.2°
const STING_CX = 26.8 / 50, STING_CY = 27.7 / 60;          // 重心（0~1）

function drawMobShots(){
  for(const p of eproj){
    const [sx,sy]=w2s(p.x,p.y);
    const ang = Math.atan2(p.vy,p.vx);
    const vr = (p.r || 4) * VIEW;          // 弹体半径要跟着视野缩放（黄蜂的针也一样）
    ctx.save(); ctx.translate(sx,sy); ctx.rotate(ang);

    // ---- 胡蜂 / 黄蜂的针：黄黑条纹的尖刺，朝飞行方向 ----
    // ---- 花粉（Bumble Bee）：淡黄花粉团，跟着视野缩放 ----
    if(p.type==='pollen'){
      const pol = getPetalImage('Pollen', 'Common');
      const ps = vr*2.2;
      ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff6c4';
      ctx.beginPath(); ctx.ellipse(0, 0, ps*0.8, ps*0.8, 0, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 1;
      if(pol && pol.complete && pol.naturalWidth) ctx.drawImage(pol, -ps/2, -ps/2, ps, ps);
      else { ctx.fillStyle='#f7e08a'; ctx.beginPath(); ctx.arc(0,0,vr,0,6.28); ctx.fill(); }
      ctx.restore();
      continue;
    }
    if(p.type==='missile'){
      if(STING_IMG.complete && STING_IMG.naturalWidth){
        const h = vr*3.3;                          // 针的长度跟着弹体半径走
        const w = h * (STING_IMG.naturalWidth / STING_IMG.naturalHeight);
        // 身后一条淡尾迹
        ctx.globalAlpha = 0.16; ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(-h*0.62, 0, h*0.62, vr*0.42, 0, 0, 6.28); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.rotate(-STING_TIP_ANG);                 // 把尖头转到 +x（飞行方向）
        ctx.drawImage(STING_IMG, -w*STING_CX, -h*STING_CY, w, h);
        ctx.restore();
        ctx.restore();
        continue;
      }
      const L = vr*2.7, W = vr*0.95;
      // 身后一条淡尾迹（不要画成半透明的"物体"）
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(-L*1.15, 0, L*0.85, W*0.42, 0, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 1;
      // 针身：前尖后钝的水滴形
      ctx.beginPath();
      ctx.moveTo(L, 0);
      ctx.quadraticCurveTo(L*0.10, -W*1.05, -L*0.80, -W*0.46);
      ctx.quadraticCurveTo(-L*1.00, 0, -L*0.80, W*0.46);
      ctx.quadraticCurveTo(L*0.10, W*1.05, L, 0);
      ctx.closePath();
      ctx.fillStyle = '#f2c53d'; ctx.fill();
      // 黑色环带（裁在针身里）
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#2b2b2b';
      ctx.fillRect(-L*0.58, -W*1.2, L*0.30, W*2.4);
      ctx.fillRect( L*0.02, -W*1.2, L*0.22, W*2.4);
      ctx.restore();
      ctx.beginPath();
      ctx.moveTo(L, 0);
      ctx.quadraticCurveTo(L*0.10, -W*1.05, -L*0.80, -W*0.46);
      ctx.quadraticCurveTo(-L*1.00, 0, -L*0.80, W*0.46);
      ctx.quadraticCurveTo(L*0.10, W*1.05, L, 0);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.restore();
      continue;
    }

    // ---- 其它弹道：圆球 + 光晕 ----
    let col = '#ffd54f', glow = 'rgba(255,213,79,.45)';
    if(p.type==='pea'){ col='#8bc34a'; glow='rgba(139,195,74,.45)'; }
    else if(p.type==='poison'){ col='#aeea00'; glow='rgba(174,234,0,.45)'; }
    else if(p.type==='pearl'){ col='#f5f5f5'; glow='rgba(255,255,255,.5)'; }
    else if(p.type==='laser'){ col='#ff5252'; glow='rgba(255,82,82,.45)'; }
    else if(p.type==='dark'){ col='#b388ff'; glow='rgba(179,136,255,.45)'; }
    ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(0,0,vr+4,0,6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0,0,vr*1.12,vr,0,0,6.28);
    ctx.fillStyle=col; ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,0.34)'; ctx.lineWidth=1.5; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-vr*0.25,-vr*0.28,vr*0.42,vr*0.3,0,0,6.28);
    ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.fill();
    ctx.restore();
  }
}

// 电击：抖动的折线
function drawZaps(){
  for(const z of zaps){
    const k = 1 - z.t/z.life;
    const [x1,y1] = w2s(z.x1, z.y1);
    const [x2,y2] = w2s(z.x2, z.y2);
    ctx.save();
    ctx.globalAlpha = Math.max(0, k);
    ctx.strokeStyle = '#fff9c4'; ctx.lineWidth = 2.4;
    ctx.shadowColor = '#fff176'; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.moveTo(x1,y1);
    const seg = 5;
    for(let i=1;i<seg;i++){
      const t = i/seg;
      const jx = (Math.random()-0.5)*14, jy = (Math.random()-0.5)*14;
      ctx.lineTo(x1+(x2-x1)*t + jx, y1+(y2-y1)*t + jy);
    }
    ctx.lineTo(x2,y2); ctx.stroke();
    ctx.restore();
  }
}

// 出生/破泡/入土的小尘烟
function drawPuffs(){
  for(const pf of puffs){
    const k = pf.t/pf.life;
    const [sx,sy] = w2s(pf.x, pf.y);
    ctx.save();
    ctx.globalAlpha = 0.55*(1-k);
    ctx.fillStyle = pf.col || '#fff';
    ctx.beginPath(); ctx.arc(sx, sy, pf.r*(0.5+k), 0, 6.28); ctx.fill();
    ctx.restore();
  }
}

function drawProceduralMob(e, flash){
  const r=e.r;
  const col = MOB_RARITY_COLOR[e.mobRarity] || '#888';
  ctx.strokeStyle = flash?'#fff':'rgba(0,0,0,0.45)';
  ctx.lineWidth=2;
  const legs = e.shape==='spider'?8:6;
  for(let i=0;i<legs;i++){
    const a=(i/legs)*6.28 + Math.sin(e.wob+i)*0.3;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(Math.cos(a)*r*1.6, Math.sin(a)*r*1.1); ctx.stroke();
  }
  ctx.fillStyle = flash?'#fff':col;
  if(e.shape==='spider'||e.shape==='rock'||e.shape==='plant'){
    ctx.beginPath(); ctx.arc(0,0,r,0,6.28); ctx.fill();
  } else if(e.shape==='wasp'){
    ctx.beginPath(); ctx.ellipse(0,0,r,r*0.8,0,0,6.28); ctx.fill();
  } else if(e.shape==='egg'){
    ctx.beginPath(); ctx.ellipse(0,0,r*0.8,r,0,0,6.28); ctx.fill();
  } else {
    ctx.beginPath(); ctx.ellipse(0,-r*0.4,r*0.7,r*0.6,0,0,6.28); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, r*0.5,r*0.9,r*0.7,0,0,6.28); ctx.fill();
    ctx.beginPath(); ctx.arc(0,-r*1.05,r*0.45,0,6.28); ctx.fill();
  }
  ctx.fillStyle='#fff';
  ctx.beginPath(); ctx.arc(-r*0.3,-r*0.9,2,0,6.28); ctx.arc(r*0.3,-r*0.9,2,0,6.28); ctx.fill();
  ctx.fillStyle='#000';
  ctx.beginPath(); ctx.arc(-r*0.3,-r*0.9,1,0,6.28); ctx.arc(r*0.3,-r*0.9,1,0,6.28); ctx.fill();
}

// authentic florr player body art (50x50 transparent png)
const PLAYER_IMG = new Image();
PLAYER_IMG.src = 'assets/player.png';
PLAYER_IMG.onload = ()=>{ PLAYER_IMG.__ok = true; };

// ---------- 花朵表情（全部用提供的贴图）----------
// · 三段过渡 GIF（IMG_1041/1047/1049）逐帧抠图（已去右上角水印、透明底、统一 512 帧）
//   na = 正常→攻击, ad = 攻击→防御, da = 防御→攻击, nd = 正常→防御（na_0 与 ad_5 两张贴图混合）
// · 眼球 = IMG_1043 贴图（白底黑描边），在眼眶（贴图里的黑眼）里朝鼠标瞟，不出眼眶
const FACE_FRAMES = {};
for(const [k, n] of [['na',6], ['ad',6], ['da',5]]){
  for(let i=0;i<n;i++){
    const im = new Image(); im.src = 'assets/face/' + k + '_' + i + '.png';
    FACE_FRAMES[k + '_' + i] = im;
  }
}
for(let i=0;i<6;i++){
  const im = new Image(); im.src = 'assets/face/nd_' + i + '.png';
  FACE_FRAMES['nd_' + i] = im;
}
const GLINT_IMG = new Image();
GLINT_IMG.src = 'assets/face/pupil.png';       // 眼球贴图（IMG_1042 白色圆）
const EYEBASE_IMG = new Image();
EYEBASE_IMG.src = 'assets/face/base.png';      // 眼底贴图（IMG_1043 黑椭圆）
function faceImg(k, i){ return FACE_FRAMES[k + '_' + i]; }
// 静止状态：三张状态贴图（眼睛处抠了透孔，眼底/眼球两层垫在花朵贴图下面透出来）
const FACE_STATE_IMG = {
  normal:  'assets/flower_normal.png',
  attack:  'assets/flower_attack.png',
  defense: 'assets/flower_defense.png'
};
const FACE_STATE_CACHE = {};
for(const k in FACE_STATE_IMG){
  const im = new Image(); im.src = FACE_STATE_IMG[k];
  FACE_STATE_CACHE[k] = im;
}
// 过渡序列（GIF 原速 100ms/帧）
const FACE_TRANS = {
  'normal>attack':  [['na',1],['na',2],['na',3],['na',4],['na',5]],
  'attack>normal':  [['na',4],['na',3],['na',2],['na',1],['na',0]],
  'attack>defense': [['ad',1],['ad',2],['ad',3],['ad',4],['ad',5]],
  'defense>attack': [['da',1],['da',2],['da',3],['da',4]],
  'defense>normal': [['nd',4],['nd',3],['nd',2],['nd',1],['nd',0]],  // 正常→防御的帧反转
  'normal>defense': [['nd',1],['nd',2],['nd',3],['nd',4],['nd',5]]   // IMG_1053（正常→防御）
};
// 眼睛几何（状态贴图实测，×花身半径）：眼孔中心 / 眼孔椭圆；bake = 过渡帧里烘焙黑眼的椭圆
// baseK=1.3：眼底垫得比孔大一圈，保证透孔里任何时候都是黑的、不露背景
const FACE_GEOM = { eyeDX: 0.273, eyeDY: 0.19, holeRX: 0.105, holeRY: 0.235, baseK: 1.3, pupK: 0.62, bakeRX: 0.1315, bakeRY: 0.266 };

// movement helper：从小花指向鼠标的半透明灰色箭头，箭头一直延到鼠标指针（原版效果）
function drawMoveArrow(){
  if(state!==STATE.PLAY) return;
  const md = moveDir();
  if(!md.dx && !md.dy) return;
  const [sx,sy] = w2s(player.x, player.y);
  const vs = VIEW;
  const bodyD = PLAYER_BODY*vs*(1 + (player.flowerAreaCur||0)/160);
  const bodyR = bodyD*0.5;
  const gap = bodyR - 1*vs;                       // 箭尾贴着小花外圈（跟随花身体积）
  // 箭头的粗细/头长按「基础花身体积」画，不跟着 Soil 变大（用户反馈）
  const baseD = PLAYER_BODY*vs;
  // 键盘移动没有指针：给一个固定长度的箭头示意方向
  const reach = md.fromKeys ? baseD*3.4 : Math.hypot(mouse.x-sx, mouse.y-sy);
  const len = reach - gap;                        // 箭头尖端落在鼠标指针上
  if(len < 8*vs) return;
  const alpha = md.fromKeys ? 0.40 : 0.46;
  const headL = Math.max(baseD*0.5, Math.min(len*0.42, baseD*1.05));
  const headW = headL*1.02;
  const shaftW = Math.max(1.8, baseD*0.15);
  const shaftL = Math.max(0, len - headL);
  ctx.save();
  ctx.translate(sx + md.dx*gap, sy + md.dy*gap);
  ctx.rotate(Math.atan2(md.dy, md.dx));
  ctx.fillStyle = 'rgba(120,120,120,'+alpha.toFixed(3)+')';
  if(shaftL > 0.5){
    ctx.beginPath();
    ctx.moveTo(0,-shaftW/2); ctx.lineTo(shaftL,-shaftW/2);
    ctx.lineTo(shaftL, shaftW/2); ctx.lineTo(0, shaftW/2);
    ctx.closePath(); ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(shaftL, -headW/2);
  ctx.lineTo(len, 0);
  ctx.lineTo(shaftL, headW/2);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// 当前应显示的脸：过渡动画帧 or 状态贴图
function pickFaceImg(){
  if(player.faceAnim && player.faceAnim.seq){
    const f = player.faceAnim.seq[Math.min(player.faceAnim.i, player.faceAnim.seq.length-1)];
    return faceImg(f[0], f[1]);
  }
  return FACE_STATE_CACHE[player.faceState || 'normal'];
}
// 眼底(黑) + 眼球(白，追鼠标)两层，画在花朵贴图之下；（cx,cy)=花心，R=花身半径
function drawFlowerEyes(cx, cy, R){
  if(!(EYEBASE_IMG.complete && EYEBASE_IMG.naturalWidth && GLINT_IMG.complete && GLINT_IMG.naturalWidth)) return;
  const G = FACE_GEOM;
  const brx = G.holeRX*R*G.baseK, bry = G.holeRY*R*G.baseK;   // 眼底（黑，垫底盖满孔）
  const prx = G.holeRX*R*G.pupK,  pry = G.holeRY*R*G.pupK;    // 眼球（白圆）
  const axX = (G.holeRX*R-prx)*0.92, axY = (G.holeRY*R-pry)*0.92;
  let ox = (player.gazeX||0)*axX, oy = (player.gazeY||0)*axY;
  const dd = (ox*ox)/(axX*axX) + (oy*oy)/(axY*axY);
  if(dd > 1){ const s2 = 1/Math.sqrt(dd); ox *= s2; oy *= s2; }
  for(const sgn of [-1, 1]){
    const ecx = cx + sgn*G.eyeDX*R, ecy = cy - G.eyeDY*R;
    ctx.drawImage(EYEBASE_IMG, ecx-brx, ecy-bry, brx*2, bry*2);
    ctx.drawImage(GLINT_IMG,   ecx+ox-prx, ecy+oy-pry, prx*2, pry*2);
  }
}

function drawPlayer(){
  const [sx,sy]=w2s(player.x,player.y);
  const vs = VIEW;                                   // keep the flower in scale with the camera zoom
  const orbitR = (PLAYER_ORBIT + player.orbitBonus + (player.spread||0)*ORBIT_SPREAD - (player.tuck||0)*PLAYER_ORBIT*0.45
               + PLAYER_BODY*(player.flowerAreaCur||0)/320)*vs;   // 花变大 → 轨道同步外扩
  const petalS = PETAL_SIZE*vs;
  const bodyD = PLAYER_BODY*vs*(1 + (player.flowerAreaCur||0)/160);
  const active = getActivePetals();
  const n = active.length;
  // ---- 拖尾：Super+ 的白色软光斑（画在花瓣下面）----
  active.forEach((p)=>{
    if(!p._puffs || !p._puffs.length) return;
    if(RARITIES.indexOf(p.rarity) < 7) return;
    const pr = Math.max(petalS * 1.15 * 0.5 * TRAIL_R, 2.4);  // 光斑半径 = 花瓣半径 × 0.355
    // 光斑本色：花瓣偏白 + 一点点稀有度色，Basic 出来就是纯白（与参考图一致）
    const tint = mixHex('#ffffff', RARITY_COLOR[p.rarity] || '#ffffff', TRAIL_TINT);
    for(let i=0;i<p._puffs.length;i++){
      const g = p._puffs[i];
      const k = Math.min(1, g.t / TRAIL_LIFE);
      const a = TRAIL_A0 * (1-k) * (1-k*0.30);       // 0.78 → 0，尾巴更实
      if(a <= 0.004) continue;
      const off = pr * TRAIL_SCATTER * k;            // 越老漂得越开 → 锥形尾
      const [gx,gy] = w2s(g.x + g.dx*off, g.y + g.dy*off);
      // 软边光斑：中心实、边缘化开（参考图里没有硬边）
      const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, pr);
      grd.addColorStop(0,    hexA(tint, Math.min(0.92, a*1.1)));
      grd.addColorStop(0.5,  hexA(tint, a*0.92));
      grd.addColorStop(1,    hexA(tint, 0));
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(gx, gy, pr, 0, 6.2832); ctx.fill();
    }
  });
  // petals
  active.forEach((p,k)=>{
    if(p.broken > 0) return;                       // 冷却中的花瓣：位置留着，但不画
    if(p._flyT > 0) return;                        // 回血花瓣飞出去了，轨道上这次不画
    if(p._out > 0) return;                          // Peas 的 4 颗都射出去了，等冷却再长回来
    const ang = player.petalAngle + k*(2*Math.PI/Math.max(n,1));
    let px, py;
    if(p._x != null){ const sp2 = w2s(p._x, p._y); px = sp2[0]; py = sp2[1]; }
    else { px = sx + Math.cos(ang)*orbitR; py = sy + Math.sin(ang)*orbitR; }
    const sp = petalSprite(p.name, p.rarity);
    const img = (!sp && PSPRITE_BAD[p.name]) ? getPetalImage(p.name,p.rarity) : null;
    ctx.save();
    ctx.translate(px,py); ctx.rotate(ang+Math.PI/2);
    if(p.name==='Sawblade') ctx.rotate(performance.now()/1000*25);   // 锯片：绕花瓣中心快速自转
    if(player.inBush) ctx.globalAlpha = 0.3;      // 密道里花瓣是灰的、不能用
    if(p.flashT > 0) ctx.filter = 'grayscale(1) brightness(1.35) sepia(1) saturate(14) hue-rotate(-25deg)';
    if(sp){
      // 去底后的精灵是「正方形画布 + 居中图案」，按正方形边长缩放 → 所有花瓣最大边一致
      const PSIZE_K = { Shovel: 3.0, Faster: 0.55, Golden_Leaf: 1.5, Leaf: 1.5, Soil: 1.75, Sawblade: 1.5 };    // 铲子细长画大；Faster 缩小；Golden Leaf / Leaf / Sawblade 1.5x，Soil 1.75x
      const s = petalS * 1.15 * (PSIZE_K[p.name] || 1);
      ctx.drawImage(sp.cv, -s/2, -s/2, s, s);
    }
    else if(img && img.complete && img.naturalWidth){ ctx.drawImage(img,-petalS/2,-petalS/2,petalS,petalS); }
    else if(img){ ctx.fillStyle=RARITY_COLOR[p.rarity]; ctx.beginPath(); ctx.arc(0,0,petalS*0.4,0,6.28); ctx.fill(); }
    ctx.restore();
  });
  // ---- 花瓣消失：从原尺寸放大到 1.7 倍并淡出，外加一圈扩散的光环 ----
  for(const v of petalVanish){
    const k = Math.min(1, v.t / v.life);
    const sp = petalSprite(v.name, v.rarity);
    const [vx, vy] = w2s(v.x, v.y);
    const sc = petalS * 1.15 * (1 + 0.7*k);
    ctx.save();
    ctx.globalAlpha = 1 - k*k;
    ctx.translate(vx, vy); ctx.rotate(v.ang + Math.PI/2);
    if(sp) ctx.drawImage(sp.cv, -sc/2, -sc/2, sc, sc);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = (1-k)*0.55;
    ctx.strokeStyle = RARITY_COLOR[v.rarity] || '#ffffff';
    ctx.lineWidth = Math.max(1.5, 2.4*VIEW);
    ctx.beginPath(); ctx.arc(vx, vy, petalS*0.7*(1 + 1.1*k), 0, 6.28); ctx.stroke();
    ctx.restore();
  }
  // ---- 回血花瓣飞回花朵：越靠近越透明、越小，落进花心后消失并回血 ----
  for(const f of healFx){
    const k = f.k || 0;
    const sp = petalSprite(f.name, f.rarity);
    const [fx, fy] = w2s(f.x, f.y);
    const sc = (1 - 0.32*k) * petalS * 1.15;
    ctx.save();
    ctx.globalAlpha = 1 - 0.85*k*k;
    ctx.translate(fx, fy); ctx.rotate(f.ang + Math.PI/2);
    if(sp){
      ctx.drawImage(sp.cv, -sc/2, -sc/2, sc, sc);
    } else {
      const img = getPetalImage(f.name, f.rarity);
      if(img && img.complete && img.naturalWidth) ctx.drawImage(img, -sc/2, -sc/2, sc, sc);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  // body: the sprite is a circle that fills its 50px frame, so its radius is
  // exactly PLAYER_R -> the drawn edge and the collision edge are the same
  ctx.save(); ctx.translate(sx,sy);
  if(player.hitFlash>0){
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#ff5252';
    ctx.beginPath(); ctx.arc(0,0,bodyD/2,0,6.28); ctx.fill();
    ctx.globalAlpha = 1;
  }
  const face = pickFaceImg();
  if(face && face.complete && face.naturalWidth){
    // 图层顺序（用户指定，静止 / 过渡一致）：眼底(黑) → 眼球(白，追鼠标) → 花朵贴图（眼眶透孔盖在最上面）
    drawFlowerEyes(0, 0, bodyD/2);
    ctx.drawImage(face, -bodyD/2, -bodyD/2, bodyD, bodyD);
  } else if(PLAYER_IMG.__ok && PLAYER_IMG.naturalWidth){
    ctx.drawImage(PLAYER_IMG, -bodyD/2, -bodyD/2, bodyD, bodyD);
  } else {
    ctx.fillStyle='#f3df6d';
    ctx.beginPath(); ctx.arc(0,0,bodyD/2,0,6.28); ctx.fill();
    ctx.lineWidth=Math.max(1,2*vs); ctx.strokeStyle='#c9b93f'; ctx.stroke();
  }
  if(player.invuln>0){   // second-chance invulnerability shimmer
    ctx.globalAlpha = 0.35+0.25*Math.sin(performance.now()/90);
    ctx.lineWidth = Math.max(1,3*vs); ctx.strokeStyle = '#fff';
    ctx.beginPath(); ctx.arc(0,0,bodyD/2+2*vs,0,6.28); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  // name（放到花瓣环上方，别盖住花瓣）
  ctx.fillStyle='rgba(255,255,255,.92)'; ctx.font='700 '+Math.round(11*Math.max(0.85,vs))+"px 'Ubuntu', sans-serif"; ctx.textAlign='center';
  ctx.strokeStyle='rgba(0,0,0,0.55)'; ctx.lineWidth=3;
  const ny = sy - orbitR - bodyD*0.5 - 6;
  ctx.strokeText(player.name, sx, ny);
  ctx.fillText(player.name, sx, ny);
}

function drawProjectiles(){
  for(const pr of projectiles){
    const [sx,sy]=w2s(pr.x,pr.y);
    ctx.save(); ctx.translate(sx,sy);
    if(pr.pea){
      // 射出去的就是「单颗豌豆」那个透明素材，不画成色球
      if(pr.sup){                                  // Super+：每颗 pea 都拖着光晕/粒子
        const gr = ctx.createRadialGradient(0,0,pr.r*0.5,0,0,pr.r*2.6);
        gr.addColorStop(0,'rgba(255,255,255,.16)');
        gr.addColorStop(.5,'rgba(120,255,205,.12)');
        gr.addColorStop(1,'rgba(120,255,205,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(0,0,pr.r*2.6,0,6.28); ctx.fill();
      }
      const el = getPetalImage('Peas', pr.rarity || 'Common');
      const ps = pr.r*2;
      if(el && el.complete && el.naturalWidth) ctx.drawImage(el, -ps/2, -ps/2, ps, ps);
      else { ctx.fillStyle='#8fc45a'; ctx.beginPath(); ctx.arc(0,0,pr.r,0,6.28); ctx.fill(); }
      ctx.restore();
      continue;
    }
    ctx.fillStyle = pr.type==='Lightning'?'#fff176': pr.type==='Laser'?'#ff5252':'#ffd54f';
    ctx.beginPath(); ctx.arc(0,0,pr.r,0,6.28); ctx.fill();
    ctx.globalAlpha=0.4; ctx.beginPath(); ctx.arc(0,0,pr.r+4,0,6.28); ctx.fill();
    ctx.restore();
  }
}

// ---------- HUD ----------
const elLevel=document.getElementById('level');
const elXp=document.getElementById('xpbar');
const elHp=document.getElementById('hpbar');
const elHpText=document.getElementById('hptext');
const elSpin=document.getElementById('spininfo');
const elBody=document.getElementById('bodyinfo');
// 转速显示：倍率 + 实际 rad/s（Q 减 / E 加）
// Faster 不加移速，只加转速：把转速的上限和下限都抬高 f（基础部分仍然夹在 0.5~3）
function curSpin(){
  const f = player.fasterSpin || 0;
  const v = (BASE_SPIN + player.spinBonus + player.rotAdd) * (player.spinCtrl||1) + f;
  return Math.max(0.5 + f, Math.min(3 + f, v));
}
function updateSpinHud(){
  if(!elSpin) return;
  const m = player.spinCtrl||1;
  elSpin.innerHTML = 'Spin ' + m.toFixed(2) + '× <b>' + curSpin().toFixed(2) + '</b> rad/s'
    + '  <span style="opacity:.65">Q - / E +</span>';
}
function updateHUD(){
  if(elBody) elBody.innerHTML = 'Body <b>' + (player.bodyDmg||0).toFixed(1) + '</b> dmg';
  elLevel.textContent = 'Lv '+player.level;
  elXp.style.width = Math.min(100,(player.xp/player.xpNeed)*100)+'%';
  elHp.style.width = Math.max(0,(player.hp/player.maxHp)*100)+'%';
  elHpText.textContent = Math.ceil(player.hp)+' / '+Math.round(player.maxHp);
}
function flashLevel(){
  const e=document.getElementById('levelbox');
  e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop');
}

// ---------- region switching ----------
const elRegions=document.getElementById('regions');
const elRegionLabel=document.getElementById('regionlabel');
function buildRegionsUI(){
  elRegions.innerHTML='';
  REGIONS.forEach((r,i)=>{
    const b=document.createElement('div');
    b.className='rbtn'+(i===currentRegion?' active':'');
    b.textContent=(i+1)+' '+r.name;
    b.addEventListener('click',()=>setRegion(i));
    elRegions.appendChild(b);
  });
  const rg = regionRarityRange(REGIONS[currentRegion]);
  const rgTop = regionRarityRange(REGIONS[currentRegion], 0.0005);
  elRegionLabel.innerHTML = 'Region: '+(REGIONS[currentRegion]?REGIONS[currentRegion].name:'')+
    (REGIONS[currentRegion] ? ' <span style="opacity:.78;font-weight:500">· '+
      '<b style="color:'+RARITY_COLOR[rg[0]]+'">'+rg[0]+'</b>–<b style="color:'+RARITY_COLOR[rg[1]]+'">'+rg[1]+'</b>'+
      ' (deep up to <b style="color:'+RARITY_COLOR[rgTop[1]]+'">'+rgTop[1]+'</b>)</span>' : '');
}
let pendingExit = null;          // 暗道落点（等新地图加载完再摆）
function setRegion(i, atSpawn, exit){
  currentRegion = i;
  pendingExit = exit || null;
  buildRegionsUI();
  // clear existing mobs so the new region's pool takes over
  enemies = [];
  eproj = []; zaps = []; puffs = [];
  if(elMobList && elMobs && elMobs.style.display==='block') buildMobdexUI();
  // recenter player to map center and load the authentic tilemap
  player.x = 0; player.y = 0; cam.x = 0; cam.y = 0;
  buildPortals(REGIONS[i]);
  // wiki：花园的出生点在地图正中央、下水道传送门的正上方（环形湖边）
  spawnPending = false;
  if(atSpawn && REGIONS[i]){
    // 地块/传送门还没就绪时先挂起，等 prep() 里再摆
    if(!placeAtRegionSpawn()) spawnPending = true;
  }
  loadRegionMap(REGIONS[i]);
}

// 出生点摆放：花园 = 下水道传送门正上方（wiki），并且
//   ① 离任何传送门的触发圈都 ≥ 2 格，别一出生就被吸走
//   ② 必须落在可走地面上（出生点旁边就是环湖，不能站水里）
let spawnPending = false;
// 各区域的出生点（原文：wiki「Garden / World Map」）
//   Garden : 地图正中心的环形湖边（"The spawn is located in the center of the map"，
//            中文维基：生成点位于地图中心的一个环形湖，被城墙包围着）
//   Ocean  : 中心；Desert : 下方；Jungle : 左上；Hel : 地图中心附近
//   下水道 / 蚁穴 / 工厂 / 金字塔这些副本「没有存档点」，出生在入口传送门旁边
//   坐标是相对半张地图的比例，0 = 地图中心
const REGION_SPAWN = {
  // Garden：出生点挪到地图左上那块「土黄色标记」的位置（按用户给的图算的归一化坐标
  // 0.3037 / 0.4847 → 相对中心的 (-0.393, -0.031)），图本身不进游戏
  garden: [-0.393, -0.031],
  ocean:  [ 0.00,  0.00],
  desert: [-0.06,  0.66],
  jungle: [-0.62, -0.58],
  hel:    [ 0.02,  0.10]
};
// 存档点的推进顺序：越靠后越深，死后优先在最深的那个存档点重生
const CP_ORDER = ['garden','ocean','desert','jungle','factory','sewer','anthell','hel'];

function placeAtRegionSpawn(){
  const reg = REGIONS[currentRegion];
  if(!reg) return false;
  let tx = 0, ty = 0, via = 'center';
  if(pendingExit){
    tx = pendingExit.fx * boundX; ty = pendingExit.fy * boundY;
    pendingExit = null;
    let best2 = {x:tx, y:ty};
    if(sgGrid){ const f2 = findSpawn(tx, ty); best2 = {x:f2.x, y:f2.y}; }
    player.x = best2.x; player.y = best2.y; cam.x = best2.x; cam.y = best2.y;
    player.invuln = Math.max(player.invuln, 1.2);
    return true;
  }
  const sp = REGION_SPAWN[reg.id];
  if(sp){
    tx = sp[0]*boundX; ty = sp[1]*boundY;
    via = 'region';
  } else {
    // 副本：站在「回上层」的传送门旁边
    const back = portals.find(pt => pt.to === 'garden') || portals[0];
    if(!back) return false;
    tx = back.x; ty = back.y + Math.max(70, TILE*0.8);
    via = 'portal';
  }
  // 最近的可站立点（不会落在水里/墙里），findSpawn 会往最近的可行走格收
  let best = {x:tx, y:ty};
  if(sgGrid){
    const f = findSpawn(tx, ty);
    best = {x:f.x, y:f.y};
  }
  // 别落在传送门触发圈里
  for(const pt of portals){
    const dd = Math.hypot(pt.x-best.x, pt.y-best.y);
    if(dd < pt.r*0.9){
      const a = Math.atan2(best.y-pt.y, best.x-pt.x) || -Math.PI/2;
      const nx2 = pt.x + Math.cos(a)*pt.r*1.4, ny2 = pt.y + Math.sin(a)*pt.r*1.4;
      const f2 = sgGrid ? findSpawn(nx2, ny2) : {x:nx2, y:ny2};
      best = {x:f2.x, y:f2.y};
      break;
    }
  }
  player.x = best.x; player.y = best.y; cam.x = best.x; cam.y = best.y;
  player.vx = 0; player.vy = 0;
  portalCd = 1.6;                       // 落下后 1.6s 内不触发传送
  DBG.spawnVia = via;
  DBG.spawnPd = Math.round(Math.hypot(player.x, player.y));
  markCheckpoint(reg.id, player.x, player.y);
  return true;
}

// ---------- 存档点（wiki：World Map / Checkpoints） ----------
// 规则：进入一个更深的区域就更新存档点；死后在这个存档点重生，
//       同一个存档点最多重生 2 次，之后回退到上一层的存档点，最后回到出生点。
function markCheckpoint(regionId, x, y){
  const lv = CP_ORDER.indexOf(regionId);
  if(lv < 0) return;
  if(!player.cp){
    player.cp = {region:regionId, x, y, lv, uses:0};
  } else if(player.cp.region === regionId){
    player.cp.x = x; player.cp.y = y;              // 同一层：刷新具体落点
  } else if(lv > player.cp.lv){
    player.cp = {region:regionId, x, y, lv, uses:0}; // 走到更深处：更新存档点
  }
}

// 死后重生：回到存档点（保留等级 / 背包 / 花瓣）
function respawnAtCheckpoint(){
  const cp = player.cp || {region:'garden', lv:0, uses:0};
  let target = cp;
  if((cp.uses||0) >= 2){
    // 同一个存档点用满了 2 次 → 回退到上一层
    const lv = Math.max(0, (cp.lv|0) - 1);
    target = {region: CP_ORDER[lv] || 'garden', lv, uses:0};
  }
  const idx = REGIONS.findIndex(r => r.id === target.region);
  if(idx < 0){ startGame(); return; }
  target.uses = (target.uses||0) + 1;
  player.cp = target;
  // 清场后重新进图，落点是该区域的官方出生点
  // 重生只清掉「打在自己身上的东西」，地图里已经刷出来的生物和地上的掉落物都保留
  eproj = []; projectiles = []; puffs = []; zaps = []; petalVanish = []; waxSummons = [];
  player.hp = player.maxHp;
  player.hpShown = player.maxHp;
  // 重生惩罚：所有主槽花瓣从装填冷却开始（重生后要等花瓣长出来）
  for(const p of player.equipped){
    if(!p) continue;
    p._wax = null;
    p.broken = ((p.def && p.def.reload ? p.def.reload : 800)/1000) * (player.reloadMult||1);
    p._reloadTotal = p.broken;
    p.dur = p.maxDur; p.cd = 0; p._wax = null;
  }
  recompute();
  if(typeof renderInventory === 'function') renderInventory();
  setRegion(idx, true);
  player.invuln = 2.2;                 // 复活后短暂无敌，别一落地又被咬死
  player.hitFlash = 0;
  state = STATE.PLAY;
  dead.style.display = 'none';
  updateHUD(); renderInventory();
  toast('Respawned · ' + (REGIONS[idx] ? REGIONS[idx].name : ''), 'good');
}

// ---------- 传送门（原作地图对象层 warps） ----------
// 坐标换算：地图原始 px（tile=512）→ 我们的世界 px（tile=TILE），再减半张地图居中
let portals = [];
let portalCd = 0;                 // 传送后的冷却，防止刚落点又被吸回去

function buildPortals(reg){
  portals = [];
  const raw = (typeof MAP_PORTALS === 'object' && MAP_PORTALS) ? MAP_PORTALS[reg && reg.id] : null;
  if(!raw) return;
  const k = TILE / (raw.tile || 512);
  const ox = -(raw.w * TILE) / 2, oy = -(raw.h * TILE) / 2;
  for(const p of raw.list){
    portals.push({
      x: ox + p.x * k,
      y: oy + p.y * k,
      to: p.to,
      r: TILE * 0.55
    });
  }
}

function updatePortals(dt){
  if(portalCd > 0) portalCd -= dt;
  if(portalCd > 0 || !portals.length) return;
  for(const pt of portals){
    if(Math.hypot(player.x-pt.x, player.y-pt.y) < pt.r*0.62){
      const idx = REGIONS.findIndex(r => r.id === pt.to);
      if(idx >= 0 && idx !== currentRegion){
        portalCd = 1.4;
        setRegion(idx);
        toast('Entering ' + REGIONS[idx].name, 'good');
      }
      return;
    }
  }
}

// 钻进灌木丛密道：整个视野压暗，只有花朵周围一圈是亮的（照用户给的参考图）
function drawBushVignette(){
  const k = player.bushDark || 0;
  if(k <= 0.01) return;
  const cx = W/2, cy = H/2;
  const inner = Math.max(55, 70*VIEW);
  const outer = Math.max(260, 300*VIEW);
  const g = ctx.createRadialGradient(cx, cy, inner*0.30, cx, cy, outer);
  g.addColorStop(0,    'rgba(0,0,0,0)');
  g.addColorStop(0.35, 'rgba(0,0,0,' + (0.26*k).toFixed(3) + ')');
  g.addColorStop(0.66, 'rgba(0,0,0,' + (0.52*k).toFixed(3) + ')');
  g.addColorStop(1,    'rgba(0,0,0,' + (0.82*k).toFixed(3) + ')');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

function drawPortals(){
  if(!portals.length) return;
  const t = performance.now()/1000;
  for(const pt of portals){
    const [sx,sy] = w2s(pt.x, pt.y);
    if(sx < -120 || sy < -120 || sx > W+120 || sy > H+120) continue;
    const rr = pt.r * 0.62 * VIEW;
    const pulse = 0.5 + 0.5*Math.sin(t*2.2);
    ctx.save();
    // 地面光圈
    const g = ctx.createRadialGradient(sx, sy, rr*0.2, sx, sy, rr);
    g.addColorStop(0, 'rgba(255,255,255,0.30)');
    g.addColorStop(0.65, 'rgba(160,230,255,0.20)');
    g.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(sx, sy, rr, 0, 6.28); ctx.fill();
    // 旋转虚线圈
    ctx.strokeStyle = 'rgba(230,250,255,' + (0.55+0.35*pulse).toFixed(2) + ')';
    ctx.lineWidth = Math.max(1.5, 2.6*VIEW);
    ctx.setLineDash([rr*0.32, rr*0.22]);
    ctx.lineDashOffset = -t*40;
    ctx.beginPath(); ctx.arc(sx, sy, rr*0.82, 0, 6.28); ctx.stroke();
    ctx.setLineDash([]);
    // 目标区域名
    const reg = REGIONS.find(r => r.id === pt.to);
    const label = reg ? reg.name : pt.to;
    ctx.font = '700 ' + Math.max(9, Math.round(10*VIEW)) + "px 'Ubuntu', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(label, sx, sy - rr*0.95);
    ctx.fillStyle = '#eaffff';
    ctx.fillText(label, sx, sy - rr*0.95);
    ctx.restore();
  }
}

// ---------- talent UI ----------
const elTalents=document.getElementById('talents');
const elTalentList=document.getElementById('talentlist');
const elTp=document.getElementById('tpcount');

// 加点/撤销后统一重算（与原版一致：连买整条前置链 / 连撤全部后继）
function commitTalents(){
  applyTalents();
  recompute();
  if(typeof syncSummons==='function') syncSummons();
  if(player.hp>player.maxHp) player.hp=player.maxHp;
  while(player.equipped.length<maxSlots()) player.equipped.push(null);
  buildTalentsUI(); renderInventory(); updateHUD();
}
// 兼容旧入口：已点亮则长按撤销，未点亮则长按连买
function buyTalent(treeId, key){
  const owned = player.talents.has(treeId+':'+key);
  const res = owned ? holdRemoveTalent(treeId,key) : holdBuyTalent(treeId,key);
  if(res.ok) commitTalents();
}

const RAR_COL  = {Common:'#7fbf5a',Unusual:'#d6bd45',Rare:'#4a5fd0',Epic:'#8b3fd0',
  Legendary:'#c0392b',Mythic:'#3fb8bd',Ultra:'#d0477f',Super:'#5ec46a',Eternal:'#cfcfcf',Unique:'#555555'};
const RAR_DIM  = {Common:'#3d5d2d',Unusual:'#6b5e22',Rare:'#253068',Epic:'#462068',
  Legendary:'#601c16',Mythic:'#1f5c5e',Ultra:'#682340',Super:'#2e6235',Eternal:'#666666',Unique:'#2a2a2a'};
const RAR_TEXT = {Common:'#8bc34a',Unusual:'#ffe066',Rare:'#6fa8ff',Epic:'#c07aff',
  Legendary:'#ff6b6b',Mythic:'#4dd0e1',Ultra:'#ff7ab8',Super:'#8ce99a',Eternal:'#e0e0e0',Unique:'#aaa'};

// 视图（依据用户 2026-11-06 高清录屏逐帧核对 + 官方 wiki 章节顺序）：
// 花朵固定在面板底部中央【作为旋转圆心，本身不动】；17 条天赋链围绕花朵
// 成整圈 360° 排布（fandom UI："a tree of talents stemming from the flower"），
// 每条链从花朵附近的低稀有度档位沿半径向外的方向延伸到高稀有度档位。
// 链内相邻档位用暗红【虚线】连接；不同种类之间不连线（只有分支接父档）。
// 分支天赋的起点抬到其前置父档的高度（wiki：分支由下至上从主干分出）。
// 交互只有「滑动旋转」：按住拖动绕【花朵】转，松手带惯性缓停；无平移、无缩放。
let talentRotation = 0;
// 顺序 = 官方 wiki 章节顺序（天赋树围绕花朵的环序，分支紧邻父天赋）：
// 最左 petalHealth(花瓣耐久)，最右 concentratedPoison(浓缩毒伤)。
const TALENT_ORDER = [
  'petalHealth','antennae','reach','duplicator','loadout','magnetism','reload',
  'petalRotation','health','secondChance','medic','summoner','sharpEdges',
  'bodyToxicity','luck','poison','concentratedPoison'
];
// 尺度：用户高清录屏实测 节点直径≈80px/800画布、花朵≈122px，换算到 580×460 面板
const TALENT_NODE = 54;                    // 节点图标直径
const TALENT_R0 = 140, TALENT_DR = 36;     // 第0档所在半径 / 每升一档向外扩
// 圆心 = 花朵位置（面板底部中央）→ 整棵树绕花朵旋转，花朵本身固定不动
const TALENT_CX = 290, TALENT_CY = 422;
const TALENT_DPHI = Math.PI*2/17;          // 相邻两棵天赋的圆心角
const TALENT_CENTER_COL = 8;               // health 位于环序第8列，静止时朝向正上方
// 每个档位的固定格位：列 = 天赋顺序，行 = 该天赋的第几档 + 分支抬升
const TALENT_WORLD = (()=>{
  const out=[];
  TALENT_ORDER.forEach((tid,col)=>{
    const t = TALENTS.find(x=>x.id===tid);
    if(!t) return;
    // 分支天赋（Requirements 指向别的天赋）起点抬到父档之上，数据直接取自 wiki
    let lift = 0;
    if(t.req && t.req.tree !== tid){
      const parent = TALENTS.find(x=>x.id===t.req.tree);
      if(parent){
        const ri = parent.tiers.findIndex(ti=>(ti.key||ti.r)===t.req.key);
        if(ri >= 0) lift = ri + 1;
      }
    }
    t.tiers.forEach((tier,idx)=>{
      out.push({t, idx, col, lift, id:talentId(t,tier), cum:talentCumulativeTP(t,idx)});
    });
  });
  return out;
})();

function buildTalentsUI(){
  const wrap = document.getElementById('talentNodes');
  const svg  = document.getElementById('talentLinks');
  if(!wrap || !svg) return;
  const tpc = document.getElementById('tpcount');
  if(tpc) tpc.textContent = tpAvailable();
  const fmt = v => { v = Math.round(v||0); return v >= 10000 ? (v/1000).toFixed(1).replace('.0','')+'k' : String(v); };
  const hpEl = document.getElementById('tstat-hp'); if(hpEl) hpEl.textContent = fmt(player.maxHp);
  const dmgEl = document.getElementById('tstat-dmg'); if(dmgEl) dmgEl.textContent = fmt(player.bodyDmg);
  wrap.innerHTML = ''; svg.innerHTML = '';
  const W = 580, H = 460;
  svg.setAttribute('viewBox', '0 0 '+W+' '+H);
  const NS = 'http://www.w3.org/2000/svg';
  // 极坐标：链按 TALENT_ORDER 沿圆周排布，档位沿半径向外长（笔直径向，非折线）。
  // 圆心 = 花朵 → 刚体旋转即绕花朵转，花朵固定；极角加常数，间距恒定不挤压。
  const posOf = (col, idx, lift)=>{
    const rho = TALENT_R0 + (idx+lift)*TALENT_DR;
    const phi = (col - TALENT_CENTER_COL)*TALENT_DPHI + talentRotation;
    return { x:TALENT_CX + rho*Math.sin(phi), y:TALENT_CY - rho*Math.cos(phi), rho };
  };
  const at = {};
  for(const it of TALENT_WORLD){
    const p = posOf(it.col, it.idx, it.lift);
    p.it = it;
    at[it.col+':'+it.idx] = p;
  }
  // 上下裁掉不完整图标；左右按原版保留半截节点（滚动时树冠延续到画面外）
  const m = TALENT_NODE/2 + 2;
  const visible = [];
  for(const key of Object.keys(at)){
    const p = at[key];
    if(p.x < -m || p.x > W+m || p.y < m+20 || p.y > H-m) continue;
    visible.push(p);
  }
  const centers = visible.map(p=>({x:p.x, y:p.y, key:p.it.col+':'+p.it.idx}));
  // 直线采样：确认线段不擦到除两端外的第三个节点 → 图标不与线路重合
  const lineClear = (a,b,skipA,skipB)=>{
    for(let i=1;i<12;i++){
      const t=i/12, x=a.x+(b.x-a.x)*t, y=a.y+(b.y-a.y)*t;
      for(const q of centers){
        if(q.key===skipA || q.key===skipB) continue;
        if(Math.hypot(q.x-x,q.y-y) < TALENT_NODE/2+3) return false;
      }
    }
    return true;
  };
  // 原版：暗红【虚线】直线段（用户高清录屏确认是虚线，不是实线）
  const line = (a,b,owned,skipA,skipB)=>{
    if(!lineClear(a,b,skipA,skipB)) return;
    const ln = document.createElementNS(NS,'line');
    ln.setAttribute('x1',a.x.toFixed(1)); ln.setAttribute('y1',a.y.toFixed(1));
    ln.setAttribute('x2',b.x.toFixed(1)); ln.setAttribute('y2',b.y.toFixed(1));
    // 录屏实测线色 ≈ rgb(164,44,70)（比玫红背景略深）
    ln.setAttribute('stroke', owned ? 'rgba(140,34,58,.95)' : 'rgba(164,44,70,.95)');
    ln.setAttribute('stroke-width','3');
    ln.setAttribute('stroke-linecap','round');
    ln.setAttribute('stroke-dasharray','7,6');
    svg.appendChild(ln);
  };
  const byCI = {};
  for(const p of visible) byCI[p.it.col+':'+p.it.idx] = p;
  // ① 只连【同一种类】：同链相邻档位的虚线
  for(const p of visible){
    const {col,idx} = p.it;
    const up = byCI[col+':'+(idx+1)];
    if(up) line(p, up,
      player.talents.has(p.it.id) && player.talents.has(up.it.id),
      col+':'+idx, col+':'+(idx+1));
  }
  // ② 分支连接：分支天赋首档 ← 其前置父档（wiki Requirements 精确到档位）。
  //    这是天赋树「分叉」的唯一跨种类连线（antennae/reach/duplicator/magnetism
  //    接 Loadout、secondChance 接 Health、bodyToxicity 接 SharpEdges、
  //    concentratedPoison 接 Poison）；除此之外不同种类之间不连线。
  for(const p of visible){
    const t = p.it.t;
    if(p.it.idx !== 0 || !t.req) continue;
    const parent = TALENTS.find(x=>x.id===t.req.tree);
    if(!parent) continue;
    const ri = parent.tiers.findIndex(ti=>(ti.key||ti.r)===t.req.key);
    if(ri < 0) continue;
    const pc = TALENT_ORDER.indexOf(parent.id);
    const q = byCI[pc+':'+ri];
    if(q) line(q, p,
      player.talents.has(p.it.id) && player.talents.has(q.it.id),
      pc+':'+ri, p.it.col+':'+p.it.idx);
  }
  // ③ 花朵枝干：从花朵向各条主干链的首档放射虚线（原版树根）
  const flower = {x:W/2, y:H-38};
  for(const p of visible){
    if(p.it.idx !== 0 || p.y > flower.y - 8) continue;
    const d = Math.hypot(p.x-flower.x, p.y-flower.y);
    if(d < 50 || d > 270) continue;
    line(flower, p, false, null, p.it.col+':'+p.it.idx);
  }
  // 节点：等大彩色圆底图标，彼此留空隙
  const meta = {};
  for(const p of visible){
    const it=p.it, t=it.t, tier=t.tiers[it.idx], id=it.id;
    const owned = player.talents.has(id);
    meta[id] = {tree:t, tier, owned, cum:it.cum};
    const node = document.createElement('div');
    node.className = 'tnode ' + (owned ? 'owned' : 'locked');
    node.dataset.id = id;
    node.style.left = p.x.toFixed(1)+'px'; node.style.top = p.y.toFixed(1)+'px';
    node.style.width = TALENT_NODE+'px'; node.style.height = TALENT_NODE+'px';
    const img = document.createElement('img');
    img.src = 'assets/talents/'+t.icon+'_('+tier.r+').webp';
    img.onerror = function(){ this.style.display='none'; };
    node.appendChild(img);
    if(!owned){
      const s = document.createElement('span');
      s.className = 'tcum'; s.textContent = it.cum;
      node.appendChild(s);
    }
    wrap.appendChild(node);
  }
  wrap._talentMeta = meta;
}

// 天赋交互：HOLD 长按加点/撤销 + tooltip（事件委托，重绘不丢）
(function(){
  const wrap = document.getElementById('talentNodes');
  const tree = document.getElementById('talentTree');
  const tip  = document.getElementById('ttip');
  if(!wrap || !tree || wrap.dataset.holdInit) return;
  wrap.dataset.holdInit = '1';
  let timer = null, holdNode = null;
  const clearHold = ()=>{ if(timer){clearTimeout(timer);timer=null;} if(holdNode){holdNode.classList.remove('holding');holdNode=null;} };
  const showTip = (node, e)=>{
    const meta = wrap._talentMeta; if(!meta || !tip) return;
    const m = meta[node.dataset.id]; if(!m) return;
    tip.innerHTML = '<div class="tt-name">'+m.tree.name+'</div>'
      + '<div class="tt-rar" style="color:'+(RAR_TEXT[m.tier.r]||'#fff')+'">'+m.tier.r+'</div>'
      + '<div class="tt-desc">'+m.tier.text+'</div>'
      + '<div class="tt-cost">'+m.cum+' TP total · '+m.tier.cost+' TP</div>'
      + '<div class="tt-hold">'+(m.owned?'HOLD to remove':'HOLD to upgrade')+'</div>';
    const px = parseFloat(node.style.left), py = parseFloat(node.style.top);
    tip.style.left = Math.max(4, Math.min(580-220, px+20))+'px';
    tip.style.top  = Math.max(4, Math.min(460-150, py-24))+'px';
    tip.style.display = 'block';
  };
  wrap.addEventListener('mousedown', (e)=>{
    const n = e.target.closest('.tnode'); if(!n) return;
    e.stopPropagation();
    stopInertia();   // 按住节点时让树停下，避免惯性漂移导致松手误判
    const id = n.dataset.id;
    const m = wrap._talentMeta && wrap._talentMeta[id];
    if(!m) return;
    holdNode = n; n.classList.add('holding');
    const [treeId,key] = id.split(':');
    timer = setTimeout(()=>{
      const res = m.owned ? holdRemoveTalent(treeId,key) : holdBuyTalent(treeId,key);
      n.classList.remove('holding'); timer = null; holdNode = null;
      if(res.ok) commitTalents();
    }, 450);
  });
  window.addEventListener('mouseup', ()=>{ clearHold(); });
  wrap.addEventListener('mouseover', (e)=>{ const n=e.target.closest('.tnode'); if(n) showTip(n,e); });
  wrap.addEventListener('mouseout', (e)=>{ if(e.target.closest('.tnode') && tip) tip.style.display='none'; });
  // 原版：只能绕圆心旋转整棵树（滑动切换）；不允许上下平移，也不允许缩放。
  // 拖动跟手 + 松手惯性缓停；环是整圈 360°，转到头自然接回开头，无死区。
  let dragging=false, lastX=0, lastT=0, rotVel=0, inertiaId=0;
  const ROT_K = 0.0009;   // 像素 → 弧度
  const wrapRot = ()=>{ const T=Math.PI*2; talentRotation = ((talentRotation+Math.PI)%T+T)%T - Math.PI; };
  const stopInertia = ()=>{ if(inertiaId){ cancelAnimationFrame(inertiaId); inertiaId=0; } };
  const startInertia = ()=>{
    stopInertia();
    if(Math.abs(rotVel) < 0.00002) return;
    let prev = performance.now();
    const step = (now)=>{
      const dt = Math.min(50, now-prev); prev = now;
      talentRotation += rotVel*dt; wrapRot();
      rotVel *= Math.pow(0.94, dt/16.7);   // 指数阻尼 → 滑动流畅、缓停自然
      buildTalentsUI();
      if(Math.abs(rotVel) > 0.00002) inertiaId = requestAnimationFrame(step);
      else inertiaId = 0;
    };
    inertiaId = requestAnimationFrame(step);
  };
  const dragStart = (x)=>{
    dragging=true; stopInertia(); rotVel=0;
    lastX=x; lastT=performance.now();
    tree.classList.add('rotating');
  };
  const dragMove = (x)=>{
    if(!dragging) return;
    const dx=x-lastX, now=performance.now();
    const dtf=Math.max(1, now-lastT);
    talentRotation += dx*ROT_K; wrapRot();
    rotVel = 0.65*rotVel + 0.35*(dx*ROT_K/dtf);   // 平滑速度估计
    lastX=x; lastT=now;
    buildTalentsUI();
  };
  const dragEnd = ()=>{
    if(!dragging) return;
    dragging=false; tree.classList.remove('rotating');
    startInertia();
  };
  tree.addEventListener('mousedown', (e)=>{
    if(e.target.closest('.tnode')) return;
    dragStart(e.clientX);
  });
  window.addEventListener('mousemove', (e)=>{ dragMove(e.clientX); });
  window.addEventListener('mouseup', dragEnd);
  tree.addEventListener('touchstart', (e)=>{
    if(e.target.closest('.tnode')) return;
    dragStart(e.touches[0].clientX);
  }, {passive:true});
  tree.addEventListener('touchmove', (e)=>{
    if(!dragging) return;
    e.preventDefault();
    dragMove(e.touches[0].clientX);
  }, {passive:false});
  window.addEventListener('touchend', dragEnd);
})();
function toggleTalents(){
  if(!elTalents) return;
  const open = elTalents.classList.contains('show');
  if(open){ elTalents.classList.remove('show'); return; }
  const cp = document.getElementById('craft'); if(cp) cp.style.display = 'none';
  const mp = document.getElementById('mobs');  if(mp) mp.style.display = 'none';
  const iv = document.getElementById('inventory'); if(iv) iv.style.display = 'none';
  elTalents.classList.add('show');
  buildTalentsUI();
}
document.getElementById('talentBtn').addEventListener('click', toggleTalents);
document.getElementById('tclose').addEventListener('click', toggleTalents);
const elTReset = document.getElementById('treset');
if(elTReset) elTReset.addEventListener('click', ()=>{
  player.talents = new Set();
  player.tpSpent = 0;
  applyTalents(); recompute();
  if(typeof syncSummons === 'function') syncSummons();
  buildTalentsUI();
});
window.addEventListener('keydown', e=>{ if((e.key==='x'||e.key==='X') && state===STATE.PLAY) toggleTalents(); });   // 原版 X 打开天赋

// ---------- 合成（先用按钮占位，等正式的合成 UI） ----------
// 5 片同名同稀有度 → 1 片下一级；成功率照原版：
// Common→Unusual 64% / Unusual→Rare 32% / Rare→Epic 16% / Epic→Legendary 8%
// Legendary→Mythic 4% / Mythic→Ultra 2% / Ultra→Super 1% / Super→Eternal 0.1%
// Unique 不可合成（原作要用 Titan 锻造）
const CRAFT_CHAIN = ['Common','Unusual','Rare','Epic','Legendary','Mythic','Ultra','Super','Eternal'];
const CRAFT_RATE  = {Common:0.64, Unusual:0.32, Rare:0.16, Epic:0.08, Legendary:0.04,
                     Mythic:0.02, Ultra:0.01, Super:0.001};
const CRAFT_COST  = 5;
const BAG_MAX     = Infinity;   // 背包取消上限（用户要求：不再限制卡片数量）
const RARITY_CN   = {Common:'Common',Unusual:'Unusual',Rare:'Rare',Epic:'Epic',Legendary:'Legendary',
                     Mythic:'Mythic',Ultra:'Ultra',Super:'Super',Eternal:'Eternal',Unique:'Unique'};

const elCraft      = document.getElementById('craft');
const elCraftList  = document.getElementById('craftlist');
const elCStack     = document.getElementById('cstack');
const elCResult    = document.getElementById('cresult');
const elCSlots     = document.getElementById('cslots');
const elCDo        = document.getElementById('cdo');
const elCBag       = document.getElementById('cbag');
const elCRate      = document.getElementById('crate');
const elToast      = document.getElementById('toast');
let toastTimer = 0;

function toast(msg, kind){
  if(!elToast) return;
  elToast.textContent = msg;
  elToast.className = 'show' + (kind ? ' '+kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ elToast.className = ''; }, 1700);
}

// ============================================================
//  掉落稀有度的真实分布（wiki：official-florrio 每只怪页面的掉落表）
//  每只怪有一张「花瓣 × 掉率」表，每一行是「这只怪在某个稀有度下，
//  掉出来的花瓣是各级的概率」。用 Centipede 那张表归一化后得到：
//    稀有怪(Rare)   → 下一档 24.3% / 本体 72.2% / 高一档 3.5%
//    史诗怪          → 下一档 58.2% / 本体 39.2% / 高一档 2.6%
//    ……等级越高，掉出来的东西越偏向「低一档」
//  一只怪同一时间可以掉好几片（表里每一项各自独立判定）。
// ============================================================
const DROP_RAR_W = {
  Common:   [[0,0.845],[1,0.155]],
  Unusual:  [[-1,0.790],[0,0.210]],
  Rare:     [[-1,0.243],[0,0.722],[1,0.035]],
  Epic:     [[-1,0.582],[0,0.392],[1,0.026]],
  Legendary:[[-1,0.592],[0,0.398],[1,0.010]],
  Mythic:   [[-1,0.596],[0,0.402],[1,0.002]],
  Ultra:    [[-1,0.792],[0,0.207],[1,0.001]],
  Super:    [[-1,0.814],[0,0.186]],
  Eternal:  [[-1,0.814],[0,0.186]],
  Unique:   [[-1,0.814],[0,0.186]]
};
// 这个怪在这个稀有度下，掉出来的花瓣落在每个稀有度上的概率（返回 [[rarity, p], ...]）
function dropRaritySplit(mobRar){
  const i = MOB_RARITY.indexOf(mobRar);
  const w = DROP_RAR_W[mobRar] || [[0,0.85],[1,0.15]];
  const out = [];
  let tot = 0;
  for(const [off, p] of w){
    const r = MOB_RARITY[i + off];
    if(!r || !(p > 0)) continue;
    out.push([r, p]); tot += p;
  }
  if(!out.length) return [[mobRar, 1]];
  for(const o of out) o[1] /= tot;          // 归一化
  return out;
}
function rollDropRarity(mobRar){
  const split = dropRaritySplit(mobRar);
  let x = Math.random();
  for(const [r,p] of split){ x -= p; if(x <= 0) return r; }
  return split[split.length-1][0];
}

function nextRarity(r){
  const i = CRAFT_CHAIN.indexOf(r);
  return (i >= 0 && i < CRAFT_CHAIN.length-1) ? CRAFT_CHAIN[i+1] : null;
}
// 幸运天赋把成功率往上抬一点（每级 +50% 的幸运值）
let CRAFT_FORCE = -1;        // ?cforce=1 / 0 强制成功/失败（截图验证用）
function craftChance(r){
  if(CRAFT_FORCE >= 0) return CRAFT_FORCE;
  const base = CRAFT_RATE[r];
  if(base == null) return 0;
  return Math.min(0.95, base + (player.luck||0)*0.5);
}
// 0.1% 这种小数不能被 Math.round 抹成 0
function fmtRate(r){
  const p = r*100;
  return (p < 1 ? p.toFixed(1) : Math.round(p)) + '%';
}

// 捡到东西时：主槽还有空位就直接装备进去
function equipIntoEmptySlot(name, rarity){
  if(!player.equipped) return false;
  for(let i=0;i<player.equipped.length;i++){
    if(!player.equipped[i]){
      player.equipped[i] = makePetalInst(name, rarity);
      recompute();
      return true;
    }
  }
  // 主槽满了：副槽有空位就放副槽
  if(player.alt){
    for(let i=0;i<player.alt.length;i++){
      if(!player.alt[i]){
        player.alt[i] = makePetalInst(name, rarity);
        return true;
      }
    }
  }
  return false;
}

function countInBag(name, rarity){
  let n = 0;
  for(const it of player.backpack) if(it.name===name && it.rarity===rarity) n++;
  return n;
}
// 从背包里拿 n 片出来（放到台面上），返回真正拿到几片
function takeFromBag(name, rarity, n){
  let left = n;
  for(let i=player.backpack.length-1; i>=0 && left>0; i--){
    const it = player.backpack[i];
    if(it.name===name && it.rarity===rarity){ player.backpack.splice(i,1); left--; }
  }
  return n - left;
}
// 放回背包
function giveToBag(name, rarity, n){
  for(let i=0;i<n;i++) player.backpack.push({ name, rarity });
}

// 背包里按 名称+稀有度 归组，按名字字母序（wiki：合成面板按字母排列）
function bagGroups(){
  const m = new Map();
  for(const it of player.backpack){
    const k = it.name+'|'+it.rarity;
    let e = m.get(k);
    if(!e){ e = {name:it.name, rarity:it.rarity, n:0}; m.set(k,e); }
    e.n++;
  }
  return [...m.values()].sort((a,b)=> a.name.localeCompare(b.name) ||
                                     CRAFT_CHAIN.indexOf(a.rarity) - CRAFT_CHAIN.indexOf(b.rarity));
}

// ============================================================
//  合成台（复刻 florr 的 Crafting 面板）
//  · 点花瓣 → 5 片飞到台面上摞起来；Shift+点 → 一次放满（有几批放几批）
//  · 台面上点 Craft → 转两圈，成功出 1 片更高稀有度；失败损失 1~4 片（其余退回）
//    这个 1~4 片的规则来自 wiki 的期望值：Common→Unusual 平均要 6.40625 片，
//    5×0.64 + 2.5×0.36 = 4.1，4.1/0.64 = 6.40625，正好对上「失败平均损失 2.5 片」
//  · Alt+点 Craft → 把台面上所有批次一次合成完
// ============================================================
let cSel = null;        // {name, rarity} 当前摆在台面上的那组
let cCount = 0;         // 台面上实际放着几片花瓣（一定是 5 的倍数，已经从背包扣掉）
let cBatch = 0;         // 台面上排了几批（= cCount / 5）
let cBusy = false;      // 动画播放中，禁止重复点击

function craftBg(name, rar){ return 'url("' + petalIconSrc(name, rar) + '")'; }

function craftOpen(){ return !!(elCraft && elCraft.style.display === 'block'); }

function updateCraftBtn(){
  if(!elCDo) return;
  if(cSel && cBatch > 0){
    const p = craftChance(cSel.rarity);
    // 按钮颜色跟「合成出来的那一级」一致：Common→Unusual 用 Unusual 色，以此类推
    const next = nextRarity(cSel.rarity);
    elCDo.disabled = cBusy;
    elCDo.style.setProperty('--ccol', RARITY_COLOR[next] || '#8b8b8b');
    elCDo.querySelector('b').textContent = 'Craft';
    if(elCRate) elCRate.textContent = 'Success: ' + fmtRate(p);
  } else {
    elCDo.disabled = true;
    elCDo.style.setProperty('--ccol', '#8b8b8b');
    elCDo.querySelector('b').textContent = 'Craft';
    if(elCRate) elCRate.textContent = 'Success: —';
  }
}

// 台面：5 张卡分别落在正五边形的 5 个槽上（位置在 CSS 里）
function renderStack(anim){
  if(!elCStack) return;
  collectCraftPending();                 // 又要摆花瓣了：先上一次的结果收回背包
  stopCraftShow();                       // 重新摆台面时停掉上一次结果的持续粒子
  elCStack.classList.remove('busy','boom','fail');
  elCStack.innerHTML = '';
  if(!cSel) return;
  // 不够一批（1~4 张零头）：台面就摆一张卡，数量写在角标上
  if(cBatch < 1){
    if(cCount > 0) showResults(cSel.name, cSel.rarity, cCount);
    return;
  }
  const url = craftBg(cSel.name, cSel.rarity);
  // 每张卡右上角的数量 = 台面上放的花瓣数 ÷ 5（点一次柜子 +5，所以是 1、2、3…）
  const per = Math.max(1, cBatch);
  for(let i=0;i<CRAFT_COST;i++){
    const d = document.createElement('div');
    d.className = 'cstk' + (anim ? ' in' : '');
    d.style.backgroundImage = url;
    d.dataset.ptip = cSel.name + '|' + cSel.rarity;   // 台面上的卡也能悬停看数据
    d.style.zIndex = String(i+1);
    const cn = document.createElement('span');
    cn.className = 'cn';
    cn.textContent = '×' + per;
    d.appendChild(cn);
    if(anim){ d.style.animationDelay = (i*0.055).toFixed(3) + 's'; d.style.opacity = '0'; }
    else d.style.opacity = '1';
    elCStack.appendChild(d);
  }
  // 动画放完就落到最终姿态（万一浏览器把 CSS 动画挂住了也不会停在半路）
  if(anim){
    const tok = ++_stackTok;
    setTimeout(()=>{
      if(tok !== _stackTok || !elCStack) return;
      for(const c of elCStack.querySelectorAll('.cstk')){
        c.classList.remove('in');
        c.style.opacity = '1';
      }
    }, 640);
  }
}
let _stackTok = 0;

// ---- 合成时的转圈动画 ----
// 照 1280×720 录屏逐帧量出来的样子：5 张卡不是「整摞一起转」，而是
//   ① 每张卡绕台面中心公转一圈（稀有度越高圈数越多）
//   ② 公转半径中途胀大再收回（甩出去、收回来）
//   ③ 卡片自己在转，中途斜得最厉害，落地时正好回正
// 转完就停在正五边形的 5 个槽位上，然后才结算。
const ORBIT_R = 44;          // 与 CSS 里五边形的半径一致
function spinStack(turns, dur, from){
  if(!elCStack) return 0;
  const cards = [...elCStack.querySelectorAll('.cstk')];
  if(!cards.length) return 0;
  const ms = Math.round(dur * 1000);
  const N = 20;
  const t0 = Math.max(0, Math.min(0.98, from || 0));    // 从 t0 接着转（重开面板时用）
  cards.forEach((d, i)=>{
    d.classList.remove('in');
    d.style.opacity = '1';
    d.style.animation = 'none';
    d.style.translate = '0px 0px';        // 五边形位移改由下面的 transform 接管
    const a0 = i * 72;                    // 第 1 张在正上方，顺时针每 72° 一张
    const frames = [];
    for(let k=0;k<=N;k++){
      const t = t0 + (1 - t0) * (k/N);
      const bulge = Math.sin(Math.PI * t);           // 0→1→0：先甩出去再收回来
      const ang = a0 + turns * 360 * t;
      const R = ORBIT_R + 18 * bulge;                // 静止 44 → 甩到 62
      const self = 35 * bulge;                       // 卡片自身倾斜幅度
      const sc = 1 + 0.03 * bulge;
      frames.push({
        transform: 'rotate(' + ang + 'deg) translateY(' + (-R) + 'px) ' +
                   'rotate(' + (-ang + self) + 'deg) scale(' + sc + ')',
        offset: t
      });
    }
    d.animate(frames, {
      duration: ms,
      easing: 'cubic-bezier(.36,.06,.3,1)',
      fill: 'forwards'
    });
  });
  return ms;
}

// 5 张花瓣从柜子里飞到台面的 5 个空槽上（每个槽一格，最后再叠到中心）
function flyPetalToTable(slot){                    // slot: 柜子里的格子，或已经量好的 rect
  const src = (slot && slot.nodeType) ? slot.getBoundingClientRect() : slot;
  const targets = [];
  const marks = elCSlots ? elCSlots.querySelectorAll('i') : [];
  for(const m of marks){
    const r = m.getBoundingClientRect();
    targets.push({ x: r.left + r.width/2, y: r.top + r.height/2, w: r.width });
  }
  if(!targets.length){                       // 兜底：飞到台面中心
    const b = elCStack.getBoundingClientRect();
    for(let i=0;i<CRAFT_COST;i++) targets.push({x:b.left+b.width/2, y:b.top+b.height/2, w:52});
  }
  const url = craftBg(cSel.name, cSel.rarity);
  const sx = src.left + src.width/2, sy = src.top + src.height/2;
  for(let i=0;i<CRAFT_COST;i++){
    const tg = targets[i % targets.length];
    const f = document.createElement('div');
    f.className = 'flyer';
    f.style.backgroundImage = url;
    f.style.width = src.width + 'px';
    f.style.height = src.height + 'px';
    f.style.left = (sx - src.width/2) + 'px';
    f.style.top  = (sy - src.height/2) + 'px';
    document.body.appendChild(f);
    const dx = tg.x - sx, dy = tg.y - sy;
    const sc = tg.w / Math.max(1, src.width);
    const rot = (Math.random()*2-1)*24;
    const lift = 34 + Math.random()*40;
    const dur = 330 + i*22;
    const an = f.animate([
      { transform:'translate(0,0) scale(1) rotate(0deg)', opacity:.2, offset:0 },
      { transform:`translate(${dx*0.6}px,${dy*0.45-lift}px) scale(${(1+sc)/1.7}) rotate(${rot*0.55}deg)`,
        opacity:1, offset:.58 },
      { transform:`translate(${dx}px,${dy}px) scale(${sc}) rotate(${rot}deg)`, opacity:1, offset:1 }
    ], { duration:dur, delay:i*46, easing:'cubic-bezier(.3,.02,.4,1)', fill:'both' });
    an.onfinish = ()=> f.remove();
    // 兜底：动画被挂住也要把飞行卡片清掉，不然会一直贴在屏幕上
    setTimeout(()=>{ if(f.parentNode) f.remove(); }, dur + i*46 + 160);
  }
  return 4*46 + 352 + 90;      // 最后一张落地的时间
}

// 成功时台面上弹出新卡片 + 白圈
function showResult(name, rarity, ring){
  if(!elCResult) return;
  clearTimeout(_ringT); clearTimeout(_resT);
  elCResult.classList.remove('show','ring');
  if(!name){
    elCResult.style.backgroundImage='';
    elCResult.style.opacity = '0';
    elCResult.style.transform = '';
    return;
  }
  elCResult.style.backgroundImage = craftBg(name, rarity);
  elCResult.style.opacity = '0';
  elCResult.style.transform = '';
  void elCResult.offsetWidth;
  elCResult.classList.add('show');
  if(ring) elCResult.classList.add('ring');
  // 白圈只放一次；缩放动画也在 470ms 后强制落位，
  // 否则 headless/低帧率下动画会挂住，卡片就停在 scale(.25) 变成一小块
  _ringT = setTimeout(()=>{ if(elCResult) elCResult.classList.remove('ring'); }, 560);
  _resT = setTimeout(()=>{
    if(!elCResult) return;
    elCResult.classList.remove('show');
    elCResult.style.opacity = '1';
    elCResult.style.transform = 'scale(1)';
  }, 470);
}
let _ringT = 0, _resT = 0;

// 合成出来的结果卡：出 1 张就放正中；一次合了几批出几张就绕中心摆一小圈
// 合成出来的卡片一直摆在台面上（用户不点就不消失）；Ultra 及以上还会
// 一直冒对应等级颜色的粒子，并且不停地「变大变小」。
let craftShowTimer = null, craftShowAnim = null, craftShowTO = null;
let craftPending = null;                 // 合成出来、还摆在台面上没收进背包的成果
let craftRun     = null;                 // 正在转的那一炉：{name,rar,turns,spinMs,t0,cCount0}
function stopCraftShow(){
  if(craftShowTimer){ clearInterval(craftShowTimer); craftShowTimer = null; }
  if(craftShowTO){ clearTimeout(craftShowTO); craftShowTO = null; }
  if(craftShowAnim){ try{ craftShowAnim.cancel(); }catch(e){} craftShowAnim = null; }
}
function startCraftShow(name, rarity, n){
  stopCraftShow();
  showResults(name, rarity, n, true);          // 入场：pop 动画（所有等级都一样）
  const card = elCStack && elCStack.querySelector('.cstk');
  if(!card) return;
  // 所有等级：pop 落位之后就一直「变大变小」地呼吸
  if(card.animate){
    craftShowTO = setTimeout(()=>{
      craftShowTO = null;
      try{
        craftShowAnim = card.animate([
          { transform:'scale(1)' }, { transform:'scale(1.13)' }, { transform:'scale(1)' }
        ], { duration:1150, iterations:Infinity, easing:'ease-in-out' });
      }catch(e){}
    }, 320);
  }
  // Ultra 及以上：额外一直冒这一等级颜色的粒子
  if(RARITIES.indexOf(rarity) >= RARITIES.indexOf('Ultra')){
    craftShowTimer = setInterval(()=>{ if(craftOpen()) burstParticles(rarity, false, 4); }, 280);
  }
}

// 点一下台面上合成出来的花瓣 -> 收回背包（Inventory），台面回到起始状态
function takeCraftResult(){
  if(!craftPending) return;
  const nm = craftPending.name, rr = craftPending.rarity, n = craftPending.n;
  giveToBag(nm, rr, n);                 // 回到 Inventory
  craftPending = null;
  stopCraftShow();
  if(elCStack) elCStack.innerHTML = '';
  cSel = null; cCount = 0; cBatch = 0;
  if(elCSlots) elCSlots.classList.remove('off');     // 空槽重新显示 = 起始状态
  if(elCResult){ elCResult.classList.remove('show','ring'); elCResult.style.backgroundImage='';
                 elCResult.style.opacity='0'; elCResult.style.transform=''; }
  updateCraftBtn(); buildCraftUI(); renderInventory();
  toast('Collected ' + (n>1 ? n+'\u00d7 ' : '') + RARITY_CN[rr] + ' ' + nm, 'good');
}
// 离开「展示结果」这个状态时兜底收回，保证不会白白丢掉
function collectCraftPending(){
  if(!craftPending) return;
  giveToBag(craftPending.name, craftPending.rarity, craftPending.n);
  craftPending = null;
}

function showResults(name, rarity, n, pop){
  if(!elCStack) return;
  stopCraftShow();
  elCStack.classList.remove('busy','boom','fail');
  elCStack.innerHTML = '';
  _stackTok++;
  const url = craftBg(name, rarity);
  // 只摆一张卡：合出几张全写在右上角角标里（用户要求）
  const d = document.createElement('div');
  d.className = 'cstk' + (pop ? ' popit take' : '');
  d.style.backgroundImage = url;
  d.style.opacity = '1';
  d.style.translate = '0 0';
  d.style.zIndex = '10';
  if(pop){ d.title = 'Click to collect'; d.addEventListener('click', takeCraftResult); }
  const cn = document.createElement('span');
  cn.className = 'cn';
  cn.textContent = '×' + n;
  d.appendChild(cn);
  elCStack.appendChild(d);
}

// 合成成功：台面周围炸出一圈「合成出来那一级」颜色的粒子
function burstParticles(rarity, dull, count){
  const host = document.getElementById('ctable');
  if(!host) return;
  // 合成 x → y：成功粒子用 y（合成出来那一级）的颜色，失败粒子用 x（放上去那一级）的颜色
  const col = RARITY_COLOR[rarity] || '#ffffff';
  const N = count || 22;
  for(let i=0;i<N;i++){
    const p = document.createElement('div');
    p.className = 'cpart';
    const sz = 7 + Math.random()*7;                 // 7~14px，肉眼看得见
    p.style.width = sz.toFixed(1) + 'px';
    p.style.height = sz.toFixed(1) + 'px';
    p.style.marginLeft = (-sz/2).toFixed(1) + 'px';
    p.style.marginTop  = (-sz/2).toFixed(1) + 'px';
    // 白芯 + 稀有度色外壳，像小花瓣/光点
    p.style.background = 'radial-gradient(circle at 50% 50%, #fff 0%, #fff 16%, ' + col + ' 34%, ' + col + ' 100%)';
    p.style.boxShadow  = dull ? ('0 0 6px 1px ' + col) : ('0 0 10px 2px ' + col);
    host.appendChild(p);
    const a  = (i/N)*Math.PI*2 + Math.random()*0.45;
    const r0 = 16 + Math.random()*10;
    const r1 = r0 + 40 + Math.random()*40;
    const x0 = Math.cos(a)*r0, y0 = Math.sin(a)*r0;
    const x1 = Math.cos(a)*r1, y1 = Math.sin(a)*r1;
    const dur = 520 + Math.random()*320;
    const spin = (Math.random()*2-1)*420;
    const an = p.animate([
      { transform:`translate(${x0.toFixed(1)}px,${y0.toFixed(1)}px) scale(.35) rotate(0deg)`, opacity:0 },
      { transform:`translate(${(x0*1.3).toFixed(1)}px,${(y0*1.3).toFixed(1)}px) scale(1.15) rotate(${(spin*.4).toFixed(0)}deg)`,
        opacity:1, offset:.2 },
      { transform:`translate(${x1.toFixed(1)}px,${y1.toFixed(1)}px) scale(.2) rotate(${spin.toFixed(0)}deg)`, opacity:0 }
    ], { duration:dur, easing:'cubic-bezier(.16,.66,.36,1)', fill:'both' });
    an.onfinish = ()=> p.remove();
    setTimeout(()=>{ if(p.parentNode) p.remove(); }, dur + 260);   // 兜底
  }
}

function clearTable(){
  if(craftRun) return;                   // 合成还在转：千万别清台，不然动画会断
  collectCraftPending();                 // 结果还没点走的话，收回背包，别弄丢
  stopCraftShow();                       // 关面板 / 换花瓣时停掉持续粒子
  // 台上没合成的花瓣直接回背包（点槽位收回 / 换花瓣 / 关闭面板都走这里）
  if(cSel && cCount > 0) giveToBag(cSel.name, cSel.rarity, cCount);
  cSel = null; cCount = 0; cBatch = 0;
  if(elCSlots) elCSlots.classList.remove('off');
  renderStack(false);
  if(elCResult){ elCResult.classList.remove('show','ring'); elCResult.style.backgroundImage='';
                 elCResult.style.opacity='0'; elCResult.style.transform=''; }
  updateCraftBtn();
  buildCraftUI();
  renderInventory();
}

// ---- 把花瓣放上台面：点一次 +5 片（Shift 直接拉满），同时从背包里扣掉 ----
function placePetal(g, all){
  if(cBusy) return;
  const same = !!(cSel && cSel.name === g.name && cSel.rarity === g.rarity);
  // 换一种花瓣：先把台面上原来的收回去
  if(cSel && !same){
    giveToBag(cSel.name, cSel.rarity, cCount);
    cSel = null; cCount = 0; cBatch = 0;
  }
  const have = countInBag(g.name, g.rarity);
  const onTable = same ? cCount : 0;                 // 同一种花瓣已经放上去的数量
  const total = have + onTable;
  if(total < CRAFT_COST){ toast('Need ' + CRAFT_COST + ' identical petals', 'bad'); return; }
  // Shift：台面上的总数凑成「不超过 x 的最大 5 的倍数」（x = 背包 + 台面）
  const add = all ? (Math.floor(total / CRAFT_COST) * CRAFT_COST - onTable) : CRAFT_COST;
  if(add <= 0) return;
  const got = takeFromBag(g.name, g.rarity, add);            // 背包里真的少掉这么多
  if(got <= 0) return;
  const slot = elCraftList.querySelector('.cslot[data-k="'+g.name+'|'+g.rarity+'"]');
  const rect = slot ? slot.getBoundingClientRect() : null;    // 重建柜子前先量好起点
  cSel = { name:g.name, rarity:g.rarity };
  cCount += got;
  cBatch = Math.max(1, Math.round(cCount / CRAFT_COST));
  // 注意：这里先不动 5 个空槽——卡片还在飞，空槽一直留着，落地后才收起来
  if(elCResult){ elCResult.classList.remove('show','ring'); elCResult.style.backgroundImage='';
                 elCResult.style.opacity='0'; elCResult.style.transform=''; }
  const wait = rect ? flyPetalToTable(rect) : 0;
  if(elCStack) elCStack.innerHTML = '';
  buildCraftUI();                       // 柜子里的计数立刻减掉
  updateCraftBtn();
  elCDo.disabled = true;
  setTimeout(()=>{
    if(!cSel) return;
    renderStack(true);
    if(elCSlots) elCSlots.classList.add('off');    // 卡片落位了，空槽这才收起来
    updateCraftBtn();
  }, wait);
}

// ---- 合成一次 ----
function craftOne(){
  return new Promise(resolve=>{
    if(!cSel || cCount < CRAFT_COST){ resolve(false); return; }
    const name = cSel.name, rar = cSel.rarity;
    // 一次把台面上所有「整批」都合掉，不再限制一次只能合 5 张。
    //   sets    = 台面上能凑出的 5 张的批数，每批独立掷一次 → 批数越多越可能一次合出多张
    //   surplus = 不够 5 张的零头，只可能是 0~4，永远留在台面上
    const sets = Math.floor(cCount / CRAFT_COST);
    const surplus = cCount - sets * CRAFT_COST;      // 不够 5 张的零头（0~4）
    const p = craftChance(rar);
    const next = nextRarity(rar);
    let got = 0, failed = 0;
    for(let i=0;i<sets;i++){
      if(next && Math.random() < p) got++;           // 成功：这一批出 1 张上一级（多批就可能一次合出多张）
      else failed++;                                 // 失败：这一批整批销毁（不再「每 5 个退 1~4 个」）
    }
    // 合出来的先摆在台面上（点它才收回背包），不直接塞进 Inventory
    if(got) craftPending = { name: name, rarity: next, n: got };
    // 台面最后剩下的「总数」封顶 1~4：先留零头；正好整除但有批次失败时也只留 1~4 个
    let remain = surplus;
    if(remain === 0 && failed > 0) remain = 1 + ((Math.random()*4)|0);
    if(remain > cCount) remain = cCount;
    const destroyed = cCount - got * CRAFT_COST - remain;   // 这一炉总共烧掉多少张
    cCount = remain; cBatch = 0;
    cBusy = true;
    elCDo.disabled = true;
    // 圈数：Common→Unusual 1 圈，Unusual→Rare 2 圈…每次固定 1 秒 1 圈
    const CRAFT_SPINS = [1,2,3,4,5,6,7,8];
    const turns = CRAFT_SPINS[Math.max(0, CRAFT_CHAIN.indexOf(rar))] || 8;
    const spinMs = spinStack(turns, turns * 0.5);
    // 记住这一炉：关掉面板再打开时，接着把剩下的圈转完（动画不会消失）
    craftRun = { name:name, rar:rar, turns:turns, spinMs:(spinMs || Math.round(turns*500)),
                 t0:performance.now(), cCount0: sets * CRAFT_COST };
    setTimeout(()=>{
      craftRun = null;                       // 这一炉转完了
      if(elCStack) elCStack.classList.remove('busy');
      DBG.crafts = (DBG.crafts||0) + 1;
      if(got) DBG.craftOk = (DBG.craftOk||0) + got;
      if(got){
        if(elCStack) elCStack.classList.add('boom');
        burstParticles(next);              // 成功：粒子 = 合成出来那一级(y)的颜色
        startCraftShow(name, next, got);   // 台面摆出结果（角标 ×n），不点就一直在
        toast('Crafted ' + (got>1 ? got+'\u00d7 ' : '') + RARITY_CN[next] + ' ' + name + '!' +
              (failed ? ' \u00b7 ' + failed + ' batch' + (failed>1?'es':'') + ' failed' : ''), 'good');
        // 合出 Super / Eternal：用对应等级的颜色在聊天框播报
        if(next === 'Super' || next === 'Eternal'){
          chatPrint((got>1 ? got+'\u00d7 ' : 'A ') + next + ' ' + (name||'').replace(/_/g,' ') +
                    ' has been crafted by ' + player.name + '!', 'ok', RARITY_COLOR[next] || '#fff');
        }
      } else {
        if(elCStack) elCStack.classList.add('fail');
        burstParticles(rar, true);          // 失败：粒子 = 放上去那一级(x)的颜色
        toast('Craft failed \u00b7 ' + destroyed + ' destroyed' +
              (remain ? ' \u00b7 ' + remain + ' back' : ''), 'bad');
      }
      setTimeout(()=>{
        // 最后剩下的 1~4 个直接回背包（Inventory），台面上不摆 —— 凑不满 5 张摆着也没意义
        if(remain > 0) giveToBag(name, rar, remain);
        if(got){
          // 合成成功：结果卡继续留在台面上（点它才收回背包），此时隐藏台面空槽
          cSel = null; cCount = 0; cBatch = 0;
          if(elCSlots) elCSlots.classList.add('off');
        } else {
          stopCraftShow();
          if(elCStack) elCStack.innerHTML = '';
          cSel = null; cCount = 0; cBatch = 0;
          if(elCSlots) elCSlots.classList.remove('off');
        }
        cBusy = false;
        updateCraftBtn();
        buildCraftUI();
        renderInventory();
        resolve(got > 0);
      }, got ? 380 : 360);
    }, spinMs + 40);
  });
}

async function doCraft(all){
  if(cBusy || !cSel || cCount < CRAFT_COST) return;
  await craftOne();                     // 不管放了几批，只转一次
}

// 花瓣柜：一行一种花瓣，八列对应 Common → Super（wiki/florr 的实际排布）
const CRAFT_COLS = ['Common','Unusual','Rare','Epic','Legendary','Mythic','Ultra','Super'];   // 合成柜固定 8 列 Common→Super

function buildCraftUI(){
  if(!elCraftList) return;
  elCraftList.innerHTML = '';
  // 名称→稀有度→数量 的计数表（背包可能上百片，别每格扫一遍）
  const cnt = new Map();
  for(const it of player.backpack){
    const k = it.name + '|' + it.rarity;
    cnt.set(k, (cnt.get(k)||0) + 1);
  }
  const names = [...new Set(player.backpack.map(i=>i.name))]
                .sort((a,b)=> a.localeCompare(b));
  const CELLS = CRAFT_COLS.length;
  let filled = 0;
  for(const nm of names){
    for(const rar of CRAFT_COLS){
      const n = cnt.get(nm+'|'+rar) || 0;
      const d = document.createElement('div');
      d.className = 'cslot' + (n>0 ? ' fill' : '') + (n < CRAFT_COST ? ' no' : '');
      d.dataset.k = nm + '|' + rar;
      if(n > 0){
        d.style.backgroundImage = craftBg(nm, rar);
        d.dataset.ptip = nm + '|' + rar;      // 悬停显示花瓣数据卡（跟主槽一样）
        d.title = nm + ' · ' + rar + ' ×' + n + (n>=CRAFT_COST ? '  (click to craft)' : '');
        const cn = document.createElement('div');
        cn.className = 'cn'; cn.textContent = '×' + n;
        d.appendChild(cn);
        if(cSel && cSel.name===nm && cSel.rarity===rar) d.classList.add('sel');
        if(n >= CRAFT_COST){
          d.addEventListener('click', ev=>{
            placePetal({name:nm, rarity:rar}, ev.shiftKey);
            if(ev.altKey) doCraft(ev.shiftKey);      // Alt+点：直接开合
          });
        }
      }
      elCraftList.appendChild(d);
      filled++;
    }
  }
  // 空格子：把整屏铺满（florr 的花瓣柜是固定格数，空位也画出来）
  const rowsHave = Math.ceil(filled / CELLS);
  const rowsNeed = Math.max(5, rowsHave);
  for(let i = filled; i < rowsNeed*CELLS; i++){
    const e = document.createElement('div');
    e.className = 'cslot';
    elCraftList.appendChild(e);
  }
  if(!names.length){
    const empty = document.createElement('div');
    empty.style.cssText = 'grid-column:1/-1;color:#6d4520;font-size:12px;padding:8px 2px;text-align:center;font-weight:700;';
    empty.textContent = 'Bag is empty — kill some mobs.';
    elCraftList.insertBefore(empty, elCraftList.firstChild);
  }
  updateCraftBtn();
}

function closeCraft(){
  if(!elCraft) return;
  elCraft.classList.add('closing');
  setTimeout(()=>{
    elCraft.style.display = 'none';
    elCraft.classList.remove('closing');
  }, 140);
}

// 花瓣贴图异步解码：面板刚打开时可能还没解完，稍后再刷一次，
// 免得 Eternal / Unique 这种「现拼卡」第一帧拿不到图案、退回成 Super 卡面
function refreshPanelsLater(){
  [350, 900, 2000].forEach(t=> setTimeout(()=>{
    try{ if(craftOpen()) buildCraftUI(); }catch(e){}
    try{ if(elInv && elInv.style.display === 'block') buildInvUI(); }catch(e){}
  }, t));
}

// 关掉面板再打开：接着看动画 / 接着看合成结果（结果一直展示到玩家点走为止）
function restoreCraftView(){
  try{
    if(craftRun){
      const passed = performance.now() - craftRun.t0;
      const left   = Math.max(150, craftRun.spinMs - passed);
      if(elCStack && !elCStack.querySelector('.cstk')){
        // 台面被清掉了（正常情况下不会）：按合成前的数量重新摆一次
        const cc = cCount, cb = cBatch;
        cCount = craftRun.cCount0; cBatch = Math.max(1, Math.floor(craftRun.cCount0 / CRAFT_COST));
        cSel = { name: craftRun.name, rarity: craftRun.rar };
        renderStack(false);
        cCount = cc; cBatch = cb;
      }
      if(elCSlots) elCSlots.classList.add('off');
      spinStack(craftRun.turns, left/1000, Math.min(0.95, passed / Math.max(1, craftRun.spinMs)));
    } else if(craftPending){
      if(elCSlots) elCSlots.classList.add('off');
      startCraftShow(craftPending.name, craftPending.rarity, craftPending.n);   // 结果继续展示
    }
  }catch(e){}
}

function toggleCraft(){
  if(!elCraft) return;
  if(craftOpen()){ closeCraft(); return; }
  if(elTalents) elTalents.style.display = 'none';
  if(elMobs) elMobs.style.display = 'none';
  if(typeof elInv !== 'undefined' && elInv) elInv.style.display = 'none';
  elCraft.style.display = 'block';
  elCraft.classList.remove('closing');
  const panel = elCraft.querySelector('.cpanel');
  if(panel){ panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = ''; }
  // 正在合成 / 结果还没点走：保留现场，不要把台面清掉
  if(!craftRun && !craftPending) clearTable();
  buildCraftUI();
  restoreCraftView();          // 重新打开后接着看动画 / 结果
  refreshPanelsLater();
}

if(elCDo) elCDo.addEventListener('click', ev=> doCraft(ev.altKey));
// 点台面上的任意一个槽（或槽里的卡）＝ 把这一摞收回仓库
function takeBackTable(ev){
  if(ev) ev.stopPropagation();
  if(cBusy || !cSel) return;
  clearTable();
  toast('Petals put back in bag', 'ok');
}
if(elCStack) elCStack.addEventListener('click', takeBackTable);
if(elCSlots) elCSlots.addEventListener('click', takeBackTable);
document.getElementById('craftBtn').addEventListener('click', toggleCraft);
document.getElementById('cclose').addEventListener('click', toggleCraft);
window.addEventListener('keydown', e=>{
  if((e.key==='c'||e.key==='C') && state===STATE.PLAY && !elChat.classList.contains('open')) toggleCraft();
});

// ---------- mob codex (哪个区域刷什么怪 / 什么稀有度) ----------
const elMobs = document.getElementById('mobs');
const elMobList = document.getElementById('moblist');
const elMobInfo = document.getElementById('minfo');

const AI_LABEL = {
  still:'Static', wander:'Passive', chase:'Aggressive', shooter:'Ranged',
  orbit:'Orbit + charge', leech:'Parasite', spawner:'Hive', friendly:'Friendly'
};
const ATK_LABEL = {missile:'Missiles', pea:'Peas', poison:'Poison bolts',
                   pearl:'Pearls', laser:'Laser', dark:'Dark bolts'};
function mobTraits(m, key){
  const t = [AI_LABEL[m.ai] || m.ai];
  // wiki：aggression radius（单位：格）
  const au = (typeof MOB_AGGRO_U === 'object') ? MOB_AGGRO_U[key] : null;
  if(au) t.push('Aggro ' + au + ' tiles');
  else if(m.aggro) t.push('Aggro ' + Math.round(m.aggro/64) + ' tiles');
  if(m.atk) t.push(ATK_LABEL[m.atk.type] || 'Ranged');
  if(m.retaliate) t.push('Retaliates at ' + m.retaliate + '+');
  if(m.armor) t.push('Armored');
  if(m.shield) t.push('Regenerating shield');
  if(m.regen) t.push('Self-heal');
  if(m.burrow) t.push('Burrows');
  if(m.charge) t.push('Charges after shots');
  if(m.orbitR) t.push('Orbits then charges');
  if(m.zap) t.push('Zap aura');
  if(m.zapOnContact) t.push('Shock on touch');
  if(m.link) t.push('Shared damage');
  if(m.popPush) t.push('Bursts with knockback');
  if(m.onTimerSpawn || m.onHitSpawn || m.proximitySpawn) t.push('Spawns helpers');
  if(m.undead) t.push('Keeps moving ' + m.undead + 's after death');
  if(m.phase) t.push('Phases through walls');
  if(m.dashOnHit) t.push('Dashes when hit');
  if(m.drain) t.push('Drains HP while latched');
  if(m.keep) t.push('Keeps its distance');
  if(m.retreatAt) t.push('Flees & heals below ' + Math.round(m.retreatAt*100) + '%');
  if(m.onHitShoot) t.push('Fires seeds when hit');
  if(m.onDeathSpawn) t.push('Bursts into adds on death');
  if(m.diggerChance) t.push('May release a Digger');
  if(m.predict) t.push('Leads its shots at ' + m.predict + '+');
  if(m.npc) t.push('NPC');
  return t;
}

// ============================================================
//  Mob Gallery（照用户给的截图复刻）
//  一行一种生物，八列 = Common → Super；格子里是这个生物在该稀有度下
//  「击杀过几次」。只记录真的杀过的生物 —— 没杀过的怪整行都不出现。
// ============================================================
const GAL_COLS = ['Common','Unusual','Rare','Epic','Legendary','Mythic','Ultra','Super'];
function galCount(key, rar){ return (player.gallery && player.gallery[key+'|'+rar]) || 0; }
function fmtKill(n){
  if(n >= 1e6) return (n/1e6).toFixed(n>=1e7?0:1).replace(/\.0$/,'') + 'M';
  if(n >= 1e4) return (n/1e3).toFixed(n>=1e5?0:1).replace(/\.0$/,'') + 'K';
  return String(n);
}
function mobDisplayName(key){
  const t = (typeof MOB_TEXT !== 'undefined') ? MOB_TEXT[key] : null;
  return (t && t.name) || (MOBS[key] && MOBS[key].name) || key;
}
// 一只怪「某个稀有度大概有多大概率掉」：把掉落表里每一项的概率合起来，
// 再按 upRar()（本体稀有度 85% / 抬一档 15%）分成两档。
function mobDropChances(key, mobRar){
  const tbl = (typeof DROP_TABLE === 'object' && DROP_TABLE[key]) ? DROP_TABLE[key] : null;
  const ridx = MOB_RARITY.indexOf(mobRar);
  const dropMul = 1 + Math.max(0, ridx) * 0.45;
  let any;
  if(tbl){
    let none = 1;
    for(const [, ch] of tbl) none *= (1 - Math.min(1, ch*dropMul));
    any = 1 - none;
  } else {
    any = 1 - (1-0.72)*(1-0.32);              // 没有官方表：按 72% + 32% 两次判定
  }
  const up = MOB_RARITY[Math.min(MOB_RARITY.length-1, ridx+1)] || mobRar;
  const out = {};
  if(ridx >= MOB_RARITY.indexOf('Super')){ out[mobRar] = 1; return out; }
  const pUp = (MOB_RARITY.indexOf(mobRar) < MOB_RARITY.indexOf('Super')) ? 0.15 : 0;
  out[mobRar] = any * (1-pUp);
  if(pUp > 0) out[up] = (out[up]||0) + any * pUp;
  return out;
}
function mobDropLines(key){
  const tbl = (typeof DROP_TABLE === 'object' && DROP_TABLE[key]) ? DROP_TABLE[key] : null;
  const ridx = MOB_RARITY.indexOf('Common');
  if(!tbl) return '<i>No fixed drop table — 1~2 random petals</i>';
  const mul = 1 + Math.max(0, MOB_RARITY.indexOf(MOBS[key] ? 'Common' : 'Common')) * 0.45;
  return tbl.slice().sort((a,b)=>b[1]-a[1]).slice(0,6)
            .map(([nm,ch])=> nm.replace(/_/g,' ') + ' <b>' + (ch*100).toFixed(ch<0.01?2:(ch<0.1?1:0)) + '%</b>')
            .join(' · ');
}
function mobTipHTML(key, rar){
  const m = MOBS[key] || {};
  const t = (typeof MOB_TEXT !== 'undefined') ? MOB_TEXT[key] : null;
  const st = (typeof MOB_STATS === 'object' && MOB_STATS) ? MOB_STATS[key] : null;
  const sri = Math.max(0, MOB_RARITY.indexOf(rar));
  let hp, dmg, armor, xp;
  if(st){
    const hv = st.hp[Math.min(sri, st.hp.length-1)];
    hp = Array.isArray(hv) ? Math.round((hv[0]+hv[1])/2) : Math.round(hv);
    dmg = st.dmg[Math.min(sri, st.dmg.length-1)];
    armor = st.armor[Math.min(sri, st.armor.length-1)];
    xp = st.xp[Math.min(sri, st.xp.length-1)];
  } else {
    hp  = Math.round((m.hp||0)  * (MOB_HP_MULT[rar]||1));
    dmg = Math.round((m.dmg||0) * (MOB_DMG_MULT[rar]||1) * 10)/10;
    armor = m.armor ? Math.round(m.armor * (MOB_MULT[rar]||1))
                    : (typeof MOB_ARMOR_LADDER !== 'undefined'
                       ? MOB_ARMOR_LADDER[Math.min(sri, MOB_ARMOR_LADDER.length-1)] : 1);
    xp = Math.round((m.xp||0) * Math.sqrt(MOB_HP_MULT[rar]||1));
  }
  // 数值缩写：1.4k / 5.4k / 316k / 20m
  const fmt = (v)=>{
    if(v >= 1e6) return (v/1e6).toFixed(v >= 1e7 ? 0 : 1).replace(/\.0$/,'') + 'm';
    if(v >= 1e3) return (v/1e3).toFixed(v >= 1e4 ? 0 : 1).replace(/\.0$/,'') + 'k';
    return String(v);
  };
  const rc = RARITY_COLOR[rar] || '#fff';

  // ---- 掉落卡片：优先用逐档官方表，没有就按「基础掉率 × 稀有度分布」算 ----
  const cards = [];
  const ex = (typeof MOB_DROPS_EXACT === 'object' && MOB_DROPS_EXACT[key])
           ? MOB_DROPS_EXACT[key][rar] : null;
  if(ex){
    for(const [nm, tiers] of ex)
      for(const [r2, p2] of tiers) if(p2 > 0.00004) cards.push([nm, r2, p2]);
  } else {
    const tbl = (typeof DROP_TABLE === 'object' && DROP_TABLE[key]) ? DROP_TABLE[key] : null;
    if(tbl){
      const tiers = dropRaritySplit(rar).filter(tr=> tr[1] > 0.0004);
      const dropMul = 1 + Math.max(0, sri) * 0.45;
      for(const [nm, ch] of tbl){
        const dropP = Math.min(1, ch * dropMul);
        for(const [r2, p2] of tiers) if(dropP*p2 > 0.0004) cards.push([nm, r2, dropP*p2]);
      }
    }
  }
  // 按「花瓣出现的顺序」排，同一片再按稀有度 —— 跟官方面板一行一种花瓣的排法一致
  const order = {};
  cards.forEach((c,i)=>{ if(order[c[0]] == null) order[c[0]] = i; });
  cards.sort((a,b)=> (order[a[0]] - order[b[0]]) || (MOB_RARITY.indexOf(a[1]) - MOB_RARITY.indexOf(b[1])));
  const pct = (v)=>{
    const x = v*100;
    if(x >= 99.95 && x <= 100.05) return '100%';
    if(x < 0.1) return x.toFixed(2) + '%';     // 0.02% / 0.03% 这种官方极小掉率也要原样显示
    return x.toFixed(1) + '%';
  };
  const grid = cards.slice(0, 12).map(([nm, r2, v])=>{
    const hasArt = !!(MANIFEST.petals && MANIFEST.petals[nm] && MANIFEST.petals[nm].length)
                || (typeof TRANS_PETALS === 'object' && TRANS_PETALS[nm]);
    const bg = craftBg(nm, r2).replace(/"/g, '&quot;');
    const inner = hasArt
      ? '<div class="mdimg" style="background-image:'+bg+';border-color:'+(RARITY_COLOR[r2]||'#777')+'"></div>'
      : '<div class="mdimg mdno" style="background:'+(RARITY_COLOR[r2]||'#777')+'">'
        + (nm||'?').replace(/_/g,' ').slice(0,6) + '</div>';
    return '<div class="mdrop">' + inner + '<div class="mdp">' + pct(v) + '</div></div>';
  }).join('');

  return '<div class="mt-head"><span class="mt-name">'+mobDisplayName(key)+'</span>'
       +   '<span class="mt-xp">'+fmt(xp)+' &#9670;</span></div>'
       + '<div class="mt-rar" style="color:'+rc+'">'+rar+'</div>'
       + (t && t.desc ? '<div class="mt-desc">'+t.desc+'</div>' : '<div class="mt-desc"></div>')
       + '<div class="mt-stat"><b style="color:#7bd94a">Health:</b> '+fmt(hp)+'</div>'
       + '<div class="mt-stat"><b style="color:#ff6b6b">Damage:</b> '+fmt(dmg)+'</div>'
       + (armor ? '<div class="mt-stat"><b style="color:#d8d8d8">Armor:</b> '+armor+'</div>' : '')
       + (st && st.missileHP ? '<div class="mt-stat"><b style="color:#7bd94a">Missile Health:</b> '+fmt(st.missileHP[Math.min(sri, st.missileHP.length-1)])+'</div>'
                              + '<div class="mt-stat"><b style="color:#ff6b6b">Missile Damage:</b> '+fmt(st.missileDMG[Math.min(sri, st.missileDMG.length-1)])+'</div>' : '')
       + (st && st.pollenHP ? '<div class="mt-stat"><b style="color:#7bd94a">Pollen Health:</b> '+fmt(st.pollenHP[Math.min(sri, st.pollenHP.length-1)])+'</div>'
                             + '<div class="mt-stat"><b style="color:#ff6b6b">Pollen Damage:</b> '+fmt(st.pollenDMG[Math.min(sri, st.pollenDMG.length-1)])+'</div>' : '')
       + (grid ? '<div class="mt-drops">'+grid+'</div>' : '<div class="mt-drop"><i>No fixed drop table</i></div>');
}

const elMTip = document.getElementById('mtip');
let mtipKey = null;
function placeMTip(x, y){
  if(!elMTip || elMTip.style.display !== 'block') return;
  const w = elMTip.offsetWidth, h = elMTip.offsetHeight;
  let left = x + 16, top = y + 14;
  if(left + w > window.innerWidth - 8)  left = Math.max(8, x - w - 16);
  if(top  + h > window.innerHeight - 8) top  = Math.max(8, window.innerHeight - h - 8);
  elMTip.style.left = left + 'px'; elMTip.style.top = top + 'px';
}
document.addEventListener('mousemove', (ev)=>{
  if(!elMTip) return;
  const el = ev.target && ev.target.closest ? ev.target.closest('.mgc[data-mtip]') : null;
  const key = el ? el.dataset.mtip : null;
  if(key !== mtipKey){
    mtipKey = key;
    if(key){
      elMTip.innerHTML = mobTipHTML(key, el.dataset.mrar || 'Common');
      elMTip.style.display = 'block';
    } else {
      elMTip.style.display = 'none';
    }
  }
  if(key) placeMTip(ev.clientX, ev.clientY);
}, true);

function buildMobdexUI(){
  if(!elMobs || !elMobList) return;
  const gal = player.gallery || {};
  const keys = [...new Set(Object.keys(gal).map(k=>k.split('|')[0]))];
  keys.sort((a,b)=> mobDisplayName(a).localeCompare(mobDisplayName(b)));
  let total = 0;
  for(const k in gal) total += gal[k];
  if(elMobInfo){
    elMobInfo.innerHTML = keys.length
      ? '<b>'+keys.length+'</b> kinds · <b>'+total+'</b> kills recorded · press <b>N</b> to close'
      : 'Nothing here yet — kill some mobs and their cards appear. Click <b>×</b> to close.';
  }
  elMobList.innerHTML = '';
  for(const key of keys){
    const m = MOBS[key];
    if(!m) continue;
    for(const rar of GAL_COLS){
      const n = galCount(key, rar);
      const c = document.createElement('div');
      c.className = 'mgc' + (n > 0 ? ' has' : '');
      // 空槽保留深色底；有卡片的格子直接用卡面铺满，不再画稀有度色底
      if(n <= 0) c.style.background = 'rgba(0,0,0,.13)';
      if(n > 0){
        // 直接用作好的生物卡片（assets/mobs/<Sprite>_(<Rarity>).webp），不再自己画格子
        if(m.sprite){
          const img = document.createElement('img');
          // 蜈蚣的头/身子叫 Centipede_Head / Centipede_Body，卡面只有 Centipede
          const cardName = m.sprite.replace(/_(Head|Body)$/, '');
          img.src = 'assets/mobs/' + cardName + '_(' + rar + ').webp';
          img.onerror = function(){
            this.onerror = null;
            // 没这张卡就退成稀有度色块 + 怪物图，至少不空着
            this.style.display = 'none';
            const fb = document.createElement('img');
            fb.className = 'mgfb';
            fb.src = MOB_CLEAN + cardName + '.png';
            fb.onerror = function(){ this.onerror = null; this.style.display = 'none'; };
            c.appendChild(fb);
          };
          c.appendChild(img);
        }
        const lab = document.createElement('div');
        lab.className = 'mgn';
        lab.textContent = '×' + fmtKill(n);
        c.appendChild(lab);
        c.dataset.mtip = key;
        c.dataset.mrar = rar;
      }
      elMobList.appendChild(c);
    }
  }
}

function toggleMobdex(){
  if(!elMobs) return;
  const open = elMobs.style.display === 'block';
  if(open){ elMobs.style.display = 'none'; return; }
  if(elTalents) elTalents.style.display = 'none';
  if(elCraft) elCraft.style.display = 'none';
  if(typeof elInv !== 'undefined' && elInv) elInv.style.display = 'none';
  elMobs.style.display = 'block';
  buildMobdexUI();
}
document.getElementById('mobsBtn').addEventListener('click', toggleMobdex);
document.getElementById('mclose').addEventListener('click', toggleMobdex);
// M = 放大/还原小地图；生物图鉴只通过左上角按钮打开，无快捷键
function toggleMinimapBig(){
  if(!mmCanvas) return;
  const big = !mmCanvas.classList.contains('big');
  mmCanvas.classList.toggle('big', big);
  const s2 = big ? 360 : 170;
  mmCanvas.width = s2; mmCanvas.height = s2;
  minimapCacheKey = null;                       // 换了分辨率要重新烘焙底图
  buildMinimapBase(REGIONS[currentRegion]);
}
window.addEventListener('keydown', e=>{
  if(state!==STATE.PLAY) return;
  if(e.key==='m'||e.key==='M'){ toggleMinimapBig(); }
});

// ---------- Inventory panel：自己收集到的卡片 ----------
// 把背包里同名同稀有度的卡片归并成一张，显示数量；点一下装备，右键丢掉。
const elInv     = document.getElementById('inventory');
const elIvList  = document.getElementById('ivlist');
const elIvSearch= document.getElementById('ivsearch');
let ivSearch = '';
// 稀有度从高到低（原作 Inventory 的分组顺序）
const IV_ORDER = ['Unique','Eternal','Super','Ultra','Mythic','Legendary','Epic','Rare','Unusual','Common'];
// 卡片底色（照原作截图取色，上→下渐变）
const IV_CARD_COL = {
  Super:['#7bfbab','#52d989'], Ultra:['#f5397e','#cf1560'], Mythic:['#6cdade','#3fbfc5'],
  Legendary:['#cf3a30','#a32119'], Epic:['#7d2bd8','#5814ab'], Rare:['#4a4ecf','#2f329f'],
  Unusual:['#dcc84e','#b19c2b'], Common:['#84c96e','#5da047'], Eternal:['#cfcfcf','#a3a3a3'],
  Unique:['#5f5f5f','#3c3c3c']
};

function invAggregate(){
  // key -> {name, rarity, n, idxs[]}
  const map = new Map();
  player.backpack.forEach((it, idx)=>{
    const k = it.name + '|' + it.rarity;
    let e = map.get(k);
    if(!e){ e = {name:it.name, rarity:it.rarity, n:0, idxs:[]}; map.set(k,e); }
    e.n++; e.idxs.push(idx);
  });
  const list = [...map.values()];
  list.sort((a,b)=>{
    const d = RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity);
    return d !== 0 ? d : a.name.localeCompare(b.name);
  });
  return list;
}

function ivMakeCard(name, rarity, n, idx, label){
  const cell = document.createElement('div');
  cell.className = 'ivcard';
  cell.appendChild(mkPetalImg(name, rarity));
  if(n > 1){
    const b = document.createElement('div');
    b.className = 'ivct'; b.textContent = '×' + n;
    cell.appendChild(b);
  }
  cell.title = petalStatLine(name, rarity);
  cell.dataset.ptip = name + '|' + rarity;
  // 拖动这张卡：拖到主槽 / 副槽就装上去（拖动时会左右轻微摇晃）
  cell.draggable = true;
  cell.addEventListener('dragstart', e=>{
    dragSrc = { list:'bag', i:idx, name:name, rarity:rarity };
    try{ e.dataTransfer.setData('text/plain', 'bag:' + name + '|' + rarity); e.dataTransfer.effectAllowed = 'move'; }catch(_){}
    cell.classList.add('dragging');
  });
  cell.addEventListener('dragend', ()=> cell.classList.remove('dragging'));
  cell.addEventListener('click', ()=>{
    if(idx >= 0 && player.backpack[idx] && player.backpack[idx].name === name){
      equipFromBackpack(idx); buildInvUI();
    } else {
      const i2 = player.backpack.findIndex(it=>it.name===name && it.rarity===rarity);
      if(i2 >= 0){ equipFromBackpack(i2); buildInvUI(); }
    }
  });
  cell.addEventListener('contextmenu', e=>{
    e.preventDefault();
    let i2 = (idx >= 0 && player.backpack[idx] && player.backpack[idx].name === name && player.backpack[idx].rarity === rarity)
      ? idx : player.backpack.findIndex(it=>it.name===name && it.rarity===rarity);
    if(i2 >= 0){
      player.backpack.splice(i2,1);
      renderInventory(); buildInvUI();
      toast('Dropped ' + name.replace(/_/g,' ') + ' (' + rarity + ')', 'warn');
    }
  });
  return cell;
}

function buildInvUI(){
  if(!elInv || !elIvList) return;
  const all = invAggregate();
  const q = ivSearch.trim().toLowerCase();
  const match = c => !q
    || c.name.toLowerCase().replace(/_/g,' ').indexOf(q) >= 0
    || c.rarity.toLowerCase().indexOf(q) >= 0;
  const list = all.filter(match);

  elIvList.innerHTML = '';
  if(!list.length){
    const d = document.createElement('div');
    d.className = 'ivempty';
    d.textContent = all.length ? 'No petals match "' + ivSearch + '".' : 'No petals yet — kill mobs and pick up their drops.';
    elIvList.appendChild(d);
    return;
  }
  for(const tier of IV_ORDER){
    const cards = list.filter(c=>c.rarity===tier);
    if(!cards.length) continue;
    const sec = document.createElement('div');
    sec.className = 'ivsec';
    const hd = document.createElement('div');
    hd.className = 'ivsechd';
    const l = document.createElement('i'), r = document.createElement('i');
    const b = document.createElement('b');
    b.textContent = tier;
    b.style.color = RARITY_COLOR[tier] || '#fff';   // 每个等级用官方代表色
    hd.appendChild(l); hd.appendChild(b); hd.appendChild(r);
    sec.appendChild(hd);
    const box = document.createElement('div');
    box.className = 'ivcards';
    for(const c of cards) box.appendChild(ivMakeCard(c.name, c.rarity, c.n, c.idxs[0]));
    sec.appendChild(box);
    elIvList.appendChild(sec);
  }
}

function toggleInventory(){
  if(!elInv) return;
  const open = elInv.style.display === 'block';
  if(open){ elInv.style.display='none'; return; }
  if(elTalents) elTalents.style.display='none';
  if(elCraft)   elCraft.style.display='none';
  if(elMobs)    elMobs.style.display='none';
  elInv.style.display='block';
  buildInvUI();
  refreshPanelsLater();
  if(elIvSearch) setTimeout(()=>elIvSearch.focus(), 30);
}
document.getElementById('ivclose').addEventListener('click', toggleInventory);
const elInvBtn = document.getElementById('invBtn');
if(elInvBtn) elInvBtn.addEventListener('click', toggleInventory);
window.addEventListener('keydown', e=>{
  if(e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if((e.key==='i'||e.key==='I') && state===STATE.PLAY) toggleInventory();
});
// 搜索：输入即筛（不重建输入框，焦点不会丢）
if(elIvSearch){
  elIvSearch.addEventListener('input', ()=>{ ivSearch = elIvSearch.value; buildInvUI(); });
  elIvSearch.addEventListener('keydown', e=>{
    e.stopPropagation();
    if(e.key === 'Escape'){ elIvSearch.value=''; ivSearch=''; buildInvUI(); elIvSearch.blur(); }
  });
}

// ---------- inventory UI ----------
const invEquip=document.getElementById('inv-equip');
const elAlt=document.getElementById('inv-alt');
const invBag=document.getElementById('inv-bag');
// 素材包里没有「卡片」的花瓣（Pollen / Peas / Rock / Salt …）：
// 主槽里不能再摆一张透明素材（几乎看不见），照原版卡面自己拼一张同风格的卡片
// —— 稀有度色底板 + 内面板 + 花瓣图案 + 底部名字。
const CARD_ICON = {};
function cardIconURL(name, rarity){
  const key = name + '|' + rarity;
  if(CARD_ICON[key]) return CARD_ICON[key];
  const sp = petalSprite(name, rarity);
  // 还没解码完 → 先不生成（下一帧再试）；
  // 确认这张花瓣没有可用图案（PSPRITE_BAD）→ 仍然拼一张只有底板 + 名字的卡，
  // 否则 Eternal / Unique 会掉回 Super 的卡面
  if(!sp && !(typeof PSPRITE_BAD !== 'undefined' && PSPRITE_BAD[name])) return null;
  const S = 112;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const g = cv.getContext('2d');
  const rr = (x,y,w,h,r)=>{
    g.beginPath();
    g.moveTo(x+r,y); g.lineTo(x+w-r,y); g.quadraticCurveTo(x+w,y,x+w,y+r);
    g.lineTo(x+w,y+h-r); g.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    g.lineTo(x+r,y+h); g.quadraticCurveTo(x,y+h,x,y+h-r);
    g.lineTo(x,y+r); g.quadraticCurveTo(x,y,x+r,y); g.closePath();
  };
  const col = RARITY_COLOR[rarity] || '#888888';
  // 底板（稀有度色）+ 内面板（亮一层）
  rr(2,2,S-4,S-4, 14); g.fillStyle = col; g.fill();
  rr(9,9,S-18,S-18, 9); g.fillStyle = hexA('#ffffff', 0.20); g.fill();
  // 花瓣图案
  if(sp && sp.cv){
    const s = S*0.54;
    g.drawImage(sp.cv, (S-s)/2, S*0.10, s, s);
  }
  // 名字
  const disp = name.replace(/_/g,' ');
  const fs = disp.length > 11 ? 12 : (disp.length > 8 ? 14 : 16);
  g.font = '700 ' + fs + "px 'Ubuntu', sans-serif";
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4.5; g.strokeStyle = 'rgba(0,0,0,.85)';
  g.strokeText(disp, S/2, S*0.79);
  g.fillStyle = '#ffffff';
  g.fillText(disp, S/2, S*0.79);
  return (CARD_ICON[key] = cv.toDataURL('image/png'));
}

function mkPetalImg(name, rarity){
  const img=document.createElement('img');
  img.className='pimg';
  img.draggable = false;                       // 禁止浏览器拖原生图片（拖动走槽位的 DnD + 幽灵花瓣）
  // 状态栏永远用原版不透明卡片图（Common..Super 都有），
  // 纯透明素材（Poo/Pearl/Stinger 等）和代码画的矢量图标走 contain
  // 一律以「官方卡面文件」为准（petalIconSrc 内部会先查 assets 里真实存在的卡），
  // 只有那种一张官方卡都没有的花瓣才现拼，避免出现自己画的卡
  img.src = petalIconSrc(name, rarity);
  if(!hasCardFile(name, rarity) && !(MANIFEST.petals && MANIFEST.petals[name] && MANIFEST.petals[name].length)){
    img.classList.add('cardless');
  }
  // 少数花瓣（Wing / Rock / Rose…）wiki 上根本没有卡片图：换成稀有度色块 + 名字，
  // 免得状态栏里是一张破图
  img.onerror=function(){
    this.onerror=null;
    const cell=this.parentNode;
    this.remove();
    if(!cell) return;
    cell.style.backgroundColor = hexA(RARITY_COLOR[rarity]||'#888888', 0.85);
    const tile=document.createElement('div');
    tile.className='ptile';
    tile.textContent = name.replace(/_/g,' ');
    cell.appendChild(tile);
  };
  return img;
}
// #rrggbb -> rgba(...) so the slot itself can carry the rarity colour
function hexA(hex, a){
  const h = (hex||'#888888').replace('#','');
  const n = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

// ---------- 槽位卡片 ----------
// 空槽直接用用户上传的卡片形态（assets/slot_frame.png → 裁掉留白存成 slot_empty.png），
// 不改色、不自己画：原版里空槽就是「白底 + 灰边」的方卡，有花瓣时卡片铺满整格。
// slots whose petal has no card art get a rarity tinted disc behind it
function paintSlot(cell, name, rarity){
  if(MANIFEST.petals && MANIFEST.petals[name]) return;
  cell.style.backgroundColor = hexA(RARITY_COLOR[rarity], 0.55);
}
// 背包 / 装备格上的悬停说明：名称、伤害、耐久、冷却（外加特殊技能）
function petalStatLine(name, rarity, eq){
  const d = buildPetal(name, rarity);
  const L = [name + ' (' + rarity + ')'];
  if(d.dmg)    L.push('Damage ' + Math.round(d.dmg));
  if(d.dur)    L.push('Durability ' + Math.round(d.dur));
  if(d.reloadSec !== undefined){
    const cdv = d.reloadSec * (eq ? (player.reloadMult||1) : 1);
    L.push('Cooldown ' + (cdv>0 ? cdv.toFixed(2).replace(/\.?0+$/,'') + 's' : 'none'));
  }
  if(d.shield) L.push('Shield ' + Math.round(d.shield));
  if(d.regen)  L.push('Regen ' + (Math.round(d.regen*10)/10) + '/s');
  if(d.heal)   L.push('Heal ' + Math.round(d.heal));
  if(d.hp)     L.push('+' + Math.round(d.hp) + ' max HP');
  if(d.rotSpeed) L.push('Rotation Speed +' + d.rotSpeed.toFixed(1) + ' rad/s');
  const fx = (typeof petalFxText === 'function') ? petalFxText(name) : '';
  if(fx) L.push(fx);
  return L.join('\n');
}

// ============================================================
//  花瓣数据卡（鼠标悬停在花瓣卡片上时出现）
//  版式照原版卡面：灰底、大字名字、右上角冷却时间、稀有度、描述、Damage/Health
//  冷却图标用的是用户提供的 冷却时间.svg（只在这里用）
// ============================================================
const elPtip = document.getElementById('ptip');
let tipHoverEl = null;
let tipForced = false;   // 调试参数 ?ptip= 时强行常驻，不被鼠标事件关掉
function fmtNum(v){
  if(v >= 1e6) return (v/1e6).toFixed(v>=1e7?0:1).replace(/\.0$/,'') + 'M';
  if(v >= 1e4) return (v/1e3).toFixed(v>=1e5?0:1).replace(/\.0$/,'') + 'K';
  if(v >= 100) return '' + Math.round(v);
  if(v >= 10)  return String(Math.round(v*10)/10).replace(/\.0$/,'');
  return String(Math.round(v*100)/100);
}
function petalTipHTML(name, rarity, eq){
  const i = petalInfo(name, rarity);
  const rc = RARITY_COLOR[rarity] || '#dddddd';
  // 主槽花瓣：冷却按 Golden Leaf 的 reloadMult 缩小（乘法叠加后的实际值）
  let cd;
  if(i.bubbleCd2){   // Bubble：卡面显示两段冷却「第一冷却 + 第二冷却」（官方格式一位小数）
    cd = (i.cooldown||0).toFixed(1) + 's + ' + i.bubbleCd2.toFixed(1) + 's';
  } else {
    const cdBase = i.cooldown * (eq ? (player.reloadMult||1) : 1);
    cd = cdBase > 0
      ? (cdBase >= 10 ? Math.round(cdBase) : Math.round(cdBase*10)/10) + 's'
      : '';
  }
  let rows = '';
  if(i.dmg)    rows += '<div><b class="k-dmg">Damage:</b> ' + fmtNum(i.dmg) + '</div>';
  if(i.heal)   rows += '<div><b class="k-heal">Healing:</b> ' + fmtNum(i.heal) + '</div>';
  if(i.regen)  rows += '<div><b class="k-heal">Regen:</b> ' + fmtNum(i.regen) + '/s</div>';
  if(i.health) rows += '<div><b class="k-hp">Health:</b> ' + fmtNum(i.health) + '</div>';
  if(i.rot)    rows += '<div><b class="k-spd">Rotation Speed:</b> +' + i.rot.toFixed(1) + ' rad/s</div>';
  if(i.attract) rows += '<div><b class="k-spd">Petal Attraction:</b> +' + i.attract + '</div>';
  if(i.waxHealth)    rows += '<div><b class="k-hp">Health:</b> ' + fmtNum(i.waxHealth) + '</div>';
  if(i.waxRadius)    rows += '<div><b class="k-spd">Radius:</b> ' + i.waxRadius + '</div>';
  if(i.flowerHealth) rows += '<div><b class="k-hp">Flower Health:</b> ' + fmtNum(i.flowerHealth) + '</div>';
  if(i.flowerRadius) rows += '<div><b class="k-spd">Flower Radius:</b> +' + i.flowerRadius + '</div>';
  if(i.reloadCut)    rows += '<div><b class="k-spd">Reload:</b> -' + (Math.round(i.reloadCut*1000)/10) + '%</div>';
  if(i.shield) rows += '<div><b class="k-shield">Shield:</b> ' + fmtNum(i.shield) + '</div>';
  return '<div class="pt-top">'
       +   '<span class="pt-name">' + i.name + '</span>'
       +   (cd ? '<span class="pt-cd">' + cd + '<img src="assets/icons/cooldown.svg" alt=""></span>' : '')
       + '</div>'
       + '<div class="pt-rar" style="color:' + rc + '">' + rarity + '</div>'
       + '<div class="pt-desc">' + i.desc + '</div>'
       + (rows ? '<div class="pt-stats">' + rows + '</div>' : '')
       + (i.fx ? '<div class="pt-fx">' + i.fx + '</div>' : '');
}
function placePetalTip(x, y){
  if(!elPtip || elPtip.style.display !== 'block') return;
  const w = elPtip.offsetWidth, h = elPtip.offsetHeight;
  let left = x + 18, top = y + 16;
  if(left + w > window.innerWidth - 8)  left = Math.max(8, x - w - 18);
  if(top  + h > window.innerHeight - 8) top  = Math.max(8, window.innerHeight - h - 8);
  elPtip.style.left = left + 'px';
  elPtip.style.top  = top + 'px';
}
document.addEventListener('mousemove', (ev)=>{
  if(!elPtip || tipForced) return;
  const el = ev.target && ev.target.closest ? ev.target.closest('[data-ptip]') : null;
  if(el !== tipHoverEl){
    tipHoverEl = el;
    if(el){
      const parts = el.dataset.ptip.split('|');
      elPtip.innerHTML = petalTipHTML(parts[0], parts[1] || 'Common', parts[2] === 'eq');
      elPtip.style.display = 'block';
    } else {
      elPtip.style.display = 'none';
    }
  }
  if(el) placePetalTip(ev.clientX, ev.clientY);
}, true);

// 调试：?ptip=Basic|Common 直接把灰卡钉在左上角（无头截图验证用）
(function(){
  try{
    const q = new URLSearchParams(location.search);
    // ?hover=1 模拟一次真实鼠标悬停：走的是正式的 data-ptip 委托链路
    if(q.get('hover')){
      let tries = 0;
      const t = setInterval(()=>{
        const el = document.querySelector('#craft .cslot[data-ptip]') || document.querySelector('[data-ptip]');
        if(!el && ++tries < 60) return;
        clearInterval(t);
        if(!el) return;
        const r = el.getBoundingClientRect();
        const x = r.left + r.width/2, y = r.top + r.height/2;
        const target = document.elementFromPoint(x, y) || el;
        target.dispatchEvent(new MouseEvent('mousemove', {bubbles:true, clientX:x, clientY:y}));
      }, 150);
    }
    const pt = q.get('ptip');
    if(!pt || !elPtip) return;
    const p = pt.split('|');
    tipForced = true;
    elPtip.innerHTML = petalTipHTML(p[0], p[1] || 'Common');
    elPtip.style.display = 'block';
    elPtip.style.left = '36px';
    elPtip.style.top  = '96px';
  }catch(e){ try{ document.title = 'PTIP_ERR '+(e&&e.message); }catch(_){} }
})();

// 耐久/护盾条：只改宽度和配色类，DOM 不重建 → CSS 过渡才连得上，看起来是「滑」下去的
function updateDurBars(){
  const cells = invEquip.children;
  for(let i=0;i<cells.length;i++){
    const cell = cells[i], p = player.equipped[i], bar = cell._bar;
    if(!bar || !p){
      // 没有血条也要同步暗区
      const p2 = player.equipped[i];
      if(cell._veil && p2 && p2.maxDur > 0)
        cell._veil.style.setProperty('--dur', Math.max(0, Math.min(100, p2.dur/p2.maxDur*100)) + '%');
      continue;
    }
    let v = 1;
    if(cell._barKind === 'shield') v = p.shieldMax ? p.shieldCur/p.shieldMax : 0;
    else if(p.maxDur > 0) v = p.dur/p.maxDur;
    // 耐久掉下去的瞬间，卡片歪一下（-7° 回弹），跟原作的受击反馈一样
    if(cell._lastV != null && v < cell._lastV - 0.001){
      cell.classList.remove('hit');
      void cell.offsetWidth;
      cell.classList.add('hit');
      clearTimeout(cell._hitT);
      cell._hitT = setTimeout(()=> cell.classList.remove('hit'), 230);
    }
    cell._lastV = v;
    bar.style.width = Math.max(0, Math.min(100, v*100)) + '%';
    // 耐久归零：槽位照样留着，只是变灰、等它慢慢长回来
    const isBroken = p.broken > 0;
    if(cell._broken !== isBroken){ cell.classList.toggle('broken', isBroken); cell._broken = isBroken; }
    if(cell._barKind === 'dur'){
      bar.classList.toggle('low',  v <= 0.18);
      bar.classList.toggle('mid',  v > 0.18 && v <= 0.4);
      if(cell._veil) cell._veil.style.setProperty('--dur', Math.max(0, Math.min(100, v*100)) + '%');
    }
  }
}

// ===== 槽位拖拽（主槽 / 副槽都能互相拖） =====
let dragSrc = null;                       // {list:'equipped'|'alt', i}
function slotArr(list){ return list === 'alt' ? player.alt : player.equipped; }
// 拖拽/装备进入主槽的花瓣：立即陷入装填冷却（含 Wax 的 30s 部署冷却）
function applyMainEnterCooldown(p){
  if(!p) return;
  p._wax = null;
  p._reloadTotal = ((p.def && (p.def.reload || p.def.cat === 'wax') ? (p.def.reload || 30000) : 800)/1000) * (player.reloadMult||1);
  p.broken = p._reloadTotal;
  if(p.maxDur > 0) p.dur = p.maxDur;
}
function swapPetalSlots(aList, ai, bList, bi){
  const A = slotArr(aList), B = slotArr(bList);
  if(!A || !B) return;
  const tmp = A[ai] || null;
  A[ai] = B[bi] || null;
  B[bi] = tmp;
  if(bList === 'equipped') applyMainEnterCooldown(B[bi]);   // 拖进主槽的花瓣陷入冷却
  recompute();
  renderInventory();
}
// 拖拽幽灵：跟随鼠标的花瓣（左右摇晃）
let dragGhostEl = null;
function spawnDragGhost(name, rarity, e){
  removeDragGhost();
  const g = document.createElement('div');
  g.className = 'slotfly';
  // 幽灵 = 不透明官方卡面（清晰可见），左右摇晃，无角标
  const img = mkPetalImg(name, rarity);
  img.style.width = '100%'; img.style.height = '100%';
  img.style.objectFit = 'cover';
  g.appendChild(img);
  g.style.left = e.clientX + 'px'; g.style.top = e.clientY + 'px';
  document.body.appendChild(g);
  dragGhostEl = g;
}
function moveDragGhost(x, y){
  if(!dragGhostEl) return;
  dragGhostEl.style.left = x + 'px';
  dragGhostEl.style.top = y + 'px';
}
function removeDragGhost(){
  if(dragGhostEl){ dragGhostEl.remove(); dragGhostEl = null; }
}
function hidePtip(){
  const el = document.getElementById('ptip');
  if(el) el.style.display = 'none';
}
window.addEventListener('dragover', (e)=>{
  moveDragGhost(e.clientX, e.clientY);
  if(dragSrc) e.preventDefault();               // 我们的花瓣拖拽中：不显示 🚫 禁止光标
}, { passive:false });
// 兜底：槽位以外的任何 <img> 都不允许发起原生图片拖拽（防止从角落拖出原地址图片）
document.addEventListener('dragstart', (e)=>{
  const t = e.target;
  if(t && t.tagName === 'IMG' && !(t.closest && (t.closest('.slot') || t.closest('.ivcard')))){
    e.preventDefault();
  }
}, true);
window.addEventListener('drop', ()=> removeDragGhost(), { passive:true });

function wireSlotDnD(cell, list, i, hasPetal, p){
  cell.draggable = !!hasPetal;
  if(hasPetal){
    cell.addEventListener('dragstart', e=>{
      dragSrc = { list, i };
      try {
        e.dataTransfer.setData('text/plain', list + ':' + i);
        e.dataTransfer.effectAllowed = 'move';
        const c = document.createElement('canvas'); c.width = c.height = 1;   // 透明 1px：隐藏浏览器默认拖拽快照
        e.dataTransfer.setDragImage(c, 0, 0);
      } catch(_){}
      if(p) spawnDragGhost(p.name, p.rarity, e);   // 幽灵：游戏内贴图 + 左右摇晃，无角标
      renderInventory();                           // 角标立即 -1
    });
    cell.addEventListener('dragend', ()=>{ removeDragGhost(); hidePtip(); renderInventory(); });
  }
  cell.addEventListener('dragover', e=>{
    if(!dragSrc) return;
    e.preventDefault();
    cell.classList.add('dropok');
  });
  cell.addEventListener('dragleave', ()=> cell.classList.remove('dropok'));
  cell.addEventListener('drop', e=>{
    e.preventDefault();
    cell.classList.remove('dropok');
    if(!dragSrc) return;
    const src = dragSrc; dragSrc = null;
    if(src.list === 'bag'){ equipBagToSlot(src, list, i); return; }   // Inventory -> 主槽/副槽
    if(src.list === list && src.i === i) return;
    swapPetalSlots(src.list, src.i, list, i);
  });
}

// Inventory 里的一张花瓣拖到主槽 / 副槽：装上去，原来占着的那张退回背包
function equipBagToSlot(src, list, i){
  const A = slotArr(list);
  if(!A) return;
  let bi = (typeof src.i === 'number' && player.backpack[src.i]
            && player.backpack[src.i].name === src.name && player.backpack[src.i].rarity === src.rarity)
    ? src.i
    : player.backpack.findIndex(it=> it && it.name === src.name && it.rarity === src.rarity);
  const item = player.backpack[bi];
  if(!item) return;
  const old = A[i];
  A[i] = makePetalInst(item.name, item.rarity);
  if(old) player.backpack[bi] = { name: old.name, rarity: old.rarity };
  else    player.backpack.splice(bi, 1);
  if(list === 'equipped') applyMainEnterCooldown(A[i]);     // 拖进主槽的花瓣陷入冷却
  recompute();
  renderInventory();
  if(typeof buildInvUI === 'function') buildInvUI();
}

// 主槽 / 副槽的花瓣拖进 Inventory 面板 = 卸下来放回背包
function unequipFromSlot(list, i){
  const A = slotArr(list);
  if(!A || !A[i]) return;
  if(player.backpack.length >= BAG_MAX) return;
  player.backpack.push({ name: A[i].name, rarity: A[i].rarity });
  A[i] = null;
  recompute();
  renderInventory();
  if(typeof buildInvUI === 'function') buildInvUI();
}

// Inventory 面板整体作为放置区：把主槽 / 副槽的花瓣拖进来就卸下
(function(){
  const host = document.getElementById('ivscroll');
  const panel = document.getElementById('inventory');
  if(!host || !panel) return;
  host.addEventListener('dragover', e=>{
    if(!dragSrc || dragSrc.list === 'bag') return;
    e.preventDefault();
    try{ e.dataTransfer.dropEffect = 'move'; }catch(_){}
    panel.classList.add('ivdropok');
  });
  host.addEventListener('dragleave', ()=> panel.classList.remove('ivdropok'));
  host.addEventListener('drop', e=>{
    panel.classList.remove('ivdropok');
    if(!dragSrc || dragSrc.list === 'bag') return;
    e.preventDefault();
    const src = dragSrc; dragSrc = null;
    unequipFromSlot(src.list, src.i);
  });
})();

// 卡片出现在槽位里时的「旋转 + 由小变大 + 淡入」
let slotSigs = [];
let altSigs = [];
// UI 重建排队：同一帧内多次触发只重建一次，避免捡掉落/切换槽位时阻塞当前帧（卡顿）
function renderInventory(done){
  if(done){ if(!renderInventory._q) renderInventory._q = []; renderInventory._q.push(done); }
  if(renderInventory._raf) return;
  renderInventory._raf = requestAnimationFrame(()=>{
    renderInventory._raf = 0;
    try{ renderInventoryNow(); }
    catch(err){ try{ console.error('INV ERR', err); }catch(_){} }
    const q = renderInventory._q; renderInventory._q = null;
    if(q) for(const f of q){ try{ f(); }catch(err2){ try{ console.error('INV CB ERR', err2); }catch(_){} } }
  });
}
function renderInventoryNow(){
  // equipped
  invEquip.innerHTML='';
  const slots=maxSlots();
  for(let i=0;i<slots;i++){
    const cell=document.createElement('div');
    cell.className=('slot'+(i===selectedSlot?' sel':''))
      + (player.equipped[i] ? '' : ' empty');
    const p=player.equipped[i];
    if(p){
      const img=mkPetalImg(p.name,p.rarity);
      paintSlot(cell, p.name, p.rarity);
      cell.appendChild(img);
      if(p.def.cat==='shield'){
        const sb=document.createElement('div'); sb.className='shieldbar shield';
        sb.style.width=(p.shieldMax? p.shieldCur/p.shieldMax*100 : 0)+'%';
        cell._bar = sb; cell._barKind = 'shield';
        cell.appendChild(sb);
      } else if(p.maxDur>0){
        // 暗区：暗的那块面积 = 剩余耐久百分比（平滑 clip-path）
        const veil=document.createElement('div'); veil.className='durveil';
        veil.style.setProperty('--dur', Math.max(0, Math.min(100, p.dur/p.maxDur*100)) + '%');
        cell._veil = veil;
        cell.appendChild(veil);
        // 耐久血条已删除（用户要求）：耐久只靠卡片上的暗区表示
        cell._bar = null; cell._barKind = 'dur';
      }
      cell.title = petalStatLine(p.name, p.rarity, true);
      cell.dataset.ptip = p.name + '|' + p.rarity + '|eq';
      // 这一格「新出现/换了内容」→ 播一次入场动画
      const sig = p.name + '|' + p.rarity;
      if(slotSigs[i] !== sig && !slotSwapAnim) cell.classList.add('pop');
      slotSigs[i] = sig;
    } else {
      slotSigs[i] = '';
    }
    wireSlotDnD(cell, 'equipped', i, !!p, p);
    cell.addEventListener('click',()=>{
      if(p){ selectedSlot=i; renderInventory(); }
    });
    cell.addEventListener('contextmenu',e=>{ e.preventDefault(); unequipToBackpack(i); });
    invEquip.appendChild(cell);
  }
  // 副槽（不参与战斗，数字键互换）
  if(elAlt){
    elAlt.innerHTML='';
    while(player.alt.length < slots) player.alt.push(null);
    for(let i=0;i<slots;i++){
      const cell=document.createElement('div');
      const p=player.alt[i];
      cell.className = 'slot small' + (p ? '' : ' empty');
      if(p){
        paintSlot(cell, p.name, p.rarity);
        cell.appendChild(mkPetalImg(p.name, p.rarity));
        cell.title = p.name + ' (' + p.rarity + ') — press ' + ((i+1)%10) + ' to swap';
        cell.dataset.ptip = p.name + '|' + p.rarity;
      } else {
        cell.title = 'Sub slot ' + (i+1) + ' — press ' + ((i+1)%10) + ' to swap';
      }
      if(p){
        const sigA = p.name + '|' + p.rarity;
        if(altSigs[i] !== sigA && !slotSwapAnim) cell.classList.add('pop');
        altSigs[i] = sigA;
      } else altSigs[i] = '';
      wireSlotDnD(cell, 'alt', i, !!p, p);
      cell.addEventListener('click', ()=>swapSlotWithAlt(i));
      elAlt.appendChild(cell);
    }
  }
  // backpack（差分渲染：只重建内容变化的格子，避免整面板重建卡顿）
  if(!renderInventoryNow._bagCells){ renderInventoryNow._bagCells = []; renderInventoryNow._bagSigs = []; }
  const bagCells = renderInventoryNow._bagCells, bagSigs = renderInventoryNow._bagSigs;
  player.backpack.forEach((it,idx)=>{
    const sig = it.name + '|' + it.rarity;
    const dragOne = (dragSrc && dragSrc.list==='bag' && dragSrc.name===it.name && dragSrc.rarity===it.rarity) ? 1 : 0;
    const cnt = Math.max(0, countInBag(it.name, it.rarity) - dragOne);
    let cell = bagCells[idx];
    if(!cell || bagSigs[idx] !== sig){          // 内容变了 → 重建这个格子
      cell=document.createElement('div');
      cell.className='slot small';
      const img=mkPetalImg(it.name,it.rarity);
      paintSlot(cell, it.name, it.rarity);
      cell.appendChild(img);
      cell.title=petalStatLine(it.name, it.rarity);
      cell.dataset.ptip = it.name + '|' + it.rarity;
      cell.addEventListener('click',()=>equipFromBackpack(idx));
      wireSlotDnD(cell,'bag',idx,true,it);
      const prev = invBag.children[idx];
      if(prev) invBag.replaceChild(cell, prev);
      else invBag.appendChild(cell);
      bagCells[idx]=cell; bagSigs[idx]=sig;
    }
    // 角标只更新文本（拖拽中该类 -1）
    let cb = cell.querySelector('.cnt');
    if(cnt > 0){
      if(!cb){ cb=document.createElement('div'); cb.className='cnt'; cell.appendChild(cb); }
      if(cb.textContent !== String(cnt)) cb.textContent = cnt;
    } else if(cb) cb.remove();
  });
  while(invBag.children.length > player.backpack.length) invBag.lastChild.remove();
  bagCells.length = player.backpack.length;
  bagSigs.length = player.backpack.length;
  // 背包变了，开着的合成面板要跟着刷新
  if(elCraft && elCraft.style.display==='block') buildCraftUI();
  // 卡片面板同理
  if(typeof elInv !== 'undefined' && elInv && elInv.style.display==='block') buildInvUI();
}

// ============================================================
//  聊天框 / 指令
//    / give <用户名> <花瓣> <数量> [稀有度]   —— 给那朵花对应数量的花瓣
//    / help
//  回车打开，Esc 关闭；打字的时候不会触发游戏快捷键。
// ============================================================
const elChat      = document.getElementById('chat');
const elChatLog   = document.getElementById('chatlog');
const elChatInput = document.getElementById('chatinput');

// 花瓣名归一化表（"mysterious stick" / "Mysterious_Stick" 都能认）
const PETAL_NAME_MAP = (()=>{
  const map = {};
  const add = n=>{
    const k = String(n).toLowerCase().replace(/[^a-z0-9]/g,'');
    if(k && !map[k]) map[k] = n;
  };
  Object.keys((MANIFEST && MANIFEST.petals) || {}).forEach(add);
  Object.keys(PETAL_DESC).forEach(add);
  Object.keys(PETAL_RELOAD).forEach(add);
  return map;
})();

function chatPrint(text, cls, color){
  if(!elChatLog) return;
  const d = document.createElement('div');
  d.className = 'cl' + (cls ? ' '+cls : '');
  d.textContent = text;
  if(color) d.style.color = color;
  elChatLog.appendChild(d);
  while(elChatLog.children.length > 8) elChatLog.removeChild(elChatLog.firstChild);
  elChatLog.scrollTop = elChatLog.scrollHeight;
}
function chatIsOpen(){ return elChat && elChat.classList.contains('open'); }
function chatOpen(){
  if(!elChat || state!==STATE.PLAY) return;
  elChat.classList.add('open');
  elChatInput.value = '';
  elChatInput.focus();
}
function chatClose(){
  if(!elChat) return;
  elChat.classList.remove('open');
  elChatInput.blur();
  if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
}
function chatToggle(){ chatIsOpen() ? chatClose() : chatOpen(); }

// 给花瓣：/ give <用户名> <稀有度> <花瓣名> <数量>
//   稀有度 Common … Eternal（大小写都认，写错就按 Common 处理）
function cmdGive(args){
  try{ return cmdGiveInner(args); }
  catch(err){
    try{ console.error('GIVE ERR', err); }catch(_){}
  }
}
function cmdGiveInner(args){
  const a = args.slice();
  if(!a.length){ chatPrint('/ give <name> <rarity> Common-Eternal> <petal> <count>', 'err'); return; }
  const capRar = (s)=>{
    const k = String(s||'').toLowerCase();
    return RARITIES.find(r=> r.toLowerCase() === k) || null;
  };
  // ① 用户名
  let who = a.shift();
  // ② 稀有度（可选；没有就是 Common）
  let rarity = 'Common';
  if(a.length && capRar(a[0])) rarity = capRar(a.shift());
  // ③ 数量（尾部数字）
  let count = 1;
  if(a.length > 1 && /^\d+$/.test(a[a.length-1])){
    count = Math.max(1, Math.min(10000, parseInt(a.pop(), 10)));   // 上限 10000
  }
  const rawPetal = a.join(' ');
  if(!rawPetal){ chatPrint('/ give <name> <rarity> <petal> <count>', 'err'); return; }
  const key = rawPetal.toLowerCase().replace(/[^a-z0-9]/g,'');
  const name = PETAL_NAME_MAP[key];
  if(!name){
    chatPrint('No petal called "' + rawPetal + '"', 'err');
    const near = Object.keys(PETAL_NAME_MAP)
      .filter(k=> key.length>2 && (k.indexOf(key)===0 || key.indexOf(k)===0)).slice(0,4)
      .map(k=>PETAL_NAME_MAP[k]);
    if(near.length) chatPrint('Did you mean: ' + near.join(', ') + '?', 'sys');
    return;
  }
  // 稀有度上限到 Eternal（Unique 也照给）
  let added = 0;
  for(let i=0;i<count;i++){
    if(player.backpack.length >= BAG_MAX) break;
    player.backpack.push({name, rarity});
    if(typeof equipIntoEmptySlot === 'function') equipIntoEmptySlot(name, rarity);   // 有空格直接装上
    added++;
  }
  renderInventory();
  const label = added + '× ' + rarity + ' ' + name;
  const whoTxt = (who.toLowerCase() === String(player.name).toLowerCase()) ? who : who + ' (local flower)';
  if(added > 0){
    chatPrint('Gave ' + label + ' to ' + whoTxt, 'ok');
    if(who.toLowerCase() === String(player.name).toLowerCase()) toast('+ ' + label, 'good');
  } else {
    chatPrint('Backpack is full (' + BAG_MAX + ')', 'err');
  }
}

// / spawn [稀有度] <生物名>  —— 在花朵旁边直接刷一只指定稀有度的生物
// 例：/spawn super hornet     /spawn bee     /spawn eternal titan
const MOB_NAME_MAP = (function(){
  const m = {};
  const norm = s => String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  for(const k in MOBS){
    m[norm(k)] = k;
    const nm = norm(MOBS[k].name);
    if(nm) m[nm] = k;
  }
  return m;
})();

// /spawn 的落点：随机取点 -> 吸附到最近的可行走格 -> 确认这个体型放得下
// 这样生物不会被生成在墙里，也不会被生成到地图外面（墙外会被直接判成非法位置清掉）
function mobSpawnSpot(mk, rarity){
  const sz  = (MOBS[mk] && MOBS[mk].size) || 20;
  // 实际碰撞半径（含 Legendary+ 的 2.5 倍体型），用来算「不能生成在花朵脸上」的安全距离
  const rad = Math.max(10, (typeof mobRadius === 'function')
    ? mobRadius(mk, rarity || 'Common') : sz * 0.85);
  // 安全距离：生物边缘离花朵边缘至少 60px，绝不出现在脸上
  const safeDist = PLAYER_R + rad + 60;
  const snap = (x, y)=>{
    const s = (typeof findSpawn === 'function') ? findSpawn(x, y) : null;
    return (s && typeof s.x === 'number') ? s : { x:x, y:y };
  };
  const ok = (x, y)=> !(typeof blockedAt === 'function' && blockedAt(x, y, rad))
    && Math.hypot(x - player.x, y - player.y) >= safeDist;   // 离花朵太近的点直接不要
  // 先在花朵附近随机找（从安全距离外起找），找不到再逐步扩大范围
  for(const rg of [[safeDist, safeDist + 90 + sz*3], [safeDist, safeDist + 240], [safeDist, safeDist + 420]]){
    for(let t=0; t<60; t++){
      const a = Math.random()*6.2832, d = rg[0] + Math.random()*(rg[1]-rg[0]);
      const x = player.x + Math.cos(a)*d, y = player.y + Math.sin(a)*d;
      if(typeof isFreeMainAt === 'function' && !isFreeMainAt(x, y)) continue;
      const s = snap(x, y);
      if(ok(s.x, s.y)) return s;
    }
  }
  // 兜底：绕着花朵在安全距离外找一圈
  for(let t=0; t<160; t++){
    const a = Math.random()*6.2832, d = safeDist + Math.random()*160;
    const s = snap(player.x + Math.cos(a)*d, player.y + Math.sin(a)*d);
    if(ok(s.x, s.y)) return s;
  }
  const a2 = Math.random()*6.2832;
  return snap(player.x + Math.cos(a2)*safeDist, player.y + Math.sin(a2)*safeDist);
}

function cmdSpawn(args){
  const capRar = (s)=>{
    const k = String(s||'').toLowerCase();
    return RARITIES.find(r=> r.toLowerCase() === k) || null;
  };
  const a = args.slice();
  if(!a.length){
    chatPrint('/ spawn [rarity] <mob>   e.g. /spawn super hornet', 'err');
    chatPrint('Rarity: ' + RARITIES.slice(0,8).join(' · ') + ' (default Common)', 'sys');
    return;
  }
  let rarity = 'Common';
  if(a.length > 1 && capRar(a[0])) rarity = capRar(a.shift());
  const rawName = a.join(' ').trim();
  const key = rawName.toLowerCase().replace(/[^a-z0-9]/g,'');
  const mk = MOB_NAME_MAP[key];
  if(!mk){
    chatPrint('No mob called "' + rawName + '"', 'err');
    const near = Object.keys(MOB_NAME_MAP)
      .filter(k=> key.length>2 && (k.indexOf(key)===0 || key.indexOf(key)===0)).slice(0,5)
      .map(k=>MOBS[MOB_NAME_MAP[k]].name);
    if(near.length) chatPrint('Did you mean: ' + near.join(', ') + '?', 'sys');
    else chatPrint('e.g. baby ant, worker ant, soldier ant, bee, hornet, ladybug, spider, rock, beetle, scorpion', 'sys');
    return;
  }
  // 放在花朵附近的空地上：必须是「地图主区域里的可行走格」，不能生成在墙里 / 地图外
  const spot = mobSpawnSpot(mk, rarity);
  const en = makeEnemy(mk, spot.x, spot.y, 1, rarity);
  en.spawnT = 0;                       // 立刻出现，不播刷怪动画
  en.age = 1;
  enemies.push(en);
  const label = rarity + ' ' + (MOBS[mk].name || mk);
  chatPrint('Spawned ' + label, 'ok');
  toast('+ ' + label, 'good');
}

// / drop <rarity> <petal> [count] —— 在脚边地上扔花瓣（走上去就捡）
function cmdDrop(args){
  const capRar = (s)=>{
    const k = String(s||'').toLowerCase();
    return RARITIES.find(r=> r.toLowerCase() === k) || null;
  };
  const a = args.slice();
  if(!a.length){
    chatPrint('/ drop [rarity] <petal> [count]', 'err');
    chatPrint('  e.g. /drop mythic rose 3', 'sys');
    chatPrint('Rarity: ' + RARITIES.slice(0,9).join(' · ') + ' (default Common)', 'sys');
    return;
  }
  let rarity = 'Common';
  if(a.length > 1 && capRar(a[0])) rarity = capRar(a.shift());
  let count = 1;
  if(a.length > 1 && /^\d+$/.test(a[a.length-1])){
    count = Math.max(1, Math.min(99, parseInt(a.pop(), 10)));
  }
  const rawPetal = a.join(' ').trim();
  if(!rawPetal){ chatPrint('/ drop [rarity] <petal> [count]', 'err'); return; }
  const key = rawPetal.toLowerCase().replace(/[^a-z0-9]/g,'');
  const name = PETAL_NAME_MAP[key];
  if(!name){
    chatPrint('No petal called "' + rawPetal + '"', 'err');
    const near = Object.keys(PETAL_NAME_MAP)
      .filter(k=> key.length>2 && (k.indexOf(key)===0 || key.indexOf(k)===0)).slice(0,4)
      .map(k=>PETAL_NAME_MAP[k]);
    if(near.length) chatPrint('Did you mean: ' + near.join(', ') + '?', 'sys');
    else chatPrint('e.g. rose, basic, stinger, mysterious_stick, ant_egg', 'sys');
    return;
  }
  // 摊成一圈扔在花朵周围（42~62px），不直接叠在花朵身上被瞬间吸走
  const base = Math.random()*6.283;
  for(let i=0;i<count;i++){
    const ang = base + (i / Math.max(1,count)) * 6.283 + (Math.random()-0.5)*0.4;
    const dist = 42 + Math.random()*20;
    const ds = dropSpot(player.x + Math.cos(ang)*dist, player.y + Math.sin(ang)*dist);
    drops.push({ name, rarity, x: ds.x, y: ds.y, age: 0 });
  }
  const label = count + '× ' + rarity + ' ' + name;
  chatPrint('Dropped ' + label, 'ok');
  toast('+ ' + label, 'good');
}

function chatSubmit(){
  const raw = (elChatInput.value || '').trim();
  elChatInput.value = '';
  if(!raw){ chatClose(); return; }
  if(raw[0] === '/'){
    const tok = raw.slice(1).trim().split(/\s+/).filter(Boolean);
    const cmd = (tok.shift() || '').toLowerCase();
    if(cmd === 'give') cmdGive(tok);
    else if(cmd === 'spawn') cmdSpawn(tok);
    else if(cmd === 'drop') cmdDrop(tok);
    else if(cmd === 'help'){
      chatPrint('/ give <name> <rarity> <petal> <count>', 'sys');
      chatPrint('  e.g. /give Unnamed Mythic Rose 5', 'sys');
      chatPrint('/ spawn [rarity] <mob>', 'sys');
      chatPrint('  e.g. /spawn super hornet', 'sys');
      chatPrint('/ drop [rarity] <petal> [count]  — 在地上掉花瓣', 'sys');
      chatPrint('  e.g. /drop mythic rose 3', 'sys');
      chatPrint('Rarity: ' + RARITIES.slice(0,9).join(' · '), 'sys');
      chatPrint('Petals use their English names, e.g. rose, basic, stinger, mysterious_stick.', 'sys');
    }
    else chatPrint('Unknown command "/' + cmd + '" — try /help', 'err');
  } else {
    chatPrint(String(player.name) + ': ' + raw, 'who');
  }
  chatClose();
}

if(elChatInput){
  elChatInput.addEventListener('keydown', e=>{
    e.stopPropagation();
    if(e.key === 'Enter'){ e.preventDefault(); chatSubmit(); }
    else if(e.key === 'Escape'){ e.preventDefault(); elChatInput.value=''; chatClose(); }
  });
  // 输入框失焦就收起，避免「看不见的输入框吃掉按键」
  elChatInput.addEventListener('blur', ()=> elChat.classList.remove('open'));
  elChatInput.addEventListener('mousedown', e=> e.stopPropagation());
  elChatInput.addEventListener('mousemove', e=> e.stopPropagation());
}

// 合成台整体按窗口宽度缩放（设计尺寸 420 宽 ↔ 33vw）
function fitCraftScale(){
  try{
    const k = Math.min(1.6, Math.max(0.72, window.innerWidth * 0.33 / 420));
    document.documentElement.style.setProperty('--ck', k.toFixed(3));
    // 缩放后要把 top 算一下：让面板竖直中心落在 57% 高度（和参考图一致）
    const pn = document.querySelector('#craft .cpanel');
    if(pn) pn.style.top = Math.round(window.innerHeight * 0.50 - 468 * k / 2) + 'px';
  }catch(e){}
}
fitCraftScale();
window.addEventListener('resize', fitCraftScale);

// ---------- start / death ----------
const menu=document.getElementById('menu');
const dead=document.getElementById('dead');

// 主页选中的出生区域（原作首页的 Garden / Desert / Ocean / Jungle / Hel 按钮）
let startRegion = 0;

// 主页背景 = 选中群系在 assets/maps 里的地面地块平铺（不自己画）
// assets/maps/<Region>.webp 是可行走区域的遮罩图，不能当背景用，
// 所以这里取各地图真正铺满地面的那一块地砖（*_c_0 / *_c_1）。
const MENU_GROUND = {
  garden:'Grass_c_0',   sewer:'Sewage_c_0',  jungle:'Grass2_c_1', desert:'Desert_c_1',
  ocean:'Ocean_c_0',    factory:'Factory_floor_c_0', anthell:'Dirt2_c_0',
  hel:'Hel_c_0',        pyramid:'Desert_c_1', training:'Grass_c_0'
};
function setMenuBg(regionIdx){
  const reg = REGIONS[regionIdx] || REGIONS[0];
  const el  = document.getElementById('menuBg');
  const tile = MENU_GROUND[reg.id];
  if(!el || !tile) return;
  // 原作首页的背景是「放大版」的群系地块（比游戏里大一圈），这里按实测比例铺 340px
  el.style.backgroundImage = 'url("assets/maps/' + tile + '.webp")';
  el.style.backgroundSize = '340px 340px';
  el.style.animationDuration = '9s';
}
setMenuBg(0);

// 首页漂浮的花瓣：原作首页就是一堆 Basic 花瓣在飘（用户要求：漂浮 basic）。
// 全部用真实花瓣卡贴图裁出来的白花瓣，不是自己画的图形。
// 每片沿对角线（右下）匀速飘，起点/终点都在屏幕外 → 无缝循环，不会"飘完"。
function buildMenuBg(){
  const box = document.getElementById('menuPetals');
  if(!box || box.dataset.built) return;
  box.dataset.built = '1';
  const vw = Math.max(960, window.innerWidth), vh = Math.max(600, window.innerHeight);
  const DX = vw + 620, DY = vh + 620;           // 位移比屏幕大，两头都在屏幕外
  const want = 34;
  let made = 0, rounds = 0;

  // 原版首页：所有花瓣都在飘（用户要求：这是所有花瓣，不是随机的 Basic）。
  // 每片沿对角线（右下）匀速飘，起点/终点都在屏幕外 → 无缝循环，不会"飘完"。
  const ALL_PETAL_NAMES = (MANIFEST && MANIFEST.petals) ? Object.keys(MANIFEST.petals) : ['Basic'];
  const RARITY_BAG = ['Common','Common','Common','Common','Common','Common','Common',
                      'Unusual','Unusual','Rare','Epic','Legendary','Mythic','Ultra'];

  const spawn = ()=>{
    let guard = 0;
    while(made < want && guard++ < want*6){
      const rarity = RARITY_BAG[(Math.random()*RARITY_BAG.length)|0];
      const pname  = ALL_PETAL_NAMES[(Math.random()*ALL_PETAL_NAMES.length)|0];
      const img = getPetalImage(pname, rarity);
      if(!img.complete || !img.naturalWidth) continue;    // 还没解码完，下一轮再试
      const sp = buildPetalSprite(img);
      if(!sp) continue;
      // 景深 z：1 = 离镜头最近，0.4 = 最远。近的更大、飘得更快，远的更小更慢（视差）
      const z = 0.40 + Math.random()*0.78;
      const cv = document.createElement('canvas');
      const size = 12 + 28*z;                            // 近 ≈46px，远 ≈23px
      cv.width  = Math.round(size);
      cv.height = Math.round(size);
      const g = cv.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(sp.cv, 0, 0, cv.width, cv.height);
      // 起点放在屏幕外的「左上带」上：左边缘或上边缘
      let x0, y0;
      if(Math.random() < 0.5){ x0 = -60 - Math.random()*160; y0 = -60 - Math.random()*(vh+300); }
      else                   { x0 = -60 - Math.random()*(vw+300); y0 = -60 - Math.random()*160; }
      const speed = 118*z;                               // px/s：近的 ~140、远的 ~47（用户要求快一点）
      // 位移刚好把花瓣从左上带到右下屏幕外，循环首尾都在视野外 → 看不到跳变
      const dx = DX - x0, dy = DY - y0;
      const dist = Math.hypot(dx, dy);
      const dur = Math.max(14, dist/speed);
      cv.style.left = x0.toFixed(0)+'px';
      cv.style.top  = y0.toFixed(0)+'px';
      cv.style.opacity = (0.55 + 0.45*z).toFixed(2);     // 远的一点，像在雾里
      cv.style.setProperty('--dx', dx.toFixed(0)+'px');
      cv.style.setProperty('--dy', dy.toFixed(0)+'px');
      cv.style.setProperty('--r0', (Math.random()*360).toFixed(0)+'deg');
      cv.style.setProperty('--r1', (Math.random()*720-360).toFixed(0)+'deg');
      cv.style.animationDuration = dur.toFixed(1)+'s';
      cv.style.animationDelay = (-(Math.random()*dur)).toFixed(1)+'s';
      box.appendChild(cv);
      made++;
    }
    // 贴图还没解码完就再试一轮（最多 30 轮，别无限重试）
    if(made < want && rounds++ < 30) setTimeout(spawn, 300);
  };
  spawn();
}
buildMenuBg();

// 区域选择按钮：按 regions.js 的 REGIONS 动态生成（补全所有区域，不再手写 5 个）
(function(){
  const pick = document.getElementById('regionPick');
  if(!pick || typeof REGIONS === 'undefined') return;
  pick.innerHTML = '';
  // 原版首页只列 5 个基础区域（3+2 排布），其余区域仍可通过游戏内传送门进入；
  // 按钮配色取自原版截图，不改 regions.js 的地图底色。
  const MENU_RP = [['garden','#7ec850'],['desert','#d8c9a0'],['ocean','#5b8dd9'],
                   ['jungle','#4a8a3a'],['hel','#8b4040']];
  MENU_RP.forEach(([id, col])=>{
    const i = REGIONS.findIndex(r=>r.id===id);
    if(i < 0) return;
    const r = REGIONS[i];
    const b = document.createElement('button');
    b.className = 'rp' + (i === startRegion ? ' on' : '');
    b.dataset.r = i;
    b.textContent = r.name;
    b.style.background = col;
    b.addEventListener('click', ()=>{
      pick.querySelectorAll('.rp').forEach(x=>x.classList.remove('on'));
      b.classList.add('on');
      startRegion = i;
      setMenuBg(i);
    });
    pick.appendChild(b);
  });
})();

// ============================================================
//  进度存档（localStorage）：刷新/关页后保留角色成长
// ============================================================
const SAVE_KEY = 'florr_save_v1';
function saveGame(){
  try{
    const eq = player.equipped.map(p=> p ? {name:p.name, rarity:p.rarity} : null);
    const al = player.alt.map(p=> p ? {name:p.name, rarity:p.rarity} : null);
    const s = {
      v:1, name:player.name, level:player.level, xp:player.xp, xpNeed:player.xpNeed,
      ankh:player.ankh, gallery:player.gallery,
      talents:[...player.talents], tpSpent:player.tpSpent,
      slotBonus:player.slotBonus, healthMult:player.healthMult, petalHealthMult:player.petalHealthMult,
      medicMult:player.medicMult, reloadMult:player.reloadMult, rotAdd:player.rotAdd, visionMult:player.visionMult,
      reachAdd:player.reachAdd, talentMagnet:player.talentMagnet, bodyDmgMult:player.bodyDmgMult, luck:player.luck,
      poisonMult:player.poisonMult, poisonDurMult:player.poisonDurMult,
      duplicatorLevel:player.duplicatorLevel, secondChance:player.secondChance, bodyToxicity:player.bodyToxicity,
      backpack:player.backpack, equipped:eq, alt:al, region:currentRegion
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  }catch(e){ /* 存档失败不影响游戏 */ }
}
function loadGame(){
  try{
    const raw = localStorage.getItem(SAVE_KEY);
    if(!raw) return false;
    const s = JSON.parse(raw);
    player.name = s.name || 'Player';
    player.level = s.level || 1;
    player.xp = s.xp || 0;
    player.xpNeed = s.xpNeed || xpForLevel(player.level);
    player.ankh = s.ankh || 0;
    player.gallery = s.gallery || {};
    player.talents = new Set(s.talents || []);
    player.tpSpent = s.tpSpent || 0;
    player.slotBonus = s.slotBonus||0; player.healthMult=s.healthMult||1; player.petalHealthMult=s.petalHealthMult||1;
    player.medicMult=s.medicMult||1; player.reloadMult=s.reloadMult||1; player.rotAdd=s.rotAdd||0;
    player.visionMult=s.visionMult||1; player.reachAdd=s.reachAdd||0; player.talentMagnet=s.talentMagnet||0;
    player.bodyDmgMult=s.bodyDmgMult||1; player.luck=s.luck||0;
    player.poisonMult=s.poisonMult||1; player.poisonDurMult=s.poisonDurMult||1;
    player.duplicatorLevel=s.duplicatorLevel||0; player.secondChance=s.secondChance||null; player.bodyToxicity=!!s.bodyToxicity;
    player.backpack = Array.isArray(s.backpack) ? s.backpack : [];
    player.equipped = (s.equipped||[]).map(p=>{ if(!p) return null; try{ return makePetalInst(p.name, p.rarity); }catch(e){ return null; } });
    player.alt = (s.alt||[]).map(p=>{ if(!p) return null; try{ return makePetalInst(p.name, p.rarity); }catch(e){ return null; } });
    while(player.equipped.length < BASE_SLOTS){ player.equipped.push(null); player.alt.push(null); }
    startRegion = (typeof s.region === 'number') ? s.region : startRegion;
    return true;
  }catch(e){ return false; }
}

function startGame(forceNew){
  player.x=0; player.y=0;
  player.faceState='normal'; player.faceAnim=null; player.faceForce=null;
  const loaded = !forceNew && loadGame();   // 有存档且非「新游戏」则载入成长
  // 读昵称：载入时把存档名填回输入框（玩家可改）；新游戏则沿用框里的值
  if(loaded){ const ni=document.getElementById('nameInput'); if(ni) ni.value = player.name; }
  player.name = (document.getElementById('nameInput').value || 'Player').slice(0,14);
  if(!loaded){
    // 全新角色：重置成长、天赋与开局装备
    player.level=1; player.xp=0; player.xpNeed=xpForLevel(1);
    player.equipped=[]; player.backpack=[]; player.alt=[];
    for(let i=0;i<BASE_SLOTS;i++){ player.equipped.push(null); player.alt.push(null); }
    player.talents = new Set(); player.tpSpent = 0;
    player.slotBonus=0; player.healthMult=1; player.petalHealthMult=1; player.medicMult=1; player.reloadMult=1;
    player.rotAdd=0; player.visionMult=1; player.reachAdd=0; player.talentMagnet=0; player.bodyDmgMult=1; player.luck=0;
    player.poisonMult=1; player.poisonDurMult=1; player.duplicatorLevel=0; player.secondChance=null; player.bodyToxicity=false;
    const picks = ['Basic','Basic','Basic','Basic','Basic'];
    picks.forEach((nm,i)=>{ player.equipped[i] = makePetalInst(nm, 'Common'); });
    player.alt[0] = makePetalInst('Rose', 'Common');
  }
  player.invuln=0; player.scCd=0;
  applyView();
  applyTalents();
  recompute();
  player.hp=player.maxHp;
  enemies=[]; projectiles=[]; drops=[]; summons=[]; waxSummons=[];
  syncSummons();
  // 调试用放大镜：?zoom=2.5 把画面整体放大，方便核对贴图朝向 / 拖尾细节
  {
    const _z = parseFloat(new URLSearchParams(location.search).get('zoom')||'0');
    if(_z>0){ player.debugZoom = _z; VIEW *= _z; }
  }
  state=STATE.PLAY; lastT=performance.now();
  setRegion(startRegion, true);
  menu.style.display='none'; dead.style.display='none';
  renderInventory(); updateHUD();
  chatPrint('hello !' + player.name + '  [Build 20261102O]', 'sys');
  // 调试：?cmd=/give%20me%20rose%205 —— 开局直接把一条聊天指令跑一遍
  {
    const _c = new URLSearchParams(location.search).get('cmd');
    if(_c){ elChatInput.value = _c; chatSubmit(); }
  }
}
function showDead(){
  document.getElementById('deadStats').textContent =
    'You reached level '+player.level+' - '+player.backpack.length+' petals in your bag.';
  dead.style.display='flex';
}
// 注意：不能直接传 startGame，否则浏览器会把 MouseEvent 当作 forceNew 传入，导致永远跳过读档
document.getElementById('startBtn').addEventListener('click', ()=>startGame(false));
document.getElementById('restartBtn').addEventListener('click', ()=>{ respawnAtCheckpoint(); });
// New Game：清存档并强制重开（保留框里昵称作为新角色名）
const _ng = document.getElementById('newGameBtn');
if(_ng) _ng.addEventListener('click', ()=>{ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} startGame(true); });
// 关页/切后台时存档；并监听失焦（移动端切后台不会触发 beforeunload）
window.addEventListener('beforeunload', ()=>{ if(state===STATE.PLAY || state===STATE.DEAD) saveGame(); });
document.addEventListener('visibilitychange', ()=>{ if(document.hidden && (state===STATE.PLAY || state===STATE.DEAD)) saveGame(); });
window.addEventListener('contextmenu', e=>{ if(state===STATE.PLAY) e.preventDefault(); });

// ---------- load manifest then go ----------
// manifest.js 已用 <script> 同步加载（file:// 也能用），fetch 只作为服务器的兜底
if(window.MANIFEST_DATA && window.MANIFEST_DATA.petals){
  MANIFEST = window.MANIFEST_DATA;
  menu.style.display='flex';
} else {
  fetch('manifest.json').then(r=>r.json()).then(j=>{
    MANIFEST=j;
    menu.style.display='flex';
  }).catch(()=>{
    menu.style.display='flex';
  });
}

requestAnimationFrame(loop);

// ---------- debug autostart hook (?auto=1&region=N) ----------
(function(){
  try{
    const q = new URLSearchParams(location.search);
    if(!q.get('auto')) return;
    const wait = setInterval(()=>{
      if(!MANIFEST) return;
      clearInterval(wait);
      startGame();
      const r = parseInt(q.get('region')||'0',10);
      if(r>0) setRegion(r);
      // ?talent=summoner:Common,summoner:Rare  pre-grant talents for screenshots
      const tl = q.get('talent');
      if(tl){
        tl.split(',').forEach(id=>{ if(TALENT_INDEX[id]) player.talents.add(id); });
        applyTalents(); recompute(); syncSummons();
      }
      // ?chat=/drop mythic rose 3   跑一条聊天指令（调试指令用）
      const ch = q.get('chat');
      if(ch){
        elChatInput.value = ch;
        setTimeout(()=>{ try{ chatSubmit(); }catch(err){ console.warn(err); } }, 60);
      }
      // ?bag=Basic:Common:12,Bee:Unusual:6  填背包（调试合成用）
      const bg = q.get('bag');
      if(bg){
        bg.split(',').forEach(sp=>{
          const [n,r,c] = sp.split(':');
          for(let i=0;i<parseInt(c||'5',10);i++) if(player.backpack.length<BAG_MAX) player.backpack.push({name:n, rarity:r||'Common'});
        });
        renderInventory();
      }
      // ?deck=Leaf,Leaf,Rose,Basic,Stinger 换一套起手花瓣（同时支持 Name:Rarity）
      const deckQ = q.get('deck');
      if(deckQ){
        player.equipped = [null,null,null,null,null];
        deckQ.split(',').slice(0,5).forEach((sp,i)=>{
          const [nm, rar] = sp.split(':');
          if(PETAL_META[nm]) player.equipped[i] = makePetalInst(nm, rar || 'Common');
        });
        recompute(); player.hp = player.maxHp; renderInventory();
      }
      // ?drops=1  在脚边撒几片掉落物（截掉落卡片用）
      if(q.get('drops')){
        // 全部用「有上传卡片」的花瓣，跟现在生物掉落表一致
        const pool=['Basic','Leaf','Clover','Dahlia','Stinger','Heavy','Pearl','Glass',
                    'Clay','Dust','Sponge','Carrot','Tomato','Lentil','Lightning',
                    'Mysterious_Stick','Web','Third_Eye','Wing','Totem'];
        const rs=['Common','Unusual','Rare','Epic','Legendary','Mythic'];
        for(let i=0;i<10;i++){
          const a=i/10*6.283;
          drops.push({name:pool[i%pool.length], rarity:rs[i%rs.length],
                      x:player.x+Math.cos(a)*(150+i*9), y:player.y+Math.sin(a)*(150+i*9), age:Math.random()*3});
        }
      }
      // ?god=1 无敌（截图用，免得摆拍时被咬死）
      if(q.get('god')){ player.invuln = 1e7; }
      // ?free=1 把花朵挪到附近的空地（出生点在水边，摆拍 / 看生物时挡视线）
      if(q.get('free')){
        const s = randomFreeSpot(player.x, player.y, 0, 420, 40);
        if(s){ player.x = s.x; player.y = s.y; cam.x = player.x; cam.y = player.y; }
      }
      if(q.get('solid')){ SOLID_DEBUG = parseInt(q.get('solid'),10) || 1; }
      if(q.get('alt')) keys['alt'] = true;   // 按住 Alt 看小地图稀有度分区（截图验证用）
      if(q.get('mmbig')) setTimeout(()=> toggleMinimapBig(), 1200);   // 直接开大号小地图
      // ?bush=1 把玩家丢到最近的灌木丛（密道）里（验证花瓣失效 / 不刷怪）
      if(q.get('bush')) setTimeout(()=>{
        if(!bushGrid) return;
        let best=null, bd=1e9;
        for(let ty=0;ty<bushH;ty++) for(let tx=0;tx<bushW;tx++){
          if(!bushGrid[ty*bushW+tx]) continue;
          const tw = (regionMap && regionMap.tilewidth) ? regionMap.tilewidth : TILE;
          const wx = tx*tw - bushW*tw/2 + tw/2, wy = ty*tw - bushH*tw/2 + tw/2;
          if(blockedAt(wx, wy, PLAYER_R*0.9)) continue;      // 只要站得住的灌木格
          const d = Math.hypot(wx-player.x, wy-player.y);
          if(d < bd){ bd = d; best = {x:wx, y:wy}; }
        }
        if(best){ player.x = best.x; player.y = best.y; cam.x = player.x; cam.y = player.y; }
      }, 3000);
      // ?weardown=0.3 把所有装备花瓣的耐久压到 30%（截图验证暗区用）
      {
        const wd = parseFloat(q.get('weardown')||'');
        if(isFinite(wd) && wd>0 && wd<1){
          setTimeout(()=>{ for(const pe of player.equipped){ if(pe && pe.maxDur>0){ pe.dur = pe.maxDur*wd; } } renderInventory(); }, 1500);
        }
      }
      // ?pick=Rose:Unusual  在脚下放一个掉落物（验证「有空槽自动装备」）
      if(q.get('pick')){
        const [pn, pr] = q.get('pick').split(':');
        let n = 0;
        // 等游戏真的开跑（出生点定了）再丢，不然丢在菜单的 0,0 上永远捡不到
        setTimeout(()=>{
          const t = setInterval(()=>{
            drops.push({name:pn, rarity:pr||'Common', x:player.x+4, y:player.y, age:0});
            if(++n >= 8) clearInterval(t);
          }, 400);
        }, 2600);
      }
      if(q.get('cforce') != null) CRAFT_FORCE = (q.get('cforce') === '0') ? 0 : 1;
      // ?craft=1 直接打开合成面板；?trycraft=Basic:Common 摆上台面并合一次
      if(q.get('craft')) toggleCraft();
      // ?burst=Rare  直接放一次合成成功粒子（截图验证用）
      if(q.get('burst')) setTimeout(()=> burstParticles(q.get('burst')), 700);
      // ?dump=Peas|Super  把合成出来的贴图摊在左上角（截图核对用）
      if(q.get('dump')){
        setTimeout(()=>{
          const [nm, rr] = (q.get('dump')).split('|');
          const sp = (typeof composePetals === 'function') ? composePetals(nm, rr||'Common') : null;
          if(!sp) return;
          const im = new Image();
          im.src = sp.cv.toDataURL('image/png');
          im.style.cssText = 'position:fixed;left:20px;top:60px;width:256px;height:256px;z-index:99;background:#3a7d2c';
          document.body.appendChild(im);
        }, 1500);
      }
      // ?mobs=1 打开生物图鉴（截图/查表用）
      if(q.get('mobs')) toggleMobdex();
      // ?gal=1 造一些击杀记录（截图验证 Mob Gallery 用）
      if(q.get('gal')){
        const pool = (REGIONS[currentRegion]||REGIONS[0]).pools.map(p2=>p2[0]);
        pool.forEach((k,i)=>{
          for(let j=0;j<4;j++){
            const r = MOB_RARITY[Math.min(MOB_RARITY.indexOf('Super'), j + (i%3))];
            player.gallery[k+'|'+r] = (player.gallery[k+'|'+r]||0) + 1 + ((Math.random()*900)|0);
          }
        });
        if(elMobs && elMobs.style.display === 'block') buildMobdexUI();
      }
      // ?mtip=baby_ant|Common  把生物数据卡钉在屏幕上（截图验证用）
      if(q.get('mtip')){
        setTimeout(()=>{
          const [mk, mr] = q.get('mtip').split('|');
          const el = document.getElementById('mtip');
          if(el){ el.innerHTML = mobTipHTML(mk, mr||'Common'); el.style.display='block'; }
        }, 1500);
      }
      if(q.get('trycraft')){
        const [n,r] = q.get('trycraft').split(':');
        if(!q.get('craft')) toggleCraft();
        const tn = Math.max(1, parseInt(q.get('tn')||'1',10));   // 点几次柜子（每次 +5 片）
        setTimeout(()=>{
          for(let i=0;i<tn;i++) placePetal({name:n, rarity:(r||'Common')}, false);
          if(q.get('cdo')) setTimeout(()=> doCraft(false), 900 + tn*120);
        }, 80);
      }

      // ---- 摆拍 / 推进：要等地图网格就绪再放生物，否则会被判成「在墙里」被清掉 ----
      const spw = q.get('spawn'), ring = q.get('ring');
      const simN = parseInt(q.get('sim')||'0',10);

      const lateSetup = ()=>{
        // ?spawn=hornet:Epic,ant_hole:Rare  在 player 周围摆指定生物（带完整 AI，用来看行为）
        if(spw){
          spw.split(',').forEach((s,i)=>{
            const [k,r] = s.split(':');
            if(!MOBS[k]) return;
            let px = player.x, py = player.y;
            const a = i/Math.max(1,spw.split(',').length)*6.283 - 1.57;
            const spot = randomFreeSpot(player.x, player.y, 120, 190, 24);
            if(spot){ px = spot.x; py = spot.y; }
            else { px += Math.cos(a)*170; py += Math.sin(a)*170; }
            if(MOBS[k].chain){
              const hd = spawnCentipede(px, py, 1, r||'Common');
              for(const sg of enemies) if(sg.def && sg.def.chain) sg.spawnT = 0;
              return;
            }
            const en = makeEnemy(k, px, py, 1, r||'Common');
            en.spawnT = 0;
            if(en.def && en.def.tailShot) en.rotLog = [];
            if((r||'Common') === 'Super') chatPrint('A Super ' + MOBS[k].name + ' has spawned!', 'ok');
            enemies.push(en);
          });
        }
        // ?ring=1 把本区每种怪摆一圈（量体型比例 / 看动画用）
        // ?ring=Rarity 指定稀有度，默认 Common
        if(ring){
          enemies.length = 0;
          const pool = REGIONS[currentRegion].pools.map(p=>p[0]);
          const ringRar = (ring!=='1' && MOB_RARITY.indexOf(ring)>=0) ? ring : 'Common';
          const R = 190, n = pool.length;
          pool.forEach((k,i)=>{
            const a = i/n*6.283 - 1.57;
            let px = player.x + Math.cos(a)*R, py = player.y + Math.sin(a)*R;
            // 落在水里/墙里就沿半径往内收，直到站得住
            for(let rr=R; rr>40; rr-=12){
              const qx = player.x + Math.cos(a)*rr, qy = player.y + Math.sin(a)*rr;
              if(isFreeMainAt(qx,qy) && !blockedAt(qx,qy,12)){ px = qx; py = qy; break; }
            }
            const en = makeEnemy(k, px, py, 1, ringRar);
            en.dmg = 0; en.speed = 0;      // 只是站着给人看比例
            en.hp = en.maxHp = 1e9;        // 免得被花瓣打死（截图时整圈要齐全）
            en.ai = 'still'; en.spawnT = 0; en.atk = null;
            en.def = Object.assign({}, en.def, {atk:null, onHitShoot:null, onHitSpawn:null,
              onTimerSpawn:null, proximitySpawn:null, dashOnHit:0, burrow:false, zap:null});
            // ?aggro=1 让这一圈「站着不动但进入索敌」，专门核对转身是否正对花朵
            if(q.get('aggro')){ en.ai = 'chase'; en.aggroOn = true; en.atkCd = 999; }
            enemies.push(en);
          });
        }
        // ?hurt=1 把摆出来的怪血压到 0，用来测亡语 / 掉落 / 木乃伊的延迟倒下
        if(q.get('hurt')) for(const e of enemies) e.hp = 0;
        // ?hpfrac=0.4 把血压到 40%，用来测海星撤退 / 蟑螂腿软这类「血少才触发」的行为
        const hf = parseFloat(q.get('hpfrac')||'');
        if(isFinite(hf) && hf>0 && hf<1) for(const e of enemies) e.hp = e.maxHp*hf;
        // ?php=0.4 把自己的血压到 40%（测回血花瓣的飞行动画）
        const php = parseFloat(q.get('php')||'');
        if(isFinite(php) && php>0 && php<=1) player.hp = player.maxHp*php;
        // ?spread=1 直接模拟「按住空格把花瓣撑开」的样子
        if(q.get('spread')){ player.spread = 1; keys[' '] = true; }
        if(q.get('face')){ player.faceForce = q.get('face'); player.faceState = q.get('face'); player.faceAnim = null; }  // 强制表情状态（截图验证用）
        if(q.get('noinput')){ window.URLNPI = true; }   // ?noinput=1：禁用移动输入（泡泡推力验证）
        if(q.get('rmb')){ mouse.right = true; }         // ?rmb=1 调试：模拟按住右键（防御状态）
        if(q.get('probe3')){
          const p0 = player.equipped[0];
          document.title = 'rotSpeed=' + (p0 && p0.def ? p0.def.rotSpeed : 'none')
            + ' bonus=' + (player.spinBonus||0) + ' fspin=' + (player.fasterSpin||0)
            + ' cur=' + curSpin().toFixed(2) + ' reloadMult=' + (player.reloadMult||1).toFixed(3);
        }
        if(q.get('peas')) player.autoPeas = true;     // 自动连发 Peas（截图验证用）
        if(q.get('tuck')) keys['shift'] = true;       // 按住 Shift 收拢花瓣（截图验证用）
        if(q.get('alt')) keys['alt'] = true;          // 按住 Alt 看小地图分区（截图验证用）
        // ?portal=1 把玩家挪到最近的传送门旁边（截图 / 验证用）
        if(q.get('portal')){
          let best=null, bd=1e9;
          for(const pt of portals){ const d=Math.hypot(pt.x-player.x, pt.y-player.y); if(d<bd){bd=d;best=pt;} }
          if(best){ player.x = best.x; player.y = best.y + best.r*0.75; cam.x = player.x; cam.y = player.y; }
        }
        // ?craft=1 打开合成台（截图用）
        if(q.get('craft')) setTimeout(()=>{ try{ toggleCraft(); }catch(e){} }, 400);
        // ?talent=1 打开天赋面板（截图用）
        if(q.get('tal')) setTimeout(()=>{ try{ toggleTalents(); }catch(e){} }, 400);
        // ?inv=1 直接把卡片面板摊开（截图用）；?q=xxx 顺便把搜索框填上
        if(q.get('inv')){
          const to = setTimeout(()=>{
            try{
              toggleInventory();
              const qq = q.get('q');
              if(qq && elIvSearch){ elIvSearch.value = qq; ivSearch = qq; buildInvUI(); }
            }catch(e){}
          }, 300);
          void to;
        }
        // ?deck=Leaf,Leaf,Rose,Basic,Stinger 换一套起手花瓣（看效果 / 截图用）
        const deck = q.get('deck');
        if(deck){
          const arr = deck.split(',');
          player.equipped = [null,null,null,null,null];
          arr.slice(0,5).forEach((s,i)=>{
            const [nm, rar] = s.split(':');
            if(!PETAL_META[nm]) return;
            player.equipped[i] = makePetalInst(nm, rar || 'Common');
          });
          recompute();
          player.hp = player.maxHp;
          renderInventory();
        }
        // ?duel=baby_ant:Common 在花朵旁边钉一只「血条无限」的木桩，用来核对花瓣到底有没有伤害
        const duel = q.get('duel');
        if(duel){
          const [dk, dr] = duel.split(':');
          if(MOBS[dk]){
            const en = makeEnemy(dk, player.x+46, player.y, 1, dr||'Common');
            en.spawnT = 0; en.speed = 0; en.dmg = 0; en.atkCd = 1e9;
            en.ai = 'still'; en.def = Object.assign({}, en.def, {atk:null, onHitShoot:null, onHitSpawn:null});
            en.hp = en.maxHp = 1e6;
            en.duelFollow = true;      // 每帧钉回花朵旁边，测试时不会被走位甩开
            enemies.push(en);
          }
        }
        // ?kbmob=1 击退测试：地图右边缘放一只静止怪，然后用 2000 的击退往右推
        if(q.get('kbmob')){
          const mode = q.get('kbmob');
          const km = makeEnemy('rock', player.x + 60, player.y, 1, 'Common');
          km.ai = 'still'; km.speed = 0; km.spawnT = 0; km.kbTest = true;
          if(mode === '2'){ km.x = boundX - 420; km.y = player.y; }
          else            { km.x = player.x + 60; km.y = player.y; }
          enemies.push(km);
          if(mode === '2') km.kbx = 20000;      // 极端速度，专门测边界
          else knockMob(km, 0, 2000);
        }
        // ?partmob=spider 把这只怪钉住，只播腿/翅膀动画（用于逐帧截图比对）
        if(q.get('partmob')){ DBG.partMob = q.get('partmob'); }
        if(q.get('pinmob')){ DBG.pinMob = q.get('pinmob'); }
        if(q.get('maskdbg')){ DBG.maskDbg = 1; }
        // ?resp=1 直接走一遍「死亡 → 存档点复活」的流程（验证用）
        if(q.get('resp')){ player.hp = 0; respawnAtCheckpoint(); }
        // ?cmd2=/spawn%20super%20hornet —— 在玩家已被摆到出生点之后，再跑一条聊天指令
        const c2 = q.get('cmd2');
        if(c2){ elChatInput.value = c2; chatSubmit(); }
        const c3 = q.get('cmd3');
        if(c3){ setTimeout(()=>{ elChatInput.value = c3; try{ chatSubmit(); }catch(e){} }, 700); }
        // ?ptip=Basic|Common 固定把花瓣数据卡摆在左上角（截图验证用）
        const pt = q.get('ptip');
        if(pt){
          const [nm, rar] = pt.split('|');
          tipForced = true;
          elPtip.innerHTML = petalTipHTML(nm, rar || 'Common');
          elPtip.style.display = 'block';
          elPtip.style.left = '36px';
          elPtip.style.top  = '96px';
        }
        // ?sim=360 立刻推进 N 帧（无头截图时 rAF 被节流，用它在截图前把战斗推进到中局）
        for(let i=0;i<simN;i++){
          try{ update(1/60); }catch(err){ document.title='SIM_ERR '+(err&&err.message); break; }
        }
      };

      if(spw || ring || simN>0 || q.get('inv') || q.get('portal') || q.get('deck') || q.get('ptip') || q.get('face')){
        const t0 = Date.now();
        const poll = setInterval(()=>{
          const ready = !REGIONS[currentRegion].map || (regionMapReady && sgGrid && !sgDirty);
          if(!ready && Date.now()-t0 < 9000) return;
          clearInterval(poll);
          lateSetup();
        }, 120);
      }
    }, 100);
  }catch(e){}
})();

// ---------- collision self-check (?col=1) : writes a report to <title> ----------
(function(){
  try{
    const q = new URLSearchParams(location.search);
    // ?walk=d holds a movement key / ?tp=x,y teleports, so screenshots can show
    // the player resting against a wall (works with or without ?col)
    if(q.get('walk') || q.get('tp')){
      const k = (q.get('walk')||'').toLowerCase();
      const tp = q.get('tp');
      const start = setInterval(()=>{
        if(state!==STATE.PLAY || !sgGrid) return;
        clearInterval(start);
        if(tp){
          const [tx,ty] = tp.split(',').map(Number);
          if(isFinite(tx) && isFinite(ty)){ player.x = tx; player.y = ty; cam.x = tx; cam.y = ty; }
        }
        if(k) keys[k] = true;
        // headless screenshots only get a handful of frames, so ?warp=1 walks
        // the player forward immediately until the wall stops it
        if(q.get('warp') && k){
          const dxs = k==='a'?-1:(k==='d'?1:0), dys = k==='w'?-1:(k==='s'?1:0);
          for(let i=0;i<6000;i++){
            const nx = player.x + dxs*4, ny = player.y + dys*4;
            if(!blockedAt(nx, player.y, PLAYER_R)) player.x = nx;
            if(!blockedAt(player.x, ny, PLAYER_R)) player.y = ny;
          }
          cam.x = player.x; cam.y = player.y;
        }
        if(q.get('dbg')){
          setTimeout(()=>{
            document.title = JSON.stringify({
              dbg:'walk', k, keyOn: !!keys[k],
              px:+player.x.toFixed(1), py:+player.y.toFixed(1),
              blkEast: blockedAt(player.x+3, player.y, PLAYER_R),
              blkNow: blockedAt(player.x, player.y, PLAYER_R),
              sp: player.speedMult, state, grid: !!sfGrid, dirty: sgDirty
            });
          }, 3000);
        }
      }, 100);
    }
    // ?fam=1  统计每个地形家族被判成墙/可走的格子数（核对墙体用）
    if(q.get('fam')){
      const wait = setInterval(()=>{
        if(!sgGrid || sgDirty || !regionMap){ return; }
        clearInterval(wait);
        const stat = {};
        for(let ty=0; ty<sgH; ty++){
          for(let tx=0; tx<sgW; tx++){
            let gid = 0;
            for(const L of regionMap.layers){ const b = decodeLayerBytes(L); const g = b[(ty*sgW+tx)*2]; if(g) gid = g; }
            if(!gid) continue;
            const f = tileFamily(gid) || ('?'+gid);
            stat[f] = stat[f] || [0,0];
            stat[f][ sgGrid[ty*sgW+tx] ? 0 : 1 ]++;
          }
        }
        document.title = JSON.stringify({region: REGIONS[currentRegion].id, fam: stat});
      }, 150);
      return;
    }
    if(!q.get('col')) return;
    const t0 = Date.now();
    const tick = setInterval(()=>{
      // wait for the precise grid, not the coarse fallback used while art decodes
      if(!sgGrid || sgDirty){
        if(Date.now()-t0 > 12000){
          clearInterval(tick);
          document.title = 'COL_TIMEOUT grid='+!!sgGrid+' dirty='+sgDirty+' retries='+sgRetryN+
            ' ready='+(function(){ let a=0,b=0; for(const k in TILE_IMG){ b++; if(TILE_IMG[k].complete && TILE_IMG[k].naturalWidth) a++; } return a+'/'+b; })();
        }
        return;
      }
      clearInterval(tick);
      const n = sgW*sgH;
      let solid=0;
      for(let i=0;i<n;i++) if(sgGrid[i]) solid++;
      // free-run test: can we leave a 3x3 spawn box?
      const startX = player.x, startY = player.y;
      let moved = 0, eastStop = null;
      for(const [ax,ay] of [[1,0],[-1,0],[0,1],[0,-1]]){
        let px = startX, py = startY;
        for(let s=0;s<160;s++){
          const nx = px + ax*8, ny = py + ay*8;
          if(!blockedAt(nx, py, PLAYER_R)) px = nx;
          if(!blockedAt(px, ny, PLAYER_R)) py = ny;
        }
        moved = Math.max(moved, Math.hypot(px-startX, py-startY));
        if(ax===1) eastStop = px - startX;
      }
      const cellFamily = (x,y)=>{
        const [tx,ty]=cellOf(x,y);
        let gid=0;
        if(tx>=0&&ty>=0&&tx<sgW&&ty<sgH) for(const L of regionMap.layers){ const b=decodeLayerBytes(L); const g=b[(ty*sgW+tx)*2]; if(g) gid=g; }
        return tileFamily(gid)+'/'+gid;
      };
      // how far east is the first blocked subcell on the player's row?
      let eastGap = -1;
      for(let d=0; d<400; d+=1){ if(solidAtWorld(player.x+d, player.y)){ eastGap = d; break; } }
      const bt0 = performance.now();
      buildSolidGrid(regionMap);
      buildBushGrid(regionMap);
      const buildMs = +(performance.now()-bt0).toFixed(1);
      document.title = JSON.stringify({
        region: REGIONS[currentRegion].id,
        map: sgW+'x'+sgH,
        px: +player.x.toFixed(1), py: +player.y.toFixed(1),
        eastGap: eastGap,
        b15: blockedAt(player.x+15, player.y, PLAYER_R),
        b40: blockedAt(player.x+40, player.y, PLAYER_R),
        solidPct: +(100*solid/n).toFixed(1),
        mainPct: +(100*sgMainSize/Math.max(1,n-solid)).toFixed(1),
        spawnFree: !blockedAt(player.x, player.y, PLAYER_R),
        spawnInMain: isFreeMainAt(player.x, player.y),
        tileAtSpawn: cellFamily(player.x, player.y),
        walkReach: +moved.toFixed(0),
        eastStopPx: +eastStop.toFixed(0),
        eastStopOn: cellFamily(startX+eastStop, startY),
        eastAhead: cellFamily(startX+eastStop+30, startY),
        enemies: enemies.length,
        enemiesInWall: enemies.filter(e=>blockedAt(e.x,e.y,0)).length,
        buildMs: buildMs
      });
    }, 120);
  }catch(e){ document.title = 'COL_ERR '+e.message; }
})();


// ---------- 行为探针 (?probe=1): 把引擎运行统计写进 document.title ----------
// 用法: chrome --headless --dump-dom "...?auto=1&god=1&probe=1" | grep -o '<title>.*</title>'
(function(){
  try{
    const q = new URLSearchParams(location.search);
    if(!q.get('probe')) return;
    const wait = setInterval(()=>{
      if(state!==STATE.PLAY || !MANIFEST) return;
      clearInterval(wait);
      const rec = ()=>{
        const byAI = {};
        for(const e of enemies) byAI[e.ai] = (byAI[e.ai]||0) + 1;
        const byRar = {};
        for(const e of enemies) byRar[e.mobRarity] = (byRar[e.mobRarity]||0) + 1;
        document.title = JSON.stringify({
          region: REGIONS[currentRegion].id,
          spr: Object.keys(typeof PSPRITE!=='undefined'?PSPRITE:{}).length,
          bad: Object.keys(typeof PSPRITE_BAD!=='undefined'?PSPRITE_BAD:{}).join('|'),
          mapR: (typeof regionMapReady!=='undefined' && regionMapReady)?1:0,
          pos: [+player.x.toFixed(0), +player.y.toFixed(0)],
          pd: portals.length ? +Math.min(...portals.map(pt=>Math.hypot(pt.x-player.x,pt.y-player.y))).toFixed(0) : -1,
          enemies: enemies.length, byAI: byAI, byRar: byRar,
          anims: (function(){ const o={}; for(const k in DBG.frSeen) o[k] = Object.keys(DBG.frSeen[k]).length; return o; })(),
          altN: (player.alt||[]).filter(Boolean).length, mainN: (player.equipped||[]).filter(Boolean).length,
          eproj: eproj.length, zaps: zaps.length, puffs: puffs.length, drops: drops.length,
          pickD: (DBG.dropD==null?null:+DBG.dropD.toFixed(1)), picks: DBG.picks||0, equips: DBG.equips||0, pickErr: DBG.pickErr||'',
          shots: DBG.shots, adds: DBG.adds, zapHits: DBG.zaps, deaths: DBG.deaths,
          L: (function(){ const l = enemies.find(e=>e.ai==='leech'); return l ? {dx:+(l.x-player.x).toFixed(0), dy:+(l.y-player.y).toFixed(0), sp:+l.speed.toFixed(0), r:+l.r.toFixed(0), sm:l.spdMul||1, st:+(l.spawnT||0).toFixed(2), ag:!!l.aggroOn} : null; })(),
          nearD: +Math.min(9999,...enemies.map(e=>Math.hypot(e.x-player.x,e.y-player.y))).toFixed(0),
          ev: {charges:DBG.charges, attaches:DBG.attaches, dugs:DBG.dugs, retreats:DBG.retreats,
               undead:DBG.undead, link:DBG.link, pops:DBG.pops, broke:DBG.broke||0,
               heals:+(DBG.heals||0).toFixed(1), replaced:DBG.replaced||0,
               poisoned:enemies.filter(e=>e.poison).length,
               slowed:enemies.filter(e=>e.slowT>0).length,
               turned:enemies.filter(e=>Math.abs(e.faceRot||0)>0.05).length},
          petals: player.equipped.filter(Boolean).map(p=>({n:p.name, d:+(p.dur||0).toFixed(1),
                   m:+(p.maxDur||0).toFixed(0), b:+(p.broken||0).toFixed(2)})),
          bagN: player.backpack.length,
          lv: player.level, xp: Math.round(player.xp),
          legN: DBG.legN||0, wingN: DBG.wingN||0,
          boss: (function(){
            const el = document.getElementById('bossbar');
            if(!el) return null;
            const f = document.getElementById('bb-fill');
            return {on: el.classList.contains('on'),
                    name: document.getElementById('bb-name').textContent,
                    rar: document.getElementById('bb-rar').textContent,
                    w: f.style.width};
          })(),
          spd: (function(){
            const e = enemies.find(en=>en.key==='spider');
            if(!e) return null;
            const aim = Math.atan2(player.y-e.y, player.x-e.x);
            const head = (e.faceRot||0) + ART_HEAD;
            const err = Math.atan2(Math.sin(aim-head), Math.cos(aim-head));
            return {on:!!e.aggroOn, rot:+(e.faceRot*57.3).toFixed(0), errDeg:+(err*57.3).toFixed(0),
                    spd:+(e.stepSpd||0).toFixed(0), gait:+(e.gait||0).toFixed(1)};
          })(),
          cpd: (function(){
            const segs = enemies.filter(e=>e.def && e.def.chain);
            if(!segs.length) return null;
            const heads = segs.filter(e=>!e.leaderSeg).length;
            let maxGap = 0;
            for(const e of segs){
              if(!e.leaderSeg) continue;
              maxGap = Math.max(maxGap, Math.hypot(e.x-e.leaderSeg.x, e.y-e.leaderSeg.y));
            }
            const head = segs.find(e=>!e.leaderSeg) || segs[0];
            const chain = segs.slice(0,6).map(e=>[Math.round(e.x-head.x), Math.round(e.y-head.y)]);
            const rs = segs.map(e=>+(e.r||0).toFixed(2));
            const st = segs.map(e=>+(e.spawnT||0).toFixed(3));
            return {n:segs.length, heads, maxGap:+maxGap.toFixed(1), r:+(segs[0].r||0).toFixed(1),
                    rAll:[Math.min(...rs), Math.max(...rs)],
                    spT:[Math.min(...st), Math.max(...st)],
                    out: segs.filter(e=>Math.abs(e.x)>boundX+1 || Math.abs(e.y)>boundY+1).length,
                    chain};
          })(),
          // 不同生物之间还有没有压在一起（worst = 最大重叠像素，应该接近 0）
          sep: (function(){
            let worst = 0, pair = null, tested = 0;
            for(let i=0;i<enemies.length;i++){
              const a = enemies[i];
              if(a.hp<=0) continue;
              for(let j=i+1;j<enemies.length;j++){
                const b = enemies[j];
                if(b.hp<=0) continue;
                if(a.chainId!=null && a.chainId===b.chainId) continue;
                tested++;
                const over = (a.r+b.r)*SEP_K - Math.hypot(a.x-b.x, a.y-b.y);
                if(over > worst){ worst = over; pair = [a.key, b.key]; }
              }
            }
            return {tested, worst:+worst.toFixed(1), pair};
          })(),
          parts: (function(){
            const o = {};
            for(const k in MOB_IMG){
              if(k.indexOf('P_') !== 0) continue;
              o[k] = (MOB_IMG[k].naturalWidth || 0) + (MOB_IMG[k].__broken ? 'x' : '');
            }
            const g = {};
            for(const e of enemies){
              if(!MOB_PARTS[e.key]) continue;
              g[e.key] = {spd:+(e.stepSpd||0).toFixed(0), gait:+(e.gait||0).toFixed(2), on:!!e.aggroOn};
            }
            return {img:o, mobs:g};
          })(),
          cp: player.cp ? {r:player.cp.region, lv:player.cp.lv, u:player.cp.uses||0} : null,
          bagTail: player.backpack.slice(-3).map(it=>it.rarity[0]+':'+it.name),
          duelHp: (function(){ const e = enemies.find(en=>en.maxHp===1e6); return e?Math.round(e.hp):null; })(),
          mDbg: [DBG.mT||0, DBG.mTgt?1:0, +(DBG.mCd||0).toFixed(3), DBG.mhits||0],
          spawnVia: DBG.spawnVia || '?', spawnPd: DBG.spawnPd,
          spawners: spawners.length,
          hornet: (function(){
            const e = enemies.find(en=>en.key==='hornet');
            if(!e) return null;
            const aim  = Math.atan2(player.y-e.y, player.x-e.x);
            const head = (e.faceRot||0) + ART_HEAD;
            const want = e.tailAim ? aim + Math.PI : aim;
            const err  = Math.atan2(Math.sin(want-head), Math.cos(want-head));
            const rl = e.rotLog || [];
            return {t:+(e.shootT||0).toFixed(2), tail:!!e.tailAim, errDeg:+(err*57.3).toFixed(1),
                    n:rl.length, rot:rl.slice(-8)};
          })(),
          kb: (function(){
            const e = enemies.find(en=>en.kbTest);
            if(!e) return null;
            const pa = e.kbPath||[];
            return { dx:+(e.x - player.x).toFixed(1), v:+(e.kbx||0).toFixed(0),
                     over:+(e.x - boundX).toFixed(1), y:+e.y.toFixed(0), by:+boundY.toFixed(0),
                     n: pa.length, path: pa.slice(0, 10) };
          })(),
          portals: portals.map(pt=>[pt.to, +Math.hypot(pt.x-player.x,pt.y-player.y).toFixed(0)]),
          spin: +(player.spinCtrl||1).toFixed(2),
          attached: enemies.filter(e=>e.attach).length,
          charging: enemies.filter(e=>e.charging>0).length,
          dug: enemies.filter(e=>e.dug>0).length,
          retreat: enemies.filter(e=>e.retreating).length,
          trail: player.equipped.reduce((n,p)=>n+((p&&p._puffs)?p._puffs.length:0),0), texts: texts.length,
          tEmit: DBG.trailEmit||0,
          aggro: enemies.filter(e=>e.aggroOn).length,
          rot: (function(){
            const a = enemies.filter(e=>e.aggroOn && MOBILE_AI.has(e.ai));
            if(!a.length) return null;
            const e = a[0];
            const want = Math.atan2(player.y-e.y, player.x-e.x) - ART_HEAD;
            let df = want - (e.faceRot||0);
            df = Math.atan2(Math.sin(df), Math.cos(df));
            return {dx:+(player.x-e.x).toFixed(0), dy:+(player.y-e.y).toFixed(0),
                    rot:+((e.faceRot||0)*57.3).toFixed(0), err:+(df*57.3).toFixed(0)};
          })(),
          maxAge: +Math.max(0,...enemies.map(e=>e.age||0)).toFixed(2),
          now: Math.round(performance.now()),
          lvl: player.level, hp: Math.round(player.hp)
        });
      };
      rec(); setInterval(rec, 400);
    }, 120);
  }catch(e){}
})();

// ---------- 运行时错误上报（截图/自检时能从 <title> 里看出来）----------
window.addEventListener('error', function(ev){
  try{ document.title = 'ERR ' + (ev.message||'?') + ' @' + (ev.lineno||0); }catch(e){}
});
