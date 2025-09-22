/**** CONFIG ****/
const USE_API  = true;                         
const API_BASE = "http://127.0.0.1:5500";      

/**** STORAGE (local fallback kept for offline mode) ****/
const KEY = "expenses-v2";
const SETTINGS_KEY = "settings-v1";
const loadLocal = () => JSON.parse(localStorage.getItem(KEY) || "[]");
const saveLocal = (data) => localStorage.setItem(KEY, JSON.stringify(data));
const loadSettings = () => JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
const saveSettings = (s) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));

/**** SIMPLE API CLIENT ****/
const api = {
  async list() {
    const r = await fetch(`${API_BASE}/api/expenses`);
    if (!r.ok) throw new Error("List failed");
    return r.json();
  },
  async create(e) {
    const r = await fetch(`${API_BASE}/api/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(e),
    });
    if (!r.ok) throw new Error("Create failed");
    return r.json();
  },
  async update(id, patch) {
    const r = await fetch(`${API_BASE}/api/expenses/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error("Update failed");
    return r.json();
  },
  async remove(id) {
    const r = await fetch(`${API_BASE}/api/expenses/${id}`, { method: "DELETE" });
    if (!r.ok && r.status !== 204) throw new Error("Delete failed");
  },
};

/**** STATE ****/
let expenses = [];
let sort = { key: "date", dir: "desc" };
let page = 1;
let pageSize = 20;
let settings = Object.assign({ currency: "GBP", locale: navigator.language || "en-GB" }, loadSettings());

/**** QS + UTILS ****/
const qs = (s) => document.querySelector(s);
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthKey = (d) => d.slice(0, 7);
const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (n) => new Intl.NumberFormat(settings.locale, { style: "currency", currency: settings.currency }).format(Number(n) || 0);
const escapeHtml = (s) => String(s).replace(/[&<>\"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[m]));

/**** DOM ****/
const form = qs("#expense-form");
const titleEl = qs("#title");
const amountEl = qs("#amount");
const catEl = qs("#category");
const dateEl = qs("#date");
const recurringEl = qs("#recurring");
const listEl = qs("#tbody");
const kpiMonthEl = qs("#kpi-month");
const kpiAllEl = qs("#kpi-all");
const kpiCountEl = qs("#kpi-count");
const filterMonthEl = qs("#filter-month");
const filterCatEl = qs("#filter-category");
const filterSearchEl = qs("#filter-search");
const pageTotalEl = qs("#page-total");
const categoryList = qs("#category-list");
const pageSizeEl = qs("#page-size");
const prevBtn = qs("#prev-page");
const nextBtn = qs("#next-page");
const pageInfo = qs("#page-info");
const currencySelect = qs("#currency-select");
const localeSelect = qs("#locale-select");
const chartCanvas = qs("#chart");

const CURRENCIES = ["GBP","USD","EUR","JPY","CAD","AUD","NGN","INR","ZAR"];
const LOCALES = ["en-GB","en-US","en-CA","en-AU","en-NG","en-IN","en-ZA","fr-FR","de-DE","es-ES","it-IT"];

if (!dateEl.value) dateEl.value = todayISO();

/**** INIT SELECTORS ****/
function initSelectors() {
  currencySelect.innerHTML = CURRENCIES.map(c => `<option ${c===settings.currency?"selected":""}>${c}</option>`).join("");
  localeSelect.innerHTML = LOCALES.map(l => `<option ${l===settings.locale?"selected":""}>${l}</option>`).join("");
  pageSizeEl.value = String(pageSize);

  currencySelect.addEventListener("change", () => { settings.currency = currencySelect.value; saveSettings(settings); render(); });
  localeSelect.addEventListener("change", () => { settings.locale = localeSelect.value; saveSettings(settings); render(); });
  pageSizeEl.addEventListener("change", () => { pageSize = Number(pageSizeEl.value) || 20; page = 1; render(); });
}

/**** CATEGORY HELPERS ****/
function categories() {
  const set = new Set(expenses.map(e => e.category).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
function refreshCategoryInputs() {
  const current = filterCatEl.value;
  const cats = categories();
  categoryList.innerHTML = cats.map(c => `<option value="${c}"></option>`).join("");
  filterCatEl.innerHTML = `<option value="">All</option>` + cats.map(c => `<option value="${c}">${c}</option>`).join("");
  if (cats.includes(current)) filterCatEl.value = current;
}

/**** RECURRING ENGINE ****/
function missingMonths(startYM, endYM, haveSet) {
  const res = [];
  let [y, m] = startYM.split("-").map(Number);
  const [ey, em] = endYM.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    const key = `${String(y).padStart(4,"0")}-${String(m).padStart(2,"0")}`;
    if (!haveSet.has(key)) res.push(key);
    m++; if (m > 12) { m = 1; y++; }
  }
  return res;
}
async function ensureRecurringServerSide() {
  // Read recurring groups from current expense list and POST any missing months.
  const recGroups = {};
  for (const e of expenses) {
    if (e.recurring) {
      const key = e.recurringKey || `${e.title}|${e.amount}|${e.category}`;
      if (!recGroups[key]) recGroups[key] = { template: e, months: new Set() };
      recGroups[key].months.add(monthKey(e.date));
    }
  }
  const nowYM = monthKey(todayISO());
  let posted = 0;
  for (const key in recGroups) {
    const g = recGroups[key];
    const monthsSorted = Array.from(g.months).sort();
    const startYM = monthsSorted[0];
    const toAdd = missingMonths(startYM, nowYM, g.months);
    for (const ym of toAdd) {
      const d = ym + "-01";
      const base = g.template;
      const payload = { title: base.title, amount: base.amount, category: base.category, date: d, user_id: base.user_id, recurring: true, recurringKey: key };
      if (USE_API) await api.create(payload); else {
        const local = loadLocal(); local.push({ id: uid(), createdAt: new Date().toISOString(), ...payload }); saveLocal(local);
      }
      posted++;
    }
  }
  if (posted) await refreshFromSource();
}

/**** FILTERS/SORT/PAGE ****/
function applyFilters(rows) {
  const m = filterMonthEl.value;
  const c = filterCatEl.value;
  const s = filterSearchEl.value.trim().toLowerCase();
  return rows.filter(r => {
    if (m && monthKey(r.date) !== m) return false;
    if (c && r.category !== c) return false;
    if (s && !r.title.toLowerCase().includes(s)) return false;
    return true;
  });
}
function sortRows(rows) {
  const k = sort.key, dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (k === "amount") return (a.amount - b.amount) * dir;
    if (k === "date")   return (a.date.localeCompare(b.date)) * dir;
    const av = (a[k] || "").toString().toLowerCase();
    const bv = (b[k] || "").toString().toLowerCase();
    return av.localeCompare(bv) * dir;
  });
}
function paginate(rows) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;
  const start = (page - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);
  prevBtn.disabled = page <= 1;
  nextBtn.disabled = page >= totalPages;
  pageInfo.textContent = `Page ${page} / ${totalPages}`;
  return { rows: slice, total, totalPages };
}

/**** RENDER ****/
function renderKPIs(filteredPageRows) {
  const nowYM = monthKey(todayISO());
  const monthSum = expenses.filter(e => monthKey(e.date) === nowYM).reduce((t, e) => t + e.amount, 0);
  const allSum = expenses.reduce((t, e) => t + e.amount, 0);
  kpiMonthEl.textContent = fmt(monthSum);
  kpiAllEl.textContent = fmt(allSum);
  kpiCountEl.textContent = String(expenses.length);
  const pageSum = filteredPageRows.reduce((t, e) => t + e.amount, 0);
  pageTotalEl.textContent = fmt(pageSum);
}
function rowTemplate(e) {
  return `
    <tr data-id="${e.id}">
      <td>${e.date}</td>
      <td>${escapeHtml(e.title)}</td>
      <td><span class="category">${escapeHtml(e.category || "—")}${e.recurring ? " • Recurring" : ""}</span></td>
      <td class="right">${fmt(e.amount)}</td>
      <td class="right">
        <button data-action="edit">Edit</button>
        <button class="btn-danger" data-action="delete">Delete</button>
      </td>
    </tr>`;
}
function rowEditorTemplate(e) {
  return `
    <tr data-id="${e.id}">
      <td><input type="date" value="${e.date}"></td>
      <td><input type="text" value="${escapeHtml(e.title)}"></td>
      <td><input type="text" value="${escapeHtml(e.category || "")}" list="category-list"></td>
      <td class="right"><input type="number" step="0.01" min="0" value="${e.amount}"></td>
      <td class="right">
        <button data-action="save">Save</button>
        <button data-action="cancel">Cancel</button>
      </td>
    </tr>`;
}
function renderTable(paged) {
  listEl.innerHTML = paged.rows.map(rowTemplate).join("");
  listEl.querySelectorAll("button[data-action]").forEach(btn => btn.addEventListener("click", () => handleRowAction(btn)));
}
function drawChart(filteredAll) {
  const ctx = chartCanvas.getContext("2d");
  ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
  const sums = {};
  for (const e of filteredAll) {
    const k = e.category || "Uncategorized";
    sums[k] = (sums[k] || 0) + e.amount;
  }
  const labels = Object.keys(sums);
  const values = labels.map(k => sums[k]);
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const cx = chartCanvas.width / 2, cy = chartCanvas.height / 2, r = Math.min(cx, cy) - 20;
  let start = -Math.PI / 2;
  for (let i = 0; i < values.length; i++) {
    const slice = values[i] / total * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, start, start + slice); ctx.closePath();
    const h = Math.abs(hashCode(labels[i])) % 360; ctx.fillStyle = `hsl(${h} 70% 45%)`;
    ctx.fill(); start += slice;
  }
  ctx.font = "14px system-ui"; ctx.textBaseline = "middle";
  let y = 20; const x = 10;
  labels.forEach((lab, i) => {
    const h = Math.abs(hashCode(lab)) % 360; ctx.fillStyle = `hsl(${h} 70% 45%)`;
    ctx.fillRect(x, y - 6, 12, 12);
    ctx.fillStyle = "#cbd5e1";
    const pct = ((values[i] / total) * 100).toFixed(1) + "%";
    ctx.fillText(`${lab} — ${fmt(values[i])} (${pct})`, x + 18, y);
    y += 18;
  });
}
function hashCode(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; } return h; }

