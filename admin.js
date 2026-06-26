// ======================================================
// admin.js — 管理後台（admin.html 用）
// ======================================================

import {
  auth,
  loginWithGoogle,
  logout,
  onAuthChange,
  onBookingCountsChange,
  onAllBookingsChange,
  getAllBookings,
  adminDeleteBooking
} from "./firebase-db.js";

const THEMES = [
  { id: "butterfly-valley",  name: "蝴蝶谷",           capacity: 5,  url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb05", desc: "2–5 人" },
  { id: "death-attic",       name: "死神的閣樓",         capacity: 7,  url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb02", desc: "4–7 人" },
  { id: "forsaken-girl",     name: "被神遺棄的女孩",     capacity: 10, url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb06", desc: "4–10 人" },
  { id: "diesel-street",     name: "迪賽爾街 19 號",     capacity: 5,  url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb07", desc: "2–5 人" },
  { id: "dark-alley",        name: "暗巷（事件 2－執念）", capacity: 8, url: "http://henan.lost-taiwan.com.tw/henan/?level=tchb08", desc: "4–8 人" }
];

const ADMIN_EMAILS = [
  "yoyoshen@gis.fcu.edu.tw",
  "irishuang@gis.fcu.edu.tw",
  "clarachou@gis.fcu.edu.tw"
];

let bookingCounts = {};
let unsubscribeCounts = null;
let unsubscribeBookings = null;
let latestBookings = [];

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

document.addEventListener("DOMContentLoaded", () => {
  onAuthChange((user) => {
    const nameEl = $("#user-name");
    const logoutBtn = $("#btn-logout");

    if (user) {
      if (nameEl) { nameEl.textContent = user.displayName || user.email; nameEl.classList.remove("hidden"); }
      logoutBtn?.classList.remove("hidden");

      if (ADMIN_EMAILS.includes(user.email)) {
        $("#section-login")?.classList.add("hidden");
        $("#section-denied")?.classList.add("hidden");
        $("#section-admin")?.classList.remove("hidden");

        if (unsubscribeCounts) unsubscribeCounts();
        if (unsubscribeBookings) unsubscribeBookings();

        unsubscribeCounts = onBookingCountsChange((counts) => {
          bookingCounts = counts;
          renderAdminOverview();
        });
        unsubscribeBookings = onAllBookingsChange((bookings) => {
          latestBookings = bookings;
          renderAdminList(bookings);
        });
      } else {
        if (unsubscribeCounts) { unsubscribeCounts(); unsubscribeCounts = null; }
        if (unsubscribeBookings) { unsubscribeBookings(); unsubscribeBookings = null; }
        bookingCounts = {};
        latestBookings = [];
        $("#section-login")?.classList.add("hidden");
        $("#section-denied")?.classList.remove("hidden");
        $("#section-admin")?.classList.add("hidden");
      }
    } else {
      if (unsubscribeCounts) { unsubscribeCounts(); unsubscribeCounts = null; }
      if (unsubscribeBookings) { unsubscribeBookings(); unsubscribeBookings = null; }
      bookingCounts = {};
      latestBookings = [];
      nameEl?.classList.add("hidden");
      logoutBtn?.classList.add("hidden");
      $("#section-login")?.classList.remove("hidden");
      $("#section-denied")?.classList.add("hidden");
      $("#section-admin")?.classList.add("hidden");
    }
  });

  $("#btn-login")?.addEventListener("click", loginWithGoogle);
  $("#btn-logout")?.addEventListener("click", logout);
  $("#tab-overview")?.addEventListener("click", () => switchTab("overview"));
  $("#tab-list")?.addEventListener("click", () => switchTab("list"));
  $("#btn-export")?.addEventListener("click", exportCSV);
});

function switchTab(tab) {
  const isOverview = tab === "overview";
  $("#admin-overview-panel")?.classList.toggle("hidden", !isOverview);
  $("#admin-list-panel")?.classList.toggle("hidden", isOverview);
  $("#tab-overview")?.classList.toggle("tab-active", isOverview);
  $("#tab-list")?.classList.toggle("tab-active", !isOverview);
  if (!isOverview) loadAdminList();
}

function renderAdminOverview() {
  const tbody = $("#admin-theme-overview");
  if (!tbody) return;
  tbody.innerHTML = THEMES.map((t) => {
    const count = bookingCounts[t.id] || 0;
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

function renderAdminList(bookings = latestBookings) {
  const tbody = $("#booking-list-body");
  if (!tbody) return;

  const countEl = $("#booking-count");
  if (countEl) countEl.textContent = bookings.length;

  if (bookings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">目前尚無預約資料。</td></tr>`;
    return;
  }

  const sorted = [...bookings].sort((a, b) => String(a.themeId).localeCompare(String(b.themeId)));
  tbody.innerHTML = sorted.map((b) => {
    const theme = THEMES.find((t) => t.id === b.themeId);
    const createdAt = b.createdAt?.toDate ? b.createdAt.toDate().toLocaleString("zh-TW") : "—";
    const dependents = Array.isArray(b.dependents) ? b.dependents : [];
    const totalPeople = Number(b.totalPeople) || (1 + dependents.length);
    const dependentNames = dependents.length ? dependents.map((d) => d.name).join("、") : "無";
    return `
      <tr>
        <td>${b.displayName || "—"}</td>
        <td>${b.email}</td>
        <td>${theme?.name || b.themeId}</td>
        <td><strong>${totalPeople} 人</strong><br><span class="table-subtext">眷屬：${dependentNames}</span></td>
        <td>${createdAt}</td>
        <td><button class="btn-admin-del" data-uid="${b.uid}" data-theme="${b.themeId}">刪除</button></td>
      </tr>`;
  }).join("");

  $$(".btn-admin-del").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm(`確定要刪除這筆預約嗎？`)) return;
      try {
        await adminDeleteBooking(btn.dataset.uid);
        showToast("已刪除預約。");
      } catch (err) {
        showToast("刪除失敗，請稍後再試。", true);
      }
    });
  });
}

async function loadAdminList() {
  try {
    latestBookings = await getAllBookings();
    renderAdminList(latestBookings);
  } catch (err) {
    const tbody = $("#booking-list-body");
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="error-cell">載入失敗，請重新整理。</td></tr>`;
    console.error(err);
  }
}

async function exportCSV() {
  const bookings = await getAllBookings();
  const header = ["姓名", "Email", "主題", "總人數", "眷屬", "報名時間"];
  const rows = bookings.map((b) => {
    const theme = THEMES.find((t) => t.id === b.themeId);
    const createdAt = b.createdAt?.toDate ? b.createdAt.toDate().toLocaleString("zh-TW") : "";
    const dependents = Array.isArray(b.dependents) ? b.dependents : [];
    const totalPeople = b.totalPeople || (1 + dependents.length);
    const dependentNames = dependents.map((d) => d.name).join("、");
    return [b.displayName || "", b.email, theme?.name || b.themeId, totalPeople, dependentNames, createdAt]
      .map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");
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
