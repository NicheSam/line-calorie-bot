function applyNutritionGuardrails(estimate) {
  var context = analyzeMealContext(estimate);

  ensureNutritionTotal(estimate);
  applyProteinFloorGuardrail(estimate, context);
  applyFatFloorGuardrail(estimate, context);
  applyCarbGuardrail(estimate, context);
  applyMacroCalorieGuardrail(estimate);
  applyMealCalorieFloorGuardrail(estimate, context);
  normalizeGuardrailTotals(estimate);

  return estimate;
}

function analyzeMealContext(estimate) {
  var text = getNutritionGuardrailText(estimate);
  var ruleText = ((estimate.rule_matches || []).join(' ') || '');
  var riskText = ((estimate.risk_tags || []).join(' ') || '');
  var combined = [text, ruleText, riskText].join(' ');
  var hasReliableUnitFood = hasReliableUnitFoodEstimate(text, ruleText);
  var hasProteinMainDish = hasProteinMainDishText(combined);

  return {
    text: text,
    ruleText: ruleText,
    riskText: riskText,
    hasAnimalProtein: hasProteinMainDish,
    hasChickenThigh: /(雞腿|腿肉|去骨雞腿)/.test(text),
    hasFattyMeat: /(雞腿|腿肉|五花|培根|控肉|滷肉|炸|酥|煎)/.test(text),
    hasStarch: /(飯|白飯|糙米|麵|義大利麵|麵包|吐司|馬鈴薯|地瓜|玉米|粥|米粉|冬粉)/.test(combined),
    hasVegetableOnlyCarb: /(花椰菜|青花菜|櫛瓜|高麗菜|青菜|菠菜|菇|菇類|生菜)/.test(text),
    hasReliableUnitFood: hasReliableUnitFood,
    hasCarbDenseSnack: hasCarbDenseSnackText(combined)
  };
}

function ensureNutritionTotal(estimate) {
  if (!estimate.total) {
    estimate.total = {};
  }

  estimate.total.calories_kcal = toNumber(estimate.total.calories_kcal, 0);
  estimate.total.protein_g = toNumber(estimate.total.protein_g, 0);
  estimate.total.carbs_g = toNumber(estimate.total.carbs_g, 0);
  estimate.total.fat_g = toNumber(estimate.total.fat_g, 0);
}

function applyProteinFloorGuardrail(estimate, context) {
  if (context.hasReliableUnitFood) {
    markNutritionDiagnostic(estimate, '略過蛋白質主菜下限：已辨識為單位明確食物。');
    return;
  }

  if (!context.hasAnimalProtein || estimate.total.protein_g >= 15) {
    return;
  }

  estimate.total.protein_g = context.hasChickenThigh ? 30 : 22;
  markNutritionGuardrail(estimate, '照片含明顯蛋白質主菜，原蛋白質估算過低，已套用合理下限。');
}

function applyFatFloorGuardrail(estimate, context) {
  if (!context.hasFattyMeat || estimate.total.fat_g >= 8) {
    return;
  }

  estimate.total.fat_g = context.hasChickenThigh ? 12 : 8;
  markNutritionGuardrail(estimate, '照片含雞腿/煎炸/脂肪較高肉類，原脂肪估算過低，已套用合理下限。');
}

function applyCarbGuardrail(estimate, context) {
  if (!context.hasStarch && !context.hasCarbDenseSnack && estimate.total.carbs_g > 40) {
    estimate.total.carbs_g = context.hasVegetableOnlyCarb ? 20 : 30;
    markNutritionGuardrail(estimate, '照片未見明顯主食，原碳水估算偏高，已下修。');
    return;
  }

  if (context.hasStarch && estimate.total.carbs_g > 0 && estimate.total.carbs_g < 25) {
    estimate.total.carbs_g = 35;
    markNutritionGuardrail(estimate, '照片含明顯主食，原碳水估算偏低，已套用合理下限。');
  }
}

function applyMacroCalorieGuardrail(estimate) {
  var macroCalories =
    estimate.total.protein_g * 4 +
    estimate.total.carbs_g * 4 +
    estimate.total.fat_g * 9;

  if (macroCalories <= 0) {
    return;
  }

  if (estimate.total.calories_kcal < macroCalories * 0.8) {
    estimate.total.calories_kcal = Math.round(macroCalories);
    markNutritionGuardrail(estimate, '總熱量低於三大營養素換算值，已依三大營養素修正。');
  }
}

