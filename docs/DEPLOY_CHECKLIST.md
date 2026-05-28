# 部署檢查表

## 帳號與資源

- [ ] LINE Official Account 已建立。
- [ ] Messaging API Channel 已建立。
- [ ] `LINE_CHANNEL_SECRET` 已取得。
- [ ] `LINE_CHANNEL_ACCESS_TOKEN` 已取得。
- [ ] Google Sheet 已建立。
- [ ] Google Drive 主資料夾已建立。
- [ ] Gemini API key 已取得。

## Apps Script

- [ ] `apps-script/` 所有 `.gs` 檔案已貼到 Apps Script。
- [ ] Script Properties 已設定。
- [ ] Web App 執行身分設為「我」。
- [ ] Web App 存取權設為「所有人」。
- [ ] 已部署 Web App。
- [ ] LINE webhook URL 使用 `/exec`。

## 初始化

- [ ] 已執行 `setupSheets()`。
- [ ] 已執行 `setupChineseViews()`。
- [ ] 已執行 `setupDailyMemoryTrigger()`。
- [ ] 已執行 `setupWeeklyMemoryTrigger()`。

## LINE 測試

- [ ] 傳 `今日` 有回覆。
- [ ] 傳餐點照片有回覆，`MealLogs` 有資料。
- [ ] 傳營養標示照片有回覆，`MealLogs` 有資料。
- [ ] 傳體重機 / InBody 照片有回覆，`BodyMetrics` 有資料。
- [ ] 傳 `改成 850` 可修正上一筆餐點。
- [ ] 傳 `不記錄` 可刪除上一筆餐點與 Drive 圖片。
- [ ] 傳 `今日總結` 可產生 Drive Markdown。
- [ ] 傳 `本週總結` 可產生 Weekly Markdown。
- [ ] 傳 `修正學習` 可產生修正學習報告。

