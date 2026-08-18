const fs = require("fs");
const path = require("path");

// ============================================================
// Промокоды — простой JSON-файл на Railway (рядом с subscriptions-data.json).
// { [CODE]: { days, maxUses, usedBy: [userId, ...], createdAt } }
// ============================================================
const DATA_FILE = path.join(__dirname, "promocodes-data.json");

function loadData() {
    try {
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
        return {};
    }
}

let codes = loadData();

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(codes, null, 2), "utf-8");
    } catch (e) {
        console.error("💥 Не удалось сохранить promocodes-data.json:", e.message || e);
    }
}

function generateCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без похожих символов (0/O, 1/I)
    let s = "";
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

// Создаёт новый промокод. maxUses — сколько РАЗНЫХ пользователей могут его
// активировать (по умолчанию 1 — одноразовый).
function createPromo(days, maxUses = 1) {
    let code;
    do {
        code = generateCode();
    } while (codes[code]);
    codes[code] = { days, maxUses, usedBy: [], createdAt: Date.now() };
    saveData();
    return code;
}

// Активирует промокод для userId. Возвращает { ok, days } или { ok: false, reason }.
function redeemPromo(rawCode, userId) {
    const code = String(rawCode || "").trim().toUpperCase();
    const entry = codes[code];
    if (!entry) return { ok: false, reason: "not_found" };
    if (entry.usedBy.includes(userId)) return { ok: false, reason: "already_used" };
    if (entry.usedBy.length >= entry.maxUses) return { ok: false, reason: "exhausted" };
    entry.usedBy.push(userId);
    saveData();
    return { ok: true, days: entry.days };
}

function listPromos() {
    return Object.entries(codes).map(([code, e]) => ({ code, ...e }));
}

module.exports = { createPromo, redeemPromo, listPromos };
