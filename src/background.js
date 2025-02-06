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