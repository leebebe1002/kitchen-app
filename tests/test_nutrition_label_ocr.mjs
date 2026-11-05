import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { reviewNutritionLabelOCR, productSpecificationFromOCR } from '../web/src/utils/NutritionLabelOCR.js';
import { labelConsistencyIssue } from '../web/src/utils/NutritionEvidence.js';

const example = {
    name: '是拉差美乃滋',
    brand: 'J-Lek',
    specification: '45 Serving Per Container, 1 tsp (5 mL)',
    weightBasis: 'as_sold',
    servingSize: 5,
    servingUnit: 'mL',
    per100Unit: null,
    perServing: { kcal: 15, protein: 0, carbs: 0, fat: 1, sodium: 0 },
    per100g: { kcal: null, protein: null, carbs: null, fat: null, sodium: null }
};
const original = {
    id: 'test-jlek', name: '是拉差美乃滋', brand: 'J-Lek', category: 'sauces',
    photoUrl: 'https://example.invalid/photo.jpg', unitLabel: 'g', weightBasis: 'as_sold',
    servingSize: 10, servingUnit: 'g',
    per100g: { kcal: 450, protein: 1, carbs: 12, fat: 45, sodium: 1200 }
};
const review = reviewNutritionLabelOCR(example, original);
assert.equal(review.unit, 'ml');
assert.equal(review.servingUnit, 'ml');
assert.equal(review.specification, '', 'nutrition serving metadata is not product specification');
assert(review.notices.some(s => s.includes('誤當商品規格')));
assert.equal(productSpecificationFromOCR('原味 450 mL').value,'原味 450 mL');
assert.equal(productSpecificationFromOCR('每包裝含 45 份，每份量 5 mL').value,'');
assert.equal(productSpecificationFromOCR('Serving Size 1 tbsp').value,'');
assert.equal(productSpecificationFromOCR(null).value,'');
assert.equal(review.per100g.kcal, 300);
assert.equal(review.per100g.fat, 20);
assert.equal(review.per100g.sodium, 0);
assert.equal(review.perServing.kcal, 15);
assert(review.notices.some(s => s.includes('原食材用 g') && s.includes('ml')));
assert.equal(labelConsistencyIssue({
    unitLabel:'ml', servingSize:5, servingUnit:'ml', per100g:review.per100g, perServing:review.perServing
}), '');
const missing = reviewNutritionLabelOCR({
    ...example, perServing: {...example.perServing, sodium:null}
}, original);
assert.equal(missing.per100g.kcal, 300);
assert.equal(missing.per100g.sodium, null, 'unreadable sodium cannot become zero');
assert(missing.notices.some(s=>s.includes('空白')));
const mismatched = reviewNutritionLabelOCR({
    ...example, servingUnit:'g', per100Unit:'g',
    per100g:{ kcal:250, protein:0, carbs:0, fat:20, sodium:0}
});
assert(mismatched.notices.some(s=>s.includes('不一致')));
assert.equal(mismatched.per100g.kcal,300,'printed serving takes precedence');
const mixed = reviewNutritionLabelOCR({
    ...example, per100Unit:'g',
    per100g:{ kcal:999, protein:99, carbs:99, fat:99, sodium:99 }
});
assert.equal(mixed.per100g.kcal,300,'100g must not be treated as 100mL');
assert(mixed.notices.some(s=>s.includes('不同單位')));
const invalid = reviewNutritionLabelOCR({
    ...example, servingUnit:null, per100Unit:null,
    per100g:{ kcal:999, protein:99, carbs:99, fat:99, sodium:99 }
});
assert.equal(invalid.per100g.kcal,null,'unsupported units must not be silently treated as grams');
assert(invalid.notices.some(s=>s.includes('無法自動換算')));
const printed100 = reviewNutritionLabelOCR({
    ...example, servingSize:null, servingUnit:null, per100Unit:'g',
    per100g:{ kcal:200, protein:2, carbs:4, fat:20, sodium:50 }
});
assert.equal(printed100.unit,'g');
assert.equal(printed100.per100g.kcal,200);
assert.equal(printed100.perServing.kcal,null);

