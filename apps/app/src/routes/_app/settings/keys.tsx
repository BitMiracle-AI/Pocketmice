import { createFileRoute, type ErrorComponentProps } from '@tanstack/react-router';
import { KeysPage } from '@/features/apiKey/KeysPage';
import { apiKeyText } from '@/features/apiKey/text';
import { PageError } from '@/features/shell/PageError';

export const Route = createFileRoute('/_app/settings/keys')({
  component: KeysPage,
  errorComponent: (props: ErrorComponentProps) => <PageError {...props} title={apiKeyText.title} />
});
