/** The sentences of signing in, signing up and signing out, in English. This file says which sentences there are */
export const en = {
  signInTitle: 'Sign in to Pocketmice',
  email: 'Email',
  emailInvalid: 'Enter an email address, like name@example.com.',

  // With a code
  codeIntro:
    'Enter your email address and we will send you a code. There is no password, and a new address gets its account here.',
  sendCode: 'Send code',
  codeTitle: 'Enter the code',
  codeSent: (email: string, digits: number, minutes: number) =>
    `We sent a ${digits}-digit code to ${email}. It works for ${minutes} minutes.`,
  codeLabel: 'Code',
  /** Under the boxes while the code that was entered is being checked */
  checkingCode: 'Checking the code',
  newCode: 'Send a new code',
  newCodeSent: (email: string) => `A new code is on its way to ${email}`,
  otherEmail: 'Use another address',

  // With a password
  passwordIntro: 'Welcome back.',
  password: 'Password',
  passwordMissing: 'Enter your password.',
  signIn: 'Sign in',
  newHere: 'New here?',
  toSignUp: 'Create an account',

  signUpTitle: 'Create your account',
  signUpIntro: 'One account for every space you are invited to.',
  name: 'Name',
  nameHint: 'What the other people in your spaces see.',
  nameMissing: 'Enter a name.',
  passwordHint: (characters: number) => `At least ${characters} characters.`,
  passwordShort: (characters: number) => `Use at least ${characters} characters.`,
  signUp: 'Create account',
  haveAccount: 'Already have an account?',
  toSignIn: 'Sign in',

  signedInAs: (email: string) => `Signed in as ${email}`,
  signOut: 'Sign out',
  /** What is asked before signing out, and the way not to */
  signOutTitle: 'Sign out?',
  signOutDescription: 'You sign in again to come back.',
  cancel: 'Cancel',

  /** What to tell a person when signing in is refused: one sentence for each code an address or operation lists */
  failures: {
    INVALID_EMAIL_OR_PASSWORD: 'Wrong email or password.',
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'This address already has an account. Sign in instead.',
    INVALID_OTP: 'That code is not right. Check it and try again.',
    OTP_EXPIRED: 'That code is too old. Send a new one.',
    TOO_MANY_ATTEMPTS: 'That code was entered wrong too many times. Send a new one.',
    /** Signing in or signing up was tried too often */
    TOO_MANY_TRIES: 'Too many tries. Wait a minute and try again.',
    /** Codes were asked for too often */
    TOO_MANY_CODES: 'Too many codes were asked for. Try again later.',
    CODE_NOT_SENT: 'The mail with the code could not be sent. Try again in a moment.'
  },

  /**
   * The line Pocketmice goes by, beside the card a person signs in or signs up in. It is said in English in every
   * language, as the name is
   */
  slogan: 'Human & Agent, One Team.',
  /** What kind of thing Pocketmice is, in one line under that */
  tagline: 'The open-source workspace for the next generation of teams.'
};
