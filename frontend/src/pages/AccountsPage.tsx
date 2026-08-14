import type { FormEvent, JSX } from "react";
import { useEffect, useState } from "react";

import { extractErrorMessage } from "../shared/apiError";
import { requestService } from "../shared/requestService";
import type { MonitoredAccount } from "../types/accounts";

const PAGE_SIZE = 20;

interface AccountsResponse {
    data: { items: MonitoredAccount[]; totalCount: number; limit: number; offset: number };
}

/**
 * Pure fetch, no component state — safe to call from both the load effect
 * and event handlers without tripping the "no setState in effect body"
 * lint rule.
 */
async function fetchAccountsPage(currentOffset: number): Promise<{ items: MonitoredAccount[]; totalCount: number }> {
    const response = await requestService.get<AccountsResponse>("/accounts", {
        params: { limit: PAGE_SIZE, offset: currentOffset }
    });
    return response.data.data;
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

    const [handle, setHandle] = useState("");
    const [addError, setAddError] = useState<string | null>(null);
    const [isAdding, setIsAdding] = useState(false);

    async function loadAccounts(currentOffset: number): Promise<void> {
        setIsLoading(true);
        setLoadError(null);
        try {
            const page = await fetchAccountsPage(currentOffset);
            setAccounts(page.items);
            setTotalCount(page.totalCount);
        } catch (err) {
            setLoadError(extractErrorMessage(err, "Could not load monitored accounts"));
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        let cancelled = false;

        async function run(): Promise<void> {
            setIsLoading(true);
            setLoadError(null);
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
    }, [offset]);

    async function handleAdd(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        const trimmedHandle = handle.trim().replace(/^@/, "");
        if (trimmedHandle.length === 0) {
            setAddError("Enter a handle");
            return;
        }

        setAddError(null);
        setIsAdding(true);
        try {
            await requestService.post("/accounts", { handle: trimmedHandle });
            setHandle("");
            setOffset(0);
            await loadAccounts(0);
        } catch (err) {
            setAddError(extractErrorMessage(err, "Could not add that account"));
        } finally {
            setIsAdding(false);
        }
    }

    async function handleRemove(account: MonitoredAccount): Promise<void> {
        if (!window.confirm(`Stop monitoring @${account.handle}?`)) {
            return;
        }
        try {
            await requestService.delete(`/accounts/${account.id}`);
            await loadAccounts(offset);
        } catch (err) {
            setLoadError(extractErrorMessage(err, "Could not remove that account"));
        }
    }

    const canGoPrev = offset > 0;
    const canGoNext = offset + PAGE_SIZE < totalCount;

    return (
        <>
            <h1 className="page-title">Monitored accounts</h1>

            <div className="card">
                <h2 className="card-title">Add account</h2>
                <form className="inline-form" onSubmit={(event) => void handleAdd(event)}>
                    <div className="form-field">
                        <label className="form-label" htmlFor="handle">
                            X handle
                        </label>
                        <input
                            id="handle"
                            className="form-input"
                            type="text"
                            placeholder="realDonaldTrump"
                            value={handle}
                            onChange={(event) => setHandle(event.target.value)}
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={isAdding}>
                        {isAdding ? "Adding..." : "Add"}
                    </button>
                </form>
                {addError !== null && <p className="form-error">{addError}</p>}
            </div>

            <div className="card">
                <h2 className="card-title">Accounts ({totalCount})</h2>

                {isLoading && <p className="empty-state">Loading...</p>}
                {!isLoading && loadError !== null && <p className="form-error">{loadError}</p>}
                {!isLoading && loadError === null && accounts.length === 0 && (
                    <p className="empty-state">No accounts yet — add one above.</p>
                )}

                {!isLoading && loadError === null && accounts.length > 0 && (
                    <>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Handle</th>
                                    <th>Status</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {accounts.map((account) => (
                                    <tr key={account.id}>
                                        <td>@{account.handle}</td>
                                        <td>{account.isActive ? "Active" : "Inactive"}</td>
                                        <td>
                                            <button
                                                type="button"
                                                className="btn btn-danger"
                                                onClick={() => void handleRemove(account)}
                                            >
                                                Remove
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="inline-form" style={{ marginTop: "var(--space-3)" }}>
                            <button
                                type="button"
                                className="btn"
                                disabled={!canGoPrev}
                                onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
                            >
                                Previous
                            </button>
                            <button
                                type="button"
                                className="btn"
                                disabled={!canGoNext}
                                onClick={() => setOffset((current) => current + PAGE_SIZE)}
                            >
                                Next
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
