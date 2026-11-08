import { isRetiredOfficialIngredient } from './Fk14OfficialNutritionRepair.js?v=20261108_FK14_COCOA_RETIRED_V1';
import { approvedIngredientBaseline } from './IngredientBaselineUpdate.js?v=20261108_FK14_COCOA_RETIRED_V1';
import { evidenceSnapshot, nutrientKeys } from './NutritionEvidence.js?v=20261105_DEFAULT_ESTIMATES_V1';
import { applySharedNutrition } from './SharedIngredientNutrition.js?v=20261108_FK14_SHARED_NUTRITION_V1';

const categories = ['proteins', 'veggies', 'carbs', 'sauces'];
const fields = ['unitLabel', 'isCount', 'per100g', 'perServing', 'perUnit',
    'servingSize', 'servingUnit', 'gramsPerPack', 'gramsPerUnit', 'weightBasis'];
const nutrients = new Set(nutrientKeys);
const labels = {
    unitLabel: '計量單位', isCount: '是否按顆／包', per100g: '每 100 單位',
    perServing: '每份', perUnit: '每個單位', servingSize: '每份數量',
    servingUnit: '每份單位', gramsPerPack: '每包克數',
    gramsPerUnit: '每個克數', weightBasis: '生熟／乾重基準',
    kcal: '熱量', protein: '蛋白質', carbs: '碳水', fat: '脂肪', sodium: '鈉'
};
const own = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const display = value => value === undefined ? '未設定'
    : value === null ? 'null' : typeof value === 'boolean' ? String(value)
    : typeof value === 'object' ? JSON.stringify(value) : String(value);
const comparable = (value, nutrient = false) => {
    if (value === undefined) return 'missing';
    if (value === null) return 'null';
    if (nutrient && typeof value !== 'boolean' && value !== '' && Number.isFinite(Number(value)))
        return 'number:' + Number(value);
    return typeof value + ':' + JSON.stringify(value);
};
function differences(expected, actual) {
    const out = [];
    for (const field of fields) {
        const a = own(expected, field) ? expected[field] : undefined;
        const b = own(actual, field) ? actual[field] : undefined;
        if (field.startsWith('per')) {
            for (const nutrient of nutrientKeys) {
                const left = own(a,nutrient) ? a[nutrient] : undefined;
                const right = own(b,nutrient) ? b[nutrient] : undefined;
                if (comparable(left,true) !== comparable(right,true))
                    out.push({ field: `${field}.${nutrient}`, expected:display(left), actual:display(right) });
            }
            if ((a === undefined) !== (b === undefined) && !out.some(x=>x.field.startsWith(field+'.')))
                out.push({ field, expected:display(a), actual:display(b) });
        } else if (comparable(a) !== comparable(b)) {
            out.push({ field, expected:display(a), actual:display(b) });
        }
    }
    return out;
}
const activeRows = engine => {
    const list = engine?.data?.ingredients;
    if (!Array.isArray(list)) throw Error('目前食材清單尚未載入，請重新開啟 FK。');
    return list.map(item => ({
        id: item?.id, name: item?.name,
        nutrition: evidenceSnapshot(item)
    }));
};
const flatten = obj => categories.flatMap(cat => obj[cat] || []);
const validIdentity = engine => engine.hasPersonalAccess() && engine.personalContext
    && engine.auth.isCurrentContext(engine.personalContext);

/** An explicit, read-only comparison of current calculator values to freshly fetched
 * SHA-approved official values plus currently verified cloud overrides.
 * Does not inspect, clear, save, or migrate localStorage.
 */
