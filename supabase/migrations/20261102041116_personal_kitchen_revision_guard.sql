-- FK #16: server-owned revisions and explicit empty-state intent.
-- Existing empty rows remain legacy: a past clear cannot be inferred from timestamps.
begin;
alter table public.fk_personal_kitchen_state
  add column sync_revision bigint not null default 0 check (sync_revision >= 0 and sync_revision < 9007199254740991),
  add column sync_status text not null default 'legacy'
    check (sync_status in ('legacy', 'initial', 'active', 'cleared'));

create or replace function public.fk_guard_personal_kitchen_revision()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  is_empty boolean;
begin
  if current_user in ('authenticated', 'anon') then
    if headers->>'x-fk-sync-protocol' is distinct from '2'
       or headers->>'x-fk-expected-revision' is distinct from old.sync_revision::text then
      raise sqlstate 'PT409' using message = 'FK_SYNC_CONFLICT: reload with revision protocol 2';
    end if;
    if new.scope_id is distinct from old.scope_id then
      raise insufficient_privilege using message = 'Scope cannot be changed';
    end if;
  end if;
  is_empty := new.pantry_inventory = '{"foodStockStatus":{},"supplyStockStatus":{},"shoppingList":[],"foodCart":[]}'::jsonb
    and new.household_supplies = '{"supplies":[]}'::jsonb;
  new.sync_revision := old.sync_revision + 1;
  new.version := old.version + 1;
  -- Only an administrator may explicitly certify a virgin, empty row.
  if current_user in ('authenticated', 'anon') or new.sync_status not in ('initial', 'legacy') then
    new.sync_status := case when is_empty then 'cleared' else 'active' end;
  end if;
  if new.sync_status in ('initial', 'cleared') and not is_empty then
    raise check_violation using message = 'Empty-state marker requires empty content';
  end if;
  return new;
end;
$$;
revoke all on function public.fk_guard_personal_kitchen_revision() from public, anon, authenticated;
create trigger fk_guard_personal_kitchen_revision
  before update on public.fk_personal_kitchen_state
  for each row execute function public.fk_guard_personal_kitchen_revision();
-- RLS and memberships are unchanged. Explicit grants avoid environment default differences.
grant select, update on public.fk_personal_kitchen_state to authenticated;
notify pgrst, 'reload schema';
commit;
