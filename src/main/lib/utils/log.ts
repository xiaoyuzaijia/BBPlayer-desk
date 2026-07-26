// 最小 logger（替代 BBPlayer 的 @/utils/log）
// 对外 API：debug / info / warning / error / extend
// 不引入第三方库，主进程直接用 console

interface Logger {
  (msg: unknown, ...args: unknown[]): void
  debug: (msg: unknown, ...args: unknown[]) => void
  info: (msg: unknown, ...args: unknown[]) => void
  warning: (msg: unknown, ...args: unknown[]) => void
  error: (msg: unknown, ...args: unknown[]) => void
  extend: (sub: string) => Logger
}

function createLog(prefix: string): Logger {
  const base = (level: string, msg: unknown, args: unknown[]): void => {
    console.log(`[${prefix}] [${level}]`, msg, ...args)
  }
  const log = ((msg: unknown, ...args: unknown[]) => base('log', msg, args)) as Logger
  log.debug = (msg: unknown, ...args: unknown[]) => base('debug', msg, args)
  log.info = (msg: unknown, ...args: unknown[]) => base('info', msg, args)
  log.warning = (msg: unknown, ...args: unknown[]) => base('warn', msg, args)
  log.error = (msg: unknown, ...args: unknown[]) => base('error', msg, args)
  log.extend = (sub: string) => createLog(`${prefix}.${sub}`)
  return log
}

const log = createLog('Main')
export default log
