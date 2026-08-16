const express = require("express");
const crypto = require("crypto");

const { BOT_TOKEN, YOUR_TELEGRAM_ID } = require("./config");
const { HIDE_TARIFFS, getHideTariff } = require("./tariffs");
const { grantHide } = require("./subscriptions");
const {
    createCryptoBotInvoice, checkCryptoBotInvoice,
    createXRocketInvoice, checkXRocketInvoice,
    createRollyPayment, checkRollyPayment,
    ROLLYPAY_SIGNING_SECRET
} = require("./payments");

const PORT = process.env.PORT || 3000;
const app = express();

// ============================================================
// Проверка initData от Telegram Web App (обязательно — иначе кто угодно
// сможет дёрнуть API с чужим telegram_id и получить Premium бесплатно).
// Алгоритм — ровно тот, что описан в официальной доке Telegram:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// ============================================================
function validateInitData(initData) {
    if (!initData) {
        console.warn("⚠️ validateInitData: initData пустой (страница открыта не как Telegram WebApp?)");
        return null;
    }
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) {
        console.warn("⚠️ validateInitData: в initData нет поля hash");
        return null;
    }
    params.delete("hash");

    const dataCheckString = Array.from(params.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const computedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (computedHash !== hash) {
        console.warn("⚠️ validateInitData: подпись не совпала — почти всегда это значит, что BOT_TOKEN в config.js этого сервера НЕ совпадает с реальным токеном бота.");
        console.warn(`   computedHash=${computedHash}`);
        console.warn(`   receivedHash=${hash}`);
        return null;
    }

    // Не даём слишком старым initData (на случай перехвата/повтора) — 24 часа с запасом.
    const authDate = Number(params.get("auth_date")) * 1000;
    if (!authDate || Date.now() - authDate > 24 * 60 * 60 * 1000) {
        console.warn("⚠️ validateInitData: auth_date слишком старый или отсутствует");
        return null;
    }

    const userRaw = params.get("user");
    if (!userRaw) {
        console.warn("⚠️ validateInitData: в initData нет поля user");
        return null;
    }
    try {
        return JSON.parse(userRaw); // { id, first_name, username, ... }
    } catch {
        console.warn("⚠️ validateInitData: не удалось распарсить поле user");
        return null;
    }
}

async function sendTelegramMessage(chatId, text) {
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" })
        });
    } catch (e) {
        console.error("💥 Mini App: не удалось отправить сообщение в чат:", e.message || e);
    }
}

app.use(express.json());
app.use(express.static(__dirname));

// --- Тарифы (чтобы фронтенд не хардкодил цены дважды) ---
app.get("/api/tariffs", (req, res) => {
    res.json({ tariffs: HIDE_TARIFFS });
});

