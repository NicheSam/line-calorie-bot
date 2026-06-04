function replyMealEstimateFlex(replyToken, estimate, summary, fallbackText, config) {
  replyFlexToLine(replyToken, buildMealEstimateFlexMessage(estimate, summary), fallbackText, config);
}

function replyDailySummaryFlex(replyToken, summary, fallbackText, config) {
  replyFlexToLine(replyToken, buildDailySummaryFlexMessage(summary), fallbackText, config);
}

function replyInstantWeeklySummaryFlex(replyToken, weeklySummary, fallbackText, config) {
  replyFlexToLine(replyToken, buildInstantWeeklySummaryFlexMessage(weeklySummary), fallbackText, config);
}

function buildMealEstimateFlexMessage(estimate, summary) {
  var calories = Math.round(toNumber(estimate.total.calories_kcal, 0));
  var protein = Math.round(toNumber(estimate.total.protein_g, 0));
  var carbs = Math.round(toNumber(estimate.total.carbs_g, 0));
  var fat = Math.round(toNumber(estimate.total.fat_g, 0));
  var confidence = translateConfidence(estimate.confidence);
  var progress = progressPercent(summary.totalCalories, summary.targetCalories);
  var metaRows = buildMealEstimateMetaRows(estimate);
  var bodyContents = [
    flexMetricRow('熱量', calories + ' kcal', true),
    flexMetricRow('蛋白質', protein + ' g', false),
    flexMacroLine(protein, carbs, fat)
  ];

  if (metaRows) {
    bodyContents.push(metaRows);
  }

  bodyContents = bodyContents.concat([
    flexSeparator(),
    flexText('今日進度', '#333333', 'md', 'bold'),
    flexProgressBar(progress),
    flexMetricRow('已攝取', Math.round(summary.totalCalories) + ' / ' + summary.targetCalories + ' kcal', false),
    flexMetricRow('蛋白質', Math.round(summary.totalProtein) + ' / ' + summary.proteinTarget + ' g', false),
    flexMetricRow('信心', confidence, false),
    flexHintText(buildMealFlexHint(estimate, summary))
  ]);

  return {
    type: 'flex',
    altText: '已完成餐點記錄：' + estimate.meal_name,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#4C8C4A',
        paddingAll: '18px',
        contents: [
          flexText('已完成記錄', '#FFFFFF', 'sm', 'bold'),
          flexText(truncateText(estimate.meal_name || '未命名餐點', 40), '#FFFFFF', 'xl', 'bold', true)
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: bodyContents
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          flexMessageButton('今日', '今日', '#DDEEDD'),
          flexMessageButton('不記錄', '不記錄', '#F7E3E3')
        ]
      }
    }
  };
}

function buildMealEstimateMetaRows(estimate) {
  var contents = [];

  if (estimate.sourceType === 'nutrition_label') {
    contents.push(flexMetricRow('來源', '營養標示（' + translateServingBasis(estimate.servingBasis) + '）', false));

    if (estimate.servingSize) {
      contents.push(flexMetricRow('份量', estimate.servingSize, false));
    }
  }

  if (contents.length === 0) {
    return null;
  }

  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'xs',
    contents: contents
  };
}

function buildInstantWeeklySummaryFlexMessage(weeklySummary) {
  var trend = weeklySummary.trendSnapshot || {};
  var weekRange = weeklySummary.weekRange || {};
  var adviceLines = extractFlexAdviceLines(weeklySummary.adviceText || weeklySummary.text, 3);

  return {
    type: 'flex',
    altText: '本週總結：' + (trend.meal_count || 0) + ' 餐 / ' + (trend.logged_days || 0) + ' 天',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#6B55A3',
        paddingAll: '18px',
        contents: [
          flexText('本週即時總結', '#FFFFFF', 'md', 'bold'),
          flexText((weekRange.startDate || '') + ' - ' + (weekRange.endDate || ''), '#FFFFFF', 'sm', 'regular')
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          flexMetricRow('紀錄', (trend.meal_count || 0) + ' 餐 / ' + (trend.logged_days || 0) + ' 天', true),
          flexMetricRow('平均熱量', (trend.avg_calories_per_logged_day || 0) + ' kcal / 日', false),
          flexMetricRow('平均蛋白質', (trend.avg_protein_per_logged_day || 0) + ' g / 日', false),
          flexMetricRow('資料品質', '修正 ' + (weeklySummary.correctedCount || 0) + '，低信心 ' + (weeklySummary.lowConfidenceCount || 0), false),
          flexSeparator(),
          flexText('下週重點', '#333333', 'md', 'bold'),
          flexAdviceList(adviceLines)
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          flexMessageButton('今日', '今日', '#DDEEDD'),
          flexMessageButton('AI教練', 'AI教練', '#E8EEF8')
        ]
      }
    }
  };
}

