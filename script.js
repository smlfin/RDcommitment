// ── CONFIG ─────────────────────────────────────────────────
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwlm0vWQ8PWfhikA93gYimNDBjSIWgNVc3JS71hvTyEsT8HngKB00nHChpB-D_Gkj8BkQ/exec";

// ── App state ───────────────────────────────────────────────
let BRANCHES = [];   // [{branch, manager, investment, rd}]

// ── Startup ─────────────────────────────────────────────────
(async function init() {
  const today = isoToday();
  setVal("mDate", today);
  setVal("eDate", today);
  byId("topDate").textContent = niceDate(today);
  updateDayStrip(today);
  await loadBranches();
})();

// ── Utilities ────────────────────────────────────────────────
function byId(id) { return document.getElementById(id); }
function setVal(id, v) { byId(id).value = v; }
function show(id) { byId(id).style.display = ""; }
function hide(id) { byId(id).style.display = "none"; }
function isoToday() { return new Date().toISOString().slice(0, 10); }
function fmt(n) {
  if (n === "" || n === null || n === undefined) return "—";
  return Number(n).toLocaleString("en-IN");
}
function niceDate(s) {
  return new Date(s + "T00:00:00").toLocaleDateString("en-IN",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

let _toastT;
function toast(msg, type) {
  const el = byId("toast");
  el.textContent = msg;
  el.className = "show " + (type || "");
  clearTimeout(_toastT);
  _toastT = setTimeout(() => el.className = "", 4200);
}

// ── Tab switching ────────────────────────────────────────────
function switchTab(btn) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  byId("sec-" + btn.dataset.tab).classList.add("active");
  btn.classList.add("active");
}

// ── Working days ─────────────────────────────────────────────
function workingDays(year, month, fromDateStr) {
  // Returns {working, elapsed, remaining} for the whole month.
  // "elapsed" = working days from day 1 up to and including fromDateStr.
  const lastDay = new Date(year, month, 0).getDate();
  let working = 0, elapsed = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dt  = new Date(year, month - 1, d);
    if (dt.getDay() === 0) continue; // Sunday
    working++;
    const dStr = dt.toISOString().slice(0, 10);
    if (dStr <= fromDateStr) elapsed++;
  }
  return { working, elapsed, remaining: working - elapsed };
}

function updateDayStrip(dateStr) {
  const [y, m] = dateStr.split("-").map(Number);
  const { working, elapsed, remaining } = workingDays(y, m, dateStr);
  byId("dsW").textContent = working;
  byId("dsE").textContent = elapsed;
  byId("dsR").textContent = remaining;
  const dt = new Date(dateStr + "T00:00:00");
  byId("dsD").textContent  = dt.getDate();
  byId("dsDL").textContent = dt.toLocaleString("en-IN", { month: "short", year: "numeric" });
}

// ── Load branches ────────────────────────────────────────────
async function loadBranches() {
  byId("mBranch").innerHTML = '<option value="">Loading branches…</option>';
  byId("eBranch").innerHTML = '<option value="">Loading branches…</option>';
  try {
    const res = await apiFetch({ action: "branches" });
    if (!Array.isArray(res)) throw new Error("Unexpected response");
    BRANCHES = res;
    const opts = BRANCHES.map(b => `<option value="${esc(b.branch)}">${esc(b.branch)}</option>`).join("");
    const ph   = '<option value="">— Select Branch —</option>';
    byId("mBranch").innerHTML = ph + opts;
    byId("eBranch").innerHTML = ph + opts;
    populateNewSelects();
  } catch (err) {
    byId("mBranch").innerHTML = '<option value="">Failed to load</option>';
    byId("eBranch").innerHTML = '<option value="">Failed to load</option>';
    toast("Failed to load branches: " + err.message, "err");
  }
}

function esc(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
}

