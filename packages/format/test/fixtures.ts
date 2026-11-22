/**
 * 「打开再保存文件不变」用的样本：各种容易被改坏的写法。单元测试和端到端测试共用。
 */
const enc = (s: string) => new TextEncoder().encode(s)

/** 以前的白板写法（2026-11-21 以前）：列和卡的排版写在注释里。打开时一次转成「## 列名」写法（board-convert.ts） */
const oldBoard = `---
type: board
links:
  - a1 -> a2
---
# 冰岛自驾

<!-- card id=a1 x=120 y=300 w=280 color=yellow -->
> 冰洞只在冬天开放，要跟向导进去
> —— [Ice caves](https://example.com/ice)

<!-- card id=a2 x=460 y=300 w=280 -->
2.27 和 2.28 的住处还没订。

<!-- column id=c1 x=800 y=80 w=280 title="要订的" -->
<!-- card id=a4 in=c1 -->
- [ ] 车
- [x] 机票

<!-- columns widths=40,30,30 -->
左栏……
<!-- col -->
中栏……
<!-- col -->
右栏……
<!-- /columns -->

<!-- card id=a3 没有配对的注释也要原样留着
[[所思所想]] 和 ^abc123 块编号
`

/**
 * 白板（2026-11-21 方向 A「一份文字两种看法」）：白板就是这篇文档，## 是列、一块是一张卡；
 * 拖到空白处的卡前面一行位置，列也能摆在自己的位置；连线两头的列里的卡留一行只记编号的注释
 */
const frontmatterBoard = `---
type: board
links:
  - a1 -> a2
  - a2 -> a4
---
# 冰岛自驾

<!-- card id=a1 x=124 y=364 color=yellow -->
> 冰洞只在冬天开放，要跟向导进去
> —— [Ice caves](https://example.com/ice)

<!-- card id=a2 x=464 y=364 -->
2.27 和 2.28 的住处还没订。

<!-- column id=c1 x=804 y=144 -->
## 要订的

<!-- card id=a4 -->
- [ ] 车
- [x] 机票

<!-- columns widths=40,30,30 -->
左栏……
<!-- col -->
中栏……
<!-- col -->
右栏……
<!-- /columns -->

<!-- card id=a3 没有配对的注释也要原样留着
[[所思所想]] 和 ^abc123 块编号

## 住哪

**还没订的**
- [ ] 霍芬一晚

\`\`\`base
filters:
  and:
    - file.inFolder("项目/住宿")
views:
  - type: table
    name: 表格
\`\`\`
`

/** 读 PDF 的笔记做成一篇长文档（新格式，CN-93–96）：问题原话、回答原文（公式、表格、标题）、旁支、脚注、小结，后面跟一段旧格式和自己写的一段 */
const readingDoc = `---
类型: 笔记
课程: ecpc
第几讲: 5
来源: "[[Lecture05.pdf]]"
日期: 2026-11-19
AI填的: 课程, 第几讲
进度: 28/43
---

# Lecture05 笔记

## 第 28 页 · LIF 神经元的三条公式
[第 28 页](Lecture05.pdf#page=28&rect=0.06,0.3,0.89,0.6) · 20:21 <!-- cn:thread=Lecture05-p28-1 -->

![我框的|268](附件/Lecture05/p28-1.png)

> [!question] 给我讲解一下

**一句话：LIF 神经元就是一个会漏水的水桶。**

### 第一条：水位怎么变

$$\\tau_m \\frac{dV_m}{dt} = -V_m(t) + I_s(t) + I_b$$

| 步 | 水位 |
|---|---|
| 1 | 0.200 |

> [!side] 为什么减掉门槛，而不是清零？
> > 水位一到门槛 Vth 就发一个 spike，同时把水位减掉一个门槛的量
>
> 水位冲到 1.3 时，减掉 1 还剩 0.3。

> [!side] 那门槛是多少？
>
> 这一页设成 1。

> [!question] [^p28-1-1]和[^p28-1-2]说的是一回事吗？

是一回事。

> [!recap] LIF 用「漏、积、发」三步描述神经元；另问了为什么不清零。

[^p28-1-1]: 「水位一到门槛就发一个 spike」 AI的回答 · 第28页
[^p28-1-2]: ![粘贴的图|180](附件/Lecture05/p28-1-m2.png)

[可视化 · LIF 水桶](LIF%20水桶.html) · [[第4讲 脉冲网络]]

## 第 30 页 · 以前记的一段
[第 30 页](Lecture05.pdf#page=30) · 20:30

> [!question] 我的疑惑
> 整块没看懂：第 30 页框的这块

> [!ai] AI 讲解 · Claude Code · Opus 5.5 · 看了第 30 页
> 先看图，再看公式。

[完整对话 · 1 轮](.canvas-notes/对话/Lecture05-p30-1.md)

## 我自己记的

考试要考。
`

