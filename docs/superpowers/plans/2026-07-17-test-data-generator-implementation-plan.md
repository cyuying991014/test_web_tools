# 测试数据生成器实施计划

## 目标

依据 `docs/superpowers/specs/2026-07-17-test-data-generator-design.md`，在现有 Vite 工具聚合页中实现独立一级 Tab“测试数据生成”，交付快速生成、组合生成、模板管理、固定种子、字段关联、Web Worker 批量生成以及 JSON、CSV、MySQL、PostgreSQL、SQLite 导出。

本计划只覆盖已确认的首版范围，不加入多国家身份数据、文件样本、正则反向生成、云端同步或数据库直连。

## 实施前提与工作区保护

当前工作区已经存在与本功能无关的未提交改动，涉及 `index.html`、`src/main.js`、`src/style.css`、`package.json` 等共享文件。实施时必须：

1. 先记录 `git status --short` 和相关文件差异。
2. 不还原、不覆盖、不重新格式化用户现有改动。
3. 修改共享文件时基于当时内容做小范围补丁。
4. 每次提交前用 `git diff --cached --name-status` 确认只包含当前阶段文件。
5. 如果现有改动与 Tab、入口初始化或样式区域发生直接冲突，停止该阶段并确认，不自行替换用户实现。

实现约定：JSON 的嵌套输出路径只影响 JSON；CSV 和 SQL 始终按模型字段名平铺输出。嵌套对象或数组字段作为单个值时，在 CSV/SQL 中序列化为 JSON 字符串。

## 总体验证策略

项目当前使用独立 Node 验证脚本，不引入新的测试框架。新增验证脚本统一放在 `scripts/`，通过 `package.json` 暴露专项命令。

每个阶段遵循：

1. 先增加能复现目标行为的专项验证。
2. 运行验证并确认失败原因与当前缺失能力一致。
3. 实现最小功能。
4. 重新运行专项验证。
5. 运行受影响的已有验证。
6. 提交当前阶段的独立变更。

最终至少运行：

```powershell
npm run test:data-generator
npm run test:json-find
npm run test:json-replace
npm run test:url-parser
npm run test:activation-code
npm run test:cron
npm run test:regex
npm run build
npm run build:pages
```

如果某个现有命令在实施开始时就失败，先记录基线错误；只有错误明确由本功能引入时才在本任务内修复。

## 阶段一：建立核心配置、随机源和测试入口

### 文件

- 新增 `src/dataGenerator/random.js`
- 新增 `src/dataGenerator/config.js`
- 新增 `src/dataGenerator/constants.js`
- 新增 `scripts/verify-data-generator-core.mjs`
- 修改 `package.json`

### 实现

1. 定义模型、字段、模式、输出格式和模板版本常量。
2. 定义规范化后的模型配置结构，至少包含字段名、字段类型、模式、规则、关联、唯一、空值比例、重复比例和 JSON 输出路径。
3. 实现配置规范化和通用校验：
   - 数量为 1～10,000 的整数。
   - 字段名非空且唯一。
   - 比例范围为 0～100。
   - 混合模式比例合计为 100%。
   - 唯一与重复比例不能同时启用。
   - 范围、长度、步长和权重合法。
4. 实现带版本号的确定性随机源。采用固定的字符串种子哈希与 `sfc32` 伪随机算法；算法仅用于可复现测试数据，不声明密码学安全。
5. 未填写种子时，使用 `crypto.getRandomValues()` 生成并返回本次实际种子，保证结果可以在需要时复现。
6. 所有后续生成器只接收统一随机源，不直接调用 `Math.random()`。
7. 增加聚合命令 `test:data-generator`，后续阶段逐步挂入更多验证脚本。

### 验证

- 相同种子产生相同序列。
- 不同种子产生不同序列。
- 自动种子格式稳定且可再次使用。
- 非法数量、重复字段名、错误比例、冲突唯一规则被拒绝。
- 合法最小模型可被规范化。

运行：

```powershell
npm run test:data-generator
```

## 阶段二：实现基础字段生成器

### 文件

- 新增 `src/dataGenerator/generators/base.js`
- 新增 `src/dataGenerator/generators/number.js`
- 新增 `src/dataGenerator/generators/text.js`
- 新增 `src/dataGenerator/generators/dateTime.js`
- 新增 `src/dataGenerator/generators/account.js`
- 新增 `src/dataGenerator/generators/index.js`
- 新增 `scripts/verify-data-generator-basic.mjs`
- 修改 `package.json`

