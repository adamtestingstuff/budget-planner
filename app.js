/* Budget Planner — Monthly tracker (no daily entries) */

const STORAGE_KEY = "bp_v3_monthly_tracker";

const monthNames = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const BUCKETS = ["Housing","Transport","Insurance","Groceries","Lifestyle","Memberships","Other"];

const BUCKET_COLORS = {
  "Housing": "#ff4fb8",
  "Transport": "#ffd166",
  "Insurance": "#66a7ff",
  "Groceries": "#4de1c1",
  "Lifestyle": "#9b8cff",
  "Memberships": "#ff6b7d",
  "Other": "#66a7ff",
};

function bucketColor(b){ return BUCKET_COLORS[b] || "#66a7ff"; }
const $ = (id) => document.getElementById(id);

function currency(n){
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { style:"currency", currency:"USD" });
}
function pad2(n){ return String(n).padStart(2,"0"); }
function monthKey(year, monthIndex){ return `${year}-${pad2(monthIndex+1)}`; }
function safeParseJSON(text){ try { return JSON.parse(text); } catch { return null; } }

function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  const obj = raw ? safeParseJSON(raw) : null;
  if (obj && typeof obj === "object" && obj.months && typeof obj.months === "object") return obj;
  return { months: {} };
}

function saveData(data){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function ensureMonth(data, key){
  if (!data.months[key]){
    const buckets = {};
    for (const b of BUCKETS) buckets[b] = 0;
    data.months[key] = {
      incomeSalary: 0,
      incomeOther: 0,
      buckets
    };
  } else {
    // ensure buckets exist (future-proof)
    for (const b of BUCKETS){
      if (typeof data.months[key].buckets?.[b] !== "number") {
        data.months[key].buckets = data.months[key].buckets || {};
        data.months[key].buckets[b] = Number(data.months[key].buckets[b] || 0);
      }
    }
    data.months[key].incomeSalary = Number(data.months[key].incomeSalary || 0);
    data.months[key].incomeOther = Number(data.months[key].incomeOther || 0);
  }
  return data.months[key];
}

function sumBuckets(buckets){
  return Object.values(buckets || {}).reduce((a,v)=>a + Number(v || 0), 0);
}

/* ---- State ---- */
let data = loadData();
let activeYear = new Date().getFullYear();
let activeMonth = new Date().getMonth();

/* ---- Elements ---- */
const yearSelect = $("yearSelect");
const monthSelect = $("monthSelect");
const todayBtn = $("todayBtn");

const exportBtn = $("exportBtn");
const importInput = $("importInput");
const wipeBtn = $("wipeBtn");

const activeMonthLabel = $("activeMonthLabel");

const salaryInput = $("salaryInput");
const otherIncomeInput = $("otherIncomeInput");
const incomeTotalEl = $("incomeTotal");

const expenseForm = $("expenseForm");
const bucketInput = $("bucketInput");
const amountInput = $("amountInput");
const bucketGrid = $("bucketGrid");
const clearMonthBtn = $("clearMonthBtn");

const monthStatsLabel = $("monthStatsLabel");
const statIncome = $("statIncome");
const statExpenses = $("statExpenses");
const statNet = $("statNet");
const bucketBars = $("bucketBars");

const compareMonthSelect = $("compareMonthSelect");
const compareThis = $("compareThis");
const compareOther = $("compareOther");
const compareDelta = $("compareDelta");

/* ---- UI setup ---- */
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
  const prev = (activeMonth + 11) % 12;
  compareMonthSelect.value = String(prev);
}
function syncSelectors(){
  yearSelect.value = String(activeYear);
  monthSelect.value = String(activeMonth);
  buildCompareOptions();
}

function setMonthHeader(){
  const label = `${monthNames[activeMonth]} ${activeYear}`;
  activeMonthLabel.textContent = label;
  monthStatsLabel.textContent = label;
}

/* ---- Bucket buttons ---- */
function initBucketButtons(){
  if (!bucketGrid) return;

  bucketGrid.querySelectorAll(".bucket-btn").forEach(btn => {
    const b = btn.dataset.bucket || "Other";
    const c = bucketColor(b);
    btn.style.setProperty("--c", c);

    if (!btn.querySelector(".dot")){
      const dot = document.createElement("span");
      dot.className = "dot";
      btn.prepend(dot);
    }
  });

  if (!bucketInput.value) bucketInput.value = "Housing";
  bucketGrid.querySelectorAll(".bucket-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.bucket === bucketInput.value);
  });

  bucketGrid.addEventListener("click", (e) => {
    const btn = e.target.closest(".bucket-btn");
    if (!btn) return;

    bucketInput.value = btn.dataset.bucket;
    bucketGrid.querySelectorAll(".bucket-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
  });
}

/* ---- Rendering ---- */
function renderIncomeSection(){
  const key = monthKey(activeYear, activeMonth);
  const m = ensureMonth(data, key);

  salaryInput.value = m.incomeSalary ? String(m.incomeSalary) : "";
  otherIncomeInput.value = m.incomeOther ? String(m.incomeOther) : "";

  const totalIncome = Number(m.incomeSalary || 0) + Number(m.incomeOther || 0);
  incomeTotalEl.textContent = currency(totalIncome);
}

