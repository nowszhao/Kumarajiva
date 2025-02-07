import { TranslatorFactory } from '../translators';
import config from '../config/config';
import SubtitleAnalyzer from './subtitleAnalyzer';
import AnalysisPanel from './analysisPanel';

// 首先添加一个简单的事件总线来处理组件间通信
class EventBus {
    constructor() {
        this.events = {};
    }

    on(event, callback) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(callback);
    }

    emit(event, data) {
        if (this.events[event]) {
            this.events[event].forEach(callback => callback(data));
        }
    }

    off(event, callback) {
        if (this.events[event]) {
            this.events[event] = this.events[event].filter(cb => cb !== callback);
        }
    }
}

// 字幕管理器 - 负责字幕的获取、解析和处理
class SubtitleManager {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.subtitleCache = new Map();
        this.currentSubtitles = [];
        this.MAX_GROUP_DURATION = 15000;
        this.MAX_TEXT_LENGTH = 150;
        this.MAX_GAP = 8000;
    }

    async getEnglishSubtitleTrack(player) {
        const maxRetries = 5;
        const retryInterval = 1000;

        for (let i = 0; i < maxRetries; i++) {
            const tracks = this.parseCaptionTracks();
            if (tracks.length > 0) {
                const englishTrack = tracks.find(track => 
                    track.languageCode === 'en' || 
                    track.name?.simpleText?.toLowerCase().includes('english')
                );
                return englishTrack || tracks[0];
            }
            await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
        return null;
    }

    parseCaptionTracks() {
        const scriptContent = Array.from(document.scripts)
            .find(script => script.text.includes('ytInitialPlayerResponse'))?.text;

        if (scriptContent) {
            const data = scriptContent.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s)?.[1];
            if (data) {
                try {
                    const { captions } = JSON.parse(data);
                    const tracks = captions?.playerCaptionsTracklistRenderer?.captionTracks;
                    if (tracks?.length) {
                        return tracks;
                    }
                } catch (e) {
                    console.error('Failed to parse ytInitialPlayerResponse:', e);
                }
            }
        }

        if (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
            return window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
        }

        const player = document.querySelector('#movie_player');
        if (player && player.getOption && typeof player.getOption === 'function') {
            try {
                const tracks = player.getOption('captions', 'tracklist');
                if (tracks?.length) {
                    return tracks;
                }
            } catch (e) {
                console.error('Failed to get tracks from player API:', e);
            }
        }

        return [];
    }

    async fetchAndParseSubtitles(track) {
        const response = await fetch(new URL(track.baseUrl));
        const xmlText = await response.text();
        
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const textNodes = Array.from(xmlDoc.getElementsByTagName('text'));
        
        const rawSubtitles = textNodes.map((node, index) => {
            const startTime = parseFloat(node.getAttribute('start')) * 1000;
            const duration = parseFloat(node.getAttribute('dur')) * 1000;
            
            let endTime;
            if (index < textNodes.length - 1) {
                const nextStart = parseFloat(textNodes[index + 1].getAttribute('start')) * 1000;
                endTime = Math.min(startTime + duration, nextStart);
            } else {
                endTime = startTime + duration;
            }

            return {
                startTime,
                endTime,
                text: node.textContent.trim()
            };
        });

        const mergedSubtitles = [];
        let currentGroup = null;

        for (const subtitle of rawSubtitles) {
            if (!currentGroup) {
                currentGroup = { ...subtitle };
                continue;
            }

            const wouldBeDuration = subtitle.endTime - currentGroup.startTime;
            const wouldBeText = `${currentGroup.text} ${subtitle.text}`;
            const gap = subtitle.startTime - currentGroup.endTime;

            if (gap <= this.MAX_GAP && 
                wouldBeDuration <= this.MAX_GROUP_DURATION &&
                wouldBeText.length <= this.MAX_TEXT_LENGTH) {
                
                currentGroup.endTime = subtitle.endTime;
                currentGroup.text = wouldBeText;
            } else {
                mergedSubtitles.push(currentGroup);
                currentGroup = { ...subtitle };
            }
        }

        if (currentGroup) {
            mergedSubtitles.push(currentGroup);
        }

        return mergedSubtitles;
    }

    // 添加新方法用于更新字幕缓存
    updateSubtitleCache(originalText, translatedData) {
        this.subtitleCache.set(originalText, translatedData);
        this.eventBus.emit('subtitleCacheUpdated', {
            originalText,
            translatedData
        });
    }

    // 添加获取当前字幕的方法
    getCurrentSubtitles() {
        return this.currentSubtitles;
    }

    setCurrentSubtitles(subtitles) {
        this.currentSubtitles = subtitles;
        this.eventBus.emit('subtitlesUpdated', subtitles);
    }
}

