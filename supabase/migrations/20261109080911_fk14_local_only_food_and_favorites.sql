-- FK #14: PREPARED ONLY. Apply in production only after explicit authorization.
-- Custom ingredients are family-visible, but NEVER merged into the official
-- 100-food canonical catalog. Personal Kitchen State is completely untouched.
-- Favorite meal shortcuts are scoped by verified auth user; pantry/shopping
-- household and ariel remain separated. Avoid destructive migrations.
create table public.fk_shared_custom_ingredients (
    ingredient_id text primary key,
    ingredient jsonb not null,
    revision bigint not null default 1 check (revision between 1 and 9007199254740990),
    updated_by uuid not null references auth.users(id),
    updated_at timestamptz not null default now(),
    constraint fk14_custom_valid check (
        length(ingredient_id) between 1 and 120
        and jsonb_typeof(ingredient)='object'
        and ingredient->>'id'=ingredient_id
        and length(nullif(btrim(ingredient->>'name'),'')) between 1 and 180
        and ingredient->>'category' in ('proteins','veggies','carbs','sauces')
        and octet_length(ingredient::text)<=131072
        and ingredient::text !~* 'data:(image|application)/'
        and ingredient::text !~* 'blob:[a-z0-9]+:'
    )
);
alter table public.fk_shared_custom_ingredients enable row level security;
revoke all on public.fk_shared_custom_ingredients from public, anon, authenticated;
grant select, insert, update on public.fk_shared_custom_ingredients to authenticated;

create policy "Family reads shared custom foods" on public.fk_shared_custom_ingredients
for select to authenticated using (exists (
    select 1 from public.fk_meal_access a
    where a.user_id=(select auth.uid()) and a.member in ('bebe','ariel')
));
create policy "Family creates shared custom foods" on public.fk_shared_custom_ingredients
for insert to authenticated with check (
    revision=1 and updated_by=(select auth.uid())
    and exists (select 1 from public.fk_meal_access a
        where a.user_id=(select auth.uid()) and a.member in ('bebe','ariel'))
);
create policy "Family updates shared custom foods" on public.fk_shared_custom_ingredients
for update to authenticated using (exists (
    select 1 from public.fk_meal_access a
    where a.user_id=(select auth.uid()) and a.member in ('bebe','ariel')
)) with check (
    updated_by=(select auth.uid())
    and exists (select 1 from public.fk_meal_access a
        where a.user_id=(select auth.uid()) and a.member in ('bebe','ariel'))
);

create function public.fk14_shared_custom_guard()
returns trigger language plpgsql set search_path=public as $$
begin
    if tg_op='INSERT' then
        if new.revision<>1 then raise exception 'FK14 custom ingredient initial revision invalid'; end if;
    elsif new.ingredient_id is distinct from old.ingredient_id
        or new.revision is distinct from old.revision+1 then
        raise exception 'FK14 custom ingredient revision conflict' using errcode='40001';
    end if;
    new.updated_at=now();
    return new;
end $$;
create trigger fk14_shared_custom_guard
before insert or update on public.fk_shared_custom_ingredients
for each row execute function public.fk14_shared_custom_guard();

-- Per-person shortcuts, not all-family. Deleted favorites remain tombstoned
-- so a stale iPhone cannot resurrect them through a blind "merge".
create table public.fk_member_favorite_foods (
    owner_user_id uuid not null references auth.users(id),
    favorite_id text not null,
    favorite jsonb not null,
    is_deleted boolean not null default false,
    revision bigint not null default 1 check (revision between 1 and 9007199254740990),
    updated_at timestamptz not null default now(),
    primary key (owner_user_id,favorite_id),
    constraint fk14_favorite_valid check (
        length(favorite_id) between 1 and 120
        and jsonb_typeof(favorite)='object'
        and favorite->>'id'=favorite_id
        and length(nullif(btrim(favorite->>'name'),'')) between 1 and 180
        and octet_length(favorite::text)<=131072
        and favorite::text !~* 'data:(image|application)/'
    )
);
alter table public.fk_member_favorite_foods enable row level security;
revoke all on public.fk_member_favorite_foods from public, anon, authenticated;
grant select, insert, update on public.fk_member_favorite_foods to authenticated;

create policy "Owner reads saved meal shortcuts" on public.fk_member_favorite_foods
for select to authenticated using (
    owner_user_id=(select auth.uid()) and exists(
        select 1 from public.fk_meal_access a
        where a.user_id=(select auth.uid()) and a.member in ('bebe','ariel'))
);
create policy "Owner creates saved meal shortcuts" on public.fk_member_favorite_foods
for insert to authenticated with check (
    revision=1 and owner_user_id=(select auth.uid())
    and exists (select 1 from public.fk_meal_access a
        where a.user_id=(select auth.uid()) and a.member in ('bebe','ariel'))
);
create policy "Owner updates saved meal shortcuts" on public.fk_member_favorite_foods
for update to authenticated using (
    owner_user_id=(select auth.uid()) and exists (
        select 1 from public.fk_meal_access a
        where a.user_id=(select auth.uid()) and a.member in ('bebe','ariel'))
) with check (
    owner_user_id=(select auth.uid()) and exists (
        select 1 from public.fk_meal_access a
        where a.user_id=(select auth.uid()) and a.member in ('bebe','ariel'))
);

create function public.fk14_favorite_guard()
returns trigger language plpgsql set search_path=public as $$
begin
    if tg_op='INSERT' then
        if new.revision<>1 then raise exception 'FK14 favorite initial revision invalid'; end if;
    elsif new.owner_user_id is distinct from old.owner_user_id
        or new.favorite_id is distinct from old.favorite_id
        or new.revision is distinct from old.revision+1 then
        raise exception 'FK14 favorite revision conflict' using errcode='40001';
    end if;
    new.updated_at=now();
    return new;
end $$;
create trigger fk14_favorite_guard
before insert or update on public.fk_member_favorite_foods
for each row execute function public.fk14_favorite_guard();
