// ======================================================
// firebase-db.js
// 所有 Firebase 登入與 Firestore 讀寫集中在此
//
// 資料表（collection），文件 ID 一律用小寫的公司信箱：
//   picnicGroups/{groupId}    { count, teamName, teamNameBy, lastChange }
//                             各組人數與隊名，所有登入者可讀
//   picnicJoins/{email}       選組資料（本人報名或隊長代報）
//                             所有登入者可讀，用來顯示組員名單
//   picnicAbsences/{email}    不能參加的回報與原因，只有本人與管理員可讀
//
// lastChange 記錄這次是誰加入或離開，讓安全規則確認人數有跟著正確增減。
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
  deleteDoc,
  updateDoc,
  collection,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const GROUPS_COL = "picnicGroups";
const JOINS_COL = "picnicJoins";
const ABSENCES_COL = "picnicAbsences";

const normEmail = (email) => String(email || "").trim().toLowerCase();

// ---- 登入 ----

async function loginWithGoogle() { await signInWithPopup(auth, provider); }
async function logout() { await signOut(auth); }
function onAuthChange(callback) { return onAuthStateChanged(auth, callback); }

// ---- 即時監聽 ----

/** 各組資料：{ groupId: { count, teamName, teamNameBy } } */
function onGroupsChange(callback) {
  return onSnapshot(collection(db, GROUPS_COL), (snapshot) => {
    const groups = {};
    snapshot.forEach((d) => {
      const data = d.data();
      groups[d.id] = { count: Number(data.count) || 0, teamName: data.teamName || "", teamNameBy: data.teamNameBy || "" };
    });
    callback(groups);
  });
}

/** 所有選組資料 */
function onJoinsChange(callback) {
  return onSnapshot(collection(db, JOINS_COL), (snapshot) => {
    callback(snapshot.docs.map((d) => d.data()));
  });
}

/** 本人的不能參加回報 */
function onMyAbsenceChange(email, callback) {
  return onSnapshot(doc(db, ABSENCES_COL, normEmail(email)), (snap) => {
    callback(snap.exists() ? snap.data() : null);
  });
}

/** 全部不能參加回報（管理員） */
function onAllAbsencesChange(callback) {
  return onSnapshot(collection(db, ABSENCES_COL), (snapshot) => {
    callback(snapshot.docs.map((d) => d.data()));
  });
}

// ---- 選組 ----

/**
 * 把一個人加進某組。
 * 本人報名：member 就是自己；隊長代報：member 是隊友。
 * @param {object} actor  目前登入者 { email, displayName }
 * @param {object} member 要加入的人 { email }
 */
async function addMember(actor, member, groupId, capacity) {
  const actorEmail = normEmail(actor.email);
  const memberEmail = normEmail(member.email);
  const isSelf = actorEmail === memberEmail;

  const joinRef = doc(db, JOINS_COL, memberEmail);
  const absenceRef = doc(db, ABSENCES_COL, memberEmail);
  const groupRef = doc(db, GROUPS_COL, groupId);

  await runTransaction(db, async (tx) => {
    const [joinSnap, groupSnap] = await Promise.all([tx.get(joinRef), tx.get(groupRef)]);
    if (joinSnap.exists()) throw new Error(isSelf ? "ALREADY_JOINED" : "MEMBER_TAKEN");
    if (!groupSnap.exists()) throw new Error("NOT_READY");

    // 不能參加的回報只有本人與管理員看得到，代報時讀不到，交給安全規則擋
    if (isSelf) {
      const absenceSnap = await tx.get(absenceRef);
      if (absenceSnap.exists()) throw new Error("MARKED_ABSENT");
    }

    const count = Number(groupSnap.data().count) || 0;
    if (count + 1 > capacity) throw new Error("FULL");

    tx.update(groupRef, { count: count + 1, lastChange: memberEmail });
    tx.set(joinRef, {
      email: memberEmail,
      // 代報時先放帳號，本人登入後再換成他的名字
      displayName: isSelf ? (actor.displayName || memberEmail.split("@")[0]) : memberEmail.split("@")[0],
      groupId,
      addedBy: actorEmail,
      addedByName: actor.displayName || "",
      createdAt: serverTimestamp()
    });
  });
}

