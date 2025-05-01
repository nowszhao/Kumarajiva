import YuanBaoTranslator from './yuanbao-translator';

// 翻译服务工厂
class TranslatorFactory {
    static createTranslator(type, config) {
        switch (type.toLowerCase()) {

            case 'yuanbao':
                return new YuanBaoTranslator(config);
            default:
                throw new Error(`Unsupported translator type: ${type}`);
        }
    }
}

export { TranslatorFactory }; 