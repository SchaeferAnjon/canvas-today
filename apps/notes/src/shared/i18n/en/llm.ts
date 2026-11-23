/** 英文表：本地模型（设置 › 梦游的本地模型那张卡、下载和推理的报错，task-h7oy8） */
import type { Table } from '../core'

export const LLM: Table = {
  // ---------- 下载（main/local-llm/download.ts） ----------
  '下载地址接着下的位置不对': 'The download server resumed from the wrong position',
  '下载地址回了 {code}': 'The download server returned {code}',
  '下载地址没回内容': 'The download server sent nothing',
  '下下来的比该有的大，文件不对': 'The download is larger than expected, so the file is wrong',
  '下载断了': 'The download was interrupted',
  '下载地址 {s} 秒没动静': 'The download server sent nothing for {s} seconds',
  '校验没通过（sha256 不对），下坏的已作废': 'Verification failed (wrong sha256); the damaged file was discarded',
  '下载没成功：{why}': 'Download failed: {why}',

  // ---------- 主进程（main/local-llm/index.ts） ----------
  '没有这个本地模型：{id}': 'No such local model: {id}',
  本地模型: 'Local model',
  '本地模型载入不了：{why}': 'The local model couldn’t load: {why}',
  '本地模型的进程退出了（{code}），可能是内存不够': 'The local model process quit ({code}), possibly out of memory',
  '这一问太长，本地模型一次看不了（{n} 个 token，最多 {max}）': 'This question is too long for the local model ({n} tokens, at most {max})',
  '本地模型出错：{why}': 'Local model error: {why}',
  '本地模型只能在 Apple 芯片的 Mac 上跑': 'The local model runs only on Macs with Apple silicon',
  '本地模型还没下好，设置 › 梦游里点下载': 'The local model isn’t downloaded yet. Download it in Settings › Dreaming',

  // ---------- 设置里那张卡（renderer/local-model.tsx） ----------
  用哪个本地模型: 'Which local model to use',
  '下载一次{size}，以后不联网 · 跑起来约占{need} GB内存（这台Mac {have} GB）': 'Downloads {size} once, then works offline · Uses about {need} GB of memory (this Mac has {have} GB)',
  '下载一次{size}，以后不联网 · 跑起来约占{need} GB内存，这台Mac只有{have} GB，会很慢': 'Downloads {size} once, then works offline · Uses about {need} GB of memory; this Mac has only {have} GB, so it will be slow',
  '存在{dir}': 'Stored in {dir}',
  这台Mac跑不了本地模型: 'This Mac can’t run the local model',
  要Apple芯片的Mac: 'Needs a Mac with Apple silicon',
  '已下好 · {size}': 'Downloaded · {size}',
  '梦游判断时在这台Mac上跑，不花订阅额度': 'Runs on this Mac when dreaming decides, without using your subscription',
  正在载入模型: 'Loading model',
  '正在下载 · {got} / {total}': 'Downloading · {got} of {total}',
  '正在校验 · 核对文件没下坏': 'Verifying · checking the file is intact',
  本地模型用不了: 'Local model unavailable',
  没下成: 'Download failed',
  '下了一部分 · {got} / {total}': 'Partly downloaded · {got} of {total}',
  '已下的留着，接着下不从头来': 'What’s downloaded is kept; resuming won’t start over',
  还没下载: 'Not downloaded',
  '下好前，梦游判断走不了本地模型': 'Until it’s downloaded, dreaming can’t use the local model',
  继续下载: 'Resume download',
  '下载{size}': 'Download {size}',

  // ---------- 模型表的一句说明（shared/local-models.ts） ----------
  '中文好、判断稳，默认用它': 'Good at Chinese, steady judgments; the default',
  '小一档：下得快、占内存少，判断粗一些': 'One size smaller: faster download, less memory, rougher judgments',
}
