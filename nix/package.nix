{
  lib,
  stdenvNoCC,
  nodejs,
  pnpm,
  pnpmConfigHook,
  fetchPnpmDeps,
}:
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
      fileset = fs.intersection (fs.fromSource (lib.sources.cleanSource sp)) (
        fs.unions [
          ../src
          ../public
          ../astro.config.ts

          ../package.json
          ../tsconfig.json
          ../pnpm-lock.yaml
          ../pnpm-workspace.yaml
        ]
      );
    };

  nativeBuildInputs = [
    nodejs
    pnpm
    pnpmConfigHook
  ];

  pnpmInstallFlags = ["--prod"];
  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src pnpmInstallFlags;
    fetcherVersion = 4;
    # Run `nix build` once after `pnpm install` to get the correct hash.
    hash = "sha256-bO/QLNoyQt7+0BZGjuCRZa5DvdnKpq3a8Spov5W6fGk=";
  };

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
})