function render() {
  refreshCategoryInputs();
  const filteredAll = applyFilters(expenses);
  const sorted = sortRows(filteredAll);
  const paged = paginate(sorted);
  renderKPIs(paged.rows);
  renderTable(paged);
  drawChart(filteredAll);
}

/**** CRUD HANDLERS ****/
async function refreshFromSource() {
  if (USE_API) {
    expenses = await api.list();
  } else {
    expenses = loadLocal();
  }
}
async function addExpense(entry) {
  if (USE_API) {
    await api.create(entry);
    await refreshFromSource();
  } else {
    const local = loadLocal(); local.push(entry); saveLocal(local); expenses = local;
  }
}
async function updateExpense(id, patch) {
  if (USE_API) {
    await api.update(id, patch);
    await refreshFromSource();
  } else {
    const local = loadLocal();
    const idx = local.findIndex(e => String(e.id) === String(id));
    if (idx >= 0) { local[idx] = Object.assign({}, local[idx], patch); saveLocal(local); }
    expenses = local;
  }
}
async function deleteExpense(id) {
  if (USE_API) {
    await api.remove(id);
    await refreshFromSource();
  } else {
    const local = loadLocal().filter(e => String(e.id) !== String(id)); saveLocal(local); expenses = local;
  }
}

/**** EVENTS ****/
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = titleEl.value.trim();
  const amount = Number(amountEl.value);
  const category = catEl.value.trim();
  const date = dateEl.value || todayISO();
  const recurring = !!recurringEl.checked;
  if (!title || isNaN(amount) || amount <= 0) return alert("Enter a title and a positive amount.");

  const entry = { title, amount, category, date, createdAt: new Date().toISOString() };
  // server creates numeric id; local needs our own
  if (!USE_API) entry.id = uid();
  if (recurring) { entry.recurring = true; entry.recurringKey = `${title}|${amount}|${category}`; }

  await addExpense(entry);
  form.reset(); dateEl.value = todayISO();
  render();
});

