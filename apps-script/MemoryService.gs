function generateDailyMemory(userId, date, config) {
  var logs = getActiveMealLogsByDate(userId, date, config);
  var bodyMetrics = getBodyMetricsByDate(userId, date, config);
  var bodyHistory = getRecentBodyMetrics(userId, 30, config);
  var summary = calculateDailySummary(userId, date, config);
  upsertDailySummary(summary, config);

  var markdown;

  if (logs.length === 0 && bodyMetrics.length === 0) {
    markdown = [
      '# Daily Memory｜' + date,
      '',
      '## 1. 事實紀錄',
      '',
      '- 今日沒有 active 餐點紀錄或身體數據。',
      '',
      '## 2. AI 觀察',
      '',
      '- 資料不足，暫不做推論。',
      '',
      '## 3. 使用者修正',
      '',
      '- 無。',
      '',
      '## 4. 不確定性',
      '',
      '- 無餐點資料可判斷。',
      '',
      '## 5. 後續追蹤',
      '',
      '- 繼續累積餐點照片與修正資料。'
    ].join('\n');
  } else {
    markdown = callGeminiForDailyMemory(logs, bodyMetrics, bodyHistory, summary, config);
  }

  var file = saveDailyMemoryMarkdown(markdown, userId, date, config);
  var now = nowIso(config);

  appendMemoryIndex({
    id: createUuid(),
    memory_type: 'daily',
    date: date,
    period_start: date,
    period_end: date,
    drive_file_id: file.fileId,
    drive_url: file.driveUrl,
    title: 'Daily Memory｜' + date,
    summary: logs.length + ' meals, ' + bodyMetrics.length + ' body metrics, ' + Math.round(summary.totalCalories) + ' kcal',
    tags: 'daily,calorie,body_metric',
    created_at: now,
    updated_at: now,
    source_logs_range: date
  }, config);

  return {
    file: file,
    markdown: markdown,
    summary: summary
  };
}

function generateWeeklyMemory(userId, referenceDate, config) {
  var weekRange = getWeekRange(referenceDate || todayDate(config), config);
  var logs = getActiveMealLogsByDateRange(userId, weekRange.startDate, weekRange.endDate, config);
  var bodyMetrics = getBodyMetricsByDateRange(userId, weekRange.startDate, weekRange.endDate, config);
  var bodyHistory = getRecentBodyMetrics(userId, 60, config);
  var dailySummaries = getDailySummariesByDateRange(userId, weekRange.startDate, weekRange.endDate, config);
  var trendSnapshot = buildTrendSnapshot(logs, bodyMetrics, bodyHistory, dailySummaries, weekRange, config);
  var markdown;

  if (logs.length === 0 && bodyMetrics.length === 0) {
    markdown = [
      '# Weekly Memory｜' + weekRange.startDate + ' - ' + weekRange.endDate,
      '',
      '## 1. 事實紀錄',
      '',
      '- 本週沒有 active 餐點紀錄或身體數據。',
      '',
      '## 2. 趨勢判斷',
      '',
      '- 資料不足，暫不判斷趨勢。',
      '',
      '## 3. 下週追蹤',
      '',
      '- 繼續累積餐點與身體數據。'
    ].join('\n');
  } else {
    markdown = callGeminiForWeeklyMemory({
      weekRange: weekRange,
      logs: logs,
      bodyMetrics: bodyMetrics,
      bodyHistory: bodyHistory,
      dailySummaries: dailySummaries,
      trendSnapshot: trendSnapshot
    }, config);
  }

  var file = saveWeeklyMemoryMarkdown(markdown, userId, weekRange.startDate, weekRange.endDate, config);
  var now = nowIso(config);

  appendMemoryIndex({
    id: createUuid(),
    memory_type: 'weekly',
    date: referenceDate || todayDate(config),
    period_start: weekRange.startDate,
    period_end: weekRange.endDate,
    drive_file_id: file.fileId,
    drive_url: file.driveUrl,
    title: 'Weekly Memory｜' + weekRange.startDate + ' - ' + weekRange.endDate,
    summary: logs.length + ' meals, ' + bodyMetrics.length + ' body metrics',
    tags: 'weekly,calorie,body_metric,trend',
    created_at: now,
    updated_at: now,
    source_logs_range: weekRange.startDate + '...' + weekRange.endDate
  }, config);

  return {
    file: file,
    markdown: markdown,
    trendSnapshot: trendSnapshot,
    weekRange: weekRange
  };
}

