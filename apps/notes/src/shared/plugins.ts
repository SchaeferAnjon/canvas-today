/**
 * 内置插件（第一版不对外开放）：浏览器里的双语翻译、书签管家这类自己的功能，按插件的方式写。
 *
 * 一个插件最多三块，各放各的文件夹，靠插件 id 对上：
 * - main/plugins/<id>/       主进程：声明权限、注册界面和网页能调的方法（见 main/plugins/host.ts 的 MainPlugin）
 * - renderer/plugins/<id>/   界面：网页标签条右边的按钮、弹窗、⌘F 面板里的命令、设置页里的一块（见 renderer/plugins/types.ts）
 * - preload/plugins/<id>.ts  网页里：跑在 webview 预加载的隔离环境，网页脚本碰不到（可选）
 * 主进程只给插件它声明了的权限：没声明「写笔记」拿不到库，没声明「联网」不能问 AI。
 * ParaRead 以后也按这个接：写一个 MainPlugin + 一个 RendererPlugin，放进两边的列表。
 */

/** 插件能要的权限 */
export type PluginPermission = 'notes:read' | 'notes:write' | 'net' | 'page'

export const PERMISSION_LABEL: Record<PluginPermission, string> = {
  'notes:read': '读笔记',
  'notes:write': '写笔记',
  net: '联网',
  page: '读改当前网页',
}

export interface PluginManifest {
  id: string
  name: string
  /** 一句话说明，插件面板里显示 */
  description: string
  permissions: PluginPermission[]
  /** 右边竖条上的一格（在「网页」下面）：点开右栏打开 url，已经开着这个网站就切过去；插件关着时不出现 */
  entry?: { name: string; icon: string; url: string }
}

/** 界面拿到的一个插件：说明 + 开没开 + 设置 */
export interface PluginInfo extends PluginManifest {
  enabled: boolean
  settings: Record<string, unknown>
}

/** 网页预加载拿到的：每个插件开没开、设置是什么 */
export type PageState = Record<string, { enabled: boolean; settings: Record<string, unknown> }>

/** preload 按这个暴露成 window.cnPlugins */
export interface CnPluginsApi {
  list(): Promise<PluginInfo[]>
  setEnabled(id: string, enabled: boolean): Promise<PluginInfo[]>
  setSettings(id: string, patch: Record<string, unknown>): Promise<PluginInfo[]>
  /** 调插件在主进程注册的方法 */
  call<T = unknown>(id: string, method: string, ...args: unknown[]): Promise<T>
  /** 插件开关或设置变了 */
  onChanged(cb: (list: PluginInfo[]) => void): () => void
  /** 插件主进程发来的事件 */
  on(id: string, event: string, cb: (payload: unknown) => void): () => void
}
