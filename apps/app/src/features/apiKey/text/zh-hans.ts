import type { en } from './en.ts';

export const zhHans: typeof en = {
  title: 'API key',
  intro:
    'Agent 用你的 key 调用 Pocketmice。它做的事都算你做的，你在哪些空间，它就能进哪些空间。任何 key 都不能管理成员、邀请和 key，也不能彻底删除东西。',
  newKey: '新建 key',
  permissions: { write: '读写', read: '只读' },
  permissionHints: { write: '能读文件，也能改。', read: '只能读文件，什么都不改。' },
  created: (date) => `创建于 ${date}`,
  listLabel: '你的 API key',
  copy: '复制',
  copied: '已复制',
  copyKey: (name) => `复制 key ${name}`,
  copyFailed: '浏览器不允许复制，key 已经显示出来，请选中后手动复制。',
  more: (name) => `key ${name} 的更多操作`,
  show: '显示 key',
  hide: '隐藏 key',
  remove: '删除',
  deleteTitle: (name) => `删除「${name}」？`,
  deleteDescription: '用这把 key 的程序会立刻失效，删除后无法恢复。',
  cancel: '取消',
  emptyTitle: '还没有 API key',
  emptyDescription: '新建一把 key，交给你的 Agent。',
  dialogTitle: '新建 API key',
  nameLabel: '名称',
  namePlaceholder: 'research-agent',
  nameHint: '这把 key 写的每个文件旁边都会显示它。',
  nameMissing: '请给 key 起个名字。',
  permissionLabel: '权限',
  create: '创建 key',
  createdToast: (name) => `已创建「${name}」`
};
