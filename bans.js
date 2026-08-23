const fs = require("fs");
const path = require("path");

// ============================================================
// Бан пользователей в Mini App (отдельно от блокировки в самом боте) —
// простой JSON-файл на Railway. { [userId]: true }
// ============================================================
const DATA_FILE = path.join(__dirname, "bans-data.json");

function loadData() {
    try {
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
        return {};
    }
}

let banned = loadData();

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(banned, null, 2), "utf-8");
    } catch (e) {
        console.error("💥 Не удалось сохранить bans-data.json:", e.message || e);
    }
}

function isBanned(userId) {
    return !!banned[userId];
}

function ban(userId) {
    banned[userId] = true;
    saveData();
}

function unban(userId) {
    delete banned[userId];
    saveData();
}

module.exports = { isBanned, ban, unban };
