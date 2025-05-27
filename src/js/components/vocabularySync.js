import { VocabularyStorage } from './vocabularyStorage';
import { GitHubAuth } from './githubAuth';

export class VocabularySync {
    constructor() {
        this.syncInProgress = false;
        this.lastSyncTime = null;
        this.syncStatus = null;
        this.autoSyncInterval = null;
        this.githubAuth = new GitHubAuth();
    }

    getApiUrl(endpoint) {
        return this.githubAuth.getApiUrl(`vocab/${endpoint}`);
    }

    async initialize() {
        // 初始化GitHub认证
        await this.githubAuth.initialize();
        
        // 加载同步设置
        const settings = await chrome.storage.sync.get([
            'enableAutoSync',
            'syncInterval',
            'lastSyncTime'
        ]);

        this.enableAutoSync = settings.enableAutoSync || false;
        this.syncInterval = settings.syncInterval || 60;
        this.lastSyncTime = settings.lastSyncTime || null;

        // 更新UI状态
        this.updateSyncStatus();
        
        // 如果启用了自动同步且已认证，开始定时任务
        if (this.enableAutoSync && this.githubAuth.isAuthenticated()) {
            this.startAutoSync();
        }
    }

    async fetchFromCloud() {
        console.log('Fetching vocabularies from cloud...');
        
        if (!this.githubAuth.isAuthenticated()) {
            throw new Error('请先登录GitHub账户');
        }

        try {
            const exportUrl = this.getApiUrl('export');
            console.log('Export URL:', exportUrl);
            
            const response = await fetch(exportUrl, {
                headers: this.githubAuth.getAuthHeaders()
            });
            
            console.log('Cloud fetch response status:', response.status);

            if (!response.ok) {
                if (response.status === 401) {
                    throw new Error('认证已过期，请重新登录');
                }
                throw new Error(`获取云端数据失败: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('Cloud fetch result:', result);
            
            if (!result.success) {
                throw new Error('获取云端数据失败');
            }

            const cloudData = result.data || {};
            console.log('Cloud data type:', typeof cloudData);
            console.log('Cloud data keys sample:', Object.keys(cloudData).slice(0, 5));
            
            return cloudData;
        } catch (error) {
            console.error('Fetch from cloud failed:', error);
            throw error;
        }
    }

    async mergeVocabularies(cloudWords) {
        console.log('Merging vocabularies...');
        console.log('Cloud words type:', typeof cloudWords, 'keys:', Object.keys(cloudWords || {}).slice(0, 5));
        
        try {
            // 获取本地词汇
            const localWords = await VocabularyStorage.getWords();
            console.log('Local words type:', typeof localWords, 'keys:', Object.keys(localWords || {}).slice(0, 5));
            
            // 确保cloudWords是对象格式
            let processedCloudWords = {};
            if (Array.isArray(cloudWords)) {
                // 如果云端返回的是数组格式，转换为对象格式
                cloudWords.forEach(item => {
                    if (item && item.word && typeof item.word === 'string') {
                        // 处理时间戳，确保是有效的数字
                        let timestamp = item.timestamp || item.time;
                        if (timestamp) {
                            timestamp = parseInt(timestamp);
                            if (isNaN(timestamp)) {
                                timestamp = Date.now();
                            }
                        } else {
                            timestamp = Date.now();
                        }
                        
                        processedCloudWords[item.word] = {
                            definitions: this.parseDefinitionsFromCloud(item.definitions),
                            pronunciation: this.parsePronunciationFromCloud(item.pronunciation),
                            memory_method: item.memory_method || '',
                            mastered: Boolean(item.mastered),
                            timestamp: timestamp
                        };
                    }
                });
                console.log('Converted array to object format, processed words:', Object.keys(processedCloudWords).length);
            } else if (cloudWords && typeof cloudWords === 'object') {
                // 如果是对象格式，处理每个词汇项
                Object.entries(cloudWords).forEach(([word, info]) => {
                    if (typeof word === 'string' && info && typeof info === 'object') {
                        // 处理时间戳，确保是有效的数字
                        let timestamp = info.timestamp || info.time;
                        if (timestamp) {
                            timestamp = parseInt(timestamp);
                            if (isNaN(timestamp)) {
                                timestamp = Date.now();
                            }
                        } else {
                            timestamp = Date.now();
                        }
                        
                        processedCloudWords[word] = {
                            definitions: this.parseDefinitionsFromCloud(info.definitions),
                            pronunciation: this.parsePronunciationFromCloud(info.pronunciation),
                            memory_method: info.memory_method || '',
                            mastered: Boolean(info.mastered),
                            timestamp: timestamp
                        };
                    }
                });
                console.log('Processed object format, processed words:', Object.keys(processedCloudWords).length);
            }

            // 合并词汇（cloud upsert to local）
            const mergedWords = { ...localWords };
            Object.entries(processedCloudWords).forEach(([word, info]) => {
                if (typeof word === 'string' && info && typeof info === 'object') {
                    mergedWords[word] = info;
                }
            });

            console.log('Final merged words count:', Object.keys(mergedWords).length);
            console.log('Sample merged word:', Object.entries(mergedWords)[0]);

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
        
        if (!this.githubAuth.isAuthenticated()) {
            this.updateSyncStatus('error', '请先登录GitHub账户才能同步');
            this.showLoginPrompt();
            return;
        }
        
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
            console.log('Sync URL:', importUrl);
            console.log('Merged words sample:', Object.keys(mergedWords).slice(0, 5));
            
            // 转换数据格式为API期望的格式（对象格式，不是数组）
            const vocabularies = {};
            Object.entries(mergedWords).forEach(([word, info]) => {
                // 确保word是字符串，info是对象
                if (typeof word === 'string' && info && typeof info === 'object') {
                    // 处理时间戳，确保是有效的数字
                    let timestamp = info.timestamp || info.time;
                    if (timestamp) {
                        timestamp = parseInt(timestamp);
                        if (isNaN(timestamp)) {
                            timestamp = Date.now();
                        }
                    } else {
                        timestamp = Date.now();
                    }
                    
                    vocabularies[word] = {
                        word: word,
                        definitions: this.formatDefinitionsForCloud(info.definitions),
                        pronunciation: this.formatPronunciationForCloud(info.pronunciation),
                        memory_method: info.memory_method || '',
                        mastered: Boolean(info.mastered),
                        timestamp: timestamp
                    };
                }
            });

            console.log('Vocabularies to sync (object format):', Object.keys(vocabularies).length);
            console.log('Sample vocabulary:', Object.values(vocabularies)[0]);

            const response = await fetch(importUrl, {
                method: 'POST',
                headers: this.githubAuth.getAuthHeaders(),
                body: JSON.stringify({ vocabularies })
            });
            
            console.log('Sync response:', response);

            if (!response.ok) {
                if (response.status === 401) {
                    this.updateSyncStatus('error', '认证已过期，请重新登录');
                    this.showLoginPrompt();
                    return;
                }
                throw new Error(`同步失败: ${response.statusText}`);
            }

            const result = await response.json();
            if (!result.success) {
                throw new Error('同步失败: ' + (result.message || '未知错误'));
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
            if (error.message.includes('认证') || error.message.includes('登录')) {
                this.updateSyncStatus('error', error.message);
                this.showLoginPrompt();
            } else {
                this.updateSyncStatus('error', `同步失败: ${error.message}`);
            }
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

        // 检查登录状态并更新按钮状态
        const isAuthenticated = this.githubAuth.isAuthenticated();
        
        if (!isAuthenticated) {
            syncButton.disabled = true;
            syncButton.title = '请先登录GitHub账户';
            if (!status) {
                statusBadge.className = 'status-badge warning';
                statusBadge.textContent = '未登录';
            }
        } else {
            syncButton.disabled = this.syncInProgress;
            syncButton.title = this.syncInProgress ? '同步中...' : '同步到云端';
        }

        if (status) {
            statusBadge.className = 'status-badge ' + status;
            statusBadge.textContent = message;
        }

        if (this.lastSyncTime && isAuthenticated) {
            lastSyncTime.textContent = new Date(this.lastSyncTime).toLocaleString('zh-CN');
        } else if (!isAuthenticated) {
            lastSyncTime.textContent = '需要登录';
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
        if (!this.githubAuth.isAuthenticated()) {
            console.log('Cannot start auto sync: not authenticated');
            return;
        }

        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
        }

        const intervalMs = this.syncInterval * 60 * 1000; // 转换为毫秒
        this.autoSyncInterval = setInterval(() => {
            if (this.githubAuth.isAuthenticated()) {
                this.syncToCloud();
            } else {
                this.stopAutoSync();
            }
        }, intervalMs);
    }

    stopAutoSync() {
        if (this.autoSyncInterval) {
            clearInterval(this.autoSyncInterval);
            this.autoSyncInterval = null;
        }
    }

    async updateSettings(settings) {
        this.enableAutoSync = settings.enableAutoSync;
        this.syncInterval = settings.syncInterval;

        // 保存设置
        await chrome.storage.sync.set({
            enableAutoSync: this.enableAutoSync,
            syncInterval: this.syncInterval
        });

        // 更新自动同步
        if (this.enableAutoSync && this.githubAuth.isAuthenticated()) {
            this.startAutoSync();
        } else {
            this.stopAutoSync();
        }
    }

    getGitHubAuth() {
        return this.githubAuth;
    }

    parseDefinitionsFromCloud(definitions) {
        // 从云端格式转换为本地对象数组格式
        if (typeof definitions === 'string' && definitions) {
            try {
                // 首先尝试解析JSON格式（新格式）
                const parsed = JSON.parse(definitions);
                if (Array.isArray(parsed)) {
                    return parsed;
                }
            } catch {
                // 如果JSON解析失败，尝试解析旧的字符串格式 "adj. 无线的; n. 设备"
                return definitions.split('; ').map(def => {
                    const parts = def.trim().split(' ');
                    if (parts.length >= 2) {
                        const pos = parts[0];
                        const meaning = parts.slice(1).join(' ');
                        return { pos, meaning };
                    } else {
                        return { pos: '', meaning: def.trim() };
                    }
                });
            }
        } else if (Array.isArray(definitions)) {
            return definitions;
        }
        return [];
    }

    parsePronunciationFromCloud(pronunciation) {
        // 从云端字符串格式转换为本地对象格式
        if (typeof pronunciation === 'string') {
            try {
                return JSON.parse(pronunciation);
            } catch {
                return { American: pronunciation, British: '' };
            }
        } else if (typeof pronunciation === 'object' && pronunciation) {
            return pronunciation;
        } else {
            return { American: '', British: '' };
        }
    }

    formatDefinitionsForCloud(definitions) {
        // 从本地对象数组格式转换为云端字符串格式
        if (Array.isArray(definitions)) {
            return JSON.stringify(definitions);
        } else if (typeof definitions === 'string') {
            return definitions;
        } else {
            return '';
        }
    }

    formatPronunciationForCloud(pronunciation) {
        // 从本地对象格式转换为云端字符串格式
        if (typeof pronunciation === 'object' && pronunciation) {
            return JSON.stringify(pronunciation);
        } else if (typeof pronunciation === 'string') {
            return pronunciation;
        } else {
            return JSON.stringify({ American: '', British: '' });
        }
    }

    parseDefinitions(definitions) {
        if (Array.isArray(definitions)) {
            return definitions.join('; ');
        } else if (typeof definitions === 'string') {
            return definitions;
        } else {
            return '';
        }
    }

    parsePronunciation(pronunciation) {
        if (typeof pronunciation === 'string') {
            return pronunciation;
        } else {
            return '';
        }
    }

    showLoginPrompt() {
        // 显示登录提示对话框
        if (confirm('需要登录GitHub账户才能使用同步功能。是否前往设置页面登录？')) {
            // 切换到设置标签页
            const settingsTab = document.querySelector('[data-tab="settings"]');
            const vocabularyTab = document.querySelector('[data-tab="vocabulary"]');
            const settingsSection = document.getElementById('settings');
            const vocabularySection = document.getElementById('vocabulary');
            
            if (settingsTab && vocabularyTab && settingsSection && vocabularySection) {
                // 切换标签状态
                vocabularyTab.classList.remove('active');
                settingsTab.classList.add('active');
                
                // 切换内容区域
                vocabularySection.classList.remove('active');
                settingsSection.classList.add('active');
                
                // 滚动到GitHub登录区域
                setTimeout(() => {
                    const authStatus = document.getElementById('authStatus');
                    if (authStatus) {
                        authStatus.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // 添加高亮效果
                        authStatus.style.border = '2px solid #1a73e8';
                        authStatus.style.borderRadius = '8px';
                        setTimeout(() => {
                            authStatus.style.border = '';
                            authStatus.style.borderRadius = '';
                        }, 3000);
                    }
                }, 100);
            }
        }
    }
}