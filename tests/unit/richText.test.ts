import { describe, expect, it } from "vitest";
import { parseInline, parseRichText } from "@/lib/richText";

describe("parseInline", () => {
  it("turns **bold** and `code` into parts and drops stray markers", () => {
    expect(parseInline("**প্রোগ্রাম:** মেকানিক্যাল `ME 101` শেষ **")).toEqual([
      { type: "bold", text: "প্রোগ্রাম:" },
      { type: "text", text: " মেকানিক্যাল " },
      { type: "code", text: "ME 101" },
      { type: "text", text: " শেষ " },
    ]);
  });
});

describe("parseRichText", () => {
  it("parses the reply format seen in the UI into a bullet list", () => {
    const blocks = parseRichText(
      "মেকানিক্যাল সম্পর্কে:\n- **প্রোগ্রাম:** বিএসসি\n- **ক্লাব:** **\"SU Mecha Club (SUMEC)\"** সক্রিয়",
    );
    expect(blocks[0]).toEqual({ type: "paragraph", inlines: [{ type: "text", text: "মেকানিক্যাল সম্পর্কে:" }] });
    expect(blocks[1]).toMatchObject({ type: "list", ordered: false });
    const list = blocks[1] as Extract<(typeof blocks)[number], { type: "list" }>;
    expect(list.items).toHaveLength(2);
    expect(list.items[1].inlines.filter((p) => p.type === "bold").map((p) => p.text)).toEqual([
      "ক্লাব:",
      '"SU Mecha Club (SUMEC)"',
    ]);
  });

  it("supports numbered lists with Bangla digits and nested bullets", () => {
    const blocks = parseRichText("১. **ভর্তি ফি:** ১২,৫০০\n২. সেমিস্টার ফি\n  * ব্যাখ্যা");
    expect(blocks).toHaveLength(1);
    const list = blocks[0] as Extract<(typeof blocks)[number], { type: "list" }>;
    expect(list.ordered).toBe(true);
    expect(list.items.map((i) => [i.marker, i.depth])).toEqual([["১.", 0], ["২.", 0], ["", 1]]);
  });

  it("keeps plain text and headings", () => {
    expect(parseRichText("### শিরোনাম\n\nসাধারণ লেখা")).toEqual([
      { type: "heading", inlines: [{ type: "text", text: "শিরোনাম" }] },
      { type: "paragraph", inlines: [{ type: "text", text: "সাধারণ লেখা" }] },
    ]);
  });
});
