import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * Replaces all data in the e2e stack with the demo data set, so every run
 * starts from the same state. Set E2E_SKIP_SEED=1 when pointing
 * E2E_BASE_URL at a stack you have seeded yourself.
 */
export default async function globalSetup() {
  if (process.env.E2E_SKIP_SEED) return
  execFileSync('docker', ['compose', '-p', 'leavedesk-e2e', '-f', 'docker-compose.yml',
    'exec', '-T', 'backend', '/app/leavedesk', 'seed', '--reset'], { cwd: root, stdio: 'pipe' })
}
