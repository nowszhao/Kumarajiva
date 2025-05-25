import config from './config/config';
import { VocabularyManager } from './components/vocabularyManager';
import { ManualAddDrawer } from './components/manualAddDrawer';
import { GitHubAuth } from './components/githubAuth';

document.addEventListener('DOMContentLoaded', async () => {
    // 初始化导航切换功能
    initializeNavigation();
    
    // 初始化GitHub认证
    const githubAuth = new GitHubAuth();
    await githubAuth.initialize();
    
    // 加载所有保存的设置
    await loadSettings();

    // 初始化生词表管理
    const vocabularyManager = new VocabularyManager();
    await vocabularyManager.initialize();

    // 初始化认证UI
    await initializeAuthUI(githubAuth, vocabularyManager);

    // 设置表单提交处理
    document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);

    // 测试连接按钮处理
    document.getElementById('testConnection').addEventListener('click', handleTestConnection);

    // 添加还原默认值按钮处理
    document.getElementById('resetDefaults').addEventListener('click', handleResetDefaults);

    // 添加翻译服务切换事件监听
    document.getElementById('translationService').addEventListener('change', handleServiceChange);

    // 初始化手动添加抽屉
    const manualAddDrawer = new ManualAddDrawer();
    
    // 添加按钮点击事件
    document.getElementById('addManually').addEventListener('click', () => {
        manualAddDrawer.show();
    });
});

// 导航切换功能
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // 移除所有活动状态
            navItems.forEach(nav => nav.classList.remove('active'));
            document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
            
            // 添加新的活动状态
            item.classList.add('active');
            const sectionId = item.dataset.section;
            document.getElementById(sectionId).classList.add('active');
        });
    });
}

