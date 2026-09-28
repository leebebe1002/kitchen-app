# Batch：FK-009 記住這組份量

- **Batch ID**：FK-009
- **名稱**：記住這組份量（Remember Portion Set）
- **狀態**：Merged — awaiting production verification
- **建立日期**：2026-09-28
- **分支**：`feature/fk-009-remember-portion-set`
- **目的**：讓 Bebe 在 Calculator 手動調整完份量後，可一鍵「記住這組份量」，未來同一成員使用同一組食材時，優先帶入已記住的份量，而非讓 AI 每次重新自由配比。
- **邊界限制**：先不修改 production code；不修改 Supabase、不建新 table、不做 migration；不重構 Calculator；不 commit / push / PR

---

## 一、現有 Calculator 資料流

### 1. AI 配比怎麼產生

```
使用者點擊計算按鈕
  → calculate() [line 1188]
    → autoBalanceMemberPortions(member) [line 1190]  ← 本地配比先執行，建立基線
    → callAiChefAdvisor() [line 1203]               ← 呼叫 Gemini AI
      → 成功：用 AI 結果完全覆寫 memberIngredients[member].amount [line 1518~1542]
      → 失敗：沿用 autoBalance 基線值
```

**關鍵**：AI 成功時直接 `target.amount = aiItem.amount`，沒有任何機制尊重使用者手動改過的值。

### 2. 使用者手動 +/- 後資料存哪裡

- `adjustMemberAmount()` 直接 mutate `memberIngredients.value[member]` 中的物件
- 同時被 `sessionStorage` 持久化（`STORAGE_KEY = 'family_kitchen_calc_session_state'`）
- **關閉 App / 關閉 Tab → sessionStorage 清空 → 值消失**
- 沒有任何 `localStorage` 或 Supabase 保存手動調整過的份量

### 3. 再次計算時手動值是否被覆蓋

**是，100% 覆蓋。** `autoBalance` 先跑蓋掉手動值，AI 成功後再覆蓋一次。`isResultStale` 只標記需要重算，不保護手動值。

---

## 二、favorite_foods 是否適合重用

### 現有結構

```javascript
// engine.data.favoriteFoods（來源：favorite_foods.json）
[{
  id: 'fav_1727430000000',
  name: '便當店排骨便當',
  icon: '⭐️',
  category: '客製常用',
  nutrients: { kcal: 680, protein: 28.5, carbs: 82.0, fat: 24.0, sodium: 980 },
  aiNote: 'AI 估算...'
}]
```

**用途**：僅用於 TrackerView 快速帶入整餐總營養數值。SSOT 為 local-only（FK-005 確認高風險）。

### 評估結論

**不適合重用。**

| 向度 | favorite_foods | FK-009 需求 |
|---|---|---|
| 主體 | 整餐總營養數值 | 食材組合各別克數 |
| 觸發場景 | TrackerView 紀錄 | CalculatorView 份量帶入 |
| 識別鍵 | 料理名稱（字串，不穩定） | 食材 ID 集合（穩定）|

**FK-009 應建立獨立的 `portion_memory` 資料結構，不混入 favorite_foods。**

---

## 三、建議的最小資料結構

```javascript
// localStorage key: 'fk_portion_memory'

{
  "version": 1,
  "sets": [
    {
      "id": "pm_1727430000000",
      "member": "bebe",
      "ingredientSetKey": "black_sesame_powder|ing_pea_protein|soy_milk_unsweetened",
      // 食材 ID 排序後 join('|')，作為「同一組食材」的穩定識別鍵
      "portions": [
        { "id": "ing_pea_protein",       "amount": 40,  "unit": "g" },
        { "id": "black_sesame_powder",    "amount": 5,   "unit": "g" },
        { "id": "soy_milk_unsweetened",   "amount": 350, "unit": "g" }
      ],
      "savedAt": "2026-09-28T13:00:00+08:00",
      "dishContext": null
    }
  ]
}
```

**設計原則：**
- `ingredientSetKey`：`selectedMasterIngredients` 排序後 join，純 ID 無名稱，改名不影響
- `member + ingredientSetKey` 組合為查找鍵
- 覆蓋式更新：同一 `member + ingredientSetKey` 再次記住 → 更新 `portions` 與 `savedAt`，不新增重複
- 結構扁平，未來遷移 Supabase 只需一張表：`portion_memory(id, member, ingredient_set_key, portions jsonb, saved_at timestamptz)`

