export default {
    kimi: {
        apiToken: 'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ1c2VyLWNlbnRlciIsImV4cCI6MTc0NTc5NDIxMiwiaWF0IjoxNzM4MDE4MjEyLCJqdGkiOiJjdWMwcjk2bjNta2JwY21ndGI2MCIsInR5cCI6ImFjY2VzcyIsImFwcF9pZCI6ImtpbWkiLCJzdWIiOiJjb2ZzamI5a3FxNHR0cmdhaGhxZyIsInNwYWNlX2lkIjoiY29mc2piOWtxcTR0dHJnYWhocGciLCJhYnN0cmFjdF91c2VyX2lkIjoiY29mc2piOWtxcTR0dHJnYWhocDAiLCJyb2xlcyI6WyJmX212aXAiLCJ2aWRlb19nZW5fYWNjZXNzIl0sInNzaWQiOiIxNzMwMzAzNjQ3NjY1MTIzNDEzIiwiZGV2aWNlX2lkIjoiNzM1ODgyMTg1OTE0OTc1MjMyOSJ9.j3UoRKj4tI8sZmxfBt8W_wus9ZJ3EqR91XNQVapveAv5uCViugJTo7LT7Aa1-a8k_5E9PeLPXxkyybLONU_fBg',
        maxRetries: 10,
        model: 'kimi',
        url:''
    },
    doubao: {
        apiToken: '4c90226de33bbfd4f7c7062989959a3a',
        maxRetries: 3,
        model: 'doubao',
        url: 'http://47.121.117.100:8000/v1/chat/completions'
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
        apiToken: 'eyJhbGciOiJIUzUxMiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ1c2VyLWNlbnRlciIsImV4cCI6MTc0NTc5NDIxMiwiaWF0IjoxNzM4MDE4MjEyLCJqdGkiOiJjdWMwcjk2bjNta2JwY21ndGI2ZyIsInR5cCI6InJlZnJlc2giLCJhcHBfaWQiOiJraW1pIiwic3ViIjoiY29mc2piOWtxcTR0dHJnYWhocWciLCJzcGFjZV9pZCI6ImNvZnNqYjlrcXE0dHRyZ2FoaHBnIiwiYWJzdHJhY3RfdXNlcl9pZCI6ImNvZnNqYjlrcXE0dHRyZ2FoaHAwIiwicm9sZXMiOlsiZl9tdmlwIiwidmlkZW9fZ2VuX2FjY2VzcyJdLCJzc2lkIjoiMTczMDMwMzY0NzY2NTEyMzQxMyIsImRldmljZV9pZCI6IjczNTg4MjE4NTkxNDk3NTIzMjkifQ.NbyE8tzvtB5sRWVJmku4HqnSZo2quTUMa4_r_DXoKzkJjT98htpRZ6mJQDoKGclO0sAz6I_v1TdjM961NZos3g',
        maxRetries: 3,
        model: 'kimi-research',
        url: 'http://47.121.117.100:8003/v1/chat/completions'
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