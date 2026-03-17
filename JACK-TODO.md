# Jack TODO — 发布上线 (Vercel + Fly.io)

架构: Vercel (前端 SPA + 你的域名) → Fly.io (Express API + SQLite)

## 代码准备 (已完成)

- [x] API URL 动态化 (`VITE_API_URL`)
- [x] Express 生产模式 serve 静态文件 (单体备用)
- [x] `pnpm start` 生产启动脚本
- [x] CORS 可配置 (`CORS_ORIGIN` 环境变量)
- [x] Dockerfile + .dockerignore + fly.toml
- [x] vercel.json (SPA rewrites)
- [x] TS 类型修复，build 通过，182 tests 通过

## 部署步骤

### Vercel (前端)
- [ ] Vercel import GitHub 仓库
- [ ] Framework: Vite, Build: `pnpm build`, Output: `dist`
- [ ] 环境变量: `VITE_API_URL=https://roadbook.fly.dev`
- [ ] 绑定你的自定义域名

### Fly.io (后端)
- [ ] 买 $25 credits (不绑卡，硬上限)
- [ ] 创建应用 + Volume:
  ```
  fly launch --no-deploy
  fly volumes create roadbook_data --region nrt --size 1
  ```
- [ ] 设置 secrets:
  ```
  fly secrets set ANTHROPIC_API_KEY=xxx
  fly secrets set CORS_ORIGIN=https://你的域名.com,https://roadbook.vercel.app
  ```
- [ ] 部署: `fly deploy`
- [ ] 把 fly 分配的域名 (xxx.fly.dev) 填回 Vercel 的 `VITE_API_URL`
