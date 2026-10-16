# 回旋管运行参数记录系统（Flask-Admin 二开）

本目录是一个可以独立运行的 Flask 业务应用，使用 Flask-Admin 提供后台表格、增删改查和一对多内联表单；保留上游框架源码以便同步更新。

## 已有功能
- 无登录 Web 录入页面（**只能通过内网访问控制安全部署**）
- 每个回旋管使用 Serial 标识，(Serial, shot) 有数据库唯一约束
- 11 个固定字段：iplen、Uc、Ua、Ib、Im、Pf、Ic、Pw、Pc、remark、date
- 每炮独立增删改自定义参数：name、description、unit、data_type、value
- 历史炮次与自定义参数可恢复，新增炮次不继承上一炮参数
- 类型与保留字段名校验；pytest + GitHub Actions 自动测试

## 本地启动
```bash
cd examples/gyrotron
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[dev]'
python wsgi.py
# http://127.0.0.1:8000/admin/
```

默认使用 instance/gyrotron.sqlite3；正式部署建议 PostgreSQL。

## 测试
```bash
python -m pytest -q
```
push/PR 时 GitHub Actions 使用 Python 3.11、3.12、3.13 自动运行。仓库可能需要在 Actions 中启用工作流。

## Docker + PostgreSQL
```bash
cp .env.example .env
# 修改 .env 的 DB_PASSWORD 和 SECRET_KEY
docker compose up -d --build
```
Web 服务只映射宿主机 127.0.0.1:8000；参见 deploy/nginx.conf.example，将 IP 段收紧到实验室实际允许访问的网段后再部署。

## 上线前待办
- 已运行 CI Web 表单新增、历史编辑与参数删除等自动化测试；浏览器人工验收仍需完成
- 真实用户操作验收：新建炮次、同序列号同号校验、自定义参数新增/修改/删除、历史恢复
- 使用 Alembic 管理数据库结构升级（当前 MVP 启动使用 create_all）
- 设置实验数据定期备份、审计和误删恢复。无登录方案不能辨认操作者

Flask-Admin 上游使用 BSD-3-Clause 许可证：https://github.com/pallets-eco/flask-admin

## 数据备份与部署验收
- 运行 `bash scripts/backup-postgres.sh` 生成 PostgreSQL 自定义格式备份（`backups/` 已加入忽略列表），正式使用还应配置备份计划和离机保存。
- 恢复前停止 Web 写入，先在测试库验证。参考：`docker compose exec -T db pg_restore --clean --if-exists --no-owner -U gyrotron -d gyrotron < backups/备份文件.dump`。
- Nginx 示例默认只允许本机访问；按所内实际 IP 网段更新 allow，再执行 nginx -t 验证。
- GitHub Actions 临时 PostgreSQL 17 测试保存、重新连接和历史查看，也校验 Docker Compose 并构建 Docker 镜像。
- 所内 Log 主机、内网网段、备份位置必须在实际服务器现场验收。本仓库不会自动修改所内服务器。

## 端到端浏览器测试
GitHub Actions 使用真实 Chromium 浏览器执行 `browser_e2e.py`，覆盖点击“添加参数”、录入保存、新炮次界面重置、历史炮次打开与参数修改，并在 Actions 中上传截图产物；真实用户仍须确认部署后的界面与网络可用性。

## 现代中文前端（React + TypeScript）

主界面地址：\`/app/\`（根路径自动跳转），原始 Flask-Admin 路径 \`/admin/\` 仍保留用于兼容性测试与旧书签，不再是推荐入口。

- 前端：React 19、TypeScript、Vite 7、Tailwind CSS 4、TanStack Query、Recharts、Lucide；
- 后端：Flask JSON API (\`/api/v1\`)，复用现有 SQLAlchemy 模型、校验逻辑和 PostgreSQL 数据；
- 纯中文操作：概览、列表检索、分页、日期、固定数值、自定义参数（五种类型）、编辑与删除确认；
- 兼容局域网离线运行：构建后样式和 JS 由 Flask 本地静态资源提供，不依赖外部 CDN；
- 没有前端认证：仅允许授权内网 / SSH 隧道访问，切勿直接公网开放。

### 本地前端开发

\`\`\`bash
cd frontend
npm ci
npm run build  # 构建到 ../gyrotron/static/app
# 返回 ../ 目录，然后启动 Flask 访问 /app/
\`\`\`

开发前端时可以用 \`npm run dev\` 启动 Vite，所有 API 请求通过代理到本地 8000 端口的 Flask。前端独立部署时还需设置路由回退至 index.html。

### 容器部署

Dockerfile 使用 Node 构建阶段生成静态前端，最终仅保留 Python/Flask 运行时。应用无需新增前端端口，数据仍存放于既有 PostgreSQL Volume。新版部署前应先确认 GitHub Actions 的 React 构建、Chromium UI、PostgreSQL 集成与旧业务测试全部通过。


## V1.1 需求实现与本地验收（不涉及部署）

根据 V1.1 设计需求，本次实现的开发范围：

- 顶栏导航；工作台三项指标、线性脉宽散点图（大于等于 700000 ms 为橙色）、全部 Serial 数量柱状图、实验时间趋势图和点击散点打开详情。
- 单 Serial 炮次记录、按需加载、shot 倒序、固定列及自定义列选择、完整编辑（不提供行内编辑）、服务器筛选、Excel 双工作表及 CSV 双文件 ZIP 导出。
- 新炮次建议炮号、连续保存并录入下一炮、不继承上一炮测量值或自定义参数，以及新建表单本地草稿恢复。
- 后端强制九项固定 DECIMAL 参数及单位、shot BIGINT、date DATE 必填、remark TEXT；保存后 Serial/shot 不允许更改。自定义参数的五字段中，参数含义对应原有 description 字段，参数含义、单位及参数值允许为空。
- 批量删除先预览目标数量及目标集合摘要，确认后核对目标集合，再事务删除关联炮次和自定义参数。

本地验收命令：在 examples/gyrotron 下运行 `python -m pytest -q tests`；在 frontend 下运行 `npm ci && npm run build`；使用独立 SQLite 测试数据库启动 Flask 后运行 `python browser_e2e.py` 和 `python browser_react_e2e.py`。

**不涉及部署**：本次不迁移生产数据库、不更改 inA 或 Log 主机环境。既有数据库的实际 DDL 不会通过 SQLAlchemy create_all 自动迁移。当前记录表已支持方向键单元格定位、单格复制、Enter 编辑、服务器全量排序、九项固定参数区间筛选，以及数值/日期/文本自定义参数的多条件 AND 查询；尚不包含 Excel 式跨格矩形选区、批量粘贴和拖拽填充。

### 气泡云图与模拟脉宽范围

脉宽字段 iplen 在数据库中以 **ms** 存储，工作台气泡云图的横轴以 **s** 显示（线性坐标）。每炮一个半透明气泡，脉宽越长半径越大，纵向抖动仅用于避免气泡完全重叠。

仅对 TEST-SYNTH-GYRO- 前缀且备注含“【模拟测试数据】”的演示炮次，可使用 scripts/refresh_synthetic_iplen.py 将脉宽重新生成到 **1–1500 s（1000–1500000 ms）**。脚本默认只预览，传入 --apply 才写入；始终需要先备份数据库。其他字段、自定义参数、非合成炮次不会更改。
