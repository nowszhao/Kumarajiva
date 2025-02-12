// 防止全局变量污染

import { TranslatorFactory } from './translators';
import config from './config/config';
import WordCollector from './components/wordCollector';
import VocabularyStorage from './components/vocabularyStorage';
import { extractJsonFromString } from './utils';

(function() {
    let hoveredElement = null;
    let isCtrlPressed = false;
    let translationCache = new Map();
    let translatedElements = new WeakSet();
    let isTranslating = false;
    let translationQueue = [];
    let isProcessingQueue = false;
    let isOriginalTextHidden = false;

    // 节流函数
    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    // 优化：更精确的段落选择逻辑
    function findTextContainer(element) {
        // 忽略这些元素
        const ignoredTags = new Set(['BODY','SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'IMG', 'SVG', 'VIDEO', 'AUDIO']);
        if (ignoredTags.has(element.tagName)) {
            return null;
        }

        // 如果元素本身就包含文本且没有子元素，直接返回
        if (element.childNodes.length === 1 &&
            element.childNodes[0].nodeType === Node.TEXT_NODE &&
            element.textContent.trim().length > 0) {
            return element;
        }

        // 查找最近的文本容器
        const validSelectors = [
            'p',                    // 段落
            'article',              // 文章
            'h1, h2, h3, h4, h5',     // 标题
            '.text',                // 文本类
            '[role="article"]',     // ARIA 角色
            'li',                   // 列表项
            'td',                   // 表格单元格
            'div:not(:empty)'       // 非空 div
        ].join(',');

        let container = element.closest(validSelectors);
        
        // 如果找不到合适的容器，尝试使用父级
        if (!container && element.parentElement) {
            container = element.parentElement.closest(validSelectors);
        }

        // 验证找到的容器是否合适（这里可以根据需要放宽长度限制）
        if (container &&
            container.textContent.trim().length > 0 &&
            // 调整：允许较长文本，或将条件移除
            // container.textContent.trim().length < 1000 &&
            !container.querySelector('input, button, select, textarea')) {
            return container;
        }

        return null;
    }

    // 检查元素是否包含英文
    function containsEnglish(text) {
        // 1. 匹配完整的英文单词
        // 2. 单词前后必须是空格、标点或字符串边界
        // 3. 排除常见的缩写和单字母单词 (如 a, I)
        // 4. 单词长度至少3个字母
        return /(?:^|[^a-zA-Z])[a-zA-Z]{3,}(?:[^a-zA-Z]|$)/.test(text);
    }

    // 创建翻译容器
    function createTranslationElement(translationResult) {
        try {
            const result = typeof translationResult === 'string' ? 
                JSON.parse(translationResult) : translationResult;

            console.log('Creating translation element with result:', result); // 添加日志

            const container = document.createElement('div');
            container.className = 'inline-translation-result';

            // 原文区域 - 保存原始文本
            // const originalText = document.createElement('div');
            // originalText.className = 'original-text';
            // originalText.textContent = result.original || result.text || ''; // 确保获取原文
            // console.log('Original text content:', originalText.textContent); // 添加日志
            // container.appendChild(originalText);

            // 主翻译区域
            const mainTranslation = document.createElement('div');
            mainTranslation.className = 'translation-main';
            mainTranslation.textContent = result.translation;
            container.appendChild(mainTranslation);

            // 仅当有难词数据时才显示展开按钮
            if (result.difficultVocabulary && result.difficultVocabulary.length > 0) {
                // 展开按钮
                const expandBtn = document.createElement('div');
                expandBtn.className = 'translation-expand-btn';
                expandBtn.textContent = '显示难词解析';
                container.appendChild(expandBtn);

                // 难词区域
                const difficultWords = document.createElement('div');
                difficultWords.className = 'difficult-words';
                
                result.difficultVocabulary.forEach(word => {
                    const wordItem = createWordItem(word);
                    difficultWords.appendChild(wordItem);
                });
                container.appendChild(difficultWords);

                // 添加展开/收起功能
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

    // 创建单个词条展示
    function createWordItem(word) {
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
                    "definitions": [
                        {
                            "meaning": word.chinese_meaning,
                            "pos": word.part_of_speech,
                        }
                    ],
                    "mastered": false,
                    "pronunciation": {
                        "American":  word.phonetic,
                        "British": ""
                    },
                    "timestamp": new Date().getTime(),
                    "word": word.vocabulary,
                    "memory_method": word.chinese_english_sentence
                }

                await VocabularyStorage.addWord(word.vocabulary, ret);
                collectBtn.classList.add('collected');
                collectBtn.textContent = '已收藏';
                
                // 添加：收藏后立即触发页面重新高亮
                const wordCollector = new WordCollector();
                await wordCollector.initialize();
                await wordCollector.highlightCollectedWords(document.body);
            } else {
                await VocabularyStorage.removeWord(word.vocabulary);
                collectBtn.classList.remove('collected');
                collectBtn.textContent = '收藏';
                
                // 添加：取消收藏后移除高亮
                document.querySelectorAll(`.collected-word[data-word="${word.vocabulary.toLowerCase()}"]`)
                    .forEach(el => {
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

    // 创建翻译状态指示器
    function createLoadingIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'translation-loading';
        indicator.innerHTML = `
            <span>正在翻译...</span>
        `;
        return indicator;
    }

    // 处理翻译
    async function handleTranslation(element) {
        const text = element.textContent.trim();
        if (!text || !containsEnglish(text)) {
            console.log("Text is not English:", text);
            return;
        }

        try {
            // 为原始文本元素添加标识类
            element.classList.add('original-content');
            
            // 添加加载指示器
            const loadingIndicator = createLoadingIndicator();
            element.insertAdjacentElement('afterend', loadingIndicator);

            let translation;
            if (translationCache.has(text)) {
                translation = translationCache.get(text);
            } else {
                // 在调用 translate 之前保存原文
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
                    "translation":"xxxx",
                    "difficultVocabulary":[
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

                translation = await translate(translationPrompt);
                translationCache.set(text, translation);
            }

            console.log('Translation result:', translation); // 添加日志

            // 移除加载指示器
            loadingIndicator.remove();

            // 移除可能存在的旧翻译结果
            removeTranslation(element);

            // 显示翻译结果
            const translationElement = createTranslationElement(translation);
            element.insertAdjacentElement('afterend', translationElement);
            
        } catch (error) {
            console.error('Translation failed:', error);
            element.classList.remove('original-content');  // 如果翻译失败，移除标识类
            const errorIndicator = document.createElement('div');
            errorIndicator.className = 'translation-error';
            errorIndicator.textContent = '翻译失败，请重试';
            element.insertAdjacentElement('afterend', errorIndicator);
            setTimeout(() => errorIndicator.remove(), 2000);
        }
    }

    // 翻译函数
    async function translate(text) {
        try {
            // 从 storage 获取当前的翻译服务设置
            const { translationService, serviceTokens } = await chrome.storage.sync.get(['translationService', 'serviceTokens']);
            
            // 使用保存的设置，如果没有则使用默认值
            const currentService = translationService || config.translation.defaultService;
            
            // 获取对应服务的 token
            const token = serviceTokens?.[currentService] || config[currentService].apiToken;
            
            // 创建翻译器实例时使用保存的设置
            const translator = TranslatorFactory.createTranslator(
                currentService,
                {
                    ...config[currentService],
                    apiToken: token
                }
            );

            try {
                //"翻译为准确且地道的中文：" + text;
                var prompt = `
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
                    "translation":"xxxx"
                    "difficultVocabulary":[
                        {
                            "vocabulary": "benchmark",
                            "type": "Words",
                            "part_of_speech": "n.",
                            "phonetic": "/ˈbentʃmɑːrk/",
                            "chinese_meaning": "基准；参照标准",
                            "chinese_english_sentence": "DeepSeek最近发布的推理模型在常见benchmark中击败了许多顶级人工智能公司。(DeepSeek recently released its reasoning model, which outperformed many top AI companies in common benchmarks.)"
                        },
                        ...
                    ]
                }    
                处理内容如下：
                ${text}`;
                
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

    // 移除翻译结果
    function removeTranslation(element) {
        const nextElement = element.nextElementSibling;
        if (nextElement && nextElement.classList.contains('inline-translation-result')) {
            nextElement.remove();
            translatedElements.delete(element);
        }
    }

    // 主要功能初始化
    async function initializeInlineTranslator() {
        // 获取交互设置
        const { triggerKey, enableTriggerKey } = await chrome.storage.sync.get([
            'triggerKey',
            'enableTriggerKey'
        ]);

        // 使用设置值或默认值
        const currentTriggerKey = triggerKey || config.translation.interaction.triggerKey;
        const isEnabled = enableTriggerKey ?? config.translation.interaction.enableTriggerKey;

        if (!isEnabled) return;

        // 监听鼠标移动（使用 mousemove 以确保在段落内的任何位置都能正确检测）
        document.addEventListener('mousemove', throttle((e) => {
            const element = findTextContainer(e.target);
            // 仅当新获取的元素与当前 hoveredElement 不同时才更新
            if (element && containsEnglish(element.textContent)) {
                if (hoveredElement !== element) {
                    if (hoveredElement) {
                        hoveredElement.classList.remove('hoverable-text');
                    }
                    hoveredElement = element;
                    element.classList.add('hoverable-text');
                }
            }
        }, 100));

        // 监听鼠标移出
        document.addEventListener('mouseout', (e) => {
            // 只有当鼠标真正离开 hoveredElement 时才移除高亮
            if (hoveredElement &&
                (!e.relatedTarget || !hoveredElement.contains(e.relatedTarget))) {
                hoveredElement.classList.remove('hoverable-text');
                if (!isCtrlPressed && !isTranslating) {
                    hoveredElement = null;
                }
            }
        });

        // 修改键盘事件监听
        document.addEventListener('keydown', (e) => {
            if (e.key === currentTriggerKey && !isCtrlPressed) {
                isCtrlPressed = true;
                if (hoveredElement) {
                    handleTranslation(hoveredElement);
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === currentTriggerKey) {
                isCtrlPressed = false;
                if (hoveredElement) {
                    hoveredElement = null;
                }
            }
        });
    }

    // 修改 createTranslationToolbar 函数，添加进度条元素
    function createTranslationToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'translation-toolbar';

        // 创建进度条容器
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

        toolbar.appendChild(translateButton);
        toolbar.appendChild(toggleOriginalButton);
        document.body.appendChild(toolbar);

        // 翻译按钮点击事件
        translateButton.addEventListener('click', () => {
            if (isTranslating) {
                stopTranslation();
                translateButton.classList.remove('active');
            } else {
                startTranslation();
                translateButton.classList.add('active');
            }
        });

        // 原文切换按钮点击事件
        toggleOriginalButton.addEventListener('click', () => {
            isOriginalTextHidden = !isOriginalTextHidden;
            console.log('Toggle original text, isHidden:', isOriginalTextHidden);

            // 查找所有已翻译的原始文本元素
            const translatedElements = document.querySelectorAll('.inline-translation-result');
            console.log('Found translated elements:', translatedElements.length);

            translatedElements.forEach(translationResult => {
                // 获取原始文本元素（翻译结果的前一个兄弟元素）
                const originalElement = translationResult.previousElementSibling;
                if (originalElement) {
                    if (isOriginalTextHidden) {
                        originalElement.style.display = 'none';
                    } else {
                        originalElement.style.display = '';  // 恢复默认显示
                    }
                }
            });

            toggleOriginalButton.classList.toggle('active');
        });

        return { toolbar, progress };
    }

    // 修改 startTranslation 函数
    function startTranslation() {
        const progress = document.querySelector('.translation-progress');
        if (progress) {
            progress.classList.add('visible');
        }
        isTranslating = true;
        translationQueue = [];
        isProcessingQueue = false;

        // 如果当前是隐藏原文状态，对新翻译的内容也应用相同的规则
        if (isOriginalTextHidden) {
            document.querySelectorAll('.original-content').forEach(element => {
                element.style.display = 'none';
            });
        }

        translateVisibleContent();
    }

    // 修改 stopTranslation 函数
    function stopTranslation() {
        const progress = document.querySelector('.translation-progress');
        if (progress) {
            progress.classList.remove('visible');
        }
        isTranslating = false;
        
        // 清理状态
        document.querySelectorAll('.translating').forEach(el => {
            el.classList.remove('translating');
        });
    }

    // 修改 findVisibleTextContainers 函数，增加预加载范围
    function findVisibleTextContainers() {
        // 获取视窗信息，增加预加载缓冲区
        const bufferSize = 300; // 上下各预加载300px
        const viewportHeight = window.innerHeight;
        const scrollTop = window.scrollY;
        const viewportTop = scrollTop - bufferSize;
        const viewportBottom = scrollTop + viewportHeight + bufferSize;

        // 1. 首先尝试查找常见的文章主体容器
        const mainContentSelectors = [
            'article', '[role="main"]', 'main',
            '.post-content', '.article-content', '.entry-content',
            '#content-main', '.main-content', '.post-body', '.article-body'
        ];

        let mainContent = null;
        for (const selector of mainContentSelectors) {
            const element = document.querySelector(selector);
            if (element && containsEnglish(element.textContent)) {
                mainContent = element;
                break;
            }
        }

        // 如果没找到主容器，使用 body
        if (!mainContent) {
            mainContent = document.body;
        }

        // 获取所有可能的文本容器
        const containers = [];
        const paragraphs = mainContent.querySelectorAll('p, h1, h2, h3, h4, h5, h6, article, section, .text-content');
        
        // 筛选可见的段落
        paragraphs.forEach(p => {
            const rect = p.getBoundingClientRect();
            const elementTop = scrollTop + rect.top;
            const elementBottom = scrollTop + rect.bottom;

            // 检查元素是否在扩展的可见区域内
            const isInViewport = (
                elementBottom > viewportTop &&
                elementTop < viewportBottom
            );

            // 检查元素是否符合翻译条件
            const isValidForTranslation = (
                !p.classList.contains('translated') &&
                !p.classList.contains('translating') &&
                !p.classList.contains('inline-translation-result') &&
                containsEnglish(p.textContent) &&
                p.textContent.trim().length > 10 &&
                isElementVisible(p)
            );

            if (isInViewport && isValidForTranslation) {
                containers.push(p);
            }
        });

        return containers;
    }

    // 检查元素是否在可视区域内
    function isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        
        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0
            // 移除了对元素位置的限制检查
        );
    }

    // 修改 translateVisibleContent 函数
    async function translateVisibleContent() {
        // 添加对 isTranslating 的检查
        if (!isTranslating) return;

        const visibleContainers = findVisibleTextContainers();
        if (visibleContainers.length === 0) return;

        // 更新进度显示
        const progress = document.querySelector('.translation-progress');
        if (progress) {
            progress.classList.add('visible');
        }

        // 将新的容器添加到队列中，避免重复
        const newContainers = visibleContainers.filter(container => {
            const isNew = !translationQueue.includes(container) &&
                         !container.classList.contains('translated') &&
                         !container.classList.contains('translating');
            return isNew;
        });
        
        if (newContainers.length > 0) {
            console.log(`Adding ${newContainers.length} new containers to translation queue`);
            translationQueue = translationQueue.concat(newContainers);
            
            // 如果队列未在处理中，开始处理
            if (!isProcessingQueue) {
                processTranslationQueue();
            }
        }
    }

    // 修改 processTranslationQueue 函数
    async function processTranslationQueue() {
        if (translationQueue.length === 0) {
            isProcessingQueue = false;
            return;
        }
        
        isProcessingQueue = true;
        const progress = document.querySelector('.translation-progress');
        const progressText = progress.querySelector('.progress-text');
        
        let processed = 0;
        let total = translationQueue.length;
        
        try {
            while (translationQueue.length > 0 && isTranslating) {
                const container = translationQueue[0];
                
                if (document.body.contains(container) && !container.classList.contains('translated')) {
                    container.classList.add('translating');
                    progressText.textContent = `分析进度: ${++processed}/${total}`;
                    
                    try {
                        await handleTranslation(container);
                        container.classList.add('translated');
                    } catch (error) {
                        console.error('Translation failed:', error);
                        showTranslationError(container, error);
                    } finally {
                        container.classList.remove('translating');
                    }
                }
                
                translationQueue.shift();
                
                // 检查是否有新的可见内容需要处理
                if (translationQueue.length === 0 && isTranslating) {
                    const newContainers = findVisibleTextContainers();
                    if (newContainers.length > 0) {
                        translationQueue = translationQueue.concat(newContainers);
                        total += newContainers.length;
                    }
                }

                // 添加延迟以避免过快处理
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        } finally {
            isProcessingQueue = false;
            
            // 如果队列为空，隐藏进度条
            if (translationQueue.length === 0 && progress) {
                progress.classList.remove('visible');
            }
        }
    }

    // 添加错误提示函数
    function showTranslationError(container, error) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'translation-error';
        errorDiv.textContent = '翻译失败，请稍后重试';
        container.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 3000);
    }

    // 修改初始化函数
    async function initialize() {
        initializeInlineTranslator();
        
        // 初始化单词收藏功能
        const wordCollector = new WordCollector();
        await wordCollector.initialize();

        // 创建工具栏和进度条
        createTranslationToolbar();

        // 添加快捷键支持
        document.addEventListener('keydown', (e) => {
            // 添加切换原文显示的快捷键 (Alt + H)
            if (e.altKey && e.key === 'h') {
                const toggleButton = document.querySelector('.toggle-original-button');
                if (toggleButton) {
                    toggleButton.click();
                }
            }
        });

        // 修改滚动监听
        window.addEventListener('scroll', throttle(() => {
            // 只有在翻译开启且队列未处理时才触发
            if (isTranslating && !isProcessingQueue) {
                translateVisibleContent();
            }
        }, 500));
    }

    // 启动应用
    initialize();
})(); 