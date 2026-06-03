# LINE Calorie Bot

個人用 LINE 熱量與身體紀錄 Bot。使用 Google Apps Script 作為 webhook，LINE 作為互動入口，Google Sheets 作為資料庫，Google Drive 保存圖片與長期記憶，Gemini 負責圖片判讀、自然語言理解與趨勢建議。

這個專案的重點不是做一個通用商業產品，而是整理一套「用 Codex 協作，自己部署、自己測試、自己迭代 UX」的個人健康追蹤工具。

## 建議閱讀路線

如果你只是想先了解這個 Bot 能做什麼，先看本 README。

如果你想自己部署，建議照這個順序讀：

1. [用 Codex 協作部署 LINE 熱量追蹤 Bot](docs/LINE_BOT_Codex_協作部署教學.md)
   - 從設定目標、建立帳號、貼 Apps Script、部署 webhook、除錯到 UX 迭代的完整流程。
2. [部署檢查表](docs/DEPLOY_CHECKLIST.md)
   - 部署時逐項確認 LINE、Apps Script、Google Sheets、Drive、Gemini、Rich Menu 是否完成。
3. [Script Properties 範例](examples/script-properties.example.md)
   - Apps Script 需要設定哪些環境值，以及哪些值不能提交到 GitHub。

這個 repo 不只是一包程式碼，也包含一份「如何跟 Codex 協作把個人 LINE Bot 做出來」的部署教學。

## 目前體驗

使用者主要透過 LINE Rich Menu 操作：

```text
今日｜記體重｜記飲食
本週總結｜API額度｜AI教練
```

也可以直接傳照片或輸入文字指令。

### 飲食紀錄

- 傳餐點照片：Gemini 估算熱量、蛋白質、碳水、脂肪。
- 傳營養標示照片：直接讀取營養標示表，不靠外觀猜測。
- 記錄成功後回覆 Flex 卡片，顯示本餐營養、今日進度與短提醒。
- 支援快速刪除上一筆：`不記錄`、`這筆不算`。
- 支援復原上一動作：`復原`、`undo`。

### 自然語言修正

可以用較口語的方式修正上一筆餐點：

```text
改700
改700 P30
改700 P30 C60
這餐應該 700 左右，蛋白質大概 30
碳水抓 60，脂肪不要動
```

流程是：

```text
本地規則能解析 → 直接修正
本地規則解析失敗，但像修正指令 → Gemini 轉成結構化修正
數值異常 → 先要求確認
```

### 今日狀態

輸入 `今日` 或點 Rich Menu 的 `今日`：

- 顯示今日熱量 / 目標熱量
- 顯示剩餘或超出熱量
- 顯示蛋白質 / 目標蛋白質
- 顯示碳水、脂肪與餐數

### 本週總結

手動輸入 `本週總結` 或點 Rich Menu 的 `本週總結` 時，會回覆一張即時 Flex 卡片：

- 本週日期區間
- 紀錄餐數 / 紀錄天數
- 平均熱量
- 平均蛋白質
- 修正筆數 / 低信心筆數
- 最多 3 條下週重點建議

這個功能是即時查詢，不會建立 Markdown，不會寫入 Drive，也不會寫入 MemoryIndex。

### 長期記憶

每日 / 每週自動記憶是獨立流程：

- `scheduledDailyMemoryJob()`：每天產生每日 Markdown 記憶。
- `scheduledWeeklyMemoryJob()`：每週產生週記憶 Markdown，並可推送摘要到 LINE。
- 手動 `本週總結` 不會影響自動週記憶。

### AI 教練

點 `AI教練` 時，會根據今日紀錄呼叫 Gemini，產生短建議。Gemini 忙碌或失敗時，會退回本地規則建議，不會讓按鈕整個壞掉。

### 身體紀錄

- 傳體重機 / InBody 照片：Gemini OCR 讀取身體數據。
- 文字輸入：`體重 75.3 體脂 18.3 骨骼肌 32.1`
- 記錄到 `BodyMetrics`，供每日 / 每週記憶參考。

### FoodRules 與校正

- `FoodRules` 保存常見食物的基準營養值。
- `NutritionGuardrails` 防止明顯不合理估算，例如蛋白質過低、茶葉蛋數值失真、甜點被錯誤套用主餐規則。
- `修正學習` 可整理近期使用者修正，產生 FoodRules 建議草案。

## Repo 結構

