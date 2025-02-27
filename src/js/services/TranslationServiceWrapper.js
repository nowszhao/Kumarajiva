import config from '../config/config';
import { TranslatorFactory } from '../translators';
import { extractJsonFromString } from '../utils';   
import { Utils } from '../utils/Utils';
import { UIManager } from '../ui/UIManager';
import { WordCollector } from '../components/wordCollector.js';
import { VocabularyStorage } from '../components/vocabularyStorage';


/**
 * 翻译服务封装类：负责调用 chrome.storage、TranslatorFactory 及提取返回的 JSON
 */
export class TranslationServiceWrapper {
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

    createWordItem(word) {
        // ... 前面的代码保持不变 ...

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
                
                // 添加高亮更新
                const wordCollector = new WordCollector();
                await wordCollector.initialize();
                await wordCollector.highlightCollectedWords(document.body);
            } else {
                await VocabularyStorage.removeWord(word.vocabulary);
                collectBtn.classList.remove('collected');
                collectBtn.textContent = '收藏';
                
                // 移除页面中该单词的所有高亮
                document.querySelectorAll(`.collected-word[data-word="${word.vocabulary.toLowerCase()}"]`)
                    .forEach((el) => {
                        const textNode = document.createTextNode(el.textContent);
                        el.parentNode.replaceChild(textNode, el);
                    });
            }
        });

        // ... 后面的代码保持不变 ...
    }
}


/**
 * 单个翻译任务类：处理某个文本容器的翻译工作
 */
export class TranslationTask {
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
                1、您的任务是翻译和分析给定文本中的语言难点，这些难点可能包括对非母语学习者具有挑战性的词汇、短语、俚语、缩写、简写以及网络用语等。
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
                            "chinese_english_sentence": "DeepSeek最近发布的推理模型在常见benchmark中击败了许多顶级人工智能公司。（DeepSeek's newly launched reasoning model has surpassed leading AI companies on standard benchmarks.）"   //中文句子中必要包含待解析的英文词汇
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
export class TranslationQueueManager {
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
export class Analyzer {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.translationServiceWrapper = new TranslationServiceWrapper();
    }

