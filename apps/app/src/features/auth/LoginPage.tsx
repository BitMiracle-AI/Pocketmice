import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { CodeSignIn } from './CodeSignIn';
import { PasswordSignIn } from './PasswordSignIn';
import { serverInfoQuery } from './serverInfo';

const route = getRouteApi('/login');

/** The sign-in page: the form of the one way this server signs people in */
export function LoginPage() {
  const { next } = route.useSearch();
  const { data } = useSuspenseQuery(serverInfoQuery);
  return data.signInMethod === 'emailCode' ? <CodeSignIn next={next} /> : <PasswordSignIn next={next} />;
}
