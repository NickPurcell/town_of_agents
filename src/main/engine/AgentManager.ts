import { GameAgent, Role, Faction, getFactionForRole } from '../../shared/types';

export class AgentManager {
  private agents: Map<string, GameAgent> = new Map();

  constructor() {}

  addAgent(agent: GameAgent): void {
    this.agents.set(agent.id, agent);
  }

  removeAgent(agentId: string): void {
    this.agents.delete(agentId);
  }

  getAgent(agentId: string): GameAgent | undefined {
    return this.agents.get(agentId);
  }

  getAgentByName(name: string): GameAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.name === name) {
        return agent;
      }
    }
    return undefined;
  }

  getAllAgents(): GameAgent[] {
    return Array.from(this.agents.values());
  }

  getAliveAgents(): GameAgent[] {
    return this.getAllAgents().filter((a) => a.alive);
  }

  getDeadAgents(): GameAgent[] {
    return this.getAllAgents().filter((a) => !a.alive);
  }

  getAgentsByRole(role: Role): GameAgent[] {
    return this.getAllAgents().filter((a) => a.role === role);
  }

  getAgentsByFaction(faction: Faction): GameAgent[] {
    return this.getAllAgents().filter((a) => a.faction === faction);
  }

  getAliveAgentsByRole(role: Role): GameAgent[] {
    return this.getAliveAgents().filter((a) => a.role === role);
  }

  getAliveAgentsByFaction(faction: Faction): GameAgent[] {
    return this.getAliveAgents().filter((a) => a.faction === faction);
  }

  getAliveMafia(): GameAgent[] {
    return this.getAliveAgentsByFaction('MAFIA');
  }

  getAliveTown(): GameAgent[] {
    return this.getAliveAgentsByFaction('TOWN');
  }

  getAliveSheriff(): GameAgent | undefined {
    const sheriffs = this.getAliveAgentsByRole('SHERIFF');
    return sheriffs.length > 0 ? sheriffs[0] : undefined;
  }

  getAliveDoctor(): GameAgent | undefined {
    const doctors = this.getAliveAgentsByRole('DOCTOR');
    return doctors.length > 0 ? doctors[0] : undefined;
  }

  getAliveLookout(): GameAgent | undefined {
    const lookouts = this.getAliveAgentsByRole('LOOKOUT');
    return lookouts.length > 0 ? lookouts[0] : undefined;
  }

  markAgentDead(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.alive = false;
    }
  }

  getAliveCount(): number {
    return this.getAliveAgents().length;
  }

  getAliveMafiaCount(): number {
    return this.getAliveMafia().length;
  }

  getAliveTownCount(): number {
    return this.getAliveTown().length;
  }

  // Initialize agents from configuration
  initializeAgents(agentConfigs: Omit<GameAgent, 'faction' | 'alive'>[]): void {
    this.agents.clear();
    for (const config of agentConfigs) {
      const agent: GameAgent = {
        ...config,
        faction: getFactionForRole(config.role),
        alive: true,
      };
      this.addAgent(agent);
    }
  }

  // Get eligible voters for day vote (all alive agents)
  getDayVoters(): GameAgent[] {
    return this.getAliveAgents();
  }

  // Get eligible voters for night vote (alive mafia only)
  getNightVoters(): GameAgent[] {
    return this.getAliveMafia();
  }

  // Get eligible targets for voting (alive agents)
  getVoteTargets(): GameAgent[] {
    return this.getAliveAgents();
  }

  // Get eligible targets for sheriff investigation (alive agents except self)
  getSheriffTargets(sheriffId: string): GameAgent[] {
    return this.getAliveAgents().filter((a) => a.id !== sheriffId);
  }

  // Get eligible targets for doctor protection (alive agents)
  getDoctorTargets(): GameAgent[] {
    return this.getAliveAgents();
  }

  // Get eligible targets for lookout watching (alive agents except self)
  getLookoutTargets(lookoutId: string): GameAgent[] {
    return this.getAliveAgents().filter((a) => a.id !== lookoutId);
  }

  // Reset all agents to alive for new game
  resetForNewGame(): void {
    for (const agent of this.agents.values()) {
      agent.alive = true;
    }
  }

  // Clear all agents
  clear(): void {
    this.agents.clear();
  }
}
