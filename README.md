# Family Kitchen 2.0 (`kitchen-app`)

專屬於 Bebe 家的個人 / 家庭智慧飲食與備料管家。支援多成員 Personal Kitchen Scope 隔離、食材重複保護、精準營養配平與雲端同步。

## 專案資訊

- **產品名稱**：Family Kitchen 2.0
- **Repository**：[leebebe1002/kitchen-app](https://github.com/leebebe1002/kitchen-app)
- **Production URL**：https://leebebe1002.github.io/kitchen-app/（自動轉導至 `web/index.html`）
- **Task & Issue SSOT**：[GitHub Issues](https://github.com/leebebe1002/kitchen-app/issues)
- **Tech Stack**：
  - 前端：Vanilla JavaScript (ES Modules), Vue.js 3 (Global Build), CSS3, HTML5 PWA
  - 後端 / 資料庫：Supabase (Auth, PostgreSQL DB, Storage for meal photos)
  - 本地服務：Python 3 HTTP/HTTPS Dev Server (`server.py`)

## 本機開發

```bash
# 啟動本地開發伺服器（預設 HTTP: 8000, HTTPS: 8443）
python3 server.py
```
啟動後以瀏覽器開啟 `http://localhost:8000/web/index.html`。

### Local HTTPS 說明
- 本地 HTTPS 伺服器啟動時會檢測本機目錄下的 `cert.pem` 與 `key.pem`。
- 這兩個檔案僅供 localhost 開發自簽使用，屬於 **local-only**，由 `.gitignore` 排除，**絕不納入 Git 版本控制**。
- 若在新環境中缺少這兩份檔案，可於專案根目錄執行以下 OpenSSL 指令重新建立：
  ```bash
  openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost"
  ```
- 若無憑證檔案，`server.py` 會自動降級為純 HTTP 服務（`http://localhost:8000`）。

### Local Supabase Secret 說明
- 一般靜態頁面、UI 調整或讀取既有資料庫紀錄**不需要** Supabase Secret key（前端使用內建之公開 `publishableKey`）。
- 僅在本地需要測試透過 `server.py` 代理上傳餐點照片至 Supabase Storage 的特權功能時，才需要提供：
  ```bash
  export SUPABASE_SECRET_KEY="<your-local-secret>"
  ```
- **安全守則**：
  - Secret 必須透過環境變數提供，**嚴禁寫入任何專案檔案或程式碼中**。
  - `.env` 與 `.env.*` 已由 `.gitignore` 全域排除。
  - 未設定環境變數時，`server.py` 會正常運行，僅代理端點安全返回 503 提示，不影響其餘本地開發。

## 驗證方式

```bash
# 1. Python 語法驗證
python3 -m py_compile server.py update_ingredients.py

# 2. JavaScript 模組語法檢驗
find web/src -name "*.js" -exec node -c {} +

# 3. 靜態資料結構 (JSON) 完整性檢查
python3 -c "import glob, json; [json.load(open(f, encoding='utf-8')) for f in glob.glob('src/data/*.json') + glob.glob('web/*.json')]"
```

## 目錄結構

```
kitchen-app/
├── README.md               # 專案概覽與開發入口（本檔）
├── AGENTS.md               # AI Agent 協作規則與邊界規範 (SSOT)
├── server.py               # 本地開發伺服器與代理
├── web/                    # 前端 Web / PWA 應用程式原始碼
│   ├── index.html          # PWA 主頁面入口
│   ├── src/                # 前端核心模組 (engine, services, views, components)
│   └── style.css           # 應用樣式表
├── src/data/               # 官方母庫食材、料理與基準設定資料
├── supabase/               # Supabase 設定文件與資料庫遷移腳本
└── docs/                   # 產品規格與歷史文件
    ├── PRD.md              # 產品需求規格書
    ├── DATA_SCHEMA.md      # 資料庫結構與儲存架構定義
    ├── DESIGN_SYSTEM.md    # UI/UX 設計規範
    └── archive/            # 歷史文件歸檔 (progress.md, ROADMAP.md, batches/)
```

## 文件導航

- **AI 協作規則**：[AGENTS.md](AGENTS.md)
- **產品需求規格書**：[docs/PRD.md](docs/PRD.md)
- **資料儲存結構**：[docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md)
- **設計系統**：[docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)
- **Supabase 設定**：[supabase/SETUP.md](supabase/SETUP.md)
- **歷史任務歸檔**：[docs/archive/](docs/archive/)
