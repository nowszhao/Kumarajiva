// 简单的学习精灵加载器 - 避免CSP问题
(function() {
    'use strict';
    
    console.log('[SimpleElfLoader] Starting Simple Learning Elf Loader...');
    
    // 检查环境
    if (typeof chrome === 'undefined' || !chrome.runtime) {
        console.log('[SimpleElfLoader] Not in extension environment, skipping');
        return;
    }
    
    let isInitialized = false;
    let retryCount = 0;
    const maxRetries = 3;
    
    async function initialize() {
        if (isInitialized) {
            console.log('[SimpleElfLoader] Already initialized');
            return;
        }
        
        console.log('[SimpleElfLoader] Initializing Simple Learning Elf...');
        
        try {
            // 等待DOM完全加载
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }
            
            await createSimpleLearningElf();
            
            console.log('[SimpleElfLoader] Simple Learning Elf initialized successfully!');
            isInitialized = true;
            
        } catch (error) {
            console.error('[SimpleElfLoader] Failed to initialize Learning Elf:', error);
            
            if (retryCount < maxRetries) {
                retryCount++;
                console.log(`[SimpleElfLoader] Retrying initialization (${retryCount}/${maxRetries})...`);
                setTimeout(() => initialize(), 2000 * retryCount);
            }
        }
    }
    
    async function createSimpleLearningElf() {
        // 创建简化版的学习精灵
        const elfContainer = document.createElement('div');
        elfContainer.className = 'simple-learning-elf';
        elfContainer.style.cssText = `
            position: fixed;
            top: 50%;
            right: 20px;
            width: 30px;
            height: 30px;
            z-index: 1000000;
            user-select: none;
            pointer-events: auto;
            cursor: pointer;
            border-radius: 50%;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 4px;
            box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            justify-content: center;
            transform: translateY(-50%);
        `;
        
        // 创建精灵图标
        const elfIcon = document.createElement('img');
        elfIcon.src = chrome.runtime.getURL('icons/elf.png');
        elfIcon.style.cssText = `
            width: 22px;
            height: 22px;
            border-radius: 50%;
            object-fit: cover;
            background: white;
        `;
        
        elfIcon.onerror = function() {
            // 如果图片加载失败，使用文字替代
            elfContainer.innerHTML = `
                <div style="
                    width: 22px;
                    height: 22px;
                    border-radius: 50%;
                    background: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 14px;
                    color: #667eea;
                ">🧚‍♀️</div>
            `;
        };
        
        elfContainer.appendChild(elfIcon);
        
        // 创建状态徽章（默认隐藏，只有在有提醒时才显示）
        const badge = document.createElement('div');
        badge.className = 'elf-badge hidden';
        badge.style.cssText = `
            position: absolute;
            top: -3px;
            right: -3px;
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
            color: white;
            border-radius: 50%;
            width: 16px;
            height: 16px;
            display: none;
            align-items: center;
            justify-content: center;
            font-size: 10px;
            font-weight: 600;
            box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
            opacity: 0;
            transform: scale(0);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        `;
        elfContainer.appendChild(badge);
        
        // 添加到页面
        document.body.appendChild(elfContainer);
        
        // 添加点击事件
        elfContainer.addEventListener('click', handleElfClick);
        
        // 添加hover事件控制工具栏显示/隐藏
        addHoverToolbarEvents(elfContainer);
        
        // 添加拖拽功能
        addDragFunctionality(elfContainer);
        
        // 恢复位置
        await restorePosition(elfContainer);
        
        // 开始学习功能
        await startLearningFeatures(elfContainer, badge);
        
        // 存储实例
        window.simpleLearningElf = {
            element: elfContainer,
            badge: badge,
            destroy: function() {
                if (elfContainer && elfContainer.parentNode) {
                    elfContainer.parentNode.removeChild(elfContainer);
                }
            }
        };
    }
    
    async function handleElfClick() {
        console.log('[SimpleElfLoader] Elf clicked!');
        
        // 只触发学习测试，工具栏由hover事件控制
        await showSimpleStudyPrompt();
    }
    
    async function showSimpleStudyPrompt() {
        try {
            // 获取认证信息
            const authData = await chrome.storage.sync.get(['githubAccessToken', 'githubUserInfo']);
            
            if (!authData.githubAccessToken || !authData.githubUserInfo) {
                alert('需要先登录GitHub账户才能使用学习功能。请在插件设置中登录。');
                return;
            }
            
            // 获取今日单词列表以选择测验单词
            const words = await getTodayWords();
            
            if (!words || words.length === 0) {
                alert('今日暂无学习单词，请稍后再试。');
                return;
            }
            
            // 在开始学习前，更新徽章数字确保显示最新状态
            const pendingWords = words.filter(w => !w.mastered);
            console.log('[SimpleElfLoader] 📖 开始学习前状态检查:', {
                总单词数: words.length,
                待学习数: pendingWords.length,
                已掌握数: words.length - pendingWords.length
            });
            
            if (pendingWords.length === 0) {
                alert('🎉 恭喜！今日所有单词都已掌握完成！');
                return;
            }
            
            // 从待学习单词中随机选择一个进行测验
            const randomWord = pendingWords[Math.floor(Math.random() * pendingWords.length)];
            const quiz = await getStudyQuiz(randomWord.word);
            
            if (!quiz) {
                alert('暂时无法获取学习内容，请稍后再试。');
                return;
            }
            
            // 随机选择学习模式
            // const quizTypes = ['choice', 'spelling', 'fillBlank'];
            const quizTypes = ['spelling', 'fillBlank'];
            const randomQuizType = quizTypes[Math.floor(Math.random() * quizTypes.length)];
            
            console.log(`[SimpleElfLoader] 🎯 选择学习模式: ${randomQuizType} (单词: ${randomWord.word})`);
            console.log(`[SimpleElfLoader] 📊 Quiz数据:`, quiz);
            console.log(`[SimpleElfLoader] 📝 单词数据:`, randomWord);
            
            // 显示对应的测验UI
            await showQuizModal(quiz, randomWord, randomQuizType);
        } catch (error) {
            console.error('[SimpleElfLoader] Study prompt error:', error);
            alert('学习功能出现错误，请稍后再试。');
        }
    }
    
    async function getStudyQuiz(word) {
        try {
            // 获取认证信息
            const authData = await chrome.storage.sync.get(['githubAccessToken', 'githubUserInfo']);
            
            if (!authData.githubAccessToken || !authData.githubUserInfo) {
                return null;
            }
            
            // 通过background.js发送请求（避免Mixed Content问题）
            const response = await chrome.runtime.sendMessage({
                type: 'LEARNING_ELF_GET_QUIZ',
                token: authData.githubAccessToken,
                word: word
            });
            
            if (response.success) {
                // API返回的格式: { success: true, data: {...} }
                return response.data.data || null;
            } else {
                console.log('[SimpleElfLoader] Quiz API request failed:', response.error);
                return null;
            }
        } catch (error) {
            console.log('[SimpleElfLoader] Failed to fetch quiz:', error);
            return null;
        }
    }

    // 创建多模式学习测验弹框
    async function showQuizModal(quiz, wordData, quizType) {
        return new Promise((resolve) => {
            // 创建遮罩层
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                backdrop-filter: blur(10px);
                z-index: 1000001;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            `;

                         // 创建弹框容器
             const modal = document.createElement('div');
             modal.style.cssText = `
                 background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                 border-radius: 20px;
                 padding: 2px;
                 box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
                 max-width: 600px;
                 width: 95%;
                 max-height: 85vh;
                 overflow-y: auto;
                 transform: scale(0.8) translateY(20px);
                 transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
             `;

                         // 创建内容区域
             const content = document.createElement('div');
             content.style.cssText = `
                 background: #ffffff;
                 border-radius: 18px;
                 padding: 24px;
                 text-align: center;
                 font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
             `;

            // 根据测验类型创建不同的内容
            const quizContent = createQuizContent(quiz, wordData, quizType);
            
            // 组装弹框内容
            Object.keys(quizContent.elements).forEach(key => {
                content.appendChild(quizContent.elements[key]);
            });
            
            // 设置测验逻辑
            quizContent.setupQuizLogic(overlay, quiz, wordData);

            // 关闭按钮
            const closeButton = document.createElement('button');
            closeButton.innerHTML = '✕';
            closeButton.style.cssText = `
                position: absolute;
                top: 16px;
                right: 16px;
                width: 32px;
                height: 32px;
                border: none;
                background: rgba(0, 0, 0, 0.1);
                color: #718096;
                border-radius: 50%;
                cursor: pointer;
                font-size: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            `;

            closeButton.addEventListener('click', () => {
                closeModal(overlay, resolve);
            });

            closeButton.addEventListener('mouseenter', () => {
                closeButton.style.background = 'rgba(0, 0, 0, 0.2)';
            });

            closeButton.addEventListener('mouseleave', () => {
                closeButton.style.background = 'rgba(0, 0, 0, 0.1)';
            });

            // 组装弹框
            modal.appendChild(content);
            modal.appendChild(closeButton);
            overlay.appendChild(modal);
            document.body.appendChild(overlay);

            // 显示动画
            requestAnimationFrame(() => {
                overlay.style.opacity = '1';
                modal.style.transform = 'scale(1) translateY(0)';
            });

            // 点击遮罩层关闭
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    closeModal(overlay, resolve);
                }
            });

            // ESC键关闭
            const handleEsc = (e) => {
                if (e.key === 'Escape') {
                    closeModal(overlay, resolve);
                    document.removeEventListener('keydown', handleEsc);
                }
            };
            document.addEventListener('keydown', handleEsc);
        });
    }

    // 创建不同类型的测验内容
    function createQuizContent(quiz, wordData, quizType) {
        switch (quizType) {
            case 'choice':
                return createChoiceQuiz(quiz, wordData);
            case 'spelling':
                return createSpellingQuiz(quiz, wordData);
            case 'fillBlank':
                return createFillBlankQuiz(quiz, wordData);
            default:
                return createChoiceQuiz(quiz, wordData);
        }
    }

    // 选择题模式
    function createChoiceQuiz(quiz, wordData) {
        const elements = {};

        // 标题
        elements.title = document.createElement('div');
        elements.title.innerHTML = '🧚‍♀️ 选择题模式';
        elements.title.style.cssText = `
            font-size: 20px;
            font-weight: 700;
            color: #2d3748;
            margin-bottom: 20px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        `;

        // 单词信息
        elements.wordInfo = document.createElement('div');
        elements.wordInfo.style.cssText = `
            margin-bottom: 24px;
            padding: 16px;
            background: linear-gradient(135deg, #f7fafc, #edf2f7);
            border-radius: 12px;
            border-left: 4px solid #667eea;
        `;

        const wordText = document.createElement('div');
        wordText.textContent = quiz.word;
        wordText.style.cssText = `
            font-size: 24px;
            font-weight: 700;
            color: #2d3748;
            margin-bottom: 6px;
        `;

        const phoneticText = document.createElement('div');
        phoneticText.textContent = quiz.phonetic || '';
        phoneticText.style.cssText = `
            font-size: 14px;
            color: #718096;
            font-style: italic;
        `;

        elements.wordInfo.appendChild(wordText);
        elements.wordInfo.appendChild(phoneticText);

        // 题目描述
        elements.questionText = document.createElement('div');
        elements.questionText.textContent = '选择正确的定义：';
        elements.questionText.style.cssText = `
            font-size: 16px;
            font-weight: 600;
            color: #4a5568;
            margin-bottom: 16px;
        `;

        // 选项容器
        elements.optionsContainer = document.createElement('div');
        elements.optionsContainer.style.cssText = `
            margin-bottom: 24px;
        `;

        const setupQuizLogic = (overlay, quiz, wordData) => {
            const correctIndex = quiz.options.findIndex(opt => opt.definition === quiz.correct_answer);

            quiz.options.forEach((option, index) => {
                const optionButton = document.createElement('button');
                optionButton.textContent = `${index + 1}. ${option.definition}`;
                optionButton.style.cssText = `
                    display: block;
                    width: 100%;
                    padding: 12px 16px;
                    margin-bottom: 8px;
                    background: #f7fafc;
                    border: 2px solid #e2e8f0;
                    border-radius: 10px;
                    color: #2d3748;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    text-align: left;
                    line-height: 1.4;
                    word-wrap: break-word;
                    white-space: normal;
                `;

                optionButton.addEventListener('mouseenter', () => {
                    optionButton.style.transform = 'translateY(-2px)';
                    optionButton.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.15)';
                    optionButton.style.borderColor = '#667eea';
                });

                optionButton.addEventListener('mouseleave', () => {
                    optionButton.style.transform = 'translateY(0)';
                    optionButton.style.boxShadow = 'none';
                    optionButton.style.borderColor = '#e2e8f0';
                });

                optionButton.addEventListener('click', () => {
                    const allButtons = elements.optionsContainer.querySelectorAll('button');
                    allButtons.forEach(btn => {
                        btn.style.pointerEvents = 'none';
                        btn.style.opacity = '0.6';
                    });

                    if (index === correctIndex) {
                        optionButton.style.background = 'linear-gradient(135deg, #48bb78, #38a169)';
                        optionButton.style.color = 'white';
                        optionButton.style.borderColor = '#48bb78';
                        showResult(true, quiz, wordData, overlay);
                    } else {
                        optionButton.style.background = 'linear-gradient(135deg, #f56565, #e53e3e)';
                        optionButton.style.color = 'white';
                        optionButton.style.borderColor = '#f56565';
                        
                        allButtons[correctIndex].style.background = 'linear-gradient(135deg, #48bb78, #38a169)';
                        allButtons[correctIndex].style.color = 'white';
                        allButtons[correctIndex].style.borderColor = '#48bb78';
                        
                        showResult(false, quiz, wordData, overlay);
                    }
                });

                elements.optionsContainer.appendChild(optionButton);
            });
        };

        return { elements, setupQuizLogic };
    }

    // 拼写题模式
    function createSpellingQuiz(quiz, wordData) {
        const elements = {};

        // 标题
        elements.title = document.createElement('div');
        elements.title.innerHTML = '✏️ 拼写模式';
        elements.title.style.cssText = `
            font-size: 20px;
            font-weight: 700;
            color: #2d3748;
            margin-bottom: 20px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        `;

        // 释义信息
        elements.meaningInfo = document.createElement('div');
        elements.meaningInfo.style.cssText = `
            margin-bottom: 24px;
            padding: 16px;
            background: linear-gradient(135deg, #f7fafc, #edf2f7);
            border-radius: 12px;
            border-left: 4px solid #f6ad55;
        `;

        const meaningText = document.createElement('div');
        const meaning = quiz.definitions?.[0]?.meaning || quiz.correct_answer;
        meaningText.textContent = meaning;
        meaningText.style.cssText = `
            font-size: 18px;
            font-weight: 600;
            color: #2d3748;
            margin-bottom: 6px;
        `;

        const phoneticHint = document.createElement('div');
        phoneticHint.textContent = quiz.phonetic ? `发音: ${quiz.phonetic}` : '';
        phoneticHint.style.cssText = `
            font-size: 14px;
            color: #718096;
            font-style: italic;
        `;

        elements.meaningInfo.appendChild(meaningText);
        if (quiz.phonetic) {
            elements.meaningInfo.appendChild(phoneticHint);
        }

        // 题目描述
        elements.questionText = document.createElement('div');
        elements.questionText.textContent = '请输入对应的英文单词：';
        elements.questionText.style.cssText = `
            font-size: 16px;
            font-weight: 600;
            color: #4a5568;
            margin-bottom: 16px;
        `;

        // 输入框容器
        elements.inputContainer = document.createElement('div');
        elements.inputContainer.style.cssText = `
            margin-bottom: 24px;
        `;

        const inputField = document.createElement('input');
        inputField.type = 'text';
        inputField.placeholder = '输入英文单词...';
        inputField.style.cssText = `
            width: 100%;
            padding: 16px;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 500;
            text-align: center;
            background: #f7fafc;
            color: #2d3748;
            outline: none;
            transition: all 0.2s ease;
            box-sizing: border-box;
        `;

        inputField.addEventListener('focus', () => {
            inputField.style.borderColor = '#667eea';
            inputField.style.background = '#ffffff';
        });

        inputField.addEventListener('blur', () => {
            inputField.style.borderColor = '#e2e8f0';
            inputField.style.background = '#f7fafc';
        });

        const submitButton = document.createElement('button');
        submitButton.textContent = '提交答案';
        submitButton.style.cssText = `
            width: 100%;
            padding: 12px 24px;
            margin-top: 12px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            border: none;
            border-radius: 10px;
            color: white;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            opacity: 0.7;
        `;

        elements.inputContainer.appendChild(inputField);
        elements.inputContainer.appendChild(submitButton);

        const setupQuizLogic = (overlay, quiz, wordData) => {
            let answered = false;

            const checkAnswer = () => {
                if (answered) return;
                answered = true;

                const userAnswer = inputField.value.trim().toLowerCase();
                const correctAnswer = quiz.word.toLowerCase();
                const isCorrect = userAnswer === correctAnswer;

                inputField.disabled = true;
                submitButton.disabled = true;
                submitButton.style.opacity = '0.5';

                if (isCorrect) {
                    inputField.style.background = 'linear-gradient(135deg, #c6f6d5, #9ae6b4)';
                    inputField.style.borderColor = '#48bb78';
                    inputField.style.color = '#2d3748';
                    showResult(true, quiz, wordData, overlay);
                } else {
                    inputField.style.background = 'linear-gradient(135deg, #fed7d7, #fc8181)';
                    inputField.style.borderColor = '#f56565';
                    inputField.value = `${userAnswer} → ${quiz.word}`;
                    inputField.style.color = '#2d3748';
                    showResult(false, quiz, wordData, overlay);
                }
            };

            // 输入时启用按钮
            inputField.addEventListener('input', () => {
                if (inputField.value.trim()) {
                    submitButton.style.opacity = '1';
                    submitButton.style.cursor = 'pointer';
                } else {
                    submitButton.style.opacity = '0.7';
                    submitButton.style.cursor = 'not-allowed';
                }
            });

            // 回车提交
            inputField.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && inputField.value.trim()) {
                    checkAnswer();
                }
            });

            // 点击提交
            submitButton.addEventListener('click', () => {
                if (inputField.value.trim()) {
                    checkAnswer();
                }
            });

            // 自动聚焦
            setTimeout(() => inputField.focus(), 500);
        };

        return { elements, setupQuizLogic };
    }

    // 填空题模式
    function createFillBlankQuiz(quiz, wordData) {
        const elements = {};

        // 标题
        elements.title = document.createElement('div');
        elements.title.innerHTML = '📝 填空模式';
        elements.title.style.cssText = `
            font-size: 20px;
            font-weight: 700;
            color: #2d3748;
            margin-bottom: 20px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        `;

        // 从memory_method获取例句
        const { sentence, hint } = parseMemoryMethod(quiz.memory_method, quiz.word);
        
        // 句子信息
        elements.sentenceInfo = document.createElement('div');
        elements.sentenceInfo.style.cssText = `
            margin-bottom: 24px;
            padding: 16px;
            background: linear-gradient(135deg, #f7fafc, #edf2f7);
            border-radius: 12px;
            border-left: 4px solid #805ad5;
        `;

        const sentenceText = document.createElement('div');
        sentenceText.innerHTML = sentence;
        sentenceText.style.cssText = `
            font-size: 18px;
            line-height: 1.6;
            color: #2d3748;
            margin-bottom: 8px;
        `;

        const hintText = document.createElement('div');
        hintText.textContent = `提示: ${hint}`;
        hintText.style.cssText = `
            font-size: 14px;
            color: #718096;
            font-style: italic;
        `;

        elements.sentenceInfo.appendChild(sentenceText);
        elements.sentenceInfo.appendChild(hintText);

        // 题目描述
        elements.questionText = document.createElement('div');
        elements.questionText.textContent = '请填入正确的单词：';
        elements.questionText.style.cssText = `
            font-size: 16px;
            font-weight: 600;
            color: #4a5568;
            margin-bottom: 16px;
        `;

        // 输入框容器
        elements.inputContainer = document.createElement('div');
        elements.inputContainer.style.cssText = `
            margin-bottom: 24px;
        `;

        const inputField = document.createElement('input');
        inputField.type = 'text';
        inputField.placeholder = '填入单词...';
        inputField.style.cssText = `
            width: 100%;
            padding: 16px;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            font-size: 18px;
            font-weight: 500;
            text-align: center;
            background: #f7fafc;
            color: #2d3748;
            outline: none;
            transition: all 0.2s ease;
            box-sizing: border-box;
        `;

        inputField.addEventListener('focus', () => {
            inputField.style.borderColor = '#805ad5';
            inputField.style.background = '#ffffff';
        });

        const submitButton = document.createElement('button');
        submitButton.textContent = '提交答案';
        submitButton.style.cssText = `
            width: 100%;
            padding: 12px 24px;
            margin-top: 12px;
            background: linear-gradient(135deg, #805ad5, #9f7aea);
            border: none;
            border-radius: 10px;
            color: white;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            opacity: 0.7;
        `;

        elements.inputContainer.appendChild(inputField);
        elements.inputContainer.appendChild(submitButton);

        const setupQuizLogic = (overlay, quiz, wordData) => {
            let answered = false;

            const checkAnswer = () => {
                if (answered) return;
                answered = true;

                const userAnswer = inputField.value.trim().toLowerCase();
                const correctAnswer = quiz.word.toLowerCase();
                const isCorrect = userAnswer === correctAnswer;

                inputField.disabled = true;
                submitButton.disabled = true;
                submitButton.style.opacity = '0.5';

                if (isCorrect) {
                    inputField.style.background = 'linear-gradient(135deg, #c6f6d5, #9ae6b4)';
                    inputField.style.borderColor = '#48bb78';
                    showResult(true, quiz, wordData, overlay);
                } else {
                    inputField.style.background = 'linear-gradient(135deg, #fed7d7, #fc8181)';
                    inputField.style.borderColor = '#f56565';
                    inputField.value = `${userAnswer} → ${quiz.word}`;
                    showResult(false, quiz, wordData, overlay);
                }
            };

            inputField.addEventListener('input', () => {
                if (inputField.value.trim()) {
                    submitButton.style.opacity = '1';
                } else {
                    submitButton.style.opacity = '0.7';
                }
            });

            inputField.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && inputField.value.trim()) {
                    checkAnswer();
                }
            });

            submitButton.addEventListener('click', () => {
                if (inputField.value.trim()) {
                    checkAnswer();
                }
            });

            setTimeout(() => inputField.focus(), 500);
        };

        return { elements, setupQuizLogic };
    }

    // 解析memory_method生成填空题
    function parseMemoryMethod(memoryMethod, targetWord) {
        if (!memoryMethod) {
            // 如果没有memory_method，使用默认模板
            return generateDefaultSentence(targetWord);
        }

        try {
            // 提取中文句子（括号前的部分）
            const chineseMatch = memoryMethod.match(/^([^（(]+)/);
            let chineseSentence = chineseMatch ? chineseMatch[1].trim() : '';
            
            // 提取英文句子（括号内的部分）
            const englishMatch = memoryMethod.match(/[（(]([^）)]+)[）)]/);
            let englishSentence = englishMatch ? englishMatch[1].trim() : '';

            // 优先使用中文句子进行填空
            let baseSentence = chineseSentence || englishSentence;
            let hintSentence = englishSentence || '参考英文句子';
            
            if (!baseSentence) {
                return generateDefaultSentence(targetWord);
            }

            // 将目标单词替换为填空
            const wordRegex = new RegExp(`\\b${targetWord}\\b`, 'gi');
            let fillBlankSentence = baseSentence.replace(wordRegex, 
                '<span style="background: linear-gradient(135deg, #fed7e2, #fbb6ce); padding: 2px 8px; border-radius: 6px; font-weight: 600;">______</span>'
            );

            // 如果替换后没有变化，说明句子中没有目标单词，尝试其他形式
            if (fillBlankSentence === baseSentence) {
                // 尝试查找单词的复数、过去式等形式
                const variations = [
                    targetWord + 's',
                    targetWord + 'es', 
                    targetWord + 'ed',
                    targetWord + 'ing'
                ];
                
                let found = false;
                for (const variation of variations) {
                    const variationRegex = new RegExp(`\\b${variation}\\b`, 'gi');
                    if (baseSentence.match(variationRegex)) {
                        fillBlankSentence = baseSentence.replace(variationRegex, 
                            '<span style="background: linear-gradient(135deg, #fed7e2, #fbb6ce); padding: 2px 8px; border-radius: 6px; font-weight: 600;">______</span>'
                        );
                        found = true;
                        break;
                    }
                }
                
                // 如果都没找到，在句子中添加填空占位符
                if (!found) {
                    // 尝试查找可能的插入位置
                    if (baseSentence.includes('的')) {
                        fillBlankSentence = baseSentence.replace(/的([^的]*?)/, '的<span style="background: linear-gradient(135deg, #fed7e2, #fbb6ce); padding: 2px 8px; border-radius: 6px; font-weight: 600;">______</span>$1');
                    } else {
                        fillBlankSentence = '<span style="background: linear-gradient(135deg, #fed7e2, #fbb6ce); padding: 2px 8px; border-radius: 6px; font-weight: 600;">______</span> ' + baseSentence;
                    }
                }
            }

            // 从提示句子中移除答案
            let cleanHint = hintSentence;
            if (cleanHint) {
                cleanHint = cleanHint.replace(new RegExp(`\\b${targetWord}\\b`, 'gi'), '___');
                // 也移除可能的变形
                const variations = [targetWord + 's', targetWord + 'es', targetWord + 'ed', targetWord + 'ing'];
                variations.forEach(variation => {
                    cleanHint = cleanHint.replace(new RegExp(`\\b${variation}\\b`, 'gi'), '___');
                });
            }

            return {
                sentence: fillBlankSentence,
                hint: cleanHint || '填入正确的单词'
            };

        } catch (error) {
            console.error('解析memory_method失败:', error);
            return generateDefaultSentence(targetWord);
        }
    }

    // 生成默认例句（备用）
    function generateDefaultSentence(word) {
        return {
            sentence: `Please fill in the correct word: <span style="background: linear-gradient(135deg, #fed7e2, #fbb6ce); padding: 2px 8px; border-radius: 6px; font-weight: 600;">______</span>`,
            hint: '填入正确的单词'
        };
    }



    // 显示结果
    function showResult(isCorrect, quiz, wordData, overlay) {
        setTimeout(() => {
            const resultContainer = document.createElement('div');
            resultContainer.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                color: #2d3748;
                padding: 0;
                border-radius: 16px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
                z-index: 1000002;
                max-width: 480px;
                width: 92%;
                max-height: 80vh;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.9);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                overflow: hidden;
            `;

            // 创建内容容器（可滚动）
            const contentContainer = document.createElement('div');
            contentContainer.style.cssText = `
                max-height: 80vh;
                overflow-y: auto;
                scrollbar-width: none;
                -ms-overflow-style: none;
            `;
            
            // 隐藏滚动条
            const scrollbarStyle = document.createElement('style');
            scrollbarStyle.textContent = `
                .result-content::-webkit-scrollbar { display: none; }
            `;
            contentContainer.className = 'result-content';
            document.head.appendChild(scrollbarStyle);

            // 创建结果头部
            const resultHeader = document.createElement('div');
            resultHeader.style.cssText = `
                background: ${isCorrect ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #EF4444, #DC2626)'};
                color: white;
                padding: 16px 20px;
                text-align: center;
                position: relative;
            `;

            const resultIcon = document.createElement('div');
            resultIcon.style.cssText = `
                font-size: 36px;
                margin-bottom: 6px;
            `;
            resultIcon.textContent = isCorrect ? '🎉' : '😅';

            const resultText = document.createElement('div');
            resultText.style.cssText = `
                font-size: 18px;
                font-weight: 700;
                margin-bottom: 4px;
            `;
            resultText.textContent = isCorrect ? '恭喜答对了！' : '答错了，没关系继续加油！';

            const encourageText = document.createElement('div');
            encourageText.style.cssText = `
                font-size: 13px;
                opacity: 0.9;
            `;
            encourageText.textContent = isCorrect ? '继续保持这种学习状态！' : '通过错误学习是进步的好方法！';

            resultHeader.appendChild(resultIcon);
            resultHeader.appendChild(resultText);
            resultHeader.appendChild(encourageText);

            // 单词主体信息
            const wordMainInfo = document.createElement('div');
            wordMainInfo.style.cssText = `
                text-align: center;
                padding: 20px;
                background: linear-gradient(135deg, #F8FAFC, #F1F5F9);
                border-bottom: 1px solid #E2E8F0;
            `;

            const wordTitle = document.createElement('div');
            wordTitle.textContent = quiz.word;
            wordTitle.style.cssText = `
                font-size: 28px;
                font-weight: 800;
                color: #1E293B;
                margin-bottom: 6px;
                letter-spacing: 0.5px;
            `;

            const phoneticInfo = document.createElement('div');
            phoneticInfo.textContent = quiz.phonetic || '/音标信息暂无/';
            phoneticInfo.style.cssText = `
                font-size: 14px;
                color: #64748B;
                font-style: italic;
            `;

            wordMainInfo.appendChild(wordTitle);
            wordMainInfo.appendChild(phoneticInfo);

            // 创建内容区域
            const wordDetailSection = document.createElement('div');
            wordDetailSection.style.cssText = `
                padding: 16px 20px 20px;
                background: white;
            `;

            // 释义信息
            const definitionsSection = document.createElement('div');
            definitionsSection.style.cssText = `
                margin-bottom: 16px;
            `;

            const definitionsTitle = document.createElement('div');
            definitionsTitle.innerHTML = '📖 词义解释';
            definitionsTitle.style.cssText = `
                font-size: 15px;
                font-weight: 600;
                color: #374151;
                margin-bottom: 10px;
                display: flex;
                align-items: center;
                gap: 6px;
            `;

            definitionsSection.appendChild(definitionsTitle);

            // 显示释义（只显示前2个以节省空间）
            if (quiz.definitions && quiz.definitions.length > 0) {
                const displayDefs = quiz.definitions.slice(0, 2); // 最多显示2个释义
                displayDefs.forEach((def, index) => {
                    const defItem = document.createElement('div');
                    defItem.style.cssText = `
                        padding: 8px 12px;
                        margin-bottom: 6px;
                        background: #F8FAFC;
                        border-radius: 6px;
                        border-left: 3px solid #3B82F6;
                        display: flex;
                        align-items: flex-start;
                        gap: 8px;
                    `;

                    const defPos = document.createElement('span');
                    defPos.textContent = def.pos || 'n.';
                    defPos.style.cssText = `
                        background: #3B82F6;
                        color: white;
                        padding: 1px 6px;
                        border-radius: 3px;
                        font-size: 10px;
                        font-weight: 600;
                        flex-shrink: 0;
                        margin-top: 2px;
                    `;

                    const defMeaning = document.createElement('span');
                    defMeaning.textContent = def.meaning || def.definition || '释义信息暂无';
                    defMeaning.style.cssText = `
                        font-size: 13px;
                        color: #374151;
                        line-height: 1.4;
                        flex: 1;
                    `;

                    defItem.appendChild(defPos);
                    defItem.appendChild(defMeaning);
                    definitionsSection.appendChild(defItem);
                });
                
                if (quiz.definitions.length > 2) {
                    const moreText = document.createElement('div');
                    moreText.textContent = `+${quiz.definitions.length - 2} 个更多释义`;
                    moreText.style.cssText = `
                        font-size: 11px;
                        color: #6B7280;
                        text-align: center;
                        font-style: italic;
                        margin-top: 4px;
                    `;
                    definitionsSection.appendChild(moreText);
                }
            } else {
                // 使用correct_answer作为释义
                const defItem = document.createElement('div');
                defItem.style.cssText = `
                    padding: 8px 12px;
                    background: #F8FAFC;
                    border-radius: 6px;
                    border-left: 3px solid #3B82F6;
                    font-size: 13px;
                    color: #374151;
                `;
                defItem.textContent = quiz.correct_answer || '释义信息暂无';
                definitionsSection.appendChild(defItem);
            }

            // 记忆方法/例句信息（简化显示）
            if (quiz.memory_method) {
                const memorySection = document.createElement('div');
                memorySection.style.cssText = `
                    margin-bottom: 16px;
                `;

                const memoryTitle = document.createElement('div');
                memoryTitle.innerHTML = '💡 记忆方法 & 例句';
                memoryTitle.style.cssText = `
                    font-size: 15px;
                    font-weight: 600;
                    color: #374151;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                `;

                const memoryContent = document.createElement('div');
                // 限制内容长度以避免过长
                const limitedContent = quiz.memory_method.length > 150 
                    ? quiz.memory_method.substring(0, 150) + '...' 
                    : quiz.memory_method;
                    
                memoryContent.style.cssText = `
                    padding: 10px 12px;
                    background: linear-gradient(135deg, #FEF3F2, #FDE8E8);
                    border-radius: 6px;
                    border-left: 3px solid #F87171;
                    line-height: 1.4;
                    font-size: 12px;
                    color: #374151;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                `;
                memoryContent.textContent = limitedContent;

                memorySection.appendChild(memoryTitle);
                memorySection.appendChild(memoryContent);
                wordDetailSection.appendChild(memorySection);
            }

            // 操作按钮容器
            const buttonContainer = document.createElement('div');
            buttonContainer.style.cssText = `
                display: flex;
                gap: 8px;
                margin-top: 4px;
            `;

            // 下一题按钮
            const nextButton = document.createElement('button');
            nextButton.innerHTML = '🔄 下一题';
            nextButton.style.cssText = `
                flex: 1;
                padding: 12px 16px;
                background: linear-gradient(135deg, #10B981, #059669);
                border: none;
                border-radius: 8px;
                color: white;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
            `;

            nextButton.addEventListener('mouseenter', () => {
                nextButton.style.transform = 'translateY(-1px)';
                nextButton.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.3)';
            });

            nextButton.addEventListener('mouseleave', () => {
                nextButton.style.transform = 'translateY(0)';
                nextButton.style.boxShadow = 'none';
            });

            nextButton.addEventListener('click', async () => {
                // 如果答对了，在本地更新徽章数字
                if (isCorrect) {
                    console.log(`[SimpleElfLoader] 🎯 用户答对了单词 "${quiz.word}"，本地更新徽章数字`);
                    updateBadgeAfterLearning(true); // 传递true表示答对了，需要减少徽章数字
                }
                
                resultContainer.style.opacity = '0';
                resultContainer.style.transform = 'translate(-50%, -50%) scale(0.9)';
                setTimeout(() => {
                    if (resultContainer.parentNode) {
                        resultContainer.parentNode.removeChild(resultContainer);
                    }
                    if (scrollbarStyle.parentNode) {
                        scrollbarStyle.parentNode.removeChild(scrollbarStyle);
                    }
                    closeModal(overlay);
                    
                    // 延迟一下再开始下一题，让动画完成
                    setTimeout(() => {
                        showSimpleStudyPrompt();
                    }, 500);
                }, 300);
            });

            // 先退下按钮  
            const exitButton = document.createElement('button');
            exitButton.innerHTML = '👋 先退下';
            exitButton.style.cssText = `
                flex: 1;
                padding: 12px 16px;
                background: linear-gradient(135deg, #6B7280, #4B5563);
                border: none;
                border-radius: 8px;
                color: white;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 4px;
            `;

            exitButton.addEventListener('mouseenter', () => {
                exitButton.style.transform = 'translateY(-1px)';
                exitButton.style.boxShadow = '0 4px 12px rgba(107, 114, 128, 0.3)';
            });

            exitButton.addEventListener('mouseleave', () => {
                exitButton.style.transform = 'translateY(0)';
                exitButton.style.boxShadow = 'none';
            });

            exitButton.addEventListener('click', async () => {
                // 如果答对了，在本地更新徽章数字
                if (isCorrect) {
                    console.log(`[SimpleElfLoader] 🎯 用户答对了单词 "${quiz.word}"，本地更新徽章数字`);
                    updateBadgeAfterLearning(true); // 传递true表示答对了，需要减少徽章数字
                }
                
                resultContainer.style.opacity = '0';
                resultContainer.style.transform = 'translate(-50%, -50%) scale(0.9)';
                setTimeout(() => {
                    if (resultContainer.parentNode) {
                        resultContainer.parentNode.removeChild(resultContainer);
                    }
                    if (scrollbarStyle.parentNode) {
                        scrollbarStyle.parentNode.removeChild(scrollbarStyle);
                    }
                    closeModal(overlay);
                }, 300);
            });

            // 组装按钮
            buttonContainer.appendChild(nextButton);
            buttonContainer.appendChild(exitButton);

            // 组装所有内容
            wordDetailSection.appendChild(definitionsSection);
            wordDetailSection.appendChild(buttonContainer);

            contentContainer.appendChild(resultHeader);
            contentContainer.appendChild(wordMainInfo);
            contentContainer.appendChild(wordDetailSection);
            
            resultContainer.appendChild(contentContainer);
            document.body.appendChild(resultContainer);

            // 显示动画
            requestAnimationFrame(() => {
                resultContainer.style.opacity = '1';
                resultContainer.style.transform = 'translate(-50%, -50%) scale(1)';
            });

            // ESC键关闭（触发"先退下"）
            const handleEsc = (e) => {
                if (e.key === 'Escape') {
                    exitButton.click();
                    document.removeEventListener('keydown', handleEsc);
                } else if (e.key === 'Enter') {
                    // Enter键触发"下一题"
                    nextButton.click();
                    document.removeEventListener('keydown', handleEsc);
                }
            };
            document.addEventListener('keydown', handleEsc);

        }, 1000);
    }

    // 关闭弹框
    function closeModal(overlay, resolve) {
        overlay.style.opacity = '0';
        const modal = overlay.querySelector('div');
        if (modal) {
            modal.style.transform = 'scale(0.8) translateY(20px)';
        }
        
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
            if (resolve) resolve();
        }, 300);
    }

    // 学习完成后更新徽章
    async function updateBadgeAfterLearning(isCorrectAnswer = false) {
        try {
            console.log('[SimpleElfLoader] 🔄 学习完成，更新徽章数字...');
            
            // 获取学习精灵元素
            const elfElement = document.querySelector('.simple-learning-elf');
            if (!elfElement) {
                console.log('[SimpleElfLoader] ❌ 学习精灵元素未找到，无法更新徽章');
                return;
            }
            
            const badge = elfElement.querySelector('.elf-badge');
            if (!badge) {
                console.log('[SimpleElfLoader] ❌ 徽章元素未找到，无法更新');
                return;
            }
            
            // 如果答对了，直接在本地减少徽章数字
            if (isCorrectAnswer) {
                const currentCount = parseInt(badge.getAttribute('data-word-count') || badge.textContent || '0');
                const newCount = Math.max(0, currentCount - 1);
                
                console.log('[SimpleElfLoader] 📊 本地更新徽章数字:', {
                    当前数字: currentCount,
                    更新后数字: newCount,
                    答对状态: '正确答案'
                });
                
                badge.setAttribute('data-word-count', newCount);
                
                if (newCount > 0) {
                    // 更新显示的数字
                    badge.textContent = newCount;
                    console.log(`[SimpleElfLoader] ✅ 徽章已更新 - 新的待学习单词数: ${newCount}`);
                } else {
                    // 没有待学习单词了，隐藏徽章
                    badge.style.display = 'none';
                    badge.style.opacity = '0';
                    badge.classList.add('hidden');
                    console.log('[SimpleElfLoader] 🎉 恭喜！所有单词都已掌握，徽章已隐藏');
                }
            } else {
                // 如果不是答对的情况，可能是初始化或刷新，重新获取数据
                const words = await getTodayWords();
                
                if (words && words.length > 0) {
                    // 计算待学习单词数量
                    const pendingWords = words.filter(w => !w.mastered);
                    
                    console.log('[SimpleElfLoader] 📊 刷新后单词状态:', {
                        总单词数: words.length,
                        待学习数: pendingWords.length,
                        已掌握数: words.length - pendingWords.length,
                        更新后徽章数字: Math.min(pendingWords.length, 99)
                    });
                    
                    const newCount = Math.min(pendingWords.length, 99);
                    badge.setAttribute('data-word-count', newCount);
                    
                    if (newCount > 0) {
                        badge.textContent = newCount;
                        badge.style.display = '';
                        badge.style.opacity = '1';
                        badge.classList.remove('hidden');
                        console.log(`[SimpleElfLoader] ✅ 徽章已刷新 - 待学习单词数: ${newCount}`);
                    } else {
                        badge.style.display = 'none';
                        badge.style.opacity = '0';
                        badge.classList.add('hidden');
                        console.log('[SimpleElfLoader] 🎉 恭喜！所有单词都已掌握，徽章已隐藏');
                    }
                } else {
                    console.log('[SimpleElfLoader] ℹ️ 无法获取今日单词状态');
                }
            }
        } catch (error) {
            console.error('[SimpleElfLoader] 更新徽章失败:', error);
        }
    }

    // 添加hover事件控制工具栏显示/隐藏
    function addHoverToolbarEvents(elfContainer) {
        let hoverTimeout;
        let isToolbarVisible = false;
        let isMouseOverElfOrToolbar = false;

        // 鼠标进入精灵
        elfContainer.addEventListener('mouseenter', () => {
            console.log('[SimpleElfLoader] Mouse enter elf');
            clearTimeout(hoverTimeout);
            isMouseOverElfOrToolbar = true;
            
            if (!isToolbarVisible) {
                showToolbar();
                isToolbarVisible = true;
                
                // 为工具栏添加hover事件监听
                setTimeout(() => {
                    const toolbar = document.querySelector('.translation-toolbar');
                    if (toolbar) {
                        addToolbarHoverEvents(toolbar);
                    }
                }, 100);
            }
        });

        // 鼠标离开精灵
        elfContainer.addEventListener('mouseleave', () => {
            console.log('[SimpleElfLoader] Mouse leave elf');
            isMouseOverElfOrToolbar = false;
            
            // 延迟检查，给用户时间移动到工具栏
            hoverTimeout = setTimeout(() => {
                if (!isMouseOverElfOrToolbar) {
                    hideToolbar();
                    isToolbarVisible = false;
                }
            }, 300);
        });

        // 为工具栏添加hover事件
        function addToolbarHoverEvents(toolbar) {
            if (toolbar._hoverEventsAdded) return; // 避免重复添加
            toolbar._hoverEventsAdded = true;
            
            toolbar.addEventListener('mouseenter', () => {
                console.log('[SimpleElfLoader] Mouse enter toolbar');
                clearTimeout(hoverTimeout);
                isMouseOverElfOrToolbar = true;
            });

            toolbar.addEventListener('mouseleave', () => {
                console.log('[SimpleElfLoader] Mouse leave toolbar');
                isMouseOverElfOrToolbar = false;
                
                hoverTimeout = setTimeout(() => {
                    if (!isMouseOverElfOrToolbar) {
                        hideToolbar();
                        isToolbarVisible = false;
                    }
                }, 300);
            });
        }

        function showToolbar() {
            console.log('[SimpleElfLoader] Showing toolbar');
            
            // 直接创建并显示工具栏
            let toolbar = document.querySelector('.translation-toolbar');
            if (!toolbar) {
                toolbar = createTranslationToolbar();
            }
            
            if (toolbar) {
                toolbar.style.display = 'flex';
                toolbar.style.opacity = '1';
                toolbar.style.transform = 'translateY(0) scale(1)';
                // 确保宽度保持固定
                toolbar.style.width = '30px';
                console.log('[SimpleElfLoader] Toolbar shown');
            }
        }

        function hideToolbar() {
            console.log('[SimpleElfLoader] Hiding toolbar');
            
            const toolbar = document.querySelector('.translation-toolbar');
            if (toolbar) {
                toolbar.style.opacity = '0';
                toolbar.style.transform = 'translateY(-10px) scale(0.9)';
                setTimeout(() => {
                    if (toolbar && !isMouseOverElfOrToolbar) {
                        toolbar.style.display = 'none';
                    }
                }, 200);
                console.log('[SimpleElfLoader] Toolbar hidden');
            }
        }
    }
    
    function addDragFunctionality(element) {
        let isDragging = false;
        let startX, startY, currentX, currentY;
        
        element.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            
            isDragging = true;
            startX = e.clientX - element.offsetLeft;
            startY = e.clientY - element.offsetTop;
            
            element.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            
            currentX = e.clientX - startX;
            currentY = e.clientY - startY;
            
            // 限制在窗口范围内
            currentX = Math.max(0, Math.min(window.innerWidth - element.offsetWidth, currentX));
            currentY = Math.max(0, Math.min(window.innerHeight - element.offsetHeight, currentY));
            
            element.style.left = currentX + 'px';
            element.style.top = currentY + 'px';
            element.style.right = 'auto';
            element.style.transform = 'none';
            
            // 更新工具栏位置
            updateToolbarPosition(currentX, currentY);
            
            e.preventDefault();
        });
        
        document.addEventListener('mouseup', function() {
            if (isDragging) {
                isDragging = false;
                element.style.cursor = 'pointer';
                
                // 保存位置
                savePosition(currentX, currentY);
            }
        });
    }
    
    // 更新工具栏位置
    function updateToolbarPosition(elfX, elfY) {
        const toolbar = document.querySelector('.translation-toolbar');
        if (toolbar) {
            // 确保工具栏不会超出屏幕左边界
            const toolbarLeft = Math.max(10, elfX + 9); // 精灵右侧
            // 确保工具栏不会超出屏幕右边界
            const maxLeft = window.innerWidth - 58; // 工具栏宽度48px + 10px边距
            const finalLeft = Math.min(toolbarLeft, maxLeft);
            
            toolbar.style.left = `${finalLeft}px`;
            toolbar.style.top = `${elfY + 35}px`;
            // 强制保持固定宽度
            toolbar.style.width = '48px';
        }
    }
    
    async function restorePosition(element) {
        try {
            const result = await chrome.storage.local.get('elfPosition');
            if (result.elfPosition) {
                const pos = result.elfPosition;
                element.style.left = pos.x + 'px';
                element.style.top = pos.y + 'px';
                element.style.right = 'auto';
                element.style.transform = 'none';
            }
        } catch (error) {
            console.log('[SimpleElfLoader] Failed to restore position:', error);
        }
    }
    
    async function savePosition(x, y) {
        try {
            await chrome.storage.local.set({
                elfPosition: { x, y }
            });
        } catch (error) {
            console.log('[SimpleElfLoader] Failed to save position:', error);
        }
    }
    
    async function startLearningFeatures(element, badge) {
        try {
            // 检查认证状态
            const authData = await chrome.storage.sync.get(['githubAccessToken', 'githubUserInfo']);
            
            if (!authData.githubAccessToken || !authData.githubUserInfo) {
                console.log('[SimpleElfLoader] No authentication found, learning features disabled');
                return;
            }
            
            // 获取今日单词数量，但不立即显示徽章
            const words = await getTodayWords();
            
            if (words && words.length > 0) {
                // 计算待学习单词数量（未掌握的单词）
                const pendingWords = words.filter(w => !w.mastered);
                // 存储待学习单词数量，但徽章保持隐藏
                badge.setAttribute('data-word-count', Math.min(pendingWords.length, 99));
                
                console.log(`[SimpleElfLoader] 🎯 学习功能初始化完成:`, {
                    总单词数: words.length,
                    待学习数: pendingWords.length,
                    已掌握数: words.filter(w => w.mastered).length,
                    徽章显示数字: Math.min(pendingWords.length, 99)
                });
                
                // 显示前几个单词的信息
                const preview = words.slice(0, 3);
                console.log(`[SimpleElfLoader] 📚 单词预览 (前3个):`, preview.map(w => ({
                    单词: w.word,
                    释义: w.definitions?.[0]?.meaning || '无释义',
                    掌握状态: w.mastered ? '已掌握' : '待学习'
                })));
                
                // 从background.js获取提醒状态
                await initializeReminders(element);
                
                console.log(`[SimpleElfLoader] ⏰ 提醒系统已启动`);
            } else {
                console.log('[SimpleElfLoader] ℹ️ 今日无学习单词');
            }
        } catch (error) {
            console.log('[SimpleElfLoader] Failed to start learning features:', error);
        }
    }
    
    async function getTodayWords() {
        try {
            // 从存储中获取GitHub认证信息
            const authData = await chrome.storage.sync.get(['githubAccessToken', 'githubUserInfo']);
            
            if (!authData.githubAccessToken || !authData.githubUserInfo) {
                console.log('[SimpleElfLoader] No GitHub authentication found');
                return [];
            }
            
            // 通过background.js发送请求（避免Mixed Content问题）
            const response = await chrome.runtime.sendMessage({
                type: 'LEARNING_ELF_GET_TODAY_WORDS',
                token: authData.githubAccessToken
            });
            
            if (response.success) {
                // API返回的格式: { success: true, data: [...] }
                return response.data.data || [];
            } else {
                console.log('[SimpleElfLoader] API request failed:', response.error);
                return [];
            }
        } catch (error) {
            console.log('[SimpleElfLoader] Failed to fetch today words:', error);
        }
        
                return [];
    }
    
    // 初始化提醒系统 - 从background.js获取提醒状态
    async function initializeReminders(element) {
        try {
            console.log('[SimpleElfLoader] 🚀 开始初始化提醒系统');
            
            // 获取background.js中的提醒状态
            const response = await chrome.runtime.sendMessage({
                type: 'GET_REMINDER_STATUS'
            });
            
            console.log('[SimpleElfLoader] 📬 提醒状态响应:', response);
            
            if (response.success) {
                console.log(`[SimpleElfLoader] 📅 下次学习提醒时间: ${response.data.timeString} (${response.data.remainingMinutes}分钟后)`);
            } else {
                console.log('[SimpleElfLoader] 获取提醒状态失败，background.js将自动生成新的提醒时间');
            }
            
            // 监听来自background.js的提醒消息
            if (!chrome.runtime.onMessage.hasListener(handleBackgroundMessage)) {
                chrome.runtime.onMessage.addListener(handleBackgroundMessage);
                console.log('[SimpleElfLoader] ✅ 已注册消息监听器');
            } else {
                console.log('[SimpleElfLoader] ℹ️ 消息监听器已存在');
            }
            
            // 添加测试功能 - 点击学习精灵时长按可以立即测试提醒
            element.addEventListener('contextmenu', async (e) => {
                e.preventDefault();
                console.log('[SimpleElfLoader] 🧪 右键点击，发送测试提醒请求');
                try {
                    const testResponse = await chrome.runtime.sendMessage({
                        type: 'TEST_REMINDER_NOW'
                    });
                    console.log('[SimpleElfLoader] 🧪 测试提醒响应:', testResponse);
                } catch (error) {
                    console.error('[SimpleElfLoader] 测试提醒失败:', error);
                }
            });
            
        } catch (error) {
            console.error('[SimpleElfLoader] 初始化提醒系统失败:', error);
        }
    }
    
    // 处理来自background.js的消息
    function handleBackgroundMessage(message, sender, sendResponse) {
        console.log('[SimpleElfLoader] 📨 收到来自background.js的消息:', message);
        
        if (message.type === 'LEARNING_ELF_REMINDER') {
            console.log('[SimpleElfLoader] 🔔 收到来自background.js的提醒');
            console.log('[SimpleElfLoader] 📄 页面可见性状态:', document.visibilityState);
            
            // 检查用户是否在活动状态
            if (document.visibilityState === 'visible') {
                const element = document.querySelector('.simple-learning-elf');
                console.log('[SimpleElfLoader] 🧚‍♀️ 学习精灵元素:', element ? '找到' : '未找到');
                if (element) {
                    handleReminderTrigger(element);
                } else {
                    console.log('[SimpleElfLoader] ❌ 学习精灵元素未找到，无法显示提醒');
                }
            } else {
                console.log('[SimpleElfLoader] ℹ️ 页面不可见，跳过提醒显示');
            }
        }
    }
    
    // 处理提醒触发
    async function handleReminderTrigger(element) {
        const currentTime = new Date().toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        
        console.log(`[SimpleElfLoader] 🔔 ${currentTime} - 触发学习提醒`);
        
        // 获取最新的单词信息
        const words = await getTodayWords();
        const pendingWords = words.filter(w => !w.mastered);
        
        console.log(`[SimpleElfLoader] 📊 学习状态统计:`, {
            总单词数: words.length,
            待学习数: pendingWords.length,
            已掌握数: words.length - pendingWords.length
        });
        
        if (pendingWords.length > 0) {
            // 更新徽章数字为最新的待学习单词数
            const badge = element.querySelector('.elf-badge');
            if (badge) {
                badge.setAttribute('data-word-count', Math.min(pendingWords.length, 99));
            }
            
            // 随机选择一个待学习单词显示信息
            const randomWord = pendingWords[Math.floor(Math.random() * pendingWords.length)];
            console.log(`[SimpleElfLoader] 🎯 推荐学习单词:`, {
                单词: randomWord.word,
                释义: randomWord.definitions?.[0]?.meaning || '无释义',
                词性: randomWord.definitions?.[0]?.pos || '无词性',
                记忆方法: randomWord.memory_method || '无记忆方法',
                复习次数: randomWord.review_count || 0,
                正确次数: randomWord.correct_count || 0
            });
            
            // 触发提醒UI
            triggerReminder(element);
        } else {
            console.log(`[SimpleElfLoader] ℹ️ 无待学习单词，跳过提醒显示`);
        }
    }

    // 触发提醒UI显示（仅负责UI显示逻辑）
    function triggerReminder(element) {
        // 显示徽章
        const badge = element.querySelector('.elf-badge');
        if (badge) {
            const wordCount = badge.getAttribute('data-word-count');
            const count = parseInt(wordCount);
            
            if (wordCount && count > 0) {
                badge.textContent = count;
                badge.style.display = 'flex';
                badge.style.opacity = '1';
                badge.style.transform = 'scale(1)';
                badge.classList.remove('hidden');
                
                console.log(`[SimpleElfLoader] ✅ 徽章已显示 - 待学习单词数: ${count}`);
                
                // 添加摇摆动画
                element.style.animation = 'shake 0.5s infinite';
                console.log(`[SimpleElfLoader] 🎭 开始摇摆动画 (持续3秒)`);
                
                setTimeout(() => {
                    element.style.animation = '';
                    console.log(`[SimpleElfLoader] 🎭 摇摆动画结束`);
                }, 3000);
            } else {
                console.log(`[SimpleElfLoader] ℹ️ 无待学习单词 (${count})，跳过徽章显示`);
                // 隐藏徽章
                badge.style.display = 'none';
                badge.style.opacity = '0';
                badge.classList.add('hidden');
            }
        }
    }

    // 页面加载完成后初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initialize, 1000);
        });
    } else {
        setTimeout(initialize, 1000);
    }
    
    // 监听页面卸载，清理资源
    window.addEventListener('beforeunload', () => {
        if (window.simpleLearningElf) {
            window.simpleLearningElf.destroy();
        }
    });
    
    console.log('[SimpleElfLoader] Simple Learning Elf Loader initialized');
    
    // 创建翻译工具栏
    function createTranslationToolbar() {
        console.log('[SimpleElfLoader] Creating translation toolbar');
        
        // 移除已存在的工具栏
        const existingToolbar = document.querySelector('.translation-toolbar');
        if (existingToolbar) {
            existingToolbar.remove();
        }
        
        // 获取学习精灵的位置
        const elfElement = document.querySelector('.simple-learning-elf');
        if (!elfElement) {
            console.error('[SimpleElfLoader] Elf element not found');
            return null;
        }
        
        const elfRect = elfElement.getBoundingClientRect();
        const elfLeft = parseInt(elfElement.style.left) || elfRect.left;
        const elfTop = parseInt(elfElement.style.top) || elfRect.top;
        
        // 计算工具栏位置，确保不会超出屏幕边界
        const toolbarLeft = Math.max(10, elfLeft + 9); // 精灵右侧
        const maxLeft = window.innerWidth - 58; // 工具栏宽度48px + 10px边距
        const finalLeft = Math.min(toolbarLeft, maxLeft);
        
        const toolbar = document.createElement('div');
        toolbar.className = 'translation-toolbar';
        toolbar.style.cssText = `
            position: fixed;
            left: ${finalLeft}px;
            top: ${elfTop + 35}px;
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
            z-index: 999999;
            display: none;
            flex-direction: column;
            padding: 8px;
            width: 48px;
            opacity: 0;
            transform: translateY(-10px) scale(0.9);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            backdrop-filter: blur(10px);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            border: 1px solid rgba(0, 0, 0, 0.1);
            box-sizing: border-box;
        `;
        
        // 创建工具栏按钮 - 垂直排列
        const buttons = [
            { icon: '🔤', text: '翻译', onClick: () => triggerTranslation() },
            { icon: '📚', text: '添加', onClick: () => openManualAdd() },
            { icon: '📊', text: '统计', onClick: () => showStats() },
            { icon: '⚙️', text: '设置', onClick: () => openSettings() }
        ];
        
        buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.innerHTML = `
                <span style="font-size: 16px; filter: grayscale(1);">${button.icon}</span>
            `;
            btn.style.cssText = `
                width: 32px;
                height: 32px;
                background: transparent;
                border: none;
                color: #333;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: inherit;
                margin: 2px 0;
                box-sizing: border-box;
            `;
            
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(0, 0, 0, 0.1)';
                btn.style.transform = 'scale(1.1)';
            });
            
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'transparent';
                btn.style.transform = 'scale(1)';
            });
            
            btn.addEventListener('click', button.onClick);
            toolbar.appendChild(btn);
        });
        
        document.body.appendChild(toolbar);
        console.log('[SimpleElfLoader] Translation toolbar created');
        
        return toolbar;
    }
    
    // 工具栏功能函数
    function triggerTranslation() {
        console.log('[SimpleElfLoader] Triggering translation for selected text');
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        
        if (selectedText) {
            // 发送翻译消息给content script
            document.dispatchEvent(new CustomEvent('kumarjiva-translate', {
                detail: { text: selectedText }
            }));
        } else {
            alert('请先选择要翻译的文本');
        }
    }
    
    function openManualAdd() {
        console.log('[SimpleElfLoader] Opening manual add drawer');
        // 发送打开手动添加的消息
        document.dispatchEvent(new CustomEvent('kumarjiva-manual-add'));
    }
    
    function showStats() {
        console.log('[SimpleElfLoader] Showing learning stats');
        // 这里可以实现显示学习统计的逻辑
        alert('学习统计功能即将推出！');
    }
    
    function openSettings() {
        console.log('[SimpleElfLoader] Opening settings');
        // 打开设置页面
        if (chrome && chrome.runtime) {
            chrome.runtime.openOptionsPage();
        }
    }

    // 添加必要的CSS动画
    const style = document.createElement('style');
    style.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            25% { transform: translateX(-3px) rotate(-2deg); }
            75% { transform: translateX(3px) rotate(2deg); }
        }
    `;
    document.head.appendChild(style);
    
})(); 