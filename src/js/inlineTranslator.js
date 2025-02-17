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
        // 排除包含中文字符的文本
        if (/[\u4e00-\u9fa5]/.test(text)) {
            return false;
        }
        // 匹配至少两个由有效分隔符分隔的英语单词
        const englishPattern = /[a-zA-Z]+(?:['’-][a-zA-Z]+)*[\s,.;!?()'":]+[a-zA-Z]+(?:['’-][a-zA-Z]+)*/;
        return englishPattern.test(text);
    }


    static findTextContainer(element) {
        // 忽略标签
        const ignoredTags = new Set([
            'BODY', 
            'SCRIPT', 
            'STYLE', 
            'NOSCRIPT', 
            'IFRAME', 
            'IMG', 
            'SVG', 
            'VIDEO', 
            'AUDIO',
            'BUTTON',      // 添加 BUTTON 标签
            'INPUT',       // 添加 INPUT 标签
            'SELECT',      // 添加 SELECT 标签
            'TEXTAREA'     // 添加 TEXTAREA 标签
        ]);

        // 如果元素本身或其任何父元素是链接或按钮，则返回 null
        let currentElement = element;
        while (currentElement && currentElement !== document.body) {
            if (ignoredTags.has(currentElement.tagName)) {
                return null;
            }
            currentElement = currentElement.parentElement;
        }

        // 如果只有一个文本子节点
        if (
            element.childNodes.length === 1 &&
            element.childNodes[0].nodeType === Node.TEXT_NODE &&
            element.textContent.trim().length > 0
        ) {
            return element;
        }

        // 查找常规文本容器，但排除包含交互元素的容器
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

        // 额外检查：确保容器不包含或不是交互元素
        if (
            container &&
            container.textContent.trim().length > 0 &&
            !container.querySelector('button, input, select, textarea') && // 检查是否包含交互元素
            !ignoredTags.has(container.tagName) // 再次检查容器本身的标签
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


        const method = document.createElement('div');
        method.className = 'chinese_english_sentence';
        method.textContent = word.chinese_english_sentence;
        wordDetails.appendChild(method);


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

        // 添加分析按钮
        const analyzeButton = document.createElement('button');
        analyzeButton.className = 'toolbar-button article-analyze-button';
        analyzeButton.title = '文章分析';
        analyzeButton.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zm-5-7V8h-2v4H8v2h4v2h2v-2h4v-2h-4z"/>
            </svg>
        `;

        // 在 createTranslationToolbar 方法中添加分析按钮的事件监听
        analyzeButton.addEventListener('click', async () => {
            console.log('[Analysis] Button clicked');
            
            if (!this.analysisPanel) {
                console.log('[Analysis] Creating new panel');
                try {
                    this.analysisPanel = this.createAnalysisPanel();
                    console.log('[Analysis] Panel created successfully');
                    
                    const closeBtn = this.analysisPanel.shadow.querySelector('.close-analysis-btn');
                    closeBtn.addEventListener('click', () => {
                        console.log('[Analysis] Close button clicked');
                        this.closeAnalysisPanel();
                    });
                } catch (error) {
                    console.error('[Analysis] Error creating panel:', error);
                    return;
                }
            }

            const isVisible = this.analysisPanel.panel.classList.contains('visible');
            console.log('[Analysis] Panel visibility:', isVisible);

            if (!isVisible) {
                // 如果已经有分析结果，直接显示面板
                const resultContainer = this.analysisPanel.shadow.querySelector('.analysis-result-container');
                if (resultContainer.children.length > 0) {
                    this.showAnalysisPanel();
                    return;
                }

                try {
                    console.log('[Analysis] Showing panel');
                    this.showAnalysisPanel();
                    
                    // 获取页面内容并发送分析请求
                    console.log('[Analysis] Getting page content');
                    const content = this.getPageContent();
                    console.log('[Analysis] Content length:', content.length);

                    // 显示加载状态
                    const loadingEl = this.analysisPanel.shadow.querySelector('.analysis-loading');
                    if (loadingEl) {
                        loadingEl.style.display = 'flex';
                    }

                    try {
                        const translationServiceWrapper = new TranslationServiceWrapper();
                        const analysisPrompt = `
                            请使用中文总结概括当前网页内容，并列出文中提到的核心观点及支持论据，返回Json格式如下：
                            {
                                "summary": "该视频通过认知语言学视角分析二语习得，比较了英语与其他语言的学习差异...",
                                "coreConcepts": [
                                    {
                                        "term": "词块理论",
                                        "definition": "语言学习的最小意义单位，包含固定搭配和惯用表达"
                                    },
                                    {
                                        "term": "艾宾浩斯遗忘曲线",
                                        "definition": "描述人类记忆衰退规律的心理模型"
                                    }
                                ],
                                "viewpoints": [
                                    {
                                        "viewpoint": "英语学习具有显著的认知负荷特征",
                                        "arguments": [
                                            "屈折语特性导致词形变化复杂度高于汉语",
                                            "语音系统包含8个元音音位形成辨音挑战"
                                        ]
                                    }
                                ]
                            }
                            上述说明如下：
                            - summary：总结内容，为网页内容的核心摘要（200字以内）
                            - coreConcepts: 影响文章理解的核心和重要概念解释
                            - term: 核心术语/概念名称
                            - definition: 简明扼要的概念解释（50字内）
                            - viewpoints：观点集
                            - viewpoint： 作者的核心观点陈述
                            - argument： 支持观点的具体论据1（避免重复观点语句）
                            
                            内容如下：
                            ${content}
                        `;
                        
                        console.log('[Analysis] Sending analysis request');
                        const result = await translationServiceWrapper.translate(analysisPrompt);
                        console.log('[Analysis] Got analysis result');
                        this.updateAnalysisPanel(result);
                    } catch (error) {
                        console.error('[Analysis] Analysis failed:', error);
                        this.showAnalysisError();
                    }
                } catch (error) {
                    console.error('[Analysis] Error showing panel:', error);
                    this.closeAnalysisPanel();
                }
            } else {
                console.log('[Analysis] Hiding panel');
                this.closeAnalysisPanel();
            }
        });

        toolbar.appendChild(translateButton);
        toolbar.appendChild(toggleOriginalButton);
        toolbar.appendChild(analyzeButton);
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

    createAnalysisPanel() {
        console.log('[Analysis] Start creating panel');
        
        // 创建 Shadow DOM 容器
        const host = document.createElement('div');
        host.id = 'analysis-panel-host';
        host.style.cssText = `
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            width: 0;
            z-index: 999999;
            pointer-events: none;
        `;
        document.body.appendChild(host);
        
        // 创建 Shadow DOM
        const shadow = host.attachShadow({ mode: 'open' });
        
        // 注入样式
        const style = document.createElement('style');
        style.textContent = `
            :host {
                all: initial;
                display: block;
            }
            
            .analysis-panel {
                position: fixed;
                left: 0;
                top: 0;
                bottom: 0;
                width: 400px;
                background: #fff;
                box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);
                display: flex;
                flex-direction: column;
                transform: translateX(-100%);
                transition: transform 0.3s ease;
                z-index: 999999;
                font-family: system-ui, -apple-system, sans-serif;
            }
            
            .analysis-panel.visible {
                transform: translateX(0);
            }
            
            .analysis-header {
                padding: 16px;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .analysis-header h2 {
                margin: 0;
                font-size: 16px;
                font-weight: 600;
                color: #333;
            }
            
            .close-analysis-btn {
                background: none;
                border: none;
                padding: 8px;
                cursor: pointer;
                color: #666;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .close-analysis-btn:hover {
                background: #f5f5f5;
            }
            
            .analysis-content {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
            }
            
            .analysis-loading {
                display: none;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 12px;
                padding: 24px;
                color: #666;
            }
            
            .analysis-spinner {
                width: 24px;
                height: 24px;
                border: 2px solid #eee;
                border-top-color: #1a73e8;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            .analysis-resizer {
                position: absolute;
                right: -4px;
                top: 0;
                width: 8px;
                height: 100%;
                cursor: ew-resize;
                background: transparent;
                transition: background 0.2s;
            }
            
            .analysis-resizer:hover,
            .analysis-resizer.dragging {
                background: rgba(26, 115, 232, 0.1);
            }
            
            /* 复制现有的分析结果样式 */
            ${this.getAnalysisResultStyles()}
            
            /* 深色模式支持 */
            @media (prefers-color-scheme: dark) {
                .analysis-panel {
                    background: #202124;
                    box-shadow: 2px 0 8px rgba(0, 0, 0, 0.3);
                }
                
                .analysis-header {
                    border-bottom-color: #3c4043;
                }
                
                .analysis-header h2 {
                    color: #e8eaed;
                }
                
                .close-analysis-btn {
                    color: #9aa0a6;
                }
                
                .close-analysis-btn:hover {
                    background: #303134;
                    color: #e8eaed;
                }
                
                .analysis-loading {
                    color: #9aa0a6;
                }
                
                .analysis-spinner {
                    border-color: #3c4043;
                    border-top-color: #8ab4f8;
                }
            }
        `;
        shadow.appendChild(style);
        
        // 创建面板内容
        const panel = document.createElement('div');
        panel.className = 'analysis-panel';
        panel.innerHTML = `
            <div class="analysis-header">
                <h2>文章分析 | Kumarajiva</h2>
                <button class="close-analysis-btn">
                    <svg viewBox="0 0 24 24" width="20" height="20">
                        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </div>
            <div class="analysis-content">
                <div class="analysis-loading">
                    <div class="analysis-spinner"></div>
                    <span>正在分析文章内容...</span>
                </div>
                <div class="analysis-result-container"></div>
            </div>
            <div class="analysis-resizer"></div>
        `;
        shadow.appendChild(panel);
        
        // 添加拖拽调整宽度功能
        this.initializeResizer(panel, host);
        
        return { host, panel, shadow };
    }

    initializeResizer(panel, host) {
        const resizer = panel.querySelector('.analysis-resizer');
        let startX, startWidth;
        
        const startDragging = (e) => {
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            resizer.classList.add('dragging');
            document.body.style.cursor = 'ew-resize';
            document.addEventListener('mousemove', onDrag);
            document.addEventListener('mouseup', stopDragging);
        };
        
        const onDrag = (e) => {
            requestAnimationFrame(() => {
                const width = Math.max(300, Math.min(800, startWidth + (e.clientX - startX)));
                panel.style.width = `${width}px`;
                host.style.width = `${width}px`;
            });
        };
        
        const stopDragging = () => {
            resizer.classList.remove('dragging');
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', onDrag);
            document.removeEventListener('mouseup', stopDragging);
        };
        
        resizer.addEventListener('mousedown', startDragging);
    }

    // 获取分析结果样式
    getAnalysisResultStyles() {
        return `
            .analysis-result-wrapper {
                display: flex;
                flex-direction: column;
                gap: 16px;
                padding: 0 16px;
            }

            .analysis-summary {
                background: #f8f9fa;
                border-radius: 8px;
                padding: 16px;
            }

            .analysis-summary h4 {
                margin: 0 0 12px;
                color: #1a73e8;
                font-size: 15px;
                font-weight: 600;
            }

            .analysis-summary p {
                margin: 0;
                color: #333;
                line-height: 1.6;
                font-size: 14px;
            }

            .analysis-concepts {
                margin: 0;
            }

            .analysis-concepts h4 {
                margin: 0 0 12px;
                color: #1a73e8;
                font-size: 15px;
                font-weight: 600;
            }

            .concepts-list {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .concept-item {
                background: #f8f9fa;
                border-radius: 8px;
                padding: 12px 16px;
            }

            .concept-header {
                display: flex;
                gap: 12px;
                align-items: flex-start;
            }

            .concept-number {
                width: 20px;
                height: 20px;
                background: #1a73e8;
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                flex-shrink: 0;
                margin-top: 2px;
            }

            .concept-content {
                flex: 1;
            }

            .concept-term {
                margin: 0 0 4px;
                font-size: 14px;
                font-weight: 600;
                color: #333;
            }

            .concept-definition {
                margin: 0;
                font-size: 13px;
                color: #666;
                line-height: 1.5;
            }

            .analysis-viewpoints {
                margin: 0;
            }

            .analysis-viewpoints h4 {
                margin: 0 0 12px;
                color: #1a73e8;
                font-size: 15px;
                font-weight: 600;
            }

            .viewpoint-card {
                background: #f8f9fa;
                border-radius: 8px;
                padding: 12px 16px;
                margin-bottom: 12px;
            }

            .viewpoint-header {
                display: flex;
                gap: 12px;
                align-items: flex-start;
                margin-bottom: 8px;
            }

            .viewpoint-number {
                width: 20px;
                height: 20px;
                background: #1a73e8;
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                flex-shrink: 0;
                margin-top: 2px;
            }

            .viewpoint-text {
                margin: 0;
                font-size: 14px;
                font-weight: 600;
                color: #333;
                line-height: 1.5;
            }

            .viewpoint-arguments {
                margin-left: 32px;
            }

            .argument-item {
                display: flex;
                gap: 8px;
                align-items: flex-start;
                margin-bottom: 8px;
            }

            .argument-item:last-child {
                margin-bottom: 0;
            }

            .argument-bullet {
                color: #1a73e8;
                font-size: 16px;
                line-height: 1;
                margin-top: 2px;
            }

            .argument-item p {
                margin: 0;
                font-size: 13px;
                color: #666;
                line-height: 1.5;
            }

            @media (prefers-color-scheme: dark) {
                .analysis-summary,
                .concept-item,
                .viewpoint-card {
                    background: #2c2c2c;
                }

                .analysis-summary h4,
                .analysis-concepts h4,
                .analysis-viewpoints h4 {
                    color: #8ab4f8;
                }

                .analysis-summary p,
                .concept-term,
                .viewpoint-text {
                    color: #e8eaed;
                }

                .concept-definition,
                .argument-item p {
                    color: #9aa0a6;
                }

                .concept-number,
                .viewpoint-number {
                    background: #8ab4f8;
                }

                .argument-bullet {
                    color: #8ab4f8;
                }
            }
        `;
    }

    createAnalysisResult(result) {
        const container = document.createElement('div');
        container.className = 'analysis-result-wrapper';
        
        try {
            const analysisData = typeof result === 'string' ? JSON.parse(result) : result;
            console.log("analysisData:", analysisData);

            if (!analysisData || typeof analysisData !== 'object') {
                throw new Error('Invalid analysis result format');
            }

            // 添加总结部分 - 更新属性名为 summary
            if (analysisData.summary) {
                const summary = document.createElement('div');
                summary.className = 'analysis-summary';
                summary.innerHTML = `
                    <h4>内容总结</h4>
                    <p>${analysisData.summary}</p>
                `;
                container.appendChild(summary);
            }

            // 添加核心概念部分 - 更新为新的数据结构
            if (Array.isArray(analysisData.coreConcepts) && analysisData.coreConcepts.length > 0) {
                const concepts = document.createElement('div');
                concepts.className = 'analysis-concepts';
                concepts.innerHTML = '<h4>核心概念</h4>';

                const conceptsList = document.createElement('div');
                conceptsList.className = 'concepts-list';
                
                analysisData.coreConcepts.forEach((concept, index) => {
                    const conceptItem = document.createElement('div');
                    conceptItem.className = 'concept-item';
                    conceptItem.innerHTML = `
                        <div class="concept-header">
                            <span class="concept-number">${index + 1}</span>
                            <div class="concept-content">
                                <h5 class="concept-term">${concept.term}</h5>
                                <p class="concept-definition">${concept.definition}</p>
                            </div>
                        </div>
                    `;
                    conceptsList.appendChild(conceptItem);
                });

                concepts.appendChild(conceptsList);
                container.appendChild(concepts);
            }

            // 添加核心观点部分 - 更新属性名
            if (Array.isArray(analysisData.viewpoints) && analysisData.viewpoints.length > 0) {
                const viewpoints = document.createElement('div');
                viewpoints.className = 'analysis-viewpoints';
                viewpoints.innerHTML = '<h4>核心观点</h4>';

                analysisData.viewpoints.forEach((vp, index) => {
                    if (!vp || !vp.viewpoint) return;

                    const viewpointCard = document.createElement('div');
                    viewpointCard.className = 'viewpoint-card';
                    
                    const args = Array.isArray(vp.arguments) ? vp.arguments : [];
                    
                    viewpointCard.innerHTML = `
                        <div class="viewpoint-header">
                            <span class="viewpoint-number">${index + 1}</span>
                            <p class="viewpoint-text">${vp.viewpoint}</p>
                        </div>
                        ${args.length > 0 ? `
                            <div class="viewpoint-arguments">
                                ${args.map(arg => `
                                    <div class="argument-item">
                                        <span class="argument-bullet">•</span>
                                        <p>${arg}</p>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    `;
                    viewpoints.appendChild(viewpointCard);
                });

                container.appendChild(viewpoints);
            }

            if (container.children.length === 0) {
                container.innerHTML = `
                    <div class="analysis-error">
                        <p>未能获取到有效的分析结果</p>
                    </div>
                `;
            }

        } catch (error) {
            console.error('Error creating analysis result:', error);
            container.innerHTML = `
                <div class="analysis-error">
                    <p>分析结果格式错误，请重试</p>
                </div>
            `;
        }

        return container;
    }

    updateAnalysisPanel(result) {
        if (!this.analysisPanel) return;
        
        const shadow = this.analysisPanel.shadow;
        const loadingEl = shadow.querySelector('.analysis-loading');
        const resultContainer = shadow.querySelector('.analysis-result-container');
        
        loadingEl.style.display = 'none';
        resultContainer.innerHTML = '';
        resultContainer.appendChild(this.createAnalysisResult(result));
    }

    getPageContent() {
        try {
            // 获取主要内容区域
            const mainContent = document.body;
            
            // 创建临时容器
            const tempContainer = document.createElement('div');
            tempContainer.innerHTML = mainContent.innerHTML;
            
            // 移除不需要的元素
            const selectorsToRemove = [
                'script', 'style', 'iframe', 'img', 'video', 'audio', 'noscript',
                '.advertisement', '.comments', '.sidebar', '.footer', '.header', '.nav',
                '.menu', '.social-share', '.related-posts', '.translation-toolbar',
                '.article-analysis-panel', '.inline-translation-result'
            ];
            
            selectorsToRemove.forEach(selector => {
                tempContainer.querySelectorAll(selector).forEach(el => el.remove());
            });
            
            // 获取清理后的文本内容
            let content = tempContainer.textContent.trim().replace(/\s+/g, ' ');
            
            // 限制内容长度（避免超出 API 限制）
            const maxLength = 50000; // 根据实际 API 限制调整
            if (content.length > maxLength) {
                content = content.substring(0, maxLength) + '...';
            }
            
            return content;
        } catch (error) {
            console.error('Error getting page content:', error);
            return '无法获取页面内容';
        }
    }

    showAnalysisError() {
        if (!this.analysisPanel) return;

        const resultContainer = this.analysisPanel.shadow.querySelector('.analysis-result-container');
        if (resultContainer) {
            resultContainer.innerHTML = `
                <div class="analysis-error">
                    <p>分析失败，请稍后重试</p>
                </div>
            `;
        }
    }

    showAnalysisPanel() {
        if (!this.analysisPanel) return;
        
        this.analysisPanel.host.style.pointerEvents = 'auto';
        this.analysisPanel.panel.classList.add('visible');
    }

    closeAnalysisPanel() {
        if (!this.analysisPanel) return;
        
        this.analysisPanel.panel.classList.remove('visible');
        setTimeout(() => {
            this.analysisPanel.host.style.pointerEvents = 'none';
        }, 300); // 等待过渡动画完成
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
                1、翻译和解析我提供的英语文本，分析给定文本中的语言难点，这些难点可能包括对非母语学习者具有挑战性的词汇、短语、俚语、缩写、简写以及网络用语等，并帮我从中筛选出Top 8难点。
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
            2）如果某个部分没有发现任何难点，请在相应位置注明“无”。

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
class InlineTranslator {
    constructor() {
        this.hoveredElement = null;
        this.currentHoverElement = null;
        this.isTranslating = false;
        this.uiManager = new UIManager();
        this.translationQueueManager = null;
        this.analyzer = new Analyzer(this.uiManager);
        this.currentTriggerKey = null;
        // 存储事件处理函数的引用
        this.boundHandlers = {
            mousemove: null,
            mouseout: null,
            keydown: null,
            keyup: null,
            scroll: null,
            selectionchange: null
        };
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
                    if (this.hoveredElement) {
                        this.hoveredElement.classList.remove('hoverable-text');
                    }
                    this.hoveredElement = element;
                    element.classList.add('hoverable-text');
                }
            }
        }, 100);
        document.addEventListener('mousemove', this.boundHandlers.mousemove);

        // 鼠标移出时移除高亮
        this.boundHandlers.mouseout = (e) => {
            if (this.hoveredElement && (!e.relatedTarget || !this.hoveredElement.contains(e.relatedTarget))) {
                this.hoveredElement.classList.remove('hoverable-text');
                if (!this.isTranslating) {
                    this.hoveredElement = null;
                }
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

        // 悬停工具栏监听
        this.boundHandlers.mousemove = Utils.throttle((e) => {
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
        }, 100);
        document.addEventListener('mousemove', this.boundHandlers.mousemove);

        // 悬停工具栏隐藏
        this.boundHandlers.mouseout = (e) => {
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
        };
        document.addEventListener('mouseout', this.boundHandlers.mouseout);

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

        this.hoveredElement = null;
        this.currentHoverElement = null;
        this.isTranslating = false;
        console.log('[Translator] Cleanup completed');
    }
}

// 启动内联翻译应用
(function () {
    const inlineTranslator = new InlineTranslator();
    inlineTranslator.initialize();
})(); 