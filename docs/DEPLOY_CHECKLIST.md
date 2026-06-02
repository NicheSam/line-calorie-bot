# 部署檢查表

版本日期：2026-06-02

## 帳號與資源

- [ ] LINE Official Account 已建立。
- [ ] Messaging API Channel 已建立。
- [ ] `LINE_CHANNEL_SECRET` 已取得。
- [ ] `LINE_CHANNEL_ACCESS_TOKEN` 已取得。
- [ ] Google Sheet 已建立，並取得 `SHEET_ID`。
- [ ] Google Drive 主資料夾已建立，並取得 `DRIVE_ROOT_FOLDER_ID`。
- [ ] Gemini API key 已取得。
- [ ] Rich Menu 圖片已上傳到 Google Drive，並取得 `RICH_MENU_IMAGE_FILE_ID`。

## Apps Script

- [ ] `apps-script/` 所有 `.gs` 檔案已貼到 Apps Script。
- [ ] 所有檔案已儲存，Apps Script 沒有語法錯誤。
- [ ] Script Properties 已設定：
  - [ ] `LINE_CHANNEL_SECRET`
  - [ ] `LINE_CHANNEL_ACCESS_TOKEN`
  - [ ] `GEMINI_API_KEY`
  - [ ] `GEMINI_MODEL`
  - [ ] `SHEET_ID`
  - [ ] `DRIVE_ROOT_FOLDER_ID`
  - [ ] `RICH_MENU_IMAGE_FILE_ID`
  - [ ] `TIMEZONE`
  - [ ] `DEFAULT_TARGET_CALORIES`
  - [ ] `DEFAULT_PROTEIN_TARGET_G`
- [ ] Web App 執行身分設為「我」。
- [ ] Web App 存取權設為「所有人」。
- [ ] 已部署 Web App 新版本。
- [ ] LINE webhook URL 使用 `/exec`。
- [ ] LINE webhook 已啟用。

## 初始化

- [ ] 已執行 `setupSheets()`。
- [ ] 已執行 `setupChineseViews()`。
- [ ] 已執行 `setupDailyMemoryTrigger()`。
- [ ] 已執行 `setupWeeklyMemoryTrigger()`。
- [ ] 已執行 `setupLineRichMenu()`。

## Rich Menu 測試

- [ ] `今日`：回覆今日狀態。
- [ ] `記體重`：提示可傳體重機 / InBody 照片或文字數據。
- [ ] `記飲食`：提示可傳餐點照片或營養標示照片。
- [ ] `本週總結`：回覆即時週總結卡片，不產生 Drive Markdown。
- [ ] `API額度`：回覆 API 使用量與估算成本。
- [ ] `AI教練`：回覆今日飲食建議；Gemini 忙碌時可退回規則建議。

## LINE 功能測試

- [ ] 傳 `今日` 有回覆。
- [ ] 傳餐點照片有回覆，`MealLogs` 有資料。
- [ ] 傳營養標示照片有回覆，`MealLogs` 有資料。
- [ ] 傳體重機 / InBody 照片有回覆，`BodyMetrics` 有資料。
- [ ] 傳文字身體數據，例如 `體重 75.3 體脂 18.3 骨骼肌 32.1`，`BodyMetrics` 有資料。
- [ ] 傳 `改700` 可修正上一筆餐點熱量。
- [ ] 傳 `改700 P30 C60` 可同時修正熱量與營養素。
- [ ] 傳自然語言修正，例如 `這餐應該 700 左右，蛋白質大概 30`，可正確解析或要求確認。
- [ ] 傳異常修正時，Bot 會先警告並要求確認。
- [ ] 傳 `不記錄` 可刪除上一筆餐點。
- [ ] 傳 `復原` 或 `undo` 可復原上一個修正或刪除。
- [ ] 傳 `今日總結` 可產生今日 Markdown 記憶。
- [ ] 自動每日記憶排程可產生 Daily Markdown。
- [ ] 自動每週記憶排程可產生 Weekly Markdown，並可推送摘要。

## Google Sheets 檢查

- [ ] `MealLogs` 有飲食紀錄。
- [ ] `BodyMetrics` 有身體數據。
- [ ] `FoodRules` 有預設規則。
- [ ] `ApiUsage` 有 Gemini 呼叫紀錄。
- [ ] `SystemEvents` 沒有持續性的錯誤。
- [ ] `MemoryIndex` 有每日 / 每週自動記憶索引。
- [ ] 中文閱讀分頁可正常查看資料。

## 常見錯誤檢查

- [ ] LINE Verify 若顯示 `302 Found`，確認 webhook URL 是 Apps Script `/exec`，不是轉址後 URL。
- [ ] LINE Verify 若顯示 `405 Method Not Allowed`，確認已部署新版 Web App 並包含 `doPost(e)`。
- [ ] Bot 無回應時，先看 Apps Script 執行紀錄與 `SystemEvents`。
- [ ] Rich Menu 圖片上傳失敗 `413` 時，改用小於 1 MB 的 JPG。
- [ ] `DriveApp.getFileById` 失敗時，確認 Script Property 只填 file ID，且 Apps Script 帳號有權讀取。
- [ ] Gemini `503 / UNAVAILABLE` 通常是暫時高需求，稍後重試或使用 fallback。

