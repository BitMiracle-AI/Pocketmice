import { createFileRoute, type ErrorComponentProps } from '@tanstack/react-router';
import { ConnectPage } from '@/features/connect/ConnectPage';
import { connectText } from '@/features/connect/text';
import { PageError } from '@/features/shell/PageError';

// How to connect an agent.
export const Route = createFileRoute('/_app/settings/connect')({
  component: ConnectPage,
  errorComponent: (props: ErrorComponentProps) => <PageError {...props} title={connectText.title} />
});
