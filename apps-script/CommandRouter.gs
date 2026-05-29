function processLineEvent(event, config) {
  if (!event || event.type !== 'message' || !event.replyToken || !event.message) {
    return;
  }

  if (event.message.type === 'image') {
    handleImageMessage(event, config);
    return;
  }

  if (event.message.type === 'text') {
    handleTextMessage(event, config);
    return;
  }

  replyToLine(event.replyToken, '目前支援餐點照片、營養標示、身體數據照片與文字指令。', config);
  appendSystemEvent({
    timestamp: eventTimestampIso(event.timestamp, config),
    user_id: getEventUserId(event),
    message_type: event.message.type,
    event_type: event.type,
    action_taken: 'unsupported_message',
    success: true,
    raw_event: stringifyJson(event)
  }, config);
}

function handleImageMessage(event, config) {
  var userId = getEventUserId(event);

  if (!userId) {
    replyToLine(event.replyToken, '無法取得使用者 ID，不能記錄餐點。', config);
    return;
  }

  var timestamp = eventTimestampIso(event.timestamp, config);
  var date = eventDate(event.timestamp, config);
  var messageId = event.message.id;
  var imageBlob = getLineMessageContent(messageId, config);
  var imageClass = classifyFoodImage(imageBlob, config);

  appendApiUsage({
    timestamp: timestamp,
    model: config.geminiModel,
    task_type: 'classify_food_image',
    input_tokens: imageClass.inputTokens,
    output_tokens: imageClass.outputTokens,
    estimated_cost_usd: imageClass.estimatedCostUsd,
    line_message_id: messageId,
    success: true,
    error: ''
  }, config);

  if (imageClass.type === 'nutrition_label') {
    handleNutritionLabelImage(event, config, {
      userId: userId,
      timestamp: timestamp,
      date: date,
      messageId: messageId,
      imageBlob: imageBlob,
      imageClass: imageClass
    });
    return;
  }

  if (imageClass.type === 'body_metric') {
    handleBodyMetricImage(event, config, {
      userId: userId,
      timestamp: timestamp,
      date: date,
      messageId: messageId,
      imageBlob: imageBlob,
      imageClass: imageClass
    });
    return;
  }

  handleMealPhotoImage(event, config, {
    userId: userId,
    timestamp: timestamp,
    date: date,
    messageId: messageId,
    imageBlob: imageBlob,
    imageClass: imageClass
  });
}

function handleMealPhotoImage(event, config, context) {
  var userId = context.userId;
  var timestamp = context.timestamp;
  var date = context.date;
  var messageId = context.messageId;
  var imageBlob = context.imageBlob;
  var foodRules = getEnabledFoodRules(config);
  var driveFile = saveFoodPhotoToDrive(imageBlob, {
    userId: userId,
    messageId: messageId,
    timestamp: event.timestamp
  }, config);
  var geminiResult;

  try {
    geminiResult = callGeminiForMealEstimate(imageBlob, config, foodRules);
    appendApiUsage({
      timestamp: timestamp,
      model: config.geminiModel,
      task_type: 'estimate_meal',
      input_tokens: geminiResult.inputTokens,
      output_tokens: geminiResult.outputTokens,
      estimated_cost_usd: geminiResult.estimatedCostUsd,
      line_message_id: messageId,
      success: true,
      error: ''
    }, config);
  } catch (error) {
    appendApiUsage({
      timestamp: timestamp,
      model: config.geminiModel,
      task_type: 'estimate_meal',
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      line_message_id: messageId,
      success: false,
      error: error.message
    }, config);
    throw error;
  }

  var estimate = geminiResult.estimate;

  appendMealLog({
    id: createUuid(),
    timestamp: timestamp,
    date: date,
    user_id: userId,
    line_message_id: messageId,
    drive_file_id: driveFile.fileId,
    drive_url: driveFile.driveUrl,
    meal_name: estimate.meal_name,
    ai_calories: estimate.total.calories_kcal,
    corrected_calories: '',
    protein_g: estimate.total.protein_g,
    carbs_g: estimate.total.carbs_g,
    fat_g: estimate.total.fat_g,
    confidence: estimate.confidence,
    uncertainty: estimate.uncertainty_factors.join('；'),
    user_note: '',
    model_used: config.geminiModel,
    raw_json: geminiResult.rawText,
    status: 'active'
  }, config);

  var summary = calculateDailySummary(userId, date, config);
  upsertDailySummary(summary, config);
  replyToLine(event.replyToken, formatMealEstimateReply(estimate, summary), config);
  appendSystemEvent({
    timestamp: timestamp,
    user_id: userId,
    message_type: 'image',
    event_type: event.type,
    action_taken: 'estimate_meal',
    success: true,
    error: '',
    raw_event: stringifyJson(event)
  }, config);
}

