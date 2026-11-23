import { createFileRoute } from '@tanstack/react-router';
import { SpaceSettingsPage } from '@/features/space/SpaceSettingsPage';

// What the space is called, and deleting it: for its owner. The space itself is there already: the route every
// page of a space is under has loaded it.
export const Route = createFileRoute('/_app/spaces/$spaceId/settings')({ component: SpaceSettingsPage });
