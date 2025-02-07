// 翻译器基类
class Translator {
    constructor(config = {}) {
        this.config = config;
    }

    // Add helper function to perform proxy fetch via background
    async proxyFetch(url, options) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: "proxyFetch", url, options }, (response) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });
    }

    async translate(text,retryCount = 0) {
        console.log("text:", text,", config:",this.config);
        try {
            const options = {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: [{
                        role: "user",
                        content: text
                    }],
                    stream: false
                })
            };

            // Use proxyFetch instead of direct fetch
            const response = await this.proxyFetch(this.config.url, options);

            if (!response.success) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            console.log(`${this.config.model} response:`, response);

            const data = JSON.parse(response.body);
            console.log(`${this.config.model} response-data:`, data);
            return data.choices[0].message.content;
        } catch (error) {
            console.error(`${this.config.model} translation failed:`, error);

            if (retryCount < this.config.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return this.translate(text, retryCount + 1);
            }
            return null;
        }
    }

    async cleanup() {
        // 可选的清理方法
    }
}

export default Translator; 