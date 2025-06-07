import { EventBus,SubtitleManager,TranslationProcessor, UIManager, StorageManager} from './components/youtubeVideoParser';

// 主应用类 - 负责协调各个组件
class YouTubeSubtitleApp {
    constructor() {
        this.eventBus = new EventBus();
        this.storageManager = new StorageManager();
        this.subtitleManager = new SubtitleManager(this.eventBus);
        this.translationProcessor = new TranslationProcessor(
            this.storageManager, 
            this.eventBus,
            this.subtitleManager
        );
        this.uiManager = null;
        this.player = null;
        this.isSubtitleEnabled = false;
        this.isTranslating = false;
        this.lastDisplayedSubtitle = null;
        this.boundHandlers = {
            timeupdate: null,
            videoChange: null
        };

        // 绑定方法
        this.initializeExtension = this.initializeExtension.bind(this);
        this.handleVideoChange = this.handleVideoChange.bind(this);

        // 注册全局事件监听
        this.eventBus.on('videoChanged', this.handleVideoChange);
    }

    async initializeExtension() {
        console.log('[YouTube] Initializing extension...');
        const domain = window.location.hostname;
        console.log('[YouTube] Current domain:', domain);
        
        const { pluginStatus = {} } = await chrome.storage.sync.get('pluginStatus');
        const isEnabled = pluginStatus[domain] ?? true;
        console.log('[YouTube] Plugin status:', isEnabled);
        
        if (!isEnabled) {
            console.log('[YouTube] Plugin disabled, skipping initialization');
            return;
        }

        console.log('[YouTube] Starting feature initialization');
        await this.initializeFeatures();
    }

    async initializeFeatures() {
        console.log('[YouTube] Setting up event listeners');
        this.setupEventListeners();
        this.setupUrlChangeListener();
        
        if (location.href.includes('youtube.com/watch')) {
            console.log('[YouTube] Initializing plugin for video page');
            await this.initializePlugin();
        }
        
        this.setupMessageListener();
    }

