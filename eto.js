const { Bot, InlineKeyboard } = require("grammy");
const db = require("./database");
const {
    startMenu, settingsMenu, getUserSettings, START_TEXT, START_TEXT_FALLBACK, SETTINGS_TEXT, START_MENU_CALLBACK,
    tgEmoji, infoMenu, INFO_TEXT,
    EMOJI_NEW_MSG_ID, EMOJI_EDIT_MSG_ID, EMOJI_DEL_MSG_ID, EMOJI_SENDER_ID, EMOJI_TEXT_ID,
    EMOJI_PHOTO_ID, EMOJI_VIDEO_ID, EMOJI_VOICE_ID, EMOJI_DOC_ID, EMOJI_SUCCESS_ID
} = require("./menu");
const {
    adminMenu, ADMIN_TEXT,
    isBlocked, blockUser, unblockUser,
    getDesignImage, setDesignImage, clearDesignImage,
    setAdminState, getAdminState, clearAdminState
} = require("./admin");
const {
    DONATE_TEXT, donateMenu, DONATE_OWNER_TEXT, donateOwnerMethodMenu,
    DONATE_STARS_TEXT, starsMenu,
    DONATE_CRYPTOBOT_TEXT, cryptobotAmountMenu,
    DONATE_XROCKET_TEXT, xrocketAmountMenu,
    DONATE_ROLLYPAY_TEXT, rollypayAmountMenu,
    PREMIUM_TEXT, premiumMenu,
    HIDE_TARIFFS, getHideTariff, HIDE_TARIFF_TEXT, hideTariffMenu, hideMethodTextFor, hideMethodMenuFor,
    EMOJI_DONATE_ID, EMOJI_HIDDEN_ID, EMOJI_CRYPTOBOT_ID, EMOJI_XROCKET_ID, EMOJI_ROLLYPAY_ID, EMOJI_WAIT_ID
} = require("./donate");
const { isHidden, grantHide } = require("./subscriptions");
const {
    createCryptoBotInvoice, checkCryptoBotInvoice,
    createXRocketInvoice, checkXRocketInvoice,
    createRollyPayment, checkRollyPayment,
    ROLLYPAY_SIGNING_SECRET
} = require("./payments");
const { startRollyPayWebhook } = require("./webhook");

// =============================================================
// Токен и Telegram ID владельца — общий конфиг для бота и mini app (config.js)
// =============================================================
const { BOT_TOKEN, YOUR_TELEGRAM_ID } = require("./config");
// =============================================================

if (!BOT_TOKEN || BOT_TOKEN.includes("СЮДА_ВСТАВЬ")) {
    console.error("❌ Ошибка: Вставьте токен бота в config.js!");
    process.exit(1);
}

const bot = new Bot(BOT_TOKEN);

bot.catch((err) => {
    console.error("💥 ОШИБКА ВНУТРИ БОТА:", err.error?.description || err.error?.message || err.error || err);
});

let botAccessStatus = "close";
const registeredUsers = new Set([YOUR_TELEGRAM_ID]);

async function broadcast(sendCallback) {
    if (botAccessStatus === "close") {
        try { await sendCallback(YOUR_TELEGRAM_ID); } catch (e) {}
    } else {
        for (const userId of registeredUsers) {
            try { await sendCallback(userId); } catch (e) {}
        }
    }
}

bot.use(settingsMenu);
bot.use(adminMenu);

// Отправка главного меню — если в дизайне задана картинка, шлём её с подписью START_TEXT,
// иначе просто текстовое сообщение, как раньше.
async function sendStartMenu(ctx) {
    const image = getDesignImage();
    try {
        if (image) {
            await ctx.replyWithPhoto(image, {
                caption: START_TEXT,
                parse_mode: "HTML",
                reply_markup: startMenu
            });
        } else {
            await ctx.reply(START_TEXT, {
                parse_mode: "HTML",
                reply_markup: startMenu
            });
        }
    } catch (err) {
        console.error("💥 Не удалось отправить приветствие с премиум-эмодзи/картинкой:", err.description || err.message || err);
        // Фолбэк: отправляем без премиум-эмодзи и без картинки, чтобы бот хотя бы ответил
        await ctx.reply(START_TEXT_FALLBACK, {
            reply_markup: startMenu
        });
    }
}

// Универсальная замена текста/подписи меню: если исходное сообщение — фото
// (например, картинка дизайна на /start), нужно редактировать caption, а не text.
async function editMenuMessage(ctx, text, keyboard) {
    if (ctx.msg && ctx.msg.photo) {
        await ctx.editMessageCaption({
            caption: text,
            parse_mode: "HTML",
            reply_markup: keyboard
        });
    } else {
        await ctx.editMessageText(text, {
            parse_mode: "HTML",
            reply_markup: keyboard
        });
    }
}

// Текст успешной оплаты подписки — окно оплаты (кнопки "Оплатить"/"Проверить оплату"/
// "Назад") заменяется этим сообщением БЕЗ клавиатуры, т.е. само окно "пропадает".
const HIDE_SUCCESS_TEXT = `${tgEmoji(EMOJI_HIDDEN_ID, "✅")}<b>Успешно! Ваша подписка активна!</b>`;

async function showHideSuccess(ctx) {
    await editMenuMessage(ctx, HIDE_SUCCESS_TEXT, new InlineKeyboard());
}

