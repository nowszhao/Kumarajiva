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
    const { url, options, isStreaming, portId } = message;
    console.log('Background: Received proxyFetch request:', { url, isStreaming, portId });
    
    if (isStreaming) {
      // For streaming requests, we need to wait for the port connection
      console.log('Background: Waiting for port connection:', portId);
      return true;
    } else {
      // Original non-streaming behavior
      console.log('Background: Starting non-streaming fetch request');
      fetch(url, options)
        .then(async (response) => {
          console.log('Background: Received non-streaming response:', { 
            ok: response.ok, 
            status: response.status 
          });
          const text = await response.text();
          sendResponse({
            success: response.ok,
            status: response.status,
            body: text
          });
        })
        .catch(error => {
          console.error('Background: Non-streaming fetch error:', error);
          sendResponse({
            success: false,
            error: error.message
          });
        });
      return true;
    }
  }
});

// Handle streaming connections
chrome.runtime.onConnect.addListener((port) => {
  console.log('Background: Received port connection:', port.name);
  
  port.onMessage.addListener((message) => {
    if (message.type === 'proxyFetch') {
      const { url, options } = message;
      console.log('Background: Starting streaming fetch request');
      
      fetch(url, options)
        .then(response => {
          console.log('Background: Received initial response:', { 
            ok: response.ok, 
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries())
          });

          if (!response.ok) {
            console.error('Background: HTTP error response:', response.status);
            port.postMessage({
              type: 'error',
              error: `HTTP error! status: ${response.status}`
            });
            port.disconnect();
            return;
          }

          if (!response.body) {
            console.error('Background: Response body is not readable');
            port.postMessage({
              type: 'error',
              error: 'Response body is not readable'
            });
            port.disconnect();
            return;
          }

          const reader = response.body.getReader();
          console.log('Background: Created reader for streaming response');
          
          // Stream the response back to content script
          function pump() {
            console.log('Background: Pumping next chunk');
            return reader.read().then(({done, value}) => {
              if (done) {
                console.log('Background: Stream complete, sending done signal');
                try {
                  port.postMessage({ type: 'done' });
                  port.disconnect();
                } catch (e) {
                  console.error('Background: Error sending done signal:', e);
                }
                return;
              }
              
              // Send chunk to content script
              if (value && value.length > 0) {
                console.log('Background: Sending chunk of size:', value.length);
                try {
                  port.postMessage({
                    type: 'chunk',
                    value: Array.from(value) // Convert Uint8Array to regular array for transfer
                  });
                } catch (e) {
                  console.error('Background: Error sending chunk:', e);
                  port.disconnect();
                  return;
                }
              } else {
                console.log('Background: Received empty chunk, skipping');
              }
              
              return pump();
            }).catch(error => {
              console.error('Background: Error during read:', error);
              try {
                port.postMessage({
                  type: 'error',
                  error: error.message
                });
              } catch (e) {
                console.error('Background: Failed to send error response:', e);
              }
              port.disconnect();
            });
          }
          
          pump().catch(error => {
            console.error('Background: Error during stream pump:', error);
            try {
              port.postMessage({
                type: 'error',
                error: error.message
              });
            } catch (e) {
              console.error('Background: Failed to send pump error response:', e);
            }
            port.disconnect();
          });
        })
        .catch(error => {
          console.error('Background: Fetch error:', error);
          try {
            port.postMessage({
              type: 'error',
              error: error.message
            });
          } catch (e) {
            console.error('Background: Failed to send fetch error response:', e);
          }
          port.disconnect();
        });
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('Background: Port disconnected:', port.name);
  });
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