# 部門活動報名網站

目前版本：**2026/12/4 易圖日・易起野餐趣 分組報名**

純前端靜態網站，用 Firebase Authentication（Google 登入）和 Cloud Firestore 存資料，部署在 Vercel。

## 功能

報名頁（`index.html`）

- 活動資訊、流程、要帶的東西、福委會準備的東西
- 8 組，每組 8 人，各組組員與隊名公開顯示
- 自己選組，或由隊長先加入再輸入隊友帳號（信箱 @ 前面）代報
- 組員可以取隊名、改隊名；代報的人可以移除自己加的隊友
- 預設全員參加，不能來的人填原因回報，之後可修改或撤回

管理後台（`admin.html`）

- 已選組、不能參加、還沒回覆的人數
- 各組名單（含誰代報），可刪除
- 不能參加名單，活動前三天匯出給處長
- 匯出分組名單 CSV、不能參加名單 CSV

## 檔案

```
index.html          報名頁
admin.html          管理後台
app.js              報名頁程式
admin.js            後台程式
event-config.js     活動設定（下次改版主要改這裡）
firebase-db.js      Firebase 登入與資料讀寫
firebase-config.js  Firebase 專案設定
firestore.rules     Firestore 安全規則
style.css           樣式
```

## 資料結構

文件 ID 一律是小寫的公司信箱。

| Collection | 內容 | 誰能讀 |
| --- | --- | --- |
| `picnicGroups/{group-1…8}` | `count` 人數、`teamName` 隊名 | 所有登入者 |
| `picnicJoins/{email}` | 組別、姓名、代報人 | 所有登入者 |
| `picnicAbsences/{email}` | 不能參加的原因 | 本人、管理員 |

加入或退出時，會在同一個 transaction 裡同時更新 `picnicJoins` 和 `picnicGroups.count`，安全規則會檢查人數有沒有正確增減、有沒有超過上限。

## 上線步驟

1. 到 Firebase Console → Firestore → 規則，貼上 `firestore.rules` 的內容並發布。
2. 部署網站（Vercel 會在 push 後自動更新）。
3. 用管理員帳號登入 `admin.html`，到「設定」分頁按一次「建立組別並重新計算」，同仁才能開始選組。

舊的密室逃脫資料（`bookings`、`counters`）不會被刪除，但新規則不再開放讀寫。

## 下次改版要改哪裡

- 活動名稱、日期、地點、流程、注意事項、回報截止日：`event-config.js`
- 組數、每組人數、公司信箱網域、不能參加的原因選項：`event-config.js` **和** `firestore.rules` 都要改
- 管理員名單：`event-config.js` 的 `ADMIN_EMAILS` 和 `firestore.rules` 的 `isAdmin()`

## 管理員帳號

- yoyoshen@gis.fcu.edu.tw
- irishuang@gis.fcu.edu.tw
- clarachou@gis.fcu.edu.tw
- aaronhsu@gis.fcu.edu.tw
