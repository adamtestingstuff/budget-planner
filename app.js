/* Budget Planner — LocalStorage + month/year + buckets */

const STORAGE_KEY = "bp_v2_data_buckets";

const monthNames = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const BUCKET_COLORS = {
  "Housing": "#ff4fb8",
  "Transportation": "#ffd166",
  "Bills": "#66a7ff",
  "Food": "#4de1c1",
  "Lifestyle": "#9b8cff",
  "Health & Finance": "#ff6b7d",
  "Other": "#66a7ff",
};

function bucketColor(b){
  return BUCKET_COLORS[b] || "#66a7ff";
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

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

/* ---- Data ----
We store entries as:
{ id, date: "YYYY-MM-DD", bucket: "Housing", amount: number, note: string }
*/
function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  const obj = raw ? safeParseJSON(raw) : null;
  if (obj && typeof obj === "object" && Array.isArray(obj.entries)) return obj;

  // Migration: if user previously used bp_v1_data, convert best-effort
  const oldRaw = localStorage.getItem("bp_v1_data");
  const oldObj = oldRaw ? safeParseJSON(oldRaw) : null;

  if (oldObj && Array.isArray(oldObj.transactions)){
    const migrated = {
      entries: oldObj.transactions
        .filter(t => t && typeof t === "object")
        .map(t => ({
          id: t.id || uid(),
          date: String(t.date || "").slice(0,10),
          bucket: guessBucketFromOldCategory(String(t.category || "Other")),
          amount: Number(t.amount || 0),
          note: String(t.note || t.category || "")
        }))
        .filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number.isFinite(e.amount) && e.amount >= 0)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  }

  return { entries: [] };
}

