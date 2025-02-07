import KimiTranslator from './kimi-translator';
import DoubaoTranslator from './doubao-translator';
import QwenTranslator from './qwen-translator';
import DeepSeekTranslator from './deepseek-translator';

// 翻译服务工厂
class TranslatorFactory {
    static createTranslator(type, config) {
        switch (type.toLowerCase()) {
            case 'kimi':
                return new KimiTranslator(config);
            case 'doubao':
                return new DoubaoTranslator(config);
            case 'qwen':
                return new QwenTranslator(config);
            case 'deepseek':
                return new DeepSeekTranslator(config);
            default:
                throw new Error(`Unsupported translator type: ${type}`);
        }
    }
}

export { TranslatorFactory }; 