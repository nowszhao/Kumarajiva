// 防止全局变量污染

import { TranslatorFactory } from './translators';
import config from './config/config';
import WordCollector from './components/wordCollector';
import VocabularyStorage from './components/vocabularyStorage';
import { extractJsonFromString } from './utils';

/**
 * 工具函数类
 */
class Utils {
    static throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }

    static containsEnglish(text) {
        return /(?:^|[^a-zA-Z])[a-zA-Z]{3,}(?:[^a-zA-Z]|$)/.test(text);
    }

    static findTextContainer(element) {
        // 忽略标签
        const ignoredTags = new Set(['BODY', 'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'IMG', 'SVG', 'VIDEO', 'AUDIO']);
        if (ignoredTags.has(element.tagName)) {
            return null;
        }
        // 如果只有一个文本子节点
        if (
            element.childNodes.length === 1 &&
            element.childNodes[0].nodeType === Node.TEXT_NODE &&
            element.textContent.trim().length > 0
        ) {
            return element;
        }
        // 查找常规文本容器
        const validSelectors = [
            'p',
            'article',
            'h1, h2, h3, h4, h5',
            '.text',
            '[role="article"]',
            'li',
            'td',
            'div:not(:empty)'
        ].join(',');

        let container = element.closest(validSelectors);
        if (!container && element.parentElement) {
            container = element.parentElement.closest(validSelectors);
        }
        if (
            container &&
            container.textContent.trim().length > 0 &&
            !container.querySelector('input, button, select, textarea')
        ) {
            return container;
        }
        return null;
    }

    static isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0
        );
    }
}

/**
 * UI 管理类，负责创建加载指示器、翻译结果、工具栏、提示信息等相关 DOM 元素
 */
class UIManager {
    constructor() {
        this.selectionToolbar = null;
        this.hoverToolbar = null;
    }

    createLoadingIndicator(text="正在翻译中...") {
        const indicator = document.createElement('div');
        indicator.className = 'translation-loading';
        indicator.innerHTML = `<span>${text}</span>`;
        return indicator;
    }

    createTranslationElement(translationResult) {
        try {
            const result =
                typeof translationResult === 'string'
                    ? JSON.parse(translationResult)
                    : translationResult;
            console.log('Creating translation element with result:', result);
            const container = document.createElement('div');
            container.className = 'inline-translation-result';

            // 主翻译区域
            const mainTranslation = document.createElement('div');
            mainTranslation.className = 'translation-main';
            mainTranslation.textContent = result.translation;
            container.appendChild(mainTranslation);

            // 仅当存在难词数据时显示"显示难词解析"按钮及区域
            if (result.difficultVocabulary && result.difficultVocabulary.length > 0) {
                const expandBtn = document.createElement('div');
                expandBtn.className = 'translation-expand-btn';
                expandBtn.textContent = '显示难词解析';
                container.appendChild(expandBtn);

                const difficultWords = document.createElement('div');
                difficultWords.className = 'difficult-words';
                result.difficultVocabulary.forEach((word) => {
                    const wordItem = this.createWordItem(word);
                    difficultWords.appendChild(wordItem);
                });
                container.appendChild(difficultWords);

                expandBtn.addEventListener('click', () => {
                    const isExpanded = difficultWords.classList.contains('visible');
                    difficultWords.classList.toggle('visible');
                    expandBtn.textContent = isExpanded ? '显示难词解析' : '收起难词解析';
                });
            }

            return container;
        } catch (error) {
            console.error('Error creating translation element:', error);
            const errorContainer = document.createElement('div');
            errorContainer.className = 'inline-translation-result';
            errorContainer.textContent = translationResult;
            return errorContainer;
        }
    }

