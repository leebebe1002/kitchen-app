import test from 'node:test';
import assert from 'node:assert/strict';
const values=new Map();
globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
globalThis.sessionStorage=localStorage;globalThis.Vue={reactive:v=>v};globalThis.window={location:{hostname:'test.invalid'},addEventListener(){}};
const {default:auth}=await import('../web/src/services/FamilyAuthService.js');
const {default:service}=await import('../web/src/services/SupabaseService.js?v=20261105_INGREDIENT_PHOTO_AUTH_V1');
const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
const {readMealState}=await import('../web/src/services/MealLogState.js?v=20261102_FK22_MEALS_V1');
const copy=x=>JSON.parse(JSON.stringify(x));const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
let rows=new Map(),failure=null,hold=null;const requests=[];
function identity(member){const token='fake-'+member;values.set('family_kitchen_auth_session',JSON.stringify({access_token:token}));auth.context=Object.freeze({userId:member,scopeId:member==='ariel'?'ariel':'household',token,expiresAt:Date.now()+60000});return auth.context;}
globalThis.fetch=async(url,o={})=>{
 const u=new URL(url);const who=o.headers?.Authorization?.replace('Bearer fake-','');requests.push({path:u.pathname,who,method:o.method||'GET'});
 if(failure)throw Error('offline');
 let result;
 if(u.pathname.endsWith('fk_meal_access'))result=[{user_id:who,member:who,is_manager:who==='bebe'}];
 else if(u.pathname.endsWith('meal_logs')){
  if(o.method==='POST'){const row=JSON.parse(o.body);rows.set(row.id,row);result=[row];}
  else if(o.method==='DELETE'){const id=u.searchParams.get('id').slice(3);rows.delete(id);result=[];}
  else result=[...rows.values()].filter(r=>r.date===u.searchParams.get('date').slice(3)&&r.member===u.searchParams.get('member').slice(3));
 }else throw Error('Unexpected network');
 const response={ok:true,status:200,json:async()=>copy(result)};
 if(hold?.match(u,o)){const gate=hold;hold=null;gate.enter.resolve();await gate.release.promise;}
 return response;
};
async function open(member){identity(member);const e=new Engine();assert(await e.initializeMealLogs());return e;}
const meal=(id='meal-one')=>({id,dishName:'synthetic',time:'12:30',source:'manual',portionRatio:'1.5',photoUrl:'https://images.example.invalid/photo.jpg',nutrients:{kcal:123,protein:4,carbs:5,fat:6,sodium:7},items:[{name:'synthetic item',amount:2}]});