// --- Создать оплату ---
app.post("/api/pay", async (req, res) => {
    const { method, tariffId, initData } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: "invalid_init_data" });

    const tariff = getHideTariff(tariffId);
    if (!tariff) return res.status(400).json({ error: "unknown_tariff" });

    try {
        if (method === "stars") {
            const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/createInvoiceLink`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: `Premium: Скрыть себя (${tariff.label})`,
                    description: `Скрывает тебя от владельцев ботов на ${tariff.days} дней`,
                    payload: `premium_hide_${tariff.days}`,
                    currency: "XTR",
                    prices: [{ label: `Скрыть себя (${tariff.label})`, amount: tariff.priceStars }]
                })
            });
            const data = await r.json();
            if (!data.ok) throw new Error(data.description || "createInvoiceLink failed");
            return res.json({ url: data.result });
        }

        if (method === "cryptobot") {
            const invoice = await createCryptoBotInvoice({
                amount: tariff.priceUsdt,
                asset: "USDT",
                description: `Premium: Скрыть себя (${tariff.label}) — ${user.id}`
            });
            // bot_invoice_url — это t.me/CryptoBot?start=... диплинк: открывает счёт
            // прямо в чате @CryptoBot внутри Telegram, без браузера.
            return res.json({ url: invoice.bot_invoice_url || invoice.mini_app_invoice_url || invoice.pay_url, checkId: String(invoice.invoice_id) });
        }

        if (method === "xrocket") {
            const invoice = await createXRocketInvoice({
                amount: tariff.priceTon,
                currency: "TONCOIN",
                description: `Premium: Скрыть себя (${tariff.label}) — ${user.id}`
            });
            return res.json({ url: invoice.link, checkId: String(invoice.id) });
        }

        if (method === "rollypay") {
            const orderId = `hide_${user.id}_${tariff.days}_${Date.now()}`;
            const payment = await createRollyPayment({
                amount: tariff.priceRub,
                orderId,
                description: `Premium: Скрыть себя (${tariff.label}) — ${user.id}`
            });
            return res.json({ url: payment.pay_url, checkId: payment.payment_id });
        }

        return res.status(400).json({ error: "unknown_method" });
    } catch (err) {
        console.error(`💥 Mini App: не удалось создать оплату (${method}):`, err.message || err);
        return res.status(502).json({ error: "payment_provider_error", message: err.message });
    }
});

// --- Проверить оплату (ручная кнопка "Проверить оплату" в приложении) ---
app.post("/api/check", async (req, res) => {
    const { method, checkId, tariffId, initData } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: "invalid_init_data" });

    const tariff = getHideTariff(tariffId);
    if (!tariff) return res.status(400).json({ error: "unknown_tariff" });

    try {
        let status;
        if (method === "cryptobot") status = await checkCryptoBotInvoice(checkId);
        else if (method === "xrocket") status = await checkXRocketInvoice(checkId);
        else if (method === "rollypay") status = await checkRollyPayment(checkId);
        else return res.status(400).json({ error: "unknown_method" });

        if (status === "paid") {
            grantHide(user.id, tariff.days);
            return res.json({ paid: true });
        }
        return res.json({ paid: false, status });
    } catch (err) {
        console.error(`💥 Mini App: не удалось проверить оплату (${method}):`, err.message || err);
        return res.status(502).json({ error: "payment_provider_error", message: err.message });
    }
});

// ============================================================
// RollyPay callback_url — вставь сюда полный адрес деплоя + /rollypay/webhook
// в личном кабинете RollyPay (см. пояснение в чате).
// ============================================================
app.post("/rollypay/webhook", express.raw({ type: "*/*" }), async (req, res) => {
    if (!ROLLYPAY_SIGNING_SECRET) {
        console.warn("⚠️ ROLLYPAY_SIGNING_SECRET не задан — вебхук отклонён.");
        return res.status(500).end();
    }

    const raw = req.body.toString("utf-8");
    const signature = req.headers["x-signature"];
    const timestamp = req.headers["x-timestamp"];
    if (!signature || !timestamp) return res.status(400).end("missing signature");

    const expected = crypto.createHmac("sha256", ROLLYPAY_SIGNING_SECRET).update(`${timestamp}.${raw}`).digest("hex");
    const sigBuf = Buffer.from(String(signature), "hex");
    const expBuf = Buffer.from(expected, "hex");
    const validSignature = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    if (!validSignature) {
        console.error("💥 RollyPay webhook: неверная подпись X-Signature.");
        return res.status(401).end("invalid signature");
    }

    res.status(200).end("ok"); // отвечаем сразу — RollyPay требует ответ за 10 сек

    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        return;
    }
    if (payload.event_type !== "payment.paid" || payload.status !== "paid") return;

    const { order_id, amount } = payload;
    if (!order_id) return;

    if (order_id.startsWith("hide_")) {
        const parts = order_id.split("_"); // hide_<userId>_<days>_<timestamp>
        const userId = Number(parts[1]);
        const days = Number(parts[2]) || 30;
        if (!userId) return;
        grantHide(userId, days);
        await sendTelegramMessage(userId, "✅ <b>Успешно! Ваша подписка активна!</b>");
        return;
    }

    if (order_id.startsWith("donate_")) {
        const parts = order_id.split("_");
        const userId = Number(parts[1]);
        if (!userId) return;
        await sendTelegramMessage(userId, `✅ Спасибо за донат — ${amount} ₽!`);
        if (userId !== YOUR_TELEGRAM_ID) {
            await sendTelegramMessage(YOUR_TELEGRAM_ID, `💝 Новый донат через СБП: ${amount} ₽ от ${userId}`);
        }
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Mini App запущен на порту ${PORT}`);
    console.log(`   Callback URL для RollyPay: <твой-домен>/rollypay/webhook`);
});
