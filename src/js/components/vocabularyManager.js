import VocabularyStorage from './vocabularyStorage';

export class VocabularyManager {
    constructor() {
        this.words = new Map();
        this.selectedWords = new Set();
        this.currentFilter = 'all';
        this.currentSort = 'timeDesc';
        this.pageSize = 10;
        this.currentPage = 1;
        this.searchQuery = '';
    }

    async initialize() {
        await this.loadWords();
        this.setupEventListeners();
        this.renderWordList();
    }

    async loadWords() {
        try {
            const wordsObj = await VocabularyStorage.getWords();
            this.words = new Map(Object.entries(wordsObj));
        } catch (error) {
            console.error('Failed to load vocabulary:', error);
            this.words = new Map();
        }
    }

    setupEventListeners() {
        // 状态筛选
        document.getElementById('wordStatus').addEventListener('change', (e) => {
            this.currentFilter = e.target.value;
            this.renderWordList();
        });

        // 排序
        document.getElementById('sortOrder').addEventListener('change', (e) => {
            this.currentSort = e.target.value;
            this.renderWordList();
        });

        // 全选/取消全选
        document.getElementById('selectAll').addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('#vocabularyList input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
                this.toggleWordSelection(checkbox.dataset.word, e.target.checked);
            });
        });

        // 批量删除
        document.getElementById('deleteSelected').addEventListener('click', () => {
            if (this.selectedWords.size > 0) {
                if (confirm(`确定要删除选中的 ${this.selectedWords.size} 个单词吗？`)) {
                    this.deleteSelectedWords();
                }
            }
        });

        // 添加搜索事件监听
        document.getElementById('wordSearch').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.currentPage = 1; // 重置到第一页
            this.renderWordList();
        });

        // 添加分页事件监听
        document.getElementById('prevPage').addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderWordList();
            }
        });

        document.getElementById('nextPage').addEventListener('click', () => {
            const totalPages = this.getTotalPages(this.getFilteredWords().length);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderWordList();
            }
        });
    }

    getFilteredWords() {
        let filteredWords = Array.from(this.words.entries());

        // 应用搜索过滤
        if (this.searchQuery) {
            filteredWords = filteredWords.filter(([word, info]) => {
                return word.toLowerCase().includes(this.searchQuery) ||
                    info.definitions.some(def => def.meaning.toLowerCase().includes(this.searchQuery));
            });
        }

        // 应用状态过滤
        if (this.currentFilter !== 'all') {
            filteredWords = filteredWords.filter(([_, word]) => {
                return this.currentFilter === 'mastered' ? word.mastered : !word.mastered;
            });
        }

        // 应用排序
        filteredWords.sort(([, a], [, b]) => {
            const sortValue = this.currentSort === 'timeDesc' ? -1 : 1;
            return sortValue * (a.timestamp - b.timestamp);
        });

        return filteredWords;
    }

    getTotalPages(totalItems) {
        return Math.ceil(totalItems / this.pageSize);
    }

    updatePaginationControls(totalItems) {
        const totalPages = this.getTotalPages(totalItems);
        const startIndex = (this.currentPage - 1) * this.pageSize + 1;
        const endIndex = Math.min(startIndex + this.pageSize - 1, totalItems);

        document.getElementById('startIndex').textContent = totalItems ? startIndex : 0;
        document.getElementById('endIndex').textContent = endIndex;
        document.getElementById('totalItems').textContent = totalItems;
        document.getElementById('currentPage').textContent = this.currentPage;
        document.getElementById('totalPages').textContent = totalPages;
        
        document.getElementById('prevPage').disabled = this.currentPage <= 1;
        document.getElementById('nextPage').disabled = this.currentPage >= totalPages;
    }

    renderWordList() {
        const tbody = document.getElementById('vocabularyList');
        const emptyState = document.getElementById('vocabularyEmpty');
        tbody.innerHTML = '';

        const filteredWords = this.getFilteredWords();
        const totalItems = filteredWords.length;

        if (totalItems === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
            this.updatePaginationControls(0);
            return;
        }

        emptyState.style.display = 'none';

        // 计算当前页的数据
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = Math.min(startIndex + this.pageSize, totalItems);
        const pageWords = filteredWords.slice(startIndex, endIndex);

        pageWords.forEach(([word, info]) => {
            const row = this.createWordRow(word, info);
            tbody.appendChild(row);
        });

        this.updatePaginationControls(totalItems);
        this.updateDeleteButtonState();
    }

    createWordRow(word, info) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <input type="checkbox" data-word="${word}" ${this.selectedWords.has(word) ? 'checked' : ''}>
            </td>
            <td>${word}</td>
            <td>${info.pronunciation.American || '-'}</td>
            <td>${this.formatDefinitions(info.definitions)}</td>
            <td>${this.formatTimestamp(info.timestamp)}</td>
            <td>
                <label class="status-toggle">
                    <input type="checkbox" ${info.mastered ? 'checked' : ''}>
                    <span class="status-slider"></span>
                </label>
            </td>
            <td>
                <button class="delete-btn" title="删除">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                </button>
            </td>
        `;

        // 添加事件监听
        const checkbox = tr.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            this.toggleWordSelection(word, e.target.checked);
        });

        const statusToggle = tr.querySelector('.status-toggle input');
        statusToggle.addEventListener('change', (e) => {
            this.toggleWordStatus(word, e.target.checked);
        });

        const deleteBtn = tr.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => {
            if (confirm(`确定要删除单词 "${word}" 吗？`)) {
                this.deleteWord(word);
            }
        });

        return tr;
    }

    toggleWordSelection(word, selected) {
        if (selected) {
            this.selectedWords.add(word);
        } else {
            this.selectedWords.delete(word);
        }
        this.updateDeleteButtonState();
    }

    async toggleWordStatus(word, mastered) {
        const wordInfo = this.words.get(word);
        if (wordInfo) {
            wordInfo.mastered = mastered;
            await this.saveWords();
        }
    }

    async deleteWord(word) {
        this.words.delete(word);
        this.selectedWords.delete(word);
        await this.saveWords();
        this.renderWordList();
    }

    async deleteSelectedWords() {
        this.selectedWords.forEach(word => {
            this.words.delete(word);
        });
        this.selectedWords.clear();
        await this.saveWords();
        this.renderWordList();
    }

    async saveWords() {
        try {
            const wordsObj = Object.fromEntries(this.words);
            await VocabularyStorage.saveWords(wordsObj);
        } catch (error) {
            console.error('Failed to save vocabulary:', error);
            alert('保存失败，请重试');
        }
    }

    updateDeleteButtonState() {
        const deleteButton = document.getElementById('deleteSelected');
        deleteButton.disabled = this.selectedWords.size === 0;
    }

    formatDefinitions(definitions) {
        if (!definitions || definitions.length === 0) return '-';
        return definitions.map(def => `${def.pos} ${def.meaning}`).join('; ');
    }

    formatTimestamp(timestamp) {
        return new Date(timestamp).toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
} 