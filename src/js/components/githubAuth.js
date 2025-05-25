export class GitHubAuth {
    constructor() {
        this.baseUrl = 'http://47.121.117.100:3000'; // 默认同步服务器地址
        this.accessToken = null;
        this.userInfo = null;
    }

    async initialize() {
        // 从存储中加载已保存的认证信息
        const authData = await chrome.storage.sync.get(['githubAccessToken', 'githubUserInfo']);
        if (authData.githubAccessToken && authData.githubUserInfo) {
            this.accessToken = authData.githubAccessToken;
            this.userInfo = authData.githubUserInfo;
            return true;
        }
        return false;
    }

    async login() {
        try {
            // 使用Chrome插件的OAuth登录方式
            const authUrl = `${this.baseUrl}/api/auth/github?client_type=extension`;
            
            return new Promise((resolve, reject) => {
                // 创建一个新标签页进行OAuth登录
                chrome.tabs.create({ url: authUrl }, (tab) => {
                    const tabId = tab.id;
                    let authCompleted = false;
                    
                    // 监听标签页更新
                    const updateListener = (updatedTabId, changeInfo, updatedTab) => {
                        if (updatedTabId === tabId && changeInfo.url && !authCompleted) {
                            console.log('Tab updated:', changeInfo.url);
                            
                            // 检查是否是认证回调页面
                            if (changeInfo.url.includes('/api/auth/github/callback') || 
                                changeInfo.url.includes('oauth-callback') ||
                                changeInfo.url.includes('access_token')) {
                                
                                // 延迟一下确保页面加载完成
                                setTimeout(() => {
                                    // 尝试从页面获取认证信息
                                    chrome.scripting.executeScript({
                                        target: { tabId: updatedTabId },
                                        func: () => {
                                            // 尝试从页面内容获取认证信息
                                            const bodyText = document.body.innerText || document.body.textContent;
                                            console.log('Page content:', bodyText);
                                            
                                            try {
                                                // 尝试解析整个页面内容为JSON
                                                const jsonData = JSON.parse(bodyText.trim());
                                                if (jsonData.success && jsonData.data) {
                                                    return jsonData;
                                                }
                                            } catch (e) {
                                                console.log('Failed to parse entire page as JSON');
                                            }
                                            
                                            try {
                                                // 尝试匹配JSON片段
                                                const jsonMatch = bodyText.match(/\{[^}]*"success"[^}]*"data"[^}]*\{[^}]*\}[^}]*\}/);
                                                if (jsonMatch) {
                                                    const jsonData = JSON.parse(jsonMatch[0]);
                                                    if (jsonData.success && jsonData.data) {
                                                        return jsonData;
                                                    }
                                                }
                                            } catch (e) {
                                                console.log('Failed to parse JSON match');
                                            }
                                            
                                            // 检查URL参数
                                            const urlParams = new URLSearchParams(window.location.search);
                                            const token = urlParams.get('access_token') || urlParams.get('token');
                                            if (token) {
                                                return { success: true, data: { access_token: token } };
                                            }
                                            
                                            return null;
                                        }
                                    }, (results) => {
                                        if (chrome.runtime.lastError) {
                                            console.error('Script execution error:', chrome.runtime.lastError);
                                            return;
                                        }
                                        
                                        if (results && results[0] && results[0].result) {
                                            const authData = results[0].result;
                                            console.log('Auth data received:', authData);
                                            
                                            if (authData.success && authData.data) {
                                                authCompleted = true;
                                                chrome.tabs.onUpdated.removeListener(updateListener);
                                                chrome.tabs.onRemoved.removeListener(removeListener);
                                                
                                                this.handleAuthSuccess(authData.data).then(() => {
                                                    chrome.tabs.remove(tabId);
                                                    resolve(authData.data);
                                                }).catch(error => {
                                                    chrome.tabs.remove(tabId);
                                                    reject(error);
                                                });
                                            }
                                        }
                                    });
                                }, 1000); // 等待1秒确保页面加载完成
                            }
                        }
                    };
                    
                    // 监听标签页关闭
                    const removeListener = (removedTabId) => {
                        if (removedTabId === tabId && !authCompleted) {
                            chrome.tabs.onUpdated.removeListener(updateListener);
                            chrome.tabs.onRemoved.removeListener(removeListener);
                            reject(new Error('登录已取消'));
                        }
                    };
                    
                    chrome.tabs.onUpdated.addListener(updateListener);
                    chrome.tabs.onRemoved.addListener(removeListener);
                    
                    // 设置超时
                    setTimeout(() => {
                        if (!authCompleted) {
                            chrome.tabs.onUpdated.removeListener(updateListener);
                            chrome.tabs.onRemoved.removeListener(removeListener);
                            chrome.tabs.remove(tabId);
                            reject(new Error('登录超时'));
                        }
                    }, 300000); // 5分钟超时
                });
            });
        } catch (error) {
            console.error('GitHub login failed:', error);
            throw error;
        }
    }

    async handleAuthSuccess(authData) {
        console.log('Handling auth success with data:', authData);
        
        // 从不同的可能字段中提取token
        this.accessToken = authData.access_token || authData.token;
        
        if (!this.accessToken) {
            throw new Error('No access token found in auth data');
        }
        
        // 如果authData中已经包含用户信息，直接使用
        if (authData.user) {
            this.userInfo = authData.user;
            
            // 保存到存储
            await chrome.storage.sync.set({
                githubAccessToken: this.accessToken,
                githubUserInfo: this.userInfo
            });
            
            return { success: true, user: this.userInfo };
        } else {
            // 否则通过API获取用户信息
            try {
                const userInfo = await this.fetchUserInfo();
                this.userInfo = userInfo;
                
                // 保存到存储
                await chrome.storage.sync.set({
                    githubAccessToken: this.accessToken,
                    githubUserInfo: this.userInfo
                });
                
                return { success: true, user: this.userInfo };
            } catch (error) {
                console.error('Failed to fetch user info:', error);
                throw error;
            }
        }
    }

    async fetchUserInfo() {
        if (!this.accessToken) {
            throw new Error('No access token available');
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/auth/profile`, {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch user info: ${response.statusText}`);
            }

            const result = await response.json();
            if (result.success) {
                return result.data;
            } else {
                throw new Error('Failed to get user info from response');
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
            throw error;
        }
    }

    async logout() {
        try {
            // 清除本地存储的认证信息
            await chrome.storage.sync.remove(['githubAccessToken', 'githubUserInfo']);
            this.accessToken = null;
            this.userInfo = null;
            
            return { success: true };
        } catch (error) {
            console.error('Logout failed:', error);
            throw error;
        }
    }

    isAuthenticated() {
        return !!(this.accessToken && this.userInfo);
    }

    getAuthHeaders() {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }
        
        return {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
        };
    }

    getUserInfo() {
        return this.userInfo;
    }

    getApiUrl(endpoint) {
        return `${this.baseUrl}/api/${endpoint}`;
    }
} 