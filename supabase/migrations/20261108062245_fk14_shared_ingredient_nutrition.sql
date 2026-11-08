-- FK #14: only verified changes to canonical shared ingredient nutrition.
-- No migration, copy, or modification of existing personal kitchen or meal data.
create table public.fk_shared_ingredient_nutrition (
    ingredient_id text primary key check (length(ingredient_id) between 1 and 128),
    identity jsonb not null check (jsonb_typeof(identity) = 'object'),
    nutrition jsonb not null check (jsonb_typeof(nutrition) = 'object'),
    evidence jsonb not null check (
        jsonb_typeof(evidence) = 'object'
        and evidence->>'kind' = 'product_label'
        and evidence->>'status' = 'verified'
    ),
    revision bigint not null default 1 check (revision >= 1),
    updated_by uuid not null default auth.uid(),
    updated_at timestamptz not null default now()
);

alter table public.fk_shared_ingredient_nutrition enable row level security;
revoke all on public.fk_shared_ingredient_nutrition from public, anon;
grant select, insert, update on public.fk_shared_ingredient_nutrition to authenticated;

-- Bebe and Ariel have verified fk_meal_access identities. Jason and other
-- household members are NOT permitted to edit this shared correction table.
create policy "Read shared nutrition for Bebe and Ariel"
on public.fk_shared_ingredient_nutrition for select to authenticated
using (
    exists (select 1 from public.fk_meal_access access
        where access.user_id = (select auth.uid())
        and access.member in ('bebe', 'ariel'))
);

create policy "Insert verified shared nutrition for Bebe and Ariel"
on public.fk_shared_ingredient_nutrition for insert to authenticated
with check (
    revision = 1 and updated_by = (select auth.uid())
    and exists (select 1 from public.fk_meal_access access
        where access.user_id = (select auth.uid())
        and access.member in ('bebe', 'ariel'))
);

create policy "Update verified shared nutrition for Bebe and Ariel"
on public.fk_shared_ingredient_nutrition for update to authenticated
using (
    exists (select 1 from public.fk_meal_access access
        where access.user_id = (select auth.uid())
        and access.member in ('bebe', 'ariel'))
)
with check (
    updated_by = (select auth.uid())
    and exists (select 1 from public.fk_meal_access access
        where access.user_id = (select auth.uid())
        and access.member in ('bebe', 'ariel'))
);
