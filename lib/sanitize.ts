import DOMPurify from 'dompurify'

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|data:image\/)|cid:)/i,
  })
}

