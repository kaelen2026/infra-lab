/**
 * Cross-language contract drift gate.
 *
 * The single source of truth for auth error codes and platforms lives in
 * `packages/shared/src/contracts/auth.ts`. Every native client keeps a hand-written
 * mirror of those sets (Swift enums, Kotlin enum, ArkTS union types). Adding a new
 * error code or platform to the source without updating a mirror is silent: the TS
 * CI is green, and the native gates are local-only — so a missing case only surfaces
 * when someone next compiles that client (or, worse, at runtime as a dropped value).
 *
 * This script closes that gap: it parses the canonical sets and asserts that every
 * source item appears in every mirror. Mirrors may carry extra sentinels (`unknown`
 * / `UNKNOWN`) for forward-compatible decoding — those are allowed; only *missing*
 * source items fail. Run standalone (`node scripts/check-contract-drift.mjs`, wired
 * into CI) or import `findMissing` / `parseSourceSets` for tests.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// scripts/check-contract-drift.mjs → repo root is one level up.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_FILE = "packages/shared/src/contracts/auth.ts";

/**
 * Source items (from the canonical contract) that are absent from a mirror set.
 * Extra items in the mirror (forward-compat sentinels) are ignored.
 * @param {Set<string>} sourceSet
 * @param {Set<string>} mirrorSet
 * @returns {string[]}
 */
export function findMissing(sourceSet, mirrorSet) {
  return [...sourceSet].filter((item) => !mirrorSet.has(item));
}

/** Read a repo-relative file as UTF-8 text. */
function read(relPath) {
  return readFileSync(join(ROOT, relPath), "utf8");
}

/**
 * Extract the string literals of an `export const NAME = [ ... ] as const;` array
 * from TS source, in declaration order. Line comments inside the array are ignored
 * (they carry no double-quoted text).
 * @param {string} text
 * @param {string} constName
 * @returns {string[]}
 */
