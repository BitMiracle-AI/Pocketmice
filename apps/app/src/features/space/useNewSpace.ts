import { useNavigate } from '@tanstack/react-router';
import { type FormEvent, useState } from 'react';
import { makeSpace } from './spaces';

/**
 * What a form that makes a space holds: the name being typed, what is wrong with it, and whether the api is being
 * asked. submit makes the space and goes to it; made is called first, for a dialog to close itself.
 */
export function useNewSpace(made?: () => void) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const result = await makeSpace(name);
    setBusy(false);
    if ('problem' in result) return setProblem(result.problem);
    setName('');
    made?.();
    await navigate({ to: '/spaces/$spaceId', params: { spaceId: result.space.id } });
  };

  return {
    name,
    problem,
    busy,
    submit,
    setName(next: string) {
      setName(next);
      setProblem(null);
    },
    /** Empties the form, for a dialog that was closed without making anything */
    reset() {
      setName('');
      setProblem(null);
    }
  };
}
