# 项目管理工具 — 开发文档

## 技术架构

```
浏览器 ──→ http://localhost:3000 ──→ Express (server.js)
                                        │
                                   JSON 文件存储 (data/)
                                        │
                                   public/index.html
                                   (单页应用, 约2800行 JS)
```

- **前端**: 原生 HTML/CSS/JavaScript，零框架依赖
- **后端**: Node.js + Express，RESTful API
- **模块化**: `server.js` (~280行) 引用 `utils.js` 共享工具模块
- **存储**: JSON 文件，每个项目一个文件，人员库/白名单/模板/设置各一个文件
- **甘特图**: 手绘 SVG（项目甘特图 + 人员跨项目甘特图），共享渲染函数
- **导出**: CSV（UTF-8 BOM），Excel 可直接打开
- **桌面启动**: VBS 脚本静默启动服务器并自动打开浏览器

## 目录结构

```
管理工具/
├── server.js           # 后端入口 (~280行)
├── utils.js            # 共享工具模块 (readJSON/writeJSON/normalize*/escapeCSV等)
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
    ├── settings.json    # 看板设置
    └── projects/
        └── *.json       # 项目文件
```

## 数据模型

### 项目文件

```json
{
  "schemaVersion": 2,
  "id": "project-001",
  "name": "项目名称",
  "description": "描述",
  "startDate": "2026-08-01",
  "endDate": "2026-12-31",
  "status": "active",
  "priorityQuadrant": "q1",
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
      "completed": false,
      "onHold": false,
      "actualCompletionDate": "",
      "priorityQuadrant": "q1",
      "isBottleneck": false,
      "isMilestone": true
    }
  ]
}
```

字段说明:
- `priorityQuadrant`: `q1`(重要且紧急) / `q2`(重要不紧急) / `q3`(紧急不重要) / `q4`(不重要不紧急) / `unset`(未设置)
- `status`: `"active"`(进行中) | `"on-hold"`(暂时搁置) | `"completed"`(已完成)
- `onHold`: 手动搁置标记
- `actualCompletionDate`: 标记完成时自动记录日期
- `isBottleneck` / `isMilestone`: 任务人工标记
- `memberIds`: 任务参与成员 ID 数组

### 人员库

```json
[
  {"id": "r1", "name": "姓名", "department": "部门", "isLoadPerson": false, "isKeyPerson": false}
]
```

人工负荷/关键人员标记保存在人员记录中；卡点人员由活动项目中未完成的卡点任务实时推导，自动负荷和自动关键人员阈值由看板设置控制。

### 看板设置

`app/data/settings.json` 保存每个任务象限的呈现数量和人员自动判定阈值。通过 `GET /api/settings/dashboard` 读取，通过带管理密码的 `PUT /api/settings/dashboard` 保存。

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
| GET | `/api/projects` | 项目摘要列表（含计算字段） |
| GET | `/api/projects/batch?ids=` | 批量获取项目详情（解决N+1） |
| GET | `/api/projects/:id` | 单个项目完整数据 |
| POST | `/api/projects` | 新建项目 |
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
| PUT | `/api/whitelist` | 更新白名单（需密码） |

### 模板

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/templates` | 模板列表 |
| POST | `/api/templates` | 创建模板 |
| PUT | `/api/templates/:id` | 更新模板 |
| DELETE | `/api/templates/:id` | 删除模板 |

### 看板设置

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/settings/dashboard` | 获取看板设置 |
| PUT | `/api/settings/dashboard` | 保存看板设置（需密码） |

### 导出

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/export/projects` | 导出所有项目列表（CSV） |
| GET | `/api/export/projects/:id` | 导出单个项目任务明细（CSV） |
| GET | `/api/export/personnel?department=&startDate=&endDate=` | 按部门+时间导出人员工作安排（CSV，含角色列） |

## 前端架构

### 页面路由

`showPage(page, projectId)` 控制视图切换：

| page 参数 | 视图 | 渲染函数 |
|-----------|------|---------|
| `dashboard` | 看板（仅进行中项目） | `renderDashboard()` |
| `projects` | 项目列表（三区折叠） | `renderProjectList()` |
| `project-detail` | 项目详情（全宽任务表） | `loadProjectDetail()` → `renderTaskTable()` |
| `personnel` | 人员视图（含成员任务） | `renderPersonnelView()` |
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
  dashboardSettings: {...}    // 看板设置
}
```

### 关键函数

| 函数 | 用途 |
|------|------|
| `renderTaskTable()` | 任务表渲染，含活跃/完成分区，状态列支持点击循环切换 |
| `renderDashboard()` | 看板渲染（使用批量 API 避免 N+1） |
| `renderPersonnelView()` | 人员视图渲染（含负责人+成员任务，批量 API） |
| `getTaskStatus(t)` | 任务状态推导：完成/搁置(onHold)/待开始(progress=0)/进行中 |
| `cycleTaskStatus(idx)` | 点击状态列循环：待开始→进行中(1%)→搁置(onHold) |
| `cycleProgress(idx)` | 进度点击循环：0→1%→20%→40%→60%→80%→100%→0 |
| `showResourcePicker(idx)` | 负责人弹出选择面板（支持搜索筛选） |
| `showMemberPicker(idx)` | 成员多选弹出面板（支持搜索筛选） |
| `editTaskModal()` | 任务编辑弹窗（含实际完成时间字段） |
| `completeTask(idx)` | 标记完成/恢复，自动记录 actualCompletionDate |
| `ganttDateRange(tasks)` | 共享甘特图日期范围计算 |
| `ganttMonthHeaders(...)` | 共享甘特图月份刻度渲染 |
| `ganttTodayLine(...)` | 共享甘特图今天线渲染 |
| `loadFullGantt(id)` | 甘特图独立页全屏渲染 |
| `showPersonGantt(id)` | 人员甘特图弹窗（周视图，含成员任务） |
| `buildPersonnelMetrics(...)` | 人员指标计算（含负责人+成员任务） |

## 关键算法

### 文件写入锁

`utils.js` 使用 Promise 队列锁确保同一文件的并发写入安全：
- 写入前等待前一个写入完成
- 先写 `.tmp` 临时文件，再写 `.bak` 备份，最后原子 rename
- 队列自动清理过期引用

### 任务状态推导

```js
function getTaskStatus(t) {
  if (t.completed) return '完成';
  if (t.onHold) return '搁置';
  if (t.progress === 0) return '待开始';
  return '进行中';
}
```

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
```

## 性能优化

- **批量 API**: `GET /api/projects/batch?ids=` 一次获取多个项目详情，消除 N+1 查询
- **共享工具模块**: `utils.js` 消除前后端重复代码
- **甘特图 DRY**: 提取 `ganttDateRange`/`ganttMonthHeaders`/`ganttTodayLine` 共享函数

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

- 管理密码在 `server.js` 中修改 `ADMIN_PASSWORD` 常量
- IP 白名单中间件在所有路由之前执行
- 本地回环地址（127.0.0.1 / ::1）始终放行
