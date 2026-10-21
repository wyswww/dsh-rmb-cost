/* Prebuilt browser module in Harness's closure-factory format. React is shared with the host UI. */
window.__ModuleLoader__.load({ id: 'dsh-rmb-cost', factory: require => {
  const { createElement: h } = require('react')
  const namespace = 'rmb-cost'
  const dictionaries = {
    zh: { cost: '估算 ¥{amount}', partial: '已计价 ¥{amount}', waiting: '费用统计加载中…' },
    en: { cost: 'Estimate ¥{amount}', partial: 'Priced ¥{amount}', waiting: 'Loading cost…' },
  }
  function CostPill({ useProjection, t }) {
    const value = useProjection('rmbCost')
    if (value === undefined) return h('span', { role: 'status', style: { fontSize: 12 } }, t('waiting'))
    const partial = value.unpricedTokens > 0 || value.missingUsage > 0
    const amount = value.amount === 0 ? '0.0000' : value.amount < 0.0001 ? '<0.0001' : value.amount.toFixed(4)
    return h('span', { style: { fontSize: 12, whiteSpace: 'nowrap' } }, t(partial ? 'partial' : 'cost', { amount }))
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
