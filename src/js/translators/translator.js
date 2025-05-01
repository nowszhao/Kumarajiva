// 翻译器基类
class Translator {
    constructor(config = {}) {
        this.config = config;
    }

    async cleanup() {
        // 可选的清理方法
    }
    async translate(text,retryCount = 0) {
        
    }
}

export default Translator; 