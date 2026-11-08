import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    ARIEL_OFFICIAL_RESET_KEY, recoverArielOfficialReset, applyArielOfficialReset
} from '../web/src/utils/ArielOfficialIngredientReset.js';
import { approvedIngredientBaseline, INGREDIENT_CACHE_KEY, CUSTOM_INGREDIENT_KEY } from '../web/src/utils/IngredientBaselineUpdate.js';
import { authorizeTestEngine } from './personal_scope_fixture.mjs';

const officialText = fs.readFileSync('src/data/ingredients.json', 'utf8');
const official = await approvedIngredientBaseline(officialText);
const all = Object.values(official).flat();
assert.equal(all.length, 100);
const find = id => all.find(item => item.id === id);
const old = structuredClone(official);
old.proteins.find(item => item.id === 'egg').perUnit.kcal = 999;
const oldCustom = [
    { ...find('egg'), perUnit: {kcal:999,protein:99,carbs:9,fat:9,sodium:9}, nutritionCache:{edited:true}},
    {id:'device_private_only',name:'樂樂舊食材',category:'sauces',per100g:{kcal:500}}
];
const original = new Map([
    [INGREDIENT_CACHE_KEY, JSON.stringify(old)],
    [CUSTOM_INGREDIENT_KEY, JSON.stringify(oldCustom)],
    ['kitchen_v2_personal_state_ariel', '{"scopeId":"ariel","pantryInventory":{"foodStockStatus":{},"shoppingList":[{"targetId":"egg"}]},"householdSupplies":{"supplies":[]}}'],
    ['kitchen_v2_dishes.json','{"dishes":[{"id":"meal1"}]}'],
    ['kitchen_v2_deleted_meal_ids','["meal1"]'],
    ['family_kitchen_auth_session','{"access_token":"do_not_touch"}']
]);
let values;
let failWrite=()=>false;
const storage = {
    getItem:key=>values.get(key)??null,
    setItem(key,value) {if(failWrite(key,value))throw Error('simulated quota');values.set(key,String(value))},
    removeItem:key=>values.delete(key)
};
const reset=()=>{ values=new Map(original);failWrite=()=>false };
const unchanged=()=>{for(const [key,value] of original)assert.equal(values.get(key),value,key)};
const noopPhotoStore={get:async()=>{throw Error('No photo refs expected')},put:async()=>{}};
reset();
const updated = await applyArielOfficialReset(official,{storage,photoStore:noopPhotoStore});
assert.deepEqual(updated,official);
assert.deepEqual(JSON.parse(values.get(INGREDIENT_CACHE_KEY)),official);
assert.deepEqual(JSON.parse(values.get(CUSTOM_INGREDIENT_KEY)),[]);
assert.equal(JSON.parse(values.get(ARIEL_OFFICIAL_RESET_KEY)).scope,'ariel');
assert.equal(JSON.parse(values.get(ARIEL_OFFICIAL_RESET_KEY)).status,'complete');
assert.equal(JSON.parse(values.get(ARIEL_OFFICIAL_RESET_KEY)).before[INGREDIENT_CACHE_KEY],original.get(INGREDIENT_CACHE_KEY));
assert.equal(JSON.parse(values.get(ARIEL_OFFICIAL_RESET_KEY)).before[CUSTOM_INGREDIENT_KEY],original.get(CUSTOM_INGREDIENT_KEY));
for(const [key,value] of original) if(key!==INGREDIENT_CACHE_KEY&&key!==CUSTOM_INGREDIENT_KEY)assert.equal(values.get(key),value,key);
assert.equal(await applyArielOfficialReset(official,{storage,photoStore:noopPhotoStore}),null);
values.set(CUSTOM_INGREDIENT_KEY,'[{"id":"later_user_edit"}]');
assert.equal(await applyArielOfficialReset(official,{storage,photoStore:noopPhotoStore}),null);
assert.equal(values.get(CUSTOM_INGREDIENT_KEY),'[{"id":"later_user_edit"}]');
console.log('PASS: exact 101 official, custom removed and backed up, once only, personal keys untouched');

// Partial writes must be fully reversible; simulated crash recovery before loader reads cache.
for(const step of ['journal','custom','official','finish']) {
    reset();let failed=false;
    failWrite=(key,value)=>{
        const match=step==='journal'?key===ARIEL_OFFICIAL_RESET_KEY:
            step==='custom'?key===CUSTOM_INGREDIENT_KEY:
            step==='official'?key===INGREDIENT_CACHE_KEY:
            key===ARIEL_OFFICIAL_RESET_KEY&&JSON.parse(value).status==='complete';
        if(match&&!failed){failed=true;return true}return false;
    };
    await assert.rejects(applyArielOfficialReset(official,{storage,photoStore:noopPhotoStore}));
    unchanged();
    failWrite=()=>false;
    assert(await applyArielOfficialReset(official,{storage,photoStore:noopPhotoStore}));
}
reset();
const before={ [INGREDIENT_CACHE_KEY]:original.get(INGREDIENT_CACHE_KEY),[CUSTOM_INGREDIENT_KEY]:original.get(CUSTOM_INGREDIENT_KEY) };
values.set(ARIEL_OFFICIAL_RESET_KEY,JSON.stringify({scope:'ariel',status:'pending',before}));
values.set(INGREDIENT_CACHE_KEY,'{"incomplete":true}');
values.set(CUSTOM_INGREDIENT_KEY,'[]');
assert.equal(recoverArielOfficialReset(storage),false);
unchanged();
assert.equal(JSON.parse(values.get(ARIEL_OFFICIAL_RESET_KEY)).status,'rolledBack');
console.log('PASS: backup, 2 writes, final journal failures and interrupted 2-key updates restore');

