import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const values=new Map(),requests=[];
globalThis.localStorage=globalThis.sessionStorage={getItem:k=>values.get(k)??null,setItem(k,v){assert(!String(v).includes('data:image'),'No encoded photo persistence');values.set(k,String(v));},removeItem:k=>values.delete(k)};
globalThis.window={location:{hostname:'fixture.invalid'},addEventListener(){},removeEventListener(){}};
globalThis.document={body:{classList:{add(){},remove(){}}}};
globalThis.Vue=vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',{console,setTimeout,clearTimeout});
const alerts=[];
globalThis.alert=message=>alerts.push(message);globalThis.confirm=()=>true;
const {default:auth}=await import('../web/src/services/FamilyAuthService.js');
const {default:service}=await import('../web/src/services/SupabaseService.js?v=20261105_INGREDIENT_PHOTO_AUTH_V1');
const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
const {default:Modal}=await import('../web/src/components/IngredientDetailModal.js');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
let catalog;
let status=200,member='bebe',releaseUpload=null;
const identity=who=>{
 member=who; const token='test-only-'+who;values.set('family_kitchen_auth_session',JSON.stringify({access_token:token}));
 auth.context=Object.freeze({userId:who,scopeId:who==='ariel'?'ariel':'household',token,expiresAt:Date.now()+60000});auth.message='';return auth.context;
};
globalThis.fetch=async(url,options={})=>{
 const path=new URL(url,'https://fixture.invalid/web/').pathname;requests.push({path,options});
 if(path.endsWith('/ingredients.json'))return {ok:true,json:async()=>structuredClone(catalog)};
 if(path.endsWith('/fk_meal_access'))return {ok:true,status:200,json:async()=>[{user_id:member,member,is_manager:member==='bebe'}]};
 assert(path.includes('/storage/v1/object/meal-photos/'),'Unexpected request: '+path);
 if(releaseUpload)await new Promise(resolve=>{releaseUpload=resolve});
 if(status==='offline')throw Error('offline');
 return {ok:status===200,status,json:async()=>({error:'fixture rejected upload'})};
};
// Reproduce the original screenshot using the real service: 'ingredient' is not a meal member.
identity('bebe');const beforeBug=auth.context;
assert.equal(await service.uploadMealPhoto(png,'ingredient'),null);
assert.equal(auth.context,null);assert.match(auth.message,/餐點權限已變更/);assert(beforeBug);

