import {
  SpeakResponse,
  VoteResponse,
  ChoiceResponse,
  AgentResponse,
  MayorRevealResponse,
  StreamingSpeakHeader,
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

  // =====================================================
  // Two-Phase Streaming Protocol Methods
  // =====================================================

  // Streaming protocol markers
  private static readonly MESSAGE_MARKER_START = '---MESSAGE_MARKDOWN---';
  private static readonly MESSAGE_MARKER_END = '---END---';

  // Parse streaming header JSON (stops at first complete JSON object)
  static parseStreamingHeader(content: string): ParseResult<StreamingSpeakHeader> {
    const jsonMatch = this.extractFirstJSON(content);
    if (!jsonMatch) {
      return {
        success: false,
        error: 'No valid JSON header found in streaming content',
      };
    }

    try {
      const parsed = JSON.parse(jsonMatch);

      if (parsed.type !== 'speak') {
        return {
          success: false,
          error: `Invalid type in header: expected 'speak', got '${parsed.type}'`,
        };
      }

      if (!parsed.action || !['SAY', 'DEFER'].includes(parsed.action)) {
        return {
          success: false,
          error: 'Invalid or missing action field in header',
        };
      }

      return {
        success: true,
        data: {
          type: 'speak',
          action: parsed.action,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: `JSON parse error in header: ${e instanceof Error ? e.message : 'Unknown error'}`,
      };
    }
  }

  // Extract the first complete JSON object from content
  private static extractFirstJSON(content: string): string | null {
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
            return content.slice(start, i + 1);
          }
        }
      }
    }

    return null;
  }

  // Extract message body between markers
  static extractStreamingMessageBody(content: string): string | null {
    const startIdx = content.indexOf(this.MESSAGE_MARKER_START);
    if (startIdx === -1) {
      return null;
    }

    const bodyStart = startIdx + this.MESSAGE_MARKER_START.length;
    const endIdx = content.indexOf(this.MESSAGE_MARKER_END, bodyStart);

    if (endIdx === -1) {
      // Return partial content (stream still in progress)
      return content.slice(bodyStart).trim();
    }

    return content.slice(bodyStart, endIdx).trim();
  }

  // Check if streaming response is complete
  static isStreamingComplete(content: string): boolean {
    // Complete if it has ---END--- marker
    if (content.includes(this.MESSAGE_MARKER_END)) {
      return true;
    }

    // Also complete if it's a DEFER with no message body expected
    const headerResult = this.parseStreamingHeader(content);
    if (headerResult.success && headerResult.data?.action === 'DEFER') {
      // DEFER doesn't need a message body, so check if header is complete
      const jsonMatch = this.extractFirstJSON(content);
      return jsonMatch !== null;
    }

    return false;
  }

  // Check if the content is in streaming format (has header and/or markers)
  static isStreamingFormat(content: string): boolean {
    const headerResult = this.parseStreamingHeader(content);
    if (!headerResult.success) {
      return false;
    }

    // Check for streaming markers or DEFER action
    if (headerResult.data?.action === 'DEFER') {
      return true;
    }

    // For SAY, check if there's no message_markdown in the JSON
    // (streaming format has message in body, not in JSON)
    const jsonMatch = this.extractFirstJSON(content);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch);
        // Legacy format has message_markdown in JSON
        // Streaming format doesn't have it in JSON
        return !parsed.message_markdown;
      } catch {
        return false;
      }
    }

    return false;
  }

  // Full parsing with fallback to legacy JSON format
  static parseStreamingSpeakResponse(content: string): ParseResult<SpeakResponse> {
    // First, try to detect if this is streaming format
    if (this.isStreamingFormat(content)) {
      const headerResult = this.parseStreamingHeader(content);
      if (!headerResult.success) {
        return {
          success: false,
          error: headerResult.error || 'Failed to parse streaming header',
        };
      }

      const header = headerResult.data!;

      if (header.action === 'DEFER') {
        return {
          success: true,
          data: {
            type: 'speak',
            action: 'DEFER',
            message_markdown: '',
          },
        };
      }

      // SAY action - extract message body
      const messageBody = this.extractStreamingMessageBody(content);

      return {
        success: true,
        data: {
          type: 'speak',
          action: 'SAY',
          message_markdown: messageBody || '',
        },
      };
    }

    // Fall back to legacy JSON parsing
    return this.parseSpeakResponse(content);
  }

  // Get the position where message body starts (after ---MESSAGE_MARKDOWN---)
  static getMessageBodyStartPosition(content: string): number {
    const startIdx = content.indexOf(this.MESSAGE_MARKER_START);
    if (startIdx === -1) {
      return -1;
    }
    return startIdx + this.MESSAGE_MARKER_START.length;
  }

  // Check if header is complete (has a complete JSON object)
  static hasCompleteHeader(content: string): boolean {
    return this.extractFirstJSON(content) !== null;
  }
}
