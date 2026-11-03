# #22：已驗證帳號的餐點權限與本機草稿

日期：2026-11-02。狀態：本機候選及合成隔離驗證；正式後端、資料歸屬與前端發布各需另行授權。

## 已確認的權限與最小模型

Meal Logs 與 Pantry scope 是兩種授權。`household` membership 不能推出家庭餐點管理權。沿用 FamilyAuthService 的伺服器 user／membership 驗證，不另建登入；新增由管理端維護的 `fk_meal_access(user_id, member, is_manager)`。user_id 對應 Auth UUID，member 僅 bebe／ariel／jason，只有 bebe 可標記 manager；每個成員一筆對應，客戶端只有讀自己角色的權限。沒有真實 Email／UUID seed，也不採信 email 比較、user_metadata 或 localStorage 角色。

- Bebe manager：可管理全部「已確認歸屬」的家庭餐點。
- Ariel、Jason：僅能操作 member 等於本人角色的已確認餐點。
- 未登入、無角色、過期或已撤銷 session：無法讀寫餐點。

`meal_logs.access_confirmed` 預設 false，migration 不猜測或改寫任何既有 member／ID／日期／營養／照片內容。新 authenticated INSERT 由 trigger 標記 true，再由 RLS WITH CHECK 核對 member。UPDATE 同時驗證舊列 USING 與新列 WITH CHECK，不能把自己的餐點改成其他人，也不能以 upsert 認領未確認的歷史 ID。客戶端不能修改 access_confirmed 來藏起或認領歷史紀錄。

anon grants 全部維持撤銷。authenticated 只恢復必要 CRUD，並同時有 permissive／restrictive 的成員政策；即使另有歷史寬鬆政策，也不能繞過 restrictive 守門。角色表不可由一般客戶端 INSERT／UPDATE／DELETE。

## 為什麼有一個 private SECURITY DEFINER

Supabase JWT 在簽發後不會僅因本機登出就失效。`fk_private.valid_meal_session()` 只回傳「目前 auth.uid() 與 JWT session_id 是否仍存在於 auth.sessions、且未超過 not_after」的 boolean，沒有傳入 UUID／SQL 等參數。它是唯一新增的 SECURITY DEFINER，固定 search_path=pg_catalog、完全限定 auth 表／函式；收回 PUBLIC／anon EXECUTE，僅給 authenticated EXECUTE 及 schema USAGE，沒有 CREATE。

fk_private 不列入 Data API exposed schemas；沒有 public RPC wrapper。餐點角色及 meal RLS 均核對 session。signOut 先立即移除本機權限，再以原 token 呼叫 Auth logout?scope=local；舊回應不會修改新帳號。離線登出無法保證伺服器立即收到撤銷，UI 仍立刻 fail closed；到期 JWT 仍由 Auth／REST 拒絕，重新連線應完成有效登入確認。

過期 access token 若有 refresh token，由既有 Auth Service refresh 後再次 GET /user 與 membership，過程綁定 generation 及原 session；延遲 refresh 不能覆寫較晚登入的另一帳號。網路失敗不刪除私人餐點快取。

## 本機資料與讀寫路徑

