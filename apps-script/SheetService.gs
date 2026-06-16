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
    'status',
    'rule_matches',
    'risk_tags',
    'adjustment_reasons'
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
    'updated_at',
    'category',
    'risk_tags',
    'correction_policy',
    'priority'
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
  PendingActions: [
    'id',
    'timestamp',
    'expires_at',
    'user_id',
    'action_type',
    'payload_json',
    'status'
  ],
  UndoActions: [
    'id',
    'timestamp',
    'user_id',
    'action_type',
    'payload_json',
    'status'
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

function appendPendingAction(record, config) {
  appendRowObject('PendingActions', {
    id: record.id,
    timestamp: record.timestamp || nowIso(config),
    expires_at: record.expires_at || '',
    user_id: record.user_id || '',
    action_type: record.action_type || '',
    payload_json: record.payload_json || '',
    status: record.status || 'pending'
  }, config);
}

function appendUndoAction(record, config) {
  appendRowObject('UndoActions', {
    id: record.id,
    timestamp: record.timestamp || nowIso(config),
    user_id: record.user_id || '',
    action_type: record.action_type || '',
    payload_json: record.payload_json || '',
    status: record.status || 'active'
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

function applyMealNutritionCorrectionByRow(rowNumber, correction, note, config) {
  var row = readSheetRows('MealLogs', config).filter(function (record) {
    return Number(record._rowNumber) === Number(rowNumber);
  })[0];

  if (!row || !isActiveStatus(row.status)) {
    return null;
  }

  appendUndoAction({
    id: createUuid(),
    timestamp: nowIso(config),
    user_id: row.user_id,
    action_type: 'meal_correction',
    payload_json: stringifyJson({
      meal: backupSheetRecord(row, 'MealLogs')
    }),
    status: 'active'
  }, config);

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
  var lockCalories = Boolean(correction.lockCalories) && !hasCalories;
  var protein = hasProtein ? Number(correction.protein) : before.protein;
  var carbs = hasCarbs ? Number(correction.carbs) : before.carbs;
  var fat = hasFat ? Number(correction.fat) : before.fat;
  var calories = hasCalories ? Number(correction.calories) : null;
  var meta = [];

  if (hasCalories && !hasProtein && !hasCarbs && !hasFat) {
    var calorieOnly = rebalanceMacrosToCalories({
      protein: protein,
      carbs: carbs,
      fat: fat
    }, calories, {
      protein: true,
      carbs: Boolean(correction.lockCarbs),
      fat: Boolean(correction.lockFat)
    }, inferMealCorrectionPolicy(row));

    protein = calorieOnly.protein;
    carbs = calorieOnly.carbs;
    fat = calorieOnly.fat;
    calories = calorieOnly.calories;
    meta.push('僅修正熱量，蛋白質先維持原值，熱量差額優先分配到碳水與脂肪');
  } else if (hasCalories) {
    var mixedCorrection = rebalanceMacrosToCalories({
      protein: protein,
      carbs: carbs,
      fat: fat
    }, calories, {
      protein: hasProtein || Boolean(correction.lockProtein) || (!hasProtein && (hasCarbs || hasFat)),
      carbs: hasCarbs || Boolean(correction.lockCarbs),
      fat: hasFat || Boolean(correction.lockFat)
    }, inferMealCorrectionPolicy(row));

    protein = mixedCorrection.protein;
    carbs = mixedCorrection.carbs;
    fat = mixedCorrection.fat;
    calories = mixedCorrection.calories;

    if (mixedCorrection.conflict) {
      meta.push('指定營養素換算熱量已高於指定熱量，改以營養素換算熱量為準');
    } else {
      meta.push('指定熱量與部分營養素，其餘熱量差額優先由未指定的碳水與脂肪調整');
    }
  } else if (hasProtein || hasCarbs || hasFat) {
    if (lockCalories) {
      calories = before.calories;
      meta.push('指定營養素後，熱量依使用者要求維持原值，不用 4/4/9 重新計算');
    } else {
      calories = macroCalories(protein, carbs, fat);
      meta.push('指定營養素後，熱量依 4/4/9 公式重新計算');
    }
  } else {
    calories = before.calories;
  }

  return {
    calories: roundNonNegative(calories),
    protein: roundNonNegative(protein),
    carbs: roundNonNegative(carbs),
    fat: roundNonNegative(fat),
    before: before,
    after: {
      calories: roundNonNegative(calories),
      protein: roundNonNegative(protein),
      carbs: roundNonNegative(carbs),
      fat: roundNonNegative(fat)
    },
    meta: meta
  };
}

function macroCalories(protein, carbs, fat) {
  return toNumber(protein, 0) * 4 + toNumber(carbs, 0) * 4 + toNumber(fat, 0) * 9;
}

function rebalanceMacrosToCalories(macros, targetCalories, locked, policy) {
  var result = {
    protein: Math.max(0, toNumber(macros.protein, 0)),
    carbs: Math.max(0, toNumber(macros.carbs, 0)),
    fat: Math.max(0, toNumber(macros.fat, 0)),
    calories: roundNonNegative(targetCalories),
    conflict: false
  };
  var target = Math.max(0, toNumber(targetCalories, 0));
  var delta = target - macroCalories(result.protein, result.carbs, result.fat);

  if (Math.abs(delta) <= 1) {
    return result;
  }

  if (delta > 0) {
    addMacroEnergy(result, delta, locked, policy);
  } else {
    removeMacroEnergy(result, Math.abs(delta), locked);
  }

  var finalCalories = macroCalories(result.protein, result.carbs, result.fat);

  if (Math.abs(finalCalories - target) > 2) {
    result.calories = roundNonNegative(finalCalories);
    result.conflict = true;
  }

  return result;
}

function addMacroEnergy(result, energy, locked, policy) {
  var shares = getUnlockedEnergyShares(locked, policy);

  if (shares.carbs > 0) {
    result.carbs += (energy * shares.carbs) / 4;
  }

  if (shares.fat > 0) {
    result.fat += (energy * shares.fat) / 9;
  }

  if (shares.protein > 0) {
    result.protein += (energy * shares.protein) / 4;
  }
}

function removeMacroEnergy(result, energy, locked) {
  var remaining = energy;
  remaining = reduceMacro(result, 'carbs', 4, remaining, locked.carbs);
  remaining = reduceMacro(result, 'fat', 9, remaining, locked.fat);
  remaining = reduceMacro(result, 'protein', 4, remaining, locked.protein);
}

function reduceMacro(result, key, kcalPerGram, energy, locked) {
  if (locked || energy <= 0) {
    return energy;
  }

  var currentEnergy = result[key] * kcalPerGram;
  var removed = Math.min(currentEnergy, energy);
  result[key] = Math.max(0, result[key] - removed / kcalPerGram);
  return energy - removed;
}

function getUnlockedEnergyShares(locked, policy) {
  var carbShare = locked.carbs ? 0 : policy.carbShare;
  var fatShare = locked.fat ? 0 : policy.fatShare;
  var proteinShare = locked.protein ? 0 : policy.proteinShare;
  var total = carbShare + fatShare + proteinShare;

  if (total <= 0 && !locked.protein) {
    return { protein: 1, carbs: 0, fat: 0 };
  }

  if (total <= 0 && !locked.carbs) {
    return { protein: 0, carbs: 1, fat: 0 };
  }

  if (total <= 0 && !locked.fat) {
    return { protein: 0, carbs: 0, fat: 1 };
  }

  if (total <= 0) {
    return { protein: 0, carbs: 0, fat: 0 };
  }

  return {
    protein: proteinShare / total,
    carbs: carbShare / total,
    fat: fatShare / total
  };
}

function inferMealCorrectionPolicy(row) {
  var text = [
    row.meal_name || '',
    row.uncertainty || '',
    row.raw_json || ''
  ].join(' ');

  if (/(炸|酥|雞排|炸雞|薯條|年糕|起司|芝士|奶油|白醬|青醬|漢堡|披薩|蛋塔|甜點|塔|派|醬)/.test(text)) {
    return { proteinShare: 0, carbShare: 0.35, fatShare: 0.65 };
  }

  if (/(飯|麵|義大利麵|炒飯|炒麵|米粉|冬粉|麵包|吐司|貝果|地瓜|馬鈴薯|玉米|粥)/.test(text)) {
    return { proteinShare: 0, carbShare: 0.65, fatShare: 0.35 };
  }

  return { proteinShare: 0, carbShare: 0.5, fatShare: 0.5 };
}

function previewMealNutritionCorrection(userId, correction, config) {
  var row = findLatestActiveMealLog(userId, config);

  if (!row) {
    return null;
  }

  var nutrition = deriveCorrectedNutrition(row, correction || {});
  row._beforeNutrition = nutrition.before;
  row._afterNutrition = {
    calories: nutrition.calories,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat
  };
  row._correctionMeta = nutrition.meta;
  return {
    row: row,
    nutrition: nutrition
  };
}

function cancelLastMealLog(userId, note, config) {
  var row = findLatestActiveMealLog(userId, config);

  if (!row) {
    return null;
  }

  var sheet = getSheetByName('MealLogs', config);
  var driveDeleteError = '';
  appendUndoAction({
    id: createUuid(),
    timestamp: nowIso(config),
    user_id: userId,
    action_type: 'delete_meal',
    payload_json: stringifyJson({
      meal: backupSheetRecord(row, 'MealLogs')
    }),
    status: 'active'
  }, config);

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

function getLatestPendingAction(userId, actionType, config) {
  var rows = readSheetRows('PendingActions', config);

  for (var index = rows.length - 1; index >= 0; index -= 1) {
    if (String(rows[index].user_id) === String(userId) &&
      String(rows[index].action_type) === String(actionType) &&
      String(rows[index].status) === 'pending' &&
      !isPendingActionExpired(rows[index], config)) {
      return rows[index];
    }
  }

  return null;
}

function getLatestUndoAction(userId, config) {
  var rows = readSheetRows('UndoActions', config);

  for (var index = rows.length - 1; index >= 0; index -= 1) {
    if (String(rows[index].user_id) === String(userId) &&
      String(rows[index].status) === 'active') {
      return rows[index];
    }
  }

  return null;
}

function resolveUndoAction(rowNumber, status, config) {
  var sheet = getSheetByName('UndoActions', config);
  sheet.getRange(rowNumber, 6).setValue(status);
  SpreadsheetApp.flush();
}

function undoLastAction(userId, config) {
  var undo = getLatestUndoAction(userId, config);

  if (!undo) {
    return null;
  }

  var payload = extractJsonObject(undo.payload_json);
  var meal = payload.meal || {};
  var actionType = String(undo.action_type || '');
  var restored;

  if (actionType === 'meal_correction') {
    restored = restoreMealLogRecord(meal, config);
    resolveUndoAction(undo._rowNumber, restored ? 'undone' : 'failed', config);
    return restored ? {
      actionType: actionType,
      meal: restored
    } : null;
  }

  if (actionType === 'delete_meal') {
    restored = restoreDeletedMealLog(meal, config);
    resolveUndoAction(undo._rowNumber, restored ? 'undone' : 'failed', config);
    return restored ? {
      actionType: actionType,
      meal: restored
    } : null;
  }

  resolveUndoAction(undo._rowNumber, 'unsupported', config);
  return null;
}

function backupSheetRecord(row, sheetName) {
  var headers = SHEET_SCHEMAS[sheetName];
  var backup = {};

  headers.forEach(function (header) {
    backup[header] = row[header] === undefined || row[header] === null ? '' : row[header];
  });

  return backup;
}

function valuesForSheetRecord(record, sheetName) {
  return SHEET_SCHEMAS[sheetName].map(function (header) {
    return record[header] === undefined || record[header] === null ? '' : record[header];
  });
}

function findMealLogById(mealId, config) {
  if (!mealId) {
    return null;
  }

  return readSheetRows('MealLogs', config).filter(function (row) {
    return String(row.id) === String(mealId);
  })[0] || null;
}

function restoreMealLogRecord(meal, config) {
  if (!meal || !meal.id) {
    return null;
  }

  var sheet = getSheetByName('MealLogs', config);
  var existing = findMealLogById(meal.id, config);
  var values = valuesForSheetRecord(meal, 'MealLogs');

  if (existing) {
    sheet.getRange(existing._rowNumber, 1, 1, values.length).setValues([values]);
  } else {
    sheet.appendRow(values);
  }

  if (meal.drive_file_id) {
    try {
      restoreDriveFileById(meal.drive_file_id);
    } catch (error) {
      meal._driveRestoreError = error.message || String(error);
    }
  }

  SpreadsheetApp.flush();
  return findMealLogById(meal.id, config) || meal;
}

function restoreDeletedMealLog(meal, config) {
  if (!meal || !meal.id) {
    return null;
  }

  var existing = findMealLogById(meal.id, config);

  if (existing && isActiveStatus(existing.status)) {
    return existing;
  }

  meal.status = meal.status || 'active';
  return restoreMealLogRecord(meal, config);
}

function resolvePendingAction(rowNumber, status, config) {
  var sheet = getSheetByName('PendingActions', config);
  sheet.getRange(rowNumber, 7).setValue(status);
  SpreadsheetApp.flush();
}

function clearPendingActions(userId, actionType, config) {
  readSheetRows('PendingActions', config).forEach(function (row) {
    if (String(row.user_id) === String(userId) &&
      String(row.action_type) === String(actionType) &&
      String(row.status) === 'pending') {
      resolvePendingAction(row._rowNumber, 'cancelled', config);
    }
  });
}

function isPendingActionExpired(row, config) {
  if (!row.expires_at) {
    return false;
  }

  return new Date(row.expires_at).getTime() < Date.now();
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

function getApiUsageSummary(date, config) {
  var rows = readSheetRows('ApiUsage', config);
  var today = normalizeSheetDate(date, config);
  var todayRows = rows.filter(function (row) {
    return normalizeSheetDate(row.timestamp, config) === today;
  });
  var totalRows = rows;

  return {
    date: today,
    todayCalls: todayRows.length,
    todaySuccessfulCalls: countSuccessfulApiUsage(todayRows),
    todayEstimatedCostUsd: sumApiUsageCost(todayRows),
    totalCalls: totalRows.length,
    totalSuccessfulCalls: countSuccessfulApiUsage(totalRows),
    totalEstimatedCostUsd: sumApiUsageCost(totalRows)
  };
}

function countSuccessfulApiUsage(rows) {
  return rows.filter(function (row) {
    return String(row.success).toUpperCase() === 'TRUE';
  }).length;
}

function sumApiUsageCost(rows) {
  return rows.reduce(function (sum, row) {
    return sum + toNumber(row.estimated_cost_usd, 0);
  }, 0);
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
      note: String(row.note || '').trim(),
      category: String(row.category || '').trim(),
      risk_tags: String(row.risk_tags || '').trim(),
      correction_policy: String(row.correction_policy || '').trim(),
      priority: toNumber(row.priority, 0)
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
