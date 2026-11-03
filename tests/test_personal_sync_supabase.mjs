import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// This test refuses hosted projects and uses only a dedicated, disposable local stack.
assert(/^\/private\/tmp\/fk(?:16|22)-/.test(process.env.FK_EVIDENCE_DIR || ''), 'Set FK_EVIDENCE_DIR to the isolated evidence directory');
const root = pathToFileURL(process.env.FK_EVIDENCE_DIR + '/');
const project = 'fk16-fix-isolated-20261102';
const docker = (...args) => execFileSync('docker', ['--context', 'colima-fm-qa', ...args], { encoding: 'utf8' });
const status = JSON.parse(execFileSync('supabase', ['--workdir', new URL('local', root).pathname, 'status', '-o', 'json'], { encoding: 'utf8', env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1', DOCKER_HOST: 'unix:///Users/bebelee/.colima/fm-qa/docker.sock' }, stdio: ['ignore', 'pipe', 'pipe'] }));
const base = status.API_URL;
assert.equal(base, 'http://127.0.0.1:55431');
assert.equal(status.DB_URL, 'postgresql://postgres:postgres@127.0.0.1:55432/postgres');
assert(!fs.existsSync(new URL('local/supabase/.temp/project-ref', root)));
const containers = JSON.parse(docker('inspect', `supabase_db_${project}`, `supabase_auth_${project}`, `supabase_rest_${project}`, `supabase_kong_${project}`));
const envOf = c => Object.fromEntries(c.Config.Env.map(x => { const i=x.indexOf('='); return [x.slice(0,i),x.slice(i+1)]; }));
assert(containers.every(c => c.Name.endsWith(project)));
assert(envOf(containers[1]).GOTRUE_DB_DATABASE_URL.includes(`supabase_db_${project}`));
assert(envOf(containers[2]).PGRST_DB_URI.includes(`supabase_db_${project}`));
const sql = q => execFileSync('docker', ['--context','colima-fm-qa','exec','-i',`supabase_db_${project}`,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-X','-A','-t'], { input:q, encoding:'utf8' });
const schema = sql("select json_build_object('database',current_database(),'server',version(),'rls',(select json_agg(json_build_object('table',relname,'enabled',relrowsecurity)) from pg_class where relname in ('fk_personal_kitchen_state','fk_scope_members','fk_scope_email_allowlist')),'policies',(select json_agg(row_to_json(p)) from pg_policies p where tablename like 'fk_%'),'constraints',(select json_agg(pg_get_constraintdef(oid)) from pg_constraint where conrelid='public.fk_scope_members'::regclass));");
fs.writeFileSync(new URL('isolation.json',root), JSON.stringify({project,api:base,dbHost:'127.0.0.1:55432',remoteLink:false,containers:containers.map(c=>({name:c.Name,image:c.Config.Image,network:Object.keys(c.NetworkSettings.Networks),ports:c.NetworkSettings.Ports})),authDatabaseSameProject:true,restDatabaseSameProject:true,schema:JSON.parse(schema)},null,2));

const nativeFetch = globalThis.fetch;
const trace=[]; let fault=null; let gate=null;
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
globalThis.fetch = async (input, options={}) => {
  const u=new URL(input); assert.equal(u.origin,base,'NETWORK GUARD: non-isolated request refused');
  const event={method:options.method||'GET',path:u.pathname,query:u.search,status:null};trace.push(event);
  if(fault?.match(u,options)){event.fault=fault.name; if(fault.error)throw Error(fault.name);event.status=fault.status;return new Response(JSON.stringify({message:fault.name}),{status:fault.status});}
  const held=gate?.match(u,options)?gate:null;
  const response=await nativeFetch(input,options);event.status=response.status;
  if(held){held.enter.resolve();await held.release.promise;event.delayed=true;}
  return response;
};
const call=async(path,{token=status.SERVICE_ROLE_KEY,method='GET',body,prefer}={})=>{
 const r=await fetch(base+path,{method,headers:{apikey:status.ANON_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 return {status:r.status,body:await r.json().catch(()=>null)};
};
const admin=async(path,options)=>{const r=await call(path,options);assert(r.status<300,`admin ${path} status=${r.status}: ${JSON.stringify(r.body)}`);return r.body;};
const users={};const sessions={};const runId=randomBytes(4).toString('hex');
for(const [label,scope] of [['A','household'],['B','household'],['C','ariel'],['D',null],['M',null],['R','household']]){
 const email=`fk-isolated-fixed-${runId}-${label.toLowerCase()}@example.invalid`;
 if(scope)await admin('/rest/v1/fk_scope_email_allowlist',{method:'POST',body:{email,scope_id:scope},prefer:'return=representation'});
 const u=await admin('/auth/v1/admin/users',{method:'POST',body:{email,password:randomBytes(24).toString('hex'),email_confirm:true}});users[label]={id:u.id,email,scope};
}
await admin('/rest/v1/fk_scope_members',{method:'POST',body:[{user_id:users.M.id,scope_id:'household'},{user_id:users.M.id,scope_id:'ariel'}]});

const values=new Map(); let storageFailure=null;
globalThis.localStorage={getItem:key=>{if(storageFailure?.('get',key))throw Error('injected storage read failure');return values.get(key)??null;},setItem:(key,value)=>{if(storageFailure?.('set',key))throw Error('injected storage write failure');values.set(key,String(value));},removeItem:key=>values.delete(key)};
globalThis.sessionStorage=globalThis.localStorage;
globalThis.window={location:{hostname:'test.invalid'},addEventListener(){},removeEventListener(){}};
globalThis.Vue={reactive:value=>value};
const {SUPABASE_CONFIG}=await import(new URL('../web/src/services/SupabaseConfig.js',import.meta.url));
SUPABASE_CONFIG.url=base;SUPABASE_CONFIG.anonKey=status.ANON_KEY;
const {default:auth}=await import(new URL('../web/src/services/FamilyAuthService.js',import.meta.url));
const {default:sync}=await import(new URL('../web/src/services/PersonalKitchenSyncService.js',import.meta.url));
const {default:Engine}=await import(new URL('../web/src/engine/KitchenEngine.js',import.meta.url));
const stateModule=await import(new URL('../web/src/services/PersonalKitchenState.js?v=20261102_FK16_REVISION_V1',import.meta.url));
const {emptyPersonalKitchenState:blank,writePersonalKitchenState:write}=stateModule;
const stateKey=s=>'kitchen_v2_personal_state_'+s;
const clone=x=>structuredClone(x);
const nonempty=(label,time='2025-01-01T00:00:00Z')=>({pantryInventory:{foodStockStatus:{[label]:true},supplyStockStatus:{[label+'_supply']:true},shoppingList:[{id:label+'_shop',targetId:label,type:'food'}],foodCart:[{id:label+'_cart'}]},householdSupplies:{supplies:[{id:label+'_supply',name:'synthetic supply'}]},version:3,updatedAt:time});
const remote=async(s,state)=>{await admin('/rest/v1/fk_personal_kitchen_state?scope_id=eq.'+s,{method:'PATCH',prefer:'return=representation',body:{pantry_inventory:state.pantryInventory,household_supplies:state.householdSupplies,sync_status:state.syncStatus || (Object.keys(state.pantryInventory.foodStockStatus||{}).length ? 'active' : 'cleared')}});};
const getRemote=async s=>(await admin('/rest/v1/fk_personal_kitchen_state?scope_id=eq.'+s))[0];
const snapshot=()=>Object.fromEntries([...values].filter(([k])=>k.startsWith('kitchen_v2_personal_state_')));
async function login(label){
 fault=null;storageFailure=null;
 const link=await admin('/auth/v1/admin/generate_link',{method:'POST',body:{type:'magiclink',email:users[label].email}});
 const code=link.email_otp||link.properties?.email_otp;assert.match(code,/^\d{6,8}$/);
 await auth.verifyEmailCode(users[label].email,code);
 sessions[label]=clone(auth.session);return auth.getPersonalContext();
}
function engine(){const e=new Engine();e.personalScope=auth.context.scopeId;e.personalContext=auth.context;e.applyPersonalKitchenState(JSON.parse(values.get(stateKey(e.personalScope))||JSON.stringify(blank())));return e;}
function stored(scope,state){write(scope,state,{preserveUpdatedAt:true});}
const result=[];const evidence={};
async function test(id,title,fn){
 const start=trace.length;
 try{await fn();result.push({id,title,status:'PASS',requests:trace.length-start});console.log('PASS',id,title);}
 catch(e){result.push({id,title,status:'FAIL',error:e.message,requests:trace.length-start});console.log('FAIL',id,title,e.message);}
 finally{fault=null;gate=null;storageFailure=null;fs.writeFileSync(new URL('integration-results.json',root),JSON.stringify(result,null,2));fs.writeFileSync(new URL('network-trace.json',root),JSON.stringify(trace,null,2));}
}
await test('A1','A/B/C use real OTP verification, server membership selects scope',async()=>{
 for(const [label,scope] of [['A','household'],['B','household'],['C','ariel']]){values.clear();values.set('kitchen_v2_active_storage_scope','wrong');const c=await login(label);assert.equal(c.scopeId,scope);assert.equal(c.userId,users[label].id);}
});
await test('A2','A writes household and B reads shared synthetic data',async()=>{
 await login('A');await sync.saveState('household',{...nonempty('shared-A'),revision:(await sync.getState('household')).revision});await login('B');assert((await sync.getState('household')).pantryInventory.foodStockStatus['shared-A']);
});
for(const [id,label,target] of [['A3','C','household'],['A4','A','ariel']])await test(id,`${label} direct REST cannot read/write ${target}`,async()=>{
 await login(label);const before=await getRemote(target);const token=auth.context.token;
 const r=await call('/rest/v1/fk_personal_kitchen_state?scope_id=eq.'+target,{token});assert.equal(r.status,200);assert.deepEqual(r.body,[]);
 const w=await call('/rest/v1/fk_personal_kitchen_state?scope_id=eq.'+target,{token,method:'PATCH',prefer:'return=representation',body:{pantry_inventory:nonempty('forbidden').pantryInventory}});assert.equal(w.status,200);assert.deepEqual(w.body,[]);assert.deepEqual(await getRemote(target),before);
 await assert.rejects(sync.getState(target));await assert.rejects(sync.saveState(target,blank()));
});
await test('A5','anon and no-membership users cannot access private rows',async()=>{
 const link=await admin('/auth/v1/admin/generate_link',{method:'POST',body:{type:'magiclink',email:users.D.email}});
 const v=await call('/auth/v1/verify',{token:status.ANON_KEY,method:'POST',body:{email:users.D.email,token:link.email_otp,type:'email'}});assert.equal(v.status,200);
 const before=await getRemote('household');
 for(const token of [status.ANON_KEY,v.body.access_token]){const r=await call('/rest/v1/fk_personal_kitchen_state',{token});assert.deepEqual(r.body,[]);const w=await call('/rest/v1/fk_personal_kitchen_state?scope_id=eq.household',{token,method:'PATCH',prefer:'return=representation',body:{pantry_inventory:{}}});assert.deepEqual(w.body,[]);}
 values.set('family_kitchen_auth_session',JSON.stringify({access_token:v.body.access_token}));assert.equal(await auth.initialize(),null);assert.equal(auth.context,null);assert.deepEqual(await getRemote('household'),before);
});
await test('A6','validly signed expired token and invalid token rejected by real Auth/REST',async()=>{
 await login('A');const payload=JSON.parse(Buffer.from(auth.context.token.split('.')[1],'base64url'));payload.exp=Math.floor(Date.now()/1000)-60;
 const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),p=Buffer.from(JSON.stringify(payload)).toString('base64url');
 const expired=h+'.'+p+'.'+createHmac('sha256',status.JWT_SECRET).update(h+'.'+p).digest('base64url');
 for(const token of [expired,'invalid.jwt.value']){const r=await call('/rest/v1/fk_personal_kitchen_state',{token});assert.equal(r.status,401);values.set('family_kitchen_auth_session',JSON.stringify({access_token:token}));assert.equal(await auth.initialize(),null);assert.equal(auth.context,null);}
});
await test('A6-revoked','revoked synthetic account cannot recover permission with cached token',async()=>{
 values.clear();await login('R');const token=auth.context.token;await admin('/auth/v1/admin/users/'+users.R.id,{method:'DELETE'});assert.equal(await auth.initialize(),null);assert.equal(auth.context,null);
 const r=await call('/rest/v1/fk_personal_kitchen_state?scope_id=eq.household',{token});assert([200,401].includes(r.status));if(r.status===200)assert.deepEqual(r.body,[]);
});
await test('A7','cached foreign identity and stale saved scope do not authorize',async()=>{
 await login('A');const previous=auth.context;values.set('family_kitchen_auth_session',JSON.stringify(sessions.C));assert.equal(auth.getPersonalContext(),null);assert(!auth.isCurrentContext(previous));await auth.initialize();assert.equal(auth.context.userId,users.C.id);assert.equal(auth.context.scopeId,'ariel');
});
await test('A8','two legal membership rows fail closed; client cannot self-assign',async()=>{
 await assert.rejects(login('M'));assert.equal(auth.context,null);
 await login('D').catch(()=>{});assert.equal(auth.context,null);
 await login('A');const r=await call('/rest/v1/fk_scope_members',{token:auth.context.token,method:'POST',body:{scope_id:'ariel',user_id:users.A.id}});assert([401,403].includes(r.status));const other=await call('/rest/v1/fk_scope_members?user_id=eq.'+users.C.id,{token:auth.context.token});assert.deepEqual(other.body,[]);
});

for(const scope of ['household','ariel']){
 const label=scope==='household'?'A':'C';
 await test('B1-'+scope,'first empty local loads nonempty remote without PATCH',async()=>{
  values.clear();await login(label);await remote(scope,nonempty('existing-'+scope));const before=await getRemote(scope);const e=new Engine();
  // Static/legacy boundary is a synthetic empty fixture; Auth/REST/DB stay real.
  e.fetchJson=async(f,key,fallback)=>{e.data[key]=clone(fallback);};await e.initializePersonalKitchenState();assert.equal(JSON.parse(values.get(stateKey(scope))).updatedAt,null);
  const t=trace.length;await e.syncPersonalKitchenState();assert(!trace.slice(t).some(x=>x.method==='PATCH'));assert.deepEqual(await getRemote(scope),before);assert(e.data.pantryInventory.foodStockStatus['existing-'+scope]);
 });
 await test('B2-'+scope,'nonempty local initializes empty remote',async()=>{
  values.clear();await login(label);await remote(scope,{...blank(),syncStatus:'initial'});stored(scope,nonempty('local-'+scope));const e=engine();await e.syncPersonalKitchenState();assert((await getRemote(scope)).pantry_inventory.foodStockStatus['local-'+scope]);
 });
 await test('B3-'+scope,'ambiguous legacy drafts conflict; known revision edits sync safely',async()=>{
  values.clear();await login(label);await remote(scope,nonempty('remote-new'));stored(scope,nonempty('local-old'));const e=engine();const before=snapshot(),db=await getRemote(scope);
  await assert.rejects(e.syncPersonalKitchenState(),{code:'FK_SYNC_CONFLICT'});assert.deepEqual(snapshot(),before);assert.deepEqual(await getRemote(scope),db);
  stored(scope,await sync.getState(scope));e.applyPersonalKitchenState(JSON.parse(values.get(stateKey(scope))));e.applyPersonalKitchenState(nonempty('local-new'));e.persistPersonalKitchenState();await e.syncPersonalKitchenState();assert((await getRemote(scope)).pantry_inventory.foodStockStatus['local-new']);
 });
 await test('B4-'+scope,'explicit user clear PATCH reaches database',async()=>{
  values.clear();await login(label);await remote(scope,nonempty('clear-me'));const e=engine();await e.syncPersonalKitchenState();await new Promise(r=>setTimeout(r,5));e.applyPersonalKitchenState(blank());assert(e.persistPersonalKitchenState());await e.syncPersonalKitchenState();const row=await getRemote(scope);assert.deepEqual(row.pantry_inventory,blank().pantryInventory);assert.deepEqual(row.household_supplies,blank().householdSupplies);
 });
 await test('B5-'+scope,'backup failure keeps original local bytes and remote data',async()=>{
  values.clear();await login(label);await remote(scope,nonempty('backup-original'));stored(scope,await sync.getState(scope));const e=engine();const before=snapshot();
  storageFailure=(op,k)=>op==='set'&&k===stateKey(scope)+'_backup';assert.throws(()=>write(scope,blank()));assert.deepEqual(snapshot(),before);
  await remote(scope,nonempty('backup-remote'));const db=await getRemote(scope);await assert.rejects(e.syncPersonalKitchenState(),/write failure/);assert.deepEqual(snapshot(),before);assert.deepEqual(await getRemote(scope),db);
 });
}

function hold(method){const g={enter:deferred(),release:deferred(),match:(u,o)=>u.pathname.endsWith('/fk_personal_kitchen_state')&&(o.method||'GET')===method};gate=g;return g;}
const settle=p=>p.then(value=>({value}),e=>({error:e.message}));
async function newIdentity(label,e){await login(label);e.clearPersonalScope();e.personalContext=auth.context;e.personalScope=auth.context.scopeId;e.applyPersonalKitchenState(JSON.parse(values.get(stateKey(e.personalScope))||JSON.stringify(blank())));}
async function prepare(label='A'){values.clear();await login(label);const scope=auth.context.scopeId;await remote(scope,nonempty('local-old'));stored(scope,await sync.getState(scope));await remote(scope,nonempty('remote-fresh'));return engine();}
for(const [id,mode] of [['C1','different-scope'],['C2','A-B-A'],['C4','same-scope-account'],['C5','logout']])await test(id,`delayed real GET: ${mode}`,async()=>{
 const e=await prepare();const g=hold('GET');const old=settle(e.syncPersonalKitchenState());await g.enter.promise;gate=null;
 if(mode==='logout'){auth.signOut();e.clearPersonalScope();}else if(mode==='same-scope-account'){await newIdentity('B',e);}else{await newIdentity('C',e);if(mode==='A-B-A')await newIdentity('A',e);}
 const before=snapshot(),data=clone(e.data.pantryInventory),context=auth.context;g.release.resolve();const result=await old;assert(result.error||result.value===false);assert.deepEqual(snapshot(),before);assert.deepEqual(e.data.pantryInventory,data);assert.equal(auth.context,context);
});
await test('C3','in-flight real PATCH finishes only on original scope; new account untouched',async()=>{
 const e=await prepare();await e.syncPersonalKitchenState();e.applyPersonalKitchenState(nonempty('patch-old'));e.persistPersonalKitchenState();const ariel=await getRemote('ariel');
 const g=hold('PATCH');const old=settle(e.syncPersonalKitchenState());await g.enter.promise;gate=null;await newIdentity('C',e);const before=snapshot(),data=clone(e.data.pantryInventory),context=auth.context;g.release.resolve();const r=await old;assert(r.error||r.value===false);assert.deepEqual(snapshot(),before);assert.deepEqual(e.data.pantryInventory,data);assert.equal(auth.context,context);assert.deepEqual(await getRemote('ariel'),ariel);assert((await getRemote('household')).pantry_inventory.foodStockStatus['patch-old']);
});
await test('C6','expired session blocks sync; real re-login recovers',async()=>{
 const e=await prepare();const before=snapshot();auth.context=Object.freeze({...auth.context,expiresAt:Date.now()-1});assert.equal(await e.syncPersonalKitchenState(),false);assert.equal(auth.context,null);assert.deepEqual(snapshot(),before);await newIdentity('A',e);await e.syncPersonalKitchenState();assert(e.hasPersonalAccess());
});
await test('C7','out-of-order real GETs under same identity do not roll back newer data',async()=>{
 const e=await prepare();await remote('household',nonempty('first-response'));const g=hold('GET');const old=settle(e.syncPersonalKitchenState());await g.enter.promise;gate=null;await remote('household',nonempty('second-response'));await e.syncPersonalKitchenState();assert(e.data.pantryInventory.foodStockStatus['second-response']);g.release.resolve();await old;assert(e.data.pantryInventory.foodStockStatus['second-response'],'Delayed first GET rolled back newer accepted second GET');
});
await test('C8','old unauthorized response cannot invalidate a new account',async()=>{
 const e=await prepare();const token=auth.context.token;const g=hold('GET');const old=settle(e.syncPersonalKitchenState());await g.enter.promise;gate=null;await newIdentity('C',e);const context=auth.context;g.release.resolve();await old;assert.equal(auth.context,context);assert(e.hasPersonalAccess());assert.notEqual(context.token,token);
});

await test('D1','network failure fails closed, preserves both scope caches, reconnect rechecks membership',async()=>{
 const e=await prepare();stored('ariel',nonempty('other-scope'));const before=snapshot();const t=trace.length;fault={name:'offline',error:true,match:u=>u.pathname.includes('fk_personal_kitchen_state')};await assert.rejects(e.syncPersonalKitchenState());assert.equal(auth.context,null);assert.deepEqual(snapshot(),before);fault=null;await auth.initialize();assert(auth.context);const requests=trace.slice(t);assert(requests.some(r=>r.path==='/auth/v1/user'));assert(requests.some(r=>r.path==='/rest/v1/fk_scope_members'));await newIdentity('A',e);await e.syncPersonalKitchenState();assert(e.hasPersonalAccess());
});
await test('D2','real revoked membership gives empty RLS rows and app fails closed',async()=>{
 const e=await prepare();const before=snapshot();await admin('/rest/v1/fk_scope_members?user_id=eq.'+users.A.id,{method:'DELETE'});await assert.rejects(e.syncPersonalKitchenState());assert.equal(auth.context,null);assert.deepEqual(snapshot(),before);await admin('/rest/v1/fk_scope_members',{method:'POST',body:{scope_id:'household',user_id:users.A.id}});
});
await test('D3','real 401 is distinct from transport failure and neither reports synced',async()=>{
 const e=await prepare();const before=snapshot();const ctx=auth.context;const original=sync.headers;sync.headers=c=>({...original.call(sync,c),Authorization:'Bearer invalid.jwt.value'});
 try{const t=trace.length;await assert.rejects(e.syncPersonalKitchenState());assert(trace.slice(t).some(r=>r.status===401));assert.equal(auth.context,null);assert.deepEqual(snapshot(),before);}finally{sync.headers=original;}
 assert(!auth.isCurrentContext(ctx));
});
await test('D4','403 handling preserves local bytes (injected status, supplemental only)',async()=>{
 const e=await prepare();const before=snapshot();fault={name:'injected-forbidden',status:403,match:u=>u.pathname.includes('fk_personal_kitchen_state')};await assert.rejects(e.syncPersonalKitchenState());assert.equal(auth.context,null);assert.deepEqual(snapshot(),before);
});
await test('D5','initial state write failure does not PATCH remote',async()=>{
 values.clear();await login('C');await remote('ariel',nonempty('init-protected'));const before=await getRemote('ariel');storageFailure=(op,k)=>op==='set'&&k===stateKey('ariel');const e=new Engine();const start=trace.length;await assert.rejects(e.initializePersonalKitchenState());assert(!trace.slice(start).some(r=>r.method==='PATCH'));assert.deepEqual(await getRemote('ariel'),before);
});
await test('B6','explicit remote clearing propagates to another existing device',async()=>{
 values.clear();await login('A');stored('household',nonempty('old-device','2020-01-01T00:00:00Z'));await remote('household',blank());const e=engine();await e.syncPersonalKitchenState();const row=await getRemote('household');assert.deepEqual(row.pantry_inventory,blank().pantryInventory,'A device resurrected old data after another device explicitly cleared remote');
});
await test('B7','transient local read failure cannot replace valid saved scope state',async()=>{
 values.clear();await login('C');stored('ariel',nonempty('valid-local'));const before=values.get(stateKey('ariel'));let failed=false;storageFailure=(op,k)=>{if(!failed&&op==='get'&&k===stateKey('ariel')){failed=true;return true;}return false;};const e=new Engine();await e.initializePersonalKitchenState().catch(()=>{});assert.equal(values.get(stateKey('ariel')),before,'Initialization overwrote valid local state after a failed read');
});

// Re-run original delayed PATCH dispatch, using drafts bound to an accepted revision.
await test('C9','delayed older PATCH cannot overwrite a newer accepted edit',async()=>{
 values.clear();await login('A');await remote('household',nonempty('base'));stored('household',await sync.getState('household'));const e=engine();e.applyPersonalKitchenState(nonempty('edit-first'));e.persistPersonalKitchenState();
 const enter=deferred(),release=deferred(),fetchBefore=globalThis.fetch;let consumed=false;
 globalThis.fetch=async(url,o)=>{if(!consumed&&new URL(url).pathname.endsWith('/fk_personal_kitchen_state')&&o?.method==='PATCH'){consumed=true;enter.resolve();await release.promise;}return fetchBefore(url,o);};
 try {
  const first=settle(e.syncPersonalKitchenState());await enter.promise;e.applyPersonalKitchenState(nonempty('edit-second'));e.persistPersonalKitchenState();await e.syncPersonalKitchenState();const accepted=await getRemote('household');release.resolve();const outcome=await first;const after=await getRemote('household');
  evidence.patchOrder={accepted,after,outcome};assert.deepEqual(after,accepted);assert(after.pantry_inventory.foodStockStatus['edit-second']);assert(outcome.error||outcome.value===false);assert.equal(JSON.parse(values.get(stateKey('household'))).dirty,false);
 } finally {release.resolve();globalThis.fetch=fetchBefore;}
});
await test('CAS-two-clients','same timestamp and revision from two household accounts: exactly one write accepted',async()=>{
 values.clear();await login('A');await remote('household',nonempty('base'));const baseState=await sync.getState('household'),tokenA=auth.context.token;await login('B');const tokenB=auth.context.token;
 const patch=token=>fetch(base+'/rest/v1/fk_personal_kitchen_state?scope_id=eq.household&sync_revision=eq.'+baseState.revision,{method:'PATCH',headers:{apikey:status.ANON_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation','x-fk-sync-protocol':'2','x-fk-expected-revision':String(baseState.revision)},body:JSON.stringify({pantry_inventory:nonempty(token===tokenA?'client-a':'client-b').pantryInventory,household_supplies:{supplies:[]},updated_at:baseState.updatedAt})}).then(async r=>({status:r.status,body:await r.json()}));
 const replies=await Promise.all([patch(tokenA),patch(tokenB)]);assert(replies.every(r=>r.status===200));assert.equal(replies.filter(r=>r.body.length===1).length,1);assert.equal(replies.filter(r=>r.body.length===0).length,1);const after=await getRemote('household');assert.equal(after.sync_revision,baseState.revision+1);evidence.twoClients={revision:baseState.revision,replies,after};
});
await test('CAS-trigger','missing filter still cannot bypass expected revision; legacy PWA rejected',async()=>{
 values.clear();await login('A');const state=await sync.getState('household'),before=await getRemote('household');
 for(const headers of [{},{'x-fk-sync-protocol':'2','x-fk-expected-revision':String(state.revision-1)}]){
  const r=await fetch(base+'/rest/v1/fk_personal_kitchen_state?scope_id=eq.household',{method:'PATCH',headers:{...sync.headers(auth.context),...headers},body:JSON.stringify({pantry_inventory:nonempty('forbidden-legacy').pantryInventory})});assert.equal(r.status,409);assert.deepEqual(await getRemote('household'),before);
 }
});
for(const [label,scope] of [['A','household'],['C','ariel']]) for(const offset of [-86400000,86400000,0]) await test('clock-'+scope+'-'+offset,'clear succeeds independent of device timestamp',async()=>{
 values.clear();await login(label);await remote(scope,nonempty('clear-me'));stored(scope,await sync.getState(scope));const e=engine();e.applyPersonalKitchenState(blank());e.persistPersonalKitchenState();
 const saved=JSON.parse(values.get(stateKey(scope)));saved.updatedAt=new Date(Date.parse((await getRemote(scope)).updated_at)+offset).toISOString();values.set(stateKey(scope),JSON.stringify(saved));
 await e.syncPersonalKitchenState();const row=await getRemote(scope);assert.deepEqual(row.pantry_inventory,blank().pantryInventory);assert.equal(row.sync_status,'cleared');assert.equal(row.sync_revision,saved.revision+1);
});
await test('legacy-empty','historical empty row cannot prove initial state or clear; preserve both',async()=>{
 values.clear();await login('A');await remote('household',{...blank(),syncStatus:'legacy'});stored('household',nonempty('unresolved'));const e=engine(),before=snapshot(),db=await getRemote('household');await assert.rejects(e.syncPersonalKitchenState(),{code:'FK_SYNC_CONFLICT'});assert.deepEqual(snapshot(),before);assert.deepEqual(await getRemote('household'),db);
});
for(const [label,scope] of [['A','household'],['C','ariel']]) await test('first-edit-'+scope,'fresh blank device accepts legacy baseline before its first edit',async()=>{
 values.clear();await login(label);await remote(scope,{...blank(),syncStatus:'legacy'});const e=new Engine();e.fetchJson=async(f,key,fallback)=>{e.data[key]=clone(fallback);};await e.initializePersonalKitchenState();await e.syncPersonalKitchenState();const revision=JSON.parse(values.get(stateKey(scope))).revision;
 e.applyPersonalKitchenState(nonempty('first-edit'));e.persistPersonalKitchenState();await e.syncPersonalKitchenState();const row=await getRemote(scope);assert(row.pantry_inventory.foodStockStatus['first-edit']);assert.equal(row.sync_revision,revision+1);
});
await test('restart-draft','offline restart keeps pending draft and its accepted base revision',async()=>{
 values.clear();await login('A');await remote('household',nonempty('base'));stored('household',await sync.getState('household'));const e=engine();e.applyPersonalKitchenState(nonempty('offline-edit'));e.persistPersonalKitchenState();const before=snapshot();
 fault={name:'offline',error:true,match:u=>u.pathname.includes('fk_personal_kitchen_state')};await assert.rejects(e.syncPersonalKitchenState());assert.deepEqual(snapshot(),before);fault=null;await auth.initialize();const reopened=new Engine();await reopened.initializePersonalKitchenState();assert(JSON.parse(values.get(stateKey('household'))).dirty);await reopened.syncPersonalKitchenState();assert((await getRemote('household')).pantry_inventory.foodStockStatus['offline-edit']);
});
for(const [label,scope] of [['A','household'],['C','ariel']]) await test('dirty-cleared-'+scope,'newer remote clear preserves offline draft through edits and app restart',async()=>{
 values.clear();await login(label);await remote(scope,nonempty('base'));stored(scope,await sync.getState(scope));const e=engine();e.applyPersonalKitchenState(nonempty('offline-original'));e.persistPersonalKitchenState();
 const revision=JSON.parse(values.get(stateKey(scope))).revision;await remote(scope,blank());const cleared=await getRemote(scope);assert.equal(cleared.sync_revision,revision+1);const before=snapshot(),start=trace.length;
 await assert.rejects(e.syncPersonalKitchenState(),{code:'FK_SYNC_CONFLICT'});assert.deepEqual(snapshot(),before);
 for(const edit of ['later-one','later-two']){e.data.pantryInventory.foodStockStatus[edit]=true;e.persistPersonalKitchenState();await assert.rejects(e.syncPersonalKitchenState(),{code:'FK_SYNC_CONFLICT'});}
 const reopened=new Engine();await reopened.initializePersonalKitchenState();await assert.rejects(reopened.syncPersonalKitchenState(),{code:'FK_SYNC_CONFLICT'});const saved=JSON.parse(values.get(stateKey(scope)));
 assert(saved.pantryInventory.foodStockStatus['offline-original']);assert(saved.pantryInventory.foodStockStatus['later-one']);assert(saved.pantryInventory.foodStockStatus['later-two']);assert.equal(saved.pantryInventory.shoppingList[0].targetId,'offline-original');assert.equal(saved.householdSupplies.supplies[0].id,'offline-original_supply');assert(saved.dirty);assert.equal(saved.revision,revision);
 assert(!trace.slice(start).some(t=>t.method==='PATCH'));assert.deepEqual(await getRemote(scope),cleared);
});
await test('ack-lost','lost PATCH acknowledgment preserves draft and does not blindly resend',async()=>{
 values.clear();await login('A');await remote('household',nonempty('base'));stored('household',await sync.getState('household'));const e=engine();e.applyPersonalKitchenState(nonempty('accepted-but-no-ack'));e.persistPersonalKitchenState();const before=snapshot(),fetchBefore=globalThis.fetch;
 globalThis.fetch=async(url,o)=>{const response=await fetchBefore(url,o);if(o?.method==='PATCH')throw Error('lost acknowledgment');return response;};
 try{await assert.rejects(e.syncPersonalKitchenState());}finally{globalThis.fetch=fetchBefore;}
 assert.deepEqual(snapshot(),before);const accepted=await getRemote('household');assert(accepted.pantry_inventory.foodStockStatus['accepted-but-no-ack']);await login('A');const reopened=engine();await assert.rejects(reopened.syncPersonalKitchenState(),{code:'FK_SYNC_CONFLICT'});assert.deepEqual(await getRemote('household'),accepted);assert.deepEqual(snapshot(),before);
});

await test('D6','real TCP connection failure fails closed and differs from real 401',async()=>{
 values.clear();await login('A');stored('household',nonempty('offline-data'));const e=engine();const before=snapshot();const fetchBefore=globalThis.fetch;
 globalThis.fetch=async(url,o)=>{assert.equal(new URL(url).origin,base);return nativeFetch('http://127.0.0.1:55429'+new URL(url).pathname,o);};
 let networkError;try{await e.syncPersonalKitchenState();}catch(error){networkError=error.message;}finally{globalThis.fetch=fetchBefore;}
 assert(networkError);assert.equal(auth.context,null);assert.deepEqual(snapshot(),before);const offlineMessage=auth.message;
 await login('A');const e2=engine();const headers=sync.headers;sync.headers=c=>({...headers.call(sync,c),Authorization:'Bearer invalid.jwt.value'});
 let authError;try{await e2.syncPersonalKitchenState();}catch(error){authError=error.message;}finally{sync.headers=headers;}
 assert(authError);assert.equal(auth.context,null);assert.notEqual(auth.message,offlineMessage);assert.notEqual(authError,networkError);assert.deepEqual(snapshot(),before);
 evidence.failureCategories={offlineMessage,unauthorizedMessage:auth.message,networkError,authError};
 await auth.initialize();assert.equal(auth.context.scopeId,'household');
});
await test('C8-real401','delayed real 401 from old account cannot invalidate new account',async()=>{
 values.clear();await login('A');const e=engine();const enter=deferred(),release=deferred();const headers=sync.headers;sync.headers=c=>({...headers.call(sync,c),Authorization:'Bearer invalid.jwt.value'});
 const fetchBefore=globalThis.fetch;let consumed=false;
 globalThis.fetch=async(url,o)=>{const r=await fetchBefore(url,o);if(!consumed&&new URL(url).pathname.endsWith('/fk_personal_kitchen_state')){consumed=true;assert.equal(r.status,401);enter.resolve();await release.promise;}return r;};
 const old=e.syncPersonalKitchenState().then(v=>({v}),err=>({error:err.message}));await enter.promise;sync.headers=headers;await login('C');e.clearPersonalScope();e.personalContext=auth.context;e.personalScope='ariel';const context=auth.context;const before=snapshot();release.resolve();const r=await old;globalThis.fetch=fetchBefore;assert(r.error);assert.equal(auth.context,context);assert.equal(context.scopeId,'ariel');assert.deepEqual(snapshot(),before);
});
await test('D7','real REST 403 closes permission and preserves cache',async()=>{
 values.clear();await login('A');stored('household',await sync.getState('household'));const before=snapshot(),db=await getRemote('household'),state=await sync.getState('household');
 try{sql('revoke update on public.fk_personal_kitchen_state from authenticated;');await assert.rejects(sync.saveState('household',{...nonempty('denied'),revision:state.revision}));assert.equal(auth.context,null);assert(trace.some(t=>t.status===403));assert.deepEqual(snapshot(),before);assert.deepEqual(await getRemote('household'),db);}finally{sql('grant update on public.fk_personal_kitchen_state to authenticated;');}
});
fs.writeFileSync(new URL('fixed-evidence.json',root),JSON.stringify(evidence,null,2));auth.signOut();
console.log(JSON.stringify({PASS:result.filter(r=>r.status==='PASS').length,FAIL:result.filter(r=>r.status==='FAIL').length,realSupabase:true,requests:trace.length}));process.exitCode=result.some(r=>r.status==='FAIL')?1:0;
