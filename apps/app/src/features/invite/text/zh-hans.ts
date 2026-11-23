import type { en } from './en.ts';

export const zhHans: typeof en = {
  title: '邀请链接',
  hint: '登录的人拿到链接就能加入，多少人拿到都可以，直到它过期或被你删除。被你移出的人也一样：想挡住谁，就把对方可能拿到的链接删掉。',
  newLink: '新建邀请链接',
  listLabel: '这个空间的邀请链接',
  empty: '还没有邀请链接。建一个，发给你想请进来的人。',
  joinsAs: {
    editor: '加入后是编辑者',
    viewer: '加入后是查看者'
  },
  expires: (date) => `${date} 过期`,
  created: '已建好邀请链接',
  copyLink: '复制链接',
  copyOf: '复制邀请链接',
  copyFailed: '浏览器不允许复制，请选中链接后手动复制。',
  remove: '删除',
  removeOf: '删除邀请链接',
  deleteTitle: '删除这个邀请链接？',
  deleteDescription: '链接立刻失效。已经用它加入的人仍然是成员。',
  cancel: '取消',

  joinTitle: '加入空间',
  joinDescription:
    '这个链接邀请你加入 Pocketmice 上的一个空间：一批文件，加上能进来的人。是哪个空间，加入之后才看得到。',
  join: '加入',
  joined: (name) => `你已加入「${name}」`,
  otherAccount: '换一个账号',
  deadTitle: '这个邀请链接用不了',
  deadDescription: '它已经过期，或者被空间的所有者删除了。请对方再给你一个。',
  toHome: '去我的空间'
};
