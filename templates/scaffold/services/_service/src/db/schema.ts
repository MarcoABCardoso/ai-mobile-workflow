import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id:         uuid('id').primaryKey().defaultRandom(),
  externalId: text('external_id').notNull().unique(),
  createdAt:  timestamp('created_at').defaultNow().notNull(),
})
