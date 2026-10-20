import { describe, expect, it } from "vitest";
import { extractKeyConcepts } from "./key-concepts";

describe("extractKeyConcepts", () => {
  it("original format", () => {
    expect(extractKeyConcepts('text\nKEY_CONCEPTS\n```json\n["a", "b"]\n```')).toEqual(["a", "b"]);
  });
  it("label inside the fence on its own line (prod, ch1/ch2)", () => {
    expect(extractKeyConcepts('---\n\n```json\nKEY_CONCEPTS\n[\n  "Regular expression (regex): a pattern",\n  "x"\n]\n```')).toEqual([
      "Regular expression (regex): a pattern",
      "x",
    ]);
  });
  it("label on the fence line (prod, ch3)", () => {
    expect(extractKeyConcepts('```json KEY_CONCEPTS\n[\n  "uses two .replace() calls [sic]"\n]\n```')).toEqual(["uses two .replace() calls [sic]"]);
  });
  it("uses the last KEY_CONCEPTS block and ignores junk", () => {
    expect(extractKeyConcepts('KEY_CONCEPTS mentioned early [1]\n...\n```json\nKEY_CONCEPTS\n["final"]\n```')).toEqual(["final"]);
    expect(extractKeyConcepts("no concepts here")).toEqual([]);
    expect(extractKeyConcepts("KEY_CONCEPTS\n```json\n[broken\n```")).toEqual([]);
  });
});
