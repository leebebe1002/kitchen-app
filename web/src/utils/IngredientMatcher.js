/**
 * 🔍 IngredientMatcher.js
 * 食材名稱去重、模糊比對與核心詞辨識工具
 */

// 常見繁簡食材文字映射
const SIMPLIFIED_TO_TRADITIONAL = {
    '葱': '蔥',
    '麪': '麵',
    '面': '麵',
    '鸡': '雞',
    '猪': '豬',
    '虾': '蝦',
    '鱼': '魚',
    '酱': '醬',
    '卤': '滷',
    '盐': '鹽',
    '饭': '飯',
    '奶': '奶',
    '坚': '堅'
};

// 常見食材品質、狀態與來源修飾前綴 (由長到短排序)
const COMMON_PREFIXES = [
    '非基因改造',
    '非基改',
    '產銷履歷',
    '產銷',
    '履歷',
    '有機',
    '生鮮',
    '冷凍',
    '冷藏',
    '進口',
    '國產',
    '特選',
    '精選',
    '新鮮',
    '天然',
    '熟凍',
    '無糖',
    '減鹽',
    '低脂',
    '純'
];

// 常見型態、包裝與規格後綴 (由長到短排序)
const COMMON_SUFFIXES = [
    '(非油炸)',
    '（非油炸）',
    '(盒裝)',
    '（盒裝）',
    '(袋裝)',
    '（袋裝）',
    '(包裝)',
    '（包裝）',
    '(罐裝)',
    '（罐裝）',
    '盒裝',
    '袋裝',
    '包裝',
    '罐裝',
    '瓶裝',
    '切片',
    '薄片',
    '肉片',
    '碎肉',
    '切丁',
    '絞肉',
    '去骨',
    '去皮',
    '塊',
    '丁',
    '絲',
    '末',
    '粒'
];

/**
 * 1. 基礎文字清洗與標準化
 * - 全形英數符號轉半形
 * - 簡體轉繁體常用字
 * - 移除所有空白、標點符號及括號
 * - 轉小寫
 */
export function normalizeIngredientName(name) {
    if (!name || typeof name !== 'string') return '';
    let res = name.trim();

    // 全形轉半形
    res = res.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
    res = res.replace(/\u3000/g, ' ');

    // 繁簡常用字轉換
    for (const [s, t] of Object.entries(SIMPLIFIED_TO_TRADITIONAL)) {
        res = res.split(s).join(t);
    }

    // 轉小寫並過濾標點符號與空白
    res = res.toLowerCase().replace(/[\s\(\)（）\[\]【】\-_/\\,，.。:：;；!！?？]/g, '');
    return res;
}

/**
 * 2. 抽取食材「核心主詞」
 * 例如：「有機洋蔥」->「洋蔥」、「辛拉麵(非油炸)」->「辛拉麵」、「牛肉片」->「牛肉」
 */
export function extractCoreName(name) {
    let core = normalizeIngredientName(name);
    if (!core) return '';

    let changed = true;
    while (changed) {
        changed = false;
        // 剝離前綴
        for (const prefix of COMMON_PREFIXES) {
            const cleanPrefix = normalizeIngredientName(prefix);
            if (core.length > cleanPrefix.length + 1 && core.startsWith(cleanPrefix)) {
                core = core.slice(cleanPrefix.length);
                changed = true;
                break;
            }
        }
        // 剝離後綴
        for (const suffix of COMMON_SUFFIXES) {
            const cleanSuffix = normalizeIngredientName(suffix);
            if (core.length > cleanSuffix.length + 1 && core.endsWith(cleanSuffix)) {
                core = core.slice(0, -cleanSuffix.length);
                changed = true;
                break;
            }
        }
    }
    return core;
}

/**
 * 計算兩字串的二元字元 (Bigram) Dice 係數相似度 (0 ~ 1)
 */
function diceCoefficient(str1, str2) {
    if (str1 === str2) return 1.0;
    if (str1.length < 2 || str2.length < 2) return str1 === str2 ? 1.0 : 0.0;

    const bigrams1 = new Map();
    for (let i = 0; i < str1.length - 1; i++) {
        const bg = str1.slice(i, i + 2);
        bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
    }

    let intersection = 0;
    for (let i = 0; i < str2.length - 1; i++) {
        const bg = str2.slice(i, i + 2);
        const count = bigrams1.get(bg) || 0;
        if (count > 0) {
            bigrams1.set(bg, count - 1);
            intersection++;
        }
    }

    const total = (str1.length - 1) + (str2.length - 1);
    return (2 * intersection) / total;
}

/**
 * 3. 綜合相似度評分 (0 ~ 1)
 */
export function calculateIngredientSimilarity(name1, name2) {
    const norm1 = normalizeIngredientName(name1);
    const norm2 = normalizeIngredientName(name2);

    if (!norm1 || !norm2) return 0;
    if (norm1 === norm2) return 1.0;

    const core1 = extractCoreName(norm1);
    const core2 = extractCoreName(norm2);

    // 核心主詞完全一致 (如「有機洋蔥」vs「洋蔥」，或「洋蔥丁」vs「洋蔥」)
    if (core1 && core2 && core1 === core2) {
        return 0.95;
    }

    // 包含關係 (例如「非油炸辛拉麵」包含「辛拉麵」)
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
        const shorter = norm1.length < norm2.length ? norm1 : norm2;
        const longer = norm1.length >= norm2.length ? norm1 : norm2;
        return 0.82 + (shorter.length / longer.length) * 0.12;
    }

    // 核心詞包含關係
    if (core1 && core2 && (core1.includes(core2) || core2.includes(core1))) {
        return 0.80;
    }

    // 文字 Bigram 相似度
    const dice = diceCoefficient(norm1, norm2);
    return dice;
}

/**
 * 4. 尋找與輸入名稱相似的既有食材
 * @param {string} inputName 使用者輸入的名稱
 * @param {Array} allIngredients 所有食材陣列
 * @param {string|null} currentId 當前正在編輯的食材 ID (若為編輯模式則排除自身)
 * @returns {{ exactMatch: Object|null, similarMatches: Array<{ ingredient: Object, similarity: number, reason: string }> }}
 */
export function findSimilarIngredients(inputName, allIngredients = [], currentId = null) {
    const cleanInput = (inputName || '').trim();
    if (!cleanInput) {
        return { exactMatch: null, similarMatches: [] };
    }

    const normInput = normalizeIngredientName(cleanInput);
    const coreInput = extractCoreName(cleanInput);

    let exactMatch = null;
    const candidates = [];

    for (const ing of allIngredients) {
        if (!ing || !ing.name) continue;
        if (currentId && ing.id === currentId) continue;

        const normTarget = normalizeIngredientName(ing.name);
        const coreTarget = extractCoreName(ing.name);

        // 1. 完全一致
        if (normInput === normTarget) {
            exactMatch = ing;
            continue;
        }

        // 2. 相似度計算
        const score = calculateIngredientSimilarity(cleanInput, ing.name);

        if (score >= 0.70) {
            let reason = '名稱高度相似';
            if (coreInput && coreTarget && coreInput === coreTarget) {
                reason = `核心品項皆為「${coreInput}」`;
            } else if (normInput.includes(normTarget) || normTarget.includes(normInput)) {
                reason = '品名包含既有食材';
            }

            candidates.push({
                ingredient: ing,
                similarity: score,
                reason
            });
        }
    }

    // 依相似度由高到低排序，最多取 4 筆
    candidates.sort((a, b) => b.similarity - a.similarity);

    return {
        exactMatch,
        similarMatches: candidates.slice(0, 4)
    };
}
