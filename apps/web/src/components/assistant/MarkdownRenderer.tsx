'use client';

/**
 * MarkdownRenderer — Sustainable Markdown rendering for Assistant chat
 *
 * Replaces the 200-line custom regex parser with industry-standard
 * react-markdown + remark-gfm. This is the sustainable solution —
 * no more regex patches that break on edge cases.
 *
 * Features:
 * - GFM tables (| col1 | col2 |)
 * - Headings (## ### ####)
 * - Bold/italic/code
 * - Bullet + numbered lists
 * - Horizontal rules (---)
 * - Blockquotes (>)
 * - RTL/LTR aware
 * - Trading-specific styling (BUY=green, SELL=red, etc.)
 * - No dangerouslySetInnerHTML (XSS-safe by design)
 *
 * V573: Replaces the custom parser in AssistantChatWidget.tsx
 */

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  isRtl: boolean;
}

// Color palette (matches platform design system)
const COLORS = {
  bg: '#0B0E14',
  card: '#151A22',
  border: '#2A313C',
  primary: '#059669',
  gold: '#d4af37',
  cyan: '#00E5FF',
  green: '#22C55E',
  red: '#EF5350',
  amber: '#FFB800',
  textPrimary: '#E8EDF5',
  textSecondary: '#B0C4D8',
  textMuted: '#6A7A8E',
} as const;

/**
 * Inline content renderer — colors numbers, prices, percentages
 * Used inside table cells and paragraphs for trading-specific highlighting
 */
function renderInlineContent(text: string): React.ReactNode[] {
  // Split on bold markers first
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, j) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={j} style={{ color: COLORS.cyan, fontWeight: 700 }}>
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Color numbers: percentages, dollar amounts, pips
    const numParts = part.split(
      /([+\-]?[\d.,]+\s*%|\$[\d.,]+|[\d.,]+\s*(?:نقطة|pips?|USD|EUR|GBP|points?))/g
    );
    if (numParts.length > 1) {
      return (
        <span key={j}>
          {numParts.map((np, nj) => {
            // Percentage: green if positive, red if negative
            if (/^[+\-]?[\d.,]+\s*%$/.test(np)) {
              const isPos =
                np.startsWith('+') || (!np.startsWith('-') && parseFloat(np) > 0);
              return (
                <span
                  key={nj}
                  style={{
                    color: isPos ? COLORS.green : COLORS.red,
                    fontWeight: 700,
                  }}
                >
                  {np}
                </span>
              );
            }
            // Dollar amount: cyan
            if (/^\$[\d.,]+$/.test(np)) {
              return (
                <span key={nj} style={{ color: COLORS.cyan, fontWeight: 700 }}>
                  {np}
                </span>
              );
            }
            // Pips/points: amber
            if (/[\d.,]+\s*(نقطة|pips?|USD|EUR|GBP|points?)/.test(np)) {
              return (
                <span key={nj} style={{ color: COLORS.amber, fontWeight: 600 }}>
                  {np}
                </span>
              );
            }
            return <span key={nj}>{np}</span>;
          })}
        </span>
      );
    }
    return <span key={j}>{part}</span>;
  });
}

/**
 * Determine cell color based on content (BUY/SELL/urgent/good)
 */
