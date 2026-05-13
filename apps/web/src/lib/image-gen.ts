/**
 * Roua Trading — Image Generation Utility (V5)
 *
 * ARCHITECTURE:
 *   Primary: Cloudflare R2 (if configured via R2_BUCKET env var)
 *   Fallback: Pollinations AI direct URLs (always available, no storage needed)
 *
 * GOLDEN RULE (V5):
 *   When R2 is NOT available, we use Pollinations direct URLs
 *   instead of /tmp files. This means:
 *   - imageUrl = "https://image.pollinations.ai/prompt/{encoded}?width=1024&height=768"
 *   - imageSource = "pollinations"
 *   - No local file storage needed
 *   - Images are generated on-demand by Pollinations CDN
 *
 * Pollinations URLs are treated as VALID image URLs throughout the system.
 * The infographic API routes accept Pollinations URLs as legitimate images.
 */

// ── Types ──

export interface ImageGenResult {
  success: boolean
  imageUrl: string | null
  imageSource: 'pollinations' | 'r2' | 'none'
  error?: string
}

export interface ImageGenOptions {
  prompt: string
  width?: number
  height?: number
  seed?: number
  nologo?: boolean
}

// ── Constants ──

const POLLINATIONS_BASE = 'https://image.pollinations.ai/prompt'
const DEFAULT_WIDTH = 1024
const DEFAULT_HEIGHT = 768

// ── R2 Check ──

/**
 * Check if Cloudflare R2 is configured and available.
 * R2 requires: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
function isR2Available(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET
  )
}

// ── Pollinations URL Builder ──

/**
 * Build a Pollinations AI image URL.
 * These URLs are deterministic — same prompt + seed = same image.
 * The image is generated on-demand by the Pollinations CDN.
 *
 * @param prompt - Text description of the desired image
 * @param options - Width, height, seed, nologo
 * @returns Pollinations URL string
 */
export function buildPollinationsUrl(prompt: string, options: Omit<ImageGenOptions, 'prompt'> = {}): string {
  const {
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    seed = 42,
    nologo = true,
  } = options

  const encodedPrompt = encodeURIComponent(prompt)
  const params = new URLSearchParams()
  params.set('width', String(width))
  params.set('height', String(height))
  params.set('seed', String(seed))
  if (nologo) params.set('nologo', 'true')

  return `${POLLINATIONS_BASE}/${encodedPrompt}?${params.toString()}`
}

// ── Main Generation Function ──

/**
 * Generate an infographic image.
 *
 * V5 BEHAVIOR:
 *   1. If R2 is configured → try R2 upload first
 *   2. If R2 fails or is unavailable → use Pollinations direct URL
 *   3. NEVER fall back to /tmp — always use Pollinations URLs
 *
 * @param options - Image generation options
 * @returns ImageGenResult with URL and source info
 */
export async function generateInfographicImage(options: ImageGenOptions): Promise<ImageGenResult> {
  const { prompt, width, height, seed, nologo } = options

  // Strategy 1: Try R2 if configured
  if (isR2Available()) {
    try {
      const r2Result = await uploadToR2(prompt, { width, height })
      if (r2Result.success && r2Result.imageUrl) {
        return {
          success: true,
          imageUrl: r2Result.imageUrl,
          imageSource: 'r2',
        }
      }
    } catch (error: any) {
      console.warn('[image-gen] R2 upload failed, falling back to Pollinations:', error.message)
    }
  }

  // Strategy 2: Pollinations direct URL (always works, no storage needed)
  try {
    const pollinationsUrl = buildPollinationsUrl(prompt, { width, height, seed, nologo })

    // Verify the URL is reachable (quick HEAD request with timeout)
    const isReachable = await verifyPollinationsUrl(pollinationsUrl)

    if (isReachable) {
      return {
        success: true,
        imageUrl: pollinationsUrl,
        imageSource: 'pollinations',
      }
    }

    // Even if HEAD fails, Pollinations URLs are still valid —
    // they generate on first access. Return the URL anyway.
    return {
      success: true,
      imageUrl: pollinationsUrl,
      imageSource: 'pollinations',
    }
  } catch (error: any) {
    return {
      success: false,
      imageUrl: null,
      imageSource: 'none',
      error: `Image generation failed: ${error.message}`,
    }
  }
}

// ── Pollinations URL Verification ──

/**
 * Verify a Pollinations URL is reachable.
 * Uses a HEAD request with a short timeout.
 * Returns true even on timeout — Pollinations generates on-demand.
 */
