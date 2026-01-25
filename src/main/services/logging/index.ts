import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { GameEvent, GameAgent, Faction } from '@shared/types';
import { formatGameEvent } from './formatters';

class LoggingService {
  private logFilePath: string | null = null;
  private agentLookup: Map<string, GameAgent> = new Map();
  private isLogging: boolean = false;

  /**
   * Get the logs directory path
   * Uses project root in dev, userData in production
   */
  private getLogsDirectory(): string {
    if (app.isPackaged) {
      // Production: use userData directory
      return path.join(app.getPath('userData'), '.logs');
    } else {
      // Development: app.getAppPath() returns project root
      return path.join(app.getAppPath(), '.logs');
    }
  }

  /**
   * Format current date/time as YYYY-MM-DD_HH-MM-SS
   */
  private formatTimestamp(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
  }

  /**
   * Format date/time for log header
   */
  private formatHeaderTimestamp(): string {
    const now = new Date();
    return now.toISOString().replace('T', ' ').substring(0, 19);
  }

  /**
   * Start logging for a new game session
   */
  async startLogging(agents: GameAgent[]): Promise<void> {
    try {
      // Build agent lookup map
      this.agentLookup.clear();
      for (const agent of agents) {
        this.agentLookup.set(agent.id, agent);
      }

      // Create logs directory if it doesn't exist
      const logsDir = this.getLogsDirectory();
      await fs.mkdir(logsDir, { recursive: true });

      // Create log file
      const timestamp = this.formatTimestamp();
      this.logFilePath = path.join(logsDir, `TOS_log_${timestamp}.txt`);

      // Write header
      const header = `=== TOS Game Log - ${this.formatHeaderTimestamp()} ===\n\n`;
      await fs.writeFile(this.logFilePath, header, 'utf-8');

      this.isLogging = true;
      console.log(`[LoggingService] Started logging to: ${this.logFilePath}`);
    } catch (error) {
      console.error('[LoggingService] Error starting logging:', error);
      this.isLogging = false;
    }
  }

  /**
   * Log a game event
   */
  async logEvent(event: GameEvent): Promise<void> {
    if (!this.isLogging || !this.logFilePath) {
      return;
    }

    try {
      const formattedEvent = formatGameEvent(event, this.agentLookup);
      await fs.appendFile(this.logFilePath, formattedEvent + '\n\n', 'utf-8');
    } catch (error) {
      console.error('[LoggingService] Error logging event:', error);
      // Don't interrupt gameplay - just log to console
    }
  }

  /**
   * Stop logging and write final footer
   */
  async stopLogging(winner: Faction | string): Promise<void> {
    if (!this.isLogging || !this.logFilePath) {
      return;
    }

    try {
      const footer = `=== Game Ended - Winner: ${winner} ===\n`;
      await fs.appendFile(this.logFilePath, footer, 'utf-8');
      console.log(`[LoggingService] Stopped logging. Winner: ${winner}`);
    } catch (error) {
      console.error('[LoggingService] Error stopping logging:', error);
    } finally {
      this.isLogging = false;
      this.logFilePath = null;
      this.agentLookup.clear();
    }
  }
}

// Singleton instance
let loggingServiceInstance: LoggingService | null = null;

/**
 * Get the singleton LoggingService instance
 */
export function getLoggingService(): LoggingService {
  if (!loggingServiceInstance) {
    loggingServiceInstance = new LoggingService();
  }
  return loggingServiceInstance;
}
