# FK #14｜剩餘 Local-only 食材及常用餐點同步（2026-11-09）

## 使用者需求及權限

Bebe 明確要求：私房食材、常用餐點、以及新增／修改料理不能永久留在單一手機，而必須具備安全的 Supabase 同步與新裝置恢復。正式新增兩張資料表、RLS、同步前端及原 GitHub Pages 發布已取得對應授權。

**唯一有效資料層**：
- 100 項官方食材：現有 `fk_ingredient_catalog`（本次未改），不將私房食材寫入官方母庫。
- 私房食材：`fk_shared_custom_ingredients`，經驗證的 Bebe 與 Ariel 全家共用同一組 ID、營養、重量基準與照片 URL；既有 `IngredientMatcher`／`saveIngredient` 去重及引用守門繼續生效。
- 料理：`fk_shared_recipe_overrides`，維持前一階段的全家共用配方；新同步必須**先載入私房食材**，確定雲端已存在引用的食材 ID 後才發送配方。
- 常用餐點快捷：`fk_member_favorite_foods`，由已驗證登入者以帳號獨立保存；同一帳號跨裝置恢復，不將 Bebe 的個人快捷自動顯示於 Ariel 的個人列表。
- `fk_personal_kitchen_state`：household／ariel 各自獨立的庫存、採買、家用品、購物車，**本次不遷移、不複製、不覆寫**；Meal Logs 也沿用既有同步。

## 資料生命週期

1. App 初始化先取得正確登入與 Personal Scope，再進行官方食材載入、去重、私房食材上雲／合併，最後驗證料理 reference 與常用餐點同步。雲端空白絕不直接清空有資料的手機。舊手機已有原資料先建立不可覆寫的預切換備份；離線／登入異常保留原本地資料與待同步佇列。
2. 私房食材以 ID + revision CAS 寫入。相同名稱／相似食材沿用既有去重機制，不能把自訂食材覆蓋官方食材。多裝置資料衝突保留雙方資料待處理，不能用無版本寫入靜默覆寫。
3. 圖片使用既有 Supabase Storage 上傳機制，成功後保留 HTTPS URL；Base64／blob 內容不寫入 JSON 或 SQL。若僅存在裝置 IndexedDB，先確認原件及 Storage 上傳成功，失敗時保留本機待同步、不得宣稱完成。
4. 私房食材 ID 若能在手機安全找到完整物件則自動上雲；若只剩料理的孤兒引用 ID，**不得推測食材名稱／營養數據**，也不刪除料理。保留阻擋狀態供後續原機確認補救。其他不依賴它的料理仍可個別同步。
5. 常用餐點的新增／修改以 revision CAS 保存；刪除採 tombstone 防止舊裝置將已刪項目復活。RLS 要求用戶只能看到自己的常用餐點，未知身分不得讀寫。
6. 不將 scope 內 inventory/reference 清單直接複製至家庭共用資料表。Cache／outbox 以帳號綁定並在切換帳號時檢查，以免跨登入者覆寫。

## 發布、回復與限制

- 需先套用完整 SQL migration `fk14_local_only_food_and_favorites`，新表 RLS 正常且匿名 API 無 SELECT 權限，再部署包含兩種同步的前端；不能反過來讓新前端呼叫不存在的表。
- 正式資料遷移僅建立**空白**兩張新表，不直接移入猜測的 iPhone 食材或寫入正式 Personal State。等原 iPhone 載入新版、驗證實際可讀食材內容後，應用程式才在既有登入權限下自動補同步。
- 發布回復：可以回復前端至前一已驗證版本，**保留新表與手機 outbox／備份**，不可 DROP／TRUNCATE 已有的家庭配方、私房食材或常用餐點。
- 工程可驗證 Schema／RLS、隔離 PostgreSQL、mock 雙機與自動回歸；真正原 iPhone 是否還有完整兩筆食材、照片是否成功上傳及 Ariel 真機同一 ID/營養是否可取得，仍需原機產品驗收。
- 本次不修改 PRD、DATA_SCHEMA、DESIGN_SYSTEM；歷史文件與最新有效資料流的落差另列 Issue，不能為了同步而改變 pantry／meal 權威邊界。
