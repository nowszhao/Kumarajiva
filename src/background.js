// 监听标签页更新和历史记录变化
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 检查 URL 变化和页面加载完成
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
    chrome.tabs.sendMessage(tabId, { 
      type: 'VIDEO_CHANGED',
      url: tab.url
    });
  }
});

// 添加历史记录变化监听
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.url.includes('youtube.com/watch')) {
    chrome.tabs.sendMessage(details.tabId, {
      type: 'VIDEO_CHANGED',
      url: details.url
    });
  }
}, {
  url: [{
    hostEquals: 'www.youtube.com',
    pathPrefix: '/watch'
  }]
});

// Add proxyFetch handler to forward requests to http://47.121.117.100
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'proxyFetch') {
    const { url, options } = message;
    fetch(url, options)
      .then(async (response) => {
        const text = await response.text();
        sendResponse({
          success: response.ok,
          status: response.status,
          body: text
        });
      })
      .catch(error => {
        sendResponse({
          success: false,
          error: error.message
        });
      });
    // Return true to indicate that the response will be sent asynchronously.
    return true;
  }
}); 

chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
}); 


// 处理有道词典 API 请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_WORD_INFO') {
      fetch(`https://dict.youdao.com/jsonapi_s?doctype=json&jsonversion=4&q=${encodeURIComponent(request.word)}`, {
          headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
      })
      .then(response => response.json())
      .then(data => {
          sendResponse({ success: true, data });
      })
      .catch(error => {
          sendResponse({ success: false, error: error.message });
      });
      return true;
  }

  // 处理音频数据请求
  if (request.type === 'FETCH_AUDIO') {
    fetch(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(request.word)}&type=${request.audioType || 2}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.arrayBuffer(); // 使用 arrayBuffer 而不是 blob
        })
        .then(buffer => {
            sendResponse({ 
                success: true, 
                data: Array.from(new Uint8Array(buffer)) // 转换为数组以便传输
            });
        })
        .catch(error => {
            console.error('Audio fetch error:', error);
            sendResponse({ 
                success: false, 
                error: error.message 
            });
        });
    return true;
  }
});