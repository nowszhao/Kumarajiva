import { TranslatorFactory } from '../translators';
import config from '../config/config';
import { extractJsonFromString } from '../utils';

class SubtitleAnalyzer {
    constructor() {
        this.translator = null;
        this.cacheKey = 'yt-subtitle-analysis-';
    }

    async initialize() {
        // 从 storage 获取当前的翻译服务设置
        const { translationService, serviceTokens } = await chrome.storage.sync.get(['translationService', 'serviceTokens']);

        console.log("translationService:", translationService, "serviceTokens:", serviceTokens);

        // 使用保存的设置，如果没有则使用默认值
        const currentService = translationService || config.translation.defaultService;

        // 获取对应服务的 token
        const token = serviceTokens?.[currentService] || config[currentService].apiToken;

        // 创建翻译器实例时使用保存的设置
        this.translator = TranslatorFactory.createTranslator(
            currentService,
            {
                ...config[currentService],
                apiToken: token
            }
        );
    }

    // 生成缓存键
    generateCacheKey(videoId, type) {
        return `${this.cacheKey}${videoId}-${type}`;
    }

    // 获取缓存的分析结果
    getCachedAnalysis(videoId, type) {
        const key = this.generateCacheKey(videoId, type);
        const cached = localStorage.getItem(key);
        return cached ? JSON.parse(cached) : null;
    }

    // 保存分析结果到缓存
    saveAnalysisToCache(videoId, type, results) {
        const key = this.generateCacheKey(videoId, type);
        localStorage.setItem(key, JSON.stringify(results));
    }

