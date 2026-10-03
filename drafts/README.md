# drafts/ — 博客文章草稿

存放尚未发布的 organicchurch 文章草稿。

## 为什么放在这里

本目录位于部署目录 `brianinchrist/` **之外**。`wrangler pages deploy brianinchrist` 只会上传 `brianinchrist/` 下的内容，所以这里的草稿永远不会被发布到线上，也不需要额外配置忽略规则。

## 命名约定

草稿阶段用可读文件名，例如：

```
drafts/杰弗雷德与安提阿学校.md
drafts/家教会治理再思.md
```

正式发布时才改名为数字 ID（`posts/{id}.md`）。

## 发布流程

1. 在 `brianinchrist/organicchurch/posts/` 下确定下一个可用的数字 ID，把草稿移入并重命名，例如 `posts/8301.md`。
2. 补齐文件头 frontmatter（`id`、`title`、`date`、`author`、`eyebrow`、`featured_image`、`excerpt`、`categories`），格式参考 `posts/` 下已有文章。
3. 在 `brianinchrist/organicchurch/posts/posts.json` **开头**插入对应条目（该文件按日期倒序，不要整体重写）。
4. 部署：`npx wrangler pages deploy brianinchrist --project-name brianinchrist-site`。
