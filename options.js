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

const coinIdsInput = document.querySelector("#coinIds");
const feedback = document.querySelector("#feedback");
const saveButton = document.querySelector("#saveButton");
const resetButton = document.querySelector("#resetButton");
const defaultList = document.querySelector("#defaultList");

saveButton.addEventListener("click", saveCoinIds);
resetButton.addEventListener("click", resetCoinIds);

renderDefaultList();
loadCoinIds();

async function loadCoinIds() {
  const result = await chrome.storage.sync.get({ [STORAGE_KEY]: DEFAULT_COIN_IDS });
  coinIdsInput.value = normalizeCoinIds(result[STORAGE_KEY]).join("\n");
}

async function saveCoinIds() {
  const coinIds = parseCoinIds(coinIdsInput.value);

  if (coinIds.length === 0) {
    showFeedback("请至少保留一个币种。");
    return;
  }

  await chrome.storage.sync.set({ [STORAGE_KEY]: coinIds });
  coinIdsInput.value = coinIds.join("\n");
  showFeedback(`已保存 ${coinIds.length} 个币种。`);
}

async function resetCoinIds() {
  await chrome.storage.sync.set({ [STORAGE_KEY]: DEFAULT_COIN_IDS });
  coinIdsInput.value = DEFAULT_COIN_IDS.join("\n");
  showFeedback("已恢复默认热门 10 种。");
}

function parseCoinIds(value) {
  return normalizeCoinIds(
    value
      .split(/[\n,，\s]+/)
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function normalizeCoinIds(value) {
  if (!Array.isArray(value)) {
    return DEFAULT_COIN_IDS;
  }

  return [...new Set(value.map((id) => String(id).trim().toLowerCase()).filter(Boolean))];
}

function renderDefaultList() {
  defaultList.innerHTML = DEFAULT_COIN_IDS.map((id) => `<li>${id}</li>`).join("");
}

function showFeedback(message) {
  feedback.textContent = message;
}
