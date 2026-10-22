/* Prebuilt browser module in Harness's closure-factory format. React is shared with the host UI. */
window.__ModuleLoader__.load({ id: 'dsh-rmb-cost', factory: require => {
  const { createElement: h } = require('react')
  const namespace = 'rmb-cost'
  const dictionaries = {
    zh: {
      cost: '估算 ¥{amount}',
      partial: '估算 ¥{amount}（部分未计价）',
      waiting: '费用统计加载中…',
      detail: '本对话估算 ¥{amount}\n输入（未命中缓存）{input} · 缓存命中 {cache} · 输出 {output}\n已结算 {requests} 次请求；生成中的用量尚未计入',
    },
    en: {
      cost: 'Estimate ¥{amount}',
      partial: 'Estimate ¥{amount} (partly unpriced)',
      waiting: 'Loading cost…',
      detail: 'Conversation estimate ¥{amount}\nUncached input {input} · cached input {cache} · output {output}\n{requests} settled requests; in-flight usage is pending',
    },
  }
  /* Show only the digits that carry information at this size. */
  function formatAmount(amount) {
    if (!(amount > 0)) return (0).toFixed(4)
    if (amount >= 1) return amount.toFixed(2)
    if (amount >= 0.01) return amount.toFixed(4)
    if (amount >= 0.0001) return amount.toFixed(6)
    return amount.toFixed(8)
  }
  function CostPill({ useProjection, t }) {
    const value = useProjection('rmbCost')
    if (value === undefined) return h('span', { role: 'status', style: { fontSize: 12 } }, t('waiting'))
    const partial = value.unpricedTokens > 0 || value.missingUsage > 0
    const amount = formatAmount(value.amount)
    return h('span', {
      role: 'status',
      title: t('detail', {
        amount, requests: String(value.requests),
        input: value.input.toLocaleString(), cache: value.cacheRead.toLocaleString(), output: value.output.toLocaleString(),
      }),
      style: { fontSize: 12, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', cursor: 'help' },
    }, t(partial ? 'partial' : 'cost', { amount }))
  }
  return {
    name: 'rmb-cost-client', inject: ['slots', 'locale'],
    apply(ctx) {
      ctx.effect(() => ctx.locale.register(namespace, dictionaries))
      ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
        name: 'conversation.composer.dock', id: 'rmb-cost', order: 2, locale: namespace,
      }, CostPill))
    },
  }
} })
