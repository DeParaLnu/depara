import { useState } from 'react';
import { errorCode } from '../../lib/errors';
import { useClassrooms, useDebounce } from '../../features/rooms/hooks';
import { RoomsView, type RoomsState } from '../../features/rooms/RoomsView';

// F5: екран «Аудиторії» з пошуком і фільтром за корпусом (specs/f5-search.md)
export default function RoomsRoute() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<string | undefined>(undefined);

  const debouncedQuery = useDebounce(searchQuery, 150);
  const classroomsQuery = useClassrooms(debouncedQuery, selectedBuilding);

  let state: RoomsState;
  if (classroomsQuery.data) {
    state = { kind: 'ready', rooms: classroomsQuery.data };
  } else if (classroomsQuery.isError) {
    state = { kind: 'error', code: errorCode(classroomsQuery.error) };
  } else {
    state = { kind: 'loading' };
  }

  return (
    <RoomsView
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      selectedBuilding={selectedBuilding}
      onSelectBuilding={setSelectedBuilding}
      state={state}
      onRetry={() => void classroomsQuery.refetch()}
    />
  );
}
