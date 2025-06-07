// 学习精灵加载器 - 确保在所有页面都能正常加载学习精灵

console.log('[LearningElfLoader] Starting Learning Elf Loader...');

// 全局学习精灵管理器
class LearningElfManager {
    constructor() {
        this.uiManager = null;
        this.isInitialized = false;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    async initialize() {
        if (this.isInitialized) {
            console.log('[LearningElfLoader] Already initialized');
            return;
        }

        console.log('[LearningElfLoader] Initializing Learning Elf...');

        try {
            // 检查是否在插件环境中
            if (typeof chrome === 'undefined' || !chrome.runtime) {
                console.log('[LearningElfLoader] Not in extension environment, skipping');
                return;
            }

            // 等待DOM完全加载
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }

            // 动态加载必要的模块
            await this.loadModules();

            console.log('[LearningElfLoader] Learning Elf initialized successfully!');
            this.isInitialized = true;

        } catch (error) {
            console.error('[LearningElfLoader] Failed to initialize Learning Elf:', error);
            
            if (this.retryCount < this.maxRetries) {
                this.retryCount++;
                console.log(`[LearningElfLoader] Retrying initialization (${this.retryCount}/${this.maxRetries})...`);
                setTimeout(() => this.initialize(), 2000 * this.retryCount);
            }
        }
    }

    async loadModules() {
        try {
            console.log('[LearningElfLoader] Loading modules via ES6 imports...');
            
            // 获取模块URL
            const moduleUrls = {
                githubAuth: chrome.runtime.getURL('js/components/githubAuth.js'),
                notificationManager: chrome.runtime.getURL('js/components/notificationManager.js'),
                studyCard: chrome.runtime.getURL('js/components/studyCard.js'),
                learningElf: chrome.runtime.getURL('js/components/learningElf.js')
            };
            
            // 使用动态import加载模块（避免CSP问题）
            console.log('[LearningElfLoader] Importing GitHubAuth...');
            const { GitHubAuth } = await import(moduleUrls.githubAuth);
            
            console.log('[LearningElfLoader] Importing NotificationManager...');
            const { NotificationManager } = await import(moduleUrls.notificationManager);
            
            console.log('[LearningElfLoader] Importing StudyCard...');
            const { StudyCard } = await import(moduleUrls.studyCard);
            
            console.log('[LearningElfLoader] Importing LearningElf...');
            const { LearningElf } = await import(moduleUrls.learningElf);
            
            console.log('[LearningElfLoader] All modules imported successfully');
            
            // 创建并初始化学习精灵
            const learningElf = new LearningElf();
            await learningElf.initialize();
            
            // 存储到全局以便调试和管理
            window.kumarajivaLearningElf = learningElf;
            
            console.log('[LearningElfLoader] Learning Elf created and initialized!');
            
            return learningElf;
            
        } catch (error) {
            console.error('[LearningElfLoader] Module loading failed:', error);
            throw error;
        }
    }

    destroy() {
        if (window.kumarajivaLearningElf) {
            try {
                window.kumarajivaLearningElf.destroy();
                delete window.kumarajivaLearningElf;
                console.log('[LearningElfLoader] Learning Elf destroyed');
            } catch (error) {
                console.error('[LearningElfLoader] Error destroying Learning Elf:', error);
            }
        }
        this.isInitialized = false;
    }
}

// 创建全局管理器实例
window.learningElfManager = new LearningElfManager();

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => window.learningElfManager.initialize(), 1000);
    });
} else {
    // 页面已经加载完成，延迟一点时间确保其他脚本也加载完成
    setTimeout(() => window.learningElfManager.initialize(), 1000);
}

// 监听页面卸载，清理资源
window.addEventListener('beforeunload', () => {
    if (window.learningElfManager) {
        window.learningElfManager.destroy();
    }
});

// 监听扩展禁用消息
if (chrome && chrome.runtime) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'PLUGIN_STATUS_CHANGED' && !message.isEnabled) {
            console.log('[LearningElfLoader] Plugin disabled, destroying Learning Elf');
            window.learningElfManager.destroy();
        } else if (message.type === 'PLUGIN_STATUS_CHANGED' && message.isEnabled) {
            console.log('[LearningElfLoader] Plugin enabled, reinitializing Learning Elf');
            setTimeout(() => window.learningElfManager.initialize(), 1000);
        }
    });
}

console.log('[LearningElfLoader] Learning Elf Loader initialized'); 