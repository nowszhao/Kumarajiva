import { TranslatorFactory } from '../translators';
import config from '../config/config';

class SubtitleAnalyzer {
    constructor() {
        this.translator = TranslatorFactory.createTranslator(
            config.translation.defaultService,
            config[config.translation.defaultService]
        );
    }

    async analyzeSubtitles(subtitles, type = 'words') {
        // 合并所有字幕文本
        const fullText = subtitles
            .map(sub => sub.text)
            .join('\n');

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

            console.log("result:", result);
            
            // 对于总结类型，直接返回文本结果，不需要 JSON 解析
            return type === 'summary' ? result : JSON.parse(result);
        } catch (error) {
            console.error('Subtitle analysis failed:', error);
            return null;
        }
    }

    buildWordsAnalysisPrompt(subtitleText) {
        return `你现在一位专业英文字幕处理专家，现在正帮我理解一个英语播客的字幕文件，要求如下：
1、解析我提供的字幕内容，帮我从字幕中筛选出10个最难理解的词汇。
2、输出请遵循以下要求：
 - 类型：包括词汇、短语/词块、俚语、缩写（Words, Phrases, Slang, Abbreviations）
 - 难度：使用CEFR评级（C2, C1, B2, B1, A2, A1），从高到低排序
 - 词性：使用n., v., adj., adv., phrase等标准缩写
 - 音标：提供美式音标
 - 中文解释：根据字幕语境给出最贴切的含义
 - 记忆方法：包括但不限于中文发音联想、词根词缀分析、语境联想等
 - 出处：难点在原文中的完整句子，用**粗体**标记难点，可用省略号(...)表示省略内容
 - 出处翻译：将出处翻译成地道的中文

3、输出格式为json数组，示例如下：
[
    {
        "type": "Words",
        "expression": "ubiquitous",
        "difficulty": "C1",
        "part_of_speech": "adj.",
        "phonetic": "/juːˈbɪkwɪtəs/",
        "chinese_meaning": "无处不在的",
        "memory_method": "联想记忆：u（你）+bi（比）+quit（退出）+ous（形容词后缀）= 你比退出还要无处不在",
        "source_sentence": "In the modern world, smartphones have become **ubiquitous**.",
        "source_translation": "在现代世界，智能手机已经变得无处不在。"
    }
]

4、其他注意事项：
- 优先选择在语境中确实影响理解的表达，而不仅仅是生僻词
- 如遇同等难度的表达，优先选择在日常生活或学习中更有用的

字幕内容如下：
${subtitleText}`;
    }

    buildPhrasesAnalysisPrompt(subtitleText) {
        return `你现在一位专业英文字幕处理专家，现在正帮我理解一个英语播客的字幕文件，要求如下：
1、解析我提供的字幕内容，帮我从字幕中筛选出10个最难理解的短语或词块。
2、输出请遵循以下要求：
 - 类型：包括词汇、短语/词块、俚语、缩写（Words, Phrases, Slang, Abbreviations）
 - 难度：使用CEFR评级（C2, C1, B2, B1, A2, A1），从高到低排序
 - 词性：使用n., v., adj., adv., phrase等标准缩写
 - 音标：提供美式音标
 - 中文解释：根据字幕语境给出最贴切的含义
 - 记忆方法：包括但不限于中文发音联想、词根词缀分析、语境联想等
 - 出处：难点在原文中的完整句子，用**粗体**标记难点，可用省略号(...)表示省略内容
 - 出处翻译：将出处翻译成地道的中文

3、输出格式为json数组，示例如下：
[
    {
        "type": "Phrases",
        "expression": "sandwich transactions",
        "difficulty": "C1",
        "part_of_speech": "n.",
        "phonetic": "/ˈsænwɪtʃ trænsˈækʃənz/",
        "chinese_meaning": "夹心交易（一种在区块链交易中利用时间差获利的策略）",
        "memory_method": "sandwich 意为 "三明治"，可以联想成在交易过程中像三明治一样把某些交易夹在中间来获利，结合语境理解这种交易策略。",
        "source_sentence": "the last step is to click the start button this will enable the bot to start snipping the mempool to find different liquidity pairs in order for you to **sandwich transactions**...",
        "source_translation": "最后一步是点击开始按钮。这将使机器人开始在内存池中筛选，以找到不同的流动性对，以便你进行夹心交易……"
    }
]

4、其他注意事项：
- 优先选择在语境中确实影响理解的表达，而不仅仅是生僻词
- 如遇同等难度的表达，优先选择在日常生活或学习中更有用的

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