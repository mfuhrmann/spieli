# Copyright 2026 Ronny Trommer <ronny@no42.org>
# SPDX-License-Identifier: GPL-3.0-only
#
# NixOS module: run a standalone spieli data node as native systemd services —
# PostgreSQL+PostGIS, PostgREST, nginx, and a timer-driven importer. No
# container runtime. Scope: standalone mode only (hub federation is a follow-up).
#
# STATUS: authored without a nix toolchain available; not yet built or run.
# Validate on a NixOS host via the flake's `checks.<system>.vm-test`
# (nix/test.nix) before relying on it. Risk areas are flagged inline with
# `# VALIDATE:`.
{ config, lib, pkgs, ... }:

let
  cfg = config.services.spieli;

  frontend = cfg.package;
  importer = pkgs.callPackage ./importer.nix { };

  # Runtime-generated config.js + legal HTML live here (writable; the frontend
  # bundle in /nix/store is read-only). nginx serves /config.js and /legal/*
  # from this dir, everything else from the bundle.
  runtimeDir = "/run/spieli";

  genRuntime = ../oci/app/gen-runtime.sh;
  datenschutzTemplate = ../oci/app/datenschutz.template.html;

  # Environment shared by the importer units. Peer auth over the unix socket —
  # POSTGRES_USER matches the system user, so no password is needed.
  importerEnv = {
    DATA_DIR = "${cfg.stateDir}/pbf";
    POSTGRES_HOST = "/run/postgresql";
    POSTGRES_PORT = "5432";
    POSTGRES_DB = cfg.database.name;
    POSTGRES_USER = cfg.user;
    OSM_RELATION_ID = toString cfg.osmRelationId;
    PBF_URL = cfg.pbfUrl;
    SPIELI_VERSION = cfg.version;
  } // lib.optionalAttrs (cfg.osmBbox != null) { OSM_BBOX = cfg.osmBbox; }
    // lib.optionalAttrs (cfg.impressum.name != null) { IMPRESSUM_NAME = cfg.impressum.name; }
    // lib.optionalAttrs (cfg.impressum.address != null) { IMPRESSUM_ADDRESS = cfg.impressum.address; }
    // lib.optionalAttrs (cfg.impressum.email != null) { IMPRESSUM_EMAIL = cfg.impressum.email; };

  # Security headers applied at the server level AND repeated in every location
  # that sets its own `add_header` — nginx only inherits add_header from an outer
  # level when the current level defines none, so each overriding location must
  # restate them or it would serve responses (e.g. the legal HTML pages) without
  # CSP/nosniff.
  securityHeaders = ''
    add_header X-Content-Type-Options    "nosniff"                          always;
    add_header Referrer-Policy           "strict-origin-when-cross-origin"  always;
    add_header Permissions-Policy        "geolocation=(self)"               always;
    add_header Content-Security-Policy    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src https://panoramax.xyz https://api.panoramax.xyz; connect-src 'self' https:; font-src 'self'; frame-ancestors 'self' https:" always;
  '';

  # PostgREST config — connect over the postgres socket as the peer-authed
  # system user; expose the `api` schema with `web_anon` as the anon role.
  postgrestConf = pkgs.writeText "postgrest.conf" ''
    db-uri = "postgres://@/${cfg.database.name}?host=/run/postgresql"
    db-schema = "api"
    db-anon-role = "web_anon"
    db-channel-enabled = true
    server-host = "127.0.0.1"
    server-port = ${toString cfg.postgrestPort}
    log-level = "warn"
  '';
