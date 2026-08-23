const fs = require("fs");
const path = require("path");
const { Menu } = require("@grammyjs/menu");
const { tgEmoji } = require("./menu");
const { MINIAPP_URL } = require("./donate");

// ============================================================
// Хранилище админ-данных (блокировки + картинка дизайна) — простой JSON-файл,
// чтобы всё сохранялось между перезапусками бота.
// ============================================================
const DATA_FILE = path.join(__dirname, "admin-data.json");

function loadData() {
    try {
        const raw = fs.readFileSync(DATA_FILE, "utf-8");
        const parsed = JSON.parse(raw);
        return {
            blockedUsers: Array.isArray(parsed.blockedUsers) ? parsed.blockedUsers : [],
            designImageFileId: parsed.designImageFileId || null
        };
    } catch (e) {
        return { blockedUsers: [], designImageFileId: null };
    }
}

function saveData() {
    const data = {
        blockedUsers: Array.from(blockedUsers),
        designImageFileId
    };
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
    } catch (e) {
        console.error("💥 Не удалось сохранить admin-data.json:", e.message || e);
    }
}

const initial = loadData();
const blockedUsers = new Set(initial.blockedUsers);
let designImageFileId = initial.designImageFileId;

function isBlocked(userId) {
    return blockedUsers.has(userId);
}

function blockUser(userId) {
    blockedUsers.add(userId);
    saveData();
}

function unblockUser(userId) {
    blockedUsers.delete(userId);
    saveData();
}

function getDesignImage() {
    return designImageFileId;
}

function setDesignImage(fileId) {
    designImageFileId = fileId;
    saveData();
}

function clearDesignImage() {
    designImageFileId = null;
    saveData();
}

// ============================================================
// Состояние диалога с админом: ждём ли мы от него ID для блокировки/разблокировки
// или картинку для дизайна. Ключ — telegram id админа.
// ============================================================
const adminState = new Map();

function setAdminState(adminId, state) {
    adminState.set(adminId, state);
}

function getAdminState(adminId) {
    return adminState.get(adminId) || null;
}

function clearAdminState(adminId) {
    adminState.delete(adminId);
}

// ============================================================
// ID кастомных премиум-эмодзи для панели администратора.
// ЗАМЕНИ значения ниже на свои собственные emoji-id — ПОКА они не настоящие
// (просто числа-заглушки), из-за чего Telegram отвечал ENTITY_TEXT_INVALID.
// Ниже добавлена защита (safeEditMessageText) — даже с плохим ID бот теперь
// не падает молча, а отправляет текст без эмодзи вторым заходом.
// ============================================================
const EMOJI_ADMIN_TITLE_ID = "6007963990683030781";  // 🛠 заголовок панели
const ICON_ADMIN_BLOCK = "5416122415031820342";      // на кнопке "Заблокировать пользователя"
const ICON_ADMIN_UNBLOCK = "5416074955643203200";    // на кнопке "Разблокировать пользователя"
const ICON_ADMIN_DESIGN = "5431456208487716895";     // на кнопке "Дизайн"
const ICON_ADMIN_LIST = "5345835159268641541";       // на кнопке "Список заблокированных"
const ICON_ADMIN_PREMIUM = "5935757052042285202";    // на кнопке "Выдать Premium"
const ICON_ADMIN_REVOKE = "5309941895345758343";     // на кнопке "Забрать Premium"
const ICON_ADMIN_PROMO = "5312016608254762455";      // на кнопке "Создать промокод"
const ICON_ADMIN_MINIAPP_BAN = "5416122415031820342";   // на кнопке "Забанить в Mini App"
const ICON_ADMIN_MINIAPP_UNBAN = "5416074955643203200"; // на кнопке "Разбанить в Mini App"

// Убирает <tg-emoji> теги, оставляя обычный текст — запасной вариант,
// если ID эмодзи не настоящий (несуществующий) и Telegram отклоняет сообщение.
function stripTgEmoji(text) {
    return text.replace(/<tg-emoji[^>]*>[\s\S]*?<\/tg-emoji>/g, "").replace(/^\s+/, "");
}

// Безопасная отправка/редактирование HTML-текста с премиум-эмодзи: если Telegram
// отклонит (ENTITY_TEXT_INVALID и т.п. — обычно из-за несуществующего emoji-id),
// автоматически повторяем без тегов <tg-emoji>, чтобы админка не "молчала".
async function safeEditMessageText(ctx, text, extra = {}) {
    try {
        await ctx.editMessageText(text, { parse_mode: "HTML", ...extra });
    } catch (err) {
        console.error("💥 admin.js: не удалось отправить с премиум-эмодзи, шлю без них:", err.description || err.message || err);
        await ctx.editMessageText(stripTgEmoji(text), { parse_mode: "HTML", ...extra });
    }
}

// ============================================================
// Тексты и клавиатуры
// ============================================================
const ADMIN_TEXT = `${tgEmoji(EMOJI_ADMIN_TITLE_ID, "🛠")} <b>Панель администратора</b>\n\nВыбери действие:`;