// startMenu — это InlineKeyboard (не Menu), поэтому у него нет своей middleware.
// Обрабатываем нажатие на кнопку "Настройки уведомлений" вручную.
bot.callbackQuery(START_MENU_CALLBACK, async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenuMessage(ctx, SETTINGS_TEXT, settingsMenu);
});

// ============================================================
// /donat — навигация между "Донат владельцу" и "Premium".
// ============================================================
bot.callbackQuery("donate_owner", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenuMessage(ctx, DONATE_OWNER_TEXT, donateOwnerMethodMenu);
});

bot.callbackQuery("donate_owner_stars", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenuMessage(ctx, DONATE_STARS_TEXT, starsMenu);
});

bot.callbackQuery("donate_owner_cryptobot", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenuMessage(ctx, DONATE_CRYPTOBOT_TEXT, cryptobotAmountMenu);
});

bot.callbackQuery("donate_owner_xrocket", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenuMessage(ctx, DONATE_XROCKET_TEXT, xrocketAmountMenu);
});

bot.callbackQuery("donate_owner_rollypay", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenuMessage(ctx, DONATE_ROLLYPAY_TEXT, rollypayAmountMenu);
});

bot.callbackQuery("donate_premium", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenuMessage(ctx, PREMIUM_TEXT, premiumMenu);
});

bot.callbackQuery("donate_back", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenuMessage(ctx, DONATE_TEXT, donateMenu);
});

// ============================================================
// Premium → "Скрыть себя": выбор тарифа → выбор способа оплаты → оплата.
// ============================================================
bot.callbackQuery("open_hide_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenuMessage(ctx, HIDE_TARIFF_TEXT, hideTariffMenu);
});

bot.callbackQuery("donate_premium_back", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editMenuMessage(ctx, PREMIUM_TEXT, premiumMenu);
});

bot.callbackQuery(/^hide_tariff_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tariff = getHideTariff(ctx.match[1]);
    if (!tariff) return;
    await editMenuMessage(ctx, hideMethodTextFor(tariff), hideMethodMenuFor(tariff));
});

// --- Оплата звёздами — ссылкой (createInvoiceLink), как и остальные способы:
// кнопка "Оплатить" открывает страницу оплаты Telegram, счёт подтверждается
// автоматически (successful_payment), поэтому кнопки "Проверить оплату" тут нет. ---
bot.callbackQuery(/^hide_pay_stars_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tariff = getHideTariff(ctx.match[1]);
    if (!tariff) return;
    try {
        const payUrl = await ctx.api.createInvoiceLink(
            `Premium: Скрыть себя (${tariff.label})`,
            `Скрывает тебя от владельцев ботов на ${tariff.days} дней`,
            `premium_hide_${tariff.days}`,
            "XTR",
            [{ label: `Скрыть себя (${tariff.label})`, amount: tariff.priceStars }]
        );
        const kb = new InlineKeyboard()
            .url("Оплатить", payUrl)
            .primary()
            .row()
            .text("Назад", `hide_tariff_${tariff.id}`)
            .danger();
        await editMenuMessage(
            ctx,
            `${tgEmoji(EMOJI_HIDDEN_ID, "🙈")}<b>Оплата звёздами</b>\n\nСумма: ${tariff.priceStars} ⭐\n\nНажми «Оплатить» — подписка активируется автоматически сразу после оплаты.`,
            kb
        );
    } catch (err) {
        console.error("💥 Не удалось создать ссылку на оплату Premium (Stars):", err.description || err.message || err);
        await ctx.reply("⚠️ Не удалось создать счёт. Попробуй ещё раз чуть позже.");
    }
});

// --- Оплата через CryptoBot ---
bot.callbackQuery(/^hide_pay_cryptobot_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tariff = getHideTariff(ctx.match[1]);
    if (!tariff) return;
    try {
        const invoice = await createCryptoBotInvoice({
            amount: tariff.priceUsdt,
            asset: "USDT",
            description: `Premium: Скрыть себя (${tariff.label}) — ${ctx.from.id}`
        });
        const kb = new InlineKeyboard()
            .webApp("Оплатить", invoice.web_app_invoice_url)
            .primary()
            .row()
            .text("Проверить оплату", `hide_check_cryptobot_${tariff.days}_${invoice.invoice_id}`)
            .success()
            .row()
            .text("Назад", `hide_tariff_${tariff.id}`)
            .danger();
        await editMenuMessage(
            ctx,
            `${tgEmoji(EMOJI_CRYPTOBOT_ID, "💎")} <b>Оплата через CryptoBot</b>\n\nСумма: ${tariff.priceUsdt} USDT\n\nНажми «Оплатить», заверши платёж внутри CryptoBot, потом вернись сюда и нажми «Проверить оплату».`,
            kb
        );
    } catch (err) {
        console.error("💥 CryptoBot: не удалось создать инвойс:", err.message || err);
        await ctx.reply("⚠️ Платёжная система CryptoBot временно недоступна (проверь CRYPTOBOT_API_TOKEN в payments.js). Попробуй другой способ оплаты.");
    }
});

