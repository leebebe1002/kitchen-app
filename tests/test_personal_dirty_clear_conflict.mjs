import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeTestEngine } from './personal_scope_fixture.mjs';

const values = new Map();
globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
};
globalThis.sessionStorage = localStorage;
globalThis.Vue = { reactive: value => value };
globalThis.window = { location: { hostname: 'test.invalid' }, addEventListener() {} };
globalThis.fetch = async () => { throw Error('Real network forbidden'); };
const { default: Engine } = await import('../web/src/engine/KitchenEngine.js');
const { emptyPersonalKitchenState: blank, writePersonalKitchenState: write, readPersonalKitchenState: read, hasPersonalKitchenData: hasData } = await import('../web/src/services/PersonalKitchenState.js');
const key = scope => 'kitchen_v2_personal_state_' + scope;
const populated = label => ({
    ...blank(), revision: 5, syncStatus: 'active',
    pantryInventory: {
        foodStockStatus: { [label]: true }, supplyStockStatus: { [label]: true },
        shoppingList: [{ id: label, targetId: label }], foodCart: [{ id: label }]
    },
    householdSupplies: { supplies: [{ id: label, name: 'synthetic supply' }] }
});
async function open(scope) {
    const engine = new Engine(); authorizeTestEngine(engine, scope);
    await engine.initializePersonalKitchenState(); return engine;
}
function adapter(scope, state) {
    const remote = structuredClone(state); let writes = 0;
    return {
        enabled: true, remote,
        get writes() { return writes; },
        async getState(id) { assert.equal(id, scope); return structuredClone(remote); },
        async saveState(id, draft) {
            assert.equal(id, scope); assert.equal(draft.revision, remote.revision);
            writes++;
            Object.assign(remote, structuredClone(draft), { revision: remote.revision + 1, dirty: false, syncStatus: hasData(draft) ? 'active' : 'cleared' });
            return structuredClone(remote);
        }
    };
}
const assertOriginal = state => {
    assert(state.pantryInventory.foodStockStatus.original);
    assert(state.pantryInventory.supplyStockStatus.original);
    assert.equal(state.pantryInventory.shoppingList[0].targetId, 'original');
    assert.equal(state.pantryInventory.foodCart[0].id, 'original');
    assert.equal(state.householdSupplies.supplies[0].id, 'original');
};

for (const scope of ['household', 'ariel']) {
    for (const emptyDraft of [false, true]) test(`${scope}: dirty r5 vs cleared r6 preserves primary through edits and restart (empty=${emptyDraft})`, async () => {
        values.clear();
        const other = scope === 'household' ? 'ariel' : 'household';
        write(other, populated('other-scope'));
        const otherBefore = values.get(key(other));
        write(scope, { ...(emptyDraft ? blank() : populated('original')), revision: 5 });
        const engine = await open(scope);
        const remote = { ...blank(), revision: 6, syncStatus: 'cleared' };
        const transport = adapter(scope, remote); engine.personalKitchenSync = transport;
        const before = new Map(values); const memory = structuredClone(engine.data);
        await assert.rejects(engine.syncPersonalKitchenState(), { code: 'FK_SYNC_CONFLICT' });
        assert.deepEqual(values, before, 'Conflict must not change primary or backup in either scope');
        assert.deepEqual(engine.data, memory);
        assert.equal(transport.writes, 0); assert.deepEqual(transport.remote, remote);

        // Multiple ordinary edits roll the backup; the unresolved draft remains in primary.
        for (const edit of ['later-one', 'later-two']) {
            engine.data.pantryInventory.foodStockStatus[edit] = true;
            assert(engine.persistPersonalKitchenState());
            await assert.rejects(engine.syncPersonalKitchenState(), { code: 'FK_SYNC_CONFLICT' });
        }
        const editedPrimary = values.get(key(scope));
        assert.notEqual(values.get(key(scope) + '_backup'), before.get(key(scope)), 'Exercise backup rollover');
        const reopened = await open(scope); reopened.personalKitchenSync = transport;
        await assert.rejects(reopened.syncPersonalKitchenState(), { code: 'FK_SYNC_CONFLICT' });
        assert.equal(values.get(key(scope)), editedPrimary);
        const draft = read(scope); assert.equal(draft.revision, 5); assert(draft.dirty);
        if (!emptyDraft) assertOriginal(draft);
        assert(draft.pantryInventory.foodStockStatus['later-one']);
        assert(draft.pantryInventory.foodStockStatus['later-two']);
        assert.equal(values.get(key(other)), otherBefore);
        assert.equal(transport.writes, 0); assert.deepEqual(transport.remote, remote);
    });

    test(`${scope}: clean r5 accepts cleared r6 without PATCH`, async () => {
        values.clear(); write(scope, populated('original'), { preserveUpdatedAt: true });
        const before = values.get(key(scope)); const engine = await open(scope);
        const remote = { ...blank(), revision: 6, syncStatus: 'cleared' };
        const transport = adapter(scope, remote); engine.personalKitchenSync = transport;
        assert.equal(await engine.syncPersonalKitchenState(), true);
        assert.deepEqual(engine.data.pantryInventory, blank().pantryInventory);
        assert.equal(read(scope).revision, 6); assert.equal(read(scope).dirty, false);
        assert.equal(values.get(key(scope) + '_backup'), before);
        assert.equal(transport.writes, 0); assert.deepEqual(transport.remote, remote);
    });

    for (const marker of ['active', 'cleared']) test(`${scope}: dirty edit based on the same ${marker} revision still syncs`, async () => {
        values.clear(); write(scope, { ...populated('original'), syncStatus: marker });
        const engine = await open(scope);
        const remote = { ...(marker === 'cleared' ? blank() : populated('base')), revision: 5, syncStatus: marker };
        const transport = adapter(scope, remote); engine.personalKitchenSync = transport;
        assert.equal(await engine.syncPersonalKitchenState(), true);
        assert.equal(transport.writes, 1); assertOriginal(transport.remote);
        assert.equal(read(scope).revision, 6); assert.equal(read(scope).dirty, false);
    });
    for (const offset of [-86400000, 0, 86400000]) test(`${scope}: same-revision deliberate clear ignores timestamp offset ${offset}`, async () => {
        values.clear(); write(scope, populated('original'), { preserveUpdatedAt: true });
        const engine = await open(scope);
        const remote = { ...populated('original'), updatedAt: '2030-01-01T00:00:00.000Z' };
        engine.applyPersonalKitchenState(blank()); engine.persistPersonalKitchenState();
        const draft = read(scope);
        draft.updatedAt = new Date(Date.parse(remote.updatedAt) + offset).toISOString();
        values.set(key(scope), JSON.stringify(draft));
        const transport = adapter(scope, remote); engine.personalKitchenSync = transport;
        assert.equal(await engine.syncPersonalKitchenState(), true);
        assert.equal(transport.writes, 1); assert.equal(transport.remote.syncStatus, 'cleared');
        assert.equal(read(scope).revision, 6); assert.equal(read(scope).dirty, false);
    });

}
