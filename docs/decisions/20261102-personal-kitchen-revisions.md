# #16：Personal Kitchen 以伺服器 revision 保護整份狀態

日期：2026-11-02。狀態：候選方案，僅在本機隔離 Supabase 驗證；正式發布另需授權。

## 決策與資料邊界

保留 household／ariel 的資料列、membership、RLS 與原 localStorage keys。不搬移任何共用母庫、custom ingredients 或營養資料。新增 `sync_revision`（伺服器遞增）及 `sync_status`（legacy／initial／active／cleared）。既有列全部保留為 legacy；尤其不能從空白內容、舊 version 或 updated_at 推論過去是否清空。

REST PATCH 同時帶預期 revision filter 及 protocol 2／expected revision headers。資料庫 trigger 在列鎖內核對舊 revision，並負責遞增 revision／version、標記清空。即使省略 URL filter，也不能繞過 trigger；舊 PWA 的無條件 PATCH 回 409。仍用既有 RLS 判斷 scope 權限，不新增 SECURITY DEFINER 或信任 user_metadata。

本機在既有狀態增加 revision／syncStatus／dirty／scopeId。revision 必須屬於目前畫面已載入的內容，不能借用另一分頁後來寫入 localStorage 的 revision。dirty 草稿只能在基底 revision 相符時提交。GET／PATCH await 後仍驗證帳號、scope generation、請求序號與本機快照。I/O 或解析失敗會拋錯；只有缺少 key 才是首次初始化。先成功保留 backup、寫入 primary，才套用遠端內容到畫面。

## 衝突與空白

- 已確認的新版 cleared 狀態只可取代沒有未同步修改的乾淨裝置內容。若本機仍有 dirty 草稿，回報衝突、保留 primary 與遠端，不 PATCH、不以會被後續儲存覆寫的單一 backup 作唯一保護；後續編輯及重啟仍以原草稿為基礎。
- 不同 revision 的 dirty 草稿、無基底的歷史非空資料與非空遠端：拒絕自動覆寫，保留雙方。沒有自動欄位合併或靜默重送。
- 歷史空白 legacy 遇非空本機：拒絕猜測。空白本機可載入遠端並建立已確認基底。
- initial 只能由管理者確認「確實未使用且為空白」後標記；migration 不自動認證任何現有列。只有這種已證明的初始空白可接收無 revision 的本機遷移資料。
- PATCH 成功但回應遺失時，保留 dirty 草稿；重讀發現 revision 改變便回報衝突。相同內容也不假稱已確認同步成功。
- updatedAt 僅供顯示／追溯，不決定同步順序。備份 restore 是待確認草稿，不能越過 revision 保護直接恢復雲端。

## 正式升級順序與回退

1. 另行授權後，先備份正式兩列狀態與 schema，再套用 migration；不因標記 legacy 改寫內容。歷史衝突須按 scope 比對備份，另行明確決定來源，不能預先認定本機或遠端勝出。
2. 再發布新版前端。後端先升級的空窗，舊 PWA 讀取仍可用，但寫入被 409 拒絕。前端先升級而後端未升級時，欄位／版本檢查會停止同步，保留本機資料。
3. 沿 Engine → main → index 更新版本；Auth／同步服務仍用既定無版本 singleton URL。殘留舊同步模組會因缺 revision 或 409 停止，正式 PWA 刷新與 iPhone 實機驗收須另行安排，不能僅憑入口版本宣稱所有裝置更新完成。
4. 若需回退前端，保留後端 guard，讓舊客戶端維持禁止寫入。不能只 Git Revert migration 或移除 guard，否則舊 PWA 可再次覆蓋清空紀錄。資料回復須維護停寫、核對 scope 備份、以管理端受控寫入並遞增 revision，另外取得正式資料操作授權。

## 驗證入口

本機記憶體故障／亂序回歸：`node tests/test_personal_sync_integrity.mjs`。
真實整合：先建立獨立 project `fk16-fix-isolated-20261102`（API 55431／DB 55432），套用原 personal state migration 與本次 revision migration，再設定 `FK_EVIDENCE_DIR=/private/tmp/fk16-...` 執行 `node tests/test_personal_sync_supabase.mjs`。腳本拒絕其他 API origin、hosted project-ref，檢查 Auth／REST 指向同一隔離 DB；只建立 `example.invalid` 合成帳號，不寄信。測試會建立合成資源，完成後必須刪除本次帳號／測試狀態並停止該專用 project，不能使用 `supabase stop --all`。

獨立驗收需核對修復前重現、修復後結果、命令退出碼、DIFF 與資源清理證據。程式自查不取代 ChatGPT 獨立驗收，也不包含正式部署許可。