// ── Generic API fetch (GET with query params) ─────────────────
async function apiFetch(params) {
  const qs  = new URLSearchParams(params).toString();
  const res = await fetch(SCRIPT_URL + "?" + qs);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

// ─────────────────────────────────────────────────────────────
//  MORNING SECTION
// ─────────────────────────────────────────────────────────────

function onMDateChange() {
  updateDayStrip(byId("mDate").value);
  // Reset branch — clear all dependent panels
  setVal("mBranch", "");
  hideMorningPanels();
}

function hideMorningPanels() {
  hide("mSkeleton");
  hide("mInfoPanel");
  setVal("mManager", "");
  byId("mIC").value = "";
  byId("mRC").value = "";
}

async function onMBranchChange() {
  hideMorningPanels();
  const branchName = byId("mBranch").value;
  if (!branchName) return;

  const b = BRANCHES.find(x => x.branch === branchName);
  if (!b) return;

  const dateStr = byId("mDate").value;
  const [y, m]  = dateStr.split("-").map(Number);

  // Set manager immediately (comes from local cache — no fetch needed)
  setVal("mManager", b.manager);
  byId("mML").textContent = new Date(y, m - 1, 1)
    .toLocaleString("en-IN", { month: "long", year: "numeric" });

  // Show skeleton while fetching
  show("mSkeleton");

  try {
    // branchInfo returns: rem_in, rem_rd (remaining targets after cumulative achievements),
    // drr_in, drr_rd (DRR based on remaining working days)
    const info = await apiFetch({ action: "branchInfo", branch: branchName, date: dateStr });
    if (info.error) throw new Error(info.error);

    // Show REMAINING targets (not raw monthly target)
    byId("mIT").textContent = fmt(info.rem_in);
    byId("mRT").textContent = fmt(info.rem_rd);
    byId("mDI").textContent = fmt(info.drr_in);
    byId("mDR").textContent = fmt(info.drr_rd);

    hide("mSkeleton");
    show("mInfoPanel");
  } catch (err) {
    hide("mSkeleton");
    toast("Could not load branch data: " + err.message, "err");
  }
}

async function submitMorning() {
  const branch  = byId("mBranch").value;
  const dateStr = byId("mDate").value;
  const manager = byId("mManager").value;
  const in_com  = byId("mIC").value.trim();
  const rd_com  = byId("mRC").value.trim();

  if (!branch)   return toast("Please select a branch.", "err");
  if (!in_com && !rd_com) return toast("Enter at least one commitment value.", "err");

  const btn = byId("mSub");
  btn.disabled = true; btn.textContent = "Saving…";

  try {
    const res = await apiFetch({
      action: "morningEntry", date: dateStr, branch,
      branchHead: manager, in_com: in_com || 0, rd_com: rd_com || 0
    });
    if (res.error) throw new Error(res.error);
    toast("Morning entry saved.", "ok");
    resetMorning();
  } catch (err) {
    toast(err.message, "err");
  } finally {
    btn.disabled = false; btn.textContent = "Submit Morning Entry";
  }
}

function resetMorning() {
  setVal("mBranch", "");
  hideMorningPanels();
}

// ─────────────────────────────────────────────────────────────
//  EVENING SECTION
// ─────────────────────────────────────────────────────────────

function onEDateChange() {
  // Reset branch selection — prevent stale commitment from a different date showing
  setVal("eBranch", "");
  hideEveningPanels();
}

function hideEveningPanels() {
  hide("eSkeleton");
  hide("eInputArea");
  setVal("eManager", "");
  byId("eIA").value = "";
  byId("eRA").value = "";
}

async function onEBranchChange() {
  hideEveningPanels();
  const branchName = byId("eBranch").value;
  if (!branchName) return;

  const b = BRANCHES.find(x => x.branch === branchName);
  if (b) setVal("eManager", b.manager);

  const dateStr = byId("eDate").value;

  // Show spinner while fetching
  show("eSkeleton");

  try {
    const data = await apiFetch({ action: "getCommitment", date: dateStr, branch: branchName });
    hide("eSkeleton");

    if (!data.found) {
      toast("No morning entry for " + branchName + " on " + dateStr + ". Submit morning entry first.", "err");
      return;
    }
    if (data.alreadyEvening) {
      toast("Evening entry already submitted for " + branchName + " on " + dateStr + ".", "err");
      return;
    }

    byId("eSIC").textContent = fmt(data.in_com);
    byId("eSRC").textContent = fmt(data.rd_com);
    show("eInputArea");

  } catch (err) {
    hide("eSkeleton");
    toast("Error: " + err.message, "err");
  }
}

async function submitEvening() {
  const branch  = byId("eBranch").value;
  const dateStr = byId("eDate").value;
  const manager = byId("eManager").value;
  const in_ach  = byId("eIA").value.trim();
  const rd_ach  = byId("eRA").value.trim();

  if (!branch) return toast("Please select a branch.", "err");
  if (!in_ach && !rd_ach) return toast("Enter at least one achievement value.", "err");

  const btn = byId("eSub");
  btn.disabled = true; btn.textContent = "Saving…";

  try {
    const res = await apiFetch({
      action: "eveningEntry", date: dateStr, branch,
      branchHead: manager, in_ach: in_ach || 0, rd_ach: rd_ach || 0
    });
    if (res.error) throw new Error(res.error);
    toast("Evening entry saved.", "ok");
    resetEvening();
  } catch (err) {
    toast(err.message, "err");
  } finally {
    btn.disabled = false; btn.textContent = "Submit Evening Entry";
  }
}

function resetEvening() {
  setVal("eBranch", "");
  hideEveningPanels();
}

// ═══════════════════════════════════════════════════════════
//  REPORTS
// ═══════════════════════════════════════════════════════════

const REPORT_PWD = "up";
let rUnlocked = false;

function unlockReports() {
  const pwd = byId("rPwd").value;
  if (pwd === REPORT_PWD) {
    rUnlocked = true;
    hide("rGate");
    show("rContent");
    // Set defaults
    byId("rDate").value  = isoToday();
    const now = new Date();
    byId("dMonth").value = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
    populateNewSelects();
    loadDailyReport();
  } else {
    show("rPwdErr");
    byId("rPwd").value = "";
    byId("rPwd").focus();
  }
}

function switchReport(btn) {
  document.querySelectorAll(".r-sub-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".r-section").forEach(s => s.classList.remove("active"));
  btn.classList.add("active");
  byId("rsec-" + btn.dataset.rsub).classList.add("active");
}

// ── DAILY REPORT ────────────────────────────────────────────
async function loadDailyReport() {
  const dateStr = byId("rDate").value;
  const view    = byId("rView").value; // "commitment" | "both"
  if (!dateStr) return;

  hide("rDailyOut");
  show("rDailySpin");

  try {
    const data = await apiFetch({ action: "dayReport", date: dateStr });
    hide("rDailySpin");
    if (!Array.isArray(data) || data.length === 0) {
      byId("rDailyBody").innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--t4)">No data found for this date</td></tr>';
      buildDailyHead(view);
      show("rDailyOut");
      return;
    }

    buildDailyHead(view);
    buildDailyBody(data, view);
    buildNotSubmitted(data, view);
    show("rDailyOut");
  } catch (err) {
    hide("rDailySpin");
    toast("Error loading daily report: " + err.message, "err");
  }
}

function buildDailyHead(view) {
  const isBoth = view === "both";
  const th = (t, cls) => `<th${cls?" class='"+cls+"'":""}>${t}</th>`;
  let html = "<tr>" + th("Branch") + th("Manager");
  if (isBoth) {
    html += th("In Commitment","num") + th("RD Commitment","num")
          + th("In Achievement","num") + th("RD Achievement","num")
          + th("In vs Commit","num") + th("RD vs Commit","num");
  } else {
    html += th("Investment Commitment","num") + th("RD Commitment","num");
  }
  html += "</tr>";
  byId("rDailyHead").innerHTML = html;
}

function buildDailyBody(data, view) {
  const isBoth = view === "both";
  let totIC=0, totRC=0, totIA=0, totRA=0;
  let rows = "";

  data.forEach(r => {
    const ic = r.in_com !== "" ? Number(r.in_com) : null;
    const rc = r.rd_com !== "" ? Number(r.rd_com) : null;
    const ia = r.in_ach !== "" ? Number(r.in_ach) : null;
    const ra = r.rd_ach !== "" ? Number(r.rd_ach) : null;

    if (ic !== null) totIC += ic;
    if (rc !== null) totRC += rc;
    if (ia !== null) totIA += ia;
    if (ra !== null) totRA += ra;

    const cIC = ic !== null ? fmt(ic) : '<span class="cell-muted">—</span>';
    const cRC = rc !== null ? fmt(rc) : '<span class="cell-muted">—</span>';

    if (isBoth) {
      const cIA  = ia !== null ? fmt(ia) : '<span class="cell-muted">—</span>';
      const cRA  = ra !== null ? fmt(ra) : '<span class="cell-muted">—</span>';
      let diffIN = "", diffRD = "";
      if (ia !== null && ic !== null) {
        const d = ia - ic;
        diffIN = `<span class="${d>=0?"cell-green":"cell-red"}">${d>=0?"+":""}${fmt(d)}</span>`;
      } else diffIN = '<span class="cell-muted">—</span>';
      if (ra !== null && rc !== null) {
        const d = ra - rc;
        diffRD = `<span class="${d>=0?"cell-green":"cell-red"}">${d>=0?"+":""}${fmt(d)}</span>`;
      } else diffRD = '<span class="cell-muted">—</span>';

      rows += `<tr>
        <td>${esc(r.branch)}</td><td>${esc(r.manager||"—")}</td>
        <td class="num">${cIC}</td><td class="num">${cRC}</td>
        <td class="num">${cIA}</td><td class="num">${cRA}</td>
        <td class="num">${diffIN}</td><td class="num">${diffRD}</td>
      </tr>`;
    } else {
      rows += `<tr>
        <td>${esc(r.branch)}</td><td>${esc(r.manager||"—")}</td>
        <td class="num">${cIC}</td><td class="num">${cRC}</td>
      </tr>`;
    }
  });

  // Totals row
  if (isBoth) {
    const td = totIA - totIC, tr2 = totRA - totRC;
    rows += `<tr class="total-row">
      <td colspan="2">TOTAL</td>
      <td class="num">${fmt(totIC)}</td><td class="num">${fmt(totRC)}</td>
      <td class="num">${fmt(totIA)}</td><td class="num">${fmt(totRA)}</td>
      <td class="num"><span class="${td>=0?"cell-green":"cell-red"}">${td>=0?"+":""}${fmt(td)}</span></td>
      <td class="num"><span class="${tr2>=0?"cell-green":"cell-red"}">${tr2>=0?"+":""}${fmt(tr2)}</span></td>
    </tr>`;
  } else {
    rows += `<tr class="total-row">
      <td colspan="2">TOTAL</td>
      <td class="num">${fmt(totIC)}</td><td class="num">${fmt(totRC)}</td>
    </tr>`;
  }

  byId("rDailyBody").innerHTML = rows;
}

function buildNotSubmitted(data, view) {
  const isBoth = view === "both";
  const noCommit  = data.filter(r => r.in_com === "" && r.rd_com === "");
  const noAchieve = isBoth ? data.filter(r => (r.in_com !== "" || r.rd_com !== "") && r.in_ach === "" && r.rd_ach === "") : [];

  const panel = byId("rNotPanel");
  if (noCommit.length === 0 && noAchieve.length === 0) { hide("rNotPanel"); return; }

  show("rNotPanel");

  if (noCommit.length > 0) {
    byId("rNoComList").innerHTML = noCommit.map(r => `<span class="tag red">${esc(r.branch)}</span>`).join("");
    show("rNoCom");
  } else hide("rNoCom");

  if (noAchieve.length > 0) {
    byId("rNoAchList").innerHTML = noAchieve.map(r => `<span class="tag amber">${esc(r.branch)}</span>`).join("");
    show("rNoAch");
  } else hide("rNoAch");
}

// ── DETAILED REPORT ─────────────────────────────────────────
async function loadDetailedReport() {
  const month   = byId("dMonth").value;   // "YYYY-MM"
  const product = byId("dProduct").value; // "investment"|"rd"|"joint"
  if (!month) return toast("Please select a month.", "err");

  hide("rDetOut");
  show("rDetSpin");

  try {
    const data = await apiFetch({ action: "summaryReport", month });
    hide("rDetSpin");
    if (!Array.isArray(data) || data.length === 0) {
      byId("rDetBody").innerHTML = '<tr><td colspan="10" style="text-align:center;padding:24px;color:var(--t4)">No data found for this month</td></tr>';
      show("rDetOut");
      return;
    }

    // For each branch, compute DRR using current date within that month
    const today     = isoToday();
    const [y, m]    = month.split("-").map(Number);
    const refDate   = today.startsWith(month) ? today : month + "-01";
    const { remaining } = workingDays(y, m, refDate);

    buildDetailHead(product);
    buildDetailBody(data, product, remaining);
    show("rDetOut");
  } catch (err) {
    hide("rDetSpin");
    toast("Error loading detailed report: " + err.message, "err");
  }
}

function buildDetailHead(product) {
  const th = (t, cls) => `<th${cls?" class='"+cls+"'":""}>${t}</th>`;
  let html = "<tr>" + th("Branch") + th("Manager");
  if (product === "joint") {
    html += th("In Target","num") + th("In Achieved","num") + th("In Shortfall","num") + th("In DRR","num")
          + th("RD Target","num") + th("RD Achieved","num") + th("RD Shortfall","num") + th("RD DRR","num");
  } else {
    const p = product === "investment" ? "Investment" : "RD";
    html += th(p+" Target","num") + th(p+" Achieved","num") + th(p+" Shortfall","num") + th(p+" DRR","num");
  }
  html += "</tr>";
  byId("rDetHead").innerHTML = html;
}

function buildDetailBody(data, product, remDays) {
  let rows = "";
  let totInT=0,totInA=0,totRdT=0,totRdA=0;

  data.forEach(r => {
    const inT  = Number(r.in_target   || 0);
    const inA  = Number(r.in_achieved || 0);
    const rdT  = Number(r.rd_target   || 0);
    const rdA  = Number(r.rd_achieved || 0);
    const inS  = inT - inA;
    const rdS  = rdT - rdA;
    const inD  = remDays > 0 ? Math.ceil(Math.max(0,inS) / remDays) : Math.max(0,inS);
    const rdD  = remDays > 0 ? Math.ceil(Math.max(0,rdS) / remDays) : Math.max(0,rdS);

    totInT += inT; totInA += inA; totRdT += rdT; totRdA += rdA;

    const sfClass = s => s > 0 ? "shortfall-pos" : s < 0 ? "shortfall-neg" : "";

    if (product === "joint") {
      rows += `<tr>
        <td>${esc(r.branch)}</td><td>${esc(r.manager||"—")}</td>
        <td class="num">${fmt(inT)}</td>
        <td class="num">${fmt(inA)}</td>
        <td class="num"><span class="${sfClass(inS)}">${fmt(inS)}</span></td>
        <td class="num">${fmt(inD)}</td>
        <td class="num">${fmt(rdT)}</td>
        <td class="num">${fmt(rdA)}</td>
        <td class="num"><span class="${sfClass(rdS)}">${fmt(rdS)}</span></td>
        <td class="num">${fmt(rdD)}</td>
      </tr>`;
    } else if (product === "investment") {
      rows += `<tr>
        <td>${esc(r.branch)}</td><td>${esc(r.manager||"—")}</td>
        <td class="num">${fmt(inT)}</td>
        <td class="num">${fmt(inA)}</td>
        <td class="num"><span class="${sfClass(inS)}">${fmt(inS)}</span></td>
        <td class="num">${fmt(inD)}</td>
      </tr>`;
    } else {
      rows += `<tr>
        <td>${esc(r.branch)}</td><td>${esc(r.manager||"—")}</td>
        <td class="num">${fmt(rdT)}</td>
        <td class="num">${fmt(rdA)}</td>
        <td class="num"><span class="${sfClass(rdS)}">${fmt(rdS)}</span></td>
        <td class="num">${fmt(rdD)}</td>
      </tr>`;
    }
  });

  // Totals
  const totInS = totInT - totInA, totRdS = totRdT - totRdA;
  const sfClass = s => s > 0 ? "shortfall-pos" : s < 0 ? "shortfall-neg" : "";
  if (product === "joint") {
    const tInD = remDays>0?Math.ceil(Math.max(0,totInS)/remDays):Math.max(0,totInS);
    const tRdD = remDays>0?Math.ceil(Math.max(0,totRdS)/remDays):Math.max(0,totRdS);
    rows += `<tr class="total-row"><td colspan="2">TOTAL</td>
      <td class="num">${fmt(totInT)}</td><td class="num">${fmt(totInA)}</td>
      <td class="num"><span class="${sfClass(totInS)}">${fmt(totInS)}</span></td><td class="num">${fmt(tInD)}</td>
      <td class="num">${fmt(totRdT)}</td><td class="num">${fmt(totRdA)}</td>
      <td class="num"><span class="${sfClass(totRdS)}">${fmt(totRdS)}</span></td><td class="num">${fmt(tRdD)}</td>
    </tr>`;
  } else if (product === "investment") {
    const tInD = remDays>0?Math.ceil(Math.max(0,totInS)/remDays):Math.max(0,totInS);
    rows += `<tr class="total-row"><td colspan="2">TOTAL</td>
      <td class="num">${fmt(totInT)}</td><td class="num">${fmt(totInA)}</td>
      <td class="num"><span class="${sfClass(totInS)}">${fmt(totInS)}</span></td><td class="num">${fmt(tInD)}</td>
    </tr>`;
  } else {
    const tRdD = remDays>0?Math.ceil(Math.max(0,totRdS)/remDays):Math.max(0,totRdS);
    rows += `<tr class="total-row"><td colspan="2">TOTAL</td>
      <td class="num">${fmt(totRdT)}</td><td class="num">${fmt(totRdA)}</td>
      <td class="num"><span class="${sfClass(totRdS)}">${fmt(totRdS)}</span></td><td class="num">${fmt(tRdD)}</td>
    </tr>`;
  }

  byId("rDetBody").innerHTML = rows;
}

// ═══════════════════════════════════════════════════════════
//  NEW REPORTS — Shared helpers
// ═══════════════════════════════════════════════════════════

function populateNewSelects() {
  const perfEl = byId("perfBranch");
  if (!perfEl) return;
  const opts = BRANCHES.map(b => `<option value="${esc(b.branch)}">${esc(b.branch)}</option>`).join("");
  const ph = '<option value="">— Select Branch —</option>';
  const allOpt = '<option value="all">— All Branches —</option>';
  perfEl.innerHTML = ph + allOpt + opts;

  // Set default month on new selects to current month
  const now = new Date();
  const ym  = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
  ["perfMonth","drrMonth","zeroMonth"].forEach(id => { const el = byId(id); if(el && !el.value) el.value = ym; });
}

// Show/hide date range row based on branch selection
function perfBranchChanged() {
  const branch = byId("perfBranch").value;
  const rangeRow = byId("perfDateRangeRow");
  if (!rangeRow) return;
  if (branch === "all") {
    rangeRow.style.display = "";
    // Default from/to to current month range if empty
    const fromEl = byId("perfFromDate");
    const toEl   = byId("perfToDate");
    if (!fromEl.value || !toEl.value) {
      const now = new Date();
      const ym  = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0");
      const lastDay = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      fromEl.value = ym + "-01";
      toEl.value   = ym + "-" + String(lastDay).padStart(2,"0");
    }
  } else {
    rangeRow.style.display = "none";
  }
  // Hide any previous output when branch changes
  hide("perfOut");
  hide("perfAllOut");
}

// ═══════════════════════════════════════════════════════════
//  1. BRANCH PERFORMANCE OVER TIME
//  Uses action:"branchHistory" with from/to date range + injects targets from BRANCHES cache
// ═══════════════════════════════════════════════════════════

async function loadPerformanceReport() {
  const branch  = byId("perfBranch").value;
  const month   = byId("perfMonth").value;
  const product = byId("perfProduct").value;

  if (!branch) return toast("Please select a branch.", "err");

  // ── ALL BRANCHES path ──────────────────────────────────────
  if (branch === "all") {
    const fromEl = byId("perfFromDate");
    const toEl   = byId("perfToDate");
    if (!fromEl || !toEl) return toast("Date range inputs missing — please redeploy report.html.", "err");
    const from = fromEl.value;
    const to   = toEl.value;
    if (!from || !to)   return toast("Please select From and To dates.", "err");
    if (from > to)      return toast("From date must be before To date.", "err");

    hide("perfOut");
    hide("perfAllOut");
    show("perfSpin");

    try {
      // Calculate total calendar days in the selected range
      const fromMs   = new Date(from + "T00:00:00").getTime();
      const toMs     = new Date(to   + "T00:00:00").getTime();
      const periodDays = Math.round((toMs - fromMs) / 86400000) + 1;

      // Fetch all branches in parallel
      const results = await Promise.all(
        BRANCHES.map(b =>
          apiFetch({ action: "branchHistory", branch: b.branch, from, to })
            .then(rows => ({ branch: b.branch, manager: b.manager, rows: Array.isArray(rows) ? rows : [] }))
            .catch(() => ({ branch: b.branch, manager: b.manager, rows: [] }))
        )
      );
      hide("perfSpin");

      const showIn = product !== "rd";
      const showRd = product !== "investment";

      let tableRows = "";
      results.forEach(res => {
        let totCom = 0, totAch = 0, hitDays = 0;

        res.rows.forEach(r => {
          // Commitment
          const ic = r.in_com !== "" ? Number(r.in_com) : 0;
          const rc = r.rd_com !== "" ? Number(r.rd_com) : 0;
          // Achievement
          const ia = r.in_ach !== "" ? Number(r.in_ach) : null;
          const ra = r.rd_ach !== "" ? Number(r.rd_ach) : null;

          if (showIn && !showRd) {
            totCom += ic;
            if (ia !== null) totAch += ia;
          } else if (showRd && !showIn) {
            totCom += rc;
            if (ra !== null) totAch += ra;
          } else {
            // both
            totCom += ic + rc;
            if (ia !== null) totAch += ia;
            if (ra !== null) totAch += ra;
          }

          // Days target hit: achievement >= commitment (only days where achievement was submitted)
          const achSubmitted = (showIn && ia !== null) || (showRd && ra !== null);
          if (achSubmitted) {
            let hit = true;
            if (showIn && ia !== null) hit = hit && ia >= ic;
            if (showRd && ra !== null) hit = hit && ra >= rc;
            if (hit) hitDays++;
          }
        });

        const achPct  = totCom > 0 ? Math.round(totAch / totCom * 100) : 0;
        const hitPct  = periodDays > 0 ? Math.round(hitDays / periodDays * 100) : 0;
        const achCls  = achPct >= 100 ? "ach-above" : achPct >= 70 ? "" : "ach-below";
        const hitCls  = hitPct >= 80  ? "ach-above" : hitPct >= 50 ? "" : "ach-below";

        tableRows += `<tr>
          <td class="num">${periodDays}</td>
          <td>${esc(res.branch)}</td>
          <td class="num">${fmt(totCom)}</td>
          <td class="num">${fmt(totAch)}</td>
          <td class="num"><span class="${achCls}">${achPct}%</span></td>
          <td class="num">${hitDays}</td>
          <td class="num"><span class="${hitCls}">${hitPct}%</span></td>
        </tr>`;
      });

      byId("perfAllBody").innerHTML = tableRows ||
        '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--t4)">No data found for this period</td></tr>';
      show("perfAllOut");

    } catch(err) {
      hide("perfSpin");
      toast("Error: " + err.message, "err");
    }
    return;
  }

  // ── SINGLE BRANCH path (existing logic — unchanged) ────────
  if (!month) return toast("Please select a month.", "err");

  hide("perfOut");
  hide("perfAllOut");
  show("perfSpin");

  // Derive from/to date range from the YYYY-MM month string
  const [yr, mo] = month.split("-").map(Number);
  const lastDay  = new Date(yr, mo, 0).getDate();
  const from     = month + "-01";
  const to       = month + "-" + String(lastDay).padStart(2, "0");

  try {
    // Uses existing branchHistory action: returns rows for branch between from/to
    const data = await apiFetch({ action: "branchHistory", branch, from, to });
    hide("perfSpin");

    if (!Array.isArray(data) || data.length === 0) {
      byId("perfBody").innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--t4)">No data found for this branch and month</td></tr>';
      byId("perfHead").innerHTML = "";
      byId("perfSummary").innerHTML = "";
      show("perfOut");
      return;
    }

    // branchHistory rows don't carry monthly target — inject from BRANCHES cache
    const branchMeta = BRANCHES.find(b => b.branch === branch) || {};
    const inTarget   = branchMeta.investment || 0;
    const rdTarget   = branchMeta.rd         || 0;
    const enriched   = data.map(r => ({ ...r, in_target: inTarget, rd_target: rdTarget }));

    buildPerfSummary(enriched, product, branch);
    buildPerfTable(enriched, product);
    show("perfOut");
  } catch(err) {
    hide("perfSpin");
    toast("Error: " + err.message, "err");
  }
}

