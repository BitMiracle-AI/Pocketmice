import { PROFILE_NAME_MAX_LENGTH } from '@pocketmice/contract/domains/profile';
import { Page } from '@/components/Page';
import { SavedCard } from '@/components/SavedCard';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { PageBar } from '@/features/shell/PageBar';
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
      <PageBar title={profileText.title} />

      <Page>
        <SavedCard
          id="account-name"
          title={profileText.nameLabel}
          hint={profileText.nameHint}
          value={user.name}
          maxLength={PROFILE_NAME_MAX_LENGTH}
          autoComplete="name"
          save={save}
        />

        <Card>
          <CardHeader>
            <CardTitle id="account-email-title">{profileText.emailLabel}</CardTitle>
            <CardDescription>{profileText.emailHint}</CardDescription>
          </CardHeader>
          <CardContent>
            <Input id="account-email" aria-labelledby="account-email-title" value={user.email} readOnly disabled />
          </CardContent>
        </Card>
      </Page>
    </>
  );
}
