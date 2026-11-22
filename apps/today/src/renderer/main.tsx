import '@cn/design/tokens.css'
import '@cn/design/themes.css'
import '@cn/calendar/calendar.css'
import './today.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { boot } from './store'

void boot().then(() => createRoot(document.getElementById('root')!).render(<App />))
