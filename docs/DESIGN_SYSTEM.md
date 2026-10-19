# 🎨 Family Kitchen 2.0 設計系統規範書 (Design System Specification)

> 📌 **系統定位**：家庭智慧備料計算機、飲食紀錄 Tracker 與智慧冰箱管理系統。  
> 🌿 **設計哲學**：**韓系奶油極簡（Korean Creamy Minimalist）** 結合 **減法美學** 與 **防焦慮視覺（Anti-Anxiety Design）**。以溫潤的大地奶灰、柔和飽和度的人物專屬色、毛玻璃微光與細膩微互動，為家庭日常帶來從容、優雅且高效的慢生活料理體驗。

---

## 目录 (Table of Contents)
1. [設計原則與哲學 (Design Principles)](#1-設計原則與哲學-design-principles)
2. [色彩系統權威矩陣 (Color System & Tokens)](#2-色彩系統權威矩陣-color-system--tokens)
3. [排版與文字階層 (Typography & Hierarchy)](#3-排版與文字階層-typography--hierarchy)
4. [間距、圓角與陰影 (Spacing, Radii & Shadows)](#4-間距圓角與陰影-spacing-radii--shadows)
5. [狀態標籤與回饋機制 (Status & Feedback Indicators)](#5-狀態標籤與回饋機制-status--feedback-indicators)
6. [核心元件庫規格 (Component Library Specs)](#6-核心元件庫規格-component-library-specs)
   - 6.1 膠囊元件體系 (Capsule System)
   - 6.2 03 備料大白板 (Portions Whiteboard)
   - 6.3 04 成員專屬卡片 (Member Portions Card)
   - 6.4 飲食進度條與快捷美食庫 (Tracker Progress & Favorites)
   - 6.5 智慧採買清單全螢幕視窗 (Shopping Cart Modal)
   - 6.6 統一 AI 視覺取景視窗 (Camera Vision Modal)
7. [時段智慧推薦規則 (Time-Slot Recommendation Engine)](#7-時段智慧推薦規則-time-slot-recommendation-engine)
8. [佈局與手勢操作規範 (Layout & Motion Standards)](#8-佈局與手勢操作規範-layout--motion-standards)
9. [系統全面向量 SVG 圖示規範 (SVG Vector Icon Matrix)](#9-系統全面向量-svg-圖示規範-svg-vector-icon-matrix)
   - 9.1 [全系統 SVG 統一線條粗細原則 (Strict Uniform Stroke Width)](#91-全系統-svg-統一線條粗細原則-strict-uniform-stroke-width)
   - 9.2 [Bottom Navigation Dock（現行實作規格）](#92-bottom-navigation-dock現行實作規格)

---

## 1. 設計原則與哲學 (Design Principles)

1. **黃金首頁（Above the Fold）**：
   - 捨棄沉重的 Header 大 Banner，把手機首頁第一屏 100% 留給「料理選擇」與「核心食材選取」，開頁即用、零多餘滾動。
2. **減法抗焦慮（Calm & Clean）**：
   - 移除所有干擾性圖示（如多餘的 ⭐ 星號、雜亂的裝飾線條）。
   - 透過「白底、奶灰、柔和綠框」等乾淨色彩，降低做飯時的心理負擔。
3. **大拇指友善（Thumb-Zone Ergonomics）**：
   - 底部常駐純白固定 Dock（左右四個導航圖示及中央突出圓鈕），核心操作位於單手大拇指容易觸及的區域；實際規格見 9.2。
4. **實體感微互動（Tactile Feedback）**：
   - 短按（Toggle）與 750ms 重長按（Inspect）明確分流，輔以微縮放與平滑位移過渡。

---

## 2. 色彩系統權威矩陣 (Color System & Tokens)

### 2.1 基礎介面色 (Base Interface Tokens)

| Token 名稱 | 色碼 (HEX / RGBA) | 用途與說明 |
| :--- | :--- | :--- |
| `--color-bg-base` | `#F8F6F0` (暖奶米灰) | 全域頁面底色，營造溫潤居家感 |
| `--color-surface-card` | `#FFFFFF` (純白) | 卡片、Modal、白板等主要容器底色 |
| `--color-surface-soft` | `#F3F0EA` (軟柔灰) | 次級區塊底色、無庫存/停用背景 |
| `--color-border-subtle` | `#E8E5DD` (淡灰線) | 卡片邊框、分隔線、預設膠囊邊框 |
| `--color-text-main` | `#2D2A26` (炭墨褐) | 主要標題、數值、按鈕文字 |
| `--color-text-muted` | `#8C867A` (晨霧灰) | 次要標籤、單位、輔助說明文字 |

### 2.2 家庭成員識別色 (Family Profile Accents)

| 成員 (Member) | 代表色 (Token) | 色碼 (HEX) | 應用情境 |
| :--- | :--- | :--- | :--- |
| **Bebe (😊)** | 暖陽金黃 (`--accent-bebe`) | `#FFCA60` | Bebe 專屬卡片標記、重點 CTA 亮黃按鈕 |
| **Ariel / 樂樂 (❤️)** | 珊瑚朱紅 (`--accent-ariel`) | `#E16262` | 樂樂專屬卡片標記、刪除/警示標籤 |
| **Jason / J (🪨)** | 湖水藍綠 (`--accent-jason`) | `#7DC7CC` | Jason 專屬卡片標記、高蛋白特調標籤 |

### 2.3 狀態與健康信號色 (Semantic Status Tokens)

| 狀態名稱 | 色碼 (HEX) | 語意說明 |
| :--- | :--- | :--- |
| **🟢 安全 / 達標 (Safe)** | `#10B981` (薄荷綠) | 庫存充足、營養數值在安全預算內 |
| **⚫️ 累積中 (In Progress)** | `#6B7280` (冷炭灰) | 單餐攝取未達全天目標值 |
| **🔴 超標 (Over Limit)** | `#EF4444` (警示紅) | 全天熱量/鈉/脂肪攝取超過預算上限 |

---

## 3. 排版與文字階層 (Typography & Hierarchy)

* **英數專數字體**：`Inter`, `-apple-system`, `sans-serif`
* **中文字體**：`Noto Sans TC`, `PingFang TC`, `微軟正黑體`, `sans-serif`

| 層級 (Level) | 尺寸 (Size) | 字重 (Weight) | 行高 (Line Height) | 範例應用 |
| :--- | :--- | :--- | :--- | :--- |
| **Display (H1)** | 22px / 1.375rem | 700 (Bold) | 1.2 | 頁面主標題 `FAMILY KITCHEN 2.0` |
| **Title (H2)** | 16px / 1.0rem | 700 (Bold) | 1.3 | 區塊標題 `01 DISH 選擇料理` |
| **Subtitle (H3)** | 14px / 0.875rem | 600 (SemiBold)| 1.4 | 營養素分類標題、成員名稱 |
| **Body (內文)** | 14px / 0.875rem | 400 (Regular) | 1.5 | SOP 步驟、食材名稱、清單文字 |
| **Caption (標註)** | 12px / 0.75rem | 500 (Medium) | 1.4 | 單位標籤、基準值 `(100g)`、時段徽章 |
| **Number (數據)** | 18px ~ 24px | 700 (Bold) | 1.1 | 備料克數、總熱量數值 |

---

## 4. 間距、圓角與陰影 (Spacing, Radii & Shadows)

### 4.1 圓角規範 (Border Radii)
* **膠囊 (Capsules / Tags)**：`20px` (完全圓角 Pill Shape)
* **卡片 / 大白板 (Cards / Modals)**：`16px ～ 20px` (溫潤大圓角)
* **小型按鈕 / 輸入框 (Inputs / Buttons)**：`8px ～ 12px`

### 4.2 陰影系統 (Shadow Elevation)
* **Card Shadow (卡片浮起)**：`0 4px 16px rgba(45, 42, 38, 0.04)`
* **Modal Shadow (彈窗浮起)**：`0 12px 32px rgba(45, 42, 38, 0.12)`
* **Active Glow (選取微光)**：`0 0 0 3px rgba(16, 185, 129, 0.15)`

---

## 5. 狀態標籤與回饋機制 (Status & Feedback Indicators)

```
[ 🟢 安全/達標 ]  --> #10B981 (綠色圓點 / 綠色文字)
[ ⚫️ 進行中/未滿 ] --> #6B7280 (黑色圓點 / 灰字)
[ 🔴 超標警示 ]    --> #EF4444 (紅色圓點 / 紅色文字)
```

1. **五大營養素全天預算燈號**：
   - 熱量、蛋白質、碳水化合物、脂肪、鈉含量均實時計算累計值，並動態賦予 🟢 / ⚫️ / 🔴 狀態。
2. **Modal 背景鎖定（Body Scroll Lock）**：
   - 任何 Modal（食材詳情、AI 相機、採買清單）開啟時，`<body>` 自動附加 `.modal-open`，鎖定滾動防穿透。

---

## 6. 核心元件庫規格 (Component Library Specs)

### 6.1 膠囊元件體系 (Capsule System)

#### A. 備料計算頁【單觸控烹調膠囊】
* **常態 (In Stock)**：純白底 (`#FFF`) ＋ 1.5px 淺灰框 (`#E8E5DD`) ＋ 深褐字。
* **選中 (Selected for Cooking)**：淡薄荷綠底 (`#E8F8F2`) ＋ 1.5px 綠框 (`#10B981`) ＋ 深綠字 (`#065F46`)。
* **無庫存 (Out of Stock)**：軟柔灰底 (`#F3F0EA`) ＋ 灰色字 ＋ 帶有 `🛒` 標記（短按直接加入採買清單）。
* **互動行為**：
  - **短按 (< 300ms)**：切換「下鍋選中 / 取消選中」。
  - **長按 (≥ 750ms)**：震動/觸發彈出 **「食材詳細營養與每 100g 數據卡片」**。

#### B. 智慧冰箱頁【雙分割式膠囊 (Split Capsule)】
* **左半部 (70% 面積)**：控制庫存（亮白底綠框 = 有庫存；柔灰底 = 缺貨）。
* **右半部 (30% 面積)**：控制採買清單（灰線條 🛒 = 暫無；薄荷綠圓底白 🛒 = 已列入待買）。

---

### 6.2 03 備料大白板 (Portions Whiteboard)
* **容器樣式**：純白底、20px 圓角、細緻柔和外框。
* **動態單位顯示**：自動判斷原型食材，依設定顯示 `g`、`顆`、`包`、`大匙`。
* **雙工具按鈕**：
  1. `[ 📋 複製備料與食譜 ]`：格式化輸出全家人食材克數與醬汁比例至剪貼簿。
  2. `[ 📖 檢視 SOP 步驟 ]`：展開折疊式步驟，特調醬汁倍率自動乘以用餐人數。

---

### 6.3 04 成員專屬卡片 (Member Portions Card)
* **抬頭預算條**：
  ```
  [ 😊 Bebe ]  🟢 熱量: 385k | 🟢 蛋白: 28g | 🟢 碳水: 42g | 🟢 脂: 11g | 🟢 鈉: 760mg
  ```
* **5g 步進器微調鈕**：
  - 格式：`[ - ] 80g [ + ] (100g)`
  - 後方淺灰括號為黃金標準錨定值，便於微調時隨時對照。

---

### 6.4 飲食進度條與快捷美食庫 (Tracker View)
* **雙軌營養進度條**：當日已攝取熱量與三大營養素，以圓角進度條展示，超標時自動變紅。
* **常用快捷美食庫 (`favorite_foods.json`)**：
  - 獨立收錄常吃外食（如：麥克雙牛堡、大冰拿、無糖豆漿），一鍵點選直接帶入精確數據，免除每次 AI 辨識的誤差。

---

### 6.5 智慧採買清單全螢幕視窗 (Shopping Cart Modal)
* **賣場過濾膠囊**：`[ 🌐 全部 ]` ｜ `[ 🔵 全聯 ]` ｜ `[ 🔴 好市多 ]`。
* **店家標籤去冗餘**：在單一店家過濾模式下，品項後方之店家標籤自動隱藏。
* **底部三大動作**：
  - `[ ⬅️ 返回 ]` ｜ `[ 🧹 一鍵清除並標示為有庫存 ]` ｜ `[ 📋 複製清單至 LINE ]`。

---

### 6.6 統一 AI 視覺取景視窗 (Camera Vision Modal)
* **取景框**：滿版高對比取景視窗，帶有四角金色微光對焦框 🎯。
* **三合一輸入源**：
  1. `[ ⚪ 拍照辨識 ]`（快門）
  2. `[ 🖼️ 相簿選取 ]`（相簿照片解析）
  3. `[ 💬 語音 / 文字輸入 ]`
* **雙模式分流**：
  - 模式 A（飲食紀錄）：解析整餐熱量與營養素 ➔ 寫入當日時間軸。
  - 模式 B（食材建檔）：解析包裝標籤 ➔ 換算每 100g 數據並建檔入庫。

---

## 7. 時段智慧推薦規則 (Time-Slot Recommendation Engine)

首頁下拉選單依據當前時間段自動置頂推薦料理，並標註時段徽章：

```mermaid
graph LR
    A[當前時間] --> B{時間區間判斷}
    B -->|07:00 - 11:59| C[🌅 晨光早餐]
    B -->|12:00 - 14:59| D[☀️ 元氣中餐]
    B -->|15:00 - 16:59| E[☕ 午後輕食]
    B -->|17:00 - 21:59| F[🌙 溫馨晚餐]
    B -->|22:00 - 06:59| G[✨ 深夜食堂]
```

| 時段代碼 | 時段名稱 | 時間範圍 | 預設置頂推薦料理順序 |
| :--- | :--- | :--- | :--- |
| `breakfast` | **🌅 晨光早餐** | **07:00 – 11:59** | 1. 燕麥希臘優格碗 ｜ 2. 陽光美式早午餐 ｜ 3. 搖搖乳清蛋白 |
| `lunch` | **☀️ 元氣中餐** | **12:00 – 14:59** | 1. 夏威夷波奇碗 ｜ 2. 彩虹生菜沙拉 ｜ 3. 營養滿滿泡麵 ｜ 4. 美式早午餐 ｜ 5. 優格碗 ｜ 6. 暖心火鍋 |
| `snack` | **☕ 午後輕食** | **15:00 – 16:59** | 1. 燕麥希臘優格碗 ｜ 2. 陽光美式早午餐 ｜ 3. 搖搖乳清蛋白 ｜ 4. 彩虹生菜沙拉 |
| `dinner` | **🌙 溫馨晚餐** | **17:00 – 21:59** | 1. 夏威夷波奇碗 ｜ 2. 韓式拌飯 ｜ 3. 營養滿滿泡麵 ｜ 4. 暖心火鍋 |
| `late_night`| **✨ 深夜食堂** | **22:00 – 06:59** | 1. 營養滿滿泡麵 ｜ 2. 燕麥希臘優格碗 ｜ 3. 搖搖乳清蛋白 |

---

## 8. 佈局與手勢操作規範 (Layout & Motion Standards)

1. **固定底部導航（Bottom Navigation Dock）**：
   - 結構：`main.js` 中的 `.bottom-dock-container > .bottom-dock`，固定於畫面底部並橫向滿版；預設純白底（`var(--fk-dock-bg, #FFFFFF)`），**沒有**毛玻璃模糊或頂部邊框，改以頂部陰影分隔內容（詳見 9.2）。
   - 導航內容高度為 `var(--fk-dock-height)`（目前 `50px`）；容器另加 `padding-bottom: var(--fk-dock-safe-area)`，目前為 `max(16px, env(safe-area-inset-bottom, 16px))`。
   - 主內容 `.view-content` 依 CSS 保留底部內距：`calc(var(--fk-dock-height) + var(--fk-dock-safe-area) + var(--fk-fab-popout) + 24px)`。目前 `--fk-fab-popout: 16px` 用於內容避讓，**不是**中央按鈕的 `top` 位移。
2. **動態過渡曲線 (Transitions)**：
   - 標準曲線：`transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);`
   - 按鈕按下縮放：`transform: scale(0.97);`

## 9. 系統全面向量 SVG 圖示規範 (SVG Vector Icon Matrix)

全系統已徹底告別 Emoji 與外掛圖庫，統一使用輕量原生 SVG 向量圖示。

### 9.1 全系統 SVG 統一線條粗細原則 (Strict Uniform Stroke Width & Optical Consistency)

一般圖示以一致的輕量線條為設計原則；**底部 Dock 的現行 CSS 有專用尺寸與線寬，須以 9.2 節為準**，不可將以下通用基準直接套用至 Dock：
1. **一般圖示線寬基準**：`stroke-width: 1.8` 為既有通用設計基準；但底部 Dock 左右四個圖示由 CSS 強制設定 `stroke-width: 1.111 !important`（SVG 顯示尺寸 `34.56px`、`viewBox` 為 `24 × 24`，換算視覺線寬約 `1.6px`），中央加號另設為 `1.5 !important`。
2. **線條圖示與 Dock 星芒例外**：
   - 一般線條圖示維持空心（`fill: none`），但**中央大圓鈕右上方的單顆星芒為實心例外**，不可誤寫為空心。
   - **中央大圓鈕**：十字加號為 `1.5` 線寬、圓角端點；星芒為旋轉 `45°` 的 `<path class="starburst">`，由 CSS 填入 `var(--color-primary-ink)` 並取消描邊。
   - **超市手推車雙輪**：改為**純線條空心小圓環**（`fill: none`），避免因線寬而糊成大黑坨。
   - **底部 Dock 的今日紀錄三圓環**：現行 `<g transform="rotate(155 12 12)">` 包含三個 `<circle>`，半徑依序為 `8.5`、`5.8`、`3.1`，各自以 `stroke-dasharray="45 10"`、`"26 10"`、`"11 7"` 呈現弧線；線寬遵循 Dock 專用 CSS。
3. **向量標準規範**：
   - 視圖：`viewBox="0 0 24 24"`
   - 描邊端點：`stroke-linecap="round"`
   - 描邊折角：`stroke-linejoin="round"`
   - 一般線條圖示填充：`fill="none"`（底部 Dock 中央實心星芒除外）

| 介面功能 / 位置 | 定案 SVG 款式 | 設計語意說明 |
| :--- | :--- | :--- |
| **全域頂部 Header 刷新** | **R1 雙箭頭圓環 SVG** | 輕盈無邊框雙箭頭圓環，無感同步資料 (1.8px) |
| **主導航三大 Tab** | **1-B 主廚帽 ｜ 2-C 圓餅圖 ｜ 3-A 冰箱** | 極簡線條精準表達三大模組核心功能 (1.8px) |
| **家庭成員角色膠囊** | **Bebe-B 笑臉 😊 ｜ 樂樂-1 純線框愛心 ♡ ｜ Jason-3 切面岩石 🪨** | 專屬視覺識別，純線條抗焦慮 (1.8px) |
| **採買清單** | **款式 1 直條垃圾桶 ｜ A1 現代掃帚 ｜ B1 雙層複製卡片** | 食材旁商店圖示完全透明，清爽現代 (1.8px) |
| **白板與計算器** | **翻開食譜書 SOP ｜ B1 複製食譜 ｜ 加食材-1 俐落加號 ｜ 紀錄-1 鉛筆記事 ｜ R1 重設** | 完整備料操作一氣呵成 (1.8px) |
| **食材選取與快篩** | **款式 1 極簡眼睛 ｜ 俐落加號** | 菜單與分類純文字無 Emoji 干擾 (1.8px) |
| **今日紀錄時間軸** | **日期人字 Chevron ｜ C1 微單相機 ｜ 語音-1 專業麥克風 ｜ 經典調味鹽罐** | 全天熱量達標採用系統珊瑚朱紅標籤 (1.8px) |
| **智慧冰箱與新增食材** | **俐落加號（新增食材） ｜ C1 微單相機（AI 實拍） ｜ 相簿選圖 ｜ 磁片存檔** | 點擊直接開啟新增食材抽屜，取消原生相機直接彈出 (1.8px) |

---

### 9.2 Bottom Navigation Dock（現行實作規格）

本節依 `web/style.css` 與 `web/src/main.js` 的現行實作記錄，**不再以舊記帳 App 截圖或過時的 SVG 複製碼作為規格**。HTML 為 `<nav class="bottom-dock-container">`，內含 `.bottom-dock`：左側兩個 `.dock-tab`、中央一個 `.dock-center-btn`、右側兩個 `.dock-tab`，共五個操作入口。

* **固定底欄與安全區域**：
  - 外層 `.bottom-dock-container`：`position: fixed; bottom: 0; left: 0; right: 0; z-index: 900;`；背景 `var(--fk-dock-bg, #FFFFFF)`（目前無覆寫，顯示純白），**沒有** `border-top` 或 `backdrop-filter`。
  - 頂部陰影：`0 -4px 14px rgba(0, 0, 0, 0.08), 0 -1px 3px rgba(0, 0, 0, 0.04)`。
  - 內層 `.bottom-dock`：高度 `var(--fk-dock-height) = 50px`、`max-width: 480px`、水平置中、左右 `padding: 0 16px`、`transform: translateY(1.5px)`。
  - 外層另有 `padding-bottom: var(--fk-dock-safe-area)`，即 `max(16px, env(safe-area-inset-bottom, 16px))`。**50px 不包含**這段 iOS 安全區域內距。
  - iOS 鍵盤出現時套用 `.is-keyboard-open`：`translateY(100%)`、透明度 `0` 並停用點擊。
* **左右四個導航 Tab**：
  - 左右各一組 `.dock-side-group`，皆 `flex: 1 1 0`、`justify-content: space-between`、`transform: translateY(2px)`。每個 `.dock-tab` 固定寬 `48px`、高度 `100%`；中央 `.dock-center-wrap` 保留 `108px` 寬。
  - SVG 皆為 `viewBox="0 0 24 24"`，實際顯示 `34.56 × 34.56px`。CSS 指定 `stroke-width: 1.111 !important`（按 1.44 倍縮放，視覺約 `1.6px`），`fill: none`、圓角端點及折角。
  - 未選取：描邊 `#8E8A85`、`opacity: 0.85`；選取：`var(--color-primary) = #FFCA60`、`opacity: 1`，**線寬不變**。按下 Tab 為 `scale(0.92)`。
* **中央新增記錄 FAB**：
  - `.dock-center-btn` 為 **`75 × 75px`** 白底圓形，邊框 `3.5px solid var(--fk-fab-border)`；目前 `--fk-fab-border: var(--color-primary) = #FFCA60`，**不是珊瑚粉色**。
  - 按鈕置於 `108px` 寬的 `.dock-center-wrap`，透過 flex 水平與垂直置中；按鈕本身 `position: relative; transform: none`，**沒有** `top: -26px`。以 `50px` 內容列計算，圓鈕自然高出列頂 `12.5px`；考量整列下移 `1.5px`，約高出外層白底頂端 **`11px`**。
  - 常態陰影：`0 1px 3px rgba(0, 0, 0, 0.06), 0 0 2px rgba(0, 0, 0, 0.14)`，不是珊瑚粉光暈；按下為 `scale(0.92)`、邊框 `#E7B44E`、陰影 `0 1px 2px rgba(0, 0, 0, 0.14)`。
  - SVG 顯示尺寸 `36 × 36px`，描邊色 `var(--color-primary-ink) = #725210`。中央十字由兩條 `<line>` 組成（座標 `12,5→12,19`、`5,12→19,12`），CSS 線寬 `1.5 !important`、圓角端點。
  - **右上角確實有一顆星芒**：`<path class="starburst" transform="rotate(45 19 5)">`，CSS 指定實心 `fill: var(--color-primary-ink) !important`、`stroke: none !important`。中央按鈕點擊 `openRecordActions`，開啟新增記錄操作選單。
  - 鍵盤焦點樣式：Tab 與 FAB 使用 `2px solid var(--fk-fab-border)`、`outline-offset: 3px`。

| 順序 | 功能／HTML 行為 | 現行 SVG 結構（`web/src/main.js`） |
| :---: | :--- | :--- |
| **1** | **備料計算器**：`.dock-tab`，切換 `calculator` | 指針烘焙秤：托盤 `path`、支柱 `line`、秤身 `path`、指針盤 `circle r="3"` 與 `line`。 |
| **2** | **今日紀錄**：`.dock-tab`，切換 `tracker` | 三個斷續同心圓 `circle`：`r="8.5"`／`"5.8"`／`"3.1"`，`stroke-dasharray="45 10"`／`"26 10"`／`"11 7"`；包在 `<g transform="rotate(155 12 12)">` 中。 |
| **3** | **新增記錄**：`.dock-center-btn`，執行 `openRecordActions` | 正中十字兩條 `line`，右上角一個旋轉 `45°` 的實心 `path.starburst`。 |
| **4** | **智慧冰箱**：`.dock-tab`，切換 `pantry` | 雙門冰箱：`rect x="5" y="2.5" width="14" height="19" rx="3"`、分界線 `line y="10"`，上下門把各一條 `line`。 |
| **5** | **採買清單**：`.dock-tab`，切換 `shopping` | 超市手推車：一段 `path` 描繪把手與車身，兩輪為 `circle r="1.3"`，圓心 `(9.5, 19.5)`／`(17.5, 19.5)`。 |

SVG 路徑座標以 **`web/src/main.js` 原始標記**為準；尺寸、色彩、陰影與狀態樣式以 **`web/style.css`** 為準，不另維護第二份易過時的 SVG 程式碼。
---

*Family Kitchen 2.0 Design System Specification | Maintained by 十一粒 for Bebe-AI-OS*


