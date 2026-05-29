var SHEET_SCHEMAS = {
  MealLogs: [
    'id',
    'timestamp',
    'date',
    'user_id',
    'line_message_id',
    'drive_file_id',
    'drive_url',
    'meal_name',
    'ai_calories',
    'corrected_calories',
    'protein_g',
    'carbs_g',
    'fat_g',
    'confidence',
    'uncertainty',
    'user_note',
    'model_used',
    'raw_json',
    'status'
  ],
  UserProfile: [
    'user_id',
    'timezone',
    'goal',
    'target_calories',
    'protein_target_g',
    'estimated_tdee',
    'accuracy_mode',
    'created_at',
    'updated_at'
  ],
  FoodRules: [
    'food_keyword',
    'portion_unit',
    'calories_per_unit',
    'protein_per_unit',
    'carbs_per_unit',
    'fat_per_unit',
    'note',
    'enabled',
    'updated_at'
  ],
  BodyMetrics: [
    'id',
    'timestamp',
    'date',
    'user_id',
    'source_type',
    'line_message_id',
    'drive_file_id',
    'drive_url',
    'weight_kg',
    'body_fat_percent',
    'muscle_mass_kg',
    'bmi',
    'visceral_fat',
    'basal_metabolic_rate_kcal',
    'body_age',
    'water_percent',
    'bone_mass_kg',
    'inbody_score',
    'confidence',
    'uncertainty',
    'user_note',
    'model_used',
    'raw_json',
    'status'
  ],
  SystemEvents: [
    'timestamp',
    'user_id',
    'message_type',
    'event_type',
    'action_taken',
    'success',
    'error',
    'raw_event'
  ],
  ApiUsage: [
    'timestamp',
    'model',
    'task_type',
    'input_tokens',
    'output_tokens',
    'estimated_cost_usd',
    'line_message_id',
    'success',
    'error'
  ],
  MemoryIndex: [
    'id',
    'memory_type',
    'date',
    'period_start',
    'period_end',
    'drive_file_id',
    'drive_url',
    'title',
    'summary',
    'tags',
    'created_at',
    'updated_at',
    'source_logs_range'
  ],
  DailySummary: [
    'date',
    'user_id',
    'total_calories',
    'total_protein',
    'total_carbs',
    'total_fat',
    'meal_count',
    'target_calories',
    'protein_target',
    'calorie_gap',
    'protein_gap'
  ],
  WebhookDebug: [
    'timestamp',
    'stage',
    'raw_body',
    'error'
  ]
};

function getSpreadsheet(config) {
  return SpreadsheetApp.openById(config.sheetId);
}

function getSheetByName(sheetName, config) {
  var spreadsheet = getSpreadsheet(config);
  var sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  return sheet;
}

function ensureSheets(config) {
  Object.keys(SHEET_SCHEMAS).forEach(function (sheetName) {
    var sheet = getSheetByName(sheetName, config);
    var expected = SHEET_SCHEMAS[sheetName];
    var current = sheet.getRange(1, 1, 1, expected.length).getValues()[0];

    if (current.join('\u0000') !== expected.join('\u0000')) {
      sheet.getRange(1, 1, 1, expected.length).setValues([expected]);
    }
  });
}

function appendRowObject(sheetName, record, config) {
  var sheet = getSheetByName(sheetName, config);
  var headers = SHEET_SCHEMAS[sheetName];
  var row = headers.map(function (header) {
    return record[header] === undefined || record[header] === null ? '' : record[header];
  });
  sheet.appendRow(row);
  SpreadsheetApp.flush();
}

function appendMealLog(record, config) {
  appendRowObject('MealLogs', record, config);
}

function appendBodyMetric(record, config) {
  appendRowObject('BodyMetrics', record, config);
}

function appendSystemEvent(record, config) {
  appendRowObject('SystemEvents', {
    timestamp: record.timestamp || nowIso(config),
    user_id: record.user_id || '',
    message_type: record.message_type || '',
    event_type: record.event_type || '',
    action_taken: record.action_taken || '',
    success: record.success ? 'TRUE' : 'FALSE',
    error: record.error || '',
    raw_event: record.raw_event || ''
  }, config);
}

function appendApiUsage(record, config) {
  appendRowObject('ApiUsage', {
    timestamp: record.timestamp || nowIso(config),
    model: record.model || '',
    task_type: record.task_type || '',
    input_tokens: record.input_tokens || 0,
    output_tokens: record.output_tokens || 0,
    estimated_cost_usd: record.estimated_cost_usd || 0,
    line_message_id: record.line_message_id || '',
    success: record.success ? 'TRUE' : 'FALSE',
    error: record.error || ''
  }, config);
}

function appendMemoryIndex(record, config) {
  appendRowObject('MemoryIndex', record, config);
}

