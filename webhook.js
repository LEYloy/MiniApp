const http = require("http");
const crypto = require("crypto");

// ============================================================
// Приём вебхуков RollyPay (см. https://docs.rollypay.io/api/callbacks/).
//
// ВАЖНО — это нужно один раз настроить руками, код сам этого сделать не может:
// 1. Бот должен быть доступен из интернета по HTTPS. Если ты запускаешь его
//    локально (как сейчас, "node eto.js" на Windows) — у тебя нет публичного
//    адреса. Нужен либо туннель на время тестов (ngrok / Cloudflare Tunnel:
//    "ngrok http 3000" даст https-ссылку), либо перенос бота на VPS/хостинг
//    с доменом и SSL.
// 2. Полученный https-адрес (вида https://xxxx.ngrok-free.app/rollypay/webhook)
//    нужно указать как callback_url в личном кабинете RollyPay
//    (panel.rollypay.io → касса → Настройки → Callback URL).
// Без этих двух шагов вебхук просто никогда не постучится в бота — сколько
// угодно правильного кода тут не поможет, колбэки шлёт RollyPay, а не мы.
//
// Пока это не настроено, оплата всё равно подтверждается — кнопкой
// "✅ Я оплатил" (ручная проверка через GET /payments/{id}), она работает
// уже сейчас без какой-либо настройки. Вебхук просто добавляет автоматику
// поверх этого — подписка/уведомление придут сами, без нажатия кнопки.
// ============================================================

function startRollyPayWebhook({ port, signingSecret, onPaid }) {
    if (!signingSecret) {
        console.warn("⚠️ ROLLYPAY_SIGNING_SECRET не задан в payments.js — вебхук СБП не запущен. Ручная проверка («Я оплатил») продолжает работать.");
        return null;
    }

    const server = http.createServer((req, res) => {
        if (req.method !== "POST" || req.url !== "/rollypay/webhook") {
            res.writeHead(404);
            res.end();
            return;
        }

        let raw = "";
        req.on("data", (chunk) => {
            raw += chunk;
            // защита от переполнения памяти на аномально больших запросах
            if (raw.length > 1_000_000) req.destroy();
        });

        req.on("end", () => {
            try {
                const signature = req.headers["x-signature"];
                const timestamp = req.headers["x-timestamp"];

                if (!signature || !timestamp) {
                    res.writeHead(400);
                    res.end("missing signature");
                    return;
                }

                const expected = crypto
                    .createHmac("sha256", signingSecret)
                    .update(`${timestamp}.${raw}`)
                    .digest("hex");

                const sigBuf = Buffer.from(String(signature), "hex");
                const expBuf = Buffer.from(expected, "hex");
                const validSignature = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);

                if (!validSignature) {
                    console.error("💥 RollyPay webhook: неверная подпись X-Signature — запрос отклонён (проверь ROLLYPAY_SIGNING_SECRET).");
                    res.writeHead(401);
                    res.end("invalid signature");
                    return;
                }

                const payload = JSON.parse(raw);

                // Отвечаем 2xx сразу — RollyPay требует ответ в течение 10 секунд,
                // иначе колбэк будет повторён по политике retry.
                res.writeHead(200, { "Content-Type": "text/plain" });
                res.end("ok");

                if (payload && payload.event_type === "payment.paid" && payload.status === "paid") {
                    Promise.resolve(onPaid(payload)).catch((err) => {
                        console.error("💥 Ошибка обработки вебхука RollyPay:", err.message || err);
                    });
                }
            } catch (err) {
                console.error("💥 RollyPay webhook: ошибка обработки запроса:", err.message || err);
                if (!res.headersSent) {
                    res.writeHead(400);
                    res.end("bad request");
                }
            }
        });

        req.on("error", (err) => {
            console.error("💥 RollyPay webhook: ошибка запроса:", err.message || err);
        });
    });

    server.listen(port, () => {
        console.log(`🌐 RollyPay webhook слушает на http://localhost:${port}/rollypay/webhook`);
        console.log("   Чтобы автопроверка платежей реально заработала — пробрось этот порт наружу");
        console.log("   (например: ngrok http " + port + ") и укажи публичный https-адрес как callback_url");
        console.log("   в личном кабинете RollyPay (panel.rollypay.io → касса → Настройки).");
    });

    server.on("error", (err) => {
        console.error("💥 RollyPay webhook: не удалось запустить сервер:", err.message || err);
    });

    return server;
}

module.exports = { startRollyPayWebhook };
