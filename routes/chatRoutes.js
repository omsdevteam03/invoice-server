// server/routes/chatRoutes.js
// Registered in server.js as: fastify.register(chatRoutes, { prefix: "/api/chat" })

import {
  createChat,
  listChats,
  getChat,
  renameChat,
  deleteChat,
  sendMessage,
  editMessage,
  getUsage,
} from "../controllers/chatController.js";

export default async function chatRoutes(fastify) {
  fastify.post("/", createChat);               // POST   /api/chat            -> create new chat
  fastify.get("/", listChats);                  // GET    /api/chat            -> list all chats
  fastify.get("/usage", getUsage);               // GET    /api/chat/usage      -> daily message usage
  fastify.get("/:chatId", getChat);              // GET    /api/chat/:chatId    -> get one chat + messages
  fastify.put("/:chatId", renameChat);           // PUT    /api/chat/:chatId    -> rename chat
  fastify.delete("/:chatId", deleteChat);        // DELETE /api/chat/:chatId    -> delete chat
  fastify.post("/:chatId/messages", sendMessage); // POST  /api/chat/:chatId/messages -> send message, get AI reply
  fastify.put("/:chatId/messages/:messageId", editMessage); // PUT /api/chat/:chatId/messages/:messageId -> edit message, regenerate AI reply
}