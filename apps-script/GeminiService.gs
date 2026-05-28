function callGeminiForMealEstimate(imageBlob, config, foodRules) {
  var rules = Array.isArray(foodRules) ? foodRules : [];
  var prompt = [
    '你是私人飲食紀錄 Bot 的營養估算器。',
    '請根據單張餐點照片粗估熱量與三大營養素，回傳繁體中文 JSON。',
    '不要假裝精準；照片看不出份量、油量、醬料時，請提高 uncertainty_factors 並降低 confidence。',
    '所有數字使用合理估算值，單位為 kcal 或 g。',
    '請務必先拆成 items，再加總 total。常見基準：熟雞腿肉每 100g 約 200-230 kcal、蛋白質 24-27g、脂肪 10-14g；熟雞胸肉每 100g 約 160-180 kcal、蛋白質 30-33g、脂肪 3-5g；非澱粉蔬菜每 100g 約 20-50 kcal、碳水 4-10g。',
    '如果照片中有明顯雞肉、雞腿、豬肉、牛肉、魚、蛋、豆腐等蛋白質主菜，整餐蛋白質通常不應低於 15g，除非份量極少，且必須在 uncertainty_factors 說明。',
    '如果照片中沒有白飯、麵、麵包、馬鈴薯、地瓜、玉米等明顯澱粉主食，整餐碳水通常不應高於 35g，除非醬料或裹粉明顯。',
    '若照片食物命中下列 FoodRules，請優先參考規則中的每單位營養值估算，並推估單位數量。',
    formatFoodRulesForPrompt(rules),
    '只能輸出 JSON，不要輸出 Markdown。',
    'JSON 必須使用以下英文欄位名稱：',
    '{"meal_name":"string","items":[{"name":"string","portion_description":"string","estimated_weight_g":0,"calories_kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"confidence":"low|medium|high"}],"total":{"calories_kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0},"confidence":"low|medium|high","uncertainty_factors":["string"],"recommended_user_checks":["string"]}',
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
    responseMimeType: 'application/json'
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
  var response = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(modelName) +
      ':generateContent?key=' +
      encodeURIComponent(config.geminiApiKey),
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );
  var status = response.getResponseCode();
  var text = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error('Gemini request failed: ' + status + ' ' + text);
  }

  return JSON.parse(text);
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
    return acc;
  }, {
    calories_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0
  });
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
      'note=' + rule.note
    ].join(', ');
  }).join('\n');
}

function applyFoodRulesToEstimate(estimate, rules) {
  if (!rules || rules.length === 0) {
    return estimate;
  }

  var matched = findMatchingFoodRule(estimate, rules);

  if (!matched) {
    return estimate;
  }

  var units = estimateRuleUnits(estimate, matched);

  if (!units || units <= 0) {
    return estimate;
  }

  var adjustedCalories = Math.round(matched.calories_per_unit * units);

  if (!adjustedCalories || adjustedCalories <= 0) {
    return estimate;
  }

  estimate.total = {
    calories_kcal: adjustedCalories,
    protein_g: Math.round(matched.protein_per_unit * units),
    carbs_g: Math.round(matched.carbs_per_unit * units),
    fat_g: Math.round(matched.fat_per_unit * units)
  };
  estimate.uncertainty_factors = (estimate.uncertainty_factors || []).slice(0, 6);
  estimate.uncertainty_factors.push('已套用 FoodRules：' + matched.food_keyword + '，估計 ' + units + ' ' + matched.portion_unit);

  return estimate;
}

function findMatchingFoodRule(estimate, rules) {
  var haystack = [
    estimate.meal_name,
    (estimate.items || []).map(function (item) {
      return item.name;
    }).join(' ')
  ].join(' ');

  return rules.filter(function (rule) {
    return haystack.indexOf(rule.food_keyword) >= 0;
  })[0] || null;
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