function handleNutritionLabelImage(event, config, context) {
  var userId = context.userId;
  var timestamp = context.timestamp;
  var date = context.date;
  var messageId = context.messageId;
  var imageBlob = context.imageBlob;
  var driveFile = saveNutritionLabelPhotoToDrive(imageBlob, {
    userId: userId,
    messageId: messageId,
    timestamp: event.timestamp
  }, config);
  var geminiResult;

  try {
    geminiResult = callGeminiForNutritionLabel(imageBlob, config);
    appendApiUsage({
      timestamp: timestamp,
      model: config.geminiModel,
      task_type: 'parse_nutrition_label',
      input_tokens: geminiResult.inputTokens,
      output_tokens: geminiResult.outputTokens,
      estimated_cost_usd: geminiResult.estimatedCostUsd,
      line_message_id: messageId,
      success: true,
      error: ''
    }, config);
  } catch (error) {
    appendApiUsage({
      timestamp: timestamp,
      model: config.geminiModel,
      task_type: 'parse_nutrition_label',
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      line_message_id: messageId,
      success: false,
      error: error.message
    }, config);
    throw error;
  }

  var label = geminiResult.estimate;

  appendMealLog({
    id: createUuid(),
    timestamp: timestamp,
    date: date,
    user_id: userId,
    line_message_id: messageId,
    drive_file_id: driveFile.fileId,
    drive_url: driveFile.driveUrl,
    meal_name: '營養標示：' + label.product_name,
    ai_calories: label.total.calories_kcal,
    corrected_calories: '',
    protein_g: label.total.protein_g,
    carbs_g: label.total.carbs_g,
    fat_g: label.total.fat_g,
    confidence: label.confidence,
    uncertainty: label.uncertainty_factors.join('；'),
    user_note: formatNutritionLabelNote(label),
    model_used: config.geminiModel,
    raw_json: geminiResult.rawText,
    status: 'active'
  }, config);

  var summary = calculateDailySummary(userId, date, config);
  upsertDailySummary(summary, config);
  replyToLine(event.replyToken, formatNutritionLabelReply(label, summary), config);
  appendSystemEvent({
    timestamp: timestamp,
    user_id: userId,
    message_type: 'image',
    event_type: event.type,
    action_taken: 'parse_nutrition_label',
    success: true,
    error: '',
    raw_event: stringifyJson(event)
  }, config);
}

function handleBodyMetricImage(event, config, context) {
  var userId = context.userId;
  var timestamp = context.timestamp;
  var date = context.date;
  var messageId = context.messageId;
  var imageBlob = context.imageBlob;
  var previous = findLatestBodyMetric(userId, config);
  var driveFile = saveBodyMetricPhotoToDrive(imageBlob, {
    userId: userId,
    messageId: messageId,
    timestamp: event.timestamp
  }, config);
  var geminiResult;

  try {
    geminiResult = callGeminiForBodyMetrics(imageBlob, config);
    appendApiUsage({
      timestamp: timestamp,
      model: config.geminiModel,
      task_type: 'parse_body_metric',
      input_tokens: geminiResult.inputTokens,
      output_tokens: geminiResult.outputTokens,
      estimated_cost_usd: geminiResult.estimatedCostUsd,
      line_message_id: messageId,
      success: true,
      error: ''
    }, config);
  } catch (error) {
    appendApiUsage({
      timestamp: timestamp,
      model: config.geminiModel,
      task_type: 'parse_body_metric',
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      line_message_id: messageId,
      success: false,
      error: error.message
    }, config);
    throw error;
  }

  var metrics = geminiResult.metrics;
  appendBodyMetric(buildBodyMetricRecord({
    id: createUuid(),
    timestamp: timestamp,
    date: date,
    userId: userId,
    sourceType: 'image',
    lineMessageId: messageId,
    driveFile: driveFile,
    metrics: metrics,
    modelUsed: config.geminiModel,
    rawJson: geminiResult.rawText
  }), config);

  replyToLine(event.replyToken, formatBodyMetricReply(metrics, previous), config);
  appendSystemEvent({
    timestamp: timestamp,
    user_id: userId,
    message_type: 'image',
    event_type: event.type,
    action_taken: 'parse_body_metric',
    success: true,
    error: '',
    raw_event: stringifyJson(event)
  }, config);
}

