# 有物 · youwu

记录拥有，看见每一天的价值。一个可自行部署的个人物品管理 Web 应用，使用 FastAPI、SQLite、React 和 TypeScript。

支持资产与心愿、分类与标签、附属物品、图片和附件、日均成本与目标、卖出与退役、回收站、趋势图及可调整布局。支持完整 ZIP 备份、旧平台备份导入和手动 WebDAV 备份。趋势计算使用 Worker，并在验证最新数据后复用浏览器缓存。

当前是单账号、自托管应用；不提供多用户权限体系、原生移动客户端或自动云同步。

项目仓库：[ymh001/youwu](https://github.com/ymh001/youwu)。问题与功能建议请使用仓库Issues；安全问题见[SECURITY.md](SECURITY.md)。

## Docker 运行

需要 Docker Engine 和 Compose 插件。从项目根目录运行：

```bash
docker compose up -d --build
```

访问 http://localhost:8080，首次访问创建自己的账号。数据保存在 `./data`；升级前先下载完整备份并备份该目录。不要把数据目录提交到代码仓库。

默认空库，不含个人资产或凭据。可选演示数据必须显式设置 `SEED_DEMO=1`，仅在空库初始化。`GUEST_LOGIN=1` 会允许输入 `guest` 免密码访问，只适用于独立、无私人数据的演示实例。

## 本地开发

需要 Python 3.12、Node.js 22.6+、npm。项目根目录创建虚拟环境并启动后端：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
.venv/bin/python -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

另一个终端：

```bash
npm --prefix web ci
npm --prefix web run dev
```

访问 Vite 输出的地址。前端开发代理保留 Host，遵循后端的同源请求校验；可用 `KEEPS_API_URL` 指定开发后端地址。生产构建由 FastAPI 同源提供：

```bash
npm --prefix web run build
```

## 验证

在项目根目录执行。后端测试显式使用临时数据目录，避免模块加载时创建真实数据库：

```bash
npm --prefix web test
npm --prefix web run build
```

```bash
test_data="$(mktemp -d)"
DATA_DIR="$test_data" PYTHONPATH=backend .venv/bin/python -m unittest discover -s backend/tests
```

测试结束后可以删除刚创建的临时目录。持续集成执行相同的测试和构建。

## 文档

- [部署与配置](docs/deployment.md)
- [数据与备份](docs/data-and-backup.md)
- [贡献约定](CONTRIBUTING.md)
- [安全问题](SECURITY.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)

本项目原创代码与公开版原创状态 SVG 采用 [MIT License](LICENSE)。公开包不含私人 Git 历史、运维记录、账号、资产图片或参考产品截图。截图将在使用虚构演示数据完成验收后补充。
