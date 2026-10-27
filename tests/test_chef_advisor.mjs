import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { requestChef, CHEF_MODELS, CHEF_TOTAL_MS, CHEF_REQUEST_MS } from '../web/src/services/ChefAdvisor.js';

const timings = [];
const info = console.info;
console.info = (label, data) => { if (label === '[FK Chef timing]') timings.push(data); };
const values = new Map();
const storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) };
globalThis.localStorage = storage;
globalThis.sessionStorage = { ...storage, getItem: () => null, setItem: () => {} };
globalThis.document = { body: { classList: { add() {}, remove() {} } }, getElementById: () => null };
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.Vue = vm.runInNewContext(fs.readFileSync(new URL('../web/vue.global.js', import.meta.url), 'utf8') + ';Vue', { console, setTimeout, clearTimeout });
const { default: Calculator } = await import('../web/src/views/CalculatorView.js');
const { default: KitchenEngine } = await import('../web/src/engine/KitchenEngine.js');
const { reactive, h, createRenderer, nextTick } = Vue;
const renderer = createRenderer({
    createElement: () => ({}), insert() {}, remove() {}, setElementText() {}, patchProp() {},
    createText: () => ({}), createComment: () => ({}), setText() {}, setComment() {},
    parentNode: () => null, nextSibling: () => null
});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const fixtureKey = 'mock-chef-key-not-a-credential';
async function mount(component = Calculator) {
    values.clear();
    storage.setItem('family_kitchen_gemini_key', fixtureKey);
    const engine = new KitchenEngine();
    engine.profiles = reactive(engine.profiles);
    engine.data.ingredients = [
        { id: 'chicken', name: '雞肉', category: 'proteins', unitLabel: 'g', per100g: { kcal: 120, protein: 25 } },
        { id: 'brown_rice', name: '糙米', category: 'carbs', unitLabel: 'g', per100g: { kcal: 150, carbs: 30 } },
        { id: 'egg', name: '蛋', category: 'proteins', isCount: true, unitLabel: '顆', perUnit: { kcal: 70, protein: 6 } }
    ];
    engine.data.pantryInventory = { foodStockStatus: { chicken: true, brown_rice: true, egg: true } };
    const fixtureDishes = ['home_cooking', 'other'].map(id => ({ id, name: id, recommendedProteins: ['chicken', 'egg'], recommendedCarbs: ['brown_rice'] }));
    engine.data.dishes = [];
    engine.personalScope = 'household';
    let view;
    const root = {};
    renderer.render(h({ setup() { view = component.setup({ engine }); return () => h('div'); } }), root);
    engine.data.dishes = fixtureDishes;
    await nextTick();
    return { view, engine, close: () => renderer.render(null, root) };
}
const resultFor = view => ({ chefComment: '配比完成', portions: Object.fromEntries(view.activeMembers.value.map(m =>
    [m, view.getMemberActiveIngredients(m).map(i => ({ ...i, amount: i.unit === 'g' ? 60 : 1 }))])) });
const response = result => ({ ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(result) }] } }] }) });
const http = status => ({ ok: false, status, text: async () => '' });
let passes = 0;
async function check(name, fn) { await fn(); passes++; info(`PASS ${name}`); }