function generateInstantWeeklySummary(userId, referenceDate, config) {
  var weekRange = getWeekRange(referenceDate || todayDate(config), config);
  var logs = getActiveMealLogsByDateRange(userId, weekRange.startDate, weekRange.endDate, config);
  var dailySummaries = getDailySummariesByDateRange(userId, weekRange.startDate, weekRange.endDate, config);
  var trendSnapshot = buildTrendSnapshot(logs, [], [], dailySummaries, weekRange, config);
  var baseText = formatInstantWeeklySummaryBase(trendSnapshot, logs, weekRange);
  var adviceText = '';
  var usage = {
    inputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    success: false,
    error: ''
  };

  if (logs.length > 0) {
    try {
      var advice = callGeminiForInstantWeeklySummary({
        weekRange: weekRange,
        trendSnapshot: trendSnapshot,
        logs: logs,
        dailySummaries: dailySummaries
      }, config);
      adviceText = advice.text;
      usage.inputTokens = advice.inputTokens;
      usage.outputTokens = advice.outputTokens;
      usage.estimatedCostUsd = advice.estimatedCostUsd;
      usage.success = true;
    } catch (error) {
      usage.error = error.message || String(error);
      adviceText = formatInstantWeeklyFallbackAdvice(trendSnapshot);
    }
  } else {
    adviceText = '本週還沒有 active 餐點紀錄，暫時無法判斷飲食趨勢。';
    usage.success = true;
  }

  return {
    text: [baseText, '', '趨勢建議', adviceText].join('\n'),
    adviceText: adviceText,
    weekRange: weekRange,
    trendSnapshot: trendSnapshot,
    correctedCount: countCorrectedLogs(logs),
    lowConfidenceCount: countLowConfidenceLogs(logs),
    usage: usage
  };
}

function formatInstantWeeklySummaryBase(trend, logs, weekRange) {
  var lines = [
    '本週即時總結',
    weekRange.startDate + ' - ' + weekRange.endDate,
    '',
    '紀錄：' + (trend.meal_count || 0) + ' 餐 / ' + (trend.logged_days || 0) + ' 天',
    '總熱量：約 ' + (trend.total_calories || 0) + ' kcal',
    '平均熱量：約 ' + (trend.avg_calories_per_logged_day || 0) + ' kcal / 紀錄日',
    '平均蛋白質：約 ' + (trend.avg_protein_per_logged_day || 0) + ' g / 紀錄日',
    '總 P/C/F：約 ' + (trend.total_protein_g || 0) + ' / ' + (trend.total_carbs_g || 0) + ' / ' + (trend.total_fat_g || 0) + ' g'
  ];
  var correctedCount = countCorrectedLogs(logs);
  var lowConfidenceCount = countLowConfidenceLogs(logs);

  if (correctedCount || lowConfidenceCount) {
    lines.push('');
    lines.push('資料品質：修正 ' + correctedCount + ' 筆，低信心 ' + lowConfidenceCount + ' 筆');
  }

  return lines.join('\n');
}

function countCorrectedLogs(logs) {
  return (logs || []).filter(function (row) {
    return hasSheetValue(row.corrected_calories);
  }).length;
}

function countLowConfidenceLogs(logs) {
  return (logs || []).filter(function (row) {
    return String(row.confidence || '').toLowerCase() === 'low';
  }).length;
}

function formatInstantWeeklyFallbackAdvice(trend) {
  var lines = [];
  var avgCalories = trend.avg_calories_per_logged_day || 0;
  var avgProtein = trend.avg_protein_per_logged_day || 0;
  var loggedDays = trend.logged_days || 0;

  if (loggedDays < 4) {
    lines.push('紀錄天數偏少，趨勢先當參考。');
    lines.push('下週先固定拍午餐與晚餐。');
  } else {
    lines.push('本週紀錄量可做初步檢討。');
  }

  if (avgProtein < 100) {
    lines.push('每餐先補雞胸、蛋、魚或豆腐。');
  } else {
    lines.push('蛋白質有基礎，改控油脂與醬料。');
  }

  if (avgCalories > 2200) {
    lines.push('少炸物甜飲，便當少飯醬分開。');
  } else if (avgCalories < 1600 && loggedDays >= 3) {
    lines.push('熱量偏低時檢查飲料點心漏記。');
  } else {
    lines.push('用「改700 P30」修正低信心餐。');
  }

  return lines.slice(0, 3).join('\n');
}

