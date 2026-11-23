import { id } from '@pocketmice/contract/id';
import { createFileRoute, Outlet } from '@tanstack/react-router';
import { SettingsShell } from '@/features/shell/SettingsShell';

// Every page of the settings is under this route. Its address may say which space the person came from
// (?space=<id>), for the way back; what is no id is dropped.
export const Route = createFileRoute('/_app/settings')({
  validateSearch: (search: Record<string, unknown>): { space?: string } => ({
    space: id.safeParse(search.space).success ? (search.space as string) : undefined
  }),
  component: SettingsPages
});

function SettingsPages() {
  const { space } = Route.useSearch();
  return (
    <SettingsShell backTo={space}>
      <Outlet />
    </SettingsShell>
  );
}
