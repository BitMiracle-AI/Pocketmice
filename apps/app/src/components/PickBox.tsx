import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cn } from 'cn';

// A list to pick from inside a dialog: the folders to move something into, the files a message may point at, the
// people of a new conversation. The box is a block of the quiet colour, and a row under the pointer is the white
// of the dialog, round at both ends as every row is.

/** The box. render gives the element when it is not a div (a ul); className gives its height */
export function PickBox({ className, render, ...props }: useRender.ComponentProps<'div'>) {
  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>({ className: cn('overflow-y-auto rounded-2xl bg-muted p-1.5', className) }, props),
    render
  });
}

/** One row of it. render gives the element: a button that leads on, a label around a box to tick, a plain li */
export function PickRow({ className, render, ...props }: useRender.ComponentProps<'div'>) {
  return useRender({
    defaultTagName: 'div',
    props: mergeProps<'div'>(
      {
        className: cn(
          'flex h-9 w-full min-w-0 items-center gap-3 rounded-full px-3 text-left outline-none hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/30',
          className
        )
      },
      props
    ),
    render
  });
}
