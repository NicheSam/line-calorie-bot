function callGeminiForMealEstimate(imageBlob, config, foodRules) {
  var rules = Array.isArray(foodRules) ? foodRules : [];
  var prompt = [
    '你是私人飲食紀錄 Bot 的營養估算器。',
    '請根據單張餐點照片粗估熱量與三大營養素，回傳繁體中文 JSON。',
    '不要假裝精準；照片看不出份量、油量、醬料時，請提高 uncertainty_factors 並降低 confidence。',
    '所有數字使用合理估算值，單位為 kcal 或 g。',
    '估算前必須先判斷份量情境：tiny=一口/單顆/極少量，small=試吃/小碗/小紙盤/少量切塊，normal=一般一人份，large=大份或多人份，unknown=看不出。',
    '如果照片像試吃、餐會夾取、小碗少量、手持小紙盤、局部特寫、只剩幾塊肉或單顆點心，請優先標記 portion_size_class 為 tiny 或 small，serving_context 為 tasting 或 snack，並以可見可食重量估算，不要套完整主餐份量。',
    '看到雞腿、炸雞、烤鴨、蛋糕、捲餅等高熱量食物時，仍必須先看可見份量；少量或切塊不得直接使用完整一份主餐、完整一支雞腿或完整套餐的熱量。',
    '請務必先拆成 items，再加總 total。常見基準：熟雞腿肉每 100g 約 200-230 kcal、蛋白質 24-27g、脂肪 10-14g；熟雞胸肉每 100g 約 160-180 kcal、蛋白質 30-33g、脂肪 3-5g；非澱粉蔬菜每 100g 約 20-50 kcal、碳水 4-10g。',
    '如果照片中有明顯雞肉、雞腿、豬肉、牛肉、魚、蛋、豆腐等蛋白質主菜，整餐蛋白質通常不應低於 15g，除非份量極少，且必須在 uncertainty_factors 說明。',
    '如果照片中沒有白飯、麵、麵包、馬鈴薯、地瓜、玉米等明顯澱粉主食，整餐碳水通常不應高於 35g，除非醬料或裹粉明顯。',
    '若照片食物命中下列 FoodRules，請優先參考規則中的每單位營養值估算，並推估單位數量。',
    formatFoodRulesForPrompt(rules),
    '只能輸出 JSON，不要輸出 Markdown。',
    'JSON 必須使用以下英文欄位名稱：',
    '{"meal_name":"string","portion_size_class":"tiny|small|normal|large|unknown","serving_context":"tasting|snack|meal|shared|unknown","estimated_visible_weight_g":0,"items":[{"name":"string","portion_description":"string","portion_size_class":"tiny|small|normal|large|unknown","estimated_weight_g":0,"calories_kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"confidence":"low|medium|high"}],"total":{"calories_kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0},"confidence":"low|medium|high","uncertainty_factors":["string"],"recommended_user_checks":["string"]}',
    'total 裡的 calories_kcal、protein_g、carbs_g、fat_g 不可省略；若只能粗估，也請填合理估算值，不要填 0。'
  ].join('\n');
  var response = callGeminiGenerateContent({
    prompt: prompt,
    blob: imageBlob,
    responseMimeType: 'application/json'
  }, config);
  var text = getGeminiText(response);
  var parsed = normalizeMealEstimate(extractJsonObject(text));
  var adjusted = applyNutritionGuardrails(applyFoodRulesToEstimate(parsed, rules));
  var usage = response.usageMetadata || {};

  return {
    estimate: adjusted,
    rawText: text,
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    estimatedCostUsd: estimateGeminiCost(usage.promptTokenCount || 0, usage.candidatesTokenCount || 0)
  };
}

function classifyFoodImage(imageBlob, config) {
  var prompt = [
    '請判斷這張圖片的主要類型，只能輸出 JSON。',
    '如果圖片主要是食品營養標示、營養成分表、包裝背面營養標籤，type 請填 nutrition_label。',
    '如果圖片主要是體重機數字、InBody 報告、身體組成分析表、體脂計畫面，type 請填 body_metric。',
    '如果圖片主要是可直接食用的餐點、便當、外食、食物本體，type 請填 meal_photo。',
    '如果無法判斷，type 請填 unknown。',
    'JSON 格式：{"type":"nutrition_label|body_metric|meal_photo|unknown","confidence":"low|medium|high","reason":"string"}'
  ].join('\n');
  var response = callGeminiGenerateContent({
    prompt: prompt,
    blob: imageBlob,
    responseMimeType: 'application/json'
  }, config);
  var parsed = extractJsonObject(getGeminiText(response));
  var usage = response.usageMetadata || {};

  return {
    type: parsed.type === 'nutrition_label' || parsed.type === 'body_metric' || parsed.type === 'meal_photo' ? parsed.type : 'unknown',
    confidence: normalizeConfidence(parsed.confidence),
    reason: parsed.reason || '',
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    estimatedCostUsd: estimateGeminiCost(usage.promptTokenCount || 0, usage.candidatesTokenCount || 0)
  };
}

