import { useState } from 'react';
import { errorCode } from '../../lib/errors';
import { useBuildings, useClassrooms, useDebounce } from '../../features/rooms/hooks';
import { RoomsView, type RoomsState } from '../../features/rooms/RoomsView';

// F5: екран «Аудиторії» з пошуком і фільтром за корпусом (specs/f5-search.md)
export default function RoomsRoute() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<string | undefined>(undefined);

  const debouncedQuery = useDebounce(searchQuery, 150);
  const buildingsQuery = useBuildings();
  const classroomsQuery = useClassrooms(debouncedQuery, selectedBuilding);

  let state: RoomsState;
  if (classroomsQuery.isError) {
    state = { kind: 'error', code: errorCode(classroomsQuery.error) };
  } else if (classroomsQuery.data) {
    state = { kind: 'ready', rooms: classroomsQuery.data };
  } else {
    state = { kind: 'loading' };
  }

  return (
    <RoomsView
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      selectedBuilding={selectedBuilding}
      onSelectBuilding={setSelectedBuilding}
      buildings={buildingsQuery.data ?? []}
      buildingsFailed={buildingsQuery.isError && !buildingsQuery.data}
      onRetryBuildings={() => void buildingsQuery.refetch()}
      state={state}
      onRetry={() => void classroomsQuery.refetch()}
    />
  );
}
