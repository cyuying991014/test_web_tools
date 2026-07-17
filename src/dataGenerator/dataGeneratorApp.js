import { CATALOG_GROUPS, DATA_CATALOG, getCatalogItem } from './catalog.js'
import { exportCsv, exportJson, exportSql, downloadText } from './exporters.js'
import { BUILT_IN_TEMPLATES, createTemplateStore } from './templates.js'
import { createGeneratorClient } from './workerClient.js'

const $ = (id) => document.getElementById(id)
const clone = (value) => structuredClone(value)

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function typeOptions(selected) {
  return CATALOG_GROUPS.map((group) => {
    const options = DATA_CATALOG.filter((entry) => entry.group === group)
      .map((entry) => `<option value="${entry.type}"${entry.type === selected ? ' selected' : ''}>${escapeHtml(entry.label)}</option>`).join('')
    return `<optgroup label="${escapeHtml(group)}">${options}</optgroup>`
  }).join('')
}

function optionSchema(type) {
  if (['integer', 'decimal', 'age'].includes(type)) return [{ key: 'min', label: '最小值', type: 'number' }, { key: 'max', label: '最大值', type: 'number' }, ...(type === 'decimal' ? [{ key: 'decimals', label: '小数位', type: 'number' }] : [])]
  if (['password', 'verificationCode', 'token', 'apiKey', 'numericId', 'deviceSn', 'bankCard', 'spaces', 'emoji'].includes(type)) return [{ key: 'length', label: '长度', type: 'number' }, ...(type === 'apiKey' || type === 'deviceSn' ? [{ key: 'prefix', label: '前缀', type: 'text' }] : [])]
  if (['textZh', 'textEn', 'textMixed'].includes(type)) return [{ key: 'minLength', label: '最短长度', type: 'number' }, { key: 'maxLength', label: '最长长度', type: 'number' }]
  if (type === 'multiline') return [{ key: 'lines', label: '行数', type: 'number' }]
  if (type === 'enum') return [{ key: 'values', label: '候选值（逗号分隔）', type: 'text' }]
  if (type === 'sequence') return [{ key: 'start', label: '起始值', type: 'number' }, { key: 'step', label: '步长', type: 'number' }]
  if (type === 'fixed') return [{ key: 'value', label: '固定值', type: 'text' }]
  if (['orderNo'].includes(type)) return [{ key: 'prefix', label: '前缀', type: 'text' }]
  if (['date', 'datetime', 'timestampSec', 'timestampMs'].includes(type)) return [{ key: 'min', label: '开始时间', type: 'datetime-local' }, { key: 'max', label: '结束时间', type: 'datetime-local' }]
  if (['longitude', 'latitude'].includes(type)) return [{ key: 'decimals', label: '小数位', type: 'number' }]
  return []
}

function renderOptionInputs(container, type, options) {
  const schema = optionSchema(type)
  if (schema.length === 0) {
    container.innerHTML = '<p class="data-generator-inline-note">该类型无需额外规则。</p>'
    return
  }
  container.innerHTML = schema.map((entry) => {
    const raw = options[entry.key]
    const value = Array.isArray(raw) ? raw.join(',') : (raw ?? '')
    return `<label>${entry.label}<input data-data-option="${entry.key}" type="${entry.type}" value="${escapeHtml(value)}" /></label>`
  }).join('')
}

function readOptions(container, defaults) {
  const options = { ...defaults }
  container.querySelectorAll('[data-data-option]').forEach((input) => {
    const key = input.dataset.dataOption
    if (key === 'values') options[key] = input.value.split(',').map((value) => value.trim()).filter(Boolean)
    else if (input.type === 'number') options[key] = input.value === '' ? undefined : Number(input.value)
    else options[key] = input.value
  })
  return options
}

function createInitialFields() {
  return [
    { id: 'field-1', name: 'userId', type: 'uuid', mode: 'valid', options: {}, unique: true, emptyRate: 0, duplicateRate: 0, jsonPath: 'userId' },
    { id: 'field-2', name: 'name', type: 'nameZh', mode: 'valid', options: {}, unique: false, emptyRate: 0, duplicateRate: 0, jsonPath: 'name' },
    { id: 'field-3', name: 'phone', type: 'phone', mode: 'valid', options: {}, unique: true, emptyRate: 0, duplicateRate: 0, jsonPath: 'phone' }
  ]
}

