import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Brand } from './Brand';
import { Pocket } from './Pocket';

/**
 * A page that is one card, in the middle of the frame, with the name of the product in the corner. The card is
 * the pocket the mouse looks out of (Pocket). title and description say what the card is for, children is what
 * the person fills in or presses, and foot is the quiet line under the card.
 * Signing in, signing up, joining a space and making the first one are such pages.
 */
export function CardPage({
  title,
  description,
  children,
  foot
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <div className="on-frame flex min-h-svh flex-col">
      <header className="flex h-16 shrink-0 items-center px-4 lg:px-6">
        <Brand />
      </header>
      {/* The room above the card is the mouse's; as much is left under it, and the bar's height more, so that
          the card is in the middle of the page */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 pt-24 pb-40">
        <div className="flex w-full max-w-sm flex-col gap-6">
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
