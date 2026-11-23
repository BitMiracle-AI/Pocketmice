import type { en } from './en.ts';

// A failure and a hint are one sentence: what happened, a comma, what to do, and one full stop. A title, the line
// under a title, a button and a label end without one.
export const zhHans: typeof en = {
  failures: {
    INVALID_INPUT: '服务器没有接受这次请求，请刷新页面后重试。',
    INPUT_TOO_LARGE: '内容太大，服务器不接收。',
    UNAUTHENTICATED: '登录已失效，请重新登录后再试。',
    FORBIDDEN: '你没有权限这样做。',
    UNKNOWN_SPACE: '这个空间不存在，或者你已经不是它的成员。',
    UNKNOWN_OPERATION: '页面和服务器的版本对不上，请刷新页面后重试。',
    INTERNAL: '服务器出了问题，请稍后重试。',
    UNREACHABLE: '连不上服务器，请检查网络后重试。',
    BAD_RESPONSE: '服务器的回答页面读不懂，请刷新页面后重试。',
    UNEXPECTED: '页面出了问题，请刷新后重试。'
  },
  somethingWentWrong: '出了点问题',
  tryAgain: '重试',
  notFoundTitle: '没有这个页面',
  notFoundDescription: '这个地址上什么都没有。',
  toHome: '去我的文件',
  serverReached: (version) => `已连上服务器，版本 ${version}。`
};
