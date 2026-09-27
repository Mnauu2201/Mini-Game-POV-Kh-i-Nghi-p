// ============================================================
// VỈA HÈ KHỞI NGHIỆP — Giai đoạn 1: Xe đẩy vỉa hè
// ============================================================

// ---------- CONSTANTS ----------
const DAYS_VI = ['Chủ Nhật','Thứ 2','Thứ 3','Thứ 4','Thứ 5','Thứ 6','Thứ 7'];
const WEATHER = {
  sun:   { label:'Nắng nhẹ',   icon:'☀️', drinkMult:1.0, foodMult:1.0, customerMult:1.0 },
  hot:   { label:'Nắng nóng',  icon:'🔥', drinkMult:1.8, foodMult:0.75, customerMult:1.05 },
  cool:  { label:'Se lạnh',    icon:'🌥️', drinkMult:0.7, foodMult:1.4, customerMult:1.0 },
  rain:  { label:'Mưa',        icon:'🌧️', drinkMult:0.8, foodMult:0.8, customerMult:0.55 },
};
const WEATHER_KEYS = Object.keys(WEATHER);

// Danh sách nguyên liệu — mở khóa dần theo ngày
const INGREDIENTS = [
  { id:'bo',    name:'Bò viên',       icon:'🔴', color:'#c0392b', basePrice:1500, shelfLife:4, unlockDay:1 },
  { id:'ca',    name:'Cá viên',       icon:'⚪', color:'#e8dcc8', basePrice:1200, shelfLife:4, unlockDay:1 },
  { id:'xx',    name:'Xúc xích',      icon:'🌭', color:'#d4622a', basePrice:1800, shelfLife:4, unlockDay:3 },
  { id:'tom',   name:'Tôm viên',      icon:'🦐', color:'#e8834b', basePrice:2200, shelfLife:3, unlockDay:5 },
  { id:'hacao', name:'Há cảo',        icon:'🥟', color:'#e8c078', basePrice:2000, shelfLife:3, unlockDay:7 },
  { id:'pho',   name:'Viên phô mai',  icon:'🧀', color:'#f0c040', basePrice:2500, shelfLife:3, unlockDay:9 },
];
function unlockedIngredients(){
  return INGREDIENTS.filter(ing => ing.unlockDay <= S.day);
}
function getIngredient(id){ return INGREDIENTS.find(i=>i.id===id); }

const CAT_TYPES = [
  {
    id:'ngoac', name:'Mèo Ngơ Ngác', icon:'🐱',
    patienceTime: 55, patienceLabel:'Kiên nhẫn cao',
    itemsMin:1, itemsMax:2, tipMult:1.0, angerMult:0.7,
    quote:['Ơ... cho xin ạ?', 'Dạ... vâng ạ...'],
    weight:3,
  },
  {
    id:'nong', name:'Mèo Nóng Tính', icon:'😾',
    patienceTime: 30, patienceLabel:'Kiên nhẫn thấp — tip cao nếu nhanh',
    itemsMin:2, itemsMax:3, tipMult:1.6, angerMult:1.6,
    quote:['NHANH LÊN!!', 'Đói lắm rồi đó nha!'],
    weight:2,
  },
  {
    id:'khoc', name:'Mèo Hay Khóc', icon:'😿',
    patienceTime: 40, patienceLabel:'Nhạy cảm — sai là mếu ngay',
    itemsMin:1, itemsMax:2, tipMult:1.2, angerMult:2.0,
    quote:['Huhu đói bụng...', 'Làm đúng cho em nha...'],
    weight:2,
  },
  {
    id:'sang', name:'Mèo Sang Chảnh', icon:'😼',
    patienceTime: 45, patienceLabel:'Khó tính — order nhiều, tip đậm',
    itemsMin:2, itemsMax:4, tipMult:2.2, angerMult:1.3,
    quote:['Cho phần ngon nhất nhé.', 'Phải chín đều nha, đừng có cháy.'],
    weight:1,
  },
];

const SELL_MARGIN = 2.6; // giá bán = giá nhập * margin (xấp xỉ lợi nhuận gộp)
const COOK_TIME_PERFECT_MIN = 4000; // ms - bắt đầu vùng "vừa chín"
const COOK_TIME_PERFECT_MAX = 7000; // ms - hết vùng vừa chín
const COOK_TIME_BURNT = 11000; // ms - cháy hẳn

// ---------- STATE ----------
let S = {
  day: 1,
  dayOfWeek: 1, // 0=CN
  money: 500000,
  reputation: 3.0,
  weatherToday: 'sun',
  weatherForecast: [], // mảng 3 ngày tới (index0 = hôm nay)
  stock: {},       // { bo: 12, ca: 8, ... } số viên tồn kho theo từng loại
  stockAgeDay: {}, // { bo: 2, ca: 0, ... } số ngày đã để mỗi loại
  eventDaysUntilEvict: null, // random countdown ngày để trigger sự kiện (sau ngày 12)
  evictedToday: false,
  messages: [],
  // ---- serve session ----
  serve: {
    active:false,
    stockLeft:{},       // bản sao stock dùng trong ca bán, trừ dần khi nướng
    timeMinutes: 7*60,  // 07:00 start
    endMinutes: 22*60,  // 22:00 end
    queue: [], // customers waiting
    current: null, // current customer object
    skewers: [], // {id, state:'raw'|'cooking'|'perfect'|'burnt', startedAt, items:[ingredientId,...]}
    revenueToday:0,
    tipsToday:0,
    servedToday:0,
    missedToday:0,
    repDeltaToday:0,
  },
  prep: {
    pendingBuy: {}, // { bo: 5, ca: 3, ... }
  },
};

