import { Add01Icon, Delete02Icon, MoreHorizontalIcon, ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { useState } from 'react';
import { CopyButton } from '@/components/CopyButton';
import { KeyMark } from '@/components/KeyMark';
import { Mouse } from '@/components/Mouse';
import { Page } from '@/components/Page';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { connectText } from '@/features/connect/text';
import { PageBar } from '@/features/shell/PageBar';
import { formatDate } from '@/lib/format';
import { type ApiKey, apiKeysQuery, hiddenKey, removeApiKey } from './apiKeys';
import { NewKeyDialog } from './NewKeyDialog';
import { apiKeyText } from './text';

// The person's API keys: what an agent calls the api with. They belong to the person and to no space, so this page
// is in the settings.
// A key is known here by the mark it has next to every file it writes (KeyMark). Copying is what a row is for and
// stays in sight; showing and deleting are in the menu of the row.

export function KeysPage() {
  const { data } = useSuspenseQuery(apiKeysQuery);
  const [creating, setCreating] = useState(false);
  // The keys that are written out in full. The others are shown by their first and last characters
  const [shown, setShown] = useState<ReadonlySet<string>>(new Set());
  const [removing, setRemoving] = useState<ApiKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  const show = (apiKeyId: string, on: boolean) =>
    setShown((current) => {
      const next = new Set(current);
      if (on) next.add(apiKeyId);
      else next.delete(apiKeyId);
      return next;
    });

  const remove = async () => {
    if (!removing || deleting) return;
    setDeleting(true);
    const problem = await removeApiKey(removing.id);
    setDeleting(false);
    setRemoving(null);
    if (problem !== null) toast.add({ type: 'error', title: problem });
  };

  return (
    <>
      <PageBar title={apiKeyText.title} />

      <Page>
        <Card>
          <CardHeader>
            <CardTitle>{apiKeyText.title}</CardTitle>
            <CardDescription>{apiKeyText.intro}</CardDescription>
            <CardAction>
              {/* On a narrow window the button keeps its icon and drops its words, which stay as its name */}
              <Button aria-label={apiKeyText.newKey} onClick={() => setCreating(true)}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                <span className="hidden sm:inline">{apiKeyText.newKey}</span>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {data.apiKeys.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia>
                    <Mouse />
                  </EmptyMedia>
                  <EmptyTitle>{apiKeyText.emptyTitle}</EmptyTitle>
                  <EmptyDescription>{apiKeyText.emptyDescription}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <ItemGroup aria-label={apiKeyText.listLabel}>
                {data.apiKeys.map((each) => (
                  <KeyRow
                    key={each.id}
                    apiKey={each}
                    shown={shown.has(each.id)}
                    onShow={(on) => show(each.id, on)}
                    onRemove={() => setRemoving(each)}
                  />
                ))}
              </ItemGroup>
            )}
          </CardContent>
          {/* What a key is made for: the page that says how an agent gets one. It keeps the way back the address has */}
          <CardFooter>
            <Button
              variant="link"
              className="px-0"
              nativeButton={false}
              render={<Link to="/settings/connect" search={true} />}
            >
              {connectText.title}
            </Button>
          </CardFooter>
        </Card>
      </Page>

      {/* A key that was just made is written out: the person made it to hand it to something */}
      <NewKeyDialog open={creating} onOpenChange={setCreating} onCreated={(made) => show(made.id, true)} />

      <AlertDialog open={removing !== null} onOpenChange={(open) => !open && !deleting && setRemoving(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{removing && apiKeyText.deleteTitle(removing.name)}</AlertDialogTitle>
            <AlertDialogDescription>{apiKeyText.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{apiKeyText.cancel}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={deleting} onClick={remove}>
              {deleting && <Spinner data-icon="inline-start" />}
              {apiKeyText.remove}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function KeyRow({
  apiKey,
  shown,
  onShow,
  onRemove
}: {
  apiKey: ApiKey;
  shown: boolean;
  onShow: (on: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <Item variant="muted" size="sm">
      <ItemMedia>
        <KeyMark />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>
          <span className="truncate">{apiKey.name}</span>
          <Badge variant="secondary">{apiKeyText.permissions[apiKey.permission]}</Badge>
        </ItemTitle>
        <ItemDescription className="line-clamp-1 flex items-baseline gap-2.5">
          <code className={cn('truncate font-mono', shown && 'text-foreground')}>
            {shown ? apiKey.key : hiddenKey(apiKey.key)}
          </code>
          <span className="shrink-0">{apiKeyText.created(formatDate(apiKey.createdAt))}</span>
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <CopyButton
          text={apiKey.key}
          label={apiKeyText.copyKey(apiKey.name)}
          // The key is written out, for the person to copy themselves
          onFailed={() => {
            onShow(true);
            toast.add({ type: 'error', title: apiKeyText.copyFailed });
          }}
        />

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label={apiKeyText.more(apiKey.name)} />}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuItem onClick={() => onShow(!shown)}>
              <HugeiconsIcon icon={shown ? ViewOffSlashIcon : ViewIcon} strokeWidth={2} />
              {shown ? apiKeyText.hide : apiKeyText.show}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
              {apiKeyText.remove}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ItemActions>
    </Item>
  );
}
