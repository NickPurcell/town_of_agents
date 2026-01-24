import { GameAgent, GameEvent, Visibility, Phase } from '../../shared/types';

export class VisibilityFilter {
  // Filter events based on what an agent can see
  static getVisibleEvents(agent: GameAgent, events: GameEvent[]): GameEvent[] {
    return events.filter((event) => this.canSee(agent, event));
  }

  // Check if an agent can see a specific event
  static canSee(agent: GameAgent, event: GameEvent): boolean {
    const visibility = event.visibility;

    switch (visibility.kind) {
      case 'public':
        return true;

      case 'mafia':
        return agent.faction === 'MAFIA';

      case 'sheriff_private':
        return visibility.agentId === agent.id;

      case 'doctor_private':
        return visibility.agentId === agent.id;

      case 'lookout_private':
        return visibility.agentId === agent.id;

      case 'vigilante_private':
        return visibility.agentId === agent.id;

      case 'mayor_private':
        return visibility.agentId === agent.id;

      case 'framer_private':
        return visibility.agentId === agent.id;

      case 'consigliere_private':
        return visibility.agentId === agent.id;

      case 'werewolf_private':
        return visibility.agentId === agent.id;

      case 'host':
        return false; // Only visible to host/UI
    }
  }

  // Create visibility for public events
  static public(): Visibility {
    return { kind: 'public' };
  }

  // Create visibility for mafia-only events
  static mafia(): Visibility {
    return { kind: 'mafia' };
  }

  // Create visibility for sheriff private events
  static sheriffPrivate(agentId: string): Visibility {
    return { kind: 'sheriff_private', agentId };
  }

  // Create visibility for doctor private events
  static doctorPrivate(agentId: string): Visibility {
    return { kind: 'doctor_private', agentId };
  }

  // Create visibility for lookout private events
  static lookoutPrivate(agentId: string): Visibility {
    return { kind: 'lookout_private', agentId };
  }

  // Create visibility for vigilante private events
  static vigilantePrivate(agentId: string): Visibility {
    return { kind: 'vigilante_private', agentId };
  }

  // Create visibility for mayor private events
  static mayorPrivate(agentId: string): Visibility {
    return { kind: 'mayor_private', agentId };
  }

  // Create visibility for framer private events
  static framerPrivate(agentId: string): Visibility {
    return { kind: 'framer_private', agentId };
  }

  // Create visibility for consigliere private events
  static consiglierePrivate(agentId: string): Visibility {
    return { kind: 'consigliere_private', agentId };
  }

  // Create visibility for werewolf private events
  static werewolfPrivate(agentId: string): Visibility {
    return { kind: 'werewolf_private', agentId };
  }

  // Create visibility for host-only events
  static host(): Visibility {
    return { kind: 'host' };
  }

  // Get appropriate visibility for a phase
  static forPhase(phase: Phase, agent?: GameAgent): Visibility {
    switch (phase) {
      case 'DAY_ONE_DISCUSSION':
      case 'DAY_DISCUSSION':
      case 'DAY_VOTE':
      case 'LAST_WORDS':
      case 'POST_EXECUTION_DISCUSSION':
        return this.public();

      case 'NIGHT_DISCUSSION':
      case 'NIGHT_VOTE':
        return this.mafia();

      case 'SHERIFF_CHOICE':
      case 'SHERIFF_POST_SPEECH':
        return agent ? this.sheriffPrivate(agent.id) : this.host();

      case 'DOCTOR_PRE_SPEECH':
      case 'DOCTOR_CHOICE':
        return agent ? this.doctorPrivate(agent.id) : this.host();

      case 'LOOKOUT_CHOICE':
      case 'LOOKOUT_POST_SPEECH':
        return agent ? this.lookoutPrivate(agent.id) : this.host();

      case 'VIGILANTE_PRE_SPEECH':
      case 'VIGILANTE_CHOICE':
        return agent ? this.vigilantePrivate(agent.id) : this.host();

      case 'FRAMER_PRE_SPEECH':
      case 'FRAMER_CHOICE':
        return agent ? this.framerPrivate(agent.id) : this.host();

      case 'CONSIGLIERE_PRE_SPEECH':
      case 'CONSIGLIERE_CHOICE':
      case 'CONSIGLIERE_POST_SPEECH':
        return agent ? this.consiglierePrivate(agent.id) : this.host();

      case 'WEREWOLF_PRE_SPEECH':
      case 'WEREWOLF_CHOICE':
        return agent ? this.werewolfPrivate(agent.id) : this.host();

      case 'MAYOR_REVEAL_CHOICE':
        return agent ? this.mayorPrivate(agent.id) : this.host();
    }
  }

  // Get events visible to host (all events except none)
  static getHostVisibleEvents(events: GameEvent[]): GameEvent[] {
    // Host can see everything
    return events;
  }

  // Filter events for UI display based on current viewing mode
  static getUIVisibleEvents(
    events: GameEvent[],
    viewMode: 'public' | 'host' | 'agent',
    viewingAgent?: GameAgent
  ): GameEvent[] {
    switch (viewMode) {
      case 'public':
        return events.filter((e) => e.visibility.kind === 'public');

      case 'host':
        return events; // Host sees everything

      case 'agent':
        if (!viewingAgent) return events.filter((e) => e.visibility.kind === 'public');
        return this.getVisibleEvents(viewingAgent, events);
    }
  }
}
