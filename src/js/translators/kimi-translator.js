import Translator from './translator';

class KimiTranslator extends Translator {
    constructor(config) {
        super(config);
        this.currentChatId = null;
    }

    async createChat() {
        try {
            const response = await fetch('https://kimi.moonshot.cn/api/chat', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: "YouTube Translation",
                    is_example: false,
                    enter_method: "new_chat",
                    kimiplus_id: "kimi"
                })
            });
            
            const data = await response.json();
            this.currentChatId = data.id;
            console.log("Created new chat ID:", data.id);
            return data.id;
        } catch (error) {
            console.error('Failed to create Kimi chat:', error);
            return null;
        }
    }

    async translate(text, retryCount = 0) {
        const chatId = await this.createChat();
        if (!chatId) return null;

        try {
            const response = await fetch(`https://kimi.moonshot.cn/api/chat/${chatId}/completion/stream`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messages: [{
                        role: "user",
                        content: text
                    }],
                    refs: [],
                    user_search: true
                })
            });
            console.log("Kimi response:", response);

            if (!response.ok) {
                if ((response.status === 400 || response.status === 401) && retryCount < this.config.maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                    return this.translate(text, retryCount + 1);
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body.getReader();
            let translation = '';
            
            while (true) {
                const {done, value} = await reader.read();
                if (done) break;
                
                const chunk = new TextDecoder().decode(value);
                const lines = chunk.split('\n');
                
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = JSON.parse(line.slice(6));
                        if (data.event === 'cmpl') {
                            translation += data.text;
                        }
                    }
                }
            }

            return translation.trim();
        } catch (error) {
            console.error('Translation failed:', error);
            if (retryCount < this.config.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return this.translate(text, retryCount + 1);
            }
            return null;
        } finally {
            await this.cleanup();
        }
    }

    async cleanup() {
        if (this.currentChatId) {
            try {
                await fetch(`https://kimi.moonshot.cn/api/chat/${this.currentChatId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${this.config.apiToken}`
                    }
                });
            } catch (error) {
                console.error('Error cleaning up chat:', error);
            }
            this.currentChatId = null;
        }
    }
}

export default KimiTranslator; 