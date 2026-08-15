const fs = require("fs");
const path = require("path");

// ============================================================
// Хранилище подписок пользователей (ключ — их Telegram ID) —
// простой JSON-файл, чтобы всё сохранялось между перезапусками.
// Сейчас поддерживается один тип подписки: "Скрыть себя".
// В будущем сюда же добавится Premium Pro.
// ============================================================
const DATA_FILE = path.join(__dirname, "subscriptions-data.json");

// Длительность подписки "Скрыть себя" в днях — поменяй под себя.
const HIDE_DURATION_DAYS = 30;

function loadData() {
    try {
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
        return {};
    }
}

// { [userId]: { hideUntil: <timestamp в мс> } }
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
    const current = (subscriptions[userId] && subscriptions[userId].hideUntil) || now;
    const base = current > now ? current : now;
    subscriptions[userId] = { hideUntil: base + days * 24 * 60 * 60 * 1000 };
    saveData();
    return subscriptions[userId].hideUntil;
}

function getHideExpiry(userId) {
    return (subscriptions[userId] && subscriptions[userId].hideUntil) || null;
}

module.exports = { isHidden, grantHide, getHideExpiry, HIDE_DURATION_DAYS };