function generateCorrectionLearningMemory(userId, referenceDate, config) {
  var endDate = referenceDate || todayDate(config);
  var startDate = addDaysToDateString(endDate, -29, config);
  var correctedLogs = getCorrectedMealLogsByDateRange(userId, startDate, endDate, config);
  var markdown;

  if (correctedLogs.length === 0) {
    markdown = [
      '# Correction Learning｜' + startDate + ' - ' + endDate,
      '',
      '## 1. 修正紀錄',
      '',
      '- 最近 30 天沒有使用者修正熱量紀錄。',
      '',
      '## 2. 建議',
      '',
      '- 暫不更新 FoodRules。'
    ].join('\n');
  } else {
    markdown = callGeminiForCorrectionLearning({
      startDate: startDate,
      endDate: endDate,
      correctedLogs: correctedLogs
    }, config);
  }

  var file = saveCorrectionLearningMarkdown(markdown, userId, endDate, config);
  var now = nowIso(config);

  appendMemoryIndex({
    id: createUuid(),
    memory_type: 'correction_learning',
    date: endDate,
    period_start: startDate,
    period_end: endDate,
    drive_file_id: file.fileId,
    drive_url: file.driveUrl,
    title: 'Correction Learning｜' + endDate,
    summary: correctedLogs.length + ' corrected meals',
    tags: 'correction_learning,food_rules',
    created_at: now,
    updated_at: now,
    source_logs_range: startDate + '...' + endDate
  }, config);

  return {
    file: file,
    markdown: markdown,
    correctedLogs: correctedLogs
  };
}

function buildTrendSnapshot(logs, bodyMetrics, bodyHistory, dailySummaries, weekRange, config) {
  var weekCalories = logs.reduce(function (sum, row) {
    return sum + getEffectiveMealCalories(row);
  }, 0);
  var weekProtein = logs.reduce(function (sum, row) {
    return sum + toNumber(row.protein_g, 0);
  }, 0);
  var weekCarbs = logs.reduce(function (sum, row) {
    return sum + toNumber(row.carbs_g, 0);
  }, 0);
  var weekFat = logs.reduce(function (sum, row) {
    return sum + toNumber(row.fat_g, 0);
  }, 0);
  var loggedDates = {};

  logs.forEach(function (row) {
    loggedDates[normalizeSheetDate(row.date, config)] = true;
  });

  return {
    week_start: weekRange.startDate,
    week_end: weekRange.endDate,
    logged_days: Object.keys(loggedDates).length,
    meal_count: logs.length,
    total_calories: Math.round(weekCalories),
    avg_calories_per_logged_day: Object.keys(loggedDates).length ? Math.round(weekCalories / Object.keys(loggedDates).length) : 0,
    total_protein_g: Math.round(weekProtein),
    avg_protein_per_logged_day: Object.keys(loggedDates).length ? Math.round(weekProtein / Object.keys(loggedDates).length) : 0,
    total_carbs_g: Math.round(weekCarbs),
    total_fat_g: Math.round(weekFat),
    body_this_week: summarizeBodyTrend(bodyMetrics, config),
    body_recent_history: summarizeBodyTrend(bodyHistory, config),
    daily_summaries: dailySummaries.map(function (row) {
      return {
        date: normalizeSheetDate(row.date, config),
        total_calories: row.total_calories,
        total_protein: row.total_protein,
        calorie_gap: row.calorie_gap,
        protein_gap: row.protein_gap,
        meal_count: row.meal_count
      };
    })
  };
}

function summarizeBodyTrend(rows, config) {
  var sorted = rows.slice().sort(function (a, b) {
    return String(a.timestamp || a.date).localeCompare(String(b.timestamp || b.date));
  });

  if (sorted.length === 0) {
    return {
      count: 0
    };
  }

  var first = sorted[0];
  var last = sorted[sorted.length - 1];

  return {
    count: sorted.length,
    first_date: normalizeSheetDate(first.date, config),
    last_date: normalizeSheetDate(last.date, config),
    first_weight_kg: first.weight_kg,
    last_weight_kg: last.weight_kg,
    weight_change_kg: diffNumber(last.weight_kg, first.weight_kg),
    first_body_fat_percent: first.body_fat_percent,
    last_body_fat_percent: last.body_fat_percent,
    body_fat_change_percent: diffNumber(last.body_fat_percent, first.body_fat_percent),
    first_muscle_mass_kg: first.muscle_mass_kg,
    last_muscle_mass_kg: last.muscle_mass_kg,
    muscle_change_kg: diffNumber(last.muscle_mass_kg, first.muscle_mass_kg)
  };
}

function diffNumber(current, previous) {
  var currentNumber = Number(current);
  var previousNumber = Number(previous);

  if (!isFinite(currentNumber) || !isFinite(previousNumber)) {
    return '';
  }

  return Math.round((currentNumber - previousNumber) * 10) / 10;
}

function getWeekRange(referenceDate, config) {
  var date = parseDateString(referenceDate);
  var day = date.getDay();
  var offsetToMonday = day === 0 ? -6 : 1 - day;
  var start = addDaysToDate(date, offsetToMonday);
  var end = addDaysToDate(start, 6);

  return {
    startDate: formatDateString(start, config),
    endDate: formatDateString(end, config)
  };
}

function addDaysToDateString(dateString, days, config) {
  return formatDateString(addDaysToDate(parseDateString(dateString), days), config);
}