---

## 四、「同一組食材」如何辨識

**方案：穩定 Ingredient ID 集合排序後 join**

```javascript
const buildIngredientSetKey = (ingredientIds) =>
  [...ingredientIds].sort().join('|');

const findPortionMemory = (member, ingredientIds) => {
  const key = buildIngredientSetKey(ingredientIds);
  const store = JSON.parse(localStorage.getItem('fk_portion_memory') || '{"sets":[]}');
  return store.sets?.find(s => s.member === member && s.ingredientSetKey === key) || null;
};
```

**匹配邏輯：完全匹配**（集合完全相同）才觸發帶入。新增或移除一種食材 → 視為新組合，不帶入舊記憶。

---

## 五、Member Scope 設計

- `member` 欄位使用現有的 `'bebe' | 'ariel' | 'jason'`
- `member + ingredientSetKey` 聯合索引，同一組食材可有三份不同成員的記憶
- 帶入時只帶入當前成員的記憶，不跨成員共用
- Scope：**global（不分 household / ariel scope）**
  - 理由：「份量偏好」是個人的身體習慣，與庫存的 scope 概念不同。Bebe 的 40g 蛋白粉習慣不因切換廚房 scope 而消失

---

## 六、標準份量的行為設計

### 問題

目前 `calculate()` 第一步呼叫 `autoBalanceMemberPortions()`，這會蓋掉任何預設值。

### 建議方案：「記住的份量」插入在 AI 結果之後

```
1. autoBalance() → 建立基線（不動）
2. AI 呼叫 → AI 覆寫（不動）
3. 【新增】loadPortionMemory() → 用記住的份量最終覆寫
```

**好處**：最小侵入，不修改 AI prompt 與 autoBalance 邏輯。記住的份量是最終使用者意圖，優先級最高。

**實作位置**：在 `calculate()` 中，AI 精算成功回調的 `isCalculated.value = true` 之前。

---

## 七、剩餘額度的行為設計

**問題情境**：Bebe 記住 40g 蛋白粉，但今晚剩餘額度只剩 100 kcal。

**設計原則：「告知」而非「偷偷改掉」**

套用記住份量後，若計算熱量超出剩餘額度，在 Member Card 中顯示提示，不自動調整份量。

```
┌──────────────────────────────┐
│  Bebe                        │
│  豌豆蛋白                40 g │
│  黑芝麻粉                 5 g │
│  無糖豆漿               350 g │
│                              │
│  ⚠️ 今餐 314 kcal 超過剩餘額度  │
│     100 kcal（常用份量優先帶入）  │
│                              │
│        ♥ 已記住這組份量          │
│  ──────────────────────────  │
│  🔴 熱量: 314k  🟢 蛋白: 40g  │
└──────────────────────────────┘
```

**規則**：
- 只在 `memberPortionModes[member] === 'remaining'` 時顯示
- 不阻擋操作，僅告知
- Bebe 有完全決定權

---

## 八、UI 最小調整方案

### 按鈕位置

Member Card「食材份量列表」正下方，「營養總結 Tags」上方。

### 按鈕三態

| 狀態 | 條件 | 顯示 |
|---|---|---|
| `unsaved` | 無記憶 or 份量與記憶不一致 | `♡ 記住這組份量` |
| `saved` | 有記憶且份量完全一致 | `♥ 已記住這組份量` |
| `modified` | 有記憶但份量被手動修改 | `♡ 更新這組份量` |

**偵測方式**：儲存後保留 `lastSavedPortions`（per member），`memberIngredients` 異動時比對，決定顯示哪個狀態。

### 互動規則

1. 點擊 `♡ 記住這組份量` → 立即儲存至 localStorage，無 modal，無跳頁
2. 視覺權重低：小型文字 + 愛心 icon，不做成主要 CTA

---

## 九、預計修改哪些檔案

| 檔案 | 修改內容 |
|---|---|
| `web/src/views/CalculatorView.js` | 新增 `portionMemory` 相關 state 與函式；修改 `calculate()` 插入記憶帶入；修改 template 新增按鈕與超額提示 |
| `batches/FK-009-remember-portion-set.md` | 本文件 |
| `progress.md` | Active Batch 更新為 FK-009 |

