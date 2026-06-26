// ======================================================
// app.js — 報名前台（index.html 用）
// ======================================================

import {
  auth,
  loginWithGoogle,
  logout,
  onAuthChange,
  onBookingCountsChange,
  onMyBookingChange,
  getMyBooking,
  upsertBooking,
  cancelBooking
} from "./firebase-db.js";

const THEMES = [
  { id: "butterfly-valley",  name: "蝴蝶谷",           capacity: 5,  url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb05", desc: "2–5 人" },
  { id: "death-attic",       name: "死神的閣樓",         capacity: 7,  url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb02", desc: "4–7 人" },
  { id: "forsaken-girl",     name: "被神遺棄的女孩",     capacity: 10, url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb06", desc: "4–10 人" },
  { id: "diesel-street",     name: "迪賽爾街 19 號",     capacity: 5,  url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb07", desc: "2–5 人" },
  { id: "dark-alley",        name: "暗巷（事件 2－執念）", capacity: 8, url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb08", desc: "4–8 人" }
];

let currentUser = null;
let myBooking = null;
let bookingCounts = {};
let unsubscribeCounts = null;
let unsubscribeMyBooking = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

document.addEventListener("DOMContentLoaded", () => {
  onAuthChange(async (user) => {
    currentUser = user;
    const nameEl = $("#user-name");
    const logoutBtn = $("#btn-logout");

    if (unsubscribeCounts) unsubscribeCounts();
    if (unsubscribeMyBooking) unsubscribeMyBooking();

    unsubscribeCounts = onBookingCountsChange((counts) => {
      bookingCounts = counts;
      if (currentUser) renderThemeCards();
    });

    if (user) {
      if (nameEl) { nameEl.textContent = user.displayName || user.email; nameEl.classList.remove("hidden"); }
      logoutBtn?.classList.remove("hidden");
      unsubscribeMyBooking = onMyBookingChange(user.uid, (booking) => {
        myBooking = booking;
        showMain();
      });
    } else {
      nameEl?.classList.add("hidden");
      logoutBtn?.classList.add("hidden");
      myBooking = null;
      showLogin();
    }
  });

  $("#btn-login")?.addEventListener("click", loginWithGoogle);
  $("#btn-logout")?.addEventListener("click", logout);
  $("#btn-add-dependent")?.addEventListener("click", addDependentRow);
});

function showLogin() {
  $("#section-login")?.classList.remove("hidden");
  $("#section-main")?.classList.add("hidden");
}

function showMain() {
  $("#section-login")?.classList.add("hidden");
  $("#section-main")?.classList.remove("hidden");
  renderThemeCards();
  renderMyBooking();
  updatePartySize();
}

function getCount(id) { return bookingCounts[id] || 0; }
function getRemaining(t) { return t.capacity - getCount(t.id); }
function getPartySize() { return 1 + $$(".dependent-row").length; }

function addDependentRow() {
  if (myBooking) {
    showToast("你已經完成預約，如需調整眷屬請先取消預約再重新報名。", true);
    return;
  }
  const list = $("#dependents-list");
  if (!list) return;

  const row = document.createElement("div");
  row.className = "dependent-row";
  row.innerHTML = `
    <div class="dependent-info">
      <label>眷屬姓名</label>
      <input class="dependent-name" type="text" placeholder="請輸入眷屬姓名" autocomplete="off" />
    </div>
    <button type="button" class="btn-remove-dependent">移除</button>
  `;
  row.querySelector(".btn-remove-dependent").addEventListener("click", () => {
    row.remove();
    updatePartySize();
    renderThemeCards();
  });
  row.querySelector(".dependent-name").addEventListener("input", () => renderThemeCards());
  list.appendChild(row);
  updatePartySize();
  renderThemeCards();
}

function getDependents() {
  return Array.from($$(".dependent-name"))
    .map((input) => input.value.trim())
    .filter(Boolean)
    .map((name) => ({ name }));
}

function updatePartySize() {
  const el = $("#party-size");
  if (el) el.textContent = getPartySize();
}

function setPartyPanelDisabled(disabled) {
  const panel = $("#party-panel");
  panel?.classList.toggle("is-disabled", disabled);
  $("#btn-add-dependent")?.toggleAttribute("disabled", disabled);
  $$(".dependent-name, .btn-remove-dependent").forEach((el) => el.toggleAttribute("disabled", disabled));
}

function renderThemeCards() {
  const container = $("#theme-cards");
  if (!container) return;
  const partySize = getPartySize();
  container.innerHTML = THEMES.map((t) => {
    const remaining = getRemaining(t);
    const full = remaining <= 0;
    const isBooked = myBooking?.themeId === t.id;
    const lockedByOtherBooking = !!myBooking && !isBooked;
    const notEnough = !isBooked && remaining < partySize;
    const pct = Math.min((getCount(t.id) / t.capacity) * 100, 100);

    return `
      <div class="theme-card ${full && !isBooked ? "card-full" : ""} ${isBooked ? "card-selected" : ""} ${notEnough ? "card-limited" : ""}">
        <div class="card-header">
          <h3 class="card-title">${t.name}</h3>
          <span class="card-range">${t.desc}</span>
        </div>
        <div class="card-body">
          <a href="${t.url}" target="_blank" rel="noopener" class="card-link">查看主題介紹 →</a>
          <div class="card-capacity">
            <div class="cap-bar-wrap">
              <div class="cap-bar ${full ? "bar-full" : remaining <= 2 ? "bar-low" : "bar-ok"}" style="width:${pct}%"></div>
            </div>
            <span class="cap-text">${full ? "額滿" : `剩餘 ${remaining} 位`}</span>
          </div>
          ${notEnough ? `<p class="capacity-warning">目前選擇 ${partySize} 人，剩餘名額不足。</p>` : ""}
        </div>
        <div class="card-footer">
          ${isBooked
            ? `<span class="badge-booked">✓ 已鎖定此主題</span>`
            : lockedByOtherBooking
            ? `<span class="badge-full-sm">已完成預約，請先取消才能更改</span>`
            : full
            ? `<span class="badge-full-sm">額滿</span>`
            : notEnough
            ? `<span class="badge-full-sm">名額不足</span>`
            : `<button class="btn-select" data-theme="${t.id}" data-cap="${t.capacity}">選擇此主題</button>`}
        </div>
      </div>`;
  }).join("");

  $$(".btn-select").forEach((btn) => {
    btn.addEventListener("click", () => handleBook(btn.dataset.theme, parseInt(btn.dataset.cap, 10)));
  });
}

function renderMyBooking() {
  const el = $("#my-booking");
  if (!el) return;
  setPartyPanelDisabled(!!myBooking);

  if (!myBooking) {
    el.innerHTML = `<p class="no-booking">尚未選擇主題，請先設定報名人數，再從下方選一個你想玩的密室。</p>`;
    return;
  }

  const theme = THEMES.find((t) => t.id === myBooking.themeId);
  const dependents = Array.isArray(myBooking.dependents) ? myBooking.dependents : [];
  const totalPeople = myBooking.totalPeople || (1 + dependents.length);
  const dependentText = dependents.length
    ? `<p class="family-notice">同行眷屬：${dependents.map((d) => d.name).join("、")}</p>`
    : `<p class="family-notice">本次未登記同行眷屬。</p>`;

  el.innerHTML = `
    <div class="booking-status">
      <div class="booking-info">
        <span class="booking-label">你目前選擇的主題：</span>
        <strong class="booking-theme">${theme?.name || myBooking.themeId}</strong>
        <span class="booking-people">共 ${totalPeople} 人</span>
      </div>
      <button id="btn-cancel" class="btn-cancel">取消預約</button>
    </div>
    ${dependentText}
    <p class="family-notice">⚠️ 若要調整眷屬或人數，請先取消預約後重新報名。</p>`;
  $("#btn-cancel")?.addEventListener("click", handleCancel);
}

async function handleBook(themeId, capacity) {
  if (!currentUser) return;

  // 已完成預約後一律鎖定，避免手滑改到其他主題或把眷屬人數洗掉。
  myBooking = await getMyBooking(currentUser.uid);
  if (myBooking) {
    showToast("你已完成預約，如需更改主題或人數，請先取消目前預約。", true);
    renderMyBooking();
    renderThemeCards();
    return;
  }

  const rows = $$(".dependent-row");
  const dependents = getDependents();
  if (dependents.length !== rows.length) {
    showToast("請填寫每一位眷屬姓名，或先移除空白欄位。", true);
    return;
  }

  const totalPeople = 1 + dependents.length;
  const btn = $(`.btn-select[data-theme="${themeId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = "處理中…"; }

  try {
    await upsertBooking(
      { uid: currentUser.uid, email: currentUser.email, displayName: currentUser.displayName },
      themeId,
      capacity,
      { dependents, totalPeople }
    );
    myBooking = await getMyBooking(currentUser.uid);
    renderMyBooking();
    renderThemeCards();
    showToast("預約成功！");
  } catch (err) {
    const message = err.message === "FULL"
      ? "此主題名額不足，請調整人數或選擇其他主題。"
      : err.message === "ALREADY_BOOKED"
      ? "你已完成預約，如需更改主題或人數，請先取消目前預約。"
      : "預約失敗，請稍後再試。";
    showToast(message, true);
    if (btn) { btn.disabled = false; btn.textContent = "選擇此主題"; }
  }
}

async function handleCancel() {
  if (!myBooking || !currentUser) return;
  if (!confirm("確定要取消預約嗎？")) return;
  try {
    await cancelBooking(currentUser.uid, myBooking.themeId);
    myBooking = null;
    renderMyBooking();
    renderThemeCards();
    showToast("已取消預約。");
  } catch (err) {
    showToast("取消失敗，請稍後再試。", true);
  }
}

function showToast(msg, isError = false) {
  const existing = $("#toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.id = "toast";
  toast.className = `toast ${isError ? "toast-error" : "toast-success"}`;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("toast-show"), 10);
  setTimeout(() => { toast.classList.remove("toast-show"); setTimeout(() => toast.remove(), 300); }, 3000);
}
