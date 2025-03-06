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
        apiToken: "_qimei_uuid42=193010b053510040bdbe959987347987350c2698a9; hy_source=web; _qimei_fingerprint=579ad3031f0737dafe77266cbcb409d8; _qimei_i_3=66c04685c60e02dac5c4fe615b8626e3f2b8f6a04409578be2de7b5e2e93753e626a3f973989e2a0d790; _qimei_h38=72e5991abdbe9599873479870300000f019301; hy_user=changhozhao; hy_token=ybUPT4mXukWon0h18MPy9Z9z/kUm76vaMMrI/RwMoSEjdtz7lJl8vPi66lDYZhkX; _qimei_i_1=4cde5185970f55d2c896af620fd626e9f2e7adf915580785bd872f582593206c616351a53980e1dcd784a1e7; hy_source=web; hy_token=ybUPT4mXukWon0h18MPy9Z9z/kUm76vaMMrI/RwMoSEjdtz7lJl8vPi66lDYZhkX; hy_user=changhozhao",
        maxRetries: 3,
        model: 'deepseek-v3',
        url: '已内置，无需修改'
    },
    baidu: {
        apiToken: 'BIDUPSID=C262929C87F2A363F901E39041B9AD96; PSTM=1740798408; BAIDUID=C262929C87F2A3639A12E82CD944679B:FG=1; BAIDUID_BFESS=C262929C87F2A3639A12E82CD944679B:FG=1; BA_HECTOR=a404052ha50401202021a12028ekn71js4ue91v; ZFY=I:AsEgINh9rjdcTy22OoWlWvcAlSKb6pRkhjmlULmMpI:C; H_WISE_SIDS=60274_61027_61667_62169_62184_62187_62180_62197_62234_62255_62297_62327_62337_62347_62329_62368_62371; H_PS_PSSID=60274_61027_61667_62169_62184_62187_62180_62197_62234_62255_62297_62327_62337_62347_62329_62368_62371; BAIDUID=81F5619EAFB4FCADBDAACABE5B09F8AB:FG=1; H_WISE_SIDS=60273_61027_62127_62169_62184_62187_62182_62197_62235_62281_62135_62325_62340_62347_62328_62366',
        maxRetries: 3,
        model: 'deepseek-chat',
        url: '已内置，无需修改'
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
