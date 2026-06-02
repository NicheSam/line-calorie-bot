function verifyLineSignature(rawBody, signature, channelSecret) {
  if (!signature) {
    return false;
  }

  var signatureBytes = Utilities.computeHmacSha256Signature(rawBody, channelSecret);
  var digest = Utilities.base64Encode(signatureBytes);
  return digest === signature;
}

function replyToLine(replyToken, text, config) {
  replyMessagesToLine(replyToken, [
    {
      type: 'text',
      text: truncateText(text, 4900)
    }
  ], config);
}

function replyFlexToLine(replyToken, flexMessage, fallbackText, config) {
  try {
    replyMessagesToLine(replyToken, [flexMessage], config);
  } catch (error) {
    replyToLine(replyToken, fallbackText, config);
  }
}

function replyMessagesToLine(replyToken, messages, config) {
  var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + config.lineChannelAccessToken
    },
    payload: JSON.stringify({
      replyToken: replyToken,
      messages: messages
    }),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error('LINE reply failed: ' + status + ' ' + response.getContentText());
  }
}

function pushToLine(userId, text, config) {
  if (!userId) {
    throw new Error('LINE push failed: missing userId');
  }

  var response = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + config.lineChannelAccessToken
    },
    payload: JSON.stringify({
      to: userId,
      messages: [
        {
          type: 'text',
          text: truncateText(text, 4900)
        }
      ]
    }),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error('LINE push failed: ' + status + ' ' + response.getContentText());
  }
}

function getLineMessageContent(messageId, config) {
  var response = UrlFetchApp.fetch(
    'https://api-data.line.me/v2/bot/message/' + encodeURIComponent(messageId) + '/content',
    {
      method: 'get',
      headers: {
        Authorization: 'Bearer ' + config.lineChannelAccessToken
      },
      muteHttpExceptions: true
    }
  );

  var status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error('LINE content download failed: ' + status + ' ' + response.getContentText());
  }

  return response.getBlob();
}
