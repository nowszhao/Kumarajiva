# Kumarajiva API 跨平台认证系统

## 概述

Kumarajiva API 现在支持完整的跨平台认证系统，能够为不同类型的客户端提供最佳的认证体验。系统基于您提到的方案进行了优化，通过 `state` 参数传递客户端类型，并根据不同平台返回相应的认证响应。

## 核心优化

### 1. 简化的认证流程

```javascript
const { code, state } = req.query;
const clientType = state; // 从state参数获取客户端类型

// 交换code获取access_token
const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
  client_id: GITHUB_CLIENT_ID,
  client_secret: GITHUB_CLIENT_SECRET,
  code,
}, { headers: { Accept: 'application/json' } });

// 根据客户端类型返回不同响应
switch (clientType) {
  case 'ios':
    res.redirect(`kumarajiva-ios://oauth-callback?token=${jwtToken}`);
    break;
  case 'web':
    res.redirect(`https://web-app.com/dashboard?token=${jwtToken}`);
    break;
  case 'chrome':
    res.json({ token: jwtToken });
    break;
}
```

### 2. 智能客户端检测

系统会自动检测客户端类型：
- 通过 `client_type` 查询参数
- 通过 `X-Client-Type` 请求头
- 通过 User-Agent 自动识别

### 3. 安全的State管理

使用JWT编码的state参数，包含：
- 客户端类型
- 时间戳（防重放攻击）
- 随机数（增强安全性）
- 自定义回调URL（可选）

## 支持的客户端类型

### 1. Web 应用 (`client_type=web`)

**特点：**
- 支持弹窗和重定向两种模式
- 使用Session + JWT双重认证
- 自动处理CORS跨域问题

**🔧 最新改进:**
- ✅ 修复了跨域消息传递问题，确保弹窗认证的稳定性
- ✅ 优化了错误处理，提供更好的用户反馈
- ✅ 增强了认证状态管理，避免登录状态卡住

**使用示例：**
```javascript
// 弹窗模式
const popup = window.open(
  'http://localhost:3000/api/auth/github?client_type=web',
  'oauth',
  'width=600,height=700'
);

// 重定向模式
window.location.href = 'http://localhost:3000/api/auth/github?client_type=web&callback_url=' + 
                       encodeURIComponent(window.location.origin + '/auth-callback');
```

### 2. iOS 应用 (`client_type=ios`)

**特点：**
- 使用JWT + Refresh Token
- 通过URL Scheme回调
- 自动token刷新机制

**配置URL Scheme：**
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>kumarajiva-ios</string>
    </array>
  </dict>
</array>
```

**使用示例：**
```swift
// 发起OAuth
let oauthURL = "http://localhost:3000/api/auth/github?client_type=ios"
UIApplication.shared.open(URL(string: oauthURL)!)

// 处理回调
func application(_ app: UIApplication, open url: URL) -> Bool {
    if url.scheme == "kumarajiva-ios" && url.host == "oauth-callback" {
        let accessToken = URLComponents(url: url)?.queryItems?
            .first(where: { $0.name == "access_token" })?.value
        // 保存token并继续
        return true
    }
    return false
}
```

### 3. Android 应用 (`client_type=android`)

**特点：**
- 使用JWT + Refresh Token
- 通过Intent Filter处理回调
- 支持安全存储

**配置Intent Filter：**
```xml
<activity android:name=".OAuthCallbackActivity">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="kumarajiva-android" />
    </intent-filter>
</activity>
```

**使用示例：**
```kotlin
// 发起OAuth
val oauthUrl = "http://localhost:3000/api/auth/github?client_type=android"
val intent = Intent(Intent.ACTION_VIEW, Uri.parse(oauthUrl))
startActivity(intent)

// 处理回调
override fun onCreate(savedInstanceState: Bundle?) {
    val data = intent.data
    if (data?.scheme == "kumarajiva-android" && data.host == "oauth-callback") {
        val accessToken = data.getQueryParameter("access_token")
        // 保存token并继续
    }
}
```

### 4. 桌面应用 (`client_type=desktop`)

**特点：**
- 使用JWT + Refresh Token
- 支持自定义回调URL
- 适用于Electron等桌面框架

**使用示例：**
```javascript
// Electron应用
const { shell } = require('electron');

// 发起OAuth
const callbackUrl = 'http://localhost:8080/oauth-callback';
const oauthUrl = `http://localhost:3000/api/auth/github?client_type=desktop&callback_url=${encodeURIComponent(callbackUrl)}`;
shell.openExternal(oauthUrl);

// 本地服务器监听回调
app.get('/oauth-callback', (req, res) => {
  const { access_token, refresh_token } = req.query;
  // 保存token并通知主进程
  mainWindow.webContents.send('auth-success', { access_token });
  res.send('认证成功！您可以关闭此页面。');
});
```

### 5. Chrome 插件 (`client_type=extension`)

**特点：**
- 直接返回JSON格式
- 无需重定向
- 适用于浏览器插件

**使用示例：**
```javascript
// Chrome插件 background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'authenticate') {
    fetch('http://localhost:3000/api/auth/github?client_type=extension')
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          chrome.storage.local.set({
            'access_token': data.data.access_token,
            'user': data.data.user
          });
          sendResponse({ success: true, data: data.data });
        }
      });
    return true;
  }
});
```

## Token 管理

### Access Token
- 有效期：7天
- 用于API请求认证
- 包含用户ID和客户端类型信息

### Refresh Token
- 有效期：30天
- 仅移动端和桌面应用使用
- 用于自动刷新Access Token

### Token 刷新
```javascript
// 刷新token
const response = await fetch('/api/auth/refresh', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ refresh_token: refreshToken })
});