function applyMealCalorieFloorGuardrail(estimate, context) {
  if (context.hasReliableUnitFood) {
    markNutritionDiagnostic(estimate, '略過蛋白質主菜熱量下限：已辨識為單位明確食物。');
    return;
  }

  if (context.hasChickenThigh && estimate.total.calories_kcal < 380) {
    estimate.total.calories_kcal = 420;
    markNutritionGuardrail(estimate, '照片含雞腿肉主菜，原總熱量低於合理下限，已上修。');
    return;
  }

  if (context.hasAnimalProtein && estimate.total.calories_kcal < 250) {
    estimate.total.calories_kcal = 300;
    markNutritionGuardrail(estimate, '照片含蛋白質主菜，原總熱量偏低，已上修。');
  }
}

function normalizeGuardrailTotals(estimate) {
  estimate.total.calories_kcal = roundNonNegative(estimate.total.calories_kcal);
  estimate.total.protein_g = roundNonNegative(estimate.total.protein_g);
  estimate.total.carbs_g = roundNonNegative(estimate.total.carbs_g);
  estimate.total.fat_g = roundNonNegative(estimate.total.fat_g);
}

function markNutritionGuardrail(estimate, message) {
  estimate.confidence = 'low';
  estimate.uncertainty_factors = estimate.uncertainty_factors || [];
  estimate.adjustment_reasons = estimate.adjustment_reasons || [];

  if (estimate.uncertainty_factors.indexOf(message) < 0) {
    estimate.uncertainty_factors.push(message);
  }

  if (estimate.adjustment_reasons.indexOf(message) < 0) {
    estimate.adjustment_reasons.push(message);
  }
}

function markNutritionDiagnostic(estimate, message) {
  estimate.adjustment_reasons = estimate.adjustment_reasons || [];

  if (estimate.adjustment_reasons.indexOf(message) < 0) {
    estimate.adjustment_reasons.push(message);
  }
}

function hasReliableUnitFoodEstimate(text, ruleText) {
  var combined = [text || '', ruleText || ''].join(' ');
  var hasUnitCount = /(\d+|一|二|兩|三|四|五|六|七|八|九|十)\s*(顆|個|粒|根|條|片|塊|貫)/.test(combined);
  var hasSimpleUnitFood = /(茶葉蛋|雞蛋|荷包蛋|蛋塔|雞蛋糕|香蕉|蘋果|御飯糰|三角飯糰|麥克雞塊|水餃|蒸餃|鍋貼|小籠包|湯包|燒賣|章魚燒|車輪餅|胡椒餅|肉圓|豬血糕|牛角麵包|鯛魚燒)/.test(combined);

  return hasSimpleUnitFood && (hasUnitCount || ruleText);
}

function hasProteinMainDishText(text) {
  var value = String(text || '');

  if (hasAnimalProteinFalsePositiveText(value)) {
    return false;
  }

  return /(雞腿|雞胸|雞排|炸雞|雞肉|雞翅|雞塊|豬肉|牛肉|牛排|魚肉|鮭魚|鮪魚|蝦仁|蝦|排骨|控肉|滷肉|肉片|肉排|漢堡排|火腿|培根|香腸|豆腐|豆干)/.test(value);
}

function hasAnimalProteinFalsePositiveText(text) {
  var value = String(text || '');

  if (/(雞腿|雞胸|雞排|炸雞|雞肉|豬肉|牛肉|魚肉|鮭魚|蝦仁|排骨|控肉|滷肉|肉片|肉排|火腿|培根|香腸|豆腐|豆干)/.test(value)) {
    return false;
  }

  return /(茶葉蛋|雞蛋糕|蛋塔|雞蛋仔|牛角麵包|牛舌餅|豬血糕|肉桂|肉桂捲|鯛魚燒|章魚燒|雞蛋布丁|蛋糕|蛋捲)/.test(value);
}

function hasCarbDenseSnackText(text) {
  return /(dessert|starch|pasta|蛋塔|雞蛋糕|雞蛋仔|蛋糕|蛋捲|車輪餅|鯛魚燒|豆花|剉冰|珍珠|奶茶|牛角麵包|麵包|吐司|貝果|鬆餅|餅乾|塔|派|地瓜球|章魚燒|水餃|蒸餃|鍋貼|小籠包|燒賣|肉圓|豬血糕|胡椒餅)/.test(String(text || ''));
}

function getNutritionGuardrailText(estimate) {
  return [
    estimate.meal_name || '',
    (estimate.items || []).map(function (item) {
      return [item.name, item.portion_description].join(' ');
    }).join(' ')
  ].join(' ');
}
