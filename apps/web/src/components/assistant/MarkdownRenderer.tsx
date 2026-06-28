'use client';

/**
 * MarkdownRenderer — Minimal sustainable Markdown rendering
 *
 * V573.5: تبسيط شديد بعد فشل النسخة المعقدة (440 سطر)
 * الـ react-markdown v10 حساس للـ props المعقدة → أبسط config ممكن
 *
 * الـ styling يُطبق عبر CSS classes في assistant.css (أكثر استدامة من inline styles)
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
  isRtl: boolean;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  isRtl,
}) => {
  const dir = isRtl ? 'rtl' : 'ltr';

  return (
    <div
      className="assistant-markdown"
      dir={dir}
      style={{
        direction: dir,
        color: '#E8EDF5',
        fontSize: '13.5px',
        lineHeight: 1.8,
      }}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headings
          h1: ({ children }) => (
            <h1 className="md-h1" style={{ color: '#00E5FF', fontSize: '18px', fontWeight: 800, margin: '18px 0 10px', direction: dir }}>
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="md-h2" style={{ color: '#00E5FF', fontSize: '16px', fontWeight: 700, margin: '16px 0 8px', direction: dir }}>
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="md-h3" style={{ color: '#00E5FF', fontSize: '14px', fontWeight: 700, margin: '14px 0 6px', direction: dir }}>
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="md-h4" style={{ color: '#00E5FF', fontSize: '13px', fontWeight: 700, margin: '12px 0 6px', direction: dir }}>
              {children}
            </h4>
          ),

          // Paragraph
          p: ({ children }) => (
            <p className="md-p" style={{ fontSize: '13.5px', lineHeight: 1.8, color: '#D1D9E5', margin: '0 0 12px', direction: dir }}>
              {children}
            </p>
          ),

          // Lists
          ul: ({ children }) => (
            <ul className="md-ul" style={{ margin: '8px 0 12px', paddingInlineStart: isRtl ? '0' : '20px', paddingInlineEnd: isRtl ? '20px' : '0', direction: dir, listStyleType: 'disc' }}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="md-ol" style={{ margin: '8px 0 12px', paddingInlineStart: isRtl ? '0' : '20px', paddingInlineEnd: isRtl ? '20px' : '0', direction: dir }}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="md-li" style={{ fontSize: '13px', lineHeight: 1.7, color: '#D1D9E5', margin: '4px 0', direction: dir }}>
              {children}
            </li>
          ),

          // Table (GFM)
          table: ({ children }) => (
            <div className="md-table-wrap" style={{ margin: '12px 0', overflowX: 'auto', borderRadius: '8px', border: '1px solid rgba(0,229,255,0.20)', background: 'rgba(15,20,33,0.40)', maxWidth: '100%' }}>
              <table className="md-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', tableLayout: 'fixed' }}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => (
            <th className="md-th" style={{ padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid rgba(0,229,255,0.40)', color: '#00E5FF', fontWeight: 700, background: 'rgba(0,229,255,0.08)', fontSize: '12px', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
              {children}
            </th>
          ),
          td: ({ children }) => {
            // Determine cell color based on content
            const cellText = typeof children === 'string'
              ? children
              : Array.isArray(children)
              ? children.join(' ')
              : String(children ?? '');
            const isBuy = /buy|long|شراء|صاعد|bullish|🟢|📈/i.test(cellText);
            const isSell = /sell|short|بيع|هابط|bearish|🔴|📉/i.test(cellText);
            const isUrgent = /عاجل|حرج|urgent|critical|⚠️|🚨/i.test(cellText);
            const isGood = /جيد|good|safe|آمن/i.test(cellText);
            let color = '#E8EDF5';
            if (isUrgent) color = '#EF5350';
            else if (isGood) color = '#22C55E';
            else if (isBuy) color = '#22C55E';
            else if (isSell) color = '#EF5350';
            return (
              <td className="md-td" style={{ padding: '9px 12px', textAlign: 'left', borderBottom: '1px solid rgba(0,229,255,0.08)', color, fontWeight: 500, wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: 1.5 }}>
                {children}
              </td>
            );
          },

          // Horizontal rule
          hr: () => (
            <hr className="md-hr" style={{ height: '1px', border: 'none', background: 'linear-gradient(90deg, transparent, rgba(0,229,255,0.30), transparent)', margin: '16px 0' }} />
          ),

          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="md-quote" style={{ margin: '8px 0', padding: '8px 12px', borderRadius: '6px', background: 'rgba(0,229,255,0.05)', borderLeft: isRtl ? 'none' : '2px solid #00E5FF', borderRight: isRtl ? '2px solid #00E5FF' : 'none', color: '#B0C4D8', fontStyle: 'italic', fontSize: '12px', direction: dir }}>
              {children}
            </blockquote>
          ),

          // Inline
          strong: ({ children }) => (
            <strong style={{ color: '#00E5FF', fontWeight: 700 }}>{children}</strong>
          ),
          em: ({ children }) => (
            <em style={{ color: '#FFB800', fontStyle: 'italic' }}>{children}</em>
          ),
          code: ({ children }) => (
            <code style={{ background: 'rgba(0,229,255,0.10)', color: '#00E5FF', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>
              {children}
            </code>
          ),
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#00E5FF', textDecoration: 'underline' }}>
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

export default MarkdownRenderer;