function appendWebhookDebug(record, config) {
  appendRowObject('WebhookDebug', {
    timestamp: record.timestamp || nowIso(config),
    stage: record.stage || '',
    raw_body: record.raw_body || '',
    error: record.error || ''
  }, config);
}

function readSheetRows(sheetName, config) {
  var sheet = getSheetByName(sheetName, config);
  var values = sheet.getDataRange().getValues();

  if (values.length <= 1) {
    return [];
  }

  var headers = values[0];

  return values.slice(1).map(function (row, rowIndex) {
    var record = { _rowNumber: rowIndex + 2 };
    headers.forEach(function (header, columnIndex) {
      record[header] = row[columnIndex];
    });
    return record;
  });
}

function findLatestActiveMealLog(userId, config) {
  var rows = readSheetRows('MealLogs', config);

  for (var index = rows.length - 1; index >= 0; index -= 1) {
    if (String(rows[index].user_id) === String(userId) && isActiveStatus(rows[index].status)) {
      return rows[index];
    }
  }

  return null;
}

function updateLastMealCalories(userId, calories, note, config) {
  return updateLastMealNutrition(userId, {
    calories: calories
  }, note, config);
}

function updateLastMealNutrition(userId, correction, note, config) {
  var row = findLatestActiveMealLog(userId, config);

  if (!row) {
    return null;
  }

  var nutrition = deriveCorrectedNutrition(row, correction || {});
  var sheet = getSheetByName('MealLogs', config);
  sheet.getRange(row._rowNumber, 10).setValue(nutrition.calories);
  sheet.getRange(row._rowNumber, 11).setValue(nutrition.protein);
  sheet.getRange(row._rowNumber, 12).setValue(nutrition.carbs);
  sheet.getRange(row._rowNumber, 13).setValue(nutrition.fat);
  sheet.getRange(row._rowNumber, 16).setValue(note);
  row.corrected_calories = nutrition.calories;
  row.protein_g = nutrition.protein;
  row.carbs_g = nutrition.carbs;
  row.fat_g = nutrition.fat;
  row.user_note = note;
  row._beforeNutrition = nutrition.before;
  row._afterNutrition = {
    calories: nutrition.calories,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat
  };
  row._correctionMeta = nutrition.meta;
  return row;
}

function deriveCorrectedNutrition(row, correction) {
  var before = {
    calories: getEffectiveMealCalories(row),
    protein: toNumber(row.protein_g, 0),
    carbs: toNumber(row.carbs_g, 0),
    fat: toNumber(row.fat_g, 0)
  };
  var hasCalories = hasSheetValue(correction.calories);
  var hasProtein = hasSheetValue(correction.protein);
  var hasCarbs = hasSheetValue(correction.carbs);
  var hasFat = hasSheetValue(correction.fat);
  var protein = hasProtein ? Number(correction.protein) : before.protein;
  var carbs = hasCarbs ? Number(correction.carbs) : before.carbs;
  var fat = hasFat ? Number(correction.fat) : before.fat;
  var calories = hasCalories ? Number(correction.calories) : null;
  var meta = [];

  if (hasCalories && !hasProtein && !hasCarbs && !hasFat) {
    var currentMacroCalories = macroCalories(before.protein, before.carbs, before.fat);

    if (currentMacroCalories > 0) {
      var scale = calories / currentMacroCalories;
      protein = before.protein * scale;
      carbs = before.carbs * scale;
      fat = before.fat * scale;
      meta.push('熱量修正，三大營養素依原比例同步調整');
    }
  } else if (hasCalories) {
    var fixedEnergy = (hasProtein ? protein * 4 : 0) +
      (hasCarbs ? carbs * 4 : 0) +
      (hasFat ? fat * 9 : 0);
    var remainingEnergy = calories - fixedEnergy;
    var originalRemainingEnergy = (hasProtein ? 0 : before.protein * 4) +
      (hasCarbs ? 0 : before.carbs * 4) +
      (hasFat ? 0 : before.fat * 9);

    if (remainingEnergy > 0 && originalRemainingEnergy > 0) {
      var remainingScale = remainingEnergy / originalRemainingEnergy;

      if (!hasProtein) {
        protein = before.protein * remainingScale;
      }

      if (!hasCarbs) {
        carbs = before.carbs * remainingScale;
      }

      if (!hasFat) {
        fat = before.fat * remainingScale;
      }

      meta.push('指定熱量與部分營養素，其餘營養素依原比例配合熱量調整');
    } else if (remainingEnergy < 0) {
      calories = macroCalories(protein, carbs, fat);
      meta.push('指定營養素換算熱量已高於指定熱量，改以營養素換算熱量為準');
    }
  } else if (hasProtein || hasCarbs || hasFat) {
    calories = macroCalories(protein, carbs, fat);
    meta.push('指定營養素後，熱量依 4/4/9 公式重新計算');
  } else {
    calories = before.calories;
  }

  return {
    calories: roundNonNegative(calories),
    protein: roundNonNegative(protein),
    carbs: roundNonNegative(carbs),
    fat: roundNonNegative(fat),
    before: before,
    meta: meta
  };
}

