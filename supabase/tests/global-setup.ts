import { execFileSync } from 'node:child_process'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    supabaseUrl: string
    anonKey: string
    serviceRoleKey: string
  }
}

/** Reads connection details from `supabase status`, unless they are already in the environment. */
export default function setup(project: TestProject) {
  let {
    SUPABASE_URL: url,
    SUPABASE_ANON_KEY: anon,
    SUPABASE_SERVICE_ROLE_KEY: service,
  } = process.env

  if (!url || !anon || !service) {
    let out: string
    try {
      out = execFileSync('npx', ['supabase', 'status', '-o', 'env'], { encoding: 'utf8' })
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
  }

  if (!url || !anon || !service) throw new Error('Could not determine local Supabase keys.')

  project.provide('supabaseUrl', url)
  project.provide('anonKey', anon)
  project.provide('serviceRoleKey', service)
}
