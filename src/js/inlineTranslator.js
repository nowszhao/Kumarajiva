// 防止全局变量污染

import { TranslatorFactory } from './translators';
import config from './config/config';

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
    function createTranslationElement(text) {
        const container = document.createElement('div');
        container.className = 'inline-translation-result';
        container.textContent = text;
        return container;
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
                const result = await translator.translate("翻译为准确且地道的中文：" + text);
                return result;
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
    function initializeInlineTranslator() {
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

        // 监听 Ctrl 键
        document.addEventListener('keydown', (e) => {
            console.log("initializeInlineTranslator-keydown-e:", e);
            if (e.key === 'Control' && !isCtrlPressed) {
                console.log("initializeInlineTranslator-keydown-e.key:", e.key);
                isCtrlPressed = true;
                if (hoveredElement) {
                    console.log("initializeInlineTranslator-keydown-hoveredElement:", hoveredElement);
                    handleTranslation(hoveredElement);
                }
            }
        });

        document.addEventListener('keyup', (e) => {
            if (e.key === 'Control') {
                isCtrlPressed = false;
                if (hoveredElement) {
                    // removeTranslation(hoveredElement);
                    hoveredElement = null;
                }
            }
        });
    }

    // 初始化
    initializeInlineTranslator();
})(); 