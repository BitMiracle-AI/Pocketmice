import { createFileRoute, type ErrorComponentProps } from '@tanstack/react-router';
import { apiKeysQuery } from '@/features/apiKey/apiKeys';
import { ConnectPage } from '@/features/connect/ConnectPage';
import { connectText } from '@/features/connect/text';
import { PageError } from '@/features/shell/PageError';
import { queryClient } from '@/lib/api';

// How to connect an agent. What it hands over is one of the person's keys, so their keys are read before it shows.
export const Route = createFileRoute('/_app/settings/connect')({
  loader: () => queryClient.ensureQueryData(apiKeysQuery),
  component: ConnectPage,
  errorComponent: (props: ErrorComponentProps) => <PageError {...props} title={connectText.title} />
});
