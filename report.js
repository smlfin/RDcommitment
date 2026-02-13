const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwlm0vWQ8PWfhikA93gYimNDBjSIWgNVc3JS71hvTyEsT8HngKB00nHChpB-D_Gkj8BkQ/exec";

/* ---------- Elements ---------- */
const dayDate   = document.getElementById("dayDate");
const dayBody   = document.getElementById("dayBody");
const dayStatus = document.getElementById("dayStatus");

const histBranch = document.getElementById("histBranch");
const fromDate   = document.getElementById("fromDate");
const toDate     = document.getElementById("toDate");
const histBody   = document.getElementById("histBody");
const histStatus = document.getElementById("histStatus");

/* ---------- Defaults ---------- */
const today = new Date().toISOString().slice(0,10);
dayDate.value = today;
fromDate.value = today;
toDate.value = today;

/* ---------- Load Branch List ---------- */
fetch(`${SCRIPT_URL}?action=branches`)
  .then(r => r.json())
  .then(list => {
    histBranch.innerHTML = '<option value="ALL">-- All Branches --</option>';
    list.forEach(b => histBranch.add(new Option(b, b)));
  })
  .catch(err => console.error("Branches load failed", err));

/* ---------- Day Report (All Branches) ---------- */
function loadTodayReport(){
  dayDate.value = today;
  loadDayReport();
}

function loadDayReport(){
  dayBody.innerHTML = "";
  dayStatus.innerText = "Loading day report...";

  const url = `${SCRIPT_URL}?action=dayReport&date=${encodeURIComponent(dayDate.value)}`;

  fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(list => {
      if (!Array.isArray(list) || list.length === 0){
        dayStatus.innerText = "No commitment entries found for this date";
        return;
      }

      dayStatus.innerText = "";
      // Sort by branch name (optional but nicer)
      list.sort((a,b) => a.branch.localeCompare(b.branch));

      list.forEach(r => {
        const target      = Number(r.target)      || 0;
        const commitment  = Number(r.commitment)  || 0;
        const achievement = Number(r.achievement) || 0;   // will be 0 if evening not submitted yet

        const statusColor = (achievement > 0 && achievement < commitment) ? "red" :
                            (achievement >= commitment) ? "green" : "#555";

        dayBody.innerHTML += `
          <tr>
            <td>${r.branch || "—"}</td>
            <td>${r.branchHead || "—"}</td>
            <td>${target.toLocaleString()}</td>
            <td>${commitment.toLocaleString()}</td>
            <td style="color: ${statusColor}; font-weight: bold;">
              ${achievement.toLocaleString()}
            </td>
          </tr>`;
      });
    })
    .catch(err => {
      console.error(err);
      dayStatus.innerText = "Error loading report: " + err.message;
    });
}

/* ---------- Branch History ---------- */
function loadBranchHistory(){
  if (!histBranch.value){
    alert("Please select a branch");
    return;
  }

  histBody.innerHTML = "";
  histStatus.innerText = "Loading branch history...";

  const params = new URLSearchParams({
    action: "branchHistory",
    branch: histBranch.value,
    from: fromDate.value,
    to: toDate.value
  });

  fetch(`${SCRIPT_URL}?${params}`)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then(list => {
      if (!Array.isArray(list) || list.length === 0){
        histStatus.innerText = "No data found in selected date range";
        return;
      }

      histStatus.innerText = "";
      // Sort chronologically
      list.sort((a,b) => new Date(a.date) - new Date(b.date));

      let nextDayTarget = Number(list[0].target) || 0;

      list.forEach(r => {
        const currentTarget    = nextDayTarget;
        const rowAchievement   = Number(r.achievement) || 0;
        const currentShortfall = currentTarget - rowAchievement;
        nextDayTarget = currentShortfall;   // carry forward

        const shortfallColor = currentShortfall > 0 ? "red" :
                               currentShortfall < 0 ? "green" : "#555";

        histBody.innerHTML += `
          <tr>
            <td>${r.date || "—"}</td>
            <td>${r.branch || "—"}</td>
            <td>${r.type || "—"}</td>
            <td>${r.branchHead || "—"}</td>
            <td>${currentTarget.toLocaleString()}</td>
            <td>${Number(r.commitment||0).toLocaleString()}</td>
            <td>${rowAchievement.toLocaleString()}</td>
            <td>${Number(r.staff||0).toLocaleString()}</td>
            <td>${Number(r.nonParticipants||0).toLocaleString()}</td>
            <td style="color:${shortfallColor}; font-weight:bold;">
              ${currentShortfall.toLocaleString()}
            </td>
          </tr>`;
      });
    })
    .catch(err => {
      console.error(err);
      histStatus.innerText = "Error loading history: " + err.message;
    });
}

/* ---------- Navigation ---------- */
function goBack(){
  window.location.href = "index.html";
}

// Optional: auto-load today's report on page open
window.addEventListener("load", () => {
  loadDayReport();
});