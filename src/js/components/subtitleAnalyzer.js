import { TranslatorFactory } from '../translators';
import config from '../config/config';

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

        if(fullText && fullText.length > 100000){
            fullText = fullText.slice(0, 100000);
            console.log("fullText is too long, truncated to 100000 characters");
        }

        // 根据类型构建不同的分析提示词
        let prompt;
        switch (type) {
            case 'summary':
                prompt = this.buildSummaryAnalysisPrompt(fullText);
                break;
            case 'phrases':
                prompt = this.buildPhrasesAnalysisPrompt(fullText);
                break;
            default:
                prompt = this.buildWordsAnalysisPrompt(fullText);
        }

        console.log("prompt:", prompt,",  type:", type);

        try {
            const result = await this.translator.translate(prompt);
            const parsedResult = type === 'summary' ? result : JSON.parse(result);
            
            // 保存结果到缓存
            this.saveAnalysisToCache(videoId, type, parsedResult);
            
            return parsedResult;
        } catch (error) {
            console.error('Subtitle analysis failed:', error);
            return null;
        }
    }

    buildWordsAnalysisPrompt(subtitleText) {
        return `你现在一位专业英文字幕处理专家，现在正帮我理解一个英语字幕文件，要求如下：
1、解析我提供的字幕内容，帮我从字幕中筛选出10个最难理解的词汇。
2、输出请遵循以下要求：
 - 类型：包括词汇、短语/词块、俚语、缩写（Words, Phrases, Slang, Abbreviations）
 - 难度：使用CEFR评级（C2, C1, B2, B1, A2, A1），从高到低排序
 - 词性：使用n., v., adj., adv., phrase等标准缩写
 - 音标：提供美式音标
 - 中文解释：根据字幕语境给出最贴切的含义
 - 中英混合句子：使用词汇造一个句子，除了该词汇外，其他均为中文，方便用户在真实语境中掌握该词汇的含义

3、输出格式为json数组，示例如下：
[
    {
        "type": "Words",
        "vocabulary": "ubiquitous",
        "difficulty": "C1",
        "part_of_speech": "adj.",
        "phonetic": "/juːˈbɪkwɪtəs/",
        "chinese_meaning": "无处不在的",
        "chinese_english_sentence": "我最近在区块链交易中使用了sandwich transactions，成功获利。"
    }
]

4、其他注意事项：
- 优先选择在语境中确实影响理解的表达，而不仅仅是生僻词
- 如遇同等难度的表达，优先选择在日常生活或学习中更有用的

字幕内容如下：
${subtitleText}`;
    }

    buildPhrasesAnalysisPrompt(subtitleText) {
        return `你现在一位专业英文字幕处理专家，现在正帮我理解一个英语字幕文件，要求如下：
1、解析我提供的字幕内容，帮我从字幕中筛选出10个最难理解的短语/词块、俚语、缩写【重点】。
2、输出请遵循以下要求：
 - 类型：包括短语/词块、俚语、缩写（Phrases, Slang, Abbreviations）
 - 难度：使用CEFR评级（C2, C1, B2, B1, A2, A1），从高到低排序
 - 词性：使用n., v., adj., adv., phrase等标准缩写
 - 音标：提供美式音标
 - 中文解释：根据字幕语境给出最贴切的含义
 - 中英混合句子：使用词汇造一个句子，除了该词汇外，其他均为中文，方便用户在真实语境中掌握该词汇的含义
3、输出格式为json数组，示例如下：
[
    {
        "type": "Phrases",
        "vocabulary": "sandwich transactions",
        "difficulty": "C1",
        "part_of_speech": "n.",
        "phonetic": "/ˈsænwɪtʃ trænsˈækʃənz/",
        "chinese_meaning": "夹心交易（一种在区块链交易中利用时间差获利的策略）",
        "chinese_english_sentence": "我最近在区块链交易中使用了sandwich transactions，成功获利。"
    }
]
字幕内容如下：
${subtitleText}`;
    }

    buildSummaryAnalysisPrompt(subtitleText) {
        return `请使用中文总结概括当前字幕的内容，并列出当前字幕提到的核心观点及支持论据，返回Json格式如下：
{
    "Summary":"",
    "Viewpoints":[
        {
            "Viewpoint":"xxxx",
            "Argument":[
                "论据 1：xxx",
                "论据 2：xxx"
            ]
        }
    ]
}
上述说明如下：
- Summary：总结
- Viewpoints：观点集
- Viewpoint： 观点
- Argument： 论据

字幕内容如下：
${subtitleText}`;
    }
}

export default SubtitleAnalyzer; 