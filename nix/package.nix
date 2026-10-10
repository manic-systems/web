{
  lib,
  stdenvNoCC,
  nodejs,
  pnpm_12,
  pnpmConfigHook,
  fetchPnpmDeps,
}: let
  pnpm' = pnpm_12;
in
  stdenvNoCC.mkDerivation (finalAttrs: {
    pname = "manic-systems-web";
    version = "0.1.0";

    src = let
      fs = lib.fileset;
      sp = ../.;
    in
      fs.toSource {
        root = sp;

        # Filter everything outside of what's specified here. Configuration files
        # are good to include, but linter/formatter configs are not necessary.
        fileset = fs.unions [
          (sp + /src)
          (sp + /public)

          (sp + /package.json)
          (sp + /pnpm-lock.yaml)
          (sp + /pnpm-workspace.yaml)
          (sp + /astro.config.ts)
          (sp + /tsconfig.json)
        ];
      };

    nativeBuildInputs = [
      nodejs
      pnpm'
      pnpmConfigHook
    ];

    pnpmInstallFlags = ["--prod"];
    pnpmDeps = fetchPnpmDeps {
      pnpm = pnpm';
      inherit (finalAttrs) pname version src pnpmInstallFlags;
      fetcherVersion = 4; # https://nixos.org/manual/nixpkgs/stable/#javascript-pnpm-fetcherVersion
      hash = "sha256-yIVvzVqiSMkfTU2lO5BLR0OkY5uD1X+AMGIcz5x09YQ=";
    };

    # Doesn't do anything in the sandbox anyway, but we want it *gone*.
    env.ASTRO_TELEMETRY_DISABLED = true;

    buildPhase = ''
      runHook preBuild

      pnpm build

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      mkdir -p $out/share/web
      cp -r dist/ $out/share/web

      runHook postInstall
    '';

    meta = {
      homepage = "https://github.com/manic-systems/web";
      maintainers = [lib.maintainers.NotAShelf];
      platforms = lib.platforms.linux ++ lib.platforms.darwin;
      license = lib.licenses.eupl12;
    };
  })
