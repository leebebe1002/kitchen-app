import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
globalThis.Vue = vm.runInNewContext(fs.readFileSync('web/vue.global.js', 'utf8') + ';Vue', { console, setTimeout, clearTimeout });
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.document = { body: { classList: { add() {}, remove() {} } } };
globalThis.localStorage = { getItem: () => null };
globalThis.alert = () => {};
globalThis.fetch = () => { throw Error('No real network permitted'); };
const { default: Tracker } = await import('../web/src/views/TrackerView.js');
const { ref, h, createRenderer, nextTick } = Vue;
const calls = [];
const makeEngine = id => ({
    profiles: { bebe: { targetKcal: 1500 } },
    getDailyLog: () => ({ totals: { kcal: id }, meals: [{ id }] }),
    getFavoriteFoods: () => [{ id }],
    syncWithCloud: async () => { calls.push(id); },
    saveFavoriteFood: async () => { calls.push('save-' + id); }
});
const current = ref(makeEngine(1));
let view;
let mounts = 0;
const component = { props: ['engine'], setup(props) { mounts++; view = Tracker.setup(props); return () => h('div'); } };
const renderer = createRenderer({ createElement: () => ({}), insert() {}, remove() {}, setElementText() {}, patchProp() {}, createText: () => ({}), createComment: () => ({}), setText() {}, setComment() {}, parentNode: () => null, nextSibling: () => null });
const root = {};
renderer.render(h({ setup: () => () => h(component, { engine: current.value }) }), root);
await nextTick();
assert.equal(view.meals.value[0].id, 1);
view.voiceText.value = '尚未完成的輸入';
view.showAiModal.value = true;
current.value = makeEngine(2);
await nextTick();
assert.equal(mounts, 1, 'Foreground revalidation must preserve the mounted form');
assert.equal(view.meals.value[0].id, 2);
assert.equal(view.favoriteFoods.value[0].id, 2);
assert.equal(view.engine.value, current.value);
assert.equal(view.voiceText.value, '尚未完成的輸入');
assert.equal(view.showAiModal.value, true);
await view.syncNow();
await view.saveAsFavorite();
assert.equal(calls.at(-2), 2);
assert.equal(calls.at(-1), 'save-2');
Vue.compile(Tracker.template, { decodeEntities: text => text });
renderer.render(null, root);
console.log('PASS: mounted Tracker follows replacement engine for reads and writes while preserving unfinished form; fake engines only.');
