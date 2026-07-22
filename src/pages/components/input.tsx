import type { Child, FC } from 'hono/jsx';

export type InputVariant = 'text' | 'select';

const BASE =
    'ui-input w-full min-w-[130px] rounded-md border border-border bg-panel px-3.5 py-2.5 text-[15px] text-text outline-none';

type TextInputProps = {
    variant: 'text';
    id?: string;
    name?: string;
    class?: string;
    placeholder?: string;
    autocomplete?: string;
    required?: boolean;
    value?: string;
    /** HTML input type (default `text`). */
    type?: 'text' | 'datetime-local';
};

type SelectInputProps = {
    variant: 'select';
    id?: string;
    name?: string;
    class?: string;
    required?: boolean;
    /** Inline handler (SSR forms); e.g. auto-submit on change. */
    onchange?: string;
    children?: Child;
};

export type InputProps = TextInputProps | SelectInputProps;

function cx(...parts: Array<string | undefined>): string {
    return parts.filter(Boolean).join(' ');
}

export const Input: FC<InputProps> = (props) => {
    const className = cx(BASE, props.class);

    if (props.variant === 'select') {
        return (
            <select
                class={className}
                id={props.id}
                name={props.name}
                required={props.required}
                onchange={props.onchange}
            >
                {props.children}
            </select>
        );
    }

    if (props.type === 'datetime-local') {
        return (
            <input
                class={className}
                id={props.id}
                name={props.name}
                type="datetime-local"
                required={props.required}
                value={props.value}
            />
        );
    }

    return (
        <input
            class={className}
            id={props.id}
            name={props.name}
            type="text"
            placeholder={props.placeholder}
            autocomplete={props.autocomplete}
            required={props.required}
            value={props.value}
        />
    );
};
