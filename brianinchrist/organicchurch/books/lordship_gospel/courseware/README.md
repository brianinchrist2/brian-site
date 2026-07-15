# Book2 互动课件

## 课件简介

本课件是《家教会的本体论革命》第二册（`book2/`）的配套互动学习工具，面向**个人自学**场景设计。

它把 `book2/` 中的目录、章节内容、学习指南、经文、术语与思考问题等资料，整合成一个可在浏览器中运行的单页应用。学习者可以在一个界面中查看学习进度、逐章阅读、记录答题、复习术语与经文，并导出或打印学习材料。

## 功能清单

- **学习仪表盘**（`index.html`）
  - 整体学习进度与章节完成统计
  - 章节导航，可快速跳转到任意章节
  - 最近学习位置与连续学习提示

- **章节学习**（`chapter.html`）
  - 每章概要、核心经文、关键术语
  - 章节大纲与思考问题
  - 作答框支持实时输入，答案自动保存到本地

- **复习测验**（`review.html`）
  - 术语闪卡：随机抽取关键术语进行自测
  - 随机抽题：从各章思考问题中随机出题
  - 经文回顾：按章节复习核心经文

- **导出与打印**（`print.html`）
  - 导出学习笔记为 Markdown 或 TXT
  - 打印友好视图，方便纸质复习

## 快速开始

1. 生成课件数据：

   ```bash
   python3 Oikos+Koinonia/d7/courseware/tools/build_courseware.py
   ```

   该脚本会读取 `book2/` 中的源文件，生成 `assets/data/courseware.json`。

2. 打开课件：

   - 直接用浏览器打开 `Oikos+Koinonia/d7/courseware/index.html`
   - 或启动一个简易本地服务器：

     ```bash
     cd Oikos+Koinonia/d7/courseware
     python3 -m http.server 8000
     ```

     然后在浏览器中访问 `http://localhost:8000`。

## 数据来源

课件内容自动从以下源文件提取：

| 源文件 | 用途 |
| --- | --- |
| `book2/index.html` | 课程目录（TOC） |
| `book2/chapterXX.html` | 各章正文、术语、经文 |
| `book2/guide.html` | 章节概要、思考问题 |
| 生成的 `assets/data/courseware.json` | 课件运行时的统一数据文件 |

## 当 book2 更新后

如果 `book2/` 中的源文件发生变更，请重新运行构建脚本以同步数据：

```bash
python3 Oikos+Koinonia/d7/courseware/tools/build_courseware.py
```

重新生成后刷新浏览器即可看到更新内容。本地保存的学习进度与答案不会被覆盖。

## 本地数据

- 所有作答、学习进度与设置均保存在浏览器的 `localStorage` 中。
- 数据仅保留在用户本地设备，不会上传到任何服务器。
- 如需清除数据，可在浏览器开发者工具中删除对应站点的 `localStorage`，或清除站点数据。

## 测试

课件构建脚本附带单元测试，运行方式如下：

```bash
cd Oikos+Koinonia/d7/courseware
python3 -m unittest tests.test_build_courseware -v
```

## 文件结构

```
Oikos+Koinonia/d7/courseware/
├── index.html              # 学习仪表盘入口
├── chapter.html            # 章节学习页面
├── review.html             # 复习测验页面
├── print.html              # 打印与导出页面
├── README.md               # 本说明文档
├── assets/
│   ├── css/
│   │   └── courseware.css  # 样式文件
│   ├── js/
│   │   ├── app.js          # 仪表盘逻辑
│   │   ├── chapter.js      # 章节学习逻辑
│   │   ├── data.js         # 数据加载与解析
│   │   ├── export.js       # 导出功能
│   │   ├── print.js        # 打印视图逻辑
│   │   ├── quiz.js         # 测验逻辑
│   │   ├── review.js       # 复习功能
│   │   ├── storage.js      # localStorage 读写
│   │   └── utils.js        # 通用工具函数
│   └── data/
│       └── courseware.json # 由 build_courseware.py 生成的数据文件
├── tools/
│   └── build_courseware.py # 数据构建脚本
└── tests/
    └── test_build_courseware.py  # 构建脚本单元测试
```