    async analyzeSubtitles(subtitles, type = 'words', videoId) {
        // 确保translator已经初始化
        if (!this.translator) {
            await this.initialize();
        }

        if(type === 'current') {
            return
        }

        // 首先检查缓存
        const cachedResults = this.getCachedAnalysis(videoId, type);
        if (cachedResults) {
            console.log('Loading analysis from cache');
            return cachedResults;
        }

        // 如果没有缓存，进行新的分析
        var fullText = subtitles
            .map(sub => sub.text)
            .join('\n');

        if (fullText && fullText.length > 100000) {
            fullText = fullText.slice(0, 100000);
            console.log("fullText is too long, truncated to 100000 characters");
        }

        // 添加重试相关变量
        const maxRetries = 3;
        const retryDelay = 2000; // 2秒延迟
        let attempt = 0;
        let lastError = null;

        while (attempt < maxRetries) {
            try {
                // 根据类型构建不同的分析提示词
                let prompt;
                switch (type) {
                    case 'summary':
                        prompt = this.buildSummaryAnalysisPrompt(fullText);
                        break;
                    case 'phrases':
                        prompt = this.buildPhrasesAnalysisPrompt(fullText);
                        break;
                    case 'current':
                        prompt = this.buildSingleSubtitlePrompt(fullText);
                        break;
                    default:
                        prompt = this.buildWordsAnalysisPrompt(fullText);
                }

                if (attempt > 0) {
                    console.log(`Retry attempt ${attempt + 1}/${maxRetries}`);
                    // 在重试时添加额外的提示
                    prompt = `${prompt}\n\n注意：这是第${attempt + 1}次尝试，请特别注意JSON格式的正确性。`;
                }

                console.log("prompt:", prompt, ", type:", type);

                var result = await this.translator.translate(prompt);
                console.log("Raw translation result:", result);

                // 尝试清理和修复 JSON 字符串
                // result = this.cleanJsonString(result);

                // 从字符串中提取 JSON
                result = extractJsonFromString(result);
                console.log("Extracted JSON string:", result);

                const parsedResult = JSON.parse(result);
                console.log("Parsed result:", parsedResult);

                // 验证结果格式
                if (type === 'summary') {
                    if (!this.validateSummaryFormat(parsedResult)) {
                        throw new Error('Invalid summary format');
                    }
                }

                // 保存结果到缓存
                this.saveAnalysisToCache(videoId, type, parsedResult);

                if (type === 'current') {
                    return parsedResult.difficultVocabulary || [];
                }

                return parsedResult;

            } catch (error) {
                lastError = error;
                console.error(`Attempt ${attempt + 1} failed:`, error);

                if (attempt < maxRetries - 1) {
                    // 如果还有重试机会，等待一段时间后重试
                    console.log(`Waiting ${retryDelay}ms before next attempt...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    attempt++;
                } else {
                    // 所有重试都失败了
                    console.error('All retry attempts failed:', lastError);
                    break;
                }
            }
        }

        // 如果所有重试都失败，返回一个友好的错误结果
        if (type === 'summary') {
            return {
                summary: "很抱歉，内容分析暂时失败，请稍后重试。",
                coreConcepts: [],
                viewpoints: []
            };
        } else {
            return [{
                type: "Error",
                vocabulary: "分析失败",
                difficulty: "N/A",
                part_of_speech: "N/A",
                phonetic: "N/A",
                chinese_meaning: "请稍后重试",
                chinese_english_sentence: "系统暂时无法完成分析，请刷新页面重试。"
            }];
        }
    }

    // 添加新的辅助方法
    cleanJsonString(str) {
        // 首先尝试提取 JSON 字符串（如果 AI 返回了额外的文字）
        const jsonMatch = str.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            str = jsonMatch[0];
        }

        // 清理字符串
        str = str
            // 移除控制字符
            .replace(/[\u0000-\u0019]+/g, "")
            // 规范化空白字符
            .replace(/\s+/g, " ")
            // 修复可能的 JSON 格式问题
            .replace(/,\s*}/g, "}")  // 移除对象末尾多余的逗号
            .replace(/,\s*]/g, "]")  // 移除数组末尾多余的逗号
            .replace(/'/g, '"')      // 将单引号替换为双引号
            .replace(/\\"/g, '"')    // 修复可能的转义问题
            .replace(/"\s+"/g, '" "')// 修复引号间的空白
            .trim();

        // 确保是一个完整的 JSON 对象
        if (!str.startsWith("{") || !str.endsWith("}")) {
            throw new Error("Invalid JSON format");
        }

        return str;
    }

    validateSummaryFormat(result) {
        // 验证summary格式
        const requiredFields = ['summary', 'coreConcepts', 'viewpoints'];
        const hasAllFields = requiredFields.every(field => field in result);

        if (!hasAllFields) {
            console.error('Missing required fields in summary result:', result);
            return false;
        }

        // 验证coreConcepts格式
        if (!Array.isArray(result.coreConcepts)) {
            console.error('coreConcepts is not an array');
            return false;
        }

        // 验证viewpoints格式
        if (!Array.isArray(result.viewpoints)) {
            console.error('viewpoints is not an array');
            return false;
        }

        return true;
    }

    buildWordsAnalysisPrompt(subtitleText) {
        return `你现在一位翻译专家，现在正帮我理解一个英语字幕文件，要求如下：
            1、您的任务是翻译和分析给定文本中的语言难点，这些难点可能包括对非母语学习者具有挑战性的词汇、短语、俚语、缩写、简写以及网络用语等。
            2、输出请遵循以下要求：
                - 类型：包括单词、短语/词块、俚语、缩写（Words, Phrases, Slang, Abbreviations）
                - 词汇：识别出句子中所有词汇，包括短语/词块、俚语、缩写
                - 难度：使用CEFR评级（C2, C1, B2, B1, A2, A1），从高到低排序
                - 词性：使用n., v., adj., adv., phrase等标准缩写
                - 音标：提供美式音标
                - 中文解释：根据字幕语境给出最贴切的含义
                - 中英混合句子：使用词汇造一个句子，中文句子除了该词汇外，其他均为中文，需要保证语法正确，通过在完整中文语境中嵌入单一核心英语术语，帮助学习者直观理解专业概念的实际用法；英语句子在括号中展示。
            3、输出格式为json数组，示例如下：
            [
                {
                    "type": "Words",
                    "vocabulary": "ubiquitous",
                    "difficulty": "C1",
                    "part_of_speech": "adj.",
                    "phonetic": "/juːˈbɪkwɪtəs/",
                    "chinese_meaning": "无处不在的",
                    "chinese_english_sentence": "在当今的数字时代，智能手机已经ubiquitous，使人们更容易保持联系。(In today's digital age, smartphones have become ubiquitous, significantly enhancing people's ability to maintain social connections.)"
                }
            ]

            4、其他注意事项：
            - 优先选择在语境中确实影响理解的表达，而不仅仅是生僻词
            - 如遇同等难度的表达，优先选择在日常生活或学习中更有用的

            字幕内容如下：
            ${subtitleText}`;
    }

    buildPhrasesAnalysisPrompt(subtitleText) {
        // 废弃
        return `你现在一位专业英文字幕处理专家，现在正帮我理解一个英语字幕文件，要求如下：
1、您的任务是分析给定文本中的语言难点，这些难点可能包括对非母语学习者具有挑战性的短语、俚语、缩写、简写以及网络用语等。
2、输出请遵循以下要求：
 - 类型：包括短语/词块、俚语、缩写（Phrases, Slang, Abbreviations）
 - 难度：使用CEFR评级（C2, C1, B2, B1, A2, A1），从高到低排序
 - 词性：使用n., v., adj., adv., phrase等标准缩写
 - 音标：提供美式音标
 - 中文解释：根据字幕语境给出最贴切的含义
 - 中英混合句子：中英混合句子：使用词汇造一个句子，中文句子除了该词汇外，其他均为中文，需要保证语法正确，通过在完整中文语境中嵌入单一核心英语术语，帮助学习者直观理解专业概念的实际用法；英语句子在括号中展示。
3、输出格式为json数组，示例如下：
[
    {
        "type": "Phrases",
        "vocabulary": "sandwich transactions",
        "difficulty": "C1",
        "part_of_speech": "n.",
        "phonetic": "/ˈsænwɪtʃ trænsˈækʃənz/",
        "chinese_meaning": "夹心交易（一种在区块链交易中利用时间差获利的策略）",
        "chinese_english_sentence": "我最近在区块链交易中使用了sandwich transactions，成功获利。(I recently used sandwich transactions in blockchain transactions and was successful and profitable.)"
    }
]
字幕内容如下：
${subtitleText}`;
    }

    buildSummaryAnalysisPrompt(subtitleText) {
        return `你是一位专业的内容分析专家。请使用中文分析以下字幕内容，并按照严格的JSON格式输出分析结果。
要求：
1. 请使用中文
2. 必须确保输出是合法的JSON格式
3. 所有字符串必须使用双引号，不能用单引号
3. 不要输出任何额外的文字，只输出JSON对象
4. 每个字段必须完全匹配示例格式

输出格式示例：
{
    "summary": "这里是总结内容（200字以内）",
    "coreConcepts": [
        {
            "term": "概念1",
            "definition": "概念1的解释（50字内）"
        }
    ],
    "viewpoints": [
        {
            "viewpoint": "观点1",
            "arguments": [
                "支持论据1",
                "支持论据2"
            ]
        }
    ]
}

格式说明：
1. summary：字符串类型，总结内容（200字以内）
2. coreConcepts：数组类型，包含核心概念对象
   - term：字符串类型，概念名称
   - definition：字符串类型，概念解释（50字内）
3. viewpoints：数组类型，包含所有重点观点
   - viewpoint：字符串类型，核心观点
   - arguments：字符串数组类型，支持论据

注意事项：
1. 严格遵守JSON格式规范
2. 所有字符串使用双引号
3. 数组和对象需要正确的闭合
4. 最后一个属性后不要加逗号
5. 不要添加任何注释或说明文字

请分析以下字幕内容：
${subtitleText}`;
    }

    // 添加新方法用于获取单个字幕的分析结果
    async analyzeSingleSubtitle(subtitle) {
        const text = subtitle.text;
        if (!text) return null;

        // 构建单字幕分析的提示词
        const prompt = this.buildSingleSubtitlePrompt(text);
        
        try {
            const result = await this.translator.translate(prompt);
            const parsedResult = JSON.parse(result);
            return parsedResult.difficultVocabulary || [];
        } catch (error) {
            console.error('Failed to analyze single subtitle:', error);
            return null;
        }
    }

    // 添加新方法用于构建单字幕分析的提示词  --废弃
    buildSingleSubtitlePrompt(text) {
        return `
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
                - 中英混合句子：中英混合句子：中英混合句子：使用词汇造一个句子，中文句子除了该词汇外，其他均为中文，需要保证语法正确，通过在完整中文语境中嵌入单一核心英语语，帮助学习者直观理解专业概念的实际用法；英语句子在括号中展示。
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
            ${text}`;
    }
}

export default SubtitleAnalyzer; 