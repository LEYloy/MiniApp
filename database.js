const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "database.sqlite");
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error("Ошибка подключения к SQLite:", err.message);
    else console.log("📦 База данных SQLite успешно подключена.");
});

// ВАЖНО: PRIMARY KEY — составной (chat_id, message_id), а НЕ просто message_id.
// message_id у Telegram уникален только В ПРЕДЕЛАХ одного чата — если бот ведёт
// несколько бизнес-переписок, номера сообщений в разных чатах могут совпадать.
// Со старой схемой (PRIMARY KEY message_id) совпадение номера в двух разных чатах
// приводило к тому, что INSERT OR REPLACE затирал чужую запись — и при удалении/
// редактировании бот доставал file_id от ОДНОГО сообщения с media_type от ДРУГОГО,
// из-за чего Telegram абсолютно законно отвечал DOCUMENT_INVALID (или PHOTO_INVALID
// и т.п.) при попытке переслать файл не того типа.
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            message_id INTEGER,
            chat_id INTEGER,
            user_name TEXT,
            username TEXT,
            text TEXT,
            media_type TEXT,
            file_id TEXT,
            PRIMARY KEY (chat_id, message_id)
        )
    `);

    // Одноразовая миграция со старой схемы (если она есть у уже существующей базы).
    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='messages_old'", (errOld, oldExists) => {
        if (errOld) return;
        // На случай если миграция уже была начата и прервалась — не мешаем.
        if (oldExists) return;
    });

    db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='messages'", (err, row) => {
        if (err || !row) return;
        const isOldSchema = row.sql && /message_id\s+INTEGER\s+PRIMARY\s+KEY/i.test(row.sql);
        if (!isOldSchema) return; // уже новая схема — ничего не делаем

        console.log("📦 Обнаружена старая схема БД (PRIMARY KEY только message_id) — мигрирую на составной ключ (chat_id, message_id)...");

        db.run("ALTER TABLE messages RENAME TO messages_old", (renameErr) => {
            if (renameErr) {
                console.error("💥 Не удалось переименовать старую таблицу для миграции:", renameErr.message);
                return;
            }
            db.run(`
                CREATE TABLE IF NOT EXISTS messages (
                    message_id INTEGER,
                    chat_id INTEGER,
                    user_name TEXT,
                    username TEXT,
                    text TEXT,
                    media_type TEXT,
                    file_id TEXT,
                    PRIMARY KEY (chat_id, message_id)
                )
            `, () => {
                db.run(`
                    INSERT OR IGNORE INTO messages (message_id, chat_id, user_name, username, text, media_type, file_id)
                    SELECT message_id, chat_id, user_name, username, text, media_type, file_id FROM messages_old
                `, (copyErr) => {
                    if (copyErr) {
                        console.error("💥 Ошибка копирования данных при миграции БД:", copyErr.message);
                        return;
                    }
                    db.run("DROP TABLE messages_old", () => {
                        console.log("📦 Миграция БД завершена успешно.");
                    });
                });
            });
        });
    });
});

module.exports = {
    saveMessage(messageId, chatId, userName, username, text, mediaType, fileId) {
        db.run(
            `INSERT OR REPLACE INTO messages (message_id, chat_id, user_name, username, text, media_type, file_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [messageId, chatId, userName, username, text, mediaType, fileId],
            (err) => { if (err) console.error("Ошибка записи в БД:", err.message); }
        );
    },

    updateMessageText(messageId, chatId, newText) {
        db.run("UPDATE messages SET text = ? WHERE message_id = ? AND chat_id = ?", [newText, messageId, chatId], (err) => {
            if (err) console.error("Ошибка обновления в БД:", err.message);
        });
    },

    // chatId теперь обязателен — без него message_id недостаточно, чтобы однозначно
    // найти сообщение (см. пояснение про составной ключ выше).
    getMessage(messageId, chatId, callback) {
        db.get("SELECT * FROM messages WHERE message_id = ? AND chat_id = ?", [messageId, chatId], (err, row) => {
            callback(err, row);
        });
    }
};
