import type { Role, Faction } from '../types/game';

export interface DefaultAgentConfig {
  name: string;
  role: Role;
}

export const DEFAULT_AGENTS_BY_FACTION: Record<Faction, DefaultAgentConfig[]> = {
  MAFIA: [
    { name: 'Marcus', role: 'GODFATHER' },
    { name: 'Elena', role: 'CONSIGLIERE' },
    { name: 'Riley', role: 'FRAMER' },
  ],
  TOWN: [
    { name: 'James', role: 'SHERIFF' },
    { name: 'Sophie', role: 'DOCTOR' },
    { name: 'Ava', role: 'LOOKOUT' },
    { name: 'Oliver', role: 'MAYOR' },
    { name: 'Mia', role: 'VIGILANTE' },
    { name: 'Noah', role: 'JAILOR' },
    { name: 'Greta', role: 'TAVERN_KEEPER' },
  ],
  NEUTRAL: [
    { name: 'Jasper', role: 'JESTER' },
    { name: 'Fenrir', role: 'WEREWOLF' },
  ],
};
