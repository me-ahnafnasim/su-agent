import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildChunks, chunkText, createPointId, loadSourceDocuments } from "@/lib/ai/ingest";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("chunkText", () => {
  it("keeps short text as one chunk", () => {
    expect(chunkText("short text", { chunkSize: 200, overlap: 20 })).toEqual(["short text"]);
  });

  it("splits long text into bounded chunks", () => {
    const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${"word ".repeat(20)}`).join("\n\n");
    const chunks = chunkText(text, { chunkSize: 300, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(300);
  });

  it("returns nothing for blank input", () => {
    expect(chunkText("  \n\n ", { chunkSize: 300, overlap: 50 })).toEqual([]);
  });
});

describe("createPointId", () => {
  it("is a deterministic UUID so re-seeding upserts instead of duplicating", () => {
    const a = createPointId("uni-faq.txt", 0);
    expect(a).toMatch(UUID);
    expect(createPointId("uni-faq.txt", 0)).toBe(a);
    expect(createPointId("uni-faq.txt", 1)).not.toBe(a);
    expect(createPointId("company-policy.txt", 0)).not.toBe(a);
  });
});

describe("fixtures", () => {
  it("contain the required facts and chunk with source metadata", async () => {
    const docs = await loadSourceDocuments(path.join(process.cwd(), "data"));
    expect(docs.map((d) => d.source)).toEqual(
      expect.arrayContaining(["uni-faq.txt", "company-policy.txt", "product-list.txt", "su-overview.txt"]),
    );
    expect(docs.find((d) => d.source === "su-overview.txt")?.title).toBe(
      "Sonargaon University (SU) — Overview, Owners and Leadership",
    );
    const all = docs.map((d) => d.content).join("\n");
    expect(all).toContain("closes at 7:15 PM on Thursdays");
    expect(all).toContain("2 remote-work days per calendar month");
    expect(all).toContain("Nimbus keyboard costs 45 demo credits");

    const chunks = buildChunks(docs, { chunkSize: 700, overlap: 120 });
    expect(new Set(chunks.map((c) => c.id)).size).toBe(chunks.length);
    for (const chunk of chunks) {
      expect(chunk.metadata.source).toMatch(/\.txt$/);
      expect(chunk.metadata.title).toBeTruthy();
    }
  });
});