function getCellColor(cell: string): string {
  const isBuy = /buy|long|شراء|صاعد|bullish|🟢|📈/i.test(cell);
  const isSell = /sell|short|بيع|هابط|bearish|🔴|📉/i.test(cell);
  const isUrgent = /عاجل|حرج|urgent|critical|⚠️/i.test(cell);
  const isGood = /جيد|good|safe|آمن|🟢/i.test(cell);

  if (isUrgent) return COLORS.red;
  if (isGood) return COLORS.green;
  if (isBuy) return COLORS.green;
  if (isSell) return COLORS.red;
  return COLORS.textPrimary;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isRtl,
}) => {
  const dir = isRtl ? 'rtl' : 'ltr';

  // Memoize the components config to prevent re-creation on every render
  const components = useMemo<React.ComponentProps<typeof ReactMarkdown>['components']>(
    () => ({
      // ── Headings ──
      h1: ({ children }) => (
        <h1
          style={{
            color: COLORS.cyan,
            fontSize: '18px',
            fontWeight: 800,
            margin: '18px 0 10px',
            padding: '8px 12px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(0,229,255,0.10) 0%, rgba(0,229,255,0.04) 100%)',
            borderLeft: isRtl ? 'none' : `3px solid ${COLORS.cyan}`,
            borderRight: isRtl ? `3px solid ${COLORS.cyan}` : 'none',
            direction: dir,
          }}
        >
          {children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2
          style={{
            color: COLORS.cyan,
            fontSize: '16px',
            fontWeight: 700,
            margin: '16px 0 8px',
            padding: '8px 12px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(0,229,255,0.10) 0%, rgba(0,229,255,0.04) 100%)',
            borderLeft: isRtl ? 'none' : `3px solid ${COLORS.cyan}`,
            borderRight: isRtl ? `3px solid ${COLORS.cyan}` : 'none',
            direction: dir,
          }}
        >
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3
          style={{
            color: COLORS.cyan,
            fontSize: '14px',
            fontWeight: 700,
            margin: '14px 0 6px',
            padding: '8px 12px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, rgba(0,229,255,0.10) 0%, rgba(0,229,255,0.04) 100%)',
            borderLeft: isRtl ? 'none' : `3px solid ${COLORS.cyan}`,
            borderRight: isRtl ? `3px solid ${COLORS.cyan}` : 'none',
            direction: dir,
          }}
        >
          {children}
        </h3>
      ),
      h4: ({ children }) => (
        <h4
          style={{
            color: COLORS.cyan,
            fontSize: '13px',
            fontWeight: 700,
            margin: '12px 0 6px',
            direction: dir,
          }}
        >
          {children}
        </h4>
      ),

      // ── Paragraphs ──
      p: ({ children }) => {
        // Process children to add inline coloring for numbers
        const processNode = (node: React.ReactNode): React.ReactNode => {
          if (typeof node === 'string') {
            return <>{renderInlineContent(node)}</>;
          }
          if (Array.isArray(node)) {
            return node.map((n, i) => <React.Fragment key={i}>{processNode(n)}</React.Fragment>);
          }
          return node;
        };
        return (
          <p
            style={{
              fontSize: '13.5px',
              lineHeight: 1.8,
              color: COLORS.textPrimary,
              margin: '0 0 12px',
              direction: dir,
            }}
          >
            {processNode(children)}
          </p>
        );
      },

      // ── Lists ──
      ul: ({ children }) => (
        <ul
          style={{
            margin: '8px 0 12px',
            paddingInlineStart: isRtl ? '0' : '20px',
            paddingInlineEnd: isRtl ? '20px' : '0',
            direction: dir,
            listStyleType: 'disc',
          }}
        >
          {children}
        </ul>
      ),
      ol: ({ children }) => (
        <ol
          style={{
            margin: '8px 0 12px',
            paddingInlineStart: isRtl ? '0' : '20px',
            paddingInlineEnd: isRtl ? '20px' : '0',
            direction: dir,
          }}
        >
          {children}
        </ol>
      ),
      li: ({ children }) => {
        // Process children for inline coloring
        const processNode = (node: React.ReactNode): React.ReactNode => {
          if (typeof node === 'string') {
            return <>{renderInlineContent(node)}</>;
          }
          if (Array.isArray(node)) {
            return node.map((n, i) => <React.Fragment key={i}>{processNode(n)}</React.Fragment>);
          }
          return node;
        };
        return (
          <li
            style={{
              fontSize: '13px',
              lineHeight: 1.7,
              color: COLORS.textPrimary,
              margin: '4px 0',
              direction: dir,
            }}
          >
            {processNode(children)}
          </li>
        );
      },

      // ── Tables (GFM) ──
      table: ({ children }) => (
        <div
          style={{
            margin: '12px 0',
            overflowX: 'auto',
            borderRadius: '8px',
            border: `1px solid rgba(0,229,255,0.20)`,
            background: 'rgba(15,20,33,0.40)',
            maxWidth: '100%',
            direction: 'ltr', // Tables always LTR for consistency
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '12.5px',
              tableLayout: 'fixed',
            }}
          >
            {children}
          </table>
        </div>
      ),
      thead: ({ children }) => <thead>{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      tr: ({ children }) => (
        <tr style={{ background: 'transparent' }}>{children}</tr>
      ),
      th: ({ children }) => (
        <th
          style={{
            padding: '10px 12px',
            textAlign: 'left',
            borderBottom: `2px solid rgba(0,229,255,0.40)`,
            color: COLORS.cyan,
            fontWeight: 700,
            background: 'rgba(0,229,255,0.08)',
            fontSize: '12px',
            letterSpacing: '0.02em',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
          }}
        >
          {children}
        </th>
      ),
      td: ({ children, ...props }) => {
        // Get cell text to determine color
        const cellText =
          typeof children === 'string'
            ? children
            : Array.isArray(children)
            ? children.join(' ')
            : String(children ?? '');
        const color = getCellColor(cellText);
        const isFirstChild = (props as any)['data-column-index'] === 0;

        // Process children for inline coloring
        const processNode = (node: React.ReactNode): React.ReactNode => {
          if (typeof node === 'string') {
            return <>{renderInlineContent(node)}</>;
          }
          if (Array.isArray(node)) {
            return node.map((n, i) => <React.Fragment key={i}>{processNode(n)}</React.Fragment>);
          }
          return node;
        };

        return (
          <td
            style={{
              padding: '9px 12px',
              textAlign: 'left',
              borderBottom: '1px solid rgba(0,229,255,0.08)',
              borderLeft: '1px solid rgba(0,229,255,0.06)',
              color,
              fontWeight: isFirstChild ? 700 : 500,
              wordBreak: 'break-word',
              overflowWrap: 'break-word',
              lineHeight: 1.5,
            }}
          >
            {processNode(children)}
          </td>
        );
      },

      // ── Horizontal rule ──
      hr: () => (
        <hr
          style={{
            height: '1px',
            border: 'none',
            background:
              'linear-gradient(90deg, transparent, rgba(0,229,255,0.30), transparent)',
            margin: '16px 0',
          }}
        />
      ),

      // ── Blockquote ──
      blockquote: ({ children }) => (
        <blockquote
          style={{
            margin: '8px 0',
            padding: '8px 12px',
            borderRadius: '6px',
            background: 'rgba(0,229,255,0.05)',
            borderLeft: isRtl ? 'none' : `2px solid ${COLORS.cyan}`,
            borderRight: isRtl ? `2px solid ${COLORS.cyan}` : 'none',
            color: COLORS.textSecondary,
            fontStyle: 'italic',
            fontSize: '12px',
            direction: dir,
          }}
        >
          {children}
        </blockquote>
      ),

      // ── Inline elements ──
      strong: ({ children }) => (
        <strong style={{ color: COLORS.cyan, fontWeight: 700 }}>{children}</strong>
      ),
      em: ({ children }) => (
        <em style={{ color: COLORS.amber, fontStyle: 'italic' }}>{children}</em>
      ),
      code: ({ children }) => (
        <code
          style={{
            background: 'rgba(0,229,255,0.10)',
            color: COLORS.cyan,
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          }}
        >
          {children}
        </code>
      ),
      pre: ({ children }) => (
        <pre
          style={{
            background: 'rgba(15,20,33,0.80)',
            border: `1px solid ${COLORS.border}`,
            borderRadius: '8px',
            padding: '12px',
            overflowX: 'auto',
            direction: 'ltr',
            margin: '8px 0',
          }}
        >
          {children}
        </pre>
      ),

      // ── Links ──
      a: ({ children, href }) => (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: COLORS.cyan,
            textDecoration: 'underline',
            textDecorationColor: 'rgba(0,229,255,0.40)',
          }}
        >
          {children}
        </a>
      ),
    }),
    [dir, isRtl]
  );

  return (
    <div
      style={{
        direction: dir,
        color: COLORS.textPrimary,
        fontSize: '13.5px',
        lineHeight: 1.7,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        // Skip HTML in markdown (XSS protection — no dangerouslySetInnerHTML)
        skipHtml={true}
        // Don't unwrap disallowed elements
        unwrapDisallowed={true}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
