# Copyright 2026 Ronny Trommer <ronny@no42.org>
# SPDX-License-Identifier: GPL-3.0-only
#
# spieli OSM importer — the project's importer/import.sh wrapped with its
# runtime tools on PATH and pointed at the in-tree importer/api.sql.
#
# import.sh is reused verbatim (it reads DATA_DIR / API_SQL from the
# environment, defaulting to the container paths /data and /api.sql). This
# wrapper sets API_SQL to the nix-store api.sql; DATA_DIR is left to the
# systemd unit (a StateDirectory).
{ lib, stdenvNoCC, makeWrapper
, osm2pgsql, osmium-tool, jq, curl, wget, postgresql, gettext
, coreutils, gawk, gnused }:

stdenvNoCC.mkDerivation {
  pname = "spieli-importer";
  version = (lib.importJSON ../app/package.json).version;

  # importer/ holds both import.sh and api.sql.
  src = ../importer;

  nativeBuildInputs = [ makeWrapper ];
  dontBuild = true;

  installPhase = ''
    runHook preInstall

    mkdir -p $out/bin $out/share/spieli
    cp $src/api.sql $out/share/spieli/api.sql
    install -m0555 $src/import.sh $out/share/spieli/import.sh

    # postgresql → psql + pg_isready; gettext → envsubst.
    makeWrapper $out/share/spieli/import.sh $out/bin/spieli-import \
      --prefix PATH : ${lib.makeBinPath [
        osm2pgsql osmium-tool jq curl wget postgresql gettext
        coreutils gawk gnused
      ]} \
      --set-default API_SQL $out/share/spieli/api.sql

    runHook postInstall
  '';

  passthru.apiSql = "share/spieli/api.sql";

  meta = {
    description = "spieli OSM importer (import.sh) bundled with its runtime tools";
    homepage = "https://github.com/mfuhrmann/spieli";
    license = lib.licenses.gpl3Only;
  };
}