const ADMIN_MENU_CALLBACK = "open_admin_menu";

const adminMenu = new Menu("admin-menu")
    .text("Заблокировать пользователя", async (ctx) => {
        setAdminState(ctx.from.id, "awaiting_block_id");
        await safeEditMessageText(
            ctx,
            `${tgEmoji(ICON_ADMIN_BLOCK, "🚫")} <b>Блокировка пользователя</b>\n\nПришли мне его Telegram ID (число).\n\nОтменить — команда /cancel`
        );
    })
    .icon(ICON_ADMIN_BLOCK)
    .row()
    .text("Разблокировать пользователя", async (ctx) => {
        setAdminState(ctx.from.id, "awaiting_unblock_id");
        await safeEditMessageText(
            ctx,
            `${tgEmoji(ICON_ADMIN_UNBLOCK, "✅")} <b>Разблокировка пользователя</b>\n\nПришли мне его Telegram ID (число).\n\nОтменить — команда /cancel`
        );
    })
    .icon(ICON_ADMIN_UNBLOCK)
    .row()
    .text("Дизайн", async (ctx) => {
        setAdminState(ctx.from.id, "awaiting_design_image");
        const current = getDesignImage()
            ? "Сейчас картинка уже установлена — новая её заменит."
            : "Сейчас картинка не установлена.";
        await safeEditMessageText(
            ctx,
            `${tgEmoji(ICON_ADMIN_DESIGN, "🎨")} <b>Дизайн главного меню</b>\n\n${current}\n\nПришли картинку, которая будет показываться на главном меню (/start).\n\nУбрать текущую картинку — команда /removeimage\nОтменить — команда /cancel`
        );
    })
    .icon(ICON_ADMIN_DESIGN)
    .row()
    .text("Список заблокированных", async (ctx) => {
        clearAdminState(ctx.from.id);
        const list = Array.from(blockedUsers);
        const text = list.length
            ? `${tgEmoji(ICON_ADMIN_LIST, "📋")} <b>Заблокированные пользователи:</b>\n\n${list.map((id) => `• <code>${id}</code>`).join("\n")}`
            : `${tgEmoji(ICON_ADMIN_LIST, "📋")} <b>Список заблокированных пуст.</b>`;
        await safeEditMessageText(ctx, text, { reply_markup: adminMenu });
    })
    .icon(ICON_ADMIN_LIST)
    .row()
    .text("Выдать Premium", async (ctx) => {
        setAdminState(ctx.from.id, "awaiting_premium_grant_id");
        await safeEditMessageText(
            ctx,
            `${tgEmoji(ICON_ADMIN_PREMIUM, "🙈")} <b>Выдать Premium</b>\n\nПришли Telegram ID пользователя, кому выдать подписку (на любой срок — например, если оплата зависла или хочешь подарить).\n\nОтменить — команда /cancel`
        );
    })
    .icon(ICON_ADMIN_PREMIUM)
    .row()
    .text("Забрать Premium", async (ctx) => {
        setAdminState(ctx.from.id, "awaiting_premium_revoke_id");
        await safeEditMessageText(
            ctx,
            `${tgEmoji(ICON_ADMIN_REVOKE, "🚫")} <b>Забрать Premium</b>\n\nПришли Telegram ID пользователя, у которого нужно отключить подписку.\n\nОтменить — команда /cancel`
        );
    })
    .icon(ICON_ADMIN_REVOKE)
    .row()
    .webApp("Создать промокод", `${MINIAPP_URL}/?screen=promo-admin`)
    .icon(ICON_ADMIN_PROMO)
    .row()
    .text("Забанить в Mini App", async (ctx) => {
        setAdminState(ctx.from.id, "awaiting_miniapp_ban_id");
        await safeEditMessageText(
            ctx,
            `${tgEmoji(ICON_ADMIN_MINIAPP_BAN, "🚫")} <b>Забанить в Mini App</b>\n\nПришли Telegram ID пользователя — ему закроется доступ к покупке/действиям в приложении.\n\nОтменить — команда /cancel`
        );
    })
    .icon(ICON_ADMIN_MINIAPP_BAN)
    .row()
    .text("Разбанить в Mini App", async (ctx) => {
        setAdminState(ctx.from.id, "awaiting_miniapp_unban_id");
        await safeEditMessageText(
            ctx,
            `${tgEmoji(ICON_ADMIN_MINIAPP_UNBAN, "✅")} <b>Разбанить в Mini App</b>\n\nПришли Telegram ID пользователя.\n\nОтменить — команда /cancel`
        );
    })
    .icon(ICON_ADMIN_MINIAPP_UNBAN);

module.exports = {
    adminMenu,
    ADMIN_TEXT,
    ADMIN_MENU_CALLBACK,
    isBlocked,
    blockUser,
    unblockUser,
    getDesignImage,
    setDesignImage,
    clearDesignImage,
    setAdminState,
    getAdminState,
    clearAdminState,
    stripTgEmoji
};
