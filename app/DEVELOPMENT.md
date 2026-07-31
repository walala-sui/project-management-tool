# 项目管理工具 — 开发文档

## 技术架构

```
浏览器 ──→ http://localhost:3000 ──→ Express (server.js)
                                        │
                                   JSON 文件存储 (data/)
                                        │
                                   public/index.html
                                   (单页应用, 约2000行 JS)
```

- **前端**: 原生 HTML/CSS/JavaScript，零框架依赖
- **后端**: Node.js + Express，RESTful API，单文件约 350 行
- **存储**: JSON 文件，每个项目一个文件，人员库/白名单/模板各一个文件
- **甘特图**: 手绘 SVG（项目甘特图 + 人员跨项目甘特图）
- **导出**: CSV（UTF-8 BOM），Excel 可直接打开
- **桌面启动**: VBS 脚本静默启动服务器并自动打开浏览器

## 目录结构

```
管理工具/
├── server.js           # 后端入口 (~350行)
├── package.json        # Node 依赖 (仅 express)
├── 启动桌面应用.vbs     # Windows 双击启动
├── 启动服务器.bat       # 命令行启动 (调试用)
├── 停止服务器.bat       # 关闭 3000 端口进程
├── public/
│   ├── index.html      # 前端 (HTML+CSS+JS 全合一)
│   └── manual.html     # 使用手册
└── data/
    ├── resources.json   # 人员库
    ├── ip-whitelist.json # IP 白名单
    ├── templates.json   # 项目模板
    └── projects/
        └── *.json       # 项目文件
```

## 数据模型

### 项目文件

```json
{
  "id": "project-001",
  "name": "项目名称",
  "description": "描述",
  "startDate": "2026-08-01",
  "endDate": "2026-12-31",
  "status": "active",
  "tasks": [
    {
      "id": "t1",
      "name": "任务名称",
      "parentId": "t0",
      "resourceId": "r1",
      "memberIds": ["r2", "r3"],
      "startDate": "2026-08-01",
      "endDate": "2026-08-31",
      "duration": 22,
      "progress": 35,
      "predecessors": ["t0"],
      "level": 0,
      "completed": false
    }
  ]
}
```

`status` 取值：`"active"`（进行中）| `"on-hold"`（暂时搁置）| `"completed"`（已完成）。默认 `"active"`。

`memberIds` 为任务参与成员 ID 数组（可选，默认为空数组）。

### 人员库

```json
[
  {"id": "r1", "name": "姓名", "department": "部门"}
]
```

### IP 白名单

```json
{
  "ips": ["192.168.1.100", "192.168.1.0/24"]
}
```

### 项目模板

```json
[
  {
    "id": "tpl-xxx",
    "name": "模板名称",
    "tasks": [
      {"name": "阶段任务名", "level": 0, "duration": 14}
    ]
  }
]
```

## API 接口

### 项目

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/projects` | 项目列表（含 status 字段） |
| GET | `/api/projects/:id` | 单个项目完整数据 |
| POST | `/api/projects` | 新建项目（含 status、tasks） |
| PUT | `/api/projects/:id` | 更新项目（保存任务） |
| DELETE | `/api/projects/:id` | 删除项目 |

### 人员

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/resources` | 人员列表 |
| PUT | `/api/resources` | 全量替换人员列表 |

### IP 白名单

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/whitelist` | 获取白名单 |
| PUT | `/api/whitelist` | 更新白名单（需密码，body: `{password, ips}`） |

### 模板

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/templates` | 模板列表 |
| POST | `/api/templates` | 创建模板 |
| PUT | `/api/templates/:id` | 更新模板 |
| DELETE | `/api/templates/:id` | 删除模板 |

