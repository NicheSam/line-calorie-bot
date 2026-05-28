function setupChineseViews() {
  var config = getConfig();
  ensureSheets(config);
  setupFieldDictionaryView(config);
  setupMealLogsChineseView(config);
  setupBodyMetricsChineseView(config);
  setupApiUsageChineseView(config);
  setupDailySummaryChineseView(config);
  return 'Chinese views initialized';
}

function setupFieldDictionaryView(config) {
  var sheet = recreateSheet('欄位說明', config);
  var rows = [
    ['資料表', '英文欄位', '中文名稱', '說明'],
    ['MealLogs', 'timestamp', '時間', '紀錄建立時間'],
    ['MealLogs', 'date', '日期', '紀錄日期'],
    ['MealLogs', 'meal_name', '餐點名稱', 'AI 辨識或營養標示產品名稱'],
    ['MealLogs', 'ai_calories', 'AI 熱量', 'AI 或營養標示讀出的熱量'],
    ['MealLogs', 'corrected_calories', '修正熱量', '使用者用「改成」修正後的熱量'],
    ['MealLogs', 'protein_g', '蛋白質', '蛋白質克數'],
    ['MealLogs', 'carbs_g', '碳水', '碳水克數'],
    ['MealLogs', 'fat_g', '脂肪', '脂肪克數'],
    ['MealLogs', 'confidence', '信心', 'AI 判斷信心 high / medium / low'],
    ['MealLogs', 'uncertainty', '不確定因素', '份量、油量、標示基準等不確定處'],
    ['MealLogs', 'status', '狀態', 'active 會計入統計，cancelled 不計入'],
    ['BodyMetrics', 'weight_kg', '體重', '公斤'],
    ['BodyMetrics', 'body_fat_percent', '體脂率', '百分比'],
    ['BodyMetrics', 'muscle_mass_kg', '骨骼肌 / 肌肉量', '公斤，依來源報告欄位而定'],
    ['BodyMetrics', 'bmi', 'BMI', '身體質量指數'],
    ['BodyMetrics', 'visceral_fat', '內臟脂肪', '體脂計或 InBody 顯示數值'],
    ['BodyMetrics', 'basal_metabolic_rate_kcal', '基礎代謝', '每日基礎代謝 kcal'],
    ['ApiUsage', 'task_type', '任務類型', '這次 Gemini 呼叫的用途'],
    ['ApiUsage', 'input_tokens', '輸入 token', '傳給模型的文字與圖片 token 估計'],
    ['ApiUsage', 'output_tokens', '輸出 token', '模型回覆 token 數'],
    ['ApiUsage', 'estimated_cost_usd', '估計成本 USD', '依目前程式內估算單價計算，僅供參考'],
    ['ApiUsage', 'success', '是否成功', 'TRUE 成功，FALSE 失敗'],
    ['ApiUsage', 'error', '錯誤訊息', '失敗時的錯誤內容']
  ];
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  formatChineseViewSheet(sheet, rows[0].length);
}

function setupMealLogsChineseView(config) {
  var sheet = recreateSheet('飲食紀錄_中文', config);
  var headers = [
    '日期',
    '時間',
    '餐點',
    'AI熱量',
    '修正熱量',
    '採用熱量',
    '蛋白質(g)',
    '碳水(g)',
    '脂肪(g)',
    '信心',
    '不確定因素',
    '狀態',
    '照片連結'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1).setFormula(
    '=ARRAYFORMULA(IF(MealLogs!A2:A="",,{' +
      'MealLogs!C2:C,' +
      'MealLogs!B2:B,' +
      'MealLogs!H2:H,' +
      'MealLogs!I2:I,' +
      'MealLogs!J2:J,' +
      'IF(MealLogs!J2:J<>"",MealLogs!J2:J,MealLogs!I2:I),' +
      'MealLogs!K2:K,' +
      'MealLogs!L2:L,' +
      'MealLogs!M2:M,' +
      'MealLogs!N2:N,' +
      'MealLogs!O2:O,' +
      'MealLogs!S2:S,' +
      'MealLogs!G2:G' +
    '}))'
  );
  formatChineseViewSheet(sheet, headers.length);
}

