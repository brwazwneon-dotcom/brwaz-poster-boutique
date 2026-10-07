import { describe, expect, it, vi } from "vitest";
import {
  FRAME_COLORS,
  FRAME_TYPES,
  SIZES,
  allowedColors,
  isValidFrameCombo,
  normalizeFrameColor,
  normalizeFrameCombo,
  sizesForFrame,
} from "./poster-options";

describe("colour rule: PVC = black/white, Wooden Portrait = no colour", () => {
  it("allowed colours per frame type", () => {
    expect(allowedColors("pvc")).toEqual(["black", "white"]);
    expect(allowedColors("wood")).toEqual(["wood"]);
  });

  it("Wooden + Black / White is snapped to the no-colour marker", () => {
    expect(normalizeFrameColor("wood", "black")).toBe("wood");
    expect(normalizeFrameColor("wood", "white")).toBe("wood");
    expect(normalizeFrameColor("wood", "wood")).toBe("wood");
  });

  it("PVC + Wood is snapped to black; black/white are kept", () => {
    expect(normalizeFrameColor("pvc", "wood")).toBe("black");
    expect(normalizeFrameColor("pvc", "black")).toBe("black");
    expect(normalizeFrameColor("pvc", "white")).toBe("white");
  });

  it("only real combinations are valid (every frame × size × colour)", () => {
    let valid = 0;
    for (const f of FRAME_TYPES)
      for (const s of SIZES)
        for (const c of FRAME_COLORS) {
          const ok = isValidFrameCombo(f.id, s.id, c.id);
          const expected =
            sizesForFrame(f.id).includes(s.id) &&
            (f.id === "wood" ? c.id === "wood" : c.id !== "wood");
          expect(ok, `${f.id} ${s.id} ${c.id}`).toBe(expected);
          if (ok) valid++;
        }
    expect(valid).toBe(3 * 2 + 8 * 1); // PVC: 3 sizes × 2 colours, wood: 8 sizes × 1
  });

  it("normalizeFrameCombo repairs a stale cart line (frame change keeps nothing illegal)", () => {
    expect(normalizeFrameCombo({ frameType: "wood", size: "20x30", color: "black" })).toEqual({
      frameType: "wood",
      size: "20x30",
      color: "wood",
    });
    expect(normalizeFrameCombo({ frameType: "pvc", size: "100x60", color: "wood" })).toEqual({
      frameType: "pvc",
      size: "20x30",
      color: "black",
    });
  });
});

describe("mockup choice follows the rule", () => {
  it("a stale 'wood' colour on PVC never switches to the wooden mockup", async () => {
    vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
    const { pickMockupKey } = await import("@/components/FramePreview");
    expect(pickMockupKey("pvc", "wood")).toBe("black");
    expect(pickMockupKey("pvc", "white")).toBe("white");
    expect(pickMockupKey("pvc", "black")).toBe("black");
    expect(pickMockupKey("wood", "black")).toBe("wood");
    expect(pickMockupKey("wood", "wood")).toBe("wood");
  });
});
