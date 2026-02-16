/* Budget Planner — LocalStorage month/year buckets + calendar + compare */

const STORAGE_KEY = "bp_v1_data";

const monthNames = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const CATEGORY_COLORS = {
  "Rent": "#66a7ff",
  "Mortgage": "#ff4fb8",
  "HOA": "#9b8cff",
  "Home Insurance": "#4de1c1",
  "Property Tax": "#ffd166",
  "Maintenance/Repairs": "#ff6b7d",

  "Car Payment": "#9b8cff",
  "Auto Insurance": "#4de1c1",
  "Gas": "#ffd166",
  "Parking/Tolls": "#ff6b7d",
  "Car Maintenance": "#66a7ff",
  "Public Transit": "#4de1c1",
  "Rideshare": "#ff4fb8",

  "Electricity": "#ffd166",
  "Water": "#66a7ff",
  "Gas Utility": "#ff6b7d",
  "Trash": "#9b8cff",
  "Phone": "#4de1c1",
  "Internet": "#ff4fb8",

  "Groceries": "#4de1c1",
  "Dining": "#ff4fb8",
  "Coffee/Snacks": "#ffd166",

  "Subscriptions": "#66a7ff",
  "Movies/Entertainment": "#ff4fb8",
  "Shopping": "#9b8cff",
  "Gym/Fitness": "#4de1c1",
  "Beauty": "#ffd166",
  "Hobbies": "#66a7ff",

  "Health Insurance": "#4de1c1",
  "Medical": "#ff6b7d",
  "Debt Payments": "#ff6b7d",
  "Investments": "#66a7ff",
  "Savings": "#4de1c1",

  "Gifts/Donations": "#ffd166",
  "Travel": "#9b8cff",
  "Other": "#66a7ff",
};

function catColor(cat){
  return CATEGORY_COLORS[cat] || "#66a7ff";
}

const $ = (id) => document.getElementById(id);

function currency(n){
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { style:"currency", currency:"USD" });
}

function pad2(n){ return String(n).padStart(2,"0"); }

function ymd(date){
  const d = new Date(date);
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}

function safeParseJSON(text){
  try { return JSON.parse(text); } catch { return null; }
}

function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  const obj = raw ? safeParseJSON(raw) : null;
  if (obj && typeof obj === "object") return obj;
  return { transactions: [] }; // {id, date, category, amount, note}
}

