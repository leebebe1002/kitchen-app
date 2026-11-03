import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHmac,randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
assert(process.env.FK_EVIDENCE_DIR?.startsWith('/private/tmp/fk22-'));
const root=pathToFileURL(process.env.FK_EVIDENCE_DIR+'/');
const status=JSON.parse(execFileSync('supabase',['--workdir',new URL('local',root).pathname,'status','-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
const base=status.API_URL;assert.equal(base,'http://127.0.0.1:55431');assert(!fs.existsSync(new URL('local/supabase/.temp/project-ref',root)));
const sql=q=>execFileSync('docker',['--context','colima-fm-qa','exec','-i','supabase_db_fk16-fix-isolated-20261102','psql','-U','postgres','-X','-A','-t','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8'}).trim();
const native=fetch;const trace=[];let fault=null,gate=null;
const clone=x=>JSON.parse(JSON.stringify(x));const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
globalThis.fetch=async(url,o={})=>{
 const u=new URL(url);assert.equal(u.origin,base,'Non-isolated network refused');const event={path:u.pathname,method:o.method||'GET',query:u.search};trace.push(event);
 if(fault?.(u,o))throw Error('injected offline');
 const held=gate?.match(u,o)?gate:null;const r=await native(url,o);event.status=r.status;
 if(held){gate=null;held.enter.resolve();await held.release.promise;}return r;
};
async function call(path,{token=status.SERVICE_ROLE_KEY,method='GET',body,headers={}}={}){
 const r=await fetch(base+path,{method,headers:{apikey:status.ANON_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,body:await r.json().catch(()=>null)};
}
const admin=async(path,options)=>{const r=await call(path,options);assert(r.status<300,JSON.stringify({path,status:r.status,body:r.body}));return r.body;};
const values=new Map();globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};globalThis.sessionStorage=localStorage;globalThis.Vue={reactive:v=>v};globalThis.window={location:{hostname:'test.invalid'},addEventListener(){}};
const {SUPABASE_CONFIG}=await import('../web/src/services/SupabaseConfig.js');SUPABASE_CONFIG.url=base;SUPABASE_CONFIG.anonKey=status.ANON_KEY;
const {default:auth}=await import('../web/src/services/FamilyAuthService.js');
const {default:service}=await import('../web/src/services/SupabaseService.js?v=20261102_FK22_MEALS_V1');
const {default:Engine}=await import('../web/src/engine/KitchenEngine.js');
const {readMealState}=await import('../web/src/services/MealLogState.js?v=20261102_FK22_MEALS_V1');
const users={};const runId=randomBytes(4).toString('hex');
// Only this harness's clearly named synthetic accounts/rows may be removed on rerun.
const prior=(await admin('/auth/v1/admin/users?page=1&per_page=100')).users;
for(const u of prior.filter(u=>u.email?.startsWith('fk-isolated-meal-')&&u.email.endsWith('@example.invalid')))await admin('/auth/v1/admin/users/'+u.id,{method:'DELETE'});
sql("delete from public.meal_logs where id in ('owned-bebe','owned-ariel','owned-jason','offline-retry','switch-GET','switch-POST','denied-save');");
for(const [member,scope] of [['bebe','household'],['ariel','ariel'],['jason','household'],['outsider','household']]){
 const email=`fk-isolated-meal-${runId}-${member}@example.invalid`;
 // Real-world Ariel is preapproved by server allowlist but not yet signed up.
 if(member==='ariel')await admin('/rest/v1/fk_scope_email_allowlist',{method:'POST',body:{email,scope_id:'ariel'}});
 const u=await admin('/auth/v1/admin/users',{method:'POST',body:{email,password:randomBytes(24).toString('hex'),email_confirm:true}});users[member]={id:u.id,email};
 if(member!=='ariel')await admin('/rest/v1/fk_scope_members',{method:'POST',body:{user_id:u.id,scope_id:scope}});
 if(member!=='outsider'&&member!=='ariel')await admin('/rest/v1/fk_meal_access',{method:'POST',body:{user_id:u.id,member,is_manager:member==='bebe'}});
}
async function login(member){fault=null;const link=await admin('/auth/v1/admin/generate_link',{method:'POST',body:{type:'magiclink',email:users[member].email}});await auth.verifyEmailCode(users[member].email,link.email_otp||link.properties.email_otp);return auth.context;}
async function open(member){await login(member);const e=new Engine();assert(await e.initializeMealLogs());return e;}
const meal=id=>({id,dishName:'synthetic '+id,time:'12:30',source:'manual',portionRatio:'1.5',nutrients:{kcal:123.4,protein:4.5,carbs:6.7,fat:8.9,sodium:10},photoUrl:'https://images.example.invalid/meal.jpg',items:[{name:'synthetic food',amount:2}],aiNote:'synthetic note'});
const row=(member,id)=>({id,date:'2026-11-02',member,dish_name:'synthetic '+id,kcal:1});
const historical=()=>sql("select md5(string_agg((to_jsonb(m)-'access_confirmed')::text,'' order by id)) from public.meal_logs m where id like 'legacy-%';");const legacyBefore=historical();assert.equal(sql("select count(*) from meal_logs where id like 'legacy-%' and not access_confirmed;"),'158');
const result=[];
async function test(id,fn){try{await fn();result.push({id,status:'PASS'});console.log('PASS',id);}catch(e){result.push({id,status:'FAIL',error:e.message});console.log('FAIL',id,e.message);}finally{fault=null;gate=null;fs.writeFileSync(new URL('meal-results.json',root),JSON.stringify(result,null,2));fs.writeFileSync(new URL('meal-network.json',root),JSON.stringify(trace,null,2));}}

await test('preapproved-ariel-first-signup-gets-only-own-meal-and-scope-access',async()=>{
 const a=await admin('/rest/v1/fk_meal_access?user_id=eq.'+users.ariel.id);
 assert.equal(a.length,1);
 assert.equal(a[0].member,'ariel');
 assert.equal(a[0].is_manager,false);
 const scope=await admin('/rest/v1/fk_scope_members?user_id=eq.'+users.ariel.id);
 assert.equal(scope.length,1);
 assert.equal(scope[0].scope_id,'ariel');
 const outsider=await admin('/rest/v1/fk_meal_access?user_id=eq.'+users.outsider.id);
 assert.deepEqual(outsider,[]);
});
await test('anonymous-and-old-PWA-CRUD-denied',async()=>{
 for(const token of [status.ANON_KEY,status.PUBLISHABLE_KEY])for(const method of ['GET','POST','PATCH','DELETE']){
  const r=await call('/rest/v1/meal_logs?id=eq.legacy-3',{token,method,...(['POST','PATCH'].includes(method)?{body:row('bebe','anon-attempt')}:{})});assert([401,403].includes(r.status));
 }assert.equal(historical(),legacyBefore);
});
await test('Bebe-manages-all-members-and-stable-ID-upsert',async()=>{
 await login('bebe');assert.equal((await service.getMealAccess()).isManager,true);
 for(const member of ['bebe','ariel','jason']){const m=meal('owned-'+member);assert(await service.saveMeal('2026-11-02',member,m));assert(await service.saveMeal('2026-11-02',member,{...m,dishName:'updated '+member}));const items=await service.getMealsByDate('2026-11-02',member);assert.equal(items.length,1);assert.equal(items[0].dishName,'updated '+member);assert.deepEqual(items[0].nutrients,m.nutrients);assert.deepEqual(items[0].items,m.items);assert.equal(items[0].photoUrl,m.photoUrl);assert(await service.deleteMeal(m.id,'2026-11-02',member));assert.equal((await service.getMealsByDate('2026-11-02',member)).length,0);assert(await service.saveMeal('2026-11-02',member,m));}
 const rows=await call('/rest/v1/meal_logs',{token:auth.context.token});assert.equal(rows.body.length,3);
});
for(const member of ['ariel','jason'])await test(member+'-own-CRUD-and-no-household-promotion',async()=>{
 await login(member);assert.equal((await service.getMealAccess()).isManager,false);await service.saveMeal('2026-11-02',member,{...meal('owned-'+member),dishName:'self updated'});assert.equal((await service.getMealsByDate('2026-11-02',member))[0].dishName,'self updated');assert(await service.deleteMeal('owned-'+member,'2026-11-02',member));await service.saveMeal('2026-11-02',member,meal('owned-'+member));
 const token=auth.context.token;for(const target of ['bebe','ariel','jason'].filter(x=>x!==member)){
  const before=await admin('/rest/v1/meal_logs?id=eq.owned-'+target);
  for(const method of ['GET','PATCH','DELETE']){const r=await call('/rest/v1/meal_logs?id=eq.owned-'+target,{token,method,...(method==='PATCH'?{body:{dish_name:'forbidden'}}:{})});assert.equal(r.status,200);assert.deepEqual(r.body,[]);}
  const insert=await call('/rest/v1/meal_logs',{token,method:'POST',body:row(target,'spoof-'+member+'-'+target)});assert.equal(insert.status,403);assert.deepEqual(await admin('/rest/v1/meal_logs?id=eq.owned-'+target),before);
 }
 const visible=await call('/rest/v1/meal_logs?or=(member.eq.bebe,member.eq.ariel,member.eq.jason)',{token});assert(visible.body.every(r=>r.member===member));
});
await test('member-owner-role-and-metadata-forgery-denied',async()=>{
 await login('ariel');const token=auth.context.token;const old=await admin('/rest/v1/meal_logs?id=eq.owned-ariel');
 for(const body of [{member:'bebe'},{member:'jason'},{owner_id:users.bebe.id},{owner:users.bebe.id}]){const r=await call('/rest/v1/meal_logs?id=eq.owned-ariel',{token,method:'PATCH',body});assert([400,403].includes(r.status));}
 for(const method of ['POST','PATCH','DELETE']){const r=await call('/rest/v1/fk_meal_access?user_id=eq.'+users.ariel.id,{token,method,...(method==='DELETE'?{}:{body:{user_id:users.ariel.id,member:'bebe',is_manager:true}})});assert.equal(r.status,403);}
 const meta=await call('/auth/v1/user',{token,method:'PUT',body:{data:{member:'bebe',is_manager:true}}});assert.equal(meta.status,200);const denied=await call('/rest/v1/meal_logs?member=eq.bebe',{token});assert.deepEqual(denied.body,[]);assert.deepEqual(await admin('/rest/v1/meal_logs?id=eq.owned-ariel'),old);
});
await test('158-unconfirmed-historical-rows-hidden-and-cannot-be-claimed',async()=>{
 for(const member of ['bebe','ariel','jason']){await login(member);assert.equal((await service.getMealsByDate('2026-01-01',member)).length,0);const r=await call('/rest/v1/meal_logs?id=eq.legacy-3',{token:auth.context.token,method:'PATCH',body:{access_confirmed:true,member}});assert.deepEqual(r.body,[]);}
 await login('bebe');const r=await call('/rest/v1/meal_logs?on_conflict=id',{token:auth.context.token,method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:{...row('bebe','legacy-3'),date:'2026-01-01',access_confirmed:true}});assert.equal(r.status,403);assert.equal(historical(),legacyBefore);
});
await test('explicit-synthetic-history-confirmation-is-controlled-and-reversible',async()=>{
 await admin('/rest/v1/meal_logs?id=eq.legacy-3',{method:'PATCH',body:{access_confirmed:true}});await login('bebe');assert.equal((await service.getMealsByDate('2026-01-01','bebe')).length,1);await login('ariel');assert.deepEqual((await call('/rest/v1/meal_logs?id=eq.legacy-3',{token:auth.context.token})).body,[]);await admin('/rest/v1/meal_logs?id=eq.legacy-3',{method:'PATCH',body:{access_confirmed:false}});assert.equal(historical(),legacyBefore);
});
await test('unauthorized-account-gets-no-meals-even-with-household-membership',async()=>{
 const context=await login('outsider');const token=context.token;await assert.rejects(service.getMealAccess());assert.equal(auth.context,null);const r=await call('/rest/v1/meal_logs',{token});assert.deepEqual(r.body,[]);const w=await call('/rest/v1/meal_logs',{token,method:'POST',body:row('bebe','outsider-attempt')});assert.equal(w.status,403);
});
await test('private-session-function-not-exposed-as-public-RPC',async()=>{
 await login('ariel');for(const rpc of ['valid_meal_session','fk_confirm_new_meal_access']){const r=await call('/rest/v1/rpc/'+rpc,{token:auth.context.token,method:'POST',body:{}});assert([400,403,404].includes(r.status));}
 const r=await call('/rest/v1/rpc/valid_meal_session',{token:auth.context.token,method:'POST',headers:{'Content-Profile':'fk_private'},body:{}});assert([403,404,406].includes(r.status));
});
await test('expired-token-and-online-logout-revoke-meal-REST-access',async()=>{
 await login('ariel');const token=auth.context.token;const payload=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));payload.exp=Math.floor(Date.now()/1000)-1;const h=token.split('.')[0],p=Buffer.from(JSON.stringify(payload)).toString('base64url');const expired=h+'.'+p+'.'+createHmac('sha256',status.JWT_SECRET).update(h+'.'+p).digest('base64url');assert.equal((await call('/rest/v1/meal_logs',{token:expired})).status,401);
 assert(await auth.signOut());const r=await call('/rest/v1/meal_logs',{token});assert.equal(r.status,200);assert.deepEqual(r.body,[]);const w=await call('/rest/v1/meal_logs',{token,method:'POST',body:row('ariel','logged-out-attempt')});assert.equal(w.status,403);
});
await test('real-refresh-revalidates-user-and-membership-before-access',async()=>{
 await login('ariel');const session=clone(auth.session);const payload=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url'));payload.exp=Math.floor(Date.now()/1000)-1;const h=session.access_token.split('.')[0],p=Buffer.from(JSON.stringify(payload)).toString('base64url');const expired=h+'.'+p+'.'+createHmac('sha256',status.JWT_SECRET).update(h+'.'+p).digest('base64url');values.set('family_kitchen_auth_session',JSON.stringify({...session,access_token:expired}));const begin=trace.length;assert(await auth.initialize());assert.notEqual(auth.context.token,expired);assert(trace.slice(begin).some(t=>t.path==='/auth/v1/token'));assert(trace.slice(begin).some(t=>t.path==='/auth/v1/user'));assert(trace.slice(begin).some(t=>t.path==='/rest/v1/fk_scope_members'));assert((await service.getMealsByDate('2026-11-02','ariel')).length);
});
await test('late-refresh-cannot-replace-a-new-account-session',async()=>{
 await login('bebe');const session=clone(auth.session);const payload=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url'));payload.exp=Math.floor(Date.now()/1000)-1;const h=session.access_token.split('.')[0],p=Buffer.from(JSON.stringify(payload)).toString('base64url');const expired=h+'.'+p+'.'+createHmac('sha256',status.JWT_SECRET).update(h+'.'+p).digest('base64url');values.set('family_kitchen_auth_session',JSON.stringify({...session,access_token:expired}));
 const g={enter:defer(),release:defer(),match:u=>u.pathname==='/auth/v1/token'};gate=g;const old=auth.initialize();await g.enter.promise;await login('jason');const context=auth.context,saved=values.get('family_kitchen_auth_session');g.release.resolve();assert.equal(await old,null);assert.equal(auth.context,context);assert.equal(values.get('family_kitchen_auth_session'),saved);assert.equal((await service.getMealAccess()).member,'jason');
});
await test('offline-draft-restart-and-retry-preserve-data-without-duplicates',async()=>{
 const e=await open('ariel');fault=(u,o)=>u.pathname.endsWith('meal_logs')&&o.method==='POST';const m=meal('offline-retry');assert.equal(await e.recordMeal('2026-11-02','ariel',m),false);assert.equal(readMealState(users.ariel.id).pending.length,1);fault=null;await e.fetchMealsFromSupabase('2026-11-02','ariel');assert(e.getDailyLog('2026-11-02','ariel').meals.some(x=>x.id===m.id));const reopened=new Engine();assert(await reopened.initializeMealLogs());assert(await reopened.syncMealDrafts());assert.equal(readMealState(users.ariel.id).pending.length,0);assert.equal((await admin('/rest/v1/meal_logs?id=eq.'+m.id)).length,1);
});
for(const phase of ['GET','POST'])await test('A-B-A-late-'+phase+'-does-not-pollute-cache',async()=>{
 const e=await open('bebe');await e.recordMeal('2026-11-02','bebe',meal('switch-'+phase));const g={enter:defer(),release:defer(),match:(u,o)=>u.pathname.endsWith('meal_logs')&&(o.method||'GET')===phase};gate=g;const pending=phase==='GET'?e.fetchMealsFromSupabase('2026-11-02','bebe'):e.recordMeal('2026-11-02','bebe',{...meal('switch-'+phase),dishName:'pending before switch'});await g.enter.promise;e.clearPersonalScope();const b=await open('ariel');const bState=clone(b.data.dailyLogs);await login('bebe');const before=Object.fromEntries([...values].filter(([k])=>k.startsWith('kitchen_v2_meals_')));g.release.resolve();assert.equal(await pending,false);assert.deepEqual(Object.fromEntries([...values].filter(([k])=>k.startsWith('kitchen_v2_meals_'))),before);assert.deepEqual(b.data.dailyLogs,bState);
});
await test('real-403-failed-save-retains-account-draft-and-rollback-stays-locked',async()=>{
 const e=await open('jason');const legacy=historical();
 try{sql('revoke insert,update on public.meal_logs from authenticated;');assert.equal(await e.recordMeal('2026-11-02','jason',meal('denied-save')),false);assert(readMealState(users.jason.id).pending.some(x=>x.id==='denied-save'));assert.equal(auth.context,null);}finally{sql('grant select,insert,update,delete on public.meal_logs to authenticated;');}
 assert.equal(historical(),legacy);const anon=await call('/rest/v1/meal_logs',{token:status.ANON_KEY});assert([401,403].includes(anon.status));
});
await test('role-revocation-blocks-direct-REST-and-client-without-cache-destruction',async()=>{
 const e=await open('ariel');const before=values.get('kitchen_v2_meals_'+users.ariel.id);const token=auth.context.token;await admin('/rest/v1/fk_meal_access?user_id=eq.'+users.ariel.id,{method:'DELETE'});assert.equal(await e.fetchMealsFromSupabase('2026-11-02','ariel'),false);assert.equal(auth.context,null);assert.equal(values.get('kitchen_v2_meals_'+users.ariel.id),before);assert.deepEqual((await call('/rest/v1/meal_logs',{token})).body,[]);await admin('/rest/v1/fk_meal_access',{method:'POST',body:{user_id:users.ariel.id,member:'ariel',is_manager:false}});
});
assert.equal(historical(),legacyBefore);assert.equal(sql("select count(*) from meal_logs where id like 'legacy-%' and not access_confirmed;"),'158');
fs.writeFileSync(new URL('meal-security-schema.json',root),sql("select json_build_object('policies',(select json_agg(row_to_json(p)) from pg_policies p where tablename in ('meal_logs','fk_meal_access')),'functions',(select json_agg(json_build_object('name',n.nspname||'.'||p.proname,'security_definer',p.prosecdef,'config',p.proconfig)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('valid_meal_session','fk_confirm_new_meal_access')),'historical_rows',(select count(*) from meal_logs where id like 'legacy-%'),'historical_unconfirmed',(select count(*) from meal_logs where id like 'legacy-%' and not access_confirmed));"));
await auth.signOut();console.log(JSON.stringify({PASS:result.filter(x=>x.status==='PASS').length,FAIL:result.filter(x=>x.status==='FAIL').length,requests:trace.length,historical158Preserved:true}));process.exitCode=result.some(x=>x.status==='FAIL')?1:0;