// 加载设置
async function loadSettings() {
    try {
        // 从 storage 加载所有设置
        const settings = await chrome.storage.sync.get([
            'translationService',
            'serviceTokens',
            'serviceModels',
            'serviceMaxRetries',
            'serviceUrls',
            'fontSize',
            'subtitlePosition',
            'batchSize',
            'batchInterval',
            'maxSubtitles',
            'maxRetries',
            'triggerKey',
            'enableTriggerKey',
            'autoShowWordDetails'
        ]);

        // 设置默认值
        const defaultSettings = {
            translationService: config.translation.defaultService,
            serviceTokens: {},
            serviceModels: {},
            serviceMaxRetries: {},
            serviceUrls: {},
            fontSize: 24,
            subtitlePosition: 'bottom',
            batchSize: config.translation.batchSize,
            batchInterval: config.translation.batchInterval,
            maxSubtitles: config.translation.maxSubtitles,
            maxRetries: config.translation.maxRetries,
            triggerKey: config.translation.interaction.triggerKey,
            enableTriggerKey: config.translation.interaction.enableTriggerKey,
            autoShowWordDetails: config.translation.interaction.autoShowWordDetails
        };

        // 合并默认值和已保存的设置
        const mergedSettings = { ...defaultSettings, ...settings };

        // 更新表单值
        Object.entries(mergedSettings).forEach(([key, value]) => {
            const element = document.getElementById(key);
            if (element && key !== 'serviceTokens' && key !== 'serviceModels' && key !== 'serviceMaxRetries' && key !== 'serviceUrls') {
                if (element.type === 'checkbox') {
                    element.checked = value;
                } else {
                    element.value = value;
                }
            }
        });

        // 如果有选中的翻译服务，加载对应的配置
        if (mergedSettings.translationService) {
            const service = mergedSettings.translationService;
            const storedTokens = mergedSettings.serviceTokens || {};
            const storedModels = mergedSettings.serviceModels || {};
            const storedMaxRetries = mergedSettings.serviceMaxRetries || {};
            const storedUrls = mergedSettings.serviceUrls || {};
            
            // 设置当前选中服务的配置
            document.getElementById('apiToken').value = storedTokens[service] || config[service]?.apiToken || '';
            document.getElementById('model').value = storedModels[service] || config[service]?.model || '';
            document.getElementById('maxRetries').value = storedMaxRetries[service] || config[service]?.maxRetries || 3;
            document.getElementById('serviceUrl').value = storedUrls[service] || config[service]?.url || '';
        }

        // 更新交互设置
        document.getElementById('triggerKey').value = mergedSettings.triggerKey;
        document.getElementById('enableTriggerKey').checked = mergedSettings.enableTriggerKey;
        document.getElementById('autoShowWordDetails').checked = mergedSettings.autoShowWordDetails;

        // 加载同步设置
        const syncSettings = await chrome.storage.sync.get([
            'enableAutoSync',
            'syncInterval',
            'lastSyncTime'
        ]);

        document.getElementById('enableAutoSync').checked = syncSettings.enableAutoSync || false;
        document.getElementById('syncInterval').value = syncSettings.syncInterval || 60;

        // 更新上次同步时间显示
        const lastSyncTime = document.getElementById('lastSyncTime');
        if (syncSettings.lastSyncTime) {
            lastSyncTime.textContent = new Date(syncSettings.lastSyncTime).toLocaleString('zh-CN');
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
        showStatus('加载设置失败: ' + error.message, 'error');
    }
}

// 处理设置提交
async function handleSettingsSubmit(e) {
    e.preventDefault();
    
    try {
        const service = document.getElementById('translationService').value;
        const token = document.getElementById('apiToken').value;
        const model = document.getElementById('model').value;
        const maxRetries = parseInt(document.getElementById('maxRetries').value);
        const serviceUrl = document.getElementById('serviceUrl').value;

        // 验证设置
        if (!token || !model || !serviceUrl) {
            showStatus('请填写所有必填字段', 'error');
            return;
        }

        // 获取当前存储的所有配置
        const { 
            serviceTokens = {}, 
            serviceModels = {}, 
            serviceMaxRetries = {}, 
            serviceUrls = {} 
        } = await chrome.storage.sync.get([
            'serviceTokens',
            'serviceModels',
            'serviceMaxRetries',
            'serviceUrls'
        ]);
        
        // 构建要保存的数据
        const formData = {
            translationService: service,
            serviceTokens: {
                ...serviceTokens,
                [service]: token
            },
            serviceModels: {
                ...serviceModels,
                [service]: model
            },
            serviceMaxRetries: {
                ...serviceMaxRetries,
                [service]: maxRetries
            },
            serviceUrls: {
                ...serviceUrls,
                [service]: serviceUrl
            }
        };

        // 添加其他设置前先检查元素是否存在
        const fontSize = document.getElementById('fontSize');
        const subtitlePosition = document.getElementById('subtitlePosition');
        const batchSize = document.getElementById('batchSize');
        const batchInterval = document.getElementById('batchInterval');
        const maxSubtitles = document.getElementById('maxSubtitles');
        const triggerKey = document.getElementById('triggerKey');
        const enableTriggerKey = document.getElementById('enableTriggerKey');
        const autoShowWordDetails = document.getElementById('autoShowWordDetails');

        // 只有在元素存在时才添加到 formData
        if (fontSize) formData.fontSize = parseInt(fontSize.value);
        if (subtitlePosition) formData.subtitlePosition = subtitlePosition.value;
        if (batchSize) formData.batchSize = parseInt(batchSize.value);
        if (batchInterval) formData.batchInterval = parseInt(batchInterval.value);
        if (maxSubtitles) formData.maxSubtitles = parseInt(maxSubtitles.value);
        if (maxRetries) formData.maxRetries = maxRetries;
        if (triggerKey) formData.triggerKey = triggerKey.value;
        if (enableTriggerKey) formData.enableTriggerKey = enableTriggerKey.checked;
        if (autoShowWordDetails) formData.autoShowWordDetails = autoShowWordDetails.checked;

        // 保存到 storage
        await chrome.storage.sync.set(formData);
        
        // 更新运行时的 config 对象
        if (!config[service]) {
            config[service] = {};
        }
        config[service].apiToken = token;
        config[service].model = model;
        config[service].maxRetries = maxRetries;
        config[service].url = serviceUrl;

        // 更新交互设置
        if (triggerKey && enableTriggerKey && autoShowWordDetails) {
            Object.assign(config.translation.interaction, {
                triggerKey: formData.triggerKey,
                enableTriggerKey: formData.enableTriggerKey,
                autoShowWordDetails: formData.autoShowWordDetails
            });
        }

        // 保存同步设置
        const syncServerUrl = document.getElementById('syncServerUrl');
        const enableAutoSync = document.getElementById('enableAutoSync');
        const syncInterval = document.getElementById('syncInterval');

        if (enableAutoSync && syncInterval) {
            const syncSettings = {
                enableAutoSync: enableAutoSync.checked,
                syncInterval: parseInt(syncInterval.value, 10)
            };

            // 更新同步设置
            const vocabularyManager = new VocabularyManager();
            await vocabularyManager.sync.updateSettings(syncSettings);
        }

        showStatus('设置已保存', 'success');
    } catch (error) {
        console.error('Save settings error:', error);
        showStatus('保存设置失败: ' + error.message, 'error');
    }
}

// 处理测试连接
async function handleTestConnection() {
    const service = document.getElementById('translationService').value;
    const token = document.getElementById('apiToken').value;

    if (!token) {
        showStatus('请先输入 API Token', 'error');
        return;
    }

    showStatus('正在测试连接...', 'info');

    try {
        const response = await testConnection(service, token);
        if (response.success) {
            showStatus('连接成功！', 'success');
        } else {
            showStatus('连接失败: ' + response.message, 'error');
        }
    } catch (error) {
        showStatus('连接测试失败: ' + error.message, 'error');
    }
}

// 测试连接
async function testConnection(service, token) {
    const serviceConfig = config[service];
    if (!serviceConfig || !serviceConfig.url) {
        return { success: false, message: '无效的服务配置' };
    }

    try {
        const response = await fetch(serviceConfig.url, {
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
            message: response.ok ? '连接成功' : `HTTP ${response.status}: ${response.statusText}`
        };
    } catch (error) {
        return {
            success: false,
            message: error.message
        };
    }
}

// 修改还原默认值处理函数
async function handleResetDefaults() {
    try {
        // 从 config.js 获取所有默认值
        const defaultSettings = {
            // 翻译服务设置
            translationService: config.translation.defaultService,
            serviceTokens: {
                kimi: config.kimi.apiToken,
                doubao: config.doubao.apiToken,
                qwen: config.qwen.apiToken,
                deepseek: config.deepseek.apiToken
            },
            serviceModels: {},
            serviceMaxRetries: {},
            serviceUrls: {},
            // 翻译相关配置
            batchSize: config.translation.batchSize,
            batchInterval: config.translation.batchInterval,
            maxSubtitles: config.translation.maxSubtitles,
            maxRetries: config.translation.maxRetries,
            // UI 设置
            fontSize: 24,
            subtitlePosition: 'bottom',
            triggerKey: config.translation.interaction.triggerKey,
            enableTriggerKey: config.translation.interaction.enableTriggerKey,
            autoShowWordDetails: config.translation.interaction.autoShowWordDetails
        };

        // 更新表单值
        const service = defaultSettings.translationService;
        
        // 更新翻译服务选择
        const serviceSelect = document.getElementById('translationService');
        if (serviceSelect) {
            serviceSelect.value = service;
        }

        // 更新对应服务的 API Token
        const apiTokenInput = document.getElementById('apiToken');
        if (apiTokenInput) {
            apiTokenInput.value = defaultSettings.serviceTokens[service];
        }

        // 更新其他 UI 设置
        const fontSizeInput = document.getElementById('fontSize');
        if (fontSizeInput) {
            fontSizeInput.value = defaultSettings.fontSize;
        }

        const positionSelect = document.getElementById('subtitlePosition');
        if (positionSelect) {
            positionSelect.value = defaultSettings.subtitlePosition;
        }

        // 更新交互设置
        document.getElementById('triggerKey').value = defaultSettings.triggerKey;
        document.getElementById('enableTriggerKey').checked = defaultSettings.enableTriggerKey;
        document.getElementById('autoShowWordDetails').checked = defaultSettings.autoShowWordDetails;

        // 保存到 storage
        await chrome.storage.sync.set(defaultSettings);

        // 更新运行时的 config 对象
        Object.assign(config.translation, {
            defaultService: defaultSettings.translationService,
            batchSize: defaultSettings.batchSize,
            batchInterval: defaultSettings.batchInterval,
            maxSubtitles: defaultSettings.maxSubtitles,
            maxRetries: defaultSettings.maxRetries
        });

        // 更新所有服务的 token
        Object.entries(defaultSettings.serviceTokens).forEach(([service, token]) => {
            if (!config[service]) {
                config[service] = {};
            }
            config[service].apiToken = token;
        });

        showStatus('已还原默认设置', 'success');
    } catch (error) {
        console.error('Reset defaults error:', error);
        showStatus('还原默认设置失败: ' + error.message, 'error');
    }
}

// 显示状态消息
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

// 添加服务切换处理函数
async function handleServiceChange(e) {
    const selectedService = e.target.value;
    
    try {
        // 获取所有服务的配置
        const { 
            serviceTokens = {}, 
            serviceModels = {}, 
            serviceMaxRetries = {}, 
            serviceUrls = {} 
        } = await chrome.storage.sync.get([
            'serviceTokens',
            'serviceModels',
            'serviceMaxRetries',
            'serviceUrls'
        ]);
        
        // 更新表单字段
        document.getElementById('apiToken').value = serviceTokens[selectedService] || config[selectedService]?.apiToken || '';
        document.getElementById('model').value = serviceModels[selectedService] || config[selectedService]?.model || '';
        document.getElementById('maxRetries').value = serviceMaxRetries[selectedService] || config[selectedService]?.maxRetries || 3;
        document.getElementById('serviceUrl').value = serviceUrls[selectedService] || config[selectedService]?.url || '';
    } catch (error) {
        console.error('Error loading service configuration:', error);
        // 发生错误时使用 config.js 中的默认值
        const defaultConfig = config[selectedService] || {};
        document.getElementById('apiToken').value = defaultConfig.apiToken || '';
        document.getElementById('model').value = defaultConfig.model || '';
        document.getElementById('maxRetries').value = defaultConfig.maxRetries || 3;
        document.getElementById('serviceUrl').value = defaultConfig.url || '';
    }
}

// 初始化认证UI
async function initializeAuthUI(githubAuth, vocabularyManager) {
    const loginSection = document.getElementById('loginSection');
    const userSection = document.getElementById('userSection');
    const authStatus = document.getElementById('authStatus');
    const githubLogin = document.getElementById('githubLogin');
    const githubLogout = document.getElementById('githubLogout');

    // 更新UI状态
    function updateAuthUI() {
        if (githubAuth.isAuthenticated()) {
            const userInfo = githubAuth.getUserInfo();
            
            // 显示用户信息
            document.getElementById('userName').textContent = userInfo.name || userInfo.login;
            document.getElementById('userEmail').textContent = userInfo.email || '';
            document.getElementById('userAvatar').src = userInfo.avatar_url || '';
            
            // 切换显示状态
            loginSection.style.display = 'none';
            userSection.style.display = 'block';
            authStatus.classList.add('authenticated');
            authStatus.classList.remove('error');
        } else {
            loginSection.style.display = 'block';
            userSection.style.display = 'none';
            authStatus.classList.remove('authenticated');
        }
        
        // 更新同步按钮状态
        if (vocabularyManager && vocabularyManager.sync) {
            vocabularyManager.sync.updateSyncStatus();
        }
    }

    // GitHub登录处理
    githubLogin.addEventListener('click', async () => {
        try {
            githubLogin.disabled = true;
            githubLogin.textContent = '登录中...';
            
            await githubAuth.login();
            updateAuthUI();
            
            // 重新初始化同步功能
            await vocabularyManager.sync.initialize();
            
            showStatus('GitHub登录成功', 'success');
        } catch (error) {
            console.error('GitHub login failed:', error);
            showStatus('GitHub登录失败: ' + error.message, 'error');
            authStatus.classList.add('error');
        } finally {
            githubLogin.disabled = false;
            githubLogin.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16" style="margin-right: 8px;">
                    <path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                登录 GitHub
            `;
        }
    });

    // GitHub登出处理
    githubLogout.addEventListener('click', async () => {
        try {
            await githubAuth.logout();
            updateAuthUI();
            
            // 停止自动同步
            vocabularyManager.sync.stopAutoSync();
            
            showStatus('已登出GitHub账户', 'success');
        } catch (error) {
            console.error('GitHub logout failed:', error);
            showStatus('登出失败: ' + error.message, 'error');
        }
    });

    // 初始化UI状态
    updateAuthUI();
} 