function setupBodyMetricsChineseView(config) {
  var sheet = recreateSheet('身體紀錄_中文', config);
  var headers = [
    '日期',
    '時間',
    '來源',
    '體重(kg)',
    '體脂率(%)',
    '骨骼肌/肌肉量(kg)',
    'BMI',
    '內臟脂肪',
    '基礎代謝(kcal)',
    '身體年齡',
    '水分率(%)',
    '骨量(kg)',
    'InBody分數',
    '信心',
    '不確定因素',
    '照片連結'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1).setFormula(
    '=ARRAYFORMULA(IF(BodyMetrics!A2:A="",,{' +
      'BodyMetrics!C2:C,' +
      'BodyMetrics!B2:B,' +
      'BodyMetrics!E2:E,' +
      'BodyMetrics!I2:I,' +
      'BodyMetrics!J2:J,' +
      'BodyMetrics!K2:K,' +
      'BodyMetrics!L2:L,' +
      'BodyMetrics!M2:M,' +
      'BodyMetrics!N2:N,' +
      'BodyMetrics!O2:O,' +
      'BodyMetrics!P2:P,' +
      'BodyMetrics!Q2:Q,' +
      'BodyMetrics!R2:R,' +
      'BodyMetrics!S2:S,' +
      'BodyMetrics!T2:T,' +
      'BodyMetrics!H2:H' +
    '}))'
  );
  formatChineseViewSheet(sheet, headers.length);
}

function setupApiUsageChineseView(config) {
  var sheet = recreateSheet('API使用紀錄_中文', config);
  var headers = [
    '時間',
    '模型',
    '任務類型',
    '任務說明',
    '輸入token',
    '輸出token',
    '總token',
    '估計成本USD',
    '估計成本TWD',
    'LINE訊息ID',
    '是否成功',
    '錯誤訊息'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1).setFormula(
    '=ARRAYFORMULA(IF(ApiUsage!A2:A="",,{' +
      'ApiUsage!A2:A,' +
      'ApiUsage!B2:B,' +
      'ApiUsage!C2:C,' +
      'SWITCH(ApiUsage!C2:C,' +
        '"estimate_meal","餐點照片估算",' +
        '"classify_food_image","圖片類型判斷",' +
        '"parse_nutrition_label","營養標示讀取",' +
        '"parse_body_metric","身體數據讀取",' +
        '"daily_memory","每日記憶生成",' +
        'ApiUsage!C2:C),' +
      'ApiUsage!D2:D,' +
      'ApiUsage!E2:E,' +
      'ApiUsage!D2:D+ApiUsage!E2:E,' +
      'ApiUsage!F2:F,' +
      'ApiUsage!F2:F*32,' +
      'ApiUsage!G2:G,' +
      'ApiUsage!H2:H,' +
      'ApiUsage!I2:I' +
    '}))'
  );
  setupApiUsageSummary(sheet);
  formatChineseViewSheet(sheet, headers.length);
}

function setupApiUsageSummary(sheet) {
  sheet.getRange('N1:P1').setValues([['統計項目', '數值', '說明']]);
  sheet.getRange('N2:P6').setValues([
    ['總呼叫次數', '=COUNTA(A2:A)', 'ApiUsage 總筆數'],
    ['成功次數', '=COUNTIF(K2:K,"TRUE")', '成功的 API 呼叫'],
    ['失敗次數', '=COUNTIF(K2:K,"FALSE")', '失敗的 API 呼叫'],
    ['總估計成本USD', '=SUM(H2:H)', '程式估算，僅供參考'],
    ['總估計成本TWD', '=SUM(I2:I)', '暫用 1 USD = 32 TWD']
  ]);
  sheet.getRange('N1:P1').setFontWeight('bold').setBackground('#d9ead3');
}

function setupDailySummaryChineseView(config) {
  var sheet = recreateSheet('每日總結_中文', config);
  var headers = [
    '日期',
    '使用者ID',
    '總熱量',
    '總蛋白質',
    '總碳水',
    '總脂肪',
    '餐數',
    '目標熱量',
    '蛋白質目標',
    '熱量差距',
    '蛋白質差距'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(2, 1).setFormula(
    '=ARRAYFORMULA(IF(DailySummary!A2:A="",,DailySummary!A2:K))'
  );
  formatChineseViewSheet(sheet, headers.length);
}

function recreateSheet(sheetName, config) {
  var spreadsheet = getSpreadsheet(config);
  var existing = spreadsheet.getSheetByName(sheetName);

  if (existing) {
    existing.clear();
    return existing;
  }

  return spreadsheet.insertSheet(sheetName);
}

function formatChineseViewSheet(sheet, columnCount) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, columnCount)
    .setFontWeight('bold')
    .setBackground('#cfe2f3');
  sheet.autoResizeColumns(1, columnCount);
}
