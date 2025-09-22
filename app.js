document.addEventListener("DOMContentLoaded", () => {
  //---------- Storage --------
  const KEY = "expenses-v1";
  const load = () => JSON.parse(localStorage.getItem(KEY) || "[]");
  const save = (data) => localStorage.setItem(KEY, JSON.stringify(data));

  //---------- State --------
  let expenses = load();
  let sort = { key: "date", dir: "desc" }; // 'asc' | 'desc'
  const qs = (s) => document.querySelector(s);

  //---------- Utils --------
  const money = (n) => "£" + (Number(n) || 0).toFixed(2);
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const monthKey = (d) => d.slice(0, 7);
  const uid = () => Math.random().toString(36).slice(2, 10);

  //---------- Elements --------
  const form = qs("#expense-form");
  const titleEl = qs("#title");
  const amountEl = qs("#amount");
  const categoryEl = qs("#category");
  const dateEl = qs("#date");
  const listEl = qs("#tbody");
  const kpiMonthEl = qs("#kpi-month");
  const kpiAllEl = qs("#kpi-all");
  const kpiCountEl = qs("#kpi-count");
  const filterMonthEl = qs("#filter-month");
  const filterCatEl = qs("#filter-category");
  const filterSearchEl = qs("#filter-search");
  const pageTotalEl = qs("#page-total");
  const categoryList = qs("#category-list");

  //---------- Initial Defaults --------
  if (dateEl && !dateEl.value) dateEl.value = todayISO();

  //---------- Derived Values --------
  function categories() {
    const set = new Set(expenses.map((e) => e.category).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }

  function refreshCategoryInputs() {
    if (categoryList) {
      categoryList.innerHTML = categories()
        .map((c) => `<option value="${c}"></option>`)
        .join("");
    }
    if (filterCatEl) {
      const current = filterCatEl.value;
      filterCatEl.innerHTML =
        `<option value="">All</option>` +
        categories().map((c) => `<option value="${c}">${c}</option>`).join("");
      if (categories().includes(current)) filterCatEl.value = current;
    }
  }

  //------ Submit Form ------
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = titleEl.value.trim();
      const amount = Number(amountEl.value);
      const category = categoryEl.value.trim();
      const date = dateEl.value || todayISO();
      if (!title || isNaN(amount) || amount <= 0) {
        alert("Enter a title and a positive amount.");
        return;
      }

      const entry = {
        id: uid(),
        title,
        amount,
        category,
        date,
        createdAt: new Date().toISOString(),
      };
      expenses.push(entry);
      save(expenses);
      form.reset();
      dateEl.value = todayISO();
      render();
    });
  }

  const resetBtn = qs("#reset-form");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      form.reset();
      dateEl.value = todayISO();
    });
  }

  //----- Filters -------
  const clearFiltersBtn = qs("#clear-filters");
  if (clearFiltersBtn) {
    clearFiltersBtn.addEventListener("click", () => {
      if (filterMonthEl) filterMonthEl.value = "";
      if (filterCatEl) filterCatEl.value = "";
      if (filterSearchEl) filterSearchEl.value = "";
      render();
    });
  }

  [filterMonthEl, filterCatEl, filterSearchEl]
    .filter(Boolean)
    .forEach((el) => el.addEventListener("input", render));

  //----- Table Sorting -------
  document.querySelectorAll('th[data-sort]').forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-sort");
      if (sort.key === key) {
        sort.dir = sort.dir === "asc" ? "desc" : "asc";
      } else {
        sort.key = key;
        sort.dir = key === "title" || key === "category" ? "asc" : "desc";
      }
      render();
    });
  });

  //---- Delete Entry ------
  function remove(id) {
    if (!confirm("Delete this expense?")) return;
    expenses = expenses.filter((e) => e.id !== id);
    save(expenses);
    render();
  }

  //---- Export/Import/Wipe -----
  const exportBtn = qs("#export-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const data = JSON.stringify(expenses, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `expenses-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  const importFile = qs("#import-file");
  if (importFile) {
    importFile.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!Array.isArray(parsed)) throw new Error("Invalid format");
          for (const r of parsed) {
            if (!r.id) r.id = uid();
            if (!r.title || typeof r.amount !== "number" || !r.date)
              throw new Error("Missing fields");
          }
          expenses = parsed;
          save(expenses);
          render();
          alert("Import successful.");
        } catch (err) {
          alert("Import failed: " + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    });
  }

  const wipeBtn = qs("#wipe-btn");
  if (wipeBtn) {
    wipeBtn.addEventListener("click", () => {
      if (!confirm("This will delete ALL expenses. Continue?")) return;
      expenses = [];
      save(expenses);
      render();
    });
  }

  //----- Rendering ------
  function applyFilters(rows) {
    const m = filterMonthEl?.value || ""; // YYYY-MM
    const c = filterCatEl?.value || "";
    const s = (filterSearchEl?.value || "").trim().toLowerCase();

    return rows.filter((r) => {
      if (m && monthKey(r.date) !== m) return false;
      if (c && r.category !== c) return false;
      if (s && !r.title.toLowerCase().includes(s)) return false;
      return true;
    });
  }

  function sortRows(rows) {
    const k = sort.key;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (k === "amount") return (a.amount - b.amount) * dir;
      if (k === "date") return a.date.localeCompare(b.date) * dir;
      return a[k].toLowerCase().localeCompare(b[k].toLowerCase()) * dir;
    });
  }

  function renderKPIs(rows) {
    const ym = new Date().toISOString().slice(0, 7);
    const monthSum = expenses
      .filter((e) => monthKey(e.date) === ym)
      .reduce((t, e) => t + e.amount, 0);
    const allSum = expenses.reduce((t, e) => t + e.amount, 0);
    if (kpiMonthEl) kpiMonthEl.textContent = money(monthSum);
    if (kpiAllEl) kpiAllEl.textContent = money(allSum);
    if (kpiCountEl) kpiCountEl.textContent = String(expenses.length);
    const pageSum = rows.reduce((t, e) => t + e.amount, 0);
    if (pageTotalEl) pageTotalEl.textContent = money(pageSum);
  }

  function renderTable(rows) {
    if (!listEl) return;
    listEl.innerHTML = rows
      .map(
        (e) => `
      <tr>
        <td>${e.date}</td>
        <td>${escapeHtml(e.title)}</td>
        <td><span class="category">${escapeHtml(e.category || "—")}</span></td>
        <td class="right">${money(e.amount)}</td>
        <td class="right">
          <button class="btn-danger" data-id="${e.id}" title="Delete">Delete</button>
        </td>
      </tr>`
      )
      .join("");

    listEl.querySelectorAll("button[data-id]").forEach((btn) => {
      btn.addEventListener("click", () => remove(btn.getAttribute("data-id")));
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[m]);
  }

  function render() {
    refreshCategoryInputs();
    const filtered = applyFilters(expenses);
    const sorted = sortRows(filtered);
    renderKPIs(filtered);
    renderTable(sorted);
  }

  // ---------- Seed demo (optional) ----------
  if (expenses.length === 0) {
    const demo = [
      { title: "Groceries", amount: 24.5, category: "Food", date: todayISO() },
      { title: "Bus pass", amount: 18.0, category: "Transport", date: todayISO() },
      { title: "Coffee", amount: 3.2, category: "Food", date: todayISO() },
    ].map((x) => ({ id: uid(), createdAt: new Date().toISOString(), ...x }));
    expenses = demo;
    save(expenses);
  }

  // ---------- Kick off ----------
  render();
});
