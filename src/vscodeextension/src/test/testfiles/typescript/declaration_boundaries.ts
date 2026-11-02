// Manual declaration-boundary fixture: analyze in VS Code; do not execute.
// Keep declarations module-scoped alongside the other compiled fixture files.
export {};

const limit = 42;

console.log("AFTER limit");

const config = { value: 42 };

console.log("AFTER config");

interface Reader {
  read(): void;
}

console.log("AFTER Reader");

abstract class Base {
  abstract run(): string;
}

console.log("AFTER Base");

class Worker implements Reader {
  read(): void { console.log("implemented"); }
  empty(): void {}
}

console.log("AFTER Worker");

function later() {
  return 7;
}

console.log("AFTER later");
