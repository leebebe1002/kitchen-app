import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { reviewNutritionLabelOCR } from '../web/src/utils/NutritionLabelOCR.js';
import { labelConsistencyIssue } from '../web/src/utils/NutritionEvidence.js';

const example = {
    name: '是拉差美乃滋',
    brand: 'J-Lek',
    specification: '測試版，非真實商品核實',
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
    readAsDataURL() {this.result='data:image/jpeg;base64,ZmFrZQ==';queueMicrotask(()=>this.onload());}
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
const engine={
    getIngredientById:id=>id===original.id?original:null,
    checkStock:()=>true,
    detectNutrientCategory:()=> 'sauces'
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
await view.analyzeSavedPhoto();
assert.equal(calls.length,2,'one existing photo fetch and one Gemini OCR request');
assert.equal(view.form.per100g.kcal,300);
assert.equal(view.form.perServing.kcal,15);
assert.equal(view.form.servingSize,5);
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
const lateRead = view.analyzeSavedPhoto();
assert.equal(view.photo.isAnalyzing, true);
view.removePhoto();
finishPendingPhotoFetch({ok:true,blob:async()=>new Blob(['fake'],{type:'image/jpeg'})});
await lateRead;
assert.equal(view.photo.url, null);
assert.equal(view.photo.status, 'idle');
assert.equal(view.photo.message, '');
assert.equal(view.form.per100g.kcal, 300, 'stale photo must not overwrite accepted candidate');
globalThis.fetch = networkBefore;
Vue.compile(Modal.template,{decodeEntities:text=>text});
assert(Modal.template.includes('用 AI 辨識／重新核對這張照片'));
assert(Modal.template.includes('v-for="notice in photo.notices"'));
renderer.render(null,root);
console.log('PASS: label OCR g/mL, mismatched photo vs old values, partial blanks, verified-by-user boundary, old-photo reanalysis, no automatic transmission/storage, friendly fallback');
