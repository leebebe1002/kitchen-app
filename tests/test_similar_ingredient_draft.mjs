import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { authorizeTestEngine } from './personal_scope_fixture.mjs';
const values = new Map();
let failKey = null;
globalThis.localStorage = globalThis.sessionStorage = {
    getItem:key=>values.get(key)??null,
    setItem(key,value){assert(!String(value).includes('data:image'),'No Base64 persistence'); assert(!String(value).includes('blob:'),'No object URL persistence'); if(key===failKey) throw Error('quota'); values.set(key,String(value));},
    removeItem:key=>values.delete(key)
};
globalThis.window={location:{hostname:'fixture.invalid',origin:'https://fixture.invalid'},addEventListener(){},removeEventListener(){}};
globalThis.document={body:{classList:{add(){},remove(){}}}};
globalThis.Vue=vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',{console,setTimeout,clearTimeout});
const {default:Modal}=await import('../web/src/components/IngredientDetailModal.js');
const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
const n={kcal:100,protein:2,carbs:3,fat:1,sodium:0};
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const original={id:'cocoa',name:'可可粉',brand:'舊品牌',category:'sauces',unitLabel:'g',per100g:n,photoUrl:'https://example.invalid/old.png'};
const other={...original,id:'other',name:'可可粉（無糖）'};
const raw={proteins:[],veggies:[],carbs:[],sauces:[original,other]};
const cache='kitchen_v2_ingredients.json',custom='kitchen_v2_custom_ingredients';
let alerts=[],answer=true,confirmations=[];
globalThis.alert=message=>alerts.push(message);
globalThis.confirm=message=>{confirmations.push(message);return answer;};
const renderer=Vue.createRenderer({createElement:()=>({}),insert(){},remove(){},setElementText(){},patchProp(){},createText:()=>({}),createComment:()=>({}),setText(){},setComment(){},parentNode:()=>null,nextSibling:()=>null});
function fixture(scope='household') {
    values.clear(); failKey=null;
    values.set(cache,JSON.stringify(raw));values.set(custom,'[]');
    for(const scope of ['household','ariel']) values.set('kitchen_v2_personal_state_'+scope,JSON.stringify({scopeId:scope,pantryInventory:{foodStockStatus:{cocoa:false},shoppingList:[{targetId:'cocoa',name:'舊名'},{targetId:'other',name:'有機可可粉',store:'保留'}],foodCart:[{id:'cocoa',quantity:2}]},householdSupplies:{supplies:[]}}));
    values.set('kitchen_v2_pantry_inventory.json','legacy-untouched');
    const photos=new Map();
    const engine=new Engine({photoStore:{async put(k,b){photos.set(k,b)},async get(k){return photos.get(k)}}});
    engine.data.rawIngredients=structuredClone(raw);engine.data.ingredients=Object.values(engine.data.rawIngredients).flat();
    authorizeTestEngine(engine,scope);
    engine.data.pantryInventory=JSON.parse(values.get('kitchen_v2_personal_state_'+scope)).pantryInventory;
    engine.data.householdSupplies={supplies:[]}; engine.personalKitchenSync={enabled:false};
    const props=Vue.reactive({isOpen:false,mode:'create',initialIngredient:null,initialName:'',context:'pantry',engine:Vue.markRaw(engine)});
    let view;const events=[]; const root={};
    renderer.render(Vue.h({setup(){view=Modal.setup(props,{emit:(...args)=>events.push(args)});return()=>Vue.h('div')}}),root);
    return {engine,props,get view(){return view},events,root};
}
async function open(f){f.props.isOpen=true;await Vue.nextTick();}
function fill(v){v.form.name='有機可可粉';v.form.brand='新品牌';v.form.category='sauces';v.form.preferredStores=['EC'];v.form.storageZones=['pantry'];v.form.stock=true;v.form.per100g={...n};v.form.servingSize=10;v.form.perServing=Object.fromEntries(Object.entries(n).map(([k,x])=>[k,x/10]));v.photo.url=png;v.photo.status='success';v.photo.message='候選資料';v.photo.notices=['提醒'];v.evidenceBasis.value='as_sold';v.evidenceUnit.value='g';v.evidenceSpec.value='新規格';v.evidenceSource.value='照片';v.evidenceConfirmed.value=true;v.showLabelReview.value=true;}
function draft(v){return JSON.stringify([v.form,v.photo,v.evidenceConfirmed.value,v.showLabelReview.value,v.evidenceSpec.value,v.evidenceBasis.value,v.evidenceUnit.value,v.evidenceSource.value,v.gramsPerUnit.value,v.selectedTargetId.value]);}
for(const scope of ['household','ariel']) {
    const f=fixture(scope);await open(f);const v=f.view;fill(v);await Vue.nextTick();
    assert(v.matchCandidates.value.length>=2);assert.equal(v.replacementTarget.value,null,'multiple matches require target selection');
    v.selectedTargetId.value='cocoa'; v.drawerContentRef.value={scrollTop:320};
    const before=draft(v);const storageBefore=JSON.stringify([...values]);
    for(let i=0;i<3;i++){await v.switchToExisting(original);assert.equal(v.previewIngredient.value.id,'cocoa');assert.equal(v.drawerContentRef.value.scrollTop,0);await v.handleSave();assert.equal(f.events.length,0);await v.returnToDraft();assert.equal(draft(v),before);assert.equal(v.drawerContentRef.value.scrollTop,320);}
    answer=false;await v.replaceExisting();assert.equal(JSON.stringify([...values]),storageBefore);assert.equal(draft(v),before);
    answer=true;engineUpload(f.engine,async()=>null);
    const opposite=scope==='household'?'ariel':'household';const otherState=values.get('kitchen_v2_personal_state_'+opposite);
    await v.replaceExisting();
    assert.equal(f.engine.data.ingredients.length,2);const replaced=f.engine.data.ingredients.find(x=>x.id==='cocoa');
    assert.equal(replaced.brand,'新品牌');assert.equal(replaced.photoUrl,null);assert.equal(replaced.nutritionEvidence.status,'verified');
    assert.deepEqual(f.engine.data.ingredients.find(x=>x.id==='other'),other);
    assert.equal(f.engine.data.pantryInventory.shoppingList[1].store,'保留','same name with unrelated ID untouched');
    assert.equal(f.engine.data.pantryInventory.shoppingList[0].store,'EC');assert.equal(f.engine.checkStock('cocoa'),true);
    assert.equal(values.get('kitchen_v2_personal_state_'+opposite),otherState);assert.equal(values.get('kitchen_v2_pantry_inventory.json'),'legacy-untouched');
    assert.deepEqual(f.engine.data.pantryInventory.foodCart,[{id:'cocoa',quantity:2}]);
    assert.equal(JSON.parse(values.get('kitchen_v2_nutrition_edit_backup')).before[cache],JSON.stringify(raw));
    assert(f.events.some(x=>x[0]==='saved'&&x[1].id==='cocoa'));assert(confirmations.at(-1).includes('[cocoa]'));
    renderer.render(null,f.root);
}
function engineUpload(engine,uploadIngredientPhoto){engine.supabase={uploadIngredientPhoto};}
// Ordinary save keeps the similar-item confirmation and makes its own ID.
{
 const f=fixture();await open(f);fill(f.view);f.view.photo.url=null;answer=false;await f.view.handleSave();assert.equal(f.events.length,0);
 answer=true;await f.view.handleSave();assert.equal(f.engine.data.ingredients.length,3);assert.notEqual(f.events.find(x=>x[0]==='saved')[1].id,'cocoa');
 renderer.render(null,f.root);
}
// Exact duplicate remains guarded without discarding the draft.
{
 const f=fixture();await open(f);fill(f.view);f.view.form.name='可可粉';const before=draft(f.view);await f.view.handleSave();assert.equal(f.view.previewIngredient.value.id,'cocoa');await f.view.returnToDraft();assert.equal(draft(f.view),before);assert.equal(f.engine.data.ingredients.length,2);renderer.render(null,f.root);
}
// Fail closed for missing target, conflicting name, quota, and a scope change during upload.
for(const failure of ['missing','conflict','quota','scope','success','legacy']) {
 const f=fixture();await open(f);const before=JSON.stringify(f.engine.data.rawIngredients);
 let input={...original,name:'有機可可粉',brand:'更新',photoUrl:png,photo:null,localPhotoRefs:{}};
 engineUpload(f.engine,async()=>{if(failure==='scope')authorizeTestEngine(f.engine,'ariel');return failure==='success'?'https://example.invalid/new.png':null;});
 if(failure==='missing')input.id='missing';if(failure==='conflict')input.name=other.name;
 if(failure==='quota')failKey=custom;
 if(failure==='legacy'){f.engine.data.rawIngredients.sauces[1].photoUrl=png;values.set(cache,JSON.stringify(f.engine.data.rawIngredients));}
 if(['success','legacy'].includes(failure)){await f.engine.saveIngredient(input,{replaceId:'cocoa'});assert(!values.get(cache).includes('data:image'));}
 else {await assert.rejects(f.engine.saveIngredient(input,{replaceId:'cocoa'}));assert.equal(JSON.stringify(f.engine.data.rawIngredients),before);assert.equal(values.get(cache),JSON.stringify(raw));}
 renderer.render(null,f.root);
}
// Replacing a counted item must not retain stale per-unit nutrition or photo references.
{
 const f=fixture();await open(f);fill(f.view);f.view.selectedTargetId.value='cocoa';
 Object.assign(f.engine.data.ingredients.find(x=>x.id==='cocoa'),{perUnit:{...n},isCount:true,unitLabel:'包',gramsPerPack:80});
 engineUpload(f.engine,async()=> 'https://example.invalid/new.png');await f.view.replaceExisting();
 const item=f.engine.getIngredientById('cocoa');assert.equal(item.unitLabel,'g');assert.equal(item.perUnit,null);assert.equal(item.isCount,null);assert.equal(item.gramsPerPack,null);assert.equal(item.photoUrl,'https://example.invalid/new.png');renderer.render(null,f.root);
}
// Incomplete replacement stays pending; local ingredients can be edited without a login.
for (const loggedIn of [true,false]) {
 const f=fixture();await open(f);fill(f.view);f.view.selectedTargetId.value='cocoa';
 if(!loggedIn){f.engine.clearPersonalScope();}
 f.view.form.per100g.sodium=null;f.view.form.perServing.sodium=null;f.view.evidenceConfirmed.value=false;
 const states=[values.get('kitchen_v2_personal_state_household'),values.get('kitchen_v2_personal_state_ariel')];
 engineUpload(f.engine,async()=>{throw Error('offline')});await f.view.replaceExisting();
 const item=f.engine.getIngredientById('cocoa');assert.equal(item.nutritionEvidence.status,'pending');assert.equal(item.nutritionReviewRequired,true);assert.equal(item.per100g.sodium,null);
 assert.equal(f.events.find(x=>x[0]==='saved')[1].photoUrl,null,'emitted replacement also has no encoded image');
 if(!loggedIn)assert.deepEqual([values.get('kitchen_v2_personal_state_household'),values.get('kitchen_v2_personal_state_ariel')],states);
 renderer.render(null,f.root);
}
// In-flight OCR results stay with the draft, never write to the preview; leaving invalidates OCR.
{
 const f=fixture();await open(f);fill(f.view);
 let resolveOCR;globalThis.fetch=()=>new Promise(resolve=>{resolveOCR=resolve});
 values.set('gemini_api_key','fixture-key');
 globalThis.Image=class{width=100;height=100;set src(_){queueMicrotask(()=>this.onload())}};
 globalThis.document.createElement=()=>({getContext:()=>({drawImage(){}}),toDataURL:()=>png});
 const result={name:'有機可可粉',brand:'新品牌',servingSize:10,servingUnit:'g',per100Unit:'g',weightBasis:'as_sold',per100g:n};
 const complete=()=>resolveOCR({ok:true,text:async()=>JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]})});
 const pending=f.view.analyzeSavedPhoto();while(!resolveOCR)await new Promise(r=>setTimeout(r,0));
 await f.view.switchToExisting(original);await f.view.replaceExisting();assert.equal(f.events.length,0);complete();await pending;
 assert.equal(f.view.previewIngredient.value.id,'cocoa');await f.view.returnToDraft();assert.equal(f.view.photo.status,'success');assert.equal(f.view.form.name,'有機可可粉');
 resolveOCR=null;const leaving=f.view.analyzeSavedPhoto();while(!resolveOCR)await new Promise(r=>setTimeout(r,0));
 f.props.isOpen=false;await Vue.nextTick();complete();await leaving;f.props.isOpen=true;await Vue.nextTick();assert.equal(f.view.photo.url,null);assert.equal(f.view.form.brand,'');assert.equal(f.view.photo.status,'idle');assert.equal(f.view.previewIngredient.value,null);renderer.render(null,f.root);
}
Vue.compile(Modal.template,{decodeEntities:text=>text});
console.log('PASS: repeated create/preview/back, all draft fields, multi-target, confirm/cancel, exact and similar guards, canonical references, both scopes, legacy/Base64, backup/quota, async scope/OCR/exit, pending/verified photo save');
