import { execFileSync, spawnSync } from 'node:child_process'

const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim()
const expectedGraphify = '0.9.55'

// Keep hook configuration per worktree so enabling it in one checkout does not
// disable hooks in another branch that has not received `.githooks` yet.
execFileSync('git', ['config', '--local', 'extensions.worktreeConfig', 'true'], {
  cwd: gitRoot,
  stdio: 'inherit',
})

execFileSync('git', ['config', '--worktree', 'core.hooksPath', '.githooks'], {
  cwd: gitRoot,
  stdio: 'inherit',
})

const graphify = spawnSync('graphify', ['--version'], {
  cwd: gitRoot,
  encoding: 'utf8',
})

if (graphify.status !== 0) {
  throw new Error(`Graphify no está en PATH; instálalo con: uv tool install "graphifyy[sql]==${expectedGraphify}"`)
} else {
  const installedVersion = graphify.stdout.trim()
  if (installedVersion !== `graphify ${expectedGraphify}`) {
    throw new Error(`Graphify debe ser ${expectedGraphify}; encontrado: ${installedVersion}`)
  }
  console.log(`Hooks instalados en ${gitRoot}`)
  console.log(installedVersion)
}
