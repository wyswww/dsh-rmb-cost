# dsh-rmb-cost

DeepSeek Harness 人民币费用估算插件。在对话输入框下方显示当前会话的模型 Token 费用，例如 **估算 ¥0.0123**。

界面仅显示金额，没有三角按钮或弹窗。每次模型请求结算后更新，刷新和历史翻页不会重置统计。支持中文和英文。

> 社区插件，与 DeepSeek 官方无隶属关系。金额根据会话日志用量和配置单价估算，不是官方扣费记录，不能保证与账单完全一致。

## 兼容性

当前版本为 `0.1.2`。基于 DeepSeek Harness `0.2.1-rc.2`、上游提交 `687f282e8625c6b8d11ff58211a90524be2e4317` 开发，声明范围为 `>=0.2.1-rc.2 <0.3.0`。Harness 接口仍在快速迭代，声明范围不代表所有版本都已验证。

用户已在桌面客户端安装并使用费用显示。自动测试覆盖计费及模块注册；尚未完成真实 API 账单对账和所有版本／平台验证。

## 安装：桌面客户端

从本仓库 Releases 下载 `dsh-rmb-cost-0.1.2.tgz`，**无需解压**。如果没有可用 Release，可按下文从源码打包。

先启动桌面客户端一次以初始化配置，再完全退出，包括系统托盘中的程序。必须使用桌面版自带的 `dsh`；普通 npm 安装的 `dsh` 不能管理桌面版配置。

如果已安装桌面版命令，在 PowerShell 执行：

```powershell
dsh plugin --profile desktop add "C:\下载目录\dsh-rmb-cost-0.1.2.tgz"
```

如果没有 `dsh` 命令，可直接使用安装目录里的脚本，将下面的路径替换成实际路径：

```powershell
& "C:\DeepSeek Harness安装目录\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add "C:\下载目录\dsh-rmb-cost-0.1.2.tgz"
```

安装完成后重新打开客户端，进入一个会话即可看到费用。

更新时完全退出客户端，先卸载旧版，再安装新版：

```powershell
dsh plugin --profile desktop remove dsh-rmb-cost
dsh plugin --profile desktop add "C:\下载目录\dsh-rmb-cost-0.1.2.tgz"
```

没有配置 `dsh` 命令时，两行命令均使用上述 `dsh.cmd` 完整路径。卸载只需执行 `remove` 命令，然后重启客户端。

## 安装：Web 版

需要 Node.js 22.19+ 和 npm：

```powershell
npx @deepseek-ai/dsh plugin --profile web add "C:\下载目录\dsh-rmb-cost-0.1.2.tgz"
npx @deepseek-ai/dsh web
```

安装后重启服务并刷新页面。使用其他 profile 时，将 `web` 换成实际名称。

## 从源码打包

下载仓库源码并解压，进入包含 `package.json` 的目录：

```powershell
npm ci --ignore-scripts
npm test
npm pack --ignore-scripts
```

当前目录将生成可直接安装的 `.tgz`。浏览器模块已经预制，不需要额外构建。插件使用 Harness 正式的 `sessionProjections` 和 `conversation.composer.dock` 扩展接口，不修改上游源码，不读取 API Key，不向外部发送会话数据。

## 费用计算

```text
费用（元）=（未缓存输入 Token × 输入单价
           + 缓存命中 Token × 缓存单价
           + 输出 Token × 输出单价）÷ 1,000,000
```

Harness 的 `inputTokens` 已排除缓存命中；思考 Token 已包含在输出中，均不重复计算。金额显示四位小数，非零且小于 `0.0001` 元时显示 `<0.0001`。

