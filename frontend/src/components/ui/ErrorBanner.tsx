import type { JSX } from "react";

import { Button, ButtonSize } from "./Button";

export interface ErrorBannerProps {
    message: string;
    onRetry?: () => void;
}

/**
 * Inline error with an optional retry action.
 *
 * @param props - Client-safe message and optional retry handler.
 * @returns The rendered banner.
 */
export function ErrorBanner({ message, onRetry }: ErrorBannerProps): JSX.Element {
    return (
        <div className="banner" role="alert">
            <span className="banner-glyph" aria-hidden="true">
                !
            </span>
            <span className="banner-text">{message}</span>
            {onRetry !== undefined && (
                <Button size={ButtonSize.SM} onClick={onRetry}>
                    Retry
                </Button>
            )}
        </div>
    );
}
