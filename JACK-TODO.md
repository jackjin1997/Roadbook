# Jack TODO — 发布上线 (Vercel + Fly.io) ✅ DONE

架构: Vercel (前端 SPA + 你的域名) → Fly.io (Express API + SQLite)

## 代码准备 (已完成)

- [x] API URL 动态化 (`VITE_API_URL`)
- [x] Express 生产模式 serve 静态文件 (单体备用)
- [x] `pnpm start` 生产启动脚本
- [x] CORS 可配置 (`CORS_ORIGIN` 环境变量)
- [x] Dockerfile + .dockerignore + fly.toml
- [x] vercel.json (SPA rewrites)
- [x] TS 类型修复，build 通过，182 tests 通过

## 部署步骤 (已完成)

### Vercel (前端)
- [x] Vercel import GitHub 仓库
- [x] Framework: Vite, Build: `pnpm build`, Output: `dist`
- [x] 环境变量: `VITE_API_URL=https://roadbook.fly.dev`
- [x] 绑定你的自定义域名

### Fly.io (后端)
- [x] 创建应用 + Volume
- [x] 设置 secrets (ANTHROPIC_API_KEY, CORS_ORIGIN)
- [x] 部署: `fly deploy`
- [x] fly 域名已配回 Vercel 的 `VITE_API_URL`
