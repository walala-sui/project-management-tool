# 任务日历选择 + 人员信息完善 + 甘特图独立页 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 三项UI改进：(1)任务日期改为日历控件 (2)负责人显示全称+新增成员多选列+任务编辑弹窗 (3)甘特图从详情页拆出为独立全屏页面

**Architecture:** 所有改动集中于 `app/public/index.html`（前端单页应用），数据模型需新增 `memberIds` 字段。后端 `server.js` 无需改动（JSON存储天然兼容新字段）。

**Tech Stack:** 原生 HTML/CSS/JS + SVG甘特图（无框架）

---

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `app/public/index.html` | 修改（核心变更） |
| `app/server.js` | 无需修改 |

---

### Task 1: 导航和页面路由 — 新增甘特图独立页面

**Files:**
- Modify: `app/public/index.html` — 导航栏 + showPage() + 新增 `#page-gantt` 页面容器

- [ ] **Step 1: 在导航栏新增甘特图入口（隐藏，仅程序跳转用）**

在 `<nav>` 中新增导航链接（display:none，因为按方案2从项目详情页跳转）：
```html
<a data-page="gantt" style="display:none" onclick="showPage('gantt')">甘特图</a>
```

- [ ] **Step 2: 新增 `#page-gantt` 页面容器**

在 `#page-personnel` 之后、`#page-settings` 之前新增甘特图独立页面：
```html
<div id="page-gantt" class="page">
  <div class="breadcrumb"><a onclick="showPage('project-detail', state.ganttProjectId)">← 返回项目详情</a></div>
  <div class="toolbar">
    <span id="gantt-project-title" style="font-size:16px;font-weight:600"></span>
  </div>
  <div class="gantt-wrap" id="gantt-full-container" style="min-height:500px"></div>
</div>
```

- [ ] **Step 3: 在 `showPage()` 函数中新增 'gantt' 分支**

在 `showPage()` 函数末尾（`showSettingsPage()` 之前）新增：
```js
} else if (page === 'gantt') {
  document.getElementById('page-gantt').classList.add('active');
  // 从 projectId 或 state.ganttProjectId 获取项目ID
  const pid = projectId || state.ganttProjectId;
  if (pid) {
    state.ganttProjectId = pid;
    document.getElementById('gantt-project-title').textContent = state.ganttProjectName || '';
    renderFullGantt(pid);
  }
}
```

- [ ] **Step 4: 新增 `renderFullGantt(projectId)` 函数**

全屏甘特图渲染函数，基于现有 `renderGantt()` 改造，区别是：
- 操作独立的 `#gantt-full-container` 容器
- 先加载项目数据再渲染
- SVG 宽度自适应全屏（leftPad 保持200，dayWidth 从3px增到4px）

- [ ] **Step 5: 验证导航切换**

启动服务器，确认从项目详情跳转甘特图页再返回的流程正常。

---

### Task 2: 项目详情页布局改造 — 移除甘特图分栏

**Files:**
- Modify: `app/public/index.html:160-201` — `#page-project-detail` 布局

- [ ] **Step 1: 移除详情页右侧甘特图面板**

删除 `#gantt-panel` 整个 div（含 panel-header 和 gantt-container），删除 `.detail-layout` 包裹层。

改为：
```html
<div id="page-project-detail" class="page">
  <div class="breadcrumb"><a onclick="showPage('projects')">← 返回项目列表</a></div>
  <div class="toolbar" id="detail-toolbar">
    <!-- 现有按钮保留 -->
    <button class="btn btn-outline" onclick="viewProjectGantt()" title="全屏查看甘特图">查看甘特图</button>
    <button class="btn btn-outline" onclick="editTaskModal()" title="弹窗编辑选中任务">编辑任务</button>
  </div>
  <div id="task-panel-full">
    <div class="panel-header">任务列表</div>
    <table id="task-table">
      <!-- 表头更新（含成员列） -->
    </table>
  </div>
</div>
```

- [ ] **Step 2: 更新相关CSS样式**

