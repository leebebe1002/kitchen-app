import http.server
import socketserver
import json
import os
import ssl
import threading
import urllib.request
import re
import base64

PORT_HTTP = 8000
PORT_HTTPS = 8443
DIRECTORY = "."

def analyze_vision_image(image_base64_str, client_api_key=None):
    """使用 LLM Vision API (Gemini 1.5 / OpenAI GPT-4o) 圖片解析包裝營養標示，換算為每 100g 數據"""
    if not image_base64_str:
        return {"status": "error", "message": "未接收到圖片資料"}

    gemini_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY') or client_api_key
    openai_key = os.environ.get('OPENAI_API_KEY')

    config_path = os.path.join(DIRECTORY, 'src', 'data', 'config.json')
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
                if not gemini_key and cfg.get('gemini_api_key'):
                    gemini_key = cfg.get('gemini_api_key')
                if not openai_key and cfg.get('openai_api_key'):
                    openai_key = cfg.get('openai_api_key')
        except Exception:
            pass

    mime_type = "image/jpeg"
    clean_b64 = image_base64_str
    if "," in image_base64_str:
        header, clean_b64 = image_base64_str.split(",", 1)
        if "png" in header:
            mime_type = "image/png"
        elif "webp" in header:
            mime_type = "image/webp"

    prompt = (
        "你是一位極度嚴謹的專業營養師與食品標籤 OCR 辨識專家。\n"
        "請仔細閱讀這張食品包裝照片上的營養標示 (Nutrition Facts) 或成分標籤，提取『食品名稱』、『單份克數 (servingSize)』、以及『每份 (perServing)』與『每 100g (per100g)』的雙軌營養數據。\n\n"
        "【關鍵提取與換算指令 - 務必嚴格執行】：\n"
        "1. 請讀取『每一份量 (Serving Size)』為多少克或毫升 (例如 10g, 15mL, 1包)，記為 servingSize 與 servingUnit。\n"
        "2. 如果照片上有『每份 (Per Serving)』數值，請直接讀取填入 perServing。\n"
        "3. 如果照片上有『每 100g / 100mL』數值，請直接讀取填入 per100g。\n"
        "4. 如果照片上『只有每份』或『只有每 100g』，請自動按比例換算補齊另一欄的數據！\n"
        "5. category 請依據屬性選填：proteins (蛋白質), carbs (澱粉/主食), veggies (蔬菜水果), oils (油脂/抹醬), seasonings (醬油/調味粉) 之一。\n"
        "6. 請嚴格只輸出 JSON，不可加入 markdown ```json 標籤：\n"
        "{\n"
        "  \"name\": \"精準品名\",\n"
        "  \"category\": \"oils\",\n"
        "  \"servingSize\": 10,\n"
        "  \"servingUnit\": \"g\",\n"
        "  \"perServing\": {\n"
        "    \"kcal\": 68,\n"
        "    \"protein\": 0.1,\n"
        "    \"carbs\": 0.8,\n"
        "    \"fat\": 7.1,\n"
        "    \"sodium\": 55\n"
        "  },\n"
        "  \"per100g\": {\n"
        "    \"kcal\": 680,\n"
        "    \"protein\": 1,\n"
        "    \"carbs\": 8,\n"
        "    \"fat\": 71,\n"
        "    \"sodium\": 550\n"
        "  }\n"
        "}"
    )

    if gemini_key:
        if not gemini_key.startswith("AIza"):
            return {
                "status": "invalid_key",
                "message": f"Gemini API Key 格式不正確！您輸入的金鑰開頭為 '{gemini_key[:8]}...'，但真正的 Google Gemini API Key 一律是由 'AIzaSy...' 開頭。"
            }

        # 依序嘗試 model，若遇到 429 則自動指數退避重試
        models_to_try = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemma-4-31b-it"]
        last_error = ""

        for model_name in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": clean_b64
                            }
                        }
                    ]
                }]
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            
            # 每個模型最多重試 2 次 (含退避等待)
            for attempt in range(2):
                try:
                    with urllib.request.urlopen(req, timeout=18) as resp:
                        res_data = json.loads(resp.read().decode('utf-8'))
                        text_content = res_data['candidates'][0]['content']['parts'][0]['text'].strip()
                        if text_content.startswith("```"):
                            text_content = re.sub(r"^```[a-zA-Z]*\n?", "", text_content)
                            text_content = re.sub(r"\n?```$", "", text_content).strip()
                        parsed_json = json.loads(text_content)
                        return {"status": "success", "result": parsed_json}
                except urllib.error.HTTPError as http_err:
                    last_error = f"HTTP {http_err.code}: {http_err.reason}"
                    if http_err.code == 429:
                        import time
                        time.sleep(1.8 * (attempt + 1)) # 指數退避等待 1.8s, 3.6s
                        continue
                    else:
                        break
                except Exception as err:
                    last_error = str(err)
                    break

        if "429" in last_error or "RESOURCE_EXHAUSTED" in last_error:
            return {
                "status": "rate_limit_429",
                "message": "⚡️ 提示：Google 官方免費版 API 頻率暫時達到每分鐘上限 (HTTP 429)。請稍等 10 秒後點擊「重新辨識」即可！"
            }
        return {"status": "error", "message": f"Gemini API 呼叫失敗: {last_error}"}

    elif openai_key:
        url = "https://api.openai.com/v1/chat/completions"
        payload = {
            "model": "gpt-4o-mini",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{clean_b64}"}}
                ]
            }],
            "response_format": {"type": "json_object"}
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {openai_key}'
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                res_data = json.loads(resp.read().decode('utf-8'))
                text_content = res_data['choices'][0]['message']['content'].strip()
                parsed_json = json.loads(text_content)
                return {"status": "success", "result": parsed_json}
        except Exception as err:
            return {"status": "error", "message": f"OpenAI API 辨識失敗: {str(err)}"}

    else:
        return {
            "status": "need_api_key",
            "message": "請輸入 API Key 即可開啟即時 AI 圖片辨識！"
        }