function callGeminiForNutritionLabel(imageBlob, config) {
  var prompt = [
    '你是食品營養標示 OCR 與結構化資料擷取器。',
    '請直接讀取圖片中的營養標示表，不要依食物外觀估算。',
    '優先記錄「每包裝」可實際食用的數值；若沒有每包裝，使用每份；若同時有每100公克與每份，優先使用每份。',
    '如果標示有本包裝含幾份，請回傳 servings_per_package。',
    '如果只有每份且本包裝含多份，不要自行乘成整包，serving_basis 請填 per_serving，並在 uncertainty_factors 說明。',
    '若只有每100公克但看不到總重量，請使用每100公克數值並在 uncertainty_factors 說明。',
    '只能輸出 JSON，不要輸出 Markdown。',
    'JSON 必須使用以下英文欄位：',
    '{"product_name":"string","serving_basis":"per_package|per_serving|per_100g|unknown","serving_size":"string","servings_per_package":0,"total":{"calories_kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0},"confidence":"low|medium|high","uncertainty_factors":["string"],"raw_notes":"string"}'
  ].join('\n');
  var response = callGeminiGenerateContent({
    prompt: prompt,
    blob: imageBlob,
    responseMimeType: 'application/json'
  }, config);
  var text = getGeminiText(response);
  var parsed = normalizeNutritionLabelEstimate(extractJsonObject(text));
  var usage = response.usageMetadata || {};

  return {
    estimate: parsed,
    rawText: text,
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    estimatedCostUsd: estimateGeminiCost(usage.promptTokenCount || 0, usage.candidatesTokenCount || 0)
  };
}

function callGeminiForBodyMetrics(imageBlob, config) {
  var prompt = [
    '你是體重機與 InBody 報告的 OCR 與結構化資料擷取器。',
    '請直接讀取圖片中的身體數據，不要自行推測看不到的欄位。',
    '支援欄位包含體重、體脂率、骨骼肌重、BMI、內臟脂肪、基礎代謝、身體年齡、水分率、骨量、InBody 分數。',
    '沒有看到的欄位請填 null，不要填 0。',
    '只能輸出 JSON，不要輸出 Markdown。',
    'JSON 必須使用以下英文欄位：',
    '{"source_name":"string","weight_kg":null,"body_fat_percent":null,"muscle_mass_kg":null,"bmi":null,"visceral_fat":null,"basal_metabolic_rate_kcal":null,"body_age":null,"water_percent":null,"bone_mass_kg":null,"inbody_score":null,"confidence":"low|medium|high","uncertainty_factors":["string"],"raw_notes":"string"}'
  ].join('\n');
  var response = callGeminiGenerateContent({
    prompt: prompt,
    blob: imageBlob,
    responseMimeType: 'application/json',
    maxAttempts: 4
  }, config);
  var text = getGeminiText(response);
  var parsed = normalizeBodyMetrics(extractJsonObject(text));
  var usage = response.usageMetadata || {};

  return {
    metrics: parsed,
    rawText: text,
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    estimatedCostUsd: estimateGeminiCost(usage.promptTokenCount || 0, usage.candidatesTokenCount || 0)
  };
}

function callGeminiForDailyMemory(logs, bodyMetrics, bodyHistory, summary, config) {
  var prompt = [
    '你是私人飲食追蹤系統的每日記憶整理器。',
    '請根據下列飲食與身體數據產生繁體中文 Markdown。',
    '請分清楚「事實紀錄」與「AI 觀察」，不要把推論寫成事實。',
    '請觀察體重、體脂、骨骼肌與飲食紀錄之間可能的關聯；可參考最近身體數據歷程，但只做低強度推論，不要給醫療診斷。',
    '請使用固定章節：# Daily Memory｜日期、## 1. 事實紀錄、## 2. 身體變化觀察、## 3. 飲食觀察、## 4. 使用者修正、## 5. 不確定性、## 6. 後續追蹤。',
    '',
    JSON.stringify({
      summary: summary,
      logs: logs.map(function (row) {
        return {
          timestamp: row.timestamp,
          meal_name: row.meal_name,
          ai_calories: row.ai_calories,
          corrected_calories: row.corrected_calories,
          protein_g: row.protein_g,
          carbs_g: row.carbs_g,
          fat_g: row.fat_g,
          uncertainty: row.uncertainty,
          user_note: row.user_note
        };
      }),
      body_metrics_today: (bodyMetrics || []).map(function (row) {
        return formatBodyMetricForMemory(row);
      }),
      body_metrics_recent_history: (bodyHistory || []).map(function (row) {
        return formatBodyMetricForMemory(row);
      })
    })
  ].join('\n');
  var response = callGeminiGenerateContent({
    prompt: prompt,
    responseMimeType: 'text/plain'
  }, config);
  return getGeminiText(response).trim();
}

function callGeminiForWeeklyMemory(data, config) {
  var prompt = [
    '你是私人飲食與身體趨勢分析助手。',
    '請根據本週飲食、身體數據、最近身體歷程與 trendSnapshot 產生繁體中文 Markdown 週總結。',
    '請把「事實」和「推論」分開。不要做醫療診斷，不要誇大因果，只能說可能關聯。',
    '趨勢判斷要深化：請特別看熱量平均、蛋白質達標、體重變化、體脂變化、骨骼肌變化、水分波動可能性、資料缺口。',
    '請使用固定章節：# Weekly Memory｜日期區間、## 1. 本週事實摘要、## 2. 趨勢判斷、## 3. 飲食與身體變化可能關聯、## 4. 修正與不確定性、## 5. 下週追蹤重點、## 6. 可調整行動。',
    '可調整行動要務實，最多 5 點。',
    '',
    JSON.stringify({
      week_range: data.weekRange,
      trend_snapshot: data.trendSnapshot,
      logs: data.logs.map(function (row) {
        return {
          date: row.date,
          timestamp: row.timestamp,
          meal_name: row.meal_name,
          ai_calories: row.ai_calories,
          corrected_calories: row.corrected_calories,
          protein_g: row.protein_g,
          carbs_g: row.carbs_g,
          fat_g: row.fat_g,
          uncertainty: row.uncertainty,
          user_note: row.user_note
        };
      }),
      body_metrics_this_week: data.bodyMetrics.map(formatBodyMetricForMemory),
      body_metrics_recent_history: data.bodyHistory.map(formatBodyMetricForMemory),
      daily_summaries: data.dailySummaries
    })
  ].join('\n');
  var response = callGeminiGenerateContent({
    prompt: prompt,
    responseMimeType: 'text/plain'
  }, config);
  return getGeminiText(response).trim();
}

