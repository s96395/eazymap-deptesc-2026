// ======================================================
// admin.js — 管理後台（admin.html 用）
// ======================================================

import {
  normEmail,
  loginWithGoogle,
  logout,
  onAuthChange,
  onGroupsChange,
  onJoinsChange,
  onAllAbsencesChange,
  removeMember,
  withdrawAbsence,
  rebuildGroupCounts
} from "./firebase-db.js";
import { EVENT, GROUP_CAPACITY, GROUPS, ADMIN_EMAILS } from "./event-config.js";

let groupData = {};
let joins = [];
let absences = [];
let unsubscribers = [];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const accountOf = (email) => String(email || "").split("@")[0];
const fmtTime = (ts) => (ts?.toDate ? ts.toDate().toLocaleString("zh-TW", { hour12: false }) : "");
const byTime = (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);

document.addEventListener("DOMContentLoaded", () => {
  $("#admin-event").textContent = `${EVENT.name}｜${EVENT.date} ${EVENT.time}`;
  $$(".group-cap").forEach((el) => { el.textContent = GROUP_CAPACITY; });

  onAuthChange((user) => {
    unsubscribers.forEach((fn) => fn());
    unsubscribers = [];
    groupData = {}; joins = []; absences = [];

    const nameEl = $("#user-name");
    const logoutBtn = $("#btn-logout");
    const show = (id) => ["#section-login", "#section-denied", "#section-admin"]
      .forEach((s) => $(s).classList.toggle("hidden", s !== id));

    if (!user) {
      nameEl.classList.add("hidden");
      logoutBtn.classList.add("hidden");
      show("#section-login");
      return;
    }

    nameEl.textContent = user.displayName || user.email;
    nameEl.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");

    if (!ADMIN_EMAILS.includes(normEmail(user.email))) {
      show("#section-denied");
      return;
    }

    show("#section-admin");
    unsubscribers.push(
      onGroupsChange((data) => { groupData = data; renderAll(); }),
      onJoinsChange((list) => { joins = list; renderAll(); }),
      onAllAbsencesChange((list) => { absences = list; renderAll(); })
    );
  });

  $("#btn-login").addEventListener("click", loginWithGoogle);
  $("#btn-logout").addEventListener("click", logout);
  $$(".tab-btn").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
  $("#btn-export-groups").addEventListener("click", exportGroups);
  $("#btn-export-absent").addEventListener("click", exportAbsences);
  $("#btn-rebuild").addEventListener("click", handleRebuild);
});

function switchTab(tab) {
  $$(".tab-btn").forEach((btn) => btn.classList.toggle("tab-active", btn.dataset.tab === tab));
  ["groups", "absent", "tools"].forEach((t) => $(`#panel-${t}`).classList.toggle("hidden", t !== tab));
}

function renderAll() {
  renderStats();
  renderGroups();
  renderAbsences();
}

function renderStats() {
  const joined = joins.length;
  const absent = absences.length;
  const pending = Math.max(0, EVENT.staffCount - joined - absent);
  const notReady = GROUPS.some((g) => !(g.id in groupData));
  $("#stats").innerHTML = `
    <div class="stat"><span>已選組</span><strong>${joined}</strong></div>
    <div class="stat"><span>不能參加</span><strong>${absent}</strong></div>
    <div class="stat"><span>還沒回覆（約）</span><strong>${pending}</strong></div>
    ${notReady ? `<p class="card warning">組別還沒建立，同仁目前無法選組。請到「設定」按一次「建立組別並重新計算」。</p>` : ""}`;
}

/** 隊名是誰取的：用信箱找組員姓名，找不到就顯示帳號 */
function namerOf(groupId) {
  const email = groupData[groupId]?.teamNameBy;
  if (!email) return "";
  const member = joins.find((j) => j.email === email);
  return member?.displayName || accountOf(email);
}

