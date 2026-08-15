const { XRocketPayClient } = require("xrocket-pay-api-sdk");
const crypto = require("crypto");

// ============================================================
// Токены платёжных систем.
// ЗАМЕНИ значения ниже на свои собственные (получить: открой @CryptoBot
// или @xRocket в Telegram → Pay/Crypto Pay → Create App → API Token;
// для RollyPay — оставь заявку на подключение, ключ придёт напрямую).
// Без токена соответствующий способ оплаты просто не будет работать
// (createInvoice выбросит понятную ошибку, бот при этом не упадёт).
// ============================================================
const CRYPTOBOT_API_TOKEN = "620306:AA7zrmfoHeYuxJ0DAWFvADUArYu1qhIFjJY"; // ⚠️ вставь токен из @CryptoBot
const XROCKET_API_TOKEN = "621bf8212f69ff9ed3f98a3f4";   // ⚠️ вставь токен из @xRocket
const ROLLYPAY_API_KEY = "vcf5LatKsPJMyc57iKiC3M3Dt68lEcOnO-e4_RQ8ECg";    // API-ключ (заголовок X-API-Key) — Личный кабинет (panel.rollypay.io) → Интеграция → «API-КЛЮЧ»
const ROLLYPAY_TERMINAL_ID = "355e3c8e-ad33-4eed-96f5-092d072c0d11"; // ID кассы "DeadOfMessageBot" — Личный кабинет → Интеграция → «TERMINAL ID»
// Секрет подписи вебхуков (заголовок X-Signature) — Личный кабинет → Интеграция → «СЕКРЕТ ПОДПИСИ ВЕБХУКОВ».
// Нужен только для автопроверки платежей через Callback URL, см. webhook.js.
const ROLLYPAY_SIGNING_SECRET = "GqW_Gw2mBguG5cvDXwVWlSgYpYkOqcjqv8pLWeG-Lzo";

const CRYPTOBOT_API_BASE = "https://pay.crypt.bot/api/";
// Официальная документация (docs.rollypay.io/api/overview) прямым текстом
// указывает: "Production: https://rollypay.io" — БЕЗ поддомена api. Хост с
// поддоменом (api.rollypay.io) в документации не встречается ни разу и,
// скорее всего, просто не существует — не меняй это без прямого
// подтверждения от поддержки RollyPay.
const ROLLYPAY_API_BASE = "https://rollypay.io/api/v1";

const xrocketClient = new XRocketPayClient({ apiKey: XROCKET_API_TOKEN });

// ---------- CryptoBot (Crypto Pay API, https://help.crypt.bot/crypto-pay-api) ----------

async function createCryptoBotInvoice({ amount, asset = "USDT", description }) {
    if (!CRYPTOBOT_API_TOKEN) throw new Error("Не задан CRYPTOBOT_API_TOKEN в payments.js");
    const res = await fetch(CRYPTOBOT_API_BASE + "createInvoice", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Crypto-Pay-API-Token": CRYPTOBOT_API_TOKEN
        },
        body: JSON.stringify({ asset, amount: String(amount), description })
    });
    const data = await res.json();
    if (!data.ok) throw new Error((data.error && data.error.name) || "CryptoBot: не удалось создать инвойс");
    return data.result; // { invoice_id, web_app_invoice_url, bot_invoice_url, pay_url, status, ... }
}

async function checkCryptoBotInvoice(invoiceId) {
    if (!CRYPTOBOT_API_TOKEN) throw new Error("Не задан CRYPTOBOT_API_TOKEN в payments.js");
    const res = await fetch(`${CRYPTOBOT_API_BASE}getInvoices?invoice_ids=${invoiceId}`, {
        headers: { "Crypto-Pay-API-Token": CRYPTOBOT_API_TOKEN }
    });
    const data = await res.json();
    if (!data.ok) throw new Error((data.error && data.error.name) || "CryptoBot: не удалось проверить инвойс");
    const invoice = data.result.items && data.result.items[0];
    return invoice ? invoice.status : null; // "active" | "paid" | "expired"
}

// ---------- xRocket (Rocket Pay API, https://pay.xrocket.tg/api/) ----------

async function createXRocketInvoice({ amount, currency = "TONCOIN", description }) {
    if (!XROCKET_API_TOKEN) throw new Error("Не задан XROCKET_API_TOKEN в payments.js");
    const res = await xrocketClient.createInvoice({ amount, currency, description, numPayments: 1 });
    return res.data; // { id, link, status, ... }
}

async function checkXRocketInvoice(invoiceId) {
    if (!XROCKET_API_TOKEN) throw new Error("Не задан XROCKET_API_TOKEN в payments.js");
    const res = await xrocketClient.getInvoice(String(invoiceId));
    return res.data.status; // "active" | "paid" | "expired"
}

// ---------- RollyPay / СБП (https://docs.rollypay.io/) ----------
// Приём рублёвых платежей (СБП). Оплата — редирект клиента на pay_url.
// Вебхука (callback_url) здесь не поднимаем, т.к. бот работает без своего
// HTTP-сервера (long polling) — вместо этого статус опрашивается по запросу,
// как и с CryptoBot/xRocket ("Я оплатил" -> GET /payments/{id}).

async function createRollyPayment({ amount, orderId, description }) {
    if (!ROLLYPAY_API_KEY) throw new Error("Не задан ROLLYPAY_API_KEY в payments.js");
    const res = await fetch(`${ROLLYPAY_API_BASE}/payments`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": ROLLYPAY_API_KEY,
            "X-Nonce": crypto.randomUUID()
        },
        body: JSON.stringify({
            amount: String(amount),
            payment_currency: "RUB",
            payment_method: "sbp",
            order_id: orderId,
            terminal_id: ROLLYPAY_TERMINAL_ID,
            description
        })
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        console.error(`💥 RollyPay createPayment — HTTP ${res.status}:`, JSON.stringify(data));
        throw new Error((data && (data.message || data.error)) || `RollyPay: не удалось создать платёж (HTTP ${res.status})`);
    }
    return data; // { payment_id, pay_url, status, amount, ... }
}

async function checkRollyPayment(paymentId) {
    if (!ROLLYPAY_API_KEY) throw new Error("Не задан ROLLYPAY_API_KEY в payments.js");
    const res = await fetch(`${ROLLYPAY_API_BASE}/payments/${paymentId}`, {
        headers: {
            "X-API-Key": ROLLYPAY_API_KEY,
            "X-Nonce": crypto.randomUUID()
        }
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        console.error(`💥 RollyPay getPayment — HTTP ${res.status}:`, JSON.stringify(data));
        throw new Error((data && (data.message || data.error)) || `RollyPay: не удалось проверить платёж (HTTP ${res.status})`);
    }
    return data.status; // created | processing | paid | expired | canceled | chargeback | refunded
}

module.exports = {
    createCryptoBotInvoice,
    checkCryptoBotInvoice,
    createXRocketInvoice,
    checkXRocketInvoice,
    createRollyPayment,
    checkRollyPayment,
    ROLLYPAY_SIGNING_SECRET
};
