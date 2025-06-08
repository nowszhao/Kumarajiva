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

        console.log('🎬 Starting subtitle acquisition process...');

        for (let i = 0; i < maxRetries; i++) {
            console.log(`📝 Attempt ${i + 1}/${maxRetries}`);
            
            try {
                // 新方法：使用YouTube内部API获取字幕
                console.log('🔄 Trying new YouTube API method...');
                const transcriptData = await this.getTranscriptFromNewAPI();
                if (transcriptData) {
                    console.log('✅ Successfully obtained transcript using new API');
                    return transcriptData;
                }
            } catch (error) {
                console.log(`❌ New API attempt ${i + 1} failed:`, error.message);
            }

            // Fallback: 尝试旧方法
            try {
                console.log('🔄 Trying fallback method...');
                const tracks = this.parseCaptionTracks();
                if (tracks.length > 0) {
                    const englishTrack = tracks.find(track => 
                        track.languageCode === 'en' || 
                        track.name?.simpleText?.toLowerCase().includes('english')
                    );
                    console.log('✅ Using fallback method for subtitles');
                    return englishTrack || tracks[0];
                }
                console.log('⚠️ No tracks found in fallback method');
            } catch (error) {
                console.log(`❌ Fallback method attempt ${i + 1} failed:`, error.message);
            }

            if (i < maxRetries - 1) {
                console.log(`⏳ Waiting ${retryInterval}ms before next attempt...`);
                await new Promise(resolve => setTimeout(resolve, retryInterval));
            }
        }
        
        console.log('❌ All subtitle acquisition attempts failed');
        return null;
    }

    async getTranscriptFromNewAPI() {
        // 1. 从 ytInitialData 中提取 transcript 参数
        const transcriptParams = this.extractTranscriptParams();
        if (!transcriptParams) {
            throw new Error('Failed to extract transcript parameters from ytInitialData');
        }

        // 2. 获取视频ID
        const videoId = this.getVideoId();
        if (!videoId) {
            throw new Error('Failed to get video ID from URL');
        }

        // 3. 构建请求参数
        const requestBody = this.buildTranscriptRequestBody(transcriptParams, videoId);

        console.log('Making transcript API request for video:', videoId);

        // 4. 发送请求，包含重试机制
        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const response = await fetch('https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': navigator.userAgent,
                        'Referer': window.location.href,
                        'Origin': 'https://www.youtube.com',
                        'X-YouTube-Client-Name': '1',
                        'X-YouTube-Client-Version': '2.20250606.01.00'
                    },
                    body: JSON.stringify(requestBody),
                    credentials: 'include' // 包含cookies
                });

                if (!response.ok) {
                    const errorText = await response.text().catch(() => 'Unknown error');
                    lastError = new Error(`API request failed (attempt ${attempt}/${maxRetries}): ${response.status} ${response.statusText} - ${errorText}`);
                    console.warn(lastError.message);
                    
                    // 如果是4xx错误，不进行重试
                    if (response.status >= 400 && response.status < 500) {
                        throw lastError;
                    }
                    
                    // 其他错误继续重试
                    if (attempt < maxRetries) {
                        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                        continue;
                    }
                    throw lastError;
                }

                const data = await response.json();
                
                // 验证响应数据的有效性
                if (!data || !data.actions || !Array.isArray(data.actions)) {
                    throw new Error('Invalid API response format: missing actions array');
                }

                console.log('Transcript API request successful');
                return { newAPI: true, data }; // 标记这是新API的数据

            } catch (error) {
                lastError = error;
                console.warn(`Transcript API attempt ${attempt}/${maxRetries} failed:`, error.message);
                
                if (attempt < maxRetries && !error.message.includes('Failed to fetch')) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    continue;
                }
                
                if (attempt === maxRetries) {
                    break;
                }
            }
        }

        throw lastError || new Error('All transcript API attempts failed');
    }

    extractTranscriptParams() {
        // 尝试多种方式获取 ytInitialData
        let ytInitialData = null;

        // 方法1: 从全局变量获取
        if (window.ytInitialData) {
            ytInitialData = window.ytInitialData;
        } else {
            // 方法2: 从script标签解析
            const scriptContent = Array.from(document.scripts)
                .find(script => script.text.includes('var ytInitialData'))?.text;

            if (scriptContent) {
                const match = scriptContent.match(/var ytInitialData\s*=\s*({.+?});/s);
                if (match) {
                    try {
                        ytInitialData = JSON.parse(match[1]);
                    } catch (e) {
                        console.error('Failed to parse ytInitialData:', e);
                    }
                }
            }
        }

        if (!ytInitialData?.engagementPanels) {
            return null;
        }

        // 查找transcript相关参数，优先选择英文字幕
        let transcriptParams = null;

        for (const panel of ytInitialData.engagementPanels) {
            if (panel.engagementPanelSectionListRenderer) {
                const content = panel.engagementPanelSectionListRenderer.content;
                if (content?.continuationItemRenderer) {
                    const continuationEndpoint = content.continuationItemRenderer.continuationEndpoint;
                    if (continuationEndpoint?.getTranscriptEndpoint) {
                        const params = continuationEndpoint.getTranscriptEndpoint.params;
                        const clickTrackingParams = continuationEndpoint.clickTrackingParams;
                        
                        // 检查是否为英文字幕参数
                        const langInfo = this.decodeTranscriptLangInfo(params);
                        
                        // 优先选择英文字幕
                        if (langInfo.isEnglish || !transcriptParams) {
                            transcriptParams = {
                                params,
                                clickTrackingParams,
                                langInfo
                            };
                        }
                    }
                }
            }
        }

        return transcriptParams;
    }

    decodeTranscriptLangInfo(params) {
        try {
            const decoded = atob(params);
            const isEnglish = decoded.includes('en') || decoded.toLowerCase().includes('english');
            const isAutoGenerated = decoded.toLowerCase().includes('asr') || decoded.toLowerCase().includes('auto');
            
            return {
                isEnglish,
                isAutoGenerated,
                raw: params.substring(0, 20) + '...'
            };
        } catch (e) {
            return {
                isEnglish: false,
                isAutoGenerated: false,
                raw: params.substring(0, 20) + '...'
            };
        }
    }

    getVideoId() {
        return new URLSearchParams(window.location.search).get('v');
    }

    buildTranscriptRequestBody(transcriptParams, videoId) {
        // 获取页面基本信息
        const userAgent = navigator.userAgent;
        const screenWidth = window.screen.width;
        const screenHeight = window.screen.height;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        return {
            context: {
                client: {
                    hl: 'zh-CN',
                    gl: 'US',
                    remoteHost: '',
                    deviceMake: this.getDeviceMake(userAgent),
                    deviceModel: '',
                    visitorData: this.getVisitorData(),
                    userAgent: userAgent,
                    clientName: 'WEB',
                    clientVersion: '2.20250606.01.00',
                    osName: this.getOSName(userAgent),
                    osVersion: this.getOSVersion(userAgent),
                    originalUrl: window.location.href,
                    screenPixelDensity: window.devicePixelRatio || 1,
                    platform: 'DESKTOP',
                    clientFormFactor: 'UNKNOWN_FORM_FACTOR',
                    screenDensityFloat: window.devicePixelRatio || 1,
                    userInterfaceTheme: 'USER_INTERFACE_THEME_LIGHT',
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    browserName: this.getBrowserName(userAgent),
                    browserVersion: this.getBrowserVersion(userAgent),
                    acceptHeader: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                    screenWidthPoints: screenWidth,
                    screenHeightPoints: screenHeight,
                    utcOffsetMinutes: -new Date().getTimezoneOffset(),
                    connectionType: 'CONN_CELLULAR_4G'
                },
                user: {
                    lockedSafetyMode: false
                },
                request: {
                    useSsl: true,
                    internalExperimentFlags: [],
                    consistencyTokenJars: []
                },
                clickTracking: {
                    clickTrackingParams: transcriptParams.clickTrackingParams || ''
                }
            },
            params: transcriptParams.params,
            externalVideoId: videoId
        };
    }

    getDeviceMake(userAgent) {
        if (userAgent.includes('Mac')) return 'Apple';
        if (userAgent.includes('Windows')) return 'Microsoft';
        return '';
    }

    getOSName(userAgent) {
        if (userAgent.includes('Mac')) return 'Macintosh';
        if (userAgent.includes('Windows')) return 'Windows';
        if (userAgent.includes('Linux')) return 'Linux';
        return '';
    }

    getOSVersion(userAgent) {
        const macMatch = userAgent.match(/Mac OS X ([\d_]+)/);
        if (macMatch) return macMatch[1];
        
        const winMatch = userAgent.match(/Windows NT ([\d.]+)/);
        if (winMatch) return winMatch[1];
        
        return '';
    }

    getBrowserName(userAgent) {
        if (userAgent.includes('Chrome')) return 'Chrome';
        if (userAgent.includes('Firefox')) return 'Firefox';
        if (userAgent.includes('Safari')) return 'Safari';
        return 'Unknown';
    }

    getBrowserVersion(userAgent) {
        const chromeMatch = userAgent.match(/Chrome\/([\d.]+)/);
        if (chromeMatch) return chromeMatch[1];
        
        const firefoxMatch = userAgent.match(/Firefox\/([\d.]+)/);
        if (firefoxMatch) return firefoxMatch[1];
        
        const safariMatch = userAgent.match(/Version\/([\d.]+).*Safari/);
        if (safariMatch) return safariMatch[1];
        
        return '';
    }

    getVisitorData() {
        // 尝试多种方式获取visitorData
        
        // 从ytInitialData获取
        if (window.ytInitialData?.responseContext?.visitorData) {
            return window.ytInitialData.responseContext.visitorData;
        }

        // 从ytInitialPlayerResponse获取
        if (window.ytInitialPlayerResponse?.responseContext?.visitorData) {
            return window.ytInitialPlayerResponse.responseContext.visitorData;
        }

        // 从页面script标签解析
        const scriptContent = Array.from(document.scripts)
            .find(script => script.text.includes('visitorData'))?.text;
        
        if (scriptContent) {
            const visitorDataMatch = scriptContent.match(/"visitorData":"([^"]+)"/);
            if (visitorDataMatch) {
                return visitorDataMatch[1];
            }
        }

        // 从cookies中获取
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'VISITOR_INFO1_LIVE') {
                return value;
            }
        }
        
        // 回退方案
        return 'CgtCVU1wYndWRjB4QSid1ZbCBjIKCgJVUxIEGgAgSA%3D%3D';
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
        // 检查是否是新API返回的数据
        if (track.newAPI) {
            return this.parseNewAPIResponse(track.data);
        }

        // 旧方法：解析XML字幕
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

        return this.mergeSubtitles(rawSubtitles);
    }

    parseNewAPIResponse(data) {
        try {
            // 解析新API的响应格式
            const actions = data.actions;
            if (!actions || !actions[0]) {
                throw new Error('Invalid response format: no actions found');
            }

            const updateAction = actions[0].updateEngagementPanelAction;
            if (!updateAction) {
                throw new Error('Invalid response format: no updateEngagementPanelAction found');
            }

            const transcriptRenderer = updateAction.content?.transcriptRenderer;
            if (!transcriptRenderer) {
                throw new Error('Invalid response format: no transcriptRenderer found');
            }

            const searchPanelRenderer = transcriptRenderer.content?.transcriptSearchPanelRenderer;
            if (!searchPanelRenderer) {
                throw new Error('Invalid response format: no transcriptSearchPanelRenderer found');
            }

            const segmentListRenderer = searchPanelRenderer.body?.transcriptSegmentListRenderer;
            if (!segmentListRenderer) {
                throw new Error('Invalid response format: no transcriptSegmentListRenderer found');
            }

            const segments = segmentListRenderer.initialSegments;
            if (!segments || !Array.isArray(segments)) {
                throw new Error('Invalid response format: no initialSegments found');
            }

            console.log(`Found ${segments.length} transcript segments`);

            // 转换为标准格式
            const rawSubtitles = segments.map((segment, index) => {
                const renderer = segment.transcriptSegmentRenderer;
                if (!renderer) {
                    return null;
                }

                const startMs = parseInt(renderer.startMs);
                const endMs = parseInt(renderer.endMs);
                
                // 处理文本内容 - 可能有多个runs
                let text = '';
                if (renderer.snippet?.runs && Array.isArray(renderer.snippet.runs)) {
                    text = renderer.snippet.runs.map(run => run.text || '').join('');
                } else {
                    text = renderer.snippet?.runs?.[0]?.text || '';
                }

                // 验证时间戳
                if (isNaN(startMs) || isNaN(endMs) || startMs < 0 || endMs <= startMs) {
                    return null;
                }

                return {
                    startTime: startMs,
                    endTime: endMs,
                    text: text.trim()
                };
            }).filter(subtitle => subtitle !== null && subtitle.text);

            console.log(`Parsed ${rawSubtitles.length} valid subtitles`);

            if (rawSubtitles.length === 0) {
                throw new Error('No valid subtitles found in API response');
            }

            return this.mergeSubtitles(rawSubtitles);
        } catch (error) {
            console.error('Failed to parse new API response:', error);
            throw error;
        }
    }

    mergeSubtitles(rawSubtitles) {
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
        this.isBlurMode = false;
        
        // 初始化快捷键
        this.initializeShortcuts();

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
            
            // 获取当前播放的字幕
            let currentSubtitle;
            
            // 如果是模糊模式切换或者其他非时间更新触发的情况，优先获取当前播放时间对应的字幕
            const currentIndex = this.getCurrentSubtitleIndex();
            if (currentIndex !== -1) {
                currentSubtitle = this.currentSubtitles[currentIndex];
            } 
            // 如果找不到当前播放的字幕，再考虑使用传入的字幕
            else if (subtitles.length > 0 && subtitles[0]) {
                currentSubtitle = subtitles[0];
            } 
            // 最后的兜底方案，使用第一个字幕
            else {
                currentSubtitle = this.currentSubtitles[0];
            }
            
            if (!currentSubtitle) return;
            
            // 获取缓存数据
            const cachedData = this.subtitleCache.get(currentSubtitle.text);
            const englishText = cachedData?.correctedText || currentSubtitle.text;
            const chineseText = cachedData?.translation || '';
            
            // 创建字幕项
            const item = document.createElement('div');
            item.className = 'subtitle-item';
            // 根据 isBlurMode 切换英文字幕样式
            item.innerHTML = `
                <div class="subtitle-english${this.isBlurMode ? ' blur-mode' : ''}">${englishText}</div>
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
            <div class="subtitle-controls-group loop-practice-blur-group">
                <div class="loop-switch-container">
                    <div class="loop-switch"></div><div class="loop-switch-label">循环</div>
                </div>
                <div class="practice-switch-container">
                    <div class="practice-switch"></div><div class="practice-switch-label">听力</div>
                </div>
                <div class="blur-switch-container">
                    <div class="blur-switch"></div><div class="blur-switch-label">模糊</div>
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
        // 新增模糊字幕开关
        const blurSwitch = controlPanel.querySelector('.blur-switch');
        blurSwitch.addEventListener('click', () => {
            this.isBlurMode = !this.isBlurMode;
            blurSwitch.classList.toggle('active', this.isBlurMode);
            this.updateSubtitleDisplay(this.currentSubtitles);
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
    
    // 添加快捷键初始化方法
    initializeShortcuts() {
        document.addEventListener('keydown', (e) => {
            // 防止与输入框冲突
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            // Ctrl+1: 切换循环
            if (e.ctrlKey && e.key === '1') {
                e.preventDefault(); // 阻止默认行为
                const loopSwitch = document.querySelector('.loop-switch');
                if (loopSwitch) {
                    loopSwitch.click(); // 模拟点击循环开关
                }
            }
            
            // Ctrl+2: 切换听力练习
            else if (e.ctrlKey && e.key === '2') {
                e.preventDefault(); // 阻止默认行为
                const practiceSwitch = document.querySelector('.practice-switch');
                if (practiceSwitch) {
                    practiceSwitch.click(); // 模拟点击听力练习开关
                }
            }
            
            // Ctrl+3: 切换模糊
            else if (e.ctrlKey && e.key === '3') {
                e.preventDefault(); // 阻止默认行为
                const blurSwitch = document.querySelector('.blur-switch');
                if (blurSwitch) {
                    blurSwitch.click(); // 模拟点击模糊开关
                }
            }
            
            // Ctrl+N: 下一句
            else if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
                e.preventDefault(); // 阻止默认行为
                const nextButton = document.querySelector('.next-button');
                if (nextButton && !nextButton.disabled) {
                    nextButton.click(); // 模拟点击下一句按钮
                }
            }
            
            // Ctrl+B: 上一句
            else if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
                e.preventDefault(); // 阻止默认行为
                const prevButton = document.querySelector('.prev-button');
                if (prevButton && !prevButton.disabled) {
                    prevButton.click(); // 模拟点击上一句按钮
                }
            }
        });
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
        let loopCount = 0; // 添加循环计数器
        
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
        
        // 根据循环次数设置播放速度
        const setPlaybackRateByLoopCount = () => {
            if (!this.player) return;
            
            // 根据循环次数设置播放速度
            if (loopCount <= 2) {
                this.player.playbackRate = 1.0; // 正常速度
            } else if (loopCount < 8) {
                this.player.playbackRate = 0.75; // 降低到0.75速度
            } else {
                this.player.playbackRate = 0.5; // 降低到0.5速度
            }
            
            console.log(`循环次数: ${loopCount}, 播放速度: ${this.player.playbackRate}`);
        };
        
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
                    
                    // 增加循环计数
                    loopCount++;
                    
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
                    
                    // 根据循环次数设置播放速度
                    setPlaybackRateByLoopCount();
                    

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
            
            // 重置循环计数
            loopCount = 0;
            
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
                    
                    // 初始化播放速度为正常
                    this.player.playbackRate = 1.0;
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
            loopCount = 0;
            
            // 恢复正常播放速度
            if (this.player) {
                this.player.playbackRate = 1.0;
            }
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
                loopInterval = setInterval(handleLoopPlayback, 50);
            }
        });
        
        // 监听字幕切换事件
        this.player.addEventListener('timeupdate', () => {
            if (isLooping) {
                const newIndex = this.getCurrentSubtitleIndex();
                if (newIndex !== -1 && newIndex !== currentLoopingIndex) {
                    currentLoopingIndex = newIndex;
                    // 字幕变更时，重启循环（重置循环计数）
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

