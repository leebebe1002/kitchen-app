import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { prepareIngredientPhotoBackup, hydrateIngredientPhotos, serializeIngredientPhotos } from '../web/src/utils/IngredientPhotoStore.js';
import { applyIngredientBaseline, recoverIngredientBaseline, INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY, BASELINE_UPDATE_KEY } from '../web/src/utils/IngredientBaselineUpdate.js';

const officialText = fs.readFileSync('src/data/ingredients.json', 'utf8');
const fetchBlob = globalThis.fetch;
const official = JSON.parse(officialText);
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const imageBytes = Buffer.from(png.split(',')[1], 'base64');
const all = value => Object.values(value).flat();
const tofuId = all(official).find(item => item.name === '豆腐麵').id;
const withPhotos = structuredClone(official);
const tofu = all(withPhotos).find(item => item.id === tofuId);
tofu.photoUrl = png; tofu.per100g = { kcal: 0 }; tofu.price = 42;
const privateItem = { id: 'private-with-photo', name: '私人照片食材', category: 'veggies', photo: png, per100g: { kcal: 12 } };
const custom = [tofu, privateItem];
const originals = new Map([[INGREDIENT_CACHE_KEY, JSON.stringify(withPhotos)], [CUSTOM_INGREDIENT_KEY, JSON.stringify(custom)],
    ['kitchen_v2_personal_state_household', '{"keep":"household"}'], ['kitchen_v2_personal_state_ariel', '{"keep":"ariel"}']]);
let values, photos, failPhotoWrite, failPhotoRead, failStorage, writes, blobWrites;
const store = {
    async put(id, blob) { if (failPhotoWrite) throw Error('Photo quota'); photos.set(id, blob); blobWrites++; },
    async get(id) { if (failPhotoRead) throw Error('Photo read failed'); return photos.get(id); }
};
const storage = {
    getItem: key => values.get(key) ?? null,
    setItem(key, value) {
        assert(!String(value).includes('data:image'), 'Never copy encoded photos into any new localStorage write');
        assert(!String(value).includes('blob:'), 'Object URLs must never persist');
        if (failStorage(key, value)) throw Error('Storage quota');
        writes.push(key); values.set(key, String(value));
    },
    removeItem: key => values.delete(key)
};
const reset = () => { values = new Map(originals); photos = new Map(); failPhotoWrite = failPhotoRead = false; failStorage = () => false; writes = []; blobWrites = 0; };
const source = () => Object.fromEntries([INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY].map(key => [key, values.get(key) ?? null]));
reset();
const prepared = await prepareIngredientPhotoBackup(source(), store);
assert.equal(writes.length, 0, 'Binary backup cannot change original cache before the nutrition transaction');
assert.equal(blobWrites, 1, 'Repeated copies of the same image share a verified binary backup');
assert.deepEqual(values, originals);
for (const blob of photos.values()) assert.deepEqual(Buffer.from(await blob.arrayBuffer()), imageBytes);
const updated = applyIngredientBaseline(official, storage, prepared);
assert.equal(JSON.parse(values.get(BASELINE_UPDATE_KEY)).status, 'complete');
for (const [key, raw] of values) if ([INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY, BASELINE_UPDATE_KEY].includes(key)) {
    assert(!raw.includes('data:image') && !raw.includes('blob:'), key);
}
assert.equal(all(updated).find(item => item.id === tofuId).per100g, undefined);
assert.equal(all(updated).find(item => item.id === tofuId).price, 42);
await hydrateIngredientPhotos(updated, store);
for (const [id, field] of [[tofuId, 'photoUrl'], [privateItem.id, 'photo']]) {
    const item = all(updated).find(item => item.id === id);
    assert(item[field].startsWith('blob:'));
    assert.deepEqual(Buffer.from(await (await fetchBlob(item[field])).arrayBuffer()), imageBytes);
}
assert(!serializeIngredientPhotos(updated).includes('blob:'));
for (const scope of ['household', 'ariel']) assert.equal(values.get('kitchen_v2_personal_state_' + scope), originals.get('kitchen_v2_personal_state_' + scope));

