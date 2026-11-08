import assert from 'node:assert/strict';
import fs from 'node:fs';
import {authorizeTestEngine} from './personal_scope_fixture.mjs';
import {OFFICIAL_OUTBOX_KEY, readOfficialOutbox, recoverOfficialCatalogEdit}
    from '../web/src/utils/OfficialIngredientOutbox.js';
const official=JSON.parse(fs.readFileSync('src/data/ingredients.json','utf8'));
const cats=['proteins','veggies','carbs','sauces'];
const all=()=>cats.flatMap(cat=>official[cat]);
const first=all().find(item=>item.per100g?.kcal && (item.brand||'')==='');
assert(first);
const id=first.id;
const deep=x=>structuredClone(x);
const originalRow=deep(first);
const rows=all().map((ingredient,position)=>({ingredient_id:ingredient.id,position,ingredient:deep(ingredient),revision:1}));
let values=new Map();
const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),
 removeItem:k=>values.delete(k)};
const start=()=>{
 values=new Map();
 values.set('kitchen_v2_ingredients.json',JSON.stringify(official));
 values.set('kitchen_v2_custom_ingredients',JSON.stringify([]));
 values.set('kitchen_v2_personal_state_household',JSON.stringify({scope:'household',cart:[1]}));
 values.set('kitchen_v2_personal_state_ariel',JSON.stringify({scope:'ariel',cart:[2]}));
 values.set('kitchen_v2_daily_logs.json','{"historic":true}');
 values.set('kitchen_v2_dishes.json','{"recipes":true}');
};
globalThis.localStorage=storage;globalThis.sessionStorage=storage;globalThis.Vue={reactive:x=>x};
globalThis.window={location:{hostname:'fixture.invalid'},addEventListener(){},removeEventListener(){}};
globalThis.fetch=async()=>{throw Error('Unexpected network')};
const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
const unchanged=before=>{for(const key of ['kitchen_v2_personal_state_household','kitchen_v2_personal_state_ariel',
 'kitchen_v2_daily_logs.json','kitchen_v2_dishes.json'])assert.equal(values.get(key),before.get(key),key);};
const photos={get:async()=>{throw Error('Unexpected photo read')},put:async()=>{throw Error('Unexpected photo write')}};
let status='online',sent=[];
function engine(scope='household') {
 const e=new Engine({photoStore:photos});
 authorizeTestEngine(e,scope);
 e.data.rawIngredients=deep(official);
 e.data.ingredients=all().map(deep);
 e.officialCatalogService={
  list:async()=>{if(status==='offline')throw Error('offline');return deep(rows);},
  publish:async({item,expectedRevision})=>{
   if(status==='offline')throw Error('offline');
   const old=rows.find(r=>r.ingredient_id===item.id);
   if(old.revision!==expectedRevision)throw Object.assign(Error('版本衝突'),{code:'FK_CATALOG_CONFLICT'});
   const row={ingredient_id:item.id,position:old.position,ingredient:deep(item),revision:expectedRevision+1};
   rows.splice(rows.findIndex(r=>r.ingredient_id===item.id),1,row);
   sent.push(row);return deep(row);
  }
 };
 e.sharedNutritionService={list:async()=>{throw Error('Old sparse authority must not be used after cutover')}};
 return e;
}
start();
const before=new Map(values);
const e=engine();
const stale=e.data.rawIngredients[first.category].find(i=>i.id===id);
stale.per100g.kcal+=111;
stale.photoUrl='https://images.example.invalid/milk.jpg';
assert(await e.loadOfficialIngredientCatalog());
assert(e.officialCatalogActive);
assert.equal(e.officialCatalogRows.size,100);
const effective=e.data.rawIngredients[first.category].find(i=>i.id===id);
assert.equal(effective.per100g.kcal,originalRow.per100g.kcal,'Supabase official nutrition overrides stale local edits');
assert.equal(effective.photoUrl,'https://images.example.invalid/milk.jpg','Local photo metadata stays local');
assert.equal(e.officialIngredientById.size,100);
assert.equal(e.data.rawIngredients[first.category].some(i=>i.id==='cocoa_powder'),false);
unchanged(before);
console.log('PASS: Supabase 100 authoritative, legacy local nutrition ignored, photos and both personal scopes retained');

e.data.ingredients=cats.flatMap(cat=>e.data.rawIngredients[cat]);
status='offline';
const edited=deep(e.getIngredientById(id));
edited.per100g.kcal+=7;
const saved=await e.saveIngredient(edited);
assert(saved);
assert.equal(e.getIngredientById(id).per100g.kcal,originalRow.per100g.kcal+7,'Save applies immediately');
assert.equal(readOfficialOutbox().entries[id].item.per100g.kcal,originalRow.per100g.kcal+7);
assert.equal(sent.length,0,'Offline never pretends cloud write succeeded');
assert.match(e.officialCatalogStatus,/待同步|未同步/);
unchanged(before);
console.log('PASS: local immediate nutrition change, offline queue, no false cloud success, no scope writes');

