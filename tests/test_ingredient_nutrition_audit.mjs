import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    auditIngredientNutrition,formatIngredientNutritionAudit
} from '../web/src/utils/IngredientNutritionAudit.js';
import { evidenceSnapshot } from '../web/src/utils/NutritionEvidence.js';
import { sharedNutritionPayload,applySharedNutrition } from '../web/src/utils/SharedIngredientNutrition.js';

const officialText=fs.readFileSync('src/data/ingredients.json','utf8');
const official=JSON.parse(officialText);
const source=Object.values(official).flat();
assert.equal(source.length,101);
const copy=x=>structuredClone(x);
const context=Object.freeze({userId:'test-bebe',scopeId:'household'});
const engine=(items=copy(source),rows=[])=>({
    data:{ingredients:items},
    personalContext:context,personalScope:'household',personalScopeGeneration:0,
    hasPersonalAccess:()=>true,auth:{isCurrentContext:value=>value===context},
    sharedNutritionService:{list:async()=>rows}
});
const downloaded=async(url,options)=>{
    assert.equal(new URL(url).pathname.endsWith('/src/data/ingredients.json'),true);
    assert.equal(options.cache,'no-store');
    assert(options.signal);
    return {ok:true,text:async()=>officialText};
};
let calls=0;
const readonly=async(e,fetcher=downloaded)=>{
    calls++;return auditIngredientNutrition(e,{fetcher});
};
const keysOf=items=>JSON.stringify(items);
globalThis.localStorage={getItem:()=>{throw Error('Do not read localStorage for audit')},
    setItem:()=>{throw Error('Do not write localStorage')},removeItem:()=>{throw Error('Do not remove localStorage')}};
globalThis.indexedDB={open:()=>{throw Error('Do not open photo database')}};

const matching=engine();
const before=keysOf(matching.data.ingredients);
const report=await readonly(matching);
assert.deepEqual([report.officialCount,report.sharedCount,report.matched,report.different,report.privateCount],
    [101,0,101,0,0]);
assert.equal(keysOf(matching.data.ingredients),before);
const text=formatIngredientNutritionAudit(report,'test');
assert(text.includes('一致：101 項'));
assert(text.includes('共用修正：0 項'));
assert(!text.includes('DO-NOT-LEAK'));
console.log('PASS: 101 unchanged official items, no snapshots or device writes');

const stale=copy(source);
stale.find(x=>x.id==='egg').perUnit.kcal=88;
stale.find(x=>x.id==='salmon').per100g.kcal=123;
stale.find(x=>x.id==='salmon').weightBasis='cooked';
const withExtra=stale.filter(x=>x.id!=='banana')
    .concat([{id:'custom_1',name:'私房美乃滋',category:'sauces',per100g:{kcal:78}}],
        [copy(stale.find(x=>x.id==='egg'))]);
const mobile=engine(withExtra);
const mobileBefore=keysOf(mobile.data.ingredients);
const diff=await readonly(mobile);
assert.equal(diff.officialCount,101);
assert.equal(diff.missing,1);
assert.equal(diff.duplicates,1);
assert.equal(diff.privateCount,1);
assert.equal(diff.different,3);
assert.equal(diff.matched,98);
const byId=id=>diff.differences.find(x=>x.id===id);
assert(byId('salmon').fields.find(x=>x.field==='per100g.kcal'));
assert(byId('salmon').fields.find(x=>x.field==='weightBasis'));
assert(byId('egg').reason.includes('重複'));
assert(byId('banana').reason.includes('缺少'));
assert.equal(keysOf(mobile.data.ingredients),mobileBefore);
const formatted=formatIngredientNutritionAudit(diff,'test');
assert(formatted.includes('鮭魚 [salmon]'));
assert(formatted.includes('熱量：手機 123；基準 151.6'));
assert(formatted.includes('私房美乃滋 [custom_1]'));
console.log('PASS: calorie, weight basis, missing, duplicate and custom food separated');