function buildDailySummaryFlexMessage(summary) {
  var progress = progressPercent(summary.totalCalories, summary.targetCalories);
  var proteinProgress = progressPercent(summary.totalProtein, summary.proteinTarget);

  return {
    type: 'flex',
    altText: '今日狀態：' + Math.round(summary.totalCalories) + ' / ' + summary.targetCalories + ' kcal',
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#4C8C4A',
        paddingAll: '18px',
        contents: [
          flexText('今日熱量狀態', '#FFFFFF', 'md', 'bold'),
          flexText(Math.round(summary.totalCalories) + ' / ' + summary.targetCalories + ' kcal', '#FFFFFF', 'xxl', 'bold')
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'md',
        contents: [
          flexProgressBar(progress),
          flexMetricRow('剩餘熱量', formatCalorieGap(summary).replace('剩餘：約 ', '').replace('超出：約 ', '超出 '), false),
          flexSeparator(),
          flexText('三大營養素', '#333333', 'md', 'bold'),
          flexMetricRow('蛋白質', Math.round(summary.totalProtein) + ' / ' + summary.proteinTarget + ' g', false),
          flexProgressBar(proteinProgress),
          flexMetricRow('碳水', Math.round(summary.totalCarbs) + ' g', false),
          flexMetricRow('脂肪', Math.round(summary.totalFat) + ' g', false),
          flexSeparator(),
          flexMetricRow('今日紀錄', summary.mealCount + ' 餐', false)
        ]
      },
      footer: {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        contents: [
          flexMessageButton('記飲食', '記飲食', '#DDEEDD'),
          flexMessageButton('本週趨勢', '本週總結', '#E8EEF8')
        ]
      }
    }
  };
}

function flexAdviceList(lines) {
  var contents = lines.slice(0, 3).map(function (line, index) {
    return {
      type: 'box',
      layout: 'horizontal',
      spacing: 'sm',
      contents: [
        flexText(String(index + 1) + '.', '#6B55A3', 'sm', 'bold', false),
        flexText(line, '#333333', 'sm', 'regular', true)
      ]
    };
  });

  if (contents.length === 0) {
    contents.push(flexText('資料不足，先穩定記錄餐點。', '#333333', 'sm', 'regular', true));
  }

  return {
    type: 'box',
    layout: 'vertical',
    spacing: 'sm',
    contents: contents
  };
}

function extractFlexAdviceLines(text, maxLines) {
  return String(text || '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .split(/\r?\n/)
    .map(function (line) {
      return line.replace(/^\s*(?:\d+[\.\、]|[-・•])\s*/, '').trim();
    })
    .filter(function (line) {
      return line &&
        !/^本週即時總結/.test(line) &&
        !/^趨勢建議/.test(line) &&
        !/^紀錄[：:]/.test(line) &&
        !/^總熱量[：:]/.test(line) &&
        !/^平均/.test(line) &&
        !/^資料品質[：:]/.test(line);
    })
    .slice(0, maxLines || 3);
}

function flexMetricRow(label, value, strong) {
  return {
    type: 'box',
    layout: 'horizontal',
    contents: [
      flexText(label, '#666666', 'sm', 'regular'),
      flexText(String(value), '#222222', strong ? 'xl' : 'sm', strong ? 'bold' : 'bold', false, 'end')
    ]
  };
}

function flexMacroLine(protein, carbs, fat) {
  return flexText('P ' + protein + 'g | C ' + carbs + 'g | F ' + fat + 'g', '#555555', 'sm', 'regular');
}

function flexHintText(text) {
  return {
    type: 'box',
    layout: 'vertical',
    backgroundColor: '#F4F7EF',
    cornerRadius: '8px',
    paddingAll: '10px',
    contents: [
      flexText(text, '#4B6043', 'sm', 'regular', true)
    ]
  };
}

function flexProgressBar(percent) {
  return {
    type: 'box',
    layout: 'vertical',
    height: '8px',
    backgroundColor: '#E6E6E6',
    cornerRadius: '4px',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        width: percent + '%',
        height: '8px',
        backgroundColor: percent >= 100 ? '#C94C4C' : '#5DBB63',
        cornerRadius: '4px',
        contents: []
      }
    ]
  };
}

function flexSeparator() {
  return {
    type: 'separator',
    margin: 'md',
    color: '#E4E4E4'
  };
}

function flexMessageButton(label, text, color) {
  return {
    type: 'button',
    style: 'secondary',
    color: color,
    height: 'sm',
    action: {
      type: 'message',
      label: label,
      text: text
    }
  };
}

function flexText(text, color, size, weight, wrap, align) {
  var node = {
    type: 'text',
    text: String(text || ''),
    color: color || '#333333',
    size: size || 'sm',
    weight: weight || 'regular',
    wrap: Boolean(wrap)
  };

  if (align) {
    node.align = align;
  }

  return node;
}

function progressPercent(value, target) {
  var total = Math.max(0, toNumber(value, 0));
  var goal = Math.max(1, toNumber(target, 1));
  return Math.max(0, Math.min(100, Math.round((total / goal) * 100)));
}

function buildMealFlexHint(estimate, summary) {
  if (typeof buildPostMealReminder === 'function') {
    return buildPostMealReminder({
      calories: estimate.total.calories_kcal,
      protein: estimate.total.protein_g,
      carbs: estimate.total.carbs_g,
      fat: estimate.total.fat_g,
      confidence: estimate.confidence,
      servingBasis: estimate.servingBasis,
      sourceType: estimate.sourceType || 'meal_photo'
    }, summary);
  }

  return '可回覆「改700 P30」修正，或「不記錄」刪除上一筆。';
}