// User's real cocoa label: per 1 tbsp (6 g), 25 kcal / P2 / C3 / F0.5 / Na0.
const cocoa=reviewNutritionLabelOCR({
    name:'有機可可粉',brand:'Navitas Organics',specification:'',
    weightBasis:'as_sold',servingSize:6,servingUnit:'g',per100Unit:null,
    perServing:{kcal:25,protein:2,carbs:3,fat:0.5,sodium:0}
});
assert.equal(cocoa.unit,'g');
assert.equal(cocoa.servingSize,6);
assert.equal(cocoa.perServing.kcal,25);
assert.equal(cocoa.perServing.protein,2);
assert.equal(cocoa.perServing.carbs,3);
assert.equal(cocoa.perServing.fat,0.5);
assert.equal(cocoa.perServing.sodium,0);
assert.equal(cocoa.per100g.kcal,416.67);
assert.equal(cocoa.per100g.protein,33.33);
assert.equal(cocoa.per100g.carbs,50);
assert.equal(cocoa.per100g.fat,8.33);
assert.equal(cocoa.per100g.sodium,0);
assert.equal(labelConsistencyIssue({unitLabel:'g',servingSize:6,servingUnit:'g',per100g:cocoa.per100g,perServing:cocoa.perServing}),'');
const store=new Map([['gemini_api_key','test-only-key']]);
globalThis.localStorage = {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
globalThis.sessionStorage=localStorage;
globalThis.window={location:{hostname:'unit-tests.invalid',origin:'https://unit-tests.invalid'},addEventListener(){},removeEventListener(){}};
globalThis.alert=()=>{throw Error('Unexpected alert')};
globalThis.confirm=()=>true;
globalThis.document={
    body:{classList:{add(){},remove(){}}},
    createElement:kind => {
        assert.equal(kind,'canvas');
        return {width:0,height:0,getContext:()=>({drawImage(){}}),
            toDataURL:()=> 'data:image/jpeg;base64,ZmFrZQ=='};
    }
};
globalThis.Image=class {
    width=200; height=100;
    set src(value) {assert(value.startsWith('data:image/')); queueMicrotask(()=>this.onload());}
};
globalThis.FileReader=class {
    readAsDataURL() {this.result='data:image/jpeg;base64,ZmFrZQ==';queueMicrotask(()=>this.onload({target:this}));}
};
const calls=[];
globalThis.fetch=async (url,options) => {
    calls.push({url,options});
    if(url===original.photoUrl) return {ok:true,blob:async()=>new Blob(['fake'],{type:'image/jpeg'})};
    assert(url.startsWith('https://generativelanguage.googleapis.com/'));
    const sent=JSON.parse(options.body);
    assert(sent.contents[0].parts[0].text.includes('per100Unit'));
    return {ok:true,text:async()=>JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(example)}]}}]})};
};
globalThis.Vue=vm.runInNewContext(fs.readFileSync('web/vue.global.js','utf8')+';Vue',{console,setTimeout,clearTimeout});
const {default:Modal}=await import('../web/src/components/IngredientDetailModal.js');
const savedIngredients=[];
const engine={
    getIngredientById:id=>id===original.id?original:null,
    checkStock:()=>true,
    detectNutrientCategory:()=> 'sauces',
    saveIngredient:async ingredient => { savedIngredients.push(structuredClone(ingredient)); }
};
const props=Vue.reactive({isOpen:false,mode:'edit',initialIngredient:original,engine});
const renderer=Vue.createRenderer({
    createElement:()=>({}),insert(){},remove(){},setElementText(){},patchProp(){},
    createText:()=>({}),createComment:()=>({}),setText(){},setComment(){},
    parentNode:()=>null,nextSibling:()=>null
});
let view;
const root={};
renderer.render(Vue.h({setup(){view=Modal.setup(props,{emit(){}});return ()=>Vue.h('div');}}),root);
props.isOpen=true;await Vue.nextTick();
assert.equal(calls.length,0,'stored image must not be sent to AI on open');
assert.equal(view.photo.url,original.photoUrl);
view.drawerContentRef.value = {scrollTop: 680};
await view.analyzeSavedPhoto();
assert.equal(view.drawerContentRef.value.scrollTop, 0, 'completed OCR resets the drawer, not the page, to the result header');
assert.equal(calls.length,2,'one existing photo fetch and one Gemini OCR request');
assert.equal(view.form.per100g.kcal,300);
assert.equal(view.form.perServing.kcal,15);
assert.equal(view.form.servingSize,5);
assert.equal(view.evidenceSpec.value,'', 'editor must not prefill false product specifications');
await view.handleSave();
assert.equal(savedIngredients.length,1,'save with a complete photo does not require a package-spec field or checkbox');
assert.equal(savedIngredients[0].nutritionEvidence.status,'verified','saving complete, consistent OCR values accepts the photo');
assert.equal(savedIngredients[0].nutritionEvidence.specification,'','no invented package specification');
assert.equal(savedIngredients[0].nutritionReviewRequired,false);
assert.equal(savedIngredients[0].perServing.kcal,15);
assert.equal(savedIngredients[0].per100g.kcal,300);
assert.equal(view.evidenceConfirmed.value,false,'simple photo-save flow does not need the manual checkbox');
assert(view.photo.notices.some(s=>s.includes('誤當商品規格')));
assert.equal(view.form.servingUnit,'ml');
assert.equal(view.evidenceUnit.value,'ml');
assert.equal(view.evidenceConfirmed.value,false);
assert.equal(view.photo.status,'success');
assert(view.photo.message.includes('尚未核實'));
assert(view.photo.notices.some(s=>s.includes('未有密度')));
assert.equal(view.photo.url,original.photoUrl,'do not overwrite or persist an in-memory image');
view.photo.url='http://blocked.invalid/image.jpg';
await view.analyzeSavedPhoto();
assert.equal(calls.length,2,'never fetch non-HTTPS existing photo');
assert.equal(view.photo.status,'error');
assert(view.photo.message.includes('相簿重新選取'));
// FK's older IndexedDB photos are hydrated to same-origin blob: object
// URLs, not HTTPS. Verify the actual customer failure is now supported.
const localBlobUrl='blob:https://unit-tests.invalid/fk-photo-1';
const crossOriginBlobUrl='blob:https://outside.invalid/foreign-photo';
const fetchBeforeBlob=globalThis.fetch;
const callsBeforeBlob=calls.length;
globalThis.fetch=async (url,options)=>{
    if (url===localBlobUrl) {
        calls.push({url,options});
        assert.equal(options.mode,'same-origin');
        return {ok:true,blob:async()=>new Blob(['local-ingredient-photo'],{type:'image/jpeg'})};
    }
    return fetchBeforeBlob(url,options);
};
view.photo.url=localBlobUrl;
await view.analyzeSavedPhoto();
assert.equal(view.photo.status,'success');
assert.equal(view.photo.url,localBlobUrl,'hydrated photo URL must remain unchanged');
assert.equal(view.form.perServing.kcal,15);
assert.equal(view.form.per100g.kcal,300);
assert.equal(calls.length,callsBeforeBlob+2,'same-origin blob read and Gemini OCR');
const callsBeforeForeign=calls.length;
view.photo.url=crossOriginBlobUrl;
await view.analyzeSavedPhoto();
assert.equal(view.photo.status,'error');
assert.equal(calls.length,callsBeforeForeign,'foreign blob URLs must not be fetched');
globalThis.fetch=fetchBeforeBlob;

