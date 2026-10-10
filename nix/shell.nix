{
  mkShellNoCC,
  nodejs,
  pnpm_12,
  eslint_d,
  prettierd,
}:
mkShellNoCC {
  name = "manic-web";

  strictDeps = true;
  nativeBuildInputs = [
    nodejs
    pnpm_12

    eslint_d
    prettierd
  ];
}
