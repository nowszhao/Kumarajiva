class VocabularyStorage {
    static STORAGE_KEY = 'collected_words';

    static async getWords() {
        try {
            // 先尝试从 chrome.storage.local 获取
            const result = await chrome.storage.local.get(this.STORAGE_KEY);
            return result[this.STORAGE_KEY] || {};
        } catch (error) {
            console.log('Failed to load vocabulary from chrome.storage:', error);
            
            // 如果是扩展上下文失效，等待一段时间后重新加载扩展
            if (error.message.includes('Extension context invalidated')) {
                // 通知用户
                // this.notifyUserAndReload('扩展需要重新加载以确保正常工作');
                // chrome.runtime.reload();
            }
            return {};
        }
    }

    static async saveWords(words) {
        try {
            await chrome.storage.local.set({ [this.STORAGE_KEY]: words });
            return true;
        } catch (error) {
            console.log('Failed to save vocabulary:', error);
            
            // 如果是扩展上下文失效，等待一段时间后重新加载扩展
            if (error.message.includes('Extension context invalidated')) {
                // this.notifyUserAndReload('扩展需要重新加载以确保正常工作');
            }
            return false;
        }
    }

    static notifyUserAndReload(message) {
        // 创建通知元素
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #4CAF50;
            color: white;
            padding: 16px;
            border-radius: 4px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
            z-index: 10000;
            font-size: 14px;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        // 3秒后重新加载扩展
        // setTimeout(() => {
        //     chrome.runtime.reload();
        // }, 3000);
    }

    static async addWord(word, wordInfo) {
        const words = await this.getWords();
        words[word] = wordInfo;
        return this.saveWords(words);
    }

    static async removeWord(word) {
        const words = await this.getWords();
        delete words[word];
        return this.saveWords(words);
    }

    static async updateWord(word, updates) {
        const words = await this.getWords();
        if (words[word]) {
            words[word] = { ...words[word], ...updates };
            return this.saveWords(words);
        }
        return false;
    }
}

export default VocabularyStorage; 