### 导出

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/export/projects` | 导出所有项目列表（CSV） |
| GET | `/api/export/projects/:id` | 导出单个项目任务明细（CSV） |
| GET | `/api/export/personnel?department=&startDate=&endDate=` | 按部门+时间导出人员工作安排（CSV） |

## 前端架构

### 页面路由

`showPage(page, projectId)` 控制视图切换：

| page 参数 | 视图 | 渲染函数 |
|-----------|------|---------|
| `dashboard` | 看板（仅进行中项目） | `renderDashboard()` |
| `projects` | 项目列表（三区折叠） | `renderProjectList()` |
| `project-detail` | 项目详情（全宽任务表） | `loadProjectDetail()` → `renderTaskTable()` |
| `personnel` | 人员视图（仅进行中项目） | `renderPersonnelView()` |
| `gantt` | 甘特图独立全屏页 | `loadFullGantt(projectId)` |
| `settings` | 系统设置 | `showSettingsPage()` → `verifyPassword()` |

### 全局状态

```js
state = {
  projects: [],              // 项目摘要列表
  resources: [],             // 人员列表
  currentProject: null,       // 当前打开的项目 (含完整 tasks)
  dirty: false,               // 是否有未保存的修改
  selectedIdx: -1,            // 选中的任务数组索引
  ganttProjectId: null,       // 甘特图页面当前项目ID
  ganttProjectName: '',       // 甘特图页面当前项目名称
  _selectedTemplateTasks: null // 模板选中时暂存的任务
}
```

### 关键函数

| 函数 | 用途 |
|------|------|
| `renderTaskTable()` | 任务表渲染，含活跃/完成分区 |
| `renderGantt()` | 项目甘特图 SVG 渲染（已移除详情页调用，保留备用） |
| `loadFullGantt(id)` | 甘特图独立页全屏渲染 |
| `renderDashboard()` | 看板渲染（过滤 active 项目） |
| `renderPersonnelView()` | 人员视图渲染（支持日期范围筛选） |
| `showPersonGantt(id)` | 人员甘特图弹窗（周视图） |
| `changeProjectStatus(id, status)` | 切换项目状态 |
| `renderProjectList()` | 项目列表三区分组渲染 |
| `viewProjectGantt()` | 跳转到独立甘特图页面 |
| `editTaskModal()` | 任务编辑弹窗 |
| `closeTaskEditModal()` | 关闭任务编辑弹窗 |
| `toggleTaskMember(idx, id, checked)` | 切换任务成员 |
| `showMemberPicker(idx)` | 成员多选浮动面板 |
| `renderMemberNames(ids, resources)` | 成员名称渲染 |
| `exportCurrentProject()` | 导出当前项目任务到 CSV |
| `exportPersonnel()` | 导出人员工作安排到 CSV |
| `saveAsTemplate()` | 保存当前项目为模板 |
| `applyTemplate()` | 新建项目时应用模板 |
| `editTemplate(id)` | 编辑模板任务结构 |
| `verifyPassword()` | 设置页密码验证 |
| `calcTimeProgress(t)` | 时间进度%计算 |
| `cycleProgress(idx)` | 进度 20% 步进 |

## 关键算法

### IP 白名单中间件

```js
// 检查顺序: 本地? → 白名单匹配? → 403
// 支持 CIDR: 192.168.1.0/24
// X-Forwarded-For 头优先 (支持反向代理)
```

### 时间进度

```js
timePct = Math.round(elapsedDays / totalDays * 100)
```

### 延期判断

```js
if (today > endDate && progress < 100) → delay
else if (timeProgress - progress > 20) → warning
```

### CSV 导出

```js
// UTF-8 BOM 前缀 (﻿) 确保 Excel 正确识别中文
// CSV 特殊字符转义: 含逗号/引号/换行的字段用引号包裹
function escapeCSV(val) {
  const s = String(val == null ? '' : val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
```

## 开发命令

```bash
npm install          # 安装依赖 (仅 express)
npm start            # 启动开发服务器 → http://localhost:3000
node server.js       # 等效
```

## 修改前端后

无需编译打包。修改 `public/index.html` 后刷新浏览器即可生效。

## 数据备份

直接复制 `data/` 目录即可。JSON 格式可直接用任意文本编辑器查看和编辑。

## 安全

- 管理密码硬编码为 `14`，在 `server.js` 中修改 `ADMIN_PASSWORD` 常量
- IP 白名单中间件在所有路由之前执行
- 本地回环地址（127.0.0.1 / ::1）始终放行
