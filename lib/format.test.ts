import { describe, it, expect } from "vitest";
import { formatBytes, formatRuntime } from "./format";

describe("formatBytes", () => {
  it("returns '0 B' for zero/falsy input", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes without a decimal unit", () => {
    expect(formatBytes(500)).toBe("500.0 B");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(3.7 * 1024 ** 3)).toBe("3.7 GB");
  });

  it("formats terabytes", () => {
    expect(formatBytes(1.5 * 1024 ** 4)).toBe("1.5 TB");
  });
});

describe("formatRuntime", () => {
  it("formats minutes only when under an hour", () => {
    expect(formatRuntime(42)).toBe("42m");
  });

  it("formats whole hours with no leftover minutes", () => {
    expect(formatRuntime(120)).toBe("2h");
  });

  it("formats hours and minutes together", () => {
    expect(formatRuntime(102)).toBe("1h 42m");
  });

  it("formats zero as '0m' rather than an empty string", () => {
    expect(formatRuntime(0)).toBe("0m");
  });
});
