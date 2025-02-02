// 翻译器基类
class Translator {
    constructor(config = {}) {
        this.config = config;
    }

    async translate(text) {
        throw new Error('translate method must be implemented');
    }

    async cleanup() {
        // 可选的清理方法
    }
}

export default Translator; 