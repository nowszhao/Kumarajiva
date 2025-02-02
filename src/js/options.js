document.addEventListener('DOMContentLoaded', async () => {
    // 加载保存的设置
    const settings = await chrome.storage.sync.get(['translationService', 'apiToken']);
    if (settings.translationService) {
        document.getElementById('translationService').value = settings.translationService;
    }
    if (settings.apiToken) {
        document.getElementById('apiToken').value = settings.apiToken;
    }

    // 保存设置
    document.getElementById('settingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const translationService = document.getElementById('translationService').value;
        const apiToken = document.getElementById('apiToken').value;

        try {
            await chrome.storage.sync.set({
                translationService,
                apiToken
            });
            showStatus('Settings saved successfully!', 'success');
        } catch (error) {
            showStatus('Error saving settings: ' + error.message, 'error');
        }
    });

    // 测试连接
    document.getElementById('testConnection').addEventListener('click', async () => {
        const translationService = document.getElementById('translationService').value;
        const apiToken = document.getElementById('apiToken').value;

        showStatus('Testing connection...', 'info');

        try {
            const response = await testConnection(translationService, apiToken);
            if (response.success) {
                showStatus('Connection successful!', 'success');
            } else {
                showStatus('Connection failed: ' + response.message, 'error');
            }
        } catch (error) {
            showStatus('Connection test failed: ' + error.message, 'error');
        }
    });
});

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    status.style.display = 'block';

    // 3秒后隐藏消息
    setTimeout(() => {
        status.style.display = 'none';
    }, 3000);
}

async function testConnection(service, token) {
    // 根据不同服务实现测试连接逻辑
    const testEndpoints = {
        kimi: 'https://kimi.moonshot.cn/api/chat',
        doubao: 'https://47.121.117.100:443/v1/chat/completions',
        qwen: 'your_qwen_endpoint'
    };

    try {
        const response = await fetch(testEndpoints[service], {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [{
                    role: "user",
                    content: "test connection"
                }]
            })
        });

        return {
            success: response.ok,
            message: response.ok ? 'Connection successful' : `HTTP ${response.status}`
        };
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
} 