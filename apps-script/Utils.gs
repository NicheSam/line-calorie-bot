function createUuid() {
  return Utilities.getUuid();
}

function nowIso(config) {
  return formatTaipeiDateTime(new Date(), config);
}

function todayDate(config) {
  return Utilities.formatDate(new Date(), config.timezone, 'yyyy-MM-dd');
}

function eventTimestampIso(timestamp, config) {
  return formatTaipeiDateTime(new Date(timestamp || Date.now()), config);
}

function eventDate(timestamp, config) {
  return Utilities.formatDate(new Date(timestamp || Date.now()), config.timezone, 'yyyy-MM-dd');
}

function formatTaipeiDateTime(date, config) {
  return Utilities.formatDate(date, config.timezone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function driveDateParts(timestamp, config) {
  var date = new Date(timestamp || Date.now());

  return {
    year: Utilities.formatDate(date, config.timezone, 'yyyy'),
    month: Utilities.formatDate(date, config.timezone, 'MM'),
    stamp: Utilities.formatDate(date, config.timezone, 'yyyyMMdd_HHmmss')
  };
}

function sanitizeForFileName(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(-16) || 'user';
}

function stringifyJson(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
}

function truncateText(value, maxLength) {
  var text = String(value || '');
  return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
}

function toNumber(value, fallback) {
  var number = Number(value);
  return isFinite(number) ? number : fallback;
}

function roundNonNegative(value) {
  var number = Number(value);
  return isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function extractJsonObject(text) {
  var raw = String(text || '').trim();

  try {
    return JSON.parse(raw);
  } catch (error) {
    var start = raw.indexOf('{');
    var end = raw.lastIndexOf('}');

    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }

    throw error;
  }
}

function jsonOutput(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

