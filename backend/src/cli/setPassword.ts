import { Role } from '@prisma/client';
import { parseArgs } from 'node:util';
import { prisma } from '../db';
import { PasswordSetupError, setUserPassword } from '../lib/userPassword';

// Задати пароль для входу без Microsoft:
//   npm run set-password -- student@lnu.edu.ua [--role HEADMAN] [--name "Іваненко Іван"]
// Пароль не передається аргументом (лишився б в історії оболонки): вводиться з клавіатури без відображення
// або читається зі стандартного вводу (printf '%s' "$NEW_PASSWORD" | npm run set-password -- ...).
const USAGE = 'Використання: npm run set-password -- <пошта> [--role STUDENT|HEADMAN|ADMIN] [--name "Імʼя"]';

async function readPassword(): Promise<string> {
  const { stdin, stderr } = process;
  stdin.setEncoding('utf8');
  if (!stdin.isTTY) {
    let data = '';
    for await (const chunk of stdin) data += chunk;
    return data.replace(/\r?\n$/, '');
  }
  stderr.write('Новий пароль (не відображається): ');
  stdin.setRawMode(true);
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stderr.write('\n');
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          finish();
          return resolve(value);
        }
        if (ch === '\u0003') {
          finish();
          return reject(new PasswordSetupError('Скасовано'));
        }
        value = ch === '\u007f' || ch === '\b' ? value.slice(0, -1) : value + ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { role: { type: 'string' }, name: { type: 'string' } },
  });
  const [email] = positionals;
  const { role, name } = values;
  if (!email || (role !== undefined && !Object.values(Role).includes(role as Role))) throw new PasswordSetupError(USAGE);
  const user = await setUserPassword(prisma, { email, password: await readPassword(), role: role as Role | undefined, name });
  console.log(`Пароль задано: ${user.email}, роль ${user.role}`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof PasswordSetupError ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