新增样式：
```css
#task-panel-full { background: #fff; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); overflow: auto; }
```

移除/简化 `.detail-layout`、`.task-panel`、`.gantt-panel` 相关样式（保留作为后备）。

- [ ] **Step 3: 新增 `viewProjectGantt()` 函数**

```js
function viewProjectGantt() {
  if (!state.currentProject) return;
  state.ganttProjectId = state.currentProject.id;
  state.ganttProjectName = state.currentProject.name;
  showPage('gantt', state.currentProject.id);
}
```

---

### Task 3: 任务日期列改为日历控件

**Files:**
- Modify: `app/public/index.html` — `taskRowHTML()` 函数（~line 643-644）

- [ ] **Step 1: 修改 taskRowHTML 中的日期列**

将现有的 `contenteditable="true"` 日期单元格：
```html
<td contenteditable="true" data-field="startDate" data-idx="${i}" ...>${t.startDate||''}</td>
```

替换为 `<input type="date">`：
```html
<td onclick="event.stopPropagation()" style="${rowStyle}">
  <input type="date" value="${t.startDate||''}" 
    onchange="cellChange(${i},'startDate',this.value)" 
    style="width:100%;border:none;background:transparent;font-size:13px;padding:0">
</td>
```

开始和结束日期两列都改。

- [ ] **Step 2: 更新 cellChange 函数触发甘特图刷新**

`cellChange()` 已经是通用的（line 773-777），date变更后会调 `renderGantt()`，但现在甘特图已移走，改为不自动刷新甘特图（或改为无操作，因为甘特图在独立页）。保持逻辑不变即可——如果甘特图容器不存在，renderGantt 自然什么都不做。

- [ ] **Step 3: 更新 taskRowHTML 中日期单元格的响应式样式**

确保 input[type="date"] 在表格行有选中/完成样式时保持一致的外观。

---

### Task 4: 负责人列显示全称 + 新增成员列

**Files:**
- Modify: `app/public/index.html` — 表头 + `taskRowHTML()` + `addTask()`

- [ ] **Step 1: 更新表头**

在 `<thead>` 中负责人列后新增成员列：
```html
<th style="width:85px">负责人</th>
<th style="width:120px">成员</th>
```

- [ ] **Step 2: 修改负责人下拉显示格式**

在 `taskRowHTML()` 中，下拉选项改为：
```js
${resources.map(r => `<option value="${r.id}" ${t.resourceId===r.id?'selected':''}>${r.name} (${r.department})</option>`).join('')}
```

- [ ] **Step 3: 新增成员列渲染**

在负责人 td 后面新增成员列：
```html
<td onclick="event.stopPropagation()" style="font-size:12px;${rowStyle}">
  <span id="members-display-${i}" style="cursor:pointer" 
    onclick="showMemberPicker(${i})" 
    title="点击选择成员">
    ${renderMemberNames(t.memberIds, resources)}
  </span>
</td>
```

- [ ] **Step 4: 新增辅助函数**

```js
function renderMemberNames(memberIds, resources) {
  if (!memberIds || memberIds.length === 0) return '<span style="color:#ccc">点击添加</span>';
  return memberIds.map(mid => {
    const r = resources.find(r => r.id === mid);
    return r ? r.name : mid;
  }).join('、');
}

function showMemberPicker(idx) {
  // 弹窗多选面板
  const t = state.currentProject.tasks[idx];
  const resources = state.resources || [];
  const selected = t.memberIds || [];
  // ...渲染多选checkbox弹窗
}
```

- [ ] **Step 5: addTask() 新增 memberIds 字段**

在 `addTask()` 函数（line 794）的任务初始化对象中新增：
```js
memberIds: [],
```

---

### Task 5: 任务编辑弹窗

**Files:**
- Modify: `app/public/index.html` — 新增弹窗HTML + JS函数

- [ ] **Step 1: 新增任务编辑弹窗 HTML**