function macroCalories(protein, carbs, fat) {
  return toNumber(protein, 0) * 4 + toNumber(carbs, 0) * 4 + toNumber(fat, 0) * 9;
}

function cancelLastMealLog(userId, note, config) {
  var row = findLatestActiveMealLog(userId, config);

  if (!row) {
    return null;
  }

  var sheet = getSheetByName('MealLogs', config);
  var driveDeleteError = '';

  if (row.drive_file_id) {
    try {
      trashDriveFileById(row.drive_file_id);
    } catch (error) {
      driveDeleteError = error.message || String(error);
    }
  }

  sheet.deleteRow(row._rowNumber);
  SpreadsheetApp.flush();
  row.user_note = note;
  row.status = 'deleted';
  row._driveDeleteError = driveDeleteError;
  return row;
}

function getUserIdsWithActiveLogsByDate(date, config) {
  var rows = readSheetRows('MealLogs', config);
  var userIds = {};

  rows.forEach(function (row) {
    if (isSameSheetDate(row.date, date, config) && isActiveStatus(row.status) && row.user_id) {
      userIds[String(row.user_id)] = true;
    }
  });

  return Object.keys(userIds);
}

function getUserIdsWithActivityByDate(date, config) {
  var userIds = {};

  readSheetRows('MealLogs', config).forEach(function (row) {
    if (isSameSheetDate(row.date, date, config) && isActiveStatus(row.status) && row.user_id) {
      userIds[String(row.user_id)] = true;
    }
  });

  getBodyMetricsByDate('', date, config).forEach(function (row) {
    if (row.user_id) {
      userIds[String(row.user_id)] = true;
    }
  });

  return Object.keys(userIds);
}

function getUserIdsWithActivityByDateRange(startDate, endDate, config) {
  var userIds = {};

  readSheetRows('MealLogs', config).forEach(function (row) {
    if (isDateInRange(row.date, startDate, endDate, config) && isActiveStatus(row.status) && row.user_id) {
      userIds[String(row.user_id)] = true;
    }
  });

  getBodyMetricsByDateRange('', startDate, endDate, config).forEach(function (row) {
    if (row.user_id) {
      userIds[String(row.user_id)] = true;
    }
  });

  return Object.keys(userIds);
}

function getActiveMealLogsByDate(userId, date, config) {
  return readSheetRows('MealLogs', config).filter(function (row) {
    return (!userId || String(row.user_id) === String(userId)) &&
      isSameSheetDate(row.date, date, config) &&
      isActiveStatus(row.status);
  });
}

function getActiveMealLogsByDateRange(userId, startDate, endDate, config) {
  return readSheetRows('MealLogs', config).filter(function (row) {
    return (!userId || String(row.user_id) === String(userId)) &&
      isDateInRange(row.date, startDate, endDate, config) &&
      isActiveStatus(row.status);
  });
}

function getCorrectedMealLogsByDateRange(userId, startDate, endDate, config) {
  return getActiveMealLogsByDateRange(userId, startDate, endDate, config).filter(function (row) {
    return hasSheetValue(row.corrected_calories);
  });
}

function getBodyMetricsByDate(userId, date, config) {
  return readSheetRows('BodyMetrics', config).filter(function (row) {
    return (!userId || String(row.user_id) === String(userId)) &&
      isSameSheetDate(row.date, date, config) &&
      isActiveStatus(row.status);
  });
}

function getBodyMetricsByDateRange(userId, startDate, endDate, config) {
  return readSheetRows('BodyMetrics', config).filter(function (row) {
    return (!userId || String(row.user_id) === String(userId)) &&
      isDateInRange(row.date, startDate, endDate, config) &&
      isActiveStatus(row.status);
  });
}

function getDailySummariesByDateRange(userId, startDate, endDate, config) {
  return readSheetRows('DailySummary', config).filter(function (row) {
    return (!userId || String(row.user_id) === String(userId)) &&
      isDateInRange(row.date, startDate, endDate, config);
  });
}

function findLatestBodyMetric(userId, config) {
  var rows = readSheetRows('BodyMetrics', config);

  for (var index = rows.length - 1; index >= 0; index -= 1) {
    if (String(rows[index].user_id) === String(userId) && isActiveStatus(rows[index].status)) {
      return rows[index];
    }
  }

  return null;
}

