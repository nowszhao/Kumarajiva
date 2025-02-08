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
        return /[a-zA-Z]{2,}/.test(text);
    }

    // 创建翻译容器
    function createTranslationElement(translationResult) {
        try {
            const result = typeof translationResult === 'string' ? 
                JSON.parse(translationResult) : translationResult;

            const container = document.createElement('div');
            container.className = 'inline-translation-result';

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
            console.error('Error creating translation element,translationResult:',translationResult, error);
            const errorContainer = document.createElement('div');
            errorContainer.className = 'inline-translation-result';
            errorContainer.textContent = translationResult; // 降级显示原始文本
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
            <div class="loading-spinner"></div>
            <span>正在翻译...</span>
        `;
        return indicator;
    }

    // 处理翻译
    async function handleTranslation(element) {

        const text = element.textContent.trim();
        if (!text || !containsEnglish(text)) {
            console.log("text is not english:", text);
            return;
        }

        try {
            isTranslating = true;
            
            // 添加加载指示器
            const loadingIndicator = createLoadingIndicator();
            element.insertAdjacentElement('afterend', loadingIndicator);

            let translation;
            if (translationCache.has(text)) {
                translation = translationCache.get(text);
            } else {
                translation = await translate(text);
                translationCache.set(text, translation);
            }

            // 移除加载指示器
            loadingIndicator.remove();

            // 移除可能存在的旧翻译结果
            removeTranslation(element);

            // 显示翻译结果
            const translationElement = createTranslationElement(translation);
            element.insertAdjacentElement('afterend', translationElement);
            // 不再将元素添加到 translatedElements 集合中
            
        } catch (error) {
            console.error('Translation failed:', error);
            const errorIndicator = document.createElement('div');
            errorIndicator.className = 'translation-error';
            errorIndicator.textContent = '翻译失败，请重试';
            element.insertAdjacentElement('afterend', errorIndicator);
            setTimeout(() => errorIndicator.remove(), 2000);
        } finally {
            isTranslating = false;
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
                - 中英混合句子：使用词汇造一个句子，除了该词汇外，其他均为中文，方便用户在真实语境中掌握该词汇的含义，需要保证语法正确
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

    // 初始化
    async function initialize() {
        initializeInlineTranslator();
        
        // 初始化单词收藏功能
        const wordCollector = new WordCollector();
        await wordCollector.initialize();
    }

    // 启动应用
    initialize();
})(); 