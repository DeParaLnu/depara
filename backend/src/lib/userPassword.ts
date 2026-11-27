import type { PrismaClient, Role } from '@prisma/client';
import { config } from '../config';
import { isAllowedEmail } from './email';
import { hashPassword, isValidNewPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './password';

export class PasswordSetupError extends Error {}

export interface PasswordSetup {
  email: string;
  password: string;
  role?: Role;
  name?: string;
}

// Задає пароль акаунту, створюючи його за потреби. Самореєстрації немає: це робить оператор (src/cli/setPassword.ts).
// Вхід через Microsoft з тією самою поштою потрапить у цей же акаунт.
export async function setUserPassword(prisma: PrismaClient, input: PasswordSetup) {
  const email = input.email.trim().toLowerCase();
  if (!isAllowedEmail(email)) throw new PasswordSetupError(`Потрібна пошта @${config.allowedEmailDomain}`);
  if (!isValidNewPassword(input.password)) {
    throw new PasswordSetupError(`Пароль: від ${PASSWORD_MIN_LENGTH} до ${PASSWORD_MAX_LENGTH} символів`);
  }
  const data = {
    passwordHash: await hashPassword(input.password),
    ...(input.role ? { role: input.role } : {}),
    ...(input.name ? { fullName: input.name } : {}),
  };
  return prisma.user.upsert({
    where: { email },
    update: data,
    create: { email, fullName: email.split('@')[0], ...data },
    select: { id: true, email: true, role: true },
  });
}
