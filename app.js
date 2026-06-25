// ======================================================
// app.js
// 主要應用程式邏輯
// ======================================================

import {
  auth,
  loginWithGoogle,
  logout,
  onAuthChange,
  onBookingCountsChange,
  getMyBooking,
  upsertBooking,
  cancelBooking,
  getAllBookings,
  adminDeleteBooking
} from "./firebase-db.js";

// ---- 活動設定 ----
const THEMES = [
  {
    id: "butterfly-valley",
    name: "蝴蝶谷",
    capacity: 5,
    url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb05",
    desc: "2–5 人"
  },
  {
    id: "death-attic",
    name: "死神的閣樓",
    capacity: 7,
    url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb02",
    desc: "4–7 人"
  },
  {
    id: "forsaken-girl",
    name: "被神遺棄的女孩",
    capacity: 10,
    url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb06",
    desc: "4–10 人"
  },
  {
    id: "diesel-street",
    name: "迪賽爾街 19 號",
    capacity: 5,
    url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb07",
    desc: "2–5 人"
  },
  {
    id: "dark-alley",
    name: "暗巷（事件 2－執念）",
    capacity: 8,
    url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb08",
    desc: "4–8 人"
  }
];

const ADMIN_EMAILS = [
  "yoyoshen@gis.fcu.edu.tw",
  "irishuang@gis.fcu.edu.tw",
  "clarachou@gis.fcu.edu.tw"
];

// ---- 狀態 ----
let currentUser = null;
let myBooking = null;
let bookingCounts = {};
let unsubscribeCounts = null;

// ---- DOM 快取 ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ---- 初始化 ----
document.addEventListener("DOMContentLoaded", () => {
  renderThemeOverview();

  onAuthChange(async (user) => {
    currentUser = user;
    const nameEl = $("#user-name");
    const logoutBtn = $("#btn-logout");
    if (user) {
      if (nameEl) { nameEl.textContent = user.displayName || user.email; nameEl.classList.remove("hidden"); }
      logoutBtn?.classList.remove("hidden");
      myBooking = await getMyBooking(user.uid);
      renderUserPanel();
    } else {
      nameEl?.classList.add("hidden");
      logoutBtn?.classList.add("hidden");
      myBooking = null;
      renderUserPanel();
    }

    if (unsubscribeCounts) unsubscribeCounts();
    unsubscribeCounts = onBookingCountsChange((counts) => {
      bookingCounts = counts;
      renderThemeOverview();
      renderThemeCards();
      if (currentUser && isAdmin(currentUser.email)) renderAdminOverview();
    });
  });

  $("#btn-login")?.addEventListener("click", loginWithGoogle);
  $("#btn-logout")?.addEventListener("click", async () => {
    await logout();
  });
  $("#tab-overview")?.addEventListener("click", () => switchAdminTab("overview"));
  $("#tab-list")?.addEventListener("click", () => switchAdminTab("list"));
  $("#btn-export")?.addEventListener("click", exportCSV);
});

// ---- 工具 ----
function isAdmin(email) {
  return ADMIN_EMAILS.includes(email);
}

function getCount(themeId) {
  return bookingCounts[themeId] || 0;
}

function getRemaining(theme) {
  return theme.capacity - getCount(theme.id);
}

function isFull(theme) {
  return getRemaining(theme) <= 0;
}

// ---- 名額總覽表（使用者頁 & 管理員頁共用） ----
function renderThemeOverview() {
  const container = $("#theme-overview");
  if (!container) return;

  container.innerHTML = THEMES.map((theme) => {
    const count = getCount(theme.id);
    const remaining = theme.capacity - count;
    const full = remaining <= 0;
    const pct = Math.min((count / theme.capacity) * 100, 100);

    let remainingClass = "remaining-ok";
    if (full) remainingClass = "remaining-full";
    else if (remaining <= 2) remainingClass = "remaining-low";

    return `
      <tr class="${full ? "row-full" : ""}">
        <td class="theme-name-cell">
          <span class="keyhole-icon">🔑</span>
          <a href="${theme.url}" target="_blank" rel="noopener">${theme.name}</a>
          <span class="theme-range">${theme.desc}</span>
        </td>
        <td class="count-cell">
          <div class="progress-wrap">
            <div class="progress-bar ${full ? "bar-full" : remaining <= 2 ? "bar-low" : "bar-ok"}"
                 style="width:${pct}%"></div>
          </div>
          <span class="count-label">${count}/${theme.capacity}</span>
        </td>
        <td class="remaining-cell">
          ${full
            ? `<span class="badge-full">額滿</span>`
            : `<span class="${remainingClass}">${remaining}</span>`}
        </td>
      </tr>
    `;
  }).join("");
}