let skewerIdCounter = 1;
let loopHandle = null;
let evictTimerHandle = null;

// ---------- UTIL ----------
function formatMoney(n){
  return Math.round(n).toLocaleString('vi-VN') + 'đ';
}
function rand(min,max){ return Math.random()*(max-min)+min; }
function randInt(min,max){ return Math.floor(rand(min,max+1)); }
function pick(arr){ return arr[randInt(0,arr.length-1)]; }
function pickWeighted(items){
  const total = items.reduce((s,i)=>s+i.weight,0);
  let r = rand(0,total);
  for(const it of items){
    if(r < it.weight) return it;
    r -= it.weight;
  }
  return items[items.length-1];
}
function show(screenId){
  document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}
function floaty(text, color){
  const el = document.createElement('div');
  el.className = 'floaty';
  el.textContent = text;
  el.style.color = color || '#fff';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 950);
}
function addMessage(text){
  S.messages.unshift({ day:S.day, text });
  if(S.messages.length > 20) S.messages.pop();
}

// ---------- WEATHER / CALENDAR ----------
function rollWeatherForecast(){
  // tạo forecast 3 ngày nếu chưa có, hoặc dịch chuyển
  if(S.weatherForecast.length === 0){
    for(let i=0;i<3;i++) S.weatherForecast.push(pick(WEATHER_KEYS));
  }
}
function advanceWeather(){
  S.weatherForecast.shift();
  S.weatherForecast.push(pick(WEATHER_KEYS));
  S.weatherToday = S.weatherForecast[0];
}

function isWeekend(dow){ return dow === 0 || dow === 6; }

// ---------- MARKET (giá nguyên liệu biến động) ----------
let marketPrices = {}; // { bo: 1500, ca: 1180, ... } giá hôm nay theo từng loại
function rollMarketPrice(){
  INGREDIENTS.forEach(ing=>{
    const variance = rand(-0.15, 0.20);
    marketPrices[ing.id] = Math.round(ing.basePrice * (1+variance) / 100) * 100;
  });
}

// ============================================================
// INIT
// ============================================================
function init(){
  rollWeatherForecast();
  S.weatherToday = S.weatherForecast[0];
  rollMarketPrice();
  S.eventDaysUntilEvict = randInt(10,15) - S.day; // mốc 10-15 ngày đầu yên ổn
  addMessage('Chào mừng đến với vỉa hè! Nhập hàng tối nay rồi mai mở bán nhé.');
  renderStreet();

  document.getElementById('btnStart').addEventListener('click', ()=>{
    show('screen-street');
  });
  document.getElementById('btnGoSell').addEventListener('click', startServeDay);
  document.getElementById('btnGoPrep').addEventListener('click', openPrep);
  document.getElementById('btnPhone').addEventListener('click', openPhone);
  document.getElementById('btnClosePhone').addEventListener('click', closePhone);
  document.getElementById('btnConfirmPrep').addEventListener('click', confirmPrep);
  document.getElementById('btnSkipPrep').addEventListener('click', ()=>show('screen-street'));
  document.getElementById('btnEndShift').addEventListener('click', endServeDay);
  document.getElementById('btnPutOnGrill').addEventListener('click', putBuildOnGrill);
  document.getElementById('btnUndoBuild').addEventListener('click', removeLastBuildItem);
  document.getElementById('btnServe').addEventListener('click', tryServeCurrentCustomer);
  document.getElementById('btnNextDay').addEventListener('click', goToNextDay);
}

// ============================================================
// STREET SCREEN
// ============================================================
function totalStock(){
  return Object.values(S.stock).reduce((a,b)=>a+b, 0);
}
function renderStreet(){
  document.getElementById('moneyLabel').textContent = formatMoney(S.money);
  document.getElementById('repLabel').textContent = S.reputation.toFixed(1);
  document.getElementById('dayLabel').textContent = `Ngày ${S.day} · ${DAYS_VI[S.dayOfWeek]}`;
  const w = WEATHER[S.weatherToday];
  document.getElementById('weatherChip').textContent = `${w.icon} ${w.label}`;
  const total = totalStock();
  document.getElementById('prepHint').textContent = total > 0 ? `Còn ${total} viên tồn kho` : 'Chưa có hàng cho ngày mai';
  const canSell = total > 0;
  document.getElementById('btnGoSell').disabled = !canSell;
  document.getElementById('btnGoSell').innerHTML = canSell
    ? `Mở bán hôm nay 🍢 <span class="sub">Còn ${total} viên</span>`
    : `Chưa có hàng để bán <span class="sub">Nhập hàng trước đã</span>`;
}

