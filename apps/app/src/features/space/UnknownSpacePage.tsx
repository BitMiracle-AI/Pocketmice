import { Alone, AloneHeading, AloneWayHome } from '@/components/Alone';
import { spaceText } from './text';

/** What an address shows that names a space the person is not in, or one that does not exist: the two look alike */
export function UnknownSpacePage() {
  return (
    <Alone>
      <AloneHeading title={spaceText.unknownTitle}>{spaceText.unknownDescription}</AloneHeading>
      <AloneWayHome />
    </Alone>
  );
}
