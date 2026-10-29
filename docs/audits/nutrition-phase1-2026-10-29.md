# FK 營養稽核後續第一階段｜2026-10-29

本階段已修正可辨識的舊快取覆蓋、計量單位誤用與食材編輯遺失換算欄位。缺少來源的換算仍待確認，沒有新增假定重量或密度，**尚不可發布**。承接 [Issue #21](https://github.com/leebebe1002/kitchen-app/issues/21)、[Issue #16](https://github.com/leebebe1002/kitchen-app/issues/16) 與 [前次稽核](nutrition-2026-10-28.md)，沒有重做 89 項來源查證。

## 修改範圍與既有成果

開始時位於 `main`、HEAD `4b6f0d0`，只有主 worktree；連線工具查無開啟 PR。已實際讀取當時的中央 core-rules.md、AGENTS.md、README.md、PRD、DATA_SCHEMA 與 DESIGN_SYSTEM。系統禁止列出本機行程，因此不能確認所有其他 Agent 的活動。GitHub CLI 無網路，改用 GitHub 連線工具讀取 Issues／PR；未對外留言或變更 Issue 狀態。

所有既有修改先按原始 bytes 保存於 `/private/tmp/fk-phase1-baseline/`，並留下 SHA-256 manifest 與原始 diff。既有 `src/data/ingredients.json`、`tests/test_chef_advisor.mjs`、前次稽核 MD／JSON 均未變動；沒有覆寫前次資料成果。共用的兩份測試只調整本階段已改變的行為斷言。

| 本階段檔案 | 內容 |
| --- | --- |
| `web/src/utils/IngredientNutritionCache.js`（新增） | 舊母庫辨識、官方基準快照與自訂保護 |
| `web/src/utils/IngredientUnit.js`（新增） | 共用單位檢查；沒有換算證據時回傳不可計算 |
| `web/src/engine/KitchenEngine.js` | 載入遷移、備份、儲存標記、沿用原五項營養加總與捨入 |
| `web/src/components/IngredientDetailModal.js` | 保留每單位欄位，停止固定 ×1.8 假換算；通路／價格編輯不改營養 |
| `web/src/views/CalculatorView.js` | 保留待確認配方／記憶單位、分單位總備料、顯示提示、擋下不完整紀錄與 AI 配平 |
| `web/src/views/PantryView.js`、`web/src/main.js`、`web/index.html` | 僅更新受影響 import chain 的 `20261029_NUTRITION_GUARD_V1` 版本 |
| `tests/test_nutrition_cache_units.mjs`（新增） | 本階段隔離回歸測試 |
| `tests/test_nutrition_audit.mjs` | 舊快取應更新、不再容許單位衝突產生有限假總量 |
| `tests/test_weight_basis.mjs` | 移除「計算函式文字必須與 HEAD 完全相同」的過時斷言，其餘前次成果保留 |

`DATA_SCHEMA.md` 的「所有資料 100% 存於 JSON」落後目前 Personal Kitchen／Supabase 實作；本次遵守 AGENTS.md 與現有資料流，未修改三份規格文件。

## 快取新舊行為

以前同 ID 使用 `{...official, ...local}`，所以舊鮭魚 100 kcal 會蓋回新版 151.6。現在只替換營養與單位相關欄位，保留本機通路、價格等編輯：

| 情境 | 新行為 |
| --- | --- |
| 沒有快取 | 讀新版母庫，留下官方營養基準快照 |
| 完整營養／單位形狀符合 `4b6f0d0` 的 26 筆舊版，名稱／品牌及重量基準沒有明確差異，且沒有自訂證據 | 更新為新版官方營養，保留其他本機欄位 |
| 符合上次記錄的官方快照，沒有自訂標記 | 後續官方更新繼續生效，不會鎖死在本次版本 |
| 舊 `kitchen_v2_custom_ingredients` 有明確儲存紀錄 | 保留自訂營養；即使剛好等於舊母庫，也不強制更新 |
| 本次以後明確修改營養 | 標記自訂並保留；只改價格／通路不誤標為營養自訂 |
| 無法辨識來源的營養差異 | 保留原值並顯示待確認；不能沿用官方來源文字證明本機數值 |
| 真正新增的私房食材 | 沿既有路徑保留；不升格、不跨裝置搬移 |
| 舊 custom key 有同 ID 編輯、主快取不存在 | 仍可保留該編輯，不會被新載入的官方同 ID 擋掉 |
| 離線／遠端空白 | 保留本機資料，不清快取 |

辨識比對包括五項營養的完整值與 per100g／perServing／perUnit、計數及份量單位；不是只比熱量或看到 100 就覆蓋。歷史常數從 Git 提取，只供辨識，不是新的營養母庫。沒有逐欄歷史的舊資料仍有不可消除的限制：若手動編輯剛好等於歷史預設，且所有明確儲存紀錄也已遺失，無法證明當年的意圖。

第一次寫回前保留原字串至新增的 `kitchen_v2_ingredients.json_pre_nutrition_v1`，後續不覆蓋該備份。備份失敗時此次載入維持舊快取。食材內新增 `nutritionCache`／`nutritionReviewRequired` 只留在本機快取；既有 localhost 儲存 API 的 payload 會排除這兩個欄位。主快取與 custom key 名稱、Personal Kitchen key、scope 與 Supabase schema／RLS 均不變。

回復程式與回復資料不同：回退程式不會自動還原已更新的裝置快取；需要時先檢查該裝置的遷移備份，再經授權回復食材快取。本階段沒有自動 restore 或清除流程；備份不包含或搬移 household／ariel 狀態。

義大利麵保留使用者原始乾重每 100 g **160 kcal／P3／F1／C35／Na10**；鮭魚保留前次生重平均 **151.6／P20.7／F7.1／C0／Na55.8**。本次沒有重新查證這些來源，也沒有改任何母庫數值。

## 單位問題：修正誤算，換算數字仍待確認

| 問題 | 原誤算 | 本階段行為／所缺證據 |
| --- | --- | --- |
| 皮蛋、香菇貢丸、蛋餃、芋頭貢丸、馬鈴薯泡麵（5 項） | 每顆／包按 1 g 算 | 顯示待確認；需實際每單位可食重量或相符的每單位標示 |
| 蒸煮麵，泡麵與火鍋 default（2 處） | 1 包按 1 g 算 | 原配方不變；需單包乾麵重量 |
| 培根，義大利麵 default＋三成員（4 處） | 克數按條數算；自動配平也會改掉單位 | 保留原 g 與數字；需每條重量或可信每百克標示。既有 77 kcal/100g 是未有重量支持的 ×1.8 衍生值，不能拿它假裝已修正 |
| 鮮奶，特調飲品 default＋Bebe／Ariel（3 處） | ml 直接套用每百克 | 原配方不變；需密度或相符每 100 ml 標示 |
| 額外發現：無糖豆漿，特調飲品 Jason（1 處） | 無 unitLabel，配方 250 ml，既有每份是 100 g | 同一單位守門會攔下；未把 g 視為 ml，需對應標示 |

因此原列 **9 處**配方均已有誤算保護，實際守門另發現 **1 處**，不能聲稱 9 處換算都已取得來源、或 5 項重量已補齊。一般食材每百克、已有每顆／包 perUnit 的計算與原先一位小數捨入保持不變。缺換算的正數份量在計算層回傳不可計算值，UI 顯示待確認並隱藏營養總數；不以零或已知部分冒充完整總量。零份量不阻擋。

備料以 ID＋單位分列，不把 g 加到條；剪貼簿保留單位及待確認提示。自動配平不改掉尚未能換算的原配方／個人記憶份量。已有每單位營養的編輯視窗直接顯示每顆／包，不再用 ×1.8 生成百克值；OCR 的每百克結果不能擅自變成每顆／包，需依每單位標示手動填寫。

## 測試證據與限制

以下通過；所有儲存、登入、HTTP／Supabase 回應皆為記憶體假資料，未讀寫真實瀏覽器 LocalStorage，未操作正式家庭資料：

```bash
PYTHONPYCACHEPREFIX=/private/tmp/fk-phase1-baseline/pycache python3 -m py_compile server.py update_ingredients.py
find web/src -type f -name '*.js' -exec sh -c 'for f do node --check "$f" || exit 1; done' sh {} +
python3 -c "import glob, json; [json.load(open(f, encoding='utf-8')) for f in glob.glob('src/data/*.json') + glob.glob('web/*.json')]"
node tests/test_nutrition_cache_units.mjs
node tests/test_nutrition_audit.mjs
node tests/test_weight_basis.mjs
node tests/test_chef_advisor.mjs
node tests/test_leaked_key_cleanup.js
git diff --check
```

新增測試涵蓋整份歷史預設轉新版、未來官方更新、已標記／舊 custom／來源不明編輯、只有 custom key、精確備份、第二次啟動、離線、備份配額失敗、真正編輯 Modal 的營養／通路儲存、Bebe／Jason／Ariel、5 項計數與原 9＋額外 1 處衝突、混合單位總備料與剪貼簿、份量記憶、不完整餐點禁止記錄及禁止 AI 精算。實際 REST adapter 亦對兩個 scope 的 GET／PATCH 假回應核對，payload 僅含庫存／家用品／版本，無食材營養。

原稽核回歸仍涵蓋 duplicate reference 轉 canonical ID、無登入、空遠端不覆蓋本機及較新非空遠端讀取。Chef 33 項通過，真實 20 秒 timeout 測試約 20,005 ms；無真實 AI API 呼叫。Vue templates 已編譯檢查；尚未做 iPhone／Safari PWA 實機與視覺驗收，也沒有正式 Supabase 端到端驗證或另一位獨立驗收者簽核。

## Git 與發布

維持原 `main`／`4b6f0d0`，未 stage、Commit、Push、Merge 或 Deploy；原有未提交成果仍在。Git 狀態須同時看本階段與先前稽核，不能把整份 dirty diff 都算作本階段。精確保護結果及本階段 diff 已保存在任務暫存目錄。

發布判斷：**不可發布**。本階段防誤算程式已通過本機回歸，但 5 項計數及 9＋1 處配方仍缺換算證據；前次 2 項佔位／其他無法查證營養並未在本階段處理，且獨立驗收及裝置驗證未完成。下一步取得上述重量／密度／產品每單位標示後逐筆補正，不需要重做 89 項稽核。