export async function auditIngredientNutrition(engine, { fetcher = fetch } = {}) {
    if (!validIdentity(engine)) throw Error('請先確認 FK 登入與家庭權限，再執行比對。');
    const context = engine.personalContext;
    const generation = engine.personalScopeGeneration;
    const current = activeRows(engine);
    const before = JSON.stringify(current);
    const assertCurrent = () => {
        if (engine.personalContext !== context || engine.personalScopeGeneration !== generation
            || !validIdentity(engine) || JSON.stringify(activeRows(engine)) !== before)
            throw Error('檢查期間登入或食材資料已變更，未產生結論；請重新檢查。');
    };
    const url = new URL('../../../src/data/ingredients.json', import.meta.url);
    const response = await fetcher(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response?.ok) throw Error('無法讀取最新 GitHub 食材基準，未產生比對結論。');
    const official = await approvedIngredientBaseline(await response.text());
    const expectedRows = flatten(official);
    if (expectedRows.length !== 100 || new Set(expectedRows.map(i => i.id)).size !== 100)
        throw Error('GitHub 官方食材不是預期的 100 項，未產生比對結論。');
    assertCurrent();
    const sharedRows = await engine.sharedNutritionService.list();
    if (!Array.isArray(sharedRows)) throw Error('共用營養修正沒有讀取成功，未產生比對結論。');
    assertCurrent();
    const expected = new Map(expectedRows.map(item => [item.id, {...item}]));
    const officialById = new Map(expectedRows.map(item => [item.id, item]));
    const overridden = new Set();
    for (const row of sharedRows) {
        if (isRetiredOfficialIngredient(row.ingredient_id)) continue;
        const item = expected.get(row.ingredient_id);
        if (!item || overridden.has(row.ingredient_id)
            || !applySharedNutrition(item, row, officialById.get(row.ingredient_id)))
            throw Error('共用營養資料有無法核對的食材，未產生比對結論。');
        overridden.add(row.ingredient_id);
    }
    const byId = new Map();
    for (const item of current) {
        if (!byId.has(item.id)) byId.set(item.id, []);
        byId.get(item.id).push(item);
    }
    const mismatch = [];
    let same = 0;
    let missing = 0;
    let duplicates = 0;
    for (const item of expectedRows) {
        const local = byId.get(item.id) || [];
        if (local.length === 0) {
            missing++;
            mismatch.push({id:item.id,name:item.name,reason:'手機計算清單缺少這項官方食材',fields:[]});
            continue;
        }
        if (local.length !== 1) {
            duplicates++;
            mismatch.push({id:item.id,name:item.name,reason:'手機同一 ID 出現重複食材',fields:[]});
            continue;
        }
        const fieldDiff = differences(evidenceSnapshot(expected.get(item.id)),local[0].nutrition);
        if (fieldDiff.length) mismatch.push({
            id:item.id,name:item.name,
            reason:overridden.has(item.id) ? '與已核對的共用營養修正不同' : '與 GitHub 官方基準不同',
            fields:fieldDiff
        });
        else same++;
    }
    const extras = current.filter(item=>!expected.has(item.id)).map(item=>({id:item.id,name:item.name}));
    assertCurrent();
    return {
        officialCount:expectedRows.length, sharedCount:overridden.size,
        matched:same, different:mismatch.length, missing, duplicates,
        privateCount:extras.length, differences:mismatch, privateIngredients:extras,
        scope:engine.personalScope
    };
}
export function formatIngredientNutritionAudit(report, appVersion = '') {
    const title = `FK 食材營養唯讀比對｜App ${appVersion}`;
    const lines = [
        title,
        '基準：重新下載且通過 SHA-256 驗證的 GitHub 官方食材，加上最新 Supabase 已核對共用修正',
        `官方食材：${report.officialCount} 項；共用修正：${report.sharedCount} 項`,
        `營養與重量基準一致：${report.matched} 項；有差異／缺少／重複：${report.different} 項`,
        `其中官方食材缺少：${report.missing} 項；同 ID 重複：${report.duplicates} 項`,
        `額外本機私房食材：${report.privateCount} 項（不計入官方 ${report.officialCount} 項一致率）`,
        '此檢查只比對實際計算使用的營養與份量基準，不代表來源數據已完成科學正確性稽核。',
        '此檢查完全唯讀，沒有修改食材、照片、庫存或採買。'
    ];
    for (const item of report.differences) {
        lines.push('',`- ${item.name} [${item.id}]：${item.reason}`);
        for (const diff of item.fields)
            lines.push(`  ${diff.field.split('.').map(x=>labels[x]||x).join('／')}：手機 ${diff.actual}；基準 ${diff.expected}`);
    }
    if(report.privateCount) {
        lines.push('', `裝置額外的私房食材（不屬於官方 ${report.officialCount} 項）：`);
        for(const item of report.privateIngredients) lines.push(`- ${item.name} [${item.id}]`);
    }
    return lines.join('\n');
}
