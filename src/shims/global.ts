export {}; // make this file a module for --isolatedModules

const g: any = globalThis as any;
g.global ??= g;