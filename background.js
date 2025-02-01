// 监听标签页更新
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 不再发送 VIDEO_CHANGED 消息
  // if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
  //   chrome.tabs.sendMessage(tabId, { type: 'VIDEO_CHANGED' });
  // }
}); 