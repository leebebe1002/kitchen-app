import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { nutritionSnapshot } from '../web/src/utils/IngredientNutritionCache.js';

const read = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const official = read('src/data/ingredients.json');
const legacy = JSON.parse(execFileSync('git', ['show', '4b6f0d0:src/data/ingredients.json'], {encoding:'utf8'}));
const flatten = data => Object.values(data).flat();
const find = (data, id) => flatten(data).find(i => i.id === id);
const values = new Map();
globalThis.localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
};
globalThis.sessionStorage = localStorage;
globalThis.window = {location:{hostname:'test.invalid'},addEventListener(){},removeEventListener(){},isSecureContext:true};
globalThis.document = {body:{classList:{add(){},remove(){}}}};
const alerts = [];
globalThis.alert = text => alerts.push(text);
globalThis.confirm = () => true;
let copied;
Object.defineProperty(globalThis, 'navigator', {value:{clipboard:{writeText:async text => {copied = text;}}},configurable:true});
const offline = async () => {throw Error('Real network forbidden');};
globalThis.fetch = offline;
globalThis.Vue = vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8') + ';Vue', {console,setTimeout,clearTimeout});
const {default: Engine} = await import('../web/src/engine/KitchenEngine.js');
const {default: Modal} = await import('../web/src/components/IngredientDetailModal.js');
const {default: Calculator} = await import('../web/src/views/CalculatorView.js');
const {validateChefResult} = await import('../web/src/services/ChefAdvisor.js?v=20261027_CHEF_BUDGET_V1');
const key = 'kitchen_v2_ingredients.json';
const backupKey = key + '_pre_nutrition_v1';
const engine = new Engine();
engine.personalKitchenSync = {enabled:false};
const merge = (local, server = official) => engine.mergeUserState('ingredients.json', local, server);

// Complete historical shapes, not just calories, identify unedited old defaults.
const cached = structuredClone(legacy);
find(cached,'salmon').preferredStores = ['義美'];
const custom = {id:'private_test',name:'測試私房食材',category:'proteins',unitLabel:'g',per100g:{kcal:42}};
cached.proteins.push(custom);
const original = JSON.stringify(cached);
let merged = merge(cached);
for (const ing of flatten(official)) assert.deepEqual(nutritionSnapshot(find(merged,ing.id)),nutritionSnapshot(ing),ing.id);
assert.deepEqual(find(merged,'salmon').preferredStores,['義美']);
assert.equal(find(merged,'steamed_noodle').name,'維力蒸煮麵','Legacy cache receives confirmed brand rename');
assert.equal(find(merged,'steamed_noodle').per100g.kcal,362.2,'Legacy cache receives verified nutrition');
assert.equal(find(merged,'steamed_noodle').gramsPerPack,65,'Legacy cache receives package conversion');
assert.deepEqual(find(merged,custom.id),custom);
assert.equal(JSON.stringify(cached),original,'Merge does not mutate its input');
// Preserve user-edited nutrition, but refresh unedited Phase 1 cached generic noodles.
const phase1Cached = structuredClone(official);
const phase1Noodle = find(phase1Cached,'steamed_noodle');
phase1Noodle.name = '蒸煮麵'; delete phase1Noodle.brand; delete phase1Noodle.gramsPerPack;
phase1Noodle.per100g = {kcal:350,protein:11.6,fat:1.5,carbs:72.5,sodium:362};
phase1Noodle.nutritionCache = {base:{unitLabel:'g',per100g:{...phase1Noodle.per100g}},edited:false};
assert.equal(find(merge(phase1Cached),'steamed_noodle').per100g.kcal,362.2);
assert.equal(find(merge(phase1Cached),'steamed_noodle').name,'維力蒸煮麵');
phase1Noodle.nutritionCache.edited = true;
assert.equal(find(merge(phase1Cached),'steamed_noodle').per100g.kcal,350,'Marked personal nutrition edits survive branding');

// Explicit old edits win even when their values exactly equal a historical default.
const edited = {...find(legacy,'salmon'),per100g:{...find(legacy,'salmon').per100g,kcal:321}};
localStorage.setItem('kitchen_v2_custom_ingredients',JSON.stringify([edited]));
assert.equal(find(merge(cached),'salmon').per100g.kcal,321);
assert.equal(find(merge(null),'salmon').per100g.kcal,321,'Custom-only saved official ID survives missing main cache');
localStorage.setItem('kitchen_v2_custom_ingredients',JSON.stringify([find(legacy,'salmon')]));
assert.equal(find(merge(cached),'salmon').per100g.kcal,100,'Explicit historical-equal override is protected');
localStorage.setItem('kitchen_v2_custom_ingredients','[]');
const ambiguous = structuredClone(cached);
find(ambiguous,'salmon').per100g.kcal = 322;
let preserved = merge(ambiguous);
assert.equal(find(preserved,'salmon').per100g.kcal,322);
assert.equal(find(preserved,'salmon').nutritionReviewRequired,true);
assert.equal(find(merge(preserved),'salmon').nutritionReviewRequired,true,'Uncertainty survives restart');
const partial = structuredClone(cached);
find(partial,'coffee_capsule').perServing.kcal = 25;
assert.equal(find(merge(partial),'coffee_capsule').perUnit,undefined,'No conflicting official perUnit grafted onto custom serving');

