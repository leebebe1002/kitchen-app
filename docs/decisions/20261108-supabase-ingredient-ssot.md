# FK #14｜Supabase 單一權威食材資料庫（待正式遷移）
2026-11-08｜Bebe 選擇：手機存檔立即影響本機營養計算；Supabase 同步後家人使用相同有效營養數字。GitHub 僅為應用程式與歷史版本管理，原 `src/data/ingredients.json` 100 項保留作初次匯入與舊版回復用，**不得同時作為營運期第二個真實數值來源**。

## 三層邊界
- **共用官方食材：** `public.fk_ingredient_catalog` 100 個 canonical ID，payload/營養資料與逐食材 revision 透過 RLS 限制 Bebe／Ariel 讀寫。已確認的營養修改才可共用；非官方 ID 仍是裝置端 custom ingredient，不得自動升格。
- **手機：** 本機快取 + 編輯待同步 outbox。儲存先更新本機算式並標示「待同步」；網路成功且 revision 正確才顯示「已同步」。遠端空／驗證異常／revision 衝突不能覆蓋本機非空狀態，更不能把過期手機快取當成雲端權威。
- **Personal Kitchen State：** `household` 與 `ariel` 各自的庫存、採買、家用品、購物車與既有餐點完全不遷移至官方食材表。照片只存 Storage URL；本機原始照片及歷史飲食不挪移。

## 正式切換前必要守門
1. 確認最新 GitHub 母庫恰有 100 項、雪白菇存在、可可粉不在其中；正式 Supabase `fk_shared_ingredient_nutrition` 若已有修正則停止，逐筆審查後才合併。
2. 保留現有正式 schema 與官方 JSON 歷史版本。先備份要改動的正式 RLS/policies 及舊共享修正（若有）；記錄完整 migration version 與 git revision。
3. 先完成隔離環境的 RLS 匿名／Bebe／Ariel 權限、revision CAS、網路失敗、手機快取、照片、私房食材、兩 Scope、舊版本的全面回歸測試。
4. 才在已明確授權的正式環境 apply migration，核對行數 100、營養 checksum／metadata、RLS、0 筆舊寫入，最後部署使用 Supabase SSOT 的 FK 前端。正式 migration／policy 變更不在低風險持續發布授權內。
5. 若任一步失敗：停止下一步，保留本機快取與備份；程式回退到已驗證版本，SQL 舊共享資料保留唯讀。**程式回退不會自動回復使用者已在手機本機儲存的待同步變更**，必須從有 owner/revision 的 outbox 安全恢復。

## 相容與限制
- 現行 `docs/DATA_SCHEMA.md` 的「100% 存在 src/data」屬舊規範，與 2026-11 現行 Personal Kitchen State / Supabase 行為已不一致；此決議僅記錄新目標，不擅改歷史 PRD／DATA_SCHEMA／DESIGN_SYSTEM。
- 舊 FK 客戶端仍可能短暫載入 GitHub 舊靜態 JSON；轉換前必須確保這種版本不能再寫入舊共用修正表，並顯示需更新 App。歷史 JSON 保留但不再更新最新營養。
- 不聲稱 100 項營養已做科學正確性稽核，亦不以雲端部署代替原 iPhone／Ariel 雙機實測。