function saveData(data){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function guessBucketFromOldCategory(cat){
  const c = (cat || "").toLowerCase();

  if (["rent","mortgage","hoa","home insurance","property tax","maintenance/repairs"].some(x => c.includes(x))) return "Housing";
  if (["car","auto insurance","gas","parking","toll","transit","rideshare"].some(x => c.includes(x))) return "Transportation";
  if (["electric","water","utility","trash","phone","internet"].some(x => c.includes(x))) return "Bills";
  if (["grocery","dining","coffee","snack","food"].some(x => c.includes(x))) return "Food";
  if (["subscription","movie","entertainment","shopping","gym","beauty","hobbies"].some(x => c.includes(x))) return "Lifestyle";
  if (["health","medical","debt","investment","savings","insurance"].some(x => c.includes(x))) return "Health & Finance";

  return "Other";
}

function monthKey(year, monthIndex){
  return `${year}-${pad2(monthIndex+1)}`; // YYYY-MM
}

function getMonthEntries(data, year, monthIndex){
  const key = monthKey(year, monthIndex);
  return data.entries.filter(e => e.date.slice(0,7) === key);
}

function sumList(list){
  return list.reduce((a,x) => a + Number(x.amount || 0), 0);
}

function groupByBucket(list){
  const map = new Map();
  for (const e of list){
    const k = e.bucket || "Other";
    map.set(k, (map.get(k) || 0) + Number(e.amount || 0));
  }
  return [...map.entries()].sort((a,b)=>b[1]-a[1]);
}

function daysInMonth(year, monthIndex){
  return new Date(year, monthIndex+1, 0).getDate();
}

function firstDayDow(year, monthIndex){
  return new Date(year, monthIndex, 1).getDay();
}

/* ---- State ---- */
let data = loadData();
let activeYear = new Date().getFullYear();
let activeMonth = new Date().getMonth();
let activeDayFilter = null;

/* ---- Elements ---- */
const yearSelect = $("yearSelect");
const monthSelect = $("monthSelect");
const compareMonthSelect = $("compareMonthSelect");
const calendarGrid = $("calendarGrid");
const calendarLabel = $("calendarLabel");
const activeFilterChip = $("activeFilterChip");
const clearDayFilterBtn = $("clearDayFilterBtn");

const txForm = $("txForm");
const txDate = $("txDate");
const txBucket = $("txBucket");
// Bucket button selector (replaces dropdown)
const bucketGrid = $("bucketGrid");
if (bucketGrid) {
  bucketGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".bucket-btn");
    if (!btn) return;

    // set hidden input value
    txBucket.value = btn.dataset.bucket;

    // update active styling
    bucketGrid.querySelectorAll(".bucket-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
}
const txAmount = $("txAmount");
const txNote = $("txNote");


const statTotal = $("statTotal");
const statCount = $("statCount");
const statAvg = $("statAvg");

const bucketBars = $("bucketBars");
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

/* ---- Selects ---- */
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

/* ---- Calendar ---- */
function renderCalendar(){
  const dim = daysInMonth(activeYear, activeMonth);
  const startDow = firstDayDow(activeYear, activeMonth);

  calendarLabel.textContent = `${monthNames[activeMonth]} ${activeYear}`;
  calendarGrid.innerHTML = "";

  const monthEntries = getMonthEntries(data, activeYear, activeMonth);
  const perDay = new Map();
  for (const e of monthEntries){
    perDay.set(e.date, (perDay.get(e.date) || 0) + Number(e.amount || 0));
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

/* ---- Filters ---- */
function getFilteredEntries(){
  const monthEntries = getMonthEntries(data, activeYear, activeMonth);
  let list = monthEntries;

  if (activeDayFilter){
    list = list.filter(e => e.date === activeDayFilter);
  }

  const q = (searchInput.value || "").trim().toLowerCase();
  if (q){
    list = list.filter(e =>
      (e.bucket || "").toLowerCase().includes(q) ||
      (e.note || "").toLowerCase().includes(q)
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

/* ---- Summary ---- */
function renderSummary(){
  const monthEntries = getMonthEntries(data, activeYear, activeMonth);
  const total = sumList(monthEntries);
  const count = monthEntries.length;
  const dim = daysInMonth(activeYear, activeMonth);
  const avg = total / dim;

  monthStatsLabel.textContent = `${monthNames[activeMonth]} ${activeYear}`;
  statTotal.textContent = currency(total);
  statCount.textContent = String(count);
  statAvg.textContent = currency(avg);

  const groups = groupByBucket(monthEntries);
  const max = groups.length ? groups[0][1] : 0;

  bucketBars.innerHTML = groups.length ? "" : `<div class="muted">No data yet for this month.</div>`;

  for (const [bucket, val] of groups){
    const pct = max ? (val / max) * 100 : 0;
    const c = bucketColor(bucket);

    const el = document.createElement("div");
    el.className = "bar";
    el.innerHTML = `
      <div class="bar-top">
        <div><strong>${escapeHtml(bucket)}</strong></div>
        <div>${currency(val)}</div>
      </div>
      <div class="bar-fill" style="width:${pct.toFixed(1)}%; --c:${c}"></div>
    `;
    bucketBars.appendChild(el);
  }
}

/* ---- Entries list ---- */
function renderEntries(){
  const list = getFilteredEntries();

  const monthEntries = getMonthEntries(data, activeYear, activeMonth);
  const monthTotal = sumList(monthEntries);

  txListLabel.textContent = activeDayFilter
    ? `${list.length} entries • ${activeDayFilter}`
    : `${monthEntries.length} entries • ${currency(monthTotal)}`;

  txList.innerHTML = "";
  if (!list.length){
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No entries match your filters.";
    txList.appendChild(empty);
    return;
  }

  for (const e of list){
    const row = document.createElement("div");
    row.className = "tx";

    const c = bucketColor(e.bucket || "Other");
    row.innerHTML = `
      <div class="tx-left">
        <div class="tx-title">
          <span class="badge" style="--c:${c}">
            <span class="badge-dot" style="background:${c}"></span>
            ${escapeHtml(e.bucket || "Other")}
          </span>
        </div>
        <div class="tx-sub">${e.date}${e.note ? " • " + escapeHtml(e.note) : ""}</div>
      </div>
      <div class="tx-right">
        <div class="amount">${currency(e.amount)}</div>
        <button class="del" title="Delete">Delete</button>
      </div>
    `;

    row.querySelector(".del").addEventListener("click", ()=>{
      data.entries = data.entries.filter(x => x.id !== e.id);
      saveData(data);
      renderAll();
    });

    txList.appendChild(row);
  }
}

/* ---- Compare ---- */
function renderCompare(){
  const monthEntries = getMonthEntries(data, activeYear, activeMonth);
  const totalThis = sumList(monthEntries);

  const otherMonth = Number(compareMonthSelect.value);
  const otherEntries = getMonthEntries(data, activeYear, otherMonth);
  const totalOther = sumList(otherEntries);

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

/* ---- Render all ---- */
function renderAll(){
  setDefaultDateInput();
  updateFilterChip();
  renderCalendar();
  renderSummary();
  renderCompare();
  renderEntries();
}

/* ---- Events ---- */
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

searchInput.addEventListener("input", renderEntries);
sortSelect.addEventListener("change", renderEntries);

todayBtn.addEventListener("click", ()=>{
  const d = new Date();
  activeYear = d.getFullYear();
  activeMonth = d.getMonth();
  activeDayFilter = null;
  syncSelectors();
  renderAll();
});

txForm.addEventListener("submit", (ev)=>{
  ev.preventDefault();

  const date = txDate.value;
  const bucket = txBucket.value;
  const amount = Number(txAmount.value);
  const note = (txNote.value || "").trim();

  if (!date || !bucket || !Number.isFinite(amount) || amount <= 0){
    alert("Please enter a valid date, bucket, and amount.");
    return;
  }

  data.entries.push({
    id: uid(),
    date,
    bucket,
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

/* Export / Import */
exportBtn.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `budget-planner-buckets-${new Date().toISOString().slice(0,10)}.json`;
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
  if (!obj || !Array.isArray(obj.entries)){
    alert("That file doesn't look like a valid backup.");
    importInput.value = "";
    return;
  }

  obj.entries = obj.entries
    .filter(e => e && typeof e === "object")
    .map(e => ({
      id: e.id || uid(),
      date: String(e.date || "").slice(0,10),
      bucket: String(e.bucket || "Other"),
      amount: Number(e.amount || 0),
      note: String(e.note || "")
    }))
    .filter(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date) && Number.isFinite(e.amount) && e.amount >= 0);

  data = obj;
  saveData(data);
  renderAll();
  importInput.value = "";
});

/* Reset */
wipeBtn.addEventListener("click", ()=>{
  const ok = confirm("Reset will delete all saved data from this browser. Continue?");
  if (!ok) return;
  data = { entries: [] };
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
