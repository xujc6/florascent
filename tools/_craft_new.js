const elCraft      = document.getElementById('craft');
const elCraftList  = document.getElementById('craftlist');
const elCStack     = document.getElementById('cstack');
const elCResult    = document.getElementById('cresult');
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

function nextRarity(r){
  const i = CRAFT_CHAIN.indexOf(r);
  return (i >= 0 && i < CRAFT_CHAIN.length-1) ? CRAFT_CHAIN[i+1] : null;
}
// 幸运天赋把成功率往上抬一点（每级 +50% 的幸运值）
function craftChance(r){
  const base = CRAFT_RATE[r];
  if(base == null) return 0;
  return Math.min(0.95, base + (player.luck||0)*0.5);
}
// 0.1% 这种小数不能被 Math.round 抹成 0
function fmtRate(r){
  const p = r*100;
  return (p < 1 ? p.toFixed(1) : Math.round(p)) + '%';
}

function countInBag(name, rarity){
  let n = 0;
  for(const it of player.backpack) if(it.name===name && it.rarity===rarity) n++;
  return n;
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
let cSel = null;        // {name, rarity} 当前选中的那组
let cBatch = 0;         // 台面上排了几批（每批 5 片）
let cBusy = false;      // 动画播放中，禁止重复点击

function craftBg(name, rar){ return 'url("' + petalIconSrc(name, rar) + '")'; }

function craftOpen(){ return !!(elCraft && elCraft.style.display === 'block'); }

function updateCraftBtn(){
  if(!elCDo) return;
  if(cSel && cBatch > 0){
    const p = craftChance(cSel.rarity);
    elCDo.disabled = cBusy;
    elCDo.querySelector('b').textContent = cBatch > 1 ? ('Craft ×' + cBatch) : 'Craft';
    elCDo.querySelector('i').textContent = 'Success: ' + fmtRate(p);
  } else {
    elCDo.disabled = true;
    elCDo.querySelector('b').textContent = 'Craft';
    elCDo.querySelector('i').textContent = 'Success: —';
  }
}

// 台面上那一摞：5 张叠着，带一点扇形错位
function renderStack(anim){
  if(!elCStack) return;
  elCStack.classList.remove('busy','boom','fail');
  elCStack.innerHTML = '';
  if(!cSel || cBatch < 1) return;
  const url = craftBg(cSel.name, cSel.rarity);
  for(let i=0;i<CRAFT_COST;i++){
    const d = document.createElement('div');
    d.className = 'cstk' + (anim ? ' in' : '');
    d.style.backgroundImage = url;
    d.style.zIndex = String(i+1);
    d.style.rotate = ((i - (CRAFT_COST-1)/2) * 1.7).toFixed(2) + 'deg';
    d.style.translate = ((i - (CRAFT_COST-1)/2) * 1.1).toFixed(2) + 'px ' + (-i*0.9).toFixed(2) + 'px';
    if(anim){ d.style.animationDelay = (i*0.055).toFixed(3) + 's'; d.style.opacity = '0'; }
    else d.style.opacity = '1';
    elCStack.appendChild(d);
  }
  const cn = document.createElement('div');
  cn.className = 'cn';
  cn.textContent = '×' + (cBatch*CRAFT_COST);
  elCStack.appendChild(cn);
}

// 5 张花瓣从柜子里飞到台面上
function flyPetalToTable(slot){
  const b = elCStack.getBoundingClientRect();
  const src = slot.getBoundingClientRect();
  const endW = 86;
  const url = craftBg(cSel.name, cSel.rarity);
  for(let i=0;i<CRAFT_COST;i++){
    const f = document.createElement('div');
    f.className = 'flyer';
    f.style.backgroundImage = url;
    f.style.width = src.width + 'px';
    f.style.height = src.height + 'px';
    f.style.left = '0px'; f.style.top = '0px';
    document.body.appendChild(f);
    const x0 = src.left, y0 = src.top;
    const dx = b.left + 6 - x0, dy = b.top + 6 - y0;
    const sc = endW / Math.max(1, src.width);
    const rot = (Math.random()*2-1)*34;
    const lift = 40 + Math.random()*46;
    const dur = 360 + i*18;
    const an = f.animate([
      { transform:`translate(${x0}px,${y0}px) scale(1) rotate(0deg)`, opacity:.15, offset:0 },
      { transform:`translate(${x0+dx*0.62}px,${y0+dy*0.42-lift}px) scale(${(1+sc)/1.7}) rotate(${rot*0.5}deg)`,
        opacity:1, offset:.55 },
      { transform:`translate(${x0+dx}px,${y0+dy}px) scale(${sc}) rotate(${rot}deg)`, opacity:1, offset:1 }
    ], { duration:dur, delay:i*52, easing:'cubic-bezier(.3,.02,.4,1)', fill:'both' });
    an.onfinish = ()=> f.remove();
  }
  return 5*52 + 360;
}

// 成功时台面上弹出新卡片 + 白圈
function showResult(name, rarity, ring){
  if(!elCResult) return;
  elCResult.classList.remove('show','ring');
  if(!name){ elCResult.style.backgroundImage=''; return; }
  elCResult.style.backgroundImage = craftBg(name, rarity);
  void elCResult.offsetWidth;
  elCResult.classList.add('show');
  if(ring){ elCResult.classList.add('ring'); }
}

function clearTable(){
  cSel = null; cBatch = 0;
  renderStack(false);
  if(elCResult){ elCResult.classList.remove('show','ring'); elCResult.style.backgroundImage=''; }
  updateCraftBtn();
}

// ---- 把花瓣放上台面 ----
function placePetal(g, all){
  if(cBusy) return;
  const have = countInBag(g.name, g.rarity);
  if(have < CRAFT_COST){ toast('Need ' + CRAFT_COST + ' identical petals', 'bad'); return; }
  const batches = all ? Math.floor(have/CRAFT_COST) : 1;
  const slot = elCraftList.querySelector('.cslot[data-k="'+g.name+'|'+g.rarity+'"]');
  cSel = { name:g.name, rarity:g.rarity };
  cBatch = Math.max(1, batches);
  if(elCResult){ elCResult.classList.remove('show','ring'); elCResult.style.backgroundImage=''; }
  const wait = slot ? flyPetalToTable(slot) : 0;
  // 飞行途中先不显示台面上的牌，落地后才「啪」地摞起来
  if(elCStack) elCStack.innerHTML = '';
  updateCraftBtn();
  elCDo.disabled = true;
  setTimeout(()=>{
    if(!cSel) return;
    renderStack(true);
    updateCraftBtn();
  }, wait);
  // 柜子里的选中态
  for(const s of elCraftList.querySelectorAll('.cslot')) s.classList.toggle('sel', false);
  if(slot) slot.classList.add('sel');
}

// ---- 合成一次 ----
function craftOne(){
  return new Promise(resolve=>{
    if(!cSel || cBatch < 1){ resolve(false); return; }
    const name = cSel.name, rar = cSel.rarity;
    // 扣掉 5 片
    let need = CRAFT_COST;
    for(let i=player.backpack.length-1; i>=0 && need>0; i--){
      const it = player.backpack[i];
      if(it.name===name && it.rarity===rar) { player.backpack.splice(i,1); need--; }
    }
    const p = craftChance(rar);
    const ok = Math.random() < p;
    const next = nextRarity(rar);
    cBusy = true;
    elCDo.disabled = true;
    if(elCStack){ elCStack.classList.remove('boom','fail'); elCStack.classList.add('busy'); }
    setTimeout(()=>{
      if(elCStack) elCStack.classList.remove('busy');
      let lost = 0;
      if(ok && next){
        player.backpack.push({ name, rarity:next });
        if(elCStack) elCStack.classList.add('boom');
        showResult(name, next, true);
        toast('Crafted ' + RARITY_CN[next] + ' ' + name + '!', 'good');
        // wiki：合成出 Super 花瓣会全服播报
        if(next === 'Super') chatPrint('A Super ' + name + ' has been crafted by ' + player.name + '!', 'ok');
      } else {
        // wiki：失败损失 1~4 片，剩下的退回背包
        lost = 1 + ((Math.random()*4)|0);
        for(let i=0;i<CRAFT_COST-lost;i++) player.backpack.push({ name, rarity:rar });
        if(elCStack) elCStack.classList.add('fail');
        showResult(null);
        toast('Craft failed — ' + lost + ' petal' + (lost>1?'s':'') + ' destroyed', 'bad');
      }
      DBG.crafts = (DBG.crafts||0) + 1;
      if(ok) DBG.craftOk = (DBG.craftOk||0) + 1;
      // 还能凑够 5 片就继续摆着，凑不够就清台
      const left = countInBag(name, rar);
      cBatch = Math.min(cBatch, Math.floor(left/CRAFT_COST));
      setTimeout(()=>{
        if(cBatch > 0){ renderStack(true); }
        else { clearTable(); }
        cBusy = false;
        updateCraftBtn();
        buildCraftUI();
        renderInventory();
        resolve(ok);
      }, 400);
    }, 640);
  });
}

async function doCraft(all){
  if(cBusy || !cSel || cBatch < 1) return;
  const rounds = all ? cBatch : 1;
  for(let i=0;i<rounds;i++){
    if(!cSel || cBatch < 1) break;
    const ok = await craftOne();
    if(!ok && !cSel) break;
    if(i < rounds-1) await new Promise(r=>setTimeout(r, 60));
  }
}

function buildCraftUI(){
  if(!elCraftList) return;
  elCraftList.innerHTML = '';
  const groups = bagGroups();
  if(!groups.length){
    const empty = document.createElement('div');
    empty.style.cssText = 'grid-column:1/-1;color:rgba(255,255,255,.85);font-size:12px;padding:10px 2px;text-align:center;';
    empty.textContent = 'Bag is empty — kill some mobs.';
    elCraftList.appendChild(empty);
  }
  for(const g of groups){
    const d = document.createElement('div');
    d.className = 'cslot' + (g.n < CRAFT_COST ? ' no' : '');
    d.dataset.k = g.name + '|' + g.rarity;
    d.style.backgroundImage = craftBg(g.name, g.rarity);
    d.title = g.name + ' · ' + RARITY_CN[g.rarity] + ' ×' + g.n;
    const cn = document.createElement('div');
    cn.className = 'cn'; cn.textContent = '×' + g.n;
    d.appendChild(cn);
    if(cSel && cSel.name===g.name && cSel.rarity===g.rarity) d.classList.add('sel');
    d.addEventListener('click', ev=>{
      if(g.n < CRAFT_COST) return;
      placePetal(g, ev.shiftKey);
      if(ev.altKey){ doCraft(ev.shiftKey); }     // Alt+点：直接开合
    });
    elCraftList.appendChild(d);
  }
  if(elCBag) elCBag.textContent = player.backpack.length + ' / ' + BAG_MAX + ' petals in bag';
  if(elCRate) elCRate.textContent = cSel ? (RARITY_CN[cSel.rarity] + ' → ' + (nextRarity(cSel.rarity) ? RARITY_CN[nextRarity(cSel.rarity)] : '—')) : '';
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
  clearTable();
  buildCraftUI();
}

if(elCDo) elCDo.addEventListener('click', ev=> doCraft(ev.altKey));
document.getElementById('craftBtn').addEventListener('click', toggleCraft);
document.getElementById('cclose').addEventListener('click', toggleCraft);
window.addEventListener('keydown', e=>{
  if((e.key==='c'||e.key==='C') && state===STATE.PLAY && !elChat.classList.contains('open')) toggleCraft();
});
