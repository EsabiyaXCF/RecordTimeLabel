# RecordTimeLabel ⏱️

> **跨平台、雲端同步的 YouTube / Twitch 時間標記管理工具**

![version](https://img.shields.io/badge/version-2.9-blue?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)
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

## ✨ 功能總覽

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

1. **下載專案並安裝依賴**
   ```bash
   git clone https://github.com/yourname/RecordTimeLabel_ui.git
   cd RecordTimeLabel_ui
   npm install
   ```
2. **開發模式啟動**
   ```bash
   npm run dev
   ```
   透過 Vite 進行即時熱重載。
3. **生產環境打包**
   ```bash
   npm run build
   ```
   打包後生成 `dist` 目錄。
4. **載入至 Chrome**
   - 打開 `chrome://extensions/`，啟用「開發者模式」。
   - 點擊「載入未封裝項目」，選取 `dist` 資料夾。
5. **登入啟用雲端同步**
   - 點擊擴充圖示 → 登入 Google 帳號，即可開始自動同步。

> **提示**：若您只想本機使用，登入步驟可略過，擴充功能將以離線模式運作。

---

## 🖼️ 介面截圖

> 放置幾張 GIF / PNG 展示核心功能（雲端同步指示器、批次模式、智能整理等）。

---

## 🔄 指令與腳本

| 指令 | 說明 |
| --- | --- |
| `npm run dev` | 開啟開發伺服器 (Vite) |
| `npm run build` | 生產環境打包 (Vite + Terser) |
| `npm run lint` | 使用 ESLint 檢查程式碼 |
| `npm run format` | 使用 Prettier 美化程式碼 |

---

## 🛠️ 技術棧

- **React 18** + **Vite**：極速前端開發體驗。
- **Tailwind CSS**：原子化 CSS，快速調整 UI。
- **Firebase**：Authentication + Firestore，實現即時雲端同步。
- **Dnd Kit**：拖放排序。
- **Lucide Icons**：精緻圖示。
- **Chrome Manifest V3**：最新擴充功能標準。

---

## 🔐 隱私與安全

- 僅儲存必要資訊 (email、UID)。
- 資料加密傳輸 (HTTPS)。
- 可隨時刪除雲端資料，並支援離線使用模式。

---

## 🗺️ Roadmap

- [ ] Safari / Firefox 版本
- [ ] 更多語言翻譯
- [ ] AI 自動摘要 / 標記推薦
- [ ] 匯出為可分享的互動時間線

歡迎在 [Issue](https://github.com/yourname/RecordTimeLabel_ui/issues) 提出建議！

---

## 🤝 貢獻指南

1. Fork 專案並建立分支。
2. 提交 Pull Request 前請執行 `npm run lint && npm run format`。
3. 詳細描述您的變更內容與動機。

---

## 📄 授權

本專案採用 **MIT License**，歡迎自由使用與二次開發。