function buildPerfSummary(data, product, branch) {
  // Compute totals
  let totInCom=0,totInAch=0,totRdCom=0,totRdAch=0,hitDays=0;
  const submitted = data.filter(r => r.in_ach !== "" || r.rd_ach !== "");

  data.forEach(r => {
    if (r.in_com !== "") totInCom += Number(r.in_com);
    if (r.in_ach !== "") totInAch += Number(r.in_ach);
    if (r.rd_com !== "") totRdCom += Number(r.rd_com);
    if (r.rd_ach !== "") totRdAch += Number(r.rd_ach);

    // Count day as "hit" if achievement >= commitment on the selected product
    const checkIn = product !== "rd";
    const checkRd = product !== "investment";
    let hit = true;
    if (checkIn && r.in_com !== "" && r.in_ach !== "") hit = hit && Number(r.in_ach) >= Number(r.in_com);
    if (checkRd && r.rd_com !== "" && r.rd_ach !== "") hit = hit && Number(r.rd_ach) >= Number(r.rd_com);
    if ((r.in_ach !== "" || r.rd_ach !== "") && hit) hitDays++;
  });

  const hitRate = submitted.length > 0 ? Math.round(hitDays / submitted.length * 100) : 0;

  // Choose tiles by product
  let tiles = "";
  if (product !== "rd") {
    const pct = totInCom > 0 ? Math.round(totInAch/totInCom*100) : 0;
    const cls = pct >= 100 ? "green" : pct >= 70 ? "amber" : "red";
    tiles += `<div class="perf-tile blue"><div class="pt-lbl">Total Investment Commitment</div><div class="pt-val">${fmt(totInCom)}</div></div>`;
    tiles += `<div class="perf-tile ${cls}"><div class="pt-lbl">Total Investment Achievement</div><div class="pt-val">${fmt(totInAch)}</div><div class="pt-sub">${pct}% of commitment</div><div class="hit-bar-wrap"><div class="hit-bar" style="width:${Math.min(pct,100)}%"></div></div></div>`;
  }
  if (product !== "investment") {
    const pct = totRdCom > 0 ? Math.round(totRdAch/totRdCom*100) : 0;
    const cls = pct >= 100 ? "green" : pct >= 70 ? "amber" : "red";
    tiles += `<div class="perf-tile blue"><div class="pt-lbl">Total RD Commitment</div><div class="pt-val">${fmt(totRdCom)}</div></div>`;
    tiles += `<div class="perf-tile ${cls}"><div class="pt-lbl">Total RD Achievement</div><div class="pt-val">${fmt(totRdAch)}</div><div class="pt-sub">${pct}% of commitment</div><div class="hit-bar-wrap"><div class="hit-bar" style="width:${Math.min(pct,100)}%"></div></div></div>`;
  }
  tiles += `<div class="perf-tile ${hitRate>=80?"green":hitRate>=50?"amber":"red"}"><div class="pt-lbl">Days Target Hit</div><div class="pt-val">${hitDays}/${submitted.length}</div><div class="pt-sub">${hitRate}% hit rate</div></div>`;

  byId("perfSummary").innerHTML = tiles;
}