// ============================================================
// PREP SCREEN — nhập hàng
// ============================================================
function openPrep(){
  S.prep.pendingBuy = {};
  renderPrep();
  show('screen-prep');
}
function renderPrep(){
  // forecast row
  const fRow = document.getElementById('forecastRow');
  fRow.innerHTML = '';
  S.weatherForecast.forEach((wk,i)=>{
    const w = WEATHER[wk];
    const dow = (S.dayOfWeek + i) % 7;
    const card = document.createElement('div');
    card.className = 'forecast-card' + (i===0 ? ' today':'');
    card.innerHTML = `<div class="d">${i===0?'HÔM NAY':DAYS_VI[dow]}</div><div class="ic">${w.icon}</div><div class="lbl">${w.label}</div>`;
    fRow.appendChild(card);
  });

  // market cards - 1 thẻ mỗi loại nguyên liệu đã mở khóa
  const marketList = document.getElementById('marketList');
  marketList.innerHTML = '';
  const unlocked = unlockedIngredients();
  unlocked.forEach(ing=>{
    const price = marketPrices[ing.id];
    const priceDiff = price - ing.basePrice;
    const priceClass = priceDiff > 30 ? 'up' : (priceDiff < -30 ? 'down' : '');
    const priceArrow = priceDiff > 30 ? '▲' : (priceDiff < -30 ? '▼' : '—');
    const qty = S.prep.pendingBuy[ing.id] || 0;
    const curStock = S.stock[ing.id] || 0;
    const curAge = S.stockAgeDay[ing.id] || 0;
    const card = document.createElement('div');
    card.className = 'market-card';
    card.innerHTML = `
      <div class="market-title">
        <div class="name">${ing.icon} ${ing.name}</div>
        <div class="price ${priceClass}">${priceArrow} ${formatMoney(price)}/viên</div>
      </div>
      <div class="stepper">
        <button class="ing-down" data-id="${ing.id}">−</button>
        <div class="val" id="val-${ing.id}">${qty}</div>
        <button class="ing-up" data-id="${ing.id}">+</button>
      </div>
      <div class="stock-note">Hạn dùng ~${ing.shelfLife} ngày. Tồn kho: ${curStock} viên${curAge>0?` (đã để ${curAge} ngày)`:''}.</div>
    `;
    marketList.appendChild(card);
  });
  // thông báo nguyên liệu sắp mở khóa
  const nextLock = INGREDIENTS.find(ing => ing.unlockDay > S.day);
  if(nextLock){
    const hint = document.createElement('div');
    hint.style.cssText = 'text-align:center; font-size:12px; opacity:.55; padding:8px 10px; margin-top:2px;';
    hint.textContent = `🔒 ${nextLock.name} sẽ mở khóa vào ngày ${nextLock.unlockDay}`;
    marketList.appendChild(hint);
  }

  document.querySelectorAll('.ing-down').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      S.prep.pendingBuy[id] = Math.max(0, (S.prep.pendingBuy[id]||0) - 5);
      updatePrepFooter();
    });
  });
  document.querySelectorAll('.ing-up').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      S.prep.pendingBuy[id] = (S.prep.pendingBuy[id]||0) + 5;
      updatePrepFooter();
    });
  });
  updatePrepFooter();
}
function prepTotalCost(){
  let total = 0;
  for(const id in S.prep.pendingBuy){
    total += (S.prep.pendingBuy[id]||0) * (marketPrices[id]||0);
  }
  return total;
}
function updatePrepFooter(){
  for(const id in S.prep.pendingBuy){
    const el = document.getElementById('val-'+id);
    if(el) el.textContent = S.prep.pendingBuy[id];
  }
  const cost = prepTotalCost();
  document.getElementById('prepCost').textContent = formatMoney(cost);
  const totalQty = Object.values(S.prep.pendingBuy).reduce((a,b)=>a+b,0);
  document.getElementById('btnConfirmPrep').disabled = totalQty === 0 || cost > S.money;
}
function confirmPrep(){
  const cost = prepTotalCost();
  if(cost > S.money) return;
  S.money -= cost;
  let totalBought = 0;
  for(const id in S.prep.pendingBuy){
    const qty = S.prep.pendingBuy[id] || 0;
    if(qty > 0){
      S.stock[id] = (S.stock[id]||0) + qty;
      S.stockAgeDay[id] = 0;
      totalBought += qty;
    }
  }
  addMessage(`Đã nhập ${totalBought} viên hết ${formatMoney(cost)}.`);
  renderStreet();
  show('screen-street');
}

