import assert from 'node:assert/strict';
import { authorizeTestEngine } from './personal_scope_fixture.mjs';
const values = new Map();
let failure;
globalThis.localStorage = {
    getItem(key) { if (failure?.('get', key)) throw Error('read failure'); return values.get(key) ?? null; },
    setItem(key, value) { if (failure?.('set', key)) throw Error('write failure'); values.set(key, String(value)); },
    removeItem: key => values.delete(key)
};
globalThis.sessionStorage = localStorage;
globalThis.Vue = { reactive: value => value };
globalThis.window = { location: { hostname: 'test.invalid' }, addEventListener() {} };
globalThis.fetch = async () => { throw Error('No real network'); };
const { default: sync } = await import('../web/src/services/PersonalKitchenSyncService.js');
assert.throws(() => sync.stateFromRow({ sync_revision: 0 }), /尚未升級/);
const { default: Engine } = await import('../web/src/engine/KitchenEngine.js');
const { emptyPersonalKitchenState: blank, readPersonalKitchenState: read, writePersonalKitchenState: write, restorePersonalKitchenStateBackup: restore } = await import('../web/src/services/PersonalKitchenState.js');
const key = scope => 'kitchen_v2_personal_state_' + scope;
const populated = label => ({ ...blank(), pantryInventory: { ...blank().pantryInventory, foodStockStatus: { [label]: true }, shoppingList: [{ targetId: label }] }, householdSupplies: { supplies: [{ id: label }] } });
const ack = (state, revision, syncStatus = 'active') => ({ ...state, revision, syncStatus, dirty: false });
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function engine(scope = 'household') {
    const e = new Engine(); authorizeTestEngine(e, scope);
    e.applyPersonalKitchenState(read(scope) || blank()); return e;
}
for (const scope of ['household', 'ariel']) {
    values.clear(); failure = null;
    assert.equal(read(scope), null);
    write(scope, ack(populated('original'), 3), { preserveUpdatedAt: true });
    write(scope, ack(populated('current'), 4), { preserveUpdatedAt: true });
    const before = new Map(values);
    let once = true;
    failure = (op, k) => op === 'get' && k === key(scope) && once && (once = false, true);
    const e = new Engine(); authorizeTestEngine(e, scope);
    await assert.rejects(e.initializePersonalKitchenState(), /read failure/);
    assert.equal(e.hasPersonalAccess(), false);
    assert.equal(await e.syncPersonalKitchenState(), false);
    assert.deepEqual(values, before);
    failure = null;
    await e.initializePersonalKitchenState();
    assert(e.data.pantryInventory.foodStockStatus.current);
    failure = (op, k) => op === 'set' && k === key(scope) + '_backup';
    assert.throws(() => e.persistPersonalKitchenState(), /write failure/);
    assert.deepEqual(values, before);
    failure = null;
    const restored = restore(scope);
    assert(restored.dirty);
    assert(restored.pantryInventory.foodStockStatus.original);
    assert.throws(() => restore('unknown'));
    assert.throws(() => restore('constructor'));
    values.set(key(scope) + '_backup', JSON.stringify({ ...populated('foreign'), scopeId: scope === 'household' ? 'ariel' : 'household' }));
    const current = values.get(key(scope));
    assert.throws(() => restore(scope));
    assert.equal(values.get(key(scope)), current);
    values.set(key(scope), '{broken');
    const corrupted = new Map(values);
    await assert.rejects(e.initializePersonalKitchenState());
    assert.deepEqual(values, corrupted);
}

// Local edit during GET/PATCH, same-context GET order, and a false acknowledgment.
for (const phase of ['GET', 'PATCH']) {
    values.clear(); write('household', ack(populated('base'), 4), { preserveUpdatedAt: true });
    const e = engine(); const entered = defer(); const released = defer();
    if (phase === 'PATCH') { e.data.pantryInventory.foodStockStatus.first = true; e.persistPersonalKitchenState(); }
    e.personalKitchenSync = {
        enabled: true,
        async getState() { if (phase === 'GET') { entered.resolve(); await released.promise; } return ack(populated('base'), 4); },
        async saveState(scope, state) { entered.resolve(); await released.promise; return ack(state, 5); }
    };
    const operation = e.syncPersonalKitchenState(); await entered.promise;
    e.data.pantryInventory.foodStockStatus.latest = true; e.persistPersonalKitchenState();
    const before = values.get(key('household')); released.resolve();
    assert.equal(await operation, false);
    assert.equal(values.get(key('household')), before);
    assert(e.data.pantryInventory.foodStockStatus.latest);
}
values.clear(); write('household', ack(populated('base'), 4), { preserveUpdatedAt: true });
{
    const e = engine(); const released = defer(); let reads = 0;
    e.personalKitchenSync = { enabled: true, getState: () => ++reads === 1 ? released.promise : ack(populated('newest'), 6) };
    const old = e.syncPersonalKitchenState();
    assert.equal(await e.syncPersonalKitchenState(), true);
    released.resolve(ack(populated('old'), 5)); assert.equal(await old, false);
    assert(e.data.pantryInventory.foodStockStatus.newest);
    e.persistPersonalKitchenState();
    e.personalKitchenSync = { enabled: true, getState: async () => ack(populated('newest'), 6), saveState: async () => false };
    await assert.rejects(e.syncPersonalKitchenState(), /未收到/);
    assert(read('household').dirty);
}
// A stale screen may not borrow another tab's newly acknowledged revision.
values.clear(); write('household', ack(populated('base'), 4), { preserveUpdatedAt: true });
{
    const stale = engine();
    write('household', ack(populated('other-tab'), 5), { preserveUpdatedAt: true });
    stale.data.pantryInventory.foodStockStatus['stale-edit'] = true;
    stale.persistPersonalKitchenState();
    assert.equal(read('household').revision, 4);
    stale.personalKitchenSync = { enabled: true, getState: async () => ack(populated('other-tab'), 5), saveState: async () => { throw Error('Must not overwrite another tab'); } };
    await assert.rejects(stale.syncPersonalKitchenState(), { code: 'FK_SYNC_CONFLICT' });
}
for (const marker of ['legacy', 'cleared', 'initial']) {
    values.clear(); write('household', populated('old-device'));
    const before = values.get(key('household')); const e = engine(); let patches = 0;
    e.personalKitchenSync = { enabled: true, getState: async () => ack(blank(), 8, marker), saveState: async (scope, state) => { patches++; return ack(state, 9); } };
    if (marker === 'initial') { await e.syncPersonalKitchenState(); assert.equal(patches, 1); }
    else {
        const beforeConflict = new Map(values);
        await assert.rejects(e.syncPersonalKitchenState(), { code: 'FK_SYNC_CONFLICT' });
        assert.equal(patches, 0);
        assert.deepEqual(values, beforeConflict, 'Unbased dirty draft must remain in primary, not only backup');
        assert.equal(values.get(key('household')), before);
    }
}
console.log('PASS: both scopes read/parse/backup/restore safety, local edits during requests, same-context GET order, acknowledgment, legacy ambiguity, initial and cleared states.');