在 `#person-gantt-modal` 后面新增：
```html
<div class="modal-overlay" id="task-edit-modal">
  <div class="modal">
    <h3>编辑任务</h3>
    <div id="task-edit-content"></div>
    <div class="form-actions">
      <button class="btn btn-outline" onclick="closeTaskEditModal()">取消</button>
      <button class="btn btn-primary" id="btn-save-task-edit">保存</button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: 新增 `editTaskModal()` 函数**

```js
function editTaskModal() {
  if (state.selectedIdx < 0) return alert('请先选中一个任务');
  const idx = state.selectedIdx;
  const t = state.currentProject.tasks[idx];
  const resources = state.resources || [];
  const tasks = state.currentProject.tasks || [];
  
  // 渲染表单：任务名称、负责人下拉、成员多选checkbox、开始/结束日期(日历)、
  //   进度下拉(0/20/40/60/80/100)、前置任务下拉、层级(0/1/2)
  document.getElementById('task-edit-content').innerHTML = `
    <div class="form-row"><label>任务名称</label><input id="te-name" value="${esc(t.name||'')}"></div>
    <div class="form-row"><label>负责人</label>
      <select id="te-resource">
        <option value="">未分配</option>
        ${resources.map(r => `<option value="${r.id}" ${t.resourceId===r.id?'selected':''}>${r.name} (${r.department})</option>`).join('')}
      </select>
    </div>
    <div class="form-row"><label>成员</label>
      <div style="max-height:150px;overflow-y:auto;border:1px solid #d0d0d0;border-radius:4px;padding:8px;flex:1">
        ${resources.map(r => `
          <label style="display:block;font-size:13px;margin:2px 0">
            <input type="checkbox" value="${r.id}" ${(t.memberIds||[]).includes(r.id)?'checked':''} 
              onchange="toggleTaskMember(${idx},'${r.id}',this.checked)"> ${r.name} (${r.department})
          </label>
        `).join('')}
      </div>
    </div>
    <div class="form-row"><label>开始日期</label><input type="date" id="te-start" value="${t.startDate||''}"></div>
    <div class="form-row"><label>结束日期</label><input type="date" id="te-end" value="${t.endDate||''}"></div>
    <div class="form-row"><label>进度</label>
      <select id="te-progress">
        ${[0,20,40,60,80,100].map(v => `<option value="${v}" ${(t.progress||0)===v?'selected':''}>${v}%</option>`).join('')}
      </select>
    </div>
    <div class="form-row"><label>前置任务</label>
      <select id="te-pred">
        <option value="">-</option>
        ${tasks.map((tk, ki) => ki === idx ? '' : `<option value="${tk.id}" ${(t.predecessors||[])[0]===tk.id?'selected':''}>${tk.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-row"><label>层级</label>
      <select id="te-level">
        <option value="0" ${(t.level||0)===0?'selected':''}>0 - 顶层</option>
        <option value="1" ${(t.level||0)===1?'selected':''}>1 - 子任务</option>
        <option value="2" ${(t.level||0)===2?'selected':''}>2 - 孙任务</option>
      </select>
    </div>
  `;
  
  document.getElementById('task-edit-modal').classList.add('show');
  
  document.getElementById('btn-save-task-edit').onclick = () => {
    t.name = document.getElementById('te-name').value;
    t.resourceId = document.getElementById('te-resource').value;
    t.startDate = document.getElementById('te-start').value;
    t.endDate = document.getElementById('te-end').value;
    t.progress = parseInt(document.getElementById('te-progress').value);
    t.level = parseInt(document.getElementById('te-level').value);
    const predVal = document.getElementById('te-pred').value;
    t.predecessors = predVal ? [predVal] : [];
    markDirty();
    closeTaskEditModal();
    renderTaskTable();
  };
}
```

- [ ] **Step 3: 新增关闭弹窗和成员切换函数**

```js
function closeTaskEditModal() {
  document.getElementById('task-edit-modal').classList.remove('show');
}

function toggleTaskMember(idx, memberId, checked) {
  const t = state.currentProject.tasks[idx];
  if (!t.memberIds) t.memberIds = [];
  if (checked) {
    if (!t.memberIds.includes(memberId)) t.memberIds.push(memberId);
  } else {
    t.memberIds = t.memberIds.filter(id => id !== memberId);
  }
  markDirty();
}
```

---

### Task 6: 成员列点击多选面板

**Files:**
- Modify: `app/public/index.html` — `showMemberPicker()` 函数（Task 4中已声明）

- [ ] **Step 1: 实现成员多选弹窗**

复用任务编辑弹窗的成员checkbox模式，但以更轻量的方式（浮动面板而非全屏modal）：

在成员列点击时弹出一个小型浮动面板（定位在点击位置附近），显示所有人员checkbox，点击外部关闭。

```js
function showMemberPicker(idx) {
  const t = state.currentProject.tasks[idx];
  const resources = state.resources || [];
  const displayEl = document.getElementById('members-display-' + idx);
  if (!displayEl) return;
  
  // 移除旧面板
  document.querySelectorAll('.member-picker-panel').forEach(p => p.remove());
  
  const panel = document.createElement('div');
  panel.className = 'member-picker-panel';
  panel.style.cssText = 'position:absolute;background:#fff;border:1px solid #d0d0d0;border-radius:6px;padding:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:999;max-height:200px;overflow-y:auto;min-width:180px';
  panel.innerHTML = resources.map(r => `
    <label style="display:block;font-size:13px;padding:3px 0;cursor:pointer">
      <input type="checkbox" value="${r.id}" ${(t.memberIds||[]).includes(r.id)?'checked':''} 
        onchange="toggleTaskMember(${idx},'${r.id}',this.checked);updateMemberDisplay(${idx})"> ${r.name} (${r.department})
    </label>
  `).join('');
  
  const rect = displayEl.getBoundingClientRect();
  panel.style.left = rect.left + 'px';
  panel.style.top = (rect.bottom + 4) + 'px';
  
  document.body.appendChild(panel);
  
  // 点击外部关闭
  setTimeout(() => {
    document.addEventListener('click', function closePanel(e) {
      if (!panel.contains(e.target) && e.target !== displayEl) {
        panel.remove();
        document.removeEventListener('click', closePanel);
      }
    });
  }, 0);
}

function updateMemberDisplay(idx) {
  const t = state.currentProject.tasks[idx];
  const resources = state.resources || [];
  const displayEl = document.getElementById('members-display-' + idx);
  if (displayEl) {
    displayEl.innerHTML = renderMemberNames(t.memberIds, resources);
  }
}
```

- [ ] **Step 2: 确保 markDirty 在成员更新时被调用**

在 `toggleTaskMember()` 中调用 `markDirty()`（已在Task 5中实现）。

---

### Task 7: 整合测试与验证

- [ ] **Step 1: 启动服务器测试**

```bash
cd /mnt/c/Users/AIxiaosui/Desktop/项目管理工具/app && node server.js
```

- [ ] **Step 2: 验证改动1 — 日期日历选择**

在项目详情页，点击开始/结束日期单元格，确认弹出日历控件，选择日期后数据正确保存。

- [ ] **Step 3: 验证改动2 — 负责人全称 + 成员列 + 编辑弹窗**

- 负责人下拉显示 "张工 (硬件部)" 格式
- 成员列点击弹出多选面板，选中/取消成员正常
- 选中任务 → 点击编辑任务 → 弹窗编辑各项 → 保存 → 表格刷新正确

- [ ] **Step 4: 验证改动3 — 甘特图独立页面**

- 项目详情页任务表全宽显示，无右侧甘特图
- 点击「查看甘特图」→ 跳转全屏甘特图页 → 任务条正确渲染
- 点击返回 → 回到项目详情页

- [ ] **Step 5: 验收所有功能交互**

完整走通：新建项目 → 添加任务 → 设置日期 → 分配负责人/成员 → 编辑任务弹窗 → 查看甘特图 → 返回 → 保存。

---
