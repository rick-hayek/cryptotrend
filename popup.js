const DEFAULT_COIN_IDS = [
  "bitcoin",
  "ethereum",
  "tether",
  "binancecoin",
  "solana",
  "ripple",
  "usd-coin",
  "staked-ether",
  "dogecoin",
  "cardano"
];

const DATA_SOURCES = {
  coingecko: {
    label: "CoinGecko",
    storageKey: "coinIds",
    defaultItems: DEFAULT_COIN_IDS
  },
  binance: {
    label: "Binance",
    storageKey: "binanceSymbols",
    defaultItems: []
  },
  okx: {
    label: "OKX",
    storageKey: "okxSymbols",
    defaultItems: []
  },
  coinbase: {
    label: "Coinbase",
    storageKey: "coinbaseSymbols",
    defaultItems: []
  }
};

const COINBASE_USDT_CANDIDATES = [
  "BTC-USDT",
  "ETH-USDT",
  "SOL-USDT",
  "XRP-USDT",
  "DOGE-USDT",
  "ADA-USDT",
  "LINK-USDT",
  "AVAX-USDT",
  "LTC-USDT",
  "BCH-USDT",
  "MATIC-USDT",
  "DOT-USDT",
  "UNI-USDT",
  "AAVE-USDT",
  "ATOM-USDT"
];

const SOURCE_KEY = "dataSource";
const API_BASE = "https://api.coingecko.com/api/v3";
const ICON_BASE_URL = "https://assets.coincap.io/assets/icons";

const marketList = document.querySelector("#marketList");
const emptyState = document.querySelector("#emptyState");
const statusText = document.querySelector("#statusText");
const refreshButton = document.querySelector("#refreshButton");
const openOptionsButton = document.querySelector("#openOptions");

refreshButton.addEventListener("click", () => loadMarkets());
openOptionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
marketList.addEventListener("error", handleImageError, true);

loadMarkets();

async function loadMarkets() {
  setLoading(true);

  try {
    const { source, items } = await getMarketConfig();
    if (items.length === 0) {
      renderMarkets([]);
      statusText.textContent = "没有配置行情";
      return;
    }

    const markets = await fetchMarkets(source, items);
    renderMarkets(markets);
    const updatedAt = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date());
    statusText.textContent = `${DATA_SOURCES[source].label} · ${markets.length} 条行情 · 更新于 ${updatedAt}`;
  } catch (error) {
    marketList.innerHTML = "";
    emptyState.hidden = false;
    statusText.textContent = "行情加载失败";
    emptyState.innerHTML = `
      <strong>无法获取行情</strong>
      <span>${escapeHtml(error.message || "请稍后重试。")}</span>
    `;
  } finally {
    setLoading(false);
  }
}

async function getMarketConfig() {
  const result = await chrome.storage.sync.get({
    [SOURCE_KEY]: "coingecko",
    coinIds: DEFAULT_COIN_IDS,
    binanceSymbols: [],
    okxSymbols: [],
    coinbaseSymbols: []
  });
  const source = DATA_SOURCES[result[SOURCE_KEY]] ? result[SOURCE_KEY] : "coingecko";
  const sourceConfig = DATA_SOURCES[source];
  let items = normalizeItems(result[sourceConfig.storageKey] || sourceConfig.defaultItems, source);

  if (source !== "coingecko" && items.length === 0) {
    items = await fetchDefaultExchangeItems(source);
    await chrome.storage.sync.set({ [sourceConfig.storageKey]: items });
  }

  return {
    source,
    items
  };
}

async function fetchMarkets(source, items) {
  if (source === "coingecko") {
    return fetchCoinGeckoMarkets(items);
  }

  if (source === "binance") {
    return fetchBinanceMarkets(items);
  }

  if (source === "okx") {
    return fetchOkxMarkets(items);
  }

  if (source === "coinbase") {
    return fetchCoinbaseMarkets(items);
  }

  throw new Error("不支持的数据源");
}