def analyze_meal_image(image_base64_str, client_api_key=None):
    """使用 LLM Vision API (Gemini 1.5/2.0) 辨識外食/餐點照片，推算菜名與總營養素 (kcal, protein, carbs, fat, sodium)"""
    if not image_base64_str:
        return {"status": "error", "message": "未接收到圖片資料"}

    gemini_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY') or client_api_key
    openai_key = os.environ.get('OPENAI_API_KEY')

    config_path = os.path.join(DIRECTORY, 'src', 'data', 'config.json')
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
                if not gemini_key and cfg.get('gemini_api_key'):
                    gemini_key = cfg.get('gemini_api_key')
                if not openai_key and cfg.get('openai_api_key'):
                    openai_key = cfg.get('openai_api_key')
        except Exception:
            pass

    mime_type = "image/jpeg"
    clean_b64 = image_base64_str
    if "," in image_base64_str:
        header, clean_b64 = image_base64_str.split(",", 1)
        if "png" in header:
            mime_type = "image/png"
        elif "webp" in header:
            mime_type = "image/webp"

    prompt = (
        "你是一位極具洞察力的頂級營養師與 AI 視覺估算專家。\n"
        "請仔細辨識這張照片中的食物/餐點（若照片非食物，請推測可能的情境或如實說明）。\n"
        "請提取出『料理/餐點名稱 (dishName)』，並根據視覺份量精準估算全份餐點的『熱量 (kcal)』、『蛋白質 (protein, 克)』、『碳水化合物 (carbs, 克)』、『脂肪 (fat, 克)』與『鈉含量 (sodium, 毫克)』，並給出一句簡短親切的估算備註說明 (aiNote)。\n\n"
        "請嚴格只輸出合法 JSON，不可加入 markdown ```json 標籤：\n"
        "{\n"
        "  \"dishName\": \"精準料理品名 (如: 炙燒鮭魚丼 / 舒肥雞胸溫沙拉 / 燕麥拿鐵)\",\n"
        "  \"kcal\": 520,\n"
        "  \"protein\": 38,\n"
        "  \"carbs\": 45,\n"
        "  \"fat\": 16,\n"
        "  \"sodium\": 680,\n"
        "  \"aiNote\": \"十一粒 AI 視覺估算：含主菜蛋白質、主食與時蔬，數據可隨時點擊調整。\"\n"
        "}"
    )

    if gemini_key:
        models_to_try = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemma-4-31b-it"]
        last_error = ""

        for model_name in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
            payload = {
                "contents": [{
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": clean_b64
                            }
                        }
                    ]
                }]
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            
            for attempt in range(2):
                try:
                    with urllib.request.urlopen(req, timeout=18) as resp:
                        res_data = json.loads(resp.read().decode('utf-8'))
                        text_content = res_data['candidates'][0]['content']['parts'][0]['text'].strip()
                        if text_content.startswith("```"):
                            text_content = re.sub(r"^```[a-zA-Z]*\n?", "", text_content)
                            text_content = re.sub(r"\n?```$", "", text_content).strip()
                        parsed_json = json.loads(text_content)
                        return {"status": "success", "result": parsed_json}
                except urllib.error.HTTPError as http_err:
                    last_error = f"HTTP {http_err.code}: {http_err.reason}"
                    if http_err.code == 429:
                        import time
                        time.sleep(1.8 * (attempt + 1))
                        continue
                    else:
                        break
                except Exception as err:
                    last_error = str(err)
                    break

        return {"status": "error", "message": f"Gemini API 呼叫失敗: {last_error}"}

    elif openai_key:
        url = "https://api.openai.com/v1/chat/completions"
        payload = {
            "model": "gpt-4o-mini",
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{clean_b64}"}}
                ]
            }],
            "response_format": {"type": "json_object"}
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {openai_key}'
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                res_data = json.loads(resp.read().decode('utf-8'))
                text_content = res_data['choices'][0]['message']['content'].strip()
                parsed_json = json.loads(text_content)
                return {"status": "success", "result": parsed_json}
        except Exception as err:
            return {"status": "error", "message": f"OpenAI API 辨識失敗: {str(err)}"}
    else:
        return {"status": "need_api_key", "message": "未設定 API Key"}