function saveData(data){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function monthKey(year, monthIndex){
  return `${year}-${pad2(monthIndex+1)}`; // YYYY-MM
}

function getMonthTx(data, year, monthIndex){
  const key = monthKey(year, monthIndex);
  return data.transactions.filter(t => t.date.slice(0,7) === key);
}

function sumTx(list){
  return list.reduce((a,t) => a + Number(t.amount || 0), 0);
}

function groupByCategory(list){
  const map = new Map();
  for (const t of list){
    const k = t.category || "Other";
    map.set(k, (map.get(k) || 0) + Number(t.amount || 0));
  }
  return [...map.entries()].sort((a,b)=>b[1]-a[1]);
}

function daysInMonth(year, monthIndex){
  return new Date(year, monthIndex+1, 0).getDate();
}

function firstDayDow(year, monthIndex){
  return new Date(year, monthIndex, 1).getDay(); // 0=Sun
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* State */
let data = loadData();
let activeYear = new Date().getFullYear();
let activeMonth = new Date().getMonth();
let activeDayFilter = null; // "YYYY-MM-DD" or null

/* Elements */
const yearSelect = $("yearSelect");
const monthSelect = $("monthSelect");
const compareMonthSelect = $("compareMonthSelect");
const calendarGrid = $("calendarGrid");
const calendarLabel = $("calendarLabel");
const activeFilterChip = $("activeFilterChip");
const clearDayFilterBtn = $("clearDayFilterBtn");

const txForm = $("txForm");
const txDate = $("txDate");
const txCategory = $("txCategory");
const txAmount = $("txAmount");
const txNote = $("txNote");

const statTotal = $("statTotal");
const statCount = $("statCount");
const statAvg = $("statAvg");

const categoryBars = $("categoryBars");
const monthStatsLabel = $("monthStatsLabel");

const txList = $("txList");
const txListLabel = $("txListLabel");
const searchInput = $("searchInput");
const sortSelect = $("sortSelect");

const todayBtn = $("todayBtn");
const exportBtn = $("exportBtn");
const importInput = $("importInput");
const wipeBtn = $("wipeBtn");

const compareThis = $("compareThis");
const compareOther = $("compareOther");
const compareDelta = $("compareDelta");

/* Setup selectors */
function buildYearOptions(){
  const nowY = new Date().getFullYear();
  const years = [];
  for (let y = nowY - 3; y <= nowY + 1; y++) years.push(y);
  yearSelect.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join("");
}

function buildMonthOptions(){
  monthSelect.innerHTML = monthNames.map((m,i)=>`<option value="${i}">${m}</option>`).join("");
}

function buildCompareOptions(){
  compareMonthSelect.innerHTML = monthNames
    .map((m,i)=>`<option value="${i}">${m} ${activeYear}</option>`)
    .join("");
}

function syncSelectors(){
  yearSelect.value = String(activeYear);
  monthSelect.value = String(activeMonth);
  buildCompareOptions();
  const prev = (activeMonth + 11) % 12;
  compareMonthSelect.value = String(prev);
}

function setDefaultDateInput(){
  const today = new Date();
  const isActiveNow = (today.getFullYear() === activeYear && today.getMonth() === activeMonth);
  const d = isActiveNow ? today : new Date(activeYear, activeMonth, 1);
  txDate.value = ymd(d);
}

/* Calendar rendering */
function renderCalendar(){
  const dim = daysInMonth(activeYear, activeMonth);
  const startDow = firstDayDow(activeYear, activeMonth);

  calendarLabel.textContent = `${monthNames[activeMonth]} ${activeYear}`;
  calendarGrid.innerHTML = "";

  const monthTx = getMonthTx(data, activeYear, activeMonth);
  const perDay = new Map();
  for (const t of monthTx){
    perDay.set(t.date, (perDay.get(t.date) || 0) + Number(t.amount || 0));
  }

  for (let i=0; i<startDow; i++){
    const cell = document.createElement("div");
    cell.className = "day off";
    calendarGrid.appendChild(cell);
  }

  for (let day=1; day<=dim; day++){
    const dateStr = `${activeYear}-${pad2(activeMonth+1)}-${pad2(day)}`;
    const sum = perDay.get(dateStr) || 0;

    const cell = document.createElement("div");
    cell.className = "day";
    if (activeDayFilter === dateStr) cell.classList.add("active");

    cell.innerHTML = `
      <div class="num">${day}</div>
      ${sum > 0 ? `<div class="sum">${currency(sum)}</div><div class="dot"></div>` : `<div class="sum" style="opacity:.45">—</div>`}
    `;

    cell.addEventListener("click", ()=>{
      activeDayFilter = (activeDayFilter === dateStr) ? null : dateStr;
      updateFilterChip();
      renderAll();
    });

    calendarGrid.appendChild(cell);
  }
}

function updateFilterChip(){
  activeFilterChip.textContent = activeDayFilter ? `Filtered: ${activeDayFilter}` : "All days";
}

/* Summary + list */
function getFilteredTx(){
  const monthTx = getMonthTx(data, activeYear, activeMonth);
  let list = monthTx;

  if (activeDayFilter){
    list = list.filter(t => t.date === activeDayFilter);
  }

  const q = (searchInput.value || "").trim().toLowerCase();
  if (q){
    list = list.filter(t =>
      (t.category || "").toLowerCase().includes(q) ||
      (t.note || "").toLowerCase().includes(q)
    );
  }

  const sort = sortSelect.value;
  list = [...list];
  if (sort === "dateDesc") list.sort((a,b)=> b.date.localeCompare(a.date));
  if (sort === "dateAsc") list.sort((a,b)=> a.date.localeCompare(b.date));
  if (sort === "amountDesc") list.sort((a,b)=> Number(b.amount)-Number(a.amount));
  if (sort === "amountAsc") list.sort((a,b)=> Number(a.amount)-Number(b.amount));

  return list;
}

function renderSummary(){
  const monthTx = getMonthTx(data, activeYear, activeMonth);
  const total = sumTx(monthTx);
  const count = monthTx.length;
  const dim = daysInMonth(activeYear, activeMonth);
  const avg = total / dim;

  monthStatsLabel.textContent = `${monthNames[activeMonth]} ${activeYear}`;
  statTotal.textContent = currency(total);
  statCount.textContent = String(count);
  statAvg.textContent = currency(avg);

  const groups = groupByCategory(monthTx);
  const max = groups.length ? groups[0][1] : 0;

  categoryBars.innerHTML = groups.length ? "" : `<div class="muted">No data yet for this month.</div>`;

  for (const [cat, val] of groups){
    const pct = max ? (val / max) * 100 : 0;
    const c = catColor(cat);

    const el = document.createElement("div");
    el.className = "bar";
    el.innerHTML = `
      <div class="bar-top">
        <div><strong>${cat}</strong></div>
        <div>${currency(val)}</div>
      </div>
      <div class="bar-fill" style="width:${pct.toFixed(1)}%; --c:${c}"></div>
    `;
    categoryBars.appendChild(el);
  }
}

function renderTransactions(){
  const list = getFilteredTx();

  const monthTx = getMonthTx(data, activeYear, activeMonth);
  const monthTotal = sumTx(monthTx);

  txListLabel.textContent = activeDayFilter
    ? `${list.length} tx • ${activeDayFilter}`
    : `${monthTx.length} tx • ${currency(monthTotal)}`;

  txList.innerHTML = "";
  if (!list.length){
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No transactions match your filters.";
    txList.appendChild(empty);
    return;
  }

  for (const t of list){
    const row = document.createElement("div");
    row.className = "tx";

    const c = catColor(t.category || "Other");
    row.innerHTML = `
      <div class="tx-left">
        <div class="tx-title">
          <span class="badge" style="--c:${c}">
            <span class="badge-dot" style="background:${c}; box-shadow: 0 0 0 6px rgba(255,255,255,0.08), 0 0 18px rgba(0,0,0,0.25)"></span>
            ${escapeHtml(t.category || "Other")}
          </span>
        </div>
        <div class="tx-sub">${t.date}${t.note ? " • " + escapeHtml(t.note) : ""}</div>
      </div>
      <div class="tx-right">
        <div class="amount">${currency(t.amount)}</div>
        <button class="del" title="Delete">Delete</button>
      </div>
    `;

    row.querySelector(".del").addEventListener("click", ()=>{
      data.transactions = data.transactions.filter(x => x.id !== t.id);
      saveData(data);
      renderAll();
    });

    txList.appendChild(row);
  }
}

/* Compare months */
function renderCompare(){
  const monthTx = getMonthTx(data, activeYear, activeMonth);
  const totalThis = sumTx(monthTx);

  const otherMonth = Number(compareMonthSelect.value);
  const otherTx = getMonthTx(data, activeYear, otherMonth);
  const totalOther = sumTx(otherTx);

  compareThis.textContent = currency(totalThis);
  compareOther.textContent = currency(totalOther);

  const delta = totalThis - totalOther;
  compareDelta.classList.remove("pos","neg");

  if (delta === 0){
    compareDelta.textContent = "Same spending as compared month.";
  } else if (delta > 0){
    compareDelta.classList.add("pos");
    compareDelta.textContent = `${currency(delta)} more than ${monthNames[otherMonth]}`;
  } else {
    compareDelta.classList.add("neg");
    compareDelta.textContent = `${currency(Math.abs(delta))} less than ${monthNames[otherMonth]}`;
  }
}

/* Main render */
function renderAll(){
  setDefaultDateInput();
  updateFilterChip();
  renderCalendar();
  renderSummary();
  renderCompare();
  renderTransactions();
}

/* Events */
yearSelect.addEventListener("change", ()=>{
  activeYear = Number(yearSelect.value);
  activeDayFilter = null;
  buildCompareOptions();
  renderAll();
});

monthSelect.addEventListener("change", ()=>{
  activeMonth = Number(monthSelect.value);
  activeDayFilter = null;
  buildCompareOptions();
  renderAll();
});

compareMonthSelect.addEventListener("change", renderCompare);

clearDayFilterBtn.addEventListener("click", ()=>{
  activeDayFilter = null;
  renderAll();
});

searchInput.addEventListener("input", renderTransactions);
sortSelect.addEventListener("change", renderTransactions);

todayBtn.addEventListener("click", ()=>{
  const d = new Date();
  activeYear = d.getFullYear();
  activeMonth = d.getMonth();
  activeDayFilter = null;
  syncSelectors();
  renderAll();
});

txForm.addEventListener("submit", (e)=>{
  e.preventDefault();

  const date = txDate.value;
  const category = txCategory.value;
  const amount = Number(txAmount.value);
  const note = (txNote.value || "").trim();

  if (!date || !category || !Number.isFinite(amount) || amount <= 0){
    alert("Please enter a valid date, category, and amount.");
    return;
  }

  data.transactions.push({
    id: uid(),
    date,
    category,
    amount: Math.round(amount * 100) / 100,
    note
  });

  saveData(data);

  const [y,m] = date.split("-").map(Number);
  if (y !== activeYear || (m-1) !== activeMonth){
    activeYear = y;
    activeMonth = m-1;
    activeDayFilter = null;
    syncSelectors();
  }

  txAmount.value = "";
  txNote.value = "";
  renderAll();
});

exportBtn.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `budget-planner-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

importInput.addEventListener("change", async ()=>{
  const file = importInput.files?.[0];
  if (!file) return;

  const text = await file.text();
  const obj = safeParseJSON(text);
  if (!obj || !obj.transactions || !Array.isArray(obj.transactions)){
    alert("That file doesn't look like a valid backup.");
    importInput.value = "";
    return;
  }

  obj.transactions = obj.transactions
    .filter(t => t && typeof t === "object")
    .map(t => ({
      id: t.id || uid(),
      date: String(t.date || "").slice(0,10),
      category: String(t.category || "Other"),
      amount: Number(t.amount || 0),
      note: String(t.note || "")
    }))
    .filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && Number.isFinite(t.amount) && t.amount >= 0);

  data = obj;
  saveData(data);
  renderAll();
  importInput.value = "";
});

wipeBtn.addEventListener("click", ()=>{
  const ok = confirm("Reset will delete all saved data from this browser. Continue?");
  if (!ok) return;
  data = { transactions: [] };
  saveData(data);
  activeDayFilter = null;
  renderAll();
});

/* Init */
(function init(){
  buildYearOptions();
  buildMonthOptions();

  const now = new Date();
  activeYear = now.getFullYear();
  activeMonth = now.getMonth();

  syncSelectors();
  setDefaultDateInput();
  updateFilterChip();
  renderAll();
})();
