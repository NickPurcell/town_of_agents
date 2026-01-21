import { GameEvent, GameAgent, Phase } from '../../shared/types';
import { VisibilityFilter } from '../engine/Visibility';

export class ConversationStore {
  private events: GameEvent[] = [];

  constructor() {}

  // Append a new event to the log
  appendEvent(event: GameEvent): void {
    this.events.push(event);
  }

  // Get all events
  getAllEvents(): GameEvent[] {
    return [...this.events];
  }

  // Get events visible to a specific agent
  getEventsForAgent(agent: GameAgent): GameEvent[] {
    return VisibilityFilter.getVisibleEvents(agent, this.events);
  }

  // Get public events only
  getPublicEvents(): GameEvent[] {
    return this.events.filter((e) => e.visibility.kind === 'public');
  }

  // Get events by type
  getEventsByType<T extends GameEvent['type']>(
    type: T
  ): Extract<GameEvent, { type: T }>[] {
    return this.events.filter((e) => e.type === type) as Extract<
      GameEvent,
      { type: T }
    >[];
  }

  // Get events since a timestamp
  getEventsSince(ts: number): GameEvent[] {
    return this.events.filter((e) => e.ts > ts);
  }

  // Get the last N events
  getLastEvents(count: number): GameEvent[] {
    return this.events.slice(-count);
  }

  // Get events for a specific phase
  getEventsForPhase(phase: Phase): GameEvent[] {
    // Find the last phase change to this phase
    let startIndex = -1;
    for (let i = this.events.length - 1; i >= 0; i--) {
      const event = this.events[i];
      if (event.type === 'PHASE_CHANGE' && event.phase === phase) {
        startIndex = i;
        break;
      }
    }

    if (startIndex === -1) return [];

    // Get all events from that point until next phase change
    const phaseEvents: GameEvent[] = [];
    for (let i = startIndex; i < this.events.length; i++) {
      const event = this.events[i];
      if (i > startIndex && event.type === 'PHASE_CHANGE') {
        break;
      }
      phaseEvents.push(event);
    }

    return phaseEvents;
  }

  // Get speeches for current discussion phase
  getSpeechesForCurrentPhase(): GameEvent[] {
    // Find last phase change
    let phaseStartIndex = -1;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].type === 'PHASE_CHANGE') {
        phaseStartIndex = i;
        break;
      }
    }

    if (phaseStartIndex === -1) return [];

    return this.events
      .slice(phaseStartIndex)
      .filter((e) => e.type === 'SPEECH');
  }

  // Get votes for current voting phase
  getVotesForCurrentPhase(): GameEvent[] {
    let phaseStartIndex = -1;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].type === 'PHASE_CHANGE') {
        phaseStartIndex = i;
        break;
      }
    }

    if (phaseStartIndex === -1) return [];

    return this.events.slice(phaseStartIndex).filter((e) => e.type === 'VOTE');
  }

  // Check if agent has spoken in current phase
  hasAgentSpokenInCurrentPhase(agentId: string): boolean {
    const speeches = this.getSpeechesForCurrentPhase();
    return speeches.some(
      (e) => e.type === 'SPEECH' && e.agentId === agentId
    );
  }

  // Check if agent has voted in current phase
  hasAgentVotedInCurrentPhase(agentId: string): boolean {
    const votes = this.getVotesForCurrentPhase();
    return votes.some((e) => e.type === 'VOTE' && e.agentId === agentId);
  }

  // Clear all events
  clear(): void {
    this.events = [];
  }

  // Get event count
  getEventCount(): number {
    return this.events.length;
  }

  // Serialize events for persistence (excluding UI-only data)
  serialize(): GameEvent[] {
    return this.events.map((event) => {
      // Events are already clean - UI thinking summaries are in response objects, not events
      return event;
    });
  }

  // Load events from serialized data
  load(events: GameEvent[]): void {
    this.events = [...events];
  }
}