function buildPerfTable(data, product) {
  const showIn = product !== "rd";
  const showRd = product !== "investment";

  // Header
  let th = "<tr><th>Date</th><th>Day</th>";
  if (showIn) th += '<th class="num">In Target</th><th class="num">In Commit</th><th class="num">In Achievement</th><th class="num">In vs Commit</th>';
  if (showRd) th += '<th class="num">RD Target</th><th class="num">RD Commit</th><th class="num">RD Achievement</th><th class="num">RD vs Commit</th>';
  th += "</tr>";
  byId("perfHead").innerHTML = th;

  // Rows
  let rows = "";
  data.forEach(r => {
    const dt   = new Date(r.date + "T00:00:00");
    const dayN = dt.toLocaleString("en-IN",{weekday:"short"});
    const dateF= dt.toLocaleString("en-IN",{day:"numeric",month:"short"});
    const isSun = dt.getDay() === 0;

    const cellDiff = (ach, com) => {
      if (ach === "" || ach === null) return '<span class="ach-none">—</span>';
      const d = Number(ach) - Number(com);
      const cls = d >= 0 ? "ach-above" : "ach-below";
      return `<span class="${cls}">${d>=0?"+":""}${fmt(d)}</span>`;
    };

    rows += `<tr${isSun?' style="background:#fafafa;color:var(--t4)"':""}>`;
    rows += `<td>${dateF}</td><td>${dayN}</td>`;
    if (showIn) {
      const achCls = r.in_ach !== "" ? (Number(r.in_ach)>=Number(r.in_com||0)?"ach-above":"ach-below") : "ach-none";
      rows += `<td class="num">${fmt(r.in_target||"")}</td>`;
      rows += `<td class="num">${r.in_com!==""?fmt(r.in_com):'<span class="ach-none">—</span>'}</td>`;
      rows += `<td class="num"><span class="${achCls}">${r.in_ach!==""?fmt(r.in_ach):"—"}</span></td>`;
      rows += `<td class="num">${r.in_com!==""&&r.in_ach!==""?cellDiff(r.in_ach,r.in_com):'<span class="ach-none">—</span>'}</td>`;
    }
    if (showRd) {
      const achCls = r.rd_ach !== "" ? (Number(r.rd_ach)>=Number(r.rd_com||0)?"ach-above":"ach-below") : "ach-none";
      rows += `<td class="num">${fmt(r.rd_target||"")}</td>`;
      rows += `<td class="num">${r.rd_com!==""?fmt(r.rd_com):'<span class="ach-none">—</span>'}</td>`;
      rows += `<td class="num"><span class="${achCls}">${r.rd_ach!==""?fmt(r.rd_ach):"—"}</span></td>`;
      rows += `<td class="num">${r.rd_com!==""&&r.rd_ach!==""?cellDiff(r.rd_ach,r.rd_com):'<span class="ach-none">—</span>'}</td>`;
    }
    rows += "</tr>";
  });

  byId("perfBody").innerHTML = rows;
}

