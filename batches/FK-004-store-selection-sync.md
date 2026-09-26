# Batch：FK-004 修正採買通路顯示與編輯選取狀態不同步

## Goal

調查並修復 Shopping 採買清單中，商品卡片顯示的採買通路文字與點開「勾選採買通路」編輯器時之勾選狀態（Selected State）不一致的 Bug（例如「盒裝面紙」顯示「Costco 好市多、全聯」，但編輯器中 Costco 未被勾選）。

## Why

商品卡片上的通路文字與編輯器選項狀態不同步，會導致使用者點開編輯時容易誤判該商品尚未設定特定通路，若重新保存可能覆蓋或丟失原本設定的通路資料，並產生雙胞胎別名資料。

## Scope

- 官方母庫 `src/data/household_supplies.json` canonical 修正（3 筆）。
- 新增共用 `web/src/utils/StoreNormalizer.js`（處理別名映射、trim、去重）。
- `ShoppingView.js` / `PantryView.js`：`getItemStores()` 與 `toggleStoreForItem()` canonical 正規化與去重。
- `KitchenEngine.js`：將既有 `EC 電商 → EC` 特例收斂至共用 normalizer。
- `IngredientDetailModal.js`：收斂食材編輯時的 store 讀寫至共用 normalizer，防止產生別名與雙胞胎。
- **明確不在本 Batch 範圍**：
  - 不修改 Supabase schema。
  - 不做 DB migration。
  - 不重構 ShoppingView / PantryView 架構。
  - 不修改其他無關資料。

## Must Not Break

- 通路篩選 Tab（All, 全聯, Costco, 義美, EC, 傳統市場, 其他）正常運作。
- 採買狀態（未買/已買）、加到購物車、庫存補貨等既有功能保持正常。
- 保持 CLI-first 操作原則，未獲 Bebe 確認前不 commit、不 push、不 merge。

## Done When

1. 查明根本原因與受影響範圍。
2. 提出最小修正方案並獲 Bebe 確認。
3. 盒裝面紙卡片顯示 `Costco、全聯`。
4. 編輯器展開時，`Costco` 與 `全聯` 皆呈現已選狀態。
5. 通路篩選、badge count 與切換均使用 canonical 值，不產生雙胞胎。
6. `EC 電商 → EC` 相容與 PantryView 運作正常。
7. Smoke test 通過，停在 DIFF 驗收區。

## Result / Handoff

- 修正完成，待 Bebe 進行 DIFF 驗收。
