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
  
  // 处理元宝API - 创建会话
  if (request.type === 'YUANBAO_CREATE_CONVERSATION') {
    console.log('元宝API - 创建会话请求:', {
      url: 'http://47.121.117.100:3000/api/llm/conversation/create',
      method: 'POST',
      body: {
        agentId: "naQivTmsDa",
        cookie: request.apiToken ? '已提供' : '未提供' // 不打印实际token，只显示是否提供
      }
    });
    
    fetch('http://47.121.117.100:3000/api/llm/conversation/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agentId: "naQivTmsDa",
        cookie: request.apiToken,
      })
    })
    .then(response => response.json())
    .then(data => {
      console.log('元宝API - 创建会话响应:', data);
      sendResponse({ success: true, data });
    })
    .catch(error => {
      console.error('YuanBao API error:', error);
      console.log('元宝API - 创建会话错误:', error.message);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
  
  // 处理元宝API - 翻译
  if (request.type === 'YUANBAO_TRANSLATE') {
    console.log('元宝API - 翻译请求:', {
      url: `http://47.121.117.100:3000/api/llm/chat/${request.chatId}`,
      method: 'POST',
      body: {
        prompt: request.text,
        cookie: request.apiToken ? '已提供' : '未提供', // 不打印实际token，只显示是否提供
        agentId: "naQivTmsDa",
        model: request.model || "gpt_175B_0404"
      }
    });
    
    fetch(`http://47.121.117.100:3000/api/llm/chat/${request.chatId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: request.text,
        cookie: request.apiToken,
        agentId: "naQivTmsDa",
        model: request.model || "gpt_175B_0404"
      })
    })
    .then(response => response.json())
    .then(data => {
      console.log('元宝API - 翻译响应:', data);
      sendResponse({ success: true, data });
    })
    .catch(error => {
      console.error('YuanBao translation error:', error);
      console.log('元宝API - 翻译错误:', error.message);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});