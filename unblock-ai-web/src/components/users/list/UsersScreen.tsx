"use client";
import { useMemo } from "react";
import { ButtonLink } from "@/components/ui/ButtonLink";
import { Combobox } from "@/components/ui/Combobox";
import { Pagination } from "@/components/ui/Pagination";
import { QueryState } from "@/components/ui/QueryState";
import { SearchInput } from "@/components/ui/SearchInput";
import { NoMatchingResults } from "@/components/organisation/shared/NoMatchingResults";
import { UserTable } from "./UserTable";
import { useOrganisationalUnits } from "@/lib/hooks/useOrganisationData";
import { useQueryParams } from "@/lib/hooks/useQueryParams";
import { useSearchQueryParam } from "@/lib/hooks/useSearchQueryParam";
import { useUsers } from "@/lib/hooks/useUserData";
import { ListQueryParam } from "@/lib/navigation/list-query-param";
import { toGroupedUnitOptions } from "@/lib/organisation/organisational-unit-options";
import { RoutePath } from "@/lib/routing/route-path";
import { USER_MANAGEMENT_COPY } from "@/lib/user-management/user-management-copy";
import { USER_LIST_PAGE_SIZE, parseOffset } from "@/lib/user-management/user-status";
import { IconName } from "@/types/icon";

const COPY = USER_MANAGEMENT_COPY.list;
const RESET_ON_SEARCH: readonly ListQueryParam[] = [ListQueryParam.OFFSET];

export function UsersScreen() {
  const params = useQueryParams<ListQueryParam>();
  const { search, debouncedSearch, setSearch } = useSearchQueryParam(RESET_ON_SEARCH);
  const unitId = params.get(ListQueryParam.UNIT);
  const offset = parseOffset(params.get(ListQueryParam.OFFSET));

  const { data, error, isLoading, mutate } = useUsers({
    search: debouncedSearch.trim() || undefined,
    organisational_unit_id: unitId ?? undefined,
    limit: USER_LIST_PAGE_SIZE,
    offset,
  });
  const { data: unitData } = useOrganisationalUnits();
  const unitOptions = useMemo(() => toGroupedUnitOptions(unitData?.organisational_units ?? []), [unitData]);
  const selectedUnitLabel = unitOptions.find((option) => option.value === unitId)?.label ?? null;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row xl:max-w-3xl xl:flex-1">
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={COPY.searchPlaceholder}
            aria-label={COPY.searchPlaceholder}
            className="sm:min-w-0 sm:flex-1"
          />
          <Combobox
            className="sm:min-w-0 sm:flex-1"
            ariaLabel={COPY.unitFilterLabel}
            placeholder={COPY.unitFilterPlaceholder}
            options={unitOptions}
            loading={!unitData}
            selectedValues={unitId ? [unitId] : []}
            valueLabel={selectedUnitLabel}
            onSelect={(value) => params.set({ [ListQueryParam.UNIT]: value, [ListQueryParam.OFFSET]: null })}
            onClear={() => params.set({ [ListQueryParam.UNIT]: null, [ListQueryParam.OFFSET]: null })}
          />
        </div>
        <ButtonLink href={RoutePath.USERS_NEW} leadingIcon={IconName.PLUS} className="self-start xl:self-auto">
          {COPY.newUser}
        </ButtonLink>
      </div>

      <QueryState
        data={data}
        error={error}
        isLoading={isLoading}
        loadingLabel={COPY.loading}
        errorMessage={COPY.loadFailed}
        onRetry={() => void mutate()}
      >
        {(result) =>
          result.users.length === 0 ? (
            <NoMatchingResults message={COPY.noMatches} />
          ) : (
            <>
              <UserTable users={result.users} />
              <Pagination
                label={COPY.paginationLabel}
                total={result.page.total}
                limit={result.page.limit}
                offset={result.page.offset}
                onOffsetChange={(next) => params.set({ [ListQueryParam.OFFSET]: next === 0 ? null : String(next) })}
              />
            </>
          )
        }
      </QueryState>
    </>
  );
}
