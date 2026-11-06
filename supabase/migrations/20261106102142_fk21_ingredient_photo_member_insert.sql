-- FK #21: permit logged-in members to upload NEW ingredient photos only.
-- Approved and applied on 2026-11-06 to project zfgdneacuzwyfibpuupq.
-- Recorded in remote migration history as version 20261106102142.
--
-- Current client writes:
--   meal-photos/ingredients/<scope>_<YYYYMMDD>_<Date.now()>.jpg|png
--
-- The bucket already exists, is public for reading, and restricts size/MIME.
-- This policy does NOT grant anonymous uploads, list, overwrite, update or delete.
-- It only permits INSERT to the authenticated user's registered kitchen scope.
-- ROLLBACK (permission only; never deletes photos):
--   drop policy if exists "fk_ingredient_photo_member_insert" on storage.objects;

create policy "fk_ingredient_photo_member_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'meal-photos'
    and (storage.foldername(name))[1] = 'ingredients'
    and storage.filename(name) ~ '^(household|ariel)_[0-9]{8}_[0-9]{13}\.(jpg|png)$'
    and exists (
      select 1
      from public.fk_scope_members member
      where member.user_id = (select auth.uid())
        and member.scope_id = split_part(storage.filename(name), '_', 1)
    )
  );