默认价格于 **2026-10-21** 核对，来源：[DeepSeek 官方人民币定价](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。单位为元／百万 Token：

| 模型 | 高峰输入 | 高峰缓存命中 | 高峰输出 | 空闲输入 | 空闲缓存命中 | 空闲输出 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Flash | 2 | 0.04 | 8 | 1 | 0.02 | 4 |
| V4 Pro | 9 | 0.30 | 27 | 4.5 | 0.15 | 13.5 |

默认服务商为 `deepseek-official`，模型名和别名见 [pricing.json](./pricing.json)。价格可能变化，请核对官方页面并更新配置。

### 高峰、空闲与节假日

按北京时间周一至周五 09:00–12:00、14:00–18:00 计算高峰，其余时间和周末计算空闲，以请求开始时间选择时段。

**未内置完整的中国法定节假日日历。** 默认 `holidayDates` 为空；只有配置的日期才会强制按空闲计算。周末始终按空闲计算，不会因为调休补班自动按工作日处理。

### 统计范围与误差

统计当前会话完整日志中的模型请求，包括失败／取消尝试和明确重试报告的用量；同一步的替代结算不重复累加。继承的分支历史也会计入，金额不等于分支创建后新增扣费。

不包含独立子会话、未进入当前会话日志的标题生成等调用，以及 Search／Fetch 等按次费用。接口未报告的用量无法还原。未知模型、非配置服务商、无历史价格及单独缓存写入 Token 不会套用猜测的价格。

只能计算部分费用时显示 **已计价 ¥…**，其余情况显示 **估算 ¥…**。界面不展示明细或“计价不完整”提示。跨时段请求、历史调价和官方结算规则均可能造成差异，以官方账单为准。

## 配置

在当前 profile 的 `cordis.patch.yml` 中覆盖 `rmb-cost` 行，修改后重启。文件在 Harness home 的 `profiles/<profile>/` 目录下，桌面版 profile 为 `desktop`，Web 版为 `web`；设置了 `DSH_HOME` 时以该目录为准。

### 节假日

```yaml
- id: rmb-cost
  config:
    period: auto
    holidayDates: ["2026-10-01", "2026-10-02"]
```

上面日期仅为格式示例，请填入对应年份完整的官方节假日列表。`period` 支持 `auto`、`peak`、`offpeak`，后两者对所有请求强制使用指定时段。

### 自定义价格

可覆盖 [pricing.json](./pricing.json) 的顶层字段。未填写的字段使用内置值；数组整体替换，下面示例只保留 Flash 定价：

```yaml
- id: rmb-cost
  config:
    effectiveFrom: "2026-10-21"
    providers: [deepseek-official]
    period: auto
    holidayDates: []
    models:
      - ids: [deepseek-flash, deepseek-v4-flash, deepseek-v4-flash-vision-exp, DeepSeek-V4.1-Flash-1017]
        peak: { input: 2, cacheRead: 0.04, output: 8 }
        offpeak: { input: 1, cacheRead: 0.02, output: 4 }
```

修改配置会使缓存失效，并按新配置重算整个会话。默认 `effectiveFrom` 为 `2026-10-21`，更早请求没有内置历史价格，不计价。仅在确认历史单价适用后调整此日期，目前不支持多次调价的分段价目表。

## 常见问题

**没有费用显示？** 确认安装在实际使用的 profile，重启后进入已有会话；空白首页不会显示。等待一次请求结算后再检查。

**显示“已计价”或金额偏低？** 检查模型名、服务商、请求日期和接口用量是否可用。该金额只包含能够确认用量与单价的部分。

**为什么不直接显示余额变化？** 插件读取会话用量，不读取余额。其他会话、充值和其他收费项目也会影响账户余额。

**安装提示不兼容？** 请核对 Harness 版本，并提交 Issue，附上版本及脱敏报错。不要上传 API Key、账户凭证或私人对话。

## 开发与测试

| 文件 | 用途 |
| --- | --- |
| `index.js` | Host 投影、配置校验与缓存版本 |
| `engine.js` | 纯事件计费逻辑 |
| `client.js` | 仅显示金额的浏览器模块 |
| `pricing.json` | 默认价格与别名 |
| `cordis.patch.yml` | 插件挂载配置 |
| `tests/accounting.test.js` | 计费与模块测试 |

执行 `npm test`。现有 7 项测试覆盖缓存与思考 Token、时间边界、节假日、模型切换、重试、替代结算、未知与历史价格、配置校验、投影和浏览器模块注册。测试不消耗 API 额度，不代表已完成官方账单对账。

## 许可证

[MIT](./LICENSE)。欢迎通过 Issue 或 Pull Request 提出问题及改进。
