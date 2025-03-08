import { TranslationServiceWrapper } from '../services/TranslationServiceWrapper';
import { ManualAddDrawer } from '../components/manualAddDrawer';
import { WordCollector } from '../components/wordCollector';
import { VocabularyStorage } from '../components/vocabularyStorage';


/**
 * UI 管理类，负责创建加载指示器、翻译结果、工具栏、提示信息等相关 DOM 元素
 */
export class UIManager {
    constructor() {
        this.selectionToolbar = null;
        this.hoverToolbar = null;
        this.manualAddDrawer = null; // 添加 manualAddDrawer 属性
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

        // 添加手动添加按钮
        const addManuallyButton = document.createElement('button');
        addManuallyButton.className = 'toolbar-button add-manually-button';
        addManuallyButton.title = '手动添加生词';
        addManuallyButton.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20">
                <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
        `;

        // 添加点击事件
        addManuallyButton.addEventListener('click', () => {
            console.log('[ManualAdd] Button clicked');
            try {
                if (!this.manualAddDrawer) {
                    console.log('[ManualAdd] Creating new drawer');
                    this.manualAddDrawer = new ManualAddDrawer();
                }
                console.log('[ManualAdd] Showing drawer');
                this.manualAddDrawer.show();
            } catch (error) {
                console.error('[ManualAdd] Error:', error);
            }
        });

        toolbar.appendChild(translateButton);
        toolbar.appendChild(toggleOriginalButton);
        toolbar.appendChild(analyzeButton);
        toolbar.appendChild(addManuallyButton); // 添加到工具栏
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
        
        // 翻译按钮
        const translateButtonHov = document.createElement('button');
        translateButtonHov.className = 'hover-toolbar-button';
        translateButtonHov.title = '翻译';
        translateButtonHov.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path fill="currentColor" d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04z"/>
            </svg>
        `;

        // 复制提示词按钮 (新增)
        const copyPromptButton = document.createElement('button');
        copyPromptButton.className = 'hover-toolbar-button';
        copyPromptButton.title = '复制解析提示词';
        copyPromptButton.innerHTML = `
            <svg viewBox="0 0 24 24">
                <path fill="currentColor" d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
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
        toolbar.appendChild(copyPromptButton);  // 添加新按钮
        toolbar.appendChild(analyzeButton);
        toolbar.appendChild(copyButton);
        
        // 将toolbar添加到document.body而不是特定元素
        document.body.appendChild(toolbar);
        
        // 添加鼠标进入toolbar的事件监听，防止toolbar消失
        toolbar.addEventListener('mouseenter', () => {
            toolbar.classList.add('hover-active');
        });
        
        toolbar.addEventListener('mouseleave', () => {
            toolbar.classList.remove('hover-active');
            if (!this.hoveredElement) {
                setTimeout(() => {
                    if (toolbar && !toolbar.classList.contains('hover-active')) {
                        toolbar.classList.remove('visible');
                        setTimeout(() => {
                            if (toolbar && !toolbar.classList.contains('visible') && !toolbar.classList.contains('hover-active')) {
                                toolbar.remove();
                                this.hoverToolbar = null;
                            }
                        }, 200);
                    }
                }, 100);
            }
        });
        
        return toolbar;
    }

    async handleCopy(text,tips="复制") {
        try {
            // 将文本中的连续空白字符替换为单个空格，并去除首尾空白
            const normalizedText = text.replace(/\s+/g, ' ').trim();
            await navigator.clipboard.writeText(normalizedText);
            this.showToast(`${tips}成功`);
        } catch (err) {
            console.error(`${tips}失败:`, err);
            this.showToast(`${tips}失败`);
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
        
        // 在 createAnalysisPanel 方法中添加样式
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
                to {
                    transform: rotate(360deg);
                }
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