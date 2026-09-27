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

const INGREDIENT = {
  meat:  { name:'Viên chiên (cá viên, bò viên...)', icon:'🍢', basePrice:1200, shelfLife:4, unit:'viên' },
};

const CAT_TYPES = [
  {
    id:'ngoac', name:'Mèo Ngơ Ngác', icon:'🐱',
    patienceTime: 26, patienceLabel:'Kiên nhẫn cao',
    orderMin:1, orderMax:2, tipMult:1.0, angerMult:0.7,
    quote:['Ơ... cho xin xiên?', 'Dạ... vâng ạ...'],
    weight:3,
  },
  {
    id:'nong', name:'Mèo Nóng Tính', icon:'😾',
    patienceTime: 13, patienceLabel:'Kiên nhẫn thấp — tip cao nếu nhanh',
    orderMin:2, orderMax:3, tipMult:1.6, angerMult:1.6,
    quote:['NHANH LÊN!!', 'Đói lắm rồi đó nha!'],
    weight:2,
  },
  {
    id:'khoc', name:'Mèo Hay Khóc', icon:'😿',
    patienceTime: 18, patienceLabel:'Nhạy cảm — sai là mếu ngay',
    orderMin:1, orderMax:2, tipMult:1.2, angerMult:2.0,
    quote:['Huhu đói bụng...', 'Làm đúng cho em nha...'],
    weight:2,
  },
  {
    id:'sang', name:'Mèo Sang Chảnh', icon:'😼',
    patienceTime: 20, patienceLabel:'Khó tính — order nhiều, tip đậm',
    orderMin:3, orderMax:4, tipMult:2.2, angerMult:1.3,
    quote:['Cho tô xiên loại ngon nhất.', 'Phải chín đều nha, đừng có cháy.'],
    weight:1,
  },
];

const SKEWER_PRICE = 8000; // giá bán 1 xiên
const COOK_TIME_PERFECT_MIN = 3200; // ms - bắt đầu vùng "vừa chín"
const COOK_TIME_PERFECT_MAX = 5200; // ms - hết vùng vừa chín
const COOK_TIME_BURNT = 7500; // ms - cháy hẳn

