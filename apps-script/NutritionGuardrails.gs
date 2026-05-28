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

  return {
    text: text,
    hasAnimalProtein: /(雞|雞腿|雞胸|豬|牛|魚|鮭|蝦|蛋|豆腐|肉)/.test(text),
    hasChickenThigh: /(雞腿|腿肉|去骨雞腿)/.test(text),
    hasFattyMeat: /(雞腿|腿肉|五花|培根|控肉|滷肉|炸|酥|煎)/.test(text),
    hasStarch: /(飯|白飯|糙米|麵|義大利麵|麵包|吐司|馬鈴薯|地瓜|玉米|粥|米粉|冬粉)/.test(text),
    hasVegetableOnlyCarb: /(花椰菜|青花菜|櫛瓜|高麗菜|青菜|菠菜|菇|菇類|生菜)/.test(text)
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
  if (!context.hasStarch && estimate.total.carbs_g > 40) {
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

  if (estimate.uncertainty_factors.indexOf(message) < 0) {
    estimate.uncertainty_factors.push(message);
  }
}

function getNutritionGuardrailText(estimate) {
  return [
    estimate.meal_name || '',
    (estimate.items || []).map(function (item) {
      return [item.name, item.portion_description].join(' ');
    }).join(' ')
  ].join(' ');
}