function handleTextMessage(event, config) {
  var userId = getEventUserId(event);
  var text = String(event.message.text || '').trim();
  var timestamp = eventTimestampIso(event.timestamp, config);
  var date = eventDate(event.timestamp, config);

  if (!userId) {
    replyToLine(event.replyToken, '無法取得使用者 ID，不能處理指令。', config);
    return;
  }

  if (text === '確認' || text === '確認修改') {
    handlePendingMealCorrectionConfirmation(event, config, userId, timestamp, date);
    return;
  }

  if (text === '取消' || text === '取消修改') {
    clearPendingActions(userId, 'meal_correction', config);
    replyToLine(event.replyToken, '已取消待確認的餐點修正。', config);
    return;
  }

  if (text === '今日') {
    var summary = calculateDailySummary(userId, date, config);
    upsertDailySummary(summary, config);
    replyToLine(event.replyToken, formatDailySummaryReply(summary), config);
    appendSystemEvent({
      timestamp: timestamp,
      user_id: userId,
      message_type: 'text',
      event_type: event.type,
      action_taken: 'daily_summary',
      success: true,
      error: '',
      raw_event: stringifyJson(event)
    }, config);
    return;
  }

  if (text === '本週總結' || text === '週總結') {
    var weeklyMemory = generateWeeklyMemory(userId, date, config);
    replyToLine(event.replyToken, '已建立本週總結\n' + weeklyMemory.file.fileName + '\n' + weeklyMemory.file.driveUrl, config);
    appendSystemEvent({
      timestamp: timestamp,
      user_id: userId,
      message_type: 'text',
      event_type: event.type,
      action_taken: 'generate_weekly_memory',
      success: true,
      error: '',
      raw_event: stringifyJson(event)
    }, config);
    return;
  }

  if (text === '修正學習' || text === '個人化修正學習') {
    var learningMemory = generateCorrectionLearningMemory(userId, date, config);
    replyToLine(event.replyToken, '已建立修正學習報告\n' + learningMemory.file.fileName + '\n' + learningMemory.file.driveUrl, config);
    appendSystemEvent({
      timestamp: timestamp,
      user_id: userId,
      message_type: 'text',
      event_type: event.type,
      action_taken: 'generate_correction_learning',
      success: true,
      error: '',
      raw_event: stringifyJson(event)
    }, config);
    return;
  }

  var mealCorrection = parseMealCorrectionText(text);

  if (mealCorrection) {
    var preview = previewMealNutritionCorrection(userId, mealCorrection, config);

    if (!preview) {
      replyToLine(event.replyToken, '找不到可修正的上一筆餐點。', config);
      return;
    }

    var warnings = validateMealCorrectionPreview(preview.row, preview.nutrition, mealCorrection);

    if (warnings.length > 0) {
      clearPendingActions(userId, 'meal_correction', config);
      appendPendingAction({
        id: createUuid(),
        timestamp: timestamp,
        expires_at: pendingExpiresAt(config),
        user_id: userId,
        action_type: 'meal_correction',
        payload_json: stringifyJson({
          rowNumber: preview.row._rowNumber,
          correction: mealCorrection,
          originalText: text
        }),
        status: 'pending'
      }, config);
      replyToLine(event.replyToken, formatCorrectionWarningReply(preview.row, preview.nutrition, warnings), config);
      return;
    }

    var updated = applyMealNutritionCorrectionByRow(
      preview.row._rowNumber,
      mealCorrection,
      'user_corrected:' + text + ' @ ' + timestamp,
      config
    );

    var correctedSummary = calculateDailySummary(userId, date, config);
    upsertDailySummary(correctedSummary, config);
    replyToLine(event.replyToken, formatCorrectionReply(updated, mealCorrection, correctedSummary), config);
    appendSystemEvent({
      timestamp: timestamp,
      user_id: userId,
      message_type: 'text',
      event_type: event.type,
      action_taken: 'correct_last_meal',
      success: true,
      error: '',
      raw_event: stringifyJson(event)
    }, config);
    return;
  }

  if (text === '不記錄' || text === '不紀錄' || text === '取消上一筆' || text === '刪除上一筆') {
    var cancelled = cancelLastMealLog(userId, 'cancelled_by_user @ ' + timestamp, config);

    if (!cancelled) {
      replyToLine(event.replyToken, '找不到可取消的上一筆餐點。', config);
      return;
    }

    var cancelSummary = calculateDailySummary(userId, date, config);
    upsertDailySummary(cancelSummary, config);
    replyToLine(event.replyToken, formatCancelReply(cancelled, cancelSummary), config);
    appendSystemEvent({
      timestamp: timestamp,
      user_id: userId,
      message_type: 'text',
      event_type: event.type,
      action_taken: 'cancel_last_meal',
      success: true,
      error: '',
      raw_event: stringifyJson(event)
    }, config);
    return;
  }

  if (text === '今日總結' || text === '產生今日記憶') {
    var memory = generateDailyMemory(userId, date, config);
    replyToLine(event.replyToken, '已建立今日總結\n' + memory.file.fileName + '\n' + memory.file.driveUrl, config);
    appendSystemEvent({
      timestamp: timestamp,
      user_id: userId,
      message_type: 'text',
      event_type: event.type,
      action_taken: 'generate_daily_memory',
      success: true,
      error: '',
      raw_event: stringifyJson(event)
    }, config);
    return;
  }

  var bodyMetrics = parseBodyMetricsText(text);

  if (bodyMetrics) {
    var previousMetric = findLatestBodyMetric(userId, config);
    appendBodyMetric(buildBodyMetricRecord({
      id: createUuid(),
      timestamp: timestamp,
      date: date,
      userId: userId,
      sourceType: 'text',
      lineMessageId: event.message.id,
      driveFile: null,
      metrics: bodyMetrics,
      modelUsed: '',
      rawJson: stringifyJson(bodyMetrics)
    }), config);
    replyToLine(event.replyToken, formatBodyMetricReply(bodyMetrics, previousMetric), config);
    appendSystemEvent({
      timestamp: timestamp,
      user_id: userId,
      message_type: 'text',
      event_type: event.type,
      action_taken: 'record_body_metric',
      success: true,
      error: '',
      raw_event: stringifyJson(event)
    }, config);
    return;
  }

  replyToLine(event.replyToken, formatHelpReply(), config);
  appendSystemEvent({
    timestamp: timestamp,
    user_id: userId,
    message_type: 'text',
    event_type: event.type,
    action_taken: 'reply_help',
    success: true,
    error: '',
    raw_event: stringifyJson(event)
  }, config);
}