// ═══════════════════════════════════════════════════════════
//  2. DRR ANALYSIS — HIGH / LOW RISK
//  API needed: { action:"summaryReport", month }
//  Returns: [{branch, manager, in_target, in_achieved, rd_target, rd_achieved}]
// ═══════════════════════════════════════════════════════════

async function loadDRRReport() {
  const month     = byId("drrMonth").value;
  const product   = byId("drrProduct").value;
  const threshold = Number(byId("drrThreshold").value) || 0;

  if (!month) return toast("Please select a month.", "err");

  hide("drrOut");
  show("drrSpin");

  try {
    const data = await apiFetch({ action: "summaryReport", month });
    hide("drrSpin");

    if (!Array.isArray(data) || data.length === 0) {
      byId("drrHighBody").innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--t4)">No data</td></tr>';
      byId("drrLowBody").innerHTML  = '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--t4)">No data</td></tr>';
      show("drrOut");
      return;
    }

    // Compute remaining working days
    const today   = isoToday();
    const [y, m]  = month.split("-").map(Number);
    const refDate = today.startsWith(month) ? today : month + "-01";
    const { remaining: remDays } = workingDays(y, m, refDate);

    // Compute DRR per branch
    const rows = data.map(r => {
      const tgt = Number(product === "investment" ? r.in_target   : r.rd_target   || 0);
      const ach = Number(product === "investment" ? r.in_achieved : r.rd_achieved || 0);
      const shortfall = Math.max(0, tgt - ach);
      const drr = remDays > 0 ? Math.ceil(shortfall / remDays) : shortfall;
      const pct = tgt > 0 ? Math.round(ach / tgt * 100) : 0;
      return { branch: r.branch, manager: r.manager||"—", tgt, ach, shortfall, drr, pct, remDays };
    }).sort((a,b) => b.drr - a.drr);

    const high = rows.filter(r => r.drr > threshold);
    const low  = rows.filter(r => r.drr <= threshold);
    const maxDRR = rows[0]?.drr || 1;

    const drrHeader = `<tr>
      <th>Branch</th><th>Manager</th>
      <th class="num">${product==="investment"?"Investment":"RD"} Target</th>
      <th class="num">Achieved</th>
      <th class="num">Shortfall</th>
      <th class="num">DRR</th>
      <th class="num">% Done</th>
      <th class="drr-bar-cell">DRR Scale</th>
    </tr>`;

    byId("drrHighHead").innerHTML = drrHeader;
    byId("drrLowHead").innerHTML  = drrHeader;

    const buildDRRRows = (arr, riskLevel) => {
      if (arr.length === 0) return '<tr><td colspan="8" style="text-align:center;padding:16px;color:var(--t4)">None</td></tr>';
      return arr.map(r => {
        const barW = Math.round(Math.min(r.drr / maxDRR * 100, 100));
        const pctCls = r.pct >= 100 ? "ach-above" : r.pct >= 70 ? "" : "ach-below";
        return `<tr>
          <td>${esc(r.branch)}</td>
          <td>${esc(r.manager)}</td>
          <td class="num">${fmt(r.tgt)}</td>
          <td class="num">${fmt(r.ach)}</td>
          <td class="num shortfall-pos">${fmt(r.shortfall)}</td>
          <td class="num" style="font-weight:700">${fmt(r.drr)}</td>
          <td class="num"><span class="${pctCls}">${r.pct}%</span></td>
          <td class="drr-bar-cell">
            <div class="drr-bar-bg"><div class="drr-bar-fill ${riskLevel}" style="width:${barW}%"></div></div>
          </td>
        </tr>`;
      }).join("");
    };

    byId("drrHighBody").innerHTML = buildDRRRows(high, "high");
    byId("drrLowBody").innerHTML  = buildDRRRows(low,  "low");
    show("drrOut");

  } catch(err) {
    hide("drrSpin");
    toast("Error: " + err.message, "err");
  }
}