function callGeminiForInstantWeeklySummary(data, config) {
  var prompt = [
    '你是私人減脂飲食追蹤 Bot 的即時週趨勢助手。',
    '請根據本週當下紀錄，產生適合 LINE 訊息的具體趨勢建議。',
    '這不是長期記憶，不要輸出 Markdown，不要提到檔案或雲端硬碟。',
    '請把建議控制成 3 條，每條 22 個中文字以內，每條都要有明確用途，不要空泛鼓勵。',
    '請用以下格式，不要加 Markdown 標題：',
    '1. 一句話說明本週最大問題或優勢。',
    '2. 一個下週可執行飲食動作。',
    '3. 一個記錄或修正策略。',
    '飲食建議要務實：例如雞胸、蛋、豆腐、魚、瘦肉、便當少飯加蛋白質、醬料分開、炸物減量。',
    '不要做醫療診斷，不要要求極端飲食。',
    '優先看：平均熱量、平均蛋白質、紀錄天數、低信心或修正紀錄可能造成的資料誤差。',
    '',
    JSON.stringify({
      week_range: data.weekRange,
      trend_snapshot: data.trendSnapshot,
      logs: data.logs.slice(-20).map(function (row) {
        return {
          date: row.date,
          meal_name: row.meal_name,
          calories_kcal: getEffectiveMealCalories(row),
          protein_g: row.protein_g,
          carbs_g: row.carbs_g,
          fat_g: row.fat_g,
          confidence: row.confidence,
          corrected: hasSheetValue(row.corrected_calories)
        };
      }),
      daily_summaries: data.dailySummaries
    })
  ].join('\n');
  var response = callGeminiGenerateContent({
    prompt: prompt,
    responseMimeType: 'text/plain',
    maxAttempts: 3
  }, config);
  var usage = response.usageMetadata || {};

  return {
    text: sanitizeShortLineText(getGeminiText(response), 3),
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    estimatedCostUsd: estimateGeminiCost(usage.promptTokenCount || 0, usage.candidatesTokenCount || 0)
  };
}

function callGeminiForCorrectionLearning(data, config) {
  var prompt = [
    '你是飲食紀錄系統的個人化修正學習助手。',
    '請分析使用者最近的 corrected_calories 紀錄，找出 AI 估算與使用者修正之間的模式。',
    '請產生繁體中文 Markdown。不要直接聲稱已更新 FoodRules；只能提出建議。',
    '請特別找：常被低估的餐點、常被高估的餐點、可能需要新增 FoodRules 的食物關鍵字、需要使用者確認的規則。',
    '請使用固定章節：# Correction Learning｜日期區間、## 1. 修正紀錄摘要、## 2. 可能低估項目、## 3. 可能高估項目、## 4. FoodRules 建議草案、## 5. 需要使用者確認。',
    'FoodRules 建議草案請用表格欄位：food_keyword、portion_unit、calories_per_unit、protein_per_unit、carbs_per_unit、fat_per_unit、reason。',
    '',
    JSON.stringify({
      start_date: data.startDate,
      end_date: data.endDate,
      corrected_logs: data.correctedLogs.map(function (row) {
        return {
          date: row.date,
          meal_name: row.meal_name,
          ai_calories: row.ai_calories,
          corrected_calories: row.corrected_calories,
          delta_calories: toNumber(row.corrected_calories, 0) - toNumber(row.ai_calories, 0),
          protein_g: row.protein_g,
          carbs_g: row.carbs_g,
          fat_g: row.fat_g,
          uncertainty: row.uncertainty,
          raw_json: row.raw_json
        };
      })
    })
  ].join('\n');
  var response = callGeminiGenerateContent({
    prompt: prompt,
    responseMimeType: 'text/plain'
  }, config);
  return getGeminiText(response).trim();
}

function callGeminiForCoachAdvice(data, config) {
  var prompt = [
    '你是私人減脂飲食追蹤 Bot 的 AI 教練。',
    '請根據使用者今天的飲食紀錄與目標，用繁體中文給出下一步飲食建議。',
    '限制：不要做醫療診斷，不要誇大照片估算的精準度，不要要求使用者照做極端飲食。',
    '回覆要短，適合 LINE 訊息，最多 8 行。',
    '請優先回答：今天接下來怎麼吃、蛋白質是否需要補、熱量是否需要保守、外食怎麼選。',
    '若資料是照片估算或信心偏低，請提醒「估算可能有誤差」，但不要一直道歉。',
    '不要輸出 Markdown 標題，不要輸出 JSON。',
    '',
    JSON.stringify({
      date: data.date,
      target: {
        calories_kcal: data.summary.targetCalories,
        protein_g: data.summary.proteinTarget
      },
      current: {
        calories_kcal: Math.round(data.summary.totalCalories),
        protein_g: Math.round(data.summary.totalProtein),
        carbs_g: Math.round(data.summary.totalCarbs),
        fat_g: Math.round(data.summary.totalFat),
        meal_count: data.summary.mealCount,
        calorie_gap: Math.round(data.summary.calorieGap),
        protein_gap: Math.round(data.summary.proteinGap)
      },
      profile: {
        goal: data.profile.goal || '',
        notes: data.profile.notes || ''
      },
      meals_today: data.logs.map(function (row) {
        return {
          meal_name: row.meal_name,
          calories_kcal: getEffectiveMealCalories(row),
          protein_g: row.protein_g,
          carbs_g: row.carbs_g,
          fat_g: row.fat_g,
          confidence: row.confidence,
          uncertainty: row.uncertainty,
          user_note: row.user_note
        };
      })
    })
  ].join('\n');
  var response = callGeminiGenerateContent({
    prompt: prompt,
    responseMimeType: 'text/plain',
    maxAttempts: 3
  }, config);
  var usage = response.usageMetadata || {};

  return {
    text: getGeminiText(response).trim(),
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    estimatedCostUsd: estimateGeminiCost(usage.promptTokenCount || 0, usage.candidatesTokenCount || 0)
  };
}

