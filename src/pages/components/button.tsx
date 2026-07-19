import type { Child, FC } from 'hono/jsx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'copy';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
    primary:
        'ui-btn ui-btn-primary inline-flex items-center justify-center cursor-pointer border-0 rounded-md bg-text text-bg px-[15px] py-2.5 min-h-11 font-display text-sm font-medium tracking-[-0.14px] no-underline',
    secondary:
        'ui-btn ui-btn-secondary inline-flex items-center justify-center cursor-pointer border-0 rounded-md bg-panel text-text px-[15px] py-2.5 min-h-11 font-display text-sm font-medium tracking-[-0.14px] no-underline',
    ghost: 'ui-btn ui-btn-ghost inline-flex items-center justify-center cursor-pointer border-0 rounded-md bg-transparent text-muted px-[15px] py-2.5 min-h-11 font-display text-sm font-medium tracking-[-0.14px] no-underline',
    copy: 'ui-btn ui-btn-secondary copy absolute top-2 right-2 inline-flex cursor-pointer items-center justify-center border-0 rounded-md bg-panel text-text px-3 py-1.5 min-h-0 font-display text-xs font-medium tracking-[-0.12px] no-underline',
};

type ButtonProps = {
    variant: ButtonVariant;
    children?: Child;
    class?: string;
    href?: string;
    download?: string;
    type?: 'button' | 'submit' | 'reset';
    disabled?: boolean;
    hidden?: boolean;
    'aria-label'?: string;
    'data-target'?: string;
    'data-proto-nav'?: string;
    'data-share'?: string;
};

function cx(...parts: Array<string | undefined>): string {
    return parts.filter(Boolean).join(' ');
}

export const Button: FC<ButtonProps> = (props) => {
    const className = cx(VARIANT_CLASS[props.variant], props.class);
    const ariaLabel = props['aria-label'];
    const dataShare = props['data-share'];

    if (props.href !== undefined) {
        return (
            <a
                class={className}
                href={props.href}
                download={props.download}
                aria-label={ariaLabel}
                data-share={dataShare}
            >
                {props.children}
            </a>
        );
    }

    const dataTarget = props['data-target'];
    const dataProtoNav = props['data-proto-nav'];

    // Literal `type` values — oxlint react/button-has-type rejects expressions.
    if (props.type === 'submit') {
        return (
            <button
                class={className}
                type="submit"
                disabled={props.disabled}
                hidden={props.hidden}
                aria-label={ariaLabel}
                data-target={dataTarget}
                data-proto-nav={dataProtoNav}
                data-share={dataShare}
            >
                {props.children}
            </button>
        );
    }

    if (props.type === 'reset') {
        return (
            <button
                class={className}
                type="reset"
                disabled={props.disabled}
                hidden={props.hidden}
                aria-label={ariaLabel}
                data-target={dataTarget}
                data-proto-nav={dataProtoNav}
                data-share={dataShare}
            >
                {props.children}
            </button>
        );
    }

    return (
        <button
            class={className}
            type="button"
            disabled={props.disabled}
            hidden={props.hidden}
            aria-label={ariaLabel}
            data-target={dataTarget}
            data-proto-nav={dataProtoNav}
            data-share={dataShare}
        >
            {props.children}
        </button>
    );
};
