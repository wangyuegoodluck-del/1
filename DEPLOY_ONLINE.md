# 个人线上发布说明

## 使用哪个版本

自己使用请发布当前项目源码版本，不要发布给同事的 Windows 压缩包。

同事包里设置了新的历史空间，会隐藏你之前的合同历史记录；自己使用不要设置 `VITE_CUSTOMER_HISTORY_SCOPE`。

## 推荐发布方式

推荐使用支持 Node.js 服务的平台，例如 Render、Railway、Fly.io 或自己的云服务器。

这个系统不只是纯静态网页，还包含：

- 登录中转接口
- 数据库中转接口
- 腾讯云 AI 识别中转接口

所以不要只上传 `dist` 静态目录，否则部分登录、历史记录、AI 识别功能可能不可用。

## 线上构建命令

```bash
npm install
npm run build
```

## 线上启动命令

```bash
npm start
```

## 环境变量

如果线上需要 AI 识别，请配置：

```text
VITE_TENCENT_SECRET_ID=你的腾讯云SecretId
VITE_TENCENT_SECRET_KEY=你的腾讯云SecretKey
```

自己使用并希望保留原历史记录时，不要配置：

```text
VITE_CUSTOMER_HISTORY_SCOPE
```

## 访问地址

部署成功后，平台会给你一个公网网址。以后你自己直接打开那个网址使用即可。
