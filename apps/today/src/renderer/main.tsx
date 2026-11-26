import '@cn/design/tokens.css'
import '@cn/design/themes.css'
import '@cn/design/wall.css'
import '@cn/design/sash.css'
import '@cn/calendar/calendar.css'
import './today.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { boot } from './store'
import { rootErrors, watchGlobalErrors } from './crash'

// 出错记进 main.log（同画布笔记 main.tsx）：没接住的异常、没人接的 Promise 失败、React 根的错（带组件栈）
watchGlobalErrors()
void boot().then(() => createRoot(document.getElementById('root')!, rootErrors('window')).render(<App />))