async function fetchCoinGeckoMarkets(coinIds) {
  const params = new URLSearchParams({
    vs_currency: "usd",
    ids: coinIds.join(","),
    order: "market_cap_desc",
    per_page: String(Math.max(coinIds.length, 10)),
    page: "1",
    sparkline: "true",
    price_change_percentage: "24h"
  });
  const response = await fetch(`${API_BASE}/coins/markets?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`CoinGecko 返回 ${response.status}`);
  }

  const markets = await response.json();
  const byId = new Map(markets.map((market) => [market.id, market]));
  return coinIds
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((market) => ({
      ...market,
      sparkline: market.sparkline_in_7d?.price?.slice(-24) || []
    }));
}

async function fetchBinanceMarkets(symbols) {
  const response = await fetch("https://api.binance.com/api/v3/ticker/24hr");
  if (!response.ok) {
    throw new Error(`Binance 返回 ${response.status}`);
  }

  const tickers = await response.json();
  const symbolSet = new Set(symbols.map((symbol) => normalizePair(symbol, "binance")));
  const bySymbol = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));

  const markets = [...symbolSet].map((symbol) => bySymbol.get(symbol)).filter(Boolean).map((ticker) => ({
    id: ticker.symbol,
    name: formatBinancePair(ticker.symbol),
    symbol: ticker.symbol,
    image: getPairIconUrl(ticker.symbol),
    current_price: Number(ticker.lastPrice),
    price_change_percentage_24h: Number(ticker.priceChangePercent)
  }));

  return attachSparklines(markets, "binance");
}

async function fetchOkxMarkets(symbols) {
  const response = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT");
  if (!response.ok) {
    throw new Error(`OKX 返回 ${response.status}`);
  }

  const payload = await response.json();
  const symbolSet = new Set(symbols.map((symbol) => normalizePair(symbol, "okx")));
  const bySymbol = new Map((payload.data || []).map((ticker) => [ticker.instId, ticker]));

  const markets = [...symbolSet].map((symbol) => bySymbol.get(symbol)).filter(Boolean).map((ticker) => ({
    id: ticker.instId,
    name: ticker.instId.replace("-", "/"),
    symbol: ticker.instId,
    image: getPairIconUrl(ticker.instId),
    current_price: Number(ticker.last),
    price_change_percentage_24h: calculateChange(ticker.last, ticker.open24h)
  }));

  return attachSparklines(markets, "okx");
}

async function fetchCoinbaseMarkets(productIds) {
  const tickers = await Promise.all(
    productIds.map(async (productId) => {
      const normalizedProductId = normalizePair(productId, "coinbase");
      return fetchCoinbaseTicker(normalizedProductId);
    })
  );

  return attachSparklines(
    tickers.filter((ticker) => ticker && Number.isFinite(ticker.current_price)),
    "coinbase"
  );
}

async function fetchDefaultExchangeItems(source) {
  if (source === "binance") {
    return fetchBinanceTopUsdtPairs();
  }

  if (source === "okx") {
    return fetchOkxTopUsdtPairs();
  }

  if (source === "coinbase") {
    return fetchCoinbaseTopUsdtPairs();
  }

  return [];
}

async function fetchBinanceTopUsdtPairs() {
  const response = await fetch("https://api.binance.com/api/v3/ticker/24hr");
  if (!response.ok) {
    throw new Error(`Binance 返回 ${response.status}`);
  }

  const tickers = await response.json();
  return tickers
    .filter((ticker) => ticker.symbol.endsWith("USDT") && Number(ticker.quoteVolume) > 0)
    .sort((a, b) => Number(b.quoteVolume) - Number(a.quoteVolume))
    .slice(0, 10)
    .map((ticker) => ticker.symbol);
}

async function fetchOkxTopUsdtPairs() {
  const response = await fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT");
  if (!response.ok) {
    throw new Error(`OKX 返回 ${response.status}`);
  }

  const payload = await response.json();
  return (payload.data || [])
    .filter((ticker) => ticker.instId.endsWith("-USDT") && Number(ticker.volCcy24h) > 0)
    .sort((a, b) => Number(b.volCcy24h) - Number(a.volCcy24h))
    .slice(0, 10)
    .map((ticker) => ticker.instId);
}

async function fetchCoinbaseTopUsdtPairs() {
  try {
    const response = await fetch("https://api.coinbase.com/api/v3/brokerage/market/products");
    if (!response.ok) {
      throw new Error(`Coinbase 返回 ${response.status}`);
    }

    const payload = await response.json();
    const products = (payload.products || [])
      .filter((product) => product.quote_currency_id === "USDT" && product.status === "online")
      .sort((a, b) => Number(b.volume_24h || 0) - Number(a.volume_24h || 0))
      .slice(0, 10)
      .map((product) => product.product_id);

    if (products.length > 0) {
      return products;
    }
  } catch {
    // Fall through to public exchange ticker fallback.
  }

  const tickers = await Promise.all(COINBASE_USDT_CANDIDATES.map(fetchCoinbaseFallbackTicker));
  return tickers
    .filter(Boolean)
    .sort((a, b) => Number(b.volume || 0) - Number(a.volume || 0))
    .slice(0, 10)
    .map((ticker) => ticker.productId);
}

async function fetchCoinbaseFallbackTicker(productId) {
  const response = await fetch(`https://api.exchange.coinbase.com/products/${productId}/ticker`);
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return {
    productId,
    volume: Number(payload.volume)
  };
}

async function fetchCoinbaseTicker(productId) {
  const response = await fetch(`https://api.exchange.coinbase.com/products/${productId}/ticker`);
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return {
    id: productId,
    name: productId.replace("-", "/"),
    symbol: productId,
    image: getPairIconUrl(productId),
    current_price: Number(payload.price),
    price_change_percentage_24h: null
  };
}

function renderMarkets(markets) {
  marketList.innerHTML = "";
  emptyState.hidden = markets.length > 0;

  const rows = markets.map((market) => {
    const hasChange =
      market.price_change_percentage_24h !== null &&
      market.price_change_percentage_24h !== undefined &&
      Number.isFinite(Number(market.price_change_percentage_24h));
    const change = hasChange ? Number(market.price_change_percentage_24h) : 0;
    const changeClass = change >= 0 ? "positive" : "negative";
    const changePrefix = change > 0 ? "+" : "";
    const changeText = hasChange ? `${changePrefix}${change.toFixed(2)}%` : "--";

    return `
      <article class="coin-row">
        ${market.image ? `<img src="${market.image}" alt="" data-fallback="${escapeHtml(market.name)}" />` : `<div class="pair-icon">${escapeHtml(getInitials(market.name))}</div>`}
        <div class="coin-name">
          <strong title="${escapeHtml(market.name)}">${escapeHtml(market.name)}</strong>
          <span>${escapeHtml(String(market.symbol).toUpperCase())}</span>
        </div>
        <div class="coin-price">
          <strong>${formatCurrency(market.current_price)}</strong>
          <span class="change ${changeClass}">${changeText}</span>
        </div>
        <div class="sparkline" aria-label="24 小时趋势图">
          ${renderSparkline(market.sparkline || [], change >= 0)}
        </div>
      </article>
    `;
  });

  marketList.innerHTML = rows.join("");
}

async function attachSparklines(markets, source) {
  const sparklineResults = await Promise.all(
    markets.map(async (market) => {
      try {
        return await fetchSparkline(source, market.symbol);
      } catch {
        return [];
      }
    })
  );

  return markets.map((market, index) => ({
    ...market,
    sparkline: sparklineResults[index]
  }));
}

async function fetchSparkline(source, symbol) {
  if (source === "binance") {
    const normalizedSymbol = normalizePair(symbol, "binance");
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${normalizedSymbol}&interval=1h&limit=24`
    );
    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.map((candle) => Number(candle[4])).filter(Number.isFinite);
  }

  if (source === "okx") {
    const instId = normalizePair(symbol, "okx");
    const response = await fetch(
      `https://www.okx.com/api/v5/market/candles?instId=${instId}&bar=1H&limit=24`
    );
    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    return (payload.data || [])
      .slice()
      .reverse()
      .map((candle) => Number(candle[4]))
      .filter(Number.isFinite);
  }

  if (source === "coinbase") {
    const productId = normalizePair(symbol, "coinbase");
    const end = Math.floor(Date.now() / 1000);
    const start = end - 24 * 60 * 60;
    const params = new URLSearchParams({
      granularity: "ONE_HOUR",
      start: String(start),
      end: String(end)
    });
    const response = await fetch(
      `https://api.coinbase.com/api/v3/brokerage/market/products/${productId}/candles?${params.toString()}`
    );
    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    return (payload.candles || [])
      .slice()
      .reverse()
      .map((candle) => Number(candle.close))
      .filter(Number.isFinite);
  }

  return [];
}

