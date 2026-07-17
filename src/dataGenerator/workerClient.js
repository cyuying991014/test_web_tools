export function createGeneratorClient() {
  let active = null
  return {
    generate(model, onProgress = () => {}) {
      if (active) return Promise.reject(new Error('已有生成任务正在执行'))
      const worker = new Worker(new URL('./dataGeneratorWorker.js', import.meta.url), { type: 'module' })
      const taskId = `task-${Date.now()}`
      return new Promise((resolve, reject) => {
        active = { worker, reject }
        worker.addEventListener('message', (event) => {
          if (event.data.taskId !== taskId) return
          if (event.data.type === 'progress') onProgress(event.data.progress)
          if (event.data.type === 'complete') {
            worker.terminate()
            active = null
            resolve(event.data.result)
          }
          if (event.data.type === 'error') {
            worker.terminate()
            active = null
            reject(new Error(event.data.message))
          }
        })
        worker.addEventListener('error', (event) => {
          worker.terminate()
          active = null
          reject(new Error(event.message || '批量生成失败'))
        })
        worker.postMessage({ type: 'generate', taskId, model })
      })
    },
    cancel() {
      if (!active) return false
      active.worker.terminate()
      active.reject(new Error('生成任务已取消'))
      active = null
      return true
    }
  }
}
