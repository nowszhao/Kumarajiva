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
                <h2>手动添加生词</h2>
                <button class="drawer-close">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                    </svg>
                </button>
            </div>
            <div class="drawer-content">
                <div class="step-container active" data-step="1">
                    <h3>第一步：填写生词JSON数据</h3>
                    <textarea class="json-input" placeholder="请输入JSON格式的生词数据..."></textarea>
                </div>
                <div class="step-container" data-step="2">
                    <h3>第二步：确认生词信息</h3>
                    <div class="preview-section">
                        <h3>原文</h3>
                        <div class="preview-item">
                            <div class="preview-item-content original-text"></div>
                        </div>
                        <h3>翻译</h3>
                        <div class="preview-item">
                            <div class="preview-item-content translation-text"></div>
                        </div>
                        <h3>生词列表</h3>
                        <div class="vocabulary-preview"></div>
                    </div>
                </div>
            </div>
            <div class="drawer-footer">
                <button class="btn btn-secondary" id="resetBtn">重置</button>
                <button class="btn" id="nextBtn">下一步</button>
            </div>
        `;

        document.body.appendChild(this.drawer);
        this.setupEventListeners();
    }

    setupEventListeners() {
        // 关闭按钮
        this.drawer.querySelector('.drawer-close').addEventListener('click', () => {
            this.hide();
        });

        // 重置按钮
        this.drawer.querySelector('#resetBtn').addEventListener('click', () => {
            this.reset();
        });

        // 下一步按钮
        this.drawer.querySelector('#nextBtn').addEventListener('click', () => {
            if (this.currentStep === 1) {
                this.validateAndPreview();
            } else {
                this.saveVocabulary();
            }
        });
    }

    show() {
        this.drawer.classList.add('visible');
    }

    hide() {
        this.drawer.classList.remove('visible');
        setTimeout(() => this.reset(), 300);
    }

    reset() {
        this.currentStep = 1;
        this.jsonData = null;
        this.drawer.querySelector('.json-input').value = '';
        this.updateStepDisplay();
        const nextBtn = this.drawer.querySelector('#nextBtn');
        nextBtn.textContent = '下一步';
    }

    updateStepDisplay() {
        const containers = this.drawer.querySelectorAll('.step-container');
        containers.forEach(container => {
            container.classList.remove('active');
            if (container.dataset.step == this.currentStep) {
                container.classList.add('active');
            }
        });
    }

    async validateAndPreview() {
        try {
            const jsonInput = this.drawer.querySelector('.json-input').value;
            this.jsonData = JSON.parse(jsonInput);

            // 验证必要字段
            if (!this.jsonData.original || !this.jsonData.translation || !Array.isArray(this.jsonData.difficultVocabulary)) {
                throw new Error('JSON格式不正确，请检查必要字段');
            }

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

                        // 实时刷新生词列表
                        const vocabularyManager = new VocabularyManager();
                        await vocabularyManager.initialize();
                    } catch (error) {
                        console.error('Failed to toggle word collection:', error);
                        alert('操作失败：' + error.message);
                    }
                });
            });

            // 进入第二步
            this.currentStep = 2;
            this.updateStepDisplay();
            const nextBtn = this.drawer.querySelector('#nextBtn');
            nextBtn.textContent = '完成';

        } catch (error) {
            alert('验证失败：' + error.message);
        }
    }

    async saveVocabulary() {
        this.hide();
        // 刷新生词列表
        const vocabularyManager = new VocabularyManager();
        await vocabularyManager.initialize();
    }
} 