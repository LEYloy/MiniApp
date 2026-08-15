const { InlineKeyboard } = require("grammy");
const { tgEmoji } = require("./menu");
const { HIDE_TARIFFS, getHideTariff } = require("./tariffs");

// ============================================================
// ID кастомных премиум-эмодзи для /donat.
// ЗАМЕНИ значения ниже на свои собственные emoji-id.
// ============================================================
const EMOJI_DONATE_ID = "5375296873982604963";  // 💝 донат владельцу
const EMOJI_PREMIUM_ID = "5258185631355378853"; // 👑 premium
const EMOJI_STAR_ID = "5416115087817615866";    // ⭐ звёзды
const EMOJI_BACK_ID = "5255703720078879038";    // ⬅️ назад
const EMOJI_HIDDEN_ID = "5935757052042285202";  // 🙈 "Скрыть себя"
const EMOJI_CRYPTOBOT_ID = "5361914370068613491"; // 💎 CryptoBot
const EMOJI_XROCKET_ID = "5415897719522744378";    // 🚀 xRocket
const EMOJI_ROLLYPAY_ID = "5296369303661067030";   // 🏦 RollyPay / СБП — ЗАМЕНИ на свой emoji-id
const EMOJI_CHECK_ID = "6023773095284707791";       // ✅ подтверждение оплаты (переиспользует EMOJI_SUCCESS_ID из menu.js — можно заменить на свой)
const EMOJI_WARN_ID = "5309941895345758343";        // ⚠️ ошибка/предупреждение — ЗАМЕНИ на свой emoji-id
const EMOJI_WAIT_ID = "5312016608254762455";        // ⏳ ожидание оплаты — ЗАМЕНИ на свой emoji-id
const EMOJI_PAY_ID = "5253564531842245296";         // 💳 на кнопке "Оплатить" — ЗАМЕНИ на свой emoji-id
const EMOJI_MINIAPP_ID = "5253564531842245296";     // на кнопке "Открыть приложение" — ЗАМЕНИ на свой emoji-id
const EMOJI_POINT_ID = "5231102735817918643";       // 👇 указывает на кнопку mini app — ЗАМЕНИ на свой emoji-id

// ============================================================
// Mini App — Premium теперь покупается через веб-приложение (см. /miniapp).
// ЗАМЕНИ на свой реальный адрес после деплоя на Railway
// (например https://твой-проект-production.up.railway.app).
// ============================================================
const MINIAPP_URL = "https://qweqwrqwrq-production.up.railway.app";

// ============================================================
// Тексты и клавиатуры
// ============================================================
const DONATE_TEXT = `${tgEmoji(EMOJI_DONATE_ID, "💝")}<b>Поддержка проекта</b>\n\nВыбери, что тебе интересно:`;

const donateMenu = new InlineKeyboard()
    .text("Донат владельцу", "donate_owner")
    .icon(EMOJI_DONATE_ID)
    .row()
    .text("Premium", "donate_premium")
    .icon(EMOJI_PREMIUM_ID);

// ------------------------------------------------------------
// "Донат владельцу" — сначала выбор способа оплаты: Stars (ссылкой),
// CryptoBot и xRocket (оба — инвойсом в USDT, как и "Скрыть себя").
// ------------------------------------------------------------
const DONATE_OWNER_TEXT = `${tgEmoji(EMOJI_DONATE_ID, "💝")}<b>Донат владельцу</b>\n\nВыбери способ оплаты:`;

const donateOwnerMethodMenu = new InlineKeyboard()
    .text("Telegram Stars", "donate_owner_stars")
    .icon(EMOJI_STAR_ID)
    .success()
    .row()
    .text("CryptoBot (USDT)", "donate_owner_cryptobot")
    .icon(EMOJI_CRYPTOBOT_ID)
    .success()
    .row()
    .text("xRocket (USDT)", "donate_owner_xrocket")
    .icon(EMOJI_XROCKET_ID)
    .success()
    .row()
    .text("СБП (RollyPay)", "donate_owner_rollypay")
    .icon(EMOJI_ROLLYPAY_ID)
    .success()
    .row()
    .text("Назад", "donate_back")
    .icon(EMOJI_BACK_ID)
    .danger();

