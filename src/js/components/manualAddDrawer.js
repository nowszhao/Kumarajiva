import VocabularyStorage from './vocabularyStorage.js';
import { VocabularyManager } from './vocabularyManager.js';

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
            this.validateAndPreview();
        });

        // 添加聚焦和失焦事件
        jsonInput.addEventListener('focus', () => {
            this.drawer.classList.add('input-focused');
        });

        jsonInput.addEventListener('blur', () => {
            this.drawer.classList.remove('input-focused');
        });

        // 监听 Ctrl+V / Cmd+V 快捷键
        jsonInput.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
                setTimeout(() => {
                    this.validateAndPreview();
                }, 100);
            }
        });
    }

    show() {
        this.drawer.classList.add('visible');
        this.drawer.style.right = '0';
    }

    hide() {
        this.drawer.style.right = '-500px';
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

    async validateAndPreview() {
        try {
            const jsonInput = this.drawer.querySelector('.json-input').value.trim();
            
            // 如果输入为空，重置显示
            if (!jsonInput) {
                this.reset();
                return;
            }

            this.jsonData = JSON.parse(jsonInput);

            if (!this.jsonData.original || !this.jsonData.translation || !Array.isArray(this.jsonData.difficultVocabulary)) {
                throw new Error('JSON格式不正确，请检查内容');
            }

            // 显示预览区域
            const previewSection = this.drawer.querySelector('.preview-section');
            previewSection.style.display = 'flex'; // 使用flex布局

            // 更新预览内容
            this.drawer.querySelector('.original-text').textContent = this.jsonData.original;
            this.drawer.querySelector('.translation-text').textContent = this.jsonData.translation;

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
                            <div>音标：${word.phonetic}</div>
                            <div>词性：${word.part_of_speech}</div>
                            <div>释义：${word.chinese_meaning}</div>
                            <div>例句：${word.chinese_english_sentence}</div>
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
                        } else {
                            // 添加收藏
                            const wordInfo = {
                                definitions: [{
                                    meaning: wordData.chinese_meaning,
                                    pos: wordData.part_of_speech
                                }],
                                mastered: false,
                                pronunciation: {
                                    American: wordData.phonetic,
                                    British: ''
                                },
                                timestamp: new Date().getTime(),
                                word: wordData.vocabulary,
                                memory_method: wordData.chinese_english_sentence
                            };
                            
                            await VocabularyStorage.addWord(word, wordInfo);
                            e.target.classList.add('collected');
                            e.target.textContent = '取消收藏';
                        }

                        // 移除对VocabularyManager的直接使用，避免在非options页面上下文中初始化它
                        // const vocabularyManager = new VocabularyManager();
                        // await vocabularyManager.initialize();
                    } catch (error) {
                        console.error('Failed to toggle word collection:', error);
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