function handlePendingMealCorrectionConfirmation(event, config, userId, timestamp, date) {
  var pending = getLatestPendingAction(userId, 'meal_correction', config);

  if (!pending) {
    replyToLine(event.replyToken, '目前沒有待確認的餐點修正。', config);
    return;
  }

  var payload = extractJsonObject(pending.payload_json);
  var updated = applyMealNutritionCorrectionByRow(
    payload.rowNumber,
    payload.correction,
    'user_confirmed_correction:' + (payload.originalText || '') + ' @ ' + timestamp,
    config
  );

  resolvePendingAction(pending._rowNumber, 'confirmed', config);

  if (!updated) {
    replyToLine(event.replyToken, '確認失敗：找不到原本要修正的餐點，可能已被刪除。', config);
    return;
  }

  var correctedSummary = calculateDailySummary(userId, date, config);
  upsertDailySummary(correctedSummary, config);
  replyToLine(event.replyToken, formatCorrectionReply(updated, payload.correction, correctedSummary), config);
}

function getEventUserId(event) {
  return event && event.source ? event.source.userId || '' : '';
}

function buildBodyMetricRecord(input) {
  var metrics = input.metrics || {};
  var driveFile = input.driveFile || {};

  return {
    id: input.id,
    timestamp: input.timestamp,
    date: input.date,
    user_id: input.userId,
    source_type: input.sourceType,
    line_message_id: input.lineMessageId || '',
    drive_file_id: driveFile.fileId || '',
    drive_url: driveFile.driveUrl || '',
    weight_kg: metrics.weight_kg || '',
    body_fat_percent: metrics.body_fat_percent || '',
    muscle_mass_kg: metrics.muscle_mass_kg || '',
    bmi: metrics.bmi || '',
    visceral_fat: metrics.visceral_fat || '',
    basal_metabolic_rate_kcal: metrics.basal_metabolic_rate_kcal || '',
    body_age: metrics.body_age || '',
    water_percent: metrics.water_percent || '',
    bone_mass_kg: metrics.bone_mass_kg || '',
    inbody_score: metrics.inbody_score || '',
    confidence: metrics.confidence || 'medium',
    uncertainty: (metrics.uncertainty_factors || []).join('；'),
    user_note: metrics.raw_notes || '',
    model_used: input.modelUsed || '',
    raw_json: input.rawJson || '',
    status: 'active'
  };
}