- 新快取：`kitchen_v2_meals_<verified-user-id>`，保存 logs 與 pending；backup 僅在寫入前備份現有 primary。I/O／解析／巢狀結構錯誤均停止，不當作首次使用。
- 舊 `kitchen_v2_daily_logs.json`、舊 deleted meal IDs 與靜態 daily_logs 保持原樣，停止自動載入、合流或搬遷，migrateDailyLogs 明確拒絕。不得自動升格未確認的歷史資料，也不以新快取覆蓋舊檔。
- 餐點先持久保存到已驗證帳號的 primary＋pending，再嘗試雲端；只有有效回應才移除對應 mutationId。失敗顯示「已保留本機，尚未同步」，不假報成功。
- 同一 ID 的儲存採 upsert，重試／回應遺失可避免新增第二列；同一個 Engine 依序送出 pending。POST 是明確的該筆餐點儲存；本次未另加全域餐點編輯版本合併協定，多裝置同時編輯同一餐點仍採伺服器最後接受的該筆儲存，不能把 Pantry CAS 的驗證延伸宣稱到 Meal Logs。
- pending save 優先於 GET 的同 ID，pending delete 過濾雲端舊列，並保留原餐點在待刪操作供回復。成功的空白 GET 可更新乾淨快取，失敗不修改；不使用舊共用墓碑跨帳號過濾。
- GET、儲存確認及 UI callback 綁定登入 context；GET 另核對請求序號與本機 mutation，拒絕舊回應。舊 Engine 操作不能套用到新登入者；同 scope 換帳號也不同。
- Tracker 正常同帳號 foreground 重驗保留未完成輸入；實際換帳號清除私人表單／相片／營養基底，舊餐點／AI／檔案／相機回應不回套。操作按鈕僅顯示可管理成員，資料庫 RLS 仍是權威。
- Base64 照片僅留在暫存分析／上傳期間；失敗只保存 null。照片 URL、營養、items、時間、日期、份量與 ID 延續原格式。移除客戶端對特權本機照片 proxy 的回退，直傳使用有效 Session；未修改正式 bucket 政策。
- SupabaseConfig 拆成純設定，解除 Auth 與 SupabaseService 的 import 循環；所有 service 消費者使用同一 URL。Auth／PersonalKitchenSyncService 仍維持無版本 singleton URL，必要 import chain 更新到 main／index。

## 歷史資料與正式升級順序

1. 先核對正式 metadata、必要欄位／型別、現行 RLS／grants、private schema 未公開、目前 Auth 版本的 auth.sessions 欄位，以及既有 158 筆備份與校驗。此輪只有合成 fixture 按現有客戶端欄位契約建表，沒有讀寫正式資料；不把合成 schema 當成已核實的正式 metadata。
2. 獨立驗收後另行授權套用 candidate migration。它只增加權限結構與預設未確認標記，保留原資料。正式既有匿名封鎖不可逆向打開。
3. 管理端逐一確認 Auth UUID 與本人 member、Bebe manager 權；不能從 household membership、可編輯 metadata 或不明 email 推定。另行授權填入角色表，不在 Git／Issue 留實際個資。
4. 歷史資料先列待確認、核對來源與 member 可靠性，再按核准 ID 清單明確標記 access_confirmed；不能將全部列自動改成 true。舊裝置本機／靜態歷史亦須先分類、保護與決定遷移來源。
5. 後端與必要角色就緒，再取得前端發布授權。驗證 Bebe／Ariel iPhone 的登入、餐點、營養與照片引用；Jason 本輪不要求實機。#16 後端 guard 等候選版本其他既有部署相依仍按其決策文件處理。

## 回退

遇到問題先關閉 authenticated 對 meal_logs 的 CRUD，保留 anon 封鎖、資料、角色表及確認標記。前端可回退但舊匿名版仍不會恢復存取；不要移除 RLS／guard 或恢復匿名 grants 來讓舊版運作。資料回復另核對 scope／member／備份及授權，Git Revert 不能復原家庭資料。本機新／舊快取不可清空，pending 必須保留。

#17 Storage 權限收斂仍是獨立事項；本輪驗證既有相片 URL 引用與新客戶端登入守門，沒有宣稱正式 bucket 的既有政策已修復。靜態 `src/data/daily_logs.json` 含有紀錄而非空種子，性質與公開發布處理仍需確認；本輪沒有讀出餐點內容、修改或刪除原檔。

## 驗證

`tests/test_meal_logs_auth.mjs`、`tests/test_meal_tracker_permissions.mjs` 驗證記憶體故障／UI／帳號競態；`tests/test_meal_logs_supabase.mjs` 必須指向獨立 /private/tmp/fk22-* 環境（API 55431、DB 55432，無 hosted project-ref）才可執行，使用 example.invalid 合成帳號，直接 REST 測試所有 CRUD 與偽造攻擊。測試會建立具名 synthetic 資源，重跑只清理自己命名的帳號／列；完成後清理本次資源與專用 stack，不使用 stop --all。原 #16 隔離 suite 一併重跑。

參考：[Auth sessions](https://supabase.com/docs/guides/auth/sessions)、[RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)、[Data API security](https://supabase.com/docs/guides/api/securing-your-api)、[migrations](https://supabase.com/docs/guides/deployment/database-migrations)。
