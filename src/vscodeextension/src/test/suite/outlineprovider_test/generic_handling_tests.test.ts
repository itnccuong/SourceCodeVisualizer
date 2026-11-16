import * as vscode from 'vscode';
import { Range, window, Position, Selection } from 'vscode';
import * as path from 'path';
import * as assert from 'assert';
import {AssertX as assertx} from '../assert_utils';
import {executeDefinitionProviderForPositionOnDocument} from '../../../outlineproviderAPI/extensionactivator'
import * as utils from '../../../utils'
import {getTestDirPath} from "../../main"
import {MemoryFile} from "../memoryfile"
import { VpLspExtenderCurlyBraces } from '../../../outlineproviders/lspextender_curlyBraces';
import { OutlineUtils } from '../../../outlineproviderAPI/utils/outlineutils';
import { DocumentSymbolX } from '../../../outlineproviderAPI/utils/documentsymbolx';
import {VpLspExtenderTypeScript} from '../../../outlineproviders/lspextendertypescript';
import * as Outline from '../../../outlineproviderAPI/SymbolDefinition';


async function openDocument(filename: string) {

  let testfile = path.resolve(getTestDirPath(), './testfiles', "typescript", filename + ".ts");
  let uri = vscode.Uri.file (testfile);
  let doc = await vscode.workspace.openTextDocument(uri);
  return doc;
}


async function createMemDocument(content: string, language = "typescript")
  : Promise<vscode.TextDocument>
{
  let memfile = MemoryFile.createDocument(language === "cpp" ? "cpp" : language === "javascript" ? "js" : "ts");
  memfile.write (content);

  const doc = await vscode.workspace.openTextDocument(memfile.uri);
  return vscode.languages.setTextDocumentLanguage(doc, language);
}



