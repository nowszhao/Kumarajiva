export class NotificationManager {
    constructor() {
        this.isActive = false;
        this.timer = null;
        this.onNotification = null;
        this.minInterval = 10 * 60 * 1000; // 10分钟
        this.maxInterval = 60 * 60 * 1000; // 60分钟
        this.lastActivityTime = Date.now();
        this.activityTimeout = 5 * 60 * 1000; // 5分钟无活动后才开始提醒
        this.isPageVisible = true;
        this.isUserIdle = false;
    }

    start() {
        if (this.isActive) return;
        
        this.isActive = true;
        this.setupActivityDetection();
        this.setupVisibilityDetection();
        this.scheduleNextNotification();
        
        console.log('Notification Manager started');
    }

    stop() {
        if (!this.isActive) return;
        
        this.isActive = false;
        this.clearTimer();
        this.removeActivityDetection();
        this.removeVisibilityDetection();
        
        console.log('Notification Manager stopped');
    }

    scheduleNextNotification() {
        if (!this.isActive) return;
        
        this.clearTimer();
        
        // 计算随机间隔时间（10-60分钟）
        const randomInterval = Math.random() * (this.maxInterval - this.minInterval) + this.minInterval;
        
        console.log(`Next notification scheduled in ${Math.round(randomInterval / 1000 / 60)} minutes`);
        
        this.timer = setTimeout(() => {
            this.checkAndTriggerNotification();
        }, randomInterval);
    }

    checkAndTriggerNotification() {
        if (!this.isActive) return;
        
        // 检查页面是否可见
        if (!this.isPageVisible) {
            console.log('Page not visible, rescheduling notification');
            this.scheduleNextNotification();
            return;
        }
        
        // 检查用户是否处于空闲状态
        const timeSinceLastActivity = Date.now() - this.lastActivityTime;
        if (timeSinceLastActivity < this.activityTimeout) {
            console.log('User recently active, rescheduling notification');
            this.scheduleNextNotification();
            return;
        }
        
        // 检查是否在专注场景中（如视频播放、表单填写等）
        if (this.isInFocusMode()) {
            console.log('User in focus mode, rescheduling notification');
            this.scheduleNextNotification();
            return;
        }
        
        // 触发通知
        console.log('Triggering study notification');
        if (this.onNotification) {
            this.onNotification();
        }
        
        // 安排下一次通知
        this.scheduleNextNotification();
    }

    isInFocusMode() {
        try {
            // 检查是否有视频在播放
            const videos = document.querySelectorAll('video');
            for (const video of videos) {
                if (!video.paused && !video.ended) {
                    return true;
                }
            }
            
            // 检查是否有音频在播放
            const audios = document.querySelectorAll('audio');
            for (const audio of audios) {
                if (!audio.paused && !audio.ended) {
                    return true;
                }
            }
            
            // 检查是否有激活的输入框
            const activeElement = document.activeElement;
            if (activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                activeElement.contentEditable === 'true'
            )) {
                return true;
            }
            
            // 检查是否有全屏元素
            if (document.fullscreenElement || 
                document.webkitFullscreenElement || 
                document.mozFullScreenElement) {
                return true;
            }
            
            // 检查是否在考试或测试页面
            const testKeywords = ['exam', 'test', 'quiz', 'assessment', 'survey'];
            const pageText = document.title.toLowerCase() + ' ' + 
                           (document.querySelector('h1')?.textContent || '').toLowerCase();
            
            if (testKeywords.some(keyword => pageText.includes(keyword))) {
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error checking focus mode:', error);
            return false;
        }
    }

    setupActivityDetection() {
        // 监听用户活动
        const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
        
        this.activityHandler = () => {
            this.lastActivityTime = Date.now();
            this.isUserIdle = false;
        };
        
        activityEvents.forEach(eventType => {
            document.addEventListener(eventType, this.activityHandler, { passive: true });
        });
        
        // 设置空闲检测
        this.idleTimer = setInterval(() => {
            const timeSinceLastActivity = Date.now() - this.lastActivityTime;
            this.isUserIdle = timeSinceLastActivity > this.activityTimeout;
        }, 30000); // 每30秒检查一次
    }

    removeActivityDetection() {
        if (this.activityHandler) {
            const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
            activityEvents.forEach(eventType => {
                document.removeEventListener(eventType, this.activityHandler);
            });
            this.activityHandler = null;
        }
        
        if (this.idleTimer) {
            clearInterval(this.idleTimer);
            this.idleTimer = null;
        }
    }

    setupVisibilityDetection() {
        this.visibilityHandler = () => {
            this.isPageVisible = !document.hidden;
            
            if (this.isPageVisible) {
                // 页面变为可见时更新活动时间
                this.lastActivityTime = Date.now();
                console.log('Page became visible');
            } else {
                console.log('Page became hidden');
            }
        };
        
        document.addEventListener('visibilitychange', this.visibilityHandler);
        
        // 监听窗口焦点
        this.focusHandler = () => {
            this.isPageVisible = true;
            this.lastActivityTime = Date.now();
        };
        
        this.blurHandler = () => {
            this.isPageVisible = false;
        };
        
        window.addEventListener('focus', this.focusHandler);
        window.addEventListener('blur', this.blurHandler);
    }

    removeVisibilityDetection() {
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
            this.visibilityHandler = null;
        }
        
        if (this.focusHandler) {
            window.removeEventListener('focus', this.focusHandler);
            this.focusHandler = null;
        }
        
        if (this.blurHandler) {
            window.removeEventListener('blur', this.blurHandler);
            this.blurHandler = null;
        }
    }

    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    // 外部可调用的方法
    triggerImmediateNotification() {
        if (this.isActive && this.onNotification) {
            console.log('Immediate notification triggered');
            this.onNotification();
        }
    }

    pause() {
        console.log('Notification Manager paused');
        this.clearTimer();
    }

    resume() {
        if (this.isActive) {
            console.log('Notification Manager resumed');
            this.scheduleNextNotification();
        }
    }

    setInterval(minMinutes, maxMinutes) {
        this.minInterval = minMinutes * 60 * 1000;
        this.maxInterval = maxMinutes * 60 * 1000;
        
        console.log(`Notification interval updated: ${minMinutes}-${maxMinutes} minutes`);
        
        // 如果当前有定时器，重新安排
        if (this.timer) {
            this.scheduleNextNotification();
        }
    }

    getStatus() {
        return {
            isActive: this.isActive,
            isPageVisible: this.isPageVisible,
            isUserIdle: this.isUserIdle,
            timeSinceLastActivity: Date.now() - this.lastActivityTime,
            isInFocusMode: this.isInFocusMode(),
            nextNotificationIn: this.timer ? 'scheduled' : 'not scheduled'
        };
    }
} 