export function initDataGenerator({ showToast, copyText }) {
  if (!$('page-data-generator')) return
  const client = createGeneratorClient()
  const templateStore = createTemplateStore()
  let fields = createInitialFields()
  let activeFieldId = fields[0].id
  let currentResult = null
  let quickResult = null
  let modelReferenceDate = new Date().toISOString().slice(0, 10)

  const siteTabs = [...document.querySelectorAll('.site-top-tab')]
  siteTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.siteView
      siteTabs.forEach((item) => item.setAttribute('aria-selected', item === tab ? 'true' : 'false'))
      $('page-toolkit').hidden = view !== 'toolkit'
      $('page-data-generator').hidden = view !== 'data-generator'
      if ($('page-emq')) $('page-emq').hidden = view !== 'emq'
    })
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
      event.preventDefault()
      const direction = event.key === 'ArrowRight' ? 1 : -1
      const next = siteTabs[(index + direction + siteTabs.length) % siteTabs.length]
      next.focus()
      next.click()
    })
  })

  const generatorTabs = [...document.querySelectorAll('.data-generator-tab')]
  generatorTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.generatorView
      generatorTabs.forEach((item) => item.setAttribute('aria-selected', item === tab ? 'true' : 'false'))
      for (const name of ['quick', 'builder', 'templates']) $(`data-generator-${name}`).hidden = name !== view
      if (view === 'templates') renderTemplates()
    })
  })

  const quickType = $('data-quick-type')
  quickType.innerHTML = typeOptions(DATA_CATALOG[0].type)
  function renderQuickOptions() {
    renderOptionInputs($('data-quick-options'), quickType.value, getCatalogItem(quickType.value).defaults)
  }
  quickType.addEventListener('change', renderQuickOptions)
  renderQuickOptions()

  $('data-quick-generate').addEventListener('click', async () => {
    const item = getCatalogItem(quickType.value)
    const field = { name: 'value', type: item.type, mode: $('data-quick-mode').value, options: readOptions($('data-quick-options'), item.defaults), jsonPath: 'value' }
    const button = $('data-quick-generate')
    button.disabled = true
    $('data-quick-summary').textContent = '正在生成…'
    try {
      quickResult = await client.generate({ count: Number($('data-quick-count').value), seed: $('data-quick-seed').value, referenceDate: modelReferenceDate, fields: [field] })
      const values = quickResult.rows.map((row) => row.value)
      $('data-quick-result').textContent = values.map((value) => typeof value === 'string' ? value : JSON.stringify(value)).join('\n')
      $('data-quick-summary').textContent = `${values.length} 条 · 种子 ${quickResult.seed}`
      $('data-quick-copy').disabled = false
    } catch (error) {
      quickResult = null
      $('data-quick-result').textContent = error.message
      $('data-quick-summary').textContent = '生成失败'
    } finally {
      button.disabled = false
    }
  })
  $('data-quick-copy').addEventListener('click', () => copyText(quickResult?.rows.map((row) => row.value).join('\n')))
  $('data-quick-clear').addEventListener('click', () => {
    quickResult = null
    $('data-quick-result').textContent = '选择数据类型后点击“生成数据”'
    $('data-quick-summary').textContent = '尚未生成'
    $('data-quick-copy').disabled = true
  })

  function renderFieldList() {
    const list = $('data-field-list')
    list.innerHTML = fields.map((field, index) => {
      const catalog = getCatalogItem(field.type)
      return `<button type="button" class="data-generator-field-card${field.id === activeFieldId ? ' active' : ''}" data-field-id="${field.id}"><span>${escapeHtml(field.name)}</span><small>${escapeHtml(catalog?.label || field.type)} · ${field.mode === 'valid' ? '有效' : field.mode === 'boundary' ? '边界' : field.mode === 'invalid' ? '无效' : '混合'}</small><em>${index + 1}</em></button>`
    }).join('')
    list.querySelectorAll('[data-field-id]').forEach((button) => button.addEventListener('click', () => {
      activeFieldId = button.dataset.fieldId
      renderFieldList()
      renderFieldEditor()
    }))
  }

  function renderFieldEditor() {
    const field = fields.find((item) => item.id === activeFieldId)
    const editor = $('data-field-editor')
    if (!field) {
      editor.innerHTML = '<p class="data-generator-empty">添加字段后，在这里配置生成规则。</p>'
      return
    }
    const sourceOptions = fields.filter((item) => item.id !== field.id).map((item) => `<option value="${escapeHtml(item.name)}"${field.relation?.source === item.name ? ' selected' : ''}>${escapeHtml(item.name)}</option>`).join('')
    editor.innerHTML = `
      <div class="data-generator-editor-head"><div><strong>${escapeHtml(field.name)}</strong><span>${escapeHtml(getCatalogItem(field.type)?.label)}</span></div><div><button type="button" class="btn btn-ghost" id="data-field-up">上移</button><button type="button" class="btn btn-ghost" id="data-field-down">下移</button><button type="button" class="btn btn-ghost" id="data-field-delete">删除</button></div></div>
      <div class="data-generator-option-grid">
        <label>字段名<input id="data-field-name" value="${escapeHtml(field.name)}" /></label>
        <label>数据类型<select id="data-field-type">${typeOptions(field.type)}</select></label>
        <label>数据模式<select id="data-field-mode"><option value="valid"${field.mode === 'valid' ? ' selected' : ''}>有效数据</option><option value="boundary"${field.mode === 'boundary' ? ' selected' : ''}>边界数据</option><option value="invalid"${field.mode === 'invalid' ? ' selected' : ''}>无效数据</option><option value="mixed"${field.mode === 'mixed' ? ' selected' : ''}>混合数据</option></select></label>
        <label>JSON 输出路径<input id="data-field-path" value="${escapeHtml(field.jsonPath)}" /></label>
        <label>空值比例 %<input id="data-field-empty" type="number" min="0" max="100" value="${field.emptyRate}" /></label>
        <label>重复比例 %<input id="data-field-duplicate" type="number" min="0" max="100" value="${field.duplicateRate}" /></label>
        <label class="data-generator-check"><input id="data-field-unique" type="checkbox"${field.unique ? ' checked' : ''} /> 全部唯一</label>
      </div>
      <h3>类型规则</h3><div id="data-field-options" class="data-generator-option-grid"></div>
      <h3>字段关联</h3><div class="data-generator-option-grid">
        <label>关联方式<select id="data-field-relation-kind"><option value="">无关联</option><option value="copy"${field.relation?.kind === 'copy' ? ' selected' : ''}>复制源字段</option><option value="prefix"${field.relation?.kind === 'prefix' ? ' selected' : ''}>源字段 + 固定后缀</option><option value="suffix"${field.relation?.kind === 'suffix' ? ' selected' : ''}>固定前缀 + 源字段</option><option value="birthDateFromCnId"${field.relation?.kind === 'birthDateFromCnId' ? ' selected' : ''}>身份证 → 出生日期</option><option value="genderFromCnId"${field.relation?.kind === 'genderFromCnId' ? ' selected' : ''}>身份证 → 性别</option><option value="regionFromCnId"${field.relation?.kind === 'regionFromCnId' ? ' selected' : ''}>身份证 → 地区码</option><option value="ageFromBirthDate"${field.relation?.kind === 'ageFromBirthDate' ? ' selected' : ''}>出生日期 → 年龄</option><option value="usernameFromName"${field.relation?.kind === 'usernameFromName' ? ' selected' : ''}>姓名 → 用户名</option><option value="emailFromName"${field.relation?.kind === 'emailFromName' ? ' selected' : ''}>姓名 → Email</option><option value="endAfterStart"${field.relation?.kind === 'endAfterStart' ? ' selected' : ''}>开始时间 → 结束时间</option><option value="multiply"${field.relation?.kind === 'multiply' ? ' selected' : ''}>两字段相乘</option></select></label>
        <label>源字段<select id="data-field-relation-source"><option value="">请选择</option>${sourceOptions}</select></label>
        <label>关联参数<input id="data-field-relation-value" value="${escapeHtml(field.relation?.otherSource || field.relation?.value || field.relation?.maxMinutes || '')}" placeholder="前后缀、最大分钟或第二字段名" /></label>
      </div>
      <p class="data-generator-inline-note">JSON 路径只影响 JSON；CSV 和 SQL 始终使用字段名作为列名。</p>`
    renderOptionInputs($('data-field-options'), field.type, { ...getCatalogItem(field.type).defaults, ...field.options })

    const update = () => {
      field.name = $('data-field-name').value.trim()
      field.type = $('data-field-type').value
      field.mode = $('data-field-mode').value
      field.jsonPath = $('data-field-path').value.trim() || field.name
      field.emptyRate = Number($('data-field-empty').value || 0)
      field.duplicateRate = Number($('data-field-duplicate').value || 0)
      field.unique = $('data-field-unique').checked
      field.options = readOptions($('data-field-options'), getCatalogItem(field.type).defaults)
      const kind = $('data-field-relation-kind').value
      const relationValue = $('data-field-relation-value').value
      field.relation = kind ? { kind, source: $('data-field-relation-source').value, value: relationValue } : null
      if (kind === 'endAfterStart') field.relation.maxMinutes = Number(relationValue || 1440)
      if (kind === 'multiply') field.relation.otherSource = relationValue
      markStale()
      renderFieldList()
    }
    editor.querySelectorAll('input,select').forEach((input) => input.addEventListener('change', update))
    $('data-field-type').addEventListener('change', () => { field.options = { ...getCatalogItem($('data-field-type').value).defaults }; update(); renderFieldEditor() })
    $('data-field-delete').addEventListener('click', () => {
      fields = fields.filter((item) => item.id !== field.id)
      activeFieldId = fields[0]?.id || null
      markStale(); renderFieldList(); renderFieldEditor()
    })
    const move = (direction) => {
      const index = fields.findIndex((item) => item.id === field.id)
      const target = index + direction
      if (target < 0 || target >= fields.length) return
      ;[fields[index], fields[target]] = [fields[target], fields[index]]
      markStale(); renderFieldList()
    }
    $('data-field-up').addEventListener('click', () => move(-1))
    $('data-field-down').addEventListener('click', () => move(1))
  }

  $('data-field-add').addEventListener('click', () => {
    const id = `field-${Date.now()}`
    fields.push({ id, name: `field${fields.length + 1}`, type: 'integer', mode: 'valid', options: { min: 0, max: 1000 }, unique: false, emptyRate: 0, duplicateRate: 0, jsonPath: `field${fields.length + 1}` })
    activeFieldId = id
    markStale(); renderFieldList(); renderFieldEditor()
  })

  function currentModel() {
    return { name: $('data-model-name').value.trim(), count: Number($('data-model-count').value), seed: $('data-model-seed').value.trim(), referenceDate: modelReferenceDate, includeMeta: $('data-model-meta').checked, fields: clone(fields) }
  }

  function markStale() {
    if (!currentResult) return
    $('data-model-status').textContent = '配置已变化，当前结果基于上次生成。请重新生成。'
    $('data-model-status').classList.add('stale')
  }
  ;['data-model-name', 'data-model-count', 'data-model-seed', 'data-model-meta'].forEach((id) => $(id).addEventListener('change', markStale))

  function setResultActions(enabled) {
    for (const id of ['data-copy-json', 'data-export-json', 'data-export-csv', 'data-export-sql']) $(id).disabled = !enabled
  }

  function renderPreview(result) {
    const preview = $('data-preview')
    preview.replaceChildren()
    if (!result.rows.length) { preview.textContent = '没有生成结果。'; return }
    const wrapper = document.createElement('div')
    wrapper.className = 'data-generator-table-wrap'
    const table = document.createElement('table')
    table.className = 'data-generator-table'
    const head = document.createElement('thead')
    const headerRow = document.createElement('tr')
    fields.forEach((field) => { const th = document.createElement('th'); th.textContent = field.name; headerRow.append(th) })
    head.append(headerRow); table.append(head)
    const body = document.createElement('tbody')
    result.rows.slice(0, 100).forEach((row) => {
      const tr = document.createElement('tr')
      fields.forEach((field) => {
        const td = document.createElement('td')
        const value = row[field.name]
        td.textContent = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? 'null')
        td.title = '点击复制该值'
        td.tabIndex = 0
        td.addEventListener('click', () => copyText(td.textContent))
        tr.append(td)
      })
      body.append(tr)
    })
    table.append(body); wrapper.append(table); preview.append(wrapper)
  }

  $('data-model-generate').addEventListener('click', async () => {
    const generateButton = $('data-model-generate')
    generateButton.disabled = true
    $('data-model-cancel').disabled = false
    $('data-model-status').classList.remove('stale')
    $('data-model-status').textContent = '正在校验并生成…'
    try {
      currentResult = await client.generate(currentModel(), (progress) => { $('data-model-status').textContent = `正在生成… ${progress}%` })
      $('data-model-seed').value = currentResult.seed
      $('data-model-status').textContent = `已生成 ${currentResult.rows.length} 条，页面预览前 ${Math.min(100, currentResult.rows.length)} 条。随机种子：${currentResult.seed}`
      renderPreview(currentResult)
      setResultActions(true)
    } catch (error) {
      currentResult = null
      $('data-model-status').textContent = error.message
      setResultActions(false)
    } finally {
      generateButton.disabled = false
      $('data-model-cancel').disabled = true
    }
  })
  $('data-model-cancel').addEventListener('click', () => client.cancel())

  const jsonContent = () => exportJson(currentResult.rows, currentResult.model.fields, { pretty: true, includeMeta: $('data-model-meta').checked })
  $('data-copy-json').addEventListener('click', () => copyText(jsonContent()))
  $('data-export-json').addEventListener('click', () => downloadText(jsonContent(), 'test-data.json', 'application/json;charset=utf-8'))
  $('data-export-csv').addEventListener('click', () => downloadText(exportCsv(currentResult.rows, currentResult.model.fields, { includeMeta: $('data-model-meta').checked }), 'test-data.csv', 'text/csv;charset=utf-8'))
  $('data-export-sql').addEventListener('click', () => {
    try {
      const sql = exportSql(currentResult.rows, currentResult.model.fields, { dialect: $('data-sql-dialect').value, table: $('data-sql-table').value, batchSize: Number($('data-sql-batch').value), transaction: $('data-sql-transaction').checked })
      downloadText(sql, `test-data-${$('data-sql-dialect').value}.sql`, 'text/plain;charset=utf-8')
    } catch (error) { showToast(error.message) }
  })

  function applyTemplate(template) {
    fields = clone(template.fields).map((field, index) => ({ id: field.id || `field-${Date.now()}-${index}`, mode: 'valid', options: {}, unique: false, emptyRate: 0, duplicateRate: 0, jsonPath: field.name, ...field }))
    activeFieldId = fields[0]?.id || null
    $('data-model-name').value = template.name
    $('data-model-count').value = template.count || 20
    $('data-model-seed').value = template.seed || ''
    modelReferenceDate = template.referenceDate || new Date().toISOString().slice(0, 10)
    currentResult = null
    setResultActions(false)
    renderFieldList(); renderFieldEditor()
    generatorTabs.find((tab) => tab.dataset.generatorView === 'builder').click()
    $('data-model-status').textContent = `已加载模板“${template.name}”，请检查字段后生成。`
  }

  function renderTemplates() {
    const templates = templateStore.list()
    const select = $('data-template-select')
    const selected = select.value
    select.innerHTML = templates.map((template) => `<option value="${template.id}"${template.id === selected ? ' selected' : ''}>${template.builtIn ? '内置 · ' : '本地 · '}${escapeHtml(template.name)}</option>`).join('')
    const template = templates.find((item) => item.id === select.value) || templates[0]
    if (template) $('data-template-summary').textContent = `${template.name}：${template.fields.length} 个字段 · 默认生成 ${template.count || 20} 条${template.builtIn ? ' · 内置只读' : ' · 保存在当前浏览器'}`
  }
  $('data-template-select').addEventListener('change', renderTemplates)
  $('data-template-load').addEventListener('click', () => {
    const template = templateStore.list().find((item) => item.id === $('data-template-select').value)
    if (template) applyTemplate(template)
  })
  $('data-template-save').addEventListener('click', () => { templateStore.save(currentModel()); renderTemplates(); showToast('当前模型已保存到本机') })
  $('data-template-delete').addEventListener('click', () => {
    try { templateStore.remove($('data-template-select').value); renderTemplates(); showToast('本地模板已删除') } catch (error) { showToast(error.message) }
  })
  $('data-template-export').addEventListener('click', () => {
    const template = templateStore.list().find((item) => item.id === $('data-template-select').value)
    if (template) downloadText(templateStore.exportJson(template), 'test-data-template.json', 'application/json;charset=utf-8')
  })
  $('data-template-import').addEventListener('click', () => $('data-template-file').click())
  $('data-template-file').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try { templateStore.importJson(await file.text()); renderTemplates(); showToast('模板已导入') } catch (error) { showToast(`导入失败：${error.message}`) }
    event.target.value = ''
  })

  renderFieldList()
  renderFieldEditor()
  renderTemplates()
}
