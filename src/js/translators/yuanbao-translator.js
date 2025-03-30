import Translator from './translator';



class YuanBaoTranslator extends Translator {
    constructor(config) {
        super(config);
        this.currentChatId = null;
    }
    
    async createConversation() {
        const url = 'https://yuanbao.tencent.com/api/user/agent/conversation/create';
        const headers = {
            'Cookie': this.config.apiToken,
            'Content-Type': 'application/json'
        };
        const options = {
            method: 'POST',
            headers,
            body: JSON.stringify({
                agentId: "naQivTmsDa"
            })
        };

        try {
            // 使用 proxyFetch 机制发送请求
            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'proxyFetch',
                    url,
                    options
                }, response => {
                    if (response.success) {
                        resolve(JSON.parse(response.body));
                    } else {
                        reject(new Error(response.error));
                    }
                });
            });

            this.currentChatId = response.id;
            return response.id;
        } catch (error) {
            console.error('YuanBao: Failed to create conversation:', error);
            throw error;
        }
    }

    async deleteConversation() {
        if (!this.currentChatId) return;

        const url = 'https://yuanbao.tencent.com/api/user/agent/conversation/v1/clear';
        const headers = {
            'Cookie': this.config.apiToken,
            'Content-Type': 'application/json'
        };
        const options = {
            method: 'POST',
            headers,
            body: JSON.stringify({
                conversationIds: [this.currentChatId]
            })
        };

        try {
            // 使用 proxyFetch 机制发送请求
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({
                    type: 'proxyFetch',
                    url,
                    options
                }, response => {
                    if (response.success) {
                        resolve();
                    } else {
                        reject(new Error(response.error));
                    }
                });
            });
            this.currentChatId = null;
        } catch (error) {
            console.error('YuanBao: Failed to delete conversation:', error);
        }
    }
    
    async translate(text, retryCount = 3) {
        try {
            // 创建新会话
            await this.createConversation();
            
            console.log("text:", text,", config:",this.config);

            const url = `https://yuanbao.tencent.com/api/chat/${this.currentChatId}`;
            const headers = {
                'Cookie': this.config.apiToken,
                'Content-Type': 'application/json'
            };
            const body = {
                model: "gpt_175B_0404",
                prompt: text,
                plugin: "Adaptive",
                displayPrompt: "",
                displayPromptType: 1,
                options: {
                    imageIntention: {
                        needIntentionModel: true,
                        backendUpdateFlag: 2,
                        intentionStatus: true
                    }
                },
                multimedia: [],
                agentId: "naQivTmsDa",
                supportHint: 1,
                version: "v2",
                isTemporary:true,
                chatModelId: "deep_seek_v3"
            };

            const options = {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            };

            console.log('YuanBao: Prepared request options:', { url, method: options.method });

            const result = await new Promise((resolve, reject) => {
                let translatedText = '';
                let messageBuffer = '';
                const decoder = new TextDecoder();
                let isDone = false;

                // Create a unique port ID
                const portId = `yuanbao_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                // Create a port for receiving streaming data
                const port = chrome.runtime.connect({ name: portId });
                
                // Set up port message listener
                port.onMessage.addListener((response) => {
                    // console.log('YuanBao: Received port message:', response);

                    if (!response) {
                        console.error('YuanBao: Received null/undefined response');
                        return;
                    }

                    if (response.type === 'error') {
                        console.error('YuanBao: Received error response:', response.error);
                        port.disconnect();
                        reject(new Error(response.error));
                        return;
                    }

                    if (response.type === 'chunk') {
                        try {
                            // console.log('YuanBao: Processing chunk of size:', response.value?.length);
                            const chunk = new Uint8Array(response.value);
                            const decodedChunk = decoder.decode(chunk, { stream: true });
                            // console.log('YuanBao: Decoded chunk:', decodedChunk);
                            messageBuffer += decodedChunk;

                            // Process complete messages
                            let messages = messageBuffer.split('\n');
                            // Keep the last potentially incomplete message in the buffer
                            messageBuffer = messages.pop() || '';

                            for (const message of messages) {
                                if (!message.trim()) continue;

                                if (message.startsWith('data: ')) {
                                    const dataContent = message.slice(6).trim();
                                    // console.log('YuanBao: Processing data content:', dataContent);
                                    
                                    if (dataContent === '[DONE]') {
                                        // console.log('YuanBao: Received [DONE] signal');
                                        isDone = true;
                                        continue;
                                    }

                                    try {
                                        const data = JSON.parse(dataContent);
                                        if (data.type === 'text' && data.msg) {
                                            // console.log('YuanBao: Adding text chunk:', data.msg);
                                            translatedText += data.msg;
                                        }
                                    } catch (e) {
                                        console.log('YuanBao: Failed to parse JSON-dataContent:', dataContent);
                                        console.debug('YuanBao: Failed to parse JSON:', e);
                                    }
                                }
                            }
                        } catch (e) {
                            console.error('YuanBao: Error processing chunk:', e);
                        }
                    }

                    if (response.type === 'done') {
                        console.log('YuanBao: Processing final message buffer:', messageBuffer);
                        // Process any remaining message in the buffer
                        if (messageBuffer.trim()) {
                            const messages = messageBuffer.split('\n');
                            for (const message of messages) {
                                if (!message.trim()) continue;

                                if (message.startsWith('data: ')) {
                                    const dataContent = message.slice(6).trim();
                                    if (dataContent === '[DONE]') {
                                        isDone = true;
                                        continue;
                                    }

                                    try {
                                        const data = JSON.parse(dataContent);
                                        if (data.type === 'text' && data.msg) {
                                            console.log('YuanBao: Adding final text chunk:', data.msg);
                                            translatedText += data.msg;
                                        }
                                    } catch (e) {
                                        console.debug('YuanBao: Failed to parse final JSON:', e);
                                    }
                                }
                            }
                        }
                        
                        console.log('YuanBao: Translation complete. Result:', translatedText || text);
                        port.disconnect();
                        resolve(translatedText || text);
                    }
                });

                // Handle port disconnect
                port.onDisconnect.addListener(() => {
                    console.log('YuanBao: Port disconnected');
                    if (!isDone) {
                        reject(new Error('Connection closed before completion'));
                    }
                });

                // Send the request through the port
                console.log('YuanBao: Sending proxyFetch message through port');
                port.postMessage({
                    type: 'proxyFetch',
                    url,
                    options
                });
            });

            // 删除会话
            await this.deleteConversation();
            
            return result;
        } catch (error) {
            // 确保在出错时也删除会话
            await this.deleteConversation();
            
            console.error('YuanBao: Translation error:', error);
            if (retryCount > 0) {
                console.log(`YuanBao: Retrying translation, ${retryCount} attempts remaining...`);
                return this.translate(text, retryCount - 1);
            }
            throw error;
        }
    }
}

export default YuanBaoTranslator; 