function renderSparkline(values, isPositive) {
  const points = normalizeSparklinePoints(values);
  const color = isPositive ? "var(--green)" : "var(--red)";

  if (points.length < 2) {
    return `<svg viewBox="0 0 76 28" role="img" aria-hidden="true"><path d="M2 18 C20 12 34 20 52 13 S68 15 74 10" fill="none" stroke="rgba(143,156,175,.55)" stroke-width="2" stroke-linecap="round"/></svg>`;
  }

  const path = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
  const area = `${path} L74 28 L2 28 Z`;

  return `
    <svg viewBox="0 0 76 28" role="img" aria-hidden="true">
      <path d="${area}" fill="${isPositive ? "rgba(55,211,153,.12)" : "rgba(255,107,122,.12)"}"></path>
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `;
}

function normalizeSparklinePoints(values) {
  const cleanValues = values.map(Number).filter(Number.isFinite);
  if (cleanValues.length < 2) {
    return [];
  }

  const min = Math.min(...cleanValues);
  const max = Math.max(...cleanValues);
  const range = max - min || 1;
  const width = 72;
  const height = 22;

  return cleanValues.map((value, index) => ({
    x: 2 + (index / (cleanValues.length - 1)) * width,
    y: 3 + (1 - (value - min) / range) * height
  }));
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.textContent = isLoading ? "..." : "↻";
}

