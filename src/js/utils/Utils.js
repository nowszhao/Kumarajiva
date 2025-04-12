
/**
 * 工具函数类
 */
export class Utils {
    static parser = new DOMParser();

    static decodeHTMLEntities = (text) => {
        return Utils.parser.parseFromString(text, "text/html").body.textContent;
    };

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
        // 匹配至少三个由有效分隔符分隔的英语单词
        const englishPattern = /[a-zA-Z]+(?:[''-][a-zA-Z]+)*(?:[\s,.;!?()'":]+[a-zA-Z]+(?:[''-][a-zA-Z]+)*){2,}/;
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