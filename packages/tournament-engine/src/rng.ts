/**
 * Seeded Pseudo-Random Number Generator using Mulberry32 algorithm.
 * This ensures deterministic behavior for tournament generation.
 */

/**
 * Creates a seeded PRNG using the Mulberry32 algorithm.
 *
 * Mulberry32 is a simple, fast, and high-quality PRNG that produces
 * a full 32-bit output from a 32-bit state. It has good statistical
 * properties and is suitable for non-cryptographic applications.
 *
 * @param seed - The initial seed value (any 32-bit integer)
 * @returns A function that returns a pseudo-random number between 0 (inclusive) and 1 (exclusive)
 *
 * @example
 * ```typescript
 * const rng = createSeededRNG(12345);
 * const randomValue = rng(); // 0.6443072557449341
 * const anotherValue = rng(); // 0.8502457141876221
 * ```
 */
export function createSeededRNG(seed: number): () => number {
  let state = seed >>> 0; // Ensure unsigned 32-bit integer

  return function (): number {
    // Mulberry32 algorithm
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const result = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return result;
  };
}

/**
 * Shuffles an array in-place using the Fisher-Yates algorithm with a seeded RNG.
 *
 * @param array - The array to shuffle
 * @param rng - A seeded random number generator function
 * @returns The shuffled array (same reference as input)
 *
 * @example
 * ```typescript
 * const rng = createSeededRNG(999);
 * const items = [1, 2, 3, 4, 5];
 * shuffleArray(items, rng);
 * console.log(items); // [3, 1, 5, 2, 4] (deterministic with seed 999)
 * ```
 */
export function shuffleArray<T>(array: T[], rng: () => number): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j]!, array[i]!];
  }
  return array;
}

/**
 * Generates a random integer between min (inclusive) and max (inclusive) using a seeded RNG.
 *
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @param rng - A seeded random number generator function
 * @returns A random integer in the specified range
 *
 * @example
 * ```typescript
 * const rng = createSeededRNG(42);
 * const value = randomInt(1, 10, rng); // Returns a value between 1 and 10
 * ```
 */
export function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}
