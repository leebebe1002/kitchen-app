export const INGREDIENT_PHOTO_DB = 'fk_ingredient_photos';
const imageFields = ['photoUrl', 'photo'];
const dataUrl = value => typeof value === 'string' && /^\s*data:[^,]*,/i.test(value);
let database;
const urls = new Map();

function openDatabase() {
    if (!database) database = new Promise((resolve, reject) => {
        let failed = false;
        const request = indexedDB.open(INGREDIENT_PHOTO_DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore('photos');
        request.onerror = request.onblocked = () => { failed = true; database = null; reject(new Error('無法開啟裝置照片備份，原資料未更動。')); };
        request.onsuccess = () => {
            const db = request.result;
            if (failed) { db.close(); return; }
            db.onversionchange = () => { db.close(); database = null; };
            resolve(db);
        };
    });
    return database;
}

export const ingredientPhotoStore = {
    async put(id, blob) {
        const db = await openDatabase();
        await new Promise((resolve, reject) => {
            const transaction = db.transaction('photos', 'readwrite');
            transaction.objectStore('photos').put(blob, id);
            transaction.oncomplete = resolve;
            transaction.onabort = transaction.onerror = () => reject(new Error('照片備份未完成，原資料未更動。'));
        });
    },
    async get(id) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const request = db.transaction('photos', 'readonly').objectStore('photos').get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error('無法讀取裝置照片備份，請保留原資料。'));
        });
    }
};

async function photoId(blob) {
    const bytes = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return blob.type + ':' + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function verifiedPhoto(id, store) {
    const blob = await store.get(id);
    if (!(blob instanceof Blob) || await photoId(blob) !== id) throw new Error('照片備份未通過核對，請保留原資料並重試。');
    return blob;
}

export function hasEmbeddedIngredientPhoto(value) {
    if (dataUrl(value)) return true;
    return value && typeof value === 'object' && Object.values(value).some(hasEmbeddedIngredientPhoto);
}

export function serializeIngredientPhotos(value) {
    return JSON.stringify(value, function (key, item) {
        if (dataUrl(item)) throw new Error('舊照片尚未備份，食材原件已保留。');
        if (imageFields.includes(key) && typeof item === 'string' && item.startsWith('blob:')) {
            if (!this.localPhotoRefs?.[key]) throw new Error('照片缺少裝置備份，原資料未更動。');
            return null; // Object URLs are view-only; durable references point to binary photos.
        }
        return item;
    });
}

export async function prepareIngredientPhotoBackup(source, store = ingredientPhotoStore) {
    const before = {};
    const verified = new Set();
    async function convert(value) {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { for (const item of value) await convert(item); return; }
        for (const field of imageFields) {
            if (dataUrl(value[field])) {
                const match = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(value[field].trim());
                if (!match) throw new Error('舊照片格式無法辨識，原照片與食材已保留。');
                const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
                const blob = new Blob([bytes], { type: match[1].toLowerCase() });
                const id = await photoId(blob);
                if (!verified.has(id)) {
                    await store.put(id, blob);
                    await verifiedPhoto(id, store);
                    verified.add(id);
                }
                value.localPhotoRefs = { ...value.localPhotoRefs, [field]: id };
                value[field] = null;
            }
        }
        for (const id of Object.values(value.localPhotoRefs || {})) if (!verified.has(id)) {
            await verifiedPhoto(id, store);
            verified.add(id);
        }
        for (const item of Object.values(value)) await convert(item);
    }
    for (const [key, raw] of Object.entries(source)) {
        if (raw === null) { before[key] = null; continue; }
        const parsed = JSON.parse(raw);
        if (!hasEmbeddedIngredientPhoto(parsed)) {
            await convert(parsed); // Existing local references must still be readable.
            before[key] = raw;
        } else {
            await convert(parsed);
            before[key] = serializeIngredientPhotos(parsed);
        }
    }
    return { source, before };
}

export async function hydrateIngredientPhotos(value, store = ingredientPhotoStore) {
    if (!value || typeof value !== 'object') return value;
    if (!Array.isArray(value)) for (const [field, id] of Object.entries(value.localPhotoRefs || {})) {
        if (!imageFields.includes(field) || (value[field] && !value[field].startsWith('blob:'))) continue;
        const blob = await verifiedPhoto(id, store);
        if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob));
        value[field] = urls.get(id);
    }
    for (const item of Object.values(value)) if (item && typeof item === 'object') await hydrateIngredientPhotos(item, store);
    return value;
}