// Future releases compare with the last official snapshot, rather than freezing defaults forever.
const future = structuredClone(official);
find(future,'salmon').per100g.kcal = 152;
assert.equal(find(merge(merged,future),'salmon').per100g.kcal,152);
find(merged,'salmon').per100g.kcal = 333;
assert.equal(find(merge(merged,future),'salmon').per100g.kcal,333,'Unmarked numeric edit detected against baseline');
assert.deepEqual(merge(cached,{}),cached,'Empty official response cannot erase local records');

// Actual loader: exact backup, second boot, offline fallback and storage quota failure.
localStorage.setItem(key,original);
globalThis.fetch = async () => ({ok:true,json:async () => structuredClone(official)});
await engine.fetchJson('ingredients.json','rawIngredients',{});
assert.equal(localStorage.getItem(backupKey),original);
assert.equal(find(engine.data.rawIngredients,'salmon').per100g.kcal,151.6);
await engine.fetchJson('ingredients.json','rawIngredients',{});
assert.equal(localStorage.getItem(backupKey),original,'Pre-migration backup is never rotated away');
globalThis.fetch = offline;
await engine.fetchJson('ingredients.json','rawIngredients',{});
assert.equal(find(engine.data.rawIngredients,'salmon').per100g.kcal,151.6);
values.delete(backupKey);localStorage.setItem(key,original);
const normalSet = localStorage.setItem;
localStorage.setItem = (k,v) => {if(k === backupKey) throw Error('fake quota');normalSet(k,v);};
globalThis.fetch = async () => ({ok:true,json:async () => structuredClone(official)});
await engine.fetchJson('ingredients.json','rawIngredients',{});
assert.equal(localStorage.getItem(key),original,'Backup failure cannot replace old persisted data');
assert.equal(find(engine.data.rawIngredients,'salmon').per100g.kcal,100);
localStorage.setItem = normalSet;globalThis.fetch = offline;

// Scope switches and saves cannot send nutrition or custom ingredients to Personal Kitchen sync.
engine.data.rawIngredients = merge(legacy);
engine.data.ingredients = flatten(engine.data.rawIngredients);
engine.data.pantryInventory = {foodStockStatus:{salmon:true},shoppingList:[],supplyStockStatus:{},foodCart:[]};
engine.data.householdSupplies = {supplies:[]};
engine.persistPersonalKitchenState();
const household = localStorage.getItem('kitchen_v2_personal_state_household');
const shared = engine.data.ingredients;
engine.setPersonalScope('ariel');
assert.equal(engine.data.ingredients,shared);
assert.deepEqual(engine.data.pantryInventory.shoppingList,[]);
assert.deepEqual(engine.data.pantryInventory.foodStockStatus,{});
assert.deepEqual(JSON.parse(localStorage.getItem('kitchen_v2_personal_state_household')).pantryInventory,JSON.parse(household).pantryInventory);
for (const scope of ['household','ariel']) {
    const state = JSON.parse(localStorage.getItem('kitchen_v2_personal_state_'+scope));
    assert(!('rawIngredients' in state) && !('ingredients' in state));
}

// Exercise the real REST adapter against fake responses; never authenticate with a real account.
const {default: auth} = await import('../web/src/services/FamilyAuthService.js?v=20260929_SUPABASE_KEY_V1');
const {default: sync} = await import('../web/src/services/PersonalKitchenSyncService.js?v=20260929_SUPABASE_KEY_V1');
const originalToken = auth.getAccessToken;
try {
    auth.getAccessToken = () => '';
    assert.equal(await sync.getState('household'),null);
    assert.equal(await sync.saveState('ariel',{}),false);
    auth.getAccessToken = () => 'isolated-test-token';
    for (const scope of ['household','ariel']) {
        const state = JSON.parse(localStorage.getItem('kitchen_v2_personal_state_'+scope));
        globalThis.fetch = async (url, options) => {
            assert(url.includes('scope_id=eq.'+scope));
            assert.equal(options.headers.Authorization,'Bearer isolated-test-token');
            if (options.method === 'PATCH') {
                assert.deepEqual(Object.keys(JSON.parse(options.body)).sort(),['household_supplies','pantry_inventory','version']);
            }
            return {ok:true,json:async () => [{scope_id:scope,pantry_inventory:state.pantryInventory,household_supplies:state.householdSupplies,version:2,updated_at:'2026-10-29T00:00:00Z'}]};
        };
        assert.deepEqual((await sync.getState(scope)).pantryInventory,state.pantryInventory);
        assert.equal((await sync.saveState(scope,state)).version,2);
    }
} finally {auth.getAccessToken = originalToken;globalThis.fetch = offline;}

