// PreToolUse hook: run Vitest with the dot reporter so passing tests print one
// character each and only failures come back in full. Leaves compound commands
// and commands that already pick a reporter untouched.
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const cmd = input.tool_input?.command ?? '';

const simple = !/[|;&<>`$]/.test(cmd);
const npx = /^npx vitest run(\s|$)/.test(cmd);
const npm = /^npm (run test:ci|test)(\s|$)/.test(cmd);

if (!simple || cmd.includes('--reporter') || !(npx || npm)) {
  process.stdout.write('{}');
} else {
  const extra = npx || cmd.includes(' -- ') ? ' --reporter=dot' : ' -- --reporter=dot';
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: { ...input.tool_input, command: cmd + extra },
      },
    }),
  );
}
