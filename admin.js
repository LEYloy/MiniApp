const fs = require("fs");
const path = require("path");
const { Menu } = require("@grammyjs/menu");
const { tgEmoji } = require("./menu");

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
// ЗАМЕНИ значения ниже на свои собственные emoji-id.
// ============================================================
const EMOJI_ADMIN_TITLE_ID = "6007963990683030781";  // 🛠 заголовок панели
const ICON_ADMIN_BLOCK = "5416122415031820342";      // на кнопке "Заблокировать пользователя"
const ICON_ADMIN_UNBLOCK = "5416074955643203200";    // на кнопке "Разблокировать пользователя"
const ICON_ADMIN_DESIGN = "5431456208487716895";     // на кнопке "Дизайн"
const ICON_ADMIN_LIST = "5345835159268641541";       // на кнопке "Список заблокированных"
const ICON_ADMIN_PREMIUM = "5935757052042285202";    // на кнопке "Выдать Premium"

// ============================================================
// Тексты и клавиатуры
// ============================================================
const ADMIN_TEXT = `${tgEmoji(EMOJI_ADMIN_TITLE_ID, "\u200B")} <b>Панель администратора</b>\n\nВыбери действие:`;

const ADMIN_MENU_CALLBACK = "open_admin_menu";

const adminMenu = new Menu("admin-menu")
    .text("Заблокировать пользователя", async (ctx) => {
        setAdminState(ctx.from.id, "awaiting_block_id");
        await ctx.editMessageText(
            `${tgEmoji(ICON_ADMIN_BLOCK, "\u200B")} <b>Блокировка пользователя</b>\n\nПришли мне его Telegram ID (число).\n\nОтменить — команда /cancel`,
            { parse_mode: "HTML" }
        );
    })
    .icon(ICON_ADMIN_BLOCK)
    .row()
    .text("Разблокировать пользователя", async (ctx) => {
        setAdminState(ctx.from.id, "awaiting_unblock_id");
        await ctx.editMessageText(
            `${tgEmoji(ICON_ADMIN_UNBLOCK, "\u200B")} <b>Разблокировка пользователя</b>\n\nПришли мне его Telegram ID (число).\n\nОтменить — команда /cancel`,
            { parse_mode: "HTML" }
        );
    })
    .icon(ICON_ADMIN_UNBLOCK)
    .row()
    .text("Дизайн", async (ctx) => {
        setAdminState(ctx.from.id, "awaiting_design_image");
        const current = getDesignImage()
            ? "Сейчас картинка уже установлена — новая её заменит."
            : "Сейчас картинка не установлена.";
        await ctx.editMessageText(
            `${tgEmoji(ICON_ADMIN_DESIGN, "\u200B")} <b>Дизайн главного меню</b>\n\n${current}\n\nПришли картинку, которая будет показываться на главном меню (/start).\n\nУбрать текущую картинку — команда /removeimage\nОтменить — команда /cancel`,
            { parse_mode: "HTML" }
        );
    })
    .icon(ICON_ADMIN_DESIGN)
    .row()
    .text("Список заблокированных", async (ctx) => {
        clearAdminState(ctx.from.id);
        const list = Array.from(blockedUsers);
        const text = list.length
            ? `${tgEmoji(ICON_ADMIN_LIST, "\u200B")} <b>Заблокированные пользователи:</b>\n\n${list.map((id) => `• <code>${id}</code>`).join("\n")}`
            : `${tgEmoji(ICON_ADMIN_LIST, "\u200B")} <b>Список заблокированных пуст.</b>`;
        await ctx.editMessageText(text, { parse_mode: "HTML", reply_markup: adminMenu });
    })
    .icon(ICON_ADMIN_LIST)
    .row()
    .text("Выдать Premium", async (ctx) => {
        setAdminState(ctx.from.id, "awaiting_premium_grant_id");
        await ctx.editMessageText(
            `${tgEmoji(ICON_ADMIN_PREMIUM, "\u200B")} <b>Выдать Premium</b>\n\nПришли Telegram ID пользователя, кому выдать подписку (на любой срок — например, если оплата зависла или хочешь подарить).\n\nОтменить — команда /cancel`,
            { parse_mode: "HTML" }
        );
    })
    .icon(ICON_ADMIN_PREMIUM);

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
    clearAdminState
};
