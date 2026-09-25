import db from "../config/db.js";

// ── Chats ──────────────────────────────────────────────

export async function createChat(userId, title = "New Chat") {
  const { rows } = await db.query(
    `INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING *`,
    [userId ?? null, title]
  );
  return rows[0];
}

// Returns all chats for a user (or all chats globally if userId is null —
// single-tenant fallback until auth is wired up), newest activity first.
export async function listChats(userId) {
  const { rows } = await db.query(
    `SELECT c.id, c.title, c.created_at, c.updated_at
     FROM chats c
     WHERE ($1::int IS NULL OR c.user_id = $1)
     ORDER BY c.updated_at DESC`,
    [userId ?? null]
  );
  return rows;
}

export async function getChatById(chatId, userId) {
  const { rows } = await db.query(
    `SELECT * FROM chats WHERE id = $1 AND ($2::int IS NULL OR user_id = $2)`,
    [chatId, userId ?? null]
  );
  return rows[0] || null;
}

export async function renameChat(chatId, title, userId) {
  const { rows } = await db.query(
    `UPDATE chats
     SET title = $1, updated_at = now()
     WHERE id = $2 AND ($3::int IS NULL OR user_id = $3)
     RETURNING *`,
    [title, chatId, userId ?? null]
  );
  return rows[0] || null;
}

export async function touchChat(chatId) {
  await db.query(`UPDATE chats SET updated_at = now() WHERE id = $1`, [chatId]);
}

export async function deleteChat(chatId, userId) {
  const { rowCount } = await db.query(
    `DELETE FROM chats WHERE id = $1 AND ($2::int IS NULL OR user_id = $2)`,
    [chatId, userId ?? null]
  );
  return rowCount > 0;
}

// ── Messages ───────────────────────────────────────────

export async function getMessages(chatId) {
  const { rows } = await db.query(
    `SELECT id, role, content, created_at
     FROM chat_messages
     WHERE chat_id = $1
     ORDER BY created_at ASC`,
    [chatId]
  );
  return rows;
}

export async function addMessage(chatId, role, content) {
  const { rows } = await db.query(
    `INSERT INTO chat_messages (chat_id, role, content)
     VALUES ($1, $2, $3)
     RETURNING id, role, content, created_at`,
    [chatId, role, content]
  );
  await touchChat(chatId);
  return rows[0];
}

export async function countMessages(chatId) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS count FROM chat_messages WHERE chat_id = $1`,
    [chatId]
  );
  return rows[0].count;
}

// Fetches a single message by id, including its chat_id, so the caller
// can confirm it actually belongs to the chat being edited before
// touching it.
export async function getMessageById(messageId) {
  const { rows } = await db.query(
    `SELECT id, chat_id, role, content, created_at FROM chat_messages WHERE id = $1`,
    [messageId]
  );
  return rows[0] || null;
}

// Overwrites a message's content in place (used by "Edit message").
export async function updateMessageContent(messageId, content) {
  const { rows } = await db.query(
    `UPDATE chat_messages SET content = $1 WHERE id = $2
     RETURNING id, role, content, created_at`,
    [content, messageId]
  );
  return rows[0] || null;
}

// Deletes every message that came after this one in the chat — used when
// editing a message, since the old AI reply (and anything after it) no
// longer makes sense once the question that produced it has changed.
// Relies on `id` being sequential/auto-incrementing so "id > messageId"
// means "came later". If chat_messages.id is a UUID instead of a serial
// integer, this needs to compare created_at instead.
export async function deleteMessagesAfter(chatId, messageId) {
  await db.query(
    `DELETE FROM chat_messages WHERE chat_id = $1 AND id > $2`,
    [chatId, messageId]
  );
}