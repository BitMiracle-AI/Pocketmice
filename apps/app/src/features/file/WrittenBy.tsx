import { KeyMark } from '@/components/KeyMark';
import { PersonAvatar } from '@/components/PersonAvatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { DriveFile } from './files';
import { fileText } from './text';

/**
 * Who wrote a version of a file: a person, or an agent. An agent is named by the API key it wrote through, and the
 * person it wrote as follows: that is the one thing in these lists a plain drive does not have.
 */
export function WrittenBy({ version }: { version: NonNullable<DriveFile['version']> }) {
  const { user, apiKey } = version;

  if (!apiKey) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <PersonAvatar name={user.name} size="sm" />
        <span className="truncate">{user.name}</span>
      </span>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="relative z-10 flex min-w-0 cursor-default items-center gap-2 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        }
      >
        <KeyMark size="sm" />
        <span className="truncate">
          <span className="text-foreground">{apiKey.name}</span>
          <span aria-hidden="true" className="px-1.5 text-muted-foreground/50">
            ·
          </span>
          {user.name}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{fileText.viaKey(user.name, apiKey.name)}</TooltipContent>
    </Tooltip>
  );
}