for (const failure of ['write', 'read', 'corrupt']) {
    reset(); failPhotoWrite = failure === 'write'; failPhotoRead = failure === 'read';
    const brokenStore = failure === 'corrupt' ? { put: store.put, get: async () => new Blob(['changed'], { type: 'image/png' }) } : store;
    await assert.rejects(prepareIngredientPhotoBackup(source(), brokenStore));
    assert.deepEqual(values, originals); assert.equal(writes.length, 0);
}
for (const stage of ['backup', 'cache', 'complete']) {
    reset(); const backup = await prepareIngredientPhotoBackup(source(), store);
    let failed = false;
    failStorage = (key, value) => {
        const match = stage === 'backup' ? key === BASELINE_UPDATE_KEY
            : stage === 'cache' ? key === INGREDIENT_CACHE_KEY
            : key === BASELINE_UPDATE_KEY && JSON.parse(value).status === 'complete';
        if (match && !failed) { failed = true; return true; } return false;
    };
    assert.throws(() => applyIngredientBaseline(official, storage, backup));
    if (stage === 'backup') assert.deepEqual(values, originals);
    else {
        // Recovery restores old nutrients plus durable photo references, never reserializes Base64.
        const restored = JSON.parse(values.get(INGREDIENT_CACHE_KEY));
        assert.equal(all(restored).find(item => item.id === tofuId).per100g.kcal, 0);
        await hydrateIngredientPhotos(restored, store);
        assert.deepEqual(Buffer.from(await (await fetchBlob(all(restored).find(item => item.id === tofuId).photoUrl)).arrayBuffer()), imageBytes);
    }
}
reset();
const interrupted = await prepareIngredientPhotoBackup(source(), store);
storage.setItem(BASELINE_UPDATE_KEY, JSON.stringify({ status: 'pending', before: interrupted.before, original: interrupted.before }));
storage.setItem(CUSTOM_INGREDIENT_KEY, '[]');
recoverIngredientBaseline(storage);
const restored = JSON.parse(values.get(INGREDIENT_CACHE_KEY));
await hydrateIngredientPhotos(restored, store);
assert(all(restored).find(item => item.id === tofuId).photoUrl.startsWith('blob:'));
reset();
const changed = await prepareIngredientPhotoBackup(source(), store);
values.set(INGREDIENT_CACHE_KEY, '{"proteins":[]}');
assert.throws(() => applyIngredientBaseline(official, storage, changed), /已變更/);
assert.equal(writes.length, 0);
reset(); values.set(INGREDIENT_CACHE_KEY, JSON.stringify({ proteins: [{ id: 'note', name: '備註', note: 'nutrition data: pending' }] })); values.set(CUSTOM_INGREDIENT_KEY, '[]');
const notes = await prepareIngredientPhotoBackup(source(), store);
assert.equal(blobWrites, 0); applyIngredientBaseline(official, storage, notes);
reset();
const primaryWithoutPhoto = structuredClone(withPhotos);
delete all(primaryWithoutPhoto).find(item => item.id === tofuId).photoUrl;
values.set(INGREDIENT_CACHE_KEY, JSON.stringify(primaryWithoutPhoto));
const customPhotoBackup = await prepareIngredientPhotoBackup(source(), store);
const fallback = applyIngredientBaseline(official, storage, customPhotoBackup);
await hydrateIngredientPhotos(fallback, store);
assert(all(fallback).find(item => item.id === tofuId).photoUrl.startsWith('blob:'), 'Custom-only photo of an existing ID remains visible');

