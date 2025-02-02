import Translator from './translator';

class QwenTranslator extends Translator {
    async translate(text, retryCount = 0) {
        try {
            const response = await fetch('https://47.121.117.100:4430/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.apiToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: "qwen",
                    messages: [{
                        role: "user",
                        content: text
                    }],
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            console.log("Qwen response:", response);

            const data = await response.json();
            console.log("Qwen response-data:", data);
            return data.choices[0].message.content;
        } catch (error) {
            console.error('Qwen translation failed:', error);

            if (retryCount < this.config.maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
                return this.translate(text, retryCount + 1);
            }
            return null;
        }
    }
}

export default QwenTranslator; 