// Closing or removing a photo invalidates an in-flight read; it cannot
// quietly overwrite a different ingredient's fields or resurrect the photo.
let finishPendingPhotoFetch;
const networkBefore = globalThis.fetch;
globalThis.fetch = async (url, options) => url === original.photoUrl
    ? new Promise(resolve => { finishPendingPhotoFetch = resolve; })
    : networkBefore(url, options);
view.photo.url = original.photoUrl;
view.drawerContentRef.value.scrollTop = 740;
const lateRead = view.analyzeSavedPhoto();
assert.equal(view.photo.isAnalyzing, true);
view.removePhoto();
finishPendingPhotoFetch({ok:true,blob:async()=>new Blob(['fake'],{type:'image/jpeg'})});
await lateRead;
assert.equal(view.photo.url, null);
assert.equal(view.photo.status, 'idle');
assert.equal(view.photo.message, '');
assert.equal(view.form.per100g.kcal, 300, 'stale photo must not overwrite accepted candidate');
assert.equal(view.drawerContentRef.value.scrollTop, 740, 'cancelled recognition must not steal the scroll position');
globalThis.fetch = networkBefore;
// Returning from the iPhone camera starts at the previous scroll position;
// selecting a new photo must move to its preview and remain at the top after OCR.
view.drawerContentRef.value.scrollTop = 720;
await view.onFilePicked({target:{files:[{name:'IMG_1001.jpeg'}],value:'picked'}});
await new Promise(resolve=>setTimeout(resolve, 0));
assert.equal(view.photo.status, 'success');
assert.equal(view.drawerContentRef.value.scrollTop, 0, 'new camera/album photo restores top of drawer');
// Creating a new brand item through the camera must save complete label data
// without demanding an unrelated product specification.
let created;
const createEngine={
    getIngredientById:()=>null,
    data:{ingredients:[],pantryInventory:{shoppingList:[]}},
    checkStock:()=>false, detectNutrientCategory:()=> 'sauces',
    saveIngredient:async ing=>{created=structuredClone(ing);}
};
const createProps=Vue.reactive({isOpen:false,mode:'create',initialIngredient:null,initialName:'',engine:createEngine});
let createView;
const createRoot={};
renderer.render(Vue.h({setup(){createView=Modal.setup(createProps,{emit(){}});return()=>Vue.h('div');}}),createRoot);
createProps.isOpen=true;await Vue.nextTick();
createView.drawerContentRef.value={scrollTop:700};
await createView.onFilePicked({target:{files:[{name:'IMG_1001.jpeg'}],value:'picked'}});
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(createView.photo.status,'success');
assert.equal(createView.evidenceSpec.value,'');
assert.equal(createView.drawerContentRef.value.scrollTop,0);
await createView.handleSave();
assert.equal(created.name,example.name);
assert.equal(created.brand,example.brand);
assert.equal(created.servingSize,5);
assert.equal(created.per100g.kcal,300);
assert.equal(created.nutritionEvidence.status,'verified');
assert.equal(created.nutritionReviewRequired,false);
createView.form.per100g.sodium=null;
createView.form.perServing.sodium=null;
await createView.handleSave();
assert.equal(created.nutritionEvidence.status,'pending','incomplete photo values may save but cannot masquerade as verified');
assert.equal(created.nutritionReviewRequired,true);
// Selecting a similar existing ingredient must cancel the old photo's
// success status; otherwise Save might verify unrelated nutrition values.
createView.switchToExisting({id:'existing-cocoa',name:'可可粉',category:'sauces',unitLabel:'g',
    weightBasis:'unknown',per100g:{kcal:100,protein:1,carbs:2,fat:1,sodium:0}});
