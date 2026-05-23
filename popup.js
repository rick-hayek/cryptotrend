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

const STORAGE_KEY = "coinIds";
const API_BASE = "https://api.coingecko.com/api/v3";

const marketList = document.querySelector("#marketList");
const emptyState = document.querySelector("#emptyState");
const statusText = document.querySelector("#statusText");
const updatedAt = document.querySelector("#updatedAt");
const refreshButton = document.querySelector("#refreshButton");
const openOptionsButton = document.querySelector("#openOptions");

refreshButton.addEventListener("click", () => loadMarkets({ force: true }));
openOptionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

loadMarkets();

async function loadMarkets() {
  setLoading(true);

  try {
    const coinIds = await getConfiguredCoinIds();
    if (coinIds.length === 0) {
      renderMarkets([]);
      statusText.textContent = "没有配置币种";
      return;
    }

    const markets = await fetchMarkets(coinIds);
    renderMarkets(markets);
    statusText.textContent = `${markets.length} 个币种 · USD`;
    updatedAt.textContent = `更新于 ${new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).format(new Date())}`;
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

async function getConfiguredCoinIds() {
  const result = await chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_COIN_IDS });
  return normalizeCoinIds(result[STORAGE_KEY]);
}

async function fetchMarkets(coinIds) {
  const params = new URLSearchParams({
    vs_currency: "usd",
    ids: coinIds.join(","),
    order: "market_cap_desc",
    per_page: String(Math.max(coinIds.length, 10)),
    page: "1",
    sparkline: "false",
    price_change_percentage: "24h"
  });
  const response = await fetch(`${API_BASE}/coins/markets?${params.toString()}`);

  if (!response.ok) {
    throw new Error(`CoinGecko 返回 ${response.status}`);
  }

  const markets = await response.json();
  const byId = new Map(markets.map((market) => [market.id, market]));
  return coinIds.map((id) => byId.get(id)).filter(Boolean);
}

function renderMarkets(markets) {
  marketList.innerHTML = "";
  emptyState.hidden = markets.length > 0;

  const rows = markets.map((market) => {
    const change = Number(market.price_change_percentage_24h || 0);
    const changeClass = change >= 0 ? "positive" : "negative";
    const changePrefix = change > 0 ? "+" : "";

    return `
      <article class="coin-row">
        <img src="${market.image}" alt="" />
        <div class="coin-name">
          <strong title="${escapeHtml(market.name)}">${escapeHtml(market.name)}</strong>
          <span>${escapeHtml(String(market.symbol).toUpperCase())}</span>
        </div>
        <div class="coin-price">
          <strong>${formatCurrency(market.current_price)}</strong>
          <span class="change ${changeClass}">${changePrefix}${change.toFixed(2)}%</span>
        </div>
      </article>
    `;
  });

  marketList.innerHTML = rows.join("");
}

function setLoading(isLoading) {
  refreshButton.disabled = isLoading;
  refreshButton.textContent = isLoading ? "…" : "↻";
}

function normalizeCoinIds(value) {
  if (!Array.isArray(value)) {
    return DEFAULT_COIN_IDS;
  }

  return [...new Set(value.map((id) => String(id).trim().toLowerCase()).filter(Boolean))];
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
