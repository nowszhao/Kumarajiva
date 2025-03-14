import { VocabularyStorage } from './vocabularyStorage';
import { StorageManager } from './youtubeVideoParser';
import { WordCollector } from './wordCollector';

class AnalysisPanel {
    constructor() {
        this.panel = null;
        this.isVisible = false;
        this.currentTab = 'summary'; // 修改默认标签为总结
        this.analyzer = null; // 添加 analyzer 引用
        this.currentSubtitles = null; // 添加当前字幕引用
        this.currentVideoId = null; // 添加视频ID属性
        this.collectedWords = new Set(); // 添加收藏单词集合
        this.storageManager = new StorageManager();
        
        // 在初始化时添加新的样式
        const style = document.createElement('style');
        style.textContent += `
            .analyze-current-tab-btn {
                margin-left: 8px;
                padding: 6px 12px;
                background: #1a73e8;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }

            .analyze-current-tab-btn:hover {
                background: #1557b0;
            }

            .empty-state {
                text-align: center;
                padding: 24px;
                color: #666;
                font-size: 14px;
            }

            .error-state {
                text-align: center;
                padding: 24px;
                color: #d93025;
                font-size: 14px;
            }

            .retry-btn {
                margin-top: 12px;
                padding: 6px 12px;
                background: #d93025;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
            }

            .retry-btn:hover {
                background: #a50e0e;
            }

            .loading-indicator {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 20px;
                gap: 12px;
            }

            .spinner {
                width: 24px;
                height: 24px;
                border: 2px solid #f3f3f3;
                border-top: 2px solid #1a73e8;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            .loading-indicator span {
                color: #666;
                font-size: 14px;
            }
        `;
        document.head.appendChild(style);

        // 添加标签页内容状态管理
        this.tabContents = {
            summary: null,
            words: null,
            phrases: null
        };

        // 添加加载状态跟踪
        this.loadingStates = {
            summary: false,
            words: false,
            phrases: false
        };
    }

    async initialize() {
        // 加载已收藏的单词
        const words = await VocabularyStorage.getWords();
        this.collectedWords = new Set(Object.keys(words));
    }

