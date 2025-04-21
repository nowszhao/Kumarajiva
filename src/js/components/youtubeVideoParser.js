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

        // 解决字幕容器在控制栏出现时自动隐藏的问题
        this.updateSubtitleBottomByControlBar();

    }

    updateSubtitleBottomByControlBar() {
        const player1 = document.getElementById('movie_player');
        const subtitle1 = document.querySelector('.subtitle-container');
        if (player1 && subtitle1) {
            player1.addEventListener('mouseleave', () => {
                subtitle1.style.bottom = '0px';
            });
            player1.addEventListener('mousemove', (e) => {
                const rect = player1.getBoundingClientRect();
                const y = e.clientY - rect.top;
                if (y < rect.height / 16) {
                    subtitle1.style.bottom = '0px';
                } else {
                    subtitle1.style.bottom = '60px';
                }
            });
        }
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
        
        // 简单的提示音函数 - 使用系统提示音
        const beep = () => {
            try {
                // 使用chrome.runtime.getURL获取插件内资源的完整URL
                const audioUrl = chrome.runtime.getURL('nt.mp3'); // 直接使用文件名，因为已在manifest中声明
                console.log('尝试加载音频文件:', audioUrl);
                
                const audio = new Audio(audioUrl);
                
                // 添加错误处理
                audio.onerror = (e) => {
                    console.warn('音频加载失败，错误码:', audio.error?.code, '尝试使用内置音频');
                    playFallbackAudio();
                };
                
                audio.play().catch(error => {
                    console.warn('音频播放失败:', error);
                    playFallbackAudio();
                });
            } catch (e) {
                console.warn('音频初始化失败:', e);
                playFallbackAudio();
            }
            
            // 回退音频播放函数
            function playFallbackAudio() {
                // 使用Web Audio API作为备用方案
                useWebAudioAPI();
            }
            
            // 使用Web Audio API作为最后的备用方案
            function useWebAudioAPI() {
                try {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const oscillator = audioContext.createOscillator();
                    const gainNode = audioContext.createGain();
                    
                    oscillator.type = 'sine';
                    oscillator.frequency.value = 440;
                    gainNode.gain.value = 0.3;
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(audioContext.destination);
                    
                    oscillator.start();
                    setTimeout(() => {
                        oscillator.stop();
                        setTimeout(() => audioContext.close(), 100);
                    }, 300);
                } catch (err) {
                    console.error('所有提示音方法都失败:', err);
                }
            }
        }
        
        // 循环播放处理逻辑
        const handleLoopPlayback = async () => {
            if (!isLooping || !this.player) return;
            
            // 如果正在处理循环，直接返回
            if (handleLoopPlayback.isProcessing) return;
            
            const currentIndex = this.getCurrentSubtitleIndex();
            if (currentIndex === -1) return;
            
            const currentSubtitle = this.currentSubtitles[currentIndex];
            if (!currentSubtitle) return;
            
            const currentTime = this.player.currentTime * 1000;
            
            // 提前200ms触发循环，确保不会播放到下一个字幕
            if (currentTime >= currentSubtitle.endTime - 200) {
                try {
                    // 设置锁定标志
                    handleLoopPlayback.isProcessing = true;
                    
                    // 记录当前播放速率和位置
                    const currentRate = this.player.playbackRate;
                    
                    // 播放提示音
                    beep();
                    // 立即暂停视频，防止继续播放到下一个字幕
                    this.player.pause();
                    
                    console.log('开始等待2秒...', new Date().toISOString());
                    
                    // 强制等待2秒 - 使用Promise.all确保至少等待指定时间
                    await Promise.all([
                        new Promise(resolve => setTimeout(resolve, 2000))
                    ]);
                    
                    console.log('等待结束，重置位置', new Date().toISOString());
                    
                    // 设置回字幕开始位置
                    this.player.currentTime = currentSubtitle.startTime / 1000;
                    
                    // 恢复原始播放速率
                    this.player.playbackRate = currentRate;
                    

                    // 恢复播放
                    try {
                        await this.player.play();
                    } catch (e) {
                        console.warn('无法自动恢复播放:', e);
                        showPlayButton(); // 显示播放按钮让用户手动继续
                    }
                    
                } catch (error) {
                    console.error('循环播放处理错误:', error);
                } finally {
                    // 延迟300ms后解除锁定，进一步防止重复触发
                    setTimeout(() => {
                        handleLoopPlayback.isProcessing = false;
                        console.log('循环处理锁定已解除');
                    }, 300);
                }
            }
        };
        
        // 初始化处理状态
        handleLoopPlayback.isProcessing = false;
        
        // 显示播放按钮
        const showPlayButton = () => {
            if (document.querySelector('.loop-play-button')) return;
            
            const button = document.createElement('button');
            button.className = 'loop-play-button';
            button.innerHTML = '点击继续播放';
            button.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(156, 39, 176, 0.8);
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 4px;
                font-size: 16px;
                cursor: pointer;
                z-index: 2147483647;
            `;
            
            button.addEventListener('click', () => {
                if (this.player) {
                    this.player.play().catch(() => {
                        console.error('用户点击后仍无法播放');
                    });
                }
                button.remove();
            });
            
            // 添加到视频容器中
            const videoContainer = document.querySelector('.html5-video-container');
            if (videoContainer) {
                videoContainer.appendChild(button);
                
                // 5秒后自动移除
                setTimeout(() => {
                    if (document.body.contains(button)) {
                        button.remove();
                    }
                }, 5000);
            }
        };
        
        // 启动循环
        const startLoop = () => {
            // 先清除之前的循环
            if (loopInterval) {
                clearInterval(loopInterval);
            }
            
            // 每50毫秒检查一次是否需要循环
            loopInterval = setInterval(handleLoopPlayback, 50);
            
            // 找到当前字幕索引
            currentLoopingIndex = this.getCurrentSubtitleIndex();
            if (currentLoopingIndex !== -1) {
                const currentSubtitle = this.currentSubtitles[currentLoopingIndex];
                if (currentSubtitle && this.player) {
                    // 确保从字幕起始位置开始播放
                    if (this.player.currentTime * 1000 < currentSubtitle.startTime) {
                        this.player.currentTime = currentSubtitle.startTime / 1000;
                    }
                }
            }
        };
        
        // 停止循环
        const stopLoop = () => {
            if (loopInterval) {
                clearInterval(loopInterval);
                loopInterval = null;
            }
            currentLoopingIndex = -1;
        };
        
        // 循环开关点击事件
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
        
        // 监听视频暂停事件
        this.player.addEventListener('pause', () => {
            // 只有在暂停时暂时清除循环检查
            if (loopInterval) {
                clearInterval(loopInterval);
                loopInterval = null;
            }
        });
        
        // 监听视频播放事件
        this.player.addEventListener('play', () => {
            // 如果循环已开启，恢复循环检查
            if (isLooping && !loopInterval) {
                startLoop();
            }
        });
        
        // 监听字幕切换事件
        this.player.addEventListener('timeupdate', () => {
            if (isLooping) {
                const newIndex = this.getCurrentSubtitleIndex();
                if (newIndex !== -1 && newIndex !== currentLoopingIndex) {
                    currentLoopingIndex = newIndex;
                    // 字幕变更时，重启循环
                    startLoop();
                }
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
        // 先对英文文本进行预处理，转换HTML实体
        let englishText = cachedData?.correctedText || currentSubtitle.text;
        englishText = englishText.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        
        // 创建练习区域
        const practiceArea = document.createElement('div');
        practiceArea.className = 'listening-practice-area';
        
        // 保存原始句子文本，用于后续比对
        practiceArea.dataset.originalText = englishText.trim();
        
        // 分词 - 更有效地处理单词分割
        const words = this.extractWords(englishText);
        
        console.log("=======englishText-ori", englishText);
        console.log("=======englishText-words", words);
        
        // 获取之前的输入（如果有）
        const cachedInput = this.practiceInputsCache.get(`${currentIndex}-fullInput`) || '';

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
                <div class="practice-progress">
                    <span class="progress-text">已完成: 0/${words.length}</span>
                </div>
            </div>
            <div class="sentence-input-container">
                <div class="hint-text">${englishText}</div>
                <textarea 
                    class="sentence-input" 
                    placeholder="请输入听到的句子..."
                    spellcheck="false"
                    autocomplete="off"
                    rows="3"
                >${cachedInput}</textarea>
                <div class="words-stats">
                    <span class="input-words-count">输入单词: 0</span>
                    <span class="correct-words-count">正确单词: 0</span>
                    <span class="total-words-count">总单词数: ${words.length}</span>
                </div>
                <div class="matched-preview"></div>
            </div>
        `;

        contentContainer.appendChild(practiceArea);
        
        // 设置事件监听器
        this.setupPracticeEventListeners(practiceArea, words, currentIndex);
    }
    
    // 新增方法：更智能地提取单词
    extractWords(text) {
        // 预处理文本，规范标点和空格
        let processedText = text.trim()
            .replace(/[""]/g, '"')
            .replace(/['']/g, "'");
            
        // 特殊处理：修复可能的编码问题，比如'39'实际上是撇号
        processedText = processedText.replace(/'39'/g, "'")
                                    .replace(/'39/g, "'")
                                    .replace(/39'/g, "'")
                                    .replace(/&#39;/g, "'")
                                    .replace(/\\'39\\'/g, "'")
                                    .replace(/\\'/g, "'");
            
        console.log("处理后的文本:", processedText);
            
        // 更精确的单词分割正则表达式
        // 这个正则表达式匹配连续的字母、数字、撇号或连字符
        const wordRegex = /[\w''-]+/g;
        const matches = processedText.match(wordRegex) || [];
        
        return matches.map(word => {
            // 存储原始单词形式
            const original = word;
            
            // 清理后的单词，用于匹配
            let clean = word
                .replace(/[.,!?;:'""`]/g, '')
                .replace(/\s/g, '')
                .replace(/&quot;/g, '')
                .replace(/'39'/g, "'")
                .replace(/39/g, "'")
                .toLowerCase();
                
            return { original, clean };
        });
    }
    
    // 添加更新事件监听器函数
    setupPracticeEventListeners(practiceArea, words, currentIndex) {
        const sentenceInput = practiceArea.querySelector('.sentence-input');
        const matchedPreview = practiceArea.querySelector('.matched-preview');
        const showHintBtn = practiceArea.querySelector('.show-hint-btn');
        const resetBtn = practiceArea.querySelector('.reset-practice-btn');
        const hintText = practiceArea.querySelector('.hint-text');
        const progressText = practiceArea.querySelector('.progress-text');
        const originalText = practiceArea.dataset.originalText;

        // 隐藏提示文本
        hintText.style.visibility = 'hidden';
        hintText.style.position = 'absolute';
        hintText.style.opacity = '0';
        
        // 初始化匹配预览 - 不显示未匹配的单词，只显示已匹配的
        matchedPreview.innerHTML = '';

        // 设置输入框焦点
        setTimeout(() => sentenceInput.focus(), 100);
        
        // 显示提示按钮
        showHintBtn.addEventListener('click', () => {
            if (hintText.style.visibility === 'hidden') {
                hintText.style.visibility = 'visible';
                hintText.style.position = 'static';
                hintText.style.opacity = '0.7';
                showHintBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    隐藏提示`;
            } else {
                hintText.style.visibility = 'hidden';
                hintText.style.position = 'absolute';
                hintText.style.opacity = '0';
                showHintBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                    </svg>
                    显示提示`;
            }
        });

        // 重置按钮
        resetBtn.addEventListener('click', () => {
            sentenceInput.value = '';
            matchedPreview.innerHTML = '';
            this.practiceInputsCache.set(`${currentIndex}-fullInput`, '');
            this.checkMatchedWords(sentenceInput.value, words, matchedPreview, progressText, false);
            sentenceInput.focus();
        });

        // 输入变化事件 - 实时检查匹配
        sentenceInput.addEventListener('input', () => {
            this.practiceInputsCache.set(`${currentIndex}-fullInput`, sentenceInput.value);
            this.checkMatchedWords(sentenceInput.value, words, matchedPreview, progressText, false);
        });

        // 键盘事件
        sentenceInput.addEventListener('keydown', (e) => {
            // 阻止所有键盘事件冒泡，防止触发 YouTube 快捷键
            e.stopPropagation();
            
            // 按下 Enter 键时计算匹配情况
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.checkMatchedWords(sentenceInput.value, words, matchedPreview, progressText, false);
            }
        });
        
        // 添加 keyup 和 keypress 事件监听，也阻止冒泡
        sentenceInput.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });

        sentenceInput.addEventListener('keypress', (e) => {
            e.stopPropagation();
        });

        // 初始检查
        if (sentenceInput.value) {
            this.checkMatchedWords(sentenceInput.value, words, matchedPreview, progressText, false);
        }
    }
    
    // 修改方法：检查匹配的单词
    checkMatchedWords(inputText, originalWords, previewElement, progressElement, showUnmatched = true) {
        // 使用相同的提取单词方法确保一致性
        const inputMatches = this.extractWords(inputText);
        const inputWords = inputMatches.map(w => w.clean);

        console.log("输入单词:", inputWords);
        console.log("原始单词:", originalWords.map(w => w.clean));
        
        // 跟踪匹配状态
        const matchedStatus = originalWords.map(() => false);
        let matchedCount = 0;
        
        // 为每个输入单词寻找匹配
        inputWords.forEach(inputWord => {
            if (!inputWord) return;
            let matched = false;
            
            // 尝试匹配尚未匹配的原始单词 - 精确匹配
            for (let i = 0; i < originalWords.length; i++) {
                if (matchedStatus[i]) continue; // 已匹配的跳过
                
                const originalClean = originalWords[i].clean;
                
                // 尝试多种匹配方式
                if (originalClean === inputWord || 
                    // 处理可能的撇号问题
                    originalClean.replace(/39/g, "'") === inputWord ||
                    inputWord.replace(/39/g, "'") === originalClean ||
                    // 忽略撇号的匹配
                    originalClean.replace(/'/g, "") === inputWord.replace(/'/g, "") ||
                    // 附加的灵活匹配 - 考虑词形变化
                    (originalClean.includes(inputWord) && inputWord.length > 3) ||
                    (inputWord.includes(originalClean) && originalClean.length > 3)
                   ) {
                    matchedStatus[i] = true;
                    matchedCount++;
                    matched = true;
                    console.log(`匹配成功: "${inputWord}" 匹配到了 "${originalWords[i].original}" (清理后: "${originalClean}")`);
                    break;
                }
            }
            
            if (!matched) {
                console.log(`未匹配: "${inputWord}" 没有找到匹配`);
                // 打印出所有可能的匹配，帮助调试
                originalWords.forEach((word, idx) => {
                    if (!matchedStatus[idx]) {
                        console.log(`  可能的匹配 #${idx}: "${word.original}" (清理后: "${word.clean}")`);
                    }
                });
            }
        });

        // 更新进度
        progressElement.textContent = `已完成: ${matchedCount}/${originalWords.length}`;
        
        // 获取和更新详细单词统计
        const practiceArea = previewElement.closest('.listening-practice-area');
        if (practiceArea) {
            const inputWordsCount = practiceArea.querySelector('.input-words-count');
            const correctWordsCount = practiceArea.querySelector('.correct-words-count');
            
            if (inputWordsCount) {
                inputWordsCount.textContent = `输入单词: ${inputWords.length}`;
            }
            
            if (correctWordsCount) {
                correctWordsCount.textContent = `正确单词: ${matchedCount}`;
                
                // 视觉指示器 - 根据匹配比例更改颜色
                if (matchedCount > 0) {
                    const matchRatio = matchedCount / Math.max(1, inputWords.length);
                    if (matchRatio >= 0.8) {
                        correctWordsCount.className = 'correct-words-count high-match';
                    } else if (matchRatio >= 0.5) {
                        correctWordsCount.className = 'correct-words-count medium-match';
                    } else {
                        correctWordsCount.className = 'correct-words-count low-match';
                    }
                } else {
                    correctWordsCount.className = 'correct-words-count';
                }
            }
        }
        
        // 生成匹配预览 - 只显示已匹配的单词，未匹配的显示为空格
        let previewHTML = '';
        originalWords.forEach((word, index) => {
            if (matchedStatus[index]) {
                previewHTML += `<span class="matched-word">${word.original}</span> `;
            } else if (showUnmatched) {
                previewHTML += `<span class="unmatched-word">${word.original}</span> `;
            } else {
                // 用空格占位，保持文本对齐
                previewHTML += `<span class="placeholder-word"></span> `;
            }
        });
        
        previewElement.innerHTML = previewHTML;
        
        // 检查是否全部完成
        if (matchedCount === originalWords.length) {
            this.showToast('🎉 太棒了！所有单词都正确了！');
            previewElement.classList.add('all-matched');
        } else {
            previewElement.classList.remove('all-matched');
        }
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