function formatMealEstimateReply(estimate, summary) {
  return [
    '已記錄：' + estimate.meal_name,
    '約 ' + estimate.total.calories_kcal + ' kcal｜P ' + estimate.total.protein_g + 'g｜C ' + estimate.total.carbs_g + 'g｜F ' + estimate.total.fat_g + 'g',
    '信心：' + translateConfidence(estimate.confidence),
    '',
    formatCompactDailyProgress(summary),
    '',
    '可回覆：改成 600、改成 650 P30、不記錄、今日'
  ].join('\n');
}

function formatNutritionLabelReply(label, summary) {
  var lines = [
    '已記錄：' + label.product_name,
    '來源：營養標示（' + translateServingBasis(label.serving_basis) + '）',
    label.total.calories_kcal + ' kcal｜P ' + label.total.protein_g + 'g｜C ' + label.total.carbs_g + 'g｜F ' + label.total.fat_g + 'g'
  ];

  if (label.serving_size) {
    lines.push('份量：' + label.serving_size);
  }

  if (label.serving_basis === 'per_serving' && label.servings_per_package > 1) {
    lines.push('注意：這是每份數值；若你吃完整包，可用「改成 熱量」修正。');
  }

  if (label.serving_basis === 'per_100g') {
    lines.push('注意：目前記錄為每 100g；若實際吃的重量不同，可用「改成 熱量」修正。');
  }

  lines.push('');
  lines.push(formatCompactDailyProgress(summary));
  lines.push('');
  lines.push('可回覆：改成 600、改成 650 P30、不記錄、今日');
  return lines.join('\n');
}

function formatNutritionLabelNote(label) {
  return [
    'nutrition_label',
    'basis=' + label.serving_basis,
    'serving_size=' + (label.serving_size || ''),
    'servings_per_package=' + (label.servings_per_package || 0)
  ].join('; ');
}

function translateServingBasis(value) {
  if (value === 'per_package') return '每包裝';
  if (value === 'per_serving') return '每份';
  if (value === 'per_100g') return '每 100g';
  return '未判定份量基準';
}

function parseMealCorrectionText(text) {
  var correction = {};
  var calories = matchFirstNumber(text, [
    /改成\s*(?:約|大約|大概|差不多)?\s*(\d+(?:\.\d+)?)/i,
    /熱量\s*(?:改成|約|大約|大概|差不多|=|:|：)?\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:kcal|卡|大卡)/i
  ]);
  var protein = matchFirstNumber(text, [
    /(?:蛋白質|蛋白)\s*(?:改成|約|大約|大概|有|=|:|：)?\s*(\d+(?:\.\d+)?)/i,
    /(?:^|[\s,，;；])p\s*(?:約|大約|大概|有|=|:|：)?\s*(\d+(?:\.\d+)?)/i
  ]);
  var carbs = matchFirstNumber(text, [
    /(?:碳水|碳水化合物)\s*(?:改成|約|大約|大概|有|=|:|：)?\s*(\d+(?:\.\d+)?)/i,
    /(?:^|[\s,，;；])c\s*(?:約|大約|大概|有|=|:|：)?\s*(\d+(?:\.\d+)?)/i
  ]);
  var fat = matchFirstNumber(text, [
    /(?:脂肪|油脂)\s*(?:改成|約|大約|大概|有|=|:|：)?\s*(\d+(?:\.\d+)?)/i,
    /(?:^|[\s,，;；])f\s*(?:約|大約|大概|有|=|:|：)?\s*(\d+(?:\.\d+)?)/i
  ]);

  if (calories !== null) {
    correction.calories = Math.round(calories);
  }

  if (protein !== null) {
    correction.protein = protein;
  }

  if (carbs !== null) {
    correction.carbs = carbs;
  }

  if (fat !== null) {
    correction.fat = fat;
  }

  if (!hasAnyMealCorrection(correction)) {
    return null;
  }

  correction.adjustRemainder = /其他.*(配合|調整)|配合.*(熱量|總熱量)|剩下.*調整/.test(text);
  return correction;
}