// --- Stars — сумма выбирается кнопкой, а сама ссылка на оплату генерируется
// на лету через Bot API (createInvoiceLink), см. eto.js. Никаких статичных ссылок.
const DONATE_STAR_AMOUNTS = [50, 100, 250, 500];

const DONATE_STARS_TEXT = `${tgEmoji(EMOJI_STAR_ID, "⭐")}<b>Донат звёздами</b>\n\nВыбери сумму:`;

const starsMenu = (() => {
    const kb = new InlineKeyboard();
    DONATE_STAR_AMOUNTS.forEach((amount, i) => {
        kb.text(`${amount}`, `donate_stars_${amount}`).icon(EMOJI_STAR_ID).success();
        if (i % 2 === 1) kb.row();
    });
    if (DONATE_STAR_AMOUNTS.length % 2 === 1) kb.row();
    kb.text("Назад", "donate_owner").icon(EMOJI_BACK_ID).danger();
    return kb;
})();

// --- CryptoBot / xRocket — фиксированные суммы в USDT ---
const DONATE_USDT_AMOUNTS = [1, 3, 5, 10];

const DONATE_CRYPTOBOT_TEXT = `${tgEmoji(EMOJI_CRYPTOBOT_ID, "💎")}<b>Донат через CryptoBot</b>\n\nВыбери сумму (USDT):`;

const cryptobotAmountMenu = (() => {
    const kb = new InlineKeyboard();
    DONATE_USDT_AMOUNTS.forEach((amount, i) => {
        kb.text(`${amount} USDT`, `donate_cryptobot_${amount}`).icon(EMOJI_CRYPTOBOT_ID).success();
        if (i % 2 === 1) kb.row();
    });
    if (DONATE_USDT_AMOUNTS.length % 2 === 1) kb.row();
    kb.text("Назад", "donate_owner").icon(EMOJI_BACK_ID).danger();
    return kb;
})();

const DONATE_XROCKET_TEXT = `${tgEmoji(EMOJI_XROCKET_ID, "🚀")}<b>Донат через xRocket</b>\n\nВыбери сумму (USDT):`;

const xrocketAmountMenu = (() => {
    const kb = new InlineKeyboard();
    DONATE_USDT_AMOUNTS.forEach((amount, i) => {
        kb.text(`${amount} USDT`, `donate_xrocket_${amount}`).icon(EMOJI_XROCKET_ID).success();
        if (i % 2 === 1) kb.row();
    });
    if (DONATE_USDT_AMOUNTS.length % 2 === 1) kb.row();
    kb.text("Назад", "donate_owner").icon(EMOJI_BACK_ID).danger();
    return kb;
})();

// --- RollyPay / СБП — фиксированные суммы в рублях ---
const DONATE_RUB_AMOUNTS = [100, 300, 500, 1000];

const DONATE_ROLLYPAY_TEXT = `${tgEmoji(EMOJI_ROLLYPAY_ID, "🏦")}<b>Донат через СБП</b>\n\nВыбери сумму (₽):`;

const rollypayAmountMenu = (() => {
    const kb = new InlineKeyboard();
    DONATE_RUB_AMOUNTS.forEach((amount, i) => {
        kb.text(`${amount} ₽`, `donate_rollypay_${amount}`).icon(EMOJI_ROLLYPAY_ID).success();
        if (i % 2 === 1) kb.row();
    });
    if (DONATE_RUB_AMOUNTS.length % 2 === 1) kb.row();
    kb.text("Назад", "donate_owner").icon(EMOJI_BACK_ID).danger();
    return kb;
})();

// ------------------------------------------------------------
// Premium — теперь покупается через Mini App (см. /miniapp/public/index.html).
// ------------------------------------------------------------
const PREMIUM_TEXT = `${tgEmoji(EMOJI_PREMIUM_ID, "👑")}<b>Premium-подписка</b>\n\nPremium подписку можно купить через mini app по кнопке ниже ${tgEmoji(EMOJI_POINT_ID, "👇")}`;

