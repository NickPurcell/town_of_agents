import React, { useEffect, useRef } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useChatStore } from '../../store/chatStore';
import styles from './ContextMenu.module.css';

export function ContextMenu() {
  const { contextMenuChat, contextMenuPosition, hideContextMenu } = useUIStore();
  const { chatIndex, startChat, stopChat, deleteChat, loadChat } = useChatStore();
  const { setScreen } = useUIStore();
  const menuRef = useRef<HTMLDivElement>(null);

  const chatEntry = chatIndex.find(c => c.id === contextMenuChat);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        hideContextMenu();
      }
    };

    if (contextMenuChat) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenuChat, hideContextMenu]);

  if (!contextMenuChat || !contextMenuPosition || !chatEntry) {
    return null;
  }

  const handleActivate = async () => {
    await startChat(contextMenuChat);
    await loadChat(contextMenuChat);
    setScreen('chat');
    hideContextMenu();
  };

  const handleDeactivate = async () => {
    await stopChat(contextMenuChat);
    hideContextMenu();
  };

  const handleDelete = async () => {
    await deleteChat(contextMenuChat);
    hideContextMenu();
  };

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{
        left: contextMenuPosition.x,
        top: contextMenuPosition.y
      }}
    >
      {chatEntry.isActive ? (
        <button className={styles.menuItem} onClick={handleDeactivate}>
          ⏸️ Deactivate
        </button>
      ) : (
        <button className={styles.menuItem} onClick={handleActivate}>
          ▶️ Activate
        </button>
      )}
      <button className={`${styles.menuItem} ${styles.danger}`} onClick={handleDelete}>
        🗑️ Delete
      </button>
    </div>
  );
}