// Source changes during async photo backup must stop any mutation.
reset();
await assert.rejects(applyArielOfficialReset(official,{storage,photoStore:noopPhotoStore,isCurrent:()=>false}),/登入或本機食材已變更/);
unchanged();
await assert.rejects(applyArielOfficialReset({...official,veggies:[]},{storage,photoStore:noopPhotoStore}),/不完整/);
unchanged();
console.log('PASS: interrupted auth, malformed official cannot reset');

// Old inline photos must move into a verified binary backup before the primary cache is replaced.
reset();
const blob=new Blob([new Uint8Array([1,2,3,4])],{type:'image/png'});
let storedBlob=null;
const photoStore={
    put:async(id,value)=>{storedBlob={id,value}},
    get:async id=>{assert.equal(id,storedBlob.id);return storedBlob.value}
};
const photoOld=structuredClone(old);
photoOld.sauces[0].photoUrl='data:image/png;base64,AQIDBA==';
values.set(INGREDIENT_CACHE_KEY,JSON.stringify(photoOld));
await applyArielOfficialReset(official,{storage,photoStore});
const photoBefore=JSON.parse(JSON.parse(values.get(ARIEL_OFFICIAL_RESET_KEY)).before[INGREDIENT_CACHE_KEY]);
assert.equal(photoBefore.sauces[0].photoUrl,null);
assert(photoBefore.sauces[0].localPhotoRefs.photoUrl);
assert(!values.get(ARIEL_OFFICIAL_RESET_KEY).includes('data:image'));
console.log('PASS: inline legacy photo is backed up to binary, never persisted as Base64');

// Real engine only adopts when authenticated as Ariel on her own single-person device.
globalThis.localStorage=storage;
globalThis.sessionStorage=storage;
globalThis.window={location:{hostname:'test.invalid'},addEventListener(){},removeEventListener(){}};
globalThis.Vue={reactive:x=>x};
const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
const setup=(scope='ariel')=>{
    reset();
    const e=new Engine({photoStore:noopPhotoStore});
    authorizeTestEngine(e,scope);
    e.officialIngredientById=new Map(all.map(item=>[item.id,item]));
    e.data.rawIngredients=structuredClone(old);
    e.data.ingredients=Object.values(e.data.rawIngredients).flat();
    e.data.pantryInventory={foodStockStatus:{},supplyStockStatus:{},shoppingList:[{targetId:'egg'}],foodCart:[]};
    e.data.householdSupplies={supplies:[{id:'keep'}]};
    return e;
};
const server=async url=>{
    assert(new URL(url).pathname.endsWith('/src/data/ingredients.json'));
    return {ok:true,text:async()=>officialText};
};
globalThis.fetch=server;
for(const scope of ['ariel','household']){
    const e=setup(scope);
    const inventory=JSON.stringify(e.data.pantryInventory);
    const supplies=JSON.stringify(e.data.householdSupplies);
    await e.maybeAdoptOfficialArielIngredients();
    assert.equal(JSON.stringify(e.data.pantryInventory),inventory);
    assert.equal(JSON.stringify(e.data.householdSupplies),supplies);
    if(scope==='ariel'){
        assert.equal(e.data.rawIngredients.proteins.find(i=>i.id==='egg').perUnit.kcal,find('egg').perUnit.kcal);
        assert.equal(Object.values(e.data.rawIngredients).flat().length,100);
        assert.match(e.arielOfficialResetMessage,/100 項/);
        assert(recoverArielOfficialReset());
    } else{
        unchanged();
        assert.equal(values.get(ARIEL_OFFICIAL_RESET_KEY),undefined);
    }
}
console.log('PASS: Engine applies ONLY authenticated Ariel without affecting pantry or household');

{
    const e=setup();
    values.set('kitchen_v2_personal_state_household','{"exists":true}');
    await e.maybeAdoptOfficialArielIngredients();
    assert.match(e.arielOfficialResetMessage,/也有家庭資料/);
    assert.equal(values.get(ARIEL_OFFICIAL_RESET_KEY),undefined);
}
{
    const e=setup();
    e.data.pantryInventory.shoppingList=[{targetId:'device_private_only'}];
    await e.maybeAdoptOfficialArielIngredients();
    assert.match(e.arielOfficialResetMessage,/引用私房食材/);
    assert.equal(values.get(ARIEL_OFFICIAL_RESET_KEY),undefined);
}
console.log('PASS: refuses shared device and private shopping reference, preserving all data');
{
    const e=setup();
    globalThis.fetch=async()=>{throw Error('offline')};
    await e.maybeAdoptOfficialArielIngredients();
    assert.equal(values.get(ARIEL_OFFICIAL_RESET_KEY),undefined);
    unchanged();
    assert.match(e.arielOfficialResetMessage,/尚未更新/);
}
console.log('PASS: offline does not overwrite old data');
console.log('ARIEL OFFICIAL ONE-TIME RESET ALL PASS');
