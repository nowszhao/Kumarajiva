export default {
    kimi: {
        apiToken: 'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ1c2VyLWNlbnRlciIsImV4cCI6MTc0NTc5NDIxMiwiaWF0IjoxNzM4MDE4MjEyLCJqdGkiOiJjdWMwcjk2bjNta2JwY21ndGI2MCIsInR5cCI6ImFjY2VzcyIsImFwcF9pZCI6ImtpbWkiLCJzdWIiOiJjb2ZzamI5a3FxNHR0cmdhaGhxZyIsInNwYWNlX2lkIjoiY29mc2piOWtxcTR0dHJnYWhocGciLCJhYnN0cmFjdF91c2VyX2lkIjoiY29mc2piOWtxcTR0dHJnYWhocDAiLCJyb2xlcyI6WyJmX212aXAiLCJ2aWRlb19nZW5fYWNjZXNzIl0sInNzaWQiOiIxNzMwMzAzNjQ3NjY1MTIzNDEzIiwiZGV2aWNlX2lkIjoiNzM1ODgyMTg1OTE0OTc1MjMyOSJ9.j3UoRKj4tI8sZmxfBt8W_wus9ZJ3EqR91XNQVapveAv5uCViugJTo7LT7Aa1-a8k_5E9PeLPXxkyybLONU_fBg',
        maxRetries: 10,
        model: 'kimi',
        url:''
    },
    doubao: {
        apiToken: '6ac50f1b-775a-48a1-9ae8-b013ba71da6f',
        maxRetries: 3,
        model: 'doubao-1-5-vision-pro-32k-250115',
        url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions'
    },
    qwen: {
        apiToken: 'eeqo4OWmYhFgRh6*gdY_CtreMU*Ent6AHvLFvsFhJ_4P7x7INIiTM8J6jh5GQDYJ0',
        maxRetries: 3,
        model: 'qwen',
        url: 'http://47.121.117.100:8001/v1/chat/completions'
    },
    deepseek: {
        apiToken: 'iYSjGvkKY/UGvlNVc4HF9mPEpjgLEcCEdx+30eeDj326NKwXpTWenlN2/5E1VARU',
        maxRetries: 3,
        model: 'deepseek',
        url: 'http://47.121.117.100:8002/v1/chat/completions'
    }, 
    kimiv1: {
        apiToken: 'sk-Z6YApuZ0y89eAMLTaaySq52s9jQNT9BdgqhbLKY8bTp2CtFA',
        maxRetries: 3,
        model: 'moonshot-v1-8k',
        url: 'https://api.moonshot.cn/v1/chat/completions'
    },
    yuanbao: {
        apiToken: 'xx',
        maxRetries: 3,
        model: 'deepseek-v3',
        url: 'xx'
    },
    baidu: {
        apiToken: 'xx',
        maxRetries: 3,
        model: 'deepseek-chat',
        url: 'xx'
    },
    translation: {
        defaultService: 'doubao',
        batchSize: 10,
        batchInterval: 2000,
        maxSubtitles: 5,
        maxRetries: 30,
        interaction: {
            triggerKey: 'Control',
            enableTriggerKey: true,
            autoShowWordDetails: true
        }
    }
}; 
