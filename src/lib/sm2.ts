/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Quality ratings:
 *   0 - Complete blackout, no recall
 *   1 - Incorrect, but recognized the answer
 *   2 - Incorrect, but answer seemed easy to recall
 *   3 - Correct with serious difficulty
 *   4 - Correct with some hesitation
 *   5 - Perfect recall
 *
 * If quality >= 3, the answer is considered correct and the interval increases.
 * If quality < 3, the card is reset (repetitions back to 0, interval to 1 day).
 *
 * Ease factor (EF) is updated using:
 *   EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
 * where q is the quality rating. EF never goes below 1.3.
 */
export function calculateSM2(
  quality: number,
  previousEaseFactor: number,
  previousInterval: number,
  previousRepetitions: number
): { easeFactor: number; interval: number; repetitions: number } {
  let easeFactor = previousEaseFactor;
  let interval: number;
  let repetitions: number;

  if (quality >= 3) {
    // Correct response
    repetitions = previousRepetitions + 1;

    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(previousInterval * easeFactor);
    }

    // Update ease factor
    easeFactor =
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  } else {
    // Incorrect response - reset
    repetitions = 0;
    interval = 1;

    // Still update ease factor on failure
    easeFactor =
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  }

  // Ease factor must not go below 1.3
  if (easeFactor < 1.3) {
    easeFactor = 1.3;
  }

  // Interval must be at least 1 day
  if (interval < 1) {
    interval = 1;
  }

  return {
    easeFactor: Math.round(easeFactor * 100) / 100,
    interval,
    repetitions,
  };
}
