import type { LLMResponse } from '@shared/types';
import type { LLMService, LLMMessage } from './index';

interface RateLimiterConfig {
  maxRequestsPerMinute: number;
  maxConcurrent: number;
  circuitBreakerThreshold: number; // Number of consecutive errors to trip circuit
  circuitBreakerResetMs: number;   // Time to wait before resetting circuit
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxRequestsPerMinute: 30,
  maxConcurrent: 3,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000, // 1 minute
};

interface QueuedRequest {
  resolve: (value: LLMResponse) => void;
  reject: (error: Error) => void;
  execute: () => Promise<LLMResponse>;
}

export class RateLimitedLLMService implements LLMService {
  private service: LLMService;
  private config: RateLimiterConfig;

  // Rate limiting state
  private requestTimestamps: number[] = [];
  private activeRequests: number = 0;
  private queue: QueuedRequest[] = [];

  // Circuit breaker state
  private consecutiveErrors: number = 0;
  private circuitOpen: boolean = false;
  private circuitOpenedAt: number = 0;

  constructor(service: LLMService, config: Partial<RateLimiterConfig> = {}) {
    this.service = service;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async generate(
    messages: LLMMessage[],
    systemPrompt: string,
    model: string
  ): Promise<LLMResponse> {
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      throw new Error('Circuit breaker is open - too many consecutive errors. Waiting for reset.');
    }

    return new Promise((resolve, reject) => {
      const execute = async (): Promise<LLMResponse> => {
        return this.service.generate(messages, systemPrompt, model);
      };

      this.queue.push({ resolve, reject, execute });
      this.processQueue();
    });
  }

  private isCircuitOpen(): boolean {
    if (!this.circuitOpen) return false;

    // Check if it's time to reset
    const elapsed = Date.now() - this.circuitOpenedAt;
    if (elapsed >= this.config.circuitBreakerResetMs) {
      console.log('[RateLimiter] Circuit breaker reset - allowing requests again');
      this.circuitOpen = false;
      this.consecutiveErrors = 0;
      return false;
    }

    return true;
  }

  private canMakeRequest(): boolean {
    // Check concurrent limit
    if (this.activeRequests >= this.config.maxConcurrent) {
      return false;
    }

    // Check rate limit
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old timestamps
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);

    if (this.requestTimestamps.length >= this.config.maxRequestsPerMinute) {
      return false;
    }

    return true;
  }

  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) return;
    if (!this.canMakeRequest()) {
      // Schedule retry
      setTimeout(() => this.processQueue(), 1000);
      return;
    }

    const request = this.queue.shift();
    if (!request) return;

    this.activeRequests++;
    this.requestTimestamps.push(Date.now());

    try {
      const result = await request.execute();
      this.consecutiveErrors = 0; // Reset on success
      request.resolve(result);
    } catch (error) {
      this.consecutiveErrors++;
      console.error(`[RateLimiter] Request failed (consecutive errors: ${this.consecutiveErrors})`);

      if (this.consecutiveErrors >= this.config.circuitBreakerThreshold) {
        console.error(`[RateLimiter] Circuit breaker TRIPPED - stopping all requests for ${this.config.circuitBreakerResetMs / 1000}s`);
        this.circuitOpen = true;
        this.circuitOpenedAt = Date.now();

        // Reject all queued requests
        while (this.queue.length > 0) {
          const queued = this.queue.shift();
          queued?.reject(new Error('Circuit breaker tripped - request cancelled'));
        }
      }

      request.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.activeRequests--;
      // Process next item in queue
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }

  // Utility methods for monitoring
  getStats(): {
    activeRequests: number;
    queuedRequests: number;
    requestsInLastMinute: number;
    consecutiveErrors: number;
    circuitOpen: boolean;
  } {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    const recentRequests = this.requestTimestamps.filter(ts => ts > oneMinuteAgo).length;

    return {
      activeRequests: this.activeRequests,
      queuedRequests: this.queue.length,
      requestsInLastMinute: recentRequests,
      consecutiveErrors: this.consecutiveErrors,
      circuitOpen: this.circuitOpen,
    };
  }

  resetCircuitBreaker(): void {
    this.circuitOpen = false;
    this.consecutiveErrors = 0;
    console.log('[RateLimiter] Circuit breaker manually reset');
  }
}

// Factory function to wrap existing services
export function createRateLimitedService(
  service: LLMService,
  config?: Partial<RateLimiterConfig>
): RateLimitedLLMService {
  return new RateLimitedLLMService(service, config);
}