function normalizeItems(value, source) {
  if (!Array.isArray(value)) {
    return source === "coingecko" ? DEFAULT_COIN_IDS : [];
  }

  const items = value.map((id) => String(id).trim()).filter(Boolean);
  if (source === "coingecko") {
    return [...new Set(items.map((id) => id.toLowerCase()))];
  }

  return [...new Set(items.map((id) => normalizePair(id, source)))];
}

function normalizePair(value, source) {
  const cleaned = String(value).trim().toUpperCase();
  if (source === "binance") {
    return cleaned.replace(/[-/]/g, "");
  }

  const withDash = cleaned.replace("/", "-");
  return withDash.includes("-") ? withDash : withDash.replace(/USDT$/, "-USDT");
}

function formatBinancePair(symbol) {
  return symbol.endsWith("USDT") ? `${symbol.slice(0, -4)}/USDT` : symbol;
}

function getPairIconUrl(pair) {
  const baseSymbol = getBaseSymbol(pair).toLowerCase();
  return `${ICON_BASE_URL}/${baseSymbol}@2x.png`;
}

function getBaseSymbol(pair) {
  const normalized = String(pair).toUpperCase().replace("/", "-");
  if (normalized.includes("-")) {
    return normalized.split("-")[0];
  }

  return normalized.replace(/USDT$/, "");
}

function calculateChange(last, open) {
  const lastPrice = Number(last);
  const openPrice = Number(open);
  if (!Number.isFinite(lastPrice) || !Number.isFinite(openPrice) || openPrice === 0) {
    return 0;
  }

  return ((lastPrice - openPrice) / openPrice) * 100;
}

function getInitials(name) {
  return String(name)
    .split(/[/-]/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function handleImageError(event) {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) {
    return;
  }

  const fallback = document.createElement("div");
  fallback.className = "pair-icon";
  fallback.textContent = getInitials(image.dataset.fallback || "");
  image.replaceWith(fallback);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1 ? 2 : 8
  }).format(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });
}
