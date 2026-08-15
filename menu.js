const { InlineKeyboard } = require("grammy");
const { Menu } = require("@grammyjs/menu");

// ============================================================
// ID кастомных премиум-эмодзи
// ЗАМЕНИ значения ниже на свои собственные emoji-id (ты сам их вставишь) —
// весь остальной код уже настроен на то, чтобы это просто заработало.
// ============================================================
const EMOJI_1_ID = "5415613878019072570";           // цифра "1" — на кнопке "Настройки уведомлений"
const EMOJI_WAVE_ID = "5472055112702629499";        // 👋
const EMOJI_HEART_ID = "5454386656628991407";       // 💘
const EMOJI_POINT_DOWN_ID = "5231102735817918643";  // 👇

// --- эмодзи для текстов уведомлений (в сообщениях, ctx.reply / bot.api.sendMessage) ---
const EMOJI_NEW_MSG_ID = "5242628160297641831";     // 🔔 новое сообщение
const EMOJI_EDIT_MSG_ID = "5334673106202010226";    // ✏️ редактирование
const EMOJI_DEL_MSG_ID = "5258130763148172425";     // 🗑 удаление
const EMOJI_SENDER_ID = "5258011929993026890";      // 👤 отправитель
const EMOJI_TEXT_ID = "5465300082628763143";        // 💬 / 📝 текст
const EMOJI_PHOTO_ID = "5235837920081887219";       // 📸 фото
const EMOJI_VIDEO_ID = "5375309569905938163";       // 📹 видео
const EMOJI_VOICE_ID = "5382013970905309819";       // 🎙 голосовое
const EMOJI_DOC_ID = "5298853345241358103";         // 📁 документ
const EMOJI_SUCCESS_ID = "6023773095284707791";     // ✅ успех (бизнес-подключение)
const EMOJI_INFO_ID = "5334544901428229844";        // ℹ️ /info

// --- эмодзи-иконки для кнопок панели управления (settingsMenu), через .icon() ---
const ICON_PRESET_DEL_EDIT = "5416074955643203200"; // на кнопке "Удалённые + Редактирование"
const ICON_PRESET_ALL = "5424892643760937442";      // на кнопке "Все сразу"
const ICON_TOGGLE_NEW = "5406631276042002796";      // на кнопке "Новые сообщения"
const ICON_TOGGLE_EDIT = "5879841310902324730";     // на кнопке "Редактирование"
const ICON_TOGGLE_DEL = "5258130763148172425";      // на кнопке "Удаление"
const ICON_BACK = "5255703720078879038";            // на кнопке "Назад в меню"

// --- эмодзи-иконки для кнопок /info ---
const ICON_TERMS = "5282843764451195532";           // на кнопке "Пользовательское соглашение"
const ICON_PRIVACY = "5296369303661067030";         // на кнопке "Политика конфиденциальности"

// Хелпер: оборачиваем эмодзи в <tg-emoji> для текста сообщений (parse_mode: "HTML").
function tgEmoji(id, fallback) {
    return `<tg-emoji emoji-id="${id}">${fallback}</tg-emoji>`;
}

// Текст приветствия с тремя премиум-эмодзи
const START_TEXT = `${tgEmoji(EMOJI_WAVE_ID, "👋")}Добро пожаловать! Тут ты можешь настроить бота, как тебе захочется ${tgEmoji(EMOJI_HEART_ID, "💘")}\n${tgEmoji(EMOJI_POINT_DOWN_ID, "👇")} жми кнопку ниже`;

const SETTINGS_TEXT = `${tgEmoji(EMOJI_1_ID, "⚙️")} <b>Настройки уведомлений</b>\n\nНажимай на кнопки для переключения твоих личных режимов оповещения:`;

// ============================================================
// /info — ссылки на юридические документы.
// ЗАМЕНИ на свои реальные ссылки.
// ============================================================
const TERMS_URL = "https://telegra.ph/Polzovatelskoe-soglashenie-08-09-41";
const PRIVACY_URL = "https://telegra.ph/Politika-konfidencialnosti-08-09-71";

const INFO_TEXT = `${tgEmoji(EMOJI_INFO_ID, "ℹ️")} <b>Информация</b>\n\nЗдесь ты найдёшь наши юридические документы:`;

const infoMenu = new InlineKeyboard()
    .url("Пользовательское соглашение", TERMS_URL)
    .icon(ICON_TERMS)
    .danger()
    .row()
    .url("Политика конфиденциальности", PRIVACY_URL)
    .icon(ICON_PRIVACY)
    .danger();

// callback_data кнопки "Настройки уведомлений" (нужен в eto.js для обработчика)
const START_MENU_CALLBACK = "open_settings_menu";

// Хранилище индивидуальных настроек для каждого юзера в памяти
const globalUsersSettings = {};
function getUserSettings(userId) {
    if (!globalUsersSettings[userId]) {
        globalUsersSettings[userId] = { new_msg: true, edit_msg: true, del_msg: true };
    }
    return globalUsersSettings[userId];
}

