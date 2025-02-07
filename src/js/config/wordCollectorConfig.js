export default {
    storage: {
        key: 'collected_words',
        maxWords: 5000  // 最大收藏单词数
    },
    api: {
        wordInfo: 'https://cdn.jsdelivr.net/gh/changhongzi/BNC_COCA_EN2CN/word-info',
        audio: 'https://dict.youdao.com/dictvoice'
    },
    card: {
        maxLength: 30,  // 最大选中文本长度
        fadeTime: 200   // 动画时长(ms)
    }
}; 