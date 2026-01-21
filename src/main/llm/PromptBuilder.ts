import {
  GameAgent,
  GameEvent,
  Phase,
  GameState,
  Role,
} from '../../shared/types';
import { VisibilityFilter } from '../engine/Visibility';
import type { LLMMessage } from '../services/llm';
import { loadPrompt, injectVariables } from './PromptLoader';

// Phase to prompt file mapping
const PHASE_PROMPT_MAP: Record<Phase, string> = {
  DAY_DISCUSSION: 'discuss_day.md',
  DAY_VOTE: 'vote_day.md',
  LAST_WORDS: 'last_words.md',
  POST_EXECUTION_DISCUSSION: 'discuss_day_post.md',
  DOCTOR_CHOICE: 'doctor_choice.md',
  SHERIFF_CHOICE: 'sheriff_choice.md',
  SHERIFF_POST_SPEECH: 'sheriff_post.md',
  LOOKOUT_CHOICE: 'lookout_choice.md',
  LOOKOUT_POST_SPEECH: 'lookout_post.md',
  NIGHT_DISCUSSION: 'discuss_night.md',
  NIGHT_VOTE: 'vote_night.md',
};

// Role descriptions
const ROLE_DESCRIPTIONS: Record<Role, string> = {
  MAFIA: 'You are a member of the Mafia. At night, you secretly choose a town member to eliminate. During the day, blend in with town and avoid suspicion.',
  SHERIFF: 'You are the Sheriff. Each night you can investigate one player to learn their role. Use this information to help the town.',
  DOCTOR: 'You are the Doctor. Each night you can protect one player. If the mafia targets them, they will survive. You can protect yourself.',
  CITIZEN: 'You are a Citizen. You have no special abilities, but your vote is crucial. Watch behavior and voting patterns to identify mafia.',
  LOOKOUT: 'You are the Lookout. Each night you can watch one player. If anyone visits that player during the night, you will see who visited them. Use this information to identify suspicious behavior.',
};

const ROLE_ORDER: Role[] = ['MAFIA', 'SHERIFF', 'DOCTOR', 'LOOKOUT', 'CITIZEN'];

export class PromptBuilder {
  // Build system prompt for an agent based on phase
  static buildSystemPrompt(
    agent: GameAgent,
    phase: Phase,
    state: GameState
  ): string {
    // Load boilerplate and phase prompt
    const boilerTemplate = loadPrompt('boiler.md');
    const phaseTemplate = loadPrompt(PHASE_PROMPT_MAP[phase]);

    // Prepare template variables
    const variables = this.buildTemplateVariables(agent, state);

    // Inject variables into both templates
    const boiler = injectVariables(boilerTemplate, variables);
    const phasePrompt = injectVariables(phaseTemplate, variables);

    return boiler + '\n\n' + phasePrompt;
  }

  static buildUserMessageSystemPrompt(
    agent: GameAgent,
    state: GameState
  ): string {
    const boilerTemplate = loadPrompt('boiler.md');
    const userMessageTemplate = loadPrompt('user_message.md');
    const variables = this.buildTemplateVariables(agent, state);

    const boiler = injectVariables(boilerTemplate, variables);
    const userMessage = injectVariables(userMessageTemplate, variables);

    return boiler + '\n\n' + userMessage;
  }

  // Build template variables for prompt injection
  private static buildTemplateVariables(
    agent: GameAgent,
    state: GameState
  ): Record<string, string> {
    const aliveAgents = state.agents.filter((a) => a.alive);
    const deadAgents = state.agents.filter((a) => !a.alive);

    // Get unique roles in the game
    const activeRoles = [...new Set(state.agents.map((a) => a.role))];
    const roleCounts = ROLE_ORDER.map((role) => {
      const count = state.agents.filter((a) => a.role === role).length;
      return `${role}: ${count}`;
    }).join(', ');

    return {
      name: agent.name,
      role: agent.role,
      roleDescription: ROLE_DESCRIPTIONS[agent.role],
      faction: agent.faction,
      opposingFaction: agent.faction === 'MAFIA' ? 'TOWN' : 'MAFIA',
      personality: agent.personality,
      rolesList: activeRoles.join(', '),
      roleCounts,
      livingPlayers: aliveAgents.map((a) => a.name).join(', '),
      deadPlayers: deadAgents.length > 0
        ? deadAgents.map((a) => `${a.name} (${a.role})`).join(', ')
        : 'None',
      timeOfDay: state.phase.includes('NIGHT') || state.phase.includes('SHERIFF') || state.phase.includes('DOCTOR')
        ? 'Night'
        : 'Day',
      dayNumber: String(state.dayNumber),
    };
  }

