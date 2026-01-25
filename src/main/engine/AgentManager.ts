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

  getAliveVigilante(): GameAgent | undefined {
    const vigilantes = this.getAliveAgentsByRole('VIGILANTE');
    return vigilantes.length > 0 ? vigilantes[0] : undefined;
  }

  getAliveMayor(): GameAgent | undefined {
    const mayors = this.getAliveAgentsByRole('MAYOR');
    return mayors.length > 0 ? mayors[0] : undefined;
  }

  getAliveFramer(): GameAgent | undefined {
    const framers = this.getAliveAgentsByRole('FRAMER');
    return framers.length > 0 ? framers[0] : undefined;
  }

  getAliveConsigliere(): GameAgent | undefined {
    const consiglieres = this.getAliveAgentsByRole('CONSIGLIERE');
    return consiglieres.length > 0 ? consiglieres[0] : undefined;
  }

  getAliveGodfather(): GameAgent | undefined {
    const godfathers = this.getAliveAgentsByRole('GODFATHER');
    return godfathers.length > 0 ? godfathers[0] : undefined;
  }

  getAliveWerewolf(): GameAgent | undefined {
    const werewolves = this.getAliveAgentsByRole('WEREWOLF');
    return werewolves.length > 0 ? werewolves[0] : undefined;
  }

  getAliveJailor(): GameAgent | undefined {
    const jailors = this.getAliveAgentsByRole('JAILOR');
    return jailors.length > 0 ? jailors[0] : undefined;
  }

  // Get eligible targets for jailor (alive agents except self)
  getJailorTargets(jailorId: string): GameAgent[] {
    return this.getAliveAgents().filter((a) => a.id !== jailorId);
  }

  revealMayor(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent && agent.role === 'MAYOR') {
      agent.hasRevealedMayor = true;
    }
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
        hasRevealedMayor: false,
      };
      this.addAgent(agent);
    }
  }

  // Get eligible voters for day vote (all alive agents)
  getDayVoters(): GameAgent[] {
    return this.getAliveAgents();
  }

  // Get eligible voters for night vote (alive mafia only, excluding Framer and Consigliere)
  getNightVoters(): GameAgent[] {
    return this.getAliveMafia().filter(a => a.role !== 'FRAMER' && a.role !== 'CONSIGLIERE');
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

  // Get eligible targets for vigilante kill (alive agents except self)
  getVigilanteTargets(vigilanteId: string): GameAgent[] {
    return this.getAliveAgents().filter((a) => a.id !== vigilanteId);
  }

  // Get eligible targets for framer (alive agents except self and other mafia)
  getFramerTargets(framerId: string): GameAgent[] {
    return this.getAliveAgents().filter((a) => a.id !== framerId && a.faction !== 'MAFIA');
  }

  // Get eligible targets for consigliere investigation (alive agents except self)
  getConsigliereTargets(consigliereId: string): GameAgent[] {
    return this.getAliveAgents().filter((a) => a.id !== consigliereId);
  }

  // Get eligible targets for werewolf rampage (all alive agents including self for stay-home)
  getWerewolfTargets(): GameAgent[] {
    return this.getAliveAgents();  // Can target self to stay home
  }

  // Get eligible targets for Jester haunt (voters who voted guilty or abstained)
  getJesterHauntTargets(eligibleVoterIds: string[]): GameAgent[] {
    return this.getAliveAgents().filter(a => eligibleVoterIds.includes(a.id));
  }

  // Reset all agents to alive for new game
  resetForNewGame(): void {
    for (const agent of this.agents.values()) {
      agent.alive = true;
      agent.hasRevealedMayor = false;
    }
  }

  // Clear all agents
  clear(): void {
    this.agents.clear();
  }
}
