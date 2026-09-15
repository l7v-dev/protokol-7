{ pkgs, ... }:

{
  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    npm.enable = true;
    pnpm.enable = true;
  };

  packages = with pkgs; [
    git
    chromium
  ];

  env = {
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "${pkgs.chromium}/bin/chromium";
    PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
  };

  enterShell = ''
    echo "[protokol-7] devenv environment active (Node: $(node --version))"
  '';
}
