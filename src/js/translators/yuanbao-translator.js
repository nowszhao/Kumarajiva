import Translator from './translator';

class YuanBaoTranslator extends Translator {
    constructor(config) {
        super(config);
        this.currentChatId = "03245ccb-b3c4-4ff6-8c59-5c4e2139e4d5";
    }
    
    async createConversation() {
        try {
            // 使用Chrome消息传递机制与background.js通信
            return new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'YUANBAO_CREATE_CONVERSATION',
                    apiToken: this.config.apiToken
                }, response => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    
                    if (response && response.success && response.data && response.data.data && response.data.data.id) {
                        this.currentChatId = response.data.data.id;
                        resolve(this.currentChatId);
                    } else {
                        reject(new Error('Failed to create conversation: ' + JSON.stringify(response)));
                    }
                });
            });
        } catch (error) {
            console.error('Error creating conversation:', error);
            throw error;
        }
    }
     
    
    async translate(text, retryCount = 3) {
        if (!this.currentChatId) {
            await this.createConversation();
        }
        
        try {
            // 使用Chrome消息传递机制与background.js通信
            return new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'YUANBAO_TRANSLATE',
                    chatId: this.currentChatId,
                    apiToken: this.config.apiToken,
                    text: text,
                    model: "gpt_175B_0404"
                }, response => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    
                    if (response && response.success && response.data && response.data.data && response.data.data.content) {
                        resolve(response.data.data.content);
                    } else {
                        reject(new Error('Translation failed: ' + JSON.stringify(response)));
                    }
                });
            });
        } catch (error) {
            console.error('Translation error:', error);
            
            // 重试逻辑
            if (retryCount > 0) {
                console.log(`Retrying translation, ${retryCount} attempts left`);
                // 重新创建会话，可能是会话过期
                this.currentChatId = null;
                return this.translate(text, retryCount - 1);
            }
            
            throw error;
        }
    }
}
export default YuanBaoTranslator;