/** 真实样子的旧白板：卡片、列、图片、书摘卡、链接、AI 总结的卡、连线（转写法的测试用） */
export const OLD_BOARDS: Record<string, string> = {
  '旧样本.md': oldBoard,
  '冰岛自驾.md': `---
type: board
color: "#5d8fb0"
links:
  - k1 -> k2
---
# 冰岛自驾

还没想好放哪的一句：极光要看 KP 指数。

<!-- card id=k1 x=40 y=20 w=280 -->
**待办**
- [x] 订机票
- [ ] 租四驱车

<!-- card id=k2 x=360 y=20 w=280 -->
> [!quote] [《在冰岛开车》 · 第二章 天气](weread://reading/abc)
> 冰岛的天气五分钟一变。

我的评价：出门前一定看 vedur.is。

<!-- card id=k3 x=40 y=260 w=280 -->
![](附件/冰岛自驾/黑沙滩.png)

<!-- card id=k4 x=360 y=300 w=280 -->
[[冰岛照片墙]]

<!-- card id=k5 x=700 y=40 w=300 ai=2026-11-19 -->
三句话总结：路线定了，住宿差两晚，装备齐了。

<!-- column id=c1 x=1040 y=20 w=300 title="住哪" -->
<!-- card id=k6 in=c1 -->
南岸在维克住两晚。

<!-- card id=k7 in=c1 -->
## 东边
霍芬一晚，米湖两晚。

<!-- column id=c2 x=1380 y=20 w=300 title=剪藏 -->
<!-- card id=k8 in=c2 -->
![[Geography of Iceland]]

<!-- card id=k9 x=40 y=520 w=280 -->
第一段：车要四驱。

第二段：保险要买全。
`,
  '读书计划.md': `---
type: board
---
# 读书计划

<!-- column id=c1 x=80 y=80 w=300 title="在读" -->
<!-- card id=a1 in=c1 -->
在冰岛开车

<!-- card id=a2 in=c1 -->
思考，快与慢

<!-- column id=c2 x=400 y=80 w=300 title="读完" -->
<!-- card id=a3 in=c2 -->
趣说明朝276年
`,
  '先做后做.md': `---
type: board
links:
  - m1 -> m2
---
<!-- column id=c2 x=500 y=400 w=300 title="后来" -->
<!-- card id=m2 in=c2 -->
第二件事

<!-- column id=c1 x=80 y=80 w=300 title="先做" -->
<!-- card id=m1 in=c1 -->
第一件事
`,
}

/**
 * 公式（task-o48fa）：照用户截图（d2l 的数学符号表）写的一篇，再加单独成行的、很宽的、\(…\)、\[…\]、钱数、代码里的 $、转义的 \$、写错的。
 * 文档编辑器、白板、端到端测试共用
 */