test('verified session bearer, member authorization, stable ID upsert and exact values',async()=>{
 values.clear();rows.clear();const e=await open('bebe');assert(await e.recordMeal('2026-11-02','ariel',meal()));assert(await e.recordMeal('2026-11-02','ariel',{...meal(),dishName:'updated'}));assert.equal(rows.size,1);
 assert(await e.fetchMealsFromSupabase('2026-11-02','ariel'));const saved=e.getDailyLog('2026-11-02','ariel').meals[0];assert.equal(saved.dishName,'updated');assert.equal(saved.photoUrl,meal().photoUrl);assert.deepEqual(saved.nutrients,meal().nutrients);assert.deepEqual(saved.items,meal().items);
 const ariel=await open('ariel');await assert.rejects(ariel.recordMeal('2026-11-02','bebe',meal('forbidden')));assert.equal(ariel.getDailyLog('2026-11-02','bebe').meals.length,0);assert.equal(ariel.canAccessMeal('jason'),false);
 const jason=await open('jason');assert.equal(jason.canAccessMeal('bebe'),false);assert.equal(jason.canAccessMeal('jason'),true);
});
test('network failure retains draft, remote empty read merges pending, restart retries once',async()=>{
 values.clear();rows.clear();const e=await open('ariel');failure=true;assert.equal(await e.recordMeal('2026-11-02','ariel',meal()),false);assert.match(e.data.mealSyncMessage,/尚未同步/);assert.equal(readMealState('ariel').pending.length,1);
 failure=false;assert(await e.fetchMealsFromSupabase('2026-11-02','ariel'));assert.equal(e.getDailyLog('2026-11-02','ariel').meals.length,1);
 const reopened=await open('ariel');assert.equal(reopened.getDailyLog('2026-11-02','ariel').meals[0].id,'meal-one');assert(await reopened.syncMealDrafts());assert.equal(readMealState('ariel').pending.length,0);assert.equal(rows.size,1);
});
test('denied GET cannot replace cache and legacy shared history is never adopted or migrated',async()=>{
 values.clear();rows.clear();const legacy='{"logs":[{"private":"legacy family"}]}';values.set('kitchen_v2_daily_logs.json',legacy);const e=await open('jason');assert.equal(e.getDailyLog('2026-11-02','bebe').meals.length,0);await e.recordMeal('2026-11-02','jason',meal());const before=values.get('kitchen_v2_meals_jason');failure=true;assert.equal(await e.fetchMealsFromSupabase('2026-11-02','jason'),false);failure=false;assert.equal(values.get('kitchen_v2_meals_jason'),before);assert.equal(values.get('kitchen_v2_daily_logs.json'),legacy);await assert.rejects(service.migrateDailyLogs({logs:[]}));
});
for(const phase of ['GET','POST'])test(`${phase} response after A→B→A cannot apply or clear a pending draft`,async()=>{
 values.clear();rows.clear();const a=await open('bebe');await a.recordMeal('2026-11-02','bebe',meal());const gate={enter:defer(),release:defer(),match:(u,o)=>u.pathname.endsWith('meal_logs')&&(o.method||'GET')===phase};hold=gate;
 const pending=phase==='GET'?a.fetchMealsFromSupabase('2026-11-02','bebe'):a.recordMeal('2026-11-02','bebe',{...meal(),dishName:'new draft'});await gate.enter.promise;
 a.clearPersonalScope();const b=await open('ariel');const bBefore=copy(b.data.dailyLogs);identity('bebe');const aBefore=values.get('kitchen_v2_meals_bebe');gate.release.resolve();assert.equal(await pending,false);assert.deepEqual(b.data.dailyLogs,bBefore);assert.equal(values.get('kitchen_v2_meals_bebe'),aBefore);
});
test('edit while a GET is delayed, and same-context GET order, cannot overwrite latest local state',async()=>{
 values.clear();rows.clear();const e=await open('bebe');await e.recordMeal('2026-11-02','bebe',meal());const gate={enter:defer(),release:defer(),match:(u,o)=>u.pathname.endsWith('meal_logs')&&!o.method};hold=gate;const pending=e.fetchMealsFromSupabase('2026-11-02','bebe');await gate.enter.promise;
 await e.recordMeal('2026-11-02','bebe',{...meal(),dishName:'latest'});gate.release.resolve();assert.equal(await pending,false);assert.equal(e.getDailyLog('2026-11-02','bebe').meals[0].dishName,'latest');
});
test('offline delete preserves original in account queue, suppresses resurrection, and retries',async()=>{
 values.clear();rows.clear();const e=await open('ariel');await e.recordMeal('2026-11-02','ariel',meal());failure=true;assert.equal(await e.deleteMeal('2026-11-02','ariel','meal-one'),false);assert.equal(readMealState('ariel').pending[0].meal.dishName,'synthetic');failure=false;await e.fetchMealsFromSupabase('2026-11-02','ariel');assert.equal(e.getDailyLog('2026-11-02','ariel').meals.length,0);assert(await e.syncMealDrafts());assert.equal(rows.size,0);
});
test('read failure and backup failure cannot overwrite original state or report a saved meal',async()=>{
 values.clear();rows.clear();const e=await open('bebe');await e.recordMeal('2026-11-02','bebe',meal());const before=new Map(values);const set=localStorage.setItem;localStorage.setItem=(k,v)=>{if(k==='kitchen_v2_meals_bebe_backup')throw Error('quota');set(k,v);};await assert.rejects(e.recordMeal('2026-11-02','bebe',meal('second')),/quota/);assert.deepEqual(values,before);localStorage.setItem=set;
 const get=localStorage.getItem;localStorage.getItem=k=>{if(k==='kitchen_v2_meals_bebe')throw Error('read error');return get(k);};const next=new Engine();assert.equal(await next.initializeMealLogs(),false);assert.deepEqual(values,before);localStorage.getItem=get;
});
test('photo upload failure never persists Base64; logout blocks further API calls',async()=>{
 values.clear();rows.clear();const e=await open('bebe');const upload=e.supabase.uploadMealPhoto;e.supabase.uploadMealPhoto=async()=>null;await e.recordMeal('2026-11-02','bebe',{...meal(),photoUrl:'data:image/png;base64,AAAA'});e.supabase.uploadMealPhoto=upload;assert.equal(readMealState('bebe').logs[0].diners.bebe.meals[0].photoUrl,null);auth.invalidate();assert.equal(e.getDailyLog('2026-11-02','bebe').meals.length,0);const count=requests.length;await assert.rejects(e.recordMeal('2026-11-02','bebe',meal('denied')));assert.equal(requests.length,count);
});

test('malformed nested cache fails closed and preserves bytes',async()=>{
 values.clear();identity('bebe');const bad=JSON.stringify({userId:'bebe',logs:[null],pending:[]});values.set('kitchen_v2_meals_bebe',bad);const e=new Engine();assert.equal(await e.initializeMealLogs(),false);assert.equal(e.hasMealAccess(),false);assert.equal(values.get('kitchen_v2_meals_bebe'),bad);
});