// ============================================================
// PHONE OVERLAY
// ============================================================
function openPhone(){
  renderPhone();
  document.getElementById('phoneOverlay').classList.add('active');
}
function closePhone(){
  document.getElementById('phoneOverlay').classList.remove('active');
}
function renderPhone(){
  const pf = document.getElementById('phoneForecast');
  pf.innerHTML = '';
  S.weatherForecast.forEach((wk,i)=>{
    const w = WEATHER[wk];
    const dow = (S.dayOfWeek + i) % 7;
    const card = document.createElement('div');
    card.className = 'forecast-card' + (i===0 ? ' today':'');
    card.innerHTML = `<div class="d">${i===0?'HÔM NAY':DAYS_VI[dow]}</div><div class="ic">${w.icon}</div><div class="lbl">${w.label}</div>`;
    pf.appendChild(card);
  });

  // hour bars - mô phỏng lượng khách theo giờ (17h-21h vì đây là khung giờ bán)
  const hourBars = document.getElementById('hourBars');
  const hourLabels = document.getElementById('hourLabels');
  hourBars.innerHTML = ''; hourLabels.innerHTML = '';
  const hours = [17,18,19,20];
  const dow = S.dayOfWeek;
  hours.forEach(h=>{
    let level = 0.5;
    if(h===18) level = 0.95; // giờ tan tầm - đông nhất
    if(h===17) level = 0.7;
    if(h===19) level = 0.6;
    if(h===20) level = 0.35;
    if(isWeekend(dow)) level = Math.min(1, level+0.15);
    const bar = document.createElement('div');
    bar.className = 'hbar' + (h === currentHour() ? ' now':'');
    bar.style.height = Math.round(level*100)+'%';
    hourBars.appendChild(bar);
    const lbl = document.createElement('span');
    lbl.textContent = h+'h';
    hourLabels.appendChild(lbl);
  });

  const msgList = document.getElementById('msgList');
  msgList.innerHTML = '';
  if(S.messages.length === 0){
    msgList.innerHTML = '<div class="msg-item">Chưa có thông báo nào.</div>';
  } else {
    S.messages.forEach(m=>{
      const d = document.createElement('div');
      d.className = 'msg-item';
      d.innerHTML = `<b>Ngày ${m.day}:</b> ${m.text}`;
      msgList.appendChild(d);
    });
  }
}
function currentHour(){
  return Math.floor(S.serve.timeMinutes/60);
}

// ============================================================
// SERVE SCREEN — vòng lặp bán hàng chính
// ============================================================
function startServeDay(){
  if(totalStock() <= 0) return;
  S.serve.active = true;
  S.serve.stockLeft = {...S.stock};
  S.serve.timeMinutes = 7*60;
  S.serve.endMinutes = 22*60;
  S.serve.queue = [];
  S.serve.current = null;
  S.serve.skewers = [];
  S.serve.revenueToday = 0;
  S.serve.tipsToday = 0;
  S.serve.servedToday = 0;
  S.serve.missedToday = 0;
  S.serve.repDeltaToday = 0;
  S.evictedToday = false;
  buildQueueItems = []; // que đang xâu dở trên tay (chưa đưa lên vỉ)

  spawnNextCustomer(true);
  renderServe();
  show('screen-serve');

  if(loopHandle) clearInterval(loopHandle);
  loopHandle = setInterval(gameTick, 200);
}

function gameTick(){
  if(!S.serve.active) return;

  // thời gian trôi: 15 tiếng (900 phút) game trôi trong khoảng 6 phút thực (360000ms)
  // 200ms thực -> 0.5 phút game (chậm hơn nhiều so với bản cũ 2 phút/tick)
  S.serve.timeMinutes += 0.5;

  if(S.serve.current){
    const c = S.serve.current;
    c.timeLeft -= 0.2;
    if(c.timeLeft <= 0){
      customerLeavesAngry();
    }
  }

  updateSkewerStates();

  if(S.serve.timeMinutes >= S.serve.endMinutes){
    endServeDay();
    return;
  }

  if(!S.evictedToday && S.eventDaysUntilEvict !== null && S.eventDaysUntilEvict <= 0){
    const chancePerTick = 0.0003 * (1 + S.reputation/10);
    if(Math.random() < chancePerTick){
      triggerEviction();
      return;
    }
  }

  renderServeHUD();
}