export const MATH_DOC = `# 数学符号

## 数字

- $x$：标量
- $\\mathbf{x}$：向量
- $\\mathbf{X}$：矩阵
- $\\mathsf{X}$：张量
- $\\mathbf{I}$：单位矩阵
- $x_i$, $\\mathbf{x}_i$：向量 $\\mathbf{x}$ 第 $i$ 个元素
- $x_{ij}$, $\\mathbf{X}_{ij}$：矩阵 $\\mathbf{X}$ 第 $i$ 行第 $j$ 列的元素

## 集合论

- $\\mathcal{X}$：集合
- $\\mathbb{Z}$：整数集合
- $\\mathbb{R}$：实数集合
- $\\mathbb{R}^n$：$n$ 维实数向量集合
- $\\mathbb{R}^{a\\times b}$：包含 $a$ 行和 $b$ 列的实数矩阵集合
- $\\mathcal{A}\\cup\\mathcal{B}$：集合 $\\mathcal{A}$ 和 $\\mathcal{B}$ 的并集
- $\\mathcal{A}\\cap\\mathcal{B}$：集合 $\\mathcal{A}$ 和 $\\mathcal{B}$ 的交集
- $\\mathcal{A}\\setminus\\mathcal{B}$：集合 $\\mathcal{A}$ 与集合 $\\mathcal{B}$ 相减，$\\mathcal{B}$ 关于 $\\mathcal{A}$ 的相对补集

## 单独成行的

线性回归：

$$
\\hat{\\mathbf{y}} = \\mathbf{X}\\mathbf{w} + b
$$

一行写完的 $$\\|\\mathbf{x}\\|_2 = \\sqrt{\\sum_{i=1}^n x_i^2}$$ 夹在字中间。设 \\(f(x) = x^2\\)，则

\\[
f'(x) = 2x
\\]

很宽的一条：

$$\\mathcal{L}(\\mathbf{w}, b) = \\frac{1}{n}\\sum_{i=1}^{n} \\frac{1}{2}\\left(\\mathbf{w}^\\top \\mathbf{x}^{(i)} + b - y^{(i)}\\right)^2 + \\lambda \\|\\mathbf{w}\\|^2 + \\mu \\sum_{j=1}^{d} |w_j| + \\frac{\\gamma}{2} \\sum_{k=1}^{K} \\left(\\theta_k - \\bar{\\theta}\\right)^2 + \\sum_{l=1}^{L} \\|\\mathbf{W}^{(l)}\\|_F^2 + \\frac{\\eta}{2}\\sum_{m=1}^{M}\\left(\\phi_m - \\psi_m\\right)^2 + \\kappa \\sum_{t=1}^{T} \\log\\left(1 + e^{-z_t}\\right)$$

## 不是公式的

一杯 $5，两杯 $10，美元写 \\$7。代码 \`echo $HOME\` 照旧。

写错的：$\\frac{1}{$ 和 $\\foo{x}$。
`

/** 文档里 AI 讲解块上开过旁支（task-4edsc）：[!side] 挂在讲解下面，编辑器里藏起来、只露小标；打开再保存一个字节不变 */
const docWithSides = [
  '# 第5讲 注意力机制',
  '',
  '这一讲从「一句话里每个词该看谁」讲起。',
  '',
  '> [!ai] AI 讲解 · Claude Code · Opus 5.5 · 看了 00:06 这一帧',
  '> 先拿 Q 和每个 K 做点积。分数要先除以 √d，再过 softmax 变成权重。',
  '>',
  '> 最后用这些权重把 **V** 加起来，就是这个位置的输出。',
  '',
  '> [!side] V 在这里是什么？',
  '> > 最后用这些权重把 **V** 加起来，就是这个位置的输出。',
  '>',
  '> V 是每个词带的内容。',
  '',
  '> [!side] 那 K 呢？',
  '>',
  '> K 是用来比的。',
  '',
  '我的理解：缩放是为了让分数别太极端。',
  '',
].join('\n')

/** 白板上 AI 讲解卡开过旁支（task-p90ra）：type: board 的白板，讲解卡挂着两条旁支（一条带接着问），另一张摆在空白处；白板看法里只露小标 */
const boardWithSides = `---
type: board
---
# 注意力白板

## 讲解

<!-- card id=s1 ai=2026-11-21 -->
> [!ai] AI 讲解 · Claude Code · Opus 5.5 · 看了 00:06 这一帧
> 先拿 Q 和每个 K 做点积。分数要先除以 √d，再过 softmax 变成权重。
>
> 最后用这些权重把 **V** 加起来，就是这个位置的输出。

> [!side] V 在这里是什么？
> > 最后用这些权重把 **V** 加起来，就是这个位置的输出。
>
> V 是每个词带的内容。

> [!side] 那 K 呢？
>
> K 是用来比的。

> [!side] 讲讲这句
> > 分数要先除以 √d，再过 softmax 变成权重。
>
> #### 旁支的回答
>
> 不缩放时 softmax 太尖。

<!-- card id=a2 x=640 y=120 -->
为什么偏偏是根号 d？
`

