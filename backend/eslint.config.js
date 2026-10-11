import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'prisma/migrations'] },
  ...tseslint.configs.recommended,
);
