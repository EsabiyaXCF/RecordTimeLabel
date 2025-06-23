# RecordTimeLabel ⏱️

> **跨平台、雲端同步的 YouTube / Twitch 時間標記管理工具**

![version](https://img.shields.io/badge/version-2.2-blue?style=flat-square)
![license](https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square)
![chrome-web-store](https://img.shields.io/badge/Chrome%20Web%20Store-Coming%20Soon-orange?style=flat-square)

RecordTimeLabel 是一款專為直播愛好者打造的瀏覽器擴充功能，能夠 **即時記錄直播或 VOD 的時間點**，並以資料夾方式進行整理、批次管理，同時支援 **雲端同步** 與 **多語言介面**。讓你在 YouTube 與 Twitch 之間穿梭自如，再也不怕錯過精彩片段！

---

## 📌 為什麼選擇 RecordTimeLabel？

| 功能 | RecordTimeLabel | 傳統書籤 | 手寫筆記 |
| :-- | :--: | :--: | :--: |
| 一鍵記錄時間戳 | ✅ | ❌ | ❌ |
| 精準跳轉直播/回放 | ✅ | ⚠️ (須自行換算) | ❌ |
| 資料夾 + 拖放整理 | ✅ | ⚠️ (有限) | ❌ |
| 批次移動/刪除 | ✅ | ❌ | ❌ |
| 雲端自動同步 | ✅ | ❌ | ❌ |
| 多語言介面 | ✅ | ❌ | ❌ |
| 智能整理 (頻道分組) | ✅ | ❌ | ❌ |
| 右鍵捷徑功能 | ✅ | ❌ | ❌ |

> **一句話總結**：如果你經常在直播、VOD 之間來回找片段，RecordTimeLabel 將大幅節省你的時間。

---

## ✨ 最新功能總覽

### 1. 雲端同步
- **Google / Email 登入**，跨裝置同步紀錄與資料夾。
- 離線操作也能先緩存，恢復連線後自動上傳。
- 隨時透過 **刪除雲端資料** 功能，一鍵清空遠端資料。

### 2. 智能整理
- 掃描所有紀錄的「頻道名稱」，自動建立資料夾並搬移紀錄。
- 整理前預覽數量，整理完成顯示統計結果。

### 3. 批次模式
- **全選 / 取消**、**批次移動**、**批次刪除**。
- 適用大量紀錄管理，一次操作完成。

### 4. 內嵌按鈕 (Embeds)
- 直接在 YouTube / Twitch 播放器上顯示「新增紀錄」按鈕。
- 支援快速設定 **時間戳偏移**（例如 `(-10s)`）。

### 5. 時間戳偏移設定
- 回溯記錄剛剛錯過的精彩瞬間。
- 支援即時預覽原始時間與偏移後時間。

### 6. 右鍵選單
- **紀錄右鍵**：編輯筆記、複製帶時間戳連結、刪除。
- **資料夾右鍵**：重新命名、刪除（紀錄自動搬移至「未分類」）。

### 7. 多語言介面
- 繁體中文 / English / 日本語。
- 可於設定中即時切換，介面瞬間更新。


---

## 🚀 快速上手

1. **下載 Release**
   - 前往 [Releases](https://github.com/yourname/RecordTimeLabel_ui/releases) 頁面，下載最新版 `RecordTimeLabel_x.x.x.zip`（或 `.crx`）。
2. **解壓縮檔案**
   - 將壓縮檔解壓縮後，取得資料夾（通常包含 `manifest.json` 與 `dist/` 內容）。
3. **載入至 Chrome**
   - 打開 `chrome://extensions/`，啟用「開發者模式」。
   - 點擊「載入未封裝項目」，選取剛剛解壓縮的資料夾。
4. **登入啟用雲端同步（可選）**
   - 點擊擴充圖示 → 登入 Google 帳號，即可開始自動同步。

> **提示**：若您只想本機使用，登入步驟可略過，擴充功能將以離線模式運作。

本專案採用 **GPL-3.0 License**，歡迎依照授權條款自由使用、修改與散布。
