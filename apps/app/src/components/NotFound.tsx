import { Alone, AloneHeading, AloneWayHome } from '@/components/Alone';
import { commonText } from '@/lib/text';

/** What an address with no page at it shows */
export function NotFound() {
  return (
    <Alone>
      <AloneHeading title={commonText.notFoundTitle}>{commonText.notFoundDescription}</AloneHeading>
      <AloneWayHome />
    </Alone>
  );
}
