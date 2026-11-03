// Account caches never adopt the old shared daily_logs or static family history.
const prefix = 'kitchen_v2_meals_';
export const emptyMealState = () => ({ logs: [], pending: [] });
export function readMealState(userId) {
    if (!userId) throw new Error('尚未確認餐點帳號。');
    const raw = localStorage.getItem(prefix + userId);
    if (raw === null) return emptyMealState();
    const state = JSON.parse(raw);
    const object = value => value && typeof value === 'object' && !Array.isArray(value);
    if (!object(state) || state.userId !== userId || !Array.isArray(state.logs) || !Array.isArray(state.pending)
        || state.logs.some(day => !object(day) || typeof day.date !== 'string' || !object(day.diners)
            || Object.values(day.diners).some(log => !object(log) || !Array.isArray(log.meals)))
        || state.pending.some(item => !object(item) || !['save', 'delete'].includes(item.operation)
            || !['bebe', 'ariel', 'jason'].includes(item.member) || typeof item.id !== 'string'
            || typeof item.date !== 'string' || !object(item.meal) || typeof item.mutationId !== 'string')) {
        throw new Error('餐點快取格式或帳號不符，原資料已保留。');
    }
    return state;
}
export function writeMealState(userId, state) {
    readMealState(userId); // I/O and malformed primary must never become empty initialization.
    const serialized = JSON.stringify({ ...state, userId });
    if (serialized.includes('data:image/')) throw new Error('餐點快取不可儲存 Base64 照片。');
    const current = localStorage.getItem(prefix + userId);
    if (current !== null) localStorage.setItem(prefix + userId + '_backup', current);
    localStorage.setItem(prefix + userId, serialized);
}