// ═══════════════════════════════════════════════════════════
//  3. ZERO ACHIEVEMENT TRACKER
//  Uses action:"branchHistory" per branch in parallel, then analyses zero-achievement streaks
// ═══════════════════════════════════════════════════════════

async function loadZeroReport() {
  const month     = byId("zeroMonth").value;
  const product   = byId("zeroProduct").value;
  const threshold = parseInt(byId("zeroThreshold").value) || 2;

  if (!month) return toast("Please select a month.", "err");

  hide("zeroOut");
  show("zeroSpin");

  // Derive from/to date range from the YYYY-MM month string
  const [zYr, zMo] = month.split("-").map(Number);
  const zLastDay   = new Date(zYr, zMo, 0).getDate();
  const zFrom      = month + "-01";
  const zTo        = month + "-" + String(zLastDay).padStart(2, "0");

  try {
    // Fetch all branches in parallel using existing branchHistory action
    const results = await Promise.all(
      BRANCHES.map(b => apiFetch({ action: "branchHistory", branch: b.branch, from: zFrom, to: zTo })
        .then(rows => ({ branch: b.branch, manager: b.manager, rows: Array.isArray(rows) ? rows : [] }))
        .catch(() => ({ branch: b.branch, manager: b.manager, rows: [] }))
      )
    );
    hide("zeroSpin");

    // Rebuild the byBranch structure the rest of the function expects
    const byBranch = {};
    results.forEach(r => {
      byBranch[r.branch] = { manager: r.manager, days: r.rows };
    });

    const hasAnyData = results.some(r => r.rows.length > 0);
    if (!hasAnyData) {
      byId("zeroBody").innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--t4)">No data found for this month</td></tr>';
      byId("zeroBadges").innerHTML = "";
      show("zeroOut");
      return;
    }

    // Sort days by date for each branch (already sorted by API but ensure it)
    Object.values(byBranch).forEach(b => b.days.sort((a,z) => a.date.localeCompare(z.date)));

    const isZero = (r) => {
      if (product === "investment") return Number(r.in_ach||0) === 0;
      if (product === "rd")         return Number(r.rd_ach||0) === 0;
      // both: either one is zero
      return Number(r.in_ach||0) === 0 || Number(r.rd_ach||0) === 0;
    };

    // Compute stats per branch
    const branchStats = Object.entries(byBranch).map(([branch, info]) => {
      const days = info.days;
      let zeroDays = 0, maxStreak = 0, curStreak = 0;
      let streakStart = null, longestStreakDates = [];
      let tempStart = null;

      days.forEach(r => {
        if (isZero(r)) {
          zeroDays++;
          curStreak++;
          if (!tempStart) tempStart = r.date;
          if (curStreak > maxStreak) {
            maxStreak = curStreak;
            longestStreakDates = [];
            // Walk back to find streak start
            for (let i = days.indexOf(r); i >= 0 && isZero(days[i]); i--) {
              longestStreakDates.unshift(days[i].date);
            }
          }
        } else {
          curStreak = 0;
          tempStart = null;
        }
      });

      return {
        branch,
        manager: info.manager,
        totalDays: days.length,
        zeroDays,
        maxStreak,
        streakDates: longestStreakDates,
        breachesThreshold: maxStreak >= threshold
      };
    });

    // Sort: breaching threshold first, then by maxStreak desc
    branchStats.sort((a,b) => {
      if (b.breachesThreshold !== a.breachesThreshold) return b.breachesThreshold - a.breachesThreshold;
      return b.maxStreak - a.maxStreak;
    });

    // Alert badges for branches breaching threshold
    const alertBranches = branchStats.filter(b => b.breachesThreshold);
    if (alertBranches.length > 0) {
      const badges = alertBranches.map(b =>
        `<div class="zero-badge">
          <div class="zb-name">${esc(b.branch)}</div>
          <div class="zb-days">${b.maxStreak}</div>
          <div class="zb-sub">consecutive zero days</div>
        </div>`
      ).join("");
      byId("zeroBadges").innerHTML = `
        <div class="r-section-label" style="color:var(--red);margin-bottom:8px">⚠️ Branches Exceeding ${threshold}-Day Zero Threshold</div>
        <div class="zero-badge-grid">${badges}</div>`;
    } else {
      byId("zeroBadges").innerHTML = `<div style="background:var(--green-lt);border:1px solid #6ee7b7;border-radius:8px;padding:12px 16px;color:var(--green);font-weight:600;font-size:13px">✅ No branches have ${threshold}+ consecutive zero days this month.</div>`;
    }

    // Table rows
    const rows = branchStats.map(b => {
      const statusCls = b.breachesThreshold ? "alert" : b.maxStreak >= Math.max(1,threshold-1) ? "warn" : "ok";
      const statusLbl = b.breachesThreshold ? "Alert" : b.maxStreak > 0 ? "Watch" : "OK";
      const streakLabel = b.streakDates.length > 0
        ? b.streakDates.map(d => {
            const dt = new Date(d+"T00:00:00");
            return dt.toLocaleString("en-IN",{day:"numeric",month:"short"});
          }).join(" → ")
        : "—";
      return `<tr>
        <td>${esc(b.branch)}</td>
        <td>${esc(b.manager)}</td>
        <td class="num">${b.totalDays}</td>
        <td class="num" style="${b.zeroDays>0?"color:var(--red);font-weight:600":""}">${b.zeroDays}</td>
        <td class="num" style="${b.maxStreak>=threshold?"color:var(--red);font-weight:700":""}">${b.maxStreak}</td>
        <td><span class="zero-streak">${streakLabel}</span></td>
        <td><span class="status-pill ${statusCls}">${statusLbl}</span></td>
      </tr>`;
    }).join("");

    byId("zeroBody").innerHTML = rows;
    show("zeroOut");

  } catch(err) {
    hide("zeroSpin");
    toast("Error: " + err.message, "err");
  }
}
// ═══════════════════════════════════════════════════════════
//  4. DRR VS COMMITMENT
//  Compares per-branch DRR (from branchInfo) against actual
//  commitment (from dayReport) for a single date or averaged
//  across a date range.
// ═══════════════════════════════════════════════════════════