### 实现

1. 建立统一生成器接口：
   - `validate(config)`
   - `generateValid(context)`
   - `generateBoundary(context, strategy)`
   - `generateInvalid(context, strategy)`
2. 实现数字与基础类型：整数、小数、布尔、`null`、空字符串、空格字符串、枚举、自增序号和固定值。
3. 小数统一通过十进制位缩放处理范围与舍入，避免直接浮点拼接造成明显精度错误。
4. 实现文本：中文、英文、数字、混合、长度范围、前后缀、多行、特殊字符、Emoji、超长文本和候选词列表。
5. 实现日期时间：日期、日期时间、秒/毫秒时间戳、范围、过去/未来偏移、工作日/周末、自定义格式和时区。
6. 实现账号类：用户名、昵称、密码、验证码、Token 风格字符串和 API Key 风格字符串。
7. 密码生成前检查字符类别与长度是否可同时满足；不能满足时返回配置错误，不静默降低规则。

### 验证

- 每个生成器覆盖最小配置、典型配置、边界、非法配置和固定种子。
- 数字范围、小数位、枚举权重、自增步长正确。
- 文本按 Unicode 字符而非 UTF-16 码元计算可见长度，Emoji 不被截断。
- 日期范围、工作日/周末和时间戳单位正确。
- 密码结果满足选定字符类别。
- Token/API Key 只是格式化随机字符串，不包含签名行为。

## 阶段三：实现人员、身份和中国大陆静态数据

### 文件

- 新增 `src/dataGenerator/datasets/cnRegions.json`
- 新增 `src/dataGenerator/datasets/personNames.js`
- 新增 `src/dataGenerator/datasets/phonePrefixes.js`
- 新增 `src/dataGenerator/datasets/README.md`
- 新增 `src/dataGenerator/generators/person.js`
- 新增 `src/dataGenerator/validators/cnId.js`
- 新增 `src/dataGenerator/validators/luhn.js`
- 新增 `scripts/verify-data-generator-person.mjs`
- 修改 `src/dataGenerator/generators/index.js`
- 修改 `package.json`

### 实现

1. 引入带来源、发布日期和版本说明的省、市、区县静态数据；实现前从官方公开来源核对当前版本和使用边界。
2. 姓氏、名字和号段数据仅用于规则合成，不包含真实个人映射。
3. 实现中文姓名、英文姓名、性别、年龄、出生日期、手机号、座机、Email、地址和邮政编码。
4. 实现中国大陆身份证格式：行政区划码、出生日期、顺序码、性别约束和校验位。
5. 身份证生成后必须调用独立校验器验证，不能只检查正则和长度。
6. 支持明确的无效策略：日期非法、长度错误、行政区划不存在、非法字符和校验位错误。
7. 地址按省、市、区县一致关系和随机道路门牌组合，不映射真实住户。
8. 页面数据说明后续读取数据集版本，避免将版本写死在 UI 文案中。

### 验证

- 身份证合法结果通过独立校验器。
- 指定生日、性别、地区后对应片段一致。
- 校验位错误策略稳定地产生不合法结果。
- 手机号、座机、邮编和 Email 满足选定规则。
- 省、市、区县和邮政编码保持关联。
- 不导入任何真实个人记录。

## 阶段四：实现标识符、业务编号、网络和设备生成器

### 文件

- 新增 `src/dataGenerator/generators/identifier.js`
- 新增 `src/dataGenerator/generators/network.js`
- 新增 `src/dataGenerator/validators/imei.js`
- 新增 `scripts/verify-data-generator-technical.mjs`
- 修改 `src/dataGenerator/generators/index.js`
- 修改 `package.json`

### 实现

1. 实现 UUID v4、数字 ID、自增 ID、Trace ID 和 Request ID。
2. 实现由前缀、日期片段、序号和随机片段组成的订单号、流水号和批次号。
3. 实现设备 SN、IMEI 风格号码及 Luhn 校验。
4. 实现银行卡号格式和 Luhn 校验；只生成规则样本，不绑定银行或真实账户。
5. 实现 IPv4、IPv6、内网 IPv4、公网 IPv4、回环地址和边界地址。
6. 实现 MAC、域名、主机名、URL、端口、User-Agent 预设、经纬度和版本号。
7. 公网 IPv4 生成时排除私网、回环、链路本地、组播和保留范围。
8. URL 由协议、主机、端口、路径和查询参数配置组合，不自动访问生成地址。

