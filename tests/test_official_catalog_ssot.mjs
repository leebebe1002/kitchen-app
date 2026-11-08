import assert from 'node:assert/strict';
import fs from 'node:fs';
const rows = Object.values(JSON.parse(fs.readFileSync('src/data/ingredients.json','utf8')))
    .flat().map((ingredient,position) => ({ingredient_id:ingredient.id,position,ingredient,revision:1}));
const {OfficialIngredientCatalogService, verifyOfficialCatalogRows, groupOfficialCatalogRows,
    canonicalNutritionItem} = await import('../web/src/services/OfficialIngredientCatalogService.js');
const {stageOfficialEdit,readOfficialOutbox,pendingForOwner,clearPublishedEntry,
    persistOfficialCatalogEdit,recoverOfficialCatalogEdit,OFFICIAL_OUTBOX_KEY,
    OFFICIAL_CATALOG_JOURNAL_KEY} = await import('../web/src/utils/OfficialIngredientOutbox.js');
const clone = x => structuredClone(x);
const owner='fake-user-bebe',other='fake-user-ariel';
const chicken=rows.find(row=>row.ingredient.per100g && row.ingredient.per100g.kcal>0).ingredient;
const revised=clone(chicken);
revised.per100g.kcal += 5;
const canonical=canonicalNutritionItem(chicken,revised);
assert.equal(canonical.per100g.kcal,revised.per100g.kcal);
assert.deepEqual(canonical.name,chicken.name);
assert.equal(verifyOfficialCatalogRows(rows).length,100);
assert.equal(groupOfficialCatalogRows(rows).veggies.length,25);
for (const invalid of [[],rows.slice(1),[...rows,rows[0]]]) {
 assert.throws(()=>verifyOfficialCatalogRows(invalid),/不完整/);
}
assert.throws(()=>verifyOfficialCatalogRows(rows.map((x,i)=>i===0?{...x,ingredient_id:'tampered'}:x)),/異常/);
assert.throws(()=>verifyOfficialCatalogRows(rows.map((x,i)=>i===0?{...x,revision:0}:x)),/異常/);
const branded={...revised,brand:'Brand-Switch'};
assert.throws(()=>canonicalNutritionItem(chicken,branded),/身分/);
const mismatchedPhotoLabel=clone(revised);
mismatchedPhotoLabel.nutritionEvidence={kind:'product_label',
 identity:{brand:'不同廠牌'},status:'verified',specification:'500g'};
assert.throws(()=>canonicalNutritionItem(chicken,mismatchedPhotoLabel),/不同品牌或規格/);
const negative=clone(revised);negative.per100g.kcal=-1;
assert.throws(()=>canonicalNutritionItem(chicken,negative),/負數/);
const withExtras={...revised,photoUrl:'https://example.invalid/mock.jpg',price:999,store:'私房'};
assert.equal(canonicalNutritionItem(chicken,withExtras).photoUrl,chicken.photoUrl);
assert.equal(canonicalNutritionItem(chicken,withExtras).price,chicken.price);
console.log('PASS: 100 verified canonical IDs, safe nutrition-only edits');

function storage(failOn=0) {
 const db=new Map();let writes=0;
 return {db,getItem:k=>db.has(k)?db.get(k):null,
  setItem(k,v){writes++;if(writes===failOn)throw Error('quota');db.set(k,String(v));},
  removeItem:k=>db.delete(k)};
}
let s=storage(),staged=stageOfficialEdit(s,{ownerUserId:owner,baseRevision:1,baseItem:chicken,editedItem:revised});
assert.equal(s.getItem(OFFICIAL_OUTBOX_KEY),null);
assert.deepEqual(staged.entry.item,canonical);
assert.throws(()=>pendingForOwner({...s,getItem:k=>k===OFFICIAL_OUTBOX_KEY?staged.bytes:s.getItem(k)},other),/不同/);
const cache=JSON.stringify({proteins:[revised],veggies:[],carbs:[],sauces:[]});
const oldCache=JSON.stringify({proteins:[chicken],veggies:[],carbs:[],sauces:[]});
s.setItem('kitchen_v2_ingredients.json',oldCache);
persistOfficialCatalogEdit(s,{newCatalogBytes:cache,newCustomBytes:null,newQueue:staged.bytes});
assert.equal(JSON.parse(s.getItem('kitchen_v2_ingredients.json')).proteins[0].per100g.kcal,revised.per100g.kcal);
assert.equal(readOfficialOutbox(s).entries[chicken.id].revision,1);
assert.equal(pendingForOwner(s,owner)[chicken.id].item.per100g.kcal,revised.per100g.kcal);
const published={ingredient_id:chicken.id,revision:2,ingredient:canonical};
assert.equal(clearPublishedEntry(s,owner,chicken.id,staged.entry,published),'cleared');
assert.equal(Object.keys(readOfficialOutbox(s).entries).length,0);
for(const nth of [1,2,3,4]) {
 // Force one of the journal/cache/outbox writes to fail; restore exact previous bytes.
 const mock=storage(nth);mock.db.set('kitchen_v2_ingredients.json',oldCache);
 const prior=[...mock.db];let err=null;
 try {persistOfficialCatalogEdit(mock,{newCatalogBytes:cache,newCustomBytes:null,newQueue:staged.bytes});}
 catch(e){err=e;}
 assert(err,/must fail/);
 assert.equal(mock.getItem('kitchen_v2_ingredients.json'),oldCache);
 assert.equal(mock.getItem(OFFICIAL_OUTBOX_KEY),null);
}
const crashed=storage();crashed.db.set('kitchen_v2_ingredients.json',cache);
crashed.db.set(OFFICIAL_OUTBOX_KEY,staged.bytes);
crashed.db.set(OFFICIAL_CATALOG_JOURNAL_KEY,JSON.stringify({status:'pending',before:{
 'kitchen_v2_ingredients.json':oldCache,'kitchen_v2_custom_ingredients':null,[OFFICIAL_OUTBOX_KEY]:null}}));
