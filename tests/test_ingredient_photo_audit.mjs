import assert from 'node:assert/strict';
import { inspectIngredientPhotos, formatIngredientPhotoAudit } from '../web/src/utils/IngredientPhotoAudit.js';
import { prepareIngredientPhotoBackup, INGREDIENT_PHOTO_DB } from '../web/src/utils/IngredientPhotoStore.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const cache = 'kitchen_v2_ingredients.json';
const custom = 'kitchen_v2_custom_ingredients';
const photos = new Map();
const prepared = await prepareIngredientPhotoBackup({
    [custom]: JSON.stringify([{ id: 'jlek', name: 'J-Lek', photo: png }])
}, { put: async (id, blob) => photos.set(id, blob), get: async id => photos.get(id) });
const backedUp = JSON.parse(prepared.before[custom])[0];
photos.set('image/png:broken', new Blob(['broken'], { type: 'image/png' }));
photos.set('orphan', new Blob(['unreferenced'], { type: 'image/png' }));
const stored = new Map([
    [cache, JSON.stringify({ sauces: [{ id: 'cocoa', name: '有機可可粉', photoUrl: null }] })],
    [custom, prepared.before[custom]],
    [cache + '_pre_nutrition_v1', JSON.stringify({ sauces: [{ id: 'cocoa', name: '有機可可粉', photoUrl: 'https://photos.example.invalid/private/image.jpg?secret=fixture' }] })],
    ['kitchen_v2_nutrition_edit_backup', JSON.stringify({ before: { [custom]: JSON.stringify([{ id: 'old', name: '舊照片', photo: png }]) } })],
    ['kitchen_v2_ingredient_baseline_20261103', JSON.stringify({ original: { [custom]: prepared.before[custom] } })],
    ['family_kitchen_auth_session', 'DO-NOT-READ-SESSION']
]);
const before = JSON.stringify([...stored]);
const storage = {
    getItem(key) { assert.notEqual(key, 'family_kitchen_auth_session'); return stored.get(key) ?? null; },
    setItem() { assert.fail('Audit must never write localStorage'); },
    removeItem() { assert.fail('Audit must never remove localStorage'); }
};
let opened = 0, closed = 0;
const indexedDB = {
    databases: async () => [{ name: INGREDIENT_PHOTO_DB }],
    open(name) {
        assert.equal(name, INGREDIENT_PHOTO_DB);
        opened++;
        const request = {};
        queueMicrotask(() => {
            request.result = {
                close() { closed++; },
                transaction(name, mode) {
                    assert.equal(name, 'photos');
                    assert.equal(mode, 'readonly');
                    const keys = { result: [...photos.keys()] };
                    const blobs = { result: [...photos.values()] };
                    const transaction = {
                        objectStore: () => ({ getAllKeys: () => keys, getAll: () => blobs })
                    };
                    queueMicrotask(() => transaction.oncomplete());
                    return transaction;
                }
            };
            request.onsuccess();
        });
        return request;
    }
};
globalThis.fetch = () => assert.fail('Audit must not contact image hosts or APIs');
const ingredients = [
    { id: 'cocoa', name: '有機可可粉' },
    backedUp,
    { id: 'bad', name: '壞備份', localPhotoRefs: { photoUrl: 'image/png:broken' } },
    { id: 'missing', name: '不在資料庫', localPhotoRefs: { photoUrl: 'image/png:missing' } },
    { id: 'temporary', name: '暫存照片', photoUrl: 'blob:expired' }
];
const report = await inspectIngredientPhotos({ ingredients, storage, indexedDB, appVersion: 'fixture' });
assert.equal(report.appVersion, 'fixture');
assert.deepEqual(report.summary, { currentWithPhotoRecord: 4, storedElsewhere: 2 });
assert.equal(report.devicePhotos.count, 3);
assert.equal(report.devicePhotos.unreferencedCount, 1);
const byId = id => report.ingredients.find(item => item.id === id);
assert.equal(byId('jlek').records[0].photos.photo, '裝置備份可讀');
assert.equal(byId('cocoa').records[0].photos.photoUrl, '圖片連結（photos.example.invalid）');
assert.equal(byId('old').current, false);
assert.equal(byId('old').records[0].photos.photo, '舊內嵌照片');
assert.equal(byId('bad').records[0].photos.photoUrl, '裝置備份遺失或損壞');
assert.equal(byId('missing').records[0].photos.photoUrl, '裝置備份遺失或損壞');
assert.equal(byId('temporary').records[0].photos.photoUrl, '暫存連結缺少備份紀錄');
assert.equal(opened, 1);
assert.equal(closed, 1);
assert.equal(JSON.stringify([...stored]), before);
assert(!JSON.stringify(report).includes('data:image'));
assert(!JSON.stringify(report).includes('blob:'));
assert(!JSON.stringify(report).includes('/private/image'));
assert(!JSON.stringify(report).includes('secret=fixture'));
assert(!JSON.stringify(report).includes('DO-NOT-READ-SESSION'));
const absent = await inspectIngredientPhotos({
    ingredients: [], storage,
    indexedDB: { databases: async () => [], open() { assert.fail('Do not create a missing database'); } }
});
assert.equal(absent.devicePhotos.status, '沒有照片資料庫');
const unreadable = await inspectIngredientPhotos({
    ingredients: [backedUp], storage,
    indexedDB: { databases: async () => { throw Error('denied'); } }
});
assert.equal(unreadable.ingredients[0].records[0].photos.photo, '裝置備份無法讀取');
assert.equal(unreadable.devicePhotos.count, null);
assert.equal(JSON.stringify([...stored]), before);
const corrupt = await inspectIngredientPhotos({
    ingredients: [], storage: { getItem: () => '{invalid' }, indexedDB: undefined
});
assert(corrupt.sources.every(source => source.error || source.source === '目前畫面'));

// Older Safari may not expose databases(). Abort opening an absent database.
let aborted = false;
const olderSafari = await inspectIngredientPhotos({
    ingredients: [], storage,
    indexedDB: {
        open() {
            const request = { transaction: { abort() { aborted = true; queueMicrotask(() => request.onerror()); } } };
            queueMicrotask(() => request.onupgradeneeded());
            return request;
        }
    }
});
assert(aborted);
assert.equal(olderSafari.devicePhotos.status, '沒有照片資料庫');
console.log('PASS readonly photo audit: current+cache+all backups, verified/missing/corrupt/orphan blobs, legacy photos, no network/writes/credentials/image-data, absent/denied/older Safari database');

const text = formatIngredientPhotoAudit(report);
assert(text.includes('有機可可粉 [cocoa]'));
assert(text.includes('裝置備份可讀'));
assert(text.includes('裝置備份遺失或損壞'));
assert(text.includes('舊內嵌照片'));
assert(text.includes('S1/S3/S6 photo=裝置備份可讀'));
assert(!text.includes('data:image'));
assert(!text.includes('/private/image'));
const largeReport = structuredClone(report);
largeReport.ingredients = [
 ...Array.from({length:94},(_,index)=>({ id:'food_'+index, name:'無照片食材'+index, current:true, records:[] })),
 ...Array.from({length:6},(_,index)=>({ id:'photo_'+index, name:'有照片食材'+index, current:true, records:byId('jlek').records }))
];
const compact = formatIngredientPhotoAudit(largeReport);
assert(compact.length < 9000, 'The 100-item, 6-photo report must fit the 10k paste limit');
assert(compact.includes('無照片食材93[food_93]'));
assert(compact.includes('有照片食材5 [photo_5]'));
console.log('PASS compact report preserves all names, IDs, sources and photo states within the paste limit');
