import type { CnFamilyApi } from '../../../notes/src/shared/family'

declare global {
  interface Window {
    /** 设置 › 软件家族（画布笔记的 main/family.ts、preload/family.ts） */
    cnFamily: CnFamilyApi
  }
}