function callGeminiForMealCorrectionCommand(text, config) {
  var prompt = [
    '你是 LINE 飲食紀錄 Bot 的指令理解器。',
    '任務：把使用者自然語言修正指令轉成嚴格 JSON。只處理「修正上一筆餐點熱量或 P/C/F」的意圖。',
    '若不是餐點修正指令，intent 請填 unknown。',
    '常見說法：這餐應該 700 左右、蛋白質大概 30、P 30、P改40熱量不動、碳水抓 60、脂肪不要動、其他照熱量調整。',
    '欄位說明：calories/protein/carbs/fat 為數字或 null；lock_calories 表示使用者說熱量不動、總熱量維持或熱量不要重算；lock_protein/lock_carbs/lock_fat 表示使用者說不要動該營養素；adjust_remainder 表示其餘營養素配合熱量調整。',
    '只能輸出 JSON，不要輸出 Markdown。',
    'JSON 格式：{"intent":"meal_correction|unknown","calories":null,"protein":null,"carbs":null,"fat":null,"lock_calories":false,"lock_protein":false,"lock_carbs":false,"lock_fat":false,"adjust_remainder":false,"confidence":"low|medium|high","reason":"string"}',
    '',
    '使用者訊息：' + String(text || '')
  ].join('\n');
  var response = callGeminiGenerateContent({
    prompt: prompt,
    responseMimeType: 'application/json',
    maxAttempts: 2
  }, config);
  var parsed = normalizeMealCorrectionCommand(extractJsonObject(getGeminiText(response)));
  var usage = response.usageMetadata || {};

  return {
    correction: parsed,
    inputTokens: usage.promptTokenCount || 0,
    outputTokens: usage.candidatesTokenCount || 0,
    estimatedCostUsd: estimateGeminiCost(usage.promptTokenCount || 0, usage.candidatesTokenCount || 0)
  };
}

function normalizeMealCorrectionCommand(parsed) {
  parsed = parsed || {};

  if (parsed.intent !== 'meal_correction') {
    return null;
  }

  var correction = {};

  if (parsed.calories !== null && parsed.calories !== undefined && parsed.calories !== '') {
    correction.calories = Math.round(toNumber(parsed.calories, 0));
  }

  if (parsed.protein !== null && parsed.protein !== undefined && parsed.protein !== '') {
    correction.protein = toNumber(parsed.protein, 0);
  }

  if (parsed.carbs !== null && parsed.carbs !== undefined && parsed.carbs !== '') {
    correction.carbs = toNumber(parsed.carbs, 0);
  }

  if (parsed.fat !== null && parsed.fat !== undefined && parsed.fat !== '') {
    correction.fat = toNumber(parsed.fat, 0);
  }

  correction.lockCalories = Boolean(parsed.lock_calories);
  correction.lockProtein = Boolean(parsed.lock_protein);
  correction.lockCarbs = Boolean(parsed.lock_carbs);
  correction.lockFat = Boolean(parsed.lock_fat);
  correction.adjustRemainder = Boolean(parsed.adjust_remainder);
  correction.source = 'ai_command_parser';
  correction.parserConfidence = normalizeConfidence(parsed.confidence);
  correction.parserReason = parsed.reason || '';

  if (!hasAnyMealCorrection(correction)) {
    return null;
  }

  return correction;
}

function formatBodyMetricForMemory(row) {
  return {
    timestamp: row.timestamp,
    date: row.date,
    source_type: row.source_type,
    weight_kg: row.weight_kg,
    body_fat_percent: row.body_fat_percent,
    muscle_mass_kg: row.muscle_mass_kg,
    bmi: row.bmi,
    visceral_fat: row.visceral_fat,
    basal_metabolic_rate_kcal: row.basal_metabolic_rate_kcal,
    body_age: row.body_age,
    water_percent: row.water_percent,
    bone_mass_kg: row.bone_mass_kg,
    inbody_score: row.inbody_score,
    uncertainty: row.uncertainty,
    user_note: row.user_note
  };
}