bot.callbackQuery(/^hide_check_cryptobot_(\d+)_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const days = Number(ctx.match[1]);
    const invoiceId = ctx.match[2];
    try {
        const status = await checkCryptoBotInvoice(invoiceId);
        if (status === "paid") {
            grantHide(ctx.from.id, days);
            await showHideSuccess(ctx);
        } else {
            await ctx.reply("⏳ Оплата ещё не поступила. Если уже оплатил(а) — подожди немного и нажми ещё раз.");
        }
    } catch (err) {
        console.error("💥 CryptoBot: не удалось проверить инвойс:", err.message || err);
        await ctx.reply("⚠️ Не удалось проверить оплату. Попробуй чуть позже.");
    }
});

// --- Оплата через xRocket ---
bot.callbackQuery(/^hide_pay_xrocket_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tariff = getHideTariff(ctx.match[1]);
    if (!tariff) return;
    try {
        const invoice = await createXRocketInvoice({
            amount: tariff.priceTon,
            currency: "TONCOIN",
            description: `Premium: Скрыть себя (${tariff.label}) — ${ctx.from.id}`
        });
        const kb = new InlineKeyboard()
            .url("Оплатить", invoice.link)
            .primary()
            .row()
            .text("Проверить оплату", `hide_check_xrocket_${tariff.days}_${invoice.id}`)
            .success()
            .row()
            .text("Назад", `hide_tariff_${tariff.id}`)
            .danger();
        await editMenuMessage(
            ctx,
            `${tgEmoji(EMOJI_XROCKET_ID, "🚀")} <b>Оплата через xRocket</b>\n\nСумма: ${tariff.priceTon} TON\n\nНажми «Оплатить», заверши платёж внутри xRocket, потом вернись сюда и нажми «Проверить оплату».`,
            kb
        );
    } catch (err) {
        console.error("💥 xRocket: не удалось создать инвойс:", err.message || err);
        await ctx.reply("⚠️ Платёжная система xRocket временно недоступна (проверь XROCKET_API_TOKEN в payments.js). Попробуй другой способ оплаты.");
    }
});

bot.callbackQuery(/^hide_check_xrocket_(\d+)_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const days = Number(ctx.match[1]);
    const invoiceId = ctx.match[2];
    try {
        const status = await checkXRocketInvoice(invoiceId);
        if (status === "paid") {
            grantHide(ctx.from.id, days);
            await showHideSuccess(ctx);
        } else {
            await ctx.reply("⏳ Оплата ещё не поступила. Если уже оплатил(а) — подожди немного и нажми ещё раз.");
        }
    } catch (err) {
        console.error("💥 xRocket: не удалось проверить инвойс:", err.message || err);
        await ctx.reply("⚠️ Не удалось проверить оплату. Попробуй чуть позже.");
    }
});

// --- Оплата через RollyPay (СБП): кнопка-ссылка на форму оплаты + ручная проверка
// как подстраховка (основной путь — автоматический вебхук, см. webhook.js) ---
bot.callbackQuery(/^hide_pay_rollypay_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const tariff = getHideTariff(ctx.match[1]);
    if (!tariff) return;
    try {
        const orderId = `hide_${ctx.from.id}_${tariff.days}_${Date.now()}`;
        const payment = await createRollyPayment({
            amount: tariff.priceRub,
            orderId,
            description: `Premium: Скрыть себя (${tariff.label}) — ${ctx.from.id}`
        });
        const kb = new InlineKeyboard()
            .url("Оплатить", payment.pay_url)
            .primary()
            .row()
            .text("Проверить оплату", `hide_check_rollypay_${tariff.days}_${payment.payment_id}`)
            .success()
            .row()
            .text("Назад", `hide_tariff_${tariff.id}`)
            .danger();
        await editMenuMessage(
            ctx,
            `${tgEmoji(EMOJI_ROLLYPAY_ID, "🏦")} <b>Оплата через СБП</b>\n\nСумма: ${tariff.priceRub} ₽\n\nНажми «Оплатить» и заверши перевод в приложении банка. Подписка активируется автоматически в течение пары секунд после оплаты — но если этого не произошло, вернись сюда и нажми «Проверить оплату».`,
            kb
        );
    } catch (err) {
        console.error("💥 RollyPay: не удалось создать платёж:", err.message || err);
        await ctx.reply("⚠️ Платёжная система СБП временно недоступна. Попробуй другой способ оплаты.");
    }
});

bot.callbackQuery(/^hide_check_rollypay_(\d+)_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const days = Number(ctx.match[1]);
    const paymentId = ctx.match[2];
    try {
        const status = await checkRollyPayment(paymentId);
        if (status === "paid") {
            grantHide(ctx.from.id, days);
            await showHideSuccess(ctx);
        } else {
            await ctx.reply(`⏳ Оплата ещё не поступила (статус: ${status}). Если уже оплатил(а) — подожди немного и нажми ещё раз.`);
        }
    } catch (err) {
        console.error("💥 RollyPay: не удалось проверить платёж:", err.message || err);
        await ctx.reply("⚠️ Не удалось проверить оплату. Попробуй чуть позже.");
    }
});