/** 把一個人移出組別：本人退出、隊長移除自己加的人、管理員刪除 */
async function removeMember(email) {
  const memberEmail = normEmail(email);
  const joinRef = doc(db, JOINS_COL, memberEmail);

  await runTransaction(db, async (tx) => {
    const joinSnap = await tx.get(joinRef);
    if (!joinSnap.exists()) return;

    const groupRef = doc(db, GROUPS_COL, joinSnap.data().groupId);
    const groupSnap = await tx.get(groupRef);
    const count = groupSnap.exists() ? Number(groupSnap.data().count) || 0 : 1;
    const nextCount = Math.max(0, count - 1);

    // 最後一位離開時，隊名一起清掉，讓下一隊重新取名
    tx.update(groupRef, nextCount === 0
      ? { count: 0, lastChange: memberEmail, teamName: "", teamNameBy: "" }
      : { count: nextCount, lastChange: memberEmail });
    tx.delete(joinRef);
  });
}

/** 被代報的人登入後，把名單上的帳號換成本人的名字 */
async function updateMyDisplayName(user) {
  if (!user.displayName) return;
  await updateDoc(doc(db, JOINS_COL, normEmail(user.email)), { displayName: user.displayName });
}

/** 組員修改自己組的隊名 */
async function setTeamName(user, groupId, teamName) {
  await updateDoc(doc(db, GROUPS_COL, groupId), {
    teamName,
    teamNameBy: normEmail(user.email)
  });
}

// ---- 不能參加 ----

/** 回報不能參加（已在組裡的人要先退出） */
async function reportAbsence(user, reasonType, reasonNote) {
  const email = normEmail(user.email);
  const joinRef = doc(db, JOINS_COL, email);
  const absenceRef = doc(db, ABSENCES_COL, email);

  await runTransaction(db, async (tx) => {
    const [joinSnap, absenceSnap] = await Promise.all([tx.get(joinRef), tx.get(absenceRef)]);
    if (joinSnap.exists()) throw new Error("ALREADY_JOINED");

    tx.set(absenceRef, {
      email,
      displayName: user.displayName || "",
      reasonType,
      reasonNote,
      createdAt: absenceSnap.exists() ? absenceSnap.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}

/** 撤回不能參加的回報；管理員也可刪除 */
async function withdrawAbsence(email) {
  await deleteDoc(doc(db, ABSENCES_COL, normEmail(email)));
}

// ---- 管理員 ----

async function getAllJoins() {
  const snap = await getDocs(collection(db, JOINS_COL));
  return snap.docs.map((d) => d.data());
}

async function getAllAbsences() {
  const snap = await getDocs(collection(db, ABSENCES_COL));
  return snap.docs.map((d) => d.data());
}

/** 依選組資料重新計算各組人數；第一次使用時也會建立各組文件 */
async function rebuildGroupCounts(groupIds = []) {
  const joins = await getAllJoins();
  const counts = {};
  groupIds.forEach((id) => { counts[id] = 0; });
  joins.forEach((j) => { if (j.groupId in counts) counts[j.groupId] += 1; });

  const batch = writeBatch(db);
  Object.entries(counts).forEach(([groupId, count]) => {
    batch.set(doc(db, GROUPS_COL, groupId), { count }, { merge: true });
  });
  await batch.commit();
  return counts;
}

export {
  auth,
  normEmail,
  loginWithGoogle,
  logout,
  onAuthChange,
  onGroupsChange,
  onJoinsChange,
  onMyAbsenceChange,
  onAllAbsencesChange,
  addMember,
  removeMember,
  setTeamName,
  updateMyDisplayName,
  reportAbsence,
  withdrawAbsence,
  getAllJoins,
  getAllAbsences,
  rebuildGroupCounts
};
