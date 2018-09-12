import * as chai from 'chai'
import { dirname } from 'path'
import { default as findGit, Git } from 'find-git-exec'
const expect = chai.expect

import { GitProcess, IGitExternalExecutionOptions } from '../../lib'
import { verify } from '../helpers'

const SSH = require('node-ssh')
const temp = require('temp').track()

describe('git-process [with external Git executable]', () => {
  let git: Git | undefined = undefined

  before(async () => {
    try {
      git = await findGit()
    } catch {}
    if (!git || !git.path || !git.execPath) {
      git = undefined
    } else {
      const { path, execPath } = git
      // Set the environment variable to be able to use an external Git.
      process.env.GIT_EXEC_PATH = execPath
      process.env.LOCAL_GIT_DIRECTORY = dirname(dirname(path))
    }
  })

  beforeEach(async function() {
    if (!git) {
      console.warn(`External Git was not found on the host system.`)
      this.skip()
    }
  })

  describe('clone', () => {
    it('returns exit code when successful', async () => {
      const testRepoPath = temp.mkdirSync('desktop-git-clone-valid-external')
      const result = await GitProcess.exec(
        ['clone', '--', 'https://github.com/TypeFox/find-git-exec.git', '.'],
        testRepoPath
      )
      verify(result, r => {
        expect(r.exitCode).to.equal(0)
      })
    })
    it('should fail when using an exec function without GIT_EXEC_PATH and LOCAL_GIT_DIRECTORY', async () => {
      const execPath = process.env.GIT_EXEC_PATH
      const localGitDir = process.env.LOCAL_GIT_DIRECTORY
      try {
        delete process.env.GIT_EXEC_PATH
        delete process.env.LOCAL_GIT_DIRECTORY
        const exec: IGitExternalExecutionOptions.ExecFunc = (
          path: string,
          args: string[],
          options: { cwd?: string },
          callback: (error: Error | null, stdout: string, stderr: string) => void
        ) => {
          // Ignored.
        }
        try {
          await GitProcess.exec(['does not matter'], 'this is ignored now', { exec })
          throw new Error(
            'Expected an error when exec function is defined but GIT_EXEC_PATH or LOCAL_GIT_DIRECTORY is not.'
          )
        } catch (e) {
          expect(e).to.be.instanceof(Error)
          expect(e.message).to.be.equal(
            'LOCAL_GIT_DIRECTORY and GIT_EXEC_PATH must be specified when using an exec function.'
          )
        }
      } finally {
        process.env.GIT_EXEC_PATH = execPath
        process.env.LOCAL_GIT_DIRECTORY = localGitDir
      }
    })
    it('clone over SSH', async () => {
      const ssh = new SSH()
      try {
        await ssh.connect({
          host: 'localhost',
          username: 'your-username',
          password: 'your-password'
        })
        const exec: IGitExternalExecutionOptions.ExecFunc = async (
          path: string,
          args: string[],
          options: { cwd?: string },
          callback: (error: Error | null, stdout: string, stderr: string) => void
        ) => {
          const { stdout, stderr, code } = await ssh.execCommand(`${path} ${args.join(' ')}`, {
            cwd: options.cwd
          })
          let error: Error | null = null
          if (code) {
            error = new Error(stderr || 'Unknown error.')
            ;(error as any).code = code
          }
          callback(error, stdout, stderr)
        }
        const testRepoPath = temp.mkdirSync('desktop-git-clone-valid-external-ssh')
        const result = await GitProcess.exec(
          ['clone', '--', 'https://github.com/TypeFox/find-git-exec.git', '.'],
          testRepoPath,
          { exec }
        )
        verify(result, r => {
          expect(r.exitCode).to.equal(0)
        })
      } finally {
        ssh.dispose()
      }
    })
  })
})
