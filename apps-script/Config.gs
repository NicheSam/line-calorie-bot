var CONFIG_PROPERTY_KEYS = {
  LINE_CHANNEL_SECRET: 'LINE_CHANNEL_SECRET',
  LINE_CHANNEL_ACCESS_TOKEN: 'LINE_CHANNEL_ACCESS_TOKEN',
  GEMINI_API_KEY: 'GEMINI_API_KEY',
  SHEET_ID: 'SHEET_ID',
  DRIVE_ROOT_FOLDER_ID: 'DRIVE_ROOT_FOLDER_ID',
  TIMEZONE: 'TIMEZONE',
  GEMINI_MODEL: 'GEMINI_MODEL',
  DEFAULT_TARGET_CALORIES: 'DEFAULT_TARGET_CALORIES',
  DEFAULT_PROTEIN_TARGET_G: 'DEFAULT_PROTEIN_TARGET_G',
  RICH_MENU_IMAGE_FILE_ID: 'RICH_MENU_IMAGE_FILE_ID'
};

function getConfig() {
  return {
    lineChannelSecret: getRequiredProperty(CONFIG_PROPERTY_KEYS.LINE_CHANNEL_SECRET),
    lineChannelAccessToken: getRequiredProperty(CONFIG_PROPERTY_KEYS.LINE_CHANNEL_ACCESS_TOKEN),
    geminiApiKey: getRequiredProperty(CONFIG_PROPERTY_KEYS.GEMINI_API_KEY),
    sheetId: getRequiredProperty(CONFIG_PROPERTY_KEYS.SHEET_ID),
    driveRootFolderId: getRequiredProperty(CONFIG_PROPERTY_KEYS.DRIVE_ROOT_FOLDER_ID),
    timezone: getOptionalProperty(CONFIG_PROPERTY_KEYS.TIMEZONE, 'Asia/Taipei'),
    geminiModel: getOptionalProperty(CONFIG_PROPERTY_KEYS.GEMINI_MODEL, 'gemini-3.1-flash-lite'),
    defaultTargetCalories: Number(getOptionalProperty(CONFIG_PROPERTY_KEYS.DEFAULT_TARGET_CALORIES, '2100')),
    defaultProteinTargetG: Number(getOptionalProperty(CONFIG_PROPERTY_KEYS.DEFAULT_PROTEIN_TARGET_G, '130')),
    richMenuImageFileId: getOptionalProperty(CONFIG_PROPERTY_KEYS.RICH_MENU_IMAGE_FILE_ID, '')
  };
}

function getRequiredProperty(name) {
  var value = PropertiesService.getScriptProperties().getProperty(name);

  if (!value) {
    throw new Error('Missing required Script Property: ' + name);
  }

  return value;
}

function getOptionalProperty(name, fallback) {
  var value = PropertiesService.getScriptProperties().getProperty(name);
  return value || fallback;
}
