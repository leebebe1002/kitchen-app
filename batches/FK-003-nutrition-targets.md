# Batch：FK-003 更新 Bebe / Ariel 每日營養目標

## Goal

更新 Family Kitchen 2.0 中 Bebe 與 Ariel（樂樂）的每日熱量與三大營養素基準目標值，確保 Tracker 每日營養進度、儀表板進度百分比、剩餘額度計算、狀態安全燈號，以及料理計算機動態配平皆讀取最新目標數值。

## Why

依據家庭成員最新健康與營養規劃：
- **Bebe** 新基準：熱量 1450 kcal、蛋白質 90 g、碳水 160 g、脂肪 50 g（舊值為 1350 kcal / 105g / 140g / 40g）。
- **Ariel** 新基準：熱量 1600 kcal、蛋白質 85 g、碳水 200 g、脂肪 50 g（三大營養素換算 1590 kcal，屬可接受四捨五入差距；舊值為 1450 kcal / 95g / 165g / 45g）。

需校準系統中散落或引用的舊目標數據，使日常追蹤與動態配平計算更精確貼合個人最新身體需求。

## Scope

- 調查並確認 Bebe / Ariel 每日營養目標數值的實際來源與各引用點。
- 更新目標數值主要定義與相關 fallback：
  - `web/src/engine/KitchenEngine.js`（`this.profiles`）
  - `web/src/views/TrackerView.js`（`defaultProfiles` fallback）
  - `web/src/views/CalculatorView.js`（動態配平剩餘額度目標上限計算與提示詞）
- 同步更新 Obsidian 知識庫對應之家庭檔案：
  - `memory/family_profiles/Bebe.md`
  - `memory/family_profiles/Ariel.md`
- 更新受影響前端檔案之 Version Tag 與入口鏈（`KitchenEngine.js`、`TrackerView.js`、`CalculatorView.js`、`main.js`、`index.html`）。
- **明確不在本 Batch 範圍**：
  - 不修改「標準／剩餘」之計算演算法與核心邏輯。
  - 不修改 Supabase schema 與資料庫。
  - 不修改 Personal Kitchen State。
  - 不修改食材／料理母庫。
  - 不調整 Jason 的目標數值。
  - 不做未經確認的大規模重構。

## Must Not Break

- Tracker 每日進度儀表板（圓環、膠囊百分比與剩餘計算）正常計算與展示。
- 計算機標準／剩餘模式切換與動態配平指令格式保持相容。
- 既有飲食紀錄（`daily_logs`）與歷史資料不得受損。
- 保持 CLI-first 操作原則，未獲 Bebe 確認前不 commit、不 push、不 merge。

## Done When

1. Bebe / Ariel 每日目標來源完成清查與回報，方案獲得確認。
2. `KitchenEngine.js`、`TrackerView.js` 與 `CalculatorView.js` 皆使用正確的新目標數值。
3. `memory/family_profiles/` 對應文件同步更新。
4. 本機 Tracker 與 Calculator Smoke Test 通過。
5. 相關 Version Tag 正確更新，iOS Safari 正常載入。

## Suggested Executor

- 規劃與實作：Antigravity（Gemini 2.5 Pro）於 Bebe-AI-OS 工作環境。

## Technical Debt / 後續規劃
- **目標值多處 hard-code**：目前成員目標值散落在 `KitchenEngine.js`、`TrackerView.js` fallback 以及 `CalculatorView.js` 剩餘額度三元運算式，且 Jason 於 CalculatorView（2200 kcal / 120g P）與 KitchenEngine（1800 kcal / 130g P）存在歷史數值差異。後續宜開闢架構 Batch 統一由成員 Profile 或母庫作為單一真實來源（SSOT）。
- **AI Prompt 單餐食材重量確認**：經確認 `CalculatorView.js` 中「Bebe 主力蛋白質約 65~75g」是指高蛋白食材（肉品／海鮮／豆腐）的備料重量克數，並非純蛋白質營養素克數，與單餐 320~380 kcal 及其他成員描述結構一致，本 Batch 按指示保持不動。

## Result / Handoff

- 狀態：實作完成，等待 Bebe 進行 DIFF 驗收。
- 完成內容：
  1. `KitchenEngine.js`：更新 Bebe（1450 kcal / P 90g / C 160g / F 50g / Na 1500mg）與 Ariel（1600 kcal / P 85g / C 200g / F 50g / Na 1800mg），Jason 保持不動。
  2. `TrackerView.js`：更新 fallback 中的 Bebe 目標對齊新基準。
  3. `CalculatorView.js`：更新動態配平吃剩餘額度中 Bebe（1450 / 90）與 Ariel（1600 / 85）之目標上限，Jason 保持 2200 / 120 不動。
  4. 知識文件：同步更新 `memory/family_profiles/Bebe.md` 與 `memory/family_profiles/Ariel.md`。
  5. PWA 快取：更新 `KitchenEngine.js`、`CalculatorView.js`、`TrackerView.js`、`main.js` 與 `index.html` 之 Version Tag（`20260926_FK003_TARGETS`）。
