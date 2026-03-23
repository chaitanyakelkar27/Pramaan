const fs = require("fs");
const path = require("path");

const FALLBACK_ROUTES_MANIFEST = {
  version: 3,
  pages404: true,
  caseSensitive: false,
  basePath: "",
  redirects: [],
  headers: [],
  dynamicRoutes: [],
  staticRoutes: [],
  dataRoutes: [],
  i18n: null
};

function ensureFile(src, dst) {
  if (!fs.existsSync(src)) {
    return false;
  }

  const dstDir = path.dirname(dst);
  fs.mkdirSync(dstDir, { recursive: true });

  if (!fs.existsSync(dst)) {
    fs.copyFileSync(src, dst);
    console.log("created", dst);
  }

  return true;
}

function ensureJsonFile(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
    console.log("created fallback", filePath);
  }
}

function ensureManifestsInDir(dirPath, preferredSource) {
  const routesPath = path.join(dirPath, "routes-manifest.json");
  const deterministicPath = path.join(dirPath, "routes-manifest-deterministic.json");

  if (!fs.existsSync(routesPath)) {
    if (preferredSource && fs.existsSync(preferredSource)) {
      ensureFile(preferredSource, routesPath);
    } else {
      ensureJsonFile(routesPath, FALLBACK_ROUTES_MANIFEST);
    }
  }

  if (!fs.existsSync(deterministicPath)) {
    if (!ensureFile(routesPath, deterministicPath)) {
      ensureJsonFile(deterministicPath, FALLBACK_ROUTES_MANIFEST);
    }
  }
}

function copyIfExists(src, dst) {
  if (!fs.existsSync(src)) {
    return;
  }

  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log("mirrored", src, "->", dst);
}

function mirrorFullNextDirToParent(localNextDir, parentNextDir) {
  if (!fs.existsSync(localNextDir)) {
    return;
  }

  fs.mkdirSync(parentNextDir, { recursive: true });

  // Mirror all build artifacts that Vercel may resolve from /vercel/path0/.next.
  // Skip cache-only folders to keep copy lightweight.
  const entries = fs.readdirSync(localNextDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "cache") {
      continue;
    }

    const srcPath = path.join(localNextDir, entry.name);
    const dstPath = path.join(parentNextDir, entry.name);

    fs.cpSync(srcPath, dstPath, { recursive: true, force: true });
    console.log("mirrored", srcPath, "->", dstPath);
  }
}

function main() {
  const cwd = process.cwd();
  const localNextDir = path.join(cwd, ".next");
  const localRoutes = path.join(localNextDir, "routes-manifest.json");
  ensureManifestsInDir(localNextDir, localRoutes);

  // Vercel can resolve some manifests from /vercel/path0/.next even when
  // the app is in a subdirectory. Mirror the core manifests only on Vercel.
  if (process.env.VERCEL === "1") {
    const parentNextDir = path.resolve(cwd, "..", ".next");
    mirrorFullNextDirToParent(localNextDir, parentNextDir);
    ensureManifestsInDir(parentNextDir, path.join(parentNextDir, "routes-manifest.json"));
  }
}

main();
