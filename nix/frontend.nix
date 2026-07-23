# Copyright 2026 Ronny Trommer <ronny@no42.org>
# SPDX-License-Identifier: GPL-3.0-only
#
# spieli Svelte frontend → static dist/ bundle.
#
# Locale layout constraint: app/src/lib/i18n.js imports locale JSON via
# `../../../locales/de.json`, which Vite resolves at build time relative to the
# file — landing on a SIBLING of the npm package root. The build src must
# therefore contain both app/ and locales/ as siblings, with the package root
# (sourceRoot) at app/. The Docker image reproduces this by unpacking app at
# /build and copying locales to /locales; that absolute /locales path is not
# reproducible in the Nix sandbox, so here we keep the relative sibling layout.
{ lib, buildNpmPackage, nodejs_20 }:

buildNpmPackage {
  pname = "spieli-frontend";
  version = (lib.importJSON ../app/package.json).version;

  # app/ and locales/ as siblings. lib.fileset.toSource always names the
  # unpacked root "source", so the package root is source/app and the locale
  # import `../../../locales` resolves to source/locales.
  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [ ../app ../locales ];
  };
  sourceRoot = "source/app";

  nodejs = nodejs_20; # parity with the Docker builder (node:20-alpine)

  # Bootstrap placeholder. The first `nix build` on a nix-capable host (or CI)
  # fails and prints the real SRI hash — paste it here. Regenerate whenever
  # app/package-lock.json changes (e.g. a Dependabot bump): a stale hash fails
  # the build loudly, and `nix flake check` catches it.
  npmDepsHash = lib.fakeHash;

  # `npm run build` (vite build) emits app/dist; we only want the static output,
  # not an installed npm package.
  npmBuildScript = "build";
  dontNpmInstall = true;

  installPhase = ''
    runHook preInstall
    cp -r dist "$out"
    runHook postInstall
  '';

  meta = {
    description = "spieli playground map — static Svelte/Vite frontend bundle";
    homepage = "https://github.com/mfuhrmann/spieli";
    license = lib.licenses.gpl3Only;
  };
}
