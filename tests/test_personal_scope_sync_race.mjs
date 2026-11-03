import { authorizeTestEngine, switchTestScope } from './personal_scope_fixture.mjs';
import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.Vue = { reactive: value => value };
globalThis.window = { location: { hostname: 'test.invalid' }, addEventListener() {}, removeEventListener() {} };
globalThis.fetch = async () => { throw new Error('No real network in isolated tests'); };

const { writePersonalKitchenState } = await import('../web/src/services/PersonalKitchenState.js');
const { default: KitchenEngine } = await import('../web/src/engine/KitchenEngine.js');

const stock = label => ({
    foodStockStatus: { [label]: true }, supplyStockStatus: {},
    shoppingList: [], foodCart: []
});
const remote = label => ({
    pantryInventory: stock(label),
    householdSupplies: { supplies: [] },
    version: 5, revision: 5, syncStatus: 'active', dirty: false,
    updatedAt: new Date(Date.now() + 60_000).toISOString()
});
const deferred = () => {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve };
};
const makeEngine = () => {
    values.clear();
    const engine = new KitchenEngine();
    authorizeTestEngine(engine);
    engine.personalScope = 'household';
    engine.data.pantryInventory = stock('household-local');
    engine.data.householdSupplies = { supplies: [] };
    writePersonalKitchenState('household', { ...engine.getPersonalKitchenSnapshot(), revision: 1, syncStatus: 'active', dirty: false }, { preserveUpdatedAt: true });
    engine.applyPersonalKitchenState(JSON.parse(localStorage.getItem('kitchen_v2_personal_state_household')));
    return engine;
};

// An old household GET must not apply its payload after switching to ariel.
{
    const engine = makeEngine();
    const pending = deferred();
    engine.personalKitchenSync = {
        enabled: true,
        getState: async scope => {
            assert.equal(scope, 'household');
            return pending.promise;
        },
        saveState: async () => { throw Error('Stale GET must not initiate a save'); }
    };
    const operation = engine.syncPersonalKitchenState();
    engine.personalKitchenSync = { enabled: false };
    switchTestScope(engine, 'ariel');
    const arielBefore = localStorage.getItem('kitchen_v2_personal_state_ariel');
    pending.resolve(remote('household-remote'));
    assert.equal(await operation, false, 'Stale household GET must be rejected');
    assert.equal(localStorage.getItem('kitchen_v2_personal_state_ariel'), arielBefore);
    assert.deepEqual(engine.data.pantryInventory.foodStockStatus, {});
}

// A -> B -> A is still stale, even if scope name matches again.
{
    const engine = makeEngine();
    const pending = deferred();
    engine.personalKitchenSync = {
        enabled: true,
        getState: () => pending.promise,
        saveState: async () => { throw Error('Stale GET must not save'); }
    };
    const operation = engine.syncPersonalKitchenState();
    engine.personalKitchenSync = { enabled: false };
    switchTestScope(engine, 'ariel');
    switchTestScope(engine, 'household');
    const before = localStorage.getItem('kitchen_v2_personal_state_household');
    pending.resolve(remote('obsolete-household-response'));
    assert.equal(await operation, false, 'Old request must not survive two switches');
    assert.equal(localStorage.getItem('kitchen_v2_personal_state_household'), before);
}

// A household PATCH in flight may finish on household, but never write its response to ariel.
{
    const engine = makeEngine();
    const pending = deferred();
    const enteredSave = deferred();
    engine.personalKitchenSync = {
        enabled: true,
        getState: async () => ({ ...remote('household-local'), revision: 1 }),
        saveState: async (scope, state) => {
            assert.equal(scope, 'household');
            assert(state.pantryInventory.foodStockStatus['household-local']);
            enteredSave.resolve();
            return pending.promise;
        }
    };
    engine.persistPersonalKitchenState();
    const operation = engine.syncPersonalKitchenState();
    await enteredSave.promise;
    engine.personalKitchenSync = { enabled: false };
    switchTestScope(engine, 'ariel');
    const arielBefore = localStorage.getItem('kitchen_v2_personal_state_ariel');
    pending.resolve(remote('household-ack'));
    assert.equal(await operation, false, 'Stale PATCH response must be ignored');
    assert.equal(localStorage.getItem('kitchen_v2_personal_state_ariel'), arielBefore);
}

// An ordinary request for an unchanged scope should still accept newer remote state.
{
    const engine = makeEngine();
    engine.personalKitchenSync = {
        enabled: true,
        getState: async scope => {
            assert.equal(scope, 'household');
            return remote('fresh-household');
        },
        saveState: async () => { throw Error('Newer cloud data must not be overwritten'); }
    };
    assert.equal(await engine.syncPersonalKitchenState(), true);
    assert.equal(engine.data.pantryInventory.foodStockStatus['fresh-household'], true);
    assert.equal(JSON.parse(localStorage.getItem('kitchen_v2_personal_state_household'))
        .pantryInventory.foodStockStatus['fresh-household'], true);
}

console.log('PASS: scope GET/PATCH guards, A-B-A stale response and ordinary fresh remote apply; isolated localStorage only.');

// First-device empty initialization must not overwrite an existing remote kitchen.
// A deliberate clear remains a newer user edit and must still sync as empty.
for (const scope of ['household', 'ariel']) {
    values.clear();
    const engine = new KitchenEngine();
    authorizeTestEngine(engine, scope);
    engine.fetchJson = async (file, key, fallback) => { engine.data[key] = structuredClone(fallback); };
    await engine.initializePersonalKitchenState();
    const key = 'kitchen_v2_personal_state_' + scope;
    assert.equal(JSON.parse(localStorage.getItem(key)).updatedAt, null);
    let writes = 0;
    const existing = { ...remote('existing'), updatedAt: '2026-01-01T00:00:00Z' };
    engine.personalKitchenSync = {
        enabled: true,
        getState: async () => existing,
        saveState: async () => { writes++; throw Error('Untouched empty state must not overwrite remote'); }
    };
    await engine.syncPersonalKitchenState();
    assert.equal(writes, 0);
    assert.equal(engine.data.pantryInventory.foodStockStatus.existing, true);
    assert.equal(JSON.parse(localStorage.getItem(key + '_backup')).updatedAt, null);
    engine.data.pantryInventory = { foodStockStatus: {}, supplyStockStatus: {}, shoppingList: [], foodCart: [] };
    engine.persistPersonalKitchenState();
    engine.personalKitchenSync.saveState = async (id, state) => {
        writes++;
        assert.equal(id, scope);
        assert.deepEqual(state.pantryInventory.foodStockStatus, {});
        return { ...state, revision: state.revision + 1, dirty: false };
    };
    await engine.syncPersonalKitchenState();
    assert.equal(writes, 1, 'Explicit newer clearing must not resurrect older remote items');
}
console.log('PASS: both scopes first-device empty initialization, existing remote, backup and deliberate clear.');
