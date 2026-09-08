import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const run = (cmd, args = []) =>
  execFileSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
const bump = process.argv[2];
if (!["patch", "minor", "major"].includes(bump)) {
  console.error("Usage: npm run publish-update -- patch|minor|major");
  process.exit(2);
}
if (!existsSync(".git")) {
  console.error(
    "A Git repository with a configured GitHub remote is required to publish.",
  );
  process.exit(2);
}
run("npm", ["run", "format"]);
run("npm", ["run", "lint"]);
run("npm", ["test"]);
run("npm", ["run", "build"]);
run("cargo", [
  "fmt",
  "--manifest-path",
  "src-tauri/Cargo.toml",
  "--",
  "--check",
]);
run("cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
run("cargo", ["check", "--manifest-path", "src-tauri/Cargo.toml"]);
run("npm", ["version", bump, "--no-git-tag-version"]);
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const version = pkg.version;
const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"));
config.version = version;
writeFileSync(
  "src-tauri/tauri.conf.json",
  JSON.stringify(config, null, 2) + "\n",
);
let cargo = readFileSync("src-tauri/Cargo.toml", "utf8");
cargo = cargo.replace(
  /(\[package\][\s\S]*?\nversion = ")[^"]+/,
  `$1${version}`,
);
writeFileSync("src-tauri/Cargo.toml", cargo);
const notes = `# Flint ${version}\n\nGenerated ${new Date().toISOString().slice(0, 10)}. See the tagged commit history for the exact changes.\n`;
writeFileSync(`RELEASE_NOTES.md`, notes);
run("git", [
  "add",
  "package.json",
  "package-lock.json",
  "src-tauri/tauri.conf.json",
  "src-tauri/Cargo.toml",
  "RELEASE_NOTES.md",
]);
run("git", ["commit", "-m", `release: Flint ${version}`]);
run("git", ["tag", "-a", `v${version}`, "-m", `Flint ${version}`]);
run("git", ["push", "origin", "HEAD", `v${version}`]);
console.log(
  `Published v${version} tag. GitHub Actions is building signed Windows and macOS artifacts.`,
);
