document.addEventListener('DOMContentLoaded', async () => {
    const pluginSwitch = document.getElementById('pluginSwitch');
    
    // 获取当前标签页信息
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const domain = new URL(tab.url).hostname;
    console.log('[Popup] Current domain:', domain);
    
    // 从存储中获取该域名的插件启用状态
    const { pluginStatus = {} } = await chrome.storage.sync.get('pluginStatus');
    const isEnabled = pluginStatus[domain] ?? true;
    console.log('[Popup] Plugin status for domain:', domain, isEnabled);
    pluginSwitch.checked = isEnabled;

    // 检查GitHub登录状态
    const authData = await chrome.storage.sync.get(['githubAccessToken', 'githubUserInfo']);
    if (authData.githubAccessToken && authData.githubUserInfo) {
        const authInfo = document.getElementById('authInfo');
        const userAvatar = document.getElementById('popupUserAvatar');
        const userName = document.getElementById('popupUserName');
        
        userAvatar.src = authData.githubUserInfo.avatar_url || '';
        userName.textContent = authData.githubUserInfo.name || authData.githubUserInfo.login || '';
        authInfo.style.display = 'block';
    }

    // 监听开关变化
    pluginSwitch.addEventListener('change', async (e) => {
        const isEnabled = e.target.checked;
        console.log('[Popup] Switch changed:', isEnabled);
        
        // 更新存储中的状态
        const { pluginStatus = {} } = await chrome.storage.sync.get('pluginStatus');
        pluginStatus[domain] = isEnabled;
        await chrome.storage.sync.set({ pluginStatus });
        console.log('[Popup] Updated storage for domain:', domain, pluginStatus);

        // 通知当前标签页
        try {
            await chrome.tabs.sendMessage(tab.id, {
                type: 'PLUGIN_STATUS_CHANGED',
                isEnabled,
                reload: false
            });
            console.log('[Popup] Message sent to tab:', tab.id);
        } catch (error) {
            console.error('[Popup] Error sending message:', error);
        }
    });
}); 