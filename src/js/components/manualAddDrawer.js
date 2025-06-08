import { VocabularyStorage } from './vocabularyStorage';
import { VocabularyManager } from './vocabularyManager.js';
import { WordCollector } from './wordCollector.js';

export class ManualAddDrawer {
    constructor() {
        this.currentStep = 1;
        this.jsonData = null;
        this.drawer = null;
        this.createDrawer();
    }

    createDrawer() {
        this.drawer = document.createElement('div');
        this.drawer.className = 'drawer';
        
        this.drawer.innerHTML = `
            <div class="drawer-header">
                <h2>添加生词</h2>
                <button class="drawer-close">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </div>
            <div class="drawer-content">
                <div class="input-section">
                    <div class="clipboard-suggestion" style="display: none;">
                        <div class="suggestion-content">
                            <p>检测到剪贴板中有内容，是否粘贴？</p>
                            <div class="suggestion-buttons">
                                <button class="btn btn-primary paste-btn">粘贴</button>
                                <button class="btn btn-secondary dismiss-btn">忽略</button>
                            </div>
                        </div>
                    </div>
                    <textarea class="json-input" placeholder="在此粘贴JSON内容..."></textarea>
                </div>
                <div class="preview-section">
                    <div class="text-preview-fixed">
                        <div class="text-preview-header">
                            <h3>原文 & 翻译</h3>
                        </div>
                        <div class="text-preview-content">
                            <div class="original-text"></div>
                            <div class="divider"></div>
                            <div class="translation-text"></div>
                        </div>
                    </div>
                    <div class="vocabulary-section">
                        <h3>生词列表</h3>
                        <div class="vocabulary-container">
                            <div class="vocabulary-preview"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(this.drawer);
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.drawer.querySelector('.drawer-close').addEventListener('click', () => {
            this.hide();
        });

        const jsonInput = this.drawer.querySelector('.json-input');
        
        // 监听输入框的粘贴和输入事件
        jsonInput.addEventListener('input', () => {
            this.hideClipboardSuggestion(); // 用户开始输入时隐藏剪贴板建议
            this.validateAndPreview();
        });

        // 添加聚焦和失焦事件
        jsonInput.addEventListener('focus', async () => {
            this.drawer.classList.add('input-focused');
            await this.checkClipboard();
        });

        jsonInput.addEventListener('blur', () => {
            this.drawer.classList.remove('input-focused');
        });

        // 监听 Ctrl+V / Cmd+V 快捷键和 Esc 键
        jsonInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                setTimeout(() => {
                    this.validateAndPreview();
                }, 100);
            } else if (e.key === 'Escape') {
                this.hideClipboardSuggestion();
            }
        });

        // 设置剪贴板建议按钮事件
        this.drawer.querySelector('.paste-btn').addEventListener('click', async () => {
            try {
                const clipboardText = await navigator.clipboard.readText();
                jsonInput.value = clipboardText;
                this.hideClipboardSuggestion();
                this.validateAndPreview();
            } catch (error) {
                console.error('Failed to read clipboard:', error);
            }
        });

        this.drawer.querySelector('.dismiss-btn').addEventListener('click', () => {
            this.hideClipboardSuggestion();
        });
    }

    async checkClipboard() {
        try {
            // 检查是否有剪贴板API权限
            if (!navigator.clipboard || !navigator.clipboard.readText) {
                return;
            }

            // 检查剪贴板权限
            try {
                const permissionStatus = await navigator.permissions.query({name: 'clipboard-read'});
                if (permissionStatus.state === 'denied') {
                    return;
                }
            } catch (e) {
                // 某些浏览器可能不支持 permissions API，继续尝试读取剪贴板
            }

            const clipboardText = await navigator.clipboard.readText();
            if (clipboardText && clipboardText.trim() && clipboardText.length > 10) {
                // 只在剪贴板内容看起来像是有用的内容时才显示建议
                // 简单检查是否包含可能的JSON内容
                if (clipboardText.includes('{') || clipboardText.includes('vocabulary') || clipboardText.includes('translation')) {
                    this.showClipboardSuggestion();
                }
            }
        } catch (error) {
            // 忽略权限错误和其他错误
            console.debug('Clipboard access not available or denied:', error.message);
        }
    }

    showClipboardSuggestion() {
        const suggestion = this.drawer.querySelector('.clipboard-suggestion');
        suggestion.style.display = 'block';
    }

    hideClipboardSuggestion() {
        const suggestion = this.drawer.querySelector('.clipboard-suggestion');
        suggestion.style.display = 'none';
    }

    show() {
        this.drawer.classList.add('visible');
        this.drawer.style.right = '0';
    }

    hide() {
        this.drawer.style.right = '-500px';
        this.hideClipboardSuggestion();
        setTimeout(() => {
            this.drawer.classList.remove('visible');
        }, 300);
    }

    reset() {
        this.jsonData = null;
        // 不清空输入框，让用户可以修改内容
        // this.drawer.querySelector('.json-input').value = '';
        this.drawer.querySelector('.vocabulary-preview').innerHTML = '';
        this.drawer.querySelector('.original-text').textContent = '';
        this.drawer.querySelector('.translation-text').textContent = '';
        // 隐藏预览区域
        const previewSection = this.drawer.querySelector('.preview-section');
        previewSection.style.display = 'none';
    }

    // 容错解析JSON内容
    parseInputContent(inputText) {
        const allVocabulary = [];
        let translation = '';
        let original = '';

        // 尝试多种解析策略
        const strategies = [
            // 策略1: 直接解析完整JSON
            () => {
                const data = JSON.parse(inputText);
                if (data.difficultVocabulary && Array.isArray(data.difficultVocabulary)) {
                    allVocabulary.push(...data.difficultVocabulary);
                    translation = data.translation || '';
                    original = data.original || '';
                }
            },
            
            // 策略2: 提取所有JSON对象（改进的正则表达式）
            () => {
                // 改进的正则表达式，可以更好地处理嵌套的JSON
                const jsonRegex = /\{(?:[^{}]|{[^{}]*})*\}/g;
                const matches = inputText.match(jsonRegex);
                
                if (matches) {
                    matches.forEach(match => {
                        try {
                            const data = JSON.parse(match);
                            if (data.difficultVocabulary && Array.isArray(data.difficultVocabulary)) {
                                allVocabulary.push(...data.difficultVocabulary);
                                if (data.translation) translation = data.translation;
                                if (data.original) original = data.original;
                            }
                        } catch (e) {
                            // 忽略无效的JSON片段
                            console.debug('Failed to parse JSON fragment:', match);
                        }
                    });
                }
            },
            
            // 策略3: 修复常见JSON格式错误
            () => {
                let fixedInput = inputText
                    .replace(/([{,]\s*)(\w+):/g, '$1"$2":') // 给属性名加双引号
                    .replace(/:\s*([^",\[\]{}\s]+)(?=\s*[,}])/g, ':"$1"') // 给值加双引号（除了数字和布尔值）
                    .replace(/:\s*(true|false|null|\d+\.?\d*)/g, ':$1'); // 恢复布尔值、null和数字
                
                const data = JSON.parse(fixedInput);
                if (data.difficultVocabulary && Array.isArray(data.difficultVocabulary)) {
                    allVocabulary.push(...data.difficultVocabulary);
                    if (data.translation) translation = data.translation;
                    if (data.original) original = data.original;
                }
            },
            
            // 策略4: 清理输入后再次尝试解析
            () => {
                // 移除不相关的文本，只保留可能的JSON部分
                const cleanedInput = inputText
                    .replace(/^[^{]*/, '') // 移除开头的非JSON内容
                    .replace(/[^}]*$/, '') // 移除结尾的非JSON内容
                    .replace(/}\s*[^{]*{/g, '},{'); // 连接多个JSON对象
                
                if (cleanedInput.startsWith('{') && cleanedInput.endsWith('}')) {
                    // 如果是单个对象
                    const data = JSON.parse(cleanedInput);
                    if (data.difficultVocabulary && Array.isArray(data.difficultVocabulary)) {
                        allVocabulary.push(...data.difficultVocabulary);
                        if (data.translation) translation = data.translation;
                        if (data.original) original = data.original;
                    }
                } else {
                    // 如果是数组格式，尝试包装成数组
                    const arrayInput = `[${cleanedInput}]`;
                    const dataArray = JSON.parse(arrayInput);
                    dataArray.forEach(data => {
                        if (data.difficultVocabulary && Array.isArray(data.difficultVocabulary)) {
                            allVocabulary.push(...data.difficultVocabulary);
                            if (data.translation) translation = data.translation;
                            if (data.original) original = data.original;
                        }
                    });
                }
            }
        ];

        // 依次尝试各种策略
        for (const strategy of strategies) {
            try {
                strategy();
                if (allVocabulary.length > 0) break;
            } catch (error) {
                console.debug('Strategy failed:', error.message);
                continue;
            }
        }

        // 去重合并词汇
        const uniqueVocabulary = [];
        const seenWords = new Set();
        
        allVocabulary.forEach(word => {
            if (word && word.vocabulary && !seenWords.has(word.vocabulary.toLowerCase())) {
                seenWords.add(word.vocabulary.toLowerCase());
                uniqueVocabulary.push(word);
            }
        });

        return {
            original,
            translation,
            difficultVocabulary: uniqueVocabulary
        };
    }

    async validateAndPreview() {
        try {
            const jsonInput = this.drawer.querySelector('.json-input').value.trim();
            
            // 如果输入为空，重置显示
            if (!jsonInput) {
                this.reset();
                return;
            }

            // 使用新的容错解析方法
            this.jsonData = this.parseInputContent(jsonInput);

            if (!this.jsonData.difficultVocabulary || this.jsonData.difficultVocabulary.length === 0) {
                throw new Error('未找到有效的生词数据，请检查输入格式');
            }

            // 隐藏剪贴板建议并显示预览区域
            this.hideClipboardSuggestion();
            const previewSection = this.drawer.querySelector('.preview-section');
            previewSection.style.display = 'flex'; // 使用flex布局

            // 更新预览内容
            this.drawer.querySelector('.original-text').textContent = this.jsonData.original || "暂未提供";
            this.drawer.querySelector('.translation-text').textContent = this.jsonData.translation || "暂未提供";

            // 获取已收藏的单词列表，用于显示初始状态
            const collectedWords = await VocabularyStorage.getWords();
            
            const vocabularyPreview = this.drawer.querySelector('.vocabulary-preview');
            vocabularyPreview.innerHTML = this.jsonData.difficultVocabulary.map(word => {
                const isCollected = word.vocabulary in collectedWords;
                return `
                    <div class="preview-item" data-word="${word.vocabulary}">
                        <div class="preview-item-header">
                            ${word.vocabulary}
                            <button class="collect-btn ${isCollected ? 'collected' : ''}" data-word="${word.vocabulary}">
                                ${isCollected ? '取消收藏' : '收藏'}
                            </button>
                        </div>
                        <div class="preview-item-content">
                            <div>音标：${word.phonetic || '暂无'}</div>
                            <div>词性：${word.part_of_speech || '暂无'}</div>
                            <div>释义：${word.chinese_meaning || '暂无'}</div>
                            <div>例句：${word.chinese_english_sentence || '暂无'}</div>
                        </div>
                    </div>
                `;
            }).join('');

            // 添加收藏按钮事件监听
            vocabularyPreview.querySelectorAll('.collect-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const word = e.target.dataset.word;
                    const wordData = this.jsonData.difficultVocabulary.find(w => w.vocabulary === word);
                    const isCollected = e.target.classList.contains('collected');

                    try {
                        if (isCollected) {
                            // 取消收藏
                            await VocabularyStorage.removeWord(word);
                            e.target.classList.remove('collected');
                            e.target.textContent = '收藏';
                            
                            // 移除页面中该单词的所有高亮
                            document.querySelectorAll(`.collected-word[data-word="${word.toLowerCase()}"]`)
                                .forEach((el) => {
                                    const textNode = document.createTextNode(el.textContent);
                                    el.parentNode.replaceChild(textNode, el);
                                });
                        } else {
                            // 添加收藏
                            const wordInfo = {
                                definitions: [{
                                    meaning: wordData.chinese_meaning || '',
                                    pos: wordData.part_of_speech || ''
                                }],
                                mastered: false,
                                pronunciation: {
                                    American: wordData.phonetic || '',
                                    British: ''
                                },
                                timestamp: new Date().getTime(),
                                word: wordData.vocabulary,
                                memory_method: wordData.chinese_english_sentence || ''
                            };
                            
                            await VocabularyStorage.addWord(word, wordInfo);
                            e.target.classList.add('collected');
                            e.target.textContent = '取消收藏';
                            
                            // 添加高亮更新
                            const wordCollector = new WordCollector();
                            await wordCollector.highlightCollectedWords(document.body);
                        }
                    } catch (error) {
                        console.error('Failed to update word collection:', error);
                    }
                });
            });

            // 不自动清空输入框，让用户可以修改内容
            // this.drawer.querySelector('.json-input').value = '';

        } catch (error) {
            console.error('Parse error:', error);
            this.reset();
        }
    }

    async saveVocabulary() {
        this.hide();
        // 刷新生词列表
        try {
            const vocabularyManager = new VocabularyManager();
            await vocabularyManager.initialize();
        } catch (error) {
            console.error('Failed to initialize vocabulary manager:', error);
        }
    }
} 