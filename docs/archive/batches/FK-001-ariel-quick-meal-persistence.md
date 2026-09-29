# Batch：FK-001 Ariel 常用餐點快捷選項隔日消失

## Goal

修正 Ariel scope 新增的常用餐點快捷選項在 cold start 後消失的問題，同時保留首次使用者載入官方預設快捷的行為。

## Why

快捷選項新增當下與立即重開後都存在，隔天卻消失；同日餐點紀錄仍保留，表示快捷選項與餐點紀錄是不同資料流，且快捷資料可能在啟動、同步或預設值重建時被覆蓋。

## Scope

- 追查常用餐點快捷 UI、建立／刪除流程、啟動載入與所有持久化位置。
- 確認快捷資料是否依 `household`／`ariel` scope 分開，以及 localStorage、Personal Kitchen State、Supabase、靜態 JSON 與 cache merge 的角色。
- 只將 `favorite_foods.json` 納入 `KitchenEngine.isUserStateFile()`，並沿實際 import chain 更新必要 Version Tag。
- 不處理餐點紀錄本身、其他 Personal Kitchen State、PAT、Supabase Storage／RLS 或既有規格文件。
- 不處理 scope 隔離、跨裝置同步、Supabase schema、官方預設與 user shortcuts merge，或其他資料架構重構。

## Must Not Break

- 2026-09-16 與其他既有餐點紀錄不得被改寫、刪除或重新合併。
- `household` 與 `ariel` 的庫存、採買、家用品及其他 scope 狀態不得互相覆蓋。
- 既有預設快捷選項、其他成員快捷操作、離線啟動與 iOS PWA cache 行為不得退化。
- 修正不得改寫使用者 storage、Supabase 或產品資料。

## Done When

- 無 favorite foods cache 時仍載入官方預設快捷。
- 新增快捷後，立即 reload 與完整 cold start 都能保留。
- 刪除自訂快捷後，cold start 不會讓它重新出現，且既有官方快捷仍保留。
- daily meal logs、pantry、shopping、household supplies、custom ingredients 與 Personal Kitchen Sync 未受影響。
- 必要 Version Tag 已更新，且沒有無關 cache bust。

## Suggested Executor

- 主規劃／調查：Codex ＋ GPT-6 Astra，負責跨 storage 與初始化流程的 root cause 分析。
- 確認方案後的執行：Codex ＋ GPT-5.6 Sol，負責最小修正與針對性驗證。

## Result / Handoff

- 狀態：Closed（完成）。2026-09-24 Ariel 已完成 iOS PWA 實機驗收，常用餐點快捷資料正常保留，問題未再發生。

### Root Cause

- `TrackerView` 的快捷清單直接讀取 `engine.getFavoriteFoods()`；新增與刪除分別呼叫 `saveFavoriteFood()`、`deleteFavoriteFood()`。
- 線上 production 新增快捷只寫入 localStorage key `kitchen_v2_favorite_foods.json`。它不屬於 Personal Kitchen State、不寫入 Supabase，也不經已停用的 GitHub cloud sync。
- App 完整啟動時會同時讀取本機快取與靜態 `src/data/favorite_foods.json`，但 `favorite_foods.json` 未列入 `isUserStateFile()`。只要靜態 fetch 成功，就會把 server default 指派回 runtime，並覆寫同一個 localStorage key，造成自訂快捷消失。
- 程式沒有隔日清除、日期判斷、restore 或 cache rebuild 邏輯。立即重開仍存在，最合理的原因是 iOS PWA 仍沿用未終止的記憶體狀態，或該次 fetch 失敗而退回本機 cache；隔天真正 cold start 且 fetch 成功時才觸發覆寫。
- 快捷資料沒有 `household`／`ariel` scope，也不依 Tracker 的 `currentMember` 分開；目前是同一瀏覽器／PWA storage 內共用一份。

### Actual Data Flow

1. `TrackerView.saveAsFavorite()` 建立 favorite object。
2. `KitchenEngine.saveFavoriteFood()` 更新 runtime `data.favoriteFoods`。
3. `saveJson('favorite_foods.json', ...)` 寫入 `kitchen_v2_favorite_foods.json`；只有 localhost 開發模式會額外 POST 改寫實體 JSON。
4. cold start 時 `initialize()` 呼叫 `fetchJson('favorite_foods.json', ...)`。
5. production 成功讀到靜態 JSON 後，因它不是 user state，server default 覆蓋 runtime 與 localStorage。
6. 餐點紀錄走 `recordMeal()`、`daily_logs` localStorage 與 Supabase `meal_logs`，因此不受這次覆寫影響。

### Implemented Minimal Fix

- 已只把 `favorite_foods.json` 加入 `KitchenEngine.isUserStateFile()`。既有 `mergeUserState()` fallback 會在本機 cache 存在時採用 local data；首次安裝沒有 cache 時仍以靜態 JSON 作為種子。
- 這個方案同時保護新增與刪除快捷，不需要新 storage、Supabase migration 或 Personal Kitchen schema 變更。
- `KitchenEngine.js` 的直接 import 與 `main.js` 入口已更新為 `20260920_FK001_FAVORITES_V1`；沒有修改其他資源 Version Tag。
- 此方案維持現況：快捷是裝置本機共用，不會變成 Ariel 專屬，也不會跨裝置同步。若需要 scope 隔離或跨裝置同步，應另開資料邊界 Batch。

### Verification Result

- 受影響：常用快捷的新增、刪除、首次預設值載入、online／offline cold start。
- 不應受影響：餐點紀錄、Supabase meal logs、庫存、採買、家用品、custom ingredients 與 Personal Kitchen sync。
- 取捨：裝置已有快捷 cache 後，日後新增到靜態 `favorite_foods.json` 的官方預設不會自動合併；這能同時保護使用者的新增與刪除。若官方預設仍需持續下發，需另設 merge／刪除墓碑規則，不屬於本次最小修正。
- 隔離式 smoke test 已通過六項驗收：首次無 cache 載入官方預設、新增後立即 reload 保留、模擬完整 cold start 保留、刪除後 cold start 不復活、官方預設保留、相鄰資料 key 未變。
- Ariel 的 iOS PWA 實機驗收已通過；常用餐點快捷資料正常保留，問題未再發生。
- 靜態 diff 確認 production logic 只新增一個 user state 檔名；daily meal logs、pantry／shopping、household supplies、custom ingredients 與 Personal Kitchen Sync 路徑均未修改。
- 已經被覆寫消失的「綜合莓果麥片」快捷沒有專用備份可自動還原；餐點紀錄仍可作為手動重建來源。

### Relevant Files

- `web/src/views/TrackerView.js`
- `web/src/engine/KitchenEngine.js`
- `src/data/favorite_foods.json`
- `web/src/services/PersonalKitchenState.js`
- `web/src/services/PersonalKitchenSyncService.js`
- `web/src/main.js`
- `web/index.html`

### Next Step

無；FK-001 已完成並關閉。
