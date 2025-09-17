import pino from 'pino'

// Basic server-only pino logger with pretty transport in dev
const isProd = process.env.NODE_ENV === 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  redact: ['req.headers.authorization', 'authorization'],
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:standard' },
      },
})

export function withRequestId(requestId?: string) {
  return requestId ? logger.child({ requestId }) : logger
}

