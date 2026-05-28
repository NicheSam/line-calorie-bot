# Apps Script Script Properties 範例

到 Apps Script 專案設定中新增 Script Properties。

請填入你自己的值，不要把真實值提交到 Git。

```text
LINE_CHANNEL_SECRET=replace_with_your_line_channel_secret
LINE_CHANNEL_ACCESS_TOKEN=replace_with_your_line_channel_access_token
GEMINI_API_KEY=replace_with_your_gemini_api_key
GEMINI_MODEL=gemini-3.1-flash-lite
SHEET_ID=replace_with_your_google_sheet_id
DRIVE_ROOT_FOLDER_ID=replace_with_your_drive_folder_id
TIMEZONE=Asia/Taipei
DEFAULT_TARGET_CALORIES=2100
DEFAULT_PROTEIN_TARGET_G=130
```

注意：

- `SHEET_ID` 來自 Google Sheet URL：`/spreadsheets/d/{SHEET_ID}/edit`
- `DRIVE_ROOT_FOLDER_ID` 來自 Drive 資料夾 URL：`/folders/{DRIVE_ROOT_FOLDER_ID}`
- `GEMINI_MODEL` 需使用你的 Gemini API key 可呼叫的模型。