const n={kcal:100,protein:2,carbs:3,fat:1,sodium:0};
const renderer=Vue.createRenderer({createElement:()=>({}),insert(){},remove(){},setElementText(){},patchProp(){},createText:()=>({}),createComment:()=>({}),setText(){},setComment(){},parentNode:()=>null,nextSibling:()=>null});
// Exercise actual Modal -> Engine -> SupabaseService with only the network boundary replaced.
for(const who of ['bebe','ariel','jason',null])for(const action of ['replace','save'])for(const outcome of [200,403,'offline']){
 values.clear();requests.length=0;alerts.length=0;status=outcome;const context=who ? identity(who) : null;
 if(!who)auth.invalidate();
 const original={id:'cocoa',name:'可可粉',category:'sauces',unitLabel:'g',per100g:{...n}};
 const raw={proteins:[],veggies:[],carbs:[],sauces:[original]};
 catalog=structuredClone(raw);
 values.set('kitchen_v2_ingredients.json',JSON.stringify(raw));values.set('kitchen_v2_custom_ingredients','[]');
 const engine=new Engine();assert.equal(engine.supabase,service,'must use the real versioned upload service');
 engine.personalContext=context;engine.personalScope=context?.scopeId || null;engine.personalKitchenSync={enabled:false};
 engine.data.rawIngredients=raw;engine.data.ingredients=[original];engine.data.pantryInventory={foodStockStatus:{},shoppingList:[],foodCart:[]};engine.data.householdSupplies={supplies:[]};
 const unsubscribe=auth.subscribe(()=>{if(!auth.getPersonalContext())engine.clearPersonalScope()});
 const props=Vue.reactive({engine:Vue.markRaw(engine),isOpen:false,mode:'create',initialIngredient:null,initialName:'',context:'pantry'});
 let view;const events=[],root={};
 renderer.render(Vue.h({setup(){view=Modal.setup(props,{emit:(...args)=>events.push(args)});return()=>Vue.h('div')}}),root);
 props.isOpen=true;await Vue.nextTick();
 view.form.name=action==='replace'?'有機可可粉':'獨立新食材';view.form.brand=action==='replace'?'測試品牌':'';view.form.category='sauces';
 view.form.per100g={...n};view.form.perServing={kcal:10,protein:.2,carbs:.3,fat:.1,sodium:0};view.form.servingSize=10;
 view.evidenceBasis.value='as_sold';view.evidenceUnit.value='g';view.photo.status='success';view.photo.url=png;
 if(action==='replace')await view.replaceExisting();else await view.handleSave();
 assert.equal(auth.getPersonalContext(),context,'ingredient upload must never invalidate shared login');
 assert.equal(engine.personalScope,context?.scopeId || null);assert(events.some(x=>x[0]==='saved'));assert(events.some(x=>x[0]==='close'));
 const saved=engine.data.ingredients.find(x=>x.name===view.form.name);assert(saved);assert.equal(saved.nutritionEvidence.status,'verified');
 if(action==='replace')assert.equal(saved.id,'cocoa');
 if(who && outcome===200)assert(saved.photoUrl.includes('/object/public/meal-photos/ingredients/'+context.scopeId+'_'));
 else assert.equal(saved.photoUrl,null);
 assert(!requests.some(r=>r.path.includes('/rest/v1/')),'ingredient photos cannot enter meal authorization/data APIs');
 assert.equal(requests.length,who?1:0);
 if(who){
  assert.equal(requests[0].options.headers.Authorization,'Bearer '+context.token);
  assert(requests[0].options.body instanceof Blob);assert.equal(requests[0].options.method,'POST');
 }
 assert.equal(events.find(x=>x[0]==='saved')[1].photoUrl,saved.photoUrl);
 assert.equal(alerts.some(message=>message.includes('照片上傳失敗')),saved.photoUrl===null);
 assert.equal(JSON.parse(values.get('kitchen_v2_custom_ingredients')).find(x=>x.id===saved.id).photoUrl,saved.photoUrl);

 // Restart from the same device. A previously populated catalog can be stale
 // while the device's custom record still has the successfully saved photo.
 if(who && outcome===200){
  const stale=structuredClone(JSON.parse(values.get('kitchen_v2_ingredients.json')));
  const item=stale.sauces.find(x=>x.id===saved.id);
  item.photoUrl=null;item.nutritionCache={edited:true};
  values.set('kitchen_v2_ingredients.json',JSON.stringify(stale));
 }
 const reboot=new Engine();
 await reboot.fetchJson('ingredients.json','rawIngredients',{});
 reboot.mergeCustomUserIngredients();
 reboot.data.ingredients=Object.values(reboot.data.rawIngredients).flat();
 props.isOpen=false;await Vue.nextTick();
 props.engine=Vue.markRaw(reboot);props.mode='edit';props.initialIngredient=reboot.getIngredientById(saved.id);
 props.isOpen=true;await Vue.nextTick();
 assert.equal(view.photo.url,saved.photoUrl,'Reopened editor shows the persisted photo, or null after failure');
 renderer.render(null,root);unsubscribe();
}
// No login: do not upload. A response from an old account cannot be accepted by the new account.
requests.length=0;auth.invalidate();assert.equal(await service.uploadIngredientPhoto(png),null);assert.equal(requests.length,0);
identity('bebe');releaseUpload=true;const pending=service.uploadIngredientPhoto(png);
while(typeof releaseUpload!=='function')await new Promise(r=>setTimeout(r,0));
const newContext=identity('ariel');releaseUpload();releaseUpload=null;assert.equal(await pending,null);assert.equal(auth.context,newContext);
// Real meal uploads still check meal access and preserve their existing member-specific path.
status=200;requests.length=0;identity('jason');assert((await service.uploadMealPhoto(png,'jason')).includes('/meals/jason_'));assert(requests.some(x=>x.path.endsWith('/fk_meal_access')));
requests.length=0;assert.equal(await service.uploadMealPhoto(png,'bebe'),null);assert.equal(auth.context,null);assert(!requests.some(x=>x.path.includes('/storage/')),'forbidden meal still blocked');
console.log('PASS: reproduced old forced logout; actual Modal/Engine/Service save+replace for Bebe/Ariel/Jason, storage success/403/offline, canonical ID, no-login, account-switch, Base64 safety and unchanged meal authorization');