### 验证

- UUID v4 的版本位和变体位正确。
- 业务编号组成和总长度符合配置。
- IMEI 与银行卡合法结果通过独立 Luhn 校验。
- 校验位错误策略无法通过校验。
- 公网与内网 IPv4 分类正确。
- IPv6、MAC、域名、主机名、端口、经纬度和版本号边界正确。

## 阶段五：实现模式分布、唯一性和字段关联

### 文件

- 新增 `src/dataGenerator/rules/modes.js`
- 新增 `src/dataGenerator/rules/distribution.js`
- 新增 `src/dataGenerator/relations/graph.js`
- 新增 `src/dataGenerator/relations/resolvers.js`
- 新增 `src/dataGenerator/generateRows.js`
- 新增 `scripts/verify-data-generator-rules.mjs`
- 新增 `scripts/verify-data-generator-relations.mjs`
- 修改 `package.json`

### 实现

1. 将有效、边界、无效、混合模式统一放在规则层调度，具体生成器只实现可用策略。
2. 混合模式先依据固定种子确定每一行的模式，再执行字段生成，保证重复执行稳定。
3. 实现空值、唯一、重复和候选权重规则。
4. 唯一值生成设置最大尝试次数；候选空间不足时返回可定位错误，不能无限循环。
5. 建立字段依赖图，进行拓扑排序并输出明确的循环路径。
6. 实现已确认关联：
   - 身份证派生出生日期、年龄、性别、地区。
   - 出生日期派生年龄。
   - 省、市、区县和邮编。
   - 开始时间与结束时间及间隔。
   - 姓名派生用户名、昵称和 Email 前缀。
   - 单价乘数量生成总金额。
   - 日期、前缀、序号和随机片段组合业务编号。
   - 字段值作为另一字段的前缀或后缀。
7. 关联派生字段不再独立随机，避免随机调用次数变化破坏固定种子复现。
8. 为异常结果生成内部测试元信息 `{ mode, reason }`。

### 验证

- 四种模式和混合比例边界正确。
- 相同种子下模式分配和行结果完全相同。
- 唯一、重复、空值规则分别有效，冲突时拒绝。
- 候选空间不足时快速失败。
- 所有关联结果与源字段一致。
- 删除、改名、改类型和循环依赖均有明确错误。

## 阶段六：实现 JSON、CSV 和 SQL 导出器

### 文件

- 新增 `src/dataGenerator/exporters/json.js`
- 新增 `src/dataGenerator/exporters/csv.js`
- 新增 `src/dataGenerator/exporters/sql.js`
- 新增 `src/dataGenerator/exporters/index.js`
- 新增 `scripts/verify-data-generator-exporters.mjs`
- 修改 `package.json`

### 实现

1. JSON 支持对象数组、单对象、美化、压缩和基于输出路径的嵌套对象。
2. JSON 输出路径必须校验，禁止 `__proto__`、`prototype`、`constructor` 等原型污染路径段。
3. CSV 保持字段顺序，正确转义逗号、双引号和换行，默认加 UTF-8 BOM。
4. CSV 对字符串类型且以 `=`、`+`、`-`、`@` 开头的值进行公式注入防护；真实数字类型的负数不添加文本前缀。
5. CSV 中的对象和数组转换为 JSON 字符串。
6. SQL 分别实现 MySQL、PostgreSQL、SQLite 的标识符引用和字面量转义。
7. SQL 正确区分字符串、数字、布尔、日期和 `NULL`，并支持批量拆分和可选事务。
8. SQL 表名和字段名作为标识符处理，禁止将用户输入直接拼入未引用位置。
9. 导出器只接收行数据和已校验配置，不访问 DOM、不下载文件。

### 验证

- JSON 嵌套路径、冲突路径和原型污染路径。
- CSV 中文、BOM、逗号、引号、换行、空值、负数和公式注入。
- 三种 SQL 方言的标识符、引号、反斜杠、布尔、日期和 `NULL`。
- 批次拆分不丢行、不重复行。
- 10,000 条导出条数和字段顺序一致。

## 阶段七：实现模板存储和迁移

### 文件

