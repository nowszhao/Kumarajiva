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
        apiToken: "pgv_pvid=2613634336; _qimei_q36=; _qddaz=QD.948925886822854; hy_source=web; hy_user=changhozhao; hy_token=ybUPT4mXukWon0h18MPy9Z9z/kUm76vaMMrI/RwMoSEjdtz7lJl8vPi66lDYZhkX; _qimei_uuid42=1921716320d100571f8691ef9df83ce091865b99b5; _qimei_i_3=23da50d1910859d9c797f863538572e3f3e9f2f1430e528bb7da2d0c21c1213a613732973989e2bd9fb5; _ga_RPMZTEBERQ=GS1.1.1740645782.2.0.1740645804.0.0.0; _qimei_h38=5f87dc591f8691ef9df83ce003000001719408; _ga_6WSZ0YS5ZQ=GS1.1.1744893987.118.0.1744893991.0.0.0; _ga=GA1.2.1711533927.1658325660; _gcl_au=1.1.737357221.1745204412; _qimei_fingerprint=b9113834aeb4fe58c1a6bc1fed2f8727; sensorsdata2015jssdkcross=%7B%22distinct_id%22%3A%22100018062650%22%2C%22first_id%22%3A%22189da6b5f04b2-0afc3518a6dfc38-1a525634-1930176-189da6b5f05c02%22%2C%22props%22%3A%7B%22%24latest_traffic_source_type%22%3A%22%E8%87%AA%E7%84%B6%E6%90%9C%E7%B4%A2%E6%B5%81%E9%87%8F%22%2C%22%24latest_utm_medium%22%3A%22cpc%22%7D%2C%22identities%22%3A%22eyIkaWRlbnRpdHlfY29va2llX2lkIjoiMTg5ZGE2YjVmMDRiMi0wYWZjMzUxOGE2ZGZjMzgtMWE1MjU2MzQtMTkzMDE3Ni0xODlkYTZiNWYwNWMwMiIsIiRpZGVudGl0eV9sb2dpbl9pZCI6IjEwMDAxODA2MjY1MCJ9%22%2C%22history_login_id%22%3A%7B%22name%22%3A%22%24identity_login_id%22%2C%22value%22%3A%22100018062650%22%7D%2C%22%24device_id%22%3A%22189da6b5f04b2-0afc3518a6dfc38-1a525634-1930176-189da6b5f05c02%22%7D; _qimei_i_1=41fe6487c352578f9292f7310d8c75e9f6bbf2f8460d0b81e7da28582593206c616336923980e6dcde8cd186",
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
