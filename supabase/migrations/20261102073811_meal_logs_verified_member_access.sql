-- #22: restore verified meal access without reopening anonymous or unclassified history.
begin;
-- JWT signatures alone do not revoke already issued tokens on sign-out.
create schema if not exists fk_private;
revoke all on schema fk_private from public;
grant usage on schema fk_private to authenticated;
create function fk_private.valid_meal_session() returns boolean
language sql stable security definer set search_path = pg_catalog as $$
 select exists (select 1 from auth.sessions s where s.user_id = auth.uid()
   and s.id::text = auth.jwt()->>'session_id' and (s.not_after is null or s.not_after > now()));
$$;
revoke all on function fk_private.valid_meal_session() from public,anon,authenticated;
grant execute on function fk_private.valid_meal_session() to authenticated;

create table public.fk_meal_access (
 user_id uuid primary key references auth.users(id) on delete cascade,
 member text not null unique check (member in ('bebe','ariel','jason')),
 is_manager boolean not null default false check (not is_manager or member = 'bebe')
);
alter table public.fk_meal_access enable row level security;
revoke all on public.fk_meal_access from public,anon,authenticated;
grant select on public.fk_meal_access to authenticated;
create policy "Read own verified meal role" on public.fk_meal_access for select to authenticated
 using (user_id = (select auth.uid()) and (select fk_private.valid_meal_session()));

-- Existing payloads and member labels are untouched; no historical owner is guessed.
alter table public.meal_logs add column access_confirmed boolean not null default false;
alter table public.meal_logs enable row level security;
revoke all on public.meal_logs from public,anon,authenticated;
grant select,insert,update,delete on public.meal_logs to authenticated;

create or replace function public.fk_confirm_new_meal_access()
returns trigger language plpgsql security invoker set search_path = pg_catalog,public as $$
begin
 if current_user = 'authenticated' then
  if TG_OP = 'INSERT' then new.access_confirmed := true;
  else
   if not old.access_confirmed then raise insufficient_privilege using message = 'Historical meal attribution is unconfirmed'; end if;
   new.access_confirmed := old.access_confirmed;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.fk_confirm_new_meal_access() from public,anon,authenticated;
create trigger fk_confirm_new_meal_access before insert or update on public.meal_logs
 for each row execute function public.fk_confirm_new_meal_access();

create policy "Verified family meal access" on public.meal_logs for all to authenticated
 using (access_confirmed and (select fk_private.valid_meal_session()) and exists (select 1 from public.fk_meal_access a where a.user_id = (select auth.uid()) and (a.is_manager or a.member = meal_logs.member)))
 with check (access_confirmed and (select fk_private.valid_meal_session()) and member in ('bebe','ariel','jason') and exists (select 1 from public.fk_meal_access a where a.user_id = (select auth.uid()) and (a.is_manager or a.member = meal_logs.member)));
-- A restrictive counterpart also guards against a surviving historical permissive policy.
create policy "Require confirmed member access" on public.meal_logs as restrictive for all to authenticated
 using (access_confirmed and (select fk_private.valid_meal_session()) and exists (select 1 from public.fk_meal_access a where a.user_id = (select auth.uid()) and (a.is_manager or a.member = meal_logs.member)))
 with check (access_confirmed and (select fk_private.valid_meal_session()) and member in ('bebe','ariel','jason') and exists (select 1 from public.fk_meal_access a where a.user_id = (select auth.uid()) and (a.is_manager or a.member = meal_logs.member)));
notify pgrst, 'reload schema';
commit;
