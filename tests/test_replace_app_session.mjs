import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const values=new Map(),windowEvents=new Map(),documentEvents=new Map(),mounted=[];
globalThis.localStorage=globalThis.sessionStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
let refreshedURL;
globalThis.window={location:{hostname:'fixture.invalid',href:'https://fixture.invalid/web/index.html',replace:url=>{refreshedURL=url}},addEventListener:(n,f)=>windowEvents.set(n,f),removeEventListener(){}};
globalThis.document={hidden:false,body:{classList:{add(){},remove(){}}},addEventListener:(n,f)=>documentEvents.set(n,f),removeEventListener(){}};
const vue=vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',{console,setTimeout,clearTimeout});let App;
globalThis.Vue={...vue,onMounted:f=>mounted.push(f),onBeforeUnmount(){},createApp:app=>({mount(){App=app}})};
const {default:auth}=await import('../web/src/services/FamilyAuthService.js');
const copy=x=>JSON.parse(JSON.stringify(x));const response=x=>({ok:true,status:200,json:async()=>copy(x)});
const n={kcal:100,protein:2,carbs:3,fat:1,sodium:0};
const publicData={'ingredients.json':{proteins:[],veggies:[],carbs:[],sauces:[{id:'cocoa',name:'可可粉',category:'sauces',unitLabel:'g',per100g:n}]},'dishes.json':{dishes:[]},'favorite_foods.json':{favorites:[]},'config.json':{}};
const states={household:{pantry_inventory:{foodStockStatus:{cocoa:false},shoppingList:[{targetId:'cocoa',name:'可可粉',store:'全聯'}],foodCart:[]},household_supplies:{supplies:[]},sync_revision:2,sync_status:'active',version:1},ariel:{pantry_inventory:{foodStockStatus:{},shoppingList:[],foodCart:[]},household_supplies:{supplies:[]},sync_revision:2,sync_status:'active',version:1}};
let who='bebe';const requests=[];
globalThis.fetch=async(url,o={})=>{
 const u=new URL(url,'https://fixture.invalid');requests.push({u,o});
 if(u.pathname.endsWith('/auth/v1/user'))return response({id:who});
 if(u.pathname.endsWith('/fk_scope_members'))return response([{user_id:who,scope_id:who==='ariel'?'ariel':'household'}]);
 if(u.pathname.endsWith('/fk_meal_access'))return response([{user_id:who,member:who,is_manager:who==='bebe'}]);
 if(u.pathname.endsWith('/fk_personal_kitchen_state')){const scope=u.searchParams.get('scope_id').slice(3),state=states[scope];if(o.method==='PATCH'){Object.assign(state,JSON.parse(o.body));state.sync_revision++}return response([{...state,scope_id:scope}]);}
 if(u.pathname.includes('/storage/v1/object/'))return response({});
 if(u.pathname.endsWith('/meal_logs'))return response([]);
 const file=u.pathname.split('/').at(-1);if(file in publicData)return response(publicData[file]);
 throw Error('Unexpected request '+u.pathname);
};
function session(){const token='test.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fake';values.set('family_kitchen_auth_session',JSON.stringify({access_token:token}));}
session();await import('../web/src/main.js');const app=App.setup();await mounted[0]();app.setTab('pantry');
// This synthetic "cocoa" is a private test ingredient, not the retired canonical cocoa_powder.
// The new SSOT must block unverified official edits, while private replacements remain local.
app.engine.value.officialIngredientById.delete('cocoa');
await new Promise(r=>setTimeout(r,0));assert(app.personalReady.value);
// Main stores Engine through ref(), reproducing production's reactive service wrappers.
const {default:Modal}=await import('../web/src/components/IngredientDetailModal.js');
const props=vue.reactive({engine:app.engine.value,isOpen:false,mode:'create',initialIngredient:null,initialName:'',context:'pantry'});
let view;const events=[],dialogs=[];
const renderer=vue.createRenderer({createElement:()=>({}),insert(){},remove(){},setElementText(){},patchProp(){},createText:()=>({}),createComment:()=>({}),setText(){},setComment(){},parentNode:()=>null,nextSibling:()=>null});const root={};
renderer.render(vue.h({setup(){view=Modal.setup(props,{emit:(...a)=>events.push(a)});return()=>vue.h('div')}}),root);
props.isOpen=true;await vue.nextTick();Object.assign(view.form,{name:'有機可可粉',brand:'新品牌',category:'sauces',servingSize:10,per100g:{...n},perServing:{kcal:10,protein:.2,carbs:.3,fat:.1,sodium:0},stock:true});
view.evidenceBasis.value='as_sold';view.photo.status='success';view.photo.url='data:image/png;base64,AAAA';
globalThis.confirm=m=>{dialogs.push(m);return true};globalThis.alert=m=>dialogs.push(m);
await view.replaceExisting();await new Promise(r=>setTimeout(r,20));
assert.equal(dialogs.length,2,dialogs);assert.match(dialogs[1],/已取代/);assert(app.personalReady.value,auth.message);assert(auth.getPersonalContext(),auth.message);assert(events.some(x=>x[0]==='saved'));
assert.equal(app.engine.value.getIngredientById('cocoa').brand,'新品牌');
console.log('PASS actual App reactive Engine -> Modal replace -> real upload+personal sync -> two dialogs -> session still ready',requests.length);
// A document refresh must preserve every stored ingredient, photo reference, scope and session.
assert.equal(app.appVersion,'2026.11.09.8');
const storedBefore=JSON.stringify([...values]);await app.refreshData();
assert.equal(new URL(refreshedURL).origin,'https://fixture.invalid');assert(new URL(refreshedURL).searchParams.has('fk_update'));
assert.equal(JSON.stringify([...values]),storedBefore);
renderer.render(null,root);clearTimeout(auth.expiryTimer);

