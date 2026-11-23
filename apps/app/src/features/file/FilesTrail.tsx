import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { useCurrentSpace } from '@/features/space/CurrentSpaceProvider';
import { commonText } from '@/lib/text';
import type { OpenFolder } from './FileColumns';
import { FilesLink } from './FilesLink';
import type { DriveFile } from './files';

/** How many steps a way may have before the ones in its middle are folded into a menu */
const STEPS_SHOWN = 4;

/**
 * Where the page of the files is, in its bar: the space, the folders that are open, and the file that is picked.
 * A long way shows its first step and its last two, and the steps between are in the menu of the three dots. On a
 * narrow window only the last step is shown. A folder whose address is not known yet is a plain name until it is.
 */
export function FilesTrail({ open, picked }: { open: OpenFolder[]; picked: DriveFile | null }) {
  const space = useCurrentSpace();
  const steps: OpenFolder[] =
    picked?.kind === 'file' ? [...open, { key: picked.path, id: picked.id, name: picked.name }] : open;
  const folded = steps.length > STEPS_SHOWN ? steps.slice(1, -2) : [];
  const shown = steps.filter((step) => !folded.includes(step));

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {shown.map((step, index) => {
          const last = index === shown.length - 1;
          return (
            <Fragment key={step.key}>
              <BreadcrumbItem className={last ? 'min-w-0' : 'hidden min-w-0 md:inline-flex'}>
                {last ? (
                  <BreadcrumbPage className="truncate">{step.name}</BreadcrumbPage>
                ) : step.id === undefined ? (
                  <span className="truncate">{step.name}</span>
                ) : (
                  <BreadcrumbLink render={<FilesLink spaceId={space.id} fileId={step.id} />} className="truncate">
                    {step.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator className="hidden md:block" />}
              {index === 0 && folded.length > 0 && (
                <>
                  <BreadcrumbItem className="hidden md:inline-flex">
                    <DropdownMenu>
                      <DropdownMenuTrigger aria-label={commonText.ui.more}>
                        <BreadcrumbEllipsis />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {folded.map((each) => (
                          <DropdownMenuItem
                            key={each.key}
                            disabled={each.id === undefined}
                            render={<FilesLink spaceId={space.id} fileId={each.id ?? null} />}
                          >
                            {each.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                </>
              )}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