function validateMealCorrectionPreview(meal, nutrition, correction) {
  var after = nutrition.after || {
    calories: nutrition.calories,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat
  };
  var warnings = [];
  var calories = toNumber(after.calories, 0);
  var protein = toNumber(after.protein, 0);
  var carbs = toNumber(after.carbs, 0);
  var fat = toNumber(after.fat, 0);
  var macroEnergy = protein * 4 + carbs * 4 + fat * 9;

  if (calories <= 0 || protein < 0 || carbs < 0 || fat < 0) {
    warnings.push('出現 0 以下或無效數值。');
  }

  if (calories < 80) {
    warnings.push('熱量低於 80 kcal，可能不合理。');
  }

  if (calories > 1800) {
    warnings.push('單餐熱量高於 1800 kcal，請確認。');
  }

  if (protein > 120) {
    warnings.push('蛋白質高於 120g，請確認。');
  }

  if (carbs > 250) {
    warnings.push('碳水高於 250g，請確認。');
  }

  if (fat > 120) {
    warnings.push('脂肪高於 120g，請確認。');
  }

  if (macroEnergy > 0 && Math.abs(macroEnergy - calories) > Math.max(120, calories * 0.25)) {
    warnings.push('熱量與 P/C/F 換算值落差過大。');
  }

  if (hasSheetValue(correction.calories) &&
    Math.abs(calories - Number(correction.calories)) > Math.max(80, Number(correction.calories) * 0.2)) {
    warnings.push('指定熱量與營養素互相矛盾，系統推導後熱量已明顯偏離你輸入的熱量。');
  }

  return warnings;
}

function formatCorrectionWarningReply(meal, nutrition, warnings) {
  var before = nutrition.before || meal._beforeNutrition || {};
  var after = {
    calories: nutrition.calories,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat
  };

  return [
    '這次修正可能異常，先不寫入。',
    '',
    '餐點：' + (meal.meal_name || '未命名餐點'),
    '原本：' + Math.round(before.calories || 0) + ' kcal｜P ' + Math.round(before.protein || 0) + '｜C ' + Math.round(before.carbs || 0) + '｜F ' + Math.round(before.fat || 0),
    '將改為：' + Math.round(after.calories) + ' kcal｜P ' + Math.round(after.protein) + '｜C ' + Math.round(after.carbs) + '｜F ' + Math.round(after.fat),
    '',
    '警告：',
    warnings.map(function (warning) {
      return '- ' + warning;
    }).join('\n'),
    '',
    '回覆「確認」套用，或回覆「取消」放棄。'
  ].join('\n');
}

function pendingExpiresAt(config) {
  var expires = new Date(Date.now() + 10 * 60 * 1000);
  return formatTaipeiDateTime(expires, config);
}