qs("#reset-form").addEventListener("click", () => { form.reset(); dateEl.value = todayISO(); });

// OLD (crashes if any is null):
// [filterMonthEl, filterCatEl, filterSearchEl].forEach(el => el.addEventListener("input", () => { page=1; render(); }));

// NEW (defensive):
[filterMonthEl, filterCatEl, filterSearchEl]
  .filter(Boolean)
  .forEach(el => el.addEventListener("input", () => { page = 1; render(); }));

document.querySelectorAll("th[data-sort]").forEach(th => {
  th.addEventListener("click", () => {
    const key = th.getAttribute("data-sort");
    if (sort.key === key) sort.dir = sort.dir === "asc" ? "desc" : "asc";
    else { sort.key = key; sort.dir = key === "title" || key === "category" ? "asc" : "desc"; }
    render();
  });
});

async function handleRowAction(btn) {
  const tr = btn.closest("tr"); const id = tr.getAttribute("data-id"); const action = btn.getAttribute("data-action");
  if (action === "delete") {
    if (!confirm("Delete this expense?")) return;
    await deleteExpense(id);
    render();
  }
  if (action === "edit") {
    // swap to inline editor
    const current = expenses.find(e => String(e.id) === String(id));
    tr.outerHTML = rowEditorTemplate(current);
    const newTr = document.querySelector(`tr[data-id="${id}"]`);
    newTr.querySelectorAll('button[data-action="save"],button[data-action="cancel"]').forEach(b => b.addEventListener("click", () => handleRowEditAction(b)));
  }
}
async function handleRowEditAction(btn) {
  const tr = btn.closest("tr"); const id = tr.getAttribute("data-id"); const action = btn.getAttribute("data-action");
  if (action === "cancel") { render(); return; }
  if (action === "save") {
    const [dateIn, titleIn, catIn, amtIn] = tr.querySelectorAll("input");
    const title = titleIn.value.trim(); const amount = Number(amtIn.value); const category = catIn.value.trim(); const date = dateIn.value;
    if (!title || isNaN(amount) || amount <= 0 || !date) return alert("Please enter valid values.");
    await updateExpense(id, { title, amount, category, date });
    render();
  }
}

