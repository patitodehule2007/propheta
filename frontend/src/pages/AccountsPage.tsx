import type { CSSProperties, FormEvent, JSX } from "react";
import { useCallback, useEffect, useState } from "react";

import { Button, ButtonSize, ButtonVariant, ErrorBanner, SkeletonRows } from "../components/ui";
import { extractErrorMessage } from "../shared/apiError";
import { requestService } from "../shared/requestService";
import type { MonitoredAccount } from "../types/accounts";

const PAGE_SIZE = 20;
const SKELETON_ROWS = 5;
const ACCOUNT_SKELETON_WIDTHS = [40, 60, 70, 80];
const HANDLE_PREFIX_PATTERN = /^@/;

interface AccountsResponse {
    data: { items: MonitoredAccount[]; totalCount: number; limit: number; offset: number };
}

interface AccountsPageData {
    items: MonitoredAccount[];
    totalCount: number;
}

const addedDateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/**
 * Pure fetch, no component state — safe to call from both the load effect
 * and event handlers without tripping the "no setState in effect body"
 * lint rule.
 */
async function fetchAccountsPage(currentOffset: number): Promise<AccountsPageData> {
    const response = await requestService.get<AccountsResponse>("/accounts", {
        params: { limit: PAGE_SIZE, offset: currentOffset }
    });
    return response.data.data;
}

function AccountRow({
    account,
    index,
    onRemove
}: {
    account: MonitoredAccount;
    index: number;
    onRemove: (account: MonitoredAccount) => void;
}): JSX.Element {
    const style = { "--enter-index": index } as CSSProperties;
    return (
        <li className="tape-row ui-enter" style={style}>
            <span className="tape-cell mono">@{account.handle}</span>
            <span className="tape-cell tape-cell-status">
                <span className="status" data-state={account.isActive ? "live" : "not-wired"}>
                    <span className="status-mark" aria-hidden="true" />
                    <span className="status-state">{account.isActive ? "active" : "inactive"}</span>
                </span>
            </span>
            <span className="tape-cell tape-cell-added tape-cell-muted">
                {addedDateFormatter.format(new Date(account.createdAt))}
            </span>
            <span className="tape-cell tape-cell-end">
                <Button
                    variant={ButtonVariant.DANGER}
                    size={ButtonSize.SM}
                    aria-label={`Remove @${account.handle}`}
                    onClick={() => onRemove(account)}
                >
                    Remove
                </Button>
            </span>
        </li>
    );
}

function AddAccountForm({ onAdded }: { onAdded: () => Promise<void> }): JSX.Element {
    const [handle, setHandle] = useState("");
    const [addError, setAddError] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    async function handleAdd(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        const trimmedHandle = handle.trim().replace(HANDLE_PREFIX_PATTERN, "");
        if (trimmedHandle.length === 0) {
            setAddError("Enter a handle");
            return;
        }

        setAddError(null);
        setIsAdding(true);
        try {
            await requestService.post("/accounts", { handle: trimmedHandle });
            setHandle("");
            await onAdded();
        } catch (err) {
            setAddError(extractErrorMessage(err, "Could not add that account"));
        } finally {
            setIsAdding(false);
        }
    }

    return (
        <section className="panel" aria-labelledby="add-account-title">
            <div className="panel-head">
                <h2 id="add-account-title" className="panel-title">
                    Add account
                </h2>
            </div>
            <form className="panel-body inline-form" onSubmit={(event) => void handleAdd(event)} noValidate>
                <div className="form-field">
                    <label className="form-label" htmlFor="handle">
                        X handle
                    </label>
                    <div className="input-shell ui-field" data-invalid={addError !== null || undefined}>
                        <span className="input-prefix" aria-hidden="true">
                            @
                        </span>
                        <input
                            id="handle"
                            className="form-input"
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="realDonaldTrump"
                            value={handle}
                            aria-invalid={addError !== null}
                            aria-describedby={addError !== null ? "handle-error" : undefined}
                            onChange={(event) => setHandle(event.target.value)}
                        />
                    </div>
                </div>
                <Button type="submit" variant={ButtonVariant.PRIMARY} isPending={isAdding} pendingLabel="Adding">
                    Add account
                </Button>
            </form>
            {addError !== null && (
                <p id="handle-error" className="form-error panel-error">
                    {addError}
                </p>
            )}
        </section>
    );
}

