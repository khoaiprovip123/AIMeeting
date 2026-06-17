/**
 * Utility for executing asynchronous operations with an exponential backoff and jitter retry strategy.
 */

export interface RetryConfig {
  retries?: number;        // Maximum number of retry attempts
  initialDelay?: number;  // Initial delay in milliseconds
  backoffFactor?: number; // Factor by which to multiply delay each time
  maxDelay?: number;      // Maximum delay limit
  jitter?: boolean;       // Enable random jitter (recommended to prevent synchronized thundering herd spikes)
  isRetriable?: (error: any) => boolean; // Optional custom check to decide if we should retry
}

const DEFAULT_CONFIG: Required<Omit<RetryConfig, 'isRetriable'>> & { isRetriable?: (error: any) => boolean } = {
  retries: 3,
  initialDelay: 1000,
  backoffFactor: 2,
  maxDelay: 8000,
  jitter: true,
};

/**
 * Executes an asynchronous function with exponential backoff on failure.
 * 
 * @param fn The asynchronous function to execute.
 * @param config Configuration for retry attempts and backoffs.
 * @param onRetry Optional callback triggered before each retry attempt.
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {},
  onRetry?: (error: any, attempt: number, delayMs: number) => void
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: any;

  // Total attempts = initial attempt (1) + up to finalConfig.retries
  const totalAttempts = finalConfig.retries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorMsgLower = errorMsg.toLowerCase();

      // Custom retry checker
      if (finalConfig.isRetriable && !finalConfig.isRetriable(error)) {
        throw error;
      }

      // Determine if error is non-retriable to fail-fast where retries will never help
      // Avoid retrying on explicit Firestore permissions or Auth problems unless transient
      const isUnretriable = 
        (errorMsgLower.includes('permission-denied') || errorMsgLower.includes('insufficient permissions')) && 
        !errorMsgLower.includes('quota') && !errorMsgLower.includes('resource');

      // Schema mismatch or explicit usage errors should also fail-fast
      const isUsageError = 
        errorMsgLower.includes('invalid-argument') ||
        errorMsgLower.includes('must be logged in');

      if (isUnretriable || isUsageError) {
        throw error;
      }

      // If we have more attempts remaining, pause before the next try
      if (attempt < totalAttempts) {
        // Calculate exponential delay: initialDelay * Factor^(attempt - 1)
        let delay = finalConfig.initialDelay * Math.pow(finalConfig.backoffFactor, attempt - 1);
        
        // Add random jitter to mitigate stampeding retry storms
        if (finalConfig.jitter) {
          // +-15% random jitter adjustment
          const jitterPercent = 0.15;
          const jitterAmount = (Math.random() * 2 - 1) * jitterPercent * delay;
          delay = delay + jitterAmount;
        }

        // Apply bounds to delay
        delay = Math.min(delay, finalConfig.maxDelay);
        delay = Math.max(0, delay);

        console.warn(
          `[Retry] Attempt ${attempt} failed with error: "${errorMsg}". Retrying in ${Math.round(delay)}ms...`
        );

        if (onRetry) {
          try {
            onRetry(error, attempt, delay);
          } catch (callbackErr) {
            console.error('[Retry] Error inside onRetry callback:', callbackErr);
          }
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
