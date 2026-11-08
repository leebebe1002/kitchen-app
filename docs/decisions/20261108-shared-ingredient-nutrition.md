# ADR｜#14 只共享已核對的官方食材營養修正

日期：2026-11-08　狀態：已確認、待實機驗收

## 產品決定

Bebe 要求：同一個有效食材的營養修正，在 Bebe 與 Ariel 的 FK 手機上應一致。兩人使用不同 Personal Kitchen Scope，不必因此同步其餘資料。

## 最小實作

- GitHub 官方食材母庫 src/data/ingredients.json（目前 101 項）繼續作為基準，絕不從手機直接改寫 GitHub。
- 新增 Supabase public.fk_shared_ingredient_nutrition，**只存已改且核實**的 canonical 食材 ID、產品身分（名稱、品牌、規格）、完整營養／換算基準、精簡核實資訊與 Revision。
- 只讓目前已驗證的 fk_meal_access.member IN ('bebe','ariel') 讀寫；原 household／ariel 庫存、採買與家用品 RLS 不變；無匿名讀寫。
- 已核對來源且同 canonical ID、同名稱與品牌，且沒有互斥規格，才會分享；未核對的 OCR、私房食材、新 ID、只改價格／照片／通路皆不分享。資料只包含營養，沒有圖片、餐點、價格、採買、登入 token 等欄位。
- App 載入時先完成 Personal Kitchen State 初始化及既有食材去重／custom 合併，**再**讀少量已核對的共用修正並套用到記憶體；本機原快取與照片備份不刪除。沒有共用修正的食材使用既有來源。
- 營養修改時先以資料列 Revision 為條件寫入共用修正。若網路失敗或其他人已更新，回報使用者且不提交新的本機營養值；不得顯示已同步。非營養修改沿用現有本機儲存。
- 不加入 Realtime、週期輪詢、離線自動合併、全量搬移或其他資料同步；重新開啟或刷新 App 才會讀取最新值。

## 資料風險與回復

- 對正式資料庫的影響限於新增一張空表與三條 RLS 政策。未遷移或更改官方食材、正式 Personal Kitchen State、meal_logs、照片與使用者帳號。
- 新增的表若出現問題，可先回退本次前端 Commit，原本的 GitHub 官方食材與裝置 localStorage 仍在；這不會自行移除表內日後新增的共用值。
- 正式表／政策如需移除或刪除任何修正資料，必須另行評估已有資料、備份與取得明確授權。
- 發布後技術驗收不等於兩台 iPhone 真實資料驗收；須由 Bebe 核對一筆已確認修正，Ariel 刷新並比對料理計算結果。
