import { describe, expect, it } from "vitest";
import { ArrRequestError, describeArrError, reasonFromBody } from "@/lib/arr/errors";

describe("reasonFromBody", () => {
  it("reads Radarr/Sonarr's validation failures", () => {
    const body = JSON.stringify([
      { propertyName: "TmdbId", errorMessage: "This movie has already been added" },
      { propertyName: "Path", errorMessage: "This movie has already been added" },
    ]);
    expect(reasonFromBody(body)).toBe("This movie has already been added");
  });

  it("reads a single { message }", () => {
    expect(reasonFromBody('{"message":"NotFound"}')).toBe("NotFound");
  });

  it("is null for an empty or non-JSON body", () => {
    expect(reasonFromBody("")).toBeNull();
    expect(reasonFromBody("<html>Bad gateway</html>")).toBeNull();
  });
});

describe("describeArrError", () => {
  it("prefers the server's reason, else the status", () => {
    expect(describeArrError(new ArrRequestError("x", 400, "Path is invalid"))).toBe("Path is invalid");
    expect(describeArrError(new ArrRequestError("x", 500, null))).toBe("HTTP 500");
  });

  it("names timeouts and unreachable servers", () => {
    const timeout = new Error("The operation was aborted due to timeout");
    timeout.name = "TimeoutError";
    expect(describeArrError(timeout)).toBe("timed out");
    expect(describeArrError(new TypeError("fetch failed"))).toBe("unreachable");
    expect(describeArrError(new Error("something else"))).toBeNull();
  });
});
