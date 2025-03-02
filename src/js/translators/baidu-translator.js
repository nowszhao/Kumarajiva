import Translator from './translator';



class BaiduTranslator extends Translator {
    constructor(config) {
        super(config);
        this.currentChatId = null;
    }

    async translate(text, retryCount = 3) {
        console.log('Baidu: Starting translation request for text:', text.substring(0, 50) + '...');
        const headers = {
            'Cookie': 'BIDUPSID=C262929C87F2A363F901E39041B9AD96; PSTM=1740798408; BAIDUID=C262929C87F2A3639A12E82CD944679B:FG=1; BAIDUID_BFESS=C262929C87F2A3639A12E82CD944679B:FG=1; BA_HECTOR=a404052ha50401202021a12028ekn71js4ue91v; ZFY=I:AsEgINh9rjdcTy22OoWlWvcAlSKb6pRkhjmlULmMpI:C; H_WISE_SIDS=60274_61027_61667_62169_62184_62187_62180_62197_62234_62255_62297_62327_62337_62347_62329_62368_62371; H_PS_PSSID=60274_61027_61667_62169_62184_62187_62180_62197_62234_62255_62297_62327_62337_62347_62329_62368_62371; BAIDUID=81F5619EAFB4FCADBDAACABE5B09F8AB:FG=1; H_WISE_SIDS=60273_61027_62127_62169_62184_62187_62182_62197_62235_62281_62135_62325_62340_62347_62328_62366',
            'Content-Type': 'application/json'
        };
    
        const body = JSON.stringify({
            "message": {
                "inputMethod": "chat_search",
                "isRebuild": false,
                "content": {
                    "query": "",
                    "agentInfo": {
                        "agent_id": [""],
                        "params": "{\"agt_rk\":1,\"agt_sess_cnt\":0}"
                    },
                    "qtype": 0,
                    "aitab_ct": "",
                    "extData": {
                        "0": "{",
                        "1": "\"",
                        "2": "e",
                        "3": "n",
                        "4": "t",
                        "5": "e",
                        "6": "r",
                        "7": "_",
                        "8": "t",
                        "9": "y",
                        "10": "p",
                        "11": "e",
                        "12": "\"",
                        "13": ":",
                        "14": "\"",
                        "15": "s",
                        "16": "i",
                        "17": "d",
                        "18": "e",
                        "19": "b",
                        "20": "a",
                        "21": "r",
                        "22": "_",
                        "23": "d",
                        "24": "i",
                        "25": "a",
                        "26": "l",
                        "27": "o",
                        "28": "g",
                        "29": "\"",
                        "30": "}"
                    }
                },
                "searchInfo": {
                    "srcid": "",
                    "order": "",
                    "tplname": "",
                    "re_rank": "1",
                    "ori_lid": "",
                    "sa": "bkb",
                    "chatParams": {},
                    "blockCmpt": [],
                    "usedModel": {
                        "modelName": "DeepSeek-R1",
                        "modelFunction": {
                            "internetSearch": "0"
                        }
                    },
                    "landingPageSwitch": "",
                    "landingPage": "aitab",
                    "applid": "",
                    "a_lid": "",
                    "enter_type": "sidebar_dialog",
                    "showMindMap": false
                },
                "from": "",
                "source": "pc_csaitab",
                "query": [
                    {
                        "type": "TEXT",
                        "data": {
                            "text": {
                                "query": text,
                                "text_type": ""
                            }
                        }
                    }
                ],
                "anti_ext": {
                    "inputT": 4235,
                    "ck1": 133,
                    "ck9": 1200,
                    "ck10": 348
                }
            },
            "setype": "csaitab",
            "rank": 1
        });

        const options = {
            method: 'POST',
            headers,
            body
        };

        console.log('Baidu: Prepared request options:', { method: options.method });

        try {
            return await new Promise((resolve, reject) => {
                let buffer = '';
                let result = '';
                const decoder = new TextDecoder();
                let isDone = false;

                // Create a unique port ID
                const portId = `baidu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                // Create a port for receiving streaming data
                const port = chrome.runtime.connect({ name: portId });
                
                // Set up port message listener
                port.onMessage.addListener((response) => {
                    // console.log('Baidu: Received port message:', response);

                    if (!response) {
                        console.error('Baidu: Received null/undefined response');
                        return;
                    }

                    if (response.type === 'error') {
                        console.error('Baidu: Received error response:', response.error);
                        port.disconnect();
                        reject(new Error(response.error));
                        return;
                    }

                    if (response.type === 'chunk') {
                        try {
                            // console.log('Baidu: Processing chunk of size:', response.value?.length);
                            const chunk = new Uint8Array(response.value);
                            const decodedChunk = decoder.decode(chunk, { stream: true });
                            // console.log('Baidu: Decoded chunk:', decodedChunk);
                            buffer += decodedChunk;
                            
                            // Process buffer line by line
                            const events = buffer.split('\n\n');
                            buffer = events.pop() || '';

                            for (const event of events) {
                                const lines = event.split('\n');
                                let eventType = '';
                                let data = '';

                                for (const line of lines) {
                                    if (line.startsWith('event:')) {
                                        eventType = line.substring(6).trim();
                                    } else if (line.startsWith('data:')) {
                                        data += line.substring(5).trim();
                                    }
                                }

                                if (eventType === 'message' && data) {
                                    try {
                                        // console.log('Baidu: Processing message data:', data);
                                        const jsonData = JSON.parse(data);
                                        const content = jsonData?.data?.message?.content?.generator?.data?.value;
                                        if (content) {
                                            // console.log('Baidu: Adding content chunk:', content);
                                            result += content;
                                        }
                                    } catch (e) {
                                        console.debug('Baidu: Failed to parse JSON:', e);
                                    }
                                }
                            }
                        } catch (e) {
                            console.error('Baidu: Error processing chunk:', e);
                        }
                    }

                    if (response.type === 'done') {
                        console.log('Baidu: Processing final buffer:', buffer);
                        if (buffer) {
                            const lines = buffer.split('\n');
                            for (const line of lines) {
                                if (line.startsWith('data:')) {
                                    const data = line.substring(5).trim();
                                    try {
                                        console.log('Baidu: Processing final data:', data);
                                        const jsonData = JSON.parse(data);
                                        const content = jsonData?.data?.message?.content?.generator?.data?.value;
                                        if (content) {
                                            console.log('Baidu: Adding final content:', content);
                                            result += content;
                                        }
                                    } catch (e) {
                                        console.debug('Baidu: Failed to parse final JSON:', e);
                                    }
                                }
                            }
                        }
                        
                        console.log('Baidu: Translation complete. Result:', result || text);
                        port.disconnect();
                        resolve(result || text);
                    }
                });

                // Handle port disconnect
                port.onDisconnect.addListener(() => {
                    console.log('Baidu: Port disconnected');
                    if (!isDone) {
                        reject(new Error('Connection closed before completion'));
                    }
                });

                // Send the request through the port
                console.log('Baidu: Sending proxyFetch message through port');
                port.postMessage({
                    type: 'proxyFetch',
                    url: 'https://chat.baidu.com/aichat/api/conversation',
                    options
                });
            });
        } catch (error) {
            console.error('Baidu: Translation error:', error);
            if (retryCount > 0) {
                console.log(`Baidu: Retrying translation, ${retryCount} attempts remaining...`);
                return this.translate(text, retryCount - 1);
            }
            throw error;
        }
    }
}

export default BaiduTranslator; 