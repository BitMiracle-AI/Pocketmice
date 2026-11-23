import type { en } from './en.ts';

export const zhHans: typeof en = {
  roles: { owner: '所有者', editor: '编辑者', viewer: '查看者' },
  spacesTitle: '空间',
  spacesLabel: '你的空间',
  newSpace: '新建空间',
  dialogTitle: '新建空间',
  whatASpaceIs: '空间是一批文件，加上能进来的人。',
  nameLabel: '名称',
  namePlaceholder: '产品调研',
  nameMissing: '请给空间起个名字。',
  create: '创建空间',
  cancel: '取消',
  firstTitle: '创建你的第一个空间',
  firstDescription: '空间是一批文件，加上能进来的人。以后可以再建，每个空间各自邀请人。',
  roleHints: {
    editor: '可以添加、修改和删除文件。',
    viewer: '可以打开和下载文件，不能改动。'
  },

  membersHints: {
    owner: '能进这个空间的人，以及每个人能做什么。这两件事由你决定。',
    editor: '能进这个空间的人，以及每个人能做什么。这两件事由所有者决定。',
    viewer: '能进这个空间的人，以及每个人能做什么。这两件事由所有者决定。'
  },
  membersLabel: '这个空间的成员',
  you: '你',
  changeRole: (name) => `修改 ${name} 的角色`,
  removeMember: '移出空间',
  removeTitle: (name) => `把 ${name} 移出这个空间？`,
  removeDescription:
    '对方将看不到这个空间里的任何东西，用对方的 API key 调用的 Agent 也一样。如果对方手里还有有效的邀请链接，仍然可以再进来。',
  remove: '移出',
  memberGone: '对方已经不是这个空间的成员了。',
  ownerStays: '所有者的角色不能改，所有者也不能被移出。',
  leave: '退出空间',
  leaveTitle: (name) => `退出「${name}」？`,
  leaveDescription:
    '你将看不到这个空间里的任何东西，用你的 API key 调用的 Agent 也一样。想再进来，需要所有者给你邀请链接。',
  ownerCannotLeave: '空间的所有者不能退出。',
  left: (name) => `你已退出「${name}」`,

  settingsTitle: '空间设置',
  settingsHint: '这个空间叫什么、最多能放多少，以及删除它。这些只有你作为所有者能做。',
  settingsOwnerOnly: '只有这个空间的所有者能给它改名、设存储上限或删除它。',
  renameHint: '每个成员都按这个名字找到这个空间。',
  renamed: '空间已改名',
  deleteSpaceTitle: '删除这个空间',
  deleteSpaceHint: '里面的每个文件连同它的所有版本都会被删除，成员和邀请链接也一样。删除后无法恢复。',
  deleteSpace: '删除空间',
  deleteSpaceAsk: (name) => `删除「${name}」？`,
  deleteSpaceTypeLabel: '输入空间的名称以确认',
  deletedSpace: (name) => `已删除「${name}」`,

  storageTitle: '存储',
  spaceHolds: (size) => `这个空间已占用 ${size}，没有设存储上限。`,
  spaceHoldsOf: (size, limit) => `这个空间已占用 ${size}，上限 ${limit}。`,
  limitLabel: '存储上限',
  noLimit: '不限',
  limitUnit: '单位',
  spaceLimitHint: '这个空间最多能放多少。每个文件的每个版本都算，旧版本和回收站里的也算。留空就是不限。',
  limitInvalid: '请填一个数，比如 10 或 1.5；留空就是不限。',
  limitSaved: '存储上限已保存',

  unknownTitle: '没有这个空间',
  unknownDescription: '这个地址上没有空间，或者你不是它的成员。'
};
