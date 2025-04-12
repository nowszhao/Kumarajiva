import { TranslatorFactory } from '../translators';
import config from '../config/config';
import SubtitleAnalyzer from './subtitleAnalyzer';
import AnalysisPanel from './analysisPanel';
import { Utils } from '../utils/Utils';

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
        this.storageManager = storageManager;
        this.eventBus = eventBus;
        this.subtitleManager = subtitleManager;
        this.BATCH_SIZE = 5;
        this.BATCH_INTERVAL = 2000;
        this.processingStatus = {
            total: 0,
            processed: 0,
            isProcessing: false,
            isPaused: false
        };
        // 添加 AbortController
        this.abortController = null;
        
        // 注册事件监听
        this.eventBus.on('pauseTranslation', () => this.pauseTranslation());
        this.eventBus.on('resumeTranslation', () => this.resumeTranslation());
    }

    // 添加暂停方法
    pauseTranslation() {
        this.processingStatus.isPaused = true;
        this.processingStatus.isProcessing = false;
        this.eventBus.emit('processingStatusUpdated', this.processingStatus);
    }

    // 修改继续方法
    resumeTranslation() {
        this.processingStatus.isPaused = false;
        this.processingStatus.isProcessing = true;
        this.eventBus.emit('processingStatusUpdated', this.processingStatus);
    }

    // 修改 batchProcessSubtitles 方法
    async batchProcessSubtitles(subtitles, videoId) {
        // 创建新的 AbortController
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        const storageKey = `${this.storageManager.SUBTITLE_STORAGE_KEY}${videoId}`;
        
        // 检查缓存
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

        // 初始化处理状态 - 将 isPaused 设置为 true，使其默认暂停
        this.processingStatus = {
            total: subtitles.length,
            processed: 0,
            isProcessing: true,
            isPaused: true  // 默认暂停
        };
        this.eventBus.emit('processingStatusUpdated', this.processingStatus);

        try {
            const batches = [];
            for (let i = 0; i < subtitles.length; i += this.BATCH_SIZE) {
                batches.push(subtitles.slice(i, i + this.BATCH_SIZE));
            }

            // 显示一个提示，指导用户点击开始按钮
            this.showStartTranslationHint();

            for (let i = 0; i < batches.length; i++) {
                // 检查是否已中止或暂停
                if (signal.aborted) {
                    console.log('Translation aborted');
                    break;
                }

                // 如果暂停，等待恢复
                while (this.processingStatus.isPaused && !signal.aborted) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }

                // 如果不再处理中且未暂停，退出循环
                if (!this.processingStatus.isProcessing && !this.processingStatus.isPaused) {
                    console.log('Translation stopped');
                    break;
                }

                await this.processBatch(batches[i], i + 1, batches.length);
                
                if (i < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, this.BATCH_INTERVAL));
                }
            }

            // 如果没有被中止，保存到缓存
            if (!signal.aborted && this.processingStatus.isProcessing) {
                const cacheObject = Object.fromEntries(this.subtitleManager.subtitleCache);
                await this.storageManager.saveToStorage(storageKey, cacheObject);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Translation was aborted');
            } else {
                console.error('Error in batch processing:', error);
            }
        } finally {
            this.processingStatus.isProcessing = false;
            this.eventBus.emit('processingStatusUpdated', this.processingStatus);
            this.abortController = null;
        }
    }

    // 修改 processBatch 方法
    async processBatch(batch, currentBatch, totalBatches) {
        if (!this.processingStatus.isProcessing) return;

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
                        translation: item.translation,
                        difficultVocabulary: item.difficultVocabulary || []
                    }
                });
            });

            this.processingStatus.processed += batch.length;
            this.eventBus.emit('processingStatusUpdated', this.processingStatus);
        } catch (error) {
            console.error(`Error in batch ${currentBatch}/${totalBatches}:`, error);
            
            if (error.name === 'AbortError') {
                console.log('Translation was aborted');
            } else {
                if (error.name === 'TranslationError') {
                    console.error('Translation error:', error);
                } else {
                    if (error.name === 'TranslationTimeoutError') {
                        console.error('Translation timed out');
                    } else {
                        console.error('Error processing batch:', error);
                    }
                }
            }
        }
    }

    generateTranslationPrompt(batch) {
        var prompt = `
            你是一个专业的多语言字幕处理助手，请严格按照以下步骤处理输入内容：
            1. 处理规则：
            - 保持原始时间戳(startTime/endTime)不变
            - 将输入的所有text作为上下文，对text字段进行英文纠错（当前字幕基于机器转录，存在错误）
            - 生成准确流畅的中文翻译(translation字段)
            - 所有数字时间值保持整数格式
            - 分析给定字幕中的语言最难点，这些难点可能包括对非母语学习者具有挑战性的词汇、短语、俚语、缩写、简写以及网络用语等，有了这些解析，用户将能完整理解字幕内容，输出请遵循以下要求：
                - 中文翻译：根据字幕语境给出最贴切的含义
                - 词汇：识别出句子中所有词汇，包括短语/词块、俚语、缩写
                - 类型：包括短语/词块、俚语、缩写（Phrases, Slang, Abbreviations）
                - 词性：使用n., v., adj., adv., phrase等标准缩写
                - 音标：提供美式音标
                - 中英混合句子：使用词汇造一个句子，中文句子除了该词汇外，其他均为中文，需要保证语法正确，通过在完整中文语境中嵌入单一核心英语术语，帮助学习者直观理解专业概念的实际用法；英语句子在括号中展示。
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
                    "translation": "嘿，欢迎回来！本周我们将讨论",
                    "difficultVocabulary": [
                        {
                            "vocabulary": "welcome back",
                            "type": "Phrases",
                            "part_of_speech": "phrase",
                            "phonetic": "/ˈwelkəm bæk/",
                            "chinese_meaning":  "欢迎回来",
                            "chinese_english_sentence": "当他出差回来时，同事们对他说Welcome back。（When he came back from a business trip, his colleagues said 'Welcome back'to him.）" //中文句子中必要包含待解析的英文词汇
                        },
                        ...
                    ]
                },
                ...
            ]
            \`\`\`
            请现在处理以下输入内容：
            ${JSON.stringify(batch, null, 2)}`;

            return prompt;
    }

    async translate(text, translatorType = config.translation.defaultService) {


        // 从 storage 获取当前的翻译服务设置
        const { translationService, serviceTokens } = await chrome.storage.sync.get(['translationService', 'serviceTokens']);

        // 使用保存的设置，如果没有则使用默认值
        const currentService = translationService || config.translation.defaultService;
        
        // 获取对应服务的 token
        const token = serviceTokens?.[currentService] || config[currentService].apiToken;
        
        // 创建翻译器实例时使用保存的设置
        const translator = TranslatorFactory.createTranslator(
            currentService,
            {
                ...config[currentService],
                apiToken: token
            }
        );

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

        if (status.isProcessing || status.isPaused) {
            const progress = Math.round((status.processed / status.total) * 100);
            const buttonIcon = status.isPaused ? '▶' : '⏸'; // 使用 Unicode 字符作为图标
            const buttonText = status.isPaused ? '开始' : '暂停'; // 修改文字以更明确
            const buttonClass = status.isPaused ? 'paused play-button' : ''; // 添加额外的类名，使按钮更突出
            
            container.innerHTML = `
                <div class="processing-status">
                    <div class="status-header">
                        <span>${status.isPaused && status.processed === 0 ? '点击开始翻译字幕' : `正在处理字幕 (${progress}%)`}</span>
                        <button class="translation-control-btn ${buttonClass}" title="${buttonText}">
                            ${buttonIcon}
                        </button>
                    </div>
                    <div class="progress-bar">
                        <div class="progress" style="width: ${progress}%"></div>
                    </div>
                </div>
            `;

            // 添加按钮点击事件
            const controlBtn = container.querySelector('.translation-control-btn');
            if (controlBtn) {
                controlBtn.addEventListener('click', () => {
                    if (status.isPaused) {
                        this.eventBus.emit('resumeTranslation');
                    } else {
                        this.eventBus.emit('pauseTranslation');
                    }
                });
            }
        } else {
            container.innerHTML = '';
        }
    }

    // Add a new method to show a hint to the user
    showStartTranslationHint() {
        const container = document.getElementById('translation-progress');
        if (!container) return;
        
        // 添加提示信息，指导用户点击开始按钮
        const notification = document.createElement('div');
        notification.className = 'translation-hint';
        notification.innerHTML = `
            <div style="
                padding: 8px 12px;
                background-color: rgba(0, 0, 0, 0.7);
                color: white;
                border-radius: 4px;
                margin-bottom: 8px;
                text-align: center;
                animation: fadeOut 5s forwards;
            ">
                点击 ▶ 按钮开始翻译字幕
            </div>
        `;
        
        container.prepend(notification);
        
        // 5秒后自动移除提示
        setTimeout(() => {
            if (notification && notification.parentNode) {
                notification.remove();
            }
        }, 5000);
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
        this.isPracticeMode = false;
        this.practiceInputsCache = new Map(); // 添加新的缓存来存储练习输入

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
            
            // 清空之前的所有字幕
            contentContainer.innerHTML = '';
            
            // 如果没有字幕数据，直接返回
            if (!subtitles || subtitles.length === 0) {
                return;
            }
            
            // 只处理第一条字幕（当前时间点的字幕）
            const currentSubtitle = subtitles[0];
            if (!currentSubtitle) return;
            
            // 获取缓存数据
            const cachedData = this.subtitleCache.get(currentSubtitle.text);
            const englishText = cachedData?.correctedText || currentSubtitle.text;
            const chineseText = cachedData?.translation || '';
            
            // 创建字幕项
            const item = document.createElement('div');
            item.className = 'subtitle-item';
            item.innerHTML = `
                <div class="subtitle-english">${englishText}</div>
                <div class="subtitle-chinese">${chineseText}</div>
            `;
            
            // 添加到容器
            contentContainer.appendChild(item);

            // 如果处于练习模式，重新创建练习元素
            if (this.isPracticeMode) {
                this.removePracticeElements();
                this.createPracticeElements(contentContainer);
            }
        };

        this.updateProgressDisplay = (status) => {
            const container = document.getElementById('translation-progress');
            if (!container) return;

            if (status.isProcessing || status.isPaused) {
                const progress = Math.round((status.processed / status.total) * 100);
                const buttonIcon = status.isPaused ? '▶' : '⏸'; // 使用 Unicode 字符作为图标
                const buttonText = status.isPaused ? '继续' : '暂停';
                
                container.innerHTML = `
                    <div class="processing-status">
                        <div class="status-header">
                            <span>正在处理字幕 (${progress}%)</span>
                            <button class="translation-control-btn ${status.isPaused ? 'paused' : ''}" title="${buttonText}">
                                ${buttonIcon}
                            </button>
                        </div>
                        <div class="progress-bar">
                            <div class="progress" style="width: ${progress}%"></div>
                        </div>
                    </div>
                `;

                // 添加按钮点击事件
                const controlBtn = container.querySelector('.translation-control-btn');
                if (controlBtn) {
                    controlBtn.addEventListener('click', () => {
                        if (status.isPaused) {
                            this.eventBus.emit('resumeTranslation');
                        } else {
                            this.eventBus.emit('pauseTranslation');
                        }
                    });
                }
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

        // 添加文本选择处理
        this.setupTextSelection();
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
                <div class="practice-switch-container">
                    <div class="practice-switch"></div>
                </div>
            </div>
            <div class="subtitle-controls-group">
                <button class="analyze-button">单字幕AI解析</button>
                <button class="copy-subtitles-button">复制字幕</button>
            </div>
        `;
        container.appendChild(controlPanel);

        // Add event listener for the copy subtitles button
        const copySubtitlesButton = controlPanel.querySelector('.copy-subtitles-button');
        copySubtitlesButton.addEventListener('click', () => {
            this.copyAllSubtitles();
        });
        
        this.initializeAnalysisPanel();

        this.analysisPanel.setAnalyzer(this.analyzer);
        this.analysisPanel.setVideoId(UIManager.getYouTubeVideoId());

        const analyzeButton = controlPanel.querySelector('.analyze-button');
        analyzeButton.addEventListener('click', async () => {
            const currentIndex = this.getCurrentSubtitleIndex();
            if (currentIndex === -1) {
                console.log('No current subtitle found');
                return;
            }

            const currentSubtitle = this.currentSubtitles[currentIndex];
            if (!currentSubtitle) {
                console.log('Invalid current subtitle');
                return;
            }

            // 确保分析面板可见
            if (!this.analysisPanel.isVisible) {
                this.analysisPanel.showPanel();
            }

            // 触发单字幕分析
            await this.analysisPanel.analyzeSingleSubtitle(currentSubtitle);
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

        // 替换听力练习按钮的事件监听
        const practiceSwitch = controlPanel.querySelector('.practice-switch');
        practiceSwitch.addEventListener('click', () => {
            practiceSwitch.classList.toggle('active');
            this.toggleListeningPractice();
        });
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
            // if (!this.player) return;
            
            // if (hoverTimeout) {
            //     clearTimeout(hoverTimeout);
            // }

            // hoverTimeout = setTimeout(() => {
            //     wasPlaying = !this.player.paused;
                
            //     if (wasPlaying) {
            //         this.player.pause();
            //         pausedByHover = true;
            //     }
            // }, 200);
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

            this.player.pause();
            this.showPreviousSubtitle();
            // 如果处于练习模式，更新练习区域
            if (this.isPracticeMode) {
                const contentContainer = container.querySelector('.subtitle-content');
                this.removePracticeElements();
                this.createPracticeElements(contentContainer);
            }
            this.player.play();
        });
        
        nextButton.addEventListener('click', () => {
            this.player.pause();
        

            this.showNextSubtitle();
            // 如果处于练习模式，更新练习区域
            if (this.isPracticeMode) {
                const contentContainer = container.querySelector('.subtitle-content');
                this.removePracticeElements();
                this.createPracticeElements(contentContainer);
            }

            this.player.play();
        });
        
        this.player.addEventListener('timeupdate', updateButtonStates);
        updateButtonStates();

        // 添加键盘导航支持
        document.addEventListener('keydown', (e) => {
            // 只有在练习模式下才启用键盘导航
            if (!this.isPracticeMode) return;
            
            // 防止与输入框冲突
            if (e.target.tagName === 'INPUT') return;

            if (e.key === 'ArrowLeft') {
                this.showPreviousSubtitle();
                const contentContainer = container.querySelector('.subtitle-content');
                this.removePracticeElements();
                this.createPracticeElements(contentContainer);
            } else if (e.key === 'ArrowRight') {
                this.showNextSubtitle();
                const contentContainer = container.querySelector('.subtitle-content');
                this.removePracticeElements();
                this.createPracticeElements(contentContainer);
            }
        });
    }

    initializeLoopControl(container) {
        const loopSwitch = container.querySelector('.loop-switch');
        const loopSwitchContainer = container.querySelector('.loop-switch-container');
        let isLooping = false;
        let loopInterval = null;
        let currentLoopingIndex = -1;
        let lastTime = 0; // 添加变量跟踪上一次的时间
        
        const startLoop = () => {
            if (loopInterval) clearInterval(loopInterval);
            
            currentLoopingIndex = this.getCurrentSubtitleIndex();
            if (currentLoopingIndex === -1) return;
            
            const currentSubtitle = this.currentSubtitles[currentLoopingIndex];
            if (!currentSubtitle) return;
            
            // 确保初始播放位置在字幕开始处
            if (this.player.currentTime * 1000 < currentSubtitle.startTime) {
                this.player.currentTime = currentSubtitle.startTime / 1000;
            }
            
            loopInterval = setInterval(() => {
                if (!isLooping || !this.player) return;
                
                const currentTime = this.player.currentTime * 1000;
                
                // 检查是否在当前字幕范围内
                if (currentTime >= currentSubtitle.endTime) {
                    // 如果超出结束时间，立即跳回开始
                    this.player.currentTime = currentSubtitle.startTime / 1000;
                    lastTime = currentSubtitle.startTime;
                } else if (currentTime < currentSubtitle.startTime) {
                    // 如果低于开始时间，也跳回开始
                    this.player.currentTime = currentSubtitle.startTime / 1000;
                    lastTime = currentSubtitle.startTime;
                }
                
                // 更新上一次的时间
                lastTime = currentTime;
            }, 50); // 缩短检查间隔以提高精确度
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
        
        // 在初始化完成后添加控制区按钮
        this.addAnalyzeButtonToControls();
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

    // 修改添加分析按钮的方法
    addAnalyzeButtonToControls = () => {
        const ytpRightControls = document.querySelector('.ytp-right-controls');
        if (!ytpRightControls) return;

        const analyzeContainer = document.createElement('div');
        analyzeContainer.className = 'analyze-switch-container';
        analyzeContainer.innerHTML = `
            <div class="analyze-switch-tooltip">AI解析</div>
            <div class="analyze-switch"></div>
        `;

        // 直接插入到右侧控制区，不依赖于字幕开关
        // 找到合适的参考元素（如果有字幕按钮，在其后插入；否则直接添加到右侧控制区开头）
        const captionButton = ytpRightControls.querySelector('.ytp-subtitles-button');
        if (captionButton) {
            captionButton.after(analyzeContainer);
        } else {
            ytpRightControls.prepend(analyzeContainer);
        }

        const analyzeSwitch = analyzeContainer.querySelector('.analyze-switch');
        analyzeSwitch.addEventListener('click', () => {
            // 检查是否有字幕数据可供分析
            if (!this.currentSubtitles || this.currentSubtitles.length === 0) {
                // 显示提示信息，指示用户先启用字幕
                this.showAnalyzeNotification('请先开启AI双语字幕功能');
                return;
            }

            if (this.analysisPanel.isVisible) {
                this.analysisPanel.hidePanel();
                analyzeSwitch.classList.remove('active');
                return;
            }

            analyzeSwitch.classList.add('active');
            this.analysisPanel.setSubtitles(this.currentSubtitles);
            this.analysisPanel.showPanel();
        });

        // 当分析面板关闭时，更新按钮状态
        this.analysisPanel.onPanelClose = () => {
            analyzeSwitch.classList.remove('active');
        };
    };

    // 添加一个新方法用于显示通知
    showAnalyzeNotification(message) {
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
        notificationContainer.textContent = message;
        
        document.body.appendChild(notificationContainer);
        
        setTimeout(() => {
            notificationContainer.remove();
        }, 3000);
    }

    // 添加新方法用于获取当前字幕的缓存数据
    async getCurrentSubtitleCache() {
        const currentIndex = this.getCurrentSubtitleIndex();
        if (currentIndex === -1) return null;

        const currentSubtitle = this.currentSubtitles[currentIndex];
        if (!currentSubtitle) return null;

        const videoId = UIManager.getYouTubeVideoId();
        const storageKey = `yt-subtitles-${videoId}`;
        const cached = await this.storageManager.getFromStorage(storageKey);

        return cached && cached[currentSubtitle.text];
    }

    setupTextSelection() {
        document.addEventListener('selectionchange', () => {
            // const selection = window.getSelection();
            // const selectedText = selection.toString().trim();
            
            // if (selectedText && this.isSubtitleText(selection)) {
            //     this.handleSubtitleSelection(selection);
            // }
        });
    }

    isSubtitleText(selection) {
        const container = document.getElementById('yt-subtitle-container');
        if (!container) return false;

        const range = selection.getRangeAt(0);
        const selectedNode = range.commonAncestorContainer;
        
        return container.contains(selectedNode) &&
               (selectedNode.closest('.subtitle-english') || 
                selectedNode.closest('.subtitle-chinese'));
    }

    handleSubtitleSelection(selection) {
        // 如果已存在选择工具栏，先移除
        this.removeSelectionToolbar();

        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // 创建选择工具栏
        const toolbar = document.createElement('div');
        toolbar.className = 'subtitle-selection-toolbar';
        toolbar.innerHTML = `
            <button class="toolbar-btn copy-btn" title="复制">
                <i class="copy-icon">📋</i>
            </button>
            <button class="toolbar-btn translate-btn" title="翻译">
                <i class="translate-icon">🔄</i>
            </button>
            <button class="toolbar-btn analyze-btn" title="解析">
                <i class="analyze-icon">🔍</i>
            </button>
        `;

        // 定位工具栏
        toolbar.style.position = 'fixed';
        toolbar.style.left = `${rect.left + (rect.width / 2)}px`;
        toolbar.style.top = `${rect.top - 40}px`;
        toolbar.style.transform = 'translateX(-50%)';
        
        document.body.appendChild(toolbar);

        // 添加按钮事件处理
        this.setupToolbarEvents(toolbar, selection);
    }

    setupToolbarEvents(toolbar, selection) {
        const copyBtn = toolbar.querySelector('.copy-btn');
        const translateBtn = toolbar.querySelector('.translate-btn');
        const analyzeBtn = toolbar.querySelector('.analyze-btn');

        copyBtn.addEventListener('click', () => {
            const text = selection.toString();
            navigator.clipboard.writeText(text);
            this.showToast('已复制到剪贴板');
            this.removeSelectionToolbar();
        });

        translateBtn.addEventListener('click', () => {
            const text = selection.toString();
            // 触发翻译事件
            this.eventBus.emit('translateSelection', text);
            this.removeSelectionToolbar();
        });

        analyzeBtn.addEventListener('click', () => {
            const text = selection.toString();
            // 触发解析事件
            this.eventBus.emit('analyzeSelection', text);
            this.removeSelectionToolbar();
        });

        // 点击其他区域时移除工具栏
        document.addEventListener('mousedown', (e) => {
            if (!toolbar.contains(e.target)) {
                this.removeSelectionToolbar();
            }
        }, { once: true });
    }

    removeSelectionToolbar() {
        const toolbar = document.querySelector('.subtitle-selection-toolbar');
        if (toolbar) {
            toolbar.remove();
        }
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'subtitle-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 2000);
    }

    // Add new method to handle copying subtitles
    async copyAllSubtitles() {
        if (!this.currentSubtitles || this.currentSubtitles.length === 0) {
            this.showToast('没有可复制的字幕');
            return;
        }

        let subtitleText = '';
        for (const subtitle of this.currentSubtitles) {
            const cachedData = this.subtitleCache.get(subtitle.text);
            if (cachedData) {
                subtitleText += `${cachedData.correctedText}\n${cachedData.translation}\n\n`;
            } else {
                subtitleText += `${subtitle.text}\n\n`;
            }
        }

        try {
            await navigator.clipboard.writeText(subtitleText.trim());
            this.showToast('字幕已复制到剪贴板');
        } catch (err) {
            console.error('Failed to copy subtitles:', err);
            this.showToast('复制失败，请重试');
        }
    }

    // 修改 toggleListeningPractice 方法
    toggleListeningPractice() {
        const container = document.getElementById('yt-subtitle-container');
        const contentContainer = container.querySelector('.subtitle-content');
        
        this.isPracticeMode = !this.isPracticeMode;
        
        if (this.isPracticeMode) {
            container.classList.add('practice-mode');
            this.createPracticeElements(contentContainer);
        } else {
            container.classList.remove('practice-mode');
            this.removePracticeElements();
            // 退出练习模式时清空缓存
            this.practiceInputsCache.clear();
        }
    }

    // 修改 createPracticeElements 方法
    createPracticeElements(contentContainer) {
        // 获取当前字幕
        const currentIndex = this.getCurrentSubtitleIndex();
        if (currentIndex === -1) return;

        const currentSubtitle = this.currentSubtitles[currentIndex];
        if (!currentSubtitle) return;

        const cachedData = this.subtitleCache.get(currentSubtitle.text);
        const englishText = cachedData?.correctedText || currentSubtitle.text;
        
        // 创建练习区域
        const practiceArea = document.createElement('div');
        practiceArea.className = 'listening-practice-area';
        
        // 分词并创建输入框 - 改进分词逻辑
        const words = englishText
            .split(/\s+/)
            .filter(word => word.length > 0)
            .map(word => word
                .replace(/[.,!?;:'"]/g, '')
                .replace(/\s/g, '')
                .replace(/['']/g, '')); // 移除标点符号
        
        // 添加字符宽度计算容器
        const widthCalculator = document.createElement('div');
        widthCalculator.className = 'width-calculator';
        // 修改样式以更准确匹配输入框
        widthCalculator.style.cssText = `
            position: absolute;
            visibility: hidden;
            white-space: pre;
            font-size: 16px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 8px 12px;
            border: 2px solid transparent;
            letter-spacing: normal;
            box-sizing: border-box;
            display: inline-block;
        `;
        document.body.appendChild(widthCalculator);

        // 改进宽度计算函数
        const calculateInputWidth = (word) => {
            // 添加一些额外字符来测试宽度
            widthCalculator.textContent = word + 'W'; // 添加一个宽字符作为缓冲
            const wordWidth = widthCalculator.getBoundingClientRect().width;
            
            // 根据字符数量动态调整额外空间
            const extraSpace = word.length <= 3 ? 16 : 24; // 短词给更少的额外空间
            const totalWidth = Math.ceil(wordWidth) + extraSpace;
            
            // 根据单词长度设置不同的最小宽度
            const minWidth = word.length <= 3 ? 50 : 
                            word.length <= 6 ? 70 :
                            90;
            
            return Math.max(minWidth, totalWidth) + 'px';
        };

        const inputsHTML = words.map((word, index) => {
            const decodedWord = Utils.decodeHTMLEntities(word);
            const inputWidth = calculateInputWidth(decodedWord);
            const actualLength = decodedWord.toLowerCase().length;

            console.log("word:",decodedWord,"  ,actualLength:",actualLength);
            
            // 获取缓存的输入值
            const cachedInput = this.practiceInputsCache.get(`${currentIndex}-${index}`);
            const inputValue = cachedInput || '';
            
            return `
                <div class="word-input-container">
                    <input type="text" 
                           class="word-input" 
                           data-word="${decodedWord.toLowerCase()}"
                           data-index="${index}"
                           value="${inputValue}"
                           autocomplete="off"
                           spellcheck="false"
                           maxlength="${actualLength}"
                           placeholder="${'▢'.repeat(actualLength)}"
                           style="--input-width: ${inputWidth}">
                    <span class="word-hint">${decodedWord[0]}${'•'.repeat(actualLength - 1)}</span>
                </div>
            `;
        }).join('');

        practiceArea.innerHTML = `
            <div class="practice-controls">
                <button class="practice-btn show-hint-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    显示提示
                </button>
                <button class="practice-btn reset-practice-btn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                    </svg>
                    重新开始
                </button>
                <button class="practice-btn show-answer-btn">
                    查看答案
                </button>
                <div class="practice-progress">
                    <span class="progress-text">已完成: 0/${words.length}</span>
                </div>
            </div>
            <div class="word-inputs-container">
                ${inputsHTML}
            </div>
        `;

        contentContainer.appendChild(practiceArea);
        
        // 清理宽度计算器
        document.body.removeChild(widthCalculator);
        
        // 将 currentIndex 传递给 setupPracticeEventListeners
        this.setupPracticeEventListeners(practiceArea, words, currentIndex);
    }

    // 修改 setupPracticeEventListeners 方法，添加 currentIndex 参数
    setupPracticeEventListeners(practiceArea, words, currentIndex) {
        const inputs = practiceArea.querySelectorAll('.word-input');
        const showHintBtn = practiceArea.querySelector('.show-hint-btn');
        const resetBtn = practiceArea.querySelector('.reset-practice-btn');
        const showAnswerBtn = practiceArea.querySelector('.show-answer-btn');

        const progressText = practiceArea.querySelector('.progress-text');
        let correctCount = 0;

        // 添加输入框动画效果
        inputs.forEach((input, index) => {
            setTimeout(() => {
                input.style.opacity = '1';
                input.style.transform = 'translateY(0)';
            }, index * 50);
        });

        // 检查所有单词的函数
        const checkAllWords = () => {
            correctCount = 0;
            inputs.forEach((input) => {
                const userInput = input.value.toLowerCase().trim();
                // 获取正确的单词并进行相同的处理
                const correctWord = input.dataset.word.toLowerCase()
                    .replace(/[.,!?;:'"]/g, '') // 移除标点符号
                    .replace(/\s/g, '')  // 移除空格
                    .replace(/['']/g, ''); // 移除撇号
                
                if (userInput === correctWord) {
                    input.classList.add('correct');
                    input.classList.remove('incorrect');
                    if (!input.dataset.counted) {
                        correctCount++;
                        input.dataset.counted = 'true';
                    }
                } else if (userInput) {
                    input.classList.add('incorrect');
                    input.classList.remove('correct');
                    input.dataset.counted = '';
                } else {
                    input.classList.remove('correct', 'incorrect');
                    input.dataset.counted = '';
                }
            });

            progressText.textContent = `已完成: ${correctCount}/${words.length}`;
            
            // 检查是否全部完成
            if (correctCount === words.length) {
                this.showToast('🎉 太棒了！所有单词都正确了！');
                practiceArea.classList.add('completed');
            }
        };

        // 修改输入事件处理，使用传入的 currentIndex
        inputs.forEach((input, index) => {
            input.addEventListener('input', (e) => {
                const userInput = e.target.value.toLowerCase().trim();
                // 使用传入的 currentIndex
                this.practiceInputsCache.set(`${currentIndex}-${index}`, userInput);
                
                // 实时显示当前输入框的状态
                if (userInput === input.dataset.word) {
                    input.classList.add('correct');
                    input.classList.remove('incorrect');
                } else if (userInput && userInput.length >= input.dataset.word.length) {
                    input.classList.add('incorrect');
                    input.classList.remove('correct');
                }
            });

            // 修改键盘事件监听
            input.addEventListener('keydown', (e) => {
                // 阻止所有键盘事件冒泡，防止触发 YouTube 快捷键
                e.stopPropagation();
                
                if (e.key === 'Enter' || e.key === ' ') { // 添加空格键检测
                    e.preventDefault(); // 阻止空格键的默认行为
                    // 每次按回车键或空格键时检查所有单词
                    checkAllWords();
                    // 如果不是最后一个输入框，跳转到下一个
                    if (index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    }
                } else if (e.key === 'Tab') {
                    e.preventDefault();
                    if (index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    }
                } else if (e.key === 'Backspace' && !input.value && index > 0) {
                    inputs[index - 1].focus();
                }
            });

            // 添加 keyup 和 keypress 事件监听，也阻止冒泡
            input.addEventListener('keyup', (e) => {
                e.stopPropagation();
            });

            input.addEventListener('keypress', (e) => {
                e.stopPropagation();
            });
        });

        // 显示提示按钮
        showHintBtn.addEventListener('click', () => {
            practiceArea.classList.toggle('show-hints');
        });

        // 修改重置按钮处理，使用传入的 currentIndex
        resetBtn.addEventListener('click', () => {
            inputs.forEach((input, index) => {
                input.value = '';
                input.classList.remove('correct', 'incorrect');
                input.dataset.counted = '';
                // 使用传入的 currentIndex
                this.practiceInputsCache.delete(`${currentIndex}-${index}`);
            });
            correctCount = 0;
            progressText.textContent = `已完成: 0/${words.length}`;
            inputs[0].focus();
            checkAllWords();
        });

        showAnswerBtn.addEventListener('click', () => {

            const container = document.getElementById('yt-subtitle-container');
            
            if (container.classList.contains('practice-mode')) {
                // 退出练习模式
                container.classList.remove('practice-mode');
            } else {
                // 进入练习模式
                container.classList.add('practice-mode');
            }

        });



        // 自动聚焦第一个输入框
        inputs[0].focus();
    }

    // 移除练习元素
    removePracticeElements() {
        const container = document.getElementById('yt-subtitle-container');
        const practiceArea = container.querySelector('.listening-practice-area');
        if (practiceArea) {
            practiceArea.remove();
        }
    }

    // 添加导航方法
    showNextSubtitle() {
        const currentIndex = this.getCurrentSubtitleIndex();
        if (currentIndex !== -1 && currentIndex < this.currentSubtitles.length - 1) {
            const nextSubtitle = this.currentSubtitles[currentIndex + 1];
            this.player.currentTime = nextSubtitle.startTime / 1000;
        }
    }

    showPreviousSubtitle() {
        const currentIndex = this.getCurrentSubtitleIndex();
        if (currentIndex > 0) {
            const prevSubtitle = this.currentSubtitles[currentIndex - 1];
            this.player.currentTime = prevSubtitle.startTime / 1000;
        }
    }

    // 修改 cleanupCurrentSession 方法，添加清理练习缓存
    cleanupCurrentSession() {
        // ... existing code ...
        this.practiceInputsCache.clear(); // 清空练习输入缓存
        // ... rest of the cleanup code ...
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

export { EventBus, SubtitleManager, TranslationProcessor, UIManager, StorageManager };