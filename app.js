// ======================================================
// app.js — 報名前台（index.html 用）
// ======================================================

import {
  auth,
  loginWithGoogle,
  logout,
  onAuthChange,
  onBookingCountsChange,
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

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

document.addEventListener("DOMContentLoaded", () => {
  onAuthChange(async (user) => {
    currentUser = user;
    const nameEl = $("#user-name");
    const logoutBtn = $("#btn-logout");

    if (user) {
      if (nameEl) { nameEl.textContent = user.displayName || user.email; nameEl.classList.remove("hidden"); }
      logoutBtn?.classList.remove("hidden");
      myBooking = await getMyBooking(user.uid);
      showMain();
    } else {
      nameEl?.classList.add("hidden");
      logoutBtn?.classList.add("hidden");
      myBooking = null;
      showLogin();
    }

    if (unsubscribeCounts) unsubscribeCounts();
    unsubscribeCounts = onBookingCountsChange((counts) => {
      bookingCounts = counts;
      renderThemeOverview();
      if (currentUser) renderThemeCards();
    });
  });

  $("#btn-login")?.addEventListener("click", loginWithGoogle);
  $("#btn-logout")?.addEventListener("click", logout);
});

function showLogin() {
  $("#section-login")?.classList.remove("hidden");
  $("#section-main")?.classList.add("hidden");
}

function showMain() {
  $("#section-login")?.classList.add("hidden");
  $("#section-main")?.classList.remove("hidden");
  renderThemeOverview();
  renderThemeCards();
  renderMyBooking();
}

function getCount(id) { return bookingCounts[id] || 0; }
function getRemaining(t) { return t.capacity - getCount(t.id); }
function isFull(t) { return getRemaining(t) <= 0; }

function renderThemeOverview() {
  const tbody = $("#theme-overview");
  if (!tbody) return;
  tbody.innerHTML = THEMES.map((t) => {
    const count = getCount(t.id);
    const remaining = t.capacity - count;
    const full = remaining <= 0;
    const pct = Math.min((count / t.capacity) * 100, 100);
    const cls = full ? "remaining-full" : remaining <= 2 ? "remaining-low" : "remaining-ok";
    return `
      <tr class="${full ? "row-full" : ""}">
        <td class="theme-name-cell">
          <a href="${t.url}" target="_blank" rel="noopener">${t.name}</a>
          <span class="theme-range">${t.desc}</span>
        </td>
        <td class="count-cell">
          <div class="progress-wrap">
            <div class="progress-bar ${full ? "bar-full" : remaining <= 2 ? "bar-low" : "bar-ok"}" style="width:${pct}%"></div>
          </div>
          <span class="count-label">${count}/${t.capacity}</span>
        </td>
        <td class="remaining-cell">
          ${full ? `<span class="badge-full">額滿</span>` : `<span class="${cls}">${remaining}</span>`}
        </td>
      </tr>`;
  }).join("");
}

function renderThemeCards() {
  const container = $("#theme-cards");
  if (!container) return;
  container.innerHTML = THEMES.map((t) => {
    const full = isFull(t);
    const remaining = getRemaining(t);
    const isBooked = myBooking?.themeId === t.id;
    return `
      <div class="theme-card ${full && !isBooked ? "card-full" : ""} ${isBooked ? "card-selected" : ""}">
        <div class="card-header">
          <h3 class="card-title">${t.name}</h3>
          <span class="card-range">${t.desc}</span>
        </div>
        <div class="card-body">
          <a href="${t.url}" target="_blank" rel="noopener" class="card-link">查看主題介紹 →</a>
          <div class="card-capacity">
            <div class="cap-bar-wrap">
              <div class="cap-bar ${full ? "bar-full" : remaining <= 2 ? "bar-low" : "bar-ok"}"
                   style="width:${Math.min((getCount(t.id)/t.capacity)*100,100)}%"></div>
            </div>
            <span class="cap-text">${full ? "額滿" : `剩餘 ${remaining} 位`}</span>
          </div>
        </div>
        <div class="card-footer">
          ${isBooked
            ? `<span class="badge-booked">✓ 已選此主題</span>`
            : full
            ? `<span class="badge-full-sm">額滿</span>`
            : `<button class="btn-select" data-theme="${t.id}" data-cap="${t.capacity}">選擇此主題</button>`}
        </div>
      </div>`;
  }).join("");

  $$(".btn-select").forEach((btn) => {
    btn.addEventListener("click", () => handleBook(btn.dataset.theme, parseInt(btn.dataset.cap)));
  });
}

function renderMyBooking() {
  const el = $("#my-booking");
  if (!el) return;
  if (!myBooking) {
    el.innerHTML = `<p class="no-booking">尚未選擇主題，請從下方選一個你想玩的密室。</p>`;
    return;
  }
  const theme = THEMES.find((t) => t.id === myBooking.themeId);
  el.innerHTML = `
    <div class="booking-status">
      <div class="booking-info">
        <span class="booking-label">你目前選擇的主題：</span>
        <strong class="booking-theme">${theme?.name || myBooking.themeId}</strong>
      </div>
      <button id="btn-cancel" class="btn-cancel">取消預約</button>
    </div>
    <p class="family-notice">⚠️ 若攜帶眷屬，眷屬費用需自行負擔，請事先確認。</p>`;
  $("#btn-cancel")?.addEventListener("click", handleCancel);
}

async function handleBook(themeId, capacity) {
  if (!currentUser) return;
  const btn = $(`.btn-select[data-theme="${themeId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = "處理中…"; }
  try {
    await upsertBooking({ uid: currentUser.uid, email: currentUser.email, displayName: currentUser.displayName }, themeId, capacity);
    myBooking = await getMyBooking(currentUser.uid);
    renderMyBooking();
    renderThemeCards();
    showToast("預約成功！");
  } catch (err) {
    showToast(err.message === "FULL" ? "此主題已額滿，請選擇其他主題。" : "預約失敗，請稍後再試。", true);
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
