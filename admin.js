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
  adminAddMember,
  moveMember,
  adminReportAbsence,
  adminSetTeamName,
  rebuildGroupCounts
} from "./firebase-db.js";
import { isLocked, EVENT, GROUP_CAPACITY, GROUPS, ADMIN_EMAILS, ABSENCE_REASONS, toCompanyEmail, sameAccount } from "./event-config.js";

let groupData = {};
let joins = [];
let absences = [];
let unsubscribers = [];
let currentUser = null;
let busy = false;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const accountOf = (email) => String(email || "").split("@")[0];
const fmtTime = (ts) => (ts?.toDate ? ts.toDate().toLocaleString("zh-TW", { hour12: false }) : "");
const byTime = (a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);

document.addEventListener("DOMContentLoaded", () => {
  $("#admin-event").textContent = `${EVENT.name}｜${EVENT.date} ${EVENT.time}`;
  $$(".group-cap").forEach((el) => { el.textContent = GROUP_CAPACITY; });
  $("#aa-type").innerHTML = ABSENCE_REASONS.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
  renderLockNote();

  onAuthChange((user) => {
    currentUser = user;
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
  $("#admin-absence-form").addEventListener("submit", handleAdminAbsence);
});

function renderLockNote() {
  const el = $("#lock-note");
  const locked = isLocked();
  el.classList.toggle("lock-open", !locked);
  el.textContent = locked
    ? `報名已於 ${EVENT.replyDeadline}截止，同仁現在不能自己修改。需要調整請在這裡處理。`
    : `報名截止日是 ${EVENT.replyDeadline}，之後同仁就不能自己修改，只能由管理員在這裡調整。`;
}

const ERROR_TEXT = {
  FULL: "這組已經滿了。",
  MEMBER_TAKEN: "這位同仁已經在其他組了，請用「換到」調整。",
  NOT_READY: "組別還沒建立，請先到「設定」按一次「建立組別並重新計算」。",
  NOT_FOUND: "找不到這位同仁的選組資料，請重新整理。"
};

async function run(task, okMsg) {
  if (busy) return false;
  busy = true;
  try {
    await task();
    showToast(okMsg);
    return true;
  } catch (err) {
    console.error(err);
    showToast(ERROR_TEXT[err.message] || "操作失敗，請確認 Firebase 安全規則已更新，再試一次。", true);
    return false;
  } finally {
    busy = false;
  }
}

/** 輸入的帳號轉成公司信箱；格式不對回傳空字串 */
const toEmail = toCompanyEmail;
const BAD_ACCOUNT = "帳號格式不對，請輸入信箱 @ 前面；@easymap.tw 的同仁請打完整信箱。";

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
  // 重畫前記住輸入框內容，避免名單更新時打到一半的字被清掉
  const drafts = {};
  $$("#admin-groups input").forEach((input) => { drafts[input.name] = input.value; });

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
            <li class="admin-member">
              <span>${esc(m.displayName || accountOf(m.email))}
                <small class="muted">${esc(accountOf(m.email))}${m.addedBy && m.addedBy !== m.email ? `・${esc(accountOf(m.addedBy))} 代報` : ""}</small>
              </span>
              <span class="admin-member-tools">
                <select class="sel-move" data-email="${esc(m.email)}" aria-label="把 ${esc(accountOf(m.email))} 換到別組">
                  <option value="">換到…</option>
                  ${GROUPS.filter((x) => x.id !== g.id).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}
                </select>
                <button class="btn-text btn-del-join" data-email="${esc(m.email)}">刪除</button>
              </span>
            </li>`).join("") : `<li class="muted">還沒有人</li>`}
        </ul>
        <form class="inline-form admin-team-form" data-group="${g.id}">
          <label for="at-${g.id}">改隊名</label>
          <div class="inline-row">
            <input id="at-${g.id}" name="at-${g.id}" type="text" maxlength="20" placeholder="清空後儲存就是刪除隊名" value="${esc(teamName)}" />
            <button type="submit" class="btn-outline">儲存</button>
          </div>
        </form>
        ${members.length < GROUP_CAPACITY ? `
        <form class="inline-form admin-add-form" data-group="${g.id}">
          <label for="aj-${g.id}">加人（輸入信箱 @ 前面）</label>
          <div class="inline-row">
            <input id="aj-${g.id}" name="aj-${g.id}" type="text" placeholder="例如 yoyoshen 或完整信箱" autocomplete="off" autocapitalize="off" spellcheck="false" />
            <button type="submit" class="btn-primary">加入</button>
          </div>
        </form>` : `<p class="muted small">這組已經滿了。</p>`}
      </div>`;
  }).join("");

  $$("#admin-groups input").forEach((input) => { if (input.name in drafts) input.value = drafts[input.name]; });

  $$(".sel-move").forEach((sel) => sel.addEventListener("change", async () => {
    const to = sel.value;
    if (!to) return;
    const toName = GROUPS.find((x) => x.id === to)?.name || "";
    if (!confirm(`確定要把 ${accountOf(sel.dataset.email)} 換到${toName}嗎？`)) { sel.value = ""; return; }
    const ok = await run(() => moveMember(sel.dataset.email, to, GROUP_CAPACITY), `已換到${toName}。`);
    if (!ok) sel.value = "";
  }));

  $$(".admin-team-form").forEach((form) => form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = form.querySelector("input").value.trim().slice(0, 20);
    await run(() => adminSetTeamName(currentUser, form.dataset.group, name), name ? "隊名已更新。" : "隊名已清除。");
  }));

  $$(".admin-add-form").forEach((form) => form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = form.querySelector("input");
    const email = toEmail(input.value);
    if (!email) { showToast(BAD_ACCOUNT, true); return; }
    // 新舊信箱 @ 前面一樣，視為同一個人
    const existing = joins.find((j) => sameAccount(j.email, email));
    if (existing) {
      const gName = GROUPS.find((x) => x.id === existing.groupId)?.name || "其他組";
      showToast(`${accountOf(email)} 已經在${gName}了，請用「換到」調整。`, true);
      return;
    }
    if (absences.some((a) => sameAccount(a.email, email)) &&
      !confirm(`${accountOf(email)} 回報過不能參加，加入後會刪掉這筆回報，確定嗎？`)) return;
    const ok = await run(() => adminAddMember(currentUser, email, form.dataset.group, GROUP_CAPACITY), `已把 ${accountOf(email)} 加進來。`);
    // 名單更新時卡片會重畫，要找新的輸入框來清空
    if (ok) { const fresh = $(`#aj-${form.dataset.group}`); if (fresh) fresh.value = ""; }
  }));

  $$(".btn-del-join").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm(`確定要把 ${accountOf(btn.dataset.email)} 移出組別嗎？`)) return;
    await run(() => removeMember(btn.dataset.email), "已移出。");
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
      <td><button class="btn-text btn-del-absence" data-email="${esc(a.email)}">改成可以參加</button></td>
    </tr>`).join("");

  $$(".btn-del-absence").forEach((btn) => btn.addEventListener("click", async () => {
    if (!confirm(`確定要刪除 ${accountOf(btn.dataset.email)} 的回報嗎？刪除後他還沒有組別，記得到「分組名單」幫他加進一組。`)) return;
    await run(() => withdrawAbsence(btn.dataset.email), "已刪除回報。");
  }));
}

async function handleAdminAbsence(e) {
  e.preventDefault();
  const email = toEmail($("#aa-account").value);
  if (!email) { showToast(BAD_ACCOUNT, true); return; }
  const reasonType = $("#aa-type").value;
  const reasonNote = $("#aa-note").value.trim().slice(0, 200);
  const join = joins.find((j) => sameAccount(j.email, email));
  if (join) {
    const gName = GROUPS.find((x) => x.id === join.groupId)?.name || "";
    if (!confirm(`${accountOf(email)} 目前在${gName}，登記後會移出組別，確定嗎？`)) return;
  }
  const ok = await run(() => adminReportAbsence(email, reasonType, reasonNote), `已登記 ${accountOf(email)} 不能參加。`);
  if (ok) { $("#aa-account").value = ""; $("#aa-note").value = ""; }
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
