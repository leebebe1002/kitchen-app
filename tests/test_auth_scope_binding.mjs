import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const values = new Map();
globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
};
globalThis.sessionStorage = localStorage;
const windowEvents = new Map();
const documentEvents = new Map();
const listen = map => (name, callback) => {
    const previous = map.get(name);
    map.set(name, (...args) => Promise.all([previous?.(...args), callback(...args)]));
};
globalThis.window = { location: { hostname: 'test.invalid' }, addEventListener: listen(windowEvents), removeEventListener() {} };
globalThis.document = { hidden: false, body: { classList: { add() {}, remove() {} } }, addEventListener: listen(documentEvents), removeEventListener() {} };
const vue = vm.runInNewContext(fs.readFileSync('web/vue.global.js', 'utf8') + ';Vue', { console, setTimeout, clearTimeout });
let appDefinition;
const mounted = [];
globalThis.Vue = { ...vue, onMounted: callback => mounted.push(callback), onBeforeUnmount() {}, createApp: app => ({ mount() { appDefinition = app; } }) };
const { default: auth, FamilyAuthService } = await import('../web/src/services/FamilyAuthService.js');
const { default: Engine } = await import('../web/src/engine/KitchenEngine.js');
const { default: sync } = await import('../web/src/services/PersonalKitchenSyncService.js');
const { emptyPersonalKitchenState, writePersonalKitchenState } = await import('../web/src/services/PersonalKitchenState.js');

const copy = value => JSON.parse(JSON.stringify(value));
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => copy(value) });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const token = (id, expiry = Math.floor(Date.now() / 1000) + 3600) => `test.${Buffer.from(JSON.stringify({ sub: id, exp: expiry })).toString('base64url')}.fake`;
const memberScopes = { bebe: ['household'], jason: ['household'], ariel: ['ariel'], outsider: [], ambiguous: ['household', 'ariel'], unknown: ['other'] };
const sessionKey = 'family_kitchen_auth_session';
const stateKey = scope => 'kitchen_v2_personal_state_' + scope;
function state(scope, updatedAt = '2026-01-01T00:00:00Z') {
    return {
        pantryInventory: { foodStockStatus: { [scope + '_food']: true }, supplyStockStatus: { [scope + '_supply']: true }, shoppingList: [{ id: scope + '_shop', targetId: scope + '_food' }], foodCart: [scope + '_cart'] },
        householdSupplies: { supplies: [{ id: scope + '_supply', name: scope + ' fixture' }] }, version: 2, revision: 2, syncStatus: 'active', dirty: false, updatedAt
    };
}
const remote = { household: state('household'), ariel: state('ariel') };
let offline = false;
let userStatus = 200;
let membershipStatus = 200;
let membershipOverride = null;
let stateStatus = 200;
let omitState = false;
let holdVerify = null;
let holdUser = null;
let holdMembership = null;
let holdState = null;
let holdPatch = null;
const requests = [];
const publicData = {
    'ingredients.json': { proteins: [{ id: 'fixture', name: '測試', unitLabel: 'g', per100g: { kcal: 100, protein: 10 } }], veggies: [], carbs: [], sauces: [] },
    'dishes.json': { dishes: [] }, 'favorite_foods.json': { favorites: [] }, 'config.json': {}, 'daily_logs.json': {},
    'pantry_inventory.json': state('legacy').pantryInventory,
    'household_supplies.json': state('legacy').householdSupplies
};
globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input), 'https://test.invalid');
    requests.push({ url, options });
    if (offline) throw Error('fake offline');
    const bearer = options.headers?.Authorization?.slice(7);
    const id = bearer ? JSON.parse(Buffer.from(bearer.split('.')[1], 'base64url')).sub : null;
    if (url.pathname === '/auth/v1/otp') return response({});
    if (url.pathname === '/auth/v1/verify') {
        if (holdVerify) { const held = holdVerify; holdVerify = null; return held.promise; }
        return response({ access_token: token('ariel'), refresh_token: 'fake-refresh', user: { id: 'forged-body-user' } });
    }
    if (url.pathname === '/auth/v1/user') {
        if (holdUser) { const held = holdUser; holdUser = null; return held.promise; }
        return response({ id, email: 'misleading-name@example.invalid' }, userStatus);
    }
    if (url.pathname === '/rest/v1/fk_scope_members') {
        assert.equal(url.searchParams.get('user_id'), 'eq.' + id);
        if (holdMembership) { const held = holdMembership; holdMembership = null; return held.promise; }
        return response(membershipOverride || (memberScopes[id] || []).map(scope_id => ({ user_id: id, scope_id })), membershipStatus);
    }
    if (url.pathname === '/rest/v1/fk_personal_kitchen_state') {
        const scope = url.searchParams.get('scope_id').slice(3);
        assert(memberScopes[id].includes(scope), 'Wrong account must never send a request to another scope');
        if (options.method === 'PATCH') {
            const body = JSON.parse(options.body);
            assert.deepEqual(Object.keys(body).sort(), ['household_supplies', 'pantry_inventory']);
            if (holdPatch) { const held = holdPatch; holdPatch = null; held.entered.resolve(); return held.promise; }
            remote[scope] = { pantryInventory: body.pantry_inventory, householdSupplies: body.household_supplies, version: remote[scope].version + 1, revision: remote[scope].revision + 1, syncStatus: 'active', dirty: false, updatedAt: new Date().toISOString() };
        } else if (holdState) { const held = holdState; holdState = null; return held.promise; }
        const data = remote[scope];
        return response(omitState ? [] : [{ scope_id: scope, pantry_inventory: data.pantryInventory, household_supplies: data.householdSupplies, version: data.version, updated_at: data.updatedAt, sync_revision: data.revision, sync_status: data.syncStatus }], stateStatus);
    }
    const file = url.pathname.split('/').at(-1);
    if (file in publicData) return response(publicData[file]);
    if (url.pathname.includes('meal_logs')) return response([]);
    throw Error('Unexpected request: ' + url.pathname);
};
function saveSession(id, expiry) { localStorage.setItem(sessionKey, JSON.stringify({ access_token: token(id, expiry), refresh_token: 'kept-for-relogin' })); }
async function login(id) { saveSession(id); return auth.initialize(); }
async function openEngine() { const engine = new Engine(); await engine.initialize(); await tick(); return engine; }
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function assertScope(engine, scope) {
    assert.equal(engine.personalScope, scope);
    assert.deepEqual(copy(engine.data.pantryInventory), copy(JSON.parse(localStorage.getItem(stateKey(scope))).pantryInventory));
    assert.equal(engine.data.householdSupplies.supplies[0].id, scope + '_supply');
}
const preservedKeys = () => new Map([...values].filter(([key]) => key.startsWith('kitchen_v2_personal_state_')));
function seed() {
    for (const scope of ['household', 'ariel']) {
        localStorage.setItem(stateKey(scope), JSON.stringify(state(scope)));
        localStorage.setItem(stateKey(scope) + '_backup', 'existing-' + scope + '-backup');
    }
}
seed();
localStorage.setItem('kitchen_v2_active_storage_scope', 'ariel');
for (const id of ['bebe', 'jason', 'ariel']) {
    assert.equal((await login(id)).id, id);
    const engine = await openEngine();
    assertScope(engine, id === 'ariel' ? 'ariel' : 'household');
    assert.equal(engine.calculateNutritionForMember([{ id: 'fixture', amount: 50 }], id).kcal, 50);
    const before = engine.personalScope;
    engine.setPersonalScope(before === 'ariel' ? 'household' : 'ariel');
    assert.equal(engine.personalScope, before, 'Manual cross-scope activation must be rejected');
}
assert.equal(localStorage.getItem('kitchen_v2_active_storage_scope'), 'ariel', 'Old setting is untouched and ignored');

