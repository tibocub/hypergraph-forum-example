#!/bin/sh
# Installs or updates the forum (macOS, Linux), then starts it.
#   curl -fsSL https://raw.githubusercontent.com/tibocub/hypergraph-forum-example/main/install.sh | sh
# Your data stays in ~/.hypergraph-forum: running this again only updates the program.
set -e

HYPERGRAPH_REF=afae42b9a52ebd6333fffc20355571ebf1ac1ec5 # the hypergraph commit every member runs
FORUM_REF=origin/main
APP="$HOME/hypergraph-forum-app"

command -v git >/dev/null 2>&1 || { echo "Install git first: https://git-scm.com"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Install Node.js 20 or newer first: https://nodejs.org"; exit 1; }
node -e 'process.exit(+process.versions.node.split(".")[0] >= 20 ? 0 : 1)' || { echo "Node.js 20 or newer is needed: https://nodejs.org"; exit 1; }

# get <repo url> <folder> <ref>: clone or fetch, then that exact commit.
get () {
  if [ -d "$APP/$2/.git" ]; then git -C "$APP/$2" fetch --quiet origin; else git clone --quiet "$1" "$APP/$2"; fi
  git -C "$APP/$2" checkout --quiet --detach "$3"
}

mkdir -p "$APP"
echo "Downloading…"
get https://github.com/tibocub/hypergraph.git hypergraph "$HYPERGRAPH_REF"
get https://github.com/tibocub/hypergraph-forum-example.git hypergraph-forum-example "$FORUM_REF"
echo "Installing…"
(cd "$APP/hypergraph" && npm install --no-audit --no-fund --loglevel=error)
(cd "$APP/hypergraph-forum-example" && npm install --no-audit --no-fund --loglevel=error)

echo "Done. To start the forum later: cd \"$APP/hypergraph-forum-example\" && npm start"
cd "$APP/hypergraph-forum-example" && exec npm start
