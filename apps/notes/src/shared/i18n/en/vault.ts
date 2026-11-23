/** 英文表：库语言、分类文件夹名那一批改到的界面字（shared/folder-home.ts 首页名字下面那一行、新建课程和项目时起名的报错） */
import { count, type Table } from '../core'

export const VAULT: Table = {
  // ---------- 文件夹首页名字下面那一行（shared/folder-home.ts 的 folderLead）：「分类 · 2门课 · 5篇 · 改于今天 22:46」 ----------
  '首页那一行::分类': 'Category',
  '首页那一行::文件夹': 'Folder',
  还没有文件: 'No files yet',
  '{n}讲': (p) => count(p.n, 'lecture'),

  // ---------- 新建一门课、一个项目时起名（shared/folder-home.ts 的 checkFolderName） ----------
  名字不能是空的: 'The name can’t be empty',
  '名字里不能有 / \\ :，也不能用点开头': 'Names can’t contain / \\ : or start with a dot',
  名字太长了: 'That name is too long',

  // ---------- 写进磁盘的名字（tv，跟库语言）：新建一门课的文件夹 ----------
  新的课程: 'New course',
}
