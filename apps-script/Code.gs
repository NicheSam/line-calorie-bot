function doPost(e) {
  var config;
  var rawBody = e && e.postData ? e.postData.contents : '';

  try {
    config = getConfig();
    ensureSheets(config);
    appendWebhookDebug({
      timestamp: nowIso(config),
      stage: 'doPost_received',
      raw_body: truncateText(rawBody, 45000),
      error: ''
    }, config);

    // Apps Script Web Apps do not reliably expose request headers, including
    // LINE's x-line-signature. Strict signature verification requires Vercel
    // or another HTTP runtime that exposes raw headers.
    var body = JSON.parse(rawBody);
    var events = body.events || [];
    appendWebhookDebug({
      timestamp: nowIso(config),
      stage: 'events_count_' + events.length,
      raw_body: truncateText(rawBody, 45000),
      error: ''
    }, config);

    events.forEach(function (event) {
      try {
        processLineEvent(event, config);
      } catch (error) {
        appendSystemEvent({
          timestamp: nowIso(config),
          user_id: event && event.source ? event.source.userId || '' : '',
          message_type: event && event.message ? event.message.type || '' : '',
          event_type: event ? event.type || '' : '',
          action_taken: 'error',
          success: false,
          error: error.stack || error.message || String(error),
          raw_event: stringifyJson(event)
        }, config);

        if (event && event.replyToken) {
          try {
            replyToLine(event.replyToken, 'Processing failed. Please try again later.', config);
          } catch (replyError) {
            appendSystemEvent({
              timestamp: nowIso(config),
              user_id: event && event.source ? event.source.userId || '' : '',
              message_type: 'reply',
              event_type: 'error',
              action_taken: 'reply_error_failed',
              success: false,
              error: replyError.stack || replyError.message || String(replyError),
              raw_event: stringifyJson(event)
            }, config);
          }
        }
      }
    });

    return jsonOutput({ ok: true });
  } catch (error) {
    try {
      if (config) {
        appendSystemEvent({
          timestamp: nowIso(config),
          message_type: 'webhook',
          event_type: 'fatal',
          action_taken: 'doPost_failed',
          success: false,
          error: error.stack || error.message || String(error),
          raw_event: rawBody
        }, config);
      }
    } catch (logError) {
      console.error(logError);
    }

    return jsonOutput({ ok: false, error: error.message || String(error) });
  }
}

function doGet() {
  return ContentService.createTextOutput('LINE Calorie Tracker Apps Script is running.');
}

function setupSheets() {
  var config = getConfig();
  ensureSheets(config);
  appendDefaultFoodRulesIfEmpty(config);
  return 'Sheets initialized';
}
