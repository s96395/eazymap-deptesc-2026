# 部門密室逃脫活動報名系統

## 檔案結構

```
escape-room-booking/
├── index.html          # 主頁面
├── style.css           # 樣式
├── app.js              # 應用程式邏輯
├── firebase-db.js      # Firestore 操作
└── firebase-config.js  # Firebase 設定（需自行填入）
```

---

## 步驟一：建立 Firebase 專案

1. 前往 [Firebase Console](https://console.firebase.google.com/)，建立新專案
2. 左側選單 → **Authentication** → 啟用 **Google** 登入方式
3. 左側選單 → **Firestore Database** → 建立資料庫（選 Production mode）
4. 左側選單 → **專案設定** → 「你的應用程式」→ 複製 SDK 設定物件

---

## 步驟二：填入 Firebase 設定

開啟 `firebase-config.js`，將下方欄位換成你的專案資訊：

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

---

## 步驟三：設定 Firestore 安全規則

在 Firebase Console → Firestore → 規則，貼上以下內容：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // 預約資料：本人可讀寫，管理員可讀（透過 Admin SDK）
    match /bookings/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      allow read: if request.auth != null &&
        request.auth.token.email in [
          'yoyoshen@gis.fcu.edu.tw',
          'irishuang@gis.fcu.edu.tw',
          'clarachou@gis.fcu.edu.tw'
        ];
    }

    // 計數器：登入者可讀，寫入限 transaction（由規則允許 uid 驗證）
    match /counters/{themeId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

---

## 步驟四：部署到 Vercel

1. 將這 5 個檔案放進一個資料夾，推上 GitHub
2. 前往 [Vercel](https://vercel.com/)，Import 該 repo
3. Framework Preset 選 **Other**，不需要 Build Command
4. 部署完成後，到 Firebase Console → Authentication → **已授權的網域**，加入你的 Vercel 網址（例如 `your-project.vercel.app`）

---

## 管理員帳號

以下 3 個帳號登入後會自動進入管理後台：

- yoyoshen@gis.fcu.edu.tw
- irishuang@gis.fcu.edu.tw
- clarachou@gis.fcu.edu.tw

管理後台功能：
- 各主題名額即時總覽
- 查看所有預約名單
- 刪除任意預約
- 匯出 CSV（含姓名、Email、主題、報名時間）

---

## 注意事項

- 每個 Google 帳號只能選一個主題，可自行取消或換主題
- 名額額滿後該主題會自動鎖定，無法選擇
- 名額計算使用 Firestore Transaction，防止超訂
- 攜帶眷屬請注意：**眷屬費用需自行負擔**
