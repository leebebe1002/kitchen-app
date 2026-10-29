// Historical nutrition shapes from ingredients.json at 4b6f0d0; recognition only, never calculation.
const legacyNutrition = {
    "sous_vide_chicken": {"unitLabel":"g","per100g":{"kcal":115,"protein":23,"fat":1.5,"carbs":0,"sodium":180}},
    "plain_yogurt": {"unitLabel":"g","per100g":{"kcal":61,"protein":4,"fat":3.3,"carbs":4.7,"sodium":46}},
    "frozen_tofu": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "edamame": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "salmon": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "full_fat_milk_250": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "crab_stick": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "black_fungus": {"unitLabel":"g","per100g":{"kcal":25,"protein":1,"fat":0.2,"carbs":6.5,"sodium":10}},
    "baby_corn": {"unitLabel":"g","per100g":{"kcal":31,"protein":1.5,"fat":0.3,"carbs":6.5,"sodium":2}},
    "chinese_cabbage": {"unitLabel":"g","per100g":{"kcal":13,"protein":1.2,"fat":0.2,"carbs":2.4,"sodium":15}},
    "mushroom": {"unitLabel":"g","per100g":{"kcal":38,"protein":3.1,"fat":0.3,"carbs":6.8,"sodium":6}},
    "nori_strips": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "cherry_tomatoes": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "bean_sprouts": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "scallion": {"unitLabel":"g","per100g":{"kcal":32,"protein":1.8,"fat":0.2,"carbs":7.3,"sodium":10}},
    "green_pepper_noodle": {"unitLabel":"包","isCount":true,"perServing":{"kcal":390.9,"protein":13.1,"fat":7.7,"carbs":67.3,"sodium":1070.1}},
    "potato": {"unitLabel":"g","per100g":{"kcal":77,"protein":2,"fat":0.1,"carbs":17,"sodium":6}},
    "sweet_potato": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "steamed_noodle": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "sesame_powder": {"unitLabel":"g","per100g":{"kcal":570,"protein":18,"fat":49,"carbs":23,"sodium":5}},
    "cocoa_powder": {"unitLabel":"g","per100g":{"kcal":228,"protein":20,"fat":14,"carbs":58,"sodium":20}},
    "smoked_sea_salt": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "soy_sauce": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "shacha_sauce": {"unitLabel":"g","per100g":{"kcal":100,"protein":10,"fat":5,"carbs":10,"sodium":100}},
    "olive_oil": {"unitLabel":"g","per100g":{"kcal":884,"protein":0,"fat":100,"carbs":0,"sodium":0}},
    "coffee_capsule": {"unitLabel":"顆","per100g":{"kcal":124,"protein":1.9,"fat":0.0,"carbs":28.7,"sodium":110},"perServing":{"kcal":20,"protein":0.3,"fat":0.0,"carbs":4.6,"sodium":18},"servingSize":16,"servingUnit":"ml"}
};

const nutritionFields = ['unitLabel', 'isCount', 'per100g', 'perServing', 'perUnit', 'servingSize', 'servingUnit', 'gramsPerPack'];
const nutrientKeys = ['kcal', 'protein', 'fat', 'carbs', 'sodium'];

export function nutritionSnapshot(ingredient) {
    return Object.fromEntries(nutritionFields.filter(key => ingredient?.[key] !== undefined).map(key => {
        const value = ingredient[key];
        return [key, key.startsWith('per') && value && typeof value === 'object'
            ? Object.fromEntries(nutrientKeys.filter(n => value[n] !== undefined).map(n => [n, value[n]]))
            : value];
    }));
}

export function sameNutrition(a, b) {
    return JSON.stringify(nutritionSnapshot(a)) === JSON.stringify(nutritionSnapshot(b));
}

export function mergeIngredientNutrition(official, local, custom) {
    if (custom && !local?.nutritionCache) local = { ...local, ...custom };
    const base = nutritionSnapshot(official);
    if (!local) return { ...JSON.parse(JSON.stringify(official)), nutritionCache: { base, edited: false } };
    const record = local.nutritionCache;
    // Old custom-list entries are evidence of an explicit save, even if equal to an old default.
    const edited = record?.edited === true || (!record && !!custom);
    // Only the confirmed canonical noodle is renamed; do not generalize brand/identity overrides.
    const canonicalNoodleUpgrade = official.id === 'steamed_noodle'
        && official.name === '維力蒸煮麵' && official.brand === '維力'
        && local.name === '蒸煮麵' && !local.brand && !custom;
    const sameIdentity = canonicalNoodleUpgrade ||
        ['name', 'brand'].every(key => (local[key] || '') === (official[key] || ''));
    const sameBasis = !local.weightBasis || local.weightBasis === 'unknown' || local.weightBasis === official.weightBasis;
    const knownDefault = sameIdentity && sameBasis && (sameNutrition(local, official)
        || (record?.edited === false && sameNutrition(local, record.base))
        || (!record && legacyNutrition[official.id] && sameNutrition(local, legacyNutrition[official.id])));
    const refresh = !edited && knownDefault;
    const merged = { ...official, ...local };
    if (refresh && canonicalNoodleUpgrade) {
        merged.name = official.name;
        merged.brand = official.brand;
    }
    // Nutrition is atomic: never graft a new perUnit onto a user's different perServing.
    for (const key of nutritionFields) {
        delete merged[key];
        if ((refresh ? official : local)[key] !== undefined) merged[key] = (refresh ? official : local)[key];
    }
    merged.nutritionCache = { base, edited: edited || !knownDefault };
    merged.nutritionReviewRequired = !refresh && (!!local.nutritionReviewRequired || (!edited && (!sameBasis || !sameNutrition(local, official))));
    if (refresh) {
        if (!local.weightBasis || local.weightBasis === 'unknown' || local.weightBasis === official.weightBasis) {
            merged.weightBasis = official.weightBasis;
            merged.weightBasisSource = official.weightBasisSource;
        }
    } else if (!sameIdentity || !sameNutrition(local, official)) {
        merged.weightBasis = local.weightBasis || 'unknown';
        // The official citation cannot certify locally different values.
        merged.weightBasisSource = '';
    }
    return JSON.parse(JSON.stringify(merged));
}
