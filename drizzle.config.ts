// drizzle-kit 配置
// 运行 `pnpm exec drizzle-kit generate` 生成 SQL 迁移到 src/main/lib/db/migrations
// 运行时 DB 路径由 app.getPath('userData')/bbplayer-desk.db 决定，与此处 url 无关
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/main/lib/db/schema.ts',
  out: './src/main/lib/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: 'bbplayer-desk.db',
  },
})
