-- #22: role for preapproved ariel email on first sign-up, never infer manager.
begin;
create function fk_private.assign_allowlisted_ariel_meal_role()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
  if new.email is not null and exists (
    select 1 from public.fk_scope_email_allowlist a
    where a.email=lower(new.email) and a.scope_id='ariel'
  ) then
    insert into public.fk_meal_access (user_id, member, is_manager)
    values (new.id, 'ariel', false)
    on conflict do nothing;
  end if;
  return new;
end;
$$;
revoke all on function fk_private.assign_allowlisted_ariel_meal_role() from public,anon,authenticated;
create trigger fk_assign_allowlisted_ariel_meal_role after insert on auth.users
for each row execute function fk_private.assign_allowlisted_ariel_meal_role();
commit;