/**
 * Manage the set of X accounts monitored for ingestion (see
 * docs/backend/ingestion.md). Adding a handle resolves it against the X API
 * server-side before it is stored.
 */
export function AccountsPage(): JSX.Element {
    const [accounts, setAccounts] = useState<MonitoredAccount[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [offset, setOffset] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function run(): Promise<void> {
            try {
                const page = await fetchAccountsPage(offset);
                if (cancelled) return;
                setAccounts(page.items);
                setTotalCount(page.totalCount);
            } catch (err) {
                if (!cancelled) setLoadError(extractErrorMessage(err, "Could not load monitored accounts"));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        void run();
        return () => {
            cancelled = true;
        };
    }, [offset, reloadKey]);

    const reload = useCallback((nextOffset: number): void => {
        setIsLoading(true);
        setLoadError(null);
        setOffset(nextOffset);
        setReloadKey((key) => key + 1);
    }, []);

    async function handleRemove(account: MonitoredAccount): Promise<void> {
        if (!window.confirm(`Stop monitoring @${account.handle}?`)) {
            return;
        }
        try {
            await requestService.delete(`/accounts/${account.id}`);
            reload(offset);
        } catch (err) {
            setLoadError(extractErrorMessage(err, "Could not remove that account"));
        }
    }

    const canGoPrev = offset > 0;
    const canGoNext = offset + PAGE_SIZE < totalCount;
    const rangeStart = totalCount === 0 ? 0 : offset + 1;
    const rangeEnd = Math.min(offset + PAGE_SIZE, totalCount);
    const hasRows = !isLoading && loadError === null && accounts.length > 0;

    return (
        <>
            <div className="page-head">
                <h1 className="page-title">Monitored accounts</h1>
            </div>

            <AddAccountForm onAdded={async () => reload(0)} />

            <section className="panel" aria-labelledby="accounts-title">
                <div className="panel-head">
                    <h2 id="accounts-title" className="panel-title">
                        Accounts
                    </h2>
                    {!isLoading && loadError === null && <span className="panel-count mono">{totalCount}</span>}
                </div>

                {isLoading && (
                    <SkeletonRows
                        rows={SKELETON_ROWS}
                        tapeClassName="accounts-tape"
                        columnWidths={ACCOUNT_SKELETON_WIDTHS}
                        label="Loading monitored accounts"
                    />
                )}
                {!isLoading && loadError !== null && (
                    <ErrorBanner message={loadError} onRetry={() => reload(offset)} />
                )}
                {!isLoading && loadError === null && accounts.length === 0 && (
                    <p className="empty-state">No accounts yet. Add a handle above to start monitoring.</p>
                )}

                {hasRows && (
                    <>
                        <div className="tape accounts-tape">
                            <div className="tape-head" aria-hidden="true">
                                <span>Handle</span>
                                <span>Status</span>
                                <span>Added</span>
                                <span />
                            </div>
                            <ol className="tape">
                                {accounts.map((account, index) => (
                                    <AccountRow
                                        key={account.id}
                                        account={account}
                                        index={index}
                                        onRemove={(target) => void handleRemove(target)}
                                    />
                                ))}
                            </ol>
                        </div>

                        <div className="pager">
                            <span className="mono">
                                {rangeStart}–{rangeEnd} of {totalCount}
                            </span>
                            <div className="pager-actions">
                                <Button
                                    size={ButtonSize.SM}
                                    disabled={!canGoPrev}
                                    onClick={() => reload(Math.max(0, offset - PAGE_SIZE))}
                                >
                                    Previous
                                </Button>
                                <Button
                                    size={ButtonSize.SM}
                                    disabled={!canGoNext}
                                    onClick={() => reload(offset + PAGE_SIZE)}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </section>
        </>
    );
}
