/** Pure accounting over durable Harness events; no requests, timers, or file writes. */
export const emptyTotals = () => ({ amount: 0, input: 0, cacheRead: 0, output: 0, unpricedTokens: 0, missingUsage: 0, requests: 0 })

/** Start one whole-session fold. Copied fork history is included, like tokenUsage. */
export const initialState = () => ({ model: '', provider: '', requestTime: null, last: null, totals: emptyTotals() })

/** Select the official Beijing schedule; configured holidays always use off-peak. */
export function billingPeriod(time, pricing) {
  if (pricing.period !== 'auto') return pricing.period
  const local = new Date(time + 8 * 3600_000)
  const date = local.toISOString().slice(0, 10)
  const day = local.getUTCDay()
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes()
  return day !== 0 && day !== 6 && !pricing.holidayDates.includes(date)
    && ((minute >= 540 && minute < 720) || (minute >= 840 && minute < 1080)) ? 'peak' : 'offpeak'
}

/** Match an explicitly configured provider/model; unknown prices never become zero-cost claims. */
export function priceUsage(usage, provider, model, time, pricing) {
  const totals = emptyTotals()
  totals.requests = 1
  if (usage === undefined) return { ...totals, missingUsage: 1 }
  totals.input = usage.inputTokens
  totals.cacheRead = usage.cacheReadTokens ?? 0
  totals.output = usage.outputTokens
  const writes = usage.cacheWriteTokens ?? 0
  const rate = pricing.providers.includes(provider)
    ? pricing.models.find(row => row.ids.includes(model))?.[billingPeriod(time, pricing)] : undefined
  const validDate = new Date(time + 8 * 3600_000).toISOString().slice(0, 10) >= pricing.effectiveFrom
  if (rate === undefined || !validDate) {
    totals.unpricedTokens = totals.input + totals.cacheRead + totals.output + writes
  } else {
    // Harness inputTokens excludes cache reads. Reasoning is already in outputTokens.
    totals.amount = (totals.input * rate.input + totals.cacheRead * rate.cacheRead + totals.output * rate.output) / 1_000_000
    // DeepSeek has no separate cache-write rate; do not invent one for other adapters.
    totals.unpricedTokens = writes
  }
  return totals
}

/** Last authoritative usage sample of one settled attempt, matching token-meter semantics. */
function usageOf(event) {
  if (event.type === 'assistant/message' && event.data.usage !== undefined) return event.data.usage
  for (let i = event.data.stream.length - 1; i >= 0; --i) {
    const record = event.data.stream[i]
    if (record.type === 'chunk' && record.chunk.type === 'usage') return record.chunk.usage
  }
}

/** Fold complete logs, including failed attempts and explicit retries, without double counting settlements. */
export function fold(state, event, pricing) {
  if (event.type === 'request/header') return { ...state, model: event.data.header.config.model, provider: event.data.header.config.provider }
  if (event.type === 'step/start') return { ...state, requestTime: event.time }
  if (event.type === 'llm/retry-started') return { ...state, last: null, requestTime: event.time }
  if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return state
  const { turn, step } = event.data
  const same = state.last !== null && state.last.turn === turn && state.last.step === step
  const time = same ? state.last.time : state.requestTime ?? event.time
  const value = priceUsage(usageOf(event), state.provider, state.model, time, pricing)
  const totals = Object.fromEntries(Object.keys(value).map(key => [key, state.totals[key] - (same ? state.last.value[key] : 0) + value[key]]))
  // Floating point cancellation may leave a negligible negative remainder.
  totals.amount = Math.max(0, totals.amount)
  return { ...state, totals, last: { turn, step, time, value } }
}
