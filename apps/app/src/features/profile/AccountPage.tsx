import { PROFILE_NAME_MAX_LENGTH } from '@pocketmice/contract/domains/profile';
import { Page, PageHead } from '@/components/Page';
import { SavedField } from '@/components/SavedField';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
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

  const save = async (name: string) => {
    const problem = await changeName(name);
    if (problem === null) toast.add({ title: profileText.saved });
    return problem;
  };

  return (
    <>
      <MainBar trail={[{ label: shellText.settings }]} title={profileText.title} />

      <Page>
        <PageHead title={profileText.title} hint={profileText.intro} />

        <div className="flex max-w-md flex-col gap-7">
          <SavedField
            id="account-name"
            label={profileText.nameLabel}
            hint={profileText.nameHint}
            value={user.name}
            maxLength={PROFILE_NAME_MAX_LENGTH}
            autoComplete="name"
            save={save}
          />

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
