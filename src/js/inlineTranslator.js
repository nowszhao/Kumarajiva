// 防止全局变量污染

import { InlineTranslator } from './services/TranslationServiceWrapper';

// 启动内联翻译应用
(function () {
    const inlineTranslator = new InlineTranslator();
    inlineTranslator.initialize();
})(); 