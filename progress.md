# Family Kitchen 2.0｜Progress

## Current State

FK 是已上線使用的 production system。FK-001、FK-002 與 FK-003 皆已完成實機驗收並關閉；成員營養目標、常用餐點快捷與成員個別份量模式運作正常。

## Current / Active Batch

- Current：FK-004 修正採買通路顯示與編輯選取狀態不同步。
- Active Batch：FK-004。

## Recent Completed Work

- `household`（Bebe＋Jason）與 `ariel`（樂樂）的 Personal Kitchen Scope、Supabase 同步與本機備份保護。
- IngredientMatcher、建立時 duplicate guard 與啟動自癒，並保護庫存／採買 reference。
- 餐點與食材相片的 no-Base64 gatekeeper；相片改存 Supabase Storage URL。
- 採買通路統一為 `EC`，並完成多通路與採買狀態同步。
- GitHub Pages 載入效能與 iOS PWA Version Tag 更新。
- FK-001 已將 `favorite_foods.json` 納入 user state 判斷，完成必要入口 Version Tag、六項隔離驗證與 Ariel 的 iOS PWA 實機驗收；Batch 已關閉。
- FK-002 完成料理計算機「就餐成員個別份量模式 UI」：每位成員獨立支援標準／剩餘模式，結合餐別與當日飲食紀錄預判，膠囊長按防誤觸展開，AI Prompt 動態配平，完成 Version Tag 更新、8 項煙霧測試與 Bebe 在 production 正式站之實機驗收；Batch 已關閉。
- FK-003 更新 Bebe / Ariel 每日營養目標：校準 KitchenEngine、TrackerView fallback、CalculatorView 吃剩餘額度配平上限與家庭知識庫文件（Bebe.md / Ariel.md 屬外層 Bebe-AI-OS、另由外層 repo 版本控制），更新 Version Tag 載入鏈並完成 Bebe 在 production 正式站之實機驗收；Batch 已關閉。

## Pending

- 目前沒有排定的功能 Batch。
- `PRD.md`、`DATA_SCHEMA.md`、`ROADMAP.md` 仍含舊名稱與舊架構／階段描述，尚未另案校準。

## Security / Technical Debt

- `meal-photos` migration 目前允許 public insert／update／delete；需另開安全性 Batch 評估是否收斂 Supabase Storage／RLS 權限。
- 已停用的 `CloudSyncEngine` 仍含舊 GitHub PAT 字串：需優先確認 token 是否已撤銷／失效；若 token 曾進入 Git history，之後應另開安全性 Batch 處理。本次只記錄，不修改 token、Git history 或程式碼。
- `server.py` 仍含 Supabase service-role credential；需優先撤銷／輪替並另開安全性 Batch 清理程式碼與 Git history。本次只記錄，不揭露或修改 credential、Git history 或程式碼。

## Next Action

下一個功能需求開始時，再依 `batches/README.md` 建立 Batch 並確認資料邊界。

## Recommended Model

依 Batch 性質決定；原則採「1 個主規劃模型＋1 個執行模型」，避免多模型重複分析。實際模型與工作環境在各 Batch 的 `Suggested Executor` 中決定。

## Relevant Files

- `AGENTS.md`
- `batches/README.md`
- `batches/FK-001-ariel-quick-meal-persistence.md`
- `web/src/views/TrackerView.js`
- `web/src/engine/KitchenEngine.js`
- `src/data/favorite_foods.json`
- `web/src/services/PersonalKitchenState.js`
- `web/src/services/PersonalKitchenSyncService.js`
- `web/src/main.js`
- `web/index.html`

## Do Not Redo

- 不需重新設計協作狀態機或預建空 Batch。
- 不需重寫現有 FK 規格文件；先把落差當成待確認事項。
- FK-001 root cause 已確認，不需重查餐點紀錄資料流：它與快捷選項分離且未被刪除。
- FK-001 已按確認方案完成，不需擴張到 scope 隔離、跨裝置同步、Supabase schema 或官方預設 merge。
