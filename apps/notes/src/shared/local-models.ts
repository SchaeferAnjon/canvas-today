/**
 * 本地模型（梦游判断「两篇是不是讲同一件事」的另一条路，不花订阅额度，task-h7oy8）：能选的几个模型。
 * 第一次用时下载到用户级缓存（main/local-llm），不进安装包。地址钉死 Hugging Face 的提交号，sha256 对不上就作废重下；
 * 备用地址是同一份文件的镜像（hf-mirror.com，国内连得上），校验同一个 sha256。
 * 换默认：改 DEFAULT_LOCAL_MODEL；加一个：照下面一行写，sha256 和 size 从 https://huggingface.co/api/models/<repo>/tree/<rev> 的 lfs.oid、size 抄。
 */

export interface LocalModel {
  id: string
  /** 下拉里的名字（模型名，不翻） */
  name: string
  /** 一句话说它的长处（界面字，过 t()） */
  note: string
  /** 文件名（存在缓存目录里就叫这个） */
  file: string
  /** 字节数 */
  size: number
  sha256: string
  /** 主地址、备用地址：主地址失败（连不上、不是 200/206）换下一个 */
  urls: string[]
  /** 这台 Mac 至少要多少内存（GB） */
  minRamGb: number
  /** 跑起来大约占多少内存（GB，模型 + 8k 上下文，2026-11-23 在 M 系列 Mac 上量的模型进程 RSS） */
  runGb: number
  /** 混合思考的模型（Qwen3 小号）：问的时候关掉思考，直接回 */
  thinks?: boolean
}

const hf = (repo: string, rev: string, file: string) => [`https://huggingface.co/${repo}/resolve/${rev}/${file}`, `https://hf-mirror.com/${repo}/resolve/${rev}/${file}`]

export const LOCAL_MODELS: readonly LocalModel[] = [
  {
    id: 'qwen3-4b-2507-q4km',
    name: 'Qwen3 4B Instruct 2507',
    note: '中文好、判断稳，默认用它',
    file: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    size: 2497281120,
    sha256: '3605803b982cb64aead44f6c1b2ae36e3acdb41d8e46c8a94c6533bc4c67e597',
    urls: hf('unsloth/Qwen3-4B-Instruct-2507-GGUF', 'a06e946bb6b655725eafa393f4a9745d460374c9', 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf'),
    minRamGb: 8,
    runGb: 3.9,
  },
  {
    id: 'qwen3-1.7b-q8',
    name: 'Qwen3 1.7B',
    note: '小一档：下得快、占内存少，判断粗一些',
    file: 'Qwen3-1.7B-Q8_0.gguf',
    size: 1834426016,
    sha256: '061b54daade076b5d3362dac252678d17da8c68f07560be70818cace6590cb1a',
    urls: hf('Qwen/Qwen3-1.7B-GGUF', '90862c4b9d2787eaed51d12237eafdfe7c5f6077', 'Qwen3-1.7B-Q8_0.gguf'),
    minRamGb: 8,
    runGb: 3,
    thinks: true,
  },
]

export const DEFAULT_LOCAL_MODEL = LOCAL_MODELS[0]!.id

export const localModel = (id: string): LocalModel | undefined => LOCAL_MODELS.find((m) => m.id === id)

export type LocalLlmPhase = 'missing' | 'downloading' | 'verifying' | 'ready' | 'loading' | 'error'

/** 本地模型现在怎样（主进程推给界面：window.cn.onLlm） */
export interface LocalLlmStatus {
  /** 选的哪个模型（LOCAL_MODELS 的 id） */
  model: string
  phase: LocalLlmPhase
  /** 下载、校验时：已经多少字节 / 一共多少 */
  got?: number
  total?: number
  /** 下载时的速度（字节每秒，最近几秒的平均） */
  speed?: number
  /** phase 是 error 时的一句人话；下载失败、取消后回到 missing 时也带着上一次为什么停 */
  error?: string
  /** 模型存在哪个文件夹 */
  dir: string
  /** 这台 Mac：内存（字节）、是不是 Apple 芯片 */
  ram: number
  appleSilicon: boolean
}
