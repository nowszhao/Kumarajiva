/**
 * 词汇存储类：使用分片方式存储大量词汇数据
 */
export class VocabularyStorage {
    static CHUNK_KEY_PREFIX = 'vocab_chunk_';
    static CHUNK_SIZE = 100; // 每个分片存储100个单词
    static MIGRATION_FLAG = 'vocab_storage_migrated';

    // 添加内存缓存
    static cache = {
        words: null,
        lastUpdate: 0,
        cacheTimeout: 5000  // 缓存有效期5秒
    };

    // 检查是否需要迁移
    static async checkAndMigrate() {
        const migrated = await chrome.storage.local.get(this.MIGRATION_FLAG);
        if (!migrated[this.MIGRATION_FLAG]) {
            const oldData = await this.getLegacyWords();
            if (Object.keys(oldData).length > 0) {
                await this.migrateToChunks(oldData);
                // 迁移完成后删除旧数据
                await chrome.storage.local.remove('collected_words');
                await chrome.storage.local.set({ [this.MIGRATION_FLAG]: true });
            }
        }
    }

    // 获取旧版数据（仅用于迁移）
    static async getLegacyWords() {
        try {
            const result = await chrome.storage.local.get('collected_words');
            return result['collected_words'] || {};
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

    // 获取所有词汇
    static async getWords() {
        // 检查缓存是否有效
        if (this.cache.words && (Date.now() - this.cache.lastUpdate < this.cache.cacheTimeout)) {
            return this.cache.words;
        }

        await this.checkAndMigrate();
        try {
            const meta = await chrome.storage.local.get(`${this.CHUNK_KEY_PREFIX}meta`);
            const metadata = meta[`${this.CHUNK_KEY_PREFIX}meta`];

            if (!metadata || metadata.totalChunks === 0) {
                this.cache.words = {};
                this.cache.lastUpdate = Date.now();
                return {};
            }

            const chunkKeys = Array.from(
                { length: metadata.totalChunks },
                (_, i) => `${this.CHUNK_KEY_PREFIX}${i}`
            );
            const chunks = await chrome.storage.local.get(chunkKeys);

            // 更新缓存
            this.cache.words = Object.values(chunks).reduce((acc, chunk) => ({
                ...acc,
                ...chunk
            }), {});
            this.cache.lastUpdate = Date.now();

            return this.cache.words;
        } catch (error) {
            console.error('Failed to load vocabulary:', error);
            return {};
        }
    }

    // 添加单词
    static async addWord(word, wordInfo) {
        try {
            const meta = await chrome.storage.local.get(`${this.CHUNK_KEY_PREFIX}meta`);
            const metadata = meta[`${this.CHUNK_KEY_PREFIX}meta`] || { totalChunks: 0, totalWords: 0 };

            // 更新缓存
            if (this.cache.words) {
                this.cache.words[word] = wordInfo;
                this.cache.lastUpdate = Date.now();
            }

            // 批量更新操作
            const updates = {};
            
            if (metadata.totalChunks === 0 || 
                Object.keys(await this.getLastChunk(metadata.totalChunks - 1)).length >= this.CHUNK_SIZE) {
                // 创建新分片
                const newChunkKey = `${this.CHUNK_KEY_PREFIX}${metadata.totalChunks}`;
                updates[newChunkKey] = { [word]: wordInfo };
                updates[`${this.CHUNK_KEY_PREFIX}meta`] = {
                    totalChunks: metadata.totalChunks + 1,
                    totalWords: metadata.totalWords + 1,
                    lastUpdate: Date.now()
                };
            } else {
                // 添加到现有最后一个分片
                const lastChunk = await this.getLastChunk(metadata.totalChunks - 1);
                lastChunk[word] = wordInfo;
                updates[`${this.CHUNK_KEY_PREFIX}${metadata.totalChunks - 1}`] = lastChunk;
                updates[`${this.CHUNK_KEY_PREFIX}meta`] = {
                    ...metadata,
                    totalWords: metadata.totalWords + 1,
                    lastUpdate: Date.now()
                };
            }

            // 批量执行所有更新
            await chrome.storage.local.set(updates);
            return true;
        } catch (error) {
            console.error('Failed to add word:', error);
            return false;
        }
    }

    // 获取最后一个分片
    static async getLastChunk(index) {
        if (index < 0) return {};
        const result = await chrome.storage.local.get(`${this.CHUNK_KEY_PREFIX}${index}`);
        return result[`${this.CHUNK_KEY_PREFIX}${index}`] || {};
    }

    // 删除单词
    static async removeWord(word) {
        try {
            // 更新缓存
            if (this.cache.words) {
                delete this.cache.words[word];
                this.cache.lastUpdate = Date.now();
            }

            const meta = await chrome.storage.local.get(`${this.CHUNK_KEY_PREFIX}meta`);
            const metadata = meta[`${this.CHUNK_KEY_PREFIX}meta`];
            if (!metadata) return false;

            // 查找并删除单词
            for (let i = 0; i < metadata.totalChunks; i++) {
                const chunkKey = `${this.CHUNK_KEY_PREFIX}${i}`;
                const chunk = await chrome.storage.local.get(chunkKey);
                if (chunk[chunkKey] && word in chunk[chunkKey]) {
                    delete chunk[chunkKey][word];
                    await chrome.storage.local.set({
                        [chunkKey]: chunk[chunkKey],
                        [`${this.CHUNK_KEY_PREFIX}meta`]: {
                            ...metadata,
                            totalWords: metadata.totalWords - 1,
                            lastUpdate: Date.now()
                        }
                    });
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('Failed to remove word:', error);
            return false;
        }
    }

    // 更新单词
    static async updateWord(word, updates) {
        try {
            // 更新缓存
            if (this.cache.words && this.cache.words[word]) {
                this.cache.words[word] = { ...this.cache.words[word], ...updates };
                this.cache.lastUpdate = Date.now();
            }

            const meta = await chrome.storage.local.get(`${this.CHUNK_KEY_PREFIX}meta`);
            const metadata = meta[`${this.CHUNK_KEY_PREFIX}meta`];
            if (!metadata) return false;

            // 查找并更新单词
            for (let i = 0; i < metadata.totalChunks; i++) {
                const chunkKey = `${this.CHUNK_KEY_PREFIX}${i}`;
                const chunk = await chrome.storage.local.get(chunkKey);
                if (chunk[chunkKey] && word in chunk[chunkKey]) {
                    chunk[chunkKey][word] = { ...chunk[chunkKey][word], ...updates };
                    await chrome.storage.local.set({ [chunkKey]: chunk[chunkKey] });
                    return true;
                }
            }
            return false;
        } catch (error) {
            console.error('Failed to update word:', error);
            return false;
        }
    }

    // 清理缓存
    static clearCache() {
        this.cache.words = null;
        this.cache.lastUpdate = 0;
    }
}
