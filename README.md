# 部門密室逃脫活動報名系統

## 系統架構

本系統是純前端靜態網站，透過 Firebase Authentication 進行 Google 登入，並使用 Cloud Firestore 儲存預約資料與即時名額。

### 資料流

- `counters` 是唯一公開名額同步來源。
  - 前台與管理後台的名額總覽都只讀取 `counters/{themeId}.count`。
  - 一般使用者不需要、也不應讀取所有 `bookings` 明細。
- `bookings` 是預約明細來源。
  - 一般使用者只讀取自己的 `bookings/{uid}`。
  - 管理員才讀取全部 `bookings`，用於後台名單與 CSV 匯出。
- 建立、取消、管理員刪除預約時，系統會在 Firestore Transaction 中同步更新 `bookings` 與 `counters`。

```
一般使用者
├── 讀 counters/{themeId}       # 即時名額
└── 讀/寫 bookings/{own uid}    # 自己的預約

管理員
├── 讀 counters/{themeId}       # 名額總覽
└── 讀全部 bookings             # 預約名單與 CSV
```

## 檔案結構

```
escape-room-booking/
├── index.html          # 主頁面
├── admin.html          # 管理後台
├── style.css           # 樣式
├── app.js              # 前台應用程式邏輯
├── admin.js            # 後台應用程式邏輯
├── firebase-db.js      # Firebase Auth / Firestore 操作
├── firebase-config.js  # Firebase 設定
└── firestore.rules     # Firestore 安全規則
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

## 步驟三：初始化 counters 文件

請先在 Firestore 建立以下 `counters` 文件，每個文件都需有 `count: 0`：

| Collection | Document ID | 欄位 |
| --- | --- | --- |
| `counters` | `butterfly-valley` | `{ count: 0 }` |
| `counters` | `death-attic` | `{ count: 0 }` |
| `counters` | `forsaken-girl` | `{ count: 0 }` |
| `counters` | `diesel-street` | `{ count: 0 }` |
| `counters` | `dark-alley` | `{ count: 0 }` |

> 注意：正式規則要求 counter 文件已存在，使用者建立預約時才會在 transaction 中更新既有 counter。

---

## 步驟四：設定 Firestore 安全規則

在 Firebase Console → Firestore → 規則，貼上 `firestore.rules` 的內容。

規則重點：

- 一般使用者可讀所有 `counters`，用於同步即時名額。
- 一般使用者只可讀取、建立、刪除自己的 `bookings/{uid}`。
- 一般使用者不可直接修改既有 booking；如需更改主題或眷屬，必須先取消再重新預約。
- 管理員可讀全部 `bookings`，用於管理後台與 CSV 匯出。
- counters 的寫入必須搭配同一筆 booking transaction，避免一般使用者任意竄改名額。

---

## 步驟五：部署到 Vercel

1. 將檔案推上 GitHub
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

- 各主題名額即時總覽（讀取 counters）
- 查看所有預約名單（讀取 bookings）
- 刪除任意預約（transaction 會依 booking 內的主題與人數扣回 counters）
- 匯出 CSV（含姓名、Email、主題、總人數、眷屬、報名時間）

---

## 注意事項

- 每個 Google 帳號只能選一個主題。
- 如需更改主題、眷屬或人數，請先取消目前預約後重新報名。
- 名額額滿後該主題會自動鎖定，無法選擇。
- 名額計算使用 Firestore Transaction，防止超訂。
- 攜帶眷屬請注意：**眷屬費用需自行負擔**。
