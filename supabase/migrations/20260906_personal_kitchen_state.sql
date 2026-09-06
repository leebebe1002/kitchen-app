-- Family Kitchen 2.0：個人庫存／採買資料空間
--
-- scope_id：household（Bebe + Jason）或 ariel（樂樂）
-- 全家共用的食材、料理等資料不寫入此表。

create table if not exists public.fk_personal_kitchen_state (
  scope_id text primary key check (scope_id in ('household', 'ariel')),
  pantry_inventory jsonb not null default '{"foodStockStatus": {}, "supplyStockStatus": {}, "shoppingList": [], "foodCart": []}'::jsonb,
  household_supplies jsonb not null default '{"supplies": []}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.fk_scope_members (
  scope_id text not null references public.fk_personal_kitchen_state(scope_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (scope_id, user_id)
);

-- 將 Email 預先核准到資料空間。使用者第一次以 magic link 登入時，
-- trigger 會自動建立 membership；前端無法自行加入任何空間。
create table if not exists public.fk_scope_email_allowlist (
  email text primary key check (email = lower(email)),
  scope_id text not null references public.fk_personal_kitchen_state(scope_id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.fk_assign_scope_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.fk_scope_members (scope_id, user_id)
  select allowlist.scope_id, new.id
  from public.fk_scope_email_allowlist allowlist
  where allowlist.email = lower(new.email)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists fk_assign_scope_on_signup on auth.users;
create trigger fk_assign_scope_on_signup
  after insert on auth.users
  for each row execute function public.fk_assign_scope_on_signup();

create or replace function public.fk_touch_personal_kitchen_state()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fk_touch_personal_kitchen_state on public.fk_personal_kitchen_state;
create trigger fk_touch_personal_kitchen_state
  before update on public.fk_personal_kitchen_state
  for each row execute function public.fk_touch_personal_kitchen_state();

alter table public.fk_personal_kitchen_state enable row level security;
alter table public.fk_scope_members enable row level security;
alter table public.fk_scope_email_allowlist enable row level security;

create policy "Members can see their own scope memberships"
  on public.fk_scope_members for select
  using (user_id = auth.uid());

create policy "Members can read their kitchen scope"
  on public.fk_personal_kitchen_state for select
  using (exists (
    select 1 from public.fk_scope_members memberships
    where memberships.scope_id = fk_personal_kitchen_state.scope_id
      and memberships.user_id = auth.uid()
  ));

create policy "Members can update their kitchen scope"
  on public.fk_personal_kitchen_state for update
  using (exists (
    select 1 from public.fk_scope_members memberships
    where memberships.scope_id = fk_personal_kitchen_state.scope_id
      and memberships.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.fk_scope_members memberships
    where memberships.scope_id = fk_personal_kitchen_state.scope_id
      and memberships.user_id = auth.uid()
  ));

-- 先建立兩個空間。現有線上資料遷移到 household 前，這裡不放任何內容。
insert into public.fk_personal_kitchen_state (scope_id)
values ('household'), ('ariel')
on conflict (scope_id) do nothing;

-- fk_scope_members 必須由 Supabase Dashboard 的 service role／管理流程寫入。
-- 前端 anon key 無權自行加入成員，避免任何人把自己加進家庭資料。
-- 新增 allowlist 後，若該 Email 早已登入過，請由管理端補跑：
-- insert into public.fk_scope_members (scope_id, user_id)
-- select a.scope_id, u.id from public.fk_scope_email_allowlist a
-- join auth.users u on lower(u.email) = a.email on conflict do nothing;
