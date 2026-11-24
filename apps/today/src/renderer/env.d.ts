declare module '*.css'
declare module '*.png' {
  const url: string
  export default url
}
/** 和画布笔记共用的图（electron.vite.config.ts 的 @notes-assets） */
declare module '@notes-assets/*' {
  const url: string
  export default url
}
/** 引擎标志（electron.vite.config.ts 的 @ai-chat-assets，在 packages/ai-chat） */
declare module '@ai-chat-assets/*' {
  const url: string
  export default url
}
declare module '*?raw' {
  const text: string
  export default text
}