// 翻译处理器 - 负责字幕的翻译和批处理
class TranslationProcessor {
    constructor(storageManager, eventBus, subtitleManager) {
        this.eventBus = eventBus;
        this.storageManager = storageManager;
        this.subtitleManager = subtitleManager;
        this.BATCH_SIZE = 5;
        this.BATCH_INTERVAL = 2000;
        this.processingStatus = {
            total: 0,
            processed: 0,
            isProcessing: false
        };
    }

    async batchProcessSubtitles(subtitles, videoId) {
        const storageKey = `${this.storageManager.SUBTITLE_STORAGE_KEY}${videoId}`;
        
        const cached = await this.storageManager.getFromStorage(storageKey);
        if (cached) {
            console.log("Using cached subtitles");
            Object.entries(cached).forEach(([originalText, translatedData]) => {
                this.eventBus.emit('translationCompleted', {
                    originalText,
                    translatedData
                });
            });
            return;
        }

        this.processingStatus = {
            total: subtitles.length,
            processed: 0,
            isProcessing: true
        };
        this.eventBus.emit('processingStatusUpdated', this.processingStatus);

        const batches = [];
        for (let i = 0; i < subtitles.length; i += this.BATCH_SIZE) {
            batches.push(subtitles.slice(i, i + this.BATCH_SIZE));
        }

        try {
            for (let i = 0; i < batches.length; i++) {
                await this.processBatch(batches[i], i + 1, batches.length);
                if (i < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, this.BATCH_INTERVAL));
                }
            }