```text
line-calorie-bot/
├─ apps-script/
│  ├─ Code.gs
│  ├─ Config.gs
│  ├─ Utils.gs
│  ├─ CommandRouter.gs
│  ├─ LineService.gs
│  ├─ GeminiService.gs
│  ├─ SheetService.gs
│  ├─ DriveService.gs
│  ├─ MemoryService.gs
│  ├─ FlexMessageService.gs
│  ├─ RichMenuService.gs
│  ├─ FoodRulesSeed.gs
│  ├─ NutritionGuardrails.gs
│  └─ ChineseViewService.gs
├─ assets/
│  └─ rich-menu-v1-2500x1686-q90.jpg
├─ docs/
│  ├─ DEPLOY_CHECKLIST.md
│  └─ LINE_BOT_Codex_協作部署教學.md
├─ examples/
│  └─ script-properties.example.md
└─ README.md
```

## Google Sheets

主要資料表：

- `MealLogs`：飲食紀錄。
- `BodyMetrics`：體重機 / InBody / 身體數據。
- `FoodRules`：食物基準資料。
- `WebhookDebug`：webhook debug。
- `UserProfile`：個人目標設定。
- `SystemEvents`：系統事件與錯誤。
- `ApiUsage`：Gemini API 使用量與估算成本。
- `MemoryIndex`：長期記憶索引。
- `DailySummary`：每日彙總。
- `PendingActions`：異常修正等待確認。
- `UndoActions`：復原上一動作。

中文閱讀分頁：

- `飲食紀錄_中文`
- `身體紀錄_中文`
- `API使用紀錄_中文`
- `每日總結_中文`
- `欄位說明`

## 部署流程

1. 建立 LINE Official Account 與 Messaging API Channel。
2. 建立 Google Sheet。
3. 建立 Google Drive 主資料夾。
4. 取得 Gemini API key。
5. 建立 Google Apps Script 專案。
6. 將 `apps-script/` 內所有 `.gs` 檔案貼到 Apps Script。
7. 設定 Script Properties，參考 [examples/script-properties.example.md](examples/script-properties.example.md)。
8. 執行初始化函式：

```text
setupSheets()
setupChineseViews()
setupDailyMemoryTrigger()
setupWeeklyMemoryTrigger()
setupLineRichMenu()
```

9. 部署 Apps Script Web App。
10. 將 Web App `/exec` URL 填入 LINE Developers Webhook URL。
11. 啟用 LINE webhook。
12. 用 LINE 實測。

## Rich Menu

本 repo 已附一張可用的 Rich Menu 圖：

```text
assets/rich-menu-v1-2500x1686-q90.jpg
```

設定方式：

1. 將 JPG 上傳到 Google Drive。
2. 複製 Drive file ID。
3. 在 Apps Script Script Properties 設定：

```text
RICH_MENU_IMAGE_FILE_ID=你的圖片 file ID
```

4. 執行：

```text
setupLineRichMenu()
```

注意：LINE Rich Menu 圖片大小限制為 1 MB，所以使用 JPG，不使用原始 PNG。

## Script Properties

必要值請參考 [examples/script-properties.example.md](examples/script-properties.example.md)。

不要把真實值提交到 Git：

- `LINE_CHANNEL_SECRET`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `GEMINI_API_KEY`
- `SHEET_ID`
- `DRIVE_ROOT_FOLDER_ID`
- `RICH_MENU_IMAGE_FILE_ID`

## 部署後測試

建議依序測：

```text
今日
記飲食
記體重
API額度
AI教練
本週總結
```

再測實際資料流程：

```text
傳餐點照片
改700 P30
不記錄
復原
傳營養標示照片
體重 75.3 體脂 18.3 骨骼肌 32.1
```

## Git 與資料安全

`.gitignore` 已排除常見敏感與個人資料：

- `.env`
- `secrets/`
- `exports/`
- `data/`
- `photos/`
- `memory_md/`
- `*.xlsx`
- `*.csv`

請不要提交：

- API key
- LINE token
- Google Sheet 匯出資料
- 餐點照片
- 體重機 / InBody 照片
- 自動產生的記憶 Markdown

## Codex 協作方式

這個專案是以 Codex 協作方式逐步完成：

1. 先釐清使用者流程與系統流程。
2. 使用者建立 LINE / Google / Gemini 帳號與權限。
3. Codex 產生 Apps Script。
4. 使用者貼上 Apps Script 並實測。
5. 把錯誤截圖、LINE 回覆、Google Sheet 狀態交給 Codex 分析。
6. 依真實 UX 逐步改善功能。
7. 將穩定版本提交到 GitHub。

## 授權

尚未指定授權。公開或讓他人使用前，請自行決定是否加入 MIT、Apache-2.0 或保留所有權利。