function renderSummary(){
  const key = monthKey(activeYear, activeMonth);
  const m = ensureMonth(data, key);

  const income = Number(m.incomeSalary || 0) + Number(m.incomeOther || 0);
  const expenses = sumBuckets(m.buckets);
  const net = income - expenses;

  statIncome.textContent = currency(income);
  statExpenses.textContent = currency(expenses);
  statNet.textContent = currency(net);

  // Bars
  const entries = Object.entries(m.buckets).sort((a,b)=>b[1]-a[1]);
  const max = entries.length ? entries[0][1] : 0;

  bucketBars.innerHTML = "";
  if (!expenses){
    bucketBars.innerHTML = `<div class="muted">No expenses added for this month yet.</div>`;
    return;
  }

  for (const [bucket, val] of entries){
    const v = Number(val || 0);
    if (v <= 0) continue;

    const pct = max ? (v / max) * 100 : 0;
    const c = bucketColor(bucket);

    const el = document.createElement("div");
    el.className = "bar";
    el.innerHTML = `
      <div class="bar-top">
        <div><strong>${bucket}</strong></div>
        <div>${currency(v)}</div>
      </div>
      <div class="bar-fill" style="width:${pct.toFixed(1)}%; --c:${c}"></div>
    `;
    bucketBars.appendChild(el);
  }
}

function getNetForMonth(year, monthIdx){
  const key = monthKey(year, monthIdx);
  const m = ensureMonth(data, key);
  const income = Number(m.incomeSalary || 0) + Number(m.incomeOther || 0);
  const expenses = sumBuckets(m.buckets);
  return income - expenses;
}

function renderCompare(){
  const netThis = getNetForMonth(activeYear, activeMonth);

  const otherMonth = Number(compareMonthSelect.value);
  const netOther = getNetForMonth(activeYear, otherMonth);

  compareThis.textContent = currency(netThis);
  compareOther.textContent = currency(netOther);

  const delta = netThis - netOther;
  compareDelta.classList.remove("pos","neg");

  if (delta === 0){
    compareDelta.textContent = "Same net as compared month.";
  } else if (delta > 0){
    compareDelta.classList.add("pos");
    compareDelta.textContent = `${currency(delta)} higher net than ${monthNames[otherMonth]}`;
  } else {
    compareDelta.classList.add("neg");
    compareDelta.textContent = `${currency(Math.abs(delta))} lower net than ${monthNames[otherMonth]}`;
  }
}

function renderAll(){
  setMonthHeader();
  renderIncomeSection();
  renderSummary();
  renderCompare();
}

/* ---- Events ---- */
yearSelect.addEventListener("change", ()=>{
  activeYear = Number(yearSelect.value);
  syncSelectors();
  renderAll();
});

monthSelect.addEventListener("change", ()=>{
  activeMonth = Number(monthSelect.value);
  buildCompareOptions();
  renderAll();
});

todayBtn.addEventListener("click", ()=>{
  const d = new Date();
  activeYear = d.getFullYear();
  activeMonth = d.getMonth();
  syncSelectors();
  renderAll();
});

// Income autosave on input
function incomeChanged(){
  const key = monthKey(activeYear, activeMonth);
  const m = ensureMonth(data, key);

  m.incomeSalary = Math.max(0, Number(salaryInput.value || 0));
  m.incomeOther = Math.max(0, Number(otherIncomeInput.value || 0));
  saveData(data);

  renderAll();
}
salaryInput.addEventListener("input", incomeChanged);
otherIncomeInput.addEventListener("input", incomeChanged);

// Add expense to selected bucket
expenseForm.addEventListener("submit", (ev)=>{
  ev.preventDefault();

  const key = monthKey(activeYear, activeMonth);
  const m = ensureMonth(data, key);

  const bucket = bucketInput.value || "Housing";
  const amount = Number(amountInput.value);

  if (!Number.isFinite(amount) || amount <= 0){
    alert("Please enter a valid amount.");
    return;
  }

  m.buckets[bucket] = Number(m.buckets[bucket] || 0) + (Math.round(amount * 100) / 100);
  saveData(data);

  amountInput.value = "";
  renderAll();
});

compareMonthSelect.addEventListener("change", renderCompare);

// Clear this month
clearMonthBtn.addEventListener("click", ()=>{
  const ok = confirm("Clear this month will reset income + expenses for the selected month. Continue?");
  if (!ok) return;

  const key = monthKey(activeYear, activeMonth);
  const m = ensureMonth(data, key);
  m.incomeSalary = 0;
  m.incomeOther = 0;
  for (const b of BUCKETS) m.buckets[b] = 0;
  saveData(data);
  renderAll();
});

/* Export / Import */
exportBtn.addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(data, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `budget-planner-monthly-${new Date().toISOString().slice(0,10)}.json`;
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

  if (!obj || !obj.months || typeof obj.months !== "object"){
    alert("That file doesn't look like a valid backup.");
    importInput.value = "";
    return;
  }

  // normalize
  const fixed = { months: {} };
  for (const [k,v] of Object.entries(obj.months)){
    if (!/^\d{4}-\d{2}$/.test(k)) continue;

    const incomeSalary = Math.max(0, Number(v?.incomeSalary || 0));
    const incomeOther = Math.max(0, Number(v?.incomeOther || 0));

    const buckets = {};
    for (const b of BUCKETS) buckets[b] = Math.max(0, Number(v?.buckets?.[b] || 0));

    fixed.months[k] = { incomeSalary, incomeOther, buckets };
  }

  data = fixed;
  saveData(data);
  renderAll();
  importInput.value = "";
});

/* Reset all */
wipeBtn.addEventListener("click", ()=>{
  const ok = confirm("Reset will delete all saved data from this browser. Continue?");
  if (!ok) return;
  data = { months: {} };
  saveData(data);
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
  initBucketButtons();
  renderAll();
})();