- 新增 `src/dataGenerator/templateStore.js`
- 新增 `src/dataGenerator/builtInTemplates.js`
- 新增 `scripts/verify-data-generator-templates.mjs`
- 修改 `package.json`

### 实现

1. 定义独立 `localStorage` 键和模板数据版本，避免与现有工具配置冲突。
2. 实现保存、重命名、复制、删除和读取本地模板。
3. 内置用户注册、登录账号、订单基础、接口请求参数和设备基础模板。
4. 内置模板只读；修改后另存为本地模板。
5. 导入时先解析到临时对象，完成版本、字段、规则和关联校验后再写入存储。
6. 导入失败时不修改已有模板和当前页面配置。
7. 模板导出只包含配置、随机种子和版本，不包含生成结果。
8. 为后续版本保留明确的迁移函数入口，但不添加没有实际迁移内容的兼容层。

### 验证

- 保存后重新读取一致。
- 内置模板不能覆盖或删除。
- 重命名冲突有明确错误。
- 损坏 JSON、未知版本、未知字段类型、失效关联导入失败。
- 导入失败不改变已有数据。
- 模板中不存在生成结果。

## 阶段八：实现 Web Worker 生成管线

### 文件

- 新增 `src/dataGenerator/dataGeneratorWorker.js`
- 新增 `src/dataGenerator/workerClient.js`
- 新增 `scripts/verify-data-generator-worker.mjs`
- 修改 `package.json`

### 实现

1. Worker 接收任务 ID、规范化配置、数量和种子。
2. Worker 分批生成行并定期发送进度，避免长时间无响应。
3. 支持按任务 ID 取消；生成循环在固定批次边界检查取消状态。
4. 同一客户端只允许一个活动任务；新任务不得悄悄覆盖旧任务。
5. Worker 只返回结构化数据和内部元信息，不返回 HTML。
6. Worker 错误序列化为稳定的错误码、字段路径和中文可展示消息。
7. 快速生成和组合生成均调用同一客户端与核心生成器。

### 验证

- 进度单调递增并以完成状态结束。
- 取消后停止继续生成且不返回部分结果作为成功结果。
- 重复任务受到保护。
- Worker 错误可以定位字段。
- 10,000 条生成数量完整，页面主线程保持可响应。
- Worker 构建后可被 Vite 和 PWA 正确打包。

## 阶段九：实现独立 Tab 和页面骨架

### 文件

- 修改 `index.html`
- 修改 `src/main.js`
- 修改 `src/style.css`
- 新增 `src/dataGenerator/dataGeneratorApp.js`
- 新增 `scripts/verify-data-generator-page.mjs`
- 修改 `package.json`

### 实现

1. 新增顶部“测试数据生成”按钮和独立页面容器。
2. 实现可键盘操作的 Tab 切换，正确维护 `aria-selected`、焦点和页面隐藏状态。
3. 新增快速生成、组合生成、模板管理三个二级区域。
4. 主入口只初始化 Tab 和 `dataGeneratorApp`，不放入字段业务逻辑。
5. 页面沿用现有按钮、表单、卡片和提示风格，新增样式使用 `data-generator-` 前缀避免污染旧工具。
6. 切换顶层 Tab 时保留内存配置和结果；刷新页面后只恢复已保存模板。
7. 页面固定展示“浏览器本地处理”和“仅供软件测试使用”。

### 验证

- 两个顶部 Tab 的选中状态、可见页面和键盘操作正确。
- 数据生成页的三个区域存在且可切换。
- 切换 Tab 不清空当前配置。
- 页面 DOM ID 唯一。
- 原有工具入口和现有初始化不受影响。

## 阶段十：实现快速生成界面

### 文件

- 修改 `src/dataGenerator/dataGeneratorApp.js`
- 修改 `index.html`
- 修改 `src/style.css`
- 修改 `scripts/verify-data-generator-page.mjs`

### 实现

1. 实现字段分类、搜索和字段类型选择。
2. 依据字段目录动态渲染公共配置和类型专属配置。
3. 支持数量、数据模式、随机种子和生成操作。
4. 结果区支持单值、列表、复制、重新生成和清空。
5. 显示实际使用的自动种子，便于用户复制复现。
6. 配置错误定位到输入项，不使用浏览器弹窗。

### 验证

