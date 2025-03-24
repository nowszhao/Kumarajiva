import config from '../config/config';
import { VocabularyStorage } from './vocabularyStorage';

export class WordCollector {
    constructor() {
        this.cardContainer = null;
        this.isCardVisible = false;
        this.currentWordInfo = null;  // 添加当前单词信息存储
        this.cardPosition = { x: 0, y: 0 };  // 添加卡片位置存储
        this.boundShowWordDetails = this.showWordDetails.bind(this);
        this.collectedWords = null;
        this.observer = null;
        
        // 确保在构造函数中创建卡片容器
        this.createCardContainer();
    }

    async initialize() {
        // 避免重复初始化
        if (this.collectedWords) {
            return;
        }

        this.setupEventListeners();
        
        // 先获取词汇数据
        const words = await VocabularyStorage.getWords();
        this.collectedWords = words; // 存储完整的词汇信息，而不是仅仅存储单词列表
        
        // 初始化时高亮所有已收藏的单词
        this.highlightVisibleContent(document.body);
        
        // 监听 DOM 变化，处理动态加载的内容
        this.setupMutationObserver();
    }

    createCardContainer() {
        // 检查是否已存在卡片容器
        if (this.cardContainer) {
            return;
        }

        // 检查页面上是否已存在卡片容器
        let existingContainer = document.querySelector('.word-card-container');
        if (existingContainer) {
            this.cardContainer = existingContainer;
            return;
        }

        const container = document.createElement('div');
        container.className = 'word-card-container';
        container.style.display = 'none';
        container.innerHTML = `
            <div class="word-card">
                <div class="word-card-header">
                    <div class="word-title">
                        <span class="word"></span>
                        <span class="phonetic"></span>
                    </div>
                    <button class="play-audio-btn">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M8 5v14l11-7z"/>
                        </svg>
                    </button>
                </div>
                <div class="word-content">
                    <div class="definition"></div>
                    <div class="explanation"></div>
                    <div class="examples"></div>
                </div>
                <div class="word-card-footer">
                    <button class="collect-btn">收藏</button>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        this.cardContainer = container;
    }

    async setupEventListeners() {
        // 获取自动显示设置
        const { autoShowWordDetails } = await chrome.storage.sync.get(['autoShowWordDetails']);
        const shouldAutoShow = autoShowWordDetails ?? config.translation.interaction.autoShowWordDetails;

        // 监听文本选择事件
        document.addEventListener('mouseup', async (e) => {
            const selection = window.getSelection();
            const text = selection.toString().trim();

            if (!text || text.length > 30) {
                if (!this.cardContainer.contains(e.target)) {
                    this.hideCard();
                }
                return;
            }

            // 检查是否为英文单词或短语，且是否启用自动显示
            if (/^[a-zA-Z\s-]+$/.test(text) && shouldAutoShow) {
                const wordInfo = await this.fetchWordInfo(text);
                if (wordInfo) {
                    this.showCard(wordInfo, e);
                }
            }
        });

        // 收藏按钮点击事件
        this.cardContainer.querySelector('.collect-btn').addEventListener('click', async (e) => {
            const word = this.cardContainer.querySelector('.word').textContent;
            await this.toggleWordCollection(word);
        });

        // 播放发音按钮点击事件
        this.cardContainer.querySelector('.play-audio-btn').addEventListener('click', (e) => {
            const word = this.cardContainer.querySelector('.word').textContent;
            this.playWordAudio(word);
        });

        // 修改文档点击事件监听
        document.addEventListener('mousedown', (e) => {
            if (this.cardContainer && 
                !this.cardContainer.contains(e.target) && 
                !e.target.classList.contains('collected-word')) {
                this.hideCard();
            }
        });

        // 防止卡片内的点击事件触发文本选择
        this.cardContainer.addEventListener('mousedown', (e) => {
            if (e.target.matches('button, .play-audio-btn, .collect-btn')) {
                e.preventDefault();
            }
        });
    }

    async fetchWordInfo(text) {
        try {
            // 通过 background script 发送请求
            const response = await chrome.runtime.sendMessage({
                type: 'FETCH_WORD_INFO',
                word: text
            });

            if (!response.success) {
                console.error('Failed to fetch word info:', response.error);
                return null;
            }

            const data = response.data;
            
            // 如果没有查询结果
            if (!data.ec?.word) return null;
            
            // 处理单词数据
            const wordData = data.ec.word;
            const result = {
                word: text,
                pronunciation: {
                    American: wordData.usphone ? `/${wordData.usphone}/` : '',
                    British: wordData.ukphone ? `/${wordData.ukphone}/` : ''
                },
                audioUrls: {
                    American: '',
                    British: ''
                },
                definitions: [],
                examples: []
            };

            // 处理释义
            if (wordData.trs) {
                wordData.trs.forEach(tr => {
                    if (tr.pos && tr.tran) {
                        result.definitions.push({
                            pos: tr.pos,
                            meaning: tr.tran
                        });
                    }else{
                        result.definitions.push({
                            meaning: tr.tran
                        });
                    }
                    // 处理例句
                    if (tr.sentence) {
                        tr.sentence.forEach(sent => {
                            result.examples.push({
                                en: sent.en,
                                cn: sent.zh
                            });
                        });
                    }
                });
            }

            return result;
        } catch (error) {
            console.error('Failed to fetch word info:', error);
            return null;
        }
    }

    // 获取音频 URL
    async getAudioUrl(audio, type) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_AUDIO_URL',
                word: audio,
                audioType: type
            });
            return response.success ? response.url : '';
        } catch (error) {
            console.error('Failed to get audio URL:', error);
            return '';
        }
    }

    showCard(wordInfo, event) {
        this.currentWordInfo = wordInfo;
        
        // 阻止事件冒泡，防止触发文档点击事件
        event.stopPropagation();
        
        const { clientX, clientY } = event;
        
        // 先计算位置，再显示卡片
        const x = Math.min(clientX, window.innerWidth - 340); // 320px宽度 + 20px边距
        const y = Math.min(clientY + 10, window.innerHeight - 400); // 预估卡片高度
        
        this.cardContainer.style.left = `${x}px`;
        this.cardContainer.style.top = `${y}px`;
        this.cardContainer.style.display = 'block';
        this.isCardVisible = true;

        try {
            // 更新卡片内容
            this.cardContainer.querySelector('.word-card').innerHTML = this.getCardTemplate();
            
            // 设置单词和音标
            const wordElem = this.cardContainer.querySelector('.word');
            wordElem.textContent = wordInfo.word;
            wordElem.dataset.word = wordInfo.word;
            
            const phonetic = wordInfo.pronunciation.American || wordInfo.pronunciation.British;
            this.cardContainer.querySelector('.phonetic').textContent = phonetic;

            // 设置释义
            const definitionsHtml = wordInfo.definitions
                .map(def => `<div class="definition-item">
                    <span class="pos">${def.pos}</span>
                    <span class="meaning">${def.meaning}</span>
                </div>`)
                .join('');
            this.cardContainer.querySelector('.definition').innerHTML = definitionsHtml;

            // 设置例句
            const examplesHtml = wordInfo.examples
                .map(example => `<div class="example">
                    <div class="en">${example.en}</div>
                    <div class="cn">${example.cn}</div>
                </div>`)
                .join('');
            this.cardContainer.querySelector('.examples').innerHTML = examplesHtml;

            // 检查收藏状态并更新按钮
            this.updateCollectButton(wordInfo.word);

            // 重新绑定事件监听器
            this.setupCardEventListeners();
            
            // 阻止卡片内的点击事件冒泡
            this.cardContainer.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            
        } catch (error) {
            console.error('Error showing word card:', error);
            this.cardContainer.querySelector('.word-card').innerHTML = `
                <div class="word-card-error">加载失败，请重试</div>
            `;
        }
    }

    hideCard() {
        if (this.isCardVisible) {
            this.cardContainer.style.display = 'none';
            this.isCardVisible = false;
        }
    }

    async updateCollectButton(word) {
        const collectedWords = await this.getCollectedWords();
        const isCollected = word in collectedWords;
        const button = this.cardContainer.querySelector('.collect-btn');
        
        button.textContent = isCollected ? '取消收藏' : '收藏单词';
        button.classList.toggle('collected', isCollected);
    }

    async toggleWordCollection(word) {
        try {
            const collectedWords = await this.getCollectedWords();
            const isCollecting = !(word in collectedWords);
            
            if (isCollecting) {
                const wordInfo = this.currentWordInfo;
                await VocabularyStorage.addWord(word, {
                    word: word,
                    pronunciation: wordInfo.pronunciation,
                    definitions: wordInfo.definitions,
                    timestamp: Date.now(),
                    mastered: false
                });
            } else {
                await VocabularyStorage.removeWord(word);
            }
            
            // Update button state
            const button = this.cardContainer.querySelector('.collect-btn');
            button.textContent = isCollecting ? '取消收藏' : '收藏单词';
            button.classList.toggle('collected', isCollecting);
            
            // Update page highlighting
            this.updateWordHighlighting(word, isCollecting);
        } catch (error) {
            console.error('Failed to toggle word collection:', error);
        }
    }

    async getCollectedWords() {
        return VocabularyStorage.getWords();
    }

    async playWordAudio(word) {
        
        if (!word) return;
        
        const playButton = this.cardContainer.querySelector('.play-audio-btn');
        if (playButton.classList.contains('loading')) return;
        
        playButton.classList.add('loading');
        
        try {
            // 通过 background script 获取音频数据
            const response = await chrome.runtime.sendMessage({
                type: 'FETCH_AUDIO',
                word: word,
                audioType: 2
            });

            if (!response || !response.success) {
                throw new Error(response?.error || 'Failed to fetch audio data');
            }

            // 将数组转换回 ArrayBuffer
            const arrayBuffer = new Uint8Array(response.data).buffer;
            
            // 创建 Blob
            const audioBlob = new Blob([arrayBuffer], { type: 'audio/mp3' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            const audio = new Audio(audioUrl);
            
            await new Promise((resolve, reject) => {
                audio.onended = () => {
                    URL.revokeObjectURL(audioUrl); // 清理 Blob URL
                    resolve();
                };
                audio.onerror = (e) => {
                    console.error('Audio play error:', e);
                    reject(new Error('Failed to play audio'));
                };
                audio.play().catch(reject);
            });
        } catch (error) {
            console.error('Failed to play audio:', error);
        } finally {
            playButton.classList.remove('loading');
        }
    }

    async initializeHighlighting() {
        // 使用 IntersectionObserver 优化性能
        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.highlightWordsInElement(entry.target);
                    }
                });
            },
            { threshold: 0.1 }
        );

        // 初始化时高亮可见区域
        const collectedWords = await this.getCollectedWords();
        if (Object.keys(collectedWords).length > 0) {
            this.highlightVisibleContent(collectedWords);
        }

        // 监听 DOM 变化
        this.mutationObserver = new MutationObserver((mutations) => {
            this.handleDOMChanges(mutations);
        });
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    async handleDOMChanges(mutations) {
        const collectedWords = await this.getCollectedWords();
        if (Object.keys(collectedWords).length === 0) return;

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    this.highlightCollectedWords(collectedWords, node);
                }
            }
        }
    }

    async highlightCollectedWords(element = document.body, forceUpdate = false) {
        if (!this.collectedWords || forceUpdate) {
            const words = await VocabularyStorage.getWords();
            this.collectedWords = words;
        }

        // 确保 element 是有效的 DOM 节点
        if (!(element instanceof Node)) {
            console.warn('Invalid element provided to highlightCollectedWords');
            element = document.body;
        }

        // 使用已缓存的词汇列表进行高亮
        if (Object.keys(this.collectedWords).length > 0) {
            this.highlightVisibleContent(element);
        }
    }

    // 添加辅助方法来处理重叠匹配
    removeOverlappingMatches(matches) {
        return matches.reduce((acc, current) => {
            if (acc.length === 0) {
                acc.push(current);
                return acc;
            }

            const lastMatch = acc[acc.length - 1];
            const currentEnd = current.index + current.length;
            const lastEnd = lastMatch.index + lastMatch.length;

            // 检查是否重叠
            if (current.index >= lastEnd) {
                acc.push(current);
            } else {
                // 如果重叠，保留较长的匹配
                if (current.length > lastMatch.length) {
                    acc[acc.length - 1] = current;
                }
            }
            return acc;
        }, []);
    }

    // 添加辅助方法来转义正则表达式特殊字符
    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 修改 findTextNodes 方法以更精确地过滤文本节点
    findTextNodes(node) {
        // 确保 node 是有效的 DOM 节点
        if (!(node instanceof Node)) {
            console.warn('Invalid node provided to findTextNodes');
            return [];
        }

        const textNodes = [];
        const walk = document.createTreeWalker(
            node,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // 排除脚本、样式、已处理的节点等
                    const parent = node.parentNode;
                    if (!parent || 
                        parent.tagName === 'SCRIPT' || 
                        parent.tagName === 'STYLE' || 
                        parent.tagName === 'NOSCRIPT' ||
                        parent.classList?.contains('collected-word') ||
                        parent.classList?.contains('word-card-container') ||
                        parent.closest?.('.word-card-container')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // 确保文本内容不为空且包含有意义的内容
                    if (node.textContent?.trim().length > 0) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_REJECT;
                }
            }
        );

        let current = walk.nextNode();
        while (current) {
            textNodes.push(current);
            current = walk.nextNode();
        }
        return textNodes;
    }

    updateWordHighlighting(word, isCollected) {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        
        if (isCollected) {
            // 使用 TreeWalker 高效查找文本节点
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: (node) => {
                        // 排除已经处理过的节点和特殊区域
                        if (node.parentElement.closest('.word-card-container')) return NodeFilter.FILTER_REJECT;
                        if (node.parentElement.classList.contains('collected-word')) return NodeFilter.FILTER_REJECT;
                        if (regex.test(node.textContent)) return NodeFilter.FILTER_ACCEPT;
                        return NodeFilter.FILTER_REJECT;
                    }
                }
            );

            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            
            nodes.forEach(node => {
                const text = node.textContent;
                const parts = text.split(regex);
                const matches = text.match(regex);
                
                if (!matches) return;
                
                const fragment = document.createDocumentFragment();
                parts.forEach((part, i) => {
                    if (part) fragment.appendChild(document.createTextNode(part));
                    if (matches[i]) {
                        const span = document.createElement('span');
                        span.className = 'collected-word';
                        span.textContent = matches[i];
                        span.dataset.word = matches[i].toLowerCase();
                        fragment.appendChild(span);
                    }
                });
                
                node.parentNode.replaceChild(fragment, node);
            });
        } else {
            // 移除高亮
            document.querySelectorAll('.collected-word').forEach(element => {
                if (regex.test(element.textContent)) {
                    const text = document.createTextNode(element.textContent);
                    element.parentNode.replaceChild(text, element);
                }
            });
        }
    }

    // 添加获取卡片模板的方法
    getCardTemplate() {
        return `
            <div class="word-card-header">
                <div class="word-title">
                    <span class="word"></span>
                    <span class="phonetic"></span>
                </div>
                <button class="play-audio-btn">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M8 5v14l11-7z"/>
                    </svg>
                </button>
            </div>
            <div class="word-content">
                <div class="definition"></div>
                <div class="explanation"></div>
                <div class="examples"></div>
            </div>
            <div class="word-card-footer">
                <button class="collect-btn">收藏单词</button>
            </div>
        `;
    }

    // 修改 setupCardEventListeners 方法
    setupCardEventListeners() {
        // 播放音频按钮
        const playButton = this.cardContainer.querySelector('.play-audio-btn');
        const wordElement = this.cardContainer.querySelector('.word');
        
        if (playButton && wordElement) {
            playButton.onclick = async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const word = wordElement.textContent;
                if (word && !playButton.classList.contains('loading')) {
                    await this.playWordAudio(word);
                }
            };
        }

        // 收藏按钮
        const collectButton = this.cardContainer.querySelector('.collect-btn');
        if (collectButton && wordElement) {
            collectButton.onclick = async (e) => {
                e.stopPropagation();
                e.preventDefault();
                const word = wordElement.textContent;
                if (word) {
                    await this.toggleWordCollection(word);
                }
            };
        }
    }

    // 修改高亮内容的方法
    highlightVisibleContent(container = document.body) {
        // 确保 container 是有效的 DOM 节点
        if (!container || !(container instanceof Node)) {
            console.warn('Invalid container provided to highlightVisibleContent');
            container = document.body;
        }

        if (!this.collectedWords || Object.keys(this.collectedWords).length === 0) return;

        const textNodes = this.findTextNodes(container);
        textNodes.forEach(node => {
            this.processTextNode(node);
        });
    }

    // 处理单个文本节点
    processTextNode(node) {
        let text = node.textContent;
        let matches = [];
        
        // 收集所有匹配项
        for (const [word, wordInfo] of Object.entries(this.collectedWords)) {
            const regex = new RegExp(`\\b${this.escapeRegExp(word)}\\b`, 'gi');
            let match;
            while ((match = regex.exec(text)) !== null && !wordInfo.mastered) {
                matches.push({
                    index: match.index,
                    length: match[0].length,
                    word: word,
                    text: match[0],
                    wordInfo: wordInfo
                });
            }
        }

        // 如果有匹配项，进行替换
        if (matches.length > 0) {
            matches.sort((a, b) => b.index - a.index); // 从后向前替换，避免位置偏移
            
            // 移除重叠的匹配项
            matches = this.removeOverlappingMatches(matches);
            
            let lastIndex = text.length;
            const fragment = document.createDocumentFragment();
            
            // 从后向前处理，避免位置计算错误
            for (let i = matches.length - 1; i >= 0; i--) {
                const match = matches[i];
                
                // 添加匹配后的文本
                if (match.index + match.length < lastIndex) {
                    fragment.insertBefore(
                        document.createTextNode(text.slice(match.index + match.length, lastIndex)),
                        fragment.firstChild
                    );
                }
                
                // 创建高亮 span
                const span = this.createHighlightSpan(match);
                fragment.insertBefore(span, fragment.firstChild);
                
                lastIndex = match.index;
            }
            
            // 添加剩余的文本
            if (lastIndex > 0) {
                fragment.insertBefore(
                    document.createTextNode(text.slice(0, lastIndex)),
                    fragment.firstChild
                );
            }
            
            node.parentNode.replaceChild(fragment, node);
        }
    }

    // 创建高亮 span
    createHighlightSpan(match) {
        const span = document.createElement('span');
        span.className = 'collected-word';
        span.textContent = match.text;
        span.dataset.word = match.word.toLowerCase();
        
        // 添加必要的数据属性
        if (match.wordInfo) {
            span.dataset.pronunciation = JSON.stringify(match.wordInfo.pronunciation || {});
            span.dataset.definitions = JSON.stringify(match.wordInfo.definitions || []);
        }
        
        // 添加点击事件监听器
        span.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showWordDetails(match.wordInfo, e);
        });
        
        return span;
    }

    // 修改 showWordDetails 方法
    showWordDetails(wordInfo, event) {
        if (!wordInfo) return;
        
        // 确保卡片容器存在
        if (!this.cardContainer) {
            this.createCardContainer();
        }
        
        // 如果仍然没有卡片容器，记录错误并返回
        if (!this.cardContainer) {
            console.error('Failed to create word card container');
            return;
        }

        // 更新当前单词信息
        this.currentWordInfo = wordInfo;
        
        // 阻止事件冒泡
        event.stopPropagation();
        
        // 计算位置
        const { clientX, clientY } = event;
        const x = Math.min(clientX, window.innerWidth - 340);
        const y = Math.min(clientY + 10, window.innerHeight - 400);
        
        // 显示卡片
        this.cardContainer.style.left = `${x}px`;
        this.cardContainer.style.top = `${y}px`;
        this.cardContainer.style.display = 'block';
        this.isCardVisible = true;

        try {
            // 更新卡片内容
            const card = this.cardContainer.querySelector('.word-card');
            if (!card) {
                throw new Error('Word card element not found');
            }

            card.innerHTML = this.getCardTemplate();
            
            // 设置单词和音标
            const wordElem = card.querySelector('.word');
            if (wordElem) {
                wordElem.textContent = wordInfo.word;
                wordElem.dataset.word = wordInfo.word;
            }
            
            const phonetic = wordInfo.pronunciation?.American || wordInfo.pronunciation?.British || '';
            const phoneticElem = card.querySelector('.phonetic');
            if (phoneticElem) {
                phoneticElem.textContent = phonetic;
            }

            // 设置释义
            const definitionElem = card.querySelector('.definition');
            if (definitionElem) {
                const definitionsHtml = wordInfo.definitions
                    .map(def => `<div class="definition-item">
                        ${def.pos ? `<span class="pos">${def.pos}</span>` : ''}
                        <span class="meaning">${def.meaning}</span>
                    </div>`)
                    .join('');
                definitionElem.innerHTML = definitionsHtml;
            }

            // 更新收藏按钮状态
            this.updateCollectButton(wordInfo.word);

            // 重新绑定事件监听器
            this.setupCardEventListeners();
            
        } catch (error) {
            console.error('Error showing word card:', error);
            if (this.cardContainer) {
                const card = this.cardContainer.querySelector('.word-card');
                if (card) {
                    card.innerHTML = `
                        <div class="word-card-error">加载失败，请重试</div>
                    `;
                }
            }
        }
    }

    // 添加 IntersectionObserver 设置
    setupIntersectionObserver() {
        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        this.highlightWordsInElement(entry.target);
                        this.observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.1 }
        );
    }

    // 初始高亮处理
    highlightInitialWords(words) {
        // 将文档分块处理
        const chunks = Array.from(document.body.children);
        chunks.forEach(chunk => {
            if (chunk.matches('.word-card-container')) return;
            this.observer.observe(chunk);
        });
    }

    setupMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this.highlightCollectedWords(node);
                    }
                });
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // 添加标记单词为已掌握的方法
    async markWordAsMastered(word) {
        try {
            const collectedWords = await this.getCollectedWords();
            if (word in collectedWords) {
                collectedWords[word].mastered = true;
                await VocabularyStorage.updateWord(word, collectedWords[word]);
                
                // 移除页面中该单词的所有高亮
                document.querySelectorAll(`.collected-word[data-word="${word.toLowerCase()}"]`).forEach(element => {
                    const text = document.createTextNode(element.textContent);
                    element.parentNode.replaceChild(text, element);
                });
            }
        } catch (error) {
            console.error('Failed to mark word as mastered:', error);
        }
    }

    // 添加新方法：移除所有高亮
    removeAllHighlights(container) {
        const highlights = container.querySelectorAll('.collected-word');
        highlights.forEach(el => {
            const textNode = document.createTextNode(el.textContent);
            el.parentNode.replaceChild(textNode, el);
        });
    }

    // 更新单个单词的高亮状态
    async updateWordHighlight(word, isCollected) {
        if (!this.collectedWords) {
            await this.initialize();
        }

        if (isCollected) {
            // 获取完整的单词信息
            const words = await VocabularyStorage.getWords();
            this.collectedWords[word] = words[word];
        } else {
            delete this.collectedWords[word];
        }

        // 重新高亮整个文档
        try {
            this.highlightVisibleContent(document.body);
        } catch (error) {
            console.error('Error highlighting content:', error);
        }
    }
}
