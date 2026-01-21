import { GameAgent } from '../../shared/types';

export interface VoteResult {
  target: string | null; // Agent ID or null if no consensus
  votes: Map<string, string | 'DEFER'>; // voter ID -> target name or DEFER
  tally: Map<string, number>; // target name -> vote count
}

export class VoteResolver {
  // Calculate town majority threshold
  static getTownThreshold(aliveCount: number): number {
    return Math.floor(aliveCount / 2) + 1;
  }

  // Resolve town vote (majority required)
  static resolveTownVote(
    votes: Map<string, string | 'DEFER'>,
    agents: GameAgent[]
  ): VoteResult {
    const aliveCount = agents.filter((a) => a.alive).length;
    const threshold = this.getTownThreshold(aliveCount);

    // Tally votes (excluding DEFERs)
    const tally = new Map<string, number>();
    for (const [, targetName] of votes) {
      if (targetName !== 'DEFER') {
        const count = tally.get(targetName) || 0;
        tally.set(targetName, count + 1);
      }
    }

    // Find if any target reached threshold
    let maxVotes = 0;
    let maxTarget: string | null = null;
    let isTie = false;

    for (const [targetName, count] of tally) {
      if (count > maxVotes) {
        maxVotes = count;
        maxTarget = targetName;
        isTie = false;
      } else if (count === maxVotes) {
        isTie = true;
      }
    }

    // Check if majority reached and no tie
    const target = maxVotes >= threshold && !isTie ? maxTarget : null;

    // Find agent ID if we have a target name
    let targetId: string | null = null;
    if (target) {
      const targetAgent = agents.find((a) => a.name === target);
      if (targetAgent) {
        targetId = targetAgent.id;
      }
    }

    return {
      target: targetId,
      votes,
      tally,
    };
  }

  // Resolve mafia vote (unanimity required)
  static resolveMafiaVote(
    votes: Map<string, string | 'DEFER'>,
    agents: GameAgent[]
  ): VoteResult {
    // Tally votes (excluding DEFERs)
    const tally = new Map<string, number>();
    let deferCount = 0;

    for (const [, targetName] of votes) {
      if (targetName === 'DEFER') {
        deferCount++;
      } else {
        const count = tally.get(targetName) || 0;
        tally.set(targetName, count + 1);
      }
    }

    // Check for unanimity (all votes for same target, no defers)
    const voteCount = votes.size;
    const nonDeferVotes = voteCount - deferCount;

    let unanimousTarget: string | null = null;

    if (deferCount === 0 && tally.size === 1) {
      // All voted for the same target
      const [targetName, count] = Array.from(tally.entries())[0];
      if (count === voteCount) {
        unanimousTarget = targetName;
      }
    }

    // Find agent ID if we have a target name
    let targetId: string | null = null;
    if (unanimousTarget) {
      const targetAgent = agents.find((a) => a.name === unanimousTarget);
      if (targetAgent) {
        targetId = targetAgent.id;
      }
    }

    return {
      target: targetId,
      votes,
      tally,
    };
  }

  // Check if mafia vote is unanimous
  static isMafiaVoteUnanimous(votes: Map<string, string | 'DEFER'>): boolean {
    const targets = new Set<string>();
    for (const [, targetName] of votes) {
      if (targetName === 'DEFER') {
        return false; // Any DEFER breaks unanimity
      }
      targets.add(targetName);
    }
    return targets.size === 1; // All voted for same target
  }

  // Format vote summary for narration
  static formatVoteSummary(result: VoteResult, agents: GameAgent[]): string {
    const lines: string[] = [];

    // Sort tally by vote count descending
    const sortedTally = Array.from(result.tally.entries()).sort(
      (a, b) => b[1] - a[1]
    );

    for (const [targetName, count] of sortedTally) {
      lines.push(`${targetName}: ${count} vote${count !== 1 ? 's' : ''}`);
    }

    // Count DEFERs
    let deferCount = 0;
    for (const [, vote] of result.votes) {
      if (vote === 'DEFER') {
        deferCount++;
      }
    }

    if (deferCount > 0) {
      lines.push(`Abstained: ${deferCount}`);
    }

    return lines.join('\n');
  }
}
