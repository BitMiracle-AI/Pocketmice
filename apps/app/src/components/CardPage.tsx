import { cn } from 'cn';
import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Brand } from './Brand';
import { Pocket } from './Pocket';

/** What the product says of itself to someone who is not in yet: the line it goes by, and what kind of thing it is */
export type Pitch = { slogan: string; tagline: string };

/**
 * A page that is one card, in the middle of the frame. The card is the pocket the mouse looks out of (Pocket).
 * title and description say what the card is for, children is what the person fills in or presses, and foot is
 * the quiet line under the card.
 * Signing in, signing up, joining a space and making the first one are such pages. The first two are where
 * someone meets the product, and say its pitch: beside the card on a wide page, above it on a narrow one. The
 * other two have the name of the product in the corner, which leads to the start; a page that says the pitch has
 * nothing there.
 */
export function CardPage({
  title,
  description,
  children,
  foot,
  pitch
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  pitch?: Pitch;
}) {
  return (
    <div className="on-frame flex min-h-svh flex-col">
      {!pitch && (
        <header className="flex h-16 shrink-0 items-center px-4 lg:px-6">
          <Brand />
        </header>
      )}
      {/* The room above the card is the mouse's; as much is left under it, and under a bar the bar's height
          more, so that the card is in the middle of the page. Between a pitch and the card under it the mouse
          has that room too */}
      <div
        className={cn(
          'flex flex-1 flex-col items-center justify-center gap-x-20 gap-y-28 px-6 lg:flex-row xl:gap-x-28',
          pitch ? 'py-16 lg:py-24' : 'pt-24 pb-40'
        )}
      >
        {pitch && (
          <div className="flex flex-col items-center gap-3 text-center lg:items-start lg:gap-6 lg:text-left">
            {/* As wide as its longer half, so that it breaks after the comma. The line is English on a Chinese
                page too, and is spaced as Latin letters are there: tracking-tight is none on that page */}
            <p className="max-w-[8.5em] font-heading text-4xl leading-[1.05] font-extrabold tracking-[-0.02em] text-balance sm:text-5xl lg:text-6xl xl:text-7xl">
              {pitch.slogan}
            </p>
            <p className="max-w-md font-medium text-balance text-muted-foreground lg:max-w-xl lg:text-xl">
              {pitch.tagline}
            </p>
          </div>
        )}
        <div className="flex w-full max-w-sm shrink-0 flex-col gap-6">
          <Pocket>
            {/* What is typed into and what is pressed on such a card is larger than on a page of work */}
            <Card className="[--card-spacing:--spacing(8)] **:data-[slot=input]:h-11 **:data-[slot=input]:px-5 [&_button[type=submit]]:h-11 [&_button[type=submit]]:text-[0.9375rem]">
              <CardHeader>
                <CardTitle className="text-2xl">
                  <h1>{title}</h1>
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
              <CardContent>{children}</CardContent>
            </Card>
          </Pocket>
          {foot}
        </div>
      </div>
    </div>
  );
}