    createPanel() {
        const secondaryInner = document.querySelector('#secondary-inner');
        if (!secondaryInner) {
            console.error('Secondary inner container not found');
            return;
        }

        const panel = document.createElement('div');
        panel.className = 'subtitle-analysis-panel';
        // panel.innerHTML = `
        //     <div class="analysis-header">
        //         <h3>AI 字幕解析</h3>
        //         <button class="close-btn">×</button>
        //     </div>
        //     <div class="analysis-tabs">
        //         <button class="tab-btn active" data-tab="summary">视频总结</button>
        //         <button class="tab-btn" data-tab="words">视频词汇</button>
        //         <button class="tab-btn" data-tab="phrases">视频短语</button>
        //         <button class="tab-btn" data-tab="current">字幕词汇</button>
        //     </div>
        //     <div class="analysis-search">
        //         <input type="text" placeholder="在视频中搜索...">
        //         <button class="analyze-current-tab-btn">解析当前内容</button>
        //     </div>
        //     <div class="analysis-content">
        //         <div class="loading-indicator" style="display: none;">
        //             <div class="spinner"></div>
        //             <span>正在分析字幕...</span>
        //         </div>
        //         <div class="analysis-results">
        //             <div class="empty-state">
        //                 点击上方"解析当前内容"按钮开始分析
        //             </div>
        //         </div>
        //     </div>
        // `;


        panel.innerHTML = `
            <div class="analysis-header">
                <h3>AI 字幕解析</h3>
                <button class="close-btn">×</button>
            </div>
            <div class="analysis-tabs">
                <button class="tab-btn active" data-tab="summary">视频总结</button>
                <button class="tab-btn" data-tab="words">视频词汇</button>
                <button class="tab-btn" data-tab="current">字幕词汇</button>
            </div>
            <div class="analysis-search">
                <input type="text" placeholder="在视频中搜索...">
                <button class="analyze-current-tab-btn">解析当前内容</button>

            </div>
            <div class="analysis-content">
                <div class="loading-indicator" style="display: none;">
                    <div class="spinner"></div>
                    <span>正在分析字幕...</span>
                </div>
                <div class="analysis-results">
                    <div class="empty-state">
                       点击解析当前内容开始分析
                    </div>
                </div>
            </div>
        `;

        // 将面板插入到右侧栏的第一个位置
        if (secondaryInner.firstChild) {
            secondaryInner.insertBefore(panel, secondaryInner.firstChild);
        } else {
            secondaryInner.appendChild(panel);
        }
        
        this.panel = panel;
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 关闭按钮事件
        this.panel.querySelector('.close-btn').addEventListener('click', () => {
            this.hidePanel();
        });

        // 搜索框事件
        const searchInput = this.panel.querySelector('.analysis-search input');
        searchInput.addEventListener('input', (e) => {
            this.filterResults(e.target.value);
        });

        // 监听视频全屏变化
        document.addEventListener('fullscreenchange', () => {
            this.handleFullscreenChange();
        });

        // 添加标签切换事件
        const tabBtns = this.panel.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.target.dataset.tab;
                this.switchTab(tab);
            });
        });

        // Add after setupEventListeners method
        this.setupAudioPlayback();

        // 修改收藏按钮事件监听
        this.panel.addEventListener('click', async (e) => {
            const collectBtn = e.target.closest('.collect-btn');
            if (collectBtn) {
                const word = collectBtn.dataset.word;
                const card = collectBtn.closest('.analysis-card');
                const wordInfo = this.extractWordInfo(card);

                try {
                    if (collectBtn.classList.contains('collected')) {
                        await VocabularyStorage.removeWord(word);
                        this.collectedWords.delete(word);
                        collectBtn.classList.remove('collected');
                        collectBtn.title = '收藏单词';
                        
                        // 移除页面中该单词的所有高亮
                        document.querySelectorAll(`.collected-word[data-word="${word.toLowerCase()}"]`)
                            .forEach((el) => {
                                const textNode = document.createTextNode(el.textContent);
                                el.parentNode.replaceChild(textNode, el);
                            });
                    } else {
                        await VocabularyStorage.addWord(word, wordInfo);
                        this.collectedWords.add(word);
                        collectBtn.classList.add('collected');
                        collectBtn.title = '取消收藏';
                        
                        // 添加高亮更新
                        const wordCollector = new WordCollector();
                        await wordCollector.initialize();
                        await wordCollector.highlightCollectedWords(document.body);
                    }
                } catch (error) {
                    console.error('Failed to update word collection:', error);
                }
            }
        });

        // 批量操作工具栏
        const toolbarHtml = `
            <div class="analysis-toolbar">
                <label>
                    <input type="checkbox" id="selectAllWords"> 全选
                </label>
                <button id="batchCollect" class="batch-btn">批量收藏</button>
                <button id="batchUncollect" class="batch-btn">批量取消收藏</button>
            </div>
        `;
        this.panel.querySelector('.analysis-search').insertAdjacentHTML('beforebegin', toolbarHtml);

        // 批量操作事件处理
        this.setupBatchOperations();

        // 修改解析按钮事件监听
        const analyzeBtn = this.panel.querySelector('.analyze-current-tab-btn');
        analyzeBtn.addEventListener('click', async () => {
            if (!this.analyzer || !this.currentSubtitles || !this.currentVideoId) {
                console.error('Analyzer, subtitles, or video ID not set');
                return;
            }

            this.setLoading(true);
            try {
                const results = await this.analyzer.analyzeSubtitles(
                    this.currentSubtitles,
                    this.currentTab,
                    this.currentVideoId
                );
                
                if (results) {
                    // 只更新当前标签页的内容
                    this.tabContents[this.currentTab] = results;
                    this.renderResults(results);
                } else {
                    throw new Error('Analysis failed');
                }
            } catch (error) {
                console.error('Failed to analyze subtitles:', error);
                const resultsContainer = this.panel.querySelector('.analysis-results');
                resultsContainer.innerHTML = `
                    <div class="error-state">
                        分析失败，请稍后重试
                        <button class="retry-btn">重试</button>
                    </div>
                `;

                // 添加重试按钮事件监听
                const retryBtn = resultsContainer.querySelector('.retry-btn');
                retryBtn.addEventListener('click', () => {
                    analyzeBtn.click();
                });
            } finally {
                this.setLoading(false);
            }
        });
    }

    handleFullscreenChange() {
        if (document.fullscreenElement) {
            this.panel.style.display = 'none';
        } else {
            if (this.isVisible) {
                this.panel.style.display = 'flex';
            }
        }
    }

    showPanel() {
        if (!this.panel) {
            this.createPanel();
        }
        this.panel.classList.add('visible');
        this.isVisible = true;
    }

    hidePanel() {
        if (this.panel) {
            this.panel.classList.remove('visible');
            this.isVisible = false;
            // 重置所有加载状态
            this.loadingStates = {
                summary: false,
                words: false,
                phrases: false
            };
        }
    }

    setLoading(loading) {
        if (!this.panel) return;
        
        const resultsContainer = this.panel.querySelector('.analysis-results');
        
        // 更新当前标签的加载状态
        this.loadingStates[this.currentTab] = loading;
        
        if (loading) {
            // 只在当前标签页显示加载状态
            if (this.currentTab === 'summary') {
                resultsContainer.innerHTML = `
                    <div class="summary-card">
                        <div class="loading-indicator" style="display: flex;">
                            <div class="spinner"></div>
                            <span>正在分析字幕...</span>
                        </div>
                    </div>
                `;
            } else {
                resultsContainer.innerHTML = `
                    <div class="analysis-card">
                        <div class="loading-indicator" style="display: flex;">
                            <div class="spinner"></div>
                            <span>正在分析字幕...</span>
                        </div>
                    </div>
                `;
            }
        } else {
            if (this.tabContents[this.currentTab]) {
                if (this.currentTab === 'summary') {
                    resultsContainer.innerHTML = this.createSummaryCard(this.tabContents[this.currentTab]);
                } else {
                    resultsContainer.innerHTML = this.tabContents[this.currentTab]
                        .map(item => this.createAnalysisCard(item))
                        .join('');
                    this.setupAudioPlayback();
                }
            } else {
                resultsContainer.innerHTML = `
                
                 <div class="empty-state">
                    点击解析当前内容开始分析
                 </div>
                `
            }
        }
    }

    async renderResults(results) {
        if (!this.panel) return;

        // 确保在渲染前已加载收藏状态
        if (this.collectedWords.size === 0) {
            await this.initialize();
        }

        const resultsContainer = this.panel.querySelector('.analysis-results');
        
        // 保存当前标签的结果
        this.tabContents[this.currentTab] = results;
        
        if (this.currentTab === 'summary') {
            resultsContainer.innerHTML = this.createSummaryCard(results);
        } else {
            resultsContainer.innerHTML = results.map(item => this.createAnalysisCard(item)).join('');
            this.setupAudioPlayback();
        }
    }

    createAnalysisCard(item) {
        const isCollected = this.collectedWords.has(item.vocabulary);
        
        return `
            <div class="analysis-card">
                <div class="card-header">
                    <div class="expression-container">
                        <input type="checkbox" class="word-checkbox" data-word="${item.vocabulary}">
                        <span class="expression">${item.vocabulary}</span>
                        <button class="play-audio-btn" data-text="${item.vocabulary}" title="播放发音">
                            <svg viewBox="0 0 24 24" width="16" height="16">
                                <path fill="currentColor" d="M8 5v14l11-7z"/>
                            </svg>
                        </button>
                        <button class="collect-btn ${isCollected ? 'collected' : ''}" 
                                data-word="${item.vocabulary}" 
                                title="${isCollected ? '取消收藏' : '收藏单词'}">
                            <svg viewBox="0 0 24 24" width="16" height="16">
                                <path fill="currentColor" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="tags">
                        <span class="tag type">${item.type}</span>
                        <span class="tag difficulty">${item.difficulty || 'C1'}</span>
                        <span class="tag speech">${item.part_of_speech}</span>
                    </div>
                </div>
                <div class="card-body">
                    <div class="phonetic">${item.phonetic}</div>
                    <div class="meaning">${item.chinese_meaning}</div>
                    ${item.chinese_english_sentence ? `
                        <div class="memory-method">
                            <p>${item.chinese_english_sentence}</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    createSummaryCard(content) {
        try {
            // 解析 JSON 内容
            const data = typeof content === 'string' ? JSON.parse(content) : content;
            
            let html = '<div class="summary-card">';
            
            // 添加总结部分
            if (data.summary) {
                html += `
                    <div class="summary-section">
                        <h4 class="summary-title">内容总结</h4>
                        <p class="summary-text">${data.summary}</p>
                    </div>
                `;
            }
            
            // 添加核心概念部分
            if (data.coreConcepts && data.coreConcepts.length > 0) {
                html += `
                    <div class="concepts-section">
                        <h4 class="summary-title">核心概念</h4>
                        <div class="concepts-list">
                            ${data.coreConcepts.map(concept => `
                                <div class="concept-item">
                                    <h5 class="concept-term">${concept.term}</h5>
                                    <p class="concept-definition">${concept.definition}</p>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
            
            // 添加观点部分
            if (data.viewpoints && data.viewpoints.length > 0) {
                html += `
                    <div class="viewpoints-section">
                        <h4 class="summary-title">核心观点</h4>
                        ${data.viewpoints.map((point, index) => `
                            <div class="viewpoint-item">
                                <h5 class="viewpoint-title">${index + 1}. ${point.viewpoint}</h5>
                                <div class="arguments-list">
                                    ${point.arguments.map(arg => `
                                        <div class="argument-item">
                                            <p class="argument-text">• ${arg}</p>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            }
            
            html += '</div>';
            return html;
        } catch (error) {
            console.error('Error parsing summary content:', error);
            return `
                <div class="summary-card">
                    <div class="summary-error">
                        <p>解析内容时出现错误，请重试</p>
                    </div>
                </div>
            `;
        }
    }

    filterResults(searchText) {
        if (!searchText) {
            // 如果搜索框为空,显示所有结果
            this.panel.querySelectorAll('.analysis-card').forEach(card => {
                card.style.display = 'block';
            });
            return;
        }

        // 过滤结果
        this.panel.querySelectorAll('.analysis-card').forEach(card => {
            const text = card.textContent.toLowerCase();
            if (text.includes(searchText.toLowerCase())) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }

    switchTab(tab) {
        // 更新标签状态
        const tabBtns = this.panel.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // 根据标签显示/隐藏工具栏
        const toolbar = this.panel.querySelector('.analysis-toolbar');
        if (toolbar) {
            toolbar.style.display = tab === 'summary' ? 'none' : 'flex';
        }

        this.currentTab = tab;
        const resultsContainer = this.panel.querySelector('.analysis-results');

        // 检查是否正在加载
        if (this.loadingStates[tab]) {
            // 显示加载状态
            if (tab === 'summary') {
                resultsContainer.innerHTML = `
                    <div class="summary-card">
                        <div class="loading-indicator" style="display: flex;">
                            <div class="spinner"></div>
                            <span>正在分析字幕...</span>
                        </div>
                    </div>
                `;
            } else {
                resultsContainer.innerHTML = `
                    <div class="analysis-card">
                        <div class="loading-indicator" style="display: flex;">
                            <div class="spinner"></div>
                            <span>正在分析字幕...</span>
                        </div>
                    </div>
                `;
            }
        } else if (this.tabContents[tab]) {
            // 显示已有内容
            if (tab === 'summary') {
                resultsContainer.innerHTML = this.createSummaryCard(this.tabContents[tab]);
            } else {
                resultsContainer.innerHTML = this.tabContents[tab].map(item => this.createAnalysisCard(item)).join('');
                this.setupAudioPlayback();
            }
        } else {
            // 显示空状态
            resultsContainer.innerHTML = `
                <div class="empty-state">
                    点击解析当前内容开始分析
                 </div>
            `;
        }
    }

    async triggerAnalysis() {
        if (!this.analyzer || !this.currentSubtitles || !this.currentVideoId) {
            console.error('Analyzer, subtitles, or video ID not set');
            return;
        }

        this.setLoading(true);

        try {
            const results = await this.analyzer.analyzeSubtitles(
                this.currentSubtitles, 
                this.currentTab,
                this.currentVideoId
            );
            
            if (results) {
                this.renderResults(results);
            } else {
                throw new Error('Analysis failed');
            }
        } catch (error) {
            console.error('Failed to analyze subtitles:', error);
            this.renderResults([{
                type: 'Error',
                expression: '分析失败',
                difficulty: 'N/A',
                part_of_speech: 'N/A',
                phonetic: 'N/A',
                chinese_meaning: '请稍后重试',
                memory_method: '',
                source_sentence: '',
                source_translation: ''
            }]);
        } finally {
            this.setLoading(false);
        }
    }

    // 添加设置方法
    setAnalyzer(analyzer) {
        this.analyzer = analyzer;
    }

    setSubtitles(subtitles) {
        this.currentSubtitles = subtitles;
    }

    setupAudioPlayback() {
        if (!this.panel) return;
        
        this.panel.addEventListener('click', (e) => {
            // 阻止事件冒泡
            e.stopPropagation();
            
            const playButton = e.target.closest('.play-audio-btn');
            if (!playButton) return;

            // 如果按钮正在加载状态，不要重复播放
            if (playButton.classList.contains('loading')) return;

            const text = playButton.dataset.text;
            if (!text) return;

            const audio = new Audio(
                `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2&rate=6`
            );
            
            // Add loading state
            playButton.classList.add('loading');
            
            audio.onloadeddata = () => {
                playButton.classList.remove('loading');
            };
            
            audio.onerror = () => {
                playButton.classList.remove('loading');
                console.error('Failed to load audio');
            };
            
            audio.play();
        });
    }

    // 添加设置视频ID的方法
    setVideoId(videoId) {
        this.currentVideoId = videoId;
    }

    setupBatchOperations() {
        // 全选功能
        this.panel.querySelector('#selectAllWords').addEventListener('change', (e) => {
            const checkboxes = this.panel.querySelectorAll('.word-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = e.target.checked;
            });
        });

        // 批量收藏
        this.panel.querySelector('#batchCollect').addEventListener('click', async () => {
            const selectedWords = this.getSelectedWords();
            for (const word of selectedWords) {
                const card = this.panel.querySelector(`[data-word="${word}"]`).closest('.analysis-card');
                const wordInfo = this.extractWordInfo(card);
                await VocabularyStorage.addWord(word, wordInfo);
                
                // 更新UI
                const collectBtn = card.querySelector('.collect-btn');
                collectBtn.classList.add('collected');
                collectBtn.title = '取消收藏';
            }
            
            // 批量更新高亮
            const wordCollector = new WordCollector();
            await wordCollector.initialize();
            await wordCollector.highlightCollectedWords(document.body);
        });

        // 批量取消收藏
        this.panel.querySelector('#batchUncollect').addEventListener('click', async () => {
            const selectedWords = this.getSelectedWords();
            for (const word of selectedWords) {
                await VocabularyStorage.removeWord(word);
                
                // 更新UI
                const collectBtn = this.panel.querySelector(`[data-word="${word}"]`).closest('.analysis-card').querySelector('.collect-btn');
                collectBtn.classList.remove('collected');
                collectBtn.title = '收藏单词';
                
                // 移除页面中该单词的所有高亮
                document.querySelectorAll(`.collected-word[data-word="${word.toLowerCase()}"]`)
                    .forEach((el) => {
                        const textNode = document.createTextNode(el.textContent);
                        el.parentNode.replaceChild(textNode, el);
                    });
            }
        });

        // 设置工具栏的初始显示状态
        const toolbar = this.panel.querySelector('.analysis-toolbar');
        if (toolbar) {
            toolbar.style.display = this.currentTab === 'summary' ? 'none' : 'flex';
        }
    }

    getSelectedWords() {
        const selectedWords = [];
        const checkboxes = this.panel.querySelectorAll('.word-checkbox');
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                selectedWords.push(checkbox.dataset.word);
            }
        });
        return selectedWords;
    }

    extractWordInfo(card) {
        const ret = {
            "definitions": [
              {
                "meaning": card.querySelector('.meaning').textContent,
                "pos": card.querySelector('.tag.speech').textContent
              }
            ],
            "mastered": false,
            "pronunciation": {
              "American": card.querySelector('.phonetic').textContent,
              "British": ""
            },
            "timestamp": new Date().getTime(),
            "word": card.querySelector('.expression').textContent,
            "memory_method": card.querySelector('.memory-method p').textContent,
        };

        console.log("ret:", ret);

        return ret;
    }

    // 清空所有标签页内容的方法
    clearAllTabContents() {
        this.tabContents = {
            summary: null,
            words: null,
            phrases: null
        };
        
        this.loadingStates = {
            summary: false,
            words: false,
            phrases: false
        };
        
        if (this.panel) {
            const resultsContainer = this.panel.querySelector('.analysis-results');
            resultsContainer.innerHTML = `
                 <div class="empty-state">
                    点击解析当前内容开始分析
                 </div>
            `;
        }
    }

    // 添加新方法用于处理单字幕词汇分析
    async analyzeSingleSubtitle(subtitle) {
        if (!subtitle || !subtitle.text) {
            console.error('Invalid subtitle for analysis');
            return;
        }

        const videoId = this.currentVideoId;
        if (!videoId) {
            console.error('Video ID not set');
            return;
        }

        try {
            const storageKey = `yt-subtitles-${videoId}`;
            const cached = await this.storageManager.getFromStorage(storageKey);

            if (cached && cached[subtitle.text]) {
                const subtitleData = cached[subtitle.text];
                if (subtitleData.difficultVocabulary) {
                    // 切换到单字幕词汇标签
                    const tabBtn = this.panel.querySelector('[data-tab="current"]');
                    if (tabBtn) {
                        this.switchTab('current');
                    }
                    this.renderResults(subtitleData.difficultVocabulary);
                    return;
                }
            }

            // 如果没有缓存数据，显示提示信息
            const resultsContainer = this.panel.querySelector('.analysis-results');
            resultsContainer.innerHTML = '<div class="empty-state">该字幕暂无分析数据，请先进行整体分析</div>';
        } catch (error) {
            console.error('Error analyzing single subtitle:', error);
            const resultsContainer = this.panel.querySelector('.analysis-results');
            resultsContainer.innerHTML = '<div class="error-state">分析出错，请稍后重试</div>';
        }
    }
}

export default AnalysisPanel; 