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
    }

    async initialize() {
        this.createCardContainer();
        this.setupEventListeners();
        
        // 初始化时高亮所有已收藏的单词
        await this.highlightCollectedWords();
        
        // 监听 DOM 变化，处理动态加载的内容
        this.setupMutationObserver();

        if (!this.collectedWords) {
            const words = await VocabularyStorage.getWords();
            this.collectedWords = new Set(Object.keys(words));
        }
    }

    createCardContainer() {
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

    async highlightCollectedWords(container = document.body) {
        const collectedWords = await this.getCollectedWords();
        if (Object.keys(collectedWords).length === 0) return;
        
        // 先移除所有现有的高亮，以防重复
        this.removeAllHighlights(container);
        
        const textNodes = this.findTextNodes(container);
        
        textNodes.forEach(node => {
            let text = node.textContent;
            let matches = [];
            let lastIndex = 0;
            
            // 首先收集所有匹配项
            Object.values(collectedWords)
                .filter(wordInfo => !wordInfo.mastered)
                .forEach(wordInfo => {
                    const regex = new RegExp(`\\b${this.escapeRegExp(wordInfo.word)}\\b`, 'gi');
                    let match;
                    while ((match = regex.exec(text)) !== null) {
                        matches.push({
                            index: match.index,
                            length: match[0].length,
                            word: wordInfo.word,
                            text: match[0],
                            wordInfo: wordInfo
                        });
                    }
                });

            // 按位置排序并处理重叠
            matches.sort((a, b) => a.index - b.index);
            matches = this.removeOverlappingMatches(matches);

            if (matches.length > 0) {
                const fragment = document.createDocumentFragment();
                
                matches.forEach((match, i) => {
                    if (match.index > lastIndex) {
                        fragment.appendChild(
                            document.createTextNode(text.slice(lastIndex, match.index))
                        );
                    }
                    
                    // 使用新的创建高亮span方法
                    const span = this.createHighlightSpan(match);
                    fragment.appendChild(span);
                    lastIndex = match.index + match.length;
                });
                
                if (lastIndex < text.length) {
                    fragment.appendChild(
                        document.createTextNode(text.slice(lastIndex))
                    );
                }
                
                node.parentNode.replaceChild(fragment, node);
            }
        });
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
        const textNodes = [];
        const walk = document.createTreeWalker(
            node,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // 排除脚本、样式、已处理的节点等
                    const parent = node.parentNode;
                    if (parent.tagName === 'SCRIPT' || 
                        parent.tagName === 'STYLE' || 
                        parent.tagName === 'NOSCRIPT' ||
                        parent.classList.contains('collected-word') ||
                        parent.classList.contains('word-card-container') ||
                        parent.closest('.word-card-container')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // 确保文本内容不为空且包含有意义的内容
                    if (node.textContent.trim().length > 0) {
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

    // 优化高亮可见内容的方法
    highlightVisibleContent(words) {
        // 将文档分成小块进行处理
        const chunks = this.getDocumentChunks();
        chunks.forEach(chunk => {
            this.observer.observe(chunk);
        });
    }

    // 将文档分块的方法
    getDocumentChunks() {
        const chunks = [];
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: (node) => {
                    if (node.childNodes.length > 0 && 
                        !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(node.tagName)) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            }
        );

        let node;
        while (node = walker.nextNode()) {
            if (node.textContent.trim().length > 0) {
                chunks.push(node);
            }
        }
        return chunks;
    }

    // 优化单个元素内的高亮处理
    highlightWordsInElement(element) {
        const collectedWords = this.getCollectedWords();
        if (!collectedWords.length) return;

        const textNodes = this.findTextNodes(element);
        textNodes.forEach(node => {
            let text = node.textContent;
            let hasMatch = false;
            
            collectedWords.forEach(word => {
                const regex = new RegExp(`\\b${word}\\b`, 'gi');
                if (regex.test(text)) {
                    hasMatch = true;
                    text = text.replace(regex, `<span class="collected-word">$&</span>`);
                }
            });

            if (hasMatch) {
                const span = document.createElement('span');
                span.innerHTML = text;
                node.parentNode.replaceChild(span, node);
            }
        });
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

    // 修改显示单词详细信息的方法
    showWordDetails(wordInfo, event) {
        if (!wordInfo) return;
        
        // 移除可能存在的其他弹窗
        const existingPopup = document.querySelector('.word-details-popup');
        if (existingPopup) {
            existingPopup.remove();
        }
        
        const popup = document.createElement('div');
        popup.className = 'word-details-popup';
        
        const content = `
            <div class="word-details-header">
                <span class="word">${wordInfo.word}</span>
                <span class="phonetic">${wordInfo.pronunciation?.American || wordInfo.pronunciation?.British || ''}</span>
                <button class="play-audio-btn">
                    <svg viewBox="0 0 24 24" width="16" height="16">
                        <path fill="currentColor" d="M8 5v14l11-7z"/>
                    </svg>
                </button>
            </div>
            <div class="definitions">
                ${wordInfo.definitions.map(def => `
                    <div class="definition-item">
                        <span class="pos">${def.pos}</span>
                        <span class="meaning">${def.meaning}</span>
                    </div>
                `).join('')}
            </div>
            <div class="word-details-footer">
                <button class="uncollect-btn">取消收藏</button>
                ${!wordInfo.mastered ? `
                    <button class="master-btn">
                        <svg viewBox="0 0 24 24" width="16" height="16">
                            <path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
                        </svg>
                        标记为已掌握
                    </button>
                ` : ''}
            </div>
        `;
        
        popup.innerHTML = content;
        
        // 定位弹窗
        const rect = event.target.getBoundingClientRect();
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 5}px`;
        
        document.body.appendChild(popup);
        
        // 使用 requestAnimationFrame 确保过渡效果正常工作
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                popup.classList.add('visible');
            });
        });
        
        // 添加音频播放功能
        popup.querySelector('.play-audio-btn').addEventListener('click', () => {
            this.playWordAudio(wordInfo.word);
        });
        
        // 添加取消收藏功能
        const uncollectBtn = popup.querySelector('.uncollect-btn');
        if (uncollectBtn) {
            uncollectBtn.addEventListener('click', async () => {
                await this.uncollectWord(wordInfo.word);
                popup.remove();
            });
        }
        
        // 添加掌握按钮功能
        const masterBtn = popup.querySelector('.master-btn');
        if (masterBtn) {
            masterBtn.addEventListener('click', async () => {
                await this.markWordAsMastered(wordInfo.word);
                popup.remove();
            });
        }
        
        // 添加点击外部关闭弹窗
        const closePopup = (e) => {
            if (!popup.contains(e.target) && e.target !== event.target) {
                popup.classList.remove('visible');
                // 等待过渡效果完成后移除元素
                setTimeout(() => {
                    popup.remove();
                }, 200);
                document.removeEventListener('click', closePopup);
            }
        };
        
        // 延迟添加点击监听，避免立即触发关闭
        setTimeout(() => {
            document.addEventListener('click', closePopup);
        }, 0);
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

    // 修改创建高亮span的部分
    createHighlightSpan(match) {
        const span = document.createElement('span');
        span.className = 'collected-word';
        span.textContent = match.text;
        span.dataset.word = match.word.toLowerCase();
        span.dataset.pronunciation = JSON.stringify(match.wordInfo.pronunciation);
        span.dataset.definitions = JSON.stringify(match.wordInfo.definitions);
        
        // 使用绑定的方法处理点击事件
        span.addEventListener('click', (e) => this.boundShowWordDetails(match.wordInfo, e));
        
        return span;
    }

    // 添加取消收藏方法
    async uncollectWord(word) {
        try {
            await VocabularyStorage.removeWord(word);
            
            // 移除页面中该单词的所有高亮
            document.querySelectorAll(`.collected-word[data-word="${word.toLowerCase()}"]`)
                .forEach(element => {
                    const textNode = document.createTextNode(element.textContent);
                    element.parentNode.replaceChild(textNode, element);
                });
        } catch (error) {
            console.error('Failed to uncollect word:', error);
        }
    }

    // 优化高亮方法，避免重复初始化
    async highlightCollectedWords(element, forceUpdate = false) {
        if (forceUpdate || !this.collectedWords) {
            await this.initialize();
        }
        // 使用已缓存的词汇列表进行高亮
        this.highlightVisibleContent(Array.from(this.collectedWords));
    }

    // 更新单个单词的高亮状态
    async updateWordHighlight(word, isCollected) {
        if (!this.collectedWords) {
            await this.initialize();
        }

        if (isCollected) {
            this.collectedWords.add(word);
        } else {
            this.collectedWords.delete(word);
        }

        // 只更新这个单词的高亮状态
        document.querySelectorAll(`[data-word="${word.toLowerCase()}"]`)
            .forEach(element => {
                if (isCollected) {
                    element.classList.add('collected-word');
                } else {
                    const text = document.createTextNode(element.textContent);
                    element.parentNode.replaceChild(text, element);
                }
            });
    }
}