const tag='20261106_INGREDIENT_PHOTO_REOPEN_V1';
for(const [file, imports] of [
 ['web/src/main.js',['KitchenEngine.js','PantryView.js','CalculatorView.js']],
 ['web/src/engine/KitchenEngine.js',['IngredientPhotoStore.js','IngredientBaselineUpdate.js']],
 ['web/src/utils/IngredientBaselineUpdate.js',['IngredientPhotoStore.js']],
 ['web/src/views/PantryView.js',['IngredientDetailModal.js']],
 ['web/src/views/CalculatorView.js',['IngredientDetailModal.js']],
 ['web/weight-basis-preview.html',['KitchenEngine.js','CalculatorView.js']]
]){
 const source=fs.readFileSync(file,'utf8');
 for(const name of imports){
  const changed = (file === 'web/src/main.js'
      && ['KitchenEngine.js','CalculatorView.js','PantryView.js'].includes(name))
      || (file === 'web/src/engine/KitchenEngine.js' && name === 'IngredientBaselineUpdate.js')
      || (file === 'web/weight-basis-preview.html' && ['KitchenEngine.js','CalculatorView.js'].includes(name))
      || ((file === 'web/src/views/PantryView.js' || file === 'web/src/views/CalculatorView.js')
         && name === 'IngredientDetailModal.js');
  const expected = changed ? '20261109_FK21_THREE_FOODS_V2'
      : (name === 'IngredientBaselineUpdate.js'
          ? '20261108_FK14_COCOA_RETIRED_V1' : tag);
  assert(source.includes(name+'?v='+expected),file+' must load the updated '+name);
 }
}

assert(fs.readFileSync('web/index.html','utf8').includes('main.js?v=20261109_FK21_THREE_FOODS_V2'));
assert(fs.readFileSync('web/src/main.js','utf8').includes('IngredientPhotoAudit.js?v=20261107_PHOTO_AUDIT_COMPACT_V1'));
const photoAuditBefore=JSON.stringify([...values]);
await app.checkIngredientPhotos();
assert.equal(app.photoAudit.value.busy,false);
assert(app.photoAudit.value.text.startsWith('FK 食材照片檢查 2026.11.09.8'));
assert.equal(JSON.stringify([...values]),photoAuditBefore);
vue.compile(App.template,{decodeEntities:text=>text});
