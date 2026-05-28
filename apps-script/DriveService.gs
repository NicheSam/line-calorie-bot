function getRootFolder(config) {
  return DriveApp.getFolderById(config.driveRootFolderId);
}

function getOrCreateChildFolder(parentFolder, folderName) {
  var iterator = parentFolder.getFoldersByName(folderName);

  if (iterator.hasNext()) {
    return iterator.next();
  }

  return parentFolder.createFolder(folderName);
}

function getNestedFolder(rootFolder, folderNames) {
  return folderNames.reduce(function (folder, folderName) {
    return getOrCreateChildFolder(folder, folderName);
  }, rootFolder);
}

function saveFoodPhotoToDrive(blob, metadata, config) {
  var rootFolder = getRootFolder(config);
  var dateParts = driveDateParts(metadata.timestamp, config);
  var folder = getNestedFolder(rootFolder, [
    'images',
    'food_photos',
    dateParts.year,
    dateParts.month
  ]);
  var fileName = [
    dateParts.stamp,
    sanitizeForFileName(metadata.userId),
    'food',
    metadata.messageId
  ].join('_') + '.jpg';
  var file = folder.createFile(blob.setName(fileName));

  return {
    fileId: file.getId(),
    driveUrl: file.getUrl(),
    fileName: fileName
  };
}

function saveNutritionLabelPhotoToDrive(blob, metadata, config) {
  var rootFolder = getRootFolder(config);
  var dateParts = driveDateParts(metadata.timestamp, config);
  var folder = getNestedFolder(rootFolder, [
    'images',
    'nutrition_labels',
    dateParts.year,
    dateParts.month
  ]);
  var fileName = [
    dateParts.stamp,
    sanitizeForFileName(metadata.userId),
    'nutrition_label',
    metadata.messageId
  ].join('_') + '.jpg';
  var file = folder.createFile(blob.setName(fileName));

  return {
    fileId: file.getId(),
    driveUrl: file.getUrl(),
    fileName: fileName
  };
}

function saveBodyMetricPhotoToDrive(blob, metadata, config) {
  var rootFolder = getRootFolder(config);
  var dateParts = driveDateParts(metadata.timestamp, config);
  var folder = getNestedFolder(rootFolder, [
    'images',
    'body_metrics',
    dateParts.year,
    dateParts.month
  ]);
  var fileName = [
    dateParts.stamp,
    sanitizeForFileName(metadata.userId),
    'body_metric',
    metadata.messageId
  ].join('_') + '.jpg';
  var file = folder.createFile(blob.setName(fileName));

  return {
    fileId: file.getId(),
    driveUrl: file.getUrl(),
    fileName: fileName
  };
}

function trashDriveFileById(fileId) {
  if (!fileId) {
    return false;
  }

  DriveApp.getFileById(fileId).setTrashed(true);
  return true;
}

function saveDailyMemoryMarkdown(markdown, userId, date, config) {
  var rootFolder = getRootFolder(config);
  var folder = getNestedFolder(rootFolder, ['memory_md', 'daily']);
  var fileName = date + '_' + sanitizeForFileName(userId) + '.md';
  var existing = folder.getFilesByName(fileName);
  var file;

  if (existing.hasNext()) {
    file = existing.next();
    file.setContent(markdown);
  } else {
    file = folder.createFile(fileName, markdown, MimeType.PLAIN_TEXT);
  }

  return {
    fileId: file.getId(),
    driveUrl: file.getUrl(),
    fileName: fileName
  };
}

function saveWeeklyMemoryMarkdown(markdown, userId, startDate, endDate, config) {
  var rootFolder = getRootFolder(config);
  var folder = getNestedFolder(rootFolder, ['memory_md', 'weekly']);
  var fileName = startDate + '_' + endDate + '_' + sanitizeForFileName(userId) + '.md';
  var existing = folder.getFilesByName(fileName);
  var file;

  if (existing.hasNext()) {
    file = existing.next();
    file.setContent(markdown);
  } else {
    file = folder.createFile(fileName, markdown, MimeType.PLAIN_TEXT);
  }

  return {
    fileId: file.getId(),
    driveUrl: file.getUrl(),
    fileName: fileName
  };
}

function saveCorrectionLearningMarkdown(markdown, userId, date, config) {
  var rootFolder = getRootFolder(config);
  var folder = getNestedFolder(rootFolder, ['memory_md', 'correction_learning']);
  var fileName = date + '_' + sanitizeForFileName(userId) + '_correction_learning.md';
  var existing = folder.getFilesByName(fileName);
  var file;

  if (existing.hasNext()) {
    file = existing.next();
    file.setContent(markdown);
  } else {
    file = folder.createFile(fileName, markdown, MimeType.PLAIN_TEXT);
  }

  return {
    fileId: file.getId(),
    driveUrl: file.getUrl(),
    fileName: fileName
  };
}