  // Convert game events to LLM messages for an agent
  static buildConversationHistory(
    agent: GameAgent,
    events: GameEvent[],
    includePrivateMessages: boolean = true
  ): LLMMessage[] {
    const visibleEvents = VisibilityFilter.getVisibleEvents(agent, events);
    const messages: LLMMessage[] = [];

    for (const event of visibleEvents) {
      const formatted = this.formatEventForAgent(event, agent);
      if (formatted) {
        messages.push({
          role: formatted.role,
          content: formatted.content,
        });
      }
    }

    // Merge consecutive messages of the same role
    const mergedMessages: LLMMessage[] = [];
    for (const msg of messages) {
      const lastMsg = mergedMessages[mergedMessages.length - 1];
      if (lastMsg && lastMsg.role === msg.role) {
        lastMsg.content += '\n\n' + msg.content;
      } else {
        mergedMessages.push(msg);
      }
    }

    return mergedMessages;
  }

  // Format a single event for display
  private static formatEventForAgent(
    event: GameEvent,
    agent: GameAgent
  ): { role: 'user' | 'assistant'; content: string } | null {
    switch (event.type) {
      case 'NARRATION':
        return { role: 'user', content: `NARRATOR: ${event.textMarkdown}` };

      case 'PHASE_CHANGE':
        return null; // Phase changes are handled in system prompt

      case 'SPEECH':
        // Agent's own speech is returned as assistant message (just the content)
        if (event.agentId === agent.id) {
          return { role: 'assistant', content: event.messageMarkdown };
        }
        // Other agents' speech is a user message
        return { role: 'user', content: `${this.getAgentNamePlaceholder(event.agentId)} said: ${event.messageMarkdown}` };

      case 'VOTE':
        const isOwnVote = event.agentId === agent.id;
        const voterName = isOwnVote ? 'You' : this.getAgentNamePlaceholder(event.agentId);
        const voteContent = event.targetName === 'DEFER'
          ? `${voterName} abstained from voting.`
          : `${voterName} voted for ${event.targetName}.`;
        return { role: 'user', content: voteContent };

      case 'CHOICE':
        // Choice events are private - show only to the agent who made the choice
        if (event.agentId === agent.id) {
          let action: string;
          if (event.choiceType === 'DOCTOR_PROTECT') {
            action = 'protect';
          } else if (event.choiceType === 'SHERIFF_INVESTIGATE') {
            action = 'investigate';
          } else {
            action = 'watch';
          }
          return { role: 'user', content: `SYSTEM: You chose to ${action} ${event.targetName}.` };
        }
        return null;

      case 'INVESTIGATION_RESULT':
        // This should be a private message to sheriff
        return { role: 'user', content: `SYSTEM (private): Last night you investigated ${this.getAgentNamePlaceholder(event.targetId)}. Role = ${event.targetRole}.` };

      case 'DEATH':
        return null; // Deaths are narrated separately
    }
  }

  // Placeholder - actual name resolution happens in GameController
  private static getAgentNamePlaceholder(agentId: string): string {
    return `[AGENT:${agentId}]`;
  }

  // Resolve agent name placeholders
  static resolveAgentNames(
    content: string,
    agents: GameAgent[]
  ): string {
    let resolved = content;
    for (const agent of agents) {
      resolved = resolved.replace(
        new RegExp(`\\[AGENT:${agent.id}\\]`, 'g'),
        agent.name
      );
    }
    return resolved;
  }

  // Build messages with resolved names
  static buildMessagesForAgent(
    agent: GameAgent,
    events: GameEvent[],
    allAgents: GameAgent[]
  ): LLMMessage[] {
    const messages = this.buildConversationHistory(agent, events);

    // Resolve agent name placeholders
    for (const msg of messages) {
      msg.content = this.resolveAgentNames(msg.content, allAgents);
    }

    return messages;
  }
}
