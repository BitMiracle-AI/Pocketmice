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
  ui: {
    close: '关闭',
    more: '更多',
    loading: '加载中',
    copy: '复制',
    copied: '已复制',
    breadcrumb: '面包屑',
    pagination: '分页',
    previous: '上一页',
    next: '下一页',
    previousPage: '上一页',
    nextPage: '下一页',
    morePages: '更多页',
    carousel: '轮播',
    slide: '幻灯片',
    previousSlide: '上一张',
    nextSlide: '下一张',
    scrollToStart: '滚动到开头',
    scrollToEnd: '滚动到末尾',
    sidebar: '侧边栏',
    sidebarDescription: '在小屏幕上显示侧边栏',
    toggleSidebar: '切换侧边栏',
    commandPalette: '命令面板',
    commandPaletteDescription: '搜索要执行的命令'
  },
  somethingWentWrong: '出了点问题',
  tryAgain: '重试',
  notFoundTitle: '没有这个页面',
  notFoundDescription: '这个地址上什么都没有。',
  toHome: '去我的文件'
};
