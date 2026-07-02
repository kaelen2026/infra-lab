// 飞书卡片 markdown 的可读性后处理，供 feishu-reply.mjs / feishu-notify.mjs 共用。
//
// GitHub 网页会把 `#57`、`owner/repo#57`、裸的 issue/PR URL 自动渲染成链接，
// 飞书卡片不会——原样转发就成了不可点的纯文本。这里在发送前做一次确定性转换，
// 统一成飞书认识的 `[#57](https://github.com/...)` 形式。
//
// 链接一律指向 /issues/<n>：GitHub 对 PR 编号会自动 302 到 /pull/<n>，
// 无需区分引用的是 issue 还是 PR。

const DEFAULT_SERVER = "https://github.com";

/**
 * 把文本里的 GitHub 引用转成飞书可点击的 markdown 链接。
 *
 * 处理三类：裸 issue/PR URL → `[#57](url)`（跨仓库则 `[owner/repo#57](url)`）、
 * `owner/repo#57`、`#57`。代码块 / 行内代码 / 已有 markdown 链接内的内容不动。
 *
 * @param {string} text 原始 markdown 文本
 * @param {string} repoSlug 当前仓库 `owner/repo`（裸 `#57` 的归属；空则原样返回）
 * @param {string} [serverUrl] GitHub 服务地址（GHES 用），默认 github.com
 * @returns {string}
 */
export function linkifyGitHubRefs(text, repoSlug, serverUrl = DEFAULT_SERVER) {
  if (!text || !repoSlug) return text;
  const server = (serverUrl || DEFAULT_SERVER).replace(/\/+$/, "");
  let inFence = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      // 奇数段是 `行内代码`，保持原样；只转换偶数段普通文本。
      return line
        .split(/(`[^`]*`)/)
        .map((seg, i) => (i % 2 === 1 ? seg : linkifySegment(seg, repoSlug, server)))
        .join("");
    })
    .join("\n");
}

function linkifySegment(seg, repoSlug, server) {
  // 裸 issue/PR URL → 短标签链接。前一个字符是 "(" 说明已在 markdown 链接目标里，不动。
  let out = seg.replace(
    /(^|[^(\w])(https?:\/\/[^\s/]+\/([\w.-]+\/[\w.-]+)\/(?:pull|issues)\/(\d+)(?:[/#?][^\s)]*)?)/g,
    (_m, pre, url, slug, num) => {
      const label = slug === repoSlug ? `#${num}` : `${slug}#${num}`;
      return `${pre}[${label}](${url})`;
    },
  );
  // `#57` / `owner/repo#57` 简写 → 链接。排除已在链接标签里（前一字符 `[`）、
  // 紧跟在单词/路径后（`x#1`、`a/b#1` 已由上一条处理）、HTML 实体（`&#57;`）等场景。
  out = out.replace(/(^|[^\w/[`#&])(?:([\w-]+\/[\w.-]+))?#(\d+)(?!\w)/g, (_m, pre, slug, num) => {
    const target = slug ?? repoSlug;
    const label = slug ? `${slug}#${num}` : `#${num}`;
    return `${pre}[${label}](${server}/${target}/issues/${num})`;
  });
  return out;
}
