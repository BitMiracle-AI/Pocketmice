import type { ClientErrorCode } from '@pocketmice/client/api';
import type { UniversalErrorCode } from '@pocketmice/contract/errors';

/** The sentences of the code every page shares, in English. This file says which sentences there are */
export const en = {
  /**
   * What to tell a person when a call fails with a code any call may fail with. A code that only some operations
   * answer with gets its sentence where the operation is called: what it means depends on what was asked.
   */
  failures: {
    INVALID_INPUT: 'The server did not accept that. Reload the page and try again.',
    INPUT_TOO_LARGE: 'That is too large for the server to take.',
    UNAUTHENTICATED: 'You are signed out. Sign in and try again.',
    FORBIDDEN: 'You are not allowed to do that.',
    UNKNOWN_SPACE: 'That space does not exist, or you are no longer a member of it.',
    UNKNOWN_OPERATION: 'This page is out of step with the server. Reload the page and try again.',
    INTERNAL: 'The server ran into a problem. Try again in a moment.',
    UNREACHABLE: 'Could not reach the server. Check your connection and try again.',
    BAD_RESPONSE: 'The server gave an answer this page cannot read. Reload the page and try again.',
    UNEXPECTED: 'Something went wrong on this page. Reload it and try again.'
  } satisfies Record<UniversalErrorCode | ClientErrorCode, string>,
  /** The few words the components of shadcn say themselves, most of them to a screen reader */
  ui: {
    close: 'Close',
    more: 'More',
    loading: 'Loading',
    copy: 'Copy',
    copied: 'Copied',
    breadcrumb: 'Breadcrumb',
    pagination: 'Pagination',
    previous: 'Previous',
    next: 'Next',
    previousPage: 'Go to previous page',
    nextPage: 'Go to next page',
    morePages: 'More pages',
    carousel: 'carousel',
    slide: 'slide',
    previousSlide: 'Previous slide',
    nextSlide: 'Next slide',
    scrollToStart: 'Scroll to start',
    scrollToEnd: 'Scroll to end',
    sidebar: 'Sidebar',
    sidebarDescription: 'Shows the sidebar on a small screen.',
    toggleSidebar: 'Toggle sidebar',
    commandPalette: 'Command palette',
    commandPaletteDescription: 'Search for a command to run'
  },
  somethingWentWrong: 'Something went wrong',
  tryAgain: 'Try again',
  notFoundTitle: 'Page not found',
  notFoundDescription: 'There is nothing at this address.',
  toHome: 'Go to your files',
  serverReached: (version: string) => `Connected to the server, version ${version}.`
};
