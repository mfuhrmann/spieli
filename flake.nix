{
  # Copyright 2026 Ronny Trommer <ronny@no42.org>
  # SPDX-License-Identifier: GPL-3.0-only
  #
  # Native NixOS packaging for spieli — a standalone playground-map data node
  # as first-class systemd services (no container runtime). See nix/ for the
  # derivations and docs/ops/nixos.md for usage.
  description = "spieli — interactive OpenStreetMap playground map (native NixOS deployment)";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      linuxSystems = [ "x86_64-linux" "aarch64-linux" ];
      forAll = list: f: nixpkgs.lib.genAttrs list (system: f system);
      pkgsFor = system: nixpkgs.legacyPackages.${system};
    in
    {
      # ── Packages ──────────────────────────────────────────────────────────────
      packages = forAll systems (system:
        let pkgs = pkgsFor system; in
        rec {
          frontend = pkgs.callPackage ./nix/frontend.nix { };
          importer = pkgs.callPackage ./nix/importer.nix { };
          default = frontend;
        });

      # ── NixOS module ──────────────────────────────────────────────────────────
      nixosModules.spieli = ./nix/module.nix;
      nixosModules.default = self.nixosModules.spieli;

      # ── Dev shell ─────────────────────────────────────────────────────────────
      devShells = forAll systems (system:
        let pkgs = pkgsFor system; in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              nodejs_20
              postgresql
              osm2pgsql
              osmium-tool
              jq
            ];
          };
        });

      # ── Checks (Linux only — nixosTest needs a Linux builder) ──────────────────
      checks = forAll linuxSystems (system:
        let pkgs = pkgsFor system; in
        {
          vm-test = import ./nix/test.nix { inherit pkgs; };
        });
    };
}
