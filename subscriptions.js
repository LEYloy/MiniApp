const fs = require("fs");
const path = require("path");

// ============================================================
// Хранилище подписок пользователей (ключ — их Telegram ID) —
// простой JSON-файл, чтобы всё сохранялось между перезапусками.
// Сейчас поддерживается один тип подписки: "Скрыть себя".
// В будущем сюда же добавится Premium Pro.
// ============================================================
const DATA_FILE = path.join(__dirname, "subscriptions-data.json");

// Длительность подписки "Скрыть себя" в днях по умолчанию — поменяй под себя.
const HIDE_DURATION_DAYS = 30;
// Длительность бесплатного триала — поменяй под себя.
const TRIAL_DURATION_DAYS = 3;

function loadData() {
    try {
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
        return {};
    }
}

// { [userId]: { hideUntil: <timestamp в мс>, trialUsed: true|false } }
let subscriptions = loadData();

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(subscriptions, null, 2), "utf-8");
    } catch (e) {
        console.error("💥 Не удалось сохранить subscriptions-data.json:", e.message || e);
    }
}

function isHidden(userId) {
    const entry = subscriptions[userId];
    if (!entry || !entry.hideUntil) return false;
    return Date.now() < entry.hideUntil;
}

// Если подписка уже активна — продлевает от текущей даты истечения, а не от "сейчас".
function grantHide(userId, days = HIDE_DURATION_DAYS) {
    const now = Date.now();
    const entry = subscriptions[userId] || {};
    const current = entry.hideUntil || now;
    const base = current > now ? current : now;
    subscriptions[userId] = { ...entry, hideUntil: base + days * 24 * 60 * 60 * 1000 };
    saveData();
    return subscriptions[userId].hideUntil;
}

function getHideExpiry(userId) {
    return (subscriptions[userId] && subscriptions[userId].hideUntil) || null;
}

function hasUsedTrial(userId) {
    return !!(subscriptions[userId] && subscriptions[userId].trialUsed);
}

// Выдаёт бесплатный триал один раз на пользователя. Возвращает { ok, until } —
// ok: false, если триал уже использован или подписка уже активна.
function grantTrial(userId, days = TRIAL_DURATION_DAYS) {
    if (hasUsedTrial(userId)) return { ok: false, reason: "already_used" };
    if (isHidden(userId)) return { ok: false, reason: "already_active" };
    const until = grantHide(userId, days);
    subscriptions[userId] = { ...subscriptions[userId], trialUsed: true };
    saveData();
    return { ok: true, until };
}

module.exports = {
    isHidden,
    grantHide,
    getHideExpiry,
    hasUsedTrial,
    grantTrial,
    HIDE_DURATION_DAYS,
    TRIAL_DURATION_DAYS
};
