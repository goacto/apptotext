import { describe, it, expect } from "vitest";
import { calculateSM2 } from "./sm2";

describe("calculateSM2", () => {
  it("first correct review gives interval of 1 day", () => {
    const result = calculateSM2(4, 2.5, 0, 0);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(1);
  });

  it("second correct review gives interval of 6 days", () => {
    const result = calculateSM2(4, 2.5, 1, 1);
    expect(result.interval).toBe(6);
    expect(result.repetitions).toBe(2);
  });

  it("third correct review multiplies interval by ease factor", () => {
    const result = calculateSM2(4, 2.5, 6, 2);
    expect(result.interval).toBe(15); // Math.round(6 * 2.5)
    expect(result.repetitions).toBe(3);
  });

  it("incorrect response resets repetitions and interval", () => {
    const result = calculateSM2(2, 2.5, 15, 3);
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(0);
  });

  it("perfect score (5) increases ease factor", () => {
    const result = calculateSM2(5, 2.5, 1, 1);
    expect(result.easeFactor).toBeGreaterThan(2.5);
  });

  it("low quality (0) decreases ease factor", () => {
    const result = calculateSM2(0, 2.5, 1, 1);
    expect(result.easeFactor).toBeLessThan(2.5);
  });

  it("ease factor never goes below 1.3", () => {
    // Repeated failures should floor at 1.3
    let ef = 2.5;
    for (let i = 0; i < 20; i++) {
      const result = calculateSM2(0, ef, 1, 0);
      ef = result.easeFactor;
    }
    expect(ef).toBe(1.3);
  });

  it("interval is always at least 1 day", () => {
    const result = calculateSM2(3, 1.3, 0, 0);
    expect(result.interval).toBeGreaterThanOrEqual(1);
  });

  it("quality 3 (barely correct) still increments repetitions", () => {
    const result = calculateSM2(3, 2.5, 1, 1);
    expect(result.repetitions).toBe(2);
  });

  it("quality 2 (wrong) resets repetitions", () => {
    const result = calculateSM2(2, 2.5, 6, 2);
    expect(result.repetitions).toBe(0);
  });
});
