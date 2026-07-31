# IP白名单 + 项目状态分类 + 项目模板 — 设计文档

> 日期: 2026-07-31
> 状态: 已实现
> 说明: 三个独立功能模块合并为一份设计文档，因为它们共享同一代码库（server.js + index.html），且在同一轮开发中实现。

## 功能概述

### 1. IP 访问白名单

内网部署场景下，限制只有白名单内的 IP 才能访问系统。

**关键设计决策：**
- Express 中间件在所有路由（含静态文件）之前执行拦截
- 本地回环地址（127.0.0.1 / ::1）始终放行，不受白名单限制
- 支持单个 IP（192.168.1.100）和 CIDR 网段（192.168.1.0/24）
- 非白名单 IP 返回中文友好 403 页面，显示当前 IP
- 管理密码硬编码为 `14`，在 `server.js` 的 `ADMIN_PASSWORD` 常量中定义
- 管理界面放在「系统设置」页面（密码门控）
- 白名单文件缺失或为空时，所有非本地 IP 均被拒绝（fail-closed）
- 从 `X-Forwarded-For` 头优先取真实 IP（支持反向代理），去 `::ffff:` 前缀

**数据存储:** `data/ip-whitelist.json`
```json
{ "ips": ["192.168.1.0/24", "10.0.0.100"] }
```

### 2. 项目状态分类

项目按三个状态管理：进行中（active）/ 暂时搁置（on-hold）/ 已完成（completed）。

**关键设计决策：**
- 项目数据模型新增 `status` 字段，默认值 `"active"`，确保向后兼容（已有项目自动视为进行中）
- 项目列表页按三区垂直折叠分组，active 默认展开，on-hold/completed 默认折叠
- **过滤方式**：看板和人员视图在客户端对 `status === 'active'` 过滤，API 返回全量项目列表不区分状态

**状态转换规则：**

| 从 → 到 | 行为 |
|----------|------|
| active → on-hold | 任务保留不动，从看板/人员视图隐藏 |
| on-hold → active | 重新在看板和人员视图中可见 |
| active/on-hold → completed | 项目归档到已完成区，从看板/人员视图隐藏 |
| completed → active | 项目恢复，重新可见 |

- 状态切换入口：项目列表行内下拉框 + 新建/编辑项目弹窗

### 3. 项目模板

新建项目时可选模板，自动生成预设的阶段任务结构。

**关键设计决策：**
- 模板仅保存任务名称、层级（level）、预估工期（duration）
- 不保存人员、日期、进度等运行时数据
- 应用模板时深拷贝任务、生成新任务 ID，人员/日期留空
- 保存模板入口：项目详情页工具栏「保存为模板」
- 模板管理：系统设置页（密码门控），支持增删改及编辑任务结构
- 编辑模板时弹窗内通过可增删的表格行管理任务

**数据存储:** `data/templates.json`
```json
[
  {
    "id": "tpl-xxx",
    "name": "硬件产品开发流程",
    "tasks": [
      { "name": "需求分析", "level": 0, "duration": 14 },
      { "name": "方案设计", "level": 0, "duration": 21 },
      { "name": "原理图设计", "level": 1, "duration": 14 },
      { "name": "PCB Layout", "level": 1, "duration": 14 },
      { "name": "打样验证", "level": 0, "duration": 30 }
    ]
  }
]
```

> level 0 为顶层任务，level 1 为子任务。应用模板时通过层级关系重建 parentId。

## API 设计

### 新增接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/whitelist` | 获取IP白名单 |
| PUT | `/api/whitelist` | 更新白名单（body: `{password, ips}`，密码错误返回 401） |
| GET | `/api/templates` | 模板列表 |
| POST | `/api/templates` | 创建模板 |
| PUT | `/api/templates/:id` | 更新模板 |
| DELETE | `/api/templates/:id` | 删除模板 |

### 现有接口变更

| 接口 | 变更 |
|------|------|
| GET `/api/projects` | 返回摘要增加 `status` 字段 |
| GET `/api/projects/:id` | 返回完整数据增加 `status` 字段 |
| POST `/api/projects` | 接受 `status` 和 `tasks`（模板预填充的任务数组） |

### 过滤策略

项目状态过滤在**客户端**执行，API 层不设 status 查询参数：
- 看板/人员视图：`projects.filter(p => (p.status || 'active') === 'active')`
- 项目列表：按 status 分三组后分别渲染

## 前端架构

### 页面路由

| page | 视图 | 触发 |
|------|------|------|
| `dashboard` | 看板（仅 active） | `renderDashboard()` |
| `projects` | 项目列表（三区折叠） | `renderProjectList()` |
| `project-detail` | 项目详情 | `loadProjectDetail()` |
| `personnel` | 人员视图（仅 active） | `renderPersonnelView()` |
| `settings` | 系统设置 | `showSettingsPage()` → 密码门 → `verifyPassword()` |

### 新增全局状态

```js
state._selectedTemplateTasks  // 模板选中时暂存的任务数组，项目保存后清空
```

### 关键交互流程

**新建项目（含模板）：**
1. 打开新建弹窗 → `loadTemplateOptions()` 加载模板下拉列表
2. 用户选模板 → `applyTemplate()` 暂存任务到 `state._selectedTemplateTasks`
3. 填写名称、日期 → 点击保存
4. 保存处理：模板任务深拷贝、每个任务生成新 ID、重置 resourceId/progress/predecessors/completed → POST `/api/projects`

**保存为模板：**
1. 项目详情页点击「保存为模板」→ 弹出命名输入框
2. 从 `currentProject.tasks` 提取每条任务的 name/level/duration
3. POST `/api/templates`

**状态切换：**
1. 项目列表行内下拉选择新状态
2. `changeProjectStatus(id, newStatus)` → GET 项目完整数据 → 修改 status → PUT 保存 → `loadProjects()` 刷新

**模板编辑：**
1. 设置页 → 点击模板的「编辑任务」
2. 弹窗显示任务表格（名称/层级/工期），可增删行
3. 保存时从表格读取数据 → PUT `/api/templates/:id`