const {h,reactive,createRenderer,nextTick} = Vue;
const renderer = createRenderer({createElement:()=>({}),insert(){},remove(){},setElementText(){},patchProp(){},createText:()=>({}),createComment:()=>({}),setText(){},setComment(){},parentNode:()=>null,nextSibling:()=>null});
function mount(component, props) {
    const root = {};let view;
    renderer.render(h({setup(){view = component.setup(props,{emit(){}});return()=>h('div');}}),root);
    return {view,close:()=>renderer.render(null,root)};
}

// Exercise the real modal and saveIngredient: metadata-only save is lossless; a nutrition edit is sticky.
for (const id of ['egg','coffee_capsule','salmon','angel_hair_pasta']) {
    const previous = engine.getIngredientById(id);
    const before = nutritionSnapshot(previous);
    const props = reactive({engine,isOpen:false,mode:'edit',initialIngredient:previous,context:'pantry'});
    const {view,close} = mount(Modal,props);
    props.isOpen = true;await nextTick();
    view.form.price = 123;
    await view.handleSave();
    assert.deepEqual(nutritionSnapshot(engine.getIngredientById(id)),before,id+': metadata save preserves nutrition');
    assert.equal(engine.getIngredientById(id).nutritionCache.edited,false,id+': metadata is not a nutrition override');
    if (id === 'egg') {
        assert.equal(view.form.displayBasis,'serving');
        view.form.perServing.kcal = 90;view.onServingInput();await view.handleSave();
        const saved = engine.getIngredientById(id);
        assert.equal(saved.perUnit.kcal,90);assert.equal(saved.per100g,undefined);
        assert.equal(find(merge(engine.data.rawIngredients),'egg').perUnit.kcal,90);
    }
    if (id === 'salmon') {
        view.form.per100g.kcal = 222;view.on100gInput();await view.handleSave();
        assert.equal(find(merge(engine.data.rawIngredients,future),'salmon').per100g.kcal,222);
    }
    close();
}

// Cache provenance stays on-device even when the existing localhost save endpoint is used.
window.location.hostname = 'localhost';
globalThis.fetch = async (url, options) => {
    assert.equal(url,'/api/data/ingredients.json');
    assert(!options.body.includes('nutritionCache'));
    assert(!options.body.includes('nutritionReviewRequired'));
    return {ok:true};
};
await engine.saveJson('ingredients.json',engine.data.rawIngredients);
assert(localStorage.getItem(key).includes('nutritionCache'));
window.location.hostname = 'test.invalid';globalThis.fetch = offline;

// All five missing count bases and nine saved recipe conflicts fail closed, for every member.
engine.data.ingredients = flatten(official);
const unresolved = ['century_egg','mushroom_meatball','egg_dumpling','taro_meatball','potato_ramen'];
const dishes = read('src/data/dishes.json').dishes;
// Existing ramen and hotpot recipes retain their original "1 包" intent.
for (const id of ['ramen_meal','hotpot']) {
    const dish = dishes.find(d => d.id === id);
    const portion = dish.defaultIngredients.find(i => i.id === 'steamed_noodle');
    assert.deepEqual(portion,{id:'steamed_noodle',amount:1,unit:'包'},id);
    assert.deepEqual(engine.getNutritionIssues([portion]),[],id);
    assert.equal(engine.calculateNutritionForMember([portion],'bebe').kcal,235.4,id);
    assert(Number.isFinite(engine.calculateNutritionForMember(dish.defaultIngredients,'bebe').kcal),id+' full recipe');
}
assert(Number.isNaN(engine.calculateNutritionForMember([{id:'angel_hair_pasta',amount:1,unit:'包'}],'bebe').kcal),
    'Other gram-based pasta cannot silently inherit verified noodle pack weight');
