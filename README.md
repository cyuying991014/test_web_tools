# 测试工具箱（Web）

测试常用小工具聚合页：文件/文本 MD5、JSON 格式化、URL 解析、正则调试、Cron 计算、时间戳与时间互转（含北京时间）、二进制/十进制/十六进制整数互转、文本与 JSON 比较、RGB ↔ Hex 颜色转换，以及独立的测试数据生成工作台。纯浏览器端计算，无后端；支持 PWA 离线缓存。

测试数据生成支持单字段快速取样、多字段组合、有效/边界/无效/混合模式、固定随机种子、本地模板、最多 10,000 条批量生成，以及 JSON、CSV、MySQL、PostgreSQL、SQLite 导出。模板只保存配置，生成结果不会写入本地存储。

详细需求见：`docs/requirements-测试工具聚合页.md`  
界面设计稿参考：`docs/ui-design-测试工具聚合页.html`

## 环境要求

- Node.js 18+（建议 LTS）
- 推荐使用 **Google Chrome** 访问与验证

## 安装依赖

```bash
npm install
```

## 本地开发

```bash
npm run dev
```

浏览器打开终端提示的本地地址即可。

## 生产构建

```bash
npm run build
```

静态资源输出到 `dist/`，可部署到任意静态托管（nginx、对象存储静态网站等）。项目已配置 `base: './'`，适合子目录部署。

## 预览构建产物

```bash
npm run preview
```

## 自动化自检（JSON 查找高亮）

```bash
npm run test:json-find
```

使用 jsdom 渲染示例 JSON，断言键名与字符串值中的查找高亮命中数量。

## 离线使用（PWA）

首次在**联网**环境下打开站点并完成加载后，Service Worker 会缓存静态资源；之后可在无网络环境下继续使用（不涉及外网接口调用）。

## 技术栈

- [Vite](https://vitejs.dev/) 6
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- [spark-md5](https://github.com/satazor/js-spark-md5)（MD5）
- [diff](https://github.com/kpdecker/jsdiff)（纯文本行级对比）

## 目录说明

| 路径 | 说明 |
|------|------|
| `index.html` | 入口 HTML |
| `src/main.js` | 主逻辑与页面绑定 |
| `src/jsonDiff.js` | JSON 严格/非严格结构化对比 |
| `src/jsonTree.js` | JSON 树渲染、折叠、查找高亮、键名与字符串值替换 |
| `src/style.css` | 样式 |
| `docs/` | 需求文档与设计稿 HTML |

补充：「北京时间 → 时间戳」为文本 `YYYY-MM-DD HH:mm:ss`，按东八区解析；颜色为 RGB / Hex 二选一输入；进制转换基于 `BigInt`（有位数上限）。

## 许可证

私有项目用途；第三方库遵循各自开源协议。
