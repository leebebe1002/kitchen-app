---
title: "Cell Kitchen 4.0 Data Schema Specification"
type: data_schema
owner: PM Bebe
author: 十一粒 (AI Assistant)
created: 2026-08-11
---

# 📊 Cell Kitchen 4.0 資料模型規格書 (Data Schema)

> **最高架構原則**：採用「單一真實來源 (SSOT)」，資料 100% 存放於專案 `src/data/` 純文字 JSON 檔案中。十一粒大腦與 4.0 App 介面 100% 讀取同一份資料與運算邏輯，達到 100% 零誤差對齊。

---

## 1. 食材資料模型 (`src/data/ingredients.json`)

每個食材包含標準化百克數據、單份數據、計數單位與**可選品牌欄位 (`brand`)**：

```json
{
  "tuna": {
    "id": "tuna",
    "name": "水煮鮪魚",
    "brand": "Kirkland 科克蘭",
    "category": "proteins",
    "unitLabel": "g",
    "per100g": {
      "kcal": 131,
      "protein": 28.6,
      "fat": 1.8,
      "carbs": 0,
      "sodium": 321
    }
  },
  "shin_ramen_light": {
    "id": "shin_ramen_light",
    "name": "辛拉麵(非油炸)",
    "brand": "農心",
    "category": "carbs",
    "isCount": true,
    "unitLabel": "包",
    "perServing": {
      "kcal": 355,
      "protein": 9.6,
      "fat": 3.4,
      "carbs": 71.6,
      "sodium": 1881
    }
  }
}
```

---

## 2. 料理配方資料模型 (`src/data/dishes.json`)

料理配方定義推薦組合、多重時段標籤、**動態倍率醬料配方 (`sauceFormula`)** 與 **烹調步驟 (`sopSteps`)**：

```json
{
  "bibimbap": {
    "id": "bibimbap",
    "name": "🍛 韓式拌飯",
    "categories": ["lunch", "dinner"],
    "recommendedProteins": ["beef_slice", "pork_shoulder", "egg"],
    "recommendedVeggies": ["spinach", "bean_sprouts", "zucchini", "mushroom", "kimchi", "carrot", "nori_strips", "black_fungus", "baby_corn"],
    "recommendedCarbs": ["brown_rice"],
    "recommendedSauces": ["bibimbap_secret"],
    "sauceFormula": [
      { "name": "韓式辣椒醬", "baseAmount": 1.0, "unit": "大匙" },
      { "name": "白醋/蘋果醋", "baseAmount": 0.5, "unit": "大匙" },
      { "name": "韓式香油",   "baseAmount": 0.5, "unit": "大匙" },
      { "name": "蒜末",       "baseAmount": 0.5, "unit": "茶匙" },
      { "name": "溫水",       "baseAmount": 0.5, "unit": "大匙" }
    ],
    "sauceInstruction": "將上述醬料食材在大碗中充份混合均勻備用。",
    "sopSteps": [
      "1. 燙青菜與豆芽：滾水加少許鹽，將黃豆芽與菠菜分別燙熟，撈出擠乾水分，用少許鹽與香油抓勻。",
      "2. 炒配菜與肉類：熱鍋下油，將紅蘿蔔絲、香菇絲炒軟起鍋；接著將醃好的豬肉片下鍋炒熟至香氣溢出。",
      "3. 煎蛋：煎太陽蛋（依勾選人數煎對應顆數）。",
      "4. 組合享用：碗內盛入熱白飯，鋪上各色蔬菜與肉片，中間放上太陽蛋，淋上特製拌飯醬，全部拌勻即完成！"
    ]
  }
}
```

---

## 3. 每日飲食紀錄資料模型 (`src/data/daily_logs.json`)

每日紀錄依 `date` (日期) 與成員 (bebe, ariel, jason) 區分，完整記錄五大總計 (`totals`) 與餐點時間軸清單 (`meals`)：