// ============================================================
// Донат владельцу через CryptoBot / xRocket / RollyPay — те же паттерны,
// что и для "Скрыть себя" выше, но суммы фиксированные и без выдачи подписки.
// ============================================================
bot.callbackQuery(/^donate_cryptobot_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const amount = Number(ctx.match[1]);
    try {
        const invoice = await createCryptoBotInvoice({
            amount,
            asset: "USDT",
            description: `Донат владельцу бота — ${ctx.from.id}`
        });
        const kb = new InlineKeyboard()
            .webApp("Оплатить", invoice.web_app_invoice_url)
            .primary()
            .row()
            .text("Проверить оплату", `donate_check_cryptobot_${invoice.invoice_id}`)
            .success()
            .row()
            .text("Назад", "donate_owner_cryptobot")
            .danger();
        await editMenuMessage(
            ctx,
            `${tgEmoji(EMOJI_CRYPTOBOT_ID, "💎")} <b>Донат через CryptoBot</b>\n\nСумма: ${amount} USDT\n\nНажми «Оплатить», заверши платёж, потом вернись и нажми «Проверить оплату».`,
            kb
        );
    } catch (err) {
        console.error("💥 CryptoBot: не удалось создать инвойс доната:", err.message || err);
        await ctx.reply("⚠️ Платёжная система CryptoBot временно недоступна. Попробуй другой способ оплаты.");
    }
});

bot.callbackQuery(/^donate_check_cryptobot_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
        const status = await checkCryptoBotInvoice(ctx.match[1]);
        if (status === "paid") {
            await editMenuMessage(ctx, `${tgEmoji(EMOJI_SUCCESS_ID, "✅")}<b>Спасибо за донат!</b>`, new InlineKeyboard());
            if (ctx.from.id !== YOUR_TELEGRAM_ID) {
                try { await bot.api.sendMessage(YOUR_TELEGRAM_ID, `${tgEmoji(EMOJI_SUCCESS_ID, "💝")} Новый донат через CryptoBot от ${ctx.from.id}`, { parse_mode: "HTML" }); } catch (e) {}
            }
        } else {
            await ctx.reply("⏳ Оплата ещё не поступила. Если уже оплатил(а) — подожди немного и нажми ещё раз.");
        }
    } catch (err) {
        console.error("💥 CryptoBot: не удалось проверить донат:", err.message || err);
        await ctx.reply("⚠️ Не удалось проверить оплату. Попробуй чуть позже.");
    }
});

bot.callbackQuery(/^donate_xrocket_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const amount = Number(ctx.match[1]);
    try {
        const invoice = await createXRocketInvoice({
            amount,
            currency: "USDT",
            description: `Донат владельцу бота — ${ctx.from.id}`
        });
        const kb = new InlineKeyboard()
            .url("Оплатить", invoice.link)
            .primary()
            .row()
            .text("Проверить оплату", `donate_check_xrocket_${invoice.id}`)
            .success()
            .row()
            .text("Назад", "donate_owner_xrocket")
            .danger();
        await editMenuMessage(
            ctx,
            `${tgEmoji(EMOJI_XROCKET_ID, "🚀")} <b>Донат через xRocket</b>\n\nСумма: ${amount} USDT\n\nНажми «Оплатить», заверши платёж, потом вернись и нажми «Проверить оплату».`,
            kb
        );
    } catch (err) {
        console.error("💥 xRocket: не удалось создать инвойс доната:", err.message || err);
        await ctx.reply("⚠️ Платёжная система xRocket временно недоступна. Попробуй другой способ оплаты.");
    }
});

bot.callbackQuery(/^donate_check_xrocket_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
        const status = await checkXRocketInvoice(ctx.match[1]);
        if (status === "paid") {
            await editMenuMessage(ctx, `${tgEmoji(EMOJI_SUCCESS_ID, "✅")}<b>Спасибо за донат!</b>`, new InlineKeyboard());
            if (ctx.from.id !== YOUR_TELEGRAM_ID) {
                try { await bot.api.sendMessage(YOUR_TELEGRAM_ID, `${tgEmoji(EMOJI_SUCCESS_ID, "💝")} Новый донат через xRocket от ${ctx.from.id}`, { parse_mode: "HTML" }); } catch (e) {}
            }
        } else {
            await ctx.reply("⏳ Оплата ещё не поступила. Если уже оплатил(а) — подожди немного и нажми ещё раз.");
        }
    } catch (err) {
        console.error("💥 xRocket: не удалось проверить донат:", err.message || err);
        await ctx.reply("⚠️ Не удалось проверить оплату. Попробуй чуть позже.");
    }
});

bot.callbackQuery(/^donate_rollypay_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const amount = Number(ctx.match[1]);
    try {
        const orderId = `donate_${ctx.from.id}_${amount}_${Date.now()}`;
        const payment = await createRollyPayment({
            amount,
            orderId,
            description: `Донат владельцу бота — ${ctx.from.id}`
        });
        const kb = new InlineKeyboard()
            .url("Оплатить", payment.pay_url)
            .primary()
            .row()
            .text("Проверить оплату", `donate_check_rollypay_${payment.payment_id}`)
            .success()
            .row()
            .text("Назад", "donate_owner_rollypay")
            .danger();
        await editMenuMessage(
            ctx,
            `${tgEmoji(EMOJI_ROLLYPAY_ID, "🏦")} <b>Донат через СБП</b>\n\nСумма: ${amount} ₽\n\nНажми «Оплатить» и заверши перевод в приложении банка. Уведомление придёт автоматически.`,
            kb
        );
    } catch (err) {
        console.error("💥 RollyPay: не удалось создать платёж доната:", err.message || err);
        await ctx.reply("⚠️ Платёжная система СБП временно недоступна. Попробуй другой способ оплаты.");
    }
});

