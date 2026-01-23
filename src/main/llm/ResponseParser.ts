import {
  SpeakResponse,
  VoteResponse,
  ChoiceResponse,
  AgentResponse,
  MayorRevealResponse,
} from '../../shared/types';

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class ResponseParser {
  // Parse any agent response
  static parse(content: string): ParseResult<AgentResponse> {
    // Try to extract JSON from the content
    const jsonMatch = this.extractJSON(content);
    if (!jsonMatch) {
      return {
        success: false,
        error: 'No valid JSON found in response',
      };
    }

    try {
      const parsed = JSON.parse(jsonMatch);

      // Validate based on type
      if (parsed.type === 'speak') {
        return this.validateSpeakResponse(parsed);
      } else if (parsed.type === 'vote') {
        return this.validateVoteResponse(parsed);
      } else if (parsed.type === 'choice') {
        return this.validateChoiceResponse(parsed);
      } else if (parsed.type === 'mayor_reveal') {
        return this.validateMayorRevealResponse(parsed);
      }

      return {
        success: false,
        error: `Unknown response type: ${parsed.type}`,
      };
    } catch (e) {
      return {
        success: false,
        error: `JSON parse error: ${e instanceof Error ? e.message : 'Unknown error'}`,
      };
    }
  }

  // Parse speak response
  static parseSpeakResponse(content: string): ParseResult<SpeakResponse> {
    const result = this.parse(content);
    if (!result.success || result.data?.type !== 'speak') {
      // Try to extract a speak response even if JSON is malformed
      const fallback = this.tryExtractSpeakFallback(content);
      if (fallback) {
        return { success: true, data: fallback };
      }
      return {
        success: false,
        error: result.error || 'Not a speak response',
      };
    }
    return {
      success: true,
      data: result.data as SpeakResponse,
    };
  }

  // Parse vote response
  static parseVoteResponse(content: string): ParseResult<VoteResponse> {
    const result = this.parse(content);
    if (!result.success || result.data?.type !== 'vote') {
      // Try to extract a vote from plain text
      const fallback = this.tryExtractVoteFallback(content);
      if (fallback) {
        return { success: true, data: fallback };
      }
      return {
        success: false,
        error: result.error || 'Not a vote response',
      };
    }
    return {
      success: true,
      data: result.data as VoteResponse,
    };
  }

  // Parse choice response
  static parseChoiceResponse(content: string): ParseResult<ChoiceResponse> {
    const result = this.parse(content);
    if (!result.success || result.data?.type !== 'choice') {
      // Try to extract a choice from plain text
      const fallback = this.tryExtractChoiceFallback(content);
      if (fallback) {
        return { success: true, data: fallback };
      }
      return {
        success: false,
        error: result.error || 'Not a choice response',
      };
    }
    return {
      success: true,
      data: result.data as ChoiceResponse,
    };
  }

  // Parse mayor reveal response
  static parseMayorRevealResponse(content: string): ParseResult<MayorRevealResponse> {
    const result = this.parse(content);
    if (!result.success || result.data?.type !== 'mayor_reveal') {
      return {
        success: false,
        error: result.error || 'Not a mayor reveal response',
      };
    }
    return {
      success: true,
      data: result.data as MayorRevealResponse,
    };
  }

  // Extract JSON from content (handles markdown code blocks)
  private static extractJSON(content: string): string | null {
    // Try to find JSON in code blocks first (prefer the last block)
    const codeBlockMatches = Array.from(
      content.matchAll(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/g)
    );
    if (codeBlockMatches.length > 0) {
      const lastMatch = codeBlockMatches[codeBlockMatches.length - 1];
      return lastMatch[1];
    }

    // Find all top-level JSON-looking objects and take the last one
    const candidates: string[] = [];
    let depth = 0;
    let start = -1;

    for (let i = 0; i < content.length; i++) {
      const ch = content[i];
      if (ch === '{') {
        if (depth === 0) {
          start = i;
        }
        depth++;
      } else if (ch === '}') {
        if (depth > 0) {
          depth--;
          if (depth === 0 && start !== -1) {
            candidates.push(content.slice(start, i + 1));
            start = -1;
          }
        }
      }
    }

    if (candidates.length > 0) {
      return candidates[candidates.length - 1];
    }

    return null;
  }

  // Validate speak response
  private static validateSpeakResponse(parsed: any): ParseResult<SpeakResponse> {
    if (!parsed.action || !['SAY', 'DEFER'].includes(parsed.action)) {
      return {
        success: false,
        error: 'Invalid or missing action field',
      };
    }

    const response: SpeakResponse = {
      type: 'speak',
      action: parsed.action,
      message_markdown: parsed.message_markdown || '',
    };
    if (typeof parsed.declare_mayor === 'boolean') {
      response.declare_mayor = parsed.declare_mayor;
    }

    return { success: true, data: response };
  }

  // Validate vote response
  private static validateVoteResponse(parsed: any): ParseResult<VoteResponse> {
    const hasVote = parsed.vote !== undefined && parsed.vote !== null;
    const hasVotesArray = Array.isArray(parsed.votes);
    if (!hasVote && !hasVotesArray) {
      return {
        success: false,
        error: 'Missing vote field',
      };
    }

    const response: VoteResponse = {
      type: 'vote',
    };
    if (hasVote) {
      response.vote = parsed.vote;
    }
    if (hasVotesArray) {
      response.votes = parsed.votes.filter((vote: unknown) => typeof vote === 'string');
    }

    return { success: true, data: response };
  }

  // Validate choice response
  private static validateChoiceResponse(parsed: any): ParseResult<ChoiceResponse> {
    if (parsed.target === undefined || parsed.target === null) {
      return {
        success: false,
        error: 'Missing target field',
      };
    }

    const response: ChoiceResponse = {
      type: 'choice',
      target: parsed.target,
    };

    return { success: true, data: response };
  }

  // Validate mayor reveal response
  private static validateMayorRevealResponse(parsed: any): ParseResult<MayorRevealResponse> {
    if (typeof parsed.reveal !== 'boolean') {
      return {
        success: false,
        error: 'Missing reveal field',
      };
    }

    const response: MayorRevealResponse = {
      type: 'mayor_reveal',
      reveal: parsed.reveal,
    };
    if (typeof parsed.message_markdown === 'string') {
      response.message_markdown = parsed.message_markdown;
    }

    return { success: true, data: response };
  }

  // Fallback extraction for speak responses
  private static tryExtractSpeakFallback(content: string): SpeakResponse | null {
    // If content looks like a chat message, treat it as SAY
    const trimmed = content.trim();
    if (trimmed.length > 0 && !trimmed.toLowerCase().includes('defer')) {
      return {
        type: 'speak',
        action: 'SAY',
        message_markdown: trimmed,
      };
    }

    if (trimmed.toLowerCase().includes('defer') || trimmed.toLowerCase().includes('pass')) {
      return {
        type: 'speak',
        action: 'DEFER',
        message_markdown: '',
      };
    }

    return null;
  }

  // Fallback extraction for vote responses
  private static tryExtractVoteFallback(content: string): VoteResponse | null {
    const trimmed = content.trim().toLowerCase();

    if (trimmed.includes('abstain') || trimmed.includes('defer')) {
      return {
        type: 'vote',
        vote: 'DEFER',
      };
    }

    // Try to find "vote for X" or "I vote X" patterns
    const voteMatch = content.match(/(?:vote(?:s)?\s+(?:for\s+)?|voting\s+for\s+)["']?([A-Za-z]+)["']?/i);
    if (voteMatch) {
      return {
        type: 'vote',
        vote: voteMatch[1],
      };
    }

    return null;
  }

  // Fallback extraction for choice responses
  private static tryExtractChoiceFallback(content: string): ChoiceResponse | null {
    const trimmed = content.trim().toLowerCase();

    if (trimmed.includes('skip') || trimmed.includes('defer') || trimmed.includes('pass')) {
      return {
        type: 'choice',
        target: 'DEFER',
      };
    }

    // Try to find "choose X" or "target X" or "investigate X" patterns
    const choiceMatch = content.match(/(?:choose|target|investigate|protect)\s+["']?([A-Za-z]+)["']?/i);
    if (choiceMatch) {
      return {
        type: 'choice',
        target: choiceMatch[1],
      };
    }

    return null;
  }

  // Accumulate streaming content
  static accumulateStreamContent(
    accumulated: string,
    chunk: { type: 'thinking' | 'content'; text: string }
  ): { accumulated: string; thinkingContent: string } {
    // We only care about content for JSON parsing
    // Thinking is captured separately
    if (chunk.type === 'content') {
      return {
        accumulated: accumulated + chunk.text,
        thinkingContent: '',
      };
    }
    return {
      accumulated,
      thinkingContent: chunk.text,
    };
  }
}
