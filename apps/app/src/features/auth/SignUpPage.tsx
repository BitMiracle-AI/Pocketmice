import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  signInEmail,
  signInPassword
} from '@pocketmice/contract/domains/auth';
import { PROFILE_NAME_MAX_LENGTH, profileName } from '@pocketmice/contract/domains/profile';
import { getRouteApi, Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { CardPage } from '@/components/CardPage';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { auth, failureText } from '@/lib/api';
import { pitch } from './pitch';
import { authText } from './text';

const route = getRouteApi('/signup');

type FieldName = 'name' | 'email' | 'password';

/**
 * Signing up on a server that sends no mail: a name, an address and a password. Whoever signs up is signed in.
 * A server that signs people in with a code has no such page: its sign-in page is where people sign up.
 */
export function SignUpPage() {
  const { next } = route.useSearch();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // What is wrong, and which field says so. An address that is taken is said under the address
  const [problem, setProblem] = useState<{ field: FieldName; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const called = profileName.safeParse(name);
    if (!called.success) return setProblem({ field: 'name', text: authText.nameMissing });
    const address = signInEmail.safeParse(email);
    if (!address.success) return setProblem({ field: 'email', text: authText.emailInvalid });
    if (!signInPassword.safeParse(password).success) {
      return setProblem({ field: 'password', text: authText.passwordShort(PASSWORD_MIN_LENGTH) });
    }

    setBusy(true);
    const result = await auth.signUp({ name: called.data, email: address.data, password });
    if (result.ok) {
      // A page loaded anew: nothing a page held before the sign-in is carried over
      window.location.assign(next ?? '/');
      return;
    }
    setBusy(false);
    setProblem({
      field: 'email',
      text: failureText(result.code, {
        USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: authText.failures.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL,
        TOO_MANY_REQUESTS: authText.failures.TOO_MANY_TRIES
      })
    });
  };

  const wrong = (field: FieldName) => (problem?.field === field ? problem.text : null);

  return (
    <CardPage title={authText.signUpTitle} description={authText.signUpIntro} pitch={pitch}>
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          <Field data-invalid={wrong('name') !== null || undefined}>
            <FieldLabel htmlFor="auth-name">{authText.name}</FieldLabel>
            <Input
              id="auth-name"
              autoComplete="name"
              autoFocus
              maxLength={PROFILE_NAME_MAX_LENGTH}
              value={name}
              aria-invalid={wrong('name') !== null || undefined}
              onChange={(event) => {
                setName(event.target.value);
                setProblem(null);
              }}
            />
            {wrong('name') === null ? (
              <FieldDescription>{authText.nameHint}</FieldDescription>
            ) : (
              <FieldError>{wrong('name')}</FieldError>
            )}
          </Field>
          <Field data-invalid={wrong('email') !== null || undefined}>
            <FieldLabel htmlFor="auth-email">{authText.email}</FieldLabel>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              value={email}
              aria-invalid={wrong('email') !== null || undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                setProblem(null);
              }}
            />
            {wrong('email') !== null && <FieldError>{wrong('email')}</FieldError>}
          </Field>
          <Field data-invalid={wrong('password') !== null || undefined}>
            <FieldLabel htmlFor="auth-password">{authText.password}</FieldLabel>
            <Input
              id="auth-password"
              type="password"
              autoComplete="new-password"
              maxLength={PASSWORD_MAX_LENGTH}
              value={password}
              aria-invalid={wrong('password') !== null || undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                setProblem(null);
              }}
            />
            {wrong('password') === null ? (
              <FieldDescription>{authText.passwordHint(PASSWORD_MIN_LENGTH)}</FieldDescription>
            ) : (
              <FieldError>{wrong('password')}</FieldError>
            )}
          </Field>
          <Field>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {authText.signUp}
            </Button>
            <FieldDescription className="text-center">
              {authText.haveAccount}{' '}
              <Link to="/login" search={{ next }}>
                {authText.toSignIn}
              </Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </CardPage>
  );
}