def analyze_food_nlp(text_input, client_api_key=None):
    """使用 LLM (Gemini 1.5/2.0) 深度解析使用者輸入的自然語言語音/文字飲食紀錄，推算真實菜名、各項份量與總營養素"""
    if not text_input or not text_input.strip():
        return {"status": "error", "message": "未接收到文字內容"}

    gemini_key = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY') or client_api_key
    openai_key = os.environ.get('OPENAI_API_KEY')

    config_path = os.path.join(DIRECTORY, 'src', 'data', 'config.json')
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                cfg = json.load(f)
                if not gemini_key and cfg.get('gemini_api_key'):
                    gemini_key = cfg.get('gemini_api_key')
                if not openai_key and cfg.get('openai_api_key'):
                    openai_key = cfg.get('openai_api_key')
        except Exception:
            pass

    prompt = (
        "你是一位極具洞察力的頂級臨床營養師與台灣在地飲食估算專家。\n"
        f"使用者說了他吃/喝了什麼內容：『{text_input.strip()}』。\n\n"
        "【任務指引】：\n"
        "1. 請深入理解使用者描述的情境（包括多樣食物加總、客製要求如：飯半碗、去皮、無糖、No醬料/酸黃瓜、連鎖店指定品項如麥當勞、星巴克、超商便當、夜市小吃等）。\n"
        "2. 給出一個精準扼要的『總結料理名稱 (dishName)』。\n"
        "3. 精準推算全份攝取的『熱量 (kcal)』、『蛋白質 (protein, 克)』、『碳水化合物 (carbs, 克)』、『脂肪 (fat, 克)』與『鈉含量 (sodium, 毫克)』。\n"
        "4. 給出一句親切清晰的『AI 營養師估算說明 (aiNote)』，說明估算依據與拆解。\n"
        "5. 請嚴格只輸出合法 JSON，不可加入 markdown ```json 標籤：\n"
        "{\n"
        "  \"dishName\": \"精準品名總結 (如: 麥克雙牛堡 (客製) / 炸排骨便當半碗飯 / 燕麥拿鐵加雞肉三明治)\",\n"
        "  \"kcal\": 414,\n"
        "  \"protein\": 24.0,\n"
        "  \"carbs\": 31.0,\n"
        "  \"fat\": 22.0,\n"
        "  \"sodium\": 506.5,\n"
        "  \"aiNote\": \"十一粒 AI 語意精算：已為您精準拆解飲食內容與客製要求，數據可點擊手動微調。\"\n"
        "}"
    )

    if gemini_key:
        models_to_try = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3-flash-preview", "gemini-3.1-flash-lite-preview", "gemma-4-31b-it"]
        last_error = ""

        for model_name in models_to_try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_key}"
            payload = {
                "contents": [{
                    "parts": [{"text": prompt}]
                }]
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            
            for attempt in range(2):
                try:
                    with urllib.request.urlopen(req, timeout=18) as resp:
                        res_data = json.loads(resp.read().decode('utf-8'))
                        text_content = res_data['candidates'][0]['content']['parts'][0]['text'].strip()
                        if text_content.startswith("```"):
                            text_content = re.sub(r"^```[a-zA-Z]*\n?", "", text_content)
                            text_content = re.sub(r"\n?```$", "", text_content).strip()
                        parsed_json = json.loads(text_content)
                        return {"status": "success", "result": parsed_json}
                except urllib.error.HTTPError as http_err:
                    last_error = f"HTTP {http_err.code}: {http_err.reason}"
                    if http_err.code == 429:
                        import time
                        time.sleep(1.8 * (attempt + 1))
                        continue
                    else:
                        break
                except Exception as err:
                    last_error = str(err)
                    break

        return {"status": "error", "message": f"Gemini API 呼叫失敗: {last_error}"}

    elif openai_key:
        url = "https://api.openai.com/v1/chat/completions"
        payload = {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "response_format": {"type": "json_object"}
        }
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {openai_key}'
            }
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                res_data = json.loads(resp.read().decode('utf-8'))
                text_content = res_data['choices'][0]['message']['content'].strip()
                parsed_json = json.loads(text_content)
                return {"status": "success", "result": parsed_json}
        except Exception as err:
            return {"status": "error", "message": f"OpenAI API 辨識失敗: {str(err)}"}
    else:
        return {"status": "need_api_key", "message": "未設定 API Key"}

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Prevent caching for development
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        clean_path = self.path.split('?')[0]
        if clean_path == '/':
            self.path = '/web/index.html'
        elif clean_path.startswith('/api/data/'):
            filename = os.path.basename(clean_path)
            self.path = f'/src/data/{filename}'
        else:
            self.path = clean_path
        
        return super().do_GET()

    def do_POST(self):
        if self.path == '/api/analyze-nutrition-photo':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                req_json = json.loads(post_data.decode('utf-8'))
                img_data = req_json.get('image', '')
                user_key = req_json.get('apiKey', '')
                res = analyze_vision_image(img_data, user_key)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
        elif self.path == '/api/analyze-meal-photo':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                req_json = json.loads(post_data.decode('utf-8'))
                img_data = req_json.get('image', '')
                user_key = req_json.get('apiKey', '')
                res = analyze_meal_image(img_data, user_key)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
        elif self.path == '/api/analyze-food-nlp':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            try:
                req_json = json.loads(post_data.decode('utf-8'))
                text_data = req_json.get('text', '')
                user_key = req_json.get('apiKey', '')
                res = analyze_food_nlp(text_data, user_key)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(res, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
        elif self.path.startswith('/api/data/'):
            filename = os.path.basename(self.path)
            filepath = os.path.join(DIRECTORY, 'src', 'data', filename)
            
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                # Verify it's valid JSON
                data = json.loads(post_data.decode('utf-8'))
                
                # Write to file
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=4)
                    
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()

def run_http():
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT_HTTP), Handler) as httpd:
        print(f"🚀 Cell Kitchen HTTP 伺服器已啟動：http://0.0.0.0:{PORT_HTTP}")
        httpd.serve_forever()

def run_https():
    socketserver.TCPServer.allow_reuse_address = True
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(certfile="cert.pem", keyfile="key.pem")
    with socketserver.TCPServer(("", PORT_HTTPS), Handler) as httpsd:
        httpsd.socket = context.wrap_socket(httpsd.socket, server_side=True)
        print(f"🔒 Cell Kitchen HTTPS 伺服器已啟動：https://0.0.0.0:{PORT_HTTPS}")
        httpsd.serve_forever()

if __name__ == "__main__":
    has_ssl = os.path.exists("cert.pem") and os.path.exists("key.pem")
    if has_ssl:
        t_http = threading.Thread(target=run_http, daemon=True)
        t_http.start()
        run_https()
    else:
        run_http()
