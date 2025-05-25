import { VocabularyStorage } from './vocabularyStorage';
import { VocabularySync } from './vocabularySync';

export class VocabularyManager {
    constructor() {
        this.words = new Map();
        this.selectedWords = new Set();
        this.currentFilter = 'all';
        this.currentSort = 'time';
        this.sortDirection = 'desc';
        this.pageSize = 10;
        this.currentPage = 1;
        this.searchQuery = '';
        this.sync = new VocabularySync();

        // 添加词汇更新事件监听
        document.addEventListener('vocabulariesUpdated', async () => {
            await this.loadWords();
            this.renderWordList();
        });
    }

    async initialize() {
        await this.loadWords();
        await this.sync.initialize();
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

        // 全选/取消全选
        document.getElementById('selectAll').addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('#vocabularyList input[type="checkbox"]:not(.status-toggle input)');
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

        // 添加刷新按钮事件监听
        document.getElementById('refreshList').addEventListener('click', async () => {
            await this.loadWords();
            this.renderWordList();
        });

        // 添加表头排序事件监听
        document.querySelectorAll('.sortable').forEach(header => {
            header.addEventListener('click', () => {
                const sortType = header.dataset.sort;
                if (this.currentSort === sortType) {
                    // 切换排序方向
                    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    // 切换排序字段
                    this.currentSort = sortType;
                    this.sortDirection = 'desc';
                }
                
                // 更新表头样式
                document.querySelectorAll('.sortable').forEach(h => {
                    h.classList.remove('active', 'asc', 'desc');
                });
                header.classList.add('active', this.sortDirection);
                
                this.renderWordList();
            });
        });

        // 添加同步按钮事件监听
        document.getElementById('syncVocabulary').addEventListener('click', () => {
            this.sync.syncToCloud();
        });
    }

    getFilteredWords() {
        let filteredWords = Array.from(this.words.entries());

        // 应用搜索过滤
        if (this.searchQuery) {
            filteredWords = filteredWords.filter(([word, info]) => {
                const searchLower = this.searchQuery.toLowerCase();
                
                // 搜索单词本身
                if (word.toLowerCase().includes(searchLower)) {
                    return true;
                }
                
                // 搜索释义
                if (info.definitions) {
                    if (Array.isArray(info.definitions)) {
                        return info.definitions.some(def => {
                            if (typeof def === 'object' && def.meaning) {
                                return def.meaning.toLowerCase().includes(searchLower);
                            } else if (typeof def === 'string') {
                                return def.toLowerCase().includes(searchLower);
                            }
                            return false;
                        });
                    } else if (typeof info.definitions === 'string') {
                        return info.definitions.toLowerCase().includes(searchLower);
                    }
                }
                
                return false;
            });
        }

        // 应用状态过滤
        if (this.currentFilter !== 'all') {
            filteredWords = filteredWords.filter(([_, info]) => {
                return this.currentFilter === 'mastered' ? info.mastered : !info.mastered;
            });
        }

        // 应用排序
        filteredWords.sort(([wordA, infoA], [wordB, infoB]) => {
            const direction = this.sortDirection === 'desc' ? -1 : 1;
            
            switch (this.currentSort) {
                case 'word':
                    return direction * wordA.localeCompare(wordB);
                case 'status':
                    return direction * (Number(infoA.mastered) - Number(infoB.mastered));
                case 'time':
                default:
                    return direction * (infoA.timestamp - infoB.timestamp);
            }
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
            const [row, exampleRow] = this.createWordRow(word, info);
            tbody.appendChild(row);
            tbody.appendChild(exampleRow);
        });

        this.updatePaginationControls(totalItems);
        this.updateDeleteButtonState();
    }

    createWordRow(word, info) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="expand-col">
                <button class="toggle-example-btn" title="查看例句">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                    </svg>
                </button>
            </td>
            <td class="select-col">
                <input type="checkbox" class="select-checkbox" data-word="${word}" ${this.selectedWords.has(word) ? 'checked' : ''}>
            </td>
            <td>${word}</td>
            <td>${info.pronunciation.American || '-'}</td>
            <td>${this.formatDefinitions(info.definitions)}</td>
            <td>${this.formatTimestamp(info.timestamp)}</td>
            <td class="status-col">
                <label class="status-toggle">
                    <input type="checkbox" class="status-checkbox" data-word="${word}" ${info.mastered ? 'checked' : ''}>
                    <span class="status-slider"></span>
                </label>
            </td>
            <td class="actions-col">
                <button class="delete-btn" title="删除">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                </button>
            </td>
        `;

        // 创建例句行（默认隐藏）
        const exampleRow = document.createElement('tr');
        exampleRow.className = 'example-row';
        exampleRow.style.display = 'none';
        exampleRow.innerHTML = `
            <td colspan="8">
                <div class="example-content">
                    <strong>例句：</strong>
                    <p>${info.memory_method || '暂无例句'}</p>
                </div>
            </td>
        `;

        // 添加事件监听
        const toggleBtn = tr.querySelector('.toggle-example-btn');
        toggleBtn.addEventListener('click', () => {
            const isExpanded = toggleBtn.classList.contains('expanded');
            toggleBtn.classList.toggle('expanded');
            toggleBtn.innerHTML = isExpanded ? 
                '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>' :
                '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg>';
            exampleRow.style.display = isExpanded ? 'none' : 'table-row';
        });

        // 其他事件监听保持不变...
        const checkbox = tr.querySelector('.select-checkbox');
        checkbox.addEventListener('change', (e) => {
            this.toggleWordSelection(word, e.target.checked);
        });

        const statusToggle = tr.querySelector('.status-checkbox');
        statusToggle.addEventListener('change', async (e) => {
            e.stopPropagation();
            await this.toggleWordStatus(word, e.target.checked);
        });

        const deleteBtn = tr.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => {
            if (confirm(`确定要删除单词 "${word}" 吗？`)) {
                this.deleteWord(word);
            }
        });

        return [tr, exampleRow];
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
            // 更新状态切换按钮的状态，但不影响选中状态
            const statusToggle = document.querySelector(`.status-toggle input[data-word="${word}"]`);
            if (statusToggle) {
                statusToggle.checked = mastered;
            }
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
        if (!definitions) return '-';
        
        if (Array.isArray(definitions)) {
            if (definitions.length === 0) return '-';
            return definitions.map(def => {
                if (typeof def === 'object' && def.pos && def.meaning) {
                    return `${def.pos} ${def.meaning}`;
                } else if (typeof def === 'object' && def.meaning) {
                    return def.meaning;
                } else if (typeof def === 'string') {
                    return def;
                } else {
                    return String(def);
                }
            }).join('; ');
        } else if (typeof definitions === 'string') {
            return definitions || '-';
        } else {
            return '-';
        }
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