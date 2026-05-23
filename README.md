# CryptoTrend

CryptoTrend 是一个 Manifest V3 浏览器扩展，用来在浏览器弹窗中查看加密货币行情。

## 功能

- 默认展示 10 种热门加密货币行情。
- 显示币种名称、符号、美元价格和 24 小时涨跌幅。
- 支持选择 CoinGecko、Binance、OKX、Coinbase 数据源。
- CoinGecko 使用币种 ID；Binance、OKX、Coinbase 使用现货 USDT 交易对。
- 切换交易所数据源时，会重新获取该平台成交额靠前的 10 个 USDT 现货交易对。
- 使用 Chrome/Edge 扩展存储同步配置。

## 本地安装

1. 打开 Chrome 或 Edge 的扩展管理页。
2. 开启开发者模式。
3. 选择“加载已解压的扩展”。
4. 选择本仓库目录：`/Users/rick/src/cryptotrend`。

## 配置币种

打开扩展设置页，选择数据源后按行填写配置。

CoinGecko 使用币种 ID，例如：

```text
bitcoin
ethereum
solana
dogecoin
```

Binance 使用交易对符号，例如：

```text
BTCUSDT
ETHUSDT
SOLUSDT
```

OKX 和 Coinbase 使用带连字符的交易对，例如：

```text
BTC-USDT
ETH-USDT
SOL-USDT
```

保存后，扩展弹窗会按配置列表展示行情。
