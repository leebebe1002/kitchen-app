# Family Kitchen 2.0 (`kitchen-app`)｜AI 協作規則

本檔是本 repository 的 vendor-neutral AI 協作規則 SSOT。所有 AI 工具與協作者皆以此為唯一準則。

## 開始修改前

- 先讀 `README.md`、`docs/PRD.md`、`docs/DATA_SCHEMA.md`、`docs/DESIGN_SYSTEM.md`。
- 任務與需求管理以 **GitHub Issues** 為 SSOT；日常開發不再建立新的 Batch Markdown 或維護 `progress.md`。
- 再依任務讀取實際資料流；涉及庫存、採買、家用品、食材或同步時，至少檢查 `web/src/engine/KitchenEngine.js`、`web/src/services/PersonalKitchenState.js`、`web/src/services/PersonalKitchenSyncService.js` 與相關 View／migration。
- 規格文件有部分舊架構描述；遇到文件與 production 實作不一致時，先回報，不可默默改變資料邊界。
- FK 已是 production system。優先做最小、可驗證、可回復的修改，避免不必要的大規模重構。

## 架構與資料邊界

| 資料層 | 角色 | 規則 |
|---|---|---|
| 官方母庫 | `src/data/` 的共用食材、料理與其他版本化基準資料 | 全家共用；不可混入某一個人的庫存、採買或私人狀態。 |
| Personal Kitchen State | `pantryInventory` 與 `householdSupplies`；本機 scope 快取並可同步至 Supabase | 只保存庫存、採買、food cart 與家用品等 scope 狀態，不可回寫成全家共用母庫。 |
| 本機 custom ingredients | `localStorage` 的 `kitchen_v2_custom_ingredients`，啟動時合併進食材清單 | 是裝置端私房食材，不等於官方母庫，也不屬於 Personal Kitchen State；未經明確決定不可自動升格或跨裝置搬移。 |

- `household` scope 只屬於 Bebe 與 Jason；`ariel` scope 只屬於樂樂。兩者的庫存、採買與家用品不得互相合併、複製或覆寫。
- 食材與料理等共用資料不因 Personal Kitchen scope 切換而分家。
- 任何修改若會跨越上述邊界，動手前先說明受影響的 scope、儲存位置、遷移／回復方式與舊資料相容性。

## Initialize、同步與 Restore

- 啟動順序不可破壞：先載入目前 scope 的 Personal Kitchen State，再做食材去重與 custom ingredients 合併。
- 已有 scope 狀態時優先使用它；只有 `household` 可在首次建立時承接既有未分組庫存，`ariel` 必須從空白狀態開始。
- 空白遠端資料不得覆蓋非空本機資料。同步方向必須同時考慮 `updatedAt` 與資料是否實際為空，不可只靠時間戳。
- 寫入前保留現有本機備份；restore 必須指定且驗證 scope，不可把 `household` 備份還原到 `ariel`，反之亦然。
- 不可用靜態 `pantry_inventory.json` 或舊版共用 localStorage 快取覆蓋已初始化的 Personal Kitchen State。

## 食材與重複保護

- 新增或改名食材必須沿用 `IngredientMatcher.js` 的標準化、核心詞與相似度規則，不得另寫一套比對邏輯。
- 完全同名時更新既有 canonical ingredient，不建立第二個 ID；高度相似時必須讓使用者確認是否真為不同規格。
- 啟動自癒若移除重複 custom ingredient，必須先把庫存狀態與採買清單 reference 安全轉到 canonical ID。
- 不可繞過 UI 守門與 `KitchenEngine.saveIngredient()` 的第二層 duplicate protection。

## 相片、通路與 PWA 快取

- Base64 相片只能作為分析／上傳期間的暫存，禁止寫入任何 localStorage、JSON 狀態或 Personal Kitchen State。成功時只保存 Supabase Storage URL；上傳失敗時保存 `null`，不可降級保留 Base64。
- 通路名稱的 canonical value 一律是 `EC`。舊值 `EC 電商` 只可在讀取／遷移邊界正規化，不可再寫入新資料或 UI 選項。
- iOS Safari PWA 容易保留舊 ES module。修改 CSS 或可載入模組後，更新直接引用它的 `?v=` Version Tag，並沿 import chain 一路更新到 `web/index.html` 的 `style.css` 或 `main.js` 入口。
- 同一個需要 singleton 行為的模組必須使用完全相同的 URL；不可用不同 Version Tag 載入兩份實例。`FamilyAuthService.js` 與同步服務共用 session 的既有無版本 URL 規則不得破壞。
- Version Tag 使用可辨識且唯一的日期／變更名稱；只更新實際受影響的載入鏈，不做無關 cache bust。

## 驗證標準

修改程式碼後必須執行以下基礎驗證：

```bash
# 1. Python 腳本語法檢驗
python3 -m py_compile server.py update_ingredients.py

# 2. JavaScript 模組語法檢驗
find web/src -name "*.js" -exec node -c {} +

# 3. 靜態資料結構 (JSON) 完整性檢查
python3 -c "import glob, json; [json.load(open(f, encoding='utf-8')) for f in glob.glob('src/data/*.json') + glob.glob('web/*.json')]"
```

## 修改、驗收與交接

- 不得為了整理程式碼改動 production 行為；跨資料層、scope、localStorage key、Supabase schema／RLS 或 merge policy 的變更必須先列出影響範圍。
- 資料寫入路徑的修改至少驗證：`household`、`ariel`、本機無登入、遠端空白、遠端已有資料、舊 cache 與重複食材 reference。
- 未經要求不修改 `docs/PRD.md`、`docs/DATA_SCHEMA.md`、`docs/DESIGN_SYSTEM.md`；發現明確錯誤或落差時只回報並等待決定。
- 重大架構決策寫入 `docs/decisions/`；一般實作細節留於 Git commit / PR 即可。
- **Handoff 規則**：正常交付時維持 clean working tree + commit + Issue 更新；中途被迫換工具時使用 Issue comment / Draft PR / 臨時 `NEXT.md`（接手完成後立即刪除），嚴禁建立永久 `HANDOFF.md`。