// Real Engine startup must leave legacy image records untouched until explicit adoption.
globalThis.localStorage = storage; globalThis.sessionStorage = storage;
globalThis.window = { location: { hostname: 'test.invalid' }, addEventListener() {}, removeEventListener() {} };
globalThis.Vue = { reactive: value => value };
const { default: Engine } = await import('../web/src/engine/KitchenEngine.js');
reset();
globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(official) });
const engine = new Engine({ photoStore: store });
await engine.fetchJson('ingredients.json', 'rawIngredients', {});
engine.mergeCustomUserIngredients();
assert.equal(values.get(INGREDIENT_CACHE_KEY), originals.get(INGREDIENT_CACHE_KEY));
assert.equal(values.get(CUSTOM_INGREDIENT_KEY), originals.get(CUSTOM_INGREDIENT_KEY));
assert.equal(values.has(INGREDIENT_CACHE_KEY + '_pre_nutrition_v1'), false);
globalThis.fetch = async (_url, options) => { assert(!options?.method); return { ok: true, text: async () => officialText }; };
assert.equal(await engine.adoptIngredientBaseline(), true);
let savedTofu = engine.getIngredientById(tofuId);
assert(savedTofu.photoUrl.startsWith('blob:'));
await engine.saveIngredient({ ...savedTofu, price: 99, per100g: { kcal: 77 } });
globalThis.fetch = async () => ({ ok: true, json: async () => structuredClone(official) });
const reboot = new Engine({ photoStore: store });
await reboot.fetchJson('ingredients.json', 'rawIngredients', {});
savedTofu = all(reboot.data.rawIngredients).find(item => item.id === tofuId);
assert.equal(savedTofu.per100g.kcal, 77); assert.equal(savedTofu.price, 99);
assert.deepEqual(Buffer.from(await (await fetchBlob(savedTofu.photoUrl)).arrayBuffer()), imageBytes);

// The actual editor reads historical `photo` as a fallback and saves it as photoUrl.
globalThis.Vue = vm.runInNewContext(fs.readFileSync('web/vue.global.js', 'utf8') + ';Vue', { console, setTimeout, clearTimeout });
globalThis.document = { body: { classList: { add() {}, remove() {} } } };
globalThis.alert = () => {}; globalThis.confirm = () => true;
reboot.data.ingredients = all(reboot.data.rawIngredients);
const { default: Modal } = await import('../web/src/components/IngredientDetailModal.js');
const props = Vue.reactive({ engine: reboot, isOpen: false, mode: 'edit', initialIngredient: reboot.getIngredientById(privateItem.id), context: 'pantry' });
const renderer = Vue.createRenderer({ createElement: () => ({}), insert() {}, remove() {}, setElementText() {}, patchProp() {},
    createText: () => ({}), createComment: () => ({}), setText() {}, setComment() {}, parentNode: () => null, nextSibling: () => null });
let modal; const root = {};
renderer.render(Vue.h({ setup() { modal = Modal.setup(props, { emit() {} }); return () => Vue.h('div'); } }), root);
props.isOpen = true; await Vue.nextTick(); modal.form.price = 88; await modal.handleSave();
assert.equal(reboot.getIngredientById(privateItem.id).price, 88);
assert.equal(reboot.getIngredientById(privateItem.id).localPhotoRefs.photoUrl, reboot.getIngredientById(privateItem.id).localPhotoRefs.photo);
renderer.render(null, root);
await reboot.saveIngredient({ ...reboot.getIngredientById(tofuId), photoUrl: 'https://example.invalid/replacement.jpg' });
const nextReboot = new Engine({ photoStore: store }); await nextReboot.fetchJson('ingredients.json', 'rawIngredients', {});
assert.equal(all(nextReboot.data.rawIngredients).find(item => item.id === tofuId).photoUrl, 'https://example.invalid/replacement.jpg');
console.log('PASS: exact binary photos, no new Base64/Blob URL persistence, duplicate-image backup, quota/read/corruption failures, rollback/crash/concurrent edits, both scopes unchanged, real Engine opt-in and later edits/reload; in-memory photos only.');