/**** EXPORT / IMPORT ****/
qs("#export-btn").addEventListener("click", async () => {
  // always export the latest server or local data
  await refreshFromSource();
  const data = JSON.stringify(expenses, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `expenses-${todayISO()}.json`; document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

qs("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error("Invalid format");
      // simple validation + upload each
      for (const r of parsed) {
        if (!r.title || typeof r.amount !== "number" || !r.date) throw new Error("Missing fields");
        const payload = { title: r.title, amount: r.amount, category: r.category, date: r.date, user_id: r.user_id, recurring: r.recurring, recurringKey: r.recurringKey };
        if (USE_API) await api.create(payload);
        else {
          const local = loadLocal(); local.push({ id: r.id || uid(), createdAt: r.createdAt || new Date().toISOString(), ...payload }); saveLocal(local);
        }
      }
      await refreshFromSource(); render();
      alert("Import successful.");
    } catch (err) { alert("Import failed: " + err.message); }
  };
  reader.readAsText(file); e.target.value = "";
});

qs("#wipe-btn").addEventListener("click", async () => {
  if (!confirm("This will delete ALL expenses. Continue?")) return;
  await refreshFromSource();
  for (const e of expenses) { await deleteExpense(e.id); }
  await refreshFromSource(); render();
});

/**** STARTUP ****/
prevBtn.addEventListener("click", () => { if (page > 1) { page--; render(); } });
nextBtn.addEventListener("click", () => { page++; render(); });

(async function boot() {
  initSelectors();

  if (!USE_API) {
    // seed demo if empty (offline only)
    if (loadLocal().length === 0) {
      const demo = [
        { title: "Groceries", amount: 24.50, category: "Food", date: todayISO() },
        { title: "Bus pass", amount: 18.00, category: "Transport", date: todayISO() },
        { title: "Coffee", amount: 3.20, category: "Food", date: todayISO() },
        { title: "Rent", amount: 600.00, category: "Housing", date: todayISO(), recurring: true, recurringKey: "Rent|600|Housing" },
      ].map(x => ({ id: uid(), createdAt: new Date().toISOString(), ...x }));
      saveLocal(demo);
    }
  }

  await refreshFromSource();

  // Auto-generate missing months for recurring items (server or local), then refresh view
  await ensureRecurringServerSide();
  await refreshFromSource();

  render();
})();