bot.callbackQuery(/^donate_check_rollypay_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    try {
        const status = await checkRollyPayment(ctx.match[1]);
        if (status === "paid") {
            await editMenuMessage(ctx, `${tgEmoji(EMOJI_SUCCESS_ID, "✅")}<b>Спасибо за донат!</b>`, new InlineKeyboard());
            if (ctx.from.id !== YOUR_TELEGRAM_ID) {
                try { await bot.api.sendMessage(YOUR_TELEGRAM_ID, `${tgEmoji(EMOJI_SUCCESS_ID, "💝")} Новый донат через СБП от ${ctx.from.id}`, { parse_mode: "HTML" }); } catch (e) {}
            }
        } else {
            await ctx.reply(`⏳ Оплата ещё не поступила (статус: ${status}). Если уже оплатил(а) — подожди немного и нажми ещё раз.`);
        }
    } catch (err) {
        console.error("💥 RollyPay: не удалось проверить донат:", err.message || err);
        await ctx.reply("⚠️ Не удалось проверить оплату. Попробуй чуть позже.");
    }
});

// Выбор конкретной суммы в звёздах — ссылка на оплату (createInvoiceLink), как и
// остальные способы. Подтверждается автоматически через successful_payment.
bot.callbackQuery(/^donate_stars_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const amount = Number(ctx.match[1]);
    try {
        const payUrl = await ctx.api.createInvoiceLink(
            "Донат владельцу бота",
            `Спасибо за поддержку! Сумма: ${amount} ⭐`,
            `donate_${amount}`,
            "XTR",
            [{ label: `Донат ${amount} ⭐`, amount }]
        );
        const kb = new InlineKeyboard()
            .url("Оплатить", payUrl)
            .primary()
            .row()
            .text("Назад", "donate_owner_stars")
            .danger();
        await editMenuMessage(
            ctx,
            `${tgEmoji(EMOJI_DONATE_ID, "💝")}<b>Донат звёздами</b>\n\nСумма: ${amount} ⭐\n\nНажми «Оплатить» — спасибо подтвердится автоматически сразу после оплаты.`,
            kb
        );
    } catch (err) {
        console.error("💥 Не удалось создать ссылку на донат (Stars):", err.description || err.message || err);
        await ctx.reply("⚠️ Не удалось создать счёт. Попробуй ещё раз чуть позже.");
    }
});

// Обязательный шаг для любых платежей в Telegram — подтверждаем pre-checkout.
bot.on("pre_checkout_query", async (ctx) => {
    try {
        await ctx.answerPreCheckoutQuery(true);
    } catch (err) {
        console.error("💥 Ошибка pre_checkout_query:", err.description || err.message || err);
    }
});

// Успешная оплата — благодарим и уведомляем владельца.
bot.on("message:successful_payment", async (ctx) => {
    const payment = ctx.message.successful_payment;

    if (payment.invoice_payload && payment.invoice_payload.startsWith("premium_hide_")) {
        const days = Number(payment.invoice_payload.split("_")[2]) || 30;
        grantHide(ctx.from.id, days);
        await ctx.reply(HIDE_SUCCESS_TEXT, { parse_mode: "HTML" });
        return;
    }

    await ctx.reply(`${tgEmoji(EMOJI_SUCCESS_ID, "✅")} Спасибо за донат — ${payment.total_amount} ⭐!`, { parse_mode: "HTML" });
    if (ctx.from.id !== YOUR_TELEGRAM_ID) {
        try {
            await bot.api.sendMessage(
                YOUR_TELEGRAM_ID,
                `${tgEmoji(EMOJI_SUCCESS_ID, "💝")} Новый донат: ${payment.total_amount} ⭐ от ${ctx.from.first_name} (${ctx.from.username ? "@" + ctx.from.username : ctx.from.id})`,
                { parse_mode: "HTML" }
            );
        } catch (e) {}
    }
});

bot.use(async (ctx, next) => {
    console.log(`[LOG] Бот поймал событие от Telegram! Тип: ${Object.keys(ctx.update).filter(k => k !== 'update_id')}`);
    await next();
});

