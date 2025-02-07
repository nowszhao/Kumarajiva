import config from './config/config';

document.addEventListener('DOMContentLoaded', async () => {
    // 初始化导航切换功能
    initializeNavigation();
    
    // 加载所有保存的设置
    await loadSettings();

    // 设置表单提交处理
    document.getElementById('settingsForm').addEventListener('submit', handleSettingsSubmit);

    // 测试连接按钮处理
    document.getElementById('testConnection').addEventListener('click', handleTestConnection);

    // 添加还原默认值按钮处理
    document.getElementById('resetDefaults').addEventListener('click', handleResetDefaults);

    // 添加翻译服务切换事件监听
    document.getElementById('translationService').addEventListener('change', handleServiceChange);
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
            'serviceTokens', // 改用 serviceTokens 存储所有服务的 token
            'fontSize',
            'subtitlePosition',
            'batchSize',
            'batchInterval',
            'maxSubtitles',
            'maxRetries'
        ]);

        // 设置默认值
        const defaultSettings = {
            translationService: config.translation.defaultService,
            serviceTokens: {}, // 初始化空对象
            fontSize: 24,
            subtitlePosition: 'bottom',
            batchSize: config.translation.batchSize,
            batchInterval: config.translation.batchInterval,
            maxSubtitles: config.translation.maxSubtitles,
            maxRetries: config.translation.maxRetries
        };

        // 合并默认值和已保存的设置
        const mergedSettings = { ...defaultSettings, ...settings };

        // 更新表单值
        Object.entries(mergedSettings).forEach(([key, value]) => {
            const element = document.getElementById(key);
            if (element && key !== 'serviceTokens') {
                if (element.type === 'checkbox') {
                    element.checked = value;
                } else {
                    element.value = value;
                }
            }
        });

        // 如果有选中的翻译服务，加载对应的 API Token
        if (mergedSettings.translationService) {
            const service = mergedSettings.translationService;
            const storedTokens = mergedSettings.serviceTokens || {};
            const storedToken = storedTokens[service];
            const defaultToken = config[service]?.apiToken;
            
            // 优先使用存储的 token，如果没有则使用默认值
            document.getElementById('apiToken').value = storedToken || defaultToken || '';
        }

    } catch (error) {
        showStatus('Error loading settings: ' + error.message, 'error');
    }
}

// 处理设置提交
async function handleSettingsSubmit(e) {
    e.preventDefault();
    
    try {
        const service = document.getElementById('translationService').value;
        const token = document.getElementById('apiToken').value;
        const fontSize = parseInt(document.getElementById('fontSize').value);
        const subtitlePosition = document.getElementById('subtitlePosition').value;

        // 验证设置
        if (!token) {
            showStatus('请输入 API Token', 'error');
            return;
        }

        if (fontSize < 12 || fontSize > 32) {
            showStatus('字体大小必须在 12-32 之间', 'error');
            return;
        }

        // 获取当前存储的所有配置
        const { serviceTokens = {}, batchSize, batchInterval, maxSubtitles, maxRetries } = 
            await chrome.storage.sync.get(['serviceTokens', 'batchSize', 'batchInterval', 'maxSubtitles', 'maxRetries']);
        
        // 构建要保存的数据
        const formData = {
            translationService: service,
            serviceTokens: {
                ...serviceTokens,
                [service]: token
            },
            fontSize,
            subtitlePosition,
            // 保持其他配置项不变
            batchSize: batchSize || config.translation.batchSize,
            batchInterval: batchInterval || config.translation.batchInterval,
            maxSubtitles: maxSubtitles || config.translation.maxSubtitles,
            maxRetries: maxRetries || config.translation.maxRetries
        };

        // 保存到 storage
        await chrome.storage.sync.set(formData);
        
        // 更新运行时的 config 对象
        Object.assign(config.translation, {
            defaultService: service,
            batchSize: formData.batchSize,
            batchInterval: formData.batchInterval,
            maxSubtitles: formData.maxSubtitles,
            maxRetries: formData.maxRetries
        });
        
        // 更新服务配置
        if (!config[service]) {
            config[service] = {};
        }
        config[service].apiToken = token;

        showStatus('设置已保存', 'success');
    } catch (error) {
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
            // 翻译相关配置
            batchSize: config.translation.batchSize,
            batchInterval: config.translation.batchInterval,
            maxSubtitles: config.translation.maxSubtitles,
            maxRetries: config.translation.maxRetries,
            // UI 设置
            fontSize: 24,
            subtitlePosition: 'bottom'
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

// 在 CSS 中添加新的按钮样式
const styles = `
.button-group {
    display: flex;
    gap: 10px;
    margin-top: 20px;
}

.btn-secondary {
    background: #5f6368;
}

.btn-secondary:hover {
    background: #4a4d51;
}
`;

// 添加样式到页面
const styleSheet = document.createElement('style');
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

// 添加服务切换处理函数
async function handleServiceChange(e) {
    const selectedService = e.target.value;
    const apiTokenInput = document.getElementById('apiToken');
    
    try {
        // 获取所有服务的 tokens
        const { serviceTokens = {} } = await chrome.storage.sync.get(['serviceTokens']);
        
        // 获取选中服务的 token
        const storedToken = serviceTokens[selectedService];
        if (storedToken) {
            apiTokenInput.value = storedToken;
        } else {
            // 如果 storage 中没有，则使用 config.js 中的默认值
            const defaultToken = config[selectedService]?.apiToken;
            if (defaultToken) {
                apiTokenInput.value = defaultToken;
            } else {
                apiTokenInput.value = ''; // 如果没有默认值则清空
            }
        }
    } catch (error) {
        console.error('Error loading API token:', error);
        // 发生错误时使用 config.js 中的默认值
        const defaultToken = config[selectedService]?.apiToken;
        if (defaultToken) {
            apiTokenInput.value = defaultToken;
        }
    }
} 