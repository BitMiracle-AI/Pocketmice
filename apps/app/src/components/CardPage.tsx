import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Brand } from './Brand';

/**
 * A page that is one card, as shadcn's sign-in block is: the name of the product over the card, in the middle of
 * the page. title and description say what the card is for, children is what the person fills in or presses, and
 * foot is the quiet line under the card.
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
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Brand />
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">
              <h1>{title}</h1>
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {foot}
      </div>
    </div>
  );
}
