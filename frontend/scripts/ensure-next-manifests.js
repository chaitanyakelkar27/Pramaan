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

function main() {
  const cwd = process.cwd();
  const localNextDir = path.join(cwd, ".next");
  const localRoutes = path.join(localNextDir, "routes-manifest.json");
  ensureManifestsInDir(localNextDir, localRoutes);

  // Vercel monorepo builds may package from the parent project root and look
  // for manifests under /vercel/path0/.next even when build runs in frontend/.
  const shouldMirrorToParent = process.env.VERCEL === "1" || process.env.CI === "true";
  if (!shouldMirrorToParent) {
    return;
  }

  const parentNextDir = path.resolve(cwd, "..", ".next");
  ensureManifestsInDir(parentNextDir, localRoutes);
}

main();