function renderGroups() {
  $("#admin-groups").innerHTML = GROUPS.map((g) => {
    const members = joins.filter((j) => j.groupId === g.id).sort(byTime);
    const teamName = groupData[g.id]?.teamName || "";
    const count = groupData[g.id]?.count ?? 0;
    const mismatch = (g.id in groupData) && count !== members.length;
    return `
      <div class="card group-card">
        <div class="group-head">
          <h3>${esc(g.name)}</h3>
          <span class="group-count">${members.length} / ${GROUP_CAPACITY}</span>
        </div>
        <p class="team-name ${teamName ? "" : "team-name-empty"}">${teamName ? `${esc(teamName)}<small class="team-namer">${esc(namerOf(g.id))} 取的</small>` : "還沒取隊名"}</p>
        ${mismatch ? `<p class="small warning-text">人數紀錄是 ${count}，跟名單對不起來，請到「設定」重新計算。</p>` : ""}
        <ul class="member-list">
          ${members.length ? members.map((m) => `
            <li>
              <span>${esc(m.displayName || accountOf(m.email))}
                <small class="muted">${esc(accountOf(m.email))}${m.addedBy && m.addedBy !== m.email ? `・${esc(accountOf(m.addedBy))} 代報` : ""}</small>
              </span>
              <button class="btn-text btn-del-join" data-email="${esc(m.email)}">刪除</button>
            </li>`).join("") : `<li class="muted">還沒有人</li>`}
        </ul>
      </div>`;
  }).join("");

  $$(".btn-del-join").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm(`確定要把 ${accountOf(btn.dataset.email)} 移出組別嗎？`)) return;
    try { await removeMember(btn.dataset.email); showToast("已移出。"); }
    catch (err) { console.error(err); showToast("操作失敗，請稍後再試。", true); }
  }));
}

function renderAbsences() {
  const tbody = $("#absent-body");
  if (!absences.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted center">目前沒有人回報不能參加。</td></tr>`;
    return;
  }
  tbody.innerHTML = [...absences].sort(byTime).map((a) => `
    <tr>
      <td>${esc(a.displayName || "")}</td>
      <td>${esc(accountOf(a.email))}</td>
      <td>${esc(a.reasonType)}</td>
      <td>${esc(a.reasonNote || "")}</td>
      <td>${esc(fmtTime(a.updatedAt || a.createdAt))}</td>
      <td><button class="btn-text btn-del-absence" data-email="${esc(a.email)}">刪除</button></td>
    </tr>`).join("");

  $$(".btn-del-absence").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm(`確定要刪除 ${accountOf(btn.dataset.email)} 的回報嗎？`)) return;
    try { await withdrawAbsence(btn.dataset.email); showToast("已刪除。"); }
    catch (err) { console.error(err); showToast("操作失敗，請稍後再試。", true); }
  }));
}

async function handleRebuild() {
  if (!confirm("要依目前名單重新計算各組人數嗎？")) return;
  try {
    await rebuildGroupCounts(GROUPS.map((g) => g.id));
    showToast("完成，各組已開放報名。");
  } catch (err) {
    console.error(err);
    showToast("操作失敗，請確認是否用管理員帳號登入。", true);
  }
}

// ---- 匯出 CSV ----

function downloadCSV(filename, header, rows) {
  const line = (cols) => cols.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(",");
  const csv = "﻿" + [line(header), ...rows.map(line)].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function today() {
  return new Date().toLocaleDateString("zh-TW").replaceAll("/", "-");
}

function exportGroups() {
  const rows = [];
  GROUPS.forEach((g) => {
    joins.filter((j) => j.groupId === g.id).sort(byTime).forEach((m) => {
      rows.push([
        g.name,
        groupData[g.id]?.teamName || "",
        groupData[g.id]?.teamName ? namerOf(g.id) : "",
        m.displayName || "",
        m.email,
        m.addedBy && m.addedBy !== m.email ? accountOf(m.addedBy) : "",
        fmtTime(m.createdAt)
      ]);
    });
  });
  downloadCSV(`野餐日分組名單_${today()}.csv`, ["組別", "隊名", "隊名取名人", "姓名", "信箱", "代報人", "報名時間"], rows);
}

function exportAbsences() {
  const rows = [...absences].sort(byTime).map((a) => [
    a.displayName || "", a.email, a.reasonType, a.reasonNote || "", fmtTime(a.updatedAt || a.createdAt)
  ]);
  downloadCSV(`野餐日不能參加名單_${today()}.csv`, ["姓名", "信箱", "原因", "說明", "回報時間"], rows);
}

function showToast(msg, isError = false) {
  $("#toast")?.remove();
  const toast = document.createElement("div");
  toast.id = "toast";
  toast.setAttribute("role", isError ? "alert" : "status");
  toast.className = `toast ${isError ? "toast-error" : "toast-success"}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("toast-show"), 10);
  setTimeout(() => { toast.classList.remove("toast-show"); setTimeout(() => toast.remove(), 300); }, isError ? 5000 : 3000);
}