const conflicts = [];
for (const dish of dishes) for (const list of Object.values({default:dish.defaultIngredients,...dish.memberPortions})) {
    if (!list) continue;
    for (const req of list) if (engine.getNutritionIssues([req]).length) conflicts.push({dish:dish.id,...req,issues:engine.getNutritionIssues([req])});
}
assert.equal(conflicts.filter(r => r.id !== 'sugar_free_soymilk').length,7,JSON.stringify(conflicts));
assert.equal(conflicts.filter(r => r.id === 'sugar_free_soymilk').length,1,'Additional missing unitLabel: recipe ml versus servingUnit g');
for (const member of ['bebe','jason','ariel']) {
    for (const id of unresolved) {
        const req = {id,amount:1,unit:find(official,id).unitLabel};
        assert(Number.isNaN(engine.calculateNutritionForMember([req],member).kcal),id);
        assert(engine.getNutritionIssues([req])[0].includes('待確認'));
    }
    for (const req of [{id:'bacon',amount:20,unit:'g'},{id:'full_fat_milk_250',amount:150,unit:'ml'}]) {
        assert(Number.isNaN(engine.calculateNutritionForMember([req],member).kcal));
    }
    for (const [amount,unit,expected] of [[1,'包',235.4],[2,'包',470.9],[65,'g',235.4],[130,'g',470.9]]) {
        assert.equal(engine.getNutritionIssues([{id:'steamed_noodle',amount,unit}]).length,0);
        assert.equal(engine.calculateNutritionForMember([{id:'steamed_noodle',amount,unit}],member).kcal,expected);
    }
    assert.equal(engine.calculateNutritionForMember([{id:'steamed_noodle',amount:1,unit:'包'}],member).sodium,462.8);
    assert.equal(engine.calculateNutritionForMember([{id:'bacon',amount:2,unit:'條'}],member).kcal,86);
    assert.equal(engine.calculateNutritionForMember([{id:'century_egg',amount:0,unit:'顆'}],member).kcal,0);
    const valid = [{id:'salmon',amount:150,unit:'g'},{id:'angel_hair_pasta',amount:100,unit:'g'},{id:'coffee_capsule',amount:2,unit:'顆'}];
    assert.equal(engine.calculateNutritionForMember(valid,member).kcal,427.4);
    assert.throws(() => validateChefResult({chefComment:'test',portions:{[member]:[{id:'bacon',amount:20,unit:'g'}]}},{[member]:[{id:'bacon',amount:20,unit:'g'}]},engine));
}

// Display / clipboard cannot add grams to strips; incomplete meals cannot be persisted or sent to AI.
engine.data.dishes = [];engine.profiles = reactive(engine.profiles);
engine.data.pantryInventory.foodStockStatus = {bacon:true};
const {view,close} = mount(Calculator,{engine});
engine.data.dishes = [{id:'pasta_meal',name:'單位測試料理',recommendedProteins:['bacon'],memberPortions:{bebe:[{id:'bacon',amount:20,unit:'g'}],jason:[{id:'bacon',amount:2,unit:'條'}],ariel:[{id:'bacon',amount:25,unit:'g'}]}}];
await nextTick();view.diners.value = {bebe:true,jason:true,ariel:true};await nextTick();
assert.equal(view.totalIngredientsList.value.length,2);
for (const total of view.totalIngredientsList.value) assert.equal(total.amount,total.breakdown.reduce((sum,b)=>sum+Number(b.amount),0));
await view.copySOP();assert(copied.includes('45g'));assert(copied.includes('2條'));
let records = 0;engine.recordMeal = async () => {records++;};
await view.recordMeal();assert.equal(records,0);assert(alerts.at(-1).includes('待確認'));
globalThis.fetch = async () => {throw Error('Incomplete nutrition must not call AI');};
await view.calculate();assert.equal(view.aiChefAdvice.value.source,'local');
assert.equal(view.memberIngredients.value.bebe.find(i=>i.id==='bacon').unit,'g','Auto-balance must preserve unresolved recipe units');
assert.equal(view.memberIngredients.value.bebe.find(i=>i.id==='bacon').amount,20);
// The same rule applies to persisted member portions; no memory migration is required.
view.memberIngredients.value.bebe[0].amount = 17;
view.savePortionMemory('bebe');
await view.calculate();
assert.equal(view.memberIngredients.value.bebe[0].amount,17);
assert.equal(view.memberIngredients.value.bebe[0].unit,'g');
close();
Vue.compile(Modal.template,{decodeEntities:text=>text});
Vue.compile(Calculator.template,{decodeEntities:text=>text});
console.log('PASS: legacy/current/future cache, explicit/ambiguous edits, custom-only recovery, backup/quota/offline, scope boundary, real modal saves, five counts, nine conflicts, all members, totals/clipboard and blocked invalid recording/AI; memory fakes only.');
