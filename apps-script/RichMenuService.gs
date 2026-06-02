function setupRichMenu() {
  var config = getConfig();

  if (!config.richMenuImageFileId) {
    throw new Error('Missing optional Script Property for Rich Menu setup: RICH_MENU_IMAGE_FILE_ID');
  }

  var richMenuId = createLineRichMenu(config);
  uploadRichMenuImage(richMenuId, config);
  setDefaultRichMenu(richMenuId, config);
  return 'Rich Menu created and set as default: ' + richMenuId;
}

function createLineRichMenu(config) {
  var payload = {
    size: {
      width: 2500,
      height: 1686
    },
    selected: true,
    name: 'line-calorie-bot-main-menu',
    chatBarText: '開啟功能選單',
    areas: [
      richMenuArea(0, 0, 833, 843, '今日'),
      richMenuArea(833, 0, 834, 843, '記體重'),
      richMenuArea(1667, 0, 833, 843, '記飲食'),
      richMenuArea(0, 843, 833, 843, '本週總結'),
      richMenuArea(833, 843, 834, 843, 'API額度'),
      richMenuArea(1667, 843, 833, 843, 'AI教練')
    ]
  };
  var response = lineRichMenuFetch(
    'https://api.line.me/v2/bot/richmenu',
    'post',
    payload,
    config
  );
  return response.richMenuId;
}

function richMenuArea(x, y, width, height, text) {
  return {
    bounds: {
      x: x,
      y: y,
      width: width,
      height: height
    },
    action: {
      type: 'message',
      text: text
    }
  };
}

function uploadRichMenuImage(richMenuId, config) {
  var file = DriveApp.getFileById(config.richMenuImageFileId);
  var blob = file.getBlob();
  var contentType = blob.getContentType() || 'image/png';
  var response = UrlFetchApp.fetch(
    'https://api-data.line.me/v2/bot/richmenu/' + encodeURIComponent(richMenuId) + '/content',
    {
      method: 'post',
      contentType: contentType,
      payload: blob.getBytes(),
      headers: {
        Authorization: 'Bearer ' + config.lineChannelAccessToken
      },
      muteHttpExceptions: true
    }
  );
  var status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    throw new Error('LINE rich menu image upload failed: ' + status + ' ' + response.getContentText());
  }
}

function setDefaultRichMenu(richMenuId, config) {
  lineRichMenuFetch(
    'https://api.line.me/v2/bot/user/all/richmenu/' + encodeURIComponent(richMenuId),
    'post',
    null,
    config
  );
}

function lineRichMenuFetch(url, method, payload, config) {
  var options = {
    method: method,
    headers: {
      Authorization: 'Bearer ' + config.lineChannelAccessToken
    },
    muteHttpExceptions: true
  };

  if (payload) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }

  var response = UrlFetchApp.fetch(url, options);
  var status = response.getResponseCode();
  var text = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error('LINE rich menu request failed: ' + status + ' ' + text);
  }

  return text ? JSON.parse(text) : {};
}
