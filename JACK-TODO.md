# Jack TODO — 发布上线

## 代码准备 (已完成)

- [x] API URL 动态化 — 生产同源，开发 localhost:3001
- [x] Express 生产模式 serve 前端静态文件
- [x] `pnpm start` 生产启动脚本
- [x] TS 类型错误修复 — store.ts 与 server.ts 类型对齐
- [x] `pnpm build` 通过
- [x] 182 tests 全部通过

## 代码质量修复 (已完成)

- [x] store.ts 类型与 server.ts 对齐 (priority union、SkillStatus 等)
- [x] uid() 改用 crypto.randomUUID() 替代弱随机
- [x] 删除 workspace 时清理 RAG 内存 (clearStore)
- [x] Home.tsx 未捕获 promise (listWorkspaces、deleteWorkspace)
- [x] 测试 mock 补齐 (rag.js clearStore、TS this 类型注解)

## 选平台

SQLite (better-sqlite3) 是 native 模块，需要持久文件系统，**Vercel serverless 不适合**。

推荐:
- **Railway** — 最简单，支持 Node.js + Volume 持久存储
- **Render** — 类似，需要 Disk 附加存储
- **Fly.io** — 需要写 Dockerfile

如果坚持 Vercel → 只能前后端分离: Vercel 放前端, Railway 放后端

## 部署步骤

- [ ] 平台上创建项目，连 GitHub 仓库
- [ ] 设置环境变量:
  - `NODE_ENV=production`
  - `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` (至少一个)
  - `TAVILY_API_KEY` (可选，搜索功能)
  - `LANGSMITH_API_KEY` + `LANGSMITH_PROJECT=roadbook` (可选，tracing)
- [ ] 构建命令: `pnpm install && pnpm build`
- [ ] 启动命令: `pnpm start`
- [ ] 挂载持久存储 Volume 到 `data/` 目录 (SQLite 数据库)
- [ ] Railway 注意: 端口用 `ARIADNE_PORT=$PORT`

## 前后端分离方案 (如果用 Vercel)

- [ ] Vercel: Framework=Vite, Build=`pnpm build`, Output=`dist`
- [ ] 环境变量加 `VITE_API_URL=https://你的后端地址`
- [ ] 后端单独部署到 Railway，CORS 需放行 Vercel 域名
