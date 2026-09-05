/* Tiny console logger with the symbols the reset script and seed output use. */
const ts = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (...a: unknown[]) => console.log(`  ${ts()}`, ...a),
  step: (n: number | string, msg: string) => console.log(`\n[${n}] ${msg}`),
  ok: (...a: unknown[]) => console.log(`  ✓`, ...a),
  warn: (...a: unknown[]) => console.warn(`  !`, ...a),
  error: (...a: unknown[]) => console.error(`  ✗`, ...a),
  banner: (msg: string) => console.log(`\n${'='.repeat(72)}\n${msg}\n${'='.repeat(72)}`),
  rule: () => console.log('-'.repeat(72)),
};