// ---- 使用者區塊 ----
function renderUserPanel() {
  const loginSection = $("#section-login");
  const mainSection = $("#section-main");
  const adminSection = $("#section-admin");

  if (!currentUser) {
    loginSection?.classList.remove("hidden");
    mainSection?.classList.add("hidden");
    adminSection?.classList.add("hidden");
    return;
  }

  loginSection?.classList.add("hidden");

  if (isAdmin(currentUser.email)) {
    mainSection?.classList.add("hidden");
    adminSection?.classList.remove("hidden");
    renderAdminOverview();
    loadAdminList();
  } else {
    mainSection?.classList.remove("hidden");
    adminSection?.classList.add("hidden");
    renderThemeCards();
    renderMyBooking();
  }

  const nameEl = $("#user-name");
  if (nameEl) nameEl.textContent = currentUser.displayName || currentUser.email;
}

// ---- 主題卡片（使用者選主題用） ----
function renderThemeCards() {
  const container = $("#theme-cards");
  if (!container) return;

  container.innerHTML = THEMES.map((theme) => {
    const full = isFull(theme);
    const remaining = getRemaining(theme);
    const isBooked = myBooking?.themeId === theme.id;

    return `
      <div class="theme-card ${full && !isBooked ? "card-full" : ""} ${isBooked ? "card-selected" : ""}">
        <div class="card-header">
          <h3 class="card-title">${theme.name}</h3>
          <span class="card-range">${theme.desc}</span>
        </div>
        <div class="card-body">
          <a href="${theme.url}" target="_blank" rel="noopener" class="card-link">查看主題介紹 →</a>
          <div class="card-capacity">
            <div class="cap-bar-wrap">
              <div class="cap-bar ${full ? "bar-full" : remaining <= 2 ? "bar-low" : "bar-ok"}"
                   style="width:${Math.min((getCount(theme.id) / theme.capacity) * 100, 100)}%"></div>
            </div>
            <span class="cap-text">${full ? "額滿" : `剩餘 ${remaining} 位`}</span>
          </div>
        </div>
        <div class="card-footer">
          ${isBooked
            ? `<span class="badge-booked">✓ 已選此主題</span>`
            : full
            ? `<span class="badge-full-sm">額滿</span>`
            : `<button class="btn-select" data-theme="${theme.id}" data-cap="${theme.capacity}">選擇此主題</button>`}
        </div>
      </div>
    `;
  }).join("");

  $$(".btn-select").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const themeId = btn.dataset.theme;
      const cap = parseInt(btn.dataset.cap);
      await handleBook(themeId, cap);
    });
  });
}

// ---- 我的預約狀態 ----
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
      <div class="booking-actions">
        <button id="btn-cancel" class="btn-cancel">取消預約</button>
      </div>
    </div>
    <p class="family-notice">⚠️ 若攜帶眷屬，眷屬費用需自行負擔，請事先確認。</p>
  `;

  $("#btn-cancel")?.addEventListener("click", handleCancel);
}

// ---- 報名邏輯 ----
async function handleBook(themeId, capacity) {
  if (!currentUser) return;

  const btn = $(`.btn-select[data-theme="${themeId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.textContent = "處理中…";
  }

  try {
    await upsertBooking(
      { uid: currentUser.uid, email: currentUser.email, displayName: currentUser.displayName },
      themeId,
      capacity
    );
    myBooking = await getMyBooking(currentUser.uid);
    renderMyBooking();
    renderThemeCards();
    showToast("預約成功！");
  } catch (err) {
    if (err.message === "FULL") {
      showToast("此主題已額滿，請選擇其他主題。", true);
    } else {
      showToast("預約失敗，請稍後再試。", true);
      console.error(err);
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "選擇此主題";
    }
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
    console.error(err);
  }
}