    createWordItem(word) {
        const wordItem = document.createElement('div');
        wordItem.className = 'word-item';

        const wordHeader = document.createElement('div');
        wordHeader.className = 'word-header';

        const vocabulary = document.createElement('span');
        vocabulary.className = 'word-vocabulary';
        vocabulary.textContent = word.vocabulary;
        wordHeader.appendChild(vocabulary);

        const collectBtn = document.createElement('span');
        collectBtn.className = 'word-collect-btn';
        collectBtn.textContent = '收藏';
        collectBtn.addEventListener('click', async () => {
            const isCollected = collectBtn.classList.contains('collected');
            if (!isCollected) {
                const ret = {
                    definitions: [
                        {
                            meaning: word.chinese_meaning,
                            pos: word.part_of_speech,
                        },
                    ],
                    mastered: false,
                    pronunciation: {
                        American: word.phonetic,
                        British: '',
                    },
                    timestamp: new Date().getTime(),
                    word: word.vocabulary,
                    memory_method: word.chinese_english_sentence,
                };

                await VocabularyStorage.addWord(word.vocabulary, ret);
                collectBtn.classList.add('collected');
                collectBtn.textContent = '已收藏';
                
                // 收藏后立即重新高亮页面中的收藏单词
                const wordCollector = new WordCollector();
                await wordCollector.initialize();
                await wordCollector.highlightCollectedWords(document.body);
            } else {
                await VocabularyStorage.removeWord(word.vocabulary);
                collectBtn.classList.remove('collected');
                collectBtn.textContent = '收藏';
                document.querySelectorAll(`.collected-word[data-word="${word.vocabulary.toLowerCase()}"]`)
                    .forEach((el) => {
                        const textNode = document.createTextNode(el.textContent);
                        el.parentNode.replaceChild(textNode, el);
                    });
            }
        });
        wordHeader.appendChild(collectBtn);

        const wordDetails = document.createElement('div');
        wordDetails.className = 'word-details';

        const type = document.createElement('span');
        type.className = 'word-type';
        type.textContent = `${word.type} ${word.part_of_speech}`;
        wordDetails.appendChild(type);

        const phonetic = document.createElement('span');
        phonetic.className = 'word-phonetic';
        phonetic.textContent = word.phonetic;
        wordDetails.appendChild(phonetic);

        const meaning = document.createElement('div');
        meaning.className = 'word-meaning';
        meaning.textContent = word.chinese_meaning;
        wordDetails.appendChild(meaning);

        wordItem.appendChild(wordHeader);
        wordItem.appendChild(wordDetails);

        return wordItem;
    }

    createTranslationToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'translation-toolbar';

        // 进度条
        const progress = document.createElement('div');
        progress.className = 'translation-progress';
        progress.innerHTML = `
            <div class="progress-spinner"></div>
            <span class="progress-text">分析进度: 0/0</span>
        `;
        document.body.appendChild(progress);

        // 翻译按钮
        const translateButton = document.createElement('button');
        translateButton.className = 'toolbar-button translate-button';
        translateButton.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
            </svg>
        `;

        // 原文切换按钮
        const toggleOriginalButton = document.createElement('button');
        toggleOriginalButton.className = 'toolbar-button toggle-original-button';
        toggleOriginalButton.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
        `;

        // 【修改处】添加 toggleOriginalButton 的点击事件监听
        toggleOriginalButton.addEventListener('click', () => {
            toggleOriginalButton.classList.toggle('active');
            const hideOriginal = toggleOriginalButton.classList.contains('active');
            console.log('Toggle original text, isHidden:', hideOriginal);
            document.querySelectorAll('.inline-translation-result').forEach((translationResult) => {
                const originalElement = translationResult.previousElementSibling;
                if (originalElement) {
                    originalElement.style.display = hideOriginal ? 'none' : '';
                }
            });
        });