const premiumMenu = new InlineKeyboard()
    .webApp("Открыть приложение", MINIAPP_URL)
    .icon(EMOJI_MINIAPP_ID)
    .primary()
    .row()
    .text("Назад", "donate_back")
    .icon(EMOJI_BACK_ID)
    .danger();

// Ниже — старый инлайн-флоу тарифов/оплаты "Скрыть себя" внутри чата.
// Больше никуда не ведёт (кнопка "Скрыть себя" убрана из premiumMenu выше —
// теперь эта функциональность живёт в mini app), но код и хендлеры в eto.js
// оставлены рабочими про запас — не мешает, ничего удалять не пришлось.
const HIDE_TARIFF_TEXT = `${tgEmoji(EMOJI_HIDDEN_ID, "🙈")}<b>Скрыть себя</b>\n\nПока подписка активна, владельцы бизнес-ботов этого сервиса не увидят твоё имя, юзернейм и содержимое сообщений — вместо этого им придёт уведомление, что у собеседника подключен Premium.\n\nВыбери срок подписки:`;

const hideTariffMenu = (() => {
    const kb = new InlineKeyboard();
    HIDE_TARIFFS.forEach((t) => {
        kb.text(`${t.label} — от ${t.priceRub} ₽`, `hide_tariff_${t.id}`).icon(EMOJI_HIDDEN_ID).row();
    });
    kb.text("Назад", "donate_premium_back").icon(EMOJI_BACK_ID).danger();
    return kb;
})();

// Способ оплаты для конкретного тарифа — строится динамически, т.к. цена
// зависит от выбранного срока.
function hideMethodTextFor(tariff) {
    return `${tgEmoji(EMOJI_HIDDEN_ID, "🙈")}<b>Скрыть себя — ${tariff.label}</b>\n\nВыбери способ оплаты:`;
}

function hideMethodMenuFor(tariff) {
    return new InlineKeyboard()
        .text(`Telegram Stars — ${tariff.priceStars}`, `hide_pay_stars_${tariff.id}`)
        .icon(EMOJI_STAR_ID)
        .success()
        .row()
        .text(`CryptoBot — ${tariff.priceUsdt} USDT`, `hide_pay_cryptobot_${tariff.id}`)
        .icon(EMOJI_CRYPTOBOT_ID)
        .success()
        .row()
        .text(`xRocket — ${tariff.priceTon} TON`, `hide_pay_xrocket_${tariff.id}`)
        .icon(EMOJI_XROCKET_ID)
        .success()
        .row()
        .text(`СБП — ${tariff.priceRub} ₽`, `hide_pay_rollypay_${tariff.id}`)
        .icon(EMOJI_ROLLYPAY_ID)
        .success()
        .row()
        .text("Назад", "open_hide_menu")
        .icon(EMOJI_BACK_ID)
        .danger();
}

module.exports = {
    DONATE_TEXT,
    donateMenu,
    DONATE_OWNER_TEXT,
    donateOwnerMethodMenu,
    DONATE_STARS_TEXT,
    starsMenu,
    DONATE_STAR_AMOUNTS,
    DONATE_USDT_AMOUNTS,
    DONATE_RUB_AMOUNTS,
    DONATE_CRYPTOBOT_TEXT,
    cryptobotAmountMenu,
    DONATE_XROCKET_TEXT,
    xrocketAmountMenu,
    DONATE_ROLLYPAY_TEXT,
    rollypayAmountMenu,
    PREMIUM_TEXT,
    premiumMenu,
    HIDE_TARIFFS,
    getHideTariff,
    HIDE_TARIFF_TEXT,
    hideTariffMenu,
    hideMethodTextFor,
    hideMethodMenuFor,
    EMOJI_DONATE_ID,
    EMOJI_PREMIUM_ID,
    EMOJI_STAR_ID,
    EMOJI_BACK_ID,
    EMOJI_HIDDEN_ID,
    EMOJI_CRYPTOBOT_ID,
    EMOJI_XROCKET_ID,
    EMOJI_ROLLYPAY_ID,
    EMOJI_CHECK_ID,
    EMOJI_WARN_ID,
    EMOJI_WAIT_ID,
    EMOJI_PAY_ID,
    EMOJI_MINIAPP_ID,
    EMOJI_POINT_ID,
    MINIAPP_URL
};
