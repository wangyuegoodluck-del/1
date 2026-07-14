# 个人线上发布说明

## 使用哪个版本

自己使用请发布当前项目源码版本，不要发布给同事的 Windows 压缩包。

同事包里设置了新的历史空间，会隐藏你之前的合同历史记录；自己使用不要设置 `VITE_CUSTOMER_HISTORY_SCOPE`。

## 推荐发布方式

推荐使用支持 Node.js 服务的平台，例如 Render、Railway、Fly.io 或自己的云服务器。大陆稳定使用时，更推荐放在国内云服务器上运行 Node 服务。

这个系统不只是纯静态网页，还包含：

- 登录中转接口
- 数据库中转接口
- 腾讯云 AI 识别中转接口

所以不要只上传 `dist` 静态目录，否则登录、历史记录、产品库、AI 识别等功能不可用。

## 大陆无 VPN 版本说明

当前版本默认不再依赖浏览器直连 Firebase/Google。登录、历史记录、产品库、用户审批都会走自己的后端接口，并写入本地数据文件：

```text
.local-data/db.json
```

这个目录不会提交到 GitHub，避免把真实合同历史上传。

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

自己使用并希望所有历史记录都在同一个空间时，不要配置：

```text
VITE_CUSTOMER_HISTORY_SCOPE
```

## 访问地址

部署成功后，平台会给你一个公网网址。以后你自己直接打开那个网址使用即可。
