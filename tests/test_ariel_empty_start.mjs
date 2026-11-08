import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorizeTestEngine, switchTestScope } from './personal_scope_fixture.mjs';

const values = new Map();
let failSet = null;
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem(key, value) {
    if (key === failSet) throw Error('storage write failed');
    values.set(key, String(value));
  },
  removeItem: key => values.delete(key)
};
globalThis.sessionStorage = localStorage;
globalThis.Vue = { reactive: value => value };
globalThis.window = { location: { hostname: 'test.invalid' }, addEventListener() {}, removeEventListener() {} };
globalThis.fetch = async () => { throw Error('No actual network in fixture'); };
const { default: KitchenEngine } = await import('../web/src/engine/KitchenEngine.js');
const { emptyPersonalKitchenState: empty, readPersonalKitchenState: read, writePersonalKitchenState: write } = await import('../web/src/services/PersonalKitchenState.js');
const key = s => 'kitchen_v2_personal_state_' + s;
const copy = s => structuredClone(s);
const content = label => ({
  ...empty(),
  pantryInventory: {
    foodStockStatus: { [label]: true },
    supplyStockStatus: { [label+'_supply']: true },
    shoppingList: [{ id: label + '_shop', targetId: label }],
    foodCart: [{ id: label + '_cart' }]
  },
  householdSupplies: { supplies: [{ id: label + '_supply' }] }
});
const blankCloud = () => ({ ...empty(), revision: 0, syncStatus: 'legacy', version: 1, dirty: false, updatedAt: '2026-09-06T00:00:00Z' });
const deferred = () => { let resolve; return { promise: new Promise(r => (resolve = r)), resolve: value => resolve(value) }; };
const engine = (scope = 'ariel') => {
  const e = new KitchenEngine();
  authorizeTestEngine(e, scope);
  e.applyPersonalKitchenState(read(scope) || empty());
  return e;
};
const arrange = () => {
  values.clear(); failSet=null;
  write('ariel', content('old_ariel_data'));
  write('household', { ...content('household_data'), revision: 31, syncStatus: 'active', dirty: false }, { preserveUpdatedAt: true });
  values.set('kitchen_v2_custom_ingredients', '[{"id":"kept-custom"}]');
  values.set('kitchen_v2_deleted_meal_ids', '["kept-meal"]');
  values.set('family_kitchen_auth_session', '{"access_token":"session-preserved"}');
};
let cases=0;
function passed(label) { cases++; console.log('PASS:', label); }

// Correctly scoped action: preserve local primary as backup and all other keys.
{
  arrange();
  const before = new Map(values);
  const e=engine();
  let reads=0, patches=0;
  e.personalKitchenSync = { enabled:true, async getState(scope) { assert.equal(scope,'ariel'); reads++; return blankCloud(); }, async saveState(){patches++; throw Error('Must not PATCH a reset');} };
  assert.equal(await e.adoptEmptyArielKitchen(),true);
  assert.equal(reads,1); assert.equal(patches,0);
  assert.deepEqual(read('ariel').pantryInventory, empty().pantryInventory);
  assert.deepEqual(read('ariel').householdSupplies, empty().householdSupplies);
  assert.equal(read('ariel').revision,0);
  assert.equal(read('ariel').syncStatus,'legacy');
  assert.equal(read('ariel').dirty,false);
  assert.equal(e.personalRevision,0);
  assert.deepEqual(e.data.pantryInventory, empty().pantryInventory);
  assert.equal(values.get(key('ariel')+'_backup'), before.get(key('ariel')));
  assert.equal(values.get(key('ariel')+'_reset_backup'), before.get(key('ariel')));
  for(const [k,v] of before) if (!k.startsWith(key('ariel'))) assert.equal(values.get(k),v,k);
  // After first real edit, the known revision 0 enables a guarded PATCH.
  e.data.pantryInventory.shoppingList.push({id:'new',targetId:'new'});
  e.persistPersonalKitchenState();
  e.personalKitchenSync.saveState=async(scope,draft)=>{
    patches++;
    assert.equal(scope,'ariel');assert.equal(draft.revision,0);
    return {...draft,revision:1,syncStatus:'active',dirty:false};
  };
  assert.equal(await e.syncPersonalKitchenState(),true);
  assert.equal(patches,1);
  assert.equal(read('ariel').revision,1);
  assert.deepEqual(read('ariel').pantryInventory.shoppingList,[{id:'new',targetId:'new'}]);
  assert.equal(values.get(key('ariel')+'_reset_backup'), before.get(key('ariel')),'The reset backup stays intact after later edits');
  passed('Ariel verified empty legacy acceptance and first revision-protected edit');
}

