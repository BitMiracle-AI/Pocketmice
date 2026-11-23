import {
  requestSignInCode,
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_CODE_TTL_SECONDS,
  signInEmail
} from '@pocketmice/contract/domains/auth';
import { type FormEvent, useRef, useState } from 'react';
import { CardPage } from '@/components/CardPage';
import { Button } from '@/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Spinner } from '@/components/ui/spinner';
import { toast } from '@/components/ui/toast';
import { auth, call, failureText } from '@/lib/api';
import { Tagline } from './Tagline';
import { authText } from './text';

// Signing in on a server that sends mail: the person gives their address, is sent a code, and enters it. An
// address that has no account gets one, so this is where people sign up too, and nobody is asked for a name.

const SLOTS = Array.from({ length: SIGN_IN_CODE_LENGTH }, (_, index) => index);

/**
 * Asks for a code to be sent to email, which is written the way the server keeps an address. Null when it was
 * sent, or the sentence that says why it was not.
 */
async function sendCode(email: string): Promise<string | null> {
  const result = await call(requestSignInCode, { email });
  if (result.ok) return null;
  return failureText(result.code, {
    TOO_MANY_REQUESTS: authText.failures.TOO_MANY_CODES,
    CODE_NOT_SENT: authText.failures.CODE_NOT_SENT
  });
}

/** next is where the person goes once signed in; left out, the start */
export function CodeSignIn({ next }: { next: string | undefined }) {
  // The address a code was sent to. Null while the person is still giving their address
  const [sentTo, setSentTo] = useState<string | null>(null);
  return sentTo === null ? (
    <EmailStep onSent={setSentTo} />
  ) : (
    <CodeStep email={sentTo} next={next} onOtherEmail={() => setSentTo(null)} />
  );
}

function EmailStep({ onSent }: { onSent: (email: string) => void }) {
  const [email, setEmail] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const address = signInEmail.safeParse(email);
    if (!address.success) return setProblem(authText.emailInvalid);
    setSending(true);
    const refused = await sendCode(address.data);
    setSending(false);
    if (refused === null) onSent(address.data);
    else setProblem(refused);
  };

  return (
    <CardPage title={authText.signInTitle} description={authText.codeIntro} foot={<Tagline />}>
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          <Field data-invalid={problem !== null || undefined}>
            <FieldLabel htmlFor="auth-email">{authText.email}</FieldLabel>
            <Input
              id="auth-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              aria-invalid={problem !== null || undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                setProblem(null);
              }}
            />
            {problem !== null && <FieldError>{problem}</FieldError>}
          </Field>
          <Field>
            <Button type="submit" disabled={sending}>
              {sending && <Spinner data-icon="inline-start" />}
              {authText.sendCode}
            </Button>
          </Field>
        </FieldGroup>
      </form>
    </CardPage>
  );
}

function CodeStep({
  email,
  next,
  onOtherEmail
}: {
  email: string;
  next: string | undefined;
  onOtherEmail: () => void;
}) {
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // What is being waited for: the answer to a code that was entered, or a new code being sent
  const [busy, setBusy] = useState<'checking' | 'sending' | null>(null);
  // The code that was sent no longer works, whatever is entered: it is too old, or was entered wrong too often.
  // Nothing more is tried until a new one is sent
  const [spent, setSpent] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const check = async (entered: string) => {
    setBusy('checking');
    const result = await auth.signInWithCode({ email, code: entered });
    if (result.ok) {
      // A page loaded anew: nothing a page held before the sign-in is carried over
      window.location.assign(next ?? '/');
      return;
    }
    setBusy(null);
    setCode('');
    setSpent(result.code === 'OTP_EXPIRED' || result.code === 'TOO_MANY_ATTEMPTS');
    setProblem(
      failureText(result.code, {
        INVALID_OTP: authText.failures.INVALID_OTP,
        OTP_EXPIRED: authText.failures.OTP_EXPIRED,
        TOO_MANY_ATTEMPTS: authText.failures.TOO_MANY_ATTEMPTS,
        TOO_MANY_REQUESTS: authText.failures.TOO_MANY_TRIES
      })
    );
  };

  const sendAnother = async () => {
    setBusy('sending');
    const refused = await sendCode(email);
    setBusy(null);
    setCode('');
    setProblem(refused);
    if (refused !== null) return;
    setSpent(false);
    toast.add({ title: authText.newCodeSent(email) });
    // The field was switched off while the code was spent, and lost the caret then
    requestAnimationFrame(() => input.current?.focus());
  };

  return (
    <CardPage
      title={authText.codeTitle}
      description={authText.codeSent(email, SIGN_IN_CODE_LENGTH, SIGN_IN_CODE_TTL_SECONDS / 60)}
      foot={<Tagline />}
    >
      <FieldGroup>
        <Field data-invalid={problem !== null || undefined}>
          <div className="flex items-center justify-center gap-3">
            <InputOTP
              ref={input}
              autoFocus
              maxLength={SIGN_IN_CODE_LENGTH}
              value={code}
              disabled={spent}
              aria-label={authText.codeLabel}
              aria-invalid={problem !== null || undefined}
              onChange={(value) => {
                // While a code is being checked, what is typed is not taken: the field keeps the caret, so the
                // person can type again the moment the answer is there
                if (busy !== null) return;
                setCode(value);
                if (value) setProblem(null);
              }}
              onComplete={check}
            >
              <InputOTPGroup>
                {SLOTS.map((index) => (
                  <InputOTPSlot key={index} index={index} aria-invalid={problem !== null || undefined} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {busy === 'checking' && <Spinner />}
          </div>
          {problem !== null && <FieldError className="text-center">{problem}</FieldError>}
        </Field>
        <Field orientation="horizontal" className="justify-center">
          <Button variant="link" size="sm" disabled={busy !== null} onClick={sendAnother}>
            {authText.newCode}
          </Button>
          <Button variant="link" size="sm" disabled={busy !== null} onClick={onOtherEmail}>
            {authText.otherEmail}
          </Button>
        </Field>
      </FieldGroup>
    </CardPage>
  );
}