// Shared corrections are valid differences from official, and must be included in effective baseline.
const salmon=source.find(x=>x.id==='salmon');
const revised=copy(salmon);
revised.per100g.kcal=177;
revised.nutritionEvidence={
    kind:'product_label',status:'verified',
    checkedAt:'2026-11-08',identity:{name:salmon.name,brand:salmon.brand||''},
    weightBasis:salmon.weightBasis,specification:'',
    snapshot:evidenceSnapshot(revised)
};
const payload=sharedNutritionPayload(revised,salmon);
assert(payload,'Verified same canonical product can publish correction');
const row={...payload,revision:1};
const sharedActive=copy(source);
assert(applySharedNutrition(sharedActive.find(x=>x.id==='salmon'),row,salmon));
const shared=await readonly(engine(sharedActive,[row]));
assert.equal(shared.matched,101);
assert.equal(shared.sharedCount,1);
const notRefreshed=await readonly(engine(copy(source),[row]));
assert.equal(notRefreshed.matched,100);
assert.equal(notRefreshed.different,1);
assert.equal(notRefreshed.differences[0].reason,'與已核對的共用營養修正不同');
console.log('PASS: verified cloud override recognized; unrefreshed phone reports genuine mismatch');

const unsupported=engine(copy(source),[{...row,ingredient_id:'not-official'}]);
await assert.rejects(readonly(unsupported),/共用營養資料有無法核對/);
const duplicateCloud=engine(copy(source),[row,row]);
await assert.rejects(readonly(duplicateCloud),/共用營養資料有無法核對/);
await assert.rejects(readonly(engine(),async()=>({ok:true,text:async()=>officialText+' '})),/99／101 項/);
await assert.rejects(readonly(engine(),async()=>({ok:false,status:503})),/無法讀取最新/);
await assert.rejects(readonly(engine(),async()=>{throw Error('offline')}),/offline/);
const e=engine();e.sharedNutritionService.list=async()=>{throw Error('offline')};
await assert.rejects(readonly(e),/offline/);
console.log('PASS: mismatched hash, invalid cloud corrections, offline and failed fetch never claim success');

// Changes during requests must fail closed, and no early success may leak.
const deferred=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
const g=deferred(),changeDuringFetch=engine();
const resultPromise=readonly(changeDuringFetch,()=>g.promise);
changeDuringFetch.data.ingredients[0].name='edited while fetching';
g.resolve({ok:true,text:async()=>officialText});
await assert.rejects(resultPromise,/資料已變更/);
const h=deferred(),switchDuringCloud=engine();
switchDuringCloud.sharedNutritionService.list=()=>h.promise;
const otherPromise=readonly(switchDuringCloud);
await new Promise(resolve=>setImmediate(resolve));
switchDuringCloud.personalContext=Object.freeze({userId:'other',scopeId:'ariel'});
h.resolve([]);
await assert.rejects(otherPromise,/登入或食材資料已變更/);
console.log('PASS: concurrent local edit and account switch do not emit stale report');

// No-login and missing calculator list are errors, not matching 0.
const notLoggedIn=engine();
notLoggedIn.hasPersonalAccess=()=>false;
await assert.rejects(readonly(notLoggedIn),/請先確認 FK 登入/);
const notReady=engine();notReady.data.ingredients=null;
await assert.rejects(readonly(notReady),/尚未載入/);
console.log('PASS: no-login and not-ready fail-closed');

const main=fs.readFileSync('web/src/main.js','utf8');
const html=fs.readFileSync('web/index.html','utf8');
assert(main.includes("IngredientNutritionAudit.js?v=20261108_FK14_READONLY_AUDIT_V1"));
assert(main.includes('@click="checkIngredientNutrition"'));
assert(main.includes('檢查 101 項營養是否一致'));
assert(main.includes('textarea class="account-email-input" aria-label="食材營養比對結果" readonly'));
assert(main.includes("const appVersion = '2026.11.08.6';"));
assert(html.includes('main.js?v=20261108_FK14_TWO_ITEMS_V1'));
console.log('PASS: protected account UI, explicit read-only report and version chain');
console.log('NUTRITION AUDIT ALL PASS:',calls,'checks');
