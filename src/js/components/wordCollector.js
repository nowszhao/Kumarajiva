import config from '../config/config';
import VocabularyStorage from './vocabularyStorage';

class WordCollector {
    constructor() {
        this.cardContainer = null;
        this.isCardVisible = false;
        this.currentWordInfo = null;  // 添加当前单词信息存储
        this.cardPosition = { x: 0, y: 0 };  // 添加卡片位置存储
    }

    async initialize() {
        this.createCardContainer();
        this.setupEventListeners();
        
        // 初始化时高亮所有已收藏的单词
        await this.highlightCollectedWords();
        
        // 监听 DOM 变化，处理动态加载的内容
        this.setupMutationObserver();
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
                    <button class="collect-btn">收藏单词</button>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        this.cardContainer = container;
    }

    async setupEventListeners() {
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

            // 检查是否为英文单词或短语
            if (/^[a-zA-Z\s-]+$/.test(text)) {
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

        // 点击其他区域关闭卡片
        document.addEventListener('mousedown', (e) => {
            if (!this.cardContainer.contains(e.target)) {
                this.hideCard();
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
            wordElem.dataset.word = wordInfo.word; // 存储单词用于音频播放
            
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
        
        const textNodes = this.findTextNodes(container);
        
        textNodes.forEach(node => {
            let text = node.textContent;
            let hasMatch = false;
            let fragment = document.createDocumentFragment();
            let lastIndex = 0;
            
            // 只高亮未掌握的单词
            Object.values(collectedWords).filter(wordInfo => !wordInfo.mastered).forEach(wordInfo => {
                const regex = new RegExp(`\\b${wordInfo.word}\\b`, 'gi');
                let match;
                
                while ((match = regex.exec(text)) !== null) {
                    hasMatch = true;
                    // 添加匹配前的文本
                    if (match.index > lastIndex) {
                        fragment.appendChild(
                            document.createTextNode(text.slice(lastIndex, match.index))
                        );
                    }
                    
                    // 创建高亮span
                    const span = document.createElement('span');
                    span.className = 'collected-word';
                    span.textContent = match[0];
                    span.dataset.word = wordInfo.word.toLowerCase();
                    span.dataset.pronunciation = JSON.stringify(wordInfo.pronunciation);
                    span.dataset.definitions = JSON.stringify(wordInfo.definitions);
                    
                    // 添加点击事件显示详细信息
                    span.addEventListener('click', (e) => {
                        this.showWordDetails(wordInfo, e);
                    });
                    
                    fragment.appendChild(span);
                    lastIndex = regex.lastIndex;
                }
            });
            
            if (hasMatch) {
                // 添加剩余文本
                if (lastIndex < text.length) {
                    fragment.appendChild(
                        document.createTextNode(text.slice(lastIndex))
                    );
                }
                node.parentNode.replaceChild(fragment, node);
            }
        });
    }

    findTextNodes(node) {
        const textNodes = [];
        const walk = document.createTreeWalker(
            node,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // 排除脚本和样式标签中的文本
                    if (node.parentNode.tagName === 'SCRIPT' || 
                        node.parentNode.tagName === 'STYLE' ||
                        node.parentNode.classList.contains('collected-word')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
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

    // 添加卡片事件监听器设置方法
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
        
        // 添加音频播放功能
        popup.querySelector('.play-audio-btn').addEventListener('click', () => {
            this.playWordAudio(wordInfo.word);
        });
        
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
                popup.remove();
                document.removeEventListener('click', closePopup);
            }
        };
        
        document.addEventListener('click', closePopup);
        document.body.appendChild(popup);
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
}

export default WordCollector; 