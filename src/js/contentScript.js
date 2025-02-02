import { TranslatorFactory } from '../translators';
import config from '../config/config';

// 将所有代码包装在一个立即执行函数中以避免全局变量污染
(function() {
    // 检查是否已经初始化
    if (window.youtubeSubtitleTranslatorInitialized) {
        return;
    }
    window.youtubeSubtitleTranslatorInitialized = true;

    console.log("####### contentScript.js ");

    const MAX_SUBTITLES = 5;
    const BATCH_SIZE = 5; // 每批处理的字幕数量
    const BATCH_INTERVAL = 2000; // 添加批次间隔时间(ms)
    const SUBTITLE_STORAGE_KEY = 'yt-subtitles-'; // 存储键前缀

    // 全局状态
    let currentChatId = null;
    let subtitleCache = new Map();
    let currentSubtitles = [];
    let player = null;
    let processingStatus = {
        total: 0,
        processed: 0,
        isProcessing: false
    };

    // 添加全局开关状态
    let isSubtitleEnabled = false;

    // 在全局变量声明后，添加 throttle 函数的实现
    function throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    // 修改 URL 变化监听函数
    function setupUrlChangeListener() {
        let lastUrl = location.href;
        let lastVideoId = new URLSearchParams(window.location.search).get('v');

        const checkForVideoChange = () => {
            const currentUrl = location.href;
            const newVideoId = new URLSearchParams(window.location.search).get('v');
            
            // 只在视频页面进行处理
            if (!currentUrl.includes('youtube.com/watch')) {
                if (lastUrl.includes('youtube.com/watch')) {
                    console.log('Leaving video page, cleaning up');
                    cleanupCurrentSession();
                }
                lastUrl = currentUrl;
                lastVideoId = null;
                return;
            }

            // 检查视频ID是否变化
            if (newVideoId && newVideoId !== lastVideoId) {
                console.log('Video ID changed from', lastVideoId, 'to', newVideoId);
                lastVideoId = newVideoId;
                lastUrl = currentUrl;
                
                // 清理当前会话并重新初始化
                cleanupCurrentSession();
                setTimeout(() => {
                    initializePlugin();
                }, 1000); // 增加延迟以确保页面完全加载
            }
        };

        // 添加消息监听器
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.type === 'VIDEO_CHANGED') {
                console.log('Received VIDEO_CHANGED message:', message);
                checkForVideoChange();
            }
        });

        // 使用已定义的 throttle 函数
        const throttledCheck = throttle(checkForVideoChange, 1000);
        
        window.addEventListener('popstate', throttledCheck);
        window.addEventListener('pushstate', throttledCheck);
        window.addEventListener('replacestate', throttledCheck);
        document.addEventListener('yt-navigate-start', throttledCheck);
        document.addEventListener('yt-navigate-finish', throttledCheck);

        // 修改 MutationObserver 配置
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

        // 初始检查
        checkForVideoChange();
    }

    // 修改初始化函数
    function initializeExtension() {
        // 防止重复初始化
        // if (window.youtubeSubtitleTranslatorInitialized) {
        //     console.log('Extension already initialized globally');
        //     return;
        // }
        // window.youtubeSubtitleTranslatorInitialized = true;

        console.log("####### contentScript.js initializing");
        
        // 只设置一次 URL 变化监听器
        setupUrlChangeListener();
        
        // 修改这部分，确保在视频页面时一定会初始化插件
        if (location.href.includes('youtube.com/watch')) {
            // 添加延迟确保 DOM 完全加载
            setTimeout(() => {
                console.log('Initializing plugin for video page');
                initializePlugin();
            }, 1000);
        }
    }

    // 修改 cleanupCurrentSession 函数
    function cleanupCurrentSession() {
        console.log('Starting cleanup of current session');
        
        try {
            // 停止所有事件监听
            if (player) {
                player.removeEventListener('timeupdate', onTimeUpdate);
            }
            
            // 清理字幕容器
            const subtitleContainer = document.getElementById('yt-subtitle-container');
            if (subtitleContainer) {
                subtitleContainer.remove();
            }
            
            // 清理进度条容器
            const progressContainer = document.getElementById('translation-progress');
            if (progressContainer) {
                progressContainer.remove();
            }
            
            // 重置全局状态
            currentChatId = null;
            subtitleCache = new Map();
            currentSubtitles = [];
            player = null;
            processingStatus = {
                total: 0,
                processed: 0,
                isProcessing: false
            };
            
            // 重置初始化标志
            window.isPluginInitialized = false;
            window.isPluginInitializing = false;
            window.currentInitializedVideoId = null;
        
            
            // 保持开关按钮
            const switchContainer = document.querySelector('.subtitle-switch-container');
            if (switchContainer) {
                const switchElement = switchContainer.querySelector('.subtitle-switch');
                if (!isSubtitleEnabled) {
                    switchElement.classList.remove('active');
                }
            }
            
            console.log('Session cleanup completed successfully');
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    // 修改 initializePlugin 函数
    async function initializePlugin() {
        const videoId = new URLSearchParams(window.location.search).get('v');
        
        // 确保开关按钮存在
        if (!document.querySelector('.subtitle-switch-container')) {
            addSubtitleSwitch();
        }

        // 只有在开关启用时才初始化核心功能
        if (isSubtitleEnabled) {
            await initializePluginCore(videoId);
        }
    }

    // 将原有的初始化逻辑移到新函数中
    async function initializePluginCore(videoId) {
        // 检查是否已添加开关按钮
        if (!document.querySelector('.subtitle-switch-container')) {
            addSubtitleSwitch();
        }

        // 如果开关未启用，不继续初始化
        if (!isSubtitleEnabled) {
            return;
        }

        // 等待YouTube播放器加载
        player = await waitForYouTubePlayer();
        console.log("Player loaded:", !!player);

        if (!player) {
            console.log('Failed to load player');
            return;
        }

        // 创建新的容器
        createSubtitleContainer();
        createProgressContainer();
        
        // 等待一段时间确保YouTube完全加载
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // 初始化字幕数据
        const englishTrack = await getEnglishSubtitleTrack();
        console.log("englishTrack:", englishTrack);

        if (!englishTrack) {
            // 创建提示容器
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
            
            // 添加刷新按钮点击事件
            const refreshButton = notificationContainer.querySelector('button');
            refreshButton.addEventListener('click', () => {
                location.reload();
            });
            
            // 5秒后自动移除提示
            setTimeout(() => {
                notificationContainer.remove();
            }, 5000);
            
            console.error('No English subtitles available');
            return;
        }

        // 获取完整字幕数据
        const subtitleData = await fetchAndParseSubtitles(englishTrack);
        console.log("subtitleData:", subtitleData);
        
        if (!subtitleData.length) return;
        
        // 保存字幕数据到全局变量
        currentSubtitles = subtitleData;

        // 添加事件监听
        player.addEventListener('timeupdate', onTimeUpdate);

        // 批量处理字幕
        await batchProcessSubtitles(currentSubtitles);
    }

    function createSubtitleContainer() {
        const container = document.createElement('div');
        container.className = 'subtitle-container';
        container.id = 'yt-subtitle-container';
        
        // 添加拖拽手柄
        const dragHandle = document.createElement('div');
        dragHandle.className = 'subtitle-drag-handle';
        dragHandle.innerHTML = '⋮⋮';
        container.appendChild(dragHandle);
        
        // 创建控制面板
        const controlPanel = document.createElement('div');
        controlPanel.className = 'subtitle-control-panel';
        
        // 创建第一组控制按钮（循环和导航）
        const controlsGroup1 = document.createElement('div');
        controlsGroup1.className = 'subtitle-controls-group';
        
        // 添加循环播放开关
        const loopSwitchContainer = document.createElement('div');
        loopSwitchContainer.className = 'loop-switch-container';
        loopSwitchContainer.innerHTML = `
            <div class="loop-switch-tooltip">循环播放当前字幕</div>
            <div class="loop-switch"></div>
        `;
        controlsGroup1.appendChild(loopSwitchContainer);
        
        // 创建导航按钮组
        const navGroup = document.createElement('div');
        navGroup.className = 'subtitle-nav-group';
        
        // 添加导航按钮
        const prevButton = document.createElement('button');
        prevButton.className = 'nav-button prev-button';
        prevButton.title = '跳转到上一句';
        prevButton.textContent = '上一句';
        navGroup.appendChild(prevButton);
        
        const nextButton = document.createElement('button');
        nextButton.className = 'nav-button next-button';
        nextButton.title = '跳转到下一句';
        nextButton.textContent = '下一句';
        navGroup.appendChild(nextButton);
        
        controlsGroup1.appendChild(navGroup);
        controlPanel.appendChild(controlsGroup1);
        container.appendChild(controlPanel);
        
        // 创建缩放控制器（独立面板）
        const scaleControl = document.createElement('div');
        scaleControl.className = 'subtitle-scale-control';
        scaleControl.innerHTML = `
            <button class="scale-btn scale-down" title="缩小字幕">-</button>
            <span class="scale-value">100%</span>
            <button class="scale-btn scale-up" title="放大字幕">+</button>
        `;
        container.appendChild(scaleControl);
        
        // 创建字幕内容容器
        const contentContainer = document.createElement('div');
        contentContainer.className = 'subtitle-content';
        container.appendChild(contentContainer);
        
        // 修改插入位置到播放器容器
        const playerContainer = document.querySelector('#movie_player');
        if (playerContainer) {
            playerContainer.appendChild(container);
            console.log("Subtitle container created and appended to player container");
            
            // 初始化各种功能
            initializeDrag(container, dragHandle);
            initializeScale(container);
            initializeHoverControl(container);
            initializeNavigation(container);
            initializeLoopControl(container);
        } else {
            console.error("Player container not found");
        }
    }

    function createProgressContainer() {
        const container = document.createElement('div');
        container.className = 'translation-progress-container';
        container.id = 'translation-progress';
        
        const playerContainer = document.querySelector('#movie_player');
        if (playerContainer) {
            playerContainer.appendChild(container);
            console.log("Progress container created and appended to player container");
        } else {
            console.error("Player container not found");
        }
    }

    async function waitForYouTubePlayer() {
        return new Promise(resolve => {
            const checkPlayer = () => {
                // 获取视频元素而不是播放器容器
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

    async function getEnglishSubtitleTrack() {
        // 最大重试次数
        const maxRetries = 5;
        const retryInterval = 1000; // 1秒

        for (let i = 0; i < maxRetries; i++) {
            const tracks = parseCaptionTracks();
            console.log(`Attempt ${i + 1}: Found ${tracks.length} caption tracks`);
            
            if (tracks.length > 0) {
                // 优先查找英文字幕
                const englishTrack = tracks.find(track => 
                    track.languageCode === 'en' || 
                    track.name?.simpleText?.toLowerCase().includes('english')
                );
                
                if (englishTrack) {
                    console.log('Found English track:', englishTrack);
                    return englishTrack;
                }
                
                // 如果没有找到英文字幕，返回第一个可用的字幕
                console.log('No English track found, using first available track:', tracks[0]);
                return tracks[0];
            }
            
            // 等待一段时间后重试
            await new Promise(resolve => setTimeout(resolve, retryInterval));
        }
        
        console.error('Failed to find any caption tracks after', maxRetries, 'attempts');
        return null;
    }

    async function fetchAndParseSubtitles(track) {
        // console.log("fetchAndParseSubtitles-track:", track);

        const response = await fetch(new URL(track.baseUrl));
        const xmlText = await response.text();
        
        // console.log("fetchAndParseSubtitles-response:", xmlText);

        // 解析 XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        
        // 获取所有字幕文本节点
        const textNodes = Array.from(xmlDoc.getElementsByTagName('text'));
        
        // 先转换为字幕数组
        const rawSubtitles = textNodes.map((node, index) => {
            const startTime = parseFloat(node.getAttribute('start')) * 1000;
            const duration = parseFloat(node.getAttribute('dur')) * 1000;
            
            // 计算结束时间
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

        const MAX_GROUP_DURATION = 15000; // 增加最大合并时长为15秒
        const MAX_TEXT_LENGTH = 150; // 增加最大文本长度
        const MAX_GAP = 8000; // 增加允许合并的最大间隔为8秒

        // 合并相近的字幕
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

            if (gap <= MAX_GAP && 
                wouldBeDuration <= MAX_GROUP_DURATION &&
                wouldBeText.length <= MAX_TEXT_LENGTH) {
                
                currentGroup.endTime = subtitle.endTime;
                currentGroup.text = wouldBeText;
            } else {
                mergedSubtitles.push(currentGroup);
                currentGroup = { ...subtitle };
            }
        }

        // 添加最后一组
        if (currentGroup) {
            mergedSubtitles.push(currentGroup);
        }

        console.log("Merged subtitles:", mergedSubtitles);
        return mergedSubtitles;
    }
 

    // 修改批处理函数，确保串行处理
    async function batchProcessSubtitles(subtitles) {
        const videoId = new URLSearchParams(window.location.search).get('v');
        const storageKey = `${SUBTITLE_STORAGE_KEY}${videoId}`;
        
        // 检查缓存
        const cached = await getFromStorage(storageKey);
        if (cached) {
            console.log("Using cached subtitles");
            subtitleCache = new Map(Object.entries(cached));
            return;
        }

        // 初始化处理状态
        processingStatus = {
            total: subtitles.length,
            processed: 0,
            isProcessing: true
        };
        updateProcessingStatus();

        // 将字幕分成批次
        const batches = [];
        for (let i = 0; i < subtitles.length; i += BATCH_SIZE) {
            batches.push(subtitles.slice(i, i + BATCH_SIZE));
        }

        console.log(`Total batches: ${batches.length}`);

        // 串行处理每个批次
        try {
            for (let i = 0; i < batches.length; i++) {

                console.log(`Processing batch ${i + 1}/${batches.length}`);
                
                // 处理当前批次
                await processBatch(batches[i], i + 1, batches.length);

                // 添加批次间隔
                if (i < batches.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_INTERVAL));
                }
            }

            // 保存到存储
            const cacheObject = Object.fromEntries(subtitleCache);
            await saveToStorage(storageKey, cacheObject);
        } catch (error) {
            console.error('Error in batch processing:', error);
        } finally {
            processingStatus.isProcessing = false;
            updateProcessingStatus();
        }
    }

    // 修改现有的 translateWithKimi 函数为通用的翻译函数
    async function translate(text, translatorType = config.translation.defaultService) {
        const translator = TranslatorFactory.createTranslator(translatorType, config[translatorType]);
        try {
            return await translator.translate(text);
        } finally {
            await translator.cleanup();
        }
    }


    function extractJsonFromString(input) {
        const jsonRegex = /```json([\s\S]*?)```|```([\s\S]*?)```|(\[[\s\S]*?\])/g;
        const matches = [];
        let match;
      
        if ((match = jsonRegex.exec(input)) !== null) {
          let jsonData;
          if (match[1]) {
            // 匹配 ```json ... ```
            jsonData = match[1].trim();
          } else if (match[2]) {
            // 匹配 ``` ... ```
            jsonData = match[2].trim();
          } else if (match[3]) {
            // 匹配直接存在的 JSON 数据
            jsonData = match[3].trim();
          }
      
          try {

            console.log("extractJsonFromString-jsonData:",jsonData);

            const parsedData = JSON.parse(jsonData);

            console.log("extractJsonFromString-parsedData:",parsedData);

            if (Array.isArray(parsedData)) {
              return parsedData;
            } else {
              matches.push(parsedData);
            }
          } catch (e) {
            console.error("Invalid JSON found:",e);
            throw new Error('Invalid JSON found');
          }
        }
      
        return matches;
      }


    function normalizeText(text) {
        return text
            // 解码 HTML 实体
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            // 标准化空白字符
            .replace(/\s+/g, ' ')
            // 移除标点符号
            .replace(/[.,!?]/g, '')
            // 转换为小写并去除首尾空格
            .toLowerCase()
            .trim();
    }

    // 修改 processBatch 函数以使用新的翻译系统
    async function processBatch(batch, currentBatch, totalBatches, retryCount = 0) {
        try {
            const prompt = `
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

            console.log("prompt:", prompt);
            const response = await translate(prompt);
            if (!response) {
                throw new Error('Translation failed');
            }

            console.log("processBatch-response:", response);
            const processed = extractJsonFromString(response);
            console.log("processBatch-processed:", processed);

            // 使用索引匹配原始文本和翻译结果
            processed.forEach((item, index) => {
                const originalText = batch[index].text;
                subtitleCache.set(originalText, {
                    correctedText: item.correctedText,
                    translation: item.translation
                });
            });

            console.log("processBatch-subtitleCache:", subtitleCache);

            // 更新进度
            processingStatus.processed += batch.length;
            updateProcessingStatus();
        } catch (error) {
            console.error(`Error in batch ${currentBatch}/${totalBatches}:`, error);
            
            if (retryCount < config.translation.maxRetries) {
                const retryDelay = 3000 * (retryCount + 1);
                console.log(`Batch ${currentBatch}/${totalBatches} failed, retrying in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return processBatch(batch, currentBatch, totalBatches, retryCount + 1);
            }
            throw error;
        }
    }
 

    function onTimeUpdate() {
        if (!player) return;
        
        const currentTime = player.currentTime * 1000;
        const relevantSubtitles = currentSubtitles.filter(sub => 
            currentTime >= sub.startTime && currentTime < sub.endTime
        ).slice(-MAX_SUBTITLES);
        
        updateSubtitleDisplay(relevantSubtitles);
        
        // 更新导航按钮状态
        const container = document.getElementById('yt-subtitle-container');
        if (container) {
            const prevButton = container.querySelector('.prev-button');
            const nextButton = container.querySelector('.next-button');
            if (prevButton && nextButton) {
                const currentIndex = getCurrentSubtitleIndex();
                prevButton.disabled = currentIndex <= 0;
                nextButton.disabled = currentIndex === -1 || currentIndex >= currentSubtitles.length - 1;
            }
        }
    }

    function updateSubtitleDisplay(subtitles) {
        const container = document.getElementById('yt-subtitle-container');
        if (!container) {
            console.error('Subtitle container not found!');
            return;
        }

        let contentContainer = container.querySelector('.subtitle-content');
        if (!contentContainer) {
            contentContainer = document.createElement('div');
            contentContainer.className = 'subtitle-content';
            container.appendChild(contentContainer);
        }

        const html = subtitles
            .map(sub => {
                let cached = subtitleCache.get(sub.text) || {};
                // 如果找不到完全匹配的缓存，尝试模糊匹配
                // if (!cached.correctedText) {
                //     const fuzzyMatch = Array.from(subtitleCache.entries()).find(([key]) => 
                //         normalizeText(key) === normalizeText(sub.text)
                //     );
                //     if (fuzzyMatch) {
                //         cached = fuzzyMatch[1];
                //     }
                // }
                
                return `
                    <div class="subtitle-item">
                        <div class="subtitle-english">${cached.correctedText || '原文| '+sub.text}</div>
                        <div class="subtitle-chinese">${cached.translation || '正在翻译中...'}</div>
                    </div>
                `;
            })
            .join('');

        contentContainer.innerHTML = html;
    }

    function parseCaptionTracks() {
        // 方法1：从 ytInitialPlayerResponse 脚本中获取
        const scriptContent = Array.from(document.scripts)
            .find(script => script.text.includes('ytInitialPlayerResponse'))?.text;

        if (scriptContent) {
            const data = scriptContent.match(/ytInitialPlayerResponse\s*=\s*({.+?});/s)?.[1];
            if (data) {
                try {
                    const { captions } = JSON.parse(data);
                    const tracks = captions?.playerCaptionsTracklistRenderer?.captionTracks;
                    if (tracks?.length) {
                        console.log('Found tracks from ytInitialPlayerResponse:', tracks);
                        return tracks;
                    }
                } catch (e) {
                    console.error('Failed to parse ytInitialPlayerResponse:', e);
                }
            }
        }

        // 方法2：从 window.ytInitialPlayerResponse 获取
        if (window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
            const tracks = window.ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
            console.log('Found tracks from window.ytInitialPlayerResponse:', tracks);
            return tracks;
        }

        // 方法3：从视频播放器元素获取
        const player = document.querySelector('#movie_player');
        if (player && player.getOption && typeof player.getOption === 'function') {
            try {
                const tracks = player.getOption('captions', 'tracklist');
                if (tracks?.length) {
                    console.log('Found tracks from player API:', tracks);
                    return tracks;
                }
            } catch (e) {
                console.error('Failed to get tracks from player API:', e);
            }
        }

        console.log('No caption tracks found');
        return [];
    }

    async function getFromStorage(key) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : null;
        } catch (error) {
            console.error('Storage read error:', error);
            return null;
        }
    }

    async function saveToStorage(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify(data));
        } catch (error) {
            console.error('Storage write error:', error);
        }
    }

    function updateProcessingStatus() {
        const container = document.getElementById('translation-progress');
        if (!container) return;

        if (processingStatus.isProcessing) {
            const progress = Math.round((processingStatus.processed / processingStatus.total) * 100);
            container.innerHTML = `
                <div class="processing-status">
                    正在处理字幕 (${progress}%)
                    <div class="progress-bar">
                        <div class="progress" style="width: ${progress}%"></div>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = ''; // 处理完成后清空进度显示
        }
    }

    // 修改 initializeDrag 函数
    function initializeDrag(container, dragHandle) {
        let isDragging = false;
        let startX, startY;
        let originalX, originalY;
        let lastValidPosition = { x: 0, y: 0 };

        // 修改初始位置的获取和设置
        const savedPosition = localStorage.getItem('subtitle-position');
        if (savedPosition) {
            const position = JSON.parse(savedPosition);
            container.style.transform = 'none';
            container.style.left = `${position.x}px`;
            container.style.bottom = 'auto';
            container.style.top = `${position.y}px`;
        } else {
            // 如果没有保存的位置，保持默认的居中定位
            container.style.left = '50%';
            container.style.transform = 'translateX(-50%)';
        }

        // 修改鼠标按下事件处理
        dragHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = true;
            container.classList.add('dragging');
            
            // 获取当前实际位置
            const rect = container.getBoundingClientRect();
            
            // 如果还在使用transform居中定位，先转换为绝对定位
            if (container.style.transform.includes('translateX(-50%)')) {
                container.style.transform = 'none';
                container.style.left = `${rect.left}px`;
                container.style.bottom = 'auto';
                container.style.top = `${rect.top}px`;
            }
            
            // 记录起始位置
            startX = e.clientX;
            startY = e.clientY;
            originalX = rect.left;
            originalY = rect.top;
            lastValidPosition = { x: rect.left, y: rect.top };
        });

        // 修改鼠标移动事件处理
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            e.stopPropagation();

            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            const newX = originalX + deltaX;
            const newY = originalY + deltaY;

            const player = document.querySelector('#movie_player');
            const playerRect = player.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            if (newX >= playerRect.left && 
                newX + containerRect.width <= playerRect.right &&
                newY >= playerRect.top && 
                newY + containerRect.height <= playerRect.bottom) {
                
                container.style.left = `${newX}px`;
                container.style.top = `${newY}px`;
                lastValidPosition = { x: newX, y: newY };
            } else {
                container.style.left = `${lastValidPosition.x}px`;
                container.style.top = `${lastValidPosition.y}px`;
            }
        };

        // 修改鼠标松开事件处理
        const handleMouseUp = (e) => {
            if (!isDragging) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = false;
            container.classList.remove('dragging');
            
            const finalPosition = {
                x: parseFloat(container.style.left),
                y: parseFloat(container.style.top)
            };
            localStorage.setItem('subtitle-position', JSON.stringify(finalPosition));

            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        dragHandle.addEventListener('mousedown', () => {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
    }

    // 修改 initializeScale 函数
    function initializeScale(container) {
        const scaleDown = container.querySelector('.scale-down');
        const scaleUp = container.querySelector('.scale-up');
        const scaleValue = container.querySelector('.scale-value');
        const content = container.querySelector('.subtitle-content');
        
        let currentScale = 100;
        const MIN_SCALE = 50;
        const MAX_SCALE = 200;
        const SCALE_STEP = 10;

        function updateScale() {
            // 更新字幕内容和背景的缩放
            const scale = currentScale / 100;
            
            // 更新字体大小而不是使用 transform
            const subtitleEnglish = container.querySelectorAll('.subtitle-english');
            const subtitleChinese = container.querySelectorAll('.subtitle-chinese');
            
            subtitleEnglish.forEach(el => {
                el.style.fontSize = `${24 * scale}px`; // 24px 是原始字体大小
                el.style.padding = `${4 * scale}px ${12 * scale}px`; // 调整内边距
            });
            
            subtitleChinese.forEach(el => {
                el.style.fontSize = `${24 * scale}px`;
                el.style.padding = `${4 * scale}px ${12 * scale}px`;
            });

            // 更新其他相关样式
            const subtitleItems = container.querySelectorAll('.subtitle-item');
            subtitleItems.forEach(el => {
                el.style.marginBottom = `${8 * scale}px`;
            });

            // 更新显示的缩放值
            scaleValue.textContent = `${currentScale}%`;
            
            // 保存当前缩放值到 localStorage
            localStorage.setItem('subtitle-scale', currentScale);
            
            // 更新按钮状态
            scaleDown.disabled = currentScale <= MIN_SCALE;
            scaleUp.disabled = currentScale >= MAX_SCALE;
        }

        // 从 localStorage 加载保存的缩放值
        const savedScale = parseInt(localStorage.getItem('subtitle-scale'));
        if (savedScale && !isNaN(savedScale)) {
            currentScale = savedScale;
            updateScale();
        }

        scaleDown.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentScale > MIN_SCALE) {
                currentScale = Math.max(MIN_SCALE, currentScale - SCALE_STEP);
                updateScale();
            }
        });

        scaleUp.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentScale < MAX_SCALE) {
                currentScale = Math.min(MAX_SCALE, currentScale + SCALE_STEP);
                updateScale();
            }
        });

        // 添加一个 MutationObserver 来监听字幕内容的变化
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && currentScale !== 100) {
                    updateScale(); // 当内容变化时重新应用缩放
                }
            });
        });

        observer.observe(content, {
            childList: true,
            subtree: true
        });
    }

    // 添加新的初始化鼠标悬停控制函数
    function initializeHoverControl(container) {
        let wasPlaying = false;
        let pausedByHover = false;
        let hoverTimeout;

        container.addEventListener('mouseenter', () => {
            if (!player) return;
            
            // 清除任何现有的超时
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }

            // 设置一个小延迟，避免鼠标快速经过时触发暂停
            hoverTimeout = setTimeout(() => {
                // 只记录进入时的播放状态
                wasPlaying = !player.paused;
                
                // 如果视频正在播放，则暂停
                if (wasPlaying) {
                    player.pause();
                    pausedByHover = true;
                    console.log('Video paused by hover');
                }
            }, 200); // 200ms 延迟
        });

        container.addEventListener('mouseleave', () => {
            // 清除进入时的超时
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }

            // 设置一个小延迟，避免鼠标快速经过时触发播放
            hoverTimeout = setTimeout(() => {
                // 只有当视频是被hover暂停的才自动恢复播放
                if (pausedByHover && wasPlaying) {
                    player.play();
                    console.log('Video resumed after hover');
                }
                // 重置标志
                pausedByHover = false;
            }, 200); // 200ms 延迟
        });

        // 监听视频播放状态变化
        player.addEventListener('play', () => {
            // 视频开始播放时重置标志
            pausedByHover = false;
        });

        player.addEventListener('pause', () => {
            // 如果不是由hover引起的暂停，重置wasPlaying状态
            if (!pausedByHover) {
                wasPlaying = false;
            }
        });
    }

    // 添加字幕开关按钮
    function addSubtitleSwitch() {
        // 查找YouTube原生字幕按钮
        const ytpRightControls = document.querySelector('.ytp-right-controls');
        if (!ytpRightControls) return;

        // 创建开关容器
        const switchContainer = document.createElement('div');
        switchContainer.className = 'subtitle-switch-container';
        switchContainer.innerHTML = `
            <div class="subtitle-switch-tooltip">AI双语字幕翻译</div>
            <div class="subtitle-switch"></div>
        `;

        // 插入到字幕按钮后面
        const captionButton = ytpRightControls.querySelector('.ytp-subtitles-button');
        if (captionButton) {
            captionButton.after(switchContainer);
        } else {
            ytpRightControls.prepend(switchContainer);
        }

        // 从 localStorage 读取开关状态
        isSubtitleEnabled = localStorage.getItem('subtitle-switch-enabled') === 'true';
        const switchElement = switchContainer.querySelector('.subtitle-switch');
        if (isSubtitleEnabled) {
            switchElement.classList.add('active');
        }

        // 添加点击事件
        switchContainer.addEventListener('click', async () => {
            isSubtitleEnabled = !isSubtitleEnabled;
            localStorage.setItem('subtitle-switch-enabled', isSubtitleEnabled);
            
            if (isSubtitleEnabled) {
                switchElement.classList.add('active');
                // 启动字幕功能
                const videoId = new URLSearchParams(window.location.search).get('v');
                await initializePluginCore(videoId);
            } else {
                switchElement.classList.remove('active');
                // 清理当前会话
                cleanupCurrentSession();
            }
        });
    }

    function getCurrentSubtitleIndex() {
        if (!player || !currentSubtitles.length) return -1;
        
        const currentTime = player.currentTime * 1000;
        return currentSubtitles.findIndex(sub => 
            currentTime >= sub.startTime && currentTime < sub.endTime
        );
    }
    
    // 添加新的导航初始化函数
    function initializeNavigation(container) {
        const prevButton = container.querySelector('.prev-button');
        const nextButton = container.querySelector('.next-button');
        

        
        function updateButtonStates() {
            const currentIndex = getCurrentSubtitleIndex();
            prevButton.disabled = currentIndex <= 0;
            nextButton.disabled = currentIndex === -1 || currentIndex >= currentSubtitles.length - 1;
        }
        
        prevButton.addEventListener('click', () => {
            const currentIndex = getCurrentSubtitleIndex();
            if (currentIndex > 0) {
                const prevSubtitle = currentSubtitles[currentIndex - 1];
                player.currentTime = prevSubtitle.startTime / 1000;
            }
        });
        
        nextButton.addEventListener('click', () => {
            const currentIndex = getCurrentSubtitleIndex();
            if (currentIndex !== -1 && currentIndex < currentSubtitles.length - 1) {
                const nextSubtitle = currentSubtitles[currentIndex + 1];
                player.currentTime = nextSubtitle.startTime / 1000;
            }
        });
        
        // 监听视频时间更新以更新按钮状态
        player.addEventListener('timeupdate', () => {
            updateButtonStates();
        });
        
        // 初始更新按钮状态
        updateButtonStates();
    }

    // 修复循环播放功能
    function initializeLoopControl(container) {
        const loopSwitch = container.querySelector('.loop-switch');
        const loopSwitchContainer = container.querySelector('.loop-switch-container');
        let isLooping = false;
        let loopInterval = null;
        let currentLoopingIndex = -1;
        
        function getCurrentSubtitleIndex() {
            if (!player || !currentSubtitles.length) return -1;
            
            const currentTime = player.currentTime * 1000;
            return currentSubtitles.findIndex(sub => 
                currentTime >= sub.startTime && currentTime < sub.endTime
            );
        }
        
        function startLoop() {
            if (loopInterval) clearInterval(loopInterval);
            
            // 获取当前字幕索引
            currentLoopingIndex = getCurrentSubtitleIndex();
            if (currentLoopingIndex === -1) return;
            
            loopInterval = setInterval(() => {
                if (!isLooping || !player) return;
                
                const currentTime = player.currentTime * 1000;
                const currentSubtitle = currentSubtitles[currentLoopingIndex];
                
                // 如果超出当前字幕时间范围，跳回开始
                if (currentTime >= currentSubtitle.endTime || currentTime < currentSubtitle.startTime) {
                    player.currentTime = currentSubtitle.startTime / 1000;
                }
            }, 100);
        }
        
        function stopLoop() {
            if (loopInterval) {
                clearInterval(loopInterval);
                loopInterval = null;
            }
            currentLoopingIndex = -1;
        }
        
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
        
        // 监听视频时间更新，处理字幕切换
        player.addEventListener('timeupdate', () => {
            if (isLooping) {
                const newIndex = getCurrentSubtitleIndex();
                if (newIndex !== -1 && newIndex !== currentLoopingIndex) {
                    currentLoopingIndex = newIndex;
                    startLoop(); // 重新开始循环新的字幕
                }
            }
        });
        
        // 在视频暂停时保持循环状态，但暂停检查
        player.addEventListener('pause', () => {
            if (loopInterval) {
                clearInterval(loopInterval);
                loopInterval = null;
            }
        });
        
        // 在视频播放时恢复循环检查
        player.addEventListener('play', () => {
            if (isLooping) {
                startLoop();
            }
        });
        
        // 在清理时停止循环
        const originalCleanup = cleanupCurrentSession;
        cleanupCurrentSession = function() {
            stopLoop();
            originalCleanup();
        };
    }

    // 初始化扩展
    initializeExtension();
    console.log("contentScript.js loaded");
})();