// No auth/expired/ambiguous/unrecognized/network failure must neither load nor overwrite private caches.
for (const id of [null, 'outsider', 'ambiguous', 'unknown']) {
    seed();
    const before = preservedKeys();
    if (id) await login(id); else auth.signOut();
    const firstRequest = requests.length;
    const engine = await openEngine();
    assert.equal(engine.personalScope, null);
    assert.deepEqual(copy(engine.data.pantryInventory.foodStockStatus), {});
    await engine.toggleStock('forbidden', true);
    assert.equal(await engine.saveJson('pantry_inventory.json', {}), false);
    assert.deepEqual(preservedKeys(), before);
    assert(!requests.slice(firstRequest).some(r => /fk_personal_kitchen_state|pantry_inventory.json|household_supplies.json/.test(r.url.pathname)));
}
seed();
saveSession('ariel', Math.floor(Date.now() / 1000) - 1);
assert.equal(await auth.initialize(), null);
assert.equal(auth.getPersonalContext(), null);
for (const status of [401, 403, 500]) {
    membershipStatus = status;
    assert.equal(await login('ariel'), null);
}
membershipStatus = 200;
membershipOverride = [{ user_id: 'other-user', scope_id: 'household' }];
assert.equal(await login('ariel'), null);
membershipOverride = null;
userStatus = 401;
assert.equal(await login('ariel'), null);
userStatus = 200;
const beforeOffline = preservedKeys();
saveSession('ariel');
const savedToken = localStorage.getItem(sessionKey);
offline = true;
assert.equal(await auth.initialize(), null);
assert.equal(localStorage.getItem(sessionKey), savedToken, 'Network error must retain session for recovery');
assert.deepEqual(preservedKeys(), beforeOffline);
offline = false;
assert.equal((await auth.initialize()).id, 'ariel');
assertScope(await openEngine(), 'ariel');

