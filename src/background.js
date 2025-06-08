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

// 学习精灵提醒管理
let reminderTimer = null;

// 初始化提醒系统
async function initializeReminderSystem() {
  try {
    const result = await chrome.storage.local.get(['nextReminderTime']);
    const now = Date.now();
    
    if (result.nextReminderTime && result.nextReminderTime > now) {
      // 有有效的提醒时间，继续使用
      const delay = result.nextReminderTime - now;
      console.log(`[Background] 恢复提醒定时器，剩余时间: ${Math.round(delay / 1000 / 60)}分钟`);
      scheduleReminder(delay);
    } else {
      // 没有有效的提醒时间，生成新的
      console.log('[Background] 生成新的提醒时间');
      generateNextReminder();
    }
  } catch (error) {
    console.error('[Background] 初始化提醒系统失败:', error);
    generateNextReminder();
  }
}

// 生成下一次提醒时间
async function generateNextReminder() {
  const minutes = Math.floor(Math.random() * 51) + 10; // 10-60分钟
  const delay = minutes * 60 * 1000;
  const nextReminderTime = Date.now() + delay;
  
  // 保存到存储
  await chrome.storage.local.set({ nextReminderTime });
  
  const timeString = new Date(nextReminderTime).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  console.log(`[Background] 📅 下次学习提醒时间: ${timeString} (${minutes}分钟后)`);
  
  scheduleReminder(delay);
}

// 设置提醒定时器
function scheduleReminder(delay) {
  // 清除现有定时器
  if (reminderTimer) {
    clearTimeout(reminderTimer);
  }
  
  reminderTimer = setTimeout(() => {
    triggerReminder();
  }, delay);
}

// 触发提醒
async function triggerReminder() {
  console.log('[Background] 🔔 触发学习提醒');
  
  try {
    // 通知所有标签页显示提醒
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'LEARNING_ELF_REMINDER'
        });
      } catch (error) {
        // 忽略无法发送消息的标签页（如chrome://页面）
      }
    }
    
    // 生成下一次提醒时间
    generateNextReminder();
  } catch (error) {
    console.error('[Background] 触发提醒失败:', error);
  }
}

// 插件启动时初始化提醒系统
chrome.runtime.onStartup.addListener(() => {
  console.log('[Background] 插件启动，初始化提醒系统');
  initializeReminderSystem();
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Background] 插件安装/更新，初始化提醒系统');
  initializeReminderSystem();
});

// 立即初始化（用于开发时的热重载）
initializeReminderSystem();

// 处理有道词典 API 请求
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 处理获取提醒状态请求
  if (request.type === 'GET_REMINDER_STATUS') {
    chrome.storage.local.get(['nextReminderTime']).then(result => {
      const now = Date.now();
      const nextTime = result.nextReminderTime;
      
      if (nextTime && nextTime > now) {
        const remainingMs = nextTime - now;
        const remainingMinutes = Math.round(remainingMs / 1000 / 60);
        const timeString = new Date(nextTime).toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        
        sendResponse({
          success: true,
          data: {
            nextReminderTime: nextTime,
            remainingMinutes: remainingMinutes,
            timeString: timeString
          }
        });
      } else {
        sendResponse({
          success: false,
          error: 'No valid reminder time'
        });
      }
    }).catch(error => {
      sendResponse({
        success: false,
        error: error.message
      });
    });
    return true;
  }

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

  // 处理学习精灵 - 获取今日单词
  if (request.type === 'LEARNING_ELF_GET_TODAY_WORDS') {
    console.log('学习精灵 - 获取今日单词请求');
    
    // 计算当天的开始和结束时间戳
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const startDate = startOfDay.getTime();
    const endDate = endOfDay.getTime() - 1000; // 减去1秒，确保是当天的结束
    
    const apiUrl = `http://47.121.117.100:3000/api/review/history?startDate=${startDate}&endDate=${endDate}&limit=100&offset=0`;
    console.log('请求URL:', apiUrl);
    
    fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${request.token}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('学习精灵 - 获取今日单词响应:', data);
      // 新API返回的是 { success: true, data: { total: x, data: [...] } }
      // 需要提取 data.data 作为单词数组
      if (data.success && data.data && Array.isArray(data.data.data)) {
        sendResponse({ success: true, data: { success: true, data: data.data.data } });
      } else {
        sendResponse({ success: true, data: { success: true, data: [] } });
      }
    })
    .catch(error => {
      console.error('Learning Elf get today words error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  // 处理学习精灵 - 获取学习测验
  if (request.type === 'LEARNING_ELF_GET_QUIZ') {
    console.log('学习精灵 - 获取学习测验请求，单词:', request.word);
    
    fetch('http://47.121.117.100:3000/api/review/quiz', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${request.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        word: request.word
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('学习精灵 - 获取学习测验响应:', data);
      sendResponse({ success: true, data: data });
    })
    .catch(error => {
      console.error('Learning Elf get quiz error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});