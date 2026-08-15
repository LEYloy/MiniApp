const { InlineKeyboard } = require("grammy");

// ============================================================
// Лёгкая капча "реши пример" — защита платёжных сценариев от ботов.
// Один активный экшен на пользователя: пока капча не пройдена (или не истекла),
// новая перезаписывает старую.
// ============================================================
const EMOJI_CAPTCHA_ID = "5341604776101815124"; // 🤖 — ЗАМЕНИ на свой emoji-id

function tgEmojiLocal(id, fallback) {
    return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
}

// userId -> { correct, action }
const pendingCaptcha = new Map();

function generateQuestion() {
    const a = Math.floor(Math.random() * 8) + 1;
    const b = Math.floor(Math.random() * 8) + 1;
    const correct = a + b;

    const options = new Set([correct]);
    while (options.size < 4) {
        const fake = correct + (Math.floor(Math.random() * 9) - 4);
        if (fake > 0 && fake !== correct) options.add(fake);
    }
    return { question: `${a} + ${b} = ?`, correct, options: Array.from(options).sort(() => Math.random() - 0.5) };
}

// Запускает (или перезапускает) капчу для userId, привязанную к конкретному action
// (например "hide_cryptobot" или "donate_rollypay_500"), чтобы после решения
// сразу продолжить нужный платёжный сценарий. backCallback — callback_data кнопки "Назад".
function renderCaptcha(userId, action, backCallback) {
    const { question, correct, options } = generateQuestion();
    pendingCaptcha.set(userId, { correct, action });

    const kb = new InlineKeyboard();
    options.forEach((opt, i) => {
        kb.text(String(opt), `captcha_${opt}`);
        if (i % 2 === 1) kb.row();
    });
    if (options.length % 2 === 1) kb.row();
    kb.text("Назад", backCallback);

    const caption = `${tgEmojiLocal(EMOJI_CAPTCHA_ID, "🤖")}<b>Подтверди, что ты не бот</b>\n\n${question}`;
    return { caption, keyboard: kb };
}

// Возвращает null, если активной капчи нет (истекла/уже пройдена),
// иначе { ok: boolean, action: string }. При верном ответе капча удаляется.
function checkCaptcha(userId, value) {
    const entry = pendingCaptcha.get(userId);
    if (!entry) return null;
    const ok = Number(value) === entry.correct;
    if (ok) pendingCaptcha.delete(userId);
    return { ok, action: entry.action };
}

module.exports = { renderCaptcha, checkCaptcha };
