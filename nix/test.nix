# Copyright 2026 Ronny Trommer <ronny@no42.org>
# SPDX-License-Identifier: GPL-3.0-only
#
# nixosTest — the anti-drift tripwire for the native module (design D8).
# Boots the spieli module, loads the 4-playground seed fixture, and asserts the
# API and frontend respond. Wired into the flake's `checks`, so `nix flake
# check` runs it.
#
# STATUS: authored without a nix toolchain; not yet executed. The frontend
# package still carries a `lib.fakeHash` npmDepsHash, so this test cannot pass
# until the real hash is filled in (see nix/frontend.nix).
{ pkgs }:

pkgs.testers.runNixOSTest {
  name = "spieli-standalone";

  nodes.machine = { ... }: {
    imports = [ ./module.nix ];

    services.spieli = {
      enable = true;
      serverName = "localhost";
      osmRelationId = 62700; # Hessen — matches the seed fixture
    };

    # The VM needs a little headroom for postgres + the build closure.
    virtualisation.memorySize = 2048;
    virtualisation.diskSize = 4096;
  };

  testScript = ''
    machine.start()

    # Core services come up.
    machine.wait_for_unit("postgresql.service")
    machine.wait_for_unit("spieli-db-init.service")
    machine.wait_for_unit("postgrest.service")
    machine.wait_for_unit("nginx.service")

    # Load the 4-playground seed fixture as the app role (peer auth over socket).
    # seed.sql is self-contained: extensions, api schema/functions, matview, data.
    machine.succeed(
        "sudo -u spieli psql -d spieli -v ON_ERROR_STOP=1 -f ${../dev/seed/seed.sql}"
    )
    machine.succeed("sudo -u spieli psql -d spieli -c \"NOTIFY pgrst, 'reload schema';\"")
    machine.wait_for_open_port(3000)

    # API responds with JSON through the nginx /api/ proxy.
    machine.wait_for_open_port(80)
    meta = machine.succeed("curl -fsS http://localhost/api/rpc/get_meta")
    assert '"playground_count"' in meta or '"relation_id"' in meta, \
        f"get_meta missing expected fields: {meta}"

    # Frontend shell + runtime config.js are served.
    machine.succeed("curl -fsS http://localhost/ | grep -q '<div id=\"app\"'")
    config_js = machine.succeed("curl -fsS http://localhost/config.js")
    assert "APP_CONFIG" in config_js, f"config.js not generated: {config_js}"
  '';
}