bot.on("message:text", async (ctx, next) => {
    const text = ctx.message.text.trim();
    const lower = text.toLowerCase();
    const isAdmin = ctx.from.id === YOUR_TELEGRAM_ID;

    // Заблокированных пользователей дальше не пускаем (кроме самого админа).
    if (!isAdmin && isBlocked(ctx.from.id)) {
        await ctx.reply(`${tgEmoji(EMOJI_DEL_MSG_ID, "🚫")} Доступ ограничен.`, { parse_mode: "HTML" });
        return;
    }

    if (isAdmin) {
        if (lower === "open") {
            botAccessStatus = "open";
            await ctx.reply(`${tgEmoji(EMOJI_SUCCESS_ID, "🔓")} <b>Бот открыт для всех!</b> Уведомления дублируются всем пользователям панели.`, { parse_mode: "HTML" });
            return;
        }
        if (lower === "close") {
            botAccessStatus = "close";
            await ctx.reply(`${tgEmoji(EMOJI_DEL_MSG_ID, "🔒")} <b>Бот закрыт!</b> Уведомления приходят строго только тебе.`, { parse_mode: "HTML" });
            return;
        }

        if (lower === "/admin") {
            clearAdminState(ctx.from.id);
            await ctx.reply(ADMIN_TEXT, { parse_mode: "HTML", reply_markup: adminMenu });
            return;
        }

        if (lower === "/cancel") {
            if (getAdminState(ctx.from.id)) {
                clearAdminState(ctx.from.id);
                await ctx.reply(`${tgEmoji(EMOJI_DEL_MSG_ID, "❌")} Действие отменено.`, { parse_mode: "HTML" });
            }
            return;
        }

        if (lower === "/removeimage") {
            clearDesignImage();
            clearAdminState(ctx.from.id);
            await ctx.reply(`${tgEmoji(EMOJI_DEL_MSG_ID, "🗑")} Картинка главного меню удалена. Теперь /start снова будет обычным текстом.`, { parse_mode: "HTML" });
            return;
        }

        const state = getAdminState(ctx.from.id);
        if (state === "awaiting_block_id" || state === "awaiting_unblock_id") {
            const targetId = Number(text);
            if (!Number.isInteger(targetId) || targetId <= 0) {
                await ctx.reply(`${tgEmoji(EMOJI_DEL_MSG_ID, "⚠️")} Это не похоже на Telegram ID. Пришли число, или /cancel для отмены.`, { parse_mode: "HTML" });
                return;
            }
            clearAdminState(ctx.from.id);
            if (state === "awaiting_block_id") {
                blockUser(targetId);
                await ctx.reply(`${tgEmoji(EMOJI_DEL_MSG_ID, "🚫")} Пользователь <code>${targetId}</code> заблокирован.`, { parse_mode: "HTML" });
            } else {
                unblockUser(targetId);
                await ctx.reply(`${tgEmoji(EMOJI_SUCCESS_ID, "✅")} Пользователь <code>${targetId}</code> разблокирован.`, { parse_mode: "HTML" });
            }
            return;
        }
        if (state === "awaiting_design_image") {
            await ctx.reply(`${tgEmoji(EMOJI_DEL_MSG_ID, "⚠️")} Жду картинку (фото), а не текст. Или /cancel для отмены.`, { parse_mode: "HTML" });
            return;
        }

        if (state === "awaiting_premium_grant_id") {
            const targetId = Number(text);
            if (!Number.isInteger(targetId) || targetId <= 0) {
                await ctx.reply(`${tgEmoji(EMOJI_DEL_MSG_ID, "⚠️")} Это не похоже на Telegram ID. Пришли число, или /cancel для отмены.`, { parse_mode: "HTML" });
                return;
            }
            setAdminState(ctx.from.id, `awaiting_premium_grant_days:${targetId}`);
            await ctx.reply(`${tgEmoji(EMOJI_HIDDEN_ID, "🙈")} На сколько дней выдать Premium пользователю <code>${targetId}</code>? Пришли число (например 30).`, { parse_mode: "HTML" });
            return;
        }

        if (state && state.startsWith("awaiting_premium_grant_days:")) {
            const targetId = Number(state.split(":")[1]);
            const days = Number(text);
            if (!Number.isInteger(days) || days <= 0) {
                await ctx.reply(`${tgEmoji(EMOJI_DEL_MSG_ID, "⚠️")} Это не похоже на число дней. Пришли целое число, или /cancel для отмены.`, { parse_mode: "HTML" });
                return;
            }
            clearAdminState(ctx.from.id);
            grantHide(targetId, days);
            await ctx.reply(`${tgEmoji(EMOJI_SUCCESS_ID, "✅")} Premium выдан пользователю <code>${targetId}</code> на ${days} дней.`, { parse_mode: "HTML" });
            try {
                await bot.api.sendMessage(
                    targetId,
                    `${tgEmoji(EMOJI_HIDDEN_ID, "🎁")}<b>Тебе выдан Premium администратором на ${days} дней!</b>`,
                    { parse_mode: "HTML" }
                );
            } catch (e) {}
            return;
        }
    }

    registeredUsers.add(ctx.from.id);

    if (lower === "/start") {
        await sendStartMenu(ctx);
        return;
    }

    if (lower === "/info") {
        try {
            await ctx.reply(INFO_TEXT, {
                parse_mode: "HTML",
                reply_markup: infoMenu
            });
        } catch (err) {
            console.error("💥 Не удалось отправить /info с премиум-эмодзи:", err.description || err.message || err);
            await ctx.reply(INFO_TEXT.replace(/<tg-emoji[^>]*>|<\/tg-emoji>/g, ""), {
                parse_mode: "HTML",
                reply_markup: infoMenu
            });
        }
        return;
    }

    if (lower === "/donat") {
        try {
            await ctx.reply(DONATE_TEXT, { parse_mode: "HTML", reply_markup: donateMenu });
        } catch (err) {
            console.error("💥 Не удалось отправить /donat с премиум-эмодзи:", err.description || err.message || err);
            await ctx.reply(DONATE_TEXT.replace(/<tg-emoji[^>]*>|<\/tg-emoji>/g, ""), {
                parse_mode: "HTML",
                reply_markup: donateMenu
            });
        }
        return;
    }

    await next();
});

// Приём картинки для дизайна главного меню (только от админа, только пока ждём картинку).
bot.on("message:photo", async (ctx, next) => {
    if (ctx.from.id === YOUR_TELEGRAM_ID && getAdminState(ctx.from.id) === "awaiting_design_image") {
        const largestPhoto = ctx.message.photo[ctx.message.photo.length - 1];
        setDesignImage(largestPhoto.file_id);
        clearAdminState(ctx.from.id);
        await ctx.reply(`${tgEmoji(EMOJI_SUCCESS_ID, "✅")} Готово! Эта картинка теперь будет показываться на главном меню (/start).`, { parse_mode: "HTML" });
        return;
    }
    await next();
});

