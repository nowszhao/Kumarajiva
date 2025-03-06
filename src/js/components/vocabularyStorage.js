/**
 * 词汇存储类：使用分片方式存储大量词汇数据，同时保持向后兼容
 */
export class VocabularyStorage {
    static STORAGE_KEY = 'collected_words';
    static CHUNK_KEY_PREFIX = 'vocab_chunk_';
    static CHUNK_SIZE = 100; // 每个分片存储100个单词
    static MIGRATION_FLAG = 'vocab_storage_migrated';

    // 检查是否需要迁移
    static async checkAndMigrate() {
        const migrated = await chrome.storage.local.get(this.MIGRATION_FLAG);
        if (!migrated[this.MIGRATION_FLAG]) {
            const oldData = await this.getLegacyWords();
            if (Object.keys(oldData).length > 0) {
                await this.migrateToChunks(oldData);
                await chrome.storage.local.set({ [this.MIGRATION_FLAG]: true });
            }
        }
    }

    // 获取旧版数据
    static async getLegacyWords() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEY);
            return result[this.STORAGE_KEY] || {};
        } catch (error) {
            console.log('Failed to load legacy vocabulary:', error);
            return {};
        }
    }

    // 迁移数据到分片存储
    static async migrateToChunks(words) {
        const entries = Object.entries(words);
        const chunks = [];
        
        for (let i = 0; i < entries.length; i += this.CHUNK_SIZE) {
            const chunk = Object.fromEntries(
                entries.slice(i, i + this.CHUNK_SIZE)
            );
            chunks.push(chunk);
        }

        // 保存分片
        await Promise.all(
            chunks.map((chunk, index) => 
                chrome.storage.local.set({ 
                    [`${this.CHUNK_KEY_PREFIX}${index}`]: chunk 
                })
            )
        );

        // 保存元数据
        await chrome.storage.local.set({
            [`${this.CHUNK_KEY_PREFIX}meta`]: {
                totalChunks: chunks.length,
                totalWords: entries.length,
                lastUpdate: Date.now()
            }
        });
    }

    // 获取所有词汇（兼容现有代码）
    static async getWords() {
        await this.checkAndMigrate();

        try {
            // 获取元数据
            const meta = await chrome.storage.local.get(`${this.CHUNK_KEY_PREFIX}meta`);
            const metadata = meta[`${this.CHUNK_KEY_PREFIX}meta`];

            // 如果没有分片数据，返回旧版数据
            if (!metadata) {
                return this.getLegacyWords();
            }

            // 获取所有分片
            const chunkKeys = Array.from(
                { length: metadata.totalChunks },
                (_, i) => `${this.CHUNK_KEY_PREFIX}${i}`
            );
            const chunks = await chrome.storage.local.get(chunkKeys);

            // 合并所有分片数据
            return Object.values(chunks).reduce((acc, chunk) => ({
                ...acc,
                ...chunk
            }), {});
        } catch (error) {
            console.error('Failed to load vocabulary:', error);
            return {};
        }
    }

    // 保存词汇（优化写入性能）
    static async saveWords(words) {
        try {
            const entries = Object.entries(words);
            const chunks = [];

            // 分片处理数据
            for (let i = 0; i < entries.length; i += this.CHUNK_SIZE) {
                const chunk = Object.fromEntries(
                    entries.slice(i, i + this.CHUNK_SIZE)
                );
                chunks.push(chunk);
            }

            // 并行保存所有分片
            await Promise.all([
                // 保存分片数据
                ...chunks.map((chunk, index) => 
                    chrome.storage.local.set({ 
                        [`${this.CHUNK_KEY_PREFIX}${index}`]: chunk 
                    })
                ),
                // 更新元数据
                chrome.storage.local.set({
                    [`${this.CHUNK_KEY_PREFIX}meta`]: {
                        totalChunks: chunks.length,
                        totalWords: entries.length,
                        lastUpdate: Date.now()
                    }
                }),
                // 保持旧版数据同步（向后兼容）
                chrome.storage.local.set({ [this.STORAGE_KEY]: words })
            ]);

            return true;
        } catch (error) {
            console.error('Failed to save vocabulary:', error);
            return false;
        }
    }

    // 添加单词（优化单词添加性能）
    static async addWord(word, wordInfo) {
        try {
            // 获取元数据
            const meta = await chrome.storage.local.get(`${this.CHUNK_KEY_PREFIX}meta`);
            const metadata = meta[`${this.CHUNK_KEY_PREFIX}meta`];

            if (!metadata) {
                // 如果还没有分片数据，使用旧版方式
                const words = await this.getLegacyWords();
                words[word] = wordInfo;
                return this.saveWords(words);
            }

            // 获取最后一个分片
            const lastChunk = await chrome.storage.local.get(
                `${this.CHUNK_KEY_PREFIX}${metadata.totalChunks - 1}`
            );
            const chunk = lastChunk[`${this.CHUNK_KEY_PREFIX}${metadata.totalChunks - 1}`];

            // 检查最后一个分片是否已满
            if (Object.keys(chunk).length >= this.CHUNK_SIZE) {
                // 创建新分片
                await chrome.storage.local.set({
                    [`${this.CHUNK_KEY_PREFIX}${metadata.totalChunks}`]: { [word]: wordInfo }
                });
                // 更新元数据
                await chrome.storage.local.set({
                    [`${this.CHUNK_KEY_PREFIX}meta`]: {
                        ...metadata,
                        totalChunks: metadata.totalChunks + 1,
                        totalWords: metadata.totalWords + 1,
                        lastUpdate: Date.now()
                    }
                });
            } else {
                // 添加到现有分片
                chunk[word] = wordInfo;
                await chrome.storage.local.set({
                    [`${this.CHUNK_KEY_PREFIX}${metadata.totalChunks - 1}`]: chunk
                });
                // 更新元数据
                await chrome.storage.local.set({
                    [`${this.CHUNK_KEY_PREFIX}meta`]: {
                        ...metadata,
                        totalWords: metadata.totalWords + 1,
                        lastUpdate: Date.now()
                    }
                });
            }

            // 保持旧版数据同步
            const allWords = await this.getWords();
            await chrome.storage.local.set({ [this.STORAGE_KEY]: allWords });

            return true;
        } catch (error) {
            console.error('Failed to add word:', error);
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
