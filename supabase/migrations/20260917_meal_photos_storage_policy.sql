-- Family Kitchen 2.0: Supabase Storage meal-photos 儲存庫與 RLS 政策
--
-- 說明：
-- 允許家庭成員（無論是透過 FamilyAuthService 登入之 authenticated 使用者，
-- 或是使用免登入 PWA 之 anon 使用者）正常上傳與讀取食物照片。
-- 檔案大小限制 5MB，限制圖片格式 (jpeg, png, webp)。

-- 1. 確保 meal-photos 儲存庫存在並設定為公開 (Public)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meal-photos',
  'meal-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 2. 允許任何人公開檢視照片
drop policy if exists "meal_photos_public_select" on storage.objects;
create policy "meal_photos_public_select"
on storage.objects for select
to public
using (bucket_id = 'meal-photos');

-- 3. 允許家庭使用者（anon 與 authenticated）上傳照片
drop policy if exists "meal_photos_public_insert" on storage.objects;
create policy "meal_photos_public_insert"
on storage.objects for insert
to public
with check (bucket_id = 'meal-photos');

-- 4. 允許家庭使用者更新或覆寫自己的照片
drop policy if exists "meal_photos_public_update" on storage.objects;
create policy "meal_photos_public_update"
on storage.objects for update
to public
using (bucket_id = 'meal-photos');

-- 5. 允許家庭使用者刪除照片
drop policy if exists "meal_photos_public_delete" on storage.objects;
create policy "meal_photos_public_delete"
on storage.objects for delete
to public
using (bucket_id = 'meal-photos');
