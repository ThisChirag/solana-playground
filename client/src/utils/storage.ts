interface ChatHistory {
  prompt: string;
  response: string;
}

export class ChatStorageManager {
  private static getStorageKey(filePath: string): string {
    return `pg_chat_history_${filePath}`;
  }

  static saveHistory(filePath: string, history: ChatHistory[]): void {
    try {
      localStorage.setItem(
        this.getStorageKey(filePath),
        JSON.stringify(history)
      );
    } catch (error) {
      console.error('Failed to save chat history:', error);
    }
  }

  static loadHistory(filePath: string): ChatHistory[] {
    try {
      const stored = localStorage.getItem(this.getStorageKey(filePath));
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load chat history:', error);
      return [];
    }
  }

  static clearHistory(filePath: string): void {
    localStorage.removeItem(this.getStorageKey(filePath));
  }

  static clearAllHistory(): void {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('pg_chat_history_')) {
        localStorage.removeItem(key);
      }
    });
  }
}

// Make it a module by adding an export
export type { ChatHistory }; 