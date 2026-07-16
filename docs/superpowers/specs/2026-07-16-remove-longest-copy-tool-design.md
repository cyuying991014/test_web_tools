# 删除最长文案工具

## 背景

“最长文案”Excel 分析工具不再需要。此次删除需要同时清理可见页面、运行逻辑、专用资源和依赖，避免保留无法使用的死代码。

## 目标

- 前端页面不再出现“最长文案”入口和功能区。
- 构建包不再包含最长文案处理逻辑、Manrope 字体和 `xlsx` 依赖。
- 其他测试工具及已确认的 EMQ 入口隐藏修改保持不变。

## 删除范围

### 页面

修改 `index.html`：

1. 从页面 description 中移除“最长文案”。
2. 删除侧栏中的“最长文案”导航项。
3. 删除 `#sec-longest-xlsx` 页面区块。
4. 保留当前工作区中已完成的 EMQ 入口隐藏修改。

### JavaScript

修改 `src/main.js`：

1. 删除从 `src/longestXlsx.js` 导入的符号。
2. 删除文件选择、拖放、大小校验、分析、日志、清空和结果下载逻辑。

删除 `src/longestXlsx.js`，不迁移或保留其中的兼容代码。

### 样式与资源

- 从 `src/style.css` 删除 `.longest-xlsx-log` 专用样式。
- 删除 `public/fonts/Manrope-Regular.ttf`。

### 依赖

- 从 `package.json` 删除 `xlsx`。
- 同步更新 `package-lock.json`，移除 `xlsx` 及仅由其引入的传递依赖。

## 保留范围

- 不修改其他工具的页面、逻辑和样式。
- 不删除通用上传区、拖放区、按钮或提示样式。
- 不修改 EMQ 页面实现、代理配置或本次之前已完成的入口隐藏结果。
- 不修改历史设计稿和需求文档；当前检查未发现其中包含最长文案功能实现引用。

## 验证

1. 全仓搜索 `最长文案`、`longestXlsx`、`longest-xlsx`、`Manrope-Regular.ttf` 和 `xlsx`，确认应用源码、资源清单及依赖文件中无功能残留；历史 Git 记录不在检查范围。
2. 运行 `npm run test:json-find`。
3. 运行 `npm run test:json-replace`。
4. 运行 `npm run test:url-parser`。
5. 运行 `npm run build`，确认生产构建通过，且构建产物不包含已删除字体或相关模块。
6. 请求本地开发页面，确认返回 HTTP 200，页面无“最长文案”入口。

## 风险与恢复

删除后无法在当前版本中直接恢复该工具。若后续重新需要，应从 Git 历史恢复相关文件和页面片段，并重新安装匹配版本的 `xlsx` 依赖。主要回归风险是删除 `index.html` 或 `src/main.js` 区块时误伤相邻工具，因此实施时采用精确块删除，并通过现有专项测试和生产构建验证。
