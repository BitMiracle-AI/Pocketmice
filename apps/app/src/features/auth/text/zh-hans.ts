import type { en } from './en.ts';

export const zhHans: typeof en = {
  signInTitle: '登录 Pocketmice',
  email: '邮箱',
  emailInvalid: '请填写邮箱地址，例如 name@example.com。',

  codeIntro: '填写邮箱，我们给你发一个验证码。不需要密码；第一次用的邮箱会在这里建好账号。',
  sendCode: '发送验证码',
  codeTitle: '输入验证码',
  codeSent: (email, digits, minutes) => `${digits} 位验证码已发到 ${email}，${minutes} 分钟内有效。`,
  codeLabel: '验证码',
  checkingCode: '正在验证',
  newCode: '重新发送',
  newCodeSent: (email) => `新的验证码已发到 ${email}`,
  otherEmail: '换一个邮箱',

  passwordIntro: '欢迎回来。',
  password: '密码',
  passwordMissing: '请填写密码。',
  signIn: '登录',
  newHere: '还没有账号？',
  toSignUp: '注册',

  signUpTitle: '创建账号',
  signUpIntro: '一个账号，进得了每一个邀请你的空间。',
  name: '名字',
  nameHint: '空间里的其他人看到的名字。',
  nameMissing: '请填写名字。',
  passwordHint: (characters) => `至少 ${characters} 个字符。`,
  passwordShort: (characters) => `密码至少要 ${characters} 个字符。`,
  signUp: '创建账号',
  haveAccount: '已有账号？',
  toSignIn: '登录',

  signedInAs: (email) => `当前登录：${email}`,
  signOut: '退出登录',
  signOutTitle: '退出登录？',
  signOutDescription: '退出后要重新登录才能回来。',
  cancel: '取消',

  failures: {
    INVALID_EMAIL_OR_PASSWORD: '邮箱或密码不正确。',
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: '这个邮箱已经有账号了，请直接登录。',
    INVALID_OTP: '验证码不对，请核对后再试。',
    OTP_EXPIRED: '验证码已过期，请重新发送。',
    TOO_MANY_ATTEMPTS: '验证码输错的次数太多，请重新发送。',
    TOO_MANY_TRIES: '尝试的次数太多，请过一分钟再试。',
    TOO_MANY_CODES: '验证码要得太频繁，请稍后再试。',
    CODE_NOT_SENT: '验证码邮件没有发出去，请稍后再试。'
  },

  slogan: 'Human & Agent, One Team.',
  tagline: '下一代开源人机协作办公平台'
};