bot.on("business_connection", async (ctx) => {
    if (ctx.businessConnection.is_enabled) {
        try { await bot.api.sendMessage(YOUR_TELEGRAM_ID, `${tgEmoji(EMOJI_SUCCESS_ID, "✅")} <b>Успешно подключен к аккаунту! Бот работает.</b>`, { parse_mode: "HTML" }); } catch (e) {}
    }
});

bot.on("deleted_business_messages", async (ctx) => {
    const delInfo = ctx.deletedBusinessMessages;
    for (const msgId of delInfo.message_ids) {
        db.getMessage(msgId, delInfo.chat.id, async (err, row) => {
            if (err || !row) return;

            const deleteNotification = 
                `${tgEmoji(EMOJI_DEL_MSG_ID, "🗑")} <b>Собеседник УДАЛИЛ сообщение! Вот что там было:</b>\n\n` +
                `${tgEmoji(EMOJI_SENDER_ID, "👤")} <b>Отправитель:</b> ${row.user_name} (${row.username})\n` +
                `${tgEmoji(EMOJI_TEXT_ID, "💬")} <b>Удаленный текст / Подпись:</b>\n<i>${row.text}</i>`;

            await broadcast(async (targetId) => {
                if (!getUserSettings(targetId).del_msg) return;
                
                await bot.api.sendMessage(targetId, deleteNotification, { parse_mode: "HTML" });

                if (row.file_id) {
                    try {
                        if (row.media_type === "photo") await bot.api.sendPhoto(targetId, row.file_id, { caption: `${tgEmoji(EMOJI_DEL_MSG_ID, "🗑")} Удаленное фото от ${row.user_name}`, parse_mode: "HTML" });
                        else if (row.media_type === "video") await bot.api.sendVideo(targetId, row.file_id, { caption: `${tgEmoji(EMOJI_DEL_MSG_ID, "🗑")} Удаленное видео от ${row.user_name}`, parse_mode: "HTML" });
                        else if (row.media_type === "video_note") await bot.api.sendVideoNote(targetId, row.file_id);
                        else if (row.media_type === "voice") await bot.api.sendVoice(targetId, row.file_id);
                        else if (row.media_type === "document") await bot.api.sendDocument(targetId, row.file_id);
                    } catch (mediaErr) {
                        console.error(
                            `💥 Не удалось переслать файл удалённого сообщения [chat_id=${row.chat_id}, message_id=${msgId}, media_type=${row.media_type}, file_id=${String(row.file_id).slice(0, 20)}...]:`,
                            mediaErr.description || mediaErr.message || mediaErr
                        );
                    }
                }
            });
        });
    }
});

bot.on("edited_business_message", async (ctx) => {
    const message = ctx.editedBusinessMessage;
    const fromUser = message.from;
    if (fromUser.id === YOUR_TELEGRAM_ID) return;

    if (!fromUser.is_bot && message.chat.type === "private") {
        if (isHidden(fromUser.id)) {
            const hiddenNotice = `${tgEmoji(EMOJI_HIDDEN_ID, "🙈")} <b>У этого пользователя подключен Premium — вы не можете посмотреть его сообщение.</b>`;
            await broadcast(async (targetId) => {
                if (!getUserSettings(targetId).edit_msg) return;
                await bot.api.sendMessage(targetId, hiddenNotice, { parse_mode: "HTML" });
            });
            return;
        }

        const fullName = `${fromUser.first_name} ${fromUser.last_name || ""}`.trim();
        const username = fromUser.username ? `@${fromUser.username}` : "нет юзернейма";
        const newText = message.text || message.caption || "_[Текст отсутствует]_";

        db.updateMessageText(message.message_id, message.chat.id, newText);

        const editNotificationText = `${tgEmoji(EMOJI_EDIT_MSG_ID, "✏️")} <b>Собеседник отредактировал сообщение!</b>\n\n${tgEmoji(EMOJI_SENDER_ID, "👤")} <b>Отправитель:</b> ${fullName} (${username})\n${tgEmoji(EMOJI_TEXT_ID, "📝")} <b>Новый текст:</b>\n<i>${newText}</i>`;
        
        await broadcast(async (targetId) => {
            if (!getUserSettings(targetId).edit_msg) return;
            await bot.api.sendMessage(targetId, editNotificationText, { parse_mode: "HTML" });
        });
    }
});

