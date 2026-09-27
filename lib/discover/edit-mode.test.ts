import { describe, expect, it } from "vitest";
import { layoutChanged, layoutOrder, moveShelf, toggleShelfHidden, type EditableShelf } from "@/lib/discover/edit-mode";

const shelves: EditableShelf[] = [
  { id: "a", title: "A", hidden: false },
  { id: "b", title: "B", hidden: false },
  { id: "c", title: "C", hidden: true },
];

describe("moveShelf", () => {
  it("swaps with the neighbour", () => {
    expect(moveShelf(shelves, 1, -1).map((s) => s.id)).toEqual(["b", "a", "c"]);
    expect(moveShelf(shelves, 1, 1).map((s) => s.id)).toEqual(["a", "c", "b"]);
  });

  it("stops at either end", () => {
    expect(moveShelf(shelves, 0, -1).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(moveShelf(shelves, 2, 1).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(moveShelf(shelves, 7, 1).map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("leaves the original alone", () => {
    moveShelf(shelves, 0, 1);
    expect(shelves[0].id).toBe("a");
  });
});

describe("toggleShelfHidden", () => {
  it("flips one row", () => {
    const next = toggleShelfHidden(shelves, "c");
    expect(next.map((s) => s.hidden)).toEqual([false, false, false]);
    expect(shelves[2].hidden).toBe(true);
  });
});

describe("layoutChanged", () => {
  it("notices a move or a switch", () => {
    expect(layoutChanged(shelves, shelves)).toBe(false);
    expect(layoutChanged(shelves, moveShelf(shelves, 0, 1))).toBe(true);
    expect(layoutChanged(shelves, toggleShelfHidden(shelves, "a"))).toBe(true);
  });
});

describe("layoutOrder", () => {
  it("sends ids and hidden only", () => {
    expect(layoutOrder(shelves)).toEqual([
      { id: "a", hidden: false },
      { id: "b", hidden: false },
      { id: "c", hidden: true },
    ]);
  });
});