await check('model policy, 12s request / 20s total', async () => {
    assert.equal(CHEF_MODELS.length, 2); assert.equal(CHEF_TOTAL_MS, 20000); assert.equal(CHEF_REQUEST_MS, 12000);
});
await check('primary success, three members, immediate local result, memory wins, canonical nutrition', async () => {
    const { view, engine, close } = await mount();
    view.diners.value = { bebe: true, ariel: true, jason: true };
    await nextTick();
    view.memberIngredients.value.bebe[0].amount = 77;
    view.savePortionMemory('bebe');
    let release;
    globalThis.fetch = async () => new Promise(resolve => { release = resolve; });
    const pending = view.calculate();
    assert.equal(view.isCalculated.value, true); assert(!Calculator.template.includes('aiHudState'));
    assert.equal(view.memberIngredients.value.bebe[0].amount, 77);
    const localJason = view.memberIngredients.value.jason[0].amount;
    assert.notEqual(localJason, 77);
    const result = resultFor(view);
    release(response(result)); await pending;
    assert.equal(view.memberIngredients.value.bebe[0].amount, 77);
    assert.equal(view.memberIngredients.value.ariel[0].amount, 60);
    assert.equal(view.memberIngredients.value.jason[0].amount, 60);
    assert.deepEqual(view.getMemberNutrition('jason'), engine.calculateNutritionForMember(result.portions.jason, 'jason'));
    assert.equal(view.aiChefAdvice.value.source, 'ai'); close();
});
for (const status of [404, 429, 503, 400, 403]) await check(`HTTP ${status} fallback policy`, async () => {
    const { view, close } = await mount(); let calls = 0;
    globalThis.fetch = async (url, options) => {
        calls++; assert(!url.includes('key=')); assert.equal(options.headers['x-goog-api-key'], fixtureKey);
        assert.equal(JSON.parse(options.body).generationConfig.thinkingConfig.thinkingLevel, 'LOW');
        return calls === 1 ? http(status) : response(resultFor(view));
    };
    await view.calculate();
    const fallback = [404, 503].includes(status);
    assert.equal(calls, fallback ? 2 : 1);
    assert.equal(view.aiChefAdvice.value.source, fallback ? 'ai' : 'local');
    assert.equal(view.isAiChefLoading.value, false); close();
});
await check('primary timeout then successful fallback (accelerated request timer)', async () => {
    const { view, close } = await mount(); let calls = 0;
    const nativeTimer = globalThis.setTimeout;
    globalThis.setTimeout = (fn, ms, ...args) => nativeTimer(fn, ms === CHEF_REQUEST_MS ? 15 : ms, ...args);
    try {
        globalThis.fetch = async () => ++calls === 1 ? new Promise(() => {}) : response(resultFor(view));
        await view.calculate(); assert.equal(calls, 2); assert.equal(view.aiChefAdvice.value.source, 'ai');
    } finally { globalThis.setTimeout = nativeTimer; close(); }
});
await check('all models fail, keep usable local portions', async () => {
    const { view, close } = await mount(); let calls = 0;
    globalThis.fetch = async () => { calls++; return http(503); };
    await view.calculate(); assert.equal(calls, 2); assert.equal(view.isCalculated.value, true);
    assert.equal(view.aiChefAdvice.value.source, 'local'); assert(view.getMemberNutrition('bebe').kcal > 0); close();
});
for (const defect of ['syntax', 'truncated', 'missing', 'unknown', 'duplicate', 'negative', 'infinite', 'huge', 'unit', 'member']) {
    await check(`reject invalid response: ${defect}, no partial application`, async () => {
        const { view, close } = await mount(); let before;
        globalThis.fetch = async () => {
            before = JSON.stringify(view.memberIngredients.value);
            const result = resultFor(view);
            const items = result.portions.bebe;
            if (defect === 'syntax') return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{oops' }] } }] }) };
            if (defect === 'truncated') return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) };
            if (defect === 'missing') items.pop();
            if (defect === 'unknown') items[0].id = 'unknown';
            if (defect === 'duplicate') items[1] = { ...items[0] };
            if (defect === 'negative') items[0].amount = -1;
            if (defect === 'infinite') items[0].amount = Infinity;
            if (defect === 'huge') items[0].amount = 100000;
            if (defect === 'unit') items[0].unit = '包';
            if (defect === 'member') result.portions.ariel = items;
            return response(result);
        };
        await view.calculate();
        assert.equal(view.aiChefAdvice.value.source, 'local'); assert.equal(JSON.stringify(view.memberIngredients.value), before); close();
    });
}
for (const action of ['amount', 'edit-revert', 'dish', 'members', 'mode', 'ingredients', 'memory', 'scope', 'unmount']) {
    await check(`stale response protection: ${action}`, async () => {
        const { view, engine, close } = await mount(); let release; let calls = 0;
        globalThis.fetch = async () => { calls++; return new Promise(resolve => { release = resolve; }); };
        const pending = view.calculate(); const result = resultFor(view);
        await view.calculate(); assert.equal(calls, 1, 'duplicate click must be ignored');
        if (action === 'amount') view.memberIngredients.value.bebe[0].amount = 91;
        if (action === 'edit-revert') { const item = view.memberIngredients.value.bebe[0]; const n = item.amount; item.amount++; item.amount = n; }
        if (action === 'dish') view.selectedDish.value = 'other';
        if (action === 'members') view.diners.value.ariel = true;
        if (action === 'mode') view.memberPortionModes.value.bebe = 'remaining';
        if (action === 'ingredients') view.toggleIngredient('egg');
        if (action === 'memory') view.savePortionMemory('bebe');
        if (action === 'scope') engine.data.pantryInventory.foodStockStatus.chicken = false;
        if (action === 'unmount') close();
        await nextTick(); const after = JSON.stringify(view.memberIngredients.value);
        release(response(result)); await pending; await nextTick();
        assert.equal(JSON.stringify(view.memberIngredients.value), after);
        assert.equal(view.isAiChefLoading.value, false); if (action !== 'unmount') close();
    });
}
await check('cancelled old request cannot clear newer request spinner', async () => {
    const { view, close } = await mount(); const releases = [];
    globalThis.fetch = async () => new Promise(resolve => releases.push(resolve));
    const old = view.calculate(); view.memberIngredients.value.bebe[0].amount++;
    const newer = view.calculate(); await old;
    assert.equal(view.isAiChefLoading.value, true);
    releases[1](response(resultFor(view))); await newer;
    releases[0](response(resultFor(view))); await nextTick();
    assert.equal(view.aiChefAdvice.value.source, 'ai'); close();
});
await check('missing key keeps local portions without requests', async () => {
    const { view, close } = await mount(); values.clear(); globalThis.fetch = () => { throw new Error('unexpected request'); };
    await view.calculate(); assert.equal(view.isCalculated.value, true); assert.equal(view.isAiChefLoading.value, false); close();
});
await check('deadline covers hanging response body', async () => {
    globalThis.fetch = async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) });
    const start = performance.now();
    await assert.rejects(requestChef({ apiKey: fixtureKey, prompt: 'mock', signal: new AbortController().signal, deadline: start + 40 }), { code: 'timeout' });
    assert(performance.now() - start < 500);
});
await check('real 20s timer: hung transports abort at 12s + remaining budget', async () => {
    const { view, close } = await mount(); let calls = 0; const starts = []; const signals = [];
    globalThis.fetch = async (url, opts) => { calls++; starts.push(performance.now()); signals.push(opts.signal); return new Promise(() => {}); };
    const start = performance.now(); const pending = view.calculate();
    assert.equal(view.isCalculated.value, true);
    await pending; const elapsed = performance.now() - start;
    assert.equal(calls, 2); assert(starts[1] - starts[0] >= 11900); assert(starts[1] - starts[0] < 13000);
    assert(elapsed >= 19900 && elapsed < 21000); assert(signals.every(s => s.aborted));
    assert.equal(view.isAiChefLoading.value, false); assert.equal(view.aiChefAdvice.value.source, 'local');
    info(`MEASURE new hung API: ${Math.round(elapsed)} ms, local result available immediately`); close();
});
await check('before/after same 10ms mock failures', async () => {
    const path = new URL('../web/src/views/CalculatorView.js', import.meta.url);
    let source = execFileSync('git', ['show', 'HEAD:web/src/views/CalculatorView.js'], { encoding: 'utf8' });
    source = source.replace(/from '([^']+)'/g, (_, spec) => `from '${new URL(spec, path).href}'`);
    const { default: oldComponent } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    const results = [];
    const oldLog = console.log; const oldWarn = console.warn;
    console.log = () => {}; console.warn = () => {};
    try {
        for (const component of [oldComponent, Calculator]) {
            const { view, close } = await mount(component); let calls = 0;
            globalThis.fetch = async url => { calls++; await pause(10);
                return url.includes(':generateContent') ? http(503) : { ok: true, json: async () => ({ models: Array.from({ length: 5 }, (_, i) => ({ name: `models/mock-${i}`, supportedGenerationMethods: ['generateContent'] })) }) };
            };
            const start = performance.now(); await view.calculate();
            results.push({ calls, elapsedMs: Math.round(performance.now() - start) }); close();
        }
    } finally { console.log = oldLog; console.warn = oldWarn; }
    assert.equal(results[0].calls, 12); assert.equal(results[1].calls, 2);
    info('MEASURE same 10ms mock, old/new:', results);
});
assert(timings.every(t => !JSON.stringify(t).includes(fixtureKey)));
console.info = info;
info(`${passes} chef checks passed; no real API calls. Timing separates local/prepare/request headers+body/parse/validate+apply/total. Server reasoning vs network cannot be separated from client timings.`);