    setupMessageListener() {
        console.log('[YouTube] Setting up message listener');
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('[YouTube] Received message:', message);
            if (message.type === 'PLUGIN_STATUS_CHANGED') {
                if (!message.isEnabled) {
                    console.log('[YouTube] Disabling plugin features');
                    this.cleanupCurrentSession();
                    this.removeEventListeners();
                } else {
                    console.log('[YouTube] Re-enabling plugin features');
                    // 重要：使用 setTimeout 确保清理操作完成后再初始化
                    setTimeout(() => {
                        this.initializeFeatures();
                    }, 100);
                }
            }
        });
    }

    setupEventListeners() {
        // 存储事件处理函数引用
        this.boundHandlers.videoChange = this.handleVideoChange.bind(this);
        this.eventBus.on('videoChanged', this.boundHandlers.videoChange);

        if (this.player) {
            this.boundHandlers.timeupdate = () => {
                // 时间更新处理逻辑
            };
            this.player.addEventListener('timeupdate', this.boundHandlers.timeupdate);
        }

        this.eventBus.on('translationCompleted', ({ originalText, translatedData }) => {
            this.subtitleManager.updateSubtitleCache(originalText, translatedData);
        });

        this.eventBus.on('subtitlesUpdated', (subtitles) => {
            if (this.uiManager) {
                this.uiManager.updateSubtitleDisplay(subtitles);
            }
        });
    }

    async initializePlugin() {
        // Add subtitle switch if it doesn't exist
        if (!document.querySelector('.subtitle-switch-container')) {
            this.addSubtitleSwitch();
        }

        // Create player and UIManager regardless of subtitle status
        this.player = await this.waitForYouTubePlayer();
        if (this.player) {
            // Initialize UIManager early to add the analyze button
            if (!this.uiManager) {
                this.uiManager = new UIManager(this.player, this.eventBus);
            }
        }

        // Continue with subtitles initialization if enabled
        if (this.isSubtitleEnabled) {
            await this.initializePluginCore();
        }
    }

    setupUrlChangeListener() {
        let lastUrl = location.href;
        let lastVideoId = new URLSearchParams(window.location.search).get('v');

        const checkForVideoChange = () => {
            const currentUrl = location.href;
            const newVideoId = new URLSearchParams(window.location.search).get('v');
            
            if (!currentUrl.includes('youtube.com/watch')) {
                if (lastUrl.includes('youtube.com/watch')) {
                    console.log('Leaving video page, cleaning up');
                    this.cleanupCurrentSession();
                }
                lastUrl = currentUrl;
                lastVideoId = null;
                return;
            }

            if (newVideoId && newVideoId !== lastVideoId) {
                console.log('Video ID changed from', lastVideoId, 'to', newVideoId);
                lastVideoId = newVideoId;
                lastUrl = currentUrl;
                
                this.cleanupCurrentSession();
                setTimeout(() => {
                    this.initializePlugin();
                }, 1000);

                window.location.reload();
            }
        };

        chrome.runtime.onMessage.addListener((message) => {
            if (message.type === 'VIDEO_CHANGED') {
                checkForVideoChange();
            }
        });

        const throttledCheck = this.throttle(checkForVideoChange, 1000);
        
        window.addEventListener('popstate', throttledCheck);
        window.addEventListener('pushstate', throttledCheck);
        window.addEventListener('replacestate', throttledCheck);
        document.addEventListener('yt-navigate-start', throttledCheck);
        document.addEventListener('yt-navigate-finish', throttledCheck);

        const observer = new MutationObserver((mutations) => {
            if (location.href.includes('youtube.com/watch')) {
                const hasRelevantChanges = mutations.some(mutation => {
                    return mutation.target.id === 'content' || 
                           mutation.target.id === 'page-manager' ||
                           mutation.target.tagName === 'YTD-WATCH-FLEXY';
                });

                if (hasRelevantChanges) {
                    throttledCheck();
                }
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-video-id']
        });

        checkForVideoChange();
    }

    async initializePluginCore() {
        if (!this.isTranslating) return;

        if (!this.player) {
            this.player = await this.waitForYouTubePlayer();
            if (!this.player) return;
        }

        // Use existing UIManager or create if needed
        if (!this.uiManager) {
            this.uiManager = new UIManager(this.player, this.eventBus);
        }
        
        const englishTrack = await this.subtitleManager.getEnglishSubtitleTrack();
        if (!englishTrack) {
            this.uiManager.showNoSubtitlesNotification();
            return;
        }

        const subtitles = await this.subtitleManager.fetchAndParseSubtitles(englishTrack);
        if (!subtitles.length || !this.isTranslating) return;

        this.subtitleManager.setCurrentSubtitles(subtitles);
        
        this.player.addEventListener('timeupdate', () => {
            if (!this.isTranslating) return;
            
            // 使用当前时间检查字幕
            const currentTime = this.player.currentTime * 1000;
            let activeSubtitle = subtitles.find(sub => 
                currentTime >= sub.startTime && currentTime < sub.endTime
            );

            const epsilon = 100;
            if (!activeSubtitle && this.lastDisplayedSubtitle) {
                if (currentTime < this.lastDisplayedSubtitle.endTime + epsilon) {
                    activeSubtitle = this.lastDisplayedSubtitle;
                }
            }
            
            // 只在字幕真正变化时更新显示
            if (!this.subtitleEqual(activeSubtitle, this.lastDisplayedSubtitle)) {
                if (activeSubtitle) {
                    this.lastDisplayedSubtitle = { ...activeSubtitle }; // 克隆以避免引用问题
                    this.uiManager.updateSubtitleDisplay([activeSubtitle]);
                } else {
                    this.lastDisplayedSubtitle = null;
                    this.uiManager.updateSubtitleDisplay([]);
                }
            }
        });

        if (this.isTranslating) {
            await this.translationProcessor.batchProcessSubtitles(subtitles, UIManager.getYouTubeVideoId());
        }
    }

    cleanupCurrentSession() {
        console.log('[YouTube] Starting cleanup');
        this.removeEventListeners();

        const elementsToRemove = [
            '.subtitle-switch-container',
            '#yt-subtitle-container',
            '#translation-progress'
        ];

        elementsToRemove.forEach(selector => {
            const element = document.querySelector(selector);
            if (element) {
                console.log('[YouTube] Removing element:', selector);
                element.remove();
            }
        });

        this.isSubtitleEnabled = false;
        this.isTranslating = false;
        this.player = null;
        this.uiManager = null;
        console.log('[YouTube] Cleanup completed');
    }

    async waitForYouTubePlayer() {
        return new Promise(resolve => {
            const checkPlayer = () => {
                const videoElement = document.querySelector('video.html5-main-video');
                if (videoElement) {
                    resolve(videoElement);
                } else {
                    setTimeout(checkPlayer, 500);
                }
            };
            checkPlayer();
        });
    }

    throttle(func, limit) {
        let inThrottle;
        return (...args) => {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    addSubtitleSwitch() {
        const ytpRightControls = document.querySelector('.ytp-right-controls');
        if (!ytpRightControls) return;

        const switchContainer = document.createElement('div');
        switchContainer.className = 'subtitle-switch-container';
        switchContainer.innerHTML = `
            <div class="subtitle-switch-tooltip">AI双语字幕</div>
            <div class="subtitle-switch"></div>
        `;

        const captionButton = ytpRightControls.querySelector('.ytp-subtitles-button');
        if (captionButton) {
            captionButton.after(switchContainer);
        } else {
            ytpRightControls.prepend(switchContainer);
        }

        const switchElement = switchContainer.querySelector('.subtitle-switch');
        
        if (this.isSubtitleEnabled) {
            switchElement.classList.add('active');
        } else {
            switchElement.classList.remove('active');
        }

        switchContainer.addEventListener('click', async () => {
            this.isSubtitleEnabled = !this.isSubtitleEnabled;
            
            if (this.isSubtitleEnabled) {
                switchElement.classList.add('active');
                this.isTranslating = true;
                const videoId = new URLSearchParams(window.location.search).get('v');
                await this.initializePluginCore();
            } else {
                switchElement.classList.remove('active');
                this.isTranslating = false;
                if (this.translationProcessor) {
                    this.translationProcessor.pauseTranslation();
                }
                this.cleanupCurrentSession();
            }
        });
    }

    handleVideoChange(videoId) {
        this.cleanupCurrentSession();
        setTimeout(() => {
            this.initializePlugin();
        }, 1000);
    }

    removeEventListeners() {
        // 移除事件总线监听器
        if (this.boundHandlers.videoChange) {
            this.eventBus.off('videoChanged', this.boundHandlers.videoChange);
        }

        // 移除播放器事件监听器
        if (this.player && this.boundHandlers.timeupdate) {
            this.player.removeEventListener('timeupdate', this.boundHandlers.timeupdate);
        }

        // 清空处理函数引用
        Object.keys(this.boundHandlers).forEach(key => {
            this.boundHandlers[key] = null;
        });
    }

    // 添加辅助方法用于比较字幕是否相同
    subtitleEqual(sub1, sub2) {
        if (!sub1 && !sub2) return true;
        if (!sub1 || !sub2) return false;
        return sub1.text === sub2.text;
    }
}

// 创建实例并初始化
const app = new YouTubeSubtitleApp();
app.initializeExtension();

// YouTube专用功能已由专门的学习精灵加载器处理（learningElfLoader.js）
console.log('[YouTube] YouTube-specific features loaded. Learning Elf handled by learningElfLoader.js');

console.log("contentScript.js loaded");
