"use client";

import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

// Lesson text comes from a model, so raw HTML (used for <details> blocks) is
// sanitised before KaTeX adds its own markup.
export function Markdown({ children, className = "" }: { children: string; className?: string }) {
  return (
    <div className={`prose-hive ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeSanitize, rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
