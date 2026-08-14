import json

missing = {
    'shrimp_paste': {'name': '蝦仁漿', 'category': 'proteins'},
    'smoked_sea_salt': {'name': '煙燻海鹽', 'category': 'sauces'},
    'nori_strips': {'name': '海苔絲', 'category': 'veggies'},
    'udon_noodles': {'name': '烏龍麵', 'category': 'carbs'},
    'prince_noodles': {'name': '王子麵', 'category': 'carbs'},
    'avocado_mash': {'name': '酪梨泥', 'category': 'veggies'},
    'cherry_tomatoes': {'name': '小番茄', 'category': 'veggies'},
    'bean_sprouts': {'name': '黃豆芽', 'category': 'veggies'},
    'frozen_tofu': {'name': '凍豆腐', 'category': 'proteins'},
    'beef_chuck': {'name': '牛板腱', 'category': 'proteins'},
    'sweet_potato': {'name': '地瓜', 'category': 'carbs'},
    'spicy_mayo': {'name': '辣美乃滋', 'category': 'sauces'},
    'soy_sauce': {'name': '醬油', 'category': 'sauces'},
    'edamame': {'name': '毛豆', 'category': 'proteins'},
    'salmon': {'name': '鮭魚', 'category': 'proteins'},
    'full_fat_milk_250': {'name': '全脂鮮奶', 'category': 'proteins'},
    'steamed_noodle': {'name': '蒸煮麵', 'category': 'carbs'},
    'crab_stick': {'name': '蟹肉棒', 'category': 'proteins'},
    'shacha_sauce': {'name': '沙茶醬', 'category': 'sauces'},
    'maple_syrup': {'name': '楓糖漿', 'category': 'sauces'},
    'chicken': {'name': '雞肉', 'category': 'proteins'}
}

with open("src/data/ingredients.json", "r") as f:
    ingr = json.load(f)

for id, data in missing.items():
    cat = data['category']
    # fallback to some default nutrition
    new_item = {
        "id": id,
        "name": data['name'],
        "category": cat,
        "unitLabel": "g",
        "per100g": {"kcal": 100, "protein": 10, "fat": 5, "carbs": 10, "sodium": 100}
    }
    if cat not in ingr:
        ingr[cat] = []
    # check if already exists
    if not any(i['id'] == id for i in ingr[cat]):
        ingr[cat].append(new_item)

with open("src/data/ingredients.json", "w", encoding="utf-8") as f:
    json.dump(ingr, f, ensure_ascii=False, indent=2)

print("Updated ingredients.json")
