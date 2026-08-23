const express = require("express");
const crypto = require("crypto");

const { BOT_TOKEN, YOUR_TELEGRAM_ID } = require("./config");
const { HIDE_TARIFFS, getHideTariff } = require("./tariffs");
const {
    grantHide, revokeHide, isHidden, isEnabled, setEnabled, getHideExpiry, hasUsedTrial, grantTrial, TRIAL_DURATION_DAYS
} = require("./subscriptions");
const {
    createCryptoBotInvoice, checkCryptoBotInvoice,
    createXRocketInvoice, checkXRocketInvoice,
    createRollyPayment, checkRollyPayment,
    ROLLYPAY_SIGNING_SECRET
} = require("./payments");
const { createPromo, redeemPromo, listPromos } = require("./promocodes");
const { isBanned, ban, unban } = require("./bans");

// Домен этого деплоя — нужен, чтобы кнопки в уведомлениях бота вели сюда же.
// Обнови, если домен на Railway поменяется.
const MINIAPP_URL = "https://miniapp-production-6293.up.railway.app";

// premium-эмодзи для уведомлений об оплате — ЗАМЕНИ на свой emoji-id.
const EMOJI_SUCCESS_ID = "6023773095284707791";
function tgEmoji(id, fallback) {
    return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
}
function daysWord(n) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return "день";
    if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "дня";
    return "дней";
}
// Единый текст + кнопки для любого уведомления об активации Premium
// (оплата любым способом ИЛИ выдача админом) — используется и здесь, и в eto.js.
function buildPremiumNotification(days) {
    const text = `${tgEmoji(EMOJI_SUCCESS_ID, "✅")}<b>Оплата успешно получена!</b>\nВаш Premium ${days} ${daysWord(days)} активен!`;
    const reply_markup = {
        inline_keyboard: [
            [{ text: "🔧 Управлять", web_app: { url: `${MINIAPP_URL}/?screen=profile` } }],
            [{ text: "📱 Mini App", web_app: { url: MINIAPP_URL } }]
        ]
    };
    return { text, reply_markup };
}

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

async function sendTelegramMessage(chatId, text, reply_markup) {
    try {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", reply_markup })
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

// --- Профиль: имя/юзернейм из Telegram + статус подписки + доступен ли триал ---
app.post("/api/status", (req, res) => {
    const { initData } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: "invalid_init_data" });

    const active = isHidden(user.id);
    res.json({
        user: {
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name || null,
            username: user.username || null
        },
        premium: { active, until: getHideExpiry(user.id), enabled: isEnabled(user.id) },
        trialAvailable: !hasUsedTrial(user.id) && !active,
        isAdmin: user.id === YOUR_TELEGRAM_ID,
        isBanned: isBanned(user.id)
    });
});

// Забаненным нельзя платить/включать триал/активировать промокоды/переключать
// тумблер — на все такие действия (initData в теле запроса) вешаем эту проверку.
function blockIfBanned(req, res, next) {
    const user = validateInitData((req.body || {}).initData);
    if (user && isBanned(user.id)) {
        return res.status(403).json({ error: "banned" });
    }
    next();
}
app.post(["/api/pay", "/api/check", "/api/trial", "/api/toggle", "/api/promo/redeem"], blockIfBanned);

// --- Включить/выключить "Скрыть себя" самим пользователем (без изменения срока) ---
app.post("/api/toggle", (req, res) => {
    const { initData, enabled } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: "invalid_init_data" });
    if (!getHideExpiry(user.id)) return res.status(400).json({ error: "no_subscription" });

    setEnabled(user.id, !!enabled);
    res.json({ ok: true, enabled: !!enabled });
});

// --- Промокоды ---

