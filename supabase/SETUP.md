# Family Kitchen Supabase 設定

這份設定只保護「庫存、採買、家用品」：

- `household`：Bebe 與 Jason 共用。
- `ariel`：樂樂獨立。

食材、料理等共用資料不在這裡搬動。

## 套用順序

1. 在 Supabase Dashboard 的 **SQL Editor** 執行 `migrations/20260906_personal_kitchen_state.sql`。
2. 在 **Authentication → URL Configuration** 將下列網址加入 Redirect URLs：

   `https://leebebe1002.github.io/kitchen-app/web/index.html`

3. 在三人首次登入前，以 Dashboard 的 SQL Editor 將 Email 加入白名單。請將尖括號內容換成真實 Email：

   ```sql
   insert into public.fk_scope_email_allowlist (email, scope_id) values
     ('<bebe-email>', 'household'),
     ('<jason-email>', 'household'),
     ('<ariel-email>', 'ariel')
   on conflict (email) do update set scope_id = excluded.scope_id;
   ```

4. 再用三人的 FK 裝置各自按右上角人像，輸入 Email，從信箱的登入連結回到 FK。

## 現有資料遷移

第一次以 Bebe 或 Jason 的已核准帳號登入時，FK 會把目前本機的庫存、採買與家用品安全寫入空白的 `household` 空間。樂樂的 `ariel` 空間保持空白。

請先確認目前線上版本的資料已在 Bebe 的裝置完整顯示，再進行首次登入。沒有登入或沒有白名單權限時，App 會繼續使用本機資料，不會清空任何內容。
