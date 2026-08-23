const { BOT_TOKEN } = require("./config");
const { MINIAPP_URL } = require("./donate");

// ============================================================
// Бот и Mini App работают на РАЗНЫХ серверах (бот локально, Mini App на
// Railway) — у каждого был свой файл subscriptions-data.json, из-за чего
// админка на боте и профиль в Mini App показывали разные статусы. Теперь
// Railway (miniapp/server.js + subscriptions.js) — единственный источник
// правды: бот всегда спрашивает/командует ЕГО через это API вместо
// локального файла. Авторизация — токен бота в заголовке X-Bot-Token.
// ============================================================

// Убираем завершающий "/" из MINIAPP_URL, чтобы никогда не получить двойной
// слэш вида ".../api/admin/grant" — Express считает это ДРУГИМ путём и
// вернёт 404, даже если сам роут существует и код на сервере правильный.
const BASE_URL = MINIAPP_URL.replace(/\/+$/, "");

console.log(`🔗 premiumClient: Mini App сервер настроен на ${BASE_URL} — сверь этот адрес с реальным доменом на Railway!`);

async function callAdminEndpoint(path, options = {}) {
    const url = `${BASE_URL}${path}`;
    let res;
    try {
        res = await fetch(url, {
            ...options,
            headers: { "Content-Type": "application/json", "X-Bot-Token": BOT_TOKEN, ...(options.headers || {}) }
        });
    } catch (networkErr) {
        // Домен не резолвится / сервер недоступен вообще — печатаем точный URL,
        // чтобы сразу было видно, если это не тот адрес.
        console.error(`💥 premiumClient: не удалось достучаться до ${url}:`, networkErr.message || networkErr);
        throw networkErr;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        // Печатаем ТОЧНЫЙ URL и код ответа — если тут не тот домен/путь,
        // сразу будет видно в консоли бота.
        console.error(`💥 premiumClient: ${res.status} от ${url}`, data ? JSON.stringify(data) : "(без тела ответа)");
        throw new Error((data && data.error) || `HTTP ${res.status} от Mini App API (${url})`);
    }
    return data;
}

async function remoteGrant(userId, days) {
    return callAdminEndpoint("/api/admin/grant", {
        method: "POST",
        body: JSON.stringify({ userId, days })
    });
}

async function remoteRevoke(userId) {
    return callAdminEndpoint("/api/admin/revoke", {
        method: "POST",
        body: JSON.stringify({ userId })
    });
}

async function remoteStatus(userId) {
    return callAdminEndpoint(`/api/admin/status?userId=${userId}`, { method: "GET" });
}

async function remoteBan(userId) {
    return callAdminEndpoint("/api/admin/ban", {
        method: "POST",
        body: JSON.stringify({ userId })
    });
}

async function remoteUnban(userId) {
    return callAdminEndpoint("/api/admin/unban", {
        method: "POST",
        body: JSON.stringify({ userId })
    });
}

// Fail-safe: если Mini App сервер недоступен (упал, сеть легла) — считаем,
// что скрытия нет, чтобы бот не переставал показывать уведомления совсем.
async function remoteIsHidden(userId) {
    try {
        const status = await remoteStatus(userId);
        return !!status.active;
    } catch (err) {
        console.error("💥 premiumClient: не удалось получить статус Premium с Mini App сервера:", err.message || err);
        return false;
    }
}

module.exports = { remoteGrant, remoteRevoke, remoteStatus, remoteIsHidden, remoteBan, remoteUnban };