function callGeminiGenerateContent(input, config) {
  var modelName = String(config.geminiModel || 'gemini-3.1-flash-lite').replace(/^models\//, '');
  var parts = [{ text: input.prompt }];

  if (input.blob) {
    parts.push({
      inlineData: {
        mimeType: input.blob.getContentType() || 'image/jpeg',
        data: Utilities.base64Encode(input.blob.getBytes())
      }
    });
  }

  var payload = {
    contents: [
      {
        role: 'user',
        parts: parts
      }
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: input.responseMimeType || 'application/json'
    }
  };
  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(modelName) +
    ':generateContent?key=' +
    encodeURIComponent(config.geminiApiKey);
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  var maxAttempts = Math.max(1, Number(input.maxAttempts || 3));
  var response;
  var status;
  var text;

  for (var attempt = 1; attempt <= maxAttempts; attempt += 1) {
    response = UrlFetchApp.fetch(url, options);
    status = response.getResponseCode();
    text = response.getContentText();

    if (status >= 200 && status < 300) {
      return JSON.parse(text);
    }

    if (!isRetryableGeminiStatus(status) || attempt >= maxAttempts) {
      break;
    }

    Utilities.sleep(geminiRetryDelayMs(attempt));
  }

  if (status < 200 || status >= 300) {
    throw new Error('Gemini request failed after ' + maxAttempts + ' attempt(s): ' + status + ' ' + text);
  }

  return JSON.parse(text);
}

function isRetryableGeminiStatus(status) {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function geminiRetryDelayMs(attempt) {
  var delays = [700, 1500, 3000, 5000];
  return delays[Math.min(Math.max(attempt - 1, 0), delays.length - 1)];
}

function isTransientGeminiError(error) {
  var message = String(error && (error.message || error) || '');
  return /Gemini request failed/.test(message) && /(429|500|502|503|504|UNAVAILABLE|RESOURCE_EXHAUSTED)/.test(message);
}

function getGeminiText(response) {
  var parts = (((response.candidates || [])[0] || {}).content || {}).parts || [];
  var text = parts.map(function (part) {
    return part.text || '';
  }).join('');

  if (!text) {
    throw new Error('Gemini response did not include text: ' + JSON.stringify(response));
  }

  return text;
}

function sanitizeShortLineText(text, maxLines) {
  var lines = String(text || '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(function (line) {
      return line;
    });

  return lines.slice(0, maxLines || 5).join('\n');
}

function normalizeMealEstimate(estimate) {
  var total = estimate.total || {};
  var items = Array.isArray(estimate.items) ? estimate.items.slice(0, 12).map(normalizeMealItem) : [];
  var itemTotals = sumMealItems(items);
  var calories = firstNumber([
    total.calories_kcal,
    total.calories,
    total.total_calories,
    total.total_calories_kcal,
    estimate.calories_kcal,
    estimate.ai_calories
  ], itemTotals.calories_kcal);
  var protein = firstNumber([
    total.protein_g,
    total.protein,
    total.total_protein,
    estimate.protein_g
  ], itemTotals.protein_g);
  var carbs = firstNumber([
    total.carbs_g,
    total.carbs,
    total.carbohydrates_g,
    total.total_carbs,
    estimate.carbs_g
  ], itemTotals.carbs_g);
  var fat = firstNumber([
    total.fat_g,
    total.fat,
    total.total_fat,
    estimate.fat_g
  ], itemTotals.fat_g);

  return {
    meal_name: truncateText(estimate.meal_name || '未命名餐點', 80),
    items: items,
    total: {
      calories_kcal: roundNonNegative(calories),
      protein_g: roundNonNegative(protein),
      carbs_g: roundNonNegative(carbs),
      fat_g: roundNonNegative(fat)
    },
    portion_size_class: normalizePortionSizeClass(estimate.portion_size_class || estimate.portion_class),
    serving_context: normalizeServingContext(estimate.serving_context || estimate.meal_context),
    estimated_visible_weight_g: roundNonNegative(estimate.estimated_visible_weight_g || estimate.visible_weight_g || itemTotals.estimated_weight_g),
    confidence: normalizeConfidence(estimate.confidence),
    uncertainty_factors: Array.isArray(estimate.uncertainty_factors) ? estimate.uncertainty_factors.slice(0, 8) : [],
    recommended_user_checks: Array.isArray(estimate.recommended_user_checks) ? estimate.recommended_user_checks.slice(0, 6) : []
  };
}

function normalizeNutritionLabelEstimate(label) {
  var total = label.total || {};

  return {
    product_name: truncateText(label.product_name || '營養標示食品', 80),
    serving_basis: normalizeServingBasis(label.serving_basis),
    serving_size: truncateText(label.serving_size || '', 80),
    servings_per_package: toNumber(label.servings_per_package, 0),
    total: {
      calories_kcal: roundNonNegative(total.calories_kcal || total.calories || label.calories_kcal),
      protein_g: roundNonNegative(total.protein_g || total.protein || label.protein_g),
      carbs_g: roundNonNegative(total.carbs_g || total.carbs || total.carbohydrates_g || label.carbs_g),
      fat_g: roundNonNegative(total.fat_g || total.fat || label.fat_g)
    },
    confidence: normalizeConfidence(label.confidence),
    uncertainty_factors: Array.isArray(label.uncertainty_factors) ? label.uncertainty_factors.slice(0, 8) : [],
    raw_notes: truncateText(label.raw_notes || '', 500)
  };
}

function normalizeBodyMetrics(metrics) {
  return {
    source_name: truncateText(metrics.source_name || '身體數據', 80),
    weight_kg: roundOneDecimalOrBlank(metrics.weight_kg),
    body_fat_percent: roundOneDecimalOrBlank(metrics.body_fat_percent),
    muscle_mass_kg: roundOneDecimalOrBlank(metrics.muscle_mass_kg),
    bmi: roundOneDecimalOrBlank(metrics.bmi),
    visceral_fat: roundOneDecimalOrBlank(metrics.visceral_fat),
    basal_metabolic_rate_kcal: roundWholeOrBlank(metrics.basal_metabolic_rate_kcal),
    body_age: roundWholeOrBlank(metrics.body_age),
    water_percent: roundOneDecimalOrBlank(metrics.water_percent),
    bone_mass_kg: roundOneDecimalOrBlank(metrics.bone_mass_kg),
    inbody_score: roundWholeOrBlank(metrics.inbody_score),
    confidence: normalizeConfidence(metrics.confidence),
    uncertainty_factors: Array.isArray(metrics.uncertainty_factors) ? metrics.uncertainty_factors.slice(0, 8) : [],
    raw_notes: truncateText(metrics.raw_notes || '', 500)
  };
}

function roundOneDecimalOrBlank(value) {
  var number = Number(value);
  return isFinite(number) && number > 0 ? Math.round(number * 10) / 10 : '';
}

function roundWholeOrBlank(value) {
  var number = Number(value);
  return isFinite(number) && number > 0 ? Math.round(number) : '';
}

function normalizeServingBasis(value) {
  return value === 'per_package' || value === 'per_serving' || value === 'per_100g'
    ? value
    : 'unknown';
}

function normalizeMealItem(item) {
  return {
    name: truncateText(item.name || '未知品項', 80),
    portion_description: truncateText(item.portion_description || item.portion || '照片粗估', 120),
    portion_size_class: normalizePortionSizeClass(item.portion_size_class || item.portion_class),
    estimated_weight_g: roundNonNegative(item.estimated_weight_g || item.weight_g),
    calories_kcal: roundNonNegative(item.calories_kcal || item.calories),
    protein_g: roundNonNegative(item.protein_g || item.protein),
    carbs_g: roundNonNegative(item.carbs_g || item.carbs || item.carbohydrates_g),
    fat_g: roundNonNegative(item.fat_g || item.fat),
    confidence: normalizeConfidence(item.confidence)
  };
}

function sumMealItems(items) {
  return items.reduce(function (acc, item) {
    acc.calories_kcal += toNumber(item.calories_kcal, 0);
    acc.protein_g += toNumber(item.protein_g, 0);
    acc.carbs_g += toNumber(item.carbs_g, 0);
    acc.fat_g += toNumber(item.fat_g, 0);
    acc.estimated_weight_g += toNumber(item.estimated_weight_g, 0);
    return acc;
  }, {
    calories_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    estimated_weight_g: 0
  });
}

function normalizePortionSizeClass(value) {
  return value === 'tiny' || value === 'small' || value === 'normal' || value === 'large' || value === 'unknown'
    ? value
    : 'unknown';
}

function normalizeServingContext(value) {
  return value === 'tasting' || value === 'snack' || value === 'meal' || value === 'shared' || value === 'unknown'
    ? value
    : 'unknown';
}

function firstNumber(values, fallback) {
  for (var index = 0; index < values.length; index += 1) {
    var number = Number(values[index]);

    if (isFinite(number) && number > 0) {
      return number;
    }
  }

  return fallback;
}

function normalizeConfidence(value) {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium';
}

function estimateGeminiCost(inputTokens, outputTokens) {
  var inputCost = (Number(inputTokens || 0) / 1000000) * 0.25;
  var outputCost = (Number(outputTokens || 0) / 1000000) * 1.5;
  return Math.round((inputCost + outputCost) * 100000000) / 100000000;
}

function formatFoodRulesForPrompt(rules) {
  if (!rules || rules.length === 0) {
    return 'FoodRules: none';
  }

  return 'FoodRules:\n' + rules.slice(0, 30).map(function (rule) {
    return [
      '- keyword=' + rule.food_keyword,
      'unit=' + rule.portion_unit,
      'kcal=' + rule.calories_per_unit,
      'protein_g=' + rule.protein_per_unit,
      'carbs_g=' + rule.carbs_per_unit,
      'fat_g=' + rule.fat_per_unit,
      'category=' + (rule.category || inferFoodRuleCategory(rule)),
      'risk_tags=' + (rule.risk_tags || inferFoodRuleRiskTags(rule).join('|')),
      'note=' + rule.note
    ].join(', ');
  }).join('\n') + '\n請把 FoodRules 當作合理範圍參考，不要因單一關鍵字忽略照片中的其他食物。';
}

function applyFoodRulesToEstimate(estimate, rules) {
  ensureFoodRuleDiagnostics(estimate);

  if (!rules || rules.length === 0) {
    estimate.risk_tags = uniqueStrings(estimate.risk_tags.concat(inferRiskTagsFromEstimate(estimate)));
    return estimate;
  }

  var matches = findMatchingFoodRules(estimate, rules).slice(0, 5);

  if (!matches.length) {
    estimate.risk_tags = uniqueStrings(estimate.risk_tags.concat(inferRiskTagsFromEstimate(estimate)));
    return estimate;
  }

  var primary = matches[0];
  var riskTags = uniqueStrings(
    inferRiskTagsFromEstimate(estimate).concat(
      matches.reduce(function (tags, match) {
        return tags.concat(match.riskTags);
      }, [])
    )
  );
  var benchmark = buildFoodRuleBenchmark(primary.rule, primary.units);
  var range = buildFoodRuleRange(benchmark, riskTags);
  var beforeCalories = toNumber(estimate.total.calories_kcal, 0);
  var smallPortion = isSmallPortionEstimate(estimate);

  estimate.rule_matches = matches.map(function (match) {
    return match.rule.food_keyword + ' x ' + match.units + ' ' + match.rule.portion_unit;
  });
  estimate.risk_tags = riskTags;

  if (smallPortion) {
    estimate.risk_tags = uniqueStrings((estimate.risk_tags || []).concat(['small_portion']));
    estimate.adjustment_reasons.push('FoodRules 略過自動上修：照片疑似少量/試吃/小份量，保留影像估算。');
  } else if (beforeCalories > 0 && beforeCalories < range.caloriesMin) {
    raiseEstimateCaloriesWithFoodRulePolicy(estimate, range.caloriesMin, riskTags);
    estimate.adjustment_reasons.push(
      'FoodRules 下限上修：' + primary.rule.food_keyword + ' 參考下限 ' + range.caloriesMin + ' kcal'
    );
  }

  if (!smallPortion) {
    applyFoodRuleMacroFloors(estimate, range);
  }

  if (beforeCalories > 0 && beforeCalories > range.caloriesMax * 1.25) {
    estimate.adjustment_reasons.push(
      'FoodRules 警示：估算高於 ' + primary.rule.food_keyword + ' 常見範圍，未自動下修'
    );
    estimate.confidence = 'low';
  }

  estimate.uncertainty_factors = (estimate.uncertainty_factors || []).slice(0, 6);

  if (estimate.adjustment_reasons.length) {
    estimate.uncertainty_factors.push('FoodRules 診斷：' + estimate.adjustment_reasons.join('；'));
    estimate.confidence = estimate.confidence === 'high' ? 'medium' : estimate.confidence;
  }

  return estimate;
}

function ensureFoodRuleDiagnostics(estimate) {
  estimate.rule_matches = estimate.rule_matches || [];
  estimate.risk_tags = estimate.risk_tags || [];
  estimate.adjustment_reasons = estimate.adjustment_reasons || [];
}

function findMatchingFoodRules(estimate, rules) {
  var haystack = getFoodRuleHaystack(estimate);

  return rules.filter(function (rule) {
    return rule.food_keyword && haystack.indexOf(rule.food_keyword) >= 0;
  }).map(function (rule) {
    return {
      rule: rule,
      units: estimateRuleUnits(estimate, rule),
      category: rule.category || inferFoodRuleCategory(rule),
      riskTags: parseFoodRuleRiskTags(rule)
    };
  }).filter(function (match) {
    return match.units > 0;
  }).sort(function (a, b) {
    var priorityDiff = toNumber(b.rule.priority, 0) - toNumber(a.rule.priority, 0);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return String(b.rule.food_keyword).length - String(a.rule.food_keyword).length;
  });
}

function getFoodRuleHaystack(estimate) {
  return [
    estimate.meal_name,
    (estimate.items || []).map(function (item) {
      return [item.name, item.portion_description].join(' ');
    }).join(' ')
  ].join(' ');
}

function estimateRuleUnits(estimate, rule) {
  if (rule.portion_unit === '顆') {
    var count = extractCountFromEstimate(estimate);
    if (count > 0) {
      return count;
    }
  }

  if (rule.portion_unit === '碗') {
    return 1;
  }

  if (rule.portion_unit === '100g') {
    var weight = estimateTotalWeight(estimate);
    return weight > 0 ? Math.max(0.5, weight / 100) : 1;
  }

  return 1;
}

function buildFoodRuleBenchmark(rule, units) {
  return {
    calories: Math.round(toNumber(rule.calories_per_unit, 0) * units),
    protein: Math.round(toNumber(rule.protein_per_unit, 0) * units),
    carbs: Math.round(toNumber(rule.carbs_per_unit, 0) * units),
    fat: Math.round(toNumber(rule.fat_per_unit, 0) * units)
  };
}

function buildFoodRuleRange(benchmark, riskTags) {
  var highVariance = containsAny(riskTags, ['fried', 'sauce', 'cheese', 'dessert', 'hotpot', 'shared_portion']);
  var minFactor = highVariance ? 0.75 : 0.8;
  var maxFactor = highVariance ? 1.5 : 1.35;

  return {
    caloriesMin: Math.max(80, Math.round(benchmark.calories * minFactor)),
    caloriesMax: Math.max(120, Math.round(benchmark.calories * maxFactor)),
    proteinMin: Math.round(benchmark.protein * 0.65),
    carbsMin: Math.round(benchmark.carbs * 0.5),
    fatMin: Math.round(benchmark.fat * 0.55)
  };
}

function applyFoodRuleMacroFloors(estimate, range) {
  if (range.proteinMin > 0 && toNumber(estimate.total.protein_g, 0) < range.proteinMin) {
    estimate.total.protein_g = range.proteinMin;
    estimate.adjustment_reasons.push('FoodRules 蛋白質下限上修至 ' + range.proteinMin + 'g');
  }

  if (range.carbsMin > 0 && toNumber(estimate.total.carbs_g, 0) < range.carbsMin) {
    estimate.total.carbs_g = range.carbsMin;
    estimate.adjustment_reasons.push('FoodRules 碳水下限上修至 ' + range.carbsMin + 'g');
  }

  if (range.fatMin > 0 && toNumber(estimate.total.fat_g, 0) < range.fatMin) {
    estimate.total.fat_g = range.fatMin;
    estimate.adjustment_reasons.push('FoodRules 脂肪下限上修至 ' + range.fatMin + 'g');
  }

  var macroEnergy = macroCaloriesFromEstimate(estimate);

  if (macroEnergy > toNumber(estimate.total.calories_kcal, 0)) {
    estimate.total.calories_kcal = Math.round(macroEnergy);
    estimate.adjustment_reasons.push('FoodRules 宏量營養素下限使熱量同步上修');
  }
}

function raiseEstimateCaloriesWithFoodRulePolicy(estimate, targetCalories, riskTags) {
  var currentCalories = toNumber(estimate.total.calories_kcal, 0);
  var delta = Math.max(0, targetCalories - currentCalories);
  var shares = foodRuleEnergyShares(riskTags);

  if (delta <= 0) {
    return;
  }

  estimate.total.calories_kcal = Math.round(targetCalories);
  estimate.total.carbs_g = roundNonNegative(toNumber(estimate.total.carbs_g, 0) + (delta * shares.carbs) / 4);
  estimate.total.fat_g = roundNonNegative(toNumber(estimate.total.fat_g, 0) + (delta * shares.fat) / 9);

  if (shares.protein > 0) {
    estimate.total.protein_g = roundNonNegative(toNumber(estimate.total.protein_g, 0) + (delta * shares.protein) / 4);
  }
}

function foodRuleEnergyShares(riskTags) {
  if (containsAny(riskTags, ['fried', 'sauce', 'cheese', 'dessert'])) {
    return { protein: 0, carbs: 0.35, fat: 0.65 };
  }

  if (containsAny(riskTags, ['starch', 'rice_noodle', 'pasta'])) {
    return { protein: 0, carbs: 0.7, fat: 0.3 };
  }

  return { protein: 0, carbs: 0.5, fat: 0.5 };
}

function macroCaloriesFromEstimate(estimate) {
  return toNumber(estimate.total.protein_g, 0) * 4 +
    toNumber(estimate.total.carbs_g, 0) * 4 +
    toNumber(estimate.total.fat_g, 0) * 9;
}

function parseFoodRuleRiskTags(rule) {
  var explicit = String(rule.risk_tags || '').trim();
  var tags = explicit ? explicit.split(/[,\s;；|｜]+/) : [];
  return uniqueStrings(tags.concat(inferFoodRuleRiskTags(rule)));
}

function inferRiskTagsFromEstimate(estimate) {
  var tags = inferRiskTagsFromText(getFoodRuleHaystack(estimate));

  if (isSmallPortionEstimate(estimate)) {
    tags.push('small_portion');
  }

  return uniqueStrings(tags);
}

function inferFoodRuleRiskTags(rule) {
  var text = [
    rule.food_keyword || '',
    rule.category || '',
    rule.note || ''
  ].join(' ');

  return inferRiskTagsFromText(text);
}

function inferRiskTagsFromText(text) {
  var tags = [];
  var value = String(text || '');

  if (/(炸|酥|雞排|炸雞|薯條|鍋貼|蔥油餅|蔥抓餅)/.test(value)) tags.push('fried');
  if (/(醬|麻醬|沙茶|白醬|青醬|咖哩|滷肉|肉燥)/.test(value)) tags.push('sauce');
  if (/(起司|芝士|奶油)/.test(value)) tags.push('cheese');
  if (/(飯|麵|義大利麵|炒飯|炒麵|米粉|冬粉|吐司|麵包|貝果|地瓜|馬鈴薯|玉米|粥)/.test(value)) tags.push('starch');
  if (/(義大利麵|白醬|青醬|紅醬)/.test(value)) tags.push('pasta');
  if (/(火鍋|鍋|涮涮鍋|麻辣鍋|鍋物|火鍋料)/.test(value)) tags.push('hotpot');
  if (/(甜點|蛋塔|塔|派|奶茶|珍珠|剉冰|豆花|車輪餅|雞蛋糕)/.test(value)) tags.push('dessert');
  if (/(拼盤|分享|多人|套餐)/.test(value)) tags.push('shared_portion');
  if (/(試吃|少量|小份|小碗|小盒|小紙盤|一口|幾口|幾塊|切塊|半份|單顆|單個|剩下|局部|sample|tasting|small portion)/i.test(value)) tags.push('small_portion');

  return uniqueStrings(tags);
}

function isSmallPortionEstimate(estimate) {
  var portion = String(estimate.portion_size_class || '').toLowerCase();
  var context = String(estimate.serving_context || '').toLowerCase();
  var weight = toNumber(estimate.estimated_visible_weight_g, 0) || estimateTotalWeight(estimate);
  var text = getFoodRuleHaystack(estimate);

  if (portion === 'tiny' || portion === 'small') {
    return true;
  }

  if (context === 'tasting' || context === 'snack') {
    return true;
  }

  if (/(試吃|少量|小份|小碗|小盒|小紙盤|一口|幾口|幾塊|切塊|半份|單顆|單個|剩下|局部|sample|tasting|small portion)/i.test(text)) {
    return true;
  }

  return weight > 0 && weight <= 90 && (estimate.items || []).length <= 3;
}

function inferFoodRuleCategory(rule) {
  var tags = inferFoodRuleRiskTags(rule);

  if (containsAny(tags, ['fried'])) return 'fried_food';
  if (containsAny(tags, ['dessert'])) return 'dessert';
  if (containsAny(tags, ['hotpot'])) return 'hotpot';
  if (containsAny(tags, ['pasta'])) return 'pasta';
  if (containsAny(tags, ['starch'])) return 'rice_noodle';
  return 'general';
}

function containsAny(values, candidates) {
  return candidates.some(function (candidate) {
    return values.indexOf(candidate) >= 0;
  });
}

function uniqueStrings(values) {
  var seen = {};

  return (values || []).map(function (value) {
    return String(value || '').trim();
  }).filter(function (value) {
    if (!value || seen[value]) {
      return false;
    }

    seen[value] = true;
    return true;
  });
}

function extractCountFromEstimate(estimate) {
  var text = [
    estimate.meal_name,
    (estimate.items || []).map(function (item) {
      return [item.name, item.portion_description].join(' ');
    }).join(' ')
  ].join(' ');
  var match = /(\d+)\s*(顆|個|粒|隻)/.exec(text);

  if (match) {
    return Number(match[1]);
  }

  if (estimate.items && estimate.items.length === 1) {
    var single = estimate.items[0];
    var itemText = [single.name, single.portion_description].join(' ');
    var itemMatch = /(\d+)/.exec(itemText);
    if (itemMatch) {
      return Number(itemMatch[1]);
    }
  }

  return 0;
}

function estimateTotalWeight(estimate) {
  return (estimate.items || []).reduce(function (sum, item) {
    return sum + toNumber(item.estimated_weight_g, 0);
  }, 0);
}
