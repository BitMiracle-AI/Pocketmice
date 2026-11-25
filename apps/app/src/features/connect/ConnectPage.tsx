import { Add01Icon, Copy01Icon, Key01Icon, Tick02Icon, ViewIcon, ViewOffSlashIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Code } from '@/components/Code';
import { CopyButton } from '@/components/CopyButton';
import { Page } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemActions, ItemContent, ItemTitle } from '@/components/ui/item';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/toast';
import { type ApiKey, apiKeysQuery, hiddenKey } from '@/features/apiKey/apiKeys';
import { NewKeyDialog } from '@/features/apiKey/NewKeyDialog';
import { apiKeyText } from '@/features/apiKey/text';
import { PageBar } from '@/features/shell/PageBar';
import { PageWaiting } from '@/features/shell/PageWaiting';
import { useCopy } from '@/hooks/useCopy';
import { apiUrl } from '@/lib/api';
import { commonText } from '@/lib/text';
import { keyToHand, NO_KEY, SKILL_URL, variableLines } from './setup';
import { connectText } from './text';

// How a person gets their agent to use the drive, in three steps: a key, a message to send the agent, and
// something to ask it. The message is all the agent needs: where the skill is, the address of this server, and the
// key. It asks the agent to keep the last two, so the person sends it once.
// It is about the person's keys and about no space, so this page is in the settings.
// The key is hidden in the message as it is on the page of the keys, and copying copies it as it is. While it is
// hidden the message cannot be selected: selected and copied by hand, it would carry a key that works nowhere.

export function ConnectPage() {
  // What the page hands over is one of the person's keys
  const keys = useQuery(apiKeysQuery);
  if (!keys.data) return <PageWaiting title={connectText.title} reads={[keys]} />;
  return <Connect apiKeys={keys.data.apiKeys} />;
}

function Connect({ apiKeys }: { apiKeys: readonly ApiKey[] }) {
  // The key the person picked. While they have picked none, or the one they picked is gone, it is their newest
  const [picked, setPicked] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [shown, setShown] = useState(false);

  const apiKey = keyToHand(apiKeys, picked);
  const message = (key: string) => connectText.message(SKILL_URL, variableLines(apiUrl('/'), key));
  const { copied, copy } = useCopy(message(apiKey?.key ?? NO_KEY), () => {
    // The key is written out, for the person to select the message and copy it themselves
    setShown(true);
    toast.add({ type: 'error', title: connectText.copyFailed });
  });

  return (
    <>
      <PageBar title={connectText.title} />

      <Page>
        <Card>
          <CardHeader>
            <CardTitle>{connectText.keyTitle}</CardTitle>
            <CardDescription>{connectText.keyHint}</CardDescription>
            {apiKey !== null && (
              <CardAction>
                {/* On a narrow window the button keeps its icon and drops its words, which stay as its name */}
                <Button variant="secondary" aria-label={connectText.newKey} onClick={() => setCreating(true)}>
                  <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                  <span className="hidden sm:inline">{connectText.newKey}</span>
                </Button>
              </CardAction>
            )}
          </CardHeader>
          <CardContent>
            {apiKey === null ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={Key01Icon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>{connectText.noKeyTitle}</EmptyTitle>
                  <EmptyDescription>{connectText.noKeyDescription}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => setCreating(true)}>
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={2} data-icon="inline-start" />
                    {connectText.newKey}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <Select
                value={apiKey.id}
                items={apiKeys.map((each) => ({
                  value: each.id,
                  label: connectText.keyOption(each.name, apiKeyText.permissions[each.permission])
                }))}
                onValueChange={(id) => setPicked(id)}
              >
                <SelectTrigger aria-label={connectText.keyLabel} className="w-full sm:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false}>
                  <SelectGroup>
                    {apiKeys.map((each) => (
                      <SelectItem key={each.id} value={each.id}>
                        {connectText.keyOption(each.name, apiKeyText.permissions[each.permission])}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{connectText.messageTitle}</CardTitle>
            <CardDescription>{apiKey === null ? connectText.messageNeedsKey : connectText.messageHint}</CardDescription>
            <CardAction className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                disabled={apiKey === null}
                aria-label={shown ? apiKeyText.hide : apiKeyText.show}
                title={shown ? apiKeyText.hide : apiKeyText.show}
                onClick={() => setShown(!shown)}
              >
                <HugeiconsIcon icon={shown ? ViewOffSlashIcon : ViewIcon} strokeWidth={2} />
              </Button>
              <Button disabled={apiKey === null} aria-label={commonText.ui.copy} onClick={copy}>
                <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} strokeWidth={2} data-icon="inline-start" />
                <span className="hidden sm:inline">{copied ? commonText.ui.copied : commonText.ui.copy}</span>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {/* biome-ignore lint/a11y/useSemanticElements: a fieldset is for the fields of a form, and this is text to read */}
            <div role="group" aria-label={connectText.messageLabel}>
              <Code
                text={message(apiKey === null ? NO_KEY : shown ? apiKey.key : hiddenKey(apiKey.key))}
                language={null}
                className={apiKey !== null && shown ? undefined : 'select-none'}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{connectText.tryTitle}</CardTitle>
            <CardDescription>{connectText.tryHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <Item variant="muted" size="sm">
              <ItemContent>
                {/* It can be selected: that is how it is copied when the browser keeps the clipboard from the page */}
                <ItemTitle className="select-text">{connectText.tryPrompt}</ItemTitle>
              </ItemContent>
              <ItemActions>
                <CopyButton
                  text={connectText.tryPrompt}
                  label={connectText.copyPrompt}
                  onFailed={() => toast.add({ type: 'error', title: connectText.promptCopyFailed })}
                />
              </ItemActions>
            </Item>
          </CardContent>
        </Card>
      </Page>

      {/* A key made here is the one the message carries from then on */}
      <NewKeyDialog open={creating} onOpenChange={setCreating} onCreated={(made) => setPicked(made.id)} />
    </>
  );
}