// Создать промокод — только для админа (проверяем через initData, не через
// X-Bot-Token, т.к. это дёргает сама mini app, а не бот).
app.post("/api/promo/create", (req, res) => {
    const { initData, days, maxUses } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: "invalid_init_data" });
    if (user.id !== YOUR_TELEGRAM_ID) return res.status(403).json({ error: "not_admin" });

    const d = Number(days);
    const m = Math.max(1, Number(maxUses) || 1);
    if (!d || d <= 0) return res.status(400).json({ error: "invalid_days" });

    const code = createPromo(d, m);
    res.json({ ok: true, code });
});

// Список созданных промокодов — тоже только для админа.
app.post("/api/promo/list", (req, res) => {
    const { initData } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: "invalid_init_data" });
    if (user.id !== YOUR_TELEGRAM_ID) return res.status(403).json({ error: "not_admin" });
    res.json({ promos: listPromos() });
});

// Активировать промокод — любой пользователь.
app.post("/api/promo/redeem", async (req, res) => {
    const { initData, code } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: "invalid_init_data" });

    const result = redeemPromo(code, user.id);
    if (!result.ok) return res.status(400).json({ error: result.reason });

    grantHide(user.id, result.days);
    const notif = buildPremiumNotification(result.days);
    await sendTelegramMessage(user.id, notif.text, notif.reply_markup);
    res.json({ ok: true, days: result.days });
});

// --- Бесплатный триал (один раз на пользователя) ---
app.post("/api/trial", async (req, res) => {
    const { initData } = req.body || {};
    const user = validateInitData(initData);
    if (!user) return res.status(401).json({ error: "invalid_init_data" });

    const result = grantTrial(user.id);
    if (!result.ok) return res.status(400).json({ error: result.reason });

    const notif = buildPremiumNotification(TRIAL_DURATION_DAYS);
    await sendTelegramMessage(user.id, notif.text, notif.reply_markup);
    res.json({ ok: true, until: result.until });
});

// ============================================================
// Служебное API для бота (eto.js) — бот и Mini App работают на РАЗНЫХ
// серверах (бот локально, Mini App на Railway), поэтому у них два разных
// файла subscriptions-data.json. Чтобы не было рассинхрона, Railway — теперь
// единственный источник правды: бот дёргает эти эндпоинты вместо того, чтобы
// писать в свой локальный файл. Авторизация — токен бота в заголовке
// X-Bot-Token (секрет уже общий для обеих сторон, отдельный ключ не нужен).
// ============================================================
function checkBotAuth(req, res) {
    if (req.headers["x-bot-token"] !== BOT_TOKEN) {
        res.status(403).json({ error: "forbidden" });
        return false;
    }
    return true;
}

app.post("/api/admin/grant", (req, res) => {
    if (!checkBotAuth(req, res)) return;
    const { userId, days } = req.body || {};
    if (!userId || !days) return res.status(400).json({ error: "userId and days required" });
    const until = grantHide(Number(userId), Number(days));
    res.json({ ok: true, until });
});

app.post("/api/admin/revoke", (req, res) => {
    if (!checkBotAuth(req, res)) return;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId required" });
    const ok = revokeHide(Number(userId));
    res.json({ ok });
});

app.get("/api/admin/status", (req, res) => {
    if (!checkBotAuth(req, res)) return;
    const userId = Number(req.query.userId);
    if (!userId) return res.status(400).json({ error: "userId required" });
    res.json({ active: isHidden(userId), until: getHideExpiry(userId), enabled: isEnabled(userId) });
});

app.post("/api/admin/ban", (req, res) => {
    if (!checkBotAuth(req, res)) return;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId required" });
    ban(Number(userId));
    res.json({ ok: true });
});

app.post("/api/admin/unban", (req, res) => {
    if (!checkBotAuth(req, res)) return;
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: "userId required" });
    unban(Number(userId));
    res.json({ ok: true });
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
            const notif = buildPremiumNotification(tariff.days);
            await sendTelegramMessage(user.id, notif.text, notif.reply_markup);
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
        const notif = buildPremiumNotification(days);
        await sendTelegramMessage(userId, notif.text, notif.reply_markup);
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
