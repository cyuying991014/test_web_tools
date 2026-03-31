import {
  fetchDeviceShadow,
  extractReported,
  getShadowApiEnvelopeHint,
  getShadowClassicalUrl,
  SHADOW_CLASSICAL_ORIGIN
} from './emqShadowApi.js'
import { fetchAndParseFieldDescriptions } from './emqDocParser.js'

const LS_MODELS = 'emq_device_models_config'
const LS_SESSION = 'emq_device_shadow_session'

const defaultFieldConfigs = () => ({})

function loadJson(key, fallback) {
  try {
    const s = localStorage.getItem(key)
    if (!s) return fallback
    return JSON.parse(s)
  } catch {
    return fallback
  }
}

function saveJson(key, obj) {
  localStorage.setItem(key, JSON.stringify(obj))
}

function nowTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function formatVal(v) {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

function appendLogLine(logEl, line, cls) {
  if (!logEl) return
  logEl.querySelectorAll('.emq-log-placeholder').forEach((n) => n.remove())
  const div = document.createElement('div')
  div.className = 'emq-log-line' + (cls ? ` emq-log-${cls}` : '')
  div.textContent = `[${nowTime()}] ${line}`
  logEl.appendChild(div)
  logEl.scrollTop = logEl.scrollHeight
}

function clearLogEl(logEl) {
  if (logEl) logEl.innerHTML = ''
}

const FETCH_LOG_PLACEHOLDER_TEXT =
  '暂未加载任何日志。可执行「加载字段说明」、导入型号配置，或在「已保存配置预览」中切换型号，相关记录将显示在此。'

const MONITOR_LOG_PLACEHOLDER_TEXT =
  '暂无监控日志。获取可用字段、查询完整影子或开始监控后，记录将显示在此。'

function ensureFetchLogPlaceholder(logEl) {
  if (!logEl || logEl.querySelector('.emq-log-placeholder')) return
  const ph = document.createElement('div')
  ph.className = 'emq-log-placeholder'
  ph.textContent = FETCH_LOG_PLACEHOLDER_TEXT
  logEl.appendChild(ph)
}

function ensureMonitorLogPlaceholder(logEl) {
  if (!logEl || logEl.querySelector('.emq-log-placeholder')) return
  const ph = document.createElement('div')
  ph.className = 'emq-log-placeholder'
  ph.textContent = MONITOR_LOG_PLACEHOLDER_TEXT
  logEl.appendChild(ph)
}

export function initEmqTool({ showToast }) {
  const $ = (id) => document.getElementById(id)

  const pageToolkit = $('page-toolkit')
  const pageEmq = $('page-emq')
  const siteTabs = document.querySelectorAll('.site-top-tab')
  const emqSubTabs = document.querySelectorAll('.emq-sub-tab')
  const emqPanels = document.querySelectorAll('.emq-sub-panel')

  let modelsConfig = loadJson(LS_MODELS, {})
  let session = loadJson(LS_SESSION, null)
  if (!session) {
    session = {
      device_sn: '',
      monitor_interval: '5',
      doc_url: '',
      region: 'ap-east-1',
      field_descriptions: {},
      fields: {}
    }
    for (const k of Object.keys(defaultFieldConfigs())) {
      session.fields[k] = {}
    }
  }

  let fieldDescriptions = { ...session.field_descriptions }
  let fieldConfigs = {}
  for (const name of Object.keys(session.fields || {})) {
    fieldConfigs[name] = {
      current_value: '',
      status: '未监控'
    }
  }
  if (!Object.keys(fieldConfigs).length) {
    for (const [k, v] of Object.entries(defaultFieldConfigs())) {
      fieldConfigs[k] = { ...v }
    }
  }

  let monitoring = false
  let monitorTimer = null
  let selectedFieldRow = null
  let selectedPreviewRow = null
  let selectedPreviewModel = ''
  let docPreviewDescriptions = {}

  function persistSession() {
    session.device_sn = $('emq-device-sn')?.value?.trim() || ''
    session.monitor_interval = $('emq-interval')?.value?.trim() || '5'
    session.doc_url = $('emq-doc-url')?.value?.trim() || ''
    session.region = $('emq-region')?.value?.trim() || 'ap-east-1'
    session.field_descriptions = { ...fieldDescriptions }
    session.fields = {}
    for (const name of Object.keys(fieldConfigs)) {
      session.fields[name] = {}
    }
    saveJson(LS_SESSION, session)
  }

  function persistModels() {
    saveJson(LS_MODELS, modelsConfig)
  }

  function syncInputsFromSession() {
    const sn = $('emq-device-sn')
    if (sn) sn.value = session.device_sn || ''
    const iv = $('emq-interval')
    if (iv) iv.value = session.monitor_interval || '5'
    const du = $('emq-doc-url')
    if (du) du.value = session.doc_url || ''
    const reg = $('emq-region')
    if (reg) reg.value = session.region || 'ap-east-1'
  }

  function fillModelSelect(selectId) {
    const sel = $(selectId)
    if (!sel || sel.tagName !== 'SELECT') return
    const names = Object.keys(modelsConfig)
    const cur = sel.value
    sel.innerHTML =
      '<option value="">请选择型号</option>' +
      names.map((n) => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('')
    if (cur && names.includes(cur)) sel.value = cur
  }

  function refreshModelDatalist() {
    fillModelSelect('emq-tab3-model')
    renderPreviewModelList()
  }

  function syncMonitorModelSelection(modelName) {
    const m3 = $('emq-tab3-model')
    if (!m3 || m3.tagName !== 'SELECT') return
    if (!modelName || !modelsConfig[modelName]) {
      m3.value = ''
      return
    }
    m3.value = modelName
  }

  function removeFieldByName(name) {
    if (!name || !fieldConfigs[name]) return
    delete fieldConfigs[name]
    if (selectedFieldRow === name) selectedFieldRow = null
    renderFieldTable()
    persistSession()
    showToast(`已移除：${name}`)
  }

  function renderFieldTable() {
    const tb = $('emq-field-tbody')
    if (!tb) return
    tb.innerHTML = ''
    const names = Object.keys(fieldConfigs)
    if (!names.length) {
      tb.innerHTML = '<tr><td colspan="4" class="emq-empty-cell">暂无监控字段，请先添加字段或在「字段配置详情」中双击字段快速加入</td></tr>'
      return
    }
    for (const name of names) {
      const c = fieldConfigs[name]
      const descData = fieldDescriptions[name]
      const desc =
        typeof descData === 'object' && descData
          ? descData.description || ''
          : descData
            ? String(descData)
            : ''
      const tr = document.createElement('tr')
      tr.dataset.fieldName = name
      if (selectedFieldRow === name) tr.classList.add('emq-row-selected')
      tr.innerHTML = `
        <td><code>${escapeHtml(name)}</code></td>
        <td class="emq-desc-cell">${escapeHtml(desc)}</td>
        <td>${escapeHtml(c.current_value)}</td>
        <td><span class="emq-status-pill emq-status-${statusClass(c.status)}">${escapeHtml(c.status)}</span></td>`
      tr.addEventListener('click', () => {
        selectedFieldRow = name
        qsa('#emq-field-tbody tr').forEach((r) => r.classList.toggle('emq-row-selected', r.dataset.fieldName === name))
      })
      tr.addEventListener('dblclick', (e) => {
        e.preventDefault()
        removeFieldByName(name)
      })
      tb.appendChild(tr)
    }
  }

  function renderDocPreviewTable() {
    const tb = $('emq-doc-preview-tbody')
    if (!tb) return
    const names = Object.keys(docPreviewDescriptions || {})
    if (!names.length) {
      tb.innerHTML = '<tr><td colspan="3" class="emq-empty-cell">暂无字段预览数据，请先点击「加载字段说明」</td></tr>'
      return
    }
    tb.innerHTML = ''
    for (const fieldName of names) {
      const d = docPreviewDescriptions[fieldName]
      const attr = typeof d === 'object' && d ? d.attr_name || '' : ''
      const desc = typeof d === 'object' && d ? d.description || '' : String(d || '')
      const tr = document.createElement('tr')
      tr.innerHTML = `<td><code>${escapeHtml(fieldName)}</code></td><td>${escapeHtml(attr || '无')}</td><td class="emq-desc-cell">${escapeHtml(desc || '无说明')}</td>`
      tb.appendChild(tr)
    }
  }

  function guessModelFromDocUrl(url) {
    if (!url) return ''
    const m = String(url).match(/\/DR-([A-Za-z0-9_-]+)\//i)
    if (m && m[1]) return m[1].toUpperCase()
    return ''
  }

  function statusClass(st) {
    if (st === '监控中') return 'run'
    if (st === '已停止') return 'stop'
    return 'muted'
  }

  function qsa(sel, root = document) {
    return [...root.querySelectorAll(sel)]
  }

  function renderPreviewTable(modelName) {
    const tb = $('emq-preview-tbody')
    if (!tb) return
    tb.innerHTML = ''
    selectedPreviewRow = null
    const activeModel = $('emq-preview-active-model')
    if (activeModel) activeModel.textContent = modelName || '未选择'
    if (!modelName || !modelsConfig[modelName]) return
    const fd = modelsConfig[modelName].field_descriptions || {}
    if (!Object.keys(fd).length) {
      tb.innerHTML = '<tr><td colspan="3" class="emq-empty-cell">该型号暂无字段配置</td></tr>'
      return
    }
    for (const fieldName of Object.keys(fd)) {
      const d = fd[fieldName]
      const attr = typeof d === 'object' && d ? d.attr_name || '' : ''
      const desc = typeof d === 'object' && d ? d.description || '' : String(d || '')
      const tr = document.createElement('tr')
      tr.dataset.fieldName = fieldName
      tr.innerHTML = `<td><code>${escapeHtml(fieldName)}</code></td><td>${escapeHtml(attr || '无')}</td><td class="emq-desc-cell">${escapeHtml(desc || '无说明')}</td>`
      tr.addEventListener('click', (e) => {
        selectedPreviewRow = fieldName
        qsa('#emq-preview-tbody tr').forEach((r) => r.classList.toggle('emq-row-selected', r.dataset.fieldName === fieldName))
      })
      tr.addEventListener('dblclick', () => {
        addFieldFromPreview(fieldName, modelName)
      })
      tb.appendChild(tr)
    }
  }

  function addFieldFromPreview(fieldName, modelName) {
    if (fieldConfigs[fieldName]) {
      showToast(`字段「${fieldName}」已在监控列表中`)
      return
    }
    fieldConfigs[fieldName] = {
      current_value: '',
      status: '未监控'
    }
    const mc = modelName ? modelsConfig[modelName] : null
    if (mc?.field_descriptions?.[fieldName]) {
      fieldDescriptions[fieldName] = { ...mc.field_descriptions[fieldName] }
    }
    renderFieldTable()
    persistSession()
    showToast(`已从详情添加字段：${fieldName}`)
    appendLogLine($('emq-fetch-log'), `已从字段配置详情添加字段：${fieldName}`, 'green')
  }

  function renderPreviewModelList() {
    const tb = $('emq-model-list-tbody')
    if (!tb) return
    tb.innerHTML = ''
    const names = Object.keys(modelsConfig)
    if (!names.length) {
      tb.innerHTML = '<tr><td colspan="3" class="emq-empty-cell">暂无已保存型号</td></tr>'
      selectedPreviewModel = ''
      renderPreviewTable('')
      return
    }
    if (selectedPreviewModel && !modelsConfig[selectedPreviewModel]) {
      selectedPreviewModel = ''
      renderPreviewTable('')
    }
    for (const modelName of names) {
      const mc = modelsConfig[modelName] || {}
      const fieldCount = (mc.fields && mc.fields.length) || Object.keys(mc.field_descriptions || {}).length
      const tr = document.createElement('tr')
      tr.dataset.modelName = modelName
      if (selectedPreviewModel === modelName) tr.classList.add('emq-row-selected')
      tr.innerHTML = `
        <td><code>${escapeHtml(modelName)}</code></td>
        <td>${fieldCount}</td>
        <td><button type="button" class="btn btn-ghost emq-btn-row" data-emq-model-act="delete" data-model-name="${escapeAttr(modelName)}">删除配置</button></td>`
      tr.addEventListener('click', (e) => {
        if (e.target.closest('[data-emq-model-act]')) return
        selectedPreviewModel = modelName
        qsa('#emq-model-list-tbody tr').forEach((r) => r.classList.toggle('emq-row-selected', r.dataset.modelName === modelName))
      })
      tr.addEventListener('dblclick', (e) => {
        if (e.target.closest('[data-emq-model-act]')) return
        selectedPreviewModel = modelName
        qsa('#emq-model-list-tbody tr').forEach((r) => r.classList.toggle('emq-row-selected', r.dataset.modelName === modelName))
        syncMonitorModelSelection(modelName)
        renderPreviewTable(modelName)
        appendLogLine($('emq-fetch-log'), `预览已切换型号：${modelName}`, 'blue')
      })
      tb.appendChild(tr)
    }
  }

  function updateFieldStatusFromReported(reported) {
    for (const name of Object.keys(fieldConfigs)) {
      const c = fieldConfigs[name]
      if (!(name in reported)) {
        c.current_value = '不存在'
        c.status = monitoring ? '监控中' : '未监控'
        continue
      }
      const val = reported[name]
      c.current_value = formatVal(val)
      c.status = monitoring ? '监控中' : '未监控'
    }
    renderFieldTable()
  }

  function applyReportedToFields(reported, logEl, logPrefix) {
    if (!reported) {
      appendLogLine(logEl, `${logPrefix} 响应中无 state.reported`, 'red')
      return
    }
    appendLogLine(logEl, `${logPrefix} 共 ${Object.keys(reported).length} 个 reported 字段`, 'blue')
    for (const name of Object.keys(fieldConfigs)) {
      if (name in reported) {
        fieldConfigs[name].current_value = formatVal(reported[name])
        fieldConfigs[name].status = '未监控'
        appendLogLine(logEl, `  ${name}: ${fieldConfigs[name].current_value}`, 'green')
      } else {
        fieldConfigs[name].current_value = '不存在'
        fieldConfigs[name].status = '未监控'
        appendLogLine(logEl, `  ${name}: 不存在`, 'red')
      }
    }
    renderFieldTable()
  }

  /* —— 站点 Tab —— */
  siteTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.siteView
      siteTabs.forEach((b) => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'))
      pageToolkit.hidden = view !== 'toolkit'
      pageEmq.hidden = view !== 'emq'
    })
  })

  /* —— EMQ 子 Tab —— */
  emqSubTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      const sub = btn.dataset.emqSub
      emqSubTabs.forEach((b) => b.setAttribute('aria-selected', b === btn ? 'true' : 'false'))
      emqPanels.forEach((p) => {
        p.hidden = p.id !== `emq-panel-${sub}`
        p.classList.toggle('active', p.id === `emq-panel-${sub}`)
      })
    })
  })

  /* —— Tab1 —— */
  $('emq-load-doc')?.addEventListener('click', async () => {
    const docUrl = $('emq-doc-url')?.value?.trim()
    const ta = $('emq-fetch-log')
    const modelInput = $('emq-doc-preview-model')
    if (modelInput && !modelInput.value.trim()) {
      const guessed = guessModelFromDocUrl(docUrl)
      if (guessed) modelInput.value = guessed
    }
    appendLogLine(ta, '开始从网页加载字段说明…', 'blue')
    try {
      const parsed = await fetchAndParseFieldDescriptions(docUrl, (line) => appendLogLine(ta, line, 'blue'))
      Object.assign(fieldDescriptions, parsed)
      docPreviewDescriptions = JSON.parse(JSON.stringify(parsed))
      renderDocPreviewTable()
      renderFieldTable()
      persistSession()
      appendLogLine(ta, `完成：共 ${Object.keys(parsed).length} 个字段`, 'green')
      showToast('字段说明已加载')
    } catch (e) {
      appendLogLine(ta, `失败：${e.message || e}`, 'red')
      showToast('加载失败，见日志')
    }
  })

  $('emq-save-preview-model')?.addEventListener('click', () => {
    const model = $('emq-doc-preview-model')?.value?.trim()
    if (!model) return showToast('请先填写设备型号名')
    const names = Object.keys(docPreviewDescriptions || {})
    if (!names.length) return showToast('暂无可保存的字段预览，请先加载字段说明')
    const field_configs = {}
    for (const name of names) {
      field_configs[name] = {}
    }
    modelsConfig[model] = {
      doc_url: $('emq-doc-url')?.value?.trim() || '',
      fields: [...names],
      field_descriptions: JSON.parse(JSON.stringify(docPreviewDescriptions)),
      field_configs
    }
    persistModels()
    refreshModelDatalist()
    selectedPreviewModel = model
    syncMonitorModelSelection(model)
    renderPreviewModelList()
    renderPreviewTable(model)
    showToast(`已保存型号配置：${model}`)
    appendLogLine($('emq-fetch-log'), `已保存型号配置：${model}（${names.length} 个字段）`, 'green')
  })

  $('emq-doc-url')?.addEventListener('blur', () => {
    const modelInput = $('emq-doc-preview-model')
    if (!modelInput || modelInput.value.trim()) return
    const guessed = guessModelFromDocUrl($('emq-doc-url')?.value?.trim() || '')
    if (guessed) modelInput.value = guessed
  })

  $('emq-clear-fetch-log')?.addEventListener('click', () => {
    const el = $('emq-fetch-log')
    clearLogEl(el)
    ensureFetchLogPlaceholder(el)
  })

  /* —— Tab2 —— */
  $('emq-preview-refresh')?.addEventListener('click', () => {
    refreshModelDatalist()
    showToast('列表已刷新')
  })

  $('emq-model-list-tbody')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-emq-model-act]')
    if (!btn) return
    const act = btn.getAttribute('data-emq-model-act')
    const modelName = btn.getAttribute('data-model-name')
    if (act !== 'delete' || !modelName || !modelsConfig[modelName]) return
    if (!confirm(`确定删除型号「${modelName}」的配置？`)) return
    delete modelsConfig[modelName]
    persistModels()
    if ($('emq-tab3-model')?.value === modelName) {
      syncMonitorModelSelection('')
    }
    if (selectedPreviewModel === modelName) {
      selectedPreviewModel = ''
      renderPreviewTable('')
    }
    refreshModelDatalist()
    showToast(`已删除型号：${modelName}`)
    appendLogLine($('emq-fetch-log'), `已删除型号：${modelName}`, 'orange')
  })

  /* —— Tab3 —— */
  $('emq-load-model-full')?.addEventListener('click', () => {
    const model = $('emq-tab3-model')?.value?.trim()
    if (!model || !modelsConfig[model]) {
      showToast('请选择有效型号')
      return
    }
    if (Object.keys(fieldConfigs).length && !confirm('加载将替换当前监控字段列表，是否继续？')) return
    const mc = modelsConfig[model]
    fieldConfigs = {}
    const fields = mc.fields || Object.keys(mc.field_descriptions || {})
    for (const name of fields) {
      fieldConfigs[name] = {
        current_value: '',
        status: '未监控'
      }
    }
    Object.assign(fieldDescriptions, mc.field_descriptions || {})
    if (mc.doc_url) $('emq-doc-url').value = mc.doc_url
    selectedPreviewModel = model
    renderPreviewModelList()
    renderFieldTable()
    renderPreviewTable(model)
    persistSession()
    showToast('已加载型号完整配置')
  })

  $('emq-remove-field')?.addEventListener('click', () => {
    if (!selectedFieldRow || !fieldConfigs[selectedFieldRow]) return showToast('请先选择一行')
    removeFieldByName(selectedFieldRow)
  })

  $('emq-clear-fields')?.addEventListener('click', () => {
    if (!Object.keys(fieldConfigs).length) return showToast('没有字段')
    if (!confirm('清空全部监控字段？')) return
    fieldConfigs = {}
    selectedFieldRow = null
    renderFieldTable()
    persistSession()
  })

  $('emq-get-fields')?.addEventListener('click', async () => {
    const sn = $('emq-device-sn')?.value?.trim()
    const ta = $('emq-monitor-log')
    if (!sn) return showToast('请填写设备 SN')
    const region = $('emq-region')?.value?.trim() || 'ap-east-1'
    appendLogLine(ta, '开始获取可用字段信息…', 'blue')
    appendLogLine(ta, `请求地址模板: ${SHADOW_CLASSICAL_ORIGIN}`, 'blue')
    appendLogLine(ta, `本次直连 URL: ${getShadowClassicalUrl(sn)}`, 'blue')
    appendLogLine(ta, '直连失败时会回退: 同源 /api/emq-shadow/emq/things/{sn}/shadow/classical', 'blue')
    try {
      const data = await fetchDeviceShadow(region, sn)
      appendLogLine(ta, '请求成功 HTTP 200', 'green')
      appendLogLine(ta, '完整响应 JSON（排错用）：', 'blue')
      appendLogLine(ta, JSON.stringify(data, null, 2), 'blue')
      const reported = extractReported(data)
      if (!reported) {
        appendLogLine(ta, '响应中未找到 state.reported（已解析 code/msg/data 等常见包装）', 'red')
        if (data && typeof data === 'object') {
          appendLogLine(ta, `JSON 顶层键: ${Object.keys(data).join(', ')}`, 'orange')
          const envHint = getShadowApiEnvelopeHint(data)
          if (envHint) appendLogLine(ta, envHint, 'orange')
        }
        return
      }
      appendLogLine(ta, `可用的影子字段 (${Object.keys(reported).length} 个):`, 'green')
      for (const [k, v] of Object.entries(reported)) {
        appendLogLine(ta, `  - ${k}: ${formatVal(v)}`, 'green')
      }
      applyReportedToFields(reported, ta, '获取字段')
    } catch (e) {
      appendLogLine(ta, `获取字段值错误: ${e.message || e}`, 'red')
      showToast('请求失败')
    }
  })

  $('emq-query-shadow')?.addEventListener('click', async () => {
    const sn = $('emq-device-sn')?.value?.trim()
    const ta = $('emq-monitor-log')
    if (!sn) return showToast('请填写设备 SN')
    const region = $('emq-region')?.value?.trim() || 'ap-east-1'
    appendLogLine(ta, '开始查询完整影子信息…', 'blue')
    appendLogLine(ta, `请求地址: ${getShadowClassicalUrl(sn)}`, 'blue')
    try {
      const data = await fetchDeviceShadow(region, sn)
      appendLogLine(ta, '请求成功 HTTP 200', 'green')
      appendLogLine(ta, JSON.stringify(data, null, 2), 'blue')
      const reported = extractReported(data)
      if (!reported) {
        appendLogLine(ta, '解析后仍未找到 state.reported', 'orange')
        const envHint = getShadowApiEnvelopeHint(data)
        if (envHint) appendLogLine(ta, envHint, 'orange')
      }
      applyReportedToFields(reported, ta, '影子')
    } catch (e) {
      appendLogLine(ta, `错误：${e.message || e}`, 'red')
      showToast('请求失败')
    }
  })

  $('emq-start-monitor')?.addEventListener('click', () => {
    if (!Object.keys(fieldConfigs).length) return showToast('请先添加字段')
    const sn = $('emq-device-sn')?.value?.trim()
    if (!sn) return showToast('请填写设备 SN')
    let interval = parseInt($('emq-interval')?.value, 10)
    if (Number.isNaN(interval) || interval < 1) return showToast('监控间隔须为 ≥1 的整数')
    monitoring = true
    $('emq-start-monitor').disabled = true
    $('emq-stop-monitor').disabled = false
    for (const c of Object.values(fieldConfigs)) {
      c.status = '监控中'
    }
    renderFieldTable()
    const ta = $('emq-monitor-log')
    appendLogLine(ta, `开始监控，间隔 ${interval}s`, 'blue')

    const tick = async () => {
      if (!monitoring) return
      try {
        persistSession()
        const region = $('emq-region')?.value?.trim() || 'ap-east-1'
        const data = await fetchDeviceShadow(region, $('emq-device-sn')?.value?.trim())
        const reported = extractReported(data)
        appendLogLine(ta, `[${nowTime()}] 轮询更新`, 'blue')
        if (reported) {
          for (const name of Object.keys(fieldConfigs)) {
            const c = fieldConfigs[name]
            const descData = fieldDescriptions[name]
            const remark =
              typeof descData === 'object' && descData?.description
                ? `（${descData.description.slice(0, 40)}…）`
                : ''
            if (name in reported) {
              c.current_value = formatVal(reported[name])
              appendLogLine(ta, `  ${name}${remark}: ${c.current_value}`, 'green')
            } else {
              c.current_value = '不存在'
              appendLogLine(ta, `  ${name}: 不存在`, 'red')
            }
          }
          updateFieldStatusFromReported(reported)
        } else {
          appendLogLine(ta, '  无 reported', 'red')
        }
      } catch (e) {
        appendLogLine(ta, `  错误：${e.message || e}`, 'red')
      }
    }

    tick()
    monitorTimer = setInterval(tick, interval * 1000)
  })

  $('emq-stop-monitor')?.addEventListener('click', () => {
    monitoring = false
    if (monitorTimer) {
      clearInterval(monitorTimer)
      monitorTimer = null
    }
    $('emq-start-monitor').disabled = false
    $('emq-stop-monitor').disabled = true
    for (const c of Object.values(fieldConfigs)) {
      c.status = '已停止'
    }
    renderFieldTable()
    appendLogLine($('emq-monitor-log'), '监控已停止', 'orange')
  })

  $('emq-save-session')?.addEventListener('click', () => {
    persistSession()
    showToast('配置已保存到本地')
    appendLogLine($('emq-monitor-log'), '已保存会话配置（localStorage）', 'green')
  })

  $('emq-reload-session')?.addEventListener('click', () => {
    session = loadJson(LS_SESSION, session)
    fieldDescriptions = { ...session.field_descriptions }
    fieldConfigs = {}
    for (const name of Object.keys(session.fields || {})) {
      fieldConfigs[name] = {
        current_value: '',
        status: '未监控'
      }
    }
    syncInputsFromSession()
    renderFieldTable()
    showToast('已从本地重新加载')
  })

  $('emq-clear-monitor-log')?.addEventListener('click', () => {
    const el = $('emq-monitor-log')
    clearLogEl(el)
    ensureMonitorLogPlaceholder(el)
  })

  $('emq-export-models')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(modelsConfig, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'device_models_config.json'
    a.click()
    URL.revokeObjectURL(a.href)
    showToast('已导出')
  })

  $('emq-import-models')?.addEventListener('click', () => $('emq-import-models-file')?.click())
  $('emq-import-models-file')?.addEventListener('change', (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const r = new FileReader()
    r.onload = () => {
      try {
        modelsConfig = JSON.parse(r.result)
        persistModels()
        refreshModelDatalist()
        showToast('型号配置已导入')
      } catch {
        showToast('JSON 解析失败')
      }
    }
    r.readAsText(f, 'UTF-8')
  })

  /* 输入变更时写回 session 草稿 */
  ;['emq-device-sn', 'emq-interval', 'emq-doc-url', 'emq-region'].forEach((id) => {
    $(id)?.addEventListener('change', () => persistSession())
    $(id)?.addEventListener('blur', () => persistSession())
  })

  syncInputsFromSession()
  refreshModelDatalist()
  renderPreviewModelList()
  renderFieldTable()
  renderDocPreviewTable()
  renderPreviewTable('')
  ensureFetchLogPlaceholder($('emq-fetch-log'))
  ensureMonitorLogPlaceholder($('emq-monitor-log'))
}
