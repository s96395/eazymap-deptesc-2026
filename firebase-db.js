// ======================================================
// firebase-db.js
// 所有 Firestore 資料庫操作集中在此
// ======================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

// --- 初始化 ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ---- Auth ----

/** Google 登入（Popup） */
async function loginWithGoogle() {
  await signInWithPopup(auth, provider);
}

/** 登出 */
async function logout() {
  await signOut(auth);
}

/** 監聽登入狀態 */
function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ---- 主題名額即時監聽 ----

/**
 * 監聽各主題已報名人數
 * @param {function} callback - 收到 { themeId: count } 物件
 */
function onBookingCountsChange(callback) {
  return onSnapshot(collection(db, "bookings"), (snapshot) => {
    const counts = {};
    snapshot.forEach((d) => {
      const data = d.data();
      counts[data.themeId] = (counts[data.themeId] || 0) + 1;
    });
    callback(counts);
  });
}

// ---- 使用者預約 ----

/**
 * 查詢目前登入者是否已有預約
 * @param {string} uid
 * @returns {object|null} 預約資料或 null
 */
async function getMyBooking(uid) {
  const ref = doc(db, "bookings", uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

/**
 * 建立或更新預約（含 transaction 防超訂）
 * @param {object} user - { uid, email, displayName }
 * @param {string} themeId
 * @param {number} maxCapacity - 該主題人數上限
 */
async function upsertBooking(user, themeId, maxCapacity) {
  const bookingRef = doc(db, "bookings", user.uid);
  const counterRef = doc(db, "counters", themeId);

  await runTransaction(db, async (tx) => {
    // 先讀取目前預約（看是否要退舊的）
    const existingSnap = await tx.get(bookingRef);
    const oldThemeId = existingSnap.exists() ? existingSnap.data().themeId : null;

    // 讀取新主題計數
    const counterSnap = await tx.get(counterRef);
    const currentCount = counterSnap.exists() ? counterSnap.data().count : 0;

    // 若換的是不同主題，才需要檢查名額
    if (oldThemeId !== themeId) {
      if (currentCount >= maxCapacity) {
        throw new Error("FULL");
      }
      // 舊主題計數 -1
      if (oldThemeId) {
        const oldCounterRef = doc(db, "counters", oldThemeId);
        const oldSnap = await tx.get(oldCounterRef);
        const oldCount = oldSnap.exists() ? oldSnap.data().count : 1;
        tx.set(oldCounterRef, { count: Math.max(0, oldCount - 1) });
      }
      // 新主題計數 +1
      tx.set(counterRef, { count: currentCount + 1 });
    }

    // 寫入預約
    tx.set(bookingRef, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || "",
      themeId,
      createdAt: existingSnap.exists() ? existingSnap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}

/**
 * 取消預約
 * @param {string} uid
 * @param {string} themeId
 */
async function cancelBooking(uid, themeId) {
  const bookingRef = doc(db, "bookings", uid);
  const counterRef = doc(db, "counters", themeId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists()) return;
    const counterSnap = await tx.get(counterRef);
    const count = counterSnap.exists() ? counterSnap.data().count : 1;
    tx.set(counterRef, { count: Math.max(0, count - 1) });
    tx.delete(bookingRef);
  });
}

// ---- 管理員操作 ----

/**
 * 取得所有預約（管理員用）
 * @returns {Array} 預約清單
 */
async function getAllBookings() {
  const snap = await getDocs(collection(db, "bookings"));
  return snap.docs.map((d) => d.data());
}

/**
 * 管理員刪除指定預約
 * @param {string} uid
 * @param {string} themeId
 */
async function adminDeleteBooking(uid, themeId) {
  await cancelBooking(uid, themeId);
}

export {
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
};
