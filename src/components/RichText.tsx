import { Fragment } from "react";
import { parseRichText, type Inline } from "@/lib/richText";
import { cn } from "@/lib/utils";

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, index) =>
        part.type === "bold" ? (
          <strong
            key={index}
            className="rounded-sm bg-primary/[0.07] px-1 py-0.5 font-semibold text-foreground [box-decoration-break:clone]"
          >
            {part.text}
          </strong>
        ) : part.type === "code" ? (
          <code key={index} className="rounded bg-background px-1 py-0.5 font-mono text-[0.85em]">
            {part.text}
          </code>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

/** Renders an agent reply (Markdown subset) with highlighted key facts and real lists. */
export default function RichText({ text, className }: { text: string; className?: string }) {
  const blocks = parseRichText(text);
  return (
    <div className={cn("space-y-2 break-words", className)}>
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <p key={index} className="font-semibold text-foreground">
              <Inlines parts={block.inlines} />
            </p>
          );
        }
        if (block.type === "list") {
          return (
            <ul key={index} className="space-y-1.5">
              {block.items.map((item, i) => (
                <li key={i} className="flex gap-2" style={{ paddingLeft: `${item.depth * 1}rem` }}>
                  {block.ordered && item.marker ? (
                    <span className="min-w-5 shrink-0 font-semibold text-muted-foreground tabular-nums">
                      {item.marker}
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-[0.6em] size-1.5 shrink-0 rounded-full",
                        item.depth ? "border border-muted-foreground" : "bg-muted-foreground",
                      )}
                    />
                  )}
                  <span className="min-w-0">
                    <Inlines parts={item.inlines} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            <Inlines parts={block.inlines} />
          </p>
        );
      })}
    </div>
  );
}
