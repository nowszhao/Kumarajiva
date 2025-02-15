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

        // 绑定方法
        this.initializeExtension = this.initializeExtension.bind(this);
        this.handleVideoChange = this.handleVideoChange.bind(this);

        // 注册全局事件监听
        this.eventBus.on('videoChanged', this.handleVideoChange);
    }

    setupEventListeners() {
        this.eventBus.on('translationCompleted', ({ originalText, translatedData }) => {
            this.subtitleManager.updateSubtitleCache(originalText, translatedData);
        });

        this.eventBus.on('subtitlesUpdated', (subtitles) => {
            if (this.uiManager) {
                this.uiManager.updateSubtitleDisplay(subtitles);
            }
        });
    }

    async initializeExtension() {
        this.setupEventListeners();
        this.setupUrlChangeListener();
        if (location.href.includes('youtube.com/watch')) {
            setTimeout(() => this.initializePlugin(), 1000);
        }
    }

    async initializePlugin() {
        if (!document.querySelector('.subtitle-switch-container')) {
            this.addSubtitleSwitch();
        }

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

        this.player = await this.waitForYouTubePlayer();
        if (!this.player) return;

        this.uiManager = new UIManager(this.player, this.eventBus);
        
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
    
            if (activeSubtitle) {
                this.lastDisplayedSubtitle = activeSubtitle;
                this.uiManager.updateSubtitleDisplay([activeSubtitle]);
            } else {
                this.lastDisplayedSubtitle = null;
                this.uiManager.updateSubtitleDisplay([]);
            }
        });

        if (this.isTranslating) {
            await this.translationProcessor.batchProcessSubtitles(subtitles, UIManager.getYouTubeVideoId());
        }
    }

    cleanupCurrentSession() {
        console.log('Starting cleanup of current session');
        
        try {
            if (this.player) {
                this.player.removeEventListener('timeupdate', this.onTimeUpdate);
            }
            
            const subtitleContainer = document.getElementById('yt-subtitle-container');
            if (subtitleContainer) {
                subtitleContainer.remove();
            }
            
            const progressContainer = document.getElementById('translation-progress');
            if (progressContainer) {
                progressContainer.remove();
            }
            
            if (this.subtitleManager) {
                this.subtitleManager.currentSubtitles = [];
                this.subtitleManager.subtitleCache.clear();
            }

            if (this.translationProcessor) {
                this.translationProcessor.processingStatus = {
                    total: 0,
                    processed: 0,
                    isProcessing: false
                };
            }

            if (this.uiManager) {
                if (this.uiManager.analysisPanel) {
                    this.uiManager.analysisPanel.hidePanel();
                }
                this.uiManager.analyzer = null;
                this.uiManager.analysisPanel = null;
            }
            
            this.player = null;
            
            const switchContainer = document.querySelector('.subtitle-switch-container');
            if (switchContainer) {
                const switchElement = switchContainer.querySelector('.subtitle-switch');
                if (!this.isSubtitleEnabled) {
                    switchElement.classList.remove('active');
                }
            }
            
            console.log('Session cleanup completed successfully');
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
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
                    this.translationProcessor.stopTranslation();
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
}

// 创建实例并初始化
const app = new YouTubeSubtitleApp();
app.initializeExtension();


console.log("contentScript.js loaded");
