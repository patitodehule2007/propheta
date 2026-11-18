import type { ButtonHTMLAttributes, JSX, ReactNode } from "react";

export const ButtonVariant = {
    DEFAULT: "default",
    PRIMARY: "primary",
    GHOST: "ghost",
    DANGER: "danger"
} as const;
export type ButtonVariant = (typeof ButtonVariant)[keyof typeof ButtonVariant];

export const ButtonSize = {
    SM: "sm",
    MD: "md",
    LG: "lg"
} as const;
export type ButtonSize = (typeof ButtonSize)[keyof typeof ButtonSize];

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    /** Shows an in-place spinner, keeps the width, and blocks repeat presses. */
    isPending?: boolean;
    /** Accessible text announced while pending. */
    pendingLabel?: string;
    children: ReactNode;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
    default: "",
    primary: "btn-primary",
    ghost: "btn-ghost",
    danger: "btn-danger"
};

const SIZE_CLASS: Record<ButtonSize, string> = {
    sm: "btn-sm",
    md: "",
    lg: "btn-lg"
};

/**
 * Shared button with press feedback and an optional pending state.
 *
 * @param props - Native button props plus variant, size, and pending state.
 * @returns The rendered button.
 */
export function Button({
    variant = ButtonVariant.DEFAULT,
    size = ButtonSize.MD,
    isPending = false,
    pendingLabel,
    className,
    disabled,
    children,
    type = "button",
    ...rest
}: ButtonProps): JSX.Element {
    const classes = ["btn", "ui-press", VARIANT_CLASS[variant], SIZE_CLASS[size], className ?? ""]
        .filter((name) => name.length > 0)
        .join(" ");

    return (
        <button
            {...rest}
            type={type}
            className={classes}
            disabled={disabled === true || isPending}
            aria-busy={isPending || undefined}
        >
            <span className="ui-btn-state" data-state={isPending ? "pending" : undefined}>
                <span className="ui-state-label">{children}</span>
                <span className="ui-state-pending" aria-hidden="true">
                    <span className="ui-spinner" />
                </span>
            </span>
            {isPending && pendingLabel !== undefined && <span className="visually-hidden">{pendingLabel}</span>}
        </button>
    );
}
