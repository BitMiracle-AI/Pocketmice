import { KeyChip } from '@/components/KeyMark';
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
        <PersonAvatar id={user.id} name={user.name} size="sm" />
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
            className="flex max-w-full min-w-0 cursor-default items-center gap-2 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        }
      >
        {/* The key is a piece of the agent's violet, and the person it wrote as follows in the plain ink */}
        <KeyChip name={apiKey.name} />
        <span className="truncate text-muted-foreground">{user.name}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{fileText.viaKey(user.name, apiKey.name)}</TooltipContent>
    </Tooltip>
  );
}
