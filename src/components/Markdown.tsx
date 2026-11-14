"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

// Lesson text comes from a model, so raw HTML (used for <details> blocks) is
// sanitised before KaTeX adds its own markup. Images are dropped so injected
// output cannot make the browser call an outside server.
const SCHEMA = { ...defaultSchema, tagNames: (defaultSchema.tagNames ?? []).filter((t) => t !== "img") };
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`prose-hc ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, [rehypeSanitize, SCHEMA], rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
