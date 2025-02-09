import VocabularyStorage from './vocabularyStorage';

export class VocabularySync {
    constructor() {
        this.syncInProgress = false;
        this.lastSyncTime = null;
        this.syncStatus = null;
        this.autoSyncInterval = null;
    }

    async initialize() {
        // 加载同步设置
        const settings = await chrome.storage.sync.get([
            'syncServerUrl',
            'enableAutoSync',
            'syncInterval',
            'lastSyncTime'
        ]);

        this.syncServerUrl = settings.syncServerUrl || '';
        this.enableAutoSync = settings.enableAutoSync || false;
        this.syncInterval = settings.syncInterval || 60;
        this.lastSyncTime = settings.lastSyncTime || null;

        // 更新UI
        this.updateSyncStatus();
        
        // 如果启用了自动同步，开始定时任务
        if (this.enableAutoSync) {
            this.startAutoSync();
        }
    }

    async syncToCloud() {
        console.log('Starting syncToCloud...');
        if (this.syncInProgress) {
            console.log('Sync already in progress, returning...');
            return;
        }

        try {
            this.syncInProgress = true;
            console.log('Setting syncInProgress to true');
            this.updateSyncStatus('syncing', '同步中...');

            // 获取所有单词数据
            console.log('Fetching words from VocabularyStorage...');
            const words = await VocabularyStorage.getWords();
            console.log('Fetched words:', words);

            console.log('Sync URL:', this.syncServerUrl);
            // 发送同步请求
            const response = await fetch(this.syncServerUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ vocabularies: words })
            });
            console.log('Sync response:', response);

            if (!response.ok) {
                throw new Error(`同步失败: ${response.statusText}`);
            }

            // 更新同步时间
            this.lastSyncTime = Date.now();
            console.log('Updated lastSyncTime:', this.lastSyncTime);
            await chrome.storage.sync.set({ lastSyncTime: this.lastSyncTime });

            this.updateSyncStatus('success', '同步成功');
        } catch (error) {
            console.error('Sync failed:', error);
            this.updateSyncStatus('error', `同步失败: ${error.message}`);
        } finally {
            console.log('Setting syncInProgress to false');
            this.syncInProgress = false;
            this.updateSyncStatus();
        }
    }

    updateSyncStatus(status = null, message = null) {
        console.log('Updating sync status:', { status, message });
        const statusBadge = document.getElementById('syncStatus');
        const lastSyncTime = document.getElementById('lastSyncTime');
        const syncButton = document.getElementById('syncVocabulary');

        console.log('Found elements:', {
            statusBadge: !!statusBadge,
            lastSyncTime: !!lastSyncTime,
            syncButton: !!syncButton
        });

        if (!statusBadge || !lastSyncTime || !syncButton) {
            console.log('Some elements not found, returning...');
            return;
        }

        if (status) {
            statusBadge.className = 'status-badge ' + status;
            statusBadge.textContent = message;
        }

        if (this.lastSyncTime) {
            lastSyncTime.textContent = new Date(this.lastSyncTime).toLocaleString('zh-CN');
        }

        console.log('Current syncInProgress:', this.syncInProgress);
        if (this.syncInProgress) {
            console.log('Adding syncing class');
            syncButton.classList.add('syncing');
        } else {
            console.log('Removing syncing class');
            syncButton.classList.remove('syncing');
            // 同步完成后重置按钮状态
            const syncIcon = syncButton.querySelector('.sync-icon');
            console.log('Found sync icon:', !!syncIcon);
            if (syncIcon) {
                syncIcon.style.transform = 'rotate(0deg)';
            }
        }
    }

    startAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }

        const intervalMs = this.syncInterval * 60 * 1000; // 转换为毫秒
        this.autoSyncInterval = setInterval(() => {
            this.syncToCloud();
        }, intervalMs);
    }

    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
    }

    async updateSettings(settings) {
        this.syncServerUrl = settings.syncServerUrl;
        this.enableAutoSync = settings.enableAutoSync;
        this.syncInterval = settings.syncInterval;

        // 保存设置
        await chrome.storage.sync.set({
            syncServerUrl: this.syncServerUrl,
            enableAutoSync: this.enableAutoSync,
            syncInterval: this.syncInterval
        });

        // 更新自动同步
        if (this.enableAutoSync) {
            this.startAutoSync();
        } else {
            this.stopAutoSync();
        }
    }
} 