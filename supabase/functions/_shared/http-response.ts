/** CORS and JSON response helpers shared by the function entrypoints. */

export const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  })
}

export function errorResponse(message: string, status: number): Response {
  return json({ error: message }, status)
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: corsHeaders })
}