// ---------- STATE ----------
let S = {
  day: 1,
  dayOfWeek: 1, // 0=CN
  money: 500000,
  reputation: 3.0,
  weatherToday: 'sun',
  weatherForecast: [], // mảng 3 ngày tới (index0 = hôm nay)
  stock: 0, // số xiên đã chế biến sẵn để bán (viên thô, tính theo "viên")
  stockBought: 0, // số viên đã mua tối qua, còn hạn
  stockAgeDay: 0,
  eventDaysUntilEvict: null, // random countdown ngày để trigger sự kiện (sau ngày 12)
  evictedToday: false,
  messages: [],
  // ---- serve session ----
  serve: {
    active:false,
    stockLeft:0,
    timeMinutes: 17*60, // 17:00 start
    endMinutes: 21*60,  // 21:00 end
    queue: [], // customers waiting
    current: null, // current customer object
    skewers: [], // {id, state:'raw'|'cooking'|'perfect'|'burnt', startedAt}
    revenueToday:0,
    tipsToday:0,
    servedToday:0,
    missedToday:0,
    repDeltaToday:0,
  },
  prep: {
    pendingBuy: 0,
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
let marketPriceToday = INGREDIENT.meat.basePrice;
function rollMarketPrice(){
  const variance = rand(-0.18, 0.22);
  marketPriceToday = Math.round(INGREDIENT.meat.basePrice * (1+variance) / 100) * 100;
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
  document.getElementById('btnAddSkewer').addEventListener('click', addSkewerToRack);
  document.getElementById('btnServe').addEventListener('click', tryServeCurrentCustomer);
  document.getElementById('btnNextDay').addEventListener('click', goToNextDay);
}

// ============================================================
// STREET SCREEN
// ============================================================
function renderStreet(){
  document.getElementById('moneyLabel').textContent = formatMoney(S.money);
  document.getElementById('repLabel').textContent = S.reputation.toFixed(1);
  document.getElementById('dayLabel').textContent = `Ngày ${S.day} · ${DAYS_VI[S.dayOfWeek]}`;
  const w = WEATHER[S.weatherToday];
  document.getElementById('weatherChip').textContent = `${w.icon} ${w.label}`;
  document.getElementById('prepHint').textContent = S.stock > 0 ? `Còn ${S.stock} viên tồn kho` : 'Chưa có hàng cho ngày mai';
  const canSell = S.stock > 0;
  document.getElementById('btnGoSell').disabled = !canSell;
  document.getElementById('btnGoSell').innerHTML = canSell
    ? `Mở bán hôm nay 🍢 <span class="sub">Còn ${S.stock} viên</span>`
    : `Chưa có hàng để bán <span class="sub">Nhập hàng trước đã</span>`;
}

// ============================================================
// PREP SCREEN — nhập hàng
// ============================================================
function openPrep(){
  S.prep.pendingBuy = 0;
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

  // market card
  const marketList = document.getElementById('marketList');
  const priceDiff = marketPriceToday - INGREDIENT.meat.basePrice;
  const priceClass = priceDiff > 50 ? 'up' : (priceDiff < -50 ? 'down' : '');
  const priceArrow = priceDiff > 50 ? '▲' : (priceDiff < -50 ? '▼' : '—');
  marketList.innerHTML = `
    <div class="market-card">
      <div class="market-title">
        <div class="name">${INGREDIENT.meat.icon} ${INGREDIENT.meat.name}</div>
        <div class="price ${priceClass}">${priceArrow} ${formatMoney(marketPriceToday)}/viên</div>
      </div>
      <div class="stepper">
        <button id="stepDown">−</button>
        <div class="val" id="stepVal">${S.prep.pendingBuy}</div>
        <button id="stepUp">+</button>
      </div>
      <div class="stock-note">Hạn dùng ~${INGREDIENT.meat.shelfLife} ngày. Hiện tồn kho: ${S.stock} viên${S.stockAgeDay>0?` (đã để ${S.stockAgeDay} ngày)`:''}.</div>
    </div>
  `;
  document.getElementById('stepDown').addEventListener('click', ()=>{
    S.prep.pendingBuy = Math.max(0, S.prep.pendingBuy - 5);
    updatePrepFooter();
  });
  document.getElementById('stepUp').addEventListener('click', ()=>{
    const maxAfford = Math.floor(S.money / marketPriceToday);
    S.prep.pendingBuy = Math.min(maxAfford, S.prep.pendingBuy + 5);
    updatePrepFooter();
  });
  updatePrepFooter();
}
function updatePrepFooter(){
  document.getElementById('stepVal').textContent = S.prep.pendingBuy;
  const cost = S.prep.pendingBuy * marketPriceToday;
  document.getElementById('prepCost').textContent = formatMoney(cost);
  document.getElementById('btnConfirmPrep').disabled = S.prep.pendingBuy === 0 || cost > S.money;
}
function confirmPrep(){
  const cost = S.prep.pendingBuy * marketPriceToday;
  if(cost > S.money) return;
  S.money -= cost;
  S.stock += S.prep.pendingBuy;
  S.stockAgeDay = 0;
  addMessage(`Đã nhập ${S.prep.pendingBuy} viên hết ${formatMoney(cost)}.`);
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
  if(S.stock <= 0) return;
  S.serve.active = true;
  S.serve.stockLeft = S.stock;
  S.serve.timeMinutes = 17*60;
  S.serve.endMinutes = 21*60;
  S.serve.queue = [];
  S.serve.current = null;
  S.serve.skewers = [];
  S.serve.revenueToday = 0;
  S.serve.tipsToday = 0;
  S.serve.servedToday = 0;
  S.serve.missedToday = 0;
  S.serve.repDeltaToday = 0;
  S.evictedToday = false;

  spawnNextCustomer(true);
  renderServe();
  show('screen-serve');

  if(loopHandle) clearInterval(loopHandle);
  loopHandle = setInterval(gameTick, 200); // tick 200ms = 1 phút giờ trong game (nhanh)
}

function gameTick(){
  if(!S.serve.active) return;

  // thời gian trôi: 200ms thực = 2 phút giờ game -> 1 ca (4h = 240 phút) mất 24s thực
  S.serve.timeMinutes += 2;

  // giảm kiên nhẫn khách hiện tại
  if(S.serve.current){
    const c = S.serve.current;
    c.timeLeft -= 0.2;
    if(c.timeLeft <= 0){
      customerLeavesAngry();
    }
  }

  // cập nhật trạng thái nướng của các xiên
  updateSkewerStates();

  // check hết giờ
  if(S.serve.timeMinutes >= S.serve.endMinutes){
    endServeDay();
    return;
  }

  // check sự kiện trật tự đô thị (chỉ sau mốc ngày cho phép)
  if(!S.evictedToday && S.eventDaysUntilEvict !== null && S.eventDaysUntilEvict <= 0){
    // random nhỏ mỗi tick để bất ngờ, xác suất tăng theo reputation (bán chạy dễ bị để ý)
    const chancePerTick = 0.0009 * (1 + S.reputation/10);
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
}
function renderServeHUD(){
  document.getElementById('stockChip').textContent = `Viên còn: ${S.serve.stockLeft}`;
  const h = Math.floor(S.serve.timeMinutes/60);
  const m = Math.floor(S.serve.timeMinutes%60);
  document.getElementById('timeChip').textContent = `🕐 ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

// ---------- CUSTOMERS ----------
function customerDemandWeights(){
  // đơn giản: theo thời tiết + giờ, weight của từng loại mèo (giai đoạn 1 chỉ 1 khu vực: gần chợ)
  return CAT_TYPES.map(t=>({...t}));
}

function spawnNextCustomer(immediate){
  const doSpawn = ()=>{
    if(!S.serve.active) return;
    if(S.serve.current) return;
    if(S.serve.stockLeft <= 0 && S.serve.skewers.length===0){
      // hết hàng hoàn toàn -> không spawn thêm, chờ hết giờ
      return;
    }
    const type = pickWeighted(customerDemandWeights());
    const qty = randInt(type.orderMin, type.orderMax);
    const cust = {
      type,
      qty,
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
  else setTimeout(doSpawn, rand(400,1200));
}

function renderCustomerStage(){
  const stage = document.getElementById('customerStage');
  const c = S.serve.current;
  if(!c){
    stage.innerHTML = `<div style="opacity:.5; font-size:13px; padding-top:30px;">Chưa có khách... đang chờ 🍃</div>`;
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
      <div class="order-bubble">"${c.quote}" — <span class="qty">${c.qty} xiên chín tới</span></div>
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
  // spawn thêm nếu queue mỏng
  if(S.serve.queue.length < 2){
    spawnNextCustomer(false);
  }
}

// ---------- SKEWER MINIGAME ----------
function addSkewerToRack(){
  if(!S.serve.active) return;
  if(S.serve.stockLeft <= 0){
    floaty('Hết nguyên liệu rồi!', '#d13d3d');
    return;
  }
  if(S.serve.skewers.length >= 8){
    floaty('Vỉ đầy rồi!', '#e8b84b');
    return;
  }
  S.serve.stockLeft--;
  const sk = { id: skewerIdCounter++, state:'raw', startedAt: performance.now() };
  S.serve.skewers.push(sk);
  renderSkewerRack();
  renderServeHUD();
}
function updateSkewerStates(){
  const now = performance.now();
  let changed = false;
  S.serve.skewers.forEach(sk=>{
    const age = now - sk.startedAt;
    let newState = sk.state;
    if(sk.state !== 'taken'){
      if(age < COOK_TIME_PERFECT_MIN) newState = 'raw';
      else if(age < COOK_TIME_PERFECT_MAX) newState = 'perfect';
      else if(age < COOK_TIME_BURNT) newState = 'cooking'; // quá chín, sắp cháy - dùng màu cam
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
    const pctEl = el.querySelector('.pct');
    if(pctEl){
      if(sk.state==='burnt') pctEl.textContent = 'CHÁY';
      else if(sk.state==='perfect') pctEl.textContent = 'CHÍN TỚI';
      else pctEl.textContent = Math.min(100,Math.round(age/COOK_TIME_PERFECT_MIN*100))+'%';
    }
  });
}
function renderSkewerRack(){
  const rack = document.getElementById('skewerRack');
  rack.innerHTML = '';
  S.serve.skewers.forEach(sk=>{
    const div = document.createElement('div');
    div.className = 'skewer ' + sk.state;
    div.id = 'sk-'+sk.id;
    let pctText = '';
    if(sk.state==='burnt') pctText='CHÁY';
    else if(sk.state==='perfect') pctText='CHÍN TỚI';
    else if(sk.state==='cooking') pctText='QUÁ LỬA';
    else pctText='SỐNG';
    div.innerHTML = `
      <div class="heat-ring"></div>
      <div class="stick">🍢</div>
      <div class="pct">${pctText}</div>
    `;
    div.addEventListener('click', ()=>flipSkewer(sk.id));
    rack.appendChild(div);
  });
}
function flipSkewer(id){
  // "lật" xiên = lấy ra khỏi vỉ ngay tại thời điểm bấm, đóng băng trạng thái để giao khách
  const sk = S.serve.skewers.find(s=>s.id===id);
  if(!sk || sk.state==='taken') return;
  if(sk.state === 'raw'){
    floaty('Còn sống, chờ chút!', '#c9903f');
    return;
  }
  sk.state = 'taken';
  sk.finalQuality = sk.readyQuality || sk.state;
  // lưu chất lượng thật tại thời điểm lật
  const now = performance.now();
  const age = now - sk.startedAt;
  if(age < COOK_TIME_PERFECT_MIN) sk.quality = 'raw';
  else if(age < COOK_TIME_PERFECT_MAX) sk.quality = 'perfect';
  else if(age < COOK_TIME_BURNT) sk.quality = 'over';
  else sk.quality = 'burnt';
  sk.ready = true;
  renderSkewerRack();
}

function tryServeCurrentCustomer(){
  const c = S.serve.current;
  if(!c){ floaty('Chưa có khách để giao', '#999'); return; }
  const readySkewers = S.serve.skewers.filter(s=>s.ready);
  if(readySkewers.length < c.qty){
    floaty(`Cần ${c.qty} xiên đã lật, mới có ${readySkewers.length}`, '#e8b84b');
    return;
  }
  // lấy đúng số lượng xiên đã lật (ưu tiên xiên cũ trước)
  const used = readySkewers.slice(0, c.qty);
  const perfectCount = used.filter(s=>s.quality==='perfect').length;
  const burntCount = used.filter(s=>s.quality==='burnt').length;
  const rawOrOverCount = used.length - perfectCount - burntCount;

  const qualityScore = (perfectCount*1 + rawOrOverCount*0.4 + burntCount*0) / used.length;

  // xóa xiên đã dùng khỏi vỉ
  used.forEach(u=>{
    const idx = S.serve.skewers.findIndex(s=>s.id===u.id);
    if(idx>-1) S.serve.skewers.splice(idx,1);
  });

  const baseRevenue = c.qty * SKEWER_PRICE;
  let tip = 0;
  let repDelta = 0;
  let msg = '';

  if(qualityScore >= 0.9){
    tip = Math.round(baseRevenue * 0.25 * c.type.tipMult);
    repDelta = 0.02;
    msg = 'perfect';
    floaty(`Hoàn hảo! +${formatMoney(baseRevenue+tip)}`, '#7ed957');
  } else if(qualityScore >= 0.5){
    tip = Math.round(baseRevenue * 0.05);
    repDelta = 0.0;
    msg = 'ok';
    floaty(`Tạm ổn +${formatMoney(baseRevenue+tip)}`, '#e8b84b');
  } else {
    tip = 0;
    repDelta = -0.04 * c.type.angerMult;
    msg = 'bad';
    floaty(`Khách chê! ${repDelta.toFixed(2)}⭐`, '#d13d3d');
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
  const remainingSkewersValue = S.serve.stockLeft * (INGREDIENT.meat.basePrice*1.5);
  if(success){
    addMessage('Dọn kịp trước khi trật tự đô thị tới — chỉ mất chút doanh thu.');
    floaty('Dọn kịp! 💨', '#7ed957');
    // mất 1 phần doanh thu ngày đó (dừng bán sớm), giữ nguyên liệu
  } else {
    addMessage('Không kịp dọn — bị tịch thu nguyên liệu còn lại và phạt tiền.');
    floaty('Bị tịch thu hết! 😱', '#d13d3d');
    const fine = Math.round(S.money * 0.05);
    S.money = Math.max(0, S.money - fine);
    S.serve.stockLeft = 0;
    S.stock = 0;
    S.serve.skewers = [];
  }
  // set lại mốc ngẫu nhiên cho lần trật tự đô thị tiếp theo
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
  // xiên còn sống trên vỉ bị bỏ phí, viên chưa nướng thì giữ lại thành tồn kho
  S.stock = S.serve.stockLeft;
  show('screen-summary');
}

function goToNextDay(){
  S.day++;
  S.dayOfWeek = (S.dayOfWeek + 1) % 7;
  advanceWeather();
  rollMarketPrice();
  if(S.eventDaysUntilEvict !== null) S.eventDaysUntilEvict--;

  // hao hụt tồn kho theo hạn dùng
  S.stockAgeDay++;
  if(S.stockAgeDay >= INGREDIENT.meat.shelfLife){
    if(S.stock > 0){
      addMessage(`${S.stock} viên đã hỏng do để quá hạn!`);
      S.stock = 0;
    }
    S.stockAgeDay = 0;
  }

  renderStreet();
  show('screen-street');
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener('DOMContentLoaded', init);
