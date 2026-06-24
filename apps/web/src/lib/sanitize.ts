// V469: نسخة مبسطة من sanitize بدون isomorphic-dompurify
export function sanitizePromptInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input
    .replace(/<[^>]*>/g, '') // إزالة HTML tags
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 2000);
}

export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.replace(/<[^>]*>/g, '');
}

export default sanitizePromptInput;