function getRecentBodyMetrics(userId, limit, config) {
  var maxRows = limit || 30;
  var rows = readSheetRows('BodyMetrics', config).filter(function (row) {
    return String(row.user_id) === String(userId) && isActiveStatus(row.status);
  });

  return rows.slice(Math.max(0, rows.length - maxRows));
}

function isActiveStatus(status) {
  var normalized = String(status || '').trim().toLowerCase();
  return normalized === '' || normalized === 'active' || normalized === 'true';
}

function normalizeSheetDate(value, config) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, config.timezone, 'yyyy-MM-dd');
  }

  var text = String(value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    return text.slice(0, 10);
  }

  return text;
}

function isSameSheetDate(value, expectedDate, config) {
  return normalizeSheetDate(value, config) === normalizeSheetDate(expectedDate, config);
}

function isDateInRange(value, startDate, endDate, config) {
  var normalized = normalizeSheetDate(value, config);
  var start = normalizeSheetDate(startDate, config);
  var end = normalizeSheetDate(endDate, config);

  return normalized >= start && normalized <= end;
}

function getUserProfile(userId, config) {
  return readSheetRows('UserProfile', config).filter(function (row) {
    return String(row.user_id) === String(userId);
  })[0] || null;
}

function getEnabledFoodRules(config) {
  return readSheetRows('FoodRules', config).filter(function (row) {
    return String(row.enabled || 'TRUE').toUpperCase() !== 'FALSE' && String(row.food_keyword || '').trim();
  }).map(function (row) {
    return {
      food_keyword: String(row.food_keyword || '').trim(),
      portion_unit: String(row.portion_unit || '').trim(),
      calories_per_unit: toNumber(row.calories_per_unit, 0),
      protein_per_unit: toNumber(row.protein_per_unit, 0),
      carbs_per_unit: toNumber(row.carbs_per_unit, 0),
      fat_per_unit: toNumber(row.fat_per_unit, 0),
      note: String(row.note || '').trim()
    };
  });
}

function appendDefaultFoodRulesIfEmpty(config) {
  var sheet = getSheetByName('FoodRules', config);

  if (sheet.getLastRow() > 1) {
    return;
  }

  var now = nowIso(config);
  var defaults = typeof getDefaultFoodRules === 'function'
    ? getDefaultFoodRules(config)
    : [
      ['蒸餃', '顆', 55, 2.5, 6, 2.2, '一般台式蒸餃粗估', 'TRUE', now],
      ['水餃', '顆', 50, 2.5, 6, 1.8, '一般水餃粗估', 'TRUE', now]
    ];

  sheet.getRange(2, 1, defaults.length, defaults[0].length).setValues(defaults);
  SpreadsheetApp.flush();
}

function calculateDailySummary(userId, date, config) {
  var logs = getActiveMealLogsByDate(userId, date, config);
  var profile = getUserProfile(userId, config);
  var targetCalories = profile ? toNumber(profile.target_calories, config.defaultTargetCalories) : config.defaultTargetCalories;
  var proteinTarget = profile ? toNumber(profile.protein_target_g, config.defaultProteinTargetG) : config.defaultProteinTargetG;

  var summary = logs.reduce(function (acc, row) {
    acc.totalCalories += getEffectiveMealCalories(row);
    acc.totalProtein += toNumber(row.protein_g, 0);
    acc.totalCarbs += toNumber(row.carbs_g, 0);
    acc.totalFat += toNumber(row.fat_g, 0);
    acc.mealCount += 1;
    return acc;
  }, {
    date: date,
    userId: userId,
    totalCalories: 0,
    totalProtein: 0,
    totalCarbs: 0,
    totalFat: 0,
    mealCount: 0,
    targetCalories: targetCalories,
    proteinTarget: proteinTarget
  });

  summary.calorieGap = summary.targetCalories - summary.totalCalories;
  summary.proteinGap = summary.proteinTarget - summary.totalProtein;
  return summary;
}

function getEffectiveMealCalories(row) {
  if (hasSheetValue(row.corrected_calories)) {
    return toNumber(row.corrected_calories, 0);
  }

  return toNumber(row.ai_calories, 0);
}

function hasSheetValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function upsertDailySummary(summary, config) {
  var sheet = getSheetByName('DailySummary', config);
  var rows = readSheetRows('DailySummary', config);
  var existing = rows.filter(function (row) {
    return isSameSheetDate(row.date, summary.date, config) && String(row.user_id) === String(summary.userId);
  })[0];
  var values = [
    summary.date,
    summary.userId,
    Math.round(summary.totalCalories),
    Math.round(summary.totalProtein),
    Math.round(summary.totalCarbs),
    Math.round(summary.totalFat),
    summary.mealCount,
    summary.targetCalories,
    summary.proteinTarget,
    Math.round(summary.calorieGap),
    Math.round(summary.proteinGap)
  ];

  if (existing) {
    sheet.getRange(existing._rowNumber, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }
}
