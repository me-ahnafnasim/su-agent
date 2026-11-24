/**
 * Tiny, safe Markdown subset for agent replies: **bold**, `code`, bullet lists,
 * numbered lists (Latin or Bangla digits), headings and paragraphs.
 * Produces plain data; React renders it (all text is escaped — no HTML injection).
 */

export type Inline = { type: "text" | "bold" | "code"; text: string };

export type Block =
  | { type: "paragraph"; inlines: Inline[] }
  | { type: "heading"; inlines: Inline[] }
  | { type: "list"; ordered: boolean; items: { inlines: Inline[]; depth: number; marker: string }[] };

const BULLET = /^(\s*)[-*•]\s+(.*)$/;
const ORDERED = /^(\s*)([0-9০-৯]+)[.)]\s+(.*)$/;
const HEADING = /^#{1,6}\s+(.*)$/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`/g;
  let last = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (match.index > last) out.push({ type: "text", text: text.slice(last, match.index) });
    if (match[3] !== undefined) out.push({ type: "code", text: match[3] });
    else out.push({ type: "bold", text: match[1] ?? match[2] });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ type: "text", text: text.slice(last) });
  // Drop stray emphasis markers the model left unpaired (e.g. "**" or a lone "*text").
  return out
    .map((part) => (part.type === "text" ? { ...part, text: part.text.replace(/\*\*|__/g, "") } : part))
    .filter((part) => part.text.length > 0);
}

export function parseRichText(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", inlines: parseInline(paragraph.join("\n")) });
    paragraph = [];
  };

  for (const raw of source.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    const heading = HEADING.exec(line);

    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const indent = (bullet?.[1] ?? ordered?.[1] ?? "").length;
      const item = {
        inlines: parseInline((bullet?.[2] ?? ordered?.[3] ?? "").trim()),
        depth: Math.min(2, Math.floor(indent / 2)),
        marker: ordered ? `${ordered[2]}.` : "",
      };
      const previous = blocks[blocks.length - 1];
      if (previous?.type === "list" && (previous.ordered === isOrdered || item.depth > 0)) {
        previous.items.push(item);
      } else {
        blocks.push({ type: "list", ordered: isOrdered, items: [item] });
      }
    } else if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", inlines: parseInline(heading[1]) });
    } else if (!line.trim()) {
      flushParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  return blocks;
}
