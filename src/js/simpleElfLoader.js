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
            
            // 随机选择一个单词进行测验
            const randomWord = words[Math.floor(Math.random() * words.length)];
            const quiz = await getStudyQuiz(randomWord.word);
            
            if (!quiz) {
                alert('暂时无法获取学习内容，请稍后再试。');
                return;
            }
            
            // 显示测验 - 使用自定义UI
            // API返回格式: { word, phonetic, definitions, memory_method, correct_answer, options }
            await showCustomQuizModal(quiz);
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

    // 创建简约酷炫的自定义测验弹框
    async function showCustomQuizModal(quiz) {
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

                         // 标题
             const title = document.createElement('div');
             title.innerHTML = '🧚‍♀️ 学习时间！';
             title.style.cssText = `
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
             const wordInfo = document.createElement('div');
             wordInfo.style.cssText = `
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

            wordInfo.appendChild(wordText);
            wordInfo.appendChild(phoneticText);

                         // 题目描述
             const questionText = document.createElement('div');
             questionText.textContent = '选择正确的定义：';
             questionText.style.cssText = `
                 font-size: 16px;
                 font-weight: 600;
                 color: #4a5568;
                 margin-bottom: 16px;
             `;

                         // 选项容器
             const optionsContainer = document.createElement('div');
             optionsContainer.style.cssText = `
                 margin-bottom: 24px;
             `;

            const correctIndex = quiz.options.findIndex(opt => opt.definition === quiz.correct_answer);

            // 创建选项按钮
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
                    // 禁用所有按钮
                    const allButtons = optionsContainer.querySelectorAll('button');
                    allButtons.forEach(btn => {
                        btn.style.pointerEvents = 'none';
                        btn.style.opacity = '0.6';
                    });

                    // 显示结果
                    if (index === correctIndex) {
                        optionButton.style.background = 'linear-gradient(135deg, #48bb78, #38a169)';
                        optionButton.style.color = 'white';
                        optionButton.style.borderColor = '#48bb78';
                        showResult(true, quiz.memory_method, overlay);
                    } else {
                        optionButton.style.background = 'linear-gradient(135deg, #f56565, #e53e3e)';
                        optionButton.style.color = 'white';
                        optionButton.style.borderColor = '#f56565';
                        
                        // 高亮正确答案
                        allButtons[correctIndex].style.background = 'linear-gradient(135deg, #48bb78, #38a169)';
                        allButtons[correctIndex].style.color = 'white';
                        allButtons[correctIndex].style.borderColor = '#48bb78';
                        
                        showResult(false, quiz.memory_method, overlay, quiz.correct_answer);
                    }
                });

                optionsContainer.appendChild(optionButton);
            });

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
            content.appendChild(title);
            content.appendChild(wordInfo);
            content.appendChild(questionText);
            content.appendChild(optionsContainer);
            
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

    // 显示结果
    function showResult(isCorrect, memoryMethod, overlay) {
        setTimeout(() => {
            const resultContainer = document.createElement('div');
            resultContainer.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: ${isCorrect ? 'linear-gradient(135deg, #48bb78, #38a169)' : 'linear-gradient(135deg, #f56565, #e53e3e)'};
                color: white;
                padding: 24px 32px;
                border-radius: 16px;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
                z-index: 1000002;
                text-align: center;
                max-width: 400px;
                width: 90%;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                opacity: 0;
                transform: translate(-50%, -50%) scale(0.8);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            `;

            const resultIcon = document.createElement('div');
            resultIcon.style.cssText = `
                font-size: 48px;
                margin-bottom: 16px;
            `;
            resultIcon.textContent = isCorrect ? '🎉' : '😅';

                         const resultText = document.createElement('div');
             resultText.style.cssText = `
                 font-size: 18px;
                 font-weight: 700;
                 margin-bottom: 12px;
             `;
             resultText.textContent = isCorrect ? '正确！' : '再试试吧';
 
             const memoryText = document.createElement('div');
             memoryText.style.cssText = `
                 font-size: 13px;
                 opacity: 0.9;
                 line-height: 1.5;
                 word-wrap: break-word;
                 white-space: normal;
             `;
            memoryText.textContent = memoryMethod || '';

            resultContainer.appendChild(resultIcon);
            resultContainer.appendChild(resultText);
            if (memoryMethod) {
                resultContainer.appendChild(memoryText);
            }

            document.body.appendChild(resultContainer);

            // 显示动画
            requestAnimationFrame(() => {
                resultContainer.style.opacity = '1';
                resultContainer.style.transform = 'translate(-50%, -50%) scale(1)';
            });

            // 3秒后自动关闭
            setTimeout(() => {
                resultContainer.style.opacity = '0';
                resultContainer.style.transform = 'translate(-50%, -50%) scale(0.8)';
                setTimeout(() => {
                    if (resultContainer.parentNode) {
                        resultContainer.parentNode.removeChild(resultContainer);
                    }
                    closeModal(overlay);
                }, 300);
            }, 3000);
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
                // 存储单词数量，但徽章保持隐藏
                badge.setAttribute('data-word-count', Math.min(words.length, 99));
                
                console.log(`[SimpleElfLoader] 🎯 学习功能初始化完成:`, {
                    总单词数: words.length,
                    待学习数: words.filter(w => !w.mastered).length,
                    已掌握数: words.filter(w => w.mastered).length
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
            // 获取background.js中的提醒状态
            const response = await chrome.runtime.sendMessage({
                type: 'GET_REMINDER_STATUS'
            });
            
            if (response.success) {
                console.log(`[SimpleElfLoader] 📅 下次学习提醒时间: ${response.data.timeString} (${response.data.remainingMinutes}分钟后)`);
            } else {
                console.log('[SimpleElfLoader] 获取提醒状态失败，background.js将自动生成新的提醒时间');
            }
            
            // 监听来自background.js的提醒消息
            if (!chrome.runtime.onMessage.hasListener(handleBackgroundMessage)) {
                chrome.runtime.onMessage.addListener(handleBackgroundMessage);
            }
        } catch (error) {
            console.error('[SimpleElfLoader] 初始化提醒系统失败:', error);
        }
    }
    
    // 处理来自background.js的消息
    function handleBackgroundMessage(message, sender, sendResponse) {
        if (message.type === 'LEARNING_ELF_REMINDER') {
            console.log('[SimpleElfLoader] 🔔 收到来自background.js的提醒');
            
            // 检查用户是否在活动状态
            if (document.visibilityState === 'visible') {
                const element = document.querySelector('.simple-learning-elf');
                if (element) {
                    handleReminderTrigger(element);
                }
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
            if (wordCount && parseInt(wordCount) > 0) {
                badge.textContent = wordCount;
                badge.style.display = 'flex';
                badge.style.opacity = '1';
                badge.style.transform = 'scale(1)';
                badge.classList.remove('hidden');
                
                console.log(`[SimpleElfLoader] ✅ 徽章已显示 - 待学习单词数: ${wordCount}`);
                
                // 添加摇摆动画
                element.style.animation = 'shake 0.5s infinite';
                console.log(`[SimpleElfLoader] 🎭 开始摇摆动画 (持续3秒)`);
                
                setTimeout(() => {
                    element.style.animation = '';
                    console.log(`[SimpleElfLoader] 🎭 摇摆动画结束`);
                }, 3000);
            } else {
                console.log(`[SimpleElfLoader] ℹ️ 无待学习单词，跳过徽章显示`);
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