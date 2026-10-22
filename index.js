/**
 * Host plugin: the standard projection registry owns replay, caching, and delivery.
 * Pricing covers both built-in DeepSeek providers: an API-key provider and the
 * account provider serve the same official model at the same list price, so a
 * provider switch inside one session must not silently zero the estimate.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { emptyTotals, initialState, fold } from './engine.js'

export const name = 'rmb-cost'
export const inject = ['sessionProjections']
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
})
const rate = z.object({ input: z.number().nonnegative(), cacheRead: z.number().nonnegative(), output: z.number().nonnegative() }).strict()
const pricingSchema = z.object({
  verifiedOn: date, source: z.string().url(), effectiveFrom: date,
  providers: z.array(z.string().min(1)).min(1), period: z.enum(['auto', 'peak', 'offpeak']),
  holidayDates: z.array(date),
  models: z.array(z.object({ ids: z.array(z.string().min(1)).min(1), peak: rate, offpeak: rate }).strict()).min(1),
}).strict().refine(value => {
  const ids = value.models.flatMap(row => row.ids).map(id => id.toLowerCase().replace(/\s+/g, ''))
  return new Set(ids).size === ids.length
}, 'Model ids must be unique')
const totalsSchema = z.object(Object.fromEntries(Object.keys(emptyTotals()).map(key => [key, z.number().nonnegative()])))
const stateSchema = z.object({
  model: z.string(), provider: z.string(), requestTime: z.number().nullable(), totals: totalsSchema,
  last: z.object({ turn: z.number(), step: z.number(), time: z.number(), value: totalsSchema }).nullable(),
})

/** Validate deployment pricing on activation. A changed table invalidates cached estimates. */
export function apply(ctx, config = {}) {
  const defaults = JSON.parse(readFileSync(new URL('./pricing.json', import.meta.url), 'utf8'))
  const pricing = pricingSchema.parse({ ...defaults, ...config })
  const stateVersion = createHash('sha256').update(JSON.stringify(pricing)).digest().readUInt32BE(0)
  ctx.effect(() => ctx.sessionProjections.register({
    key: 'rmbCost', stateVersion, stateSchema,
    init: initialState,
    apply: (state, event) => fold(state, event, pricing),
    wire: { viewSchema: totalsSchema, view: state => state.totals },
  }))
}
