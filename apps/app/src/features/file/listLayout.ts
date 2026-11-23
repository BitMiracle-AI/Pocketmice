// How a list of files is laid out. The folder page and the trash show the same kind of thing and look the same:
// no lines between the rows, one line of type per row, and the buttons of a row at its end.

/**
 * The columns of a list: the name takes what is left, then one wide column, one of medium width, one narrow for a
 * size, and what can be done with the row. They go by the width of the list, not of the window: the sidebar may be
 * open or away. A list that is narrow drops the wide one first, then the medium one, then the size.
 */
export const COLUMNS =
  'grid grid-cols-[minmax(0,1fr)_3.625rem] items-center gap-x-5 px-3 @lg:grid-cols-[minmax(0,1fr)_4.5rem_3.625rem] @2xl:grid-cols-[minmax(0,1fr)_8.5rem_4.5rem_3.625rem] @4xl:grid-cols-[minmax(0,1fr)_16rem_8.5rem_4.5rem_3.625rem]';
export const WIDE = 'hidden min-w-0 @4xl:flex';
export const MEDIUM = 'hidden truncate @2xl:block';
export const SIZE = 'hidden text-right @lg:block';

/** The line of the list that names its columns */
export const HEAD = 'h-9 border-b text-xs font-medium text-muted-foreground';

/** One row. It is a group, for its buttons to go by */
export const ROW = 'group/row relative h-10 rounded-xl text-sm hover:bg-muted/70';

/**
 * A button at the end of a row. Where a pointer can hover, it shows when the row is pointed at, when it has the
 * focus, and while the menu it opens is open; on a touch screen it is always there. It is above the link that
 * covers the row of a folder.
 */
export const ROW_BUTTON =
  'relative z-10 text-muted-foreground group-hover/row:opacity-100 hover:bg-foreground/8 focus-visible:opacity-100 data-popup-open:opacity-100 [@media(hover:hover)]:opacity-0';