        toolbar.appendChild(translateButton);
        toolbar.appendChild(toggleOriginalButton);
        document.body.appendChild(toolbar);
        return { toolbar, progress };
    }

    createSelectionToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'selection-toolbar';
        
        // 复制按钮
        const copyButton = document.createElement('button');
        copyButton.className = 'selection-toolbar-button';
        copyButton.title = '复制';
        copyButton.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
        `;
        
        // 深度解析按钮
        const analyzeButton = document.createElement('button');
        analyzeButton.className = 'selection-toolbar-button';
        analyzeButton.title = '深度解析';
        analyzeButton.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
            </svg>
        `;
        
        // 翻译按钮
        const translateButtonSel = document.createElement('button');
        translateButtonSel.className = 'selection-toolbar-button';
        translateButtonSel.title = '翻译';
        translateButtonSel.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04z"/>
            </svg>
        `;
        toolbar.appendChild(copyButton);
        toolbar.appendChild(analyzeButton);
        toolbar.appendChild(translateButtonSel);
        document.body.appendChild(toolbar);
        return toolbar;
    }

    createHoverToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'hover-toolbar';
        
         // 翻译按钮 (新增)
         const translateButtonHov = document.createElement('button');
         translateButtonHov.className = 'hover-toolbar-button';
         translateButtonHov.title = '翻译';
         translateButtonHov.innerHTML = `
             <svg viewBox="0 0 24 24">
                 <path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04z"/>
             </svg>
         `;

        
        // 深度解析按钮
        const analyzeButton = document.createElement('button');
        analyzeButton.className = 'hover-toolbar-button';
        analyzeButton.title = '深度解析';
        analyzeButton.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
            </svg>
        `;

        // 复制按钮
        const copyButton = document.createElement('button');
        copyButton.className = 'hover-toolbar-button';
        copyButton.title = '复制';
        copyButton.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
        `;

        toolbar.appendChild(translateButtonHov);
        toolbar.appendChild(analyzeButton);
        toolbar.appendChild(copyButton);
        document.body.appendChild(toolbar);
        return toolbar;
    }

    async handleCopy(text) {
        try {
            // 将文本中的连续空白字符替换为单个空格，并去除首尾空白
            const normalizedText = text.replace(/\s+/g, ' ').trim();
            await navigator.clipboard.writeText(normalizedText);
            this.showToast('复制成功');
        } catch (err) {
            console.error('复制失败:', err);
            this.showToast('复制失败');
        }
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 14px;
            z-index: 1000000;
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 2000);
    }

    showTranslationError(container, error) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'translation-error';
        errorDiv.textContent = '翻译失败，请稍后重试';
        container.appendChild(errorDiv);
        setTimeout(() => {
            errorDiv.remove();
        }, 3000);
    }
}

/**
 * 翻译服务封装类：负责调用 chrome.storage、TranslatorFactory 及提取返回的 JSON
 */
class TranslationServiceWrapper {
    async translate(prompt) {
        try {
            const { translationService, serviceTokens } = await chrome.storage.sync.get([
                'translationService',
                'serviceTokens'
            ]);
            const currentService = translationService || config.translation.defaultService;
            const token = serviceTokens?.[currentService] || config[currentService].apiToken;
            const translator = TranslatorFactory.createTranslator(currentService, {
                    ...config[currentService],
                apiToken: token,
            });
            try {
                const result = await translator.translate(prompt);
                return extractJsonFromString(result);
            } finally {
                await translator.cleanup();
            }
        } catch (error) {
            console.error('Translation error:', error);
            throw error;
        }
    }
}

/**
 * 单个翻译任务类：处理某个文本容器的翻译工作
 */
class TranslationTask {
    constructor(element, uiManager) {
        this.element = element;
        this.uiManager = uiManager;
    }

    async execute(translationServiceWrapper, translationCache) {
        const text = this.element.textContent.trim();
        if (!text || !Utils.containsEnglish(text)) {
            console.log('Text is not English:', text);
            return;
        }

        // 为原始文本添加标识类，并添加加载指示器
        this.element.classList.add('original-content');
        const loadingIndicator = this.uiManager.createLoadingIndicator();
        this.element.insertAdjacentElement('afterend', loadingIndicator);

        let translation;
        if (translationCache.has(text)) {
            translation = translationCache.get(text);
        } else {
            const translationPrompt = `
                你现在是一位专业的翻译专家，现在正帮我翻译一个英文句子，要求如下：
                1、翻译和解析我提供的英语内容，同时帮我从中筛选出5个最难理解的短语/词块、俚语、缩写。
                2、输出请遵循以下要求：
                - 中文翻译：根据字幕语境给出最贴切的含义
                - 词汇：识别出句子中所有词汇，包括短语/词块、俚语、缩写
                - 类型：包括短语/词块、俚语、缩写（Phrases, Slang, Abbreviations）
                - 词性：使用n., v., adj., adv., phrase等标准缩写
                - 音标：提供美式音标
                - 中英混合句子：使用词汇造一个句子，除了该词汇外，其他均为中文，需要保证语法正确，通过在完整中文语境中嵌入单一核心英语术语，帮助学习者直观理解专业概念的实际用法。
                3、输出示例如下,严格按照json格式输出：
                {
                "original": "${text}",
                "translation": "xxxx",
                "difficultVocabulary": [
                        {
                            "vocabulary": "benchmark",
                            "type": "Words",
                            "part_of_speech": "n.",
                            "phonetic": "/ˈbentʃmɑːrk/",
                            "chinese_meaning": "基准；参照标准",
                        "chinese_english_sentence": "DeepSeek最近发布的推理模型在常见benchmark中击败了许多顶级人工智能公司。"
                        },
                        ...
                    ]
                }    
                处理内容如下：
                ${text}`;
            translation = await translationServiceWrapper.translate(translationPrompt);
            translationCache.set(text, translation);
        }

        console.log('Translation result:', translation);
        loadingIndicator.remove();
        TranslationTask.removeExistingTranslation(this.element);
        const translationElement = this.uiManager.createTranslationElement(translation);
        this.element.insertAdjacentElement('afterend', translationElement);
    }

    static removeExistingTranslation(element) {
        const nextElement = element.nextElementSibling;
        if (nextElement && nextElement.classList.contains('inline-translation-result')) {
            nextElement.remove();
        }
    }
}

/**
 * 翻译队列管理类：维护一个待翻译的元素队列，按顺序处理
 */
class TranslationQueueManager {
    constructor(uiManager) {
        this.queue = [];
        this.isProcessingQueue = false;
        this.isTranslating = false;
        this.uiManager = uiManager;
        this.processedCount = 0;
        this.totalCount = 0;
        this.translationCache = new Map();
        this.translationServiceWrapper = new TranslationServiceWrapper();
    }

    addToQueue(containers) {
        const newContainers = containers.filter(
            (container) =>
                !this.queue.includes(container) &&
                !container.classList.contains('translated') &&
                !container.classList.contains('translating')
        );

        if (newContainers.length > 0) {
            this.queue = this.queue.concat(newContainers);
            this.totalCount += newContainers.length;
            // 【新增】确保当有新任务加入时，进度条恢复可见
            const progress = document.querySelector('.translation-progress');
            if (progress) {
                progress.classList.add('visible');
            }
            if (!this.isProcessingQueue) {
                this.processQueue();
            }
        }
    }

    async processQueue() {
        if (this.queue.length === 0) {
            this.isProcessingQueue = false;
            const progress = document.querySelector('.translation-progress');
            if (progress) {
                progress.classList.remove('visible');
            }
            return;
        }
        this.isProcessingQueue = true;
        const progress = document.querySelector('.translation-progress');
        const progressText = progress ? progress.querySelector('.progress-text') : null;

        while (this.queue.length > 0 && this.isTranslating) {
            const container = this.queue[0];
            if (document.body.contains(container) && !container.classList.contains('translated')) {
                container.classList.add('translating');
                this.processedCount++;
                if (progressText) {
                    progressText.textContent = `分析进度: ${this.processedCount}/${this.totalCount}`;
                }

                const task = new TranslationTask(container, this.uiManager);
                try {
                    await task.execute(this.translationServiceWrapper, this.translationCache);
                    container.classList.add('translated');
                } catch (e) {
                    console.error('Translation failed:', e);
                    this.uiManager.showTranslationError(container, e);
                } finally {
                    container.classList.remove('translating');
                }
            }
            this.queue.shift();

            if (this.queue.length === 0 && this.isTranslating) {
                const newContainers = InlineTranslator.findVisibleTextContainers();
                if (newContainers.length > 0) {
                    this.addToQueue(newContainers);
                }
            }
            await new Promise((resolve) => setTimeout(resolve, 200));
        }
        this.isProcessingQueue = false;
        if (this.queue.length === 0 && progress) {
            progress.classList.remove('visible');
        }
    }
}

/**
 * 文本深度解析类：调用翻译服务来生成针对文本的详细解析
 */
class Analyzer {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.translationServiceWrapper = new TranslationServiceWrapper();
    }

    async analyze(element) {
        if (!element) return;
        const loadingIndicator = this.uiManager.createLoadingIndicator("正在深度解析中...");
        element.insertAdjacentElement('afterend', loadingIndicator);

        const analyzePrompt = `
            你现在是专业的英语老师，请对这个句子进行深度解析以便非英语母语的学生能理解句子的所有的难点，按照HTML格式输出，保证阅读简洁：
            ${element.textContent}`;

        try {
            const result = await this.translationServiceWrapper.translate(analyzePrompt);
            loadingIndicator.remove();
            this.removeExistingAnalysis(element);
            const analysisElement = this.createAnalysisElement(result);
            element.insertAdjacentElement('afterend', analysisElement);
        } catch (error) {
            loadingIndicator.remove();
            console.error('Analysis failed:', error);
            this.uiManager.showToast('分析失败，请重试');
        }
    }

    removeExistingAnalysis(element) {
        const nextElement = element.nextElementSibling;
        if (nextElement && nextElement.classList.contains('analysis-result')) {
            nextElement.remove();
        }
    }

    createAnalysisElement(analysisResult) {
        const container = document.createElement('div');
        container.className = 'inline-translation-result analysis-result';
        const summary = document.createElement('div');
        summary.className = 'translation-main';
        summary.innerHTML = `${analysisResult}`;
        container.appendChild(summary);
        return container;
    }
}

/**
 * 内联翻译主控类：负责注册鼠标、键盘、滚动、选择等事件，并调用相应的翻译与解析逻辑
 */
class InlineTranslator {
    constructor() {
        this.hoveredElement = null;
        this.currentHoverElement = null;
        this.isTranslating = false;
        this.uiManager = new UIManager();
        this.translationQueueManager = null;
        this.analyzer = new Analyzer(this.uiManager);
        this.currentTriggerKey = null;
    }

    static findVisibleTextContainers() {
        const bufferSize = 300; // 上下预加载300px
        const viewportHeight = window.innerHeight;
        const scrollTop = window.scrollY;
        const viewportTop = scrollTop - bufferSize;
        const viewportBottom = scrollTop + viewportHeight + bufferSize;
        let mainContent = null;
        const mainContentSelectors = [
            'article',
            '[role="main"]',
            'main',
            '.post-content',
            '.article-content',
            '.entry-content',
            '#content-main',
            '.main-content',
            '.post-body',
            '.article-body'
        ];
        for (const selector of mainContentSelectors) {
            const element = document.querySelector(selector);
            if (element && Utils.containsEnglish(element.textContent)) {
                mainContent = element;
                break;
            }
        }
        if (!mainContent) {
            mainContent = document.body;
        }
        const containers = [];
        const paragraphs = mainContent.querySelectorAll(
            'p, h1, h2, h3, h4, h5, h6, article, section, .text-content'
        );
        paragraphs.forEach((p) => {
            const rect = p.getBoundingClientRect();
            const elementTop = scrollTop + rect.top;
            const elementBottom = scrollTop + rect.bottom;
            const isInViewport = elementBottom > viewportTop && elementTop < viewportBottom;
            const isValidForTranslation =
                !p.classList.contains('translated') &&
                !p.classList.contains('translating') &&
                !p.classList.contains('inline-translation-result') &&
                Utils.containsEnglish(p.textContent) &&
                p.textContent.trim().length > 10 &&
                Utils.isElementVisible(p);
            if (isInViewport && isValidForTranslation) {
                containers.push(p);
            }
        });
        return containers;
    }

    initializeEvents(configData) {
        const currentTriggerKey = configData.triggerKey || config.translation.interaction.triggerKey;
        const isEnabled = configData.enableTriggerKey ?? config.translation.interaction.enableTriggerKey;
        this.currentTriggerKey = currentTriggerKey;
        if (!isEnabled) return;

        // 鼠标移动监听，高亮可翻译的文本
        document.addEventListener(
            'mousemove',
            Utils.throttle((e) => {
                const element = Utils.findTextContainer(e.target);
                if (element && Utils.containsEnglish(element.textContent)) {
                    if (this.hoveredElement !== element) {
                        if (this.hoveredElement) {
                            this.hoveredElement.classList.remove('hoverable-text');
                        }
                        this.hoveredElement = element;
                        element.classList.add('hoverable-text');
                    }
                }
            }, 100)
        );

        // 鼠标移出时移除高亮
        document.addEventListener('mouseout', (e) => {
            if (
                this.hoveredElement &&
                (!e.relatedTarget || !this.hoveredElement.contains(e.relatedTarget))
            ) {
                this.hoveredElement.classList.remove('hoverable-text');
                if (!this.isTranslating) {
                    this.hoveredElement = null;
                }
            }
        });

        // 键盘事件触发翻译
        document.addEventListener('keydown', (e) => {
            if (e.key === this.currentTriggerKey && !e.ctrlKey) {
                if (this.hoveredElement) {
                    this.handleTranslationOnElement(this.hoveredElement);
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === this.currentTriggerKey) {
                this.hoveredElement = null;
            }
        });

        // 滚动时检查新增的可翻译内容
        window.addEventListener(
            'scroll',
            Utils.throttle(() => {
                if (this.isTranslating && this.translationQueueManager && !this.translationQueueManager.isProcessingQueue) {
                    const containers = InlineTranslator.findVisibleTextContainers();
                    this.translationQueueManager.addToQueue(containers);
                }
            }, 500)
        );

        // 选择文本时显示选择工具栏
        document.addEventListener('selectionchange', () => {
            this.handleSelection();
        });

        // 悬停工具栏监听
        document.addEventListener(
            'mousemove',
            Utils.throttle((e) => {
                const element = Utils.findTextContainer(e.target);
                if (element && Utils.containsEnglish(element.textContent)) {
                    if (this.currentHoverElement !== element) {
                        if (this.currentHoverElement && this.uiManager.hoverToolbar) {
                            this.uiManager.hoverToolbar.remove();
                            this.uiManager.hoverToolbar = null;
                        }
                        this.currentHoverElement = element;
                        if (!this.uiManager.hoverToolbar) {
                            this.uiManager.hoverToolbar = this.uiManager.createHoverToolbar();
                        }
                        element.style.position = 'relative';
                        if (this.uiManager.hoverToolbar.parentElement !== element) {
                            element.appendChild(this.uiManager.hoverToolbar);
                        }
                        this.uiManager.hoverToolbar.classList.add('visible');
                        // 为悬停工具栏按钮绑定事件
                        const copyButton = this.uiManager.hoverToolbar.querySelector(
                            '.hover-toolbar-button[title="复制"]'
                        );
                        const analyzeButton = this.uiManager.hoverToolbar.querySelector(
                            '.hover-toolbar-button[title="深度解析"]'
                        );
                        const translateButtonHov = this.uiManager.hoverToolbar.querySelector(
                            '.hover-toolbar-button[title="翻译"]'
                        );
                        if (copyButton) {
                            copyButton.onclick = () => this.uiManager.handleCopy(element.textContent);
                        }
                        if (analyzeButton) {
                            analyzeButton.onclick = () => this.analyzer.analyze(element);
                        }
                        if (translateButtonHov) {
                            translateButtonHov.onclick = () => this.handleTranslationOnElement(element);
                        }
                    }
                }
            }, 100)
        );

        // 悬停工具栏隐藏
        document.addEventListener('mouseout', (e) => {
            if (
                !e.relatedTarget ||
                (!this.currentHoverElement?.contains(e.relatedTarget) &&
                    !this.uiManager.hoverToolbar?.contains(e.relatedTarget))
            ) {
                if (this.uiManager.hoverToolbar) {
                    this.uiManager.hoverToolbar.classList.remove('visible');
                    setTimeout(() => {
                        if (this.uiManager.hoverToolbar && !this.uiManager.hoverToolbar.classList.contains('visible')) {
                            this.uiManager.hoverToolbar.remove();
                            this.uiManager.hoverToolbar = null;
                        }
                    }, 200);
                }
                this.currentHoverElement = null;
            }
        });

        // 快捷键：Alt + H 切换原文显示
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'h') {
                const toggleButton = document.querySelector('.toggle-original-button');
                if (toggleButton) {
                    toggleButton.click();
                }
            }
        });
    }

    handleTranslationOnElement(element) {
        const task = new TranslationTask(element, this.uiManager);
        const translationServiceWrapper = new TranslationServiceWrapper();
        // 此处单独使用一个 cache（已在队列中统一管理），这里仅用于即时翻译
        const translationCache = new Map();
        task.execute(translationServiceWrapper, translationCache).catch((error) => {
            console.error('Translation error:', error);
        });
    }

    handleSelection() {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed) {
            if (this.uiManager.selectionToolbar) {
                this.uiManager.selectionToolbar.classList.remove('visible');
            }
            return;
        }
        if (!this.uiManager.selectionToolbar) {
            this.uiManager.selectionToolbar = this.uiManager.createSelectionToolbar();
            // 为选择工具栏按钮绑定事件
            const copyButton = this.uiManager.selectionToolbar.querySelector(
                '.selection-toolbar-button[title="复制"]'
            );
            const analyzeButton = this.uiManager.selectionToolbar.querySelector(
                '.selection-toolbar-button[title="深度解析"]'
            );
            const translateButtonSel = this.uiManager.selectionToolbar.querySelector(
                '.selection-toolbar-button[title="翻译"]'
            );
            if (copyButton) {
                copyButton.onclick = () => this.uiManager.handleCopy(window.getSelection().toString());
            }
            if (analyzeButton) {
                analyzeButton.onclick = () => {
                    const range = selection.getRangeAt(0);
                    const dummyDiv = document.createElement('div');
                    dummyDiv.textContent = selection.toString();
                    this.analyzer.analyze(dummyDiv);
                };
            }
            if (translateButtonSel) {
                translateButtonSel.onclick = () => {
                    if (selection && !selection.isCollapsed) {
                        const range = selection.getRangeAt(0);
                        const dummyDiv = document.createElement('div');
                        dummyDiv.textContent = selection.toString();
                        // 可选：将 dummyDiv 添加到 body 便于后续定位显示翻译结果
                        document.body.appendChild(dummyDiv);
                        this.handleTranslationOnElement(dummyDiv);
                    }
                };
            }
        }
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const toolbarLeft = rect.left + window.scrollX;
        const toolbarTop = rect.top + window.scrollY;
        const maxLeft = window.innerWidth - this.uiManager.selectionToolbar.offsetWidth;
        const left = Math.min(Math.max(0, toolbarLeft), maxLeft);
        this.uiManager.selectionToolbar.style.left = `${left}px`;
        this.uiManager.selectionToolbar.style.top = `${toolbarTop}px`;
        this.uiManager.selectionToolbar.classList.add('visible');
    }

    async initialize() {
        // 初始化翻译队列管理器
        this.translationQueueManager = new TranslationQueueManager(this.uiManager);
        // 初始化单词收藏功能
        const wordCollector = new WordCollector();
        await wordCollector.initialize();
        await wordCollector.highlightCollectedWords(document.body);

        // 创建翻译工具栏（包括翻译按钮及进度条）
        this.uiManager.createTranslationToolbar();

        // 从 chrome.storage 读取交互设置
        chrome.storage.sync.get(
            ['triggerKey', 'enableTriggerKey', 'translationService', 'serviceTokens'],
            (configData) => {
                this.initializeEvents(configData);
            }
        );

        // 翻译工具栏按钮：点击切换翻译开关
        const translateButton = document.querySelector('.translate-button');
        if (translateButton) {
            translateButton.addEventListener('click', () => {
                if (this.isTranslating) {
                    this.stopTranslation();
                    translateButton.classList.remove('active');
                } else {
                    this.startTranslation();
                    translateButton.classList.add('active');
                }
            });
        }
    }

    startTranslation() {
        const progress = document.querySelector('.translation-progress');
        if (progress) {
            progress.classList.add('visible');
        }
        this.isTranslating = true;
        this.translationQueueManager.isTranslating = true;
        this.translationQueueManager.queue = [];
        this.translationQueueManager.processedCount = 0;
        this.translationQueueManager.totalCount = 0;
        // 如果当前为隐藏原文状态，则隐藏
        const isOriginalTextHidden = document.querySelector('.toggle-original-button')?.classList.contains('active');
        if (isOriginalTextHidden) {
            document.querySelectorAll('.original-content').forEach((el) => {
                el.style.display = 'none';
            });
        }
        const containers = InlineTranslator.findVisibleTextContainers();
        this.translationQueueManager.addToQueue(containers);
    }

    stopTranslation() {
        const progress = document.querySelector('.translation-progress');
        if (progress) {
            progress.classList.remove('visible');
        }
        this.isTranslating = false;
        this.translationQueueManager.isTranslating = false;
        document.querySelectorAll('.translating').forEach((el) => {
            el.classList.remove('translating');
        });
    }
}

// 启动内联翻译应用
(function () {
    const inlineTranslator = new InlineTranslator();
    inlineTranslator.initialize();
})(); 