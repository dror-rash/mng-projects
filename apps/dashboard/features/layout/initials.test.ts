import { describe, expect, it } from "vitest";

import { initials } from "./initials";

describe("initials", () => {
  it("takes the first letters of the first and last name", () => {
    expect(initials("Test User", "test@example.com")).toBe("TU");
  });

  it("takes one letter from a single name", () => {
    expect(initials("dana", "dana@example.com")).toBe("D");
  });

  it("ignores extra spaces and middle names", () => {
    expect(initials("  Ada   Byron  Lovelace ", "ada@example.com")).toBe("AL");
  });

  it("uses the email when there is no name", () => {
    expect(initials("", "kim@example.com")).toBe("K");
    expect(initials(null, "kim@example.com")).toBe("K");
    expect(initials("   ", "kim@example.com")).toBe("K");
  });

  it("keeps letters outside Latin, such as Hebrew", () => {
    expect(initials("דנה כהן", "dana@example.com")).toBe("דכ");
  });
});
