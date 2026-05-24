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
    itemLabel: "币种列表",
    help: "配置弹窗里显示的 CoinGecko 币种 ID。每行一个，例如 bitcoin、ethereum。",
    defaultItems: DEFAULT_COIN_IDS
  },
  binance: {
    label: "Binance",
    storageKey: "binanceSymbols",
    itemLabel: "USDT 现货交易对",
    help: "配置 Binance 现货 USDT 交易对。每行一个，例如 BTCUSDT 或 BTC/USDT。",
    defaultItems: []
  },
  okx: {
    label: "OKX",
    storageKey: "okxSymbols",
    itemLabel: "USDT 现货交易对",
    help: "配置 OKX 现货 USDT 交易对。每行一个，例如 BTC-USDT 或 BTC/USDT。",
    defaultItems: []
  },
  coinbase: {
    label: "Coinbase",
    storageKey: "coinbaseSymbols",
    itemLabel: "USDT 现货交易对",
    help: "配置 Coinbase 现货 USDT 交易对。每行一个，例如 BTC-USDT 或 BTC/USDT。",
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

const sourceSelect = document.querySelector("#dataSource");
const sourceHelp = document.querySelector("#sourceHelp");
const itemsLabel = document.querySelector("#itemsLabel");
const marketItemsInput = document.querySelector("#marketItems");
const feedback = document.querySelector("#feedback");
const saveButton = document.querySelector("#saveButton");
const resetButton = document.querySelector("#resetButton");
const defaultList = document.querySelector("#defaultList");
const examplesTitle = document.querySelector("#examplesTitle");

let activeSource = "coingecko";
let loadSequence = 0;
const itemDrafts = {};

sourceSelect.addEventListener("change", handleSourceChange);
marketItemsInput.addEventListener("input", handleItemsInput);
saveButton.addEventListener("click", saveItems);
resetButton.addEventListener("click", resetItems);

loadSettings();

async function loadSettings() {
  const result = await chrome.storage.sync.get({
    [SOURCE_KEY]: "coingecko",
    coinIds: DEFAULT_COIN_IDS
  });
  const source = DATA_SOURCES[result[SOURCE_KEY]] ? result[SOURCE_KEY] : "coingecko";
  activeSource = source;
  sourceSelect.value = source;
  await loadItemsForSource(source);
}

async function saveItems() {
  const source = sourceSelect.value;
  const sourceConfig = DATA_SOURCES[source];
  const items = parseItems(itemDrafts[source] ?? marketItemsInput.value, source);

  if (items.length === 0) {
    showFeedback("请至少保留一个行情项。");
    return;
  }

  await chrome.storage.sync.set({
    [SOURCE_KEY]: source,
    [sourceConfig.storageKey]: items
  });
  itemDrafts[source] = items.join("\n");
  marketItemsInput.value = items.join("\n");
  renderDefaultList(source, items);
  showFeedback(`已保存 ${sourceConfig.label} 的 ${items.length} 个行情项。`);
}

async function resetItems() {
  const source = sourceSelect.value;
  const items = await getDefaultItems(source);
  await chrome.storage.sync.set({
    [SOURCE_KEY]: source,
    [DATA_SOURCES[source].storageKey]: items
  });
  itemDrafts[source] = items.join("\n");
  marketItemsInput.value = items.join("\n");
  renderDefaultList(source, items);
  showFeedback(`已恢复 ${DATA_SOURCES[source].label} 默认热门 10 项。`);
}

async function handleSourceChange() {
  itemDrafts[activeSource] = marketItemsInput.value;
  const source = sourceSelect.value;
  await persistItemsForSource(activeSource);
  activeSource = source;
  await chrome.storage.sync.set({ [SOURCE_KEY]: source });
  await loadItemsForSource(source);
}

async function persistItemsForSource(source) {
  const sourceConfig = DATA_SOURCES[source];
  const items = parseItems(itemDrafts[source] ?? marketItemsInput.value, source);
  if (items.length === 0) {
    return;
  }

  await chrome.storage.sync.set({ [sourceConfig.storageKey]: items });
  itemDrafts[source] = items.join("\n");
}

async function loadItemsForSource(source, options = {}) {
  const sequence = ++loadSequence;
  const sourceConfig = DATA_SOURCES[source];
  sourceHelp.textContent = sourceConfig.help;
  itemsLabel.textContent = sourceConfig.itemLabel;
  showFeedback("");

  if (itemDrafts[source] !== undefined) {
    const draftItems = parseItems(itemDrafts[source], source);
    marketItemsInput.value = itemDrafts[source];
    renderDefaultList(source, draftItems);
    return;
  }

  const result = await chrome.storage.sync.get({
    [sourceConfig.storageKey]: sourceConfig.defaultItems
  });
  let items = normalizeItems(result[sourceConfig.storageKey], source);

  if (source !== "coingecko" && (options.refreshExchangeDefaults || items.length === 0)) {
    showFeedback(`正在获取 ${sourceConfig.label} 热门 USDT 交易对...`);
    items = await getDefaultItems(source);
    await chrome.storage.sync.set({ [sourceConfig.storageKey]: items });
    showFeedback(`已加载 ${sourceConfig.label} 热门 USDT 交易对。`);
  }

  if (sequence !== loadSequence || source !== activeSource) {
    return;
  }

  itemDrafts[source] = items.join("\n");
  marketItemsInput.value = items.join("\n");
  renderDefaultList(source, items);
}

function handleItemsInput() {
  itemDrafts[activeSource] = marketItemsInput.value;
}

function parseItems(value, source) {
  const items = normalizeItems(
    value
      .split(/[\n,，\s]+/)
      .map((id) => id.trim())
      .filter(Boolean),
    source
  );

  if (source === "coingecko") {
    return items.map((id) => id.toLowerCase());
  }

  return items.map((item) => normalizePair(item, source));
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

async function getDefaultItems(source) {
  if (source === "coingecko") {
    return DEFAULT_COIN_IDS;
  }

  try {
    if (source === "binance") {
      return await fetchBinanceTopUsdtPairs();
    }

    if (source === "okx") {
      return await fetchOkxTopUsdtPairs();
    }

    if (source === "coinbase") {
      return await fetchCoinbaseTopUsdtPairs();
    }
  } catch (error) {
    showFeedback(`${DATA_SOURCES[source].label} 默认交易对获取失败：${error.message}`);
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
    // Fall through to the public exchange ticker fallback below.
  }

  const tickers = await Promise.all(COINBASE_USDT_CANDIDATES.map(fetchCoinbaseTicker));
  return tickers
    .filter(Boolean)
    .sort((a, b) => Number(b.volume || 0) - Number(a.volume || 0))
    .slice(0, 10)
    .map((ticker) => ticker.productId);
}

async function fetchCoinbaseTicker(productId) {
  const response = await fetch(`https://api.exchange.coinbase.com/products/${productId}/ticker`);
  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return {
    productId,
    price: Number(payload.price),
    volume: Number(payload.volume)
  };
}

function normalizePair(value, source) {
  const cleaned = String(value).trim().toUpperCase();
  if (source === "binance") {
    return cleaned.replace(/[-/]/g, "");
  }

  const withDash = cleaned.replace("/", "-");
  return withDash.includes("-") ? withDash : withDash.replace(/USDT$/, "-USDT");
}

function renderDefaultList(source, items) {
  examplesTitle.textContent =
    source === "coingecko" ? "默认热门 10 种" : `${DATA_SOURCES[source].label} 热门 USDT 交易对`;
  defaultList.innerHTML = items.map((id) => `<li>${id}</li>`).join("");
}

function showFeedback(message) {
  feedback.textContent = message;
}
