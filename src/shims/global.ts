// Browser shim for libs that expect Node's `global`
const g: any = globalThis as any;
g.global ??= g;