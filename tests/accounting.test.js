import assert from 'node:assert/strict'
import { test } from 'node:test'
import { billingPeriod, fold, initialState, priceUsage } from '../engine.js'

const pricing = {
  verifiedOn: '2026-10-21', source: 'https://example.com/', effectiveFrom: '2026-10-21',
  providers: ['deepseek-official', 'deepseek-account'], period: 'auto', holidayDates: [],
  models: [
    { ids: ['deepseek-flash', 'DeepSeek-V4.1-Flash-1017'], peak: { input: 2, cacheRead: 0.04, output: 8 }, offpeak: { input: 1, cacheRead: 0.02, output: 4 } },
    { ids: ['deepseek-v4-pro'], peak: { input: 9, cacheRead: 0.3, output: 27 }, offpeak: { input: 4.5, cacheRead: 0.15, output: 13.5 } },
  ],
}

/** 2026-10-22 22:50 Beijing = Thursday off-peak; 2026-10-22 10:00 = Thursday peak. */
const offpeak = Date.UTC(2026, 9, 22, 14, 50)
const peak = Date.UTC(2026, 9, 22, 2, 0)

test('both built-in DeepSeek providers are priced', () => {
  const usage = { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0 }
  for (const provider of ['deepseek-official', 'deepseek-account', 'DEEPSEEK-ACCOUNT']) {
    const totals = priceUsage(usage, provider, 'deepseek-flash', peak, pricing)
    assert.equal(totals.amount, 2)
    assert.equal(totals.unpricedTokens, 0)
  }
})

test('unknown provider or model stays unpriced instead of reporting zero cost', () => {
  const usage = { inputTokens: 10, cacheReadTokens: 20, outputTokens: 30 }
  for (const [provider, model] of [['relay-x', 'deepseek-flash'], ['deepseek-account', 'deepseek-flash-lite'], ['deepseek-account', '']]) {
    const totals = priceUsage(usage, provider, model, peak, pricing)
    assert.equal(totals.amount, 0)
    assert.equal(totals.unpricedTokens, 60)
  }
})

test('model ids match ignoring case, separators, and numeric build suffixes', () => {
  const usage = { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0 }
  for (const model of ['DeepSeek-Flash', 'deepseek_flash', 'deepseek-flash-1017', 'DeepSeek-V4.1-Flash-1017', 'deepseek-flash.v2']) {
    assert.equal(priceUsage(usage, 'deepseek-account', model, peak, pricing).amount, 2, model)
  }
})

test('peak and off-peak boundaries follow Beijing weekday hours', () => {
  assert.equal(billingPeriod(Date.UTC(2026, 9, 22, 1, 0), pricing), 'peak')
  assert.equal(billingPeriod(Date.UTC(2026, 9, 22, 3, 59), pricing), 'peak')
  assert.equal(billingPeriod(Date.UTC(2026, 9, 22, 4, 0), pricing), 'offpeak')
  assert.equal(billingPeriod(Date.UTC(2026, 9, 22, 6, 0), pricing), 'peak')
  assert.equal(billingPeriod(Date.UTC(2026, 9, 22, 14, 50), pricing), 'offpeak')
  assert.equal(billingPeriod(Date.UTC(2026, 9, 24, 2, 0), pricing), 'offpeak', 'Saturday')
  assert.equal(billingPeriod(peak, { ...pricing, holidayDates: ['2026-10-22'] }), 'offpeak')
})

test('usage excludes cache reads from uncached input and does not bill reasoning twice', () => {
  const totals = priceUsage({ inputTokens: 10, cacheReadTokens: 1_000_000, outputTokens: 500_000 }, 'deepseek-account', 'deepseek-flash', peak, pricing)
  assert.equal(totals.amount, (10 * 2 + 1_000_000 * 0.04 + 500_000 * 8) / 1_000_000)
  assert.equal(totals.input, 10)
  assert.equal(totals.cacheRead, 1_000_000)
  assert.equal(totals.output, 500_000)
})

test('missing usage is reported, and requests before effectiveFrom stay unpriced', () => {
  assert.equal(priceUsage(undefined, 'deepseek-account', 'deepseek-flash', peak, pricing).missingUsage, 1)
  const early = Date.UTC(2026, 9, 20, 2, 0)
  assert.equal(priceUsage({ inputTokens: 10, outputTokens: 10 }, 'deepseek-account', 'deepseek-flash', early, pricing).unpricedTokens, 20)
})

test('a provider switch mid-session keeps pricing later requests', () => {
  const usage = { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0 }
  const header = provider => ({ type: 'request/header', time: peak, data: { header: { config: { provider, model: 'deepseek-flash' } } } })
  const first = fold(fold(fold(initialState(), header('deepseek-official'), pricing), { type: 'step/start', time: peak, data: {} }, pricing),
    { type: 'assistant/message', time: peak, data: { turn: 1, step: 1, usage } }, pricing)
  assert.equal(first.totals.amount, 2)

  const second = fold(fold(fold(first, header('deepseek-account'), pricing), { type: 'step/start', time: peak, data: {} }, pricing),
    { type: 'assistant/message', time: peak, data: { turn: 1, step: 2, usage } }, pricing)
  assert.equal(second.totals.amount, 4)
  assert.equal(second.totals.unpricedTokens, 0)
  assert.equal(second.totals.requests, 2)
})

test('a retried step replaces its earlier settlement instead of doubling it', () => {
  const usage = { inputTokens: 1_000_000, cacheReadTokens: 0, outputTokens: 0 }
  const start = fold(fold(initialState(), { type: 'request/header', time: peak, data: { header: { config: { provider: 'deepseek-account', model: 'deepseek-flash' } } } }, pricing), { type: 'step/start', time: peak, data: {} }, pricing)
  const first = fold(start, { type: 'assistant/attempt', time: peak, data: { turn: 2, step: 3, stream: [{ type: 'chunk', chunk: { type: 'usage', usage } }] } }, pricing)
  const second = fold(first, { type: 'assistant/message', time: peak, data: { turn: 2, step: 3, usage: { ...usage, inputTokens: 500_000 } } }, pricing)
  assert.equal(second.totals.amount, 1)
  assert.equal(second.totals.requests, 1)
})

test('an empty off-peak request keeps the invariant that tokens are never lost', () => {
  const totals = priceUsage({ inputTokens: 0, cacheReadTokens: 0, outputTokens: 0 }, 'deepseek-account', 'deepseek-flash', offpeak, pricing)
  assert.equal(totals.amount, 0)
  assert.equal(totals.requests, 1)
  assert.equal(totals.unpricedTokens, 0)
})
