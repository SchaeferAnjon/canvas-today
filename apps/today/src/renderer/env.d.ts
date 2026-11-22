declare module '*.css'
/** 和画布笔记共用的图（electron.vite.config.ts 的 @notes-assets） */
declare module '@notes-assets/*' {
  const url: string
  export default url
}
declare module '*?raw' {
  const text: string
  export default text
}
