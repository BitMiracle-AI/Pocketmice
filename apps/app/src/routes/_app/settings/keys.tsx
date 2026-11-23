import { createFileRoute, type ErrorComponentProps } from '@tanstack/react-router';
import { apiKeysQuery } from '@/features/apiKey/apiKeys';
import { KeysPage } from '@/features/apiKey/KeysPage';
import { apiKeyText } from '@/features/apiKey/text';
import { PageError } from '@/features/shell/PageError';
import { queryClient } from '@/lib/api';

export const Route = createFileRoute('/_app/settings/keys')({
  loader: () => queryClient.ensureQueryData(apiKeysQuery),
  component: KeysPage,
  errorComponent: (props: ErrorComponentProps) => <PageError {...props} title={apiKeyText.title} />
});
