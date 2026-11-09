// Reuses the dated 89-item audit; pending means unverified, not incorrect.
export const officialNutritionEvidence = {
  "whey_protein": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "未指定品牌、口味、濃縮或分離型；保留既有值，不能用另一款乳清標示覆蓋。",
      "sources": [],
      "identity": {
        "name": "乳清蛋白粉",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 385,
          "protein": 77,
          "carbs": 7,
          "fat": 5.5,
          "sodium": 160
        },
        "weightBasis": "dry"
      }
    },
    "name": "乳清蛋白粉",
    "brand": ""
  },
  "tuna": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "Kirkland 罐頭規格、地區版本及瀝乾重量未留存；既有數字未取得同版標示，保留。",
      "sources": [],
      "identity": {
        "name": "水煮鮪魚",
        "brand": "Kirkland 科克蘭"
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 131,
          "protein": 28.6,
          "carbs": 0,
          "fat": 1.8,
          "sodium": 321
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "水煮鮪魚",
    "brand": "Kirkland 科克蘭"
  },
  "shrimp": {
    "name": "蝦仁",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "raw",
      "note": "生去殼蝦仁；保水或加鹽產品不適用。",
      "sources": [
        {
          "title": "白對蝦平均值",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "catalogUrl": "https://data.gov.tw/dataset/8543",
          "dataset": "TFDA_20",
          "recordId": "J21009",
          "checkedAt": "2026-11-05",
          "basis": "每 100 g 可食部；樣品狀態:生; 前處理描述:去殼,去頭尾及腸泥,混合均勻打碎",
          "nutrients": {
            "kcal": 99.0,
            "protein": 21.3,
            "fat": 0.9,
            "carbs": 0.0,
            "sodium": 210.0
          },
          "fiber": 0.0,
          "correctedEnergy": 99.0,
          "ref": "TFDA:J21009"
        }
      ],
      "identity": {
        "name": "蝦仁",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 99,
          "protein": 21.3,
          "carbs": 0,
          "fat": 0.9,
          "sodium": 210
        },
        "weightBasis": "raw"
      }
    }
  },
  "sous_vide_chicken": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生、去皮雞胸可食部平均值；不採舒肥／醃製雞胸標示",
      "sources": [
        {
          "ref": "TFDA:I04024",
          "title": "去皮清肉平均值",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "I04024",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；樣品狀態:生,雞胸部位; 前處理描述:混合均勻打碎"
        }
      ],
      "identity": {
        "name": "雞胸肉",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 119,
          "protein": 23.3,
          "carbs": 0,
          "fat": 2.1,
          "sodium": 50
        },
        "weightBasis": "raw"
      }
    },
    "name": "雞胸肉",
    "brand": ""
  },
  "pork_shoulder": {
    "name": "豬梅花肉片",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "raw",
      "note": "以生去骨肩胛肉近似梅花肉；修脂比例不同會影響脂肪。",
      "sources": [
        {
          "title": "豬肩胛排(2021年取樣)",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "catalogUrl": "https://data.gov.tw/dataset/8543",
          "dataset": "TFDA_20",
          "recordId": "I0300502",
          "checkedAt": "2026-11-05",
          "basis": "每 100 g 可食部；樣品狀態:生,豬肩胛部位; 前處理描述:去骨,混合均勻打碎",
          "nutrients": {
            "kcal": 244.0,
            "protein": 17.8,
            "fat": 18.7,
            "carbs": 0.0,
            "sodium": 64.0
          },
          "fiber": 0.0,
          "correctedEnergy": 244.0,
          "ref": "TFDA:I0300502"
        }
      ],
      "identity": {
        "name": "豬梅花肉片",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 244,
          "protein": 17.8,
          "carbs": 0,
          "fat": 18.7,
          "sodium": 64
        },
        "weightBasis": "raw"
      }
    }
  },
  "egg": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-09",
      "weightBasis": "raw",
      "note": "一般雞蛋平均值；每顆預設為去殼可食部 50 g，並非實測蛋重。保留顆數，標示估算。",
      "sources": [
        {
          "ref": "TFDA:K01001",
          "title": "雞蛋平均值",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "catalogUrl": "https://data.gov.tw/dataset/8543",
          "dataset": "TFDA_20",
          "recordId": "K01001",
          "checkedAt": "2026-11-09",
          "basis": "生、去殼可食部每 100 g；每顆可食部 50 g 為 FK 通用估算基準",
          "nutrients": {
            "kcal": 135,
            "protein": 12.7,
            "carbs": 1.6,
            "fat": 8.9,
            "sodium": 138
          }
        }
      ],
      "identity": {
        "name": "蛋",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "顆",
        "isCount": true,
        "per100g": {
          "kcal": 135,
          "protein": 12.7,
          "carbs": 1.6,
          "fat": 8.9,
          "sodium": 138
        },
        "perUnit": {
          "kcal": 67.5,
          "protein": 6.35,
          "carbs": 0.8,
          "fat": 4.45,
          "sodium": 69
        },
        "gramsPerUnit": 50,
        "weightBasis": "raw"
      }
    },
    "name": "蛋",
    "brand": ""
  },
  "tofu": {
    "name": "板豆腐",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "as_sold",
      "note": "用傳統板豆腐代表值；含水率依商品而異。",
      "sources": [
        {
          "title": "傳統豆腐(2022年取樣)",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "catalogUrl": "https://data.gov.tw/dataset/8543",
          "dataset": "TFDA_20",
          "recordId": "R4700902",
          "checkedAt": "2026-11-05",
          "basis": "每 100 g 可食部；前處理描述:混合均勻打碎",
          "nutrients": {
            "kcal": 96.0,
            "protein": 9.6,
            "fat": 5.5,
            "carbs": 1.9,
            "sodium": 7.0
          },
          "fiber": 1.6,
          "correctedEnergy": 93.0,
          "ref": "TFDA:R4700902"
        }
      ],
      "identity": {
        "name": "板豆腐",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 96,
          "protein": 9.6,
          "carbs": 1.9,
          "fat": 5.5,
          "sodium": 7
        },
        "weightBasis": "as_sold"
      }
    }
  },
  "plain_yogurt": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "未加糖全脂原味優格；不代表所有一般優格",
      "sources": [
        {
          "ref": "USDA:171284",
          "title": "Yogurt, plain, whole milk",
          "url": "https://fdc.nal.usda.gov/food-details/171284/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 171284,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "一般優格",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 61,
          "protein": 3.5,
          "carbs": 4.7,
          "fat": 3.3,
          "sodium": 46
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "一般優格",
    "brand": ""
  },
  "bacon": {
    "name": "培根",
    "brand": "",
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-11-05",
      "weightBasis": "as_sold",
      "note": "舊條／個營養不能轉換每100g；缺可靠來源，保留待確認。",
      "sources": [],
      "identity": {
        "name": "培根",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": null,
          "protein": null,
          "carbs": null,
          "fat": null,
          "sodium": null
        },
        "servingSize": 100,
        "servingUnit": "g",
        "weightBasis": "as_sold"
      }
    }
  },
  "chicken_thigh": {
    "name": "雞腿肉",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "raw",
      "note": "生、去骨含皮雞腿可食部；含皮比例因修切而異。",
      "sources": [
        {
          "ref": "USDA:172385",
          "title": "Chicken thigh, meat and skin, raw",
          "url": "https://fdc.nal.usda.gov/food-details/172385/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 172385,
          "checkedAt": "2026-11-05",
          "basis": "每100 g 可食部"
        }
      ],
      "identity": {
        "name": "雞腿肉",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 221,
          "protein": 16.52,
          "carbs": 0.25,
          "fat": 16.61,
          "sodium": 81
        },
        "weightBasis": "raw"
      }
    }
  },
  "beef_slice": {
    "name": "牛肉片",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "raw",
      "note": "以生里肌火鍋片代表，不適用牛五花。",
      "sources": [
        {
          "title": "牛嫩肩里肌火鍋片",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "catalogUrl": "https://data.gov.tw/dataset/8543",
          "dataset": "TFDA_20",
          "recordId": "I0110104",
          "checkedAt": "2026-11-05",
          "basis": "每 100 g 可食部；樣品狀態:生,冷凍產品; 前處理描述:混合均勻打碎",
          "nutrients": {
            "kcal": 188.0,
            "protein": 20.0,
            "fat": 11.4,
            "carbs": 1.8,
            "sodium": 56.0
          },
          "fiber": null,
          "correctedEnergy": 188.0,
          "ref": "TFDA:I0110104"
        }
      ],
      "identity": {
        "name": "牛肉片",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 188,
          "protein": 20,
          "carbs": 1.8,
          "fat": 11.4,
          "sodium": 56
        },
        "weightBasis": "raw"
      }
    }
  },
  "boneless_short_rib": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "Costco 無骨牛小排的油花等級與包裝標示未留存；不同牛肋部位不可互換，保留。",
      "sources": [
        {
          "ref": "TFDA:I0100201",
          "title": "牛肋條",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "I0100201",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；樣品狀態:生,牛肋脊部位,冷凍產品; 前處理描述:混合均勻打碎"
        },
        {
          "ref": "TFDA:I0100202",
          "title": "牛肋條(2021年取樣)",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "I0100202",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；樣品狀態:生,牛肋脊部位,冷凍產品; 前處理描述:混合均勻打碎"
        }
      ],
      "identity": {
        "name": "無骨牛小排",
        "brand": "Costco 好市多"
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 310,
          "protein": 17.2,
          "carbs": 0,
          "fat": 26.8,
          "sodium": 58
        },
        "weightBasis": "raw"
      }
    },
    "name": "無骨牛小排",
    "brand": "Costco 好市多"
  },
  "shrimp_paste": {
    "name": "蝦仁漿",
    "brand": "",
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-11-05",
      "weightBasis": "as_sold",
      "note": "原五項為佔位值，已停用；尚無對應產品可靠標示。",
      "sources": [],
      "identity": {
        "name": "蝦仁漿",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": null,
          "protein": null,
          "carbs": null,
          "fat": null,
          "sodium": null
        },
        "weightBasis": "as_sold"
      }
    }
  },
  "frozen_tofu": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "冷凍豆腐原狀可食部，非脫水乾凍豆腐",
      "sources": [
        {
          "ref": "TFDA:R4701001",
          "title": "冷凍豆腐",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "R4701001",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；樣品狀態:冷凍包裝; 前處理描述:混合均勻打碎"
        }
      ],
      "identity": {
        "name": "凍豆腐",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 131,
          "protein": 12.9,
          "carbs": 3.9,
          "fat": 7.1,
          "sodium": 8
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "凍豆腐",
    "brand": ""
  },
  "edamame": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "生鮮、去殼毛豆仁；帶殼重、加鹽冷凍即食毛豆不適用；試修五項值重核相符",
      "sources": [
        {
          "ref": "TFDA:H1100101",
          "title": "毛豆仁",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "H1100101",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；樣品狀態:生; 前處理描述:混合均勻打碎"
        }
      ],
      "identity": {
        "name": "毛豆",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 129,
          "protein": 14.6,
          "carbs": 12.5,
          "fat": 3.3,
          "sodium": 1
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "毛豆",
    "brand": ""
  },
  "salmon": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "八筆非 Alaska Native 生鮭魚物種／養殖狀態記錄等權算術平均；每 100 g 可食部；並非市場占比加權或品牌標示，120–208 kcal 範圍；方法與樣本見稽核表",
      "sources": [
        {
          "ref": "USDA:173686",
          "title": "Fish, salmon, Atlantic, wild, raw",
          "url": "https://fdc.nal.usda.gov/food-details/173686/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 173686,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        },
        {
          "ref": "USDA:173688",
          "title": "Fish, salmon, chinook, raw",
          "url": "https://fdc.nal.usda.gov/food-details/173688/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 173688,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        },
        {
          "ref": "USDA:173689",
          "title": "Fish, salmon, chum, raw",
          "url": "https://fdc.nal.usda.gov/food-details/173689/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 173689,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        },
        {
          "ref": "USDA:173691",
          "title": "Fish, salmon, sockeye, raw",
          "url": "https://fdc.nal.usda.gov/food-details/173691/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 173691,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        },
        {
          "ref": "USDA:173715",
          "title": "Fish, salmon, coho, farmed, raw",
          "url": "https://fdc.nal.usda.gov/food-details/173715/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 173715,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        },
        {
          "ref": "USDA:175136",
          "title": "Fish, salmon, coho, wild, raw",
          "url": "https://fdc.nal.usda.gov/food-details/175136/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 175136,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        },
        {
          "ref": "USDA:175138",
          "title": "Fish, salmon, pink, raw",
          "url": "https://fdc.nal.usda.gov/food-details/175138/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 175138,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        },
        {
          "ref": "USDA:175167",
          "title": "Fish, salmon, Atlantic, farmed, raw",
          "url": "https://fdc.nal.usda.gov/food-details/175167/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 175167,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "鮭魚",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 151.6,
          "protein": 20.7,
          "carbs": 0,
          "fat": 7.1,
          "sodium": 55.8
        },
        "weightBasis": "raw"
      }
    },
    "name": "鮭魚",
    "brand": ""
  },
  "full_fat_milk_250": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "全脂鮮乳平均值，以實際 g 秤量；ID 的 250 不代表 250 g 一份",
      "sources": [
        {
          "ref": "TFDA:L01021",
          "title": "全脂鮮乳平均值",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "L01021",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；樣品狀態:全脂(3.0-3.8%)鮮乳; 前處理描述:混合均勻"
        }
      ],
      "identity": {
        "name": "全脂鮮奶",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 63,
          "protein": 3.1,
          "carbs": 4.8,
          "fat": 3.6,
          "sodium": 37
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "全脂鮮奶",
    "brand": ""
  },
  "crab_stick": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "冷凍蟹味棒原狀，魚漿製品；不代表特定品牌",
      "sources": [
        {
          "ref": "TFDA:R6700101",
          "title": "冷凍蟹味棒",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "R6700101",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；樣品狀態:冷凍包裝(魚漿等); 前處理描述:混合均勻打碎"
        }
      ],
      "identity": {
        "name": "蟹肉棒",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 118,
          "protein": 9.3,
          "carbs": 18.6,
          "fat": 0.7,
          "sodium": 694
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "蟹肉棒",
    "brand": ""
  },
  "century_egg": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "unknown",
      "note": "UI 計顆，但只有 per100g，isCount／perUnit 未設；1 顆目前誤按 1 g 計算，缺單顆可食重量，保留並阻擋發布。",
      "sources": [],
      "identity": {
        "name": "皮蛋",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "顆",
        "per100g": {
          "kcal": 170,
          "protein": 12.5,
          "carbs": 1.2,
          "fat": 12.8,
          "sodium": 550
        }
      }
    },
    "name": "皮蛋",
    "brand": ""
  },
  "mushroom_meatball": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "unknown",
      "note": "UI 計顆、只有 per100g；缺品牌與單顆 g 重，會少算，不能猜單顆份量。",
      "sources": [],
      "identity": {
        "name": "香菇貢丸",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "顆",
        "per100g": {
          "kcal": 260,
          "protein": 13.5,
          "carbs": 4.5,
          "fat": 21,
          "sodium": 580
        }
      }
    },
    "name": "香菇貢丸",
    "brand": ""
  },
  "egg_dumpling": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "unknown",
      "note": "UI 計顆、只有 per100g；缺品牌與單顆 g 重，會少算，不能猜單顆份量。",
      "sources": [],
      "identity": {
        "name": "蛋餃",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "顆",
        "per100g": {
          "kcal": 185,
          "protein": 11.2,
          "carbs": 2.5,
          "fat": 14.5,
          "sodium": 380
        }
      }
    },
    "name": "蛋餃",
    "brand": ""
  },
  "taro_meatball": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "unknown",
      "note": "UI 計顆但 isCount=false，只有 per100g；50 kcal / P1 / F0.2 與名稱可疑，未有產品標示，不能改成任意芋圓／貢丸。",
      "sources": [],
      "identity": {
        "name": "芋頭貢丸",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "顆",
        "isCount": false,
        "per100g": {
          "kcal": 50,
          "protein": 1,
          "carbs": 10,
          "fat": 0.2,
          "sodium": 5
        }
      }
    },
    "name": "芋頭貢丸",
    "brand": ""
  },
  "greek_yogurt": {
    "name": "希臘優格",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "as_sold",
      "note": "全脂原味未額外加糖，販售可食部，非特定品牌標示。",
      "sources": [
        {
          "ref": "USDA:171304",
          "title": "Yogurt, Greek, plain, whole milk",
          "url": "https://fdc.nal.usda.gov/food-details/171304/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 171304,
          "checkedAt": "2026-11-05",
          "basis": "每100 g 可食部"
        }
      ],
      "identity": {
        "name": "希臘優格",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 97,
          "protein": 9,
          "carbs": 3.98,
          "fat": 5,
          "sodium": 35
        },
        "perServing": {
          "kcal": 97,
          "protein": 9,
          "carbs": 3.98,
          "fat": 5,
          "sodium": 35
        },
        "servingSize": 100,
        "servingUnit": "g",
        "weightBasis": "as_sold"
      }
    }
  },
  "sugar_free_soymilk": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "無糖豆漿濃度不明；100 g／份換算一致，但尚無對應產品標示，保留。",
      "sources": [],
      "identity": {
        "name": "無糖豆漿",
        "brand": ""
      },
      "snapshot": {
        "per100g": {
          "kcal": 35,
          "protein": 3.6,
          "carbs": 0.7,
          "fat": 1.8,
          "sodium": 12
        },
        "perServing": {
          "kcal": 35,
          "protein": 3.6,
          "carbs": 0.7,
          "fat": 1.8,
          "sodium": 12
        },
        "servingSize": 100,
        "servingUnit": "g",
        "weightBasis": "as_sold"
      }
    },
    "name": "無糖豆漿",
    "brand": ""
  },
  "whey_protein_cocoa": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "多個品牌混列，30 g／份換算誤差在原值捨入範圍；沒有單一可驗證 SKU，不當作品牌標示。",
      "sources": [],
      "identity": {
        "name": "乳清蛋白（法式可可）",
        "brand": "Myprotein / 戰神 / 果果"
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 393,
          "protein": 70.0,
          "carbs": 11.6,
          "fat": 7.0,
          "sodium": 466
        },
        "perServing": {
          "kcal": 118,
          "protein": 21.0,
          "carbs": 3.5,
          "fat": 2.1,
          "sodium": 140
        },
        "servingSize": 30,
        "servingUnit": "g",
        "weightBasis": "dry"
      }
    },
    "name": "乳清蛋白（法式可可）",
    "brand": "Myprotein / 戰神 / 果果"
  },
  "pea_protein_sesame": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "多個品牌混列，30 g／份換算誤差在原值捨入範圍；沒有單一可驗證 SKU，不當作品牌標示。",
      "sources": [],
      "identity": {
        "name": "豌豆蛋白（芝麻歐蕾）",
        "brand": "樂維根 / 果果"
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 406,
          "protein": 73.3,
          "carbs": 8.0,
          "fat": 9.3,
          "sodium": 600
        },
        "perServing": {
          "kcal": 122,
          "protein": 22.0,
          "carbs": 2.4,
          "fat": 2.8,
          "sodium": 180
        },
        "servingSize": 30,
        "servingUnit": "g",
        "weightBasis": "dry"
      }
    },
    "name": "豌豆蛋白（芝麻歐蕾）",
    "brand": "樂維根 / 果果"
  },
  "low_sugar_soymilk": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "義美／光泉混列；per100g 欄實際按 100 ml 使用，密度與品牌標示未查明，不宣稱 100 g=100 ml。",
      "sources": [],
      "identity": {
        "name": "低糖豆漿",
        "brand": "義美 / 光泉"
      },
      "snapshot": {
        "unitLabel": "ml",
        "per100g": {
          "kcal": 48,
          "protein": 3.4,
          "carbs": 5.0,
          "fat": 1.6,
          "sodium": 15
        },
        "perServing": {
          "kcal": 48,
          "protein": 3.4,
          "carbs": 5.0,
          "fat": 1.6,
          "sodium": 15
        },
        "servingSize": 100,
        "servingUnit": "ml",
        "weightBasis": "as_sold"
      }
    },
    "name": "低糖豆漿",
    "brand": "義美 / 光泉"
  },
  "ing_1789703581239": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": null,
      "weightBasis": "unknown",
      "note": "新增基準項目，尚未取得可核對的產品標示或官方對應樣本。",
      "sources": [],
      "identity": {
        "name": "豆腐麵",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "weightBasis": "unknown"
      }
    },
    "name": "豆腐麵",
    "brand": ""
  },
  "ing_1790221450416": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": null,
      "weightBasis": "unknown",
      "note": "新增基準項目，尚未取得可核對的產品標示或官方對應樣本。",
      "sources": [],
      "identity": {
        "name": "蛤蜊",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "weightBasis": "unknown"
      }
    },
    "name": "蛤蜊",
    "brand": ""
  },
  "ing_1790393110939": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": null,
      "weightBasis": "unknown",
      "note": "新增基準項目，尚未取得可核對的產品標示或官方對應樣本。",
      "sources": [],
      "identity": {
        "name": "韓式燒烤牛肉",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 188,
          "protein": 20,
          "carbs": 1.8,
          "fat": 11.4,
          "sodium": 0
        },
        "perServing": {
          "kcal": 188,
          "protein": 20,
          "carbs": 1.8,
          "fat": 11.4,
          "sodium": 0
        },
        "servingSize": 100,
        "servingUnit": "g",
        "weightBasis": "unknown"
      }
    },
    "name": "韓式燒烤牛肉",
    "brand": ""
  },
  "ing_1790571924504": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": null,
      "weightBasis": "as_sold",
      "note": "新增基準項目，尚未取得可核對的產品標示或官方對應樣本。",
      "sources": [],
      "identity": {
        "name": "無糖豆漿（義美）",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "mL",
        "per100g": {
          "kcal": 34,
          "protein": 3.4,
          "carbs": 1.2,
          "fat": 1.7,
          "sodium": 8
        },
        "perServing": {
          "kcal": 84.9,
          "protein": 8.5,
          "carbs": 3,
          "fat": 4.3,
          "sodium": 20
        },
        "servingSize": 250,
        "servingUnit": "mL",
        "weightBasis": "as_sold"
      }
    },
    "name": "無糖豆漿（義美）",
    "brand": ""
  },
  "mango": {
    "name": "芒果",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "raw",
      "note": "去皮去籽生芒果可食部。",
      "sources": [
        {
          "title": "芒果平均值(西洋種)",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "catalogUrl": "https://data.gov.tw/dataset/8543",
          "dataset": "TFDA_20",
          "recordId": "D21002",
          "checkedAt": "2026-11-05",
          "basis": "每 100 g 可食部；樣品狀態:西洋種; 前處理描述:去皮及籽,混合均勻打碎",
          "nutrients": {
            "kcal": 50.0,
            "protein": 0.6,
            "fat": 0.2,
            "carbs": 13.0,
            "sodium": 5.0
          },
          "fiber": 1.2,
          "correctedEnergy": 48.0,
          "ref": "TFDA:D21002"
        }
      ],
      "identity": {
        "name": "芒果",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 50,
          "protein": 0.6,
          "carbs": 13,
          "fat": 0.2,
          "sodium": 5
        },
        "weightBasis": "raw"
      }
    }
  },
  "cabbage": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生高麗菜可食部",
      "sources": [
        {
          "ref": "USDA:169975",
          "title": "Cabbage, raw",
          "url": "https://fdc.nal.usda.gov/food-details/169975/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 169975,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "高麗菜",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 25,
          "protein": 1.3,
          "carbs": 5.8,
          "fat": 0.1,
          "sodium": 18
        },
        "weightBasis": "raw"
      }
    },
    "name": "高麗菜",
    "brand": ""
  },
  "baby_cabbage": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "娃娃菜品種未明；不可用小白菜 pak-choi 或任意大白菜樣本冒充標示，保留。",
      "sources": [],
      "identity": {
        "name": "娃娃菜",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 18,
          "protein": 1.5,
          "carbs": 3.4,
          "fat": 0.2,
          "sodium": 10
        },
        "weightBasis": "raw"
      }
    },
    "name": "娃娃菜",
    "brand": ""
  },
  "broccoli": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生綠花椰菜可食部；非加鹽熟食",
      "sources": [
        {
          "ref": "USDA:170379",
          "title": "Broccoli, raw",
          "url": "https://fdc.nal.usda.gov/food-details/170379/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 170379,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "綠花椰菜",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 34,
          "protein": 2.8,
          "carbs": 6.6,
          "fat": 0.4,
          "sodium": 33
        },
        "weightBasis": "raw"
      }
    },
    "name": "綠花椰菜",
    "brand": ""
  },
  "kimchi": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "韓式泡菜的糖、發酵與鹽度依品牌配方不同，既有 Na800 未取得對應來源，保留。",
      "sources": [],
      "identity": {
        "name": "韓式泡菜",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 32,
          "protein": 1.6,
          "carbs": 6,
          "fat": 0.5,
          "sodium": 800
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "韓式泡菜",
    "brand": ""
  },
  "black_fungus": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "生鮮濕木耳可食部；泡發乾木耳的含水率不固定，僅能作濕重近似，絕不套用乾木耳值",
      "sources": [
        {
          "ref": "TFDA:G0100101",
          "title": "木耳",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "G0100101",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；樣品狀態:生; 前處理描述:混合均勻打碎"
        }
      ],
      "identity": {
        "name": "黑木耳",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 38,
          "protein": 0.9,
          "carbs": 8.8,
          "fat": 0.1,
          "sodium": 12
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "黑木耳",
    "brand": ""
  },
  "baby_corn": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生玉米筍可食部",
      "sources": [
        {
          "ref": "TFDA:E1300201",
          "title": "玉米筍",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "E1300201",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；樣品狀態:生; 前處理描述:混合均勻打碎"
        }
      ],
      "identity": {
        "name": "玉米筍",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 33,
          "protein": 1.8,
          "carbs": 7,
          "fat": 0.2,
          "sodium": 0
        },
        "weightBasis": "raw"
      }
    },
    "name": "玉米筍",
    "brand": ""
  },
  "banana": {
    "name": "香蕉",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "raw",
      "note": "生香蕉去皮可食部，改用 g 秤重而非估每根重量。",
      "sources": [
        {
          "ref": "USDA:173944",
          "title": "Bananas, raw",
          "url": "https://fdc.nal.usda.gov/food-details/173944/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 173944,
          "checkedAt": "2026-11-05",
          "basis": "每100 g 可食部"
        }
      ],
      "identity": {
        "name": "香蕉",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 89,
          "protein": 1.09,
          "carbs": 22.84,
          "fat": 0.33,
          "sodium": 1
        },
        "weightBasis": "raw"
      }
    }
  },
  "spinach": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生菠菜可食部",
      "sources": [
        {
          "ref": "USDA:168462",
          "title": "Spinach, raw",
          "url": "https://fdc.nal.usda.gov/food-details/168462/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 168462,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "菠菜",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 23,
          "protein": 2.9,
          "carbs": 3.6,
          "fat": 0.4,
          "sodium": 79
        },
        "weightBasis": "raw"
      }
    },
    "name": "菠菜",
    "brand": ""
  },
  "chinese_cabbage": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生大白菜 pe-tsai；不使用小白菜 pak-choi",
      "sources": [
        {
          "ref": "USDA:169979",
          "title": "Cabbage, chinese (pe-tsai), raw",
          "url": "https://fdc.nal.usda.gov/food-details/169979/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 169979,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "大白菜",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 16,
          "protein": 1.2,
          "carbs": 3.2,
          "fat": 0.2,
          "sodium": 9
        },
        "weightBasis": "raw"
      }
    },
    "name": "大白菜",
    "brand": ""
  },
  "zucchini": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生櫛瓜含皮可食部",
      "sources": [
        {
          "ref": "USDA:169291",
          "title": "Squash, summer, zucchini, includes skin, raw",
          "url": "https://fdc.nal.usda.gov/food-details/169291/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 169291,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "櫛瓜",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 17,
          "protein": 1.2,
          "carbs": 3.1,
          "fat": 0.3,
          "sodium": 8
        },
        "perServing": {
          "kcal": 17,
          "protein": 1.2,
          "carbs": 3.1,
          "fat": 0.3,
          "sodium": 8
        },
        "servingSize": 100,
        "servingUnit": "g",
        "weightBasis": "raw"
      }
    },
    "name": "櫛瓜",
    "brand": ""
  },
  "cucumber": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生小黃瓜含皮可食部",
      "sources": [
        {
          "ref": "USDA:168409",
          "title": "Cucumber, with peel, raw",
          "url": "https://fdc.nal.usda.gov/food-details/168409/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 168409,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "小黃瓜",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 15,
          "protein": 0.7,
          "carbs": 3.6,
          "fat": 0.1,
          "sodium": 2
        },
        "weightBasis": "raw"
      }
    },
    "name": "小黃瓜",
    "brand": ""
  },
  "greens": {
    "name": "綜合生菜",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "raw",
      "note": "無混合比例時暫以生綠葉萵苣近似，不代表混合生菜檢測值。",
      "sources": [
        {
          "title": "Lettuce, green leaf, raw",
          "url": "https://fdc.nal.usda.gov/food-details/169249/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 169249,
          "checkedAt": "2026-11-05",
          "basis": "每 100 g 可食部；狀態依原始品名",
          "nutrients": {
            "carbs": 2.87,
            "kcal": 15.0,
            "protein": 1.36,
            "sodium": 28.0,
            "fat": 0.15
          },
          "conversionFactors": [
            {
              "type": ".CalorieConversionFactor",
              "proteinValue": 2.44,
              "fatValue": 8.37,
              "carbohydrateValue": 3.57
            },
            {
              "type": ".ProteinConversionFactor",
              "value": 6.25
            }
          ],
          "fiber": 1.3,
          "scientificName": "Lactuca sativa var. crispa",
          "ref": "USDA:169249"
        }
      ],
      "identity": {
        "name": "綜合生菜",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 15,
          "protein": 1.36,
          "carbs": 2.87,
          "fat": 0.15,
          "sodium": 28
        },
        "weightBasis": "raw"
      }
    }
  },
  "carrot": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生胡蘿蔔可食部",
      "sources": [
        {
          "ref": "USDA:170393",
          "title": "Carrots, raw",
          "url": "https://fdc.nal.usda.gov/food-details/170393/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 170393,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "紅蘿蔔",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 41,
          "protein": 0.9,
          "carbs": 9.6,
          "fat": 0.2,
          "sodium": 69
        },
        "weightBasis": "raw"
      }
    },
    "name": "紅蘿蔔",
    "brand": ""
  },
  "onion": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生洋蔥可食部",
      "sources": [
        {
          "ref": "USDA:170000",
          "title": "Onions, raw",
          "url": "https://fdc.nal.usda.gov/food-details/170000/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 170000,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "洋蔥",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 40,
          "protein": 1.1,
          "carbs": 9.3,
          "fat": 0.1,
          "sodium": 4
        },
        "weightBasis": "raw"
      }
    },
    "name": "洋蔥",
    "brand": ""
  },
  "mushroom": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生鮮香菇平均值；非乾菇或熟菇",
      "sources": [
        {
          "ref": "TFDA:G08001",
          "title": "香菇平均值",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "G08001",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；樣品狀態:生; 前處理描述:混合均勻打碎"
        }
      ],
      "identity": {
        "name": "香菇",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 39,
          "protein": 3,
          "carbs": 7.6,
          "fat": 0.1,
          "sodium": 1
        },
        "weightBasis": "raw"
      }
    },
    "name": "香菇",
    "brand": ""
  },
  "beech_mushroom": {
    "name": "鴻喜菇",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "raw",
      "note": "鴻喜菇生重代表值；雪白菇另列。",
      "sources": [
        {
          "ref": "CCH:20260320",
          "title": "彰化基督教醫院營養部：菇類營養（援引 TFDA）",
          "url": "https://dpt.cch.org.tw/layout/layout_5/knowledge_detail.aspx?ID=7600&Key=238&cID=300",
          "checkedAt": "2026-11-05",
          "basis": "每100g生重可食部"
        },
        {
          "ref": "UDN:FOOD4180",
          "title": "元氣網食品營養：鴻喜菇（轉載台灣食品成分資料）",
          "url": "https://health.udn.com/health/food/4180",
          "checkedAt": "2026-11-05",
          "basis": "每100g生鮮去菌柄可食部；含脂肪0.1g與鈉2mg"
        }
      ],
      "identity": {
        "name": "鴻喜菇",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 30,
          "protein": 2.9,
          "carbs": 5.3,
          "fat": 0.1,
          "sodium": 2
        },
        "weightBasis": "raw"
      }
    }
  },
  "frozen_berry": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "莓果種類、混合比例及有無加糖不明；不採單一藍莓或草莓作已核實值。",
      "sources": [],
      "identity": {
        "name": "冷凍莓果",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 50,
          "protein": 1,
          "carbs": 11.5,
          "fat": 0.5,
          "sodium": 1
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "冷凍莓果",
    "brand": ""
  },
  "nori_strips": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "未調味壽司海苔片切絲的乾重近似；油炸、調味海苔不適用",
      "sources": [
        {
          "ref": "TFDA:F9900201",
          "title": "壽司海苔片",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "F9900201",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；前處理描述:混合均勻打碎"
        }
      ],
      "identity": {
        "name": "海苔絲",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 278,
          "protein": 46.5,
          "carbs": 32.1,
          "fat": 3.7,
          "sodium": 387
        },
        "weightBasis": "dry"
      }
    },
    "name": "海苔絲",
    "brand": ""
  },
  "cherry_tomatoes": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "紅色系小番茄平均值，生、去蒂可食部；非單一品種標示",
      "sources": [
        {
          "ref": "TFDA:E74004",
          "title": "小番茄平均值(紅色系)",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "E74004",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；樣品狀態:生,紅色系小果; 前處理描述:去蒂,混合均勻打碎"
        }
      ],
      "identity": {
        "name": "小番茄",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 33,
          "protein": 0.9,
          "carbs": 7.4,
          "fat": 0.2,
          "sodium": 6
        },
        "weightBasis": "raw"
      }
    },
    "name": "小番茄",
    "brand": ""
  },
  "bean_sprouts": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生黃豆芽可食部；不是綠豆芽",
      "sources": [
        {
          "ref": "TFDA:E7700401",
          "title": "黃豆芽",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "E7700401",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；樣品狀態:生; 前處理描述:混合均勻打碎"
        }
      ],
      "identity": {
        "name": "黃豆芽",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 47,
          "protein": 5.3,
          "carbs": 5,
          "fat": 1.6,
          "sodium": 7
        },
        "weightBasis": "raw"
      }
    },
    "name": "黃豆芽",
    "brand": ""
  },
  "scallion": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生青蔥，包含青葉與蔥白",
      "sources": [
        {
          "ref": "USDA:170005",
          "title": "Onions, spring or scallions (includes tops and bulb), raw",
          "url": "https://fdc.nal.usda.gov/food-details/170005/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 170005,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "青蔥",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 32,
          "protein": 1.8,
          "carbs": 7.3,
          "fat": 0.2,
          "sodium": 16
        },
        "weightBasis": "raw"
      }
    },
    "name": "青蔥",
    "brand": ""
  },
  "enoki_mushroom": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生金針菇可食部",
      "sources": [
        {
          "ref": "USDA:169382",
          "title": "Mushrooms, enoki, raw",
          "url": "https://fdc.nal.usda.gov/food-details/169382/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 169382,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "金針菇",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 37,
          "protein": 2.7,
          "carbs": 7.8,
          "fat": 0.3,
          "sodium": 3
        },
        "weightBasis": "raw"
      }
    },
    "name": "金針菇",
    "brand": ""
  },
  "ing_1787714321224": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": null,
      "weightBasis": "unknown",
      "note": "新增基準項目，尚未取得可核對的產品標示或官方對應樣本。",
      "sources": [],
      "identity": {
        "name": "洋菇",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "weightBasis": "unknown"
      }
    },
    "name": "洋菇",
    "brand": ""
  },
  "green_pepper_noodle": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "unknown",
      "note": "只補 perUnit=既有每包 perServing，修正一包算成全零；未取得同一 SKU 原標示，五項本身仍待確認。",
      "sources": [
        {
          "ref": "BRAND:CHIASELECT",
          "title": "賈以食日官網，產品識別候選",
          "url": "https://www.chiaselect.com/zh-TW",
          "checkedAt": "2026-10-28"
        }
      ],
      "identity": {
        "name": "青花椒乾拌麵",
        "brand": "賈以食日"
      },
      "snapshot": {
        "unitLabel": "包",
        "isCount": true,
        "perServing": {
          "kcal": 390.9,
          "protein": 13.1,
          "carbs": 67.3,
          "fat": 7.7,
          "sodium": 1070.1
        },
        "perUnit": {
          "kcal": 390.9,
          "protein": 13.1,
          "carbs": 67.3,
          "fat": 7.7,
          "sodium": 1070.1
        }
      }
    },
    "name": "青花椒乾拌麵",
    "brand": "賈以食日"
  },
  "bagel": {
    "name": "原味貝果",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "as_sold",
      "note": "一般原味貝果每100g，未核對特定品牌或每個重量，料理需 g。",
      "sources": [
        {
          "ref": "USDA:174899",
          "title": "Bagels, plain, enriched",
          "url": "https://fdc.nal.usda.gov/food-details/174899/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 174899,
          "checkedAt": "2026-11-05",
          "basis": "每100g販售狀態可食部"
        }
      ],
      "identity": {
        "name": "原味貝果",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 264,
          "protein": 10.56,
          "carbs": 52.38,
          "fat": 1.32,
          "sodium": 422
        },
        "weightBasis": "as_sold"
      }
    }
  },
  "corn": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "好市多／綠巨人混列；罐頭液、瀝乾或含液基準未知，保留待包裝。",
      "sources": [],
      "identity": {
        "name": "金黃玉米粒(無加糖)",
        "brand": "好市多/綠巨人"
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 77,
          "protein": 2.4,
          "carbs": 14.3,
          "fat": 1.7,
          "sodium": 160
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "金黃玉米粒(無加糖)",
    "brand": "好市多/綠巨人"
  },
  "brown_rice": {
    "name": "糙米飯",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "cooked",
      "note": "熟糙米飯無加鹽；單獨於白飯，含水率依煮法改變。",
      "sources": [
        {
          "ref": "USDA:169704",
          "title": "Rice, brown, long-grain, cooked",
          "url": "https://fdc.nal.usda.gov/food-details/169704/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 169704,
          "checkedAt": "2026-11-05",
          "basis": "每100 g 可食部"
        }
      ],
      "identity": {
        "name": "糙米飯",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 123,
          "protein": 2.74,
          "carbs": 25.58,
          "fat": 0.97,
          "sodium": 4
        },
        "weightBasis": "cooked"
      }
    }
  },
  "potato": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生馬鈴薯含皮可食部",
      "sources": [
        {
          "ref": "USDA:170026",
          "title": "Potatoes, flesh and skin, raw",
          "url": "https://fdc.nal.usda.gov/food-details/170026/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 170026,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "馬鈴薯",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 77,
          "protein": 2.1,
          "carbs": 17.5,
          "fat": 0.1,
          "sodium": 6
        },
        "weightBasis": "raw"
      }
    },
    "name": "馬鈴薯",
    "brand": ""
  },
  "granola": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "綜合燕麥可能含糖油與堅果，不可套生燕麥資料；配方或品牌未知，保留。",
      "sources": [],
      "identity": {
        "name": "綜合燕麥",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 420,
          "protein": 10,
          "carbs": 64,
          "fat": 15,
          "sodium": 45
        },
        "weightBasis": "dry"
      }
    },
    "name": "綜合燕麥",
    "brand": ""
  },
  "prince_noodles": {
    "name": "王子麵",
    "brand": "",
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-11-05",
      "weightBasis": "dry",
      "note": "依使用者選擇以乾麵本體（不含調味包）計；原值是佔位值，缺此版本完整標示，不能精算。",
      "sources": [],
      "identity": {
        "name": "王子麵",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": null,
          "protein": null,
          "carbs": null,
          "fat": null,
          "sodium": null
        },
        "weightBasis": "dry"
      }
    }
  },
  "sweet_potato": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "raw",
      "note": "生地瓜可食部；美國通用品種，台灣甘藷的含水率及品種可能不同；維持既有試修的一位小數值",
      "sources": [
        {
          "ref": "USDA:168482",
          "title": "Sweet potato, raw, unprepared (Includes foods for USDA's Food Distribution Program)",
          "url": "https://fdc.nal.usda.gov/food-details/168482/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 168482,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "地瓜",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 86,
          "protein": 1.6,
          "carbs": 20.1,
          "fat": 0.1,
          "sodium": 55
        },
        "weightBasis": "raw"
      }
    },
    "name": "地瓜",
    "brand": ""
  },
  "steamed_noodle": {
    "evidence": {
      "kind": "product_label",
      "status": "pending",
      "checkedAt": "2026-10-29",
      "weightBasis": "dry",
      "note": "通路標示已交叉核對 65g／包；仍待本人核對實際產品與規格。",
      "sources": [
        {
          "url": "https://www.etmall.com.tw/i/3025524/",
          "title": "歷史通路標示核對，非本人持有包裝"
        }
      ],
      "identity": {
        "name": "維力蒸煮麵",
        "brand": "維力"
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 362.2,
          "protein": 9.1,
          "carbs": 79.2,
          "fat": 1,
          "sodium": 712
        },
        "gramsPerPack": 65,
        "weightBasis": "dry"
      }
    },
    "name": "維力蒸煮麵",
    "brand": "維力"
  },
  "angel_hair_pasta": {
    "evidence": {
      "kind": "product_label",
      "status": "verified",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "使用者本次明確確認的乾麵每 100 g 產品標示；依證言核實與保留，非獨立重閱實物標示。",
      "sources": [
        {
          "ref": "USER:PASTA",
          "title": "Bebe 本次明確確認之原始乾義大利麵產品標示",
          "url": null,
          "checkedAt": "2026-10-28"
        }
      ],
      "identity": {
        "name": "義大利（天使）",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 160,
          "protein": 3,
          "carbs": 35,
          "fat": 1,
          "sodium": 10
        },
        "weightBasis": "dry"
      }
    },
    "name": "義大利（天使）",
    "brand": ""
  },
  "shin_ramen": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "366 kcal / F3.5 類似非油炸型，但名稱只有辛拉麵；未確認油炸／非油炸與地區配方，保留。",
      "sources": [],
      "identity": {
        "name": "辛拉麵",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 366,
          "protein": 9.9,
          "carbs": 73.8,
          "fat": 3.5,
          "sodium": 1939
        },
        "weightBasis": "dry"
      }
    },
    "name": "辛拉麵",
    "brand": ""
  },
  "potato_ramen": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "unknown",
      "note": "UI 計包、只有 per100g；未留單包 g 重與品牌，1 包目前按 1 g 計算，阻擋發布。",
      "sources": [],
      "identity": {
        "name": "馬鈴薯泡麵",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "包",
        "per100g": {
          "kcal": 445,
          "protein": 9,
          "carbs": 68,
          "fat": 15,
          "sodium": 1750
        }
      }
    },
    "name": "馬鈴薯泡麵",
    "brand": ""
  },
  "ing_1788172010738": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": null,
      "weightBasis": "as_sold",
      "note": "新增基準項目，尚未取得可核對的產品標示或官方對應樣本。",
      "sources": [],
      "identity": {
        "name": "奇美鮮肉包",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 269,
          "protein": 7.5,
          "carbs": 37.7,
          "fat": 9.8,
          "sodium": 181
        },
        "perServing": {
          "kcal": 175,
          "protein": 4.9,
          "carbs": 24.5,
          "fat": 6.4,
          "sodium": 118
        },
        "servingSize": 65,
        "servingUnit": "g",
        "weightBasis": "as_sold"
      }
    },
    "name": "奇美鮮肉包",
    "brand": ""
  },
  "bibimbap_secret": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "可能為韓式辣醬或自製拌飯醬；配方不明，不能用純 gochujang 或任意配方替換。",
      "sources": [],
      "identity": {
        "name": "韓式辣醬",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 300,
          "protein": 6.7,
          "carbs": 46.7,
          "fat": 10,
          "sodium": 2333
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "韓式辣醬",
    "brand": ""
  },
  "balsamic": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "巴薩米克醋依濃縮程度／加糖不同；未對應品牌，保留。",
      "sources": [],
      "identity": {
        "name": "巴薩米克醋",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 93,
          "protein": 0.7,
          "carbs": 18,
          "fat": 0,
          "sodium": 27
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "巴薩米克醋",
    "brand": ""
  },
  "sesame_powder": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "黑芝麻粉乾重，非調糖芝麻飲品",
      "sources": [
        {
          "ref": "TFDA:C1620101",
          "title": "黑芝麻粉",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "C1620101",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；前處理描述:混合均勻"
        }
      ],
      "identity": {
        "name": "黑芝麻粉",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 601,
          "protein": 15.7,
          "carbs": 20.8,
          "fat": 55.2,
          "sodium": 3
        },
        "weightBasis": "dry"
      }
    },
    "name": "黑芝麻粉",
    "brand": ""
  },
  "matcha_powder": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "未註明純抹茶／調糖粉與品牌；未能核對現有完整五項，不單靠三大營養素回算。",
      "sources": [],
      "identity": {
        "name": "抹茶粉",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 320,
          "protein": 30,
          "carbs": 40,
          "fat": 5,
          "sodium": 10
        },
        "weightBasis": "dry"
      }
    },
    "name": "抹茶粉",
    "brand": ""
  },
  "cocoa_powder": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "無糖未鹼化乾可可粉；含纖維 37 g；採來源 228 kcal 與特定 Atwater 係數，不用 4/9/4 回算",
      "sources": [
        {
          "ref": "USDA:169593",
          "title": "Cocoa, dry powder, unsweetened",
          "url": "https://fdc.nal.usda.gov/food-details/169593/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 169593,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "可可粉",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 228,
          "protein": 19.6,
          "carbs": 57.9,
          "fat": 13.7,
          "sodium": 21
        },
        "weightBasis": "dry"
      }
    },
    "name": "可可粉",
    "brand": ""
  },
  "chia_seeds": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "乾奇亞籽，可食部",
      "sources": [
        {
          "ref": "USDA:170554",
          "title": "Seeds, chia seeds, dried",
          "url": "https://fdc.nal.usda.gov/food-details/170554/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 170554,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "奇亞籽",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 486,
          "protein": 16.5,
          "carbs": 42.1,
          "fat": 30.7,
          "sodium": 16
        },
        "weightBasis": "dry"
      }
    },
    "name": "奇亞籽",
    "brand": ""
  },
  "smoked_sea_salt": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "純煙燻鹽暫以食鹽估算；非複方調味鹽，含水率／礦物質差異未涵蓋；100 g 鈉 38800 mg，不是 1 g",
      "sources": [
        {
          "ref": "USDA:173468",
          "title": "Salt, table",
          "url": "https://fdc.nal.usda.gov/food-details/173468/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 173468,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "煙燻海鹽",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 0,
          "protein": 0,
          "carbs": 0,
          "fat": 0,
          "sodium": 38800
        },
        "weightBasis": "dry"
      }
    },
    "name": "煙燻海鹽",
    "brand": ""
  },
  "soy_sauce": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "一般黃豆小麥醬油 shoyu 原狀；非低鈉或醬油膏；TFDA 一般醬油粗脂肪缺值，故選五項齊全 USDA，不把缺值填零",
      "sources": [
        {
          "ref": "USDA:174277",
          "title": "Soy sauce made from soy and wheat (shoyu)",
          "url": "https://fdc.nal.usda.gov/food-details/174277/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 174277,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "醬油",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 53,
          "protein": 8.1,
          "carbs": 4.9,
          "fat": 0.6,
          "sodium": 5490
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "醬油",
    "brand": ""
  },
  "shacha_sauce": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "葷沙茶醬，先將油脂及固形物拌勻再秤重；不適用素沙茶或瀝油固形物",
      "sources": [
        {
          "ref": "TFDA:P1001701",
          "title": "沙茶醬",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "P1001701",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；前處理描述:混合均質(扁魚,蝦米,黃豆油,大蒜,蔥干,辣椒等)"
        }
      ],
      "identity": {
        "name": "沙茶醬",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 729,
          "protein": 10.2,
          "carbs": 10.4,
          "fat": 71.8,
          "sodium": 421
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "沙茶醬",
    "brand": ""
  },
  "maple_syrup": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "純楓糖漿原狀；非楓糖風味糖漿",
      "sources": [
        {
          "ref": "USDA:169661",
          "title": "Syrups, maple",
          "url": "https://fdc.nal.usda.gov/food-details/169661/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 169661,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "楓糖漿",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 260,
          "protein": 0,
          "carbs": 67,
          "fat": 0.1,
          "sodium": 12
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "楓糖漿",
    "brand": ""
  },
  "italian_herbs": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "dry",
      "note": "香料種類與混合比例未知，無可重現同品配方；目前無法查證完整五項。",
      "sources": [],
      "identity": {
        "name": "義大利綜合香料",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 260,
          "protein": 10,
          "carbs": 45,
          "fat": 5,
          "sodium": 50
        },
        "weightBasis": "dry"
      }
    },
    "name": "義大利綜合香料",
    "brand": ""
  },
  "lemon_juice": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "生鮮檸檬汁，非加糖飲品",
      "sources": [
        {
          "ref": "USDA:167747",
          "title": "Lemon juice, raw",
          "url": "https://fdc.nal.usda.gov/food-details/167747/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 167747,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "新鮮檸檬汁",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 22,
          "protein": 0.4,
          "carbs": 6.9,
          "fat": 0.2,
          "sodium": 1
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "新鮮檸檬汁",
    "brand": ""
  },
  "yuzu_vinegar": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "和風柚子醋醬與果醋混為同項，鈉糖可能差很大，無法選擇對應通用樣本；需明確產品。",
      "sources": [],
      "identity": {
        "name": "和風柚子醋/果醋",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 35,
          "protein": 0.5,
          "carbs": 8,
          "fat": 0,
          "sodium": 120
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "和風柚子醋/果醋",
    "brand": ""
  },
  "horseradish_mayo": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "150 kcal / P10 / F5 對蛋黃醬名稱可疑；未知配方或原標示，無法查證，不用 4/9/4 直接定錯。",
      "sources": [],
      "identity": {
        "name": "辣根蛋黃醬",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 150,
          "protein": 10,
          "carbs": 15,
          "fat": 5,
          "sodium": 50
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "辣根蛋黃醬",
    "brand": ""
  },
  "olive_oil": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "純橄欖油原狀",
      "sources": [
        {
          "ref": "USDA:171413",
          "title": "Oil, olive, salad or cooking",
          "url": "https://fdc.nal.usda.gov/food-details/171413/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 171413,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "橄欖油",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 884,
          "protein": 0,
          "carbs": 0,
          "fat": 100,
          "sodium": 2
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "橄欖油",
    "brand": ""
  },
  "truffle_olive_oil": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "as_sold",
      "note": "以純橄欖油近似未額外加糖／鹽的松露風味油；若有其他配料則改以產品標示。",
      "sources": [
        {
          "ref": "USDA:171413",
          "title": "Oil, olive, salad or cooking",
          "url": "https://fdc.nal.usda.gov/food-details/171413/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 171413,
          "checkedAt": "2026-11-05",
          "basis": "每100g販售狀態可食部"
        }
      ],
      "identity": {
        "name": "松露橄欖油",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 884,
          "protein": 0,
          "carbs": 0,
          "fat": 100,
          "sodium": 2
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "松露橄欖油",
    "brand": ""
  },
  "sriracha_mayo": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "J-Lek 地區版本及每 100 ml／g 標示可能不同，未取得與 FK 同款官網完整營養表；保留，不能把 ml 值寫成 g。",
      "sources": [],
      "identity": {
        "name": "J-Lek是拉差美乃滋",
        "brand": "J-Lek"
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 450,
          "protein": 1,
          "carbs": 12,
          "fat": 45,
          "sodium": 1200
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "J-Lek是拉差美乃滋",
    "brand": "J-Lek"
  },
  "sugar_free_peanut_butter": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "無糖不等於無鹽；Na312 可能為加鹽版本，未取得同品牌標示，保留。",
      "sources": [],
      "identity": {
        "name": "無糖花生醬",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 594,
          "protein": 21.9,
          "carbs": 18.8,
          "fat": 50,
          "sodium": 312
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "無糖花生醬",
    "brand": ""
  },
  "avocado_mash": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "未調味酪梨果肉泥，排除皮籽；若為加鹽商品不適用",
      "sources": [
        {
          "ref": "USDA:171705",
          "title": "Avocados, raw, all commercial varieties",
          "url": "https://fdc.nal.usda.gov/food-details/171705/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 171705,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "酪梨泥",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 160,
          "protein": 2,
          "carbs": 8.5,
          "fat": 14.7,
          "sodium": 7
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "酪梨泥",
    "brand": ""
  },
  "avocado_oil": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "純酪梨油原狀",
      "sources": [
        {
          "ref": "USDA:173573",
          "title": "Oil, avocado",
          "url": "https://fdc.nal.usda.gov/food-details/173573/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 173573,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "酪梨油",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 884,
          "protein": 0,
          "carbs": 0,
          "fat": 100,
          "sodium": 0
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "酪梨油",
    "brand": ""
  },
  "unsalted_butter": {
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "無鹽奶油原狀",
      "sources": [
        {
          "ref": "USDA:173430",
          "title": "Butter, without salt",
          "url": "https://fdc.nal.usda.gov/food-details/173430/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 173430,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "無鹽奶油",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 717,
          "protein": 0.9,
          "carbs": 0.1,
          "fat": 81.1,
          "sodium": 11
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "無鹽奶油",
    "brand": ""
  },
  "brown_sugar_syrup": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "濃度未記錄；不能用純黑糖或任意糖水取代，現有值保留待原標示／配方。",
      "sources": [],
      "identity": {
        "name": "黑糖漿",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 260,
          "protein": 0.2,
          "carbs": 65,
          "fat": 0.1,
          "sodium": 15
        },
        "weightBasis": "as_sold"
      }
    },
    "name": "黑糖漿",
    "brand": ""
  },
  "coffee_capsule": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "unknown",
      "note": "原 commit 載有真實每顆 16 ml 標示：20 kcal / P0.3 / F0 / C4.6 / Na18；只新增 perUnit，保護原每份與每百值，不重新捨入標示。包裝影像及品牌仍待追溯。",
      "sources": [
        {
          "ref": "REPO:COFFEE",
          "title": "原始標示修正 commit 612ae57",
          "url": "https://github.com/leebebe1002/kitchen-app/commit/612ae574e26ddeede1fb44b871101fbbd86aaa8f",
          "checkedAt": "2026-10-28"
        }
      ],
      "identity": {
        "name": "咖啡膠囊",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "顆",
        "per100g": {
          "kcal": 124,
          "protein": 1.9,
          "carbs": 28.7,
          "fat": 0.0,
          "sodium": 110
        },
        "perServing": {
          "kcal": 20,
          "protein": 0.3,
          "carbs": 4.6,
          "fat": 0.0,
          "sodium": 18
        },
        "perUnit": {
          "kcal": 20,
          "protein": 0.3,
          "carbs": 4.6,
          "fat": 0,
          "sodium": 18
        },
        "servingSize": 16,
        "servingUnit": "ml"
      }
    },
    "name": "咖啡膠囊",
    "brand": ""
  },
  "ing_1787563079531": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "義美官網成分含糖、醬油及食鹽，既有五項全零尚無標示支持；TFDA 烏醋 Na1571 不能冒充義美標示，差異大，保留待實際包裝。",
      "sources": [
        {
          "ref": "BRAND:VINEGAR",
          "title": "義美烏酢 200 ml 官網",
          "url": "https://imec.imeifoods.com.tw/products/blackvinegar200ml",
          "checkedAt": "2026-10-28"
        },
        {
          "ref": "TFDA:P0600701",
          "title": "烏醋",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "dataset": "TFDA_20",
          "recordId": "P0600701",
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；前處理描述:混合均勻(米醋,酒,醬油,果汁,蔬菜汁,糖,鹽等)"
        }
      ],
      "identity": {
        "name": "義美烏醋",
        "brand": ""
      },
      "snapshot": {
        "per100g": {
          "kcal": 0,
          "protein": 0,
          "carbs": 0,
          "fat": 0,
          "sodium": 0
        },
        "perServing": {
          "kcal": 0,
          "protein": 0,
          "carbs": 0,
          "fat": 0,
          "sodium": 0
        },
        "servingSize": 100,
        "servingUnit": "g",
        "weightBasis": "as_sold"
      }
    },
    "name": "義美烏醋",
    "brand": ""
  },
  "black_coffee": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "Nespresso／現煮美式混列；按 100 ml 使用，USDA brewed coffee 是每 100 g，沖煮濃度和密度未知，保留。",
      "sources": [
        {
          "ref": "USDA:171890",
          "title": "Beverages, coffee, brewed, prepared with tap water",
          "url": "https://fdc.nal.usda.gov/food-details/171890/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 171890,
          "checkedAt": "2026-10-28",
          "basis": "每 100 g 可食部；狀態依原始品名"
        }
      ],
      "identity": {
        "name": "黑咖啡",
        "brand": "Nespresso / 現煮美式"
      },
      "snapshot": {
        "unitLabel": "ml",
        "per100g": {
          "kcal": 2,
          "protein": 0.2,
          "carbs": 0.3,
          "fat": 0.0,
          "sodium": 3
        },
        "perServing": {
          "kcal": 2,
          "protein": 0.2,
          "carbs": 0.3,
          "fat": 0.0,
          "sodium": 3
        },
        "servingSize": 100,
        "servingUnit": "ml",
        "weightBasis": "as_sold"
      }
    },
    "name": "黑咖啡",
    "brand": "Nespresso / 現煮美式"
  },
  "yuzu_liqueur": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "160 kcal 不可因 4/9/4 約 87.6 就判錯；酒精另供熱量。梅乃宿現款 8% 約另供 44 kcal／100 ml，但無法解釋自釀或其他濃度；保留，未宣稱 160 已核實。",
      "sources": [
        {
          "ref": "BRAND:YUZU",
          "title": "梅乃宿 Aragoshi Yuzu 官網",
          "url": "https://www.umenoyado.com/en/products/aragoshi-yuzu/",
          "checkedAt": "2026-10-28"
        }
      ],
      "identity": {
        "name": "柚子酒",
        "brand": "日本梅乃宿 / 自釀"
      },
      "snapshot": {
        "unitLabel": "ml",
        "per100g": {
          "kcal": 160,
          "protein": 0.3,
          "carbs": 21.6,
          "fat": 0.0,
          "sodium": 6
        },
        "perServing": {
          "kcal": 48,
          "protein": 0.1,
          "carbs": 6.5,
          "fat": 0.0,
          "sodium": 2
        },
        "servingSize": 30,
        "servingUnit": "ml",
        "weightBasis": "as_sold"
      }
    },
    "name": "柚子酒",
    "brand": "日本梅乃宿 / 自釀"
  },
  "yuzu_jam": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": "2026-10-28",
      "weightBasis": "as_sold",
      "note": "柚子茶醬的糖濃度和品牌不明；20 g／份換算一致，完整標示未核實，保留。",
      "sources": [],
      "identity": {
        "name": "柚子果醬",
        "brand": "韓式黃金柚子茶醬"
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 260,
          "protein": 0.0,
          "carbs": 65.0,
          "fat": 0.0,
          "sodium": 25
        },
        "perServing": {
          "kcal": 52,
          "protein": 0.0,
          "carbs": 13.0,
          "fat": 0.0,
          "sodium": 5
        },
        "servingSize": 20,
        "servingUnit": "g",
        "weightBasis": "as_sold"
      }
    },
    "name": "柚子果醬",
    "brand": "韓式黃金柚子茶醬"
  },
  "ing_1788320414881": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": null,
      "weightBasis": "as_sold",
      "note": "新增基準項目，尚未取得可核對的產品標示或官方對應樣本。",
      "sources": [],
      "identity": {
        "name": "起司",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 393,
          "protein": 25,
          "carbs": 3.6,
          "fat": 32.1,
          "sodium": 643
        },
        "perServing": {
          "kcal": 78.6,
          "protein": 5,
          "carbs": 0.7,
          "fat": 6.4,
          "sodium": 129
        },
        "servingSize": 20,
        "servingUnit": "g",
        "weightBasis": "as_sold"
      }
    },
    "name": "起司",
    "brand": ""
  },
  "ing_1791178416667": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": null,
      "weightBasis": "as_sold",
      "note": "新增基準項目，尚未取得可核對的產品標示或官方對應樣本。",
      "sources": [],
      "identity": {
        "name": "統一肉躁醬",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 709,
          "protein": 1.9,
          "carbs": 16,
          "fat": 70.8,
          "sodium": 2033
        },
        "perServing": {
          "kcal": 78,
          "protein": 0.2,
          "carbs": 1.8,
          "fat": 7.8,
          "sodium": 224
        },
        "servingSize": 11,
        "servingUnit": "g",
        "weightBasis": "as_sold"
      }
    },
    "name": "統一肉躁醬",
    "brand": ""
  },
  "ing_1791259732501": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": null,
      "weightBasis": "as_sold",
      "note": "新增基準項目，尚未取得可核對的產品標示或官方對應樣本。",
      "sources": [],
      "identity": {
        "name": "金芝麻沙拉醬",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 539,
          "protein": 4,
          "carbs": 14.6,
          "fat": 51.6,
          "sodium": 984
        },
        "perServing": {
          "kcal": 81,
          "protein": 0.6,
          "carbs": 2.2,
          "fat": 7.7,
          "sodium": 148
        },
        "servingSize": 15,
        "servingUnit": "g",
        "weightBasis": "as_sold"
      }
    },
    "name": "金芝麻沙拉醬",
    "brand": ""
  },
  "ing_1791259841726": {
    "evidence": {
      "kind": "missing",
      "status": "pending",
      "checkedAt": null,
      "weightBasis": "as_sold",
      "note": "新增基準項目，尚未取得可核對的產品標示或官方對應樣本。",
      "sources": [],
      "identity": {
        "name": "炸醬",
        "brand": "維力"
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 450.7,
          "protein": 12.7,
          "carbs": 15.6,
          "fat": 37.5,
          "sodium": 3290
        },
        "perServing": {
          "kcal": 113,
          "protein": 3.2,
          "carbs": 3.9,
          "fat": 9.4,
          "sodium": 823
        },
        "servingSize": 25,
        "servingUnit": "g",
        "weightBasis": "as_sold"
      }
    },
    "name": "炸醬",
    "brand": "維力"
  },
  "white_rice": {
    "name": "白飯（熟重）",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "cooked",
      "note": "無加鹽熟白飯；與糙米飯分開。",
      "sources": [
        {
          "ref": "USDA:169757",
          "title": "Rice, white, long-grain, unenriched, cooked without salt",
          "url": "https://fdc.nal.usda.gov/food-details/169757/nutrients",
          "dataset": "USDA_SR_LEGACY",
          "recordId": 169757,
          "checkedAt": "2026-11-05",
          "basis": "每100g熟白米飯可食部、無加鹽"
        }
      ],
      "identity": {
        "name": "白飯（熟重）",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 130,
          "protein": 2.69,
          "carbs": 28.17,
          "fat": 0.28,
          "sodium": 1
        },
        "weightBasis": "cooked"
      }
    }
  },
  "snow_white_mushroom": {
    "name": "雪白菇",
    "brand": "",
    "evidence": {
      "kind": "database",
      "status": "estimated",
      "checkedAt": "2026-11-05",
      "weightBasis": "raw",
      "note": "生雪白菇，與鴻喜菇分開。",
      "sources": [
        {
          "ref": "TFDA:G0600101",
          "title": "雪白菇(長)",
          "url": "https://data.fda.gov.tw/data/opendata/export/20/json",
          "catalogUrl": "https://data.gov.tw/dataset/8543",
          "dataset": "TFDA_20",
          "recordId": "G0600101",
          "checkedAt": "2026-11-05",
          "basis": "每100g生雪白菇可食部"
        }
      ],
      "identity": {
        "name": "雪白菇",
        "brand": ""
      },
      "snapshot": {
        "unitLabel": "g",
        "per100g": {
          "kcal": 36,
          "protein": 2.1,
          "carbs": 6.9,
          "fat": 0.4,
          "sodium": 1
        },
        "weightBasis": "raw"
      }
    }
  }
};