const data = await response.json();
if (data.success) {
  // 保存新的token
  saveTokens(data.data.access_token, data.data.refresh_token);
}
```

## API 接口

### 认证相关接口

| 接口 | 方法 | 描述 |
|------|------|------|
| `/api/auth/github` | GET | OAuth登录入口 |
| `/api/auth/github/callback` | GET | OAuth回调处理 |
| `/api/auth/refresh` | POST | 刷新访问令牌 |
| `/api/auth/status` | GET | 检查认证状态 |
| `/api/auth/profile` | GET | 获取用户资料 |
| `/api/auth/logout` | POST | 用户登出 |

### 请求参数

**OAuth登录：**
```
GET /api/auth/github?client_type={type}&callback_url={url}
```
- `client_type`: 客户端类型 (web, ios, android, desktop, extension)
- `callback_url`: 自定义回调URL（可选）

**Token刷新：**
```
POST /api/auth/refresh
Content-Type: application/json

{
  "refresh_token": "your_refresh_token_here"
}
```

## 环境配置

### 必需配置
```env
# GitHub OAuth
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=http://localhost:3000/api/auth/github/callback

# 安全密钥
SESSION_SECRET=your_session_secret
JWT_SECRET=your_jwt_secret

# 认证模式
LEGACY_MODE=false
```

### 可选配置
```env
# 跨域设置
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# 移动端URL Scheme
IOS_URL_SCHEME=kumarajiva-ios
ANDROID_URL_SCHEME=kumarajiva-android

# Cookie域名（生产环境）
COOKIE_DOMAIN=your-domain.com
```

## 安全特性

### 1. CSRF 保护
- 使用JWT编码的state参数
- 包含时间戳防止重放攻击
- 10分钟有效期限制

### 2. 跨域安全
- 配置化的CORS源白名单
- 支持credentials的安全传输
- 适当的请求头限制

### 3. Token 安全
- JWT签名验证
- 客户端类型绑定
- 自动过期机制

### 4. 传输安全
- 生产环境强制HTTPS
- 安全的Cookie配置
- 敏感信息不记录日志

## 兼容性

### Legacy Mode
- `LEGACY_MODE=true`: 兼容现有应用，认证可选
- `LEGACY_MODE=false`: 严格认证模式，推荐新应用

### 迁移指南
1. 保持 `LEGACY_MODE=true` 运行现有系统
2. 逐步集成新的认证流程
3. 测试完成后切换到 `LEGACY_MODE=false`

## 测试

### 自动化测试
```bash
# 运行认证系统测试
node test-auth.js
```

### 手动测试
```bash
# 测试不同客户端类型
curl "http://localhost:3000/api/auth/github?client_type=web"
curl "http://localhost:3000/api/auth/github?client_type=ios"
curl "http://localhost:3000/api/auth/github?client_type=android"
```

## 故障排除

### 常见问题

1. **跨域错误**
   - 检查 `CORS_ORIGINS` 配置
   - 确保客户端域名在白名单中

2. **移动端回调失败**
   - 验证URL Scheme配置
   - 检查Intent Filter设置

3. **Token刷新失败**
   - 确认Refresh Token未过期
   - 检查客户端类型匹配

4. **Web弹窗认证失败 (postMessage跨域错误)**
   - **问题症状**: 控制台显示 `Failed to execute 'postMessage' on 'DOMWindow': The target origin provided does not match the recipient window's origin`
   - **原因**: 弹窗页面(API服务器)与主页面(前端服务器)在不同的origin
   - **解决方案**: 
     - API回调使用 `'*'` 作为postMessage目标origin
     - 前端验证消息来源时同时接受API服务器和前端服务器的origin
   - **代码示例**:
     ```javascript
     // API回调页面
     window.opener.postMessage({
         type: 'OAUTH_SUCCESS',
         data: authData.data
     }, '*'); // 使用 '*' 而不是 window.location.origin
     
     // 前端消息验证
     const apiOrigin = API_BASE_URL.replace('/api', '');
     if (event.origin !== window.location.origin && event.origin !== apiOrigin) {
         return; // 拒绝来自未知origin的消息
     }
     ```

5. **弹窗被浏览器阻止**
   - 检查浏览器弹窗设置
   - 确保允许来自localhost的弹窗
   - 考虑使用重定向模式作为备选方案

### 调试模式
```env
NODE_ENV=development
DEBUG=kumarajiva:*
```

## 总结

新的跨平台认证系统具有以下优势：

1. **简化对接**：通过state参数传递客户端类型，简化了不同平台的对接流程
2. **安全可靠**：使用JWT编码state，防止CSRF攻击和重放攻击
3. **灵活配置**：支持自定义回调URL和多种认证模式
4. **向后兼容**：Legacy模式确保现有应用无需修改即可使用
5. **易于维护**：统一的认证逻辑，减少代码重复

这个方案确实能够很好地解决和简化应用对接问题，为不同平台提供了最佳的认证体验。 