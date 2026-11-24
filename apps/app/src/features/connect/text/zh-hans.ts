import type { en } from './en.ts';

export const zhHans: typeof en = {
  title: '接入 Agent',

  keyTitle: '1. 选一把 key',
  keyHint: 'Agent 用你的 key 调用 Pocketmice。它做的事都算你做的，你在哪些空间，它就能进哪些空间。',
  keyLabel: '交给 Agent 的 key',
  keyOption: (name, permission) => `${name} · ${permission}`,
  newKey: '新建 key',
  noKeyTitle: '还没有 API key',
  noKeyDescription: '新建一把 key，给你的 Agent 调用 Pocketmice 用。',

  messageTitle: '2. 把这段话发给你的 Agent',
  messageHint:
    '它告诉能运行命令的 Agent：Pocketmice 的 Skill 在哪、调用哪台服务器、用哪把 key。这段话里有你的 key，只发给你自己的 Agent。',
  messageNeedsKey: '这段话里要带上 key，先新建一把。',
  message: (skill, variables) =>
    `请安装这个 Skill，用它读写我的 Pocketmice 网盘里的文件：\n${skill}\n\n把下面两个值存成环境变量，让你以后的对话也用得上：\n${variables}`,
  messageLabel: '发给 Agent 的话',
  copyFailed: '浏览器不允许复制，key 已经显示出来，请选中这段话后手动复制。',

  tryTitle: '3. 试一下',
  tryHint: '问它一件只有网盘答得上来的事。',
  tryPrompt: '列出我在 Pocketmice 里的空间。',
  copyPrompt: '复制这句话',
  promptCopyFailed: '浏览器不允许复制，请选中这句话后手动复制。'
};