// ---- 管理員後台 ----
function switchAdminTab(tab) {
  const overviewPanel = $("#admin-overview-panel");
  const listPanel = $("#admin-list-panel");
  const tabOverview = $("#tab-overview");
  const tabList = $("#tab-list");

  if (tab === "overview") {
    overviewPanel?.classList.remove("hidden");
    listPanel?.classList.add("hidden");
    tabOverview?.classList.add("tab-active");
    tabList?.classList.remove("tab-active");
  } else {
    overviewPanel?.classList.add("hidden");
    listPanel?.classList.remove("hidden");
    tabOverview?.classList.remove("tab-active");
    tabList?.classList.add("tab-active");
    loadAdminList();
  }
}

function renderAdminOverview() {
  renderThemeOverview();
  const adminOverview = $("#admin-theme-overview");
  if (!adminOverview) return;

  adminOverview.innerHTML = THEMES.map((theme) => {
    const count = getCount(theme.id);
    const remaining = theme.capacity - count;
    const full = remaining <= 0;
    const pct = Math.min((count / theme.capacity) * 100, 100);

    let remainingClass = "remaining-ok";
    if (full) remainingClass = "remaining-full";
    else if (remaining <= 2) remainingClass = "remaining-low";

    return `
      <tr class="${full ? "row-full" : ""}">
        <td class="theme-name-cell">
          <a href="${theme.url}" target="_blank" rel="noopener">${theme.name}</a>
          <span class="theme-range">${theme.desc}</span>
        </td>
        <td class="count-cell">
          <div class="progress-wrap">
            <div class="progress-bar ${full ? "bar-full" : remaining <= 2 ? "bar-low" : "bar-ok"}"
                 style="width:${pct}%"></div>
          </div>
          <span class="count-label">${count}/${theme.capacity}</span>
        </td>
        <td class="remaining-cell">
          ${full
            ? `<span class="badge-full">額滿</span>`
            : `<span class="${remainingClass}">${remaining}</span>`}
        </td>
      </tr>
    `;
  }).join("");
}

async function loadAdminList() {
  const tbody = $("#booking-list-body");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="loading-cell">載入中…</td></tr>`;

  try {
    const bookings = await getAllBookings();
    if (bookings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-cell">目前尚無預約資料。</td></tr>`;
      return;
    }

    // 依主題排序
    bookings.sort((a, b) => a.themeId.localeCompare(b.themeId));

    tbody.innerHTML = bookings.map((b) => {
      const theme = THEMES.find((t) => t.id === b.themeId);
      const createdAt = b.createdAt?.toDate
        ? b.createdAt.toDate().toLocaleString("zh-TW")
        : "—";
      return `
        <tr>
          <td>${b.displayName || "—"}</td>
          <td>${b.email}</td>
          <td>${theme?.name || b.themeId}</td>
          <td>${createdAt}</td>
          <td>
            <button class="btn-admin-del" data-uid="${b.uid}" data-theme="${b.themeId}">刪除</button>
          </td>
        </tr>
      `;
    }).join("");

    const countEl = $("#booking-count");
    if (countEl) countEl.textContent = bookings.length;

    $$(".btn-admin-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`確定要刪除 ${btn.dataset.uid} 的預約嗎？`)) return;
        try {
          await adminDeleteBooking(btn.dataset.uid, btn.dataset.theme);
          showToast("已刪除預約。");
          loadAdminList();
        } catch (err) {
          showToast("刪除失敗，請稍後再試。", true);
          console.error(err);
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="error-cell">載入失敗，請重新整理。</td></tr>`;
    console.error(err);
  }
}

// ---- 匯出 CSV ----
async function exportCSV() {
  const bookings = await getAllBookings();
  const header = ["姓名", "Email", "主題", "報名時間"];
  const rows = bookings.map((b) => {
    const theme = THEMES.find((t) => t.id === b.themeId);
    const createdAt = b.createdAt?.toDate
      ? b.createdAt.toDate().toLocaleString("zh-TW")
      : "";
    return [b.displayName || "", b.email, theme?.name || b.themeId, createdAt]
      .map((v) => `"${v}"`)
      .join(",");
  });

  const csv = "\uFEFF" + [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `密室逃脫報名名單_${new Date().toLocaleDateString("zh-TW")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Toast 提示 ----
function showToast(msg, isError = false) {
  const existing = $("#toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.className = `toast ${isError ? "toast-error" : "toast-success"}`;
  toast.textContent = msg;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add("toast-show"), 10);
  setTimeout(() => {
    toast.classList.remove("toast-show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