            const cacheObject = Object.fromEntries(this.subtitleManager.subtitleCache);
            await this.storageManager.saveToStorage(storageKey, cacheObject);
        } catch (error) {
            console.error('Error in batch processing:', error);
        } finally {
            this.processingStatus.isProcessing = false;
            this.eventBus.emit('processingStatusUpdated', this.processingStatus);
        }
    }

    async processBatch(batch, currentBatch, totalBatches, retryCount = 0) {
        try {
            const prompt = this.generateTranslationPrompt(batch);
            const response = await this.translate(prompt);
            if (!response) {
                throw new Error('Translation failed');
            }

            const processed = this.extractJsonFromString(response);
            processed.forEach((item, index) => {
                const originalText = batch[index].text;
                this.eventBus.emit('translationCompleted', {
                    originalText,
                    translatedData: {
                        correctedText: item.correctedText,
                        translation: item.translation
                    }
                });
            });

            this.processingStatus.processed += batch.length;
            this.eventBus.emit('processingStatusUpdated', this.processingStatus);
        } catch (error) {
            console.error(`Error in batch ${currentBatch}/${totalBatches}:`, error);
            
            if (retryCount < config.translation.maxRetries) {
                const retryDelay = 3000 * (retryCount + 1);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.processBatch(batch, currentBatch, totalBatches, retryCount + 1);
            }
            throw error;
        }
    }

    generateTranslationPrompt(batch) {
        return `
你是一个专业的多语言字幕处理助手，请严格按照以下步骤处理输入内容：
1. 处理规则：
- 保持原始时间戳(startTime/endTime)不变
- 将输入的所有text作为上下文，对text字段进行英文纠错（当前字幕基于机器转录，存在错误）
- 生成准确流畅的中文翻译(translation字段)
- 所有数字时间值保持整数格式

2. 遵守的JSON规范：
- 使用双引号("")
- 禁止尾随逗号
- 确保特殊字符被正确转义
- 换行符替换为空（即移除原文中的换行符）
- 严格保持字段顺序：startTime > endTime > correctedText > translation
3. 输入示例：
[
    {"startTime": 120, "endTime": 1800, "text": "hey welcome back so this week the world"},
]
4. 输出示例：
\`\`\`
[
    {
        "startTime": 120,
        "endTime": 1800,
        "correctedText": "Hey, welcome back! So this week, the world",
        "translation": "嘿，欢迎回来！本周我们将讨论"
    },
    ...
]
\`\`\`
请现在处理以下输入内容：
${JSON.stringify(batch, null, 2)}
`;
    }

    async translate(text, translatorType = config.translation.defaultService) {
        const translator = TranslatorFactory.createTranslator(translatorType, config[translatorType]);
        try {
            return await translator.translate(text);
        } finally {
            await translator.cleanup();
        }
    }

    extractJsonFromString(input) {
        const jsonRegex = /```json([\s\S]*?)```|```([\s\S]*?)```|(\[[\s\S]*?\])/g;
        const matches = [];
        let match;
      
        if ((match = jsonRegex.exec(input)) !== null) {
            let jsonData;
            if (match[1]) {
                jsonData = match[1].trim();
            } else if (match[2]) {
                jsonData = match[2].trim();
            } else if (match[3]) {
                jsonData = match[3].trim();
            }
      
            try {
                const parsedData = JSON.parse(jsonData);
                if (Array.isArray(parsedData)) {
                    return parsedData;
                } else {
                    matches.push(parsedData);
                }
            } catch (e) {
                console.error("Invalid JSON found:", e);
                throw new Error('Invalid JSON found');
            }
        }
      
        return matches;
    }

    updateProgressDisplay(status) {
        const container = document.getElementById('translation-progress');
        if (!container) return;

        if (status.isProcessing) {
            const progress = Math.round((status.processed / status.total) * 100);
            container.innerHTML = `
                <div class="processing-status">
                    正在处理字幕 (${progress}%)
                    <div class="progress-bar">
                        <div class="progress" style="width: ${progress}%"></div>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = '';
        }
    }
}

// UI管理器 - 负责界面元素的创建和管理
class UIManager {
    constructor(player, eventBus) {
        this.eventBus = eventBus;
        this.player = player;
        this.MAX_SUBTITLES = 5;
        this.analyzer = null;
        this.analysisPanel = null;
        this.subtitleCache = new Map();
        this.currentSubtitles = [];

        // 先定义所有需要的方法
        this.updateSubtitleDisplay = (subtitles) => {
            const container = document.getElementById('yt-subtitle-container');
            if (!container) return;

            let contentContainer = container.querySelector('.subtitle-content');
            if (!contentContainer) {
                contentContainer = document.createElement('div');
                contentContainer.className = 'subtitle-content';
                container.appendChild(contentContainer);
            }

            // 只显示第一条字幕（当前时间点的字幕）
            const currentSubtitle = subtitles[0];
            if (!currentSubtitle) {
                contentContainer.innerHTML = ''; // 如果没有字幕则清空
                return;
            }

            const cached = this.subtitleCache.get(currentSubtitle.text) || {};
            const html = `
                <div class="subtitle-item">
                    <div class="subtitle-english">${cached.correctedText || '原文| '+currentSubtitle.text}</div>
                    <div class="subtitle-chinese">${cached.translation || '正在翻译中...'}</div>
                </div>
            `;

            contentContainer.innerHTML = html;
        };

        this.updateProgressDisplay = (status) => {
            const container = document.getElementById('translation-progress');
            if (!container) return;

            if (status.isProcessing) {
                const progress = Math.round((status.processed / status.total) * 100);
                container.innerHTML = `
                    <div class="processing-status">
                        正在处理字幕 (${progress}%)
                        <div class="progress-bar">
                            <div class="progress" style="width: ${progress}%"></div>
                        </div>
                    </div>
                `;
            } else {
                container.innerHTML = '';
            }
        };

        this.handleSubtitleCacheUpdate = ({ originalText, translatedData }) => {
            this.subtitleCache.set(originalText, translatedData);
            if (this.currentSubtitles.some(sub => sub.text === originalText)) {
                this.updateSubtitleDisplay(this.currentSubtitles);
            }
        };

        this.handleProcessingStatusUpdate = (status) => {
            this.updateProgressDisplay(status);
        };

        this.handleSubtitlesUpdated = (subtitles) => {
            this.currentSubtitles = subtitles;
            this.updateSubtitleDisplay(subtitles);
        };

        // 注册事件监听
        this.eventBus.on('subtitleCacheUpdated', this.handleSubtitleCacheUpdate);
        this.eventBus.on('processingStatusUpdated', this.handleProcessingStatusUpdate);
        this.eventBus.on('subtitlesUpdated', this.handleSubtitlesUpdated);

        // 创建必要的容器
        this.createSubtitleContainer();
        this.createProgressContainer();
    }

    createSubtitleContainer() {
        const container = document.createElement('div');
        container.className = 'subtitle-container';
        container.id = 'yt-subtitle-container';
        
        const controlPanel = document.createElement('div');
        controlPanel.className = 'subtitle-control-panel';
        controlPanel.innerHTML = `
            <div class="subtitle-controls-group">
                <button class="nav-button prev-button">上一句</button>
                <button class="nav-button next-button">下一句</button>
            </div>
            <div class="subtitle-controls-group">
                <div class="loop-switch-container">
                    <div class="loop-switch"></div>
                </div>
            </div>
            <div class="subtitle-controls-group">
                <button class="analyze-button">AI解析</button>
            </div>
        `;
        container.appendChild(controlPanel);
        
        this.initializeAnalysisPanel();
        this.analysisPanel.setAnalyzer(this.analyzer);
        this.analysisPanel.setVideoId(UIManager.getYouTubeVideoId());

        const analyzeButton = controlPanel.querySelector('.analyze-button');
        analyzeButton.addEventListener('click', async () => {
            if (this.analysisPanel.isVisible) {
                this.analysisPanel.hidePanel();
                return;
            }

            this.analysisPanel.setSubtitles(this.currentSubtitles);
            this.analysisPanel.showPanel();
            await this.analysisPanel.triggerAnalysis();
        });
        
        const contentContainer = document.createElement('div');
        contentContainer.className = 'subtitle-content';
        container.appendChild(contentContainer);
        
        const playerContainer = document.querySelector('#movie_player');
        if (playerContainer) {
            playerContainer.appendChild(container);
            this.initializeControls(container);
        } else {
            document.body.appendChild(container);
        }
    }

    createProgressContainer() {
        const container = document.createElement('div');
        container.className = 'translation-progress-container';
        container.id = 'translation-progress';
        
        const playerContainer = document.querySelector('#movie_player');
        if (playerContainer) {
            playerContainer.appendChild(container);
        }
    }

    initializeControls(container) {
        this.initializeHoverControl(container);
        this.initializeNavigation(container);
        this.initializeLoopControl(container);
    }

    initializeHoverControl(container) {
        let wasPlaying = false;
        let pausedByHover = false;
        let hoverTimeout;

        container.addEventListener('mouseenter', () => {
            if (!this.player) return;
            
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }

            hoverTimeout = setTimeout(() => {
                wasPlaying = !this.player.paused;
                
                if (wasPlaying) {
                    this.player.pause();
                    pausedByHover = true;
                }
            }, 200);
        });

        container.addEventListener('mouseleave', () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }

            hoverTimeout = setTimeout(() => {
                if (pausedByHover && wasPlaying) {
                    this.player.play();
                }
                pausedByHover = false;
            }, 200);
        });

        this.player.addEventListener('play', () => {
            pausedByHover = false;
        });

        this.player.addEventListener('pause', () => {
            if (!pausedByHover) {
                wasPlaying = false;
            }
        });
    }

    initializeNavigation(container) {
        const prevButton = container.querySelector('.prev-button');
        const nextButton = container.querySelector('.next-button');
        
        const updateButtonStates = () => {
            const currentIndex = this.getCurrentSubtitleIndex();
            prevButton.disabled = currentIndex <= 0;
            nextButton.disabled = currentIndex === -1 || currentIndex >= this.currentSubtitles.length - 1;
        };
        
        prevButton.addEventListener('click', () => {
            const currentIndex = this.getCurrentSubtitleIndex();
            if (currentIndex > 0) {
                const prevSubtitle = this.currentSubtitles[currentIndex - 1];
                this.player.currentTime = prevSubtitle.startTime / 1000;
            }
        });
        
        nextButton.addEventListener('click', () => {
            const currentIndex = this.getCurrentSubtitleIndex();
            if (currentIndex !== -1 && currentIndex < this.currentSubtitles.length - 1) {
                const nextSubtitle = this.currentSubtitles[currentIndex + 1];
                this.player.currentTime = nextSubtitle.startTime / 1000;
            }
        });
        
        this.player.addEventListener('timeupdate', updateButtonStates);
        updateButtonStates();
    }

    initializeLoopControl(container) {
        const loopSwitch = container.querySelector('.loop-switch');
        const loopSwitchContainer = container.querySelector('.loop-switch-container');
        let isLooping = false;
        let loopInterval = null;
        let currentLoopingIndex = -1;
        
        const startLoop = () => {
            if (loopInterval) clearInterval(loopInterval);
            
            currentLoopingIndex = this.getCurrentSubtitleIndex();
            if (currentLoopingIndex === -1) return;
            
            loopInterval = setInterval(() => {
                if (!isLooping || !this.player) return;
                
                const currentTime = this.player.currentTime * 1000;
                const currentSubtitle = this.currentSubtitles[currentLoopingIndex];
                
                if (currentTime >= currentSubtitle.endTime || currentTime < currentSubtitle.startTime) {
                    this.player.currentTime = currentSubtitle.startTime / 1000;
                }
            }, 100);
        };
        
        const stopLoop = () => {
            if (loopInterval) {
                clearInterval(loopInterval);
                loopInterval = null;
            }
            currentLoopingIndex = -1;
        };
        
        loopSwitchContainer.addEventListener('click', () => {
            isLooping = !isLooping;
            if (isLooping) {
                loopSwitch.classList.add('active');
                startLoop();
            } else {
                loopSwitch.classList.remove('active');
                stopLoop();
            }
        });
        
        this.player.addEventListener('timeupdate', () => {
            if (isLooping) {
                const newIndex = this.getCurrentSubtitleIndex();
                if (newIndex !== -1 && newIndex !== currentLoopingIndex) {
                    currentLoopingIndex = newIndex;
                    startLoop();
                }
            }
        });
        
        this.player.addEventListener('pause', () => {
            if (loopInterval) {
                clearInterval(loopInterval);
                loopInterval = null;
            }
        });
        
        this.player.addEventListener('play', () => {
            if (isLooping) {
                startLoop();
            }
        });
    }

    getCurrentSubtitleIndex() {
        if (!this.player || !this.currentSubtitles.length) return -1;
        
        const currentTime = this.player.currentTime * 1000;
        return this.currentSubtitles.findIndex(sub => 
            currentTime >= sub.startTime && currentTime < sub.endTime
        );
    }

    static getYouTubeVideoId() {
        return new URLSearchParams(window.location.search).get('v');
    }

    initializeAnalysisPanel() {
        this.analyzer = new SubtitleAnalyzer();
        this.analysisPanel = new AnalysisPanel();
    }

    showNoSubtitlesNotification() {
        const notificationContainer = document.createElement('div');
        notificationContainer.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            z-index: 2147483647;
            text-align: center;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        `;
        notificationContainer.innerHTML = `
            <div>未找到字幕，请尝试刷新页面</div>
            <button style="
                margin-top: 8px;
                padding: 6px 12px;
                background: #1a73e8;
                border: none;
                border-radius: 4px;
                color: white;
                cursor: pointer;
            ">刷新页面</button>
        `;
        
        document.body.appendChild(notificationContainer);
        
        const refreshButton = notificationContainer.querySelector('button');
        refreshButton.addEventListener('click', () => {
            location.reload();
        });
        
        setTimeout(() => {
            notificationContainer.remove();
        }, 5000);
    }

    onTimeUpdate() {
        if (!this.player) return;
        
        const currentTime = this.player.currentTime * 1000;
        const relevantSubtitles = this.currentSubtitles.filter(sub => 
            currentTime >= sub.startTime && currentTime < sub.endTime
        ).slice(-this.MAX_SUBTITLES);
        
        this.updateSubtitleDisplay(relevantSubtitles);
        this.updateNavigationButtons();
    }

    updateNavigationButtons() {
        const container = document.getElementById('yt-subtitle-container');
        if (!container) return;

        const prevButton = container.querySelector('.prev-button');
        const nextButton = container.querySelector('.next-button');
        if (prevButton && nextButton) {
            const currentIndex = this.getCurrentSubtitleIndex();
            prevButton.disabled = currentIndex <= 0;
            nextButton.disabled = currentIndex === -1 || currentIndex >= this.currentSubtitles.length - 1;
        }
    }
}

// 存储管理器 - 负责数据的存储和读取
class StorageManager {
    constructor() {
        this.SUBTITLE_STORAGE_KEY = 'yt-subtitles-';
    }

    async getFromStorage(key) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } catch (error) {
            console.error('Storage read error:', error);
            return null;
        }
    }

    async saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('Storage write error:', error);
        }
    }
}

export { EventBus,SubtitleManager,TranslationProcessor, UIManager, StorageManager};