recoverOfficialCatalogEdit(crashed);
assert.equal(crashed.getItem('kitchen_v2_ingredients.json'),oldCache);
assert.equal(crashed.getItem(OFFICIAL_OUTBOX_KEY),null);
console.log('PASS: local atomic save, four failures, crash recovery, owner-bound pending state');

let context={userId:owner,scopeId:'household',token:'fake-test-token'};
let remote=clone(rows),sends=[];
const auth={getPersonalContext:()=>context,isCurrentContext:x=>x===context};
const fetcher=async(url,options)=>{
 sends.push({url,options});
 if (options.method==='PATCH') {
  const request=new URL(url),id=request.searchParams.get('ingredient_id').slice(3);
  const ver=Number(request.searchParams.get('revision').slice(3));
  const body=JSON.parse(options.body);
  const old=remote.find(x=>x.ingredient_id===id);
  if (old.revision!==ver) return {ok:true,status:200,json:async()=>[]};
  assert.equal(body.revision,ver+1);
  const newRow={...old,...body};
  remote=remote.map(row=>row.ingredient_id===id?newRow:row);
  return {ok:true,status:200,json:async()=>[newRow]};
 }
 return {ok:true,status:200,json:async()=>remote};
};
const service=new OfficialIngredientCatalogService({auth,fetcher});
assert.equal((await service.list()).length,100);
const saved=await service.publish({item:canonical,expectedRevision:1});
assert.equal(saved.revision,2);
assert.equal((await service.list()).find(row=>row.ingredient_id===chicken.id).ingredient.per100g.kcal,revised.per100g.kcal);
await assert.rejects(()=>service.publish({item:canonical,expectedRevision:1}),/更新/);
context={userId:other,scopeId:'ariel',token:'other-test-token'};
assert.equal((await service.list()).length,100);
context=null;
await assert.rejects(()=>service.list(),/登入/);
console.log('PASS: REST list, optimistic CAS, authenticated scope, conflict, no anonymous write');

// Validate the prepared production DDL's embedded seed against the exact
// current reviewed 100-item archive. No database write is performed here.
const sql=fs.readFileSync('supabase/migrations/20261108135259_fk14_ingredient_catalog_ssot.sql','utf8');
const seed=sql.match(/from jsonb_array_elements\('([\s\S]+)'::jsonb\) with ordinality as seed\(item,ordinality\);/);
assert(seed,'Migration must contain a single seeded JSON array');
const seeded=JSON.parse(seed[1].replaceAll("''","'"));
assert.deepEqual(seeded,rows.map(r=>r.ingredient),'Migration seed must preserve all official fields and original ordering');
assert(sql.includes('position integer not null unique'));
assert(sql.includes('new.position is distinct from old.position'));
assert(sql.includes('fk_shared_ingredient_nutrition'));
assert(sql.includes('if exists (select 1 from public.fk_shared_ingredient_nutrition)'));
assert(sql.includes('enable row level security'));
assert(!sql.includes('delete from public.fk_personal_kitchen_state'));
assert(!sql.includes('delete from public.fk_shared_ingredient_nutrition'));
console.log('PASS: draft migration seed exact 100-item field/order match, RLS/CAS/legacy guard, no data deletion');