export const FIXTURES: Record<string, Uint8Array> = {
  '数学符号.md': enc(MATH_DOC),
  '旁支挂在讲解下面.md': enc(docWithSides),
  '白板带旁支.md': enc(boardWithSides),
  'Lecture05 笔记.md': enc(readingDoc),
  // 从 Obsidian 导进来的样子（task-4xtbp）：行尾 ^块编号、收起的「注释」提示块、![|300] 图宽、带路径的双链、行内 %%注释%%
  '从Obsidian导入的.md': enc(
    '---\ntags:\n  - 线代\ncreated: 2021-09-01 08:00\nupdated: 2021-09-02 09:00\n来源: 我的Obsidian库\n原文件夹: 课程/线代\nimport-id: md:我的Obsidian库/课程/线代/线性映射.md\n---\n' +
      '# 线性映射\n\n定义：线性映射保持加法和数乘。 ^def1\n\n- 第一条 ^li-1\n- 第二条\n\n![|300](附件/极光.jpg)\n\n> [!note]- 注释\n> 这句是 Obsidian 的注释\n\n' +
      '正文里夹一句 %%行内注释%% 接着写。\n\n见 [[收件箱/导入/我的Obsidian库/课程/线代/第一讲]]、[[小结#^abc|小结]]。\n',
  ),
  'plain.md': enc('# 所思所想\n\n最近在看纳瓦尔宝典。\n\n**财富**是靠专长、杠杆。\n'),
  // 可视化嵌进笔记（task-m552v）：单独一段 ![可视化 · 标题](x.html) 画成能拖的图；以前脚上那行链接、CRLF 照旧；那份 HTML 不在库里也不改字
  '带可视化嵌入的笔记.md': enc(
    '---\r\n类型: 笔记\r\n来源: "[[第3讲 线性映射.pdf]]"\r\n---\r\n# 第3讲 线性映射 笔记\r\n\r\n## 第 5 页 · 旋转矩阵每个数从哪来\r\n' +
      '[第 5 页](第3讲%20线性映射.pdf#page=5) · 10:20 <!-- cn:thread=第3讲 线性映射-p5-1 -->\r\n\r\n> [!question] 旋转矩阵的四个数是怎么来的\r\n\r\n先别看公式，看图。\r\n\r\n' +
      '![可视化 · 旋转矩阵 · 拖动角度看基向量](旋转矩阵.html)\r\n\r\n[[第4讲 特征值]]\r\n\r\n## 第 6 页 · 以前做的\r\n\r\n[完整对话 · 1 轮](../../.canvas-notes/对话/x.md) · [可视化 · 旧的一张](旧的%20一张.html)\r\n',
  ),
  // 和网页配成一对的笔记（task-kbnc0）：开头的 read-along 属性（CRLF）打开再保存一个字节都不变；网址是本机打不开的，测试不上网
  '对着看的笔记.md': enc('---\r\nread-along: http://127.0.0.1:9/\r\n类型: 笔记\r\n---\r\n# 对着看的笔记\r\n\r\n读到 2.1 的时候记的。\r\n'),
  'no-trailing-newline.md': enc('最后一行没有换行'),
  'trailing-spaces.md': enc('行尾两个空格  \n\t缩进用 tab\n\n\n\n多个空行\n   '),
  'crlf.md': enc('# Windows 换行\r\n\r\n第一段\r\n第二段\r\n'),
  'bom.md': new Uint8Array([0xef, 0xbb, 0xbf, ...enc('# 带 BOM 的文件\n\n内容\n')]),
  'bom-crlf.md': new Uint8Array([0xef, 0xbb, 0xbf, ...enc('# BOM 加 CRLF\r\n内容\r\n')]),
  'mixed-eol.md': enc('混用换行\r\n这一行是 LF\n这一行是 CRLF\r\n'),
  'emoji-cjk.md': enc('表情 👨‍👩‍👧‍👦 和 𠮷 和组合字 é́\n全角，标点。「引号」\n'),
  'board.md': enc(frontmatterBoard),
  'html-and-tables.md': enc('| a | b |\n|---|:-:|\n| 1 | 2 |\n\n<details><summary>折叠</summary>\n\n里面\n\n</details>\n\n```js\nconst x = 1\r\n```\n'),
  'empty.md': new Uint8Array(),
  'only-newlines.md': enc('\n\n\n'),
  'lone-cr.md': enc('老 Mac 换行\r第二行\r'),
  'invalid-utf8.md': new Uint8Array([...enc('坏字节：'), 0xff, 0xfe, ...enc('\n')]),
}
