import { INGREDIENT_PHOTO_DB, hydrateIngredientPhotos } from './IngredientPhotoStore.js?v=20261106_INGREDIENT_PHOTO_REOPEN_V1';

const cacheKey = 'kitchen_v2_ingredients.json';
const customKey = 'kitchen_v2_custom_ingredients';
const categories = ['proteins', 'veggies', 'carbs', 'sauces'];
const fields = ['photoUrl', 'photo'];

async function readDevicePhotos(indexedDB) {
    if (!indexedDB) return { status: '無法讀取', photos: new Map() };
    let database;
    try {
        if (indexedDB.databases) {
            const databases = await indexedDB.databases();
            if (!databases.some(item => item.name === INGREDIENT_PHOTO_DB)) {
                return { status: '沒有照片資料庫', photos: new Map() };
            }
        }
        database = await new Promise((resolve, reject) => {
            let absent = false;
            let blocked = false;
            const request = indexedDB.open(INGREDIENT_PHOTO_DB);
            // Aborting creation leaves an absent database absent.
            request.onupgradeneeded = () => { absent = true; request.transaction.abort(); };
            request.onerror = () => absent ? resolve(null) : reject(request.error);
            request.onblocked = () => { blocked = true; reject(new Error('照片資料庫使用中')); };
            request.onsuccess = () => {
                if (blocked) request.result.close();
                else resolve(request.result);
            };
        });
        if (!database) return { status: '沒有照片資料庫', photos: new Map() };
        const photos = await new Promise((resolve, reject) => {
            const transaction = database.transaction('photos', 'readonly');
            const store = transaction.objectStore('photos');
            const keys = store.getAllKeys();
            const blobs = store.getAll();
            transaction.oncomplete = () => resolve(new Map(keys.result.map((key, index) => [key, blobs.result[index]])));
            transaction.onabort = transaction.onerror = () => reject(transaction.error);
        });
        return { status: '已讀取', photos };
    } catch {
        return { status: '無法讀取', photos: new Map() };
    } finally {
        database?.close();
    }
}

export async function inspectIngredientPhotos({
    ingredients, storage = localStorage, indexedDB = globalThis.indexedDB, appVersion
}) {
    const records = new Map();
    const sources = [];
    const device = await readDevicePhotos(indexedDB);
    const verified = new Map();
    const referenced = new Set();
    const photoStore = { get: async id => device.photos.get(id) };

    async function photoStatus(item, field) {
        const value = item[field];
        const id = item.localPhotoRefs?.[field];
        if (id) referenced.add(id);
        if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
            try { return '圖片連結（' + new URL(value).hostname + '）'; }
            catch { return '圖片連結格式錯誤'; }
        }
        if (typeof value === 'string' && /^data:image\//i.test(value)) return '舊內嵌照片';
        if (id) {
            if (device.status === '無法讀取') return '裝置備份無法讀取';
            if (!verified.has(id)) {
                const image = { localPhotoRefs: { [field]: id } };
                try {
                    await hydrateIngredientPhotos(image, photoStore);
                    verified.set(id, true);
                } catch {
                    verified.set(id, false);
                }
            }
            return verified.get(id) ? '裝置備份可讀' : '裝置備份遺失或損壞';
        }
        if (typeof value === 'string' && value.startsWith('blob:')) return '暫存連結缺少備份紀錄';
        if (value) return '其他圖片路徑';
        return '沒有照片紀錄';
    }

    async function collect(source, value) {
        const items = Array.isArray(value) ? value : categories.flatMap(category => value?.[category] || []);
        sources.push({ source, count: items.length });
        for (const item of items) {
            if (!item || typeof item.id !== 'string') continue;
            const hasPhoto = fields.some(field => item[field] || item.localPhotoRefs?.[field]);
            const current = source === '目前畫面';
            if (!current && !hasPhoto) continue;
            if (!records.has(item.id)) records.set(item.id, { id: item.id, name: item.name || item.id, current, records: [] });
            if (!hasPhoto) continue;
            const photos = {};
            for (const field of fields) photos[field] = await photoStatus(item, field);
            records.get(item.id).records.push({ source, photos });
        }
    }

    function read(key) {
        try {
            const text = storage.getItem(key);
            return text === null ? null : JSON.parse(text);
        } catch {
            sources.push({ source: key, error: '無法讀取或格式錯誤' });
            return null;
        }
    }

    await collect('目前畫面', ingredients || []);
    for (const key of [cacheKey, customKey, cacheKey + '_pre_nutrition_v1']) {
        const value = read(key);
        if (value !== null) await collect(key, value);
    }
    for (const key of ['kitchen_v2_nutrition_edit_backup', 'kitchen_v2_ingredient_baseline_20261103']) {
        const backup = read(key);
        for (const snapshot of ['before', 'original']) {
            for (const itemKey of [cacheKey, customKey]) {
                const text = backup?.[snapshot]?.[itemKey];
                if (typeof text !== 'string') continue;
                const source = key + '/' + snapshot + '/' + itemKey;
                try { await collect(source, JSON.parse(text)); }
                catch { sources.push({ source, error: '備份格式錯誤' }); }
            }
        }
    }

    const items = [...records.values()];
    const hasCurrentPhoto = item => item.records.some(record => record.source === '目前畫面');
    return {
        appVersion,
        summary: {
            currentWithPhotoRecord: items.filter(hasCurrentPhoto).length,
            storedElsewhere: items.filter(item => item.records.length && !hasCurrentPhoto(item)).length
        },
        checkedAt: new Date().toISOString(),
        note: 'records 空白表示未找到照片紀錄。圖片連結尚未檢查遠端內容。備份紀錄不會自動還原到目前食材。',
        devicePhotos: {
            status: device.status,
            count: device.status === '無法讀取' ? null : device.photos.size,
            unreferencedCount: device.status === '無法讀取' ? null : [...device.photos.keys()].filter(id => !referenced.has(id)).length
        },
        sources,
        ingredients: items
    };
}
