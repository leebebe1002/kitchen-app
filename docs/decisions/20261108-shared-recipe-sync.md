# FK #14｜自建／修改料理的雲端 SSOT（待正式遷移）

決策日期：2026-11-08。使用者本輪僅要求先完成「自建／修改料理」同步，不包含私房食材或常用餐點快捷。

## 正式資料邊界

- **Supabase `public.fk_shared_recipe_overrides`：全家共用料理的唯一有效資料來源。** 首次遷移以目前確認的 10 道官方料理為種子，後續新增／修改的版本也都保存在這張表。保留 GitHub `src/data/dishes.json` 作為歷史種子、舊版程式備援／回復素材，不再回寫新版本營養或料理內容。
- Bebe／Ariel 已核實的會員可讀寫全家共用料理，Jason／其他帳號／匿名不可讀寫。這不是個別 Personal Kitchen State，不因 household／ariel Scope 不同而分成兩套配方。
- Personal Kitchen State 的 pantry、shopping、household supplies、meal logs 以及裝置端 `kitchen_v2_custom_ingredients` 維持原結構；不複製、不合併、不重設。料理若參照尚未上雲的私房食材，則先保留本機待同步，不將會在其他手機上失效的 reference 發布出去。

## 本機、同步及衝突政策

1. 料理按下儲存，先在手機原子保存目前配方與帳號專屬同步佇列；手機立即生效，遠端成功前明示待同步，離線可繼續使用既有已驗證快取。
2. 儲存只會上傳真正更動的料理，並以逐 ID 版本 CAS 防止兩機覆寫。網路失敗、帳號切換及空白／缺少 10 項基準的遠端都不能覆蓋手機資料；新建 ID 衝突不應自動合併。資料庫不提供 DELETE。
3. 第一次使用新版時，手機既有修改若與雲端 10 項初始種子不同，保留於本機，列為**待確認的歷史料理**；使用者明確按「確認分享」後才將它們轉成共用修改。若兩台手機都有不同的已修改配方，標記衝突、拒絕靜默覆寫。
4. 若同一裝置切換登入帳號且另一個登入者仍有未同步草稿，暫時只顯示已驗證雲端配方，不展示或覆寫另一個使用者的草稿；需原帳號返回後再完成同步。未收到雲端確認不得顯示「已同步」。
5. Base64 相片不寫入 localStorage／SQL；只允許既有安全 URL。料理模組不代辦相片上傳、私房食材發布或官方食材營養修改。

## 正式遷移驗證與恢復

- 新表、新 RLS、會員權限與十項料理種子已在獨立 PostgreSQL 17 實測。正式 schema／RLS／種子寫入屬正式後端變更，需依中央規範取得該範圍的明確授權；本機回歸通過不等於已上線。
- 發布前先備份當時的正式 10 道母庫、Git SHA、相關 RLS 與登入權限，並確認沒有同名已存在資料表；在新表完成 seed／RLS／CAS 驗證後，才部署啟用同步的 FK 前端，並核對 Pages 版本與下載的 JS SHA。
- 發布後的使用者配方不能因程式回退而刪掉。若回復 App 前端，保留 Supabase 整張新表及本機 pending／backup；日後再安全對帳。不得擅自 DROP／TRUNCATE 正式配方。
- 舊版手機不具備料理雲端同步功能，可能繼續顯示先前 cache；新功能正式使用前必須更新 PWA。原 iPhone 與樂樂手機完整同步屬使用者實機驗收，不以 Chrome guest 或 mock server 取代。

## 已知文件落差

`docs/DATA_SCHEMA.md` 仍宣稱所有資料均位於 GitHub JSON，與 2026-11 已部署的 Supabase 食材 SSOT／Personal Kitchen State 實際架構不符。本次只記錄決策，**未擅自改動 PRD、DATA_SCHEMA、DESIGN_SYSTEM**。
