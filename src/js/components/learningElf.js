import { GitHubAuth } from './githubAuth.js';
import { StudyCard } from './studyCard.js';
import { NotificationManager } from './notificationManager.js';

export class LearningElf {
    constructor() {
        this.githubAuth = new GitHubAuth();
        this.studyCard = null;
        this.notificationManager = null;
        this.elfElement = null;
        this.toolbarVisible = false;
        this.pendingWords = [];
        this.currentWordIndex = 0;
        this.position = { x: window.innerWidth - 80, y: window.innerHeight / 2 };
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
    }

    async initialize() {
        // 初始化GitHub认证
        await this.githubAuth.initialize();
        
        // 恢复保存的位置
        await this.restoreSavedPosition();
        
        // 创建精灵元素
        this.createElfElement();
        
        // 初始化学习卡片
        this.studyCard = new StudyCard(this.githubAuth);
        await this.studyCard.initialize();
        
        // 初始化通知管理器
        this.notificationManager = new NotificationManager();
        this.notificationManager.onNotification = () => this.triggerStudyReminder();
        
        // 如果已认证，启动通知管理器
        if (this.githubAuth.isAuthenticated()) {
            this.notificationManager.start();
            // 获取今日学习词汇
            await this.loadTodayWords();
        }
        
        // 监听窗口大小变化
        window.addEventListener('resize', () => this.adjustPositionOnResize());
        
        console.log('Learning Elf initialized successfully');
    }

    createElfElement() {
        // 创建精灵容器
        this.elfElement = document.createElement('div');
        this.elfElement.className = 'learning-elf';
        this.elfElement.innerHTML = `
            <div class="elf-avatar">
                <img src="${chrome.runtime.getURL('icons/elf.png')}" alt="Learning Elf">
                <div class="elf-badge hidden">0</div>
                <div class="elf-status-indicator"></div>
            </div>
        `;
        
        // 设置初始位置
        this.updatePosition();
        
        // 添加事件监听
        this.addEventListeners();
        
        // 添加样式
        this.addStyles();
        
        // 添加到页面
        document.body.appendChild(this.elfElement);
    }

