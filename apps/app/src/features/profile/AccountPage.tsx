import { PROFILE_NAME_MAX_LENGTH } from '@pocketmice/contract/domains/profile';
import { type FormEvent, useState } from 'react';
import { Page, PageHead } from '@/components/Page';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { MainBar } from '@/features/shell/MainBar';
import { shellText } from '@/features/shell/text';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { changeName } from './profile';
import { profileText } from './text';

// The person's account: the name they go by, which they change here, and the address they sign in with, which is
// shown and not changed. It belongs to the person and to no space, so this page is in the settings.

export function AccountPage() {
  const user = useCurrentUser();
  const [name, setName] = useState(user.name);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unchanged = name.trim() === user.name;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || unchanged) return;
    setBusy(true);
    const failed = await changeName(name);
    setBusy(false);
    if (failed !== null) return setProblem(failed);
    // What the field holds is the name as it was taken: without the spaces around it
    setName(name.trim());
    toast.add({ title: profileText.saved });
  };

  return (
    <>
      <MainBar trail={[{ label: shellText.settings }]} title={profileText.title} />

      <Page>
        <PageHead title={profileText.title} hint={profileText.intro} />

        <div className="flex max-w-md flex-col gap-7">
          <form onSubmit={submit} noValidate>
            <Field data-invalid={problem !== null || undefined}>
              <FieldLabel htmlFor="account-name">{profileText.nameLabel}</FieldLabel>
              <div className="flex gap-2">
                <Input
                  id="account-name"
                  autoComplete="name"
                  maxLength={PROFILE_NAME_MAX_LENGTH}
                  value={name}
                  aria-invalid={problem !== null || undefined}
                  onChange={(event) => {
                    setName(event.target.value);
                    setProblem(null);
                  }}
                />
                <Button type="submit" disabled={busy || unchanged} className="shrink-0">
                  {busy && <Spinner data-icon="inline-start" />}
                  {profileText.save}
                </Button>
              </div>
              {problem !== null ? (
                <FieldError>{problem}</FieldError>
              ) : (
                <FieldDescription>{profileText.nameHint}</FieldDescription>
              )}
            </Field>
          </form>

          <Field>
            <FieldLabel htmlFor="account-email">{profileText.emailLabel}</FieldLabel>
            <Input id="account-email" value={user.email} readOnly disabled />
            <FieldDescription>{profileText.emailHint}</FieldDescription>
          </Field>
        </div>
      </Page>
    </>
  );
}
