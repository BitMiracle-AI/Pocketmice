import type { en } from './en.ts';

export const zhHans: typeof en = {
  upload: '上传',
  newFolder: '新建文件夹',
  viewOnly: '仅查看',
  viewOnlyHint: '你在这个空间里是查看者：可以打开和下载，不能改动。',
  name: '名称',
  writtenBy: '最后写入',
  modified: '修改时间',
  size: '大小',
  viaKey: (person, key) => `由 Agent 写入，用的是 ${person} 的 API key「${key}」。`,
  summary: (folders, files) =>
    [folders > 0 && `${folders} 个文件夹`, files > 0 && `${files} 个文件`].filter(Boolean).join('，'),
  emptyFolder: '这个文件夹是空的',
  emptySpace: '还没有文件',
  emptyHint: '把文件上传到这里，或者让 Agent 写进来。',
  emptyHintViewer: '这里还没有放东西。',
  download: (name) => `下载 ${name}`,
  fileGone: '这个文件已经不在这里了。',

  folderTitle: '新建文件夹',
  folderNameLabel: '名称',
  folderPlaceholder: '未命名文件夹',
  folderCreate: '创建',
  cancel: '取消',
  nameMissing: '请填写名称。',
  nameInvalid: '名称里不能有 /，也不能是 . 或 ..',
  nameTaken: '这个文件夹里已经有同名的了。',
  parentGone: '要放进去的那个文件夹已经不在了。',

  goneTitle: '没有这个文件夹',
  goneDescription: '这个地址上没有文件夹，它可能已经被移到回收站。',
  toFiles: '去这个空间的文件'
};
