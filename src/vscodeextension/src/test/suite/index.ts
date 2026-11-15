import * as vscode from 'vscode';
import * as assert from 'assert';

import * as path from 'path';
import Mocha = require('mocha');
import { glob } from 'glob';
import * as testutils from './utils'
import { MemoryFile, register_memoryFileProvider } from './memoryfile';

/**
 *  Provides functions for all extensions that need
 *  to be activated.
 **/
export class Extensions
{
  private static async activate_extension(name: string)
  {
    let ext = vscode.extensions.getExtension(name);
    assert.notStrictEqual (ext, undefined,
          "Extension '" + name +
          "' cannot be obtained. Perhaps it's not installed.");
    return await ext?.activate ();
  }


  static async activate_python()
  {
    await Extensions.activate_extension ("ms-python.python");
    await Extensions.activate_extension ("ms-python.vscode-pylance");
  }

  static async activate_visualProgramming()
  {
    return await Extensions.activate_extension (
                "itnccuong.source-code-visualizer");
  }
}




/**
 * Activate all extensions the tests are going to use.
 **/
async function activateExtensions()
{
  await Extensions.activate_python ();
  let extensionContext = await Extensions.activate_visualProgramming ();
  register_memoryFileProvider (extensionContext);
}



export async function run(): Promise<void>
{
  await activateExtensions();

  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true
  });
  // increase timeout for tests, so we
  //  have a chance to debug
  mocha.timeout (900000000);

  const testsRoot = path.resolve(__dirname, '..');

  const files = await glob('**/*.test.js', { cwd: testsRoot });
  files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((c, e) => {

      try {
        // Run the mocha test
        mocha.run(failures => {
          if (failures > 0) {
            let total = -1;
            e(new Error(`${failures}/${total} tests failed.`));
          } else {
            c();
          }
        });
      } catch (err) {
        console.error(err);
        e(err);
      }
  });
}