function tsConstArray(text, constName) {
  const re = new RegExp(`${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`);
  const match = re.exec(text);
  if (!match) throw new Error(`could not find array literal for ${constName} in ${SOURCE_FILE}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * Parse the canonical auth error-code and platform sets from the contract source.
 * @returns {{ errorCodes: Set<string>, platforms: Set<string> }}
 */
export function parseSourceSets() {
  const text = read(SOURCE_FILE);
  return {
    errorCodes: new Set(tsConstArray(text, "AUTH_ERROR_CODES")),
    platforms: new Set(tsConstArray(text, "PLATFORMS")),
  };
}

/**
 * Slice the body of a declaration that starts at `startMarker` and ends at the first
 * column-0 `}` (a top-level enum/type close; nested `    }` blocks are indented and
 * so are not matched). Returns the text from the marker up to that close.
 * @param {string} text
 * @param {string} startMarker
 * @returns {string}
 */
function sliceToTopLevelClose(text, startMarker) {
  const start = text.indexOf(startMarker);
  if (start < 0) throw new Error(`could not find "${startMarker}"`);
  const end = text.indexOf("\n}", start);
  return text.slice(start, end < 0 ? undefined : end);
}

/**
 * Blank out line and block comments, preserving newlines so line offsets stay
 * intact. Without this, a commented-out mirror case (e.g. a line-commented
 * `case lastCredential = "LAST_CREDENTIAL"`) would still have its quoted literal
 * harvested — a false negative that lets real drift pass the gate.
 * @param {string} text
 * @returns {string}
 */
export function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
}

/** All UPPER_SNAKE double-quoted raw values in a block (Swift `case x = "RAW"`). */
function upperSnakeQuoted(block) {
  return new Set([...stripComments(block).matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map((m) => m[1]));
}

/** All lowercase double-quoted values in a block (Kotlin wire names / ArkTS unions). */
function lowerQuoted(block) {
  return new Set([...stripComments(block).matchAll(/"([a-z][a-z0-9_]*)"/g)].map((m) => m[1]));
}

/**
 * Swift enum case identifiers with no raw value (`case web, ios, macos`). Used for
 * `enum Platform: String` where the raw value defaults to the case name.
 */
function swiftBareCases(block) {
  const out = new Set();
  for (const line of block.split("\n")) {
    const m = /^\s*case\s+([^=]+)$/.exec(line);
    if (!m) continue;
    for (const id of m[1].split(",")) {
      const name = id.trim();
      if (name) out.add(name);
    }
  }
  return out;
}

/** Kotlin enum entries: bare UPPER_SNAKE identifiers, one per line. */
function kotlinEnumEntries(block) {
  const out = new Set();
  for (const line of block.split("\n")) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s*(?:\(|,|$)/.exec(line);
    if (m) out.add(m[1]);
  }
  return out;
}

/**
 * The mirror files and how to extract their error-code / platform sets. Each parser
 * is deliberately tolerant of formatting variants (annotation vs. constructor arg,
 * one-line vs. multi-line) so a benign refactor in a client doesn't false-positive.
 * @type {{ name: string, file: string, errorCodes: (t: string) => Set<string>, platforms: (t: string) => Set<string> }[]}
 */
const MIRRORS = [
  {
    name: "iOS",
    file: "apps/ios/InfraLab/Auth/AuthContracts.swift",
    errorCodes: (t) => upperSnakeQuoted(sliceToTopLevelClose(t, "enum AuthErrorCode")),
    platforms: (t) => swiftBareCases(sliceToTopLevelClose(t, "enum Platform")),
  },
  {
    name: "macOS",
    file: "apps/macos/InfraLab/Auth/AuthContracts.swift",
    errorCodes: (t) => upperSnakeQuoted(sliceToTopLevelClose(t, "enum AuthErrorCode")),
    platforms: (t) => swiftBareCases(sliceToTopLevelClose(t, "enum Platform")),
  },
  {
    name: "Android",
    file: "apps/android/app/src/main/kotlin/dev/w3ctech/infralab/data/contracts/Contracts.kt",
    errorCodes: (t) => kotlinEnumEntries(sliceToTopLevelClose(t, "enum class AuthErrorCode")),
    // Platform wire values live in double quotes whether declared via @SerialName("web")
    // or a constructor arg (WEB("web")); either way, harvest the lowercase literals.
    platforms: (t) => lowerQuoted(sliceToTopLevelClose(t, "enum class Platform")),
  },
  {
    name: "Harmony",
    file: "apps/harmony/entry/src/main/ets/common/contracts.ets",
    errorCodes: (t) => upperSnakeQuoted(sliceTsUnion(t, "AuthErrorCode")),
    platforms: (t) => lowerQuoted(sliceTsUnion(t, "Platform")),
  },
];

/** Slice an ArkTS/TS `type Name = "a" | "b" | ...;` union up to its terminating `;`. */
function sliceTsUnion(text, typeName) {
  const start = text.indexOf(`type ${typeName}`);
  if (start < 0) throw new Error(`could not find "type ${typeName}"`);
  const end = text.indexOf(";", start);
  return text.slice(start, end < 0 ? undefined : end);
}

/**
 * Compare the canonical sets against every mirror.
 * @returns {{ mirror: string, file: string, missingCodes: string[], missingPlatforms: string[] }[]}
 */
export function collectDrift() {
  const { errorCodes, platforms } = parseSourceSets();
  const problems = [];
  for (const mirror of MIRRORS) {
    const text = read(mirror.file);
    const missingCodes = findMissing(errorCodes, mirror.errorCodes(text));
    const missingPlatforms = findMissing(platforms, mirror.platforms(text));
    if (missingCodes.length > 0 || missingPlatforms.length > 0) {
      problems.push({ mirror: mirror.name, file: mirror.file, missingCodes, missingPlatforms });
    }
  }
  return problems;
}

function main() {
  const { errorCodes, platforms } = parseSourceSets();
  const problems = collectDrift();
  if (problems.length === 0) {
    console.log(
      `Contract mirrors verified: ${errorCodes.size} error codes + ${platforms.size} platforms present in all ${MIRRORS.length} native mirrors`,
    );
    return;
  }
  console.error("Contract drift detected — native mirror(s) are missing canonical items:\n");
  for (const p of problems) {
    console.error(`  ${p.mirror} (${p.file})`);
    if (p.missingCodes.length > 0) {
      console.error(`    missing error codes: ${p.missingCodes.join(", ")}`);
    }
    if (p.missingPlatforms.length > 0) {
      console.error(`    missing platforms:   ${p.missingPlatforms.join(", ")}`);
    }
  }
  console.error(`\nSource of truth: ${SOURCE_FILE}. Add the missing case(s) to each mirror above.`);
  process.exit(1);
}

// Run only when invoked directly (not when imported by tests).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
