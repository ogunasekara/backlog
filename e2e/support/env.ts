import { execFileSync } from 'node:child_process'

export type LocalSupabase = {
  url: string
  anonKey: string
  serviceRoleKey: string
  /** Mailpit, where local Supabase delivers sign-in emails. */
  inboxUrl: string
}

let cached: LocalSupabase | undefined

/** Connection details from `supabase status`, unless already in the environment. */
export function localSupabase(): LocalSupabase {
  if (cached) return cached
  let {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
  } = process.env
  let inbox = process.env.SUPABASE_INBOX_URL

  if (!url || !anon || !service || !inbox) {
    let out: string
    try {
      out = execFileSync('pnpm', ['exec', 'supabase', 'status', '-o', 'env'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    } catch {
      throw new Error('Local Supabase is not running. Start it with `pnpm db:start`.')
    }
    const vars = Object.fromEntries(
      out
        .split('\n')
        .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
        .filter((m): m is RegExpMatchArray => m !== null)
        .map((m) => [m[1], m[2]]),
    )
    url ??= vars.API_URL
    anon ??= vars.ANON_KEY ?? vars.PUBLISHABLE_KEY
    service ??= vars.SERVICE_ROLE_KEY ?? vars.SECRET_KEY
    inbox ??= vars.MAILPIT_URL ?? vars.INBUCKET_URL
  }

  if (!url || !anon || !service || !inbox) {
    throw new Error('Could not determine the local Supabase keys.')
  }
  cached = { url, anonKey: anon, serviceRoleKey: service, inboxUrl: inbox }
  return cached
}
