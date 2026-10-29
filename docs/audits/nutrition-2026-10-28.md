# Family Kitchen 官方食材營養稽核｜2026-10-28

已逐項檢查 89 項並完成可確認的修正；尚未達發布條件。稽核涵蓋五項營養、可食部、秤重狀態、每百／份／單位換算及可追溯性，不表示 89 項均已核實。這是稽核交付文件，任務狀態以 [GitHub Issue #21](https://github.com/leebebe1002/kitchen-app/issues/21) 為準；快取問題沿用 [#16](https://github.com/leebebe1002/kitchen-app/issues/16)。

## 狀態與本次範圍

| 狀態 | 項數 |
| --- | --- |
| 來源待確認 | 44 |
| 有來源的通用估算 | 38 |
| 預設佔位待修 | 2 |
| 可靠已核實 | 1 |
| 無法查證 | 4 |


「可靠已核實」1 項為 Bebe 本次明確確認的乾義大利麵原始產品標示，依使用者證言保留，未獨立重閱包裝。38 項為來源可重現的通用估算，並非 38 項品牌標示已核實。44 項來源待確認及 4 項無法查證均保留原數值；2 項已知佔位也保留，避免編造產品標示。

相對工作開始時實際修改 **24 項**：22 項每 100 g 數值、2 項補每單位計算欄位；另 14 項既有營養數值與採用來源相符，只補正來源說明。15 項原始佔位中共 13 項採有來源估算，其中毛豆／地瓜為前一工作已試修，本次重新取得官方來源核對，不能算作本次新修的數值。

初始分支 `main`、HEAD `4b6f0d0`；既有未提交檔為 `ingredients.json`、`test_weight_basis.mjs`，已先保存逐檔基準於 `/private/tmp/fk-nutrition-audit/`。未 reset、stash、clean、刪檔。只有主 worktree，GitHub 查無開啟的 PR；系統禁止 `ps`，因此不能宣稱已排除所有其他本機 Agent 行程。

## 來源與可重現方法

查詢日期均為 **2026-10-28**。直接下載 [TFDA 官方資料集](https://data.fda.gov.tw/data/opendata/export/20/json)（[資料集目錄](https://data.gov.tw/dataset/8543)）與 [USDA SR Legacy 官方 JSON](https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip)，不以轉載網站作修正依據。完整檔案的 SHA-256、原始紀錄 ID、品名、狀態、五項值與熱量係數均保存在同目錄 JSON。TFDA 的未檢測／缺值不當作零；例如一般醬油粗脂肪缺值，故採 USDA 完整 shoyu 記錄。

一般每百值以每 **100 g 可食部** 為準；來源原值採十進位 half-up 至小數 1 位，保留與原資料相同的數字表示。TFDA 採欄位「熱量」，沒有混用「修正熱量」；兩欄差別及纖維留在來源快照。ml 品項若缺密度，只列問題，不自動假設 100 g＝100 ml。每份原標示的捨入差異不以比例回算擅自覆蓋。

| 來源檔 | 紀錄數 | SHA-256 |
| --- | --- | --- |
| USDA_SR_LEGACY | 7793 | 0fe8ae486a2c8eb42cb96413f058deb51863a46c8fb8eeb4b1fb45006dd338ef |
| TFDA_20 | 230152 | 755d2f0e4a7c1fe80ac0636863117e376773c9342cfd68e7b05e67d81e3c6064 |


重現：解壓 USDA JSON 的 `SRLegacyFoods`，依 `fdcId` 取 `foodNutrients` 的 nutrient number `208/203/204/205/307`，依序為 kcal/P/F/C/Na。TFDA 解壓 `20_5.json`，依 `整合編號` 篩選「熱量／粗蛋白／粗脂肪／總碳水化合物／鈉」，取 `每100克含量`；每項狀態取 `內容物描述`。不要把 `每單位重含量` 誤當每 100 g。JSON 的來源快照可供離線覆核，但不取代原始資料集。

### 鮭魚平均

選八筆一般 **生** 鮭魚記錄，排除 Alaska Native 另列樣本以免同品種重複，排除熟、罐裝、煙燻及鹽漬。大西洋鮭與銀鮭各包含野生、養殖兩筆，其他品種各一筆。這是 **記錄等權**，不是物種等權，也不是台灣市場占比加權。每個營養欄加總除以 8，再各自捨入。

| FDC ID | 原始品名 | kcal/P/F/C/Na，每 100 g |
| --- | --- | --- |
| 173686 | Fish, salmon, Atlantic, wild, raw | 142/19.8/6.34/0/44 |
| 173688 | Fish, salmon, chinook, raw | 179/19.9/10.4/0/47 |
| 173689 | Fish, salmon, chum, raw | 120/20.1/3.77/0/50 |
| 173691 | Fish, salmon, sockeye, raw | 131/22.2/4.69/0/78 |
| 173715 | Fish, salmon, coho, farmed, raw | 160/21.3/7.67/0/47 |
| 175136 | Fish, salmon, coho, wild, raw | 146/21.6/5.93/0/46 |
| 175138 | Fish, salmon, pink, raw | 127/20.5/4.4/0/75 |
| 175167 | Fish, salmon, Atlantic, farmed, raw | 208/20.4/13.4/0/59 |


未捨入平均：`151.625 / 20.725 / 7.075 / 0 / 55.75`；採用：**151.6 / 20.7 / 7.1 / 0 / 55.8**。樣本熱量 120–208 kcal；例如實際使用養殖大西洋鮭 208 kcal 時，通用平均會低估約 27%，此限制不因平均可重現而消失。

## 實際數值與計算欄位修正

表內順序一律 **kcal / P g / F g / C g / Na mg**。除明列每包／顆外均為每 100 g 可食部。「開始前」指本次任務開始時，包含已存在的毛豆／地瓜試修；不是用 HEAD 假裝成初始工作樹。

| 食材／欄位 | 開始前 | 修正後 | 採用來源 |
| --- | --- | --- | --- |
| 雞胸肉 `sous_vide_chicken` per100g | 115/23/1.5/0/180 | 119/23.3/2.1/0/50 | [TFDA:I04024](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 一般優格 `plain_yogurt` per100g | 61/4/3.3/4.7/46 | 61/3.5/3.3/4.7/46 | [USDA:171284](https://fdc.nal.usda.gov/food-details/171284/nutrients) |
| 凍豆腐 `frozen_tofu` per100g | 100/10/5/10/100 | 131/12.9/7.1/3.9/8 | [TFDA:R4701001](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 鮭魚 `salmon` per100g | 100/10/5/10/100 | 151.6/20.7/7.1/0/55.8 | [USDA:173686](https://fdc.nal.usda.gov/food-details/173686/nutrients)<br>[USDA:173688](https://fdc.nal.usda.gov/food-details/173688/nutrients)<br>[USDA:173689](https://fdc.nal.usda.gov/food-details/173689/nutrients)<br>[USDA:173691](https://fdc.nal.usda.gov/food-details/173691/nutrients)<br>[USDA:173715](https://fdc.nal.usda.gov/food-details/173715/nutrients)<br>[USDA:175136](https://fdc.nal.usda.gov/food-details/175136/nutrients)<br>[USDA:175138](https://fdc.nal.usda.gov/food-details/175138/nutrients)<br>[USDA:175167](https://fdc.nal.usda.gov/food-details/175167/nutrients) |
| 全脂鮮奶 `full_fat_milk_250` per100g | 100/10/5/10/100 | 63/3.1/3.6/4.8/37 | [TFDA:L01021](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 蟹肉棒 `crab_stick` per100g | 100/10/5/10/100 | 118/9.3/0.7/18.6/694 | [TFDA:R6700101](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 黑木耳 `black_fungus` per100g | 25/1/0.2/6.5/10 | 38/0.9/0.1/8.8/12 | [TFDA:G0100101](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 玉米筍 `baby_corn` per100g | 31/1.5/0.3/6.5/2 | 33/1.8/0.2/7/0 | [TFDA:E1300201](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 大白菜 `chinese_cabbage` per100g | 13/1.2/0.2/2.4/15 | 16/1.2/0.2/3.2/9 | [USDA:169979](https://fdc.nal.usda.gov/food-details/169979/nutrients) |
| 香菇 `mushroom` per100g | 38/3.1/0.3/6.8/6 | 39/3/0.1/7.6/1 | [TFDA:G08001](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 海苔絲 `nori_strips` per100g | 100/10/5/10/100 | 278/46.5/3.7/32.1/387 | [TFDA:F9900201](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 小番茄 `cherry_tomatoes` per100g | 100/10/5/10/100 | 33/0.9/0.2/7.4/6 | [TFDA:E74004](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 黃豆芽 `bean_sprouts` per100g | 100/10/5/10/100 | 47/5.3/1.6/5/7 | [TFDA:E7700401](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 青蔥 `scallion` per100g | 32/1.8/0.2/7.3/10 | 32/1.8/0.2/7.3/16 | [USDA:170005](https://fdc.nal.usda.gov/food-details/170005/nutrients) |
| 青花椒乾拌麵 `green_pepper_noodle` perUnit（每包） | 缺 perUnit（沿用每份：390.9/13.1/7.7/67.3/1070.1） | 390.9/13.1/7.7/67.3/1070.1 | [BRAND:CHIASELECT](https://www.chiaselect.com/zh-TW) |
| 馬鈴薯 `potato` per100g | 77/2/0.1/17/6 | 77/2.1/0.1/17.5/6 | [USDA:170026](https://fdc.nal.usda.gov/food-details/170026/nutrients) |
| 蒸煮麵 `steamed_noodle` per100g | 100/10/5/10/100 | 350/11.6/1.5/72.5/362 | [TFDA:R2000101](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 黑芝麻粉 `sesame_powder` per100g | 570/18/49/23/5 | 601/15.7/55.2/20.8/3 | [TFDA:C1620101](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 可可粉 `cocoa_powder` per100g | 228/20/14/58/20 | 228/19.6/13.7/57.9/21 | [USDA:169593](https://fdc.nal.usda.gov/food-details/169593/nutrients) |
| 煙燻海鹽 `smoked_sea_salt` per100g | 100/10/5/10/100 | 0/0/0/0/38800 | [USDA:173468](https://fdc.nal.usda.gov/food-details/173468/nutrients) |
| 醬油 `soy_sauce` per100g | 100/10/5/10/100 | 53/8.1/0.6/4.9/5490 | [USDA:174277](https://fdc.nal.usda.gov/food-details/174277/nutrients) |
| 沙茶醬 `shacha_sauce` per100g | 100/10/5/10/100 | 729/10.2/71.8/10.4/421 | [TFDA:P1001701](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 橄欖油 `olive_oil` per100g | 884/0/100/0/0 | 884/0/100/0/2 | [USDA:171413](https://fdc.nal.usda.gov/food-details/171413/nutrients) |
| 咖啡膠囊 `coffee_capsule` perUnit（每顆） | 缺 perUnit（沿用每份：20/0.3/0/4.6/18） | 20/0.3/0/4.6/18 | [REPO:COFFEE](https://github.com/leebebe1002/kitchen-app/commit/612ae574e26ddeede1fb44b871101fbbd86aaa8f) |


咖啡膠囊只新增每顆 `perUnit`，完整保留 commit `612ae57` 的每份及每百標示；一顆計算由 1.2 kcal 變為 20 kcal。青花椒乾拌麵只把既有每包 `perServing` 複製為 `perUnit`，由 0 變為 390.9 kcal；這兩項是欄位換算修正，**不是新的品牌標示驗證**。未修改引擎運算公式、ID、名稱、分類、計數單位或料理配方。

## 15 項原始佔位的處理

| 食材 | 狀態 | 目前每 100 g：kcal/P/F/C/Na | 說明 |
| --- | --- | --- | --- |
| 蝦仁漿 | 預設佔位待修 | 100/10/5/10/100 | 確認是 FK 預設佔位，仍未修。老四川同名品 219.1 kcal 且含豬背脂／花枝，與 FK 未知配方可能差很大，不擅採該品牌值。 |
| 凍豆腐 | 有來源的通用估算 | 131/12.9/7.1/3.9/8 | 冷凍豆腐原狀可食部，非脫水乾凍豆腐 |
| 毛豆 | 有來源的通用估算 | 129/14.6/3.3/12.5/1 | 生鮮、去殼毛豆仁；帶殼重、加鹽冷凍即食毛豆不適用；試修五項值重核相符 |
| 鮭魚 | 有來源的通用估算 | 151.6/20.7/7.1/0/55.8 | 八筆非 Alaska Native 生鮭魚物種／養殖狀態記錄等權算術平均；每 100 g 可食部；並非市場占比加權或品牌標示，120–208 kcal 範圍；方法與樣本見稽核表 |
| 全脂鮮奶 | 有來源的通用估算 | 63/3.1/3.6/4.8/37 | 全脂鮮乳平均值，以實際 g 秤量；ID 的 250 不代表 250 g 一份 |
| 蟹肉棒 | 有來源的通用估算 | 118/9.3/0.7/18.6/694 | 冷凍蟹味棒原狀，魚漿製品；不代表特定品牌 |
| 海苔絲 | 有來源的通用估算 | 278/46.5/3.7/32.1/387 | 未調味壽司海苔片切絲的乾重近似；油炸、調味海苔不適用 |
| 小番茄 | 有來源的通用估算 | 33/0.9/0.2/7.4/6 | 紅色系小番茄平均值，生、去蒂可食部；非單一品種標示 |
| 黃豆芽 | 有來源的通用估算 | 47/5.3/1.6/5/7 | 生黃豆芽可食部；不是綠豆芽 |
| 王子麵 | 預設佔位待修 | 100/10/5/10/100 | 確認是 FK 預設佔位，仍未修。原味 40 g 含調味包、50 g 滷味無調味包版本不同；原資料沒 SKU。需確認是否連調味包使用，不強套不相符版本。 |
| 地瓜 | 有來源的通用估算 | 86/1.6/0.1/20.1/55 | 生地瓜可食部；美國通用品種，台灣甘藷的含水率及品種可能不同；維持既有試修的一位小數值 |
| 蒸煮麵 | 有來源的通用估算 | 350/11.6/1.5/72.5/362 | 以一般乾小麥麵條作烹煮前乾重估算；不宣稱維力品牌標示，鈉值待實際包裝確認 |
| 煙燻海鹽 | 有來源的通用估算 | 0/0/0/0/38800 | 純煙燻鹽暫以食鹽估算；非複方調味鹽，含水率／礦物質差異未涵蓋；100 g 鈉 38800 mg，不是 1 g |
| 醬油 | 有來源的通用估算 | 53/8.1/0.6/4.9/5490 | 一般黃豆小麥醬油 shoyu 原狀；非低鈉或醬油膏；TFDA 一般醬油粗脂肪缺值，故選五項齊全 USDA，不把缺值填零 |
| 沙茶醬 | 有來源的通用估算 | 729/10.2/71.8/10.4/421 | 葷沙茶醬，先將油脂及固形物拌勻再秤重；不適用素沙茶或瀝油固形物 |


蝦仁漿候選官方標示含花枝及豬背脂，配方與 FK 購買品未明；王子麵存在原味含調味包與滷味無調味包版本。沒有足夠證據選定版本，因此保留佔位並明列風險，不能作可靠計算。

## 可可、柚子酒與義美烏醋

可可採 USDA 169593 無糖未鹼化乾粉：228 kcal、P19.6、F13.7、C57.9、Na21，纖維 37 g 已包含在總碳水中。該筆熱量係數 P=1.83、F=8.37、C=1.33，回算約 227.53 kcal，對應發布的 228。不能只扣纖維後再套 4/9/4，就聲稱必須得到 228；加糖及鹼化可可屬其他品項。

柚子酒保留 160 kcal／100 ml 的現值與 48 kcal／30 ml。4/9/4 約 87.6 kcal 未含酒精，不能因此判錯。梅乃宿官網現款 8% 酒精與含糖成分可確認，但沒有完整五項數值，也不能代表「自釀」；約 44 kcal／100 ml 的酒精熱量只是以酒精密度與 7 kcal/g 作解釋性估算，不能據此核實 160。

義美烏醋保留全零但標為來源待確認。官網列有糖、醬油、鹽，五項全零缺乏標示支持；TFDA 通用烏醋 37 kcal／Na1571 mg 可作警示候選，**沒有採用為義美產品標示**。需實際包裝確認。

## 89 項逐項稽核明細

「參考來源」若 `sourcesAdopted=false`，僅供比較，並未驗證或替換現值；無相符來源不等於營養為零。全項的每份、每百及每單位原值／新值、品牌、可食部與異常旗標見 JSON，不在此省略未解項。

| #／食材 ID | 食材 | 狀態／備料基準／單位 | 目前營養（每百；無每百則每單位或每份） | 判斷與限制 | 參考來源 |
| --- | --- | --- | --- | --- | --- |
| 1 `whey_protein` | 乳清蛋白粉 | 來源待確認／dry／g | 385/77/5.5/7/160 | 未指定品牌、口味、濃縮或分離型；保留既有值，不能用另一款乳清標示覆蓋。 | 未取得相符來源；見逐項說明 |
| 2 `tuna` | 水煮鮪魚 | 來源待確認／as_sold／g | 131/28.6/1.8/0/321 | Kirkland 罐頭規格、地區版本及瀝乾重量未留存；既有數字未取得同版標示，保留。 | 未取得相符來源；見逐項說明 |
| 3 `shrimp` | 蝦仁 | 來源待確認／raw／g | 83/19.6/0.5/0/280 | 生蝦仁的物種、泡水及保水處理會影響蛋白與鈉；既有 Na280 未找到對應標示，保留。 | [TFDA:J21009](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 4 `sous_vide_chicken` | 雞胸肉 | 有來源的通用估算／raw／g | 119/23.3/2.1/0/50 | 生、去皮雞胸可食部平均值；不採舒肥／醃製雞胸標示 | [TFDA:I04024](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 5 `pork_shoulder` | 豬梅花肉片 | 來源待確認／raw／g | 207/18.9/14.2/0.4/56 | 生梅花肉的修脂比例不明；TFDA 豬肩胛肉／排差異大，不能挑一筆當原品項標示。 | [TFDA:I0300401](https://data.fda.gov.tw/data/opendata/export/20/json)<br>[TFDA:I0300502](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 6 `egg` | 蛋 | 來源待確認／count／顆 | 85/6.5/6.2/0.6/70 | 既有每顆值保留；蛋種、大小及單顆去殼重量未記錄，不能把每 100 g 當一顆。 | 未取得相符來源；見逐項說明 |
| 7 `tofu` | 板豆腐 | 來源待確認／as_sold／g | 88/9/5.3/1.9/7 | 板豆腐含水率與凝固劑差異大；TFDA 傳統豆腐不同年度 88／96 kcal，現有五項不是任一筆完整記錄；保留待品牌確認。 | [TFDA:R4700901](https://data.fda.gov.tw/data/opendata/export/20/json)<br>[TFDA:R4700902](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 8 `plain_yogurt` | 一般優格 | 有來源的通用估算／as_sold／g | 61/3.5/3.3/4.7/46 | 未加糖全脂原味優格；不代表所有一般優格 | [USDA:171284](https://fdc.nal.usda.gov/food-details/171284/nutrients) |
| 9 `bacon` | 培根 | 來源待確認／count／條 | 77/6.3/5.9/0.4/342 | 每條值保留；per100g 與 perServing 是 perUnit × 約 1.8 的舊轉換，未有單條 g 重證據；不可拿其顯示值視為實際每 100 g 標示。 | 未取得相符來源；見逐項說明 |
| 10 `chicken_thigh` | 雞腿肉 | 來源待確認／raw／g | 172/18.5/10.5/0/75 | 生雞腿是否含皮、修脂未定；TFDA 去皮去骨值不能代表含皮，保留待確認。 | [TFDA:I0404501](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 11 `beef_slice` | 牛肉片 | 來源待確認／raw／g | 250/26/15/0/60 | 已確認生重，但部位／修脂不明；現有 P26 有熟肉可能，不能僅據此判錯；TFDA 生牛肉片 120–430 kcal，保留待指定部位。 | [TFDA:I0110101](https://data.fda.gov.tw/data/opendata/export/20/json)<br>[TFDA:I0110103](https://data.fda.gov.tw/data/opendata/export/20/json)<br>[TFDA:I0110104](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 12 `boneless_short_rib` | 無骨牛小排 | 來源待確認／raw／g | 310/17.2/26.8/0/58 | Costco 無骨牛小排的油花等級與包裝標示未留存；不同牛肋部位不可互換，保留。 | [TFDA:I0100201](https://data.fda.gov.tw/data/opendata/export/20/json)<br>[TFDA:I0100202](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 13 `shrimp_paste` | 蝦仁漿 | 預設佔位待修／as_sold／g | 100/10/5/10/100 | 確認是 FK 預設佔位，仍未修。老四川同名品 219.1 kcal 且含豬背脂／花枝，與 FK 未知配方可能差很大，不擅採該品牌值。 | [BRAND:SHRIMP_PASTE](https://shop.oldsichuan.com.tw/noticeShow/46) |
| 14 `frozen_tofu` | 凍豆腐 | 有來源的通用估算／as_sold／g | 131/12.9/7.1/3.9/8 | 冷凍豆腐原狀可食部，非脫水乾凍豆腐 | [TFDA:R4701001](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 15 `edamame` | 毛豆 | 有來源的通用估算／as_sold／g | 129/14.6/3.3/12.5/1 | 生鮮、去殼毛豆仁；帶殼重、加鹽冷凍即食毛豆不適用；試修五項值重核相符 | [TFDA:H1100101](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 16 `salmon` | 鮭魚 | 有來源的通用估算／raw／g | 151.6/20.7/7.1/0/55.8 | 八筆非 Alaska Native 生鮭魚物種／養殖狀態記錄等權算術平均；每 100 g 可食部；並非市場占比加權或品牌標示，120–208 kcal 範圍；方法與樣本見稽核表 | [USDA:173686](https://fdc.nal.usda.gov/food-details/173686/nutrients)<br>[USDA:173688](https://fdc.nal.usda.gov/food-details/173688/nutrients)<br>[USDA:173689](https://fdc.nal.usda.gov/food-details/173689/nutrients)<br>[USDA:173691](https://fdc.nal.usda.gov/food-details/173691/nutrients)<br>[USDA:173715](https://fdc.nal.usda.gov/food-details/173715/nutrients)<br>[USDA:175136](https://fdc.nal.usda.gov/food-details/175136/nutrients)<br>[USDA:175138](https://fdc.nal.usda.gov/food-details/175138/nutrients)<br>[USDA:175167](https://fdc.nal.usda.gov/food-details/175167/nutrients) |
| 17 `full_fat_milk_250` | 全脂鮮奶 | 有來源的通用估算／as_sold／g | 63/3.1/3.6/4.8/37 | 全脂鮮乳平均值，以實際 g 秤量；ID 的 250 不代表 250 g 一份 | [TFDA:L01021](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 18 `crab_stick` | 蟹肉棒 | 有來源的通用估算／as_sold／g | 118/9.3/0.7/18.6/694 | 冷凍蟹味棒原狀，魚漿製品；不代表特定品牌 | [TFDA:R6700101](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 19 `century_egg` | 皮蛋 | 來源待確認／count／顆 | 170/12.5/12.8/1.2/550 | UI 計顆，但只有 per100g，isCount／perUnit 未設；1 顆目前誤按 1 g 計算，缺單顆可食重量，保留並阻擋發布。 | 未取得相符來源；見逐項說明 |
| 20 `mushroom_meatball` | 香菇貢丸 | 來源待確認／count／顆 | 260/13.5/21/4.5/580 | UI 計顆、只有 per100g；缺品牌與單顆 g 重，會少算，不能猜單顆份量。 | 未取得相符來源；見逐項說明 |
| 21 `egg_dumpling` | 蛋餃 | 來源待確認／count／顆 | 185/11.2/14.5/2.5/380 | UI 計顆、只有 per100g；缺品牌與單顆 g 重，會少算，不能猜單顆份量。 | 未取得相符來源；見逐項說明 |
| 22 `taro_meatball` | 芋頭貢丸 | 來源待確認／count／顆 | 50/1/0.2/10/5 | UI 計顆但 isCount=false，只有 per100g；50 kcal / P1 / F0.2 與名稱可疑，未有產品標示，不能改成任意芋圓／貢丸。 | 未取得相符來源；見逐項說明 |
| 23 `greek_yogurt` | 希臘優格 | 來源待確認／as_sold／g | 59/10/0.4/3.6/36 | 59 kcal 很接近 USDA 無脂希臘優格，但名稱沒註明無脂；原品牌／脂肪類型未確認，保留，避免誤套全脂。 | [USDA:170894](https://fdc.nal.usda.gov/food-details/170894/nutrients) |
| 24 `sugar_free_soymilk` | 無糖豆漿 | 來源待確認／as_sold／g | 35/3.6/1.8/0.7/12 | 無糖豆漿濃度不明；100 g／份換算一致，但尚無對應產品標示，保留。 | 未取得相符來源；見逐項說明 |
| 25 `whey_protein_cocoa` | 乳清蛋白（法式可可） | 來源待確認／dry／g | 393/70/7/11.6/466 | 多個品牌混列，30 g／份換算誤差在原值捨入範圍；沒有單一可驗證 SKU，不當作品牌標示。 | 未取得相符來源；見逐項說明 |
| 26 `pea_protein_sesame` | 豌豆蛋白（芝麻歐蕾） | 來源待確認／dry／g | 406/73.3/9.3/8/600 | 多個品牌混列，30 g／份換算誤差在原值捨入範圍；沒有單一可驗證 SKU，不當作品牌標示。 | 未取得相符來源；見逐項說明 |
| 27 `low_sugar_soymilk` | 低糖豆漿 | 來源待確認／as_sold／ml | 48/3.4/1.6/5/15 | 義美／光泉混列；per100g 欄實際按 100 ml 使用，密度與品牌標示未查明，不宣稱 100 g=100 ml。 | 未取得相符來源；見逐項說明 |
| 28 `mango` | 芒果 | 來源待確認／raw／g | 50/0.6/0.3/12.8/1 | 原新增 commit 明列現有值，但無原始來源；TFDA 西洋種平均熱量相同、C13.0／Na5 不同，不因同熱量就宣稱核實，保留。 | [TFDA:D21002](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 29 `cabbage` | 高麗菜 | 有來源的通用估算／raw／g | 25/1.3/0.1/5.8/18 | 生高麗菜可食部 | [USDA:169975](https://fdc.nal.usda.gov/food-details/169975/nutrients) |
| 30 `baby_cabbage` | 娃娃菜 | 來源待確認／raw／g | 18/1.5/0.2/3.4/10 | 娃娃菜品種未明；不可用小白菜 pak-choi 或任意大白菜樣本冒充標示，保留。 | 未取得相符來源；見逐項說明 |
| 31 `broccoli` | 綠花椰菜 | 有來源的通用估算／raw／g | 34/2.8/0.4/6.6/33 | 生綠花椰菜可食部；非加鹽熟食 | [USDA:170379](https://fdc.nal.usda.gov/food-details/170379/nutrients) |
| 32 `kimchi` | 韓式泡菜 | 來源待確認／as_sold／g | 32/1.6/0.5/6/800 | 韓式泡菜的糖、發酵與鹽度依品牌配方不同，既有 Na800 未取得對應來源，保留。 | 未取得相符來源；見逐項說明 |
| 33 `black_fungus` | 黑木耳 | 有來源的通用估算／as_sold／g | 38/0.9/0.1/8.8/12 | 生鮮濕木耳可食部；泡發乾木耳的含水率不固定，僅能作濕重近似，絕不套用乾木耳值 | [TFDA:G0100101](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 34 `baby_corn` | 玉米筍 | 有來源的通用估算／raw／g | 33/1.8/0.2/7/0 | 生玉米筍可食部 | [TFDA:E1300201](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 35 `banana` | 香蕉 | 來源待確認／count／根 | 88/1.2/0.2/22/1 | 每根值保留；缺單根去皮重量，不能以 USDA 的 medium 或任意 100 g 當固定一根。 | 未取得相符來源；見逐項說明 |
| 36 `spinach` | 菠菜 | 有來源的通用估算／raw／g | 23/2.9/0.4/3.6/79 | 生菠菜可食部 | [USDA:168462](https://fdc.nal.usda.gov/food-details/168462/nutrients) |
| 37 `chinese_cabbage` | 大白菜 | 有來源的通用估算／raw／g | 16/1.2/0.2/3.2/9 | 生大白菜 pe-tsai；不使用小白菜 pak-choi | [USDA:169979](https://fdc.nal.usda.gov/food-details/169979/nutrients) |
| 38 `zucchini` | 櫛瓜 | 有來源的通用估算／raw／g | 17/1.2/0.3/3.1/8 | 生櫛瓜含皮可食部 | [USDA:169291](https://fdc.nal.usda.gov/food-details/169291/nutrients) |
| 39 `cucumber` | 小黃瓜 | 有來源的通用估算／raw／g | 15/0.7/0.1/3.6/2 | 生小黃瓜含皮可食部 | [USDA:168409](https://fdc.nal.usda.gov/food-details/168409/nutrients) |
| 40 `greens` | 綜合生菜 | 來源待確認／raw／g | 15/1.4/0.2/2.9/28 | 綜合生菜比例未記；數值近似 USDA 綠葉萵苣，但不可把單一萵苣當已知混合比例。 | [USDA:169249](https://fdc.nal.usda.gov/food-details/169249/nutrients) |
| 41 `carrot` | 紅蘿蔔 | 有來源的通用估算／raw／g | 41/0.9/0.2/9.6/69 | 生胡蘿蔔可食部 | [USDA:170393](https://fdc.nal.usda.gov/food-details/170393/nutrients) |
| 42 `onion` | 洋蔥 | 有來源的通用估算／raw／g | 40/1.1/0.1/9.3/4 | 生洋蔥可食部 | [USDA:170000](https://fdc.nal.usda.gov/food-details/170000/nutrients) |
| 43 `mushroom` | 香菇 | 有來源的通用估算／raw／g | 39/3/0.1/7.6/1 | 生鮮香菇平均值；非乾菇或熟菇 | [TFDA:G08001](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 44 `beech_mushroom` | 鴻喜菇/雪白菇 | 來源待確認／raw／g | 32/2.6/0.3/6.2/3 | 鴻喜菇／雪白菇混列，TFDA 兩者五項不同；未指定比例，不為省事另造等權平均。 | [TFDA:G1900101](https://data.fda.gov.tw/data/opendata/export/20/json)<br>[TFDA:G1900201](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 45 `frozen_berry` | 冷凍莓果 | 來源待確認／as_sold／g | 50/1/0.5/11.5/1 | 莓果種類、混合比例及有無加糖不明；不採單一藍莓或草莓作已核實值。 | 未取得相符來源；見逐項說明 |
| 46 `nori_strips` | 海苔絲 | 有來源的通用估算／dry／g | 278/46.5/3.7/32.1/387 | 未調味壽司海苔片切絲的乾重近似；油炸、調味海苔不適用 | [TFDA:F9900201](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 47 `cherry_tomatoes` | 小番茄 | 有來源的通用估算／raw／g | 33/0.9/0.2/7.4/6 | 紅色系小番茄平均值，生、去蒂可食部；非單一品種標示 | [TFDA:E74004](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 48 `bean_sprouts` | 黃豆芽 | 有來源的通用估算／raw／g | 47/5.3/1.6/5/7 | 生黃豆芽可食部；不是綠豆芽 | [TFDA:E7700401](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 49 `scallion` | 青蔥 | 有來源的通用估算／raw／g | 32/1.8/0.2/7.3/16 | 生青蔥，包含青葉與蔥白 | [USDA:170005](https://fdc.nal.usda.gov/food-details/170005/nutrients) |
| 50 `enoki_mushroom` | 金針菇 | 有來源的通用估算／raw／g | 37/2.7/0.3/7.8/3 | 生金針菇可食部 | [USDA:169382](https://fdc.nal.usda.gov/food-details/169382/nutrients) |
| 51 `green_pepper_noodle` | 青花椒乾拌麵 | 來源待確認／count／包 | 390.9/13.1/7.7/67.3/1070.1 | 只補 perUnit=既有每包 perServing，修正一包算成全零；未取得同一 SKU 原標示，五項本身仍待確認。 | [BRAND:CHIASELECT](https://www.chiaselect.com/zh-TW) |
| 52 `bagel` | 原味貝果 | 來源待確認／count／個 | 250/9/1.5/48/380 | 每個值保留；品牌、尺寸、每個重量未知，不能硬換成每 100 g。 | 未取得相符來源；見逐項說明 |
| 53 `corn` | 金黃玉米粒(無加糖) | 來源待確認／as_sold／g | 77/2.4/1.7/14.3/160 | 好市多／綠巨人混列；罐頭液、瀝乾或含液基準未知，保留待包裝。 | 未取得相符來源；見逐項說明 |
| 54 `brown_rice` | 現煮米飯/糙米飯 | 來源待確認／cooked／g | 111/2.6/0.9/23/5 | 熟重已標，但白飯／糙米飯混列；米種、含水率、比例未知，111 kcal 不能代表所有飯，保留。 | 未取得相符來源；見逐項說明 |
| 55 `potato` | 馬鈴薯 | 有來源的通用估算／raw／g | 77/2.1/0.1/17.5/6 | 生馬鈴薯含皮可食部 | [USDA:170026](https://fdc.nal.usda.gov/food-details/170026/nutrients) |
| 56 `granola` | 綜合燕麥 | 來源待確認／dry／g | 420/10/15/64/45 | 綜合燕麥可能含糖油與堅果，不可套生燕麥資料；配方或品牌未知，保留。 | 未取得相符來源；見逐項說明 |
| 57 `prince_noodles` | 王子麵 | 預設佔位待修／dry／g | 100/10/5/10/100 | 確認是 FK 預設佔位，仍未修。原味 40 g 含調味包、50 g 滷味無調味包版本不同；原資料沒 SKU。需確認是否連調味包使用，不強套不相符版本。 | [BRAND:PRINCE](https://www.vewong.com/ec99/ushop20069/goodsdescr.asp?category_id=61&parent_id=57&prod_id=pro11) |
| 58 `sweet_potato` | 地瓜 | 有來源的通用估算／raw／g | 86/1.6/0.1/20.1/55 | 生地瓜可食部；美國通用品種，台灣甘藷的含水率及品種可能不同；維持既有試修的一位小數值 | [USDA:168482](https://fdc.nal.usda.gov/food-details/168482/nutrients) |
| 59 `steamed_noodle` | 蒸煮麵 | 有來源的通用估算／dry／g | 350/11.6/1.5/72.5/362 | 以一般乾小麥麵條作烹煮前乾重估算；不宣稱維力品牌標示，鈉值待實際包裝確認 | [TFDA:R2000101](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 60 `angel_hair_pasta` | 義大利（天使） | 可靠已核實／dry／g | 160/3/1/35/10 | 使用者本次明確確認的乾麵每 100 g 產品標示；依證言核實與保留，非獨立重閱實物標示。 | USER:PASTA |
| 61 `shin_ramen` | 辛拉麵 | 來源待確認／dry／g | 366/9.9/3.5/73.8/1939 | 366 kcal / F3.5 類似非油炸型，但名稱只有辛拉麵；未確認油炸／非油炸與地區配方，保留。 | 未取得相符來源；見逐項說明 |
| 62 `potato_ramen` | 馬鈴薯泡麵 | 來源待確認／count／包 | 445/9/15/68/1750 | UI 計包、只有 per100g；未留單包 g 重與品牌，1 包目前按 1 g 計算，阻擋發布。 | 未取得相符來源；見逐項說明 |
| 63 `bibimbap_secret` | 韓式辣醬 | 無法查證／as_sold／g | 300/6.7/10/46.7/2333 | 可能為韓式辣醬或自製拌飯醬；配方不明，不能用純 gochujang 或任意配方替換。 | 未取得相符來源；見逐項說明 |
| 64 `balsamic` | 巴薩米克醋 | 來源待確認／as_sold／g | 93/0.7/0/18/27 | 巴薩米克醋依濃縮程度／加糖不同；未對應品牌，保留。 | 未取得相符來源；見逐項說明 |
| 65 `sesame_powder` | 黑芝麻粉 | 有來源的通用估算／dry／g | 601/15.7/55.2/20.8/3 | 黑芝麻粉乾重，非調糖芝麻飲品 | [TFDA:C1620101](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 66 `matcha_powder` | 抹茶粉 | 來源待確認／dry／g | 320/30/5/40/10 | 未註明純抹茶／調糖粉與品牌；未能核對現有完整五項，不單靠三大營養素回算。 | 未取得相符來源；見逐項說明 |
| 67 `cocoa_powder` | 可可粉 | 有來源的通用估算／dry／g | 228/19.6/13.7/57.9/21 | 無糖未鹼化乾可可粉；含纖維 37 g；採來源 228 kcal 與特定 Atwater 係數，不用 4/9/4 回算 | [USDA:169593](https://fdc.nal.usda.gov/food-details/169593/nutrients) |
| 68 `chia_seeds` | 奇亞籽 | 有來源的通用估算／dry／g | 486/16.5/30.7/42.1/16 | 乾奇亞籽，可食部 | [USDA:170554](https://fdc.nal.usda.gov/food-details/170554/nutrients) |
| 69 `smoked_sea_salt` | 煙燻海鹽 | 有來源的通用估算／dry／g | 0/0/0/0/38800 | 純煙燻鹽暫以食鹽估算；非複方調味鹽，含水率／礦物質差異未涵蓋；100 g 鈉 38800 mg，不是 1 g | [USDA:173468](https://fdc.nal.usda.gov/food-details/173468/nutrients) |
| 70 `soy_sauce` | 醬油 | 有來源的通用估算／as_sold／g | 53/8.1/0.6/4.9/5490 | 一般黃豆小麥醬油 shoyu 原狀；非低鈉或醬油膏；TFDA 一般醬油粗脂肪缺值，故選五項齊全 USDA，不把缺值填零 | [USDA:174277](https://fdc.nal.usda.gov/food-details/174277/nutrients) |
| 71 `shacha_sauce` | 沙茶醬 | 有來源的通用估算／as_sold／g | 729/10.2/71.8/10.4/421 | 葷沙茶醬，先將油脂及固形物拌勻再秤重；不適用素沙茶或瀝油固形物 | [TFDA:P1001701](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 72 `maple_syrup` | 楓糖漿 | 有來源的通用估算／as_sold／g | 260/0/0.1/67/12 | 純楓糖漿原狀；非楓糖風味糖漿 | [USDA:169661](https://fdc.nal.usda.gov/food-details/169661/nutrients) |
| 73 `italian_herbs` | 義大利綜合香料 | 無法查證／dry／g | 260/10/5/45/50 | 香料種類與混合比例未知，無可重現同品配方；目前無法查證完整五項。 | 未取得相符來源；見逐項說明 |
| 74 `lemon_juice` | 新鮮檸檬汁 | 有來源的通用估算／as_sold／g | 22/0.4/0.2/6.9/1 | 生鮮檸檬汁，非加糖飲品 | [USDA:167747](https://fdc.nal.usda.gov/food-details/167747/nutrients) |
| 75 `yuzu_vinegar` | 和風柚子醋/果醋 | 無法查證／as_sold／g | 35/0.5/0/8/120 | 和風柚子醋醬與果醋混為同項，鈉糖可能差很大，無法選擇對應通用樣本；需明確產品。 | 未取得相符來源；見逐項說明 |
| 76 `horseradish_mayo` | 辣根蛋黃醬 | 無法查證／as_sold／g | 150/10/5/15/50 | 150 kcal / P10 / F5 對蛋黃醬名稱可疑；未知配方或原標示，無法查證，不用 4/9/4 直接定錯。 | 未取得相符來源；見逐項說明 |
| 77 `olive_oil` | 橄欖油 | 有來源的通用估算／as_sold／g | 884/0/100/0/2 | 純橄欖油原狀 | [USDA:171413](https://fdc.nal.usda.gov/food-details/171413/nutrients) |
| 78 `truffle_olive_oil` | 松露橄欖油 | 來源待確認／as_sold／g | 884/0/100/0/0 | 若純油可近似橄欖油，但含松露顆粒／調味物的商品不同；未取得配方，保留。 | [USDA:171413](https://fdc.nal.usda.gov/food-details/171413/nutrients) |
| 79 `sriracha_mayo` | J-Lek是拉差美乃滋 | 來源待確認／as_sold／g | 450/1/45/12/1200 | J-Lek 地區版本及每 100 ml／g 標示可能不同，未取得與 FK 同款官網完整營養表；保留，不能把 ml 值寫成 g。 | 未取得相符來源；見逐項說明 |
| 80 `sugar_free_peanut_butter` | 無糖花生醬 | 來源待確認／as_sold／g | 594/21.9/50/18.8/312 | 無糖不等於無鹽；Na312 可能為加鹽版本，未取得同品牌標示，保留。 | 未取得相符來源；見逐項說明 |
| 81 `avocado_mash` | 酪梨泥 | 有來源的通用估算／as_sold／g | 160/2/14.7/8.5/7 | 未調味酪梨果肉泥，排除皮籽；若為加鹽商品不適用 | [USDA:171705](https://fdc.nal.usda.gov/food-details/171705/nutrients) |
| 82 `avocado_oil` | 酪梨油 | 有來源的通用估算／as_sold／g | 884/0/100/0/0 | 純酪梨油原狀 | [USDA:173573](https://fdc.nal.usda.gov/food-details/173573/nutrients) |
| 83 `unsalted_butter` | 無鹽奶油 | 有來源的通用估算／as_sold／g | 717/0.9/81.1/0.1/11 | 無鹽奶油原狀 | [USDA:173430](https://fdc.nal.usda.gov/food-details/173430/nutrients) |
| 84 `brown_sugar_syrup` | 黑糖漿 | 來源待確認／as_sold／g | 260/0.2/0.1/65/15 | 濃度未記錄；不能用純黑糖或任意糖水取代，現有值保留待原標示／配方。 | 未取得相符來源；見逐項說明 |
| 85 `coffee_capsule` | 咖啡膠囊 | 來源待確認／count／顆 | 124/1.9/0/28.7/110 | 原 commit 載有真實每顆 16 ml 標示：20 kcal / P0.3 / F0 / C4.6 / Na18；只新增 perUnit，保護原每份與每百值，不重新捨入標示。包裝影像及品牌仍待追溯。 | [REPO:COFFEE](https://github.com/leebebe1002/kitchen-app/commit/612ae574e26ddeede1fb44b871101fbbd86aaa8f) |
| 86 `ing_1787563079531` | 義美烏醋 | 來源待確認／as_sold／g | 0/0/0/0/0 | 義美官網成分含糖、醬油及食鹽，既有五項全零尚無標示支持；TFDA 烏醋 Na1571 不能冒充義美標示，差異大，保留待實際包裝。 | [BRAND:VINEGAR](https://imec.imeifoods.com.tw/products/blackvinegar200ml)<br>[TFDA:P0600701](https://data.fda.gov.tw/data/opendata/export/20/json) |
| 87 `black_coffee` | 黑咖啡 | 來源待確認／as_sold／ml | 2/0.2/0/0.3/3 | Nespresso／現煮美式混列；按 100 ml 使用，USDA brewed coffee 是每 100 g，沖煮濃度和密度未知，保留。 | [USDA:171890](https://fdc.nal.usda.gov/food-details/171890/nutrients) |
| 88 `yuzu_liqueur` | 柚子酒 | 來源待確認／as_sold／ml | 160/0.3/0/21.6/6 | 160 kcal 不可因 4/9/4 約 87.6 就判錯；酒精另供熱量。梅乃宿現款 8% 約另供 44 kcal／100 ml，但無法解釋自釀或其他濃度；保留，未宣稱 160 已核實。 | [BRAND:YUZU](https://www.umenoyado.com/en/products/aragoshi-yuzu/) |
| 89 `yuzu_jam` | 柚子果醬 | 來源待確認／as_sold／g | 260/0/0/65/25 | 柚子茶醬的糖濃度和品牌不明；20 g／份換算一致，完整標示未核實，保留。 | 未取得相符來源；見逐項說明 |


## 料理與三位成員的影響

下表使用 **現有固定備料份量**，由實際 `KitchenEngine.calculateNutritionForMember()` 執行前／後資料；無成員專屬份量時使用 defaultIngredients，不模擬 AI 重新配平。這是新鮮載入母庫的預期計算差異，並不保證已有舊快取手機同樣更新；尚未驗證食材仍會影響絕對準確度。

| 料理 | 成員 | 份量來源 | kcal 前 → 後 | ΔP g | ΔF g | ΔC g | ΔNa mg |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 燕麥希臘優格碗 | bebe | memberPortions | 214.5 → 215.5 | -0.2 | 0.1 | 0 | -0.1 |
| 燕麥希臘優格碗 | ariel | memberPortions | 279.4 → 280.4 | -0.3 | 0.2 | -0.1 | -0.1 |
| 燕麥希臘優格碗 | jason | memberPortions | 380.5 → 382.1 | -0.4 | 0.3 | -0.1 | 0 |
| 陽光美式早午餐 | bebe | memberPortions | 480 → 456 | -3.4 | -1.5 | -1.1 | -128.6 |
| 陽光美式早午餐 | ariel | memberPortions | 504.9 → 474.6 | -4.3 | -1.9 | -1.3 | -151 |
| 陽光美式早午餐 | jason | memberPortions | 654.2 → 618.8 | -5.1 | -2.1 | -1.5 | -212.4 |
| 夏威夷波奇碗 | bebe | memberPortions | 331.5 → 331.5 | 0 | 0 | 0 | 0 |
| 夏威夷波奇碗 | ariel | memberPortions | 356.8 → 356.8 | 0 | 0 | 0 | 0 |
| 夏威夷波奇碗 | jason | memberPortions | 551.3 → 551.3 | 0 | 0 | 0 | 0 |
| 彩虹生菜沙拉 | bebe | defaultIngredients | 360.9 → 331.4 | -4.3 | -1.8 | -1.3 | -176.8 |
| 彩虹生菜沙拉 | ariel | defaultIngredients | 360.9 → 331.4 | -4.3 | -1.8 | -1.3 | -176.8 |
| 彩虹生菜沙拉 | jason | defaultIngredients | 360.9 → 331.4 | -4.3 | -1.8 | -1.3 | -176.8 |
| 韓式拌飯 | bebe | memberPortions | 456.8 → 457.3 | -0.1 | -0.1 | 0.4 | -2.5 |
| 韓式拌飯 | ariel | memberPortions | 508.9 → 482.4 | -2.3 | -1.7 | -2.5 | -46.5 |
| 韓式拌飯 | jason | memberPortions | 693.2 → 661.9 | -2.9 | -2.1 | -2.6 | -58.3 |
| 營養滿滿泡麵 | bebe | defaultIngredients | 288 → 290.8 | -0.1 | -0.1 | 0.8 | 1.1 |
| 營養滿滿泡麵 | ariel | defaultIngredients | 288 → 290.8 | -0.1 | -0.1 | 0.8 | 1.1 |
| 營養滿滿泡麵 | jason | defaultIngredients | 288 → 290.8 | -0.1 | -0.1 | 0.8 | 1.1 |
| 暖心火鍋 | bebe | defaultIngredients | 543.5 → 551.2 | -0.1 | -0.1 | 1.5 | 3.4 |
| 暖心火鍋 | ariel | defaultIngredients | 543.5 → 551.2 | -0.1 | -0.1 | 1.5 | 3.4 |
| 暖心火鍋 | jason | defaultIngredients | 543.5 → 551.2 | -0.1 | -0.1 | 1.5 | 3.4 |
| 幸福家常飯 | bebe | memberPortions | 407.4 → 464.2 | 10.7 | 2.1 | -9 | -43.4 |
| 幸福家常飯 | ariel | memberPortions | 422.1 → 477.6 | 10.7 | 2.1 | -9.3 | -43.6 |
| 幸福家常飯 | jason | memberPortions | 748.8 → 832.7 | 16 | 3.1 | -13.9 | -65.3 |
| 義大利麵 | bebe | memberPortions | 1010.8 → 1011.2 | 0 | -0.1 | 0.4 | -2 |
| 義大利麵 | ariel | memberPortions | 1254.3 → 1254.6 | 0 | -0.1 | 0.2 | -1.5 |
| 義大利麵 | jason | memberPortions | 1943.4 → 1943.8 | -0.1 | -0.1 | 0.3 | -2 |
| 慢活特調飲品吧 | bebe | memberPortions | 249.3 → 193.8 | -10.3 | -2.1 | -7.7 | -94.5 |
| 慢活特調飲品吧 | ariel | memberPortions | 330 → 257.6 | -13.9 | -2.5 | -10.6 | -126.1 |
| 慢活特調飲品吧 | jason | memberPortions | 227.1 → 227.1 | 0 | 0 | 0 | 0 |


歷史飲食紀錄已儲存的 nutrients 不會因母庫更新而自動重算；家庭目標與健康檔案未修改。Recipe／UI 預設份量與 AI 配平可能產生不同結果，不把固定份量差異冒充實際一天攝取差異。

### 未解的單位問題（發布阻擋）

皮蛋、香菇貢丸、蛋餃、芋頭貢丸、馬鈴薯泡麵等 **5 項** UI 計顆／包，但只有每百值，實際引擎會把一顆／包按 1 g 算。缺少品牌或每單位可食重量，未猜測修正。培根雖有 perUnit，但料理以 g 指定，會把 20 g 當 20 條。以下 **9 處**是儲存配方的實際不一致（同一食材跨成員逐列計）：

| 料理 | 成員／預設 | 食材 | 配方量／單位 | 食材單位 |
| --- | --- | --- | --- | --- |
| ramen_meal | default | steamed_noodle | 1 包 | g |
| hotpot | default | steamed_noodle | 1 包 | g |
| pasta_meal | default | bacon | 25 g | 條 |
| pasta_meal | bebe | bacon | 20 g | 條 |
| pasta_meal | ariel | bacon | 25 g | 條 |
| pasta_meal | jason | bacon | 40 g | 條 |
| special_drink | default | full_fat_milk_250 | 200 ml | g |
| special_drink | bebe | full_fat_milk_250 | 150 ml | g |
| special_drink | ariel | full_fat_milk_250 | 200 ml | g |


蒸煮麵缺單包 g 重；培根缺每條 g 重；鮮奶配方以 ml 但來源以 g，缺密度或對應每 ml 標示。單位與配方轉換影響既有個人份量記憶，故本次保留並揭露，不硬改計數或將所有數字一律當 g。

## 快取、同步與資料邊界

`fetchJson()` 下載官方母庫後呼叫 `mergeUserState()`，同 ID 合併為 `{...server, ...local}`。因此舊鮭魚 100 kcal 會蓋回新 151.6；使用者修改同樣優先。來源不明的快取沒有逐欄修改紀錄，無法安全區分「舊母庫」與「使用者親改」。本次不改 merge policy、不新增 migration、不清除快取。來源稽核主表獨立保存，沒有新增會在合併後誤宣稱本機數值已查證的 `nutritionSource` 欄位。

新補 perUnit 在舊快取沒有同欄位時可由母庫補入；若舊快取自行改過 perServing 而沒有 perUnit，兩者仍可能不一致。食材編輯視窗目前重建資料時不保留 perUnit／isCount，編輯計數食材可能再次失去換算；屬既有問題，本次未擴大重構。

官方母庫仍只在 `src/data/`。本機 `kitchen_v2_custom_ingredients` 依既有啟動順序合併，並非官方或 Personal Kitchen State；沒有升格或跨裝置搬移。`PersonalKitchenState`／同步只處理目前 scope 的庫存、採買、food cart、家用品，不含營養母庫；household 與 ariel 未合併。GitHub CloudSync 的 enabled=false，未啟用。

載入 JSON 使用 `?t=Date.now()`；本次未改 ES module 或 CSS，無受影響的模組鏈，無需不相干 `?v=` 更新。即使繞過 HTTP 快取成功下載新 JSON，本機欄位優先問題仍存在。`DATA_SCHEMA.md` 的「所有資料 100% JSON」與 production 同步實作不符，已回報且未改規格。

## 驗證與驗收

下列檢查均通過（Chef 共 33 項）。所有同步測試皆為記憶體假資料、假登入狀態、假遠端回應，未連正式 Supabase，也未讀寫任何真實瀏覽器儲存：

```bash
PYTHONPYCACHEPREFIX=/private/tmp/fk-nutrition-audit/pycache python3 -m py_compile server.py update_ingredients.py
find web/src -type f -name '*.js' -exec sh -c 'for f do node --check "$f" || exit 1; done' sh {} +
python3 -c "import glob, json; [json.load(open(f, encoding='utf-8')) for f in glob.glob('src/data/*.json') + glob.glob('web/*.json')]"
node tests/test_weight_basis.mjs
node tests/test_nutrition_audit.mjs
node tests/test_chef_advisor.mjs
node tests/test_leaked_key_cleanup.js
git diff --check
```

原 Python 指令第一次因環境把 bytecode 導到受限的系統快取路徑而失敗；以上改用任務暫存目錄後兩個腳本均通過語法檢查。新增測試核對每筆分類與來源數值／捨入、鮭魚平均、可可特定熱量係數、產品標示保護、每顆／包計算、10 道料理與三成員、舊快取相容、自訂食材、重複 reference、兩個 scope 隔離、無登入、遠端空白／已有資料；已知錯誤以可重現測試揭露，不是將錯誤行為宣告為正確。

另修正既有 Chef 測試的歷史比較基準：原本引用 HEAD，在功能 commit 後實際比較同版卻預期舊版 12 次請求；改為固定 `ce14579^` 後，實測舊版 12 次／新版 2 次，33 項通過。未修改 App 邏輯。

營養來源另以獨立讀取的官方下載壓縮檔重擷取 63 筆記錄，逐欄比對快照均相符，不以程式測試冒充來源查證。同一執行者已做 DIFF 及敏感資料核對；**尚無另一位獨立驗收者簽核**。

## Git 與發布條件

保留本機變更待驗收；未 stage、未 commit、未 push、未 merge、未 deploy、未操作 Production。資料 ID、scope、localStorage key、Supabase schema／RLS／正式資料、使用者原始義大利麵標示與歷史紀錄均未改。既有未提交變更與本次修正共享檔案，且營養／單位／快取仍有未解疑慮、沒有獨立驗收簽核，故不滿足中央規範的自動 Commit 條件。

發布條件：尚未達成。需先解決快取保留使用者修改的更新政策，取得缺少的單位重量與品牌版本，處理 2 個佔位及 4 個無法查證項目，並完成必要的獨立驗收。可先逐項驗收本次有來源修正；不要求使用者一次補齊所有 44 筆包裝才承認本次已有成果。

GitHub 已在核實儲存庫 owner 與登入帳號一致且具管理權限後，成功建立精簡技術紀錄 Issue #21，並回覆既有 #16。首次含大量本機細節的 Issue 寫入遭自動審核拒絕，該版本未送出；後續成功版本未上傳完整本機報告或個人資料。