```json
{
  "logs": [
    {
      "date": "2026-08-12",
      "diners": {
        "bebe": {
          "totals": { "kcal": 1145, "protein": 70.8, "carbs": 135.0, "fat": 42.0, "sodium": 1850 },
          "meals": [
            {
              "id": "meal_0812_1",
              "time": "08:30",
              "mealType": "breakfast",
              "dishName": "🥣 燕麥希臘優格碗",
              "source": "calculator",
              "nutrients": { "kcal": 250, "protein": 15.0, "carbs": 35.0, "fat": 5.0, "sodium": 80 },
              "ingredientsSummary": ["希臘優格 90g", "一般優格 60g", "Granola 30g"]
            },
            {
              "id": "meal_0812_3",
              "time": "18:30",
              "mealType": "dinner",
              "dishName": "便當店排骨便當",
              "source": "photo_ai",
              "photoUrl": "assets/user_photos/20260812_dinner.jpg",
              "nutrients": { "kcal": 445, "protein": 25.8, "carbs": 52.0, "fat": 21.0, "sodium": 980 },
              "aiNote": "估算自信度 88%，包含大油炒高麗菜與排骨裹粉"
            }
          ]
        }
      }
    }
  ]
}
```

---

## 4. 生活雜項靜態資料模型 (`src/data/household_supplies.json`)

對齊 `ingredients.json` 靜態大總庫架構，生活非食品雜項之照片 (`photoUrl`)、品牌 (`brand`)、參考價格 (`price`) 與常用通路 (`store`) 100% 獨立儲存於 `household_supplies.json` 中：

```json
{
  "supplies": [
    {
      "id": "supp_paper_towel",
      "name": "廚房紙巾",
      "brand": "Kirkland 科克蘭",
      "price": 369,
      "priceUnit": "12捲/包",
      "store": "Costco 好市多",
      "photoUrl": "assets/supplies/paper_towel.jpg"
    }
  ]
}
```

---

## 5. 智慧冰箱動態庫存與採買清單資料模型 (`src/data/pantry_inventory.json`)

`pantry_inventory.json` **100% 保持純動態狀態**，僅存放食材庫存開關 (`foodStockStatus`)、雜項庫存開關 (`supplyStockStatus`) 與賣場待採買清單 (`shoppingList`)：

```json
{
  "foodStockStatus": {
    "egg": true,
    "beef_slice": false
  },
  "supplyStockStatus": {
    "supp_paper_towel": true,
    "supp_trash_bag": false
  },
  "shoppingList": [
    {
      "id": "shop_01",
      "type": "food",
      "targetId": "beef_slice",
      "name": "牛肉片",
      "sourceDish": "韓式拌飯",
      "isPurchased": false
    },
    {
      "id": "shop_03",
      "type": "supply",
      "targetId": "supp_trash_bag",
      "name": "垃圾袋 (大)",
      "sourceDish": "常購雜項",
      "isPurchased": false
    }
  ]
}
```

---

## 6. 全家健康目標資料模型 (`src/data/family_profiles.json`)

對齊 Obsidian `memory/family_profiles/` 權威紀錄：

```json
{
  "Bebe": {
    "name": "Bebe",
    "icon": "😊",
    "colorToken": "--bebe-color",
    "inbody": { "weight": 56.64, "smm": 20.6, "bfp": 33.0, "bmr": 1189 },
    "dailyTarget": { "kcal": 1200, "protein": 75, "carbs": 120 }
  },
  "Ariel": {
    "name": "樂樂",
    "icon": "❤️",
    "colorToken": "--ariel-color",
    "inbody": { "bmr": 1250 },
    "dailyTarget": { "kcal": 1500, "protein": 80, "carbs": 150 }
  },
  "Jason": {
    "name": "Jason",
    "icon": "🪨",
    "colorToken": "--jason-color",
    "inbody": { "weight": 83.39, "smm": 36.3, "bfp": 23.7, "bmr": 1743 },
    "dailyTarget": { "kcal": 2000, "protein": 100, "carbs": 200 }
  }
}
```
