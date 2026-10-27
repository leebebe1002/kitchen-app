// Initialize mock browser globals before dynamic module evaluation
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};
globalThis.Vue = {
    reactive: (x) => x
};

import assert from 'node:assert/strict';

async function run() {
    console.log('Running KitchenEngine Security & Revoked Key Tests...');

    const { default: KitchenEngine } = await import('../web/src/engine/KitchenEngine.js');

    // 1. isRevokedLegacyKey input validation & false cases
    assert.equal(KitchenEngine.isRevokedLegacyKey(null), false, 'null should return false');
    assert.equal(KitchenEngine.isRevokedLegacyKey(undefined), false, 'undefined should return false');
    assert.equal(KitchenEngine.isRevokedLegacyKey(''), false, 'empty string should return false');
    assert.equal(KitchenEngine.isRevokedLegacyKey(12345), false, 'number should return false');
    assert.equal(KitchenEngine.isRevokedLegacyKey({}), false, 'object should return false');

    // 2. Fake mock keys (obviously non-credential strings) must NOT match
    const FAKE_ACTIVE_KEY_1 = 'mock-dummy-active-key-test-fixture-001';
    const FAKE_ACTIVE_KEY_2 = 'mock-dummy-active-key-test-fixture-002';
    assert.equal(KitchenEngine.isRevokedLegacyKey(FAKE_ACTIVE_KEY_1), false, 'Fake active key 1 must not match');
    assert.equal(KitchenEngine.isRevokedLegacyKey(FAKE_ACTIVE_KEY_2), false, 'Fake active key 2 must not match');

    // 3. Heuristic guard check:
    // Combined length (39) + revoked suffix ('wMZQ') + FNV-1a fingerprint ('efceaf35')
    // significantly reduces false positives for legacy client cleanup (without claiming cryptographic collision resistance).
    const FAKE_WRONG_LENGTH = 'mock-wrong-length-wMZQ';
    assert.equal(KitchenEngine.isRevokedLegacyKey(FAKE_WRONG_LENGTH), false, 'Key with wrong length must not match');

    const FAKE_WRONG_HASH = 'mock-test-fixture-len-39-suffix-is-wMZQ';
    assert.equal(FAKE_WRONG_HASH.length, 39);
    assert.equal(FAKE_WRONG_HASH.endsWith('wMZQ'), true);
    assert.equal(KitchenEngine.isRevokedLegacyKey(FAKE_WRONG_HASH), false, 'Key with different fingerprint must not match');

    // 4. Test mergeUserState config.json behavior
    const engine = new KitchenEngine();

    // Case A: Valid active key should be preserved
    const mergedActive = engine.mergeUserState('config.json', {
        gemini_api_key: FAKE_ACTIVE_KEY_1
    }, {
        gemini_api_key: ''
    });
    assert.equal(mergedActive.gemini_api_key, FAKE_ACTIVE_KEY_1, 'Valid active key must be preserved');

    // Case B: Empty key should remain empty
    const mergedEmpty = engine.mergeUserState('config.json', {
        gemini_api_key: ''
    }, {
        gemini_api_key: ''
    });
    assert.equal(mergedEmpty.gemini_api_key, '', 'Empty key must remain empty');

    // Case C: Non-config files should not be affected
    const mergedDishes = engine.mergeUserState('dishes.json', {
        dishes: [{ id: 'd1', name: 'Test Dish' }]
    }, {
        dishes: []
    });
    assert.equal(mergedDishes.dishes.length, 1, 'Dishes merge should function normally');

    // 5. Existing browser key must survive migration; config JSON must be credential-free.
    const fakeStore = new Map();
    globalThis.localStorage = {
        getItem: k => fakeStore.get(k) ?? null,
        setItem: (k, v) => fakeStore.set(k, String(v)),
        removeItem: k => fakeStore.delete(k)
    };
    const oldConfig = { gemini_api_key: FAKE_ACTIVE_KEY_1, geminiApiKey: FAKE_ACTIVE_KEY_1, preferredUnit: 'g' };
    localStorage.setItem('kitchen_v2_config.json', JSON.stringify(oldConfig));
    engine.data.config = { ...oldConfig };
    engine.protectLocalGeminiKey();
    assert.equal(localStorage.getItem('family_kitchen_gemini_key'), FAKE_ACTIVE_KEY_1);
    assert.deepEqual(JSON.parse(localStorage.getItem('kitchen_v2_config.json')), { preferredUnit: 'g' });
    assert.equal(engine.data.config.gemini_api_key, undefined);
    assert.equal(engine.data.config.geminiApiKey, undefined);
    assert.equal(engine.data.config.preferredUnit, 'g');

    // A newer user-selected key takes precedence over a stale legacy cache.
    localStorage.setItem('family_kitchen_gemini_key', FAKE_ACTIVE_KEY_2);
    localStorage.setItem('kitchen_v2_config.json', JSON.stringify(oldConfig));
    engine.data.config = { ...oldConfig };
    engine.protectLocalGeminiKey();
    assert.equal(localStorage.getItem('family_kitchen_gemini_key'), FAKE_ACTIVE_KEY_2);

    // Both camelCase and snake_case secrets are stripped even if passed to saveJson.
    await engine.saveJson('config.json', { ...oldConfig, preferredUnit: 'ml' });
    assert.deepEqual(JSON.parse(localStorage.getItem('kitchen_v2_config.json')), { preferredUnit: 'ml' });
    assert.equal(engine.data.config.gemini_api_key, undefined);
    assert.equal(localStorage.getItem('family_kitchen_gemini_key'), FAKE_ACTIVE_KEY_2);

    // Simulate the localhost write route: even a legacy caller may not send a key in POST JSON.
    globalThis.window = { location: { hostname: 'localhost' } };
    let sent = null;
    globalThis.fetch = async (url, options) => {
        assert.equal(url, '/api/data/config.json');
        sent = JSON.parse(options.body);
        return { ok: true };
    };
    await engine.saveJson('config.json', { ...oldConfig, preferredUnit: 'g' });
    assert.deepEqual(sent, { preferredUnit: 'g' });
    delete globalThis.window;
    delete globalThis.fetch;

    console.log('✅ All KitchenEngine security & revoked key tests passed successfully!');
}

run().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
