import { VocabularyStorage } from './vocabularyStorage';

export class VocabularySync {
    constructor() {
        this.syncInProgress = false;
        this.lastSyncTime = null;
        this.syncStatus = null;
        this.autoSyncInterval = null;
    }

    // 添加 URL 构建方法
    getApiUrl(endpoint) {
        const baseUrl = this.syncServerUrl?.trim();
        if (!baseUrl) return '';
        
        // 移除末尾的斜杠
        const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
        return `${cleanBaseUrl}/api/vocab/${endpoint}`;
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

    async fetchFromCloud() {
        console.log('Fetching vocabularies from cloud...');
        try {
            const exportUrl = this.getApiUrl('export');
            if (!exportUrl) {
                throw new Error('同步服务器地址未设置');
            }

            const response = await fetch(exportUrl);
            console.log('Cloud fetch response:', response);

            if (!response.ok) {
                throw new Error(`获取云端数据失败: ${response.statusText}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error('获取云端数据失败');
            }

            return result.data;
        } catch (error) {
            console.error('Fetch from cloud failed:', error);
            throw error;
        }
    }

    async mergeVocabularies(cloudWords) {
        console.log('Merging vocabularies...');
        try {
            // 获取本地词汇
            const localWords = await VocabularyStorage.getWords();
            
            // 合并词汇（cloud upsert to local）
            const mergedWords = { ...localWords };
            for (const [word, info] of Object.entries(cloudWords)) {
                mergedWords[word] = info;
            }

            // 保存合并后的词汇到本地
            await VocabularyStorage.saveWords(mergedWords);
            return mergedWords;
        } catch (error) {
            console.error('Merge vocabularies failed:', error);
            throw error;
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

            // 1. 先从云端获取数据
            console.log('Fetching from cloud...');
            const cloudWords = await this.fetchFromCloud();
            
            // 2. 合并数据
            console.log('Merging with local data...');
            const mergedWords = await this.mergeVocabularies(cloudWords);

            // 3. 发送合并后的数据到云端
            const importUrl = this.getApiUrl('import');
            if (!importUrl) {
                throw new Error('同步服务器地址未设置');
            }

            console.log('Sync URL:', importUrl);
            const response = await fetch(importUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ vocabularies: mergedWords })
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

            // 触发词汇列表刷新
            const event = new CustomEvent('vocabulariesUpdated');
            document.dispatchEvent(event);
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