function dvcModeChanged() {
  const mode = byId("dvcMode").value;
  if (mode === "single") {
    show("dvcSingleRow");
    hide("dvcRangeRow");
  } else {
    hide("dvcSingleRow");
    show("dvcRangeRow");
  }
  hide("dvcOut");
}

async function loadDRRvsCommitReport() {
  const mode = byId("dvcMode").value;

  // Build list of dates to process
  let dates = [];
  if (mode === "single") {
    const d = byId("dvcDate").value;
    if (!d) return toast("Please select a date.", "err");
    dates = [d];
  } else {
    const from = byId("dvcFrom").value;
    const to   = byId("dvcTo").value;
    if (!from || !to)  return toast("Please select From and To dates.", "err");
    if (from > to)     return toast("From date must be before To date.", "err");
    // Build array of every date in range
    let cur = new Date(from + "T00:00:00");
    const end = new Date(to  + "T00:00:00");
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
  }

  hide("dvcOut");
  show("dvcSpin");

  try {
    // ── Step 1: fetch dayReport for each date to get commitments ──
    // For single date: one call. For range: one call per date in parallel.
    const dayReports = await Promise.all(
      dates.map(d =>
        apiFetch({ action: "dayReport", date: d })
          .then(rows => ({ date: d, rows: Array.isArray(rows) ? rows : [] }))
          .catch(() => ({ date: d, rows: [] }))
      )
    );

    // ── Step 2: fetch branchInfo per branch per date for DRR ──
    // branchInfo returns rem_in, rem_rd, drr_in, drr_rd
    const drrResults = await Promise.all(
      BRANCHES.map(b =>
        Promise.all(
          dates.map(d =>
            apiFetch({ action: "branchInfo", branch: b.branch, date: d })
              .then(info => ({ date: d, drr_in: Number(info.drr_in || 0), drr_rd: Number(info.drr_rd || 0) }))
              .catch(() => ({ date: d, drr_in: 0, drr_rd: 0 }))
          )
        ).then(dayInfos => ({ branch: b.branch, dayInfos }))
      )
    );

    hide("dvcSpin");

    // ── Step 3: aggregate per branch ──
    // Build a lookup: branch → { sum_drr_in, sum_drr_rd, sum_com_in, sum_com_rd, count }
    const agg = {};
    BRANCHES.forEach(b => {
      agg[b.branch] = { sumDrrIn: 0, sumDrrRd: 0, sumComIn: 0, sumComRd: 0, count: 0 };
    });

    // Accumulate DRR sums from branchInfo
    drrResults.forEach(({ branch, dayInfos }) => {
      if (!agg[branch]) return;
      dayInfos.forEach(({ drr_in, drr_rd }) => {
        agg[branch].sumDrrIn += drr_in;
        agg[branch].sumDrrRd += drr_rd;
        agg[branch].count++;
      });
    });

    // Accumulate commitment sums from dayReport rows
    dayReports.forEach(({ rows }) => {
      rows.forEach(r => {
        if (!agg[r.branch]) return;
        if (r.in_com !== "") agg[r.branch].sumComIn += Number(r.in_com);
        if (r.rd_com !== "") agg[r.branch].sumComRd += Number(r.rd_com);
      });
    });

    // ── Step 4: build table rows ──
    const totalDates = dates.length;
    let tableRows = "";

    BRANCHES.forEach(b => {
      const a = agg[b.branch];
      if (!a) return;

      // Average DRR across days; sum commitment across days
      const drrIn = a.count > 0 ? Math.round(a.sumDrrIn / a.count) : 0;
      const drrRd = a.count > 0 ? Math.round(a.sumDrrRd / a.count) : 0;
      const comIn = a.sumComIn;
      const comRd = a.sumComRd;

      // For fair comparison on range: compare total commitment vs (avg DRR × number of days)
      const drrInTotal = drrIn * totalDates;
      const drrRdTotal = drrRd * totalDates;

      const diffIn = comIn - drrInTotal;
      const diffRd = comRd - drrRdTotal;
      const pctIn  = drrInTotal > 0 ? Math.round(comIn / drrInTotal * 100) : null;
      const pctRd  = drrRdTotal > 0 ? Math.round(comRd / drrRdTotal * 100) : null;

      const diffCls = d => d >= 0 ? "ach-above" : "ach-below";
      const pctCls  = p => p === null ? "" : p >= 100 ? "ach-above" : p >= 70 ? "" : "ach-below";
      const fmtPct  = p => p === null ? '<span class="ach-none">—</span>' : `<span class="${pctCls(p)}">${p}%</span>`;
      const fmtDiff = d => `<span class="${diffCls(d)}">${d >= 0 ? "+" : ""}${fmt(d)}</span>`;

      tableRows += `<tr>
        <td>${esc(b.branch)}</td>
        <td class="num">${fmt(drrIn)}</td>
        <td class="num">${fmt(drrRd)}</td>
        <td class="num">${fmt(comIn)}</td>
        <td class="num">${fmt(comRd)}</td>
        <td class="num">${fmtDiff(diffIn)}</td>
        <td class="num">${fmtDiff(diffRd)}</td>
        <td class="num">${fmtPct(pctIn)}</td>
        <td class="num">${fmtPct(pctRd)}</td>
      </tr>`;
    });

    byId("dvcBody").innerHTML = tableRows ||
      '<tr><td colspan="9" style="text-align:center;padding:24px;color:var(--t4)">No data found for this period</td></tr>';
    show("dvcOut");

  } catch(err) {
    hide("dvcSpin");
    toast("Error: " + err.message, "err");
  }
}
