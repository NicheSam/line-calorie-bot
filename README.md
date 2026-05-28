# LINE Calorie Bot

用 Google Apps Script、LINE Messaging API、Google Sheets、Google Drive 與 Gemini API 建立的個人飲食與身體紀錄 Bot。

這個專案的核心不是只提供程式碼，而是示範一套「使用者 + Codex 協作」的部署流程：使用者負責帳號、權限、真實測試與體驗判斷，Codex 協助規劃、寫程式、除錯、整理文件與迭代功能。

## 功能

- 傳餐點照片：估算熱量、蛋白質、碳水、脂肪。
- 傳營養標示照片：OCR 讀取營養標示並記錄。
- 傳體重機 / InBody 照片：OCR 讀取身體數據。
- 文字輸入身體數據：例如 `體重 72.5 體脂 18.3 骨骼肌 32.1`。
- `今日`：查詢今日飲食累計。
- `改成 850`：修正上一筆餐點熱量。
- `不記錄` / `不紀錄` / `取消上一筆` / `刪除上一筆`：刪除上一筆餐點紀錄與對應 Drive 圖片。
- `今日總結`：產生每日 Markdown 記憶。
- `本週總結` / `週總結`：產生週趨勢 Markdown。
- `修正學習`：整理使用者修正紀錄，產生 FoodRules 建議。
- 每日與每週排程記憶。
- 每週排程完成後可 push LINE 摘要。
- Google Sheets 中文閱讀分頁。

## Repo 結構

```text
line-calorie-bot/
├─ apps-script/
│  ├─ Code.gs
│  ├─ Config.gs
│  ├─ Utils.gs
│  ├─ SheetService.gs
│  ├─ LineService.gs
│  ├─ DriveService.gs
│  ├─ GeminiService.gs
│  ├─ MemoryService.gs
│  ├─ CommandRouter.gs
│  ├─ FoodRulesSeed.gs
│  ├─ ChineseViewService.gs
│  └─ NutritionGuardrails.gs
├─ docs/
│  └─ LINE_BOT_Codex_協作部署教學.md
├─ examples/
│  └─ script-properties.example.md
└─ .gitignore
```

## 不要提交到 Git 的資料

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `GEMINI_API_KEY`
- 真實 `SHEET_ID`
- 真實 `DRIVE_ROOT_FOLDER_ID`
- LINE user id
- Google Sheets 匯出的個人紀錄
- 餐點照片、身體照片、InBody 報告
- 產生的每日 / 每週記憶 Markdown

## 基本部署流程

1. 建立 LINE Official Account 與 Messaging API Channel。
2. 建立 Google Sheet 與 Google Drive 主資料夾。
3. 建立 Gemini API key。
4. 建立 Apps Script 專案。
5. 將 `apps-script/` 內的 `.gs` 檔案貼到 Apps Script。
6. 設定 Script Properties，參考 `examples/script-properties.example.md`。
7. 執行：
   - `setupSheets()`
   - `setupChineseViews()`
   - `setupDailyMemoryTrigger()`
   - `setupWeeklyMemoryTrigger()`
8. 部署 Apps Script Web App。
9. 將 `/exec` URL 設為 LINE webhook。
10. 用 LINE 實測。

完整教學請看：

[docs/LINE_BOT_Codex_協作部署教學.md](docs/LINE_BOT_Codex_協作部署教學.md)

## 使用 Codex 協作

建議流程：

1. 先描述目標，不急著寫程式。
2. 讓 Codex 拆使用者流程、系統流程、資料表與部署步驟。
3. 手動建立帳號、權限與 API key。
4. 讓 Codex 產生 Apps Script。
5. 真實測試 LINE Bot。
6. 把錯誤截圖、執行紀錄、Sheet 狀態丟回 Codex 除錯。
7. 從真實使用體驗迭代 UX 與功能。

## 授權

尚未指定授權。公開前請自行決定是否加入 MIT、Apache-2.0 或保留所有權利。

