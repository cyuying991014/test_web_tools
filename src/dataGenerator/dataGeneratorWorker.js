import { generateRows } from './generateRows.js'

self.addEventListener('message', (event) => {
  const { type, taskId, model } = event.data || {}
  if (type !== 'generate') return
  try {
    self.postMessage({ type: 'progress', taskId, progress: 5 })
    const result = generateRows(model)
    self.postMessage({ type: 'progress', taskId, progress: 100 })
    self.postMessage({ type: 'complete', taskId, result })
  } catch (error) {
    self.postMessage({ type: 'error', taskId, message: error instanceof Error ? error.message : String(error) })
  }
})
