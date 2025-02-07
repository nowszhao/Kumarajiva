class VocabularyStorage {
    static STORAGE_KEY = 'collected_words';

    static async getWords() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEY);
            const words = result[this.STORAGE_KEY] || {};
            return words;
        } catch (error) {
            console.error('Failed to load vocabulary:', error);
            return {};
        }
    }

    static async saveWords(words) {
        try {
            await chrome.storage.local.set({ [this.STORAGE_KEY]: words });
            return true;
        } catch (error) {
            console.error('Failed to save vocabulary:', error);
            return false;
        }
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