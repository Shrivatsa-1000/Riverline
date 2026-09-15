import { useEffect, useRef, useState } from 'react';
import { Bot, SendHorizontal } from 'lucide-react';
import type { ChatItem } from '../../types/dashboard';
import './ChatPanel.css';

interface ChatPanelProps {
  chatItems: ChatItem[];
  userName: string;
  chatStatus: string;
  isSending: boolean;
  onSendMessage: (text: string) => Promise<void>;
}

export function ChatPanel({ chatItems, userName, chatStatus, isSending, onSendMessage }: ChatPanelProps) {
  const [message, setMessage] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const safeUserName = userName.trim() || 'Ankit';
  const userInitial = safeUserName.charAt(0).toUpperCase();

  const handleSend = async () => {
    const nextMessage = message.trim();

    if (!nextMessage || isSending) {
      return;
    }

    setMessage('');
    await onSendMessage(nextMessage);
  };

  useEffect(() => {
    if (!listRef.current) {
      return;
    }

    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [chatItems]);

  return (
    <section className="panel chat-panel">
      <div className="chat-title">
        <Bot size={16} />
        Chat with Paisa
      </div>

      <p className="chat-status">{chatStatus}</p>

      <div className="chat-list" ref={listRef}>
        {chatItems.map((item) => {
          const isOwn = item.senderRole === 'user';

          return (
            <article className={`chat-item ${isOwn ? 'chat-item--own' : ''}`} key={item.id}>
              <div className="chat-item__avatar">{isOwn ? userInitial : 'P'}</div>

              <div className="chat-item__bubble">
                <div className="chat-item__meta">
                  <span>{isOwn ? safeUserName : item.senderName || 'Paisa'}</span>
                  <span>{item.at}</span>
                </div>
                <p>{item.text}</p>
              </div>
            </article>
          );
        })}
      </div>

      <div className="chat-input">
        <input
          aria-label="Type a message"
          className="chat-input__field"
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Type a message..."
          type="text"
          value={message}
        />

        <button
          aria-label="Send message"
          className="chat-input__send"
          disabled={isSending || !message.trim()}
          onClick={() => {
            void handleSend();
          }}
          type="button"
        >
          <SendHorizontal size={14} />
        </button>
      </div>
    </section>
  );
}