suite('getLanguageSpecificSymbolInformation()', async () =>
{
  test('01 simple function: ranges check', async () =>
  {
    // setup
    let content =   "function aaa()\n"
                  + "{\n"
                  + "  let a = 5;\n"
                  + "}"
    let doc = await createMemDocument (content);

    let full_range = utils.range_new (0,0,3,1);
    let name_range = utils.range_new(0, 9, 0, 12);
    let symbol = new vscode.DocumentSymbol ("aaa", "",
                                            vscode.SymbolKind.Function,
                                            full_range, name_range) ;

    // run
    let subject = new VpLspExtenderCurlyBraces ("typescript");
    let actual = subject.getLanguageSpecificSymbolInformation (doc, symbol);

    // check
    let actual_rangeHead  = actual.rangeHead;
    let actual_rangeBody  = actual.rangeBody;

    assertx.range_equals (actual_rangeHead,
                          utils.range_new (0,9,1,0),
                          "function head range");

    assertx.range_equals (actual_rangeBody,
                          utils.range_new (2,0,2,12),
                          "function body range");

  });



  for (const language of ['javascript', 'typescript', 'cpp'] as const) {
    test('08 handles callback functions for ' + language, async () => {
      const content = 'function aaa()\n'
        + '{\n'
        + '  return funcWithPromise ().\n'
        + '  then(symbols =>\n'
        + '  {\n'
        + '    return symbols;\n'
        + '  }).catch (err =>\n'
        + '  {\n'
        + '    return err;\n'
        + '  });\n'
        + '}\n';
      const doc = await createMemDocument(content, language);
      const symbol = new vscode.DocumentSymbol('aaa', '', vscode.SymbolKind.Function,
        utils.range_new(0, 0, 10, 1), utils.range_new(0, 9, 0, 12));
      const catchRange = utils.range_new(6, 12, 9, 3);
      const thenRange = utils.range_new(3, 7, 6, 3);
      const catchCallback = new vscode.DocumentSymbol('catch() callback', '', vscode.SymbolKind.Function,
        catchRange, catchRange);
      const thenCallback = new vscode.DocumentSymbol('then() callback', '', vscode.SymbolKind.Function,
        thenRange, thenRange);
      symbol.children = [catchCallback, thenCallback];
      const adapter = language === 'cpp'
        ? new VpLspExtenderCurlyBraces(language) : new VpLspExtenderTypeScript(language);
      const actual = OutlineUtils.documentSymbol2outlineSymbol(doc, new DocumentSymbolX(symbol, doc.uri), adapter);
      const bodyRange = utils.range_new(2, 0, 9, 5);

      if (language === 'cpp') {
        assert.strictEqual(actual.parts.length, 1, 'legacy adapters keep callbacks in source');
        assert.ok(actual.parts[0] instanceof Outline.Text);
        assertx.range_equals(actual.parts[0].displayTextRange, bodyRange);
      } else {
        assert.strictEqual(actual.parts.length, 5, 'both callbacks and all surrounding source are retained');
        assert.deepStrictEqual(actual.parts.map(part => part.CLASS_TYPE), ['Text', 'Symbol', 'Text', 'Symbol', 'Text']);
        const expectedRanges = [
          utils.range_new(2, 0, 3, 7), thenRange, utils.range_new(6, 3, 6, 12), catchRange,
          utils.range_new(9, 3, 9, 5)
        ];
        actual.parts.forEach((part, index) => assertx.range_equals(
          part instanceof Outline.Symbol ? part.totalRange : part.displayTextRange, expectedRanges[index]));
        assert.deepStrictEqual(actual.parts.filter(part => part instanceof Outline.Text)
          .map(part => doc.getText(part.displayTextRange!)), ['  return funcWithPromise ().\n  then(', ').catch (', ');']);
        const callbacks = actual.parts.filter((part): part is Outline.Symbol => part instanceof Outline.Symbol);
        assert.deepStrictEqual(callbacks.map(callback => doc.getText(callback.displayTextRange!)), ['symbols =>', 'err =>']);
        assert.deepStrictEqual(callbacks.map(callback => callback.parts.map(part => doc.getText(part.displayTextRange!)).join('')),
          ['    return symbols;', '    return err;']);
      }
      assert.strictEqual(actual.parts.map(part => doc.getText(
        part instanceof Outline.Symbol ? part.totalRange! : part.displayTextRange!)).join(''), doc.getText(bodyRange),
      'parts reconstruct the exact body source');
      assert.deepStrictEqual(symbol.children, [catchCallback, thenCallback], 'provider child order remains unchanged');
      assert.strictEqual(catchCallback.range, catchRange);
      assert.strictEqual(thenCallback.range, thenRange);
    });
  }


  test('08 constructor (total range = selection range)', async () =>
  {
    // setup
    let content = ""
    + "constructor (){\n"
    + "  this.lspExtender = lspExtender;\n"
    + "}\n"

    let doc = await createMemDocument (content);

    let full_range = utils.range_new (0, 0, 2, 1);
    let name_range = utils.range_new (0, 0, 2, 1);
    let symbol = new vscode.DocumentSymbol ("constructor", "",
                                            vscode.SymbolKind.Function,
                                            full_range,
                                            name_range);

    // run
    let subject = new VpLspExtenderCurlyBraces ("typescript");
    let actual = subject.getLanguageSpecificSymbolInformation (doc, symbol);

    // check
    let actual_rangeHead  = actual.rangeHead;
    let actual_rangeBody  = actual.rangeBody;

    assertx.range_equals (actual_rangeHead,
                          utils.range_new (0,0,0,14),
                          "name range");
    assertx.range_equals (actual_rangeBody,
                          utils.range_new (1,0,1,33),
                          "text range");
  });






  test('08 Case: outline information not in order', async () =>
  {
    // setup
    let content = ""
        + "class AAA\n"
        + "{\n"
        + "  public bb()\n"
        + "  {\n"
        + "    return 5;\n"
        + "  }\n"
        + "\n"
        + "  public aa()\n"
        + "  {\n"
        + "    return 6;\n"
        + "  }\n"
        + "}\n"

    let doc = await createMemDocument (content);

    let symbol = new vscode.DocumentSymbol ("AAA", "",
                                            vscode.SymbolKind.Class,
                                            utils.range_new (0, 0, 11, 1),
                                            utils.range_new (0, 6, 0, 9));
    // child 0 is the one, that's actually later within the code
    let child0 = new vscode.DocumentSymbol ("aa", "",
                                            vscode.SymbolKind.Method,
                                            utils.range_new (7, 2, 10, 3),
                                            utils.range_new (7, 9, 7, 11));
    let child1 = new vscode.DocumentSymbol ("bb", "",
                                            vscode.SymbolKind.Method,
                                            utils.range_new (2, 2, 5, 3),
                                            utils.range_new (2, 9, 2, 11));
    symbol.children.push (child0);
    symbol.children.push (child1);

    // run
    let subject = OutlineUtils;
    let actual = subject.documentSymbol2outlineSymbol (doc,
                                new DocumentSymbolX (symbol, doc.uri),
                                new VpLspExtenderCurlyBraces ("typescript"));

    // check
    let actual_parts = actual.parts;

    assert.deepStrictEqual(actual_parts.map(part => doc.getText(part.displayTextRange!).trim()), ["bb()", "aa()"]);
    assert.deepStrictEqual(actual_parts.map(part => doc.getText(part.parts[0].displayTextRange!).trim()),
      ["return 5;", "return 6;"]);
    assert.deepStrictEqual(symbol.children, [child0, child1], "provider order stays unchanged");


  });



  test('08 Case: In class: method declaration', async () =>
  {
    // setup
    let content = ""
        + "class MyClass\n"
        + "{\n"
        + "  public:\n"
        + "     aa();\n"
        + "}\n"

    let doc = await createMemDocument (content, "cpp");

    let symbol = new vscode.DocumentSymbol ("AAA", "",
                                            vscode.SymbolKind.Class,
                                            utils.range_new (0, 0, 4, 1),
                                            utils.range_new (0, 6, 0, 13));
    let child0 = new vscode.DocumentSymbol ("aa", "",
                                            vscode.SymbolKind.Method,
                                            utils.range_new (3, 5, 3, 10),
                                            utils.range_new (3, 5, 3, 7));
    child0.detail = "declaration";
    symbol.children.push (child0);

    // run
    let subject = OutlineUtils;
    let actual = subject.documentSymbol2outlineSymbol (doc,
                                new DocumentSymbolX (symbol, doc.uri),
                                new VpLspExtenderCurlyBraces ("cpp"));

    // check
    let actual_parts = actual.parts;
    assertx.range_equals (actual_parts[1].displayTextRange,
                          utils.range_new (3, 5, 3, 9), "displayTextRange of aa()");

  });


  test('08 Case: In class: interface method declaration', async () =>
  {
    // setup
    let content = ""
        + "class MyClass\n"
        + "{\n"
        + "  public:\n"
        + "     virtual aa() = 0;\n"
        + "}\n"

    let doc = await createMemDocument (content, "cpp");

    let symbol = new vscode.DocumentSymbol ("AAA", "",
                                            vscode.SymbolKind.Class,
                                            utils.range_new (0, 0, 4, 1),
                                            utils.range_new (0, 6, 0, 13));
    let child0 = new vscode.DocumentSymbol ("aa", "",
                                            vscode.SymbolKind.Method,
                                            utils.range_new (3, 5, 3, 22),
                                            utils.range_new (3, 13, 3, 15));
    child0.detail = "declaration";
    symbol.children.push (child0);

    // run
    let subject = OutlineUtils;
    let actual = subject.documentSymbol2outlineSymbol (doc,
                                new DocumentSymbolX (symbol, doc.uri),
                                new VpLspExtenderCurlyBraces ("cpp"));

    // check
    let actual_parts = actual.parts;
    assertx.range_equals (actual_parts[1].displayTextRange,
                          utils.range_new (3, 13, 3, 21), "displayTextRange of aa()");

  });

});