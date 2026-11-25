import { createFileRoute, type ErrorComponentProps } from '@tanstack/react-router';
import { PageError } from '@/features/shell/PageError';
import { SpaceSettingsPage } from '@/features/space/SpaceSettingsPage';
import { spaceText } from '@/features/space/text';

// What the space is called, how much it may hold, and deleting it: for its owner. The space itself is there
// already: the route every page of a space is under has loaded it.
export const Route = createFileRoute('/_app/spaces/$spaceId/settings')({
  component: SpaceSettingsPage,
  errorComponent: (props: ErrorComponentProps) => <PageError {...props} title={spaceText.settingsTitle} />
});