// Expiry timer locks already open private data via the same UI subscription as sign-out.
let expired = false;
const unsubscribe = auth.subscribe(() => { expired = true; });
saveSession('ariel', Math.floor(Date.now() / 1000) + 1);
await auth.initialize();
expired = false;
await new Promise(resolve => setTimeout(resolve, 1100));
assert(expired);
assert.equal(auth.getPersonalContext(), null);
unsubscribe();

// Late user/membership and OTP responses cannot resurrect a signed-out identity.
saveSession('bebe');
const userWait = deferred(); holdUser = userWait;
const oldLogin = auth.initialize();
auth.signOut();
userWait.resolve(response({ id: 'bebe' }));
assert.equal(await oldLogin, null);
assert.equal(auth.context, null);
saveSession('bebe');
const membershipWait = deferred(); holdMembership = membershipWait;
const oldMembership = auth.initialize(); await tick();
assert.equal((await login('ariel')).id, 'ariel');
membershipWait.resolve(response([{ user_id: 'bebe', scope_id: 'household' }]));
assert.equal(await oldMembership, null);
assert.equal(auth.context.scopeId, 'ariel');
assert.equal((await auth.verifyEmailCode('someone@example.invalid', '12345678')).id, 'ariel', 'Verified /user wins over OTP body/email');

const verifyWait = deferred(); holdVerify = verifyWait;
const staleOtp = auth.verifyEmailCode('someone@example.invalid', '12345678');
auth.signOut();
verifyWait.resolve(response({ access_token: token('bebe') }));
await assert.rejects(staleOtp);
assert.equal(auth.context, null);
assert.equal(localStorage.getItem(sessionKey), null);
await login('ariel');

// Full app lifecycle: actual setup, private UI gate, logout, cross-tab, offline and resume.
await import('../web/src/main.js');
const app = appDefinition.setup();
await mounted[0]();
assert(app.personalReady.value);
assertScope(app.engine.value, 'ariel');
const oldEngine = app.engine.value;
const beforeLogout = preservedKeys();
app.signOut();
assert.equal(app.personalReady.value, false);
assert.deepEqual(copy(oldEngine.data.pantryInventory.shoppingList), []);
assert.deepEqual(preservedKeys(), beforeLogout);
saveSession('bebe');
await windowEvents.get('storage')({ key: sessionKey }); await tick();
assertScope(app.engine.value, 'household');
assert.notEqual(app.engine.value, oldEngine, 'Old view callbacks retain only the old, unauthorized engine');
await oldEngine.toggleStock('stale-view', true);
assert(!app.engine.value.data.pantryInventory.foodStockStatus['stale-view']);
const beforeDisconnect = preservedKeys();
offline = true;
windowEvents.get('offline')();
assert.equal(app.personalReady.value, false);
assert.deepEqual(copy(app.engine.value.data.householdSupplies), { supplies: [] });
assert.deepEqual(preservedKeys(), beforeDisconnect);
offline = false;
await windowEvents.get('online')(); await tick();
assertScope(app.engine.value, 'household');

// Cross-account delayed GET/PATCH cannot read or write into the next account, including same-scope accounts.
for (const method of ['GET', 'PATCH']) {
    await login('bebe');
    const engine = await openEngine();
    const pending = deferred();
    if (method === 'GET') holdState = pending;
    else { pending.entered = deferred(); holdPatch = pending; engine.persistPersonalKitchenState(); }
    const operation = engine.syncPersonalKitchenState().catch(() => false);
    if (method === 'PATCH') await pending.entered.promise;
    await login('ariel');
    const nextEngine = await openEngine();
    const before = preservedKeys();
    pending.resolve(response([{ scope_id: 'household', pantry_inventory: state('obsolete').pantryInventory, household_supplies: { supplies: [] }, version: 99, updated_at: '2999-01-01T00:00:00Z' }]));
    assert.equal(await operation, false);
    assert.deepEqual(preservedKeys(), before);
    assertScope(nextEngine, 'ariel');
}
await login('bebe');
const sameScopeEngine = await openEngine();
const delayed = deferred(); holdState = delayed;
const sameScopeOperation = sameScopeEngine.syncPersonalKitchenState().catch(() => false);
await login('jason');
delayed.resolve(response([]));
assert.equal(await sameScopeOperation, false);
assert.equal(auth.user.id, 'jason', 'Stale errors cannot invalidate a newer account');