function matchFirstNumber(text, patterns) {
  for (var index = 0; index < patterns.length; index += 1) {
    var match = patterns[index].exec(text);

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function hasAnyMealCorrection(correction) {
  return hasSheetValue(correction.calories) ||
    hasSheetValue(correction.protein) ||
    hasSheetValue(correction.carbs) ||
    hasSheetValue(correction.fat);
}

function parseBodyMetricsText(text) {
  var metrics = {
    source_name: '文字輸入',
    weight_kg: parseMetricValue(text, ['體重', '重量', 'weight', 'wt']),
    body_fat_percent: parseMetricValue(text, ['體脂率', '體脂', 'body fat', 'bf']),
    muscle_mass_kg: parseMetricValue(text, ['骨骼肌重', '骨骼肌量', '骨骼肌', '肌肉量', 'muscle']),
    bmi: parseMetricValue(text, ['BMI', 'bmi']),
    visceral_fat: parseMetricValue(text, ['內臟脂肪', 'visceral fat']),
    basal_metabolic_rate_kcal: parseMetricValue(text, ['基礎代謝', '基代', 'BMR', 'bmr']),
    body_age: parseMetricValue(text, ['身體年齡', '體年齡', 'body age']),
    water_percent: parseMetricValue(text, ['水分率', '體水分', 'water']),
    bone_mass_kg: parseMetricValue(text, ['骨量', 'bone mass']),
    inbody_score: parseMetricValue(text, ['InBody分數', 'inbody分數', 'InBody', 'inbody']),
    confidence: 'high',
    uncertainty_factors: [],
    raw_notes: text
  };

  if (!hasAnyBodyMetric(metrics)) {
    return null;
  }

  return metrics;
}

function parseMetricValue(text, labels) {
  for (var index = 0; index < labels.length; index += 1) {
    var escaped = labels[index].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var regex = new RegExp(escaped + '\\s*[:：=]?\\s*(\\d+(?:\\.\\d+)?)', 'i');
    var match = regex.exec(text);

    if (match) {
      return Number(match[1]);
    }
  }

  return '';
}

function hasAnyBodyMetric(metrics) {
  return Boolean(
    metrics.weight_kg ||
    metrics.body_fat_percent ||
    metrics.muscle_mass_kg ||
    metrics.bmi ||
    metrics.visceral_fat ||
    metrics.basal_metabolic_rate_kcal ||
    metrics.body_age ||
    metrics.water_percent ||
    metrics.bone_mass_kg ||
    metrics.inbody_score
  );
}

function formatBodyMetricReply(metrics, previous) {
  var lines = ['已記錄身體數據'];
  var metricLines = formatBodyMetricLines(metrics);

  if (metricLines.length) {
    lines = lines.concat(metricLines);
  }

  var changes = formatBodyMetricChanges(metrics, previous);

  if (changes.length) {
    lines.push('');
    lines.push('與上一筆相比：');
    lines = lines.concat(changes);
  }

  if (metrics.uncertainty_factors && metrics.uncertainty_factors.length) {
    lines.push('');
    lines.push('注意：' + metrics.uncertainty_factors.join('；'));
  }

  lines.push('');
  lines.push('可回覆：今日總結，或繼續傳體重機 / InBody 照片');
  return lines.join('\n');
}

function formatBodyMetricLines(metrics) {
  var lines = [];
  pushMetricLine(lines, '體重', metrics.weight_kg, 'kg');
  pushMetricLine(lines, '體脂', metrics.body_fat_percent, '%');
  pushMetricLine(lines, '骨骼肌', metrics.muscle_mass_kg, 'kg');
  pushMetricLine(lines, 'BMI', metrics.bmi, '');
  pushMetricLine(lines, '內臟脂肪', metrics.visceral_fat, '');
  pushMetricLine(lines, '基礎代謝', metrics.basal_metabolic_rate_kcal, 'kcal');
  pushMetricLine(lines, '身體年齡', metrics.body_age, '歲');
  pushMetricLine(lines, '水分率', metrics.water_percent, '%');
  pushMetricLine(lines, '骨量', metrics.bone_mass_kg, 'kg');
  pushMetricLine(lines, 'InBody 分數', metrics.inbody_score, '');
  return lines;
}

function pushMetricLine(lines, label, value, unit) {
  if (value !== '' && value !== undefined && value !== null) {
    lines.push(label + '：' + value + (unit ? ' ' + unit : ''));
  }
}

function formatBodyMetricChanges(metrics, previous) {
  if (!previous) {
    return [];
  }

  var lines = [];
  pushMetricChange(lines, '體重', metrics.weight_kg, previous.weight_kg, 'kg');
  pushMetricChange(lines, '體脂', metrics.body_fat_percent, previous.body_fat_percent, '%');
  pushMetricChange(lines, '骨骼肌', metrics.muscle_mass_kg, previous.muscle_mass_kg, 'kg');
  return lines;
}

function pushMetricChange(lines, label, current, previous, unit) {
  var currentNumber = Number(current);
  var previousNumber = Number(previous);

  if (!isFinite(currentNumber) || !isFinite(previousNumber)) {
    return;
  }

  var diff = Math.round((currentNumber - previousNumber) * 10) / 10;
  var sign = diff > 0 ? '+' : '';
  lines.push(label + '：' + sign + diff + (unit ? ' ' + unit : ''));
}

function formatDailySummaryReply(summary) {
  if (summary.mealCount === 0) {
    return [
      '今日尚無餐點紀錄。',
      '熱量：約 0 / ' + summary.targetCalories + ' kcal',
      '蛋白質：約 0 / ' + summary.proteinTarget + ' g'
    ].join('\n');
  }

  return [
    '今日進度',
    '',
    '熱量：' + Math.round(summary.totalCalories) + ' / ' + summary.targetCalories + ' kcal',
    formatCalorieGap(summary),
    '',
    '蛋白質：' + Math.round(summary.totalProtein) + ' / ' + summary.proteinTarget + ' g',
    formatProteinGap(summary),
    '',
    '已記錄：' + summary.mealCount + ' 餐'
  ].join('\n');
}

function formatCompactDailyProgress(summary) {
  return [
    '今日：' + Math.round(summary.totalCalories) + ' / ' + summary.targetCalories + ' kcal',
    '蛋白質：' + Math.round(summary.totalProtein) + ' / ' + summary.proteinTarget + ' g'
  ].join('\n');
}

function formatCorrectionReply(meal, correction, summary) {
  var before = meal._beforeNutrition || {
    calories: toNumber(meal.ai_calories, 0),
    protein: toNumber(meal.protein_g, 0),
    carbs: toNumber(meal.carbs_g, 0),
    fat: toNumber(meal.fat_g, 0)
  };
  var after = meal._afterNutrition || {
    calories: toNumber(meal.corrected_calories, 0),
    protein: toNumber(meal.protein_g, 0),
    carbs: toNumber(meal.carbs_g, 0),
    fat: toNumber(meal.fat_g, 0)
  };
  var lines = [
    '已修正上一筆：' + (meal.meal_name || '未命名餐點'),
    '熱量：' + Math.round(before.calories) + ' → ' + Math.round(after.calories) + ' kcal',
    'P：' + Math.round(before.protein) + ' → ' + Math.round(after.protein) + 'g｜C：' + Math.round(before.carbs) + ' → ' + Math.round(after.carbs) + 'g｜F：' + Math.round(before.fat) + ' → ' + Math.round(after.fat) + 'g'
  ];

  if (meal._correctionMeta && meal._correctionMeta.length) {
    lines.push('調整：' + meal._correctionMeta.join('；'));
  }

  lines.push('');
  lines.push(formatCompactDailyProgress(summary));
  lines.push(formatCalorieGap(summary));
  return lines.join('\n');
}

function formatCancelReply(meal, summary) {
  var lines = [
    '已刪除：' + (meal.meal_name || '未命名餐點'),
    '已從 Google Sheet 移除，並嘗試刪除 Drive 圖片。',
    '',
    formatCompactDailyProgress(summary),
    formatCalorieGap(summary)
  ];

  if (meal._driveDeleteError) {
    lines.push('');
    lines.push('注意：Sheet 已刪除，但 Drive 圖片刪除失敗。');
  }

  return lines.join('\n');
}

function formatCalorieGap(summary) {
  var gap = Math.round(summary.targetCalories - summary.totalCalories);
  return gap >= 0 ? '剩餘：約 ' + gap + ' kcal' : '超出：約 ' + Math.abs(gap) + ' kcal';
}

function formatProteinGap(summary) {
  var gap = Math.round(summary.proteinTarget - summary.totalProtein);
  return gap >= 0 ? '還差：約 ' + gap + ' g' : '超出：約 ' + Math.abs(gap) + ' g';
}

function formatHelpReply() {
  return [
    '我可以幫你記錄飲食：',
    '',
    '傳餐點照片：估算並記錄',
    '傳營養標示：直接讀表格並記錄',
    '傳體重機 / InBody 照片：記錄身體數據',
    '體重 72.5 體脂 18.3 骨骼肌 32.1：文字記錄身體數據',
    '今日：查看今天累計',
    '本週總結：建立週趨勢 Markdown',
    '修正學習：整理個人化 FoodRules 建議',
    '改成 850：修正上一筆熱量',
    '不記錄：刪除上一筆',
    '今日總結：建立今日 Markdown'
  ].join('\n');
}

function translateConfidence(confidence) {
  if (confidence === 'high') return '高';
  if (confidence === 'low') return '低';
  return '中';
}