bot.on("business_message", async (ctx) => {
    const message = ctx.businessMessage;
    const fromUser = message.from;
    if (fromUser.id === YOUR_TELEGRAM_ID) return;

    if (!fromUser.is_bot && message.chat.type === "private") {
        if (isHidden(fromUser.id)) {
            const hiddenNotice = `${tgEmoji(EMOJI_HIDDEN_ID, "🙈")} <b>У этого пользователя подключен Premium — вы не можете посмотреть его сообщение.</b>`;
            await broadcast(async (targetId) => {
                if (!getUserSettings(targetId).new_msg) return;
                await bot.api.sendMessage(targetId, hiddenNotice, { parse_mode: "HTML" });
            });
            return;
        }

        const fullName = `${fromUser.first_name} ${fromUser.last_name || ""}`.trim();
        const username = fromUser.username ? `@${fromUser.username}` : "нет юзернейма";
        
        let mediaType = "text";
        let fileId = null;

        if (message.photo) { mediaType = "photo"; fileId = message.photo[message.photo.length - 1].file_id; }
        else if (message.video) { mediaType = "video"; fileId = message.video.file_id; }
        else if (message.video_note) { mediaType = "video_note"; fileId = message.video_note.file_id; }
        else if (message.voice) { mediaType = "voice"; fileId = message.voice.file_id; }
        else if (message.document) { mediaType = "document"; fileId = message.document.file_id; }

        const userText = message.text || message.caption || `_[Отправлено медиа: ${mediaType}]_`;

        db.saveMessage(message.message_id, message.chat.id, fullName, username, userText, mediaType, fileId);

        const notificationText = `${tgEmoji(EMOJI_NEW_MSG_ID, "🔔")} <b>Новое сообщение от реального человека!</b>\n\n${tgEmoji(EMOJI_SENDER_ID, "👤")} <b>Отправитель:</b> ${fullName} (${username})\n${tgEmoji(EMOJI_TEXT_ID, "💬")} <b>Текст / Медиа:</b>\n<i>${userText}</i>`;
        
        await broadcast(async (targetId) => {
            if (!getUserSettings(targetId).new_msg) return;
            
            await bot.api.sendMessage(targetId, notificationText, { parse_mode: "HTML" });

            try {
                if (message.photo) await bot.api.sendPhoto(targetId, fileId, { caption: `${tgEmoji(EMOJI_PHOTO_ID, "📸")} Фото от ${fullName}`, parse_mode: "HTML" });
                else if (message.video) await bot.api.sendVideo(targetId, fileId, { caption: `${tgEmoji(EMOJI_VIDEO_ID, "📹")} Видео от ${fullName}`, parse_mode: "HTML" });
                else if (message.video_note) await bot.api.sendVideoNote(targetId, fileId);
                else if (message.voice) {
                    try { await bot.api.sendVoice(targetId, fileId, { caption: `${tgEmoji(EMOJI_VOICE_ID, "🎙")} Голосовое от ${fullName}`, parse_mode: "HTML" }); }
                    catch (vErr) { await bot.api.sendDocument(targetId, fileId, { caption: `${tgEmoji(EMOJI_VOICE_ID, "🎙")} [Файл] Голосовое от ${fullName}`, parse_mode: "HTML" }); }
                }
                else if (message.document) await bot.api.sendDocument(targetId, fileId, { caption: `${tgEmoji(EMOJI_DOC_ID, "📁")} Файл от ${fullName}`, parse_mode: "HTML" });
            } catch (mediaErr) {
                console.error(
                    `💥 Не удалось переслать медиа нового сообщения [chat_id=${message.chat.id}, message_id=${message.message_id}, media_type=${mediaType}, file_id=${String(fileId).slice(0, 20)}...]:`,
                    mediaErr.description || mediaErr.message || mediaErr
                );
            }
        });
    }
});

bot.start({
    allowed_updates: ["message", "callback_query", "business_connection", "business_message", "edited_business_message", "deleted_business_messages"],
    drop_pending_updates: true
});

// ============================================================
// Автопроверка платежей СБП через Callback URL (вебхук RollyPay).
// См. подробное пояснение и обязательные шаги настройки в webhook.js.
// ============================================================
const ROLLYPAY_WEBHOOK_PORT = 3000;

async function handleRollyPayWebhookPaid(payload) {
    const { order_id, amount, payment_id } = payload;
    if (!order_id) return;

    console.log(`✅ RollyPay webhook: платёж ${payment_id} оплачен (order_id=${order_id}, amount=${amount})`);

    if (order_id.startsWith("hide_")) {
        const parts = order_id.split("_"); // hide_<userId>_<days>_<timestamp>
        const userId = Number(parts[1]);
        const days = Number(parts[2]) || 30;
        if (!userId) return;
        grantHide(userId, days);
        try {
            await bot.api.sendMessage(userId, HIDE_SUCCESS_TEXT, { parse_mode: "HTML" });
        } catch (e) {}
        return;
    }

    if (order_id.startsWith("donate_")) {
        const parts = order_id.split("_"); // donate_<userId>_<amount>_<timestamp>
        const userId = Number(parts[1]);
        if (!userId) return;
        try {
            await bot.api.sendMessage(userId, `${tgEmoji(EMOJI_SUCCESS_ID, "✅")} Спасибо за донат — ${amount} ₽!`, { parse_mode: "HTML" });
        } catch (e) {}
        if (userId !== YOUR_TELEGRAM_ID) {
            try {
                await bot.api.sendMessage(
                    YOUR_TELEGRAM_ID,
                    `${tgEmoji(EMOJI_SUCCESS_ID, "💝")} Новый донат через СБП: ${amount} ₽ от ${userId}`,
                    { parse_mode: "HTML" }
                );
            } catch (e) {}
        }
    }
}

startRollyPayWebhook({
    port: ROLLYPAY_WEBHOOK_PORT,
    signingSecret: ROLLYPAY_SIGNING_SECRET,
    onPaid: handleRollyPayWebhookPaid
});

console.log("🚀 Модульный бот запущен!");