    async analyze(element) {
        if (!element) return;
        const loadingIndicator = this.uiManager.createLoadingIndicator("正在深度解析中...");
        element.insertAdjacentElement('afterend', loadingIndicator);

        const analyzePrompt = `
            作为一位专业英语教师，您的任务是分析给定文本中的语言难点。这些难点可能包括对非母语学习者具有挑战性的词汇、短语、俚语、缩写、简写以及网络用语等。
            要求：
            1.识别并列出所有潜在的语言难点。
            2. 使用清晰的中文解释每个难点的含义或用法。
            3.将结果以简洁的HTML格式呈现，确保易于阅读和理解。
            4.预期输出（HTML格式）：
            <ul>
                <li><strong>难点词汇/短语</strong>: [具体内容] - [中文解释]</li>
                <li><strong>俚语/缩略语</strong>: [具体内容] - [中文解释]</li>
                <!-- 其他项目依此类推 -->
            </ul>
            5.注意事项：
            1）确保每个项目的解释准确且简明扼要。
            2）如果某个部分没有发现任何难点，请在相应位置注明"无"。

            内容如下：
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
export class InlineTranslator {
    constructor() {
        this.isInitialized = false;
        this.boundHandlers = {}; // 保存绑定的处理程序
        this.isTranslating = false;
        this.hoveredElement = null; // 当前鼠标悬停的元素
        this.translationQueueManager = null;
        this.uiManager = new UIManager();
        this.analyzer = new Analyzer(this.uiManager);
        this.currentTriggerKey = 'd';
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
        this.boundHandlers.mousemove = Utils.throttle((e) => {
            const element = Utils.findTextContainer(e.target);
            if (element && Utils.containsEnglish(element.textContent)) {
                if (this.hoveredElement !== element) {
                    // 先移除上一个元素的高亮
                    if (this.hoveredElement) {
                        this.hoveredElement.classList.remove('hoverable-text');
                    }
                    this.hoveredElement = element;
                    element.classList.add('hoverable-text');
                    
                    // 创建或更新悬停工具栏
                    if (!this.uiManager.hoverToolbar) {
                        this.uiManager.hoverToolbar = this.uiManager.createHoverToolbar();
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
                    const copyPromptButton = this.uiManager.hoverToolbar.querySelector(
                        '.hover-toolbar-button[title="复制解析提示词"]'
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
                    if (copyPromptButton) {
                        copyPromptButton.onclick = () => {
                            // 为复制提示词按钮添加点击事件
                            const translationPrompt = `
                            你现在是一位专业的翻译专家，现在正帮我翻译一个英文句子，要求如下：
                                1、您的任务是翻译和分析给定文本中的语言难点，这些难点可能包括对非母语学习者具有挑战性的词汇、短语、俚语、缩写、简写以及网络用语等。
                                2、输出请遵循以下要求：
                                - 中文翻译：根据字幕语境给出最贴切的含义
                                - 词汇：识别出句子中所有词汇，包括短语/词块、俚语、缩写
                                - 类型：包括短语/词块、俚语、缩写（Phrases, Slang, Abbreviations）
                                - 词性：使用n., v., adj., adv., phrase等标准缩写
                                - 音标：提供美式音标
                                - 中英混合句子：使用词汇造一个句子，除了该词汇外，其他均为中文，需要保证语法正确，通过在完整中文语境中嵌入单一核心英语术语，帮助学习者直观理解专业概念的实际用法。
                                3、输出示例如下,严格按照json格式输出：
                                {
                                "original": "xxxxx",
                                "translation": "xxxx",
                                "difficultVocabulary": [
                                        {
                                            "vocabulary": "benchmark",
                                            "type": "Words",
                                            "part_of_speech": "n.",
                                            "phonetic": "/ˈbentʃmɑːrk/",
                                            "chinese_meaning": "基准；参照标准",
                                            "chinese_english_sentence": "DeepSeek最近发布的推理模型在常见benchmark中击败了许多顶级人工智能公司。（DeepSeek's newly launched reasoning model has surpassed leading AI companies on standard benchmarks.）"   //中文句子中必要包含待解析的英文词汇
                                        },
                                        ...
                                    ]
                                }    
                                处理内容如下：
                                ${element.textContent || ''}`;

                                this.uiManager.handleCopy(translationPrompt, '复制解析提示词');
                            };
                    }
                }
                
                // 更新工具栏位置
                this.updateHoverToolbarPosition(e);
            } else {
                // 如果当前不在可翻译元素上，而且不在工具栏上，则移除高亮
                if (this.hoveredElement && 
                    !this.uiManager.hoverToolbar?.contains(e.target) && 
                    !this.uiManager.hoverToolbar?.classList.contains('hover-active')) {
                    this.hoveredElement.classList.remove('hoverable-text');
                    this.hoveredElement = null;
                }
            }
        }, 100);
        document.addEventListener('mousemove', this.boundHandlers.mousemove);

        // 鼠标移出时移除高亮
        this.boundHandlers.mouseout = (e) => {
            // 只有当鼠标不是移动到当前元素的子元素，且不是移动到工具栏上时，才移除高亮
            if (this.hoveredElement && 
                !this.hoveredElement.contains(e.relatedTarget) && 
                !this.uiManager.hoverToolbar?.contains(e.relatedTarget)) {
                
                this.hoveredElement.classList.remove('hoverable-text');
                
                if (this.uiManager.hoverToolbar && !this.uiManager.hoverToolbar.classList.contains('hover-active')) {
                    this.uiManager.hoverToolbar.classList.remove('visible');
                    setTimeout(() => {
                        if (this.uiManager.hoverToolbar && 
                            !this.uiManager.hoverToolbar.classList.contains('visible') && 
                            !this.uiManager.hoverToolbar.classList.contains('hover-active')) {
                            this.uiManager.hoverToolbar.remove();
                            this.uiManager.hoverToolbar = null;
                        }
                    }, 200);
                }
                
                this.hoveredElement = null;
            }
        };
        document.addEventListener('mouseout', this.boundHandlers.mouseout);

        // 键盘事件触发翻译
        this.boundHandlers.keydown = (e) => {
            if (e.key === this.currentTriggerKey && !e.ctrlKey) {
                if (this.hoveredElement) {
                    this.handleTranslationOnElement(this.hoveredElement);
                }
            }
        };
        document.addEventListener('keydown', this.boundHandlers.keydown);

        document.addEventListener('keyup', (e) => {
            if (e.key === this.currentTriggerKey) {
                this.hoveredElement = null;
            }
        });

        // 滚动时检查新增的可翻译内容
        this.boundHandlers.scroll = Utils.throttle(() => {
            if (this.isTranslating && this.translationQueueManager && !this.translationQueueManager.isProcessingQueue) {
                const containers = InlineTranslator.findVisibleTextContainers();
                this.translationQueueManager.addToQueue(containers);
            }
        }, 500);
        window.addEventListener('scroll', this.boundHandlers.scroll);

        // 选择文本时显示选择工具栏
        this.boundHandlers.selectionchange = () => {
            this.handleSelection();
        };
        document.addEventListener('selectionchange', this.boundHandlers.selectionchange);

        // 快捷键：Alt + H 切换原文显示
        this.boundHandlers.keydown = (e) => {
            if (e.altKey && e.key === 'h') {
                const toggleButton = document.querySelector('.toggle-original-button');
                if (toggleButton) {
                    toggleButton.click();
                }
            }
        };
        document.addEventListener('keydown', this.boundHandlers.keydown);
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
        console.log('[Translator] Initializing...');
        const domain = window.location.hostname;
        console.log('[Translator] Current domain:', domain);
        
        const { pluginStatus = {} } = await chrome.storage.sync.get('pluginStatus');
        const isEnabled = pluginStatus[domain] ?? true;
        console.log('[Translator] Plugin status:', isEnabled);
        
        if (!isEnabled) {
            console.log('[Translator] Plugin disabled, skipping initialization');
            return;
        }

        console.log('[Translator] Starting feature initialization');
        await this.initializeFeatures();
    }

    async initializeFeatures() {
        console.log('[Translator] Initializing features');
        try {
            this.translationQueueManager = new TranslationQueueManager(this.uiManager);
            const wordCollector = new WordCollector();
            await wordCollector.initialize();
            await wordCollector.highlightCollectedWords(document.body);

            this.uiManager.createTranslationToolbar();

            await new Promise((resolve) => {
                chrome.storage.sync.get(
                    ['triggerKey', 'enableTriggerKey', 'translationService', 'serviceTokens'],
                    (configData) => {
                        this.initializeEvents(configData);
                        resolve();
                    }
                );
            });

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

            this.setupMessageListener();
            console.log('[Translator] Features initialized successfully');
        } catch (error) {
            console.error('[Translator] Error initializing features:', error);
        }
    }

    setupMessageListener() {
        console.log('[Translator] Setting up message listener');
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('[Translator] Received message:', message);
            if (message.type === 'PLUGIN_STATUS_CHANGED') {
                if (!message.isEnabled) {
                    console.log('[Translator] Disabling plugin features');
                    this.stopTranslation();
                    this.cleanup();
                    this.removeEventListeners();
                } else {
                    console.log('[Translator] Re-enabling plugin features');
                    // 重要：使用 setTimeout 确保清理操作完成后再初始化
                    setTimeout(() => {
                        this.initializeFeatures();
                    }, 100);
                }
            }
        });
    }

    removeEventListeners() {
        // 移除所有已绑定的事件监听器
        Object.entries(this.boundHandlers).forEach(([event, handler]) => {
            if (handler) {
                document.removeEventListener(event, handler);
                this.boundHandlers[event] = null;
            }
        });

        // 移除工具栏按钮的事件监听器
        const translateButton = document.querySelector('.translate-button');
        if (translateButton) {
            translateButton.replaceWith(translateButton.cloneNode(true));
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

    cleanup() {
        console.log('[Translator] Starting cleanup');
        this.removeEventListeners();
        
        const elementsToRemove = [
            '.translation-toolbar',
            '.translation-progress',
            '.inline-translation-result',
            '.selection-toolbar',
            '.hover-toolbar',
            '.hoverable-text',
            '.translating',
            '.translated'
        ];

        // 先移除悬停工具栏
        if (this.uiManager && this.uiManager.hoverToolbar) {
            this.uiManager.hoverToolbar.remove();
            this.uiManager.hoverToolbar = null;
        }

        // 移除所有添加的类和元素
        document.querySelectorAll(elementsToRemove.join(',')).forEach(el => {
            if (el.classList.contains('hoverable-text') || 
                el.classList.contains('translating') || 
                el.classList.contains('translated')) {
                console.log('[Translator] Removing classes from element:', el);
                el.classList.remove('hoverable-text', 'translating', 'translated');
            } else {
                console.log('[Translator] Removing element:', el);
                el.remove();
            }
        });

        // 确保清理所有悬停元素的类
        if (this.hoveredElement) {
            this.hoveredElement.classList.remove('hoverable-text');
            this.hoveredElement = null;
        }
        
        // 清理所有状态
        this.isTranslating = false;
        
        // 修改清理逻辑
        if (this.uiManager.manualAddDrawer) {
            this.uiManager.manualAddDrawer.hide();
            this.uiManager.manualAddDrawer = null;
        }
        
        console.log('[Translator] Cleanup completed');
    }

    // 添加鼠标移动时更新工具栏位置的方法
    updateHoverToolbarPosition(e) {
        if (this.uiManager.hoverToolbar && this.uiManager.hoverToolbar.classList.contains('visible')) {
            // 获取页面尺寸
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // 获取工具栏尺寸
            const toolbarWidth = this.uiManager.hoverToolbar.offsetWidth;
            const toolbarHeight = this.uiManager.hoverToolbar.offsetHeight;
            
            // 计算位置，确保不超出视口
            let left = e.clientX + 10; // 鼠标右侧10px处
            let top = e.clientY + 10;  // 鼠标下方10px处
            
            // 确保工具栏不会超出右侧边界
            if (left + toolbarWidth > viewportWidth - 20) {
                left = e.clientX - toolbarWidth - 10; // 如果会超出，则放在左侧
            }
            
            // 确保工具栏不会超出底部边界
            if (top + toolbarHeight > viewportHeight - 20) {
                top = e.clientY - toolbarHeight - 10; // 如果会超出，则放在上方
            }
            
            // 设置工具栏位置
            this.uiManager.hoverToolbar.style.position = 'fixed';
            this.uiManager.hoverToolbar.style.left = `${left}px`;
            this.uiManager.hoverToolbar.style.top = `${top}px`;
        }
    }
}

