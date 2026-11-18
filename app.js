// ======================================================
// app.js — 報名前台（index.html 用）
// ======================================================

import {
  normEmail,
  loginWithGoogle,
  logout,
  onAuthChange,
  onGroupsChange,
  onJoinsChange,
  onMyAbsenceChange,
  addMember,
  removeMember,
  setTeamName,
  updateMyDisplayName,
  reportAbsence,
  withdrawAbsence
} from "./firebase-db.js";
import {
  isLocked, EVENT, GROUP_CAPACITY, GROUPS, AGENDA, BRING_ITEMS, PROVIDED_ITEMS, ABSENCE_REASONS, EMAIL_DOMAIN
} from "./event-config.js";

let currentUser = null;
let myEmail = "";
let groupData = {};
let joins = [];
let myAbsence = null;
let unsubscribers = [];
let busy = false;
let nameSynced = false;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const accountOf = (email) => String(email || "").split("@")[0];

document.addEventListener("DOMContentLoaded", () => {
  renderEventInfo();

  onAuthChange((user) => {
    currentUser = user;
    myEmail = user ? normEmail(user.email) : "";
    nameSynced = false;
    unsubscribers.forEach((fn) => fn());
    unsubscribers = [];

    const nameEl = $("#user-name");
    const logoutBtn = $("#btn-logout");

    if (user) {
      nameEl.textContent = user.displayName || user.email;
      nameEl.classList.remove("hidden");
      logoutBtn.classList.remove("hidden");
      $("#section-login").classList.add("hidden");
      $("#section-main").classList.remove("hidden");
      $("#domain-warning").classList.toggle("hidden", myEmail.endsWith(`@${EMAIL_DOMAIN}`));

      unsubscribers.push(
        onGroupsChange((data) => { groupData = data; render(); }),
        onJoinsChange((list) => { joins = list; render(); syncMyName(); }),
        onMyAbsenceChange(myEmail, (absence) => { myAbsence = absence; render(); })
      );
    } else {
      groupData = {};
      joins = [];
      myAbsence = null;
      nameEl.classList.add("hidden");
      logoutBtn.classList.add("hidden");
      $("#section-login").classList.remove("hidden");
      $("#section-main").classList.add("hidden");
    }
  });

  // 按登入後直接捲到「我的狀態」，不用自己往下找
  $("#btn-login").addEventListener("click", async () => {
    try {
      await loginWithGoogle();
      setTimeout(() => $("#my-status")?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    } catch (err) { console.error(err); }
  });
  $("#btn-logout").addEventListener("click", logout);
  $("#absence-form").addEventListener("submit", handleAbsenceSubmit);
  $("#btn-absence-cancel").addEventListener("click", () => toggleAbsenceForm(false));

  // 頁面開著跨過截止時間時，自動切成截止畫面
  const msLeft = new Date(EVENT.lockAt).getTime() - Date.now();
  if (msLeft > 0 && msLeft < 2 ** 31 - 1) setTimeout(() => { applyLockNotice(); render(); }, msLeft + 1000);
  applyLockNotice();
});

/** 截止後把首頁提醒和選組說明換成截止的文字 */
function applyLockNotice() {
  if (!isLocked()) return;
  $("#deadline-text").innerHTML = `報名已於 <strong>${esc(EVENT.replyDeadline)}</strong>截止，現在不能再自己選組或修改。<br class="br-wide" />名單需要調整的話，請聯絡福委會。`;
  $("#groups-title").textContent = "分組名單";
  $("#groups-note").textContent = "報名已截止，以下是最後的分組名單。需要調整請聯絡福委會。";
  toggleAbsenceForm(false);
}

// ---- 活動資訊 ----

function renderEventInfo() {
  $("#event-name").textContent = EVENT.name;
  // 標語裡的「易」「圖」跟簡報一樣用色塊標出來
  $("#event-slogan").innerHTML = esc(EVENT.slogan)
    .replace(/^易/, `<b class="hl">易</b>`)
    .replace("，圖", `，<b class="hl">圖</b>`);
  $("#event-people").textContent = EVENT.people;
  $("#event-date").textContent = EVENT.date;
  $("#event-time").textContent = EVENT.time;
  $("#event-place").textContent = EVENT.place;
  $$(".group-cap").forEach((el) => { el.textContent = GROUP_CAPACITY; });
  $$(".reply-deadline").forEach((el) => { el.textContent = EVENT.replyDeadline; });
  $$(".email-domain").forEach((el) => { el.textContent = `@${EMAIL_DOMAIN}`; });

  $("#agenda").innerHTML = AGENDA.map((a) => `
    <li><strong>${esc(a.title)}</strong>${a.note ? `<span>${esc(a.note)}</span>` : ""}</li>`).join("");
  $("#bring-items").innerHTML = BRING_ITEMS.map((i) => `<li>${esc(i)}</li>`).join("");
  $("#provided-items").innerHTML = PROVIDED_ITEMS.map((i) => `<li>${esc(i)}</li>`).join("");
  $("#absence-type").innerHTML = ABSENCE_REASONS.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
}

// ---- 畫面 ----

/** 隊名是誰取的：用信箱找組員姓名，找不到就顯示帳號 */
function namerOf(groupId) {
  const email = groupData[groupId]?.teamNameBy;
  if (!email) return "";
  const member = joins.find((j) => j.email === email);
  return member?.displayName || accountOf(email);
}


function myJoin() {
  return joins.find((j) => j.email === myEmail) || null;
}

/** 被隊長代報的人，名單上原本只有帳號，本人登入後換成真實姓名 */
async function syncMyName() {
  const join = myJoin();
  if (nameSynced || !join || !currentUser?.displayName) return;
  nameSynced = true;
  if (join.displayName === currentUser.displayName) return;
  try { await updateMyDisplayName(currentUser); } catch (err) { console.error(err); }
}

function render() {
  if (!currentUser) return;
  renderStatus();
  renderGroups();
}

function renderStatus() {
  const el = $("#my-status");
  const join = myJoin();
  const locked = isLocked();
  const lockNote = `<p class="muted">報名已截止，要調整請聯絡福委會。</p>`;

  if (join) {
    const group = GROUPS.find((g) => g.id === join.groupId);
    const teamName = groupData[join.groupId]?.teamName;
    const byOther = join.addedBy && join.addedBy !== myEmail;
    el.className = "card status-card status-joined";
    el.innerHTML = `
      <div>
        <p class="status-label">我的狀態</p>
        <p class="status-main">已加入 <strong>${esc(group?.name || join.groupId)}</strong>${teamName ? `「${esc(teamName)}」` : ""}</p>
        <p class="muted">${byOther ? `由 ${esc(join.addedByName || accountOf(join.addedBy))} 幫你報名。` : ""}當天記得帶筆、野餐墊和想吃的東西。</p>
        ${locked ? lockNote : ""}
      </div>
      ${locked ? "" : `<div class="status-actions">
        <button id="btn-leave" class="btn-outline">退出這組</button>
      </div>`}`;
    $("#btn-leave")?.addEventListener("click", () => handleRemove(myEmail, true));
    toggleAbsenceForm(false);
    return;
  }

  if (myAbsence) {
    el.className = "card status-card status-absent";
    el.innerHTML = `
      <div>
        <p class="status-label">我的狀態</p>
        <p class="status-main">已回報不能參加</p>
        <p class="muted">原因：${esc(myAbsence.reasonType)}${myAbsence.reasonNote ? `（${esc(myAbsence.reasonNote)}）` : ""}</p>
        ${locked ? lockNote : ""}
      </div>
      ${locked ? "" : `<div class="status-actions">
        <button id="btn-edit-absence" class="btn-outline">修改原因</button>
        <button id="btn-withdraw" class="btn-primary">改成可以參加</button>
      </div>`}`;
    $("#btn-edit-absence")?.addEventListener("click", () => toggleAbsenceForm(true));
    $("#btn-withdraw")?.addEventListener("click", handleWithdraw);
    return;
  }

  if (locked) {
    el.className = "card status-card";
    el.innerHTML = `
      <div>
        <p class="status-label">我的狀態</p>
        <p class="status-main">沒有選組，也沒有回報不能參加</p>
        <p class="muted">報名已截止，請聯絡福委會幫你安排組別或登記不能參加。</p>
      </div>`;
    return;
  }

  el.className = "card status-card";
  el.innerHTML = `
    <div>
      <p class="status-label">我的狀態</p>
      <p class="status-main">還沒選組</p>
      <p class="muted">請在 ${esc(EVENT.replyDeadline)}前從下方挑一組加入；當天不能來的話，也請在這天前回報。</p>
    </div>
    <div class="status-actions">
      <button id="btn-go-groups" class="btn-primary btn-go">去選組</button>
      <button id="btn-open-absence" class="btn-outline btn-go">我不能參加</button>
    </div>`;
  $("#btn-go-groups").addEventListener("click", () => $("#groups-head").scrollIntoView({ behavior: "smooth", block: "start" }));
  $("#btn-open-absence").addEventListener("click", () => toggleAbsenceForm(true));
}

function renderGroups() {
  const container = $("#group-cards");
  const join = myJoin();
  const locked = isLocked();

  // 重畫前記住輸入框內容，避免別人報名時打到一半的字被清掉
  const drafts = {};
  $$(".group-card input").forEach((input) => { drafts[input.name] = input.value; });
  const focusedName = document.activeElement?.closest?.(".group-card") ? document.activeElement.name : null;

  container.innerHTML = GROUPS.map((g) => {
    const members = joins
      .filter((j) => j.groupId === g.id)
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    const count = groupData[g.id]?.count ?? members.length;
    const teamName = groupData[g.id]?.teamName || "";
    const remaining = Math.max(0, GROUP_CAPACITY - count);
    const isMine = join?.groupId === g.id;
    const full = remaining === 0;

    // 已經有組的人，其他組卡片就不放按鈕，畫面比較乾淨
    let action = "";
    if (join || locked) action = "";
    else if (myAbsence) action = `<span class="badge">已回報不能參加</span>`;
    else if (full) action = `<span class="badge badge-full">已額滿</span>`;
    else action = `<button class="btn-primary btn-join" data-group="${g.id}">加入這組</button>`;

    const slots = Array.from({ length: GROUP_CAPACITY }, (_, i) =>
      `<span class="slot ${i < count ? "slot-filled" : ""}"></span>`).join("");

    const memberItems = members.length
      ? members.map((m) => {
          const isMe = m.email === myEmail;
          const canRemove = !locked && isMine && !isMe && m.addedBy === myEmail;
          return `
            <li>
              <span>${esc(m.displayName || accountOf(m.email))}${isMe ? `<em class="me-tag">我</em>` : ""}</span>
              ${canRemove ? `<button class="btn-text btn-remove" data-email="${esc(m.email)}">移除</button>` : ""}
            </li>`;
        }).join("")
      : `<li class="muted">還沒有人</li>`;

    const mineTools = isMine && !locked ? `
      <form class="inline-form team-name-form" data-group="${g.id}">
        <label for="team-${g.id}">隊名</label>
        <div class="inline-row">
          <input id="team-${g.id}" name="team-${g.id}" type="text" maxlength="20" placeholder="20 字以內" value="${esc(teamName)}" />
          <button type="submit" class="btn-outline">${teamName ? "修改" : "儲存"}</button>
        </div>
      </form>
      ${full ? `<p class="muted small">這組已經滿了。</p>` : `
      <form class="inline-form add-member-form" data-group="${g.id}">
        <label for="add-${g.id}">幫隊友報名（還有 ${remaining} 個位子）</label>
        <input id="add-${g.id}" name="add-${g.id}" type="text" placeholder="輸入隊友帳號，例如 yoyoshen" autocomplete="off" autocapitalize="off" spellcheck="false" />
        <p class="hint">只要打信箱 @ 前面，系統會自動補上 @${esc(EMAIL_DOMAIN)}</p>
        <button type="submit" class="btn-primary">幫他報名</button>
      </form>`}` : "";

    return `
      <div class="card group-card ${isMine ? "group-mine" : ""} ${full && !isMine ? "group-full" : ""}">
        <div class="group-head">
          <h3>${esc(g.name)}${isMine ? `<span class="badge badge-mine">我的組</span>` : ""}</h3>
          <span class="group-count">${count} / ${GROUP_CAPACITY}</span>
        </div>
        <p class="team-name ${teamName ? "" : "team-name-empty"}">${teamName ? `${esc(teamName)}<small class="team-namer">${esc(namerOf(g.id))} 取的</small>` : "還沒取隊名"}</p>
        <div class="slots" aria-hidden="true">${slots}</div>
        <ul class="member-list">${memberItems}</ul>
        ${mineTools}
        ${action ? `<div class="group-foot">${action}</div>` : ""}
      </div>`;
  }).join("");

  // 還原輸入中的內容
  $$(".group-card input").forEach((input) => {
    if (input.name in drafts) input.value = drafts[input.name];
  });
  if (focusedName) container.querySelector(`input[name="${focusedName}"]`)?.focus();

  $$(".btn-join").forEach((btn) => btn.addEventListener("click", () => handleJoin(btn.dataset.group, btn)));
  $$(".btn-remove").forEach((btn) => btn.addEventListener("click", () => handleRemove(btn.dataset.email, false)));
  $$(".team-name-form").forEach((form) => form.addEventListener("submit", handleTeamName));
  $$(".add-member-form").forEach((form) => form.addEventListener("submit", handleAddMember));
}

function toggleAbsenceForm(show) {
  if (isLocked()) show = false;
  const wrap = $("#absence-form-wrap");
  wrap.classList.toggle("hidden", !show);
  if (show) {
    $("#absence-type").value = myAbsence?.reasonType || ABSENCE_REASONS[0];
    $("#absence-note").value = myAbsence?.reasonNote || "";
    wrap.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// ---- 動作 ----

const ERROR_TEXT = {
  FULL: "這組剛好額滿了，請選別組。",
  ALREADY_JOINED: "你已經在其他組了，想換組請先退出目前的組。",
  MARKED_ABSENT: "你已回報不能參加，要選組請先按「改成可以參加」。",
  NOT_READY: "組別還沒開放，請稍後再試或聯絡福委。",
  MEMBER_TAKEN: "這位同仁已經在其他組了。",
  PROXY_DENIED: "沒辦法幫這位同仁報名，可能對方已回報不能參加，請先跟對方確認。"
};

async function run(task, okMsg, failMsg) {
  if (busy || !currentUser) return false;
  busy = true;
  try {
    await task();
    if (okMsg) showToast(okMsg);
    return true;
  } catch (err) {
    console.error(err);
    showToast(ERROR_TEXT[err.message] || failMsg, true);
    return false;
  } finally {
    busy = false;
  }
}

async function handleJoin(groupId, btn) {
  btn.disabled = true;
  btn.textContent = "處理中…";
  const groupName = GROUPS.find((g) => g.id === groupId)?.name || "";
  const ok = await run(() => addMember(currentUser, { email: myEmail }, groupId, GROUP_CAPACITY),
    `已加入${groupName}！`, "加入失敗，請稍後再試。");
  if (!ok) { btn.disabled = false; btn.textContent = "加入這組"; }
}

async function handleAddMember(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const input = form.querySelector("input");
  // 不小心貼上完整信箱也沒關係，只取 @ 前面
  const account = accountOf(input.value.trim().toLowerCase());
  if (!/^[a-z0-9._-]+$/.test(account)) {
    showToast("帳號格式不對，只要輸入信箱 @ 前面的部分。", true);
    return;
  }
  const email = `${account}@${EMAIL_DOMAIN}`;
  if (email === myEmail) {
    showToast("你已經在這組了。", true);
    return;
  }
  const existing = joins.find((j) => j.email === email);
  if (existing) {
    const g = GROUPS.find((x) => x.id === existing.groupId);
    showToast(`${account} 已經在${g?.name || "其他組"}了。`, true);
    return;
  }

  const ok = await run(async () => {
    try {
      await addMember(currentUser, { email }, form.dataset.group, GROUP_CAPACITY);
    } catch (err) {
      if (err.code === "permission-denied") throw new Error("PROXY_DENIED");
      throw err;
    }
  }, `已幫 ${account} 報名！`, "報名失敗，請稍後再試。");

  if (ok) input.value = "";
}

async function handleRemove(email, isSelf) {
  const text = isSelf ? "確定要退出這組嗎？名額會釋出給其他人。" : `確定要把 ${accountOf(email)} 移出這組嗎？`;
  if (!confirm(text)) return;
  await run(() => removeMember(email), isSelf ? "已退出組別。" : "已移除。", "操作失敗，請稍後再試。");
}

async function handleTeamName(e) {
  e.preventDefault();
  const form = e.currentTarget;
  const name = form.querySelector("input").value.trim().slice(0, 20);
  if (!name) {
    showToast("隊名不能空白。", true);
    return;
  }
  await run(() => setTeamName(currentUser, form.dataset.group, name), "隊名已更新！", "隊名更新失敗，請稍後再試。");
}

async function handleAbsenceSubmit(e) {
  e.preventDefault();
  const reasonType = $("#absence-type").value;
  const reasonNote = $("#absence-note").value.trim().slice(0, 200);
  if (reasonType === "其他" && !reasonNote) {
    showToast("選「其他」的話，請簡單寫一下原因。", true);
    return;
  }
  const ok = await run(() => reportAbsence(currentUser, reasonType, reasonNote), "已送出，謝謝你的回覆。", "送出失敗，請稍後再試。");
  if (ok) toggleAbsenceForm(false);
}

async function handleWithdraw() {
  await run(() => withdrawAbsence(myEmail), "已撤回，請記得選一組。", "撤回失敗，請稍後再試。");
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
