import React from 'react';
import { useChatStore } from '../../store/chatStore';
import { useUIStore } from '../../store/uiStore';
import styles from './ChatList.module.css';

export function ChatList() {
  const { chatIndex, loadChat, currentChat } = useChatStore();
  const { setScreen, showContextMenu } = useUIStore();

  const handleClick = async (chatId: string) => {
    await loadChat(chatId);
    setScreen('chat');
  };

  const handleContextMenu = (e: React.MouseEvent, chatId: string) => {
    e.preventDefault();
    showContextMenu(chatId, { x: e.clientX, y: e.clientY });
  };

  if (chatIndex.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No chats yet</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {chatIndex.map(chat => (
        <div
          key={chat.id}
          className={`${styles.chatItem} ${currentChat?.id === chat.id ? styles.selected : ''}`}
          onClick={() => handleClick(chat.id)}
          onContextMenu={e => handleContextMenu(e, chat.id)}
        >
          <div className={styles.chatInfo}>
            <span className={styles.chatName}>{chat.name}</span>
            <span className={styles.chatMeta}>
              {chat.agentCount} agents · {chat.messageCount} messages
            </span>
          </div>
          <span className={styles.statusIcon}>
            {chat.isActive ? '✓' : '✗'}
          </span>
        </div>
      ))}
    </div>
  );
}
