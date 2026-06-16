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
    status: 'active',
    rule_matches: (estimate.rule_matches || []).join('；'),
    risk_tags: (estimate.risk_tags || []).join('；'),
    adjustment_reasons: (estimate.adjustment_reasons || []).join('；')
  }, config);

  var summary = calculateDailySummary(userId, date, config);
  upsertDailySummary(summary, config);
  var mealFallbackText = formatMealEstimateReply(estimate, summary);
  replyMealEstimateFlex(event.replyToken, estimate, summary, mealFallbackText, config);
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
  var labelMealName = buildNutritionLabelMealName(label);

  appendMealLog({
    id: createUuid(),
    timestamp: timestamp,
    date: date,
    user_id: userId,
    line_message_id: messageId,
    drive_file_id: driveFile.fileId,
    drive_url: driveFile.driveUrl,
    meal_name: labelMealName,
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
    status: 'active',
    rule_matches: '',
    risk_tags: '',
    adjustment_reasons: ''
  }, config);

  var summary = calculateDailySummary(userId, date, config);
  upsertDailySummary(summary, config);
  var nutritionFallbackText = formatNutritionLabelReply(label, summary);
  replyMealEstimateFlex(event.replyToken, buildNutritionLabelEstimate(label, labelMealName), summary, nutritionFallbackText, config);
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

    if (typeof isTransientGeminiError === 'function' && isTransientGeminiError(error)) {
      replyToLine(event.replyToken, [
        '體重機照片已收到，但 Gemini 目前忙碌，暫時無法讀取。',
        '',
        '可以稍後重傳照片，或直接輸入：',
        '體重 75.3',
        '',
        '如果還有體脂、骨骼肌，也可以一起輸入：',
        '體重 75.3 體脂 18.3 骨骼肌 32.1'
      ].join('\n'), config);
      appendSystemEvent({
        timestamp: timestamp,
        user_id: userId,
        message_type: 'image',
        event_type: event.type,
        action_taken: 'parse_body_metric_transient_failure',
        success: false,
        error: error.stack || error.message || String(error),
        raw_event: stringifyJson(event)
      }, config);
      return;
    }

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

  if (handleRichMenuEntryCommand(event, config, userId, text, timestamp, date)) {
    return;
  }

  if (isConfirmPendingCommand(text)) {
    handlePendingMealCorrectionConfirmation(event, config, userId, timestamp, date);
    return;
  }

  if (isCancelPendingCommand(text)) {
    clearPendingActions(userId, 'meal_correction', config);
    replyToLine(event.replyToken, '已取消待確認的餐點修正。', config);
    return;
  }

  if (isUndoCommand(text)) {
    var undoResult = undoLastAction(userId, config);

    if (!undoResult) {
      replyToLine(event.replyToken, '目前沒有可以復原的上一動作。', config);
      return;
    }

    var undoDate = undoResult.meal.date || date;
    var undoSummary = calculateDailySummary(userId, undoDate, config);
    upsertDailySummary(undoSummary, config);
    replyToLine(event.replyToken, formatUndoReply(undoResult, undoSummary), config);
    appendSystemEvent({
      timestamp: timestamp,
      user_id: userId,
      message_type: 'text',
      event_type: event.type,
      action_taken: 'undo_last_action',
      success: true,
      error: '',
      raw_event: stringifyJson(event)
    }, config);
    return;
  }

  if (isDailySummaryCommand(text)) {
    var summary = calculateDailySummary(userId, date, config);
    upsertDailySummary(summary, config);
    var dailyFallbackText = formatDailySummaryReply(summary);
    replyDailySummaryFlex(event.replyToken, summary, dailyFallbackText, config);
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

  if (isRecordMealCommand(text)) {
    replyToLine(event.replyToken, formatRecordMealGuideReply(), config);
    appendSystemEvent({
      timestamp: timestamp,
      user_id: userId,
      message_type: 'text',
      event_type: event.type,
      action_taken: 'guide_record_meal',
      success: true,
      error: '',
      raw_event: stringifyJson(event)
    }, config);
    return;
  }

  if (isRecordBodyCommand(text)) {
    replyToLine(event.replyToken, formatRecordBodyGuideReply(), config);
    appendSystemEvent({
      timestamp: timestamp,
      user_id: userId,
      message_type: 'text',
      event_type: event.type,
      action_taken: 'guide_record_body',
      success: true,
      error: '',
      raw_event: stringifyJson(event)
    }, config);
    return;
  }

  if (isApiUsageCommand(text)) {
    var apiUsage = getApiUsageSummary(date, config);
    replyToLine(event.replyToken, formatApiUsageReply(apiUsage), config);
    appendSystemEvent({
      timestamp: timestamp,
      user_id: userId,
      message_type: 'text',
      event_type: event.type,
      action_taken: 'api_usage_summary',
      success: true,
      error: '',
      raw_event: stringifyJson(event)
    }, config);
    return;
  }

  if (isAiCoachCommand(text)) {
    handleAiCoachCommand(event, config, userId, timestamp, date, 'coach_entry');
    return;
  }

  if (isWeeklyMemoryCommand(text)) {
    var instantWeeklySummary = generateInstantWeeklySummary(userId, date, config);
    appendApiUsage({
      timestamp: timestamp,
      model: config.geminiModel,
      task_type: 'instant_weekly_summary',
      input_tokens: instantWeeklySummary.usage.inputTokens,
      output_tokens: instantWeeklySummary.usage.outputTokens,
      estimated_cost_usd: instantWeeklySummary.usage.estimatedCostUsd,
      line_message_id: event.message.id,
      success: instantWeeklySummary.usage.success,
      error: instantWeeklySummary.usage.error || ''
    }, config);
    replyInstantWeeklySummaryFlex(
      event.replyToken,
      instantWeeklySummary,
      formatInstantWeeklySummaryFallbackText(instantWeeklySummary),
      config
    );
    appendSystemEvent({
      timestamp: timestamp,
      user_id: userId,
      message_type: 'text',
      event_type: event.type,
      action_taken: 'instant_weekly_summary',
      success: true,
      error: '',
      raw_event: stringifyJson(event)
    }, config);
    return;
  }

  if (isCorrectionLearningCommand(text)) {
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

  if (shouldTryAiMealCorrectionParser(text) &&
    (!mealCorrection || shouldEscalateParsedMealCorrectionToAi(text, mealCorrection))) {
    mealCorrection = mergeMealCorrections(
      mealCorrection,
      parseMealCorrectionTextWithAi(text, event, config, timestamp)
    );
  }

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

  if (isCancelLastMealCommand(text)) {
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

  if (isDailyMemoryCommand(text)) {
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

function handleRichMenuEntryCommand(event, config, userId, text, timestamp, date) {
  if (!isExactRichMenuCommand(text)) {
    return false;
  }

  if (isRecordBodyCommand(text)) {
    replyToLine(event.replyToken, formatRecordBodyGuideReply(), config);
    appendTextCommandEvent(timestamp, userId, event, 'rich_menu_record_body', true, '', config);
    return true;
  }

  if (isRecordMealCommand(text)) {
    replyToLine(event.replyToken, formatRecordMealGuideReply(), config);
    appendTextCommandEvent(timestamp, userId, event, 'rich_menu_record_meal', true, '', config);
    return true;
  }

  if (isApiUsageCommand(text)) {
    var apiUsage = getApiUsageSummary(date, config);
    replyToLine(event.replyToken, formatApiUsageReply(apiUsage), config);
    appendTextCommandEvent(timestamp, userId, event, 'rich_menu_api_usage', true, '', config);
    return true;
  }

  if (isAiCoachCommand(text)) {
    handleAiCoachCommand(event, config, userId, timestamp, date, 'rich_menu_ai_coach');
    return true;
  }

  return false;
}

function isExactRichMenuCommand(text) {
  return matchesCompactCommand(text, [
    '記體重',
    '記飲食',
    'API額度',
    'AI教練'
  ]);
}

function appendTextCommandEvent(timestamp, userId, event, actionTaken, success, error, config) {
  appendSystemEvent({
    timestamp: timestamp,
    user_id: userId,
    message_type: 'text',
    event_type: event.type,
    action_taken: actionTaken,
    success: success,
    error: error || '',
    raw_event: stringifyJson(event)
  }, config);
}

function handleAiCoachCommand(event, config, userId, timestamp, date, actionTaken) {
  var summary = calculateDailySummary(userId, date, config);
  var logs = getActiveMealLogsByDate(userId, date, config);
  var profile = getUserProfile(userId, config) || {};
  var replyText = '';
  var usedFallback = false;

  upsertDailySummary(summary, config);

  if (summary.mealCount === 0) {
    replyText = formatCoachEntryReply(summary);
    usedFallback = true;
  } else {
    try {
      var coachResult = callGeminiForCoachAdvice({
        date: date,
        summary: summary,
        logs: logs,
        profile: profile
      }, config);
      appendApiUsage({
        timestamp: timestamp,
        model: config.geminiModel,
        task_type: 'coach_advice',
        input_tokens: coachResult.inputTokens,
        output_tokens: coachResult.outputTokens,
        estimated_cost_usd: coachResult.estimatedCostUsd,
        line_message_id: event.message.id,
        success: true,
        error: ''
      }, config);
      replyText = formatGeminiCoachReply(summary, coachResult.text);
    } catch (error) {
      appendApiUsage({
        timestamp: timestamp,
        model: config.geminiModel,
        task_type: 'coach_advice',
        input_tokens: 0,
        output_tokens: 0,
        estimated_cost_usd: 0,
        line_message_id: event.message.id,
        success: false,
        error: error.message || String(error)
      }, config);
      replyText = formatCoachFallbackReply(summary);
      usedFallback = true;
    }
  }

  replyToLine(event.replyToken, replyText, config);
  appendTextCommandEvent(timestamp, userId, event, actionTaken, true, usedFallback ? 'coach_fallback_used' : '', config);
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
  var reminder = buildPostMealReminder({
    calories: estimate.total.calories_kcal,
    protein: estimate.total.protein_g,
    carbs: estimate.total.carbs_g,
    fat: estimate.total.fat_g,
    confidence: estimate.confidence,
    sourceType: 'meal_photo'
  }, summary);

  return [
    '已記錄：' + estimate.meal_name,
    '約 ' + estimate.total.calories_kcal + ' kcal｜P ' + estimate.total.protein_g + 'g｜C ' + estimate.total.carbs_g + 'g｜F ' + estimate.total.fat_g + 'g',
    '信心：' + translateConfidence(estimate.confidence),
    '',
    formatCompactDailyProgress(summary),
    '',
    reminder,
    '',
    '可回覆：改700、改700 P30、不記錄、今日'
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
  lines.push(buildPostMealReminder({
    calories: label.total.calories_kcal,
    protein: label.total.protein_g,
    carbs: label.total.carbs_g,
    fat: label.total.fat_g,
    confidence: label.confidence,
    servingBasis: label.serving_basis,
    sourceType: 'nutrition_label'
  }, summary));
  lines.push('');
  lines.push('可回覆：改700、改700 P30、不記錄、今日');
  return lines.join('\n');
}

function buildNutritionLabelEstimate(label, labelMealName) {
  return {
    meal_name: labelMealName || buildNutritionLabelMealName(label),
    total: {
      calories_kcal: label.total.calories_kcal,
      protein_g: label.total.protein_g,
      carbs_g: label.total.carbs_g,
      fat_g: label.total.fat_g
    },
    confidence: label.confidence,
    uncertainty_factors: label.uncertainty_factors || [],
    sourceType: 'nutrition_label',
    servingBasis: label.serving_basis,
    servingSize: label.serving_size || '',
    servingsPerPackage: label.servings_per_package || 0
  };
}

function buildNutritionLabelMealName(label) {
  var productName = String(label && label.product_name ? label.product_name : '').trim();

  if (!productName || productName.toLowerCase() === 'unknown') {
    productName = '營養標示食品';
  }

  return '營養標示：' + productName;
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

function compactCommandText(text) {
  return String(text || '')
    .trim()
    .replace(/[\s\u00a0\u3000\u200b-\u200d\ufeff]/g, '')
    .toLowerCase();
}

function matchesCompactCommand(text, commands) {
  var compact = compactCommandText(text);

  for (var index = 0; index < commands.length; index += 1) {
    if (compact === compactCommandText(commands[index])) {
      return true;
    }
  }

  return false;
}

function isConfirmPendingCommand(text) {
  return matchesCompactCommand(text, [
    '確認',
    '確認修改',
    '確定',
    '確定修改',
    '套用',
    '套用修改',
    '可以',
    '沒問題',
    '對',
    '是',
    '是的',
    'yes',
    'ok'
  ]);
}

function isCancelPendingCommand(text) {
  return matchesCompactCommand(text, [
    '取消',
    '取消修改',
    '取消確認',
    '不要改',
    '先不要',
    '算了',
    '不用了',
    'no'
  ]);
}

function isUndoCommand(text) {
  return matchesCompactCommand(text, [
    '復原',
    '還原',
    '復原上一步',
    '還原上一步',
    '復原上一個動作',
    '還原上一個動作',
    '復原上一筆操作',
    '還原上一筆操作',
    '上一步',
    '上一動',
    '回上一步',
    'undo',
    'ctrlz',
    'ctrl+z'
  ]);
}

function isDailySummaryCommand(text) {
  return matchesCompactCommand(text, [
    '今日',
    '今天',
    '今日累計',
    '今天累計',
    '查今日',
    '查今天',
    '今日紀錄',
    '今天紀錄',
    '今日統計',
    '今天統計',
    '今日狀態',
    '今天狀態',
    '今日進度',
    '今天進度',
    '今日吃多少',
    '今天吃多少',
    '目前累計',
    'today'
  ]);
}

function isRecordMealCommand(text) {
  return matchesCompactCommand(text, [
    '記飲食',
    '記餐',
    '記錄飲食',
    '紀錄飲食',
    '記錄餐點',
    '紀錄餐點',
    '我要記飲食',
    '我要記餐',
    '傳餐點',
    '拍餐點'
  ]);
}

function isRecordBodyCommand(text) {
  return matchesCompactCommand(text, [
    '記體重',
    '記錄體重',
    '紀錄體重',
    '記身體',
    '記錄身體',
    '紀錄身體',
    '身體數據',
    '體重記錄',
    '體重紀錄'
  ]);
}

function isApiUsageCommand(text) {
  return matchesCompactCommand(text, [
    'API額度',
    'API用量',
    'API使用量',
    'api額度',
    'api用量',
    'api使用量',
    '費用',
    '成本',
    '今日成本'
  ]);
}

function isAiCoachCommand(text) {
  return matchesCompactCommand(text, [
    'AI教練',
    'ai教練',
    '請問AI教練',
    '問AI教練',
    '教練',
    '飲食教練',
    '今天怎麼吃',
    '晚餐怎麼吃'
  ]);
}

function isWeeklyMemoryCommand(text) {
  return matchesCompactCommand(text, [
    '本週總結',
    '本周總結',
    '週總結',
    '周總結',
    '這週總結',
    '這周總結',
    '本週回顧',
    '本周回顧',
    '週回顧',
    '周回顧',
    '週報',
    '周報',
    '產生本週記憶',
    '產生本周記憶',
    '建立本週記憶',
    '建立本周記憶'
  ]);
}

function isCorrectionLearningCommand(text) {
  return matchesCompactCommand(text, [
    '修正學習',
    '個人化修正學習',
    '整理修正',
    '整理修正紀錄',
    '修正紀錄',
    '修正分析',
    '建立修正學習',
    '產生修正學習',
    'foodrules建議',
    'foodrule建議',
    '食物規則建議',
    '飲食規則建議'
  ]);
}

function isDailyMemoryCommand(text) {
  return matchesCompactCommand(text, [
    '今日總結',
    '今天總結',
    '每日總結',
    '日總結',
    '今日回顧',
    '今天回顧',
    '產生今日記憶',
    '產生今天記憶',
    '建立今日記憶',
    '建立今天記憶',
    '今日md',
    '今天md',
    '今日markdown',
    '今天markdown'
  ]);
}

function isCancelLastMealCommand(text) {
  if (matchesCompactCommand(text, [
    '不記錄',
    '不紀錄',
    '取消上一筆',
    '刪除上一筆',
    '刪上一筆',
    '刪掉上一筆',
    '移除上一筆',
    '上一筆不記錄',
    '上一筆不紀錄',
    '上一筆不算',
    '這筆不記錄',
    '這筆不紀錄',
    '這筆不算',
    '這筆不要記',
    '剛剛那筆不記錄',
    '剛剛那筆不紀錄',
    '剛剛那筆不算',
    '剛剛那筆不要',
    '剛才那筆不要',
    '最後一筆不要',
    '最後一筆不算',
    '取消這筆',
    '刪除這筆',
    '刪掉這筆'
  ])) {
    return true;
  }

  var compact = compactCommandText(text);
  var hasTarget = /(上一筆|這筆|剛剛|剛才|上一餐|這餐|最後一筆)/.test(compact);
  var hasCancelVerb = /(不記錄|不紀錄|不要記|別記|不算|取消|刪除|刪掉|移除)/.test(compact);
  return hasTarget && hasCancelVerb;
}

function shouldTryAiMealCorrectionParser(text) {
  var normalizedText = normalizeMealCorrectionCommandText(text);

  if (!/\d/.test(normalizedText)) {
    return false;
  }

  if (normalizedText.length > 80) {
    return false;
  }

  return /(這餐|這筆|上一筆|剛剛|剛才|應該|大概|大約|差不多|左右|抓|算|估|記|當作|改|修|調|熱量|卡|大卡|kcal|蛋白|蛋白質|碳水|脂肪|油脂|\bP\b|\bC\b|\bF\b)/i.test(normalizedText);
}

function shouldEscalateParsedMealCorrectionToAi(text, correction) {
  var normalizedText = normalizeMealCorrectionCommandText(text);
  var lockMacros = parseLockedMacroFields(normalizedText);

  if (lockMacros.calories && !correction.lockCalories) {
    return true;
  }

  if (lockMacros.protein && !correction.lockProtein && correction.protein === undefined) {
    return true;
  }

  if (lockMacros.carbs && !correction.lockCarbs && correction.carbs === undefined) {
    return true;
  }

  if (lockMacros.fat && !correction.lockFat && correction.fat === undefined) {
    return true;
  }

  if (/(不動|不用動|不要動|不變|維持|照舊|保持|不用改|不要改|不重算|不用重算|不要重算|別重算)/.test(normalizedText) &&
    !(correction.lockCalories || correction.lockProtein || correction.lockCarbs || correction.lockFat)) {
    return true;
  }

  if (/(其他|剩下|其餘).*(配合|調整|照.*熱量|照.*總熱量)|配合.*(熱量|總熱量)/.test(normalizedText) &&
    !correction.adjustRemainder) {
    return true;
  }

  return false;
}

function parseMealCorrectionTextWithAi(text, event, config, timestamp) {
  try {
    var result = callGeminiForMealCorrectionCommand(text, config);
    appendApiUsage({
      timestamp: timestamp,
      model: config.geminiModel,
      task_type: 'parse_correction_command',
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      estimated_cost_usd: result.estimatedCostUsd,
      line_message_id: event.message.id,
      success: Boolean(result.correction),
      error: result.correction ? '' : 'intent_not_meal_correction'
    }, config);
    return result.correction;
  } catch (error) {
    appendApiUsage({
      timestamp: timestamp,
      model: config.geminiModel,
      task_type: 'parse_correction_command',
      input_tokens: 0,
      output_tokens: 0,
      estimated_cost_usd: 0,
      line_message_id: event.message.id,
      success: false,
      error: error.message || String(error)
    }, config);
    return null;
  }
}

function mergeMealCorrections(localCorrection, aiCorrection) {
  if (!localCorrection) {
    return aiCorrection;
  }

  if (!aiCorrection) {
    return localCorrection;
  }

  var merged = {};
  copyMealCorrectionFields(merged, localCorrection, false);
  copyMealCorrectionFields(merged, aiCorrection, true);
  merged.lockCalories = Boolean(localCorrection.lockCalories || aiCorrection.lockCalories);
  merged.lockProtein = Boolean(localCorrection.lockProtein || aiCorrection.lockProtein);
  merged.lockCarbs = Boolean(localCorrection.lockCarbs || aiCorrection.lockCarbs);
  merged.lockFat = Boolean(localCorrection.lockFat || aiCorrection.lockFat);
  merged.adjustRemainder = Boolean(localCorrection.adjustRemainder || aiCorrection.adjustRemainder);
  merged.source = aiCorrection.source || localCorrection.source || 'local_command_parser';
  merged.parserConfidence = aiCorrection.parserConfidence || localCorrection.parserConfidence || '';
  merged.parserReason = aiCorrection.parserReason || localCorrection.parserReason || '';
  return merged;
}

function copyMealCorrectionFields(target, source, overwrite) {
  ['calories', 'protein', 'carbs', 'fat'].forEach(function (key) {
    if ((overwrite || target[key] === undefined) && hasSheetValue(source[key])) {
      target[key] = source[key];
    }
  });
}

function parseMealCorrectionText(text) {
  var normalizedText = normalizeMealCorrectionCommandText(text);
  var correction = {};
  var lockMacros = parseLockedMacroFields(normalizedText);
  var calories = matchFirstNumber(normalizedText, [
    /(?:^|[\s,，、;；|｜/])(?:改成|改為|改到|修正成|更正成|修成|調成|改|修|調)\s*(?:熱量|總熱量|calories?)?\s*(?:約|大約|大概|差不多)?\s*(\d+(?:\.\d+)?)/i,
    /(?:熱量|總熱量|calories?)\s*(?:改成|改為|改到|修正成|更正成|修成|調成|改|修|調|約|大約|大概|差不多|=|:|：)?\s*(\d+(?:\.\d+)?)/i,
    /(?:抓|算|估|記|當作|大概|差不多|應該|應該是|可能是)\s*(?:熱量|總熱量)?\s*(?:約|大約|大概|差不多)?\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*(?:kcal|卡|大卡)/i
  ]);
  var protein = matchFirstNumber(normalizedText, [
    /(?:^|[\s,，、;；|｜/])(?:改成|改為|改到|修正成|更正成|修成|調成|改|修|調)\s*(?:蛋白質|蛋白|protein|prot|p)\s*(?:約|大約|大概|差不多)?\s*(\d+(?:\.\d+)?)/i,
    /(?:蛋白質|蛋白|protein|prot)\s*(?:改成|改為|改到|修正成|更正成|修成|調成|改|修|調|約|大約|大概|有|=|:|：)?\s*(\d+(?:\.\d+)?)/i,
    /(?:蛋白質|蛋白|protein|prot)\s*(?:應該|應該是|可能|可能是|大概|大約|差不多|抓|算|估|記|當作|只有|大概只有|應該只有)\s*(\d+(?:\.\d+)?)/i,
    /(?:^|[\s,，、;；|｜/])p\s*(?:應該|應該是|可能|可能是|大概|大約|差不多|抓|算|估|記|當作|只有|大概只有|應該只有)?\s*(\d+(?:\.\d+)?)/i,
    /(?:^|[\s,，、;；|｜/])p\s*(?:改成|改為|改到|修正成|更正成|修成|調成|改|修|調|約|大約|大概|有|=|:|：)?\s*(\d+(?:\.\d+)?)/i
  ]);
  var carbs = matchFirstNumber(normalizedText, [
    /(?:^|[\s,，、;；|｜/])(?:改成|改為|改到|修正成|更正成|修成|調成|改|修|調)\s*(?:碳水|碳水化合物|carbs?|carbohydrates?|c)\s*(?:約|大約|大概|差不多)?\s*(\d+(?:\.\d+)?)/i,
    /(?:碳水|碳水化合物|carbs?|carbohydrates?)\s*(?:改成|改為|改到|修正成|更正成|修成|調成|改|修|調|約|大約|大概|有|=|:|：)?\s*(\d+(?:\.\d+)?)/i,
    /(?:碳水|碳水化合物|carbs?|carbohydrates?)\s*(?:應該|應該是|可能|可能是|大概|大約|差不多|抓|算|估|記|當作|只有|大概只有|應該只有)?\s*(\d+(?:\.\d+)?)/i,
    /(?:^|[\s,，、;；|｜/])c\s*(?:應該|應該是|可能|可能是|大概|大約|差不多|抓|算|估|記|當作|只有|大概只有|應該只有)?\s*(\d+(?:\.\d+)?)/i,
    /(?:^|[\s,，、;；|｜/])c\s*(?:改成|改為|改到|修正成|更正成|修成|調成|改|修|調|約|大約|大概|有|=|:|：)?\s*(\d+(?:\.\d+)?)/i
  ]);
  var fat = matchFirstNumber(normalizedText, [
    /(?:^|[\s,，、;；|｜/])(?:改成|改為|改到|修正成|更正成|修成|調成|改|修|調)\s*(?:脂肪|油脂|fat|f)\s*(?:約|大約|大概|差不多)?\s*(\d+(?:\.\d+)?)/i,
    /(?:脂肪|油脂|fat)\s*(?:改成|改為|改到|修正成|更正成|修成|調成|改|修|調|約|大約|大概|有|=|:|：)?\s*(\d+(?:\.\d+)?)/i,
    /(?:脂肪|油脂|fat)\s*(?:應該|應該是|可能|可能是|大概|大約|差不多|抓|算|估|記|當作|只有|大概只有|應該只有)?\s*(\d+(?:\.\d+)?)/i,
    /(?:^|[\s,，、;；|｜/])f\s*(?:應該|應該是|可能|可能是|大概|大約|差不多|抓|算|估|記|當作|只有|大概只有|應該只有)?\s*(\d+(?:\.\d+)?)/i,
    /(?:^|[\s,，、;；|｜/])f\s*(?:改成|改為|改到|修正成|更正成|修成|調成|改|修|調|約|大約|大概|有|=|:|：)?\s*(\d+(?:\.\d+)?)/i
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

  if (lockMacros.calories && correction.calories === undefined) {
    correction.lockCalories = true;
  }

  if (lockMacros.protein && correction.protein === undefined) {
    correction.lockProtein = true;
  }

  if (lockMacros.carbs && correction.carbs === undefined) {
    correction.lockCarbs = true;
  }

  if (lockMacros.fat && correction.fat === undefined) {
    correction.lockFat = true;
  }

  if (!hasAnyMealCorrection(correction)) {
    return null;
  }

  correction.adjustRemainder = /其他.*(配合|調整)|配合.*(熱量|總熱量)|剩下.*調整|其他.*照.*熱量|剩下.*照.*熱量/.test(normalizedText);
  return correction;
}

function normalizeMealCorrectionCommandText(text) {
  var normalized = String(text || '');

  try {
    normalized = normalized.normalize('NFKC');
  } catch (error) {
    // Older Apps Script runtimes may not support normalize.
  }

  return normalized
    .replace(/[，、；;]/g, ' ')
    .replace(/[｜|／/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseLockedMacroFields(text) {
  return {
    calories: /(?:熱量|總熱量|calories?|kcal|卡|大卡)\s*(?:不要動|不用動|不動|維持|照舊|保持|不要調|不用調|不變|不用改|不要改|不重算|不用重算|不要重算|別重算)|(?:不要動|不用動|不動|維持|照舊|保持|不變|不用改|不要改|不重算|不用重算|不要重算|別重算)\s*(?:熱量|總熱量|calories?|kcal|卡|大卡)/i.test(text),
    protein: /(?:蛋白質|蛋白|protein|prot|p)\s*(?:不要動|不用動|不動|維持|照舊|保持|不要調|不用調|不變|不用改|不要改)|(?:不要動|不用動|不動|維持|照舊|保持|不變|不用改|不要改)\s*(?:蛋白質|蛋白|protein|prot|p)/i.test(text),
    carbs: /(?:碳水|碳水化合物|carbs?|carbohydrates?|c)\s*(?:不要動|不用動|不動|維持|照舊|保持|不要調|不用調|不變|不用改|不要改)|(?:不要動|不用動|不動|維持|照舊|保持|不變|不用改|不要改)\s*(?:碳水|碳水化合物|carbs?|carbohydrates?|c)/i.test(text),
    fat: /(?:脂肪|油脂|fat|f)\s*(?:不要動|不用動|不動|維持|照舊|保持|不要調|不用調|不變|不用改|不要改)|(?:不要動|不用動|不動|維持|照舊|保持|不變|不用改|不要改)\s*(?:脂肪|油脂|fat|f)/i.test(text)
  };
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

  if (!correction.lockCalories &&
    macroEnergy > 0 &&
    Math.abs(macroEnergy - calories) > Math.max(120, calories * 0.25)) {
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

function formatInstantWeeklySummaryFallbackText(weeklySummary) {
  var trend = weeklySummary.trendSnapshot || {};
  var weekRange = weeklySummary.weekRange || {};
  var advice = String(weeklySummary.adviceText || '')
    .split(/\r?\n/)
    .map(function (line) {
      return line.replace(/^\s*(?:\d+[\.\、]|[-・•])\s*/, '').trim();
    })
    .filter(function (line) {
      return line;
    })
    .slice(0, 3);

  return [
    '本週即時總結',
    (weekRange.startDate || '') + ' - ' + (weekRange.endDate || ''),
    '',
    '紀錄：' + (trend.meal_count || 0) + ' 餐 / ' + (trend.logged_days || 0) + ' 天',
    '平均熱量：約 ' + (trend.avg_calories_per_logged_day || 0) + ' kcal / 日',
    '平均蛋白質：約 ' + (trend.avg_protein_per_logged_day || 0) + ' g / 日',
    '資料品質：修正 ' + (weeklySummary.correctedCount || 0) + '，低信心 ' + (weeklySummary.lowConfidenceCount || 0),
    '',
    '下週重點',
    advice.length ? advice.map(function (line, index) {
      return (index + 1) + '. ' + line;
    }).join('\n') : '1. 資料不足，先穩定記錄餐點。'
  ].join('\n');
}

function formatCompactDailyProgress(summary) {
  return [
    '今日：' + Math.round(summary.totalCalories) + ' / ' + summary.targetCalories + ' kcal',
    '蛋白質：' + Math.round(summary.totalProtein) + ' / ' + summary.proteinTarget + ' g'
  ].join('\n');
}

function buildPostMealReminder(record, summary) {
  var calories = Math.round(toNumber(record.calories, 0));
  var protein = Math.round(toNumber(record.protein, 0));
  var fat = Math.round(toNumber(record.fat, 0));
  var confidence = String(record.confidence || '').toLowerCase();
  var calorieGap = Math.round(summary.targetCalories - summary.totalCalories);
  var proteinGap = Math.round(summary.proteinTarget - summary.totalProtein);

  if (confidence === 'low') {
    return '提醒：這餐估算信心較低，建議用「改700 P30」修正熱量或蛋白質。';
  }

  if (record.sourceType === 'nutrition_label' && record.servingBasis === 'per_serving') {
    return '提醒：這筆是依營養標示每份記錄；如果你吃完整包，記得確認份數是否需要修正。';
  }

  if (summary.totalCalories > summary.targetCalories) {
    if (proteinGap > 20) {
      return '提醒：今天熱量已超過目標，但蛋白質還不足；後續優先選低脂蛋白，少油少醬。';
    }
    return '提醒：今天熱量已超過目標，後續以清淡、低油、低糖為主。';
  }

  if (calorieGap <= 250) {
    return '提醒：今天熱量已接近上限，下一餐建議控制油脂與份量。';
  }

  if (proteinGap > 35 && summary.mealCount >= 2) {
    return '提醒：目前蛋白質缺口偏大，下一餐優先補雞胸、蛋、魚、豆腐或瘦肉。';
  }

  if (calories >= 250 && protein < 15) {
    return '提醒：這餐蛋白質偏低，下一餐可以補一份蛋、豆腐、魚或瘦肉。';
  }

  if (fat >= 30 || (calories > 0 && fat * 9 >= calories * 0.45)) {
    return '提醒：這餐脂肪比例偏高，下一餐可以選清蒸、烤、滷、少醬的蛋白質。';
  }

  if (proteinGap > 15) {
    return '提醒：今天蛋白質還差一些，後續餐點記得保留蛋白質優先。';
  }

  return '提醒：目前進度可以，後續維持蛋白質優先並控制油脂即可。';
}

function formatRecordMealGuideReply() {
  return [
    '請直接傳餐點照片。',
    '',
    '我會估算熱量、蛋白質、碳水與脂肪，並寫入今日紀錄。',
    '',
    '如果是超商或包裝食品，也可以拍營養標示表，我會優先讀取標示上的數字。'
  ].join('\n');
}

function formatRecordBodyGuideReply() {
  return [
    '請傳體重機 / InBody 照片，或直接輸入身體數據。',
    '',
    '範例：',
    '體重 75.3',
    '體重 75.3 體脂 18.3 骨骼肌 32.1'
  ].join('\n');
}

function formatApiUsageReply(usage) {
  return [
    'API 使用量',
    '',
    '今日：' + usage.todayCalls + ' 次，成功 ' + usage.todaySuccessfulCalls + ' 次',
    '今日估計：$' + usage.todayEstimatedCostUsd.toFixed(6) + ' USD',
    '',
    '累計：' + usage.totalCalls + ' 次，成功 ' + usage.totalSuccessfulCalls + ' 次',
    '累計估計：$' + usage.totalEstimatedCostUsd.toFixed(6) + ' USD',
    '',
    '此成本為程式內估算，實際費用仍以 Google 後台為準。'
  ].join('\n');
}

function formatCoachEntryReply(summary) {
  var suggestions = buildCoachSuggestions(summary);
  var lines = [
    'AI 教練',
    '',
    '目前今日狀態：',
    '熱量：' + Math.round(summary.totalCalories) + ' / ' + summary.targetCalories + ' kcal',
    '蛋白質：' + Math.round(summary.totalProtein) + ' / ' + summary.proteinTarget + ' g',
    '碳水：' + Math.round(summary.totalCarbs) + ' g',
    '脂肪：' + Math.round(summary.totalFat) + ' g',
    '',
    '建議：'
  ];

  suggestions.forEach(function (suggestion) {
    lines.push(suggestion);
  });

  return lines.join('\n');
}

function formatGeminiCoachReply(summary, coachText) {
  return [
    'AI 教練',
    '',
    '今日狀態：' + Math.round(summary.totalCalories) + ' / ' + summary.targetCalories + ' kcal，P ' + Math.round(summary.totalProtein) + ' / ' + summary.proteinTarget + ' g',
    '',
    sanitizeCoachText(coachText)
  ].join('\n');
}

function formatCoachFallbackReply(summary) {
  return [
    'AI 教練',
    '',
    'Gemini 暫時無法產生建議，先用目前規則判斷：',
    '',
    formatCoachEntryReply(summary)
  ].join('\n');
}

function sanitizeCoachText(text) {
  var cleaned = String(text || '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .trim();

  if (!cleaned) {
    return '目前資料不足，先維持蛋白質優先，並控制油脂與份量。';
  }

  var lines = cleaned.split(/\r?\n/).map(function (line) {
    return line.trim();
  }).filter(function (line) {
    return line;
  });

  return lines.slice(0, 8).join('\n');
}

function buildCoachSuggestions(summary) {
  var calorieGap = Math.round(summary.targetCalories - summary.totalCalories);
  var proteinGap = Math.round(summary.proteinTarget - summary.totalProtein);
  var suggestions = [];

  if (summary.mealCount === 0) {
    suggestions.push('今天還沒有餐點紀錄，先傳一張餐點照片或營養標示，我再依照當天狀態給建議。');
    return suggestions;
  }

  if (calorieGap <= 0 && proteinGap > 20) {
    suggestions.push('今天熱量已經接近或超過目標，但蛋白質還差比較多，下一餐建議以低脂蛋白為主，例如雞胸、魚、蛋白、豆腐。');
    return suggestions;
  }

  if (calorieGap <= 0) {
    suggestions.push('今天熱量已經接近或超過目標，後續盡量選低油、低糖、份量小的食物。');
    return suggestions;
  }

  if (proteinGap > 35) {
    suggestions.push('今天蛋白質缺口偏大，下一餐優先補蛋白質，再補適量主食。');
    suggestions.push('可選：雞胸、魚、蛋、豆腐、瘦肉，避免用高油炸物補蛋白質。');
    return suggestions;
  }

  if (proteinGap > 15) {
    suggestions.push('今天蛋白質還差一些，下一餐可以加一份蛋、豆腐、魚或瘦肉。');
    return suggestions;
  }

  if (calorieGap > 600) {
    suggestions.push('今天熱量空間還夠，可以正常吃一餐，但建議保留蛋白質優先。');
    return suggestions;
  }

  suggestions.push('目前進度大致可以，下一餐控制油脂與份量，蛋白質維持穩定即可。');
  return suggestions;
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

function formatUndoReply(result, summary) {
  var meal = result.meal || {};
  var actionText = result.actionType === 'delete_meal' ? '刪除上一筆' : '修正上一筆';
  var lines = [
    '已復原：' + actionText,
    '餐點：' + (meal.meal_name || '未命名餐點'),
    '熱量：' + Math.round(getEffectiveMealCalories(meal)) + ' kcal',
    '',
    '今日：' + Math.round(summary.totalCalories) + ' / ' + summary.targetCalories + ' kcal',
    '蛋白質：' + Math.round(summary.totalProtein) + ' / ' + summary.proteinTarget + ' g',
    formatCalorieGap(summary)
  ];

  if (meal._driveRestoreError) {
    lines.push('');
    lines.push('注意：Sheet 已復原，但 Drive 圖片復原失敗。');
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
    '我還沒理解這句。',
    '',
    '你可以：',
    '傳餐點照片',
    '傳營養標示照片',
    '傳體重機 / InBody 照片',
    '輸入：今日、本週總結、API額度、AI教練',
    '修正：改850、改成 850 P30 C70',
    '刪除：不記錄、這筆不算',
    '復原：復原、undo'
  ].join('\n');
}

function translateConfidence(confidence) {
  if (confidence === 'high') return '高';
  if (confidence === 'low') return '低';
  return '中';
}