in
{
  options.services.spieli = {
    enable = lib.mkEnableOption "spieli standalone playground-map data node";

    package = lib.mkOption {
      type = lib.types.package;
      default = pkgs.callPackage ./frontend.nix { };
      defaultText = lib.literalExpression "pkgs.callPackage ./frontend.nix { }";
      description = "The built spieli frontend (static bundle).";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "spieli";
      description = "System user the spieli services run as. Must match a peer-authenticated PostgreSQL role.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "spieli";
      description = "Primary group for the spieli user.";
    };

    stateDir = lib.mkOption {
      type = lib.types.path;
      default = "/var/lib/spieli";
      description = "State directory (PBF cache + intermediate filtered PBFs).";
    };

    serverName = lib.mkOption {
      type = lib.types.str;
      example = "playgrounds.example.org";
      description = "nginx virtual host server name.";
    };

    osmRelationId = lib.mkOption {
      type = lib.types.ints.positive;
      example = 454863;
      description = "OSM relation ID of the target region (Nominatim bbox lookup + frontend fit).";
    };

    pbfUrl = lib.mkOption {
      type = lib.types.str;
      default = "https://download.geofabrik.de/europe/germany/hessen-latest.osm.pbf";
      description = "Geofabrik .osm.pbf download URL the importer fetches.";
    };

    osmBbox = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      example = "9.0,50.4,10.0,50.8";
      description = "Optional bbox override (west,south,east,north); skips the Nominatim lookup.";
    };

    version = lib.mkOption {
      type = lib.types.str;
      default = (lib.importJSON ../app/package.json).version;
      defaultText = lib.literalExpression "the app/package.json version";
      description = "Value surfaced through get_meta().version (SPIELI_VERSION).";
    };

    postgrestPort = lib.mkOption {
      type = lib.types.port;
      default = 3000;
      description = "Loopback port PostgREST listens on (nginx proxies /api/ to it).";
    };

    database.name = lib.mkOption {
      type = lib.types.str;
      default = "spieli";
      description = "PostgreSQL database name. osm2pgsql imports into it; PostgREST reads the api schema from it.";
    };

    impressum = {
      name = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; description = "Operator name for the generated Impressum / legal_content."; };
      address = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; description = "Operator postal address."; };
      email = lib.mkOption { type = lib.types.nullOr lib.types.str; default = null; description = "Operator contact email."; };
    };

    importTimer = lib.mkOption {
      type = lib.types.str;
      default = "weekly";
      description = "systemd OnCalendar expression for the recurring OSM re-import.";
    };
  };

  config = lib.mkIf cfg.enable {

    users.users.${cfg.user} = {
      isSystemUser = true;
      group = cfg.group;
      home = cfg.stateDir;
      createHome = true;
    };
    users.groups.${cfg.group} = { };

    # PBF cache + intermediate filtered PBFs. Derived from cfg.stateDir so an
    # overridden stateDir stays consistent with the importer's DATA_DIR (a
    # systemd StateDirectory= is always relative to /var/lib and would diverge).
    systemd.tmpfiles.rules = [
      "d ${cfg.stateDir}/pbf 0750 ${cfg.user} ${cfg.group} -"
    ];

    # ── PostgreSQL + PostGIS ───────────────────────────────────────────────────
    services.postgresql = {
      enable = true;
      # VALIDATE: option name for extensions varies by nixpkgs version
      # (`extensions` vs `extraPlugins`). Adjust to the channel in use.
      extensions = ps: [ ps.postgis ];
      ensureDatabases = [ cfg.database.name ];
      ensureUsers = [{
        name = cfg.user;
        ensureDBOwnership = true;
      }];
    };

    # ── DB bootstrap: apply db/init.sql verbatim, then grant web_anon to the
    # PostgREST login role. init.sql's `GRANT web_anon TO current_user` runs as
    # the postgres superuser here (current_user = postgres), so the app role
    # needs the grant explicitly. ──────────────────────────────────────────────
    systemd.services.spieli-db-init = {
      description = "spieli database bootstrap (extensions, api schema, web_anon)";
      after = [ "postgresql.service" ];
      requires = [ "postgresql.service" ];
      wantedBy = [ "multi-user.target" ];
      before = [ "postgrest.service" ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        User = "postgres";
      };
      script = ''
        ${pkgs.postgresql}/bin/psql -d ${cfg.database.name} -v ON_ERROR_STOP=1 -f ${../db/init.sql}
        ${pkgs.postgresql}/bin/psql -d ${cfg.database.name} -v ON_ERROR_STOP=1 \
          -c 'GRANT web_anon TO "${cfg.user}";'
      '';
    };

    # ── PostgREST ───────────────────────────────────────────────────────────────
    systemd.services.postgrest = {
      description = "spieli PostgREST API";
      after = [ "spieli-db-init.service" ];
      requires = [ "spieli-db-init.service" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        ExecStart = "${pkgs.postgrest}/bin/postgrest ${postgrestConf}";
        User = cfg.user;
        Group = cfg.group;
        Restart = "on-failure";
      };
    };

    # ── Importer: one-shot full pipeline, driven by a timer ─────────────────────
    # The daemon loop in import.sh is intentionally NOT used — systemd owns
    # scheduling (OnCalendar + Persistent + RandomizedDelaySec).
    systemd.services.spieli-import = {
      description = "spieli OSM data import (one-shot)";
      after = [ "postgresql.service" "spieli-db-init.service" "network-online.target" ];
      wants = [ "network-online.target" ];
      requires = [ "postgresql.service" "spieli-db-init.service" ];
      environment = importerEnv;
      serviceConfig = {
        Type = "oneshot";
        User = cfg.user;
        Group = cfg.group;
        ExecStart = "${importer}/bin/spieli-import";
        TimeoutStartSec = "6h";
      };
    };

    systemd.timers.spieli-import = {
      description = "spieli weekly OSM re-import";
      wantedBy = [ "timers.target" ];
      timerConfig = {
        OnCalendar = cfg.importTimer;
        Persistent = true; # catch up a run missed while the host was off
        RandomizedDelaySec = "1h"; # anti-herd; replaces import.sh's jitter logic
        Unit = "spieli-import.service";
      };
    };

    # ── Schema-only apply (API_ONLY) — for upgrades after the first import ───────
    # VALIDATE: api.sql builds the playground_stats matview from planet_osm_*,
    # which only exist after at least one osm2pgsql import. Hence this is a
    # manual/upgrade unit (not wantedBy multi-user) — run it after the first
    # `systemctl start spieli-import`, mirroring upgrade-stacks.sh's API_ONLY step.
    systemd.services.spieli-schema = {
      description = "spieli API schema re-apply (API_ONLY)";
      after = [ "postgresql.service" "spieli-db-init.service" ];
      requires = [ "postgresql.service" "spieli-db-init.service" ];
      environment = importerEnv // { API_ONLY = "1"; };
      serviceConfig = {
        Type = "oneshot";
        User = cfg.user;
        Group = cfg.group;
        ExecStart = "${importer}/bin/spieli-import";
      };
    };

    # ── Runtime config (config.js + legal pages) via the shared generator ───────
    systemd.services.spieli-config = {
      description = "spieli runtime config.js + legal pages";
      before = [ "nginx.service" ];
      wantedBy = [ "multi-user.target" ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        RuntimeDirectory = "spieli";
        RuntimeDirectoryPreserve = true;
      };
      environment = {
        APP_MODE = "standalone";
        WEBROOT = runtimeDir;
        DATENSCHUTZ_TEMPLATE = "${datenschutzTemplate}";
        OSM_RELATION_ID = toString cfg.osmRelationId;
        API_BASE_URL = "/api"; # nginx proxies /api/ → local PostgREST (empty would fall back to Overpass)
      } // lib.optionalAttrs (cfg.impressum.name != null) { IMPRESSUM_NAME = cfg.impressum.name; }
        // lib.optionalAttrs (cfg.impressum.address != null) { IMPRESSUM_ADDRESS = cfg.impressum.address; }
        // lib.optionalAttrs (cfg.impressum.email != null) { IMPRESSUM_EMAIL = cfg.impressum.email; };
      path = [ pkgs.coreutils pkgs.gnused pkgs.gawk ];
      script = "${pkgs.runtimeShell} ${genRuntime}";
    };

    # ── nginx ───────────────────────────────────────────────────────────────────
    services.nginx = {
      enable = true;
      recommendedProxySettings = true;
      virtualHosts.${cfg.serverName} = {
        root = frontend;
        extraConfig = securityHeaders;
        locations = {
          # Runtime-generated config.js — no caching, served from the writable dir.
          "= /config.js" = {
            root = runtimeDir;
            extraConfig = ''
              ${securityHeaders}
              add_header Cache-Control "no-store";
            '';
          };

          # /api/ → local PostgREST (trailing slash on proxyPass strips the prefix).
          "/api/" = {
            proxyPass = "http://127.0.0.1:${toString cfg.postgrestPort}/";
            extraConfig = ''
              ${securityHeaders}
              proxy_hide_header Access-Control-Allow-Origin;
              add_header Access-Control-Allow-Origin  "*"             always;
              add_header Access-Control-Allow-Methods "GET, OPTIONS"  always;
              add_header Access-Control-Allow-Headers "Accept, Content-Type" always;
              if ($request_method = OPTIONS) { return 204; }
            '';
          };

          # Legal pages generated at runtime.
          "= /legal/impressum" = {
            alias = "${runtimeDir}/impressum.html";
            extraConfig = ''
              ${securityHeaders}
              default_type "text/html; charset=utf-8";
              add_header Cache-Control "no-store";
            '';
          };
          "= /legal/datenschutz" = {
            alias = "${runtimeDir}/datenschutz.html";
            extraConfig = ''
              ${securityHeaders}
              default_type "text/html; charset=utf-8";
              add_header Cache-Control "no-store";
            '';
          };

          # Immutable hashed assets.
          "~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$" = {
            extraConfig = ''
              ${securityHeaders}
              expires 1y;
              add_header Cache-Control "public, immutable";
            '';
          };

          # SPA fallback.
          "/" = {
            tryFiles = "$uri $uri/ /index.html";
          };
        };
      };
    };
  };
}
