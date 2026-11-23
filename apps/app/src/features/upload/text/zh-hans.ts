import type { en } from './en.ts';

export const zhHans: typeof en = {
  uploading: (count) => `正在上传 ${count} 个文件`,
  needDecision: (count) => `${count} 个文件等你决定`,
  notUploaded: (count) => `${count} 个文件没有传上去`,
  uploaded: (count) => `已上传 ${count} 个文件`,
  close: '关闭',
  waiting: '等待中',
  cancel: (name) => `取消上传 ${name}`,
  dismiss: (name) => `把 ${name} 从列表里去掉`,
  doneAsFile: '已上传',
  doneAsVersion: '已存为新版本',
  taken: '这里已经有同名文件。',
  takenByFolder: '这里已经有同名文件夹。',
  asVersion: '存为新版本',
  keepBoth: '两个都保留',
  skip: '跳过',
  tryAgain: '重试',
  tooLarge: (most) => `超过了 ${most}，单个文件最大就是这么多。`,
  folderGone: '要放进去的那个文件夹已经不在了。',
  changedMeanwhile: '上传的时候这个文件被改过了，请重试。',
  spaceNoRoom: '空间放不下这个文件。空间的所有者可以腾出地方，或者调高上限。',
  memberNoRoom: '这个文件会让你超出在这个空间里的存储上限。空间的所有者可以调高它。',
  leaving: '还有文件正在上传。'
};
