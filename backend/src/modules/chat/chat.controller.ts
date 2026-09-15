import type { FastifyReply, FastifyRequest } from 'fastify';
import { sendControllerError } from '../../lib/controller-error';
import type {
  AppendMessageBody,
  ChatParams,
  CreateChatBody,
  ListChatsQuery,
  ListMessagesQuery
} from '../../schemas/chat.schemas';
import type { ChatService } from './chat.service';

export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  createChat = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = request.body as CreateChatBody;

    try {
      const session = await this.chatService.createChat({
        userName: body.userName,
        reuseLatest: body.reuseLatest,
        historyLimit: body.historyLimit
      });

      return reply.code(session.reusedChat ? 200 : 201).send(session);
    } catch (error) {
      return sendControllerError(request, reply, error, 'Failed to create chat');
    }
  };

  listChats = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as ListChatsQuery;

    try {
      const chats = await this.chatService.listChats(query.limit);
      return { chats };
    } catch (error) {
      return sendControllerError(request, reply, error, 'Failed to list chats');
    }
  };

  listMessages = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as ChatParams;
    const query = request.query as ListMessagesQuery;

    try {
      const messages = await this.chatService.listMessages({
        chatId: params.chatId,
        limit: query.limit,
        beforeMessageId: query.beforeMessageId
      });

      return { messages };
    } catch (error) {
      return sendControllerError(request, reply, error, 'Failed to list chat messages');
    }
  };

  appendMessage = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = request.params as ChatParams;
    const body = request.body as AppendMessageBody;

    try {
      const message = await this.chatService.appendMessage({
        chatId: params.chatId,
        senderRole: body.senderRole,
        senderName: body.senderName,
        content: body.content
      });

      return reply.code(201).send({ message });
    } catch (error) {
      return sendControllerError(request, reply, error, 'Failed to append message');
    }
  };
}