// Household, unauthenticated and mismatched scopes cannot perform this action.
for (const scope of ['household','ariel']) {
  arrange();const e=engine(scope);
  let reads=0;
  e.personalKitchenSync={enabled:true,getState:async()=>{reads++;return blankCloud();}};
  if(scope==='ariel') e.auth={getPersonalContext:()=>null,isCurrentContext:()=>false};
  const before=new Map(values);
  await assert.rejects(e.adoptEmptyArielKitchen(),/只有已登入/);
  assert.equal(reads,0);assert.deepEqual(values,before);
}
passed('household and no-login blocked');

// Refuse any unexpected or nonempty cloud, and all read errors.
for (const cloud of [null,{...blankCloud(),syncStatus:'initial'},{...blankCloud(),revision:1},{...blankCloud(),pantryInventory: content('remote').pantryInventory},{...blankCloud(),householdSupplies:content('remote').householdSupplies}]) {
  arrange();const e=engine();
  let patches=0;e.personalKitchenSync={enabled:true,getState:async()=>cloud,saveState:async()=>{patches++;}};
  const before=new Map(values);
  await assert.rejects(e.adoptEmptyArielKitchen(),/雲端庫存已變更/);
  assert.deepEqual(values,before);assert.equal(patches,0);
}
arrange();
{
  const e=engine();e.personalKitchenSync={enabled:true,getState:async()=>{throw Error('offline');}};
  const before=new Map(values);
  await assert.rejects(e.adoptEmptyArielKitchen(),/offline/);
  assert.deepEqual(values,before);
}
passed('nonempty, revised, initial and offline cloud rejected');

// Refuse backup or primary storage failure without changing the on-screen data.
for (const suffix of ['_reset_backup','_backup','']) {
  arrange();const e=engine();
  const prior=copy(e.data.pantryInventory);
  e.personalKitchenSync={enabled:true,getState:async()=>blankCloud()};
  failSet=key('ariel')+suffix;
  const before=values.get(key('ariel'));
  await assert.rejects(e.adoptEmptyArielKitchen(),/storage write failed/);
  assert.equal(values.get(key('ariel')),before);
  assert.deepEqual(e.data.pantryInventory,prior);
  failSet=null;
}
passed('backup and primary write failures preserve original');

// Local edit while awaiting GET must not be overwritten.
{
  arrange();const e=engine(), gate=deferred();
  e.personalKitchenSync={enabled:true,getState:()=>gate.promise};
  const promise=e.adoptEmptyArielKitchen();
  e.data.pantryInventory.foodStockStatus['later-edit']=true;
  e.persistPersonalKitchenState();
  const before=values.get(key('ariel'));
  gate.resolve(blankCloud());
  await assert.rejects(promise,/本機庫存已變更/);
  assert.equal(values.get(key('ariel')),before);
  passed('in-flight local edit prevents reset');
}
// Login/scope change during request must not cross scope.
{
  arrange();const e=engine(), gate=deferred();
  e.personalKitchenSync={enabled:true,getState:()=>gate.promise};
  const promise=e.adoptEmptyArielKitchen();
  switchTestScope(e,'household');
  const before=new Map(values);
  gate.resolve(blankCloud());
  await assert.rejects(promise,/登入或本機庫存已變更/);
  assert.deepEqual(values,before);
  passed('account/scope switch prevents reset');
}
// Broken local data is not silently discarded.
{
  arrange();values.set(key('ariel'),'{malformed');
  const e=engine;
  assert.throws(()=>e('ariel'));
  passed('invalid local JSON fails closed');
}
const main=readFileSync(new URL('../web/src/main.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
assert(main.includes('v-if="personalReady && engine?.personalScope === \'ariel\'"'));
assert(main.includes("await target.adoptEmptyArielKitchen()"));
assert(main.includes("if (!confirm('將這台裝置樂樂原有的庫存"));
assert(main.includes('appVersion = \'2026.11.08.1\''));
assert(html.includes('main.js?v=20261108_FK14_SHARED_NUTRITION_V1'));
passed('Ariel-only UI, confirmation and PWA version link');
console.log('All Ariel empty-start cases passed:',cases);
