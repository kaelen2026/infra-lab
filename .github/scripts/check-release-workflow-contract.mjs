import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const IMAGE_APPS = ["api", "web", "h5", "bot"];
const DEPLOY_APPS = ["api", "web", "h5"];
const RELEASE_TS_APPS = ["api", "web", "h5", "cli", "miniprogram", "bot"];
const RELEASE_NATIVE_APPS = ["ios", "android", "harmony"];

const workflow = (name) => resolve(".github", "workflows", name);

function tagPatterns(apps) {
  return apps.map((app) => `"${app}_v*"`).join(", ");
}

function assertContains(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`${label} must contain: ${expected}`);
  }
}

function assertNoRetiredTags(source, label) {
  for (const tag of ["vapi-", "vweb-", "vh5-", "vbot-", "v{app}-{date}"]) {
    if (source.includes(tag)) throw new Error(`${label} still contains retired tag format: ${tag}`);
  }
}

const [releaseImages, deploy, releaseTagCheck, deploymentDocs, deploySkill, ci] = await Promise.all(
  [
    readFile(workflow("release-images.yml"), "utf8"),
    readFile(workflow("deploy.yml"), "utf8"),
    readFile(workflow("release-tag-check.yml"), "utf8"),
    readFile("docs/deployment.md", "utf8"),
    readFile(".claude/skills/deploy/SKILL.md", "utf8"),
    readFile(workflow("ci.yml"), "utf8"),
  ],
);

assertContains(releaseImages, `tags: [${tagPatterns(IMAGE_APPS)}]`, "release-images.yml triggers");
assertContains(releaseImages, "api|web|h5|bot)", "release-images.yml parser");
assertContains(deploy, `tags: [${tagPatterns(DEPLOY_APPS)}]`, "deploy.yml triggers");
assertContains(releaseTagCheck, `${RELEASE_TS_APPS.join("|")})`, "release-tag-check.yml TS apps");
assertContains(
  releaseTagCheck,
  `${RELEASE_NATIVE_APPS.join("|")})`,
  "release-tag-check.yml native apps",
);
assertContains(deploymentDocs, "`api_v*` / `web_v*` / `h5_v*`", "docs/deployment.md");
assertContains(deploySkill, "`api_v*` · `web_v*` · `h5_v*`", ".claude/skills/deploy");

for (const [source, label] of [
  [releaseImages, "release-images.yml"],
  [deploy, "deploy.yml"],
  [releaseTagCheck, "release-tag-check.yml"],
  [deploymentDocs, "docs/deployment.md"],
  [deploySkill, ".claude/skills/deploy"],
  [ci, "ci.yml"],
]) {
  assertNoRetiredTags(source, label);
}

console.log("Release workflow contract verified");
