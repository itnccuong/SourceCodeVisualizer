import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from '@vscode/test-electron';



export function getTestDirPath()
{
  return path.resolve(__dirname, "../../src/test");
}


async function main()
{
    // macOS Unix sockets cannot use this repository's long iCloud path.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scv-test-'));
    try {
      // The folder containing the Extension Manifest package.json
      // Passed to `--extensionDevelopmentPath`
      const extensionDevelopmentPath = path.resolve(__dirname, '../../');

      // The path to test runner
      // Passed to --extensionTestsPath
      const extensionTestsPath = path.resolve(__dirname, './suite/index');
      // Modern test tools require a current VS Code extension-host runtime.
      const vscodeExecutablePath = process.env.VSCODE_EXECUTABLE_PATH
        || await downloadAndUnzipVSCode('stable');
      const [cliPath, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(
        vscodeExecutablePath, {reuseMachineInstall: true});
      const profileArgs = [
        '--user-data-dir', userDataDir,
        '--extensions-dir', path.join(extensionDevelopmentPath, '.vscode-test', 'extensions')
      ];

      const installation = child_process.spawnSync(cliPath,
        [...cliArgs, ...profileArgs, '--install-extension', 'ms-python.python', '--install-extension', 'ms-python.vscode-pylance'],
        {
          encoding: 'utf-8',
          stdio: 'inherit',
          shell: process.platform === 'win32'
        });
      if (installation.error) { throw installation.error; }
      if (installation.status !== 0) {
        throw new Error('Test language-extension installation failed: ' + installation.status);
      }

      await runTests({
        // Use the specified `code` executable
        vscodeExecutablePath,
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [
          path.resolve(getTestDirPath(), 'testfiles'),
          ...profileArgs,
          '--skip-welcome',
          '--skip-release-notes',
          '--disable-workspace-trust',
          '--disable-extension=visualprogrammingx.sourcecodevisualizer-local'
        ]
      });
    } catch (err) {
      console.error('Failed to run tests', err);
      process.exitCode = 1;
    }
    finally {
      fs.rmSync(userDataDir, {recursive: true, force: true});
    }

}


if (require.main === module) {
  main();
}