- 各分类均可检索和选择字段。
- 切换字段类型时不残留不兼容配置。
- 有效、边界、无效和混合模式调用正确。
- 固定种子复现，自动种子可复制后复现。
- 复制和清空状态正确。

## 阶段十一：实现组合生成和结果预览

### 文件

- 修改 `src/dataGenerator/dataGeneratorApp.js`
- 修改 `index.html`
- 修改 `src/style.css`
- 修改 `scripts/verify-data-generator-page.mjs`

### 实现

1. 支持添加、复制、删除和排序字段。
2. 支持字段名、类型、模式、规则、唯一、空值、重复和关联配置。
3. 支持 JSON 输出路径；明确提示该路径不影响 CSV 和 SQL 列名。
4. 生成前集中展示错误和警告，并滚动定位第一个错误字段。
5. 显示 Worker 进度、取消按钮、成功和失败状态。
6. 表格最多渲染前 100 条，显示完整数量。
7. 支持单元格、行、列、预览和全部结果复制。
8. 修改配置后将已有结果标为过期，不自动重新生成。
9. 测试元信息只在页面辅助展示；用户启用后才进入导出数据。

### 验证

- 字段增删改排和字段名唯一校验。
- 关联配置、失效关联和循环依赖提示。
- 进度、取消、失败重试和重复任务保护。
- 100 条预览上限与完整结果数量。
- 五种复制入口内容正确。
- 配置变化后结果过期状态正确。

## 阶段十二：接入模板和文件导出界面

### 文件

- 修改 `src/dataGenerator/dataGeneratorApp.js`
- 修改 `index.html`
- 修改 `src/style.css`
- 修改 `scripts/verify-data-generator-page.mjs`

### 实现

1. 接入五个内置模板和本地模板管理。
2. 实现保存、另存、重命名、复制、删除、导入和导出配置。
3. 导入前展示模板摘要；校验成功后才允许应用。
4. 接入 JSON、CSV 和 SQL 导出设置。
5. SQL 界面支持选择方言、表名、批次大小和事务。
6. 导出文件使用明确、可预测的默认文件名。
7. 复制大结果失败时保留数据并提示文件导出。
8. 导出期间禁用重复操作，完成或失败后恢复。

### 验证

- 内置模板加载和另存。
- 本地模板完整生命周期。
- 模板导入失败不覆盖当前配置。
- JSON、CSV、三种 SQL UI 配置传递正确。
- 下载内容与同一份内存结果一致。
- 刷新后恢复模板但不恢复生成结果。

## 阶段十三：整体验证、文档同步和收尾

### 文件

- 修改 `README.md`
- 按实际新增或调整 `scripts/verify-data-generator-*.mjs`
- 仅在验证发现本功能问题时修改对应实现文件

### 实现

1. 更新 README 工具清单、使用方式、隐私说明、模板存储和新增测试命令。
2. 记录中国行政区划等静态数据来源、版本和更新方式。
3. 删除实施期间产生的占位文案和调试输出。
4. 检查所有新增模块只承担单一职责，移除没有实际调用的抽象和配置项。
5. 检查 PWA 是否包含 Worker 和静态数据集。

### 自动验证

```powershell
npm run test:data-generator
npm run test:json-find
npm run test:json-replace
npm run test:url-parser
npm run test:activation-code
npm run test:cron
npm run test:regex
npm run build
npm run build:pages
```

### Chrome 手工验证

1. 顶部 Tab 点击、键盘切换和状态保留。
2. 快速生成每个分类的代表字段。
3. 组合生成用户、订单、设备三种模型。
4. 固定种子重复生成结果一致。
5. 身份、地址、时间和金额关联一致。
6. 有效、边界、无效和混合模式展示。
7. 10,000 条生成期间进度、取消和页面响应。
8. JSON、CSV、MySQL、PostgreSQL、SQLite 文件内容抽查。
9. 模板保存、刷新、导入损坏文件和恢复。
10. 首次联网缓存后断网打开，页面、Worker 和静态数据可用。
11. 常用测试工具原有功能不受影响。

## 完成条件

- 设计文档中的 18 项验收标准全部有自动验证或明确的手工验证证据。
- 所有新增分支逻辑均有专项验证覆盖。
- 项目构建和 Pages 构建成功。
- 原有可运行的专项验证无新增回归。
- Chrome 和 PWA 离线验证完成。
- 未提交或提交任何与本功能无关的用户改动。