    addEventListeners() {
        const avatar = this.elfElement.querySelector('.elf-avatar');
        
        // 点击事件
        avatar.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this.isDragging) {
                this.handleElfClick();
            }
        });
        
        // 拖拽事件
        avatar.addEventListener('mousedown', (e) => this.startDragging(e));
        document.addEventListener('mousemove', (e) => this.onDragging(e));
        document.addEventListener('mouseup', () => this.stopDragging());
        
        // 悬停效果
        avatar.addEventListener('mouseenter', () => {
            if (!this.isDragging) {
                avatar.style.transform = 'scale(1.1)';
            }
        });
        
        avatar.addEventListener('mouseleave', () => {
            if (!this.isDragging) {
                avatar.style.transform = 'scale(1)';
            }
        });
    }

    startDragging(e) {
        this.isDragging = true;
        const rect = this.elfElement.getBoundingClientRect();
        this.dragOffset.x = e.clientX - rect.left;
        this.dragOffset.y = e.clientY - rect.top;
        
        this.elfElement.style.cursor = 'grabbing';
        this.elfElement.style.zIndex = '1000001';
        
        e.preventDefault();
    }

    onDragging(e) {
        if (!this.isDragging) return;
        
        this.position.x = e.clientX - this.dragOffset.x;
        this.position.y = e.clientY - this.dragOffset.y;
        
        // 限制在窗口边界内
        this.position.x = Math.max(0, Math.min(window.innerWidth - 60, this.position.x));
        this.position.y = Math.max(0, Math.min(window.innerHeight - 60, this.position.y));
        
        this.updatePosition();
    }

    stopDragging() {
        if (this.isDragging) {
            this.isDragging = false;
            this.elfElement.style.cursor = 'pointer';
            this.elfElement.style.zIndex = '1000000';
            
            // 保存位置到本地存储
            chrome.storage.local.set({
                elfPosition: this.position
            });
        }
    }

    updatePosition() {
        this.elfElement.style.left = `${this.position.x}px`;
        this.elfElement.style.top = `${this.position.y}px`;
    }

    adjustPositionOnResize() {
        // 确保精灵在窗口调整大小后仍在可见区域内
        this.position.x = Math.min(this.position.x, window.innerWidth - 60);
        this.position.y = Math.min(this.position.y, window.innerHeight - 60);
        this.updatePosition();
    }

    async handleElfClick() {
        if (this.hasPendingWords()) {
            // 如果有待学习单词，显示学习卡片
            await this.showStudyCard();
        } else {
            // 否则切换工具栏显示状态
            this.toggleToolbar();
        }
    }

    toggleToolbar() {
        const event = new CustomEvent('toggleToolbar');
        document.dispatchEvent(event);
        this.toolbarVisible = !this.toolbarVisible;
        
        // 更新精灵状态
        this.updateElfStatus();
    }

    async loadTodayWords() {
        if (!this.githubAuth.isAuthenticated()) {
            console.log('Not authenticated, cannot load today words');
            return;
        }

        try {
            // 计算当天的开始和结束时间戳
            const now = new Date();
            const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
            const startDate = startOfDay.getTime();
            const endDate = endOfDay.getTime() - 1000; // 减去1秒，确保是当天的结束
            
            const apiUrl = `review/history?startDate=${startDate}&endDate=${endDate}&limit=100&offset=0`;
            const response = await fetch(this.githubAuth.getApiUrl(apiUrl), {
                headers: this.githubAuth.getAuthHeaders()
            });

            if (response.ok) {
                const result = await response.json();
                if (result.success && result.data && Array.isArray(result.data.data)) {
                    this.pendingWords = result.data.data.filter(word => !word.mastered);
                    this.updateBadge();
                    console.log(`Loaded ${this.pendingWords.length} pending words`);
                }
            }
        } catch (error) {
            console.error('Failed to load today words:', error);
        }
    }

    triggerStudyReminder() {
        if (!this.hasPendingWords()) {
            // 重新加载今日单词
            this.loadTodayWords();
            return;
        }
        
        console.log('Triggering study reminder');
        this.startShakeAnimation();
        this.updateBadge();
        
        // 3秒后停止抖动
        setTimeout(() => {
            this.stopShakeAnimation();
        }, 3000);
    }

    startShakeAnimation() {
        this.elfElement.classList.add('shake');
    }

    stopShakeAnimation() {
        this.elfElement.classList.remove('shake');
    }

    updateBadge() {
        const badge = this.elfElement.querySelector('.elf-badge');
        const count = this.pendingWords.length;
        
        if (count > 0) {
            badge.textContent = count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    updateElfStatus() {
        const indicator = this.elfElement.querySelector('.elf-status-indicator');
        
        if (this.hasPendingWords()) {
            indicator.className = 'elf-status-indicator pending';
        } else if (this.toolbarVisible) {
            indicator.className = 'elf-status-indicator active';
        } else {
            indicator.className = 'elf-status-indicator';
        }
    }

    hasPendingWords() {
        return this.pendingWords.length > 0;
    }

    async showStudyCard() {
        if (!this.hasPendingWords()) return;
        
        const currentWord = this.pendingWords[this.currentWordIndex];
        await this.studyCard.show(currentWord, (success) => {
            this.handleStudyResult(success);
        });
    }

    handleStudyResult(success) {
        if (success) {
            // 答对了，移除当前单词
            this.pendingWords.splice(this.currentWordIndex, 1);
            if (this.currentWordIndex >= this.pendingWords.length) {
                this.currentWordIndex = 0;
            }
        } else {
            // 答错了，移到下一个单词（错误的单词保留在列表中）
            this.currentWordIndex = (this.currentWordIndex + 1) % this.pendingWords.length;
        }
        
        this.updateBadge();
        this.updateElfStatus();
        
        // 如果还有待学习单词，停止提醒动画
        if (this.hasPendingWords()) {
            this.stopShakeAnimation();
        }
    }

    addStyles() {
        if (document.getElementById('learning-elf-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'learning-elf-styles';
        style.textContent = `
            .learning-elf {
                position: fixed;
                width: 60px;
                height: 60px;
                z-index: 1000000;
                user-select: none;
                pointer-events: auto;
            }

            .elf-avatar {
                position: relative;
                width: 100%;
                height: 100%;
                cursor: pointer;
                border-radius: 50%;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                padding: 6px;
                box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .elf-avatar:hover {
                box-shadow: 0 12px 35px rgba(102, 126, 234, 0.4);
                transform: translateY(-2px);
            }

            .elf-avatar img {
                width: 48px;
                height: 48px;
                border-radius: 50%;
                object-fit: cover;
                background: white;
            }

            .elf-badge {
                position: absolute;
                top: -5px;
                right: -5px;
                background: linear-gradient(135deg, #ff6b6b, #ee5a24);
                color: white;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                font-weight: 600;
                box-shadow: 0 2px 8px rgba(255, 107, 107, 0.4);
                animation: pulse 2s infinite;
            }

            .elf-badge.hidden {
                display: none;
            }

            .elf-status-indicator {
                position: absolute;
                bottom: 2px;
                right: 2px;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #10b981;
                border: 2px solid white;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }

            .elf-status-indicator.pending {
                background: #f59e0b;
                animation: blink 1.5s infinite;
            }

            .elf-status-indicator.active {
                background: #3b82f6;
            }

            .learning-elf.shake {
                animation: shake 0.5s infinite;
            }

            @keyframes shake {
                0%, 100% { transform: translateX(0); }
                25% { transform: translateX(-3px) rotate(-2deg); }
                75% { transform: translateX(3px) rotate(2deg); }
            }

            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.1); opacity: 0.8; }
            }

            @keyframes blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.3; }
            }

            /* 响应式设计 */
            @media (max-width: 768px) {
                .learning-elf {
                    width: 50px;
                    height: 50px;
                }
                
                .elf-avatar img {
                    width: 38px;
                    height: 38px;
                }
                
                .elf-badge {
                    width: 18px;
                    height: 18px;
                    font-size: 11px;
                }
            }
        `;
        
        document.head.appendChild(style);
    }

    async restoreSavedPosition() {
        try {
            const result = await chrome.storage.local.get('elfPosition');
            if (result.elfPosition) {
                this.position = result.elfPosition;
                // 确保位置在窗口范围内
                this.position.x = Math.max(0, Math.min(window.innerWidth - 60, this.position.x));
                this.position.y = Math.max(0, Math.min(window.innerHeight - 60, this.position.y));
            }
        } catch (error) {
            console.log('Failed to restore elf position:', error);
        }
    }

    // 公开方法，供外部调用
    async refreshWords() {
        await this.loadTodayWords();
    }

    setToolbarVisible(visible) {
        this.toolbarVisible = visible;
        this.updateElfStatus();
    }

    destroy() {
        if (this.elfElement) {
            this.elfElement.remove();
        }
        
        if (this.notificationManager) {
            this.notificationManager.stop();
        }
        
        if (this.studyCard) {
            this.studyCard.destroy();
        }
        
        // 移除样式
        const style = document.getElementById('learning-elf-styles');
        if (style) {
            style.remove();
        }
    }
} 