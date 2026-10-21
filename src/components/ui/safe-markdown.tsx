import type { Components } from "react-markdown";

/**
 * Element overrides for markdown from users or the AI. Images are never
 * loaded (a model nudged by injected text could otherwise beacon data to an
 * attacker's server via an image URL), and links must be http(s)/mailto.
 */
export const safeMarkdownComponents: Components = {
  img: ({ alt }) => <span className="text-muted-foreground">[image{alt ? `: ${alt}` : ""}]</span>,
  a: ({ href, children }) => {
    const ok = typeof href === "string" && /^(https?:|mailto:)/i.test(href);
    return ok ? (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  },
};
