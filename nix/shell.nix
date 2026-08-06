{
  mkShellNoCC,
  nodejs,
  pnpm,
  eslint_d,
  prettierd,
}:
mkShellNoCC {
  name = "manic-web";

  strictDeps = true;
  nativeBuildInputs = [
    nodejs
    pnpm

    eslint_d
    prettierd
  ];
}
