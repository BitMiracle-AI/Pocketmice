import { ALONE_LINK, Alone, AloneFoot, AloneHeading } from '@/components/Alone';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { signOut } from '@/features/auth/signOut';
import { authText } from '@/features/auth/text';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { SpaceNameField } from './SpaceNameField';
import { spaceText } from './text';
import { useNewSpace } from './useNewSpace';

/** The page of someone who is in no space: the server makes none for them, so the first thing they do is make one */
export function FirstSpacePage() {
  const user = useCurrentUser();
  const form = useNewSpace();
  return (
    <Alone>
      <AloneHeading title={spaceText.firstTitle}>{spaceText.firstDescription}</AloneHeading>
      <form onSubmit={form.submit} noValidate className="mt-8 flex flex-col gap-6">
        <SpaceNameField id="first-space-name" name={form.name} problem={form.problem} onChange={form.setName} />
        <Button type="submit" disabled={form.busy} className="w-full">
          {form.busy && <Spinner data-icon="inline-start" />}
          {spaceText.create}
        </Button>
      </form>
      <AloneFoot>
        <span>{authText.signedInAs(user.email)}</span>
        <button type="button" className={ALONE_LINK} onClick={signOut}>
          {authText.signOut}
        </button>
      </AloneFoot>
    </Alone>
  );
}