assert.equal(createView.photo.status,'idle');
assert.equal(createView.photo.message,'');
assert.equal(createView.showLabelReview.value,false);
renderer.render(null,createRoot);
Vue.compile(Modal.template,{decodeEntities:text=>text});
assert(Modal.template.includes('ref="drawerContentRef" class="drawer-content"'));
assert(Modal.template.includes('用 AI 辨識／重新核對這張照片'));
assert(Modal.template.includes('v-for="notice in photo.notices"'));

// Product identity, source status and manual verification are optional advanced
// controls, not prerequisites between photo OCR, nutrients and Save.
const ui=Modal.template;
assert(ui.includes('查看來源與計算說明'));
assert(ui.includes('查看 {{ photo.notices.length }} 項辨識提醒'));
assert(ui.includes('進階核對設定（通常不用改）'));
assert(ui.includes('其他設定：分類、存放與採買'),'existing item retains housekeeping controls');
assert(ui.includes('其他設定：分類、存放與採買'));
const nutritionIndex=ui.indexOf('營養成分');
const householdIndex=ui.indexOf('其他設定：分類、存放與採買');
const advancedIndex=ui.indexOf('進階營養資料（選填）');
const sourceIndex=ui.indexOf('營養來源');
const confirmIndex=ui.indexOf('v-model="evidenceConfirmed"');
assert(nutritionIndex > 0 && householdIndex > nutritionIndex && advancedIndex > householdIndex);
assert(sourceIndex > advancedIndex && confirmIndex > advancedIndex);
assert(ui.indexOf('商品規格（口味') > advancedIndex);
assert(!ui.includes('3. 確認後儲存'),'no mandatory three-step label audit UI');
assert(ui.includes('按儲存即採用這些數字'));
assert(ui.indexOf('來源備註') > advancedIndex);
assert(ui.indexOf('{{ sourceEvidence.note }}') > advancedIndex);
assert(ui.includes('原有料理份量需重新核對'), 'unit incompatibility is not hidden in audit details');
assert(!ui.includes('<p>一般食材優先使用有依據的官方估算；有實際產品標示時再展開核對。空白不是 0。</p>'),'repeated uncollapsed explanatory paragraphs removed');

renderer.render(null,root);
console.log('PASS: label OCR g/mL, mismatched photo vs old values, partial blanks, verified-by-user boundary, old-photo reanalysis, no automatic transmission/storage, friendly fallback');