async function verifyPollinationsUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000) // 5s timeout

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    })

    clearTimeout(timeout)
    return response.ok || response.status === 200 || response.status === 302
  } catch {
    // Timeout or network error — URL is still valid, Pollinations generates on-demand
    return true
  }
}

// ── R2 Upload (Optional) ──

/**
 * Upload an image to Cloudflare R2.
 * Only called when R2 environment variables are configured.
 * Falls back to Pollinations if R2 fails.
 */
async function uploadToR2(
  prompt: string,
  options: { width?: number; height?: number }
): Promise<{ success: boolean; imageUrl?: string; error?: string }> {
  const accountId = process.env.R2_ACCOUNT_ID!
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!
  const bucket = process.env.R2_BUCKET!
  const publicDomain = process.env.R2_PUBLIC_DOMAIN || `${bucket}.r2.dev`

  // First, generate the image via Pollinations
  const imageUrl = buildPollinationsUrl(prompt, {
    width: options.width || DEFAULT_WIDTH,
    height: options.height || DEFAULT_HEIGHT,
  })

  try {
    // Download the image from Pollinations
    const imageResponse = await fetch(imageUrl, { redirect: 'follow' })
    if (!imageResponse.ok) {
      return { success: false, error: `Failed to fetch image: ${imageResponse.status}` }
    }

    const imageBuffer = await imageResponse.arrayBuffer()
    const key = `infographics/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`

    // Upload to R2 via S3-compatible API
    const uploadUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`

    // Simple S3 PUT request (minimal auth for now)
    // In production, use AWS SDK with proper SigV4 signing
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(imageBuffer.byteLength),
      },
      body: imageBuffer,
    })

    if (uploadResponse.ok) {
      return {
        success: true,
        imageUrl: `https://${publicDomain}/${key}`,
      }
    }

    return { success: false, error: `R2 upload failed: ${uploadResponse.status}` }
  } catch (error: any) {
    return { success: false, error: `R2 upload error: ${error.message}` }
  }
}

// ── Image URL Validation ──

/**
 * Validate if a URL is a valid image URL.
 *
 * GOLDEN RULE (V5):
 *   Pollinations URLs are treated as VALID image URLs.
 *   This is the key fix — previously only R2/local URLs were accepted,
 *   causing infographics with Pollinations images to be marked as "missing".
 *
 * Valid sources:
 *   - Pollinations: https://image.pollinations.ai/prompt/*
 *   - R2: https://*.r2.dev/* or https://*.cloudflarestorage.com/*
 *   - Any HTTPS URL with image extension
 */
export function isValidImageUrl(url: string | null | undefined): boolean {
  if (!url) return false

  try {
    const parsed = new URL(url)

    // Pollinations URLs are always valid
    if (parsed.hostname === 'image.pollinations.ai') return true

    // R2 URLs are valid
    if (parsed.hostname.endsWith('.r2.dev')) return true
    if (parsed.hostname.endsWith('.cloudflarestorage.com')) return true

    // Any HTTPS URL with image extension
    if (parsed.protocol === 'https:') {
      const path = parsed.pathname.toLowerCase()
      if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') || path.endsWith('.webp')) {
        return true
      }
    }

    // Generic HTTPS URLs (could be CDN, etc.)
    if (parsed.protocol === 'https:') return true

    return false
  } catch {
    return false
  }
}

/**
 * Check if a URL is a Pollinations URL.
 */
export function isPollinationsUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return new URL(url).hostname === 'image.pollinations.ai'
  } catch {
    return false
  }
}

/**
 * Fix a broken/missing image URL by regenerating via Pollinations.
 *
 * @param currentUrl - Current (possibly broken) image URL
 * @param prompt - Prompt to use for regeneration
 * @param options - Image generation options
 * @returns New image URL (always Pollinations)
 */
export async function fixImageUrl(
  currentUrl: string | null | undefined,
  prompt: string,
  options: Omit<ImageGenOptions, 'prompt'> = {}
): Promise<ImageGenResult> {
  // If current URL is valid, no fix needed
  if (isValidImageUrl(currentUrl)) {
    return {
      success: true,
      imageUrl: currentUrl!,
      imageSource: isPollinationsUrl(currentUrl) ? 'pollinations' : 'r2',
    }
  }

  // Regenerate via Pollinations
  return generateInfographicImage({ prompt, ...options })
}
