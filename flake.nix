{
  description = "protokol-7 — Standalone Headless Web Scraping & Browser Automation Service";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          name = "protokol-7-devshell";

          packages = with pkgs; [
            nodejs_22
            pnpm
            git
            chromium
          ];

          shellHook = ''
            export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="${pkgs.chromium}/bin/chromium"
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
            echo "[protokol-7] NixOS DevShell Active (Node: $(node --version) | NPM: $(npm --version))"
          '';
        };
      });
}
