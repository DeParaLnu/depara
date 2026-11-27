import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'coverage', 'prisma/migrations'] },
  ...tseslint.configs.recommended,
);