function addDaysToDate(date, days) {
  var copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function parseDateString(dateString) {
  var parts = String(dateString).slice(0, 10).split('-');
  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

function formatDateString(date, config) {
  return Utilities.formatDate(date, config.timezone, 'yyyy-MM-dd');
}

function scheduledDailyMemoryJob() {
  var config = getConfig();
  ensureSheets(config);

  var date = todayDate(config);
  var userIds = getUserIdsWithActivityByDate(date, config);

  userIds.forEach(function (userId) {
    try {
      var memory = generateDailyMemory(userId, date, config);
      appendSystemEvent({
        timestamp: nowIso(config),
        user_id: userId,
        message_type: 'trigger',
        event_type: 'time_driven',
        action_taken: 'scheduled_daily_memory',
        success: true,
        error: '',
        raw_event: memory.file.driveUrl
      }, config);
    } catch (error) {
      appendSystemEvent({
        timestamp: nowIso(config),
        user_id: userId,
        message_type: 'trigger',
        event_type: 'time_driven',
        action_taken: 'scheduled_daily_memory',
        success: false,
        error: error.stack || error.message || String(error),
        raw_event: ''
      }, config);
    }
  });

  if (userIds.length === 0) {
    appendSystemEvent({
      timestamp: nowIso(config),
      user_id: '',
      message_type: 'trigger',
      event_type: 'time_driven',
      action_taken: 'scheduled_daily_memory_no_logs',
      success: true,
      error: '',
      raw_event: date
    }, config);
  }
}

function setupDailyMemoryTrigger() {
  var config = getConfig();
  var triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'scheduledDailyMemoryJob') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('scheduledDailyMemoryJob')
    .timeBased()
    .inTimezone(config.timezone)
    .atHour(23)
    .nearMinute(30)
    .everyDays(1)
    .create();

  return 'Daily memory trigger installed for 23:30 ' + config.timezone;
}

function scheduledWeeklyMemoryJob() {
  var config = getConfig();
  ensureSheets(config);

  var date = todayDate(config);
  var weekRange = getWeekRange(date, config);
  var userIds = getUserIdsWithActivityByDateRange(weekRange.startDate, weekRange.endDate, config);

  userIds.forEach(function (userId) {
    try {
      var memory = generateWeeklyMemory(userId, date, config);
      var pushError = '';

      try {
        pushToLine(userId, formatWeeklyMemoryPushMessage(memory), config);
      } catch (lineError) {
        pushError = lineError.stack || lineError.message || String(lineError);
      }

      appendSystemEvent({
        timestamp: nowIso(config),
        user_id: userId,
        message_type: 'trigger',
        event_type: 'time_driven',
        action_taken: 'scheduled_weekly_memory',
        success: !pushError,
        error: pushError,
        raw_event: memory.file.driveUrl
      }, config);
    } catch (error) {
      appendSystemEvent({
        timestamp: nowIso(config),
        user_id: userId,
        message_type: 'trigger',
        event_type: 'time_driven',
        action_taken: 'scheduled_weekly_memory',
        success: false,
        error: error.stack || error.message || String(error),
        raw_event: ''
      }, config);
    }
  });
}

function formatWeeklyMemoryPushMessage(memory) {
  var trend = memory.trendSnapshot || {};
  var lines = [
    '本週總結已產生',
    (memory.weekRange ? memory.weekRange.startDate + ' - ' + memory.weekRange.endDate : ''),
    '',
    '飲食：' + (trend.meal_count || 0) + ' 餐 / ' + (trend.logged_days || 0) + ' 天',
    '平均熱量：' + (trend.avg_calories_per_logged_day || 0) + ' kcal / 紀錄日',
    '平均蛋白質：' + (trend.avg_protein_per_logged_day || 0) + ' g / 紀錄日'
  ];

  var summary = extractMarkdownSummary(memory.markdown, 900);

  if (summary) {
    lines.push('');
    lines.push('摘要：');
    lines.push(summary);
  }

  lines.push('');
  lines.push('詳細 Markdown：');
  lines.push(memory.file.driveUrl);

  return lines.filter(function (line) {
    return line !== '';
  }).join('\n');
}

function extractMarkdownSummary(markdown, maxLength) {
  var text = String(markdown || '')
    .replace(/^# .+$/gm, '')
    .replace(/^##\s*\d*\.?\s*/gm, '')
    .replace(/^[-*]\s*/gm, '・')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) {
    return '';
  }

  return truncateText(text, maxLength || 900);
}

function setupWeeklyMemoryTrigger() {
  var config = getConfig();
  var triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'scheduledWeeklyMemoryJob') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('scheduledWeeklyMemoryJob')
    .timeBased()
    .inTimezone(config.timezone)
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(23)
    .nearMinute(45)
    .create();

  return 'Weekly memory trigger installed for Sunday 23:45 ' + config.timezone;
}
