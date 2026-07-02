import { describe, expect, it } from "vitest";

// @ts-expect-error 零依赖的 .mjs 脚本模块，无类型声明
import { linkifyGitHubRefs } from "../feishu-format.mjs";

const REPO = "kaelen/infra-lab";

describe("linkifyGitHubRefs", () => {
  it("把裸 #编号 转成当前仓库的链接（issue/PR 共用 /issues 跳转）", () => {
    expect(linkifyGitHubRefs("PR 已开：#57", REPO)).toBe(
      "PR 已开：[#57](https://github.com/kaelen/infra-lab/issues/57)",
    );
  });

  it("句中、句尾标点旁的引用都能识别", () => {
    expect(linkifyGitHubRefs("修复 #12，关联 #34。", REPO)).toBe(
      "修复 [#12](https://github.com/kaelen/infra-lab/issues/12)，" +
        "关联 [#34](https://github.com/kaelen/infra-lab/issues/34)。",
    );
  });

  it("跨仓库 owner/repo#编号 链接到对应仓库并保留全称标签", () => {
    expect(linkifyGitHubRefs("见 anthropics/claude-code#100", REPO)).toBe(
      "见 [anthropics/claude-code#100](https://github.com/anthropics/claude-code/issues/100)",
    );
  });

  it("裸 issue/PR URL 缩成短标签链接；本仓库省略 owner/repo 前缀", () => {
    expect(linkifyGitHubRefs("详见 https://github.com/kaelen/infra-lab/pull/57", REPO)).toBe(
      "详见 [#57](https://github.com/kaelen/infra-lab/pull/57)",
    );
    expect(linkifyGitHubRefs("见 https://github.com/foo/bar/issues/9", REPO)).toBe(
      "见 [foo/bar#9](https://github.com/foo/bar/issues/9)",
    );
  });

  it("裸 URL 带路径/锚点时整段保留在链接目标里，中文句号不吞入", () => {
    expect(
      linkifyGitHubRefs("见 https://github.com/kaelen/infra-lab/pull/57/files 与评论。", REPO),
    ).toBe("见 [#57](https://github.com/kaelen/infra-lab/pull/57/files) 与评论。");
    expect(linkifyGitHubRefs("已合并 https://github.com/kaelen/infra-lab/pull/57。", REPO)).toBe(
      "已合并 [#57](https://github.com/kaelen/infra-lab/pull/57)。",
    );
  });

  it("已有 markdown 链接不重复包装", () => {
    const already = "[#57](https://github.com/kaelen/infra-lab/pull/57)";
    expect(linkifyGitHubRefs(already, REPO)).toBe(already);
    const labeled = "[修复 CORS](https://github.com/kaelen/infra-lab/pull/55)";
    expect(linkifyGitHubRefs(labeled, REPO)).toBe(labeled);
  });

  it("行内代码与代码块内的引用保持原样", () => {
    expect(linkifyGitHubRefs("运行 `gh pr view #57` 查看", REPO)).toBe(
      "运行 `gh pr view #57` 查看",
    );
    const fenced = "```\ngit log #57\n```";
    expect(linkifyGitHubRefs(fenced, REPO)).toBe(fenced);
  });

  it("不误伤：HTML 实体、单词后紧跟的 #、非数字编号", () => {
    expect(linkifyGitHubRefs("&#57; 是实体", REPO)).toBe("&#57; 是实体");
    expect(linkifyGitHubRefs("channel#57 不是引用", REPO)).toBe("channel#57 不是引用");
    expect(linkifyGitHubRefs("颜色 #57a2ff 不动", REPO)).toBe("颜色 #57a2ff 不动");
  });

  it("没有仓库上下文（本地/非 Actions 环境）时原样返回", () => {
    expect(linkifyGitHubRefs("PR 已开：#57", undefined)).toBe("PR 已开：#57");
    expect(linkifyGitHubRefs("", REPO)).toBe("");
  });

  it("支持 GHES 的自定义 server url", () => {
    expect(linkifyGitHubRefs("见 #7", REPO, "https://ghe.example.com/")).toBe(
      "见 [#7](https://ghe.example.com/kaelen/infra-lab/issues/7)",
    );
  });
});