const other=engine('ariel');
const otherIdentity=Object.freeze({scopeId:'ariel',userId:'other-fixture-user'});
other.personalContext=otherIdentity;
other.auth={getPersonalContext:()=>otherIdentity,isCurrentContext:x=>x===otherIdentity};
other.officialIngredientById.set(id,deep(first)); // Canonical identity is present after normal Engine initialization.
await assert.rejects(()=>other.saveIngredient(edited),/登入身分|帳號|不同/);
assert.equal(sent.length,0);
status='online';
assert(await e.syncOfficialIngredientEdits());
assert.equal(sent.length,1);
assert.equal(sent[0].revision,2);
assert.equal(readOfficialOutbox().entries[id],undefined);
assert.equal(rows.find(r=>r.ingredient_id===id).ingredient.per100g.kcal,originalRow.per100g.kcal+7);
unchanged(before);
console.log('PASS: retry uploads exactly one official item with revision CAS, no cross-account replay');

// Fresh device reads the authoritative value without any GitHub update.
start();const ariel=engine('ariel');
assert(await ariel.loadOfficialIngredientCatalog());
assert.equal(ariel.data.rawIngredients[first.category].find(x=>x.id===id).per100g.kcal,originalRow.per100g.kcal+7);
console.log('PASS: other device reads the same new nutrition without GitHub deployment');

// CAS conflict must never overwrite a newer device version.
start();const conflict=engine();assert(await conflict.loadOfficialIngredientCatalog());
conflict.data.ingredients=cats.flatMap(cat=>conflict.data.rawIngredients[cat]);
status='offline';
const next=deep(conflict.getIngredientById(id));next.per100g.kcal+=9;
await conflict.saveIngredient(next);
const newest=rows.find(r=>r.ingredient_id===id);newest.revision+=1;newest.ingredient.per100g.kcal+=17;
status='online';assert.equal(await conflict.syncOfficialIngredientEdits(),false);
assert.equal(readOfficialOutbox().entries[id].item.per100g.kcal,next.per100g.kcal);
assert.equal(newest.ingredient.per100g.kcal,originalRow.per100g.kcal+24);
assert.match(conflict.officialCatalogStatus,/衝突/);
console.log('PASS: concurrent phones never overwrite one another, unsynced local change preserved');

// If a PATCH succeeded but device lost the acknowledgement, the remote row
// already matches our intended change. Reconcile without a duplicate PATCH.
newest.ingredient.per100g.kcal=next.per100g.kcal;
const beforeReconciled=sent.length;
const recovered=engine();
assert(await recovered.loadOfficialIngredientCatalog());
assert.equal(Object.keys(readOfficialOutbox().entries).length,0);
assert.equal(sent.length,beforeReconciled);
console.log('PASS: cloud-confirmed matching nutrition reconciles an unacknowledged PATCH');

// Offline-reloaded PWA may edit its own previously verified snapshot without
// pretending that an unverified JWT is cloud authentication.
start();status='online';
const onlineDevice=engine();assert(await onlineDevice.loadOfficialIngredientCatalog());
const snapshot=storage.getItem('kitchen_v2_official_catalog_snapshot_v1');assert(snapshot);
const encoded=Buffer.from(JSON.stringify({sub:'fixture-user',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
const jwt='x.'+encoded+'.fake';
const noAuth=engine();noAuth.clearPersonalScope();
noAuth.auth={readSession:()=>({access_token:jwt}),getPersonalContext:()=>null,isCurrentContext:()=>false};
status='offline';
assert(await noAuth.loadOfficialIngredientCatalog());
assert(noAuth.officialCatalogOffline);
noAuth.data.ingredients=cats.flatMap(cat=>noAuth.data.rawIngredients[cat]);
const offlineEdit=deep(noAuth.getIngredientById(id));offlineEdit.per100g.kcal+=3;
const beforeWrites=new Map(values);
await noAuth.saveIngredient(offlineEdit);
assert.equal(noAuth.getIngredientById(id).per100g.kcal,offlineEdit.per100g.kcal);
assert.equal(readOfficialOutbox().entries[id].item.per100g.kcal,offlineEdit.per100g.kcal);
assert.equal(sent.length,beforeReconciled);
unchanged(beforeWrites);
const wrongAuth=engine('ariel');wrongAuth.clearPersonalScope();
const wrongJwt='x.'+Buffer.from(JSON.stringify({sub:'different-user',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fake';
wrongAuth.auth={readSession:()=>({access_token:wrongJwt}),getPersonalContext:()=>null,isCurrentContext:()=>false};
assert.equal(await wrongAuth.loadOfficialIngredientCatalog(),false);
assert.equal(wrongAuth.officialCatalogActive,false);
console.log('PASS: offline PWA reuses only owner-verified cloud snapshot; pending local nutrition stays offline and cross-account access fails');
