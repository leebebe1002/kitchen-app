# Family Kitchen 2.0｜Progress

## Current State

FK 是已上線使用的 production system。目前在 `chore/fk-collab-foundation` 建立最小多 AI 協作層，未進行產品功能開發。

## Current / Active Batch

- Current：協作基礎文件已建立。
- Active Batch：None。

## Recent Completed Work

- `household`（Bebe＋Jason）與 `ariel`（樂樂）的 Personal Kitchen Scope、Supabase 同步與本機備份保護。
- IngredientMatcher、建立時 duplicate guard 與啟動自癒，並保護庫存／採買 reference。
- 餐點與食材相片的 no-Base64 gatekeeper；相片改存 Supabase Storage URL。
- 採買通路統一為 `EC`，並完成多通路與採買狀態同步。
- GitHub Pages 載入效能與 iOS PWA Version Tag 更新。

## Pending

- 目前沒有排定的功能 Batch。
- `PRD.md`、`DATA_SCHEMA.md`、`ROADMAP.md` 仍含舊名稱與舊架構／階段描述，尚未另案校準。

## Security / Technical Debt

- `meal-photos` migration 目前允許 public insert／update／delete；需另開安全性 Batch 評估是否收斂 Supabase Storage／RLS 權限。
- 已停用的 `CloudSyncEngine` 仍含舊 GitHub PAT 字串：需優先確認 token 是否已撤銷／失效；若 token 曾進入 Git history，之後應另開安全性 Batch 處理。本次只記錄，不修改 token、Git history 或程式碼。

## Next Action

下一個功能需求開始時，先依 `batches/README.md` 建立一個實際 Batch，確認資料邊界與 Must Not Break，再進入實作。

## Recommended Model

依 Batch 性質決定；原則採「1 個主規劃模型＋1 個執行模型」，避免多模型重複分析。實際模型與工作環境在各 Batch 的 `Suggested Executor` 中決定。

## Relevant Files

- `AGENTS.md`
- `batches/README.md`
- 下一個 Batch 指定的產品文件與程式檔

## Do Not Redo

- 不需重新設計協作狀態機或預建空 Batch。
- 不需重寫現有 FK 規格文件；先把落差當成待確認事項。