function renderServe(){
  renderServeHUD();
  renderCustomerStage();
  renderQueue();
  renderSkewerRack();
  renderIngredientTray();
  renderCurrentBuild();
}
function renderServeHUD(){
  const total = Object.values(S.serve.stockLeft).reduce((a,b)=>a+b,0);
  document.getElementById('stockChip').textContent = `Viên còn: ${total}`;
  const h = Math.floor(S.serve.timeMinutes/60);
  const m = Math.floor(S.serve.timeMinutes%60);
  document.getElementById('timeChip').textContent = `🕐 ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// ---------- CUSTOMERS ----------
function customerDemandWeights(){
  return CAT_TYPES.map(t=>({...t}));
}
function generateOrder(type){
  // sinh order gồm các nguyên liệu cụ thể, chỉ dùng nguyên liệu đã mở khóa VÀ còn tồn kho
  const avail = unlockedIngredients().filter(ing => (S.stock[ing.id]||0) > 0 || (S.serve.stockLeft[ing.id]||0) > 0);
  const pool = avail.length > 0 ? avail : unlockedIngredients();
  const itemCount = randInt(type.itemsMin, type.itemsMax);
  const items = [];
  for(let i=0;i<itemCount;i++){
    items.push(pick(pool).id);
  }
  return items;
}
function orderSummaryText(items){
  const counts = {};
  items.forEach(id => counts[id] = (counts[id]||0)+1);
  return Object.entries(counts).map(([id,n])=>{
    const ing = getIngredient(id);
    return `${n} ${ing.name.toLowerCase()}`;
  }).join(', ');
}

function spawnNextCustomer(immediate){
  const doSpawn = ()=>{
    if(!S.serve.active) return;
    if(S.serve.current) return;
    const totalLeft = Object.values(S.serve.stockLeft).reduce((a,b)=>a+b,0);
    const onRack = S.serve.skewers.reduce((a,s)=>a+s.items.length,0);
    if(totalLeft <= 0 && onRack===0 && buildQueueItems.length===0){
      return;
    }
    const type = pickWeighted(customerDemandWeights());
    const items = generateOrder(type);
    const cust = {
      type,
      items,
      timeLeft: type.patienceTime,
      maxTime: type.patienceTime,
      quote: pick(type.quote),
    };
    if(!S.serve.current){
      S.serve.current = cust;
    } else {
      S.serve.queue.push(cust);
    }
    renderCustomerStage();
    renderQueue();
  };
  if(immediate) doSpawn();
  else setTimeout(doSpawn, rand(600,1600));
}

function renderCustomerStage(){
  const stage = document.getElementById('customerStage');
  const c = S.serve.current;
  if(!c){
    stage.innerHTML = `<div style="opacity:.55; font-size:13px; padding-top:30px;">Chưa có khách... đang chờ 🍃</div>`;
    return;
  }
  const pct = Math.max(0, (c.timeLeft / c.maxTime) * 100);
  let barColor = 'var(--broth)';
  if(pct < 50) barColor = 'var(--tea)';
  if(pct < 25) barColor = 'var(--danger)';
  stage.innerHTML = `
    <div class="cat-wrap">
      <div class="cat-emoji">${c.type.icon}</div>
      <div class="cat-name">${c.type.name}</div>
      <div class="patience-bar"><div class="patience-fill" style="width:${pct}%; background:${barColor};"></div></div>
      <div class="order-bubble">"${c.quote}"<br><span class="qty">${orderSummaryText(c.items)}</span></div>
    </div>
  `;
}
function renderQueue(){
  const strip = document.getElementById('queueStrip');
  strip.innerHTML = '';
  S.serve.queue.slice(0,6).forEach((c,i)=>{
    const d = document.createElement('div');
    d.className = 'queue-dot' + (i===0?' next':'');
    d.textContent = c.type.icon;
    strip.appendChild(d);
  });
}

function customerLeavesAngry(){
  const c = S.serve.current;
  S.serve.missedToday++;
  const repLoss = 0.03 * c.type.angerMult;
  S.reputation = Math.max(1, S.reputation - repLoss);
  S.serve.repDeltaToday -= repLoss;
  floaty(`${c.type.icon} bỏ đi! -${repLoss.toFixed(2)}⭐`, '#d13d3d');
  S.serve.current = null;
  advanceQueue();
}
function advanceQueue(){
  if(S.serve.queue.length > 0){
    S.serve.current = S.serve.queue.shift();
  }
  renderCustomerStage();
  renderQueue();
  if(S.serve.queue.length < 2){
    spawnNextCustomer(false);
  }
}

// ---------- XÂU QUE: chọn nguyên liệu từ khay ----------
let buildQueueItems = []; // mảng ingredientId đang xâu dở trên que hiện tại (chưa lên vỉ)

function renderIngredientTray(){
  const tray = document.getElementById('ingredientTray');
  if(!tray) return;
  tray.innerHTML = '';
  unlockedIngredients().forEach(ing=>{
    const left = S.serve.stockLeft[ing.id] || 0;
    const div = document.createElement('div');
    div.className = 'ing-slot' + (left<=0 ? ' empty':'');
    div.innerHTML = `
      <div class="ing-icon" style="background:${ing.color}">${ing.icon}</div>
      <div class="ing-name">${ing.name}</div>
      <div class="ing-count">${left}</div>
    `;
    if(left > 0){
      div.addEventListener('click', ()=>addItemToBuild(ing.id));
    }
    tray.appendChild(div);
  });
}
function addItemToBuild(ingId){
  if((S.serve.stockLeft[ingId]||0) <= 0){
    floaty('Hết nguyên liệu này!', '#d13d3d');
    return;
  }
  if(buildQueueItems.length >= 4){
    floaty('Que đầy rồi (tối đa 4 viên)!', '#e8b84b');
    return;
  }
  S.serve.stockLeft[ingId]--;
  buildQueueItems.push(ingId);
  renderIngredientTray();
  renderCurrentBuild();
  renderServeHUD();
}
function removeLastBuildItem(){
  if(buildQueueItems.length===0) return;
  const id = buildQueueItems.pop();
  S.serve.stockLeft[id] = (S.serve.stockLeft[id]||0) + 1;
  renderIngredientTray();
  renderCurrentBuild();
  renderServeHUD();
}
function renderCurrentBuild(){
  const wrap = document.getElementById('currentBuild');
  if(!wrap) return;
  if(buildQueueItems.length===0){
    wrap.innerHTML = `<div class="build-empty">Chọn nguyên liệu bên dưới để xâu que 🍡</div>`;
    document.getElementById('btnPutOnGrill').disabled = true;
    return;
  }
  const chips = buildQueueItems.map((id,i)=>{
    const ing = getIngredient(id);
    return `<span class="build-chip" style="background:${ing.color}" data-idx="${i}">${ing.icon}</span>`;
  }).join('');
  wrap.innerHTML = `<div class="build-chips">${chips}</div>`;
  document.getElementById('btnPutOnGrill').disabled = false;
}
function putBuildOnGrill(){
  if(buildQueueItems.length===0) return;
  if(S.serve.skewers.length >= 6){
    floaty('Vỉ đầy rồi!', '#e8b84b');
    return;
  }
  const sk = { id: skewerIdCounter++, state:'raw', startedAt: performance.now(), items:[...buildQueueItems] };
  S.serve.skewers.push(sk);
  buildQueueItems = [];
  renderCurrentBuild();
  renderSkewerRack();
}

// ---------- SKEWER MINIGAME (nướng) ----------
function updateSkewerStates(){
  const now = performance.now();
  let changed = false;
  S.serve.skewers.forEach(sk=>{
    const age = now - sk.startedAt;
    let newState = sk.state;
    if(sk.state !== 'taken'){
      if(age < COOK_TIME_PERFECT_MIN) newState = 'raw';
      else if(age < COOK_TIME_PERFECT_MAX) newState = 'perfect';
      else if(age < COOK_TIME_BURNT) newState = 'cooking';
      else newState = 'burnt';
    }
    if(newState !== sk.state){ sk.state = newState; changed = true; }
  });
  if(changed) renderSkewerRack();
  else updateSkewerVisualPct();
}
function updateSkewerVisualPct(){
  S.serve.skewers.forEach(sk=>{
    const el = document.getElementById('sk-'+sk.id);
    if(!el) return;
    const now = performance.now();
    const age = now - sk.startedAt;
    const pctEl = el.querySelector('.pct-badge');
    if(pctEl && sk.state==='raw'){
      pctEl.textContent = Math.min(99,Math.round(age/COOK_TIME_PERFECT_MIN*100))+'%';
    }
  });
}
// Hệ số tối màu theo độ chín (áp cho màu gốc của từng nguyên liệu)
function shadeColor(hex, pct){
  // pct âm = tối hơn (cháy), pct dương = sáng hơn (còn sống/tái)
  const num = parseInt(hex.slice(1),16);
  let r = (num>>16) & 0xff, g = (num>>8) & 0xff, b = num & 0xff;
  if(pct < 0){ r*= (1+pct); g*=(1+pct); b*=(1+pct); }
  else { r = r+(255-r)*pct; g = g+(255-g)*pct; b = b+(255-b)*pct; }
  r=Math.max(0,Math.min(255,Math.round(r))); g=Math.max(0,Math.min(255,Math.round(g))); b=Math.max(0,Math.min(255,Math.round(b)));
  return `rgb(${r},${g},${b})`;
}
function skewerSVG(sk){
  const state = sk.state;
  let shadePct = 0;
  if(state==='raw') shadePct = 0.35;
  else if(state==='perfect') shadePct = -0.08;
  else if(state==='cooking') shadePct = -0.25;
  else if(state==='burnt') shadePct = -0.75;
  else shadePct = -0.08; // taken

  const n = sk.items.length;
  const spacing = 96 / Math.max(n,1);
  const balls = sk.items.map((id,i)=>{
    const ing = getIngredient(id);
    const cy = 20 + spacing*i + spacing/2;
    const color = shadeColor(ing.color, shadePct);
    return `<ellipse cx="22" cy="${cy}" rx="15" ry="${Math.min(13, spacing/2-2)}" fill="${color}"/>
            <ellipse cx="22" cy="${cy}" rx="15" ry="${Math.min(13, spacing/2-2)}" fill="url(#shine)" opacity=".45"/>`;
  }).join('');
  const smokeOpacity = (state==='cooking') ? 0.5 : (state==='burnt' ? 0.8 : 0);
  return `
  <svg viewBox="0 0 44 116" xmlns="http://www.w3.org/2000/svg">
    ${smokeOpacity>0 ? `
    <g opacity="${smokeOpacity}">
      <path d="M14 16 Q10 8 15 2" stroke="#cfcfcf" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <path d="M30 14 Q34 6 28 0" stroke="#cfcfcf" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    </g>` : ''}
    <rect x="20.5" y="14" width="3" height="96" rx="1.5" fill="#c9903f"/>
    <rect x="21.2" y="14" width="1" height="96" fill="#e0b06a" opacity=".6"/>
    <polygon points="20.5,110 23.5,110 22,116" fill="#a8722a"/>
    ${balls}
    <defs>
      <radialGradient id="shine" cx="35%" cy="30%" r="60%">
        <stop offset="0%" stop-color="#fff" stop-opacity=".5"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </radialGradient>
    </defs>
  </svg>`;
}
function renderSkewerRack(){
  const rack = document.getElementById('skewerRack');
  rack.innerHTML = '';
  if(S.serve.skewers.length === 0){
    rack.innerHTML = `<div class="rack-empty-hint">Vỉ đang trống — xâu que rồi bấm "Đặt lên vỉ" để nướng 🔥</div>`;
    return;
  }
  S.serve.skewers.forEach(sk=>{
    const div = document.createElement('div');
    div.className = 'skewer ' + sk.state;
    div.id = 'sk-'+sk.id;
    let pctText = '';
    if(sk.state==='burnt') pctText='CHÁY';
    else if(sk.state==='perfect') pctText='CHÍN TỚI';
    else if(sk.state==='cooking') pctText='QUÁ LỬA';
    else if(sk.state==='taken') pctText='✅';
    else pctText='SỐNG';
    div.innerHTML = `
      <div class="pct-badge">${pctText}</div>
      ${skewerSVG(sk)}
    `;
    div.addEventListener('click', ()=>flipSkewer(sk.id));
    rack.appendChild(div);
  });
}
function flipSkewer(id){
  const sk = S.serve.skewers.find(s=>s.id===id);
  if(!sk || sk.state==='taken') return;
  if(sk.state === 'raw'){
    floaty('Còn sống, chờ chút!', '#c9903f');
    return;
  }
  const now = performance.now();
  const age = now - sk.startedAt;
  if(age < COOK_TIME_PERFECT_MIN) sk.quality = 'raw';
  else if(age < COOK_TIME_PERFECT_MAX) sk.quality = 'perfect';
  else if(age < COOK_TIME_BURNT) sk.quality = 'over';
  else sk.quality = 'burnt';
  sk.state = 'taken';
  sk.ready = true;
  renderSkewerRack();
}

// ---------- GIAO HÀNG: khớp que đã lật với order của khách ----------
function orderMatchesSkewer(orderItems, skewerItems){
  // so khớp đa tập hợp (không quan tâm thứ tự)
  const a = [...orderItems].sort();
  const b = [...skewerItems].sort();
  if(a.length !== b.length) return false;
  for(let i=0;i<a.length;i++) if(a[i]!==b[i]) return false;
  return true;
}
function tryServeCurrentCustomer(){
  const c = S.serve.current;
  if(!c){ floaty('Chưa có khách để giao', '#999'); return; }
  const readySkewers = S.serve.skewers.filter(s=>s.ready);
  const matchIdx = readySkewers.findIndex(s=>orderMatchesSkewer(c.items, s.items));
  if(matchIdx === -1){
    floaty(`Chưa đúng món khách gọi: ${orderSummaryText(c.items)}`, '#e8b84b');
    return;
  }
  const used = readySkewers[matchIdx];
  const idx = S.serve.skewers.findIndex(s=>s.id===used.id);
  if(idx>-1) S.serve.skewers.splice(idx,1);

  const baseRevenue = used.items.reduce((sum,id)=>{
    const ing = getIngredient(id);
    return sum + Math.round(ing.basePrice * SELL_MARGIN);
  }, 0);

  let tip = 0, repDelta = 0;
  if(used.quality === 'perfect'){
    tip = Math.round(baseRevenue * 0.25 * c.type.tipMult);
    repDelta = 0.02;
    floaty(`Hoàn hảo! +${formatMoney(baseRevenue+tip)}`, '#7ed957');
  } else if(used.quality === 'raw' || used.quality === 'over'){
    tip = Math.round(baseRevenue * 0.05);
    repDelta = 0.0;
    floaty(`Tạm ổn +${formatMoney(baseRevenue+tip)}`, '#e8b84b');
  } else {
    tip = 0;
    repDelta = -0.04 * c.type.angerMult;
    floaty(`Khách chê cháy! ${repDelta.toFixed(2)}⭐`, '#d13d3d');
  }

  S.money += baseRevenue + tip;
  S.serve.revenueToday += baseRevenue;
  S.serve.tipsToday += tip;
  S.serve.servedToday++;
  S.reputation = Math.max(1, Math.min(5, S.reputation + repDelta));
  S.serve.repDeltaToday += repDelta;

  S.serve.current = null;
  advanceQueue();
  renderServeHUD();
  renderSkewerRack();
}


function endServeDay(){
  S.serve.active = false;
  if(loopHandle){ clearInterval(loopHandle); loopHandle=null; }
  showDaySummary();
}

// ============================================================
// SỰ KIỆN TRẬT TỰ ĐÔ THỊ
// ============================================================
const EVICT_ITEMS = ['🍢','🔥','🪣','🧊','🧂','🛒','🍶','🥢'];
let evictState = { itemsTotal:0, itemsPacked:0, timeLeft:0 };

function triggerEviction(){
  S.evictedToday = true;
  if(loopHandle){ clearInterval(loopHandle); loopHandle=null; }
  S.serve.active = false;

  const itemCount = randInt(6,8);
  evictState.itemsTotal = itemCount;
  evictState.itemsPacked = 0;
  evictState.timeLeft = randInt(15,30);

  const grid = document.getElementById('evictGrid');
  grid.innerHTML = '';
  for(let i=0;i<itemCount;i++){
    const div = document.createElement('div');
    div.className = 'evict-item';
    div.textContent = pick(EVICT_ITEMS);
    div.addEventListener('click', ()=>packItem(div));
    grid.appendChild(div);
  }
  document.getElementById('evictTimer').textContent = evictState.timeLeft;
  show('screen-evict');

  evictTimerHandle = setInterval(()=>{
    evictState.timeLeft--;
    document.getElementById('evictTimer').textContent = Math.max(0,evictState.timeLeft);
    if(evictState.timeLeft <= 0){
      resolveEviction(false);
    }
  }, 1000);
}
function packItem(el){
  if(el.classList.contains('packed')) return;
  el.classList.add('packed');
  evictState.itemsPacked++;
  if(evictState.itemsPacked >= evictState.itemsTotal){
    resolveEviction(true);
  }
}
function resolveEviction(success){
  if(evictTimerHandle){ clearInterval(evictTimerHandle); evictTimerHandle=null; }
  if(success){
    addMessage('Dọn kịp trước khi trật tự đô thị tới — chỉ mất chút doanh thu.');
    floaty('Dọn kịp! 💨', '#7ed957');
  } else {
    addMessage('Không kịp dọn — bị tịch thu nguyên liệu còn lại và phạt tiền.');
    floaty('Bị tịch thu hết! 😱', '#d13d3d');
    const fine = Math.round(S.money * 0.05);
    S.money = Math.max(0, S.money - fine);
    S.serve.stockLeft = {};
    S.stock = {};
    S.serve.skewers = [];
    buildQueueItems = [];
  }
  S.eventDaysUntilEvict = randInt(3,7);
  setTimeout(()=>showDaySummary(), 900);
}

// ============================================================
// DAY SUMMARY / NEXT DAY
// ============================================================
function showDaySummary(){
  const list = document.getElementById('summaryList');
  const rev = S.serve.revenueToday;
  const tip = S.serve.tipsToday;
  const repD = S.serve.repDeltaToday;
  document.getElementById('summaryEmoji').textContent = S.evictedToday ? '🚨' : (rev>0?'🌙':'😴');
  document.getElementById('summaryTitle').textContent = `Kết thúc ngày ${S.day}`;
  list.innerHTML = `
    <div class="summary-row"><span>Khách phục vụ</span><span>${S.serve.servedToday} 🐱</span></div>
    <div class="summary-row"><span>Khách bỏ đi</span><span class="neg">${S.serve.missedToday}</span></div>
    <div class="summary-row"><span>Doanh thu</span><span class="pos">+${formatMoney(rev)}</span></div>
    <div class="summary-row"><span>Tiền tip</span><span class="pos">+${formatMoney(tip)}</span></div>
    <div class="summary-row"><span>Uy tín thay đổi</span><span class="${repD>=0?'pos':'neg'}">${repD>=0?'+':''}${repD.toFixed(2)}⭐</span></div>
    <div class="summary-row total"><span>Tổng tiền hiện có</span><span>${formatMoney(S.money)}</span></div>
  `;
  // viên chưa nướng thì giữ lại thành tồn kho, cộng ngược viên đang xâu dở trên tay
  buildQueueItems.forEach(id=>{
    S.serve.stockLeft[id] = (S.serve.stockLeft[id]||0) + 1;
  });
  buildQueueItems = [];
  S.stock = {...S.serve.stockLeft};
  show('screen-summary');
}

function goToNextDay(){
  S.day++;
  S.dayOfWeek = (S.dayOfWeek + 1) % 7;
  advanceWeather();
  rollMarketPrice();
  if(S.eventDaysUntilEvict !== null) S.eventDaysUntilEvict--;

  // hao hụt tồn kho theo hạn dùng, riêng từng loại nguyên liệu
  let spoiledMsgs = [];
  for(const id in S.stock){
    if((S.stock[id]||0) <= 0) continue;
    S.stockAgeDay[id] = (S.stockAgeDay[id]||0) + 1;
    const ing = getIngredient(id);
    if(S.stockAgeDay[id] >= ing.shelfLife){
      spoiledMsgs.push(`${S.stock[id]} ${ing.name.toLowerCase()}`);
      S.stock[id] = 0;
      S.stockAgeDay[id] = 0;
    }
  }
  if(spoiledMsgs.length>0){
    addMessage(`Đã hỏng do để quá hạn: ${spoiledMsgs.join(', ')}.`);
  }

  renderStreet();
  show('screen-street');
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener('DOMContentLoaded', init);