// Единый текст фолбэка (на случай, если премиум-эмодзи временно не отправились)
const START_TEXT_FALLBACK = "Добро пожаловать! Тут ты можешь настроить бота, как тебе захочется\nжми кнопку ниже";

// Создание инлайн-меню настроек (Вторичное окно)
// ВАЖНО: .icon() и динамический .style() на кнопках Menu появились в @grammyjs/menu
// не сразу — если увидишь ошибку "...icon is not a function" или "...style is not a function",
// обнови пакет: npm install @grammyjs/menu@latest
const settingsMenu = new Menu("settings-menu")
    // --- Быстрые пресеты ---
    .text("Удалённые + Редактирование", (ctx) => {
        const settings = getUserSettings(ctx.from.id);
        settings.del_msg = true;
        settings.edit_msg = true;
        settings.new_msg = false;
        ctx.menu.update();
    })
    .icon(ICON_PRESET_DEL_EDIT)
    .row()
    .text("Все сразу", (ctx) => {
        const settings = getUserSettings(ctx.from.id);
        settings.new_msg = true;
        settings.edit_msg = true;
        settings.del_msg = true;
        ctx.menu.update();
    })
    .icon(ICON_PRESET_ALL)
    .row()
    // --- Индивидуальные переключатели: зелёный (success), когда включено, красный (danger), когда выключено ---
    .text(
        "Новые сообщения",
        (ctx) => {
            const settings = getUserSettings(ctx.from.id);
            settings.new_msg = !settings.new_msg;
            ctx.menu.update();
        }
    )
    .icon(ICON_TOGGLE_NEW)
    .style((ctx) => (getUserSettings(ctx.from.id).new_msg ? "success" : "danger"))
    .row()
    .text(
        "Редактирование",
        (ctx) => {
            const settings = getUserSettings(ctx.from.id);
            settings.edit_msg = !settings.edit_msg;
            ctx.menu.update();
        }
    )
    .icon(ICON_TOGGLE_EDIT)
    .style((ctx) => (getUserSettings(ctx.from.id).edit_msg ? "success" : "danger"))
    .row()
    .text(
        "Удаление",
        (ctx) => {
            const settings = getUserSettings(ctx.from.id);
            settings.del_msg = !settings.del_msg;
            ctx.menu.update();
        }
    )
    .icon(ICON_TOGGLE_DEL)
    .style((ctx) => (getUserSettings(ctx.from.id).del_msg ? "success" : "danger"))
    .row()
    .text("Назад в меню", async (ctx) => {
        try {
            if (ctx.msg && ctx.msg.photo) {
                await ctx.editMessageCaption({
                    caption: START_TEXT,
                    parse_mode: "HTML",
                    reply_markup: startMenu
                });
            } else {
                await ctx.editMessageText(START_TEXT, {
                    parse_mode: "HTML",
                    reply_markup: startMenu
                });
            }
        } catch (err) {
            console.error("💥 Не удалось показать START_TEXT с премиум-эмодзи:", err.description || err.message || err);
            if (ctx.msg && ctx.msg.photo) {
                await ctx.editMessageCaption({ caption: START_TEXT_FALLBACK, reply_markup: startMenu });
            } else {
                await ctx.editMessageText(START_TEXT_FALLBACK, { reply_markup: startMenu });
            }
        }
    })
    .icon(ICON_BACK);

// --- эмодзи-иконка для кнопки "Подключить бота" на главном меню ---
const ICON_CONNECT_BOT = "5253564531842245296";     // ЗАМЕНИ на свой emoji-id

// Главное меню (/start).
// ВАЖНО: это InlineKeyboard, а не Menu — эта кнопка ведёт себя как простая ссылка
// на открытие меню настроек и не нуждается в интерактивной логике самой Menu.
// Обработчик нажатия зарегистрирован отдельно в eto.js через bot.callbackQuery().
const startMenu = new InlineKeyboard()
    .text("Настройки уведомлений", START_MENU_CALLBACK)
    .icon(EMOJI_1_ID)
    .row()
    .url("Подключить бота", "tg://settings/edit")
    .icon(ICON_CONNECT_BOT);

module.exports = {
    startMenu,
    settingsMenu,
    getUserSettings,
    START_TEXT,
    START_TEXT_FALLBACK,
    SETTINGS_TEXT,
    START_MENU_CALLBACK,
    tgEmoji,
    infoMenu,
    INFO_TEXT,
    TERMS_URL,
    PRIVACY_URL,
    EMOJI_NEW_MSG_ID,
    EMOJI_EDIT_MSG_ID,
    EMOJI_DEL_MSG_ID,
    EMOJI_SENDER_ID,
    EMOJI_TEXT_ID,
    EMOJI_PHOTO_ID,
    EMOJI_VIDEO_ID,
    EMOJI_VOICE_ID,
    EMOJI_DOC_ID,
    EMOJI_SUCCESS_ID
};
