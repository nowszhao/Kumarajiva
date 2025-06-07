export class StudyCard {
    constructor(githubAuth) {
        this.githubAuth = githubAuth;
        this.cardElement = null;
        this.currentWord = null;
        this.currentMode = null;
        this.onResult = null;
        this.modes = ['definition', 'fillBlank', 'multipleChoice'];
    }

    async initialize() {
        this.createCardElement();
        console.log('Study Card initialized');
    }

    createCardElement() {
        // 创建卡片容器
        this.cardElement = document.createElement('div');
        this.cardElement.className = 'study-card-overlay hidden';
        this.cardElement.innerHTML = `
            <div class="study-card">
                <div class="card-header">
                    <h3>单词学习</h3>
                    <button class="close-btn">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
                <div class="card-content">
                    <!-- 动态内容区域 -->
                </div>
                <div class="card-footer">
                    <div class="progress-indicator">
                        <div class="progress-bar"></div>
                    </div>
                </div>
            </div>
        `;

        // 添加事件监听
        this.addEventListeners();
        
        // 添加样式
        this.addStyles();
        
        // 添加到页面
        document.body.appendChild(this.cardElement);
    }

    addEventListeners() {
        // 关闭按钮
        const closeBtn = this.cardElement.querySelector('.close-btn');
        closeBtn.addEventListener('click', () => this.hide());
        
        // 点击遮罩层关闭
        this.cardElement.addEventListener('click', (e) => {
            if (e.target === this.cardElement) {
                this.hide();
            }
        });
        
        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    async show(word, onResultCallback) {
        this.currentWord = word;
        this.onResult = onResultCallback;
        
        // 随机选择学习模式
        this.currentMode = this.modes[Math.floor(Math.random() * this.modes.length)];
        
        // 根据模式生成内容
        await this.generateContent();
        
        // 显示卡片
        this.cardElement.classList.remove('hidden');
        
        // 聚焦输入框（如果有）
        setTimeout(() => {
            const input = this.cardElement.querySelector('input');
            if (input) {
                input.focus();
            }
        }, 300);
    }

    hide() {
        this.cardElement.classList.add('hidden');
        this.currentWord = null;
        this.currentMode = null;
        this.onResult = null;
    }

    isVisible() {
        return !this.cardElement.classList.contains('hidden');
    }

    async generateContent() {
        const content = this.cardElement.querySelector('.card-content');
        
        switch (this.currentMode) {
            case 'definition':
                content.innerHTML = this.generateDefinitionMode();
                break;
            case 'fillBlank':
                content.innerHTML = this.generateFillBlankMode();
                break;
            case 'multipleChoice':
                content.innerHTML = await this.generateMultipleChoiceMode();
                break;
        }
        
        this.addModeEventListeners();
    }

    generateDefinitionMode() {
        const definition = this.currentWord.definitions[0]?.meaning || '暂无释义';
        
        return `
            <div class="study-mode definition-mode">
                <div class="mode-title">根据释义输入单词</div>
                <div class="word-definition">${definition}</div>
                <div class="pronunciation">${this.currentWord.pronunciation?.American || ''}</div>
                <div class="input-container">
                    <input type="text" class="word-input" placeholder="请输入单词..." autocomplete="off">
                    <button class="submit-btn">提交</button>
                </div>
                <div class="hint">提示：忽略大小写</div>
            </div>
        `;
    }

    generateFillBlankMode() {
        let memoryMethod = this.currentWord.memory_method || '';
        const word = this.currentWord.word;
        
        // 从记忆方法中提取中文例句
        let sentence = '';
        const chineseMatch = memoryMethod.match(/[^(（]*[。！？]/);
        if (chineseMatch) {
            sentence = chineseMatch[0];
        } else {
            // 如果没有找到中文句子，使用整个memory_method
            sentence = memoryMethod;
        }
        
        // 将单词替换为空白
        const blankSentence = sentence.replace(new RegExp(word, 'gi'), '_____');
        
        return `
            <div class="study-mode fillblank-mode">
                <div class="mode-title">根据例句填空</div>
                <div class="sentence-container">
                    <div class="sentence">${blankSentence}</div>
                </div>
                <div class="input-container">
                    <input type="text" class="word-input" placeholder="请填入单词..." autocomplete="off">
                    <button class="submit-btn">提交</button>
                </div>
                <div class="hint">提示：忽略大小写</div>
            </div>
        `;
    }

    async generateMultipleChoiceMode() {
        try {
            // 调用quiz接口获取选择题
            const response = await fetch(this.githubAuth.getApiUrl('review/quiz'), {
                method: 'POST',
                headers: this.githubAuth.getAuthHeaders(),
                body: JSON.stringify({ word: this.currentWord.word })
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data) {
                    const quizData = result.data;
                    const options = quizData.options || [];
                    
                    return `
                        <div class="study-mode multiplechoice-mode">
                            <div class="mode-title">选择正确的释义</div>
                            <div class="word-display">
                                <div class="word-text">${quizData.word}</div>
                                <div class="phonetic">${quizData.phonetic || ''}</div>
                            </div>
                            <div class="options-container">
                                ${options.map((option, index) => `
                                    <div class="option" data-index="${index}">
                                        <div class="option-letter">${String.fromCharCode(65 + index)}</div>
                                        <div class="option-text">${option.definition}</div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('Failed to generate quiz:', error);
        }
        
        // 如果API调用失败，回退到简单的选择题
        return this.generateSimpleMultipleChoice();
    }

    generateSimpleMultipleChoice() {
        const correctAnswer = this.currentWord.definitions[0]?.meaning || '暂无释义';
        
        // 创建一些假的选项（实际应用中可以从词库中随机选择）
        const fakeOptions = [
            '错误选项A',
            '错误选项B', 
            '错误选项C'
        ];
        
        const allOptions = [correctAnswer, ...fakeOptions];
        // 随机打乱选项
        const shuffledOptions = allOptions.sort(() => Math.random() - 0.5);
        
        return `
            <div class="study-mode multiplechoice-mode">
                <div class="mode-title">选择正确的释义</div>
                <div class="word-display">
                    <div class="word-text">${this.currentWord.word}</div>
                    <div class="phonetic">${this.currentWord.pronunciation?.American || ''}</div>
                </div>
                <div class="options-container">
                    ${shuffledOptions.map((option, index) => `
                        <div class="option" data-answer="${option === correctAnswer}">
                            <div class="option-letter">${String.fromCharCode(65 + index)}</div>
                            <div class="option-text">${option}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    addModeEventListeners() {
        switch (this.currentMode) {
            case 'definition':
            case 'fillBlank':
                this.addInputModeListeners();
                break;
            case 'multipleChoice':
                this.addMultipleChoiceListeners();
                break;
        }
    }

    addInputModeListeners() {
        const input = this.cardElement.querySelector('.word-input');
        const submitBtn = this.cardElement.querySelector('.submit-btn');
        
        const handleSubmit = () => {
            const userAnswer = input.value.trim();
            if (userAnswer) {
                this.checkInputAnswer(userAnswer);
            }
        };
        
        submitBtn.addEventListener('click', handleSubmit);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSubmit();
            }
        });
    }

    addMultipleChoiceListeners() {
        const options = this.cardElement.querySelectorAll('.option');
        
        options.forEach(option => {
            option.addEventListener('click', () => {
                // 移除其他选项的选中状态
                options.forEach(opt => opt.classList.remove('selected'));
                // 添加当前选项的选中状态
                option.classList.add('selected');
                
                // 延迟检查答案，让用户看到选择效果
                setTimeout(() => {
                    this.checkMultipleChoiceAnswer(option);
                }, 500);
            });
        });
    }

    checkInputAnswer(userAnswer) {
        const correctWord = this.currentWord.word.toLowerCase();
        const isCorrect = userAnswer.toLowerCase() === correctWord;
        
        this.showResult(isCorrect, correctWord);
    }

    checkMultipleChoiceAnswer(selectedOption) {
        const isCorrect = selectedOption.dataset.answer === 'true' || 
                         selectedOption.dataset.index === '0'; // 如果使用API数据，正确答案通常是第一个
        
        const correctAnswer = this.currentWord.definitions[0]?.meaning || '正确答案';
        this.showResult(isCorrect, correctAnswer);
    }

    showResult(isCorrect, correctAnswer) {
        const content = this.cardElement.querySelector('.card-content');
        
        const resultHTML = `
            <div class="result-display ${isCorrect ? 'correct' : 'incorrect'}">
                <div class="result-icon">
                    ${isCorrect ? 
                        '<svg viewBox="0 0 24 24" width="48" height="48"><path fill="#10b981" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>' :
                        '<svg viewBox="0 0 24 24" width="48" height="48"><path fill="#ef4444" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
                    }
                </div>
                <div class="result-text">
                    ${isCorrect ? '回答正确！' : '回答错误'}
                </div>
                ${!isCorrect ? `
                    <div class="correct-answer">
                        <div class="correct-label">正确答案：</div>
                        <div class="correct-value">${correctAnswer}</div>
                    </div>
                ` : ''}
                <div class="word-details">
                    <div class="word-name">${this.currentWord.word}</div>
                    <div class="word-pronunciation">${this.currentWord.pronunciation?.American || ''}</div>
                    <div class="word-meaning">${this.currentWord.definitions[0]?.meaning || ''}</div>
                </div>
                <button class="continue-btn">${isCorrect ? '继续学习' : '再试一次'}</button>
            </div>
        `;
        
        content.innerHTML = resultHTML;
        
        // 添加继续按钮事件
        const continueBtn = content.querySelector('.continue-btn');
        continueBtn.addEventListener('click', () => {
            if (this.onResult) {
                this.onResult(isCorrect);
            }
            this.hide();
        });
    }

    addStyles() {
        if (document.getElementById('study-card-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'study-card-styles';
        style.textContent = `
            .study-card-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(8px);
                z-index: 1000001;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 1;
                transition: opacity 0.3s ease;
            }

            .study-card-overlay.hidden {
                opacity: 0;
                pointer-events: none;
            }

            .study-card {
                background: white;
                border-radius: 20px;
                width: 90%;
                max-width: 500px;
                max-height: 80vh;
                overflow: hidden;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
                transform: scale(1);
                transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                font-family: system-ui, -apple-system, sans-serif;
            }

            .study-card-overlay.hidden .study-card {
                transform: scale(0.9);
            }

            .card-header {
                padding: 24px 24px 16px;
                border-bottom: 1px solid #f1f5f9;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .card-header h3 {
                margin: 0;
                font-size: 20px;
                font-weight: 600;
                color: #1e293b;
            }

            .close-btn {
                background: none;
                border: none;
                padding: 8px;
                cursor: pointer;
                color: #64748b;
                border-radius: 8px;
                transition: all 0.2s;
            }

            .close-btn:hover {
                background: #f1f5f9;
                color: #1e293b;
            }

            .card-content {
                padding: 24px;
                min-height: 200px;
            }

            .card-footer {
                padding: 16px 24px;
                border-top: 1px solid #f1f5f9;
            }

            .progress-indicator {
                height: 4px;
                background: #f1f5f9;
                border-radius: 2px;
                overflow: hidden;
            }

            .progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #667eea, #764ba2);
                width: 33.33%;
                border-radius: 2px;
                transition: width 0.3s ease;
            }

            /* 学习模式样式 */
            .study-mode {
                text-align: center;
            }

            .mode-title {
                font-size: 18px;
                font-weight: 600;
                color: #1e293b;
                margin-bottom: 24px;
            }

            .word-definition {
                font-size: 20px;
                color: #334155;
                margin-bottom: 16px;
                padding: 20px;
                background: linear-gradient(135deg, #f8fafc, #f1f5f9);
                border-radius: 12px;
                border-left: 4px solid #667eea;
            }

            .pronunciation {
                font-size: 16px;
                color: #64748b;
                margin-bottom: 24px;
                font-style: italic;
            }

            .word-display {
                margin-bottom: 24px;
            }

            .word-text {
                font-size: 28px;
                font-weight: 700;
                color: #1e293b;
                margin-bottom: 8px;
            }

            .phonetic {
                font-size: 16px;
                color: #64748b;
                font-style: italic;
            }

            .sentence-container {
                margin-bottom: 24px;
            }

            .sentence {
                font-size: 18px;
                line-height: 1.6;
                color: #334155;
                padding: 20px;
                background: linear-gradient(135deg, #f8fafc, #f1f5f9);
                border-radius: 12px;
                border-left: 4px solid #10b981;
            }

            .input-container {
                display: flex;
                gap: 12px;
                margin-bottom: 16px;
            }

            .word-input {
                flex: 1;
                padding: 14px 18px;
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                font-size: 16px;
                transition: border-color 0.2s;
                outline: none;
            }

            .word-input:focus {
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }

            .submit-btn {
                padding: 14px 24px;
                background: linear-gradient(135deg, #667eea, #764ba2);
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            }

            .submit-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
            }

            .hint {
                font-size: 14px;
                color: #64748b;
            }

            /* 选择题样式 */
            .options-container {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .option {
                display: flex;
                align-items: center;
                padding: 16px;
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                cursor: pointer;
                transition: all 0.2s;
                background: white;
            }

            .option:hover {
                border-color: #667eea;
                background: #f8fafc;
            }

            .option.selected {
                border-color: #667eea;
                background: linear-gradient(135deg, #f8fafc, #e0e7ff);
            }

            .option-letter {
                width: 32px;
                height: 32px;
                background: #667eea;
                color: white;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 600;
                margin-right: 16px;
                flex-shrink: 0;
            }

            .option-text {
                font-size: 16px;
                color: #334155;
                line-height: 1.5;
            }

            /* 结果显示样式 */
            .result-display {
                text-align: center;
                padding: 24px;
            }

            .result-icon {
                margin-bottom: 16px;
            }

            .result-text {
                font-size: 24px;
                font-weight: 600;
                margin-bottom: 20px;
            }

            .result-display.correct .result-text {
                color: #10b981;
            }

            .result-display.incorrect .result-text {
                color: #ef4444;
            }

            .correct-answer {
                background: #fef2f2;
                border: 1px solid #fecaca;
                border-radius: 12px;
                padding: 16px;
                margin-bottom: 24px;
            }

            .correct-label {
                font-size: 14px;
                color: #991b1b;
                margin-bottom: 8px;
                font-weight: 500;
            }

            .correct-value {
                font-size: 18px;
                color: #dc2626;
                font-weight: 600;
            }

            .word-details {
                background: linear-gradient(135deg, #f8fafc, #f1f5f9);
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 24px;
            }

            .word-name {
                font-size: 22px;
                font-weight: 700;
                color: #1e293b;
                margin-bottom: 4px;
            }

            .word-pronunciation {
                font-size: 14px;
                color: #64748b;
                font-style: italic;
                margin-bottom: 8px;
            }

            .word-meaning {
                font-size: 16px;
                color: #334155;
                line-height: 1.5;
            }

            .continue-btn {
                padding: 14px 32px;
                background: linear-gradient(135deg, #10b981, #059669);
                color: white;
                border: none;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
            }

            .continue-btn:hover {
                transform: translateY(-1px);
                box-shadow: 0 8px 25px rgba(16, 185, 129, 0.3);
            }

            /* 响应式设计 */
            @media (max-width: 768px) {
                .study-card {
                    width: 95%;
                    margin: 20px;
                }
                
                .card-content {
                    padding: 20px;
                }
                
                .word-text {
                    font-size: 24px;
                }
                
                .word-definition {
                    font-size: 18px;
                    padding: 16px;
                }
                
                .input-container {
                    flex-direction: column;
                }
            }

            /* 深色模式支持 */
            @media (prefers-color-scheme: dark) {
                .study-card {
                    background: #1e293b;
                    color: #f1f5f9;
                }
                
                .card-header {
                    border-bottom-color: #334155;
                }
                
                .card-header h3 {
                    color: #f1f5f9;
                }
                
                .close-btn {
                    color: #94a3b8;
                }
                
                .close-btn:hover {
                    background: #334155;
                    color: #f1f5f9;
                }
                
                .word-definition,
                .sentence,
                .word-details {
                    background: linear-gradient(135deg, #334155, #475569);
                    color: #f1f5f9;
                }
                
                .option {
                    border-color: #475569;
                    background: #334155;
                    color: #f1f5f9;
                }
                
                .option:hover {
                    border-color: #667eea;
                    background: #475569;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    destroy() {
        if (this.cardElement) {
            this.cardElement.remove();
        }
        
        // 移除样式
        const style = document.getElementById('study-card-styles');
        if (style) {
            style.remove();
        }
    }
} 