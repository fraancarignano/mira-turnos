import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("combina clases y resuelve conflictos de Tailwind", () => {
    const oculto: boolean = false;
    expect(cn("px-2 py-1", oculto && "hidden", "px-4")).toBe("py-1 px-4");
  });
});