// Account changes can also land between the transport helper and adapter continuations.
for (const method of ['getState', 'saveState']) {
    await login('bebe');
    const originalRequest = sync.request;
    sync.request = async function (...args) {
        const rows = await originalRequest.apply(this, args);
        await login('ariel');
        return rows;
    };
    try {
        await assert.rejects(sync[method]('household', { ...state('household'), revision: remote.household.revision }));
        assert.equal(auth.user.id, 'ariel', 'Adapter continuation must not clear the new identity');
    } finally { sync.request = originalRequest; }
}

// Permission revocation/empty state response closes the app and preserves cache and backup.
for (const status of [401, 403, 500]) {
    await login('ariel');
    const engine = await openEngine();
    const before = preservedKeys();
    stateStatus = status;
    await assert.rejects(engine.syncPersonalKitchenState());
    assert.equal(auth.context, null);
    assert.deepEqual(preservedKeys(), before);
    stateStatus = 200;
}
await login('ariel');
const deniedEngine = await openEngine();
omitState = true;
await assert.rejects(deniedEngine.syncPersonalKitchenState());
assert.equal(auth.context, null);
omitState = false;
await login('ariel');
const beforeWrongScope = requests.length;
await assert.rejects(sync.saveState('household', state('ariel')));
assert.equal(requests.length, beforeWrongScope, 'Wrong scope rejected before network');

const offlineEngine = await openEngine();
const beforeSyncOffline = preservedKeys();
offline = true;
await assert.rejects(offlineEngine.syncPersonalKitchenState());
assert.equal(auth.context, null);
assert.deepEqual(preservedKeys(), beforeSyncOffline);
offline = false;
await login('ariel');
omitState = true;
await assert.rejects(sync.saveState('ariel', state('ariel')));
assert.equal(auth.context, null);
omitState = false;
await login('ariel');

// New service/app instance (reopening FK) revalidates membership instead of trusting the saved scope.
localStorage.setItem('kitchen_v2_active_storage_scope', 'household');
const reopened = new FamilyAuthService();
assert.equal(reopened.context, null);
assert.equal((await reopened.initialize()).id, 'ariel');
assert.equal(reopened.context.scopeId, 'ariel');
reopened.signOut();

// First household may adopt legacy data, while first ariel must not load it.
for (const id of ['ariel', 'bebe']) {
    values.delete(stateKey(id === 'ariel' ? 'ariel' : 'household'));
    const scope = id === 'ariel' ? 'ariel' : 'household';
    const other = localStorage.getItem(stateKey(scope === 'ariel' ? 'household' : 'ariel'));
    await login(id);
    const engine = new Engine(); engine.personalKitchenSync = { enabled: false };
    const start = requests.length;
    await engine.initialize();
    assert.equal(engine.personalScope, scope);
    if (scope === 'ariel') {
        assert.deepEqual(copy(engine.data.pantryInventory.shoppingList), []);
        assert(!requests.slice(start).some(r => /pantry_inventory.json|household_supplies.json/.test(r.url.pathname)));
    } else assert.equal(engine.data.pantryInventory.shoppingList[0].id, 'legacy_shop');
    assert.equal(localStorage.getItem(stateKey(scope === 'ariel' ? 'household' : 'ariel')), other);
}
const beforeBackupFailure = localStorage.getItem(stateKey('household'));
const originalSet = localStorage.setItem;
localStorage.setItem = (key, value) => { if (key === stateKey('household') + '_backup') throw Error('fake quota'); originalSet(key, value); };
assert.throws(() => writePersonalKitchenState('household', emptyPersonalKitchenState()));
assert.equal(localStorage.getItem(stateKey('household')), beforeBackupFailure);
localStorage.setItem = originalSet;

// Exercise the visible OTP flow through actual app actions.
auth.signOut();
seed();
app.loginEmail.value = 'scope-is-not-derived-from-this@example.invalid';
await app.requestLoginCode();
assert.equal(app.loginStep.value, 'code');
app.loginCode.value = '12345678';
await app.verifyLoginCode();
assert(app.personalReady.value);
assertScope(app.engine.value, 'ariel');
const compiled = vue.compile(appDefinition.template, { decodeEntities: value => value });
assert.equal(typeof compiled, 'function');
const template = appDefinition.template;
assert(!template.includes('personal-scope-switcher'));
assert(template.includes("currentTab === 'pantry' && personalReady"));
assert(template.includes("currentTab === 'shopping' && personalReady"));
assert(!fs.readFileSync('web/style.css', 'utf8').includes('.personal-scope-'));
auth.signOut();
console.log('PASS: identity/membership binding, Bebe/Jason/Ariel, logout/account changes, expiry, offline/reconnect, denied/ambiguous permissions, wrong old setting, delayed Auth/GET/PATCH, reopen, legacy/cache/backup isolation, shopping/supplies and shared nutrition; actual app setup, fake network/storage only.');
