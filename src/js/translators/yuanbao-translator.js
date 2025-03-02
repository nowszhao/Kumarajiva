import Translator from './translator';



class YuanBaoTranslator extends Translator {
    constructor(config) {
        super(config);
        this.currentChatId = null;
    }
    
    async translate(text, retryCount = 3) {
        console.log('YuanBao: Starting translation request for text:', text.substring(0, 50) + '...');
        const url = 'https://yuanbao.tencent.com/api/chat/0b0c6a06-c34d-4124-b7eb-e5df760ea40f';
        const headers = {
            'Cookie': '_qimei_uuid42=193010b053510040bdbe959987347987350c2698a9; hy_source=web; _qimei_fingerprint=579ad3031f0737dafe77266cbcb409d8; _qimei_i_3=66c04685c60e02dac5c4fe615b8626e3f2b8f6a04409578be2de7b5e2e93753e626a3f973989e2a0d790; _qimei_h38=72e5991abdbe9599873479870300000f019301; hy_user=changhozhao; hy_token=ybUPT4mXukWon0h18MPy9Z9z/kUm76vaMMrI/RwMoSEjdtz7lJl8vPi66lDYZhkX; _qimei_i_1=4cde5185970f55d2c896af620fd626e9f2e7adf915580785bd872f582593206c616351a53980e1dcd784a1e7; hy_source=web; hy_token=ybUPT4mXukWon0h18MPy9Z9z/kUm76vaMMrI/RwMoSEjdtz7lJl8vPi66lDYZhkX; hy_user=changhozhao',
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
            chatModelId: "deep_seek_v3"
        };

        const options = {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        };

        console.log('YuanBao: Prepared request options:', { url, method: options.method });

        try {
            return await new Promise((resolve, reject) => {
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
                            console.log('YuanBao: Processing chunk of size:', response.value?.length);
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
        } catch (error) {
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