// ======================================================
// event-config.js — 活動設定（前台、後台共用）
// 改版時優先修改這個檔案；組數或每組上限有改，
// firestore.rules 裡的 groupCapacity / validGroup / companyEmail 也要一起改。
// ======================================================

const EVENT = {
  name: "易圖日・易起野餐趣",
  slogan: "易起相聚，圖的是感情！",
  date: "2026 年 12 月 4 日（五）",
  time: "15:00–17:00",
  place: "逢甲草皮或綠美圖草皮（確定後另行通知）",
  people: "周老師、各處處長（代表）、福委會成員及空資處全體同仁",
  replyDeadline: "11 月 25 日（三）",  // 報名截止日：選組與回報不能參加都在這天前完成
  // 從這個時間起同仁不能再改，只有管理員能在後台調整。
  // 改這裡時，firestore.rules 的 isOpen() 也要改成同一個時間。
  lockAt: "2026-11-26T00:00:00+08:00",
  staffCount: 50   // 需要選組的同仁人數（不含主管、周老師、福委）
};

// 同仁 50 人分 8 組，每組上限 8 人；
// 6 位主管之後隨機分進各組。
const GROUP_CAPACITY = 8;
const GROUPS = Array.from({ length: 8 }, (_, i) => ({
  id: `group-${i + 1}`,
  name: `第 ${i + 1} 組`
}));

const AGENDA = [
  { title: "野餐準備", note: "領取餐盒、找位子鋪野餐墊" },
  { title: "周老師開場", note: "" },
  { title: "YOYO 帶遊戲", note: "靈魂畫師，以組為單位比賽" },
  { title: "頒獎", note: "總冠軍組獎金 1,000 元" },
  { title: "自由時間", note: "聊天、吃東西、拍照" }
];

const BRING_ITEMS = ["筆", "野餐墊", "想吃的食物"];

const PROVIDED_ITEMS = [
  "向陽房餐盒＋鬆餅（一人一份）",
  "迷克夏飲料分享桶",
  "普通塑膠墊",
  "濕紙巾"
];

const ABSENCE_REASONS = ["公假", "出差", "請假", "客戶會議或外部行程", "其他"];

// 隊長代報時只輸入帳號，系統自動補上這個網域
const EMAIL_DOMAIN = "gis.fcu.edu.tw";

const ADMIN_EMAILS = [
  "yoyoshen@gis.fcu.edu.tw",
  "irishuang@gis.fcu.edu.tw",
  "clarachou@gis.fcu.edu.tw",
  "aaronhsu@gis.fcu.edu.tw"
];

/** 報名是否已截止（畫面用；真正擋住修改的是 firestore.rules） */
const isLocked = () => Date.now() >= new Date(EVENT.lockAt).getTime();

export { isLocked, EVENT, GROUP_CAPACITY, GROUPS, AGENDA, BRING_ITEMS, PROVIDED_ITEMS, ABSENCE_REASONS, EMAIL_DOMAIN, ADMIN_EMAILS };