**不需要修改**：`KitchenEngine.js`（不新增 engine method，localStorage 直接讀寫）、`favorite_foods.json`、Supabase schema

---

## 十、FK-006～008 影響評估

| 影響向度 | 評估 |
|---|---|
| FK-006（Local-only 上雲架構設計） | `fk_portion_memory` 屬 local-only 新增資料，FK-006 架構設計時應將其納入清單 |
| FK-007（Local → Supabase sync 實作） | localStorage key 設計遷移友好（扁平 JSON，key 獨立），FK-007 時可直接新增對應表 |
| FK-008（Snapshot / cold backup） | 無直接影響，資料量小，在 FK-008 snapshot 範圍內即可 |
| 同步衝突 | 第一版 local-only，無多裝置衝突；上雲後 last-write-wins 策略即可 |

**結論：FK-009 不阻擋也不破壞 FK-006～008 的規劃。FK-006 架構設計時備忘新增 `fk_portion_memory`。**

---

## 十一、建議的最小 MVP

**範圍（4 個要素）：**
1. `fk_portion_memory` localStorage 讀寫工具函式（純 JS）
2. `calculate()` 中 AI 完成後插入 `loadPortionMemory()`
3. Member Card 新增「♡ 記住這組份量」三態按鈕
4. 超額提示（僅在剩餘額度模式且已有記憶時顯示）

**排除（Not in MVP）：** 記憶清單管理頁、個別食材規則管理、Supabase 同步、跨料理記憶共用

**估計改動行數**：`CalculatorView.js` 約 +80～120 行（logic + template）

---

## 十二、產品決策與實作落實

Bebe 於 2026-09-28 確認四項核心產品決策並已落實至代碼：

1. **食材組合匹配：嚴格完全匹配**
   - 採 `member + sorted checkStock ingredient IDs`。
   - 同一 member 且完全相同食材集合才套用記憶；新增或移除食材即視為新組合。

2. **帶入時機：最高優先級覆寫**
   - 執行鏈：`autoBalance` → `AI 精算` / 本地計算 → `portion memory 最後覆寫`。
   - `getMemberNutrition()` 直接基於最終 `memberIngredients` 即時響應，Member Card 營養數值（kcal / protein / carbs / fat / sodium）與最終份量完全一致，無 AI 覆寫前數值殘留。

3. **剩餘額度模式：告知，不偷偷修改**
   - 在 `remaining` 模式且已有記住份量時，若常用份量超過今日剩餘額度，保留常用份量且不阻擋操作。
   - Member Card 顯示輕量黃色提示：`⚠️ 常用份量約 X kcal，超過今日剩餘額度 Y kcal`。

4. **UI 互動與狀態回饋**
   - 按鈕置於 Member Card 份量清單下方、Tags 上方，居中低視覺權重。
   - 三態切換：
     - `unsaved`：`♡ 記住這組份量`
     - `saved`：`♥ 已記住這組份量 · 取消`（點擊取消即可刪除該筆記憶）
     - `modified`：`♡ 更新這組份量`（使用者調整任何克數即時切換）
   - 當食材或克數異動時透過 Vue deep watcher 自動比對更新三態。

---

## 十三、實機驗收紀錄

- **驗收日期**：2026-09-28
- **驗收者**：Bebe
- **驗收結果**：Local UI verification passed by Bebe (OK)
- **驗收項目**：
  1. 常用份量記住與橘心顯示正常
  2. 手動微調後即時切換為「♡ 更新這組份量」，還原即切回「♥ 已記住」
  3. AI 重算後常用份量優先覆寫成功，營養數值即時連動
  4. 剩餘額度超額黃色 warning 顯示且份量不被偷偷竄改
  5. 點擊取消正常清除記憶並切換回 unsaved

---

## 附：localStorage Key 設計

```
Key：  kitchen_v2_portion_memory
Type： JSON String
Scope：global（不分 household / ariel scope）

未來遷移路徑：
  Supabase table: portion_memory
  欄位: id (text PK), member (text), ingredient_set_key (text),
        portions (jsonb), saved_at (timestamptz)
  索引: (member, ingredient_set_key) UNIQUE
```
