import { signInEmail } from '@pocketmice/contract/domains/auth';
import { Link } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { CardPage } from '@/components/CardPage';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { auth, failureText } from '@/lib/api';
import { pitch } from './pitch';
import { authText } from './text';

/**
 * Signing in on a server that sends no mail: an address and a password. next is where the person goes once signed
 * in, and it is passed on to the page for signing up; left out, the start.
 */
export function PasswordSignIn({ next }: { next: string | undefined }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // What is wrong, and which field says so. A refusal of the server is said under the password: a wrong address
  // and a wrong password are answered alike
  const [problem, setProblem] = useState<{ field: 'email' | 'password'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const address = signInEmail.safeParse(email);
    if (!address.success) return setProblem({ field: 'email', text: authText.emailInvalid });
    if (password === '') return setProblem({ field: 'password', text: authText.passwordMissing });

    setBusy(true);
    const result = await auth.signIn({ email: address.data, password });
    if (result.ok) {
      // A page loaded anew: nothing a page held before the sign-in is carried over
      window.location.assign(next ?? '/');
      return;
    }
    setBusy(false);
    setProblem({
      field: 'password',
      text: failureText(result.code, {
        INVALID_EMAIL_OR_PASSWORD: authText.failures.INVALID_EMAIL_OR_PASSWORD,
        TOO_MANY_REQUESTS: authText.failures.TOO_MANY_TRIES
      })
    });
  };

  const wrong = (field: 'email' | 'password') => (problem?.field === field ? problem.text : null);

  return (
    <CardPage title={authText.signInTitle} description={authText.passwordIntro} pitch={pitch}>
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          <Field data-invalid={wrong('email') !== null || undefined}>
            <FieldLabel htmlFor="auth-email">{authText.email}</FieldLabel>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              autoFocus
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
              autoComplete="current-password"
              value={password}
              aria-invalid={wrong('password') !== null || undefined}
              onChange={(event) => {
                setPassword(event.target.value);
                setProblem(null);
              }}
            />
            {wrong('password') !== null && <FieldError>{wrong('password')}</FieldError>}
          </Field>
          <Field>
            <Button type="submit" disabled={busy}>
              {busy && <Spinner data-icon="inline-start" />}
              {authText.signIn}
            </Button>
            <FieldDescription className="text-center">
              {authText.newHere}{' '}
              <Link to="/signup" search={{ next }}>
                {authText.toSignUp}
              </Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </CardPage>
  );
}
